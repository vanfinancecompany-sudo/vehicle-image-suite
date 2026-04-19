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

    const rawImages = matches.map((match) => match[0]);

    const isLikelyVehicleImage = (value) => {
      const lower = String(value || "").toLowerCase();

      return !(
        lower.includes("logo") ||
        lower.includes("icon") ||
        lower.includes("badge") ||
        lower.includes("placeholder") ||
        lower.includes("spinner") ||
        lower.includes("brand") ||
        lower.includes("thumb") ||
        lower.includes("thumbnail")
      );
    };

    const getDedupeKey = (value) => {
      try {
        const cleaned = String(value || "").replace(/\\\//g, "/").trim();
        const parsed = new URL(cleaned);
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
      } catch {
        return String(value || "")
          .replace(/\\\//g, "/")
          .split("?")[0]
          .trim()
          .toLowerCase();
      }
    };

    const images = [];
    const seen = new Set();

    for (const imageUrl of rawImages) {
      if (!isLikelyVehicleImage(imageUrl)) continue;

      const key = getDedupeKey(imageUrl);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      images.push(imageUrl.replace(/\\\//g, "/"));
    }

    return res.status(200).json({ images });
  } catch (err) {
    return res.status(500).json({
      error: "Extraction failed",
      details: err.message,
    });
  }
}
