// Module: The Front & Back Matter Asset Gallery — a real gallery, not a single dropdown.
// Two kinds of buckets share one storage layer (assetGalleryEngine.js): fixed KDP "roles"
// (each maps to one specific generated PDF page — assigning an image there replaces that
// page) and free-form user-created "albums" for organizing reference images before they're
// assigned a role. Drag a thumbnail onto any bucket in the sidebar to move it there.

import { state, setState, subscribe } from "../../state.js?v=28";
import {
  ASSET_CATEGORIES,
  loadGallery,
  saveAsset,
  removeAsset,
  moveAsset,
  loadActiveAssetMap,
  setActiveAsset,
  resolveActiveAsset,
  loadCustomAlbums,
  createAlbum,
  renameAlbum,
  deleteAlbum,
} from "../../modules/assetGalleryEngine.js?v=28";
import { showAlert } from "../alertDialog.js?v=28";

// KDP interiors only ever need raster photos/scans — these three cover essentially
// every real image a creator would have on hand (phone photos, exports from Procreate/
// Photoshop/Canva, scanned art).
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_FORMATS_LABEL = "PNG, JPG, WEBP";

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
  grid: document.getElementById("asset-list"),
};

export async function initGalleryPanel() {
  // Gallery images live in IndexedDB (async) now; the active-asset map and custom
  // albums are small JSON and stay on localStorage (sync) — see assetGalleryEngine.js.
  setState({ activeAssetByCategory: loadActiveAssetMap(), customAlbums: loadCustomAlbums() });
  const assetGallery = await loadGallery();
  setState({ assetGallery });

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

function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Any pixel size/resolution is allowed (no dimension gate) — but format and file size
// are validated up front with a clear popup on rejection, the way any professional
// upload flow tells a user exactly what went wrong instead of silently doing nothing.
async function handleUpload() {
  const file = el.fileInput.files[0];
  if (!file) return;
  el.fileInput.value = ""; // reset immediately so re-selecting the same rejected file re-fires "change"

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    showAlert({
      title: "Unsupported File Type",
      message: `"${file.name}" is not a supported image format.\n\nSupported formats: ${ALLOWED_FORMATS_LABEL}.`,
    });
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    showAlert({
      title: "File Too Large",
      message: `"${file.name}" is ${formatMegabytes(file.size)}, which is over the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit per image.\n\nTry a smaller export or a more compressed version of this file.`,
    });
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const dims = await readImageDimensions(dataUrl);

  const asset = {
    // Globally unique and stable across reloads — a session-scoped counter starting
    // back at 1 every page load would eventually mint an id that collides with one
    // already sitting in storage from an earlier session's uploads.
    id: `asset-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name: file.name,
    dataUrl,
    widthPx: dims.width,
    heightPx: dims.height,
  };

  try {
    const gallery = await saveAsset(state.assetGallery, activeBucketId, asset);
    setState({ assetGallery: gallery });
  } catch (err) {
    showAlert({
      title: "Storage Full",
      message: `This browser's local storage is full, so "${file.name}" couldn't be saved.\n\nTry removing some existing images from the gallery, or freeing up disk space on this device.`,
    });
    console.error("[Asset Gallery] Failed to save uploaded asset:", err);
  }
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
      <div class="gallery-item-thumb">
        ${isActive ? '<span class="active-tag">In Use</span>' : ""}
        <img src="${asset.dataUrl}" alt="${asset.name}" />
        <button type="button" class="remove-btn" title="Remove">×</button>
        ${isRole ? `<button type="button" class="use-badge">${isActive ? "In Use — This Page" : "Use for This Page"}</button>` : ""}
      </div>
      <span class="asset-dims">${asset.widthPx} × ${asset.heightPx} px</span>
    `;

    item.querySelector(".remove-btn").addEventListener("mousedown", (e) => e.stopPropagation());
    item.querySelector(".remove-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const gallery = await removeAsset(state.assetGallery, activeBucketId, asset.id);
      setState({ assetGallery: gallery });
    });

    // Click-to-select: clicking any image in a role bucket makes it the active "In
    // Use" asset for that page, automatically taking the badge off whichever image
    // held it before (there's only ever one active per bucket — see resolveActiveAsset).
    if (isRole) {
      const selectThisAsset = (e) => {
        e.stopPropagation();
        if (isActive) return;
        setState({ activeAssetByCategory: setActiveAsset(state.activeAssetByCategory, activeBucketId, asset.id) });
      };
      item.querySelector("img").addEventListener("click", selectThisAsset);
      item.querySelector(".use-badge").addEventListener("mousedown", (e) => e.stopPropagation());
      item.querySelector(".use-badge").addEventListener("click", selectThisAsset);
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

async function dropOnBucket(toBucketId) {
  if (!dragAssetId || toBucketId === activeBucketId) return;
  const gallery = await moveAsset(state.assetGallery, activeBucketId, toBucketId, dragAssetId);
  setState({ assetGallery: gallery });
}
