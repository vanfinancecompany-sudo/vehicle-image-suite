import { extractVehicleImages, fetchVanscoPage } from "../lib/vanscoExtractor.js";

export default async function handler(req, res) {
  try {
    if (typeof req.query.url !== "string" || !req.query.url.trim()) {
      return res.status(400).json({ error: "Missing Vansco vehicle page URL." });
    }
    const page = await fetchVanscoPage(req.query.url);
    const images = extractVehicleImages(page.html, page.url);
    return res.status(200).json({ images, count: images.length });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Extraction failed." });
  }
}
