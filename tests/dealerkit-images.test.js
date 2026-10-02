import test from "node:test";
import assert from "node:assert/strict";
import { fetchDealerKitImages, normalizeStockRegistration } from "../lib/dealerKitImages.js";
import handler from "../api/dealerkit-images.js";

const data = { ok: true, registration: "CP16AZW", supplierStockId: "stock-1", images: [
  { url: "https://cdn.example/two.jpg?signature=keep", order: 1 },
  { url: "https://cdn.example/one.jpg", order: 0 },
  { url: "https://cdn.example/one.jpg", order: 2 },
] };
const request = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
test("DealerKit bridge sends only normalised registration, returns ordered images and strips unrelated fields", async () => {
  const result = await fetchDealerKitImages(" cp16 azw ", { fetcher: async (url, options) => {
    assert.equal(new URL(url).searchParams.get("registration"), "CP16AZW");
    assert.equal(new URL(url).pathname, "/api/vehicle-image-suite-stock");
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return new Response(JSON.stringify({ ...data, secret: "must-not-escape", internalCRM: {} }));
  } });
  assert.deepEqual(result.images.map(image => image.order), [0, 1]);
  assert.equal(result.images[1].url, "https://cdn.example/two.jpg?signature=keep");
  assert.equal(result.primaryImage, result.images[0].url);
  assert.equal("secret" in result, false); assert.equal("internalCRM" in result, false);
});
test("duplicate or mismatched identity never attaches an image", async () => {
  await assert.rejects(fetchDealerKitImages("CP16AZW", { fetcher: request({}, 409) }), error => error.status === 409);
  for (const body of [{ ...data, registration: "CP16AZX" }, { ...data, supplierStockId: "" }]) {
    await assert.rejects(fetchDealerKitImages("CP16AZW", { fetcher: request(body) }), error => error.status === 409);
  }
});
test("no vehicle/gallery, missing bridge and network failure offer fallbacks", async () => {
  for (const [body, status] of [[{}, 404], [{ ...data, images: [] }, 200], [{ ...data, images: [{ url: "javascript:alert(1)" }] }, 200]]) {
    await assert.rejects(fetchDealerKitImages("CP16AZW", { fetcher: request(body, status) }), /Upload Image or Load Images From URL/);
  }
  await assert.rejects(fetchDealerKitImages("CP16AZW", { fetcher: async () => { throw new Error("secret"); } }), /bridge is unavailable/);
});
test("invalid registration and non-GET endpoint requests make no bridge call", async () => {
  assert.equal(normalizeStockRegistration("HJ22-LSK"), "HJ22LSK");
  await assert.rejects(fetchDealerKitImages("../CP16AZW", { fetcher: () => assert.fail("must not fetch") }), /valid UK registration/);
  const response = { status(code) { this.code = code; return this; }, setHeader() {}, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", query: { registration: "CP16AZW" } }, response);
  assert.equal(response.code, 405);
  await handler({ method: "GET", query: { registration: ["CP16AZW"] } }, response);
  assert.equal(response.code, 400);
});
