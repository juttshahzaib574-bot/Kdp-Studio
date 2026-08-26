import { state, setState, subscribe } from "../state.js?v=30";
import {
  TRIM_SIZES,
  DPI_MIN,
  DPI_MAX,
  clampDpi,
  getTrimSizeById,
} from "../modules/canvasEngine.js?v=30";
import { computeCanvasDimensions, needsRiskWarning } from "../modules/bleedEngine.js?v=30";
import { computeSafeZone } from "../modules/safeZoneEngine.js?v=30";
import { drawPreview } from "./preview.js?v=30";

const el = {
  trimGrid: document.getElementById("trim-size-options"),
  dpiSlider: document.getElementById("dpi-slider"),
  dpiInput: document.getElementById("dpi-input"),
  bleedToggle: document.getElementById("bleed-toggle"),
  edgeToggle: document.getElementById("edge-to-edge-toggle"),
  riskBanner: document.getElementById("risk-banner"),
  canvas: document.getElementById("preview-canvas"),
  readout: document.getElementById("dimension-readout"),
  riskDialog: document.getElementById("risk-dialog"),
  riskAckCheckbox: document.getElementById("risk-ack-checkbox"),
  riskCancelBtn: document.getElementById("risk-cancel-btn"),
  riskProceedBtn: document.getElementById("risk-proceed-btn"),
};

export function initApp() {
  renderTrimOptions();
  bindCanvasControls();
  bindBleedControls();
  bindRiskDialog();

  subscribe(render);
  render(state);
}

function renderTrimOptions() {
  el.trimGrid.innerHTML = "";
  TRIM_SIZES.forEach((size) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "trim-size-option";
    btn.dataset.sizeId = size.id;
    btn.innerHTML = `
      <span class="size-label">${size.label}</span>
      <span class="size-note">${size.sublabel} — ${size.note}</span>
    `;
    btn.addEventListener("click", () => setState({ trimSizeId: size.id }));
    el.trimGrid.appendChild(btn);
  });
}

function bindCanvasControls() {
  el.dpiSlider.addEventListener("input", () => {
    setState({ dpi: clampDpi(Number(el.dpiSlider.value)) });
  });

  el.dpiInput.addEventListener("change", () => {
    setState({ dpi: clampDpi(Number(el.dpiInput.value)) });
  });
}

function bindBleedControls() {
  el.bleedToggle.addEventListener("change", () => {
    const bleedEnabled = el.bleedToggle.checked;

    if (needsRiskWarning(bleedEnabled, state.edgeToEdgeAsset) && !state.riskAcknowledged) {
      el.bleedToggle.checked = true; // hold at safe state until confirmed
      openRiskDialog();
      return;
    }

    setState({ bleedEnabled, riskAcknowledged: bleedEnabled ? false : state.riskAcknowledged });
  });

  el.edgeToggle.addEventListener("change", () => {
    const edgeToEdgeAsset = el.edgeToggle.checked;

    if (needsRiskWarning(state.bleedEnabled, edgeToEdgeAsset) === false) {
      setState({ edgeToEdgeAsset, riskAcknowledged: false });
      return;
    }

    if (!state.riskAcknowledged) {
      el.edgeToggle.checked = false; // hold until confirmed
      openRiskDialog();
      return;
    }

    setState({ edgeToEdgeAsset });
  });
}

function openRiskDialog() {
  el.riskAckCheckbox.checked = false;
  el.riskProceedBtn.disabled = true;
  el.riskDialog.showModal();
}

function bindRiskDialog() {
  el.riskAckCheckbox.addEventListener("change", () => {
    el.riskProceedBtn.disabled = !el.riskAckCheckbox.checked;
  });

  el.riskCancelBtn.addEventListener("click", () => {
    // Re-enable bleed — the safe default — and close without acknowledging.
    el.riskDialog.close();
    setState({ bleedEnabled: true, edgeToEdgeAsset: state.edgeToEdgeAsset, riskAcknowledged: false });
  });

  el.riskProceedBtn.addEventListener("click", () => {
    el.riskDialog.close();
    setState({
      bleedEnabled: false,
      edgeToEdgeAsset: true,
      riskAcknowledged: true,
    });
  });

  el.riskDialog.addEventListener("cancel", (event) => {
    // ESC key: treat same as Cancel button.
    event.preventDefault();
    el.riskCancelBtn.click();
  });
}

function render(current) {
  const trimSize = getTrimSizeById(current.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const showRisk = needsRiskWarning(current.bleedEnabled, current.edgeToEdgeAsset);

  syncTrimButtons(current.trimSizeId);
  syncDpiControls(current.dpi);

  el.bleedToggle.checked = current.bleedEnabled;
  el.edgeToggle.checked = current.edgeToEdgeAsset;
  el.riskBanner.hidden = !showRisk;

  drawPreview(el.canvas, {
    trimSize,
    dpi: current.dpi,
    bleedEnabled: current.bleedEnabled,
    canvasDims,
    safeZone,
    pageSide: current.pageSide,
  });

  renderReadout(trimSize, current, canvasDims, safeZone);
}

function syncTrimButtons(activeId) {
  el.trimGrid.querySelectorAll(".trim-size-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sizeId === activeId);
  });
}

function syncDpiControls(dpi) {
  if (Number(el.dpiSlider.value) !== dpi) el.dpiSlider.value = String(dpi);
  if (Number(el.dpiInput.value) !== dpi) el.dpiInput.value = String(dpi);
}

function renderReadout(trimSize, current, canvasDims, safeZone) {
  const rows = [
    ["Trim Size", `${trimSize.widthIn}" × ${trimSize.heightIn}"`],
    ["DPI", `${current.dpi}`],
    [
      "Trim Pixels",
      `${Math.round(trimSize.widthIn * current.dpi)} × ${Math.round(trimSize.heightIn * current.dpi)} px`,
    ],
    ["Bleed", current.bleedEnabled ? `0.125" (outer + top/bottom)` : "None (override)"],
    ["Final Canvas", `${canvasDims.widthIn.toFixed(3)}" × ${canvasDims.heightIn.toFixed(3)}"`],
    ["Final Canvas Pixels", `${canvasDims.widthPx} × ${canvasDims.heightPx} px`],
    ["Safe Zone", `${safeZone.widthIn.toFixed(2)}" × ${safeZone.heightIn.toFixed(2)}" (0.5" gutter)`],
  ];

  el.readout.innerHTML = rows
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

// Clamp DPI_MIN/DPI_MAX onto the number input's declared bounds so the two
// stay in sync even if the HTML attributes ever drift from the JS source of truth.
document.addEventListener("DOMContentLoaded", () => {
  el.dpiInput.min = String(DPI_MIN);
  el.dpiInput.max = String(DPI_MAX);
  el.dpiSlider.min = String(DPI_MIN);
  el.dpiSlider.max = String(DPI_MAX);
});
