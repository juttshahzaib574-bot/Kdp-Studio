import { state, setState, subscribe } from "../../state.js?v=10";
import { exportInteriorPdf, downloadPdf } from "../pdfExport.js?v=10";

const el = {
  titleInput: document.getElementById("book-title-input"),
  subtitleInput: document.getElementById("book-subtitle-input"),
  authorInput: document.getElementById("book-author-input"),
  isbnInput: document.getElementById("book-isbn-input"),
  authorBioInput: document.getElementById("author-bio-input"),
  seriesPromoInput: document.getElementById("series-promo-input"),
  exportBtn: document.getElementById("export-pdf-btn"),
  progress: document.getElementById("export-progress"),
  progressFill: document.getElementById("export-progress-fill"),
  progressLabel: document.getElementById("export-progress-label"),
};

export function initExportPanel() {
  el.titleInput.addEventListener("change", () => setState({ bookTitle: el.titleInput.value || "Untitled Mystery Mosaic Book" }));
  el.subtitleInput.addEventListener("change", () => setState({ bookSubtitle: el.subtitleInput.value }));
  el.authorInput.addEventListener("change", () => setState({ bookAuthor: el.authorInput.value }));
  el.isbnInput.addEventListener("change", () => setState({ bookIsbn: el.isbnInput.value }));
  el.authorBioInput.addEventListener("change", () => setState({ authorBio: el.authorBioInput.value }));
  el.seriesPromoInput.addEventListener("change", () => setState({ seriesPromoText: el.seriesPromoInput.value }));
  el.exportBtn.addEventListener("click", handleExport);

  subscribe(render);
  render(state);
}

async function handleExport() {
  el.exportBtn.disabled = true;
  el.progress.hidden = false;
  el.progressFill.style.width = "0%";
  el.progressLabel.textContent = "Starting export…";

  try {
    const bytes = await exportInteriorPdf(state, {
      onProgress: ({ completed, total, label }) => {
        el.progressFill.style.width = `${Math.round((completed / total) * 100)}%`;
        el.progressLabel.textContent = `${completed} / ${total} — ${label}`;
      },
    });

    const filename = `${(state.bookTitle || "kdp-studio-interior").replace(/[^a-z0-9-]+/gi, "-")}.pdf`;
    downloadPdf(bytes, filename);
    el.progressLabel.textContent = `Done — ${filename} downloaded.`;
  } catch (err) {
    el.progressLabel.textContent = `Export failed: ${err.message}`;
  } finally {
    el.exportBtn.disabled = false;
  }
}

function render(current) {
  if (document.activeElement !== el.titleInput) el.titleInput.value = current.bookTitle;
  if (document.activeElement !== el.subtitleInput) el.subtitleInput.value = current.bookSubtitle;
  if (document.activeElement !== el.authorInput) el.authorInput.value = current.bookAuthor;
  if (document.activeElement !== el.isbnInput) el.isbnInput.value = current.bookIsbn;
  if (document.activeElement !== el.authorBioInput) el.authorBioInput.value = current.authorBio;
  if (document.activeElement !== el.seriesPromoInput) el.seriesPromoInput.value = current.seriesPromoText;
}
