// Module: Automated Solution Generation Engine + Unified Export Pipeline
// Assembles the full print-ready interior PDF: generated (or custom-uploaded) front
// matter, the puzzle/blank-back spread for every batched image in storyboard order
// (honoring each image's own granular overrides), auto-generated solution pages, and
// back matter — entirely client-side via pdf-lib, no server round-trip.

import { PDFDocument, StandardFonts, rgb } from "../vendor/pdf-lib.esm.min.js";
import { getTrimSizeById } from "../modules/canvasEngine.js";
import { computeCanvasDimensions } from "../modules/bleedEngine.js";
import { computeSafeZone } from "../modules/safeZoneEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../modules/colorKeyEngine.js";
import { computePagination, FRONT_MATTER_INTERIOR_PAGES } from "../modules/storyboardEngine.js";
import { buildSolutionPages } from "../modules/solutionGenerationEngine.js";
import { BORDER_PRESETS } from "../modules/borderStyleEngine.js";
import { splitSafeZoneForKey, migratedKeyStyle } from "../modules/layoutEngine.js";
import { resolveEffectiveGrid } from "../modules/resolutionScalingEngine.js";
import { computeKeyGridLayout } from "../modules/colorKeyLayoutEngine.js";
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
  const words = text.split(/\s+/).filter(Boolean);
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

// Renders a possibly-multi-paragraph, possibly-multi-line block left-aligned, honoring
// blank lines the user typed. Returns the Y position after the last line drawn.
function drawParagraphs(page, text, font, size, marginPt, startY, pageWidth, color, lineGap = 6) {
  const maxWidth = pageWidth - marginPt * 2;
  let y = startY;
  text.split(/\n/).forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      y -= size * 0.8;
      return;
    }
    wrapText(font, trimmed, size, maxWidth).forEach((line) => {
      page.drawText(line, { x: marginPt, y, size, font, color });
      y -= size + lineGap;
    });
  });
  return y;
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

// Per-Image Granularity System: merges an item's overrides onto the global settings.
// Anything left null on the item simply inherits the book-wide default.
function resolveItemEffectiveSettings(item, state, globalPalette) {
  const gridPattern = item.settings.gridPattern ?? state.gridPattern;

  let borderWeightPt = state.borderWeightPt;
  let gridTintPercent = state.gridTintPercent;
  if (item.settings.borderPreset) {
    const preset = BORDER_PRESETS[item.settings.borderPreset];
    borderWeightPt = preset.borderPt;
    gridTintPercent = preset.gridTintPercent;
  }

  const cornerRadiusPercent = item.settings.cornerRadiusPercent ?? state.cornerRadiusPercent;
  const palette = item.settings.colorSetOverride ? buildCombinedPalette([item.settings.colorSetOverride], state.colorBrand) : globalPalette;

  return { gridPattern, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette };
}

function resolveItemBackImage(item, backImagesByAssetId, globalBackImage) {
  const overrideId = item.settings.backBackgroundAssetId;
  if (overrideId && backImagesByAssetId.has(overrideId)) return backImagesByAssetId.get(overrideId);
  return globalBackImage;
}

// ---- Color key legend (numbered, filled swatches) ----
// Shared geometry (computeKeyGridLayout) with the embedded Unified-layout strip and
// the full Expanded-layout migrated page, so both read as the same design language.

function drawKeyEntries(page, rect, palette, regular, textColor, entryHeightMaxIn) {
  const { xPt, yPt, widthPt, heightPt } = rect;
  if (heightPt <= 0 || widthPt <= 0) return;

  const { cols, entryWidthIn, entryHeightIn } = computeKeyGridLayout(palette.length, widthPt / PT_PER_IN, heightPt / PT_PER_IN, undefined, entryHeightMaxIn);
  const entryWidthPt = entryWidthIn * PT_PER_IN;
  const entryHeightPt = entryHeightIn * PT_PER_IN;
  const fontSize = Math.max(5.5, Math.min(9, entryHeightPt * 0.42));
  const swatchSize = Math.max(4, fontSize * 0.85);

  palette.forEach((swatch, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = xPt + col * entryWidthPt;
    const cellTop = yPt + heightPt - row * entryHeightPt;
    const cellY = cellTop - entryHeightPt;
    if (cellY < yPt - 0.5) return; // palette too large for the available strip height

    const { r, g, b } = swatch.rgb;
    page.drawRectangle({
      x: cellX + 3,
      y: cellY + (entryHeightPt - swatchSize) / 2,
      width: swatchSize,
      height: swatchSize,
      color: rgb(r / 255, g / 255, b / 255),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.3,
    });
    page.drawText(`${i + 1} ${swatch.name}`, {
      x: cellX + 3 + swatchSize + 3,
      y: cellY + (entryHeightPt - fontSize) / 2 + 1,
      size: fontSize,
      font: regular,
      color: textColor,
    });
  });
}

// Converts the embedded grid image's reserved key-strip area (in page-relative inches,
// top-down) into a pdf-lib rect (points, bottom-up) — matches exactly where
// renderFullMosaicGrid left the raster canvas blank.
function computeKeyStripPdfRect({ canvasDims, safeZone, pageSide, gridZone, keyStripHeightIn, pageHeightPt }) {
  const trimXIn = pageSide === "right" ? 0 : canvasDims.bleedIn;
  const trimYIn = canvasDims.bleedIn;
  const xIn = trimXIn + safeZone.left;
  const topIn = trimYIn + safeZone.top + gridZone.heightIn;

  return {
    xPt: xIn * PT_PER_IN,
    widthPt: safeZone.widthIn * PT_PER_IN,
    heightPt: keyStripHeightIn * PT_PER_IN,
    yPt: pageHeightPt - topIn * PT_PER_IN - keyStripHeightIn * PT_PER_IN,
  };
}

function drawMigratedKeyPage(page, { palette, bold, regular, w, h, backImage }) {
  const hasBackground = Boolean(backImage);
  if (hasBackground) {
    page.drawImage(backImage, { x: 0, y: 0, width: w, height: h });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  }

  const style = migratedKeyStyle(hasBackground);
  const textColor = style.textColor === "white" ? rgb(0.97, 0.97, 0.97) : rgb(0.18, 0.18, 0.18);
  const dimColor = style.textColor === "white" ? rgb(0.85, 0.85, 0.85) : rgb(0.4, 0.4, 0.4);

  centerText(page, "Your Color Key", bold, 17, h - 52, textColor);
  centerText(page, "Match each number to its color below before you begin.", regular, 9.5, h - 70, dimColor);

  const marginPt = 44;
  drawKeyEntries(page, { xPt: marginPt, yPt: 40, widthPt: w - marginPt * 2, heightPt: h - 112 }, palette, regular, textColor, 0.32);
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
// Distinct from the Color Key: this is for the reader to test-match their physical set,
// not to decode puzzle numbers.
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

// Both optional back-matter pages are skipped entirely when left blank — a fabricated
// bio or promo reads worse than not having the page at all.
function drawAboutArtistPage(page, state, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "About the Artist", bold, 18, h * 0.72);
  drawParagraphs(page, state.authorBio.trim(), regular, 10.5, 70, h * 0.72 - 34, w, rgb(0.3, 0.3, 0.3));
}

function drawSeriesPromoPage(page, state, bold, regular, w, h) {
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  centerText(page, "Also Available", bold, 18, h * 0.72);
  drawParagraphs(page, state.seriesPromoText.trim(), regular, 10.5, 70, h * 0.72 - 34, w, rgb(0.3, 0.3, 0.3));
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

// Blank back page: a selected background (or plain white), plus — per Section 2's
// spec for "Blank Backs" — a bleed-through hint and a small color-test strip near the
// bottom center, so the page stays functionally useful rather than pure filler.
function drawBlankBackPage(page, { backImage, palette, regular, w, h }) {
  const hasBackground = Boolean(backImage);
  if (hasBackground) {
    page.drawImage(backImage, { x: 0, y: 0, width: w, height: h });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  }

  const textColor = hasBackground ? rgb(0.95, 0.95, 0.95) : rgb(0.5, 0.5, 0.5);
  centerText(page, "Tip: Slip a scrap sheet of paper behind this page to protect against marker bleed-through.", regular, 7.5, 32, textColor);

  const boxSize = 12;
  const gap = 6;
  const boxCount = Math.min(palette.length, 10);
  const stripWidth = boxCount * boxSize + (boxCount - 1) * gap;
  const startX = (w - stripWidth) / 2;
  const y = 46;
  for (let i = 0; i < boxCount; i += 1) {
    page.drawRectangle({ x: startX + i * (boxSize + gap), y, width: boxSize, height: boxSize, borderColor: textColor, borderWidth: 0.6 });
  }
}

// ---- Main export pipeline ----

export async function exportInteriorPdf(state, { onProgress } = {}) {
  const trimSize = getTrimSizeById(state.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, state.dpi, state.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, state.pageSide);
  const sizes = getSizesForSelection(state.colorSetOptionId, state.colorSetCustomPair);
  const globalPalette = buildCombinedPalette(sizes, state.colorBrand);
  const pageWidthPt = inToPt(canvasDims.widthIn);
  const pageHeightPt = inToPt(canvasDims.heightIn);

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  // Embed every saved back-page-background asset once, up front, so both the global
  // default and any per-item override can reference them without re-embedding.
  const backgroundAssets = state.assetGallery["back-page-background"] ?? [];
  const backImagesByAssetId = new Map();
  for (const asset of backgroundAssets) {
    backImagesByAssetId.set(asset.id, await embedImageAuto(doc, asset.dataUrl));
  }
  const globalBackImage = backgroundAssets.length > 0 ? backImagesByAssetId.get(backgroundAssets[0].id) : null;

  const hasAboutArtist = Boolean(state.authorBio.trim());
  const hasSeriesPromo = Boolean(state.seriesPromoText.trim());
  const solutionTicks = Math.max(1, Math.ceil(state.batchItems.length / state.solutionThumbsPerPage));
  const totalSteps = 6 + state.batchItems.length + solutionTicks + 1 + 1 + (hasAboutArtist ? 1 : 0) + (hasSeriesPromo ? 1 : 0);
  let completed = 0;
  const reportProgress = (label) => {
    completed += 1;
    onProgress?.({ completed, total: totalSteps, label });
  };

  // ---- Front matter ----
  await addGeneratedOrCustomPage(doc, state, "title-page", pageWidthPt, pageHeightPt, (page) => drawTitlePage(page, state, bold, regular, pageWidthPt, pageHeightPt));
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress("Title Page");

  await addGeneratedOrCustomPage(doc, state, "copyright-page", pageWidthPt, pageHeightPt, (page) => drawCopyrightPage(page, state, regular, pageWidthPt, pageHeightPt));
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress("Copyright Page");

  await addGeneratedOrCustomPage(doc, state, "belongs-to-page", pageWidthPt, pageHeightPt, (page) => drawBelongsToPage(page, bold, pageWidthPt, pageHeightPt));
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress('"Belongs To" Page');

  await addGeneratedOrCustomPage(doc, state, "color-test-page", pageWidthPt, pageHeightPt, (page) => drawColorTestPage(page, globalPalette.length, bold, regular, pageWidthPt, pageHeightPt));
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress("Color Test Page");

  {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawInstructionsPage(page, bold, regular, pageWidthPt, pageHeightPt);
  }
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress("Instructions Page");

  await addGeneratedOrCustomPage(doc, state, "master-palette-page", pageWidthPt, pageHeightPt, (page) => drawMasterPalettePage(page, globalPalette, bold, regular, pageWidthPt, pageHeightPt));
  doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  reportProgress("Master Palette Page");

  // ---- Puzzle interior (storyboard order, per-item overrides applied) ----
  const solvedCanvasByItemId = new Map();
  for (const item of state.batchItems) {
    const effective = resolveItemEffectiveSettings(item, state, globalPalette);
    const sourceCanvas = await resolveItemSource(item);
    const { cellSizeMm: effectiveCellSizeMm, gridOverride } = resolveEffectiveGrid(safeZone, state.cellSizeMm, effective.gridPattern, state.layoutMode, state.resolutionPriority);

    const printCanvas = document.createElement("canvas");
    printCanvas.width = canvasDims.widthPx;
    printCanvas.height = canvasDims.heightPx;
    const renderResult = renderFullMosaicGrid(printCanvas, {
      mode: "print",
      dpi: state.dpi,
      canvasDims,
      safeZone,
      pageSide: state.pageSide,
      layoutMode: state.layoutMode,
      gridPattern: effective.gridPattern,
      cellSizeMm: effectiveCellSizeMm,
      gridOverride,
      borderWeightPt: effective.borderWeightPt,
      gridTintPercent: effective.gridTintPercent,
      cornerRadiusPercent: effective.cornerRadiusPercent,
      palette: effective.palette,
      sourceCanvas,
    });
    const printImage = await doc.embedPng(await canvasToPngBytes(printCanvas));
    const puzzlePage = doc.addPage([pageWidthPt, pageHeightPt]);
    puzzlePage.drawImage(printImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    // Unified Layout: the color key is embedded as crisp vector text/swatches directly
    // on the puzzle page, in the strip renderFullMosaicGrid left reserved and blank.
    if (state.layoutMode === "unified") {
      const rect = computeKeyStripPdfRect({
        canvasDims, safeZone, pageSide: state.pageSide,
        gridZone: renderResult.gridZone, keyStripHeightIn: renderResult.keyStripHeightIn, pageHeightPt,
      });
      drawKeyEntries(puzzlePage, rect, effective.palette, regular, rgb(0.18, 0.18, 0.18), 0.2);
    }

    const solvedCanvas = document.createElement("canvas");
    solvedCanvas.width = canvasDims.widthPx;
    solvedCanvas.height = canvasDims.heightPx;
    renderFullMosaicGrid(solvedCanvas, {
      mode: "solved",
      dpi: state.dpi,
      canvasDims,
      safeZone,
      pageSide: state.pageSide,
      layoutMode: state.layoutMode,
      gridPattern: effective.gridPattern,
      cellSizeMm: effectiveCellSizeMm,
      gridOverride,
      borderWeightPt: effective.borderWeightPt,
      gridTintPercent: effective.gridTintPercent,
      cornerRadiusPercent: effective.cornerRadiusPercent,
      palette: effective.palette,
      sourceCanvas,
    });
    solvedCanvasByItemId.set(item.id, solvedCanvas);

    // Expanded Layout: the facing even page hosts the migrated color key instead of
    // being blank. Unified (or any other) mode gets the standard hint+swatch blank back.
    const backPage = doc.addPage([pageWidthPt, pageHeightPt]);
    const itemBackImage = resolveItemBackImage(item, backImagesByAssetId, globalBackImage);
    if (state.layoutMode === "expanded") {
      drawMigratedKeyPage(backPage, { palette: effective.palette, bold, regular, w: pageWidthPt, h: pageHeightPt, backImage: itemBackImage });
    } else {
      drawBlankBackPage(backPage, { backImage: itemBackImage, palette: effective.palette, regular, w: pageWidthPt, h: pageHeightPt });
    }

    reportProgress(`Puzzle: ${item.name}`);
    await yieldToUi();
  }

  // ---- Back matter: auto-generated Solutions, synced to storyboard order ----
  const paginated = computePagination(state.batchItems, FRONT_MATTER_INTERIOR_PAGES);
  const solutionPages = buildSolutionPages(paginated, state.solutionThumbsPerPage);
  for (const solutionPage of solutionPages) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    await drawSolutionPage(doc, page, solutionPage, solvedCanvasByItemId, bold, regular, pageWidthPt, pageHeightPt);
    doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
    reportProgress("Solution Page");
  }
  if (solutionPages.length === 0) reportProgress("Solutions (skipped — no artwork queued)");

  // ---- Back matter: extra color test pages (2, per Section 2), review, optional pages ----
  for (let i = 0; i < 2; i += 1) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawColorTestPage(page, globalPalette.length, bold, regular, pageWidthPt, pageHeightPt);
    doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  }
  reportProgress("Extra Color Test Pages");

  if (hasAboutArtist) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawAboutArtistPage(page, state, bold, regular, pageWidthPt, pageHeightPt);
    doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
    reportProgress("About the Artist Page");
  }

  // Every content page pairs with a blank facing page (Section 2's single-sided-
  // printing rule) — including these last two, so the interior page count always
  // lands even, which KDP's print pipeline requires.
  {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawReviewRequestPage(page, bold, regular, pageWidthPt, pageHeightPt);
    doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
  }
  reportProgress("Review Request Page");

  if (hasSeriesPromo) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    drawSeriesPromoPage(page, state, bold, regular, pageWidthPt, pageHeightPt);
    doc.addPage([pageWidthPt, pageHeightPt]).drawRectangle({ x: 0, y: 0, width: pageWidthPt, height: pageHeightPt, color: rgb(1, 1, 1) });
    reportProgress("Series Promo Page");
  }

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
