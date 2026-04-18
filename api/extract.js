export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    const response = await fetch(url);
    const html = await response.text();

    // simple image scrape (works for Vansco)
    const matches = [...html.matchAll(/https:\/\/[^"]+\.(jpg|jpeg|png)/gi)];
    const images = matches.map(m => m[0]);

    return res.status(200).json({
      images: [...new Set(images)],
    });
  } catch (err) {
    return res.status(500).json({
      error: "Extraction failed",
      details: err.message,
    });
  }
}
