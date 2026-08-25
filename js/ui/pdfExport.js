// Module: Automated Solution Generation Engine + Unified Export Pipeline
// Assembles the full print-ready interior PDF: generated (or custom-uploaded) front
// matter, the puzzle/blank-back spread for every batched image in storyboard order,
// auto-generated solution pages, and back matter — entirely client-side via pdf-lib,
// no server round-trip.

import { PDFDocument, StandardFonts, rgb } from "../vendor/pdf-lib.esm.min.js";
import { getTrimSizeById } from "../modules/canvasEngine.js";
import { computeCanvasDimensions } from "../modules/bleedEngine.js";
import { computeSafeZone } from "../modules/safeZoneEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../modules/colorKeyEngine.js";
import { computePagination, FRONT_MATTER_INTERIOR_PAGES } from "../modules/storyboardEngine.js";
import { buildSolutionPages } from "../modules/solutionGenerationEngine.js";
import { renderFullMosaicGrid, getPlaceholderSource, loadImageSource, drawSourceToCanvas } from "./mosaicRenderer.js";

const PT_PER_IN = 72;
const inToPt = (inches) => inches * PT_PER_IN;

function yieldToUi() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function embedImageAuto(doc, dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")
    ? doc.embedJpg(bytes)
    : doc.embedPng(bytes);
}

function wrapText(font, text, fontSize, maxWidthPt) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidthPt && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function centerText(page, text, font, size, y, color = rgb(0.15, 0.15, 0.15)) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

async function resolveItemSource(item) {
  try {
    const img = await loadImageSource(item.objectUrl);
    return drawSourceToCanvas(img, 256);
  } catch {
    return getPlaceholderSource();
  }
}

function buildRenderOpts(state, canvasDims, safeZone, palette, sourceCanvas, mode) {
  return {
    mode,
    dpi: state.dpi,
    canvasDims,
    safeZone,
    pageSide: state.pageSide,
    gridPattern: state.gridPattern,
    cellSizeMm: state.cellSizeMm,
    borderWeightPt: state.borderWeightPt,
    gridTintPercent: state.gridTintPercent,
    cornerRadiusPercent: state.cornerRadiusPercent,
    palette,
    sourceCanvas,
  };
}

// ---- Generated front/back matter pages ----

function drawTitlePage(page, state, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, state.bookTitle, bold, 26, h * 0.6);
  if (state.bookSubtitle) centerText(page, state.bookSubtitle, regular, 13, h * 0.6 - 30);
  if (state.bookAuthor) centerText(page, state.bookAuthor, regular, 12, h * 0.25, rgb(0.35, 0.35, 0.35));
}

function drawCopyrightPage(page, state, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  const year = new Date().getFullYear();
  const lines = [
    `Copyright © ${year} ${state.bookAuthor || state.bookTitle}`,
    "All rights reserved.",
    "No part of this publication may be reproduced, distributed, or transmitted in any",
    "form or by any means without the prior written permission of the copyright owner,",
    "except for brief quotations used in a review.",
    "",
    "This book is intended for personal entertainment use only.",
  ];
  let y = h * 0.55;
  lines.forEach((line) => {
    if (line) centerText(page, line, regular, 10, y, rgb(0.35, 0.35, 0.35));
    y -= 16;
  });
}

function drawBelongsToPage(page, bold, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "This Mystery Mosaic Book", bold, 20, h * 0.62);
  centerText(page, "Belongs To:", bold, 20, h * 0.62 - 26);
  const lineWidth = w * 0.55;
  const lineY = h * 0.42;
  page.drawLine({
    start: { x: (w - lineWidth) / 2, y: lineY },
    end: { x: (w + lineWidth) / 2, y: lineY },
    thickness: 1,
    color: rgb(0.4, 0.4, 0.4),
  });
}

// Blank swatch grid — for testing the reader's own markers/pencils, per Section 2.
function drawColorTestPage(page, paletteLength, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "Color Test Page", bold, 18, h - 60);
  centerText(page, "Test your markers or pencils here before coloring the puzzle pages.", regular, 10, h - 80, rgb(0.4, 0.4, 0.4));

  const marginPt = 54;
  const cols = 6;
  const boxSize = (w - marginPt * 2) / cols - 8;
  const rows = Math.ceil(paletteLength / cols) || 1;
  let i = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (i >= paletteLength) break;
      const x = marginPt + c * (boxSize + 8);
      const y = h - 120 - r * (boxSize + 8) - boxSize;
      page.drawRectangle({ x, y, width: boxSize, height: boxSize, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1, color: rgb(1, 1, 1) });
      i += 1;
    }
  }
}

// Section 3's "1% top seller" page: printed name + blank box for the reader's own pencil.
function drawMasterPalettePage(page, palette, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "Your Master Color Guide", bold, 18, h - 54);
  centerText(page, `This book utilizes a standard ${palette.length}-color palette.`, regular, 10, h - 74, rgb(0.4, 0.4, 0.4));

  const marginPt = 46;
  const rowH = 26;
  const boxSize = 16;
  const colWidth = (w - marginPt * 2) / 2;
  const perCol = Math.ceil(palette.length / 2);
  let col = 0;
  let row = 0;

  palette.forEach((swatch, i) => {
    const x = marginPt + col * colWidth;
    const y = h - 110 - row * rowH;
    page.drawText(`${i + 1}. ${swatch.name}`, { x, y: y + 4, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) });
    page.drawRectangle({ x: x + colWidth - boxSize - 10, y, width: boxSize, height: boxSize, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1, color: rgb(1, 1, 1) });
    row += 1;
    if (row >= perCol) {
      row = 0;
      col += 1;
    }
  });
}

function drawInstructionsPage(page, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "How to Solve These Mystery Mosaics", bold, 16, h - 60);

  const paragraphs = [
    { text: "Find Your Number: Look at the numbers inside the tiny grid cells on the puzzle page." },
    { text: "Check the Key: Match that number to the corresponding color palette grid on the page." },
    { text: "Color it In: Use your pencil or marker to fill the cell completely. Watch the mystery image slowly reveal itself!" },
    { text: "" },
    { text: "Important: Palette Requirement", heading: true },
    { text: "To complete all the mystery puzzles in this book, you will need a standard 24-Pack of Colored Pencils or Markers (such as standard sets from Crayola, Castle Arts, or Mr. Pen)." },
    { text: "" },
    { text: "Please turn to the next page to view the Master Palette Guide to see the exact shades you will need and to swatch your own colors before you begin!" },
  ];

  const marginPt = 60;
  const maxWidth = w - marginPt * 2;
  let y = h - 100;

  paragraphs.forEach(({ text, heading }) => {
    if (!text) {
      y -= 10;
      return;
    }
    const font = heading ? bold : regular;
    const size = heading ? 12 : 10.5;
    wrapText(font, text, size, maxWidth).forEach((line) => {
      page.drawText(line, { x: marginPt, y, size, font, color: rgb(0.2, 0.2, 0.2) });
      y -= size + 6;
    });
    y -= 6;
  });
}

function drawReviewRequestPage(page, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "Enjoyed This Book?", bold, 20, h * 0.58);
  const lines = [
    "If you had fun solving these mystery mosaics, a quick review on Amazon",
    "would mean the world to us and helps other puzzle lovers find this book.",
    "Thank you for coloring with us!",
  ];
  let y = h * 0.58 - 34;
  lines.forEach((line) => {
    centerText(page, line, regular, 11, y, rgb(0.35, 0.35, 0.35));
    y -= 18;
  });
}

async function drawSolutionPage(doc, page, solutionPage, solvedCanvasByItemId, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "Solutions", bold, 18, h - 50);

  const cols = 2;
  const rows = Math.ceil(solutionPage.thumbnails.length / cols) || 1;
  const marginPt = 50;
  const gap = 16;
  const cellW = (w - marginPt * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - 110 - gap * (rows - 1)) / rows;

  for (let i = 0; i < solutionPage.thumbnails.length; i += 1) {
    const thumb = solutionPage.thumbnails[i];
    const solvedCanvas = solvedCanvasByItemId.get(thumb.itemId);
    if (!solvedCanvas) continue;

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 300;
    thumbCanvas.height = Math.round(300 * (solvedCanvas.height / solvedCanvas.width));
    thumbCanvas.getContext("2d").drawImage(solvedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const pngImage = await doc.embedPng(await canvasToPngBytes(thumbCanvas));

    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginPt + col * (cellW + gap);
    const yTop = h - 90 - row * (cellH + gap);
    const imgHeight = cellH - 20;
    const imgWidth = imgHeight * (pngImage.width / pngImage.height);
    const drawWidth = Math.min(imgWidth, cellW);
    const drawHeight = drawWidth * (pngImage.height / pngImage.width);

    page.drawImage(pngImage, { x: x + (cellW - drawWidth) / 2, y: yTop - cellH + 20, width: drawWidth, height: drawHeight });
    centerTextInBox(page, `Page ${thumb.puzzlePage}`, regular, 9, x, cellW, yTop - cellH + 4);
  }
}

function centerTextInBox(page, text, font, size, boxX, boxW, y) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: boxX + (boxW - width) / 2, y, size, font, color: rgb(0.3, 0.3, 0.3) });
}

async function addGeneratedOrCustomPage(doc, state, categoryId, pageWidthPt, pageHeightPt, generatorFn) {
  const assets = state.assetGallery[categoryId] ?? [];
  const page = doc.addPage([pageWidthPt, pageHeightPt]);
  if (assets.length > 0) {
    const image = await embedImageAuto(doc, assets[0].dataUrl);
    page.drawImage(image, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
    return page;
  }
  generatorFn(page);
  return page;
}

// ---- Main export pipeline ----

export async function exportInteriorPdf(state, { onProgress } = {}) {
  const trimSize = getTrimSizeById(state.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, state.dpi, state.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, state.pageSide);
  const sizes = getSizesForSelection(state.colorSetOptionId, state.colorSetCustomPair);
  const palette = buildCombinedPalette(sizes, state.colorBrand);
  const pageWidthPt = inToPt(canvasDims.widthIn);
  const pageHeightPt = inToPt(canvasDims.heightIn);

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const backgroundAssets = state.assetGallery["back-page-background"] ?? [];
  const backImage = backgroundAssets.length > 0 ? await embedImageAuto(doc, backgroundAssets[0].dataUrl) : null;

  function addBlankPage() {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    if (backImage) {
      page.drawImage(backImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
    } else {
      page.drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
    }
  }

  const totalSteps = 6 + state.batchItems.length + Math.max(1, Math.ceil(state.batchItems.length / state.solutionThumbsPerPage)) + 2;
  let completed = 0;
  const reportProgress = (label) => {
    completed += 1;
    onProgress?.({ completed, total: totalSteps, label });
  };

  // ---- Front matter ----
  await addGeneratedOrCustomPage(doc, state, "title-page", pageWidthPt, pageHeightPt, (page) => drawTitlePage(page, state, bold, regular, pageWidthPt, pageHeightPt));
  addBlankPage();
  reportProgress("Title Page");

  await addGeneratedOrCustomPage(doc, state, "copyright-page", pageWidthPt, pageHeightPt, (page) => drawCopyrightPage(page, state, regular, pageWidthPt, pageHeightPt));
  addBlankPage();
  reportProgress("Copyright Page");

  await addGeneratedOrCustomPage(doc, state, "belongs-to-page", pageWidthPt, pageHeightPt, (page) => drawBelongsToPage(page, bold, pageWidthPt, pageHeightPt));
  addBlankPage();
  reportProgress('"Belongs To" Page');

  await addGeneratedOrCustomPage(doc, state, "color-test-page", pageWidthPt, pageHeightPt, (page) => drawColorTestPage(page, palette.length, bold, regular, pageWidthPt, pageHeightPt));
  addBlankPage();
  reportProgress("Color Test Page");

  {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawInstructionsPage(page, bold, regular, pageWidthPt, pageHeightPt);
  }
  addBlankPage();
  reportProgress("Instructions Page");

  await addGeneratedOrCustomPage(doc, state, "master-palette-page", pageWidthPt, pageHeightPt, (page) => drawMasterPalettePage(page, palette, bold, regular, pageWidthPt, pageHeightPt));
  addBlankPage();
  reportProgress("Master Palette Page");

  // ---- Puzzle interior (storyboard order) ----
  const solvedCanvasByItemId = new Map();
  for (const item of state.batchItems) {
    const sourceCanvas = await resolveItemSource(item);

    const printCanvas = document.createElement("canvas");
    printCanvas.width = canvasDims.widthPx;
    printCanvas.height = canvasDims.heightPx;
    renderFullMosaicGrid(printCanvas, buildRenderOpts(state, canvasDims, safeZone, palette, sourceCanvas, "print"));
    const printImage = await doc.embedPng(await canvasToPngBytes(printCanvas));
    const puzzlePage = doc.addPage([pageWidthPt, pageHeightPt]);
    puzzlePage.drawImage(printImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    const solvedCanvas = document.createElement("canvas");
    solvedCanvas.width = canvasDims.widthPx;
    solvedCanvas.height = canvasDims.heightPx;
    renderFullMosaicGrid(solvedCanvas, buildRenderOpts(state, canvasDims, safeZone, palette, sourceCanvas, "solved"));
    solvedCanvasByItemId.set(item.id, solvedCanvas);

    addBlankPage();
    reportProgress(`Puzzle: ${item.name}`);
    await yieldToUi();
  }

  // ---- Back matter: auto-generated Solutions, synced to storyboard order ----
  const paginated = computePagination(state.batchItems, FRONT_MATTER_INTERIOR_PAGES);
  const solutionPages = buildSolutionPages(paginated, state.solutionThumbsPerPage);
  for (const solutionPage of solutionPages) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    await drawSolutionPage(doc, page, solutionPage, solvedCanvasByItemId, bold, regular, pageWidthPt, pageHeightPt);
    addBlankPage();
    reportProgress("Solution Page");
  }
  if (solutionPages.length === 0) reportProgress("Solutions (skipped — no artwork queued)");

  // ---- Back matter: extra color test + review request ----
  {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawColorTestPage(page, palette.length, bold, regular, pageWidthPt, pageHeightPt);
  }
  addBlankPage();
  reportProgress("Extra Color Test Page");

  {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawReviewRequestPage(page, bold, regular, pageWidthPt, pageHeightPt);
  }
  reportProgress("Review Request Page");

  return doc.save();
}

export function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
