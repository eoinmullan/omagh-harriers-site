# Round 5 — Simplification

A pass over every screen on 21 November 2026, looking for the kind of thing
the training history merge fixed: two views of one record, a control that is
rarely a real choice, a step that could go, and wording that assumes too much.
Nothing here is a bug. Each is a place where the app asks more of somebody
than the job needs.

Ranked by how much each removes. Nothing has been changed.

---

## U1. The squad page draws a tick box for every member of the club

**Admin, `/admin/squads/[id]`. Biggest win.**

A squad has 15 to 20 members, and the page lists all 313 active members with
a tick box each, so an admin scrolls past three hundred unticked names to see
who's in the squad. The ticks being "the whole truth" made sense when the page
was the only way in. Now it also has **Trained here recently** with an **Add
to squad** button.

**Proposal:** the page shows the squad's own members, each with **Remove**;
then **Trained here recently** with **Add to squad**, as now; then a search
box that finds anyone else in the club, with **Add** beside each result. The
313-row form and its Save button go. Each change is one small form, as
promotion already is.

## U2. Two ways to charge a session, and the admin one leaves a gap

**Admin, the household page's "Charge a training session".**

Its note says it's for "a night the registrar app missed". The registrar's
**Past sessions** now does that properly, for the last fortnight: it records
the attendance and the charge together, against the real session. The admin
form writes a charge with no attendance and no session. So the charge has no
squad on the statement, never shows on the member's training history or the
squad's regulars, and isn't counted in the attendance report.

**Proposal:** remove the form. A night inside the fortnight is put right in
the registrar app, as a night should be. Money outside it is a **correction**,
which the household page keeps, along with cash and transfers. If nights older
than a fortnight need fixing often, widen Past sessions rather than keeping a
second way in.

## U3. The day report is the Sessions list grouped by day

**Admin, Reports.**

`/admin/sessions` already lists every recent session with its headcount and
money. The day report shows the same columns for one date, with a total.
That's the Sessions list with a subtotal, not a report of its own.

**Proposal:** group the Sessions list's past table by day, with a day total
under any day that had more than one session, and remove the day report. That
leaves two reports, so the **Reports** tab can open straight onto attendance
by week, with a switch to money, and the page of three links goes. This is
the admin area's own rule, no dashboard standing between an admin and the job,
applied to reports.

## U4. "Check again" on the registrar's home screen

**Registrar app, the session list.**

The night screen refreshes itself every twenty seconds and when the app comes
back to the front. The home screen doesn't, so it has a **Check again**
button, for when the other phone has just started a session. A registrar
shouldn't need to know when to press it.

**Proposal:** refresh the session list the same way the night screen does, on
coming back to the front and every twenty seconds while it's showing, and
remove the button. That leaves two buttons: **Create a new session** and
**Past sessions**.

## U5. Columns that describe the database rather than the club

**Admin, Households and Members lists.**

Both lists have a **Source** column (`klubfunder` or `manual`), and Households
has **Role**, which is "member" on almost every row. Neither helps find a
household or member, and both are on the detail page anyway.

**Proposal:** drop **Source** from both lists. Show the role only when it
isn't "member", as a small badge beside the name, so the volunteers stand
out instead of every row saying the same thing.

## U6. The household page leads with what's least often changed

**Admin, `/admin/households/[id]`.**

The page opens with three separate cards, **Display name**, **Role** and
**Account status**, which a superuser changes rarely and other admins can't
change at all. Then the members, then the training credit, which is why most
admins are there.

**Proposal:** put the three into one collapsed **Edit household** section
(superusers only), so the page reads: who the household is, its members, its
credit.

---

## Looked at and left alone

- **The registrar's five views** (Usuals, Everyone, Guests, Signed in, Paid).
  Each answers a different question at the gate, and the round 3 usability
  pass settled them.
- **The members' area.** One card for credit and history, one for the
  registration app, one for club admin. Each shows only to who can use it.
- **A session's own page** (who was here, cash taken, who took it). One
  session's whole night, with "Who took it" only when two people did.
- **The household page's cash, correction and transfer forms.** Each records
  something the registrar app can't.
- **Training times.** One preview per period, with past ones folded away.
