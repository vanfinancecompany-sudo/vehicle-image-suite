import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

test("SAVE shadow and tighter/heavier NOW use the production renderer and retain anchors", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { drawPrices, ensurePriceFont, priceGeometry } = await import("/src/campaign/priceRenderer.js");
    const { DEFAULT_PRICE_LAYOUT, SAVE_SAFE_AREA } = await import("/src/campaign/priceDefaults.js");
    const { saleFrame, edgePhoto } = await import("/tests/browser/fixtures/saleFrame.js");
    const { drawComposite } = await import("/src/canvasComposite.js");
    await ensurePriceFont();
    const job = { wasPrice: { value: 10595 }, nowPrice: { value: 10245 }, savePrice: { value: 350 }, priceOffsets: {} };
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    const template = saleFrame(), photo = edgePhoto();
    drawComposite(ctx, photo, template, { width: 960, height: 720 }, { x: 0, y: 0, scale: 1 }, job);
    const now = priceGeometry(ctx, job, "nowPrice");
    const box = priceGeometry(ctx, job, "savePrice");
    ctx.font = '900 72px "Noto Sans"';
    const plainWidth = ctx.measureText(now.text).actualBoundingBoxLeft + ctx.measureText(now.text).actualBoundingBoxRight;
    // Compare actual ink coverage with the old single fillText rendering, at equal font size.
    const isolated = document.createElement("canvas"); isolated.width = 960; isolated.height = 720;
    const ink = isolated.getContext("2d");
    function stats() {
      const pixels = ink.getImageData(0, 0, 960, 720).data;
      let count = 0, left = 960;
      for (let y = 600; y < 715; y++) for (let x = 150; x < 500; x++) {
        if (pixels[(y * 960 + x) * 4 + 3] > 127) { count++; left = Math.min(left, x); }
      }
      return { count, left };
    }
    drawPrices(ink, { ...job, wasPrice: null, savePrice: null });
    const polished = stats();
    ink.clearRect(0, 0, 960, 720); ink.save(); ink.translate(now.x, now.y);
    ink.scale(DEFAULT_PRICE_LAYOUT.nowPrice.widthScale, 1);
    ink.font = '900 72px "Noto Sans"'; ink.textBaseline = "alphabetic"; ink.textAlign = "left";
    const metrics = ink.measureText(now.text);
    ink.fillText(now.text, metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxAscent); ink.restore();
    const previous = stats();
    const save = document.createElement("canvas"); save.width = 960; save.height = 720;
    const saveCtx = save.getContext("2d");
    drawPrices(saveCtx, { ...job, wasPrice: null, nowPrice: null });
    const pixels = saveCtx.getImageData(0, 0, 960, 720).data;
    let shadow = 0, outside = 0;
    for (let y = 0; y < 720; y++) for (let x = 0; x < 960; x++) {
      const i = (y * 960 + x) * 4;
      if (!pixels[i + 3]) continue;
      if (pixels[i] < 10 && pixels[i + 1] < 10 && pixels[i + 2] < 10) shadow++;
      if (x < SAVE_SAFE_AREA.left || x >= SAVE_SAFE_AREA.right || y < SAVE_SAFE_AREA.top || y >= SAVE_SAFE_AREA.bottom) outside++;
    }
    document.body.replaceChildren(canvas);
    return { now, box, plainWidth, polished, previous, shadow, outside, png: canvas.toDataURL() };
  });
  expect(result.now.x).toBe(215); expect(result.now.y).toBe(628);
  expect(result.now.width).toBeLessThan(result.plainWidth * 0.88);
  expect(result.polished.count).toBeGreaterThan(result.previous.count);
  expect(Math.abs(result.polished.left - result.previous.left)).toBeLessThanOrEqual(1);
  expect(result.box.x).toBe(695); expect(result.box.position.size).toBe(52);
  expect(result.shadow).toBeGreaterThan(0); expect(result.outside).toBe(0);
  await page.locator("canvas").screenshot({ path: "test-results/sale-polish-350-10245.png" });
});

test("framed PNG clips photo after drag/zoom and export exactly matches editor pixels", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const photo = await page.evaluate(async () => {
    const { saleFrame, edgePhoto } = await import("/tests/browser/fixtures/saleFrame.js");
    localStorage.setItem("vehicle-image-suite-template-library", JSON.stringify([{
      id: "clip-fixture", name: "Clip Fixture", category: "custom", width: 960, height: 720,
      filePath: saleFrame().toDataURL(), fileLabel: "clip.png",
    }]));
    return edgePhoto().toDataURL();
  });
  await page.reload();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Registration", "Sales Location", "Was", "Now", "Save"], ["CP16 AZW", "Vansco 333 Showroom", 10595, 10245, 350],
  ]), "Stock");
  await page.getByLabel("Upload Spreadsheet", { exact: true }).setInputFiles({
    name: "polish.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  });
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByLabel("Campaign template").selectOption("clip-fixture");
  await panel.getByRole("button", { name: /CP16 AZW · Vansco 333 Showroom/ }).click();
  await panel.getByLabel("Upload Image", { exact: true }).setInputFiles({
    name: "edges.png", mimeType: "image/png", buffer: Buffer.from(photo.split(",")[1], "base64"),
  });
  await expect(page.getByRole("button", { name: "Image 1 Selected" })).toBeVisible();
  const canvas = page.getByLabel("Template editor canvas");
  await expect.poll(async () => canvas.evaluate(canvas => Array.from(canvas.getContext("2d").getImageData(300, 200, 1, 1).data))).toEqual([147, 197, 253, 255]);
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 45, rect.y + rect.height / 2 - 30);
  await page.mouse.up();
  await page.getByLabel("Image zoom").focus(); await page.keyboard.press("ArrowRight");
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")).jobs[0]);
  expect(state.transform.x).not.toBe(0); expect(state.transform.y).not.toBe(0); expect(state.transform.scale).toBeGreaterThan(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG Only", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("CP16-AZW-Vansco-333-Showroom.png");
  const exported = await readFile(await download.path());
  const preview = await canvas.evaluate(canvas => canvas.toDataURL());
  expect(exported.equals(Buffer.from(preview.split(",")[1], "base64"))).toBe(true);
  const containment = await canvas.evaluate(async canvas => {
    const { saleFrame } = await import("/tests/browser/fixtures/saleFrame.js");
    const { drawPrices } = await import("/src/campaign/priceRenderer.js");
    const campaign = JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign"));
    const expected = document.createElement("canvas"); expected.width = 960; expected.height = 720;
    const base = expected.getContext("2d"); base.fillStyle = "#111827"; base.fillRect(0, 0, 960, 720);
    base.drawImage(saleFrame(), 0, 0); drawPrices(base, campaign.jobs[0], campaign.priceLayout);
    const pixels = canvas.getContext("2d").getImageData(0, 0, 960, 720).data;
    const reference = base.getImageData(0, 0, 960, 720).data;
    let outsideDifferences = 0;
    for (let y = 0; y < 720; y++) for (let x = 0; x < 960; x++) {
      if (x >= 130 && x < 950 && y >= 96 && y < 592) continue;
      const index = (y * 960 + x) * 4;
      if ([0, 1, 2, 3].some(channel => pixels[index + channel] !== reference[index + channel])) outsideDifferences++;
    }
    return { outsideDifferences, margins: [[0, 0], [3, 200], [959, 200], [400, 715]].map(([x, y]) => {
      const i = (y * 960 + x) * 4;
      return Array.from(pixels.slice(i, i + 4));
    }) };
  });
  expect(containment.outsideDifferences).toBe(0);
  const margins = containment.margins;
  for (const pixel of margins) expect(pixel).toEqual([17, 24, 39, 255]);
  await canvas.screenshot({ path: "test-results/sale-polish-clipped-drag-zoom.png" });
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("vehicle-image-suite-sales-campaign")).jobs[0]);
  expect(restored.transform).toEqual(state.transform);
  expect(errors).toEqual([]);
});
