import { parsePrice } from "./campaignModel.js";

export function displayManualPrice(price) {
  if (!price || !Number.isFinite(price.value)) return "";
  return price.value.toFixed(price.pence ? 2 : 0);
}

export function manualPriceInputs(job) {
  return {
    wasPrice: displayManualPrice(job?.wasPrice),
    nowPrice: displayManualPrice(job?.nowPrice),
    savePrice: displayManualPrice(job?.savePrice),
  };
}

// Pure validation for the manual fallback. Never publish a price whose
// three advertised amounts contradict one another.
export function parseManualPriceOverride(inputs) {
  const wasPrice = parsePrice(inputs?.wasPrice);
  const nowPrice = parsePrice(inputs?.nowPrice);
  const saveSupplied = String(inputs?.savePrice ?? "").trim() !== "";
  let savePrice = saveSupplied ? parsePrice(inputs.savePrice) : null;

  if (!wasPrice || !nowPrice || wasPrice.value <= 0 || nowPrice.value <= 0) {
    return { error: "Enter valid positive WAS and NOW prices.", prices: null };
  }
  if (nowPrice.value >= wasPrice.value) {
    return { error: "NOW must be lower than WAS for a sale advert.", prices: null };
  }
  const reduction = Math.round((wasPrice.value - nowPrice.value) * 100) / 100;
  if (saveSupplied && (!savePrice || savePrice.value < 0)) {
    return { error: "Enter a valid SAVE amount or leave it blank to calculate automatically.", prices: null };
  }
  if (savePrice && Math.abs(savePrice.value - reduction) > 0.01) {
    return { error: "SAVE must equal WAS minus NOW (£" + reduction.toLocaleString("en-GB", {
      minimumFractionDigits: reduction % 1 ? 2 : 0, maximumFractionDigits: 2,
    }) + "). Correct the price or leave SAVE blank.", prices: null };
  }
  if (!savePrice) savePrice = {
    value: reduction,
    pence: wasPrice.pence || nowPrice.pence,
  };
  return { error: "", prices: { wasPrice, nowPrice, savePrice } };
}
