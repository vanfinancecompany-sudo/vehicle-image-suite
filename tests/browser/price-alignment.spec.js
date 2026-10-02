import { test, expect } from "@playwright/test";
import { createJob, newCampaign } from "../../src/campaign/campaignModel.js";

test("resized template fixture keeps labels fixed, clears them, and aligns dynamic baselines", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { ensurePriceFont, drawPrices, priceGeometry } = await import("/src/campaign/priceRenderer.js");
    const { DEFAULT_PRICE_LAYOUT } = await import("/src/campaign/priceDefaults.js");
    await ensurePriceFont();
    // Bottom-panel dimensions and label levels follow the supplied 960x720 output.
    // This is test scaffolding; no approved PNG is modified or labels redrawn in production.
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1f2937"; ctx.fillRect(0, 0, 960, 720);
    ctx.fillStyle = "#93c5fd"; ctx.fillRect(122, 92, 838, 512);
    ctx.fillStyle = "#151515"; ctx.fillRect(4, 604, 210, 116);
    ctx.fillStyle = "#ffd000"; ctx.beginPath();
    ctx.moveTo(214, 604); ctx.lineTo(471, 604); ctx.lineTo(450, 720); ctx.lineTo(175, 720); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a60808"; ctx.fillRect(472, 604, 484, 112); ctx.fillRect(688, 8, 268, 84);
    ctx.strokeStyle = "#ff9900"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 956, 716);
    ctx.beginPath(); ctx.moveTo(4, 604); ctx.lineTo(956, 604); ctx.stroke();
    ctx.fillStyle = "#ddd"; ctx.font = "900 24px sans-serif"; ctx.fillText("WAS", 23, 652);
    ctx.fillStyle = "#111"; ctx.font = "900 25px sans-serif"; ctx.fillText("NOW", 224, 637);
    ctx.fillStyle = "#fff"; ctx.font = "900 28px sans-serif"; ctx.fillText("SAVE", 707, 35);
    ctx.font = "900 32px sans-serif"; ctx.fillText("AutoGuard · FREE", 495, 652);
    ctx.font = "900 21px sans-serif"; ctx.fillText("1-YEAR WARRANTY", 495, 687);
    const job = { wasPrice: { value: 10595 }, nowPrice: { value: 10245 }, savePrice: { value: 350 }, priceOffsets: {} };
    const before = ctx.getImageData(0, 0, 960, 720).data.slice();
    const cases = [350, 500, 1000, 10245, 13995, 14495, 99999].map(value => {
      const vehicle = { ...job, wasPrice: { value }, nowPrice: { value } };
      const was = priceGeometry(ctx, vehicle, "wasPrice"), now = priceGeometry(ctx, vehicle, "nowPrice");
      return { value, was, now };
    });
    drawPrices(ctx, job);
    const after = ctx.getImageData(0, 0, 960, 720).data;
    let labelChanges = 0;
    // Includes both fixed labels and their surrounding background.
    for (let y = 606; y < 656; y++) for (let x = 8; x < 450; x++) {
      const i = (y * 960 + x) * 4;
      if (x >= 205 && y >= 646) continue; // Only the NOW amount is permitted below its label.
      if ([0, 1, 2, 3].some(c => after[i + c] !== before[i + c])) labelChanges++;
    }
    const vehicle = { ...job, priceOffsets: { wasPrice: { x: 4, y: 3 }, nowPrice: { x: -2, y: -5 } } };
    const offsetWas = priceGeometry(ctx, vehicle, "wasPrice"), offsetNow = priceGeometry(ctx, vehicle, "nowPrice");
    document.body.replaceChildren(canvas);
    return { cases, labelChanges, offsetWas, offsetNow, defaults: DEFAULT_PRICE_LAYOUT, png: canvas.toDataURL() };
  });
  for (const { was, now } of result.cases) {
    expect(was.y + was.ascent).toBeCloseTo(700, 5);
    expect(now.y + now.ascent).toBeCloseTo(700, 5);
    expect(was.y).toBeGreaterThanOrEqual(662);
    expect(now.y).toBeGreaterThanOrEqual(645);
    expect(was.y + was.height).toBeLessThanOrEqual(712);
    expect(now.y + now.height).toBeLessThanOrEqual(712);
    expect(was.position.size).toBe(48); expect(now.position.size).toBe(72);
    expect(was.x).toBe(30); expect(now.x).toBe(215);
  }
  expect(result.labelChanges).toBe(0);
  expect(result.offsetWas.x).toBe(34); expect(result.offsetWas.y).toBe(result.defaults.wasPrice.y + 3);
  expect(result.offsetNow.x).toBe(213); expect(result.offsetNow.y).toBe(result.defaults.nowPrice.y - 5);
  await page.locator("canvas").screenshot({ path: "test-results/resized-price-baseline-350-10245.png" });
});

test("untouched saved Noto master aligns once; manual master and vehicle offsets survive reload", async ({ page }) => {
  const job = createJob({ registration: "CP16 AZW", wasPrice: "10595", nowPrice: "10245", savePrice: "350" });
  job.priceOffsets.wasPrice = { x: 2, y: -1 }; job.priceOffsets.nowPrice = { x: -4, y: 3 };
  const campaign = { ...newCampaign(), enabled: true, templateId: "van-finance", activeJobId: job.id, jobs: [job],
    priceDefaultsRevision: 2, priceLayout: {
      wasPrice: { x: 30, y: 643, size: 48, color: "#e2e2e2", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 0.86 },
      nowPrice: { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 0.88 },
      savePrice: { x: 695, y: 40, size: 52, color: "#ffffff", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 1.3 },
    } };
  await page.addInitScript(campaign => {
    if (!localStorage.getItem("alignment-seeded")) {
      localStorage.setItem("vehicle-image-suite-sales-campaign", JSON.stringify(campaign));
      localStorage.setItem("alignment-seeded", "yes");
    }
  }, campaign);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByText("Advanced campaign price defaults", { exact: true }).click();
  const was = panel.getByRole("group", { name: "WAS defaults", exact: true });
  const now = panel.getByRole("group", { name: "NOW defaults", exact: true });
  await expect(was.getByLabel("Y (px)", { exact: true })).toHaveValue("665");
  await expect(now.getByLabel("Y (px)", { exact: true })).toHaveValue("646.55");
  // An ordinary nudge persists the migrated master without resetting other vehicle positions.
  await page.getByRole("button", { name: "Move NOW right 2 pixels", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")));
  expect(saved.priceDefaultsRevision).toBe(3);
  expect(saved.jobs[0].priceOffsets.wasPrice).toEqual({ x: 2, y: -1 });
  expect(saved.jobs[0].priceOffsets.nowPrice).toEqual({ x: -2, y: 3 });
  expect(saved.priceLayout.savePrice).toEqual(campaign.priceLayout.savePrice);
  await was.getByLabel("Y (px)", { exact: true }).fill("662");
  await now.getByLabel("Y (px)", { exact: true }).fill("645");
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")));
  expect(restored.priceLayout.wasPrice.y).toBe(662); expect(restored.priceLayout.nowPrice.y).toBe(645);
  expect(restored.jobs[0].priceOffsets).toEqual(saved.jobs[0].priceOffsets);
});
