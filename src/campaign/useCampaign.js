import { useCallback, useRef, useState } from "react";
import { loadCampaign, saveCampaign } from "./campaignStorage.js";
import { newCampaign } from "./campaignModel.js";

export default function useCampaign() {
  const [initial] = useState(() => {
    try { return { campaign: loadCampaign(), error: "" }; }
    catch (error) { return { campaign: newCampaign(), error: error.message }; }
  });
  const [campaign, setCampaign] = useState(initial.campaign);
  const [storageError, setStorageError] = useState(initial.error);
  const current = useRef(initial.campaign);
  const unreadable = useRef(Boolean(initial.error));

  const updateCampaign = useCallback((updater, replaceUnreadable = false) => {
    if (unreadable.current && !replaceUnreadable) return false;
    const next = typeof updater === "function" ? updater(current.current) : updater;
    try {
      saveCampaign(next);
      unreadable.current = false;
      current.current = next;
      setCampaign(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError("Campaign could not be saved. Free browser storage before continuing.");
      return false;
    }
  }, []);

  return { campaign, updateCampaign, storageError };
}
