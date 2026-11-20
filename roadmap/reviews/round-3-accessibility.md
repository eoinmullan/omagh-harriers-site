# Round 3 — Accessibility

Reviewed at `b9324ea` (`main`), against WCAG 2.2 AA. Following the roadmap,
this review is separate from usability. Its three named concerns: *"the
balance line deliberately uses colour as the carrier … a WCAG failure if
colour is the only channel. Also the custom `role="checkbox"` rows, focus
handling, and the island under a screen reader."*

**How it was checked.** I read the code, and in the browser I checked the
accessibility tree and keyboard focus with real Tab presses. Contrast was
measured on the rendered colours: Tailwind 4 defines colours in `oklch`, so
each one was painted to a canvas and read back as sRGB, with transparency
blended over the real background. **No screen reader was run.** That needs a
person with VoiceOver on an iPhone, and it fits naturally into the usability
session. What a screen reader would announce is inferred from the
accessibility tree.

---

## The roadmap's question: is colour the only channel?

**On screen, mostly not. Off screen, entirely.** The balance line has three
tones:

| Tone | What carries it besides colour |
|---|---|
| Overdrawn (red) | a minus sign: `−£2.00` |
| Low, under tonight's price (amber) | the figure itself, and a big difference in **lightness**: amber is 14.2:1 on black, the grey is 8.1:1, so a colour-blind registrar still sees two distinct shades |
| In credit (grey) | — |

So a sighted registrar, colour-blind or not, can tell the three apart. The
tick doesn't rely on colour either: a ticked row shows a ✓ in an amber box
as well as its green tint. The roadmap was right to worry, but the failure
isn't on screen. It's that **none of this reaches a screen reader at all**,
because of A1.

## A1. A screen reader hears the runner's name and nothing else

**Severity: medium.**

Each runner row is a `<button role="checkbox" aria-checked>` with
`aria-label="Jack Kelly"`. An `aria-label` *replaces* the button's contents as
its accessible name, so the balance, the household and the tone are all
hidden from assistive technology. A screen reader announces *"Jack Kelly,
checkbox, not checked"*. It never says that the Kellys are overdrawn, or
which household Jack belongs to, which is how a registrar tells two Jack
Kellys apart.

**Fix.** Keep the name as the label and point `aria-describedby` at the
balance line. Add a visually hidden word for the tone, such as *"overdrawn"*
or *"won't cover tonight"*. The announcement becomes *"Jack Kelly, checkbox,
not checked, −£2.00 overdrawn, Mary Kelly"*. Nothing changes on screen,
which keeps the design rule that *"colour carries the warning, never the
wording"*. This one change also covers success criterion 1.4.1 (use of
colour) for people who can't see the colour.

## A2. The cash sheet doesn't take focus or close with Escape

**Severity: medium.**

The cash sheet is correctly marked up (`role="dialog"`, `aria-modal="true"`,
`aria-label="Cash from …"`), but it does nothing with focus. Tested with the
keyboard:

| Expected for a modal dialog | Found |
|---|---|
| Opening it moves focus inside | focus stays on the cash cell behind it |
| Tab stays within the dialog | Tab carries on through the page behind |
| Escape closes it | nothing happens |
| Closing returns focus to the control that opened it | it does, but only because focus never left |

A keyboard user opens the sheet and is still on the row behind it. A screen
reader user is told a modal is open but isn't in it.

**Fix**, in `CashSheet.tsx`: on mount, focus the first amount button (or the
dialog itself, with `tabIndex={-1}`). Keep Tab and Shift+Tab inside it, close
on Escape, and on unmount return focus to the cash cell that opened it.

## A3. Four small texts are below contrast minimums

**Severity: low-medium. Each is a one-class change.**

| Text | Contrast | Required |
|---|---|---|
| The empty cash cell's **"+ £"** (`neutral-600`) | **2.69:1** | 4.5:1 for text, and 3:1 because it's a control's only visible label |
| Search box placeholder (`placeholder-neutral-600` on `neutral-900`) | about **2.3:1** | 4.5:1 |
| **"ADDED"** under a cash figure (`neutral-500`, 10 px) | **3.84:1** | 4.5:1 |
| Header filter labels **"HERE ▾"** and **"MONEY COLLECTED ▾"** (11 px) | **4.43:1** | 4.5:1 |

The empty cash cell is the one that matters. It's the only cue that the cell
is a control, and at 2.69:1 on black it's barely visible at a dark track.

**Fix.** Use `neutral-400` (8.1:1) for all four, and consider 11 px or
larger for "ADDED".

Everything else measured passes comfortably: names, the three balance tones
(8.1:1, 14.2:1, and 7.0:1 on a ticked row), the cash figure (12.3:1), the
tabs (12.1:1), and the session time (8.1:1).

## A4. Small gaps on the admin pages

**Severity: low.**

- **Three filter boxes are labelled only by their placeholder.** *"Filter by
  name or email…"* on `/admin/households` and `/admin/members`, and *"Type part
  of a name…"* on a squad's page. Browsers fall back to the placeholder for the
  accessible name, but it disappears as soon as someone types. Add a
  visually hidden `<label>`.
- **The sortable Name and Balance columns don't say how they're sorted.** The
  direction is a bare ↑ or ↓, read as *"Balance, up arrow"*, and the
  `<th>` has no `aria-sort`. The sorting script should set `aria-sort` to
  `ascending`, `descending` or `none`.
- **Heading levels skip** once each on four pages: households, members, a
  squad's page, and sign-in. Minor.
- **`lang="en"` on the site, `en-GB` on the registrar app.** `en-GB` throughout
  would get British pronunciation from screen readers.

---

## What stood up

- **The checkbox rows are real buttons.** `<button role="checkbox">` gets
  focus, Space and Enter from the browser, and `aria-checked` reflects the
  state. Nothing is a clickable `<div>`.
- **Keyboard focus is visible.** A real Tab draws Chrome's ring round the
  whole row (`:focus-visible`, `rgb(153, 200, 255)` on black). Only two inputs
  remove the outline, and both replace it with a ring.
- **States are exposed.** The tabs and both header filters use
  `aria-pressed`. The refusal notices from F3 use `role="alert"`, and the
  offline and snapshot notes use `role="status"`.
- **Targets are generous.** 76 px rows, a 36 px tick box and a 72 px cash
  cell, against WCAG 2.2's 24 px minimum (2.5.8).
- **Money is never colour alone on the members' and admin pages.**
  Statements say *"added"* or *"deducted"* in words, and a negative balance
  has its minus sign as well as red.
- **Page structure.** One `<h1>` per page, `lang` set, a header cell on every
  table, `aria-current` on the admin navigation, and alt text on the logo.
