// Fixed-position campaign artwork parser. Keep OCR fallbacks separate from pricing
// so no unverified value is ever written to a vehicle without operator approval.
const PRICE_PATTERN = /\b\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?(?=\D|$)|\b\d{3,6}(?:\.\d{2})?(?=\D|$)/g;

export function amountsFromText(text) {
  const normalised = String(text || "")
    .replace(/[£€]/g, " ")
    .replace(/(?<=\d)[Oo](?=\d|[,\s])|(?<=[,\s])[Oo](?=\d)/g, "0")
    .replace(/(?<=\d)[Il](?=\d)/g, "1");
  return [...normalised.matchAll(PRICE_PATTERN)]
    .map(match => Number(match[0].replace(/[,\s]/g, "")))
    .filter(value => Number.isFinite(value) && value > 0);
}

function validAmounts(texts, field) {
  const sources = Array.isArray(texts) ? texts : [texts];
  const limits = field === "save" ? [50, 100000] : [1000, 1000000];
  return [...new Set(sources.flatMap(amountsFromText)
    .filter(value => value >= limits[0] && value <= limits[1]))];
}

const result = (wasPrice, nowPrice, savePrice, warnings = [], inferredFields = []) => ({
  ok: !!(wasPrice && nowPrice && savePrice && wasPrice > nowPrice &&
    Math.abs(wasPrice - nowPrice - savePrice) <= 1),
  wasPrice, nowPrice, savePrice, warnings, inferredFields,
});

export function pricesFromSaleArtwork({ was = "", now = "", save = "" } = {}) {
  const w = validAmounts(was, "was");
  const n = validAmounts(now, "now");
  const s = validAmounts(save, "save");

  // Try each recognition variant, not just the highest number in the zone.
  // OCR frequently reads a crossed-out WAS amount less accurately.
  for (const wasPrice of w) for (const nowPrice of n) for (const savePrice of s) {
    if (wasPrice > nowPrice && Math.abs(wasPrice - nowPrice - savePrice) <= 1) {
      return result(wasPrice, nowPrice, savePrice);
    }
  }

  // Two reliable zones can reconstruct the third. This is a SUGGESTION
  // and always needs explicit human confirmation alongside the artwork.
  // Prioritise NOW + SAVE because crossed-out WAS figures are difficult OCR.
  if (n.length && s.length) {
    const nowPrice = n[0], savePrice = s[0], wasPrice = nowPrice + savePrice;
    return result(wasPrice, nowPrice, savePrice, [
      "WAS was inferred from NOW + SAVE. Confirm it matches the crossed-out price on Image 1.",
    ], ["was"]);
  }
  if (w.length && n.length && w[0] > n[0]) {
    return result(w[0], n[0], w[0] - n[0], [
      "SAVE was calculated from WAS − NOW. Confirm the printed SAVE figure on Image 1.",
    ], ["save"]);
  }
  if (w.length && s.length && w[0] > s[0]) {
    return result(w[0], w[0] - s[0], s[0], [
      "NOW was inferred from WAS − SAVE. Confirm the printed NOW figure on Image 1.",
    ], ["now"]);
  }

  return result(w[0] || null, n[0] || null, s[0] || null, [
    "Could not reliably identify two price fields. Review Image 1 or enter the prices manually.",
  ]);
}

// Entire sections to read the labels and displayed amounts.
export const SALE_PRICE_AREAS = Object.freeze({
  was: { x: 0, y: 0.81, width: 0.23, height: 0.19 },
  now: { x: 0.205, y: 0.81, width: 0.315, height: 0.19 },
  save: { x: 0.705, y: 0, width: 0.295, height: 0.165 },
});

// Tighter second-pass crops exclude labels/borders so single-line OCR can
// concentrate on currency digits. Kept separate for straightforward tuning.
export const SALE_NUMBER_AREAS = Object.freeze({
  was: { x: 0, y: 0.90, width: 0.18, height: 0.10 },
  now: { x: 0.225, y: 0.885, width: 0.29, height: 0.115 },
  save: { x: 0.78, y: 0.04, width: 0.20, height: 0.105 },
});
