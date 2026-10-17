import { validateVanscoUrl } from "./vanscoExtractor.js";

// This is the already-live, public, advertising-filtered DealerKit feed served
// by Marketing CRM. No DealerKit credentials are added to the Image Suite.
const FEED_URL = "https://marketing-crm-six.vercel.app/api/vansco-dealerkit-google-vehicle-feed";
const MAX_FEED_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 80;
const ALLOWED_IMAGE_HOSTS = new Set(["acdn.uk", "img.cdn.dragon2000.net", "static.wixstatic.com"]);

export function canonicalVehiclePage(value) {
  let url;
  try { url = new URL(validateVanscoUrl(value)); }
  catch { return ""; }
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (!path || path === "/") return "";
  return "vansco.co.uk" + path;
}

// Proper CSV parsing is required because product descriptions contain quoted
// commas, embedded newlines and escaped double quotes.
export function parseVehicleFeedCsv(csv) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(field); field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && csv[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("DealerKit image feed has malformed CSV.");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function safeImage(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port || !ALLOWED_IMAGE_HOSTS.has(u.hostname.toLowerCase())) return "";
    if (!/\.(?:jpe?g|png|webp)$/i.test(u.pathname)) return "";
    return u.href;
  } catch { return ""; }
}

export async function fetchDealerKitVehiclePageImages(pageUrl, { fetcher = fetch, feedUrl = FEED_URL } = {}) {
  const vehiclePage = canonicalVehiclePage(pageUrl);
  if (!vehiclePage) throw new Error("Paste an individual Vansco vehicle page, not the stock listing.");

  let response;
  try {
    response = await fetcher(feedUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: { Accept: "text/csv" },
    });
  } catch {
    throw new Error("Could not reach the live DealerKit image feed. Try again shortly.");
  }
  if (!response.ok) throw new Error("DealerKit live image feed returned " + response.status + ". Try again shortly.");

  const csv = await response.text();
  if (csv.length > MAX_FEED_BYTES) throw new Error("DealerKit live image feed was unexpectedly large.");
  const rows = parseVehicleFeedCsv(csv);
  const header = (rows.shift() || []).map((column, i) => i === 0 ? column.replace(/^\uFEFF/, "").trim() : column.trim());
  const index = Object.fromEntries(header.map((column, i) => [column, i]));
  for (const required of ["id", "link", "image_link", "additional_image_link"]) {
    if (index[required] === undefined) throw new Error("DealerKit image feed is missing its " + required + " field.");
  }

  // The listing URL is the vehicle identity. No fuzzy model or registration
  // search, because it could quietly attach a different van's photographs.
  const matched = rows.filter(row => canonicalVehiclePage(row[index.link]) === vehiclePage);
  if (!matched.length) {
    throw new Error("This vehicle is not in the current DealerKit advertising feed. It may be reserved, sold or not advertised.");
  }
  const stockIds = new Set(matched.map(row => row[index.id]).filter(Boolean));
  if (stockIds.size !== 1) throw new Error("Multiple DealerKit stock IDs match this vehicle page. No images attached.");

  const images = [], seen = new Set();
  for (const row of matched) {
    const source = [row[index.image_link], ...(row[index.additional_image_link] || "").split(",")];
    for (const value of source) {
      const url = safeImage(value);
      if (url && !seen.has(url)) { seen.add(url); images.push(url); }
      if (images.length >= MAX_IMAGES) break;
    }
    if (images.length >= MAX_IMAGES) break;
  }
  if (!images.length) throw new Error("DealerKit has no usable image URLs for this advertised vehicle.");
  return { images, count: images.length, source: "dealerkit-live-feed" };
}
