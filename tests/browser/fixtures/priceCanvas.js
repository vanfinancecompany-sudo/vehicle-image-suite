import { drawPrices, ensurePriceFont, priceGeometry } from "../../../src/campaign/priceRenderer.js";
import { SAVE_SAFE_AREA } from "../../../src/campaign/priceDefaults.js";

// Test backdrop only: approved customer artwork is never replaced by this fixture.
export async function renderPriceFixture(job, layout) {
  await ensurePriceFont(layout);
  const canvas = document.createElement("canvas");
  canvas.width = 960; canvas.height = 720;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e7e7e7"; ctx.fillRect(0, 0, 960, 720);
  ctx.fillStyle = "#111"; ctx.fillRect(8, 8, 680, 82);
  ctx.fillStyle = "#a60000"; ctx.beginPath();
  ctx.moveTo(690, 8); ctx.lineTo(952, 8); ctx.lineTo(952, 90); ctx.lineTo(669, 90); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#111"; ctx.fillRect(8, 594, 210, 110);
  ctx.fillStyle = "#ffd000"; ctx.beginPath();
  ctx.moveTo(218, 594); ctx.lineTo(471, 594); ctx.lineTo(450, 704); ctx.lineTo(181, 704); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#a60000"; ctx.fillRect(472, 594, 480, 110);
  ctx.strokeStyle = "#f89a00"; ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 944, 82); ctx.strokeRect(8, 594, 944, 110);
  ctx.fillStyle = "#e2e2e2"; ctx.font = "900 23px sans-serif"; ctx.fillText("WAS", 30, 638);
  ctx.fillStyle = "#111"; ctx.font = "900 25px sans-serif"; ctx.fillText("NOW", 230, 623);
  ctx.fillStyle = "#fff"; ctx.font = "900 28px sans-serif"; ctx.fillText("SAVE", 707, 35);
  ctx.fillStyle = "#555"; ctx.font = "20px sans-serif";
  ctx.fillText("Deterministic 960 × 720 production price renderer fixture", 150, 330);
  ctx.fillText("Test backdrop — the approved customer overlay remains untouched", 150, 360);
  drawPrices(ctx, job, layout);
  return { canvas, boxes: ["wasPrice", "nowPrice", "savePrice"].map(field => priceGeometry(ctx, job, field, layout)),
    safeArea: SAVE_SAFE_AREA };
}
