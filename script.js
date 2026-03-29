let data = [];
let selected = [];
let lastBlob = null;
let collageBlobs = [];
let lastExportItems = [];
let lastExportTitle = "Jewellery Catalogue";
let lastPdfBlob = null;
let lastPdfUrl = "";

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

function updateDashboardStats(visibleCount) {
  const total = data.length;
  const marked = data.filter(item => normalizeStatus(item["Status"]) === "marked").length;
  const available = Math.max(0, total - marked);

  const totalNode = document.getElementById("statTotal");
  const availableNode = document.getElementById("statAvailable");
  const selectedNode = document.getElementById("statSelected");
  const markedNode = document.getElementById("statMarked");
  const summaryNode = document.getElementById("gridSummary");

  if (totalNode) totalNode.textContent = String(total);
  if (availableNode) availableNode.textContent = String(available);
  if (selectedNode) selectedNode.textContent = String(selected.length);
  if (markedNode) markedNode.textContent = String(marked);
  if (summaryNode) summaryNode.textContent = `${visibleCount} visible item${visibleCount === 1 ? "" : "s"}`;
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
  updateDashboardStats(filtered.length);
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

/* SELECTION PREVIEW */
function renderSelected() {
  let area = document.getElementById("selectedArea");
  const selectedItems = data.filter(d => selected.includes(d["Serial No"]));

  if (!selectedItems.length) {
    area.innerHTML = '<div class="selection-empty">No items selected yet. Choose pieces from the catalogue to prepare a PDF.</div>';
    return;
  }

  area.innerHTML = selectedItems
    .map(item => `
      <div class="selection-card">
        <img src="${item["DisplayURL"]}" alt="${item["Serial No"]}">
        <p>${item["Serial No"]}</p>
      </div>
    `).join("");
}

/* GENERATE SELECTION PDF */
async function generateSelectionPdf() {
  if (selected.length === 0) {
    alert("Select items to prepare the PDF.");
    return;
  }

  if (selected.length > 300) {
    alert("Large export detected. Compact PDF mode will be used to keep generation stable for high item counts.");
  }

  showSpinner(true);

  try {
    const selectedChunks = chunkArray(selected, 6);
    const generatedBlobs = [];
    const exportItems = [];

    for (const chunkIds of selectedChunks) {
      let collageBlob;
      const selectedItems = data.filter(d => chunkIds.includes(d["Serial No"]));
      exportItems.push(...selectedItems);

      try {
        collageBlob = await buildCollageBlobOnServer(chunkIds);
      } catch (serverErr) {
        console.warn("Server page render failed for chunk, using browser fallback", serverErr);
        collageBlob = await buildCollageBlob(selectedItems);
      }

      collageBlob = await trimOuterWhitespaceOnly(collageBlob);
      generatedBlobs.push(collageBlob);
    }

    if (generatedBlobs.length === 0) {
      throw new Error("Unable to prepare the PDF pages");
    }

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
    lastExportItems = exportItems;
    lastExportTitle = "Client Catalogue";
    lastPdfBlob = null;

    await rebuildPdfPreview();

    if (collageBlobs.length > 1) {
      alert(`${collageBlobs.length} PDF pages prepared. Preview updated.`);
    }

  } catch (err) {
    console.error(err);
    alert("Error preparing the PDF. Please try different images.");
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

  if (serials.length > 300) {
    setSerialFeedback("Large export detected. Compact PDF mode will be used for better stability.", false);
  }

  showSpinner(true);
  setSerialFeedback("Preparing final tray PDF and updating marked status...", false);

  try {
    const serialChunks = chunkArray(serials, 6);
    const generatedBlobs = [];
    const allMissing = new Set();
    let updatedCount = 0;
    const exportItems = resolveItemsBySerials(serials);

    for (const serialChunk of serialChunks) {
      const result = await buildFinalTrayAndMarkOnServer(serialChunk);

      if (!result.ok || !result.base64) {
        throw new Error(result.error || "Unable to prepare the final tray PDF");
      }

      generatedBlobs.push(base64ToBlob(result.base64, result.mimeType || "image/png"));
      updatedCount += Number(result.updatedCount || 0);
      (result.missingSerials || []).forEach(s => allMissing.add(String(s)));
    }

    if (!generatedBlobs.length) {
      throw new Error("Unable to prepare the final tray PDF");
    }

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
    lastExportItems = exportItems;
    lastExportTitle = "Final Tray Catalogue";
    lastPdfBlob = null;

    await rebuildPdfPreview();

    await loadData();

    const missing = [...allMissing];
    const missingText = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
    const pageText = collageBlobs.length > 1
      ? ` ${collageBlobs.length} PDF pages prepared.`
      : "";

    setSerialFeedback(`Done. Marked ${updatedCount} items in Excel.${missingText}${pageText}`, false);
    alert(`Final tray PDF prepared for all entered serials. ${updatedCount} items marked in Excel.${pageText}`);
  } catch (err) {
    console.error(err);
    setSerialFeedback(err.message || "Failed to prepare the final tray PDF", true);
    alert("Error preparing the final tray PDF. Please check serial codes and try again.");
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

function updatePdfMeta() {
  const node = document.getElementById("pdfMeta");
  if (!node) {
    return;
  }

  if (!collageBlobs.length) {
    node.textContent = "No PDF generated yet";
    return;
  }

  node.textContent = `${lastExportTitle} · ${collageBlobs.length} page${collageBlobs.length === 1 ? "" : "s"} · ${lastExportItems.length} code${lastExportItems.length === 1 ? "" : "s"}`;
}

function clearPdfPreview() {
  const frame = document.getElementById("pdfPreviewFrame");
  const placeholder = document.getElementById("previewPlaceholder");

  if (lastPdfUrl) {
    URL.revokeObjectURL(lastPdfUrl);
    lastPdfUrl = "";
  }

  lastPdfBlob = null;

  if (frame) {
    frame.removeAttribute("src");
    frame.classList.remove("visible");
  }

  if (placeholder) {
    placeholder.classList.remove("hidden");
  }

  updatePdfMeta();
}

function setPdfPreview(blob) {
  const frame = document.getElementById("pdfPreviewFrame");
  const placeholder = document.getElementById("previewPlaceholder");

  if (lastPdfUrl) {
    URL.revokeObjectURL(lastPdfUrl);
  }

  lastPdfBlob = blob;
  lastPdfUrl = URL.createObjectURL(blob);

  if (frame) {
    frame.src = lastPdfUrl;
    frame.classList.add("visible");
  }

  if (placeholder) {
    placeholder.classList.add("hidden");
  }

  updatePdfMeta();
}

async function rebuildPdfPreview() {
  if (!collageBlobs.length) {
    clearPdfPreview();
    return null;
  }

  if (!window.JewelleryPdf || typeof window.JewelleryPdf.buildPdfBlob !== "function") {
    throw new Error("PDF builder not loaded");
  }

  const pdfBlob = await window.JewelleryPdf.buildPdfBlob({
    pageBlobs: collageBlobs,
    items: lastExportItems,
    title: lastExportTitle
  });

  setPdfPreview(pdfBlob);
  return pdfBlob;
}

async function ensurePdfBlob() {
  if (lastPdfBlob) {
    return lastPdfBlob;
  }

  return rebuildPdfPreview();
}

/* DOWNLOAD */
function buildPdfFileName() {
  const title = String(lastExportTitle || "Jewellery PDF")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${title || "jewellery-pdf"}.pdf`;
}

async function downloadCurrentPdf() {
  if (!collageBlobs.length) {
    alert("Generate a PDF first.");
    return;
  }

  try {
    const pdfBlob = await ensurePdfBlob();
    triggerBlobDownload(pdfBlob, buildPdfFileName());
  } catch (err) {
    console.error(err);
    alert("Unable to build PDF. Please try again.");
  }
}

/* SHARE CURRENT PDF */
async function shareCurrentPdf() {
  if (!collageBlobs.length) {
    alert("Generate a PDF first.");
    return;
  }

  let pdfBlob;

  try {
    pdfBlob = await ensurePdfBlob();
  } catch (err) {
    console.error(err);
    alert("Unable to build PDF. Please try again.");
    return;
  }

  const fileName = buildPdfFileName();
  const files = [new File([pdfBlob], fileName, { type: "application/pdf" })];

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({
        files,
        title: lastExportTitle || "Jewellery PDF",
        text: `${lastExportTitle || "Jewellery PDF"} ready to share.`
      });
    } catch (err) {
      console.log(err);
      if (err && err.name !== "AbortError") {
        alert("Sharing failed on this device. Please download the PDF and attach it manually in WhatsApp.");
      }
    }
  } else {
    triggerBlobDownload(pdfBlob, fileName);

    const whatsappText = encodeURIComponent("PDF downloaded. Please attach the jewellery PDF in this chat.");
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
  /* Always render a fixed 2×3 grid (6 items max per page).
     Maximizes section size: 2 columns × 3 rows on A4 page. */
  const columns = 2;
  const rows = 3;
  const canvasW = 1240;
  const canvasH = 1754;
  const padding = 6;
const gap = 6;
const labelHeight = 40;

  const cellW = Math.floor((canvasW - padding * 2 - (columns - 1) * gap) / columns);
  const cellH = Math.floor((canvasH - padding * 2 - (rows - 1) * gap) / rows) - labelHeight;
  const radius = 10;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f6f1ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(
    items.map(async item => {
      try {
        const loadedImage = await loadImageWithFallback(item);
        return { id: item["Serial No"], image: loadedImage };
      } catch (err) {
        console.warn(err);
        return { id: item["Serial No"], image: null };
      }
    })
  );

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* Render all 6 cells (3×2 grid), leaving empty cells for unused items */
  for (let index = 0; index < 6; index++) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + col * (cellW + gap);
    const y = padding + row * (cellH + labelHeight + gap);
    const entry = images[index];

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.10)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, x, y, cellW, cellH + labelHeight, radius);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, cellW, cellH, radius);
    ctx.clip();

    if (entry && entry.image) {
      const src = entry.image;
      const innerPad = 14;
      const boxW = cellW - innerPad * 2;
      const boxH = cellH - innerPad * 2;
      const scale = Math.max(boxW / src.width, boxH / src.height);
const dw = src.width * scale;
const dh = src.height * scale;

const dx = x + innerPad + (boxW - dw) / 2;
const dy = y + innerPad + (boxH - dh) / 2;

ctx.drawImage(src, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#f0ebe4";
      ctx.fillRect(x, y, cellW, cellH);
      if (entry) {
        ctx.fillStyle = "#999999";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Image unavailable", x + cellW / 2, y + cellH / 2);
      }
    }

    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, cellW, cellH + labelHeight, radius);
    ctx.clip();
    ctx.fillStyle = "#1f2431";
    ctx.fillRect(x, y + cellH, cellW, labelHeight);
    ctx.restore();

    if (entry) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'Arial'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(entry.id || ""), x + cellW / 2, y + cellH + labelHeight / 2);
    }

    ctx.save();
    ctx.strokeStyle = "#d8c8b8";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.75, y + 0.75, cellW - 1.5, cellH + labelHeight - 1.5, radius);
    ctx.stroke();
    ctx.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Unable to build collage blob"));
        return;
      }
      resolve(blob);
    }, "image/png", 0.96);
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
