export const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1 };
export const PRICE_FIELDS = ["wasPrice", "nowPrice", "savePrice"];
// SAVE always starts 30px to the right of the master-price anchor. The WAS
// and NOW controls retain their approved default positions.
export const DEFAULT_PRICE_OFFSETS = Object.freeze({
  wasPrice: Object.freeze({ x: 0, y: 0 }),
  nowPrice: Object.freeze({ x: 0, y: 0 }),
  savePrice: Object.freeze({ x: 30, y: 0 }),
});
export const SAVE_OFFSET_REVISION = 1;

export function parsePrice(source) {
  if (source == null || String(source).trim() === "") return null;
  const raw = String(source).trim().replace(/£|GBP/gi, "").replace(/[,\s]/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return { value, pence: /\.\d/.test(raw) };
}

export function formatPrice(price) {
  if (!price || !Number.isFinite(price.value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP",
    minimumFractionDigits: price.pence ? 2 : 0,
    maximumFractionDigits: price.pence ? 2 : 0,
  }).format(price.value);
}

export function createJob(row, id = crypto.randomUUID()) {
  const wasPrice = parsePrice(row.wasPrice);
  const nowPrice = parsePrice(row.nowPrice);
  let savePrice = parsePrice(row.savePrice);
  const suppliedSave = row.savePrice != null && String(row.savePrice).trim() !== "";
  if (!suppliedSave && wasPrice && nowPrice) {
    savePrice = {
      value: Math.round((wasPrice.value - nowPrice.value) * 100) / 100,
      pence: wasPrice.pence || nowPrice.pence,
    };
  }
  const warnings = [];
  const registration = String(row.registration || "").trim().toUpperCase();
  if (!registration) warnings.push("Registration is missing. Edit it before export.");
  for (const [label, price] of [["WAS", wasPrice], ["NOW", nowPrice], ["SAVE", savePrice]]) {
    if (!price) warnings.push(label + " is missing or is not a valid price.");
    else if (price.value < 0) warnings.push(label + " is negative.");
  }
  if (suppliedSave && savePrice && wasPrice && nowPrice &&
      Math.abs(savePrice.value - (wasPrice.value - nowPrice.value)) > 1.000001) {
    warnings.push("Spreadsheet SAVE differs from WAS − NOW by more than £1. Supplied SAVE retained.");
  }
  return {
    id, registration, location: String(row.location ?? "").trim(),
    vehicleUrl: String(row.vehicleUrl ?? "").trim(),
    wasPrice, nowPrice, savePrice, warnings,
    images: [], selectedImage: "", transform: { ...DEFAULT_TRANSFORM },
    priceOffsets: Object.fromEntries(PRICE_FIELDS.map(field => [field, { ...DEFAULT_PRICE_OFFSETS[field] }])),
    done: false,
  };
}

export function campaignFilename(job) {
  const clean = value => String(value).trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const registration = clean(job.registration.toUpperCase());
  if (!registration) throw new Error("Enter a registration before exporting.");
  return [registration, clean(job.location)].filter(Boolean).join("-").slice(0, 180) + ".png";
}

export function nextUnfinished(jobs, currentId) {
  const index = jobs.findIndex(job => job.id === currentId);
  return [...jobs.slice(index + 1), ...jobs.slice(0, index + 1)]
    .find(job => !job.done && job.id !== currentId)?.id || currentId;
}

export function newCampaign(name = "Vansco Sales Campaign") {
  return { version: 1, id: crypto.randomUUID(), name, templateId: "", jobs: [], activeJobId: "", enabled: false,
    saveOffsetRevision: SAVE_OFFSET_REVISION };
}

// Upgrade previously imported vehicle queues without doubling an existing
// manually calibrated +30px SAVE. Any intentional non-zero offsets are kept.
export function migrateCampaignSaveOffsets(campaign) {
  if (campaign.saveOffsetRevision >= SAVE_OFFSET_REVISION) return campaign;
  return { ...campaign, saveOffsetRevision: SAVE_OFFSET_REVISION,
    jobs: campaign.jobs.map(job => {
      const old = job.priceOffsets?.savePrice;
      if (!old || (old.x === 0 && old.y === 0)) {
        return { ...job, priceOffsets: {
          ...(job.priceOffsets || {}),
          savePrice: { ...DEFAULT_PRICE_OFFSETS.savePrice },
        } };
      }
      return job;
    }),
  };
}

const MANUAL_SALE_PRICE_FIELDS = Object.freeze({ wasPrice: "", nowPrice: "", savePrice: "" });

export function isSaleTemplate(template) {
  if (!template) return false;
  // Sale overlays are uploaded as custom templates; their filenames/names contain SALE.
  // Never draw these values over the Finance or Rent2Buy templates.
  return /(^|[^a-z])sale([^a-z]|$)/i.test([
    template.id, template.name, template.category, template.fileLabel, template.filePath,
  ].filter(Boolean).join(" "));
}

export function manualSalePriceJob(values = MANUAL_SALE_PRICE_FIELDS) {
  const hasInput = PRICE_FIELDS.some(field => String(values?.[field] ?? "").trim());
  if (!hasInput) return { job: null, error: "" };
  const job = createJob({
    registration: "MANUAL",
    wasPrice: values.wasPrice,
    nowPrice: values.nowPrice,
    savePrice: values.savePrice,
  }, "manual-sale-preview");
  if (job.wasPrice && job.nowPrice && job.nowPrice.value > job.wasPrice.value) {
    return { job: null, error: "NOW must not be greater than WAS on a sale advert." };
  }
  if (!job.wasPrice || !job.nowPrice || !job.savePrice
    || [job.wasPrice, job.nowPrice, job.savePrice].some(price => price.value < 0)) {
    return { job: null, error: "Enter valid WAS and NOW prices. SAVE is optional and calculates automatically." };
  }
  return { job, error: "" };
}
