export const PRICE_FONTS = [
  { family: "Noto Sans", weight: 900, label: "Noto Sans Black / 900" },
  { family: "Arimo", weight: 700, label: "Arimo Bold / 700" },
  { family: "Roboto", weight: 900, label: "Roboto Black / 900" },
  { family: "League Spartan", weight: 900, label: "League Spartan Black / 900" },
  { family: "League Spartan", weight: 800, label: "League Spartan ExtraBold / 800" },
  { family: "Archivo Black", weight: 400, label: "Archivo Black" },
  { family: "Anton", weight: 400, label: "Anton" },
];

// Coordinates are visible-ink top/left on the approved 960 × 720 master.
// The SAVE rectangle excludes its fixed label, frame and right-edge artwork.
export const SAVE_SAFE_AREA = { left: 688, top: 39, right: 925, bottom: 86 };
export const DEFAULT_PRICE_LAYOUT = {
  wasPrice: { x: 30, y: 643, size: 48, color: "#e2e2e2", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 0.86 },
  nowPrice: { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 0.88 },
  savePrice: { x: 695, y: 40, size: 52, color: "#ffffff", fontFamily: "Noto Sans", fontWeight: 900, widthScale: 1.3 },
};

export const PRICE_DEFAULTS_REVISION = 2;
// Recognise only complete, untouched defaults shipped in the previous pass.
// Any partial/manual calibration, unknown field option or different value is preserved.
const previous = [
  [
    { x: 30, y: 643, size: 54, color: "#e2e2e2", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.82 },
    { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "League Spartan", fontWeight: 900, widthScale: 0.95 },
    { x: 695, y: 43, size: 72, color: "#ffffff", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
  ],
  [
    { x: 30, y: 643, size: 54, color: "#e2e2e2", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1 },
    { x: 215, y: 628, size: 72, color: "#111111", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
    { x: 695, y: 43, size: 72, color: "#ffffff", fontFamily: "League Spartan", fontWeight: 900, widthScale: 1.05 },
  ],
];
const fields = ["wasPrice", "nowPrice", "savePrice"];
export function migrateCampaignPriceDefaults(campaign) {
  if (campaign.priceDefaultsRevision >= PRICE_DEFAULTS_REVISION) return campaign;
  const layout = campaign.priceLayout;
  if (!layout || Object.keys(layout).length === 0) return campaign;
  const untouched = Object.keys(layout).length === fields.length && previous.some(preset =>
    fields.every((field, index) => {
      const saved = layout[field];
      const old = preset[index];
      return saved && Object.keys(saved).length === Object.keys(old).length &&
        Object.entries(old).every(([key, value]) => saved[key] === value);
    }));
  if (!untouched) return campaign;
  return { ...campaign, priceDefaultsRevision: PRICE_DEFAULTS_REVISION,
    priceLayout: Object.fromEntries(fields.map(field => [field, { ...DEFAULT_PRICE_LAYOUT[field] }])) };
}
