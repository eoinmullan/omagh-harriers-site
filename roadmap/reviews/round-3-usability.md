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
- [x] **Admins see what members see: training and transaction history** on a
  member's and a household's page.

### Registrar app

- [x] **The browser back button returns from a session to the session list.**
  The history API: each screen is a history entry.
- [ ] **Preset amounts come first in the cash sheet**, as large buttons, with
  a smaller keypad below them.
- [x] **"Pick a different session" becomes "Done".**
- [x] **One choice of five views**, not two sets of filters that combine:
  Usuals, Everyone, Signed in, Paid, Guests. A single segmented control.
- [x] **The app is called "Harriers Sign-in"** in the manifest, on the home
  screen and in the title.
- [x] **The Harriers logo, small, at the top of the app's home screen.**
- [x] **"Start a session here" becomes "Create a new session".**
- [ ] **A "Past sessions" button on the home screen**, so a registrar can
  fix something the next day.
- **App icon: on hold.** The user is getting one.

## Already resolved

- **OR1 (sign-in emails):** Resend is set up as the SMTP provider.

## Decisions made overnight

- **Session start time** is a date picker plus a quarter-hour list, 06:00 to 22:00, default 18:00 (`sessionStartTimes` in `training/sessions.ts`).
- **A form error reopens the dialog** with what was typed and the problem inside it.
- **Training times:** the period showing now is marked "Showing now". Past periods are newest first inside the expander.
- **Admin history:** a member's page lists the 20 most recent sessions they attended, each linked. The household page already had the statement, so it's unchanged.
- **Logo** is a copy of the site's white-on-black logo at `/registrar/logo.jpg`, shown on every full screen of the app. It's under `/registrar/`, so the service worker caches it. Replacing it later needs the worker's `VERSION` bumped.
- **Done and browser back** are the same move. After either, the single session on tonight no longer opens itself, so the home screen stays reachable.
- **The manifest `short_name`** is now "Harriers Sign-in" too. Android may truncate it under the icon.

## Questions for the morning

- **Not checked in the browser.** The sign-in in the browser pane had lapsed, so none of tonight's screens were seen. Everything passes `astro check` and the tests (478). The history query was run read-only against the database and works. Please sign in again so they can be checked.
- **Still to do:** the five-way view, cash sheet presets, and Past sessions on the home screen.

## Questions for the morning

(Filled in as the work goes.)
