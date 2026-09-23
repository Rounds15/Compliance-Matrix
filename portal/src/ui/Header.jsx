import React, { useEffect, useRef, useState } from "react";
import { Icon, useApp } from "./parts.jsx";
import blockS from "../assets/block-s.png";

export const ADMIN_SCREENS = ["Gap Tracker", "Risk Dashboard", "Reporting", "Flagged Items"];

function Dropdown({ label, icon, items, active, go, badge }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const on = items.some(i => i[0] === active);
  return <div ref={ref} style={{ position: "relative" }}>
    <button className={"navbtn" + (on ? " on" : "")} onClick={() => setOpen(!open)} aria-expanded={open}>
      <Icon n={icon} />{label}<Icon n="chev" s={13} sw={2.2} style={{ opacity: .65 }} />
    </button>
    {open && <div className="menu">{items.map(([n, ic, sub]) =>
      <button key={n} className="mi" onClick={() => { go(n); setOpen(false); }}>
        <Icon n={ic} /><span>{n}{badge && badge[n] ? <span className="gapbadge" style={{ marginLeft: 8 }}>{badge[n]}</span> : null}<span className="mi-sub">{sub}</span></span>
      </button>)}</div>}
  </div>;
}

/* "Viewing as": administrators can see the page as any person in the
   directory would, without admin rights. Everyone else sees who they are
   signed in as. */
function ViewAs() {
  const { cfg, ds, viewAs, setViewAs, realAdmin } = useApp();
  if (!ds) return null;
  if (!realAdmin) return <span className="util-role">Signed in as {ds.me.n}</span>;
  const presets = cfg.viewPresets.map(p => ({ ...p, person: ds.people.find(x => x.e.toLowerCase() === p.email) })).filter(p => p.person);
  const value = viewAs.mode === "self" ? "self" : "p:" + viewAs.personId;
  const onChange = e => {
    const v = e.target.value;
    setViewAs(v === "self" ? { mode: "self" } : { mode: "person", personId: v.slice(2) });
  };
  return <label className="util-role">Viewing as
    <select value={value} onChange={onChange} title="Preview the page as someone else would see it. Changes you make are still saved as you.">
      <option value="self">Administrator</option>
      {presets.length
        ? presets.map(p => <option key={p.person.id} value={"p:" + p.person.id}>{p.label}</option>)
        : <optgroup label="A person in the directory">
          {ds.people.map(p => <option key={p.id} value={"p:" + p.id}>{p.n}</option>)}
        </optgroup>}
    </select></label>;
}

export function Header({ screen, go }) {
  const { ds, adminView, cfg } = useApp();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [screen]);
  const openGaps = ds ? ds.gaps.filter(g => g.open).length : 0;
  const openFlags = ds ? ds.flags.length : 0;
  const BROWSE = [
    ["Functions", "list", "Risk areas, domains and all " + (ds ? ds.fns.length : "") + " functions"],
    ["Deadlines", "calendar", "Upcoming and recurring due dates"],
    ["Directory", "users", "Owners, titles, units, contacts"]
  ];
  const ADMIN_NAV = [
    ["Gap Tracker", "alert", "Open gaps and closure workflow"],
    ["Flagged Items", "flag", "Functions flagged for compliance review"],
    ["Risk Dashboard", "chart", "Heat map and risk rollups"],
    ["Reporting", "shield", "Power BI datasets and exports"]
  ];
  const badge = { "Gap Tracker": openGaps, "Flagged Items": openFlags };
  const L = cfg.links;
  return <>
    <div className="util">
      <div className="util-in">
        <a href={L.syracuse} target="_blank" rel="noopener">Syracuse.edu</a>
        <a href={L.policies} target="_blank" rel="noopener">Policies</a>
        <a className="sp" href={L.reportConcern} target={/^https?:/.test(L.reportConcern) ? "_blank" : undefined} rel="noopener">Report a Concern</a>
        {cfg.backend !== "sample" && <a href={L.home}>Portal home</a>}
        <ViewAs />
        {cfg.backend !== "sample" && <a href={L.signOut}>Sign out</a>}
      </div>
    </div>
    <header className="hdr">
      <div className="hdr-in">
        <button className="lockup" onClick={() => go("Home")} title="Home">
          <img className="block-s" src={blockS} alt="" aria-hidden="true" />
          <span><span className="app">Syracuse University</span><span className="unit">Compliance Matrix</span></span>
        </button>
        <nav className="cm-nav">
          <button className={"navbtn" + (screen === "Home" ? " on" : "")} onClick={() => go("Home")}><Icon n="home" />Home</button>
          <button className={"navbtn" + (screen === "Definitions" ? " on" : "")} onClick={() => go("Definitions")}><Icon n="book" />Definitions</button>
          <Dropdown label="Browse" icon="grid" items={BROWSE} active={screen} go={go} />
          {adminView && <Dropdown label="Risk and Reporting" icon="chart" items={ADMIN_NAV} active={screen} go={go} badge={badge} />}
          <button className={"navbtn" + (screen === "Executive Team" ? " on" : "")} onClick={() => go("Executive Team")}><Icon n="users" />Executive Team</button>
        </nav>
        <div className="hdr-right">
          <button className="hamb" onClick={() => setDrawer(!drawer)} aria-label="Menu"><Icon n={drawer ? "chev" : "menu"} s={20} /></button>
        </div>
      </div>
    </header>
    {drawer && <div className="drawer">
      <button className="di" onClick={() => go("Home")}><Icon n="home" s={20} />Home</button>
      <button className="di" onClick={() => go("Definitions")}><Icon n="book" s={20} />Definitions</button>
      <button className="di" onClick={() => go("Executive Team")}><Icon n="users" s={20} />Executive Team</button>
      <div className="dgrp">Browse</div>
      {BROWSE.map(([n, ic]) => <button key={n} className="di" onClick={() => go(n)}><Icon n={ic} s={20} />{n}</button>)}
      {adminView && <><div className="dgrp">Risk and Reporting</div>
        {ADMIN_NAV.map(([n, ic]) => <button key={n} className="di" onClick={() => go(n)}><Icon n={ic} s={20} />{n}{badge[n] ? <span className="gapbadge" style={{ marginLeft: 6 }}>{badge[n]}</span> : null}</button>)}</>}
    </div>}
  </>;
}
