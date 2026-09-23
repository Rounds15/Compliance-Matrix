/* Date helpers shared by every screen.

   Everything works on local-midnight Date objects standing for a calendar day.

   SharePoint stores a date-only column as midnight in the *site's* time zone
   and returns it in UTC ("2026-10-01T04:00:00Z" for Syracuse). Read in the
   viewer's zone, that is Sep 30 for anyone west of Eastern, so timestamps are
   converted to a calendar day in the site's zone instead - America/New_York
   unless the site setting ComplianceMatrix/TimeZone says otherwise. Dataverse
   DateOnly values arrive as a bare "2026-10-01" and are taken as written. */

let SITE_TZ = "America/New_York";
let fmt = null;
export function setSiteTimeZone(tz) {
  if (!tz) return;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); SITE_TZ = tz; fmt = null; } catch (e) { /* unknown zone: keep the default */ }
}
function siteDay(d) {
  if (!fmt) fmt = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, dd] = fmt.format(d).split("-").map(Number);
  return new Date(y, m - 1, dd);
}

export const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function toDay(v) {
  if (v === null || v === undefined || v === "") return null;
  /* A bare "2026-09-10" (Dataverse DateOnly) is a calendar day, but
     new Date() reads it as UTC midnight - the evening before in Syracuse.
     Build it as a local date instead. */
  const m = typeof v === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const d = new Date(v.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return siteDay(d);
}

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const fmtDate = d => d ? `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "No date";

export function dayDiff(d, from) {
  if (!d) return 0;
  return Math.round((d - from) / 86400000);
}

/* Syracuse fiscal year starts July 1. FY27 Q1 = Jul-Sep 2026. */
export function fiscalQ(d) {
  if (!d) return "";
  const m = d.getMonth();
  const q = Math.floor(((m + 6) % 12) / 3) + 1;
  const fy = m >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(fy).slice(2)} Q${q}`;
}

export function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/* Power Fx DateAdd(..., TimeUnit.Months): clamps to the last day of a shorter
   month (Jan 31 + 1 month = Feb 28/29), exactly like the canvas app. */
export function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), last));
  return x;
}

/* Power Fx DateDiff(a, b, TimeUnit.Months) counts month boundaries crossed and
   ignores the day of month: DateDiff(Jan 31, Feb 1) = 1. */
export function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export const isoDate = d => d
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : null;
