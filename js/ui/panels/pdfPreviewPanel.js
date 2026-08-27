// Module: PDF Page Preview panel — an in-app page-by-page viewer for the real exported
// PDF, built before a creator downloads anything. Explicitly on-demand (a "Refresh"
// button, not auto-regenerated on every settings tweak): building the full book via
// exportInteriorPdf and then rasterizing every page through pdf.js is O(page count) work,
// unlike the small 2-canvas mosaic preview — the same reason the "Export PDF" button
// itself is a deliberate click, not something that reruns on every keystroke.

import { state, subscribe } from "../../state.js?v=46";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=46";
import { exportInteriorPdf } from "../pdfExport.js?v=46";
import { loadPdfDocument, renderPdfPageToCanvas } from "../pdfPreview.js?v=46";

const THUMB_SCALE = 0.22;
const MAIN_SCALE = 1.4;

const el = {
  refreshBtn: document.getElementById("pdf-preview-refresh-btn"),
  progress: document.getElementById("pdf-preview-progress"),
  progressFill: document.getElementById("pdf-preview-progress-fill"),
  progressLabel: document.getElementById("pdf-preview-progress-label"),
  viewer: document.getElementById("pdf-viewer"),
  placeholder: document.getElementById("pdf-viewer-placeholder"),
  pagesRail: document.getElementById("pdf-viewer-pages"),
  pageFrame: document.getElementById("pdf-page-frame"),
  mainCanvas: document.getElementById("pdf-viewer-canvas"),
  pageLabel: document.getElementById("pdf-page-label"),
  prevBtn: document.getElementById("pdf-prev-btn"),
  nextBtn: document.getElementById("pdf-next-btn"),
};

let pdfDoc = null;
let pageCount = 0;
let activePage = 1;
let lastTrimSizeId = null;

export function initPdfPreviewPanel() {
  el.refreshBtn.addEventListener("click", refreshPreview);
  el.prevBtn.addEventListener("click", () => goToPage(activePage - 1));
  el.nextBtn.addEventListener("click", () => goToPage(activePage + 1));

  applyTrimAspectRatio();
  subscribe((current) => {
    if (current.trimSizeId !== lastTrimSizeId) applyTrimAspectRatio(current);
  });
}

// Every preview page container's shape is driven by the selected physical Trim Size —
// e.g. `aspect-ratio: 8.5 / 11` for the 8.5"x11" trim — not by whatever the canvas
// happens to render at. Updates the moment the trim size changes in Module 1, even
// before the next Refresh, and reapplies to every already-rendered thumbnail so a
// mid-session trim change never leaves a stale-shaped page box on screen.
function applyTrimAspectRatio(current = state) {
  lastTrimSizeId = current.trimSizeId;
  const trimSize = getTrimSizeById(current.trimSizeId);
  const ratio = `${trimSize.widthIn} / ${trimSize.heightIn}`;

  el.pageFrame.style.setProperty("--trim-aspect-ratio", ratio);
  el.pagesRail.querySelectorAll(".pdf-thumb-frame").forEach((frame) => {
    frame.style.setProperty("--trim-aspect-ratio", ratio);
  });
}

async function refreshPreview() {
  el.refreshBtn.disabled = true;
  el.progress.hidden = false;
  el.progressFill.style.width = "0%";
  el.progressLabel.textContent = "Building interior PDF…";

  try {
    const bytes = await exportInteriorPdf(state, {
      onProgress: ({ completed, total, label }) => {
        // Building the PDF is the first half of the bar; rasterizing pages is the second.
        const pct = Math.round((completed / total) * 50);
        el.progressFill.style.width = `${pct}%`;
        el.progressLabel.textContent = `${completed} / ${total} — ${label}`;
      },
    });

    pdfDoc = await loadPdfDocument(bytes);
    pageCount = pdfDoc.numPages;

    await renderThumbnailRail();

    el.viewer.hidden = false;
    el.placeholder.hidden = true;
    await goToPage(1);

    el.progressFill.style.width = "100%";
    el.progressLabel.textContent = `Done — ${pageCount} pages.`;
  } catch (err) {
    el.progressLabel.textContent = `Preview failed: ${err.message}`;
  } finally {
    el.refreshBtn.disabled = false;
    setTimeout(() => {
      el.progress.hidden = true;
    }, 1200);
  }
}

async function renderThumbnailRail() {
  el.pagesRail.innerHTML = "";
  const trimSize = getTrimSizeById(state.trimSizeId);
  const ratio = `${trimSize.widthIn} / ${trimSize.heightIn}`;

  for (let i = 1; i <= pageCount; i += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "pdf-thumb";
    cell.dataset.page = String(i);

    const frame = document.createElement("div");
    frame.className = "pdf-thumb-frame";
    frame.style.setProperty("--trim-aspect-ratio", ratio);
    const canvas = document.createElement("canvas");
    frame.appendChild(canvas);
    cell.appendChild(frame);

    const label = document.createElement("span");
    label.className = "pdf-thumb-label";
    label.textContent = String(i);
    cell.appendChild(label);

    cell.addEventListener("click", () => goToPage(i));
    el.pagesRail.appendChild(cell);

    // eslint-disable-next-line no-await-in-loop -- sequential so the progress bar's
    // second half advances smoothly instead of firing pdf.js render calls all at once.
    await renderPdfPageToCanvas(pdfDoc, i, canvas, THUMB_SCALE);
    const pct = 50 + Math.round((i / pageCount) * 50);
    el.progressFill.style.width = `${pct}%`;
    el.progressLabel.textContent = `Rendering page ${i} / ${pageCount}…`;
  }
}

async function goToPage(pageNumber) {
  if (!pdfDoc || pageNumber < 1 || pageNumber > pageCount) return;
  activePage = pageNumber;

  await renderPdfPageToCanvas(pdfDoc, activePage, el.mainCanvas, MAIN_SCALE);

  el.pageLabel.textContent = `Page ${activePage} of ${pageCount}`;
  el.prevBtn.disabled = activePage <= 1;
  el.nextBtn.disabled = activePage >= pageCount;

  el.pagesRail.querySelectorAll(".pdf-thumb").forEach((thumb) => {
    thumb.classList.toggle("active", Number(thumb.dataset.page) === activePage);
  });
  const activeThumb = el.pagesRail.querySelector(`.pdf-thumb[data-page="${activePage}"]`);
  activeThumb?.scrollIntoView({ block: "nearest" });
}
