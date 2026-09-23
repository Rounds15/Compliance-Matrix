/* Deadline roll-forward, ported from the canvas app's RefreshDeadlines() and
   CadenceMonths() (App.pa.yaml, Formulas). Kept line-for-line equivalent so the
   page and the Power App show the same next date and status for every row.

   A deadline row stores a base due date, a cadence, and the date it was last
   completed. The next occurrence is computed, never stored:

     withinHold  completed in the last 30 days -> shows as Completed, date stays
     otherwise   step the base date forward by whole cadence periods until it
                 reaches this month; if that lands in the past and was already
                 completed on or after it, step once more */

import { addDays, addMonths, monthDiff } from "./dates.js";

export function cadenceMonths(cad) {
  const c = String(cad || "").trim();
  const is = list => list.includes(c);
  if (is(["Monthly"])) return 1;
  if (is(["Bi-monthly", "Bimonthly", "Every 2 Months"])) return 2;
  if (is(["Quarterly"])) return 3;
  if (is(["Semiannual", "Semi-Annual", "Semi-Annually", "Semiannually"])) return 6;
  if (is(["Annual", "Annually", "Yearly"])) return 12;
  if (is(["Biennial", "Biennially", "Every 2 Years"])) return 24;
  if (is(["Triennial", "Triennially", "Every 3 Years"])) return 36;
  if (is(["Every 4 Years"])) return 48;
  if (is(["Every 5 Years"])) return 60;
  if (is(["Every 10 Years"])) return 120;
  return 0;
}

export const HOLD_DAYS = 30;

/* base, lastDone, today: local-midnight Dates (base/lastDone may be null). */
export function nextOccurrence(base, cadence, lastDone, today) {
  const mp = cadenceMonths(cadence);
  const withinHold = !!lastDone && today <= addDays(lastDone, HOLD_DAYS);
  let next;
  if (withinHold) {
    next = base;
  } else if (mp === 0 || !base) {
    next = base;
  } else {
    // Power Fx RoundDown(x, 0) truncates toward zero; Max(0, ...) keeps it >= 0.
    const n = Math.max(0, Math.trunc(monthDiff(base, today) / mp));
    const cand = addMonths(base, n * mp);
    next = (cand < today && lastDone && lastDone >= cand) ? addMonths(cand, mp) : cand;
  }
  const status = withinHold ? "Completed" : (next && today > next ? "Overdue" : "Upcoming");
  return { next, withinHold, status };
}
