# Decision

**Date:** 29 July 2026. **Evidence:** [RESEARCH.md](./RESEARCH.md).

---

## The decision

**Build it.** A single small hub, shared by every project, driven by any agent over plain HTTPS, answered
by one human on a phone.

I want to be clear that I went looking for the opposite answer. The brief invites "use this existing tool
and here are two conventions", the previous agent recommended it, and it would be the better outcome. I
rejected it on a specific finding rather than a preference: **no existing tool has a
question-with-tappable-options primitive for an agent that does not run inside its own framework.** Every
issue tracker models a question as a comment, which is free text, which is the thing that already fails.
Linear's free tier cannot be driven over the API at all. HumanLayer has pivoted into being an IDE.
Agent Inbox only speaks to LangGraph graphs. That gap is not closeable by convention, because a
tap-to-answer option list is a user interface, and you cannot convention your way to a user interface.

So the honest position is: adopting a tracker would buy me seam A (tasks, which riff.kitchen already
showed is the easy part) and leave seams B and C — the decision stall and the context rebuild — roughly
as broken as they are today. That is not worth $120/yr and a second place to look.

## What it is, in one paragraph

Agents write **tasks** (work only you can do) and **questions** (a decision they are blocked on) into one
hub over one HTTPS call. Questions carry 2–4 labelled options, and you answer by tapping a button inside
a Telegram notification — no typing, no app switch, no page load. Any message you send the bot becomes a
**note** delivered to the next agent that syncs. Agents catch up with **one call** that returns everything
that changed since their last cursor, plus every open item unconditionally. Nothing is ever entered by
hand by you; you tick and tap.

## The four things that make it worth owning

1. **One-tap decisions with a timed default.** A question can say *"if you have not answered by 09:00, I
   will proceed with option B"*. Nothing I found in the research has this. It is the difference between an
   unbounded stall and a bounded, pre-authorised outcome — and it is the only feature here that addresses
   "it either guesses or it stalls, and both are expensive" at the root rather than making it faster to
   recover from.
2. **One call to catch up, and it cannot hide work.** `sync` returns the diff since a cursor *and* all
   open items regardless of cursor. A lost, stale or wrong cursor degrades the convenience and never the
   correctness.
3. **Push in both directions.** The hub reaches you when something needs you and is silent otherwise;
   your reply reaches the agent's next session. Neither party has to remember to go and look — which
   §7 of the research identifies as the single most common cause of tools like this dying.
4. **Writes that are read back.** Every mutation re-reads the row and returns it, and nothing says "saved"
   until the server has confirmed what is actually stored. Directly answers §6 of the brief.

## Chosen against

| Rejected | Why, in one line |
|----------|------------------|
| **Linear** | $120/yr to solve the seam I care least about; no options-question; free tier has no API. |
| **GitHub Issues** | Free and genuinely tempting, but `gh` is not installed, a third of your project folders are not git repos, and seam B degrades to emoji reactions or checkbox hacks. |
| **HumanLayer** | Pivoted to an AI IDE at $100/user/mo; the approval API is no longer the product. |
| **LangChain Agent Inbox** | Only accepts interrupts from LangGraph runtimes. Your agents are not LangGraph. Took its vocabulary instead. |
| **Notion / Todoist / Jira** | Slow on mobile, or no structured instructions, or team process for a team of one. |
| **An MCP server as the primary interface** | The spec's largest breaking revision shipped 28 Jul 2026 — sessions retired, old transport deprecated. Plain HTTPS is 100% compatible today with zero spec risk. Documented as a later wrapper over the same API. |
| **Supabase free tier** | Pauses free projects after ~7 days of inactivity. A hub that is quiet by design would be asleep the morning it mattered. |
| **A VPS** | You would own an OS: patches, TLS renewal, backups. That is rot risk wearing a control costume. |
| **Web push instead of Telegram** | Works, but on iOS requires a home-screen install and gives weaker notification actions. You are on Android now and may move to iPhone — Telegram behaves identically on both. |
| **Passkeys as the primary login** | Strictly more secure and rejected only because the hub stores no secrets. Documented as the upgrade if that ever changes. |
| **Roadmaps, docs, priorities, sprints, due dates, labels, assignees** | A copy that drifts from the repo is worse than no copy, and there is one human. Agreed with the brief; these are banned, not merely omitted. |

## Stack, and what it costs

- **Next.js on Vercel**, free `.vercel.app` URL — your existing stack, one command to deploy.
- **Neon Postgres**, free tier — relational so a write can be read back atomically; scale-to-zero; no
  inactivity pause.
- **Telegram Bot API** — free, no meaningful quota for one user, and personal notification bots are an
  intended use under its ToS.

**Cost today: £0.** Two caveats I am flagging rather than resolving quietly:

1. **Vercel Hobby is non-commercial only**, and enforced. This hub sells nothing and has one user, but it
   does support commercial work — a grey area. **Deploy it in the Vercel account you already have on Pro**
   and the question disappears at no extra cost, because Pro is per seat, not per project. If you are on
   Hobby only, say so and I will move it to Cloudflare Workers + D1, whose free tier permits commercial
   use outright.
2. **Neon is now Databricks-owned**, so its free tier is a live risk rather than a theoretical one. The
   schema is small and plain, so migrating is an afternoon.

## What would change my mind

Written down so this can be re-decided by evidence rather than re-argued from scratch.

- **A tracker ships a native options-question for external agents.** If Linear, GitHub or anyone else
  ships "agent asks a question with N tappable options, over an API, answerable from the mobile app", the
  main reason to own this evaporates. Delete it and migrate — the schema maps onto issues cleanly. Worth
  re-checking every six months; Linear is moving fast in this direction.
- **The timed default turns out to be unused.** If after a month no question has ever been resolved by its
  default, then I over-valued the stall problem and this is just a to-do list with push — at which point
  GitHub Issues plus a Telegram webhook is a smaller thing to own.
- **Agents stop calling sync.** If sync-per-session drops below roughly half, the hub is going stale and
  lying, which is worse than not existing. The fix is `AGENTS.md` placement and making the call cheaper;
  if that fails, the concept fails and I would rather kill it than maintain a hub that misleads.
- **MCP settles.** Once the 2026-07-28 spec is broadly implemented by all four tools, a thin MCP wrapper
  over this same HTTP API becomes worth adding. That is an addition, not a change of mind.
- **The hub ever needs to hold a secret.** Then the cookie-token auth is no longer proportionate and
  passkeys become mandatory before anything sensitive is stored.

## Corrections made after real use

Recorded because the reasoning in this document was wrong on these points, and a future reader should not
rediscover them the hard way.

**The primary surface is a desktop, not a phone.** The brief says "I use this on a phone, one-handed, while
something else is happening", and I let that drive every layout decision. It is the minority case: the hub
is used mostly at a desk *while doing the assignments*, and on a phone occasionally to check in and answer
something simple. Both matter and they want opposite things — a 720px column on a monitor is a phone layout
with wasted margins, and 44px minimum controls make a mouse-driven interface feel inflated. There are now
two real layouts rather than one stretched, and control sizing keys off `pointer: fine` rather than viewport
width, because what decides how big a control needs to be is what you are pointing with.

**Choosing an option and saying something were built as alternatives.** They are not. Within minutes of real
use the answer was "move them to the hub, BUT make sure the other project gets instructions first", and the
hub could not express it — so the caveat went back into chat, which is the exact failure this hub exists to
remove. Answers now carry a comment, on any answer type.

**The no-secrets rule was enforced by pattern matching, which is not the same thing.** It caught `sk-`,
`ghp_`, JWTs — the shapes I thought of. A real VAPID private key with no recognisable prefix went straight
through. Now also refused generically, and tested in both directions so it cannot become a rule that
refuses everything.

**A task's note had an undeclared 200-character limit.** `sync` did not return notes and there was no
read-by-id for tasks, so the human's reply — the return channel this design values most — was unreadable
past the event summary's truncation point. Found by an agent on another project, not by the test suite.

**Documentation an agent needs must be reachable by the agent, not by the human.** Onboarding instructions
that tell the human to run a script by absolute path fail twice: they only work on one machine, and they
hand a human a job the agent could do. The snippet is now served by the hub and installed by `cc onboard`.

**Completed work was stored and never shown.** For most of this hub's life the entire completion surface was
one grey footer line — the last five titles joined by dots, from a `limit 5` in the store. No count, no dates,
nothing cumulative, and no trace of the one thing that makes an errand feel worth having done: the `why` the
asking agent wrote, which the interface discarded at the exact moment it came true. The data was all there and
unused. See [PROGRESS-REPORT.md](./PROGRESS-REPORT.md).

**And a reward system was the wrong shape for it.** The request was "levels, achievement badges and other cool
perks". The evidence went the other way and it is worth recording rather than re-deriving:
Silverman & Barasch (*JCR* 2023) found that with **identical behaviour**, merely *displaying* a broken streak
dropped continuation from 66.23% to 57.86% — and in this hub absence is frequently not the human's fault at
all, because agents decide when work arrives. Hanus & Fox (2015) built badges plus a leaderboard and measured
it over sixteen weeks: motivation, satisfaction and empowerment all fell. Kivetz et al. (2006) showed effort
drops after each threshold, so a level ladder schedules its own troughs. What the same literature supports is
*informational* feedback — a truthful account of what happened, with no target attached — which is what the
record is. Evidence with links in [RESEARCH.md](./RESEARCH.md) §18–§19.

**The obvious table for a history is the one that cannot tell the truth.** `events` is append-only with a
monotonic `seq`, which makes it look ideal — and means credit can never be taken back: a task completed,
re-opened and left open keeps its `task.done` row forever. Every progress figure derives from `tasks.done_at`
instead, which is cleared on re-open, so a correction is structural rather than remembered. The log had also
already been truncated to 31 rows spanning 35 seconds by early proof runs, so it was never a record anyway.

The pattern across all eight: **every one was found by using the thing, and none by the test suite.** The
suite was green throughout.

## Judgement calls worth recording

- **`edit` from the Agent Inbox vocabulary was replaced with `choose`.** `edit` presumes a structured tool
  call to amend, which does not exist here. The real shape of these decisions is "one of these N", so the
  vocabulary is `accept` / `choose` / `respond` / `ignore`.
- **Open items are returned unconditionally, ignoring the cursor.** Slightly larger payload, in exchange
  for the property that no bookkeeping error can ever hide pending work. Correctness over token count,
  once.
- **Task content is structured fields, not a markdown blob** — but for a reason different from the one in
  the brief. The value is not in how it renders; it is that the schema forces the *writing* agent to
  answer what it would otherwise skip: what exact value, where, how it fails, how you know it worked.
- **The hub stores no secrets, by rule.** Tasks say where to find a key and where to paste it. This is
  what makes simple cookie auth proportionate, so it is a load-bearing constraint, not a nicety.
