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
  const [viewAs, setViewAs] = useState({ mode: "self" }); // self | person
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

  /* who the screens are drawn for: the signed-in user, or - for an
     administrator previewing the page - someone else, seen without admin
     rights. Writes are always made as the real user. */
  const actingPerson = useMemo(() => {
    if (!ds) return NOBODY;
    if (viewAs.mode === "person") return ds.people.find(p => String(p.id) === String(viewAs.personId)) || ds.me;
    return ds.me;
  }, [ds, viewAs]);
  const adminView = cfg.isAdmin && viewAs.mode === "self";

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
      if (okMsg) flash(typeof okMsg === "function" ? okMsg(r) : okMsg);
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
    addFlag: (fn, reason) => act("flag", (a, c) => a.addFlag({ fn, reason }, c), "Flagged for review. The compliance office has been notified."),
    resolveFlag: (flag, fn) => act("flag-" + flag.id, (a, c) => a.resolveFlag({ flag, fn }, c), "Flag cleared."),
    logGap: (fn, form) => act("gap", (a, c) => a.logGap({ fn, ...form }, c), "Gap logged and routed to the Gap Tracker."),
    closeGap: (gap, note) => act("gap-" + gap.id, (a, c) => a.closeGap({ gap, note }, c), "Gap closed. Open gap count updated."),
    completeDeadline: (dl, fn, reason) => act("dl-" + dl.id, (a, c) => a.completeDeadline({ dl, fn, reason }, c), "Deadline marked complete."),
    reverseDeadline: (dl, fn, reason) => act("dl-" + dl.id, (a, c) => a.reverseDeadline({ dl, fn, reason }, c), "Completion reversed."),
    saveFunction: (draft, isNew) => act("fn", (a, c) => a.saveFunction({ draft, isNew }, c), isNew ? "Function added to the matrix." : "Changes saved to the matrix."),
    deleteFunction: fn => act("fn-del", (a, c) => {
      const r = rawRef.current;
      const mine = x => String(x.functionId) === String(fn.id);
      const related = {
        gaps: (r.gaps || []).filter(mine).map(x => x.id),
        deadlines: (r.deadlines || []).filter(mine).map(x => x.id),
        flags: (r.flags || []).filter(mine).map(x => x.id),
        ownership: (r.ownership || []).filter(mine).map(x => x.id)
      };
      return a.deleteFunction({ fn, related }, c);
    }, "Function deleted. An Archive record was kept."),
    setOwnership: (fn, rows) => act("own", (a, c) => {
      const existingRowIds = (rawRef.current.ownership || []).filter(o => String(o.functionId) === String(fn.id)).map(o => o.id);
      return a.setOwnership({ fn, rows, existingRowIds }, c);
    }, "Ownership chain saved."),
    addPerson: person => act("person", (a, c) => a.addPerson({ person }, c), person.name + " added to the Compliance Directory."),
    updatePerson: person => act("person", (a, c) => a.updatePerson({ person }, c), "Directory record updated."),
    deletePerson: person => act("person-del", (a, c) => a.deletePerson({ person, ownershipRowIds: ownershipRowsFor(person) }, c), person.n + " removed from the directory."),
    replacePerson: (from, to) => act("person-swap", (a, c) => a.replacePerson({ from, to, ownershipRowIds: ownershipRowsFor(from) }, c), `${to.n} now holds every role ${from.n} held.`),
    addRiskArea: name => act("tax", (a, c) => a.addRiskArea({ name }, c), "Risk area added."),
    deleteRiskArea: riskArea => act("tax", (a, c) => a.deleteRiskArea({ riskArea }, c), "Risk area deleted."),
    addDomain: (name, riskAreaId) => act("tax", (a, c) => a.addDomain({ name, riskAreaId }, c), "Domain added."),
    deleteDomain: domain => act("tax", (a, c) => a.deleteDomain({ domain }, c), "Domain deleted."),
    lookupPerson: q => adapter.lookupPerson ? adapter.lookupPerson(q) : Promise.resolve(null),
    refresh: () => loadAll(true).then(() => flash("Refreshed from " + adapter.label + "."))
  }), [act, adapter, ownershipRowsFor, loadAll, flash]);

  return {
    cfg, adapter, today, status, error, ds, loadedAt, busy, toast, flash,
    viewAs, setViewAs, actingPerson, adminView, realAdmin: cfg.isAdmin, actions, retry: () => loadAll()
  };
}
