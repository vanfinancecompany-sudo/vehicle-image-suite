export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send("Missing URL");
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Vehicle Image Suite",
      },
    });

    if (!response.ok) {
      return res.status(502).send(`Image returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Image proxy failed");
  }
}
