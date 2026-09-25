/* Risk areas and domains, in the design's dialog. The rules are the canvas
   app's: a name must be new (a domain's only within its risk area), and a
   risk area or domain that functions still use cannot be deleted, since the
   function would lose its grouping silently. Move the functions first. */

import React, { useState } from "react";
import { Icon, Modal, ModalHead, Busy, useApp } from "./parts.jsx";

const byName = (a, b) => a.name.localeCompare(b.name);

export function TaxonomyManager({ onClose }) {
  const { ds, actions } = useApp();
  const areas = [...ds.topics].sort(byName);
  const [kind, setKind] = useState("Risk area");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [confirm, setConfirm] = useState(null);
  const fnCount = (key, id) => ds.fns.filter(f => String(f[key]) === String(id)).length;
  const domainsOf = t => ds.domains.filter(d => String(d.topicId) === String(t.id)).sort(byName);
  const n = name.trim().toLowerCase();
  const parentArea = areas.find(a => String(a.id) === parent);
  const hint = !n ? ""
    : kind === "Domain" && !parentArea ? "Choose the risk area this domain sits under."
      : kind === "Domain" && ds.domains.some(d => d.name.trim().toLowerCase() === n && String(d.topicId) === parent) ? `That domain already exists under ${parentArea.name}.`
        : kind === "Risk area" && areas.some(a => a.name.trim().toLowerCase() === n) ? "That risk area already exists." : "";

  const add = async () => {
    try {
      if (kind === "Domain") await actions.addDomain(name.trim(), parentArea.id);
      else await actions.addRiskArea(name.trim());
      setName("");
    } catch (e) { /* the toast says what failed */ }
  };
  const remove = async () => {
    try {
      if (confirm.kind === "ra") await actions.deleteRiskArea(confirm.item);
      else await actions.deleteDomain(confirm.item);
      setConfirm(null);
    } catch (e) { /* the toast says what failed */ }
  };

  return <Modal onClose={onClose} label="Risk areas and domains">
    <ModalHead onClose={onClose} eyebrow="Administrator" title="Manage risk areas and domains"
      sub={areas.length + " risk areas · " + ds.domains.length + " domains"} />
    <div className="mbd">
      <div className="cm-panel" style={{ padding: 14, marginBottom: 18 }}>
        <div className="frow" style={{ alignItems: "flex-end", marginBottom: 0 }}>
          <div style={{ flex: "0 0 160px" }}><label className="flab" htmlFor="tax-kind">Add a</label>
            <select id="tax-kind" className="ti" value={kind} onChange={e => setKind(e.target.value)}><option>Risk area</option><option>Domain</option></select></div>
          {kind === "Domain" && <div><label className="flab" htmlFor="tax-parent">Risk area this domain sits under</label>
            <select id="tax-parent" className="ti" value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">Choose a risk area</option>
              {areas.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}</select></div>}
          <div><label className="flab" htmlFor="tax-name">{kind === "Domain" ? "Domain name" : "Risk area name"}</label>
            <input id="tax-name" className="ti" value={name} onChange={e => setName(e.target.value)} placeholder={kind === "Domain" ? "New domain name" : "New risk area name"} /></div>
          <div style={{ flex: "0 0 auto" }}><Busy busyKey="tax" className="button button-primary" disabled={!n || !!hint} onClick={add}>
            <Icon n="plus" s={15} />{kind === "Domain" ? "Add domain" : "Add risk area"}</Busy></div>
        </div>
        {hint && <p className="sub" style={{ marginTop: 8, color: "#B45309" }}>{hint}</p>}
      </div>
      {areas.map(t => {
        const fnN = fnCount("topicId", t.id), doms = domainsOf(t);
        const why = fnN || doms.length ? `Cannot delete ${t.name}. ${fnN ? fnN + " function(s). " : ""}${doms.length ? doms.length + " domain(s). " : ""}Reassign the children first.` : "Delete " + t.name;
        return <div key={t.id} className="cm-panel tax-area" style={{ padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname">{t.name}</div>
              <div className="sub">{fnN} function{fnN === 1 ? "" : "s"} {"·"} {doms.length} domain{doms.length === 1 ? "" : "s"}</div></div>
            <button className="button button-ghost button-sm" disabled={fnN > 0 || doms.length > 0} title={why}
              onClick={() => setConfirm({ kind: "ra", item: t })}><Icon n="trash" s={13} />Delete</button>
          </div>
          {!!doms.length && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {doms.map(d => {
              const dn = fnCount("areaId", d.id);
              return <span key={d.id} className="chip" style={{ gap: 6 }} title={dn ? `Cannot delete ${d.name}. ${dn} function(s) under ${t.name} still use it. Reassign them first.` : undefined}>
                {d.name} <span className="sub">({dn})</span>
                {dn === 0 && <button className="orm" style={{ width: 18, height: 18, fontSize: 11 }} aria-label={"Delete " + d.name} title={"Delete " + d.name}
                  onClick={() => setConfirm({ kind: "dm", item: d })}>{"✕"}</button>}</span>;
            })}
          </div>}
        </div>;
      })}
    </div>
    <div className="mft"><button className="button button-secondary-outline" style={{ marginLeft: "auto" }} onClick={onClose}>Done</button></div>
    {confirm && <Modal onClose={() => setConfirm(null)} size="sm" label="Confirm delete">
      <ModalHead onClose={() => setConfirm(null)} title={"Delete " + confirm.item.name + "?"} />
      <div className="mbd"><p>No functions use this {confirm.kind === "ra" ? "risk area" : "domain"}. Deleting it removes it from every picker.</p></div>
      <div className="mft"><Busy busyKey="tax" className="button button-danger" onClick={remove}><Icon n="trash" s={15} />Delete</Busy>
        <button className="button button-secondary-outline" onClick={() => setConfirm(null)}>Cancel</button></div>
    </Modal>}
  </Modal>;
}
