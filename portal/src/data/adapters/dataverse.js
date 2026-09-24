/* Dataverse backend, through the Power Pages Web API (/_api).

   Tables and choice codes are this repository's solution
   (solution/schema/dataverse-schema.yaml). Entity set names follow the
   solution builder, which sets EntitySetName to logical name + "s"
   (tools/build_solution.py); override `sets` in the site setting
   ComplianceMatrix/Dataverse/EntitySets if an environment differs.

   Security is Dataverse's: every call below is checked against the table
   permissions of the signed-in contact's web roles. The screens hide what a
   role cannot do, but the table permissions are what stop it. */

import { webApi, webApiAll } from "../transport.js";
import { toDay, isoDate } from "../../lib/dates.js";

export const DEFAULT_SETS = {
  su_riskarea: "su_riskareas",
  su_domain: "su_domains",
  su_compliancedirectory: "su_compliancedirectorys",
  su_compliancefunction: "su_compliancefunctions",
  su_functionownership: "su_functionownerships",
  su_compliancedeadline: "su_compliancedeadlines",
  su_compliancegap: "su_compliancegaps",
  su_functionflag: "su_functionflags",
  su_counselassignment: "su_counselassignments"
};

/* choice codes from dataverse-schema.yaml */
export const RISK = { 100000001: "High", 100000002: "Moderate", 100000003: "Low" };
export const CADENCE = { 100000010: "Annually", 100000011: "Semiannual", 100000012: "Quarterly", 100000013: "Monthly", 100000014: "Biennial", 100000015: "Ongoing", 100000016: "One-time" };
export const GAP_STATUS = { 100000020: "Open", 100000022: "In Progress", 100000021: "Closed" };
export const ROLE = { 100000030: "Executive Owner", 100000031: "Unit Owner", 100000032: "Compliance Owner" };
export const SUB = { 100000040: "Primary", 100000041: "Advisory", 100000042: "Support" };
const FLAG_ACTIVE = 100000050, FLAG_CLEARED = 100000051, FLAG_MANUAL = 100000110;
const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, Number(k)]));
const RISK_CODE = invert(RISK), ROLE_CODE = invert(ROLE), SUB_CODE = invert(SUB);
const GAP_OPEN = 100000020, GAP_CLOSED = 100000021;

const TABLE_OF = {
  riskAreas: "su_riskarea", domains: "su_domain", people: "su_compliancedirectory",
  functions: "su_compliancefunction", ownership: "su_functionownership",
  deadlines: "su_compliancedeadline", gaps: "su_compliancegap", flags: "su_functionflag",
  counsel: "su_counselassignment"
};

const SELECT = {
  su_riskarea: "su_riskareaid,su_name,su_colorhex,su_sortorder",
  su_domain: "su_domainid,su_name,_su_riskarea_value",
  su_compliancedirectory: "su_compliancedirectoryid,su_name,su_email,su_jobtitle,su_unit,su_phone,su_location,su_netid,su_active",
  su_compliancefunction: "su_compliancefunctionid,su_name,su_functioncode,_su_riskarea_value,_su_domain_value,su_statute,su_citation,su_statuteurl,su_description,su_reporting,su_deadlinenarrative,su_resourcelabel,su_resourceurl,su_risk,su_lastreviewed,_su_executiveowner_value,_su_unitowner_value,_su_complianceowner_value",
  su_functionownership: "su_functionownershipid,_su_function_value,_su_person_value,su_role,su_subrole",
  su_compliancedeadline: "su_compliancedeadlineid,su_name,_su_function_value,su_duedate,su_cadence,su_complete,su_completeddate,su_notes",
  su_compliancegap: "su_compliancegapid,su_name,su_gapcode,_su_function_value,su_severity,su_status,su_openeddate,su_closeddate,su_targetquarter,su_targetfy,su_note,su_closenote,_su_owner_value",
  su_functionflag: "su_functionflagid,_su_function_value,su_reason,su_status,_su_flaggedby_value,su_flaggedon",
  su_counselassignment: "su_counselassignmentid,_su_riskarea_value,_su_attorney_value,su_isdefault"
};

export function mapTables(t) {
  const out = {};
  if (t.riskAreas) out.riskAreas = t.riskAreas.map(r => ({ id: r.su_riskareaid, name: r.su_name, color: r.su_colorhex || "" }));
  if (t.domains) out.domains = t.domains.map(r => ({ id: r.su_domainid, name: r.su_name, riskAreaId: r._su_riskarea_value || null }));
  if (t.people) out.people = t.people.filter(r => r.su_active !== false).map(r => ({
    id: r.su_compliancedirectoryid, name: r.su_name, email: r.su_email || "", title: r.su_jobtitle || "",
    unit: r.su_unit || "", phone: r.su_phone || "", location: r.su_location || "", netid: r.su_netid || ""
  }));
  if (t.functions) out.functions = t.functions.map(r => ({
    id: r.su_compliancefunctionid, code: r.su_functioncode || "", name: r.su_name,
    riskAreaId: r._su_riskarea_value || null, domainId: r._su_domain_value || null,
    statute: r.su_statute, citation: r.su_citation, statuteUrl: r.su_statuteurl,
    description: r.su_description, reporting: r.su_reporting, deadline: r.su_deadlinenarrative,
    resourceLabel: r.su_resourcelabel, resourceUrl: r.su_resourceurl,
    risk: RISK[r.su_risk] || "", lastReviewed: toDay(r.su_lastreviewed),
    fixedOwners: { exec: r._su_executiveowner_value, unit: r._su_unitowner_value, compliance: r._su_complianceowner_value }
  }));
  if (t.ownership) out.ownership = t.ownership.map(r => ({
    id: r.su_functionownershipid, functionId: r._su_function_value, personId: r._su_person_value,
    role: ROLE[r.su_role] || "", sub: SUB[r.su_subrole] || "Primary"
  }));
  if (t.deadlines) out.deadlines = t.deadlines.map(r => ({
    id: r.su_compliancedeadlineid, functionId: r._su_function_value, title: r.su_name,
    base: toDay(r.su_duedate), cadence: CADENCE[r.su_cadence] || "",
    /* a one-off marked complete keeps showing as complete; a recurring row
       rolls forward from its last completion like the SharePoint lists do */
    lastDone: toDay(r.su_completeddate) || (r.su_complete ? toDay(r.su_duedate) : null),
    reason: r.su_notes || ""
  }));
  if (t.gaps) out.gaps = t.gaps.map(r => ({
    id: r.su_compliancegapid, code: r.su_gapcode || "", functionId: r._su_function_value,
    title: r.su_name, status: GAP_STATUS[r.su_status] || "Open", severity: RISK[r.su_severity] || "",
    note: r.su_note || "", closeNote: r.su_closenote || "", responsibleId: r._su_owner_value || null,
    opened: toDay(r.su_openeddate), closed: toDay(r.su_closeddate),
    targetQuarter: r.su_targetquarter || "", targetFY: r.su_targetfy || ""
  }));
  if (t.flags) out.flags = t.flags.map(r => ({
    id: r.su_functionflagid, functionId: r._su_function_value, reason: r.su_reason || "",
    byId: r._su_flaggedby_value || null, at: toDay(r.su_flaggedon), open: r.su_status !== FLAG_CLEARED
  }));
  if (t.counsel) out.counsel = t.counsel.map(r => ({
    riskAreaId: r._su_riskarea_value || null, personId: r._su_attorney_value, isDefault: !!r.su_isdefault
  }));
  return out;
}

export function createDataverseAdapter(cfg) {
  const sets = { ...DEFAULT_SETS, ...(cfg.dataverseSets || {}) };
  const set = table => sets[table];
  const ref = (table, id) => `/${set(table)}(${id})`;
  const bind = (nav, table, id) => (id ? { [nav + "@odata.bind"]: ref(table, id) } : {});
  const post = (table, body) => webApi("POST", "/_api/" + set(table), body);
  const patch = (table, id, body) => webApi("PATCH", `/_api/${set(table)}(${id})`, body);
  const del = (table, id) => webApi("DELETE", `/_api/${set(table)}(${id})`);
  /* the Web API clears a lookup by deleting its reference, not by PATCHing null */
  const unbind = (table, id, nav) => webApi("DELETE", `/_api/${set(table)}(${id})/${nav}/$ref`).catch(() => null);
  const me = ctx => ctx.me || {};
  const stamp = (ctx, text) => `[${isoDate(ctx.today)} ${me(ctx).n || "Unknown"}] ${text}`;

  return {
    name: "dataverse",
    label: "Dataverse",
    tables: ["riskAreas", "domains", "people", "functions", "ownership", "deadlines", "flags", "gaps", "counsel"],
    canLookupPeople: false,
    /* counsel is assigned per risk area in su_counselassignment */
    /* the roles the ownership editor offers (the Accountability Structure Role choices) */
    roles: ["Executive Owner", "Unit Owner", "Compliance Owner"],
    canSearchPeople: false,
    counselPerFunction: false,
    configured: true,

    async load(tables) {
      const keys = tables || this.tables;
      const got = await Promise.all(keys.map(async k => {
        const table = TABLE_OF[k];
        try {
          return [k, await webApiAll(`/_api/${set(table)}?$select=${SELECT[table]}`)];
        } catch (e) {
          // counsel assignments are optional; everything else must load
          if (k === "counsel") return [k, []];
          throw e;
        }
      }));
      return mapTables(Object.fromEntries(got));
    },

    async addFlag({ fn, reason }, ctx) {
      await post("su_functionflag", {
        su_name: fn.name.slice(0, 380), su_reason: reason, su_status: FLAG_ACTIVE, su_source: FLAG_MANUAL,
        su_flaggedon: isoDate(ctx.today),
        ...bind("su_function", "su_compliancefunction", fn.id),
        ...bind("su_flaggedby", "su_compliancedirectory", me(ctx).id)
      });
      return ["flags"];
    },

    async logGap({ fn, title, note, severity }, ctx) {
      await post("su_compliancegap", {
        su_name: title.slice(0, 400), su_note: note || "", su_status: GAP_OPEN,
        su_openeddate: isoDate(ctx.today),
        ...(RISK_CODE[severity || fn.risk] ? { su_severity: RISK_CODE[severity || fn.risk] } : {}),
        ...bind("su_function", "su_compliancefunction", fn.id),
        ...bind("su_owner", "su_compliancedirectory", fn.owner && fn.owner.id)
      });
      return ["gaps"];
    },

    /* No completed-reason column in the Dataverse schema: the reason is
       appended to Deadline Notes with a date and name, so nothing is lost. */
    async completeDeadline({ dl, reason }, ctx) {
      await patch("su_compliancedeadline", dl.id, {
        su_completeddate: isoDate(ctx.today),
        su_notes: [stamp(ctx, "Completed: " + reason), dl.reason].filter(Boolean).join("\n").slice(0, 2000)
      });
      return ["deadlines"];
    },
    async reverseDeadline({ dl, reason }, ctx) {
      await patch("su_compliancedeadline", dl.id, {
        su_completeddate: null, su_complete: false,
        su_notes: [stamp(ctx, "Completion reversed: " + reason), dl.reason].filter(Boolean).join("\n").slice(0, 2000)
      });
      return ["deadlines"];
    },

    async resolveFlag({ flag }, ctx) {
      await patch("su_functionflag", flag.id, {
        su_status: FLAG_CLEARED, su_clearedon: isoDate(ctx.today),
        ...bind("su_clearedby", "su_compliancedirectory", me(ctx).id)
      });
      return ["flags"];
    },

    async closeGap({ gap, note }, ctx) {
      await patch("su_compliancegap", gap.id, {
        su_status: GAP_CLOSED, su_closeddate: isoDate(ctx.today), su_closenote: note || null,
        ...bind("su_closedby", "su_compliancedirectory", me(ctx).id)
      });
      return ["gaps"];
    },

    async saveFunction({ draft, isNew }) {
      const body = {
        su_name: draft.name, su_statute: draft.statute || "", su_citation: draft.citation || "",
        su_statuteurl: draft.statuteUrl || "", su_description: draft.description || "",
        su_reporting: draft.reporting || "", su_deadlinenarrative: draft.deadline || "",
        su_resourcelabel: draft.resourceLabel || "", su_resourceurl: draft.resourceUrl || "",
        su_risk: RISK_CODE[draft.risk] || null,
        ...bind("su_riskarea", "su_riskarea", draft.topicId),
        ...bind("su_domain", "su_domain", draft.areaId)
      };
      if (isNew) {
        const r = await post("su_compliancefunction", body);
        return { id: r.id, reload: ["functions"] };
      }
      await patch("su_compliancefunction", draft.id, body);
      if (!draft.topicId) await unbind("su_compliancefunction", draft.id, "su_riskarea");
      if (!draft.areaId) await unbind("su_compliancefunction", draft.id, "su_domain");
      return { id: draft.id, reload: ["functions"] };
    },

    /* Deadlines, gaps, ownership and flags cascade-delete with the function
       (relationship cascade in the schema), so one delete removes the lot. */
    async deleteFunction({ fn }) {
      await del("su_compliancefunction", fn.id);
      return ["functions", "ownership", "deadlines", "gaps", "flags"];
    },

    async setOwnership({ fn, rows, existingRowIds }) {
      for (const x of existingRowIds) await del("su_functionownership", x);
      const chainRows = rows.filter(r => ROLE_CODE[r.role]);
      for (const r of chainRows) {
        await post("su_functionownership", {
          su_name: `${fn.name} | ${r.name} | ${r.role}`.slice(0, 400),
          su_role: ROLE_CODE[r.role], su_subrole: SUB_CODE[r.sub] || SUB_CODE.Primary,
          ...bind("su_function", "su_compliancefunction", fn.id),
          ...bind("su_person", "su_compliancedirectory", r.personId)
        });
      }
      /* keep the three fixed lookups pointing at each role's Primary, which is
         what the list views and the reminder flow read */
      const primary = role => {
        const list = chainRows.filter(r => r.role === role);
        return (list.find(r => r.sub === "Primary") || list[0] || {}).personId;
      };
      const fixed = [["su_executiveowner", "Executive Owner"], ["su_unitowner", "Unit Owner"], ["su_complianceowner", "Compliance Owner"]];
      const body = {};
      for (const [nav, role] of fixed) Object.assign(body, bind(nav, "su_compliancedirectory", primary(role)));
      if (Object.keys(body).length) await patch("su_compliancefunction", fn.id, body);
      for (const [nav, role] of fixed) if (!primary(role)) await unbind("su_compliancefunction", fn.id, nav);
      return ["ownership", "functions"];
    },

    async addPerson({ person }) {
      const r = await post("su_compliancedirectory", {
        su_name: person.name, su_email: person.email, su_jobtitle: person.title || "", su_unit: person.unit || "",
        su_phone: person.phone || "", su_location: person.location || "", su_active: true
      });
      return { id: r.id, reload: ["people"] };
    },
    async updatePerson({ person }) {
      await patch("su_compliancedirectory", person.id, {
        su_name: person.name, su_email: person.email, su_jobtitle: person.title || "", su_unit: person.unit || "",
        su_phone: person.phone || "", su_location: person.location || ""
      });
      return ["people"];
    },
    /* Directory rows are deactivated, not deleted: the leaver rule in the
       schema, and every closed gap and cleared flag still points at them. */
    async deletePerson({ person, ownershipRowIds }) {
      for (const x of ownershipRowIds) await del("su_functionownership", x);
      await patch("su_compliancedirectory", person.id, { su_active: false });
      return ["people", "ownership"];
    },
    async replacePerson({ to, ownershipRowIds, removeRowIds = [] }) {
      for (const x of ownershipRowIds) await patch("su_functionownership", x, bind("su_person", "su_compliancedirectory", to.id));
      for (const x of removeRowIds) await del("su_functionownership", x);
      return ["ownership"];
    },

    async addRiskArea({ name }) { await post("su_riskarea", { su_name: name }); return ["riskAreas"]; },
    async deleteRiskArea({ riskArea }) { await del("su_riskarea", riskArea.id); return ["riskAreas", "domains", "functions"]; },
    async addDomain({ name, riskAreaId }) {
      await post("su_domain", { su_name: name, ...bind("su_riskarea", "su_riskarea", riskAreaId) });
      return ["domains"];
    },
    async deleteDomain({ domain }) { await del("su_domain", domain.id); return ["domains", "functions"]; }
  };
}
