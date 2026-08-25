import { state, setState, subscribe } from "../../state.js";
import { ASSET_CATEGORIES, loadGallery, saveAsset, removeAsset, checkFormatCompliance } from "../../modules/assetGalleryEngine.js";
import { getTrimSizeById } from "../../modules/canvasEngine.js";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js";

let nextAssetId = 1;

const el = {
  categorySelect: document.getElementById("asset-category-select"),
  fileInput: document.getElementById("asset-file-input"),
  formatHint: document.getElementById("asset-format-hint"),
  list: document.getElementById("asset-list"),
};

export function initGalleryPanel() {
  el.categorySelect.innerHTML = ASSET_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  el.categorySelect.addEventListener("change", () => setState({ activeAssetCategory: el.categorySelect.value }));
  el.fileInput.addEventListener("change", handleUpload);

  setState({ assetGallery: loadGallery() });

  subscribe(render);
  render(state);
}

async function handleUpload() {
  const file = el.fileInput.files[0];
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const dims = await readImageDimensions(dataUrl);

  const trimSize = getTrimSizeById(state.trimSizeId);
  const expectedCanvasDims = computeCanvasDimensions(trimSize, state.dpi, state.bleedEnabled);
  const compliance = checkFormatCompliance({ widthPx: dims.width, heightPx: dims.height }, expectedCanvasDims);

  const asset = {
    id: `asset-${nextAssetId++}`,
    name: file.name,
    dataUrl,
    widthPx: dims.width,
    heightPx: dims.height,
    compliant: compliance.ok,
  };

  const gallery = saveAsset(state.assetGallery, state.activeAssetCategory, asset);
  setState({ assetGallery: gallery });

  el.formatHint.textContent = compliance.message;
  el.formatHint.style.color = compliance.ok ? "#3ad19a" : "#fca5a5";
  el.fileInput.value = "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function render(current) {
  el.categorySelect.value = current.activeAssetCategory;

  const assets = current.assetGallery[current.activeAssetCategory] ?? [];
  el.list.innerHTML = "";

  if (assets.length === 0) {
    el.list.innerHTML = '<p class="asset-empty">No saved assets in this category yet.</p>';
    return;
  }

  assets.forEach((asset) => {
    const item = document.createElement("div");
    item.className = "asset-item";
    item.innerHTML = `
      <img src="${asset.dataUrl}" alt="${asset.name}" />
      <button type="button" class="remove-btn" title="Remove">×</button>
    `;
    item.querySelector(".remove-btn").addEventListener("click", () => {
      const gallery = removeAsset(state.assetGallery, current.activeAssetCategory, asset.id);
      setState({ assetGallery: gallery });
    });
    el.list.appendChild(item);
  });
}
