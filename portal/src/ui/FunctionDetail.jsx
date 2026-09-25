/* Function Detail, in the design's record layout: breadcrumb bar, navy
   header, inline flag and gap panels, the record in sections, and a rail with
   status, actions, counsel and related functions. What it shows and who may
   do what follow the canvas app (scr_FunctionDetail): the risk rating is
   shown in Admin view or to the function's own people; editing, creating and
   deleting are administrator actions; the deadlines listed are the ones the
   viewer's mode shows; "Add to my calendar" and "Mark complete for this
   cycle" work on those. */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Risk, Field, Empty, Modal, ModalHead, Busy, DuePill, dueState, bare, useApp } from "./parts.jsx";
import { CompletionDialog, CompleteButton, useVisibleDeadlines } from "./Completion.jsx";
import { OwnershipChain } from "./Ownership.jsx";
import { functionsFor, allRows } from "../data/model.js";
import { fmtDate, fiscalQ } from "../lib/dates.js";
import { RISK_COLOR, RISK_CHOICES, riskRank } from "../lib/risk.js";
import { deadlinesIcs, download } from "./exports.js";

const draftOf = f => f ? { ...f } : {
  id: null, code: "", name: "", topicId: null, topic: "", areaId: null, area: "", statute: "", citation: "",
  statuteUrl: "", description: "", reporting: "", deadline: "", resourceLabel: "", resourceUrl: "", risk: "Unrated"
};

function EditForm({ d, set }) {
  const { ds } = useApp();
  const areas = [...ds.topics].sort((a, b) => a.name.localeCompare(b.name));
  const domains = ds.domains.filter(x => String(x.topicId) === String(d.topicId));
  const text = (k, label, ph) => <div><label className="flab" htmlFor={"fd-" + k}>{label}</label>
    <input id={"fd-" + k} className="ti" value={d[k] || ""} onChange={e => set({ [k]: e.target.value })} placeholder={ph} /></div>;
  return <>
    <Field label="Identification">
      <div className="frow">
        {text("name", "Function name", "Compliance function")}
        <div style={{ flex: "0 0 200px" }}><label className="flab" htmlFor="fd-risk">Risk rating</label>
          <select id="fd-risk" className="ti" value={d.risk === "Unrated" ? "" : d.risk} onChange={e => set({ risk: e.target.value || "Unrated" })}>
            {RISK_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {d.risk && d.risk !== "Unrated" && !RISK_CHOICES.some(([v]) => v === d.risk) && <option value={d.risk}>{d.risk} (legacy)</option>}
          </select></div>
      </div>
      <div className="frow">
        <div><label className="flab" htmlFor="fd-topic">Risk area</label>
          <select id="fd-topic" className="ti" value={d.topicId ?? ""} onChange={e => { const t = areas.find(x => String(x.id) === e.target.value); set({ topicId: t ? t.id : null, topic: t ? t.name : "", areaId: null, area: "" }); }}>
            <option value="">Select a risk area</option>
            {areas.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="flab" htmlFor="fd-area">Compliance domain</label>
          <select id="fd-area" className="ti" value={d.areaId ?? ""} disabled={d.topicId == null} onChange={e => { const x = domains.find(y => String(y.id) === e.target.value); set({ areaId: x ? x.id : null, area: x ? x.name : "" }); }}>
            <option value="">{d.topicId != null ? (domains.length ? "Select a domain" : "No domains in this risk area") : "Select a risk area first"}</option>
            {domains.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      </div>
    </Field>
    <Field label="Governing statute">
      <div className="frow">{text("statute", "Statute", "Statute")}{text("citation", "Statute citation", "Citation")}</div>
      {text("statuteUrl", "Statute URL", "https://")}
    </Field>
    <Field label="What the obligation is"><textarea className="ti" aria-label="Description" value={d.description} onChange={e => set({ description: e.target.value })} placeholder="Description" /></Field>
    <Field label="Reporting requirement"><textarea className="ti" aria-label="Reporting requirement" value={d.reporting} onChange={e => set({ reporting: e.target.value })} placeholder="Reporting requirement" /></Field>
    <Field label="Deadline and cadence"><input className="ti" aria-label="Deadline" value={d.deadline} onChange={e => set({ deadline: e.target.value })} placeholder="Deadline" /></Field>
    <Field label="Syracuse University resource">
      <div className="frow">{text("resourceLabel", "SU resource label", "Resource label")}{text("resourceUrl", "SU resource URL", "https://")}</div>
    </Field>
  </>;
}

export function FunctionDetail({ f, isNew }) {
  const { ds, adapter, actions, flash, realAdmin, adminView, actingPerson, go, openFn, today } = useApp();
  const visible = useVisibleDeadlines();
  const [mode, setMode] = useState(isNew ? "edit" : "read");
  const [d, setD] = useState(() => draftOf(f));
  const [panel, setPanel] = useState(null); // "flag" | "gap" | null
  const [flagText, setFlagText] = useState("");
  const [gapForm, setGapForm] = useState({ title: "", note: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  const [completing, setCompleting] = useState(null);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sorted = useMemo(() => [...ds.fns].sort((a, b) => a.name.localeCompare(b.name)), [ds]);
  const idx = f ? sorted.indexOf(f) : -1;
  const owns = !!f && functionsFor(actingPerson, ds.fns).includes(f);
  const showRisk = adminView || owns || isNew;
  const same = x => f && String(x.functionId) === String(f.id);
  const flag = f ? ds.flags.find(same) : null;
  const gs = f ? ds.gaps.filter(same).sort((a, b) => (b.opened || 0) - (a.opened || 0)) : [];
  const openGaps = gs.filter(g => g.open);
  const dls = f ? visible.filter(same).filter(x => x.due).sort((a, b) => a.due - b.due) : [];
  const nextDue = dls.find(x => x.status !== "Completed");
  const related = f ? ds.fns.filter(x => x !== f && String(x.topicId) === String(f.topicId))
    .sort((a, b) => riskRank(a.risk) - riskRank(b.risk) || a.name.localeCompare(b.name)).slice(0, 4) : [];
  const inTopic = f ? ds.fns.filter(x => String(x.topicId) === String(f.topicId)).length : 0;
  const set = patch => setD(x => ({ ...x, ...patch }));
  const editing = mode === "edit";

  const save = async () => {
    if (!d.name.trim() || d.topicId == null || d.areaId == null) { flash("Function name, risk area, and domain are all required.", "error"); return; }
    try {
      const r = await actions.saveFunction({ ...d, name: d.name.trim() }, !!isNew);
      if (isNew) window.location.replace("#/functions/" + encodeURIComponent(r.id));
      else setMode("read");
    } catch (e) { /* the toast says what failed */ }
  };
  const cancel = () => { if (isNew) go("Functions"); else { setD(draftOf(f)); setMode("read"); } };
  const submitFlag = async () => {
    try { await actions.addFlag(f, flagText.trim()); setPanel(null); setFlagText(""); } catch (e) { /* toast */ }
  };
  const submitGap = async () => {
    try { await actions.logGap(f, { title: gapForm.title.trim(), note: gapForm.note.trim() }); setPanel(null); setGapForm({ title: "", note: "" }); } catch (e) { /* toast */ }
  };
  const addToCalendar = () => download("compliance-deadlines-" + String(f.code).replace(/[^A-Za-z0-9-]/g, "") + ".ics",
    deadlinesIcs(dls, window.location.hostname || "syr.edu"), "text/calendar");
  const del = async () => {
    try { await actions.deleteFunction(f); setConfirmDel(false); go("Functions"); } catch (e) { /* toast */ }
  };

  const title = isNew ? (d.name || "New compliance function") : editing ? "Editing - " + (d.name || f.name) : f.name;
  const counsel = f ? f.counsel : null;
  const shownRisk = editing ? d.risk : f.risk;

  return <div className="fd">
    <div className="fd-crumb">
      <div className="wrap fd-crumb-in">
        <button className="crumb-back" onClick={() => go("Functions")}><Icon n="arrow-right" s={14} style={{ transform: "rotate(180deg)" }} />All functions</button>
        {f && <><span className="crumb-sep">/</span>
          <button className="crumb-link" onClick={() => go("Functions", { filter: { area: f.topicId == null ? "" : String(f.topicId) } })}>{f.topic}</button></>}
        <span className="crumb-sep">/</span>
        <span className="crumb-here">{isNew ? "New function" : f.name}</span>
        {f && <div className="fd-step">
          <button className="button button-ghost button-sm" disabled={idx <= 0} onClick={() => openFn(sorted[idx - 1])}>Previous</button>
          <button className="button button-ghost button-sm" disabled={idx < 0 || idx >= sorted.length - 1} onClick={() => openFn(sorted[idx + 1])}>Next record</button>
        </div>}
      </div>
    </div>

    <div className="fd-head">
      <div className="wrap">
        <div className="eyebrow" style={{ color: "#FF8E00" }}>{isNew ? "Administrator · New record" : f.topic + " · " + f.area}</div>
        <h1>{title}</h1>
        <div className="fd-tags">
          {showRisk && <Risk r={shownRisk} />}
          {f && <span className="fd-chip">ID {f.code}</span>}
          {(editing ? d.statute : f.statute) && <span className="fd-chip">{editing ? d.statute : f.statute}</span>}
          {openGaps.length > 0 && <span className="gapbadge">{openGaps.length} open {openGaps.length === 1 ? "gap" : "gaps"}</span>}
          {flag && <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Flagged for review</span>}
        </div>
        {editing && <div className="fd-actions">
          <Busy busyKey="fn" className="button button-primary" onClick={save}><Icon n="check" s={15} />{isNew ? "Create function" : "Save changes"}</Busy>
          <button className="button button-secondary-outline fd-onnavy" onClick={cancel}>Cancel</button>
        </div>}
      </div>
    </div>
    <div className="fd-rule"></div>

    {panel === "flag" && <div className="fd-panel">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="flag" s={16} />Flag this function for review</div>
        <label className="flab" htmlFor="fd-flag">Why does this need review?</label>
        <textarea id="fd-flag" className="ti" autoFocus value={flagText} onChange={e => setFlagText(e.target.value)} placeholder="For example, the citation may be superseded by a new rule." />
        <div className="note" style={{ marginTop: 10 }}>Flagging notifies the compliance office and adds this function to the review queue.</div>
        <div className="fd-panel-a">
          <Busy busyKey="flag" className="button button-primary" disabled={!flagText.trim()} onClick={submitFlag}><Icon n="flag" s={15} />Submit flag</Busy>
          <button className="button button-secondary-outline" onClick={() => { setFlagText(""); setPanel(null); }}>Cancel</button>
        </div>
      </div>
    </div>}

    {panel === "gap" && <div className="fd-panel gap">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="alert" s={16} />Log a compliance gap</div>
        <label className="flab" htmlFor="fd-gap-t">Gap summary</label>
        <input id="fd-gap-t" className="ti" autoFocus value={gapForm.title} onChange={e => setGapForm({ ...gapForm, title: e.target.value })} placeholder="What is out of compliance?" />
        <label className="flab" htmlFor="fd-gap-n" style={{ marginTop: 12 }}>Detail and remediation plan</label>
        <textarea id="fd-gap-n" className="ti" value={gapForm.note} onChange={e => setGapForm({ ...gapForm, note: e.target.value })} placeholder="What was found, how it was identified, and what happens next." />
        <div className="note" style={{ marginTop: 10 }}>Opens a gap on this function and routes it to the Gap Tracker{f.owner.none ? "" : " and to " + f.owner.n}.</div>
        <div className="fd-panel-a">
          <Busy busyKey="gap" className="button button-danger" disabled={!gapForm.title.trim()} onClick={submitGap}><Icon n="alert" s={15} />Log gap</Busy>
          <button className="button button-secondary-outline" onClick={() => { setGapForm({ title: "", note: "" }); setPanel(null); }}>Cancel</button>
        </div>
      </div>
    </div>}

    <div className="wrap fd-body">
      <main className="fd-main">
        {flag && !editing && <div className="note fd-flagnote">
          <b>Flagged for review</b> by {flag.by}{flag.at ? " on " + fmtDate(flag.at) : ""}: {flag.reason}
          {realAdmin && <div style={{ marginTop: 8 }}><Busy busyKey={"flag-" + flag.id} className="button button-secondary-outline button-sm" onClick={() => actions.resolveFlag(flag, f).catch(() => null)}><Icon n="check" s={13} />Clear flag</Busy></div>}
        </div>}

        {editing ? <>
          {isNew
            ? <div className="note" style={{ marginBottom: 18 }}><b>New function.</b> Create the record first; then add its people with <b>Manage people</b> in the Accountability Structure.</div>
            : <div className="note" style={{ marginBottom: 18 }}><b>Editing.</b> Deadlines read their owner and risk from this function, so they follow any change you save here.</div>}
          <EditForm d={d} set={set} />
        </> : <>
          <Field label="Governing statute">
            <dl className="kv">
              <dt>Statute</dt><dd>{f.statute || <span className="sub">Not recorded</span>}</dd>
              <dt>Citation</dt><dd>{f.citation || <span className="sub">Not recorded</span>}</dd>
              <dt>Reference</dt><dd>{f.statuteUrl ? <a href={f.statuteUrl} target="_blank" rel="noopener">{bare(f.statuteUrl)} <Icon n="ext" s={12} style={{ verticalAlign: -1 }} /></a> : <span className="sub">No link recorded</span>}</dd>
            </dl>
          </Field>
          <Field label="What the obligation is"><p>{f.description || <span className="sub">No description recorded.</span>}</p></Field>
          <Field label="Reporting requirement"><p>{f.reporting || <span className="sub">No reporting requirement recorded.</span>}</p></Field>
          <Field label="Deadline and cadence">
            <p style={{ marginBottom: dls.length ? 12 : 0 }}>{f.deadline || <span className="sub">No deadline narrative recorded.</span>}</p>
            {dls.map(x => {
              const st = dueState(x, today);
              return <div key={x.id} className="dlrow" style={{ background: st.cls === "late" ? "#FFF7F7" : "#fff" }}>
                <Icon n="clock" s={15} style={{ color: "#707780" }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#000E54" }}>{x.title}</div>
                  <div className="sub">{fmtDate(x.due)} {"·"} {fiscalQ(x.due)} {"·"} {x.cadence}{x.status === "Completed" && x.lastDone ? " · completed " + fmtDate(x.lastDone) : ""}</div></div>
                <DuePill dl={x} today={today} />
                <CompleteButton dl={x} />
              </div>;
            })}
          </Field>
          <OwnershipChain f={f} admin={realAdmin} />
          <Field label={"Gap history (" + gs.length + ")"}>
            {gs.length ? gs.map(g => <div key={g.id} className="gaprow" style={{ borderLeftColor: g.open ? (RISK_COLOR[g.severity] || "#DC2626") : "#16A34A" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={"pill " + (g.open ? "late" : "ok")}>{g.status}</span>
                <span className="sub">{g.code}{g.opened ? " · opened " + fmtDate(g.opened) : ""}{g.closed ? " · closed " + fmtDate(g.closed) : ""}</span></div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#000E54", marginTop: 6 }}>{g.title}</div>
              {(g.open ? g.note : (g.closeNote || g.note)) && <p style={{ fontSize: 13, color: "#5b6373", marginTop: 4 }}>{g.open ? g.note : (g.closeNote || g.note)}</p>}
            </div>) : <Empty title="No gaps recorded" sub={'Nothing has been logged against this function. Use "Log a gap" if you find something out of compliance.'} />}
          </Field>
          <Field label="Syracuse University resource">
            {f.resourceUrl ? <>
              <a href={f.resourceUrl} target="_blank" rel="noopener" style={{ fontSize: 14, fontWeight: 600 }}>{f.resourceLabel || bare(f.resourceUrl)} <Icon n="ext" s={12} style={{ verticalAlign: -1 }} /></a>
              <div className="sub" style={{ marginTop: 3 }}>{bare(f.resourceUrl)}</div>
            </> : f.resourceLabel ? <div style={{ fontSize: 14, fontWeight: 600 }}>{f.resourceLabel}</div>
              : <span className="sub">No university resource recorded.</span>}
          </Field>
        </>}
      </main>

      {f && <aside className="fd-rail">
        <div className="rail-card">
          <div className="rail-t">Record status</div>
          <dl className="rail-kv">
            {showRisk && <><dt>Risk rating</dt><dd><Risk r={f.risk} /></dd></>}
            <dt>Open gaps</dt><dd>{openGaps.length ? <span className="gapbadge">{openGaps.length}</span> : <span className="sub">None</span>}</dd>
            <dt>Next deadline</dt><dd>{nextDue ? <><div style={{ fontWeight: 600, color: "#000E54", fontSize: 13 }}>{fmtDate(nextDue.due)}</div><DuePill dl={nextDue} today={today} /></> : <span className="sub">None scheduled</span>}</dd>
            <dt>Under review</dt><dd>{flag ? <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Yes</span> : <span className="sub">No</span>}</dd>
            <dt>Last reviewed</dt><dd className="sub">{f.lastReviewed ? fmtDate(f.lastReviewed) : "Not recorded"}</dd>
          </dl>
        </div>
        {!editing && <div className="rail-card">
          <div className="rail-t">Take action</div>
          <div className="rail-acts">
            {realAdmin && <button className="button button-secondary-outline button-sm" onClick={() => { setD(draftOf(f)); setPanel(null); setMode("edit"); }}><Icon n="edit" s={14} />Edit this record</button>}
            <button className={"button button-secondary-outline button-sm" + (panel === "flag" ? " on" : "")} aria-pressed={panel === "flag"} onClick={() => setPanel(p => p === "flag" ? null : "flag")}><Icon n="flag" s={14} />Flag for review</button>
            <button className="button button-danger-outline button-sm" aria-pressed={panel === "gap"} onClick={() => setPanel(p => p === "gap" ? null : "gap")}><Icon n="alert" s={14} />Log a gap</button>
            <button className="button button-ghost button-sm" onClick={() => go("Deadlines")}><Icon n="calendar" s={14} />See all deadlines</button>
            <button className="button button-ghost button-sm" disabled={!dls.length} onClick={addToCalendar} title={dls.length ? "Download the deadlines as a calendar file" : "No deadlines to add"}><Icon n="plus" s={14} />Add to my calendar</button>
            <button className="button button-ghost button-sm" disabled={!dls.length} onClick={() => setCompleting(nextDue || dls[0])}><Icon n="check" s={14} />Mark complete for this cycle</button>
            {realAdmin && <button className="button button-ghost button-sm fd-del" onClick={() => setConfirmDel(true)}><Icon n="trash" s={14} />Delete this function</button>}
          </div>
        </div>}
        <div className="rail-card gc">
          <div className="rail-t">Legal questions</div>
          {counsel ? <>
            <div className="gc-lede">General Counsel (Advisory) for {adapter.counselPerFunction ? "this function" : f.topic}. Reach out before responding to a regulator, signing an agreement, or interpreting the statute.</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
              <Avatar person={counsel} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#000E54", fontSize: 13.5, lineHeight: 1.3 }}>{counsel.n}</div>
                {counsel.t && <div style={{ fontSize: 12, color: "#5b6373", marginTop: 3, lineHeight: 1.35 }}>{counsel.t}</div>}
                {counsel.e && <a href={"mailto:" + counsel.e} style={{ fontSize: 12, display: "inline-block", marginTop: 5, wordBreak: "break-all" }}>{counsel.e}</a>}
              </div></div>
            {counsel.e && <a className="gc-esc" href={"mailto:" + counsel.e + "?subject=" + encodeURIComponent("Legal question: " + f.code + " " + f.name)}>Email a question about this function</a>}
          </> : <div className="gc-lede">No General Counsel is assigned to this function yet.{realAdmin && adapter.counselPerFunction ? " Add one with Manage people." : ""}</div>}
        </div>
        {!!related.length && !editing && <div className="rail-card quiet">
          <div className="rail-t">Related in {f.topic}</div>
          {related.map(x => <button key={x.id} className="rail-rel" onClick={() => openFn(x)}>
            <span>{x.name}</span><Risk r={x.risk} />
          </button>)}
          {inTopic > related.length + 1 && <button className="rail-rel all" onClick={() => go("Functions", { filter: { area: String(f.topicId) } })}>
            <span>All {inTopic} in {f.topic}</span><Icon n="arrow-right" s={14} /></button>}
        </div>}
      </aside>}
    </div>

    {confirmDel && <Modal onClose={() => setConfirmDel(false)} size="sm" label="Delete this function?">
      <ModalHead onClose={() => setConfirmDel(false)} eyebrow="Administrator" title="Delete this function?" sub={"ID " + f.code + " · " + f.name} />
      <div className="mbd">
        <p>This will permanently remove "{f.name}" and everything attached to it:</p>
        <ul style={{ margin: "10px 0 0 18px", fontSize: 14, lineHeight: 1.7 }}>
          <li>{ds.allDeadlines.filter(same).length} deadline(s)</li>
          <li>{gs.length} gap(s)</li>
          <li>{ds.allFlags.filter(same).length} flag(s)</li>
          <li>{allRows(f).length} ownership assignment(s)</li>
        </ul>
        <div className="note" style={{ marginTop: 14 }}>A copy of each is written to the archive first. This cannot be undone.</div>
      </div>
      <div className="mft">
        <Busy busyKey="fn-del" className="button button-danger" onClick={del}><Icon n="trash" s={15} />Delete permanently</Busy>
        <button className="button button-secondary-outline" onClick={() => setConfirmDel(false)}>Cancel</button>
      </div>
    </Modal>}
    {completing && <CompletionDialog dl={completing} onClose={() => setCompleting(null)} />}
  </div>;
}
