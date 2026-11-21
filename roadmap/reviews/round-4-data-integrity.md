# Round 4 — Data integrity (delta)

Reviewed at `593f2ab` (`main`), against the round 1 review at `add6f6b`.

The same question as round 1, **can the ledger lie?**, asked only of what rounds
2 and 3 changed, plus what landed on 21 November: 51 commits, migrations `0017`
to `0022`, the write queue's retry rules, the admin forms' redirect-after-post
and form ids, the ledger forms' move onto the household page, Past sessions in
the registrar app, the members' training history, the Phase 6 reports and the
two SQL clean-up scripts.

One finding, and one thing found in passing that belongs to resilience rather
than to the ledger.

---

## D4-1. A replayed guest untick can delete the guest's next sign-in, and their cash

**Severity: medium-low. Pre-existing, but round 2 is what showed it to be wrong.**

`guest_undo` in `queue-sender.ts` deletes by guest and session:

```ts
.from('attendance').delete().eq('session_id', write.sessionId).eq('guest_id', write.guestId)
```

Round 1 held this up as the pattern to copy for members. Then migration `0019`,
in round 2, worked out why that pattern is wrong when the queue retries forever,
and fixed it for members only. Its own reasoning:

> If A's untick lands but its response is lost, B ticks the runner in again
> (row Z), and A retries, the fallback finds Z and deletes a sign-in nobody
> wanted undone.

The same sequence works for a guest:

1. Phone A unticks a guest. The delete lands, but the response is lost on track
   wifi, so A keeps the write and retries.
2. Phone B, at the same gate, ticks the same guest back in: a new row, the
   same `attendance:guest:{guest}:{session}` key (the old row is gone), and
   the £2 they paid on `amount_paid_pence`.
3. A's retry lands and deletes B's row.

The guest is no longer signed in, and the £2 they handed over is no longer
recorded anywhere: a guest's money lives on their attendance row, not in the
ledger. The tin comes out £2 over with nothing to say why. Nothing errors, so
nobody is told.

It needs two phones, a lost response and a re-tick inside the retry window,
which is why the severity is low. It is the one write left that can remove a
row it wasn't aimed at.

**Fix:** mirror `0019` for guests.

- Mint the guest attendance id on the phone, as a member's is, and send it
  with the write.
- Add the guest to the alias table, or a twin of it, when the insert finds the
  key already taken by the other phone's row.
- Delete by that id, or by the alias, never by (guest, session). A replay after
  the row is gone then finds nothing.

The rule belongs in `guests.ts` and an RPC, unit tested like `0019`'s.

---

## Found in passing: the offline shell can be replaced by a captive portal page

**Severity: medium for the registrar at a track. Resilience, not the ledger.**

The service worker's navigation branch caches whatever comes back as the
offline shell:

```js
fetch(request).then((response) => { cache.put(SHELL, response.clone()); ... })
```

It doesn't check `response.ok` or `response.redirected`. Leisure-centre wifi
often has a captive portal, which answers every request with a redirect to its
own sign-in page. The phone fetches `/registrar/`, follows the redirect, gets
the portal's page with a 200, shows it (fine, that is the network), and caches
it as the shell (not fine). The next time the registrar opens the app with no
signal, they get the portal's page instead of the app, and paper is the only
fallback. A deploy that briefly serves an error page does the same.

The branch added on 21 November for the manifest and icons checks
`response.ok` but not `redirected`, so a portal can replace those too.

**Fix:** cache only when `response.ok && !response.redirected`, in both
branches. Navigations that fail the check still go to the screen, they just
don't overwrite what was saved. Bump `VERSION` with it.

---

## What stood up

- **`0019`'s alias and its trigger.** An untick follows the alias, the alias
  cascades with its row, and every key comes from the real row's id, so two
  phones unticking one runner refund once. `attendance_keeps_its_money`
  refuses a DELETE that would keep a charge, whoever sends it.
- **`0020`'s `squad_regulars`** is `security_invoker` and a `DISTINCT` with no
  money in it.
- **`0022` changes only how often a policy is worked out.** Each `ALTER POLICY`
  wraps the same expression in `(select …)`. The predicates are unchanged.
- **The queue retries only what is safe to repeat.** Every write is keyed on
  ids minted at tap time, and `failureFrom` retries timeouts, deadlocks and
  unreachable databases but gives up on a refusal. Cash is never coalesced.
- **The ledger forms kept their guard when they moved** onto the household
  page. Each render mints a new `idempotency_key`, a resubmit sends the old
  one and the unique index refuses it, and a transfer is still one multi-row
  insert.
- **Redirect-after-post and form ids.** A reload after success is a GET, and a
  double-submitted create carries one id, so it writes one row.
- **Past sessions charge correctly.** A late tick charges the session's own
  `price_pence`, and `sign_in_member` still refuses a cancelled session. The
  statement names the night, so a next-day correction doesn't look like a
  charge for the wrong day.
- **The reports only read.** Money uses `session-cash.ts`'s rule, and an
  untick's refund is a `manual_adjustment`, so it is correctly left out of
  cash. The totals agree with the Sessions screen to the penny on the live
  test data (£103 for November).
- **The clean-up scripts** were run against a local copy of the schema built
  from all 22 migrations. They removed exactly the ZZ rows, left real
  balances right, and left both guards back on.
