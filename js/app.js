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
let dataBySerial = new Map();
let miniWebsiteMeta = { name: "", purpose: "review" };

function rebuildDataIndex() {
  dataBySerial = new Map(data.map(item => [item["Serial No"], item]));
}

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
  rebuildDataIndex();
  selected = selected.filter(id => {
    const item = dataBySerial.get(id);
    return item && normalizeStatus(item["Status"]) !== "marked";
  });
  initFilter();
  render();
  renderFinalTraySerialManager();
  updateMiniWebsiteModalPreview();
}

async function getInventoryForExport() {
  if (Array.isArray(data) && data.length) {
    return data;
  }

  const res = await fetch(API_URL);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || []);
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
      add(`https://lh3.googleusercontent.com/d/${driveId}=w700`);
      add(`https://drive.google.com/thumbnail?id=${driveId}&sz=w700`);
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

  const pageShell = document.querySelector(".page-shell");
  if (pageShell) {
    pageShell.classList.toggle("browse-active", isBrowse);
  }
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

function toggleFilterMenu(event) {
  if (event) {
    event.stopPropagation();
  }
  const menu = document.getElementById("controlsContent");
  const btn = document.getElementById("filterToggleBtn");
  if (!menu || !btn) {
    return;
  }

  const willOpen = menu.classList.contains("hidden");
  menu.classList.toggle("hidden");

  if (willOpen) {
    positionFilterMenu(menu, btn);
  }
}

function toggleBreakdown(event) {
  if (event) {
    event.stopPropagation();
  }
  const node = document.getElementById("countSummary");
  const btn = document.getElementById("breakdownToggleBtn");
  if (!node || !btn) {
    return;
  }
  const isHidden = node.classList.contains("hidden");
  node.classList.toggle("hidden");
  btn.textContent = isHidden ? "Hide brand & type breakdown" : "View brand & type breakdown";
}

window.toggleBreakdown = toggleBreakdown;

function positionFilterMenu(menu, btn) {
  const rect = btn.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 420;
  const margin = 16;

  let left = rect.right - menuWidth;
  left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

  let top = rect.bottom + 10;
  const menuHeight = menu.offsetHeight || 300;
  if (top + menuHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuHeight - 10);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

window.addEventListener("resize", () => {
  const menu = document.getElementById("controlsContent");
  const btn = document.getElementById("filterToggleBtn");
  if (menu && btn && !menu.classList.contains("hidden")) {
    positionFilterMenu(menu, btn);
  }
});

window.toggleFilterMenu = toggleFilterMenu;

document.addEventListener("click", (event) => {
  const menu = document.getElementById("controlsContent");
  const wrap = document.querySelector(".filter-menu-wrap");
  if (!menu || !wrap) {
    return;
  }
  if (!menu.classList.contains("hidden") && !wrap.contains(event.target)) {
    menu.classList.add("hidden");
  }
});

window.toggleControlsCollapse = toggleControlsCollapse;

function renderCategoryBar(typeCounts) {
  const bar = document.getElementById("categoryBar");
  if (!bar) {
    return;
  }

  const filterTypeNode = document.getElementById("filterType");
  const activeType = filterTypeNode ? filterTypeNode.value : "";

  const types = [...typeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const totalCount = data.length;

  let html = `<button type="button" class="category-pill ${!activeType ? 'active' : ''}" onclick='selectCategory("")'>All <span class="count">${totalCount}</span></button>`;

  types.forEach(([type, count]) => {
    html += `<button type="button" class="category-pill ${activeType === type ? 'active' : ''}" onclick='selectCategory("${type.replace(/'/g, "\\'")}")'>${type} <span class="count">${count}</span></button>`;
  });

  bar.innerHTML = html;
}

function selectCategory(type) {
  const filterTypeNode = document.getElementById("filterType");
  if (filterTypeNode) {
    filterTypeNode.value = type;
  }
  onFilterChanged();
}

window.selectCategory = selectCategory;
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
  renderCategoryBar(typeCounts);
}

function renderCountSummary(brandCounts, typeCounts) {
  const summaryNode = document.getElementById("countSummary");
  if (!summaryNode) {
    return;
  }

  const topBrands = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);

  const allTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const renderPills = (entries) => entries
    .map(([name, count]) => `<span class="breakdown-pill">${name} <strong>${count}</strong></span>`)
    .join("");

  summaryNode.innerHTML = `
    <div class="breakdown-group">
      <p class="breakdown-label">Brands</p>
      <div class="breakdown-pills">${renderPills(topBrands) || '<span class="breakdown-pill">No brands found</span>'}</div>
    </div>
    <div class="breakdown-group">
      <p class="breakdown-label">Types</p>
      <div class="breakdown-pills">${renderPills(allTypes) || '<span class="breakdown-pill">No types found</span>'}</div>
    </div>
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
  const headingNode = document.getElementById("gridSummaryHeading");
  if (headingNode) headingNode.textContent = `${visibleCount} visible item${visibleCount === 1 ? "" : "s"}`;
}

function onFilterChanged() {
  lastSearchQuery = document.getElementById("searchSerial") ? document.getElementById("searchSerial").value.trim().toUpperCase() : "";
  lastSortBy = document.getElementById("sortBy") ? document.getElementById("sortBy").value : "";
  gridCurrentPage = 1;
  render();
  document.querySelectorAll(".category-pill").forEach(pill => pill.classList.remove("active"));
  const filterTypeNode = document.getElementById("filterType");
  const activeType = filterTypeNode ? filterTypeNode.value : "";
  document.querySelectorAll(".category-pill").forEach(pill => {
    const label = pill.textContent.trim().split(" ")[0];
    if ((!activeType && label === "All") || label === activeType) {
      pill.classList.add("active");
    }
  });
}
window.onFilterChanged = onFilterChanged;
let searchDebounceTimer = null;
function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    onFilterChanged();
  }, 250);
}
window.onSearchInput = onSearchInput;

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

  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

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
        <div class="card-media">
          <img src="${imageUrl}" loading="lazy" ${onErrorAttr}>
          <div class="select-indicator">${checkSvg}</div>
          <p class="card-label">${item["Serial No"]}</p>
        </div>
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
        <div class="card-media">
          <img src="${primaryUrl}" alt="${item["Serial No"]}" loading="lazy" ${onErrorAttr}>
          <p class="card-label">${item["Serial No"]}</p>
        </div>
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
    const item = dataBySerial.get(id);
    return item && normalizeStatus(item["Status"]) === "marked";
  });

  if (markedInSelection.length === 0) {
    alert("No marked items in selection.");
    return;
  }

  if (confirm(`Remove ${markedInSelection.length} marked item(s)?`)) {
    selected = selected.filter(id => {
      const item = dataBySerial.get(id);
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
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}

function openBlobPreview(blob, fileName) {
  const previewUrl = URL.createObjectURL(blob);
  const previewWindow = window.open(previewUrl, "_blank", "noopener,noreferrer");

  if (!previewWindow) {
    const fallbackLink = document.createElement("a");
    fallbackLink.href = previewUrl;
    fallbackLink.target = "_blank";
    fallbackLink.rel = "noopener noreferrer";
    fallbackLink.style.display = "none";
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    fallbackLink.remove();
  }

  setTimeout(() => {
    URL.revokeObjectURL(previewUrl);
  }, 10000);

  return previewUrl;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getMiniWebsiteSelectionItems() {
  const selectedSerialSet = new Set(
    (Array.isArray(selected) ? selected : []).map(normalizeSerialForMatching)
  );

  return data.filter(item => selectedSerialSet.has(normalizeSerialForMatching(item["Serial No"])));
}

function setMiniWebsiteMeta(name, purpose) {
  miniWebsiteMeta = {
    name: String(name || "").trim(),
    purpose: purpose === "final" ? "final" : "review"
  };
}

function bindMiniWebsitePreviewInputs() {
  const nameInput = document.getElementById("miniWebsiteNameInput");
  const purposeSelect = document.getElementById("miniWebsitePurposeSelect");

  if (!nameInput || !purposeSelect) {
    return;
  }

  if (nameInput.dataset.previewBound === "true") {
    return;
  }

  nameInput.addEventListener("input", updateMiniWebsiteModalPreview);
  purposeSelect.addEventListener("change", updateMiniWebsiteModalPreview);
  nameInput.dataset.previewBound = "true";
  purposeSelect.dataset.previewBound = "true";
}

function openMiniWebsiteModal() {
  const modal = document.getElementById("miniWebsiteModal");
  const nameInput = document.getElementById("miniWebsiteNameInput");
  const purposeSelect = document.getElementById("miniWebsitePurposeSelect");

  if (!modal || !nameInput || !purposeSelect) {
    return;
  }

  bindMiniWebsitePreviewInputs();
  nameInput.value = miniWebsiteMeta.name || "";
  purposeSelect.value = miniWebsiteMeta.purpose || "review";
  modal.classList.remove("hidden");
  updateMiniWebsiteModalPreview();
}

function closeMiniWebsiteModal() {
  const modal = document.getElementById("miniWebsiteModal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

function renderMiniWebsitePreview(containerId) {
  const preview = document.getElementById(containerId);
  if (!preview) {
    return;
  }

  const nameInput = document.getElementById("miniWebsiteNameInput");
  const purposeSelect = document.getElementById("miniWebsitePurposeSelect");
  const hasModalInputs = Boolean(nameInput && purposeSelect);
  const nameValue = (hasModalInputs ? nameInput.value : miniWebsiteMeta.name || "").trim() || "Guest";
  const purpose = (hasModalInputs ? purposeSelect.value : miniWebsiteMeta.purpose || "review") === "final" ? "final" : "review";
  const previewItems = getMiniWebsiteSelectionItems().slice(0, 4);
  const purposeLabel = purpose === "final" ? "Final handoff" : "Review handoff";
  const selectedCount = Array.isArray(selected) ? selected.length : 0;
  const selectionLabel = selectedCount ? `${selectedCount} selected product${selectedCount === 1 ? "" : "s"}` : "No products selected yet";

  preview.innerHTML = `
    <p class="preview-name">${escapeHtml(nameValue)} · ${escapeHtml(purposeLabel)}</p>
    <p class="preview-sub">This preview will be used for the mini website and currently shows ${escapeHtml(selectionLabel)}.</p>
    <div class="preview-chip-row">
      <span class="preview-chip">Stylist: ${escapeHtml(nameValue)}</span>
      <span class="preview-chip">Purpose: ${escapeHtml(purpose === "final" ? "Final" : "Review")}</span>
      <span class="preview-chip">Selection: ${selectedCount}</span>
    </div>
    ${previewItems.length ? `<div class="preview-chip-row">${previewItems.map(item => `<span class="preview-chip">${escapeHtml(item["Serial No"] || "")}</span>`).join("")}</div>` : ""}
  `;
}

function updateMiniWebsiteModalPreview() {
  renderMiniWebsitePreview("miniWebsiteModalPreview");
  renderMiniWebsitePreview("miniWebsitePreview");
}

function normalizeSerialForMatching(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildMiniWebsiteHtml(inventoryItems, initialSelectedSerials = [], options = {}) {
  const selectedSerialSet = new Set(
    (Array.isArray(initialSelectedSerials) ? initialSelectedSerials : []).map(normalizeSerialForMatching)
  );

  const filteredInventory = inventoryItems.filter(item => {
    const serial = normalizeSerialForMatching(item["Serial No"]);
    return selectedSerialSet.has(serial);
  });

  const safeInventory = filteredInventory.map(item => ({
    "Serial No": item["Serial No"],
    "Brand Name": item["Brand Name"],
    "Type": item["Type"],
    "Status": item["Status"],
    "DisplayURL": item["DisplayURL"],
    "CollageURL": item["CollageURL"]
  }));

  const safeSelected = initialSelectedSerials.filter(Boolean);
  const inventoryJson = JSON.stringify(safeInventory, null, 2);
  const selectedJson = JSON.stringify(safeSelected);
  const metaJson = JSON.stringify({
    name: String(options.name || miniWebsiteMeta.name || "").trim(),
    purpose: options.purpose === "final" ? "final" : "review"
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jewellery Mini Website</title>
  <style>
    :root { color-scheme: light; --bg:#f8f4ee; --panel:#fffdf9; --ink:#221b13; --muted:#6d655d; --line:#eadfce; --accent:#8b5d42; --review:#f4c542; --final:#1f7e58; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: linear-gradient(135deg, #fef9f3 0%, var(--bg) 100%); color: var(--ink); }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px 18px 56px; }
    .hero { background: linear-gradient(135deg, #fffdf9 0%, #f9efe7 100%); border: 1px solid var(--line); border-radius: 28px; padding: 24px; box-shadow: 0 18px 48px rgba(31, 23, 19, 0.08); }
    .hero h1 { margin: 0 0 8px; font-size: clamp(1.5rem, 2.2vw, 2.25rem); }
    .hero p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
    .hero-grid { display: grid; gap: 16px; grid-template-columns: 1.4fr 0.9fr; align-items: start; }
    .controls { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 0.92rem; font-weight: 700; color: var(--accent); }
    input, select, button { font: inherit; padding: 10px 12px; border-radius: 999px; border: 1px solid var(--line); }
    button { cursor: pointer; background: var(--accent); color: #fff; border: none; }
    button.secondary { background: #fff; color: var(--accent); border: 1px solid var(--line); }
    .share-card { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .share-card .title { font-weight: 800; margin: 0; }
    .share-card .sub { margin: 0; color: var(--muted); font-size: 0.95rem; }
    .share-card svg { width: 140px; height: 140px; background: #fff; border-radius: 14px; border: 1px solid var(--line); padding: 8px; }
    .meta { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; margin: 20px 0 12px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(139, 93, 66, 0.1); color: var(--accent); font-weight: 700; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .card { position: relative; border-radius: 18px; overflow: hidden; border: 2px solid transparent; background: #fff; box-shadow: 0 12px 30px rgba(31, 23, 19, 0.08); transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
    .card:hover { transform: translateY(-3px); box-shadow: 0 16px 32px rgba(31, 23, 19, 0.12); }
    .card img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; }
    .card .body { padding: 10px; }
    .card .title { font-weight: 700; margin: 0 0 4px; }
    .card .sub { color: var(--muted); font-size: 0.86rem; margin: 0; }
    .card.selected-review { border-color: var(--review); background: #fff8d6; }
    .card.selected-review::before { content: "Review"; position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 999px; background: var(--review); color: #5f4700; font-size: 0.72rem; font-weight: 800; }
    .card.selected-final { border-color: var(--final); background: #edf6ee; }
    .card.selected-final::before { content: "Marked"; position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 999px; background: var(--final); color: white; font-size: 0.72rem; font-weight: 800; }
    .empty { padding: 28px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 16px; background: rgba(255,255,255,0.6); }
    @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .page { padding: 14px 12px 40px; } .hero { padding: 18px; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="hero-grid">
        <div>
          <h1>Jewellery Mini Website</h1>
          <p>Enter your name, choose a purpose, and review the selected pieces. This view is built from the same selected products used for PDF export.</p>
          <div class="controls">
            <div class="field">
              <label for="userName">User name</label>
              <input id="userName" placeholder="Enter your name">
            </div>
            <div class="field">
              <label for="purpose">Purpose</label>
              <select id="purpose">
                <option value="review">Review</option>
                <option value="final">Final</option>
              </select>
            </div>
            <div class="field">
              <label>&nbsp;</label>
              <button id="clearBtn" class="secondary" type="button">Clear selections</button>
            </div>
          </div>
        </div>
        <div class="share-card" id="shareCard">
          <p class="title">Share this view</p>
          <p class="sub" id="shareSummary">A polished QR-style card appears here for quick sharing.</p>
          <div id="qrWrap" style="display:flex;justify-content:center;"></div>
        </div>
      </div>
    </section>

    <div class="meta">
      <div class="pill" id="statusPill">Ready to review</div>
      <div class="pill" id="summaryPill">0 selected</div>
    </div>

    <div id="inventoryGrid" class="grid"></div>
  </div>

  <script>
    const inventory = ${inventoryJson};
    const initialSelected = ${selectedJson};
    const initialMiniWebsiteMeta = ${metaJson};
    const storageKey = 'jewellery-mini-website-state';
    let selectedSerials = new Set(initialSelected);
    let purpose = initialMiniWebsiteMeta.purpose || 'review';

    function normalizeStatus(status) {
      const value = String(status || '').trim().toLowerCase();
      return value.includes('marked') ? 'marked' : 'unmarked';
    }

    function getImageUrl(item) {
      const candidates = [item.DisplayURL, item.CollageURL].filter(Boolean);
      return candidates[0] || '';
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function createQrSvg(seed) {
      const size = 21;
      const cells = [];
      const base = String(seed || 'jewellery');
      const hash = Array.from(base).reduce((sum, char) => sum + char.charCodeAt(0), 0);

      for (let y = 0; y < size; y += 1) {
        const row = [];
        for (let x = 0; x < size; x += 1) {
          const inFinder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
          const shouldFill = inFinder ? true : ((hash + x * 13 + y * 7 + (x * y)) % 5) === 0;
          row.push(shouldFill ? 1 : 0);
        }
        cells.push(row);
      }

      const squares = [];
      cells.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            squares.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#8b5d42"></rect>');
          }
        });
      });

      return '<svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">' + squares.join('') + '</svg>';
    }

    function saveState() {
      const payload = {
        name: document.getElementById('userName').value,
        purpose,
        selected: Array.from(selectedSerials)
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    }

    function restoreState() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (initialMiniWebsiteMeta.name) {
          document.getElementById('userName').value = initialMiniWebsiteMeta.name;
        }
        if (initialMiniWebsiteMeta.purpose) {
          purpose = initialMiniWebsiteMeta.purpose;
        }
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!initialMiniWebsiteMeta.name && parsed.name) document.getElementById('userName').value = parsed.name;
        if (!initialMiniWebsiteMeta.purpose && parsed.purpose) purpose = parsed.purpose;
        if (Array.isArray(parsed.selected)) {
          selectedSerials = new Set(parsed.selected);
        }
      } catch (err) {
        console.warn('Could not restore mini website state', err);
      }
    }

    function updateShareCard() {
      const nameValue = document.getElementById('userName').value.trim() || 'Guest';
      const qrWrap = document.getElementById('qrWrap');
      const shareSummary = document.getElementById('shareSummary');
      const seed = nameValue + '|' + purpose + '|' + Array.from(selectedSerials).join(',');
      qrWrap.innerHTML = createQrSvg(seed);
      shareSummary.textContent = purpose === 'final'
        ? nameValue + ' is preparing the final tray for review.'
        : nameValue + ' is sharing this selection for review.';
    }

    function render() {
      const grid = document.getElementById('inventoryGrid');
      const statusPill = document.getElementById('statusPill');
      const summaryPill = document.getElementById('summaryPill');
      const nameValue = document.getElementById('userName').value.trim();
      const headingName = nameValue || 'Guest';
      const stylistLabel = headingName === 'Guest' ? 'Stylist' : headingName;

      if (!inventory.length) {
        grid.innerHTML = '<div class="empty">No inventory available.</div>';
        summaryPill.textContent = '0 selected';
        updateShareCard();
        return;
      }

      const cards = inventory.map((item) => {
        const serial = item['Serial No'] || 'Unknown';
        const hasSelection = selectedSerials.has(serial);
        const stateClass = hasSelection ? (purpose === 'final' ? 'selected-final' : 'selected-review') : '';
        const status = normalizeStatus(item.Status);
        const label = status === 'marked' ? 'Marked' : 'Available';
        const imageUrl = getImageUrl(item);

        return [
          '<article class="card ' + stateClass + '" data-serial="' + escapeHtml(serial) + '" role="button" tabindex="0">',
          '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(serial) + '" onerror="this.style.display=\'none\'">',
          '<div class="body">',
          '<p class="title">' + escapeHtml(serial) + '</p>',
          '<p class="sub">' + escapeHtml(item['Brand Name'] || '') + '</p>',
          '<p class="sub">' + escapeHtml(item['Type'] || '') + '</p>',
          '<p class="sub">Stylist: ' + escapeHtml(stylistLabel) + '</p>',
          '<p class="sub">Purpose: ' + escapeHtml(purpose === 'final' ? 'Final' : 'Review') + '</p>',
          '<p class="sub">' + escapeHtml(label) + '</p>',
          '</div>',
          '</article>'
        ].join('');
      }).join('');

      grid.innerHTML = cards;
      const cardsNodes = Array.from(grid.querySelectorAll('.card'));
      cardsNodes.forEach((card) => {
        card.addEventListener('click', () => toggleSelection(card.getAttribute('data-serial')));
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleSelection(card.getAttribute('data-serial'));
          }
        });
      });

      summaryPill.textContent = selectedSerials.size + ' selected';
      statusPill.textContent = purpose === 'final' ? stylistLabel + ', final mode' : stylistLabel + ', review mode';
      updateShareCard();
      saveState();
    }

    function toggleSelection(serial) {
      if (!serial) return;
      if (selectedSerials.has(serial)) {
        selectedSerials.delete(serial);
      } else {
        selectedSerials.add(serial);
      }
      render();
    }

    document.getElementById('userName').addEventListener('input', render);
    document.getElementById('purpose').addEventListener('change', (event) => {
      purpose = event.target.value;
      render();
    });
    document.getElementById('clearBtn').addEventListener('click', () => {
      selectedSerials = new Set();
      render();
    });

    restoreState();
    document.getElementById('purpose').value = purpose;
    render();
  </script>
</body>
</html>`;
}

function gatherMiniWebsiteMeta() {
  const nameInput = document.getElementById("miniWebsiteNameInput");
  const purposeSelect = document.getElementById("miniWebsitePurposeSelect");
  const name = (nameInput ? nameInput.value : "").trim();
  const purpose = purposeSelect ? purposeSelect.value : "review";
  setMiniWebsiteMeta(name, purpose);
  return { name: miniWebsiteMeta.name, purpose: miniWebsiteMeta.purpose };
}

async function exportMiniWebsite(meta = null) {
  showSpinner(true);

  try {
    if (!selected.length) {
      alert("Select products first, then share the mini website.");
      return;
    }

    const resolvedMeta = meta || gatherMiniWebsiteMeta();
    const inventoryItems = Array.isArray(data) && data.length
      ? data
      : await getInventoryForExport();

    const html = buildMiniWebsiteHtml(inventoryItems, selected, resolvedMeta);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const fileName = `jewellery-mini-website-${Date.now()}.html`;

    openBlobPreview(blob, fileName);
    triggerBlobDownload(blob, fileName);
    closeMiniWebsiteModal();

    alert(`Mini website created for ${resolvedMeta.name || "Guest"} with ${selected.length} selected product${selected.length === 1 ? "" : "s"}.`);
  } catch (err) {
    console.error(err);
    alert("Unable to create the mini website. Please try again.");
  } finally {
    showSpinner(false);
  }
}

function createMiniWebsiteFromModal() {
  exportMiniWebsite(gatherMiniWebsiteMeta());
}

window.exportMiniWebsite = exportMiniWebsite;
window.openMiniWebsiteModal = openMiniWebsiteModal;
window.closeMiniWebsiteModal = closeMiniWebsiteModal;
window.createMiniWebsiteFromModal = createMiniWebsiteFromModal;

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
        let sampledCount = 0;
        const SAMPLE_STRIDE = 10; // check every 10th pixel instead of every pixel

        for (let i = 0; i < pixels.length; i += 4 * SAMPLE_STRIDE) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          sampledCount++;
          if (r > 245 && g > 245 && b > 245) {
            whiteCount++;
          }
        }

        URL.revokeObjectURL(url);
        resolve(whiteCount / sampledCount > 0.99);
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
