export function normalizeStockRegistration(value) {
  if (typeof value !== "string") throw new ImageLookupError("Enter a valid UK registration.", 400);
  const registration = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^(?:[A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z]|[A-Z]{1,3}[0-9]{1,4}|[0-9]{1,4}[A-Z]{1,3})$/.test(registration)) {
    throw new ImageLookupError("Enter a valid UK registration.", 400);
  }
  return registration;
}

export class ImageLookupError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function publicImageGallery(vehicle) {
  const seen = new Set();
  return (Array.isArray(vehicle.images) ? vehicle.images : [])
    .map((image, index) => ({ url: typeof image?.url === "string" ? image.url.trim() : "", order: Number.isFinite(image?.order) ? image.order : index }))
    .sort((a, b) => a.order - b.order)
    .filter(image => {
      try {
        const url = new URL(image.url);
        if (url.protocol !== "https:" || url.username || url.password || seen.has(image.url)) return false;
        seen.add(image.url); return true;
      } catch { return false; }
    }).map((image, order) => ({ url: image.url, order }));
}

// The browser calls our own API; only this server talks to the CRM bridge.
// DealerKit credentials remain exclusively in Marketing CRM.
export async function fetchDealerKitImages(registrationValue, {
  fetcher = fetch,
  bridgeUrl = process.env.DEALERKIT_BRIDGE_URL || "https://marketing-crm-six.vercel.app/api/vehicle-image-suite-stock",
} = {}) {
  const registration = normalizeStockRegistration(registrationValue);
  const endpoint = new URL(bridgeUrl);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new ImageLookupError("DealerKit bridge configuration is invalid.", 503);
  }
  endpoint.searchParams.set("registration", registration);
  let response;
  try {
    response = await fetcher(endpoint.href, { redirect: "error", signal: AbortSignal.timeout(30000), headers: { Accept: "application/json" } });
  } catch { throw new ImageLookupError("DealerKit bridge is unavailable. Use Upload Image or Load Images From URL.", 503); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const messages = {
      404: "No exact DealerKit vehicle/image result, or the CRM bridge is not installed yet. Use Upload Image or Load Images From URL.",
      409: "DealerKit has duplicate or changed registrations. No photos were attached. Use Upload Image or Load Images From URL.",
    };
    throw new ImageLookupError(messages[response.status] || "DealerKit images are unavailable. Use Upload Image or Load Images From URL.", [404, 409].includes(response.status) ? response.status : 503);
  }
  if (data.registration !== registration || typeof data.supplierStockId !== "string" || !data.supplierStockId.trim()) {
    throw new ImageLookupError("DealerKit returned a different vehicle identity. No photos were attached.", 409);
  }
  const images = publicImageGallery(data);
  if (!images.length) throw new ImageLookupError("No DealerKit photos for this registration. Use Upload Image or Load Images From URL.", 404);
  return { ok: true, registration, supplierStockId: data.supplierStockId.trim(), primaryImage: images[0].url, images };
}
