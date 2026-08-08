# Build the hub I would not have known how to ask for

**Working directory:** `d:\Antigravity\TheCommandCenter`
**Read first, completely, before touching anything:** `docs/HANDOVER.md`, then `AGENTS.md`, then
`docs/RESEARCH.md` §7, §14, §18, §22, then `docs/PLAN-BEST-HUB.md`.

---

## What you are working on

There is one hub. One human runs about fifteen AI-agent projects, and every one of those agents eventually hits
something only he can do — his card, his phone, his account, his signature, his physical presence — or a decision
only he can make. Before this existed, those things went into chat, where they scrolled away and died.

The hub is the one place they land. Agents file **tasks** and **questions**; he answers on the web or with one
tap in Telegram; agents pick the answers up on their next sync. It is live at
<https://needsme.vercel.app> and it holds his real work.

It is already good. Fifty-nine commits of measured, argued, verified work: a progression that is computed rather
than stored so it can never lie, 468 contrast checks across six unlockable palettes, a harness where every check
has a fault injection proving it can fail, and 5,900 lines of documentation that records the reasoning *and* the
occasions when measurement proved the reasoning wrong.

**Your job is not to maintain that. Your job is to make the next version of it feel like something else
entirely.**

---

## The two things he actually wants

He said them in his own brief and he has repeated the first one three times:

1. **Motivate him to work more.** Not with a streak, not with a leaderboard, not with a nag. With a hub that
   makes finishing something *feel* like it mattered, and an identity in it that visibly becomes his.
2. **Ease his communication with the AIs.** He talks to fifteen agents. That half of the loop had almost no
   design at all until recently, and it is still the thinner half.

Everything below serves one of those two. If something you are about to build serves neither, it is not the
work.

---

## The standard you are being held to

This is the part to read twice.

He has told me, in these words, that the site *"still looks bad"*, that I *"spend so many hours on some
MINIMAL improvements"*, and — after finding four defects in twenty seconds by simply looking at a screenshot —
that he was *"100% sure you've never done full UI audit"*. He was right every time.

He has also told me to stop handing decisions back to him: *"you decide, but the decision must be a very optimal
one"*. And *"why do you never push dude??"*, adding that he was tired of having to do it himself every time.

So:

- **Decide everything yourself.** There is nobody to ask. Where a choice is genuinely open, pick the better
  option, write down why in the code where the decision lives, and move.
- **Ship visible change first.** Machinery earns its place by protecting something a person can see. A session
  that produces beautiful tests and an unchanged-looking hub is a failed session.
- **Look at what you built.** Screenshot it. Open it. Press the buttons. Then read the screenshot. Green checks
  have missed things he found in twenty seconds, repeatedly, and every time it was because I trusted a
  measurement instead of a picture.
- **Push every commit.** Production deploys from `master`. An unpushed commit is a change that does not exist.

---

## How this session runs

**You are alone and you do not stop.**

- **Do not report to anybody.** Not to him, not to a previous iteration, not in a summary at the end of a phase.
  He is asleep. Nobody is reading a progress update.
- **Do not ask questions.** Not one. If two readings of something are both defensible, take the better one and
  record the reasoning.
- **Do not stop when a phase finishes.** Start the next one in the same breath. The definition of done is at the
  bottom of this document, and it is the only thing that ends the session.
- **You have many hours.** Roughly eight. That is enough for all nine movements below if you do not waste any of
  it on machinery nobody asked for. Use it all.
- **The record of the work is `docs/ITERATION-LOG.md`**, which you create and keep current as you go — before/after
  numbers, what you decided, what a measurement disproved. That file is not a report to a reader; it is part of
  the deliverable, in the same way the code comments are.

**Every commit must leave the hub in a shippable state**, because every push deploys to the hub he will open
when he wakes up. Before each push: all suites green, `npm run typecheck` clean, `npm run audit` with no new
findings. A red suite is not a thing to fix later — it is the thing to fix now.

---

## The nine movements

Ordered. Each one ends in something visible, committed, pushed. The order is deliberate: identity first because
he asked for it three times, and because the movement after it depends on it.

### I. The identity becomes real

*The emblem, the level, the profile — the thing that is supposed to be **him**.*

Today it is competent line art whose geometry is a function of level and tier. It is fine. Nobody would frame it.

Make it a **crest that is unmistakably his and unmistakably earned**, generated — no assets, no images, pure
deterministic geometry from his own history. Consider: the projects he has actually touched, the *categories* of
mark he has earned rather than only the count, the rarity tiers, the hours behind him, the breadth across
projects. Different histories must produce visibly different crests; his must look like nothing else.

There is a dev-only bench at `/emblem` that renders the real component across levels and tiers. Use it. Extend
it. **Render every tier in both themes and look at all of them** — the last iteration found three separate
defects that way (rings colliding with the core at tier 5, a spoke reset that made level 11 look emptier than
10, and a hue that wrapped meaninglessly) and every one of them was invisible in the code.

### II. The time machine

*This is the feature that is only possible because of a decision made months ago, and nobody has noticed it yet.*

Nothing in this hub is stored. Every figure folds over `done_at` and `answered_at` timestamps. Which means
**standing at any past date is computable** — filter the rows to that date and derive.

So he can be shown his own history: what level he was on any day, when each rank arrived, what the crest looked
like at each stage, the whole progression as a thing he can scrub through. A hub that can show you the shape of
your own last three months, honestly, from data that was never recorded for that purpose.

No other tool he uses can do this, and it costs no schema change and no new storage. It falls straight out of
"progress is computed, never stored" — which is exactly why it belongs to this project and nothing else.

Build it properly: derived, honest about how thin the early history is (seventeen tasks were migrated with the
same `created_at`, and early proof runs deleted most of the event log — say so where it matters rather than
implying more history than exists), and beautiful.

### III. Perks, properly

`lib/perks.ts` has one kind in its union: `'palette'`. Six palettes ship, generated from one shared table of
lightness values so every one inherits the default's proven contrast, and `/looks` is where he picks one.

That is the foundation. **Now make it a collection worth having.** His words: *"I have a feeling that the big
part of this project will be creating amazing and beautiful perks for the user which he can unlock and change
and set any that he wants."* He is right, so build the axes that make it a collection rather than a colour
picker — crest finishes, page surfaces and textures, typographic sets, insignia, whatever you can make genuinely
beautiful. Gate the rare ones on **marks** rather than levels, because a mark is a *shape* of work and a level is
only an amount of it.

Four constraints, all non-negotiable:

1. **Nothing useful is ever locked.** Appearance only. A tool that withholds usefulness to motivate you is worse
   at its job on purpose.
2. **Unlocked is derived**, from the same standing every other figure comes from. No grants table.
3. **An unlock never applies itself.** It announces itself once and waits. A hub that redesigns itself while he
   is reading step three of a task is worse than one that never changes.
4. **Nothing may reduce legibility.** Palettes are safe by construction because they only move hue and chroma,
   and contrast depends on lightness. **A texture behind text is the first perk that breaks that guarantee** — so
   if you build backgrounds, you must extend the harness to measure text contrast over the *rendered* surface,
   not over the token. Do not ship a perk you cannot measure.

### IV. The decision card

The most expensive object in the hub and the least designed. A blocked agent costs hours; an untouched task
costs nothing.

- It is a beige box with buttons. It should be the most confident thing on the page.
- **The timed default** — *"no answer in 6h → 09:00"* — is the best idea in the whole project and it renders as
  a small tag. It should be the thing you see.
- The cost line (*"an agent has been blocked for 11h"*) is prose where it could be a figure.
- Options are equal-weight boxes; the agent's own recommendation is marked with a word.
- Build **side-by-side comparison** from `option.detail`, which agents already send. No API change needed.

Note: his hub has **zero** open decisions right now, so this is verified against the fixture. Keep L3 holding at
1280 — six tasks above the fold — because decisions filling the first screen is what the 46vh cap exists for.

### V. The queue

What he opens every day.

- Rows carry no state: a blocked row, a row with a note, a nineteen-step row and a one-step row look identical.
- The tick is the primary action on the page and the faintest control on the row.
- *"Not yet — waiting on someone else"* is a heading over a list with no visual distinction from live work.
- The time-filter chips are the only navigation and they sit above the list they filter.

### VI. Finding things

It becomes real the moment the hub holds the fifteen projects it is built for. There is no way to find a task by
name and no keyboard path except Tab.

Build a command palette. **Hand-built** — this project has four runtime dependencies and adding a fifth for a
list with a text box in it would be the worst trade in the codebase. Keep K3 (keystrokes to reach a task) from
regressing.

### VII. The record, deeper

- A finished task cannot be opened. Its steps and `verify` were deliberately dropped from the payload, so this
  needs a read path — there is no UI read-by-id endpoint today.
- No date grouping, no per-project filter, no search within it.
- Decisions made show the choice but not the options that were rejected.
- **The two controls that still land identically** — the header's `N done` chip and the pane's `N finished`
  figure. The audit prints it every run. Fix it here.

### VIII. Everything that is not the main screen

- **Telegram.** The one-tap loop is the reason this project exists and no iteration has looked at a single
  message. It must stay professional and precise: no nudges, no encouragement, no emoji spam. Make it excellent.
- `/setup` and the signed-out screen.
- The refused-write banner.
- **`lib/snippet.ts` — and this one is a standing instruction, not a task.** It is served by the hub and written
  into every project's `AGENTS.md`; it is the only thing most agents ever read about how to use this hub. If you
  change what an agent must do or say, update it **in the same commit**, and add a row to the coverage check in
  `tests/prove.mjs`. He had to tell a previous iteration this out loud after three features shipped without it.

### IX. Make the evidence match the claims

Only the parts that protect something visible:

- **Nothing measures load time.** "Fast" is a claim in the README that no check has ever tested. Make it a
  number.
- The audit runs at 1920, dark, localhost. Walk every width and both themes.
- `prove:health` leaks port 3941 and needs the dev server stopped.
- **`prove:layout` cannot run against the `--cleared` fixture** — L3 needs six tasks above the fold and that
  state has none. So the earned-empty hub, which is his most likely daily end state and the entire reward moment
  of the design, is verified by eye only. Fix that.

---

## Two things you cannot do. Do not fake them, do not burn time on them

1. **You cannot test on a real device.** Every phone and tablet figure in this project is Chrome emulation, and
   the emulation was proven wrong about the pointer for the harness's entire life. Make the emulation as honest
   as you can — coarse pointer, safe-area insets, 44 px targets, content under browser chrome — and **write the
   remaining uncertainty into the log as an open item.** Do not claim a real-device pass.
2. **You cannot migrate the production database.** Its connection string exists only in Vercel. If something
   genuinely needs a schema change, **file it as a task in his own hub** — with exact steps, a `verify` line, and
   an honest `why`. That is what the hub is *for*, and it is a better answer than a feature that silently does
   nothing in the only place it matters.

---

## The bar

Not "the plan is complete". The bar is: **he opens the hub, and the first ten seconds are surprising.**

He is expecting improvement. Beat that. If you finish a movement and it is merely correct, it is not finished —
correct is the floor here, and this codebase has been at the floor for a while. He used the phrase *"unbelievable
features"* and then *"I will go crazy"*. Take that literally.

You have a plan above. **It is a floor, not a ceiling.** If you see something better than what is written here,
build that instead and record why in `docs/ITERATION-LOG.md`. The previous iteration audited its own plan
mid-session and found the brief's second stated goal buried in the last of eight phases — auditing the plan was
the highest-value hour of that session. Do it again around your own.

---

## Done means all of this is true

- [ ] Every movement above is either shipped or explicitly recorded in `docs/ITERATION-LOG.md` as dropped, **with
      the reasoning and the measurement that justified dropping it.**
- [ ] `npm run prove`, `prove:negative`, `prove:palette`, `prove:use`, `prove:layout`, `prove:ladder`,
      `prove:health`, `audit`, `typecheck` — all green, and every new check has a fault injection proving it can
      fail.
- [ ] Every new colour has an asserted contrast pair in both themes. Every new page is in the audit. Every new
      agent-facing behaviour is in `lib/snippet.ts` and in its coverage check.
- [ ] Screenshots exist for every new surface, in both themes, and **you have looked at them.**
- [ ] Everything is committed and **pushed**, and production has been re-verified after the deploy —
      `node tests/measure-layout.mjs https://needsme.vercel.app --production` and `/api/health`.
- [ ] `docs/ITERATION-LOG.md` records every measured before/after, every decision you made on his behalf, and
      every one of your own claims that a measurement disproved. That last category is the most valuable thing in
      the document; the last two iterations each had three.
- [ ] Nothing on the page is untrue. No figure that cannot be recomputed from the rows, no "saved" that was not
      re-read, no truncation without a route to the whole thing, no control that does nothing.

---

## One last thing

The reason this project is worth this much care is small and specific: he is one person trying to keep fifteen
things moving, and the hub is the only thing standing between that and the pile of half-finished work everyone
else has. Every hour you save him is an hour he spends building something.

He is asleep. He will open this in the morning. Make it worth waking up for.
