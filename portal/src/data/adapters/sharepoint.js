/* SharePoint lists backend, reached through Power Automate.

   A Power Pages page cannot call SharePoint itself: the Power Pages Web API
   only speaks Dataverse, and the browser will not send the SharePoint session
   cross-origin. The supported bridge is a cloud flow that starts with "When
   Power Pages calls a flow". Three flows do everything (docs/SHAREPOINT-FLOWS.md):

     read         one list per call, REST items, allow-listed list names
     write        signed-in users: raise a flag, log a gap, complete/reverse
                  a deadline (and the Archive row that goes with it)
     adminWrite   administrators: every create/update/delete the app makes

   Column names below are the SharePoint *internal* names of the Compliance
   Matrix 2.0 lists (sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix),
   read from the canvas app's own data source metadata. The lists were created
   by import, so most columns are field_N. If a list is rebuilt, fix the name
   here and nowhere else. */

import { callFlow, flowUrl } from "../transport.js";
import { toDay } from "../../lib/dates.js";

export const LISTS = {
  riskAreas: "Risk Areas",
  domains: "Domains",
  people: "Compliance Directory",
  functions: "Compliance Functions",
  ownership: "Accountability Structure",
  deadlines: "Deadlines",
  flags: "Flags List",
  gaps: "Gap List",
  archive: "Archive"
};

export const F = {
  riskArea: { color: "field_1" },
  person: { email: "field_1" },
  fn: {
    riskArea: "RiskAreaId", domain: "DomainId",
    statute: "field_3", citation: "field_4", statuteUrl: "field_5", description: "field_6",
    reporting: "field_7", deadline: "field_8", resourceLabel: "field_9", resourceUrl: "field_10",
    risk: "field_11", lastAssessed: "LastAssessedDate", nextDue: "NextDueDate"
  },
  own: { person: "PersonId", fn: "FunctionId", role: "field_3", sub: "field_4" },
  dl: {
    fn: "FunctionId", due: "field_1", cadence: "field_2", narrative: "field_3",
    lastDone: "field_4", reason: "field_5", byName: "field_6", at: "field_7", by: "CompletedById"
  },
  flag: { fn: "FunctionId", by: "FlaggedById", created: "field_4", text: "field_1", source: "field_2", done: "field_3", email: "RespondentEmail" },
  gap: {
    code: "field_1", status: "field_2", source: "field_3", measure: "field_6", unit: "field_7",
    quarter: "field_9", fy: "field_10", assessed: "field_11", closed: "field_13", closeNote: "field_14",
    fn: "FunctionId", responsible: "ResponsiblePersonId", closedBy: "ClosedById"
  },
  archive: {
    recordType: "field_1", eventType: "field_2", functionName: "field_3", functionId: "field_4",
    resolvedBy: "field_5", resolvedAt: "field_6", sourceItem: "field_7", reason: "field_8",
    flaggedBy: "field_11", flaggedDate: "field_12", flagSource: "field_13"
  }
};

/* Hyperlink columns come back from REST as {Url, Description} and must be
   written as SP.FieldUrlValue. */
const HYPERLINK = new Set([F.fn.statuteUrl, F.fn.resourceUrl]);

/* ---- reading helpers: REST returns choices as strings (or arrays for
   multi-choice), lookups as <Name>Id, hyperlinks as objects ---- */
const str = v => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  if (typeof v === "object") {
    if (Array.isArray(v.results)) return v.results.map(str).filter(Boolean).join(", ");
    return String(v.Url || v.Value || v.Title || "");
  }
  return String(v);
};
const id = v => (v === null || v === undefined || v === "" ? null : (typeof v === "object" ? v.Id ?? null : v));
const bool = v => v === true || v === "true" || v === 1 || v === "1" || v === "Yes";

export function mapLists(t) {
  const out = {};
  if (t.riskAreas) out.riskAreas = t.riskAreas.map(r => ({ id: r.Id ?? r.ID, name: str(r.Title), color: str(r[F.riskArea.color]) }));
  if (t.domains) out.domains = t.domains.map(r => ({ id: r.Id ?? r.ID, name: str(r.Title), riskAreaId: id(r.RiskAreaId) }));
  if (t.people) out.people = t.people.map(r => ({ id: r.Id ?? r.ID, name: str(r.Title), email: str(r[F.person.email]) }));
  if (t.functions) out.functions = t.functions.map(r => ({
    id: r.Id ?? r.ID,
    code: "#" + (r.Id ?? r.ID),
    name: str(r.Title),
    riskAreaId: id(r[F.fn.riskArea]),
    domainId: id(r[F.fn.domain]),
    statute: str(r[F.fn.statute]),
    citation: str(r[F.fn.citation]),
    statuteUrl: str(r[F.fn.statuteUrl]),
    description: str(r[F.fn.description]),
    reporting: str(r[F.fn.reporting]),
    deadline: str(r[F.fn.deadline]),
    resourceLabel: str(r[F.fn.resourceLabel]),
    resourceUrl: str(r[F.fn.resourceUrl]),
    risk: str(r[F.fn.risk]),
    lastReviewed: toDay(r[F.fn.lastAssessed])
  }));
  if (t.ownership) out.ownership = t.ownership.map(r => ({
    id: r.Id ?? r.ID, functionId: id(r[F.own.fn]), personId: id(r[F.own.person]),
    role: str(r[F.own.role]), sub: str(r[F.own.sub]) || "Primary"
  }));
  if (t.deadlines) out.deadlines = t.deadlines.map(r => ({
    id: r.Id ?? r.ID, functionId: id(r[F.dl.fn]), title: str(r.Title),
    base: toDay(r[F.dl.due]), cadence: str(r[F.dl.cadence]),
    lastDone: toDay(r[F.dl.lastDone]), reason: str(r[F.dl.reason])
  }));
  if (t.flags) out.flags = t.flags.map(r => ({
    id: r.Id ?? r.ID, functionId: id(r[F.flag.fn]), reason: str(r[F.flag.text]),
    byId: id(r[F.flag.by]), byEmail: str(r[F.flag.email]),
    at: toDay(r[F.flag.created] || r.Created), open: !bool(r[F.flag.done])
  }));
  if (t.gaps) out.gaps = t.gaps.map(r => ({
    id: r.Id ?? r.ID, code: str(r[F.gap.code]) || ("GAP-" + (r.Id ?? r.ID)),
    functionId: id(r[F.gap.fn]), title: str(r.Title), status: str(r[F.gap.status]) || "Open",
    source: str(r[F.gap.source]), note: str(r[F.gap.measure]), closeNote: str(r[F.gap.closeNote]),
    unit: str(r[F.gap.unit]), responsibleId: id(r[F.gap.responsible]),
    opened: toDay(r[F.gap.assessed] || r.Created), closed: toDay(r[F.gap.closed]),
    targetQuarter: str(r[F.gap.quarter]), targetFY: str(r[F.gap.fy])
  }));
  out.counsel = [];
  return out;
}

/* ---- writing helpers ---- */
const url = v => (v ? { __metadata: { type: "SP.FieldUrlValue" }, Url: v, Description: v } : null);
const nowIso = () => new Date().toISOString();
const dayIso = d => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)).toISOString() : null);

function fnFields(d) {
  const x = {
    Title: d.name,
    [F.fn.riskArea]: d.topicId ?? null,
    [F.fn.domain]: d.areaId ?? null,
    [F.fn.statute]: d.statute || "",
    [F.fn.citation]: d.citation || "",
    [F.fn.description]: d.description || "",
    [F.fn.reporting]: d.reporting || "",
    [F.fn.deadline]: d.deadline || "",
    [F.fn.resourceLabel]: d.resourceLabel || "",
    [F.fn.risk]: d.risk && d.risk !== "Unrated" ? d.risk : null
  };
  for (const [k, v] of [[F.fn.statuteUrl, d.statuteUrl], [F.fn.resourceUrl, d.resourceUrl]]) x[k] = HYPERLINK.has(k) ? url(v) : (v || "");
  return x;
}

const archive = (a) => ({
  op: "create", list: LISTS.archive,
  fields: {
    Title: a.title,
    [F.archive.recordType]: a.recordType,
    [F.archive.eventType]: a.eventType,
    [F.archive.functionName]: a.functionName || "",
    [F.archive.functionId]: a.functionId ?? null,
    [F.archive.resolvedBy]: a.by || "",
    [F.archive.resolvedAt]: nowIso(),
    [F.archive.reason]: a.reason || "",
    ...(a.extra || {})
  }
});

export function createSharePointAdapter(cfg) {
  const readUrl = flowUrl(cfg.flows.read);
  const writeUrl = flowUrl(cfg.flows.write);
  const adminUrl = flowUrl(cfg.flows.adminWrite);
  const findUrl = flowUrl(cfg.flows.findPerson);

  async function readList(key) {
    const list = LISTS[key];
    const items = [];
    let next = "";
    for (let page = 0; page < 50; page++) {
      const res = await callFlow(readUrl, { list, next });
      items.push(...(res.items || res.value || (Array.isArray(res) ? res : [])));
      next = res.next || "";
      if (!next) break;
    }
    return items;
  }

  /* Ops run in order in one flow run. Administrators always go through the
     admin flow; everyone else through the member flow, which accepts only its
     own short allow-list. */
  async function write(ops, admin) {
    const u = admin ? adminUrl : writeUrl;
    const res = await callFlow(u, { ops });
    return (res && res.results) || [];
  }

  const me = ctx => ctx.me || {};

  return {
    name: "sharepoint",
    label: "SharePoint lists",
    tables: ["riskAreas", "domains", "people", "functions", "ownership", "deadlines", "flags", "gaps"],
    canLookupPeople: !!findUrl,
    /* General Counsel is a role on each function's Accountability Structure */
    /* the roles the ownership editor offers (the Accountability Structure Role choices) */
    roles: ["Executive Owner", "Unit Owner", "Compliance Owner", "Support"],
    canSearchPeople: !!findUrl,
    counselPerFunction: true,
    configured: !!readUrl,

    async load(tables) {
      const keys = tables || this.tables;
      const got = await Promise.all(keys.map(k => readList(k).then(rows => [k, rows])));
      return mapLists(Object.fromEntries(got));
    },

    /* null when no find-person flow is configured, so the page falls back
       to entering a name and email by hand */
    async searchPeople(q) {
      if (!findUrl) return null;
      const res = await callFlow(findUrl, { q });
      return (res.users || res.value || []).map(u => ({
        name: u.displayName || u.DisplayName || "",
        email: u.mail || u.Mail || "",
        title: u.jobTitle || u.JobTitle || "",
        unit: u.department || u.Department || "",
        phone: (u.businessPhones && u.businessPhones[0]) || u.TelephoneNumber || "",
        location: u.officeLocation || u.OfficeLocation || ""
      }));
    },

    /* ---------------- member actions ---------------- */
    async addFlag({ fn, reason }, ctx) {
      const m = me(ctx);
      await write([{
        op: "create", list: LISTS.flags, fields: {
          Title: fn.name, [F.flag.fn]: fn.id, [F.flag.text]: reason,
          [F.flag.by]: m.id ?? null, [F.flag.email]: m.e || "", [F.flag.source]: "Manual",
          [F.flag.done]: false, [F.flag.created]: nowIso()
        }
      }], ctx.admin);
      return ["flags"];
    },

    async logGap({ fn, title, note }, ctx) {
      await write([{
        op: "create", list: LISTS.gaps, fields: {
          Title: title, [F.gap.fn]: fn.id, [F.gap.measure]: note || "",
          [F.gap.status]: "Open", [F.gap.source]: "Manual", [F.gap.assessed]: nowIso()
        }
      }], ctx.admin);
      return ["gaps"];
    },

    async completeDeadline({ dl, fn, reason }, ctx) {
      const by = me(ctx).n || "";
      await write([
        { op: "update", list: LISTS.deadlines, id: dl.id, fields: {
          [F.dl.lastDone]: dayIso(ctx.today), [F.dl.at]: nowIso(), [F.dl.reason]: reason, [F.dl.byName]: by } },
        archive({ title: "Deadline Completed - " + fn.name, recordType: "Deadline Completion", eventType: "Completed",
          functionId: fn.id, functionName: fn.name, by, reason })
      ], ctx.admin);
      return ["deadlines"];
    },

    async reverseDeadline({ dl, fn, reason }, ctx) {
      const by = me(ctx).n || "";
      await write([
        { op: "update", list: LISTS.deadlines, id: dl.id, fields: {
          [F.dl.lastDone]: null, [F.dl.at]: null, [F.dl.reason]: null, [F.dl.byName]: null } },
        archive({ title: "Deadline Reversed - " + fn.name, recordType: "Deadline Completion", eventType: "Reversed",
          functionId: fn.id, functionName: fn.name, by, reason })
      ], ctx.admin);
      return ["deadlines"];
    },

    /* ---------------- administrator actions ---------------- */
    async resolveFlag({ flag, fn }, ctx) {
      await write([
        { op: "update", list: LISTS.flags, id: flag.id, fields: { [F.flag.done]: true } },
        archive({ title: "Flag Resolved - " + fn.name, recordType: "Flag Resolution", eventType: "Resolved",
          functionId: fn.id, functionName: fn.name, by: me(ctx).n, reason: flag.reason,
          extra: { [F.archive.sourceItem]: flag.id, [F.archive.flaggedBy]: flag.by,
            [F.archive.flaggedDate]: flag.at ? flag.at.toISOString() : null, [F.archive.flagSource]: "Manual" } })
      ], true);
      return ["flags"];
    },

    /* owners close gaps on their own functions too, through the member flow,
       which rebuilds a Gap List update as a closure and nothing else */
    async closeGap({ gap, note }, ctx) {
      await write([{ op: "update", list: LISTS.gaps, id: gap.id, fields: {
        [F.gap.status]: "Closed", [F.gap.closed]: nowIso(), [F.gap.closeNote]: note || null,
        [F.gap.closedBy]: me(ctx).id ?? null } }], ctx.admin);
      return ["gaps"];
    },

    async saveFunction({ draft, isNew }) {
      if (isNew) {
        const r = await write([{ op: "create", list: LISTS.functions, fields: fnFields(draft) }], true);
        return { id: r[0] && r[0].id, reload: ["functions"] };
      }
      await write([{ op: "update", list: LISTS.functions, id: draft.id, fields: fnFields(draft) }], true);
      return { id: draft.id, reload: ["functions"] };
    },

    /* Same as the canvas app: an Archive copy of every gap, deadline, flag
       and ownership row, then of the function, and only then the deletes.
       related: {gaps, deadlines, flags, ownership}, each [{id, reason}]. */
    async deleteFunction({ fn, related }, ctx) {
      const copy = (x, reason) => archive({ title: "Function Deleted - " + fn.name, recordType: "Function Deleted", eventType: "Deleted",
        functionId: fn.id, functionName: fn.name, by: me(ctx).n, reason, extra: { [F.archive.sourceItem]: x } });
      const kinds = ["gaps", "deadlines", "flags", "ownership"];
      const ops = [
        ...kinds.flatMap(k => related[k].map(x => copy(x.id, x.reason))),
        copy(fn.id, "Function record deleted"),
        ...related.gaps.map(x => ({ op: "delete", list: LISTS.gaps, id: x.id })),
        ...related.deadlines.map(x => ({ op: "delete", list: LISTS.deadlines, id: x.id })),
        ...related.flags.map(x => ({ op: "delete", list: LISTS.flags, id: x.id })),
        ...related.ownership.map(x => ({ op: "delete", list: LISTS.ownership, id: x.id })),
        { op: "delete", list: LISTS.functions, id: fn.id }
      ];
      await write(ops, true);
      return ["functions", "ownership", "deadlines", "gaps", "flags"];
    },

    /* rows: [{personId, name, role, sub}] - replaces the function's whole
       chain, which is how the canvas app saves ownership edits. */
    async setOwnership({ fn, rows, existingRowIds }) {
      const ops = [
        ...existingRowIds.map(x => ({ op: "delete", list: LISTS.ownership, id: x })),
        ...rows.map(r => ({ op: "create", list: LISTS.ownership, fields: {
          Title: `${fn.id} | ${r.name} | ${r.role}`, [F.own.fn]: fn.id, [F.own.person]: r.personId,
          [F.own.role]: r.role, [F.own.sub]: r.role === "General Counsel" ? null : (r.sub || "Primary") } }))
      ];
      await write(ops, true);
      return ["ownership"];
    },

    async addPerson({ person }) {
      const r = await write([{ op: "create", list: LISTS.people, fields: { Title: person.name, [F.person.email]: person.email } }], true);
      return { id: r[0] && r[0].id, reload: ["people"] };
    },
    async updatePerson({ person }) {
      await write([{ op: "update", list: LISTS.people, id: person.id, fields: { Title: person.name, [F.person.email]: person.email } }], true);
      return ["people"];
    },
    async deletePerson({ person, ownershipRowIds }) {
      await write([
        ...ownershipRowIds.map(x => ({ op: "delete", list: LISTS.ownership, id: x })),
        { op: "delete", list: LISTS.people, id: person.id }
      ], true);
      return ["people", "ownership"];
    },
    async replacePerson({ to, ownershipRowIds, removeRowIds = [] }) {
      await write([
        ...ownershipRowIds.map(x => ({ op: "update", list: LISTS.ownership, id: x, fields: { [F.own.person]: to.id } })),
        ...removeRowIds.map(x => ({ op: "delete", list: LISTS.ownership, id: x }))
      ], true);
      return ["ownership"];
    },

    async addRiskArea({ name }) {
      await write([{ op: "create", list: LISTS.riskAreas, fields: { Title: name } }], true);
      return ["riskAreas"];
    },
    async deleteRiskArea({ riskArea }) {
      await write([{ op: "delete", list: LISTS.riskAreas, id: riskArea.id }], true);
      return ["riskAreas", "functions"];
    },
    async addDomain({ name, riskAreaId }) {
      await write([{ op: "create", list: LISTS.domains, fields: { Title: name, RiskAreaId: riskAreaId } }], true);
      return ["domains"];
    },
    async deleteDomain({ domain }) {
      await write([{ op: "delete", list: LISTS.domains, id: domain.id }], true);
      return ["domains", "functions"];
    }
  };
}
