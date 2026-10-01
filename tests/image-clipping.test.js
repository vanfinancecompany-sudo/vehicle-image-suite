import test from "node:test";
import assert from "node:assert/strict";
import { imageAperture } from "../src/canvasComposite.js";

test("photo mask follows the enclosed aperture and excludes transparent outer margins and holes", () => {
  const width = 14, height = 12, alpha = new Uint8Array(width * height);
  for (let y = 1; y < 11; y++) for (let x = 1; x < 13; x++) alpha[y * width + x] = 255;
  for (let y = 3; y < 10; y++) for (let x = 3; x < 12; x++) alpha[y * width + x] = 0;
  alpha[2 * width + 2] = 0; // Decorative transparent hole.
  alpha[5 * width + 3] = 180; // Semi-transparent edge artwork.
  alpha[6 * width + 4] = 255; // Opaque artwork inside the aperture.
  const mask = imageAperture(alpha, width, height);
  assert.equal(mask[0], 0);
  assert.equal(mask[2 * width + 2], 0);
  assert.equal(mask[5 * width + 3], 255);
  assert.equal(mask[6 * width + 4], 0);
  assert.equal(mask[8 * width + 8], 255);
  assert.equal(mask[10 * width + 8], 0);
});
test("normal edge-connected photo windows remain available and opaque templates reveal no photo", () => {
  const alpha = new Uint8Array(10 * 10);
  alpha.fill(255, 70);
  const mask = imageAperture(alpha, 10, 10);
  assert.equal(mask[0], 255);
  assert.equal(mask[69], 255);
  assert.equal(mask[70], 0);
  assert.ok(imageAperture(new Uint8Array(100).fill(255), 10, 10).every(value => value === 0));
});
