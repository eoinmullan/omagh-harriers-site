# Round 3 — Usability

From the user's own usability test, run against the live site on 20 November
2026. These are their notes. The fixes were made overnight on the branch
`usability-round`, **not merged**, for review in the morning.

The guiding note: **use established UI patterns rather than inventing new
ones.** Each fix below says which pattern it uses.

## Progress

Ticked as each one lands, in the order they're tackled.

### Admin area

- [x] **Creating a session gets its own dialog.** It was hard to tell the
  create form from the list. The established pattern is a primary **New
  session** button that opens a modal dialog. A native `<dialog>` handles
  focus and Escape for free.
- [x] **No placeholder in the note field** (it said "Meet at the top car park").
- [x] **No "Omagh time, as it reads on the night."** note under the start time.
- [x] **No "Leave the price blank for the usual £2.00…"** text under the form.
- [x] **A better date and time picker.** The native date picker (a calendar
  that commits on click), plus a time list in 15-minute steps, which is the
  Google Calendar pattern. No scrolling through every minute, and no clicking
  away to confirm.
- [x] **New sessions default to 6pm.**
- [x] **The households KPIs become filters.** "Overdrawn" becomes a button
  that filters to overdrawn households, and a new "In credit" does the same,
  because most households sit at £0. These are filter chips with a pressed
  state, and clicking again clears.
- [x] **Training times: current first, then upcoming, with past periods in an
  expander** (`<details>`) below.
- [ ] **Admins see what members see: training and transaction history** on a
  member's and a household's page.

### Registrar app

- [ ] **The browser back button returns from a session to the session list.**
  The history API: each screen is a history entry.
- [ ] **Preset amounts come first in the cash sheet**, as large buttons, with
  a smaller keypad below them.
- [ ] **"Pick a different session" becomes "Done".**
- [ ] **One choice of five views**, not two sets of filters that combine:
  Usuals, Everyone, Signed in, Paid, Guests. A single segmented control.
- [ ] **The app is called "Harriers Sign-in"** in the manifest, on the home
  screen and in the title.
- [ ] **The Harriers logo, small, at the top of the app's home screen.**
- [ ] **"Start a session here" becomes "Create a new session".**
- [ ] **A "Past sessions" button on the home screen**, so a registrar can
  fix something the next day.
- **App icon: on hold.** The user is getting one.

## Already resolved

- **OR1 (sign-in emails):** Resend is set up as the SMTP provider.

## Decisions made overnight

(Filled in as the work goes.)

## Questions for the morning

(Filled in as the work goes.)
