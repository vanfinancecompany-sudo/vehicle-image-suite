import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "@fontsource/anton/latin-400.css";
import "@fontsource/arimo/latin-700.css";
import "@fontsource/noto-sans/latin-900.css";
import "@fontsource/roboto/latin-900.css";
import "@fontsource/league-spartan/latin-800.css";
import "@fontsource/league-spartan/latin-900.css";
import "@fontsource/archivo-black/latin-400.css";
import SalesCampaignPanel, { DynamicPriceControls } from "./campaign/SalesCampaignPanel.jsx";
import VehicleThumbnail from "./campaign/VehicleThumbnail.jsx";
import useCampaign from "./campaign/useCampaign.js";
import { campaignFilename, DEFAULT_TRANSFORM, nextUnfinished } from "./campaign/campaignModel.js";
import { isUpload, readImage, storeImage, removeStoredImage } from "./campaign/campaignStorage.js";
import { drawPrices, ensurePriceFont } from "./campaign/priceRenderer.js";

const CONTROL_CENTRE_URL =
  import.meta.env.VITE_CONTROL_CENTRE_URL ||
  "https://control-centre-navy.vercel.app";

const HIDDEN_TEMPLATE_KEY = "vehicle-image-suite-hidden-template-ids";

function hiddenTemplateIds() {
  try { const ids = JSON.parse(localStorage.getItem(HIDDEN_TEMPLATE_KEY) || "[]"); return Array.isArray(ids) ? ids : []; }
  catch { return []; }
}
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

const canvasImageCache = new Map();
function cachedCanvasImage(key, loader) {
  if (canvasImageCache.has(key)) return canvasImageCache.get(key);
  const pending = loader().catch(error => {
    if (canvasImageCache.get(key) === pending) canvasImageCache.delete(key);
    throw error;
  });
  canvasImageCache.set(key, pending);
  // Bound decoded-image memory for large campaigns while keeping drag/zoom responsive.
  while (canvasImageCache.size > 8) canvasImageCache.delete(canvasImageCache.keys().next().value);
  return pending;
}

function loadVehicleImage(reference) {
  return cachedCanvasImage("vehicle:" + reference, () => readVehicleImage(reference));
}

async function readVehicleImage(reference) {
  if (!isUpload(reference)) return loadCanvasImage(`/api/image?url=${encodeURIComponent(reference)}`, true);
  const blob = await readImage(reference);
  if (!blob) throw new Error("Stored image is missing. Upload it again to continue.");
  const objectUrl = URL.createObjectURL(blob);
  try { return await loadCanvasImage(objectUrl); }
  finally { URL.revokeObjectURL(objectUrl); }
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
    if (!Array.isArray(stored)) return DEFAULT_TEMPLATES.filter(template => !hiddenTemplateIds().includes(template.id));

    const storedById = new Map(stored.map((template) => [template.id, template]));
    const defaultTemplates = DEFAULT_TEMPLATES.map((template) =>
      normalizeTemplate({ ...template, ...(storedById.get(template.id) || {}) })
    );
    const customTemplates = stored
      .filter((template) => !DEFAULT_TEMPLATES.some((defaultTemplate) => defaultTemplate.id === template.id))
      .map(normalizeTemplate);

    return [...defaultTemplates, ...customTemplates].filter(template => !hiddenTemplateIds().includes(template.id));
  } catch {
    return DEFAULT_TEMPLATES.filter(template => !hiddenTemplateIds().includes(template.id));
  }
}

function loadCanvasImage(src, useCrossOrigin = false) {
  return cachedCanvasImage(src, () => readCanvasImage(src, useCrossOrigin));
}

function readCanvasImage(src, useCrossOrigin = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (useCrossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function drawComposite(ctx, vehicleImage, templateImage, template, transform, job, priceLayout) {
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
  if (job) drawPrices(ctx, job, priceLayout);
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
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function normalizeImageUrl(value) {
  return String(value || "").trim().toLowerCase();
}

function App() {
  const { campaign, updateCampaign, storageError } = useCampaign();
  const activeJob = campaign.enabled ? campaign.jobs.find(job => job.id === campaign.activeJobId) : null;
  const activeJobId = activeJob?.id;
  const [url, setUrl] = useState("");
  const [normalImages, setNormalImages] = useState([]);
  const [normalSelectedImage, setNormalSelectedImage] = useState("");
  const [normalTransform, setNormalTransform] = useState({ ...DEFAULT_TRANSFORM });
  const [templates, setTemplates] = useState(loadTemplateLibrary);
  const [normalTemplateId, setNormalTemplateId] = useState(() => loadTemplateLibrary()[0]?.id || "");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateFile, setNewTemplateFile] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [status, setStatus] = useState("Ready to extract full-size vehicle images.");
  const [error, setError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const busy = isExtracting || isExporting || isExportingAll || isUploading;
  const canvasRef = useRef(null);
  const drawSequence = useRef(0);

  const onJobChange = useCallback(patch => updateCampaign(current => ({
    ...current, jobs: current.jobs.map(job => job.id === activeJobId ? { ...job, ...patch } : job),
  })), [activeJobId, updateCampaign]);

  const images = activeJob ? activeJob.images : normalImages;
  const selectedImage = activeJob ? activeJob.selectedImage : normalSelectedImage;
  const imageTransform = activeJob ? activeJob.transform : normalTransform;
  const activeTemplateId = activeJob ? campaign.templateId : normalTemplateId;
  const activeTemplate = useMemo(() => activeJob
    ? templates.find(template => template.id === campaign.templateId)
    : templates.find(template => template.id === normalTemplateId) || templates[0],
    [activeJob, campaign.templateId, normalTemplateId, templates]);

  const setImageTransform = updater => {
    if (activeJob) {
      const transform = typeof updater === "function" ? updater(activeJob.transform) : updater;
      onJobChange({ transform });
    } else setNormalTransform(updater);
  };
  const chooseTemplate = id => {
    if (activeJob) updateCampaign(current => ({ ...current, templateId: id }));
    else setNormalTemplateId(id);
  };
  const selectJob = id => {
    setDragStart(null);
    if (updateCampaign(current => ({ ...current, enabled: true, activeJobId: id }))) {
      setError("");
      setStatus("Campaign vehicle selected. Choose its photo and campaign overlay.");
    }
  };
  const exitCampaign = () => {
    setDragStart(null);
    updateCampaign(current => ({ ...current, enabled: false }));
  };
  const selectedImageIndex = useMemo(
    () => images.findIndex((imageUrl) => imageUrl === selectedImage),
    [images, selectedImage]
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    }).catch(() => setError("Template library is too large to persist in browser storage."));
  }, [templates]);

  const drawCanvas = useCallback(async () => {
    const sequence = ++drawSequence.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = EDITOR_CANVAS.width;
    canvas.height = EDITOR_CANVAS.height;
    if (!activeTemplate) return;
    // Load all inputs together; never paint or export a previous registration's photo.
    try {
      const [image, overlay] = await Promise.all([
        selectedImage ? loadVehicleImage(selectedImage) : Promise.resolve(null),
        loadCanvasImage(activeTemplate.filePath),
        activeJob ? ensurePriceFont(campaign.priceLayout) : Promise.resolve(),
      ]);
      if (sequence !== drawSequence.current) return;
      drawComposite(canvas.getContext("2d"), image, overlay, activeTemplate, imageTransform,
        activeJob, campaign.priceLayout);
    } catch (drawError) {
      if (sequence === drawSequence.current) setError(drawError.message);
    }
  }, [activeTemplate, selectedImage, imageTransform, activeJob, campaign.priceLayout]);

  useEffect(() => {
    drawCanvas();
    return () => { drawSequence.current += 1; };
  }, [drawCanvas]);

  const selectImage = imageUrl => {
    if (busy) return;
    if (activeJob) onJobChange({ selectedImage: imageUrl, transform: { ...DEFAULT_TRANSFORM } });
    else {
      setNormalSelectedImage(imageUrl);
      setNormalTransform({ ...DEFAULT_TRANSFORM });
    }
  };

  const moveImageSelection = (direction) => {
    if (!images.length) return;
    const currentIndex = selectedImageIndex >= 0 ? selectedImageIndex : 0;
    const nextIndex = clamp(currentIndex + direction, 0, images.length - 1);
    if (nextIndex === currentIndex && selectedImage) return;
    selectImage(images[nextIndex]);
  };

  const deleteImage = imageUrlToDelete => {
    if (busy) return;
    const nextImages = images.filter(image => image !== imageUrlToDelete);
    const nextSelected = selectedImage === imageUrlToDelete ? nextImages[0] || "" : selectedImage;
    const transform = selectedImage === imageUrlToDelete ? { ...DEFAULT_TRANSFORM } : imageTransform;
    if (activeJob) {
      if (onJobChange({ images: nextImages, selectedImage: nextSelected, transform }) && isUpload(imageUrlToDelete)) {
        removeStoredImage(imageUrlToDelete).catch(error => setError(error.message));
      }
    } else {
      setNormalImages(nextImages);
      setNormalSelectedImage(nextSelected);
      setNormalTransform(transform);
    }
    setStatus(nextImages.length + " images remaining.");
  };

  const extractImages = async (sourceUrl = url) => {
    if (busy) return;
    if (!sourceUrl.trim()) {
      setError("Paste a Vansco vehicle page URL first.");
      return;
    }

    setIsExtracting(true);
    setError("");
    setStatus("Extracting full-size vehicle images...");

    try {
      const response = await fetch(`/api/extract?url=${encodeURIComponent(sourceUrl.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image extraction failed.");

      const extractedImages = Array.isArray(data.images) ? data.images : [];
      if (activeJob) onJobChange({ images: [...extractedImages, ...activeJob.images.filter(isUpload)], selectedImage: extractedImages[0] || "", transform: { ...DEFAULT_TRANSFORM } });
      else {
        setNormalImages(extractedImages);
        setNormalSelectedImage(extractedImages[0] || "");
        setNormalTransform({ ...DEFAULT_TRANSFORM });
      }
      setStatus(
        extractedImages.length
          ? `Found ${extractedImages.length} full-size images. Image 1 selected.`
          : "No images found on that page."
      );
    } catch (extractError) {
      setError(extractError.message || "Image extraction failed.");
      setStatus("Extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  };

  const loadDealerKitImages = async () => {
    if (!activeJob || busy) return;
    setIsExtracting(true);
    setError("");
    setStatus("Loading DealerKit images for " + activeJob.registration + "…");
    try {
      const response = await fetch("/api/dealerkit-images?registration=" + encodeURIComponent(activeJob.registration));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "DealerKit images could not be loaded.");
      const registration = activeJob.registration.toUpperCase().replace(/[\s-]/g, "");
      if (!data.ok || data.registration !== registration || !data.images?.length) {
        throw new Error("No exact DealerKit vehicle/image result. Use Upload Image or Load Images From URL.");
      }
      const gallery = data.images.map(image => image.url);
      const oldGallery = activeJob.images.filter(image => !isUpload(image));
      const sameGallery = JSON.stringify(oldGallery) === JSON.stringify(gallery);
      const selectedImage = gallery.includes(activeJob.selectedImage) || isUpload(activeJob.selectedImage)
        ? activeJob.selectedImage : gallery[0];
      if (onJobChange({
        images: [...gallery, ...activeJob.images.filter(isUpload)], selectedImage,
        transform: sameGallery || selectedImage === activeJob.selectedImage ? activeJob.transform : { ...DEFAULT_TRANSFORM },
      })) setStatus(gallery.length + " DealerKit images loaded for " + activeJob.registration + ".");
    } catch (error) {
      setError(error.message);
      setStatus("Existing photos kept. Upload Image and Load Images From URL remain available.");
    } finally { setIsExtracting(false); }
  };

  const downloadZip = () => {
    const remoteImages = images.filter(reference => !isUpload(reference));
    if (!remoteImages.length) return;
    const zipUrl = `/api/download-zip?urls=${encodeURIComponent(JSON.stringify(remoteImages))}`;
    window.open(zipUrl, "_blank", "noopener,noreferrer");
  };

  const replaceTemplateFile = async (templateId, file) => {
    if (!file || busy) return;
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
      chooseTemplate(templateId);
      setStatus(`Updated ${templateName} overlay to ${file.name}.`);
      setError("");
    } catch (readError) {
      setError(readError.message || "Could not read template file.");
    }
  };

  const addTemplate = async () => {
    if (busy) return;
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
      chooseTemplate(newTemplate.id);
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
    if (!selectedImage || !activeTemplate || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ point: getCanvasPoint(event), transform: imageTransform });
  };

  const handlePointerMove = (event) => {
    if (!dragStart || !activeTemplate || busy) return;
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
    if (!selectedImage || busy) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    setImageTransform((current) => ({
      ...current,
      scale: clamp(Number((current.scale + delta).toFixed(2)), 0.5, 3),
    }));
  };

  const renderImageWithTemplate = async (imageUrl, transform = { ...DEFAULT_TRANSFORM }) => {
    if (!activeTemplate) throw new Error("Choose a template before exporting.");
    const [vehicleImage, templateImage] = await Promise.all([
      loadVehicleImage(imageUrl),
      loadCanvasImage(activeTemplate.filePath),
      activeJob ? ensurePriceFont(campaign.priceLayout) : Promise.resolve(),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = activeTemplate.width;
    canvas.height = activeTemplate.height;
    drawComposite(canvas.getContext("2d"), vehicleImage, templateImage, activeTemplate, transform,
      activeJob, campaign.priceLayout);
    return canvasToPngBlob(canvas);
  };

  const exportImage = async (markDone = false) => {
    if (!selectedImage || !activeTemplate || busy) return;
    setIsExporting(true);
    setError("");
    try {
      if (activeJob && (!activeJob.wasPrice || !activeJob.nowPrice || !activeJob.savePrice)) {
        throw new Error("Enter valid WAS, NOW and SAVE values before exporting.");
      }
      const index = selectedImageIndex >= 0 ? selectedImageIndex : 0;
      const filename = activeJob ? campaignFilename(activeJob)
        : getExportFilename({ pageUrl: url, imageUrl: selectedImage, template: activeTemplate, index });
      const blob = await renderImageWithTemplate(selectedImage, imageTransform);
      downloadBlob(blob, filename);
      if (activeJob && markDone) {
        updateCampaign(current => {
          const jobs = current.jobs.map(job => job.id === activeJob.id ? { ...job, done: true } : job);
          return { ...current, jobs, activeJobId: nextUnfinished(jobs, activeJob.id) };
        });
      }
      setStatus("Download started: " + filename + ". Check your browser downloads.");
    } catch (exportError) {
      setError(exportError.message || "Export failed. Please try again.");
    } finally { setIsExporting(false); }
  };

  const uploadCampaignImage = async file => {
    if (!file || !activeJob || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP vehicle photo."); return;
    }
    setIsUploading(true);
    setError("");
    try {
      const reference = await storeImage(file);
      try {
        await loadVehicleImage(reference);
        if (!onJobChange({ images: [...activeJob.images, reference], selectedImage: reference,
          transform: { ...DEFAULT_TRANSFORM } })) {
          await removeStoredImage(reference);
        }
      } catch (error) {
        await removeStoredImage(reference);
        throw error;
      }
    } catch (error) { setError(error.message); }
    finally { setIsUploading(false); }
  };

  const removeTemplate = templateId => {
    if (busy) return;
    const template = templates.find(item => item.id === templateId);
    if (!window.confirm("Remove " + template.name + "? This will stay removed after refresh.")) return;
    const remaining = templates.filter(item => item.id !== templateId);
    try {
      // Persist before changing the UI; defaults are tombstoned, custom entries deleted.
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(remaining));
      if (DEFAULT_TEMPLATES.some(item => item.id === templateId)) {
        localStorage.setItem(HIDDEN_TEMPLATE_KEY, JSON.stringify([...new Set([...hiddenTemplateIds(), templateId])]));
      }
      setTemplates(remaining);
      if (normalTemplateId === templateId) setNormalTemplateId(remaining[0]?.id || "");
      if (campaign.templateId === templateId) {
        updateCampaign(current => ({ ...current, templateId: remaining[0]?.id || "" }));
      }
    } catch { setError("Template removal could not be saved. Free browser storage and try again."); }
  };

  const restoreDefaults = () => {
    try {
      localStorage.removeItem(HIDDEN_TEMPLATE_KEY);
      const restored = [...templates];
      for (const template of DEFAULT_TEMPLATES) {
        if (!restored.some(item => item.id === template.id)) restored.push(template);
      }
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(restored));
      setTemplates(restored);
      if (!normalTemplateId) setNormalTemplateId(restored[0]?.id || "");
      if (campaign.enabled && !campaign.templateId) {
        updateCampaign(current => ({ ...current, templateId: restored[0]?.id || "" }));
      }
    } catch { setError("Default templates could not be restored."); }
  };

  const exportAllImages = async () => {
    if (!images.length || !activeTemplate || busy) return;

    setIsExportingAll(true);
    setError("");
    setStatus(`Exporting ${images.length} images with ${activeTemplate.name}...`);

    try {
      const files = [];
      for (let index = 0; index < images.length; index += 1) {
        const imageUrl = images[index];
        const blob = await renderImageWithTemplate(imageUrl);
        files.push({
          name: activeJob ? `alternative-${String(index + 1).padStart(2, "0")}/${campaignFilename(activeJob)}`
            : getExportFilename({ pageUrl: url, imageUrl, template: activeTemplate, index }),
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
          <a className="header-link-button" href={CONTROL_CENTRE_URL}>
            Control Centre
          </a>
        </div>
      </header>

      <section className="suite-grid">
        <div className="suite-left-column">
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
            <button className="button primary" type="button" onClick={() => extractImages()} disabled={busy}>
              {isExtracting ? "Extracting" : "Extract Images"}
            </button>
            <button className="button ghost" type="button" onClick={downloadZip} disabled={!images.some(reference => !isUpload(reference)) || busy}>
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
                  aria-label={`Image ${index + 1}${selectedImage === imageUrl ? " Selected" : ""}`}
                  type="button"
                  onClick={() => selectImage(imageUrl)}
                >
                  <VehicleThumbnail reference={imageUrl} alt={`Extracted vehicle ${index + 1}`} />
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

        <SalesCampaignPanel campaign={campaign} updateCampaign={updateCampaign} storageError={storageError}
          templates={templates} activeJob={activeJob} onSelect={selectJob} onExit={exitCampaign}
          onLoadImages={() => extractImages(activeJob.vehicleUrl)} onDealerKitImages={loadDealerKitImages} onUploadImage={uploadCampaignImage}
          onJobChange={onJobChange} busy={busy} onError={setError} onStatus={setStatus} />
        </div>
        <div className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Template editor</p>
              <h2>Compose export image</h2>
            </div>
            <span className="count-pill">
              {EDITOR_CANVAS.width} x {EDITOR_CANVAS.height}
            </span>
          </div>

          <fieldset className="editor-layout editor-fieldset" disabled={busy}>
            <aside className="editor-sidebar">
              <div className="template-list">
                {templates.map((template) => (
                  <div
                    className={`template-card ${activeTemplateId === template.id ? "is-active" : ""}`}
                    key={template.id}
                  >
                    <button className="template-select" type="button" onClick={() => chooseTemplate(template.id)}>
                      <span>{template.name}</span>
                      <small>
                        {template.category} | {template.width} x {template.height}
                      </small>
                    </button>
                    <button className="button ghost" type="button" onClick={() => removeTemplate(template.id)}>Remove {template.name}</button>
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

              {!templates.length && <p>No templates remain. Add a PNG below or restore defaults.</p>}
              {activeJob && !activeTemplate && <p>Choose a campaign template in the left panel.</p>}
              <button className="button ghost" type="button" onClick={restoreDefaults}>Restore Default Templates</button>
              <div className="active-template-file">
                <span>Active file</span>
                <code>{activeTemplate ? activeTemplate.fileLabel || activeTemplate.filePath : "Choose or add a template to begin."}</code>
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
                {activeJob && <DynamicPriceControls job={activeJob} onChange={onJobChange} disabled={busy} />}
                <button
                  className="button primary full"
                  type="button"
                  onClick={() => exportImage(Boolean(activeJob))}
                  disabled={!selectedImage || !activeTemplate || busy}
                >
                  {isExporting ? "Exporting" : activeJob ? "SAVE PNG & MARK DONE" : "Export PNG"}
                </button>
                {activeJob && <button className="button ghost full" type="button"
                  disabled={!selectedImage || !activeTemplate || busy} onClick={() => exportImage(false)}>Export PNG Only</button>}
                <button
                  className="button ghost full"
                  type="button"
                  onClick={exportAllImages}
                  disabled={!images.length || !activeTemplate || busy}
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
          </fieldset>
        </div>
      </section>

      <section className="panel template-library-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Template Library</p>
            <h2>Reusable template assets</h2>
          </div>
          <span className="count-pill">{templates.length} templates</span>
          <button className="button ghost" type="button" disabled={busy} onClick={restoreDefaults}>Restore Default Templates</button>
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
          <button className="button primary" type="button" onClick={addTemplate} disabled={busy}>
            Add Template
          </button>
        </div>

        <div className="template-library-grid">
          {templates.map((template) => (
            <div key={template.id} className="library-template-wrapper">
            <button
              disabled={busy}
              className={`library-template-card ${activeTemplateId === template.id ? "is-active" : ""}`}
              key={template.id}
              type="button"
              onClick={() => chooseTemplate(template.id)}
            >
              <img src={template.filePath} alt={`${template.name} template preview`} />
              <span>{template.name}</span>
              <small>{template.fileLabel || template.filePath}</small>
            </button>
            <button className="button ghost" type="button" disabled={busy} onClick={() => removeTemplate(template.id)}>Remove {template.name}</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
