// Module: The Front & Back Matter Asset Gallery — a real gallery, not a single dropdown.
// Two kinds of buckets share one storage layer (assetGalleryEngine.js): fixed KDP "roles"
// (each maps to one specific generated PDF page — assigning an image there replaces that
// page) and free-form user-created "albums" for organizing reference images before they're
// assigned a role. Drag a thumbnail onto any bucket in the sidebar to move it there.

import { state, setState, subscribe } from "../../state.js?v=4";
import {
  ASSET_CATEGORIES,
  loadGallery,
  saveAsset,
  removeAsset,
  moveAsset,
  checkFormatCompliance,
  loadActiveAssetMap,
  setActiveAsset,
  resolveActiveAsset,
  loadCustomAlbums,
  createAlbum,
  renameAlbum,
  deleteAlbum,
} from "../../modules/assetGalleryEngine.js?v=4";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=4";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js?v=4";

let nextAssetId = 1;
let activeBucketId = ASSET_CATEGORIES[0].id;
let dragAssetId = null;

const el = {
  roleList: document.getElementById("gallery-role-list"),
  albumList: document.getElementById("gallery-album-list"),
  newAlbumBtn: document.getElementById("new-album-btn"),
  newAlbumRow: document.getElementById("new-album-row"),
  newAlbumInput: document.getElementById("new-album-input"),
  newAlbumConfirmBtn: document.getElementById("new-album-confirm-btn"),
  bucketName: document.getElementById("gallery-active-bucket-name"),
  uploadBtn: document.getElementById("asset-upload-btn"),
  fileInput: document.getElementById("asset-file-input"),
  renameBtn: document.getElementById("rename-album-btn"),
  deleteBtn: document.getElementById("delete-album-btn"),
  formatHint: document.getElementById("asset-format-hint"),
  grid: document.getElementById("asset-list"),
};

export function initGalleryPanel() {
  setState({ assetGallery: loadGallery(), activeAssetByCategory: loadActiveAssetMap(), customAlbums: loadCustomAlbums() });

  el.uploadBtn.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", handleUpload);

  el.newAlbumBtn.addEventListener("click", () => {
    el.newAlbumRow.hidden = false;
    el.newAlbumInput.value = "";
    el.newAlbumInput.focus();
  });
  el.newAlbumConfirmBtn.addEventListener("click", confirmNewAlbum);
  el.newAlbumInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmNewAlbum();
    if (e.key === "Escape") el.newAlbumRow.hidden = true;
  });

  el.renameBtn.addEventListener("click", () => {
    const album = state.customAlbums.find((a) => a.id === activeBucketId);
    if (!album) return;
    const name = window.prompt("Rename album", album.name);
    if (name && name.trim()) setState({ customAlbums: renameAlbum(state.customAlbums, album.id, name) });
  });

  el.deleteBtn.addEventListener("click", () => {
    const album = state.customAlbums.find((a) => a.id === activeBucketId);
    if (!album) return;
    const count = (state.assetGallery[album.id] ?? []).length;
    if (count > 0 && !window.confirm(`Delete "${album.name}"? Its ${count} image(s) will stay saved — drag them to another album first if you want to keep them organized.`)) return;
    const nextAlbums = deleteAlbum(state.customAlbums, album.id);
    activeBucketId = ASSET_CATEGORIES[0].id;
    setState({ customAlbums: nextAlbums });
  });

  subscribe(render);
  render(state);
}

function confirmNewAlbum() {
  const name = el.newAlbumInput.value;
  const { albums, album } = createAlbum(state.customAlbums, name);
  if (!album) return;
  el.newAlbumRow.hidden = true;
  activeBucketId = album.id;
  setState({ customAlbums: albums });
}

async function handleUpload() {
  const file = el.fileInput.files[0];
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const dims = await readImageDimensions(dataUrl);

  const isRole = ASSET_CATEGORIES.some((c) => c.id === activeBucketId);
  let compliant = true;
  if (isRole) {
    const trimSize = getTrimSizeById(state.trimSizeId);
    const expectedCanvasDims = computeCanvasDimensions(trimSize, state.dpi, state.bleedEnabled);
    const compliance = checkFormatCompliance({ widthPx: dims.width, heightPx: dims.height }, expectedCanvasDims);
    compliant = compliance.ok;
    el.formatHint.textContent = compliance.message;
    el.formatHint.style.color = compliance.ok ? "#3ad19a" : "#fca5a5";
  } else {
    el.formatHint.textContent = "";
  }

  const asset = {
    id: `asset-${nextAssetId++}`,
    name: file.name,
    dataUrl,
    widthPx: dims.width,
    heightPx: dims.height,
    compliant,
  };

  const gallery = saveAsset(state.assetGallery, activeBucketId, asset);
  setState({ assetGallery: gallery });
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

function bucketLabel(bucketId, current) {
  const role = ASSET_CATEGORIES.find((c) => c.id === bucketId);
  if (role) return role.label;
  const album = current.customAlbums.find((a) => a.id === bucketId);
  return album ? album.name : bucketId;
}

function render(current) {
  renderBucketList(el.roleList, ASSET_CATEGORIES.map((c) => ({ id: c.id, label: c.label })), current);
  renderBucketList(el.albumList, current.customAlbums.map((a) => ({ id: a.id, label: a.name })), current);

  const isRole = ASSET_CATEGORIES.some((c) => c.id === activeBucketId);
  el.bucketName.textContent = bucketLabel(activeBucketId, current);
  el.renameBtn.hidden = isRole;
  el.deleteBtn.hidden = isRole;

  renderGrid(current);
}

function renderBucketList(container, buckets, current) {
  container.innerHTML = "";
  buckets.forEach((bucket) => {
    const count = (current.assetGallery[bucket.id] ?? []).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-bucket-item";
    btn.dataset.bucketId = bucket.id;
    btn.classList.toggle("active", bucket.id === activeBucketId);
    btn.innerHTML = `<span>${bucket.label}</span><span class="gallery-bucket-count">${count}</span>`;
    btn.addEventListener("click", () => {
      activeBucketId = bucket.id;
      el.newAlbumRow.hidden = true;
      render(state);
    });
    btn.addEventListener("mouseup", () => {
      if (dragAssetId) dropOnBucket(bucket.id);
    });
    container.appendChild(btn);
  });
}

function renderGrid(current) {
  const assets = current.assetGallery[activeBucketId] ?? [];
  const isRole = ASSET_CATEGORIES.some((c) => c.id === activeBucketId);
  const activeAsset = isRole ? resolveActiveAsset(assets, current.activeAssetByCategory, activeBucketId) : null;

  el.grid.innerHTML = "";
  if (assets.length === 0) {
    el.grid.innerHTML = `<p class="asset-empty">No images here yet. Upload one, or drag an image in from another bucket.</p>`;
    return;
  }

  assets.forEach((asset) => {
    const isActive = isRole && activeAsset?.id === asset.id;
    const item = document.createElement("div");
    item.className = "gallery-item" + (isActive ? " active-asset" : "");
    item.dataset.assetId = asset.id;
    item.innerHTML = `
      ${isActive ? '<span class="active-tag">In Use</span>' : ""}
      <img src="${asset.dataUrl}" alt="${asset.name}" />
      <button type="button" class="remove-btn" title="Remove">×</button>
      ${isRole ? `<button type="button" class="use-badge">${isActive ? "In Use — This Page" : "Use for This Page"}</button>` : ""}
    `;

    item.querySelector(".remove-btn").addEventListener("mousedown", (e) => e.stopPropagation());
    item.querySelector(".remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const gallery = removeAsset(state.assetGallery, activeBucketId, asset.id);
      setState({ assetGallery: gallery });
    });

    const useBadge = item.querySelector(".use-badge");
    if (useBadge) {
      useBadge.addEventListener("mousedown", (e) => e.stopPropagation());
      useBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isActive) return;
        setState({ activeAssetByCategory: setActiveAsset(state.activeAssetByCategory, activeBucketId, asset.id) });
      });
    }

    item.addEventListener("mousedown", (e) => startDrag(e, item, asset.id));
    el.grid.appendChild(item);
  });
}

// Manual mouse-based drag, matching the storyboard/layout-composer pattern used
// throughout this app (native drag-and-drop and Pointer Events both proved unreliable
// under automated input during testing — see batchStoryboardPanel.js for the full story).
function startDrag(e, item, assetId) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragAssetId = assetId;
  item.classList.add("dragging");

  const onMove = (moveEvent) => {
    const bucket = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest(".gallery-bucket-item");
    document.querySelectorAll(".gallery-bucket-item.drop-hover").forEach((n) => n.classList.remove("drop-hover"));
    if (bucket) bucket.classList.add("drop-hover");
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    item.classList.remove("dragging");
    document.querySelectorAll(".gallery-bucket-item.drop-hover").forEach((n) => n.classList.remove("drop-hover"));
    dragAssetId = null;
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp, { once: true });
}

function dropOnBucket(toBucketId) {
  if (!dragAssetId || toBucketId === activeBucketId) return;
  const gallery = moveAsset(state.assetGallery, activeBucketId, toBucketId, dragAssetId);
  setState({ assetGallery: gallery });
}
