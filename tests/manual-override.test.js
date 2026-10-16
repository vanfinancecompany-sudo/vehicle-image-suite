import test from "node:test";
import assert from "node:assert/strict";
import { createJob, formatPrice } from "../src/campaign/campaignModel.js";
import { manualPriceInputs, parseManualPriceOverride } from "../src/campaign/manualOverride.js";

test("manual prices replace unreadable OCR amounts for one registration", () => {
  const job = createJob({ registration: "BL22 AWH", wasPrice: "", nowPrice: "", savePrice: "" });
  const result = parseManualPriceOverride({ wasPrice: "£14,295", nowPrice: "£13,195", savePrice: "£1,100" });
  assert.equal(result.error, "");
  assert.equal(formatPrice(result.prices.wasPrice), "£14,295");
  assert.equal(formatPrice(result.prices.nowPrice), "£13,195");
  assert.equal(formatPrice(result.prices.savePrice), "£1,100");
  const saved = { ...job, ...result.prices, warnings: [], priceRead: { status: "manual", reviewed: true } };
  assert.equal(saved.registration, "BL22 AWH");
  assert.equal(saved.priceRead.status, "manual");
});

test("manual SAVE is optional and calculated correctly", () => {
  const result = parseManualPriceOverride({ wasPrice: "8,495", nowPrice: "8,195", savePrice: "" });
  assert.equal(result.error, "");
  assert.equal(result.prices.savePrice.value, 300);
});
test("manual price entry retains pence", () => {
  const result = parseManualPriceOverride({ wasPrice: "£10,495.50", nowPrice: "9,995.25", savePrice: "500.25" });
  assert.equal(result.error, "");
  assert.equal(result.prices.savePrice.value, 500.25);
  assert.equal(formatPrice(result.prices.nowPrice), "£9,995.25");
});
test("manual prices reject missing or non-numeric fields", () => {
  for (const fields of [
    { wasPrice: "invalid", nowPrice: "11995" },
    { wasPrice: "", nowPrice: "11995" },
    { wasPrice: "12995", nowPrice: "" },
    { wasPrice: "12995", nowPrice: "11995", savePrice: "nonsense" },
  ]) assert.ok(parseManualPriceOverride(fields).error);
});
test("manual override rejects incorrect or inverted advertised savings", () => {
  assert.match(parseManualPriceOverride({ wasPrice: "12,995", nowPrice: "11,995", savePrice: "500" }).error, /SAVE must equal/);
  assert.match(parseManualPriceOverride({ wasPrice: "11,995", nowPrice: "12,995", savePrice: "" }).error, /NOW must be lower/);
});
test("price inputs show saved values, or blanks for a fresh import", () => {
  const a = createJob({ registration: "ABC", wasPrice: "", nowPrice: "" });
  assert.deepEqual(manualPriceInputs(a), { wasPrice: "", nowPrice: "", savePrice: "" });
  const b = createJob({ registration: "DEF", wasPrice: "9,000", nowPrice: "8,500", savePrice: "500" });
  assert.deepEqual(manualPriceInputs(b), { wasPrice: "9000", nowPrice: "8500", savePrice: "500" });
});
