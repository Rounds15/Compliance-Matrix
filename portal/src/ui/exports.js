/* Exports generated in the browser from what the page has loaded - nothing
   leaves the viewer's machine except the file they download. */

import { isoDate } from "../lib/dates.js";

const cell = v => {
  const s = v === null || v === undefined ? "" : (v instanceof Date ? isoDate(v) : String(v));
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCsv = (header, rows) => [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n");

export function download(name, text, type) {
  // BOM so Excel opens UTF-8 (en dashes, section signs) correctly
  const blob = new Blob([type.startsWith("text/csv") ? "\uFEFF" + text : text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

const names = list => list.map(r => r.person.n).join("; ");

export function matrixCsv(ds) {
  return toCsv(
    ["Function ID", "Compliance Function", "Risk Area", "Domain", "Risk Rating", "Statute", "Citation", "Statute URL",
      "Executive Owner", "Unit Owner", "Compliance Owner", "General Counsel", "Description", "Reporting Requirement",
      "Deadline", "Resource Label", "Resource URL", "Open Gaps", "Flagged"],
    ds.fns.map(f => [f.code, f.name, f.topic, f.area, f.risk, f.statute, f.citation, f.statuteUrl,
      names(f.chain.exec), names(f.chain.unit), names(f.chain.compliance), f.counsel ? f.counsel.n : "",
      f.description, f.reporting, f.deadline, f.resourceLabel, f.resourceUrl,
      ds.gaps.filter(g => g.open && String(g.functionId) === String(f.id)).length,
      ds.flags.some(x => String(x.functionId) === String(f.id)) ? "Yes" : "No"]));
}

export function gapsCsv(ds, today) {
  return toCsv(
    ["Gap ID", "Summary", "Status", "Severity", "Function", "Risk Area", "Owner", "Opened", "Days Open", "Closed", "Target", "Detail", "Closure Note"],
    ds.gaps.map(g => [g.code, g.title, g.status, g.severity, g.functionName, g.topic, g.owner.n, g.opened,
      g.opened ? Math.round(((g.closed || today) - g.opened) / 86400000) : "", g.closed,
      [g.targetQuarter, g.targetFY].filter(Boolean).join(" "), g.note, g.closeNote]));
}

export function ownershipCsv(ds) {
  const rows = [];
  ds.fns.forEach(f => [["Executive Owner", "exec"], ["Unit Owner", "unit"], ["Compliance Owner", "compliance"], ["General Counsel", "counsel"]]
    .forEach(([role, k]) => f.chain[k].forEach(r => rows.push([f.code, f.name, f.topic, role, r.sub || "", r.person.n, r.person.e]))));
  return toCsv(["Function ID", "Compliance Function", "Risk Area", "Role", "Sub-role", "Person", "Email"], rows);
}

/* RFC 5545 all-day events, one per open deadline, titled as the canvas app
   titles the Outlook events it creates ("Compliance deadline: ..."). The
   portal cannot write to the viewer's Outlook, so it hands them a file. */
export function deadlinesIcs(deadlines, host) {
  const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const day = d => isoDate(d).replace(/-/g, "");
  const next = d => { const x = new Date(d.getTime()); x.setDate(x.getDate() + 1); return x; };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fold = line => line.length <= 74 ? line : line.match(/.{1,74}/g).join("\r\n ");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Syracuse University//Compliance Matrix//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Compliance Matrix deadlines"];
  deadlines.filter(d => d.due && d.status !== "Completed").forEach(d => {
    lines.push("BEGIN:VEVENT", "UID:cm-" + String(d.id).replace(/[^A-Za-z0-9-]/g, "") + "-" + day(d.due) + "@" + host, "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + day(d.due), "DTEND;VALUE=DATE:" + day(next(d.due)),
      fold("SUMMARY:" + esc("Compliance deadline: " + d.functionName)), fold("DESCRIPTION:" + esc(d.cadence + " \u00B7 Compliance owner: " + d.owner.n)), "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
