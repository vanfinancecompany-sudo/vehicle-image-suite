import { useCallback, useEffect, useRef, useState } from "react";
import { removeBackground } from "@imgly/background-removal";
import showroomTemplate from "../assets/background-studio/showroom-template.png";
import vanFinanceLogo from "../assets/background-studio/van-finance-logo.png";

const CONTROL_CENTRE_URL =
  import.meta.env.VITE_CONTROL_CENTRE_URL ||
  "https://control-centre-navy.vercel.app";

const CANVAS_SIZE = {
  width: 960,
  height: 720,
};

const DEFAULTS = {
  vanZoom: 1,
  vanX: 480,
  vanY: 470,
  logoZoom: 0.35,
  logoX: 110,
  logoY: 142,
  logoRotation: 0,
  logoSkewX: 0,
  logoSkewY: 0,
  logoOpacity: 1,
  logoVisible: true,
  shadowOn: true,
  shadowStrength: 0.35,
  shadowBlur: 24,
  shadowWidth: 520,
  shadowHeight: 52,
  shadowX: 0,
  shadowY: 10,
};

function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = source;
  });
}

function drawCoverImage(context, image, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const left = (width - drawWidth) / 2;
  const top = (height - drawHeight) / 2;
  context.drawImage(image, left, top, drawWidth, drawHeight);
}

function formatValue(value) {
  return Number.isInteger(value) ? value : value.toFixed(2);
}

function getCanvasPoint(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * CANVAS_SIZE.width,
    y: ((event.clientY - bounds.top) / bounds.height) * CANVAS_SIZE.height,
  };
}

function pointInBounds(point, bounds) {
  if (!bounds) return false;
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function getTransformedLogoCorners(width, height, settings) {
  const skewX = Math.tan((settings.logoSkewX * Math.PI) / 180);
  const skewY = Math.tan((settings.logoSkewY * Math.PI) / 180);
  const rotation = (settings.logoRotation * Math.PI) / 180;
  const centerX = settings.logoX + width / 2;
  const centerY = settings.logoY + height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  return corners.map((corner) => {
    const skewedX = corner.x + skewX * corner.y;
    const skewedY = corner.y + skewY * corner.x;
    return {
      x: centerX + skewedX * cos - skewedY * sin,
      y: centerY + skewedX * sin + skewedY * cos,
    };
  });
}

function getPolygonBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function drawSelectionOutline(context, corners, label) {
  if (!corners?.length) return;

  context.save();
  context.strokeStyle = "rgba(248, 250, 252, 0.92)";
  context.lineWidth = 2;
  context.setLineDash([10, 8]);
  context.beginPath();
  corners.forEach((corner, index) => {
    if (index === 0) {
      context.moveTo(corner.x, corner.y);
    } else {
      context.lineTo(corner.x, corner.y);
    }
  });
  context.closePath();
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "rgba(239, 68, 68, 0.92)";
  corners.forEach((corner) => {
    context.beginPath();
    context.arc(corner.x, corner.y, 6, 0, Math.PI * 2);
    context.fill();
  });
  context.font = "800 13px Arial, sans-serif";
  context.fillStyle = "rgba(15, 23, 42, 0.88)";
  const bounds = getPolygonBounds(corners);
  context.fillRect(bounds.left, bounds.top - 24, Math.max(54, label.length * 8), 20);
  context.fillStyle = "#ffffff";
  context.fillText(label, bounds.left + 8, bounds.top - 9);
  context.restore();
}

function StudioSlider({ label, min, max, step = 1, value, onChange }) {
  return (
    <label className="studio-slider">
      <span>
        {label}
        <strong>{formatValue(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StudioSection({ kicker, title, children }) {
  return (
    <section className="studio-control-section">
      <div className="studio-section-heading">
        <span>{kicker}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function BackgroundStudio() {
  const canvasRef = useRef(null);
  const templateRef = useRef(null);
  const logoRef = useRef(null);
  const vanRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const layerMetricsRef = useRef({ van: null, logo: null });
  const dragStateRef = useRef(null);

  const [originalVanFile, setOriginalVanFile] = useState(null);
  const [originalVanUrl, setOriginalVanUrl] = useState("");
  const [vanUrl, setVanUrl] = useState("");
  const [templateUrl, setTemplateUrl] = useState(showroomTemplate);
  const [logoUrl, setLogoUrl] = useState(vanFinanceLogo);
  const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready for a dealership-grade 960 x 720 export.");
  const [errorMessage, setErrorMessage] = useState("");
  const [settings, setSettings] = useState(DEFAULTS);
  const [selectedLayer, setSelectedLayer] = useState("van");
  const [renderTick, setRenderTick] = useState(0);

  const revokeObjectUrl = useCallback((url) => {
    if (objectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    }
  }, []);

  const createObjectUrl = useCallback((file) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const queueDraw = useCallback(() => {
    setRenderTick((current) => current + 1);
  }, []);

  const drawCanvas = useCallback((showSelection = true) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || !templateRef.current) {
      return;
    }

    canvas.width = CANVAS_SIZE.width;
    canvas.height = CANVAS_SIZE.height;
    context.clearRect(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);
    layerMetricsRef.current = { van: null, logo: null };
    drawCoverImage(context, templateRef.current, CANVAS_SIZE.width, CANVAS_SIZE.height);

    const logoImage = logoRef.current;
    if (settings.logoVisible && logoImage) {
      const logoWidth = logoImage.naturalWidth * settings.logoZoom;
      const logoHeight = logoImage.naturalHeight * settings.logoZoom;
      const logoCenterX = settings.logoX + logoWidth / 2;
      const logoCenterY = settings.logoY + logoHeight / 2;
      const logoCorners = getTransformedLogoCorners(logoWidth, logoHeight, settings);
      layerMetricsRef.current.logo = {
        bounds: getPolygonBounds(logoCorners),
        corners: logoCorners,
      };

      context.save();
      context.globalAlpha = settings.logoOpacity;
      context.translate(logoCenterX, logoCenterY);
      context.rotate((settings.logoRotation * Math.PI) / 180);
      context.transform(
        1,
        Math.tan((settings.logoSkewY * Math.PI) / 180),
        Math.tan((settings.logoSkewX * Math.PI) / 180),
        1,
        0,
        0
      );
      context.drawImage(logoImage, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
      context.restore();
    }

    const vanImage = vanRef.current;
    if (!vanImage) {
      context.save();
      context.fillStyle = "rgba(2, 6, 23, 0.58)";
      context.strokeStyle = "rgba(255, 255, 255, 0.16)";
      context.lineWidth = 2;
      context.roundRect(260, 478, 440, 78, 22);
      context.fill();
      context.stroke();
      context.fillStyle = "#f8fafc";
      context.font = "800 24px Arial, sans-serif";
      context.textAlign = "center";
      context.fillText("Upload a van image to begin", CANVAS_SIZE.width / 2, 528);
      context.restore();
      return;
    }

    const fitScale = Math.min(720 / vanImage.naturalWidth, 430 / vanImage.naturalHeight);
    const vanWidth = vanImage.naturalWidth * fitScale * settings.vanZoom;
    const vanHeight = vanImage.naturalHeight * fitScale * settings.vanZoom;
    const vanLeft = settings.vanX - vanWidth / 2;
    const vanTop = settings.vanY - vanHeight / 2;
    const vanCorners = [
      { x: vanLeft, y: vanTop },
      { x: vanLeft + vanWidth, y: vanTop },
      { x: vanLeft + vanWidth, y: vanTop + vanHeight },
      { x: vanLeft, y: vanTop + vanHeight },
    ];
    layerMetricsRef.current.van = {
      bounds: {
        left: vanLeft,
        right: vanLeft + vanWidth,
        top: vanTop,
        bottom: vanTop + vanHeight,
      },
      corners: vanCorners,
    };

    if (settings.shadowOn) {
      const tyreLine = vanTop + vanHeight * 0.92;
      const shadowCenterX = settings.vanX + settings.shadowX;
      const shadowCenterY = tyreLine + settings.shadowY;

      context.save();
      context.globalAlpha = settings.shadowStrength;
      context.fillStyle = "#000000";
      context.filter = `blur(${settings.shadowBlur}px)`;
      context.beginPath();
      context.ellipse(
        shadowCenterX,
        shadowCenterY,
        settings.shadowWidth / 2,
        settings.shadowHeight / 2,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();

      context.save();
      context.globalAlpha = Math.min(0.78, settings.shadowStrength + 0.2);
      context.fillStyle = "#000000";
      context.filter = "blur(7px)";
      [-0.28, 0.28].forEach((offset) => {
        context.beginPath();
        context.ellipse(
          settings.vanX + vanWidth * offset + settings.shadowX * 0.35,
          tyreLine + settings.shadowY * 0.55,
          Math.max(28, vanWidth * 0.085),
          Math.max(8, vanHeight * 0.025),
          0,
          0,
          Math.PI * 2
        );
        context.fill();
      });
      context.restore();
    }

    context.drawImage(vanImage, vanLeft, vanTop, vanWidth, vanHeight);

    if (showSelection && selectedLayer === "logo" && layerMetricsRef.current.logo) {
      drawSelectionOutline(context, layerMetricsRef.current.logo.corners, "Logo");
    }

    if (showSelection && selectedLayer === "van" && layerMetricsRef.current.van) {
      drawSelectionOutline(context, layerMetricsRef.current.van.corners, "Van");
    }
  }, [selectedLayer, settings]);

  useEffect(() => {
    let isMounted = true;

    loadCanvasImage(templateUrl)
      .then((image) => {
        if (!isMounted) return;
        templateRef.current = image;
        queueDraw();
      })
      .catch(() => {
        if (!isMounted) return;
        setErrorMessage("Could not load this template. The current template is still available.");
      });

    return () => {
      isMounted = false;
    };
  }, [queueDraw, templateUrl]);

  useEffect(() => {
    if (!logoUrl) {
      logoRef.current = null;
      drawCanvas();
      return;
    }

    let isMounted = true;
    loadCanvasImage(logoUrl)
      .then((image) => {
        if (!isMounted) return;
        logoRef.current = image;
        queueDraw();
      })
      .catch(() => {
        if (!isMounted) return;
        logoRef.current = null;
        setErrorMessage("Could not load this logo. The logo layer has been hidden.");
        updateSetting("logoVisible", false);
        queueDraw();
      });

    return () => {
      isMounted = false;
    };
  }, [drawCanvas, logoUrl, queueDraw, updateSetting]);

  useEffect(() => {
    if (!vanUrl) {
      vanRef.current = null;
      drawCanvas();
      return;
    }

    let isMounted = true;
    loadCanvasImage(vanUrl)
      .then((image) => {
        if (!isMounted) return;
        vanRef.current = image;
        setErrorMessage("");
        queueDraw();
      })
      .catch(() => {
        if (!isMounted) return;
        vanRef.current = null;
        setErrorMessage("Could not load this van image.");
        queueDraw();
      });

    return () => {
      isMounted = false;
    };
  }, [drawCanvas, queueDraw, vanUrl]);

  useEffect(() => {
    drawCanvas(false);
  }, [drawCanvas, renderTick]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  const handleVanUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload a van image file.");
      return;
    }

    revokeObjectUrl(originalVanUrl);
    if (vanUrl !== originalVanUrl) revokeObjectUrl(vanUrl);

    const url = createObjectUrl(file);
    setOriginalVanFile(file);
    setOriginalVanUrl(url);
    setVanUrl(url);
    setSelectedLayer("van");
    setStatusMessage("Van image loaded. Adjust placement or remove the background when ready.");
    setErrorMessage("");
  };

  const handleTemplateUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload a template image file.");
      return;
    }

    revokeObjectUrl(templateUrl);
    const url = createObjectUrl(file);
    setTemplateUrl(url);
    setStatusMessage("Premium template loaded.");
    setErrorMessage("");
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload a logo image file.");
      return;
    }

    revokeObjectUrl(logoUrl);
    const url = createObjectUrl(file);
    setLogoUrl(url);
    updateSetting("logoVisible", true);
    setSelectedLayer("logo");
    setStatusMessage("Logo layer loaded.");
    setErrorMessage("");
  };

  const resetTemplate = () => {
    revokeObjectUrl(templateUrl);
    setTemplateUrl(showroomTemplate);
    setStatusMessage("Fallback premium showroom template restored.");
    setErrorMessage("");
  };

  const resetLogo = () => {
    revokeObjectUrl(logoUrl);
    setLogoUrl(vanFinanceLogo);
    updateSetting("logoVisible", true);
    setStatusMessage("Fallback Van Finance logo restored.");
    setErrorMessage("");
  };

  const applyBackgroundRemoval = async () => {
    if (!originalVanFile) {
      setErrorMessage("Upload a van image before removing the background.");
      return;
    }

    if (!removeBackgroundEnabled) {
      setErrorMessage("Turn on Remove background before applying it.");
      return;
    }

    if (typeof removeBackground !== "function") {
      setErrorMessage("Background removal unavailable - you can still use the image without removing the background.");
      return;
    }

    setIsRemoving(true);
    setStatusMessage("Removing background...");
    setErrorMessage("");

    try {
      const result = await removeBackground(originalVanFile);
      if (vanUrl !== originalVanUrl) revokeObjectUrl(vanUrl);
      const url = createObjectUrl(result);
      setVanUrl(url);
      setStatusMessage("Background removed. Fine tune the van placement for export.");
    } catch {
      setVanUrl(originalVanUrl);
      setErrorMessage("Could not remove background for this image. Original image is still available.");
      setStatusMessage("");
    } finally {
      setIsRemoving(false);
    }
  };

  const resetToOriginal = () => {
    if (!originalVanUrl) {
      setErrorMessage("Upload a van image before resetting.");
      return;
    }

    if (vanUrl !== originalVanUrl) revokeObjectUrl(vanUrl);
    setVanUrl(originalVanUrl);
    setStatusMessage("Original van image restored.");
    setErrorMessage("");
  };

  const fitToScene = () => {
    setSettings((current) => ({
      ...current,
      vanZoom: 1,
      vanX: 480,
      vanY: 500,
      shadowOn: true,
      shadowStrength: 0.38,
      shadowBlur: 26,
      shadowWidth: 560,
      shadowHeight: 56,
      shadowX: 0,
      shadowY: 12,
    }));
    setSelectedLayer("van");
    setStatusMessage("Fit to scene applied.");
  };

  const resetComposition = () => {
    setSettings(DEFAULTS);
    setSelectedLayer("van");
    setStatusMessage("Composition reset.");
    setErrorMessage("");
  };

  const nudgeVan = (updates) => {
    setSettings((current) => ({
      ...current,
      ...updates(current),
    }));
    setSelectedLayer("van");
  };

  const handleCanvasPointerDown = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(event, canvas);
    const metrics = layerMetricsRef.current;
    const logoHit = settings.logoVisible && pointInBounds(point, metrics.logo?.bounds);
    const vanHit = pointInBounds(point, metrics.van?.bounds);

    if (!logoHit && !vanHit) return;

    const layer = logoHit ? "logo" : "van";
    const anchorX = layer === "logo" ? settings.logoX : settings.vanX;
    const anchorY = layer === "logo" ? settings.logoY : settings.vanY;

    dragStateRef.current = {
      layer,
      offsetX: point.x - anchorX,
      offsetY: point.y - anchorY,
    };
    setSelectedLayer(layer);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const handleCanvasPointerMove = (event) => {
    const dragState = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!dragState || !canvas) return;

    const point = getCanvasPoint(event, canvas);
    const nextX = Math.round(point.x - dragState.offsetX);
    const nextY = Math.round(point.y - dragState.offsetY);

    setSettings((current) => ({
      ...current,
      ...(dragState.layer === "logo"
        ? {
            logoX: nextX,
            logoY: nextY,
          }
        : {
            vanX: nextX,
            vanY: nextY,
          }),
    }));
  };

  const handleCanvasPointerUp = (event) => {
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  };

  const handleCanvasWheel = (event) => {
    if (!selectedLayer) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const amount = selectedLayer === "logo" ? 0.03 : 0.06;

    setSettings((current) => {
      if (selectedLayer === "logo") {
        return {
          ...current,
          logoZoom: Math.min(1.6, Math.max(0.05, Number((current.logoZoom + direction * amount).toFixed(2)))),
        };
      }

      return {
        ...current,
        vanZoom: Math.min(3.5, Math.max(0.2, Number((current.vanZoom + direction * amount).toFixed(2)))),
      };
    });
  };

  const exportPng = () => {
    drawCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) {
        setErrorMessage("Could not export the canvas image.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "van-background-studio.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusMessage("PNG exported at 960 x 720.");
    }, "image/png");
  };

  return (
    <main className="suite-shell background-studio-shell premium-background-studio">
      <header className="studio-hero">
        <div>
          <p className="eyebrow">Premium studio</p>
          <h1>Background Studio</h1>
          <p className="header-copy">Premium van advert composer for dealership-ready 960 x 720 PNGs.</p>
        </div>
        <div className="studio-hero-actions">
          <span className="studio-format-pill">960 x 720 PNG export</span>
          <a className="header-link-button" href="/">
            Image Suite
          </a>
          <a className="header-link-button" href={CONTROL_CENTRE_URL}>
            Control Centre
          </a>
        </div>
      </header>

      <section className="studio-workspace">
        <aside className="studio-controls-panel">
          <div className="studio-controls-header">
            <span>Composer controls</span>
            <strong>Layered advert build</strong>
          </div>

          <div className="studio-layer-selector" aria-label="Selected layer">
            <button
              className={selectedLayer === "van" ? "is-active" : ""}
              type="button"
              onClick={() => setSelectedLayer("van")}
            >
              Van layer
            </button>
            <button
              className={selectedLayer === "logo" ? "is-active" : ""}
              type="button"
              onClick={() => setSelectedLayer("logo")}
            >
              Logo layer
            </button>
          </div>

          <StudioSection kicker="01" title="Van Image">
            <label className="studio-upload-button">
              Upload van image
              <input type="file" accept="image/*" onChange={handleVanUpload} />
            </label>
            <label className="studio-toggle">
              <input
                type="checkbox"
                checked={removeBackgroundEnabled}
                onChange={(event) => setRemoveBackgroundEnabled(event.target.checked)}
              />
              <span>Remove background</span>
            </label>
            <div className="studio-button-grid">
              <button
                className="studio-button primary"
                type="button"
                onClick={applyBackgroundRemoval}
                disabled={isRemoving || !originalVanFile}
              >
                {isRemoving ? "Removing..." : "Apply background removal"}
              </button>
              <button className="studio-button" type="button" onClick={resetToOriginal} disabled={!originalVanFile}>
                Reset to original
              </button>
            </div>
          </StudioSection>

          <StudioSection kicker="02" title="Premium Template">
            <label className="studio-upload-button secondary">
              Upload template/background
              <input type="file" accept="image/*" onChange={handleTemplateUpload} />
            </label>
            <button className="studio-button" type="button" onClick={resetTemplate}>
              Reset fallback template
            </button>
          </StudioSection>

          <StudioSection kicker="03" title="Logo Layer">
            <label className="studio-upload-button secondary">
              Upload logo
              <input type="file" accept="image/*" onChange={handleLogoUpload} />
            </label>
            <div className="studio-button-grid">
              <button
                className="studio-button"
                type="button"
                onClick={() => updateSetting("logoVisible", !settings.logoVisible)}
              >
                {settings.logoVisible ? "Hide logo" : "Show logo"}
              </button>
              <button className="studio-button" type="button" onClick={resetLogo}>
                Reset logo
              </button>
            </div>
            <StudioSlider
              label="Logo zoom"
              min={0.05}
              max={1.6}
              step={0.01}
              value={settings.logoZoom}
              onChange={(value) => updateSetting("logoZoom", value)}
            />
            <StudioSlider
              label="Logo X position"
              min={-260}
              max={960}
              value={settings.logoX}
              onChange={(value) => updateSetting("logoX", value)}
            />
            <StudioSlider
              label="Logo Y position"
              min={-160}
              max={720}
              value={settings.logoY}
              onChange={(value) => updateSetting("logoY", value)}
            />
            <StudioSlider
              label="Logo rotation"
              min={-35}
              max={35}
              value={settings.logoRotation}
              onChange={(value) => updateSetting("logoRotation", value)}
            />
            <StudioSlider
              label="Logo skew X"
              min={-30}
              max={30}
              value={settings.logoSkewX}
              onChange={(value) => updateSetting("logoSkewX", value)}
            />
            <StudioSlider
              label="Logo skew Y"
              min={-24}
              max={24}
              value={settings.logoSkewY}
              onChange={(value) => updateSetting("logoSkewY", value)}
            />
            <StudioSlider
              label="Logo opacity"
              min={0.1}
              max={1}
              step={0.01}
              value={settings.logoOpacity}
              onChange={(value) => updateSetting("logoOpacity", value)}
            />
          </StudioSection>

          <StudioSection kicker="04" title="Van Placement">
            <StudioSlider
              label="Van zoom"
              min={0.2}
              max={3.5}
              step={0.01}
              value={settings.vanZoom}
              onChange={(value) => updateSetting("vanZoom", value)}
            />
            <StudioSlider
              label="Van X position"
              min={-320}
              max={1280}
              value={settings.vanX}
              onChange={(value) => updateSetting("vanX", value)}
            />
            <StudioSlider
              label="Van Y position"
              min={-120}
              max={900}
              value={settings.vanY}
              onChange={(value) => updateSetting("vanY", value)}
            />
          </StudioSection>

          <StudioSection kicker="05" title="Shadow">
            <label className="studio-toggle">
              <input
                type="checkbox"
                checked={settings.shadowOn}
                onChange={(event) => updateSetting("shadowOn", event.target.checked)}
              />
              <span>Shadow on/off</span>
            </label>
            <StudioSlider
              label="Shadow strength"
              min={0}
              max={0.85}
              step={0.01}
              value={settings.shadowStrength}
              onChange={(value) => updateSetting("shadowStrength", value)}
            />
            <StudioSlider
              label="Shadow blur"
              min={4}
              max={60}
              value={settings.shadowBlur}
              onChange={(value) => updateSetting("shadowBlur", value)}
            />
            <StudioSlider
              label="Shadow width"
              min={140}
              max={900}
              value={settings.shadowWidth}
              onChange={(value) => updateSetting("shadowWidth", value)}
            />
            <StudioSlider
              label="Shadow height"
              min={12}
              max={150}
              value={settings.shadowHeight}
              onChange={(value) => updateSetting("shadowHeight", value)}
            />
            <StudioSlider
              label="Shadow X"
              min={-220}
              max={220}
              value={settings.shadowX}
              onChange={(value) => updateSetting("shadowX", value)}
            />
            <StudioSlider
              label="Shadow Y"
              min={-80}
              max={150}
              value={settings.shadowY}
              onChange={(value) => updateSetting("shadowY", value)}
            />
          </StudioSection>

          <StudioSection kicker="06" title="Quick Actions">
            <div className="studio-action-grid">
              <button className="studio-button" type="button" onClick={fitToScene}>
                Fit to scene
              </button>
              <button
                className="studio-button"
                type="button"
                onClick={() => nudgeVan((current) => ({ vanY: current.vanY + 24, shadowY: current.shadowY + 4 }))}
              >
                Lower van
              </button>
              <button
                className="studio-button"
                type="button"
                onClick={() => nudgeVan((current) => ({ vanZoom: Math.max(0.2, current.vanZoom - 0.08) }))}
              >
                Smaller van
              </button>
              <button
                className="studio-button"
                type="button"
                onClick={() => nudgeVan((current) => ({ vanZoom: Math.min(3.5, current.vanZoom + 0.08) }))}
              >
                Larger van
              </button>
            </div>
            <button className="studio-button" type="button" onClick={resetComposition}>
              Reset composition
            </button>
          </StudioSection>

          <StudioSection kicker="07" title="Export">
            <button className="studio-export-button" type="button" onClick={exportPng}>
              Export PNG
            </button>
            {statusMessage ? <p className="studio-message success">{statusMessage}</p> : null}
            {errorMessage ? <p className="studio-message error">{errorMessage}</p> : null}
          </StudioSection>
        </aside>

        <section className="studio-preview-panel">
          <div className="studio-preview-topbar">
            <div>
              <span>Live canvas</span>
              <strong>Advert preview</strong>
            </div>
            <div className="studio-layer-pills">
              <span>Template</span>
              <span>Logo</span>
              <span>Shadow</span>
              <span>Van</span>
            </div>
          </div>
          <div className="studio-canvas-stage">
            <canvas
              ref={canvasRef}
              className="background-studio-canvas premium-studio-canvas"
              width={CANVAS_SIZE.width}
              height={CANVAS_SIZE.height}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onWheel={handleCanvasWheel}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

export default BackgroundStudio;
