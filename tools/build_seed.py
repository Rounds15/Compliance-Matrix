#!/usr/bin/env python3
"""
Convert the prototype's extracted data layer into Dataverse seed YAML.

The standalone HTML prototype carried its sample data as JavaScript arrays with
deadline and gap dates expressed as day offsets from "today". That relative
anchoring is preserved here: offsets are written to the seed files and resolved
against the import date by tools/import_seed.py, so a freshly loaded environment
always shows a live spread of overdue, upcoming, and completed work rather than
dates that have drifted into the past.

Usage:
    python3 tools/build_seed.py <seed.json> [--out solution/schema/seed]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import date, datetime

import yaml

# Choice labels resolved by tools/import_seed.py against dataverse-schema.yaml.
CADENCE = {
    "Annual": "Annual",
    "Semiannual": "Semiannual",
    "Quarterly": "Quarterly",
    "Biennial": "Biennial",
}


class _Dumper(yaml.SafeDumper):
    """Block-style dumper that keeps long prose readable in the seed files."""


def _str_presenter(dumper: yaml.Dumper, data: str):
    style = "|" if "\n" in data else None
    if style is None and len(data) > 160:
        style = ">"
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_Dumper.add_representer(str, _str_presenter)


def _write(path: pathlib.Path, header: str, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        fh.write(header.rstrip() + "\n\n")
        yaml.dump(
            payload,
            fh,
            Dumper=_Dumper,
            sort_keys=False,
            allow_unicode=True,
            width=100,
            default_flow_style=False,
        )
    rows = len(next(iter(payload.values()))) if isinstance(payload, dict) else len(payload)
    print(f"  {path.relative_to(pathlib.Path.cwd()) if path.is_absolute() else path}  ({rows} rows)")


def _offset(iso_value: str | None, anchor: date) -> int | None:
    if not iso_value:
        return None
    return (datetime.strptime(iso_value, "%Y-%m-%d").date() - anchor).days


def build(seed_path: pathlib.Path, out_dir: pathlib.Path) -> None:
    data = json.loads(seed_path.read_text(encoding="utf-8"))
    anchor = datetime.strptime(data["today"], "%Y-%m-%d").date()

    # -- people ---------------------------------------------------------------
    exec_emails = {
        p["e"] for p in data["people"] if p["n"] in set(data["executives"])
    }
    counsel_people = {c["e"]: c for c in data["counsel"].values()}

    people = []
    for p in data["people"]:
        people.append(
            {
                "email": p["e"],
                "name": p["n"],
                "title": p["t"],
                "unit": p["u"],
                "phone": p.get("ph"),
                "location": p.get("l"),
                "isExecutive": p["e"] in exec_emails,
            }
        )
    # Counsel attorneys who are not already in the directory still need a row,
    # because su_counselassignment.su_attorney points at the directory table.
    known = {p["email"] for p in people}
    for email, c in counsel_people.items():
        if email not in known:
            people.append(
                {
                    "email": email,
                    "name": c["n"],
                    "title": c["t"],
                    "unit": c["u"],
                    "phone": c.get("ph"),
                    "location": c.get("l"),
                    "isExecutive": False,
                }
            )

    _write(
        out_dir / "directory.yaml",
        "# su_compliancedirectory - the people layer of the matrix.\n"
        "# Matched on email, which is an alternate key, so re-running the import\n"
        "# updates existing rows instead of creating duplicates.",
        {"directory": people},
    )

    # -- topics ---------------------------------------------------------------
    _write(
        out_dir / "topics.yaml",
        "# su_compliancetopic. functionCount is the published figure from the\n"
        "# university matrix of record, not the row count in this seed set.",
        {
            "topics": [
                {"name": t["name"], "functionCount": t["count"], "sortOrder": i * 10}
                for i, t in enumerate(data["topics"])
            ]
        },
    )

    # -- functions ------------------------------------------------------------
    functions = []
    for f in data["functions"]:
        functions.append(
            {
                "code": f["id"],
                "name": f["name"],
                "topic": f["topic"],
                "area": f["area"],
                "statute": f["statute"],
                "citation": f["citation"],
                "statuteUrl": f["statuteUrl"],
                "executiveOwner": f["exec"],
                "unitOwner": f["unitOwner"],
                "complianceOwner": f["owner"],
                "description": f["description"],
                "reporting": f["reporting"],
                "deadlineNarrative": f["deadline"],
                "resourceLabel": f["resourceLabel"],
                "resourceUrl": f["resourceUrl"],
                "risk": f["risk"],
            }
        )
    _write(
        out_dir / "functions.yaml",
        "# su_compliancefunction - the core matrix record, one row per obligation.\n"
        "# Owner fields hold directory emails; the importer resolves them to lookups.\n"
        "# unitOwner is intentionally null on CF-9082 to exercise the unassigned\n"
        "# unit-owner state that the Risk Dashboard reports as an exposure signal.",
        {"functions": functions},
    )

    # -- ownership chain ------------------------------------------------------
    # The prototype seeded the junction from the three fixed lookups, every
    # assignment Primary. Sub-role variation is created by users in the app.
    ownership = []
    for f in data["functions"]:
        for role, email in (
            ("Executive Owner", f["exec"]),
            ("Unit Owner", f["unitOwner"]),
            ("Compliance Owner", f["owner"]),
        ):
            if email:
                ownership.append(
                    {
                        "function": f["id"],
                        "person": email,
                        "role": role,
                        "subRole": "Primary",
                    }
                )
    _write(
        out_dir / "ownership.yaml",
        "# su_functionownership - junction seeded from the three fixed owner\n"
        "# lookups on each function. Every seeded assignment is Primary; Advisory\n"
        "# and Support entries are added by administrators in the app.",
        {"ownership": ownership},
    )

    # -- deadlines ------------------------------------------------------------
    deadlines = []
    for d in data["deadlines"]:
        deadlines.append(
            {
                "function": d["functionId"],
                "title": d["title"],
                "dueOffsetDays": _offset(d["due"], anchor),
                "cadence": CADENCE.get(d["cadence"], d["cadence"]),
                "complete": bool(d["complete"]),
                "owner": d["owner"],
                "risk": d["risk"],
            }
        )
    _write(
        out_dir / "deadlines.yaml",
        "# su_compliancedeadline. dueOffsetDays is relative to the import date so\n"
        "# the seeded calendar always straddles today: negative is overdue.\n"
        "# owner and risk are copied from the parent function by design.",
        {"deadlines": deadlines},
    )

    # -- gaps -----------------------------------------------------------------
    gaps = []
    for g in data["gaps"]:
        gaps.append(
            {
                "code": g["id"],
                "function": g["functionId"],
                "title": g["title"],
                "severity": g["severity"],
                "status": g["status"],
                "openedOffsetDays": _offset(g["opened"], anchor),
                "closedOffsetDays": _offset(g["closed"], anchor),
                "note": g["note"],
                "closeNote": g["closeNote"] or None,
                "owner": g["owner"],
            }
        )
    _write(
        out_dir / "gaps.yaml",
        "# su_compliancegap. Offsets are relative to the import date.\n"
        "# Closed rows carry a closure note; the app requires one to close a gap.",
        {"gaps": gaps},
    )

    # -- flags ----------------------------------------------------------------
    people_by_name = {p["n"]: p["e"] for p in data["people"]}
    _write(
        out_dir / "flags.yaml",
        "# su_functionflag - functions currently raised for compliance-office review.",
        {
            "flags": [
                {
                    "function": fl["functionId"],
                    "reason": fl["reason"],
                    "flaggedBy": people_by_name.get(fl["by"], fl["by"]),
                    "flaggedOffsetDays": _offset(fl["at"], anchor),
                    "status": "Active",
                }
                for fl in data["flags"]
            ]
        },
    )

    # -- counsel --------------------------------------------------------------
    counsel = [
        {
            "topic": topic,
            "attorney": c["e"],
            "isDefault": False,
        }
        for topic, c in data["counsel"].items()
    ]
    # GC_DEFAULT in the prototype: Helen Ambrose, the escalation when a topic has
    # no explicit attorney of record.
    counsel.append(
        {"topic": None, "attorney": "hambrose@syr.edu", "isDefault": True}
    )
    _write(
        out_dir / "counsel.yaml",
        "# su_counselassignment - attorney of record per topic, plus the single\n"
        "# default escalation row used when a topic has no explicit assignment.",
        {"counsel": counsel},
    )

    print(f"\nAnchor date from prototype: {anchor.isoformat()}")
    print("Offsets are resolved against the import date, not this anchor.")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seed_json", type=pathlib.Path)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("solution/schema/seed"))
    args = ap.parse_args(argv)

    if not args.seed_json.is_file():
        print(f"error: {args.seed_json} not found", file=sys.stderr)
        return 1

    print(f"Writing seed YAML to {args.out}/")
    build(args.seed_json, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
