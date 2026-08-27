import { initApp } from "./ui/app.js?v=43";
import { initGridBorderPanel } from "./ui/panels/gridBorderPanel.js?v=43";
import { initLayoutResolutionPanel } from "./ui/panels/layoutResolutionPanel.js?v=43";
import { initLayoutComposerPanel } from "./ui/panels/layoutComposerPanel.js?v=43";
import { initColorKeyPanel } from "./ui/panels/colorKeyPanel.js?v=43";
import { initBatchStoryboardPanel } from "./ui/panels/batchStoryboardPanel.js?v=43";
import { initGalleryPanel } from "./ui/panels/galleryPanel.js?v=43";
import { initPreviewGalleryPanel } from "./ui/panels/previewGalleryPanel.js?v=43";
import { initExportPanel } from "./ui/panels/exportPanel.js?v=43";
import { initPdfPreviewPanel } from "./ui/panels/pdfPreviewPanel.js?v=43";

// Each panel's init runs in isolation: a single missing/mismatched DOM element in
// one panel (e.g. a stale-cached module paired with fresh HTML, or vice versa) throws
// and stops JUST that panel — without this, an uncaught error partway through this
// list would silently prevent every panel listed AFTER it from ever initializing at
// all, which is a far more confusing symptom than the one broken panel on its own.
// `await`ed even though initFn may be sync — a plain try/catch around a *call* to an
// async function only catches errors before its first internal await; anything after
// that would otherwise become a silent unhandled rejection instead of being caught here.
async function safeInit(name, initFn) {
  try {
    await initFn();
  } catch (err) {
    console.error(`[KDP Studio] Failed to initialize ${name} — this panel may not work until the page is hard-refreshed:`, err);
  }
}

async function init() {
  await safeInit("app shell", initApp);
  await safeInit("Grid/Border panel", initGridBorderPanel);
  await safeInit("Layout/Resolution panel", initLayoutResolutionPanel);
  await safeInit("Layout Composer panel", initLayoutComposerPanel);
  await safeInit("Color Key panel", initColorKeyPanel);
  await safeInit("Batch/Storyboard panel", initBatchStoryboardPanel);
  await safeInit("Asset Gallery panel", initGalleryPanel);
  await safeInit("Live Preview panel", initPreviewGalleryPanel);
  await safeInit("Export panel", initExportPanel);
  await safeInit("PDF Preview panel", initPdfPreviewPanel);
}

document.addEventListener("DOMContentLoaded", init);
