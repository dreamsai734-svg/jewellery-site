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
      // Ensure getPreviewImageUrl is in scope globally
      const imageUrl = typeof getPreviewImageUrl === 'function' ? getPreviewImageUrl(item) : "";
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
    
    // Determine if we should show checkboxes (only in review mode)
    const isReview = purposeValue === "review";

    const cardsMarkup = filteredInventory.map(item => {
      const serial = escapeHtml(item["Serial No"] || "Unknown");
      const brand = escapeHtml(item["Brand Name"] || "");
      const type = escapeHtml(item["Type"] || "");
      
      // Ensure normalizeImageUrl is in scope globally
      let imageUrl = "";
      if (typeof normalizeImageUrl === 'function') {
         imageUrl = normalizeImageUrl(item["DisplayURL"] || item["CollageURL"] || "");
      } else {
         imageUrl = item["DisplayURL"] || item["CollageURL"] || "";
      }
      
      const imageTag = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${serial}" loading="lazy">`
        : `<div class="image-placeholder">No image available</div>`;

      // Conditionally inject checkboxes if it's a review link
      const checkboxHtml = isReview ? `
        <label class="checkbox-label">
          <input type="checkbox" class="product-checkbox" value="${serial}">
          Select this item
        </label>
      ` : "";

      return `
        <article class="card">
          ${imageTag}
          <div class="body">
            <p class="title">${serial}</p>
            <p class="sub">${brand}</p>
            <p class="sub">${type}</p>
            ${checkboxHtml}
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
    .hero { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; background: linear-gradient(135deg, #fffdf9 0%, #f9efe7 100%); border: 1px solid var(--line); border-radius: 28px; padding: 24px 32px; box-shadow: 0 18px 48px rgba(31, 23, 19, 0.08); }
    .hero-text h1 { margin: 0 0 8px; font-size: clamp(1.5rem, 2.2vw, 2.25rem); }
    .hero-text p { margin: 0; color: var(--muted); line-height: 1.6; }
    .meta { display: flex; justify-content: flex-start; gap: 10px; align-items: center; flex-wrap: wrap; margin: 20px 0 12px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(139, 93, 66, 0.1); color: var(--accent); font-weight: 700; }
    
    /* Submit Button Styles */
    .submit-btn { padding: 14px 28px; background: var(--accent); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(139, 93, 66, 0.2); transition: all 0.2s; white-space: nowrap; }
    .submit-btn:hover { background: #7a4f37; transform: translateY(-1px); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .card { border-radius: 18px; overflow: hidden; border: 1px solid var(--line); background: #fff; box-shadow: 0 12px 30px rgba(31, 23, 19, 0.08); }
    .card img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; }
    .image-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1 / 1; background: #f8efe7; color: var(--muted); font-size: 0.95rem; }
    .card .body { padding: 12px; }
    .card .title { font-weight: 700; margin: 0 0 4px; }
    .card .sub { color: var(--muted); font-size: 0.86rem; margin: 0 0 2px; }
    
    /* Checkbox Container Styles */
    .checkbox-label { display: flex; align-items: center; gap: 10px; margin-top: 12px; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--ink); padding: 10px; background: #f9efe7; border-radius: 8px; border: 1px solid var(--line); transition: background 0.2s; }
    .checkbox-label:hover { background: #f0e2d5; }
    .product-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent); }
    
    .empty { padding: 28px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 16px; background: rgba(255,255,255,0.6); grid-column: 1 / -1; }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="hero-text">
        <h1>Jewellery Mini Website</h1>
        <p>${escapeHtml(nameValue)} · ${escapeHtml(purposeLabel)}.</p>
        <p>${isReview ? 'Select the products you approve and click Submit.' : 'This handoff showcases the selected products.'}</p>
      </div>
      
      ${isReview ? `<button id="submitBtn" class="submit-btn">Submit Selections</button>` : ""}
    </section>

    <div class="meta">
      <div class="pill">${escapeHtml(nameValue)}</div>
      <div class="pill">${escapeHtml(purposeLabel)}</div>
    </div>

    <div class="grid">
      ${cardsMarkup || `<div class="empty">No products selected.</div>`}
    </div>
  </div>

  ${isReview ? `
  <script>
    document.getElementById('submitBtn').addEventListener('click', async () => {
      const checkboxes = document.querySelectorAll('.product-checkbox:checked');
      const selectedSerials = Array.from(checkboxes).map(cb => cb.value);

      if (selectedSerials.length === 0) {
        alert("Please select at least one item before submitting.");
        return;
      }

      const btn = document.getElementById('submitBtn');
      btn.innerText = "Submitting...";
      btn.disabled = true;

      try {
        // IMPORTANT: Replace this URL with your Google Apps Script Web App URL
        const scriptUrl = 'YOUR_WEBHOOK_URL_HERE'; 
        
        await fetch(scriptUrl, {
          method: 'POST',
          // Set no-cors if you encounter CORS issues, though JSON response won't be readable
          body: JSON.stringify({
            reviewerName: "${escapeHtml(nameValue)}",
            selectedSerials: selectedSerials
          })
        });
        
        alert("Selections submitted successfully!");
        btn.innerText = "Submitted ✓";
        btn.style.background = "#2e7d32"; // Green success state
      } catch (err) {
        console.error(err);
        alert("There was an issue submitting. Please try again.");
        btn.innerText = "Submit Selections";
        btn.disabled = false;
      }
    });
  </script>
  ` : ""}
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
    if (typeof showSpinner === 'function') showSpinner(true);

    try {
      if (!selected || !selected.length) {
        alert("Select products first, then share the mini website.");
        return;
      }

      const resolvedMeta = meta || gatherMiniWebsiteMeta();
      const inventoryItems = Array.isArray(data) && data.length
        ? data
        : (typeof getInventoryForExport === 'function' ? await getInventoryForExport() : []);
      
      const selectedSerials = Array.isArray(selected) ? selected.filter(Boolean) : [];

      const html = buildMiniWebsiteHtml(inventoryItems, selectedSerials, resolvedMeta);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const fileName = `jewellery-mini-website-${Date.now()}.html`;

      if (typeof openBlobPreview === 'function') openBlobPreview(blob, fileName);
      if (typeof triggerBlobDownload === 'function') triggerBlobDownload(blob, fileName);
      
      closeMiniWebsiteModal();

      alert(`Mini website created for ${resolvedMeta.name || "Guest"} with ${selected.length} selected product${selected.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      alert("Unable to create the mini website. Please try again.");
    } finally {
      if (typeof showSpinner === 'function') showSpinner(false);
    }
  }

  function createMiniWebsiteFromModal() {
    exportMiniWebsite(gatherMiniWebsiteMeta());
  }

  window.exportMiniWebsite = exportMiniWebsite;
  window.openMiniWebsiteModal = openMiniWebsiteModal;
  window.closeMiniWebsiteModal = closeMiniWebsiteModal;
  window.createMiniWebsiteFromModal = createMiniWebsiteFromModal;
  window.updateMiniWebsiteModalPreview = updateMiniWebsiteModalPreview;
})();