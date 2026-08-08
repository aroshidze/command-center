# The plan: make this the best hub in the world

**Date:** 1 August 2026. Written after a session in which he said, three times, that the hub still looked bad and
that I was spending hours on minimal improvements. Both were true. This is the plan that stops that happening.

**How this plan is different from the last one.** The previous plan was organised around *defects I had found*.
This one is organised around *what a person sees, in the order they see it*, and every phase ends in something
visible, pushed. Verification is batched at the end of a phase, not run after every edit — `prove:layout` is 51
seconds and running it 25 times a session is where the hours went.

**Two rules for every phase.** Nothing may become untrue: every figure stays derived, contrast stays measured in
both themes, nothing is clipped without a route to the full thing. And nothing lands unpushed — production
deploys from `master`, so an unpushed commit is a change he cannot see.

---

## Where it stands now

Done in the session before this plan: the ladder no longer ends on day 30; the emblem keeps evolving; the pane
fits; the record has tabs and untruncated rows; the `why` is on every queue row; the type scale has real steps;
project colour is perceptual and carries information; the payload is narrowed; `npm run audit` enumerates
controls, truncations and dead ends.

What is still true: **the interface is competent and not beautiful.** It has one achromatic ramp, almost no
motion, a decision card that has never been designed, and a queue of undifferentiated rows.

---

## Phase A — Finish the foundation

The tokens everything else inherits. Cheapest place to change how the whole thing feels.

| What | Why |
|---|---|
| **Give the neutral ramp a temperature.** Chroma is 0.005–0.009, which is effectively grey. | Surfaces read as absence rather than as material. This is the single largest remaining cause of flatness. |
| **Elevation in the light theme.** `--lift-*` are dark shadows; on a near-white page they are nearly invisible. | The light theme currently has no depth at all — panels are white on white with a hairline. |
| **A real focus ring pass.** It clears 3:1 but is a plain outline. | It is the only affordance a keyboard user gets, and this is a desk tool used beside a chat window. |
| **Motion that means something.** There is a motion layer and one ambient sweep. | Nothing that carries truth may animate — but a row leaving the queue, a figure changing, a panel arriving all can, and that is what makes an interface feel alive rather than redrawn. |

**Gate:** `prove:palette` per increment (2s, no browser) then one full browser pass. C1 both themes. `prefers-reduced-motion` honoured.
**Risk:** the ramp moves all 70 asserted pairs at once.

## Phase B — The decision card

The most expensive object in the hub and the least designed. A blocked agent costs hours; a task costs nothing.

- The card is a beige box with buttons. It should be the most confident thing on the page.
- **The timed default** — "no answer in 6h → 09:00" — is the best idea in the project and renders as a small tag.
- **The cost line** ("An agent has been blocked for 11h") is prose where it could be a figure.
- Options are equal-weight boxes; the agent's recommendation is marked only by a word.
- **Side-by-side comparison** built from `option.detail`, which agents already send. No API change (decided).

**Gate:** L3 must hold at 1280 (six tasks above the fold, and it has ~3 to spare). C1 on the amber surface.
**Note:** his hub has **zero** open decisions, so this is verified against the fixture and the `--live` state cannot show it.

## Phase C — The queue

What he looks at every day.

- Rows carry no state: a blocked row, a row with a note, a nineteen-step row and a one-step row look identical.
- The tick is the primary action and the faintest control on the row.
- "Not yet — waiting on someone else" is a heading over a list with no visual distinction from the live queue.
- The time-filter chips are the only navigation and sit above the list they filter.

**Gate:** L3, L4, L5, K1–K4, and the audit at every width.

## Phase D — Identity and progression

He asked for this twice and it is now correct but not compelling.

- The emblem is decent line art. It could be genuinely good, and it is ~90 lines of geometry with no assets.
- Marks are dated one-liners. 31 definitions, nine categories, four rarity tiers — and rarity is a pip colour.
- The level bar is a bar. The tier pips are new and unproven at high tiers.
- The record's three tabs work; the lists inside them are plain.

**Gate:** `prove:ladder` at 2,000 completions; the emblem bench at every tier in both themes; nothing stored.

## Phase E — Finding things

Deferred earlier on evidence (RESEARCH §27.5: no research supports a threshold, and the real list is 11 rows).
It becomes real the moment the hub holds the fifteen projects it is built for.

- No way to find a task by name.
- No keyboard path except Tab and arrows; 3 keystrokes to the first task.
- A command palette is the obvious answer and also the obvious way to add a dependency — it will be hand-built.

**Gate:** K3 (keystrokes to a task) must not regress. No new dependency.

## Phase F — The record, deeper

- A finished task cannot be opened. Its steps and `verify` are not in the payload any more, deliberately — so
  this needs a read path, and there is no UI read-by-id endpoint today.
- No date grouping, no per-project filter, no search within the record.
- Decisions made show the choice but not the options that were rejected.

**Gate:** P2/P3/P4 hold; the payload does not regrow; every figure still matches Postgres.

## Phase G — Everything that is not the main screen

Never examined in this session, and one of them is the first thing a new device sees.

- `/setup` — never audited, never screenshotted in the new palette.
- The signed-out screen.
- **Telegram messages** — the one-tap loop is the reason this project exists and I have not looked at a single
  message this session. He has asked that it stay professional and precise.
- The refused-write banner.

**Gate:** the audit extended to these routes; `prove` and `prove:negative` green; no progress nudges in Telegram.

## Phase H — Make the evidence machinery cover what it claims

- The audit runs at **1920, dark, localhost** only. It should walk every width, both themes, and `/setup`.
- Nothing measures load time. "Fast" is asserted and never checked.
- `prove:health` still leaks port 3941.
- Screenshot review is manual: 40 images per full run and no way to see what changed between two runs.

**Gate:** the audit is one command covering every state; a load-time figure exists and is recorded.

## Phase I — The thing I cannot do

**No phone or tablet figure has ever been checked on a real device.** Re-flagged six times now, across three
iterations. Every number is Chrome emulation — and this session proved that emulation was wrong about the
pointer for the harness's entire life, which is a reason to trust it *less*, not more.

This needs him to open the hub on his phone and tell me what is wrong. Ten minutes of his time is worth more
than another day of mine.

---

## Order, and why

A → C → B → D → H → F → E → G. Foundation first because everything inherits it. Then the queue, because it is
what he opens. Then decisions, because they are the expensive thing when they exist. Then identity, because he
asked twice. Then the harness, before the long tail. Then the record, finding, and the outlying screens.

Phase I runs in parallel and depends only on him.

---

# Audit of this plan — 1 August 2026

Asked for directly: *"is our plan really the best? do a small audit."* Answered against measured facts rather
than against the assumptions the plan was written on. Five findings; the first is the significant one. The
original phases above are left intact so the change is legible.

## 1. The brief's second stated goal has no phase — it is one bullet in the last one

The brief gave two goals. The first, *motivate him to work more*, is Phase D and he asked for it twice. The
second, **ease his communication with the AIs**, is one line inside Phase G, ordered last of eight. The brief
itself calls it the under-served half.

And it is worse than an ordering mistake, because the surface that exists **makes a claim it never settles.**
Writing a note in the pane returns:

> Saved — the next riff-kitchen agent will read it

That is a statement about the future, in a codebase whose whole ethos is that nothing reports success until it
has been re-read (`writeVerified`), and which refuses optimistic UI on principle. He is told an agent *will*
read it and then never told whether one **did**. There is no list of what he has said, no indication that
anything received it, and one truncated line in the footer.

**The data to settle it is already stored.** A note writes a `note.created` row into `events`, which carries a
monotonic `seq`; `agents` carries `last_cursor`, `last_sync_at` and `sync_count` per agent name. So *"picked up
by claude-code, 4 minutes ago"* is a join, not a feature — derived, nothing new stored, consistent with the rule
that the hub computes rather than records.

One honesty constraint, found by reading `syncFor` rather than assuming: the cursor is set to the **global**
head, not to the highest seq the agent was actually shown, so a project-scoped sync advances past notes for
other projects without ever seeing them. `cursor >= seq` therefore proves delivery **only for unscoped notes**,
which is the default when he writes without choosing a project. For scoped notes it needs the agent's scope
recorded — one nullable column, a fact about what happened rather than a derived score, which is the line the
"never store progress" rule actually draws.

→ **New Phase J, ordered second.** Not last.

## 2. The decision card is over-prioritised. His hub has zero of them

Phase B is third, and the plan's own note admits it: *"his hub has zero open decisions, so this is verified
against the fixture."* Production, measured today: **6 open tasks, 14 finished, 5 decided ever, 0 open
decisions, 3 projects.** Five decisions have existed and all five were answered.

The plan justified the position with *"they are the expensive thing when they exist"* — and "when they exist" is
carrying the whole sentence. Designing the most expensive object in the hub is right; doing it before the two
surfaces he looks at every day, on evidence that he answers decisions promptly already, is not.

→ **Phase B drops behind the queue and identity.** The reasoning that it deserves real design is unchanged.

## 3. Phase H is a phase about test machinery, ordered fifth of eight

He has already said this once, and it is in my memory of it: *tests and docs outweighed product 2:1 and he
noticed*. Phase H is 100% machinery — audit coverage, screenshot diffing, a leaked port — sitting ahead of the
record, finding and every remaining screen.

→ **Dissolved.** Each item moves into the phase whose work it protects, where it costs minutes instead of a
session. One item survives on its own merit: **nothing measures load time**, and "fast" is a product claim made
in the README and checked by nothing. That is not machinery, it is an unverified promise.

## 4. Phase I has been re-flagged six times across three iterations. That is not a plan

*"No phone or tablet figure has ever been checked on a real device"* has been carried, unchanged, as a request
for ten minutes of his time — and he has repeatedly told me to decide things myself instead of handing them
back. Six re-flags is evidence the ask is shaped wrong, not that he is failing to act.

→ **One concrete request, made once, three questions, answerable in a single reply. Nothing waits on it.**
Everything else in the plan proceeds regardless, and the emulation gap stays stated in the report rather than
blocking work.

## 5. The plan is written for a hub with six tasks; he asked what happens at day 300

*"dude, I've been working only 1 day, there will be more tasks every day. what will happen on day 300?"* — the
question that reshaped the scoring ladder, and the plan does not apply it to itself. Phase E (finding a task) is
seventh, deferred on `RESEARCH.md` §27.5: no research supports a search box at eleven rows. That was correct at
eleven rows and it **expires** — at fifteen projects filing daily, the queue is a hundred rows and Tab is the
only path through it.

→ **Phase E keeps its position but gets a trigger instead of an ordinal:** it moves the moment the queue passes
40 open tasks or 8 projects with open work, whichever comes first, and `prove:layout` already prints both
figures every run. A plan item that depends on volume should name the volume.

## Two smaller ones

6. **The earned-empty hub is the payoff of a motivation product and is verified by eye only.** It is his most
   likely daily end state, and `prove:layout` cannot run against it at all — L3 requires six tasks above the
   fold and that state has none. Folded into Phase D, where the reward lives.
7. **Two controls still land identically** — the header's `N done` chip and the pane's `N finished` figure. He
   found four of these himself in twenty seconds; `npm run audit` now prints the last one as a finding on every
   run, and no phase owns fixing it. Folded into Phase F.

## Revised order

**A → J → C → D → B → F → E → G.** Foundation, then the channel back to the agents, then the queue he opens
every day, then the progression he asked for twice, then decisions, then the record, then finding, then the
outlying screens. H is dissolved into all of them; I is one question asked now.

What the audit did **not** change: the two rules (nothing may become untrue, nothing lands unpushed), Phase A
first, and the principle that every phase ends in something visible.

---

# Phase J — The channel back to the agents

The brief's second goal, promoted from a bullet to a phase. It is the half of the loop that has never had any
design at all: fifteen agents can reach him in four ways, and he can reach them with one text box that promises
someone will read it.

| What | Why |
|---|---|
| **Say whether a note was picked up, and by whom.** Derived from `agents.last_cursor` against the note's event `seq`. | The hub currently asserts *"the next agent will read it"* and never settles it. This is the `writeVerified` principle applied to the outbound half. |
| **Show what he has said.** A short list, newest first, project and time, full text on demand. | There is one truncated line in the footer. He cannot see what he told an agent yesterday. |
| **Record the sync scope** so delivery is provable for project-scoped notes too, not just unscoped ones. | Without it the read state is only honest for the default case, and a read state that is sometimes a guess is worse than none. |
| **Make the compose box reachable in one action from the top.** It is below the profile and the record. | It is the only outbound control on the page. |

**Gate:** every claim about delivery provable from a single query — no inference from a cursor that may have
skipped the note; `prove` covers the scoped and unscoped cases and the not-yet-read case; L7 holds (the pane has
0px spare at 1920, so anything added here must pay for itself); C1 both themes.
**Risk:** the honest answer is sometimes *"no agent has synced since you wrote this"*, which looks like a defect
and is the truth. It says so in those words rather than staying silent.
