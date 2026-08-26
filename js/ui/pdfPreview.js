// Module: PDF Page Preview — thin wrapper around the vendored pdf.js so the app can show
// the ACTUAL exported PDF bytes rendered page-by-page, not a hand-rolled approximation.
// Rendering the real bytes (rather than duplicating every draw*Page function from
// pdfExport.js onto <canvas>) guarantees the preview can never drift out of sync with
// what actually downloads — same zero-API, fully-local architecture as pdf-lib.

import * as pdfjsLib from "../vendor/pdf.min.mjs?v=26";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs?v=26", import.meta.url).href;

export async function loadPdfDocument(bytes) {
  // pdf.js detaches/transfers the buffer it's given — pass a copy so the caller's own
  // `bytes` (e.g. also handed to downloadPdf) is never silently neutered.
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  return loadingTask.promise;
}

export async function renderPdfPageToCanvas(pdfDoc, pageNumber, canvas, scale) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
}
