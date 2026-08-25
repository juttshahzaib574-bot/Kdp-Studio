// Draws a to-scale trim/bleed/safe-zone diagram on a <canvas>. Shared by the
// Module 1/2 dimension preview and the dual-state mosaic preview panels so every
// canvas in the app agrees on the same page geometry.

const STAGE_PADDING = 40;

// Computes the pixel geometry for bleed box, trim box, and safe-zone box within a
// stage of stageW x stageH, honoring which side the spine/gutter is on.
export function computeFrameGeometry(stageW, stageH, { trimSize, bleedEnabled, canvasDims, safeZone, pageSide = "right" }) {
  const availW = stageW - STAGE_PADDING * 2;
  const availH = stageH - STAGE_PADDING * 2;
  const scale = Math.min(availW / canvasDims.widthIn, availH / canvasDims.heightIn);

  const bleedW = canvasDims.widthIn * scale;
  const bleedH = canvasDims.heightIn * scale;
  const bleedX = (stageW - bleedW) / 2;
  const bleedY = (stageH - bleedH) / 2;

  // Bleed is only added to the outer edge + top/bottom, so the trim box sits flush
  // against whichever edge is the spine (left for a right/odd page, right for left/even).
  const bleedPx = canvasDims.bleedIn * scale;
  const trimW = trimSize.widthIn * scale;
  const trimH = trimSize.heightIn * scale;
  const gutterOnLeft = pageSide === "right";
  const trimX = gutterOnLeft ? bleedX : bleedX + bleedPx;
  const trimY = bleedY + bleedPx;

  const safeX = trimX + safeZone.left * scale;
  const safeY = trimY + safeZone.top * scale;
  const safeW = safeZone.widthIn * scale;
  const safeH = safeZone.heightIn * scale;

  return {
    scale,
    bleedX, bleedY, bleedW, bleedH,
    trimX, trimY, trimW, trimH,
    safeX, safeY, safeW, safeH,
    gutterOnLeft,
  };
}

export function drawFrame(ctx, geometry, { trimSize, dpi, bleedEnabled, showLabels = true }) {
  const { bleedX, bleedY, bleedW, bleedH, trimX, trimY, trimW, trimH, safeX, safeY, safeW, safeH, gutterOnLeft } = geometry;

  // Bleed area (outer boundary)
  ctx.fillStyle = "#241a1a";
  ctx.fillRect(bleedX, bleedY, bleedW, bleedH);
  ctx.strokeStyle = "#ef4444";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bleedX, bleedY, bleedW, bleedH);
  ctx.setLineDash([]);

  // Trim area (final cut size)
  ctx.fillStyle = "#1e222b";
  ctx.fillRect(trimX, trimY, trimW, trimH);
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 2;
  ctx.strokeRect(trimX, trimY, trimW, trimH);

  // Safe zone (0.25" trim inset / 0.5" gutter inset)
  ctx.strokeStyle = "#3ad19a";
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeRect(safeX, safeY, safeW, safeH);
  ctx.setLineDash([]);

  // Spine indicator
  const spineX = gutterOnLeft ? trimX : trimX + trimW;
  ctx.strokeStyle = "#9aa1af";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(spineX, trimY);
  ctx.lineTo(spineX, trimY + trimH);
  ctx.stroke();

  if (!showLabels) return;

  ctx.fillStyle = "#e7e9ee";
  ctx.font = "12px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Trim ${trimSize.widthIn}" × ${trimSize.heightIn}"`, trimX + trimW / 2, trimY + trimH / 2 - 8);
  ctx.fillStyle = "#9aa1af";
  ctx.fillText(`${dpi} DPI`, trimX + trimW / 2, trimY + trimH / 2 + 10);

  if (bleedEnabled) {
    ctx.fillStyle = "#fca5a5";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText(`0.125" bleed`, bleedX + bleedW / 2, bleedY + 12);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#9aa1af";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText("spine", gutterOnLeft ? trimX + 4 : trimX + trimW - 34, trimY + 14);
}

export function drawPreview(canvas, { trimSize, dpi, bleedEnabled, canvasDims, safeZone, pageSide = "right" }) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const geometry = computeFrameGeometry(canvas.width, canvas.height, { trimSize, bleedEnabled, canvasDims, safeZone, pageSide });
  drawFrame(ctx, geometry, { trimSize, dpi, bleedEnabled });
  return geometry;
}
