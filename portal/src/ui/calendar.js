/* "Add to my calendar": with the CM - Add to calendar flow set up (Dataverse,
   ComplianceMatrix/Flow/Calendar), the request is recorded as a Portal
   Action (through the CM Portal Action form, which names the signed-in
   contact on the server) and the flow sends the person an Outlook
   invitation for each open deadline. Without the flow, or when sending
   fails, they download a calendar file instead. */

import { useApp } from "./parts.jsx";
import { deadlinesIcs, download } from "./exports.js";

export function useAddToCalendar() {
  const { adapter, actions, flash } = useApp();
  const viaFlow = !!adapter.addToCalendar;
  const add = (list, fileName = "compliance-deadlines.ics") => {
    const open = list.filter(d => d && d.due && d.status !== "Completed");
    if (!open.length) return null;
    const file = () => download(fileName, deadlinesIcs(open, window.location.hostname || "syr.edu"), "text/calendar");
    if (viaFlow) return actions.addToCalendar(open).catch(e => {
      /* the invitation was not sent: say why, and give them the file */
      file();
      flash("The calendar invite could not be sent: " + String((e && e.message) || e).replace(/[.\s]*$/, "") + ". A calendar file was downloaded instead.", "error");
      return null;
    });
    file();
    return null;
  };
  return { add, viaFlow };
}
