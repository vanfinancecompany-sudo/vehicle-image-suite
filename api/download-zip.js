import archiver from "archiver";

export default async function handler(req, res) {
  try {
    const urlsParam = req.query.urls;

    if (!urlsParam) {
      return res.status(400).json({ error: "No image URLs provided" });
    }

    const urls = JSON.parse(urlsParam);

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "Invalid image URL list" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="vehicle-images.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (let i = 0; i < urls.length; i += 1) {
      const imageUrl = urls[i];
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 Vehicle Image Suite",
        },
      });

      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = `${String(i + 1).padStart(2, "0")}.jpg`;
      archive.append(buffer, { name: fileName });
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create ZIP" });
  }
}
