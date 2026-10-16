import { useEffect, useState } from "react";
import { isUpload } from "./campaignStorage.js";
import { manualPriceInputs, parseManualPriceOverride } from "./manualOverride.js";

export default function ManualOverrideControls({ job, disabled, onUploadImage, onApplyPrices }) {
  const [values, setValues] = useState(() => manualPriceInputs(job));
  const [error, setError] = useState("");

  // Selecting a different registration, or accepting an OCR suggestion,
  // refreshes the inputs. Unsaved edits are not overwritten on other renders.
  useEffect(() => {
    setValues(manualPriceInputs(job));
    setError("");
  }, [job.id, job.wasPrice?.value, job.nowPrice?.value, job.savePrice?.value]);

  const apply = event => {
    event.preventDefault();
    const result = parseManualPriceOverride(values);
    if (result.error) { setError(result.error); return; }
    if (!onApplyPrices(result.prices)) {
      setError("Could not save manual prices. Check browser storage and try again.");
      return;
    }
    setError("");
  };

  return <section className="campaign-manual-override" aria-label="Manual vehicle image and price override">
    <strong>Manual override</strong>
    <p>If the advert price reader gets stuck, enter the prices here. These values replace its results for this registration only.</p>
    <label className="campaign-upload">Upload replacement vehicle image
      <input type="file" accept="image/jpeg,image/png,image/webp"
        aria-label="Upload replacement vehicle image" disabled={disabled}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) onUploadImage(file);
          event.target.value = "";
        }} />
    </label>
    {isUpload(job.selectedImage || "") && <p className="manual-override-success" role="status">
      Uploaded photograph selected for the new template.
    </p>}
    <form className="campaign-manual-price-form" onSubmit={apply}>
      <div className="campaign-manual-price-fields">
        {[
          ["wasPrice", "WAS"],
          ["nowPrice", "NOW"],
          ["savePrice", "SAVE (or leave blank)"],
        ].map(([field, text]) => <label key={field}>{text}
          <input type="text" inputMode="decimal" value={values[field]} disabled={disabled}
            placeholder={field === "savePrice" ? "Calculate automatically" : "e.g. 12,995"}
            onChange={event => {
              setValues(previous => ({ ...previous, [field]: event.target.value }));
              setError("");
            }} />
        </label>)}
      </div>
      {error && <p className="campaign-warning" role="alert">{error}</p>}
      {job.priceRead?.status === "manual" && <p className="manual-override-success" role="status">
        Manual prices saved. OCR will not overwrite these amounts.
      </p>}
      <button type="submit" className="button primary full" disabled={disabled}>
        Apply Manual Prices
      </button>
    </form>
  </section>;
}
