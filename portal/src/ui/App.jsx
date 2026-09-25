/* The shell, in the Claude design's look: header, back bar, the screen,
   footer, toast. Routes live in the URL hash so the browser's Back button
   works, a record can be linked to, and the portal can deep-link
   (.../compliance-matrix/#/deadlines, #/functions?q=clery) without any
   Power Pages URL rewriting. */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppCtx, Icon } from "./parts.jsx";
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
  return <div className="page wrap" style={{ paddingTop: 60, paddingBottom: 80, textAlign: "center" }}>
    <span className="cm-spin lg" aria-hidden="true"></span>
    <h2 style={{ margin: "16px 0 6px" }}>Loading the Compliance Matrix</h2>
    <p className="sub">Reading from {store.adapter.label}{store.adapter.name === "sharepoint" ? " through Power Automate. The first load takes a few seconds." : "."}</p>
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
  return <div className="page wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
    <div className="cm-panel" style={{ padding: "36px 28px", maxWidth: 760, margin: "0 auto" }}>
      <Icon n="alert" s={34} style={{ color: "#DC2626" }} />
      <h2 style={{ margin: "12px 0 6px" }}>The matrix could not be loaded</h2>
      <p>{e.message || String(e)}</p>
      {!!hints.length && <ul style={{ margin: "12px 0 0 18px", fontSize: 14, lineHeight: 1.6 }}>{hints.map(h => <li key={h}>{h}</li>)}</ul>}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="button button-primary" onClick={store.retry}>Try again</button>
        <a className="button button-secondary-outline" href="?backend=sample">Preview with sample data</a>
      </div>
    </div>
  </div>;
}

/* Compliance Functions' filters live here, so a breadcrumb, a Home link or
   the site header's search can set them: area and domain are ids */
const blankFilter = { q: "", area: "", domain: "", risk: "", status: "", mine: false, lens: "flat", page: 0 };

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

/* The design's navy footer, carrying the matrix's own navigation, the
   site's pages (its web link set) and where the data comes from. */
function Footer({ go, store, onSearch }) {
  const { cfg, adapter, loadedAt, actions, realAdmin, adminView } = store;
  const L = cfg.links;
  const link = (s, label) => <a key={s} href={"#/" + (PATHS[s] ?? "")} onClick={e => { e.preventDefault(); go(s); }}>{label || s}</a>;
  const site = cfg.siteLinks.filter(l => l.url !== "/" && l.url !== L.siteHome && !isThisPage(l.url));
  return <footer className="ftr">
    <div className="wrap cols">
      <div style={{ minWidth: 230, flex: "1 1 260px" }}>
        <img src={wordmark} alt="Syracuse University" />
        <div className="fh" style={{ marginTop: 16 }}>Compliance and Enterprise Risk Management</div>
        <button className="ftr-find" onClick={onSearch}><Icon n="search" s={15} sw={2} />Search the matrix<kbd>Ctrl K</kbd></button>
      </div>
      <div><div className="fh">Browse</div>
        {link("Functions", "Compliance Functions")}{link("Deadlines")}{link("Directory")}{link("Executive Team")}{link("Definitions")}</div>
      <div><div className="fh">Risk and Reporting</div>
        {link("Gap Tracker")}{adminView && link("Risk Dashboard")}{adminView && link("Reporting")}{realAdmin && link("Flagged Items")}</div>
      {cfg.siteLinks.length > 0 && <div><div className="fh">This site</div>
        <a href={L.siteHome}>Home</a>
        {site.map(l => <a key={l.url} href={l.url} target={l.ext ? "_blank" : undefined} rel={l.ext ? "noopener" : undefined}>{l.name}</a>)}</div>}
      <div><div className="fh">Resources</div>
        <a href={L.complianceHome} target="_blank" rel="noopener">Compliance Home Page</a>
        <a href={L.policies} target="_blank" rel="noopener">University Policies</a>
        <a href={L.reportConcern} target="_blank" rel="noopener">Report a Concern</a>
        <a href={L.powerBi} target="_blank" rel="noopener">Power BI Reports</a></div>
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#7286B4", maxWidth: "30ch" }}>
        {cfg.backend === "sample"
          ? "Preview with sample records. Nothing you change here is saved."
          : <>Live data from {adapter.label}.<br />Loaded {ago(loadedAt)}. <a href="#" style={{ display: "inline", color: "#AFC0E4" }} onClick={e => { e.preventDefault(); actions.refresh(); }}>Refresh</a></>}
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
      if (r.q != null) setFilter(f => ({ ...blankFilter, lens: f.lens, q: r.q }));
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
    if (screen === "Functions") setFilter(f => ({ ...blankFilter, q: opts.q ?? "", lens: opts.lens || f.lens, ...(opts.filter || {}) }));
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
      : <div className="page wrap"><div className="cm-panel" style={{ padding: "40px 24px", textAlign: "center" }}>
        <h2>That function is not in the matrix</h2>
        <p className="sub" style={{ marginTop: 6 }}>It may have been deleted, or the link is from another environment.</p>
        <button className="button button-secondary" style={{ marginTop: 16 }} onClick={() => go("Functions")}>Browse functions</button></div></div>;
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
  const section = SECTION(screen);
  const openPalette = () => setPalette(true);
  return <AppCtx.Provider value={ctx}>
    <Header screen={isFn ? "Functions" : screen} go={go} onSearch={openPalette} />
    {ds && !isHome && !isFn && <div className="backbar"><div className="wrap">
      <button className="backbtn" onClick={back}><Icon n="arrow-right" s={14} style={{ transform: "rotate(180deg)" }} />Back</button>
      {section && <span className="sub">{section} /</span>}
      <span className="sub">{TITLE[s] || TITLE[screen] || screen}</span>
    </div></div>}
    <div id="cm-main" key={window.location.hash} className="screen">{body}</div>
    {ds && <Footer go={go} store={store} onSearch={openPalette} />}
    {palette && ds && <Palette onClose={() => setPalette(false)} />}
    {topBtn && <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"><Icon n="up" s={18} sw={2.2} /></button>}
    {toast && <div className={"cm-toast" + (toast.tone === "error" ? " err" : "")} role="status" aria-live="polite">{toast.msg}</div>}
  </AppCtx.Provider>;
}
