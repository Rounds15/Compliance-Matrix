/* Sample data for the Compliance Matrix rebuild.
   Shape mirrors the SharePoint / Dataverse column set 1:1 so the UI can be
   repointed at a real source by swapping DataSource below.
   Dataverse mapping (for the Power Apps build):
     su_compliancefunction  <- FUNCTIONS
     su_compliancedeadline  <- DEADLINES   (lookup: su_FunctionId)
     su_compliancegap       <- GAPS        (lookup: su_FunctionId)
     su_compliancedirectory <- PEOPLE
     su_appadmin            <- role gate
*/
const P = {
  agnew:{n:"Lois Agnew",t:"Vice Chancellor, Provost and Chief Academic Officer",u:"Academic Affairs",e:"lpagnew@syr.edu",ph:"315-443-2941",l:"500 Crouse Hinds Hall"},
  padgett:{n:"Brett Padgett",t:"Senior Vice President and Chief Financial Officer",u:"Business, Finance and Administrative Services",e:"bpadgett@syr.edu",ph:"315-443-2444",l:"640 Skytop Road"},
  whitaker:{n:"Andrea Whitaker",t:"Chief Human Resources Officer",u:"Human Resources",e:"awhitaker@syr.edu",ph:"315-443-4042",l:"640 Skytop Road"},
  delgado:{n:"Marcus Delgado",t:"Senior Vice President for Safety and Chief Campus Safety Officer",u:"Campus Safety and Emergency Management",e:"mdelgado@syr.edu",ph:"315-443-2224",l:"005 Sims Hall"},
  raman:{n:"Priya Raman",t:"Vice President for Research",u:"Office of Research",e:"praman@syr.edu",ph:"315-443-2807",l:"113 Bowne Hall"},
  okafor:{n:"Daniel Okafor",t:"Chief Information Officer",u:"Information Technology Services",e:"dokafor@syr.edu",ph:"315-443-2677",l:"206 Machinery Hall"},
  vasquez:{n:"Erin Vasquez",t:"Director of Athletics",u:"Athletics",e:"evasquez@syr.edu",ph:"315-443-2385",l:"Manley Field House"},
  brennan:{n:"Thomas Brennan",t:"Senior Vice President for Government and Community Relations",u:"Government and Community Relations",e:"tbrennan@syr.edu",ph:"315-443-3021",l:"400 Crouse Hinds Hall"},
  lindstrom:{n:"Grace Lindstrom",t:"Senior Vice President for Advancement and External Affairs",u:"Advancement",e:"glindstrom@syr.edu",ph:"315-443-1848",l:"640 Skytop Road"},
  caruso:{n:"Nina Caruso",t:"Senior Vice President for the Student Experience",u:"Student Experience",e:"ncaruso@syr.edu",ph:"315-443-4357",l:"306 Steele Hall"},
  chin:{n:"Robert Chin",t:"Vice President for Communications",u:"Communications",e:"rchin@syr.edu",ph:"315-443-3784",l:"820 Comstock Avenue"},
  ambrose:{n:"Helen Ambrose",t:"Senior Vice President and General Counsel",u:"Office of University Counsel",e:"hambrose@syr.edu",ph:"315-443-1104",l:"300 Crouse Hinds Hall"},

  campbell:{n:"Kelly Campbell",t:"University Registrar",u:"Registrar",e:"kmnieder@syr.edu",ph:"315-443-2422",l:"106 Steele Hall"},
  rupert:{n:"Katie Rupert",t:"Manager, Curriculum Compliance",u:"Academic Affairs",e:"kmrupert@syr.edu",ph:"315-443-9905",l:"500 Crouse Hinds Hall"},
  hollis:{n:"Marta Hollis",t:"Director of Benefits",u:"Human Resources",e:"mhollis@syr.edu",ph:"315-443-4013",l:"640 Skytop Road"},
  ferrell:{n:"Dwight Ferrell",t:"Director of Employee Relations",u:"Human Resources",e:"dferrell@syr.edu",ph:"315-443-4109",l:"640 Skytop Road"},
  sundberg:{n:"Anika Sundberg",t:"Associate Director, Payroll",u:"Payroll Services",e:"asundberg@syr.edu",ph:"315-443-4042",l:"640 Skytop Road"},
  novak:{n:"Peter Novak",t:"Director of Environmental Health and Safety",u:"EHSS",e:"pnovak@syr.edu",ph:"315-443-4132",l:"027 Skytop Office Building"},
  ruiz:{n:"Camila Ruiz",t:"Clery Act Compliance Coordinator",u:"Campus Safety",e:"cruiz@syr.edu",ph:"315-443-2224",l:"005 Sims Hall"},
  bhatt:{n:"Rohan Bhatt",t:"Director of Sponsored Programs",u:"Office of Research",e:"rbhatt@syr.edu",ph:"315-443-2807",l:"113 Bowne Hall"},
  olsen:{n:"Ingrid Olsen",t:"Director, Research Integrity and Protections",u:"Office of Research",e:"iolsen@syr.edu",ph:"315-443-3013",l:"214 Lyman Hall"},
  duval:{n:"Marc Duval",t:"University Controller",u:"Comptroller's Office",e:"mduval@syr.edu",ph:"315-443-2444",l:"640 Skytop Road"},
  greaves:{n:"Tonya Greaves",t:"Director of Financial Aid",u:"Financial Aid and Scholarship Programs",e:"tgreaves@syr.edu",ph:"315-443-1513",l:"200 Bowne Hall"},
  iyer:{n:"Sanjay Iyer",t:"Chief Information Security Officer",u:"Information Technology Services",e:"siyer@syr.edu",ph:"315-443-2677",l:"206 Machinery Hall"},
  monroe:{n:"Alicia Monroe",t:"University Privacy Officer",u:"Office of University Counsel",e:"amonroe@syr.edu",ph:"315-443-1104",l:"300 Crouse Hinds Hall"},
  kowalski:{n:"Jenna Kowalski",t:"Associate AD for Compliance",u:"Athletics",e:"jkowalski@syr.edu",ph:"315-443-2385",l:"Manley Field House"},
  osei:{n:"Kwame Osei",t:"Director of Community Engagement",u:"Government and Community Relations",e:"kosei@syr.edu",ph:"315-443-3021",l:"400 Crouse Hinds Hall"},
  freeman:{n:"Dana Freeman",t:"Director of Student Conduct",u:"Student Experience",e:"dfreeman@syr.edu",ph:"315-443-3728",l:"804 University Avenue"},
  petrov:{n:"Yelena Petrov",t:"Director of Advancement Services",u:"Advancement",e:"ypetrov@syr.edu",ph:"315-443-1848",l:"640 Skytop Road"},
  lang:{n:"Owen Lang",t:"Director of Digital Communications",u:"Communications",e:"olang@syr.edu",ph:"315-443-3784",l:"820 Comstock Avenue"},
  achebe:{n:"Ruth Achebe",t:"Director, Center for International Services",u:"International Services",e:"rachebe@syr.edu",ph:"315-443-2457",l:"310 Walnut Place"},
  tanaka:{n:"Hiro Tanaka",t:"Director of Study Abroad Operations",u:"Syracuse Abroad",e:"htanaka@syr.edu",ph:"315-443-3471",l:"106 Walnut Place"},
  boyle:{n:"Sean Boyle",t:"Director of Risk Management and Insurance",u:"Risk Management",e:"sboyle@syr.edu",ph:"315-443-4011",l:"640 Skytop Road"},
  ellsworth:{n:"Gina Ellsworth",t:"Director of Title IX Compliance",u:"Equal Opportunity and Title IX",e:"gellsworth@syr.edu",ph:"315-443-0211",l:"005 Steele Hall"},
  march:{n:"Leo March",t:"Manager, Facilities Compliance",u:"Campus Planning, Design and Construction",e:"lmarch@syr.edu",ph:"315-443-1234",l:"621 Skytop Road"}
};

const TOPICS = [
  {name:"Human Resources",count:105},{name:"Academic and Faculty Affairs",count:73},
  {name:"Safety and Security",count:44},{name:"Finance, CFO Office",count:42},
  {name:"Research",count:34},{name:"Government and Community Relations",count:29},
  {name:"IT and Cyber Security",count:19},{name:"Athletics",count:17},
  {name:"Privacy",count:15},{name:"Student Experience",count:13},
  {name:"Advancement",count:6},{name:"Communications",count:5},{name:"Off Campus Activities",count:2}
];

/* [id, topic, area, name, statute, citation, statuteUrl, execKey, unitKey, ownerKey,
    description, reporting, deadline, resourceLabel, resourceUrl, risk] */
const F = [
["CF-1041","Academic and Faculty Affairs","Academic Programs","Clock-to-Credit Hour Conversion","Higher Education Act","34 CFR § 668.8 — Eligible program","https://www.ecfr.gov/current/title-34/section-668.8","agnew","campbell","rupert","For programs measured in clock hours and converted to credit hours for Title IV purposes, the institution must apply the federal conversion formula and document that the program meets minimum length and eligibility requirements.","Conversion ratios must be documented and certified. State licensing approval required where applicable.","At program creation or modification. Recertified during PPA renewal.","Credit Hours Policy","https://policies.syr.edu","Medium"],
["CF-1042","Academic and Faculty Affairs","Student Records","FERPA Annual Notification","Family Educational Rights and Privacy Act","34 CFR § 99.7","https://www.ecfr.gov/current/title-34/section-99.7","agnew","campbell","monroe","Institutions must annually notify students of their rights under FERPA, including the right to inspect records, request amendment, and file a complaint with the Department of Education.","Annual notice published to all enrolled students; directory information categories disclosed.","Annually, published before the start of the fall term.","Student Records Policy","https://policies.syr.edu","High"],
["CF-1043","Academic and Faculty Affairs","Accreditation","Middle States Periodic Review Report","MSCHE Standards for Accreditation","MSCHE Standard VII","https://www.msche.org","agnew","campbell","rupert","The university must submit periodic self-study and review documentation demonstrating continued compliance with the Commission's standards and requirements of affiliation.","Periodic Review Report submitted to MSCHE with supporting evidence inventory.","Every 8 years, with a mid-point peer review at year 4.","Accreditation Overview","https://policies.syr.edu","Critical"],
["CF-1044","Academic and Faculty Affairs","Faculty Affairs","Faculty Credentialing Documentation","MSCHE Standards for Accreditation","MSCHE Standard III.2","https://www.msche.org","agnew","campbell","rupert","Official transcripts and credential verification must be on file for all instructors of record prior to the start of instruction.","Credential file audit reported to the Provost each term.","Each term, before the start of instruction.","Faculty Manual","https://policies.syr.edu","Medium"],
["CF-1045","Academic and Faculty Affairs","Distance Education","State Authorization for Distance Education","Higher Education Act","34 CFR § 600.9(c)","https://www.ecfr.gov/current/title-34/section-600.9","agnew","campbell","rupert","The institution must be authorized, or exempt from authorization, in every state where it enrolls distance-education students, and must disclose that status to students.","SARA annual renewal and enrollment reporting by state.","Annually, SARA renewal each spring.","Distance Education Authorization","https://policies.syr.edu","High"],
["CF-2010","Human Resources","Benefits","ACA Employer Reporting (Forms 1094-C / 1095-C)","Affordable Care Act","26 U.S.C. § 6056","https://www.irs.gov/affordable-care-act","whitaker","hollis","sundberg","Applicable large employers must report health coverage offered to full-time employees to the IRS and furnish statements to employees.","Forms 1095-C furnished to employees; 1094-C transmittal filed with the IRS.","Employee statements by March 2; IRS e-filing by March 31.","Benefits Administration","https://policies.syr.edu","High"],
["CF-2011","Human Resources","Benefits","ERISA Form 5500 Filing","Employee Retirement Income Security Act","29 U.S.C. § 1023","https://www.dol.gov/agencies/ebsa","whitaker","hollis","hollis","Annual report of employee benefit plan financial condition, investments, and operations must be filed for each covered plan.","Form 5500 with schedules and independent auditor's report filed via EFAST2.","Last day of the 7th month after plan year end; extension to October 15.","Retirement Plan Governance","https://policies.syr.edu","High"],
["CF-2012","Human Resources","Employment Eligibility","Form I-9 Employment Verification","Immigration Reform and Control Act","8 CFR § 274a.2","https://www.uscis.gov/i-9","whitaker","ferrell","ferrell","Employers must verify the identity and employment authorization of every new hire and retain the completed Form I-9 for the required period.","Internal I-9 audit sample reported to HR leadership annually.","Section 1 by first day of work; Section 2 within 3 business days.","Hiring Procedures","https://policies.syr.edu","Critical"],
["CF-2013","Human Resources","Wage and Hour","FLSA Exemption Classification Review","Fair Labor Standards Act","29 CFR Part 541","https://www.dol.gov/agencies/whd/flsa","whitaker","ferrell","sundberg","Positions must be reviewed against the duties and salary-basis tests to confirm exempt or non-exempt classification, and reclassified when thresholds change.","Classification review summary to HR leadership and the CFO.","Annually, and upon any change to the federal salary threshold.","Compensation Policy","https://policies.syr.edu","High"],
["CF-2014","Human Resources","Leave Administration","FMLA Eligibility and Designation Notices","Family and Medical Leave Act","29 CFR § 825.300","https://www.dol.gov/agencies/whd/fmla","whitaker","hollis","hollis","Employers must provide eligibility, rights and responsibilities, and designation notices within five business days of a leave request or knowledge of a qualifying reason.","Leave tracking log retained 3 years; no external filing.","Within 5 business days of each qualifying leave event.","Leave of Absence Policy","https://policies.syr.edu","Medium"],
["CF-2015","Human Resources","Affirmative Action","EEO-1 Component 1 Data Filing","Title VII / Executive Order 11246","29 CFR Part 1602","https://www.eeoc.gov/employers/eeo-1-data-collection","whitaker","ferrell","ferrell","Employers with 100 or more employees must submit demographic workforce data by job category, race, ethnicity, and sex.","EEO-1 Component 1 report filed through the EEOC collection portal.","Annually, filing window typically opens in the spring.","Equal Opportunity Statement","https://policies.syr.edu","Medium"],
["CF-2016","Human Resources","Workplace Safety","OSHA Form 300A Posting","Occupational Safety and Health Act","29 CFR § 1904.32","https://www.osha.gov/recordkeeping","whitaker","novak","novak","The annual summary of work-related injuries and illnesses must be certified by a company executive and posted in a conspicuous location.","Form 300A posted February 1 through April 30 and retained 5 years.","Post by February 1 each year.","Workplace Safety Program","https://policies.syr.edu","Medium"],
["CF-3020","Safety and Security","Campus Crime Reporting","Clery Act Annual Security Report","Jeanne Clery Act","20 U.S.C. § 1092(f)","https://www.ed.gov/campus-safety","delgado","ruiz","ruiz","The institution must publish an annual security report containing three years of crime statistics, security policy statements, and required disclosures, and distribute it to all students and employees.","ASR published and crime statistics submitted to the Department of Education.","Annually by October 1.","Clery Compliance","https://policies.syr.edu","Critical"],
["CF-3021","Safety and Security","Emergency Management","Emergency Response and Evacuation Testing","Jeanne Clery Act","34 CFR § 668.46(g)","https://www.ecfr.gov/current/title-34/section-668.46","delgado","ruiz","ruiz","The institution must test emergency response and evacuation procedures at least annually and publicize its procedures in conjunction with at least one test per year.","Test date, description, and whether announced or unannounced documented in the ASR.","At least annually; documented each test.","Emergency Management Plan","https://policies.syr.edu","High"],
["CF-3022","Safety and Security","Environmental Health","Hazardous Waste Generator Reporting","Resource Conservation and Recovery Act","40 CFR Part 262","https://www.epa.gov/hw","delgado","novak","novak","Large quantity generators must characterize, label, store, and manifest hazardous waste and file a biennial report of waste generated and managed.","Biennial Report filed with NYSDEC; manifests retained 3 years.","Biennial report due March 1 of even-numbered years.","Hazardous Materials Handling","https://policies.syr.edu","High"],
["CF-3023","Safety and Security","Fire Safety","Annual Fire Safety Report for On-Campus Housing","Higher Education Opportunity Act","34 CFR § 668.49","https://www.ecfr.gov/current/title-34/section-668.49","delgado","march","march","Institutions with on-campus student housing must publish an annual fire safety report including fire statistics, systems in each facility, and evacuation procedures.","Fire statistics submitted with the ASR; fire log maintained and open to inspection.","Annually by October 1, published with the ASR.","Fire Safety Program","https://policies.syr.edu","High"],
["CF-4030","Finance, CFO Office","Tax","IRS Form 990 Return of Organization Exempt from Income Tax","Internal Revenue Code","26 U.S.C. § 6033","https://www.irs.gov/forms-pubs/about-form-990","padgett","duval","duval","Tax-exempt organizations must file an annual information return reporting finances, governance, compensation, and program activities.","Form 990 and Schedules filed with the IRS and made publicly available.","15th day of the 5th month after fiscal year end; extensions available.","Tax Compliance","https://policies.syr.edu","Critical"],
["CF-4031","Finance, CFO Office","Financial Reporting","Uniform Guidance Single Audit","OMB Uniform Guidance","2 CFR § 200.512","https://www.ecfr.gov/current/title-2/part-200","padgett","duval","duval","Entities expending $1,000,000 or more in federal awards in a fiscal year must have a single or program-specific audit and submit the reporting package to the Federal Audit Clearinghouse.","Data Collection Form and reporting package submitted to the FAC.","Within 9 months of fiscal year end (March 31 for a June 30 year end).","Sponsored Accounting","https://policies.syr.edu","Critical"],
["CF-4032","Finance, CFO Office","Student Financial Services","Title IV Return of Funds (R2T4)","Higher Education Act","34 CFR § 668.22","https://www.ecfr.gov/current/title-34/section-668.22","padgett","greaves","greaves","When a recipient of Title IV aid withdraws, the institution must calculate the amount of unearned aid and return it to the appropriate program within the required window.","R2T4 calculations retained; returns reported through COD.","Funds returned within 45 days of the date of determination.","Financial Aid Policies","https://policies.syr.edu","High"],
["CF-4033","Finance, CFO Office","Financial Responsibility","Composite Score and Financial Statement Submission","Higher Education Act","34 CFR § 668.23","https://www.ecfr.gov/current/title-34/section-668.23","padgett","duval","duval","Institutions must annually submit audited financial statements and a compliance audit used to calculate the financial responsibility composite score.","Audited financials and compliance audit submitted through eZ-Audit.","Within 6 months of fiscal year end (December 31 for a June 30 year end).","Financial Statements","https://policies.syr.edu","High"],
["CF-4034","Finance, CFO Office","Procurement","Federal Procurement Standards for Sponsored Purchases","OMB Uniform Guidance","2 CFR §§ 200.317–200.327","https://www.ecfr.gov/current/title-2/part-200","padgett","duval","boyle","Purchases charged to federal awards must follow documented procurement methods, competition requirements, and cost or price analysis thresholds.","Procurement files retained for audit; sole-source justifications documented.","Continuous; reviewed at each purchase above the micro-purchase threshold.","Purchasing Policy","https://policies.syr.edu","Medium"],
["CF-5040","Research","Human Subjects","IRB Review and Continuing Review","Common Rule","45 CFR § 46.109","https://www.hhs.gov/ohrp","raman","olsen","olsen","Research involving human subjects must receive IRB approval before initiation and be reviewed at intervals appropriate to the degree of risk.","Approval and continuing-review determinations recorded in the IRB system of record.","Before initiation; continuing review at least annually where required.","Human Research Protections","https://policies.syr.edu","Critical"],
["CF-5041","Research","Research Integrity","Financial Conflict of Interest Disclosure (PHS)","PHS FCOI Regulation","42 CFR Part 50 Subpart F","https://grants.nih.gov/grants/policy/coi","raman","bhatt","olsen","Investigators on PHS-funded research must disclose significant financial interests, and the institution must review, manage, and report identified conflicts.","FCOI reports submitted to the PHS awarding component before expenditure of funds.","At time of application, annually thereafter, and within 30 days of a new interest.","Conflict of Interest Policy","https://policies.syr.edu","High"],
["CF-5042","Research","Export Control","Export Controlled Research Screening","Export Administration Regulations","15 CFR Parts 730–774","https://www.bis.doc.gov","raman","bhatt","bhatt","Research involving controlled technology, foreign nationals, or restricted destinations must be screened and, where required, licensed before access is granted.","Restricted party screening records and technology control plans retained.","Continuous; screening at project setup and personnel change.","Export Control Program","https://policies.syr.edu","Critical"],
["CF-5043","Research","Animal Care","IACUC Protocol Review and Facility Inspection","Animal Welfare Act","9 CFR § 2.31","https://www.aphis.usda.gov/animal-welfare","raman","olsen","olsen","The IACUC must review and approve activities involving animals and inspect animal facilities and study areas at least once every six months.","Semiannual report to the Institutional Official; annual report filed with USDA APHIS.","Semiannual inspections; USDA annual report due December 1.","Animal Care and Use","https://policies.syr.edu","High"],
["CF-6050","Government and Community Relations","Lobbying","Federal Lobbying Disclosure Reports","Lobbying Disclosure Act","2 U.S.C. § 1604","https://lda.congress.gov","brennan","osei","osei","Registrants must file quarterly reports of lobbying activities, issues, and expenses, and semiannual contribution reports.","LD-2 quarterly reports and LD-203 semiannual reports filed with Congress.","Quarterly: Jan 20, Apr 20, Jul 20, Oct 20. LD-203: Jan 30 and Jul 30.","Government Relations","https://policies.syr.edu","High"],
["CF-6051","Government and Community Relations","State Reporting","NYS Charities Bureau Annual Filing (CHAR500)","NY Executive Law Article 7-A","N.Y. Exec. Law § 172-b","https://www.charitiesnys.com","brennan","duval","petrov","Charitable organizations registered in New York must file an annual financial report with the Attorney General's Charities Bureau.","CHAR500 with audited financial statements filed online.","4.5 months after fiscal year end; extensions available.","Charitable Registration","https://policies.syr.edu","Medium"],
["CF-6052","Government and Community Relations","Immigration","SEVIS Reporting for F and J Visa Holders","Immigration and Nationality Act","8 CFR § 214.3(g)","https://www.ice.gov/sevis","brennan","achebe","achebe","Designated school officials must report student status events, address changes, and program information in SEVIS within the required timeframes.","Event reporting in SEVIS; recertification petition every two years.","Within 21 days of a reportable event; recertification every 2 years.","International Student Services","https://policies.syr.edu","High"],
["CF-7060","IT and Cyber Security","Data Security","GLBA Safeguards Rule Information Security Program","Gramm-Leach-Bliley Act","16 CFR Part 314","https://www.ftc.gov/business-guidance/privacy-security","okafor","iyer","iyer","The institution must maintain a written information security program with a qualified individual, risk assessments, access controls, encryption, and vendor oversight.","Annual written report to the Board or governing body by the qualified individual.","Annual program report; risk assessment refreshed annually.","Information Security Policy","https://policies.syr.edu","Critical"],
["CF-7061","IT and Cyber Security","Data Security","NY SHIELD Act Breach Notification Readiness","NY General Business Law","N.Y. Gen. Bus. Law § 899-aa","https://ag.ny.gov/internet/data-breach","okafor","iyer","monroe","The institution must maintain reasonable safeguards for private information of New York residents and notify affected individuals and regulators in the event of a breach.","Notification to affected residents, NY AG, DOS, and State Police when triggered.","Notification without unreasonable delay upon determination of a breach.","Data Breach Response Plan","https://policies.syr.edu","Critical"],
["CF-7062","IT and Cyber Security","Accessibility","Digital Accessibility Conformance (WCAG 2.1 AA)","Americans with Disabilities Act","28 CFR § 35.200","https://www.ada.gov/resources/web-guidance","okafor","lang","lang","Web content and mobile apps used by the public must conform to WCAG 2.1 Level AA, with documented remediation for non-conforming content.","Accessibility audit results and remediation plan reported to ITS leadership.","Continuous; full audit cycle annually.","Digital Accessibility Policy","https://policies.syr.edu","High"],
["CF-8070","Athletics","NCAA Compliance","NCAA Academic Progress Rate Reporting","NCAA Division I Manual","NCAA Bylaw 14.8","https://www.ncaa.org","vasquez","kowalski","kowalski","Institutions must submit term-by-term academic eligibility and retention data for all student-athletes on athletically related aid.","APR data submitted through the NCAA Academic Portal.","Annually, submission window in the spring.","Athletics Compliance","https://policies.syr.edu","High"],
["CF-8071","Athletics","Gender Equity","Equity in Athletics Disclosure Act Report","Equity in Athletics Disclosure Act","20 U.S.C. § 1092(g)","https://ope.ed.gov/athletics","vasquez","kowalski","kowalski","Co-educational institutions with intercollegiate athletics must annually report participation, staffing, revenues, and expenses by team and sex.","EADA survey submitted through the Department of Education portal.","Annually by October 15.","Athletics Reporting","https://policies.syr.edu","Medium"],
["CF-9080","Privacy","Health Information","HIPAA Security Rule Risk Analysis","Health Insurance Portability and Accountability Act","45 CFR § 164.308(a)(1)","https://www.hhs.gov/hipaa","ambrose","monroe","monroe","Covered components must conduct an accurate and thorough assessment of risks to electronic protected health information and implement measures to reduce risk.","Risk analysis and risk management plan documented and retained 6 years.","Annually and upon significant environmental or operational change.","HIPAA Program","https://policies.syr.edu","Critical"],
["CF-9081","Privacy","Consumer Privacy","Website Privacy Notice and Consent Management","NY General Business Law","N.Y. Gen. Bus. Law § 899-bb","https://ag.ny.gov","ambrose","monroe","lang","Public-facing digital properties must publish an accurate privacy notice and honor consent and opt-out preferences for tracking technologies.","Annual notice review documented by the Privacy Officer.","Reviewed annually and upon material change to data practices.","Privacy Notice","https://policies.syr.edu","Medium"],
["CF-9082","Privacy","Records Management","Records Retention Schedule Adherence","Institutional policy / multiple statutes","SU Records Management Policy","https://policies.syr.edu","ambrose","monroe","monroe","University records must be retained and disposed of in accordance with the approved retention schedule and applicable legal-hold obligations.","Annual attestation from records liaisons in each unit.","Annual attestation each fiscal year.","Records Management","https://policies.syr.edu","Low"],
["CF-9090","Student Experience","Civil Rights","Title IX Grievance Procedures and Training","Title IX of the Education Amendments","34 CFR Part 106","https://www.ed.gov/laws-and-policy/civil-rights-laws/title-ix","caruso","ellsworth","ellsworth","The institution must publish grievance procedures, designate a Title IX Coordinator, and train all Title IX personnel on the required topics.","Training materials posted publicly; coordinator contact published.","Training annually; materials posted continuously.","Title IX Policy","https://policies.syr.edu","Critical"],
["CF-9091","Student Experience","Health and Wellness","Drug-Free Schools and Communities Act Biennial Review","Drug-Free Schools and Communities Act","34 CFR Part 86","https://www.ecfr.gov/current/title-34/part-86","caruso","freeman","freeman","Institutions must annually distribute standards of conduct and health-risk information and conduct a biennial review of program effectiveness and sanction consistency.","Biennial review report retained and available to the Department on request.","Annual distribution; biennial review by December 31 of even years.","Alcohol and Other Drug Policy","https://policies.syr.edu","High"],
["CF-9100","Advancement","Gift Administration","Charitable Contribution Substantiation","Internal Revenue Code","26 U.S.C. § 170(f)(8)","https://www.irs.gov/charities-non-profits","lindstrom","petrov","petrov","Contemporaneous written acknowledgment must be provided for contributions of $250 or more, including a statement of goods or services provided.","Acknowledgment letters issued and retained; Form 8282 filed on disposition of gifted property.","Acknowledgment before the donor files their return; Form 8282 within 125 days.","Gift Acceptance Policy","https://policies.syr.edu","Medium"],
["CF-9110","Communications","Marketing","Truth in Advertising for Educational Programs","Federal Trade Commission Act","15 U.S.C. § 45","https://www.ftc.gov","chin","lang","lang","Recruitment and marketing materials must be truthful, substantiated, and free of misrepresentation regarding cost, outcomes, accreditation, or employment.","Substantiation files retained for outcome and placement claims.","Continuous; review at each campaign launch.","Marketing Standards","https://policies.syr.edu","Medium"],
["CF-9120","Off Campus Activities","Study Abroad","Clery Geography for Non-Campus Study Abroad Locations","Jeanne Clery Act","34 CFR § 668.46(a)","https://www.ecfr.gov/current/title-34/section-668.46","caruso","tanaka","ruiz","Crime statistics must be collected for non-campus locations controlled by the institution for educational purposes, including short-term and semester study abroad sites.","Statistics from local law enforcement incorporated into the ASR.","Annually, in advance of the October 1 ASR publication.","Study Abroad Health and Safety","https://policies.syr.edu","Medium"],
["CF-9121","Off Campus Activities","Minors on Campus","Protection of Minors Program Registration","NY Social Services Law","N.Y. Soc. Serv. Law § 413","https://ocfs.ny.gov","caruso","boyle","freeman","Programs serving participants under 18 must register, complete background checks, and ensure staff are trained as mandated reporters.","Program registration and background-check completion tracked centrally.","Registration at least 30 days before each program start.","Minors on Campus Policy","https://policies.syr.edu","High"]
];

const FUNCTIONS = F.map(r => ({
  id:r[0], topic:r[1], area:r[2], name:r[3], statute:r[4], citation:r[5], statuteUrl:r[6],
  exec:P[r[7]], unitOwner:r[8]?P[r[8]]:null, owner:P[r[9]],
  description:r[10], reporting:r[11], deadline:r[12],
  resourceLabel:r[13], resourceUrl:r[14], risk:r[15]
}));
// one function with no unit owner, to exercise the empty role-card state
FUNCTIONS.find(f=>f.id==="CF-9082").unitOwner = null;

const today = new Date(); today.setHours(0,0,0,0);
const dt = d => { const x=new Date(today); x.setDate(x.getDate()+d); return x; };
/* [functionId, title, dayOffset, cadence, complete] */
const DL = [
["CF-3020","Publish Annual Security Report",59,"Annual",false],
["CF-3023","Publish Annual Fire Safety Report",59,"Annual",false],
["CF-4031","Submit Single Audit reporting package to FAC",-12,"Annual",false],
["CF-6050","LD-2 Q3 lobbying disclosure",78,"Quarterly",false],
["CF-6050","LD-203 semiannual contribution report",-4,"Semiannual",false],
["CF-4030","File IRS Form 990 (extended)",103,"Annual",false],
["CF-5043","USDA APHIS annual animal report",120,"Annual",false],
["CF-5043","Semiannual facility inspection",21,"Semiannual",false],
["CF-2011","Form 5500 filing (extended)",73,"Annual",false],
["CF-8071","EADA survey submission",73,"Annual",false],
["CF-1042","FERPA annual notification to students",25,"Annual",false],
["CF-1045","SARA institutional renewal",216,"Annual",false],
["CF-7060","GLBA annual report to the Board",145,"Annual",false],
["CF-9080","HIPAA security risk analysis refresh",-27,"Annual",false],
["CF-9091","DFSCA biennial review report",150,"Biennial",false],
["CF-2013","FLSA exemption classification review",41,"Annual",false],
["CF-9090","Title IX personnel training cycle",13,"Annual",false],
["CF-2012","I-9 internal audit sample",-40,"Annual",false],
["CF-3022","RCRA biennial hazardous waste report",211,"Biennial",false],
["CF-8070","NCAA APR data submission",-96,"Annual",true],
["CF-2010","Furnish Forms 1095-C to employees",-154,"Annual",true],
["CF-4033","eZ-Audit financial statement submission",150,"Annual",false],
["CF-9121","Summer minors program registrations",-63,"Annual",true],
["CF-6052","SEVIS recertification petition",34,"Biennial",false],
["CF-5041","Annual FCOI disclosure campaign",6,"Annual",false],
["CF-9082","Records retention attestation cycle",95,"Annual",false],
["CF-3021","Emergency evacuation drill (fall)",47,"Annual",false],
["CF-9120","Collect study abroad crime statistics",31,"Annual",false]
];
const DEADLINES = DL.map((r,i)=>{const f=FUNCTIONS.find(x=>x.id===r[0]);return{
  id:"DL-"+(1000+i), functionId:r[0], functionName:f.name, topic:f.topic, title:r[1],
  due:dt(r[2]), cadence:r[3], complete:r[4], owner:f.owner, risk:f.risk};});

/* [functionId, title, severity, opened(dayOffset), status, note, closedNote] */
const GP = [
["CF-2012","I-9 Section 2 completed after the 3-day window for 14 summer hires","High",-52,"Open","Sampling found 14 of 210 records completed late. Remediation training scheduled for hiring managers.",""],
["CF-7060","Vendor risk assessments missing for 9 systems handling covered data","Critical",-73,"Open","Third-party oversight required by the Safeguards Rule is not evidenced for nine SaaS vendors.",""],
["CF-9080","HIPAA risk analysis is 14 months old","High",-27,"Open","Prior analysis predates the migration of the student health record system.",""],
["CF-1045","Two states lack current distance-education authorization","High",-101,"Open","Enrollments recorded in two non-SARA jurisdictions without documented exemption.",""],
["CF-3022","Satellite accumulation area labeling inconsistent in three labs","Medium",-19,"Open","Identified during EHSS walkthrough; corrective labeling issued.",""],
["CF-7062","41 legacy PDFs on public sites fail WCAG 2.1 AA","Medium",-140,"Open","Remediation queue established; 118 of 159 documents remediated to date.",""],
["CF-6052","SEVIS address updates exceeded 21 days for 6 students","Medium",-33,"Open","Process gap between housing assignment feed and SEVIS batch job.",""],
["CF-2013","Classification review not completed for 3 position families","Medium",-66,"Open","Research staff, athletics operations, and facilities trades pending.",""],
["CF-9121","Background checks missing for 4 volunteer coaches","High",-11,"Open","Program paused pending completion.",""],
["CF-4034","Sole-source justifications absent from 5 sponsored purchases","Medium",-88,"Open","Files reconstructed for 3; 2 remain outstanding.",""],
["CF-5042","Technology control plan not on file for one restricted project","Critical",-6,"Open","Project access suspended pending plan approval.",""],
["CF-1044","Official transcripts missing for 7 adjunct instructors","Low",-45,"Open","Requests issued to institutions of record.",""],
["CF-9082","Two units did not submit records retention attestations","Low",-120,"Open","Reminders escalated to unit leadership.",""],
["CF-3021","Fall evacuation drill not publicized in advance","Low",-8,"Open","Documentation of publicity requirement was not retained.",""],
["CF-2010","1095-C corrections needed for 6 employees","Medium",-190,"Closed","Coverage months misstated for six mid-year hires.","Corrected returns filed; payroll feed logic updated to prevent recurrence."],
["CF-8070","APR data mismatch for two rosters","Medium",-215,"Closed","Squad list did not reconcile with aid records.","Reconciliation completed before submission window closed."],
["CF-4032","R2T4 calculations exceeded 45 days for 3 withdrawals","High",-240,"Closed","Delayed date-of-determination entry.","Withdrawal workflow automated; returns now average 19 days."]
];
const GAPS = GP.map((r,i)=>{const f=FUNCTIONS.find(x=>x.id===r[0]);return{
  id:"GAP-"+(200+i), functionId:r[0], functionName:f.name, topic:f.topic, title:r[1],
  severity:r[2], opened:dt(r[3]), status:r[4], note:r[5], closeNote:r[6],
  owner:f.owner, closed:r[4]==="Closed"?dt(r[3]+30):null};});

const FLAGS = [
  {functionId:"CF-4033",reason:"Composite score methodology changed — confirm which fiscal year the submission covers.",by:"Marc Duval",at:dt(-4)},
  {functionId:"CF-9090",reason:"Grievance procedure language needs review against the current federal rule before the training cycle.",by:"Gina Ellsworth",at:dt(-9)}
];

const PEOPLE = Object.values(P);
const EXEC_KEYS = ["agnew","padgett","whitaker","delgado","raman","okafor","vasquez","brennan","lindstrom","caruso","chin","ambrose"];
const EXECUTIVES = EXEC_KEYS.map(k=>P[k]).sort((a,b)=>a.n.split(" ").slice(-1)[0].localeCompare(b.n.split(" ").slice(-1)[0]));

/* Swap these four resolvers for Dataverse/SharePoint calls in the Power Apps build. */
const DataSource = {
  functions:()=>FUNCTIONS, deadlines:()=>DEADLINES, gaps:()=>GAPS,
  people:()=>PEOPLE, executives:()=>EXECUTIVES, topics:()=>TOPICS, flags:()=>FLAGS
};


/* ---- Office of University Counsel: attorney of record per compliance topic ----
   In the Power Apps build this becomes a su_counselassignment table
   (topic -> attorney), with Helen Ambrose as the default escalation. */
const COUNSEL = {
  "Research":{n:"Miriam Adler",t:"Associate General Counsel — Research and Technology",u:"Office of University Counsel",e:"madler@syr.edu",ph:"315-443-1108",l:"300 Crouse Hinds Hall"},
  "Privacy":{n:"Alicia Monroe",t:"University Privacy Officer and Counsel",u:"Office of University Counsel",e:"amonroe@syr.edu",ph:"315-443-1104",l:"300 Crouse Hinds Hall"},
  "IT and Cyber Security":{n:"Alicia Monroe",t:"University Privacy Officer and Counsel",u:"Office of University Counsel",e:"amonroe@syr.edu",ph:"315-443-1104",l:"300 Crouse Hinds Hall"},
  "Human Resources":{n:"Daniel Reyes",t:"Associate General Counsel — Employment and Labor",u:"Office of University Counsel",e:"dreyes@syr.edu",ph:"315-443-1112",l:"300 Crouse Hinds Hall"},
  "Academic and Faculty Affairs":{n:"Daniel Reyes",t:"Associate General Counsel — Employment and Labor",u:"Office of University Counsel",e:"dreyes@syr.edu",ph:"315-443-1112",l:"300 Crouse Hinds Hall"},
  "Athletics":{n:"Grace Whitfield",t:"Deputy General Counsel — Athletics and Title IX",u:"Office of University Counsel",e:"gwhitfield@syr.edu",ph:"315-443-1117",l:"300 Crouse Hinds Hall"},
  "Student Experience":{n:"Grace Whitfield",t:"Deputy General Counsel — Athletics and Title IX",u:"Office of University Counsel",e:"gwhitfield@syr.edu",ph:"315-443-1117",l:"300 Crouse Hinds Hall"},
  "Safety and Security":{n:"Grace Whitfield",t:"Deputy General Counsel — Athletics and Title IX",u:"Office of University Counsel",e:"gwhitfield@syr.edu",ph:"315-443-1117",l:"300 Crouse Hinds Hall"},
  "Finance, CFO Office":{n:"Peter Lund",t:"Associate General Counsel — Finance and Tax",u:"Office of University Counsel",e:"plund@syr.edu",ph:"315-443-1121",l:"300 Crouse Hinds Hall"},
  "Advancement":{n:"Peter Lund",t:"Associate General Counsel — Finance and Tax",u:"Office of University Counsel",e:"plund@syr.edu",ph:"315-443-1121",l:"300 Crouse Hinds Hall"}
};
const GC_DEFAULT = P.ambrose;
const counselFor = f => (f && COUNSEL[f.topic]) || GC_DEFAULT;

/* ---- university Active Directory (stand-in for the AD / Entra ID connector) ----
   People who exist at the university but are not yet in the Compliance Directory.
   adLookup matches on name or @syr.edu address; addToDirectory creates the
   Compliance Directory record (su_compliancedirectory) from the AD result. */
const AD_DIRECTORY = [
  {n:"Priya Raghavan",t:"Director of Export Control",u:"Office of Research",e:"praghavan@syr.edu",ph:"315-443-2807",l:"113 Bowne Hall",netid:"praghav"},
  {n:"Owen Castellano",t:"Associate Director, Environmental Health and Safety",u:"Campus Safety and Emergency Services",e:"ocastellano@syr.edu",ph:"315-443-4132",l:"027 Physical Plant",netid:"ocastel"},
  {n:"Rachel Kim",t:"Assistant Controller",u:"Comptroller's Office",e:"rkim@syr.edu",ph:"315-443-2497",l:"640 Skytop Road",netid:"rkim03"},
  {n:"Devon Mbeki",t:"Title IX Investigator",u:"Equal Opportunity, Inclusion and Resolution Services",e:"dmbeki@syr.edu",ph:"315-443-4018",l:"005 Steele Hall",netid:"dmbeki"},
  {n:"Hannah Sorensen",t:"Manager of Clinical Research Compliance",u:"Office of Research",e:"hsorensen@syr.edu",ph:"315-443-2811",l:"113 Bowne Hall",netid:"hsorens"},
  {n:"Marcus Bell",t:"Director of Emergency Management",u:"Campus Safety and Emergency Services",e:"mbell@syr.edu",ph:"315-443-4299",l:"005 Sims Hall",netid:"mbell07"},
  {n:"Elena Duarte",t:"Senior Immigration Specialist",u:"Center for International Services",e:"eduarte@syr.edu",ph:"315-443-2457",l:"310 Walnut Place",netid:"eduarte"},
  {n:"Simon Whitlock",t:"Manager of Athletics Eligibility",u:"Athletics",e:"swhitlock@syr.edu",ph:"315-443-2377",l:"Manley Field House",netid:"swhitlo"},
  {n:"Aisha Karim",t:"Records and Registration Analyst",u:"Registrar",e:"akarim@syr.edu",ph:"315-443-2438",l:"106 Steele Hall",netid:"akarim2"},
  {n:"Gregory Nolan",t:"IT Risk and Compliance Analyst",u:"Information Technology Services",e:"gnolan@syr.edu",ph:"315-443-2691",l:"206 Machinery Hall",netid:"gnolan"}
];
const adLookup = q => {
  const t = (q||"").trim().toLowerCase();
  if(t.length<2) return null;
  return AD_DIRECTORY.find(p=>p.e.toLowerCase()===t)
      || AD_DIRECTORY.find(p=>p.n.toLowerCase()===t)
      || AD_DIRECTORY.find(p=>p.e.toLowerCase().startsWith(t)||p.n.toLowerCase().includes(t))
      || null;
};
const addToDirectory = ad => {
  const existing = PEOPLE.find(p=>p.e===ad.e);
  if(existing) return existing;
  const p = {n:ad.n,t:ad.t,u:ad.u,e:ad.e,ph:ad.ph,l:ad.l,netid:ad.netid,addedFromAD:true};
  PEOPLE.push(p);
  return p;
};

Object.assign(window,{FUNCTIONS,TOPICS,DEADLINES,GAPS,FLAGS,PEOPLE,EXECUTIVES,COUNSEL,counselFor,AD_DIRECTORY,adLookup,addToDirectory,DataSource,TODAY:today});
