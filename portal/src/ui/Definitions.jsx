/* Definitions (parity spec 2.2). Copy is verbatim from DefinitionsScreen.pa.yaml. */

import React from "react";
import { Hero } from "./parts.jsx";

const SECTIONS = [
  ["STRUCTURE", [
    ["Risk Area (Level 1)", "One of the university's core segments of institutional exposure, spanning academics, operations, finance, safety, and reputation. In the matrix, it is the broadest level a function is organized under, so that compliance obligations and institutional risk are described in common terms."],
    ["Domain (Level 2)", "A high level compliance category that organizes related compliance functions and obligations within a common Risk Area, providing a framework for assessing compliance responsibilities, controls, and risks across the institution."],
    ["Compliance Function (Level 3)", "Each Compliance Function is a single regulatory obligation. Each Compliance Function has its own record with its own ownership chain and where applicable, a regulatory deadline."]
  ]],
  ["PEOPLE AND OWNERSHIP", [
    ["Accountability Structure", "The designated administrative roles responsible for executive oversight, unit management, and operational compliance."],
    ["Executive Owner", "The senior leader accountable for the obligation at the University level."],
    ["Unit Owner", "The leader who oversees the obligation within their department or office."],
    ["Compliance Owner", "The person in the department or office who handles the day-to-day work of meeting the obligation; serves as the primary contact for the Office of Compliance on questions about the obligation."],
    ["General Counsel", "The attorney who provides legal interpretation of an obligation, including what the source authority requires."]
  ]],
  ["THE RECORD", [
    ["Statute", "The law, regulation, or standard that gives rise to the obligation, such as the Jeanne Clery Act, the Family Educational Rights and Privacy Act, or the Middle States Standards for Accreditation. Accreditor standards and athletic association bylaws carry the same type of obligation."],
    ["Citation", "The specific provision within the source authority that establishes the obligation, such as 20 U.S.C. 1092(f), 34 CFR 99.7, or NCAA Bylaw 14.8."],
    ["Requirement", "A plain-language statement of the action the obligation calls for, expressed in the University's own terms rather than the wording of the source."],
    ["Reporting Requirement", "The output an obligation calls for, whether produced, filed, published, or retained."],
    ["Deadline and Cadence", "When an obligation comes due, whether as a fixed date, a recurring cycle, or triggered by an event."]
  ]],
  ["RISK, GAPS AND FLAGS", [
    ["Compliance Risk Rating", "A measure of the university's compliance exposure for a function, based on the state of its compliance program and the regulatory risk that follows. The Office of Compliance uses a 3-point scale (High, Moderate, Low) to rate compliance risk.", true],
    ["Gap", "A shortfall between what an obligation calls for and current practice, recorded so it can be tracked and closed."],
    ["Open Gap", "A gap that has not yet been resolved."],
    ["Flag", "A request for the compliance office to review a function when something about its record looks incorrect, such as an incorrect owner, an outdated citation, or a changed deadline."]
  ]]
];

export function Definitions() {
  return <>
    <Hero big eyebrow="START HERE" title="Definitions"
      lede="The vocabulary of the Compliance Matrix: what it is, why the university built it, and precisely what each term on every screen means." />
    <div className="wrap defs">
      {SECTIONS.map(([h, terms]) => <section key={h}>
        <h2>{h}</h2>
        <dl>{terms.map(([t, d, pills]) => <React.Fragment key={t}>
          <dt>{t}</dt>
          <dd>{d}{pills && <span className="pills">
            <span className="pill r-High">HIGH</span><span className="pill r-Moderate">MODERATE</span><span className="pill r-Low">LOW</span>
          </span>}</dd>
        </React.Fragment>)}</dl>
      </section>)}
    </div>
  </>;
}
