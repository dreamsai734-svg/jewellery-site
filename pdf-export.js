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

  function drawPageTexture(pdf, pageWidth, pageHeight) {
    pdf.setFillColor(248, 243, 236);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    pdf.setFillColor(242, 234, 224);
    pdf.roundedRect(24, 24, pageWidth - 48, pageHeight - 48, 28, 28, "F");

    pdf.setDrawColor(230, 220, 209);
    pdf.setLineWidth(0.4);
    for (let y = 34; y < pageHeight - 30; y += 18) {
      pdf.line(34, y, pageWidth - 34, y);
    }
  }

  function drawGemMotif(pdf, x, y, size, fill, stroke) {
    const half = size / 2;
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    pdf.setLineWidth(1);
    pdf.triangle(x, y - half, x - half, y, x + half, y, "FD");
    pdf.triangle(x, y + half, x - half, y, x + half, y, "FD");
    pdf.setDrawColor(stroke[0] - 8, stroke[1] - 8, stroke[2] - 8);
    pdf.line(x, y - half, x, y + half);
    pdf.line(x - half, y, x + half, y);
  }

  function drawOrnaments(pdf, pageWidth, pageHeight) {
    pdf.setFillColor(246, 232, 220);
    pdf.setDrawColor(223, 202, 186);
    pdf.circle(pageWidth - 66, 74, 18, "FD");
    pdf.circle(pageWidth - 38, 104, 8, "FD");
    pdf.circle(48, pageHeight - 60, 22, "FD");
    pdf.circle(84, pageHeight - 32, 10, "FD");

    drawGemMotif(pdf, pageWidth - 122, 96, 18, [255, 244, 232], [199, 169, 146]);
    drawGemMotif(pdf, 76, pageHeight - 84, 16, [255, 244, 232], [199, 169, 146]);

    pdf.setDrawColor(205, 173, 151);
    pdf.setLineWidth(1.2);
    pdf.line(pageWidth - 140, 72, pageWidth - 92, 120);
    pdf.line(pageWidth - 92, 72, pageWidth - 140, 120);
    pdf.line(56, pageHeight - 110, 100, pageHeight - 66);
    pdf.line(100, pageHeight - 110, 56, pageHeight - 66);
  }

  function drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, sectionLabel) {
    pdf.setFillColor(24, 32, 52);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 56, 16, 16, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(21);
    pdf.text(title, margin + 18, margin + 24);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(sectionLabel, margin + 18, margin + 41);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 74, margin + 41);
  }

  function drawFooter(pdf, pageWidth, pageHeight, margin) {
    pdf.setDrawColor(220, 221, 225);
    pdf.line(margin, pageHeight - margin - 10, pageWidth - margin, pageHeight - margin - 10);
    pdf.setTextColor(96, 103, 116);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Prepared for mobile viewing and WhatsApp sharing", margin, pageHeight - margin + 6);
  }

  async function drawCoverPage(pdf, pageWidth, pageHeight, margin, title, totalPages, firstBlob, itemCount) {
    drawPageTexture(pdf, pageWidth, pageHeight);
    drawOrnaments(pdf, pageWidth, pageHeight);

    pdf.setFillColor(31, 36, 49);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 132, 22, 22, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text("Jewellery Catalogue", margin + 22, margin + 28);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(30);
    pdf.text(title, margin + 22, margin + 64);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Styled for client presentation, phone preview, and WhatsApp sharing.", margin + 22, margin + 88);
    pdf.text(`Prepared on ${formatDateLabel()}  |  ${itemCount} items  |  ${totalPages} pages`, margin + 22, margin + 108);

    const imageDataUrl = await blobToDataUrl(firstBlob);
    const imageProps = pdf.getImageProperties(imageDataUrl);
    const frameX = margin + 24;
    const frameY = margin + 160;
    const frameWidth = pageWidth - margin * 2 - 48;
    const frameHeight = 360;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(223, 212, 200);
    pdf.roundedRect(frameX, frameY, frameWidth, frameHeight, 24, 24, "FD");

    const scale = Math.min((frameWidth - 26) / imageProps.width, (frameHeight - 26) / imageProps.height);
    const renderWidth = imageProps.width * scale;
    const renderHeight = imageProps.height * scale;
    const imageX = frameX + (frameWidth - renderWidth) / 2;
    const imageY = frameY + (frameHeight - renderHeight) / 2;
    pdf.addImage(imageDataUrl, "PNG", imageX, imageY, renderWidth, renderHeight, undefined, "FAST");

    pdf.setFillColor(255, 248, 241);
    pdf.roundedRect(margin + 36, pageHeight - 122, pageWidth - margin * 2 - 72, 72, 18, 18, "F");
    pdf.setTextColor(108, 59, 37);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Catalogue Notes", margin + 56, pageHeight - 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(96, 103, 116);
    pdf.text(
      "Use tray pages for product review and serial reference pages for fast code lookup.",
      margin + 56,
      pageHeight - 72,
      { maxWidth: pageWidth - margin * 2 - 120 }
    );
  }

  function drawVisualPageDetails(pdf, margin, pageWidth, frameY, frameHeight, index, totalVisualPages) {
    const badgeY = frameY + frameHeight + 12;

    pdf.setFillColor(255, 248, 241);
    pdf.roundedRect(margin, badgeY, 170, 28, 12, 12, "F");
    pdf.setTextColor(108, 59, 37);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Catalogue Spread ${index + 1} of ${totalVisualPages}`, margin + 14, badgeY + 18);

    pdf.setFillColor(241, 233, 225);
    pdf.roundedRect(pageWidth - margin - 170, badgeY, 170, 28, 12, 12, "F");
    pdf.setTextColor(96, 103, 116);
    pdf.setFont("helvetica", "normal");
    pdf.text("Client-ready catalogue page", pageWidth - margin - 156, badgeY + 18);
  }

  function normalizeTypeLabel(item) {
    const raw = String((item && item["Type"]) || "").trim();
    return raw || "Uncategorized";
  }

  function buildTypeGroupedRows(items) {
    const byType = new Map();

    items.forEach(item => {
      const type = normalizeTypeLabel(item);
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type).push(item);
    });

    const sortedTypes = [...byType.keys()].sort((a, b) => a.localeCompare(b));
    const rows = [];

    sortedTypes.forEach(type => {
      rows.push({ kind: "section", label: type });

      const typeItems = byType.get(type).slice().sort((a, b) => {
        const sa = String((a && a["Serial No"]) || "");
        const sb = String((b && b["Serial No"]) || "");
        return sa.localeCompare(sb);
      });

      typeItems.forEach(item => {
        rows.push({ kind: "item", item: item });
      });
    });

    return rows;
  }

  function paginateGroupedRows(rows, pageHeight, margin) {
    const topY = margin + 136;
    const bottomY = pageHeight - margin - 30;
    const sectionH = 38;
    const cardH = 54;
    const sectionGap = 10;
    const cardGap = 10;

    const pages = [];
    let page = [];
    let y = topY;

    rows.forEach((row, index) => {
      const isSection = row.kind === "section";
      const blockH = isSection ? sectionH : cardH;
      const gap = isSection ? sectionGap : cardGap;
      const needed = blockH + gap;

      if (y + needed > bottomY && page.length) {
        pages.push(page);
        page = [];
        y = topY;
      }

      if (isSection && y + sectionH > bottomY && page.length) {
        pages.push(page);
        page = [];
        y = topY;
      }

      page.push(row);
      y += needed;

      const nextRow = rows[index + 1];
      if (row.kind === "section" && !nextRow) {
        return;
      }
    });

    if (page.length) {
      pages.push(page);
    }

    return {
      pages: pages,
      metrics: {
        topY: topY,
        sectionH: sectionH,
        cardH: cardH,
        sectionGap: sectionGap,
        cardGap: cardGap
      }
    };
  }

  function drawSerialSectionHeader(pdf, x, y, width, label) {
    pdf.setFillColor(247, 236, 226);
    pdf.setDrawColor(223, 203, 186);
    pdf.roundedRect(x, y, width, 38, 12, 12, "FD");

    pdf.setTextColor(108, 59, 37);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(label, x + 14, y + 24);
  }

  function drawSerialItemCard(pdf, x, y, width, height, item, itemNumber) {
    const serial = String((item && item["Serial No"]) || "");
    const brand = String((item && item["Brand Name"]) || "Collection");

    pdf.setFillColor(255, 252, 248);
    pdf.setDrawColor(226, 211, 196);
    pdf.roundedRect(x, y, width, height, 12, 12, "FD");

    pdf.setFillColor(157, 92, 63);
    pdf.roundedRect(x + 10, y + 12, 48, 30, 9, 9, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`#${itemNumber}`, x + 22, y + 31);

    pdf.setTextColor(31, 35, 40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(serial, x + 70, y + 26, { maxWidth: width - 80 });

    pdf.setTextColor(104, 110, 121);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(brand, x + 70, y + 40, { maxWidth: width - 80 });
  }

  // async function buildPdfBlob(options) {
  //   const pageBlobs = Array.isArray(options && options.pageBlobs) ? options.pageBlobs : [];
  //   const items = Array.isArray(options && options.items) ? options.items : [];
  //   const title = String((options && options.title) || "Jewellery Tray");

  //   if (!pageBlobs.length) {
  //     throw new Error("Generate pages first");
  //   }

  //   const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
  //   if (!jsPdfApi) {
  //     throw new Error("PDF library not loaded");
  //   }

  //   const pdf = new jsPdfApi({
  //     orientation: "portrait",
  //     unit: "pt",
  //     format: "a4"
  //   });

  //   const pageWidth = pdf.internal.pageSize.getWidth();
  //   const pageHeight = pdf.internal.pageSize.getHeight();
  //   const margin = 26;

  //   const totalItems = items.length || pageBlobs.length * 6;
  //   const compactMode = totalItems > 300;

  //   const groupedRows = buildTypeGroupedRows(items);
  //   const groupedPagination = paginateGroupedRows(groupedRows, pageHeight, margin);
  //   const summaryPages = groupedPagination.pages.length;
  //   const totalPages = 1 + pageBlobs.length + summaryPages;

  //   await drawCoverPage(pdf, pageWidth, pageHeight, margin, title, totalPages, pageBlobs[0], totalItems);
  //   drawFooter(pdf, pageWidth, pageHeight, margin);

  //   for (let index = 0; index < pageBlobs.length; index++) {
  //     pdf.addPage();

  //     /* fill entire page with 6-section grid image (no inset margin) */
  //     const imageDataUrl = await blobToDataUrl(pageBlobs[index]);
  //     pdf.addImage(imageDataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");

  //     /* small page-number badge bottom-right */
  //     const badgeLabel = `${index + 1} / ${pageBlobs.length}`;
  //     pdf.setFontSize(8);
  //     pdf.setFont("helvetica", "normal");
  //     pdf.setTextColor(160, 148, 136);
  //     pdf.text(badgeLabel, pageWidth - 8, pageHeight - 8, { align: "right" });
  //   }

  //   for (let summaryIndex = 0; summaryIndex < summaryPages; summaryIndex++) {
  //     pdf.addPage();
  //     drawPageTexture(pdf, pageWidth, pageHeight);
  //     const pageNumber = 1 + pageBlobs.length + summaryIndex + 1;
  //     drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, "Serial reference sheet");
  //     drawOrnaments(pdf, pageWidth, pageHeight);

  //     pdf.setTextColor(30, 30, 30);
  //     pdf.setFont("helvetica", "bold");
  //     pdf.setFontSize(16);
  //     pdf.text("Serial Codes", margin, margin + 90);
  //     pdf.setFont("helvetica", "normal");
  //     pdf.setFontSize(10);
  //     pdf.setTextColor(96, 103, 116);
  //     pdf.text("Grouped by type with premium spacing for clean presentation.", margin, margin + 107);

  //     const rowsForPage = groupedPagination.pages[summaryIndex] || [];
  //     const metrics = groupedPagination.metrics;
  //     const cardWidth = pageWidth - margin * 2;
  //     let y = metrics.topY;
  //     let itemNumber = 0;

  //     for (let pageIdx = 0; pageIdx < summaryIndex; pageIdx++) {
  //       const rows = groupedPagination.pages[pageIdx] || [];
  //       rows.forEach(r => {
  //         if (r.kind === "item") {
  //           itemNumber += 1;
  //         }
  //       });
  //     }

  //     rowsForPage.forEach(row => {
  //       if (row.kind === "section") {
  //         drawSerialSectionHeader(pdf, margin, y, cardWidth, row.label);
  //         y += metrics.sectionH + metrics.sectionGap;
  //         return;
  //       }

  //       itemNumber += 1;
  //       drawSerialItemCard(pdf, margin, y, cardWidth, metrics.cardH, row.item, itemNumber);
  //       y += metrics.cardH + metrics.cardGap;
  //     });

  //     drawFooter(pdf, pageWidth, pageHeight, margin);
  //   }

  //   return pdf.output("blob");
  // }

  async function buildPdfBlob(options) {
  const pageBlobs = Array.isArray(options?.pageBlobs) ? options.pageBlobs : [];
  const items = Array.isArray(options?.items) ? options.items : [];
  const title = String(options?.title || "Jewellery Tray");

  if (!pageBlobs.length) {
    throw new Error("Generate pages first");
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

  const totalItems = items.length > 0 ? items.length : pageBlobs.length * 6;

  // ---- GROUPING + PAGINATION ----
  const groupedRows = buildTypeGroupedRows(items);
  const groupedPagination = paginateGroupedRows(groupedRows, pageHeight, margin);

  const summaryPages = groupedPagination.pages.length;
  const totalPages = 1 + pageBlobs.length + summaryPages;

  // ---- COVER PAGE ----
  await drawCoverPage(
    pdf,
    pageWidth,
    pageHeight,
    margin,
    title,
    totalPages,
    pageBlobs[0],
    totalItems
  );
  drawFooter(pdf, pageWidth, pageHeight, margin);

  // ---- PRECOMPUTE ITEM OFFSETS (O(n)) ----
  const itemOffsets = [];
  let runningCount = 0;

  groupedPagination.pages.forEach((rows, i) => {
    itemOffsets[i] = runningCount;
    rows.forEach(r => {
      if (r.kind === "item") runningCount++;
    });
  });

  // ---- IMAGE PAGE RENDERING (BATCHED) ----
  const batchSize = 10;

  for (let i = 0; i < pageBlobs.length; i += batchSize) {
    const batch = pageBlobs.slice(i, i + batchSize);

    const imageDataUrls = await Promise.all(
      batch.map(blob => blobToDataUrl(blob))
    );

    imageDataUrls.forEach((imageDataUrl, j) => {
      const index = i + j;

      pdf.addPage();
      pdf.addImage(
        imageDataUrl,
        "PNG",
        0,
        0,
        pageWidth,
        pageHeight,
        undefined,
        "FAST"
      );

      const badgeLabel = `${index + 1} / ${pageBlobs.length}`;
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(160, 148, 136);
      pdf.text(badgeLabel, pageWidth - 8, pageHeight - 8, {
        align: "right"
      });
    });
  }

  // ---- SUMMARY PAGES ----
  for (let summaryIndex = 0; summaryIndex < summaryPages; summaryIndex++) {
    try {
      pdf.addPage();

      drawPageTexture(pdf, pageWidth, pageHeight);

      const pageNumber = 2 + pageBlobs.length + summaryIndex;

      drawHeader(
        pdf,
        pageWidth,
        margin,
        title,
        pageNumber,
        totalPages,
        "Serial reference sheet"
      );

      drawOrnaments(pdf, pageWidth, pageHeight);

      pdf.setTextColor(30, 30, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Serial Codes", margin, margin + 90);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(96, 103, 116);
      pdf.text(
        "Grouped by type with premium spacing for clean presentation.",
        margin,
        margin + 107
      );

      const rowsForPage = groupedPagination.pages[summaryIndex] || [];
      const metrics = groupedPagination.metrics;

      const cardWidth = pageWidth - margin * 2;
      let y = metrics.topY;

      let itemNumber = itemOffsets[summaryIndex] || 0;

      rowsForPage.forEach(row => {
        if (row.kind === "section") {
          drawSerialSectionHeader(pdf, margin, y, cardWidth, row.label);
          y += metrics.sectionH + metrics.sectionGap;
          return;
        }

        itemNumber += 1;

        drawSerialItemCard(
          pdf,
          margin,
          y,
          cardWidth,
          metrics.cardH,
          row.item,
          itemNumber
        );

        y += metrics.cardH + metrics.cardGap;
      });

      drawFooter(pdf, pageWidth, pageHeight, margin);
    } catch (err) {
      console.error(`Summary page ${summaryIndex} failed`, err);
    }
  }

  return pdf.output("blob");
}

  window.JewelleryPdf = {
    buildPdfBlob: buildPdfBlob
  };
})();
