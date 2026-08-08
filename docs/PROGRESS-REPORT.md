# The record — what changed, measured

**Date:** 30 July 2026. **Brief:** [BRIEF-PROGRESS-AND-REWARDS.md](./BRIEF-PROGRESS-AND-REWARDS.md).
**Plan:** [PROGRESS-PLAN.md](./PROGRESS-PLAN.md). **Research:** [RESEARCH.md](./RESEARCH.md) §17–§24.

Every number below came from `npm run prove:layout`, `npm run prove:use` or a direct query against the Neon
`dev` branch, against `npm run fixture` — 22 open tasks across 4 projects, 4 open decisions, and now **9
finished tasks and 2 answered decisions back-dated over eight days**. The red run is
`tests/baseline/before-progress.txt`; the green one is `tests/baseline/after-progress.txt`. Both committed.

> **This report has two parts, and part one's figures are superseded.** Part one (§1–§10) is what landed first
> and is kept as written, because the reasoning still holds and the record of what was measured at the time is
> worth more than a tidy document. **Part two (§11 onwards) is the redesign that followed**, after the owner
> opened the real hub and reported that it was ugly and a wall of text — both of which were true, and both of
> which my screenshot harness had made structurally impossible to see. Where the two disagree on a count of
> checks or a page height, part two is current.

---

## 1. What was built

**A record, not a scoreboard.** One truthful count on the first screen that is also a control; the full
record behind it, where every completion can be **re-opened**, which takes the credit back; and beside the
queue, the thing that actually makes an errand feel worth having done — the asking agent's own sentence about
what became true. *"Unblocks 2,849 pins — the whole catalogue queue was waiting on a verified domain."*

Decisions made are counted separately and equally, because unblocking a blocked agent is an accomplishment
and nothing in the hub had ever said so.

Marks exist. They are **statements about the past with a date on them**, never targets: *"Ten finished"*,
*"Cleared harbour-lights"*, *"Unblocked an agent in 4 minutes"*, *"The whole hub reached zero"*. A mark that
has not happened is not on the page at all.

**Nothing is stored.** No `xp`, no `level`, no `achievements` table, no counter column, no schema change of
any kind. Every figure is a fold over `tasks.done_at` and `questions.answered_at`.

## 2. The measured result

At **1920×1080** and **1280×900**, against the same fixture:

| | Before | After |
|---|---|---|
| Elements on the page stating any figure about finished work | **0** | **3** |
| ...of those, above the fold | **0** | **3** (record's top edge at **538px** of a 1080px screen) |
| ...of those, that are controls | — (none existed) | **3 of 3** |
| Finished items that can be listed | **0** — the store capped at `limit 5` and rendered 5 titles joined by dots | **9**, uncapped |
| Completions stating what they achieved | **0** | **7 of 9** (the 7 the agent wrote a `why` for) |
| Marks | **0** | **4** earned on this fixture, **6** on a cleared hub |
| Per-project completion counts | **0** | **4 of 4** projects, on rows that already filter the queue |
| Ways to correct a wrong completion | **0** — `task.reopen` existed in the API and nothing called it | **9**, one per finished row |

**And the cost, which is the number I was most worried about:**

| | Before | After | Change |
|---|---|---|---|
| Page height, monitor 1920 | 1,854px (1.7 screens) | 1,854px (1.7 screens) | **0** |
| Page height, laptop 1280 | 1,771px (2.0 screens) | 1,771px (2.0 screens) | **0** |
| Page height, phone 390 | 3,676px (4.4 screens) | 3,719px (4.4 screens) | **+43px** |
| Tab stops | 73 | 74 | **+1** |
| Tasks above the fold, monitor | 10 | 10 | **0** |
| Longest scroller | 1.72 screens | 1.72 screens | **0** |
| Text failing WCAG 2.2 AA | 0 | 0 | **0** |
| Runtime dependencies | 4 | 4 | **0** |
| Schema changes | — | — | **none** |

Zero desktop cost is not luck — it is why the record lives in the reading pane and behind a chip rather than
inline above the queue, which was the decision he was asked about and approved. L3 (tasks above the fold) and
L4 (scroll extent) were the two figures the previous redesign won, and an always-on block below the queue
would have spent both.

## 3. Every new check, and proof each one can fail

`npm run prove:layout` now runs **18 checks** (was 13). `npm run prove:use` runs **9** (was 4).

**The primary evidence is the red baseline, not the fault injection.** All five layout checks and four of the
five database checks were written against the interface *as it was*, and watched failing, before any of the
thing they measure existed. `tests/baseline/before-progress.txt` is that run, committed.

| # | What it measures | Before | After | Its injected defect |
|---|---|---|---|---|
| **P1** | what you have finished is visible without scrolling | **NOT MEASURED** — nothing on the page stated any figure ✗ | 1 of 1 with a task open, 3 of 3 idle ✓ | move the figures to the end of a 4,000px document — *"present but in the footer"*, which is exactly what shipped |
| **P2** | every finished item can be listed, not just the last few | **0 listed** ✗ | 9 ✓ | delete all but 4 rows — the old `limit 5` |
| **P3** | a completion says what became true, not just its title | **NOT MEASURED** — nothing listed ✗ | 7 of 9 ✓ | strip every `became-true` element |
| **P4** | every figure is a control, and finished work can be undone | **NOT MEASURED** — no figures ✗ | 3/3 figures, 9/9 rows ✓ | replace each figure button with a `<span>` |
| **P5** | nothing sets a target or names a streak | **NOT MEASURED** — no surface to inspect ✗ | 0 phrases ✓ | append *"3 more to reach 25 — keep it up, don't break your streak"* |
| **U1** | the page figure **equals** `select count(*) from tasks where status='done'`, read straight from Postgres | no figure existed ✗ | 9 = 9 ✓ | red at baseline |
| **U2** | ticking a task off raises it by exactly one and earns the tenth mark | ✗ | 9 → 10, mark appears ✓ | red at baseline |
| **U3** | **re-opening takes the credit back** | ✗ | 10 → 9, `done_at` null, mark gone, task back in the queue ✓ | see §4 — injected separately and caught |
| **U4** | a refused re-open shows the server's reason and moves no figure | ✗ | reason shown, figure unchanged, row stays ✓ | 500 injected over CDP `Fetch` |
| **U5** | a decision the **hub** made by timed default is not counted as one **he** made | — (new) | 2 stays 2 ✓ | see §4 — injected separately and caught |

**All 18 layout checks pass, and all 18 were shown to fail on a deliberately broken page.**

Existing suites, re-run in full after every change: `prove` **33/33**, `prove:negative` **24/24**,
`prove:use` **9/9**, `prove:layout` **18/18 + 18 injections**, `prove:health` **6/6**.

## 4. Proof the figures are derived and not stored

Two faults injected into the real source, run, caught, reverted. These are the two ways this feature could
have lied.

**Fault 1 — a count that only goes up.** `onReopened` in `Board.tsx` had its
`setDoneTasks(ds => ds.filter(...))` removed, which is precisely how a stored score behaves when somebody
forgets to decrement it:

```
FAIL  RE-OPENING TAKES THE CREDIT BACK — the figure drops, done_at clears, the mark is un-earned
        THE FIGURE DID NOT DROP. A count that only goes up is not derived from the rows.
```

**Fault 2 — counting a decision the hub made.** Both filters widened to include `defaulted`, in
`lib/store.ts` *and* `lib/progress.ts`:

```
FAIL  a decision the HUB made by timed default does not count as one HE made
        the figure went 2 -> 3 because a decision the HUB made was counted as his.
        That is a badge for something he did not do.
```

Both reverted; both suites green afterwards. The second fault is the one worth dwelling on: a timed default
means a deadline passed and the hub proceeded **without him**. The row genuinely exists, the number looks
plausible, and nothing else on the page would contradict it. It is excluded in two places on purpose — the
SQL narrows for cost, `lib/progress.ts` filters again for correctness — so that removing either one fails.

**And the figures match the database because the check reads the database, not the API.** `U1` counts rows
with `neon` directly rather than through `/api/agent/*`, because the page and the agent API both go through
`lib/store.ts`: a wrong aggregate there would agree with itself. Localhost is enforced, so it can only ever
be the `dev` branch.

## 5. The architectural finding that changed the design

**The obvious source for a completion history is `events`, and it is the wrong one — in the brief's own
forbidden direction.**

`events` looks perfect: append-only, monotonic `seq`, carries `at`, has a `task.done` kind. It fails twice:

1. **Append-only means credit can never be taken back.** A task completed, re-opened and left open keeps its
   `task.done` row forever. Any figure derived from `events` counts work that is not done — the exact lie the
   brief forbids, reached by picking the most natural-looking table.
2. **It is not a record anyway.** Measured on the dev branch: **31 rows spanning 35 seconds**, with `seq`
   beginning at **612** — roughly 611 rows destroyed by early proof runs.

So everything derives from `tasks.done_at`, which `setTaskStatus` clears on re-open. That makes the
correction **structural rather than remembered**: the row stops matching, so it leaves the count, the list
*and* every mark at once. There is no decrement logic anywhere, so there is no decrement logic to get wrong.
Fault 1 above is what that looks like when it is done by hand instead.

## 6. What I decided against, and what decided it

The brief asked for "levels, achievement badges and other cool perks". I did not build points, levels,
badges or a streak. This is the part of the brief I am contradicting, so here is the evidence rather than the
preference. Full detail with links in [RESEARCH.md](./RESEARCH.md) §18–§19.

| Not built | What decided it |
|---|---|
| **A streak, of any kind** | Silverman & Barasch, *Journal of Consumer Research* 49(6) 2023, seven studies, 4,000+ participants: with **identical behaviour**, people continued at **66.23%** when the log displayed an intact streak and **57.86%** when it displayed a broken one. The *display* cost 8.4 percentage points. Worse when the person feels responsible for the break. **His absences are frequently not his doing** — agents decide when work arrives, and a quiet week can mean nobody asked. Hard constraint 6 says an empty queue is success; a streak would call that same week a failure, on the same page. |
| **Streak freezes as the fix** | A repair mechanism concedes that absence is failure. And every figure supporting freezes that I could find traces to a vendor blog with no method disclosed, not to a study. |
| **Points / XP** | Deci, Koestner & Ryan, *Psychological Bulletin* 1999, **128 experiments**: expected, completion-contingent tangible rewards undermine intrinsic motivation. Points-per-task is that configuration exactly. Cerasoli et al. 2014 (k=183, **N=212,468**): incentives predict *quantity*; intrinsic motivation predicts *quality*. His tasks are done once, correctly or not — a quantity incentive aimed at the axis that needs no help. |
| **Levels** | Kivetz, Urminsky & Zheng, *JMR* 2006: **post-reward resetting** — effort measurably drops after each threshold. A level ladder is a trough generator, in a tool whose main risk is a lapse becoming abandonment. |
| **Badges as payment** | Hanus & Fox, *Computers & Education* 80 (2015): badges plus a leaderboard, measured at four points over **16 weeks** — motivation, satisfaction and empowerment all **fell**, and exam scores were lower, mediated by intrinsic motivation. This is the closest thing in the literature to building what the brief describes and watching it for four months. |
| **A contribution grid** | It renders "nobody asked you to do anything" and "you did nothing" as the same pale square. A graph making an untrue claim about him is the forbidden failure arriving as a visualisation. |
| **A `/progress` page** | Gouveia et al., UbiComp 2016: **over 70%** of use of a surface like this is a glance of about five seconds. Stahlman et al., *JMIR* 2025;27:e65283: of 89 dashboards, **47%** still active. A destination is the thing that dies. |
| **Any progress notification** | Telegram's silence is the anti-rot mechanism (RESEARCH §7 cause 5). "You are 3 from a badge" is a controlling message down the one channel that has to stay trustworthy. |
| **Un-answering a decision** | `answerQuestion` refuses a second answer because an agent may already have acted on the first. So **task credit is reversible and decision credit is not**, and the page says so rather than leaving the missing control looking like an oversight. |

**What the evidence positively pointed at, and what the design leans on instead:** Amabile & Kramer's
progress principle (~12,000 diary entries — progress in meaningful work is the single largest driver of
positive inner work life, and **28%** of *minor* events had a major effect on how people felt), and Grant
2008 — ten minutes of contact with one person who had benefited from the work produced **+142% persistence
and +171% output** a month later. The hub already stored the "what it was for" sentence, written by the agent
that needed the task done. It was discarding it at the exact moment it became true.

## 7. Bugs found by using it, not by the suite

Five, and the suite was green for four of them.

1. **My own fixture ate an open task.** One of the nine finished tasks used the key `insurance-cert`, which
   is also an *open* task's key in the same project. `key` is an idempotency key, so the write silently
   **updated** the open task and then ticked it off: harbour-lights went from 16 open tasks to **15**. Every
   write succeeded, the fixture printed "22/22 loaded", and `prove:layout` stayed green because L3 only needs
   six tasks above the fold. Found by querying the database and counting. Since every layout threshold is
   calibrated against those volumes, this silently changes the meaning of every number downstream — so
   `tests/fixture.mjs` now **counts what is actually in the database** and exits non-zero if it disagrees
   with what it claims. That guard was itself verified by re-introducing the collision on purpose (exit 1).
2. **One number disagreed with another number on the same screen.** The Projects list said *"16 open"* while
   the queue heading two inches away said *"15 tasks"* — the sidebar counted blocked tasks, the queue did
   not, neither said so. Pre-existing, and it became visible the moment a "done" figure was put beside it.
   The sidebar now uses the same actionable-only count the queue does. This is RESEARCH §7's trust gap in
   miniature: one figure that disagrees with what you know poisons confidence in all of them, including the
   new one this whole surface depends on.
3. **A check that passed while being incoherent.** P3 reported *"12 of 9 listed completions quote what they
   achieved"* — a ratio above one. I had tagged the decisions' "the agent was waiting 4 minutes" as
   `became-true`, which it is not, and the count was scanning the whole page rather than the rows. It
   **passed**, which is worse than failing: a number that cannot mean what it claims is one nobody reads
   carefully next time. Now scoped to the rows, and it reads 7 of 9.
4. **The empty-hub record rendered as five stacked fragments.** `.empty b` is `display: block` because on
   that panel the bold *is* the headline, and the new sentence inherited it: *"You have finished"* / *"9"* /
   *"tasks and made"* / *"2"* / *"decisions since 22 Jul."* Read like a broken template. No check would have
   caught it — every number on it was correct. Found by looking at the screenshot.
5. **Two marks with identical detail lines.** "Unblocked an agent in 4 minutes" and "Answered 2 decisions
   before their deadlines" both named the newest decision, so they sat next to each other looking like a
   rendering bug. Also found in a screenshot; a duplicated line is not a wrong number.

## 8. Things found that are not in the brief

1. **`unblocks` is not a field.** The brief says tasks carry an `unblocks` field "folded into `why`". There is
   no such field in `lib/types.ts`, the schema, or the API — `why` is free prose that *sometimes* contains a
   number. The brief's instinct about its value is right and well supported (Grant 2008 is a +171% effect),
   but it has to be **quoted verbatim**. Parsing "2,849" out of prose to render as a figure would be
   manufacturing a statistic, and it would be wrong the first time an agent writes "Unblocks the Pinterest
   queue" with no number in it.
2. **The event log is not just thin, it is truncated.** The brief says history "starts around now". Measured:
   31 rows spanning 35 seconds, `seq` starting at 612. About 611 rows are gone.
3. **`scripts/migrate-riff-kitchen.mjs` still defaulted to the old hub URL** —
   `command-center-beta-pied.vercel.app`, long after `needsme` became canonical. It resolves to the same
   deployment so nothing broke and nothing would have, which is exactly why it survived a documentation sweep
   that fixed `README.md` and `ENVIRONMENT.md`. Fixed. This closes inherited item 2; nothing else in the tree
   disagrees now.
4. **`prove:health` did leave its second server behind**, exactly as `ENVIRONMENT.md` warns — port 3941, held
   after a clean 6/6 run. Confirmed and killed by hand. Still not fixed: it is in a suite I was told not to
   disturb, and the failure is loud and self-describing.
5. **`task.reopen` had existed in `app/api/ui/act/route.ts` since the beginning and nothing had ever called
   it.** No API change was needed for any of this; an existing action got a button.
6. **The most-cited numbers on this whole topic do not survive checking.** The Duolingo streak-freeze figures
   and the "40% abandon after a broken streak" statistic are vendor and press claims with no traceable
   method. The one study that settles the question is barely mentioned in any of that writing.

## 9. What I am not sure about

Stated plainly rather than smoothed over.

1. **On a phone, only the chip is glanceable.** Measured: in the idle state the record's top edge is at
   **538px** on a laptop and a monitor — comfortably above the fold — and at **4,011px** on a phone, because
   the pane is normal flow *below* the queue there. Pressing the chip brings the record up into the queue
   column, but four open decisions still sit above it. I think that is the right priority — a blocked agent
   outranks reading your own record — but it means the phone case is *"a green number in the header, and the
   rest is a tap and a scroll"*, which is materially worse than the desktop case. If he mostly wants this on
   a phone, it is the first thing to revisit.
2. **The mark thresholds are a guess.** Ten / twenty-five / fifty / a hundred; fifteen minutes for "unblocked
   an agent fast"; three projects for "across the board"; ten steps for "the long one". Nothing in the
   research says where those should sit. They are in `lib/progress.ts` as one-line constants and a wrong one
   is fixed by deploying, which is most of why the definitions are in code.
3. **Hidden unearned marks is a real trade and he may come to dislike it.** He chose it when asked, and the
   evidence supports it (a target list is the controlling framing), but the cost is that the surface never
   tells him what is possible. There is no way to browse the set except by reading `lib/progress.ts`.
4. **Dates are UTC, on purpose, and that is a genuine inaccuracy.** `humanDate` avoids
   `toLocaleDateString` because this page is server-rendered and then hydrated, and locale/timezone-dependent
   formatting produces a real hydration mismatch. The cost: a task finished at 23:30 local time in a timezone
   ahead of UTC is dated a day earlier than it felt. Determinism was judged the better trade for a surface
   whose figures have to agree with themselves, but it is a wrong date rather than a rounding.
5. **The minutes total is an agent's estimate and always will be.** It is labelled "on the agents' own
   estimates" on screen and `U1` asserts the word "estimate" is present near it. It is still the one figure on
   the surface that nobody measured. He chose to keep it.
6. **P5's only evidence is its own injection**, and this is stated in the check itself. P1–P4 were watched
   failing against the real interface; P5 could not be, because before the record existed there was no
   surface to put a target on — at baseline it reports NOT MEASURED, which is a fail rather than a pass. Its
   value is forward-looking: it is what stops "3 more to reach 25" arriving in six months from someone who has
   not read RESEARCH §19.
7. **The 46vh decisions cap is still unverified.** Untouched by this work, and it cannot be resolved without
   him using it. **Re-flagged.** With the record now reachable from the same column, there is slightly more
   reason to care: with four decisions open, the record's heading sits below them.
8. **No phone figure has ever been checked on a real device.** Still true. Every phone number in this report
   is Chrome device emulation at 390×844 with a coarse pointer. I have no way to fix this. **Re-flagged.**
9. **Nothing here has been deployed or run against production.** All of it ran against the Neon `dev` branch.
   I did not read production even read-only, because there is no read-only path — `cc sync` writes an `agents`
   row **and applies timed defaults**, which could resolve one of his real decisions without him. So the
   first figures computed from his real work will be seen on his own hub after deploying, and the number I am
   least able to predict is what his `min(done_at)` will say.
10. **The record is state in the client, and that is a small risk I accepted.** Ticking a task off moves the
    server's returned row into `doneTasks` so the figure moves immediately. If a future call site forgets to
    pass that row, the task leaves the queue and does not enter the record — the count is briefly one **low**
    until a reload. That is the safe direction and it is commented as such, but it is a way for the figure to
    be momentarily wrong.

## 10. Screenshots

All committed under `tests/shots/`.

| | Phone 390 | Laptop 1280 | Monitor 1920 |
|---|---|---|---|
| The queue, with the record in the pane | `progress-phone-390.png` | `progress-laptop-1280.png` | `progress-monitor-1920.png` |
| The full record, reached by pressing the figure | `progress-phone-390-finished.png` | `progress-laptop-1280-finished.png` | `progress-monitor-1920-finished.png` |
| **The earned empty hub** — queue at zero, record not | `progress-cleared-phone-390.png` | `progress-cleared-laptop-1280.png` | `progress-cleared-monitor-1920.png` |

That last row is the one worth looking at. Hard constraint 6 says an empty queue is success, and the whole
argument for having no streak is that a streak would render that exact screen as a failure. `npm run fixture
-- --cleared` is a new third fixture state that exists so the claim can be looked at rather than asserted:
the finished work and nothing open. It is also the only way to see the *"the whole hub reached zero"* mark.

---

# Part two: the redesign, and the gamification

**Date:** 30 July 2026, later the same day. Triggered by two reactions to part one:

> *"Dude, what is this ugly scrollbar? The whole portal is just a gigantic wall of text… Didn't you
> take at least one screenshot of how it looks before saying that it's done?"*

> *"This website must be one of the best designs in the world in every parameter… We need broader
> achievements and we need a kind of a gamification of this… I have levels for example. Maybe I have a
> character or profile in the hub that gets enhanced when I do."*

He was right about the screenshots, and the reason is worse than carelessness.

## 11. Why I had not seen the scrollbar, which is the important finding

I did take screenshots. Nine of them. **The scrollbar could not appear in any of them**, for two compounding
reasons in the harness:

1. `tests/shoot.mjs` launched Chrome with `--hide-scrollbars`. Added so a full-page capture of a 6,000px
   document did not get a stripe painted down it.
2. **Worse, and the actual culprit:** it captured **full-page**, which stretches the viewport to the document
   height. The reading pane is `max-height: calc(100vh - 40px); overflow-y: auto` — so stretching the viewport
   made the pane taller than its own content and it *stopped overflowing*. No overflow, no scrollbar. The flag
   was irrelevant; the technique had already removed it.

So my "look at it" step was looking at a page that does not exist. Anything sized in viewport units is
invisible to a full-page capture, by construction.

**Fixed:** every run now produces a **viewport-sized** capture as well as the full-page one, prints the width
of every scrollbar in view, and no longer hides them. The first viewport capture showed **three** scrollbars
at 15px each — the page, the pane, and the capped decisions region.

| | Before | After |
|---|---|---|
| Scrollbar width | **15px**, light grey | **10px**, `--scroll` at 3.1:1 on the panel |
| Screenshot states per run | 1 (full page) | **2** (viewport + full page) |
| Widths ever rendered | 3 | **5** (added tablet 834, ultrawide 2560) |
| Themes ever rendered | 1 | **2** |

## 12. Why the pane was a wall of text, which was also a measurement failure

The fixture's `why` values were each **one short sentence**. Real ones are three to five lines — from his own
hub: *"Opens the one traffic channel that does not need Google to trust us first. Pins keep working for months,
so this compounds while you sleep. Unblocks: everything Pinterest. I have 360 pins queued and 2,849
renderable…"*

So the pane was designed against text that does not exist, and every screenshot was of the easy case. That is
the **third** time this fixture has flattered the thing it exists to test:

1. a duplicated idempotency key silently ate an open task (part one, §7.1)
2. `why` values a fifth of their real length
3. every open task created at load time, so no work ever overlapped a completion — which made `clearMoments`
   report **the whole hub reaching zero seventeen times while twenty-two tasks were open**

All three are fixed, and the fixture now asserts its own volumes. The pattern is worth naming: **a fixture is
a claim about what real data looks like, and a wrong claim there is invisible everywhere and wrong
everywhere.**

**What changed in the layout:** the prose moved to where prose fits. The pane holds figures, dated one-line
marks, and what is next; the long-form `why` text lives in the full record, which is full-width and one press
away. Five stacked uppercase headings became two.

## 13. The design system

| | Before | After |
|---|---|---|
| Colour space | hand-picked hex, uneven perceptual steps | **OKLCH**, one ramp, even 4% lightness steps |
| Contrast pairs asserted | 0 (only what happened to render) | **64** — 32 pairs × 2 themes, `npm run prove:palette` |
| Themes | 1 | 2, driven by `prefers-color-scheme`, both measured |
| Elevation | flat borders | 3 shadow levels + a 1px top highlight, inverted for light |
| Spacing | 8 ad-hoc values (6, 8, 9, 10, 12, 13, 14, 26) | **one 6-step scale** |
| Motion | none | entrance, press, one ambient sweep — all `prefers-reduced-motion` safe |
| Type | static system stack | variable faces first (`Segoe UI Variable`), tabular numerals |

**The rule motion obeys, and it is the only one that matters:** *nothing that carries truth moves.* The
progress bar transitions its width because a bar has no readable value. The number beside it does not, because
a number in motion is unreadable and briefly **wrong**. The emblem's arc rotates but never grows — rotating a
fixed-length arc cannot misrepresent the fraction it encodes.

## 14. The gamification, and the one rule I imposed on it

He asked for levels, a profile that evolves, and rewards for doing things well. All of it is built. All of it
is **derived** — there is no `xp` column, no `level` column, no `achievements` table, and no schema change.

- **Standing:** points → level → rank, ten ranks from *On call* to *Ground control*.
- **The emblem:** ~90 lines of SVG geometry, no assets. One spoke per level so it is *countable*; the arc is
  the real fraction through the level; the core gains a ring every third level; the hue walks green → violet
  across the ladder. It recolours itself in the light theme for free because it is built from tokens.
- **Marks: 7 → 31 definitions** *(stated as 26 here originally; counted programmatically on 30 Jul 2026 while
  building `tests/ladder.mjs` and it is 31 — see RESEARCH §30)* across nine categories (volume, breadth, speed,
  reliability, depth, clearing,
  voice, return, time), with four rarity tiers.
- **"Doing them well" is measured from real signals:** leaving a note back for the agent, answering inside the
  deadline, answering within the hour.
- **What is next**, with honest arithmetic.

### The rule that shaped it: points may only depend on what HE did

The two most satisfying candidates for points were *"cleared a project"* and *"the whole hub reached zero"*.
Both are **excluded**, and this is the most important design decision in the feature:

> Both depend on how much is currently **open**. So an agent filing one task overnight would have silently
> deleted the bonus and dropped his level — punishing him for somebody else's write. **A score that can fall
> while you sleep is a score you would be right to stop believing.**

They are *marks* instead, and marks are reconstructed **historically**: a project was clear at a moment if
every task created before it was done before it. So *"Cleared harbour-lights, 26 Jul"* stays true forever even
after new work arrives — and is still fully reversible, because re-opening a task removes its `done_at` and the
moment it produced ceases to exist.

### One mechanic stays banned

**No streak.** Nothing counts consecutive days. The `return` category pays for *closing* a gap — *"Came back
after 11 days away"* — which is the same measurement with the opposite sign, and it is the direct application
of Silverman & Barasch (2023): merely **displaying** a broken streak cost 8.4 percentage points of continuation
on identical behaviour. Check P5 enforces the absence of streak and loss framing in the copy itself.

### And what I am recording rather than re-arguing

RESEARCH §19 argues against levels, with evidence — Hanus & Fox measured badges-plus-a-leaderboard over sixteen
weeks and motivation, satisfaction and empowerment all **fell**. He read that and asked twice. It is his tool.
What was never negotiable was not "no levels", it was **"no lies"**, and that is what the machinery below
protects.

## 15. Every new check, and what each one caught

`prove:layout` **13 → 21 checks**, now at **5 widths** and in **both themes**. `prove:use` **9 → 11**. New
suite `prove:palette`: **64 pairs**.

| Check | What it does | What it caught |
|---|---|---|
| **P5** *(rewritten)* | every stated target is `need - have` exactly; no streak or loss framing | replaced the old "no targets at all" rule after he asked for progression |
| **P6** | no scrollbar is a fat default bar | the 15px grey bars, which had never been measurable |
| **P7** | nothing drawn inside a graphic escapes it | the emblem's arc printing across the rank text |
| **C1** *(light pass)* | contrast under `prefers-color-scheme: light` | **a real bug on its first run** — `.copyval` at **1.18:1** |
| **U6** | page score == what the database adds up to, recomputed in SQL | — |
| **U7** | re-opening takes **points** back, not just the count | — |

### Three instrument failures found and fixed — the part worth auditing

1. **C1 could not read the new palette, and would have said "fine".** It parsed colours by taking the first
   three numbers out of the computed string with a regex. Against `oklch(0.79 0.01 80)` that computes a
   luminance from a lightness, a chroma and a hue angle → `NaN`, and **`NaN < 4.5` is false**. Demonstrated: it
   passed text at **1.62:1**. It resolves colours through a 1×1 canvas now — the same code path that paints the
   pixel. The focus-ring check had its own copy of the same broken parser; both are fixed.
2. **C1 measured gradient-backed buttons against the wrong colour.** A gradient is a background-*image*, so
   `backgroundColor` computes to transparent and the walk-up sailed past it to the page. It measured the primary
   action against near-black and passed; the same element in light measured **1.03:1**. It now **refuses to
   guess past a gradient** and reports the element as UNMEASURABLE, which counts as a failure — "I cannot tell"
   must never render as "it passes". That refusal immediately found 25 elements of my own.
3. **P7 passed while measuring nothing.** The emblem is in the pane's *idle* state, and the runner opens a task
   first — so there was no emblem in the document. Only the fault injection failing revealed it. It reports
   NOT MEASURED now.

**And the animations forced a fourth fix:** `getBoundingClientRect` includes transforms, so entrance animations
would have made every geometry check read a different number depending on when it looked. `tests/chrome.mjs`
now waits for `document.getAnimations()` to settle after every navigation, excluding infinite ones.

### Two self-inflicted errors worth recording

- **I put raw backticks in comments inside the `MEASURE` template literal. Twice.** The second time, quoting a
  CSS flag closed the string and the two hyphens that followed parsed as a postfix decrement —
  *"Invalid left-hand side expression in postfix operation"*, reported at the line where the literal *starts*,
  180 lines earlier. This file's own header warns about exactly this. There is now a warning at the top of the
  literal itself.
- **P7's first fault injection did not reproduce its fault.** It rotated the arc about its own centre — and a
  circle is rotationally symmetric, so nothing moved. The check reported "did not catch its own defect",
  correctly. It rotates about a corner now.

## 16. Measured, before and after

| | Before | After |
|---|---|---|
| Widest scrollbar | 15px | **10px** |
| Layout checks | 13 | **21** |
| Widths measured | 3 | **5** |
| Themes measured | 1 | **2** |
| Contrast pairs asserted before render | 0 | **64** |
| `prove:use` checks | 9 | **11** |
| Mark definitions | 7 | **31** (reported as 26 at the time; miscounted — RESEARCH §30) |
| Uppercase headings in the pane | 5 | **2** |
| Page payload per completion | 579 bytes, unbounded | **345** (86% less on a step-heavy task) |
| Tasks above the fold (L3), after the decisions cap changed | 6 / 9 / 15 | **10 / 14 / 20** |
| Scrolling regions on one screen | 3 | **1** |
| Decision options clipped mid-word | 1 | **0** |
| Runtime dependencies | 4 | **4** |
| Schema changes | none | **none** |

Suites: `prove` **33/33**, `prove:negative` **24/24**, `prove:palette` **64/64**, `prove:use` **11/11**,
`prove:layout` **21 checks × 5 widths + light-theme pass + 21 injections, all green**, `prove:health` **6/6**.

## 17. What I am still not sure about

1. **The reading pane still scrolls at 1080p** — 217px over at 1920×1080, 397px at 1280×900, and not at all on
   an ultrawide. The bar is now a 10px dark line rather than a 15px grey one, and I chose that over deleting
   real content from the pane. If it still bothers you, the cheapest ~200px are the two onboarding lines and
   the projects list.
2. **The level curve is a guess.** Ten ranks, thresholds 0/30/80/160/280/450/680/980/1360/1840, tuned so your
   real hub (2 tasks, 5 decisions ≈ 86 points) sits at level 3 with visible movement. Nothing in the research
   says where those should sit. They are one line each in `lib/progress.ts`.
3. **The point rates are a judgement too** — 10 a task, 6 a decision, 4 for a note, 4 for beating a deadline,
   4 for answering within the hour. The ratios encode an opinion: that a decision made quickly is worth about
   as much as a task finished.
4. **Still no real device.** Every phone and tablet figure is Chrome emulation. **Re-flagged for the third
   time**; I have no way to fix it.
5. **The 46vh decisions cap is still unverified.** Untouched. Re-flagged.
6. **The light theme has never been seen by a human** — only measured, and screenshotted by me. If you use a
   light desktop, that is the surface to look at first.
7. **`Segoe UI Variable` is a Windows 11 face.** On any other machine the stack falls back, which is correct
   but means the type looks slightly different there and I have only seen the Windows rendering.
8. **Nothing here has run against production.** All of it is the Neon `dev` branch. Your real hub is at 2
   finished tasks and 5 decisions, so you will open it at **level 3, *Operator*, with roughly 86 points** — and
   most marks unearned, which is the honest starting point rather than a flattering one.

---

# Part three: the whole hub, and the day-300 question

**Date:** 30–31 July 2026. **Brief:** [BRIEF-THE-WHOLE-HUB.md](./BRIEF-THE-WHOLE-HUB.md).
**Plan:** [PLAN-THE-WHOLE-HUB.md](./PLAN-THE-WHOLE-HUB.md). **Research:** [RESEARCH.md](./RESEARCH.md) §26–§31.

This part exists because of one question. Asked how the level pace felt, he said:

> *"dude, I've been working only 1 day, there will be more tasks every day. what will happen on day 300?"*

Nothing in the suite was shaped to answer that. Every check evaluated a single snapshot, and all of them were
green.

## 18. The answer, measured: the progression stopped on day 30

`RANKS` was a ten-entry array ending at 1,840 points. Running the real `standing()` over synthetic completions:

| Level | Rank | Lands at completion |
|---|---|---|
| 3 | Operator | 8 |
| 5 | Unblocker | 28 |
| 8 | Flight director | 98 |
| **10** | **Ground control** | **184** |

At his own observed mix — 3 tasks a day with one note back, 2 decisions answered quickly, **62 points a day** —
that is **day 30**. After it: the level never moved again, `toNext` was null forever, and **the emblem froze with
it**, because its geometry was a function of a level that had stopped. `spokes = min(level, 10)` and
`coreRings = min(3, ceil(level/3))` both saturate at ten. The profile he asked to have "get enhanced when I do"
stopped being enhanced in month one and would never have changed again.

`lib/progress.ts` stated the intent in its own comment — *"the top of the ladder is deliberately a long way off;
a ceiling reached in a month is a ceiling"*. The intent was right and the numbers did not implement it.

**Fixed by extension, never by rebalancing.** Every candidate replacement curve computed for this work put his
then-current 90 points at level 1 or 2 instead of 3. A level that falls because somebody rewrote the maths is
the same class of lie as a badge for something he did not do, so the ten named thresholds are frozen and
`rungAt` continues past them with each gap 110 points wider than the last. He chose that pace from a measured
table of three options.

| | Before | After |
|---|---|---|
| Level at day 30 | 10, and permanently | 10 |
| Level at day 100 | **10** | 15 |
| Level at day 365 | **10** | 25 |
| Level at day 730 | **10** | **33** |
| Emblem at day 730 | frozen at 10 spokes / 3 rings since day 30 | 3 spokes / 4 pips, still changing |
| `toNext` past day 30 | **null, forever** | always a number |
| His standing, unchanged | level 3, Operator, 90 pts | **level 3, Operator, 90 pts** |

## 19. Measured, before and after

| | Before | After |
|---|---|---|
| Idle reading pane, 1920×1080 | 1,257px of content in 1,040px — **217px out of reach** | 1,036px in 1,036px — **0** |
| ...what was cut | the footer, carrying the only "no agent has synced" warning | nothing |
| Idle pane, 1280×900 | 397px over; footer **and** the whole Projects list cut | 156px over; Projects reachable |
| Emblem, monitor | 76px, fixed at every width | **108px**, fluid `clamp(76px, 26cqi, 108px)` |
| Emblem ink, light theme | **1.52:1** and 1.66:1 — invisible in practice | **4.94:1** and 5.68:1 |
| Progress bar fill colour | `--ok` fallback — the level hue **never reached it** | the level's own hue |
| Level numeral | 13.5px, `--dim` | 28px, in the level's hue |
| Progress bar | 6px | 10px |
| Tap target, tablet | **36px** — the mouse size | **44px**, as designed |
| `why` visible on the queue | **never** | every row, at **zero** height cost |
| Tasks above the fold (L3) | 6 / 9 / 15 | **6 / 9 / 15** |
| Longest scroller (L4) | 2.01 screens | **2.01 screens** |
| Standing on a phone | 1,269px down (1.5 screens) at real volumes | on the first screen, at 95px |
| `prove:layout` | 22 checks, 22 injections | **23** checks, **23** injections |
| `prove:palette` | 64 pairs | **70** pairs |
| Suites | 6 | **7** (`prove:ladder`) |
| Fixture states | 3 | **5** (`--live`, `--stale` added) |
| Runtime dependencies | 4 | **4** |
| Schema changes | none | **none** |

## 20. Every new check, and proof each can fail

`prove:ladder` is new: **9 assertions, 3 fault injections.** `prove:layout` gains **L7**.

| Check | What it measures | At baseline | Its injected defect |
|---|---|---|---|
| **T1** | the ladder never runs out — there is always a next rank | **FAIL** — "nothing above Ground control… cannot move again, ever" | a simulated terminal `RANKS`: `toNext === null` |
| **T2** | the level still moves long after the current ceiling | **FAIL** — day 30 and day 730 both level 10 | — (consequence of T1) |
| **T3** | the emblem still differs from its day-30 shape | **FAIL** — frozen at 10 spokes | two levels capped to the same geometry |
| **T4** | marks keep arriving as the record grows | ok — 23 → 29 | — |
| **T5** | there is always something coming, at every scale | ok | — |
| **T6** | every stated target is exactly `nextAt - points`, at every scale | ok | — |
| **T7** | more finished work never means fewer points or a lower level | ok | — |
| **T8** | the fraction stays within 0..1 | ok | — |
| **T9** | no mark is earned but undateable | ok | a definition with `have >= need` and `at() === null` |
| **L7** | the idle pane fits on a monitor | **FAIL** — 217px over | put the height back as a percentage |

**The red run is committed**: `tests/baseline/before-ladder.txt` and `tests/baseline/before-pane.txt`. That is
stronger evidence than a fault injection, because an injection is a defect somebody already knew how to catch —
T1–T3 were not.

## 21. What running the checks first disproved, in my own plan and my own research

Recorded because it happened three times and each time the measurement was right and I was not.

1. **The plan claimed the MARKS were running out of depth.** They are not. T4 and T5 pass: earned marks rise
   23 → 29 over the range and `nextUp` is never empty. Struck out of the plan before any code was written.
2. **RESEARCH §26.3 called the empty lower half of a monitor a defect** — "the dead-column bug in a third
   costume". Once `fixture:live` existed, every layout check passed at those volumes, and rendered it reads as
   *calm*. Hard constraint 6 says an empty queue is success; the same logic applies to a short one. Struck
   through in place rather than deleted.
3. **The mark count was wrong in three documents.** 26 everywhere; counted programmatically it is **31** in nine
   categories. `prove:ladder` prints it now so it is never guessed again.

## 22. Things found that are not in the brief

1. **The committed screenshots were of a fixture that no longer existed.** 118 pts / "since 30 Jul" / "asked
   just now" against a fixture that produces 114 / "since 22 Jul" / "An agent has been blocked for 11h". The
   cost line the brief lists as shipped and proven **had never appeared in a committed screenshot.**
2. **`npm run shots:light` silently overwrote the dark screenshots.** `--light` did not affect the filename.
3. **`tests/shoot.mjs` never checked what data it was photographing.** Both of the above are consequences.
4. **THE HARNESS HAD NEVER EMULATED A COARSE POINTER.** `setDeviceMetricsOverride({mobile: true})` does not
   change the `pointer` or `hover` media features. Since `app/globals.css` puts the 44px minimums in the BASE
   and *tightens* them under `@media (pointer: fine)`, the mouse sizes applied at every width — so the 44px
   targets that exist because "a mis-tap on Done writes a lie into the database" had never been rendered,
   measured, or photographed. `measure-layout.mjs` asserted the opposite in its own comment.
5. **`--emblem-ink` was set on the `<svg>`**, and custom properties inherit downward only, so the panel, the
   level and `.fill` on the progress bar never saw it. **The bar had been painting its fallback colour** for the
   whole life of that rule.
6. **"1 project" beside a Projects list showing three.** RESEARCH §7 cause 7, and the same defect §7.2 of this
   report already fixed once. Found on production after deploying.
7. **`U7` was flaky on the most important assertion in the suite.** The tick polled; the re-open used a flat
   1,500ms sleep and read once, so *"a score that does not come back down is a score that is lying"* fired
   intermittently while the hub was correct — 2 failures in 15 clean runs, both the first run after a source
   edit forced a `next dev` recompile.
8. **A proof-run note is in the production hub.** The live footer reads *Last note: "Proof note at
   2026-07-29T23:00:52.867Z"*. This is the exact failure `docs/ENVIRONMENT.md` says the two databases were split
   to prevent. **Not fixable from here:** there is no delete endpoint for notes and the production
   `DATABASE_URL` exists only in Vercel.
9. **`prove:health` leaked port 3941 again**, exactly as `ENVIRONMENT.md` warns. Confirmed and killed by hand.
10. **A misplaced doc comment in `lib/progress.ts`** — `breadthReachedAt`'s description sat above
    `weeksReachedAt`, so one function was undocumented and the other described wrongly.
11. **The brief's own counts were off**: two unpushed commits, not one; 22 layout checks, not 24.

## 23. The kill condition, re-checked

`docs/DECISION.md` says to delete this project if a tracker ships "agent asks a question with N tappable
options, over an API, answerable from the mobile app". **MCP's 2026-07-28 spec now standardises the primitive** —
form-mode elicitation with `oneOf`/`const`/`title` enums plus a default is exactly `options[]` +
`default_option`, and its accept/decline/cancel maps onto this vocabulary. It does **not** meet the condition:
it is synchronous and in-client, has no queue, no delivery channel, and **no deadline or proceed-anyway**. It
reaches whoever is sitting at the session. Linear shipped agents everywhere through July 2026 and its Agent
Session API still has no options-question. Full detail in RESEARCH §27.

## 24. Verified on production, with this code live

Run deliberately after he pushed: `node tests/measure-layout.mjs https://needsme.vercel.app --production`.
**Every check green**, including L7 (the idle pane holds all its content on his real hub) and P5 (3 stated
targets, each exactly its own arithmetic). His standing read **level 4, Fixer, 172 points, 108 more to
Unblocker**, and `data-points="172" data-next-at="280"` gives exactly the rendered 108. He was level 3 at 90
points before the ladder change, so **nothing was taken away by it**. The dev-only emblem bench is **404** in
production.

## 25. What I am not sure about

1. **Still no real device.** Every phone and tablet figure is Chrome emulation — and this iteration found that
   the emulation was wrong about the pointer for the whole life of the harness, which is a reason to trust it
   *less* than before, not more. **Re-flagged for the fifth time.**
2. **The 46vh decisions cap is resolved rather than re-flagged, and the first attempt made it worse.** It was a
   pixel budget that sliced whichever card it ran out inside — in the fixture, mid-way through the fourth option
   of the second decision. The limit is a number of CARDS now: **one** renders whole, the rest behind a control,
   which is how the marks list already handles the same problem. Two cards was my first choice and measured
   **0 of 21 tasks above the fold at 1280** — worse than the cap it replaced, and exactly the failure L3 exists
   to catch. One card measures 10 / 14 / 20, against 6 / 9 / 15 before. It also removed a scrolling region: three
   on one screen became one. Nothing is clipped. What I am not certain of is whether one at a time is the right
   *feel* when several decisions are genuinely waiting — it is one press to see them all, but it is a press.
3. **The pane still overflows at 1280×900** — 156px, ending at the footer. L7 deliberately stops at 1920
   because at 860px of pane height the content does not fit without deleting something he chose to keep. It is
   a stated trade, not a solved problem.
4. **The extended ladder's pace is a judgement call.** RESEARCH §28.2 is the nearest thing to guidance and it is
   a warning rather than a recipe: Duolingo made a threshold easier, every engagement metric rose, and *"fewer
   learners were actually reaching their daily goals"*. I erred toward rungs that cost more over time.
5. **The rank names above `Ground control` are numerals** — `Ground control II`, `III`. He asked me to decide it
   and the reasoning is in `rankFor`: names cannot cover an unbounded ladder, and every draft past the tenth went
   either space-opera or joke. Appending to `RANKS` is still the whole change if he wants names.
6. **The `why` excerpt on a row is a truncation of prose that is three to five lines long.** The ellipsis says
   so and the full sentence is a click away, but it is an editorial judgement that a first clause is
   representative, and sometimes it will not be.
7. ~~**The payload is still unbounded.**~~ **Done, and measured.** `board()` selected `*` for every completed
   task and handed it to a client component, so every row was serialised into every page load with no ceiling.
   Narrowed to the columns the derivation reads, with the step count computed in SQL — the list is still
   uncapped, because check P2 exists precisely because it once was. **579 → 345 bytes per completion (40%)**
   against the fixture, and 40% is that fixture's floor: its completed tasks average two steps, while its
   19-step task carries **2,097 bytes of steps**, where narrowing saves **86%**. Page HTML with 11 completions
   went 60,879 → 56,925 bytes. At 900 completions, 509 KB → 303 KB.

   **And it broke the page first, which is the part worth recording.** Narrowing meant the client needed one
   function to convert the server's returned `Task` into the narrow row, and I put it in `lib/store.ts` and
   imported it into `Board.tsx`. `Board.tsx` had only ever imported `BoardState` from there with `import type`,
   which TypeScript erases — a **value** import pulled the whole of `lib/store`, and with it `lib/db` and the
   Neon driver, into the browser bundle. The page stopped hydrating and **all twelve `prove:use` checks failed at
   once**, every one reporting a timeout on the hydration predicate rather than anything about the record. The
   function lives in `lib/progress.ts` now, which imports nothing but `./types`. The narrow lesson: in a client
   component a value import from a server module is a database driver in the browser, and `import type` hides
   that until the day somebody needs a function from the same file.
8. **`prove:layout` cannot run against the `--cleared` fixture**, because L3 requires six tasks above the fold
   and that state has none. The earned-empty hub is verified by eye and by screenshot only.
9. **The two-column cleared layout uses CSS multi-column**, so the balance between the columns is the browser's
   decision rather than mine. It looks right at 1920 and 2560; at 1400–1600 I have looked at it and not measured
   it.

---

# Part four — the notification that was never sent, and the pane that was 214px over

## 26. He asked why the phone was silent, and the answer was that nothing had ever sent

> *"By the way dude, I haven't received telegram messages even though there have been some new tasks. Can you
> understand what's going on?"*

`app/api/agent/tasks/route.ts` imported nothing from `lib/telegram.ts`. Filing a task had never notified him,
for the entire life of the project. The questions route calls `sendQuestion` and reports `notified` honestly;
the tasks route returned `{ ok, created, task }` and stopped.

That contradicted three documents. `README` says the hub pushes; `docs/DECISION.md` #3 gives Telegram push as
one of the reasons for owning this rather than using something off the shelf; and `docs/RESEARCH.md` §7 cause 5
names it **the anti-rot mechanism** — the reason the hub does not have to be visited to work. A silent channel
turns the hub into a page he has to remember to open, which is the failure mode the whole design is arranged
against.

Nothing caught it because nothing looked. Every suite asserted the shape of the response, and `notified` was
never in the response to be wrong about.

### 26.1 What was built, and the rule

`sendTaskFiled()` in `lib/telegram.ts`, **deliberately with no buttons**. The question messages have tappable
options because a tap on an option is a decision, and a decision is reversible. A "Done" button on a task
message is not: a mis-tap writes a completion into the database, the derived score moves, and the marks move
with it. The message says what arrived and links to the hub.

He chose the rule from three options: **one message per burst, per project.** `taskNotifyDecision()` in
`lib/store.ts` reads `created_at` timestamps that already exist — no cron, no new table, no state to keep
alive, consistent with the standing rule in `AGENTS.md`. Four outcomes, all reported on the wire as
`notify_reason`:

| `notify_reason` | Meaning |
|-----------------|---------|
| `null` | A message went out. |
| `burst` | Another task landed in **this same project** within the window. The first one already told him. |
| `blocked` | The task carries a `blocked_reason`. He cannot start it, so announcing it is noise — and the count in the message would disagree with the count on the page. |
| `suppressed` | The rule said yes and the channel is off (`CC_SUPPRESS_TELEGRAM`, or Telegram unconfigured). |

Per project rather than globally, because two projects filing at the same moment are two different things he
needs to know about. A re-POST of an existing `key` never notifies: that is an edit, not an arrival.

### 26.2 Two of my own bugs, both hidden by my own error handling

1. **An integer with the string-concatenation operator applied to it** — `${windowMinutes} || ' minutes'` — is
   not valid Postgres. It threw, the `try/catch` around the notification swallowed it (correctly, since a silent
   phone must not fail a verified write), and **every task reported `notify_reason: null`** while the burst rule
   was never once consulted. A catch that protects the write also hides the logic inside it. Fixed to
   `${windowMinutes} * interval '1 minute'`.
2. **A backtick inside a template literal** in `lib/store.ts`, which broke the build and made `/api/health`
   return 500. Trap 1 in `AGENTS.md` exists for exactly this and I have now done it five times.

### 26.3 Measured, then locked

Six cases against the local hub:

```
A first      -> reason=suppressed      A second  -> reason=burst
A third      -> reason=burst           B first   -> reason=suppressed
C blocked    -> reason=blocked         A re-POST -> reason=null (created=false, notified=false)
```

Five new checks in `tests/prove.mjs` (**33 → 39**) assert each one, plus a sixth that withdraws the probe rows.
They assert `notify_reason` rather than `notified`, and that distinction is the point: locally
`CC_SUPPRESS_TELEGRAM=yes` — the suite refuses to run without it, because a test run once pushed a dozen
synthetic notifications to his real phone — so `notified` is `false` whichever way the rule went. Without the
reason on the wire, a check could not tell *"the rule said no"* from *"sending is off"*, and the one piece of
logic standing between his phone and nine notifications in a row would have no test at all.

## 27. L7 failed by 214px, and the fix was the projects list

`prove:layout` was green except for L7, which measures the **idle** reading pane against the space it has. At
1920×1080 the pane held 1,254px of content in 1,040px. What was cut is what L7 exists to protect: the footer,
which carries the only warning that no agent has synced and the queue may therefore be stale.

Measured per section, the largest single item was not the profile or the record but the **projects list at
340px** — a quarter of the column, spent on filter controls:

| | before | after |
|---|---|---|
| projects list | 340px | 154px |
| pane content at 1920×1080 | 1,254px in 1,040px | **1,039px in 1,039px — 0 over** |
| pane content at 2560×1440 | — | 986px, 0 over |
| pane content at 1280×900 | 1,257px in 860px | 1,078px (218 over — see below) |

Three changes, in order of what they bought:

1. **The project rows became wrapping chips.** Ten full-width 48px rows became three rows of chips. It also
   reads better at the count he is heading for: fifteen stacked rows is a list you scan line by line, fifteen
   chips is a shape you take in at once, and the pane is the five-second-glance surface (§22).
2. **One figure per chip, and it is whichever one means something.** The row used to read
   `2 waiting · 4 open · 6 done` — three numbers on a filter control, two of them noise in any given state. A
   project with four tasks open does not need to be told it also finished six, and a project with nothing open
   was reporting `0 open`, the least useful sentence available. Now: decisions if any, else open work, else the
   finished count in green — which is the state where *"this project is clear"* is the whole point and the only
   place the hub says it. Neither, and it shows no figure rather than a zero.
3. **The pane hint kept its sentence and lost its separator band** — 12px of padding, a rule and 14px of margin
   under one 20px line, directly above a panel that already has its own edge. The border was drawing a boundary
   that was drawn twice. Content was not deleted to make the check pass; that was the trade the L7 comment
   already recorded refusing.

**1280×900 is still 218px over, and that stays a stated trade rather than a silent one.** L7 covers monitor and
ultrawide by design: 1920 is the width he actually uses, and it is the width at which fitting is achievable
without removing something he asked for. It improved from 397px to 218px as a side effect.

## 28. The chips found a light-theme contrast bug that had been shipping all along

The selected chip is `--s3`, so `.pmeta` in `--mute` landed on a background nothing had paired it with. Adding
the two missing pairs to `prove:palette` failed immediately:

```
FAIL  4.1:1  needs 4.5  mute on a selected control  (#6f6761 on #e1ded7)
```

`--s3` is not just the selected state — it is what `button:hover` paints. So **every muted count, timestamp and
caption inside every control on the hub dropped under WCAG AA the moment the pointer touched it, in the light
theme, from the day the light theme shipped.** It went unseen because the pair list had `dim` on `s3` and not
`mute` on `s3`, and the light ramp has far less headroom than the dark one: `mute` on `s2` was scraping by at
4.61:1.

**Both quiet tiers moved, not just the failing one.** Darkening only `--mute` would have closed the tier gap
from 0.07 lightness to 0.035 and made the two levels of quiet indistinguishable, which is the hierarchy the
ramp exists to express. `--dim` 0.450 → 0.415 and `--mute` 0.520 → 0.485 keeps the gap and improves every light
pair for both tokens:

| light pair | before | after |
|---|---|---|
| mute on a hovered/selected control | 4.10:1 ✗ | 4.76:1 |
| mute on a control | 4.61:1 | 5.35:1 |
| dim on a hovered control | 5.54:1 | 6.43:1 |

`prove:palette` is **70 → 74 pairs**, both themes, and C1 confirms it against real painted pixels at all five
widths in both themes.

The general lesson, and it is the same one as §26: every pair in that file was added because an element appeared
on a background nobody had paired it with — not by auditing the palette. `--s3` is the hover step for every
control on the page and it will keep collecting text.

## 29. Still open

- **`prove:health` was not run in this pass.** It needs the dev server stopped (`next dev` allows one per
  directory) and I was not going to stop a server I did not start. It exercises `/api/health` against a dead
  database and touches nothing changed here.
- **`prove:use` is not idempotent.** It ticks tasks off and leaves the fixture at 11 completions instead of 9,
  so a second consecutive run fails 7 of 12 with an accurate message telling you to re-run `npm run fixture`.
  Passing after a fresh fixture is the contract; it is worth knowing before reading a failure as a regression.
- **The pane fits at 1920 with 0px to spare.** The next line added to it fails L7. That is the check working.
- **The `.row.leaving` departure animation has not been looked at**, only added.
- **Two controls still land identically** — the header's `11 done` chip and the pane's `11 finished` figure both
  open the record's tasks tab. Down from four; `npm run audit` prints it as a finding every run rather than
  letting it hide.

---

# Part five — the plan audited, Phase A finished, and the half of the loop nobody had built

> *"is our plan really the best? do a small audit and then start doing everything in the highest quality
> possible."*

## 30. What the audit of my own plan found

Full findings in `docs/PLAN-BEST-HUB.md`. Five, and one of them mattered:

1. **The brief's second stated goal had no phase.** *Ease his communication with the AIs* was one bullet in the
   last of eight phases, and the brief itself calls it the under-served half. Promoted to Phase J, ordered
   second. §32 is what it turned into.
2. **The decision card was third on a hub with zero open decisions.** Measured: 6 open tasks, 14 finished,
   5 decided ever, 0 open. The plan justified the position with *"they are the expensive thing when they
   exist"* — and "when they exist" was carrying the sentence. Dropped behind the queue and identity.
3. **Phase H was a phase about test machinery, fifth of eight.** He has already told me tests and docs
   outweighed product 2:1 and that he noticed. Dissolved into the phases whose work each item protects. Two
   items in this part came out of that and cost minutes rather than a session: the focus-ring check (§31) and
   the audit's new entry point (§32).
4. **Phase I has been re-flagged six times as a request for ten minutes of his time.** That is not a plan. One
   concrete ask, once, and nothing waits on it.
5. **The plan was written for a hub with six tasks** while he asked what happens at day 300 — the question that
   reshaped the whole scoring ladder. Phase E now has a volume trigger (40 open tasks, or 8 projects with open
   work) instead of an ordinal.

Revised order: **A → J → C → D → B → F → E → G.**

## 31. Phase A finished, and the focus ring was being shaved off seven controls

New check **K5: no focus ring is shaved off by a scrolling container.** The ring is drawn 2px outside a control
with a 2px stroke, so it needs 4px of room, and `overflow-y: auto` clips both axes rather than only the one that
scrolls. `.pane` had `padding-right: 4px` and nothing on the left.

**Seven controls, at every desktop width, for the whole life of the pane:** the record figure, the marks link,
the compose button, and every project chip. A ring that is whole on most controls and shaved on the ones inside
one column is worse than a uniformly thin one — the indicator changes shape as focus moves, which reads as the
page glitching rather than as focus travelling.

Fixed with `padding: 4px` and `margin-left: -4px`, so the content lands exactly where it did and the 4px comes
out of grid gap that was empty. `top` and `max-height` paid for the vertical 4px, because L7 fits with 0px to
spare and unpaid-for padding would have failed it immediately.

### 31.1 The check took two wrong answers to get right, both the same mistake

Worth recording because it is this file's most repeated error in a new costume — measuring a **proxy** for the
thing I wanted.

1. **It compared the ring to the container's VISIBLE box** and reported 28px and 117px cuts on the last two
   controls in the pane. Nonsense: at 1280 the pane genuinely scrolls, so those controls were merely below the
   scroll position, and a control you scroll to has a whole ring when you get there. It was measuring "off
   screen right now" and calling it "clipped". Rewritten against the **scroll extent**, where a ring is only
   truly cut at the ends of the range.
2. **It then subtracted the scrollbar gutter** from the room available on the right and reported exactly 10px —
   this pane's gutter — off every full-width control in it. `clientWidth` is the padding box *minus* the gutter
   already, and `scrollWidth` is measured on the same basis. I was correcting for something the platform had
   already corrected for.

The room requirement itself is read from a **real Tab focus** rather than hardcoded as 4, so a geometry check
cannot drift from the stylesheet it is checking.

### 31.2 The departure animation, and whether motion can lie

`.row.leaving` had been written and never looked at. Motion on this surface is a claim: a row sliding out of the
queue says the completion landed. Two checks now, watched with `getAnimations()` from the moment of the click —
because *"it ended up still there"* is not the same claim as *"it never started leaving"*:

- **a REFUSED completion must not animate the row away** (the write is refused with a 500 mid-flight)
- **a CONFIRMED one must**, or the first check would pass forever after someone deleted the feature

And looked at, not only measured: `tests/shots/depart-midflight.png`, paused at 260ms of 420.

## 32. Phase J — the hub now says whether anything came for what he wrote

What existed was one grey line in the footer: the note truncated to 120 characters, no date, no project, no
history, and no indication that anything had collected it. Writing a note replies:

> Saved — the next riff-kitchen agent will read it

A promise about the future, in a codebase whose central rule is that nothing reports success until it has been
re-read. He was told an agent **would** read it and never told whether one **did**.

There is now a fourth tab on the record — **Told agents** — listing the last 20 with project, time, full text,
and one of two sentences: who synced after it, or *"No agent has synced since you wrote this"* in the same amber
as the stale-sync warning. The footer line became the control that opens it.

### 32.1 It says SYNCED and never READ, and that is the design

A note reaches an agent through the event log, and `syncFor` returns `project is null` events to every caller —
so for an **unscoped** note (the default when he writes without choosing a project) an agent that synced
afterwards was genuinely handed it. For a **project-scoped** note, an agent scoped elsewhere has its events
filtered and never sees it, and nothing records what scope a sync used.

Two ways to make it exactly provable were considered and rejected: store the scope on the agents row, or write a
delivery event per note per agent. Both were rejected because **the honest version needs no new column, no new
event kind and no migration against a production database whose URL only Vercel holds.** The smallest thing that
is exactly true beat the bigger thing that would have been more precisely true.

It costs nothing to run: `board()` already fetched both the notes and every agent's last sync time. No new query,
no new endpoint, no schema change. Six checks in `prove:ladder` (R1–R6) plus the obvious wrong implementation as
an injection — crediting any agent that has ever synced, which would make every note look collected the moment
one agent existed.

### 32.2 A real bug underneath it: catching up skipped events, silently

`syncFor` returned `changed` with `limit 200` and then set the agent's cursor to `max(seq)` over the **whole**
event log. So an agent 300 events behind received 200 of them and had its cursor moved to the head anyway. The
other hundred were unreachable: the next sync asked for everything after the head and correctly got nothing.

**Nothing could have caught it.** The response and the stored cursor were internally consistent, every figure on
the page was right, and the loss was only visible by comparing what an agent asked for against what it could
still ask for afterwards. It is precisely the failure the open-items guarantee exists to survive — open tasks and
questions are returned unconditionally, ignoring the cursor — except `changed` is where "what happened while you
were gone" lives, and that half was lossy.

The cursor now stops at the last row handed over, and `more: true` says to call again immediately. Verified by
manufacturing 260 events:

```
page1: 200 events  more=true   cursor=12646  maxReturned=12646
page2: 123 events  more=false  minSeq=12647  overlap=0
walked 323 of 323 events in the log
```

Before the fix, page two returned nothing. `docs/API.md` and `AGENTS.md` document the loop.

### 32.3 Three things caught by looking, not by reasoning

1. **The footer read "Last agent sync: fixture, just now" directly above "no agent has synced since".** Both
   true — the note came after that sync — but they read as contradicting each other, and a reader has to
   reconstruct the ordering to see it. That is the trust gap in miniature, and the same defect the per-project
   open counts were already fixed for. It names the ordering now: *"Your last note came after that."*
2. **`npm run audit` printed my own preview as a finding** on the first run after it shipped: *"TRUNCATED WITH
   NO WAY TO THE FULL TEXT — pane/saidpeek (122 chars, not openable)"*. Correct. My defence was that the full
   text is one press away on the control **above** it, which is an argument rather than a structure — the same
   shape of reasoning that produced titles cropped at 38% in the record, which he found in twenty seconds. The
   preview is inside the button now, so the clipped text *is* part of the thing that opens the whole text.
3. **The fixture produced the collected state for BOTH notes.** Its own agent syncs landed after the one I had
   dated a minute ago, so the amber sentence — the one he can act on — was unreachable in the only fixture
   anything is measured against. It is written last now, stamped `now()`, after every back-date. This is the
   second time this fixture has designed against the easy case; the first was one-line `why` values when real
   ones run to five.

## 33. And production taught two more within a minute of the deploy

The surface went live and its headline on his real hub was:

> Last note collected by isolation-check — "Proof note at 2026-07-29T23:00:52.867Z"

A marker left behind by a proof run days earlier, credited to a test agent, in the loudest position of a channel
built to be trusted. Nothing about the sentence was wrong; it was simply not worth a headline, and it crowded out
a footer whose other job is freshness.

1. **Prominence in proportion to actionability.** The amber state and the preview now appear only when the last
   note has not been collected. Otherwise it is a plain way in.
2. **Withdraw** — the one delete in the interface, and it needed the argument rather than the convenience.
   *"No delete endpoint and there should not be one"* stays true for everything an **agent** owns: a task an
   agent filed is a record of work, and dropping it is a status change so the history survives. This is his own
   text, the only thing on the page he authored, and a channel you can write to but never take back is one you
   write to carefully rather than freely — the opposite of what the outbound half needs. It also had a concrete
   trigger, which is the honest reason it exists now rather than eventually: there was no way to remove that
   production note, so the alternative was permanent test residue in the most prominent position on the page.

   **The `note.created` event survives**, deliberately. Agents were already handed it, and deleting it would
   have the hub claiming a message it delivered was never sent. A check asserts exactly that, because it is the
   kind of thing a later refactor tidies away. `removeNote` goes through `writeVerified` like everything else: a
   delete that reports success without re-reading is the same defect as a write that does, and harder to catch,
   because the absence it claims looks identical to the absence it failed to produce.

## 34. Where the numbers stand

| suite | before this part | after |
|---|---|---|
| `prove` | 39 | **43** |
| `prove:layout` | 23 checks × 5 widths | **+ K5 at three widths** |
| `prove:palette` | 74 pairs | 74 |
| `prove:use` | 12 | **14** |
| `prove:ladder` | 9 + 3 injections | **15 + 4 injections** |
| `npm run audit` | 7 entry points, 1 finding | **8 entry points, 1 finding** |

The one remaining audit finding is unchanged and known: the header's `N done` chip and the pane's `N finished`
figure both open the record's tasks tab. Down from four such pairs; it is printed on every run rather than left
to be rediscovered.

## 35. Still open, honestly

- **`prove:health` has not been run in either part.** It needs the dev server stopped and I was not going to kill
  a server I did not start. It exercises `/api/health` against a dead database.
- **No real-device check.** Seventh flag. Every phone and tablet figure is Chrome emulation, and this iteration
  proved the emulation was wrong about the pointer for the harness's entire life — which is a reason to trust it
  less, not more. Three specific questions are in the plan; nothing else waits on them.
- **The pane fits at 1920 with 0px to spare.** The next line added to it fails L7. That is the check working.
- **1280×900 is still 218px over** in the pane, and stays a stated trade: L7 covers monitor and ultrawide by
  design, because 1920 is the width he uses and the width at which fitting is achievable without deleting
  something he asked for.
- **The reach sentence is about syncs, not reads**, for the reason in §32.1. If project-scoped delivery ever
  needs to be exactly provable, the change is one nullable column recording the scope of a sync.

---

# Part six — what a level is for, and the setup prompt that was three features behind

## 36. He told me the setup prompt is not optional

> *"dude, never forget our setup page, if we have some features to be explain to the AI which will be setting up
> the project, we should always update the setup prompt."*

He was right, and it had already happened. `lib/snippet.ts` is served by the hub at `/api/agent/snippet` and
written into every project's `AGENTS.md` by `cc onboard` — **it is the only thing most agents ever read about how
to use this hub.** Three shipped features were missing from it:

- task notifications and `notify_reason`, so an agent could not know that filing a task might ping his phone,
  let alone report honestly which outcome happened
- the paged sync loop, where **not looping means silently losing events**
- the fact that he can now see whether a note was collected

A feature missing from that text does not exist as far as agents are concerned, and it is worse than
undocumented, because the snippet reads as complete.

### 36.1 Two guards instead of a resolution to remember

1. **A coverage check in `tests/prove.mjs`** lists every agent-facing behaviour with the field name that proves
   the snippet mentions it. Ship a behaviour without documenting it and the check names what is missing. Matched
   on field names rather than prose, so the wording stays free to improve.
2. **`/setup` renders `agentsSnippet` itself** — the exact bytes the endpoint serves and `cc onboard` installs —
   so a gap is visible on the page rather than only in a suite. The pasted prompt above it is still the one
   hand-written thing on a page whose own opening comment says *"add sections here freely, but compute them.
   Never paste"*, and it now says so.

### 36.2 The audit had never walked /setup, and found two things when it did

**A real defect of mine.** `app/setup/page.tsx` carried its own copy of the project colour — `hsl(h 62% 58%)` —
under a comment reading *"Same derivation as the board, so a project is the same colour in both places."* That
stopped being true the moment the board's version moved to OKLCH. The same project rendered as **two different
colours on two pages of the same hub**, and the only thing asserting they matched was a sentence. It is exactly
the drifting duplicate that page exists to avoid. One derivation now lives in `lib/colour.ts`, which has no
`'use client'`, so a server page and a client component can both import it.

**A third false positive in my own truncation check.** It reported both copy blocks as truncated with no way to
the full text — 1,808 characters of prompt and 7,464 of served instructions. Both are `max-height: 300px` with
`overflow-y: auto`, so every character is reachable by scrolling. The check counted `auto` and `scroll` as ways
of *hiding* text, then offered only two routes back to it: a `title` attribute or an ancestor control. Scrolling
is a third, judged per axis.

Every wrong answer that one check has given came from the same place: treating a mechanism — overflow,
`scrollHeight`, a scrollbar gutter — as if it were the thing I cared about, which is whether a person can get to
the words.

## 37. What a level is FOR

> *"I have a genius idea for the motivation. I thought — what do levels give us? NOW I KNOW! If each level will
> be granting new designs, new backgrounds, new elements, colours… The user could have all those settings to set
> anything he has unlocked."*

This is a diagnosis, not a feature request, and the defect it names is real. Before this, finishing work raised a
number, and the reward for the number going up was **a bigger number, a longer rank name, and one more spoke on
the emblem.** Every one of those is *about* the progress system. The whole progression was self-referential: it
described itself and changed nothing he actually looked at.

Six palettes, at `/looks`. Three are reachable on day one, because a reward surface whose first item costs a
month is one he sees once, empty, and never opens again.

| look | gate |
|---|---|
| Graphite | level 1 — the hub as it was |
| Slate | level 2 |
| Bronze | level 4 |
| Ink | level 6 |
| Moss | **the mark:** cleared a whole project |
| Plum | **the mark:** ten decisions answered before their deadline |

The last two are gated on marks rather than levels on purpose. A level is a smooth function of volume, so a
level gate arrives on a schedule. A mark is a *shape* of work, so a mark gate says something about **how** he
worked rather than how much — and rarity means nothing if everything is volume.

### 37.1 The one rule that makes it safe: hue and chroma, never lightness

This is the whole engineering argument and it is worth stating precisely.

WCAG contrast is a function of relative luminance, and in OKLCH luminance is carried almost entirely by L. That
is not an assumption — it was **measured on this exact ramp** when the surfaces first got a temperature:
tripling `s0`'s chroma moved `text` on `--s0` from **17.88:1 to 17.90:1**.

So every palette is generated from **one shared table of lightness values** — the default's, with every pair
already asserted against them — and differs only in hue and chroma. Every palette therefore inherits the
default's proven contrast *by construction*, rather than by review.

`prove:palette` does not take that on trust: the full pair list against every palette in both schemes,
**39 × 6 × 2 = 468 checks**, computed with no browser. Plus a check that the generator reproduces the shipped
default exactly, number by number, so the palettes cannot drift from `app/globals.css`. And a new injection: a
palette that moves *lightness*, because one that only over-saturates would pass and prove nothing.

**Meaning is not skinnable.** `--ask`, `--ok`, `--bad` and `--go` are fixed across every palette. Amber means a
decision is waiting in all of them or it means nothing in any of them.

### 37.2 It found two contrast failures that were live

Both on tokens that had never been asserted, because the pair only exists while the pointer is on a control —
and C1 measures what is rendered at rest, so neither harness could ever have seen them:

| pair | was | needs |
|---|---|---|
| white on the send button, **hovered** | **4.45:1** | 4.5 |
| white on the tick button, **hovered** | **4.12:1** | 4.5 |

Both were hover states that *lighten* a solid fill carrying white text, which reduces its contrast. They darken
now — 5.69:1 as the worst case across every unlockable palette's accent hue, chosen by measurement rather than
picked. The light theme had already darkened its hover and was right; the dark theme had the same mistake twice.

A third, found by the palettes rather than pre-existing: the light `--accent` at L 0.480 measured 4.44:1 on a
control for the teal-leaning accents two palettes use, because high-chroma teal clamps brighter in sRGB — the one
way a hue change *can* move luminance. It is 0.455 now, and every palette including the default improved with it.
The generator also caught the light theme using accent hue 258 where dark used 255, a disagreement with no cause.

### 37.3 Derived, except the one thing that cannot be

What is unlocked is a pure function of the same `standing` and `marks` every figure on the page comes from. No
grants table, no unlock events, nothing to backfill. **Re-opening a task takes points back and can take a look
with it**, and the page states that plainly — a hub where the score is honest and the rewards are not would be
worse than one with no rewards.

The one genuinely underivable thing is which of several unlocked looks he prefers, and that is stored in a
**cookie**. The reasoning, since this is the first non-derived state in the project:

- **No migration.** The production connection string exists only in Vercel, so a `settings` table would mean
  either handing him a chore or shipping a feature that silently does nothing in the only place it matters.
- **No flash.** It is read during server render and the palette arrives as a hoisted `<style>` in `<head>`, so
  the correct look is in the first HTML rather than swapped in after paint.
- **Per device**, which is arguably better than one global choice — his phone can be on Ink while the desk is on
  Bronze.
- **What is lost, plainly:** clearing cookies resets the choice. Nothing else — every unlock is derived from work
  he did, so the perks cannot be lost, only the selection.

**And the cookie is not trusted.** It is user-editable, so `looks.set` recomputes his standing from the rows and
refuses a locked palette with a `403` naming the requirement. A `400` is kept separate for a palette that does
not exist, because telling him to keep working for a look that is not real would be its own kind of lie. Without
that check the unlock would be decoration for anyone who can open dev tools.

### 37.4 The line I drew inside "some other enhancements too"

**Nothing useful is ever locked.** Perks are appearance only. A hub that withholds a feature to motivate you is a
hub that is worse at its job on purpose, and this is a tool he depends on across fifteen projects. A denser
queue, a keyboard shortcut, a faster path to a task — those are utility, and they ship for everyone at level one.

### 37.5 Three things caught by looking

1. **The swatches previewed the wrong scheme.** They drew the dark variant always, so on a light desktop every
   swatch showed a palette he was not going to get — a preview that shows the wrong thing is worse than none,
   because he would choose from it. Both schemes are rendered and `prefers-color-scheme` picks one; not
   `matchMedia`, which in a client component inside a server-rendered page is the classic hydration mismatch.
2. **A value import between two `lib` files broke the suites.** `lib/perks.ts` imported `PALETTES` from
   `lib/palettes.ts`, and Node's type-stripping cannot resolve an extensionless value import between `.ts`
   files — type-only imports are erased, which is why nothing had hit it before. The fix was better design
   anyway: a perk gates a palette, and the palette owns its own description.
3. **`shoot.mjs --path /setup` was unusable from Git Bash**, which rewrites a leading slash into
   `C:/Program Files/Git/setup` and produces a hydration timeout on a page that hydrates perfectly. Normalised,
   because this repository is on Windows and a tool with a footnote is a tool that gets used wrong.

## 38. Where the numbers stand

| suite | part five | now |
|---|---|---|
| `prove` | 43 | **49** |
| `prove:palette` | 74 pairs, 1 palette | **39 pairs × 6 palettes × 2 schemes = 468** |
| `prove:ladder` | 15 + 4 injections | **25 + 5 injections** |
| `prove:use` | 14 | 14 |
| `prove:layout` | 24 checks × 5 widths | unchanged |
| `npm run audit` | 8 entry points | **11**, including `/setup` twice and `/looks` |

## 39. Still open

- **`prove:health`** remains unrun in this session; it needs the dev server stopped.
- **No real-device check.** Eighth flag.
- **The perk system has one kind so far.** `PerkKind` is a union with `'palette'` in it; emblem finishes and
  page backgrounds are the obvious next two, and the architecture takes them without change. Backgrounds carry
  the one genuinely new risk, because a texture behind text is the first perk that could affect legibility in a
  way the lightness rule does not already cover.
- **The choice does not follow him between devices.** Stated as a trade rather than hidden; the fix is one
  `settings` table and one migration, and the honest way to get it is a task in his own hub with exact steps.
