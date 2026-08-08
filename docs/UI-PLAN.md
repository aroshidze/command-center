# The interface plan

**Date:** 30 July 2026. **Evidence:** [RESEARCH.md](./RESEARCH.md) §10–§16 — measurements first, argument
after. **Brief:** [UI-OVERHAUL-BRIEF.md](./UI-OVERHAUL-BRIEF.md).

Nothing here has been built yet. This document exists to be disagreed with before it costs anything.

---

## 1. What is actually wrong, in one paragraph

The hub is not ugly so much as **undesigned in one specific way: it has no idea what is important.** Every
task is a card with the same weight; twenty-six saturated blue buttons shout louder than the four blocked
decisions above them; and at 1920px, with a realistic 21 tasks and 4 decisions loaded, the page is six
screens tall and **not one task is above the fold**. The two reported layout bugs are symptoms of the same
thing — a card is the wrong container for both a one-line errand and a nineteen-step procedure, so
whichever one you size for, the other breaks. Growing the card fixed the symptom and moved the empty space
inside the border: the opened card is 1,364px wide with 570px of content in it.

## 2. The design direction

**A queue with a reading pane.** One screen, no navigation, two zones on a desktop and one on a phone.

The change of shape is the point: **a list is the right container for "what needs me", and a document is
the right container for "how do I do it".** Today both are the same card, which is why neither works. A
task collapses to a row of about 34px on a mouse-driven display; opening one fills a reading pane beside
the list instead of shoving fifteen other tasks down the page.

```
DESKTOP  >= 1100px

+---------------------------------------------------------------------------+
| Command Center            [4 decisions] [21 tasks - 6h 30m] [1 waiting]    |  <- counts are filters
+-----------------------------------------+---------------------------------+
|  QUEUE                    (scrolls)     |  READING PANE       (sticky)    |
|                                         |                                 |
|  DECISIONS - AN AGENT IS BLOCKED        |  Set up the Google Cloud        |
|  +-----------------------------------+  |  project and OAuth client       |
|  | Reuse the bucket, or a new one?   |  |  harbour-lights - 25 min        |
|  | context, deadline, 4 options      |  |                                 |
|  | [Reuse] [New] [CDN] [Hold]        |  |   1. Open console.cloud...      |
|  | + add a comment                   |  |   2. Click the project picker   |
|  +-----------------------------------+  |   ... 19 steps at a readable    |
|                                         |       measure, not a ladder     |
|  harbour-lights            16 - 6h 30m  |                                 |
|  o  Set up Google Cloud OAuth  25m  19> |  You know it worked when: ...   |
|  o  Finish Stripe activation   20m   2> |  Watch out for: ...             |
|  o  Point the domain at Vercel 10m   2> |  [ note to the agent          ] |
|  o  ...                                 |  [ I've done this ]             |
|                                         |                                 |
|  tuck-shop                    2 - 25m   |  (nothing selected -> projects, |
|  o  Buy a UK number            10m   1> |   last sync, and the compose    |
|                                         |   box live here instead)        |
+-----------------------------------------+---------------------------------+

PHONE  < 1100px  (and anything with a coarse pointer keeps 44px targets)

+---------------------------+     tapping a task row opens the same
| Command Center            |     detail full-screen over the list,
| 4 decisions - 21 tasks    |     with a back control. Decisions are
+---------------------------+     NOT behind a tap: their options stay
| Reuse the bucket, or...   |     inline, because one-tap answering
| [Reuse]                   |     from a notification is the whole
| [Create a catalogue...]   |     product and must not gain a step.
| [Put them behind the CDN] |
| [Hold the import]         |
| + add a comment           |
+---------------------------+
| harbour-lights  16 - 6h30 |
| o Set up Google Cloud 19> |
| o Finish Stripe        2> |
+---------------------------+
```

### Why this shape and not another

- **It solves the reported bug at the root instead of patching it.** Nineteen steps get a 640–720px
  reading measure at every desktop width, and the queue stays visible beside them, so opening a task no
  longer costs you your place in the list. `grid-column: 1 / -1` and the `max-width: 760px` that empties
  the card both disappear.
- **It puts "your turn" on the first screen.** Rows instead of cards is roughly a 4× density change; the
  target is the whole fixture visible in under three screens at 1920 instead of six, with real task
  controls above the fold instead of zero.
- **It does not add navigation.** One URL, no tabs, no routes. Selecting a row is component state. This
  matters: RESEARCH §7 causes 3 and 6 are access friction, and abandonment clusters in week one.
- **Both surfaces stay first-class.** The phone is not the desktop with the pane hidden — it is the queue,
  and the pane becomes a full-screen layer only for tasks, which already cost a tap ("Show me how"). Net
  taps on a phone: unchanged for tasks, unchanged for decisions.
- **It is honest about the one regression.** On a phone, an opened task covers the list instead of sitting
  in it. That is a real change and it is called out in §7 below rather than smoothed over.

### What stays exactly as it is

Every hard constraint, unchanged and re-verified: no optimistic UI, the server's actual failure reason,
no API change, no secrets, nothing copied from a repo, an empty hub reads as success, no auto-refresh, and
every explanatory comment survives. No new dependency (RESEARCH §13).

## 3. Colour, type and weight

The palette gains **roles instead of names** (RESEARCH §12, Radix's method, hand-authored — no package).
Eleven ad-hoc variables become a documented scale: two backgrounds, three component states, three borders
including a dedicated focus ring, two solid fills, two text levels, plus the amber decision accent.

Three specific corrections, all measured:

| Now | Ratio | Becomes |
|---|---|---|
| White on `--accent #4c8dff`, 16px/600 | **3.20** — fails AA | a darker accent fill, or near-black text on it; target ≥ 4.5 |
| `--dimmer #6b7285` on `--bg`, 12.5px | **4.02** — fails AA | lifted until ≥ 4.5 at its rendered size |
| `.kbd-hint` on the amber card | **3.47** — fails AA | lifted until ≥ 4.5 |

And two changes of judgement, both from Linear's 12 March 2026 refresh and both stated as *their*
reasoning, not as taste:

- **"Don't compete for attention you haven't earned."** 26 saturated blue buttons become a handful. A
  task's primary action lives where the task is open, not repeated on every row. Decisions keep the amber
  because they are the expensive thing.
- **"Structure should be felt, not seen."** Today a card carries a border *and* a coloured left edge *and*
  a background change. One separator, not three. The project colour survives — it is genuinely useful at
  four projects and it is derived, not configured — as a small dot rather than a stripe on every card.

The base surface moves from `#0c0e13` (a cool blue-black) toward a warmer, less saturated neutral, which
is the change Linear made and the reason they gave was legibility at density rather than fashion.

Type: one scale rather than fourteen hand-picked sizes, `font-variant-numeric: tabular-nums` on the
minute column so the right-hand numbers stop jittering, and `text-wrap: balance` on titles as progressive
enhancement (Baseline newly available; does nothing where unsupported).

## 4. Keyboard, focus and announcement

This is a speed feature. Measured cost today: **18 tab stops** to reach the first task, **5 controls a
keyboard cannot reach at all**, and **zero `:focus` rules in the stylesheet**.

- Every `role="button"` div becomes a real `<button>`. (The project collapse headers currently claim to be
  buttons, are not focusable, and have no key handler.)
- One `:focus-visible` ring, defined once, visible on the dark surface.
- `↑`/`↓` move the selection in the queue, `Enter` opens, `Esc` closes, and the shortcuts are suppressed
  while a text field has focus. `Ctrl/Cmd+Enter` to submit stays as it is — it is already right.
- `<main>`, a skip link, real `<ul>` semantics for the queue, and labels on the five textareas and the
  project `<select>` that currently have none.
- **The save-state line gets `role="status"`.** Twenty-seven of them, none announced today. Hard
  constraints 1 and 2 are the reason this element exists at all.

## 5. The dashboard question, answered

**The main screen stays an action queue. The counts become controls.** Clicking "4 decisions" filters the
queue to decisions; clicking a project filters to that project. Nothing is added that you can only look
at. Evidence in RESEARCH §14: of 89 professionally built dashboards in a 2025 scoping review, **only 47%
were still active** — and the authors' finding is that actionability cannot be added to a finished
dashboard afterwards.

Roadmaps and statistics screens stay refused (hard constraint 5). The rule to apply to anything proposed
later, so it can be applied without me: **if clicking it does nothing, it does not go on the page.**

## 6. How each step is verified — the part that gets audited

### 6.1 The checks go in FIRST, and must be red before anything is built

The brief asks for proof that each new check fails when the thing it checks is broken. The strongest
available form of that is not to inject a fault afterwards — it is to **write every check against the
current UI and watch it fail on the current code**, then make it pass. So phase 0 lands the checks, red,
before a single line of interface changes. Each one *also* gets a runtime fault injection, the way the
existing fill check does, so it cannot quietly stop being able to fail six months from now.

| # | New check | Value today | Passes at |
|---|---|---|---|
| L1 | Every major section fills ≥ 90% of the content column at 1280 and 1920 | `.asks` **0.577** | ≥ 0.90 |
| L2 | An opened item's content fills ≥ 90% of its container | **0.570** | ≥ 0.90 |
| L3 | Task controls above the fold at 1280 / 1920 | **0** | ≥ 6 |
| L4 | Page height with the fixture loaded, at 1920 | **6.0 screens** | ≤ 3.0 |
| L5 | No sideways scroll, nothing past the viewport edge | passes | keep |
| L6 | Exactly one column at 390 | passes | keep |
| C1 | Every rendered text/background pair meets WCAG 2.2 AA for its size and weight | **3 failures** | 0 |
| K1 | Everything with a button role is focusable and fires on Enter and Space | **5 unreachable** | 0 |
| K2 | Every focusable control has a computed focus style distinct from its unfocused state | **0 rules** | all |
| K3 | Tab stops before the first task control at 1920 | **18** | ≤ 8 |
| A1 | Save-state elements are inside a live region | **0 of 27** | all |

L5, L6 and the existing fill metric stay; they are the checks that already caught something.

### 6.2 Reproducible data

`tests/fixture.mjs` (written, and the numbers above come from it) loads 22 tasks across 4 projects, one
with 19 steps, one blocked, plus 4 decisions, one with 4 options — into the **dev** database only. It
refuses to run against anything but localhost and refuses if Telegram sending is live. `--clear` leaves
the hub empty, which is the success state and gets its own screenshot.

Before this, `prove:layout` measured whatever production contained that morning, so no layout number was
reproducible and "cards tile into two columns" was true by accident.

### 6.3 Looking at it

`tests/shoot.mjs` (written) captures full-page PNGs at 390 / 1280 / 1920, collapsed and with the long task
open. It already caught one of my own mistakes: the first version fired a single click and reported
success from the button's own label, so the phone screenshot came out collapsed while the log said
otherwise — React had not hydrated yet. It now retries until the DOM actually changes and exits non-zero
if it never does. Every phase ends with looking at six images, not with a green suite.

### 6.4 The existing suites

`npm run prove` (33), `prove:negative` (22) and `prove:health` (6) must stay green. Nothing in this plan
touches `app/api/**`, `lib/store.ts`, `lib/db.ts` or any schema — if that turns out to be wrong, I stop
and ask rather than changing a contract fifteen projects depend on.

## 7. Order of work, and what could go wrong at each step

> **What actually happened, recorded against the plan:** phases 0, 1 and 2 landed and were verified
> separately as written. Phases 3–6 landed together, because the queue, the pane, the phone panel and the
> filters all live in one component shell and building it four times would have been four rewrites rather
> than four verifications. Everything was still measured before and after. Phase 7 grew a piece that was
> not planned — `tests/use-it.mjs`, which presses the buttons — and it found two defects on its first run.
> The full account is in [UI-REPORT.md](./UI-REPORT.md).

| Phase | What lands | Verified by | Risk |
|---|---|---|---|
| **0** | `tests/fixture.mjs`, `tests/shoot.mjs`, the eleven new checks — all **red** | The suite fails, on purpose, and the failures match the numbers in §6.1 | A check that passes here is a check that cannot fail; it gets rewritten |
| **1** | Palette roles, contrast fixes, cascade layers, type scale | C1 green; screenshots at three widths | Recolouring a dark UI is easy to get subtly muddy — judged by looking, not by ratios alone |
| **2** | Real buttons, focus ring, `<main>`, labels, `role="status"` | K1, K2, A1 green; keyboard-walked by hand | Low. No layout change |
| **3** | The queue: rows, project groups, density | L3, L4, K3 green | The biggest change. If rows lose information that cards carried, it is a regression — checked against the fixture's long titles and the blocked task |
| **4** | The reading pane on desktop | L1, L2 green | Sticky positioning plus a scrolling queue is the classic place to produce a second dead column. Measured, not eyeballed |
| **5** | The phone detail layer, and collapsing the decision comment box | Full-page phone shots; tap-count check against today | The one place net taps could increase. Counted explicitly |
| **6** | Counts as filters | Clicking each one changes the rendered count | Scope creep into a dashboard. §5's rule applies to me too |
| **7** | `/setup` consistency pass, empty state, full suite, screenshots, report | Everything above, plus `prove`, `prove:negative`, `prove:health` | — |

## 8. Files

| File | Change |
|---|---|
| `tests/fixture.mjs` | **new** — realistic volumes, localhost only *(written)* |
| `tests/shoot.mjs` | **new** — full-page screenshots at three widths *(written)* |
| `tests/measure-layout.mjs` | extended with L1–L4, C1, K1–K3, A1 and a fault injection for each |
| `package.json` | `fixture`, `fixture:clear`, `shots` scripts |
| `app/globals.css` | rewritten around layers, roles and container queries; every current comment that still applies is carried over |
| `app/components/Board.tsx` | split — shell/state stays; `Queue`, `TaskRow`, `TaskDetail`, `QuestionCard`, `Compose` become their own files |
| `app/page.tsx` | `<main>`, skip link. No logic change |
| `app/layout.tsx` | `themeColor` to match the new base |
| `app/setup/page.tsx` | inherits the new styles; checked, not assumed |
| `docs/RESEARCH.md` | §10–§16 *(done)* |
| `docs/ENVIRONMENT.md`, `AGENTS.md` | the fixture command; and the hub URL drift found in §10 |
| `docs/UI-REPORT.md` | **new** — the final report, with before/after numbers and the failing-check proofs |

## 9. Decisions that are yours, not mine — answered 30 July 2026

All four were put to the owner before any code was written. **All four came back as the recommendation.**

| Decision | Chosen |
|---|---|
| Desktop shape | **Queue plus reading pane** |
| "I've done this" | **On the row and in the pane** — a distinct, separately targeted control on the row |
| Visual identity | **Warmer and quieter** — Linear's March 2026 direction |
| Phone, opening a task | **Full-screen over the list**, decisions still answerable inline in one tap |

The options as they were put, kept for the record:

1. **The desktop shape** — queue plus reading pane (recommended), or a single dense column that expands in
   place, or keep cards and only fix their proportions. The first is the most work and the only one that
   fixes the nineteen-step problem properly.
2. **Marking a task done from the row, or only once it is open.** From the row is faster; open-first makes
   a mis-click impossible, and a mis-click on Done writes a lie into the database. I lean to a distinct,
   separately targeted control on the row plus the full one in the pane — but it is your finger and your
   database.
3. **The look.** Warmer, quieter, less saturated (Linear's March 2026 direction, and the evidence is
   theirs not mine), or keep the current cool blue identity and only fix the contrast failures.
4. **The phone.** An opened task covering the list full-screen (recommended — it is what makes 19 steps
   readable one-handed), or keeping it expanded inline inside the queue as it is today.
