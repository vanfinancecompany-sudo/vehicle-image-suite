import { drawPrices } from "./campaign/priceRenderer.js";

// The main transparent component is the vehicle aperture. Separate transparent
// margins and decorative holes must never reveal the photograph.
export function imageAperture(alpha, width, height) {
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let largest = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || alpha[start] === 255) continue;
    let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const pixel = queue[head++], x = pixel % width;
      const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1,
        pixel >= width ? pixel - width : -1, pixel < seen.length - width ? pixel + width : -1];
      for (const next of neighbours) {
        if (next >= 0 && !seen[next] && alpha[next] < 255) {
          seen[next] = 1; queue[tail++] = next;
        }
      }
    }
    if (tail > largest.length) largest = queue.slice(0, tail);
  }
  const mask = new Uint8Array(width * height);
  for (const pixel of largest) mask[pixel] = 255;
  return mask;
}

const apertureCache = new WeakMap();
const photoLayers = new WeakMap();
function canvas(width, height) {
  const result = document.createElement("canvas");
  result.width = width; result.height = height;
  return result;
}
function templateMask(image, width, height) {
  let sizes = apertureCache.get(image);
  if (!sizes) { sizes = new Map(); apertureCache.set(image, sizes); }
  const key = width + "x" + height;
  if (!sizes.has(key)) {
    const mask = canvas(width, height), ctx = mask.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3];
    const aperture = imageAperture(alpha, width, height);
    for (let i = 0; i < aperture.length; i++) {
      pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255;
      pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = aperture[i];
    }
    ctx.putImageData(pixels, 0, 0);
    sizes.set(key, mask);
  }
  return sizes.get(key);
}

export function drawComposite(ctx, vehicleImage, templateImage, template, transform, job, priceLayout) {
  const { width, height } = template;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, width, height);
  if (vehicleImage) {
    let layer = photoLayers.get(ctx);
    if (!layer || layer.width !== width || layer.height !== height) {
      layer = canvas(width, height); photoLayers.set(ctx, layer);
    }
    const photo = layer.getContext("2d");
    photo.clearRect(0, 0, width, height);
    const imageWidth = vehicleImage.naturalWidth || vehicleImage.width;
    const imageHeight = vehicleImage.naturalHeight || vehicleImage.height;
    // Keep the existing full-canvas transform, so saved positioning is unchanged.
    const coverScale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * coverScale * transform.scale;
    const drawHeight = imageHeight * coverScale * transform.scale;
    photo.drawImage(vehicleImage, (width - drawWidth) / 2 + transform.x,
      (height - drawHeight) / 2 + transform.y, drawWidth, drawHeight);
    if (templateImage) {
      photo.save();
      photo.globalCompositeOperation = "destination-in";
      photo.drawImage(templateMask(templateImage, width, height), 0, 0);
      photo.restore();
    }
    ctx.drawImage(layer, 0, 0);
  } else {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 34px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Select a vehicle image", width / 2, height / 2);
    ctx.textAlign = "left";
  }
  if (templateImage) ctx.drawImage(templateImage, 0, 0, width, height);
  if (job) drawPrices(ctx, job, priceLayout);
}
