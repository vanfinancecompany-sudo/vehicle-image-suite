import { pricesFromSaleArtwork, SALE_PRICE_AREAS, SALE_NUMBER_AREAS } from "./salePriceReader.js";

// Browser-local OCR: no customer or vehicle photo is sent to an external
// recognition service. Load the worker only when needed.
const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let workerPromise, loaderPromise;
function loadTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!loaderPromise) loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => window.Tesseract?.createWorker
      ? resolve(window.Tesseract) : reject(new Error("Price reader could not initialise."));
    script.onerror = () => reject(new Error("Price reader could not load. Please enter prices manually."));
    document.head.appendChild(script);
  }).catch(error => { loaderPromise = null; throw error; });
  return loaderPromise;
}
async function getWorker() {
  if (!workerPromise) workerPromise = (async () => {
    const Tesseract = await loadTesseract();
    return Tesseract.createWorker("eng");
  })().catch(error => { workerPromise = null; throw error; });
  return workerPromise;
}
function cropPriceArea(image, area, field = "", digitsOnly = false) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("Vehicle advert could not be read.");
  const sx = Math.round(area.x * width), sy = Math.round(area.y * height);
  const sw = Math.min(width - sx, Math.max(1, Math.round(area.width * width)));
  const sh = Math.min(height - sy, Math.max(1, Math.round(area.height * height)));
  const scale = Math.max(2, Math.min(4, Math.ceil(760 / Math.max(sw, sh))));
  const canvas = document.createElement("canvas");
  canvas.width = sw * scale;
  canvas.height = sh * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (digitsOnly) {
    // The old WAS and SAVE amounts use white glyphs on a dark background.
    // NOW uses dark glyphs on orange. Convert each to black ink on white.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
      const lightness = r * 0.299 + g * 0.587 + b * 0.114;
      const isInk = field === "now" ? lightness < 104 : lightness > 188;
      const colour = isInk ? 0 : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = colour;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export async function readSalePricesFromImage(image, onProgress = () => {}) {
  const worker = await getWorker();
  const text = { was: [], now: [], save: [] };
  await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
  for (const field of ["was", "now", "save"]) {
    onProgress(field);
    const cropped = cropPriceArea(image, SALE_PRICE_AREAS[field]);
    try {
      const ocr = await worker.recognize(cropped);
      text[field].push(ocr?.data?.text || "");
    } finally {
      cropped.width = cropped.height = 0;
    }
  }
  let read = pricesFromSaleArtwork(text);
  if (!read.ok || read.inferredFields?.length) {
    onProgress("enhanced price digits");
    await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789,£" });
    for (const field of ["was", "now", "save"]) {
      const cropped = cropPriceArea(image, SALE_NUMBER_AREAS[field], field, true);
      try {
        const ocr = await worker.recognize(cropped);
        text[field].push(ocr?.data?.text || "");
      } finally {
        cropped.width = cropped.height = 0;
      }
    }
    read = pricesFromSaleArtwork(text);
  }
  return { ...read, recognisedText: text };
}
