import test from "node:test";
import assert from "node:assert/strict";
import { amountsFromText, pricesFromSaleArtwork, SALE_PRICE_AREAS, SALE_NUMBER_AREAS } from "../src/campaign/salePriceReader.js";
import { parseRows } from "../src/campaign/spreadsheetParser.js";

test("extracts the BMW Oktoberfest advert's prices", () => {
  const result = pricesFromSaleArtwork({
    was: "WAS\\n£72,400", now: "NOW\\n£71,400", save: "SAVE\\n£1,000",
  });
  assert.deepEqual([result.wasPrice, result.nowPrice, result.savePrice], [72400, 71400, 1000]);
  assert.equal(result.ok, true);
});

test("calculates SAVE only when WAS and NOW are sensible", () => {
  const result = pricesFromSaleArtwork({ was: "£17,995", now: "£17,495" });
  assert.equal(result.ok, true);
  assert.equal(result.savePrice, 500);
  assert.match(result.warnings.join(" "), /calculated/);
});

test("crossed-out WAS OCR mismatch uses NOW plus SAVE but flags inference", () => {
  const result = pricesFromSaleArtwork({ was: "£8,995", now: "£8,195", save: "£300" });
  assert.equal(result.ok, true);
  assert.deepEqual([result.wasPrice, result.nowPrice, result.savePrice], [8495, 8195, 300]);
  assert.deepEqual(result.inferredFields, ["was"]);
  assert.match(result.warnings.join(" "), /Confirm/);
});

test("matches alternate OCR readings by price arithmetic", () => {
  const result = pricesFromSaleArtwork({
    was: ["£8,995", "£8,495"], now: ["£8,195"], save: ["£300"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual([result.wasPrice, result.nowPrice, result.savePrice], [8495, 8195, 300]);
  assert.deepEqual(result.inferredFields, []);
});

test("a misread saving is visibly flagged and calculated for confirmation", () => {
  const result = pricesFromSaleArtwork({ was: "£17,995", now: "£17,495", save: "£300" });
  assert.equal(result.ok, true);
  assert.deepEqual([result.wasPrice, result.nowPrice, result.savePrice], [17795, 17495, 300]);
  assert.deepEqual(result.inferredFields, ["was"]);
  assert.ok(result.warnings.length);
});

test("does not approve upside-down prices or unreadable artwork", () => {
  assert.equal(pricesFromSaleArtwork({ was: "£17,000", now: "£19,000" }).ok, false);
  assert.equal(pricesFromSaleArtwork({ was: "SALE", now: "NO VAT", save: "FREE" }).ok, false);
});

test("understands OCR noise after a price", () => {
  assert.deepEqual(amountsFromText("NOW £71,400K"), [71400]);
});

test("each OCR crop remains within the sale artwork", () => {
  for (const area of [...Object.values(SALE_PRICE_AREAS), ...Object.values(SALE_NUMBER_AREAS)]) {
    assert.ok(area.x >= 0 && area.y >= 0 && area.width > 0 && area.height > 0);
    assert.ok(area.x + area.width <= 1 && area.y + area.height <= 1);
  }
});

test("accepts a registration and vehicle URL without sale prices", () => {
  const jobs = parseRows([
    ["Registration", "Vehicle URL", "Image URL"],
    ["BL21XWM", "https://www.vansco.co.uk/stock/example", "https://acdn.uk/example.jpeg"],
  ]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].registration, "BL21XWM");
  assert.equal(jobs[0].vehicleUrl, "https://www.vansco.co.uk/stock/example");
  assert.equal(jobs[0].wasPrice, null);
  assert.equal(jobs[0].nowPrice, null);
});

test("keeps the previous full WAS/NOW/SAVE spreadsheet format", () => {
  const jobs = parseRows([
    ["Reg", "Retail Price", "New Sales Price", "Discount", "Vehicle URL"],
    ["BL21XWM", "18495", "17995", "500", "https://www.vansco.co.uk/stock/example"],
  ]);
  assert.equal(jobs[0].wasPrice.value, 18495);
  assert.equal(jobs[0].nowPrice.value, 17995);
  assert.equal(jobs[0].savePrice.value, 500);
});
