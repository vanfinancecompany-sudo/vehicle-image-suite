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

    const rawImages = matches.map((match) => match[0].replace(/\\\//g, "/"));

    const counts = {};
    for (const imageUrl of rawImages) {
      counts[imageUrl] = (counts[imageUrl] || 0) + 1;
    }

    return res.status(200).json({
      total: rawImages.length,
      unique: Object.keys(counts).length,
      images: Object.keys(counts).slice(0, 120),
    });
  } catch (err) {
    return res.status(500).json({
      error: "Extraction failed",
      details: err.message,
    });
  }
}
