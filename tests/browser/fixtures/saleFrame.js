// Deterministic frame for checking transparent outside margins and the photo
// aperture. The customer's approved browser-local PNG is never modified.
export function saleFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = 960; canvas.height = 720;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#171717"; ctx.fillRect(8, 8, 944, 86);
  ctx.fillRect(8, 94, 120, 500); ctx.fillRect(8, 594, 944, 110);
  ctx.fillStyle = "#ac0808";
  ctx.beginPath(); ctx.moveTo(690, 8); ctx.lineTo(952, 8);
  ctx.lineTo(952, 94); ctx.lineTo(669, 94); ctx.closePath(); ctx.fill();
  ctx.fillRect(472, 594, 480, 110);
  ctx.fillStyle = "#ffcf00";
  ctx.beginPath(); ctx.moveTo(218, 594); ctx.lineTo(472, 594);
  ctx.lineTo(450, 704); ctx.lineTo(181, 704); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#ff9b00"; ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 944, 696); ctx.strokeRect(128, 94, 824, 500);
  ctx.fillStyle = "#fff"; ctx.font = "900 24px sans-serif"; ctx.fillText("SAVE", 703, 34);
  ctx.fillStyle = "#ddd"; ctx.fillText("WAS", 30, 635);
  ctx.fillStyle = "#111"; ctx.fillText("NOW", 230, 621);
  ctx.fillStyle = "#fff"; ctx.font = "900 65px sans-serif"; ctx.fillText("OCTOBER", 146, 73);
  ctx.fillStyle = "#ffcf00"; ctx.fillText("SALE", 481, 73);
  ctx.save(); ctx.translate(107, 154); ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "#fff"; ctx.font = "900 86px sans-serif"; ctx.fillText("SALE", 0, 0); ctx.restore();
  ctx.fillStyle = "#fff"; ctx.font = "900 34px sans-serif"; ctx.fillText("AutoGuard", 495, 643);
  ctx.font = "900 22px sans-serif"; ctx.fillText("FREE 1-YEAR WARRANTY", 495, 679);
  return canvas;
}
export function edgePhoto() {
  const canvas = document.createElement("canvas");
  canvas.width = 960; canvas.height = 720;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#93c5fd"; ctx.fillRect(0, 0, 960, 720);
  ctx.fillStyle = "#64748b"; ctx.fillRect(0, 445, 960, 275);
  ctx.strokeStyle = "#0ea5e9"; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 948, 708);
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(170, 310, 660, 130);
  ctx.beginPath(); ctx.moveTo(270, 310); ctx.lineTo(360, 222);
  ctx.lineTo(580, 222); ctx.lineTo(650, 310); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#334155"; ctx.fillRect(365, 236, 190, 65);
  ctx.fillStyle = "#111"; for (const x of [290, 705]) {
    ctx.beginPath(); ctx.arc(x, 445, 56, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}
