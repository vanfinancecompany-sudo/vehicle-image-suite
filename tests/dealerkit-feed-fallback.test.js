import test from "node:test";
import assert from "node:assert/strict";
import { canonicalVehiclePage, parseVehicleFeedCsv, fetchDealerKitVehiclePageImages } from "../lib/dealerKitVehiclePageFeed.js";
import extractHandler from "../api/extract.js";

const tesla = "https://www.vansco.co.uk/tesla-model-y-dual-motor-long-range-suv-electric-auto-4wde-in-southampton-hampshire-24e85afc-b304-4deb-9f1e-b4e600bde2c5";
const first = "https://acdn.uk/vansco/i/front.jpeg";
const second = "https://acdn.uk/vansco/i/side.jpeg";
const csv = 'id,link,image_link,additional_image_link,description\r\n'
  + 'other,https://www.vansco.co.uk/similar-car,https://acdn.uk/vansco/i/wrong.jpeg,,bad\r\n'
  + 'tesla-1,' + tesla + ',' + first + ',"' + first + ',' + second + '","Multi-line,\n""quoted"" description"\r\n';

function mockResponse() {
  return {
    code: 0, body: null, headers: {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

test("feed parser handles quoted image lists, commas, escaped quotes and description line breaks", () => {
  const rows = parseVehicleFeedCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[2][4], 'Multi-line,\n"quoted" description');
  assert.equal(rows[2][3], first + "," + second);
});

test("exact vehicle page match ignores query but rejects fuzzy/mismatched vehicle", async () => {
  assert.equal(canonicalVehiclePage(tesla + "?store=VANSCO-333"), canonicalVehiclePage(tesla));
  let reads = 0;
  const result = await fetchDealerKitVehiclePageImages(tesla + "?some=parameter", {
    fetcher: async () => { reads++; return new Response(csv); },
  });
  assert.equal(reads, 1);
  assert.deepEqual(result.images, [first, second]);
  assert.equal(result.source, "dealerkit-live-feed");

  await assert.rejects(fetchDealerKitVehiclePageImages("https://www.vansco.co.uk/another-tesla", {
    fetcher: async () => new Response(csv),
  }), /not in the current DealerKit advertising feed/);
  await assert.rejects(fetchDealerKitVehiclePageImages("https://attacker.example/tesla", {
    fetcher: () => assert.fail("Never fetch for foreign domains"),
  }), /individual Vansco vehicle page/);
});

test("rejects ambiguous stock identities, unrelated image hosts and upstream errors", async () => {
  const ambiguous = csv + "different-stock-id," + tesla + "," + first + ",,\r\n";
  await assert.rejects(fetchDealerKitVehiclePageImages(tesla, { fetcher: async () => new Response(ambiguous) }),
    /Multiple DealerKit stock IDs/);
  const unsafe = 'id,link,image_link,additional_image_link\r\nid1,' + tesla + ',https://bad.example/a.jpeg,https://acdn.uk/vansco/i/one.jpeg\r\n';
  const safeResult = await fetchDealerKitVehiclePageImages(tesla, { fetcher: async () => new Response(unsafe) });
  assert.deepEqual(safeResult.images, ["https://acdn.uk/vansco/i/one.jpeg"]);
  await assert.rejects(fetchDealerKitVehiclePageImages(tesla, { fetcher: async () => new Response("", { status: 503 }) }),
    /returned 503/);
});

test("existing extractor is preserved when Vansco page loads", async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html><img src="https://acdn.uk/vansco/i/page.jpeg"></html>');
    const res = mockResponse();
    await extractHandler({ query: { url: tesla } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.source, "vansco-page");
    assert.deepEqual(res.body.images, ["https://acdn.uk/vansco/i/page.jpeg"]);
  } finally { globalThis.fetch = fetchOriginal; }
});

test("HTTP 403 uses matched live feed without changing the vehicle page URL", async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    let requests = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      if (String(url) === tesla) return new Response("", { status: 403 });
      if (String(url).includes("vansco-dealerkit-google-vehicle-feed")) return new Response(csv);
      throw new Error("Unexpected URL");
    };
    const res = mockResponse();
    await extractHandler({ query: { url: tesla } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.source, "dealerkit-live-feed");
    assert.deepEqual(res.body.images, [first, second]);
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = fetchOriginal; }
});

test("no fallback when source returns unrelated errors; does not attach another vehicle", async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), tesla);
      return new Response("", { status: 404 });
    };
    const res = mockResponse();
    await extractHandler({ query: { url: tesla } }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.error, "Source page returned 404");
  } finally { globalThis.fetch = fetchOriginal; }
});
