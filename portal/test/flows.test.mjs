/* The solution's link flows, run as generated (flow-runner.mjs), against the
   fixtures: who gets linked, who the compliance office is told about, and
   who is left alone. docs/DATAVERSE-MIGRATION.md, section 6. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFlows, runFlow, parseExpression, expressionsIn, dataverseConnector, usersConnector, outlookConnector } from "./flow-runner.mjs";
import { dataverseTables, DV_IDS as G } from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HERE, "dv-schema.json"), "utf8"));
const FLOWS = loadFlows();
const PROVIDER = "https://sts.windows.net/4278a402-1a9e-4eb9-8414-ffb55a5fcf1e/";
const REL = "powerpagecomponent_mspp_webrole_contact";
const OID = n => "aaaaaaaa-0000-4000-8000-" + String(n).padStart(12, "0");

/* Entra accounts: object ID, UPN (NetID style), mail */
const ENTRA = [
  { id: OID(1), displayName: "Dwight Ferrell", userPrincipalName: "dferrell@syr.edu", mail: "dwight.ferrell@syr.edu", accountEnabled: true, userType: "Member" },
  { id: OID(2), displayName: "Andrea Whitaker", userPrincipalName: "awhitaker@syr.edu", mail: null, accountEnabled: true, userType: "Member" },
  { id: OID(3), displayName: "Grace Whitfield", userPrincipalName: "gwhitfield@syr.edu", mail: "awhitaker@syr.edu", accountEnabled: true, userType: "Member" },
  { id: OID(4), displayName: "A Guest", userPrincipalName: "guest_gmail.com#EXT#@syr.onmicrosoft.com", mail: "gwhitfield@syr.edu", accountEnabled: true, userType: "Guest" },
  { id: OID(5), displayName: "Not In Directory", userPrincipalName: "nobody@syr.edu", mail: null, accountEnabled: true, userType: "Member" }
];

function world() {
  const dv = dataverseTables();
  /* nobody is linked yet, as on a new site */
  dv.su_compliancedirectorys.forEach(p => { p._su_contact_value = null; });
  dv.adx_externalidentities = [];
  const outlook = outlookConnector();
  const env = {
    dv, outlook,
    dataverse: dataverseConnector({ dv, schema: SCHEMA, contacts: [], roleRelationship: REL }),
    users: usersConnector(ENTRA)
  };
  env.signIn = (contact, username, provider = PROVIDER) => {
    const row = { adx_externalidentityid: "bbbbbbbb-0000-4000-8000-" + contact.slice(-12), adx_username: username,
      adx_identityprovidername: provider, _adx_contactid_value: contact };
    dv.adx_externalidentities.push(row);
    dv.contacts.push({ contactid: contact, fullname: "Contact " + contact.slice(-3) });
    return row;
  };
  env.person = id => dv.su_compliancedirectorys.find(p => p.su_compliancedirectoryid === id);
  return env;
}
const added = (env, row) => runFlow(FLOWS["CM - Link directory to contact"], { trigger: { body: row }, ...env });

test("every expression in every generated flow parses, with only modelled functions", () => {
  let n = 0;
  for (const def of Object.values(FLOWS)) for (const e of expressionsIn(def.properties.definition)) { parseExpression(e); n++; }
  assert.equal(Object.keys(FLOWS).length, 5);
  assert.ok(n > 150, "found " + n);
});

test("a new sign-in is linked to the directory row with its UPN", () => {
  const env = world();
  const r = added(env, env.signIn(G(903), OID(1)));
  assert.equal(r.status, "Succeeded");
  assert.equal(env.person(G(103))._su_contact_value, G(903));
  assert.equal(env.outlook.sent.length, 0);
});

test("a row already linked to this same contact is success, with no email", () => {
  const env = world();
  env.person(G(103))._su_contact_value = G(903);
  const r = added(env, env.signIn(G(903), OID(1)));
  assert.equal(r.status, "Succeeded");
  assert.equal(env.outlook.sent.length, 0);
});

test("a row linked to another contact is left alone and the office is told", () => {
  const env = world();
  env.person(G(103))._su_contact_value = G(950);
  added(env, env.signIn(G(903), OID(1)));
  assert.equal(env.person(G(103))._su_contact_value, G(950), "the link does not move");
  assert.equal(env.outlook.sent.length, 1);
  assert.equal(env.outlook.sent[0].to, "SyracuseComplianceMatrix@groups.syr.edu");
  assert.match(env.outlook.sent[0].body, /already linked to a different contact/);
  assert.match(env.outlook.sent[0].body, /dferrell@syr\.edu/);
});

test("a contact already linked to another row is not linked twice", () => {
  const env = world();
  env.person(G(102))._su_contact_value = G(903);
  added(env, env.signIn(G(903), OID(1)));
  assert.equal(env.person(G(103))._su_contact_value, null);
  assert.match(env.outlook.sent[0].body, /This contact is already linked to a different Compliance Directory row/);
});

test("someone not in the directory: the office is told", () => {
  const env = world();
  added(env, env.signIn(G(960), OID(5)));
  assert.match(env.outlook.sent[0].body, /No active Compliance Directory row/);
});

test("UPN and mail matching two different rows is refused", () => {
  const env = world();
  added(env, env.signIn(G(961), OID(3)));
  assert.equal(env.person(G(104))._su_contact_value, null);
  assert.equal(env.person(G(102))._su_contact_value, null);
  assert.match(env.outlook.sent[0].body, /match two different Compliance Directory rows/);
});

test("a match on mail alone links (mail is set by administrators, like the UPN)", () => {
  const env = world();
  env.person(G(103)).su_email = "Dwight.Ferrell@syr.edu";
  added(env, env.signIn(G(903), OID(1)));
  assert.equal(env.person(G(103))._su_contact_value, G(903));
});

test("a guest or a disabled account is left alone, silently", () => {
  const env = world();
  added(env, env.signIn(G(962), OID(4)));
  assert.equal(env.outlook.sent.length, 0);
  assert.equal(env.person(G(104))._su_contact_value, null);
});

test("a username that is not an Entra object ID: the office is told", () => {
  const env = world();
  added(env, env.signIn(G(963), "pairwise-sub-claim-value"));
  assert.equal(env.outlook.sent.length, 1);
  assert.match(env.outlook.sent[0].body, /no matching Microsoft Entra account/);
  assert.match(env.outlook.sent[0].body, /pairwise-sub-claim-value/);
});

test("a sign-in through another identity provider does not run the flow", () => {
  const env = world();
  const r = added(env, env.signIn(G(903), OID(1), "https://login.example.com/"));
  assert.equal(r.status, "NotTriggered");
  assert.equal(env.person(G(103))._su_contact_value, null);
});

test("an unexpected failure alerts the office and fails the run", () => {
  const env = world();
  const broken = env.dataverse;
  env.dataverse = (op, p) => { if (op === "ListRecords") throw new Error("Dataverse is down"); return broken(op, p); };
  assert.throws(() => added(env, env.signIn(G(903), OID(1))), /Dataverse is down/, "a non-connector error is a test failure");
  /* a connector error is what Dataverse would return */
  const env2 = world();
  const real = env2.dataverse;
  env2.dataverse = (op, p) => { if (op === "UpdateRecord") return real("UpdateRecord", { ...p, recordId: "not-a-guid" }); return real(op, p); };
  const r = added(env2, env2.signIn(G(903), OID(1)));
  assert.equal(r.status, "Failed");
  assert.match(env2.outlook.sent.at(-1).subject, /CM - Link directory to contact failed/);
});

test("Link contact to directory: a row whose email is set finds the person's sign-in", () => {
  const env = world();
  env.signIn(G(903), OID(1));
  const row = env.person(G(103));
  const r = runFlow(FLOWS["CM - Link contact to directory"], { trigger: { body: row }, ...env });
  assert.equal(r.status, "Succeeded");
  assert.equal(row._su_contact_value, G(903));
  assert.equal(env.outlook.sent.length, 0);
});

test("Link contact to directory: no sign-in yet, or no Entra account, is silent", () => {
  const env = world();
  runFlow(FLOWS["CM - Link contact to directory"], { trigger: { body: env.person(G(103)) }, ...env });
  runFlow(FLOWS["CM - Link contact to directory"], { trigger: { body: env.person(G(100)) }, ...env });
  assert.equal(env.outlook.sent.length, 0);
  assert.equal(env.person(G(103))._su_contact_value, null);
});

test("Link contact to directory: an inactive or already linked row does not run the flow", () => {
  const env = world();
  env.signIn(G(903), OID(1));
  const row = env.person(G(103));
  row.su_active = false;
  assert.equal(runFlow(FLOWS["CM - Link contact to directory"], { trigger: { body: row }, ...env }).status, "NotTriggered");
  row.su_active = true; row._su_contact_value = G(950);
  assert.equal(runFlow(FLOWS["CM - Link contact to directory"], { trigger: { body: row }, ...env }).status, "NotTriggered");
});

test("Link existing sign-ins links each earlier sign-in and can be run again", () => {
  const env = world();
  env.signIn(G(903), OID(1));
  env.signIn(G(902), OID(2));
  env.signIn(G(960), OID(5));
  env.signIn(G(964), OID(1), "https://login.example.com/");
  const r = runFlow(FLOWS["CM - Link existing sign-ins"], { trigger: { body: {} }, ...env });
  assert.equal(r.status, "Succeeded");
  assert.equal(env.person(G(103))._su_contact_value, G(903));
  assert.equal(env.person(G(102))._su_contact_value, G(902));
  assert.equal(env.outlook.sent.length, 1, "one notice: the person not in the directory");
  const again = runFlow(FLOWS["CM - Link existing sign-ins"], { trigger: { body: {} }, ...env });
  assert.equal(again.status, "Succeeded");
  assert.equal(env.outlook.sent.length, 2, "a rerun links nothing new; the same notice repeats");
});

/* ---------------- CM - Process portal action: the paths the page cannot reach ---------------- */
function actionWorld(roles = []) {
  const env = world();
  env.dv.su_compliancedirectorys.find(p => p.su_compliancedirectoryid === G(103))._su_contact_value = G(903);
  env.dataverse = dataverseConnector({ dv: env.dv, schema: SCHEMA, contacts: [{ contactid: G(903), fullname: "Dwight", [REL]: roles }], roleRelationship: REL });
  env.act = (row) => {
    env.dv.su_portalactions.push({ su_portalactionid: G(800 + env.dv.su_portalactions.length), _su_requestedby_value: G(903), su_reason: "", ...row });
    const id = env.dv.su_portalactions.at(-1).su_portalactionid;
    const r = runFlow(FLOWS["CM - Process portal action"], { trigger: { body: { text: JSON.stringify({ actionId: id }) } }, ...env });
    return { ...r, reply: JSON.parse(r.response.body.result), row: env.dv.su_portalactions.find(a => a.su_portalactionid === id) };
  };
  return env;
}

test("Process portal action: a processed row is refused and stays as it was", () => {
  const env = actionWorld();
  const r = env.act({ su_action: 100000124, su_reason: "x", _su_function_value: G(202), su_status: 100000131, su_result: "Done" });
  assert.equal(r.reply.ok, false);
  assert.equal(r.reply.error, "That action has already been processed.");
  assert.equal(r.row.su_status, 100000131, "a Done row is not rewritten as Failed");
});

test("Process portal action: an unknown ID is refused", () => {
  const env = actionWorld();
  const r = runFlow(FLOWS["CM - Process portal action"], { trigger: { body: { text: JSON.stringify({ actionId: G(899) }) } }, ...env });
  assert.deepEqual(JSON.parse(r.response.body.result), { ok: false, error: "That action does not exist." });
});

test("Process portal action: only the administrator web role may delete a function", () => {
  const owner = actionWorld();
  assert.equal(owner.act({ su_action: 100000125, _su_function_value: G(201) }).reply.error, "You are not allowed to do that on this function.");
  assert.ok(owner.dv.su_compliancefunctions.some(f => f.su_compliancefunctionid === G(201)));
  const admin = actionWorld(["Administrators"]);
  assert.equal(admin.act({ su_action: 100000125, _su_function_value: G(201) }).reply.ok, true);
  assert.equal(admin.dv.su_compliancefunctions.some(f => f.su_compliancefunctionid === G(201)), false);
});

test("Process portal action: a flag needs a reason", () => {
  const env = actionWorld();
  const r = env.act({ su_action: 100000124, su_reason: "   ", _su_function_value: G(202) });
  assert.equal(r.reply.error, "A flag needs a reason.");
  assert.equal(r.row.su_status, 100000132);
  assert.equal(r.row.su_result, "A flag needs a reason.");
});

test("Process portal action: an unexpected error replies, records, alerts and fails the run", () => {
  const env = actionWorld();
  const real = env.dataverse;
  env.dataverse = (op, p) => (op === "CreateRecord" ? real(op, { ...p, "item/su_nosuchcolumn": "x" }) : real(op, p));
  const r = env.act({ su_action: 100000124, su_reason: "Check it.", _su_function_value: G(202) });
  assert.equal(r.status, "Failed");
  assert.equal(r.reply.error, "The change could not be saved. The compliance office has been told.");
  assert.equal(r.row.su_status, 100000132);
  assert.match(env.outlook.sent.at(-1).subject, /CM - Process portal action failed/);
});

test("Process portal action: a gap with no function can be closed by an administrator only", () => {
  const owner = actionWorld();
  assert.equal(owner.act({ su_action: 100000122, _su_gap_value: G(604) }).reply.error, "You are not allowed to do that on this function.");
  assert.equal(owner.dv.su_compliancegaps.find(g => g.su_compliancegapid === G(604)).su_status, 100000020);
  const admin = actionWorld(["Administrators"]);
  const r = admin.act({ su_action: 100000122, su_reason: "Adopted.", _su_gap_value: G(604) });
  assert.equal(r.reply.ok, true);
  const g = admin.dv.su_compliancegaps.find(x => x.su_compliancegapid === G(604));
  assert.deepEqual([g.su_status, g.su_closenote, g._su_closedby_value], [100000021, "Adopted.", G(103)]);
  /* an administrator still cannot raise a flag without a function */
  assert.equal(admin.act({ su_action: 100000124, su_reason: "x" }).reply.error, "You are not allowed to do that on this function.");
});

/* ---------------- CM - Sync directory from M365 ---------------- */
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD";
const M365 = [
  // a profile with some fields blank: those leave the row's value alone
  { id: OID(11), userPrincipalName: "mdelgado@syr.edu", mail: "marcus.delgado@syr.edu", accountEnabled: true,
    jobTitle: "Senior Vice President for Safety", department: "  ", officeLocation: "Steele Hall",
    businessPhones: ["+1 315 443 1000"], photo: { type: "image/jpeg", base64: JPEG } },
  // every field blank and no photo: nothing is written
  { id: OID(12), userPrincipalName: "cruiz@syr.edu", mail: "cruiz@syr.edu", accountEnabled: true,
    jobTitle: null, department: null, officeLocation: null, businessPhones: [] },
  // found by mail; a title longer than the column is cut to fit
  { id: OID(13), userPrincipalName: "andrea.w@syr.onmicrosoft.com", mail: "awhitaker@syr.edu", accountEnabled: true,
    jobTitle: "T".repeat(300), department: "Human Resources", officeLocation: null, businessPhones: null },
  // a former employee whose account is disabled
  { id: OID(14), userPrincipalName: "dferrell@syr.edu", mail: null, accountEnabled: false,
    jobTitle: "Should not be copied", department: "Gone", officeLocation: null, businessPhones: [] }
  // Grace Whitfield (an outside counsel) and gone@syr.edu are not in Microsoft 365
];
function syncWorld(people = M365) {
  const dv = dataverseTables();
  dv.su_compliancedirectorys.push({ su_compliancedirectoryid: "dddddddd-0000-4000-8000-000000000001", su_name: "No Email", su_email: null, su_active: true });
  const outlook = outlookConnector();
  return { dv, outlook, dataverse: dataverseConnector({ dv, schema: SCHEMA, contacts: [], roleRelationship: REL }), users: usersConnector(people),
    person: id => dv.su_compliancedirectorys.find(p => p.su_compliancedirectoryid === id) };
}
const sync = env => runFlow(FLOWS["CM - Sync directory from M365"], { trigger: {}, ...env });

test("directory sync: runs weekly on Sunday night, Eastern time, and can be run by hand", () => {
  const trig = Object.values(FLOWS["CM - Sync directory from M365"].properties.definition.triggers)[0];
  assert.equal(trig.type, "Recurrence");
  assert.deepEqual(trig.recurrence, { frequency: "Week", interval: 1, timeZone: "Eastern Standard Time",
    schedule: { weekDays: ["Sunday"], hours: ["22"], minutes: [0] } });
  assert.deepEqual(Object.keys(FLOWS["CM - Sync directory from M365"].properties.connectionReferences).sort(),
    ["shared_commondataserviceforapps", "shared_office365", "shared_office365users"]);
});

test("directory sync: copies non-blank profile values and the photo, keeps the rest", () => {
  const env = syncWorld();
  const before = structuredClone(env.dv.su_compliancedirectorys);
  const r = sync(env);
  assert.equal(r.status, "Succeeded");
  const m = env.person(G(100));
  assert.equal(m.su_jobtitle, "Senior Vice President for Safety");
  assert.equal(m.su_unit, "Campus Safety", "a blank department keeps the unit that was there");
  assert.equal(m.su_location, "Steele Hall");
  assert.equal(m.su_phone, "+1 315 443 1000");
  assert.equal(m.su_photo, JPEG);
  const c = env.person(G(101)), c0 = before.find(p => p.su_compliancedirectoryid === G(101));
  assert.deepEqual(c, c0, "an all-blank profile with no photo changes nothing");
  assert.equal(c.su_photo, undefined, "no photo leaves the column empty");
  assert.ok(!r.log.some(x => x.op === "UpdateRecord" && x.params.recordId === G(101)), "and nothing is written");
  const a = env.person(G(102));
  assert.equal(a.su_jobtitle, "T".repeat(250), "cut to the column's 250 characters");
  assert.equal(a.su_unit, "Human Resources");
  assert.equal(env.person(G(103)).su_jobtitle ?? null, before.find(p => p.su_compliancedirectoryid === G(103)).su_jobtitle ?? null, "a disabled account is not copied");
  assert.ok(!r.log.some(x => x.op === "UserProfile_V2" && x.params.id === ""), "a row with no email is not looked up");
  assert.deepEqual(r.vars.Skipped, [
    "Dwight Ferrell <dferrell@syr.edu>: account disabled",
    "Grace Whitfield <gwhitfield@syr.edu>: not found in Microsoft 365 (404)",
    "Left Already <gone@syr.edu>: not found in Microsoft 365 (404)"]);
  assert.equal(r.vars.Updated, 2);
  assert.equal(r.vars.Photos, 1);
  assert.equal(env.outlook.sent.length, 0, "skipping people is not a failure");
});

test("directory sync: a second run writes nothing new but the photo", () => {
  const env = syncWorld();
  sync(env);
  const r = sync(env);
  assert.equal(r.status, "Succeeded");
  assert.equal(r.vars.Updated, 0);
  assert.deepEqual(r.log.filter(x => x.op === "UpdateRecord").map(x => Object.keys(x.params).filter(k => k.startsWith("item/"))), [["item/su_photo"]]);
});

test("directory sync: a write Dataverse refuses alerts the office and fails the run, after the others are done", () => {
  const bad = M365.map(p => p.id === OID(11) ? { ...p, photo: { type: "image/jpeg", base64: "not base64!" } } : p);
  const env = syncWorld(bad);
  const r = sync(env);
  assert.equal(r.status, "Failed");
  assert.equal(env.outlook.sent.length, 1);
  assert.match(env.outlook.sent[0].subject, /CM - Sync directory from M365 failed/);
  assert.equal(env.person(G(102)).su_unit, "Human Resources", "the people after the failure were still synced");
});
