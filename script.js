let data = [];
let selected = [];
let lastBlob = null;
let lastCollageUrl = "";

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
    if (selected.length >= 9) {
      alert("Maximum 9 items allowed");
      return;
    }
    selected.push(id);
  }
  render();
}

/* COLLAGE PREVIEW */
function renderSelected() {
  let area = document.getElementById("selectedArea");

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
    let collageBlob;

    try {
      collageBlob = await buildCollageBlobOnServer(selected);
    } catch (serverErr) {
      console.warn("Server collage failed, using browser fallback", serverErr);
      const selectedItems = data.filter(d => selected.includes(d["Serial No"]));
      collageBlob = await buildCollageBlob(selectedItems);
    }

    lastBlob = collageBlob;

    if (lastCollageUrl) {
      URL.revokeObjectURL(lastCollageUrl);
    }

    lastCollageUrl = URL.createObjectURL(collageBlob);
    const preview = document.getElementById("collagePreview");
    preview.src = lastCollageUrl;
    preview.style.display = "block";

  } catch (err) {
    console.error(err);
    alert("Error generating collage. Please try different images.");
  } finally {
    showSpinner(false);
  }
}

/* DOWNLOAD */
function downloadCollage() {
  if (!lastBlob) {
    alert("Generate collage first");
    return;
  }

  triggerBlobDownload(lastBlob, "collage.png");
}

/* ✅ SHARE (FIXED - NO BLOBS SENT AS TEXT) */
async function shareCollage() {
  if (!lastBlob) {
    alert("Generate collage first");
    return;
  }

  const file = new File([lastBlob], "collage.png", { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
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
    triggerBlobDownload(lastBlob, "collage.png");
    const whatsappText = encodeURIComponent("Collage downloaded as collage.png. Please attach that file here.");
    window.open(`https://web.whatsapp.com/send?text=${whatsappText}`, "_blank");
    alert("This browser cannot directly share files to WhatsApp. The collage has been downloaded as collage.png. Attach it in WhatsApp.");
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

  return base64ToBlob(payload.base64, payload.mimeType || "image/png");
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
  const cellSize = 420;
  const labelHeight = 56;
  const gap = 12;
  const padding = 20;

  const canvas = document.createElement("canvas");
  canvas.width = padding * 2 + columns * cellSize + (columns - 1) * gap;
  canvas.height = padding * 2 + rows * (cellSize + labelHeight) + (rows - 1) * gap;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(
    items.map(async item => {
      try {
        return {
          id: item["Serial No"],
          image: await loadImageWithFallback(item)
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
