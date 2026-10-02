export function validateVanscoUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a valid Vansco vehicle page URL."); }
  if (!["https:", "http:"].includes(url.protocol) ||
      !["vansco.co.uk", "www.vansco.co.uk"].includes(url.hostname.toLowerCase()) ||
      url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    throw new Error("Use a vehicle page on vansco.co.uk.");
  }
  return url.href;
}

const decode = text => String(text).replace(/\\\//g, "/").replace(/\\u002[fF]/g, "/")
  .replace(/&amp;|&#38;/g, "&").replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'");

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4])]));
}

export function extractVehicleImages(html, pageUrl) {
  const candidates = new Map();
  function add(value, priority = 0, trusted = false) {
    if (typeof value !== "string" || !value.trim()) return;
    let url;
    try { url = new URL(decode(value.trim()), pageUrl); } catch { return; }
    if (!["http:", "https:"].includes(url.protocol)) return;
    const path = url.pathname.toLowerCase();
    if (/\.(svg|gif|ico)$/.test(path) || /(?:logo|favicon|autoguard|placeholder|banner|icon|badge|loading|pixel)/.test(path)) return;
    if (!trusted && !/\.(?:jpe?g|png|webp|avif)$/i.test(path)) return;
    if (url.hostname === "img.cdn.dragon2000.net") {
      url.pathname = url.pathname.replace(/-(?:small|medium|thumb|thumbnail)(?=\.\w+$)/i, "-large");
      if (url.pathname.includes("-large")) priority += 10000;
    }
    // Deduplicate only known resize parameters; signed query strings remain intact.
    const key = new URL(url);
    for (const param of ["w", "width", "h", "height", "quality", "q"]) key.searchParams.delete(param);
    const old = candidates.get(key.href);
    if (!old || priority > old.priority) candidates.set(key.href, { url: url.href, priority });
  }
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if ((attrs.width && Number(attrs.width) < 100) || (attrs.height && Number(attrs.height) < 70)) continue;
    const full = attrs["data-full"] || attrs["data-fullsize"] || attrs["data-large"] || attrs["data-original"];
    const set = attrs.srcset || attrs["data-srcset"];
    if (full) add(full, 100000, true);
    else if (set) {
      const sources = set.split(",").map(source => {
        const [url, descriptor = "1x"] = source.trim().split(/\s+/);
        const size = parseFloat(descriptor);
        return { url, size: Number.isFinite(size) ? size : 1 };
      }).sort((a, b) => b.size - a.size);
      if (sources[0]) add(sources[0].url, sources[0].size, true);
    } else add(attrs["data-src"] || attrs.src, 0, true);
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (/^(og:image(?::url)?|twitter:image)$/.test(attrs.property || attrs.name || "")) add(attrs.content, 1000, true);
  }
  function walk(value, imageContext = false) {
    if (typeof value === "string" && imageContext) add(value, 500, true);
    else if (Array.isArray(value)) value.forEach(entry => walk(entry, imageContext));
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        const relevant = /image|photo|picture|gallery|media/i.test(key);
        const isUrl = /^(url|src|contenturl|full|large|original)$/i.test(key);
        walk(entry, relevant || (imageContext && isUrl));
      }
    }
  }
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* Also inspect escaped CDN URLs below. */ }
  }
  const normalized = decode(html);
  for (const match of normalized.matchAll(/https?:\/\/[^"'\\\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi)) {
    const value = match[0];
    if (/dragon2000|dealerkit|\/vehicles?\/|\/stock\/|\/gallery\//i.test(value)) add(value, 0);
  }
  return [...candidates.values()].map(entry => entry.url);
}

export async function fetchVanscoPage(value, fetcher = fetch) {
  let url = validateVanscoUrl(value);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetcher(url, {
      redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "Mozilla/5.0 Vehicle Image Suite", Accept: "text/html" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Vansco returned a redirect without a destination.");
      url = validateVanscoUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error("Source page returned " + response.status);
    return { html: await response.text(), url };
  }
  throw new Error("Vansco returned too many redirects.");
}
