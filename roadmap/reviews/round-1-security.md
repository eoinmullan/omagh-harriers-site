# Round 1 — Security

Reviewed at `48623a4` (`main`). Split by threat model, as the roadmap asks:
the auth flow, the database under RLS, the service-role pages, the registrar
island on the anon key, and the Klubfunder CLI.

The database-level claims were confirmed live against the linked project with
read-only probes from the signed-in browser. **No privilege-escalation write was
performed** — finding S1 is reasoned from the policy text and the absence of any
code that relies on it, not exploited.

Same timing caveat as the data-integrity pass: Phase 6 (reporting) is not built,
so the service-role attack surface is smaller than it will be, and the privacy
review proper is still blocked.

---

## S1. An admin can make themselves superuser, directly, bypassing the UI

**Severity: high. Fixed by migration `0016`.**

The privilege boundary between `admin` and `superuser` is that only a superuser
hands out roles. That rule lives in exactly one place: `planRoleChange` in
`auth/roles.ts`, called from `/admin/households/[id]`, which writes with the
**service-role** client. The database does not enforce it.

The `authenticated` UPDATE policy on `principals` (from `0002`, re-expressed in
`0004`) is:

```sql
USING      (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'))
WITH CHECK (auth.jwt() ->> 'app_role' IN ('admin', 'superuser'))
```

It checks the *actor's* role and nothing about the *row* or the *columns*. RLS is
row-level, not column-level — so an admin may update any `principals` row,
including its `role` column, including their own. An admin holds a real
anon-key session (that is what the members' area runs on); from it, a single
PATCH to `principals?id=eq.<self>` with `{"role":"superuser"}` satisfies the
policy and lands. The UI's superuser-only gate is never consulted, because the UI
is not in the path.

`0002`'s own comment saw this coming:

> PostgreSQL RLS is row-level, not column-level, so we can't use a policy to
> forbid an admin from changing the `role` column ... Role changes route through
> a SECURITY DEFINER RPC that performs the superuser check before updating the
> role column directly.

**That RPC was never built.** Role changes route through TypeScript on a
service-role page instead, so the mitigation the schema documents does not exist,
and the comment reads as though it does.

The same policy lets an admin write any other `principals`/`members` field
directly — move a member between households, flip `is_active`, rename — bypassing
the page gates that reserve those identity actions for a superuser. (Moving a
member between households is also the trigger for data-integrity finding 1, so
this is the write path that makes that one reachable by an admin at will.)

**The fix is a removal, not an addition.** Every first-party write to
`principals` and `members` goes through the service-role client — confirmed by
reading all 17 call sites. The only anon-key access those tables need is SELECT
(the registrar island, the middleware, the members' area, all reads). So the
`authenticated` INSERT and UPDATE policies on both tables are relied on by
nothing and can be dropped:

```sql
DROP POLICY "Admins and superusers can insert principals" ON public.principals;
DROP POLICY "Admins and superusers can update principals" ON public.principals;
DROP POLICY "Admins and superusers can insert members"    ON public.members;
DROP POLICY "Admins and superusers can update members"    ON public.members;
```

Dropping them closes the escalation with no loss of function — the service role
bypasses RLS, so the admin pages are untouched. If a future phase ever needs an
admin to write these tables on the anon key, the role column specifically wants
the SECURITY DEFINER RPC `0002` described, or a `BEFORE UPDATE` trigger refusing
a `role` change by a non-superuser. **Confirm on staging that the admin screens
still save after the drop before trusting it.**

Done in `0016_role_is_not_an_admins_to_grant.sql`. The four policies are dropped
and the SELECT policies stay. Admin writes are unaffected by construction — the
service-role client has `BYPASSRLS`, so a dropped policy cannot change what it may
do — and that the admin write path still works was checked live by adding and
retiring a squad through `/admin/squads` after the migration. The service-role
grant's breadth is exactly why S1 existed; it is also why removing an anon-key
policy cannot touch it.

## S2. The sign-in captcha fails open when its secret is missing

**Severity: medium.**

`verifyCaptcha` in `signin.astro`:

```ts
if (import.meta.env.DEV) return true;
if (!import.meta.env.TURNSTILE_SECRET_KEY) return true;
```

The DEV line is fine. The second is a fail-open on a security control: if
`TURNSTILE_SECRET_KEY` is unset in production — never configured, rotated away,
dropped from the Pages env — every captcha is treated as passed, silently. The
sign-in form is the one unauthenticated endpoint that triggers outbound email
(magic links) and probes membership by email, so losing bot protection there is
what invites an email-send flood and amplifies enumeration attempts.

It fails open on the one side it should fail closed. Prefer: if the public site
key is configured (i.e. not DEV), require the secret and treat its absence as a
misconfiguration that refuses the submit, rather than one that waves it through.

## S3. The callback's client-side fallback skips the email-match check

**Severity: medium, latent under the current flow.**

`/signin/callback` enforces, on the server, that the address a provider returned
matches the one the member typed — the check CLAUDE.md calls load-bearing,
because without it a Microsoft alias signs you in as whoever owns the primary
address. Both server paths do it: the `code` (PKCE) path and the `token_hash`
path.

The trailing `<script>` — the implicit-flow fallback for tokens delivered in the
URL hash — does not:

```ts
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // → /members or /signin/terms, with no intended-email comparison
```

Under the current configuration this is close to dead code: `@supabase/ssr`'s
browser client defaults to PKCE, OAuth comes back as `?code=`, and magic links
arrive as `?token_hash=` — all handled server-side. But it is a standing hole
with the safety check removed: if the OAuth flow type is ever switched to
implicit, or a provider returns hash tokens, alias-mismatch sign-ins start
succeeding silently through this path.

Remove the fallback if the code flow is guaranteed, or replicate the
intended-email comparison inside it. Either way, don't leave the one path that
omits the check as the quiet default.

## S4. (cross-reference) The attendance DELETE policy has no money behind it

Covered as finding 3 of the data-integrity pass, and it is equally a security
finding: the `authenticated` DELETE policy on `attendance` is gated only on
`can_run_a_session()`, with no `guest_id IS NOT NULL` restriction, so a registrar
token can delete a member's attendance row by direct REST call and leave the
`session` debit standing — the exact money/attendance divergence the RPCs exist
to prevent. **Fixed in `0019`** by a delete trigger that refuses a charged sign-in until its refund exists; see that write-up for the live test.

## S5. The service-role key lives on the unauthenticated sign-in page

**Severity: low.**

`signin.astro` instantiates the service-role client before anyone is
authenticated, to look up membership by email. It is server-side only —
confirmed: the key appears in no served HTML or client bundle — and it is scoped
to a single `.select('id, is_active').eq('email', …)`. So this is defensible, not
a leak.

But it puts the service-role key in the code path of the most exposed public page
in the app, where a future edit (an added query, a logged object, a thrown error
rendered to the page) has the highest chance of turning into a disclosure. The
lookup wants nothing the service role's breadth provides — it needs one boolean.
A `SECURITY DEFINER` function returning "is this email an active member" would
keep the key off the public page entirely. Worth doing before the sign-in page
grows.

---

## Notes, not findings

- **The access-token hook is registered by hand, in no migration** (`0003`). If
  it is ever unregistered, every token loses its `app_role` claim. RLS fails safe
  — `current_app_role()` goes NULL and the write policies refuse — but the
  registrar app silently shows nobody their session, and nothing alarms. Already
  flagged for the operational-resilience round; restating because it is a
  security-relevant single point of trust with no schema-level guarantee.
- **The Klubfunder CSV is trusted input with the service-role key behind it.**
  A crafted export can create an auth user for any email (`email_confirm: true`,
  so that address can then sign in) and re-point members between households. The
  human running the CLI is the only gate, and the dry-run plan is what they have
  to read it. That is an accepted boundary, but the operator should know the
  dry-run is a security control, not just a safety net.

## What stood up

Confirmed, several of them live, so a later change knows the ground it rests on:

- **The publishable (anon) key is inert without a user token.** Read live as
  anon against `principals`, `members`, `credit_transactions` and `groups`: HTTP
  200, zero rows every time. RLS denies the public key everything.
- **The secret key is server-only.** It appears in no served HTML on `/`,
  `/members`, `/registrar/` or `/signin`, and the browser Supabase module
  references only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **`0008`'s own-household ledger SELECT keys on `auth.uid()`**, not the claim, so
  the one policy that survived the `role`→`app_role` repair is the correct kind.
- **`principal_balances` is `security_invoker`**, so it cannot become a way to
  read balances RLS would otherwise hide.
- **The registrar island writes nothing to `principals`/`members`** — every one
  of its references is a SELECT; its writes are attendance, guests and ledger
  rows through RLS-gated policies and the two RPCs.
- **The OAuth email-match check** on the server sign-in path does what it claims.
  (An earlier version of this list said the same of the enumeration timing-delay.
  It doesn't: the delay runs only when the lookup fails, and the messages differ
  anyway. See P6 in the privacy review.)
- **The Klubfunder CLI's guards:** `source='manual'` rows are immune from
  lapsing, every run is dry-run-first, lapsing bans rather than deletes, and
  every write is parameterised through supabase-js — no SQL or CSV-formula
  injection surface, because nothing is concatenated into SQL and nothing is
  written back to a spreadsheet.
