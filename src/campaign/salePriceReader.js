// Read price values from the three fixed regions of Vansco's sale artwork.
// This file is deliberately independent of the OCR engine so it can be tested.
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

function pickAmount(text, field) {
  const amounts = amountsFromText(text).filter(value =>
    field === "save" ? value >= 50 && value <= 100000 : value >= 1000 && value <= 1000000);
  if (!amounts.length) return null;
  // Labels and numbers may wrap onto different lines; the biggest plausible
  // currency figure inside each *dedicated price box* is normally the amount.
  return Math.max(...amounts);
}

export function pricesFromSaleArtwork({ was = "", now = "", save = "" } = {}) {
  const wasPrice = pickAmount(was, "was");
  const nowPrice = pickAmount(now, "now");
  const statedSave = pickAmount(save, "save");
  const warnings = [];
  if (!wasPrice || !nowPrice) {
    return { ok: false, wasPrice, nowPrice, savePrice: statedSave,
      warnings: ["Could not confidently read both WAS and NOW. Select the original sale advert or enter prices manually."] };
  }
  const difference = wasPrice - nowPrice;
  if (difference <= 0) {
    warnings.push("NOW is not lower than WAS. Review the original advert.");
  }
  if (statedSave && Math.abs(statedSave - difference) > 1) {
    warnings.push("The printed SAVE amount does not equal WAS minus NOW. Please check the artwork.");
  }
  if (!statedSave && difference > 0) {
    warnings.push("SAVE was not legible; calculated from WAS minus NOW.");
  }
  return { ok: difference > 0 && (!statedSave || Math.abs(statedSave - difference) <= 1),
    wasPrice, nowPrice, savePrice: statedSave || (difference > 0 ? difference : null), warnings };
}

// Relative to the *existing sale advert*, not the clean vehicle photograph.
// Coordinates align with Vansco's 960 x 720 artwork: SAVE top-right;
// WAS bottom-left; NOW to its right. Prices stay anchored in the new template.
export const SALE_PRICE_AREAS = Object.freeze({
  was: { x: 0, y: 0.81, width: 0.23, height: 0.19 },
  now: { x: 0.205, y: 0.81, width: 0.315, height: 0.19 },
  save: { x: 0.705, y: 0, width: 0.295, height: 0.165 },
});
