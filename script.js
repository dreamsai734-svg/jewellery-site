let data = [];
let selected = [];
let lastCanvas = null;

const API_URL = "https://script.google.com/macros/s/AKfycbxurQyyCGIRT2nTBTEZJMBi3lCuAHH1j3wC3vOjk7d3gAqqTiFVIgMyw37pvt6E4Q/exec";

fetch(API_URL)
.then(res => res.json())
.then(json => {
  data = json;
  initFilter();
  render();
});

function initFilter() {
  let types = [...new Set(data.map(d => d["Type"]))];
  let filter = document.getElementById("filter");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join("");
}

function convertToThumbnail(url) {
  if (!url) return "";

  // Extract file ID
  let match = url.match(/[-\w]{25,}/);

  if (match) {
    let id = match[0];

    return `https://drive.usercontent.google.com/download?id=${id}&export=view&authuser=0`;
  }

  return url;
}

function render() {
  let filterValue = document.getElementById("filter").value;
  let filtered = data.filter(d => !filterValue || d["Type"] === filterValue);

  let html = "";

  filtered.forEach(item => {
    let isSelected = selected.includes(item["Serial No"]);
    let imgUrl = convertToThumbnail(item.URL);

    html += `
      <div class="card ${isSelected ? 'selected' : ''}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${imgUrl}">
        <p>${item["Serial No"]}</p>
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  renderSelected();
}

function toggle(id) {
  if (selected.includes(id)) {
    selected = selected.filter(x => x !== id);
  } else {
    if (selected.length >= 9) {
      alert("Maximum 9 items allowed");
      return;
    }
    selected.push(id);
  }
  render();
}

function renderSelected() {
  let area = document.getElementById("selectedArea");

  let html = data
    .filter(d => selected.includes(d["Serial No"]))
    .map(item => {
      let imgUrl = convertToThumbnail(item.URL);
      return `
        <div class="collage-item">
          <img src="${imgUrl}">
          <div class="label">${item["Serial No"]}</div>
        </div>
      `;
    }).join("");

  area.innerHTML = html;
}

/* =========================
   COLLAGE GENERATION
========================= */

async function generateCollage() {
  if (selected.length === 0) {
    alert("Select items first");
    return;
  }

  showSpinner(true);

  const container = document.getElementById("collageContainer");

  try {
    const canvas = await html2canvas(container, {
      useCORS: false,
      allowTaint: true,
      scale: 2 // better quality
    });

    lastCanvas = canvas;

  } catch (err) {
    console.error(err);
    alert("Error generating collage");
  }

  showSpinner(false);
}

/* =========================
   DOWNLOAD
========================= */

function downloadCollage() {
  if (!lastCanvas) {
    alert("Generate collage first");
    return;
  }

  const link = document.createElement("a");
  link.download = "collage.png";
  link.href = lastCanvas.toDataURL("image/png");
  link.click();
}

/* =========================
   SHARE
========================= */

async function shareCollage() {
  if (!lastCanvas) {
    alert("Generate collage first");
    return;
  }

  lastCanvas.toBlob(async function(blob) {
    const file = new File([blob], "collage.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Jewellery Collage"
        });
      } catch (err) {
        fallbackTextShare();
      }
    } else {
      fallbackTextShare();
    }
  });
}

/* =========================
   FALLBACK
========================= */

function fallbackTextShare() {
  let text = "Selected Jewellery:\n\n";

  data.filter(d => selected.includes(d["Serial No"]))
      .forEach(item => {
        text += item["Serial No"] + "\n" + item.URL + "\n\n";
      });

  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

/* =========================
   SPINNER
========================= */

function showSpinner(show) {
  document.getElementById("spinner").classList.toggle("hidden", !show);
}
