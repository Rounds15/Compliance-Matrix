/* The shell: routing, header, toast. Routes live in the URL hash so the
   browser's Back button works, a record can be linked to, and the portal home
   page can deep-link (.../compliance-matrix/#/deadlines) without any Power
   Pages URL rewriting. There is no footer: the app has none. */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppCtx, Icon, Strip } from "./parts.jsx";
import { Header, BROWSE, RISK } from "./Header.jsx";
import { Palette } from "./Palette.jsx";
import wordmark from "../assets/wordmark-knockout.svg";
import { Home } from "./Home.jsx";
import { Definitions } from "./Definitions.jsx";
import { Functions } from "./Functions.jsx";
import { FunctionDetail } from "./FunctionDetail.jsx";
import { Deadlines } from "./Deadlines.jsx";
import { Directory } from "./Directory.jsx";
import { ExecutiveTeam } from "./ExecutiveTeam.jsx";
import { GapTracker } from "./GapTracker.jsx";
import { RiskDashboard } from "./RiskDashboard.jsx";
import { Reporting } from "./Reporting.jsx";
import { Flags } from "./Flags.jsx";
import { NoAccess } from "./NoAccess.jsx";

const PATHS = {
  Home: "", Definitions: "definitions", Functions: "functions", Deadlines: "deadlines", Directory: "directory",
  "Executive Team": "executives", "Gap Tracker": "gaps", "Risk Dashboard": "risk", Reporting: "reporting", "Flagged Items": "flags"
};
const SCREEN_OF = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [v, k]));

export function parseHash(hash) {
  const h = String(hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  const qs = new URLSearchParams(query);
  if (parts[0] === "functions" && parts[1]) {
    return parts[1] === "new" ? { screen: "Functions", fnNew: true } : { screen: "Functions", fnId: decodeURIComponent(parts[1]) };
  }
  /* ?q= on functions is the site header's search landing here */
  return { screen: SCREEN_OF[parts[0] || ""] || "Home", person: qs.get("person"), q: parts[0] === "functions" ? qs.get("q") : null };
}

export function buildHash({ screen, fnId, fnNew, person }) {
  if (fnNew) return "#/functions/new";
  if (fnId != null) return "#/functions/" + encodeURIComponent(fnId);
  return "#/" + (PATHS[screen] ?? "") + (person != null ? "?person=" + encodeURIComponent(person) : "");
}

function Loading({ store }) {
  return <div className="state wrap">
    <span className="spin lg" aria-hidden="true"></span>
    <h2>Loading the Compliance Matrix</h2>
    <p className="muted">Reading from {store.adapter.label}{store.adapter.name === "sharepoint" ? " through Power Automate. The first load takes a few seconds." : "."}</p>
  </div>;
}

function LoadError({ store }) {
  const e = store.error || {};
  const hints = [];
  if (store.adapter.name === "sharepoint" && !store.adapter.configured) hints.push("The site setting ComplianceMatrix/Flow/Read is empty, so the page has no flow to read the lists through.");
  if (e.status === 401 || e.status === 403) hints.push(store.adapter.name === "dataverse"
    ? "Your web role has no Read table permission on one of the Compliance Matrix tables, or Webapi/<table>/enable is not set."
    : "Your web role is not allowed to run the read flow. In Power Pages Set up, Cloud flows, add the role to the flow.");
  if (e.status === 404) hints.push(store.adapter.name === "dataverse" ? "An entity set name does not exist in this environment. Check /_api/$metadata." : "The flow trigger URL in ComplianceMatrix/Flow/Read does not exist.");
  return <div className="state wrap">
    <div className="card">
      <Icon n="alert" s={34} style={{ color: "#B91C1C" }} />
      <h2>The matrix could not be loaded</h2>
      <p>{e.message || String(e)}</p>
      {!!hints.length && <ul style={{ margin: "12px 0 0 18px", lineHeight: 1.6 }}>{hints.map(h => <li key={h}>{h}</li>)}</ul>}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn primary" onClick={store.retry}>Try again</button>
        <a className="btn" href="?backend=sample">Preview with sample data</a>
      </div>
    </div>
  </div>;
}

const blankFilter = { q: "", area: "", domain: "", risk: "", lens: "", page: 1 };

/* where a screen sits, for the breadcrumb strip */
const SECTION = s => (BROWSE.some(i => i.screen === s) ? "Browse" : RISK.some(i => i.screen === s) ? "Risk and Reporting" : "");
const TITLE = { Functions: "Compliance Functions", Directory: "Compliance Directory", "Risk Dashboard": "Compliance Risk Dashboard", "Flagged Items": "Flagged for Review", NoAccess: "No access" };

const ago = d => {
  if (!d) return "";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 minute ago" : m < 60 ? m + " minutes ago" : "at " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/* a site link that points back at the matrix page itself */
const isThisPage = url => {
  try { return new URL(url, window.location.href).pathname.replace(/\/$/, "") === window.location.pathname.replace(/\/$/, ""); }
  catch (e) { return false; }
};

/* The app has no footer; this one is a second way round the matrix. */
function Footer({ go, store, onSearch }) {
  const { cfg, adapter, loadedAt, actions, realAdmin, adminView } = store;
  const L = cfg.links;
  const link = (s, label) => <button key={s} onClick={() => go(s)}>{label || s}</button>;
  return <footer className="ftr">
    <div className="wrap">
      <div className="ftr-brand">
        <img src={wordmark} alt="Syracuse University" />
        <div className="ftr-unit">Office of Compliance</div>
        <button className="ftr-find" onClick={onSearch}><Icon n="search" s={15} sw={2} />Search the matrix<kbd>Ctrl K</kbd></button>
      </div>
      <div className="ftr-col"><h4>Browse</h4>
        {link("Functions", "Compliance Functions")}{link("Deadlines")}{link("Directory")}{link("Executive Team")}{link("Definitions")}</div>
      <div className="ftr-col"><h4>Risk and Reporting</h4>
        {link("Gap Tracker")}{adminView && link("Risk Dashboard")}{adminView && link("Reporting")}{realAdmin && link("Flagged Items")}</div>
      {cfg.siteLinks.length > 0 && <div className="ftr-col"><h4>This site</h4>
        <a href={L.siteHome}>Home</a>
        {cfg.siteLinks.filter(l => l.url !== "/" && l.url !== L.siteHome && !isThisPage(l.url)).map(l =>
          <a key={l.url} href={l.url} target={l.ext ? "_blank" : undefined} rel={l.ext ? "noopener" : undefined}>{l.name}</a>)}</div>}
      <div className="ftr-col"><h4>Resources</h4>
        <a href={L.complianceHome} target="_blank" rel="noopener">Compliance Home Page</a>
        <a href={L.policies} target="_blank" rel="noopener">Policies</a>
        <a href={L.reportConcern} target="_blank" rel="noopener">Report a Concern</a></div>
      <div className="ftr-meta">
        {cfg.backend === "sample"
          ? "Preview with sample records. Nothing you change here is saved."
          : <>Live data from {adapter.label}. Loaded {ago(loadedAt)}. <button onClick={() => actions.refresh()}>Refresh</button></>}
      </div>
    </div>
  </footer>;
}

export function App({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [depth, setDepth] = useState(0);
  const [filter, setFilter] = useState(() => (route.q ? { ...blankFilter, q: route.q } : blankFilter));
  const [palette, setPalette] = useState(false);
  const [topBtn, setTopBtn] = useState(false);

  /* Ctrl K, Cmd K, or "/" outside a text box opens the quick jump */
  useEffect(() => {
    const k = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setPalette(p => !p); }
      else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setPalette(true); }
    };
    const sc = () => setTopBtn(window.scrollY > 900);
    document.addEventListener("keydown", k);
    window.addEventListener("scroll", sc, { passive: true });
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("scroll", sc); };
  }, []);

  useEffect(() => {
    const h = () => {
      const r = parseHash(window.location.hash);
      if (r.q != null) setFilter({ ...blankFilter, q: r.q });
      setRoute(r); window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const nav = useCallback(r => {
    const next = buildHash(r);
    if (next === window.location.hash || (next === "#/" && !window.location.hash)) return;
    setDepth(d => d + 1);
    window.location.hash = next;
  }, []);
  /* go(screen, opts): opts.filter narrows Compliance Functions, opts.person
     opens a Directory drawer */
  const go = useCallback((screen, opts = {}) => {
    if (screen === "Functions") setFilter(f => ({ ...blankFilter, q: opts.q ?? f.q, lens: f.lens, ...(opts.filter || {}) }));
    nav({ screen, person: opts.person });
  }, [nav]);
  const openFn = useCallback(f => nav({ fnId: f.id }), [nav]);
  const newFn = useCallback(() => nav({ fnNew: true }), [nav]);
  const back = () => {
    if (depth > 0) { setDepth(d => d - 1); window.history.back(); }
    else go("Home");
  };

  const { ds, status, adminView, realAdmin } = store;
  const ctx = useMemo(() => ({ ...store, go, openFn, newFn, back }), [store, go, openFn, newFn]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Access. Flagged Items is for administrators (App.OnStart GoTo). Risk
     Dashboard and Reporting are shown to administrators in Admin view, as the
     Home card routes them; whether everyone may open them is an open
     question (parity spec section 4.1), so they stay restricted until it is
     answered. Creating a function is an administrator action. */
  const screen = route.screen;
  let s = screen;
  if (screen === "Flagged Items" && !realAdmin) s = "NoAccess";
  if ((screen === "Risk Dashboard" || screen === "Reporting") && !adminView) s = "NoAccess";

  let body;
  if (status === "loading" || !ds) body = status === "error" ? <LoadError store={store} /> : <Loading store={store} />;
  else if (route.fnNew) body = realAdmin ? <FunctionDetail isNew key="new" /> : <NoAccess />;
  else if (route.fnId != null) {
    const fn = ds.fnById.get(String(route.fnId));
    body = fn ? <FunctionDetail f={fn} key={String(fn.id)} />
      : <div className="state wrap"><div className="card">
        <h2>That function is not in the matrix</h2>
        <p className="muted" style={{ marginTop: 6 }}>It may have been deleted, or the link is from another environment.</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => go("Functions")}>{"< All functions"}</button></div></div>;
  } else body = <>
    {s === "Home" && <Home />}
    {s === "Definitions" && <Definitions />}
    {s === "Functions" && <Functions filter={filter} setFilter={setFilter} />}
    {s === "Deadlines" && <Deadlines />}
    {s === "Directory" && <Directory personId={route.person} />}
    {s === "Executive Team" && <ExecutiveTeam />}
    {s === "Gap Tracker" && <GapTracker />}
    {s === "Risk Dashboard" && <RiskDashboard />}
    {s === "Reporting" && <Reporting />}
    {s === "Flagged Items" && <Flags />}
    {s === "NoAccess" && <NoAccess />}
  </>;

  const toast = store.toast;
  const isHome = !route.fnNew && route.fnId == null && screen === "Home";
  const isFn = route.fnNew || route.fnId != null;
  /* Function Detail draws its own strip, with Previous and Next record */
  const crumbs = [
    ...(SECTION(screen) ? [{ label: SECTION(screen) }] : []),
    { label: TITLE[s] || TITLE[screen] || screen }
  ];
  const openPalette = () => setPalette(true);
  return <AppCtx.Provider value={ctx}>
    <Header screen={isFn ? "Functions" : screen} go={go} onSearch={openPalette} />
    {ds && !isHome && !isFn && <Strip crumbs={crumbs} />}
    <div id="cm-main" key={window.location.hash} className="screen">{body}</div>
    {ds && <Footer go={go} store={store} onSearch={openPalette} />}
    {palette && ds && <Palette onClose={() => setPalette(false)} />}
    {topBtn && <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"><Icon n="up" s={18} sw={2.2} /></button>}
    {toast && <div className={"toast" + (toast.tone === "error" ? " err" : "")} role="status" aria-live="polite">{toast.msg}</div>}
  </AppCtx.Provider>;
}
