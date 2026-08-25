import { state, setState, subscribe } from "../../state.js";
import { COLOR_SET_OPTIONS, BRANDS, getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js";

const PAIR_CHOICES = [
  { id: "12-24", sizes: [12, 24], label: "12 & 24" },
  { id: "12-36", sizes: [12, 36], label: "12 & 36" },
  { id: "24-36", sizes: [24, 36], label: "24 & 36" },
];

const el = {
  setSelect: document.getElementById("color-set-select"),
  customPairGroup: document.getElementById("custom-pair-group"),
  customPairOptions: document.getElementById("custom-pair-options"),
  brandOptions: document.getElementById("color-brand-options"),
  swatchList: document.getElementById("color-swatch-list"),
};

export function initColorKeyPanel() {
  renderSetOptions();
  renderPairOptions();
  renderBrandOptions();

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

function renderBrandOptions() {
  el.brandOptions.innerHTML = "";
  BRANDS.forEach((brand) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.brandId = brand.id;
    btn.textContent = brand.label;
    btn.addEventListener("click", () => setState({ colorBrand: brand.id }));
    el.brandOptions.appendChild(btn);
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

  el.brandOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.brandId === current.colorBrand);
  });

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const palette = buildCombinedPalette(sizes, current.colorBrand);

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
