# Where this is and where it is going

**Written 6 August 2026**, after a twelve-agent survey of every competing product we could find. The
competitive findings are in `docs/ITERATION-LOG.md`; the standard this is held to is `AGENTS.md` §"The bar".

---

## The four goals, and nothing else is a goal

1. **Opening it in the morning is a pleasure.** Everything that needs him, nothing that does not, and it looks
   good enough that he wants to look at it.
2. **Nothing in it can lie or fire unseen.** A timed default never resolves a decision he was never shown. An
   empty queue is distinguishable from a dead agent. Every figure is derived from the rows.
3. **Still fast in year ten.** No payload cliff, no page that grows without a ceiling.
4. **One paste to deploy, for anyone.** Two free accounts, one browser login, one pasted prompt.

**Goals 2 and 3 are met as of 6 August 2026** — steps 1, 2 and 3 below all shipped, and
`docs/ITERATION-LOG.md` §XXVI has the measurements and the twelve claims in this file and its companions that a
measurement disproved. **Step 4 shipped 7 August 2026** (§XXVIII), which is goal 1 as far as a check can hold
it — and it removed three things the hub was saying that were not true, all of them visible only at two years of
volume.

**GOAL 2 GOT STRONGER ON 8 AUGUST 2026, and it is the one line in this file that changed meaning.** *"An empty
queue is distinguishable from a dead agent"* has been listed as met since this file was written, and it was only
half true: the hub could tell him **nothing had synced at all**, and could not tell him that one project out of
fifteen had gone quiet while the others were fine. `/agents` closes that per project, and the queue's own empty
card now carries the one sentence that tells the two apart on the first screen. See step 6 below and
`docs/ITERATION-LOG.md` §XXIX–§XXX.

**What is left is step 5, and it is one command he runs when he wants it.**

---

## Where it is

**Working and shipped:** the queue of tasks only he can do, with steps and a verification line. Decisions with
tappable options and a timed default. Notes. One `sync` call. Telegram one-tap answers. Derived progress and an
earned crest. Full-text search. Six palettes, two themes. Self-hosted on Vercel + Neon, single tenant, MIT.

**Shipped 5–6 August 2026:** the chosen look follows him between devices; the schema applies itself so no
migration is ever his job; a one-paste README; a documentation-rot check; an uncompressed payload budget;
receipts on answers as well as ticks; depth, typographic hierarchy, promoted project colour, and the light
theme's inverted z-axis fixed; the reversibility test for when a question may have a default at all.

**Shipped 6 August 2026 — steps 1, 2 and 3 of this file.** The reminder ladder, so a timed default can no
longer resolve a decision he never saw. Search over the whole record from an endpoint instead of over the page
payload. And the payload itself: **2,389.6 KB and 1,973 ms at two years became 277.3 KB and 819 ms**, measured
before and after with `npm run at-scale`, which is now committed rather than described.

**The three things nothing else has**, verified across ~40 products: a timed default measured in **hours** (the
paid alternatives cap at 110 seconds because they block inside an agent hook and we do not hold the process);
**tasks only a human can do**, with steps and a verify line, which no other product models at all; and the fact
that **his laptop can be off**.

---

## The steps, in dependency order

### 1. ~~The reminder ladder~~ — DONE, 6 Aug 2026. `lib/reminders.ts`, and §XXVI for what it cost

Today a decision with a default gets **one** notification, then silence, then the agent proceeds. One missed
notification and a decision resolves without him. Derive up to two reminder points between `created_at` and
`deadline`, state the whole ladder in the first notification (*"I will nudge you at 14:00 and proceed with
**Reuse the bucket** at 21:00"*), and rewrite the existing Telegram message rather than sending more.

No cron — the same lazy-on-read path `applyDueDefaults()` already uses. Nothing stored: the count of reminders
sent **is** `count(events where kind = 'question.reminded')`.

**What this got wrong, and it would have shipped a reminder nobody receives:** `editMessageText` produces no
notification. The message is rewritten by REPLACEMENT — delete, then send — which keeps one message per
decision in the chat and also reaches him. §XXVI.

### 2. ~~Search moves server-side~~ — DONE, and the check (S1 in `prove:use`) was watched going red first

`Ctrl+K` builds its index client-side over **every** finished task, from `title`, `why` and `project`. So
windowing the finished list makes the palette stop finding older work, with **no error and no failing check**.
`docs/ITERATION-LOG.md` §XXV has the measurement. Move search to an endpoint first, then write a check that a
task older than the window is still findable, and watch it go red before step 3.

**Done exactly that way**, and the corpus came out LARGER than it was: every finished task's `verify` and
`gotchas` are searchable now, and answered decisions are searchable at all for the first time.

### 3. ~~The payload at scale~~ — DONE. 8.6× smaller and 2.4× faster at two years

At two years of his own measured rate: 1.65 MB of HTML and a 2,010 ms server render against a 1,200 ms budget,
shipping 3,687 historical rows to draw 21. The derivation reads only four fields off a finished row —
`done_at`, `created_at`, `project`, `minutes`. Counts come from SQL, the list ships a window and says so, and
P2's invariant becomes *"the figure equals the SQL count"*. L8 now has an uncompressed budget that can see it.

**Re-measured before touching it: 2,389.6 KB and 1,973 ms, and 3,687 rows exactly as §XIX said. Now 277.3 KB
and 819 ms.** Two things in the paragraph above were wrong and both changed the design:

- **Narrowing the row is not enough.** The narrowest readable object still ships 509 KB of history at two
  years, still linear, which fails goal 3. The lists ship a window of 60 with their prose AND every row ships
  as a tuple of the derivation's numbers — 34 bytes a row instead of 353, because 60% of a narrowed object at
  that volume is its key names repeated.
- **The answered DECISIONS were 62% of the payload**, not the completions. 1,291 KB against 776 KB. Nobody had
  looked, because `FinishedRow` had already narrowed the completions once.

### 4. ~~Finish the visual pass~~ — DONE, 7 Aug 2026. §XXVIII, and three of its findings were not visual

`docs/BRIEF-VISUAL.md`, minus what §XXIII–XXIV closed. The bar is his: *"a pleasure to look at."*

**What it actually found, by rendering the fifth data state — two years of volume — which nothing had ever
designed for:** `/looks` reported **level 8** while the hub reported **level 32** off the same database, because
two servers derived from the windowed record; the crest panel read *"2,580 more to Ground control IV"* under a
heading saying "Ground control IV"; and the record's list was grouped by project, so *"newest first"* was false
under sixty rows in fifteen boxes. The palette's latency and empty states — new since search moved to an endpoint
— were each one line of text in a 660px void.

**Still open in the brief, and only this:** §3.8, the crest at 96px. Every way of growing it takes space from the
pane that check L7 holds at zero spare.

**AND THEN A FIFTH PASS, 8 AUGUST 2026, WHICH IS THE FIRST ONE WITH A TARGET.** §XXXI. Every pass before it
was corrective — find what is wrong, fix it — and the owner named the gap: *"we don't have a visual
reference, nobody ever gave this hub one."* §XXXI is the reference: Linear, Raycast, Geist and Radix
measured beside our own tokens, and a twelve-dimension rubric scored on numbers. What it found was not what
any previous critique had named:

| | before | after |
|---|---|---|
| distinct spacing values the page renders | **19**, and the three commonest were on no scale at all | **8**, all on one, asserted by L10 |
| font weights | 5, with a 22px heading LIGHTER than the 14px bold under it | 3, monotonic, asserted by L11 |
| second-to-third text tier gap | 1.43x dark, 1.35x light — both references put their widest gap there | 1.71x and 1.79x |
| queue row | 37px, six tasks above the fold at 1280 | **34px, eight tasks** |
| the tick control's padding | 7px, off the scale, and it decides the row's height | 4px, and `min-height` decides it |

**Elevation, the dimension every previous critique called flat, measures as the strongest thing here** —
1.12 page-to-card against Linear's 1.10 and Raycast's 1.03. The flatness was the spacing rhythm and the
collapsed text tiers, and no critique had named either.

### 5. Publish — **prepared, and his to trigger**

Fresh `git init` with one commit — `git show <sha>^:scripts/seed-real.mjs` still returns his real tasks in this
repo's history, so flipping visibility publishes them. MIT. Screenshots done (§XXVIII).

**`node scripts/publish-dry-run.mjs`** builds the candidate exactly as the real publish would, in a scratch
directory, and reads it: one commit with no parent, none of his real sentences (recovered from that deleted
script at run time rather than quoted), no credential, `.env.example` present so the first documented command
works, and the README's images present. It prints the four personal identifiers that WOULD be published, with
counts, and the one command that does it. It never adds a remote and never pushes.

The one-paste setup in the README was run from a clean clone on 7 Aug 2026 — install, `init-db`, `dev`,
`/api/health` all green. The two steps it cannot do are the two the README already says are his: making the
accounts, and one `vercel login`.

---

### 6. ~~Nothing blocked by being online~~ — DONE, 8 Aug 2026. `docs/BRIEF-NOTHING-BLOCKED.md`, §XXIX–§XXX

Not on this list when it was written, because it had been refused three times as a category — *"show me what my
agents are doing"* — and the reasoning was never written down. The brief exists because that was the wrong answer
to the right question. **Almost nothing about it was genuinely local-only; what was local-only was PULLING.**

| | before | after |
|---|---|---|
| an empty queue vs. a dead agent | the same screen, unless NOTHING had ever synced | one sentence per project on `/agents`, and one on the empty card |
| a tool call waiting for permission | not touched at all — the loudest pain in this whole category | Telegram, Allow/Deny, ten minutes, then back to the terminal |
| where the money goes across fifteen projects | unknowable | one figure per project, deduplicated, at API list prices |

**Three of the brief's own mechanics were wrong and checking them first is what saved the design** (§XXIX): the
hub cannot hold a hook open for its 600-second budget, `PermissionRequest` does not use `PreToolUse`'s decision
shape, and **53% of Claude Code's usage records on disk are duplicates**, so an un-deduplicated spend figure is
2.1× the truth.

**Skills and schedules — §3.4 of that brief — were deliberately NOT built**, which the brief explicitly permits
(*"drop them without regret if `/agents` is already earning its keep"*). The argument, so nobody has to
re-derive it: this file already refuses both halves for stated reasons — a skill list *"shows what no human
action follows from"* and a cron calendar is *"agent work, and there is no scheduler here on purpose"*. And the
decisive one: **anything scheduled that matters to him already reaches him as a task, a question, a permission
request or a presence line.** A schedule page would be a second, staler view of a mechanism that already works.
What would change that: a scheduled agent that spends money or deploys without filing anything first — at which
point the fix is that it should file something, not that the hub should grow a calendar.

## What is deliberately not being built

From the survey, and each for a stated reason: a second local app (two surfaces means the less-checked one goes
stale and lies); a skill tree or workflow visualiser (shows what no human action follows from, and needs to read
a filesystem a hosted hub cannot reach); a cron calendar (agent work, and there is no scheduler here on
purpose); a docs or links or sprints page (a copy that drifts from the repo is worse than no copy); cost and
token dashboards (a statistics screen prompts no action, and tools on the machine are better placed); a live
agent status board (it rewards an agent for stalling wordlessly instead of articulating what it needs); a daily
digest **pushed** to Telegram (it would train him to mute the one channel that works); any project-health field
an agent can set (an agent asked to self-report health reports green); snooze (a stall with a nicer name — the
correct version is the timed default).
