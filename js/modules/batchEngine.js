// Module: High-Capacity Batch Engine

export const MAX_BATCH_SIZE = 120;

let nextId = 1;

export function createBatchItem(file) {
  return {
    id: `img-${nextId++}`,
    file,
    name: file.name,
    objectUrl: URL.createObjectURL(file),
    settings: {
      gridPattern: null, // null = inherit the global default (Per-Image Granularity System)
      borderPreset: null,
      cornerRadiusPercent: null,
      colorSetOverride: null,
      backBackgroundAssetId: null,
      composition: null, // Page-Specific layout override (null = inherit the global composition)
      // Grid Corner Trim per-image overrides — null = inherit the book-wide default for
      // that field. cornerTrimCorners is the one exception: an override is EITHER null
      // (inherit) or an array (including []), since [] is itself a meaningful choice
      // ("this image explicitly has no trim, regardless of the book default").
      cornerTrimCorners: null,
      cornerTrimShape: null,
      cornerTrimSizePercent: null,
      sourceSmoothing: null, // null = inherit the book-wide default (Per-Image Granularity System)
      posterizeLevels: null, // null = inherit the book-wide default
    },
  };
}

// Returns { accepted, rejectedCount, batch } — never silently drops files past the
// 120-image cap without telling the caller how many were rejected.
export function addToBatch(currentBatch, files) {
  const room = MAX_BATCH_SIZE - currentBatch.length;
  const filesToAdd = Array.from(files).slice(0, Math.max(0, room));
  const rejectedCount = files.length - filesToAdd.length;
  const accepted = filesToAdd.map(createBatchItem);
  return { accepted, rejectedCount, batch: [...currentBatch, ...accepted] };
}

export function removeFromBatch(currentBatch, id) {
  const target = currentBatch.find((item) => item.id === id);
  if (target) URL.revokeObjectURL(target.objectUrl);
  return currentBatch.filter((item) => item.id !== id);
}

export function updateItemSettings(currentBatch, id, patch) {
  return currentBatch.map((item) => (item.id === id ? { ...item, settings: { ...item.settings, ...patch } } : item));
}
