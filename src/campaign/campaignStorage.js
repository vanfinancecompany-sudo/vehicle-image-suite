import { newCampaign } from "./campaignModel.js";

export const CAMPAIGN_KEY = "vehicle-image-suite-sales-campaign";
const DB_NAME = "vehicle-image-suite-campaign-images";

export function loadCampaign(storage = window.localStorage) {
  const raw = storage.getItem(CAMPAIGN_KEY);
  if (!raw) return newCampaign();
  const campaign = JSON.parse(raw);
  if (campaign.version !== 1 || !Array.isArray(campaign.jobs) || !campaign.id ||
      campaign.jobs.some(job => !job.id || !job.transform || !job.priceOffsets ||
        !Array.isArray(job.images))) {
    throw new Error("Saved campaign could not be read. Existing browser data has been preserved.");
  }
  return campaign;
}

export function saveCampaign(campaign, storage = window.localStorage) {
  storage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
}

function openImages() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Cannot open image storage."));
  });
}

async function imageTransaction(mode, callback) {
  const db = await openImages();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("images", mode);
      const request = callback(tx.objectStore("images"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(new Error("Image storage failed. Browser storage may be full."));
      tx.onabort = () => reject(new Error("Image storage was interrupted."));
    });
  } finally { db.close(); }
}

export async function storeImage(file) {
  const reference = "upload:" + crypto.randomUUID();
  await imageTransaction("readwrite", store => store.put(file, reference));
  return reference;
}
export function readImage(reference) {
  return imageTransaction("readonly", store => store.get(reference));
}
export function removeStoredImage(reference) {
  return imageTransaction("readwrite", store => store.delete(reference));
}
export const isUpload = reference => reference.startsWith("upload:");
