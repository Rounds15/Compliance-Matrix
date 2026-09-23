/* Risk areas and domains - the canvas app's taxonomy manager. A risk area or
   domain that functions still point at cannot be deleted from here: the
   function would lose its grouping silently. Move the functions first. */

import React, { useState } from "react";
import { Icon, Modal, Busy, useApp } from "./parts.jsx";

export function TaxonomyManager({ onClose }) {
  const { ds, actions } = useApp();
  const [kind, setKind] = useState("Risk area");
  const [name, setName] = useState("");
  const [parent, setParent] = useState(ds.topics[0] ? String(ds.topics[0].id) : "");
  const [confirm, setConfirm] = useState(null);
  const fnCount = (key, id) => ds.fns.filter(f => String(f[key]) === String(id)).length;
  const domainsOf = t => ds.domains.filter(d => String(d.topicId) === String(t.id));
  const trimmed = name.trim();
  const dupe = kind === "Risk area"
    ? ds.topics.some(t => t.name.toLowerCase() === trimmed.toLowerCase())
    : ds.domains.some(d => String(d.topicId) === parent && d.name.toLowerCase() === trimmed.toLowerCase());

  const add = async () => {
    try {
      if (kind === "Risk area") await actions.addRiskArea(trimmed);
      else await actions.addDomain(trimmed, ds.topics.find(t => String(t.id) === parent).id);
      setName("");
    } catch (e) { /* toast */ }
  };
  const remove = async () => {
    try {
      if (confirm.kind === "ra") await actions.deleteRiskArea(confirm.item);
      else await actions.deleteDomain(confirm.item);
      setConfirm(null);
    } catch (e) { /* toast */ }
  };

  return <Modal onClose={onClose}>
    <div className="mhd"><div><div className="eyebrow" style={{ color: "#FF8E00" }}>Administrator</div>
      <h2 style={{ marginTop: 5 }}>Manage risk areas and domains</h2>
      <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{ds.topics.length} risk areas · {ds.domains.length} domains</div></div>
      <button className="cl" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="mbd">
      <div className="cm-panel" style={{ padding: 14, marginBottom: 18 }}>
        <div className="frow" style={{ alignItems: "flex-end", marginBottom: 0 }}>
          <div style={{ flex: "0 0 160px" }}><label className="flab">Add a</label>
            <select className="ti" value={kind} onChange={e => setKind(e.target.value)}><option>Risk area</option><option>Domain</option></select></div>
          {kind === "Domain" && <div><label className="flab">In risk area</label>
            <select className="ti" value={parent} onChange={e => setParent(e.target.value)}>
              {ds.topics.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}</select></div>}
          <div><label className="flab">Name</label><input className="ti" value={name} onChange={e => setName(e.target.value)} placeholder={kind === "Domain" ? "e.g. Export Control" : "e.g. Research"} /></div>
          <div style={{ flex: "0 0 auto" }}><Busy busyKey="tax" className="button button-primary" disabled={!trimmed || dupe || (kind === "Domain" && !parent)} onClick={add}><Icon n="plus" s={15} />Add</Busy></div>
        </div>
        {dupe && <p className="sub" style={{ marginTop: 8 }}>That name is already in use{kind === "Domain" ? " in this risk area" : ""}.</p>}
      </div>
      {ds.topics.map(t => {
        const n = fnCount("topicId", t.id), doms = domainsOf(t);
        return <div key={t.id} className="cm-panel" style={{ padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname">{t.name}</div>
              <div className="sub">{n} function{n === 1 ? "" : "s"} · {doms.length} domain{doms.length === 1 ? "" : "s"}</div></div>
            <button className="button button-ghost button-sm" disabled={n > 0 || doms.length > 0}
              title={n || doms.length ? "Move its functions and remove its domains first" : "Delete " + t.name}
              onClick={() => setConfirm({ kind: "ra", item: t })}><Icon n="trash" s={13} />Delete</button>
          </div>
          {!!doms.length && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {doms.map(d => {
              const dn = fnCount("areaId", d.id);
              return <span key={d.id} className="chip" style={{ gap: 6 }}>{d.name} <span className="sub">({dn})</span>
                {dn === 0 && <button className="orm" style={{ width: 18, height: 18, fontSize: 11 }} title={"Delete " + d.name} onClick={() => setConfirm({ kind: "dm", item: d })}>✕</button>}</span>;
            })}
          </div>}
        </div>;
      })}
    </div>
    <div className="mft"><button className="button button-secondary-outline" style={{ marginLeft: "auto" }} onClick={onClose}>Done</button></div>
    {confirm && <Modal onClose={() => setConfirm(null)} size="sm">
      <div className="mhd"><div><h2>Delete {confirm.item.name}?</h2></div><button className="cl" onClick={() => setConfirm(null)} aria-label="Close">✕</button></div>
      <div className="mbd"><p>No functions use this {confirm.kind === "ra" ? "risk area" : "domain"}. Deleting it removes it from every picker.</p></div>
      <div className="mft"><Busy busyKey="tax" className="button button-danger" onClick={remove}><Icon n="trash" s={15} />Delete</Busy>
        <button className="button button-secondary-outline" onClick={() => setConfirm(null)}>Cancel</button></div>
    </Modal>}
  </Modal>;
}
