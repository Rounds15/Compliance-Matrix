# Deadline reminder flow

The reminder emails are sent by a Power Automate cloud flow, not by the canvas
app. The app only states the schedule; this document is the build spec for the
flow itself, which lives in the same solution once created.

The schedule is declared in `solution/schema/dataverse-schema.yaml`:

```yaml
reminders:
  offsetsDays: [90, 30, 0]
  overdueRepeatDays: 7
```

90 days out, 30 days out, on the due date, then weekly once overdue.

---

## The filter that matters

**The flow must process only `su_deadlinetype` = Fixed Recurring.**

`su_compliancedeadline` is a typed table. Only one of its four types carries a
calendar date:

| Deadline Type | Has `su_duedate` | Reminders |
|---|---|---|
| **Fixed Recurring** | Yes | **Yes** |
| Event-Relative | No, carries `su_triggerevent` + `su_offsetvalue` / `su_offsetunit` | No |
| Ongoing | No, continuous obligation | No |
| Conditional | No, fires only if a condition is met | No |

Without this filter the flow would read `su_duedate` as blank on three of the
four types, compute a nonsense day difference against it, and mail every owner
that a continuous obligation is roughly 46,000 days overdue. The canvas app's
`cmp_DuePill` component carries the same guard for the same reason.

Event-Relative deadlines are real obligations and are not being ignored — they
simply cannot be reminded on a fixed schedule, because the clock starts at an
event the system does not observe. They surface in the app under the
**No fixed date** scope on the Deadlines screen, rendered from their trigger and
offset. Automating those requires capturing the trigger event first, which is a
later phase.

---

## Flow outline

**Trigger:** Recurrence, daily, early morning in the university's timezone.

**Step 1 — list rows** on `su_compliancedeadline` with an OData filter that does
the type and completion narrowing server-side rather than in a condition:

```
su_deadlinetype eq 100000070 and su_complete eq false and su_duedate ne null
```

`100000070` is Fixed Recurring. Values are in the `su_deadlinetype` choice set
in the schema file; take them from there rather than retyping.

**Step 2 — for each row**, compute `daysUntil = duedate - utcNow()` in whole
days and send only when one of these is true:

- `daysUntil` is exactly 90, 30, or 0
- `daysUntil` is negative and `Mod(Abs(daysUntil), 7) = 0` — the weekly overdue
  repeat

The exact-match tests are what keep this idempotent on a daily trigger: each
threshold fires once. A `>=` comparison would mail every owner every day from 90
days out, which is how reminder systems get muted.

**Step 3 — resolve the recipient.** Use `su_owner` on the deadline row, which is
the copied compliance owner. Fall back to the parent function's
`su_complianceowner` when blank, and skip the row if both are empty rather than
mailing the compliance office about an unassigned obligation. Send to
`su_owner.su_email`.

**Step 4 — respect the leaver rule.** Skip when the resolved person has
`su_active` = false. A departed owner's obligations need reassignment, not mail
to a disabled mailbox; surface those in the app instead.

---

## Message content

Keep it short and make the record reachable in one click:

- Function name and `su_functioncode`
- Deadline name, due date, and cadence
- Days remaining, or days overdue
- Deep link to the function record in the canvas app

---

## Testing before go-live

1. Point the flow at a development environment with seeded data.
2. Temporarily replace the send action with a compose action and run it, so you
   can read who *would* have been mailed without mailing them.
3. Confirm the count of Event-Relative, Ongoing, and Conditional rows in the
   result is **zero**. That is the single most important check in this document.
4. Confirm no row appears twice on the same day.
