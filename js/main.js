import { initApp } from "./ui/app.js";
import { initGridBorderPanel } from "./ui/panels/gridBorderPanel.js";
import { initLayoutResolutionPanel } from "./ui/panels/layoutResolutionPanel.js";
import { initColorKeyPanel } from "./ui/panels/colorKeyPanel.js";
import { initBatchStoryboardPanel } from "./ui/panels/batchStoryboardPanel.js";
import { initGalleryPanel } from "./ui/panels/galleryPanel.js";
import { initPreviewGalleryPanel } from "./ui/panels/previewGalleryPanel.js";

function init() {
  initApp();
  initGridBorderPanel();
  initLayoutResolutionPanel();
  initColorKeyPanel();
  initBatchStoryboardPanel();
  initGalleryPanel();
  initPreviewGalleryPanel();
}

document.addEventListener("DOMContentLoaded", init);
