# Round 4 — Security (delta)

Reviewed at `593f2ab` (`main`), against the round 1 review at `add6f6b`.

Scoped to what rounds 2 and 3 changed, plus what landed on 21 November:
migrations `0017` to `0022`, the middleware handing the signed-in principal to
pages, the flash cookie and form ids, `loginFor`, the household and member
create forms, Past sessions in the registrar app, the service worker's caching
change, `/members/training`, the Phase 6 reports and their CSV exports, and the
two SQL clean-up scripts.

Judged against the trust model in `CLAUDE.md`: registrars and admins are
trusted volunteers, so a volunteer misusing their own access is not a finding.
Outsiders, a lost phone and our own bugs are.

One low finding.

---

## S4-1. The CSV formula guard misses a leading tab or carriage return

**Severity: low.**

**Fixed, 21 November 2026**: the pattern includes a tab and a carriage return, with a test for each.

`lib/reports/csv.ts` prefixes an apostrophe to a text cell starting with `=`,
`+`, `-` or `@`, so a name typed into the app can't run as a spreadsheet
formula when an admin opens the export. OWASP's list also includes a leading
tab and carriage return, which some spreadsheet programs strip before deciding
whether a cell is a formula.

The text in these exports is household names, guest names, squad names and
session notes. A guest's name is typed by a registrar at the gate, so it is the
one field an outsider can influence, through whoever they tell the registrar
they are.

**Fix:** widen the pattern to `/^[=+\-@\t\r]/` and add a test for each.

---

## What stood up

- **Cross-site form posts are refused.** `security.checkOrigin` is on, so
  Astro rejects a POST whose origin isn't the site. The CSV downloads are GETs,
  which another site can trigger but can't read.
- **The middleware reads the role from `principals`, not the token**, and
  hands that principal to pages through `whoIsSignedIn`, which throws on any
  page the middleware doesn't gate rather than rendering for nobody.
- **Superuser-only writes are checked on the server.** Adding a household or
  member, editing a member and the household identity actions all test
  `isSuperuser` before acting, not only in what the page draws.
- **The flash cookie** is `httpOnly`, `sameSite=lax`, `secure` in production
  and lives a minute. Its text is rendered through Astro, which escapes it.
- **`loginFor` only deletes a login it created**, and the households page
  refuses an email that already belongs to a household before touching logins.
- **`0018`'s column grants hold.** A login reads names and roles, never a date
  of birth, gender, Athletics NI number or email. Nothing since has added a
  blanket grant.
- **`0022` keeps every policy's predicate**, only evaluated once per query.
- **`/members/training` reads on the member's own session**, so RLS applies,
  and filters explicitly to the household's members, because a registrar's or
  admin's RLS would otherwise return the whole club's attendance.
- **The reports are behind the `/admin` gate** like every admin page. The CSV
  file name is built only from dates that have been validated as real days,
  and the response is `Cache-Control: no-store`.
- **The service worker's scope is unchanged** at `/registrar/`, and it still
  never touches a cross-origin request, so no Supabase response is cached.
- **Past sessions are a UI limit, as they should be.** RLS lets a registrar
  write to any session, which the trust model accepts. The app offers the last
  fortnight.
- **The clean-up scripts need the table owner.** They switch the guarding
  triggers off only inside their own transaction, are dry runs unless a
  confirmation line is uncommented, and can't be run from the app or with the
  service-role key.
