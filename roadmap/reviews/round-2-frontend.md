# Round 2 — Frontend

Reviewed at `4d29b04` (`main`). The roadmap's scope: *the registrar island,
the Astro pages, state handling, the optimistic write path.*

Findings are judged against the trust model in CLAUDE.md (Roles): what the UI
lets a well-meaning, non-technical volunteer get wrong, our own bugs, privacy,
and outsiders. A volunteer working around the app on purpose isn't a finding.

Known items aren't repeated: data integrity 5 (two phones recording the same
cash), S3 (the callback fallback), P3 (snapshots kept on the phone), P6
(sign-in enumeration), and B6's half about generating types.

---

## F1. Reloading a page can create a session or a member twice

**Severity: medium. A duplicate session splits a training night in two.**

No admin page redirects after a POST. Each one renders the result directly,
so a reload, the back button, or *Confirm Form Resubmission* sends the form
again. Whether that does harm depends on the form:

| Form | On resubmit |
|---|---|
| Ledger forms on a household | refused, because each render gets its own idempotency key |
| Add squad, add household, squad membership | refused by a uniqueness rule, but the admin sees an error |
| **Create a session** (`/admin/sessions`) | **a second identical session**, since nothing is unique on squad and time |
| **Add a member** (`/admin/members`) | **a second identical child**, if there's no Athletics NI number |

The duplicate session is the one that bites. Two registrars at the gate see
two *"Middle Distance 19:00"* entries and each picks a different one. The
night's attendance and money end up in two halves, and neither screen shows
the whole picture. An admin reloading to "see if it worked" is exactly the
honest mistake this should prevent.

Seen in practice: the test squad that came back after being deleted, during
the Round 2 backend verification, is almost certainly this, a reload
resubmitting the add-squad form.

**Fix.** Use Post/Redirect/Get throughout the admin area: after a successful
POST, redirect with a 303 to the same page and carry the confirmation in the
query string. A reload is then a GET and does nothing. As a second safeguard
on the two forms that create rows, put a per-render id in the form (as the
ledger forms already do with their key, and the registrar app does when it
starts a session) and insert with it, so a resubmit that gets through anyway
writes nothing.

## F2. A failed read looks like an empty club

**Severity: medium-low.**

Forty-four server-side reads take `data` and never look at `error`. Three
check it. When Supabase is unreachable, or a query is refused, those pages
don't fail. They render as if the tables were empty:

- `/admin/households` shows no households, a Club float of £0.00 and nobody
  overdrawn
- a household's page shows no members, and a statement with no lines
- `/admin/sessions` shows nothing coming up and nothing run

An admin looking at "no members in this household" might add them again. A
parent told their statement is empty might top up again. A blip turns into an
honest mistake.

`everyRow` (the fix for B2) already treats a failed page as a failed read. The
rest want the same rule: a small helper that returns the rows or throws, used
by every page read. Then a database failure shows as Astro's error page,
which can be styled to say *"Couldn't reach the club's records — try again
in a minute"*, rather than as a club with no data.

## F3. A refused write is reported in Postgres's words, and doesn't say what was lost

**Severity: medium-low.**

When Postgres refuses a queued write (as opposed to the network dropping it),
the queue drops it, reloads the list and shows:

```
{failure.message} — the list has been reloaded.
```

That works when the message is one of ours. *"That session was cancelled."*
is a sentence a registrar can act on. Anything else comes through raw,
*"new row violates row-level security policy for table
credit_transactions"*, for example, which means nothing at a gate.

Two other problems with it:

- **It doesn't say what was lost.** The queued write knows exactly what it
  was: Jack Kelly's tick, or £10 from the Kellys. That's the fact the
  registrar needs, because a lost cash entry means money was handed over and
  never recorded, and the only fix is to write it down now.
- **Only the last refusal shows.** When several writes fail together,
  `setRefused` overwrites each message with the next.

**Fix.** Describe the dropped write, not the error. Build the message from
the queue item (*"Jack Kelly's sign-in wasn't saved"*, *"£10 from the Kellys
wasn't recorded — note it on paper"*), keep every one until it's dismissed,
and keep Postgres's text in a detail line for whoever investigates later.

## F4. Every query cast matches today, but nothing would catch it if one stopped

**Severity: low. The other half of B6.**

Ten places cast a query result through `unknown`, or take it as `unknown`
(the session picker's `asSelectable`). Each was checked: the fields each one
declares are exactly what its query selects, so none is hiding a mismatch
today. That's down to care, not checking. The session picker was one of these
until this morning. Once the types are generated (the code-quality review),
these casts should go, so that a dropped or renamed column fails `astro
check` instead of failing at the track.

---

## Notes, not findings

- **Adding a member validates in the page** (`admin/members.astro`), against
  the project's rule that every rule lives in a tested `lib/` module. That's
  for the code-quality review.
- **The household transfer form lists all 220 households** in one `<select>`.
  That's for the usability review.

## What stood up

- **No stored text is rendered as HTML anywhere.** There's no `set:html`,
  `innerHTML`, `dangerouslySetInnerHTML` or `insertAdjacentHTML` in the app.
  Names, notes and guests' names all go through Astro's or React's escaping.
  Free text typed by volunteers and parents can't become markup.
- **The optimistic write path.** The rules are in `night.ts`, `queue.ts` and
  `watching.ts`, all unit tested. A pending row can't be unticked before it
  exists. The refresh waits while this phone still has writes to send. A
  restored backlog brings the screen up to date once it has landed. Cash
  differences are never merged. The design holds; F3 is about what it says
  when something is refused, not how it behaves.
- **The registrar app after this session's changes.** After `0018`, `0019` and
  `0020` it loads with every request returning 200, and shows the same
  Usuals, balances and headcount as before.
- **Each household's credit statement** is read with the service role but
  limited to the member's own household, and it still says "another account"
  rather than naming the other household in a transfer.
