let data = [];
let selected = [];

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

  if (url.includes("drive.google.com")) {
    let match = url.match(/[-\w]{25,}/);
    if (match) {
      return "https://drive.google.com/uc?export=view&id=" + match[0];
    }
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
        <small>${item["Type"]}</small>
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
      return `<img src="${imgUrl}">`;
    }).join("");

  area.innerHTML = html;
}

async function shareCollage() {
  console.log("Generating collage using html2canvas...");

  const container = document.getElementById("collageContainer");

  try {
    const canvas = await html2canvas(container, {
      useCORS: false,
      allowTaint: true
    });

    canvas.toBlob(async function(blob) {
      if (!blob) {
        alert("Failed to generate image");
        return;
      }

      const file = new File([blob], "collage.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Jewellery Selection",
            text: "Sharing jewellery collage"
          });
        } catch (err) {
          console.error("Share failed:", err);
          fallbackTextShare();
        }
      } else {
        fallbackTextShare();
      }
    });

  } catch (err) {
    console.error("html2canvas error:", err);
    fallbackTextShare();
  }
}

function fallbackTextShare() {
  let text = "Selected Jewellery:\n\n";

  data.filter(d => selected.includes(d["Serial No"]))
      .forEach(item => {
        text += item["Serial No"] + "\n" + item.URL + "\n\n";
      });

  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}
