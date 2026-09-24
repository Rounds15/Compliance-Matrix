/* Shared pieces used by every screen. */

import React, { useEffect, useRef, createContext, useContext } from "react";

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const IP = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  chart: "M4 20V4M4 20h16M8 17V11M12.5 17V7M17 17v-4",
  users: "M16.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M10 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5M17 5.2a3.5 3.5 0 0 1 0 6.6M20.5 20v-1.5a3.4 3.4 0 0 0-2-3",
  calendar: "M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  dots: "M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01",
  warning: "M12 4 2.5 20.5h19zM12 10v4.5M12 17.5h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.5M12 7.5h.01",
  layer: "M12 3 3 7.5l9 4.5 9-4.5zM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17",
  flag: "M5 21V4h9l-1 3h6l-1.5 5H21l-2 5H5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20.5 20.5 16 16",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  scale: "M12 4v16M7 20h10M12 6 5 9l3 4.5L11 9zM12 6l7 3-3 4.5L13 9z",
  plus: "M12 5v14M5 12h14",
  check: "M4.5 12.5 9.5 17.5 20 6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3.5 2",
  mail: "M3.5 6h17v12h-17zM3.5 6.5 12 13l8.5-6.5",
  shield: "M12 3 5 5.5v5c0 5 3.2 8.4 7 10 3.8-1.6 7-5 7-10v-5z",
  menu: "M4 7h16M4 12h16M4 17h16",
  alert: "M12 4 2.5 20.5h19zM12 10v4.5M12 17.5h.01"
};

export function Icon({ n, s = 18, sw = 1.8, style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={IP[n]} /></svg>;
}

/* first letter of the first and last name, as the app's avatars show */
export const initials = n => {
  const w = String(n || "").split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

export function Avatar({ person, size = 40, square }) {
  const none = !person || person.none;
  return <span className={"av" + (square ? " sq" : "")} style={{ width: size, height: size, fontSize: Math.round(size * .36) }} aria-hidden="true">
    {none ? "" : initials(person.n)}
  </span>;
}

/* the rating pill: caps, "NOT RATED" when blank */
export const RiskPill = ({ r }) => <span className={"pill r-" + (r || "Unrated")}>{!r || r === "Unrated" ? "Not Rated" : r}</span>;

/* Hero band: eyebrow, white title, Georgia lede, then the 6px orange rule. */
export const Hero = ({ eyebrow, title, lede, big, className, children, noRule }) => <>
  <div className={"hero" + (big ? " big" : "") + (className ? " " + className : "")}>
    <div className="wrap">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </div>
  </div>
  {!noRule && <div className="rule"></div>}
</>;

/* Dialogs can stack (a confirm over a manager). Escape closes the top one
   only, and the page stays locked until the last one closes. */
const modalStack = [];
export function Modal({ children, onClose, className, label }) {
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
  return <div className="mscrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={"modal" + (className ? " " + className : "")} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
  </div>;
}

/* A button that shows it is working while a write it started is in flight. */
export function Busy({ busyKey, className, disabled, onClick, children, style, title }) {
  const { busy } = useApp();
  const on = busy === busyKey;
  return <button className={className} style={style} title={title} disabled={disabled || !!busy} onClick={onClick} aria-busy={on}>
    {on ? <><span className="spin" aria-hidden="true"></span> Working...</> : children}
  </button>;
}

/* Search box with the magnifier, as on Home and Compliance Functions. */
export function SearchBox({ value, onChange, placeholder, onSubmit, button, label }) {
  return <form className="search" role="search" onSubmit={e => { e.preventDefault(); if (onSubmit) onSubmit(); }}>
    <Icon n="search" />
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} />
    {button && <button type="submit" className="btn primary">{button}</button>}
  </form>;
}

export const bare = u => String(u || "").replace(/^https?:\/\//, "");
export const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
