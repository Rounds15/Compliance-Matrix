#!/usr/bin/env python3
"""
Generate a standalone, paste-ready mockup of the canvas app.

The production screens bind to Dataverse tables and choice sets, so they cannot
be opened in Studio until the solution is imported. This script rewrites them to
run entirely on in-memory collections, which lets the layout, colours, spacing,
and states be tuned in Studio before any data work happens.

What it rewrites:
  * Dataverse table names   'Compliance Functions'  ->  dsFunctions
  * choice set references   'Risk Level'.High       ->  "High"
  * record creation         Patch(X, Defaults(X),.) ->  Collect(X, .)
  * the Power BI control    replaced with a placeholder panel
  * App.OnStart             mock collections instead of lookups

The `ds` prefix is deliberate: the screens already declare collections named
colFunctions, colDeadlines and so on, and reusing those names would produce
self-referential ClearCollect calls that silently return empty.

Mock data is a representative slice of the real seed, plus a handful of
synthesised rows that exist only to exercise visual states the live data does
not contain yet - High and Moderate risk, an Event-Relative deadline with no
due date, and a Closed gap. Tuning a state you cannot see is guesswork.

Usage:
    python3 tools/build_mockup.py [--out mockup]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fix_yaml_comments import strip_comments  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CANVAS = ROOT / "solution" / "canvas" / "Src"
SEED = ROOT / "solution" / "schema" / "seed"

# Dataverse display name -> mock collection name.
TABLES = {
    "Compliance Functions": "dsFunctions",
    "Compliance Deadlines": "dsDeadlines",
    "Compliance Gaps": "dsGaps",
    "Compliance Directory": "dsDirectory",
    "Function Ownership": "dsOwnership",
    "Function Flags": "dsFlags",
    "Assessments": "dsAssessments",
    "Assessment Owners": "dsAssessmentOwners",
    "Risk Areas": "dsRiskAreas",
    "Domains": "dsDomains",
    "Counsel Assignments": "dsCounsel",
    "App Role Assignments": "dsAppAdmin",
}

CHOICE_SETS = [
    "Risk Level", "Cadence", "Deadline Type", "Offset Unit", "Gap Status",
    "Ownership Role", "Ownership Sub-role", "Flag Status", "Flag Source",
    "Assessment Status", "Assessment Owner Role", "Application Role",
]


def transform(text: str) -> str:
    """Rewrite one .fx.yaml from Dataverse bindings to collection bindings."""

    # -- choice sets: 'Set'.'Option With Spaces'  and  'Set'.Option ----------
    for cs in CHOICE_SETS:
        text = re.sub(rf"'{re.escape(cs)}'\.'([^']+)'", r'"\1"', text)
        text = re.sub(rf"'{re.escape(cs)}'\.([A-Za-z][A-Za-z0-9_]*)", r'"\1"', text)

    # -- table names --------------------------------------------------------
    # Longest first so 'Assessment Owners' is not clipped by 'Assessments'.
    for display in sorted(TABLES, key=len, reverse=True):
        text = text.replace(f"'{display}'", TABLES[display])

    # -- record creation ----------------------------------------------------
    # Patch(ds, Defaults(ds), {...}) has no meaning against a collection.
    text = re.sub(r"Patch\(\s*\n(\s*)(ds\w+),\s*\n\s*Defaults\(ds\w+\),",
                  r"Collect(\n\1\2,", text)
    text = re.sub(r"Patch\((ds\w+),\s*Defaults\(ds\w+\),", r"Collect(\1,", text)

    # -- Power BI -----------------------------------------------------------
    # The control needs a real workspace and report; swap it for a labelled
    # placeholder so the Reporting screen still lays out correctly.
    text = re.sub(
        r"( *)- pbi_Executive:\n(?:.*?\n)*?(?=\1- lbl_PbiNote:)",
        lambda m: (
            f"{m.group(1)}- rec_PbiPlaceholder:\n"
            f"{m.group(1)}    Control: Rectangle@2.3.0\n"
            f"{m.group(1)}    Properties:\n"
            f"{m.group(1)}        X: =64\n"
            f"{m.group(1)}        Y: =324\n"
            f"{m.group(1)}        Width: =Parent.Width - 128\n"
            f"{m.group(1)}        Height: =Parent.Height - 500\n"
            f"{m.group(1)}        Visible: =gblRptTab = \"embed\"\n"
            f"{m.group(1)}        Fill: =gblTheme.Surface\n"
            f"{m.group(1)}        BorderColor: =gblTheme.Border\n"
            f"{m.group(1)}        BorderThickness: =1\n"
            f"{m.group(1)}- lbl_PbiPlaceholder:\n"
            f"{m.group(1)}    Control: Label@2.5.1\n"
            f"{m.group(1)}    Properties:\n"
            f"{m.group(1)}        X: =64\n"
            f"{m.group(1)}        Y: =(Parent.Height - 500) / 2 + 250\n"
            f"{m.group(1)}        Width: =Parent.Width - 128\n"
            f"{m.group(1)}        Height: =60\n"
            f"{m.group(1)}        Visible: =gblRptTab = \"embed\"\n"
            f"{m.group(1)}        Text: =\"Power BI report renders here once the workspace and report IDs are set\"\n"
            f"{m.group(1)}        Color: =gblTheme.GrayMid\n"
            f"{m.group(1)}        Size: =12\n"
            f"{m.group(1)}        Align: =Align.Center\n"
            f"{m.group(1)}        VerticalAlign: =VerticalAlign.Middle\n"
            f"{m.group(1)}        Font: =gblTheme.FontBody\n"
        ),
        text, flags=0)

    # Environment variables do not exist outside the solution.
    for var in ("su_PowerBIWorkspaceId", "su_PowerBIExecutiveReportId",
                "su_PowerBIDeadlineReportId", "su_PowerBIGapAgingReportId"):
        text = text.replace(var, f'"{var}-not-set"')

    # Studio's Paste code parser rejects YAML comments with PA1001. The
    # stripper is quote-aware, so hex colours and the inline SVG fills survive.
    text, _ = strip_comments(text)
    return text


# ---------------------------------------------------------------------------
def load_seed(name: str, key: str) -> list[dict]:
    path = SEED / name
    if not path.exists():
        return []
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get(key, []) or []


def fx_str(v) -> str:
    if v is None or v == "":
        return '""'
    return '"' + str(v).replace('"', '""').replace("\n", " ").strip() + '"'


def build_mock_data() -> str:
    """Compose the OnStart mock collections from a slice of the real seed."""
    riskareas = load_seed("riskareas.yaml", "riskareas")
    domains = load_seed("domains.yaml", "domains")
    directory = load_seed("directory.yaml", "directory")
    functions = load_seed("functions.yaml", "functions")
    assessments = load_seed("assessments.yaml", "assessments")

    if not functions:
        print("warning: seed not generated; mock data will be minimal",
              file=sys.stderr)

    # 6 risk areas, and every domain under them, so the drill has depth.
    ra = riskareas[:6]
    ra_codes = {r["code"] for r in ra}
    dm = [d for d in domains if d.get("riskArea") in ra_codes][:14]
    dm_codes = {d["code"] for d in dm}

    # Functions inside those domains, capped so Studio stays responsive.
    fns = [f for f in functions if f.get("domain") in dm_codes][:16]
    # Ensure the ungrouped-function state is visible.
    orphan = next((f for f in functions if not f.get("domain")), None)
    if orphan and orphan not in fns:
        fns = fns[:15] + [orphan]

    people_emails = set()
    for f in fns:
        for k in ("executiveOwner", "unitOwner", "complianceOwner"):
            if f.get(k):
                people_emails.add(f[k])
    ppl = [p for p in directory if p["email"] in people_emails][:12]
    if len(ppl) < 6:
        ppl = directory[:12]

    def rec(pairs: list[str], indent: int = 24) -> str:
        pad = " " * indent
        return "{" + ", ".join(pairs) + "}"

    lines: list[str] = []
    A = lines.append

    # -- risk areas ---------------------------------------------------------
    A("            ClearCollect(")
    A("                dsRiskAreas,")
    for i, r in enumerate(ra):
        A(f"                {{su_riskareaid: {fx_str(r['code'])}, "
          f"su_riskareacode: {fx_str(r['code'])}, su_name: {fx_str(r['name'])}, "
          f"su_colorhex: {fx_str(r.get('colorHex') or '#000E54')}, "
          f"su_sortorder: {i * 10}}}" + ("," if i < len(ra) - 1 else ""))
    A("            );")

    # -- domains ------------------------------------------------------------
    A("            ClearCollect(")
    A("                dsDomains,")
    for i, d in enumerate(dm):
        parent = next((r for r in ra if r["code"] == d.get("riskArea")), None)
        pr = ("{su_riskareaid: " + fx_str(parent["code"]) +
              ", su_name: " + fx_str(parent["name"]) +
              ", su_colorhex: " + fx_str(parent.get("colorHex") or "#000E54") + "}"
              ) if parent else "Blank()"
        # Every second domain gets a real owner and the rest get a typed blank
        # record. A column that is Blank() in every row has no inferred type,
        # and .su_name against it errors instead of returning blank - which is
        # exactly the kind of thing that eats an afternoon in Studio.
        own = ("{su_compliancedirectoryid: " + fx_str(ppl[i % len(ppl)]["email"]) +
               ", su_name: " + fx_str(ppl[i % len(ppl)]["name"]) +
               ", su_unit: \"Syracuse University\"}") if i % 2 == 0 else \
              ("{su_compliancedirectoryid: \"\", su_name: \"\", su_unit: \"\"}")
        A(f"                {{su_domainid: {fx_str(d['code'])}, "
          f"su_domaincode: {fx_str(d['code'])}, su_name: {fx_str(d['name'])}, "
          f"su_riskarea: {pr}, su_owner: {own}}}"
          + ("," if i < len(dm) - 1 else ""))
    A("            );")

    # -- directory ----------------------------------------------------------
    A("            ClearCollect(")
    A("                dsDirectory,")
    for i, p in enumerate(ppl):
        A(f"                {{su_compliancedirectoryid: {fx_str(p['email'])}, "
          f"su_name: {fx_str(p['name'])}, su_email: {fx_str(p['email'])}, "
          f"su_jobtitle: {fx_str(p.get('jobTitle') or 'Compliance Owner')}, "
          f"su_unit: {fx_str('Syracuse University')}, "
          f"su_phone: \"315-443-0000\", su_location: \"Crouse Hinds Hall\", "
          f"su_isexecutive: {'true' if i < 4 else 'false'}, su_active: true}}"
          + ("," if i < len(ppl) - 1 else ""))
    A("            );")

    # -- functions ----------------------------------------------------------
    # Risk is Low or blank in the live data. The first three rows are forced to
    # High / Moderate / Low so every pill colour is visible while tuning; the
    # rest keep their real value, which is mostly blank -> Unrated.
    forced = ["High", "Moderate", "Low"]
    A("            ClearCollect(")
    A("                dsFunctions,")
    for i, f in enumerate(fns):
        parent_ra = next((r for r in ra if r["code"] == f.get("riskArea")), None)
        parent_dm = next((d for d in dm if d["code"] == f.get("domain")), None)
        ra_rec = ("{su_riskareaid: " + fx_str(parent_ra["code"]) +
                  ", su_name: " + fx_str(parent_ra["name"]) + "}") if parent_ra else "Blank()"
        dm_rec = ("{su_domainid: " + fx_str(parent_dm["code"]) +
                  ", su_name: " + fx_str(parent_dm["name"]) + "}") if parent_dm else "Blank()"

        def person(key):
            e = f.get(key)
            if not e:
                return "Blank()"
            p = next((x for x in ppl if x["email"] == e), None)
            if not p:
                return "Blank()"
            return ("{su_compliancedirectoryid: " + fx_str(p["email"]) +
                    ", su_name: " + fx_str(p["name"]) +
                    ", su_email: " + fx_str(p["email"]) +
                    ", su_unit: \"Syracuse University\"}")

        risk = forced[i] if i < 3 else (f.get("risk") or "")
        A(f"                {{su_compliancefunctionid: {fx_str(f['code'])}, "
          f"su_functioncode: {fx_str(f['code'])}, su_name: {fx_str(f['name'])}, "
          f"su_riskarea: {ra_rec}, su_domain: {dm_rec}, su_risk: {fx_str(risk)}, "
          f"su_statute: {fx_str(f.get('statute'))}, "
          f"su_citation: {fx_str(f.get('citation'))}, "
          f"su_statuteurl: {fx_str(f.get('statuteUrl') or 'https://www.ecfr.gov')}, "
          f"su_description: {fx_str((f.get('description') or '')[:400])}, "
          f"su_reporting: {fx_str((f.get('reporting') or '')[:300])}, "
          f"su_deadlinenarrative: {fx_str((f.get('deadlineNarrative') or '')[:200])}, "
          f"su_resourcelabel: {fx_str(f.get('resourceLabel') or 'University Policies')}, "
          f"su_resourceurl: {fx_str(f.get('resourceUrl') or 'https://policies.syr.edu')}, "
          f"su_executiveowner: {person('executiveOwner')}, "
          f"su_unitowner: {person('unitOwner')}, "
          f"su_complianceowner: {person('complianceOwner')}, "
          f"su_opengapcount: {2 if i == 0 else (1 if i == 1 else 0)}, "
          f"su_nextduedate: DateAdd(Today(), {(i * 23) - 40}, TimeUnit.Days), "
          f"su_lastreviewed: DateAdd(Today(), -30, TimeUnit.Days), "
          f"su_isflagged: {'true' if i in (0, 4) else 'false'}}}"
          + ("," if i < len(fns) - 1 else ""))
    A("            );")

    fcodes = [f["code"] for f in fns]
    f0 = fcodes[0] if fcodes else "CF-1"

    # -- assessments --------------------------------------------------------
    A("            ClearCollect(")
    A("                dsAssessments,")
    for i, a in enumerate(assessments[:6] or [{}]):
        A(f"                {{su_assessmentid: {fx_str(a.get('code') or f'ASMT{i}')}, "
          f"su_assessmentcode: {fx_str(a.get('code') or f'ASMT{i}')}, "
          f"su_name: {fx_str(a.get('name') or 'Sample assessment')}, "
          f"su_assessmentdate: DateAdd(Today(), {-30 - i * 45}, TimeUnit.Days), "
          f"su_risk: {fx_str(['High','Moderate','Low'][i % 3])}, "
          f"su_status: {fx_str(a.get('status') or 'Drafting')}, "
          f"su_currentholder: {fx_str(a.get('currentHolder') or 'Compliance Office')}, "
          f"su_followupround: {a.get('followUpRound') or 0}, "
          f"su_unit: {fx_str(a.get('unit') or 'Syracuse University')}, "
          f"su_keycontrolsmissing: {a.get('keyControlsMissing') or i}, "
          f"su_approverstext: {fx_str(a.get('approversText') or 'Pending match')}, "
          f"su_fileurl: {fx_str(a.get('fileUrl') or 'https://syr.edu')}}}"
          + ("," if i < len(assessments[:6] or [{}]) - 1 else ""))
    A("            );")

    # -- gaps: one per status so all three pills render ---------------------
    A("            ClearCollect(")
    A("                dsGaps,")
    for i, (status, sev) in enumerate(
            [("Open", "High"), ("Open", "Moderate"),
             ("In Progress", "Moderate"), ("Closed", "Low")]):
        A(f"                {{su_compliancegapid: \"GAP-{i}\", su_gapcode: \"GAP-{200+i}\", "
          f"su_name: \"Sample gap {i + 1} for visual tuning\", "
          f"su_function: {{su_compliancefunctionid: {fx_str(fcodes[i % len(fcodes)])}, "
          f"su_name: {fx_str(fns[i % len(fns)]['name'])}, "
          f"su_risk: {fx_str('High' if i == 0 else 'Low')}}}, "
          f"su_assessment: {{su_assessmentid: {fx_str((assessments[0] or {}).get('code') or 'ASMT0')}, "
          f"su_assessmentcode: {fx_str((assessments[0] or {}).get('code') or 'ASMT0')}}}, "
          f"su_severity: {fx_str(sev)}, su_status: {fx_str(status)}, "
          f"su_openeddate: DateAdd(Today(), {-90 + i * 20}, TimeUnit.Days), "
          f"su_closeddate: {'DateAdd(Today(), -5, TimeUnit.Days)' if status == 'Closed' else 'Blank()'}, "
          f"su_daysopen: {90 - i * 20}, "
          f"su_targetquarter: \"Q{i + 1}\", su_targetfy: \"FY27\", "
          f"su_note: \"Remediation detail shown here so the card height can be tuned.\", "
          f"su_closenote: \"Closure note.\", "
          f"su_owner: {{su_compliancedirectoryid: {fx_str(ppl[0]['email'])}, "
          f"su_name: {fx_str(ppl[0]['name'])}}}}}"
          + ("," if i < 3 else ""))
    A("            );")

    # -- deadlines: Fixed Recurring plus one dateless type ------------------
    A("            ClearCollect(")
    A("                dsDeadlines,")
    rows = []
    for i, f in enumerate(fns[:8]):
        rows.append(
            f"                {{su_compliancedeadlineid: \"DL-{i}\", "
            f"su_name: {fx_str(f['name'][:60] + ' - annual filing')}, "
            f"su_function: {{su_compliancefunctionid: {fx_str(f['code'])}, "
            f"su_name: {fx_str(f['name'])}}}, "
            f"su_deadlinetype: \"Fixed Recurring\", su_cadence: \"Annually\", "
            f"su_duedate: DateAdd(Today(), {(i * 31) - 45}, TimeUnit.Days), "
            f"su_duemonthnum: {(i % 12) + 1}, su_dueday: 15, "
            f"su_triggerevent: Blank(), su_offsetvalue: Blank(), su_offsetunit: Blank(), "
            f"su_notes: \"Sample deadline note.\", "
            f"su_complete: {'true' if i == 7 else 'false'}, "
            f"su_completeddate: {'DateAdd(Today(), -10, TimeUnit.Days)' if i == 7 else 'Blank()'}, "
            f"su_risk: {fx_str('High' if i == 0 else 'Low')}, "
            f"su_owner: {{su_compliancedirectoryid: {fx_str(ppl[0]['email'])}, "
            f"su_name: {fx_str(ppl[0]['name'])}, su_unit: \"Syracuse University\"}}}}")
    # Synthesised: the live export has no Event-Relative rows, but the pill and
    # the No fixed date scope both need to be visible while tuning.
    rows.append(
        f"                {{su_compliancedeadlineid: \"DL-ER\", "
        f"su_name: \"Event-relative example - report within 30 days\", "
        f"su_function: {{su_compliancefunctionid: {fx_str(f0)}, "
        f"su_name: {fx_str(fns[0]['name'])}}}, "
        f"su_deadlinetype: \"Event-Relative\", su_cadence: Blank(), "
        f"su_duedate: Blank(), su_duemonthnum: Blank(), su_dueday: Blank(), "
        f"su_triggerevent: \"Notice of a reportable incident\", "
        f"su_offsetvalue: 30, su_offsetunit: \"Days\", "
        f"su_notes: \"No fixed date; renders from trigger and offset.\", "
        f"su_complete: false, su_completeddate: Blank(), su_risk: \"Moderate\", "
        f"su_owner: {{su_compliancedirectoryid: {fx_str(ppl[0]['email'])}, "
        f"su_name: {fx_str(ppl[0]['name'])}, su_unit: \"Syracuse University\"}}}}")
    A(",\n".join(rows))
    A("            );")

    # -- ownership, flags, assessment owners, counsel ------------------------
    A("            ClearCollect(")
    A("                dsOwnership,")
    orows = []
    for i, f in enumerate(fns[:10]):
        for role, sub, who in (("Executive Owner", "Primary", 0),
                               ("Unit Owner", "Primary", 1),
                               ("Compliance Owner", "Primary", 2),
                               ("Compliance Owner", "Advisory", 3)):
            if who >= len(ppl) or (role == "Compliance Owner" and sub == "Advisory" and i > 1):
                continue
            p = ppl[who]
            orows.append(
                f"                {{su_functionownershipid: \"FO-{i}-{role[:2]}-{sub[:2]}\", "
                f"su_name: {fx_str(p['name'] + ' - ' + role + ' - ' + f['code'])}, "
                f"su_function: {{su_compliancefunctionid: {fx_str(f['code'])}, "
                f"su_name: {fx_str(f['name'])}, "
                f"su_risk: {fx_str('High' if i == 0 else 'Low')}, "
                f"su_topicplaceholder: \"\"}}, "
                f"su_person: {{su_compliancedirectoryid: {fx_str(p['email'])}, "
                f"su_name: {fx_str(p['name'])}, "
                f"su_jobtitle: {fx_str(p.get('jobTitle') or 'Compliance Owner')}, "
                f"su_email: {fx_str(p['email'])}}}, "
                f"su_role: {fx_str(role)}, su_subrole: {fx_str(sub)}}}")
    A(",\n".join(orows))
    A("            );")

    A("            ClearCollect(")
    A("                dsFlags,")
    A(f"                {{su_functionflagid: \"FL-1\", su_name: \"Citation may be superseded\", "
      f"su_function: {{su_compliancefunctionid: {fx_str(f0)}, "
      f"su_name: {fx_str(fns[0]['name'])}, "
      f"su_riskarea: {{su_name: {fx_str(ra[0]['name'] if ra else 'Risk area')}}}}}, "
      f"su_reason: \"Citation may be superseded by the 2026 final rule. Please confirm.\", "
      f"su_source: \"Manual\", su_status: \"Active\", "
      f"su_flaggedby: {{su_compliancedirectoryid: {fx_str(ppl[0]['email'])}, "
      f"su_name: {fx_str(ppl[0]['name'])}}}, "
      f"su_flaggedon: DateAdd(Today(), -9, TimeUnit.Days), "
      f"su_clearedby: {{su_compliancedirectoryid: \"\", su_name: \"\"}}, "
      f"su_clearedon: Blank()}}")
    A("            );")

    A("            ClearCollect(")
    A("                dsAssessmentOwners,")
    aowners = []
    for i, p in enumerate(ppl[:4]):
        aowners.append(
            f"                {{su_assessmentownerid: \"AO-{i}\", "
            f"su_name: {fx_str(p['name'] + ' - owner')}, "
            f"su_assessment: {{su_assessmentid: {fx_str((assessments[0] or {}).get('code') or 'ASMT0')}, "
            f"su_assessmentcode: {fx_str((assessments[0] or {}).get('code') or 'ASMT0')}}}, "
            f"su_person: {{su_compliancedirectoryid: {fx_str(p['email'])}, "
            f"su_name: {fx_str(p['name'])}, "
            f"su_jobtitle: {fx_str(p.get('jobTitle') or 'Compliance Owner')}}}, "
            f"su_role: {fx_str('Compliance' if i % 2 == 0 else 'Executive')}}}")
    A(",\n".join(aowners))
    A("            );")

    A("            ClearCollect(")
    A("                dsCounsel,")
    A(f"                {{su_counselassignmentid: \"CA-0\", su_name: \"Default escalation\", "
      f"su_riskarea: {{su_riskareaid: \"\", su_name: \"\"}}, su_isdefault: true, "
      f"su_attorney: {{su_compliancedirectoryid: {fx_str(ppl[0]['email'])}, "
      f"su_name: {fx_str(ppl[0]['name'])}, "
      f"su_jobtitle: \"Senior Vice President and General Counsel\", "
      f"su_email: {fx_str(ppl[0]['email'])}, su_phone: \"315-443-1104\", "
      f"su_location: \"300 Crouse Hinds Hall\"}}}}")
    A("            );")
    A("            ClearCollect(dsAppAdmin, {su_appadminid: \"AA-0\"});")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
def build_app(out: pathlib.Path) -> None:
    src = (CANVAS / "App.fx.yaml").read_text(encoding="utf-8")

    # Keep the theme block verbatim; replace everything after it.
    cut = src.index("            // ---- Fiscal calendar")
    header = src[:cut]

    body = f"""            // ---- Fiscal calendar ---------------------------------------------
            Set(gblFiscalStartMonth, 7);
            Set(gblToday, Today());

            // =================================================================
            // MOCKUP MODE - no Dataverse
            // =================================================================
            // Every ds* collection below stands in for a Dataverse table so the
            // screens run in Studio with nothing connected. Generated by
            // tools/build_mockup.py from a slice of the real seed; do not hand
            // edit, regenerate instead.
            //
            // Risk on the first three functions is forced to High / Moderate /
            // Low so all three pill colours are visible; the rest keep their
            // real value, which is mostly blank and renders as Unrated. One
            // deadline is Event-Relative so the "No fixed date" state shows.
            // =================================================================

{build_mock_data()}

            // ---- Signed-in user ----------------------------------------------
            // Pinned to a seeded person so "Assigned to you" is populated no
            // matter who opens the mockup.
            Set(gblMe, First(dsDirectory));
            Set(gblRole, "Administrator");
            // Admin in the mockup so every gated screen is reachable for tuning.
            Set(gblIsAdmin, true);

            // ---- Reference data ----------------------------------------------
            ClearCollect(colRiskAreas, dsRiskAreas);
            ClearCollect(colDomains, dsDomains);
            ClearCollect(colCounsel, dsCounsel);
            Set(gblDefaultCounsel, First(dsCounsel));

            // ---- Navigation state --------------------------------------------
            Clear(colNavHistory);
            Set(gblSelectedFunction, Blank());
            Set(gblSelectedAssessment, Blank());
            Set(gblOpenGapCount, CountRows(Filter(dsGaps, su_status <> "Closed")));
            Set(
                gblFilter,
                {{Query: "", RiskArea: "All", Risk: "All", Domain: "All"}}
            );

        StartScreen: =scr_Home
"""
    text = header + body
    text = text.replace(
        "// Theme values come from the Syracuse University Brand Guidelines",
        "// MOCKUP BUILD - runs with no Dataverse connection.\n"
        "// Theme values come from the Syracuse University Brand Guidelines")
    # Same PA1001 rule applies to the App object. Power Fx `//` comments inside
    # the OnStart formula are left alone; only YAML `#` comments are removed.
    text, _ = strip_comments(text)
    (out / "App.fx.yaml").write_text(text, encoding="utf-8")
    print("  App.fx.yaml")


def build_single_document(out: pathlib.Path) -> None:
    """
    Merge everything into one complete app document.

    A PaModule is the root type the parser validates against, and its
    properties are App / Screens / ComponentDefinitions / DataSources /
    EditorState. Emitting all three sections in one file removes any question
    about what a fragment is being pasted into - it is a whole, valid app.

    Merged as text rather than through a YAML round-trip, because round-tripping
    reflows the Power Fx block scalars and the formatting is the thing being
    tuned.
    """
    def body(path: pathlib.Path, root: str) -> str:
        text = path.read_text(encoding="utf-8")
        idx = text.index(f"{root}:")
        after = text[idx + len(root) + 1:].lstrip("\n")
        return after.rstrip() + "\n"

    parts: list[str] = []
    parts.append("App:\n" + body(out / "App.fx.yaml", "App"))
    parts.append("\nComponentDefinitions:\n")
    for f in sorted((out / "Components").glob("*.fx.yaml")):
        parts.append(body(f, "ComponentDefinitions"))
    parts.append("\nScreens:\n")
    for f in sorted(out.glob("scr_*.fx.yaml")):
        parts.append(body(f, "Screens"))

    dest = out / "ComplianceMatrix.pa.yaml"
    dest.write_text("".join(parts), encoding="utf-8")
    lines = len(dest.read_text(encoding="utf-8").splitlines())
    print(f"\n  {dest.name}  ({lines:,} lines) - complete app, all sections")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "mockup")
    args = ap.parse_args(argv)

    out = args.out
    (out / "Components").mkdir(parents=True, exist_ok=True)
    print(f"Writing mockup to {out}/\n")

    build_app(out)

    for path in sorted(CANVAS.rglob("*.fx.yaml")):
        if path.name == "App.fx.yaml":
            continue
        dest = out / ("Components" if path.parent.name == "Components" else ".") / path.name
        dest.write_text(transform(path.read_text(encoding="utf-8")), encoding="utf-8")
        print(f"  {dest.relative_to(out)}")

    build_single_document(out)

    print("\nPaste order in Power Apps Studio:")
    print("  1. Components/cmp_*.fx.yaml  (one file per component, paste whole file)")
    print("  2. App.fx.yaml OnStart       (paste into the App object, then Run OnStart)")
    print("  3. each scr_*.fx.yaml        (right-click screen list, Paste code)")
    print("\nEvery file carries its own root key and is comment-free, so each")
    print("pastes on its own without editing.")
    print("\nIf per-file paste is rejected, use ComplianceMatrix.pa.yaml - one")
    print("complete app document, which is what the Source Code schema expects.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
