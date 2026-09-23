/* The shell: routing, header, footer, toast. Routes live in the URL hash so the
   browser's Back button works, a record can be linked to, and the portal home
   page can deep-link (…/compliance-matrix/#/deadlines) without any Power Pages
   URL rewriting. */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppCtx, Icon } from "./parts.jsx";
import { Header, ADMIN_SCREENS } from "./Header.jsx";
import { Home } from "./Home.jsx";
import { Explore } from "./Explore.jsx";
import { Definitions } from "./Definitions.jsx";
import { Deadlines } from "./Deadlines.jsx";
import { Directory } from "./Directory.jsx";
import { ExecutiveTeam } from "./ExecutiveTeam.jsx";
import { GapTracker, RiskDashboard, Reporting, NoAccess } from "./Risk.jsx";
import { FunctionDetailScreen, blankFunction } from "./FunctionDetail.jsx";
import { visibleDeadlines } from "../data/model.js";
import wordmark from "../assets/wordmark-knockout.svg";

const PATHS = {
  Home: "", Definitions: "definitions", Functions: "functions", Deadlines: "deadlines", Directory: "directory",
  "Executive Team": "executives", "Gap Tracker": "gaps", "Flagged Items": "flags", "Risk Dashboard": "risk", Reporting: "reporting"
};
const SCREEN_OF = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [v, k]));
const LENS_OK = ["flat", "topic", "area", "statute"];

export function parseHash(hash) {
  const h = String(hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  const qs = new URLSearchParams(query);
  if (parts[0] === "functions" && parts[1]) {
    return parts[1] === "new" ? { screen: "Functions", fnNew: true } : { screen: "Functions", fnId: decodeURIComponent(parts[1]) };
  }
  const screen = SCREEN_OF[parts[0] || ""] || "Home";
  const lens = qs.get("lens");
  return { screen, lens: LENS_OK.includes(lens) ? lens : null };
}

export function buildHash({ screen, lens, fnId, fnNew }) {
  if (fnNew) return "#/functions/new";
  if (fnId != null) return "#/functions/" + encodeURIComponent(fnId);
  const p = PATHS[screen] ?? "";
  return "#/" + p + (lens && screen === "Functions" ? "?lens=" + lens : "");
}

const ago = d => {
  if (!d) return "";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 minute ago" : m < 60 ? m + " minutes ago" : "at " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function Footer({ go }) {
  const { cfg, adapter, loadedAt, actions, ds } = { ...React.useContext(AppCtx) };
  const L = cfg.links;
  return <footer className="ftr">
    <div className="wrap cols">
      <div style={{ minWidth: 230, flex: "1 1 260px" }}>
        <img src={wordmark} alt="Syracuse University" />
        <div className="fh" style={{ marginTop: 16 }}>Compliance and Enterprise Risk Management</div>
      </div>
      <div><div className="fh">Browse</div>
        {["Definitions", "Functions", "Deadlines", "Directory"].map(x => <a key={x} href={buildHash({ screen: x })} onClick={e => { e.preventDefault(); go(x); }}>{x}</a>)}</div>
      <div><div className="fh">Resources</div>
        <a href={L.policies} target="_blank" rel="noopener">University Policies</a>
        <a href={L.reportConcern} target={/^https?:/.test(L.reportConcern) ? "_blank" : undefined} rel="noopener">Report a Concern</a>
        <a href={L.powerBi} target="_blank" rel="noopener">Power BI Reports</a>
        {L.powerApp && <a href={L.powerApp} target="_blank" rel="noopener">Open in Power Apps</a>}</div>
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#7286B4", maxWidth: "30ch" }}>
        {cfg.backend === "sample"
          ? "Preview with sample data from the design prototype. Nothing you change here is saved."
          : <>Live data from {adapter.label}{ds ? " · " + ds.fns.length + " functions" : ""}.<br />Loaded {ago(loadedAt)}. <a href="#" style={{ display: "inline", color: "#AFC0E4" }} onClick={e => { e.preventDefault(); actions.refresh(); }}>Refresh</a></>}
      </div>
    </div>
  </footer>;
}

function Loading({ store }) {
  return <div className="page wrap" style={{ paddingTop: 60, paddingBottom: 80, textAlign: "center" }}>
    <span className="cm-spin lg" aria-hidden="true"></span>
    <h2 style={{ fontFamily: "var(--font-display)", color: "#000E54", margin: "16px 0 6px" }}>Loading the Compliance Matrix</h2>
    <p className="sub">Reading from {store.adapter.label}{store.adapter.name === "sharepoint" ? " through Power Automate. The first load takes a few seconds." : "."}</p>
  </div>;
}

function LoadError({ store }) {
  const e = store.error || {};
  const hints = [];
  if (store.adapter.name === "sharepoint" && !store.adapter.configured) hints.push("The site setting ComplianceMatrix/Flow/Read is empty, so the page has no flow to read the lists through.");
  if (e.status === 401 || e.status === 403) hints.push(store.adapter.name === "dataverse"
    ? "Your web role has no Read table permission on one of the Compliance Matrix tables, or Webapi/<table>/enable is not set."
    : "Your web role is not allowed to run the read flow. In Power Pages Set up › Cloud flows, add the role to the flow.");
  if (e.status === 404) hints.push(store.adapter.name === "dataverse" ? "An entity set name does not exist in this environment. Check /_api/$metadata." : "The flow trigger URL in ComplianceMatrix/Flow/Read does not exist.");
  return <div className="page wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
    <div className="cm-panel" style={{ padding: "36px 28px", maxWidth: 760, margin: "0 auto" }}>
      <Icon n="alert" s={34} style={{ color: "#DC2626" }} />
      <h2 style={{ fontFamily: "var(--font-display)", color: "#000E54", margin: "12px 0 6px" }}>The matrix could not be loaded</h2>
      <p>{e.message || String(e)}</p>
      {!!hints.length && <ul style={{ margin: "12px 0 0 18px", fontSize: 14, lineHeight: 1.6 }}>{hints.map(h => <li key={h}>{h}</li>)}</ul>}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="button button-primary" onClick={store.retry}>Try again</button>
        <a className="button button-secondary-outline" href="?backend=sample">Preview with sample data</a>
      </div>
    </div>
  </div>;
}

export function App({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [depth, setDepth] = useState(0);
  const [filter, setFilter] = useState({ q: "", topic: "All", risk: "All" });
  const [lens, setLens] = useState(route.lens || "flat");

  useEffect(() => {
    const h = () => { const r = parseHash(window.location.hash); setRoute(r); if (r.lens) setLens(r.lens); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const nav = useCallback(r => {
    const next = buildHash(r);
    if (next === window.location.hash) return;
    setDepth(d => d + 1);
    window.location.hash = next;
  }, []);
  const go = useCallback((screen, l) => { if (l) setLens(l); nav({ screen, lens: l }); }, [nav]);
  const openFn = useCallback(f => nav({ fnId: f.id }), [nav]);
  const back = () => { setDepth(d => Math.max(0, d - 1)); window.history.back(); };

  const { ds, status, adminView, actingPerson } = store;
  const deadlines = useMemo(() => ds ? visibleDeadlines(ds, actingPerson, adminView) : [], [ds, actingPerson, adminView]);
  const ctx = useMemo(() => ({ ...store }), [store]);

  const screen = route.screen;
  const s = ADMIN_SCREENS.includes(screen) && !adminView ? "NoAccess" : screen;
  const fn = ds && route.fnId != null ? ds.fnById.get(String(route.fnId)) : null;
  const fnIdx = fn ? ds.fns.indexOf(fn) : -1;
  const draft = useMemo(() => blankFunction(), [route.fnNew]); // eslint-disable-line react-hooks/exhaustive-deps

  let body = null;
  if (status === "loading" || !ds) body = status === "error" ? <LoadError store={store} /> : <Loading store={store} />;
  else if (route.fnNew) body = adminView
    ? <FunctionDetailScreen f={draft} isNew go={go} onBack={() => go("Functions")} onJump={openFn} onCreated={id => { window.location.replace(buildHash({ fnId: id })); }} />
    : <NoAccess go={go} />;
  else if (route.fnId != null) body = fn
    ? <FunctionDetailScreen f={fn} go={go} onBack={() => go("Functions")}
      prev={fnIdx > 0 ? ds.fns[fnIdx - 1] : null} next={fnIdx >= 0 && fnIdx < ds.fns.length - 1 ? ds.fns[fnIdx + 1] : null} onJump={openFn} />
    : <div className="page wrap"><div className="cm-panel" style={{ padding: "40px 24px", textAlign: "center" }}>
      <h2 style={{ fontFamily: "var(--font-display)", color: "#000E54" }}>That function is not in the matrix</h2>
      <p className="sub" style={{ marginTop: 6 }}>It may have been deleted, or the link is from another environment.</p>
      <button className="button button-secondary" style={{ marginTop: 16 }} onClick={() => go("Functions")}>Browse functions</button></div></div>;
  else body = <>
    {s === "Home" && <Home go={go} openFn={openFn} filter={filter} setFilter={setFilter} deadlines={deadlines} />}
    {s === "Functions" && <Explore openFn={openFn} filter={filter} setFilter={setFilter} lens={lens} setLens={l => { setLens(l); window.history.replaceState(null, "", buildHash({ screen: "Functions", lens: l })); }} onNew={() => nav({ fnNew: true })} />}
    {s === "Definitions" && <Definitions go={go} />}
    {s === "Deadlines" && <Deadlines deadlines={deadlines} openFn={openFn} />}
    {s === "Directory" && <Directory openFn={openFn} />}
    {s === "Executive Team" && <ExecutiveTeam openFn={openFn} />}
    {s === "Gap Tracker" && <GapTracker openFn={openFn} />}
    {s === "Flagged Items" && <GapTracker openFn={openFn} initialTab="flags" key="flags" />}
    {s === "Risk Dashboard" && <RiskDashboard openFn={openFn} deadlines={deadlines} />}
    {s === "Reporting" && <Reporting deadlines={deadlines} />}
    {s === "NoAccess" && <NoAccess go={go} />}
  </>;

  const toast = store.toast;
  return <AppCtx.Provider value={ctx}>
    <Header screen={route.fnId != null || route.fnNew ? "Functions" : screen} go={go} />
    {depth > 0 && ds && <div className="backbar"><div className="wrap">
      <button onClick={back}><Icon n="arrow-right" s={14} style={{ transform: "rotate(180deg)" }} />Back</button>
      <span className="sub">{fn ? fn.name : route.fnNew ? "New function" : screen}</span>
    </div></div>}
    <div id="cm-main">{body}</div>
    {toast && <div className={"cm-toast" + (toast.tone === "error" ? " err" : "")} role="status" aria-live="polite">{toast.msg}</div>}
    <Footer go={go} />
  </AppCtx.Provider>;
}
