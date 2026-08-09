# Brief: the control centre he actually asked for

**Written 9 August 2026, after he looked at `/agents` properly for the first time.** Three of the findings below
are his, not mine, and the third one invalidates a data model I specified.

His words, and they are the specification: *"I want to open one of my projects and see what the AI has done,
where they are, what they have reported, how they are working… This hub must be my command center where I
control all of my projects, or my agents, all of my sub-agents, everyone and everything in a convenient way. I
can separately open any project and look at all of the projects together… and you can take part in what's going
on right now by chatting with your AI agents right from the hub and answering their questions and insights."*

And his verdict on what shipped: *"Right now there is nothing, some outdated fucking information, how long they
have worked. That doesn't give me anything in the controls I want."*

---

## 1. SESSIONS ARE THE WRONG UNIT. This is his finding and it invalidates the model.

The presence model records `SessionStart` and `SessionEnd`. He pointed out what that assumes and why it is false:

> *"The session may never end. I might start an agent, and it never ends… You just close the window and never
> open it again, but at some point you might want to open it again and chat with that AI. It never ends! One open
> AI iteration can be live for several days."*

Consequences, all of them observed on his hub:

- **`SessionEnd` may never fire**, so the `idle` state is frequently wrong and often unreachable.
- **Hooks are read at session start**, so a session that was already running when the hook was installed reports
  nothing, forever. His live work in `Vibe Game Developing` — a real agent working for hours — rendered as
  *"Nothing has looked at Vibe Game Developing since 8 August"*. **The page stated something false about its own
  subject**, which is the one thing this hub is not allowed to do.
- **The only mid-session signal is a sub-agent spawn** (`PostToolUse` matched to `Task|Agent`). A session doing
  ordinary work reports nothing at all.

**And the answer was already in the codebase.** `cc backfill` reconstructs history from Claude Code transcripts
and had to solve this exact problem — its own note records that *"a transcript turned out to be a conversation,
not a session — one of yours spans eleven days — so files are split at half-hour gaps."* That is the correct
model. It was applied to history and not to the live path, so the hub runs two different definitions of a run
and shows him the wrong one.

**So: record ACTIVITY, derive runs from gaps in it.** A throttled heartbeat on all tool use — the hook checks a
local timestamp and only calls the hub when a few minutes have passed, so it is a dozen calls an hour per
session and not a per-tool-call stream. Then a pre-existing session appears the moment it does anything, an
eleven-day conversation reads as the several runs it actually was, and nothing waits on an event that never
comes. One model, live and historical.

---

## 2. There is no per-project page, and it is the foundation of everything else he described

Today a project is a row on a list with nothing behind it. He has asked twice to open one and see everything
about it. Every piece of data needed already exists — `agentsView` returns projects, presence, sessions,
subagents and spend; `board()` has that project's tasks, questions and notes.

What belongs on `/p/<slug>`:

- **What is happening now**: which agent, how long, which branch, which model — derived from activity.
- **What has happened**: every run, not a 24-hour window, with its sub-agents nested — what each was asked to
  do, how long it took, how it ended.
- **What it needs from him**: that project's open decisions and tasks, in place, answerable there.
- **The conversation** — see §3.
- **What it costs**, quietly.

## 3. "Chatting with the agent" is not a new architecture — it is a view over what already flows

Notes already go from him to agents and are collected on the next `sync`. Questions already come back with
options and a timed default, and answers already return. **All the pieces of a conversation already exist and
are scattered across two pages.** Presented as one chronological thread per project — his notes, the agent's
questions, his answers, the work it finished — that IS taking part in what is going on, with no new mechanism.

What it needs to feel live rather than postal: agents sync more often mid-session (`lib/snippet.ts` already
argues for this and can ask harder), and the thread shows honestly whether anything has collected his last
message — `noteReach` already computes exactly that.

Claude Code **Channels** would make it genuinely instant by pushing into a running session, and is worth
knowing about, but it is a research preview behind an allowlist. Do not depend on it; the polling thread works
today.

---

## 4. The visual failure, which he has now named four times

*"Too text-heavy… it looks like a text-only website… we can visually show bars and what these bars mean and do
it in a short, convenient, beautiful, intuitive way. This is not very user-friendly and not very human-friendly.
Maybe it's AI-friendly."*

Measured off a 1440-wide render: a 130px legend of five sentences above a chart two-thirds empty, and **ten
consecutive rows each reading "Nothing has looked at X since…" with ten identical buttons** — the page's
headline being *"8 with nothing looking at them"*. The dominant message of his command centre is a list of
failures.

`docs/BRIEF-THE-CHART.md` has the reference work: the five rules read off Speedscope's own screenshot, of which
the load-bearing one is that **every bar labels itself, truncated with an ellipsis, so no legend is needed at
all.** That brief also names the references still unread, because six research agents were launched for it and
all six died on API errors — the research he asked for twice has not actually been done.

---

## 5. What "done" means, and it is not for an agent to decide

Every previous pass on this page was graded against goals written by the agent doing the grading. That is how it
came to be called finished four times. The only acceptance test that counts: **he opens it, and says it is
good.** Until then it is not done, whatever the suites say.
