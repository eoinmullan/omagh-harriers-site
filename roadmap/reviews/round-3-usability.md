# Round 3 — Usability

From the user's own usability test, run against the live site on 20 November
2026. These are their notes. The fixes were made overnight on the branch
`usability-round`, **not merged**, for review in the morning.

The guiding note: **use established UI patterns rather than inventing new
ones.** Each fix below says which pattern it uses.

## Summary

**Every item is done**, except the app icon, which is on hold, on the branch `usability-round`. Nothing is merged or deployed, and no migrations were added. The tests (483) and `astro check` pass. Every screen was checked in the browser without writing any data. Decisions and questions are at the end.

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
- [x] **Preset amounts come first in the cash sheet**, as large buttons, with
  a smaller keypad below them.
- [x] **"Pick a different session" becomes "Done".**
- [x] **One choice of five views**, not two sets of filters that combine:
  Usuals, Everyone, Signed in, Paid, Guests. A single segmented control.
- [x] **The app is called "Harriers"** (first "Harriers Sign-in"; shortened on review so Android won't truncate it) in the manifest, on the home
  screen and in the title.
- [x] **The Harriers logo, small, at the top of the app's home screen.**
- [x] **"Start a session here" becomes "Create a new session".**
- [x] **A "Past sessions" button on the home screen**, so a registrar can
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

- **Five views** are one radio group in two rows: Usuals, Everyone, Guests on top, then Signed in and Paid with their figures. One is always chosen and nothing combines. The search box appears on Everyone only. "Here" and "money collected" are now "Signed in" and "Paid". The rule is `NightView` and `rosterToShow` in `training/usuals.ts`.
- **Cash sheet:** £2, £5, £10 and £20 are large amber buttons in two columns, filled when chosen. The keypad sits below them, smaller, under "Other amount". This is the usual tip or donation pattern.
- **Past sessions** covers the last 14 days, newest first, without called-off sessions (`pastSessionsWindow` in `training/tonight.ts`). A past session opens the same screen as tonight's, with its date in the header. It needs a signal and isn't cached offline, since a next-day fix happens with signal. No migration was needed, because nothing in RLS limits writes by date.
- **Back and Done** step through the screens: a session goes back to the list it was opened from, Past sessions goes back to Tonight.
- **New-session dialog** needed `m-auto`, because Tailwind's reset removes a dialog's centring. Caught in the browser this morning.

## Questions for the morning

- **Past sessions reach 14 days back.** Confirmed: 14 days is right.
- **Logging a past night writes now-dated ledger rows against an old session.** That's correct for the ledger, which is append-only and records when the entry was made. A statement will show the entry under today's date, though, naming the session. Is that acceptable?
- **The installed app's name** is now "Harriers", long and short. The icon will identify it.
- **Seen in the browser:** the admin dialog, the households filters, training times, member history, and the registrar home, Past sessions, five views, cash sheet and back navigation. To avoid writing test data, nothing was ticked or saved, and no session was created.
- **Dev server:** its served dep hash (`871913e0`) doesn't match the cache on disk (`5a04923f`). The island still rendered, only slowly. If it goes blank, restart the dev server.
