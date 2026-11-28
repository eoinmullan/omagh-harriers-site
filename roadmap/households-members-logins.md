# Households, members and logins

The model agreed on 28 November 2026, after the admin screens started to feel
muddled: free sessions set on Members, Emergency contacts on Households, and
a single adult showing up as both. The work is Phase 12 in
`members_area_implementation_plan.md`.

## The problem

Today one `principals` row is three things at once: the **household** that
pays, the **login** that signs in (one email), and the **person** who does
things (holds a role, opens emergency contacts, is recorded as "who did it").

Money belongs to a household and runners belong to members, and both are
stored correctly. **Privileges belong to a person, but the only thing that
can sign in is an email, and an email can be several people.** In the live
data on 28 November 2026 (ZZ test records left out):

- 313 members share 219 emails. 8 households have two or more adult members
  on one email, and 29 have a 14 to 17 year old
- One registrar shares their login with another adult and two teenagers, so
  all four could sign in as a registrar, and whatever any of them records is
  recorded as the same login
- Nothing links a login to the member it is. A single adult appears twice,
  as a household and as a member, with no way for either page to know it's
  the same person

What has to stay:

- **Nobody signs up.** The sync creates every login ahead of time
- **Everything ties back to Klubfunder**, whose export gives one contact
  email per member and nothing else. A volunteer's personal email can only
  come from somebody typing it in
- **A volunteer who isn't on Klubfunder can still be added by hand**

## The model

| | What it is | Holds |
|---|---|---|
| **Household** (`principals`, the name stays) | Who pays | Its name, its members, its balance and statement, `is_active`, `source` |
| **Login** (`logins`, new) | An email that signs into one household | The email, the Supabase user, terms accepted, role, Emergency contacts access and its reason, `source`, `is_active`; and, when it's one person's, which person |
| **Member** (`members`, unchanged) | Somebody who has paid membership and trains | Everything about a runner, trains-free included |

**A household has one login unless the superuser adds another.** The sync
creates one household and one login for each Klubfunder email, so for nearly
every household it's 1:1, as now. A second login is a second email that
signs into the same household: the same Home, balance, statement and
children. It's added for a volunteer who shares a family email, and could be
for a second parent who wants their own.

An example, with made-up names. The Kellys share `kellyfamily@gmail.com`;
Mum, Dad and two children are members, and Mum is a registrar:

| Login | Household | Whose | Access |
|---|---|---|---|
| `kellyfamily@gmail.com` (Klubfunder) | Kellys | Shared | The household's balance and statement |
| `aoife.kelly@work.com` (added by the superuser) | Kellys | Aoife Kelly, a member | The same, and Registration |

Dad keeps using the family email and has no registrar access. Every sign-in
Aoife records says Aoife.

**A login is either shared or one person's.** One person's means it names a
member, or carries a person's name of its own for somebody who isn't a
member: a coach who isn't on Klubfunder, or a parent who isn't a member but
whose Klubfunder email is theirs alone. The superuser says which. A login
with neither is shared.

**Access only goes on a login that's one person's.** A role other than
member, and Emergency contacts, are refused on a shared login, by a CHECK in
the database as well as by the screens. So a family email can never carry
Registration or Emergency contacts. For a single adult whose Klubfunder email
is their own, the superuser links that login to them once and no second
login is needed.

## Who does what

**Admin means club admin**: the club's day-to-day. **The superuser is the
site admin**, and site matters are hidden from club admins.

| | Who |
|---|---|
| Sessions, squads, money, a member's training settings (trains free) | Club admin |
| Emergency contacts access, given to a **member**, with a reason | Club admin |
| Adding a login, saying whose it is, deactivating one | Superuser |
| Making somebody an admin | Superuser |
| Registration (a flag), given to a **member** | Club admin |
| Adding a household by hand | Superuser |

A club admin never sees an email or a login. They give Registration and
Emergency contacts to a member. If that member has no login of their own, the screen says so and
who to ask, rather than offering a shared one.

The screens follow from it:

- **Members**: everything about a runner, and what they can open
  (Registration, Emergency contacts) when they have a login of their own
- **Volunteers who aren't members go at the end of Members**, under a
  heading **Not members**: anybody whose login is one person's but who is no
  member. That's a volunteer added by hand, whose household has no members,
  or a parent who isn't a member but whose Klubfunder email is theirs alone.
  Each row says *"Not a paid-up member"*, with their household for a parent,
  and carries the same badges. They're never counted as members: the header
  says *"313 members"*, with *"and 2 volunteers who aren't members"* beneath.
  Search finds them. One rule in `lib/` builds the list from members and
  named logins, members first
- **A non-member's page is slim**: their name, *"Not a paid-up member"*, and
  Access with Change, as on a member's page, plus their household for a
  parent. No squads, trains free, sessions or balance. They don't appear in
  the registrar app (somebody who trains without being a member is a guest)
  or in Emergency contacts
- **No separate page of who holds access.** The badges are filters, so
  Members filtered by Emergency lists everybody who holds it, members and
  not, with their reasons: the list a welfare officer or a DPIA asks for
- **A volunteer who joins later shows twice**, as a member and under Not
  members, until the superuser moves their login to the new household and
  says it's that member's. Their access goes with the login, and the empty
  hand-added household is retired. The sync can't do it, since it matches
  on the Klubfunder email and a volunteer's own email isn't in the export
- **Households**: the money and the members. The superuser also sees its
  **Logins**, each with whose it is and its access
- **A club admin sees a household's contact email**, its Klubfunder login's,
  labelled as the contact rather than as a login, so they can chase a
  payment
- **A club admin sees whether a member has an emergency contact on file,
  not the number.** The number stays with the Emergency contacts flag and
  its openings log

## How it's built

- **Each household's first login takes the household's id.** Today the
  household and the login are one row, so every "who did it" column already
  holds the right login's id. The five columns
  (`credit_transactions.created_by`, `training_sessions.created_by`,
  `guests.created_by`, `attendance.recorded_by`,
  `emergency_contact_openings.opened_by`) are re-pointed at `logins` by
  changing the constraint alone, with no row rewritten. That matters for the
  ledger and the openings log, which refuse UPDATE
- **What stays pointing at households**: `members.principal_id`, the
  ledger's `principal_id` and `counterparty_principal_id`, and
  `principal_balances`
- **The access-token hook** looks the login up by its Supabase user and
  writes `app_role` and `emergency_contacts` from it. A login with no
  household is `none`, as today
- **RLS** finds "my household" through the login, in one helper beside
  `own_household_member_ids()`, wrapped as `(select …)` as every policy is
- **Column grants move with the columns**: the login's role and flag are
  what the registrar app and middleware read
- **Sign-in** looks the email up in `logins`. The callback's check that the
  provider returned the same address is unchanged
- **The middleware and `whoIsSignedIn`** put the login and its household on
  `Astro.locals`
- **The Klubfunder sync** creates a household and its login together, and
  lapses a household's logins with it. It never touches a login the
  superuser added
- **The phone's Emergency contacts copy** is keyed by the login, as it was
  by the principal: the same id for every login that exists today

## Decided (28 November 2026)

- **A household lapsing lapses every login it has**, hand-added ones too. A
  household that has left the club has nothing to sign into
- **A member's own login follows them** when Klubfunder moves them to
  another household. When the member lapses, so does their own login, and
  its access with it
- **A club admin is told to ask the superusers by name.** The screen looks
  them up and names them ("Ask Eoin Mullan to add one"), so the word
  superuser still never reaches the committee
- **Registrar becomes a flag**, beside Emergency contacts, on a login that's
  one person's. The role keeps only member, admin and superuser. Done in the
  same migration, so the role column moves once. That settles Phase 8's
  question of how roles are modelled
- **An admin gets Registration without the flag**, as today, because an
  admin puts a missed night right from the registrar app's Past sessions.
  The flag is for volunteers who aren't admins
- **A club admin gives the registrar flag**, as they give Emergency
  contacts, to a member with a login of their own. Making somebody an admin
  stays with the superuser
- **The registrar flag takes no reason.** Emergency contacts asks for one so
  its list of who can see the details explains itself; a registrar is a
  registrar
