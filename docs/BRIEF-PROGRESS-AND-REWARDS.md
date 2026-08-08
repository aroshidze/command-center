# Brief: make progress visible, and make it feel like something

Paste everything below the line into a fresh Opus 5 session with this repo open. Written to be read cold.

The report will be audited by the agent that built the hub, so it asks for evidence rather than adjectives.

---

You are taking over a tool that works, has been redesigned once already, and is now missing something its
owner actually wants. You have wide creative freedom on **form**. You have almost none on **truth**. Read
the whole of this before touching anything.

**Do not start coding.** Research, then write a detailed plan and get it approved, then execute step by step,
verifying as you go. That order is a requirement, not a suggestion.

## What you are inheriting

A personal command centre at <https://needsme.vercel.app>. One person runs about fifteen software projects
built with AI coding agents (Claude Code, Codex, Cursor, Antigravity). The hub closes the handoff between
them: agents file **tasks** (work only the human can do — an account, a card, a camera, a physical thing)
and **questions** (a decision they are blocked on, with tappable options and often a timed default). The
human ticks and taps; agents catch up with one call, `cc sync`.

It is genuinely proven, not aspirationally so. Read in this order before anything else:

1. `README.md`
2. **`docs/ENVIRONMENT.md`** — the live environment. **There are two databases.** Local `npm run dev` talks
   to the Neon `dev` branch and is empty; the real hub is production. Read this or you will write test data
   into real work, which has already happened once.
3. `docs/DECISION.md` — why it is this shape, plus a "Corrections made after real use" section listing the
   things previous iterations got wrong. Read that section twice.
4. `docs/RESEARCH.md` — especially **§7 (why tools like this get abandoned)** and §14. That research is the
   reason this brief is shaped the way it is.
5. `docs/UI-REPORT.md` — the redesign that just landed, including **§3 (six of its own checks that were
   broken)** and **§7 (what it is still unsure about)**.
6. `AGENTS.md` — API contract and codebase conventions.
7. `docs/UI-OVERHAUL-BRIEF.md` — the brief that produced the current interface.

Test suites, all currently green: `prove` 33, `prove:negative` 24, `prove:use`, `prove:layout`,
`prove:health` 6. `npm run fixture` loads realistic data into the dev database.

## What is being asked for

Two things, in his words.

**One — he cannot feel what he has accomplished.**

> *"we don't even show the tasks that have been marked as done, is it like that by design to not make things
> overcrowded? I just kinda.. wanna feel the accomplishments.. number of tasks done."*

It is not by design; it is buried. `Board.tsx` renders completion as one grey footer line — the last five
titles joined by dots, no count, no history, nothing cumulative. The data is all there and unused.

**Two — he wants that to actually motivate him.**

> *"let's design a reward system, levels, achievement badges and other cool perks that motivate me to
> complete more tasks. let's do this man, and also enhance the overall hub a million times too… give it a
> full freedom to create the best hub in the world."*

Take the ambition seriously. He has asked for growth repeatedly and been told "keep it narrow" more than
once; he has heard that argument and decided. Do not re-litigate it. **Build him something excellent.**

But build it so it is still worth opening in six months, which is a design problem, not a reason to
refuse — and the rest of this brief is the accumulated evidence about how that goes wrong.

## The one rule that must not bend: a reward has to be true

This project's founding constraint is that **nothing is ever reported as saved until the database has been
read back and confirmed** (`writeVerified` in `lib/db.ts`). It exists because he lost hand-entered data to
an app that said "saved" over a rejected write.

**A badge awarded for something he did not do is the same class of lie.** A level that inflates, a streak
that survives a day he did nothing, a counter that drifts from the tasks table — each one is the "saved"
bug wearing a nicer costume, and the moment he notices one, the whole surface becomes decoration.

Which gives you the hard architectural rule:

**Everything about progress must be COMPUTED from source data, never stored as a mutable score.**

- `tasks.done_at` is set on every completion and cleared on re-open. `questions.answered_at` likewise.
  `events` is append-only with a monotonic `seq`. That is your source of truth.
- **Do not add an `xp` column, a `level` column, or an `achievements` table that gets written to when
  something is earned.** A stored score can disagree with reality, and then you have two truths.
- Achievement *definitions* belong in code (typed, reviewable in a diff, like `lib/snippet.ts`). Achievement
  *progress* is derived by querying. This is the same "content in code, state derived" split that the rest
  of the codebase uses, and it means a bug in the rules is fixable by deploying, not by migrating.
- If a derived query is ever too slow, cache it — but the cache must be **rebuildable from source at any
  time**, and there must be a way to prove it matches. Never let the cache become the truth.
- **Re-opening a task must take the credit back.** If it does not, the number is a lie and he will find it.

Read `lib/store.ts` for how validation and verified writes are done, and match it.

## Research this properly, because the obvious version is known to fail

Do not copy Duolingo from memory. The date is late July 2026 and this matters more than usual, because
gamification has a well-documented failure mode that would hit this user specifically.

Things to actually research, with links and dates:

- **Streaks.** The mechanic that most reliably produces engagement and most reliably produces abandonment
  when broken. **This person works irregularly by nature** — his tasks are external errands done when he
  has time, sometimes nothing for a week. A streak that punishes absence will make him stop opening the hub
  on the day he breaks it. Find the evidence on streak loss and disengagement, then decide whether a streak
  belongs here at all, or whether something absence-tolerant is better. State your conclusion and your
  reasoning. "Everyone does streaks" is not a reason.
- **Self-determination theory, and where extrinsic rewards backfire.** There is real literature on rewards
  undermining intrinsic motivation for work someone already wants to do. He already wants these tasks done —
  they unblock his own businesses. Find out when points help and when they replace a real reason with a
  worse one.
- **Why quantified-self and habit tools get abandoned.** `docs/RESEARCH.md` §7 already cites Epstein et al.
  (CHI 2016) on abandonment, and Clark et al. (2024) on use *lapsing* rather than stopping cleanly. Extend
  that specifically to reward systems.
- **What genuinely good progress surfaces look like in 2026** — not badge grids from 2012. Look at what
  serious tools do: contribution graphs, cumulative totals, before/after, "you unblocked X by doing Y".
  Note that his tasks carry an `unblocks` field folded into `why`: *"this one task unblocks 2,849 pins."*
  **That is a more motivating fact than any number of points, and it is already in the data.**
- **The dashboard trap.** §7 and §14 found tools die when they become somewhere you *look* rather than
  somewhere you *act* — of 89 studied dashboards only 47% were still active. The queue must stay the point.
  Resolve how a rewards surface coexists with that, with evidence.

Then tell him what you learned that he did not know, **including anything that contradicts this brief.** The
previous two iterations both found things in their briefs that were wrong, and saying so was the most useful
thing they did.

## What the data can and cannot tell you

Check this yourself rather than trusting it, but be aware:

- **History is thin and starts around now.** 17 tasks were migrated from another project on 30 July 2026 and
  their `created_at` is the migration time, not when they were really written. Early proof runs also deleted
  event rows. **Do not present a graph implying months of history that does not exist.** If the record is
  short, say so on the surface itself — an honest "since 30 July" beats a flattering curve.
- Completion is richer than a count: tasks carry `minutes`, `project`, `why`/`unblocks`, and a human `note`.
  Questions carry `answered_at`, `answer_option` and `answer_note`. **Decisions made are accomplishments
  too** — a blocked agent unblocked is arguably worth more than a ticked errand, and nothing currently
  reflects that.
- `events` gives ordering and timing. `agents` records which tool synced and when.
- **Blocked tasks (`blocked_reason`) are not his fault and must never count against him.** Waiting on
  Instacart's approval email is not a failure to be nudged about.

## Freedom, and the fixed points

**Free rein:** visual design, information architecture, navigation, motion, what the reward system actually
is, whether there are levels or something better, new views, new pages, typography, colour, the shape of the
whole thing. You may add dependencies if you make the case (read §7 first — every dependency is a future
upgrade, and "it is what everyone uses" is not a case). You may propose schema *additions* for genuinely new
data. Surprise him.

**Fixed, each because something went wrong:**

1. **No optimistic UI, anywhere.** "Saved" appears only on `saved: true` from the server, after a read-back.
2. **Failures show the server's actual reason**, not a generic apology. `Board.tsx` lifts refusals to a
   persistent banner; keep that property.
3. **Do not change the existing agent API contracts** in `app/api/agent/*`. Agents in fifteen projects
   depend on them, and `lib/snippet.ts` is served to every project as its instructions. Adding endpoints is
   fine; changing or removing is not. Ask first.
4. **The hub stores no secrets.** `lib/store.ts` rejects credential-shaped values, including generic key
   material. Do not weaken it — it is what keeps cookie auth proportionate.
5. **Nothing displayed may be copied from somewhere else.** Everything on screen is computed from live data.
   No pasted roadmaps, no duplicated docs. `app/setup/page.tsx` is the model.
6. **An empty queue is success.** "Nothing needs you" must read as a good state — and a rewards surface must
   make an empty queue feel like a win, not like a broken streak.
7. **No auto-refresh that moves content while he is reading.**
8. **Do not delete the explanatory comments.** They record why the obvious approach was wrong, and they are
   the handover to whoever comes after you.
9. **Desktop is the primary surface**, phone is secondary but real. Both first-class; neither a scaled
   version of the other. Control sizing keys off `pointer:`, not viewport width — see `app/globals.css`.

## How you must verify — this is what gets audited

Every defect ever found in this project was found **by using the thing**, not by reading code and not by the
suite. The suite was green throughout, every time. Take that personally.

- **Extend the existing harnesses**: `tests/measure-layout.mjs` (geometry, contrast, keyboard, live regions),
  `tests/use-it.mjs` (presses real buttons in a real browser, then asks the database whether it worked),
  `tests/chrome.mjs` (the driver). Chrome is already installed; there is no dependency to add.
- **Write each new check against the CURRENT interface first and watch it fail**, before building the thing
  it measures. The previous iteration did this and committed the red run as `tests/baseline/before.txt` —
  that is stronger evidence than injecting a fault afterwards, because a fault you inject is one you already
  knew how to catch. Do the same and commit your baseline.
- **Then also keep fault injection**, so a check cannot quietly lose its ability to fail when markup moves.
  A selector that matches nothing passes.
- **Every number about progress must be verified against the database**, not against what the page says. If
  the surface claims 12 tasks done, query for 12. Then re-open one and assert the number drops.
- **Look at it.** Screenshot at phone, laptop and monitor widths and actually examine them. `tests/shoot.mjs`
  exists.
- Existing suites must stay green. Re-run all five.
- **`CC_SUPPRESS_TELEGRAM=yes` must stay in `.env.local`** — without it, test runs push synthetic
  notifications to his real phone. It happened, a dozen at a time.

## What to produce

1. **Research findings** — appended to `docs/RESEARCH.md` as a new section, with links and dates, including
   what you rejected and why. Especially your conclusion on streaks.
2. **A written plan** he approves before you build: the concept, the reasoning, what changes file by file,
   in what order, how each step is verified.
3. **Step-by-step execution**, verified as you go.
4. **A report** containing:
   - the concept and why, including what you decided *against* and what evidence decided it
   - **measured** before/after numbers, not adjectives
   - screenshots at three widths
   - every new check, and proof each one fails when its subject is broken — plus your committed red baseline
   - proof that progress figures match the database, and that re-opening a task takes credit back
   - anything you found wrong that is not in this brief
   - what you are uncertain about, stated plainly. The last iteration flagged that its 46vh decisions cap was
     an unverifiable judgement and that all its phone figures were emulation. That honesty is worth more than
     a clean report.

## Two open items you inherit

- `docs/UI-REPORT.md` §7 flags the 46vh decisions cap as unverified, and that **no phone figure has ever
  been checked on a real device**. Resolve or re-flag.
- `README.md` and `docs/ENVIRONMENT.md` previously named a different hub URL than `CC_PUBLIC_URL`;
  `needsme.vercel.app` was made canonical. Confirm nothing still disagrees.

## How to work

Take your time. Ask him when a decision is genuinely his — taste, cost, what he will put up with — and make
the routine calls yourself. Write down why, in the code or the docs, wherever the obvious approach turned
out to be wrong.

Be ambitious about the design and pedantic about the truth. He wants something that makes him want to open
it. He also wants to be able to believe every number on it. Those are compatible, and holding both is the
job.
