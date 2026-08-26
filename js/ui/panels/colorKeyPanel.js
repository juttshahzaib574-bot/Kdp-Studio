import { state, setState, subscribe } from "../../state.js?v=12";
import { COLOR_SET_OPTIONS, getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=12";

const PAIR_CHOICES = [
  { id: "12-24", sizes: [12, 24], label: "12 & 24" },
  { id: "12-36", sizes: [12, 36], label: "12 & 36" },
  { id: "24-36", sizes: [24, 36], label: "24 & 36" },
];

const el = {
  setSelect: document.getElementById("color-set-select"),
  customPairGroup: document.getElementById("custom-pair-group"),
  customPairOptions: document.getElementById("custom-pair-options"),
  swatchList: document.getElementById("color-swatch-list"),
};

export function initColorKeyPanel() {
  renderSetOptions();
  renderPairOptions();

  el.setSelect.addEventListener("change", () => setState({ colorSetOptionId: el.setSelect.value }));

  subscribe(render);
  render(state);
}

function renderSetOptions() {
  el.setSelect.innerHTML = COLOR_SET_OPTIONS.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
}

function renderPairOptions() {
  el.customPairOptions.innerHTML = "";
  PAIR_CHOICES.forEach((pair) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.pairId = pair.id;
    btn.textContent = pair.label;
    btn.addEventListener("click", () => setState({ colorSetCustomPair: pair.sizes }));
    el.customPairOptions.appendChild(btn);
  });
}

function render(current) {
  el.setSelect.value = current.colorSetOptionId;
  el.customPairGroup.hidden = current.colorSetOptionId !== "set-custom-pair";

  el.customPairOptions.querySelectorAll(".option-item").forEach((btn) => {
    const pair = PAIR_CHOICES.find((p) => p.id === btn.dataset.pairId);
    const isActive = JSON.stringify(pair.sizes) === JSON.stringify(current.colorSetCustomPair);
    btn.classList.toggle("active", isActive);
  });

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const palette = buildCombinedPalette(sizes);

  el.swatchList.innerHTML = palette
    .map(
      (swatch) => `
        <div class="swatch-item">
          <span class="swatch-chip" style="background:${swatch.hex}"></span>
          <span class="swatch-name">${swatch.name}</span>
        </div>`
    )
    .join("");
}
