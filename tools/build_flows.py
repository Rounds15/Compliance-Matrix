#!/usr/bin/env python3
"""
The Compliance Matrix solution's cloud flows, as Power Automate definitions.

    CM - Link directory to contact     a new Entra sign-in to the site
    CM - Link contact to directory     a directory row added or its email changed
    CM - Link existing sign-ins        manual; the same as the first, for every
                                       sign-in already on the site
    CM - Process portal action         called by the matrix page for each action
    CM - Sync directory from M365      weekly (and by hand): title, unit, office,
                                       phone and photo from each person's
                                       Microsoft 365 profile
    CM - Add to calendar               called by the matrix page: invites the
                                       person to an all-day Outlook event for
                                       each deadline they add

build_solution.py writes them to solution/src/Workflows/ in the layout
`pac solution unpack` produces, with the connection references they use. The
portal's end-to-end tests run these same definitions (portal/test/flow-runner.mjs),
so what the tests check is what is imported.

Settings come from solution/schema/flows.yaml. Expressions are the Workflow
Definition Language; q() writes a string literal, odata() a quoted OData value.
"""

from __future__ import annotations

import pathlib
import re
import uuid

import yaml

NAMESPACE = uuid.UUID("6f2b8c1e-4a7d-4f0e-9b3a-2c5d7e8f9a10")
ZERO = "00000000-0000-0000-0000-000000000000"
API = "/providers/Microsoft.PowerApps/apis/"
FORMATTED = "@OData.Community.Display.V1.FormattedValue"

# choice codes from dataverse-schema.yaml
PENDING, DONE, FAILED = 100000130, 100000131, 100000132
COMPLETE, REVERSE, CLOSE, RESOLVE, RAISE, DELETE = range(100000120, 100000126)
ADD_TO_CALENDAR = 100000126
ONE_TIME = 100000016
GAP_CLOSED = 100000021
FLAG_ACTIVE, FLAG_CLEARED = 100000050, 100000051
FLAG_MANUAL, FLAG_SURVEY = 100000110, 100000111

USER_FIELDS = "id,displayName,userPrincipalName,mail,accountEnabled,userType"


def q(s: str) -> str:
    """A WDL string literal."""
    return "'" + str(s).replace("'", "''") + "'"


def odata(expr: str) -> str:
    """A WDL expression giving the OData string literal of `expr`: quoted,
    with single quotes doubled."""
    return f"concat('''', replace({expr}, '''', ''''''), '''')"


def first(list_action: str) -> str:
    return f"first(body({q(list_action)})?['value'])"


def count(list_action: str) -> str:
    return f"length(body({q(list_action)})?['value'])"


TODAY = "convertFromUtc(utcNow(), 'Eastern Standard Time', 'yyyy-MM-dd')"
RUN_LINK = ("concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], "
            "'/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])")


# ---------------------------------------------------------------------------
# action builders
# ---------------------------------------------------------------------------
class Flow:
    def __init__(self, settings: dict):
        self.s = settings
        self.used: set[str] = set()

    def conn(self, key: str) -> str:
        api = self.s["connectionReferences"][key]["api"]
        self.used.add(key)
        return api

    def op(self, key: str, operation: str, params: dict) -> dict:
        api = self.conn(key)
        return {"type": "OpenApiConnection",
                "inputs": {"host": {"connectionName": api, "operationId": operation, "apiId": API + api},
                           "parameters": params, "authentication": "@parameters('$authentication')"}}

    # Dataverse
    def list(self, entity_set, filter_expr, select=None, top=None, expand=None):
        p = {"entityName": entity_set, "$filter": "@{" + filter_expr + "}"}
        if select:
            p["$select"] = select
        if expand:
            p["$expand"] = expand
        if top:
            p["$top"] = top
        return self.op("dataverse", "ListRecords", p)

    def get(self, entity_set, id_expr, select=None):
        p = {"entityName": entity_set, "recordId": "@{" + id_expr + "}"}
        if select:
            p["$select"] = select
        return self.op("dataverse", "GetItem", p)

    def update(self, entity_set, id_expr, item: dict):
        return self.op("dataverse", "UpdateRecord",
                       {"entityName": entity_set, "recordId": "@{" + id_expr + "}",
                        **{"item/" + k: v for k, v in item.items()}})

    def create(self, entity_set, item: dict):
        return self.op("dataverse", "CreateRecord", {"entityName": entity_set, **{"item/" + k: v for k, v in item.items()}})

    def delete(self, entity_set, id_expr):
        return self.op("dataverse", "DeleteRecord", {"entityName": entity_set, "recordId": "@{" + id_expr + "}"})

    def user(self, id_expr, select=USER_FIELDS):
        return self.op("users", "UserProfile_V2", {"id": "@{" + id_expr + "}", "$select": select})

    def photo(self, id_expr):
        return self.op("users", "UserPhoto_V2", {"id": "@{" + id_expr + "}"})

    def email(self, subject: str, body_expr: str):
        return self.op("outlook", "SendEmailV2", {
            "emailMessage/To": self.s["alertTo"], "emailMessage/Subject": subject,
            "emailMessage/Body": "@{" + body_expr + "}", "emailMessage/Importance": "Normal"})


def seq(*steps, after: dict | None = None) -> dict:
    """Actions that run one after another. A step is (name, action); the first
    runs after `after` (default: at the start of its scope)."""
    out, prev = {}, None
    for name, action in steps:
        a = dict(action)
        if "runAfter" not in a:
            a["runAfter"] = ({prev: ["Succeeded"]} if prev else dict(after or {}))
        out[name] = a
        prev = name
    return out


def when(expr: str, yes: dict, no: dict | None = None, run_after: dict | None = None) -> dict:
    a = {"type": "If", "expression": {"and": [{"equals": ["@" + expr, True]}]},
         "actions": yes, "else": {"actions": no or {}}}
    if run_after is not None:
        a["runAfter"] = run_after
    return a


def compose(value) -> dict:
    return {"type": "Compose", "inputs": value}


def set_var(name: str, value) -> dict:
    return {"type": "SetVariable", "inputs": {"name": name, "value": value}}


def init_var(name: str, vtype: str, value) -> dict:
    return {"type": "InitializeVariable", "inputs": {"variables": [{"name": name, "type": vtype, "value": value}]}}


def append_var(name: str, value) -> dict:
    return {"type": "AppendToArrayVariable", "inputs": {"name": name, "value": value}}


def add_one(name: str) -> dict:
    return {"type": "IncrementVariable", "inputs": {"name": name, "value": 1}}


def scope(actions: dict, run_after: dict | None = None) -> dict:
    a = {"type": "Scope", "actions": actions}
    if run_after is not None:
        a["runAfter"] = run_after
    return a


def terminate(status: str, message: str | None = None) -> dict:
    inputs = {"runStatus": status}
    if message:
        inputs["runError"] = {"code": "CMFlowFailed", "message": message}
    return {"type": "Terminate", "inputs": inputs}


def html(*parts: str) -> str:
    """concat() of HTML pieces; a piece starting with '=' is an expression,
    any other is literal text."""
    return "concat(" + ", ".join(p[1:] if p.startswith("=") else q(p) for p in parts) + ")"


def definition(trigger_name: str, trigger: dict, actions: dict, used: set[str], settings: dict) -> dict:
    refs = settings["connectionReferences"]
    return {"properties": {
        "connectionReferences": {
            refs[k]["api"]: {"runtimeSource": "embedded",
                             "connection": {"connectionReferenceLogicalName": refs[k]["logicalName"]},
                             "api": {"name": refs[k]["api"]}}
            for k in ("dataverse", "users", "outlook") if k in used},
        "definition": {
            "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": {trigger_name: trigger},
            "actions": actions},
        "templateName": ""},
        "schemaVersion": "1.0.0.0"}


def dataverse_trigger(f: Flow, table: str, message: int, filtering: str | None, conditions: list[str]) -> dict:
    """When a row is added, modified or deleted. message: 1 Added, 3 Modified,
    4 Added or Modified. Scope 4: Organization."""
    p = {"subscriptionRequest/message": message, "subscriptionRequest/entityname": table,
         "subscriptionRequest/scope": 4}
    if filtering:
        p["subscriptionRequest/filteringattributes"] = filtering
    api = f.conn("dataverse")
    t = {"type": "OpenApiConnectionWebhook",
         "inputs": {"host": {"connectionName": api, "operationId": "SubscribeWebhookTrigger", "apiId": API + api},
                    "parameters": p, "authentication": "@parameters('$authentication')"}}
    if conditions:
        t["conditions"] = [{"expression": "@" + c} for c in conditions]
    return t


# ---------------------------------------------------------------------------
# linking a contact to a directory row ("Safe to link")
# ---------------------------------------------------------------------------
REASONS = {
    "none": "No active Compliance Directory row has this person's user principal name or mail address "
            "as its email. Add them to the directory, or correct their directory email to their NetID address.",
    "ambiguous": "Their user principal name and their mail address match two different Compliance Directory "
                 "rows. Correct the row that is not theirs.",
    "moved": "The Compliance Directory row with their email is already linked to a different contact. "
             "Check which contact is right, then change Portal Contact on the row by hand.",
    "elsewhere": "This contact is already linked to a different Compliance Directory row. Check which row is "
                 "right, then change Portal Contact by hand.",
}


def notice(f: Flow, p: str, user_expr: str, contact_expr: str, reason_expr: str) -> dict:
    """The 'not linked' email to the compliance office."""
    body = html("<p>A sign-in to the Compliance Matrix site could not be linked to the Compliance Directory, "
                "so the person cannot act on functions in the matrix yet.</p><p><b>Why:</b> ", "=" + reason_expr,
                "</p><ul><li>Name: ", f"=coalesce({user_expr}?['displayName'], '')",
                "</li><li>User principal name: ", f"=coalesce({user_expr}?['userPrincipalName'], '')",
                "</li><li>Mail: ", f"=coalesce({user_expr}?['mail'], '')",
                "</li><li>Contact ID: ", "=" + contact_expr,
                "</li></ul><p>Run: ", "=" + RUN_LINK, "</p>")
    return f.email("Compliance Matrix: a sign-in is not linked to the directory", body)


def link_steps(f: Flow, p: str, contact_expr: str, user_expr: str) -> list:
    """Find the directory row for an Entra user and link it to the contact
    when that is safe. `p` prefixes action names (unique per flow)."""
    upn = f"toLower(coalesce({user_expr}?['userPrincipalName'], ''))"
    mail = f"toLower(coalesce({user_expr}?['mail'], ''))"
    where = (f"concat('(su_email eq ', {odata(upn)}, "
             f"if(empty({mail}), '', concat(' or su_email eq ', {odata(mail)})), ') and su_active eq true')")
    d, l = p + "Find_directory_row", p + "Find_rows_linked_to_contact"
    row = first(d)
    decision = (f"if(equals({count(d)}, 0), 'none', if(greater({count(d)}, 1), 'ambiguous', "
                f"if(equals(toLower(coalesce({row}?['_su_contact_value'], '')), toLower({contact_expr})), 'already', "
                f"if(not(empty(coalesce({row}?['_su_contact_value'], ''))), 'moved', "
                f"if(greater({count(l)}, 0), 'elsewhere', 'link')))))")
    reason = "if(equals(outputs(" + q(p + "Safe_to_link") + "), 'none'), " + q(REASONS["none"]) + \
             ", if(equals(outputs(" + q(p + "Safe_to_link") + "), 'ambiguous'), " + q(REASONS["ambiguous"]) + \
             ", if(equals(outputs(" + q(p + "Safe_to_link") + "), 'moved'), " + q(REASONS["moved"]) + \
             ", " + q(REASONS["elsewhere"]) + ")))"
    switch = {"type": "Switch", "expression": "@outputs(" + q(p + "Safe_to_link") + ")",
              "cases": {
                  "Link": {"case": "link", "actions": seq(
                      (p + "Set_Portal_Contact", f.update("su_compliancedirectorys", f"{row}?['su_compliancedirectoryid']",
                                                          {"su_contact@odata.bind": "@{concat('contacts(', " + contact_expr + ", ')')}"})))},
                  "Already_linked": {"case": "already", "actions": {}}},
              "default": {"actions": seq((p + "Tell_the_office", notice(f, p, user_expr, contact_expr, reason)))}}
    return [
        (d, f.list("su_compliancedirectorys", where, "su_compliancedirectoryid,su_name,su_email,_su_contact_value", 2)),
        (l, f.list("su_compliancedirectorys", f"concat('_su_contact_value eq ', {contact_expr})", "su_compliancedirectoryid", 2)),
        (p + "Safe_to_link", compose("@" + decision)),
        (p + "Link_or_tell_the_office", switch),
    ]


def from_sign_in(f: Flow, p: str, username_expr: str, contact_expr: str, contact_name_expr: str) -> dict:
    """Look the sign-in's Entra object ID up and link it. Notices: no Entra
    user. Silent: a guest or disabled account."""
    g = p + "Get_Entra_user"
    user = f"body({q(g)})"
    member = f"and(equals({user}?['userType'], 'Member'), equals({user}?['accountEnabled'], true))"
    no_user = f.email("Compliance Matrix: a sign-in is not linked to the directory", html(
        "<p>A sign-in to the Compliance Matrix site has no matching Microsoft Entra account, so it was not "
        "linked to the Compliance Directory.</p><ul><li>Contact: ", "=" + contact_name_expr,
        "</li><li>Contact ID: ", "=" + contact_expr, "</li><li>External Identity username: ", "=" + username_expr,
        "</li></ul><p>If the username is not the person's Entra object ID, the site stores the sub claim "
        "instead (docs/DATAVERSE-MIGRATION.md, section 6).</p><p>Run: ", "=" + RUN_LINK, "</p>"))
    return seq(
        (g, f.user(username_expr)),
        (p + "Found_in_Entra", when(f"equals(actions({q(g)})?['status'], 'Succeeded')",
                                    seq((p + "Is_a_member", when(member, seq(*link_steps(f, p, contact_expr, user)))),),
                                    seq((p + "Tell_the_office_no_account", no_user)),
                                    run_after={g: ["Succeeded", "Failed"]})))


def try_catch(f: Flow, actions: dict, what: str, after: dict | None = None) -> dict:
    """Run `actions`; if they fail, alert the office and fail the run."""
    alert = f.email(f"Compliance Matrix: {what} failed", html(
        f"<p>The flow {what} failed. Open the run to see the step that failed.</p><p>Run: ", "=" + RUN_LINK, "</p>"))
    out = {"Try": scope(actions, run_after=after or {})}
    out["Alert_the_office"] = {**alert, "runAfter": {"Try": ["Failed", "TimedOut"]}}
    out["Fail_the_run"] = {**terminate("Failed", f"{what} failed; the office was emailed."),
                           "runAfter": {"Alert_the_office": ["Succeeded", "Failed"]}}
    return out


# ---------------------------------------------------------------------------
# the link flows and the action flow
# ---------------------------------------------------------------------------
def link_directory_to_contact(s: dict) -> dict:
    f = Flow(s)
    t = "triggerOutputs()?['body/{}']"
    trig = dataverse_trigger(f, "adx_externalidentity", 1, None,
                             [f"equals(triggerOutputs()?['body/adx_identityprovidername'], {q(s['identityProvider'])})"])
    acts = try_catch(f, from_sign_in(f, "", t.format("adx_username"), t.format("_adx_contactid_value"),
                                     f"coalesce(triggerOutputs()?['body/_adx_contactid_value{FORMATTED}'], '')"),
                     "CM - Link directory to contact")
    return definition("When_a_sign_in_is_added", trig, acts, f.used, s)


def link_existing_sign_ins(s: dict) -> dict:
    f = Flow(s)
    trig = {"type": "Request", "kind": "Button", "inputs": {"schema": {"type": "object", "properties": {}, "required": []}}}
    loop = {"type": "Foreach", "foreach": "@body('List_sign_ins')?['value']",
            "actions": from_sign_in(f, "", "items('For_each_sign_in')?['adx_username']",
                                    "items('For_each_sign_in')?['_adx_contactid_value']",
                                    f"coalesce(items('For_each_sign_in')?['_adx_contactid_value{FORMATTED}'], '')"),
            "runtimeConfiguration": {"concurrency": {"repetitions": 1}}}
    body = seq(("List_sign_ins", f.list("adx_externalidentities",
                                         f"concat('adx_identityprovidername eq ', {odata(q(s['identityProvider']))})",
                                         "adx_externalidentityid,adx_username,_adx_contactid_value")),
               ("For_each_sign_in", loop))
    return definition("manual", trig, try_catch(f, body, "CM - Link existing sign-ins"), f.used, s)


def link_contact_to_directory(s: dict) -> dict:
    f = Flow(s)
    t = "triggerOutputs()?['body/{}']"
    trig = dataverse_trigger(f, "su_compliancedirectory", 4, "su_email", [
        f"not(empty(coalesce({t.format('su_email')}, '')))",
        f"equals({t.format('su_active')}, true)",
        f"empty(coalesce({t.format('_su_contact_value')}, ''))"])
    g, ids = "Get_Entra_user", "Find_sign_in"
    user = f"body({q(g)})"
    member = f"and(equals({user}?['userType'], 'Member'), equals({user}?['accountEnabled'], true))"
    contact = f"{first(ids)}?['_adx_contactid_value']"
    find = f.list("adx_externalidentities",
                  f"concat('adx_username eq ', {odata(user + '?[' + q('id') + ']')}, ' and adx_identityprovidername eq ', "
                  f"{odata(q(s['identityProvider']))})", "adx_externalidentityid,_adx_contactid_value", 2)
    two = f.email("Compliance Matrix: a sign-in is not linked to the directory", html(
        "<p>This person's Entra account has more than one sign-in to the site, so the flow did not choose one.</p>"
        "<ul><li>User principal name: ", f"={user}?['userPrincipalName']",
        "</li></ul><p>Set Portal Contact on their directory row by hand.</p><p>Run: ", "=" + RUN_LINK, "</p>"))
    body = seq(
        (g, f.user(t.format("su_email"))),
        ("Found_in_Entra", when(f"and(equals(actions({q(g)})?['status'], 'Succeeded'), {member})", seq(
            (ids, find),
            ("Signed_in", when(f"equals({count(ids)}, 1)", seq(*link_steps(f, "", contact, user)),
                               seq(("More_than_one_sign_in", when(f"greater({count(ids)}, 1)", seq(("Tell_the_office_two_sign_ins", two)))),))),
        ), run_after={g: ["Succeeded", "Failed"]})))
    return definition("When_a_directory_email_is_set", trig, try_catch(f, body, "CM - Link contact to directory"), f.used, s)


def process_portal_action(s: dict) -> dict:
    """docs/DATAVERSE-MIGRATION.md, section 8. Each check sets Error if no
    earlier one did; the work runs only when Error is still empty."""
    f = Flow(s)
    trig = {"type": "Request", "kind": "PowerPages", "inputs": {"schema": {
        "type": "object", "required": ["text"],
        "properties": {"text": {"title": "request", "type": "string", "x-ms-dynamically-added": True,
                                "description": "The request, as JSON: {\"actionId\": \"<Portal Action ID>\"}",
                                "x-ms-content-hint": "TEXT"}}}}}

    A = "body('Get_action')"
    act = f"{A}?['su_action']"
    P = first("Find_person")
    T = first("Find_target")
    F = first("Find_function")
    err = "variables('Error')"
    fn_name = f"coalesce({F}?['su_name'], '')"
    person = f"concat('su_compliancedirectorys(', {P}?['su_compliancedirectoryid'], ')')"
    target_set = (f"if(or(equals({act}, {COMPLETE}), equals({act}, {REVERSE})), 'su_compliancedeadlines', "
                  f"if(equals({act}, {CLOSE}), 'su_compliancegaps', if(equals({act}, {RESOLVE}), 'su_functionflags', '')))")
    target_id = (f"if(or(equals({act}, {COMPLETE}), equals({act}, {REVERSE})), {A}?['_su_deadline_value'], "
                 f"if(equals({act}, {CLOSE}), {A}?['_su_gap_value'], if(equals({act}, {RESOLVE}), {A}?['_su_flag_value'], null)))")
    tset = "outputs('Target_table')"
    has_target = f"not(empty({tset}))"
    function_id = f"if({has_target}, {T}?['_su_function_value'], {A}?['_su_function_value'])"
    is_admin = "greater(length(body('Administrator_roles')), 0)"
    is_owner = "greater(length(body('Find_ownership')?['value']), 0)"
    owner_may = f"and({is_owner}, or(equals({act}, {COMPLETE}), equals({act}, {REVERSE}), equals({act}, {CLOSE})))"

    def check(name, cond, message):
        return name, when(f"and(empty({err}), {cond})", seq(("Set_" + name, set_var("Error", message))))

    def archive(name, title, record_type, event_type, extra: dict, ):
        full = f"concat({q(title + ' - ')}, {fn_name})"
        number = (f"if(equals({F}?['su_legacyspid'], null), if(empty(coalesce({F}?['su_functioncode'], '')), null, "
                  f"int({F}?['su_functioncode'])), {F}?['su_legacyspid'])")
        item = {"su_name": f"@{{substring({full}, 0, min(255, length({full})))}}",
                "su_recordtype": record_type, "su_eventtype": event_type,
                "su_archivedfunctionname": f"@{{{fn_name}}}", "su_functionnumber": f"@{number}",
                "su_function@odata.bind": f"@{{concat('su_compliancefunctions(', {F}?['su_compliancefunctionid'], ')')}}",
                "su_resolvedby": f"@{{{P}?['su_name']}}", "su_resolvedat": "@{utcNow()}", **extra}
        return name, f.create("su_archives", item)

    dl = {"su_reason": f"@{{{A}?['su_reason']}}"}
    deadline_extra = {**dl, "su_completedoccurrence": f"@{{coalesce({T}?['su_duedate'], '')}}",
                      "su_cadence": f"@{{coalesce({T}?['su_cadence{FORMATTED}'], '')}}",
                      "su_sourceitemid": f"@{T}?['su_legacyspid']"}
    child = lambda what: f"concat('_su_function_value eq ', {F}?['su_compliancefunctionid'])"

    def each(name, list_name, entity_set, select, reason_expr):
        """Archive each child row of the function before it is deleted."""
        item = f"items({q(name)})"
        return [(list_name, f.list(entity_set, child(entity_set), select)),
                (name, {"type": "Foreach", "foreach": f"@body({q(list_name)})?['value']",
                        "actions": seq(archive("Archive_" + name[9:], "Function Deleted", "Function Deleted", "Deleted",
                                               {"su_reason": "@{" + reason_expr.replace("ITEM", item) + "}",
                                                "su_sourceitemid": f"@{item}?['su_legacyspid']"})),
                        "runtimeConfiguration": {"concurrency": {"repetitions": 1}}})]

    work = {"type": "Switch", "expression": f"@{act}", "cases": {
        "Complete_deadline": {"case": COMPLETE, "actions": seq(
            ("Update_deadline_complete", f.update("su_compliancedeadlines", f"{T}?['su_compliancedeadlineid']", {
                "su_completeddate": "@{" + TODAY + "}", "su_completedon": "@{utcNow()}",
                "su_completedreason": f"@{{{A}?['su_reason']}}", "su_completedbydisplayname": f"@{{{P}?['su_name']}}",
                "su_completedby@odata.bind": "@{" + person + "}",
                "su_complete": f"@equals({T}?['su_cadence'], {ONE_TIME})"})),
            archive("Archive_completion", "Deadline Completed", "Deadline Completion", "Completed", deadline_extra))},
        "Reverse_completion": {"case": REVERSE, "actions": seq(
            ("Update_deadline_reverse", f.update("su_compliancedeadlines", f"{T}?['su_compliancedeadlineid']", {
                "su_completeddate": "@null", "su_completedon": "@null", "su_completedreason": "@null",
                "su_completedbydisplayname": "@null", "su_completedby@odata.bind": "@null", "su_complete": False})),
            archive("Archive_reversal", "Deadline Reversed", "Deadline Completion", "Reversed", deadline_extra))},
        "Close_gap": {"case": CLOSE, "actions": seq(
            ("Update_gap", f.update("su_compliancegaps", f"{T}?['su_compliancegapid']", {
                "su_status": GAP_CLOSED, "su_closeddate": "@{" + TODAY + "}",
                "su_closenote": f"@if(empty(coalesce({A}?['su_reason'], '')), null, {A}?['su_reason'])",
                "su_closedby@odata.bind": "@{" + person + "}"})))},
        "Resolve_flag": {"case": RESOLVE, "actions": seq(
            ("Update_flag", f.update("su_functionflags", f"{T}?['su_functionflagid']", {
                "su_status": FLAG_CLEARED, "su_clearedon": "@{" + TODAY + "}",
                "su_clearedby@odata.bind": "@{" + person + "}"})),
            archive("Archive_resolution", "Flag Resolved", "Flag Resolution", "Resolved", {
                "su_reason": f"@{{{T}?['su_reason']}}", "su_sourceitemid": f"@{T}?['su_legacyspid']",
                "su_flaggedby": f"@{{coalesce({T}?['_su_flaggedby_value{FORMATTED}'], '')}}",
                "su_flaggeddate": f"@{{coalesce({T}?['su_flaggedon'], '')}}",
                "su_flagsource": f"@{{if(equals({T}?['su_source'], {FLAG_SURVEY}), 'Survey', 'Manual')}}"}))},
        "Raise_flag": {"case": RAISE, "actions": seq(
            ("Add_flag", f.create("su_functionflags", {
                "su_name": f"@{{substring({fn_name}, 0, min(400, length({fn_name})))}}",
                "su_function@odata.bind": f"@{{concat('su_compliancefunctions(', {F}?['su_compliancefunctionid'], ')')}}",
                "su_reason": f"@{{{A}?['su_reason']}}", "su_status": FLAG_ACTIVE, "su_source": FLAG_MANUAL,
                "su_flaggedon": "@{" + TODAY + "}", "su_flaggedby@odata.bind": "@{" + person + "}"})))},
        "Delete_function": {"case": DELETE, "actions": seq(
            *each("For_each_gap", "List_gaps", "su_compliancegaps", "su_name,su_legacyspid",
                  "concat('Gap: ', coalesce(ITEM?['su_name'], ''))"),
            *each("For_each_deadline", "List_deadlines", "su_compliancedeadlines", "su_duedate,su_cadence,su_legacyspid",
                  "concat('Deadline: ', if(empty(coalesce(ITEM?['su_duedate'], '')), '', formatDateTime(ITEM?['su_duedate'], 'MM/dd/yyyy')), "
                  f"' ', coalesce(ITEM?['su_cadence{FORMATTED}'], ''))"),
            *each("For_each_flag", "List_flags", "su_functionflags", "su_reason,su_legacyspid",
                  "concat('Flag: ', coalesce(ITEM?['su_reason'], ''))"),
            *each("For_each_owner", "List_owners", "su_functionownerships", "_su_person_value,su_role,su_legacyspid",
                  f"concat('Owner: ', coalesce(ITEM?['_su_person_value{FORMATTED}'], ''), ' (', coalesce(ITEM?['su_role{FORMATTED}'], ''), ')')"),
            archive("Archive_function", "Function Deleted", "Function Deleted", "Deleted", {
                "su_reason": "Function record deleted", "su_sourceitemid": f"@{F}?['su_legacyspid']"}),
            ("Delete_the_function", f.delete("su_compliancefunctions", f"{F}?['su_compliancefunctionid']")))}},
        "default": {"actions": seq(("Set_Error_unknown", set_var("Error", "That action type is not known.")))}}

    roles = s["webRoleRelationship"]
    steps = seq(
        ("Read_request", set_var("ActionId", "@{coalesce(json(triggerBody()?['text'])?['actionId'], '')}")),
        ("Get_action", f.get("su_portalactions", "variables('ActionId')",
                             "su_portalactionid,su_name,su_action,su_status,su_reason,_su_requestedby_value,"
                             "_su_function_value,_su_deadline_value,_su_gap_value,_su_flag_value")),
        ("Action_missing", {**check("Action_missing", "not(equals(actions('Get_action')?['status'], 'Succeeded'))",
                                    "That action does not exist.")[1], "runAfter": {"Get_action": ["Succeeded", "Failed"]}}),
        check("Already_processed", f"or(equals({A}?['su_status'], {DONE}), equals({A}?['su_status'], {FAILED}))",
              "That action has already been processed."),
        check("No_requester", f"empty(coalesce({A}?['_su_requestedby_value'], ''))", "This action has no requester."),
        ("Find_person", f.list("su_compliancedirectorys",
                               f"concat('_su_contact_value eq ', coalesce({A}?['_su_requestedby_value'], {q(ZERO)}), ' and su_active eq true')",
                               "su_compliancedirectoryid,su_name", 1)),
        check("Not_linked", f"equals({count('Find_person')}, 0)",
              "Your sign-in is not linked to a Compliance Directory record yet. Ask the compliance office to check "
              "your directory email."),
        ("Target_table", compose("@" + target_set)),
        ("Find_target", f.list(f"@{{if({has_target}, {tset}, 'su_portalactions')}}",
                               f"concat(if({has_target}, substring({tset}, 0, sub(length({tset}), 1)), 'su_portalaction'), 'id eq ', "
                               f"coalesce({target_id}, {q(ZERO)}))")),
        check("Target_missing", f"and({has_target}, equals({count('Find_target')}, 0))", "That record no longer exists."),
        check("Other_function", f"and({has_target}, not(empty(coalesce({A}?['_su_function_value'], ''))), "
                                f"not(equals({T}?['_su_function_value'], {A}?['_su_function_value'])))",
              "That record is not on this function."),
        ("Find_function", f.list("su_compliancefunctions",
                                 f"concat('su_compliancefunctionid eq ', coalesce({function_id}, {q(ZERO)}))",
                                 "su_compliancefunctionid,su_name,su_functioncode,su_legacyspid", 1)),
        ("Find_web_roles", f.list("contacts", f"concat('contactid eq ', coalesce({A}?['_su_requestedby_value'], {q(ZERO)}))",
                                  "contactid", 1, expand=f"{roles}($select=name)")),
        ("Administrator_roles", {"type": "Query", "inputs": {
            "from": f"@coalesce(first(body('Find_web_roles')?['value'])?[{q(roles)}], json('[]'))",
            "where": f"@equals(item()?['name'], {q(s['adminWebRole'])})"}}),
        ("Find_ownership", f.list("su_functionownerships",
                                  f"concat('_su_function_value eq ', coalesce({F}?['su_compliancefunctionid'], {q(ZERO)}), "
                                  f"' and _su_person_value eq ', coalesce({P}?['su_compliancedirectoryid'], {q(ZERO)}))",
                                  "su_functionownershipid", 1)),
        # a gap with no function has no owner chain: only an administrator may close it
        check("Not_allowed", f"or(and(equals({count('Find_function')}, 0), not(and({is_admin}, equals({act}, {CLOSE})))), "
                             f"not(or({is_admin}, equals({act}, {RAISE}), {owner_may})))",
              "You are not allowed to do that on this function."),
        check("No_reason", f"and(equals({act}, {RAISE}), empty(trim(coalesce({A}?['su_reason'], ''))))", "A flag needs a reason."),
        ("Do_the_work", when(f"empty({err})", seq(("Switch_on_action_type", work)))),
    )

    def finish(status, result_expr, reply):
        return seq(
            ("Record_" + status, {**f.update("su_portalactions", "variables('ActionId')", {
                "su_status": DONE if status == "done" else FAILED, "su_result": "@{" + result_expr + "}",
                "su_processedon": "@{utcNow()}"})}),
            ("Reply_" + status, {"type": "Response", "kind": "PowerPages", "inputs": {
                "statusCode": 200, "body": {"result": "@{string(" + reply + ")}"},
                "schema": {"type": "object", "properties": {"result": {"title": "result", "type": "string", "x-ms-dynamically-added": True}}}},
                "runAfter": {"Record_" + status: ["Succeeded", "Failed", "Skipped"]}}))

    ok = "json('{\"ok\":true}')"
    refused = "addProperty(json('{\"ok\":false}'), 'error', " + err + ")"
    sorry = "The change could not be saved. The compliance office has been told."
    acts = {
        "Initialize_ActionId": init_var("ActionId", "string", ""),
        "Initialize_Error": {**init_var("Error", "string", ""), "runAfter": {"Initialize_ActionId": ["Succeeded"]}},
        "Try": scope(steps, run_after={"Initialize_Error": ["Succeeded"]}),
        "Finish": when(f"empty({err})", finish("done", "'Done'", ok),
                       seq(("Has_an_action_row", when(f"and(equals(actions('Get_action')?['status'], 'Succeeded'), "
                                                      f"not(or(equals({A}?['su_status'], {DONE}), equals({A}?['su_status'], {FAILED}))))",
                                                      seq(("Record_failed", f.update("su_portalactions", "variables('ActionId')", {
                                                          "su_status": FAILED, "su_result": "@{" + err + "}",
                                                          "su_processedon": "@{utcNow()}"}))))),
                           ("Reply_refused", {"type": "Response", "kind": "PowerPages", "inputs": {
                               "statusCode": 200, "body": {"result": "@{string(" + refused + ")}"},
                               "schema": {"type": "object", "properties": {"result": {"title": "result", "type": "string", "x-ms-dynamically-added": True}}}},
                               "runAfter": {"Has_an_action_row": ["Succeeded", "Failed"]}})),
                       run_after={"Try": ["Succeeded"]}),
        "Catch": scope(seq(
            ("Record_error", f.update("su_portalactions", "variables('ActionId')", {
                "su_status": FAILED, "su_result": sorry, "su_processedon": "@{utcNow()}"})),
            ("Reply_error", {"type": "Response", "kind": "PowerPages", "inputs": {
                "statusCode": 200, "body": {"result": "@{string(addProperty(json('{\"ok\":false}'), 'error', " + q(sorry) + "))}"},
                "schema": {"type": "object", "properties": {"result": {"title": "result", "type": "string", "x-ms-dynamically-added": True}}}},
                "runAfter": {"Record_error": ["Succeeded", "Failed"]}}),
            ("Alert_the_office", {**f.email("Compliance Matrix: CM - Process portal action failed", html(
                "<p>A portal action could not be processed. The person was told the change was not saved.</p>"
                "<ul><li>Portal Action ID: ", "=variables('ActionId')", "</li></ul><p>Run: ", "=" + RUN_LINK, "</p>")),
                "runAfter": {"Reply_error": ["Succeeded", "Failed"]}}),
            ("Fail_the_run", {**terminate("Failed", "CM - Process portal action failed; the office was emailed."),
                              "runAfter": {"Alert_the_office": ["Succeeded", "Failed"]}})),
            run_after={"Try": ["Failed", "TimedOut"]}),
    }
    return page_trigger(s, "processPortalAction", definition("manual", trig, acts, f.used, s))


# ---------------------------------------------------------------------------
# CM - Sync directory from M365
# ---------------------------------------------------------------------------
SCHEMA = pathlib.Path(__file__).resolve().parent.parent / "solution" / "schema" / "dataverse-schema.yaml"

# directory column <- Microsoft 365 profile property (Graph user)
SYNC_FIELDS = [("su_jobtitle", "jobTitle"), ("su_unit", "department"),
               ("su_location", "officeLocation"), ("su_phone", "businessPhones")]
PROFILE_FIELDS = "id,mail,userPrincipalName,accountEnabled,jobTitle,department,officeLocation,businessPhones"


def max_lengths(table: str) -> dict[str, int]:
    cols = yaml.safe_load(SCHEMA.read_text(encoding="utf-8"))["tables"][table]["columns"]
    return {c["name"]: int(c["maxLength"]) for c in cols if c.get("maxLength")}


def sync_trigger(s: dict) -> tuple[str, dict]:
    """Weekly on the configured day and hour, or by hand only. A scheduled
    flow can also be started with Run, so the weekly one covers both."""
    c = s["directorySync"]
    if not c.get("schedule", True):
        return "manual", {"type": "Request", "kind": "Button",
                          "inputs": {"schema": {"type": "object", "properties": {}, "required": []}}}
    return "Weekly", {"type": "Recurrence", "recurrence": {
        "frequency": "Week", "interval": 1, "timeZone": c["timeZone"],
        "schedule": {"weekDays": [c["weekDay"]], "hours": [str(c["hour"])], "minutes": [int(c.get("minute", 0))]}}}


def sync_directory(s: dict) -> dict:
    """For each directory row with an email: look the person up in Microsoft
    365, copy the profile's non-blank values over (a blank profile field
    leaves the row's value alone, so a hand edit is kept), and store their
    photo. Someone not in Microsoft 365, or whose account is disabled, is
    skipped and listed in the run's summary; the rest carry on."""
    f = Flow(s)
    longest = max_lengths("su_compliancedirectory")
    item = "items('For_each_person')"
    email = f"trim(coalesce({item}?['su_email'], ''))"
    P = "body('Get_profile')"

    def profile(prop):
        if prop == "businessPhones":
            return f"trim(coalesce(first(coalesce({P}?['businessPhones'], json('[]'))), ''))"
        return f"trim(coalesce({P}?[{q(prop)}], ''))"

    def keep(col, prop):
        new, n = profile(prop), longest[col]
        return f"@if(empty({new}), {item}?[{q(col)}], substring({new}, 0, min({n}, length({new}))))"

    new = "outputs('New_values')"
    changed = "or(" + ", ".join(f"not(equals(coalesce({new}?[{q(c)}], ''), coalesce({item}?[{q(c)}], '')))"
                                for c, _ in SYNC_FIELDS) + ")"
    who = f"concat(coalesce({item}?['su_name'], ''), ' <', {email}, '>')"
    found = (f"and(equals(actions('Get_profile')?['status'], 'Succeeded'), "
             f"not(equals({P}?['accountEnabled'], false)))")
    has_photo = ("and(equals(actions('Get_photo')?['status'], 'Succeeded'), "
                 "not(empty(coalesce(body('Get_photo')?['$content'], ''))))")
    why_skipped = (f"concat({who}, if(equals(actions('Get_profile')?['status'], 'Succeeded'), "
                   f"': account disabled', concat(': not found in Microsoft 365 (', "
                   f"string(coalesce(outputs('Get_profile')?['statusCode'], '')), ')')))")

    person = seq(
        ("Get_profile", f.user(email, PROFILE_FIELDS)),
        ("In_Microsoft_365", when(found, seq(
            ("New_values", compose({c: keep(c, p) for c, p in SYNC_FIELDS})),
            ("Anything_changed", when(changed, seq(
                ("Update_details", f.update("su_compliancedirectorys", f"{item}?['su_compliancedirectoryid']",
                                            {c: f"@{new}?[{q(c)}]" for c, _ in SYNC_FIELDS})),
                ("Count_updated", add_one("Updated"))))),
            ("Get_photo", f.photo(email)),
            # no photo (404) leaves su_photo as it is
            ("Has_photo", when(has_photo, seq(
                ("Store_photo", f.update("su_compliancedirectorys", f"{item}?['su_compliancedirectoryid']",
                                         {"su_photo": "@body('Get_photo')?['$content']"})),
                ("Count_photos", add_one("Photos"))),
                run_after={"Get_photo": ["Succeeded", "Failed"]})),
        ), seq(("Note_skipped", append_var("Skipped", "@" + why_skipped))),
            run_after={"Get_profile": ["Succeeded", "Failed"]})))

    loop = {"type": "Foreach", "foreach": "@body('List_people')?['value']", "actions": person,
            "runtimeConfiguration": {"concurrency": {"repetitions": 1}}}
    listing = f.list("su_compliancedirectorys", q("su_email ne null"),
                     "su_compliancedirectoryid,su_name,su_email," + ",".join(c for c, _ in SYNC_FIELDS))
    listing["runtimeConfiguration"] = {"paginationPolicy": {"minimumItemCount": 100000}}
    body = seq(
        ("List_people", listing),
        ("For_each_person", loop),
        ("Summary", compose({"people": f"@{count('List_people')}", "updated": "@variables('Updated')",
                             "photos": "@variables('Photos')", "skipped": "@variables('Skipped')"})))
    acts = {
        "Initialize_Updated": init_var("Updated", "integer", 0),
        "Initialize_Photos": {**init_var("Photos", "integer", 0), "runAfter": {"Initialize_Updated": ["Succeeded"]}},
        "Initialize_Skipped": {**init_var("Skipped", "array", []), "runAfter": {"Initialize_Photos": ["Succeeded"]}},
        **try_catch(f, body, "CM - Sync directory from M365", after={"Initialize_Skipped": ["Succeeded"]}),
    }
    name, trig = sync_trigger(s)
    return definition(name, trig, acts, f.used, s)


# ---------------------------------------------------------------------------
# how the page calls a flow (flows.yaml, pageTriggers)
# ---------------------------------------------------------------------------
PP_REQUEST = "json(triggerBody()?['text'])"
# the body as the page sends it (application/json, which the trigger's object
# schema requires) or as a JSON string; either way read as JSON
HTTP_REQUEST = "json(if(empty(string(triggerBody())), '{}', string(triggerBody())))"


def http_trigger() -> dict:
    return {"type": "Request", "kind": "Http", "inputs": {"method": "POST", "schema": {
        "type": "object", "properties": {"actionId": {"type": "string"}}}}}


def as_http(defn: dict) -> dict:
    """The same flow behind "When an HTTP request is received": the trigger,
    the request read from the body, and plain HTTP responses the page can
    read from another origin."""
    d = defn["properties"]["definition"]
    d["triggers"] = {"manual": http_trigger()}

    def walk(actions: dict):
        for a in actions.values():
            if a.get("type") == "Response":
                a.pop("kind", None)
                a["inputs"] = {"statusCode": a["inputs"]["statusCode"], "body": a["inputs"]["body"],
                               "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}}
            inputs = a.get("inputs")
            if a.get("type") == "SetVariable" and isinstance(inputs, dict) and PP_REQUEST in str(inputs.get("value")):
                inputs["value"] = inputs["value"].replace(PP_REQUEST, HTTP_REQUEST)
            for key in ("actions",):
                if key in a:
                    walk(a[key])
            if "else" in a:
                walk(a["else"].get("actions", {}))
            for c in (a.get("cases") or {}).values():
                walk(c.get("actions", {}))
            if "default" in a:
                walk(a["default"].get("actions", {}))
    walk(d["actions"])
    if PP_REQUEST in str(d):
        raise SystemExit("as_http: the flow still reads the Power Pages request")
    return defn


def page_trigger(s: dict, key: str, defn: dict) -> dict:
    kind = (s.get("pageTriggers") or {}).get(key, "powerpages")
    if kind not in ("powerpages", "http"):
        raise SystemExit(f"flows.yaml: pageTriggers.{key} must be powerpages or http, not {kind}")
    return as_http(defn) if kind == "http" else defn


# ---------------------------------------------------------------------------
# CM - Add to calendar
# ---------------------------------------------------------------------------
def power_pages_trigger() -> dict:
    return {"type": "Request", "kind": "PowerPages", "inputs": {"schema": {
        "type": "object", "required": ["text"],
        "properties": {"text": {"title": "request", "type": "string", "x-ms-dynamically-added": True,
                                "description": "The request, as JSON: {\"actionId\": \"<Portal Action ID>\"}",
                                "x-ms-content-hint": "TEXT"}}}}}


def reply(name: str, result_expr: str, after: dict) -> tuple[str, dict]:
    return name, {"type": "Response", "kind": "PowerPages", "runAfter": after, "inputs": {
        "statusCode": 200, "body": {"result": "@{string(" + result_expr + ")}"},
        "schema": {"type": "object", "properties": {"result": {"title": "result", "type": "string", "x-ms-dynamically-added": True}}}}}


def add_to_calendar(s: dict) -> dict:
    """docs/DATAVERSE-MIGRATION.md, section 8, Add to calendar. The page records
    an Add to calendar Portal Action through the CM Portal Action form (so
    Requested By is the signed-in contact, set by the server) with the
    deadlines in Reason as JSON: {"page": "<matrix page URL>", "deadlines":
    [{"id", "due" (yyyy-MM-dd, the date the page shows), "title"}]}. A flow
    called by Power Pages runs on its own connections, not the visitor's, so
    each event is made on the CM - Office 365 Outlook account's calendar with
    the person invited: all day, shown as free, with a reminder. An event of
    the same subject that already invites them is left alone when its date
    matches and moved when it does not."""
    f = Flow(s)
    c = s["calendar"]
    A = "body('Get_action')"
    P = first("Find_person")
    err = "variables('Error')"
    email = f"trim(coalesce({P}?['su_email'], ''))"
    R = "outputs('Read_deadlines')"
    item = "items('For_each_deadline')"
    did = f"trim(string(coalesce({item}?['id'], '')))"
    due = f"trim(string(coalesce({item}?['due'], '')))"
    title = f"trim(string(coalesce({item}?['title'], '')))"
    D, F = first("Find_deadline"), first("Find_function")
    fn_name = f"coalesce({F}?['su_name'], '')"
    page = f"trim(string(coalesce({R}?['page'], '')))"
    link = (f"if(startsWith(toLower({page}), 'https://'), concat(first(split({page}, '#')), '#/functions/', "
            f"{F}?['su_compliancefunctionid']), '')")
    subject_full = f"concat({fn_name}, if(or(empty({title}), equals({title}, {fn_name})), '', concat(': ', {title})))"
    subject = "outputs('Subject')"
    marker = f"concat('Due date: ', {due})"
    body = html("<p><b>", f"={fn_name}", "</b></p><p>", f"={marker}", "</p><p>",
                f"=replace(coalesce({F}?['su_deadlinenarrative'], ''), decodeUriComponent('%0A'), '<br>')", "</p>",
                f"=if(empty({link}), '', concat('<p><a href=\"', {link}, '\">Open this function in the Compliance Matrix</a></p>'))")
    event = {"subject": f"@{{{subject}}}", "start": f"@{{concat({due}, 'T00:00:00')}}",
             "end": f"@{{concat(addDays({due}, 1, 'yyyy-MM-dd'), 'T00:00:00')}}", "timeZone": c["timeZone"],
             "isAllDay": True, "requiredAttendees": f"@{{{email}}}", "body": f"@{{{body}}}",
             "isReminderOn": True, "reminderMinutesBeforeStart": int(c["reminderMinutes"]),
             "showAs": "free", "importance": "normal"}
    cal = c["calendarId"]

    def outlook(op, params):
        return f.op("outlook", op, {"table": cal, **params})

    def check(name, cond, message):
        return name, when(f"and(empty({err}), {cond})", seq(("Set_" + name, set_var("Error", message))))

    mine = "body('Invites_this_person')"
    usable = (f"and(equals(length({did}), 36), equals(length({due}), 10), "
              f"equals({count('Find_deadline')}, 1), equals({count('Find_function')}, 1), "
              f"not(equals({D}?['su_complete'], true)))")
    per = seq(
        ("Find_deadline", f.list("su_compliancedeadlines",
                                 f"concat('su_compliancedeadlineid eq ', if(equals(length({did}), 36), {did}, {q(ZERO)}))",
                                 "su_compliancedeadlineid,su_name,_su_function_value,su_complete", 1)),
        ("Find_function", f.list("su_compliancefunctions",
                                 f"concat('su_compliancefunctionid eq ', coalesce({D}?['_su_function_value'], {q(ZERO)}))",
                                 "su_compliancefunctionid,su_name,su_deadlinenarrative", 1)),
        ("Usable", when(usable, seq(
            ("Subject", compose(f"@substring({subject_full}, 0, min(255, length({subject_full})))")),
            ("Find_event", outlook("V4CalendarGetItems", {"$filter": f"@{{concat('subject eq ', {odata(subject)})}}", "$top": 50})),
            ("Invites_this_person", {"type": "Query", "inputs": {
                "from": "@coalesce(body('Find_event')?['value'], json('[]'))",
                "where": f"@contains(toLower(coalesce(item()?['requiredAttendees'], '')), toLower({email}))"}}),
            ("New_or_existing", when(f"empty({mine})", seq(
                ("Create_event", outlook("V4CalendarPostItem", {"item/" + k: v for k, v in event.items()})),
                ("Count_added", add_one("Added"))),
                seq(("Same_date", when(f"contains(coalesce(first({mine})?['body'], ''), {marker})",
                                       seq(("Count_already", add_one("Already"))),
                                       seq(("Move_event", outlook("V4CalendarPatchItem", {
                                           "id": f"@{{first({mine})?['id']}}", **{"item/" + k: v for k, v in event.items()}})),
                                           ("Count_moved", add_one("Moved")))))))),
        ), seq(("Count_skipped", add_one("Skipped"))))))

    steps = seq(
        ("Read_request", set_var("ActionId", "@{coalesce(json(triggerBody()?['text'])?['actionId'], '')}")),
        ("Get_action", f.get("su_portalactions", "variables('ActionId')",
                             "su_portalactionid,su_action,su_status,su_reason,_su_requestedby_value")),
        ("Action_missing", {**check("Action_missing", "not(equals(actions('Get_action')?['status'], 'Succeeded'))",
                                    "That action does not exist.")[1], "runAfter": {"Get_action": ["Succeeded", "Failed"]}}),
        check("Already_processed", f"or(equals({A}?['su_status'], {DONE}), equals({A}?['su_status'], {FAILED}))",
              "That action has already been processed."),
        check("Not_a_calendar_request", f"not(equals({A}?['su_action'], {ADD_TO_CALENDAR}))",
              "That action is not a calendar request."),
        check("No_requester", f"empty(coalesce({A}?['_su_requestedby_value'], ''))", "This action has no requester."),
        ("Find_person", f.list("su_compliancedirectorys",
                               f"concat('_su_contact_value eq ', coalesce({A}?['_su_requestedby_value'], {q(ZERO)}), ' and su_active eq true')",
                               "su_compliancedirectoryid,su_name,su_email", 1)),
        check("Not_linked", f"equals({count('Find_person')}, 0)",
              "Your sign-in is not linked to a Compliance Directory record yet. Ask the compliance office to check "
              "your directory email."),
        check("No_email", f"and(greater({count('Find_person')}, 0), empty({email}))",
              "Your Compliance Directory record has no email, so there is no calendar to invite. Ask the compliance "
              "office to add it."),
        # the deadlines, as the page wrote them into Reason; bad JSON fails this step only
        ("Read_deadlines", compose(f"@json(if(empty(trim(coalesce({A}?['su_reason'], ''))), '{{}}', {A}?['su_reason']))")),
        ("Unreadable", {**check("Unreadable", "not(equals(actions('Read_deadlines')?['status'], 'Succeeded'))",
                                "That calendar request could not be read.")[1], "runAfter": {"Read_deadlines": ["Succeeded", "Failed"]}}),
        check("Nothing_to_add", f"and(equals(actions('Read_deadlines')?['status'], 'Succeeded'), "
                                f"empty(coalesce({R}?['deadlines'], json('[]'))))", "There are no deadlines to add."),
        ("Do_the_work", when(f"empty({err})", seq(
            ("For_each_deadline", {"type": "Foreach",
                                   "foreach": f"@take(coalesce({R}?['deadlines'], json('[]')), {int(c['maxDeadlines'])})",
                                   "actions": per, "runtimeConfiguration": {"concurrency": {"repetitions": 1}}})))),
    )
    counts = "concat('Added ', variables('Added'), ', moved ', variables('Moved'), ', already there ', variables('Already'), ', skipped ', variables('Skipped'))"
    ok = ("addProperty(addProperty(addProperty(addProperty(json('{\"ok\":true}'), 'added', variables('Added')), "
          "'moved', variables('Moved')), 'already', variables('Already')), 'skipped', variables('Skipped'))")
    refused = "addProperty(json('{\"ok\":false}'), 'error', " + err + ")"
    sorry = "The deadlines could not be added to your calendar. The compliance office has been told."
    acts = {
        "Initialize_ActionId": init_var("ActionId", "string", ""),
        **{n: {**init_var(v, t, val), "runAfter": {prev: ["Succeeded"]}} for n, v, t, val, prev in [
            ("Initialize_Error", "Error", "string", "", "Initialize_ActionId"),
            ("Initialize_Added", "Added", "integer", 0, "Initialize_Error"),
            ("Initialize_Moved", "Moved", "integer", 0, "Initialize_Added"),
            ("Initialize_Already", "Already", "integer", 0, "Initialize_Moved"),
            ("Initialize_Skipped", "Skipped", "integer", 0, "Initialize_Already")]},
        "Try": scope(steps, run_after={"Initialize_Skipped": ["Succeeded"]}),
        "Finish": when(f"empty({err})", seq(
            ("Record_done", f.update("su_portalactions", "variables('ActionId')", {
                "su_status": DONE, "su_result": "@{" + counts + "}", "su_processedon": "@{utcNow()}"})),
            reply("Reply_done", ok, {"Record_done": ["Succeeded", "Failed"]})),
            seq(("Has_an_action_row", when(f"and(equals(actions('Get_action')?['status'], 'Succeeded'), "
                                           f"not(or(equals({A}?['su_status'], {DONE}), equals({A}?['su_status'], {FAILED}))))",
                                           seq(("Record_refused", f.update("su_portalactions", "variables('ActionId')", {
                                               "su_status": FAILED, "su_result": "@{" + err + "}", "su_processedon": "@{utcNow()}"}))))),
                reply("Reply_refused", refused, {"Has_an_action_row": ["Succeeded", "Failed"]})),
            run_after={"Try": ["Succeeded"]}),
        "Catch": scope(seq(
            ("Record_error", f.update("su_portalactions", "variables('ActionId')", {
                "su_status": FAILED, "su_result": sorry, "su_processedon": "@{utcNow()}"})),
            reply("Reply_error", "addProperty(json('{\"ok\":false}'), 'error', " + q(sorry) + ")", {"Record_error": ["Succeeded", "Failed"]}),
            ("Alert_the_office", {**f.email("Compliance Matrix: CM - Add to calendar failed", html(
                "<p>A request to add deadlines to someone's calendar failed. They were told.</p>"
                "<ul><li>Portal Action ID: ", "=variables('ActionId')", "</li></ul><p>Run: ", "=" + RUN_LINK, "</p>")),
                "runAfter": {"Reply_error": ["Succeeded", "Failed"]}}),
            ("Fail_the_run", {**terminate("Failed", "CM - Add to calendar failed; the office was emailed."),
                              "runAfter": {"Alert_the_office": ["Succeeded", "Failed"]}})),
            run_after={"Try": ["Failed", "TimedOut"]}),
    }
    return page_trigger(s, "addToCalendar", definition("manual", power_pages_trigger(), acts, f.used, s))


FLOWS = [
    ("CM - Link directory to contact", "Links a new Entra sign-in to its Compliance Directory row (section 6).", link_directory_to_contact),
    ("CM - Link contact to directory", "Links a directory row to the person's existing sign-in when its email is set (section 6).", link_contact_to_directory),
    ("CM - Link existing sign-ins", "Run by hand: links every Entra sign-in already on the site (section 6).", link_existing_sign_ins),
    ("CM - Process portal action", "Carries out a Portal Action for the matrix page (section 8).", process_portal_action),
    ("CM - Sync directory from M365", "Weekly, and by hand: copies title, unit, office, phone and photo from Microsoft 365 "
     "to the Compliance Directory (section 6).", sync_directory),
    ("CM - Add to calendar", "Invites the signed-in person to an all-day Outlook event for each deadline they add (section 8).",
     add_to_calendar),
]


def flow_id(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE, name))


def file_stem(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", name) + "-" + flow_id(name).upper()


def load_settings(path: pathlib.Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def build_all(settings: dict) -> list[dict]:
    return [{"name": n, "description": d, "id": flow_id(n), "stem": file_stem(n), "definition": fn(settings)}
            for n, d, fn in FLOWS]


# ---------------------------------------------------------------------------
# static checks on a definition
# ---------------------------------------------------------------------------
def lint(defn: dict) -> list[str]:
    errors = []
    names: dict[str, int] = {}
    refs = defn["properties"]["connectionReferences"]

    def walk(actions: dict, where: str, in_loop: bool):
        for name, a in actions.items():
            names[name] = names.get(name, 0) + 1
            for dep in (a.get("runAfter") or {}):
                if dep not in actions:
                    errors.append(f"{where}/{name}: runAfter {dep} is not in the same scope")
            if a.get("type") == "Terminate" and in_loop:
                errors.append(f"{where}/{name}: Terminate is not allowed inside a loop")
            inputs = a.get("inputs")
            host = inputs.get("host") if isinstance(inputs, dict) else None
            if host and host["connectionName"] not in refs:
                errors.append(f"{where}/{name}: connection {host['connectionName']} has no connection reference")
            loop = in_loop or a.get("type") == "Foreach"
            for key in ("actions",):
                if key in a:
                    walk(a[key], where + "/" + name, loop)
            if "else" in a:
                walk(a["else"].get("actions", {}), where + "/" + name + "(else)", loop)
            for cname, c in (a.get("cases") or {}).items():
                walk(c.get("actions", {}), where + "/" + name + "/" + cname, loop)
            if "default" in a:
                walk(a["default"].get("actions", {}), where + "/" + name + "(default)", loop)
        # one action per scope starts it, or several run in parallel by design
        if actions and not any(not a.get("runAfter") for a in actions.values()):
            errors.append(f"{where}: no action starts this scope")

    walk(defn["properties"]["definition"]["actions"], "", False)
    errors += [f"action name {n} is used {c} times" for n, c in names.items() if c > 1]
    return errors
