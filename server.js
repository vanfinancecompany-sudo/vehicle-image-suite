import express from "express";
import dealerKitImagesHandler from "./api/dealerkit-images.js";
import cors from "cors";
import fetch from "node-fetch";
import archiver from "archiver";

import extractHandler from "./api/extract.js";

const app = express();

app.use(cors());

app.get(["/api/extract", "/extract"], extractHandler);
app.get("/api/dealerkit-images", dealerKitImagesHandler);

app.get(["/api/image", "/image-proxy"], async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: "No image URL provided" });
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 Vehicle Image Suite",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Image returned ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer);
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).json({ error: "Could not proxy image" });
  }
});

app.get(["/api/download-zip", "/download-zip"], async (req, res) => {
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

    for (let i = 0; i < urls.length; i++) {
      const imageUrl = urls[i];
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = `${String(i + 1).padStart(2, "0")}.jpg`;

      archive.append(buffer, { name: fileName });
    }

    await archive.finalize();
  } catch (error) {
    console.error("ZIP error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to create ZIP" });
    }
  }
});

app.listen(5000, () => {
  console.log("Extractor server running on http://localhost:5000");
});
