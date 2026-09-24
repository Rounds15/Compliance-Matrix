/* Compliance Directory (parity spec 2.6, scr_Directory.pa.yaml): people cards,
   the person drawer, and Manage Directory for administrators (add, edit,
   remove, and reassign ownership from one person to another). */

import React, { useEffect, useMemo, useState } from "react";
import { Hero, Icon, Avatar, Modal, Busy, SearchBox, useApp } from "./parts.jsx";
import { allRows, functionsFor, samePerson, ROLE_EXEC, ROLE_UNIT, ROLE_COMPLIANCE, ROLE_COUNSEL, ROLE_SUPPORT } from "../data/model.js";

const byName = (a, b) => a.n.localeCompare(b.n);
const matches = (p, q) => { const t = q.trim().toLowerCase(); return !t || (p.n + " " + p.e).toLowerCase().includes(t); };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* the drawer eyebrow: the first role the person holds, in the app's order */
function dirRole(p, fns) {
  const holds = role => fns.some(f => allRows(f).some(r => r.role === role && samePerson(r.person, p)));
  for (const [role, label] of [[ROLE_EXEC, "EXECUTIVE OWNER"], [ROLE_COMPLIANCE, "COMPLIANCE OWNER"], [ROLE_UNIT, "UNIT OWNER"], [ROLE_COUNSEL, "GENERAL COUNSEL"], [ROLE_SUPPORT, "SUPPORT"]]) {
    if (holds(role)) return label;
  }
  return "DIRECTORY CONTACT";
}
const chainFns = (p, fns) => fns.filter(f => [...f.chain.exec, ...f.chain.unit, ...f.chain.compliance].some(r => samePerson(r.person, p)));

/* The person drawer, shared with Executive Team. */
export function PersonDrawer({ person, eyebrow, stats, portfolio, toggle, onClose, onEdit }) {
  const { openFn } = useApp();
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return <>
    <div className="scrim" onClick={onClose}></div>
    <div className="drawer" role="dialog" aria-modal="true" aria-label={person.n}>
      <div className="drawer-l">
        <div className="who"><Avatar person={person} size={75} />
          <div><div className="role">{eyebrow}</div><h2>{person.n}</h2><div className="jt">{person.t}</div></div></div>
        <div className="dstats"><div><b>{stats[0]}</b><span>ASSIGNED FUNCTIONS</span></div><div><b>{stats[1]}</b><span>RISK AREAS</span></div></div>
        <div className="kv"><div className="eb">CONTACT</div>
          <dl><dt>UNIT</dt><dd>{person.u}</dd><dt>EMAIL</dt><dd>{person.e}</dd><dt>PHONE</dt><dd>{person.ph}</dd><dt>LOCATION</dt><dd>{person.l}</dd></dl></div>
        <div className="dactions">
          <a className="btn email" href={"mailto:" + person.e}>Email</a>
          {onEdit && <button className="btn" onClick={onEdit}>Edit</button>}
        </div>
      </div>
      <div className="drawer-r">
        <button className="btn sm x" onClick={onClose} aria-label="Close">X</button>
        <div className="eb">OWNERSHIP PORTFOLIO</div>
        {toggle}
        <ul className="portfolio">{portfolio.map(x => <li key={x.key}><button onClick={() => openFn(x.fn)}>
          <span className="n">{x.line1}</span><span className={"m" + (x.due ? " due" : "")}>{x.line2}</span></button></li>)}</ul>
      </div>
    </div>
  </>;
}

/* ---------------- Manage Directory ---------------- */
function AddStep({ back }) {
  const { ds, actions, adapter } = useApp();
  const [q, setQ] = useState("");
  /* without a people lookup (no find-person flow, or Dataverse), a name and
     email are entered by hand */
  const [hits, setHits] = useState(adapter.canSearchPeople ? undefined : null);
  const [manual, setManual] = useState({ name: "", email: "" });
  useEffect(() => {
    const t = q.trim();
    if (!adapter.canSearchPeople) return undefined;
    if (t.length < 3) { setHits(undefined); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const r = await actions.searchPeople(t);
        if (!live) return;
        const words = t.toLowerCase().split(/\s+/).filter(Boolean);
        setHits(r === null ? null : r.filter(u => words.every(w => (u.name + " " + (u.email || "")).toLowerCase().includes(w))));
      } catch (e) { if (live) setHits([]); }
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [q, actions, adapter]);
  const already = email => ds.people.some(p => p.e && email && p.e.toLowerCase() === email.toLowerCase());
  const add = async u => { try { await actions.addPerson({ name: u.name, email: u.email, title: u.title, unit: u.unit, phone: u.phone, location: u.location, netid: u.netid }); } catch (e) { /* toast */ } };
  return <>
    <button className="btn sm back" onClick={back}>{"←"} Back</button>
    {hits === null ? <>
      <label className="flabel" htmlFor="dir-add-name">DISPLAY NAME</label>
      <input id="dir-add-name" className="input" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} />
      <label className="flabel" htmlFor="dir-add-mail">EMAIL</label>
      <input id="dir-add-mail" className="input" value={manual.email} onChange={e => setManual({ ...manual, email: e.target.value })} placeholder="name@syr.edu" />
      {already(manual.email.trim()) && <div className="warn">Another person already uses that email.</div>}
      <div className="mfoot"><Busy busyKey="person" className="btn primary" style={{ minWidth: 140, minHeight: 46 }}
        disabled={!manual.name.trim() || !EMAIL.test(manual.email.trim()) || already(manual.email.trim())}
        onClick={() => add({ name: manual.name.trim(), email: manual.email.trim() }).then(() => setManual({ name: "", email: "" }))}>Add</Busy></div>
    </> : <>
      <label className="flabel" htmlFor="dir-add-q">SEARCH SYRACUSE UNIVERSITY DIRECTORY</label>
      <input id="dir-add-q" className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name or NetID" autoFocus />
      <div className="hint">{q.trim().length < 3 ? "Enter at least 3 characters." : ""}</div>
      {Array.isArray(hits) && <ul className="rows">{hits.map(u => <li key={u.email || u.name}>
        <span className="grow"><span className="n">{u.name}</span><span className="m">{u.email || "No email in M365"}</span></span>
        <Busy busyKey="person" className="btn sm" disabled={!u.email || already(u.email)} onClick={() => add(u)}>{already(u.email) ? "Already in" : "Add"}</Busy>
      </li>)}</ul>}
    </>}
  </>;
}

function PersonList({ label, q, setQ, note, rows }) {
  return <>
    <label className="flabel" htmlFor="dir-find">{label}</label>
    <input id="dir-find" className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name or email" autoFocus />
    {note && <div className="hint">{note}</div>}
    <ul className="rows">{rows}</ul>
  </>;
}

function EditStep({ start, back }) {
  const { ds, actions } = useApp();
  const [q, setQ] = useState("");
  const [p, setP] = useState(start || null);
  const [d, setD] = useState(start ? { name: start.n, email: start.e } : null);
  if (!p) return <>
    <button className="btn sm back" onClick={back}>{"←"} Back</button>
    <PersonList label="FIND THE PERSON TO EDIT" q={q} setQ={setQ} rows={ds.people.filter(x => matches(x, q)).map(x => <li key={x.id}>
      <span className="grow"><span className="n">{x.n}</span><span className="m">{x.e || "No email on record"}</span></span>
      <button className="btn sm" onClick={() => { setP(x); setD({ name: x.n, email: x.e }); }}>Edit</button></li>)} />
  </>;
  const n = functionsFor(p, ds.fns).length;
  const dup = ds.people.some(x => x.id !== p.id && x.e && x.e.trim().toLowerCase() === d.email.trim().toLowerCase());
  const nameChanged = d.name.trim() !== p.n.trim();
  const unchanged = !nameChanged && d.email.trim() === (p.e || "").trim();
  const note = dup ? "Another person already uses that email." : nameChanged && n > 0 ? `This person owns ${n} function(s). Renaming is safe now, because ownership is by reference.` : "";
  const save = async () => {
    try {
      await actions.updatePerson({ id: p.id, name: d.name.trim(), email: d.email.trim(), title: p.t, unit: p.u, phone: p.ph, location: p.l });
      if (start) back(); else setP(null);
    } catch (e) { /* toast */ }
  };
  return <>
    <button className="btn sm back" onClick={() => (start ? back() : setP(null))}>{"←"} Back</button>
    <label className="flabel" htmlFor="dir-ed-name">DISPLAY NAME</label>
    <input id="dir-ed-name" className="input" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} />
    <label className="flabel" htmlFor="dir-ed-mail">EMAIL</label>
    <input id="dir-ed-mail" className="input" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} placeholder="name@syr.edu" />
    {note && <div className="warn">{note}</div>}
    <div className="mfoot"><Busy busyKey="person" className="btn primary" style={{ minWidth: 140, minHeight: 46 }}
      disabled={!d.name.trim() || unchanged || dup} onClick={save}>Save changes</Busy></div>
  </>;
}

function DeleteStep({ back }) {
  const { ds, actions, flash } = useApp();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);
  const remove = async p => {
    const n = functionsFor(p, ds.fns).length;
    if (n > 0) { flash(`Cannot remove ${p.n}. They still own ${n} function(s). Reassign their ownership first.`, "error"); return; }
    if (confirm !== p.id) { setConfirm(p.id); return; }
    try { await actions.deletePerson(p); setConfirm(null); } catch (e) { /* toast */ }
  };
  return <>
    <button className="btn sm back" onClick={back}>{"←"} Back</button>
    <PersonList label="FIND THE PERSON TO REMOVE" q={q} setQ={setQ} note="A person who still owns functions cannot be removed."
      rows={ds.people.filter(x => matches(x, q)).map(x => <li key={x.id}>
        <span className="grow"><span className="n">{x.n}</span>
          <span className="m">{(x.e || "No email on record") + " " + functionsFor(x, ds.fns).length + " function(s)"}</span></span>
        <Busy busyKey="person-del" className={"btn sm" + (confirm === x.id ? " danger" : "")} onClick={() => remove(x)}>{confirm === x.id ? "Confirm?" : "Remove"}</Busy></li>)} />
  </>;
}

function SwapStep({ back, addPerson }) {
  const { ds, actions, busy } = useApp();
  const [q, setQ] = useState("");
  const [out, setOut] = useState(null);
  const [pick, setPick] = useState([]);
  const [step, setStep] = useState("");
  const [inQ, setInQ] = useState("");
  const [into, setInto] = useState(null);
  const fns = out ? functionsFor(out, ds.fns).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const rolesOn = f => [[f.chain.exec, "Executive Owner"], [f.chain.unit, "Unit Owner"], [f.chain.compliance, "Compliance Owner"]]
    .filter(([rows]) => rows.some(r => samePerson(r.person, out))).map(([, l]) => l).join(" ");
  const goBack = () => {
    if (step === "In") { setStep(""); setInto(null); }
    else if (out) { setOut(null); setPick([]); }
    else back();
  };
  const run = async () => {
    try { await actions.reassign(out, into, pick); setPick([]); setStep(""); setInto(null); } catch (e) { /* toast */ }
  };
  const allOn = pick.length === fns.length && pick.length > 0;
  return <>
    <button className="btn sm back" onClick={goBack}>{"←"} Back</button>
    {!out && <PersonList label="WHO IS GIVING UP OWNERSHIP" q={q} setQ={setQ} rows={ds.people.filter(x => matches(x, q)).map(x => <li key={x.id}>
      <button className="hit" onClick={() => { setOut(x); setPick([]); }}><span className="n">{x.n}</span>
        <span className="m">{functionsFor(x, ds.fns).length} function(s)</span></button></li>)} />}
    {out && step !== "In" && <>
      <div className="fname" style={{ fontSize: 15 }}>{out.n}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <span className="hint" style={{ margin: 0, flex: 1 }}>{pick.length} of {fns.length} selected</span>
        <button className="btn sm" onClick={() => setPick(allOn ? [] : fns.map(f => f.id))}>{allOn ? "Clear all" : "Select all"}</button>
      </div>
      <ul className="rows">{fns.map(f => {
        const on = pick.some(x => String(x) === String(f.id));
        return <li key={f.id}><button className="hit" style={{ display: "flex", gap: 12, alignItems: "flex-start" }} aria-pressed={on}
          onClick={() => setPick(p => (on ? p.filter(x => String(x) !== String(f.id)) : [...p, f.id]))}>
          <span className={"check" + (on ? " on" : "")}>{on && <Icon n="check" s={12} sw={3} />}</span>
          <span className="grow"><span className="n">{f.name}</span><span className="r">{rolesOn(f)}</span><span className="m">{f.topic}</span></span>
        </button></li>;
      })}</ul>
      {pick.length > 0 && <div className="mfoot"><button className="btn primary" style={{ minWidth: 150, minHeight: 46 }} onClick={() => { setStep("In"); setInQ(""); }}>Continue {"→"}</button></div>}
    </>}
    {out && step === "In" && <>
      <label className="flabel" htmlFor="dir-in">WHO IS TAKING OVER {pick.length} FUNCTION(S)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="dir-in" className="input" value={inQ} onChange={e => setInQ(e.target.value)} placeholder="Type a name or email" />
        <button className="btn" onClick={addPerson}>Add a person</button>
      </div>
      <ul className="rows" style={{ maxHeight: 260 }}>{ds.people.filter(x => x.id !== out.id && matches(x, inQ)).map(x => {
        const sel = into && into.id === x.id;
        return <li key={x.id}><span className="grow"><span className="n">{x.n}</span><span className="m">{x.e || "No email on record"}</span></span>
          <button className={"btn sm" + (sel ? " on" : "")} disabled={!x.e} onClick={() => setInto(x)}>{sel ? "Selected" : "Select"}</button></li>;
      })}</ul>
      {into && <p className="body" style={{ fontSize: 12 }}>Move {pick.length} function(s) from {out.n} to {into.n}. Where {into.n} already holds a role, it will not be duplicated.</p>}
      <div className="mfoot"><Busy busyKey="person-swap" className="btn primary" style={{ minWidth: 150, minHeight: 46 }} disabled={!into} onClick={run}>
        {busy === "person-swap" ? "Working..." : "Reassign"}</Busy></div>
    </>}
  </>;
}

function Manager({ start, onClose }) {
  const { ds } = useApp();
  const [mode, setMode] = useState(start ? "Edit" : "");
  const home = () => (start ? onClose() : setMode(""));
  return <Modal onClose={onClose} label="Manage Directory">
    <button className="btn x" onClick={onClose} aria-label="Close">X</button>
    <h2>Manage Directory</h2>
    {mode === "" && <>
      <p className="sub">{ds.people.length} people are in the directory. Choose what you want to do.</p>
      <div className="mgr-choices">
        <button className="btn" onClick={() => setMode("Add")}>Add a person</button>
        <button className="btn" onClick={() => setMode("Edit")}>Edit an existing person</button>
        <button className="btn" onClick={() => setMode("Delete")}>Remove a person</button>
        <button className="btn" onClick={() => setMode("Swap")}>Reassign ownership from one person to another</button>
      </div>
    </>}
    <div style={{ marginTop: mode ? 16 : 0 }}>
      {mode === "Add" && <AddStep back={home} />}
      {mode === "Edit" && <EditStep start={start} back={home} />}
      {mode === "Delete" && <DeleteStep back={home} />}
      {mode === "Swap" && <SwapStep back={home} addPerson={() => setMode("Add")} />}
    </div>
  </Modal>;
}

export function Directory({ personId }) {
  const { ds, realAdmin } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("AZ");
  const [sel, setSel] = useState(() => (personId != null ? ds.people.find(p => String(p.id) === String(personId)) || null : null));
  const [mgr, setMgr] = useState(null); // null | {start?}
  useEffect(() => { if (personId != null) setSel(ds.people.find(p => String(p.id) === String(personId)) || null); }, [personId, ds]);
  /* keep the drawer on the fresh record after an edit */
  const current = sel ? ds.people.find(p => String(p.id) === String(sel.id)) || null : null;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = ds.people.filter(p => !t || [p.n, p.t, p.u, p.e].join(" ").toLowerCase().includes(t));
    return sort === "Unit" ? l.sort((a, b) => (a.u || "").localeCompare(b.u || "") || byName(a, b)) : l.sort(byName);
  }, [ds, q, sort]);

  const drawer = current && (() => {
    const owned = functionsFor(current, ds.fns).sort((a, b) => a.name.localeCompare(b.name));
    return <PersonDrawer person={current} eyebrow={dirRole(current, ds.fns)}
      stats={[chainFns(current, ds.fns).length, new Set(owned.map(f => String(f.topicId))).size]}
      portfolio={owned.map(f => ({ key: f.id, fn: f, line1: f.name, line2: f.topic }))}
      onClose={() => setSel(null)} onEdit={realAdmin ? () => setMgr({ start: current }) : null} />;
  })();

  return <>
    <Hero eyebrow="BROWSE" title="Compliance Directory"
      lede="The people layer of the matrix, every owner in an ownership chain, with title, unit, and contact information." />
    <div className="wrap">
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search people, titles, units..." />
        <span className="count">{list.length} people</span>
        <select className="select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
          <option value="AZ">Name A-Z</option><option value="Unit">Unit</option></select>
        {realAdmin && <button className="btn" onClick={() => setMgr({})}>Manage Directory</button>}
      </div>
      {list.length ? <div className="pgrid">{list.map(p => <button key={p.id} className={"pcard" + (current && current.id === p.id ? " on" : "")} onClick={() => setSel(p)}>
        <Avatar person={p} size={75} />
        <span className="grow"><span className="n">{p.n}</span><span className="t">{p.t}</span><span className="u">{p.u}</span>
          {p.e && <span className="mail"><Icon n="mail" s={13} /><span>{p.e}</span></span>}</span>
      </button>)}</div>
        : <p className="empty">No directory records match. Clear the search, or check that the Compliance Directory list is connected.</p>}
    </div>
    {drawer}
    {mgr && <Manager start={mgr.start} onClose={() => setMgr(null)} />}
  </>;
}
