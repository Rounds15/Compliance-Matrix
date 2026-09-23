/* Definitions — what the matrix is, why it exists, and every term it uses.
   Ported verbatim from the design; the counts and the Function ID example
   read from the live data, and the risk scale shows the levels in use. */
import React, { useState, useEffect } from "react";
import { Icon, PageHead, useApp } from "./parts.jsx";
import { RISK_COLOR } from "../lib/risk.js";

const SECTIONS = [
  ["what","What the matrix is"],
  ["why","Why we built it"],
  ["model","How a record is structured"],
  ["structure","Structure terms"],
  ["legal","Legal and requirement terms"],
  ["people","People and ownership terms"],
  ["risk","Risk, gaps and flags"],
  ["who","Who does what"]
];

const T = ({term,also,children}) => <div className="df-term">
  <dt>{term}{also&&<span className="df-also">also called {also}</span>}</dt>
  <dd>{children}</dd>
</div>;

export function Definitions({ go }){
  const { ds, adapter } = useApp();
  const fns = ds.fns;
  const [active,setActive]=useState("what");
  const riskAreas = ds.topics.length;
  const domains = ds.domains.length || new Set(fns.map(f=>f.area)).size;
  const statutes = new Set(fns.map(f=>f.statute).filter(Boolean)).size;
  const idExample = fns[0] ? fns[0].code : "";
  const idForm = adapter.name === "sharepoint" ? "the list item number (shown as #123)" : adapter.name === "dataverse" ? "the Function ID column" : "the form CF-0000";
  const legacyScale = fns.some(f => f.risk === "Critical" || f.risk === "Medium");
  useEffect(()=>{
    const ids = SECTIONS.map(([id])=>id);
    const onScroll = () => {
      let cur = ids[0];
      ids.forEach(id=>{const el=document.getElementById("df-"+id);
        if(el && el.getBoundingClientRect().top < 180) cur=id;});
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const jump = id => {const el=document.getElementById("df-"+id); if(el) window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-140,behavior:"smooth"});};

  return <div className="page wrap df-page">
    <PageHead eyebrow="Start here" title="Definitions"
      sub="The vocabulary of the Compliance Matrix — what it is, why the university built it, and precisely what each term on every screen means."/>

    <div className="df-split">
      <nav className="df-nav" aria-label="On this page">
        <div className="df-nav-h">On this page</div>
        {SECTIONS.map(([id,label])=>
          <button key={id} className={"df-nav-i"+(active===id?" on":"")} onClick={()=>jump(id)}>{label}</button>)}
      </nav>

      <div className="df-body">
        {/* ---------------- what ---------------- */}
        <section id="df-what" className="df-sect">
          <h2>What the matrix is</h2>
          <p className="df-lead">The Compliance Matrix is the university's single inventory of the external obligations Syracuse University must meet — every federal statute, state law, accreditor standard, and athletic association rule that creates a duty for the institution — recorded one obligation at a time, with a named person accountable for each.</p>
          <p>It is not a policy library and not a task manager. A policy says how Syracuse chooses to operate; the matrix records what an outside authority requires and who at the university answers for it. Each entry is a <b>compliance function</b>: one discrete obligation, its legal source, what has to be produced, when it is due, the level of risk if it is missed, and the chain of people who own it.</p>
          <div className="df-stats">
            <div className="df-stat"><span className="n">{fns.length}</span><span className="l">Compliance functions</span></div>
            <div className="df-stat"><span className="n">{riskAreas}</span><span className="l">Risk areas</span></div>
            <div className="df-stat"><span className="n">{domains}</span><span className="l">Domains</span></div>
            <div className="df-stat"><span className="n">{statutes}</span><span className="l">Distinct statutes and standards</span></div>
          </div>
        </section>

        {/* ---------------- why ---------------- */}
        <section id="df-why" className="df-sect">
          <h2>Why we built it</h2>
          <p>Before the matrix, obligations lived in the heads and inboxes of the people who happened to handle them. That worked until someone changed roles, a regulation was amended, or an auditor asked a question no single office could answer. Four problems drove this work:</p>
          <div className="df-why">
            <article><h3>No complete inventory</h3><p>No one could produce a defensible list of what the university is required to do. Obligations were discoverable only by asking the person who had always done them.</p></article>
            <article><h3>Ownership by assumption</h3><p>Responsibility was widely assumed and rarely recorded. When a role turned over, the obligation went quiet rather than transferring.</p></article>
            <article><h3>Risk without proportion</h3><p>A routine annual posting and a Clery Act filing received the same attention, because nothing distinguished the consequence of missing one from the other.</p></article>
            <article><h3>Findings arriving late</h3><p>Gaps surfaced during audits and investigations instead of in advance, when there was still time to fix them cheaply.</p></article>
          </div>
        </section>

        {/* ---------------- purpose ---------------- */}
        <section className="df-purpose">
          <div className="df-purpose-in">
            <div className="eyebrow" style={{color:"var(--orange)"}}>Purpose</div>
            <p>The matrix exists so that any obligation the university carries can be named, located, and traced to an accountable person in under a minute — by the office that owns it, by leadership, and by an auditor.</p>
            <div className="df-purpose-l">
              <div><span>1</span>Know every obligation, in one place, in plain language.</div>
              <div><span>2</span>Name a person, not an office, for each one.</div>
              <div><span>3</span>Rank obligations by consequence so attention follows risk.</div>
              <div><span>4</span>Surface gaps early and record how they were resolved.</div>
            </div>
          </div>
        </section>

        {/* ---------------- model ---------------- */}
        <section id="df-model" className="df-sect">
          <h2>How a record is structured</h2>
          <p>Every function sits at the bottom of a two-level grouping and carries three layers of detail. Read left to right:</p>
          <div className="df-model">
            <div className="df-node"><span className="k">Risk Area</span><span className="v">Research</span><span className="d">Broad category of exposure</span></div>
            <Icon n="arrow-right" s={18} style={{color:"var(--muted)",flex:"none"}}/>
            <div className="df-node"><span className="k">Domain</span><span className="v">Human Subjects</span><span className="d">Narrower grouping inside it</span></div>
            <Icon n="arrow-right" s={18} style={{color:"var(--muted)",flex:"none"}}/>
            <div className="df-node on"><span className="k">Compliance Function</span><span className="v">IRB Review and Continuing Review</span><span className="d">The obligation itself — the record</span></div>
          </div>
          <div className="df-layers">
            <div><h4>Legal layer</h4><p>Statute, citation, the requirement in plain language, what must be reported, and when it is due.</p></div>
            <div><h4>People layer</h4><p>The ownership chain — executive, unit, and compliance owners, each with a sub-role.</p></div>
            <div><h4>Status layer</h4><p>Risk rating, any open gaps, and any flag raised for review.</p></div>
          </div>
        </section>

        {/* ---------------- structure ---------------- */}
        <section id="df-structure" className="df-sect">
          <h2>Structure terms</h2>
          <dl className="df-dl">
            <T term="Compliance Matrix">The full inventory of the university's external compliance obligations, and the application that maintains it. One row per obligation, one accountable chain per row.</T>
            <T term="Compliance Function" also="function, obligation">A single external obligation the university must satisfy — the unit of record in the matrix. It is deliberately narrow: “Clery Act Annual Security Report” is one function, not “Clery compliance.” If two duties have different deadlines, different owners, or different consequences for failure, they are two functions.</T>
            <T term="Risk Area" also="formerly “Topic”">The top-level category of exposure a function belongs to — Research, Human Resources, Privacy, Athletics, and so on. There are {riskAreas} of them, and they are how the institution talks about risk at the leadership level. Every function belongs to exactly one.</T>
            <T term="Domain" also="formerly “Area”">The narrower grouping inside a risk area — Human Subjects and Export Control inside Research, Benefits and Wage and Hour inside Human Resources. Domains are how the offices that do the work organize it. Every function belongs to exactly one domain, and each domain sits inside one risk area.</T>
            <T term="Function ID">The permanent identifier for a function, taken from {idForm}{idExample ? " — for example " + idExample : ""}. It never changes, even when the function is renamed or reassigned, so audit records and correspondence stay traceable.</T>
            <T term="Lens">A way of reading the same filtered set of functions on the browse screen — as a flat list, or grouped by risk area, domain, or statute. Changing the lens never changes which functions are in the set, only how they are arranged.</T>
          </dl>
        </section>

        {/* ---------------- legal ---------------- */}
        <section id="df-legal" className="df-sect">
          <h2>Legal and requirement terms</h2>
          <dl className="df-dl">
            <T term="Statute">The named law, regulation, or standard that creates the obligation — the Jeanne Clery Act, the Family Educational Rights and Privacy Act, MSCHE Standards for Accreditation. Not all sources are statutes in the strict sense; accreditor standards and NCAA bylaws are recorded here as well, because they create the same kind of duty.</T>
            <T term="Citation">The specific provision within that source — 20 U.S.C. § 1092(f), 34 CFR § 99.7, NCAA Bylaw 14.8. The citation is what an auditor asks for, and it is what makes a function verifiable rather than asserted.</T>
            <T term="Requirement">A plain-language statement of what the university must actually do, written so that someone who has never read the regulation can act on it. This is authored by the compliance office, reviewed by counsel, and is not a quotation of the statute.</T>
            <T term="Reporting requirement">What has to be produced, filed, published, or retained as evidence — the form submitted, the notice published, the record kept and for how long. If a function produces no artifact, that is recorded too.</T>
            <T term="Deadline">When the obligation comes due, expressed as it actually operates: a fixed date, a recurrence, or a window triggered by an event. Every deadline in the matrix generates a record on the Deadlines calendar.</T>
            <T term="Legal question">A question raised on a function and routed to the attorney assigned to that risk area. The routing is by risk area, so the same attorney sees every question in their subject matter rather than every question on campus.</T>
          </dl>
        </section>

        {/* ---------------- people ---------------- */}
        <section id="df-people" className="df-sect">
          <h2>People and ownership terms</h2>
          <p>Every function carries a chain of three roles. The chain is the answer to “who is responsible?” at three different altitudes, and all three are named individuals — never an office, never a title alone.</p>
          <dl className="df-dl">
            <T term="Ownership chain">The set of named people accountable for one function, organized into three roles. A role may hold more than one person; a person may appear in the chains of many functions.</T>
            <T term="Executive Owner">Accountable at the cabinet level. Answers for the obligation to the Chancellor, the Board, and external authorities. Does not do the work.</T>
            <T term="Unit Owner">Runs the obligation inside the unit that carries it — sets the local process, assigns the staff, and escalates when the work cannot be done.</T>
            <T term="Compliance Owner">Does the work and files the record. This is the person an auditor speaks to and the person the deadline belongs to.</T>
            <T term="Sub-role" also="Primary, Advisory, Support">The weight of one person's involvement within a role. <b>Primary</b> is answerable; <b>Advisory</b> is consulted and holds relevant expertise; <b>Support</b> contributes to the work. Each role should have exactly one Primary.</T>
            <T term="Compliance Directory">The people layer of the matrix — everyone who appears in any ownership chain, with title, unit, and contact information. Adding someone to a chain who is not yet in the directory validates them against the university Active Directory and creates their record.</T>
          </dl>
        </section>

        {/* ---------------- risk ---------------- */}
        <section id="df-risk" className="df-sect">
          <h2>Risk, gaps and flags</h2>
          <dl className="df-dl">
            <T term="Compliance Risk Rating" also="risk rating">The consequence to the university of failing to meet the obligation — not the likelihood of failing. A routine annual posting that is easy to miss is still Medium if the penalty is a corrected filing; a Clery Act report is Critical because the exposure is a federal fine, a public finding, and reputational damage.</T>
          </dl>
          <div className="df-risk">
            {(legacyScale ? [["Critical","Loss of federal funding, a public finding, litigation, or harm to people. Escalates immediately."],
              ["High","Substantial fines, mandated corrective action, or an adverse audit finding."],
              ["Medium","Correctable finding, limited penalty, or remediation at the university's expense."],
              ["Low","Administrative correction with no external consequence."]]
            : [["High","Loss of federal funding, a public finding, litigation, harm to people, substantial fines, or mandated corrective action. Escalates immediately."],
              ["Moderate","Correctable finding, limited penalty, or remediation at the university's expense."],
              ["Low","Administrative correction with no external consequence."],
              ["Unrated","Not yet scored. Counted as its own group everywhere, never assumed to be low."]]).map(([r,d])=>
              <div key={r} className="df-risk-r"><span className="p" style={{background:RISK_COLOR[r]}}>{r}</span><span>{d}</span></div>)}
          </div>
          <dl className="df-dl">
            <T term="Gap">A recorded difference between what an obligation requires and what the university is currently doing. A gap has a severity, an owner, a date opened, and — when resolved — a closing note describing what changed. Gaps are the honest record of the matrix; an inventory with no open gaps is usually an inventory no one is reading.</T>
            <T term="Open gap">A gap that has not yet been resolved. The count appears beside a function everywhere it is listed, and drives the Gap Tracker.</T>
            <T term="Flag">A request for the compliance office to look at a function — the owner is wrong, the citation is stale, the deadline has changed, the requirement no longer reads correctly. A flag is a question about the <i>record</i>; a gap is a finding about the <i>practice</i>.</T>
            <T term="Deadline record">One dated instance of an obligation coming due, generated from a function's deadline. Overdue records are marked on the calendar and roll up to the owner.</T>
          </dl>
        </section>

        {/* ---------------- who ---------------- */}
        <section id="df-who" className="df-sect">
          <h2>Who does what</h2>
          <div className="df-who">
            <div><h4>Compliance owners</h4><p>Keep their functions accurate. Log a gap when practice falls short, flag a record when it no longer reads correctly, and answer the deadline.</p></div>
            <div><h4>Executive owners</h4><p>Review the risk concentration in their areas each quarter and clear the path when a unit cannot meet an obligation.</p></div>
            <div><h4>Compliance and Enterprise Risk Management</h4><p>Owns the matrix itself — adds and retires functions, maintains citations, triages flags, and reports the portfolio to leadership and the Board.</p></div>
            <div><h4>Office of University Counsel</h4><p>Answers legal questions by risk area and reviews requirement language before it is published.</p></div>
          </div>
          <div className="df-cta">
            <p>Ready to look at the inventory?</p>
            <div className="df-cta-b">
              <button className="button button-primary" onClick={()=>go("Functions")}>Browse compliance functions <Icon n="arrow-right" s={15}/></button>
              <button className="button button-secondary-outline" onClick={()=>go("Directory")}>Open the directory</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

