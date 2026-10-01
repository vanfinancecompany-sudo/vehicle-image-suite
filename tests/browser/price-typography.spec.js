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
