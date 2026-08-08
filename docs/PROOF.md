# Proof

Recorded 30 July 2026, against the real Neon database over real HTTP. Not a status-code check — every
assertion below reads state back out of the hub and compares it to what was intended.

Reproduce with:

```bash
npm run dev
npm run prove
npm run prove:negative
# then stop the dev server (next dev allows one per directory) and:
npm run prove:health
```

---

## 1. Positive: does it actually work — 24 passed, 0 failed

```
Health and authentication
  ok    health reports ok with every required credential present
  ok    sync with no token is refused
  ok    sync with a wrong token is refused
  ok    the page rejects an unknown enter token

Tasks — handing work to the human
  ok    a task without `verify` is rejected, with a reason that says why
  ok    a well-formed task is created and the stored row matches what was sent
  ok    re-sending the same key updates rather than duplicating

Questions — the decision loop
  ok    asking with options stores the options and the timed default
  ok    a deadline with no default is rejected as pointless
  ok    an option key longer than the Telegram callback budget is rejected
  ok    answering from the page without a session is refused
  ok    answering from the page stores the choice and confirms only after reading it back
  ok    answering the same question twice is refused rather than overwritten
  ok    the agent reads the answer back with one call

The timed default — a decision that resolves itself
  ok    a question past its deadline resolves to its stated default

The human talking back
  ok    ticking a task off stores it, and the agent sees it
  ok    a note from the human is delivered to the next sync

The Telegram one-tap loop (server side)
  ok    the webhook refuses an update with no secret token
  ok    the webhook refuses an update with the wrong secret token
  ok    a tapped button answers the question it belongs to
  ok    a plain message to the bot becomes a note

Cursor semantics
  ok    an up-to-date cursor returns no changes but still returns every open item

Tidying the proof data
  ok    proof tasks are withdrawn so the hub is left clean
  ok    proof questions are closed so the hub is left clean

24 passed, 0 failed
```

## 2. Negative: can the checks fail — 21 passed, 0 failed

This is the half that matters, per brief §6. Each test breaks something on purpose and asserts **both**
that the hub reports failure **and** that the database was left in the state it should be.

```
Preconditions
  ok    fault injection is enabled, so the rest of this file is meaningful

The write verifier — the bug that cost real data
  ok    "swallow-write" is caught and reported as not saved, and leaves the row untouched
  ok    "write-nothing" is caught and reported as not saved, and leaves the row untouched
  ok    "revert-on-reread" is caught and reported as not saved when the read-back disagrees
  ok    a failed answer leaves the question open, so it can still be answered properly

The no-secrets rule
  ok    an OpenAI-style key in a step's copy value is refused
  ok    a GitHub token in a step's copy value is refused
  ok    a Google API key in a step's copy value is refused
  ok    a JWT in a step's copy value is refused
  ok    a Postgres URL with a password in a step's copy value is refused
  ok    an AWS access key id in a step's copy value is refused
  ok    a Telegram bot token in a step's copy value is refused
  ok    ordinary values are still accepted, so the rule is not a blanket refusal

Guardrails on what an agent is allowed to hand over
  ok    a task with no way to verify it is refused
  ok    an agent cannot mark a human task as done
  ok    more than six options is refused, because it is answered on a phone
  ok    a question with options but no way to choose them is refused
  ok    answering with an option that does not exist is refused
  ok    a reply type the asking agent did not allow is refused

The Telegram 64-byte callback budget
  ok    the encoder refuses to build an over-long callback_data

21 passed, 0 failed
```

Two of those deserve calling out because they are the difference between a real check and theatre:

- **"fault injection is enabled, so the rest of this file is meaningful"** runs first and asserts that a
  deliberately sabotaged write *does* fail. Without it, every test below could pass by writing
  successfully, and the suite would report a clean bill of health over a verifier that had been switched
  off. That is exactly the audit-passes-over-broken-system failure named in the brief.
- **"ordinary values are still accepted, so the rule is not a blanket refusal"** proves the secret
  detector is not simply rejecting everything. A rule that refuses all input is as useless as one that
  refuses none, and would quietly train agents to stop using tap-to-copy at all.

## 3. Can the health check go red — 6 passed, 0 failed

A health endpoint is the single most likely thing in any codebase to measure a proxy rather than the
thing itself. So this boots a **second copy of the hub** with `DATABASE_URL` pointed at a valid-looking
but nonexistent host, and checks it says so.

```
Starting a second hub with a deliberately dead database…

  ok    health returns 503, not 200
  ok    ok is false
  ok    the database check is the one that failed
  ok    the credential checks still pass, so the 503 is genuinely about the database
  ok    the page says it cannot be trusted rather than showing an empty list

The health check and the page both fail loudly when the database is gone.
```

The fourth line is deliberate: without it, a 503 could be coming from the missing-credential branch and
the database check might never have run at all. And the last line is the one I care about most — a hub
that renders *"Nothing needs you"* over a dead database is the most dangerous possible failure, because
it looks exactly like success.

---

## What these runs actually caught

Recorded because a proof that never finds anything is not being run properly.

1. **An unhelpful error message.** The over-long option key *was* rejected, but by a generic
   "longer than 12 characters" length check that fired before the one explaining the Telegram 64-byte
   budget. An error that does not explain itself gets worked around instead of understood. Fixed in
   `lib/store.ts` by bounding generously and letting the explanatory regex do the rejecting.

2. **The suite could only pass once.** The second run collided with its own first-run idempotency keys:
   an expected 201 arrived as 200 and eight assertions fell over. A proof that only works on a clean
   database is a coincidence, not a proof — you stop running it, and then it stops telling you anything.
   Both suites now clear their own data first.

3. **A test asserting the wrong thing.** The `revert-on-reread` case asserted "the row is untouched", but
   that fault deliberately lets the write land and lies on the way back — so the row legitimately
   changed. Found by reading the test rather than by running it. The assertion was wrong, not the check:
   what that fault proves is narrower and more important, that a disagreeing read-back is never treated
   as success. Test corrected rather than check loosened.

4. **A credential printed in a stack trace.** A malformed `DATABASE_URL` made the Neon driver throw an
   error containing the entire connection string, password included, into terminal scrollback. `lib/db.ts`
   now diagnoses the common malformed cases itself — pasted variable name, wrapped line, masked password,
   stray quote — and never interpolates the URL into a thrown message.

5. **An orphaned server.** `prove:health` spawns Next through a shell on Windows, so killing the child
   left the real server holding its port and blocking the main dev server, with an error pointing
   somewhere else entirely. Cleanup now kills the process tree.

6. **A false failure on exit.** `process.exit()` while Node's fetch agent still held a socket tripped a
   libuv assertion on Windows, making a script that had printed the correct answer look like it had
   crashed. Exit paths now set `process.exitCode` and let the loop drain.

---

## Later runs, after the audit

Re-run on 30 July 2026 against the Neon **`dev`** branch (see [ENVIRONMENT.md](ENVIRONMENT.md)):

```
prove             27 passed, 0 failed
prove:negative    22 passed, 0 failed
prove:health       6 passed, 0 failed
```

Four further defects were found by auditing the *rendered page* and the *leftover rows* rather than the
code. They are worth recording because three of them were invisible to the test suite, and one was in the
suite itself.

7. **A test that was not testing what it claimed.** The Telegram comment test replied to an invented
   `message_id` matching no question, so it exercised the "any other message becomes a note" branch
   instead — and passed, because it only asserted `HTTP 200`. Four stray notes reading *"second thought"*
   in the real hub gave it away. It now sets a real `tg_message_id`, asserts the webhook reports a comment
   on that specific question, and asserts no loose note was created. **The corrected assertion was then
   verified to discriminate** by replying to a non-matching id and confirming it reports no comment.

8. **A button that silently discarded typed input.** On a task, typing a note and pressing "I've done
   this" removed the card and threw the note away, because the note had its own separate save button. The
   same defect had just been fixed on questions and left in place next door. Done now writes the note
   first and refuses to proceed if it did not store.

9. **Three text inputs with nothing to distinguish them.** A question allowing both `choose` and `respond`
   rendered the comment box, the option buttons and the answer box together, separated only by
   placeholder text.

10. **Test data visible in the real hub.** The footer read *"Last agent sync: prove-script"*, *"Recently
    done: Proof task…"*. Both suites now DELETE their rows rather than closing them and assert zero
    residue — and the real fix, a separate `dev` database branch, was verified by writing a marker through
    the local server and confirming it was **absent** from production's own API.

The pattern in 7–10 is worth naming: **every one was found by looking at the artefact rather than the
code.** The suite was green throughout.

## Still unproven at the time of writing

Stated plainly rather than implied to be done.

- **The real end-to-end tap.** The webhook path is fully proven locally — `prove.mjs` posts the exact
  update shape Telegram sends, with the secret header, and asserts the answer lands in the database. What
  is *not* yet proven is the last hop: a real notification arriving on a real phone and a real thumb
  tapping a real button. That needs two things outside this machine: Vercel Deployment Protection turned
  off for this project (it currently 302s everything to Vercel SSO, so Telegram could never deliver), and
  one message sent to the bot so Telegram permits it to message back.
- **Whether it is actually faster in daily use.** Cannot be tested in an afternoon. The honest measure is
  whether it is still being used in three weeks, and the leading indicator is whether agents keep calling
  `sync` without being reminded.
