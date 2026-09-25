/* Application state: load once, reload what a write touched, never guess.

   Writes are not optimistic. Each action awaits the backend, then re-reads the
   tables the adapter says it touched and rebuilds the model, so the screen only
   ever shows what the backend actually holds. On SharePoint that costs a flow
   run per list touched (a second or two); the button shows it is working. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDataset, samePerson, NOBODY } from "./model.js";
import { createSampleAdapter } from "./adapters/sample.js";
import { createSharePointAdapter } from "./adapters/sharepoint.js";
import { createDataverseAdapter } from "./adapters/dataverse.js";
import { today as todayFn } from "../lib/dates.js";

export function createAdapter(cfg) {
  if (cfg.backend === "sharepoint") return createSharePointAdapter(cfg);
  if (cfg.backend === "dataverse") return createDataverseAdapter(cfg);
  return createSampleAdapter(cfg);
}

/* ---- session cache: SharePoint reads cost a flow run per list ---- */
const CACHE_KEY = "cm-matrix-cache-v1";
const reviveDates = (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? new Date(v) : v);

function readCache(cfg) {
  if (!cfg.cacheMinutes || cfg.backend === "sample") return null;
  try {
    const box = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null", reviveDates);
    if (!box || box.backend !== cfg.backend || box.user !== cfg.user.email) return null;
    return box;
  } catch (e) { return null; }
}
function writeCache(cfg, raw) {
  if (!cfg.cacheMinutes || cfg.backend === "sample") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ backend: cfg.backend, user: cfg.user.email, t: Date.now(), raw }));
  } catch (e) { /* storage full or disabled: the page works without it */ }
}

export function useStore(cfg) {
  const adapter = useMemo(() => createAdapter(cfg), [cfg]);
  const today = useMemo(() => todayFn(), []);
  const [raw, setRaw] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  /* the canvas app's varViewMode: Admin | User | AsUser, User on load */
  const [viewAs, setViewAs] = useState({ mode: "User" });
  const rawRef = useRef(null);
  const toastTimer = useRef(null);

  const flash = useCallback((msg, tone = "ok") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 2800);
  }, []);

  const baseCtx = { today, me: null, admin: cfg.isAdmin };

  const loadAll = useCallback(async (background = false) => {
    if (!background) setStatus(s => (s === "ready" ? s : "loading"));
    try {
      const next = await adapter.load(null, baseCtx);
      rawRef.current = next;
      setRaw(next);
      setLoadedAt(new Date());
      setStatus("ready");
      setError(null);
      writeCache(cfg, next);
    } catch (e) {
      if (!rawRef.current) { setError(e); setStatus("error"); }
      else flash("Could not refresh from " + adapter.label + ": " + e.message, "error");
    }
    // baseCtx is rebuilt each render but only carries stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, cfg, flash]);

  useEffect(() => {
    const cached = readCache(cfg);
    if (cached) {
      rawRef.current = cached.raw;
      setRaw(cached.raw);
      setLoadedAt(new Date(cached.t));
      setStatus("ready");
      if (Date.now() - cached.t > cfg.cacheMinutes * 60000) loadAll(true);
    } else {
      loadAll();
    }
  }, [cfg, loadAll]);

  const ds = useMemo(() => raw && buildDataset(raw, { today, meEmail: cfg.user.email, meName: cfg.user.name }), [raw, today, cfg]);

  /* who the "me"-scoped figures are drawn for: the signed-in user, or, when
     an administrator picks View as specific user, that person. Writes are
     always made as the real user. */
  const actingPerson = useMemo(() => {
    if (!ds) return NOBODY;
    if (cfg.isAdmin && viewAs.mode === "AsUser") return ds.people.find(p => String(p.id) === String(viewAs.personId)) || ds.me;
    return ds.me;
  }, [ds, viewAs, cfg]);
  const adminView = cfg.isAdmin && viewAs.mode === "Admin";

  const reload = useCallback(async tables => {
    const part = await adapter.load(tables, baseCtx);
    const next = { ...rawRef.current, ...part };
    rawRef.current = next;
    setRaw(next);
    setLoadedAt(new Date());
    writeCache(cfg, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, cfg]);

  /* every write goes through here */
  const act = useCallback(async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const ctx = { today, me: ds ? ds.me : null, admin: cfg.isAdmin };
      const r = await fn(adapter, ctx);
      const tables = Array.isArray(r) ? r : (r && r.reload) || [];
      if (tables.length) await reload(tables);
      if (okMsg) flash(typeof okMsg === "function" ? okMsg() : okMsg);
      return r;
    } catch (e) {
      flash(e.message || String(e), "error");
      throw e;
    } finally {
      setBusy(null);
    }
  }, [adapter, ds, cfg, today, reload, flash]);

  const ownershipRowsFor = useCallback(person => (rawRef.current.ownership || [])
    .filter(o => ds && samePerson(ds.people.find(p => String(p.id) === String(o.personId)), person))
    .map(o => o.id), [ds]);

  const actions = useMemo(() => ({
    addFlag: (fn, reason) => act("flag", (a, c) => a.addFlag({ fn, reason }, c), "Flag submitted to the compliance office."),
    resolveFlag: (flag, fn) => act("flag-" + flag.id, (a, c) => a.resolveFlag({ flag, fn }, c), "Flag resolved."),
    logGap: (fn, form) => act("gap", (a, c) => a.logGap({ fn, ...form }, c), "Gap logged and routed to the gap tracker."),
    closeGap: (gap, note) => act("gap-" + gap.id, (a, c) => a.closeGap({ gap, note }, c), "Gap closed."),
    completeDeadline: (dl, fn, reason) => act("dl-" + dl.id, (a, c) => a.completeDeadline({ dl, fn, reason }, c), "Deadline marked complete"),
    reverseDeadline: (dl, fn, reason) => act("dl-" + dl.id, (a, c) => a.reverseDeadline({ dl, fn, reason }, c), "Completion reversed"),
    saveFunction: (draft, isNew) => act("fn", (a, c) => a.saveFunction({ draft, isNew }, c), isNew ? "New function created and added to the matrix." : "Changes saved to the matrix."),
    deleteFunction: fn => act("fn-del", (a, c) => {
      const r = rawRef.current;
      const mine = x => String(x.functionId) === String(fn.id);
      const d2 = d => (d ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}` : "");
      const person = id => { const p = ds.people.find(x => String(x.id) === String(id)); return p ? p.n : ""; };
      const dl = new Map(ds.allDeadlines.map(x => [String(x.id), x]));
      /* the Archive reasons the canvas app writes */
      const related = {
        gaps: (r.gaps || []).filter(mine).map(x => ({ id: x.id, reason: "Gap: " + (x.title || "") })),
        deadlines: (r.deadlines || []).filter(mine).map(x => {
          const v = dl.get(String(x.id));
          return { id: x.id, reason: "Deadline: " + d2(v ? v.due : x.base) + " " + (x.cadence || "") };
        }),
        flags: (r.flags || []).filter(mine).map(x => ({ id: x.id, reason: "Flag: " + (x.reason || "") })),
        ownership: (r.ownership || []).filter(mine).map(x => ({ id: x.id, reason: `Owner: ${person(x.personId)} (${x.role})` }))
      };
      return a.deleteFunction({ fn, related }, c);
    }, "Function deleted and archived."),
    setOwnership: (fn, rows) => act("own", (a, c) => {
      const existingRowIds = (rawRef.current.ownership || []).filter(o => String(o.functionId) === String(fn.id)).map(o => o.id);
      return a.setOwnership({ fn, rows, existingRowIds }, c);
    }, "Ownership chain saved."),
    addPerson: person => act("person", (a, c) => a.addPerson({ person }, c), person.name + " added to the Compliance Directory."),
    updatePerson: person => act("person", (a, c) => a.updatePerson({ person }, c), "Saved."),
    deletePerson: person => act("person-del", (a, c) => a.deletePerson({ person, ownershipRowIds: ownershipRowsFor(person) }, c), person.n + " removed from the directory."),
    /* the Directory's Reassign: move the chosen functions' rows from one
       person to another; where the new person already holds that role on the
       function, the old row is removed instead of duplicated */
    reassign: (from, to, fnIds) => act("person-swap", (a, c) => {
      const r = rawRef.current;
      const pick = new Set(fnIds.map(String));
      const isPerson = (o, p) => samePerson(ds.people.find(x => String(x.id) === String(o.personId)), p);
      const rows = (r.ownership || []).filter(o => pick.has(String(o.functionId)) && isPerson(o, from));
      const held = o => (r.ownership || []).some(x => String(x.functionId) === String(o.functionId) && x.role === o.role && isPerson(x, to));
      return a.replacePerson({ from, to, ownershipRowIds: rows.filter(o => !held(o)).map(o => o.id), removeRowIds: rows.filter(held).map(o => o.id) }, c);
    }, () => {
      /* read after the reload: how much the old owner still holds */
      const left = new Set((rawRef.current.ownership || []).filter(o => String(o.personId) === String(from.id)).map(o => String(o.functionId))).size;
      return left === 0 ? from.n + " no longer owns any functions." : `Reassigned. ${left} function(s) still assigned to ${from.n}.`;
    }),
    addRiskArea: name => act("tax", (a, c) => a.addRiskArea({ name }, c), "Risk area created: " + name),
    deleteRiskArea: riskArea => act("tax", (a, c) => a.deleteRiskArea({ riskArea }, c), "Risk area deleted."),
    addDomain: (name, riskAreaId) => act("tax", (a, c) => a.addDomain({ name, riskAreaId }, c), "Domain created: " + name),
    deleteDomain: domain => act("tax", (a, c) => a.deleteDomain({ domain }, c), "Domain deleted."),
    searchPeople: q => adapter.searchPeople ? adapter.searchPeople(q) : Promise.resolve(null),
    refresh: () => loadAll(true).then(() => flash("Refreshed from " + adapter.label + "."))
  }), [act, adapter, ownershipRowsFor, loadAll, flash]);

  return {
    cfg, adapter, today, status, error, ds, loadedAt, busy, toast, flash,
    viewAs, setViewAs, actingPerson, adminView, realAdmin: cfg.isAdmin, actions, retry: () => loadAll()
  };
}
