(function () {
  let miniWebsiteMeta = { name: "", purpose: "review" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeSerialForMatching(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
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
    const previewItems = getMiniWebsiteSelectionItems();
    const selectedCount = Array.isArray(selected) ? selected.length : 0;
    const selectionLabel = selectedCount ? `${selectedCount} selected product${selectedCount === 1 ? "" : "s"}` : "No products selected yet";

    preview.innerHTML = "";
    preview.classList.toggle("empty-state", !previewItems.length);

    const statusNode = document.createElement("p");
    statusNode.className = "preview-sub";
    statusNode.textContent = `${nameValue} · ${purpose === "final" ? "Final handoff" : "Review handoff"} • ${selectionLabel}`;
    preview.appendChild(statusNode);

    if (!previewItems.length) {
      const emptyNode = document.createElement("div");
      emptyNode.className = "mini-preview-empty";
      emptyNode.textContent = "Select products to populate the mini website preview.";
      preview.appendChild(emptyNode);
      return;
    }

    const gridNode = document.createElement("div");
    gridNode.className = "mini-preview-grid";

    previewItems.forEach(item => {
      const card = document.createElement("article");
      card.className = "mini-preview-card";
      const imageUrl = getPreviewImageUrl(item);
      const safeSerial = escapeHtml(item["Serial No"] || "");
      const safeBrand = escapeHtml(item["Brand Name"] || "");
      const safeType = escapeHtml(item["Type"] || "");
      card.innerHTML = `
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${safeSerial}" loading="lazy">` : `<div class="mini-preview-placeholder">No image available</div>`}
        <div class="mini-preview-body">
          <p class="mini-preview-title">${safeSerial}</p>
          <p class="mini-preview-sub">${safeBrand}</p>
          <p class="mini-preview-sub">${safeType}</p>
        </div>
      `;
      gridNode.appendChild(card);
    });

    preview.appendChild(gridNode);
  }

  function updateMiniWebsiteModalPreview() {
    renderMiniWebsitePreview("miniWebsiteModalPreview");
    renderMiniWebsitePreview("miniWebsitePreview");
  }

  function buildMiniWebsiteHtml(inventoryItems, initialSelectedSerials = [], options = {}) {
    const selectedSerialSet = new Set(
      (Array.isArray(initialSelectedSerials) ? initialSelectedSerials : []).map(normalizeSerialForMatching)
    );

    const filteredInventory = inventoryItems.filter(item => {
      const serial = normalizeSerialForMatching(item["Serial No"]);
      return selectedSerialSet.has(serial);
    });

    const nameValue = String(options.name || miniWebsiteMeta.name || "").trim() || "Guest";
    const purposeValue = options.purpose === "final" ? "final" : "review";
    const purposeLabel = purposeValue === "final" ? "Final handoff" : "Review handoff";

    const cardsMarkup = filteredInventory.map(item => {
      const serial = escapeHtml(item["Serial No"] || "Unknown");
      const brand = escapeHtml(item["Brand Name"] || "");
      const type = escapeHtml(item["Type"] || "");
      const imageUrl = normalizeImageUrl(item["DisplayURL"] || item["CollageURL"] || "");
      const imageTag = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${serial}" loading="lazy">`
        : `<div class="image-placeholder">No image available</div>`;

      return `
        <article class="card">
          ${imageTag}
          <div class="body">
            <p class="title">${serial}</p>
            <p class="sub">${brand}</p>
            <p class="sub">${type}</p>
          </div>
        </article>
      `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jewellery Mini Website</title>
  <style>
    :root { color-scheme: light; --bg:#f8f4ee; --panel:#fffdf9; --ink:#221b13; --muted:#6d655d; --line:#eadfce; --accent:#8b5d42; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: linear-gradient(135deg, #fef9f3 0%, var(--bg) 100%); color: var(--ink); }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px 18px 56px; }
    .hero { background: linear-gradient(135deg, #fffdf9 0%, #f9efe7 100%); border: 1px solid var(--line); border-radius: 28px; padding: 24px; box-shadow: 0 18px 48px rgba(31, 23, 19, 0.08); }
    .hero h1 { margin: 0 0 8px; font-size: clamp(1.5rem, 2.2vw, 2.25rem); }
    .hero p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
    .meta { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; margin: 20px 0 12px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(139, 93, 66, 0.1); color: var(--accent); font-weight: 700; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .card { border-radius: 18px; overflow: hidden; border: 1px solid var(--line); background: #fff; box-shadow: 0 12px 30px rgba(31, 23, 19, 0.08); }
    .card img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; }
    .image-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1 / 1; background: #f8efe7; color: var(--muted); font-size: 0.95rem; }
    .card .body { padding: 10px; }
    .card .title { font-weight: 700; margin: 0 0 4px; }
    .card .sub { color: var(--muted); font-size: 0.86rem; margin: 0; }
    .empty { padding: 28px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 16px; background: rgba(255,255,255,0.6); }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>Jewellery Mini Website</h1>
      <p>${escapeHtml(nameValue)} · ${escapeHtml(purposeLabel)}. This handoff showcases the selected products for review or final sharing.</p>
    </section>

    <div class="meta">
      <div class="pill">${escapeHtml(nameValue)}</div>
      <div class="pill">${escapeHtml(purposeLabel)}</div>
    </div>

    <div class="grid">
      ${cardsMarkup || `<div class="empty">No products selected.</div>`}
    </div>
  </div>
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
      const selectedSerials = Array.isArray(selected) ? selected.filter(Boolean) : [];

      const html = buildMiniWebsiteHtml(inventoryItems, selectedSerials, resolvedMeta);
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
})();
