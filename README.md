# Command Center

**Your AI agents have two things they cannot do without you: work only you can do, and decisions only you can
make.** Today those arrive as messages in a chat window, and they scroll away. This is one hub across all your
projects where an agent files them — a task with exact steps and a line on how you know it worked, or a question
with tappable options and a **timed default** so nothing is ever blocked waiting for you indefinitely.

You answer on your phone, often with one tap in a Telegram notification and no app to open. Agents pick your
answers up on their next `sync` — **one call** that returns everything you ticked, answered or wrote since any
agent last looked.

One human, one hub, any number of projects and agents. You deploy your own; there is no service to sign up for.

![The hub at 1280: a decision with a timed default above a queue of tasks, with the record and the crest beside
it](tests/shots/readme-laptop-1280-viewport.png)

*What one morning looks like. The amber card is a decision an agent is blocked on, with a timed default —
answer it, or at 09:00 the hub proceeds with the option the agent recommended and tells you it did. Under it is
the queue of work only you can do. On the right is everything you have finished, derived from the rows on every
render.*

<details>
<summary>The record, and what it costs to be wrong about it</summary>

![The record at 1280: nine completions, newest first, each with what it unblocked, a project and a Re-open
button](tests/shots/readme-record-laptop-1280-finished-viewport.png)

Every completion says what it achieved — the asking agent's own sentence — and every one has **Re-open**, which
is what makes the figures above it worth anything: re-opening clears `done_at`, so the count, the level and any
mark that depended on it all change by themselves. There is nothing to decrement and therefore nothing that can
forget to.

</details>

<!--
  REGENERATING THESE: `npm run fixture && npm run shots -- --tag readme` and
  `npm run shots -- --finished --tag readme-record`, then keep only the `-viewport` files.

  A VIEWPORT capture, never a full-page one. A full-page capture stretches the viewport to the document height,
  which stops anything sized in `vh` from overflowing — which is why for months no screenshot could show the
  scrollbars that were the first thing anybody complained about. The harness prints what data is in the image;
  the two above are the standard fixture (`npm run fixture`), which is synthetic and contains nobody's real work.
-->

---

## What makes it unusual

These are the properties worth reading about even if you never deploy it. Each one exists because its absence
caused a specific failure, and each is enforced by a check that has been demonstrated to fail.

- **Nothing is reported as saved until it has been read back out of the database.** Every mutation goes through
  `writeVerified` in [lib/db.ts](lib/db.ts), which writes, re-reads the row with an independent `SELECT`, and
  compares it to what was intended. A mismatch is a `500` carrying the verifier's own reason and
  `stored: false`. There is no optimistic UI anywhere. `npm run prove:negative` breaks each safety guarantee on
  purpose and asserts both that the hub reports the failure *and* that the database was left unchanged.
- **Your progress is computed, never stored.** No `xp` column, no `level` column, no achievements table. The
  count, the levels, the marks and the crest are all folded over `tasks.done_at` and `questions.answered_at` on
  every render — so **re-opening a finished task takes the credit back**, structurally, rather than by
  remembering to decrement something. A level can go down and the interface says so. See
  [lib/progress.ts](lib/progress.ts) for why a stored score is the same class of lie as an app reporting "saved"
  over a rejected write.
- **No streak. Ever.** Nothing counts consecutive days or tells you not to break something. Closing a gap is
  rewarded instead, which is the same measurement with the opposite sign — [docs/RESEARCH.md](docs/RESEARCH.md)
  §18 has the evidence.
- **The timed default**, which is the single most useful idea in here: *"if you have not answered by 09:00 I will
  proceed with option B"*, stated to you in the notification itself. It turns an unbounded stall into a bounded
  wait with a pre-authorised outcome.
- **Points may only depend on what the human did**, never on what an agent did. "Cleared a project" and "the hub
  reached zero" are both excluded as scores, because both depend on how much is currently open — an agent filing
  one task overnight would silently drop your level. A score that can fall while you sleep is one you would be
  right to stop believing.
- **The instructions cannot drift from the code**, because the hub serves them. The block written into every
  project's `AGENTS.md` comes from [lib/snippet.ts](lib/snippet.ts) via `/api/agent/snippet`, the CLI itself
  comes from `/api/agent/cc.mjs`, and `/setup` is generated at render time from live configuration.
- **An empty queue and a dead agent are not the same screen.** *"Nothing needs you"* is the state this hub
  exists to reach — and it used to render identically to *"nothing has run against this project since July"*,
  which is the hub quietly going out of date. `/agents` says which, per project, in one sentence. There is a
  rule about those sentences: **if it needs the word "you", rewrite it.** A quiet project is a fact about the
  agents, not an accusation about your attention, and check A3 renders all five states to assert it.
- **You can see what actually ran last night, including the sub-agents.** `/agents` draws a 24-hour chart:
  a lane per project, a bar per run, and every sub-agent nested inside the run that spawned it — what it
  was asked to do, how long it took and how it ended. **One row per session and one per sub-agent, never
  one per tool call**, because a session makes hundreds of those and a hook on each is a firehose. And
  because a bar is a claim about a span of time, the four kinds of claim are drawn differently: a run still
  going has no right-hand edge, a run that started and was never closed is drawn to the last thing *seen*
  rather than to now, and a run recovered from Claude Code's own transcript is hatched. A run too short to
  draw as a bar becomes a tick rather than a bar with a minimum width, because a bar that narrow would be
  claiming a length it does not have.
- **Every project has its own page, and you can act from it.** `/p/<slug>` opens one project: what is
  running now, **the last thing each agent actually said** with a time on it, which agents are waiting for
  you, that project's open decisions and tasks *answerable there*, the whole conversation in one column —
  your prompts, the agents' replies, the questions, the answers, what got finished — and a box to say
  something back. Nothing on it is a field anybody maintains. Every line names who said it and when, which
  is the only test a page like this can be held to.
- **"Waiting for you" is a real list, not an inference.** Claude Code's `Notification` hook reports when the
  harness is waiting on a human — a question, an idle prompt, a permission request — so the hub can tell you
  *which* agent is blocked, on what, and for how long. Anthropic's own Agent View leads with the same column
  and it is the right thing to lead with. The difference is that this one is not on your machine: it spans
  every project on every machine that reports in, and it reads on a phone with the laptop shut.
- **Runs are cut out of activity, because a session is not a unit of work.** A Claude Code conversation can
  stay open for eleven days; drawn as one bar it tells you nothing, and waiting for it to end means the page
  says *"nothing has looked at this since 8 August"* while an agent works. So the hooks report activity every
  turn and the hub splits a conversation wherever it went quiet for an hour. Nothing waits on an event that
  may never fire.
- **It is not empty on the day you install it.** Hooks only know about sessions that start after they
  exist, so `cc backfill` reads Claude Code's own transcripts and posts the last fortnight. On the machine
  this was built on that is 271 stretches of work across eight projects, one command, no waiting.
- **A tool call waiting for permission can be answered from your phone**, and this is the one thing every
  competing product in the category exists for. A Claude Code hook holds the call, the hub messages you with
  **Allow** and **Deny**, and if you do not answer within about ten minutes **it hands back to the terminal
  prompt** rather than aborting the work or waiting forever. Opt-in per project and off by default; the payload
  is treated as hostile and sanitised before it reaches your phone ([lib/sanitise.ts](lib/sanitise.ts) has the
  attack list, because agent-authored text beside an Allow button is exactly where an attacker would aim).

The reasoning behind all of it, including every idea that was rejected and why, is in
[docs/RESEARCH.md](docs/RESEARCH.md) (thirty-one sections with citations and dates),
[docs/DECISION.md](docs/DECISION.md) (why this exists rather than an off-the-shelf tool) and
[docs/ITERATION-LOG.md](docs/ITERATION-LOG.md), which records every claim its author made that a measurement
then disproved.

---

## Deploy your own

> ### Before you start
>
> - **About five minutes of your attention**, plus a few minutes of waiting on a deploy.
> - **Two accounts, both free, no credit card:** [Neon](https://neon.tech) stores your tasks,
>   [Vercel](https://vercel.com) runs the site. You can sign into both with GitHub.
> - **A third is optional:** Telegram, only if you want the one-tap phone notifications. The hub works
>   completely without it and tells you so rather than looking broken.
> - **You will not write any code, and you will not write any SQL.** One command creates the tables and
>   verifies them by reading them back; your agent can run it.
> - **Exactly two steps need a human at a browser:** making the accounts, and one `vercel login`. Everything
>   else is a single prompt you paste at your agent — it clones the repo itself, so there is nothing to
>   download by hand and nothing to run before it.
> - **You need Node installed** (20 or newer). If `node --version` prints something, you are ready.
> - **Nothing here is permanent.** Deleting the Vercel project and the Neon project undoes all of it.
>
> If any single step below does not match what you see on screen, that is a bug in these instructions and not
> in you — [open an issue](https://github.com/aroshidze/TheCommandCenter/issues) and quote the step number.

There are two ways to do this. **The first one is the point of the whole project**, so start there.

### The easy way — let your coding agent do it

If you use Claude Code, Cursor, Codex or anything similar, it can do every technical step. You do the two
things a machine genuinely cannot do — create accounts, and hold the secrets.

**1. Make the two accounts.** Sign up at [neon.tech](https://neon.tech) and [vercel.com](https://vercel.com).
Use the free tier on both. GitHub sign-in is fine and fastest.

**2. Get one value from Neon.** In the Neon console, create a project (any name — "command-center" is fine).
On the project dashboard there is a box called **Connection string**. Press **Show password** first, then copy
the whole line. It starts with `postgresql://` and is long. That single line is everything the hub needs to
reach your database.

> If you copy before pressing **Show password**, you get a string with `****` in the middle. It looks right
> and cannot work. This is the single most common mistake in this setup, so the code checks for those
> asterisks by name and tells you what happened instead of failing strangely.

**3. Log into Vercel once, in a browser.** In any folder, run `npx vercel login` and follow the prompt. This is
the one step an agent cannot do for you, because it deliberately requires a human at a browser — and it takes
about twenty seconds. Do it now and everything after it is automatic.

**4. Open your agent in an empty folder and paste this**, with your connection string in place of the
placeholder. You do not need to clone anything first — the prompt does that too, so this is the only thing you
paste anywhere:

```text
Set up a Command Center hub for me and deploy it, starting from nothing.
Clone https://github.com/aroshidze/TheCommandCenter.git into ./command-center and work in there.
My Neon connection string is:
postgresql://…paste yours here…

Do all of it and do not hand any of it back to me:
- create .env.local from .env.example, put the connection string in it, and generate the two
  tokens (CC_AGENT_TOKEN and CC_WEB_TOKEN) yourself with real randomness
- npm install, then npm run init-db to create the tables, then npm run dev
- confirm /api/health reports every check green before you tell me it works
- deploy it to Vercel, set the same environment variables there, and confirm /api/health
  on the deployed URL too
- then give me exactly two things: the link to open on my phone, and the one-line
  instruction I paste into my other projects so their agents can file work here

Skip Telegram entirely — I will decide about phone notifications later, so just tell me
in one line at the end how to add it if I want it.

Do not ask me questions. If something is genuinely ambiguous, pick the safer option, say
which you picked, and carry on. Read docs/SETUP.md if you need detail, and read
docs/ENVIRONMENT.md before you point local development at any database — there is a
reason it must not be the deployed one.
```

Then skip to [**Connect a project**](#connect-a-project). The two things it hands back are all you need.

### The manual way — you do it yourself

**[docs/SETUP.md](docs/SETUP.md) is the full walkthrough**: every console label as it actually reads, the two
ways to get the database string wrong, and how you confirm each step worked before moving on. It is written to
be followed by someone who has never opened either console.

The shape of it, so you know what you are agreeing to:

```bash
git clone https://github.com/aroshidze/TheCommandCenter.git
cd TheCommandCenter
npm install

cp .env.example .env.local     # every variable is documented in it; three have no default
npm run init-db                # creates the tables; idempotent, and verifies by reading them back
npm run dev                    # http://localhost:3939
```

> **Once you have deployed, point local development at a SEPARATE database.** On this install they are two
> branches of the same Neon project, so `npm run dev` does not show the real hub and `cc sync` does not read the
> local server. That is deliberate — it is the fix for test rows appearing in the one place that is supposed to
> hold only real work, which is how it was found — and it is the single thing about this repository that cannot
> be worked out from the code. [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) is the file that records it. **Read it
> before running anything if you are new here.**

The three required values are `DATABASE_URL` (Neon Postgres, free tier), `CC_AGENT_TOKEN` and `CC_WEB_TOKEN`.
The two tokens are unrelated to each other and you generate them yourself:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then deploy to Vercel, set the same variables there, and **`/api/health` is the finish line** — it opens the
database, counts the tables it needs, and names any missing credential rather than reporting that the process is
up. Telegram is optional and the hub is fully usable without it; `/api/health` reports it separately for exactly
that reason.

Open `/api/enter?k=<CC_WEB_TOKEN>` once on your phone. It swaps the token for a year-long cookie and redirects,
so the address you keep on your home screen contains no credential.

**Cost:** £0 at one person's scale — Neon free tier, Telegram Bot API free, and Vercel Hobby if your use is
non-commercial. Where that stops being true is in [docs/RESEARCH.md](docs/RESEARCH.md) §8.

---

## Keeping it up to date

Nothing here phones home, so nothing tells your hub that a new version exists. There are two halves and one of
them announces itself.

**Your hub — two clicks, and you have to look.** If you forked this repository, GitHub's own **Sync fork**
button on your fork brings it up to date, and your fork's page says *"This branch is N commits behind"* without
being asked. Pushing that triggers a redeploy, and **the schema applies itself on deploy** — there is no
migration to run, ever. If you cloned rather than forked: `git pull upstream main && git push`.

To be told rather than to remember: **Watch → Custom → Releases** on this repository, and GitHub emails you.

**The CLI on each machine — it tells you.** `cc sync` sends the CLI's version, and a hub that is newer answers
with the two commands needed to catch up. Agents sync several times a session, so a stale CLI announces itself
within minutes of your hub being updated rather than being discovered weeks later. The second of those two
commands is the one nobody guesses:

```bash
# 1. the CLI itself. No arguments — it reads the hub and the token from the config it already has
node "$HOME/.command-center/cc.mjs" update
# 2. and the hooks, because the CLI is what writes them — an old settings file stays old
node "$HOME/.command-center/cc.mjs" presence on     # in each project folder
```

Why the second one matters: hooks live in each project's `.claude/settings.json` and are written by the CLI, so
a new CLI does not change a settings file that already exists. And Claude Code reads a project's hooks **when a
session starts** — a session that was already running keeps the old set until it is restarted. `cc sync` covers
that gap by catching the hub up from the transcript, which is why syncing matters more than restarting.

---

## Connect a project

**Open `/setup` on your own hub and paste the prompt it gives you at an agent.** That is the whole thing: the
prompt has your hub's URL and your token already in it, and the agent installs the CLI if it is missing,
configures the machine, checks it, connects the project, turns on activity reporting and syncs. Every command in
it is safe to re-run, so it is the same prompt on a bare machine and on your fourth project.

By hand, if you prefer — **the hub serves its own CLI**, so this needs no clone and no `npm`:

```bash
mkdir -p "$HOME/.command-center"
curl -fsSL -H "Authorization: Bearer <agent-token>" \
  https://<your-hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"

node "$HOME/.command-center/cc.mjs" setup https://<your-hub> <agent-token>
node "$HOME/.command-center/cc.mjs" health
node "$HOME/.command-center/cc.mjs" onboard    # from inside a project folder
```

`"$HOME"` and not `~`: `curl` does not expand a tilde, the shell does, and PowerShell does not do it inside an
argument — so the tilde form exits 23 having written nothing, and `node ~/…` fails there too. Quoted `"$HOME"` works in PowerShell as well;
[docs/SETUP.md](docs/SETUP.md) has both forms.

`onboard` works out the project slug from the folder name, fetches the current instructions from **your** hub,
writes a Command Center section into that project's `AGENTS.md`, and adds a one-line pointer to `CLAUDE.md` or
`GEMINI.md` if they already exist. Pointers, never copies. `--dry` shows what it would change.

[docs/ADD-A-PROJECT.md](docs/ADD-A-PROJECT.md) has the conventions and why they are what they are.

`AGENTS.md` is the target because it is read natively by Claude Code, Codex, Cursor, Gemini CLI, Copilot, Aider,
Devin, Windsurf and Amazon Q, and it sits under the Linux Foundation's Agentic AI Foundation rather than any one
vendor.

---

## If you are an agent, this is all you need

```bash
node "$HOME/.command-center/cc.mjs" sync
```

At the start of every session **and again during it** — the human ticks things off away from their desk and the
hub is the only way they can tell you. It prints what they did, what they answered, what they wrote you, what is
still waiting, and any decision that **resolved by default** because they did not answer in time.

```bash
# You are blocked on a decision. Do not guess and do not stall.
node "$HOME/.command-center/cc.mjs" ask '{
  "project": "example-app",
  "title": "Reuse the existing image bucket, or make a new one?",
  "context": "Blocks the Pinterest queue — 2,849 images.",
  "options": [
    { "key": "reuse", "label": "Reuse the uploads bucket", "detail": "No new config.", "recommended": true },
    { "key": "new",   "label": "Create a pins bucket",     "detail": "Cleaner, ~10 min of setup." }
  ],
  "allow": ["choose", "ignore"],
  "default_option": "reuse",
  "hours": 12
}'

# Only they can do it (an account, a phone, a payment, a physical thing).
node "$HOME/.command-center/cc.mjs" task '{
  "project": "example-app",
  "key": "claim-domain",
  "title": "Claim example.com in Pinterest settings",
  "why": "Unblocks 2,849 pins.",
  "minutes": 15,
  "steps": [{ "do": "Open **pinterest.com/settings/claim** and paste:", "copy": "example.com" }],
  "verify": "The page shows example.com with a tick and the word Claimed."
}'
```

Rules that are **enforced**, so you do not waste a round trip:

- `verify` is required on every task. One line on how they know it worked without asking you.
- **Never put a secret in `copy`.** The request is rejected if it looks like a key. Say where the value lives
  instead. The hub stores no secrets, and that is what keeps it openable with one tap.
- `key` makes a write idempotent per project. Never reuse one for a different thing.
- You cannot mark a task `done`. Only the human can.
- Use `default_option` + `hours` whenever there is a defensible fallback.

Full field reference: [AGENTS.md](AGENTS.md). Every command also works as a plain `curl` —
[docs/API.md](docs/API.md) — so a tool without shell access is not locked out.

---

## What this is not

Set these expectations here rather than in issue replies:

- **Single-user by design, and it will not become multi-tenant.** One agent token, one web token, one Telegram
  chat, one database, no `user_id` anywhere. That is not a limitation waiting to be fixed — it is what makes the
  authentication proportionate (the hub holds no secrets *because* it holds only yours) and what keeps the
  honesty rules intact. A tenant column is the first step towards a `users` table, and a `users` table is the
  first step towards the stored score this project exists to not have.
- **Not a SaaS.** There is nothing to sign up for. Fork it, deploy it, point your agents at it.
- **No support promised.** It is one person's tool, shared because the reasoning might be useful. Issues may go
  unanswered; the docs are the support.
- **Not a project tracker.** No priorities, labels, due dates, assignees, sprints, epics or roadmaps. It holds
  two nouns, `task` and `question`, plus `note` and `event` to support them. Anything that also lives in a repo
  does not go in here — a copy that drifts from the repo is worse than no copy.

---

## Layout

| Path | What it is |
|------|-----------|
| `app/page.tsx`, `app/components/Board.tsx` | The one screen the human sees |
| `app/setup/page.tsx` | "How do I add a project", generated from live config so it cannot go stale |
| `app/api/agent/*` | What agents call: `sync`, `tasks`, `questions`, `snippet`, and `cc.mjs` itself |
| `app/api/telegram/route.ts` | The one-tap loop |
| `app/api/ui/act/route.ts` | Everything the human can do from the page |
| `lib/db.ts` | Connection + `writeVerified`. **Read this one first.** |
| `lib/store.ts` | All data operations and validation, in one file so the rules are in one place |
| `lib/progress.ts` | Finished work, levels and marks, all **derived**. Never store a score — read the header. |
| `lib/snippet.ts` | The single source for the block installed into every project's `AGENTS.md` |
| `lib/types.ts` | The entire vocabulary: task, question, note, event |
| `cli/cc.mjs` | The agent CLI. Zero dependencies, Node 18+, served by the hub at `/api/agent/cc.mjs`. |
| `scripts/` | Schema, the bulk installer, Telegram webhook setup |
| `tests/` | Ten suites. Every check has an injection proving it can fail — see below. |

Four runtime dependencies, on purpose: Next.js, React, React DOM and the Neon driver. No CSS framework, no
component library, no state manager, no test runner. [docs/RESEARCH.md](docs/RESEARCH.md) §13 has the argument —
every dependency is a thing that breaks while you are not looking, and this has to still work in a year.

## The suites

```bash
npm run typecheck        # three seconds, and it runs FIRST: the backtick trap lives in lib/store.ts's SQL
                         #   template literals, which prove:parse does not read
npm run prove:parse      # node --check over tests/. Two seconds.
npm run prove:hooks      # the Claude Code hook contract, against a stub hub. No browser, no database.
npm run prove            # end-to-end over real HTTP against a real database
npm run prove:negative   # every safety guarantee, broken on purpose
npm run prove:palette    # every colour pair, in every palette, both themes, without a browser
npm run prove:ladder     # the progression at day 730, and the words a person actually reads
npm run prove:use        # presses the real buttons in a real Chrome, then checks Postgres
npm run prove:layout     # measures the rendered page at five widths, both themes, on real pixels
npm run prove:health     # /api/health against a deliberately dead database
npm run audit            # every entry point, and whether any two land in the same place
npm run shots            # screenshots, so you can actually look at it
node tests/crop.mjs '.selector' --scale 4 --light   # one element at 4x, from the rasteriser

npm run fixture          # realistic local data. --live --cleared --unstarted are different states
```

**Every check has a fault injection that proves it can fail**, because a green check that cannot go red is worth
nothing and this suite has caught itself passing on a broken page more than once. Recorded output:
[docs/PROOF.md](docs/PROOF.md).

Contributing, or working on it with an agent: [AGENTS.md](AGENTS.md) is the working agreement, and
[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) records the one thing that cannot be derived from the code — that
local development and production use different databases.

## Finding your own install

This file used to open by naming one specific deployment — its URL, its Vercel project slug, its Neon project and
its bot username — as the second thing a reader saw. That was useful to exactly one person and it is the kind of
detail a public repository should not carry, so it is gone rather than moved. Nothing in the code ever defaulted
to it either: the CLI fails closed with the variable to set, and `/setup` derives its address from the request it
is answering.

Your own values are all one command away, and [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) lists which command for
each. The short ones:

```bash
npm run webhook -- --info        # the bot, the chat id, the current webhook URL
npx vercel ls                    # the deployment
git remote -v                    # where this pushes
```

Your sign-in link is `/api/enter?k=<CC_WEB_TOKEN>`, and that token lives only in `.env.local` and in your host's
environment variables — never in the repository.

## Licence

MIT. See [LICENSE](LICENSE).
