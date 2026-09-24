/* In-memory backend built from the design prototype's sample records.

   Everything the live backends do, this does against arrays in memory, so the
   whole page - reads and every write - runs with no Power Pages site behind
   it. Nothing persists past a reload. */

import * as S from "./sample-data.js";
import { addDays, today as todayFn } from "../../lib/dates.js";

const clone = x => JSON.parse(JSON.stringify(x), (k, v) =>
  (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v));

/* the prototype rated Critical / High / Medium / Low; the live lists and the
   app use High / Moderate / Low */
const LIVE_RISK = { Critical: "High", Medium: "Moderate" };

export function sampleRaw(today = todayFn()) {
  const dt = n => addDays(today, n);
  const people = Object.entries(S.P).map(([k, p]) => ({
    id: k, name: p.n, title: p.t, unit: p.u, email: p.e, phone: p.ph, location: p.l
  }));
  const riskAreas = S.TOPICS.map(t => ({ id: t.name, name: t.name, color: "" }));
  const domainKey = (topic, area) => topic + " / " + area;
  const domains = [];
  const seen = new Set();
  S.F.forEach(r => {
    const k = domainKey(r[1], r[2]);
    if (!seen.has(k)) { seen.add(k); domains.push({ id: k, name: r[2], riskAreaId: r[1] }); }
  });
  /* a spread of last-assessed dates, so the record status reads like live data */
  const functions = S.F.map((r, i) => ({
    id: r[0], code: r[0], riskAreaId: r[1], domainId: domainKey(r[1], r[2]), name: r[3],
    statute: r[4], citation: r[5], statuteUrl: r[6], description: r[10], reporting: r[11],
    deadline: r[12], resourceLabel: r[13], resourceUrl: r[14], risk: LIVE_RISK[r[15]] || r[15], lastReviewed: dt(-(20 + (i * 37) % 340))
  }));
  let n = 0;
  const ownership = [];
  S.F.forEach(r => {
    const add = (key, role) => { if (key) ownership.push({ id: "OWN-" + (++n), functionId: r[0], personId: key, role, sub: "Primary" }); };
    add(r[7], "Executive Owner");
    // the prototype leaves one function without a unit owner on purpose
    add(r[0] === "CF-9082" ? null : r[8], "Unit Owner");
    add(r[9], "Compliance Owner");
  });
  const deadlines = S.DL.map((r, i) => ({
    id: "DL-" + (1000 + i), functionId: r[0], title: r[1], base: dt(r[2]), cadence: r[3],
    lastDone: r[4] ? today : null, reason: ""
  }));
  const gaps = S.GP.map((r, i) => ({
    id: "GAP-" + (200 + i), code: "GAP-" + (200 + i), functionId: r[0], title: r[1],
    opened: dt(r[3]), status: r[4], note: r[5], closeNote: r[6],
    closed: r[4] === "Closed" ? dt(r[3] + 30) : null
  }));
  const flags = S.FLAGS.map((f, i) => ({
    id: "FLAG-" + (i + 1), functionId: f.functionId, reason: f.reason, byName: f.by, at: dt(f.at), open: true
  }));
  /* counsel of record by risk area, Helen Ambrose as the default */
  const counselPeople = [];
  const counsel = [];
  Object.entries(S.COUNSEL).forEach(([topic, p]) => {
    let person = people.find(x => x.email === p.e) || counselPeople.find(x => x.email === p.e);
    if (!person) {
      person = { id: "gc-" + p.e, name: p.n, title: p.t, unit: p.u, email: p.e, phone: p.ph, location: p.l, counselOnly: true };
      counselPeople.push(person);
    }
    counsel.push({ riskAreaId: topic, personId: person.id, isDefault: false });
  });
  counsel.push({ riskAreaId: null, personId: "ambrose", isDefault: true });
  return { riskAreas, domains, people, counselPeople, functions, ownership, deadlines, gaps, flags, counsel };
}

export function createSampleAdapter() {
  let raw = null;
  let seq = 1;
  const newId = p => p + "-NEW-" + (seq++);
  const nowDay = ctx => ctx.today;
  const find = (list, id) => raw[list].find(x => String(x.id) === String(id));

  /* the directory screen lists directory people only; counsel records exist
     for the Legal Questions card */
  const view = () => ({ ...raw, people: raw.people.concat(raw.counselPeople.filter(c => !raw.people.some(p => p.email === c.email))) });

  return {
    name: "sample",
    label: "Sample data",
    tables: ["riskAreas", "domains", "people", "functions", "ownership", "deadlines", "flags", "gaps", "counsel"],
    canLookupPeople: true,
    /* the roles the ownership editor offers (the Accountability Structure Role choices) */
    roles: ["Executive Owner", "Unit Owner", "Compliance Owner", "Support"],
    canSearchPeople: true,
    counselPerFunction: true,
    configured: true,

    async load(tables, ctx) {
      if (!raw) raw = sampleRaw(ctx && ctx.today);
      const v = view();
      const out = {};
      for (const k of tables || this.tables) out[k] = clone(v[k]);
      return out;
    },

    async searchPeople(q) {
      const words = (q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
      return S.AD_DIRECTORY.filter(p => words.every(w => (p.n + " " + p.e + " " + (p.netid || "")).toLowerCase().includes(w)))
        .map(p => ({ name: p.n, email: p.e, title: p.t, unit: p.u, phone: p.ph, location: p.l, netid: p.netid }));
    },

    async addFlag({ fn, reason }, ctx) {
      raw.flags.unshift({ id: newId("FLAG"), functionId: fn.id, reason, byId: ctx.me.id, byName: ctx.me.n, at: nowDay(ctx), open: true });
      return ["flags"];
    },
    async logGap({ fn, title, note }, ctx) {
      const id = newId("GAP");
      raw.gaps.unshift({ id, code: id, functionId: fn.id, title, note, status: "Open", opened: nowDay(ctx), closeNote: "" });
      return ["gaps"];
    },
    async completeDeadline({ dl, reason }, ctx) {
      Object.assign(find("deadlines", dl.id), { lastDone: nowDay(ctx), reason });
      return ["deadlines"];
    },
    async reverseDeadline({ dl }) {
      Object.assign(find("deadlines", dl.id), { lastDone: null, reason: "" });
      return ["deadlines"];
    },
    async resolveFlag({ flag }) { find("flags", flag.id).open = false; return ["flags"]; },
    async closeGap({ gap, note }, ctx) {
      Object.assign(find("gaps", gap.id), { status: "Closed", closeNote: note, closed: nowDay(ctx) });
      return ["gaps"];
    },
    async saveFunction({ draft, isNew }, ctx) {
      const row = {
        id: isNew ? newId("CF") : draft.id, code: isNew ? "" : draft.code, name: draft.name,
        riskAreaId: draft.topicId, domainId: draft.areaId, statute: draft.statute, citation: draft.citation,
        statuteUrl: draft.statuteUrl, description: draft.description, reporting: draft.reporting,
        deadline: draft.deadline, resourceLabel: draft.resourceLabel, resourceUrl: draft.resourceUrl,
        risk: draft.risk === "Unrated" ? "" : draft.risk
      };
      if (isNew) { row.code = row.id; raw.functions.push(row); }
      else Object.assign(find("functions", draft.id), row);
      return { id: row.id, reload: ["functions"] };
    },
    async deleteFunction({ fn }) {
      const keep = x => String(x.functionId) !== String(fn.id);
      raw.functions = raw.functions.filter(x => String(x.id) !== String(fn.id));
      raw.ownership = raw.ownership.filter(keep);
      raw.deadlines = raw.deadlines.filter(keep);
      raw.gaps = raw.gaps.filter(keep);
      raw.flags = raw.flags.filter(keep);
      return ["functions", "ownership", "deadlines", "gaps", "flags"];
    },
    async setOwnership({ fn, rows, existingRowIds }) {
      const drop = new Set(existingRowIds.map(String));
      raw.ownership = raw.ownership.filter(x => !drop.has(String(x.id)));
      rows.forEach(r => raw.ownership.push({ id: newId("OWN"), functionId: fn.id, personId: r.personId, role: r.role, sub: r.sub || "Primary" }));
      return ["ownership"];
    },
    async addPerson({ person }) {
      const id = newId("P");
      raw.people.push({ id, name: person.name, email: person.email, title: person.title, unit: person.unit, phone: person.phone, location: person.location, netid: person.netid });
      return { id, reload: ["people"] };
    },
    async updatePerson({ person }) {
      Object.assign(find("people", person.id), { name: person.name, email: person.email, title: person.title, unit: person.unit, phone: person.phone, location: person.location });
      return ["people"];
    },
    async deletePerson({ person, ownershipRowIds }) {
      const drop = new Set(ownershipRowIds.map(String));
      raw.ownership = raw.ownership.filter(x => !drop.has(String(x.id)));
      raw.people = raw.people.filter(x => String(x.id) !== String(person.id));
      return ["people", "ownership"];
    },
    async replacePerson({ to, ownershipRowIds, removeRowIds = [] }) {
      const ids = new Set(ownershipRowIds.map(String));
      const drop = new Set(removeRowIds.map(String));
      raw.ownership = raw.ownership.filter(x => !drop.has(String(x.id)));
      raw.ownership.forEach(x => { if (ids.has(String(x.id))) x.personId = to.id; });
      return ["ownership"];
    },
    async addRiskArea({ name }) { raw.riskAreas.push({ id: newId("RA"), name, color: "" }); return ["riskAreas"]; },
    async deleteRiskArea({ riskArea }) { raw.riskAreas = raw.riskAreas.filter(x => String(x.id) !== String(riskArea.id)); return ["riskAreas"]; },
    async addDomain({ name, riskAreaId }) { raw.domains.push({ id: newId("DM"), name, riskAreaId }); return ["domains"]; },
    async deleteDomain({ domain }) { raw.domains = raw.domains.filter(x => String(x.id) !== String(domain.id)); return ["domains"]; }
  };
}
