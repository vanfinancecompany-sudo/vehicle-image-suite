import { useEffect, useState } from "react";
import { isUpload, readImage } from "./campaignStorage.js";

export default function VehicleThumbnail({ reference, alt }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!isUpload(reference)) return;
    let cancelled = false;
    let objectUrl;
    readImage(reference).then(blob => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { /* Editor reports missing stored images; thumbnail stays empty. */ });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reference]);
  return <img src={isUpload(reference) ? (src || undefined) : "/api/image?url=" + encodeURIComponent(reference)} alt={alt} />;
}
