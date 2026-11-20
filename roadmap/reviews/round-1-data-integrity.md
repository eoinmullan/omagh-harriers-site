# Round 1 — Data integrity: can the ledger lie?

Reviewed at `9a8387f` (same tree as `main` at `5f96c56`). 388 tests passing.

One question, pursued hard: **is there a sequence of events that leaves a
household's pot wrong?** Not a general backend pass — the backend review is
Round 2.

In scope: `credit_transactions` and `principal_balances` (`0007`), the sign-in
RPCs (`0011`, `0013`, `0014`), `credits/ledger.ts`, `training/cash.ts`,
`training/night.ts`, `training/queue.ts`, `training/queue-sender.ts`, the RLS
that governs all of it (`0010`), and `sync/klubfunder.ts` where it touches a
balance.

**Caveat on timing.** The roadmap gates these reviews on Phase 6 (the reporting
area) being finished, and it is not built. That costs this pass little — the
ledger and its write paths are complete — but it costs the privacy and
performance reviews a lot, and those should not be run as if they were done.

---

## 1. The untick reverses a charge it never reads

**Severity: high. Fixed by migration `0015`.**

`undo_member_sign_in` establishes that a debit exists, and then rebuilds the
reversal from somewhere else:

```sql
SELECT m.principal_id, m.first_name INTO v_principal_id, v_first_name
FROM public.members m WHERE m.id = v_member_id;          -- today's household

SELECT g.name, s.price_pence INTO v_group_name, v_price_pence
FROM public.training_sessions s ... WHERE s.id = v_session_id;  -- today's price

SELECT EXISTS (
  SELECT 1 FROM public.credit_transactions t
  WHERE t.idempotency_key = 'session:' || p_attendance_id
) INTO v_charged;                                         -- a boolean
```

It locates the exact row it is reversing and then throws it away, keeping only
"yes, there was one". Both of the values it uses instead can have moved since
the charge was written.

**Wrong household.** When the Klubfunder sync moves a member between households
it re-points `members.principal_id` and leaves the ledger alone — which is
right, because the old household is the one that paid. But an untick of any
sign-in from before the move credits the member's *current* household. The old
one is permanently down by the session price and the new one up by it: two wrong
balances from one tap, in an append-only ledger, correctable only by a manual
compensating pair that somebody has to notice is needed.

**Wrong amount.** The price is meant to be settled once anyone has signed in,
and `planSessionEdit` enforces that. But `/admin/sessions/[id]` reads
`countAttendance(id)` and then issues the `update` as a second statement, so a
tick landing between the two slips a price change through. A later untick then
refunds the new price against a charge made at the old one.

**The fix removes the rule rather than adding one.** Select the row instead of
a boolean, and take `amount_pence` and `principal_id` off it:

```sql
SELECT t.principal_id, -t.amount_pence
  INTO v_principal_id, v_price_pence
FROM public.credit_transactions t
WHERE t.idempotency_key = 'session:' || p_attendance_id;
```

`v_price_pence IS NULL` then means "nothing was taken" and covers the free-session
and never-charged cases that `v_charged` covers today. The reversal becomes exact
by construction, and neither failure mode above can be reintroduced by a later
change to prices or households. `members` is still read for the first name in the
note, and `groups` for the squad name — those are labels, and stale labels are
harmless.

Done in `0015_the_untick_reads_the_charge.sql`, which also retires `v_charged`:
a NULL amount is the free session and the never-charged tick, and both want the
same answer.

**Verified against the live database**, because applying the migration proves
less than it looks: plpgsql bodies are syntax-checked when a function is created
but column references are not resolved, so a wrong one would have surfaced at the
track. Exercised as a signed-in admin, since the RPC is SECURITY INVOKER and the
service key carries no `app_role` claim.

The discriminating test is the household, which is the half `0014` got wrong:

1. Tick a member of household A. The debit lands on A at `-200`.
2. Re-point `members.principal_id` to household B, which is what the sync's
   **Move member** does.
3. Untick.

The reversal came back `principal_id` = **A**, `amount_pence` = `+200`,
`manual_adjustment`, noted *"Middle Distance sign-in corrected for James"* — the
household that paid, at the figure that left it, with the squad name from `0014`
and the first name both still resolving. On `0014` that row would have credited B
and left A permanently down. Both balances returned to their starting figures and
the member was put back.

Also exercised: a repeated untick, which wrote no second credit; and a free
session, where the tick and untick both succeeded and wrote no ledger row at all
— the NULL path that replaced `v_charged`.

It leaves two cancelling rows on that household's statement, a `-£2` debit and a
`+£2` correction. The ledger is append-only, so they stay. Net zero, and the
throwaway free session was deleted.

## 2. An untick can be aimed at a row that never existed

**Severity: medium. Fixed by migration `0019`.**

A tick is addressed by `(member, session)`; an untick is addressed by row id.
The two don't always agree on which row that is.

`sign_in_member` keys attendance `attendance:{member}:{session}` and inserts
`ON CONFLICT DO NOTHING`, so a phone whose minted id lost the race to another
writer gets the winner's id back as the return value. `queue-sender.ts` discards
it:

```ts
const { error } = await supabase.rpc('sign_in_member', { ... });
return asFailure(error);
```

and `night.ts`'s `here` map goes on holding the local id. The later untick calls
`undo_member_sign_in` with an id no row has ever carried. The function's
"already undone" branch is reached and returns silently — success, as far as the
queue is concerned:

```sql
IF v_member_id IS NULL AND v_session_id IS NULL THEN
  RETURN;
END IF;
```

The attendance row and its charge stand. The twenty-second poll then puts the
tick back on screen with no explanation, and the household stays charged for a
runner the registrar has said twice was not there.

This needs a second writer for the same `(member, session)` — the two-phones-at-
a-gate case the design anticipates everywhere else, or a phone replaying a
restored queue after the other one has already ticked.

**`guest_undo` already solves exactly this, and says so:**

> By guest and session rather than by row id: the row may have been written by
> the other phone at the gate, and this is the same fact either way.

The member path is the one that didn't get that treatment, because it has an RPC
in the way. Options, cheapest first:

- Have `queue-sender` write the returned id back into `here`. Narrows the window
  but does not close it: the write may land hours after the tap.
- Have the RPC fall back to the `attendance:{member}:{session}` key when the id
  finds nothing. Keeps the signature.
- Key the untick on `(member, session)`, as the guest path does. Honest, and a
  bigger change.

**Done differently from all three.** The queue retries forever, and that rules
out the two server-side options. Suppose A's untick lands but its response is
lost, B ticks the runner in again (row Z), and A retries. A `(member, session)`
lookup would find Z and delete a sign-in nobody wanted undone. The client
write-back can't cover an untick queued before the tick's response comes back.

So `0019` has the tick record what the phone's id turned out to mean. When
`sign_in_member` is handed X and finds row Y already there, it writes alias
X -> Y to `attendance_aliases`, and the untick follows it. The alias cascades
with Y, so a replay after Y is gone finds nothing and Z is safe. The registrar
app doesn't change.

Verified live by playing two phones as a signed-in admin:

| Step | Result |
|---|---|
| B ticks with Y | row Y, £2 charged |
| A ticks with X | Y returned; alias X -> Y recorded |
| A unticks X | Y removed, `untick:Y` +£2, alias cascaded |
| B re-ticks with Z | row Z, £2 charged |
| A *replays* the untick of X | nothing happens; **Z survives** |

Ledger afterwards: one charge and one refund each for Y and Z, nothing keyed
on X, and the household back to £0.00.

## 3. RLS lets a registrar delete attendance without reversing the charge

**Severity: medium. Overlaps the Round 1 security pass. Fixed by migration `0019`.**

The RPCs exist so that the attendance row and the money cannot diverge. The RLS
policy underneath them leaves the back door open:

```sql
CREATE POLICY "Registrars and admins can delete attendance"
  ON public.attendance FOR DELETE TO authenticated
  USING (public.can_run_a_session());
```

No `guest_id IS NOT NULL` restriction, so a direct PostgREST delete removes a
member's attendance and leaves the debit standing. The app never does this —
`guest_undo` filters on `guest_id`, which cannot match a member row — so it is
reachable only by driving the anon key by hand, which is to say by any registrar
who wants to.

Narrowing the policy alone breaks the RPC: `undo_member_sign_in` is
SECURITY INVOKER and does its own DELETE under the caller's RLS. The shape that
works is to insert the reversal *before* the delete, and add a `BEFORE DELETE`
trigger refusing a charged member row whose `untick:{id}` is not present. That
makes "the money came back" a precondition of the row going, rather than a
convention the RPC happens to follow.

**Done in `0019`**, exactly that shape. The trigger
`attendance_keeps_its_money` refuses the delete, and the untick now refunds and
then deletes. Verified live: a direct REST `DELETE` of a charged member's row,
made with a token that can run sessions, came back `400 P0001` *"That sign-in
was charged. Undo it with undo_member_sign_in, which gives the money back."*,
and the row stayed. The same row then went through the RPC cleanly. The app's
only direct delete is the guest undo, which carries no money and passes.

## 4. The transfer's balance rules are enforced only against a stale read

**Severity: low-medium.**

`planTransfer` refuses a transfer larger than the source holds, and refuses one
from a household with nothing. Both tests run against `source.balancePence` as
it was when the page rendered, and nothing in the database repeats them. Two
tabs, or two admins, each moving the whole balance: both pass, and each carries
its own per-render idempotency key so neither is refused.

The club float stays correct and no money is created — the source goes negative
by exactly what the targets gained. But a household ends up overdrawn by a
transfer the rules say cannot happen, and append-only means the correction is a
manual pair. The ledger is honest about what happened; the invariant is the
thing that isn't enforced.

## 5. Two phones can record the same cash twice

**Severity: low, and partly inherent.**

`planCashChange` writes the difference between the figure on screen and the
figure the registrar wants. That is the right design and the reason cash is never
coalesced. It protects against a double-counted *tap*; it does not protect
against a stale baseline.

A phone that has not polled shows £0 for a household that handed over £10 to the
other phone. Setting it to £10 writes a second `+£10`. The tin is then £10 short
of the ledger and the household holds credit it did not pay for. Polling is
suspended while a sheet is open — which is precisely when the cash cell is in
use.

Two people taking money for the same household is partly beyond what any schema
can prevent. What the screen could do is say that another phone has already
recorded cash for this household tonight, which is the fact the registrar is
missing.

---

## Notes, not findings

- **Two sessions for one squad in one night.** Warned about, not refused, and
  the roadmap gives the reason: the person holding the phone can see the track.
  A member ticked on both is charged twice, and it is the one duplicate charge
  the schema cannot tell from a legitimate pair. Accepted, worth restating.
- **`TRUNCATE` bypasses the append-only trigger.** It is `BEFORE UPDATE OR
  DELETE ... FOR EACH ROW`. Service-role only; goes to the security pass.
- **Club float includes lapsed households.** `principal_balances` is a LEFT JOIN
  over every principal and `/admin/households` filters `is_active` on members
  only. Defensible — the club does hold that money — but it is a liability that
  will never be drawn down, and the figure is about to be shown to a committee.
- **A sign-in never checks the balance.** A household goes overdrawn freely, by
  design, and the colour on the registrar's screen is the warning.
- **Three unbounded selects on `/admin/households`,** one a full `GROUP BY` over
  the whole ledger on every page load. Round 3.

## What stood up

Traced and correct, so that a later change knows what it would be breaking:

- Idempotency keys are derived from ids fixed at tap time, not at send time —
  including `recordedBy` on a guest sign-in, which the comment history shows was
  the one exception and was fixed.
- The free-session branch. `sign_in_member` tests the price rather than writing a
  zero row that `CHECK (amount_pence <> 0)` would refuse in front of a queue, and
  the reversal gives back nothing because nothing was taken.
- FIFO ordering against `attendance.session_id`'s RESTRICT reference: a session
  minted on the phone is always written before anything that references it.
- The hold window. Tick-then-untick inside it cancels in `enqueue` and the
  database hears about neither. A `sign_in` deliberately cancels nothing, and the
  awkward path — tick sent, untick queued, re-tick inside the window — was traced
  through: `[undo X, sign_in Z]` lands as charge X, credit `untick:X`, charge Z.
  One net charge, and the phone's id matches the row. Correct.
- `sync/klubfunder.ts` never writes to `credit_transactions`. A moved member
  leaves their history with the household that paid.
- The sign CHECK, and `manual_adjustment` as the only two-way type, which is why
  the untick credit is an adjustment rather than a positive `refund` that the
  night's takings would have counted.
- `security_invoker = true` on `principal_balances`, without which any signed-in
  member would read the whole club's balances.
- `0013`'s `IS NOT TRUE` is present on both RPCs, and `0014` kept it when it
  recreated `undo_member_sign_in`.
