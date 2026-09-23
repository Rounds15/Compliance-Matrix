import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, Modal, Busy, useMedia, useApp } from "./parts.jsx";
import { functionsFor, samePerson } from "../data/model.js";
import { PersonPicker } from "./Ownership.jsx";

/* the highest role a person holds anywhere in the matrix */
export function chainRole(p, fns) {
  const inRole = k => fns.some(f => f.chain[k].some(r => samePerson(r.person, p)));
  if (inRole("exec")) return "Executive Owner";
  if (inRole("compliance")) return "Compliance Owner";
  if (inRole("unit")) return "Unit Owner";
  return "Directory Contact";
}
const ROLE_TONE = { "Executive Owner": "exec", "Compliance Owner": "own", "Unit Owner": "unit", "Directory Contact": "none" };

const roleOn = (f, p) => f.chain.compliance.some(r => samePerson(r.person, p)) ? "Compliance Owner"
  : f.chain.exec.some(r => samePerson(r.person, p)) ? "Executive Owner" : "Unit Owner";

function EditPerson({ person, onClose }) {
  const { actions, adapter } = useApp();
  const rich = adapter.name !== "sharepoint"; // the SharePoint directory holds name and email only
  const [d, setD] = useState({ name: person.n, email: person.e, title: person.t, unit: person.u, phone: person.ph, location: person.l });
  const ok = d.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((d.email || "").trim());
  const save = async () => {
    try { await actions.updatePerson({ id: person.id, ...d, name: d.name.trim(), email: d.email.trim() }); onClose(); } catch (e) { /* toast */ }
  };
  const input = (k, label) => <div><label className="flab">{label}</label><input className="ti" value={d[k] || ""} onChange={e => setD({ ...d, [k]: e.target.value })} /></div>;
  return <Modal onClose={onClose} size="sm">
    <div className="mhd"><div><h2>Edit directory record</h2><div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{person.n}</div></div>
      <button className="cl" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="mbd">
      <div className="frow">{input("name", "Full name")}{input("email", "Email")}</div>
      {rich && <><div className="frow">{input("title", "Title")}{input("unit", "Unit")}</div>
        <div className="frow">{input("phone", "Phone")}{input("location", "Location")}</div></>}
      <p className="sub">Ownership assignments point at this record, so they follow the change.</p>
    </div>
    <div className="mft"><Busy busyKey="person" className="button button-primary" disabled={!ok} onClick={save}><Icon n="check" s={15} />Save</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function ReplacePerson({ person, count, onClose }) {
  const { actions } = useApp();
  const [to, setTo] = useState(null);
  const go = async () => { try { await actions.replacePerson(person, to); onClose(); } catch (e) { /* toast */ } };
  return <Modal onClose={onClose} size="sm">
    <div className="mhd"><div><h2>Replace {person.n}</h2><div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{count} ownership assignment{count === 1 ? "" : "s"}</div></div>
      <button className="cl" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="mbd">
      <p style={{ marginBottom: 12 }}>Every role {person.n} holds - each executive, unit, compliance{" "}and counsel assignment, with its sub-role - moves to the person you choose. Use this when someone leaves or hands a portfolio over.</p>
      {to ? <div className="opick-row static" style={{ border: "1px solid #E2E5EA", padding: 10 }}>
        <Avatar person={to} size={32} /><div style={{ flex: 1 }}><div className="operson-n">{to.n}</div><div className="operson-t">{to.e}</div></div>
        <button className="button button-ghost button-sm" onClick={() => setTo(null)}>Change</button></div>
        : <PersonPicker exclude={new Set([String(person.id)])} subPicker={false} actionLabel="Choose" onCancel={onClose} onPick={p => setTo(p)} />}
    </div>
    <div className="mft"><Busy busyKey="person-swap" className="button button-primary" disabled={!to} onClick={go}><Icon n="swap" s={15} />Move {count} assignment{count === 1 ? "" : "s"}</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function RemovePerson({ person, count, onClose }) {
  const { actions, adapter } = useApp();
  const go = async () => { try { await actions.deletePerson(person); onClose(); } catch (e) { /* toast */ } };
  return <Modal onClose={onClose} size="sm">
    <div className="mhd"><div><h2>Remove {person.n}?</h2></div><button className="cl" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="mbd">
      <p>{count ? <>They hold <b>{count}</b> ownership assignment{count === 1 ? "" : "s"}, which will be removed with them. To keep those roles filled, use <b>Replace</b> first.</> : "They hold no ownership assignments."}</p>
      {adapter.name === "dataverse" && <p className="sub" style={{ marginTop: 10 }}>The directory record is deactivated rather than deleted, so closed gaps and cleared flags still show who acted on them.</p>}
    </div>
    <div className="mft"><Busy busyKey="person-del" className="button button-danger" onClick={go}><Icon n="trash" s={15} />Remove</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

function AddPerson({ onClose }) {
  const { ds } = useApp();
  return <Modal onClose={onClose} size="sm">
    <div className="mhd"><div><h2>Add a person</h2><div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>Creates a Compliance Directory record</div></div>
      <button className="cl" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="mbd">
      <PersonPicker exclude={new Set(ds.people.map(p => String(p.id)))} subPicker={false} actionLabel="Already listed" onCancel={onClose} onPick={() => onClose()} />
    </div>
  </Modal>;
}

export function Directory({ openFn }) {
  const { ds, adminView } = useApp();
  const { people, fns } = ds;
  const [kw, setKw] = useState("");
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("All");
  const [role, setRole] = useState("All");
  const [sort, setSort] = useState("az");
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [dialog, setDialog] = useState(null); // add | edit | replace | remove
  const narrow = useMedia("(max-width:1080px)");

  const portfolio = useMemo(() => {
    const m = new Map();
    people.forEach(p => m.set(String(p.id), functionsFor(p, fns)));
    return m;
  }, [people, fns]);
  const own = p => portfolio.get(String(p.id)) || [];
  const roleOf = useMemo(() => {
    const m = new Map();
    people.forEach(p => m.set(String(p.id), chainRole(p, fns)));
    return m;
  }, [people, fns]);
  const dirRole = p => roleOf.get(String(p.id)) || "Directory Contact";
  const assignments = p => fns.reduce((n, f) => n + [...f.chain.exec, ...f.chain.unit, ...f.chain.compliance, ...f.chain.counsel].filter(r => samePerson(r.person, p)).length, 0);
  const units = useMemo(() => ["All", ...[...new Set(people.map(p => p.u).filter(Boolean))].sort()], [people]);
  const last = n => n.split(" ").slice(-1)[0];

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase(), f2 = q.trim().toLowerCase();
    const r = people.filter(p => {
      const text = (p.n + p.t + p.u + p.e).toLowerCase();
      if (k && !text.includes(k)) return false;
      if (f2 && !p.n.toLowerCase().includes(f2)) return false;
      if (unit !== "All" && p.u !== unit) return false;
      if (role !== "All" && dirRole(p) !== role) return false;
      return true;
    });
    const cmp = {
      az: (a, b) => last(a.n).localeCompare(last(b.n)),
      za: (a, b) => last(b.n).localeCompare(last(a.n)),
      unit: (a, b) => a.u.localeCompare(b.u) || last(a.n).localeCompare(last(b.n)),
      load: (a, b) => own(b).length - own(a).length || last(a.n).localeCompare(last(b.n))
    }[sort];
    return r.sort(cmp);
  }, [people, kw, q, unit, role, sort, portfolio, roleOf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!narrow && !sel && rows.length) setSel(rows[0]); }, [narrow, rows, sel]);
  const active = sel && rows.some(p => String(p.id) === String(sel.id)) ? rows.find(p => String(p.id) === String(sel.id)) : (narrow ? null : rows[0] || null);

  const RoleTag = ({ p }) => { const r = dirRole(p); return <span className={"dir-role t-" + ROLE_TONE[r]}><span className="dot"></span>{r}</span>; };
  const hasUnits = units.length > 1;

  return <div className="page wrap dir-page">
    <PageHead eyebrow="Browse" title="Compliance Directory"
      sub="The people layer of the matrix: every owner in an ownership chain, with title, unit, and contact information."
      right={adminView && <button className="button button-secondary-outline" onClick={() => setDialog("add")}>Add person <Icon n="plus" s={14} /></button>} />

    <div className="dir-filters">
      <label><span>Keywords</span>
        <div className="srch"><Icon n="search" s={16} />
          <input placeholder="Type a name, title, or unit…" value={kw} onChange={e => setKw(e.target.value)} /></div></label>
      {hasUnits && <label><span>Unit</span>
        <select className="fs" value={unit} onChange={e => setUnit(e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></label>}
      <label><span>Role in chain</span>
        <select className="fs" value={role} onChange={e => setRole(e.target.value)}>{["All", "Executive Owner", "Compliance Owner", "Unit Owner", "Directory Contact"].map(r => <option key={r}>{r}</option>)}</select></label>
      <button className="button button-primary dir-go" onClick={() => { }}>Filter <Icon n="search" s={15} /></button>
    </div>

    <div className="dir-split">
      <div className="dir-list-col">
        <div className="dir-toolbar">
          <div className="dir-refine"><Icon n="search" s={16} />
            <input placeholder="Filter by name…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="dir-sort"><span>Sort by:</span>
            <select className="fs" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="az">Alphabetical A–Z</option><option value="za">Alphabetical Z–A</option>
              {hasUnits && <option value="unit">Unit</option>}<option value="load">Functions owned</option></select>
            <div className="dir-vt">
              <button className={view === "list" ? "on" : ""} aria-label="List view" onClick={() => setView("list")}><Icon n="list" s={16} /></button>
              <button className={view === "grid" ? "on" : ""} aria-label="Card view" onClick={() => setView("grid")}><Icon n="grid" s={16} /></button>
            </div></div>
        </div>

        {view === "list" ? <table className="dir-table"><thead><tr>
          <th>Name</th><th>{hasUnits ? "Unit" : "Email"}</th><th>Phone</th><th>Role in chain</th><th></th></tr></thead>
          <tbody>{rows.map(p =>
            <tr key={p.id} className={active && String(active.id) === String(p.id) ? "on" : ""} onClick={() => setSel(p)}>
              <td><div className="dir-who"><Avatar person={p} size={40} />
                <div><div className="nm">{p.n}</div><div className="ti">{p.t || (hasUnits ? p.e : "")}</div></div></div></td>
              <td className="dir-cell">{hasUnits ? p.u : p.e}</td>
              <td className="dir-cell dir-num">{p.ph}</td>
              <td><RoleTag p={p} /></td>
              <td className="dir-cnt">{own(p).length}</td></tr>)}
          </tbody></table>
          : <div className="dir-cards">{rows.map(p =>
            <button key={p.id} className={"dir-card" + (active && String(active.id) === String(p.id) ? " on" : "")} onClick={() => setSel(p)}>
              <Avatar person={p} size={56} />
              <div className="nm">{p.n}</div><div className="ti">{p.t || p.e}</div>
              <RoleTag p={p} />
              <div className="sub">{own(p).length} function{own(p).length === 1 ? "" : "s"}</div></button>)}
          </div>}
        {!rows.length && <Empty title="No people match" sub="Clear the keyword or change the unit and role filters." />}
        {!!rows.length && <div className="dir-end">End of list · {rows.length} {rows.length === 1 ? "person" : "people"}</div>}
      </div>

      <aside className="dir-rail">{active ? <React.Fragment>
        <div className="dir-rail-hd">
          <Avatar person={active} size={92} />
          <div><h2>{active.n}</h2>{active.t && <div className="ti">{active.t}</div>}<RoleTag p={active} /></div>
        </div>
        <div className="dir-sect"><h3>Contact information</h3><dl className="dir-kv">
          {active.ph && <><dt>Office</dt><dd>{active.ph}</dd></>}
          <dt>Email</dt><dd>{active.e ? <a href={"mailto:" + active.e}>{active.e}</a> : <span className="sub">Not recorded</span>}</dd>
          {active.l && <><dt>Location</dt><dd>{active.l}</dd></>}
          {active.netid && <><dt>NetID</dt><dd>{active.netid}</dd></>}
        </dl></div>
        <div className="dir-sect"><h3>Work information</h3><dl className="dir-kv">
          {active.u && <><dt>Unit</dt><dd>{active.u}</dd></>}
          <dt>Role</dt><dd>{dirRole(active)}</dd>
          <dt>Functions</dt><dd>{own(active).length} assigned</dd>
          <dt>Risk areas</dt><dd>{[...new Set(own(active).map(f => f.topic))].length} touched</dd>
        </dl></div>
        <div className="dir-sect"><h3>Ownership portfolio</h3>
          {own(active).slice(0, 6).map(f =>
            <button key={f.id} className="dir-port" onClick={() => openFn(f)}>
              <div><div className="fname">{f.name}</div>
                <div className="sub">{f.topic} · {roleOn(f, active)}</div></div>
              <Risk r={f.risk} /></button>)}
          {!own(active).length && <p className="sub">No functions currently assigned.</p>}
          {own(active).length > 6 && <div className="sub" style={{ marginTop: 8 }}>+{own(active).length - 6} more in this portfolio</div>}
        </div>
        <div className="dir-rail-ft" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {active.e && <a className="button button-primary" href={"mailto:" + active.e}><Icon n="mail" s={15} />Email {active.n.split(" ")[0]}</a>}
          {adminView && <>
            <button className="button button-secondary-outline button-sm" onClick={() => setDialog("edit")}><Icon n="edit" s={13} />Edit</button>
            <button className="button button-secondary-outline button-sm" disabled={!assignments(active)} onClick={() => setDialog("replace")}><Icon n="swap" s={13} />Replace</button>
            <button className="button button-ghost button-sm" onClick={() => setDialog("remove")}><Icon n="trash" s={13} />Remove</button>
          </>}
        </div>
      </React.Fragment> : <div className="dir-rail-empty"><p>Select a person to see contact details, unit, and their ownership portfolio.</p></div>}
      </aside>
    </div>
    {dialog === "add" && <AddPerson onClose={() => setDialog(null)} />}
    {dialog === "edit" && active && <EditPerson person={active} onClose={() => setDialog(null)} />}
    {dialog === "replace" && active && <ReplacePerson person={active} count={assignments(active)} onClose={() => setDialog(null)} />}
    {dialog === "remove" && active && <RemovePerson person={active} count={assignments(active)} onClose={() => { setDialog(null); setSel(null); }} />}
  </div>;
}
