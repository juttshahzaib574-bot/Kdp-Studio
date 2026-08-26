// Module: The Front & Back Matter Asset Gallery + Custom Asset Upload & Permanent Storage Library
// Now a real gallery: fixed KDP-role "categories" (each one maps to a specific PDF page
// slot) plus user-created custom "albums" for free-form organizing, drag-to-move between
// either, and — per category — an explicit active-asset selection (not just "first wins")
// so a creator can keep several candidate images and flip between them.

const STORAGE_KEY = "kdp-studio:asset-gallery";
const ACTIVE_KEY = "kdp-studio:asset-gallery-active";
const ALBUMS_KEY = "kdp-studio:asset-gallery-albums";

// Each of these maps 1:1 to a page addGeneratedOrCustomPage can generate in pdfExport.js —
// assigning an image here replaces that page's generated content; clearing it (removing
// every asset from the category) reverts to the generated version automatically.
export const ASSET_CATEGORIES = [
  { id: "title-page", label: "Title Page" },
  { id: "copyright-page", label: "Copyright Page" },
  { id: "belongs-to-page", label: '"Belongs To" Page' },
  { id: "color-test-page", label: "Color Test Page" },
  { id: "instructions-page", label: "Instructions Page" },
  { id: "master-palette-page", label: "Master Palette Guide" },
  { id: "about-artist-page", label: "About the Artist Page" },
  { id: "review-request-page", label: "Review Request Page" },
  { id: "series-promo-page", label: "Series Promo Page" },
  { id: "back-page-background", label: "Back Page Background (Blackout / Marker-Safe)" },
];

// Zero-API: "permanent" storage means this browser's localStorage — there is no server.
export function loadGallery() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(gallery) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery));
}

export function saveAsset(gallery, categoryId, asset) {
  const next = { ...gallery, [categoryId]: [...(gallery[categoryId] ?? []), asset] };
  persist(next);
  return next;
}

export function removeAsset(gallery, categoryId, assetId) {
  const next = { ...gallery, [categoryId]: (gallery[categoryId] ?? []).filter((a) => a.id !== assetId) };
  persist(next);
  return next;
}

// Moves one asset from one bucket (category or custom album) to another — the drag-and-
// drop "move images where I want" the gallery needs, plus the same move happens when
// re-assigning an asset's role from the picker.
export function moveAsset(gallery, fromBucketId, toBucketId, assetId) {
  if (fromBucketId === toBucketId) return gallery;
  const asset = (gallery[fromBucketId] ?? []).find((a) => a.id === assetId);
  if (!asset) return gallery;
  const next = {
    ...gallery,
    [fromBucketId]: (gallery[fromBucketId] ?? []).filter((a) => a.id !== assetId),
    [toBucketId]: [...(gallery[toBucketId] ?? []), asset],
  };
  persist(next);
  return next;
}

// ---- Active-asset selection per bucket ----
// A bucket can hold several candidate images; this tracks which one is actually "in use"
// (embedded into the PDF, or shown first) — defaulting to the first uploaded when unset,
// so existing single-image categories keep working with no migration needed.

export function loadActiveAssetMap() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistActive(map) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(map));
}

export function setActiveAsset(activeMap, bucketId, assetId) {
  const next = { ...activeMap, [bucketId]: assetId };
  persistActive(next);
  return next;
}

export function resolveActiveAsset(assets, activeMap, bucketId) {
  if (!assets || assets.length === 0) return null;
  const activeId = activeMap?.[bucketId];
  return assets.find((a) => a.id === activeId) ?? assets[0];
}

// ---- Custom albums ----
// Purely organizational buckets a creator names themselves — they don't map to any PDF
// page slot, they're just extra places to file reference/source images before assigning
// one to a role. Stored as {id, name}; the images themselves still live in `gallery`
// under the album's id, exactly like a built-in category.

export function loadCustomAlbums() {
  try {
    const raw = localStorage.getItem(ALBUMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistAlbums(albums) {
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));
}

let nextAlbumSeq = 1;

export function createAlbum(albums, name) {
  const trimmed = name.trim();
  if (!trimmed) return { albums, album: null };
  const album = { id: `album-${Date.now()}-${nextAlbumSeq++}`, name: trimmed };
  const next = [...albums, album];
  persistAlbums(next);
  return { albums: next, album };
}

export function renameAlbum(albums, albumId, name) {
  const trimmed = name.trim();
  if (!trimmed) return albums;
  const next = albums.map((a) => (a.id === albumId ? { ...a, name: trimmed } : a));
  persistAlbums(next);
  return next;
}

// Deleting an album leaves its images orphaned in `gallery` under the old id (never
// silently deletes photos) — the caller is expected to move them out first via moveAsset.
export function deleteAlbum(albums, albumId) {
  const next = albums.filter((a) => a.id !== albumId);
  persistAlbums(next);
  return next;
}
