/* Shared pieces, in the Claude design's markup and class names, so the
   design's stylesheet (tokens, the SU Digital Design System, app.css,
   detail.css) draws them as the design does. */

import React, { useEffect, useRef, useState, createContext, useContext } from "react";
import { dayDiff } from "../lib/dates.js";

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const IP = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  "arrow-right": "M4 12h15m-6-6 6 6-6 6",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  layers: "M12 3 3 7.5l9 4.5 9-4.5zM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  calendar: "M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  users: "M16.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M10 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5M17 5.2a3.5 3.5 0 0 1 0 6.6M20.5 20v-1.5a3.4 3.4 0 0 0-2-3",
  alert: "M12 4 2.5 20.5h19zM12 10v4.5M12 17.5h.01",
  flag: "M5 21V4h9l-1 3h6l-1.5 5H21l-2 5H5",
  chart: "M4 20V4M4 20h16M8 17V11M12.5 17V7M17 17v-4",
  shield: "M12 3 5 5.5v5c0 5 3.2 8.4 7 10 3.8-1.6 7-5 7-10v-5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20.5 20.5 16 16",
  chev: "M6 9.5 12 15.5l6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
  edit: "M4 20h4L20 8l-4-4L4 16zM14.5 5.5 18.5 9.5",
  ext: "M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  check: "M4.5 12.5 9.5 17.5 20 6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3.5 2",
  scale: "M12 4v16M7 20h10M12 6 5 9l3 4.5L11 9zM12 6l7 3-3 4.5L13 9z",
  plus: "M12 5v14M5 12h14",
  book: "M4 5.5A2 2 0 0 1 6 4h13v16H6a2 2 0 0 0-2 2zM19 16.5H6",
  mail: "M3.5 6h17v12h-17zM3.5 6.5 12 13l8.5-6.5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  swap: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.5M12 7.5h.01",
  up: "M12 20V5m-6 6 6-6 6 6",
  enter: "M20 5v8a3 3 0 0 1-3 3H5m4-4-4 4 4 4",
  x: "M6 6l12 12M18 6 6 18"
};

export function Icon({ n, s = 17, sw = 1.8, style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={IP[n]} /></svg>;
}

/* a steady colour per person, from the brand's secondary palette */
const AV_BG = ["#000E54", "#203299", "#2B72D7", "#D74100", "#404040", "#7C3AED", "#0F766E", "#9A3412"];
export const initials = n => {
  const w = String(n || "").split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

export function Avatar({ person, size = 32 }) {
  const none = !person || person.none;
  const n = none ? "" : person.n;
  const hue = none ? "#C4C7CE" : AV_BG[(n.charCodeAt(0) + n.length) % AV_BG.length];
  return <div className="av" style={{ width: size, height: size, fontSize: Math.round(size * .38), background: hue }} title={none ? "Not assigned" : n}>
    {none ? "" : initials(n)}
  </div>;
}

/* the rating badge; a blank rating reads "Not rated" */
export const Risk = ({ r }) => <span className={"risk " + (r || "Unrated")}>{!r || r === "Unrated" ? "Not rated" : r}</span>;

/* a deadline's status, as the design's pills */
export function dueState(dl, today) {
  if (dl.status === "Completed") return { cls: "ok", label: "Completed" };
  if (!dl.due) return { cls: "", label: "No date" };
  const d = dayDiff(dl.due, today);
  if (d < 0) return { cls: "late", label: `Overdue ${Math.abs(d)}d` };
  if (d <= 30) return { cls: "warn", label: `Due in ${d}d` };
  if (d <= 90) return { cls: "due", label: `Due in ${d}d` };
  return { cls: "", label: `Due in ${d}d` };
}
export const DuePill = ({ dl, today }) => { const st = dueState(dl, today); return <span className={"pill " + st.cls}>{st.label}</span>; };

export function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = e => setM(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

/* Dialogs can stack (a confirm over a manager). Escape closes the top one
   only, and the page stays locked until the last one closes. */
const modalStack = [];
export function Modal({ children, onClose, size, label }) {
  // callers pass a fresh arrow each render; read the latest without
  // re-registering, which would reorder the stack
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = {};
    modalStack.push(me);
    const h = e => { if (e.key === "Escape" && modalStack[modalStack.length - 1] === me) closeRef.current(); };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      modalStack.splice(modalStack.indexOf(me), 1);
      if (!modalStack.length) document.body.style.overflow = "";
    };
  }, []);
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={"cm-modal" + (size === "sm" ? " sm" : "")} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
  </div>;
}

/* the navy dialog header, with its close button */
export const ModalHead = ({ eyebrow, title, sub, onClose, children }) => <div className="mhd">
  {children}
  <div>{eyebrow && <div className="eyebrow" style={{ color: "#FF8E00" }}>{eyebrow}</div>}
    <h2 style={eyebrow ? { marginTop: 5 } : null}>{title}</h2>
    {sub && <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{sub}</div>}</div>
  <button className="cl" onClick={onClose} aria-label="Close">{"✕"}</button>
</div>;

export const PageHead = ({ eyebrow, title, sub, right }) => <div className="ph">
  <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
  {right && <div className="ph-r">{right}</div>}
</div>;

export const Field = ({ label, children, right }) => <div className="fldg"><div className="lb">{label}<span className="rule"></span>{right}</div>{children}</div>;

export const Stat = ({ n, l, s, tone, onClick }) => React.createElement(onClick ? "button" : "div",
  { className: "stat" + (tone ? " " + tone : ""), onClick },
  <div className="n">{n}</div>, <div className="l">{l}</div>, s ? <div className="s">{s}</div> : null);

export const Empty = ({ title, sub }) => <div className="empty"><h3>{title}</h3>{sub && <p style={{ color: "#707780" }}>{sub}</p>}</div>;

/* A link that may be empty in live data; renders nothing rather than a dead href. */
export const ExtLink = ({ href, children, style }) => href
  ? <a href={href} target="_blank" rel="noopener" style={style}>{children}</a>
  : null;

export const bare = u => String(u || "").replace(/^https?:\/\//, "");
export const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));

/* A button that shows it is working while a write it started is in flight. */
export function Busy({ busyKey, className, disabled, onClick, children, style, title }) {
  const { busy } = useApp();
  const on = busy === busyKey;
  return <button className={className} style={style} title={title} disabled={disabled || !!busy} onClick={onClick} aria-busy={on}>
    {on ? <><span className="cm-spin" aria-hidden="true"></span>Saving...</> : children}
  </button>;
}
