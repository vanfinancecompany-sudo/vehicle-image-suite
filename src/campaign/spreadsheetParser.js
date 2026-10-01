import { createJob } from "./campaignModel.js";

const aliases = {
  registration: ["reg", "registration"],
  location: ["sales location", "location", "site", "branch"],
  wasPrice: ["retail price", "was", "was price", "old price"],
  nowPrice: ["new sales price", "now", "now price", "sale price"],
  savePrice: ["discount", "save", "saving"],
  vehicleUrl: ["vehicle url", "url", "link", "page url"],
};
const normalize = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function parseRows(rows) {
  const headerIndex = rows.findIndex(row => row.some(cell => aliases.registration.includes(normalize(cell))));
  if (headerIndex < 0) throw new Error("No Reg or Registration column found.");
  const headers = rows[headerIndex].map(normalize);
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) =>
    [field, headers.findIndex(header => names.includes(header))]));
  if (columns.wasPrice < 0 || columns.nowPrice < 0) {
    throw new Error("Include WAS / Retail Price and NOW / New Sales Price columns.");
  }
  const jobs = rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => cell != null && String(cell).trim() !== ""))
    .map(row => createJob(Object.fromEntries(Object.entries(columns)
      .map(([field, column]) => [field, column >= 0 ? row[column] : ""]))));
  if (!jobs.length) throw new Error("The spreadsheet has no vehicle rows.");
  return jobs;
}

export async function parseSpreadsheet(file) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellText: true });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    // Formatted cells retain explicit pence (including numeric Excel currency formats).
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    if (rows.some(row => row.some(cell => aliases.registration.includes(normalize(cell))))) {
      return parseRows(rows);
    }
  }
  throw new Error("No worksheet with a Reg or Registration column found.");
}
