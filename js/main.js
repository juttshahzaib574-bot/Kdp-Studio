import { initApp } from "./ui/app.js?v=7";
import { initGridBorderPanel } from "./ui/panels/gridBorderPanel.js?v=7";
import { initLayoutResolutionPanel } from "./ui/panels/layoutResolutionPanel.js?v=7";
import { initLayoutComposerPanel } from "./ui/panels/layoutComposerPanel.js?v=7";
import { initColorKeyPanel } from "./ui/panels/colorKeyPanel.js?v=7";
import { initBatchStoryboardPanel } from "./ui/panels/batchStoryboardPanel.js?v=7";
import { initGalleryPanel } from "./ui/panels/galleryPanel.js?v=7";
import { initPreviewGalleryPanel } from "./ui/panels/previewGalleryPanel.js?v=7";
import { initExportPanel } from "./ui/panels/exportPanel.js?v=7";
import { initPdfPreviewPanel } from "./ui/panels/pdfPreviewPanel.js?v=7";

// Each panel's init runs in isolation: a single missing/mismatched DOM element in
// one panel (e.g. a stale-cached module paired with fresh HTML, or vice versa) throws
// and stops JUST that panel — without this, an uncaught error partway through this
// list would silently prevent every panel listed AFTER it from ever initializing at
// all, which is a far more confusing symptom than the one broken panel on its own.
function safeInit(name, initFn) {
  try {
    initFn();
  } catch (err) {
    console.error(`[KDP Studio] Failed to initialize ${name} — this panel may not work until the page is hard-refreshed:`, err);
  }
}

function init() {
  safeInit("app shell", initApp);
  safeInit("Grid/Border panel", initGridBorderPanel);
  safeInit("Layout/Resolution panel", initLayoutResolutionPanel);
  safeInit("Layout Composer panel", initLayoutComposerPanel);
  safeInit("Color Key panel", initColorKeyPanel);
  safeInit("Batch/Storyboard panel", initBatchStoryboardPanel);
  safeInit("Asset Gallery panel", initGalleryPanel);
  safeInit("Live Preview panel", initPreviewGalleryPanel);
  safeInit("Export panel", initExportPanel);
  safeInit("PDF Preview panel", initPdfPreviewPanel);
}

document.addEventListener("DOMContentLoaded", init);
