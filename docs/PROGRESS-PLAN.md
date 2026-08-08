# The plan: make finished work visible, and true

**Date:** 30 July 2026. **Brief:** [BRIEF-PROGRESS-AND-REWARDS.md](./BRIEF-PROGRESS-AND-REWARDS.md).
**Research:** [RESEARCH.md](./RESEARCH.md) §17–§24 — read §24 first, it contradicts the brief in four places.
**Status:** awaiting approval. Nothing in here has been built.

---

## 1. The concept, in one paragraph

**The hub gets a record, not a scoreboard.** One truthful count on the first screen — *what you have
finished* — that is also a control: pressing it turns the queue into the list of everything you have done,
where each finished task can be **re-opened**, which takes the credit back. Beside it, in the reading pane
you already look at, the record says what actually became true: each completion quoted with the agent's own
`why` sentence — *"Unblocks 2,849 pins."* — because that is the sentence that makes the errand feel worth
having done. Decisions you made are counted separately and equally, because unblocking an agent is an
accomplishment and nothing currently says so. Milestones exist, and they are **statements about the past,
never targets**: "that was your 25th", "you cleared harbour-lights", "the whole hub reached zero". Nothing
is stored. Every figure is a `SELECT` over `tasks.done_at` and `questions.answered_at`, so re-opening a task
removes it from the count, the list *and* any milestone, for free, because the row stops matching.

## 2. Why this shape and not the one that was asked for

The brief asked for "levels, achievement badges". I am building something that does the job that request
was pointing at, and I am not building points and levels. The reasoning, with the evidence, is
[RESEARCH.md §19](./RESEARCH.md); the short version:

| Asked for | Why not | Instead |
|---|---|---|
| **Points / XP** | Deci, Koestner & Ryan 1999 (128 experiments): expected, completion-contingent tangible rewards undermine intrinsic motivation. Points-per-task *is* that configuration. Cerasoli 2014 (k=183, N=212,468): incentives help *quantity*; his tasks are quality-shaped, done once. | A count of finished work, with no target attached. Same information, informational rather than controlling significance (Ryan 1982). |
| **Levels** | Kivetz, Urminsky & Zheng 2006: **post-reward resetting** — effort measurably drops after each threshold is reached. A level ladder is a trough generator, in a tool whose main risk is a lapse. | Milestones that are only ever announced *afterwards*, so there is no threshold to approach and no dip after it. |
| **Badges** | Hanus & Fox 2015, *Computers & Education* 80:152–161: badges + leaderboard, measured at four points over 16 weeks — motivation, satisfaction and empowerment **fell**, and exam scores were lower. This is the closest thing in the literature to building exactly what the brief describes and watching it for four months. | Milestones as facts with dates. No currency, no unlocks, no "3 to go". |
| **Streaks** | Silverman & Barasch, *JCR* 49(6) 2023: **identical behaviour**, continuation 66.23% when the log showed an intact streak vs **57.86%** when it showed a broken one. Worse when the person feels responsible for the break. His absences are frequently not his doing — agents decide when work arrives. And hard constraint 6 says an empty queue is success; a streak says an empty week is failure. | A cumulative total, which is absence-tolerant by construction: a quiet week leaves it exactly where it was. |
| **A contribution grid** | It renders "nobody asked you to do anything" and "you did nothing" as the same pale square. That is a graph making an untrue claim about him — the forbidden failure arriving as a visualisation. | If any time view ships, it distinguishes the two using `tasks.created_at`. **Not in this plan.** See §8. |

**What the evidence positively points at**, and what the design leans on instead: Amabile & Kramer's
progress principle (~12,000 diary entries — progress in meaningful work is the single largest driver, and
28% of *minor* events had a major effect on how people felt), and Grant 2008 — ten minutes of contact with
one beneficiary produced **+142% persistence and +171% output** a month later. The hub already stores the
"what it was for" sentence. It currently throws it away at the exact moment it becomes true.

## 3. The architectural rule, and the finding that forced it

**Everything is computed. Nothing is stored. And the source is `done_at`, never `events`.**

That second half is the non-obvious part and it is [RESEARCH.md §17](./RESEARCH.md). `events` looks like the
right table — append-only, monotonic `seq`, carries `at`, has a `task.done` kind. It is wrong twice:

1. **Append-only means credit can never be taken back.** A task completed, re-opened and left open still
   has its `task.done` row forever. A timeline built from `events` is the brief's forbidden lie, reached by
   picking the most natural-looking table.
2. **It is not a record anyway.** Measured on the dev branch: **31 rows spanning 35 seconds**, `seq`
   starting at 612 — roughly 611 rows destroyed by earlier proof runs.

`tasks.done_at` is set on every completion and cleared on re-open (`setTaskStatus`, `lib/store.ts`). So a
plain `where status = 'done'` is self-correcting: undo a completion and it leaves every derived figure at
once, with no decrement logic to get wrong. **No new table, no new column, no cache, no migration.**

Consequences I am committing to:

- No `xp`, no `level`, no `achievements` table, no counter column. Zero schema changes.
- Milestone *definitions* live in `lib/progress.ts` — typed, in the diff, like `lib/snippet.ts`. Milestone
  *state* is derived at render time. A wrong rule is fixed by deploying, not by migrating.
- No figure is parsed out of prose. `unblocks` **is not a field** (§24 item 2) — `why` is free text that
  sometimes contains a number. It is quoted verbatim, never mined for a statistic.
- `minutes` is an agent's estimate. Wherever it appears it is labelled as an estimate, or it does not appear.

## 4. What lands on the screen

### Tier 1 — the glance (already-looked-at space, five seconds)

[RESEARCH.md §22](./RESEARCH.md): over 70% of tracker use is ~5-second glances (Gouveia et al., UbiComp
2016). So the count goes in `header .summary`, beside the counts that are already there, as one more chip —
and like them, **it is a control**: pressing it switches the queue to the finished list.

```
Command Center                                            4 projects
[ 4 decisions blocking an agent ]  [ 16 tasks · about 5h ]  [ 28 done ]
```

### Tier 2 — the record, in the reading pane

The pane's idle state is where he looks when nothing is open, it is sticky on a desktop, and it currently
ends in a grey footer line reading `Recently done: a · b · c`. That line is the whole of today's
completion surface: no count, no history, no `why`. It is replaced by:

- **The count, stated plainly**, tasks and decisions separately — never summed, because a single number
  across two different things is a points economy with extra steps.
- **The honest date range, computed**: `min(done_at)` → "your first was 30 July". If the record is three
  days old it says three days old. An honest short record beats a flattering curve, per the brief.
- **What became true** — the most recent completions, each quoting its `why`. This is the Grant mechanism
  and it is the emotional payload of the whole feature.
- **Per project**, `n open · n done`, each row already a filter control (the `.projlist` pattern exists).
- **Milestones reached**, with dates.

### Tier 3 — the full record, when the chip is pressed

The queue region shows every finished task and every decision made, grouped by project, each finished task
carrying a **Re-open** control. This is what makes a page of completed work pass §14's rule (*if clicking
it does nothing it does not go on the page*): a completion is undoable, so a list of completions is a list
of controls.

`task.reopen` **already exists** in `app/api/ui/act/route.ts` and nothing in the interface has ever called
it. No API change; an existing action gets a button.

### The empty hub becomes the best screen in the app

Hard constraint 6 says an empty queue is success. Today it says "Nothing needs you." and stops. It will
also state the record: *"Nothing needs you. You have finished 28 tasks and answered 5 decisions."* Plus
the **cleared** milestone when the whole hub is at zero. This is the direct answer to §18: the design must
make an empty week read as a win, and a streak cannot do that.

### Milestones — the eight, and the rule that keeps them honest

All derivable from `done_at` / `answered_at` / `project` / `created_at` / `deadline` / `steps`:

| Milestone | Derivation | Why it is true |
|---|---|---|
| **First one** | earliest `done_at` | It happened, on that date. |
| **Ten / twenty-five / fifty finished** | `count(done)` crossing a mark | Retrospective only. Undo one and it un-reaches. |
| **Cleared a project** | a project with ≥1 done and 0 open | Reversible: re-open one and it is no longer cleared. |
| **The whole hub at zero** | 0 open tasks, 0 open decisions, ≥1 done | Makes constraint 6 a celebration. |
| **Unblocked an agent fast** | `answered_at − created_at` on a question | This is the seam the hub exists for. |
| **Beat the deadline** | `answered_at < deadline` | No default was needed. |
| **The long one** | most `steps` on any finished task | Verifiable from the row. |
| **Across the board** | distinct projects with ≥1 done | Counts breadth, which is what this hub is for. |

**The rule, and it is testable:** a milestone is never shown as a target and never shows progress toward
one. "That was your 25th" is informational; "3 more to reach 25" is controlling — that is the exact
SDT line (Ryan 1982) and it is the difference between a mirror and a manager. He already has fifteen
projects telling him what to do. Check **P4** asserts no progress-toward-target string renders anywhere on
the progress surface.

**Unearned milestones are not displayed at all.** That is a judgement call and it is genuinely his — see
§9, question 1.

## 5. Files, in order, and how each step is verified

Nothing here changes `app/api/agent/*`, `lib/snippet.ts`, the schema, or `writeVerified`.

| # | Change | Verified by |
|---|---|---|
| **0** | `scripts/migrate-riff-kitchen.mjs` still defaults to `command-center-beta-pied.vercel.app`. Fix to `needsme`. Grep the tree for any other disagreement. | `grep` returns only the historical mentions in docs, which are correct as history. Closes inherited item 2. |
| **1** | `tests/fixture.mjs` — add deterministic **finished** work: 6 completed tasks with `why` text, 1 answered decision, 1 answered-before-deadline. Chosen so it cannot collide with the rows `use-it.mjs` ticks (`grinder-service`, `roaster-visit`, `image-bucket`). | Re-run all five existing suites against the new fixture and confirm they are still green **before** any interface change. If the fixture breaks a suite, the fixture is wrong. |
| **2** | **The red baseline.** Add checks **P1–P3** to `tests/measure-layout.mjs` and **U5–U9** to `tests/use-it.mjs`, against the interface *as it is now*. Run them. Watch them fail. Commit the output as `tests/baseline/before-progress.txt`. | The committed red run. This is the primary evidence, per the brief — a fault I inject afterwards is one I already knew how to catch. |
| **3** | `lib/progress.ts` (new) — typed milestone definitions and a pure derivation over a snapshot. No SQL, no writes. | `npm run typecheck`, plus step 4's cross-check. |
| **4** | `lib/store.ts` — one new query returning finished tasks, answered decisions and the counts; `BoardState` extended. Reads only. | A script that computes every figure a second time with independent aggregate SQL and asserts equality. If the page says 28, `select count(*)` says 28. |
| **5** | `app/components/Progress.tsx`, `app/components/DoneRow.tsx` (new); `Board.tsx` wiring (a `done` filter, the chip, the finished section, the enriched empty state); `app/globals.css` in the existing layer structure. **Finished rows carry `data-measure="done-task"`, never `"task"`** — otherwise L3/L4/L6 and `use-it`'s selectors would silently start measuring completed work. | P1–P3 go green. **All five existing suites re-run** — L3 (≥6 tasks above the fold) and L4 (≤3 screens) are the ones this could regress, which is why the record is in the pane and behind a chip rather than inline above the queue. |
| **6** | Fault injection for P1–P4, and P4 added (it is vacuously green today, so injection is its *only* evidence — stated as such). | Every new check shown to fail on a deliberately broken page. |
| **7** | `tests/shoot.mjs` — a flag to shoot the record and the finished list. Screenshots at 390 / 1280 / 1920, and **look at them**. | Committed PNGs, examined, not merely produced. |
| **8** | `docs/PROGRESS-REPORT.md`; corrections into `docs/DECISION.md`; the derived-progress rule into `AGENTS.md` so the next agent cannot add an `xp` column in good faith. | — |

`DoneRow`'s Re-open follows every existing rule: no optimistic UI, the row only moves on `saved: true`, and
a refusal is lifted to the persistent banner at the top of the queue with the server's own words — the bug
`use-it.mjs` found on its first run, in a new control that could reintroduce it.

## 6. The checks, and what each one is worth

**Layout / interface — added to `tests/measure-layout.mjs`**

| # | Measures | Expected now | Target |
|---|---|---|---|
| **P1** | a completion figure is on the first screen without scrolling | **0** elements | ≥1, at all three widths |
| **P2** | finished work is reachable, and says what became true (`why` present, not just titles) | **0 of 5** | every listed completion that has a `why` shows it |
| **P3** | every progress figure is a control or sits in a region a control opens (§14's rule) | n/a — nothing to measure | 100% |
| **P4** | no progress element renders a target or progress-toward-target | vacuously green | stays green; **injection is its only evidence, and this is stated** |

**Database truth — added to `tests/use-it.mjs`**, which already presses real buttons and then asks a
different code path what happened

| # | Asserts |
|---|---|
| **U5** | the count the page renders **equals** `select count(*) from tasks where status='done'`, read directly from Postgres — a genuinely independent path from the page's own render |
| **U6** | pressing Done raises the rendered count by **exactly 1**, and the database agrees |
| **U7** | pressing **Re-open** lowers it by exactly 1; the database says `status='open'` **and `done_at IS NULL`**; the task is back in the queue. *This is the credit-taken-back proof the brief demands.* |
| **U8** | a milestone that is showing **disappears** when the completion behind it is undone |
| **U9** | a **refused** re-open shows the server's actual reason and changes **no** number — no optimistic UI on the new control |

`CC_SUPPRESS_TELEGRAM=yes` stays in `.env.local`; confirmed present. Everything runs against the Neon `dev`
branch through `npm run dev`. Nothing touches production.

## 7. What I am not doing, and why

| Not doing | Why |
|---|---|
| Any schema change | §3. Nothing needs one, and a derived figure cannot drift. |
| Any change to `app/api/agent/*` or `lib/snippet.ts` | Hard constraint 3. `task.reopen` already exists on the UI endpoint. |
| A dependency | RESEARCH §13. Still four runtime dependencies. Chrome is already installed. |
| A `/progress` page | §22: destinations are what die (47% dashboard survival, §14). It goes where he already looks. |
| A calendar heat-map | §24 item 5. It cannot tell "nothing was asked" from "you did nothing". |
| Any progress notification | Telegram's silence is the anti-rot mechanism (§7 cause 5). "You are 3 from a badge" is a controlling message down the one channel that must stay trustworthy. |
| Un-answering a decision | `answerQuestion` refuses a second answer by design — an agent may already have acted on the first. So **task credit is reversible and decision credit is not**, and the report will say so rather than implying symmetry. |
| Auto-refresh, animation of the count | Constraint 7, and RESEARCH §11 on `interpolate-size`. |

## 8. The two items I inherited

1. **The 46vh decisions cap** — still unverifiable without him using it, and this work does not touch it.
   **Re-flagged, not resolved.** It is one CSS line to remove.
2. **The hub URL** — `README.md` and `docs/ENVIRONMENT.md` are correct and name `needsme` as canonical.
   **One thing still disagreed:** `scripts/migrate-riff-kitchen.mjs:44` falls back to
   `command-center-beta-pied.vercel.app`. Fixed in step 0.
3. **No phone figure has ever been checked on a real device.** I cannot fix this — I have Chrome device
   emulation and nothing else. Every phone number in the report will say so, again.

## 9. Four decisions that were genuinely his — asked, and answered

Asked on 30 July 2026, before any code. His answers are now part of the plan.

1. **Unearned milestones: hidden, or shown with what they need?**
   → **Hidden until earned.** The page only ever states what happened; nothing on screen is a target he has
   not met. This is what check **P4** enforces mechanically, so a later change cannot quietly turn the
   record into a to-do list of achievements.
2. **Does the record live only in the pane + behind the chip, or always at the bottom of the queue?**
   → **Pane + chip.** Zero added queue height, so L3 (tasks above the fold) and L4 (scroll extent) — the two
   numbers the last redesign won — cannot regress.
3. **Show the "time this saved you" estimate?**
   → **Yes, labelled as an estimate.** `sum(minutes)` over finished tasks, rendered so the word "estimate"
   is on screen next to it, because it is an agent's guess and not a measurement. It is the figure that
   makes fifteen small errands add up to something.
4. **May I read production read-only to sanity-check the real figures?** Not asked, because on inspection
   there is no read-only path: `cc sync` writes an `agents` row **and applies timed defaults**, which could
   resolve one of his real decisions without him. **Everything stays on the Neon `dev` branch.** The
   consequence, stated so it is not a surprise: the first figures computed from his real work will be seen
   on his own hub after deploying, not in this session.
