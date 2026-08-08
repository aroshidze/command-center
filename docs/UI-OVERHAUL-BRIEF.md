# Brief: the UI/UX overhaul

Paste everything below the line into a fresh Opus 5 session with this repo open. It is written to be read
cold — it assumes no memory of how any of this got built.

The report it produces will be audited, so it is asked for specific evidence rather than assurances.

---

You are taking over the interface of a tool that already works. Your job is to make it genuinely
well-designed — beautiful, fast to read, easy to navigate, and properly responsive on every device — without
breaking what it does or what it refuses to do.

**Do not start coding. Research first, then write a detailed plan, then execute it step by step.** The
person you are working for has explicitly asked for that order.

## What this thing is

A personal command centre at <https://needsme.vercel.app>. One human runs about fifteen software projects,
all built with AI coding agents (Claude Code, Codex, Cursor, Antigravity). The hub closes the handoff
between them:

- **agents write tasks** — work only the human can do: an account, a card, a camera, a physical thing
- **agents write questions** — a decision they are blocked on, with 2–4 tappable options and often a timed
  default ("if you have not answered in 12 hours I will proceed with option B")
- **the human ticks and taps**, and can attach a comment to any answer
- **agents catch up with one call**, `cc sync`, which returns everything that changed plus every open item

Read these before anything else, in this order:

1. `README.md` — what it is
2. `docs/ENVIRONMENT.md` — **the live environment. Two databases. Read this or you will write test data
   into the real hub.**
3. `docs/DECISION.md` — why it exists and why it is this shape, including a "Corrections made after real
   use" section listing five things the previous iteration got wrong
4. `docs/RESEARCH.md` §7 — why tools like this get abandoned, and what that forces in the design
5. `AGENTS.md` — the API contract and the codebase conventions
6. `app/globals.css` — the header comment explains the two-layout approach and why sizing keys off pointer
   type rather than viewport width

## Why you are being called in

The interface is functional and plain. It was built by someone optimising for correctness, and it shows:
the visual design is unconsidered, the information hierarchy is thin, and the layout has already produced
two reported bugs. Specifically, and in the owner's words: *"maybe we should do a real UI and UX
enhancement, making it amazingly well-done, responsive, beautiful, easy to read and navigate, and of course
all this optimized on all devices."*

The immediate trigger: opening a task inside a tiled grid rendered nineteen steps into a 340px column with
the rest of the row blank. There is an interim fix (`.card.expanded { grid-column: 1 / -1 }`) — it is a
patch, not a design. You are expected to do better than growing a card in place.

**The surface split matters and was got wrong once already.** The original brief said "I use this on a
phone, one-handed", and the whole layout was built around that. It is the minority case. The truth:

- **Desktop is primary.** He is at his PC while actually doing the assignments, with an AI chat open beside
  the hub.
- **Phone is secondary but real.** Used when out, to check what is going on and answer simple questions.

Both are first-class. Neither is a scaled version of the other.

## Research before designing

He has asked, more than once, that current technology and practice be researched rather than recalled. Do
that properly — the date is late July 2026 and your training data is not.

Worth investigating, and none of it is settled:

- **What good dense-information interfaces look like in 2026.** This is closer to Linear, Height or a
  well-made admin console than to a marketing page. Look at what those actually do about hierarchy,
  density, and reading long structured content on both a monitor and a phone.
- **Current CSS layout primitives.** Container queries, `:has()`, subgrid, `text-wrap: balance/pretty`,
  scroll-driven animation, `@starting-style`, view transitions. Check real support in July 2026 rather than
  assuming, and use what is genuinely safe. Some of these would solve the expanded-card problem far better
  than a grid-column span.
- **Whether the stack should change.** It is currently plain CSS in one file, Next.js 16, React 19, no
  component library. Adding Tailwind or shadcn/ui is *allowed* if you make the case — but read
  `docs/RESEARCH.md` §7 first, because every dependency is a future upgrade and this thing has to survive
  neglect. "It is what everyone uses" is not a case.
- **Accessibility and input.** Real keyboard navigation, focus management, reduced-motion, contrast that
  passes on the dark theme. He is the only user, but keyboard support on a desktop is a speed feature, not
  a compliance box.
- **Whether a dashboard is right at all.** He has said he eventually wants "project statistics and
  analytics, roadmaps and who knows what", and that the main screen should be "a very convenient dashboard
  that quickly shows all the needed information with a possibility to click and get to things easily."
  `docs/RESEARCH.md` §7 found that dashboards die when they become somewhere you *look* rather than
  somewhere you *act*. Both can be true. Resolve it with evidence and say what you concluded.

## Hard constraints — do not break these

These are not style preferences. Each one exists because something went wrong.

1. **Nothing is ever reported as saved until the server has read it back.** Every mutation goes through
   `writeVerified` in `lib/db.ts`; the UI shows "saved" only on `saved: true`. **No optimistic UI, ever.**
   A previous project of his lost hand-entered data to an app that said "saved" over a rejected write.
2. **Failures show the server's actual reason**, not a generic apology. "The write matched zero rows" tells
   him what to do next; "something went wrong" does not.
3. **Do not change the API contracts** in `app/api/agent/*`. Agents in fifteen projects depend on them, and
   `lib/snippet.ts` is served to every project as instructions. Interface work should need no schema change
   at all. If you believe it does, ask first.
4. **The hub stores no secrets.** `lib/store.ts` rejects credential-shaped values. Do not weaken it. It is
   what keeps cookie-based auth proportionate.
5. **No content that also lives in a repo.** No roadmap prose, no pasted documentation. Anything shown must
   be *computed* from live data, never copied — a drifting duplicate is how a tool stops being trusted.
   `app/setup/page.tsx` is the model: everything on it is generated at render time.
6. **An empty hub is success, not disuse.** "Nothing needs you" must read as a good state. It is supposed to
   reach empty.
7. **No auto-refresh that reorders content under the pointer** while he is reading step three of a task.
8. **Do not remove the explanatory comments.** They record why the obvious approach was wrong. They are the
   handover.

## How you must verify — this is the part that gets audited

The previous iteration shipped two layout bugs it had "verified" by grepping the HTML for class names and
reasoning about the CSS. **Class names present is not layout correct.** The owner found both by looking at
the page. Do not repeat that.

- `npm run prove:layout` (`tests/measure-layout.mjs`) drives the Chrome already installed on this machine
  over the DevTools protocol, evaluates real geometry, and asserts on measured numbers at 390 / 1280 /
  1920. **Extend it.** Every layout claim you make must be a measurement.
- **Make each new check fail on purpose and confirm it does, before trusting it.** The first version of the
  column-fill metric divided an absolute X coordinate by a width — different origins — so it passed on any
  layout at all. That is the trap.
- **Screenshot the real thing at real widths** and look at them. Chrome's DevTools protocol will capture
  full-page images; there is a working harness to copy.
- Existing suites must stay green: `npm run prove` (33), `npm run prove:negative` (22),
  `npm run prove:health` (6). If you touch anything server-side, re-run them.
- **Test with realistic data volumes**: one project with 15+ tasks, several projects with 2 each, a task
  with 19 steps, an open question with 4 options, and the empty state. The reported bugs only appeared at
  realistic volumes.

Two environment traps that have already cost time — `docs/ENVIRONMENT.md` has the full list:

- **`npm run dev` talks to a different database than production.** Local is the Neon `dev` branch and is
  empty; the real hub is production. `cc sync` reads production, not your local server.
- **`CC_SUPPRESS_TELEGRAM=yes` must stay in `.env.local`.** Without it, test runs push synthetic
  notifications to his real phone. It happened, a dozen at a time.

## What to produce, in order

1. **A research summary** — what you found, with links and dates, including what you rejected and why. Add
   it to `docs/RESEARCH.md` as a new section rather than rewriting the existing one.
2. **A detailed plan**, written down before you build: the design direction and the reasoning, what changes
   file by file, in what order, and how each step will be verified. Show him the plan.
3. **Execution, step by step**, verifying as you go rather than at the end.
4. **A report** covering, specifically:
   - what you changed and why, with the reasoning behind the design decisions
   - **measured** before/after numbers, not adjectives
   - screenshots at phone, laptop and monitor widths
   - which new checks you added, and **proof that each one fails when the thing it checks is broken**
   - what you chose *not* to do, and why
   - anything you found wrong that was not in this brief
   - anything you are uncertain about, stated plainly rather than smoothed over

## How to work

Take your time; this is worth getting right rather than getting fast. Ask him when a decision is genuinely
his — taste, cost, what he will put up with — and make the routine calls yourself. Where you make a
judgement call, write down why, in the code or the docs.

Be honest in the report. It will be audited by the agent that built this, who knows exactly where the weak
points are and will check the specific claims. A report saying "improved the visual hierarchy" with no
measurement behind it will be treated as unverified, and a check that cannot fail will be treated as worse
than no check.

One last thing, because it is the pattern behind every bug found so far: **every defect in this project was
found by using the thing, not by reading the code or running the suite.** The suite was green throughout.
Open the page. Click the buttons. Look at it on a phone.
