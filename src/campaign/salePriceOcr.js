import { pricesFromSaleArtwork, SALE_PRICE_AREAS } from "./salePriceReader.js";

// OCR runs locally in the browser. No photo is uploaded to an OCR service.
// Load the library only when a sale price read is requested so ordinary editing
// and image exports do not depend on the OCR network assets.
const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let workerPromise;
let loaderPromise;

function loadTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!loaderPromise) loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => window.Tesseract?.createWorker
      ? resolve(window.Tesseract) : reject(new Error("Price-reading library failed to initialise."));
    script.onerror = () => reject(new Error(
      "The browser could not load the price reader. Check the connection or enter prices manually."));
    document.head.appendChild(script);
  }).catch(error => { loaderPromise = null; throw error; });
  return loaderPromise;
}

async function getWorker() {
  if (!workerPromise) workerPromise = (async () => {
    const Tesseract = await loadTesseract();
    const worker = await Tesseract.createWorker("eng");
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    return worker;
  })().catch(error => { workerPromise = null; throw error; });
  return workerPromise;
}

function cropPriceArea(image, area) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("Vehicle image cannot be read.");
  const sx = Math.round(area.x * width), sy = Math.round(area.y * height);
  const sw = Math.max(1, Math.round(area.width * width));
  const sh = Math.max(1, Math.round(area.height * height));
  // Enlarge the label/amount box for easier reading of small display images.
  const scale = Math.max(2, Math.min(4, Math.ceil(720 / Math.max(sw, sh))));
  const canvas = document.createElement("canvas");
  canvas.width = sw * scale;
  canvas.height = sh * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Per-image, per-price-zone OCR. Keeping the regions separate avoids reading
// registrations, warranty claims or arbitrary vehicle numbers as sale prices.
export async function readSalePricesFromImage(image, onProgress = () => {}) {
  const worker = await getWorker();
  const text = {};
  for (const field of ["was", "now", "save"]) {
    onProgress(field);
    const cropped = cropPriceArea(image, SALE_PRICE_AREAS[field]);
    const result = await worker.recognize(cropped);
    text[field] = result?.data?.text || "";
    cropped.width = 0;
    cropped.height = 0;
  }
  return { ...pricesFromSaleArtwork(text), recognisedText: text };
}
