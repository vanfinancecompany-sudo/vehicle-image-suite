import { formatPrice, PRICE_FIELDS } from "./campaignModel.js";

// 960 × 720 starting positions. Template-specific calibration is saved on the campaign.
// Coordinates are the LEFT edge of the pound sign and the top of the value.
// The customer's browser-only master PNG is intentionally never replaced.
export const DEFAULT_PRICE_LAYOUT = {
  wasPrice: { x: 30, y: 646, size: 39, color: "#e2e2e2" },
  nowPrice: { x: 228, y: 638, size: 50, color: "#111111" },
  savePrice: { x: 704, y: 45, size: 50, color: "#ffffff" },
};

let fontPromise;
export function ensurePriceFont() {
  fontPromise ||= (async () => {
    const fonts = await document.fonts.load('50px "Anton"', "£0123456789,.");
    await document.fonts.ready;
    if (!fonts.length || !document.fonts.check('50px "Anton"')) {
      throw new Error("Anton is not ready. Please reload before exporting campaign prices.");
    }
  })().catch(error => { fontPromise = null; throw error; });
  return fontPromise;
}

export function drawPrices(ctx, job, layout = DEFAULT_PRICE_LAYOUT) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const field of PRICE_FIELDS) {
    if (!job[field]) continue;
    const position = layout[field] || DEFAULT_PRICE_LAYOUT[field];
    const offset = job.priceOffsets[field] || { x: 0, y: 0 };
    const x = position.x + offset.x;
    const y = position.y + offset.y;
    const text = formatPrice(job[field]);
    ctx.font = position.size + 'px "Anton", Impact, "Arial Narrow", sans-serif';
    ctx.fillStyle = position.color;
    ctx.fillText(text, x, y);
    if (field === "wasPrice") {
      ctx.strokeStyle = "#e52929";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + position.size * 0.54);
      ctx.lineTo(x + ctx.measureText(text).width + 2, y + position.size * 0.46);
      ctx.stroke();
    }
  }
  ctx.restore();
}
