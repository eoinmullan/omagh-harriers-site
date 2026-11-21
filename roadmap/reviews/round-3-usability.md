# Round 3 — Usability

From the user's own usability test, run against the live site on 20 November
2026. These are their notes. The fixes were made overnight on the branch
`usability-round`, **not merged**, for review in the morning.

The guiding note: **use established UI patterns rather than inventing new
ones.** Each fix below says which pattern it uses.

## Summary

**Every item is done**, on the branch `usability-round`, including the app icon, which landed on 21 November with three smaller follow-ups. Nothing is merged or deployed, and no migrations were added. The tests (488) and `astro check` pass. Every screen was checked in the browser without writing any data. Decisions, and what was settled on review, are at the end.

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
- [x] **The app icon** is the gold runner with a checklist, from the user's
  own artwork, with a 180px Apple touch icon and favicons of its own. The
  splash and theme colour are black to match.

### Added on 21 November

- [x] **The members' area card reads "Registration app"**, with "Download
  and add to your home screen." under it. The app's signed-out steps name the
  card the same way.
- [x] **The website favicon is the gold runner on black**, with an ICO
  fallback and an Apple touch icon. The registrar app keeps its own icons.
- [x] **No "Manage squads" link beside New session.** The admin tabs already
  lead to Squads.

## Already resolved

- **OR1 (sign-in emails):** Resend is set up as the SMTP provider.

## Decisions made overnight

- **Session start time** is a date picker plus a quarter-hour list, 06:00 to 22:00, default 18:00 (`sessionStartTimes` in `training/sessions.ts`).
- **A form error reopens the dialog** with what was typed and the problem inside it.
- **Training times:** the period showing now is marked "Showing now". Past periods are newest first inside the expander.
- **Admin history:** a member's page lists the 20 most recent sessions they attended, each linked. The household page already had the statement, so it's unchanged.
- **Logo** is a copy of the site's white-on-black logo at `/registrar/logo.jpg`, shown on every full screen of the app. It's under `/registrar/`, so the service worker caches it. Replacing it later needs the worker's `VERSION` bumped.
- **Done and browser back** are the same move. After either, the single session on tonight no longer opens itself, so the home screen stays reachable.
- **The manifest `short_name`** is "Harriers", the same as the name, so Android has nothing to truncate.

- **Five views** are one radio group in two rows: Usuals, Everyone, Guests on top, then Signed in and Paid with their figures. One is always chosen and nothing combines. The search box appears on Everyone only. "Here" and "money collected" are now "Signed in" and "Paid". The rule is `NightView` and `rosterToShow` in `training/usuals.ts`.
- **Cash sheet:** £2, £5, £10 and £20 are large amber buttons in two columns, filled when chosen. The keypad sits below them, smaller, under "Other amount". This is the usual tip or donation pattern.
- **Past sessions** covers the last 14 days, newest first, without called-off sessions (`pastSessionsWindow` in `training/tonight.ts`). A past session opens the same screen as tonight's, with its date in the header. It needs a signal and isn't cached offline, since a next-day fix happens with signal. No migration was needed, because nothing in RLS limits writes by date.
- **Back and Done** step through the screens: a session goes back to the list it was opened from, Past sessions goes back to Tonight.
- **New-session dialog** needed `m-auto`, because Tailwind's reset removes a dialog's centring. Caught in the browser this morning.
- **The service worker's cache is now `registrar-v2`.** The worker serves everything under `/registrar/` from its cache first, and the icons kept their file names. Without the bump, a phone that had already opened the app would keep the old icons and the old manifest. The new worker waits for the app to be closed before it takes over, as before.

## Settled on review

- **Past sessions reach 14 days back.** Confirmed as right.
- **A statement line tied to a session now names the night** (added on review), e.g. "training session for Jack Kelly on Tue 17 Nov". A line is dated when it was entered, and a night put right later from Past sessions would otherwise read as a charge for the day it was entered. This covers the session charge, cash taken, a refund and a sign-in correction, on both the member's statement and the admin's.
- **The installed app's name** is "Harriers", long and short, shortened on review. The icon identifies it.
- **Seen in the browser:** the admin dialog, the households filters, training times, member history, and the registrar home, Past sessions, five views, cash sheet and back navigation. To avoid writing test data, nothing was ticked or saved, and no session was created.
