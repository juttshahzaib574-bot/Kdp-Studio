// Module: Universal Layout Control & Element Positioning (UI)
// A visual composer where each structural element (title, subtitle, instruction, color
// key) is dragged between zones on the puzzle page, the facing blank page, or a hidden
// tray. Edits target the global composition (Global scope) or the active image's own
// composition (Page-Specific scope). The live preview + PDF recalculate the grid to fit.

import { state, setState, subscribe } from "../../state.js?v=10";
import {
  LAYOUT_ELEMENTS,
  LAYOUT_TARGETS,
  LAYOUT_ZONES,
  normalizeComposition,
  layoutModeFromComposition,
  describeComposition,
} from "../../modules/layoutCompositionEngine.js?v=10";

const SCOPES = [
  { id: "global", label: "Global", note: "One layout template applied to every page." },
  { id: "page-specific", label: "Page-Specific", note: "Customize the active image; others stay on the global template." },
];

const ALIGNS = [
  { id: "start", label: "Left" },
  { id: "center", label: "Center" },
  { id: "end", label: "Right" },
];

// Which edge the fine offset slider measures from when a text element sits on the
// blank facing page — "Center" + a small negative offset is exactly "a little above
// the page's vertical center."
const ANCHORS = [
  { id: "top", label: "Anchor: Top Edge" },
  { id: "center", label: "Anchor: Page Center" },
  { id: "bottom", label: "Anchor: Bottom Edge" },
];

const el = {
  scopeOptions: document.getElementById("layout-scope-options"),
  scopeHint: document.getElementById("layout-scope-hint"),
  map: document.getElementById("layout-map"),
  controls: document.getElementById("element-controls"),
  summary: document.getElementById("composition-summary"),
};

let dragId = null;

export function initLayoutComposerPanel() {
  renderScopeOptions();
  subscribe(render);
  render(state);
}

// --- edit target resolution (global vs. the active per-image composition) ---

function editableComposition(current) {
  if (current.layoutScope === "page-specific") {
    const item = current.batchItems.find((i) => i.id === current.activeBatchItemId);
    if (item) return normalizeComposition(item.settings.composition ?? current.globalComposition);
  }
  return normalizeComposition(current.globalComposition);
}

function commitComposition(nextComp) {
  if (state.layoutScope === "page-specific") {
    const item = state.batchItems.find((i) => i.id === state.activeBatchItemId);
    if (item) {
      const batch = state.batchItems.map((it) =>
        it.id === item.id ? { ...it, settings: { ...it.settings, composition: nextComp } } : it
      );
      setState({ batchItems: batch });
      return;
    }
  }
  // Global scope also keeps the legacy layoutMode mirror aligned with the color key.
  setState({ globalComposition: nextComp, layoutMode: layoutModeFromComposition(nextComp) });
}

function setElement(id, changes) {
  const comp = editableComposition(state);
  commitComposition({ ...comp, [id]: { ...comp[id], ...changes } });
}

// --- scope ---

function renderScopeOptions() {
  el.scopeOptions.innerHTML = "";
  SCOPES.forEach((scope) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.scopeId = scope.id;
    btn.innerHTML = `<strong>${scope.label}</strong><span class="size-note">${scope.note}</span>`;
    btn.addEventListener("click", () => setState({ layoutScope: scope.id }));
    el.scopeOptions.appendChild(btn);
  });
}

// --- render ---

function render(current) {
  const comp = editableComposition(current);

  el.scopeOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scopeId === current.layoutScope);
  });

  const activeItem = current.batchItems.find((i) => i.id === current.activeBatchItemId);
  if (current.layoutScope === "page-specific") {
    el.scopeHint.textContent = activeItem
      ? `Editing “${activeItem.name}”. Changes apply to this page only.`
      : "Select an image in the storyboard to give it a page-specific layout. Editing the global template until then.";
  } else {
    el.scopeHint.textContent = "Editing the global layout template — applies to all pages.";
  }

  renderMap(comp, current);
  renderControls(comp, current);
  const summary = describeComposition(comp);
  el.summary.textContent = summary.length ? `Placed: ${summary.join(" · ")}.` : "No elements placed on the page.";
}

function chipZoneFor(elConfig) {
  if (!elConfig.enabled || elConfig.target === "off") return "hidden";
  if (elConfig.target === "blank") return "blank";
  return elConfig.zone; // top/bottom/left/right
}

function renderMap(comp, current) {
  el.map.innerHTML = `
    <div class="map-page" data-page="grid">
      <div class="map-page-title">Puzzle Page</div>
      <div class="layout-zone zone-top" data-zone="top" data-target="grid"></div>
      <div class="zone-mid">
        <div class="layout-zone zone-left" data-zone="left" data-target="grid"></div>
        <div class="zone-grid">GRID</div>
        <div class="layout-zone zone-right" data-zone="right" data-target="grid"></div>
      </div>
      <div class="layout-zone zone-bottom" data-zone="bottom" data-target="grid"></div>
    </div>
    <div class="map-page" data-page="blank">
      <div class="map-page-title">Blank Facing Page</div>
      <div class="layout-zone zone-blank" data-target="blank"></div>
    </div>
    <div class="map-tray">
      <div class="map-page-title">Hidden</div>
      <div class="layout-zone zone-hidden" data-target="off"></div>
    </div>
  `;

  const zoneEl = (key) => el.map.querySelector(`[data-zone="${key}"]`) || el.map.querySelector(`.zone-${key}`);

  LAYOUT_ELEMENTS.forEach(({ id, label }) => {
    const chip = document.createElement("div");
    chip.className = "layout-chip";
    chip.dataset.elementId = id;
    chip.textContent = label;
    chip.addEventListener("mousedown", (e) => startChipDrag(e, chip, id));

    const zoneKey = chipZoneFor(comp[id]);
    const slot = zoneKey === "blank" ? el.map.querySelector(".zone-blank")
      : zoneKey === "hidden" ? el.map.querySelector(".zone-hidden")
      : zoneEl(zoneKey);
    (slot || el.map.querySelector(".zone-hidden")).appendChild(chip);
  });
}

function startChipDrag(e, chip, id) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragId = id;
  chip.classList.add("dragging");

  const onMove = (moveEvent) => {
    const zone = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest(".layout-zone");
    el.map.querySelectorAll(".layout-zone.drop-hover").forEach((z) => z.classList.remove("drop-hover"));
    if (zone) zone.classList.add("drop-hover");
  };
  const onUp = (upEvent) => {
    document.removeEventListener("mousemove", onMove);
    chip.classList.remove("dragging");
    el.map.querySelectorAll(".layout-zone.drop-hover").forEach((z) => z.classList.remove("drop-hover"));
    const zone = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest(".layout-zone");
    dragId = null;
    if (!zone) return;
    applyDrop(id, zone);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp, { once: true });
}

function applyDrop(id, zone) {
  const target = zone.dataset.target;
  if (target === "off") {
    setElement(id, { enabled: false });
  } else if (target === "blank") {
    setElement(id, { enabled: true, target: "blank" });
  } else {
    setElement(id, { enabled: true, target: "grid", zone: zone.dataset.zone });
  }
}

// --- precise per-element controls (accessible fallback for the drag map) ---

function renderControls(comp, current) {
  // Preserve focus/caret across re-renders for whichever text field is active.
  const activeId = document.activeElement?.dataset?.textElement;
  el.controls.innerHTML = "";

  LAYOUT_ELEMENTS.forEach((element) => {
    const cfg = comp[element.id];
    const row = document.createElement("div");
    row.className = "element-row";

    const targetOpts = LAYOUT_TARGETS.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
    const zoneOpts = LAYOUT_ZONES.map((z) => `<option value="${z}">${z[0].toUpperCase() + z.slice(1)}</option>`).join("");
    const alignOpts = ALIGNS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("");

    const effectiveTarget = cfg.enabled ? cfg.target : "off";
    // Anchor + fine offset only matter once text sits on the blank facing page — the
    // grid page stays on the existing zone-band system since it has far less spare room.
    const showBlankPosition = element.isText && effectiveTarget === "blank";
    const anchorOpts = ANCHORS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("");
    row.innerHTML = `
      <div class="element-row-head">
        <label class="element-toggle"><input type="checkbox" class="el-enabled" ${cfg.enabled ? "checked" : ""}/> ${element.label}</label>
        <select class="el-target">${targetOpts}</select>
      </div>
      <div class="element-row-opts">
        <select class="el-zone" ${effectiveTarget === "grid" ? "" : "hidden"}>${zoneOpts}</select>
        ${element.isText ? `<select class="el-align">${alignOpts}</select>` : ""}
      </div>
      ${element.isText ? `<input type="text" class="el-text text-input" data-text-element="${element.id}" placeholder="${textPlaceholder(element.id, current)}" />` : ""}
      ${element.isText ? `
        <div class="element-row-opts blank-position-row" ${showBlankPosition ? "" : "hidden"}>
          <select class="el-anchor">${anchorOpts}</select>
          <input type="range" class="el-offset" min="-3" max="3" step="0.1" />
          <span class="el-offset-readout"></span>
        </div>
      ` : ""}
    `;

    const targetSel = row.querySelector(".el-target");
    targetSel.value = effectiveTarget;
    const zoneSel = row.querySelector(".el-zone");
    if (zoneSel) zoneSel.value = cfg.zone;
    const alignSel = row.querySelector(".el-align");
    if (alignSel) alignSel.value = cfg.align;
    const textInput = row.querySelector(".el-text");
    if (textInput) textInput.value = cfg.text ?? "";
    const anchorSel = row.querySelector(".el-anchor");
    const offsetSlider = row.querySelector(".el-offset");
    const offsetReadout = row.querySelector(".el-offset-readout");
    if (anchorSel) anchorSel.value = cfg.anchor ?? "top";
    if (offsetSlider) offsetSlider.value = String(cfg.offsetIn ?? 0);
    if (offsetReadout) offsetReadout.textContent = `${(cfg.offsetIn ?? 0).toFixed(1)}"`;

    row.querySelector(".el-enabled").addEventListener("change", (e) => setElement(element.id, { enabled: e.target.checked }));
    targetSel.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v === "off") setElement(element.id, { enabled: false });
      else setElement(element.id, { enabled: true, target: v });
    });
    if (zoneSel) zoneSel.addEventListener("change", (e) => setElement(element.id, { zone: e.target.value }));
    if (alignSel) alignSel.addEventListener("change", (e) => setElement(element.id, { align: e.target.value }));
    if (textInput) textInput.addEventListener("change", (e) => setElement(element.id, { text: e.target.value }));
    if (anchorSel) anchorSel.addEventListener("change", (e) => setElement(element.id, { anchor: e.target.value }));
    if (offsetSlider) {
      offsetSlider.addEventListener("input", (e) => {
        offsetReadout.textContent = `${Number(e.target.value).toFixed(1)}"`;
        setElement(element.id, { offsetIn: Number(e.target.value) });
      });
    }

    el.controls.appendChild(row);
  });

  if (activeId) {
    const restored = el.controls.querySelector(`[data-text-element="${activeId}"]`);
    if (restored) restored.focus();
  }
}

function textPlaceholder(id, current) {
  if (id === "title") return current.bookTitle || "Book title";
  if (id === "subtitle") return current.bookSubtitle || "Subtitle";
  return "Instruction text";
}
