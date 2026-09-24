# SharePoint flows for the Compliance Matrix page

The Power Pages page reads and writes the Compliance Matrix 2.0 lists through
Power Automate. Power Pages cannot call SharePoint itself: its Web API only
speaks Dataverse, and a browser will not send a SharePoint session to another
origin. A cloud flow that starts with **When Power Pages calls a flow** is the
supported bridge.

You build four flows once, plus two optional notification flows. Each is short.

| Flow | Who may run it | What it does |
|---|---|---|
| **CM - Read list** | Authenticated Users | Returns one list's items |
| **CM - Write (members)** | Authenticated Users | Raise a flag, log or close a gap, complete or reverse a deadline |
| **CM - Write (administrators)** | Compliance Matrix Administrators | Every create, update and delete the app makes |
| **CM - Find person** *(optional)* | Compliance Matrix Administrators | Looks someone up in Entra ID for the directory |

The page sends each flow one text value, `request`, holding JSON, and expects
one text value back, `result`, holding JSON. The contract below is exactly what
`portal/test/mock-portal.mjs` implements, and the end-to-end tests drive the
page against it, so if a flow follows this document the page works against it.

Site: `https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix`

---

## Before you start

- Build the flows **in a solution** in the same environment as the Power Pages
  site. Power Pages only lists solution-aware flows.
- Use one SharePoint connection for all four, owned by an account that can edit
  every list. That account is who SharePoint records in *Created By* and
  *Modified By* for changes made through the page; the page records the actual
  person in the app's own columns (Flagged By, Resolved By, Completed By Name).
- Every flow starts the same way:
  1. Trigger: **Power Pages › When Power Pages calls a flow**. Add one input:
     type **Text**, name `request`.
  2. **Compose**, rename it `req`. Inputs: `json(triggerBody()?['text'])`.
     If the designer named the input differently, pick **request** from the
     dynamic content list and wrap it in `json( )` instead.
  3. The last step is **Power Pages › Return value(s) to Power Pages** with one
     **Text** output named `result`.

Expressions below refer to actions by the names given here; rename actions to
match, or adjust the references.

---

## 1. CM - Read list

Request: `{"list": "Compliance Functions", "next": ""}`
Result: `{"ok": true, "items": [ ...SharePoint items... ], "next": ""}`

`next` is empty unless the list has more than 5,000 items; the page sends it
back to fetch the next page. None of the lists is near that today.

1. Trigger, `req` (above).
2. **Condition** `allowed`:
   `contains(createArray('Risk Areas','Domains','Compliance Directory','Compliance Functions','Accountability Structure','Deadlines','Flags List','Gap List'), outputs('req')?['list'])`
   is equal to `true`.
3. **If no:** Return value(s) to Power Pages, `result`:
   `{"ok":false,"error":"List not allowed"}`
4. **If yes:**
   1. **SharePoint › Send an HTTP request to SharePoint**, rename `get`.
      - Site Address: the Compliance Matrix site
      - Method: `GET`
      - Uri:
        `if(empty(outputs('req')?['next']), concat('_api/web/lists/getbytitle(''', replace(outputs('req')?['list'], '''', ''''''), ''')/items?$top=5000'), outputs('req')?['next'])`
      - Headers: `Accept` = `application/json;odata=nometadata`
   2. **Compose**, rename `out`:
      `setProperty(setProperty(json('{"ok":true}'), 'items', body('get')?['value']), 'next', if(empty(body('get')?['odata.nextLink']), '', last(split(body('get')?['odata.nextLink'], '/SyracuseComplianceMatrix/'))))`
   3. Return value(s) to Power Pages, `result`: `string(outputs('out'))`

The page reads eight lists: Risk Areas, Domains, Compliance Directory,
Compliance Functions, Accountability Structure, Deadlines, Flags List, Gap
List. It never reads Archive; Archive is write-only from the page.

---

## 2. CM - Write (administrators)

Request:

```json
{"ops": [
  {"op": "create", "list": "Flags List", "fields": {"Title": "...", "FunctionId": 201, "field_1": "..."}},
  {"op": "update", "list": "Deadlines", "id": 401, "fields": {"field_4": "2026-09-23T12:00:00.000Z"}},
  {"op": "delete", "list": "Gap List", "id": 603}
]}
```

Result: `{"ok": true, "results": [{"id": 12}, {"id": 401}, {"id": 603}]}` - one
entry per op, in order; `id` is the new item's ID for a create.

`fields` uses SharePoint **internal** column names, with values already in the
shape SharePoint's REST API takes: lookups as `<Name>Id` integers, choices as
strings, dates as ISO strings, hyperlinks as
`{"__metadata":{"type":"SP.FieldUrlValue"},"Url":"...","Description":"..."}`.
The flow does not interpret them; it adds the list's item type and passes them
through.

Ops **must run one at a time, in order**. Deleting a function removes its gaps,
deadlines, flags and ownership rows first, then the function, and an ownership
save deletes the old rows before creating the new ones.

1. Trigger, `req`.
2. **Initialize variable** `results`, type Array, value `[]`.
3. **Filter array**, rename `refused`. From: `outputs('req')?['ops']`.
   Condition (advanced mode):
   `@not(contains(createArray('Risk Areas','Domains','Compliance Directory','Compliance Functions','Accountability Structure','Deadlines','Flags List','Gap List','Archive'), item()?['list']))`
4. **Condition** `length(body('refused'))` is greater than `0`
   - **If yes:** Return value(s), `result`: `{"ok":false,"error":"List not allowed"}`, then **Terminate** (Succeeded).
5. **Scope**, rename `Try`, containing:
   1. **Apply to each** over `outputs('req')?['ops']`.
      **Settings › Concurrency control: On, degree of parallelism 1.** This is
      required; the default runs ops in parallel and in no order.
      Inside:
      1. **Compose** `fields`: `item()?['fields']`
      2. **Send an HTTP request to SharePoint**, rename `type`:
         GET `concat('_api/web/lists/getbytitle(''', replace(item()?['list'], '''', ''''''), ''')?$select=ListItemEntityTypeFullName')`,
         header `Accept` = `application/json;odata=nometadata`.
      3. **Compose** `payload`:
         `setProperty(if(empty(outputs('fields')), json('{}'), outputs('fields')), '__metadata', json(concat('{"type":"', body('type')?['ListItemEntityTypeFullName'], '"}')))`
      4. **Compose** `item`: `concat('_api/web/lists/getbytitle(''', replace(item()?['list'], '''', ''''''), ''')/items')`
      5. **Switch** on `item()?['op']`:
         - **Case `create`:** Send an HTTP request to SharePoint, rename `create`:
           POST, Uri `outputs('item')`, headers
           `Accept: application/json;odata=verbose`,
           `Content-Type: application/json;odata=verbose`,
           Body `outputs('payload')`.
           Then **Append to array variable** `results`:
           `setProperty(json('{}'), 'id', body('create')?['d']?['Id'])`
         - **Case `update`:** Send an HTTP request to SharePoint:
           POST, Uri `concat(outputs('item'), '(', item()?['id'], ')')`, headers
           `Accept: application/json;odata=verbose`,
           `Content-Type: application/json;odata=verbose`,
           `IF-MATCH: *`, `X-HTTP-Method: MERGE`,
           Body `outputs('payload')`.
           Append to `results`: `setProperty(json('{}'), 'id', item()?['id'])`
         - **Case `delete`:** Send an HTTP request to SharePoint:
           POST, Uri `concat(outputs('item'), '(', item()?['id'], ')')`, headers
           `IF-MATCH: *`, `X-HTTP-Method: DELETE`. No body.
           Append to `results`: `setProperty(json('{}'), 'id', item()?['id'])`
6. **Return value(s)**, `result`: `string(setProperty(json('{"ok":true}'), 'results', variables('results')))`
7. A second **Return value(s)** after `Try`, with **Configure run after › Try: has
   failed, has timed out**, `result`:
   `{"ok":false,"error":"SharePoint rejected the change. The flow run history has the detail."}`

The page shows that error to the user and changes nothing on screen, because it
only redraws from what it reads back.

---

## 3. CM - Write (members)

Save a copy of **CM - Write (administrators)** and change two things.

**The allow-list.** Replace the `refused` condition with:

`@not(contains(createArray('create|Flags List','create|Gap List','create|Archive','update|Deadlines','update|Gap List'), concat(item()?['op'], '|', item()?['list'])))`

**Deadline and gap fields.** An owner may mark a deadline complete or reverse
it, and close a gap on their own function, and nothing else about either.
Replace the `fields` Compose with:

`if(equals(item()?['list'], 'Deadlines'), setProperty(setProperty(setProperty(setProperty(json('{}'), 'field_4', item()?['fields']?['field_4']), 'field_5', item()?['fields']?['field_5']), 'field_6', item()?['fields']?['field_6']), 'field_7', item()?['fields']?['field_7']), if(and(equals(item()?['list'], 'Gap List'), equals(item()?['op'], 'update')), setProperty(setProperty(setProperty(setProperty(json('{}'), 'field_2', 'Closed'), 'field_13', item()?['fields']?['field_13']), 'field_14', item()?['fields']?['field_14']), 'ClosedById', item()?['fields']?['ClosedById']), item()?['fields']))`

A deadline update is rebuilt from the four completion columns only (Last
Completed Date, Completed Reason, Completed By Name, Completed Date Time), so
a crafted request cannot move a due date or change a cadence. A Gap List
update is rebuilt as a closure (Status Closed, Closed Date, Closure Note,
Closed By), so it cannot retitle or reopen a gap.

What each action sends through this flow:

| Action on the page | Ops |
|---|---|
| Flag for review | create Flags List |
| Log a gap | create Gap List |
| Close (Gap Tracker) | update Gap List |
| Mark complete | update Deadlines, create Archive (Deadline Completion / Completed) |
| Reverse | update Deadlines, create Archive (Deadline Completion / Reversed) |

Administrators never use this flow; their page sends everything through the
administrators' flow.

---

## 4. CM - Find person *(optional)*

Powers **Look up in Active Directory** when adding someone to the directory or
an ownership chain. Without it, administrators enter a name and email by hand.

Request: `{"q": "raghavan"}` · Result: `{"ok": true, "users": [ ... ]}`

1. Trigger, `req`.
2. **Office 365 Users › Search for users (V2)**, rename `search`.
   Search term: `outputs('req')?['q']`, Top: `5`.
3. Return value(s), `result`:
   `string(setProperty(json('{"ok":true}'), 'users', body('search')?['value']))`

---

## 5. Add the flows to the site

Power Pages Design Studio › **Set up** › **Cloud flows** › **+ Add cloud flow**.
For each flow, add the web roles from the table at the top, then copy the URL
Power Pages shows for it (`/_api/cloudflow/v1.0/trigger/<id>`) into the site
setting:

| Flow | Site setting |
|---|---|
| CM - Read list | `ComplianceMatrix/Flow/Read` |
| CM - Write (members) | `ComplianceMatrix/Flow/Write` |
| CM - Write (administrators) | `ComplianceMatrix/Flow/AdminWrite` |
| CM - Find person | `ComplianceMatrix/Flow/FindPerson` |

The web-role assignment is the security boundary. The page hides
administrator screens from everyone else, but a request aimed at the
administrators' flow by someone without the role is refused by Power Pages
before the flow runs.

---

## 6. Notifications *(recommended)*

The canvas app emails the matrix group's owners when a flag is raised and when
a deadline is completed or reversed (`Office365Outlook.SendEmailV2` in
`App.pa.yaml`). The page does not send email from the browser; list-triggered
flows do it instead, so every change is notified however it was made and the
page cannot be used to send arbitrary mail.

**CM - Notify: new flag.** SharePoint › *When an item is created* on
**Flags List** › Office 365 Groups › *List group owners*
(`701cc143-edd1-4abc-9bee-9e974589dd8e`, the group the canvas app treats as
administrators) › Select `mail` › Join with `;` › Office 365 Outlook › *Send an
email (V2)*: "New flag submitted: <Title>", body with Flagged By, Entry Text,
Created Date.

**CM - Notify: archive events.** *When an item is created* on **Archive** ›
Condition *RecordType* is `Deadline Completion` › same owner lookup › email
"Deadline completed: <FunctionName>" or "Completion reversed: <FunctionName>"
by *EventType*, with Resolved By and Reason.

While the canvas app is still in use it sends its own emails too. To avoid
duplicates for actions taken in the app, add a condition to both flows that
*Created By Email* equals the account that owns the page's SharePoint
connection; items the page creates carry that author, items the app creates
carry the user.

---

## Checking the column names

The page's column map lives in one place:
`portal/src/data/adapters/sharepoint.js`, constant `F`. It came from the canvas
app's own data source metadata. To confirm a list against it, open this in a
browser while signed in to SharePoint:

```
https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix/_api/web/lists/getbytitle('Compliance Functions')/fields?$select=Title,InternalName&$filter=Hidden eq false
```

The Statute URL and Resource URL columns (`field_5`, `field_10`) are Hyperlink
columns; the page writes them as `SP.FieldUrlValue`. If either was created as a
plain text column, remove it from `HYPERLINK` in the same file and rebuild.
