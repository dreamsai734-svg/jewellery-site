(function () {
  let PDF_TRACE_SEQ = 0;
  function pdfTrace(step, payload) {
    PDF_TRACE_SEQ += 1;
    const id = String(PDF_TRACE_SEQ).padStart(3, "0");
    if (payload === undefined) {
      console.log(`[PDF TRACE ${id}] ${step}`);
      return;
    }
    console.log(`[PDF TRACE ${id}] ${step}`, payload);
  }

  function summarizePdfValue(value, depth = 0) {
    if (value == null) return value;
    if (depth > 2) return "[max-depth]";

    if (value instanceof Blob) {
      return { __type: "Blob", size: value.size, type: value.type };
    }

    if (Array.isArray(value)) {
      const head = value.slice(0, 8).map(v => summarizePdfValue(v, depth + 1));
      if (value.length > 8) {
        head.push(`...(+${value.length - 8} more)`);
      }
      return head;
    }

    if (typeof value === "function") {
      return `[Function ${value.name || "anonymous"}]`;
    }

    if (typeof value !== "object") {
      return value;
    }

    const out = {};
    Object.keys(value).slice(0, 20).forEach((key) => {
      out[key] = summarizePdfValue(value[key], depth + 1);
    });
    return out;
  }

  function wrapPdfFunctionIo(name, fn) {
    return function wrappedPdfFunctionIo(...args) {
      pdfTrace(`FN ${name}:input`, summarizePdfValue(args));
      try {
        const result = fn.apply(this, args);
        if (result && typeof result.then === "function") {
          return result.then((resolved) => {
            pdfTrace(`FN ${name}:output`, summarizePdfValue(resolved));
            return resolved;
          }).catch((err) => {
            pdfTrace(`FN ${name}:error`, { message: err?.message || String(err) });
            throw err;
          });
        }
        pdfTrace(`FN ${name}:output`, summarizePdfValue(result));
        return result;
      } catch (err) {
        pdfTrace(`FN ${name}:error`, { message: err?.message || String(err) });
        throw err;
      }
    };
  }

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

  function drawGoldAccentLine(pdf, x, y, width) {
    pdf.setDrawColor(191, 150, 95);
    pdf.setLineWidth(1.1);
    pdf.line(x, y, x + width, y);
    pdf.setDrawColor(232, 205, 163);
    pdf.setLineWidth(0.45);
    pdf.line(x, y + 2, x + width, y + 2);
  }

  function drawPageTexture(pdf, pageWidth, pageHeight) {
    pdf.setFillColor(241, 232, 219);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    pdf.setFillColor(233, 221, 203);
    pdf.roundedRect(16, 16, pageWidth - 32, pageHeight - 32, 34, 34, "F");

    pdf.setFillColor(250, 245, 238);
    pdf.roundedRect(28, 28, pageWidth - 56, pageHeight - 56, 28, 28, "F");

    pdf.setFillColor(255, 251, 246);
    pdf.roundedRect(42, 42, pageWidth - 84, pageHeight - 84, 22, 22, "F");

    pdf.setDrawColor(214, 186, 149);
    pdf.setLineWidth(1.2);
    pdf.roundedRect(42, 42, pageWidth - 84, pageHeight - 84, 22, 22, "S");

    pdf.setDrawColor(236, 223, 205);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(50, 50, pageWidth - 100, pageHeight - 100, 18, 18, "S");

    pdf.setDrawColor(233, 224, 213);
    pdf.setLineWidth(0.35);
    for (let y = 58; y < pageHeight - 50; y += 22) {
      pdf.line(58, y, pageWidth - 58, y);
    }
  }

  function drawCatalogueFrame(pdf, pageWidth, pageHeight, margin, pageNumber, totalPages, title) {
    drawPageTexture(pdf, pageWidth, pageHeight);
    drawOrnaments(pdf, pageWidth, pageHeight);

    pdf.setFillColor(24, 29, 43);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 72, 18, 18, "F");
    drawGoldAccentLine(pdf, margin + 18, margin + 53, pageWidth - margin * 2 - 36);

    pdf.setFillColor(191, 150, 95);
    pdf.roundedRect(margin + 18, margin + 14, 118, 22, 8, 8, "F");
    pdf.setTextColor(42, 28, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("PRIVATE CLIENT PDF", margin + 29, margin + 29);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text(title, margin + 18, margin + 47);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Curated tray presentation", margin + 18, margin + 64);
    pdf.text(formatDateLabel(), pageWidth - margin - 18, margin + 29, { align: "right" });
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 18, margin + 47, { align: "right" });

    const panelX = margin + 12;
    const panelY = margin + 94;
    const panelWidth = pageWidth - (margin + 12) * 2;
    const panelHeight = pageHeight - panelY - margin - 58;

    pdf.setFillColor(255, 251, 247);
    pdf.setDrawColor(211, 180, 138);
    pdf.setLineWidth(1.35);
    pdf.roundedRect(panelX, panelY, panelWidth, panelHeight, 26, 26, "FD");

    pdf.setDrawColor(236, 220, 197);
    pdf.setLineWidth(0.9);
    pdf.roundedRect(panelX + 8, panelY + 8, panelWidth - 16, panelHeight - 16, 20, 20, "S");

    pdf.setFillColor(247, 240, 230);
    pdf.roundedRect(panelX + 16, panelY + 16, panelWidth - 32, 34, 12, 12, "F");
    pdf.setTextColor(125, 95, 63);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("SIGNATURE TRAY LAYOUT", panelX + 28, panelY + 38);

    const imageX = panelX + 20;
    const imageY = panelY + 62;
    const imageWidth = panelWidth - 40;
    const imageHeight = panelHeight - 108;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(231, 214, 190);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 16, 16, "FD");

    pdf.setFillColor(250, 245, 238);
    pdf.roundedRect(panelX + 16, panelY + panelHeight - 34, panelWidth - 32, 18, 9, 9, "F");
    pdf.setTextColor(132, 107, 80);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Designed for catalogue review, approvals, and direct client sharing.", panelX + 28, panelY + panelHeight - 21);

    return { imageX, imageY, imageWidth, imageHeight };
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
    pdf.setFillColor(248, 236, 221);
    pdf.setDrawColor(212, 183, 148);
    pdf.circle(pageWidth - 66, 74, 18, "FD");
    pdf.circle(pageWidth - 38, 104, 8, "FD");
    pdf.circle(48, pageHeight - 60, 22, "FD");
    pdf.circle(84, pageHeight - 32, 10, "FD");

    drawGemMotif(pdf, pageWidth - 122, 96, 18, [255, 247, 235], [193, 151, 98]);
    drawGemMotif(pdf, 76, pageHeight - 84, 16, [255, 247, 235], [193, 151, 98]);

    pdf.setDrawColor(188, 145, 95);
    pdf.setLineWidth(1.2);
    pdf.line(pageWidth - 140, 72, pageWidth - 92, 120);
    pdf.line(pageWidth - 92, 72, pageWidth - 140, 120);
    pdf.line(56, pageHeight - 110, 100, pageHeight - 66);
    pdf.line(100, pageHeight - 110, 56, pageHeight - 66);
  }

  function drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, sectionLabel) {
    pdf.setFillColor(18, 24, 40);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 64, 16, 16, "F");
    drawGoldAccentLine(pdf, margin + 14, margin + 48, pageWidth - margin * 2 - 28);

    pdf.setFillColor(191, 150, 95);
    pdf.roundedRect(pageWidth - margin - 108, margin + 12, 92, 20, 8, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(21);
    pdf.text(title, margin + 18, margin + 27);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(sectionLabel, margin + 18, margin + 57);
    pdf.setTextColor(35, 27, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("ROYAL EDITION", pageWidth - margin - 99, margin + 25);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 76, margin + 57);
  }

  function drawFooter(pdf, pageWidth, pageHeight, margin) {
    drawGoldAccentLine(pdf, margin, pageHeight - margin - 14, pageWidth - margin * 2);
    pdf.setTextColor(89, 84, 78);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Prepared for premium client presentation and WhatsApp sharing", margin, pageHeight - margin + 4);
    pdf.setTextColor(122, 97, 70);
    pdf.setFont("helvetica", "bold");
    pdf.text("Jewellery PDF Studio", pageWidth - margin, pageHeight - margin + 4, { align: "right" });
  }

  async function drawCoverPage(pdf, pageWidth, pageHeight, margin, title, totalPages, firstBlob, itemCount) {
    drawPageTexture(pdf, pageWidth, pageHeight);
    drawOrnaments(pdf, pageWidth, pageHeight);

    pdf.setFillColor(21, 27, 43);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 142, 22, 22, "F");
    drawGoldAccentLine(pdf, margin + 22, margin + 114, pageWidth - margin * 2 - 44);

    pdf.setFillColor(191, 150, 95);
    pdf.roundedRect(margin + 22, margin + 16, 138, 22, 8, 8, "F");
    pdf.setTextColor(42, 28, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("SIGNATURE CATALOGUE", margin + 30, margin + 31);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Jewellery House Presentation", margin + 22, margin + 58);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(32);
    pdf.text(title, margin + 22, margin + 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Curated with a premium royal layout for private client viewing.", margin + 22, margin + 111);
    pdf.text(`Prepared on ${formatDateLabel()}  |  ${itemCount} items  |  ${totalPages} pages`, margin + 22, margin + 130);

    const imageDataUrl = await blobToDataUrl(firstBlob);
    const imageProps = pdf.getImageProperties(imageDataUrl);
    const frameX = margin + 24;
    const frameY = margin + 160;
    const frameWidth = pageWidth - margin * 2 - 48;
    const frameHeight = 360;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(214, 185, 146);
    pdf.setLineWidth(1.2);
    pdf.roundedRect(frameX, frameY, frameWidth, frameHeight, 24, 24, "FD");
    pdf.setDrawColor(230, 212, 187);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16, 18, 18, "S");

    const scale = Math.min((frameWidth - 26) / imageProps.width, (frameHeight - 26) / imageProps.height);
    const renderWidth = imageProps.width * scale;
    const renderHeight = imageProps.height * scale;
    const imageX = frameX + (frameWidth - renderWidth) / 2;
    const imageY = frameY + (frameHeight - renderHeight) / 2;
    pdf.addImage(imageDataUrl, "PNG", imageX, imageY, renderWidth, renderHeight, undefined, "FAST");

    pdf.setFillColor(255, 247, 235);
    pdf.roundedRect(margin + 36, pageHeight - 122, pageWidth - margin * 2 - 72, 72, 18, 18, "F");
    pdf.setTextColor(95, 60, 33);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Catalogue Notes", margin + 56, pageHeight - 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(92, 97, 106);
    pdf.text(
      "Use tray spreads for visual review and share clean catalogue pages directly.",
      margin + 56,
      pageHeight - 72,
      { maxWidth: pageWidth - margin * 2 - 120 }
    );
  }



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

  const totalPages = pageBlobs.length;
  pdfTrace("P02 buildPdfBlob:pageSetup", {
    pageWidth,
    pageHeight,
    totalItems,
    totalPages
  });

  // ---- IMAGE PAGE RENDERING (BATCHED) ----
  const batchSize = 10;

  for (let i = 0; i < pageBlobs.length; i += batchSize) {
    const batch = pageBlobs.slice(i, i + batchSize);
    pdfTrace("P03 buildPdfBlob:batch", {
      batchStart: i,
      batchSize: batch.length
    });

    const imageDataUrls = await Promise.all(
      batch.map(blob => blobToDataUrl(blob))
    );

    imageDataUrls.forEach((imageDataUrl, j) => {
      const index = i + j;

      if (index > 0) pdf.addPage();
      const frame = drawCatalogueFrame(pdf, pageWidth, pageHeight, margin, index + 1, pageBlobs.length, title);
      const imageProps = pdf.getImageProperties(imageDataUrl);
      const scale = Math.min(frame.imageWidth / imageProps.width, frame.imageHeight / imageProps.height);
      const renderWidth = imageProps.width * scale;
      const renderHeight = imageProps.height * scale;
      const imageX = frame.imageX + (frame.imageWidth - renderWidth) / 2;
      const imageY = frame.imageY + (frame.imageHeight - renderHeight) / 2;

      pdf.addImage(
        imageDataUrl,
        "PNG",
        imageX,
        imageY,
        renderWidth,
        renderHeight,
        undefined,
        "FAST"
      );

      const badgeLabel = `${index + 1} / ${pageBlobs.length}`;
      pdf.setFillColor(191, 150, 95);
      pdf.roundedRect(pageWidth - margin - 84, pageHeight - margin - 38, 58, 20, 8, 8, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text(badgeLabel, pageWidth - margin - 55, pageHeight - margin - 24, {
        align: "center"
      });

      if (index < 6) {
        pdfTrace("P04 buildPdfBlob:pageDrawn", {
          index,
          badgeLabel,
          dataUrlLength: imageDataUrl.length
        });
      }
    });
  }

  const out = pdf.output("blob");
  pdfTrace("P05 buildPdfBlob:done", {
    outputSize: out.size,
    outputType: out.type
  });
  return out;
}

  async function buildCoverPdfBlob(options) {
    const items = Array.isArray(options?.items) ? options.items : [];
    const title = String(options?.title || "Jewellery Catalogue");
    const totalPages = Number(options?.totalPages || 1);
    const itemCount = items.length || Number(options?.itemCount || 0);

    const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfApi) throw new Error("PDF library not loaded");

    const pdf = new jsPdfApi({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 26;

    drawPageTexture(pdf, pageWidth, pageHeight);
    drawOrnaments(pdf, pageWidth, pageHeight);

    pdf.setFillColor(21, 27, 43);
    pdf.roundedRect(margin, margin, pageWidth - margin * 2, 142, 22, 22, "F");
    drawGoldAccentLine(pdf, margin + 22, margin + 114, pageWidth - margin * 2 - 44);

    pdf.setFillColor(191, 150, 95);
    pdf.roundedRect(margin + 22, margin + 16, 138, 22, 8, 8, "F");
    pdf.setTextColor(42, 28, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("SIGNATURE CATALOGUE", margin + 30, margin + 31);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Jewellery House Presentation", margin + 22, margin + 58);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(32);
    pdf.text(title, margin + 22, margin + 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Curated with a premium royal layout for private client viewing.", margin + 22, margin + 111);
    pdf.text(`Prepared on ${formatDateLabel()}  |  ${itemCount} items  |  ${totalPages} pages`, margin + 22, margin + 130);

    const frameX = margin + 24;
    const frameY = margin + 170;
    const frameWidth = pageWidth - margin * 2 - 48;
    const frameHeight = 340;

    pdf.setFillColor(248, 243, 237);
    pdf.setDrawColor(214, 185, 146);
    pdf.setLineWidth(1.2);
    pdf.roundedRect(frameX, frameY, frameWidth, frameHeight, 24, 24, "FD");
    pdf.setDrawColor(230, 212, 187);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16, 18, 18, "S");

    pdf.setTextColor(191, 150, 95);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.text(title, frameX + frameWidth / 2, frameY + frameHeight / 2 - 20, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(140, 110, 75);
    pdf.text(`${itemCount} Selected Items`, frameX + frameWidth / 2, frameY + frameHeight / 2 + 20, { align: "center" });
    pdf.setFontSize(10);
    pdf.setTextColor(160, 140, 115);
    pdf.text(formatDateLabel(), frameX + frameWidth / 2, frameY + frameHeight / 2 + 46, { align: "center" });

    pdf.setFillColor(255, 247, 235);
    pdf.roundedRect(margin + 36, pageHeight - 122, pageWidth - margin * 2 - 72, 72, 18, 18, "F");
    pdf.setTextColor(95, 60, 33);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Catalogue Notes", margin + 56, pageHeight - 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(92, 97, 106);
    pdf.text(
      "Use tray spreads for visual review and share clean catalogue pages directly.",
      margin + 56,
      pageHeight - 72,
      { maxWidth: pageWidth - margin * 2 - 120 }
    );

    drawFooter(pdf, pageWidth, pageHeight, margin);

    return pdf.output("blob");
  }

  blobToDataUrl = wrapPdfFunctionIo("blobToDataUrl", blobToDataUrl);
  formatDateLabel = wrapPdfFunctionIo("formatDateLabel", formatDateLabel);
  drawGoldAccentLine = wrapPdfFunctionIo("drawGoldAccentLine", drawGoldAccentLine);
  drawPageTexture = wrapPdfFunctionIo("drawPageTexture", drawPageTexture);
  drawCatalogueFrame = wrapPdfFunctionIo("drawCatalogueFrame", drawCatalogueFrame);
  drawGemMotif = wrapPdfFunctionIo("drawGemMotif", drawGemMotif);
  drawOrnaments = wrapPdfFunctionIo("drawOrnaments", drawOrnaments);
  drawHeader = wrapPdfFunctionIo("drawHeader", drawHeader);
  drawFooter = wrapPdfFunctionIo("drawFooter", drawFooter);
  drawCoverPage = wrapPdfFunctionIo("drawCoverPage", drawCoverPage);
  buildPdfBlob = wrapPdfFunctionIo("buildPdfBlob", buildPdfBlob);
  buildCoverPdfBlob = wrapPdfFunctionIo("buildCoverPdfBlob", buildCoverPdfBlob);

  window.JewelleryPdf = {
    buildPdfBlob: buildPdfBlob,
    buildCoverPdfBlob: buildCoverPdfBlob
  };
})();
