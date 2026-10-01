import { formatPrice, PRICE_FIELDS } from "./campaignModel.js";

import { PRICE_FONTS, DEFAULT_PRICE_LAYOUT, SAVE_SAFE_AREA } from "./priceDefaults.js";
export { PRICE_FONTS, DEFAULT_PRICE_LAYOUT } from "./priceDefaults.js";

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
  const text = formatPrice(job[field]);
  function measure(size) {
    applyPriceFont(ctx, { ...position, size });
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || size * 0.78;
    const descent = metrics.actualBoundingBoxDescent ?? size * 0.04;
    const bearing = metrics.actualBoundingBoxLeft || 0;
    const inkWidth = metrics.actualBoundingBoxRight != null
      ? bearing + metrics.actualBoundingBoxRight : metrics.width;
    return { bearing, ascent, inkWidth, height: ascent + descent };
  }
  let size = position.size;
  let metrics = measure(size);
  let widthScale = position.widthScale;
  let x = position.x + offset.x, y = position.y + offset.y;
  if (field === "savePrice") {
    const area = SAVE_SAFE_AREA;
    // Font height changes only if the requested height cannot fit at all.
    // Normal values retain their full requested size. Long values fit horizontally.
    if (metrics.height > area.bottom - area.top) {
      size *= (area.bottom - area.top) / metrics.height;
      metrics = measure(size);
      // Canvas hinting can round the new ink height up by a pixel.
      for (let tries = 0; tries < 4 && metrics.height > area.bottom - area.top; tries++) {
        size -= 0.5; metrics = measure(size);
      }
    }
    x = Math.min(area.right - 1, Math.max(area.left, x));
    y = Math.min(area.bottom - metrics.height, Math.max(area.top, y));
    widthScale = Math.min(widthScale, (area.right - x) / Math.max(1, metrics.inkWidth));
  }
  return {
    field, position: { ...position, size, widthScale }, text,
    bearing: metrics.bearing, ascent: metrics.ascent, x, y,
    width: metrics.inkWidth * widthScale, height: metrics.height,
    fitted: size !== position.size || widthScale !== position.widthScale ||
      x !== position.x + offset.x || y !== position.y + offset.y,
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
      ctx.moveTo(-8, box.height * 0.8);
      ctx.lineTo(width + 6, box.height * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

