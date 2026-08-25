import { state, setState, subscribe } from "../../state.js";
import { MAX_BATCH_SIZE, addToBatch, removeFromBatch, updateItemSettings } from "../../modules/batchEngine.js";
import { reorder, computePagination, statusBadges } from "../../modules/storyboardEngine.js";
import { computeSolutionPageCount } from "../../modules/solutionGenerationEngine.js";
import { GRID_PATTERNS } from "../../modules/gridPatternEngine.js";

// "10 front matter pages = 20 interior pages" per the blueprint's single-sided-printing math.
const FRONT_MATTER_INTERIOR_PAGES = 20;

const el = {
  fileInput: document.getElementById("batch-file-input"),
  countHint: document.getElementById("batch-count-hint"),
  grid: document.getElementById("storyboard-grid"),
  perPageSelect: document.getElementById("solution-per-page-select"),
  summaryHint: document.getElementById("solution-summary-hint"),
};

let dragFromIndex = null;

export function initBatchStoryboardPanel() {
  el.fileInput.addEventListener("change", handleFileInput);
  el.perPageSelect.addEventListener("change", () => setState({ solutionThumbsPerPage: Number(el.perPageSelect.value) }));

  subscribe(render);
  render(state);
}

function handleFileInput() {
  const { accepted, rejectedCount, batch } = addToBatch(state.batchItems, el.fileInput.files);
  setState({ batchItems: batch, activeBatchItemId: state.activeBatchItemId ?? accepted[0]?.id ?? null });
  el.fileInput.value = "";

  if (rejectedCount > 0) {
    el.countHint.textContent = `${rejectedCount} file(s) rejected — the ${MAX_BATCH_SIZE}-image batch limit is full.`;
  }
}

function render(current) {
  const paginated = computePagination(current.batchItems, FRONT_MATTER_INTERIOR_PAGES);

  el.grid.innerHTML = "";
  if (paginated.length === 0) {
    el.grid.innerHTML = '<p class="storyboard-empty">No artwork queued yet. Upload images to build the storyboard.</p>';
  }

  paginated.forEach((item, index) => {
    const cell = document.createElement("div");
    cell.className = "storyboard-item";
    cell.draggable = true;
    cell.dataset.itemId = item.id;

    const badges = statusBadges(item, { gridPattern: current.gridPattern, borderPreset: null });

    cell.innerHTML = `
      <img src="${item.objectUrl}" alt="${item.name}" />
      <span class="page-badge">p.${item.puzzlePage}</span>
      <button type="button" class="remove-btn" title="Remove">×</button>
      <span class="shape-badge" title="Click to override this page's grid pattern">${badges.join(" · ")}</span>
    `;

    cell.querySelector(".remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const batch = removeFromBatch(state.batchItems, item.id);
      setState({ batchItems: batch, activeBatchItemId: batch[0]?.id ?? null });
    });

    cell.querySelector(".shape-badge").addEventListener("click", (e) => {
      e.stopPropagation();
      const batch = updateItemSettings(state.batchItems, item.id, { gridPattern: nextPatternOverride(item.settings.gridPattern) });
      setState({ batchItems: batch });
    });

    cell.addEventListener("click", () => setState({ activeBatchItemId: item.id }));
    cell.addEventListener("dragstart", () => {
      dragFromIndex = index;
      cell.classList.add("dragging");
    });
    cell.addEventListener("dragend", () => cell.classList.remove("dragging"));
    cell.addEventListener("dragover", (e) => e.preventDefault());
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragFromIndex === null || dragFromIndex === index) return;
      setState({ batchItems: reorder(state.batchItems, dragFromIndex, index) });
      dragFromIndex = null;
    });

    if (item.id === current.activeBatchItemId) cell.style.outline = "2px solid var(--accent)";

    el.grid.appendChild(cell);
  });

  el.countHint.textContent = `${current.batchItems.length} / ${MAX_BATCH_SIZE} images queued.`;
  el.perPageSelect.value = String(current.solutionThumbsPerPage);

  const pageCount = computeSolutionPageCount(current.batchItems.length, current.solutionThumbsPerPage);
  el.summaryHint.textContent =
    current.batchItems.length === 0
      ? "Solutions generate automatically once artwork is queued."
      : `${pageCount} back-matter solution page(s) at ${current.solutionThumbsPerPage} thumbnails each — auto-synced to storyboard order.`;
}

function nextPatternOverride(currentOverride) {
  const ids = [null, ...GRID_PATTERNS.map((p) => p.id)];
  const idx = ids.indexOf(currentOverride);
  return ids[(idx + 1) % ids.length];
}
