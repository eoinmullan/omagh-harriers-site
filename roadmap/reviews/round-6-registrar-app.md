# Round 6 — The registrar app

A pass over every screen of the registrar app on 21 November 2026, at phone
size (375 × 812), with the live data: the session list, creating a session,
past sessions, the five views of a night, the cash sheet, guests, and the
screens a registrar sees only when something's wrong. Nothing was saved.

Ranked by how much each matters at the gate. **All seven were made on 21 November 2026.**

---

## R1. The Paid view adds up to nearly twice what's in the tin

**The one to fix first.**

Paid is the view a registrar uses to check the tin. It lists every member of
every household that paid, including members who aren't there tonight, and
each row repeats its household's figure. On Middle Distance tonight it shows
**13 rows for 7 households**, and the cash column adds up to **£115** under a
header that says **£60**. The Kellys' £10 appears three times, under Noah,
Nori and Tanya, and only Noah is signed in.

Elsewhere, showing the household's figure on each sibling's row is the
decision recorded in CLAUDE.md, and it's fine where the question is "has this
family paid?". It isn't fine on the one view whose question is "does the
money add up?".

**Proposal:** the Paid view lists one row per household that paid tonight:
the household's name, its members who are signed in, and the amount, with the
cash cell opening the same sheet as now. The rows then add up to the header.

## R2. Done is at the bottom of the list, and there's no other way back

**Night screen.**

An app on an iPhone's home screen has no back button, so **Done** is the way
back to the session list, and it sits at the end of the list. On the Usuals
that's one scroll. On Everyone it is under 313 rows, about 24,000 pixels down.

**Proposal:** a small **‹ Sessions** in the header, beside the session name,
always visible. The Done button at the bottom can then go.

## R3. Two of the five view buttons show a number that means nothing tonight

**Night screen header.**

Usuals 16, Signed in 12 and Paid £60 are about tonight. **Everyone 313** is the
whole club, and **Guests 1** is every guest on file, not tonight's guests. A
season from now it will read "Guests 40" on a night two came. The five
buttons and their numbers take about a quarter of the screen.

**Proposal:** Everyone loses its number. Guests counts tonight's guests,
signed in. If the numbers don't earn their space, the top row can become a
plain three-way switch with no figures, which gives a few more names on
screen.

## R4. Creating a session for a squad that's already on is a detour

**Session list → Create a new session.**

The squad list doesn't say which squads already have a session today. Tap
one that does and a paragraph explains it, with **Open Middle Distance** as
the way out. The session it offers was already the first card on the same
screen. That's four steps to arrive where one tap would have.

**Proposal:** in the squad list, a squad that's already on today says so on
its own button ("on at 08:42") and opens that session when tapped, with
**Start another anyway** a small link beneath it for the rare second session.

## R5. "Tonight" on a Saturday morning, and other wording

**Small, and cheap to fix together.**

- The session list is headed **Tonight**, and lists an 08:42 session. **Today**
  is right at any hour.
- The duplicate warning says Middle Distance "already has a session tonight"
  and offers to open it as "started 08:42". A session scheduled by an admin
  wasn't started by anyone. "On at 08:42".
- Past sessions shows "Fri, 20 Nov 2026, 21:37" on a list that only reaches a
  fortnight back. The year is noise: "Fri 20 Nov, 21:37".

## R6. Row lines that repeat a name, or say nothing useful

**Night screen rows.**

- A member's line is their household's balance and the household's name:
  "£8.00 · Dominic bennett". When the member is the household contact, it
  repeats their own name: "ADAMS, Phil / −£2.00 · Phil Adams". Leave the
  household's name off when it's the member's own.
- A guest's line reads "Guest — holds no credit", which is how the system
  sees a guest, not something a registrar needs. "Guest" says it.

## R7. Sessions and actions look the same on the session list

**Session list.**

The sessions to pick and the two actions, **Create a new session** and
**Past sessions**, are the same grey cards, so nothing says which are the
choices. The usual pattern is for the things to pick to be cards and the
actions to be quieter: outlined buttons, or text links, under the list.

---

## Looked at and left alone

- **The five views.** Each still answers a different question at the gate.
  R1 and R3 are about what two of them show, not whether they exist.
- **The cash sheet.** Big amounts first, a keypad for the rest, and the
  button says what will be recorded ("Change £5 to £10").
- **The save indicator, the balance colours and the ticked-row tint.**
  Readable at a glance, and steady.
- **Adding a guest**, with the check for somebody already on file.
- **The screens for when something's wrong**: signed out, not a registrar,
  roles not reaching the app. Each says what happened and what to do.
