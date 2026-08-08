# Command Center — agent guide

> **`/agents` and the permission relay shipped 8 August 2026** — `docs/BRIEF-NOTHING-BLOCKED.md`, written up in
> `docs/ITERATION-LOG.md` §XXIX and §XXX. Three things worth knowing before you touch any of it:
>
> - **An empty queue and a dead agent are no longer the same screen.** `/agents` says which, per project, in one
>   sentence — and there is a rule about those sentences: **if it needs the word "you", rewrite it.** They are
>   facts about the agents, never about his attention. `sentenceFor` in `lib/presence.ts` is the only place they
>   are made, and check A3 in `npm run prove:use` renders all five states and asserts the property over every one of them.
> - **A held tool call is not a task and not a question**, and that is enforced by structure rather than by
>   comment: its own table, no `events` row, and nothing `board()` counts reads it. The check that guards it is
>   in `tests/prove.mjs` — *"A HELD TOOL CALL NEVER ENTERS THE COUNTS"* — because that claim is arithmetic and
>   the only honest test is to count twice with one held.
> - **All three features are OPT-IN per project and off by default.** `cc presence on`, `cc approvals on`,
>   `cc spend`. Do not switch any of them on unprompted; the second changes what a link to the hub can do.
>
> **THE HUB HAS A VISUAL REFERENCE NOW, and it is `docs/ITERATION-LOG.md` §XXXI** — 8 August 2026. Four
> earlier visual passes were all corrective; none had a target. §XXXI is the target: Linear, Raycast, Geist
> and Radix measured beside our own tokens, a twelve-dimension rubric scored on numbers rather than
> impressions, and an admissibility rule that keeps marketing pages out of it. **Two things in it matter
> before you touch any styling:**
>
> - **The spacing scale and the type ramp are CHECKS now, not conventions.** `L10` asserts that every
>   padding, margin and gap the page paints is on one scale; `L11` asserts that tracking and weight are
>   functions of type size. Both measure the rendered page, because the last time these were conventions the
>   page drifted to **nineteen** spacing values whose three commonest were on no scale at all, and four of
>   the offenders were inline styles in components that no stylesheet check could ever see.
> - **A threshold check cannot see a slow regression.** Mid-session the queue row grew from 37px to 39px and
>   L3 stayed green the whole time, because L3 guards "six above the fold" and six was still met. **If you
>   change a shared control's padding, measure the row**, not the check.
>
> **The visual pass before it is §XXVIII, 7 August 2026.** Read [docs/ROADMAP.md](docs/ROADMAP.md) first for
> where the whole thing stands, then [docs/HANDOVER.md](docs/HANDOVER.md), then this file.
>
> **The only step left is publishing, and it is his to trigger.** `node scripts/publish-dry-run.mjs` builds the
> fresh-`git init` candidate in a scratch directory, proves it carries one commit with no parent and none of his
> real work, lists the personal identifiers it WOULD publish, and prints the one command that does it. It never
> adds a remote. Do not run that command for him.
>
> **The fifth data state is `npm run at-scale -- --load`, and it is where three of §XXVIII's findings lived** —
> two pages disagreeing about his level, a target naming the rank he already held, and a list contradicting the
> sentence above it. `--clean` afterwards, **and before running any suite**: `npm run fixture` does not remove
> `y2-*` rows, and nine checks will fail with accurate messages about the wrong thing.
>
> **The payload-at-scale defect is CLOSED**, along with the reminder ladder and server-side search — roadmap
> steps 1, 2 and 3, all shipped 6 August 2026. `docs/ITERATION-LOG.md` §XXVI has the before-and-after
> (2,389.6 KB and 1,973 ms at two years became 277.3 KB and 819 ms) and the twelve claims of mine that a
> measurement disproved. **`npm run at-scale -- --load` reproduces that state in two minutes; `--clean`
> afterwards, and it verifies the absence rather than assuming the DELETE worked.**
>
> **[docs/BRIEF-PUBLIC.md](docs/BRIEF-PUBLIC.md) is done except for one thing that is his to decide** — §6.3, his
> own words being published, which is asked and unanswered. Everything else in it shipped on 4 Aug 2026:
> `docs/ITERATION-LOG.md` §XXI has what was done, what the brief got wrong, and the six claims of mine a
> measurement changed. **The repository is not public yet, and the reason it was waiting — the visual pass,
> because a README's screenshots are its first impression — is closed as of 7 Aug 2026.** The README has its
> two pictures and `scripts/publish-dry-run.mjs` says what publishing would expose. `BRIEF-PUBLIC.md` §2 has
> the ordering argument.
>
> **Read [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) first if you are new to this repo.** It records the
> live environment — and in particular that **local development and production use different databases**,
> so `npm run dev` does not show you the real hub and `cc sync` does not read your local server. That fact
> cannot be derived from the code, and getting it wrong means writing test data into the real hub.

This is the hub itself. If you are working on a *different* project and just want to use the hub, you only
need the "Command Center" section that `cc onboard` put in that project's `AGENTS.md`, plus
`node "$HOME/.command-center/cc.mjs" sync`.

**And if `~/.command-center/cc.mjs` is not on the machine at all, the hub serves it** — you need no clone, no
`npm` and no copy of this repository:

```bash
mkdir -p "$HOME/.command-center"
curl -fsSL -H "Authorization: Bearer <agent-token>" <hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"
node "$HOME/.command-center/cc.mjs" setup <hub> <agent-token>
```

**`"$HOME"` and not `~`, and that is not pedantry — a tilde there fails on Windows.** `curl` never expands `~`;
the shell does, and PowerShell does not do it inside an argument, so `-o ~/.command-center/cc.mjs` exits 23 with
*"client returned ERROR on write"* having created nothing. In PowerShell use
`"$HOME/.command-center/cc.mjs"`. That exact line shipped on `/setup` and failed on the first machine
it ran on — `docs/ITERATION-LOG.md` §XXI.C.

Same token in both lines, so a `401` on the download means the token is wrong and the second line will not work
either. See `app/api/agent/cc.mjs/route.ts` for why that route is authenticated when serving it openly would
leak nothing.

## The bar

**This must be the best command center in the world for one specific person, and that is the only target.**
His words, 6 August 2026: *"the goal is to create the best one for me. The best one for me is the best one in
the world, because I can use the other ones and using this one must be the best experience."*

He can install anything. He has tried the alternatives. So the standard is not "good for a self-hosted
side project" — it is that opening this in the morning beats opening anything else that exists.

**So: always compare against the best, and do not settle until this one is better.** Before you build
something, find who does that thing best today and read how they did it. Then beat it, or write down why
their version is wrong for one human. "Nobody else has this" is a claim to verify, not an assumption — on
6 August 2026 a survey of ~40 products found the timed default genuinely unoccupied AND found that two
things this project believed were unique were not.

**And the trap in "better than everyone at everything", because it is the one that would wreck this
product:** better does NOT mean more. The competitor with ten panels is not ten times better; it is a
dashboard, and dashboards die — 53% of the ones studied in `docs/RESEARCH.md` §14 were already dead. He has
said it directly and more than once: *"simplicity of the workflow"* is the priority, *"we don't need some
crazy stuff that looks cool but doesn't make sense."*

The bar is measured in **his experience**, not in surface area. Which means the highest bar and the smallest
surface are the same instruction, not a compromise between two:

- **Beating everyone** at the four handoffs below, and at how it feels to open.
- **Refusing** everything that adds a place to look, a thing to maintain, or a second truth.

Settling looks like: shipping the obvious version, matching a competitor instead of beating them, dismissing
their idea without having looked at it, or adding a panel because a rival has one. All four are failures
against this bar, and the last two fail it in opposite directions.

---

## What this is and what it must stay

One human, several projects, four agents that come and go. The hub closes four handoffs:

1. an agent hands the human work only they can do
2. an agent gets a decision without guessing or stalling
3. the human's ticks, answers and notes reach the next agent in **one call**
4. all of it in one place, across every project

It holds **two nouns and two supporting ones**: `task`, `question`, plus `note` and `event`. That is the
whole vocabulary and it is a decision, not an accident — see [docs/RESEARCH.md](docs/RESEARCH.md) §7 for
what each extra feature would cost. Before adding anything, the test is: **does it remove a step from
someone's day right now?**

Explicitly banned: priorities, labels, due dates on tasks, assignees, sprints, epics, roadmaps,
documentation pages, status summaries, anything that also lives in a repo.

## Read these two files before changing anything

- **[lib/db.ts](lib/db.ts)** — `writeVerified`. Nothing in this codebase reports a write as saved until it
  has re-read the row with an independent `SELECT` and compared it to what was intended. Every mutation
  goes through it. If you add a write that bypasses it, you have reintroduced the bug that cost this
  person real data.
- **[lib/store.ts](lib/store.ts)** — all data operations and all validation, in one file so the rules are
  in one place.

## Progress is COMPUTED. Never store a score.

The hub shows the human what they have finished: a count, a record of every completion with what it achieved,
and dated marks. **All of it is derived from `tasks.done_at` and `questions.answered_at`, on every render.**
See [lib/progress.ts](lib/progress.ts).

If you are an agent about to add an `xp` column, a `level`, an `achievements` table or a counter, do not. The
reasons, because they are not obvious:

- **A stored score can disagree with the tasks table, and then the hub has two truths.** That is
  `writeVerified`'s bug in a nicer costume. A badge for something the human did not do is the same class of
  lie as an app reporting "saved" over a rejected write.
- **Re-opening a task must take the credit back**, and with a derived figure it does so for free: `done_at`
  is cleared, the row stops matching, and it leaves the count, the list and every mark at once. A stored
  score needs code that remembers to decrement, and that code is the bug. `tests/use-it.mjs` asserts this by
  ticking a task off, watching the figure and a mark appear, then re-opening it and watching both go away.
- **Do not derive it from `events`.** It looks like the right table — append-only, monotonic `seq`, has a
  `task.done` kind — and it is wrong twice: append-only means credit can never be taken back, and the log has
  already been truncated to a few dozen rows by early proof runs. See [docs/RESEARCH.md](docs/RESEARCH.md) §17.
- **Only `status = 'answered'` counts as a decision the human made.** Never `defaulted` — that means a
  deadline passed and the hub proceeded *without* them.
- **POINTS MAY ONLY DEPEND ON WHAT THE HUMAN DID — never on what an agent did.** This is the rule most likely
  to be broken by someone being helpful. The two most satisfying candidates for points are "cleared a project"
  and "the whole hub reached zero", and both are excluded, because both depend on how much is currently OPEN:
  an agent filing one task overnight would silently delete the bonus and drop his level. A score that can fall
  while he sleeps is a score he would be right to stop believing. Those two are *marks* instead, reconstructed
  historically so they stay true after new work arrives.
- **Any target you state must be arithmetically true.** Levels and "2 to go" exist because he asked for them
  twice; what replaced the old "never show a target" rule is narrower and stricter — a rendered remainder has
  to equal `need - have` from the same snapshot the rest of the page renders. Check **P5** parses the numbers
  off the page and asserts them.
- **No streak, ever.** Nothing may count consecutive days or tell him not to break something. The `return`
  category pays for *closing* a gap instead, which is the same measurement with the opposite sign.
  [docs/RESEARCH.md](docs/RESEARCH.md) §18 has the evidence; P5 also bans the language.

Mark *definitions* live in code, typed and reviewable in a diff, like `lib/snippet.ts`. Mark *state* is
derived by querying. A wrong rule is fixed by deploying, not by migrating a table full of things somebody was
told they had earned.

## Three traps in the test harness that have each cost hours

Read these before touching `tests/`. Each one produced a check that reported success while measuring nothing
or measuring the wrong thing.

1. **No backticks inside a page-side template literal, including in comments — AND THIS IS A CHECK NOW.**
   Everything inside one is a string in a `.mjs` file; a backtick closes it and the rest is parsed as outer
   JavaScript, producing an error that points hundreds of lines from the cause and usually names a word that is
   inside a comment.

   It has now happened **thirteen times**, four of them in a single session, and *every one of those four was
   in a comment written moments after reading this warning* — as were both of the two on 7 Aug 2026, in a
   session that had read this paragraph in its first ten minutes. That is enough evidence that the warning does not work.
   **`npm run prove:parse`** runs `node --check` over every file in `tests/` and fails the run instead. Read
   `tests/no-backticks.mjs` before writing a cleverer version of it — two earlier shapes are recorded there and
   both were wrong.
2. **Colours must be resolved by the browser, not parsed.** The contrast checks read colours through a 1×1
   canvas. The old regex version computed a luminance from an OKLCH lightness/chroma/hue, produced `NaN`, and
   `NaN < 4.5` is false — it passed text at 1.62:1. Any element painted with a gradient must ALSO declare an
   opaque `background-color`, or the colour behind its text is unknowable and C1 reports it as unmeasurable.
3. **Screenshots must include a viewport-sized capture.** A full-page capture stretches the viewport to the
   document height, so anything sized in `vh` — the reading pane, the decisions cap — stops overflowing and its
   scrollbar cannot appear in the image. `npm run shots` produces both.

## The field reference

### `cc task '<json>'` → `POST /api/agent/tasks`

| Field | Required | Notes |
|-------|----------|-------|
| `project` | yes | Lowercase slug, e.g. `example-app`. Matches the folder name. |
| `title` | yes | One line, imperative. |
| `verify` | **yes** | How they know it worked, without asking you. Rejected if missing. |
| `key` | no, but do | Idempotency key, unique per project. A retry updates instead of duplicating. |
| `why` | no | What becomes true once it is done. Not a restatement of the title. |
| `minutes` | no | Honest estimate. Used to total up "your turn" at a glance. |
| `steps[]` | no | `{ do, detail?, copy? }`. `do` supports `**bold**` and `` `code` `` only. |
| `steps[].copy` | no | An exact value, rendered with a tap-to-copy button. **Never a secret.** |
| `gotchas[]` | no | The ways *this* task goes wrong. Only real ones. |
| `blocked_reason` | no | Set when it cannot be started yet. Excluded from the actionable count. |

The response carries `notified` and `notify_reason`, so **say which one happened.** "Filed and he has been
told" and "filed, nobody alerted" are different sentences and the human acts on them differently. Reasons:
`burst` (another task hit this same project minutes ago — the first already told him), `blocked` (he cannot
start it yet), `suppressed` (rule said yes, channel is off). `null` means a message went out. A re-POST of
an existing `key` is an edit, not an arrival, and never notifies. Full table in [docs/API.md](docs/API.md).

`PATCH /api/agent/tasks { id, status }` — `dropped` or `open` only. **An agent cannot set `done`.**

**To change a task's content, POST it again with the same `key`.** Same row, same id, and the human's
`note` survives. PATCH cannot edit content; dropping and recreating discards the identity for nothing.
This was true from the start and never written down, so an agent reasonably chose drop-and-recreate.

`GET /api/agent/tasks?id=…` or `?project=…&key=…` reads one back in full. `sync` returns each open
task's `note` too — previously a note over 200 characters was unreachable by any agent.

### `cc ask '<json>'` → `POST /api/agent/questions`

| Field | Required | Notes |
|-------|----------|-------|
| `project` | yes | |
| `title` | yes | The question, answerable in one tap. |
| `context` | no | What is blocked and why it matters. Two lines maximum — it is read on a phone. |
| `options[]` | if `choose` | `{ key, label, detail?, recommended? }`. Max 6. `key` is max 12 chars. |
| `allow[]` | no | Subset of `accept`, `choose`, `respond`, `ignore`. Defaults sensibly. |
| `default_option` | no | Option key to proceed with if the deadline passes. Needs a deadline. |
| `hours` / `deadline` | no | When the default takes effect. A deadline with no default is refused. |
| `key` | no | Idempotency key. Re-asking an already-answered key is refused — read the answer instead. |

`allow` semantics, adapted from LangChain's Agent Inbox vocabulary (`edit` replaced with `choose` — see
[docs/RESEARCH.md](docs/RESEARCH.md) §3):

- `accept` — one "Go ahead" button. For "I am about to do X, is that fine?"
- `choose` — the options as buttons. The common case.
- `respond` — they type a value. On Telegram, they swipe-reply to the message.
- `ignore` — a "Not now" button. Always offer this unless the decision truly cannot wait.

**Answers can carry a comment.** `answer_note` is populated alongside any answer type — they can tap an
option *and* add a condition. On the hub it is a box above the buttons; in Telegram they tap and then
reply to the message, so a comment can arrive after the decision as a second event. Treat a choice plus a
condition as **one** instruction. This was missing from v1 and found within minutes of real use: without
it, choosing an option meant the caveat went back into chat, which is the failure this hub exists to
remove.

**Use `default_option` + `hours` whenever there is a defensible fallback.** It is the most valuable thing
in the hub: it turns "blocked until they wake up" into a bounded wait with a pre-approved outcome, stated
to them up front. Without it you are back to guessing or stalling.

**And it no longer rests on one notification getting through.** A question with a deadline gets up to two
reminders on the way to it, derived from `created_at` and `deadline` at 50% and 85% of the window, and the
FIRST message states the whole ladder — *"I'll nudge you in 6h (15:00 UTC) and again in 10h (19:12 UTC)."*
Each nudge replaces that message rather than adding one, so a decision is always exactly one message in the
chat. There is no field for any of this and nothing to store: the number of nudges sent IS
`count(events where kind = 'question.reminded')`, the points are a pure function of two timestamps, and the
sweep runs on the same lazy-on-read path as `applyDueDefaults` — see [lib/reminders.ts](lib/reminders.ts).

What it changes for you: a `question.reminded` event in `changed` means **he has been nudged and has still
not answered**, which is a different situation from a question asked ten minutes ago. Nothing is sent while
he is actively using the hub, on the same reasoning as `notify_reason: burst`.

### `cc sync` → `GET /api/agent/sync`

Returns `changed` (since the cursor) plus `open_questions`, `open_tasks` and `defaulted_questions`
**regardless of the cursor**. That asymmetry is deliberate: a lost or wrong cursor costs you some
duplicated reading and can never hide work that is still waiting.

`defaulted_questions` is the section to never skim. It means a decision was made without the human
because the deadline passed, and any work built on that decision still being open is wrong.

The server remembers a cursor per agent name, so you need no local state. Pass `?since=N` to override, or
`?since=0` for everything.

**Sync again DURING the session, not only at the start.** He does these tasks away from his desk, and when he
ticks one off he has no way to tell you — telling you would mean being back at his machine, which is the thing
this hub exists to avoid. The instruction in `lib/snippet.ts` is event-based rather than time-based, because an
agent has no timer and "every fifteen minutes" is an instruction that quietly does not work: sync before you claim
to be blocked on him, before you start work that depends on a task you filed, after anything that took real time,
before your closing summary, and before re-asking anything. The cost is one cheap call; the cost of skipping it is
that he makes a trip home to tell you something he already told the hub.

The hub shows him the other side of this. If he finished something and no agent has synced since, the board says
so — *"You finished something 40 min ago and no agent has synced since — nothing knows yet."* It says **synced**,
never **read**, for the same reason `noteReach` does.

**`changed` is paged at 200. If `more` is `true`, sync again straight away** rather than at your next poll —
loop until it is `false`. The cursor stops at the last event you were handed, so this walks the log with no
gaps and no duplicates. It used to jump to the head of the log regardless of the page size, which skipped
events permanently for any agent that had been away a while; `tests/prove.mjs` asserts the new behaviour.

**A note from the human may be older than it looks.** The hub now shows him whether anything has synced
since he wrote each note, and prints *"nothing has collected it yet"* when nothing has. If you sync and find
a note, act on it or reply — an uncollected note is visible to him as a fact about you.

## Conventions in this codebase

- **Comments explain why, not what.** Where the obvious approach turned out to be wrong, the comment says
  so. Those comments are the handover; do not strip them.
- **Fail closed.** Missing configuration refuses requests rather than allowing them. See `requireConfigured`.
- **No optimistic UI.** `app/components/Board.tsx` shows "saved" only on `saved: true` from the server.
- **No cron jobs.** Timed defaults are applied lazily on read. A scheduler is a second thing to keep alive.
- **Telegram is best-effort.** The record is not. A write succeeds even if the notification fails, and
  `notified` is reported honestly so an agent can say "asked, but nobody was alerted".
- **One message per burst, per project.** Notifications exist to stop the hub rotting unvisited, and a
  channel that fires nine times in a row gets muted, which achieves the opposite. Tasks announce arrival,
  not progress: no "nearly done", no nudges. See `taskNotifyDecision` in `lib/store.ts`.
- **The webhook always returns 200** except for a bad secret. Telegram redelivers non-2xx, and a
  redelivered tap must not become a second write.

## Testing

```bash
npm run dev
npm run typecheck          # THREE SECONDS, AND IT IS IN prove:all NOW. `prove:parse` only reads tests/, and
                           # the backtick trap is about template literals holding SQL — lib/store.ts is full
                           # of them, and a pair in a SQL comment there closed the literal. tsc caught it.
npm run prove:parse        # node --check over tests/ — the backtick trap, as a check. Run it FIRST: it is
                           # two seconds and it turns an unreadable SyntaxError into a filename.
npm run prove:hooks        # the Claude Code hook contract, against a stub hub. No browser, no database.
                           # It exists for ONE assertion: PermissionRequest returns decision.behavior, and
                           # PreToolUse's permissionDecision — the shape everybody reaches for — parses,
                           # returns 200 and decides nothing. Both look identical from outside.
npm run prove              # end-to-end over real HTTP against the real database
npm run prove:negative     # every safety check, broken on purpose

npm run at-scale -- --load     # TWO YEARS of his own measured rate into the DEV database, ~3,650 rows
npm run at-scale -- --measure  # server render, uncompressed HTML, and how many rows the payload carries
npm run at-scale -- --clean    # remove every y2-* row, and VERIFY none is left

npm run fixture            # realistic volumes into the DEV database; the two below assume it
npm run fixture -- --cleared   # the finished work and nothing open: the EARNED empty hub
npm run fixture -- --unstarted # nothing filed AND no agent ever synced: the FIRST screen a new person
                               #   sees. NOT the same as --clear, which leaves the agent rows behind and
                               #   therefore shows the "an agent has checked in" state instead.
npm run prove:use          # presses the real buttons in a real browser, then checks the database
npm run prove:layout       # measures the rendered page at 390/1280/1920
npm run shots              # viewport AND full-page screenshots, so you can actually look at it. The name carries
                           # the theme and the --path, so no two runs overwrite each other's evidence.
node tests/crop.mjs '<selector>' --path agents --scale 4 --light
                           # ONE ELEMENT AT 4x, captured through CDP at that scale so the pixels come from the
                           # rasteriser rather than from a blown-up PNG. This is the step the brief asks for and
                           # nothing automated; every defect §XXVIII found by looking was found at magnification.
                           # It has already caught a control sitting high on a two-line row and a link with no
                           # separator before it.
npm run shots -- --finished    # ...showing the record instead of the queue
npm run shots -- --crest       # ...with the crest's receipt open
npm run shots -- --timeline-back  # ...standing in the past, in the time machine
npm run shots -- --find        # ...with the command palette open and a query typed
```

**`prove:layout` runs against `--cleared` AND `--unstarted`.** Checks that need open work declare
`needsQueue` and stand down with the reason rather than failing; **E1** and **E2** measure what the earned-empty
hub has to get right instead. Pointing it there the first time found three thresholds of mine that were wrong —
see `docs/ITERATION-LOG.md` — which is what a state nobody had ever measured looks like.

**If you change anything the human sees, run `prove:use` and `prove:layout`, and then look at the
screenshots.** Every defect this project has had was found by using the thing; none was found by the
suite, and the suite was green each time. `prove:layout` is written so that each of its checks can be
demonstrated to fail on a deliberately broken page — a check that cannot fail is worse than no check,
and two of them silently lost that property during this work and had to be repaired.

`prove:negative` needs `CC_ALLOW_FAULT_INJECTION=yes` in `.env.local`, and its first test asserts that
fault injection is actually working — because a negative suite that silently cannot fail proves nothing.
Recorded output: [docs/PROOF.md](docs/PROOF.md).

## Committing

**Never pass `-c user.name` / `-c user.email` to `git commit` here. Let git use the machine's config.**

This cost a blocked deployment. An agent set the author email from its own session metadata instead of
reading the existing config. That address was the owner's WORK email, GitHub maps it to a separate account
with no Vercel account linked, and Vercel refused to build the push with *"does not have a Vercel account
linked to their GitHub account"* — an error pointing at an identity that had nothing to do with this project.

The address itself is not repeated here, deliberately. This repository is prepared to be published with a
fresh initial commit specifically so that address is not in the commit metadata; naming it in a tracked file
would put it straight back, in plain text, and undo the only reason that publish path exists. The lesson does
not need the address to work.

The correct identity is whatever `git config user.email` already returns. It is right because the human set
it. Overriding it also misattributes the work in the history, which is its own small mess.

## Secrets

Never in the repo. `.env.local` only, and it is gitignored. The hub itself stores no secrets by rule, and
[lib/store.ts](lib/store.ts) rejects credential-shaped values at the boundary — `lib/auth.ts` explains why
that rule is load-bearing rather than tidy.
