#!/usr/bin/env python3
"""
Generate Dataverse seed YAML from the dataverse_import CSV exports.

Reads the ten CSVs pulled from the live SharePoint lists and emits one seed
file per table, in dependency order, with relationships expressed as alternate
key values rather than GUIDs so a re-run updates rather than duplicates.

Real calendar dates are preserved as-is. The prototype seed stored day offsets
from the import date so a demo always looked live; a compliance register cannot
do that, because a due date is a fact about the world.

Rows whose required lookup cannot be resolved are written to `_rejected.yaml`
with a reason rather than dropped silently or emitted knowing they will fail on
import. The counts are reported at the end so the split is never a surprise.

Usage:
    python3 tools/build_seed.py <dataverse_import-dir> [--out solution/schema/seed]
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import sys
from collections import Counter, defaultdict

import yaml


class _Dumper(yaml.SafeDumper):
    """Block-style dumper that keeps long prose readable."""


def _str_presenter(dumper: yaml.Dumper, data: str):
    style = "|" if "\n" in data else None
    if style is None and len(data) > 160:
        style = ">"
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_Dumper.add_representer(str, _str_presenter)

# Load order. Each table's lookups must already exist when it is imported.
LOAD_ORDER = [
    "riskareas", "domains", "directory", "functions", "ownership",
    "deadlines", "flags", "assessments", "assessmentowners", "gaps",
]

rejected: list[dict] = []


def reject(table: str, key: str, reason: str) -> None:
    rejected.append({"table": table, "row": key, "reason": reason})


def read(path: pathlib.Path) -> list[dict]:
    # utf-8-sig: the exports carry a BOM, which would otherwise corrupt the
    # first column name and silently break every lookup keyed on it.
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


def blank(v: str | None):
    """Empty CSV cells become YAML null, not empty strings."""
    return v if v else None


def to_int(v: str | None):
    try:
        return int(v) if v not in (None, "") else None
    except ValueError:
        return None


def write(path: pathlib.Path, header: str, key: str, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        fh.write(header.rstrip() + "\n\n")
        yaml.dump({key: rows}, fh, Dumper=_Dumper, sort_keys=False,
                  allow_unicode=True, width=100, default_flow_style=False)
    print(f"  {path.name:26s} {len(rows):>5,d} rows")


# ---------------------------------------------------------------------------
def build(src: pathlib.Path, out: pathlib.Path) -> dict[str, int]:
    R = lambda f: read(src / f)  # noqa: E731
    totals: dict[str, int] = {}

    persons = R("03_Persons.csv")
    by_email = {p["Email"].lower(): p for p in persons if p["Email"]}
    by_name = {p["FullName"]: p for p in persons if p["FullName"]}
    # PersonKey is the join used by the ownership exports; a blank key is the
    # export's own marker for "this name never matched a directory person".
    by_key = {p["PersonKey"]: p for p in persons if p["PersonKey"]}

    def email_of_key(key: str) -> str | None:
        p = by_key.get(key)
        return p["Email"] if p and p["Email"] else None

    # -- 01 risk areas -------------------------------------------------------
    rows = [
        {
            "code": r["RiskAreaID"],
            "name": r["RiskAreaName"],
            "colorHex": blank(r["ColorHex"]),
            "owner": blank(r["RiskAreaOwnerEmail"].lower()),
            "sortOrder": i * 10,
        }
        for i, r in enumerate(R("01_RiskAreas.csv"))
    ]
    write(out / "riskareas.yaml",
          "# su_riskarea - matched on su_riskareacode.\n"
          "# owner holds a directory email, resolved to a lookup on import.",
          "riskareas", rows)
    totals["riskareas"] = len(rows)
    riskarea_codes = {r["code"] for r in rows}

    # -- 02 domains ----------------------------------------------------------
    rows = []
    for r in R("02_Domains.csv"):
        ra = r["RiskAreaID"]
        if ra and ra not in riskarea_codes:
            reject("domains", r["DomainID"], f"RiskAreaID {ra} not found")
            continue
        rows.append({
            "code": r["DomainID"],
            "name": r["DomainName"],
            "riskArea": blank(ra),
            "owner": blank(r["DomainOwnerEmail"].lower()),
        })
    write(out / "domains.yaml",
          "# su_domain - matched on su_domaincode; riskArea resolves via su_riskareacode.",
          "domains", rows)
    totals["domains"] = len(rows)
    domain_codes = {r["code"] for r in rows}

    # -- 03 directory --------------------------------------------------------
    rows = [
        {
            "email": p["Email"].lower(),
            "name": p["FullName"],
            "jobTitle": blank(p["JobTitle"]),
            "active": True,
        }
        for p in persons if p["Email"]
    ]
    write(out / "directory.yaml",
          "# su_compliancedirectory - matched on su_email, which is an alternate key.\n"
          "# Unit, phone, location, and NetID are not in the export; they are filled\n"
          "# in the app or by a later Entra ID sync.",
          "directory", rows)
    totals["directory"] = len(rows)
    dir_emails = {r["email"] for r in rows}

    # -- 05 ownership (read early: functions backfill from it) ---------------
    owner_rows, primary_by_fn = [], defaultdict(dict)
    ROLE_TO_COL = {
        "Executive Owner": "executiveOwner",
        "Unit Owner": "unitOwner",
        "Compliance Owner": "complianceOwner",
    }
    for r in R("05_FunctionOwners.csv"):
        email = (r["PersonEmail"] or "").lower()
        if not email or email not in dir_emails:
            reject("ownership", r["FunctionOwnerKey"],
                   f"person '{r['PersonName']}' not in directory")
            continue
        owner_rows.append({
            "name": f"{r['PersonName']} - {r['Role']} - {r['FunctionID']}",
            "function": r["FunctionID"],
            "person": email,
            "role": r["Role"],
            "subRole": r["SubRole"] or "Primary",
        })
        # Denormalized lookups on the function come from each role's Primary.
        if r["SubRole"] == "Primary" and r["Role"] in ROLE_TO_COL:
            primary_by_fn[r["FunctionID"]].setdefault(ROLE_TO_COL[r["Role"]], email)

    # -- 04 functions --------------------------------------------------------
    rows = []
    for r in R("04_Functions.csv"):
        fid = r["FunctionID"]
        dom = r["DomainID"]
        if dom and dom not in domain_codes:
            reject("functions", fid, f"DomainID {dom} not found")
            dom = ""
        p = primary_by_fn.get(fid, {})
        rows.append({
            "code": fid,
            "name": r["FunctionName"],
            "riskArea": blank(r["RiskAreaID"]),
            "domain": blank(dom),
            "risk": blank(r["RiskRating"]),
            "statute": blank(r["Statute"]),
            "citation": blank(r["StatuteCitation"]),
            "statuteUrl": blank(r["StatuteURL"]),
            "description": blank(r["Description"]),
            "reporting": blank(r["ReportingRequirement"]),
            "deadlineNarrative": blank(r["DeadlineNotes"]),
            "resourceLabel": blank(r["SUResourceLabel"]),
            "resourceUrl": blank(r["SUResourceURL"]),
            "executiveOwner": p.get("executiveOwner"),
            "unitOwner": p.get("unitOwner"),
            "complianceOwner": p.get("complianceOwner"),
        })
    write(out / "functions.yaml",
          "# su_compliancefunction - matched on su_functioncode.\n"
          "# risk is null on nearly every row: the rating programme is only starting,\n"
          "# which is why su_risk is Recommended and the app renders blank as Unrated.\n"
          "# The three owner columns are backfilled from each role's Primary owner in\n"
          "# 05_FunctionOwners; the junction remains the authority.",
          "functions", rows)
    totals["functions"] = len(rows)
    fn_codes = {r["code"] for r in rows}

    # Ownership referencing a function that does not exist cannot be created.
    kept = []
    for r in owner_rows:
        if r["function"] not in fn_codes:
            reject("ownership", r["name"], f"FunctionID {r['function']} not found")
        else:
            kept.append(r)
    write(out / "ownership.yaml",
          "# su_functionownership - the authority for who is in charge of what.\n"
          "# name is generated as '<Person> - <Role> - <FunctionID>' and the triple\n"
          "# (function, person, role) is an alternate key, so a re-run updates.",
          "ownership", kept)
    totals["ownership"] = len(kept)

    # -- 06 deadlines --------------------------------------------------------
    rows = []
    for r in R("06_Deadlines.csv"):
        if r["FunctionID"] not in fn_codes:
            reject("deadlines", r["DeadlineID"],
                   f"FunctionID {r['FunctionID']} not found")
            continue
        month = r["DueMonth"] or r["DueMonthNum"]
        rows.append({
            "name": f"{r['FunctionName']} - {month}" if month else r["FunctionName"],
            "function": r["FunctionID"],
            "deadlineType": r["DeadlineType"],
            "cadence": blank(r["Cadence"]),
            "dueDate": blank(r["NextDueDate"]),
            "dueMonthNum": to_int(r["DueMonthNum"]),
            "dueDay": to_int(r["DueDay"]),
            "triggerEvent": blank(r["TriggerEvent"]),
            "offsetValue": to_int(r["OffsetValue"]),
            "offsetUnit": blank(r["OffsetUnit"]),
            "notes": blank(r["DeadlineNotes"]),
            "complete": bool(r["LastCompletedDate"]),
            "completedDate": blank(r["LastCompletedDate"]),
        })
    write(out / "deadlines.yaml",
          "# su_compliancedeadline. Real due dates, not offsets.\n"
          "# complete is set where LastCompletedDate is present.\n"
          "# Only Fixed Recurring rows carry a dueDate; the reminder flow filters\n"
          "# on deadlineType for exactly that reason (see docs/REMINDER-FLOW.md).",
          "deadlines", rows)
    totals["deadlines"] = len(rows)

    # -- 07 flags ------------------------------------------------------------
    rows = []
    for r in R("07_Flags.csv"):
        if r["OrphanFlag"] or r["FunctionID"] not in fn_codes:
            reject("flags", r["FlagID"],
                   f"orphan / FunctionID {r['FunctionID']} not found")
            continue
        email = (r["RespondentEmail"] or "").lower()
        rows.append({
            "name": (r["EntryText"][:120] or "Flag") + ("..." if len(r["EntryText"]) > 120 else ""),
            "function": r["FunctionID"],
            "reason": r["EntryText"],
            "source": blank(r["Source"]),
            # Completed in the source means the review is done, i.e. Cleared.
            "status": "Cleared" if r["Completed"].lower() == "true" else "Active",
            "flaggedBy": email if email in dir_emails else None,
            "flaggedOn": blank(r["CreatedDate"]),
        })
    write(out / "flags.yaml",
          "# su_functionflag. Completed=True maps to Cleared, False to Active.\n"
          "# Rows carrying OrphanFlag are excluded; see _rejected.yaml.",
          "flags", rows)
    totals["flags"] = len(rows)

    # -- 08 assessments ------------------------------------------------------
    rows = [
        {
            "code": r["AssessmentID"],
            "name": r["AssessmentName"],
            "assessmentDate": blank(r["AssessmentDate"]),
            "risk": blank(r["RiskRating"]),
            "status": blank(r["Status"]),
            "currentHolder": blank(r["CurrentHolder"]),
            "followUpRound": to_int(r["FollowUpRound"]),
            "unit": blank(r["Unit"]),
            "keyControlsMissing": to_int(r["KeyControlsMissing"]),
            "approversText": blank(r["ApproversText"]),
            "fileUrl": blank(r["AssessmentFileURL"]),
        }
        for r in R("08_Assessments.csv")
    ]
    write(out / "assessments.yaml",
          "# su_assessment - matched on su_assessmentcode.\n"
          "# approversText stays free text until the names are reconciled to the\n"
          "# directory, at which point it becomes a junction like assessment owners.",
          "assessments", rows)
    totals["assessments"] = len(rows)
    asmt_codes = {r["code"] for r in rows}

    # -- 09 assessment owners ------------------------------------------------
    rows = []
    for r in R("09_AssessmentOwners.csv"):
        # A blank PersonKey is the export's marker for an unmatched name.
        if not r["PersonKey"]:
            reject("assessmentowners", r["AssessmentOwnerKey"],
                   f"person '{r['PersonName']}' unmatched (no PersonKey)")
            continue
        email = email_of_key(r["PersonKey"]) or (
            by_name[r["PersonName"]]["Email"] if r["PersonName"] in by_name else "")
        email = (email or "").lower()
        if email not in dir_emails:
            reject("assessmentowners", r["AssessmentOwnerKey"],
                   f"person '{r['PersonName']}' not in directory")
            continue
        if r["AssessmentID"] not in asmt_codes:
            reject("assessmentowners", r["AssessmentOwnerKey"],
                   f"AssessmentID {r['AssessmentID']} not found")
            continue
        rows.append({
            "name": f"{r['PersonName']} - {r['Role']} - {r['AssessmentID']}",
            "assessment": r["AssessmentID"],
            "person": email,
            "role": r["Role"],
        })
    write(out / "assessmentowners.yaml",
          "# su_assessmentowner - mirrors function ownership.\n"
          "# name is '<Person> - <Role> - <AssessmentID>'; the triple\n"
          "# (assessment, person, role) is an alternate key.",
          "assessmentowners", rows)
    totals["assessmentowners"] = len(rows)

    # -- 10 gaps -------------------------------------------------------------
    rows = []
    for r in R("10_Gaps.csv"):
        if r["FunctionID"] not in fn_codes:
            reject("gaps", r["GapID"], f"FunctionID {r['FunctionID']} not found")
            continue
        aid = r["AssessmentID"] if r["AssessmentID"] in asmt_codes else ""
        email = (r["ResponsiblePersonEmail"] or "").lower()
        rows.append({
            "code": r["GapID"],
            "name": r["Title"],
            "function": r["FunctionID"],
            "assessment": blank(aid),
            "status": r["Status"],
            "note": blank(r["CorrectiveMeasures"]),
            "targetQuarter": blank(r["TargetQuarter"]),
            "targetFY": blank(r["TargetFY"]),
            "owner": email if email in dir_emails else None,
        })
    write(out / "gaps.yaml",
          "# su_compliancegap - matched on su_gapcode.\n"
          "# assessment is null where the legacy reference did not resolve; the gap\n"
          "# is still valid, it just has no assessment of record yet.",
          "gaps", rows)
    totals["gaps"] = len(rows)

    # -- rejected ------------------------------------------------------------
    if rejected:
        by_table = Counter(r["table"] for r in rejected)
        write(out / "_rejected.yaml",
              "# Rows excluded from the seed because a REQUIRED lookup could not be\n"
              "# resolved. These are the known data-quality items in the exports, not\n"
              "# bugs. They are listed rather than dropped silently so the gap between\n"
              "# CSV row counts and seeded row counts is always accountable.\n"
              "#\n"
              "# Fixing them is a data exercise in the source lists: add the missing\n"
              "# people to the directory, or correct the FunctionIDs.\n"
              f"# Summary: {dict(by_table)}",
              "rejected", rejected)
    return totals


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src", type=pathlib.Path, help="dataverse_import directory")
    ap.add_argument("--out", type=pathlib.Path,
                    default=pathlib.Path("solution/schema/seed"))
    args = ap.parse_args(argv)

    if not args.src.is_dir():
        print(f"error: {args.src} is not a directory", file=sys.stderr)
        return 1

    print(f"Reading CSVs from {args.src}")
    print(f"Writing seed YAML to {args.out}/\n")
    totals = build(args.src, args.out)

    print("\nLoad order for import:")
    print("  " + " -> ".join(LOAD_ORDER))
    print(f"\nSeeded rows: {sum(totals.values()):,}")
    if rejected:
        print(f"Excluded  : {len(rejected)} (see _rejected.yaml)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
