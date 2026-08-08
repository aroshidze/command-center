# Research

Everything below was checked on **29 July 2026**. Where a fact has a date attached, that date is the
date of the source, not the date I read it. Anything I could not verify hands-on is labelled as such,
because "I read their marketing page" and "I tried it" are different claims and mixing them is how
briefs like this get answered badly.

---

## 0. The four seams — the frame I judged everything against

The brief describes lost time at handoffs. Reduced to distinct mechanisms, there are four, and every
candidate below is scored against these rather than against a feature list:

| # | Seam | Today's cost |
|---|------|--------------|
| **A** | Agent → human: *here is work only you can do* | Written into chat, scrolls away, no memory of what got done |
| **B** | Agent → human: *I need a decision and cannot proceed* | Agent guesses (work thrown away) or stalls (hours to days lost) |
| **C** | Human → agent: *here is everything that changed since you last looked* | Rebuilt by interrogating the human at the start of every session |
| **D** | Across projects: *one place that knows what needs me* | Does not exist; context is trapped per repo |

**B and C are the expensive ones.** A is a nice-to-have that riff.kitchen already showed works. D is a
consequence of getting A–C right in one place rather than per project. Any tool that does not do B and C
well is not solving the actual problem, however good its issue tracking is.

---

## 1. Does this already exist?

### 1.1 Linear

- Pricing checked at <https://linear.app/pricing> (29 Jul 2026): Free ($0, 250-issue cap, 2 teams),
  Basic $10/user/mo, Business $16/user/mo. **API and webhook access starts at Basic** — the free plan
  cannot be driven by an agent over the API, which rules the free plan out for this purpose entirely.
- Linear added native MCP agent support on **23 Apr 2026**, and its CEO publicly framed issue tracking as
  changing shape around agents ([The Register, 26 Mar 2026](https://www.theregister.com/software/2026/03/26/linear_adopts_agentic_ai_as_ceo_declares_issue_tracking_dead/5227428)).
  The agent-delegation direction is real, not vapour.
- **Scored:** A good (rich markdown bodies, genuinely excellent mobile app). B **poor** — there is no
  "question with options, answered in one tap" primitive; the closest thing is a comment, which is
  free-text and therefore back to the thing that already fails. C **poor-to-fair** — MCP reads work, but
  "what changed since I last looked" is several calls and a lot of tokens, not one cheap call.
  D good.
- **Rejected because** it costs $120/yr to solve seam A, which is the seam I care least about, and leaves
  B and C essentially unsolved. If B were solvable by convention inside Linear I would take it; it is not,
  because a tap-to-answer option list is a UI feature and you cannot convention your way to a UI.
- **Not tested hands-on.** Requires an account and a paid plan; I did not create either without approval.

### 1.2 GitHub Issues (+ `gh` CLI)

The strongest "build nothing" candidate on paper, and the one I most wanted to be right.

- Free, unlimited private issues. Agents drive it with `gh issue list --json`, which is one cheap call.
  The pattern is well established — see [Saulius, *Claude Code as a GitHub-Native Agent*](https://saulius.io/blog/claude-code-github-native-agent-issue-to-merge-loop)
  and [DEV, *GitHub as Claude's Task Queue*](https://dev.to/gde03/claude-code-beyond-the-prompt-part-6-github-as-claudes-task-queue-issues-prs-the-5cjj).
- **Two facts I checked on this machine that change the picture:**
  1. `gh` is **not installed** (`gh: command not found`). So this is not zero-setup.
  2. Of 30 directories in `d:\Antigravity`, **11 are not git repositories at all** and 4 more have no
     remote. A GitHub-centred hub would only cover the projects that happen to already live on GitHub.
- Seam B would have to be faked. The two available one-tap mechanisms are markdown task-list checkboxes
  in an issue body, and emoji reactions. Both work, both are obscure, both mean "which of these three
  approaches should I take" is encoded as an emoji. That is a worse taxonomy than the one that already
  exists (§3).
- Seam C has a subtle failure: `--search "updated:>TIMESTAMP"` needs a watermark, and there is nowhere
  natural to keep a cross-project watermark inside GitHub.
- **Rejected because** it solves A and D for free but makes B awkward and C fragile, and it silently
  excludes a third of the projects. Kept as the fallback if the hub ever dies (§7).

### 1.3 HumanLayer

The product that used to be exactly this — an approval/human-contact API for agents.

- Checked <https://www.humanlayer.dev/> (29 Jul 2026): it is now positioned as "an AI IDE, collaboration
  platform, and building blocks for your software factory", with session orchestration and a QRSPI
  workflow. Pricing: free for ≤3 members / 200 sessions per month, then **$100/user/mo**.
- The standalone approval API is no longer the headline product, and the platform now wants to own the
  whole development loop rather than sit beside four different agents.
- **Rejected because** it has pivoted away from the one thing I wanted from it, its Pro tier is $1,200/yr,
  and adopting it means adopting an IDE — the opposite of "works with whichever agent I happen to open".

### 1.4 LangChain Agent Inbox

- Real, open source, and the closest thing to a correct answer for seam B: <https://github.com/langchain-ai/agent-inbox>.
- **Rejected because** it only accepts interrupts from agents running inside LangGraph with a checkpointer.
  Claude Code, Codex, Cursor and Antigravity are not LangGraph graphs, so there is nothing to connect.
- **Kept its vocabulary.** See §3 — this is the most valuable single thing the research produced.

### 1.5 Also looked at, rejected quickly

| Tool | Why not |
|------|---------|
| Notion (+ MCP) | Rich pages, good free tier, but the mobile app is slow to open, and agent reads are token-expensive. Fails "fast", fails "easy on a phone one-handed". |
| Todoist (+ MCP) | Best mobile ticking UX of anything here, free tier fine. But no structured instruction fields and no options-question — seam B and the "exact value to paste" both degrade to free text. |
| Jira / Shortcut / Height | Team process tools. Sprints, assignees, workflows for one person. Directly contradicts §5 of the brief and adds maintenance. |
| ntfy.sh | Genuinely useful and open source; supports `ActionHttp` buttons that fire an arbitrary HTTP request from the notification, on both iOS and Android (<https://docs.ntfy.sh/publish/>). Not a hub — it is a transport. **Kept as the documented second push channel** if Telegram is ever unavailable. |
| Slack / Discord | Both give one-tap buttons and push. Rejected as primary because they are workspaces you must be *in*; Telegram gives the same primitives with less around them. |

### 1.6 Conclusion of the survey

**Nothing on the market does seam B for an agent that is not inside a specific framework.** Every issue
tracker treats a question as a comment, and every human-in-the-loop tool assumes it owns the agent's
runtime. That gap is the reason the answer to this brief is not "adopt Linear".

---

## 2. How do agents discover instructions portably?

**`AGENTS.md`.** This is the convention the brief was reaching for, and it checks out.

- Released **Aug 2025**; adopted by **60,000+ open-source projects**; the specification was **donated to
  the Agentic AI Foundation under the Linux Foundation in December 2025**, so it is no longer any single
  vendor's format.
- Read natively as of early 2026 by **Claude Code, OpenAI Codex CLI, Cursor, Aider, Devin, GitHub
  Copilot, Gemini CLI, Windsurf and Amazon Q** — which covers every agent named in the brief.
- Plain markdown. No required fields, no frontmatter. "A README for agents."
- Sources: [AGENTS.md guide (2026)](https://codersera.com/blog/agents-md-complete-guide-2026/),
  [morphllm spec summary](https://www.morphllm.com/agents-md-guide),
  [Agentic AI Foundation standards overview](https://intuitionlabs.ai/pdfs/agentic-ai-foundation-guide-to-open-standards-for-ai-agents.pdf).
- One cited 2026 study of Codex across 124 PRs found the presence of an `AGENTS.md` correlated with
  **lower median runtime and lower output-token use** at comparable task completion. Treat the exact
  numbers with suspicion (single vendor, single tool), but the direction is the useful part: telling an
  agent the rules up front is cheaper than letting it discover them.

**Judgement:** this is the right hook, and it is the only hook that is honoured by all four of the tools
in rotation. It is not *sufficient* — an instruction file is read, not enforced — so the instruction it
contains has to be a single command that is obviously cheaper than asking the human. If catching up costs
one line, it gets used. That is a design constraint, not a hope.

**Local caveat found in this workspace:** several projects already carry a `gemini.md` and a `CLAUDE.md`
(and Routepilot has `AGENTS.md` too). Antigravity/Gemini reads `GEMINI.md`, Claude Code reads
`CLAUDE.md`. So the portable install is: `AGENTS.md` as the real content, and a one-line pointer added to
whichever vendor files already exist. Three files, one source of truth, no drift — the pointers contain
no content of their own.

---

## 3. How do others model a human decision point?

Found it, and it is worth reusing verbatim. LangChain's Agent Inbox settled on this
([schema source](https://github.com/langchain-ai/agent-inbox/blob/main/README.md)):

```python
class HumanInterruptConfig(TypedDict):
    allow_ignore: bool
    allow_respond: bool
    allow_edit: bool
    allow_accept: bool

class HumanResponse(TypedDict):
    type: Literal['accept', 'ignore', 'response', 'edit']
    args: Union[None, str, ActionRequest]
```

Four response types: **accept, edit, response, ignore.** The important design insight is not the words,
it is that *the agent declares in advance which responses are legal for this particular question.* A
question that can only be accepted or ignored renders as two buttons. One that needs a value renders a
text field. The human never has to work out what kind of answer is wanted, because the shape of the
question already says.

**What I am taking:** the "agent declares the legal responses" idea, and three of the four types.
**Where I am deviating, deliberately:** `edit` assumes the agent proposed a structured tool call to be
amended, which does not apply here. Replaced with **`choose`** — pick one of N labelled options — because
that is the actual shape of the decisions in this brief ("which of these approaches", "which name",
"should this be A or B"). So the vocabulary becomes:

- **`accept`** — do the thing you proposed
- **`choose`** — one of these N options
- **`respond`** — here is a value/some text
- **`ignore`** — not now, stop asking

**And one addition that neither Agent Inbox nor any tracker has:** a question may carry a
**`default_if_no_answer` plus a deadline**. If the human does not answer in time, the agent is authorised
to proceed with a stated fallback rather than guessing or stalling. This directly attacks the brief's
"it either guesses or it stalls, and both are expensive" — it converts an unbounded stall into a bounded
one with a pre-approved outcome. It is the single most valuable idea in this document.

---

## 4. How does an agent reach a remote service portably?

**MCP — and the most important finding in this section is a warning about timing.**

- The current specification is **2026-07-28**. That is *yesterday*.
  <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- It is the largest revision since launch, and it is **breaking**:
  - the `initialize`/`initialized` handshake and the `Mcp-Session-Id` header are **retired** — the
    protocol core is now stateless
  - server→client requests move to **Multi Round-Trip Requests** instead of bidirectional streams
  - **Roots, Sampling and Logging are deprecated**
  - the **legacy HTTP+SSE transport is officially deprecated**
  - `Mcp-Method` is now required on every Streamable HTTP request; `Mcp-Name` on `tools/call`,
    `resources/read` and `prompts/get`
  - **RFC 7591 Dynamic Client Registration is deprecated** in favour of Client ID Metadata Documents
    ([Stack Overflow Blog on MCP auth, 21 Jan 2026](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/))
  - a formal deprecation policy now guarantees a **12-month minimum window**
- Tier-1 SDKs (TypeScript, Python, Go, C#) support it immediately; Rust is in beta.
- Also see [4sysops, 28 Jul 2026](https://4sysops.com/archives/2026-07-28-model-context-protocol-mcp-stateless-multi-round-trip-routable-headers-authorization-hardening/)
  and the [official changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).

**Judgement, and it contradicts the instinct in the brief.** The brief suggests MCP might be the portable
way in, and asks whether "a plain HTTP call that works everywhere may well beat an elegant integration
that works in one tool". It does — and right now it beats it by more than usual. Building an MCP server
this week means implementing against a spec whose ink is wet, whose clients have not all migrated, and
whose transport story just changed underneath everyone. The migration window is twelve months; there is
no rush and no benefit to being early.

**So: plain HTTPS + JSON is the primary interface, and one shell command is the primary hook.** Every
agent in the rotation can run a shell command and every one of them can `curl`. That is a hundred percent
compatibility today with zero spec risk. An MCP server is a thin wrapper to add later if it ever earns
its place — the HTTP API is what it would wrap anyway, so nothing is wasted.

---

## 5. Single-user auth that is not irritating

Requirement: locked to one person, openable on a phone without typing a password.

Made much easier by a decision taken during this session: **the hub will never store a secret value.**
Tasks say *where* to get a key and *where* to paste it; they never contain the key. That lowers the value
of the target from "credential store" to "my own to-do list", which is what makes the simple option
acceptable rather than reckless.

| Option | Verdict |
|--------|---------|
| **Long random token in URL → long-lived `HttpOnly; Secure; SameSite` cookie, saved to home screen** | **Chosen.** Open the link once, ever. No password, no typing, no biometric prompt, no third party, nothing to expire at a bad moment. Cost: the link is the credential, so it must not be pasted anywhere public. Acceptable given no secrets are stored, and the cookie is what actually authenticates after first open. |
| Passkey / WebAuthn | Strictly stronger and genuinely nice on Android. Rejected *for now* as the primary because it is a real chunk of code, needs a fallback path anyway for a lost/reset device, and adds a biometric prompt to a thing I want to open one-handed in two seconds. Documented as the upgrade if the hub ever holds anything sensitive. |
| Cloudflare Access (Zero Trust) | Free tier is generous and the email one-time-PIN flow is solid. Rejected because it puts an interstitial login in front of a page I want to open instantly, and it is a second control plane to maintain. Good answer for a team; overkill for one person. |
| Magic link by email | Same interstitial problem, plus it depends on email delivery at the moment I am in a hurry. |
| Tailscale Funnel / VPN-only | Rejected: makes the hub unreachable exactly when something has gone wrong with the network, which is when I most want it. |

**Android now, possibly iPhone later** (stated this session) is a further argument for the cookie
approach: it is the only option in the table whose behaviour is identical on both platforms and survives
a phone migration with no re-setup beyond opening one link.

---

## 6. Push and one-tap answering

**Telegram Bot API, version 10.2 (14 Jul 2026)** — <https://core.telegram.org/bots/api>.

Why it wins for seam B: `sendMessage` with an `inline_keyboard` puts the question's options directly in
the notification thread as buttons. Tapping one sends a `callback_query` to the webhook and **sends no
message into the chat** — so answering a decision is genuinely one tap with no typing, no app switch and
no page load. `answerCallbackQuery` then shows a confirmation toast, and `editMessageText` rewrites the
original message to show what was chosen, so the thread is a readable history rather than a pile of
stale prompts.

Facts that constrain the implementation, all verified in the API reference:

- **`callback_data` is 1–64 bytes.** A UUID plus an option label does not fit comfortably. Forces short
  ids and short option keys — designed for, not discovered later.
- `setWebhook` accepts a **`secret_token`** (1–256 chars, `A-Za-z0-9_-`) which Telegram then sends in the
  **`X-Telegram-Bot-Api-Secret-Token`** header on every webhook request. This is the mechanism that stops
  anyone who learns the webhook URL from forging answers. It is not optional in this design.
- Webhooks are only delivered to ports **443, 80, 88, 8443**. Vercel is 443, so this is fine.
- `answerCallbackQuery` **must** be called or the client shows a spinner until it times out.

**Terms of service** (checked because it was asked for): personal notification and reminder bots are a
documented, intended use of the platform. The [Bot Developer ToS](https://telegram.org/tos/bot-developers)
and [ToS for Bots](https://telegram.org/tos/bots) prohibit spam, harassment, third-party personal data,
and using the Bot API by proxy to evade moderation. A single-user bot that messages only its own owner
does none of that. No ToS concern.

**iOS/Android note.** Web push was investigated as the alternative and is viable but worse: on iOS the
Push API is only available to a web app **installed to the home screen** via Share → Add to Home Screen,
with no automatic install prompt ([Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications),
[MagicBell, 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)). Safari
18.4 added Declarative Web Push, and from iOS 26 home-screen sites default to opening as web apps, so it
is improving. One correction to a claim that is still repeated widely: **the EU restriction is not real.**
Apple announced it would remove home-screen web apps in the EU for iOS 17.4, then **reversed that in
early March 2024** and web apps and push remain available ([The Register, 2 Mar 2024](https://www.theregister.com/software/2024/03/02/apple-reverses-decision-to-remove-home-screen-web-apps-in-eu/307995)).
Either way, Telegram sidesteps all of it, which is why it is primary and web push is not being built.

---

## 7. What makes tools like this rot — the section that shaped the design most

I looked at two literatures, because the BI one is about tools nobody chose and the personal-informatics
one is about tools people chose for themselves. The second is the closer analogue for one-person
infrastructure.

**Personal informatics — Epstein et al., *Beyond Abandonment to Next Steps*, CHI 2016**
([PDF](https://www.smunson.com/portfolio/projects/lifelogs/life_after_tracking_chi16.pdf),
[ACM](https://dl.acm.org/doi/10.1145/2858036.2858045); 193 surveyed, 12 interviewed). Causes of
abandonment that apply here:

1. **Collection burden exceeded the payoff** — the tool asked for more upkeep than it gave back.
2. **Curiosity was satisfied** — it answered the question it existed to answer, then had no reason to be
   opened again.
3. **Friction in the experience** — frustrating or time-consuming, so not worth it.

See also [Clark, Southerton & Driller, 2024](https://journals.sagepub.com/doi/abs/10.1177/14614448221083992),
whose finding is that discontinuance is rarely a clean stop: use *lapses* and then decays. Which means
the dangerous state is not "deleted", it is "two weeks stale and now lying to you".

**BI dashboards** — the recurring causes, across
[ClicData](https://www.clicdata.com/blog/dashboard-adoption-plan/),
[Stamats](https://www.stamats.com/insights/why-web-analytics-dashboards-fail/) and
[Luzmo's 200-SaaS-leader survey](https://www.luzmo.com/blog/dashboards-dead-dying-or-evolving):

4. **No decision hook** — you look at it, and nothing follows from looking.
5. **No alerts, so it depends on remembering** — "out of sight means out of routine".
6. **Access friction** — clicks, slow loads, repeated logins. Abandonment clusters in *week one*.
7. **The trust gap** — one number that disagrees with what you know poisons confidence in all of it, and
   two sources that disagree poisons both.
8. **It requires leaving your workflow** to go and look.

### What each cause forces in the design

This is the part I want on the record, because "designed against neglect in general" is exactly the
non-answer the brief warned about.

| Cause | Design consequence — non-negotiable |
|-------|-------------------------------------|
| 1. Collection burden | **The human never enters data.** Agents write tasks and questions; the human only ticks and taps. There is no grooming, no backlog triage, no fields to fill. Nothing to tidy means nothing to fall behind on. |
| 2. Curiosity satisfied | The hub is not for insight, it is a **work queue with a clearing state**. It is *supposed* to reach empty. An empty hub is success, not disuse — so "nothing waiting" must be a first-class, pleasant answer rather than an ambiguous blank screen. |
| 3 & 6. Friction, week one | One URL, saved to the home screen, already logged in, no password, and the page must render the whole list in one screen with no navigation. Every extra tap is measured against "would I have just asked the agent instead". |
| 4. No decision hook | Every item is by definition actionable by exactly one person, and each carries a **`verify`** — how you know it worked. Nothing goes in the hub that is not a thing to *do*. This is also why **roadmaps and documentation are banned from it** (per the brief, and I agree): they are things to *read*, and they are the first content to drift. |
| 5. Depends on remembering | **Telegram push is not a nice-to-have, it is the anti-rot mechanism.** The hub does not wait to be visited. It reaches out when something actually needs the human, and stays silent otherwise. Silence has to be trustworthy or the notifications get muted, and a muted channel is a dead hub. |
| 7. Trust gap | One writable store, and **every write is read back from the database and returned to the caller** before anything says "saved" (brief §6). Also why the hub holds no copy of anything that lives in a repo — a second copy that drifts is the trust gap manufactured on purpose. |
| 8. Leaving the workflow | The *agent's* side is one shell command inside the session it is already in — the hub comes to the agent. The human's side is a notification that arrives where they already are. Neither party has to go somewhere and look. |

**The rot risk this design still carries, stated honestly:** it depends on agents actually calling sync,
which depends on `AGENTS.md` being read and the command being cheap. If a future agent skips it, the hub
goes stale and starts lying. Mitigations: sync is one command, the response is small, open items are
returned unconditionally (a lost watermark can never hide work), and every payload is stamped with how
long it has been since the last sync so staleness is visible rather than silent. That last one is the
check that fails loudly instead of quietly.

---

## 8. Hosting and cost, with the point where free stops being true

Decided this session: **Vercel + a free `.vercel.app` URL**, which is the existing stack for every
Next.js project in `d:\Antigravity`.

- **Vercel Hobby is non-commercial only** — an explicit ToS restriction, actively enforced
  (<https://vercel.com/docs/plans/hobby>). A private personal task list with no users, no ads and no
  payments is a reasonable fit for Hobby, but it does support commercial work, and that is a grey area
  I am not going to quietly resolve in my own favour. **Recommendation: deploy it inside the Vercel
  account that is already on Pro.** Pro is priced per seat, not per project, so an extra project on an
  account that already pays costs nothing and removes the ambiguity completely. → *flagged for you in
  DECISION.md.*
- **Database: Neon Postgres, free tier** — 0.5 GB storage, 100 CU-hours/month, up to 100 projects,
  scale-to-zero with wake-on-query. Cold start is a few hundred ms, which is invisible here.
- **Supabase free tier was rejected for a specific reason, not a preference: free projects are paused
  after ~7 days of inactivity**, judged on real database traffic
  ([itpathsolutions](https://www.itpathsolutions.com/supabase-free-tier-limits),
  [simplebackups](https://simplebackups.com/blog/supabase-free-tier-paused)). For a hub that is quiet by
  design and must work the one morning in three weeks that it matters, a 7-day inactivity pause is not a
  quirk — it is the rot failure mode in §7 shipped as a platform feature. The workaround is a keep-alive
  cron, i.e. maintenance, i.e. cause #1. Rejected.
- **Telegram Bot API: free, no quota that a single user can approach.**

**Where free stops being true:** Neon's 0.5 GB and 100 CU-hours are the first limits, and at one human
generating tens of items a day they are roughly three orders of magnitude away. The realistic reasons
this ever costs money are (a) Vercel Pro, which is already being paid for other reasons, and (b) a
provider changing its free tier — Neon is now Databricks-owned, so that is a live possibility rather
than a theoretical one. The mitigation is that the datastore is plain Postgres with a small schema, so
moving it is an afternoon, not a rewrite. **Cloudflare Workers + D1 is the documented escape hatch:**
one account instead of two, no cold start, and a free tier that permits commercial use outright.

---

## 9. Things I learned that contradict the brief

Stated plainly, as asked.

1. **"A mature existing issue tracker might cover most of this for zero build" — it does not, and the
   gap is precisely the part you called most valuable.** No tracker on the market has a
   question-with-tappable-options primitive. Linear's free plan cannot even be driven by an API. The
   previous agent's recommendation to build nothing was reasonable from memory but does not survive
   checking what these products actually expose.
2. **MCP is the wrong thing to build against this week.** The brief treats it as the portable path. Its
   biggest-ever breaking revision shipped on 28 July 2026 — one day before this was written — retiring
   sessions and deprecating the old transport. Your instinct that "a plain HTTP call that works
   everywhere may well beat an elegant integration" is not just defensible, it is currently the
   materially safer engineering call.
3. **"A wall of markdown is measurably worse than a structured task" — I could not find evidence for
   *measurably*, and I think the real mechanism is different.** What makes riff.kitchen's task format
   good is not that it is typed, it is that the schema *forces the writer to answer questions they would
   otherwise skip* — what exact value, where, how does it fail, how do you know it worked. A structured
   schema is a checklist for the agent writing the task, and its benefit lands at write time, not read
   time. That reframing matters: it means the fields should be chosen for what they force an agent to
   think about, not for how they render.
4. **The most valuable primitive is not the catch-up call.** You nominated "one request that tells an
   agent everything that changed". That is necessary and cheap, and I am building it. But a stalled
   decision costs hours or days, while a rebuilt context costs a couple of minutes. **The highest-value
   thing in this document is the timed default on a question** (§3): *"if you have not answered by 09:00,
   I will proceed with option B."* Nothing you listed has this, no product I found has it, and it is what
   turns "the agent stalls while I am asleep" into a bounded, pre-authorised outcome.
5. **Supabase's free tier would have quietly broken this**, and it is the obvious choice given you
   already use it. A hub that is paused after a week of quiet is worse than no hub, because you would
   only discover it on the morning you needed it.
6. **`gh` is not installed on this machine and a third of your project folders are not git repos.** Any
   plan premised on GitHub being the substrate silently drops those projects.

---

# Research, part two: the interface

**Date:** 30 July 2026. Added as a new section rather than folded into the above, because the questions are
different ones and the first pass should stay readable as what was known on 29 July.

## 10. What the interface actually measures, before any opinion about it

Everything in §11–§16 is an argument. This section is not: it is the rendered hub, measured. It comes
first because the previous iteration's two layout bugs were both found by the owner looking at the page
after the suite had gone green, and the honest response to that is to stop leading with reasoning.

Measured with `tests/shoot.mjs` and `tests/measure-layout.mjs` against `tests/fixture.mjs` — 22 tasks
across 4 projects, one of them a 19-step task, plus 4 open decisions, one with 4 options. That fixture is
new; before it, layout was measured against whatever production happened to contain that morning, so no
number was reproducible.

| Measured at 1920x1080, one 19-step task open | Value | Why it matters |
|---|---|---|
| Page height | 6,532px (**6.0 screens**) | 21 tasks and 4 decisions do not fit on a monitor, by a factor of six |
| Task cards whose top is above the fold | **0** | "Your turn" is invisible without scrolling, at every width tested |
| `.asks` width / `.wrap` width | **0.577** | The decisions section — the most important content by the design's own reasoning — has 600px of nothing beside it |
| Expanded card: content width / card width | **0.570** | `grid-column: 1 / -1` widened the card to 1,364px, then `max-width: 760px` emptied it again |
| Buttons on the page | 63, of which **26** are saturated-blue `.primary` | The accent is spent on the most-repeated control |
| `textarea` elements rendered on load | 6 | Every open decision renders a comment box before anyone asks for one |
| CSS rules matching `:focus` | **0** | There is no focus style at all |
| Elements with `role="button"` that are not focusable | **5** | Every project collapse header. It also has no key handler, so it is a button in name only |
| Tab stops before the first task's controls | **18** | Keyboard access to "your turn" costs eighteen presses |
| `.state` save-status elements / ARIA live regions | 27 / **0** | The one message the whole design is built around is never announced |
| Textareas with a real label | **0 of 5** | Placeholder text is not a label |
| `main` landmarks | **0** | — |

Contrast, computed from the rendered colours against WCAG 2.2 AA (4.5:1 for text below 18.66px bold /
24px normal):

| Element | Ratio | Verdict |
|---|---|---|
| `.primary` button label — white on `#4c8dff`, 16px/600 | **3.20** | **fails** — and it is the most prominent control on the page |
| `.kbd-hint` — `#6b7285` on `#241d12`, 12px | **3.47** | **fails** |
| `.pmeta` project count — `#6b7285` on `#0c0e13`, 12.5px | **4.02** | **fails** |
| `.title` 13.99 / `h2` 6.59 / `.why` 5.69 / `.tag` 5.56 / step detail 6.06 | >= 4.5 | passes |

Other widths, same fixture:

| | phone 390 | laptop 1280 | monitor 1920 |
|---|---|---|---|
| Page height, all collapsed | 9,098px | 5,214px | 5,111px |
| Page height, one 19-step task open | 10,932px (13.0 screens) | 6,613px (7.3) | 6,532px (6.0) |
| `.asks` fill of the column | 0.928 | 0.695 | 0.577 |
| Expanded-card content fill | 0.956 | 0.692 | 0.570 |

**What the numbers say that the code review did not.** The dead-column bug was fixed in the task grid and
left standing everywhere else — `.asks` and `.compose` are capped at 820px, and `.card.expanded` re-creates
it inside the card. `npm run prove:layout` passes at 98% because it only ever queries `.pcards > .card`. A
check that looks exactly where the last bug was is the proxy-measurement mistake in a new costume.

Two smaller things found the same way, neither in the brief:

- **`.groups` is a dead class.** `app/components/Board.tsx` renders `<div className="groups">` three times
  and a comment says *"Two or three columns on a wide screen. See .groups."* There is no `.groups` rule in
  `app/globals.css`. The comment describes a rule that was replaced by `.pcards` and never deleted, which
  makes it a comment that actively misleads — the one thing this codebase's comment convention exists to
  prevent.
- **The documented hub URL and the configured one disagree.** `README.md` and `docs/ENVIRONMENT.md` both
  name `command-center-beta-pied.vercel.app`; `CC_PUBLIC_URL` and the UI brief say `needsme.vercel.app`.
  Both alias the same deployment and both return 200, so nothing is broken — but `docs/ENVIRONMENT.md` is
  explicitly the document whose contents cannot be derived from the code, and it is drifting.

## 11. Which CSS primitives are actually safe in July 2026

Checked against the Web Platform Dashboard's API (<https://api.webstatus.dev/v1/features>, the data behind
<https://webstatus.dev>, which is the same `web-features` Baseline dataset MDN and caniuse render), rather
than recalled or taken from a blog. Two of the blog summaries returned by search were wrong in the
direction that matters — both claimed `text-wrap: pretty` reached Baseline in October 2024. It has no
Firefox implementation at all.

Baseline **widely available** (in every engine for 30 months or more — the bar for anything load-bearing):

| Feature | Widely available since |
|---|---|
| Container queries | 2025-08-14 |
| Subgrid | 2026-03-15 |
| `:has()` | **2026-06-19** — five weeks ago |
| CSS nesting | 2026-06-11 |
| Cascade layers | 2024-09-14 |
| `color-mix()`, Oklab/OkLCh | 2025-11-09 |
| `dialog`, `:focus-visible`, `inert` | 2024-09-14 or earlier |

Baseline **newly available** (all engines, but recently — safe as progressive enhancement, not as the thing
the layout stands on):

| Feature | Newly available since |
|---|---|
| Same-document view transitions | 2025-10-14 (Firefox 144) |
| `@scope` | 2025-12-12 |
| `content-visibility` | 2025-09-15 |
| `text-wrap: balance` | 2024-05-13 |
| `@starting-style` | 2024-08-06 |
| Popover | 2025-01-27 |
| `field-sizing` | **2026-06-16** (Firefox 152) |
| Container **style** queries | 2026-05-19 |
| `scrollbar-gutter` | 2024-12-11 |

Baseline **limited** — no second engine. Rejected for anything the layout depends on:

| Feature | Missing |
|---|---|
| `text-wrap: pretty` | Firefox |
| Scroll-driven animations | Firefox |
| Anchor positioning | Firefox |
| Cross-document view transitions | Firefox |
| `interpolate-size` / `calc-size()` | Firefox **and** Safari — Chromium only |
| `text-box-trim` | Firefox |

**What this means for the expanded-card problem specifically.** The brief suggests some of these would
solve it better than a grid-column span. Mostly they would not, and it is worth saying why rather than
trying them: `interpolate-size` (animating to `height: auto`) is Chromium-only; scroll-driven animation is
the wrong tool; anchor positioning tethers a floating element, it does not reflow a queue. The two that
*are* safe and *are* relevant are **container queries** — so a card lays itself out from its own width
rather than the viewport's, which is what makes one component correct both in a 340px column and in a
700px pane — and **subgrid**, so rows in a list share column tracks instead of each card guessing. Neither
fixes "nineteen steps in a 340px column", because that is not a styling problem. Nineteen steps do not
belong in a tile at all.

`interpolate-size` being Chromium-only settles a smaller question too: there is no cross-browser way to
animate a disclosure open, so the honest answer is not to animate it.

## 12. Dense interfaces, as practised rather than as blogged

Search on this topic returns mostly listicles with invented statistics — several cited percentage
improvements to "cognitive load" with no study attached. Ignored. Two primary sources were worth reading.

**Linear's interface refresh, 12 March 2026**
(<https://linear.app/now/behind-the-latest-design-refresh>). Concrete and current, from the team whose
product is the nearest thing to this one. What they actually changed: the sidebar made *dimmer*; the tab
bar made compact rather than full-width; icon count and icon size reduced; coloured team-icon backgrounds
removed; the dark palette moved from a cool blue-grey to a **warmer, less saturated** grey; separators
reduced in number, and the survivors softened. Their two stated principles:

> "Don't compete for attention you haven't earned."
>
> "Structure should be felt, not seen."

Both indict the current hub directly. Twenty-six saturated blue buttons are the loudest thing on a page
whose most expensive content is the four decisions above them, and every card carries a full border *plus*
a coloured left edge *plus* a background change — three separators doing one separator's job.

The earlier post (<https://linear.app/now/how-we-redesigned-the-linear-ui>) is mostly process, with one
transferable point: they worked *by view type* — list, board, split, fullscreen — checking each decision
against all of them rather than designing one and scaling it. That is the same finding as
`docs/DECISION.md`'s "two real layouts, not one stretched", arrived at independently.

**Radix Colors' 12-step scale**
(<https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>). Not proposed as a
dependency — the value is the *method*, which is a set of fixed roles: 1-2 backgrounds, 3-5 component
normal/hover/pressed, 6-8 borders (non-interactive / interactive / focus ring), 9-10 solid fills, 11
low-contrast text, 12 high-contrast text. The current palette has eleven variables with no role
discipline, so `--dim` does duty as section headings, meta lines, quiet button labels and footer text, and
there is nothing between `--line` and `--accent` to make a focus ring out of. Adopting the *roles* costs
nothing and is the difference between a palette and a list of colours.

## 13. Should the stack change? No, and this is the strongest evidence against it

The brief permits Tailwind or shadcn/ui if the case is made. The case runs the other way, and §7's cause #1
— the tool asking for more upkeep than it gives back — is the reason.

- **Tailwind v4 is a ground-up rewrite of v3.** The upgrade moves configuration out of `tailwind.config.js`
  into CSS `@theme`, replaces the `@tailwind` directives with `@import "tailwindcss"`, swaps the PostCSS
  plugin for `@tailwindcss/postcss`, and removes legacy class names (`bg-gradient-to-r`, `flex-shrink-0`,
  `overflow-ellipsis`). There is an official codemod, which is itself the tell
  (<https://tailwindcss.com/docs/upgrade-guide>). That is one major version. This hub has to survive being
  ignored for six months.
- **There is a live Next.js 16 + Tailwind v4 integration bug**: Turbopack's watcher misses `.tsx` changes
  unless `@source` boundaries are declared explicitly in the CSS entry point
  (<https://github.com/tailwindlabs/tailwindcss/discussions/20006>).
- **shadcn/ui requires Tailwind**, so it inherits all of the above, and it churns on its own schedule —
  February 2026 migrated every component from the `@radix-ui/react-*` packages to a unified `radix-ui`
  package (<https://ui.shadcn.com/docs/changelog/2026-02-radix-ui>).
- **React's `ViewTransition` component is still `unstable_`/canary-only** and needs
  `experimental.viewTransition` in `next.config`. The stable path is the browser's own
  `document.startViewTransition`. Rejected the React component; kept the browser API as an optional
  enhancement.

Against that: everything this interface needs — container queries, subgrid, `:has()`, nesting, cascade
layers, `color-mix()` — is Baseline **widely available** and has no upgrade path, because there is nothing
to upgrade. One CSS file with no build step cannot break when a dependency ships a major version.

**Conclusion: no new dependency.** `package.json` stays at four runtime dependencies. The one idea worth
importing from the framework world is *organisation* — cascade layers, so the phone-base /
desktop-override structure is declared rather than implied by source order.

## 14. Is a dashboard the right answer? Partly, and the distinction is precise

The owner wants "project statistics and analytics, roadmaps and who knows what", and a main screen that
"quickly shows all the needed information with a possibility to click and get to things easily". §7 found
that dashboards die when they become somewhere you look rather than somewhere you act. Both can be true,
and the resolution is a distinction rather than a compromise.

New evidence, unusually direct: **Stahlman, Yanovitzky & Kim, "Design, Application, and Actionability of US
Public Health Data Dashboards: Scoping Review", *JMIR* 2025;27:e65283**
(<https://doi.org/10.2196/65283>) — 89 dashboards reviewed. **Only 47% (42/89) were still active** at the
time of review. 51% had no impact evaluation of any kind. Actionability, where they looked for it, was
mostly absent: 22% offered anything predictive, 27% allowed disaggregation, under 15% let a user explore
context. The authors conclude that actionability is "poorly defined and insufficiently developed" and is
not a property that can be added to a finished dashboard.

A 53% mortality rate among professionally built, funded dashboards is §7's abandonment finding again, with
a number on it. So:

**What is refused.** A screen of numbers to look at. Charts of throughput. Anything with the word roadmap
on it — that is hard constraint 5, and it is also the first content to drift.

**What is allowed, and is genuinely what he asked for.** Summary figures that are *controls*: the counts at
the top of the page become the way you filter and jump, not a readout you read and then scroll past. A
count that does nothing when clicked is a decoration; the same count as a filter is navigation. Everything
displayed stays computed from live rows at render time — the `app/setup/page.tsx` rule — so there is no
second copy to drift from.

The test to apply to any future addition, stated so it can be applied without me: **if clicking it does
nothing, it does not go on the page.**

## 15. Accessibility, framed as speed rather than compliance

WCAG 2.2 has been the W3C Recommendation since 5 October 2023 (<https://www.w3.org/TR/WCAG22/>) and is
still current. WCAG 3.0 — which would replace the contrast formula with APCA and score light-on-dark
differently from dark-on-light — remains a working draft. So the standard to measure against today is
WCAG 2.2's 4.5:1 / 3:1, which is what §10's table uses. Three elements fail it, one of them the primary
button.

The part that matters more here has nothing to do with compliance. There is one user, at a desk, with an
AI chat open beside the hub. The measured cost of that today is 18 tab stops to reach the first task, 5
controls a keyboard cannot reach at all, and no focus indicator anywhere — so keyboard use is not slow,
it is impossible. Fixing it is a speed feature that happens to also be the standard.

The save-state line is the other one. Hard constraints 1 and 2 exist because a write that lied cost real
data, and the UI's answer is a `.state` line that says "Saved" or prints the server's actual reason. There
are 27 of them and not one is in a live region, so the message the whole design is built around is the
message least likely to be noticed. `role="status"` on it is two attributes.

## 16. What I rejected, and why

| Rejected | Reason |
|---|---|
| Tailwind / shadcn/ui | §13. A major version that was a rewrite, against a tool that must survive neglect. |
| React `ViewTransition` component | Canary-only, behind an experimental Next flag. |
| Cross-document view transitions, scroll-driven animation, anchor positioning, `text-wrap: pretty` | Baseline **limited** — no Firefox. §11. |
| `interpolate-size` / `calc-size()` to animate disclosure | Chromium only. There is no cross-browser way to do it, so it should not be done. |
| Container queries *as the fix* for the expanded card | They make a card correct at any width; they do not make a 19-step task belong in a tile. Right tool, wrong problem. §11. |
| A statistics or analytics screen | §14. 53% of the studied dashboards were already dead. |
| Auto-refresh, even "only when idle" | Hard constraint 7. §10 also shows the page is six screens tall, so anything that reorders under a pointer is worse here, not better. |
| An icon set | Linear's March 2026 change was to use *fewer* icons, and smaller ones. A dependency added in order to add noise is two mistakes. |
| Optimistic UI of any kind | Hard constraint 1. Not negotiable, not revisited. |

---

# Research, part three: progress, rewards, and whether a reward can be true

**Date:** 30 July 2026. Added as a third section for the same reason part two was added separately: the
questions are different ones, and parts one and two should stay readable as what was known when they were
written.

The brief for this part asks for a reward system — "levels, achievement badges and other cool perks". The
honest answer is that **the literature is more hostile to that specific list than the brief expects**, and
the hostile findings are the useful ones, so they lead.

Where a source is a vendor blog or a press summary rather than a study, it says so. That distinction is
load-bearing here: this topic has a large volume of writing with confident percentages and no study
attached, and §12 already recorded getting burned by two of them.

## 17. What the data can actually support — measured before any opinion about it

Following part two's convention: the measurement comes first, because it constrains everything after it.

Queried against the Neon `dev` branch on 30 July 2026 (production's connection string is not on this
machine — `docs/ENVIRONMENT.md`), plus reading the schema:

| Fact | Value | Consequence |
|---|---|---|
| `events` rows present | **31**, `seq` 612–642 | The append-only log has been truncated by earlier proof runs. `seq` starts at 612, so ~611 rows are gone. |
| `events` time span | 35 **seconds** (all 30 Jul 2026, 02:59) | There is no event history. None. |
| `tasks.done_at` | one `timestamptz`, cleared on re-open | The only completion timestamp, and it is the *current* truth. |
| Anything recording a re-open | **nothing** | No `reopened_at`, no completion count, no history table. |

**This produces the single most important architectural finding in this document, and it inverts the
obvious approach.**

The obvious source for "what have I done, over time" is the `events` table: it is append-only, it has a
monotonic `seq`, it carries `at`, and `task.done` is one of its kinds. It is *the wrong source*, for two
independent reasons:

1. **Append-only means credit cannot be taken back.** A task completed, re-opened, and left open still has
   its `task.done` event. A timeline built from `events` would count it forever. That is precisely the lie
   the brief forbids, and it arrives by choosing the most natural-looking table.
2. **The log is not a record.** 31 rows spanning 35 seconds. Whatever happened before 30 July is gone.

So: **every progress figure is derived from `tasks.done_at` and `questions.answered_at`, and never from
`events`.** `done_at` is set on each completion and cleared on re-open (`setTaskStatus` in `lib/store.ts`),
which means a query over it is automatically reversible — re-opening a task removes it from the count, the
timeline and any achievement, with no extra code, because the row simply no longer matches. The correction
is structural rather than remembered.

Two smaller findings from the same look:

- **`unblocks` is not a field.** The brief says tasks carry an `unblocks` field "folded into `why`". Checked:
  there is no such field in `lib/types.ts`, the schema, or the API. `why` is free prose that *sometimes*
  contains a number ("Unblocks 2,849 pins."). **Parsing a number out of prose to display as a figure would
  be manufacturing a statistic**, and it would be wrong the first time an agent writes "Unblocks the
  Pinterest queue" with no number. The correct move is to display the agent's own sentence verbatim as what
  became true — true by construction, because it is quoted, not computed.
- **`minutes` is an agent's estimate, not a measurement.** Summing it gives a plausible "time this saved
  you" figure that is not a fact. If it is shown at all it must be labelled as the estimate it is.

## 18. Streaks — the evidence, and the conclusion

**Conclusion first: no streak. Not a lenient one, not one with freezes.** The reasoning follows, because
"everyone does streaks" is not a reason and neither is "I don't like them".

### The one study that settles it

**Silverman, J., & Barasch, A. (2023). "On or Off Track: How (Broken) Streaks Affect Consumer Decisions."
*Journal of Consumer Research* 49(6), 1095–1117.**
<https://doi.org/10.1093/jcr/ucac029> · [abstract](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)
· [plain-language summary, INSEAD Knowledge](https://knowledge.insead.edu/marketing/consumer-streaks-are-motivating-key-keeping-them-alive)

Seven studies, over 4,000 participants, across fitness, language learning and games, plus a university
fitness programme. A streak is defined as a behaviour logged three or more times consecutively.

The finding that matters is not "broken streaks demotivate" — it is **what** demotivates. In the
strength-exercise study, participants whose log *displayed* an intact streak continued at **66.23%**;
participants with **identical actual behaviour** whose log displayed a broken streak continued at
**57.86%**. The behaviour was the same. The display was different. The display cost 8.4 percentage points
of continuation.

Two moderators, both of which point the same way for this hub:

- The effect was **stronger when the person felt responsible for the break.**
- The effect was **weaker when a repair opportunity was offered.**

### Why that is decisive here rather than merely relevant

The hub's activity is **not under his control.** He does not decide when work arrives; fifteen projects'
agents do. A week with nothing in it can mean *nobody filed anything*, or *everything filed was blocked on
Instacart's approval email*. A streak counter cannot tell those apart from "you did nothing", and it would
display the same broken streak either way.

So a streak here would be a display that (a) demotivates by its own presence when broken, per the study
above, (b) breaks for reasons that are frequently not his doing, and (c) since he *knows* the absences are
often not his fault, would fail the truth test on its face — which by the brief's own argument turns the
whole surface into decoration.

The repair moderator does not rescue it. A repair mechanism implies there was something to repair, which
concedes the premise that absence is failure. **The brief's hard constraint 6 says an empty queue is
success.** A streak says an empty week is failure. Those cannot both be on the same screen.

### What I read and did not use

- **Duolingo streak-freeze figures** ("reduced churn by 21% for at-risk users", "7+ day streaks retain at
  2.4×", "two freezes beat one, three ≈ two") circulate widely across product blogs
  ([StriveCloud](https://www.strivecloud.io/duolingo-gamification-explained),
  [Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks)). **I could not trace
  any of them to a published study or to a first-party Duolingo research post.** Treated as unverified
  vendor/press claims and not used as evidence. They are also all about a *daily learning habit*, which is
  a different behaviour from *external errands that arrive irregularly*.
- **"~40% of users who break a 60+ day streak abandon within two weeks"** and **"only 0.90% of users who
  lose a 2–3 day streak start a new one"** come from
  [Trophy](https://trophy.so/blog/what-happens-when-users-lose-streaks), a company that sells streak
  infrastructure, with no method or sample disclosed. Directionally consistent with Silverman & Barasch;
  cited nowhere as a number.
- **[medRxiv, 26 Dec 2024, "The dark side of streaking: examining the backfire potential of run streaking
  in recreational runners who broke a long-term streak"](https://www.medrxiv.org/content/10.1101/2024.12.26.24319676)**
  — exactly the right shape of study, and I could not read it: medRxiv returns 403 to this tool for both
  the PDF and the abstract page. Recorded as a lead, not as evidence. **If anything in this section is
  worth a second opinion, it is this paper, and someone with a browser should read it.**

### Absence-tolerant designs that exist, as an existence proof rather than as evidence

Apple's Activity rings let awards be **paused for up to 90 days** without breaking
([Apple Support](https://support.apple.com/guide/watch/adjust-your-activity-ring-goals-apd29b30023c/watchos));
[Gentler Streak](https://apps.apple.com/us/app/gentler-streak-fitness-tracker/id1576857102) is an entire
product built on not punishing rest days. Both are design precedent, not findings — noted so it is clear
the alternative is a real category and not something invented here.

**What replaces the streak:** a cumulative total that can only go up when work is actually done, and can go
down only when a completion is undone. It is absence-tolerant by construction — a week of nothing leaves it
exactly where it was, which is the truthful statement about a week in which nothing was asked of him.

## 19. When a reward replaces the reason — and why "levels and badges" as asked for is the wrong build

This is the part of the brief I am contradicting, so it gets the strongest sources.

### The undermining effect

**Deci, E. L., Koestner, R., & Ryan, R. M. (1999). "A meta-analytic review of experiments examining the
effects of extrinsic rewards on intrinsic motivation." *Psychological Bulletin* 125(6), 627–668.**
[PDF](https://home.ubalt.edu/tmitch/642/articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf)

128 experiments. Tangible rewards that are **expected** and **contingent on doing, completing, or
performing well at a task** significantly undermine free-choice intrinsic motivation. Rewards that are
**unexpected**, or **not contingent on the activity**, do not. Verbal/informational feedback generally
*enhances* it.

Read against a points-per-task system: points awarded for completing a task are the textbook
completion-contingent expected tangible reward. That is the configuration with the effect, not a distant
cousin of it.

### And it matters most for exactly this kind of work

**Cerasoli, C. P., Nicklin, J. M., & Ford, M. T. (2014). "Intrinsic Motivation and Extrinsic Incentives
Jointly Predict Performance: A 40-Year Meta-Analysis." *Psychological Bulletin* 140(4), 980–1008.**
[PDF](https://selfdeterminationtheory.org/wp-content/uploads/2017/06/2014_Cerasoli_Intrinsic.pdf) ·
[PubMed](https://pubmed.ncbi.nlm.nih.gov/24491020/)

k = 183, N = 212,468. Intrinsic motivation is a medium-to-strong predictor of performance (ρ = .21–.45),
and — the load-bearing part — **intrinsic motivation predicts *quality* performance better than *quantity*
performance, while incentives do the reverse.** Incentives that are *directly performance-salient* crowd
out intrinsic motivation more than indirectly salient ones.

His tasks are quality-shaped, not quantity-shaped. "Claim the domain", "photograph twelve products",
"register for VAT" — each is done once, correctly or not, and there is no version of the day where doing
more of them faster is the goal. A points score is a quantity incentive pointed at a quality task. It is
aimed at the axis that does not need help.

### The distinction that makes a progress surface safe

**Ryan (1982); summarised in Deci, Olafsen & Ryan (2017), "Self-Determination Theory in Work
Organizations: The State of a Science."**
[PDF](https://www.crforum.co.uk/wp-content/uploads/2025/02/Deci-Olafsen-Ryan-Self-determination-Theory-in-Work-Organizations-The-State-of-a-Science.pdf)
· [Ryan & Deci 2000 overview](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)

The same object can have either of two *functional significances*:

- **Informational** — it tells you about your own competence. Satisfies competence, does not touch
  autonomy. Intrinsic motivation **rises**.
- **Controlling** — it makes you feel pressured to behave a particular way. Frustrates autonomy.
  Intrinsic motivation **falls**.

And critically: competence feedback does not help *unless* it comes with an internal perceived locus of
causality. A number that tells him something true about what he did is informational. The same number
attached to a target he did not set, a level he must reach, or a nudge to keep it up, is controlling.

**This is the whole design rule, and it is testable at the level of individual copy.** "You have finished
23 of these" is informational. "3 more to reach level 4" is controlling. The first is a mirror; the second
is a manager. He already has fifteen projects telling him what to do.

### The direct evidence that badges and levels make it worse over time

**Hanus, M. D., & Fox, J. (2015). "Assessing the effects of gamification in the classroom: A longitudinal
study on intrinsic motivation, social comparison, satisfaction, effort, and academic performance."
*Computers & Education* 80, 152–161.**
[PDF](https://daneshyari.com/article/preview/6835109.pdf) ·
[Semantic Scholar](https://www.semanticscholar.org/paper/dff76a9862467d426113ec530f83942016ae3a97)

Two courses, same curriculum, one with a **leaderboard and badges**. Measured at four points over a
16-week semester. The gamified course showed **less** motivation, satisfaction and empowerment *over time*,
and **lower final exam scores**, with intrinsic motivation mediating the effect on scores.

This is the closest thing in the literature to "we built the thing the brief describes and measured it for
four months". It got worse, not better, and it got worse *with exposure*.

### The mechanic that guarantees a trough

**Kivetz, R., Urminsky, O., & Zheng, Y. (2006). "The Goal-Gradient Hypothesis Resurrected: Purchase
Acceleration, Illusionary Goal Progress, and Customer Retention." *Journal of Marketing Research* 43(1),
39–58.**
[PDF](https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf) ·
[SAGE](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39)

Effort accelerates as a reward threshold approaches — and then **post-reward resetting**: in both the café
loyalty-card field study and the song-rating study, engagement **dropped after the reward was earned** and
only recovered as the next threshold neared.

A level system is a sequence of thresholds, so it is also a sequence of troughs. For a tool used a few
times a week whose whole risk is a lapse that becomes abandonment (§7), manufacturing a predictable
post-reward dip is an odd thing to build on purpose.

### So what is *not* rejected

Nothing above argues against showing him what he has done. It argues against **contingency**: a score he
is working toward, a level that gates something, a badge as payment. The findings are about rewards that
are *expected and contingent*. A truthful account of finished work, computed from the rows, with no target
attached, is informational feedback — the category the same literature says **enhances** intrinsic
motivation.

## 20. What actually motivates this work, according to evidence

If not points, then what. Two findings, and they are unusually well matched to the data already in the hub.

### Progress in meaningful work beats everything else

**Amabile, T. & Kramer, S. (2011). *The Progress Principle*** — built on **~12,000 daily diary entries from
238 people across 7 companies**, one entry per working day for the length of a project.
[Overview](https://www.mindtools.com/arzm8fy/amabile-and-kramers-progress-theory/) ·
[summary](https://www.creativityatwork.com/on-the-power-of-small-wins/)

Of everything that happened on people's best days, one event stood out above all others: **making progress
in meaningful work.** And **28% of incidents with only a minor impact on the project had a major impact on
how people felt about it.**

Two things follow. Small completions genuinely land — the brief's premise is correct. And the word doing
the work is *meaningful*: progress registers when it is progress **on something**, which is an argument for
showing what a completion unblocked rather than that it incremented a counter.

### And knowing what it unblocked is worth more than any counter

**Grant, A. M. (2008). "The significance of task significance: Job performance effects, relational
mechanisms, and boundary conditions." *Journal of Applied Psychology* 93(1), 108–124.**
[PDF](https://selfdeterminationtheory.org/SDT/documents/2008_Grant_JAP_TaskSignificance.pdf) ·
[PubMed](https://pubmed.ncbi.nlm.nih.gov/18211139/) — with the persistence result in **Grant et al. (2007),
*Organizational Behavior and Human Decision Processes***
([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0749597806000641)).

Fundraising callers who spent **ten minutes** with one student who had received a scholarship funded by
their work were measured a month later at **+142% phone time** and **+171% money raised**. Nothing about
the job changed. What changed was that they knew what it was for.

**This is the strongest empirical support in this document for the brief's own aside** — that "this one task
unblocks 2,849 pins" beats any number of points. It is not a nicer framing of the same thing; it is a
different and much larger effect, and the hub already stores the sentence, written by the agent that needed
the task done. The design consequence is to keep and show `why` on completed work, verbatim, rather than
discarding it at the moment it becomes true.

## 21. Abandonment, extended to reward systems

§7 established the general picture (Epstein et al., CHI 2016; Clark, Southerton & Driller, 2024). What is
new for this part:

**Epstein, D., Ping, A., Fogarty, J., & Munson, S. (2015). "A Lived Informatics Model of Personal
Informatics." UbiComp 2015.**
[PDF](https://www.smunson.com/portfolio/projects/lifelogs/livedinformaticsmodel_ubicomp15.pdf)

The finding that changes the design: **lapse-and-resume is the normal shape of self-tracking, not a failure
state.** People lapse by forgetting, by struggling with upkeep, by intentionally skipping, and by
suspending — and then they come back. Permanent abandonment is specifically associated with *loss of
motivation to track*, not with having lapsed.

Which means the design question is not "how do we prevent a gap" — gaps are the expected behaviour of the
system. It is **"what does the surface say to someone returning after three weeks away?"** A streak says
*you failed and lost something*. A cumulative total says *here is everything you have done; it is all still
here*. Given that this hub is *supposed* to be silent when nothing needs him, the second is also the only
one that is true.

Combined with §19's Hanus & Fox result, the compound risk is specific: a reward layer can produce a novelty
spike, a lapse, and then an abandonment that the reward layer itself caused — and the hub would still be
green, because none of that is a failed write.

**One finding that contradicts the simple "novelty wears off" story**, included because it cuts against my
own argument: **Rodrigues et al. (2022), "Gamification suffers from the novelty effect but benefits from
the familiarization effect: findings from a longitudinal study," *International Journal of Educational
Technology in Higher Education* 19:13.**
<https://doi.org/10.1186/s41239-021-00314-6>. Both effects are real and partly cancel; the net was
positive. So "gamification decays" is not a law, and the case against points here rests on
contingency (§19), not on decay.

## 22. Progress surfaces in 2026, and the dashboard question resolved

### Most tracker use is a five-second glance

**Gouveia, R., Pereira, F., Karapanos, E., Munson, S. A., & Hassenzahl, M. (2016). "Exploring the design
space of glanceable feedback for physical activity trackers." UbiComp 2016.**
<https://doi.org/10.1145/2971648.2971754>

**Over 70% of physical-activity-tracker use is glances — sessions of about five seconds** with no further
interaction. Their six design qualities for such feedback include *being actionable* and *acting as a proxy
to further engagement*.

Design consequence, and it is a strong one: **the progress surface must be somewhere he already looks, in a
form readable in five seconds.** A separate page reached by a click is not that, and it is the exact shape
§7's cause 8 (leaving the workflow) and §14's dashboard mortality both warn about. A line at the top of the
hub is.

### The contribution graph is the wrong metaphor here, for a reason specific to this hub

The pattern the brief nominates — a GitHub-style contribution grid — has a documented failure mode:
[criticism collected on Hacker News](https://news.ycombinator.com/item?id=11404482) and
[developer commentary](https://dev.to/sylwia-lask/your-github-contribution-graph-means-absolutely-nothing-and-heres-why-2kjc/comments)
converge on the same point: once the graph is being watched, people **optimise the graph instead of the
work** — empty commits, midnight README edits, streak-maintenance tooling. Goodhart's law with squares.

But the fatal objection here is a truth objection, not a gaming one. **A calendar grid reads as a record of
self-discipline, and this data cannot support that reading.** An empty Tuesday in this hub means one of:
nothing was filed, everything filed was blocked on somebody else, or he did nothing. The grid draws all
three as the same pale square. That is a graph that says something untrue about him, which is the failure
class the brief forbids, arriving through a visualisation rather than through a counter.

If any time-shaped view is built, it must therefore be able to **distinguish "nothing was asked" from "you
did nothing"** — which the hub *can* do, because `tasks.created_at` says when work arrived. A day with no
tasks open is not a gap in effort and must not be drawn as one.

### The dashboard question, resolved

§14 established the rule: *if clicking it does nothing, it does not go on the page* — from Stahlman,
Yanovitzky & Kim, *JMIR* 2025;27:e65283 (89 dashboards, **47% still active**).
Supporting it, [MDPI *Applied Sciences* 15(21):11493, 2025](https://www.mdpi.com/2076-3417/15/21/11493) —
an RCT with **8,745** MOOC learners comparing no dashboard, a dashboard, and a dashboard with actionable
motivationally-framed feedback — found the effect came from the *actionable feedback*, not from the
dashboard.

A progress surface is the hardest case for that rule, because completed work is by definition not
actionable: it is done. The resolution is not to weaken the rule but to notice what a completion still
affords:

1. **It is undoable.** A completed task can be re-opened, which is a real action on a real row — and it is
   also the mechanism by which the count stays honest. So a list of finished work is a list of controls.
2. **It filters.** A project's completion count filters the queue to that project, exactly as the open
   counts already do.
3. **It is glanceable in place.** One truthful line at the top of the page satisfies §22's five-second
   finding without adding a destination.

Anything that fails all three is a readout, and does not go on. That keeps the queue the point.

## 23. What I rejected for this part, and why

| Rejected | Reason |
|---|---|
| **A streak, of any kind** | §18. Silverman & Barasch: the *display* of a broken streak cost 8.4pp of continuation on identical behaviour, worse when the person feels responsible. His absences are frequently not his doing, and hard constraint 6 says an empty queue is success. |
| **Streak freezes / repairs as a fix** | A repair concedes that absence is failure. Also the only figures supporting freezes are untraceable vendor claims (§18). |
| **XP, points, or a score** | §19. Completion-contingent expected tangible reward — the exact configuration in Deci/Koestner/Ryan's 128 experiments. And a quantity incentive on quality-shaped work (Cerasoli). |
| **Levels** | §19. Kivetz: thresholds produce post-reward troughs. A tool whose main risk is a lapse should not schedule its own dips. |
| **Badges as payment for a count** | §19. Hanus & Fox measured badges + leaderboard over 16 weeks and found motivation, satisfaction and empowerment *fell*, with lower scores. |
| **A leaderboard** | One user. Social comparison against nobody is the Hanus & Fox mechanism with none of its upside. |
| **A stored `xp`/`level` column or an `achievements` table** | Brief's hard rule, and §17 gives the mechanism: derive from `done_at` and re-opening reverses itself for free. A stored score needs code to remember to decrement, and that code is the bug. |
| **A completion timeline built from `events`** | §17. Append-only, so credit can never be taken back — and the log has been truncated to 31 rows spanning 35 seconds. |
| **A GitHub-style contribution grid as the centrepiece** | §22. It cannot distinguish "nothing was asked" from "you did nothing", so it draws an untrue claim about him. |
| **A number parsed out of `why`** | §17. `unblocks` is not a field. Extracting "2,849" from prose is manufacturing a statistic; quoting the sentence is not. |
| **A separate `/progress` page as the primary surface** | §22 (70% of use is 5-second glances) and §14 (47% dashboard survival). A destination is the thing that dies. |
| **Notifications about progress** | Telegram's silence is the anti-rot mechanism (§7 cause 5). "You are 3 from a badge" is a controlling message (§19) sent down the one channel that must stay trustworthy. |
| **An unqualified "time saved" figure** | §17. `minutes` is an agent's estimate. Shown at all, it is labelled as an estimate. |

## 24. What I learned that contradicts the brief

As asked, stated plainly.

1. **The reward system he asked for — levels and badges — is the one design the evidence specifically
   argues against, and there is a 16-week measured study of almost exactly it that found motivation *fell*
   (Hanus & Fox 2015).** I am not refusing the ambition; §19's own literature says a truthful, non-contingent
   account of finished work is the category that *helps*. But "points, levels, badges" is not a neutral
   packaging choice, and building it as named would be the version most likely to be dead in six months.
2. **The brief says tasks carry an `unblocks` field. They do not.** There is no such field anywhere in the
   schema, types or API. It is prose inside `why`, sometimes with a number in it. The brief's instinct about
   its value is right — Grant (2008) is a +171% effect — but it has to be shown as a quotation, not computed.
3. **The obvious source for a completion history is the wrong one, and it fails in the brief's own forbidden
   direction.** `events` is append-only, so a timeline built from it cannot take credit back when a task is
   re-opened. The brief warns against a stored score; the same failure hides in a table nobody would think
   of as a score.
4. **The event log is not just thin, it is truncated.** The brief says history "starts around now". Measured:
   `events` holds 31 rows spanning 35 seconds, with `seq` beginning at 612 — about 611 rows deleted. Any
   surface implying a history has essentially nothing to draw from, and the honest label is stronger than
   "since 30 July": it is "since your first completion", stated from the data.
5. **A contribution graph is not the safe alternative to a streak.** The brief nominates it approvingly. It
   has the same defect in quieter form: it renders "nobody asked you to do anything" identically to "you did
   nothing", and he would be reading a judgement the data does not support.
6. **The most-cited numbers on this entire topic do not survive checking.** The Duolingo streak-freeze
   figures and the "40% abandon after a broken streak" statistic are vendor and press claims with no
   traceable method. The one study that does settle the question (Silverman & Barasch, *JCR* 2023) is barely
   mentioned in any of that writing. §12's warning about invented statistics applies to this literature
   more than to the interface one.

---

## 25. What changed after he asked a second time — 30 July 2026, later the same day

§19 above argues against points, levels and badges, with evidence, and §23 lists them as rejected. The owner
read that, saw the record that was built instead, and asked again — explicitly, and for the second time — for
levels, broader achievements, and a profile that is enhanced as he does more.

**That is his decision on his own tool, and it is recorded rather than re-argued.** The evidence in §19 has not
changed and should be read before anyone extends the system: Deci, Koestner & Ryan's 128 experiments on
completion-contingent rewards; Hanus & Fox (2015) measuring badges plus a leaderboard over sixteen weeks and
watching motivation, satisfaction and empowerment all fall; Kivetz et al. (2006) on the drop in effort after
every threshold.

What was never negotiable was not "no levels" — it was "no lies". So the system that was built keeps three
properties that the evidence does not object to and that the founding constraint of this project requires:

1. **Nothing is stored.** Points, level, rank and every mark are derived from `tasks.done_at` and
   `questions.answered_at` on every render. Re-opening a task lowers the score, and can lower the level.
2. **Points may only depend on what HE did.** This ruled out the two most attractive scoring entries —
   "cleared a project" and "the hub reached zero" — because both are functions of how much is currently OPEN,
   so an agent filing a task overnight would have dropped his level. They became marks, reconstructed
   historically so they stay true once new work arrives. This is a finding that came out of building it and is
   not in any of the literature above.
3. **No streak.** §18 stands unchanged and is the one mechanic still refused outright. The `return` category
   pays for closing a gap — "came back after 11 days away" — which is the same measurement with the opposite
   sign, and is the most direct thing in this codebase that the research produced.

One narrowing: the old absolute rule "never state a target" is gone, because he asked to feel progression.
It was replaced by a stricter one that is machine-checkable — **a stated target must be arithmetically true** —
enforced by check P5, which parses the rendered numbers and asserts them against the derivation.

---

# Research, part four: the handoff, the real hub, and what the record got wrong about itself

**Date:** 30 July 2026, later still. Added as a fourth section for the same reason parts two and three were:
the questions are different ones, and the earlier parts should stay readable as what was known when they were
written.

The brief for this part widens the remit to the whole hub and names the under-served half explicitly: *ease his
communication with the AIs*. So the handoff leads, and the measurement of **the real hub** — not the fixture —
leads that, because it turned out to be the finding that reframes everything else.

Convention from part three carries over: where a source is a vendor blog or a press summary rather than a
first-party post or a study, it says so.

## 26. The real hub, measured — and it is not the hub that has been designed

Every layout number in parts two and three was measured against `tests/fixture.mjs`: 22 open tasks across 4
projects, 4 open decisions. The unpushed commit `efb48d3` contains screenshots of **production**
(`tests/shots/live-*.png`). Read side by side, the fixture is not a conservative model of the real hub. It is a
different hub.

| At 1920x1080 | Fixture | **Production** |
|---|---|---|
| Open tasks | 21 actionable + 1 blocked | **11 actionable + 1 blocked** |
| **Open decisions** | 4, one with 4 options | **0** |
| Projects with anything open | 4 | **2** (`riff-kitchen`, `video-presentations`) |
| Finished tasks | 9 | **2** |
| Decisions made | 2 | **5** |
| Points / level | 114 / 3 | **90 / 3**, "70 more to Fixer" |
| Age of the record | since 22 Jul | **since 30 Jul** — i.e. today |
| Space below the last row, monitor | none | **~280px of nothing**, plus the right half of every row |

Four consequences, and they are the most useful things in this document:

1. **The decisions section is empty on the real hub.** The one region the design calls most important, gives the
   only loud colour to, reserves the `--ask` palette for, and caps at `46vh` to protect the queue from — is
   *not on the screen he actually opens*. Four open decisions is the volume every layout threshold was
   calibrated against. His volume is zero. `prove:layout` cannot see this, because the fixture guarantees four.

2. **"About fifteen projects" is not true in the data.** The brief says fifteen; the hub holds two with open
   work. That does not make the breadth marks wrong — `eight-projects` is a statement about a future that may
   arrive — but it does mean the arguments that lean on fifteen (search is needed; breadth is the point) are
   arguments about a hub that does not exist yet, and should be labelled as such rather than presented as
   present-tense needs.

3. ~~**At real volumes the desktop layout is mostly empty**, and that is the dead-column bug in a third
   costume.~~ **This was wrong, and it was corrected by building the thing that could check it.** Written from
   the production screenshots, it read the page ending a third of the way down a monitor as a defect. Once
   `npm run fixture:live` existed and every layout check ran against those volumes, **all of them passed** —
   and rendered, the screen reads as *calm*, not broken. Hard constraint 6 says an empty queue is success; the
   same logic applies to a short one. A queue that does not fill a monitor because there are eleven things to
   do is the hub telling the truth about a light week. What *is* still real: the reading pane overflows at
   1920 even at these volumes, which means that inherited item is a property of the pane's own content and not
   of task volume. Recorded rather than deleted, because a wrong reading corrected by measurement is worth
   more on the record than a tidy document.

4. **The record is one day old.** `min(done_at)` is 30 July because seventeen tasks were migrated at once. So
   the surface honestly reads "2 finished since 30 Jul", which is the correct thing to say and also the least
   motivating possible opening. Any design that leans on accumulated history is designing for a record that
   does not exist yet. The `decisions` figure — 5 — is the larger number, and it is the one the surface
   currently draws smaller.

**And the ordering defect is confirmed by eye, exactly as the brief describes it.** Production renders, in this
order: `3.`, `4.`, `5.`, `8.`, `9.`, `6.`, `7.`, `2.`, `1.`. The agent has encoded an intended sequence in the
title text because the hub sorts by `created_at` and offers nothing else. The hub then renders the workaround
verbatim, so every title on the real hub begins with a number and a full stop and the list is in none of the
orders a reader would expect. This is not a cosmetic problem: a nine-step sequence presented ninth-first is a
sequence the human has to re-derive every time he opens the page.

## 27. Has anyone shipped the primitive? A re-check of DECISION.md's kill condition

`docs/DECISION.md` records the condition under which this project should be deleted: *"a tracker ships 'agent
asks a question with N tappable options, over an API, answerable from the mobile app'."* Re-checked properly,
because it is the one finding that could make everything else moot.

### 27.1 MCP now standardises the primitive — and it is the wrong shape for this problem

**Finding: the question-with-tappable-options primitive is now in the MCP specification, and it does not
replace the hub.** This is the closest anything has come, so it gets the detail.

The current spec (**2026-07-28**) defines **elicitation**
(<https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation>). A server may return an
`InputRequiredResult` containing an `elicitation/create` request. In **form mode** it carries a `message` and a
`requestedSchema`, restricted to a flat object of primitives — and the permitted schemas include a
single-select enum *with display titles*, using `oneOf` with `const` and `title` per entry plus an optional
`default`. That is precisely `options[] { key, label }` plus `default_option`. Multi-select is also specified.
Responses use a **three-action model** — `accept` / `decline` / `cancel` — which maps almost exactly onto this
hub's `accept` / `ignore`, with `cancel` being the case the hub does not model. Clients **MUST** "respect user
privacy and provide clear decline and cancel options" and, for form mode, "allow users to review and modify
their responses before sending".

So the vocabulary argument in §3 is settled by the standards body, and it landed where this hub already was.

**Why it does not close the gap, and this is the load-bearing part.** Elicitation is **synchronous and
in-client**. The flow is `tools/call` → `InputRequiredResult` → *the client renders a form to whoever is
sitting in front of it* → the client retries the call. That means:

- It reaches **the person at the session**, not the person on a phone somewhere else. There is no delivery
  channel and no notification; the MCP client *is* the UI.
- It **blocks the agent's call**. The spec has no deadline, no expiry, and no proceed-anyway. `default` in the
  schema is a *pre-filled form field*, not an authority to act without an answer. There is no timed default,
  which §9.4 already identified as the highest-value idea here.
- It is **per-question, not a queue**. Nothing accumulates, nothing is cross-project, nothing survives the
  session ending.
- Servers **MUST NOT** request sensitive information in form mode. The hub's no-secrets rule is now the
  standard's rule too — worth noting as independent confirmation rather than as news.

**Verdict: the kill condition is not met.** What MCP shipped is the *in-session* version of seam B. The hub's
version is the *asynchronous, absent-human, bounded-wait* version, and those are different problems. The
correct response is not to delete the hub and not to rush an MCP server either — it is to note that the hub's
`options[]`/`default_option` shape is now schema-compatible with an industry standard, which makes a future MCP
wrapper cheaper and makes the existing JSON *more* defensible, not less.

### 27.2 Linear, through July 2026: agents everywhere, still no options-question

Read from the changelog (<https://linear.app/changelog>) and the agent developer docs
(<https://linear.app/developers/agents>), checked 30 July 2026. Linear has moved hard into agents since §1.1:

| Date | What shipped |
|---|---|
| 23 Jul 2026 | Text attribution and agent-assisted editing; author indicators for human vs automation |
| 20 Jul 2026 | **Loops** — recurring work for Linear Agent, on schedules or events |
| 18 Jun 2026 | Agent-assisted project updates ("Write with Agent") |
| 11 Jun 2026 | **Coding sessions in Linear** — Linear Agent writes code using Claude Code and Codex |
| 4 Jun 2026 | Shared skills for Linear Agent |
| 28 May 2026 | Linear Diffs — iterate from the diff surface with a background coding agent |
| 14 May 2026 | Code Intelligence — workspace-wide agent access to codebases |

The Agent Session API models a session's lifecycle and the documented activity type is **`thought`** (an agent
should emit one within 10 seconds to acknowledge a session). **There is no activity type that presents the
human with a set of selectable options, no documented answer-from-mobile path for one, and no timeout or
default-if-unanswered mechanism.** Linear's direction is *agents doing more*, not *agents asking better*.

**Verdict: still no.** §1.1's scoring stands. Worth re-checking in six months as DECISION.md says; the thing to
watch is whether an agent-session activity type ever gains structured options.

### 27.3 The industry's measured direction is FEWER interruptions, not better ones — and this contradicts the brief

**OpenAI, "Auto-review", <https://alignment.openai.com/auto-review/>, 30 April 2026.** First-party, with a
stated method. Auto-review replaces human approval at sandbox boundaries with review by a separate agent. The
measured result: **Codex sessions stop for human approval roughly 200x less often than in manual approval
mode** — the illustrative snapshot is **3 user interruptions across 720 out-of-sandbox actions**, against 720 in
manual mode.

The reasoning matters more than the ratio. They argue that frequent approval prompts *create* security risk,
because "a personal team of expert agents cannot halt production every few minutes, waiting on authorization" —
so users respond by switching to permissive modes or writing over-broad rules rather than absorbing the
interruptions.

**This is the same failure as this hub's rot risk, stated by someone with telemetry.** RESEARCH §7 cause 5 says
Telegram's silence is the anti-rot mechanism and a muted channel is a dead hub. OpenAI measured the
generalisation: a channel that asks too often gets bypassed, and the bypass is worse than the question.

**Where it contradicts the brief.** The brief frames the under-served half as making it easier for him to *send
more* — a better return channel, more ways to tell an agent something. The evidence points the other way: the
highest-value work on the handoff is making **each item worth more and the number of items smaller**. The timed
default is already the best instance of that idea in the codebase and it is the thing to extend, not the
compose box. Concretely: a decision that resolves itself correctly without him is worth more than a decision he
can answer faster.

### 27.4 What Anthropic's own version of the primitive looks like, which is worth stealing from

Not from a search: this is the tool schema this iteration is itself running against, so it is a first-party 2026
design of exactly this primitive, readable in full. Claude Code's `AskUserQuestion` takes 1–4 questions, each
with:

- `question` — the full question, ending in a question mark
- **`header`** — "very short label displayed as a chip/tag (max 12 chars)"
- `options` — 2–4 of `{ label (1–5 words), description, preview? }`; no "Other" option, it is added
  automatically
- `multiSelect` — when the choices are not mutually exclusive
- **`preview`** — per-option content; when any option has one, the UI switches to a **side-by-side layout**,
  vertical option list on the left, preview on the right. Single-select only.

Three ideas the hub does not have, in descending order of value:

1. **`preview`, and the layout switch that comes with it.** The hub's `option.detail` is a sentence under a
   label. A preview is the *artefact* — the mockup, the snippet, the diagram — shown beside the list as focus
   moves. For "which of these three approaches", seeing the thing beats reading about it. This is the single
   most stealable idea found in this research.
2. **`header` as a ≤12-character chip.** The hub renders the project slug in that slot. A short agent-written
   label for *what the decision is about* is cheaper to skim than a full title, which matters for §22's
   five-second glance.
3. **`multiSelect`.** The hub's `choose` is strictly one-of-N. "Which of these should I do" with more than one
   answer currently degrades to `respond` plus prose — the same collapse-to-free-text that §1 rejects every
   tracker for.

Also worth recording: the automatic "Other" option. The hub's equivalent is `respond` alongside `choose`, and it
is present but framed as *"None of these — send what I typed"*, which reads as a rejection of the options rather
than as a normal extra answer.

### 27.5 Searching a task list: no evidence found, so it stays a judgement call

The brief says there is no way to find a task by name and that with fifteen projects it will matter. Looked for
research on the list length at which search earns its place. **Found nothing usable** — the results are
listicles and fuzzy-matching implementation guides (Meilisearch, List.js, uxpatterns.dev), several quoting
threshold values (0.3–0.4) for match looseness with no study behind them.

So the honest position: there is no evidence for a threshold, and §26 measured the real list at **eleven rows
across two projects**, which is well inside the range a human reads. Search is a real need for the
fifteen-project hub and a solution to a problem that does not exist in the current data. Recorded as a
judgement call, not as a finding, and it should be sequenced accordingly.

## 28. Gamification that survived years, and one correction to §18

### 28.1 The 13-year survivor is in exactly this category, and two of its three mechanics are ones to refuse

**Todoist Karma** (<https://www.todoist.com/help/articles/introduction-to-karma-OgWkWy>), shipped 2013 and still
shipping in 2026: points per completed task, named levels from Beginner upward, a Karma Trend line graph, and —
the part that matters — **you lose Karma points for tasks four or more days overdue**, plus a **vacation mode**
that "lets you put your Todoist Karma on hold for as long as you need… You won't break your streak while you
take time off"
(<https://support.todoist.com/hc/en-us/articles/208044525-How-to-turn-on-or-off-vacation-mode-for-Karma->).

This is the best existence proof available that points-and-levels can survive a decade in a personal
productivity tool, which is genuine counter-evidence to a flat reading of §19 and §21. It is also two warnings:

- **The penalty mechanic is the exact thing this hub must never have.** Todoist can dock you for an overdue
  task because *you* set the due date. In this hub an agent files the work, agents decide when it arrives, and
  due dates are banned outright (`AGENTS.md`). A score that falls because something has been sitting is the
  "falls while he sleeps" failure with a calendar attached.
- **Vacation mode exists because the design needed an escape hatch.** A system that punishes absence must ship
  a manual override for absence, and then the human has to remember to toggle it — which is RESEARCH §7 cause
  1, collection burden, arriving as a settings screen. The hub's no-streak rule means it needs no such control.
  That is the cheaper design, and Todoist is the evidence for why.

### 28.2 A correction: §18 was wrong that no first-party Duolingo research post exists — and the post's finding is the best argument yet about thresholds

§18 says of the widely-circulated Duolingo streak figures: *"I could not trace any of them to a published study
or to a first-party Duolingo research post."* **That is wrong.** One exists:
**<https://blog.duolingo.com/improving-the-streak>, 19 November 2020**, describing an A/B test with a stated
method — "separating daily goal and streak versus keeping them combined" — and reporting relative changes over
20 days:

| Measured | Change |
|---|---|
| Day 14 retention | **+3.3%** |
| Daily active learners | +1% |
| Daily learners on a streak | +10.5% |
| New learners on a streak | +19% |
| Daily learners with a 7-day-plus streak, one year on | "just over half", from "about a third" |

The correction is narrow — the *streak-freeze* figures §18 rejected are still untraceable vendor claims, and
Silverman & Barasch is still the study that settles whether to have a streak at all. But "no first-party post
exists" was an overstatement, and it was used to dismiss a body of evidence, so it needed fixing.

**And the post contains the more valuable finding, which is about thresholds rather than streaks.** Making the
streak easier to satisfy — one lesson instead of the full daily goal — moved every engagement metric up, and in
Duolingo's own words *"fewer learners were actually reaching their daily goals without the motivation of the
streak."* The metric improved and the work went down. They chose habit over volume knowingly.

This is Goodhart's law, measured, first-party, on a progression mechanic, with an A/B test. It bears directly on
the open question the brief hands over: **the level curve and the point rates are guesses.** It says the risk in
tuning them is not that they are too slow — it is that a threshold placed where it is easy to reach will be
reached, and reaching it is not the same as the work getting done. §26 gives the number to worry about: at 10
points a task, clearing his **entire** visible queue of 11 tasks is 110 points, which is about one level. The
whole hub, emptied, is worth one rung.

### 28.3 GitHub, March 2026: stored badges are a liability, demonstrated in public

**<https://github.com/orgs/community/discussions/190746>**, and the sibling thread 190723. On **26 March 2026**
achievement badges disappeared from user profiles generally. GitHub staff (`samus-aran`, **27 March 2026**): *"We
have resolved the disappearance of achievements on users' profiles."* In the course of the fix, two experimental
achievements — *Heart On Your Sleeve* and *Open Sourcerer* — were re-enabled broadly by mistake and removed
again roughly an hour or two later; GitHub's stated reason is that they *"were part of an experimental rollout
and weren't meant to be re-enabled broadly."* GitHub has also retired achievements outright before (*Quick
Draw*, *Speedrunner*) and changed how others are calculated.

Recorded because it is this project's founding argument happening to somebody else, in public, with dates: a
platform with a **stored** achievements table awarded badges nobody had earned, then un-awarded them, then had
every badge vanish for a day. `lib/progress.ts`'s rule — definitions in code, state derived by query, a wrong
rule fixed by deploying rather than by migrating a table of things people were told they had earned — is the
design that makes that class of incident impossible rather than merely unlikely.

### 28.4 Duolingo's other 2026 lesson, as a vendor/press claim

Flagged as **not evidence**: press and community coverage reports that Duolingo's **energy system** was disliked
by nearly half of respondents in a poll of 11,000+ users, the common complaint being that it turns learning into
resource management
([Android Authority](https://www.androidauthority.com/duolingo-changes-i-want-to-see-3671847/)); and that a 2026
campaign restored users' longest lost streaks
([ContentGrip](https://www.contentgrip.com/duolingo-streak-revival-campaign/)). No method, no sample frame, so
no number from either is used. The directional point is only that **adding an economy or a currency layer to a
tool is a change people notice and resent**, which is a reason not to give the hub one.

## 29. Platform features, re-checked against the Baseline data rather than recalled

Queried <https://api.webstatus.dev/v1/features> on 30 July 2026 — the same `web-features` dataset behind
webstatus.dev, MDN and caniuse, and the method §11 established.

**Everything §11 rejected is still rejected.** Re-confirmed as Baseline **limited**:

| Feature | Engines | Still missing |
|---|---|---|
| `interpolate-size` / `calc-size()` | Chrome/Edge 129+ | Firefox **and** Safari |
| Anchor positioning | Chrome/Edge (transforms: Chrome 144, 13 Jan 2026) | Firefox and Safari |
| Scroll-driven animations | Chrome/Edge 115+, **Safari 26** | Firefox |
| `text-wrap: pretty` | Chrome/Edge 117+, **Safari 26** | Firefox |

Two of those gained Safari since §11 was written, which is worth knowing but changes nothing: one missing engine
is still one missing engine, and none of them was the right tool anyway (§11, §16).

Also re-confirmed widely available: `:has()` (widely 2026-06-19), Subgrid (2026-03-15), Container queries
(2025-08-14). View transitions remain **newly** available (2025-10-14).

**And §11's "newly available" table has a gap worth filling.** These reached Baseline newly available in 2026 and
are not in it:

| Feature | Newly available |
|---|---|
| `Intl.Locale` info | 2026-07-21 |
| `:open` | 2026-05-11 |
| `contrast-color()` | **2026-04-10** |
| Custom highlights | 2026-03-24 |
| `shape()` | 2026-02-24 |
| Trusted types | 2026-02-24 |
| `field-sizing` | 2026-06-16 *(§11 has this one)* |

**`contrast-color()` is the interesting one, and it must be rejected here for a specific reason.** It picks a
legible foreground for a given background automatically, which is superficially exactly what a palette with 64
asserted contrast pairs wants. It cannot be used for anything load-bearing in this codebase, and not because of
its age: **`npm run prove:palette` computes its 64 pairs from the token values with no browser**, and a colour
the *browser* chooses at paint time has no value to compute from. Adopting it would move those 32 pairs per
theme from "asserted before anything renders" to "only observable if C1 happens to find the element on screen" —
which is the C1-versus-palette division of labour described at the top of `app/globals.css`, thrown away. A
feature that makes contrast automatic at the cost of making it unassertable is a bad trade for this project
specifically.

`:open` is safe and mildly useful (styling a `<details>`/`<dialog>` open state without a class). `field-sizing`
remains the one with real value — an auto-growing textarea in the compose box and the note box, with the current
fixed height as the fallback — and remains progressive enhancement only, at six weeks old.

## 30. What I found wrong that is not in the brief

Stated plainly, as every part of this document has been asked to.

1. **The committed screenshots do not match the fixture the report says they were taken against.** Reproduced:
   loaded `npm run fixture`, queried Postgres directly (`min(done_at)` = **2026-07-22**, two answered decisions
   at +170 min and +4 min from asking), and re-shot. The fresh page reads **114 pts**, **46 more to Fixer**,
   **since 22 Jul**, and carries the cost line *"An agent has been blocked for 11h"*. The committed
   `tests/shots/hub-monitor-1920-viewport.png` reads **118 pts**, **42 more to Fixer**, **since 30 Jul**, and
   *"asked just now"* on both decision cards. The committed images are of the **pre-fix fixture** — the
   flattering one §12 says was repaired — and were never regenerated. So the primary visual evidence for part
   two is of a state the suite can no longer produce, and the cost line the brief lists as a shipped, proven
   feature **has never appeared in any committed screenshot.**

2. **`npm run shots:light` silently overwrites the dark screenshots.** `TAG` in `tests/shoot.mjs` defaults to
   `shot` and is only changed by an explicit `--tag`; `--light` does not affect the filename. Reproduced by
   running `npm run shots` then `npm run shots:light` and reading back
   `tests/shots/shot-monitor-1920-viewport.png` — it is the light theme, in a file named as if it were dark. The
   committed `hub-light-*` files exist only because somebody passed `--tag` by hand, which is not what
   `docs/ENVIRONMENT.md` documents. This is §10's own lesson — *"before the fixture existed they measured
   whatever production happened to contain that morning"* — surviving in the screenshot harness after being
   fixed in the measurement harness.

3. **`tests/shoot.mjs` never loads or verifies the fixture.** It photographs whatever the database happens to
   hold. `prove:layout` was given a fixed fixture precisely so its numbers would be reproducible; the tool whose
   entire job is *looking at it* was left free-running. Findings 1 and 2 are both consequences.

4. **The brief's own counts are off in three places.** `git log origin/master..master` shows **two** unpushed
   commits, not one (`efb48d3`, then the brief itself). `npm run prove:layout` runs **22** checks with **22**
   fault injections, not 24. `npm run prove:use` runs **12**, which the brief has right.

5. **Production is running code one commit behind the fixes that were found by testing production.** `efb48d3` —
   *"Tested on the live hub, and it found three things"* — is unpushed and touches
   `app/components/Progress.tsx` and `lib/progress.ts`. The live `live-*` screenshots show the defect it fixes
   still on screen: *"Worked through a 20-step procedure — 1 to go"*, where the 1 is one more **step**, not one
   more task. So the three things the live hub found are, at the time of writing, still live.

6. **The `46vh` decisions cap truncates a decision option mid-word.** Visible in the fresh monitor capture: the
   fourth option of the second decision, *"Hold the import until the storage review"*, is clipped by the cap
   with its label half-drawn. An option you cannot fully read is an option you cannot choose, on the one card
   the design says matters most. The cap has been re-flagged as unverified three times; it is now measured, and
   the failure is worse than a scrollbar. (It has no effect on the real hub today, which has zero decisions.)

7. **A misplaced doc comment in `lib/progress.ts`.** Two JSDoc blocks sit consecutively around lines 800–813:
   the one describing `breadthReachedAt` ("When the record first reached N distinct projects") is immediately
   followed by the one describing `weeksReachedAt`, so the first is orphaned and the second function carries the
   wrong description. Harmless to execution and exactly the kind of comment drift the codebase's own convention
   exists to prevent — `.groups` in §10 was the same defect.

8. **The Next.js dev-mode indicator is burned into every committed screenshot**, bottom-left, and on the phone
   capture it overlaps real content (it covers part of the first decision option at 390px). It is a dev artefact
   rather than a product defect, but it means the phone evidence has a hole in it at the exact size where space
   is scarcest.

## 31. What I rejected for this part, and why

| Rejected | Reason |
|---|---|
| **Deleting the hub in favour of MCP elicitation** | §27.1. The primitive is standardised but synchronous, in-client, unqueued and has no deadline or proceed-anyway. It solves seam B for a human who is present; the hub exists for one who is not. |
| **Building an MCP server now** | §4's reasoning, unchanged, plus §27.1: the spec's largest breaking revision is two days old. The gain from being schema-*compatible* with `elicitation` is available for free without implementing the protocol. |
| **`contrast-color()`** | §29. It makes contrast automatic at paint time and therefore unassertable by `prove:palette`, which computes all 64 pairs without a browser. Bad trade for this project. |
| **`interpolate-size`, anchor positioning, scroll-driven animation, `text-wrap: pretty`** | §29. Still Baseline limited, re-checked against the dataset, not recalled. |
| **A points penalty for anything sitting unattended** | §28.1. Todoist can dock you because you set the due date; here an agent files the work and due dates are banned. It is "falls while he sleeps" with a calendar. |
| **Vacation mode / any absence toggle** | §28.1. A control that exists to excuse absence concedes absence is failure, and it is a setting to remember — §7 cause 1. The no-streak rule removes the need for it. |
| **A stored achievements table, again** | §28.3. GitHub demonstrated the failure in public in March 2026: badges granted in error, revoked within hours, and every badge missing for a day. |
| **Making the compose box the centrepiece of the handoff work** | §27.3. OpenAI measured 3 interruptions per 720 boundary-crossings under auto-review and argued that frequent prompts get bypassed. Fewer, better-resolved items beats a faster reply box. |
| **Search as an early priority** | §27.5 and §26. No evidence for a length threshold, and the real list is eleven rows across two projects. Real for the fifteen-project hub, not for this one. |
| **Optimising the layout for the fixture's volumes** | §26. The fixture is 21 tasks and 4 decisions; production is 11 and 0. Tuning against the fixture is how the empty-row problem survived three redesigns. |
