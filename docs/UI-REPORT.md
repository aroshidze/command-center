# The interface overhaul — what changed, measured

**Date:** 30 July 2026. **Brief:** [UI-OVERHAUL-BRIEF.md](./UI-OVERHAUL-BRIEF.md).
**Research:** [RESEARCH.md](./RESEARCH.md) §10–§16. **Plan:** [UI-PLAN.md](./UI-PLAN.md).

Every number below came from `npm run prove:layout` or `npm run shots` against `npm run fixture` — 22
tasks across 4 projects, one with 19 steps, one blocked, plus 4 open decisions, one with 4 options and a
timed default. The before figures are in `tests/baseline/before.txt`, the after in
`tests/baseline/after.txt`, both committed.

---

## 1. The measured result

At **1920×1080**, with one 19-step task open:

| | Before | After |
|---|---|---|
| Page height | 6,532px — **6.0 screens** | 1,854px — **1.7 screens** |
| Tasks whose top is above the fold | **0** | **10** |
| Decisions section ÷ content column | **0.577** | **1.000** |
| Opened item: content ÷ its container | **0.570** | **1.000** |
| Saturated primary buttons on screen | **26** | **1** |
| `<textarea>` rendered on load | **6** | **1** |
| Text failing WCAG 2.2 AA | **39 elements**, 4 distinct colour/size pairs | **0** |
| CSS rules matching `:focus` | **0** | focus ring measured at **2px, 7.9–9.0:1** |
| `role="button"` elements that are not buttons | **5**, all unfocusable | **0** |
| Keystrokes to put focus on a task | **16** | **3** |
| Save-state elements in a live region | **0 of 28** | **6 of 6** |
| Fields with a real label | **0 of 7** | **2 of 2** |
| Focusable controls behind the phone panel | **4** | **0** |

At **1280×900**: page 6,613px → 1,771px; tasks above the fold 0 → 7; decisions fill 0.695 → 1.000.

At **390×844**: page 10,932px → 4,328px collapsed. An opened 19-step task was a 2,100px card inside a
10,932px page; it is now a **2,056px full-screen panel** with the queue behind it inert.

The three contrast failures named specifically, since they were on the most prominent control:

| Element | Before | After |
|---|---|---|
| Primary button label, white on `#4c8dff`, 16px/600 | **3.20:1** | white on `#236b3e` = **6.47:1** |
| Project count `#6b7285` on `#0c0e13`, 12.5px | **4.02:1** | `#8f8880` on `#100f0e` = **5.47:1** |
| Keyboard hint on the amber card, 12px | **3.47:1** | `#a9a29a` on `#241c10` = **6.66:1** |

Screenshots, all committed under `tests/shots/`:

| | Before | After |
|---|---|---|
| Monitor 1920 | `before-monitor-1920.png` | `after-monitor-1920.png` |
| Monitor, task open | `before-monitor-1920-open.png` | `after-monitor-1920-open.png` |
| Laptop 1280 | `before-laptop-1280.png` | `after-laptop-1280.png` |
| Phone 390 | `before-phone-390.png` | `after-phone-390.png` |
| Phone, task open | `before-phone-390-open.png` | `after-phone-390-open.png` |
| Empty hub | — | `empty-monitor-1920.png`, `empty-phone-390.png` |
| A refused write | — | `refused-laptop-1280.png` |
| `/setup` | — | `setup-laptop-1280.png` |
| Signed out | — | `locked-1280.png`, `locked-390.png` |

---

## 2. What changed, and the reasoning

### The shape: a queue beside a reading pane

The reported bug was a nineteen-step task rendered into a 340px column with the rest of the row blank. The
interim fix widened the card to the full row (1,364px) and capped its contents at 760px, which is the same
emptiness with a border round it — measured at 57% full.

Neither is really a layout bug. **One component was being asked to be a list entry and a document at the
same time, and those want opposite things.** A list entry wants to be scannable and short; a document
wants a reading measure and room. Whichever you size for, the other breaks.

So there are two components. `TaskRow` is a ~34px row on a mouse. `TaskDetail` is the document. On a
desktop they sit side by side and the pane sticks while the queue scrolls, so opening a task no longer
costs you your place in the list — which was the real cost of growing a card in place. On a phone the
detail covers the screen, which is the same number of taps as the "Show me how" it replaces.

The owner chose this over two cheaper alternatives (a single dense column that expands in place; keeping
cards and only fixing their proportions) with the trade stated: it is the most work and the only one that
fixes the nineteen-step problem at the root.

### Decisions: shorter, without losing the one tap

Four open decisions filled the entire first screen of a 1080px monitor. Two things caused most of that
height and neither was earning it:

- **A textarea on every card, rendered before anyone asked to write anything** — six on load. It is behind
  "+ Add a condition or comment" now. The one-tap path is untouched; only the uncommon case costs a click.
- **Options stacked one per line.** They tile now, using a **container query** on the card rather than a
  viewport breakpoint — the same card renders at 911px in the queue on a monitor, 748px on a laptop and
  362px on a phone, and what decides whether two options fit side by side is the card's width. Container
  queries have been Baseline *widely available* since August 2025, so this is a layout, not an
  enhancement.

An earlier attempt put the whole card body into two columns, context left and options right. It looked
balanced and made the card **130px taller**, because the options got 55% of the width and went back to
stacking. That is recorded in the CSS where someone would otherwise try it again.

On a desktop the decisions region is capped at `min(46vh, 620px)` and scrolls inside itself, with a fade
at the cut so a clipped card does not read as a broken one. That is a priority decision, not a
space-saving one: "decisions are the expensive thing" had quietly become "decisions are the only thing".
With one or two open — the normal case — the cap never engages.

### Colour and weight

The palette now has **roles rather than names** (Radix's method, not its package): two backgrounds, three
component states, two borders, a dedicated focus token, two text levels. `--dim` was previously doing duty
as section headings, meta lines, quiet button labels and footer text simultaneously, and there was nothing
between `--line` and `--accent` that a focus ring could be made from.

The neutral ramp moved from a cool blue-black to a warm grey. That is Linear's March 2026 change and their
stated reason — legibility at density — which is a better reason than I had for the blue.

Twenty-six saturated blue bars became one green one. "Don't compete for attention you haven't earned"
applies to the most repeated control first: the primary action lives where the task is open, and the row
carries a small tick box instead. Every text pair was computed before it was used, and check C1 asserts
them against what is actually rendered, so the next change that breaks one is caught by the suite rather
than by squinting.

### Keyboard, focus, announcement

Sixteen keystrokes to reach a task became three, via skip links whose targets carry `tabindex="-1"` —
without that, Enter scrolls the region into view and leaves focus behind, which measures exactly the same
as having no skip link. The check counts real key presses, so it would catch that.

Five `<div role="button">` project headings are gone rather than promoted. Making them real buttons put a
non-task control at the top of the task region, so "skip to your turn" landed on a collapse toggle and the
count went 3 → 4. Folding one project away is better served by filtering to one project, which is one
control instead of five — so the heading is a real button that filters.

Every save-state line is a live region now. There were 28 of them and not one was announced, which made
the message hard constraints 1 and 2 exist for the message least likely to be noticed.

### The dashboard question

**The main screen stays an action queue, and the counts became controls.** Clicking "4 decisions" filters
to decisions; clicking a project — in the header, in the queue heading, or in the pane's project list —
filters to that project. Nothing was added that can only be looked at.

Evidence in RESEARCH §14: of 89 professionally built dashboards in a 2025 scoping review, **only 47% were
still active**, and the authors' finding was that actionability cannot be added to a finished dashboard
afterwards. Roadmaps and statistics screens stay refused under hard constraint 5. The rule for anything
proposed later, stated so it can be applied without me: **if clicking it does nothing, it does not go on
the page.**

---

## 3. The checks, and proof that each can fail

`npm run prove:layout` now runs **13 checks** at 390 / 1280 / 1920 and then breaks each one on purpose.

**The primary evidence is not the fault injection.** Every check was written against the interface *as it
was*, and watched failing, before the thing it measures was built — a stronger thing to have observed than
a fault you inject, because a fault you inject is one you already knew how to catch. That red run is
`tests/baseline/before.txt`, committed: 10 of the 13 red, and the two that were green (L5, L6) were the
ones the previous iteration had already fixed.

| # | What it measures | Before | After | Its injected defect |
|---|---|---|---|---|
| L1 | every section fills its column | **0.577** ✗ | 1.000 ✓ | cap sections at 60% |
| L2 | an opened item fills its container | **0.570** ✗ | 1.000 ✓ | cap the prose at 55% |
| L3 | tasks visible without scrolling | **0** ✗ | 10 ✓ | push the headings down 700px |
| L4 | the queue is not an endless scroll | **6.05** ✗ | 1.72 ✓ | 320px minimum row height |
| L5 | nothing escapes the viewport sideways | 0 ✓ | 0 ✓ | 3000px-wide task |
| L6 | a phone gets exactly one column | 1 ✓ | 1 ✓ | two-track grid on the list's real parent |
| C1 | every text colour meets WCAG 2.2 AA | **39** ✗ | 0 ✓ | recolour titles to `#3a3f4b` |
| K1 | nothing pretends to be a button | **5** ✗ | 0 ✓ | swap a button for a `div[role=button]` |
| K2 | focus is visible on the dark surface | **1px @ 1.14:1** ✗ | 2px @ 7.9–9.0:1 ✓ | `outline: none` on `:focus-visible` |
| K3 | a keyboard reaches the tasks quickly | **16** ✗ | 3 ✓ | delete the skip links |
| K4 | a covered queue cannot be tabbed into | **4** ✗ | 0 ✓ | strip every `inert` |
| A1 | the save line is announced | **0/28** ✗ | 6/6 ✓ | strip `role`/`aria-live` |
| A2 | every field has a real label | **0/7** ✗ | 2/2 ✓ | strip labels and `aria-label` |

Latest run: **all 13 pass, and all 13 were shown to fail on a deliberately broken page.**

`npm run prove:use` is new and is the check the brief's closing paragraph asks for: it drives the real page
in a real browser, presses the real controls, and then asks the **database**, through the agent API,
whether the thing happened. A UI test that asserts on the UI's own text believes whatever the UI says,
which is the failure hard constraint 1 exists to prevent. Its fourth check makes the server refuse a write
and asserts the interface reports the refusal, prints the server's actual reason, and does **not** remove
the row.

Existing suites, re-run: `prove` **33/33**, `prove:negative` **24/24** (the brief said 22; it has grown),
`prove:health` **6/6**, `prove:use` **4/4**.

### Checks of mine that were wrong, and how

This is the part worth auditing, because six of my own measurements were broken at some point and four of
them were broken in the direction that reports success.

1. **L2 measured a wrapper, not the ink.** `data-measure="detail-content"` was on a full-width block div;
   a div that stretches "fills" its container perfectly while the nineteen steps inside it occupy 57% of
   the width. It read 100% on the broken layout. Moved to the prose itself.
2. **L6's fault injection did not reproduce its fault, twice.** A float with a percentage width left the
   cards one per row; setting a grid on `parentElement` worked until the list became `<ul><li>`, at which
   point the parent was the `<li>` and each card got its own two-track grid to sit alone in. It now walks
   up to the nearest ancestor that actually contains more than one task.
3. **L1 and L2's injections were pinned to absolute pixel values** taken from the old layout (820px,
   760px). Once the columns got narrower those stopped shrinking anything — 820/911 rounds to exactly the
   0.90 threshold — and both checks silently lost the ability to fail. They are percentages now.
4. **K2 and K3 reload the page** so Tab starts from the top. In the negative pass that reload happened
   *after* the fault was injected and washed it away, so both reported "did not catch its own defect" on a
   page that was no longer broken by the time they looked.
5. **K4 read a field the page never returned.** Its value was `undefined`, which fails every threshold —
   so it failed the real run *and* reported "caught its own defect". A check broken in that particular way
   looks like a check working perfectly. It now returns `-1` and says NOT MEASURED.
6. **The hydration wait was wrong twice.** First it waited for server-rendered markup: measured on this
   machine, markup lands at 20–41ms and React attaches at 68–168ms, so there is a 50–130ms window where
   the page looks completely ready and no control works. That window produced a screenshot of the
   collapsed state labelled as the expanded one, and made the keyboard check report 5 keystrokes on one
   run and 2 on the next with no code change between them. Then the fix was widened to "a React fiber
   anywhere in the document" — and Next's development error overlay is React-rendered and attaches
   *before* the application, so it went true on a page whose buttons still did nothing and the first click
   of every run was dropped. It waits on the page's own buttons now.
7. **The screenshot harness reported a state it had not reached.** The first version fired one click and
   read success off the button's own label. It now retries until the DOM changes and exits non-zero if it
   never does. A second version then over-clicked — it re-ran the "most steps" search each attempt, so
   after the long task opened it moved on to the next longest and the next, expanding all 22 and measuring
   14,577px instead of 6,532px.
8. **The screenshot harness misrepresented the phone panel.** `inset: 0` means the viewport, so stretching
   the viewport to the document height stretched the panel with it and produced the panel's content
   followed by 1,600px of black. It measures the panel's own `scrollHeight` when one is up.

---

## 4. Bugs in the interface found by using it

Not by reading the code, and not by the suite.

1. **A refused write from a task row said nothing at all.** `TaskRow` set a `bad` state and opened the
   task, on the theory that the pane had room to print the reason. The pane has its own state, so the
   message went into a variable nothing rendered: the row stayed put and was silent. Silence after
   pressing a button is indistinguishable from nothing having happened, which is how you press it again.
   Refusals are now a persistent alert at the top of the queue, naming the task and quoting the server.
   Found by `prove:use` on its first run.
2. **Four controls were still tabbable behind the phone's full-screen panel** — the two skip links and the
   two header chips. Marking only the queue `inert` covered the half I happened to be thinking about.
   Found by K4, which was written for exactly this and caught it immediately.
3. **The empty hub regressed to "YOUR TURN" over a dashed box reading "Nothing to do"** during the
   restructure — hard constraint 6 delivered as a shrug. It needed its own branch rather than a fallback
   inside the task list. Found by clearing the fixture and looking at the screenshot.
4. **Task titles were truncated on a phone.** The meta column took ~110px of 390, leaving ~230px for the
   title, so "Point harbourlights.app at Vercel" became "Point harbourlights.app at V…" and half the list
   read as near-identical stubs. Rows wrap to two lines below 640px. A row you cannot tell apart is not a
   denser list, it is a shorter one.
5. **The row's Done control read as an empty text field.** A column of empty bordered squares down the
   right edge is an invitation to click the wrong thing, on the one control where clicking the wrong thing
   writes a lie into the database. It carries a faint tick that fills in on hover, focus and success.
6. **The clipped decisions region looked like a rendering bug** — the last card sliced through by the edge
   of the scroller. A sticky fade at the cut.

## 5. Things found that were not in the brief

1. **`npm run prove:layout` passed at 98% while measuring only the section that had already been fixed.**
   It queried `.pcards > .card` — a styling class — so it could not see that `.asks` beside it filled 57.7%
   of the same screen. The measurements are hooked to `data-measure` role attributes now, which are
   expected to survive a restyle.
2. **Layout numbers were not reproducible.** With no fixture, `prove:layout` measured whatever production
   contained that morning, so "cards tile into two columns at 1280px" was true because production had
   three tasks in one project, not because the CSS said so. `tests/fixture.mjs` fixes that, and refuses to
   run anywhere but localhost.
3. **`.groups` was a dead class.** `Board.tsx` rendered it three times and a comment said *"Two or three
   columns on a wide screen. See .groups."* No such rule existed — it had been replaced by `.pcards` and
   the comment was never deleted. A comment describing a rule that is not there is the one thing this
   codebase's comment convention exists to prevent.
4. **The documented hub URL and the configured one disagreed.** `README.md` and `docs/ENVIRONMENT.md` named
   `command-center-beta-pied.vercel.app`; `CC_PUBLIC_URL` and Telegram use `needsme.vercel.app`. Both
   resolve to the same deployment and both return 200, so nothing was broken — but `ENVIRONMENT.md` is
   explicitly the document that cannot be derived from the code. Updated to name `needsme` as canonical
   and record that the old alias still resolves. **Worth confirming that is the right way round.**
5. **`npm run prove:health` does not always clean up its second server.** It left one on port 3941 after a
   successful run, and `npm run dev` then refused to start with *"Another next dev server is already
   running"* naming a PID. Recorded in `docs/ENVIRONMENT.md`. Not fixed — it is in a suite I was told not
   to disturb, and the failure is loud and self-describing.
6. **The proof suites leave a marker note behind** in whichever database they ran against, and it shows up
   in the hub's footer. `fixture.mjs` clears it so screenshots do not contain someone else's test data.

## 6. What I chose not to do

| Not done | Why |
|---|---|
| Tailwind, shadcn/ui, any dependency | RESEARCH §13. Tailwind v4 was a ground-up rewrite of v3 with an official codemod; shadcn requires it and churns separately. `package.json` still has four runtime dependencies. |
| `text-wrap: pretty`, scroll-driven animation, anchor positioning, cross-document view transitions | Baseline **limited** — no Firefox implementation. Two search results claimed otherwise and were wrong. |
| Animate the disclosure open | Needs `interpolate-size`/`calc-size()`, which is Chromium-only. There is no cross-browser way to do it, so it should not be done. |
| React's `<ViewTransition>` | Still `unstable_`/canary and needs an experimental Next flag. |
| A statistics or analytics screen | §4 above. |
| Auto-refresh of any kind | Hard constraint 7. |
| An icon set | Linear's March 2026 change was *fewer* icons and smaller ones. |
| Any change to `app/api/**`, `lib/store.ts`, `lib/db.ts` or the schema | Hard constraint 3. Nothing in this work needed one. |
| A full roving-tabindex listbox for the queue | Each row holds two genuinely separate controls (open, and mark done); collapsing them into one composite widget would make Done *harder* to reach. Arrow keys move between rows; Tab still behaves normally. |

## 7. What I am not sure about

Stated plainly rather than smoothed over.

1. **The decisions cap is a judgement call I cannot verify without you using it.** Capping the region at
   46vh is what makes tasks visible on the first screen with four decisions open. With one or two it never
   engages. But if you routinely have five or six open, you will be scrolling inside a sub-region, and I
   do not know whether that will annoy you more than the scroll it replaced. It is one CSS line to remove.
2. **Done on the row is faster and it is also a smaller target.** You chose row-plus-pane over open-first
   knowing that. I have separated it from the row's own click area and kept 44px on a coarse pointer, but
   a mis-tap is still possible in a way it would not be if completing required opening. If you ever
   mis-tick one, that is the trade showing, and it should be revisited rather than absorbed.
3. **I have not seen this on a real phone.** Every phone figure is Chrome's device emulation at 390×844
   with a coarse pointer. Emulation gets layout right and gets *touch* — thumb reach, the browser's own
   chrome, momentum scrolling past the end of a fixed panel — only approximately. `overscroll-behavior:
   contain` is there for the last one but I have not felt it.
4. **`useSyncExternalStore` reports "not narrow" during the server render.** On a phone the first client
   render therefore disagrees for one frame, which costs a tab stop and nothing visual, because CSS owns
   the layout and only `inert` is driven from JS. I am confident that is the safe direction, but it is a
   real inconsistency rather than a non-issue.
5. **The hydration predicate depends on a React internal** (`__reactFiber$…`). If a future React stops
   using that name, every `goto` in the test harness times out loudly, which is the correct failure — but
   it is a dependency on an unpublished name and it is worth knowing about.
6. **Nothing here has been deployed or tested against production.** All of it ran against the Neon `dev`
   branch through `npm run dev`, per `docs/ENVIRONMENT.md`. The layout suite can be pointed at production
   read-only (`node tests/measure-layout.mjs https://needsme.vercel.app`) but I did not run it there,
   because it opens tasks by clicking them and I was not willing to touch the real hub without asking.
7. **The container query on the decision card is the one piece of newer platform work here.** It is
   Baseline widely available and I have measured it at 362 / 748 / 911px, but it is doing real layout work
   rather than decorating, so it is the first thing to look at if a decision card ever renders oddly.
