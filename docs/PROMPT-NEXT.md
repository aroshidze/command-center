# The prompt for the next iteration

Paste everything below the line into a fresh session in `d:\Antigravity\TheCommandCenter`.

---

Make my Command Center easy for a stranger to set up, without making it one step worse for me.

Read completely before touching anything:

  1. docs/BRIEF-PUBLIC.md   — this is your brief. All of it, including the parts that
                              are recommendations rather than instructions.
  2. docs/HANDOVER.md       — the ground truth this project stands on
  3. AGENTS.md              — the working agreement and the traps
  4. docs/BRIEF-VISUAL.md   — §7 and §8 only: the evidence machinery and the nine traps.
                              The rest of that file is the NEXT job, not this one.
  5. docs/ITERATION-LOG.md  — §XIV to §XIX, the last two days

Five movements, in the brief's order. The first is the one I care about most and it is
the one that is measurably broken today:

  I.   Connecting a project to a hub you already have. Four defects, all measured:
       the sync rule is taught wrong in two places, the doc leads with a command that
       only works on my machine, two file headers describe code that no longer exists,
       and my filesystem layout is hardcoded in five files.
  II.  A machine with nothing on it cannot get the CLI. The brief recommends the hub
       serves it — read that section, then decide for yourself and write down why.
  III. The public-readiness audit. There is real personal data in the repo right now.
       This is the only step here that cannot be undone.
  IV.  The README as a front door for a developer who has never seen this.
  V.   The deploy-your-own path.

The rule that decides every open question: I am the user. Sharing is additive, never a
trade. If something is better for a stranger and one step worse for me, it is wrong.

How this session runs:

  - PLAN FIRST, write the plan into docs/ITERATION-LOG.md, and audit your own plan
    partway through against what you have actually measured. That has been the
    highest-value hour of five separate sessions.
  - Work autonomously and do not stop. Do not report to me between movements. Where a
    choice is genuinely open, take the better one and write the reasoning in the code
    where the decision lives.
  - There is ONE decision you must NOT make for me: §6.3 of the brief, about my own
    words being published. Bring me three options and your recommendation.
  - Verify by reading commands back against the code that implements them. An
    instruction nobody has executed is a guess. Say plainly in the log which steps you
    could not execute yourself.
  - All suites green before every push, every new check with a fault injection, every
    new colour with an asserted contrast pair. The list is in the brief.
  - Push every commit. Production deploys from master. Do not make me ask.
  - ONE AGENT PER WORKING TREE. If `npm run dev` says EADDRINUSE, check whether it is a
    stale server or a live agent before you touch anything — and if the tree is dirty,
    stop and tell me.
  - Do not start the visual work. That is a separate brief and a separate session.

The bar is not "the instructions exist". It is that someone who has never seen this can
follow them from nothing and end up with a working hub — and that I notice no difference
except that the stale parts are gone.
