export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    const response = await fetch(url);
    const html = await response.text();

    const matches = [...html.matchAll(/https:\/\/[^"'\\s>]+\.(jpg|jpeg|png)(\?[^"'\\s>]*)?/gi)];
    const rawImages = matches.map((match) => match[0]);

    const normalizeImageUrl = (value) => {
      try {
        const parsed = new URL(value);
        parsed.hash = "";

        const removableParams = [
          "w",
          "h",
          "width",
          "height",
          "quality",
          "q",
          "fit",
          "crop",
          "auto",
          "dpr",
          "fm",
          "ixlib",
          "ts",
          "v",
        ];

        removableParams.forEach((param) => parsed.searchParams.delete(param));
        return parsed.toString();
      } catch {
        return String(value || "").trim();
      }
    };

    const isLikelyVehicleImage = (value) => {
      const lower = String(value || "").toLowerCase();

      if (
        lower.includes("logo") ||
        lower.includes("icon") ||
        lower.includes("badge") ||
        lower.includes("placeholder") ||
        lower.includes("spinner") ||
        lower.includes("brand") ||
        lower.includes("thumb") ||
        lower.includes("thumbnail")
      ) {
        return false;
      }

      return true;
    };

    const images = [];
    const seen = new Set();

    for (const imageUrl of rawImages) {
      if (!isLikelyVehicleImage(imageUrl)) continue;

      const normalized = normalizeImageUrl(imageUrl);
      if (!normalized || seen.has(normalized)) continue;

      seen.add(normalized);
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
