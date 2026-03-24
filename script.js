let data = [];
let selected = [];
let lastBlob = null;
let lastCollageUrl = "";
let collageBlobs = [];

const API_URL = "https://script.google.com/macros/s/AKfycbws6vTxwsrr2rTeJmgTwIo__4bwPcJQlDGNBhqPNQO_NsJkPGwujAuk-bFPEEWVIw/exec";

/* FETCH DATA */
fetch(API_URL)
.then(res => res.json())
.then(json => {
  data = Array.isArray(json) ? json : (json.data || []);
  initFilter();
  render();
});

/* FILTER */
function initFilter() {
  let types = [...new Set(data.map(d => d["Type"]))];
  let filter = document.getElementById("filter");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join("");
}

/* RENDER GRID */
function render() {
  let filterValue = document.getElementById("filter").value;

  let filtered = data.filter(d => !filterValue || d["Type"] === filterValue);

  let html = "";

  filtered.forEach(item => {
    let isSelected = selected.includes(item["Serial No"]);

    html += `
      <div class="card ${isSelected ? 'selected' : ''}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${item["DisplayURL"]}">
        <p>${item["Serial No"]}</p>
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  renderSelected();
}

/* TOGGLE */
function toggle(id) {
  if (selected.includes(id)) {
    selected = selected.filter(x => x !== id);
  } else {
    selected.push(id);
  }
  render();
}

/* COLLAGE PREVIEW */
function renderSelected() {
  let area = document.getElementById("selectedArea");
  area.style.display = "grid";

  area.innerHTML = data
    .filter(d => selected.includes(d["Serial No"]))
    .map(item => `
      <div class="collage-item">
        <img src="${item["DisplayURL"]}">
        <div class="label">${item["Serial No"]}</div>
      </div>
    `).join("");
}

/* GENERATE COLLAGE */
async function generateCollage() {
  if (selected.length === 0) {
    alert("Select items first");
    return;
  }

  showSpinner(true);

  try {
    const selectedChunks = chunkArray(selected, 9);
    const generatedBlobs = [];

    for (const chunkIds of selectedChunks) {
      let collageBlob;

      try {
        collageBlob = await buildCollageBlobOnServer(chunkIds);
      } catch (serverErr) {
        console.warn("Server collage failed for chunk, using browser fallback", serverErr);
        const selectedItems = data.filter(d => chunkIds.includes(d["Serial No"]));
        collageBlob = await buildCollageBlob(selectedItems);
      }

      collageBlob = await trimWhitespaceBlob(collageBlob);
      generatedBlobs.push(collageBlob);
    }

    if (generatedBlobs.length === 0) {
      throw new Error("Unable to generate collage");
    }

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];

    if (lastCollageUrl) {
      URL.revokeObjectURL(lastCollageUrl);
    }

    lastCollageUrl = URL.createObjectURL(lastBlob);
    const preview = document.getElementById("collagePreview");
    preview.src = lastCollageUrl;
    preview.style.display = "block";
    document.getElementById("selectedArea").style.display = "none";

    if (collageBlobs.length > 1) {
      alert(`${collageBlobs.length} collages generated. Download will save all files.`);
    }

  } catch (err) {
    console.error(err);
    alert("Error generating collage. Please try different images.");
  } finally {
    showSpinner(false);
  }
}

/* DOWNLOAD */
function downloadCollage() {
  if (!collageBlobs.length) {
    alert("Generate collage first");
    return;
  }

  if (collageBlobs.length === 1) {
    triggerBlobDownload(collageBlobs[0], "collage-1.png");
    return;
  }

  collageBlobs.forEach((blob, index) => {
    setTimeout(() => {
      triggerBlobDownload(blob, `collage-${index + 1}.png`);
    }, index * 300);
  });
}

/* ✅ SHARE (FIXED - NO BLOBS SENT AS TEXT) */
async function shareCollage() {
  if (!collageBlobs.length) {
    alert("Generate collage first");
    return;
  }

  const files = collageBlobs.map((blob, index) => new File([blob], `collage-${index + 1}.png`, { type: "image/png" }));

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({
        files,
        title: "Jewellery Collage",
        text: "Jewellery collage"
      });
    } catch (err) {
      console.log(err);
      if (err && err.name !== "AbortError") {
        alert("Sharing failed on this device. Please download and attach manually in WhatsApp.");
      }
    }
  } else {
    collageBlobs.forEach((blob, index) => {
      setTimeout(() => {
        triggerBlobDownload(blob, `collage-${index + 1}.png`);
      }, index * 300);
    });

    const whatsappText = encodeURIComponent("Collages downloaded. Please attach collage files here.");
    window.open(`https://web.whatsapp.com/send?text=${whatsappText}`, "_blank");
    alert("This browser cannot directly share files to WhatsApp. Collage files are downloaded. Attach them in WhatsApp.");
  }
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* SPINNER */
function showSpinner(show) {
  document.getElementById("spinner").classList.toggle("hidden", !show);
}

async function buildCollageBlobOnServer(selectedIds) {
  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ selected: selectedIds })
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.ok || !payload.base64) {
    throw new Error(payload.error || "Invalid server collage response");
  }

  if (payload.debug && payload.debug.insertedImages === 0) {
    throw new Error("Server could not insert any images");
  }

  if (payload.debug && payload.debug.exportedBytes && payload.debug.exportedBytes < 1500) {
    throw new Error("Server returned suspiciously small collage image");
  }

  const blob = base64ToBlob(payload.base64, payload.mimeType || "image/png");
  const isBlank = await isMostlyWhiteBlob(blob);
  if (isBlank) {
    throw new Error("Server returned blank/white collage image");
  }

  return await trimWhitespaceBlob(blob);
}

async function trimWhitespaceBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            const isBackground = a < 10 || (r > 245 && g > 245 && b > 245);
            if (!isBackground) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        URL.revokeObjectURL(url);

        if (maxX < minX || maxY < minY) {
          resolve(blob);
          return;
        }

        const padding = 12;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width - 1, maxX + padding);
        maxY = Math.min(canvas.height - 1, maxY + padding);

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Keep original if crop does not meaningfully reduce extra whitespace.
        if (width > canvas.width * 0.95 && height > canvas.height * 0.95) {
          resolve(blob);
          return;
        }

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = width;
        cropCanvas.height = height;
        const cropCtx = cropCanvas.getContext("2d");
        cropCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

        cropCanvas.toBlob((croppedBlob) => {
          resolve(croppedBlob || blob);
        }, "image/png", 0.95);
      } catch (err) {
        URL.revokeObjectURL(url);
        resolve(blob);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.src = url;
  });
}

async function isMostlyWhiteBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const width = Math.max(1, Math.min(400, img.width));
        const height = Math.max(1, Math.min(400, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);

        const pixels = ctx.getImageData(0, 0, width, height).data;
        let whiteCount = 0;
        const total = width * height;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          if (r > 245 && g > 245 && b > 245) {
            whiteCount++;
          }
        }

        URL.revokeObjectURL(url);
        resolve(whiteCount / total > 0.99);
      } catch (err) {
        URL.revokeObjectURL(url);
        resolve(false);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };

    img.src = url;
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType || "image/png" });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function loadImageWithFallback(item) {
  const urls = [item["CollageURL"]].filter(Boolean);

  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch (err) {
      console.warn("Image load failed, trying next source:", url, err);
    }
  }

  throw new Error(`No CORS-safe image source for ${item["Serial No"]}. CollageURL is missing or invalid.`);
}

async function buildCollageBlob(items) {
  const count = items.length;
  const columns = count <= 3 ? count : 3;
  const rows = Math.ceil(count / 3);
  const cellSize = 320;
  const labelHeight = 44;
  const gap = 8;
  const padding = 8;

  const canvas = document.createElement("canvas");
  canvas.width = padding * 2 + columns * cellSize + (columns - 1) * gap;
  canvas.height = padding * 2 + rows * (cellSize + labelHeight) + (rows - 1) * gap;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(
    items.map(async item => {
      try {
        const loadedImage = await loadImageWithFallback(item);
        const preparedImage = trimWhiteEdgesFromImageSource(loadedImage);
        return {
          id: item["Serial No"],
          image: preparedImage
        };
      } catch (err) {
        console.warn(err);
        return {
          id: item["Serial No"],
          image: null
        };
      }
    })
  );

  images.forEach((entry, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = padding + col * (cellSize + gap);
    const y = padding + row * (cellSize + labelHeight + gap);

    if (entry.image) {
      const source = entry.image;
      const scale = Math.max(cellSize / source.width, cellSize / source.height);
      const drawWidth = source.width * scale;
      const drawHeight = source.height * scale;
      const dx = x + (cellSize - drawWidth) / 2;
      const dy = y + (cellSize - drawHeight) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellSize, cellSize);
      ctx.clip();
      ctx.drawImage(source, dx, dy, drawWidth, drawHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = "#f1f1f1";
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.fillStyle = "#777777";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Image unavailable", x + cellSize / 2, y + cellSize / 2);
    }

    ctx.fillStyle = "#111111";
    ctx.fillRect(x, y + cellSize, cellSize, labelHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entry.id, x + cellSize / 2, y + cellSize + labelHeight / 2);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Unable to build collage blob"));
        return;
      }
      resolve(blob);
    }, "image/png", 0.95);
  });
}

function trimWhiteEdgesFromImageSource(sourceImage) {
  try {
    const width = sourceImage.naturalWidth || sourceImage.width;
    const height = sourceImage.naturalHeight || sourceImage.height;
    if (!width || !height) {
      return sourceImage;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceImage, 0, 0, width, height);

    const pixels = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        // Consider near-white and transparent pixels as background.
        const isBackground = a < 8 || (r > 247 && g > 247 && b > 247);
        if (!isBackground) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return sourceImage;
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    // Keep original if trimming would not significantly reduce whitespace.
    if (cropWidth > width * 0.95 && cropHeight > height * 0.95) {
      return sourceImage;
    }

    const out = document.createElement("canvas");
    out.width = cropWidth;
    out.height = cropHeight;
    const outCtx = out.getContext("2d");
    outCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return out;
  } catch (err) {
    return sourceImage;
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
