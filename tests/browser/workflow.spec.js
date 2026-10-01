import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const key = "vehicle-image-suite-sales-campaign";

async function setup(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("fixture-loaded")) {
      const canvas = document.createElement("canvas");
      canvas.width = 960; canvas.height = 720;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#222"; ctx.fillRect(10, 590, 205, 115);
      ctx.fillStyle = "#ffdb00"; ctx.fillRect(215, 590, 255, 115);
      ctx.fillStyle = "#b91c1c"; ctx.fillRect(685, 8, 265, 84);
      localStorage.setItem("vehicle-image-suite-template-library", JSON.stringify([{
        id: "sale-fixture", name: "Sale Fixture", category: "custom",
        width: 960, height: 720, filePath: canvas.toDataURL(), fileLabel: "fixture.png",
      }]));
      localStorage.setItem("fixture-loaded", "yes");
    }
    const original = CanvasRenderingContext2D.prototype.fillText;
    window.priceDraws = [];
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (String(text).includes("£")) window.priceDraws.push(text);
      return original.call(this, text, ...args);
    };
  });
  await page.route("**/api/extract?*", route => route.fulfill({ json: {
    images: ["https://cdn.example/vehicle-one.jpg", "https://cdn.example/vehicle-two.jpg"],
  } }));
  await page.route("**/api/image?*", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.goto("/");
  return errors;
}
async function importVehicles(page) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Reg", "Sales Location", "Retail Price", "New Sales Price", "Discount", "Vehicle URL"],
    ["HJ22 LSK", "Vansco 333 Showroom", 14495, 13995, 500, "https://www.vansco.co.uk/vehicle-details/a"],
    ["AA22 AAA", "Vansco (Southampton Airport)", 10000, 9000, 1000, ""],
  ]), "Vehicles");
  await page.getByLabel("Upload Spreadsheet", { exact: true }).setInputFiles({
    name: "campaign.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  });
  await expect(page.getByText("0 / 2 COMPLETE", { exact: true })).toBeVisible();
}
async function assertPng(download) {
  const file = await readFile(await download.path());
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  expect(file.readUInt32BE(16)).toBe(960);
  expect(file.readUInt32BE(20)).toBe(720);
}

test("import, URL and manual photos, nudge, save/advance, restore after refresh and new stock", async ({ page }) => {
  const errors = await setup(page);
  await importVehicles(page);
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByLabel("Campaign template").selectOption("sale-fixture");
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco 333 Showroom/ }).click();
  await panel.getByRole("button", { name: "Load Images From URL" }).click();
  await expect(page.getByRole("button", { name: "Image 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Image 2", exact: true }).click();
  await panel.getByLabel("Upload Image", { exact: true }).setInputFiles({
    name: "new-stock.png", mimeType: "image/png", buffer: png,
  });
  await expect(page.getByRole("button", { name: "Image 3 Selected" })).toBeVisible();
  const canvas = page.getByLabel("Template editor canvas");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 25, bounds.y + bounds.height / 2 + 20);
  await page.mouse.up();
  await page.getByLabel("Image zoom").focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Move NOW right 2 pixels" }).click();
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[0], key);
  expect(before.transform.x).not.toBe(0);
  expect(before.transform.y).not.toBe(0);
  expect(before.transform.scale).toBeGreaterThan(1);
  expect(before.priceOffsets.nowPrice.x).toBe(2);
  expect(before.selectedImage).toMatch(/^upload:/);
  await expect.poll(() => page.evaluate(() => window.priceDraws.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.fonts.check('900 72px "League Spartan"'))).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SAVE PNG & MARK DONE", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HJ22-LSK-Vansco-333-Showroom.png");
  await assertPng(download);
  await expect(panel.getByText("1 / 2 COMPLETE", { exact: true })).toBeVisible();
  await expect(panel.getByText("Active: AA22 AAA · Vansco (Southampton Airport)", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco 333 Showroom/ }).click();
  await page.reload();
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[0], key);
  expect(restored.transform).toEqual(before.transform);
  expect(restored.priceOffsets).toEqual(before.priceOffsets);
  await expect(page.getByRole("button", { name: "Image 3 Selected" })).toBeVisible();
  await panel.getByRole("button", { name: "Mark Not Done", exact: true }).click();
  await expect(panel.getByText("0 / 2 COMPLETE", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Mark Done", exact: true }).click();
  await panel.getByText("Add New Stock Vehicle", { exact: true }).click();
  const form = panel.locator("details").filter({ has: page.getByText("Add New Stock Vehicle", { exact: true }) });
  await form.getByLabel("Registration", { exact: true }).fill("xy26 new");
  await form.getByLabel("Location", { exact: true }).fill("New Forest");
  await form.getByLabel("WAS", { exact: true }).fill("12500");
  await form.getByLabel("NOW", { exact: true }).fill("12000");
  await form.getByRole("button", { name: "Add Vehicle", exact: true }).click();
  await panel.getByRole("button", { name: "Remaining", exact: true }).click();
  await panel.getByRole("button", { name: /XY26 NEW · New Forest/ }).click();
  await panel.getByLabel("Upload Image", { exact: true }).setInputFiles({ name: "stock.png", mimeType: "image/png", buffer: png });
  const secondDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "SAVE PNG & MARK DONE", exact: true }).click();
  expect((await secondDownload).suggestedFilename()).toBe("XY26-NEW-New-Forest.png");
  await expect(panel.getByText("2 / 3 COMPLETE", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/campaign-workflow.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("normal extraction, previous/next, deletion, reset, PNG and ZIP still work without prices", async ({ page }) => {
  const errors = await setup(page);
  await page.getByPlaceholder("Paste Vansco vehicle page URL").fill("https://www.vansco.co.uk/any-page");
  await page.getByRole("button", { name: "Extract Images", exact: true }).click();
  await page.getByRole("button", { name: "Next Image", exact: true }).click();
  await expect(page.getByRole("button", { name: "Image 2 Selected" })).toBeVisible();
  await page.getByRole("button", { name: "Previous Image", exact: true }).click();
  await expect(page.getByRole("button", { name: "Image 1 Selected" })).toBeVisible();
  await page.getByRole("button", { name: "Reset image", exact: true }).click();
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await assertPng(await pngPromise);
  const zipPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export All Images", exact: true }).click();
  const zip = await readFile(await (await zipPromise).path());
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(await page.evaluate(() => window.priceDraws)).toEqual([]);
  await page.getByRole("button", { name: "Delete image 2", exact: true }).click();
  await expect(page.getByText("1 images", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("remove in either template list, cancel safely, persist defaults hidden, restore and empty editor", async ({ page }) => {
  const errors = await setup(page);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Remove Van Finance", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Remove Van Finance", exact: true })).toHaveCount(2);
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remove Van Finance", exact: true }).last().click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Van Finance", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Rent2Buy", exact: true }).first().click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Van Finance", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Rent2Buy", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Sale Fixture", exact: true }).last().click();
  await expect(page.getByText("No templates remain. Add a PNG below or restore defaults.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("0 templates", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore Default Templates", exact: true }).last().click();
  await expect(page.getByText("2 templates", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Van Finance", exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("explicit DealerKit loading uses exact registration, persists ordered gallery and keeps fallback photos", async ({ page }) => {
  const errors = await setup(page);
  let calls = 0;
  await page.route("**/api/dealerkit-images?*", async route => {
    calls++;
    expect(new URL(route.request().url()).searchParams.get("registration")).toBe("HJ22 LSK");
    await route.fulfill({ json: { ok: true, registration: "HJ22LSK", supplierStockId: "stock-1",
      primaryImage: "https://cdn.example/vehicle-found.jpg",
      images: [{ url: "https://cdn.example/vehicle-found.jpg", order: 0 }, { url: "https://cdn.example/vehicle-second.jpg", order: 1 }] } });
  });
  await importVehicles(page);
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByLabel("Campaign template").selectOption("sale-fixture");
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco 333 Showroom/ }).click();
  expect(calls).toBe(0);
  await panel.getByRole("button", { name: "LOAD DEALERKIT IMAGES", exact: true }).click();
  await expect(page.getByRole("button", { name: "Image 1 Selected" })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Image 2", exact: true }).click();
  await page.reload();
  const job = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[0], key);
  expect(job.location).toBe("Vansco 333 Showroom");
  expect(job.images).toEqual(["https://cdn.example/vehicle-found.jpg", "https://cdn.example/vehicle-second.jpg"]);
  expect(job.selectedImage).toBe("https://cdn.example/vehicle-second.jpg");
  await page.route("**/api/dealerkit-images?*", route => route.fulfill({
    status: 404, json: { error: "No exact DealerKit match. Upload Image or enter a Vehicle URL." },
  }));
  await panel.getByRole("button", { name: "LOAD DEALERKIT IMAGES", exact: true }).click();
  await expect(page.getByText("No exact DealerKit match. Upload Image or enter a Vehicle URL.", { exact: true })).toBeVisible();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[0], key)).selectedImage).toBe(job.selectedImage);
  await expect(panel.getByLabel("Upload Image", { exact: true })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Load Images From URL" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("master font/width calibration and individual price position persist independently", async ({ page }) => {
  const errors = await setup(page);
  await importVehicles(page);
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByLabel("Campaign template").selectOption("sale-fixture");
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco 333 Showroom/ }).click();
  await panel.getByLabel("Upload Image", { exact: true }).setInputFiles({ name: "stock.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "Image 1 Selected" })).toBeVisible();
  await panel.getByText("Advanced campaign price defaults", { exact: true }).click();
  await panel.getByLabel("NOW width percent", { exact: true }).fill("115");
  await panel.getByLabel("WAS width percent", { exact: true }).fill("110");
  await panel.getByLabel("SAVE font family", { exact: true }).selectOption("Archivo Black|400");
  const controls = page.locator(".price-controls");
  await controls.getByText("Advanced price position", { exact: true }).click();
  await controls.getByLabel("X offset (px)", { exact: true }).fill("24");
  await controls.getByLabel("Y offset (px)", { exact: true }).fill("-16");
  await page.getByRole("button", { name: "Move NOW right 2 pixels" }).click();
  await expect.poll(() => page.evaluate(() => document.fonts.check('400 72px "Archivo Black"'))).toBe(true);
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(before.jobs[0].priceOffsets.nowPrice).toEqual({ x: 26, y: -16 });
  expect(before.priceLayout.nowPrice.x).toBe(215);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG Only", exact: true }).click();
  await assertPng(await downloadPromise);
  await page.screenshot({ path: "test-results/price-typography.png", fullPage: true });
  await page.reload();
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(restored.priceLayout).toEqual(before.priceLayout);
  expect(restored.priceLayout.savePrice.fontFamily).toBe("Archivo Black");
  expect(restored.priceLayout.nowPrice.widthScale).toBe(1.15);
  expect(restored.jobs[0].priceOffsets.nowPrice).toEqual({ x: 26, y: -16 });
  await panel.getByRole("button", { name: /AA22 AAA · Vansco/ }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[1], key)).priceOffsets.nowPrice).toEqual({ x: 0, y: 0 });
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco/ }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)).jobs[0], key)).priceOffsets.nowPrice).toEqual({ x: 26, y: -16 });
  await page.getByRole("button", { name: "Reset Price Position" }).click();
  const reset = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(reset.jobs[0].priceOffsets.nowPrice).toEqual({ x: 0, y: 0 });
  expect(reset.priceLayout).toEqual(before.priceLayout);
  expect(errors).toEqual([]);
});

test("removing active custom campaign template selects another valid template", async ({ page }) => {
  const errors = await setup(page);
  await importVehicles(page);
  const panel = page.getByRole("region", { name: "Vansco Sales Campaign" });
  await panel.getByLabel("Campaign template").selectOption("sale-fixture");
  await panel.getByRole("button", { name: /HJ22 LSK · Vansco/ }).click();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remove Sale Fixture", exact: true }).last().click();
  await expect(panel.getByLabel("Campaign template")).toHaveValue("van-finance");
  await page.reload();
  await expect(panel.getByLabel("Campaign template")).toHaveValue("van-finance");
  expect(errors).toEqual([]);
});
