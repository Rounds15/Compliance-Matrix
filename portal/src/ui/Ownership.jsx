/* The Accountability Structure, drawn as tiers down the page: Executive
   Owner, then Unit Owner, then Compliance Owner (the canvas app's order).
   Each tier holds many people, each with a sub-role (Primary or Advisory).
   General Counsel and Support are not tiers here: each has its own card in
   the rail (CounselCard and SupportCard, below). Administrators add, remove
   and re-weight people, then save. A save sends the function's whole
   chain, so each editor carries the others' rows through unchanged; the
   adapter writes only the difference, creating before it deletes
   (ownershipPlan in data/model.js). Someone not yet in the
   Compliance Directory can be looked up through the find-person flow, or
   entered by hand, and is added to the directory first. */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Field, Busy, useApp } from "./parts.jsx";
import { SUBROLES, ROLE_EXEC, ROLE_UNIT, ROLE_COMPLIANCE, ROLE_COUNSEL, ROLE_SUPPORT, samePerson } from "../data/model.js";

const ROLE_INFO = {
  [ROLE_EXEC]: { k: "exec", tier: 1, note: "Accountable at the cabinet level." },
  [ROLE_UNIT]: { k: "unit", tier: 2, note: "Runs the obligation inside the unit." },
  [ROLE_COMPLIANCE]: { k: "compliance", tier: 3, note: "Does the work and files the record." },
  [ROLE_SUPPORT]: { k: "support", tier: 0, note: "Helps the owners carry out the obligation." }
};
const CHAIN_KEYS = ["exec", "unit", "compliance", "support"];
const TIER_KEYS = ["exec", "unit", "compliance"];
const ROLE_OF = { exec: ROLE_EXEC, unit: ROLE_UNIT, compliance: ROLE_COMPLIANCE, support: ROLE_SUPPORT };

const chainFrom = f => Object.fromEntries(CHAIN_KEYS.map(k => [k, (f.chain[k] || []).map(r => ({ ...r.person, sub: r.sub || "Primary" }))]));
/* the rows a save writes, from a chain and a counsel list */
const rowsOf = (chain, counsel) => [
  ...CHAIN_KEYS.flatMap(k => (chain[k] || []).map(p => ({ personId: p.id, name: p.n, role: ROLE_OF[k], sub: p.sub }))),
  ...counsel.map(p => ({ personId: p.id, name: p.n, role: ROLE_COUNSEL, sub: "Advisory" }))
];
const counselOf = (f, adapter) => (adapter.counselPerFunction ? f.chain.counsel.map(r => r.person) : []);

/* The edit form's ownership chain, as the canvas app's edit mode has it: one
   list of people, each with a role and sub-role, added from the Compliance
   Directory with a person, role and sub-role dropdown, and removed one by
   one. General Counsel is a separate dropdown with the Advisory sub-role.
   Nothing is written until the record is saved. */
export const ownersOf = f => {
  if (!f) return { owners: [], gc: null };
  const c = chainFrom(f);
  return {
    owners: CHAIN_KEYS.flatMap(k => c[k].map(p => ({ ...p, role: ROLE_OF[k] }))),
    gc: f.chain.counsel.length ? f.chain.counsel[0].person : null
  };
};
export const ownerRows = ({ owners, gc }) => [
  ...owners.map(p => ({ personId: p.id, name: p.n, role: p.role, sub: p.sub })),
  ...(gc ? [{ personId: gc.id, name: gc.n, role: ROLE_COUNSEL, sub: "Advisory" }] : [])
];
/* a stable key for "did the ownership change", so an unchanged chain is not rewritten */
export const ownerKey = o => ownerRows(o).map(r => [r.personId, r.role, r.sub].join("|")).sort().join(";");

/* fallback: the risk area's counsel, shown when the function has none of its own */
export function OwnersEditor({ value, onChange, fallback }) {
  const { ds, adapter, flash } = useApp();
  const people = useMemo(() => [...ds.people].sort((a, b) => a.n.localeCompare(b.n)), [ds.people]);
  const roles = adapter.roles.filter(r => ROLE_INFO[r]);
  const [pid, setPid] = useState("");
  const [role, setRole] = useState(roles.includes(ROLE_COMPLIANCE) ? ROLE_COMPLIANCE : roles[0]);
  const [sub, setSub] = useState("Primary");
  const order = r => { const i = roles.indexOf(r); return i < 0 ? roles.length : i; };
  const list = [...value.owners].sort((a, b) => order(a.role) - order(b.role));
  const add = () => {
    const p = people.find(x => String(x.id) === pid);
    if (!p) return;
    if (value.owners.some(x => x.role === role && samePerson(x, p))) { flash(p.n + " already holds this role."); return; }
    onChange({ ...value, owners: [...value.owners, { ...p, role, sub }] });
    setPid("");
  };
  const remove = o => onChange({ ...value, owners: value.owners.filter(x => x !== o) });
  const gcOptions = value.gc && !people.some(p => String(p.id) === String(value.gc.id)) ? [value.gc, ...people] : people;
  return <>
    <Field label="Ownership chain">
      <div className="own-add">
        <div className="own-person"><label className="flab" htmlFor="fd-own-person">Person</label>
          <select id="fd-own-person" className="ti" value={pid} onChange={e => setPid(e.target.value)}>
            <option value="">Select a person</option>
            {people.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</select></div>
        <div><label className="flab" htmlFor="fd-own-role">Role</label>
          <select id="fd-own-role" className="ti" value={role} onChange={e => setRole(e.target.value)}>
            {roles.map(r => <option key={r}>{r}</option>)}</select></div>
        <div><label className="flab" htmlFor="fd-own-sub">Sub-role</label>
          <select id="fd-own-sub" className="ti" value={sub} onChange={e => setSub(e.target.value)}>
            {SUBROLES.map(x => <option key={x}>{x}</option>)}</select></div>
        <button className="button button-secondary button-sm own-addbtn" disabled={!pid} onClick={add}><Icon n="plus" s={13} />Add owner</button>
      </div>
      <div className="own-list">
        {list.length ? list.map((o, i) => <div key={o.role + o.id + i} className={"own-row " + (ROLE_INFO[o.role] || {}).k}>
          <Avatar person={o} size={30} />
          <div className="own-row-b"><div className="operson-n">{o.n}</div>
            <div className="operson-r">{o.role} {"\u00b7"} {o.sub}</div></div>
          <button className="button button-danger-outline button-sm own-rm" onClick={() => remove(o)} aria-label={"Remove " + o.n + " as " + o.role}>Remove</button>
        </div>) : <div className="oempty">Not assigned</div>}
      </div>
    </Field>
    <Field label="General Counsel (Advisory)">
      <select id="fd-gc" className="ti" aria-label="General Counsel" value={value.gc ? String(value.gc.id) : ""}
        onChange={e => onChange({ ...value, gc: gcOptions.find(p => String(p.id) === e.target.value) || null })}>
        <option value="">{fallback ? "Risk area default (" + fallback.n + ")" : "Not assigned"}</option>
        {gcOptions.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</select>
    </Field>
  </>;
}

export function OwnershipChain({ f, admin }) {
  const { adapter, actions, flash } = useApp();
  const roles = useMemo(() => adapter.roles.filter(r => ROLE_INFO[r] && TIER_KEYS.includes(ROLE_INFO[r].k)).map(role => ({ role, ...ROLE_INFO[role] })), [adapter]);
  const [chain, setChain] = useState(() => chainFrom(f));
  const [manage, setManage] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setChain(chainFrom(f)); setManage(false); setAddTo(null); setDirty(false); }, [f]);

  const edit = next => { setChain(next); setDirty(true); };
  const add = (k, p, sub) => {
    if (chain[k].some(x => samePerson(x, p))) { flash(p.n + " already holds this role."); return; }
    edit({ ...chain, [k]: [...chain[k], { ...p, sub: sub || "Primary" }] });
    setAddTo(null);
  };
  const remove = (k, id) => edit({ ...chain, [k]: chain[k].filter(x => String(x.id) !== String(id)) });
  const setSub = (k, id, sub) => edit({ ...chain, [k]: chain[k].map(x => String(x.id) === String(id) ? { ...x, sub } : x) });

  const save = async () => {
    try { await actions.setOwnership(f, rowsOf(chain, counselOf(f, adapter))); setManage(false); setDirty(false); } catch (e) { /* the toast says what failed */ }
  };
  const cancel = () => { setChain(chainFrom(f)); setManage(false); setAddTo(null); setDirty(false); };

  const warn = roles
    .map(r => [r, chain[r.k].filter(p => p.sub === "Primary").length])
    .filter(([, n]) => n > 1).map(([r, n]) => r.role + " has " + n + " Primaries");

  return <Field label="Accountability structure" right={admin && (manage
    ? <span style={{ display: "flex", gap: 6 }}>
      <Busy busyKey="own" className="button button-primary button-sm" disabled={!dirty} onClick={save}><Icon n="check" s={13} />Save chain</Busy>
      <button className="button button-secondary-outline button-sm" onClick={cancel}>Cancel</button></span>
    : <button className="button button-secondary-outline button-sm" onClick={() => { setManage(true); setAddTo(null); }}>
      <Icon n="edit" s={13} />Manage people</button>)}>
    {manage && warn.length > 0 && <div className="note" style={{ marginBottom: 10 }}>A role usually has one Primary: {warn.join("; ")}.</div>}
    <div className="ochain tiers">
      {roles.map(r => {
        const list = chain[r.k];
        return <section key={r.k} className={"orole tier " + r.k}>
          <header className="tier-h">
            <div className="tier-ttl"><span className="orole-t">{r.role}</span>{" "}<span className="orole-n">{list.length} {list.length === 1 ? "person" : "people"}</span></div>
            <div className="orole-note">{r.note}</div>
          </header>
          <div className="tier-people">
            {list.length ? list.map(p => <PersonCard key={p.id} p={p} role={r.role} manage={manage}
              onSub={sub => setSub(r.k, p.id, sub)} onRemove={() => remove(r.k, p.id)} />) : <div className="oempty">Not assigned</div>}
            {manage && (addTo === r.k
              ? <PersonPicker exclude={new Set(list.map(p => String(p.id)))} onCancel={() => setAddTo(null)} onPick={(p, sub) => add(r.k, p, sub)} />
              : <button className="oadd" onClick={() => setAddTo(r.k)}>+ Add a person as {r.role}</button>)}
          </div>
        </section>;
      })}
    </div>
  </Field>;
}

/* General Counsel, in the rail. On SharePoint counsel is set per function,
   so administrators can assign, change or remove it here; on Dataverse it
   is set per risk area, so the card only shows it. */
export function CounselCard({ f, locked }) {
  const { adapter, actions, realAdmin } = useApp();
  const [pick, setPick] = useState(false);
  useEffect(() => { setPick(false); }, [f]);
  const counsel = f.counsel;
  const own = f.chain.counsel.length > 0;
  const canEdit = realAdmin && adapter.counselPerFunction && !locked;
  const save = async list => {
    try { await actions.setOwnership(f, rowsOf(chainFrom(f), list), "General Counsel saved."); setPick(false); } catch (e) { /* the toast says what failed */ }
  };
  return <div className="rail-card gc">
    <div className="rail-t">Legal questions
      {canEdit && !pick && <button className="gc-edit" onClick={() => setPick(true)} aria-label={counsel ? "Change General Counsel" : "Assign General Counsel"}>
        <Icon n="edit" s={12} />{counsel ? "Change" : "Assign"}</button>}</div>
    {counsel ? <>
      <div className="gc-lede">General Counsel (Advisory) for {adapter.counselPerFunction ? "this function" : f.topic}. Reach out before responding to a regulator, signing an agreement, or interpreting the statute.</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
        <Avatar person={counsel} size={40} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#000E54", fontSize: 13.5, lineHeight: 1.3 }}>{counsel.n}</div>
          {counsel.t && <div style={{ fontSize: 12, color: "#5b6373", marginTop: 3, lineHeight: 1.35 }}>{counsel.t}</div>}
          {counsel.u && <div style={{ fontSize: 12, color: "#5b6373", marginTop: 2, lineHeight: 1.35 }}>{counsel.u}</div>}
          {counsel.l && <div style={{ fontSize: 12, color: "#5b6373", marginTop: 2, lineHeight: 1.35 }}>{counsel.l}</div>}
          {counsel.e && <a href={"mailto:" + counsel.e} style={{ fontSize: 12, display: "block", marginTop: 5, wordBreak: "break-all" }}>{counsel.e}</a>}
          {counsel.ph && <a href={"tel:" + counsel.ph.replace(/[^\d+]/g, "")} style={{ fontSize: 12, display: "block", marginTop: 3 }}>{counsel.ph}</a>}
        </div></div>
      {counsel.e && !pick && <a className="gc-esc" href={"mailto:" + counsel.e + "?subject=" + encodeURIComponent("Legal question: " + f.name)}>Email a question about this function</a>}
    </> : <div className="gc-lede">No General Counsel is assigned to this function yet.</div>}
    {pick && <div className="gc-pick">
      <PersonPicker counsel exclude={new Set(counsel ? [String(counsel.id)] : [])} actionLabel="Assign" onCancel={() => setPick(false)} onPick={p => save([p])} />
      {own && <Busy busyKey="own" className="button button-ghost button-sm gc-rm" onClick={() => save([])}><Icon n="trash" s={13} />Remove General Counsel</Busy>}
    </div>}
  </div>;
}

/* one person in a role: photo or initials, the name (bold, opening their
   Directory entry), the role and sub-role, then title, unit and email, each
   on its own line. Managing swaps the sub-role for a picker and a remove
   button. */
function PersonCard({ p, role, manage, onSub, onRemove, size = 40 }) {
  return <div className="operson">
    <Avatar person={p} size={size} />
    <div className="operson-b">
      <DirLink p={p} />
      <div className="operson-r">{manage ? role : role + " \u00b7 " + p.sub}</div>
      {p.t && <div className="operson-t">{p.t}</div>}
      {p.u && <div className="operson-u">{p.u}</div>}
      {p.l && <div className="operson-u">{p.l}</div>}
      {p.e && <a className="operson-e" href={"mailto:" + p.e}>{p.e}</a>}
      {p.ph && <a className="operson-e" href={"tel:" + p.ph.replace(/[^\d+]/g, "")}>{p.ph}</a>}
    </div>
    {manage && <div className="operson-m">
      <select className="ti osub" value={p.sub} aria-label={"Sub-role for " + p.n} onChange={e => onSub(e.target.value)}>
        {!SUBROLES.includes(p.sub) && <option>{p.sub}</option>}
        {SUBROLES.map(s => <option key={s}>{s}</option>)}</select>
      <button className="orm" title={"Remove " + p.n} aria-label={"Remove " + p.n} onClick={onRemove}>{"\u2715"}</button>
    </div>}
  </div>;
}

/* Support, in the rail under General Counsel: the same person card, smaller.
   Administrators add, remove and re-weight people here, then save; the save
   carries the tiers and counsel through unchanged. */
export function SupportCard({ f, locked }) {
  const { adapter, actions, realAdmin, flash } = useApp();
  const [list, setList] = useState(() => chainFrom(f).support);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const reset = () => { setList(chainFrom(f).support); setManage(false); setAdding(false); setDirty(false); };
  useEffect(reset, [f]);
  if (!adapter.roles.includes(ROLE_SUPPORT) || (!list.length && !realAdmin)) return null;

  const edit = next => { setList(next); setDirty(true); };
  const add = (p, sub) => {
    if (list.some(x => samePerson(x, p))) { flash(p.n + " already holds this role."); return; }
    edit([...list, { ...p, sub: sub || "Primary" }]); setAdding(false);
  };
  const save = async () => {
    try { await actions.setOwnership(f, rowsOf({ ...chainFrom(f), support: list }, counselOf(f, adapter)), "Support saved."); setManage(false); setDirty(false); } catch (e) { /* the toast says what failed */ }
  };
  return <div className="rail-card support">
    <div className="rail-t">{ROLE_SUPPORT} <span className="orole-n">{list.length} {list.length === 1 ? "person" : "people"}</span>
      {realAdmin && !manage && !locked && <button className="gc-edit" onClick={() => setManage(true)} aria-label="Manage Support"><Icon n="edit" s={12} />Manage</button>}</div>
    <div className="gc-lede">{ROLE_INFO[ROLE_SUPPORT].note}</div>
    <div className="sup-people">
      {list.length ? list.map(p => <PersonCard key={p.id} p={p} role={ROLE_SUPPORT} manage={manage} size={30}
        onSub={sub => edit(list.map(x => String(x.id) === String(p.id) ? { ...x, sub } : x))}
        onRemove={() => edit(list.filter(x => String(x.id) !== String(p.id)))} />) : <div className="oempty">Not assigned</div>}
    </div>
    {manage && <div className="gc-pick">
      {adding
        ? <PersonPicker exclude={new Set(list.map(p => String(p.id)))} onCancel={() => setAdding(false)} onPick={add} />
        : <button className="oadd" onClick={() => setAdding(true)}>+ Add a person as {ROLE_SUPPORT}</button>}
      <div className="sup-save">
        <Busy busyKey="own" className="button button-primary button-sm" disabled={!dirty} onClick={save}><Icon n="check" s={13} />Save Support</Busy>
        <button className="button button-secondary-outline button-sm" onClick={reset}>Cancel</button>
      </div>
    </div>}
  </div>;
}

/* a person's name opens their Directory entry */
function DirLink({ p }) {
  const { go } = useApp();
  if (!p.id) return <div className="operson-n">{p.n}</div>;
  return <button className="operson-n linkish" onClick={() => go("Directory", { person: p.id })} title={"Open " + p.n + " in the directory"}>{p.n}</button>;
}

/* pick from the Compliance Directory, or look someone up and add them */
export function PersonPicker({ exclude, onPick, onCancel, counsel, subPicker = true, actionLabel }) {
  const { ds, adapter, actions } = useApp();
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("Primary");
  const [hits, setHits] = useState([]);
  const [state, setState] = useState("idle"); // idle | searching | none | found | manual
  const [manual, setManual] = useState({ name: "", email: "" });
  const [adding, setAdding] = useState(false);
  const dir = useMemo(() => {
    if (q.trim().length < 2) return [];
    const t = q.toLowerCase();
    return ds.people.filter(p => !exclude.has(String(p.id)) && (p.n + " " + p.t + " " + p.u + " " + p.e).toLowerCase().includes(t)).slice(0, 5);
  }, [q, exclude, ds.people]);

  const lookup = async () => {
    setState("searching"); setHits([]);
    try {
      const r = await actions.searchPeople(q);
      if (r && r.length) { setHits(r.slice(0, 5)); setState("found"); } else setState("none");
    } catch (e) { setState("none"); }
  };
  const addNew = async p => {
    const existing = ds.people.find(x => x.e && p.email && x.e.toLowerCase() === p.email.toLowerCase());
    if (existing) { onPick(existing, sub); return; }
    setAdding(true);
    try {
      const r = await actions.addPerson(p);
      onPick({ id: r && r.id, n: p.name, t: p.title || "", u: p.unit || "", e: p.email, ph: p.phone || "", l: p.location || "" }, sub);
    } catch (e) { /* the toast says what failed */ } finally { setAdding(false); }
  };
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(manual.email.trim());
  const pickLabel = actionLabel || (counsel ? "Add as counsel" : "Add as " + sub);

  return <div className="opick">
    <div className="opick-r">
      <div className="opick-s"><Icon n="search" s={15} />
        <input autoFocus value={q} onChange={e => { setQ(e.target.value); setState("idle"); setHits([]); }} placeholder="Search by name or email..." aria-label="Search people" /></div>
      {subPicker && !counsel && <select className="ti osub" value={sub} onChange={e => setSub(e.target.value)} aria-label="Sub-role">
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

    {q.trim().length >= 2 && state === "idle" && <div className="opick-ad">
      {!dir.length && <div className="sub">No one in the Compliance Directory matches "{q.trim()}".</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {adapter.canSearchPeople && <button className="button button-secondary-outline button-sm" onClick={lookup}>Search the university directory</button>}
        <button className="button button-ghost button-sm" onClick={() => { setManual({ name: /@/.test(q) ? "" : q.trim(), email: /@/.test(q) ? q.trim() : "" }); setState("manual"); }}>Enter name and email</button>
      </div>
    </div>}

    {state === "searching" && <div className="opick-ad"><span className="cm-spin" aria-hidden="true"></span><div className="sub">Searching the university directory...</div></div>}

    {state === "none" && <div className="opick-ad">
      <div className="sub">No match for "{q.trim()}" in the university directory. Check the spelling, or use their <b>@syr.edu</b> address.</div>
      <button className="button button-ghost button-sm" onClick={() => setState("idle")}>Try again</button>
    </div>}

    {state === "found" && <div className="opick-ad ok">
      <div className="opick-lbl">From the university directory</div>
      {hits.map(h => <div key={h.email || h.name} className="opick-row static">
        <Avatar person={{ n: h.name }} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="operson-n">{h.name}</div>
          <div className="operson-t">{[h.title, h.unit].filter(Boolean).join(" · ")}</div>
          <div className="sub">{h.email}{h.netid ? " · NetID " + h.netid : ""}</div>
        </div>
        <button className="button button-primary button-sm" disabled={adding || !h.email} onClick={() => addNew(h)}>{adding ? "Adding..." : "Add"}</button>
      </div>)}
      <div className="sub" style={{ marginTop: 8 }}>Adding someone creates their Compliance Directory record{counsel ? " and assigns them as counsel" : <> and assigns them as <b>{sub}</b></>}.</div>
    </div>}

    {state === "manual" && <div className="opick-ad ok">
      <div className="opick-lbl">New Compliance Directory record</div>
      <div className="frow" style={{ width: "100%" }}>
        <div><label className="flab" htmlFor="op-name">Full name</label><input id="op-name" className="ti" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} /></div>
        <div><label className="flab" htmlFor="op-email">Email</label><input id="op-email" className="ti" value={manual.email} onChange={e => setManual({ ...manual, email: e.target.value })} placeholder="netid@syr.edu" /></div>
      </div>
      <button className="button button-primary button-sm" disabled={adding || !manual.name.trim() || !validEmail} onClick={() => addNew({ name: manual.name.trim(), email: manual.email.trim() })}>{adding ? "Adding..." : "Add to Compliance Directory"}</button>
    </div>}
  </div>;
}
