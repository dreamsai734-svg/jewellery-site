let data = [];
let selected = [];
let lastBlob = null;

const API_URL = "https://script.google.com/macros/s/AKfycbwAQooWtH0hATJOg8tM3gnBCH1GOTBVwiTBRit8Sz9_WuWOrhMTf6aqJvMtnjFMoaM/exec";

/* FETCH DATA */
fetch(API_URL)
.then(res => res.json())
.then(json => {
  data = json;
  initFilter();
  render();
});

/* FILTER */
function initFilter() {
  let types = [...new Set(data.map(d => d["Type"]))];
  let filter = document.getElementById("filter");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join("");
}

/* RENDER GRID */
function render() {
  let filterValue = document.getElementById("filter").value;

  let filtered = data.filter(d => !filterValue || d["Type"] === filterValue);

  let html = "";

  filtered.forEach(item => {
    let isSelected = selected.includes(item["Serial No"]);

    html += `
      <div class="card ${isSelected ? 'selected' : ''}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${item["DisplayURL"]}">
        <p>${item["Serial No"]}</p>
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  renderSelected();
}

/* TOGGLE */
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

/* COLLAGE PREVIEW */
function renderSelected() {
  let area = document.getElementById("selectedArea");

  area.innerHTML = data
    .filter(d => selected.includes(d["Serial No"]))
    .map(item => `
      <div class="collage-item">
        <img src="${item["DisplayURL"]}">
        <div class="label">${item["Serial No"]}</div>
      </div>
    `).join("");
}

/* GENERATE COLLAGE */
async function generateCollage() {
  if (selected.length === 0) {
    alert("Select items first");
    return;
  }

  showSpinner(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ selected })
    });

    const blob = await response.blob();
    lastBlob = blob;

  } catch (err) {
    alert("Error generating collage");
  }

  showSpinner(false);
}

/* DOWNLOAD */
function downloadCollage() {
  if (!lastBlob) {
    alert("Generate collage first");
    return;
  }

  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "collage.png";
  a.click();
}

/* SHARE (MOBILE WHATSAPP) */
async function shareCollage() {
  if (!lastBlob) {
    alert("Generate collage first");
    return;
  }

  const file = new File([lastBlob], "collage.png", { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Jewellery Collage"
    });
  } else {
    alert("Sharing not supported on this device.");
  }
}

/* SPINNER */
function showSpinner(show) {
  document.getElementById("spinner").classList.toggle("hidden", !show);
}
