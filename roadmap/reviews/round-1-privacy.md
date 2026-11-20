# Round 1 — Privacy and data protection

Reviewed at `add6f6b` (`main`).

The club holds children's names, dates of birth and gender, parents' email
addresses, and a record of who paid what and who trained when. It is a UK club,
so this is UK GDPR and the Data Protection Act 2018, with the ICO as regulator.
Nothing here is legal advice. Where a finding needs a decision about what the
club *should* do, it's filed under committee work rather than presented as a
code fix.

**Scope, stated plainly.** The roadmap gates this review on Phase 6, and Phase 6
is not built. The reporting area, and the CSV export on every report, will be the
largest privacy surface in the system: bulk reads of children's data, and files
that leave it. None of that can be reviewed yet. Findings P1 to P6 cover what
exists today. **This pass has to be repeated, scoped to the reporting area, once
Phase 6 lands.** The last section sets out what that pass should look for.

Findings come in two kinds. P1 to P6 are code and schema. C1 to C8 are for the
committee, and the roadmap is right that they need lead time.

---

## P1. Names are frozen into append-only ledger rows

**Severity: high, and only cheap before go-live.**

`credit_transactions` is append-only. A trigger refuses UPDATE and DELETE, even
from the service role. Three code paths write a person's name into its `notes`
column:

| Writer | Note | Whose name |
|---|---|---|
| `undo_member_sign_in` (`0015`) | *"Middle Distance sign-in corrected for James"* | a child's first name |
| `planTransfer`, outgoing row | *"Transferred to Dominic Bennett — …"* | the other household's contact |
| `planTransfer`, incoming row | *"Transferred from Caroline Conway — …"* | the other household's contact |

Once one of these rows is written, the name is permanent. No erasure request,
anonymisation pass or correction can reach it, because the table is built to make
editing impossible. The transfer case is worse, because it writes one household's
name into *another* household's statement. Erasing the Conways would then mean
editing the Bennetts' ledger.

The fix is to store identifiers and render names when the statement is read.
`member_id` is already on the untick row, so the note can just say *"sign-in
corrected"* and `transactions.ts` can supply the name, the way it already does
for session debits. A transfer row needs the counterparty's `principal_id`,
which means one new nullable column, and `transactions.ts` resolves it to a name
at render time.

**Timing is the reason to do this now.** Every row in the database today is test
data. After go-live, every row this writes is a real name that can never be
removed. Fixing it needs a migration (new column, and `0015`'s function
recreated), a change to `ledger.ts`, and rendering changes in `transactions.ts`.

## P2. A registrar's token reads far more than the app uses

**Severity: high.**

A registrar is a volunteer, often on a borrowed phone. The registrar app selects
exactly this from the people tables:

```
members:    id, first_name, surname, principal_id
principals: display_name   (via the embed), and the registrar's own id
guests:     id, first_name, surname
```

It never uses date of birth, gender, Athletics NI number, or anyone else's email.
But the RLS policies from `0010` grant whole rows:

```sql
CREATE POLICY "Registrars can read all members"    ON public.members    FOR SELECT ... USING (current_app_role() = 'registrar');
CREATE POLICY "Registrars can read all principals" ON public.principals FOR SELECT ... USING (current_app_role() = 'registrar');
```

So any registrar's token can read every child's date of birth, gender and
association number, and every family's email address, with one REST call. The
app's queries are already well minimised. The gap is between what it asks for and
what it would be given.

This one is less simple than S1, because a column-level `REVOKE` on
`authenticated` would also hit members, and a member's own page reads their
children's dates of birth (`members/index.astro`). The workable shapes:

- A view that exposes only the registrar's columns, with the registrar's read
  policy on the view and removed from the base tables. The island queries the
  view.
- Or a `SECURITY DEFINER` function that returns the night's list, which keeps the
  base tables closed to the registrar entirely.

Either way it needs a migration plus a query change in `AttendanceView.tsx`. The
same question applies to admins on the anon key. They hold whole-row SELECT too,
but every admin page reads through the service role, so the anon-key grant may be
unused, as the INSERT/UPDATE grants were in S1. Check that before deciding.

## P3. The registrar's phone keeps a full-club snapshot forever

**Severity: medium.**

`AttendanceView` saves its whole loaded state to IndexedDB on every change, keyed
by session. The loaded state includes the **entire active club**, because the
members query filters only on `is_active` (search needs everyone), along with
every household's balance, the night's attendance and the guest list. The session
picker adds a snapshot per day.

Nothing deletes any of it. Not sign-out, not losing the registrar role (the app
shows `NotForYou` and leaves storage alone), and not age. A borrowed phone that
opens thirty sessions over a season ends up holding thirty copies of every child's
name and every family's balance. Anyone with the phone and a desktop browser's
devtools can read them.

The offline design needs a snapshot. It doesn't need an old one. Two small
changes, neither of which needs a migration:

- Prune on load. Drop any snapshot older than a day or two, since one that old
  would never be shown as "tonight" anyway.
- Clear on refusal. When the token carries no registrar role (the `NotForYou`
  path), or on sign-out, delete the snapshot store. The queue store too, but only
  once it is empty, because a queued write is owed money.

## P4. There is no way to erase anybody

**Severity: medium. It is the reason for P1, and it blocks C4.**

Every foreign key into `principals` and `members` is `ON DELETE RESTRICT`. The
ledger, attendance, sessions, guests and the `created_by`/`recorded_by` columns
all pin their rows. That is correct for financial integrity: a household that
ever paid £2 must keep existing. But it means erasure can only be done by
**anonymisation**, and nothing in the codebase anonymises anything. A search for
`anonymi`, `purge`, `retention`, `erase` and `forget` across the app, the
migrations and the scripts returns nothing.

Meanwhile the privacy notice says *"To correct or delete your data, please contact
the club committee"*. The committee would find nothing in the admin area that does
it, and a DELETE that the database refuses.

What the action needs to do, once the committee has decided policy (C4):

- Overwrite the PII on the `principals` and `members` rows: name, email,
  `date_of_birth` (currently `NOT NULL`, so it needs a sentinel or a migration to
  make it nullable), gender and association number.
- Remove `member_groups` rows.
- Delete or ban the auth user.
- Leave the ledger and attendance intact. With P1 fixed, those rows then point at
  an anonymised person and say nothing about who they were.

## P5. Guests are recorded without ever being told

**Severity: low.**

A guest is somebody who isn't a member. Their first name and surname are kept in
`guests` and linked to every session they attend, but they never sign in, never
accept terms and never see the privacy notice. Nothing has a retention period:
`guests.created_by` is RESTRICT and the rows simply accumulate.

The data is small, and keeping it has a real purpose (so that a returning guest
is offered rather than duplicated). But it has to be covered by the notice
(C2) and given a retention period (C4). The simplest version: guests who haven't
attended for N months are deleted, along with their attendance rows. That is
possible because attendance isn't append-only, and guest cash was never in the
ledger.

## P6. The sign-in page tells anyone whether an email belongs to a member

**Severity: low on its own. A committee decision because of who the members are.**

`membershipProblem` in `signin.astro` answers three different ways:

- an active member's email moves on to sign-in choices or *"Check your email"*;
- a lapsed one gets *"Your membership is no longer active"*;
- an unknown one gets *"We couldn't find that email on our member list"*.

So the page confirms, to anyone, whether a given address belongs to a current
member, a lapsed member or nobody. In practice that means whether somebody's
child is in the club. Turnstile limits doing this in bulk. It doesn't stop a
single targeted check.

There is also a 2-second delay whose comment says it exists *"so timing doesn't
reveal whether the email exists"*. It runs only on the failure branch, so it adds
a two-second difference between member and non-member rather than removing one.
Given the messages, it protects nothing either way.

Helpful messages are a reasonable choice, and a parent typing the wrong address
gets real value from them. But it should be a decision rather than a side effect.
The non-disclosing alternative is a single response for every case (*"If that
address is on our list, we've sent a link"*), at the cost of the
wrong-address help. If the helpful version stays, delete the delay, because it
only makes things worse.

---

## Committee work

These need decisions or wording from the club rather than code. They're listed so
that the lead time starts now.

**C1. The privacy notice is a published draft.** It ends with *"Final wording to
be approved by the club committee"*, says *"Last updated: May 2026"*, and was
written before Phase 5 brought in registrars, attendance and guests. The terms
page carries the same draft line.

**C2. The notice's inventory and audience are incomplete.** It lists names, dates
of birth, email, association number, status, balance and attendance. It leaves
out gender, the cash and payment records, who recorded each entry, and guests'
names. Its *"Who can see it"* says the household contact and administrators. It
doesn't mention **registrars, who read the whole club**, and that is the line a
parent would most want to know.

**C3. No lawful basis is stated.** The notice says why the data is used but not on
what basis. The committee needs to decide and say which basis covers membership
administration, attendance and payments, and whether anything relies on consent.

**C4. No retention periods.** This matters most for lapsed juniors. The sync
lapses a member and bans the auth user for "~100 years", and nothing ever removes
the date of birth. The committee needs periods for: lapsed members, lapsed
households, guests, the ledger (financial records usually carry their own minimum
retention, which is a reason to anonymise rather than delete), and attendance.
P4 is the mechanism that will carry these out.

**C5. Rights are incompletely stated.** The notice mentions correction and
deletion. It should also cover access, the right to object, and the right to
complain to the ICO. Since most data subjects are children, it should say plainly
that it is addressed to parents and guardians.

**C6. Processors aren't named.** *"Not shared with third parties"* is accurate
about sharing as a controller, but the notice should list who processes data on
the club's behalf:

- Supabase, for the database, hosted in West EU (Ireland)
- Cloudflare, for hosting and the sign-in captcha
- Google and Microsoft, at sign-in for members who choose them
- Klubfunder, as the source of the data

**C7. The deletion promise contradicts the system.** *"Deletion of your account
will result in loss of … training credit history"* describes something the schema
forbids. Until P4 exists, the notice should describe what actually happens
(anonymisation, with financial records kept for the retention period) rather than
deletion.

**C8. Data outside the system.** Two copies of members' data live where no code
can manage them, and both need handling guidance rather than code:

- The Klubfunder CSV sits on an admin's laptop. It is a full export with more
  fields than the sync imports.
- The printed paper sheet (`/admin/sessions/[id]/sheet`) carries children's
  names and household credit.

Who may hold them, how long for, and how they're disposed of.

---

## For the Phase 6 pass

When the reporting area exists, this review should be repeated against it.
Things to check:

- **Column minimisation per report.** "Attendance by member" needs names and
  dates. It doesn't need dates of birth. Each report should select only what it
  shows.
- **Every CSV export is a file leaving the system**, often into email and shared
  drives. Consider excluding dates of birth and emails by default, and recording
  who exported what and when.
- **"Member balances" with an arrears sub-list** is a list of families who owe
  money. Decide who among the admins should see it.
- **Day and session reports name who recorded each entry**, which is personal
  data about volunteers as well as members.

## What stood up

- **The database is in the EU (West EU, Ireland)**, so there's no transfer
  question for the core data.
- **The anonymous key reads nothing.** Confirmed live in the security pass: zero
  rows on every sensitive table.
- **A member sees their own household and nothing else.** The member policies key
  on `auth.uid()`, and `/members/credits` uses the service role only to name the
  admin on each line, scoped to the member's own `principal_id`.
- **The registrar app's queries are minimised.** It asks for names and the
  household's name, and nothing more. P2 is a policy gap, not an app one.
- **The service worker never caches cross-origin responses**, so Supabase data
  isn't sitting in the HTTP cache. P3 is the IndexedDB snapshot, which is a
  separate store.
- **The OAuth callback deliberately doesn't log the mismatched addresses.** It
  records that a mismatch happened, without either email.
- **The sync lapses rather than deletes**, which is right for integrity. The gap
  is that nothing follows a lapse with a retention decision (C4, P4).
