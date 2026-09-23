import React, { useState } from "react";
import { Icon, Avatar, Risk, PageHead, Field, Stat, Modal, Empty, useApp } from "./parts.jsx";
import { samePerson } from "../data/model.js";
import { isSevere } from "../lib/risk.js";

/* Executive owners are derived, not listed: anyone holding the Executive
   Owner role on at least one function (the canvas app's colExecNames). */
export function ExecutiveTeam({ openFn }) {
  const { ds } = useApp();
  const [sel, setSel] = useState(null);
  const execs = ds.executives;
  const port = p => ds.fns.filter(f => f.chain.exec.some(r => samePerson(r.person, p)));
  return <div className="page wrap">
    <PageHead eyebrow="Portfolio view" title="Executive Team"
      sub="Executive owners sit at the top of every ownership chain. Sorted by last name; initials are shown where no photo exists." />
    {!execs.length && <Empty title="No executive owners yet" sub="Assign an Executive Owner on a function's ownership chain and they appear here." />}
    <div className="cm-grid g-card">{execs.map(p => {
      const fs = port(p); const hot = fs.filter(f => isSevere(f.risk)).length;
      return <button key={p.id} className="tcard" onClick={() => setSel(p)}>
        <div className="bar"></div>
        <div className="bd" style={{ alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", width: 276, height: 104 }}>
            <Avatar person={p} size={54} />
            <div style={{ minWidth: 0, width: 202, height: 95 }}><h3>{p.n}</h3>
              <div style={{ fontSize: 12, color: "#5b6373", marginTop: 3, lineHeight: 1.35, width: 203, height: 35 }}>{p.t || p.e}</div>
              <span className="sub" style={{ width: 155, height: 40, fontSize: 11 }}>{p.u}</span></div></div>
          <div className="ft" style={{ width: 276, height: 31 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {hot > 0 && <span className="risk Critical" style={{ width: 49, height: 30 }} title={hot + " high or critical"}><span className="dot"></span>{hot}</span>}</div>
            <span className="chip">{fs.length} in portfolio</span></div></div></button>;
    })}
    </div>
    {sel && <Modal onClose={() => setSel(null)}>
      <div className="mhd"><Avatar person={sel} size={52} />
        <div><div className="eyebrow" style={{ color: "#FF8E00" }}>Executive Owner</div>
          <h2 style={{ marginTop: 4 }}>{sel.n}</h2>
          <div style={{ fontSize: 13, color: "#C3CCE4", marginTop: 4 }}>{sel.t || sel.e}</div></div>
        <button className="cl" onClick={() => setSel(null)} aria-label="Close">✕</button></div>
      <div className="mbd">
        <div className="cm-grid g-stat" style={{ marginBottom: 20 }}>
          <Stat n={port(sel).length} l="Functions" s="In this portfolio" />
          <Stat n={port(sel).filter(f => isSevere(f.risk)).length} l="Critical or high" tone="bad" />
          <Stat n={[...new Set(port(sel).map(f => f.topic))].length} l="Risk areas touched" />
        </div>
        <Field label="Portfolio">
          {port(sel).map(f => <button key={f.id} className="srow" style={{ border: "1px solid #E2E5EA", borderRadius: 4, marginBottom: 6 }} onClick={() => { setSel(null); openFn(f); }}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname" style={{ fontSize: 13.5 }}>{f.name}</div>
              <div className="sub">{f.area} · {f.owner.n}</div></div><Risk r={f.risk} /></button>)}
        </Field></div>
      <div className="mft">{sel.e && <a className="button button-primary" href={"mailto:" + sel.e}><Icon n="mail" s={15} />Email</a>}
        <button className="button button-secondary-outline" onClick={() => setSel(null)}>Close</button></div>
    </Modal>}
  </div>;
}
