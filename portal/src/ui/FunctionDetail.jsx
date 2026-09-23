/* FUNCTION DETAIL — full screen. The design's drill-down (inline edit, flag,
   log a gap, gap history, deadlines, ownership chain) plus what the canvas app
   does that the design did not: create a function, delete one with everything
   it owns, and complete or reverse a deadline. */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Risk, Field, Empty, Modal, Busy, dueState, useApp, ExtLink, bare } from "./parts.jsx";
import { fmtDate, fiscalQ } from "../lib/dates.js";
import { RISK_COLOR, RISK_CHOICES } from "../lib/risk.js";
import { OwnershipChain } from "./Ownership.jsx";
import { DeadlineAction } from "./DeadlineAction.jsx";

export const blankFunction = () => ({
  id: null, code: "", name: "", topicId: null, topic: "", areaId: null, area: "", statute: "", citation: "",
  statuteUrl: "", description: "", reporting: "", deadline: "", resourceLabel: "", resourceUrl: "", risk: "Unrated",
  chain: { exec: [], unit: [], compliance: [], counsel: [] }, counsel: null, lastReviewed: null
});

function EditForm({ d, set }) {
  const { ds } = useApp();
  const domains = ds.domains.filter(x => String(x.topicId) === String(d.topicId));
  return <>
    <Field label="Identification">
      <div className="frow">
        <div><label className="flab">Compliance function</label><input className="ti" value={d.name} onChange={e => set({ name: e.target.value })} /></div>
        <div><label className="flab">Risk rating</label>
          <select className="ti" value={d.risk === "Unrated" ? "" : d.risk} onChange={e => set({ risk: e.target.value || "Unrated" })}>
            {RISK_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {d.risk && d.risk !== "Unrated" && !RISK_CHOICES.some(([v]) => v === d.risk) && <option value={d.risk}>{d.risk} (legacy)</option>}
          </select></div>
      </div>
      <div className="frow">
        <div><label className="flab">Risk area</label>
          <select className="ti" value={d.topicId ?? ""} onChange={e => { const t = ds.topics.find(x => String(x.id) === e.target.value); set({ topicId: t ? t.id : null, topic: t ? t.name : "", areaId: null, area: "" }); }}>
            <option value="">Select a risk area</option>
            {ds.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="flab">Domain</label>
          <select className="ti" value={d.areaId ?? ""} disabled={!d.topicId} onChange={e => { const x = domains.find(y => String(y.id) === e.target.value); set({ areaId: x ? x.id : null, area: x ? x.name : "" }); }}>
            <option value="">{d.topicId ? (domains.length ? "Select a domain" : "No domains in this risk area") : "Select a risk area first"}</option>
            {domains.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      </div>
    </Field>
    <Field label="Statute">
      <div className="frow">
        <div><label className="flab">Statute</label><input className="ti" value={d.statute} onChange={e => set({ statute: e.target.value })} /></div>
        <div><label className="flab">Citation</label><input className="ti" value={d.citation} onChange={e => set({ citation: e.target.value })} /></div>
      </div>
      <label className="flab">Statute URL</label><input className="ti" value={d.statuteUrl} onChange={e => set({ statuteUrl: e.target.value })} placeholder="https://" />
    </Field>
    <Field label="Description"><textarea className="ti" value={d.description} onChange={e => set({ description: e.target.value })} /></Field>
    <Field label="Reporting requirement"><textarea className="ti" value={d.reporting} onChange={e => set({ reporting: e.target.value })} /></Field>
    <Field label="Deadline"><input className="ti" value={d.deadline} onChange={e => set({ deadline: e.target.value })} /></Field>
    <Field label="Syracuse University resource">
      <div className="frow">
        <div><label className="flab">Label</label><input className="ti" value={d.resourceLabel} onChange={e => set({ resourceLabel: e.target.value })} /></div>
        <div><label className="flab">URL</label><input className="ti" value={d.resourceUrl} onChange={e => set({ resourceUrl: e.target.value })} placeholder="https://" /></div>
      </div>
    </Field>
  </>;
}

export function FunctionDetailScreen({ f, isNew, go, onBack, prev, next, onJump, onCreated }) {
  const { ds, adminView, actingPerson, actions, today, adapter } = useApp();
  const [mode, setMode] = useState(isNew ? "edit" : "read");
  const [d, setD] = useState(f);
  const [panel, setPanel] = useState(null); // "flag" | "gap" | null
  const [flagText, setFlagText] = useState("");
  const [gapForm, setGapForm] = useState({ title: "", note: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setD(f); setMode(isNew ? "edit" : "read"); setPanel(null); window.scrollTo(0, 0); }, [f, isNew]);

  const admin = adminView;
  const flag = ds.flags.find(x => String(x.functionId) === String(f.id));
  const dls = ds.allDeadlines.filter(x => String(x.functionId) === String(f.id));
  const gs = ds.gaps.filter(x => String(x.functionId) === String(f.id));
  const openGaps = gs.filter(g => g.open);
  const nextDue = dls.filter(x => !x.complete && x.due).sort((a, b) => a.due - b.due)[0];
  const set = patch => setD({ ...d, ...patch });
  const related = useMemo(() => ds.fns.filter(x => x.topic === f.topic && String(x.id) !== String(f.id)).slice(0, 4), [ds.fns, f]);
  const counsel = f.counsel;
  const canSave = d.name.trim() && d.topicId;

  const save = async () => {
    try {
      const r = await actions.saveFunction(d, isNew);
      setMode("read");
      if (isNew && onCreated) onCreated(r.id);
    } catch (e) { /* toast shown */ }
  };
  const submitFlag = async () => {
    try { await actions.addFlag(f, flagText.trim()); setPanel(null); setFlagText(""); } catch (e) { /* toast */ }
  };
  const submitGap = async () => {
    try { await actions.logGap(f, { title: gapForm.title.trim(), note: gapForm.note.trim() }); setPanel(null); setGapForm({ title: "", note: "" }); } catch (e) { /* toast */ }
  };
  const del = async () => {
    try { await actions.deleteFunction(f); setConfirmDel(false); onBack(); } catch (e) { /* toast */ }
  };

  return <div className="fd">
    <div className="fd-crumb">
      <div className="wrap fd-crumb-in">
        <button className="crumb-back" onClick={onBack}><Icon n="arrow-right" s={14} style={{ transform: "rotate(180deg)" }} />All functions</button>
        {!isNew && <><span className="crumb-sep">/</span>
          <button className="crumb-link" onClick={() => go("Functions", "topic")}>{f.topic}</button></>}
        <span className="crumb-sep">/</span>
        <span className="crumb-here">{isNew ? "New function" : f.name}</span>
        {!isNew && <div className="fd-step">
          <button className="button button-ghost button-sm" disabled={!prev} onClick={() => onJump(prev)}>Previous</button>
          <button className="button button-ghost button-sm" disabled={!next} onClick={() => onJump(next)}>Next record</button>
        </div>}
      </div>
    </div>

    <div className="fd-head">
      <div className="wrap">
        <div className="eyebrow" style={{ color: "#FF8E00" }}>{isNew ? "Administrator · New record" : f.topic + " · " + f.area}</div>
        <h1>{isNew ? (d.name || "New compliance function") : mode === "edit" ? "Editing — " + d.name : d.name}</h1>
        <div className="fd-tags">
          <Risk r={d.risk} />
          {!isNew && <span className="fd-chip">{d.code}</span>}
          {d.statute && <span className="fd-chip">{d.statute}</span>}
          {openGaps.length > 0 && <span className="gapbadge">{openGaps.length} open {openGaps.length === 1 ? "gap" : "gaps"}</span>}
          {flag && <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Flagged for review</span>}
        </div>
        <div className="fd-actions">
          {mode === "read" ? null : <>
            <Busy busyKey="fn" className="button button-primary" disabled={!canSave} onClick={save}><Icon n="check" s={15} />{isNew ? "Create function" : "Save changes"}</Busy>
            <button className="button button-secondary-outline fd-onnavy" onClick={() => { if (isNew) onBack(); else { setD(f); setMode("read"); } }}>Cancel</button>
            {!canSave && <span className="sub" style={{ color: "#C3CCE4", alignSelf: "center" }}>A name and a risk area are required.</span>}
          </>}
        </div>
      </div>
    </div>
    <div className="fd-rule"></div>

    {panel === "flag" && <div className="fd-panel">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="flag" s={16} />Flag this function for review</div>
        <label className="flab">Why does this need review?</label>
        <textarea className="ti" value={flagText} onChange={e => setFlagText(e.target.value)} placeholder="e.g. Citation may be superseded by the 2026 final rule." />
        <div className="note" style={{ marginTop: 10 }}>Flagging notifies the compliance office and adds this function to the admin review queue. The office responds within five business days.</div>
        <div className="fd-panel-a">
          <Busy busyKey="flag" className="button button-primary" disabled={!flagText.trim()} onClick={submitFlag}><Icon n="flag" s={15} />Submit flag</Busy>
          <button className="button button-secondary-outline" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      </div>
    </div>}

    {panel === "gap" && <div className="fd-panel gap">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="alert" s={16} />Log a compliance gap</div>
        <label className="flab">Gap summary</label>
        <input className="ti" value={gapForm.title} onChange={e => setGapForm({ ...gapForm, title: e.target.value })} placeholder="What is out of compliance?" />
        <label className="flab" style={{ marginTop: 12 }}>Detail and corrective measure</label>
        <textarea className="ti" value={gapForm.note} onChange={e => setGapForm({ ...gapForm, note: e.target.value })} placeholder="What was found, how it was identified, and what happens next." />
        <div className="note" style={{ marginTop: 10 }}>Opens a gap record against {f.code} at this function's risk rating ({f.risk}) and routes it to {f.owner.none ? "the compliance office" : f.owner.n + " and the compliance office"}.</div>
        <div className="fd-panel-a">
          <Busy busyKey="gap" className="button button-danger" disabled={!gapForm.title.trim()} onClick={submitGap}><Icon n="alert" s={15} />Log gap</Busy>
          <button className="button button-secondary-outline" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      </div>
    </div>}

    <div className="wrap fd-body">
      <main className="fd-main">
        {flag && <div className="note fd-flagnote">
          <b>Flagged for review</b> by {flag.by}{flag.at ? " on " + fmtDate(flag.at) : ""} — {flag.reason}
          {admin && <div style={{ marginTop: 8 }}><Busy busyKey={"flag-" + flag.id} className="button button-secondary-outline button-sm" onClick={() => actions.resolveFlag(flag, f).catch(() => null)}><Icon n="check" s={13} />Clear flag</Busy></div>}
        </div>}

        {mode === "read" ? <>
          <Field label="Governing statute">
            <dl className="kv">
              <dt>Statute</dt><dd>{d.statute || <span className="sub">Not recorded</span>}</dd>
              <dt>Citation</dt><dd>{d.citation || <span className="sub">Not recorded</span>}</dd>
              <dt>Reference</dt><dd>{d.statuteUrl ? <a href={d.statuteUrl} target="_blank" rel="noopener">{bare(d.statuteUrl)} <Icon n="ext" s={12} style={{ verticalAlign: -1 }} /></a> : <span className="sub">No link recorded</span>}</dd>
            </dl>
          </Field>
          <Field label="What the obligation is"><p>{d.description || <span className="sub">No description recorded.</span>}</p></Field>
          <Field label="Reporting requirement"><p>{d.reporting || <span className="sub">No reporting requirement recorded.</span>}</p></Field>
          <Field label="Deadline and cadence">
            <p style={{ marginBottom: dls.length ? 12 : 0 }}>{d.deadline || <span className="sub">No deadline narrative recorded.</span>}</p>
            {dls.map(x => {
              const st = dueState(x, today);
              return <div key={x.id} className="dlrow" style={{ background: st.cls === "late" ? "#FFF7F7" : "#fff" }}>
                <Icon n="clock" s={15} style={{ color: "#707780" }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#000E54" }}>{x.title}</div>
                  <div className="sub">{x.due ? fmtDate(x.due) + " · " + fiscalQ(x.due) : "No fixed date"} · {x.cadence}{x.complete && x.lastDone ? " · completed " + fmtDate(x.lastDone) : ""}</div></div>
                <span className={"pill " + st.cls}>{st.label}</span>
                <DeadlineAction dl={x} />
              </div>;
            })}
          </Field>
          <OwnershipChain f={f} admin={admin} />
          <Field label={"Gap history (" + gs.length + ")"}>
            {gs.length ? gs.map(g => <div key={g.id} className="gaprow" style={{ borderLeftColor: g.open ? (RISK_COLOR[g.severity] || "#DC2626") : "#16A34A" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={"pill " + (g.open ? "late" : "ok")}>{g.status}</span>
                <span className="sub">{g.code}{g.opened ? " · opened " + fmtDate(g.opened) : ""} · {g.severity} severity{g.closed ? " · closed " + fmtDate(g.closed) : ""}</span></div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#000E54", marginTop: 6 }}>{g.title}</div>
              <p style={{ fontSize: 13, color: "#5b6373", marginTop: 4 }}>{!g.open ? (g.closeNote || g.note) : g.note}</p>
            </div>) : <Empty title="No gaps recorded" sub="Nothing has been logged against this function. Use “Log a gap” if you find something out of compliance." />}
          </Field>
          <Field label="Syracuse University resource">
            {d.resourceUrl || d.resourceLabel ? <>
              <ExtLink href={d.resourceUrl} style={{ fontSize: 14, fontWeight: 600 }}>{d.resourceLabel || bare(d.resourceUrl)} <Icon n="ext" s={12} style={{ verticalAlign: -1 }} /></ExtLink>
              {!d.resourceUrl && <div style={{ fontSize: 14, fontWeight: 600 }}>{d.resourceLabel}</div>}
              {d.resourceUrl && <div className="sub" style={{ marginTop: 3 }}>{bare(d.resourceUrl)}</div>}
            </> : <span className="sub">No university resource recorded.</span>}
          </Field>
        </> : <>
          {!isNew && <div className="note" style={{ marginBottom: 18 }}><b>Editing.</b> Deadline records read their owner and risk from this function, so they follow any change you save here.</div>}
          {isNew && <div className="note" style={{ marginBottom: 18 }}><b>New function.</b> Create the record first; the ownership chain is added on the saved record with <b>Manage people</b>.</div>}
          <EditForm d={d} set={set} />
          {!isNew && <Field label="Ownership chain">
            <div className="note">People and sub-roles are managed on the record itself. Save or cancel these edits, then use <b>Manage people</b> in the ownership chain.</div>
          </Field>}
        </>}
      </main>

      {!isNew && <aside className="fd-rail">
        <div className="rail-card">
          <div className="rail-t">Record status</div>
          <dl className="rail-kv">
            <dt>Risk rating</dt><dd><Risk r={d.risk} /></dd>
            <dt>Open gaps</dt><dd>{openGaps.length ? <span className="gapbadge">{openGaps.length}</span> : <span className="sub">None</span>}</dd>
            <dt>Next deadline</dt><dd>{nextDue ? <><div style={{ fontWeight: 600, color: "#000E54", fontSize: 13 }}>{fmtDate(nextDue.due)}</div><span className={"pill " + dueState(nextDue, today).cls}>{dueState(nextDue, today).label}</span></> : <span className="sub">None scheduled</span>}</dd>
            <dt>Under review</dt><dd>{flag ? <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Yes</span> : <span className="sub">No</span>}</dd>
            <dt>Last reviewed</dt><dd className="sub">{f.lastReviewed ? fmtDate(f.lastReviewed) : "Not recorded"}</dd>
          </dl>
        </div>
        <div className="rail-card">
          <div className="rail-t">Take action</div>
          <div className="rail-acts">
            {admin && mode === "read" && <button className="button button-secondary-outline button-sm" onClick={() => setMode("edit")}><Icon n="edit" s={14} />Edit this record</button>}
            {!flag && <button className="button button-secondary-outline button-sm" onClick={() => setPanel("flag")}><Icon n="flag" s={14} />Flag for review</button>}
            <button className="button button-danger-outline button-sm" onClick={() => setPanel("gap")}><Icon n="alert" s={14} />Log a gap</button>
            <button className="button button-ghost button-sm" onClick={() => go("Deadlines")}><Icon n="calendar" s={14} />See all deadlines</button>
            {admin && mode === "read" && <button className="button button-ghost button-sm" onClick={() => setConfirmDel(true)}><Icon n="trash" s={14} />Delete function</button>}
          </div>
        </div>
        <div className="rail-card gc">
          <div className="rail-t">Legal questions</div>
          {counsel ? <>
            <div className="gc-lede">Counsel of record for {adapter.counselPerFunction ? "this function" : f.topic}. Reach out before responding to a regulator, signing an agreement, or interpreting the statute.</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
              <Avatar person={counsel} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#000E54", fontSize: 13.5, lineHeight: 1.3 }}>{counsel.n}</div>
                {counsel.t && <div style={{ fontSize: 12, color: "#5b6373", marginTop: 3, lineHeight: 1.35 }}>{counsel.t}</div>}
                {counsel.e && <a href={"mailto:" + counsel.e} style={{ fontSize: 12, display: "inline-block", marginTop: 5, wordBreak: "break-all" }}>{counsel.e}</a>}
                {(counsel.ph || counsel.l) && <div className="sub" style={{ marginTop: 3 }}>{[counsel.ph, counsel.l].filter(Boolean).join(" · ")}</div>}
              </div></div>
            {counsel.e && <a className="gc-esc" href={"mailto:" + counsel.e + "?subject=" + encodeURIComponent("Legal question — " + f.code + " " + f.name)}>Email a question about this function</a>}
          </> : <div className="gc-lede">No attorney of record is assigned to this function yet.{admin && adapter.counselPerFunction ? " Add one as General Counsel in the ownership chain." : ""}</div>}
        </div>
        {!!related.length && <div className="rail-card quiet">
          <div className="rail-t">Related in {f.topic}</div>
          {related.map(x =>
            <button key={x.id} className="rail-rel" onClick={() => onJump(x)}>
              <span>{x.name}</span><Risk r={x.risk} />
            </button>)}
        </div>}
      </aside>}
    </div>

    {confirmDel && <Modal onClose={() => setConfirmDel(false)} size="sm">
      <div className="mhd"><div><h2>Delete this function?</h2>
        <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{f.code} · {f.name}</div></div>
        <button className="cl" onClick={() => setConfirmDel(false)} aria-label="Close">✕</button></div>
      <div className="mbd">
        <p>This removes the function and everything recorded against it:</p>
        <ul style={{ margin: "10px 0 0 18px", fontSize: 14, lineHeight: 1.7 }}>
          <li>{dls.length} deadline{dls.length === 1 ? "" : "s"}</li>
          <li>{gs.length} gap{gs.length === 1 ? "" : "s"}, {openGaps.length} open</li>
          <li>{[...f.chain.exec, ...f.chain.unit, ...f.chain.compliance, ...f.chain.counsel].length} ownership assignment(s)</li>
          <li>{ds.allFlags.filter(x => String(x.functionId) === String(f.id)).length} flag(s)</li>
        </ul>
        <div className="note" style={{ marginTop: 14 }}>{adapter.name === "sharepoint" ? "An Archive record of the deletion is kept." : "Dataverse auditing keeps the record of the deletion."} This cannot be undone from the page.</div>
      </div>
      <div className="mft">
        <Busy busyKey="fn-del" className="button button-danger" onClick={del}><Icon n="trash" s={15} />Delete function</Busy>
        <button className="button button-secondary-outline" onClick={() => setConfirmDel(false)}>Cancel</button>
      </div>
    </Modal>}
  </div>;
}
