import { initApp } from "./ui/app.js?v=6";
import { initGridBorderPanel } from "./ui/panels/gridBorderPanel.js?v=6";
import { initLayoutResolutionPanel } from "./ui/panels/layoutResolutionPanel.js?v=6";
import { initLayoutComposerPanel } from "./ui/panels/layoutComposerPanel.js?v=6";
import { initColorKeyPanel } from "./ui/panels/colorKeyPanel.js?v=6";
import { initBatchStoryboardPanel } from "./ui/panels/batchStoryboardPanel.js?v=6";
import { initGalleryPanel } from "./ui/panels/galleryPanel.js?v=6";
import { initPreviewGalleryPanel } from "./ui/panels/previewGalleryPanel.js?v=6";
import { initExportPanel } from "./ui/panels/exportPanel.js?v=6";
import { initPdfPreviewPanel } from "./ui/panels/pdfPreviewPanel.js?v=6";

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
