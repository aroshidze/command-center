# Plan: the hub that still works on day 300

**Date:** 30 July 2026. **Brief:** [BRIEF-THE-WHOLE-HUB.md](./BRIEF-THE-WHOLE-HUB.md).
**Research:** [RESEARCH.md](./RESEARCH.md) §26–§31, added for this iteration.
**Status:** awaiting approval. No code has been written.

---

## What he decided, and what he handed to me

Four questions were put to him before planning. His answers, verbatim, and what each one settles:

| Asked | He said | Settled |
|---|---|---|
| How should the hub honour an agent's intended task order? | *"just leave it."* | **Dropped entirely.** No ordering heuristic, no `order` field, no `AGENTS.md` rule. The numbered titles stay as they are. |
| Where should the effort go? | *"you decide, but the decision must be a very optimal one"* | Mine to choose, and to justify from measured failure rather than taste. §"The scope, and why it is this" below. |
| How does the level pace feel? | *"dude, I've been working only 1 day, there will be more tasks every day. what will happen on day 300?"* | **The right question, and it exposes a real defect.** Do not tune the curve on one day of data; make it correct over time. |
| Which hub should I design for? | *"what a strange question, I only have 1 hub."* | A fair correction — the question offered a false choice. There is one hub and it accumulates. Design for a hub that grows. |

His third answer is the one that set this plan. I had been about to ask him whether the ladder *felt* right. He
asked what it does after 300 days. I went and computed it, and the answer is that it stops.

---

## The concept, in one paragraph

**Every defect I found in this iteration is the same defect: the hub, and the evidence for the hub, are
calibrated to a single moment.** The fixture is one moment (22 tasks and 4 decisions he has never had). The
level ladder is one moment (thresholds tuned so day one reads "Level 3"). The committed screenshots are one
moment, and it is a moment that no longer exists. So the work is not "pick gamification or design or handoff" —
it is to make the hub correct *over time*, and to give the test harness the ability to see time at all. That
frame is what makes the scope decision defensible as optimal rather than as a preference: every item below is
justified by a number I measured, in the order of how badly it is broken.

---

## The four measured failures that set the scope

### 1. The progression he asked for twice goes permanently flat inside two months

Computed from `POINTS` and `RANKS` in `lib/progress.ts` by running the real functions over synthetic
completions:

| Level | Rank | Lands at completion |
|---|---|---|
| 3 | Operator | 8 |
| 5 | Unblocker | 28 |
| 8 | Flight director | 98 |
| **10** | **Ground control** | **184** |

At three finished tasks a day that is day 62 — **but tasks are not all that score.** A decision is 6, answering
inside the deadline is 4, within the hour another 4, and a note back to the agent 4. At his own observed mix (3
tasks a day with one note, 2 decisions answered quickly) that is **62 points a day and the ceiling on day 30**.
After that:

- the level never moves again — at 900 completions he is still level 10, measured;
- **the emblem freezes with it** — `spokes = Math.min(level, 10)` and `coreRings = Math.min(3, ceil(level/3))`,
  so the profile that is supposed to "get enhanced when I do" stops being enhanced on day 62 and never changes
  again for the rest of the hub's life;
- day 300 is between **3.3× and 11.4×** past the ceiling depending on rate.

`lib/progress.ts` states the intent in its own comment: *"The top of the ladder is deliberately a long way off;
a ceiling reached in a month is a ceiling."* The arithmetic says it is a ceiling reached in two months. This is
the single worst thing I found, it is in the feature he has asked for twice, and **nothing in the suite could
catch it, because every check evaluates one snapshot.**

### 2. Nothing has ever been measured against the hub he actually opens

From the production screenshots in the unpushed commit (RESEARCH §26):

| | Fixture | Production |
|---|---|---|
| Open tasks | 21 + 1 blocked | **11 + 1 blocked** |
| **Open decisions** | 4 | **0** |
| Projects with open work | 4 | **2** |

The decisions region — the loudest thing on the page, the only user of the `--ask` palette, the reason the
`46vh` cap exists — is **empty on his hub**. And at eleven short rows a monitor is two thirds black, with each
row roughly half blank because the estimate, step count and tick sit at the far right. Check L1 measures how
well a *section* fills its column and passes; nothing measures how well a **row** fills its own width. That is
the dead-column bug from §10 in its third costume.

### 3. The evidence machinery cannot be trusted, and this is why defects keep shipping

Three findings, all reproduced (RESEARCH §30.1–30.3):

- The committed screenshots are of the **pre-fix fixture**. Fresh capture: `114 pts`, `46 more to Fixer`, `since
  22 Jul`, and the cost line *"An agent has been blocked for 11h"*. Committed: `118 pts`, `42 more`, `since 30
  Jul`, *"asked just now"*. **The cost line the brief lists as shipped and proven has never appeared in a
  committed screenshot.**
- `npm run shots:light` **overwrites the dark screenshots** — `TAG` defaults to `shot` and `--light` does not
  change the filename.
- `tests/shoot.mjs` never loads or verifies the fixture. It photographs whatever the database holds.

### 4. The page payload grows without bound

`board()` selects every `done` task with no limit, and `page.tsx` hands the whole array to a client component.
Measured: **581 bytes per completion**, all of it serialised into every page load.

| Completions | Done rows shipped per load |
|---|---|
| 100 | 57 KB |
| 300 | 170 KB |
| 900 | **511 KB** |

To be accurate about what is *not* broken: the derivation is fast. `derive` + `standing` + `marks` + `nextUp`
over 900 completions is **20 ms**, measured. My first instinct was that `clearMoments`' O(n²) would freeze the
page and that was wrong — it is the payload, not the computation.

---

## The scope, and why it is this

Four phases, in this order, because that is the order of measured severity. Phases 1 and 2 are the ones I would
defend as necessary; 3 and 4 are the ambition he asked for, standing on ground that can hold them.

### Phase 1 — Make the progression survive day 300

**Why first:** it is the feature he asked for twice, it is provably broken, and it is cheap.

| File | Change |
|---|---|
| `lib/progress.ts` | Replace the terminal 10-entry `RANKS` array with a ladder that does not end. Keep all ten rank *names* — they are good and they are the identity — and give each a **tier** past the tenth, so rank becomes `(name, tier)` and level keeps climbing. Thresholds grow superlinearly so each tier costs more than the last. `standing()` keeps returning `toNext` as exactly `nextAt - points`; `fraction` stays a real fraction. Still no stored column, still reversible. |
| ~~`lib/progress.ts`~~ | ~~Add mark definitions with depth beyond volume.~~ **Struck out — the red run disproved this before any code was written.** T4 and T5 pass today: earned marks rise 23 → 29 across the range and `nextUp` is never empty, so the mark set has more room in it than the ladder does. Only the ladder is broken. *(The run did surface a documentation error: there are **31** mark definitions in nine categories, not the 26 that `README.md`, `docs/PROGRESS-REPORT.md` §14/§16 and the brief all state. Fixed as part of this phase.)* |
| `app/components/Emblem.tsx` | Make the geometry keep evolving past level 10 — the tier drives a property the spokes do not, so the shape at level 24 is distinguishable from level 10 at a glance and still *countable*. Nothing that carries truth animates; the arc still encodes the real fraction. |
| `app/components/Profile.tsx` | Render the tier honestly. No new claims, no new figures that are not `need - have`. |

**How it is verified.** A new check — call it **T1** — that runs `standing()` and `marks()` over synthesised
completion counts (1, 10, 100, 184, 300, 900, 2000) and asserts that **the level still moves, the emblem's
geometry still changes, and every `toNext` is exactly `need - have`** at each. Written against the current
code first, where it fails at 184. **That red run gets committed** — it is the strongest kind of evidence this
project accepts, and unlike a fault injection it is a defect nobody knew how to catch. It is also the first
check in the suite that measures the hub across *time* rather than at one instant.

Plus: `prove:use` still asserts re-opening takes points back; P5 still parses the rendered arithmetic.

### Phase 2 — Give the harness eyes for the real hub

**Why second:** without it, phase 3 is designed against the same snapshot that caused the problem.

| File | Change |
|---|---|
| `tests/fixture.mjs` | A second state, `--live`, built from production's measured volumes: 11 actionable tasks + 1 blocked, **zero open decisions**, 2 projects, a record a day old. Volumes asserted as the existing fixture already asserts its own. |
| `tests/measure-layout.mjs` | Run the layout checks against both fixtures. Add **L7**: how much of its own width does a task *row* use. Written red — it fails today at production volumes. Keep every existing fault injection and verify each still reproduces its fault. |
| `tests/shoot.mjs` | Tag light captures distinctly (so `shots:light` stops overwriting), and **refuse to run** unless it can state which fixture is loaded — it prints the volumes it is photographing into the run log. A screenshot of unknown data is not evidence. |
| `tests/shots/` | Regenerate everything, both themes, all five widths, viewport and full page. Delete the stale set rather than leave two generations side by side. |
| `docs/ENVIRONMENT.md` | Document `--live` and the corrected `shots:light` invocation. |

### Phase 3 — Design for the hub that grows

**Why third:** it is the biggest *visible* win and it now has trustworthy measurement under it.

- The row: close the half-empty gap at real volumes. Container query on the row, not a viewport breakpoint.
- The monitor at eleven tasks: two thirds of the screen is black. Resolve — the pane and queue proportions were
  set for 22 rows.
- **The earned-empty hub**: currently a ~615px strip centred in 1920px of black. Hard constraint 6 says this
  screen must read as a win; today it reads as an unfinished page. This is the screen the entire no-streak
  argument rests on and it is the worst-looking screen in the hub.
- The light theme, now that a human has finally looked at it: it has almost no elevation, the panels are white
  on near-white, and the per-row tick — the primary action — is the faintest control on the page.
- The phone: standing is invisible until you scroll past everything. RESEARCH §22's five-second glance.
- **Bound the payload.** The record's *figures* must stay derived and must still move the instant a write is
  confirmed, so the counts keep coming from live rows. What does not need to ship on every load is 900 full
  task bodies with their `steps` JSON. The record view fetches its own detail.
- The `46vh` cap: it clips a decision option mid-word (RESEARCH §30.6). Resolve rather than re-flag a fourth
  time — though note it has no effect on his hub today, which has no decisions.

### Phase 4 — The handoff, aimed where the evidence points

**Why last, and why it is not the compose box.** RESEARCH §27.3: OpenAI measured **3 human interruptions across
720 boundary-crossing actions** under auto-review and argued that frequent prompts get *bypassed*. The brief
asks for a better return channel; the evidence says the win is fewer, better-resolved items. So:

- **Deploy the unpushed fixes.** `efb48d3` fixes three things found by testing the live hub and has never
  reached the live hub. That is the cheapest correctness win available and it goes first in this phase.
- Steal the three ideas from Anthropic's own `AskUserQuestion` (RESEARCH §27.4), in value order: an **artefact
  preview beside the options**, a **short subject chip** (≤12 chars), and **multi-select answers**. These need
  optional additive fields on `POST /api/agent/questions`. **This needs his explicit nod** — the brief says do
  not change existing agent contracts and ask before adding. They are backwards-compatible optional fields; no
  existing caller breaks.
- Frame `respond`-alongside-`choose` as a normal extra answer rather than *"None of these — send what I
  typed"*.

---

## What I am not doing, and what decided it

| Not doing | Why |
|---|---|
| Any task-ordering change | He said *"just leave it."* |
| Search / find-a-task | RESEARCH §27.5: no evidence for a length threshold, and the real list is 11 rows across 2 projects. Real for the fifteen-project hub, not this one. |
| An MCP server | §27.1. The primitive is standardised but synchronous and in-client; the spec's largest breaking revision is two days old. Being schema-*compatible* is free. |
| A streak, in any form | §18, unchanged, and it is the one mechanic still refused outright. |
| A points penalty for anything sitting unattended | §28.1. Todoist can dock you because *you* set the due date. Here an agent files the work. |
| `contrast-color()` | §29. It makes contrast automatic at paint time and therefore unassertable by `prove:palette`, which computes all 64 pairs with no browser. |
| Any new runtime dependency | Nothing below needs one. Four dependencies, unchanged. |
| A stored `xp`/`level`/`tier` column | The founding rule. §28.3 is GitHub demonstrating the failure in public in March 2026. |

---

## The order of work, and the gate on each step

1. Commit the **red T1 run** showing the ladder ceiling, before touching `lib/progress.ts`.
2. Phase 1. Gate: T1 green at 2000 completions; `prove:use` and P5 still green; re-open still takes credit back.
3. Phase 2. Gate: every layout check green against **both** fixtures; every fault injection still reproduces
   its own fault; fresh screenshots in both themes at five widths, and I look at the viewport ones.
4. Phase 3, in small steps, re-measuring after each. Gate: no regression in L3 (tasks above the fold) or L4
   (scroll extent), C1 clean in both themes, `prove:palette` 64/64.
5. Phase 4. Gate: his approval on the API additions before any of it; `prove` and `prove:negative` green.
6. All six suites, then deploy, then measure production again.

---

## Stated plainly: what I am uncertain about

1. **I have not run `prove:health`.** Five of six suites are green (`prove` 33/33, `prove:negative` 24/24,
   `prove:palette` 64/64, `prove:use` 12/12, `prove:layout` 22 checks × 5 widths + light + 22 injections).
   `prove:health` needs `npm run dev` stopped, and a dev server was already running on 3939 when I started that
   I did not want to kill under someone. It runs in step 6.
2. **The replacement ladder shape is a judgement call and nothing in the research settles it.** RESEARCH §28.2
   is the closest thing to guidance and it is a warning rather than a recipe: Duolingo made a threshold easier,
   every engagement metric rose, and *"fewer learners were actually reaching their daily goals"* — the metric
   improved while the work went down. So I will err toward rungs that cost more over time, and I will show him
   the curve before committing to it.
3. **Still no real device.** Every phone and tablet figure is Chrome emulation at 390×844 with a coarse pointer.
   I cannot fix this. **Re-flagged for the fourth time**, as the brief instructs.
4. **The production figures are read from screenshots in an unpushed commit, not from production itself.** I
   deliberately did not run `cc sync` against production, because it writes an `agents` row and applies timed
   defaults, which could resolve one of his real decisions without him. I read `/api/health` only.
5. **Bounding the payload is the one change that could make a figure briefly wrong**, because the counts must
   keep moving the instant a write is confirmed. If I cannot do it without risking that, I will leave the
   payload alone and say so rather than trade the rule for kilobytes.
6. **"About fifteen projects" is not true yet** — the hub holds two with open work. Several arguments in the
   brief lean on fifteen. I am treating them as statements about a future rather than present needs, and
   sequencing accordingly.
