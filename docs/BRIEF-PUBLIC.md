# Brief: make it shareable without making it worse for him

**Written:** 4 August 2026, by the agent that shipped the progression work, the sixth pass on the crest, the
plain-language rewrite and the first-run states.
**For:** an agent with a lot of context, working alone, autonomously, until it is done.
**Status:** this is the **immediate next work**. `docs/BRIEF-VISUAL.md` stays queued behind it — see §9 for why
that order is right rather than arbitrary.

**Read first:** `docs/HANDOVER.md`, then `AGENTS.md`, then `docs/ITERATION-LOG.md` §XIV–§XIX, then
`docs/BRIEF-VISUAL.md` §7–§8 (the evidence machinery and the traps — they are not repeated here).

---

## 1. What he asked for, in his own words

> *"I think we should slowly move to making this tool public. I'm thinking of setting this up as a public
> repository and/or not. I don't know, you suggest to me. From developer to developers, have their own hub with
> nice instructions on the README of GitHub. The setup process could be easily explained on our GitHub README.*
>
> *Firstly this is a priority to get back to the project setup when you already have this. For example, how to
> connect your project to it, the things that we have locally only.*
>
> *This project must be very easy to set up and done in the most convenient way for me. I am in the biggest
> priority. This project is made for me and only for me but I am sharing and it must be also shareable. Keyword
> here is also that it must be working amazingly for me and then we are thinking about sharing."*

### The one rule that orders every decision in this brief

**He is the user. Sharing is additive, never a trade.** If a change makes the hub better for a stranger and one
step worse for him, it is the wrong change. Concretely, and these are the ones that will tempt you:

- **No setup wizard he has to click through.** His hub is already set up. Anything that greets him with onboarding
  is a regression.
- **No extra configuration for him.** Defaults must land on his working setup, so a fresh clone of his own repo on
  a new machine still just works.
- **No accounts, no user table, no tenant column.** See §3.
- **Nothing gets slower or heavier** for the sake of being explicable.

---

## 2. The recommendation he asked for: yes, public — and not yet

He asked me to suggest. **Publish it. MIT licence. Public repo. But after three things, not before.**

**Why publish:** the interesting part of this project is not the CRUD. It is the reasoning — `docs/RESEARCH.md`'s
thirty-one sections with citations, `docs/DECISION.md`, and an `ITERATION-LOG.md` that records every claim a
measurement disproved. Developer-to-developer, *that* is the artefact worth reading, and there is almost nothing
like it published. The code is a competent Next.js app; the docs are unusual.

**Why it costs him little:** the model is deploy-your-own (§3), so there is no service to run, no users to support,
no data of anyone else's to hold. The marginal cost of a public repo is the issue tracker, and §8 handles that.

**Publish after these three, in this order:**

1. **The connect-a-project flow actually works for someone who is not him** (§4 and §5). Today it does not — that
   is measured, not suspected.
2. **The public-readiness audit** (§6). There is real personal data in the repo right now. Publishing before this
   is the only genuinely irreversible mistake available here.
3. **The visual pass** (`docs/BRIEF-VISUAL.md`). A README's screenshots are its first impression, and the hub is
   about to be redesigned. Publishing screenshots of a UI you are two weeks from replacing means either a stale
   README or doing it twice.

**On "and/or not":** there is a middle option and it is worth knowing about — **public repo, private docs.** Move
`ITERATION-LOG.md`, the briefs and `PROGRESS-REPORT.md` into a private submodule or simply out of the repo, and
publish the code plus `RESEARCH.md`, `DECISION.md`, `API.md` and `AGENTS.md`. My view is that this is the wrong
trade — the log is the most valuable document here — but see §6.3, because it is his call and it is about him, not
about the code.

---

## 3. The model: every developer runs their own hub. Never multi-tenant

**This is the architectural decision the whole brief rests on, so it is stated first and it should not be
revisited casually.**

The hub is single-tenant by construction: one `CC_WEB_TOKEN`, one `CC_AGENT_TOKEN`, one Telegram chat, one Neon
database, no `user_id` anywhere. That is not a limitation to fix. It is what makes the design honest:

- **No data isolation problem**, because there is no shared data.
- **Auth stays proportionate.** `docs/HANDOVER.md` §2.4: the hub stores no secrets and `lib/store.ts` rejects
  credential-shaped values, which is what makes a single token acceptable. Add accounts and that argument
  collapses — you now hold other people's task lists and need real auth, sessions, recovery, and a privacy policy.
- **The honesty rules survive.** Everything is derived from `tasks.done_at` and `questions.answered_at`. A tenant
  column is the first step toward a `users` table, and a `users` table is the first step toward the stored score
  this project exists to not have.
- **He keeps his hub.** Nobody else's rows ever touch his database.

So "shareable" means: **fork or clone, deploy your own, point your agents at it.** The README's job is to make
that path short. Say so in the README explicitly, so nobody opens an issue asking for sign-in.

---

## 4. Movement I — the connect-a-project flow. His stated first priority

He said *"firstly this is a priority to get back to the project setup when you already have this."* Four defects,
all measured on 4 August. **Fix these before anything about publishing.**

### 4.1 The most-used command is taught wrong, in two places

`lib/snippet.ts` — the live text every project's `AGENTS.md` receives — says:

> *"### Sync AGAIN during the session. Once at the start is not enough."*

and explains the `more: true` paging loop. But two static surfaces still teach the old rule:

- `docs/ADD-A-PROJECT.md` step 3: *"Run this at the **start of every session** from now on"*, and its conventions
  list repeats *"`cc sync` at the start of every session"* with no mention of during-session syncing or paging.
- `README.md:24`: *"start every session with this"*.

That rule exists for a specific reason recorded in `AGENTS.md`: he does these tasks away from his desk, and an
agent that only syncs at the start makes him come home to tell it something he already told the hub.

### 4.2 The doc leads with a command that only works on his machine

`scripts/install-into-project.mjs` fetches the snippet with `process.loadEnvFile(join(root, '.env.local'))` and
requires `CC_AGENT_TOKEN`. **So it needs the hub repo checked out AND its secrets.** `cc onboard` needs only
`cc setup` having been run once, because its config lives in `~/.command-center/config.json`.

`docs/ADD-A-PROJECT.md` leads with the installer. For anyone who is not him, step 1 half-fails: it copies `cc.mjs`
(that happens first) and then errors on the snippet fetch. `/setup` leads with `cc onboard`, which is correct, and
`docs/DECISION.md:132` already records the intended answer — *"the snippet is now served by the hub and installed
by `cc onboard`"*. The doc is simply behind.

### 4.3 Two file headers describe code that no longer exists

- `cli/cc.mjs`'s own header block lists **7** commands. There are **9** — `onboard` and `repush` are missing, and
  `onboard` is the one the setup prompt tells agents to run. The runtime `--help` output is complete; only the
  file's documentation is stale.
- `scripts/install-into-project.mjs`'s header says it *"Writes the managed block from
  install/AGENTS.snippet.md"*. It fetches from the hub now, and that directory does not exist. The correction is
  explained forty lines lower, in the function, and never made at the top.

### 4.4 Machine-specific paths in the instructions

`d:/Antigravity/TheCommandCenter` and `d:/Antigravity` are hardcoded in `README.md`,
`docs/ADD-A-PROJECT.md`, `scripts/install-into-project.mjs`, `scripts/seed-real.mjs` and
`scripts/migrate-riff-kitchen.mjs`. `/setup` derives the path from `CC_REPO_PATH`; the docs do not.

`https://needsme.vercel.app` — his hub — is hardcoded as a fallback in **24 places** across three source files and
the docs. As a default for him that is a convenience; in a public repo it means a stranger's misconfigured CLI
points at *his* hub and gets a 401. Make the fallback absent rather than his URL, and fail with a message that
says what to set.

---

## 5. Movement II — make the CLI obtainable without the repo, and settle where instructions live

### 5.1 The gap

Every path to a working machine currently assumes **either** the hub repo is checked out **or** `cc.mjs` is
already at `~/.command-center/`. There is no documented way to get from "nothing" to "a working CLI". The empty
hub now points every new person at `/setup` (added 3 Aug), and `/setup`'s first section tells them to run the
installer — which needs the repo. **One level below the gap I closed, there is still a gap.**

### 5.2 The recommendation: the hub serves its own CLI

Add `GET /api/agent/cc.mjs` — the hub serves `cli/cc.mjs` as text. Then step zero on any machine is two commands
with no repo, no npm, no clone:

```bash
mkdir -p ~/.command-center && curl -fsSL <hub>/api/agent/cc.mjs -o ~/.command-center/cc.mjs
node ~/.command-center/cc.mjs setup <hub> <agent-token>
```

**Why this is the right shape and not just convenient:**

- **It is the pattern the project already chose and already defends.** The hub serves the snippet from
  `lib/snippet.ts` precisely so the instructions cannot drift from the code. Serving the CLI means the CLI cannot
  drift from the hub that answers it either — you always have the version your hub expects.
- **Zero new infrastructure and zero dependencies.** No npm package to publish and version, no registry account,
  no supply chain. `cli/cc.mjs` already has zero dependencies and that is deliberate.
- **It works for a cloud agent** that has no repo and never will — the case `install-into-project.mjs`'s own
  comment says it was trying to solve.
- **It closes the loop with §4.2:** `cc onboard` becomes reachable from nothing, so the doc can lead with it.

Consider requiring the agent token on that route, or not — decide and write down why. Serving the CLI unauthenticated
leaks nothing (it is about to be a public repo) and makes the bootstrap one step shorter; requiring the token makes
the route consistent with every other `/api/agent/*` and is one more thing to paste. Either is defensible; an
undecided one is not.

### 5.3 His "should it be in a file or not" question, answered

He said: *"Maybe it should be in Excel or maybe not because when a new user will be installing this project they
will be downloading all of the files so they will have those files also."*

He is asking whether instructions belong in a file in the repo — since a new user has the whole repo anyway — or
only on the hub. **The answer is both, with one rule that decides which:**

> **Anything a person needs BEFORE they have a running hub goes in the README. Anything they need AFTER goes on
> `/setup`, generated from live config.**

Before: what this is, deploy your own, create the database, get your tokens, get the CLI. Those cannot come from a
hub that does not exist yet, so they must be in the repo.

After: the per-project prompt, the snippet, the project list, the exact commands with the real hub URL and the real
install path filled in. Those must be generated, because `/setup`'s header states the rule the whole page exists
for — *"everything on this page is generated at render time from live configuration, so it cannot drift"* — and
`docs/RESEARCH.md` §7 names a drifting duplicate as the fastest way to lose trust in a tool.

**So `docs/ADD-A-PROJECT.md` is the file to be suspicious of.** It is a static copy of what `/setup` generates,
and §4.1 and §4.2 are exactly the drift that predicts. Recommendation: cut it down to the part that cannot be
generated, and have it point at `/setup` for the rest — or delete it and move its genuinely-good "conventions"
section into `lib/snippet.ts`, where every agent will actually read it.

---

## 6. Movement III — the public-readiness audit. The only irreversible step here

Do this before the repo changes visibility. Audited 4 August; these are findings, not guesses.

### 6.1 Real personal data in tracked files

- **`scripts/seed-real.mjs` — the important one.** Its own header says: *"Every item below is genuine and was taken
  from another project's morning notes and from the open questions in this repo's own docs/DECISION.md.
  Nothing here is invented."* **These are his real outstanding tasks.** It has served its purpose. Delete it, or
  replace the content with invented items and say so.
- **`scripts/migrate-riff-kitchen.mjs`** — a one-off for one of his projects, quoting a real decision and its
  comment. Done its job. Delete.
- **`riff-kitchen`** appears as the example slug in `AGENTS.md`, `docs/API.md`, `docs/ADD-A-PROJECT.md` and
  `cli/cc.mjs`. Harmless, but a made-up slug reads better in a public API doc.

### 6.2 His hub, his machine

See §4.4. 24 hardcoded references to his hub URL, 5 files with his filesystem layout.

### 6.3 His own words — ASKED AND ANSWERED, 4 August 2026

The docs quote him verbatim throughout — `ITERATION-LOG.md` alone has nine block quotes plus many inline, and
there are more in `HANDOVER.md`, `PROGRESS-REPORT.md`, `PLAN-BEST-HUB.md` and three briefs. Several were blunt:
two carried profanity about the work, one said he was tired of pushing commits himself, and one made a point
about his own English.

**Those quotes are the reason the documents are any good** — every design decision is traceable to the sentence
that caused it, which is exactly what makes this repo worth reading. But they are him, in public, permanently,
including him being frustrated and him mentioning his English.

**He was asked, and he chose the first option below.** The three, as presented:

1. **Verbatim, softening only the lines that are about HIM rather than about the work.** ~16 edits: the profanity
   reworded, the push complaint turned into reported speech, and the clause about his English elided with the
   ellipsis marked. Everything else stays first-person. **He chose this, and his reasoning was better than the
   recommendation it overrode:** *"accuracy is what the log is for, and 40 paraphrases is 40 chances to misstate
   what I said."*
2. **Neutral attribution throughout** — "the owner", "he" — rather than first-person dialogue. Keeps every causal
   chain; removes the diary quality. *This was the brief's original recommendation and it was not taken.* The
   argument against it is the one above: it is ~40 rewrites into documents whose entire value is that they are
   accurate.
3. **Keep the logs private**, publish the code plus `RESEARCH.md`, `DECISION.md`, `API.md`, `AGENTS.md`.

**Done.** See `docs/ITERATION-LOG.md` §XXI.C for the edits, and for the two things he added that this audit had
missed — `docs/ENVIRONMENT.md` needing to be scrubbed under this option, and the fact that **deleting a file does
not remove it from git history**, which makes flipping this repository's visibility the wrong way to publish it.

### 6.4 Housekeeping

- **No `LICENSE` file.** MIT is the right default developer-to-developer.
- **`package.json`** has `"private": true` and no `license` field.
- **`.env.local` is correctly untracked** and a scan of tracked files found no secrets. Verified, not assumed.
- **`docs/ENVIRONMENT.md`** records which database is which — check it names no connection strings before it goes
  public.

---

## 7. Movement IV — the README as a front door

Today's README is written for someone who already has the hub. It needs to answer, in this order, for a developer
who has never seen it:

1. **What is this and why would I want it** — one paragraph. The two nouns: work only you can do, decisions only
   you can make. The Telegram tap. The thing it removes from your day.
2. **A picture.** Non-negotiable for a visual tool, and the reason publishing waits for the visual pass.
3. **What makes it unusual, honestly** — everything is derived, nothing is stored, re-opening a task takes the
   credit back, no streak and why. This is the part that earns a star from a developer who will never deploy it.
4. **Deploy your own** — §8.
5. **Connect a project** — the short version, pointing at your own `/setup` for the generated commands (§5.3).
6. **What it is not** — single-user by design, no accounts, not a SaaS, no support promised. Set this expectation
   in the README rather than in issue replies.

**Keep it short and link out.** `RESEARCH.md`, `DECISION.md` and `API.md` already exist and are better than
anything a README should try to contain.

---

## 8. Movement V — the deploy-your-own path

The steps a stranger must complete, and each one is a place to lose them:

| step | today | make it |
|---|---|---|
| get the code | clone | clone, or a **Deploy to Vercel** button with the env vars declared |
| a database | Neon by hand | Neon free tier, or the Vercel Neon integration; document the one you test |
| schema | `scripts/init-db.mjs` exists | one documented command, and say what it creates |
| tokens | invent two | say what they are for and how to generate them (`openssl rand -hex 32`) and that they are unrelated to each other |
| Telegram | optional, undocumented for a newcomer | BotFather, three minutes, and **state that it is optional** — the hub works without it |
| the CLI | needs the repo | §5.2 |

**Verify by doing it.** The only honest test of a setup path is to follow it from nothing. You cannot create his
Vercel project or his Neon account, so what you *can* do is: read every command back, check every env var name
against the code that reads it, and make `/api/health` the stated finish line — it already reports each credential
separately and is exactly the right "did it work" check. Say plainly in the log which steps you could not execute.

**Do not add a dependency to make deployment prettier.** Four runtime dependencies, deliberately
(`docs/RESEARCH.md` §13).

---

## 9. Order, and the relationship to the visual brief

There are now two pending briefs. **This one first.** Reasoning:

1. He named the setup flow as *"firstly this is a priority"*.
2. §4 and §5 are defects, not improvements — the connect flow is currently broken for anyone who is not him, and
   `/setup` is where the empty hub now sends every new person.
3. It is small. §4 is corrections; §5 is one route and two commands.
4. **The visual pass has to come before publishing anyway** (§2), so doing setup first costs the publish date
   nothing and de-risks it.

So: **this brief → `docs/BRIEF-VISUAL.md` → publish.** Update `AGENTS.md`'s pointer when you finish, the way this
session did, so the next agent inherits the right queue.

---

## 10. What must not change

Everything in `docs/BRIEF-VISUAL.md` §4 still applies — the derivation rules, `writeVerified`, no optimistic UI,
the contrast budget, plain language (check **W1**), no streak, no new dependencies, push every commit. Plus, for
this brief specifically:

- **The single-tenant model** (§3).
- **His defaults.** A fresh clone of his repo on a new machine must still work with no extra steps.
- **`lib/snippet.ts` is the single source** for anything an agent is told. If you add an agent-facing behaviour,
  add the row to the coverage check in `tests/prove.mjs` in the same commit — that is a standing instruction he has
  had to give out loud once already.
- **No feature that only exists to be demonstrated.** If it is not useful to him, it does not ship.

### Done means

- [ ] A person with a bare machine can get from nothing to a synced project by following written instructions, and
      every command in them has been read back against the code that implements it.
- [ ] `docs/ADD-A-PROJECT.md`, `README.md`, `cli/cc.mjs`'s header and `install-into-project.mjs`'s header all agree
      with what the code does.
- [ ] No real personal data, no hardcoded hub URL fallback, no hardcoded machine paths in anything a stranger reads.
- [ ] A licence, and `package.json` agreeing with it.
- [ ] **He has decided §6.3 himself.**
- [ ] All nine suites green; every new check with a fault injection; a new agent-facing behaviour has a snippet row.
- [ ] `docs/ITERATION-LOG.md` records the plan, the audit of the plan, every measurement, and every claim of yours
      that a measurement disproved.
- [ ] Committed and **pushed**, production re-verified.

---

## 11. One last thing

He has said the shape of this twice and it is easy to get backwards:

> *"This project is made for me and only for me but I am sharing and it must be also shareable… it must be working
> amazingly for me and then we are thinking about sharing."*

Every question in this brief resolves the same way. **Make it excellent for him. Make it possible for everyone
else.** In that order, and never the other way round.
