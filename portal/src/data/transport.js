/* HTTP plumbing for a page served by Power Pages.

   Every write - Web API or cloud flow - needs the portal's anti-forgery token
   in a __RequestVerificationToken header. Power Pages serves it from
   /_layout/tokenhtml; this is the endpoint the portal's own shell.js uses, and
   it works on a page that does not load the portal's scripts (this one ships
   its own layout, so there is no window.shell to borrow). */

let tokenPromise = null;

export async function antiForgeryToken(force = false) {
  if (window.shell && typeof window.shell.getTokenDeferred === "function" && !force) {
    return new Promise((resolve, reject) => {
      window.shell.getTokenDeferred().done(resolve).fail(() => reject(new Error("Could not get the portal security token.")));
    });
  }
  if (!tokenPromise || force) {
    tokenPromise = fetch("/_layout/tokenhtml?_=" + Date.now(), { credentials: "same-origin" })
      .then(r => {
        if (!r.ok) throw new Error("Security token request failed (" + r.status + ").");
        return r.text();
      })
      .then(html => {
        const m = /value="([^"]+)"/.exec(html);
        if (!m) throw new Error("Security token not found in the portal response.");
        return m[1];
      })
      .catch(e => { tokenPromise = null; throw e; });
  }
  return tokenPromise;
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function readError(res) {
  let text = "";
  try { text = await res.text(); } catch (e) { /* body unreadable */ }
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = (j.error && (j.error.message || (j.error.innererror && j.error.innererror.message))) || j.message || text;
  } catch (e) { /* not JSON */ }
  if (res.status === 401 || res.status === 403) {
    msg = "You do not have permission to do that. " + (msg ? "(" + String(msg).slice(0, 200) + ")" : "");
  }
  return new ApiError(String(msg || res.statusText || "Request failed").slice(0, 600), res.status, text);
}

/* GET or write against the Power Pages Web API (/_api/...). */
export async function webApi(method, path, body, extraHeaders = {}) {
  const headers = { Accept: "application/json", ...extraHeaders };
  if (method !== "GET") {
    headers["__RequestVerificationToken"] = await antiForgeryToken();
    headers["Content-Type"] = "application/json";
  }
  const init = { method, headers, credentials: "same-origin" };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res = await fetch(path, init);
  if (res.status === 403 && method !== "GET") {
    // a stale token also reports 403; retry once with a fresh one
    headers["__RequestVerificationToken"] = await antiForgeryToken(true);
    res = await fetch(path, init);
  }
  if (!res.ok) throw await readError(res);
  if (res.status === 204) {
    const idHeader = res.headers.get("entityid") || res.headers.get("OData-EntityId") || "";
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(idHeader);
    return { id: m ? m[1] : null };
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/* Follow @odata.nextLink until every row is in. Power Pages pages at 5000. */
export async function webApiAll(path) {
  const rows = [];
  let next = path;
  let guard = 0;
  while (next && guard++ < 200) {
    const page = await webApi("GET", next, undefined, { Prefer: "odata.maxpagesize=5000" });
    rows.push(...(page.value || []));
    next = page["@odata.nextLink"] || null;
  }
  return rows;
}

/* Accepts what Power Pages shows for a flow ("/_api/cloudflow/v1.0/trigger/<id>"),
   a full URL to the same, or just the id. */
export function flowUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^[0-9a-f-]{36}$/i.test(s)) return "/_api/cloudflow/v1.0/trigger/" + s;
  return s;
}

/* Call a flow that starts with "When Power Pages calls a flow" and has one
   text input named `request`. The flow answers through "Return value(s) to
   Power Pages" with one text output named `result`, holding JSON. */
export async function callFlow(url, request) {
  if (!url) throw new ApiError("This action needs a cloud flow that has not been configured on the site.", 0);
  const payload = { eventData: JSON.stringify({ request: JSON.stringify(request) }) };
  const send = async token => fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", "__RequestVerificationToken": token },
    body: JSON.stringify(payload)
  });
  let res = await send(await antiForgeryToken());
  if (res.status === 403) res = await send(await antiForgeryToken(true));
  if (!res.ok) throw await readError(res);
  const text = await res.text();
  return parseFlowResult(text);
}

/* Flow responses arrive as {"result":"<json>"} - output names can come back
   in any case - or occasionally as the bare JSON. Unwrap either. */
export function parseFlowResult(text) {
  let body = text;
  for (let i = 0; i < 3 && typeof body === "string"; i++) {
    try { body = JSON.parse(body); } catch (e) { break; }
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const key = Object.keys(body).find(k => k.toLowerCase() === "result");
    if (key) return parseFlowResult(body[key]);
  }
  if (body && typeof body === "object" && body.ok === false) {
    throw new ApiError(body.error || "The flow reported an error.", 500, text);
  }
  return body;
}
