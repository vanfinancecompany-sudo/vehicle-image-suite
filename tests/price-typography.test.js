import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRICE_LAYOUT, SAVE_SAFE_AREA, migrateCampaignPriceDefaults } from "../src/campaign/priceDefaults.js";
import { drawPrices, priceGeometry } from "../src/campaign/priceRenderer.js";
import { loadCampaign, saveCampaign } from "../src/campaign/campaignStorage.js";
import { createJob, newCampaign, PRICE_FIELDS } from "../src/campaign/campaignModel.js";

function context() {
  return { font: "", save() {}, restore() {}, translate() {}, scale() {},
    fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(text) {
      const size = parseFloat(this.font.split(" ")[1]);
      return { width: text.length * size * 0.5, actualBoundingBoxLeft: 2,
        actualBoundingBoxRight: text.length * size * 0.5 - 2,
        actualBoundingBoxAscent: size * 0.7, actualBoundingBoxDescent: size * 0.12 };
    },
  };
}
const job = () => createJob({ registration: "HJ22 LSK", wasPrice: "14495", nowPrice: "13995", savePrice: "1500" });
const oldLayout = () => ({
  wasPrice: { x: 30, y: 643, size: 54, color: "#e2e2e2", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.82 },
  nowPrice: { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.95 },
  savePrice: { x: 695, y: 43, size: 72, color: "#ffffff", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
});
test("reproducible Noto Sans Black is the default for all three fields", () => {
  for (const field of PRICE_FIELDS) {
    assert.equal(DEFAULT_PRICE_LAYOUT[field].fontFamily, "Noto Sans");
    assert.equal(DEFAULT_PRICE_LAYOUT[field].fontWeight, 900);
  }
});
test("every price keeps its ink-left anchor and height while width changes", () => {
  for (const field of PRICE_FIELDS) {
    const ctx = context(), vehicle = job();
    const normal = priceGeometry(ctx, vehicle, field, { [field]: { widthScale: 0.8 } });
    const wider = priceGeometry(ctx, vehicle, field, { [field]: { widthScale: 1 } });
    assert.equal(wider.x, normal.x); assert.equal(wider.y, normal.y);
    assert.equal(wider.height, normal.height);
    assert.equal(wider.width, ctx.measureText(wider.text).width);
    assert.equal(normal.width, wider.width * 0.8);
    assert.equal(wider.bearing, 2);
    assert.equal(wider.fitted, false);
  }
});
test("normal SAVE prices retain requested font height/width and stay clear of the frame", () => {
  for (const value of [500, 1000, 1500, 2000, 2500, 10000]) {
    const vehicle = job(); vehicle.savePrice.value = value;
    const box = priceGeometry(context(), vehicle, "savePrice");
    assert.equal(box.position.size, DEFAULT_PRICE_LAYOUT.savePrice.size);
    assert.equal(box.x, DEFAULT_PRICE_LAYOUT.savePrice.x);
    assert.ok(box.x >= SAVE_SAFE_AREA.left && box.x + box.width <= SAVE_SAFE_AREA.right + 1e-8);
    assert.ok(box.y >= SAVE_SAFE_AREA.top && box.y + box.height <= SAVE_SAFE_AREA.bottom + 1e-8);
    if (value < 10000) assert.equal(box.position.widthScale, DEFAULT_PRICE_LAYOUT.savePrice.widthScale);
  }
});
test("genuinely long SAVE shrinks width before height without moving the left anchor", () => {
  const vehicle = job(); vehicle.savePrice.value = 1000000000000;
  const box = priceGeometry(context(), vehicle, "savePrice");
  assert.equal(box.position.size, DEFAULT_PRICE_LAYOUT.savePrice.size);
  assert.equal(box.x, DEFAULT_PRICE_LAYOUT.savePrice.x);
  assert.ok(box.position.widthScale < DEFAULT_PRICE_LAYOUT.savePrice.widthScale);
  assert.equal(box.x + box.width, SAVE_SAFE_AREA.right);
});
test("SAVE protection handles oversized font/offsets without mutating manual calibration", () => {
  const vehicle = job();
  vehicle.priceOffsets.savePrice = { x: 1000, y: 1000 };
  const layout = { savePrice: { ...DEFAULT_PRICE_LAYOUT.savePrice, size: 100, widthScale: 2 } };
  const before = JSON.stringify({ vehicle, layout });
  const box = priceGeometry(context(), vehicle, "savePrice", layout);
  assert.ok(box.position.size < 100);
  assert.ok(box.x + box.width <= SAVE_SAFE_AREA.right && box.y + box.height <= SAVE_SAFE_AREA.bottom);
  assert.equal(JSON.stringify({ vehicle, layout }), before);
});
test("WAS line uses actual amount width inside the same scaled, moved group", () => {
  const vehicle = job(), ctx = context(), calls = [];
  vehicle.priceOffsets.wasPrice = { x: 12, y: -3 };
  ctx.translate = (x, y) => calls.push(["translate", x, y]);
  ctx.scale = (x, y) => calls.push(["scale", x, y]);
  ctx.moveTo = (x, y) => calls.push(["start", x, y]);
  ctx.lineTo = (x, y) => calls.push(["end", x, y]);
  const box = priceGeometry(ctx, vehicle, "wasPrice");
  drawPrices(ctx, vehicle);
  assert.deepEqual(calls[0], ["translate", box.x, box.y]);
  assert.deepEqual(calls[1], ["scale", box.position.widthScale, 1]);
  assert.deepEqual(calls.find(v => v[0] === "end"), ["end", box.width / box.position.widthScale + 2, box.height * 0.28]);
});
test("untouched League Spartan defaults migrate once, keeping every job/offset", () => {
  const campaign = { ...newCampaign(), jobs: [job()], priceLayout: oldLayout() };
  campaign.jobs[0].priceOffsets.nowPrice = { x: 14, y: -6 };
  const migrated = migrateCampaignPriceDefaults(campaign);
  assert.deepEqual(migrated.priceLayout, DEFAULT_PRICE_LAYOUT);
  assert.equal(migrated.jobs, campaign.jobs);
  assert.equal(migrated.priceDefaultsRevision, 2);
  assert.equal(migrateCampaignPriceDefaults(migrated), migrated);
  let raw = JSON.stringify(campaign);
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const loaded = loadCampaign(storage);
  assert.deepEqual(loaded.priceLayout, DEFAULT_PRICE_LAYOUT);
  saveCampaign(loaded, storage);
  assert.deepEqual(loadCampaign(storage), loaded);
});
test("manual font/position/width choices and partial calibrations never migrate", () => {
  for (const patch of [{ x: 230 }, { y: 620 }, { size: 75 }, { fontFamily: "Roboto" }, { widthScale: 1.1 }, { color: "#dddddd" }, { userCalibrated: true }]) {
    const campaign = { ...newCampaign(), jobs: [job()], priceLayout: oldLayout() };
    Object.assign(campaign.priceLayout.nowPrice, patch);
    assert.equal(migrateCampaignPriceDefaults(campaign), campaign);
    let raw; const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
    saveCampaign(campaign, storage); assert.deepEqual(loadCampaign(storage), campaign);
  }
  const partial = { ...newCampaign(), jobs: [job()], priceLayout: { nowPrice: { x: 230 } } };
  assert.equal(migrateCampaignPriceDefaults(partial), partial);
});
