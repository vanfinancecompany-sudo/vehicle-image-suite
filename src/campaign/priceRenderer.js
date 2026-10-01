import { formatPrice, PRICE_FIELDS } from "./campaignModel.js";

export const PRICE_FONTS = [
  { family: "Arimo", weight: 700, label: "Arimo Bold / 700" },
  { family: "Noto Sans", weight: 900, label: "Noto Sans Black / 900" },
  { family: "Roboto", weight: 900, label: "Roboto Black / 900" },
  { family: "League Spartan", weight: 900, label: "League Spartan Black / 900" },
  { family: "League Spartan", weight: 800, label: "League Spartan ExtraBold / 800" },
  { family: "Archivo Black", weight: 400, label: "Archivo Black" },
  { family: "Anton", weight: 400, label: "Anton" },
];

// Ink-top and fixed left-anchor coordinates on the 960 × 720 reference.
// Per-field calibration belongs to the campaign, never to individual vehicle offsets.
export const DEFAULT_PRICE_LAYOUT = {
  wasPrice: { x: 30, y: 643, size: 54, color: "#e2e2e2", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.82 },
  nowPrice: { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.95 },
  savePrice: { x: 695, y: 43, size: 72, color: "#ffffff", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
};

export function pricePosition(layout, field) {
  const value = { ...DEFAULT_PRICE_LAYOUT[field], ...(layout?.[field] || {}) };
  const option = PRICE_FONTS.find(font => font.family === value.fontFamily && font.weight === value.fontWeight)
    || PRICE_FONTS.find(font => font.family === value.fontFamily) || PRICE_FONTS[0];
  return { ...value, fontFamily: option.family, fontWeight: option.weight,
    widthScale: Number.isFinite(value.widthScale) ? Math.min(2, Math.max(0.5, value.widthScale)) : 1 };
}

const fontPromises = new Map();
export async function ensurePriceFont(layout) {
  await Promise.all(PRICE_FIELDS.map(field => {
    const position = pricePosition(layout, field);
    const key = position.fontWeight + ' 72px "' + position.fontFamily + '"';
    if (!fontPromises.has(key)) {
      const promise = (async () => {
        const fonts = await document.fonts.load(key, "£0123456789,.");
        await document.fonts.ready;
        if (!fonts.length || !document.fonts.check(key)) {
          throw new Error(position.fontFamily + " is not ready. Please reload before exporting prices.");
        }
      })().catch(error => { fontPromises.delete(key); throw error; });
      fontPromises.set(key, promise);
    }
    return fontPromises.get(key);
  }));
}

function applyPriceFont(ctx, position) {
  ctx.font = position.fontWeight + " " + position.size + 'px "' + position.fontFamily + '", Impact, "Arial Narrow", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function priceGeometry(ctx, job, field, layout) {
  if (!job[field]) return null;
  const position = pricePosition(layout, field);
  const offset = job.priceOffsets[field] || { x: 0, y: 0 };
  applyPriceFont(ctx, position);
  const text = formatPrice(job[field]);
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || position.size * 0.78;
  const descent = metrics.actualBoundingBoxDescent || position.size * 0.04;
  const bearing = metrics.actualBoundingBoxLeft || 0;
  const inkWidth = metrics.actualBoundingBoxRight != null
    ? bearing + metrics.actualBoundingBoxRight : metrics.width;
  return {
    field, position, text, bearing, ascent,
    x: position.x + offset.x, y: position.y + offset.y,
    width: inkWidth * position.widthScale, height: ascent + descent,
  };
}

export function drawPrices(ctx, job, layout) {
  ctx.save();
  for (const field of PRICE_FIELDS) {
    const box = priceGeometry(ctx, job, field, layout);
    if (!box) continue;
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.scale(box.position.widthScale, 1);
    ctx.fillStyle = box.position.color;
    ctx.fillText(box.text, box.bearing, box.ascent);
    if (field === "wasPrice") {
      ctx.strokeStyle = "#e52929";
      ctx.lineWidth = Math.max(2, box.position.size * 0.075);
      ctx.beginPath();
      const width = box.width / box.position.widthScale;
      ctx.moveTo(-2, box.height * 0.72);
      ctx.lineTo(width + 2, box.height * 0.28);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

