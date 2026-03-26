(function () {
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Unable to read file data"));
      reader.readAsDataURL(blob);
    });
  }

  function drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, sectionLabel) {
    pdf.setFillColor(19, 28, 48);
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

    const summaryColumns = 2;
    const summaryRowsPerPage = 14;
    const summaryPerPage = summaryColumns * summaryRowsPerPage;
    const summaryPages = items.length ? Math.ceil(items.length / summaryPerPage) : 0;

    const pdf = new jsPdfApi({
      orientation: "portrait",
      unit: "pt",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 26;
    const totalPages = pageBlobs.length + summaryPages;

    for (let index = 0; index < pageBlobs.length; index++) {
      if (index > 0) {
        pdf.addPage();
      }

      drawHeader(pdf, pageWidth, margin, title, index + 1, totalPages, "Visual tray preview");

      const frameX = margin;
      const frameY = margin + 70;
      const frameWidth = pageWidth - margin * 2;
      const frameHeight = pageHeight - frameY - margin - 18;

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

      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    for (let summaryIndex = 0; summaryIndex < summaryPages; summaryIndex++) {
      pdf.addPage();
      const pageNumber = pageBlobs.length + summaryIndex + 1;
      drawHeader(pdf, pageWidth, margin, title, pageNumber, totalPages, "Serial reference sheet");

      pdf.setTextColor(30, 30, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Serial Codes", margin, margin + 90);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(96, 103, 116);
      pdf.text("Use this page for quick phone reading, screenshots, and OCR extraction.", margin, margin + 107);

      const chunk = items.slice(summaryIndex * summaryPerPage, (summaryIndex + 1) * summaryPerPage);
      const columnGap = 24;
      const columnWidth = (pageWidth - margin * 2 - columnGap) / summaryColumns;
      const cardHeight = 34;
      const startY = margin + 128;

      chunk.forEach((item, itemIndex) => {
        const col = itemIndex % summaryColumns;
        const row = Math.floor(itemIndex / summaryColumns);
        const x = margin + col * (columnWidth + columnGap);
        const y = startY + row * (cardHeight + 10);
        const serial = String(item["Serial No"] || "");
        const type = String(item["Type"] || "Jewellery");

        pdf.setFillColor(255, 250, 245);
        pdf.setDrawColor(224, 210, 196);
        pdf.roundedRect(x, y, columnWidth, cardHeight, 10, 10, "FD");
        pdf.setTextColor(31, 35, 40);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(`${summaryIndex * summaryPerPage + itemIndex + 1}. ${serial}`, x + 12, y + 14);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(104, 110, 121);
        pdf.text(type, x + 12, y + 27);
      });

      drawFooter(pdf, pageWidth, pageHeight, margin);
    }

    return pdf.output("blob");
  }

  window.JewelleryPdf = {
    buildPdfBlob: buildPdfBlob
  };
})();
