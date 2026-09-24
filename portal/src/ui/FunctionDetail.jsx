/* Function Detail (parity spec 2.4, scr_FunctionDetail.pa.yaml): read, edit
   and create a function. Edit mode is one flat form, ownership included, saved
   with "Save changes", as in the app. */

import React, { useMemo, useState } from "react";
import { Hero, RiskPill, Avatar, Modal, Busy, Icon, Sec, Strip, DuePill, bare, useApp } from "./parts.jsx";
import { CompletionDialog, useVisibleDeadlines } from "./Completion.jsx";
import { functionsFor, ROLE_EXEC, ROLE_UNIT, ROLE_COMPLIANCE, ROLE_COUNSEL, SUBROLES } from "../data/model.js";
import { fmtDate } from "../lib/dates.js";
import { deadlinesIcs, download } from "./exports.js";

const RISKS = ["Not Scored", "Low", "Moderate", "High"];
const ROLE_ORDER = { [ROLE_EXEC]: 1, [ROLE_UNIT]: 2 };
const byRole = (a, b) => (ROLE_ORDER[a.role] || 3) - (ROLE_ORDER[b.role] || 3);

const draftOf = f => f ? {
  name: f.name, risk: f.risk === "Unrated" ? "Not Scored" : f.risk, topicId: f.topicId == null ? "" : String(f.topicId),
  areaId: f.areaId == null ? "" : String(f.areaId), statute: f.statute, citation: f.citation, statuteUrl: f.statuteUrl,
  description: f.description, reporting: f.reporting, deadline: f.deadline, resourceLabel: f.resourceLabel, resourceUrl: f.resourceUrl
} : { name: "", risk: "Not Scored", topicId: "", areaId: "", statute: "", citation: "", statuteUrl: "", description: "", reporting: "", deadline: "", resourceLabel: "", resourceUrl: "" };

const ownersOf = f => f ? [...f.chain.exec, ...f.chain.unit, ...f.chain.compliance, ...f.chain.support]
  .map(r => ({ role: r.role, sub: r.sub || "Primary", personId: r.person.id, name: r.person.n })) : [];

/* one group of owner cards: Primary before Advisory, "Not assigned" when empty */
function OwnerGroup({ label, cls, role, rows }) {
  const { go } = useApp();
  const list = [...rows].sort((a, b) => (a.sub === "Primary" ? 0 : 1) - (b.sub === "Primary" ? 0 : 1));
  return <>
    <div className={"grp " + cls}>{label}</div>
    <div className="ocards">{list.length ? list.map(r => <button key={String(r.rowId) + r.person.id} className={"ocard " + cls} onClick={() => go("Directory", { person: r.person.id })}>
      <Avatar person={r.person} square />
      <span style={{ minWidth: 0 }}><span className="n">{r.person.n}</span>
        <span className="r">{(role + " · " + (r.sub || "Primary")).toUpperCase()}</span>
        <span className="t">{r.person.t}</span><span className="d">{r.person.u}</span><span className="e">{r.person.e}</span></span>
    </button>) : <div className={"ocard " + cls}><Avatar person={null} square /><span><span className="n">Not assigned</span>
      <span className="r">{(role + " · ").toUpperCase()}</span></span></div>}</div>
  </>;
}

function Edit({ draft, setDraft, owners, setOwners, gc, setGc }) {
  const { ds, adapter } = useApp();
  const [pick, setPick] = useState({ personId: "", role: ROLE_COMPLIANCE, sub: "Primary" });
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v, ...(k === "topicId" ? { areaId: "" } : null) }));
  const areas = [...ds.topics].sort((a, b) => a.name.localeCompare(b.name));
  const domains = ds.domains.filter(d => String(d.topicId) === draft.topicId);
  const people = ds.people;
  const add = () => {
    const p = people.find(x => String(x.id) === pick.personId);
    if (!p) return;
    if (owners.some(o => String(o.personId) === String(p.id) && o.role === pick.role)) return;
    setOwners(o => [...o, { role: pick.role, sub: pick.sub, personId: p.id, name: p.n }]);
  };
  const text = (k, label, hint) => <><label className="flabel" htmlFor={"fd-" + k}>{label}</label>
    <input id={"fd-" + k} className="input" value={draft[k] || ""} onChange={e => set(k, e.target.value)} placeholder={hint} /></>;
  const area = (k, label, hint) => <><label className="flabel" htmlFor={"fd-" + k}>{label}</label>
    <textarea id={"fd-" + k} className="textarea" style={{ minHeight: 96 }} value={draft[k] || ""} onChange={e => set(k, e.target.value)} placeholder={hint} /></>;
  return <div className="editf">
    {text("name", "FUNCTION NAME", "Compliance function")}
    <label className="flabel" htmlFor="fd-risk">RISK RATING</label>
    <select id="fd-risk" className="select" style={{ width: 220 }} value={draft.risk} onChange={e => set("risk", e.target.value)}>
      {RISKS.map(r => <option key={r}>{r}</option>)}</select>
    <label className="flabel" htmlFor="fd-topic">RISK AREA</label>
    <select id="fd-topic" className="select" value={draft.topicId} onChange={e => set("topicId", e.target.value)}>
      <option value=""></option>{areas.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}</select>
    <label className="flabel" htmlFor="fd-area">COMPLIANCE DOMAIN</label>
    <select id="fd-area" className="select" value={draft.areaId} onChange={e => set("areaId", e.target.value)} disabled={!draft.topicId}>
      {!draft.topicId ? <option value="">Select a risk area first</option>
        : <><option value=""></option>{domains.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}</>}</select>

    <label className="flabel" htmlFor="fd-own-person">OWNERSHIP CHAIN</label>
    <div className="own-add">
      <select id="fd-own-person" className="select" value={pick.personId} onChange={e => setPick({ ...pick, personId: e.target.value })} aria-label="Person">
        <option value=""></option>{people.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</select>
      <select className="select" value={pick.role} onChange={e => setPick({ ...pick, role: e.target.value })} aria-label="Role">
        {adapter.roles.map(r => <option key={r}>{r}</option>)}</select>
      <select className="select" value={pick.sub} onChange={e => setPick({ ...pick, sub: e.target.value })} aria-label="Sub-role">
        {SUBROLES.map(r => <option key={r}>{r}</option>)}</select>
      <button className="btn navy" style={{ minHeight: 40 }} onClick={add} disabled={!pick.personId}>Add owner</button>
    </div>
    <ul className="own-list">{[...owners].sort(byRole).map((o, i) => <li key={o.role + o.personId + i}>
      <span className="grow"><span className="n">{o.name}</span><span className="m">{(o.role + " · " + o.sub).toUpperCase()}</span></span>
      <button className="btn sm rm" onClick={() => setOwners(list => list.filter(x => x !== o))}>Remove</button></li>)}</ul>

    {adapter.counselPerFunction && <>
      <label className="flabel" htmlFor="fd-gc">GENERAL COUNSEL (ADVISORY)</label>
      <select id="fd-gc" className="select" value={gc} onChange={e => setGc(e.target.value)}>
        <option value=""></option>{people.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</select></>}

    {text("statute", "STATUTE", "Statute")}
    {text("citation", "STATUTE CITATION", "Citation")}
    {text("statuteUrl", "STATUTE URL", "Statute URL")}
    {area("description", "DESCRIPTION", "Description")}
    {area("reporting", "REPORTING REQUIREMENT", "Reporting requirement")}
    {text("deadline", "DEADLINE", "Deadline")}
    {text("resourceLabel", "SU RESOURCE LABEL", "Resource label")}
    {text("resourceUrl", "SU RESOURCE URL", "Resource URL")}
  </div>;
}

export function FunctionDetail({ f, isNew }) {
  const { ds, adapter, actions, flash, realAdmin, adminView, actingPerson, go, openFn, busy, today } = useApp();
  const visible = useVisibleDeadlines();
  const [mode, setMode] = useState(isNew ? "New" : "Read");
  const [panel, setPanel] = useState("");
  const [flagText, setFlagText] = useState("");
  const [gapTitle, setGapTitle] = useState("");
  const [gapNote, setGapNote] = useState("");
  const [draft, setDraft] = useState(() => draftOf(f));
  const [owners, setOwners] = useState(() => ownersOf(f));
  const [gc, setGc] = useState(() => (f && f.chain.counsel[0] ? String(f.chain.counsel[0].person.id) : ""));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [completing, setCompleting] = useState(null);

  const sorted = useMemo(() => [...ds.fns].sort((a, b) => a.name.localeCompare(b.name)), [ds]);
  const idx = f ? sorted.indexOf(f) : -1;
  const owns = f && functionsFor(actingPerson, ds.fns).includes(f);
  const showRisk = adminView || owns;
  const sameId = x => f && String(x.functionId) === String(f.id);
  const gaps = f ? ds.gaps.filter(sameId).sort((a, b) => (b.opened || 0) - (a.opened || 0)) : [];
  const openGaps = gaps.filter(g => g.status === "Open").length;
  const underReview = f ? ds.flags.some(sameId) : false;
  const myDeadlines = f ? visible.filter(sameId).filter(d => d.due).sort((a, b) => a.due - b.due) : [];
  const editing = mode === "Edit" || mode === "New";
  const RANK = { High: 0, Moderate: 1, Low: 2, Unrated: 3 };
  const related = f ? ds.fns.filter(x => x !== f && String(x.topicId) === String(f.topicId))
    .sort((a, b) => (RANK[a.risk] ?? 4) - (RANK[b.risk] ?? 4) || a.name.localeCompare(b.name)).slice(0, 4) : [];

  const startEdit = () => { setDraft(draftOf(f)); setOwners(ownersOf(f)); setGc(f && f.chain.counsel[0] ? String(f.chain.counsel[0].person.id) : ""); setPanel(""); setMode("Edit"); };
  const cancel = () => { if (mode === "New") go("Functions"); else { setMode("Read"); setDraft(draftOf(f)); } };

  const save = async () => {
    if (!draft.name.trim() || !draft.topicId || !draft.areaId) { flash("Function name, risk area, and domain are all required.", "error"); return; }
    const topic = ds.topics.find(t => String(t.id) === draft.topicId);
    const dom = ds.domains.find(d => String(d.id) === draft.areaId);
    const body = { ...draft, name: draft.name.trim(), risk: draft.risk === "Not Scored" ? "Unrated" : draft.risk,
      topicId: topic ? topic.id : null, areaId: dom ? dom.id : null, id: f ? f.id : undefined, code: f ? f.code : undefined };
    const rows = owners.map(o => ({ personId: o.personId, name: o.name, role: o.role, sub: o.sub }));
    const gcPerson = adapter.counselPerFunction && gc ? ds.people.find(p => String(p.id) === gc) : null;
    if (gcPerson) rows.push({ personId: gcPerson.id, name: gcPerson.n, role: ROLE_COUNSEL, sub: "Advisory" });
    const before = JSON.stringify(f ? [...ownersOf(f).map(o => [o.role, String(o.personId), o.sub]), ...f.chain.counsel.map(r => [ROLE_COUNSEL, String(r.person.id)])].sort() : []);
    const after = JSON.stringify(rows.map(r => r.role === ROLE_COUNSEL ? [r.role, String(r.personId)] : [r.role, String(r.personId), r.sub]).sort());
    try {
      const r = await actions.saveFunction(body, mode === "New");
      const id = mode === "New" ? r.id : f.id;
      /* Dataverse keeps General Counsel by risk area, so leave its rows alone */
      if (before !== after) await actions.setOwnership({ id, name: body.name }, adapter.counselPerFunction ? rows : rows.filter(x => x.role !== ROLE_COUNSEL));
      if (mode === "New") window.location.replace("#/functions/" + encodeURIComponent(id));
      else setMode("Read");
    } catch (e) { /* toast */ }
  };

  const submitFlag = async () => { try { await actions.addFlag(f, flagText.trim()); setFlagText(""); setPanel(""); } catch (e) { /* toast */ } };
  const submitGap = async () => { try { await actions.logGap(f, { title: gapTitle.trim(), note: gapNote.trim() }); setGapTitle(""); setGapNote(""); setPanel(""); } catch (e) { /* toast */ } };
  const addToCalendar = () => download("compliance-deadlines-" + String(f.code).replace(/[^A-Za-z0-9-]/g, "") + ".ics", deadlinesIcs(myDeadlines, window.location.hostname || "syr.edu"), "text/calendar");
  const del = async () => { try { await actions.deleteFunction(f); setConfirmDelete(false); go("Functions"); } catch (e) { /* toast */ } };

  const title = mode === "New" ? "New function" : (mode === "Edit" ? "Editing - " : "") + (mode === "Edit" ? draft.name : f.name);
  const counsel = f ? f.counsel : null;

  return <>
    <Strip crumbs={f ? [
      { label: "All functions", go: () => go("Functions") },
      { label: f.topic, go: () => go("Functions", { filter: { area: f.topicId == null ? "" : String(f.topicId) } }) },
      { label: f.name }
    ] : [{ label: "All functions", go: () => go("Functions") }, { label: "New function" }]}
      right={f && <span className="step">
        <button className="btn sm" disabled={idx <= 0} onClick={() => openFn(sorted[idx - 1])}>Previous</button>
        <button className="btn sm" disabled={idx < 0 || idx >= sorted.length - 1} onClick={() => openFn(sorted[idx + 1])}>Next record</button>
      </span>} />

    <Hero className="fdhero" eyebrow={mode === "New" ? "NEW RECORD" : (f.topic + " · " + f.area).toUpperCase()} title={title}>
      {f && <div className="chips">
        {showRisk && <RiskPill r={mode === "Edit" ? (draft.risk === "Not Scored" ? "Unrated" : draft.risk) : f.risk} />}
        <span className="chip">{f.code}</span>
        {(mode === "Edit" ? draft.statute : f.statute) && <span className="chip">{mode === "Edit" ? draft.statute : f.statute}</span>}
      </div>}
    </Hero>

    {panel === "Flag" && <div className="fpanel flag"><div className="wrap">
      <h3>FLAG THIS FUNCTION FOR REVIEW</h3>
      <textarea className="textarea" value={flagText} onChange={e => setFlagText(e.target.value)} placeholder="Why does this need review?" aria-label="Why does this need review?" />
      <div className="row">
        <Busy busyKey="flag" className="btn primary" style={{ minWidth: 150 }} disabled={!flagText.trim()} onClick={submitFlag}>Submit flag</Busy>
        <button className="btn ghost" onClick={() => { setFlagText(""); setPanel(""); }}>Cancel</button>
      </div>
    </div></div>}
    {panel === "Gap" && <div className="fpanel gap"><div className="wrap">
      <h3>LOG A COMPLIANCE GAP</h3>
      <input className="input" value={gapTitle} onChange={e => setGapTitle(e.target.value)} placeholder="Gap summary - what is out of compliance?" aria-label="Gap summary" />
      <textarea className="textarea" value={gapNote} onChange={e => setGapNote(e.target.value)} placeholder="Detail and remediation plan" aria-label="Detail and remediation plan" />
      <div className="row">
        <Busy busyKey="gap" className="btn medium" style={{ minWidth: 150 }} disabled={!gapTitle.trim()} onClick={submitGap}>Log gap</Busy>
        <button className="btn ghost" onClick={() => { setGapTitle(""); setGapNote(""); setPanel(""); }}>Cancel</button>
      </div>
    </div></div>}

    <div className="wrap fdgrid">
      <div className="fdmain">
        {editing ? <Edit draft={draft} setDraft={setDraft} owners={owners} setOwners={setOwners} gc={gc} setGc={setGc} /> : <>
          <div className="fdsec"><Sec>GOVERNING STATUTE</Sec>
            <dl className="kvs"><dt>Statute</dt><dd>{f.statute}</dd><dt>Citation</dt><dd>{f.citation}</dd>
              <dt>Reference</dt><dd>{f.statuteUrl ? <a href={f.statuteUrl} target="_blank" rel="noopener">{bare(f.statuteUrl)}</a> : ""}</dd></dl></div>
          <div className="fdsec"><Sec>WHAT THE OBLIGATION IS</Sec><p className="txt">{f.description}</p></div>
          <div className="fdsec"><Sec>REPORTING REQUIREMENT</Sec><p className="txt">{f.reporting}</p></div>
          <div className="fdsec"><Sec>DEADLINE AND CADENCE</Sec><p className="txt">{f.deadline}</p>
            {myDeadlines.map(d => <div className="dlcard" key={d.id}><Icon n="clock" s={18} />
              <span className="grow"><b>{d.title}</b><small>{fmtDate(d.due)} {"\u00B7"} {d.cadence}</small></span>
              <DuePill dl={d} today={today} /></div>)}</div>
          <div className="fdsec"><Sec>ACCOUNTABILITY STRUCTURE</Sec>
            <div className="owners">
              <OwnerGroup label="EXECUTIVE OWNERS" cls="exec" role={ROLE_EXEC} rows={f.chain.exec} />
              <OwnerGroup label="UNIT OWNERS" cls="unit" role={ROLE_UNIT} rows={f.chain.unit} />
              <OwnerGroup label="COMPLIANCE OWNERS" cls="comp" role={ROLE_COMPLIANCE} rows={f.chain.compliance} />
            </div></div>
          <div className="fdsec"><Sec>GAP HISTORY ({gaps.length})</Sec>
            {gaps.length ? <div className="gaps">{gaps.map(g => <div className="gapcard" key={g.id}>
              <div className="top"><span className={"st" + (g.status === "Closed" ? " closed" : "")}>{g.status.toUpperCase()}</span><span className="t">{g.title}</span></div>
              {g.note && <p className="note">{g.note}</p>}
            </div>)}</div> : <p className="fdempty">No gaps recorded against this function.</p>}</div>
          <div className="fdsec res"><Sec>SYRACUSE UNIVERSITY RESOURCE</Sec>
            {f.resourceUrl ? <><a href={f.resourceUrl} target="_blank" rel="noopener">{f.resourceLabel || bare(f.resourceUrl)}</a><div className="u">{bare(f.resourceUrl)}</div></>
              : f.resourceLabel ? <p className="txt">{f.resourceLabel}</p> : null}</div>
        </>}
      </div>

      <aside className="fdrail">
        {f && <div className="rcard"><h3>RECORD STATUS</h3>
          <dl className="kvs">
            {showRisk && <><dt>Risk rating</dt><dd>{f.risk === "Unrated" ? "Not Rated" : f.risk}</dd></>}
            <dt>Open gaps</dt><dd>{openGaps}</dd>
            {myDeadlines[0] && <><dt>Next deadline</dt><dd>{fmtDate(myDeadlines[0].due)}<br /><DuePill dl={myDeadlines[0]} today={today} /></dd></>}
            <dt>Under review</dt><dd>{underReview ? "Yes" : "No"}</dd>
            <dt>Last reviewed</dt><dd>{f.lastReviewed ? fmtDate(f.lastReviewed) : ""}</dd>
          </dl></div>}
        {f && <div className="rcard gc"><h3>GENERAL COUNSEL</h3>
          <div className="gcn"><b>{counsel ? counsel.n : "Not assigned"}</b>Advisory</div>
          {counsel && counsel.e && <a href={"mailto:" + counsel.e} style={{ fontWeight: 700, fontSize: 13 }}>{counsel.e}</a>}
        </div>}
        <div className="rcard"><h3>TAKE ACTION</h3>
          <div className="actions">
            {realAdmin && (editing
              ? <Busy busyKey={busy === "own" ? "own" : "fn"} className="save" onClick={save}>{mode === "New" ? "Create function" : "Save changes"}</Busy>
              : <button onClick={startEdit}><Icon n="edit" s={16} />Edit this record</button>)}
            {editing && <button className="cancel" onClick={cancel}>Cancel</button>}
            {!editing && <>
              <button className={panel === "Flag" ? "on" : ""} onClick={() => setPanel(p => (p === "Flag" ? "" : "Flag"))}><Icon n="flag" s={16} />Flag for review</button>
              <button className={"gap" + (panel === "Gap" ? " on" : "")} onClick={() => setPanel(p => (p === "Gap" ? "" : "Gap"))}><Icon n="warning" s={16} />Log a gap</button>
              <button onClick={() => go("Deadlines")}><Icon n="calendar" s={16} />See all deadlines</button>
              <button disabled={!myDeadlines.length} onClick={addToCalendar}><Icon n="plus" s={16} />Add to my calendar</button>
              <button className="cmp" disabled={!myDeadlines.length} onClick={() => setCompleting(myDeadlines[0])}><Icon n="check" s={16} />Mark complete for this cycle</button>
              {realAdmin && <button className="del" onClick={() => setConfirmDelete(true)}><Icon n="trash" s={16} />Delete this function</button>}
            </>}
          </div>
        </div>
        {f && related.length > 0 && !editing && <div className="rcard"><h3>RELATED IN {f.topic.toUpperCase()}</h3>
          <ul className="related">{related.map(x => <li key={x.id}><button onClick={() => openFn(x)}><span>{x.name}</span><RiskPill r={x.risk} /></button></li>)}</ul>
          {ds.fns.filter(x => String(x.topicId) === String(f.topicId)).length > related.length + 1 &&
            <button className="linkbtn" onClick={() => go("Functions", { filter: { area: String(f.topicId) } })}>All of {f.topic} <Icon n="arrow" s={13} sw={2.2} /></button>}
        </div>}
      </aside>
    </div>

    {confirmDelete && <Modal className="danger" onClose={() => setConfirmDelete(false)} label="Delete this function?">
      <h2>Delete this function?</h2>
      <p className="body">This will permanently remove "{f.name}" and everything attached to it: {ds.allDeadlines.filter(sameId).length} deadline(s), {ds.gaps.filter(sameId).length} gap(s), and {ds.allFlags.filter(sameId).length} flag(s). A copy of each is written to the archive first. This cannot be undone.</p>
      <div className="mfoot">
        <Busy busyKey="fn-del" className="btn danger" style={{ minWidth: 220, minHeight: 46 }} onClick={del}>Delete permanently</Busy>
        <button className="btn" style={{ minWidth: 140, minHeight: 46 }} onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>
    </Modal>}
    {completing && <CompletionDialog dl={completing} onClose={() => setCompleting(null)} />}
  </>;
}
