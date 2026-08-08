# Brief: make progression feel like something, and finish the crest

**Written:** 3 August 2026, by the agent that built most of what is described below, after he looked at it and
said it was still not right. Every criticism in here is his, and every one of them is correct.
**For:** an agent with no memory of this project, working alone, autonomously, until it is done.
**Read first:** `docs/HANDOVER.md`, then `AGENTS.md`, then `docs/BRIEF-THE-CREST.md` (still current), then
`docs/ITERATION-LOG.md` §I, §III, §X, §XII and §XIII — the record of five passes on the crest and what each one
got wrong.

---

## What this is

**The Command Center** — one private hub, one human, about fifteen AI-agent projects, live at
<https://needsme.vercel.app>. Agents file tasks he must do personally and decisions only he can make; he answers
on the web or with one tap in Telegram. He is now building it for other people to set up too, not only himself.

Everything on it is **derived**. There is no `xp` column, no `level` column, no `achievements` table, and there
must never be one — every figure folds over `tasks.done_at` and `questions.answered_at` on every render. That is
an honesty rule and it is the foundation of the whole thing.

---

## The four things to fix, in priority order

His words, verbatim:

> *"the crest is still kinda meh.. also this block under the crest which opens when you click on crest. kinda
> overwhelming and strange, I don't like this. Also dude, there's no usual feel of progression, maybe we should
> have cool animations when new level is achieved and other things like that. the unlockable things, most of it
> is unlocked early, then what?"*

**Movement II is the biggest and it is measured. Do it first if you disagree with the ordering.**

---

## I. Levelling up must feel like something. Right now nothing happens

The original brief for this whole project had two stated goals and the first was **"motivate him to work more"**.
Five sessions later, here is what happens when he crosses a level boundary:

**Nothing.** The number in the panel is different on the next render. There is no moment, no motion, no
acknowledgement. The single event the entire progression system exists to produce is silent.

### The rule you must not break, and what it actually says

`docs/HANDOVER.md` §2.3: **nothing that carries truth may move.** Previous sessions read that as "almost nothing
animates", and that reading is too broad. What the rule forbids is precise and worth quoting:

> A count may not animate to its new value: a number in motion is unreadable and, for a few hundred
> milliseconds, wrong.

**Motion for PRESENCE is already allowed and already shipped.** `TaskRow` has a `leaving` animation for the 500ms
between the server confirming a completion and the row unmounting, and its comment states the test: the animation
cannot start until the write is confirmed, so there is no frame in which it suggests something that has not
happened.

A level-up passes that test exactly. It is a confirmed, derived fact about a write the server has already
verified. **You may mark it. You may not animate the number itself.**

### Where the hook is

`app/components/Board.tsx` recomputes `standing` from the rows on every render. Ticking a task off calls `onDone`,
which puts the server's confirmed row into `doneTasks` — and if that crosses a rung, `standing.level` changes in
the same interaction. That transition is detectable client-side and it is the moment.

**The case you must also handle honestly:** he answers a decision in Telegram, levels up, and opens the hub later.
He did not witness the transition. Silently showing the new number loses the moment; faking the animation on load
would be celebrating something that happened yesterday as though it just happened. The unlock banner
(`unannounced` in `lib/looks.ts`, `Looks.seen`) already solves this shape of problem — an announcement that fires
once and waits. Consider reusing it rather than inventing a second mechanism.

### What "cool" has to survive here

- `prefers-reduced-motion` must be honoured. There is a motion layer in `app/globals.css` and it already does
  this; do not bypass it.
- Nothing may block him. If a celebration sits between him and the next task for even a second, it is worse than
  no celebration — this is a tool he uses at a desk beside a chat window.
- It must not fire on page load for a level he reached last week.

---

## II. The unlock economy runs dry at level 7. This is the measured one

`lib/perks.ts` opens with his own words, which are the reason the file exists:

> *"I thought — what do levels give us? NOW I KNOW! If each level will be granting new designs, new backgrounds,
> new elements, colours…"*

**Every level-gated perk in the hub is at level 1, 2, 3, 4, 5, 6 or 7.** Measured today:

| gate | perks | rung cost |
|---|---|---|
| level 1 | Graphite, Plain, Flat (the defaults — not earned) | 0 |
| level 2 | Slate | 30 |
| level 3 | Etched | 80 |
| level 4 | Bronze | 160 |
| level 5 | Dots | 280 |
| level 6 | Ink | 450 |
| level 7 | Grid | 680 |
| **level 8+** | **nothing, ever** | 980, 1360, 1840… unbounded |

He is at **226 points, level 4**. The remaining six perks are mark-gated, and those marks — `ten-finished`,
`cleared-a-project`, `ten-notes`, `ten-before-deadline`, `all-clear`, `twenty-under-an-hour` — are mostly
first-few-months achievements too.

So the perk system is **exhausted somewhere around level 7 and a handful of marks**, and the ladder above it is
infinite. That is precisely the defect the perk system was built to fix, recreated one layer up: past level 7,
finishing work raises a number and the number buys nothing.

The front-loading was deliberate and the reasoning is still in the file — *"a reward surface whose first item
costs a month is a surface he sees once, empty, and never returns to"*. **That reasoning was right about the
first month and it said nothing about the second year, and nobody checked.**

### Why no check caught it

`tests/ladder.mjs` **T5** asserts *"there is always something coming, at every scale"* — and it passes, because it
measures `nextUp()`, which is **marks**. There is no equivalent assertion for perks. The suite proves the mark set
has depth and is silent about the reward set.

### What to build

1. **An economy that does not run out.** How is yours to design. Options, none mandatory: many more perks; perks
   that are procedurally generated so the set grows with the ladder; a second currency; tiers of the same axis
   that deepen rather than multiply. What is not acceptable is a fixed list that ends.
2. **A check that would have caught this**, in `tests/ladder.mjs` beside T5 — something like *"at every sampled
   point up to two years of use, there is at least one perk not yet unlocked and its requirement is reachable"*.
   With a fault injection proving it can fail. **Write the check first and watch it go red against today's
   `PERKS`.** That is stronger evidence than adding it afterwards, and this suite's own header says so.
3. **Keep the four rules.** They are in `lib/perks.ts` and none of them is negotiable: nothing useful is ever
   locked (appearance only); unlocked is derived, never stored; an unlock never applies itself; no perk may reduce
   legibility.

---

## III. The crest, sixth pass

Five passes. His verdict on the fifth: *"still kinda meh"*.

`docs/BRIEF-THE-CREST.md` is still accurate on the constraints, the sizes, the encodings, and the seven approaches
already tried and failed. **Read it in full — it is the single highest-value document for this movement.** What
follows is only what has changed since it was written.

The fifth pass (commit `c8f65a8`) was a genuine improvement and its diagnosis was correct: the crest had been drawn
entirely at one weight, which is what a diagram looks like. It is now a solid ink charge with a polygonal keyway
cut through it, struck into a dark well, with the projects as a coloured surround. It also correctly found that
the muddy bands were a **value** problem (L 0.225 on a panel at L 0.185) and not the chroma problem three earlier
passes had assumed.

And it is still not right. The honest read of why, offered as a hypothesis rather than a conclusion:

**The crest is trying to be an emblem and a data visualisation at the same time, and those want opposite things.**
An emblem is designed — its proportions are chosen because they look right. This one's proportions are *dictated
by numbers*: the hole has seven sides because he has seven kinds of mark. You cannot make an arbitrary
seven-sided hole look intentional, because it is not.

**The option nobody has tried, and the one I would bet on:** separate the emblem from the readout. Let his history
*select* among a small number of properly-designed marks — the way a real crest is composed from a finite
vocabulary of charges and divisions — rather than *computing* every dimension of one mark. A designed shape chosen
by his history can be beautiful. A shape whose every proportion is a variable is a chart.

If you take that route, the encoding table in `BRIEF-THE-CREST.md` becomes a set of *selectors* rather than
*parameters*, and `CrestKey` becomes the place the exact numbers live. That is a real architectural change and it
is allowed. Say what you did and why in the log.

**Constraint that has not moved:** it must still be derived, still countable where it claims to count, still
generated geometry with no assets and no dependency, still every colour a token with an asserted pair, still work
at 96px in the panel, and still never look emptier after a promotion.

---

## IV. The crest key is overwhelming, and he does not like it

His words: *"this block under the crest which opens when you click on crest. kinda overwhelming and strange."*

He is right. `CrestKey` is a six-row, three-column table with a paragraph of prose in the middle of it and a
wrapped list of seven category names. It reads like a spec sheet, because that is what it is.

**It became a compliance artifact.** It exists to satisfy two rules — RESEARCH §14 (if pressing it does nothing,
it does not go on the page) and the no-truncation rule (the band cap and the keyway floor round in his favour, so
something must say so). Satisfying a rule is not the same as being good, and this is what it looks like when the
rule is satisfied literally.

Your options, in the order I would consider them:

1. **Make it small and pleasant.** Most of those rows are things he will read once. Which of the seven does he
   actually want on the twentieth viewing?
2. **Distribute it.** The band hues belong beside the Projects list; the hours belong beside the estimate that is
   already in the pane. A fact next to the thing it describes beats a table of facts.
3. **Remove it and re-satisfy the rules another way.** If the crest opens something better — the time machine is
   right there and is *about* how the crest got that way — the §14 rule is met by a control that leads somewhere
   worth going, and the truncation caveats move to `/looks`.

What you may **not** do is drop the caveats silently. The bands cap at eight and the keyway has a floor of three
sides; both round in the direction of looking better than the truth, and something, somewhere, has to say so.

---

## How this session runs

**You are alone, you plan first, and you do not stop until the four movements are shipped or explicitly recorded
as dropped with the measurement that justified dropping them.**

- **Plan before you build.** Write the plan into `docs/ITERATION-LOG.md` as you go. Then — and this has been the
  highest-value hour of three separate sessions — **audit your own plan** partway through against what you have
  actually measured, and reorder it. Two previous sessions found their most important item buried at the bottom
  of their own plan by doing this.
- **Decide everything yourself.** He has said, in these words, *"you decide, but the decision must be a very
  optimal one"* and *"why can't you decide this without me?"*. Do not hand choices back. Where a call is genuinely
  open, take the better one and write the reasoning in the code where the decision lives.
- **Ship visible change first.** A session that produces beautiful machinery and an unchanged-looking hub is a
  failed session. He has said that too.
- **Look at what you built.** Screenshot it, open it, press the buttons, and then *read the screenshot*. Of the
  defects on record in `docs/ITERATION-LOG.md`, a handful were found by checks, most were found by looking at a
  rendered picture, and **four were found by him in seconds on pages an agent had already photographed and
  filed**. The question that would have caught all four is:
  **would someone notice this if nobody told them to?**
- **Push every commit.** Production deploys from `master`; an unpushed commit is a change he cannot see. He has
  asked for this more than once and should not have to again.
- **One working tree, one agent.** If `npm run dev` reports `EADDRINUSE`, something else is already working in
  this directory — stop and say so rather than running `git add -A` over someone else's work. That happened.

### Before every push

```bash
npm run prove:parse      # node --check over tests/ — two seconds, run it first
npm run typecheck
npm run prove            # 50 checks over real HTTP against the real database
npm run prove:negative   # every safety guarantee broken on purpose
npm run prove:palette    # 540 contrast checks, 6 palettes x 2 schemes
npm run prove:ladder     # the progression at two years, and the perk gates
npm run fixture && npm run prove:use     # real clicks, checked against Postgres
npm run prove:layout     # L3, L7, C1, C2, L8 and the fault-injection pass
npm run audit            # every entry point, and where each one lands
```

Every new check needs a fault injection proving it can fail. Every new colour needs an asserted contrast pair in
both themes. Every agent-facing behaviour change needs a line in `lib/snippet.ts` **and** a row in the coverage
check in `tests/prove.mjs`, in the same commit — that is a standing instruction he has had to give out loud once
already.

### Constraints that will bite you

- **L3**: six tasks must start within the first screen at 1280×900. Currently exactly six.
- **L7**: the idle reading pane fits at 1920 with **zero** spare. Anything added there must be paid for.
- **K3**: three keystrokes to reach a task.
- **No backticks inside a template literal in `tests/`**, including in comments. It has closed a literal ten
  times. `npm run prove:parse` now catches it; run it first.
- **You cannot migrate the production database** — its connection string exists only in Vercel. If something
  genuinely needs a schema change, file it as a task in his own hub with exact steps, a `verify` line and an
  honest `why`. That is what the hub is for.
- **You cannot test on a real device.** Every phone figure is Chrome emulation and the emulation was once proven
  wrong about the pointer. Make it as honest as you can and record the remaining uncertainty; do not claim a
  real-device pass.

---

## Done means all of this is true

- [ ] Crossing a level boundary produces a moment he notices, it cannot fire for a level he reached last week, and
      no number animates to its value.
- [ ] There is a perk waiting at every scale up to two years of use, and a check that fails if there is not, with
      a fault injection. The check was observed failing against today's `PERKS` before the economy was fixed.
- [ ] The crest looks designed at 96px and 150px, in both themes, in all six palettes.
- [ ] The crest key is something he is glad to open, or it is gone and its caveats live somewhere honest.
- [ ] Every suite above green. L3 six at 1280, L7 fits at 1920, K3 three keystrokes.
- [ ] Screenshots of every changed surface in both themes, **and you have looked at them.**
- [ ] `docs/ITERATION-LOG.md` records the plan, the audit of the plan, every measured before and after, and every
      claim of yours that a measurement or a screenshot disproved. **That last category is the most valuable thing
      in the document** — recent sessions have had three, five and six.
- [ ] Everything committed and **pushed**, and production re-verified after deploy:
      `node tests/measure-layout.mjs https://needsme.vercel.app --production` and `/api/health`.

---

## One last thing

He runs about fifteen agent projects alone, and this hub is the only thing standing between that and the pile of
half-finished work everyone else has. The progression exists for one reason: to make finishing something *feel*
like it mattered.

Right now it is arithmetically perfect and emotionally silent. Fix that.
