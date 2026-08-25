// Module: PDF Page Preview panel — an in-app page-by-page viewer for the real exported
// PDF, built before a creator downloads anything. Explicitly on-demand (a "Refresh"
// button, not auto-regenerated on every settings tweak): building the full book via
// exportInteriorPdf and then rasterizing every page through pdf.js is O(page count) work,
// unlike the small 2-canvas mosaic preview — the same reason the "Export PDF" button
// itself is a deliberate click, not something that reruns on every keystroke.

import { state } from "../../state.js";
import { exportInteriorPdf } from "../pdfExport.js";
import { loadPdfDocument, renderPdfPageToCanvas } from "../pdfPreview.js";

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
  mainCanvas: document.getElementById("pdf-viewer-canvas"),
  pageLabel: document.getElementById("pdf-page-label"),
  prevBtn: document.getElementById("pdf-prev-btn"),
  nextBtn: document.getElementById("pdf-next-btn"),
};

let pdfDoc = null;
let pageCount = 0;
let activePage = 1;

export function initPdfPreviewPanel() {
  el.refreshBtn.addEventListener("click", refreshPreview);
  el.prevBtn.addEventListener("click", () => goToPage(activePage - 1));
  el.nextBtn.addEventListener("click", () => goToPage(activePage + 1));
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
  for (let i = 1; i <= pageCount; i += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "pdf-thumb";
    cell.dataset.page = String(i);

    const canvas = document.createElement("canvas");
    cell.appendChild(canvas);
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
