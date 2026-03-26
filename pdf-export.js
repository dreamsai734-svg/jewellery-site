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

  function fitTextSize(pdf, text, maxWidth, startSize, minSize) {
    let size = startSize;
    while (size > minSize) {
      pdf.setFontSize(size);
      if (pdf.getTextWidth(text) <= maxWidth) {
        return size;
      }
      size -= 1;
    }
    return minSize;
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
      "Use tray pages for product review, then use one-code snapshot pages for clean mobile screenshots.",
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

  function drawSnapshotCard(pdf, margin, pageWidth, pageHeight, item, index, totalItems) {
    const cardX = margin + 20;
    const cardY = margin + 108;
    const cardWidth = pageWidth - (margin + 20) * 2;
    const cardHeight = pageHeight - cardY - margin - 54;
    const serial = String(item["Serial No"] || "").toUpperCase();
    const spacedSerial = serial.split("").join(" ");
    const type = String(item["Type"] || "Jewellery");
    const brand = String(item["Brand Name"] || "Collection");

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(221, 208, 193);
    pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 24, 24, "FD");

    pdf.setFillColor(250, 241, 232);
    pdf.roundedRect(cardX + 16, cardY + 16, cardWidth - 32, 64, 16, 16, "F");
    pdf.setTextColor(108, 59, 37);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Mobile Snapshot Serial Card", cardX + 28, cardY + 40);
    pdf.setTextColor(110, 117, 128);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Card ${index + 1} of ${totalItems}  |  ${type}  |  ${brand}`, cardX + 28, cardY + 58, {
      maxWidth: cardWidth - 60
    });

    const serialBoxY = cardY + 106;
    const serialBoxHeight = 252;
    pdf.setFillColor(255, 252, 248);
    pdf.setDrawColor(214, 194, 175);
    pdf.roundedRect(cardX + 22, serialBoxY, cardWidth - 44, serialBoxHeight, 20, 20, "FD");

    pdf.setDrawColor(197, 169, 144);
    pdf.setLineWidth(1);
    pdf.setLineDashPattern([5, 4], 0);
    pdf.roundedRect(cardX + 34, serialBoxY + 16, cardWidth - 68, serialBoxHeight - 32, 14, 14, "S");
    pdf.setLineDashPattern([], 0);

    pdf.setTextColor(26, 32, 48);
    pdf.setFont("courier", "bold");
    const maxCodeWidth = cardWidth - 90;
    const serialSize = fitTextSize(pdf, serial, maxCodeWidth, 52, 28);
    pdf.setFontSize(serialSize);
    pdf.text(serial, cardX + cardWidth / 2, serialBoxY + serialBoxHeight / 2 - 12, { align: "center" });

    pdf.setFont("courier", "normal");
    const assistSize = fitTextSize(pdf, spacedSerial, maxCodeWidth, 22, 12);
    pdf.setFontSize(assistSize);
    pdf.setTextColor(77, 86, 101);
    pdf.text(spacedSerial, cardX + cardWidth / 2, serialBoxY + serialBoxHeight / 2 + 36, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(130, 105, 85);
    pdf.text("ONE SERIAL PER SCREENSHOT", cardX + cardWidth / 2, serialBoxY + serialBoxHeight - 16, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(96, 103, 116);
    pdf.setFontSize(10);
    pdf.text("Take one screenshot of this page to capture exactly one serial code.", cardX + 32, serialBoxY + serialBoxHeight + 34, {
      maxWidth: cardWidth - 64
    });

    drawGemMotif(pdf, cardX + 46, cardY + cardHeight - 44, 12, [255, 245, 233], [198, 169, 145]);
    drawGemMotif(pdf, cardX + cardWidth - 46, cardY + cardHeight - 44, 12, [255, 245, 233], [198, 169, 145]);
  }

  function drawCompactModeNoticePage(pdf, pageWidth, pageHeight, margin, totalItems) {
    drawPageTexture(pdf, pageWidth, pageHeight);
    drawOrnaments(pdf, pageWidth, pageHeight);

    const boxX = margin + 28;
    const boxY = margin + 110;
    const boxW = pageWidth - (margin + 28) * 2;
    const boxH = pageHeight - boxY - margin - 70;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(220, 207, 192);
    pdf.roundedRect(boxX, boxY, boxW, boxH, 22, 22, "FD");

    pdf.setTextColor(31, 36, 49);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("Large Export Compact Mode", boxX + 26, boxY + 48);

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(96, 103, 116);
    pdf.setFontSize(12);
    pdf.text(
      `This PDF contains ${totalItems} items. To keep generation stable and file size practical, one-serial-per-page snapshot cards were skipped automatically.`,
      boxX + 26,
      boxY + 82,
      { maxWidth: boxW - 52 }
    );

    pdf.setFillColor(250, 241, 232);
    pdf.roundedRect(boxX + 22, boxY + 138, boxW - 44, 116, 16, 16, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(108, 59, 37);
    pdf.setFontSize(13);
    pdf.text("Best practice for 1000+ items", boxX + 40, boxY + 166);

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(96, 103, 116);
    pdf.setFontSize(11);
    pdf.text("1. Share this compact catalogue PDF.", boxX + 40, boxY + 194);
    pdf.text("2. Create smaller final-tray PDFs for approved serial groups.", boxX + 40, boxY + 214);
    pdf.text("3. Use snapshot serial pages only for smaller batches.", boxX + 40, boxY + 234);
  }

  async function buildPdfBlob(options) {
    const pageBlobs = Array.isArray(options && options.pageBlobs) ? options.pageBlobs : [];
    const items = Array.isArray(options && options.items) ? options.items : [];
    const title = String((options && options.title) || "Jewellery Tray");

    if (!pageBlobs.length) {
      throw new Error("Generate pages first");
    }

    const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfApi) {
      throw new Error("PDF library not loaded");
    }

    const totalItems = items.length || pageBlobs.length * 9;
    const compactMode = totalItems > 300;

    const summaryColumns = compactMode ? 3 : 2;
    const summaryRowsPerPage = compactMode ? 15 : 10;
    const summaryPerPage = summaryColumns * summaryRowsPerPage;
    const summaryPages = items.length ? Math.ceil(items.length / summaryPerPage) : 0;
    const snapshotPages = compactMode ? 0 : items.length;
    const compactNoticePages = compactMode && items.length ? 1 : 0;

    const pdf = new jsPdfApi({
      orientation: "portrait",
      unit: "pt",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 26;
    const totalPages = 1 + pageBlobs.length + summaryPages + compactNoticePages + snapshotPages;

    await drawCoverPage(pdf, pageWidth, pageHeight, margin, title, totalPages, pageBlobs[0], totalItems);
    drawFooter(pdf, pageWidth, pageHeight, margin);

    for (let index = 0; index < pageBlobs.length; index++) {
      pdf.addPage();
      drawPageTexture(pdf, pageWidth, pageHeight);
      drawHeader(pdf, pageWidth, margin, title, index + 2, totalPages, "Visual tray preview");
      drawOrnaments(pdf, pageWidth, pageHeight);

      const frameX = margin;
      const frameY = margin + 70;
      const frameWidth = pageWidth - margin * 2;
      const frameHeight = pageHeight - frameY - margin - 62;

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(216, 220, 227);
      pdf.roundedRect(frameX, frameY, frameWidth, frameHeight, 14, 14, "FD");

      const imageDataUrl = await blobToDataUrl(pageBlobs[index]);
      const imageProps = pdf.getImageProperties(imageDataUrl);
      const availableWidth = frameWidth - 24;
      const availableHeight = frameHeight - 24;
      const scale = Math.min(availableWidth / imageProps.width, availableHeight / imageProps.height);
      const renderWidth = imageProps.width * scale;
      const renderHeight = imageProps.height * scale;
      const imageX = frameX + (frameWidth - renderWidth) / 2;
      const imageY = frameY + (frameHeight - renderHeight) / 2;
      pdf.addImage(imageDataUrl, "PNG", imageX, imageY, renderWidth, renderHeight, undefined, "FAST");

      drawVisualPageDetails(pdf, margin, pageWidth, frameY, frameHeight, index, pageBlobs.length);
      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    for (let summaryIndex = 0; summaryIndex < summaryPages; summaryIndex++) {
      pdf.addPage();
      drawPageTexture(pdf, pageWidth, pageHeight);
      const pageNumber = 1 + pageBlobs.length + summaryIndex + 1;
      drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, "Serial reference sheet");
      drawOrnaments(pdf, pageWidth, pageHeight);

      pdf.setTextColor(30, 30, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Serial Codes", margin, margin + 90);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(96, 103, 116);
      pdf.text("Use this page for quick phone reading, screenshots, and OCR extraction.", margin, margin + 107);

      const chunk = items.slice(summaryIndex * summaryPerPage, (summaryIndex + 1) * summaryPerPage);
      const columnGap = compactMode ? 12 : 24;
      const columnWidth = (pageWidth - margin * 2 - columnGap) / summaryColumns;
      const rowGap = compactMode ? 8 : 12;
      const startY = margin + 128;
      const summaryBottom = pageHeight - margin - 36;
      const availableSummaryHeight = summaryBottom - startY;
      const cardHeight = Math.max(34, Math.floor((availableSummaryHeight - (summaryRowsPerPage - 1) * rowGap) / summaryRowsPerPage));

      chunk.forEach((item, itemIndex) => {
        const col = itemIndex % summaryColumns;
        const row = Math.floor(itemIndex / summaryColumns);
        const x = margin + col * (columnWidth + columnGap);
        const y = startY + row * (cardHeight + rowGap);
        const serial = String(item["Serial No"] || "");
        const type = String(item["Type"] || "Jewellery");
        const brand = String(item["Brand Name"] || "Collection");

        pdf.setFillColor(255, 250, 245);
        pdf.setDrawColor(224, 210, 196);
        pdf.roundedRect(x, y, columnWidth, cardHeight, 12, 12, "FD");

        if (!compactMode) {
          pdf.setFillColor(157, 92, 63);
          pdf.roundedRect(x + 10, y + 10, 54, 26, 10, 10, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(`#${summaryIndex * summaryPerPage + itemIndex + 1}`, x + 24, y + 27);
        }

        pdf.setTextColor(31, 35, 40);
        pdf.setFontSize(compactMode ? 10 : 13);
        pdf.setFont("helvetica", "bold");
        const serialX = compactMode ? x + 10 : x + 76;
        const serialY = compactMode ? y + 18 : y + 22;
        pdf.text(serial, serialX, serialY, { maxWidth: compactMode ? columnWidth - 16 : columnWidth - 88 });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(compactMode ? 8 : 9);
        pdf.setTextColor(104, 110, 121);
        const metaX = compactMode ? x + 10 : x + 76;
        const metaY = compactMode ? y + 30 : y + 40;
        pdf.text(`${type} · ${brand}`, metaX, metaY, { maxWidth: compactMode ? columnWidth - 16 : columnWidth - 88 });
      });

      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    if (compactNoticePages) {
      pdf.addPage();
      const pageNumber = 1 + pageBlobs.length + summaryPages + 1;
      drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, "Compact export notice");
      drawCompactModeNoticePage(pdf, pageWidth, pageHeight, margin, totalItems);
      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    for (let snapshotIndex = 0; snapshotIndex < items.length; snapshotIndex++) {
      if (compactMode) {
        break;
      }
      pdf.addPage();
      drawPageTexture(pdf, pageWidth, pageHeight);
      const pageNumber = 1 + pageBlobs.length + summaryPages + compactNoticePages + snapshotIndex + 1;
      drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, "Mobile snapshot serial page");
      drawOrnaments(pdf, pageWidth, pageHeight);
      drawSnapshotCard(pdf, margin, pageWidth, pageHeight, items[snapshotIndex], snapshotIndex, items.length);
      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    return pdf.output("blob");
  }

  window.JewelleryPdf = {
    buildPdfBlob: buildPdfBlob
  };
})();
