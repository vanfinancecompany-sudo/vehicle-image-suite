import { createJob, newCampaign } from "../../src/campaign/campaignModel.js";
import { test, expect } from "@playwright/test";
test("controlled price font audition uses only real locally loaded faces", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { ensurePriceFont, drawPrices } = await import("/src/campaign/priceRenderer.js");
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 960, 720);
    const probe = "£13459,000WWWmmm";
    const measure = font => { ctx.font = font; return ctx.measureText(probe).width; };
    const arialBlackAvailable = ["monospace", "serif"].every(fallback =>
      measure('900 60px "Arial Black", ' + fallback) !== measure("900 60px " + fallback));
    const fonts = [
      { fontFamily: "Arimo", fontWeight: 700 },
      { fontFamily: "Noto Sans", fontWeight: 900 },
      { fontFamily: "Roboto", fontWeight: 900 },
      { fontFamily: "League Spartan", fontWeight: 900 },
    ];
    ctx.fillStyle = "#111"; ctx.font = "20px sans-serif";
    ctx.fillText("960 × 720 — equal 68px size / 100% width / production renderer", 20, 28);
    ctx.font = "16px sans-serif";
    ctx.fillText("Arial Black: " + (arialBlackAvailable ? "system font available" : "not available on this browser; no fallback substituted"), 20, 55);
    const job = { wasPrice: { value: 14495 }, nowPrice: { value: 13995 }, savePrice: { value: 1500 },
      priceOffsets: { wasPrice: { x: 0, y: 0 }, nowPrice: { x: 0, y: 0 }, savePrice: { x: 0, y: 0 } } };
    for (const [row, font] of fonts.entries()) {
      const y = 110 + row * 145;
      const layout = {
        wasPrice: { ...font, x: 340, y, size: 68, widthScale: 1, color: "#e2e2e2" },
        nowPrice: { ...font, x: 20, y, size: 68, widthScale: 1, color: "#111" },
        savePrice: { ...font, x: 660, y, size: 68, widthScale: 1, color: "#fff" },
      };
      await ensurePriceFont(layout);
      ctx.fillStyle = "#ffcf00"; ctx.fillRect(10, y - 8, 300, 90);
      ctx.fillStyle = "#222"; ctx.fillRect(330, y - 8, 300, 90);
      ctx.fillStyle = "#a60000"; ctx.fillRect(650, y - 8, 300, 90);
      drawPrices(ctx, job, layout);
      ctx.fillStyle = "#111"; ctx.font = "18px sans-serif";
      ctx.fillText(font.fontFamily + " " + font.fontWeight, 20, y + 110);
    }
    document.body.replaceChildren(canvas);
    return { arialBlackAvailable, dataUrl: canvas.toDataURL() };
  });
  expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  await page.locator("canvas").screenshot({ path: "test-results/price-font-audition.png" });
  console.log("FONT_AUDITION:" + result.dataUrl);
});

test("Noto default production fixture, SAVE containment and stable anchors with real fonts", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { renderPriceFixture } = await import("/tests/browser/fixtures/priceCanvas.js");
    const { priceGeometry } = await import("/src/campaign/priceRenderer.js");
    const job = { wasPrice: { value: 14495 }, nowPrice: { value: 13995 }, savePrice: { value: 1500 },
      priceOffsets: { wasPrice: { x: 0, y: 0 }, nowPrice: { x: 0, y: 0 }, savePrice: { x: 0, y: 0 } } };
    const normal = await renderPriceFixture(job);
    const ctx = normal.canvas.getContext("2d");
    const values = [500, 1000, 1500, 2000, 2500, 10000, 1000000000000].map(value => {
      const vehicle = { ...job, savePrice: { value } };
      return { value, box: priceGeometry(ctx, vehicle, "savePrice") };
    });
    const anchors = ["wasPrice", "nowPrice", "savePrice"].map(field => ({
      normal: priceGeometry(ctx, job, field, { [field]: { widthScale: 0.8 } }),
      wide: priceGeometry(ctx, job, field, { [field]: { widthScale: 1 } }),
    }));
    const long = await renderPriceFixture({ ...job, savePrice: { value: 10000 } });
    document.body.replaceChildren(normal.canvas);
    return { boxes: normal.boxes, values, anchors, safeArea: normal.safeArea,
      defaultPng: normal.canvas.toDataURL(), longPng: long.canvas.toDataURL() };
  });
  for (const { normal, wide } of result.anchors) {
    expect(wide.x).toBe(normal.x); expect(wide.y).toBe(normal.y);
    expect(wide.height).toBe(normal.height); expect(wide.width).toBeCloseTo(normal.width / 0.8, 6);
  }
  for (const { value, box } of result.values) {
    expect(box.x).toBe(695);
    expect(box.x + box.width).toBeLessThanOrEqual(result.safeArea.right + 1e-6);
    expect(box.y).toBeGreaterThanOrEqual(result.safeArea.top);
    expect(box.y + box.height).toBeLessThanOrEqual(result.safeArea.bottom + 1e-6);
    expect(box.position.size).toBe(52);
    if (value <= 2500) expect(box.position.widthScale).toBe(1.3);
  }
  expect(result.values.find(entry => entry.value === 10000).box.position.widthScale).toBeLessThan(1.3);
  const long = result.values.at(-1).box;
  expect(long.position.widthScale).toBeLessThan(1.3);
  expect(long.x + long.width).toBeCloseTo(result.safeArea.right, 6);
  await page.locator("canvas").screenshot({ path: "test-results/price-reference-defaults.png" });
  await test.info().attach("price-reference-long-save.png", { body: Buffer.from(result.longPng.split(",")[1], "base64"), contentType: "image/png" });
  console.log("CALIBRATED_PRICE:" + result.defaultPng);
  console.log("PRICE_BOXES:" + JSON.stringify(result.boxes));
});

test("untouched old default migration preserves offsets and subsequent manual calibration", async ({ page }) => {
  const job = createJob({ registration: "HJ22 LSK", wasPrice: "14495", nowPrice: "13995", savePrice: "1500" });
  job.priceOffsets.nowPrice = { x: 14, y: -6 };
  const campaign = { ...newCampaign(), jobs: [job], enabled: true, activeJobId: job.id, templateId: "van-finance",
    priceLayout: {
      wasPrice: { x: 30, y: 643, size: 54, color: "#e2e2e2", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.82 },
      nowPrice: { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.95 },
      savePrice: { x: 695, y: 43, size: 72, color: "#ffffff", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
    } };
  await page.addInitScript(campaign => {
    if (!localStorage.getItem("typography-seeded")) {
      localStorage.setItem("vehicle-image-suite-sales-campaign", JSON.stringify(campaign));
      localStorage.setItem("typography-seeded", "yes");
    }
  }, campaign);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByText("Advanced campaign price defaults", { exact: true }).click();
  await expect(panel.getByLabel("NOW font family", { exact: true })).toHaveValue("Noto Sans|900");
  await page.getByRole("button", { name: "Move NOW left 2 pixels", exact: true }).click();
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")));
  expect(migrated.jobs[0].priceOffsets.nowPrice).toEqual({ x: 12, y: -6 });
  expect(migrated.priceDefaultsRevision).toBe(2);
  expect(migrated.priceLayout.nowPrice.fontFamily).toBe("Noto Sans");
  expect(migrated.jobs[0].registration).toBe("HJ22 LSK");
  await panel.getByLabel("NOW font family", { exact: true }).selectOption("Roboto|900");
  await panel.getByLabel("NOW width percent", { exact: true }).fill("110");
  await panel.getByRole("group", { name: "NOW defaults", exact: true }).getByLabel("X (px)", { exact: true }).fill("220");
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")));
  expect(restored.priceLayout.nowPrice.fontFamily).toBe("Roboto");
  expect(restored.priceLayout.nowPrice.widthScale).toBe(1.1);
  expect(restored.priceLayout.nowPrice.x).toBe(220);
  expect(restored.jobs[0].priceOffsets.nowPrice).toEqual({ x: 12, y: -6 });
});
