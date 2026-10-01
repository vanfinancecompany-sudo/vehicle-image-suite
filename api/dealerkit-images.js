import { fetchDealerKitImages } from "../lib/dealerKitImages.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
  try { return res.status(200).json(await fetchDealerKitImages(req.query?.registration)); }
  catch (error) { return res.status(error.status || 503).json({ ok: false, error: error.message }); }
}
