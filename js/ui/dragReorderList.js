// Module: Generic click-and-hold drag reordering (mouse + touch, via Pointer Events)
// for any vertical list of rows — shared by the front/back matter checklists and the
// Layout Composer's element Stacking Order list, so the same grab-and-drop mechanics
// don't have to be re-implemented per panel.

export const DRAG_HANDLE_ICON = `
  <svg viewBox="0 0 12 18" fill="currentColor">
    <circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/>
    <circle cx="3" cy="9" r="1.4"/><circle cx="9" cy="9" r="1.4"/>
    <circle cx="3" cy="15" r="1.4"/><circle cx="9" cy="15" r="1.4"/>
  </svg>`;

// Wires a handle element to drag its row to any position within container's children.
// Siblings visually shift out of the way via CSS transform during the drag; the caller
// only learns the final order (an array of ids, in their new sequence) on release, via
// onReorder — nothing commits mid-drag, so there's no partial state to clean up.
export function attachDragHandle(handle, { container, row, ids, onReorder }) {
  handle.addEventListener("pointerdown", (startEvent) => beginDragReorder(startEvent, container, row, ids, onReorder));
}

function beginDragReorder(startEvent, container, row, ids, onReorder) {
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
      onReorder(nextOrder);
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
