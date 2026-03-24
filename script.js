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
    let match = url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match) {
      return "https://drive.google.com/thumbnail?id=" + match[1];
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
      alert("Maximum 9 items allowed for collage");
      return;
    }
    selected.push(id);
  }
  render();
}

function renderSelected() {
  let area = document.getElementById("selectedArea");
  let html = "";

  data.filter(d => selected.includes(d["Serial No"]))
      .forEach(item => {
        let imgUrl = convertToThumbnail(item.URL);
        html += `<img src="${imgUrl}" title="${item["Serial No"]}">`;
      });

  area.innerHTML = html;
}

async function shareCollage() {
  let selectedItems = data.filter(d => selected.includes(d["Serial No"]));

  if (selectedItems.length === 0) {
    alert("No items selected");
    return;
  }

  selectedItems = selectedItems.slice(0, 9);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const size = 300;
  const cols = 3;
  const rows = Math.ceil(selectedItems.length / 3);

  canvas.width = cols * size;
  canvas.height = rows * size;

  let images = [];

  for (let item of selectedItems) {
    let img = new Image();
    img.crossOrigin = "anonymous";
    img.src = convertToThumbnail(item.URL);
    images.push({ img, serial: item["Serial No"] });

    await new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }

  images.forEach((obj, index) => {
    let col = index % cols;
    let row = Math.floor(index / cols);

    let x = col * size;
    let y = row * size;

    ctx.drawImage(obj.img, x, y, size, size);

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y + size - 30, size, 30);

    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText(obj.serial, x + 10, y + size - 10);
  });

  canvas.toBlob(async function(blob) {
    const file = new File([blob], "collage.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Jewellery Selection",
          text: "Sharing jewellery collage"
        });
      } catch (err) {
        fallbackTextShare();
      }
    } else {
      fallbackTextShare();
    }
  });
}

function fallbackTextShare() {
  let text = "Selected Jewellery:\n\n";

  data.filter(d => selected.includes(d["Serial No"]))
      .forEach(item => {
        text += item["Serial No"] + "\n" + item.URL + "\n\n";
      });

  window.open("https://wa.me/?text=" + encodeURIComponent(text));
}
