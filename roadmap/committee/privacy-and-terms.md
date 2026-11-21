# Privacy notice and terms: what the committee is approving

Drafts at `/privacy` and `/terms`, rewritten on 21 November 2026 against the
system as built and the round 1 and Phase 6 privacy reviews
(`roadmap/reviews/round-1-privacy.md`). Both end with "Draft for the club
committee's approval". That line comes off once they're agreed.

Each decision below is written into the drafts as a proposal. Agreeing the
drafts means agreeing these, so each one is worth a sentence in the minutes.

## Decisions the drafts propose

| # | Decision | What the draft says | Why |
|---|---|---|---|
| 1 | Lawful basis | Membership: necessary for the membership. Attendance, including guests: legitimate interests (knowing who was in our care, charging correctly). Financial records: the club's duty to keep accounts. No reliance on consent. | Round 1, C3. Consent would be withdrawable, which doesn't work for a ledger or an attendance record. |
| 2 | Retention, members and households | Two years after membership lapses, then name, date of birth, gender, Athletics NI number and email are removed. | Round 1, C4. Long enough for someone who misses a season to rejoin without re-entering everything. |
| 3 | Retention, training credit | Six years, as financial records, kept without personal details once those are removed. | Six years is the usual period for accounting records. The ledger can't be deleted, only made anonymous. |
| 4 | Retention, guests | Removed with their attendance a year after the last session they came to. | Round 1, P5. |
| 5 | Retention, paper sheets and downloaded reports | Destroyed once recorded or no longer needed. | Round 1, C8, and P7. No fixed period, because it's a volunteer's judgement. |
| 6 | Response time for requests | One month. | The legal maximum for a subject access request. |
| 7 | Credit handed back | A registrar or administrator can hand credit back as cash; only an administrator can move it between households; leavers' credit is returned on request. | Describes what the system already allows. If the club wants unused credit to be non-refundable, the terms and the registrar app both change. |
| 8 | Volunteers' obligations | A section of the terms for registrars and administrators: use data only for the club, keep devices locked, secure and destroy sheets and exports, report a lost device. | Round 1, C8, and the Phase 6 pass, P7. |
| 9 | Contact | `info@omaghharriers.com` for every request. | Already the club's address. Whoever reads it needs to know these requests have a deadline. |

## Still open, and not in the drafts

- **Who can see the arrears list** (Phase 6 pass, C9). Every administrator can
  see which households are overdrawn. The draft says administrators see
  everything, which is true today.
- **Whether to log report downloads** (Phase 6 pass, P7).

## What must be built before the notice is fully true

The drafts describe what the club will do. Three things in them need code
before they happen on their own rather than by hand:

- **Removing a person's details** (round 1, P4). Nothing in the system
  anonymises a member or household today. The notice promises it on request
  and after two years. Until it exists, a request means a developer doing it
  by hand.
- **Removing old guests** (round 1, P5). Guests are never removed today.
- **The copy on a registrar's phone** (round 1, P3). The notice says the app
  keeps a night's list on the phone. Today it keeps every night it has
  opened, indefinitely. The fix is small: drop snapshots older than a day or
  two, and clear them when the phone stops being a registrar's.

None of these needs a decision beyond the retention periods above. They can
be built once the periods are agreed.

## After approval

- Remove the draft line from both pages.
- Ask everyone to accept the new terms. The members' area records only that a
  household accepted, not which version, so this needs a small change before
  it can ask again.
