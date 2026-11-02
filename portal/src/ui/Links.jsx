/* A function's additional links on Function Detail: the list under
   Governing statute (Statute and Regulation) and under Syracuse University
   resource (Guidance and SU Resource), and, for administrators, the editor
   that adds, edits, removes and reorders them. data/links.js saves them. */

import React from "react";
import { Icon } from "./parts.jsx";
import { linkProblem } from "../data/links.js";

const safeHref = url => (/^https?:\/\//i.test(String(url || "")) ? url : undefined);

/* the read view: each link as its label, opening in a new tab */
export function LinkList({ links }) {
  if (!links.length) return null;
  return <ul className="fd-links">{links.map(l => <li key={l.id}>
    {safeHref(l.url)
      ? <a href={safeHref(l.url)} target="_blank" rel="noopener">{l.label} <Icon n="ext" s={12} style={{ verticalAlign: -1 }} /></a>
      : <span>{l.label}</span>}
    <span className="sub">{l.type}</span>
  </li>)}</ul>;
}

/* the editor rows for one section. all: the function's links being edited,
   in order; types: the link types this section holds */
let keySeq = 0;
export const editableLinks = links => links.map(l => ({ key: "k" + (keySeq++), id: l.id, label: l.label, url: l.url, type: l.type, source: l.source || "" }));

export function LinksEditor({ all, onChange, types, tried, idPrefix }) {
  const mine = all.filter(l => types.includes(l.type));
  const put = (key, patch) => onChange(all.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const remove = key => onChange(all.filter(l => l.key !== key));
  /* swap with the next or previous link of this section */
  const move = (key, dir) => {
    const i = mine.findIndex(l => l.key === key), j = i + dir;
    if (j < 0 || j >= mine.length) return;
    const a = all.indexOf(mine[i]), b = all.indexOf(mine[j]);
    const next = [...all];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };
  const add = () => onChange([...all, { key: "k" + (keySeq++), id: null, label: "", url: "", type: types[0], source: "" }]);
  return <div className="lk-edit">
    <div className="flab" style={{ marginTop: 6 }}>Additional links</div>
    {mine.map((l, i) => {
      const problem = linkProblem(l);
      const show = problem && (tried || l.label || l.url);
      const id = idPrefix + "-" + l.key;
      return <div key={l.key} className={"lk-row" + (show ? " bad" : "")}>
        <div className="lk-fields">
          <div><label className="flab" htmlFor={id + "-label"}>Label</label>
            <input id={id + "-label"} className="ti" value={l.label} onChange={e => put(l.key, { label: e.target.value })} placeholder="34 C.F.R. § 668.46" /></div>
          <div><label className="flab" htmlFor={id + "-url"}>Address</label>
            <input id={id + "-url"} className="ti" type="url" inputMode="url" value={l.url} onChange={e => put(l.key, { url: e.target.value })} placeholder="https://" /></div>
          <div style={{ flex: "0 0 160px" }}><label className="flab" htmlFor={id + "-type"}>Type</label>
            <select id={id + "-type"} className="ti" value={l.type} onChange={e => put(l.key, { type: e.target.value })}>
              {types.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        <div className="lk-acts">
          <button type="button" className="button button-ghost button-sm" onClick={() => move(l.key, -1)} disabled={i === 0} aria-label={"Move " + (l.label || "this link") + " up"}><Icon n="up" s={14} /></button>
          <button type="button" className="button button-ghost button-sm" onClick={() => move(l.key, 1)} disabled={i === mine.length - 1} aria-label={"Move " + (l.label || "this link") + " down"}><Icon n="up" s={14} style={{ transform: "rotate(180deg)" }} /></button>
          <button type="button" className="button button-ghost button-sm" onClick={() => remove(l.key)} aria-label={"Remove " + (l.label || "this link")}><Icon n="trash" s={14} />Remove</button>
        </div>
        {show && <p className="lk-problem" role="alert">{problem}</p>}
      </div>;
    })}
    <button type="button" className="button button-secondary-outline button-sm" onClick={add}><Icon n="plus" s={14} />Add link</button>
  </div>;
}
