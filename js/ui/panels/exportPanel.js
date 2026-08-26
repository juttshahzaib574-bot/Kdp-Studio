import { state, setState, subscribe } from "../../state.js?v=21";
import { exportInteriorPdf, downloadPdf } from "../pdfExport.js?v=21";
import { FRONT_MATTER_PAGES, BACK_MATTER_PAGES, isPageEnabled, togglePage } from "../../modules/frontBackMatterEngine.js?v=21";

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
  renderMatterPageList(el.frontMatterList, FRONT_MATTER_PAGES);
  renderMatterPageList(el.backMatterList, BACK_MATTER_PAGES);

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

// Built once — each row's checked state is kept in sync by render(), not rebuilt on
// every state change, so a checkbox never loses focus/mid-click state under the hood.
function renderMatterPageList(container, pages) {
  container.innerHTML = "";
  pages.forEach((page) => {
    const label = document.createElement("label");
    label.className = "matter-page-item";
    label.innerHTML = `<input type="checkbox" data-page-id="${page.id}" /><span>${page.label}</span>`;
    label.querySelector("input").addEventListener("change", () => {
      setState({ disabledFrontBackMatterPages: togglePage(state.disabledFrontBackMatterPages, page.id) });
    });
    container.appendChild(label);
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
  [el.frontMatterList, el.backMatterList].forEach((list) => {
    list.querySelectorAll("input[data-page-id]").forEach((input) => {
      input.checked = isPageEnabled(current.disabledFrontBackMatterPages, input.dataset.pageId);
    });
  });

  if (document.activeElement !== el.titleInput) el.titleInput.value = current.bookTitle;
  if (document.activeElement !== el.subtitleInput) el.subtitleInput.value = current.bookSubtitle;
  if (document.activeElement !== el.authorInput) el.authorInput.value = current.bookAuthor;
  if (document.activeElement !== el.isbnInput) el.isbnInput.value = current.bookIsbn;
  if (document.activeElement !== el.authorBioInput) el.authorBioInput.value = current.authorBio;
  if (document.activeElement !== el.seriesPromoInput) el.seriesPromoInput.value = current.seriesPromoText;
}
