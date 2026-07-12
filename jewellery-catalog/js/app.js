let data = [];
let selected = [];
let lastBlob = null;
let collageBlobs = [];
let lastExportItems = [];
let lastExportTitle = "Jewellery Catalogue";
let lastExportKind = "none";
let lastPdfBlob = null;
let lastPdfUrl = "";
let gridCurrentPage = 1;
let gridPageSize = 36;
let selectedCurrentPage = 1;
let selectedPageSize = 24;
let lastSearchQuery = "";
let lastSortBy = "";
let controlsCollapsed = false;
let finalTraySerials = [];
let finalTraySuggestionIndex = -1;

const API_URL = "https://script.google.com/macros/s/AKfycby4RNwxBEfKWLWCT4Y6-LFLkObAE-j4LCDBUh5Lc3eG6zAcPN1WvUqXwOXMyWDH3nA/exec";
const APP_BUILD_TAG = "script-20260410-guard-logs-1";

function traceFinalTray(step, details) {
  const stamp = new Date().toISOString();
  if (details === undefined) {
    console.log(`[FinalTray ${stamp}] ${step}`);
    return;
  }
  console.log(`[FinalTray ${stamp}] ${step}`, details);
}

/* FETCH DATA */
initFinalTrayUi();
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
  renderFinalTraySerialManager();
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value.includes("marked")) {
    return "marked";
  }
  return "unmarked";
}

function normalizeImageUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input, window.location.href);
    // Drive may return temporary anti-abuse tokens that expire and cause 502.
    if (parsed.hostname.includes("drive.google.com")) {
      parsed.searchParams.delete("google_abuse");
    }
    // Trim leading/trailing spaces from each path segment (e.g. "Earrings " → "Earrings").
    // Spreadsheet entries sometimes have trailing spaces in folder names which cause 404s.
    if (parsed.hostname === "raw.githubusercontent.com") {
      parsed.pathname = parsed.pathname
        .split("/")
        .map(seg => {
          try {
            return encodeURIComponent(decodeURIComponent(seg).trim());
          } catch {
            return seg;
          }
        })
        .join("/");
    }
    return parsed.toString();
  } catch (err) {
    return encodeURI(input);
  }
}

function extractGoogleDriveId(url) {
  try {
    const parsed = new URL(url);
    const idFromQuery = parsed.searchParams.get("id");
    if (idFromQuery) {
      return idFromQuery;
    }

    const match = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : "";
  } catch (err) {
    return "";
  }
}

function buildImageSourceCandidates(item, preferCollageFirst) {
  const sources = preferCollageFirst
    ? [item["CollageURL"], item["DisplayURL"]]
    : [item["DisplayURL"], item["CollageURL"]];

  const out = [];
  const seen = new Set();

  const add = (url) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  };

  sources.forEach((rawUrl) => {
    const normalized = normalizeImageUrl(rawUrl);
    if (!normalized) {
      return;
    }

    const driveId = extractGoogleDriveId(normalized);
    if (driveId) {
      // Prefer stable Drive variants before direct uc links.
      add(`https://lh3.googleusercontent.com/d/${driveId}=w1600`);
      add(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`);
      add(`https://drive.google.com/uc?export=view&id=${driveId}`);
    }

    add(normalized);
  });

  return out;
}

function getPreviewImageUrl(item) {
  const candidates = buildImageSourceCandidates(item, false);
  return candidates[0] || "";
}

function getPreviewFallbackImageUrl(item) {
  const candidates = buildImageSourceCandidates(item, false);
  return candidates[1] || "";
}

function updateTabBadge() {
  const badge = document.getElementById("browseTabBadge");
  if (badge) {
    if (selected.length > 0) {
      badge.textContent = `${selected.length}`;
    } else {
      badge.textContent = "";
    }
  }
}

window.updateTabBadge = updateTabBadge;

function switchTab(tabName) {
  updateTabBadge();
  const browseTab = document.getElementById("browseTab");
  const selectedTab = document.getElementById("selectedTab");
  const finalTrayTab = document.getElementById("finalTrayTab");
  const browseBtn = document.getElementById("tabBrowseBtn");
  const selectedBtn = document.getElementById("tabSelectedBtn");
  const finalTrayBtn = document.getElementById("tabFinalTrayBtn");

  const isBrowse = tabName === "browse";
  const isSelected = tabName === "selected";
  browseTab.classList.toggle("active", isBrowse);
  selectedTab.classList.toggle("active", isSelected);
  finalTrayTab.classList.toggle("active", tabName === "finalTray");
  browseBtn.classList.toggle("active", isBrowse);
  selectedBtn.classList.toggle("active", isSelected);
  finalTrayBtn.classList.toggle("active", tabName === "finalTray");
}

function toggleControlsCollapse() {
  const content = document.getElementById("controlsContent");
  const btn = document.getElementById("collapseBtn");
  
  if (!content || !btn) {
    return;
  }
  
  controlsCollapsed = !controlsCollapsed;
  content.classList.toggle("collapsed", controlsCollapsed);
  btn.textContent = controlsCollapsed ? "+" : "−";
  btn.title = controlsCollapsed ? "Expand controls" : "Collapse controls";
}

window.toggleControlsCollapse = toggleControlsCollapse;

/* FILTER */
function initFilter() {
  const typeCounts = new Map();
  data.forEach(item => {
    const type = String(item["Type"] || "").trim();
    if (!type) {
      return;
    }
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  let types = [...typeCounts.keys()];
  types.sort((a, b) => String(a).localeCompare(String(b)));
  let filter = document.getElementById("filterType");
  let brandFilter = document.getElementById("filterBrand");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t} (${typeCounts.get(t) || 0})</option>`).join("");

  const brandCounts = new Map();
  data.forEach(item => {
    const brand = String(item["Brand Name"] || "").trim();
    if (!brand) {
      return;
    }
    brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
  });

  const brands = [...brandCounts.keys()];
  brands.sort((a, b) => a.localeCompare(b));

  if (brandFilter) {
    brandFilter.innerHTML = '<option value="">All Brands</option>' +
      brands.map(b => `<option value="${b}">${b} (${brandCounts.get(b) || 0})</option>`).join("");
  }

  renderCountSummary(brandCounts, typeCounts);
}

function renderCountSummary(brandCounts, typeCounts) {
  const summaryNode = document.getElementById("countSummary");
  if (!summaryNode) {
    return;
  }

  const topBrands = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => `${name}: ${count}`)
    .join(" | ");

  const allTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}: ${count}`)
    .join(" | ");

  summaryNode.innerHTML = `
    <p><strong>Brands:</strong> ${topBrands || "No brands found"}</p>
    <p><strong>Types:</strong> ${allTypes || "No types found"}</p>
  `;
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

function onFilterChanged() {
  lastSearchQuery = document.getElementById("searchSerial") ? document.getElementById("searchSerial").value.trim().toUpperCase() : "";
  lastSortBy = document.getElementById("sortBy") ? document.getElementById("sortBy").value : "";
  gridCurrentPage = 1;
  render();
}

window.onFilterChanged = onFilterChanged;

/* RENDER GRID */
function render() {
  let filtered = getFilteredItems();

  const pageCount = Math.max(1, Math.ceil(filtered.length / gridPageSize));
  if (gridCurrentPage > pageCount) {
    gridCurrentPage = pageCount;
  }

  const startIndex = (gridCurrentPage - 1) * gridPageSize;
  const pageItems = filtered.slice(startIndex, startIndex + gridPageSize);
  let html = "";

  pageItems.forEach(item => {
    const status = normalizeStatus(item["Status"]);
    let isSelected = selected.includes(item["Serial No"]);
    const imageUrl = getPreviewImageUrl(item);
    const fallbackImageUrl = getPreviewFallbackImageUrl(item);
    const onErrorAttr = fallbackImageUrl
      ? `onerror=\"this.onerror=null;this.src='${fallbackImageUrl.replace(/'/g, "\\'")}';\"`
      : "";

    html += `
      <div class="card ${isSelected ? 'selected' : ''} ${status === "marked" ? "marked-card" : ""}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${imageUrl}" ${onErrorAttr}>
        <p>${item["Serial No"]}</p>
        ${status === "marked" ? '<p class="marked-label">Marked</p>' : ''}
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  updateDashboardStats(filtered.length);
  renderGridPager(filtered.length);
  renderSelected();
}

function renderGridPager(totalItems) {
  const pageInfo = document.getElementById("gridPageInfo");
  const prevBtn = document.querySelector("#gridPager .pager-btn:first-child");
  const nextBtn = document.querySelector("#gridPager .pager-btn:nth-child(3)");
  const pageSizeNode = document.getElementById("pageSize");

  if (pageSizeNode) {
    pageSizeNode.value = String(gridPageSize);
  }

  const pageCount = Math.max(1, Math.ceil(totalItems / gridPageSize));
  if (pageInfo) {
    pageInfo.textContent = `Page ${gridCurrentPage} of ${pageCount}`;
  }
  if (prevBtn) {
    prevBtn.disabled = gridCurrentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = gridCurrentPage >= pageCount;
  }
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
  updateTabBadge();
  render();
}

/* SELECTION PREVIEW */
function renderSelected() {
  let area = document.getElementById("selectedArea");
  const selectedItems = data.filter(d => selected.includes(d["Serial No"]));
  const summary = document.getElementById("selectedSummary");

  if (summary) {
    summary.textContent = `${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}`;
  }

  const selectedPageCount = Math.max(1, Math.ceil(selectedItems.length / selectedPageSize));
  if (selectedCurrentPage > selectedPageCount) {
    selectedCurrentPage = selectedPageCount;
  }

  const selectedStart = (selectedCurrentPage - 1) * selectedPageSize;
  const selectedPageItems = selectedItems.slice(selectedStart, selectedStart + selectedPageSize);

  if (!selectedItems.length) {
    area.innerHTML = '<div class="selection-empty">No items selected yet. Choose pieces from the catalogue to prepare a PDF.</div>';
    renderSelectedPager(0);
    return;
  }

  area.innerHTML = selectedPageItems
    .map(item => {
      const primaryUrl = getPreviewImageUrl(item);
      const fallbackUrl = getPreviewFallbackImageUrl(item);
      const onErrorAttr = fallbackUrl
        ? `onerror=\"this.onerror=null;this.src='${fallbackUrl.replace(/'/g, "\\'")}';\"`
        : "";

      return `
      <div class="selection-card">
        <button class="remove-btn" onclick="removeFromSelected('${item["Serial No"].replace(/'/g, "\\'")}')" title="Remove from selection">✕</button>
        <img src="${primaryUrl}" alt="${item["Serial No"]}" ${onErrorAttr}>
        <p>${item["Serial No"]}</p>
      </div>
    `;
    }).join("");

  renderSelectedPager(selectedItems.length);
}

function renderSelectedPager(totalItems) {
  const pageInfo = document.getElementById("selectedPageInfo");
  const prevBtn = document.getElementById("selectedPrevBtn");
  const nextBtn = document.getElementById("selectedNextBtn");
  const pageSizeNode = document.getElementById("selectedPageSize");
  const pageCount = Math.max(1, Math.ceil(totalItems / selectedPageSize));

  if (pageSizeNode) {
    pageSizeNode.value = String(selectedPageSize);
  }

  if (pageInfo) {
    pageInfo.textContent = `Page ${selectedCurrentPage} of ${pageCount}`;
  }

  if (prevBtn) {
    prevBtn.disabled = selectedCurrentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = selectedCurrentPage >= pageCount;
  }
}

function goToPrevPage() {
  if (gridCurrentPage <= 1) {
    return;
  }
  gridCurrentPage -= 1;
  render();
}

function goToNextPage() {
  const totalItems = getFilteredItems().length;
  const pageCount = Math.max(1, Math.ceil(totalItems / gridPageSize));
  if (gridCurrentPage >= pageCount) {
    return;
  }
  gridCurrentPage += 1;
  render();
}

function changePageSize(value) {
  const nextSize = Number(value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) {
    return;
  }
  gridPageSize = nextSize;
  gridCurrentPage = 1;
  render();
}

function goToPrevSelectedPage() {
  if (selectedCurrentPage <= 1) {
    return;
  }
  selectedCurrentPage -= 1;
  renderSelected();
}

function goToNextSelectedPage() {
  const selectedItems = data.filter(d => selected.includes(d["Serial No"]));
  const pageCount = Math.max(1, Math.ceil(selectedItems.length / selectedPageSize));
  if (selectedCurrentPage >= pageCount) {
    return;
  }
  selectedCurrentPage += 1;
  renderSelected();
}

function changeSelectedPageSize(value) {
  const nextSize = Number(value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) {
    return;
  }
  selectedPageSize = nextSize;
  selectedCurrentPage = 1;
  renderSelected();
}

function getFilteredItems() {
  const filterTypeNode = document.getElementById("filterType");
  const filterBrandNode = document.getElementById("filterBrand");
  const filterStatusNode = document.getElementById("filterStatus");
  const hideMarkedNode = document.getElementById("hideMarked");

  const filterType = filterTypeNode ? filterTypeNode.value : "";
  const filterBrand = filterBrandNode ? filterBrandNode.value : "";
  const filterStatus = filterStatusNode ? filterStatusNode.value : "";
  const hideMarked = hideMarkedNode ? hideMarkedNode.checked : false;

  let filtered = data.filter(d => {
    const status = normalizeStatus(d["Status"]);
    const typeMatch = !filterType || d["Type"] === filterType;
    const brandMatch = !filterBrand || String(d["Brand Name"] || "").trim() === filterBrand;

    if (!typeMatch || !brandMatch) {
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

    if (lastSearchQuery && !String(d["Serial No"] || "").toUpperCase().includes(lastSearchQuery)) {
      return false;
    }

    return true;
  });

  if (lastSortBy === "serial") {
    filtered.sort((a, b) => String(a["Serial No"] || "").localeCompare(String(b["Serial No"] || "")));
  } else if (lastSortBy === "brand") {
    filtered.sort((a, b) => String(a["Brand Name"] || "").localeCompare(String(b["Brand Name"] || "")));
  } else if (lastSortBy === "type") {
    filtered.sort((a, b) => String(a["Type"] || "").localeCompare(String(b["Type"] || "")));
  }

  return filtered;
}

window.goToPrevPage = goToPrevPage;
window.goToNextPage = goToNextPage;
window.changePageSize = changePageSize;
window.goToPrevSelectedPage = goToPrevSelectedPage;
window.goToNextSelectedPage = goToNextSelectedPage;
window.changeSelectedPageSize = changeSelectedPageSize;

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
    const exportItems = data.filter(d => selected.includes(d["Serial No"]));
    let generatedBlobs;

    try {
      generatedBlobs = await buildAllCollagesOnServer(selected);
    } catch (serverErr) {
      console.warn("Server collage failed, using browser fallback", serverErr);
      const chunks = chunkArray(selected, 6);
      generatedBlobs = [];
      for (const chunkIds of chunks) {
        const items = data.filter(d => chunkIds.includes(d["Serial No"]));
        let blob = await buildCollageBlob(items);
        if (chunkIds.length < 6) {
          blob = await trimOuterWhitespaceOnly(blob);
        }
        generatedBlobs.push(blob);
      }
    }

    if (generatedBlobs.length === 0) {
      throw new Error("Unable to prepare the PDF pages");
    }

    // Collect items whose images could not be loaded (browser fallback only)
    const allMissingImages = generatedBlobs.flatMap(b => b._missingItems || []);

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
    lastExportItems = exportItems;
    lastExportTitle = "Client Catalogue";
    lastExportKind = "selection";
    lastPdfBlob = null;

    await rebuildPdfPreview();

    const pageNote = collageBlobs.length > 1 ? `${collageBlobs.length} pages prepared. ` : "";
    if (allMissingImages.length) {
      alert(`${pageNote}PDF ready.\n\n⚠️ ${allMissingImages.length} item${allMissingImages.length === 1 ? "" : "s"} had no loadable image and show a placeholder:\n${allMissingImages.join(", ")}`);
    } else if (collageBlobs.length > 1) {
      alert(`${pageNote}Preview updated.`);
    }

  } catch (err) {
    console.error(err);
    alert("Error preparing the PDF. Please try different images.");
  } finally {
    showSpinner(false);
  }
}

async function generateFinalTrayFromSerials() {
  let serials = [...finalTraySerials];

  if (!serials.length) {
    const serialInput = document.getElementById("serialBulkInput");
    const parsed = parseSerialInput(serialInput ? serialInput.value : "");
    if (parsed.length) {
      addSerialsToFinalTray(parsed);
      serials = [...finalTraySerials];
    }
  }

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
    const requestId = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    traceFinalTray("generate:start", {
      requestId,
      build: APP_BUILD_TAG,
      serialCount: serials.length,
      serialPreview: serials.slice(0, 8)
    });

    const exportItems = resolveItemsBySerials(serials);
    traceFinalTray("generate:resolvedItems", {
      requestId,
      resolvedCount: exportItems.length
    });

    const exportIds = exportItems
      .map(item => String(item["Serial No"] || "").trim())
      .filter(Boolean);

    if (!exportIds.length) {
      throw new Error("No matching serials found in current data");
    }

    let generatedBlobs;
    try {
      // Keep Final Tray visual output identical to Selection pipeline.
      generatedBlobs = await buildAllCollagesOnServer(exportIds);
    } catch (serverErr) {
      console.warn("Final tray server collage failed, using browser fallback", serverErr);
      const chunks = chunkArray(exportIds, 6);
      generatedBlobs = [];
      for (const chunkIds of chunks) {
        const items = data.filter(d => chunkIds.includes(String(d["Serial No"] || "").trim()));
        let blob = await buildCollageBlob(items);
        if (chunkIds.length < 6) {
          blob = await trimOuterWhitespaceOnly(blob);
        }
        generatedBlobs.push(blob);
      }
    }

    if (!generatedBlobs || generatedBlobs.length === 0) {
      throw new Error("Unable to prepare the final tray PDF pages");
    }

    const markResult = await markFinalTrayOnlyOnServer(serials);
    traceFinalTray("generate:serverResult", {
      requestId,
      ok: !!markResult?.ok,
      pages: generatedBlobs.length,
      updatedCount: Number(markResult?.updatedCount || 0),
      missingCount: Array.isArray(markResult?.missingSerials) ? markResult.missingSerials.length : 0,
      error: markResult?.error || ""
    });

    if (!markResult.ok) {
      throw new Error(markResult.error || "Unable to update marked status");
    }

    const updatedCount = Number(markResult.updatedCount || 0);
    const missing = markResult.missingSerials || [];

    collageBlobs = generatedBlobs;
    lastBlob = collageBlobs[0];
    lastExportItems = exportItems;
    lastExportTitle = "Final Tray Catalogue";
    lastExportKind = "final-tray";
    lastPdfBlob = null;

    await rebuildPdfPreview();
    await loadData();

    const missingText = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
    const pageText = collageBlobs.length > 1 ? ` ${collageBlobs.length} PDF pages prepared.` : "";

    setSerialFeedback(`Done. Marked ${updatedCount} items in Excel.${missingText}${pageText}`, false);
    traceFinalTray("generate:done", {
      requestId,
      pages: collageBlobs.length,
      marked: updatedCount,
      missing
    });
    alert(`Final tray PDF prepared. ${updatedCount} items marked in Excel.${pageText}`);
  } catch (err) {
    console.error(err);
    traceFinalTray("generate:error", {
      message: err?.message || String(err),
      stack: err?.stack || ""
    });
    const rawMessage = err && err.message ? String(err.message) : "Failed to prepare the final tray PDF";
    const isSlidesRuntimeMismatch = /setPageWidth|setPageHeight/i.test(rawMessage);
    const uiMessage = isSlidesRuntimeMismatch
      ? "Final Tray failed on server: outdated Apps Script deployment. Redeploy Web App with New Version, then retry."
      : rawMessage;

    setSerialFeedback(uiMessage, true);
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

function initFinalTrayUi() {
  const searchInput = document.getElementById("finalTraySearchInput");
  const bulkInput = document.getElementById("serialBulkInput");

  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", () => {
    finalTraySuggestionIndex = -1;
    renderFinalTraySerialManager();
  });

  searchInput.addEventListener("keydown", (event) => {
    const suggestions = getFinalTraySuggestions(searchInput.value || "");

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!suggestions.length) {
        return;
      }
      finalTraySuggestionIndex = Math.min(finalTraySuggestionIndex + 1, suggestions.length - 1);
      renderFinalTraySerialManager();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!suggestions.length) {
        return;
      }
      finalTraySuggestionIndex = Math.max(finalTraySuggestionIndex - 1, 0);
      renderFinalTraySerialManager();
      return;
    }

    if (event.key === "Enter" || event.key === "," || event.key === ";") {
      event.preventDefault();
      const picked = finalTraySuggestionIndex >= 0 && suggestions[finalTraySuggestionIndex]
        ? suggestions[finalTraySuggestionIndex]
        : searchInput.value;

      const added = addSerialsToFinalTray([picked]);
      if (added > 0) {
        searchInput.value = "";
      }
      finalTraySuggestionIndex = -1;
      renderFinalTraySerialManager();
    }

    if (event.key === "Backspace" && !searchInput.value && finalTraySerials.length) {
      finalTraySerials = finalTraySerials.slice(0, -1);
      renderFinalTraySerialManager();
    }
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      finalTraySuggestionIndex = -1;
      renderFinalTraySerialManager();
    }, 120);
  });

  searchInput.addEventListener("focus", () => {
    renderFinalTraySerialManager();
  });

  if (bulkInput) {
    bulkInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        addBulkSerialsToFinalTray();
      }
    });
  }
}

function buildKnownSerialDictionary() {
  const out = [];
  const seen = new Set();

  data.forEach((item) => {
    const normalized = sanitizeSerialToken(item["Serial No"] || "");
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  });

  return out;
}

function addSerialsToFinalTray(values) {
  const incoming = Array.isArray(values) ? values : [];
  const existing = new Set(finalTraySerials);
  let addedCount = 0;

  incoming.forEach((value) => {
    const normalized = sanitizeSerialToken(value);
    if (!normalized || existing.has(normalized)) {
      return;
    }
    existing.add(normalized);
    finalTraySerials.push(normalized);
    addedCount += 1;
  });

  return addedCount;
}

function removeSerialFromFinalTray(serial) {
  const normalized = sanitizeSerialToken(serial);
  if (!normalized) {
    return;
  }
  finalTraySerials = finalTraySerials.filter((s) => s !== normalized);
  renderFinalTraySerialManager();
}

function addBulkSerialsToFinalTray() {
  const bulkInput = document.getElementById("serialBulkInput");
  const parsed = parseSerialInput(bulkInput ? bulkInput.value : "");
  const added = addSerialsToFinalTray(parsed);

  if (bulkInput && added > 0) {
    bulkInput.value = "";
  }

  if (added === 0 && parsed.length > 0) {
    setSerialFeedback("All parsed serials are already in the final list.", false);
  } else if (added > 0) {
    setSerialFeedback(`Added ${added} code${added === 1 ? "" : "s"} to final tray list.`, false);
  }

  finalTraySuggestionIndex = -1;
  renderFinalTraySerialManager();
}

function getFinalTraySuggestions(rawQuery) {
  const query = sanitizeSerialToken(rawQuery || "");
  if (!query) {
    return [];
  }

  const fromCurrentList = finalTraySerials.filter((serial) => serial.includes(query));
  const currentSet = new Set(fromCurrentList);
  const known = buildKnownSerialDictionary();
  const fromKnown = known
    .filter((serial) => serial.includes(query) && !currentSet.has(serial) && finalTraySerials.indexOf(serial) === -1)
    .slice(0, 10);

  return [...fromCurrentList, ...fromKnown].slice(0, 12);
}

function renderFinalTraySerialManager() {
  const listNode = document.getElementById("finalTrayList");
  const metaNode = document.getElementById("finalTrayListMeta");
  const inputNode = document.getElementById("finalTraySearchInput");
  const suggestionsNode = document.getElementById("finalTraySuggestions");

  if (!listNode || !metaNode || !suggestionsNode || !inputNode) {
    return;
  }

  metaNode.textContent = `${finalTraySerials.length} code${finalTraySerials.length === 1 ? "" : "s"} in final tray list`;

  if (!finalTraySerials.length) {
    listNode.innerHTML = '<span class="panel-meta">No serials added yet.</span>';
  } else {
    listNode.innerHTML = finalTraySerials.map((serial) => `
      <span class="final-tray-chip" title="${serial}">
        ${serial}
        <button type="button" class="final-tray-chip-remove" data-serial="${serial}" aria-label="Remove ${serial}">✕</button>
      </span>
    `).join("");

    listNode.querySelectorAll(".final-tray-chip-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeSerialFromFinalTray(btn.getAttribute("data-serial") || "");
      });
    });
  }

  const suggestions = getFinalTraySuggestions(inputNode.value || "");
  if (!suggestions.length || document.activeElement !== inputNode) {
    suggestionsNode.classList.add("hidden");
    suggestionsNode.innerHTML = "";
    return;
  }

  if (finalTraySuggestionIndex >= suggestions.length) {
    finalTraySuggestionIndex = suggestions.length - 1;
  }

  suggestionsNode.innerHTML = suggestions.map((serial, idx) => `
    <button type="button" class="final-tray-suggestion ${idx === finalTraySuggestionIndex ? "active" : ""}" data-serial="${serial}">${serial}</button>
  `).join("");

  suggestionsNode.querySelectorAll(".final-tray-suggestion").forEach((btn, idx) => {
    btn.addEventListener("mouseenter", () => {
      finalTraySuggestionIndex = idx;
      renderFinalTraySerialManager();
    });
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const serial = btn.getAttribute("data-serial") || "";
      const added = addSerialsToFinalTray([serial]);
      if (added > 0) {
        inputNode.value = "";
      }
      finalTraySuggestionIndex = -1;
      renderFinalTraySerialManager();
    });
  });

  suggestionsNode.classList.remove("hidden");
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

function selectAllByBrand() {
  const brandFilter = document.getElementById("filterBrand");
  const brandValue = brandFilter ? brandFilter.value : "";

  if (!brandValue) {
    alert("Choose a brand from the Brand filter first, then click Select Whole Brand.");
    return;
  }

  const toAdd = data.filter(d => {
    const brand = String(d["Brand Name"] || "").trim();
    return brand === brandValue && normalizeStatus(d["Status"]) !== "marked";
  });

  if (!toAdd.length) {
    alert(`No unmarked items found for brand "${brandValue}".`);
    return;
  }

  let addedCount = 0;
  toAdd.forEach(item => {
    const id = item["Serial No"];
    if (!selected.includes(id)) {
      selected.push(id);
      addedCount++;
    }
  });

  render();

  if (addedCount === 0) {
    alert(`All items from "${brandValue}" are already in your selection.`);
  } else {
    alert(`Added ${addedCount} item${addedCount === 1 ? "" : "s"} from "${brandValue}" to selection.`);
  }
}

function removeFromSelected(id) {
  selected = selected.filter(x => x !== id);
  updateTabBadge();
  renderSelected();
}

function clearAllSelected() {
  if (selected.length === 0) {
    alert("No items selected.");
    return;
  }
  if (confirm(`Clear all ${selected.length} selected items?`)) {
    selected = [];
    updateTabBadge();
    renderSelected();
  }
}

function removeMarkedFromSelected() {
  const markedInSelection = selected.filter(id => {
    const item = data.find(d => d["Serial No"] === id);
    return item && normalizeStatus(item["Status"]) === "marked";
  });

  if (markedInSelection.length === 0) {
    alert("No marked items in selection.");
    return;
  }

  if (confirm(`Remove ${markedInSelection.length} marked item(s)?`)) {
    selected = selected.filter(id => {
      const item = data.find(d => d["Serial No"] === id);
      return !(item && normalizeStatus(item["Status"]) === "marked");
    });
    updateTabBadge();
    renderSelected();
  }
}

window.removeFromSelected = removeFromSelected;
window.clearAllSelected = clearAllSelected;
window.removeMarkedFromSelected = removeMarkedFromSelected;
window.addBulkSerialsToFinalTray = addBulkSerialsToFinalTray;

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

async function shareFinalTrayPdf() {
  if (lastExportKind !== "final-tray") {
    const hint = lastExportTitle ? ` Current PDF: ${lastExportTitle}.` : "";
    alert(`Generate Final Tray PDF first, then share from this button.${hint}`);
    traceFinalTray("share:block-non-final", {
      lastExportKind,
      lastExportTitle,
      hasPages: collageBlobs.length > 0
    });
    return;
  }

  traceFinalTray("share:allowed", {
    lastExportKind,
    lastExportTitle,
    pages: collageBlobs.length
  });
  return shareCurrentPdf();
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

async function buildAllCollagesOnServer(selectedIds) {
  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "buildAllCollages", selected: selectedIds })
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.pages) || payload.pages.length === 0) {
    throw new Error(payload.error || "Invalid server collage response");
  }

  const blobs = [];
  for (const page of payload.pages) {
    if (!page.base64) continue;
    if (page.debug && page.debug.insertedImages === 0) {
      throw new Error("Server could not insert any images on a page");
    }
    const blob = base64ToBlob(page.base64, page.mimeType || "image/png");
    const isBlank = await isMostlyWhiteBlob(blob);
    if (isBlank) {
      throw new Error("Server returned a blank/white collage page");
    }
    blobs.push(blob);
  }

  if (blobs.length === 0) {
    throw new Error("Server returned no valid collage pages");
  }

  return blobs;
}

async function buildAllAndMarkOnServer(serials) {
  const requestId = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  traceFinalTray("server:request", {
    requestId,
    action: "buildAndMarkFinalTray",
    serialCount: serials.length,
    serialPreview: serials.slice(0, 8)
  });

  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "buildAndMarkFinalTray", serials: serials })
  });

  traceFinalTray("server:http", {
    requestId,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const rawText = await response.text();
  traceFinalTray("server:raw", {
    requestId,
    length: rawText.length,
    preview: rawText.slice(0, 260)
  });

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (err) {
    traceFinalTray("server:parse-error", {
      requestId,
      message: err && err.message ? err.message : String(err)
    });
    throw new Error("Server returned invalid JSON");
  }

  traceFinalTray("server:payload", {
    requestId,
    ok: !!payload.ok,
    pageCount: Array.isArray(payload.pages) ? payload.pages.length : 0,
    updatedCount: Number(payload.updatedCount || 0),
    missingCount: Array.isArray(payload.missingSerials) ? payload.missingSerials.length : 0,
    error: payload.error || ""
  });

  return payload;
}

async function markFinalTrayOnlyOnServer(serials) {
  const requestId = `mark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  traceFinalTray("server:mark-only:request", {
    requestId,
    action: "markFinalTrayOnly",
    serialCount: serials.length,
    serialPreview: serials.slice(0, 8)
  });

  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "markFinalTrayOnly", serials: serials })
  });

  traceFinalTray("server:mark-only:http", {
    requestId,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const rawText = await response.text();
  traceFinalTray("server:mark-only:raw", {
    requestId,
    length: rawText.length,
    preview: rawText.slice(0, 260)
  });

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (err) {
    traceFinalTray("server:mark-only:parse-error", {
      requestId,
      message: err && err.message ? err.message : String(err)
    });
    throw new Error("Server returned invalid JSON");
  }

  traceFinalTray("server:mark-only:payload", {
    requestId,
    ok: !!payload.ok,
    updatedCount: Number(payload.updatedCount || 0),
    missingCount: Array.isArray(payload.missingSerials) ? payload.missingSerials.length : 0,
    error: payload.error || ""
  });

  const rawError = String(payload && payload.error ? payload.error : "");
  const unsupportedMarkAction = !payload.ok && /(unsupported|unknown|invalid|action)/i.test(rawError);

  if (unsupportedMarkAction) {
    traceFinalTray("server:mark-only:fallback-legacy", {
      requestId,
      error: rawError
    });

    const legacy = await buildAllAndMarkOnServer(serials);
    return {
      ok: !!legacy.ok,
      updatedCount: Number(legacy.updatedCount || 0),
      missingSerials: Array.isArray(legacy.missingSerials) ? legacy.missingSerials : [],
      error: legacy.error || ""
    };
  }

  return payload;
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
  const urls = buildImageSourceCandidates(item, true);
  const errors = [];

  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch (err) {
      errors.push(url);
    }
  }

  // Only log once per item after all sources are exhausted
  console.warn(`[${item["Serial No"]}] All image sources failed (${errors.length} tried):`, errors);
  throw new Error(`Image not found for ${item["Serial No"]}`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,         x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h,     x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h,     x, y + h - r);
  ctx.lineTo(x,     y + r);
  ctx.quadraticCurveTo(x,     y,         x + r, y);
  ctx.closePath();
}

async function buildCollageBlob(items) {
  /* Canvas sized to match the PDF frame aspect ratio (≈ 0.9044).
     2 columns × 3 rows, zero outer padding, zero gaps.
     Reading order: 1=top-left, 2=top-right, 3=mid-left, 4=mid-right,
                    5=bot-left,  6=bot-right */
  const COLS    = 2;
  const ROWS    = 3;
  const W       = 1240;
  const H       = 1371;     /* 1240 / 0.9044 ≈ 1371 — matches PDF frame; 1371/3 = 457 px/row */
  const LABEL_H = 36;       /* serial label strip at bottom of each cell */
  const radius  = 10;

  const cellW = W / COLS;        /* 620 px */
  const cellH = H / ROWS;        /* 457 px — full cell (image + label) */
  const imgH  = cellH - LABEL_H; /* 421 px — image-only area */

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const missingInCollage = [];
  const images = await Promise.all(
    items.map(async item => {
      try {
        return { id: item["Serial No"], image: await loadImageWithFallback(item) };
      } catch (err) {
        missingInCollage.push(item["Serial No"]);
        return { id: item["Serial No"], image: null };
      }
    })
  );

  for (let index = 0; index < 6; index++) {
    const col   = index % COLS;
    const row   = Math.floor(index / COLS);
    const x     = col * cellW;   /* zero outer padding, zero gap */
    const y     = row * cellH;   /* cellH already includes label — no double-count */
    const entry = images[index];

    /* — Image area — */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellW, imgH);
    ctx.clip();

    if (entry && entry.image) {
      const src      = entry.image;
      const innerPad = 14;
      const boxW     = cellW - innerPad * 2;
      const boxH     = imgH  - innerPad * 2;
      const scale    = Math.max(boxW / src.width, boxH / src.height);
      const dw       = src.width  * scale;
      const dh       = src.height * scale;
      const dx       = x + innerPad + (boxW - dw) / 2;
      const dy       = y + innerPad + (boxH - dh) / 2;
      ctx.drawImage(src, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#f0ebe4";
      ctx.fillRect(x, y, cellW, imgH);
      if (entry) {
        ctx.fillStyle = "#999999";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Image unavailable", x + cellW / 2, y + imgH / 2);
      }
    }
    ctx.restore();

    /* — Label strip — */
    ctx.save();
    roundRect(ctx, x, y, cellW, cellH, radius);
    ctx.clip();
    ctx.fillStyle = "#1f2431";
    ctx.fillRect(x, y + imgH, cellW, LABEL_H);
    ctx.restore();

    if (entry) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'Arial'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(entry.id || ""), x + cellW / 2, y + imgH + LABEL_H / 2);
    }

    /* — Cell border — */
    ctx.save();
    ctx.strokeStyle = "#d8c8b8";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.75, y + 0.75, cellW - 1.5, cellH - 1.5, radius);
    ctx.stroke();
    ctx.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Unable to build collage blob"));
        return;
      }
      blob._missingItems = missingInCollage;
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
