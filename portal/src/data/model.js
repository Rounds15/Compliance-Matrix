/* One data model for every backend.

   Each adapter (sample, SharePoint, Dataverse) returns the same set of plain
   tables - the "raw" shape documented below - and buildDataset() turns them
   into what the screens read: functions with their ownership chain resolved,
   deadlines rolled forward, gaps and flags joined to their function.

   Raw shape (ids are whatever the backend uses: integers for SharePoint,
   GUIDs for Dataverse; they are only ever compared, never parsed):

     riskAreas  {id, name, color}
     domains    {id, name, riskAreaId}
     people     {id, name, email, title, unit, phone, location, netid}
     functions  {id, code, name, riskAreaId, domainId, statute, citation,
                 statuteUrl, description, reporting, deadline, resourceLabel,
                 resourceUrl, risk, lastReviewed, fixedOwners?}
     ownership  {id, functionId, personId, role, sub}
     counsel    {riskAreaId, personId, isDefault}          (Dataverse only)
     deadlines  {id, functionId, title, base, cadence, lastDone, reason}
     gaps       {id, code, functionId, title, status, source, note, closeNote,
                 unit, responsibleId, opened, closed, targetQuarter, targetFY,
                 severity?}
     flags      {id, functionId, reason, byId, byName, byEmail, at, open}   */

import { normRisk, riskRank } from "../lib/risk.js";
import { nextOccurrence } from "../lib/deadlines.js";

export const ROLE_EXEC = "Executive Owner";
export const ROLE_UNIT = "Unit Owner";
export const ROLE_COMPLIANCE = "Compliance Owner";
export const ROLE_COUNSEL = "General Counsel";
export const ROLE_SUPPORT = "Support";
export const CHAIN_ROLES = [ROLE_EXEC, ROLE_UNIT, ROLE_COMPLIANCE];
export const SUBROLES = ["Primary", "Advisory"];

/* Stand-in for an unassigned role, so a missing owner renders as "Not
   assigned" instead of crashing a screen. Never matches anyone: its email is
   empty and every identity comparison goes through samePerson(). */
export const NOBODY = Object.freeze({ id: null, n: "Not assigned", t: "", u: "", e: "", ph: "", l: "", none: true });

const lc = s => String(s || "").trim().toLowerCase();

export function samePerson(a, b) {
  if (!a || !b || a.none || b.none) return false;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  return !!a.e && lc(a.e) === lc(b.e);
}

export function toPerson(p) {
  if (!p) return null;
  return {
    id: p.id,
    n: p.name || p.email || "Unnamed",
    t: p.title || "",
    u: p.unit || "",
    e: p.email || "",
    ph: p.phone || "",
    l: p.location || "",
    netid: p.netid || (p.email && /@syr\.edu$/i.test(p.email) ? p.email.split("@")[0].toLowerCase() : ""),
    /* resolvable (counsel of record) but not a Compliance Directory entry */
    counselOnly: !!p.counselOnly
  };
}

const primaryOf = list => (list.find(x => x.sub === "Primary") || list[0] || null);

export function buildDataset(raw, { today, meEmail, meName }) {
  const people = (raw.people || []).map(toPerson);
  const personById = new Map(people.map(p => [String(p.id), p]));
  const findPerson = id => (id == null ? null : personById.get(String(id)) || null);

  const riskAreaById = new Map((raw.riskAreas || []).map(r => [String(r.id), r]));
  const domainById = new Map((raw.domains || []).map(d => [String(d.id), d]));

  /* ownership rows grouped per function */
  const ownByFn = new Map();
  for (const o of raw.ownership || []) {
    const person = findPerson(o.personId);
    if (!person) continue; // a row pointing at a deleted person has no one to show
    const k = String(o.functionId);
    if (!ownByFn.has(k)) ownByFn.set(k, []);
    ownByFn.get(k).push({ rowId: o.id, person, role: o.role, sub: o.sub || "Primary" });
  }

  const counselDefault = (raw.counsel || []).find(c => c.isDefault);
  const counselByArea = new Map((raw.counsel || []).filter(c => c.riskAreaId != null).map(c => [String(c.riskAreaId), c]));

  const fns = (raw.functions || []).map(f => {
    const ra = riskAreaById.get(String(f.riskAreaId));
    const dm = domainById.get(String(f.domainId));
    let rows = ownByFn.get(String(f.id)) || [];
    /* Dataverse keeps three fixed owner lookups beside the junction. Use them
       only when the junction has nothing for that role. */
    if (f.fixedOwners) {
      const add = (role, id) => {
        if (rows.some(r => r.role === role)) return;
        const p = findPerson(id);
        if (p) rows = rows.concat([{ rowId: null, person: p, role, sub: "Primary" }]);
      };
      add(ROLE_EXEC, f.fixedOwners.exec);
      add(ROLE_UNIT, f.fixedOwners.unit);
      add(ROLE_COMPLIANCE, f.fixedOwners.compliance);
    }
    const byRole = role => rows.filter(r => r.role === role);
    const chain = {
      exec: byRole(ROLE_EXEC),
      unit: byRole(ROLE_UNIT),
      compliance: byRole(ROLE_COMPLIANCE),
      counsel: byRole(ROLE_COUNSEL),
      support: byRole(ROLE_SUPPORT)
    };
    let counsel = chain.counsel[0] ? chain.counsel[0].person : null;
    if (!counsel) {
      const c = counselByArea.get(String(f.riskAreaId)) || counselDefault;
      counsel = c ? findPerson(c.personId) : null;
    }
    const pe = primaryOf(chain.exec), pu = primaryOf(chain.unit), pc = primaryOf(chain.compliance);
    return {
      id: f.id,
      code: f.code || String(f.id),
      name: f.name || "Untitled function",
      topic: ra ? ra.name : "No risk area",
      topicId: f.riskAreaId ?? null,
      area: dm ? dm.name : "No domain",
      areaId: f.domainId ?? null,
      statute: f.statute || "",
      citation: f.citation || "",
      statuteUrl: f.statuteUrl || "",
      description: f.description || "",
      reporting: f.reporting || "",
      deadline: f.deadline || "",
      resourceLabel: f.resourceLabel || "",
      resourceUrl: f.resourceUrl || "",
      risk: normRisk(f.risk),
      lastReviewed: f.lastReviewed || null,
      chain,
      counsel,
      exec: pe ? pe.person : NOBODY,
      unitOwner: pu ? pu.person : null,
      owner: pc ? pc.person : NOBODY
    };
  });
  const fnById = new Map(fns.map(f => [String(f.id), f]));

  /* risk areas, largest first, the order the design lists them in */
  const count = new Map();
  fns.forEach(f => count.set(String(f.topicId), (count.get(String(f.topicId)) || 0) + 1));
  const topics = (raw.riskAreas || [])
    .map(r => ({ id: r.id, name: r.name, color: r.color || "", count: count.get(String(r.id)) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const domains = (raw.domains || []).map(d => {
    const ra = riskAreaById.get(String(d.riskAreaId));
    return { id: d.id, name: d.name, topicId: d.riskAreaId ?? null, topic: ra ? ra.name : "" };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const allDeadlines = (raw.deadlines || []).map(d => {
    const f = fnById.get(String(d.functionId));
    const r = nextOccurrence(d.base, d.cadence, d.lastDone, today);
    return {
      id: d.id,
      functionId: d.functionId,
      functionName: f ? f.name : "Unknown function",
      topic: f ? f.topic : "",
      title: d.title || (f ? f.name : "Deadline"),
      due: r.next,
      base: d.base,
      cadence: d.cadence || "One-time",
      lastDone: d.lastDone || null,
      reason: d.reason || "",
      complete: r.withinHold,
      status: r.status,
      owner: f ? f.owner : NOBODY,
      risk: f ? f.risk : "Unrated"
    };
  }).filter(d => fnById.has(String(d.functionId)));

  const gaps = (raw.gaps || []).map(g => {
    const f = fnById.get(String(g.functionId));
    const status = g.status || "Open";
    const responsible = findPerson(g.responsibleId);
    return {
      id: g.id,
      code: g.code || String(g.id),
      functionId: g.functionId,
      functionName: f ? f.name : "Unknown function",
      topic: f ? f.topic : "",
      title: g.title || "Untitled gap",
      /* the live Gap Tracker rates a gap by its function's risk rating */
      severity: g.severity ? normRisk(g.severity) : (f ? f.risk : "Unrated"),
      status,
      open: status !== "Closed",
      opened: g.opened || null,
      closed: g.closed || null,
      note: g.note || "",
      closeNote: g.closeNote || "",
      source: g.source || "",
      unit: g.unit || "",
      targetQuarter: g.targetQuarter || "",
      targetFY: g.targetFY || "",
      owner: responsible || (f ? f.owner : NOBODY)
    };
  }).filter(g => fnById.has(String(g.functionId)))
    .sort((a, b) => riskRank(a.severity) - riskRank(b.severity) || (a.opened || 0) - (b.opened || 0));

  const allFlags = (raw.flags || []).map(x => {
    const by = findPerson(x.byId);
    return {
      id: x.id,
      functionId: x.functionId,
      reason: x.reason || "",
      by: x.byName || (by ? by.n : "") || x.byEmail || "Unknown",
      byEmail: x.byEmail || (by ? by.e : ""),
      at: x.at || null,
      open: x.open !== false
    };
  }).filter(x => fnById.has(String(x.functionId)))
    .sort((a, b) => (b.at || 0) - (a.at || 0));

  /* executive owners: anyone holding the Executive Owner role somewhere,
     sorted by last name - the canvas app's colExecNames */
  const execSet = new Map();
  fns.forEach(f => f.chain.exec.forEach(r => execSet.set(String(r.person.id), r.person)));
  const lastName = p => p.n.split(" ").slice(-1)[0];
  const executives = [...execSet.values()].sort((a, b) => lastName(a).localeCompare(lastName(b)));

  const me = people.find(p => p.e && lc(p.e) === lc(meEmail))
    || { ...NOBODY, none: false, id: null, n: meName || meEmail || "Signed-in user", e: meEmail || "" };

  return {
    today,
    people: people.filter(p => !p.counselOnly).sort((a, b) => a.n.localeCompare(b.n)),
    topics,
    domains,
    fns,
    fnById,
    allDeadlines,
    gaps,
    allFlags,
    flags: allFlags.filter(x => x.open),
    executives,
    me,
    raw
  };
}

/* Every Accountability Structure row on a function, whatever the role. */
export const allRows = f => [...f.chain.exec, ...f.chain.unit, ...f.chain.compliance, ...f.chain.counsel, ...f.chain.support];

/* A person's own functions: the canvas app's colMyFunctions, every function
   where they appear anywhere in the Accountability Structure. */
export function functionsFor(person, fns) {
  if (!person || person.none) return [];
  return fns.filter(f => allRows(f).some(r => samePerson(r.person, person)));
}

/* The role shown for a person on a function in "Assigned to you". */
export function roleOn(f, person) {
  if (f.chain.exec.some(r => samePerson(r.person, person))) return ROLE_EXEC;
  if (f.chain.unit.some(r => samePerson(r.person, person))) return ROLE_UNIT;
  return ROLE_COMPLIANCE;
}

/* Admin view shows every deadline; User view and View as show only the
   deadlines of the viewer's own functions. */
export function visibleDeadlines(ds, person, adminView) {
  if (adminView) return ds.allDeadlines;
  const mine = new Set(functionsFor(person, ds.fns).map(f => String(f.id)));
  return ds.allDeadlines.filter(d => mine.has(String(d.functionId)));
}
