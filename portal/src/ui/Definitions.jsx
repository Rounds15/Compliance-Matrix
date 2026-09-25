/* Definitions, in the design's reading layout: an "On this page" rail that
   follows the scroll, and each section's terms as a definition list. The
   terms and their wording are the canvas app's (DefinitionsScreen), verbatim;
   the figures under the introduction read from the live data. */

import React, { useEffect, useState } from "react";
import { PageHead, useApp } from "./parts.jsx";
import { RISK_COLOR } from "../lib/risk.js";

const SECTIONS = [
  ["structure", "Structure", [
    ["Risk Area (Level 1)", "One of the university's core segments of institutional exposure, spanning academics, operations, finance, safety, and reputation. In the matrix, it is the broadest level a function is organized under, so that compliance obligations and institutional risk are described in common terms."],
    ["Domain (Level 2)", "A high level compliance category that organizes related compliance functions and obligations within a common Risk Area, providing a framework for assessing compliance responsibilities, controls, and risks across the institution."],
    ["Compliance Function (Level 3)", "Each Compliance Function is a single regulatory obligation. Each Compliance Function has its own record with its own ownership chain and where applicable, a regulatory deadline."]
  ]],
  ["people", "People and ownership", [
    ["Accountability Structure", "The designated administrative roles responsible for executive oversight, unit management, and operational compliance."],
    ["Executive Owner", "The senior leader accountable for the obligation at the University level."],
    ["Unit Owner", "The leader who oversees the obligation within their department or office."],
    ["Compliance Owner", "The person in the department or office who handles the day-to-day work of meeting the obligation; serves as the primary contact for the Office of Compliance on questions about the obligation."],
    ["General Counsel", "The attorney who provides legal interpretation of an obligation, including what the source authority requires."]
  ]],
  ["record", "The record", [
    ["Statute", "The law, regulation, or standard that gives rise to the obligation, such as the Jeanne Clery Act, the Family Educational Rights and Privacy Act, or the Middle States Standards for Accreditation. Accreditor standards and athletic association bylaws carry the same type of obligation."],
    ["Citation", "The specific provision within the source authority that establishes the obligation, such as 20 U.S.C. 1092(f), 34 CFR 99.7, or NCAA Bylaw 14.8."],
    ["Requirement", "A plain-language statement of the action the obligation calls for, expressed in the University's own terms rather than the wording of the source."],
    ["Reporting Requirement", "The output an obligation calls for, whether produced, filed, published, or retained."],
    ["Deadline and Cadence", "When an obligation comes due, whether as a fixed date, a recurring cycle, or triggered by an event."]
  ]],
  ["risk", "Risk, gaps and flags", [
    ["Compliance Risk Rating", "A measure of the university's compliance exposure for a function, based on the state of its compliance program and the regulatory risk that follows. The Office of Compliance uses a 3-point scale (High, Moderate, Low) to rate compliance risk.", true],
    ["Gap", "A shortfall between what an obligation calls for and current practice, recorded so it can be tracked and closed."],
    ["Open Gap", "A gap that has not yet been resolved."],
    ["Flag", "A request for the compliance office to review a function when something about its record looks incorrect, such as an incorrect owner, an outdated citation, or a changed deadline."]
  ]]
];

export function Definitions() {
  const { ds, go } = useApp();
  const [active, setActive] = useState(SECTIONS[0][0]);
  const statutes = new Set(ds.fns.map(f => f.statute).filter(Boolean)).size;
  useEffect(() => {
    const onScroll = () => {
      let cur = SECTIONS[0][0];
      SECTIONS.forEach(([id]) => { const el = document.getElementById("df-" + id); if (el && el.getBoundingClientRect().top < 180) cur = id; });
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const jump = id => { const el = document.getElementById("df-" + id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" }); };

  return <div className="page wrap df-page">
    <PageHead eyebrow="Start here" title="Definitions"
      sub="The vocabulary of the Compliance Matrix: what it is, why the university built it, and precisely what each term on every screen means." />
    <div className="df-split">
      <nav className="df-nav" aria-label="On this page">
        <div className="df-nav-h">On this page</div>
        {SECTIONS.map(([id, label]) => <button key={id} className={"df-nav-i" + (active === id ? " on" : "")} aria-current={active === id ? "true" : undefined} onClick={() => jump(id)}>{label}</button>)}
      </nav>
      <div className="df-body">
        <div className="df-stats" style={{ marginTop: 0, marginBottom: 26 }}>
          <button className="df-stat" onClick={() => go("Functions")}><span className="n">{ds.fns.length}</span><span className="l">Compliance functions</span></button>
          <button className="df-stat" onClick={() => go("Functions", { lens: "topic" })}><span className="n">{ds.topics.length}</span><span className="l">Risk areas</span></button>
          <button className="df-stat" onClick={() => go("Functions", { lens: "area" })}><span className="n">{ds.domains.length}</span><span className="l">Domains</span></button>
          <button className="df-stat" onClick={() => go("Functions", { lens: "statute" })}><span className="n">{statutes}</span><span className="l">Distinct statutes and standards</span></button>
        </div>
        {SECTIONS.map(([id, label, terms]) => <section key={id} id={"df-" + id} className="df-sect">
          <h2>{label}</h2>
          <dl className="df-dl">{terms.map(([t, d, scale]) => <div key={t} className="df-term">
            <dt>{t}</dt>
            <dd>{d}{scale && <div className="df-risk" style={{ marginTop: 12 }}>
              {["High", "Moderate", "Low"].map(r => <div key={r} className="df-risk-r"><span className="p" style={{ background: RISK_COLOR[r] }}>{r}</span></div>)}
            </div>}</dd>
          </div>)}</dl>
        </section>)}
      </div>
    </div>
  </div>;
}
