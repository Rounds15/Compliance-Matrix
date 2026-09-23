/* OWNERSHIP CHAIN — one container per role, many people per role, each with a
   sub-role (Primary / Advisory / Support). Administrators add, remove, and
   re-weight people, then save the chain; saving replaces the function's
   ownership rows, which is how the canvas app writes it. Someone not yet in the
   Compliance Directory can be looked up (Entra ID, through the find-person
   flow) or entered by hand, and is added to the directory first. */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Field, Busy, useApp } from "./parts.jsx";
import { SUBROLES, samePerson } from "../data/model.js";

export const ROLES = [
  { k: "exec", role: "Executive Owner", label: "Executive Owner", note: "Accountable at the cabinet level." },
  { k: "unit", role: "Unit Owner", label: "Unit Owner", note: "Runs the obligation inside the unit." },
  { k: "compliance", role: "Compliance Owner", label: "Compliance Owner", note: "Does the work and files the record." }
];
const COUNSEL_ROLE = { k: "counsel", role: "General Counsel", label: "General Counsel", note: "Attorney of record for legal questions on this function." };

const chainFrom = f => ({
  exec: f.chain.exec.map(r => ({ ...r.person, sub: r.sub })),
  unit: f.chain.unit.map(r => ({ ...r.person, sub: r.sub })),
  compliance: f.chain.compliance.map(r => ({ ...r.person, sub: r.sub })),
  counsel: f.chain.counsel.map(r => ({ ...r.person, sub: "" }))
});

export function OwnershipChain({ f, admin }) {
  const { adapter, actions, flash } = useApp();
  const roles = adapter.counselPerFunction ? [...ROLES, COUNSEL_ROLE] : ROLES;
  const [chain, setChain] = useState(() => chainFrom(f));
  const [manage, setManage] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setChain(chainFrom(f)); setManage(false); setAddTo(null); setDirty(false); }, [f]);

  const inChain = useMemo(() => new Set([].concat(...roles.map(r => chain[r.k].map(p => String(p.id))))), [chain, roles]);
  const edit = next => { setChain(next); setDirty(true); };
  const add = (k, p, sub) => {
    if (chain[k].some(x => samePerson(x, p))) { flash(p.n + " already holds this role."); return; }
    edit({ ...chain, [k]: [...chain[k], { ...p, sub: k === "counsel" ? "" : (sub || "Support") }] });
    setAddTo(null);
  };
  const remove = (k, id) => edit({ ...chain, [k]: chain[k].filter(x => String(x.id) !== String(id)) });
  const setSub = (k, id, sub) => edit({ ...chain, [k]: chain[k].map(x => String(x.id) === String(id) ? { ...x, sub } : x) });

  const save = async () => {
    const rows = [];
    roles.forEach(r => chain[r.k].forEach(p => rows.push({ personId: p.id, name: p.n, role: r.role, sub: p.sub })));
    try { await actions.setOwnership(f, rows); setManage(false); setDirty(false); } catch (e) { /* toast already shown */ }
  };
  const cancel = () => { setChain(chainFrom(f)); setManage(false); setAddTo(null); setDirty(false); };

  const primaries = roles.filter(r => r.k !== "counsel").map(r => [r, chain[r.k].filter(p => p.sub === "Primary").length]);
  const warn = primaries.filter(([, n]) => n !== 1).map(([r, n]) => r.label + (n === 0 ? " has no Primary" : " has " + n + " Primaries"));

  return <Field label="Ownership chain" right={admin && (manage
    ? <span style={{ display: "flex", gap: 6 }}>
      <Busy busyKey="own" className="button button-primary button-sm" disabled={!dirty} onClick={save}><Icon n="check" s={13} />Save chain</Busy>
      <button className="button button-secondary-outline button-sm" onClick={cancel}>Cancel</button></span>
    : <button className="button button-secondary-outline button-sm" onClick={() => { setManage(true); setAddTo(null); }}>
      <Icon n="edit" s={13} />Manage people</button>)}>
    {manage && warn.length > 0 && <div className="note" style={{ marginBottom: 10 }}>Each role should have exactly one Primary: {warn.join("; ")}.</div>}
    <div className="ochain">
      {roles.map(r => {
        const list = chain[r.k];
        return <section key={r.k} className="orole">
          <header className="orole-h">
            <span className="orole-t">{r.label}</span>
            <span className="orole-n">{list.length} {list.length === 1 ? "person" : "people"}</span>
          </header>
          <div className="orole-note">{r.note}</div>
          {list.length ? list.map(p => <div key={p.id} className="operson">
            <Avatar person={p} size={34} />
            <div className="operson-b">
              <div className="operson-n">{p.n}</div>
              {p.t && <div className="operson-t">{p.t}</div>}
              {p.e && <a href={"mailto:" + p.e}>{p.e}</a>}
            </div>
            {r.k !== "counsel" && (manage
              ? <select className="ti osub" value={p.sub} onChange={e => setSub(r.k, p.id, e.target.value)}>
                {SUBROLES.map(s => <option key={s}>{s}</option>)}</select>
              : <span className={"osubpill " + String(p.sub).toLowerCase()}>{p.sub}</span>)}
            {manage && <button className="orm" title={"Remove " + p.n} onClick={() => remove(r.k, p.id)}>✕</button>}
          </div>) : <div className="oempty">No one assigned to this role.</div>}
          {manage && (addTo === r.k
            ? <PersonPicker exclude={inChain} counsel={r.k === "counsel"} onCancel={() => setAddTo(null)} onPick={(p, sub) => add(r.k, p, sub)} />
            : <button className="oadd" onClick={() => setAddTo(r.k)}>+ Add person to {r.label.toLowerCase()}</button>)}
        </section>;
      })}
    </div>
  </Field>;
}

/* ---- pick from the Compliance Directory, or look someone up and add them ---- */
export function PersonPicker({ exclude, onPick, onCancel, counsel, subPicker = true, actionLabel }) {
  const { ds, adapter, actions } = useApp();
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("Support");
  const [hit, setHit] = useState(null);
  const [state, setState] = useState("idle"); // idle | searching | none | found | manual
  const [manual, setManual] = useState({ name: "", email: "" });
  const [adding, setAdding] = useState(false);
  const dir = useMemo(() => {
    if (q.trim().length < 2) return [];
    const t = q.toLowerCase();
    return ds.people.filter(p => !exclude.has(String(p.id)) && (p.n + p.t + p.u + p.e).toLowerCase().includes(t)).slice(0, 5);
  }, [q, exclude, ds.people]);

  const lookup = async () => {
    setState("searching"); setHit(null);
    try {
      const r = await actions.lookupPerson(q);
      if (r) { setHit(r); setState("found"); } else setState("none");
    } catch (e) { setState("none"); }
  };
  const addNew = async p => {
    const existing = ds.people.find(x => x.e && p.email && x.e.toLowerCase() === p.email.toLowerCase());
    if (existing) { onPick(existing, sub); return; }
    setAdding(true);
    try {
      const r = await actions.addPerson(p);
      onPick({ id: r.id, n: p.name, t: p.title || "", u: p.unit || "", e: p.email, ph: p.phone || "", l: p.location || "" }, sub);
    } catch (e) { /* toast shown */ } finally { setAdding(false); }
  };
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(manual.email.trim());
  const pickLabel = actionLabel || (counsel ? "Add as counsel" : "Add as " + sub);

  return <div className="opick">
    <div className="opick-r">
      <div className="opick-s"><Icon n="search" s={15} />
        <input autoFocus value={q} onChange={e => { setQ(e.target.value); setState("idle"); setHit(null); }} placeholder="Search by name or email…" /></div>
      {subPicker && !counsel && <select className="ti osub" value={sub} onChange={e => setSub(e.target.value)}>
        {SUBROLES.map(s => <option key={s}>{s}</option>)}</select>}
      <button className="button button-ghost button-sm" onClick={onCancel}>Cancel</button>
    </div>

    {!!dir.length && <div className="opick-l">
      <div className="opick-lbl">In the Compliance Directory</div>
      {dir.map(p => <button key={p.id} className="opick-row" onClick={() => onPick(p, sub)}>
        <Avatar person={p} size={28} />
        <div style={{ minWidth: 0, flex: 1 }}><div className="operson-n">{p.n}</div><div className="operson-t">{[p.t, p.u, p.e].filter(Boolean).join(" · ")}</div></div>
        <span className="opick-add">{pickLabel}</span>
      </button>)}
    </div>}

    {q.trim().length >= 2 && !dir.length && state === "idle" && <div className="opick-ad">
      <div className="sub">No one in the Compliance Directory matches “{q}”.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {adapter.canLookupPeople && <button className="button button-secondary-outline button-sm" onClick={lookup}>Look up in Active Directory</button>}
        <button className="button button-ghost button-sm" onClick={() => { setManual({ name: /@/.test(q) ? "" : q.trim(), email: /@/.test(q) ? q.trim() : "" }); setState("manual"); }}>Enter name and email</button>
      </div>
    </div>}

    {state === "searching" && <div className="opick-ad"><div className="sub">Checking the university Active Directory…</div></div>}

    {state === "none" && <div className="opick-ad">
      <div className="sub">No Active Directory match for “{q}”. Check the spelling, or use their <b>@syr.edu</b> address.</div>
      <button className="button button-ghost button-sm" onClick={() => setState("idle")}>Try again</button>
    </div>}

    {state === "found" && hit && <div className="opick-ad ok">
      <div className="opick-lbl">Validated in Active Directory</div>
      <div className="opick-row static">
        <Avatar person={{ n: hit.name }} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="operson-n">{hit.name}</div>
          <div className="operson-t">{[hit.title, hit.unit].filter(Boolean).join(" · ")}</div>
          <div className="sub">{hit.email}{hit.netid ? " · NetID " + hit.netid : ""}</div>
        </div>
      </div>
      <div className="sub" style={{ marginTop: 8 }}>Adding them creates a Compliance Directory record{onPick ? <> and assigns them as <b>{counsel ? "counsel" : sub}</b> on this role</> : null}.</div>
      <button className="button button-primary button-sm" style={{ marginTop: 10 }} disabled={adding} onClick={() => addNew(hit)}>{adding ? "Adding…" : "Add to Compliance Directory"}</button>
    </div>}

    {state === "manual" && <div className="opick-ad ok">
      <div className="opick-lbl">New Compliance Directory record</div>
      <div className="frow" style={{ width: "100%" }}>
        <div><label className="flab">Full name</label><input className="ti" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} /></div>
        <div><label className="flab">Email</label><input className="ti" value={manual.email} onChange={e => setManual({ ...manual, email: e.target.value })} placeholder="netid@syr.edu" /></div>
      </div>
      <button className="button button-primary button-sm" disabled={adding || !manual.name.trim() || !validEmail} onClick={() => addNew({ name: manual.name.trim(), email: manual.email.trim() })}>{adding ? "Adding…" : "Add to Compliance Directory"}</button>
    </div>}
  </div>;
}
