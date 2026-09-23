/* Wire-format fixtures for both live backends.

   sharepoint: what "Send an HTTP request to SharePoint" returns for
     GET _api/web/lists/getbytitle('<list>')/items with
     Accept: application/json;odata=nometadata - internal column names
     (field_N, <Lookup>Id), choices as strings, hyperlinks as objects.
   dataverse: what the Power Pages Web API returns for /_api/<entityset>
     with the $select the adapter sends - lookups as _<name>_value GUIDs,
     choices as integer codes.

   Both describe the same small matrix, so tests can assert that the two
   adapters produce the same model. */

const u = s => new Date(s + "T04:00:00Z").toISOString(); // a date-only column, Eastern midnight in UTC

export function sharepointLists() {
  return {
    "Risk Areas": [
      { Id: 1, Title: "Safety and Security", field_1: "#DC2626" },
      { Id: 2, Title: "Human Resources", field_1: "" },
      { Id: 3, Title: "Privacy", field_1: null }
    ],
    "Domains": [
      { Id: 10, Title: "Campus Crime Reporting", RiskAreaId: 1 },
      { Id: 11, Title: "Employment Eligibility", RiskAreaId: 2 },
      { Id: 12, Title: "Health Information", RiskAreaId: 3 }
    ],
    "Compliance Directory": [
      { Id: 100, Title: "Marcus Delgado", field_1: "mdelgado@syr.edu" },
      { Id: 101, Title: "Camila Ruiz", field_1: "CRuiz@syr.edu" },
      { Id: 102, Title: "Andrea Whitaker", field_1: "awhitaker@syr.edu" },
      { Id: 103, Title: "Dwight Ferrell", field_1: "dferrell@syr.edu" },
      { Id: 104, Title: "Grace Whitfield", field_1: "gwhitfield@syr.edu" }
    ],
    "Compliance Functions": [
      { Id: 201, Title: "Clery Act Annual Security Report", RiskAreaId: 1, DomainId: 10,
        field_3: "Jeanne Clery Act", field_4: "20 U.S.C. § 1092(f)",
        field_5: { Description: "https://www.ed.gov/campus-safety", Url: "https://www.ed.gov/campus-safety" },
        field_6: "Publish an annual security report.", field_7: "ASR published.", field_8: "Annually by October 1.",
        field_9: "Clery Compliance", field_10: { Description: "Clery", Url: "https://policies.syr.edu" },
        field_11: "High", LastAssessedDate: u("2026-05-01"), NextDueDate: null },
      { Id: 202, Title: "Form I-9 Employment Verification", RiskAreaId: 2, DomainId: 11,
        field_3: "Immigration Reform and Control Act", field_4: "8 CFR § 274a.2", field_5: null,
        field_6: "Verify every new hire.", field_7: "", field_8: "First day of work.", field_9: "", field_10: null,
        field_11: null, LastAssessedDate: null },
      { Id: 203, Title: "HIPAA Security Rule Risk Analysis", RiskAreaId: 3, DomainId: null,
        field_3: "HIPAA", field_4: "45 CFR § 164.308", field_5: "https://www.hhs.gov/hipaa",
        field_6: "", field_7: "", field_8: "", field_9: "", field_10: null, field_11: "Moderate" }
    ],
    "Accountability Structure": [
      { Id: 301, Title: "201 | Marcus Delgado | Executive Owner", PersonId: 100, FunctionId: 201, field_3: "Executive Owner", field_4: "Primary" },
      { Id: 302, Title: "201 | Camila Ruiz | Compliance Owner", PersonId: 101, FunctionId: 201, field_3: "Compliance Owner", field_4: "Primary" },
      { Id: 303, Title: "201 | Dwight Ferrell | Compliance Owner", PersonId: 103, FunctionId: 201, field_3: "Compliance Owner", field_4: "Support" },
      { Id: 304, Title: "201 | Grace Whitfield | General Counsel", PersonId: 104, FunctionId: 201, field_3: "General Counsel", field_4: null },
      { Id: 305, Title: "202 | Andrea Whitaker | Executive Owner", PersonId: 102, FunctionId: 202, field_3: "Executive Owner", field_4: "Primary" },
      { Id: 306, Title: "202 | Dwight Ferrell | Unit Owner", PersonId: 103, FunctionId: 202, field_3: "Unit Owner", field_4: "Primary" },
      { Id: 307, Title: "202 | Ghost | Unit Owner", PersonId: 999, FunctionId: 202, field_3: "Unit Owner", field_4: "Advisory" }
    ],
    "Deadlines": [
      { Id: 401, Title: "Publish Annual Security Report", FunctionId: 201, field_1: u("2025-10-01"), field_2: "Annual",
        field_3: "", field_4: null, field_5: null, field_6: null, field_7: null },
      { Id: 402, Title: "I-9 internal audit sample", FunctionId: 202, field_1: u("2026-03-15"), field_2: "Quarterly",
        field_4: u("2026-09-10"), field_5: "Sample reviewed", field_6: "Camila Ruiz", field_7: "2026-09-10T15:00:00Z" },
      { Id: 403, Title: "Orphan", FunctionId: 999, field_1: u("2026-01-01"), field_2: "Annual" }
    ],
    "Flags List": [
      { Id: 501, Title: "Clery Act Annual Security Report", FunctionId: 201, FlaggedById: 103, field_4: "2026-09-18T13:00:00Z",
        field_1: "Citation may be superseded.", field_2: "Manual", field_3: false, RespondentEmail: "dferrell@syr.edu" },
      { Id: 502, Title: "Form I-9", FunctionId: 202, FlaggedById: 101, field_4: "2026-08-01T13:00:00Z",
        field_1: "Old flag", field_2: "Manual", field_3: true, RespondentEmail: "cruiz@syr.edu" }
    ],
    "Gap List": [
      { Id: 601, Title: "I-9 Section 2 completed late for 14 hires", field_1: ["Late"], field_2: "Open", field_3: "Manual",
        field_6: "Remediation training scheduled.", field_7: "Human Resources", field_9: ["Q2"], field_10: "FY27",
        field_11: "2026-08-01T12:00:00Z", field_13: null, field_14: null, FunctionId: 202, ResponsiblePersonId: null, Created: "2026-08-01T12:00:00Z" },
      { Id: 602, Title: "Fire log not retained", field_1: [], field_2: "In Progress", field_3: "Survey",
        field_6: "", field_11: null, FunctionId: 201, ResponsiblePersonId: 101, Created: "2026-07-01T12:00:00Z" },
      { Id: 603, Title: "Old gap", field_2: "Closed", field_6: "x", field_13: "2026-06-01T12:00:00Z", field_14: "Fixed.",
        FunctionId: 203, Created: "2026-05-01T12:00:00Z" }
    ],
    "Archive": []
  };
}

const G = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const DV_IDS = G;

export function dataverseTables() {
  return {
    su_riskareas: [
      { su_riskareaid: G(1), su_name: "Safety and Security", su_colorhex: "#DC2626" },
      { su_riskareaid: G(2), su_name: "Human Resources" },
      { su_riskareaid: G(3), su_name: "Privacy" }
    ],
    su_domains: [
      { su_domainid: G(10), su_name: "Campus Crime Reporting", _su_riskarea_value: G(1) },
      { su_domainid: G(11), su_name: "Employment Eligibility", _su_riskarea_value: G(2) },
      { su_domainid: G(12), su_name: "Health Information", _su_riskarea_value: G(3) }
    ],
    su_compliancedirectorys: [
      { su_compliancedirectoryid: G(100), su_name: "Marcus Delgado", su_email: "mdelgado@syr.edu", su_jobtitle: "SVP for Safety", su_unit: "Campus Safety", su_active: true },
      { su_compliancedirectoryid: G(101), su_name: "Camila Ruiz", su_email: "cruiz@syr.edu", su_jobtitle: "Clery Coordinator", su_unit: "Campus Safety", su_active: true },
      { su_compliancedirectoryid: G(102), su_name: "Andrea Whitaker", su_email: "awhitaker@syr.edu", su_active: true },
      { su_compliancedirectoryid: G(103), su_name: "Dwight Ferrell", su_email: "dferrell@syr.edu", su_active: true },
      { su_compliancedirectoryid: G(104), su_name: "Grace Whitfield", su_email: "gwhitfield@syr.edu", su_active: true },
      { su_compliancedirectoryid: G(105), su_name: "Left Already", su_email: "gone@syr.edu", su_active: false }
    ],
    su_compliancefunctions: [
      { su_compliancefunctionid: G(201), su_name: "Clery Act Annual Security Report", su_functioncode: "CF-3020",
        _su_riskarea_value: G(1), _su_domain_value: G(10), su_statute: "Jeanne Clery Act", su_citation: "20 U.S.C. § 1092(f)",
        su_statuteurl: "https://www.ed.gov/campus-safety", su_description: "Publish an annual security report.",
        su_risk: 100000001, su_lastreviewed: "2026-05-01",
        _su_executiveowner_value: G(100), _su_unitowner_value: null, _su_complianceowner_value: G(101) },
      { su_compliancefunctionid: G(202), su_name: "Form I-9 Employment Verification", su_functioncode: "CF-2012",
        _su_riskarea_value: G(2), _su_domain_value: G(11), su_statute: "Immigration Reform and Control Act", su_risk: null,
        _su_executiveowner_value: G(102), _su_unitowner_value: G(103), _su_complianceowner_value: null },
      { su_compliancefunctionid: G(203), su_name: "HIPAA Security Rule Risk Analysis", su_functioncode: "CF-9080",
        _su_riskarea_value: G(3), _su_domain_value: null, su_statute: "HIPAA", su_risk: 100000002 }
    ],
    su_functionownerships: [
      { su_functionownershipid: G(302), _su_function_value: G(201), _su_person_value: G(101), su_role: 100000032, su_subrole: 100000040 },
      { su_functionownershipid: G(303), _su_function_value: G(201), _su_person_value: G(103), su_role: 100000032, su_subrole: 100000042 }
    ],
    su_compliancedeadlines: [
      { su_compliancedeadlineid: G(401), su_name: "Publish Annual Security Report", _su_function_value: G(201), su_duedate: "2025-10-01", su_cadence: 100000010, su_complete: false },
      { su_compliancedeadlineid: G(402), su_name: "I-9 internal audit sample", _su_function_value: G(202), su_duedate: "2026-03-15", su_cadence: 100000012, su_complete: false, su_completeddate: "2026-09-10", su_notes: "Sample reviewed" }
    ],
    su_compliancegaps: [
      { su_compliancegapid: G(601), su_name: "I-9 Section 2 completed late for 14 hires", su_gapcode: "GAP-1", _su_function_value: G(202), su_severity: 100000001, su_status: 100000020, su_openeddate: "2026-08-01", su_note: "Remediation training scheduled." },
      { su_compliancegapid: G(603), su_name: "Old gap", _su_function_value: G(203), su_status: 100000021, su_closeddate: "2026-06-01", su_closenote: "Fixed." }
    ],
    su_functionflags: [
      { su_functionflagid: G(501), _su_function_value: G(201), su_reason: "Citation may be superseded.", su_status: 100000050, _su_flaggedby_value: G(103), su_flaggedon: "2026-09-18" },
      { su_functionflagid: G(502), _su_function_value: G(202), su_reason: "Old flag", su_status: 100000051, _su_flaggedby_value: G(101), su_flaggedon: "2026-08-01" }
    ],
    su_counselassignments: [
      { su_counselassignmentid: G(701), _su_riskarea_value: G(1), _su_attorney_value: G(104), su_isdefault: false },
      { su_counselassignmentid: G(702), _su_riskarea_value: null, _su_attorney_value: G(100), su_isdefault: true }
    ]
  };
}
