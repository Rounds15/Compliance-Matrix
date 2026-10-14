/* "Add to my calendar": with the CM - Add to calendar flow set up (Dataverse,
   ComplianceMatrix/Flow/Calendar), the person is sent an Outlook invitation
   for each open deadline; otherwise they download a calendar file. */

import { useApp } from "./parts.jsx";
import { deadlinesIcs, download } from "./exports.js";

export function useAddToCalendar() {
  const { adapter, actions } = useApp();
  const viaFlow = !!adapter.addToCalendar;
  const add = (list, fileName = "compliance-deadlines.ics") => {
    const open = list.filter(d => d && d.due && d.status !== "Completed");
    if (!open.length) return null;
    if (viaFlow) return actions.addToCalendar(open).catch(() => null); // the toast says what failed
    download(fileName, deadlinesIcs(open, window.location.hostname || "syr.edu"), "text/calendar");
    return null;
  };
  return { add, viaFlow };
}
