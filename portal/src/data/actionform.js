/* Record a Portal Action through the CM Portal Action basic form.

   Who made a request is never sent by the browser. The row is created by a
   Power Pages basic form (Insert mode) whose "Associate current portal user
   on insert" setting writes Requested By (su_requestedby) on the server, from
   the session. Requested By is not on the form, so a value added to the
   request is ignored. docs/DATAVERSE-MIGRATION.md, section 8, sets the form
   up and has a test that tries to spoof it.

   The form lives on its own page (/cm-action/). It is loaded into a hidden
   frame on the same site, filled in by field ID, and submitted with the
   form's own button. On success the form redirects to /cm-action-done/ with
   the new row's ID in the query string, which is all this returns. */

export const ACTION_FORM_PATH = "/cm-action/";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* how long to wait for fields the site adds with script after the page loads */
const READY_MS = 10000;
const SETUP ="Check the CM Portal Action form and its page (docs/DATAVERSE-MIGRATION.md, section 8).";

/* What the form says when it refuses: its validation summary or alert. */
function formMessage(doc) {
  const box = doc.querySelector("#ValidationSummaryEntityFormView, .validation-summary, .alert-danger, .alert-error");
  return box ? (box.textContent || "").replace(/\s+/g, " ").trim() : "";
}

/* Why a field is missing, from what the frame got: another page (sign-in,
   access denied, not found), a page with no basic form (or a message in its
   place, such as a permissions notice), or a form without that column. */
export function missingField(doc, id, path = "") {
  const text = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "").slice(0, 200);
  const where = path && !/^\/cm-action\/?$/i.test(path) ? ` The frame was sent to ${path} instead of ${ACTION_FORM_PATH}.` : "";
  const title = text(doc.querySelector("title"));
  const fields = [...doc.querySelectorAll("input[id], select[id], textarea[id]")]
    .filter(el => el.type !== "hidden" && el.type !== "submit" && !/_name$/.test(el.id)).map(el => el.id);
  if (!doc.getElementById("InsertButton")) {
    const note = text(doc.querySelector(".alert, .message, #ValidationSummaryEntityFormView, .validation-summary"));
    return `The action form page shows no form to fill in${title ? ` (page "${title}")` : ""}.${where}` +
      (note ? ` It says: "${note}".` : " Check that the CM Portal Action basic form is on the CM Action page, the page uses the default page template, and the form's table permission gives your web role Create.") +
      " " + SETUP;
  }
  return `The action form has no field ${id}.` + (fields.length ? ` Its fields are: ${fields.slice(0, 12).join(", ")}.` : "") +
    ` Add ${id} to a section in the body of the CM Portal Action main form (a field in the form header is not shown on the site), then publish the form and clear the cache. ${SETUP}`;
}

/* Fill the form in place. `values`: { name, action, reason, lookups: [[column, table, id], ...] }.
   Throws when a field the form needs is missing, so a mis-built form fails
   with a message rather than saving half a request. */
export function fillActionForm(doc, values, path = "") {
  const need = id => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(missingField(doc, id, path));
    return el;
  };
  need("su_name").value = String(values.name || "").slice(0, 400);
  const action = need("su_action");
  action.value = String(values.action);
  if (action.value !== String(values.action)) throw new Error(`The action form does not offer action type ${values.action}. ${SETUP}`);
  need("su_reason").value = values.reason || "";
  for (const [column, table, id] of values.lookups || []) {
    if (!id) continue;
    need(column).value = id;
    need(column + "_entityname").value = table;
    const label = doc.getElementById(column + "_name");
    if (label) label.value = id;
  }
  return need("InsertButton");
}

export function submitActionForm(values, { path = ACTION_FORM_PATH, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.title = "Portal action";
    frame.style.cssText = "position:absolute;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden";
    let submitted = false;
    let poll = null;
    const finish = (err, id) => {
      clearTimeout(timer);
      clearInterval(poll);
      frame.remove();
      if (err) reject(err); else resolve(id);
    };
    const timer = setTimeout(() => finish(new Error("The action form did not answer. Reload the page and try again.")), timeoutMs);

    frame.addEventListener("load", () => {
      let doc, loc;
      try { doc = frame.contentDocument; loc = frame.contentWindow.location; }
      catch (e) { return finish(new Error("The action form could not be opened. " + SETUP)); }
      if (!doc || !loc) return finish(new Error("The action form could not be opened. " + SETUP));

      const id = new URLSearchParams(loc.search).get("id");
      if (submitted) {
        if (id && GUID.test(id)) return finish(null, id.toLowerCase());
        return finish(new Error(formMessage(doc) || "The action could not be recorded."));
      }
      /* the site may add the form's fields with script after the page loads
         (for example, with form fill assistance on): wait for them */
      let tries = 0;
      const ready = () => doc.getElementById("InsertButton") && doc.getElementById("su_name");
      const fill = () => {
        try { if (submitted || !frame.isConnected || frame.contentDocument !== doc) return; } catch (e) { return; }
        if (!ready() && ++tries < READY_MS / 200) return void setTimeout(fill, 200);
        try {
          const button = fillActionForm(doc, values, loc.pathname);
          submitted = true;
          button.click();
          /* a client-side validation failure does not navigate; report it */
          poll = setInterval(() => {
            try {
              const msg = frame.contentDocument === doc ? formMessage(doc) : "";
              if (msg) finish(new Error(msg));
            } catch (e) { /* navigating */ }
          }, 400);
        } catch (e) {
          finish(e);
        }
      };
      fill();
    });
    frame.src = path + (path.includes("?") ? "&" : "?") + "_=" + Date.now();
    document.body.appendChild(frame);
  });
}
