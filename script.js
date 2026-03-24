let data = [];
let selected = [];

const API_URL = "https://script.google.com/macros/s/AKfycbxurQyyCGIRT2nTBTEZJMBi3lCuAHH1j3wC3vOjk7d3gAqqTiFVIgMyw37pvt6E4Q/exec";

console.log("App starting...");

fetch(API_URL)
.then(res => {
  console.log("Fetching data from API...");
  return res.json();
})
.then(json => {
  console.log("Data received:", json);
  data = json;
  initFilter();
  render();
})
.catch(err => {
  console.error("Error fetching API:", err);
});

function initFilter() {
  let types = [...new Set(data.map(d => d["Type"]))];
  let filter = document.getElementById("filter");

  filter.innerHTML = '<option value="">All</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join("");

  console.log("Filter initialized with types:", types);
}

function convertToThumbnail(url) {
  if (!url) return "";

  if (url.includes("drive.google.com")) {
    let match = url.match(/[-\w]{25,}/);
    if (match) {
      let converted = "https://drive.google.com/uc?export=view&id=" + match[0];
      console.log("Converted Drive URL:", converted);
      return converted;
    }
  }

  return url;
}

function render() {
  let filterValue = document.getElementById("filter").value;

  let filtered = data.filter(d => !filterValue || d["Type"] === filterValue);

  console.log("Rendering items. Filter:", filterValue, "Count:", filtered.length);

  let html = "";

  filtered.forEach(item => {
    let isSelected = selected.includes(item["Serial No"]);
    let imgUrl = convertToThumbnail(item.URL);

    html += `
      <div class="card ${isSelected ? 'selected' : ''}" onclick='toggle("${item["Serial No"]}")'>
        <img src="${imgUrl}" onerror="console.error('Image failed:', '${imgUrl}')">
        <p>${item["Serial No"]}</p>
        <small>${item["Type"]}</small>
      </div>
    `;
  });

  document.getElementById("grid").innerHTML = html;
  renderSelected();
}

function toggle(id) {
  console.log("Toggling item:", id);

  if (selected.includes(id)) {
    selected = selected.filter(x => x !== id);
  } else {
    if (selected.length >= 9) {
      alert("Maximum 9 items allowed for collage");
      return;
    }
    selected.push(id);
  }

  console.log("Selected items:", selected);
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
  console.log("Share collage clicked");

  let selectedItems = data.filter(d => selected.includes(d["Serial No"]));

  if (selectedItems.length === 0) {
    alert("No items selected");
    console.warn("No items selected for collage");
    return;
  }

  selectedItems = selectedItems.slice(0, 9);

  console.log("Selected items for collage:", selectedItems);

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

    let url = convertToThumbnail(item.URL);

    console.log("Loading image:", url);

    img.src = url;

    images.push({ img, serial: item["Serial No"] });

    await new Promise(resolve => {
      img.onload = () => {
        console.log("Image loaded:", url);
        resolve();
      };

      img.onerror = () => {
        console.error("Image failed to load:", url);
        resolve();
      };
    });
  }

  console.log("Drawing images on canvas...");

  images.forEach((obj, index) => {
    let col = index % cols;
    let row = Math.floor(index / cols);

    let x = col * size;
    let y = row * size;

    if (obj.img.complete && obj.img.naturalWidth > 0) {
      ctx.drawImage(obj.img, x, y, size, size);
    } else {
      console.warn("Skipping broken image:", obj.serial);
    }

    // overlay serial number
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y + size - 30, size, 30);

    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText(obj.serial, x + 10, y + size - 10);
  });

  console.log("Canvas drawing complete");

  canvas.toBlob(async function(blob) {
    if (!blob) {
      console.error("Failed to create blob from canvas");
      fallbackTextShare();
      return;
    }

    const file = new File([blob], "collage.png", { type: "image/png" });

    console.log("Blob created:", file);

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        console.log("Trying native share...");
        await navigator.share({
          files: [file],
          title: "Jewellery Selection",
          text: "Sharing jewellery collage"
        });
        console.log("Share successful");
      } catch (err) {
        console.error("Share failed:", err);
        fallbackTextShare();
      }
    } else {
      console.warn("Web Share API not supported, using fallback");
      fallbackTextShare();
    }
  });
}

function fallbackTextShare() {
  console.log("Using WhatsApp fallback share");

  let text = "Selected Jewellery:\n\n";

  data.filter(d => selected.includes(d["Serial No"]))
      .forEach(item => {
        text += item["Serial No"] + "\n" + item.URL + "\n\n";
      });

  let url = "https://wa.me/?text=" + encodeURIComponent(text);

  console.log("Opening WhatsApp URL:", url);

  window.open(url, "_blank");
}
