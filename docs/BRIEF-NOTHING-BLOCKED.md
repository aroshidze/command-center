# Brief: nothing blocked by being online

**Written 7 August 2026.** The owner has asked three times for a hub that shows what his agents are doing, and
three times an agent has argued him out of it as a category. This brief exists because that was the wrong answer
to the right question, and because the reasoning was never written down — he asked whether an earlier discussion
of it was lost, and it was: nothing about it exists in any document in this repository.

**His words:** *"I want nothing blocked, let's create the best command center in the world."* And, separately and
just as firmly: *"the last thing we want is to complicate the thing that we already built by creating a second
app. They will overlap and kinda mess with each other."*

Both are satisfiable at once, and the resolution is the whole point of this brief.

---

## 1. The finding that makes this possible

**Almost nothing is genuinely local-only. What is local-only is *pulling*.**

Rubric — the competitor he pointed at — reads `.claude/skills/*` off the disk and has an "Open folder" button.
A server in Frankfurt cannot do that. But it never needed to: **this hub already runs entirely on things
pushed to it over HTTP.** Every task and every question in it arrived because something local made a call. The
same pipe carries anything else a local process knows.

| what he wants to see | pull (local-only) | push (works online) |
|---|---|---|
| which agents are alive, and where | — | **yes** — already partly there via `agents.last_sync_at` |
| an agent is blocked on a permission prompt | — | **yes** — a `PermissionRequest` hook |
| what each agent is working on right now | — | **yes** — `SessionStart` / `SessionEnd` hooks |
| token and money spent per project | — | **yes** — a local summariser reads Claude Code's usage log and posts a total |
| what skills/subagents are configured | scanning them | **yes** — post the list once, refresh on change |
| what is scheduled | reading crontab | **yes** — post the schedule |
| open this folder / attach to this session | **genuinely local** | no |

So the architecture is **one hub, plus a local collector that is not a user interface.** A few hooks and one
command. Nothing to look at locally, nothing to keep in sync, no second place to check — which is exactly the
thing he refused, avoided.

The last row is the honest residue: a web page cannot open a folder on his machine. That is a two-line CLI
(`cc open <project>`) if it is ever wanted, not an application. And Anthropic already ships `claude agents`, a
cross-project "Needs input" list with the question inline, free, inside the process — which does the live-attach
case better than we could and should not be reimplemented.

---

## 2. The rule that keeps this from wrecking the product

**The queue page still answers exactly one question: what needs him.** Nothing in this brief may inflate the
queue, the counts, or the board chips. `AGENTS.md` §"The bar" is the standard: the highest bar and the smallest
surface are one instruction.

So there are three surfaces and each has a different job:

- **The queue** — unchanged. Tasks and decisions only.
- **One new page, `/agents`** — presence, spend, skills, schedules. Reachable from the nav beside `Looks`, and
  for the same reason `Looks` is a page rather than a tab: it is state he checks, not work he does.
- **An approval band above the queue** — for permission requests only, because those need answering in minutes
  and cannot live on a page he might not open. Self-expiring. Never counted as a task or a question.

---

## 3. What to build, in order

### 3.1 Presence — the one that fixes a real weakness

Right now **an empty queue and a dead agent look identical.** That is the sharpest criticism of this whole
product and it is true today.

Per project and per agent: last heard from, what it was doing, whether it is working now. Fed by `SessionStart`
and `SessionEnd` hooks posting a heartbeat, falling back to `agents.last_sync_at` when no hook is installed.
Then the honest line, in the voice `StaleBlocked.tsx` already uses — *"Nothing has looked at harbour-lights
since 28 July"* — with one tap that writes a note asking that project's agent to report in.

Grammatical rule, from the same reasoning that banned streaks: **if the sentence needs the word "you", rewrite
it.** "Nothing has changed here for nine days", never "you haven't touched this".

### 3.2 Permission relay — the feature everyone else's product exists for

The loudest pain in this category, quoted by a competitor's author: *"I had Claude Code running a large refactor
and been sitting idle for 15 minutes, waiting for me to press yes."* We do not touch it today.

A Claude Code `http` hook on `PermissionRequest` POSTs to the hub; the hub notifies Telegram with Allow/Deny;
the hook holds. **The hook budget is about 600 seconds**, so the honest promise is "answer within ten minutes on
your phone", and past that it hands back to the terminal rather than blocking — which is strictly better than
the field, where every timeout either aborts the work or waits forever.

Non-negotiables:

- **It is opt-in per project** and off by default. A hook on every tool call is a firehose.
- **It never becomes a task or a question.** Different lifetime, different surface, never in the counts.
- **It expires visibly.** An approval that silently lapsed is worse than one that was never asked.
- **Sanitise the payload.** `tool_name`, `description` and `input_preview` are agent-authored text rendered on
  his phone. Anthropic hardened exactly this in public: strip direction-override and invisible characters, cap
  the length, elide the rest. Treat it as hostile.
- **Say what the token means.** Whoever holds `CC_WEB_TOKEN` can approve tool calls in his sessions. That is a
  real widening of what the token does and it belongs in `docs/SETUP.md` and `lib/auth.ts`.

### 3.3 Spend per project

A local summariser reads Claude Code's usage data and posts a per-project total. One line on `/agents`, never a
chart, never a target, never a comparison between projects. It is the only number in the hub that is about cost
rather than work, and it earns its place because across fifteen projects he currently cannot know where the
money goes.

### 3.4 Skills and schedules

Posted once and refreshed when they change: what each agent can do, and what is scheduled. Lowest value of the
four — build them last, and drop them without regret if `/agents` is already earning its keep.

---

## 4. What is refused, and why

- **A second app or a second web UI.** His words, and correct: two surfaces mean the less-checked one goes stale
  and starts lying.
- **Live terminal streaming.** `claude agents` and every mobile client already do it, it requires the machine to
  be awake, and watching is not acting.
- **A sub-agent event firehose.** Sub-agents live for seconds. Rendering them is motion, not information.
- **Any project-health field an agent can set.** An agent asked to self-report health reports green, and a
  single green-while-you-slept status poisons every other indicator on the page.
- **Pushing a digest to Telegram.** Push stays reserved for things that need a human, permanently. A muted
  channel is a dead hub.
- **Storing anything derivable.** Presence is an observation and gets a row; "is this project stalled" is a fold
  over rows and gets none.

---

## 5. Done means all of this is true

- [ ] The queue page is unchanged in what it counts and what it shows.
- [ ] An empty queue can be told apart from a dead agent, in one line, on the first screen.
- [ ] A permission request can be answered from his phone in one tap, expires visibly, and hands back to the
      terminal rather than blocking past the hook budget.
- [ ] Every new surface works in all five data states, including `at-scale --load`.
- [ ] Every new colour has an asserted contrast pair; `prove:palette` green.
- [ ] Every new check has a fault injection that was watched failing.
- [ ] The setup story does not get longer for someone who wants none of this — it is all opt-in, and
      `lib/snippet.ts` says so, because a feature missing from the snippet does not exist for agents.
