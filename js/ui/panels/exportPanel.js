import { state, setState, subscribe } from "../../state.js?v=27";
import { exportInteriorPdf, downloadPdf } from "../pdfExport.js?v=27";
import { isPageEnabled, togglePage, orderedFrontMatterPages, orderedBackMatterPages, reorderPage } from "../../modules/frontBackMatterEngine.js?v=27";
import { DRAG_HANDLE_ICON, attachDragHandle } from "../dragReorderList.js?v=27";

const el = {
  frontMatterList: document.getElementById("front-matter-page-list"),
  backMatterList: document.getElementById("back-matter-page-list"),
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

// Rebuilt from scratch on every render (the list is short, so this is cheap) since
// reordering changes actual DOM position, row numbers, and which arrows are disabled —
// unlike a simple checked-state sync, that can't be patched in place.
function renderMatterPageList(container, orderedPages, orderStateKey, disabledPageIds) {
  container.innerHTML = "";
  const ids = orderedPages.map((p) => p.id);
  orderedPages.forEach((page, index) => {
    const row = document.createElement("div");
    row.className = "matter-page-item";
    row.dataset.pageId = page.id;
    row.innerHTML = `
      <span class="matter-page-drag-handle" title="Drag to reorder">${DRAG_HANDLE_ICON}</span>
      <label>
        <input type="checkbox" data-page-id="${page.id}" ${isPageEnabled(disabledPageIds, page.id) ? "checked" : ""} />
        <span class="matter-page-index">${index + 1}.</span>
        <span>${page.label}</span>
      </label>
      <span class="matter-page-reorder">
        <button type="button" data-dir="-1" ${index === 0 ? "disabled" : ""} title="Move earlier">▲</button>
        <button type="button" data-dir="1" ${index === orderedPages.length - 1 ? "disabled" : ""} title="Move later">▼</button>
      </span>
    `;
    row.querySelector('input[type="checkbox"]').addEventListener("change", () => {
      setState({ disabledFrontBackMatterPages: togglePage(state.disabledFrontBackMatterPages, page.id) });
    });
    row.querySelectorAll(".matter-page-reorder button").forEach((btn) => {
      btn.addEventListener("click", () => {
        setState({ [orderStateKey]: reorderPage(ids, page.id, Number(btn.dataset.dir)) });
      });
    });
    attachDragHandle(row.querySelector(".matter-page-drag-handle"), {
      container,
      row,
      ids,
      onReorder: (nextOrder) => setState({ [orderStateKey]: nextOrder }),
    });
    container.appendChild(row);
  });
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
  renderMatterPageList(el.frontMatterList, orderedFrontMatterPages(current.frontMatterOrder), "frontMatterOrder", current.disabledFrontBackMatterPages);
  renderMatterPageList(el.backMatterList, orderedBackMatterPages(current.backMatterOrder), "backMatterOrder", current.disabledFrontBackMatterPages);

  if (document.activeElement !== el.titleInput) el.titleInput.value = current.bookTitle;
  if (document.activeElement !== el.subtitleInput) el.subtitleInput.value = current.bookSubtitle;
  if (document.activeElement !== el.authorInput) el.authorInput.value = current.bookAuthor;
  if (document.activeElement !== el.isbnInput) el.isbnInput.value = current.bookIsbn;
  if (document.activeElement !== el.authorBioInput) el.authorBioInput.value = current.authorBio;
  if (document.activeElement !== el.seriesPromoInput) el.seriesPromoInput.value = current.seriesPromoText;
}
