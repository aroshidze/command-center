# Brief: make this the best command centre in the world

You are taking over a tool that works, has been redesigned twice, has a gamification layer, and is now being
handed to you with the widest remit anyone has had on it. You have almost total freedom on **form**. You have
none at all on **truth**. Read the whole of this before touching anything.

**Do not start coding.** Research, then write a plan and get it approved, then execute step by step, verifying
as you go. That order is a requirement, not a suggestion. It has been the requirement for three iterations and
every one of them found something in its own plan that was wrong.

---

## What he actually asked for, in his words

> *"I want it to do a total enhancement of everything, gamification, achievements, what else can be done,
> design of everything, research online of what others are doing, getting good ideas and improving them. This
> hub must be a command center that motivates me to work more and more and eases my communication with AI's
> like you. So create an amazing prompt for the new iteration, give it freedom."*

And earlier, which is the standing instruction on the reward system:

> *"We need broader achievements and we need a kind of a gamification of this… I will be motivated to do more
> and faster… I see some cool visual things that gamify my experience and I feel the progression. I have levels
> for example. Maybe I have a character or profile in the hub that gets enhanced when I do."*

> *"This website must be one of the best designs in the world in every parameter — intuitive, beautiful, some
> animations, some amazing color palettes, very adaptive to all of the devices, very modern with the most
> modern technologies. Do not settle on some easy results."*

**Two goals, and the second one is the under-served half.** *Motivate him to work more* has had three
iterations of attention. *Ease his communication with the AIs* has had almost none since the hub was built —
and it is the reason the hub exists. Read §"The half nobody has worked on" before you decide what to build.

---

## Read these first, in this order

1. `README.md`
2. **`docs/ENVIRONMENT.md`** — **there are two databases.** `npm run dev` talks to the Neon `dev` branch and is
   empty; the real hub is production. Read this or you will write test data into real work, which has happened.
3. `docs/DECISION.md` — why it is this shape, plus **"Corrections made after real use"**: eight things previous
   iterations got wrong. Read that section twice. Every entry was found by *using* the thing.
4. `docs/RESEARCH.md` — **§7** (why tools like this get abandoned), **§14** (the dashboard trap), **§17–§25**
   (progress, rewards, streaks, and what changed when he asked for levels a second time).
5. `docs/PROGRESS-REPORT.md` — both parts. Part two §11–§17 is the current state and §17 is the list of things
   nobody has been able to verify.
6. `AGENTS.md` — the API contract, the derived-progress rule, and **three traps in the test harness that have
   each cost hours**.
7. `lib/progress.ts` — read the file header before you touch anything about scoring.

---

## What is already true, so you do not rebuild or re-break it

The hub closes the handoff between one human and about fifteen projects built with AI coding agents. Agents
file **tasks** (work only he can do) and **questions** (a decision they are blocked on, with tappable options
and often a timed default). He ticks and taps; agents catch up with one call, `cc sync`.

**Built and proven:**

- **A record of finished work**, entirely derived: a count on the first screen that is also a control, the full
  record behind it, every completion re-openable — which takes the credit back.
- **Standing**: points → level → rank, ten ranks, an evolving SVG emblem, **31 marks in nine categories** (this
  brief said 26; counted programmatically it is 31 — RESEARCH §30), and
  an honest "what's next". No `xp` column, no `level` column, no `achievements` table, **no schema change since
  the project began.**
- **A design system**: OKLCH palette on one perceptual ramp, three elevation levels, a six-step spacing scale,
  a full light theme via `prefers-color-scheme`, styled scrollbars, a motion system.
- **Adaptivity** at 390 / 834 / 1280 / 1920 / 2560, with control sizing keyed off `pointer:` not width.
- **A time filter** ("I have ten minutes"), a **cost line** on blocked decisions ("an agent has been blocked
  for 11h"), and a **chase control** on tasks that have been waiting on someone else for days.

**Test suites, all green, and the numbers to beat:**

| | |
|---|---|
| `prove` | 33 checks over real HTTP |
| `prove:negative` | 24 safety checks, each broken on purpose |
| `prove:palette` | 64 token contrast pairs, both themes, no browser needed |
| `prove:use` | 12 checks that press real buttons then ask the database |
| `prove:layout` | 24 checks × 5 widths + a light-theme pass + 24 fault injections |
| `prove:health` | 6 checks with a deliberately dead database |

`npm run fixture` loads realistic data. `npm run fixture -- --cleared` gives the earned-empty hub.
`npm run shots` produces viewport **and** full-page images at five widths; `npm run shots:light` in light.

Production has been measured once, successfully: `node tests/measure-layout.mjs https://needsme.vercel.app --production`.

**There is one commit that has not been pushed.** Check `git log origin/master..master` before you start.

---

## The one rule that must not bend

**Nothing is ever reported as saved until the database has been read back and confirmed** (`writeVerified` in
`lib/db.ts`). It exists because he lost hand-entered data to an app that said "saved" over a rejected write.

Applied to everything you build:

- **A badge, level or figure for something he did not do is the same class of lie.** The moment he notices one,
  the whole surface becomes decoration.
- **Everything about progress is COMPUTED from source data, never stored as a mutable score.** `tasks.done_at`
  and `questions.answered_at` are the truth. Do not add an `xp` column, a `level` column, or an achievements
  table. Do not derive history from `events` — it is append-only, so credit can never be taken back, and it has
  already been truncated to a few dozen rows.
- **Points may only depend on what HE did, never on what an agent did.** This is the rule the obvious
  implementation gets wrong. "Cleared a project" and "the hub reached zero" are not scorable, because both
  depend on how much is currently *open* — so an agent filing one task overnight would silently drop his level.
  A score that falls while he sleeps is one he would be right to stop believing.
- **Re-opening a task must take the credit back**, including the level.
- **Any target you state must be arithmetically true.** Check P5 parses the rendered numbers and asserts them.
- **No streak.** Not a lenient one, not one with freezes. See RESEARCH §18: merely *displaying* a broken streak
  cost 8.4 percentage points of continuation on identical behaviour, and his absences are frequently not his
  doing because agents decide when work arrives. The `return` category pays for *closing* a gap instead.

---

## On gamification: he has asked twice. Do not re-litigate it.

`docs/RESEARCH.md` §19 argues against points, levels and badges, with real evidence — Deci/Koestner/Ryan's 128
experiments, Hanus & Fox measuring badges-plus-a-leaderboard over sixteen weeks and watching motivation *fall*,
Kivetz on the effort drop after every threshold. **He read that and asked for levels anyway, twice.** It is his
tool. The evidence is on the record; your job is not to make the argument again.

What that leaves you is the interesting problem: **make it genuinely motivating AND completely true.** Those
are compatible and holding both is the job.

What the evidence positively supports, and what is under-exploited:

- **Amabile & Kramer**: progress in *meaningful* work is the single largest driver, and 28% of *minor* events
  had a major effect on how people felt.
- **Grant (2008)**: ten minutes of contact with one beneficiary produced **+142% persistence, +171% output**.
  The hub stores the agent's own sentence about what a task unblocks. That is the highest-value asset on the
  surface and it is currently shown as a quoted line. There is more to do with it.
- **Gouveia et al.**: over 70% of use of a surface like this is a **five-second glance**.

---

## The half nobody has worked on

The hub's founding purpose is the handoff. Three iterations have polished what he *sees*; almost nothing has
improved what he *sends*. Look hard here, because this is where he said the second goal is:

- Telling an agent something is a `<select>` and a `<textarea>` at the bottom of a pane. That is the return
  channel the whole design values most.
- Answering a decision is excellent — one tap, with a comment. Nothing else is.
- **His agents are working around a gap you should look at.** His live tasks are titled `1.`, `2.`, `3.`… and
  they render `3, 4, 5, 8, 9, 6, 7, 2, 1`, because the hub orders by creation time and the agent is encoding an
  intended sequence in the *title*. Priorities, labels and due dates are explicitly banned by `AGENTS.md` and
  that ban is right — but "the asking agent's suggested order" may be a different thing. **This is a decision
  to bring him, not a patch to apply.**
- There is no way to find a task by name. With fifteen projects that will matter.
- Telegram is a work channel and he has asked for it to **stay professional and precise**. Do not put
  progress nudges in it.

---

## Freedom, and the fixed points

**Free rein:** visual design, information architecture, navigation, motion, what the reward system is, new
views, new pages, typography, colour, the whole shape. You may add dependencies **if you make the case** — read
RESEARCH §13 first; there are four runtime dependencies and "everyone uses it" is not a case. You may propose
schema *additions* for genuinely new data. Surprise him.

**Fixed, each because something went wrong:**

1. **No optimistic UI, anywhere.** "Saved" appears only on `saved: true` from the server, after a read-back.
2. **Failures show the server's actual reason**, lifted to a persistent banner. Keep that property.
3. **Do not change the existing agent API contracts** in `app/api/agent/*`. Fifteen projects depend on them and
   `lib/snippet.ts` is served to all of them. Adding endpoints is fine. Ask first.
4. **The hub stores no secrets.** `lib/store.ts` rejects credential-shaped values. Do not weaken it.
5. **Nothing displayed may be copied from elsewhere.** Everything on screen is computed from live data.
6. **An empty queue is success.** "Nothing needs you" must read as a win — and the reward surface must make it
   feel like one, not like a broken streak.
7. **No auto-refresh that moves content while he is reading.**
8. **Do not delete the explanatory comments.** They record why the obvious approach was wrong.
9. **Desktop is primary, phone is real.** Both first-class. Control sizing keys off `pointer:`, not width.
10. **Nothing that carries truth animates.** A bar may transition its width; a number may not roll to its new
    value, because a number in motion is unreadable and briefly wrong.

---

## Research this properly

It is late July 2026. Do not work from memory, and **do not trust this literature without checking it** — the
last iteration found that the most-cited numbers on gamification are vendor blog claims with no method, while
the one study that settles the streak question is barely mentioned anywhere.

Research, with links and dates:

- **What the best tools in 2026 actually do** for progress, standing and identity. Linear, Raycast, Height,
  Duolingo, Strava, GitHub, Apple Fitness, Todoist, Habitica, Monarch — not to copy, to steal the good idea and
  improve it, which is what he asked for.
- **Gamification that survived contact with real users over years**, not launch-week engagement graphs.
- **Human-in-the-loop and agent-handoff interfaces.** This is the under-served half. What has shipped since
  RESEARCH §1 was written in July 2026? Agent inboxes, approval queues, MCP-era patterns. Re-check whether
  anything now has the question-with-tappable-options primitive that was the reason to build this at all —
  `docs/DECISION.md` says if a tracker ships that, the main reason to own this evaporates.
- **Identity and avatar systems that are not cringe.** He asked for a character or profile that gets enhanced.
  There is one built (`app/components/Emblem.tsx`, geometry from tokens, no assets). Is that the right idea
  executed at 40%, or the wrong idea?
- **Modern platform features that are Baseline widely available**, checked against real data rather than blog
  posts. RESEARCH §11 has the method and records two blog claims that were simply false.
- **Then tell him what you learned that he did not know, including anything that contradicts this brief.**
  Every previous iteration found something in its own brief that was wrong, and saying so was the most useful
  thing it did. This brief will contain errors too.

---

## How you must verify — this is what gets audited

Every defect this project has ever had was found **by using the thing**. Not by reading code, and not by the
suite. The suite was green every time. Take that personally.

- **Extend the existing harnesses**: `tests/measure-layout.mjs`, `tests/use-it.mjs`, `tests/palette.mjs`,
  `tests/shoot.mjs`, `tests/chrome.mjs`. Chrome is already installed.
- **Write each new check against the CURRENT interface first and watch it fail.** Commit the red run. That is
  stronger evidence than a fault you inject afterwards, because a fault you inject is one you already knew how
  to catch. Precedent: `tests/baseline/before-progress.txt`.
- **Keep the fault injection too**, and make sure each one *reproduces its fault* — one recent injection rotated
  a circle about its own centre, which moves nothing, and the check reported "did not catch its own defect".
- **Look at the VIEWPORT screenshots, not just the full-page ones.** A full-page capture stretches the viewport
  to the document height, so anything sized in `vh` stops overflowing and its scrollbar cannot appear. That is
  why an ugly 15px scrollbar survived a whole redesign unseen.
- **Look at both themes.** The light theme's first ever run found a real bug: text at 1.18:1.
- **Every number about progress must be verified against the database**, not against what the page says. Then
  re-open something and assert the number drops.
- **All six suites must stay green**, and the two that need production must be run deliberately, not casually.
- **`CC_SUPPRESS_TELEGRAM=yes` must stay in `.env.local`** — without it, test runs push synthetic notifications
  to his real phone. It happened, a dozen at a time.

### Three traps that have each cost hours. They are in `AGENTS.md` too.

1. **No backticks inside the `MEASURE` template literal** in `tests/measure-layout.mjs`, including in comments.
   A backtick closes the string and the error points hundreds of lines away. This has happened three times.
2. **Colours must be resolved by the browser, not parsed.** The old regex computed a luminance from an OKLCH
   hue angle, produced `NaN`, and `NaN < 4.5` is *false* — it passed text at 1.62:1. Anything painted with a
   gradient must also declare an opaque `background-color`, or the colour behind its text is unknowable.
3. **A check whose subject is absent must report NOT MEASURED, never pass.** Several have passed while
   measuring nothing. The fixture is also a claim about what real data looks like — it has flattered the design
   three times (short `why` text, a duplicated idempotency key, and open tasks with no history).

---

## What to produce

1. **Research findings**, appended to `docs/RESEARCH.md` as a new section, with links and dates, including what
   you rejected and why.
2. **A written plan he approves before you build**: the concept, the reasoning, what changes file by file, in
   what order, how each step is verified. Ask him when a decision is genuinely his — taste, cost, what he will
   put up with — and make the routine calls yourself.
3. **Step-by-step execution**, verified as you go.
4. **A report** containing: the concept and why; what you decided *against* and what evidence decided it;
   **measured** before/after numbers, not adjectives; screenshots at every width in both themes; every new
   check with proof it fails when its subject is broken, plus your committed red baseline; proof that every
   figure matches the database and that re-opening takes credit back; anything you found wrong that is not in
   this brief; and **what you are uncertain about, stated plainly.**

## Open items you inherit

- **No phone or tablet figure has ever been checked on a real device.** Every one is Chrome emulation.
  Re-flagged three times. If you cannot fix it, re-flag it a fourth time rather than quietly implying otherwise.
- **The light theme has been measured and screenshotted but never seen by a human eye.**
- **The 46vh decisions cap** in `app/globals.css` is an unverified judgement call. Resolve or re-flag.
- **The reading pane still scrolls** — 217px over at 1920×1080. A thin dark bar was chosen over deleting
  content. Revisit if you disagree.
- **The level curve and the point rates are guesses.** Ten ranks at 0/30/80/160/280/450/680/980/1360/1840; 10
  points a task, 6 a decision, 4 for a note, 4 for beating a deadline, 4 for answering within the hour. Nothing
  in the research says where those should sit. He has now used it — ask him how it feels.
- **`prove:health` leaves a server on port 3941** after a clean run. Known, unfixed, loud when it bites.

## How to work

Take your time. Be ambitious about the design and pedantic about the truth. Write down *why*, in the code or
the docs, wherever the obvious approach turned out to be wrong — those comments are the handover to whoever
comes after you, and they are the reason this brief could be written at all.

He wants something that makes him want to open it. He also wants to believe every number on it. Those are
compatible, and holding both is the job.
