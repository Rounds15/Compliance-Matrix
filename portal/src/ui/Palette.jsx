/* Quick jump: Ctrl K (Cmd K on a Mac) or "/" from anywhere. One box that
   finds a screen, a compliance function (name, statute, citation, ID) or a
   person in the directory, and goes there. Arrow keys move, Enter opens. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Avatar, RiskPill, useApp } from "./parts.jsx";
import { BROWSE, RISK } from "./Header.jsx";

const SCREENS = [
  { screen: "Home", title: "Home", desc: "Your functions, deadlines and figures", icon: "home" },
  ...BROWSE,
  { screen: "Executive Team", title: "Executive Team", desc: "Executive owners and their portfolios", icon: "users" },
  ...RISK,
  { screen: "Definitions", title: "Definitions", desc: "The vocabulary of the matrix", icon: "list" }
];

export function Palette({ onClose }) {
  const { ds, go, openFn, realAdmin, adminView, cfg } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  useEffect(() => { if (input.current) input.current.focus(); document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const has = s => String(s || "").toLowerCase().includes(t);
    /* only offer screens the viewer can open */
    const allowed = s => (s.screen === "Flagged Items" ? realAdmin : s.screen === "Risk Dashboard" || s.screen === "Reporting" ? adminView : true);
    const screens = SCREENS.filter(allowed).filter(s => !t || has(s.title) || has(s.desc))
      .map(s => ({ kind: "Go to", key: "s:" + s.screen, s, run: () => go(s.screen) }));
    /* the rest of the site, from its web link set */
    const here = window.location.pathname.replace(/\/$/, "");
    const site = (cfg.siteLinks || []).filter(l => { try { return new URL(l.url, window.location.href).pathname.replace(/\/$/, "") !== here; } catch (e) { return true; } })
      .filter(l => !t || has(l.name))
      .map(l => ({ kind: "This site", key: "l:" + l.url, l, run: () => { if (l.ext) window.open(l.url, "_blank", "noopener"); else window.location.href = l.url; } }));
    if (!t) return [...screens, ...site];
    const fns = ds.fns.filter(f => has(f.name) || has(f.statute) || has(f.citation) || has(f.code) || has(f.topic) || has(f.area))
      .sort((a, b) => (has(b.name) - has(a.name)) || a.name.localeCompare(b.name)).slice(0, 7)
      .map(f => ({ kind: "Compliance functions", key: "f:" + f.id, f, run: () => openFn(f) }));
    const people = ds.people.filter(p => has(p.n) || has(p.e) || has(p.t) || has(p.u)).slice(0, 5)
      .map(p => ({ kind: "People", key: "p:" + p.id, p, run: () => go("Directory", { person: p.id }) }));
    return [...fns, ...people, ...screens, ...site];
  }, [q, ds, go, openFn, realAdmin, adminView, cfg]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = list.current && list.current.querySelector("[data-sel=true]");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = it => { onClose(); it.run(); };
  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && items[sel]) { e.preventDefault(); run(items[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let last = "";
  return <div className="pal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="pal pop" role="dialog" aria-modal="true" aria-label="Search the matrix">
      <div className="pal-in"><Icon n="search" s={20} />
        <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search a function, statute, citation, or owner..."
          aria-label="Search the matrix" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={items[sel] ? "pal-" + sel : undefined} />
        <kbd>Esc</kbd></div>
      <ul className="pal-list" id="pal-list" role="listbox" ref={list}>
        {items.map((it, i) => {
          const head = it.kind !== last ? <li className="pal-h" role="presentation" key={"h" + it.kind}>{it.kind}</li> : null;
          last = it.kind;
          return <React.Fragment key={it.key}>{head}
            <li id={"pal-" + i} role="option" aria-selected={i === sel} data-sel={i === sel}
              className={"pal-i" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onMouseDown={e => { e.preventDefault(); run(it); }}>
              {it.s && <><span className="pal-ic"><Icon n={it.s.icon} s={18} /></span><span className="grow"><b>{it.s.title}</b><small>{it.s.desc}</small></span></>}
              {it.f && <><span className="pal-ic"><Icon n="dots" s={18} /></span><span className="grow"><b>{it.f.name}</b><small>{it.f.topic} {"·"} {it.f.statute || it.f.area}</small></span><RiskPill r={it.f.risk} /></>}
              {it.l && <><span className="pal-ic"><Icon n="ext" s={16} /></span><span className="grow"><b>{it.l.name}</b><small>{it.l.url}</small></span></>}
              {it.p && <><Avatar person={it.p} size={30} /><span className="grow"><b>{it.p.n}</b><small>{[it.p.t, it.p.u].filter(Boolean).join(" · ") || it.p.e}</small></span></>}
              <Icon n="enter" s={15} style={{ opacity: i === sel ? .6 : 0 }} />
            </li></React.Fragment>;
        })}
        {!items.length && <li className="pal-empty">Nothing matches "{q}".</li>}
      </ul>
      <div className="pal-ft"><span><kbd>{"↑"}</kbd><kbd>{"↓"}</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
    </div>
  </div>;
}
