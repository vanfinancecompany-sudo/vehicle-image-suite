export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    const response = await fetch(url);
    const html = await response.text();

    const matches = [
      ...html.matchAll(/https:\/\/[^"'\\s>]+?\.(jpg|jpeg|png)(\?[^"'\\s>]*)?/gi),
    ];

    const rawImages = matches.map((m) => m[0].replace(/\\\//g, "/"));

    const images = [];
    const seen = new Set();

    for (const imageUrl of rawImages) {
      const lower = imageUrl.toLowerCase();

      // ✅ ONLY KEEP LARGE IMAGES
      if (!lower.includes("-large")) continue;

      // remove duplicates
      const key = imageUrl.split("?")[0];
      if (seen.has(key)) continue;

      seen.add(key);
      images.push(imageUrl);
    }

    return res.status(200).json({ images });
  } catch (err) {
    return res.status(500).json({
      error: "Extraction failed",
      details: err.message,
    });
  }
}
