/* Compliance Directory, in the design's layout: filters, a people table (or
   cards) and a profile rail with contact details and the ownership
   portfolio. The data and the administrator tools follow the canvas app
   (scr_Directory): the role shown is the first one the person holds, in the
   app's order; a person who still owns functions cannot be removed until
   their ownership is reassigned; reassigning moves the chosen functions from
   one person to another without duplicating a role the new person already
   holds. */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, Modal, ModalHead, Busy, useMedia, useApp } from "./parts.jsx";
import { allRows, functionsFor, roleOn, samePerson, ROLE_EXEC, ROLE_UNIT, ROLE_COMPLIANCE, ROLE_COUNSEL, ROLE_SUPPORT } from "../data/model.js";
import { PersonPicker } from "./Ownership.jsx";

const ROLE_ORDER = [[ROLE_EXEC, "exec"], [ROLE_COMPLIANCE, "own"], [ROLE_UNIT, "unit"], [ROLE_COUNSEL, "gc"], [ROLE_SUPPORT, "sup"]];
const CONTACT = "Directory Contact";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* the first role the person holds, in the canvas app's order */
export function chainRole(p, fns) {
  for (const [role] of ROLE_ORDER) if (fns.some(f => allRows(f).some(r => r.role === role && samePerson(r.person, p)))) return role;
  return CONTACT;
}
const TONE = Object.fromEntries([...ROLE_ORDER.map(([r, t]) => [r, t]), [CONTACT, "none"]]);
export const RoleTag = ({ role }) => <span className={"dir-role t-" + TONE[role]}><span className="dot"></span>{role}</span>;

/* the functions a person owns in the chain proper (the app's "assigned functions" figure) */
const chainFns = (p, fns) => fns.filter(f => [...f.chain.exec, ...f.chain.unit, ...f.chain.compliance].some(r => samePerson(r.person, p)));

function EditPerson({ person, onClose }) {
  const { ds, actions, adapter } = useApp();
  const rich = adapter.name !== "sharepoint"; // the SharePoint directory holds name and email only
  const [d, setD] = useState({ name: person.n, email: person.e || "", title: person.t, unit: person.u, phone: person.ph, location: person.l });
  const n = functionsFor(person, ds.fns).length;
  const dup = ds.people.some(x => x.id !== person.id && x.e && x.e.trim().toLowerCase() === d.email.trim().toLowerCase());
  const renamed = d.name.trim() !== person.n.trim();
  const ok = d.name.trim() && EMAIL.test(d.email.trim()) && !dup;
  const save = async () => {
    try { await actions.updatePerson({ id: person.id, ...d, name: d.name.trim(), email: d.email.trim() }); onClose(); } catch (e) { /* toast */ }
  };
  const input = (k, label, ph) => <div><label className="flab" htmlFor={"pe-" + k}>{label}</label>
    <input id={"pe-" + k} className="ti" value={d[k] || ""} placeholder={ph} onChange={e => setD({ ...d, [k]: e.target.value })} /></div>;
  return <Modal onClose={onClose} size="sm" label="Edit directory record">
    <ModalHead onClose={onClose} eyebrow="Manage Directory" title="Edit directory record" sub={person.n} />
    <div className="mbd">
      <div className="frow">{input("name", "Display name")}{input("email", "Email", "name@syr.edu")}</div>
      {rich && <><div className="frow">{input("title", "Title")}{input("unit", "Unit")}</div>
        <div className="frow">{input("phone", "Phone")}{input("location", "Location")}</div></>}
      {dup ? <p className="sub" style={{ color: "#B91C1C" }}>Another person already uses that email.</p>
        : renamed && n > 0 ? <p className="sub">This person owns {n} function(s). Renaming is safe now, because ownership is by reference.</p>
          : <p className="sub">Ownership assignments point at this record, so they follow the change.</p>}
    </div>
    <div className="mft"><Busy busyKey="person" className="button button-primary" disabled={!ok} onClick={save}><Icon n="check" s={15} />Save changes</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function Reassign({ person, onClose }) {
  const { ds, actions } = useApp();
  const fns = useMemo(() => functionsFor(person, ds.fns).sort((a, b) => a.name.localeCompare(b.name)), [person, ds]);
  const [pick, setPick] = useState(() => fns.map(f => String(f.id)));
  const [to, setTo] = useState(null);
  const rolesOn = f => [[f.chain.exec, ROLE_EXEC], [f.chain.unit, ROLE_UNIT], [f.chain.compliance, ROLE_COMPLIANCE], [f.chain.counsel, ROLE_COUNSEL], [f.chain.support, ROLE_SUPPORT]]
    .filter(([rows]) => rows.some(r => samePerson(r.person, person))).map(([, l]) => l).join(", ");
  const allOn = pick.length === fns.length && fns.length > 0;
  const toggle = id => setPick(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const run = async () => { try { await actions.reassign(person, to, pick); onClose(); } catch (e) { /* toast */ } };
  return <Modal onClose={onClose} label="Reassign ownership">
    <ModalHead onClose={onClose} eyebrow="Manage Directory" title={"Reassign ownership from " + person.n} sub={fns.length + " function(s)"} />
    <div className="mbd">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span className="sub" style={{ flex: 1 }}>{pick.length} of {fns.length} selected</span>
        <button className="button button-ghost button-sm" onClick={() => setPick(allOn ? [] : fns.map(f => String(f.id)))}>{allOn ? "Clear all" : "Select all"}</button>
      </div>
      <div className="rs-list">{fns.map(f => {
        const on = pick.includes(String(f.id));
        return <label key={f.id} className={"rs-row" + (on ? " on" : "")}>
          <input type="checkbox" checked={on} onChange={() => toggle(String(f.id))} />
          <span style={{ minWidth: 0, flex: 1 }}><span className="fname">{f.name}</span>
            <span className="sub" style={{ display: "block" }}>{rolesOn(f)} {"·"} {f.topic}</span></span>
        </label>;
      })}</div>
      <div className="fldg" style={{ marginTop: 18 }}><div className="lb">Who is taking over<span className="rule"></span></div>
        {to ? <div className="opick-row static" style={{ border: "1px solid #E2E5EA", padding: 10 }}>
          <Avatar person={to} size={32} /><div style={{ flex: 1, minWidth: 0 }}><div className="operson-n">{to.n}</div><div className="operson-t">{to.e}</div></div>
          <button className="button button-ghost button-sm" onClick={() => setTo(null)}>Change</button></div>
          : <PersonPicker exclude={new Set([String(person.id)])} subPicker={false} actionLabel="Select" onCancel={onClose} onPick={p => setTo(p)} />}
      </div>
      {to && <p className="sub" style={{ marginTop: 10 }}>Move {pick.length} function(s) from {person.n} to {to.n}. Where {to.n} already holds a role, it will not be duplicated.</p>}
    </div>
    <div className="mft"><Busy busyKey="person-swap" className="button button-primary" disabled={!to || !pick.length} onClick={run}><Icon n="swap" s={15} />Reassign</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function RemovePerson({ person, onClose, onReassign }) {
  const { ds, actions, adapter } = useApp();
  const n = functionsFor(person, ds.fns).length;
  const go = async () => { try { await actions.deletePerson(person); onClose(true); } catch (e) { /* toast */ } };
  return <Modal onClose={() => onClose(false)} size="sm" label={"Remove " + person.n}>
    <ModalHead onClose={() => onClose(false)} eyebrow="Manage Directory" title={"Remove " + person.n + "?"} />
    <div className="mbd">
      {n > 0
        ? <p>Cannot remove {person.n}. They still own {n} function(s). Reassign their ownership first.</p>
        : <p>{person.n} owns no functions. Removing them takes them out of the Compliance Directory.</p>}
      {n === 0 && adapter.name === "dataverse" && <p className="sub" style={{ marginTop: 10 }}>The directory record is deactivated rather than deleted, so closed gaps and cleared flags still show who acted on them.</p>}
    </div>
    <div className="mft">{n > 0
      ? <button className="button button-primary" onClick={onReassign}><Icon n="swap" s={15} />Reassign ownership</button>
      : <Busy busyKey="person-del" className="button button-danger" onClick={go}><Icon n="trash" s={15} />Remove</Busy>}
      <button className="button button-secondary-outline" onClick={() => onClose(false)}>Cancel</button></div>
  </Modal>;
}

function AddPerson({ onClose }) {
  const { ds } = useApp();
  return <Modal onClose={onClose} size="sm" label="Add a person">
    <ModalHead onClose={onClose} eyebrow="Manage Directory" title="Add a person" sub="Creates a Compliance Directory record" />
    <div className="mbd">
      <PersonPicker exclude={new Set()} subPicker={false} actionLabel="Already listed" onCancel={onClose} onPick={() => onClose()} />
      <p className="sub" style={{ marginTop: 10 }}>{ds.people.length} people are in the directory.</p>
    </div>
  </Modal>;
}

/* the profile: contact, work, and the ownership portfolio */
function Profile({ p, role, onDialog }) {
  const { ds, realAdmin, openFn } = useApp();
  const owned = useMemo(() => functionsFor(p, ds.fns).sort((a, b) => a.name.localeCompare(b.name)), [p, ds]);
  const areas = new Set(owned.map(f => String(f.topicId))).size;
  return <>
    <div className="dir-rail-hd">
      <Avatar person={p} size={92} />
      <div><h2>{p.n}</h2>{p.t && <div className="ti">{p.t}</div>}<RoleTag role={role} /></div>
    </div>
    <div className="dir-stats">
      <div className="stat"><div className="n">{chainFns(p, ds.fns).length}</div><div className="l">Assigned functions</div></div>
      <div className="stat"><div className="n">{areas}</div><div className="l">Risk areas</div></div>
    </div>
    <div className="dir-sect"><h3>Contact information</h3><dl className="dir-kv">
      <dt>Email</dt><dd>{p.e ? <a href={"mailto:" + p.e}>{p.e}</a> : <span className="sub">Not recorded</span>}</dd>
      {p.ph && <><dt>Phone</dt><dd>{p.ph}</dd></>}
      {p.l && <><dt>Location</dt><dd>{p.l}</dd></>}
      {p.u && <><dt>Unit</dt><dd>{p.u}</dd></>}
    </dl></div>
    <div className="dir-sect"><h3>Ownership portfolio</h3>
      {owned.length ? <div className="dir-portlist">{owned.map(f =>
        <button key={f.id} className="dir-port" onClick={() => openFn(f)}>
          <div><div className="fname">{f.name}</div>
            <div className="sub">{f.topic} {"·"} {roleOn(f, p)}</div></div>
          <Risk r={f.risk} /></button>)}</div>
        : <p className="sub">No functions currently assigned.</p>}
    </div>
    <div className="dir-rail-ft" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {p.e && <a className="button button-primary" href={"mailto:" + p.e}><Icon n="mail" s={15} />Email {p.n.split(" ")[0]}</a>}
      {realAdmin && <>
        <button className="button button-secondary-outline button-sm" onClick={() => onDialog("edit")}><Icon n="edit" s={13} />Edit</button>
        <button className="button button-secondary-outline button-sm" disabled={!owned.length} onClick={() => onDialog("reassign")}><Icon n="swap" s={13} />Reassign</button>
        <button className="button button-ghost button-sm" onClick={() => onDialog("remove")}><Icon n="trash" s={13} />Remove</button>
      </>}
    </div>
  </>;
}

export function Directory({ personId }) {
  const { ds, realAdmin } = useApp();
  const { people, fns } = ds;
  const [kw, setKw] = useState("");
  const [unit, setUnit] = useState("All");
  const [role, setRole] = useState("All");
  const [sort, setSort] = useState("az");
  const [view, setView] = useState("list");
  const [selId, setSelId] = useState(personId != null ? String(personId) : null);
  const [dialog, setDialog] = useState(null); // add | edit | reassign | remove
  const narrow = useMedia("(max-width:1080px)");
  useEffect(() => { if (personId != null) setSelId(String(personId)); }, [personId]);

  const portfolio = useMemo(() => new Map(people.map(p => [String(p.id), functionsFor(p, fns).length])), [people, fns]);
  const roleOf = useMemo(() => new Map(people.map(p => [String(p.id), chainRole(p, fns)])), [people, fns]);
  const dirRole = p => roleOf.get(String(p.id)) || CONTACT;
  const count = p => portfolio.get(String(p.id)) || 0;
  const units = useMemo(() => ["All", ...[...new Set(people.map(p => p.u).filter(Boolean))].sort()], [people]);
  const hasUnits = units.length > 1;
  const roles = ["All", ...ROLE_ORDER.map(([r]) => r).filter(r => people.some(p => dirRole(p) === r)), CONTACT];
  const byName = (a, b) => a.n.localeCompare(b.n);

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    const r = people.filter(p => (!k || [p.n, p.t, p.u, p.e].join(" ").toLowerCase().includes(k))
      && (unit === "All" || p.u === unit) && (role === "All" || dirRole(p) === role));
    const cmp = {
      az: byName,
      za: (a, b) => byName(b, a),
      unit: (a, b) => (a.u || "").localeCompare(b.u || "") || byName(a, b),
      load: (a, b) => count(b) - count(a) || byName(a, b)
    }[sort];
    return r.sort(cmp);
  }, [people, kw, unit, role, sort, portfolio, roleOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = (selId && people.find(p => String(p.id) === selId)) || (narrow ? null : rows[0] || null);
  const isOn = p => active && String(active.id) === String(p.id);
  const pick = p => setSelId(String(p.id));

  return <div className="page wrap dir-page">
    <PageHead eyebrow="Browse" title="Compliance Directory"
      sub="The people layer of the matrix, every owner in an ownership chain, with title, unit, and contact information."
      right={realAdmin && <button className="button button-secondary-outline button-sm" onClick={() => setDialog("add")}><Icon n="plus" s={14} />Add person</button>} />

    <div className="dir-filters">
      <label><span>Keywords</span>
        <div className="srch"><Icon n="search" s={16} />
          <input placeholder="Search people, titles, units..." value={kw} onChange={e => setKw(e.target.value)} /></div></label>
      {hasUnits && <label><span>Unit</span>
        <select className="fs" value={unit} onChange={e => setUnit(e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></label>}
      <label><span>Role in chain</span>
        <select className="fs" value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
    </div>

    <div className="dir-split">
      <div className="dir-list-col">
        <div className="dir-toolbar">
          <span className="count">{rows.length} {rows.length === 1 ? "person" : "people"}</span>
          <div className="dir-sort"><span>Sort by:</span>
            <select className="fs" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
              <option value="az">Name A-Z</option><option value="za">Name Z-A</option>
              {hasUnits && <option value="unit">Unit</option>}<option value="load">Functions owned</option></select>
            <div className="dir-vt">
              <button className={view === "list" ? "on" : ""} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon n="list" s={16} /></button>
              <button className={view === "grid" ? "on" : ""} aria-label="Card view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Icon n="grid" s={16} /></button>
            </div></div>
        </div>

        {view === "list" && !narrow ? <table className="dir-table"><thead><tr>
          <th>Name</th><th>{hasUnits ? "Unit" : "Email"}</th><th>Phone</th><th>Role in chain</th><th title="Functions">Fns</th></tr></thead>
          <tbody>{rows.map(p =>
            <tr key={p.id} className={isOn(p) ? "on" : ""} onClick={() => pick(p)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") pick(p); }}>
              <td><div className="dir-who"><Avatar person={p} size={40} />
                <div><div className="nm">{p.n}</div><div className="ti">{p.t || (hasUnits ? p.e : "")}</div></div></div></td>
              <td className="dir-cell">{hasUnits ? p.u : p.e}</td>
              <td className="dir-cell dir-num">{p.ph}</td>
              <td><RoleTag role={dirRole(p)} /></td>
              <td className="dir-cnt">{count(p)}</td></tr>)}
          </tbody></table>
          : <div className="dir-cards">{rows.map(p =>
            <button key={p.id} className={"dir-card" + (isOn(p) ? " on" : "")} onClick={() => pick(p)}>
              <Avatar person={p} size={56} />
              <div className="nm">{p.n}</div><div className="ti">{p.t || p.e}</div>
              <RoleTag role={dirRole(p)} />
              <div className="sub">{count(p)} function{count(p) === 1 ? "" : "s"}</div></button>)}
          </div>}
        {!rows.length && <Empty title="No people match" sub="Clear the search, or check that the Compliance Directory list is connected." />}
        {!!rows.length && <div className="dir-end">End of list {"·"} {rows.length} {rows.length === 1 ? "person" : "people"}</div>}
      </div>

      {!narrow && <aside className="dir-rail">{active
        ? <Profile p={active} role={dirRole(active)} onDialog={setDialog} />
        : <div className="dir-rail-empty"><p>Select a person to see contact details, unit, and their ownership portfolio.</p></div>}
      </aside>}
    </div>

    {narrow && active && !dialog && <Modal onClose={() => setSelId(null)} label={active.n}>
      <div className="mhd"><div><div className="eyebrow" style={{ color: "#FF8E00" }}>Compliance Directory</div></div>
        <button className="cl" onClick={() => setSelId(null)} aria-label="Close">{"✕"}</button></div>
      <div className="mbd dir-rail dir-rail-m"><Profile p={active} role={dirRole(active)} onDialog={setDialog} /></div>
    </Modal>}
    {dialog === "add" && <AddPerson onClose={() => setDialog(null)} />}
    {dialog === "edit" && active && <EditPerson person={active} onClose={() => setDialog(null)} />}
    {dialog === "reassign" && active && <Reassign person={active} onClose={() => setDialog(null)} />}
    {dialog === "remove" && active && <RemovePerson person={active} onReassign={() => setDialog("reassign")}
      onClose={gone => { setDialog(null); if (gone) setSelId(null); }} />}
  </div>;
}
