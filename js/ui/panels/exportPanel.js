import { state, setState, subscribe } from "../../state.js?v=26";
import { exportInteriorPdf, downloadPdf } from "../pdfExport.js?v=26";
import { isPageEnabled, togglePage, orderedFrontMatterPages, orderedBackMatterPages, reorderPage } from "../../modules/frontBackMatterEngine.js?v=26";

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

const DRAG_HANDLE_ICON = `
  <svg viewBox="0 0 12 18" fill="currentColor">
    <circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/>
    <circle cx="3" cy="9" r="1.4"/><circle cx="9" cy="9" r="1.4"/>
    <circle cx="3" cy="15" r="1.4"/><circle cx="9" cy="15" r="1.4"/>
  </svg>`;

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
    row.querySelector(".matter-page-drag-handle").addEventListener("pointerdown", (e) => {
      beginDragReorder(e, container, row, ids, orderStateKey);
    });
    container.appendChild(row);
  });
}

// Click-and-hold drag reordering (mouse + touch, via Pointer Events) — an alternative
// to the ▲▼ buttons for grabbing a row and dropping it anywhere in the list in one
// gesture. Siblings visually shift out of the way via CSS transforms during the drag;
// the actual order only commits to state on release, which triggers a full re-render
// (fresh DOM, no leftover inline styles to clean up).
function beginDragReorder(startEvent, container, row, ids, orderStateKey) {
  if (startEvent.button !== undefined && startEvent.button !== 0) return;
  startEvent.preventDefault();

  const handle = startEvent.currentTarget;
  const pointerId = startEvent.pointerId;
  const rows = Array.from(container.children);
  const draggedIndex = rows.indexOf(row);
  if (draggedIndex === -1 || rows.length < 2) return;

  const tops = rows.map((r) => r.offsetTop);
  const stepSize = tops[1] - tops[0];
  const startClientY = startEvent.clientY;
  const rowHeight = row.offsetHeight;
  let targetIndex = draggedIndex;

  handle.setPointerCapture(pointerId);
  row.classList.add("dragging");

  function onMove(e) {
    const dy = e.clientY - startClientY;
    row.style.transform = `translateY(${dy}px)`;

    const draggedCenter = tops[draggedIndex] + dy + rowHeight / 2;
    targetIndex = Math.max(0, Math.min(rows.length - 1, Math.round((draggedCenter - tops[0]) / stepSize)));

    rows.forEach((r, i) => {
      if (i === draggedIndex) return;
      let shift = 0;
      if (draggedIndex < targetIndex && i > draggedIndex && i <= targetIndex) shift = -stepSize;
      else if (draggedIndex > targetIndex && i >= targetIndex && i < draggedIndex) shift = stepSize;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }

  function onUp() {
    handle.releasePointerCapture(pointerId);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);

    if (targetIndex !== draggedIndex) {
      const nextOrder = ids.slice();
      nextOrder.splice(draggedIndex, 1);
      nextOrder.splice(targetIndex, 0, ids[draggedIndex]);
      setState({ [orderStateKey]: nextOrder });
    } else {
      row.classList.remove("dragging");
      row.style.transform = "";
      rows.forEach((r) => {
        r.style.transform = "";
      });
    }
  }

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
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
