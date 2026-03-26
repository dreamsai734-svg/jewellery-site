let data = [];
let selected = [];
let lastBlob = null;
let lastCollageUrl = "";
let collageBlobs = [];
let lastExportItems = [];
let lastExportTitle = "Jewellery Tray";

const API_URL = "https://script.google.com/macros/s/AKfycbxR-98U3MLMyvwhaFBF8XavgLMo9L6tnhUkH55fo4JDvgnckxCYBl9s8xIBBfUUO_U/exec";

/* FETCH DATA */
loadData();

async function loadData() {
  const hideMarkedNode = document.getElementById("hideMarked");
  if (hideMarkedNode) {
    hideMarkedNode.checked = true;
  }

  const res = await fetch(API_URL);
  const json = await res.json();
  data = Array.isArray(json) ? json : (json.data || []);
  selected = selected.filter(id => {
    const item = data.find(d => d["Serial No"] === id);
    return item && normalizeStatus(item["Status"]) !== "marked";
  });
  initFilter();
  render();
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value.includes("marked")) {
    return "marked";
  }
  return "unmarked";
}

function switchTab(tabName) {
  const browseTab = document.getElementById("browseTab");
  const finalTrayTab = document.getElementById("finalTrayTab");
  const browseBtn = document.getElementById("tabBrowseBtn");
  const finalTrayBtn = document.getElementById("tabFinalTrayBtn");

  const isBrowse = tabName === "browse";
  browseTab.classList.toggle("active", isBrowse);
  finalTrayTab.classList.toggle("active", !isBrowse);
  browseBtn.classList.toggle("active", isBrowse);
  finalTrayBtn.classList.toggle("active", !isBrowse);
}

/* FILTER */
function initFilter() {
  let types = [...new Set(data.map(d => d["Type"]).filter(Boolean))];
  types.sort((a, b) => String(a).localeCompare(String(b)));
  let filter = document.getElementById("filterType");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join("");
}

/* RENDER GRID */
function render() {
  let filterType = document.getElementById("filterType").value;
  let filterStatus = document.getElementById("filterStatus").value;
  let hideMarked = document.getElementById("hideMarked").checked;

  let filtered = data.filter(d => {
    const status = normalizeStatus(d["Status"]);
    const typeMatch = !filterType || d["Type"] === filterType;

    if (!typeMatch) {
      return false;
    }

    if (hideMarked && status === "marked") {
      return false;
    }

    if (filterStatus === "marked" && status !== "marked") {
      return false;
    }

    if (filterStatus === "unmarked" && status === "marked") {
      return false;
    }

    return true;
  });

  let html = "";

  filtered.forEach(item => {
    const status = normalizeStatus(item["Status"]);
    let isSelected = selected.includes(item["Serial No"]);

    html += `
      <div class="card ${isSelected ? 'selected' : ''} ${status === "marked" ? "marked-card" : ""}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${item["DisplayURL"]}">
        <p>${item["Serial No"]}</p>
        ${status === "marked" ? '<p class="marked-label">Marked</p>' : ''}
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  renderSelected();
}

/* TOGGLE */
function toggle(id) {
  const item = data.find(d => d["Serial No"] === id);
  if (item && normalizeStatus(item["Status"]) === "marked") {
    alert("This item is already marked and is not selectable.");
    return;
  }

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
    const exportItems = [];

    for (const chunkIds of selectedChunks) {
      let collageBlob;
      const selectedItems = data.filter(d => chunkIds.includes(d["Serial No"]));
      exportItems.push(...selectedItems);

      try {
        collageBlob = await buildCollageBlobOnServer(chunkIds);
      } catch (serverErr) {
        console.warn("Server collage failed for chunk, using browser fallback", serverErr);
        collageBlob = await buildCollageBlob(selectedItems);
      }

      collageBlob = await trimOuterWhitespaceOnly(collageBlob);
      generatedBlobs.push(collageBlob);
    }

    if (generatedBlobs.length === 0) {
      throw new Error("Unable to generate collage");
    }

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
  lastExportItems = exportItems;
  lastExportTitle = "Jewellery Selection";

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

async function generateFinalTrayFromSerials() {
  const serialInput = document.getElementById("serialInput").value || "";
  const serials = parseSerialInput(serialInput);

  if (!serials.length) {
    setSerialFeedback("Please enter at least one serial code.", true);
    return;
  }

  showSpinner(true);
  setSerialFeedback("Generating final tray and updating marked status...", false);

  try {
    const serialChunks = chunkArray(serials, 9);
    const generatedBlobs = [];
    const allMissing = new Set();
    let updatedCount = 0;
    const exportItems = resolveItemsBySerials(serials);

    for (const serialChunk of serialChunks) {
      const result = await buildFinalTrayAndMarkOnServer(serialChunk);

      if (!result.ok || !result.base64) {
        throw new Error(result.error || "Unable to generate final tray");
      }

      generatedBlobs.push(base64ToBlob(result.base64, result.mimeType || "image/png"));
      updatedCount += Number(result.updatedCount || 0);
      (result.missingSerials || []).forEach(s => allMissing.add(String(s)));
    }

    if (!generatedBlobs.length) {
      throw new Error("Unable to generate final tray");
    }

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
  lastExportItems = exportItems;
  lastExportTitle = "Final Tray";

    if (lastCollageUrl) {
      URL.revokeObjectURL(lastCollageUrl);
    }

    lastCollageUrl = URL.createObjectURL(lastBlob);
    const preview = document.getElementById("collagePreview");
    preview.src = lastCollageUrl;
    preview.style.display = "block";
    document.getElementById("selectedArea").style.display = "none";

    await loadData();

    const missing = [...allMissing];
    const missingText = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
    const collageText = collageBlobs.length > 1
      ? ` ${collageBlobs.length} collage files generated.`
      : "";

    setSerialFeedback(`Done. Marked ${updatedCount} items in Excel.${missingText}${collageText}`, false);
    alert(`Final tray generated for all entered serials. ${updatedCount} items marked in Excel.${collageText}`);
  } catch (err) {
    console.error(err);
    setSerialFeedback(err.message || "Failed to generate final tray", true);
    alert("Error generating final tray. Please check serial codes and try again.");
  } finally {
    showSpinner(false);
  }
}

function parseSerialInput(rawText) {
  const chunks = String(rawText || "")
    .replace(/\r/g, "\n")
    .split(/[\n,;]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const tokens = [];

  chunks.forEach(chunk => {
    const matches = chunk.match(/[A-Za-z]+\s*-\s*[A-Za-z0-9]+/g);

    if (matches && matches.length) {
      matches.forEach(m => {
        const normalized = sanitizeSerialToken(m);
        if (normalized) {
          tokens.push(normalized);
        }
      });
      return;
    }

    const normalized = sanitizeSerialToken(chunk);
    if (normalized) {
      tokens.push(normalized);
    }
  });

  return [...new Set(tokens)];
}

function sanitizeSerialToken(token) {
  return String(token || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function resolveItemsBySerials(serials) {
  const bySerial = new Map();

  data.forEach(item => {
    const key = sanitizeSerialToken(item["Serial No"] || "");
    if (key) {
      bySerial.set(key, item);
    }
  });

  const keys = [...bySerial.keys()];
  const items = [];
  const seen = new Set();

  serials.forEach(serial => {
    const normalized = sanitizeSerialToken(serial);
    if (!normalized) {
      return;
    }

    let match = bySerial.get(normalized);
    if (!match) {
      const suffixMatches = keys.filter(key => key.endsWith(normalized));
      if (suffixMatches.length === 1) {
        match = bySerial.get(suffixMatches[0]);
      }
    }

    if (match) {
      const serialNo = String(match["Serial No"] || "");
      if (!seen.has(serialNo)) {
        seen.add(serialNo);
        items.push(match);
      }
    }
  });

  return items;
}

function setSerialFeedback(message, isError) {
  const node = document.getElementById("serialFeedback");
  node.textContent = message;
  node.style.color = isError ? "#b42318" : "#155724";
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file data"));
    reader.readAsDataURL(blob);
  });
}

async function itemToPdfImageData(item) {
  const image = await loadImageWithFallback(item);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png", 0.95);
}

async function buildPdfBlob() {
  if (!collageBlobs.length) {
    throw new Error("Generate collage first");
  }

  const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
  if (!jsPdfApi) {
    throw new Error("PDF library not loaded");
  }

  const pdf = new jsPdfApi({
    orientation: "portrait",
    unit: "pt",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 26;
  const totalPages = collageBlobs.length + (lastExportItems.length ? 1 : 0);

  function drawPageHeader(pageNumber) {
    pdf.setFillColor(19, 28, 48);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 50, 14, 14, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text(lastExportTitle, margin + 16, margin + 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Mobile-friendly collage PDF with high-contrast serial labels", margin + 16, margin + 38);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 74, margin + 38);
  }

  for (let index = 0; index < collageBlobs.length; index++) {
    if (index > 0) {
      pdf.addPage();
    }

    drawPageHeader(index + 1);

    const frameX = margin;
    const frameY = margin + 64;
    const frameWidth = pageWidth - margin * 2;
    const frameHeight = pageHeight - frameY - margin;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(216, 220, 227);
    pdf.roundedRect(frameX, frameY, frameWidth, frameHeight, 12, 12, "FD");

    const imageDataUrl = await blobToDataUrl(collageBlobs[index]);
    const imageProps = pdf.getImageProperties(imageDataUrl);
    const availableWidth = frameWidth - 20;
    const availableHeight = frameHeight - 20;
    const scale = Math.min(availableWidth / imageProps.width, availableHeight / imageProps.height);
    const renderWidth = imageProps.width * scale;
    const renderHeight = imageProps.height * scale;
    const imageX = frameX + (frameWidth - renderWidth) / 2;
    const imageY = frameY + (frameHeight - renderHeight) / 2;
    pdf.addImage(imageDataUrl, "PNG", imageX, imageY, renderWidth, renderHeight, undefined, "FAST");
  }

  if (lastExportItems.length) {
    pdf.addPage();
    drawPageHeader(totalPages);
    pdf.setTextColor(30, 30, 30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("Serial Codes", margin, margin + 78);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);

    const summaryColumnGap = 24;
    const summaryColumnWidth = (pageWidth - margin * 2 - summaryColumnGap) / 2;

    lastExportItems.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * (summaryColumnWidth + summaryColumnGap);
      const y = margin + 104 + row * 18;
      pdf.text(`${index + 1}. ${String(item["Serial No"] || "")}`, x, y);
    });
  }

  return pdf.output("blob");
}

/* DOWNLOAD */
async function downloadCollage() {
  if (!collageBlobs.length) {
    alert("Generate collage first");
    return;
  }

  try {
    const pdfBlob = await buildPdfBlob();
    triggerBlobDownload(pdfBlob, "jewellery-collage.pdf");
  } catch (err) {
    console.error(err);
    alert("Unable to build PDF. Please try again.");
  }
}

/* ✅ SHARE (FIXED - NO BLOBS SENT AS TEXT) */
async function shareCollage() {
  if (!collageBlobs.length) {
    alert("Generate collage first");
    return;
  }

  let pdfBlob;

  try {
    pdfBlob = await buildPdfBlob();
  } catch (err) {
    console.error(err);
    alert("Unable to build PDF. Please try again.");
    return;
  }

  const files = [new File([pdfBlob], "jewellery-collage.pdf", { type: "application/pdf" })];

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({
        files,
        title: "Jewellery PDF",
        text: "Jewellery final tray PDF"
      });
    } catch (err) {
      console.log(err);
      if (err && err.name !== "AbortError") {
        alert("Sharing failed on this device. Please download the PDF and attach it manually in WhatsApp.");
      }
    }
  } else {
    triggerBlobDownload(pdfBlob, "jewellery-collage.pdf");

    const whatsappText = encodeURIComponent("PDF downloaded. Please attach the jewellery PDF here.");
    window.open(`https://web.whatsapp.com/send?text=${whatsappText}`, "_blank");
    alert("This browser cannot directly share PDF files to WhatsApp. The PDF has been downloaded. Attach it in WhatsApp.");
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
    body: JSON.stringify({ action: "buildCollage", selected: selectedIds })
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

  return blob;
}

async function buildFinalTrayAndMarkOnServer(serials) {
  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "buildAndMarkFinalTray",
      serials: serials
    })
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  return response.json();
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
  const labelHeight = 52;
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
        return {
          id: item["Serial No"],
          image: loadedImage
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
      const innerPadding = 10;
      const drawBoxSize = cellSize - innerPadding * 2;
      const scale = Math.min(drawBoxSize / source.width, drawBoxSize / source.height);
      const drawWidth = source.width * scale;
      const drawHeight = source.height * scale;
      const dx = x + (cellSize - drawWidth) / 2;
      const dy = y + (cellSize - drawHeight) / 2;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.drawImage(source, dx, dy, drawWidth, drawHeight);
      ctx.strokeStyle = "#d6d6d6";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
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

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function trimOuterWhitespaceOnly(blob) {
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

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        const isWhitePixel = (i) => {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          return a < 10 || (r > 245 && g > 245 && b > 245);
        };

        const rowHasContent = (y) => {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (!isWhitePixel(i)) {
              return true;
            }
          }
          return false;
        };

        const colHasContent = (x) => {
          for (let y = 0; y < canvas.height; y++) {
            const i = (y * canvas.width + x) * 4;
            if (!isWhitePixel(i)) {
              return true;
            }
          }
          return false;
        };

        let top = 0;
        while (top < canvas.height && !rowHasContent(top)) top++;

        let bottom = canvas.height - 1;
        while (bottom >= 0 && !rowHasContent(bottom)) bottom--;

        let left = 0;
        while (left < canvas.width && !colHasContent(left)) left++;

        let right = canvas.width - 1;
        while (right >= 0 && !colHasContent(right)) right--;

        URL.revokeObjectURL(url);

        if (left >= right || top >= bottom) {
          resolve(blob);
          return;
        }

        const safePadding = 8;
        left = Math.max(0, left - safePadding);
        top = Math.max(0, top - safePadding);
        right = Math.min(canvas.width - 1, right + safePadding);
        bottom = Math.min(canvas.height - 1, bottom + safePadding);

        const width = right - left + 1;
        const height = bottom - top + 1;

        const out = document.createElement("canvas");
        out.width = width;
        out.height = height;
        const outCtx = out.getContext("2d");
        outCtx.drawImage(canvas, left, top, width, height, 0, 0, width, height);

        out.toBlob((croppedBlob) => {
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
