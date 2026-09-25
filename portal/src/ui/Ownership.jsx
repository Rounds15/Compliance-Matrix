/* The Accountability Structure, drawn as tiers down the page: Executive
   Owner, then Unit Owner, then Compliance Owner (the canvas app's order),
   then Support where the data source has it. Each tier holds many people,
   each with a sub-role (Primary or Advisory). General Counsel is not a tier
   here: it has its own card in the rail (CounselCard, below). Administrators
   add, remove and re-weight people, then save; saving replaces the
   function's ownership rows, which is how the canvas app writes it, so each
   editor carries the other's rows through unchanged. Someone not yet in the
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
const ROLE_OF = { exec: ROLE_EXEC, unit: ROLE_UNIT, compliance: ROLE_COMPLIANCE, support: ROLE_SUPPORT };

const chainFrom = f => Object.fromEntries(CHAIN_KEYS.map(k => [k, (f.chain[k] || []).map(r => ({ ...r.person, sub: r.sub || "Primary" }))]));
/* the rows a save writes, from a chain and a counsel list */
const rowsOf = (chain, counsel) => [
  ...CHAIN_KEYS.flatMap(k => (chain[k] || []).map(p => ({ personId: p.id, name: p.n, role: ROLE_OF[k], sub: p.sub }))),
  ...counsel.map(p => ({ personId: p.id, name: p.n, role: ROLE_COUNSEL, sub: "Advisory" }))
];
const counselOf = (f, adapter) => (adapter.counselPerFunction ? f.chain.counsel.map(r => r.person) : []);

export function OwnershipChain({ f, admin }) {
  const { adapter, actions, flash } = useApp();
  const roles = useMemo(() => adapter.roles.filter(r => ROLE_INFO[r]).map(role => ({ role, ...ROLE_INFO[role] })), [adapter]);
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

  const warn = roles.filter(r => r.tier)
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
      {roles.filter(r => manage || r.k !== "support" || chain.support.length).map(r => {
        const list = chain[r.k];
        return <section key={r.k} className={"orole tier " + r.k}>
          <header className="tier-h">
            <span className="tier-n" aria-hidden="true">{r.tier || "+"}</span>
            <div style={{ minWidth: 0 }}>
              <span className="orole-t">{r.role}</span>
              <span className="orole-n">{list.length} {list.length === 1 ? "person" : "people"}</span>
              <div className="orole-note">{r.note}</div>
            </div>
          </header>
          <div className="tier-people">
            {list.length ? list.map(p => <div key={p.id} className="operson">
              <Avatar person={p} size={34} />
              <div className="operson-b">
                <DirLink p={p} />
                {p.t && <div className="operson-t">{p.t}</div>}
                {p.e && <a href={"mailto:" + p.e}>{p.e}</a>}
              </div>
              {manage
                ? <select className="ti osub" value={p.sub} aria-label={"Sub-role for " + p.n} onChange={e => setSub(r.k, p.id, e.target.value)}>
                  {!SUBROLES.includes(p.sub) && <option>{p.sub}</option>}
                  {SUBROLES.map(s => <option key={s}>{s}</option>)}</select>
                : <span className={"osubpill " + String(p.sub).toLowerCase()}>{p.sub}</span>}
              {manage && <button className="orm" title={"Remove " + p.n} aria-label={"Remove " + p.n} onClick={() => remove(r.k, p.id)}>{"✕"}</button>}
            </div>) : <div className="oempty">Not assigned</div>}
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
export function CounselCard({ f }) {
  const { adapter, actions, realAdmin } = useApp();
  const [pick, setPick] = useState(false);
  useEffect(() => { setPick(false); }, [f]);
  const counsel = f.counsel;
  const own = f.chain.counsel.length > 0;
  const canEdit = realAdmin && adapter.counselPerFunction;
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
          {counsel.e && <a href={"mailto:" + counsel.e} style={{ fontSize: 12, display: "inline-block", marginTop: 5, wordBreak: "break-all" }}>{counsel.e}</a>}
        </div></div>
      {counsel.e && !pick && <a className="gc-esc" href={"mailto:" + counsel.e + "?subject=" + encodeURIComponent("Legal question: " + f.code + " " + f.name)}>Email a question about this function</a>}
    </> : <div className="gc-lede">No General Counsel is assigned to this function yet.</div>}
    {pick && <div className="gc-pick">
      <PersonPicker counsel exclude={new Set(counsel ? [String(counsel.id)] : [])} actionLabel="Assign" onCancel={() => setPick(false)} onPick={p => save([p])} />
      {own && <Busy busyKey="own" className="button button-ghost button-sm gc-rm" onClick={() => save([])}><Icon n="trash" s={13} />Remove General Counsel</Busy>}
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
