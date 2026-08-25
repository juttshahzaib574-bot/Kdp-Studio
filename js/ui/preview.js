// Draws a to-scale trim/bleed diagram on the <canvas> preview.

const STAGE_PADDING = 40;

export function drawPreview(canvas, { trimSize, dpi, bleedEnabled, canvasDims }) {
  const ctx = canvas.getContext("2d");
  const stageW = canvas.width;
  const stageH = canvas.height;

  ctx.clearRect(0, 0, stageW, stageH);

  const availW = stageW - STAGE_PADDING * 2;
  const availH = stageH - STAGE_PADDING * 2;
  const scale = Math.min(availW / canvasDims.widthIn, availH / canvasDims.heightIn);

  const bleedW = canvasDims.widthIn * scale;
  const bleedH = canvasDims.heightIn * scale;
  const bleedX = (stageW - bleedW) / 2;
  const bleedY = (stageH - bleedH) / 2;

  // Bleed area (outer boundary)
  ctx.fillStyle = "#241a1a";
  ctx.fillRect(bleedX, bleedY, bleedW, bleedH);
  ctx.strokeStyle = "#ef4444";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bleedX, bleedY, bleedW, bleedH);
  ctx.setLineDash([]);

  // Trim area (final cut size), inset from bleed by the bleed amount.
  // Bleed is only added to the outer edge (right) and top/bottom, so the
  // trim box sits flush against the left (spine) edge of the bleed box.
  const bleedPx = canvasDims.bleedIn * scale;
  const trimW = trimSize.widthIn * scale;
  const trimH = trimSize.heightIn * scale;
  const trimX = bleedX;
  const trimY = bleedY + bleedPx;

  ctx.fillStyle = "#1e222b";
  ctx.fillRect(trimX, trimY, trimW, trimH);
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 2;
  ctx.strokeRect(trimX, trimY, trimW, trimH);

  // Spine indicator on the left edge of the trim box.
  ctx.strokeStyle = "#9aa1af";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(trimX, trimY);
  ctx.lineTo(trimX, trimY + trimH);
  ctx.stroke();

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
  ctx.fillText("spine", trimX + 4, trimY + 14);
}
