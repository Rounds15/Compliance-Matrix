/* Risk vocabulary.

   The live lists use High / Moderate / Low, with a blank rating shown as
   Unrated ("Not Scored" in the canvas edit screen). The design prototype used
   Critical / High / Medium / Low. Both render: the colour map covers every
   value either source can produce, and the pickers offer only the live set so
   new edits never write a legacy value back. */

export const RISK_COLOR = {
  Critical: "#B91C1C",
  High: "#DC2626",
  Moderate: "#D97706",
  Medium: "#D97706",
  Low: "#16A34A",
  Unrated: "#8A929E"
};

/* Display order, most severe first. Filters show only the levels present. */
export const RISK_ORDER = ["Critical", "High", "Moderate", "Medium", "Low", "Unrated"];

/* What an editor may choose. "" is stored as blank and reads back as Unrated. */
export const RISK_CHOICES = [
  ["", "Not scored"],
  ["High", "High"],
  ["Moderate", "Moderate"],
  ["Low", "Low"]
];

export function normRisk(v) {
  if (v === null || v === undefined) return "Unrated";
  const s = String(typeof v === "object" ? v.Value : v).trim();
  if (!s || /^not (scored|rated)$/i.test(s)) return "Unrated";
  const hit = RISK_ORDER.find(r => r.toLowerCase() === s.toLowerCase());
  return hit || s;
}

export const riskRank = r => {
  const i = RISK_ORDER.indexOf(r);
  return i < 0 ? RISK_ORDER.length : i;
};

export const isSevere = r => r === "Critical" || r === "High";

export function levelsPresent(values) {
  const set = new Set(values);
  return RISK_ORDER.filter(r => set.has(r));
}
