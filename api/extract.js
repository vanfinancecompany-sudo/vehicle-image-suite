import { extractVehicleImages, fetchVanscoPage, validateVanscoUrl } from "../lib/vanscoExtractor.js";
import { fetchDealerKitVehiclePageImages } from "../lib/dealerKitVehiclePageFeed.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (typeof req.query?.url !== "string" || !req.query.url.trim()) {
      return res.status(400).json({ error: "Missing Vansco vehicle page URL." });
    }
    const url = validateVanscoUrl(req.query.url);
    try {
      // Leave the existing full website extraction unchanged when it works.
      const page = await fetchVanscoPage(url);
      const images = extractVehicleImages(page.html, page.url);
      return res.status(200).json({ images, count: images.length, source: "vansco-page" });
    } catch (error) {
      // Vansco's anti-bot 403 must not prevent an exact vehicle-page match in
      // the live DealerKit advertising feed. No fallback for unrelated faults.
      if (error?.message !== "Source page returned 403") throw error;
      const result = await fetchDealerKitVehiclePageImages(url);
      return res.status(200).json(result);
    }
  } catch (error) {
    return res.status(400).json({ error: error.message || "Extraction failed." });
  }
}
