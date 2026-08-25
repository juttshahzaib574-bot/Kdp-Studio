import { initApp } from "./ui/app.js";
import { initGridBorderPanel } from "./ui/panels/gridBorderPanel.js";
import { initLayoutResolutionPanel } from "./ui/panels/layoutResolutionPanel.js";
import { initLayoutComposerPanel } from "./ui/panels/layoutComposerPanel.js";
import { initColorKeyPanel } from "./ui/panels/colorKeyPanel.js";
import { initBatchStoryboardPanel } from "./ui/panels/batchStoryboardPanel.js";
import { initGalleryPanel } from "./ui/panels/galleryPanel.js";
import { initPreviewGalleryPanel } from "./ui/panels/previewGalleryPanel.js";
import { initExportPanel } from "./ui/panels/exportPanel.js";
import { initPdfPreviewPanel } from "./ui/panels/pdfPreviewPanel.js";

function init() {
  initApp();
  initGridBorderPanel();
  initLayoutResolutionPanel();
  initLayoutComposerPanel();
  initColorKeyPanel();
  initBatchStoryboardPanel();
  initGalleryPanel();
  initPreviewGalleryPanel();
  initExportPanel();
  initPdfPreviewPanel();
}

document.addEventListener("DOMContentLoaded", init);
