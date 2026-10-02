import { useState } from "react";
import { createJob, formatPrice, newCampaign, PRICE_FIELDS } from "./campaignModel.js";
import { parseSpreadsheet } from "./spreadsheetParser.js";
import { PRICE_FONTS, pricePosition } from "./priceRenderer.js";
import { PRICE_DEFAULTS_REVISION } from "./priceDefaults.js";

const label = field => field.replace("Price", "").toUpperCase();

export function DynamicPriceControls({ job, onChange, disabled, }) {
  const [field, setField] = useState("nowPrice");
  const offset = job.priceOffsets[field] || { x: 0, y: 0 };
  const move = (x, y = offset.y) => onChange({
    priceOffsets: { ...job.priceOffsets, [field]: { x, y } },
  });
  return <div className="control-stack price-controls">
    <strong>Price position</strong>
    <label className="range-row">Value
      <select value={field} onChange={event => setField(event.target.value)} disabled={disabled}>
        {PRICE_FIELDS.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </label>
    <div className="campaign-actions">
      <button className="button subtle" aria-label={"Move " + label(field) + " left 2 pixels"} disabled={disabled} onClick={() => move(offset.x - 2)}>←</button>
      <span>{offset.x}px</span>
      <button className="button subtle" aria-label={"Move " + label(field) + " right 2 pixels"} disabled={disabled} onClick={() => move(offset.x + 2)}>→</button>
    </div>
    <button className="button ghost" disabled={disabled} onClick={() => move(0, 0)}>Reset Price Position</button>
    <details><summary>Advanced price position</summary>
      {["x", "y"].map(axis => <label key={axis} className="range-row">{axis.toUpperCase()} offset (px)
        <input type="number" value={offset[axis]} disabled={disabled}
          onChange={event => move(axis === "x" ? Number(event.target.value) : offset.x,
            axis === "y" ? Number(event.target.value) : offset.y)} />
      </label>)}
    </details>
  </div>;
}

function VehicleForm({ job, onSave, disabled }) {
  const [values, setValues] = useState(() => ({
    registration: job?.registration || "", location: job?.location || "",
    wasPrice: job?.wasPrice ? String(job.wasPrice.value.toFixed(job.wasPrice.pence ? 2 : 0)) : "",
    nowPrice: job?.nowPrice ? String(job.nowPrice.value.toFixed(job.nowPrice.pence ? 2 : 0)) : "",
    savePrice: job?.savePrice ? String(job.savePrice.value.toFixed(job.savePrice.pence ? 2 : 0)) : "",
    vehicleUrl: job?.vehicleUrl || "",
  }));
  const [error, setError] = useState("");
  return <form className="campaign-form" onSubmit={event => {
    event.preventDefault();
    const parsed = createJob(values, job?.id);
    if (!parsed.registration || !parsed.wasPrice || !parsed.nowPrice || !parsed.savePrice) {
      setError("Registration, WAS and NOW must be valid. Leave SAVE blank to calculate it.");
      return;
    }
    if (onSave(parsed)) {
      setError("");
      if (!job) setValues({ registration: "", location: "", wasPrice: "", nowPrice: "", savePrice: "", vehicleUrl: "" });
    }
  }}>
    {Object.keys(values).map(field => <label key={field}>
      {({ registration: "Registration", location: "Location", wasPrice: "WAS", nowPrice: "NOW", savePrice: "SAVE (blank to calculate)", vehicleUrl: "Vehicle URL (optional)" })[field]}
      <input value={values[field]} disabled={disabled}
        required={["registration", "wasPrice", "nowPrice"].includes(field)}
        onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
    </label>)}
    {error && <p role="alert">{error}</p>}
    <button className="button primary" disabled={disabled}>{job ? "Save Vehicle Details" : "Add Vehicle"}</button>
  </form>;
}

export default function SalesCampaignPanel({
  campaign, updateCampaign, storageError, templates, activeJob,
  onSelect, onExit, onLoadImages, onDealerKitImages, onUploadImage, onJobChange, busy, onError, onStatus,
}) {
  const [filter, setFilter] = useState("Remaining");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const done = campaign.jobs.filter(job => job.done).length;
  const jobs = campaign.jobs.filter(job =>
    (filter === "All" || (filter === "Done" ? job.done : !job.done)) &&
    job.registration.replace(/[\s-]/g, "").includes(search.toUpperCase().replace(/[\s-]/g, "")));
  const disabled = busy || importing;
  const change = patch => updateCampaign(current => ({ ...current, ...patch,
    ...(patch.priceLayout ? { priceDefaultsRevision: PRICE_DEFAULTS_REVISION } : {}) }));
  const importFile = async file => {
    if (!file) return;
    setImporting(true);
    try {
      const jobs = await parseSpreadsheet(file);
      if (updateCampaign(current => ({ ...current, jobs: [...current.jobs, ...jobs] }))) {
        onStatus("Added " + jobs.length + " spreadsheet vehicles. Select a registration to begin.");
      }
    } catch (error) { onError(error.message); }
    finally { setImporting(false); }
  };
  return <section className="panel sales-campaign-panel" aria-label="Vansco Sales Campaign">
    <div className="panel-header">
      <div><p className="panel-kicker">VANSCO SALES CAMPAIGN</p><h2>Vehicle queue</h2></div>
      <span className="count-pill" aria-live="polite">{done} / {campaign.jobs.length} COMPLETE</span>
    </div>
    <div className="campaign-body">
      {storageError && <p className="campaign-warning" role="alert">{storageError}</p>}
      <label>Campaign name
        <input value={campaign.name} disabled={disabled} onChange={event => change({ name: event.target.value })} />
      </label>
      <label>Campaign template
        <select value={campaign.templateId} disabled={disabled}
          onChange={event => change({ templateId: event.target.value })}>
          <option value="">Choose your existing sale overlay</option>
          {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label>
      <label className="campaign-upload">{importing ? "Reading Spreadsheet…" : "Upload Spreadsheet"}
        <input type="file" accept=".xlsx,.xls,.csv" aria-label="Upload Spreadsheet" disabled={disabled}
          onChange={event => { importFile(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <p className="campaign-counts">{campaign.jobs.length} total · {done} completed · {campaign.jobs.length - done} remaining</p>
      <div className="campaign-actions" role="group" aria-label="Queue filter">
        {["Remaining", "Done", "All"].map(value => <button key={value} className="button ghost"
          aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
      </div>
      <label>Search registration<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="campaign-queue" aria-label="Campaign vehicles">
        {jobs.map(job => <button key={job.id} disabled={disabled}
          className={"campaign-vehicle " + (activeJob?.id === job.id ? "is-selected " : "") + (job.done ? "is-done" : "")}
          onClick={() => onSelect(job.id)}>
          <strong>{job.registration || "Missing registration"} · {job.location || "No location"}</strong>
          <span>WAS {formatPrice(job.wasPrice)} · NOW {formatPrice(job.nowPrice)} · SAVE {formatPrice(job.savePrice)}</span>
          <small>{job.done ? "Done" : "Remaining"}</small>
          {job.warnings.map(warning => <span className="campaign-warning" key={warning}>{warning}</span>)}
        </button>)}
        {!jobs.length && <p>No vehicles match this filter.</p>}
      </div>
      {activeJob && <div className="control-stack">
        <strong>Active: {activeJob.registration} · {activeJob.location}</strong>
        <p>WAS {formatPrice(activeJob.wasPrice)} · NOW {formatPrice(activeJob.nowPrice)} · SAVE {formatPrice(activeJob.savePrice)}</p>
        {activeJob.warnings.map(warning => <p className="campaign-warning" role="status" key={warning}>{warning}</p>)}
        <button className="button primary" disabled={disabled || !activeJob.registration} onClick={onDealerKitImages}>LOAD DEALERKIT IMAGES</button>
        <button className="button primary" disabled={disabled || !activeJob.vehicleUrl} onClick={onLoadImages}>Load Images From URL</button>
        <label className="campaign-upload">Upload Image
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload Image" disabled={disabled}
            onChange={event => { onUploadImage(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <button className="button ghost" disabled={disabled} onClick={() => onJobChange({ done: !activeJob.done })}>
          Mark {activeJob.done ? "Not Done" : "Done"}
        </button>
        <details><summary>Edit active vehicle</summary>
          <VehicleForm key={activeJob.id + "-" + [activeJob.registration, activeJob.location, activeJob.wasPrice?.value, activeJob.nowPrice?.value, activeJob.savePrice?.value, activeJob.vehicleUrl].join("|")} job={activeJob} disabled={disabled}
            onSave={parsed => onJobChange({
              registration: parsed.registration, location: parsed.location, vehicleUrl: parsed.vehicleUrl,
              wasPrice: parsed.wasPrice, nowPrice: parsed.nowPrice, savePrice: parsed.savePrice, warnings: parsed.warnings,
            })} />
        </details>
        <button className="button ghost" disabled={disabled} onClick={onExit}>Return to Normal Editor</button>
      </div>}
      <details><summary>Add New Stock Vehicle</summary>
        <VehicleForm disabled={disabled} onSave={job => updateCampaign(current => ({ ...current, jobs: [...current.jobs, job] }))} />
      </details>
      <details><summary>Advanced campaign price defaults</summary>
        <p>Calibrate against your master PNG once. All values are left-anchored. Vehicle offsets remain independent. SAVE stays within its panel safe area; long values fit horizontally.</p>
        {PRICE_FIELDS.map(field => <fieldset key={field} aria-label={label(field) + " defaults"}><legend>{label(field)}</legend>
          {["x", "y", "size"].map(axis => <label key={axis}>{axis === "size" ? "Font size" : axis.toUpperCase()} (px)
            <input type="number" value={pricePosition(campaign.priceLayout, field)[axis]}
              disabled={disabled} min={axis === "size" ? 10 : undefined} max={axis === "size" ? 100 : undefined}
              onChange={event => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || (axis === "size" && (value < 10 || value > 100))) return;
                const layout = Object.fromEntries(PRICE_FIELDS.map(value => [value, pricePosition(campaign.priceLayout, value)]));
                change({ priceLayout: { ...layout, [field]: { ...layout[field], [axis]: value } } });
              }} />
          </label>)}
          <label>Font family
            <select aria-label={label(field) + " font family"} disabled={disabled}
              value={pricePosition(campaign.priceLayout, field).fontFamily + "|" + pricePosition(campaign.priceLayout, field).fontWeight}
              onChange={event => {
                const [fontFamily, weight] = event.target.value.split("|");
                const layout = Object.fromEntries(PRICE_FIELDS.map(value => [value, pricePosition(campaign.priceLayout, value)]));
                change({ priceLayout: { ...layout, [field]: { ...layout[field], fontFamily, fontWeight: Number(weight) } } });
              }}>
              {PRICE_FONTS.map(font => <option key={font.label} value={font.family + "|" + font.weight}>{font.label}</option>)}
            </select>
          </label>
          <label>Width / horizontal scale
            <input type="number" aria-label={label(field) + " width percent"} min="50" max="200" step="5"
              value={Math.round(pricePosition(campaign.priceLayout, field).widthScale * 100)} disabled={disabled}
              onChange={event => {
                const percent = Number(event.target.value);
                if (!Number.isFinite(percent) || percent < 50 || percent > 200) return;
                const layout = Object.fromEntries(PRICE_FIELDS.map(value => [value, pricePosition(campaign.priceLayout, value)]));
                change({ priceLayout: { ...layout, [field]: { ...layout[field], widthScale: percent / 100 } } });
              }} />
            <small>Percent — expands from the fixed left edge of £</small>
          </label>
        </fieldset>)}
      </details>
      <button className="button ghost" disabled={disabled} onClick={() => {
        if (window.confirm("Start a new campaign? This replaces the current queue and progress. Templates are kept.")) {
          onExit();
          updateCampaign(newCampaign(), true);
        }
      }}>New Campaign</button>
    </div>
  </section>;
}
