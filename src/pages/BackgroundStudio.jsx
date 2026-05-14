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
  vanZoom: 0.85,
  vanX: 470,
  vanY: 430,
  logoZoom: 0.28,
  logoX: 155,
  logoY: 215,
  shadowOn: true,
  shadowStrength: 0.35,
};

function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = source;
  });
}

function SliderControl({ label, min, max, step = 1, value, onChange }) {
  return (
    <label className="background-slider">
      <span>
        {label}
        <strong>{value}</strong>
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

function BackgroundStudio() {
  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const logoRef = useRef(null);
  const vanRef = useRef(null);
  const objectUrlsRef = useRef([]);

  const [originalFile, setOriginalFile] = useState(null);
  const [originalVanUrl, setOriginalVanUrl] = useState("");
  const [vanUrl, setVanUrl] = useState("");
  const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [settings, setSettings] = useState(DEFAULTS);
  const [renderTick, setRenderTick] = useState(0);

  const createObjectUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);
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

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || !backgroundRef.current || !logoRef.current) {
      return;
    }

    canvas.width = CANVAS_SIZE.width;
    canvas.height = CANVAS_SIZE.height;
    context.clearRect(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);
    context.drawImage(backgroundRef.current, 0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);

    const logoImage = logoRef.current;
    const logoWidth = logoImage.naturalWidth * settings.logoZoom;
    const logoHeight = logoImage.naturalHeight * settings.logoZoom;
    context.drawImage(logoImage, settings.logoX, settings.logoY, logoWidth, logoHeight);

    const vanImage = vanRef.current;
    if (!vanImage) {
      context.save();
      context.fillStyle = "rgba(15, 23, 42, 0.72)";
      context.font = "700 24px Inter, Arial, sans-serif";
      context.textAlign = "center";
      context.fillText("Upload a van image to begin", CANVAS_SIZE.width / 2, 520);
      context.restore();
      return;
    }

    const fitScale = Math.min(700 / vanImage.naturalWidth, 390 / vanImage.naturalHeight);
    const vanWidth = vanImage.naturalWidth * fitScale * settings.vanZoom;
    const vanHeight = vanImage.naturalHeight * fitScale * settings.vanZoom;
    const vanLeft = settings.vanX - vanWidth / 2;
    const vanTop = settings.vanY - vanHeight / 2;

    if (settings.shadowOn) {
      context.save();
      context.globalAlpha = settings.shadowStrength;
      context.fillStyle = "#020617";
      context.filter = "blur(18px)";
      context.beginPath();
      context.ellipse(
        settings.vanX,
        vanTop + vanHeight * 0.92,
        Math.max(80, vanWidth * 0.38),
        Math.max(18, vanHeight * 0.06),
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
    }

    context.drawImage(vanImage, vanLeft, vanTop, vanWidth, vanHeight);
  }, [settings]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadCanvasImage(showroomTemplate), loadCanvasImage(vanFinanceLogo)])
      .then(([background, logo]) => {
        if (!isMounted) return;
        backgroundRef.current = background;
        logoRef.current = logo;
        queueDraw();
      })
      .catch(() => {
        if (!isMounted) return;
        setErrorMessage("Could not load the showroom template or logo.");
      });

    return () => {
      isMounted = false;
    };
  }, [queueDraw]);

  useEffect(() => {
    if (!vanUrl) {
      vanRef.current = null;
      queueDraw();
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
  }, [queueDraw, vanUrl]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, renderTick]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload an image file.");
      return;
    }

    const url = createObjectUrl(file);
    setOriginalFile(file);
    setOriginalVanUrl(url);
    setVanUrl(url);
    setStatusMessage("Van image loaded.");
    setErrorMessage("");
  };

  const applyBackgroundRemoval = async () => {
    if (!originalFile) {
      setErrorMessage("Upload a van image before removing the background.");
      return;
    }

    if (!removeBackgroundEnabled) {
      setErrorMessage("Turn on Remove background before applying it.");
      return;
    }

    if (typeof removeBackground !== "function") {
      setErrorMessage(
        "Background removal unavailable — you can still use the image without removing the background."
      );
      return;
    }

    setIsRemoving(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const result = await removeBackground(originalFile);
      const url = createObjectUrl(result);
      setVanUrl(url);
      setStatusMessage("Background removed.");
    } catch {
      setVanUrl(originalVanUrl);
      setErrorMessage("Could not remove background for this image. Original image is still available.");
    } finally {
      setIsRemoving(false);
    }
  };

  const resetToOriginal = () => {
    if (!originalVanUrl) {
      setErrorMessage("Upload a van image before resetting.");
      return;
    }

    setVanUrl(originalVanUrl);
    setStatusMessage("Original van image restored.");
    setErrorMessage("");
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
    }, "image/png");
  };

  return (
    <main className="suite-shell background-studio-shell">
      <header className="suite-header">
        <div>
          <p className="eyebrow">Standalone tool</p>
          <h1>Background Studio</h1>
          <p className="header-copy">Compose a van, showroom background, logo layer, and soft floor shadow.</p>
        </div>
        <div className="header-actions">
          <span className="status-pill">960 x 720 PNG</span>
          <a className="header-link-button" href="/">
            Image Suite
          </a>
          <a className="header-link-button" href={CONTROL_CENTRE_URL}>
            Control Centre
          </a>
        </div>
      </header>

      <section className="background-studio-grid">
        <aside className="panel background-controls">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Controls</p>
              <h2>Image layers</h2>
            </div>
          </div>

          <div className="background-control-stack">
            <label className="file-button background-upload">
              Upload van image
              <input type="file" accept="image/*" onChange={handleUpload} />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={removeBackgroundEnabled}
                onChange={(event) => setRemoveBackgroundEnabled(event.target.checked)}
              />
              <span>Remove background</span>
            </label>

            <div className="background-button-row">
              <button
                className="button primary"
                type="button"
                onClick={applyBackgroundRemoval}
                disabled={isRemoving || !originalFile}
              >
                {isRemoving ? "Removing..." : "Apply background removal"}
              </button>
              <button className="button secondary" type="button" onClick={resetToOriginal} disabled={!originalFile}>
                Reset to original
              </button>
            </div>

            <SliderControl
              label="Van zoom"
              min={0.35}
              max={1.6}
              step={0.01}
              value={settings.vanZoom}
              onChange={(value) => updateSetting("vanZoom", value)}
            />
            <SliderControl
              label="Van X position"
              min={0}
              max={960}
              value={settings.vanX}
              onChange={(value) => updateSetting("vanX", value)}
            />
            <SliderControl
              label="Van Y position"
              min={220}
              max={680}
              value={settings.vanY}
              onChange={(value) => updateSetting("vanY", value)}
            />

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.shadowOn}
                onChange={(event) => updateSetting("shadowOn", event.target.checked)}
              />
              <span>Shadow on/off</span>
            </label>
            <SliderControl
              label="Shadow strength"
              min={0}
              max={0.8}
              step={0.01}
              value={settings.shadowStrength}
              onChange={(value) => updateSetting("shadowStrength", value)}
            />

            <SliderControl
              label="Logo zoom"
              min={0.08}
              max={0.65}
              step={0.01}
              value={settings.logoZoom}
              onChange={(value) => updateSetting("logoZoom", value)}
            />
            <SliderControl
              label="Logo X position"
              min={0}
              max={760}
              value={settings.logoX}
              onChange={(value) => updateSetting("logoX", value)}
            />
            <SliderControl
              label="Logo Y position"
              min={0}
              max={560}
              value={settings.logoY}
              onChange={(value) => updateSetting("logoY", value)}
            />

            <button className="button primary export-button" type="button" onClick={exportPng}>
              Export PNG
            </button>

            {statusMessage ? <p className="background-message success">{statusMessage}</p> : null}
            {errorMessage ? <p className="background-message error">{errorMessage}</p> : null}
          </div>
        </aside>

        <section className="panel background-preview-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Preview</p>
              <h2>Showroom canvas</h2>
            </div>
            <span className="status-pill muted">Logo layer separate</span>
          </div>
          <div className="background-preview-frame">
            <canvas
              ref={canvasRef}
              className="background-studio-canvas"
              width={CANVAS_SIZE.width}
              height={CANVAS_SIZE.height}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

export default BackgroundStudio;
