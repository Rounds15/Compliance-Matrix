/* The app's header, identical on every screen: a 30px Navy utility bar and a
   72px white main bar (Home.pa.yaml, Header Container). */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, useApp } from "./parts.jsx";
import { functionsFor } from "../data/model.js";
import blockS from "../assets/block-s.png";

export const BROWSE = [
  { screen: "Functions", title: "Compliance Functions", desc: "Every obligation, filter by risk area or domain", icon: "dots" },
  { screen: "Deadlines", title: "Deadlines", desc: "Upcoming and recurring due dates", icon: "calendar" },
  { screen: "Directory", title: "Directory", desc: "Owners, titles, units, contacts", icon: "users" }
];
export const RISK = [
  { screen: "Gap Tracker", title: "Gap Tracker", desc: "Open gaps and closure workflow", icon: "warning" },
  { screen: "Risk Dashboard", title: "Risk Dashboard", desc: "Heat map and risk rollups", icon: "info" },
  { screen: "Reporting", title: "Reporting", desc: "Power BI datasets and exports", icon: "layer" },
  { screen: "Flagged Items", title: "Flagged Items", desc: "Functions flagged for compliance review", icon: "flag" }
];

/* open gaps, scoped like the Gap Tracker: all of them in Admin view,
   otherwise those on the viewer's own functions (App.OnStart gapBadgeCount) */
export function useVisibleGaps() {
  const { ds, adminView, actingPerson } = useApp();
  return useMemo(() => {
    if (!ds) return [];
    if (adminView) return ds.gaps;
    const mine = new Set(functionsFor(actingPerson, ds.fns).map(f => String(f.id)));
    return ds.gaps.filter(g => mine.has(String(g.functionId)));
  }, [ds, adminView, actingPerson]);
}

function ViewPicker({ onPick, onClose }) {
  const { ds } = useApp();
  const [q, setQ] = useState("");
  const input = useRef(null);
  useEffect(() => { if (input.current) input.current.focus(); }, []);
  const t = q.trim().toLowerCase();
  const list = ds.people.filter(p => !t || p.n.toLowerCase().startsWith(t) || p.e.toLowerCase().startsWith(t));
  return <div className="vpick" role="dialog" aria-label="View as user">
    <div className="vpick-hd"><h2>View as user</h2><button onClick={onClose}>Close</button></div>
    <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email..." aria-label="Search name or email" />
    <ul>{list.map(p => <li key={p.id}><button onClick={() => onPick(p)}>
      <span className="n">{p.n}</span><span className="e">{p.e}</span></button></li>)}</ul>
  </div>;
}

function Menu({ items, go, badges }) {
  return <div className="menu" role="menu">
    {items.map(i => <button key={i.screen} role="menuitem" onClick={() => go(i.screen)}>
      <Icon n={i.icon} /><span className="t">{i.title}</span>
      {badges && badges[i.screen] > 0 ? <span className="badge">{badges[i.screen]}</span> : null}
      <span className="d">{i.desc}</span>
    </button>)}
  </div>;
}

export function Header({ screen, go, canBack, onBack }) {
  const { ds, cfg, realAdmin, viewAs, setViewAs, actingPerson } = useApp();
  const [open, setOpen] = useState(""); // "" | Browse | Risk | view | pick
  const [mobile, setMobile] = useState(false);
  const root = useRef(null);
  const L = cfg.links;

  /* clicking anywhere outside an open menu closes it */
  useEffect(() => {
    const h = e => { if (!e.target.closest || !e.target.closest("[data-menu]")) { setOpen(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { setOpen(""); setMobile(false); }, [screen]);

  const gaps = useVisibleGaps();
  const openGaps = gaps.filter(g => g.open).length;
  const nav = s => { setOpen(""); setMobile(false); go(s); };
  const toggle = k => setOpen(o => (o === k ? "" : k));
  const mode = viewAs.mode === "AsUser" ? actingPerson.n : viewAs.mode;
  const pickMode = m => { setViewAs({ mode: m }); setOpen(""); };

  return <div ref={root}>
    <div className="util">
      <div className="wrap">
        <div className="util-left">
          <a href={L.complianceHome} target="_blank" rel="noopener">Compliance Home Page</a>
          <a href={L.policies} target="_blank" rel="noopener">Policies</a>
          <button onClick={() => nav("Definitions")}>Definitions</button>
        </div>
        <div className="util-right" data-menu>
          {realAdmin && ds && <button className="viewbtn" onClick={() => toggle("view")} aria-expanded={open === "view"} aria-haspopup="menu">View: {mode} {"▾"}</button>}
          <a href={L.reportConcern} target="_blank" rel="noopener">Report a Concern</a>
          {open === "view" && <div className="vmenu" role="menu">
            <button role="menuitem" className={viewAs.mode === "Admin" ? "on" : ""} onClick={() => pickMode("Admin")}>Admin view</button>
            <button role="menuitem" className={viewAs.mode === "User" ? "on" : ""} onClick={() => pickMode("User")}>User view</button>
            <button role="menuitem" className={viewAs.mode === "AsUser" ? "on" : ""} onClick={() => setOpen("pick")}>View as specific user...</button>
          </div>}
          {open === "pick" && <ViewPicker onClose={() => setOpen("")} onPick={p => { setViewAs({ mode: "AsUser", personId: p.id }); setOpen(""); }} />}
        </div>
      </div>
    </div>
    <header className="hdr">
      <div className="wrap">
        {canBack && <button className="backbtn" onClick={onBack}>{"←"} Back</button>}
        <button className="lockup" onClick={() => nav("Home")} aria-label="Compliance Matrix home">
          <img src={blockS} alt="" />
          <span><span className="u">Syracuse University</span><span className="a">Compliance Matrix</span></span>
        </button>
        <button className="hamb" onClick={() => setMobile(m => !m)} aria-expanded={mobile} aria-label="Menu"><Icon n="menu" s={20} /></button>
        <nav className={"nav" + (mobile ? " open" : "")} aria-label="Compliance Matrix">
          <div className="navitem">
            <button className={"navbtn" + (screen === "Home" ? " on" : "")} onClick={() => nav("Home")}><Icon n="home" />Home</button>
          </div>
          <div className="navitem" data-menu>
            <button className={"navbtn" + (open === "Browse" ? " on" : "")} onClick={() => toggle("Browse")} aria-expanded={open === "Browse"} aria-haspopup="menu"><Icon n="grid" />Browse</button>
            {open === "Browse" && <Menu items={BROWSE} go={nav} />}
          </div>
          <div className="navitem" data-menu>
            <button className={"navbtn" + (open === "Risk" ? " on" : "")} onClick={() => toggle("Risk")} aria-expanded={open === "Risk"} aria-haspopup="menu"><Icon n="chart" />Risk and Reporting</button>
            {open === "Risk" && <Menu items={RISK} go={nav} badges={{ "Gap Tracker": openGaps }} />}
          </div>
          <div className="navitem">
            <button className={"navbtn" + (screen === "Executive Team" ? " on" : "")} onClick={() => nav("Executive Team")}><Icon n="users" />Executive Team</button>
          </div>
        </nav>
      </div>
    </header>
  </div>;
}
