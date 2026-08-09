# What everyone else built, what was taken, and what was deliberately left

**Written 9 August 2026.** The owner asked for this twice and did not get it:

> *"Is it so hard to search for all of the good great command centers that already exist? Find their
> screenshots, find their functionality, how they look, how they operate… we are nowhere near there and our
> goal is to overcome them."*

And then, precisely:

> *"Research whatever is available, the best things available on the market, and overcome them. If they have
> something really good and useful, we're doing it and we're doing it better and we're getting everything
> useful and not leaving anything — but only if it's really useful and I personally will use it… We must be
> best functionally and visually and also very optimized. We don't have all of the functionality that is
> available around this thing. That's not our goal. We must have all the most important things and that must
> be done ideally in the best way possible."*

That last sentence is the acceptance test for this document. It is not a survey. Every row below ends in a
decision: **taken, taken differently, or refused with a reason.**

A previous attempt at this launched six research agents and all six died on API errors, which is why
`docs/BRIEF-THE-CHART.md` still says the research "has not actually been done". This is that research.

---

## 1. THE THING THAT CHANGED EVERYTHING: the vendor shipped a command centre

**Anthropic shipped Agent View on 11 May 2026** — a research preview, in Claude Code itself, requiring
v2.1.139 or later. It is a full-terminal roster of every session you have running. What it shows, per row:

- **whether that session needs your input** — the column it leads with
- **the contents of its last response**
- when you last interacted with it
- for looping jobs, when the next run is due

Press Space on a row and a **peek panel** opens with the session's recent output and any blocking question;
you can type a reply, or press a number key for a multiple-choice prompt, without leaving the table. A
dispatch box at the bottom starts new background sessions, each in its own worktree.

**Claude Code also has Remote Control and a mobile app.** Permission prompts and completion alerts go to your
phone, and you approve from there.

### Why that is not the end of this project

Two of this hub's features are now things the vendor does natively, and pretending otherwise would be the
kind of flattery `AGENTS.md` forbids. What survives is not a gap in Claude Code's implementation — it is a
gap in its *shape*, and three parts of it cannot be closed from inside a terminal:

| | Agent View / Remote Control | This hub |
|---|---|---|
| Where it runs | a terminal on one machine | a server anything can reach |
| Scope | Claude Code sessions | **anything that can make an HTTP request** — Codex, Cursor, a cron job, a colleague |
| Machines | this one | all of them, at once |
| When your laptop is shut | gone | still there |
| History | the session list you have now | a fortnight, reconstructed from transcripts, per project |
| What needs a human | the sessions currently running | **every open decision and task across every project**, whether or not anything is running |

The market itself confirms which of those matters. The most-repeated complaint in every 2026 comparison is
not about any tool's UI:

> *"Running 5 to 10 Claude Code sessions across multiple machines, projects and git branches quickly became
> unmanageable — developers forgetting about sessions, losing track of what was running where, and sometimes
> only rediscovering abandoned work hours or days later."*

**Across machines. Rediscovering abandoned work days later.** That is this hub's subject, stated by somebody
else as the thing nothing solves. And it is why `/agents` telling him *"nothing has looked at this since 8
August"* was so much worse than a cosmetic bug: it is the one question the product exists to answer.

The other stated gap is the sharp one: *"Remote Control is Claude Code only — it is not a cross-provider
dashboard for running Claude Code and Codex agents side by side."*

---

## 2. What was TAKEN, and where it landed

**1. "Needs your input" is the first column.** Taken wholesale from Agent View, because the judgement is
right: of everything a command centre can say, *this cannot continue without you* is the only line that is
about your next thirty seconds. It is now the section above the chart on `/agents` and the banner at the top
of every project page.

- **Done better in one specific way:** ours is not limited to sessions that are running on this machine, and
  it does not disappear when the terminal does. An agent that asked at midnight is still on the list at nine.
- **Built on `Notification`**, matched to `agent_needs_input`, `idle_prompt` and `permission_prompt`. The
  harness reports it, not the agent — which is what makes it admissible where a self-declared status is not.

**2. The agent's last response, verbatim.** Agent View shows the contents of each session's last response,
and that single field is what makes a roster feel like a window rather than a status board. This hub had *no
channel for it at all* and had explicitly refused to build one — correctly, because the refusal was aimed at
a `status` field an agent fills in about itself. `Stop`'s `last_assistant_message` is not that: it is a
quote, with a time and an author. See `lib/reports.ts`.

**3. Nested runs drawn as a trace, not a list.** From the profilers rather than the agent tools — Speedscope,
Chrome DevTools Performance, Perfetto, and Langfuse/LangSmith, whose problem is ours exactly: a run
containing nested sub-runs with wildly different durations. Five rules came off Speedscope's own screenshot
(`docs/BRIEF-THE-CHART.md`); the load-bearing one is that **every bar labels itself so no legend is needed**,
and the key is now six words of swatches rather than five sentences of prose.

**4. A per-project page at all.** Every serious tool in the category has one — Conductor's sidebar and detail
pane, Vibe Kanban's board, Nimbalyst's workstreams, Langfuse's trace view. This hub had a row on a list with
nothing behind it, which is the single largest thing it was missing.

**5. Cost, but quietly.** Every 2026 comparison leads with spend and the good advice in them is **per task,
not per session** — "a session running one heavy task costs the same as ten light ones". Ours is per project
and stays a footnote, because he is on a subscription and *no action follows from the number*. See §4 for the
part of this that is still a real gap.

---

## 3. What was REFUSED, and why each refusal survives contact with the request

He said *"only if it's really useful and I personally will use it"*, which makes these refusals part of the
answer rather than omissions from it.

- **Kanban columns** (Vibe Kanban, Nimbalyst). A column is a status somebody drags a card into, and this hub
  has exactly two states worth having — needs a human, or does not. `docs/RESEARCH.md` §7 costed the
  alternative. A board would also mean he maintains it.
- **Worktree management, diff review, PR flow** (Conductor, Sculptor, Superset, Mux). These are the best
  features those tools have and they are all **local**: a server in Frankfurt cannot read his working tree.
  Building a shell of them would be the second local app he refused in as many words. The hub reports what
  sub-agents changed (files, +/− lines) because a hook can measure that; it does not pretend to show a diff.
- **An embedded terminal / live output mirroring** (pi-agent-dashboard, Paneflow, agent-dashboard). Same
  reason, plus one worse: a page that mirrors a terminal is a page you watch, and *watching is not acting*.
- **A live "agent health" status.** Refused permanently, and this is the one that matters most:
  `lib/presence.ts` — *"an agent asked to self-report health reports green, and a single
  green-while-you-slept status poisons every other indicator on the page."* Everything the hub shows about
  what an agent is doing is either measured by a hook or quoted with a timestamp.
- **Agent-to-agent messaging and a shared dependency graph** (ai-maestro, Citadel). Named as missing by the
  market and still refused: it is orchestration, and this hub's subject is the *human's* half of the loop.
  Adding it would make the hub a thing that can be wrong about what agents should do next.
- **AI-generated summaries of the traces** (LangSmith's Insights Agent, Polly). A summary is a claim nobody
  said. The whole design rests on quotes with authors and times.
- **A second dependency, a web font, an image asset, a chart library.** Four runtime dependencies, and the
  chart is CSS and inline SVG. Every rival in the list ships a bundle an order of magnitude larger.

---

## 4. What is still genuinely missing, stated rather than hidden

Written down because a document that only lists wins is a sales page.

1. **Cost per run, not per project.** The market's own best practice, and we cannot do it yet: spend arrives
   as a per-project snapshot from a transcript summariser, so there is no way to say *this run cost that
   much*. It would need per-session token totals at the point they are measured.
2. **Answering an ordinary "waiting for input" from the hub.** A held *permission* call is answerable from
   the phone; a plain question in a terminal is not, because nothing can push into a session that is not
   asking the hub anything. Claude Code **Channels** would close this and is behind an allowlist. The page
   says "in the terminal" rather than pretending.
3. **The agent's own plan.** `TaskCreated` and `TaskCompleted` hooks exist and would show his agents' todo
   lists live — *where they are*, in his words. Deliberately not built in this pass: the payload shape is not
   documented and this codebase does not store fields it has not measured. Measuring it is the next honest
   step.
4. **Sub-agent depth of one.** A sub-agent that spawns a sub-agent is drawn beside its sibling, not under it.
   Real traces nest arbitrarily.
5. **The visual pass is not finished.** §XXXI's rubric has not been re-scored against the new page.

---

## 5. The one-line verdict

Nobody else is building this, and the reason is that it is not a developer tool: **every rival is a better
cockpit for the machine you are sitting at, and this is the only one that assumes you are not sitting at it.**
The vendor's own dashboard proves the roster was the right idea; it also proves that the roster is not the
hard part. The hard part is being true about work you were not watching, and staying reachable when the work
is somewhere else.

**Sources.** [Agent view in Claude Code](https://claude.com/blog/agent-view-in-claude-code) ·
[Claude Code on mobile](https://code.claude.com/docs/en/mobile) ·
[Hooks reference](https://code.claude.com/docs/en/hooks) ·
[Best multi-agent orchestrators 2026 (amux)](https://amux.io/blog/best-multi-agent-orchestrators-2026/) ·
[Best agent management tools 2026 (Nimbalyst)](https://nimbalyst.com/blog/best-agent-management-tools-2026/) ·
[Conductor vs Vibe Kanban vs Nimbalyst](https://nimbalyst.com/compare/nimbalyst-vs-conductor-vs-vibe-kanban/) ·
[Claude Code agents and what parallel sessions cost (CloudZero)](https://www.cloudzero.com/blog/claude-code-agents/) ·
[AI coding agent dashboard across devices (Marc Nuri)](https://blog.marcnuri.com/ai-coding-agent-dashboard) ·
[Langfuse agent observability](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse) ·
[Speedscope](https://github.com/jlfwong/speedscope)
