import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createJob, formatPrice, campaignFilename, nextUnfinished, newCampaign } from "../src/campaign/campaignModel.js";
import { parseRows, parseSpreadsheet } from "../src/campaign/spreadsheetParser.js";
import { loadCampaign, saveCampaign, CAMPAIGN_KEY } from "../src/campaign/campaignStorage.js";
import { drawPrices } from "../src/campaign/priceRenderer.js";
import { extractVehicleImages, validateVanscoUrl, fetchVanscoPage } from "../lib/vanscoExtractor.js";

test("aliases, trims, pence, calculated SAVE and mismatched supplied SAVE", () => {
  const jobs = parseRows([
    ["Promotion title"],
    [" registration ", " BRANCH ", " RETAIL PRICE ", " NEW SALES PRICE ", " discount ", " page url "],
    [" hj22 lsk ", " 333 ", "£14,495", "13995", "", " https://www.vansco.co.uk/vehicle-details/example/ "],
    [" xy22 abc ", "", "10000.50", "8000.00", "1500.00", ""],
    ["bad", "", "N/A", "", "", ""],
  ]);
  assert.equal(jobs.length, 3);
  assert.equal(jobs[0].registration, "HJ22 LSK");
  assert.equal(jobs[0].location, "333");
  assert.equal(formatPrice(jobs[0].wasPrice), "£14,495");
  assert.equal(formatPrice(jobs[0].savePrice), "£500");
  assert.equal(formatPrice(jobs[1].wasPrice), "£10,000.50");
  assert.equal(jobs[1].savePrice.value, 1500);
  assert.match(jobs[1].warnings.join(" "), /Supplied SAVE retained/);
  assert.match(jobs[2].warnings.join(" "), /not a valid price/);
  assert.throws(() => parseRows([["Unrelated"]]), /Registration column/);
});
test("SAVE tolerance, zero SAVE and decimal rounding", () => {
  assert.equal(createJob({ registration: "A", wasPrice: "100", nowPrice: "99", savePrice: "0" }).warnings.length, 0);
  assert.match(createJob({ registration: "A", wasPrice: "100", nowPrice: "99", savePrice: "2.01" }).warnings.join(" "), /differs/);
  assert.equal(createJob({ registration: "A", wasPrice: "10.30", nowPrice: "10.10" }).savePrice.value, 0.2);
});
test("real workbook preserves formatted pence and processes 250 vehicles", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Reg", "Site", "Old Price", "Sale Price"],
    ...Array.from({ length: 250 }, (_, i) => ["HJ22 LSK-" + i, 333, 14495.5, 13995])]);
  sheet.C2.z = "£#,##0.00";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Vehicles");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const jobs = await parseSpreadsheet({ arrayBuffer: async () => buffer });
  assert.equal(jobs.length, 250);
  assert.equal(formatPrice(jobs[0].wasPrice), "£14,495.50");
});
test("filenames stay readable and safe", () => {
  assert.equal(campaignFilename({ registration: "HJ22 LSK", location: "333" }), "HJ22-LSK-333.png");
  assert.equal(campaignFilename({ registration: "hj22 lsk", location: "Southampton / Airport:*?" }), "HJ22-LSK-Southampton-Airport.png");
  assert.equal(campaignFilename({ registration: "HJ22 LSK", location: "" }), "HJ22-LSK.png");
  assert.throws(() => campaignFilename({ registration: "", location: "" }));
});
test("storage roundtrip preserves image references, individual transforms and offsets", () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  const campaign = newCampaign();
  campaign.jobs = [createJob({ registration: "A", wasPrice: "100", nowPrice: "90" })];
  campaign.jobs[0].selectedImage = "upload:test";
  campaign.jobs[0].transform = { x: 17, y: -22, scale: 1.4 };
  campaign.jobs[0].priceOffsets.nowPrice.x = -6;
  campaign.jobs[0].done = true;
  saveCampaign(campaign, storage);
  assert.deepEqual(loadCampaign(storage), campaign);
  store.set(CAMPAIGN_KEY, "{bad");
  assert.throws(() => loadCampaign(storage));
  assert.equal(store.get(CAMPAIGN_KEY), "{bad");
});
test("advance wraps to the next unfinished job, and keeps last job if all done", () => {
  const jobs = [{ id: "a", done: false }, { id: "b", done: true }, { id: "c", done: false }];
  assert.equal(nextUnfinished(jobs, "a"), "c");
  assert.equal(nextUnfinished(jobs, "c"), "a");
  assert.equal(nextUnfinished(jobs.map(job => ({ ...job, done: true })), "c"), "c");
});
test("prices share a left anchor and WAS strike-through follows its offset", () => {
  const calls = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    fillText(...args) { calls.push(["text", this.textAlign, ...args]); },
    moveTo(...args) { calls.push(["start", ...args]); }, lineTo() {},
    measureText(text) { return { width: text.length * 15 }; },
  };
  const job = createJob({ registration: "A", wasPrice: "14495", nowPrice: "8995" });
  drawPrices(ctx, job);
  const before = calls.filter(call => call[0] === "text");
  calls.length = 0;
  job.nowPrice.value = 14995;
  job.priceOffsets.wasPrice.x = 6;
  drawPrices(ctx, job);
  const after = calls.filter(call => call[0] === "text");
  assert.equal(before[1][3], after[1][3]);
  assert.equal(after[0][3], before[0][3] + 6);
  assert.equal(calls.find(call => call[0] === "start")[1], after[0][3] - 2);
  assert.ok(after.every(call => call[1] === "left"));
});
test("Vansco URLs accept all paths but reject lookalikes and offsite redirects", async () => {
  assert.equal(validateVanscoUrl("https://www.vansco.co.uk/vehicle-details/a/"), "https://www.vansco.co.uk/vehicle-details/a/");
  assert.equal(validateVanscoUrl("https://vansco.co.uk/another/future/path"), "https://vansco.co.uk/another/future/path");
  assert.throws(() => validateVanscoUrl("https://vansco.co.uk.evil.example/a"));
  assert.throws(() => validateVanscoUrl("file:///etc/passwd"));
  await assert.rejects(fetchVanscoPage("https://vansco.co.uk/a", async () => ({
    status: 302, headers: new Headers({ location: "https://example.com/" }),
  })), /vansco.co.uk/);
});
test("current sources, srcset, structured arrays, escaping and legacy Dragon2000 images", () => {
  const html = String.raw`
    <img src="/logo.png">
    <img src="https://cdn.dealerkit.example/vehicle.jpg?w=300" srcset="https://cdn.dealerkit.example/vehicle.jpg?w=300 300w, https://cdn.dealerkit.example/vehicle.jpg?w=1600 1600w">
    <meta content="https://cdn.example/og.webp" property="og:image">
    <script type="application/ld+json">{"image":["https:\/\/cdn.example\/full.jpg?token=signed\u0026width=2000",{"contentUrl":"https://cdn.example/two.webp"}]}</script>
    <img data-original="https://img.cdn.dragon2000.net/stock/photo-large.jpg" src="/placeholder.png">
    <img src="https://img.cdn.dragon2000.net/stock/photo-small.jpg">
  `;
  const images = extractVehicleImages(html, "https://www.vansco.co.uk/vehicle-details/a");
  assert.ok(images.includes("https://cdn.dealerkit.example/vehicle.jpg?w=1600"));
  assert.ok(!images.includes("https://cdn.dealerkit.example/vehicle.jpg?w=300"));
  assert.ok(images.includes("https://cdn.example/og.webp"));
  assert.ok(images.includes("https://cdn.example/two.webp"));
  assert.equal(images.filter(url => url.includes("photo-large")).length, 1);
  assert.ok(!images.some(url => /logo|placeholder/.test(url)));
});
