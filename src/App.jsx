import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = "";
const TEMPLATE_STORAGE_KEY = "vehicle-image-suite-template-library";

const EDITOR_CANVAS = {
  width: 960,
  height: 720,
};

const DEFAULT_TEMPLATES = [
  {
    id: "van-finance",
    name: "Van Finance",
    category: "van-finance",
    filePath: "/templates/van-finance-template.png",
    fileLabel: "van-finance-template.png",
    width: EDITOR_CANVAS.width,
    height: EDITOR_CANVAS.height,
    isDefault: true,
    source: "public/templates",
  },
  {
    id: "rent2buy",
    name: "Rent2Buy",
    category: "rent2buy",
    filePath: "/templates/rent2buy-template.png",
    fileLabel: "rent2buy-template.png",
    width: EDITOR_CANVAS.width,
    height: EDITOR_CANVAS.height,
    isDefault: true,
    source: "public/templates",
  },
];

function getImageProxyUrl(url) {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createTemplateId(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "template"}-${Date.now()}`;
}

function safeSlug(value, fallback = "vehicle") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || fallback;
}

function getSourceSlug(pageUrl, imageUrl) {
  const source = pageUrl || imageUrl || "vehicle-image";
  try {
    const parsed = new URL(source);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return safeSlug(segments.at(-1) || parsed.hostname, "vehicle-image");
  } catch {
    return safeSlug(source, "vehicle-image");
  }
}

function getExportFilename({ pageUrl, imageUrl, template, index }) {
  const sourceSlug = getSourceSlug(pageUrl, imageUrl);
  const templateSlug = safeSlug(template?.name || template?.id, "template");
  const imageNumber = String(index + 1).padStart(2, "0");
  return `${sourceSlug}-${templateSlug}-${imageNumber}.png`;
}

function normalizeTemplate(template) {
  return {
    ...template,
    width: EDITOR_CANVAS.width,
    height: EDITOR_CANVAS.height,
  };
}

function readTemplateFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read template file."));
    reader.readAsDataURL(file);
  });
}

function loadTemplateLibrary() {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;

  try {
    const stored = JSON.parse(window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return DEFAULT_TEMPLATES;

    const storedById = new Map(stored.map((template) => [template.id, template]));
    const defaultTemplates = DEFAULT_TEMPLATES.map((template) =>
      normalizeTemplate({ ...template, ...(storedById.get(template.id) || {}) })
    );
    const customTemplates = stored
      .filter((template) => !DEFAULT_TEMPLATES.some((defaultTemplate) => defaultTemplate.id === template.id))
      .map(normalizeTemplate);

    return [...defaultTemplates, ...customTemplates];
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function loadCanvasImage(src, useCrossOrigin = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (useCrossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function drawComposite(ctx, vehicleImage, templateImage, template, transform) {
  const { width, height } = template;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, width, height);

  if (vehicleImage) {
    const coverScale = Math.max(width / vehicleImage.naturalWidth, height / vehicleImage.naturalHeight);
    const drawWidth = vehicleImage.naturalWidth * coverScale * transform.scale;
    const drawHeight = vehicleImage.naturalHeight * coverScale * transform.scale;
    const x = (width - drawWidth) / 2 + transform.x;
    const y = (height - drawHeight) / 2 + transform.y;
    ctx.drawImage(vehicleImage, x, y, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 34px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Select a vehicle image", width / 2, height / 2);
    ctx.textAlign = "left";
  }

  if (templateImage) {
    ctx.drawImage(templateImage, 0, 0, width, height);
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Export failed. Please try another image."));
        return;
      }
      resolve(blob);
    }, "image/png", 0.95);
  });
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function getCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function getDosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, dosDate };
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { time, dosDate } = getDosDateTime();

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const crc = getCrc32(data);

    const localHeader = [];
    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, time);
    writeUint16(localHeader, dosDate);
    writeUint32(localHeader, crc);
    writeUint32(localHeader, data.length);
    writeUint32(localHeader, data.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    chunks.push(new Uint8Array(localHeader), nameBytes, data);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, time);
    writeUint16(centralHeader, dosDate);
    writeUint32(centralHeader, crc);
    writeUint32(centralHeader, data.length);
    writeUint32(centralHeader, data.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);
    centralDirectory.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralSize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
  const endRecord = [];
  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, files.length);
  writeUint16(endRecord, files.length);
  writeUint32(endRecord, centralSize);
  writeUint32(endRecord, offset);
  writeUint16(endRecord, 0);

  return new Blob([...chunks, ...centralDirectory, new Uint8Array(endRecord)], { type: "application/zip" });
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function normalizeImageUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
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
    ];

    removableParams.forEach((param) => parsed.searchParams.delete(param));

    return parsed.toString();
  } catch {
    return String(value || "").trim();
  }
}

function dedupeImageUrls(imageUrls) {
  const uniqueImages = [];
  const seen = new Set();

  for (const imageUrl of imageUrls) {
    const normalized = normalizeImageUrl(imageUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueImages.push(imageUrl);
  }

  return uniqueImages;
}

function App() {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [templates, setTemplates] = useState(loadTemplateLibrary);
  const [activeTemplateId, setActiveTemplateId] = useState(
    () => DEFAULT_TEMPLATES.find((template) => template.isDefault)?.id || DEFAULT_TEMPLATES[0].id
  );
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateFile, setNewTemplateFile] = useState(null);
  const [imageTransform, setImageTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragStart, setDragStart] = useState(null);
  const [status, setStatus] = useState("Ready to extract full-size vehicle images.");
  const [error, setError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  const canvasRef = useRef(null);
  const loadedImageRef = useRef(null);
  const templateOverlayRef = useRef(null);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) || templates[0],
    [activeTemplateId, templates]
  );

  const selectedImageIndex = useMemo(
    () => images.findIndex((imageUrl) => imageUrl === selectedImage),
    [images, selectedImage]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    } catch {
      setError("Template library is too large to persist in browser storage.");
    }
  }, [templates]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeTemplate) return;

    const ctx = canvas.getContext("2d");
    canvas.width = activeTemplate.width;
    canvas.height = activeTemplate.height;
    drawComposite(ctx, loadedImageRef.current, templateOverlayRef.current, activeTemplate, imageTransform);
  }, [activeTemplate, imageTransform]);

  useEffect(() => {
    if (!activeTemplate) return;

    let isCancelled = false;
    loadCanvasImage(activeTemplate.filePath)
      .then((overlay) => {
        if (isCancelled) return;
        templateOverlayRef.current = overlay;
        drawCanvas();
      })
      .catch(() => {
        if (isCancelled) return;
        templateOverlayRef.current = null;
        setError("Could not load the selected template overlay.");
        drawCanvas();
      });

    return () => {
      isCancelled = true;
    };
  }, [activeTemplate?.filePath, drawCanvas, activeTemplate]);

  useEffect(() => {
    if (!selectedImage) {
      loadedImageRef.current = null;
      drawCanvas();
      return;
    }

    let isCancelled = false;
    loadCanvasImage(getImageProxyUrl(selectedImage), true)
      .then((image) => {
        if (isCancelled) return;
        loadedImageRef.current = image;
        drawCanvas();
      })
      .catch(() => {
        if (isCancelled) return;
        loadedImageRef.current = null;
        setError("Could not load the selected image into the editor.");
        drawCanvas();
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedImage, drawCanvas]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const selectImage = (imageUrl) => {
    setSelectedImage(imageUrl);
    setImageTransform({ x: 0, y: 0, scale: 1 });
  };

  const moveImageSelection = (direction) => {
    if (!images.length) return;
    const currentIndex = selectedImageIndex >= 0 ? selectedImageIndex : 0;
    const nextIndex = clamp(currentIndex + direction, 0, images.length - 1);
    if (nextIndex === currentIndex && selectedImage) return;
    selectImage(images[nextIndex]);
  };

  const deleteImage = (imageUrlToDelete) => {
    setImages((currentImages) => {
      const nextImages = currentImages.filter((imageUrl) => imageUrl !== imageUrlToDelete);

      setSelectedImage((currentSelected) => {
        if (currentSelected !== imageUrlToDelete) return currentSelected;
        return nextImages[0] || "";
      });

      if (selectedImage === imageUrlToDelete) {
        setImageTransform({ x: 0, y: 0, scale: 1 });
      }

      setStatus(
        nextImages.length
          ? `Removed image. ${nextImages.length} image${nextImages.length === 1 ? "" : "s"} remaining.`
          : "All extracted images removed."
      );

      setError("");
      return nextImages;
    });
  };

  const extractImages = async () => {
    if (!url.trim()) {
      setError("Paste a Vansco vehicle page URL first.");
      return;
    }

    setIsExtracting(true);
    setError("");
    setStatus("Extracting full-size vehicle images...");

    try {
      const response = await fetch(`/api/extract?url=${encodeURIComponent(url.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image extraction failed.");

      const rawImages = Array.isArray(data.images) ? data.images : [];
      const extractedImages = dedupeImageUrls(rawImages);
      const duplicateCount = rawImages.length - extractedImages.length;

      setImages(extractedImages);
      setSelectedImage(extractedImages[0] || "");
      setImageTransform({ x: 0, y: 0, scale: 1 });

      if (!extractedImages.length) {
        setStatus("No images found on that page.");
      } else if (duplicateCount > 0) {
        setStatus(
          `Found ${extractedImages.length} unique full-size images. Removed ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}. Image 1 selected.`
        );
      } else {
        setStatus(`Found ${extractedImages.length} full-size images. Image 1 selected.`);
      }
    } catch (extractError) {
      setError(extractError.message || "Image extraction failed.");
      setStatus("Extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  };

  const downloadZip = () => {
    if (!images.length) return;
    const zipUrl = `/api/download-zip?urls=${encodeURIComponent(JSON.stringify(images))}`;
    window.open(zipUrl, "_blank", "noopener,noreferrer");
  };

  const replaceTemplateFile = async (templateId, file) => {
    if (!file) return;
    if (file.type && file.type !== "image/png") {
      setError("Template files must be PNG images.");
      return;
    }

    try {
      const dataUrl = await readTemplateFile(file);
      const templateName = templates.find((template) => template.id === templateId)?.name || "template";
      setTemplates((currentTemplates) =>
        currentTemplates.map((template) => {
          if (template.id !== templateId) return template;
          return {
            ...template,
            filePath: dataUrl,
            fileLabel: file.name,
            source: "browser-library",
          };
        })
      );
      setActiveTemplateId(templateId);
      setStatus(`Updated ${templateName} overlay to ${file.name}.`);
      setError("");
    } catch (readError) {
      setError(readError.message || "Could not read template file.");
    }
  };

  const addTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) {
      setError("Give the new template a name first.");
      return;
    }
    if (!newTemplateFile) {
      setError("Choose a PNG file for the new template.");
      return;
    }
    if (newTemplateFile.type && newTemplateFile.type !== "image/png") {
      setError("Template files must be PNG images.");
      return;
    }

    try {
      const dataUrl = await readTemplateFile(newTemplateFile);
      const newTemplate = {
        id: createTemplateId(name),
        name,
        category: "custom",
        filePath: dataUrl,
        fileLabel: newTemplateFile.name,
        width: EDITOR_CANVAS.width,
        height: EDITOR_CANVAS.height,
        isDefault: false,
        source: "browser-library",
      };

      setTemplates((currentTemplates) => [...currentTemplates, newTemplate]);
      setActiveTemplateId(newTemplate.id);
      setNewTemplateName("");
      setNewTemplateFile(null);
      setStatus(`Added ${newTemplate.name} template from ${newTemplate.fileLabel}.`);
      setError("");
    } catch (readError) {
      setError(readError.message || "Could not read template file.");
    }
  };

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * activeTemplate.width,
      y: ((event.clientY - rect.top) / rect.height) * activeTemplate.height,
    };
  };

  const handlePointerDown = (event) => {
    if (!selectedImage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ point: getCanvasPoint(event), transform: imageTransform });
  };

  const handlePointerMove = (event) => {
    if (!dragStart) return;
    const point = getCanvasPoint(event);
    setImageTransform({
      ...dragStart.transform,
      x: dragStart.transform.x + point.x - dragStart.point.x,
      y: dragStart.transform.y + point.y - dragStart.point.y,
    });
  };

  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  };

  const handleWheel = (event) => {
    if (!selectedImage) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    setImageTransform((current) => ({
      ...current,
      scale: clamp(Number((current.scale + delta).toFixed(2)), 0.5, 3),
    }));
  };

  const renderImageWithTemplate = async (imageUrl, transform = { x: 0, y: 0, scale: 1 }) => {
    const [vehicleImage, templateImage] = await Promise.all([
      loadCanvasImage(getImageProxyUrl(imageUrl), true),
      loadCanvasImage(activeTemplate.filePath),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = activeTemplate.width;
    canvas.height = activeTemplate.height;
    const ctx = canvas.getContext("2d");
    drawComposite(ctx, vehicleImage, templateImage, activeTemplate, transform);
    return canvasToPngBlob(canvas);
  };

  const exportImage = async () => {
    if (!selectedImage) return;

    setIsExporting(true);
    setError("");

    try {
      drawCanvas();
      const canvas = canvasRef.current;
      const blob = await canvasToPngBlob(canvas);
      const index = selectedImageIndex >= 0 ? selectedImageIndex : 0;
      downloadBlob(
        blob,
        getExportFilename({ pageUrl: url, imageUrl: selectedImage, template: activeTemplate, index })
      );
      setStatus(`Exported image ${index + 1} with ${activeTemplate.name}.`);
    } catch (exportError) {
      setError(exportError.message || "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportAllImages = async () => {
    if (!images.length) return;

    setIsExportingAll(true);
    setError("");
    setStatus(`Exporting ${images.length} images with ${activeTemplate.name}...`);

    try {
      const files = [];
      for (let index = 0; index < images.length; index += 1) {
        const imageUrl = images[index];
        const blob = await renderImageWithTemplate(imageUrl);
        files.push({
          name: getExportFilename({ pageUrl: url, imageUrl, template: activeTemplate, index }),
          blob,
        });
      }
      const zipBlob = await createZip(files);
      const zipName = `${getSourceSlug(url, images[0])}-${safeSlug(activeTemplate.name, "template")}-exports.zip`;
      downloadBlob(zipBlob, zipName);
      setStatus(`Exported ${files.length} composed images as a ZIP.`);
    } catch (exportError) {
      setError(exportError.message || "Export all failed. Please try again.");
    } finally {
      setIsExportingAll(false);
    }
  };

  const resetEditor = () => {
    setImageTransform({ x: 0, y: 0, scale: 1 });
  };

  return (
    <main className="suite-shell">
      <header className="suite-header">
        <div>
          <p className="eyebrow">Standalone tool</p>
          <h1>Vehicle Image Suite</h1>
          <p className="header-copy">
            Extract full-size Vansco images, package them, and compose template-ready vehicle artwork.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-pill">Local editor</span>
          <span className="status-pill muted">No CRM coupling</span>
          <a className="header-link-button" href="https://marketing-crm-six.vercel.app">
            Back to Marketing CRM
          </a>
        </div>
      </header>

      <section className="suite-grid">
        <div className="panel extractor-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Image extractor</p>
              <h2>Vansco source page</h2>
            </div>
            <span className="count-pill">{images.length} images</span>
          </div>

          <div className="input-row">
            <input
              className="url-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste Vansco vehicle page URL"
            />
            <button className="button primary" type="button" onClick={extractImages} disabled={isExtracting}>
              {isExtracting ? "Extracting" : "Extract Images"}
            </button>
            <button className="button ghost" type="button" onClick={downloadZip} disabled={!images.length}>
              Download ZIP
            </button>
          </div>

          <div className="feedback-row">
            <span>{status}</span>
            {error ? <strong>{error}</strong> : null}
          </div>

          <div className="image-grid" aria-label="Extracted vehicle images">
            {images.map((imageUrl, index) => (
              <div
                className={`image-card ${selectedImage === imageUrl ? "is-selected" : ""}`}
                key={`${normalizeImageUrl(imageUrl)}-${index}`}
              >
                <button
                  className="image-card-select"
                  type="button"
                  onClick={() => selectImage(imageUrl)}
                >
                  <img src={getImageProxyUrl(imageUrl)} alt={`Extracted vehicle ${index + 1}`} />
                  <span>Image {index + 1}</span>
                  {selectedImage === imageUrl ? <strong>Selected</strong> : null}
                </button>

                <button
                  className="image-card-delete"
                  type="button"
                  onClick={() => deleteImage(imageUrl)}
                  aria-label={`Delete image ${index + 1}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Template editor</p>
              <h2>Compose export image</h2>
            </div>
            <span className="count-pill">
              {activeTemplate.width} x {activeTemplate.height}
            </span>
          </div>

          <div className="editor-layout">
            <aside className="editor-sidebar">
              <div className="template-list">
                {templates.map((template) => (
                  <div
                    className={`template-card ${activeTemplateId === template.id ? "is-active" : ""}`}
                    key={template.id}
                  >
                    <button className="template-select" type="button" onClick={() => setActiveTemplateId(template.id)}>
                      <span>{template.name}</span>
                      <small>
                        {template.category} | {template.width} x {template.height}
                      </small>
                    </button>
                    <div className="template-file-row">
                      <code>{template.fileLabel || template.filePath}</code>
                      <label className="file-button">
                        Replace PNG
                        <input
                          type="file"
                          accept="image/png"
                          onChange={(event) => {
                            replaceTemplateFile(template.id, event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="active-template-file">
                <span>Active file</span>
                <code>{activeTemplate.fileLabel || activeTemplate.filePath}</code>
              </div>

              <div className="control-stack">
                <div className="image-nav-row">
                  <button
                    className="button subtle"
                    type="button"
                    onClick={() => moveImageSelection(-1)}
                    disabled={!images.length || selectedImageIndex <= 0}
                  >
                    Previous Image
                  </button>
                  <span>{images.length ? `${selectedImageIndex + 1} / ${images.length}` : "0 / 0"}</span>
                  <button
                    className="button subtle"
                    type="button"
                    onClick={() => moveImageSelection(1)}
                    disabled={!images.length || selectedImageIndex >= images.length - 1}
                  >
                    Next Image
                  </button>
                </div>
                <label className="range-row">
                  <span>Image zoom</span>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.01"
                    value={imageTransform.scale}
                    onChange={(event) => {
                      setImageTransform((current) => ({ ...current, scale: Number(event.target.value) }));
                    }}
                    disabled={!selectedImage}
                  />
                </label>
                <button className="button subtle" type="button" onClick={resetEditor} disabled={!selectedImage}>
                  Reset image
                </button>
                <button
                  className="button primary full"
                  type="button"
                  onClick={exportImage}
                  disabled={!selectedImage || isExporting || isExportingAll}
                >
                  {isExporting ? "Exporting" : "Export PNG"}
                </button>
                <button
                  className="button ghost full"
                  type="button"
                  onClick={exportAllImages}
                  disabled={!images.length || isExporting || isExportingAll}
                >
                  {isExportingAll ? "Exporting All" : "Export All Images"}
                </button>
              </div>
            </aside>

            <div className="canvas-stage">
              <div className="canvas-frame">
                <canvas
                  ref={canvasRef}
                  className="template-canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onWheel={handleWheel}
                  aria-label="Template editor canvas"
                />
              </div>
              <p className="canvas-note">
                Vehicle image moves behind the locked PNG template. Export remains fixed at 960 x 720.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="panel template-library-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Template Library</p>
            <h2>Reusable template assets</h2>
          </div>
          <span className="count-pill">{templates.length} templates</span>
        </div>

        <div className="library-tools">
          <input
            className="template-name-input"
            value={newTemplateName}
            onChange={(event) => setNewTemplateName(event.target.value)}
            placeholder="New template name"
          />
          <label className="file-button wide">
            {newTemplateFile ? newTemplateFile.name : "Choose PNG"}
            <input
              type="file"
              accept="image/png"
              onChange={(event) => setNewTemplateFile(event.target.files?.[0] || null)}
            />
          </label>
          <button className="button primary" type="button" onClick={addTemplate}>
            Add Template
          </button>
        </div>

        <div className="template-library-grid">
          {templates.map((template) => (
            <button
              className={`library-template-card ${activeTemplateId === template.id ? "is-active" : ""}`}
              key={template.id}
              type="button"
              onClick={() => setActiveTemplateId(template.id)}
            >
              <img src={template.filePath} alt={`${template.name} template preview`} />
              <span>{template.name}</span>
              <small>{template.fileLabel || template.filePath}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
