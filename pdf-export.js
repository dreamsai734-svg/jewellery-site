(function () {
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Unable to read file data"));
      reader.readAsDataURL(blob);
    });
  }

  function formatDateLabel() {
    return new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  /* ---------- PREMIUM BACKGROUND ---------- */
  function drawPageTexture(pdf, w, h) {
    pdf.setFillColor(245, 240, 235);
    pdf.rect(0, 0, w, h, "F");

    pdf.setFillColor(255, 255, 255);
    pdf.setGState(new pdf.GState({ opacity: 0.35 }));
    pdf.rect(0, 0, w, h / 2, "F");

    pdf.setGState(new pdf.GState({ opacity: 1 }));
  }

  /* ---------- HEADER ---------- */
  function drawHeader(pdf, w, title, pageNumber, totalPages, label) {
    pdf.setFillColor(18, 18, 18);
    pdf.rect(0, 0, w, 70, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(title, 30, 40);

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(label, 30, 58);
    pdf.text(`Page ${pageNumber}/${totalPages}`, w - 30, 58, { align: "right" });
  }

  /* ---------- COVER PAGE ---------- */
  async function drawCoverPage(pdf, w, h, title, totalPages, firstBlob, itemCount) {
    const img = await blobToDataUrl(firstBlob);

    // FULL HERO IMAGE
    pdf.addImage(img, "PNG", 0, 0, w, h, undefined, "FAST");

    // DARK OVERLAY
    pdf.setFillColor(0, 0, 0);
    pdf.setGState(new pdf.GState({ opacity: 0.5 }));
    pdf.rect(0, 0, w, h, "F");
    pdf.setGState(new pdf.GState({ opacity: 1 }));

    // TEXT
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(40);
    pdf.text(title, 50, h / 2);

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "normal");
    pdf.text("Luxury Jewellery Catalogue", 50, h / 2 + 35);

    pdf.setFontSize(12);
    pdf.text(
      `${itemCount} Designs  •  ${totalPages} Pages  •  ${formatDateLabel()}`,
      50,
      h / 2 + 65
    );

    // BOTTOM STRIP
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, h - 70, w, 70, "F");

    pdf.setTextColor(90, 90, 90);
    pdf.setFontSize(11);
    pdf.text("Crafted for premium client presentation", 50, h - 30);
  }

  /* ---------- GROUPING ---------- */
  function normalizeTypeLabel(item) {
    return String(item?.["Type"] || "").trim() || "Uncategorized";
  }

  function buildRows(items) {
    const map = new Map();

    items.forEach(i => {
      const type = normalizeTypeLabel(i);
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(i);
    });

    const rows = [];

    [...map.keys()].sort().forEach(type => {
      rows.push({ kind: "section", label: type });

      map.get(type)
        .sort((a, b) =>
          String(a["Serial No"] || "").localeCompare(String(b["Serial No"] || ""))
        )
        .forEach(item => rows.push({ kind: "item", item }));
    });

    return rows;
  }

  /* ---------- PAGINATION ---------- */
  function paginate(rows, h) {
    const top = 120;
    const bottom = h - 40;

    const pages = [];
    let page = [];
    let y = top;

    rows.forEach(r => {
      const height = r.kind === "section" ? 40 : 60;

      if (y + height > bottom && page.length) {
        pages.push(page);
        page = [];
        y = top;
      }

      page.push(r);
      y += height + 10;
    });

    if (page.length) pages.push(page);

    return pages;
  }

  /* ---------- DRAW CARDS ---------- */
  function drawSection(pdf, x, y, w, label) {
    pdf.setFillColor(240, 230, 220);
    pdf.roundedRect(x, y, w, 40, 12, 12, "F");

    pdf.setTextColor(120, 70, 40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(label, x + 15, y + 25);
  }

  function drawCard(pdf, x, y, w, item, index) {
    const h = 60;

    // SHADOW
    pdf.setFillColor(0, 0, 0);
    pdf.setGState(new pdf.GState({ opacity: 0.05 }));
    pdf.roundedRect(x + 4, y + 4, w, h, 12, 12, "F");
    pdf.setGState(new pdf.GState({ opacity: 1 }));

    // CARD
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(210, 210, 210);
    pdf.roundedRect(x, y, w, h, 12, 12, "FD");

    // NUMBER BADGE
    pdf.setFillColor(150, 90, 60);
    pdf.roundedRect(x + 10, y + 15, 40, 30, 8, 8, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.text(`#${index}`, x + 20, y + 35);

    // TEXT
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(String(item["Serial No"] || ""), x + 60, y + 28);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text(String(item["Brand Name"] || ""), x + 60, y + 45);
  }

  /* ---------- MAIN BUILDER ---------- */
  async function buildPdfBlob(options) {
    const pageBlobs = options.pageBlobs || [];
    const items = options.items || [];
    const title = options.title || "Jewellery Catalogue";

    if (!pageBlobs.length) throw new Error("No pages");

    const jsPdfApi = window.jspdf?.jsPDF;
    if (!jsPdfApi) throw new Error("jsPDF missing");

    const pdf = new jsPdfApi({
      orientation: "portrait",
      unit: "pt",
      format: [1080, 1920] // MOBILE OPTIMIZED
    });

    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();

    const rows = buildRows(items);
    const summaryPages = paginate(rows, h);
    const totalPages = 1 + pageBlobs.length + summaryPages.length;

    /* COVER */
    await drawCoverPage(pdf, w, h, title, totalPages, pageBlobs[0], items.length);

    /* IMAGE PAGES */
    for (let i = 0; i < pageBlobs.length; i++) {
      pdf.addPage();

      const img = await blobToDataUrl(pageBlobs[i]);
      pdf.addImage(img, "PNG", 0, 0, w, h, undefined, "FAST");

      // subtle overlay
      pdf.setFillColor(0, 0, 0);
      pdf.setGState(new pdf.GState({ opacity: 0.08 }));
      pdf.rect(0, 0, w, h, "F");
      pdf.setGState(new pdf.GState({ opacity: 1 }));

      pdf.setFontSize(10);
      pdf.setTextColor(180, 180, 180);
      pdf.text(`${i + 1}/${pageBlobs.length}`, w - 20, h - 20, { align: "right" });
    }

    /* SERIAL PAGES */
    let count = 0;

    for (let p = 0; p < summaryPages.length; p++) {
      pdf.addPage();

      drawPageTexture(pdf, w, h);
      drawHeader(pdf, w, title, pageBlobs.length + p + 2, totalPages, "Serial Reference");

      let y = 120;

      summaryPages[p].forEach(r => {
        if (r.kind === "section") {
          drawSection(pdf, 40, y, w - 80, r.label);
          y += 50;
        } else {
          count++;
          drawCard(pdf, 40, y, w - 80, r.item, count);
          y += 70;
        }
      });
    }

    return pdf.output("blob");
  }

  window.JewelleryPdf = {
    buildPdfBlob
  };
})();
