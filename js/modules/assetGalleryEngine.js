// Module: The Front & Back Matter Asset Gallery + Custom Asset Upload & Permanent Storage Library
// Now a real gallery: fixed KDP-role "categories" (each one maps to a specific PDF page
// slot) plus user-created custom "albums" for free-form organizing, drag-to-move between
// either, and — per category — an explicit active-asset selection (not just "first wins")
// so a creator can keep several candidate images and flip between them.

const ACTIVE_KEY = "kdp-studio:asset-gallery-active";
const ALBUMS_KEY = "kdp-studio:asset-gallery-albums";

// The gallery's actual image data (base64 data URLs, up to 30MB each — see
// MAX_UPLOAD_BYTES in galleryPanel.js) lives in IndexedDB, not localStorage.
// localStorage caps out around 5-10MB TOTAL per origin, shared across every key on the
// page — one or two real photos would blow through that. IndexedDB's quota is a large
// fraction of free disk space (commonly hundreds of MB to several GB), and it's the
// standard place a zero-API, fully-local app stores binary-ish assets client-side.
const IDB_NAME = "kdp-studio-gallery";
const IDB_VERSION = 1;
const IDB_STORE = "gallery-store";
const IDB_RECORD_KEY = "gallery-data";
const LEGACY_LOCALSTORAGE_KEY = "kdp-studio:asset-gallery"; // pre-IndexedDB location

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

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// One-time migration: a gallery saved under the old localStorage key (from before this
// moved to IndexedDB) gets carried over automatically on first load, then cleared —
// nobody's previously uploaded images disappear out from under them.
async function migrateLegacyGalleryIfNeeded() {
  let legacyRaw;
  try {
    legacyRaw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    return;
  }
  if (!legacyRaw) return;
  try {
    const legacyGallery = JSON.parse(legacyRaw);
    await idbPut(IDB_RECORD_KEY, legacyGallery);
  } catch {
    // Corrupt legacy entry — nothing usable to migrate.
  } finally {
    try {
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export async function loadGallery() {
  try {
    await migrateLegacyGalleryIfNeeded();
    const gallery = await idbGet(IDB_RECORD_KEY);
    return gallery ?? {};
  } catch {
    return {};
  }
}

// Thrown up to the caller (galleryPanel.js) so a genuinely full disk shows a clear
// "Storage Full" popup instead of an upload that silently does nothing.
async function persist(gallery) {
  await idbPut(IDB_RECORD_KEY, gallery);
}

export async function saveAsset(gallery, categoryId, asset) {
  const next = { ...gallery, [categoryId]: [...(gallery[categoryId] ?? []), asset] };
  await persist(next);
  return next;
}

export async function removeAsset(gallery, categoryId, assetId) {
  const next = { ...gallery, [categoryId]: (gallery[categoryId] ?? []).filter((a) => a.id !== assetId) };
  await persist(next);
  return next;
}

// Moves one asset from one bucket (category or custom album) to another — the drag-and-
// drop "move images where I want" the gallery needs, plus the same move happens when
// re-assigning an asset's role from the picker.
export async function moveAsset(gallery, fromBucketId, toBucketId, assetId) {
  if (fromBucketId === toBucketId) return gallery;
  const asset = (gallery[fromBucketId] ?? []).find((a) => a.id === assetId);
  if (!asset) return gallery;
  const next = {
    ...gallery,
    [fromBucketId]: (gallery[fromBucketId] ?? []).filter((a) => a.id !== assetId),
    [toBucketId]: [...(gallery[toBucketId] ?? []), asset],
  };
  await persist(next);
  return next;
}

// ---- Active-asset selection per bucket ----
// A bucket can hold several candidate images; this tracks which one is actually "in use"
// (embedded into the PDF, or shown first) — defaulting to the first uploaded when unset,
// so existing single-image categories keep working with no migration needed. Small JSON,
// stays on localStorage — no need for IndexedDB here.

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
