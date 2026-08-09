/**
 * The block that gets written into every project's AGENTS.md — the single source of truth for it.
 *
 * WHY THIS IS A TS MODULE AND NOT A MARKDOWN FILE
 *
 * It used to be `install/AGENTS.snippet.md`, read from disk by a local script. That meant the text only
 * existed on one machine, so the one command an agent needed contained an absolute path to this repo — and
 * a cloud agent, or any agent on another machine, simply could not run it.
 *
 * Compiled in, it is served by the hub at /api/agent/snippet. `cc onboard` fetches it, so onboarding is one
 * command that works from anywhere with no path and no local copy of this repository. It also removes the
 * possibility of the served version and the installed version drifting, which two files guarantees
 * eventually.
 *
 * AGENTS.md is the right target: released Aug 2025, donated to the Agentic AI Foundation under the Linux
 * Foundation in Dec 2025, and read natively by Claude Code, Codex, Cursor, Aider, Devin, Copilot, Gemini
 * CLI, Windsurf and Amazon Q. See docs/RESEARCH.md §2.
 */

export const BEGIN_MARKER = '<!-- BEGIN COMMAND CENTER -->';
export const END_MARKER = '<!-- END COMMAND CENTER -->';

/**
 * One line added to CLAUDE.md / GEMINI.md when they exist. A pointer, never a copy.
 *
 * IT HAS TO CARRY THE MID-SESSION RULE, not just "start every session". This line said only "start every
 * session with cc sync" for as long as it has existed — which is the rule the snippet spends a whole section
 * correcting, because an agent that syncs only at the start acts for the rest of the session on what was true
 * at the beginning of it, and he has to come home and prompt it to find out he already did the thing.
 *
 * It matters more here than anywhere else that got the same correction: this is the ONE line an agent reads
 * before it decides whether to open AGENTS.md at all. A pointer that teaches the short version teaches the
 * short version to everyone who takes the pointer's word for it. Asserted by a check in tests/prove.mjs
 * beside the snippet-coverage one.
 */
export const POINTER =
    'For anything that needs the owner — a task only he can do, or a decision you are blocked on — see ' +
    'the **Command Center** section in `AGENTS.md`. Run `node "$HOME/.command-center/cc.mjs" sync` at the start ' +
    'of every session **and again during it** — he ticks things off while you are working and the hub is ' +
    'the only way he can tell you.';

export function agentsSnippet(slug: string): string {
    return `${BEGIN_MARKER}
## Command Center — the human's queue

There is one hub across all of this person's projects. It is how you hand him work, how you get a decision
without stalling, and how you find out what he did while you were gone.

**Start every session with this. It is one call and it is cheap:**

\`\`\`bash
node "$HOME/.command-center/cc.mjs" sync
\`\`\`

It infers this project (\`${slug}\`) from the folder name and prints the scope it used, so check that. It
returns what he completed, what he answered, anything he wrote you, every question still waiting, and any
question that resolved **by default** because he did not answer in time. Read that last part carefully — it
means a decision was made without him.

### Sync AGAIN during the session. Once at the start is not enough.

He does these tasks away from his desk — on his phone, at a shop, on the way somewhere. He ticks something off
and **has no way to tell you**, because telling you would mean being back at his machine, which is the whole
thing this hub exists to avoid. If you only sync at the start of a session, you spend the rest of it acting on
what was true an hour ago, and he has to come home and prompt you to find out that he already did the thing.

**Sync again at every one of these moments. Not on a timer — at these events:**

1. **Before you tell him you are blocked on him.** This is the one that matters most. If you are about to say
   "I cannot continue until you do X", sync first. He may have done X twenty minutes ago, and the sentence you
   were about to write would be wrong and would make him do it twice.
2. **Before you start work that depends on a task you filed.** Same reason, from the other side. Check it is
   still outstanding before you plan around it being outstanding.
3. **After anything that took real time** — a build, a test run, a deploy, a long tool call. Minutes have
   passed and you have a natural pause; use it.
4. **Before you write your closing summary.** What you tell him at the end should be true when he reads it, and
   he may have finished two of the things you are about to list as waiting.
5. **Before re-asking anything.** A question you already asked may already be answered; re-asking an answered
   \`key\` is refused anyway, so sync and read the answer instead.

The cost is one cheap call that usually returns almost nothing. The cost of not doing it is that he makes a
trip home to tell you something he already told the hub. **That asymmetry is the whole argument** — when in
doubt, sync.

**When a sync shows a task he finished, say so and act on it.** Acknowledge it in your next message — he did
work for you and the only evidence he has that it landed is you noticing. Then do the thing it unblocked; a
completed task nobody acts on is the same waste as one nobody does.

**If the response says \`"more": true\`, sync AGAIN immediately.** The history is paged at 200 events, and
\`more\` means there is a page you have not seen. Loop until it is \`false\`. This matters after a long gap
rather than in normal use — but that is exactly the sync where missing events costs you something, because it
is the one where you do not already know what happened.

### When you need a decision, ask. Do not guess, and do not stall.

\`\`\`bash
node "$HOME/.command-center/cc.mjs" ask '{
  "project": "${slug}",
  "title": "Short question, answerable in one tap",
  "context": "What is blocked and why it matters. Two lines at most.",
  "options": [
    { "key": "reuse", "label": "Reuse the existing bucket", "detail": "No new config.", "recommended": true },
    { "key": "new",   "label": "Create a separate bucket",  "detail": "Cleaner, ~10 min of setup." }
  ],
  "allow": ["choose", "ignore"],
  "default_option": "reuse",
  "hours": 12
}'
\`\`\`

\`default_option\` + \`hours\` is the important part when a fallback is defensible. It means *"if you have not
answered in 12 hours, I will reuse the existing bucket"*, and that is stated to him in the notification. It
turns being blocked into a bounded wait with a pre-approved outcome instead of a guess or a stall.

**He is nudged before that deadline arrives, and the first message tells him when.** A question with a
deadline gets up to two reminders on the way to it — half-way, and at 85% — and the hub says so in the
original message: *"I'll nudge you in 6h (15:00 UTC) and again in 10h (19:12 UTC)."*
A nudge REPLACES the message rather than adding one, so a decision is always exactly one message in
the chat. Windows too short to hold a reminder without crowding get none, and nothing is sent while
he is actively using the hub.

You need to do nothing to get this — there is no field for it. What it changes for you is what a
\`question.reminded\` event in \`changed\` means: he has been nudged and has still not answered, which is a
different situation from a question asked ten minutes ago. If your work can proceed on the stated default,
say so and get on with it; if it cannot, that is a question that should not have had a default.

**THE TEST FOR WHETHER A QUESTION MAY HAVE A DEFAULT AT ALL — apply it every time, and it is not
"is this important?"**

&gt; **If you got it wrong, could you undo it yourself, without telling anyone?**

If yes, set a default. If no, **omit both \`default_option\` and \`hours\`** and the question waits for him for as
long as it takes. That is a supported state, not a degraded one, and there is no penalty for using it.

Reversible, so a default is fine: which of two names, which library, folder layout, whether to add an index,
what to call a column, whether to write the test first. Wrong answers cost you a commit.

**No default, ever, for anything in this list.** Spending his money. Sending anything to a third party — an
email, a message, a form, a webhook, a payment. Publishing, deploying to production, or making something
public. Deleting or overwriting data you cannot restore. Anything touching a real account, a real person, a
legal agreement, or a credential. Anything with a deadline set by somebody other than you. Naming a thing his
users will see. If it appears in that list, a default is not a bounded wait — it is you deciding something
that was explicitly his, and the notification saying so beforehand does not fix it, because the whole premise
of a default is that he might never read it.

"He is probably fine with it" is not the test. "I can put it back" is.

The asymmetry is deliberate: a question with no default costs an agent some waiting, and a default on an
irreversible action costs him something he cannot get back. Wait.

**Write a \`detail\` on every option.** Two or more options carrying one turns the card into a
side-by-side comparison: the details become columns he reads across, and the hub prints them under the
buttons in the Telegram message too. Without them he gets bare labels and has to reconstruct the trade-off you already know.
One clause each, and make them comparable: say the cost and the consequence, not what the option is called
again. "Ready now, mixed lifecycles" against "half a day of plumbing, clean separation" is a decision he can
make in one glance.

**Mark one option \`recommended\`.** It is rendered first, on the hub and in the Telegram keyboard, and badged
as your suggestion. You have the context; saying which way you would go is not overstepping, it is the
difference between asking him to decide and asking him to think it through from scratch.

Asking does not block. Carry on with anything that does not depend on the answer. If you have nothing else
to do, \`cc wait <question-id>\` polls for up to 15 minutes; an expiry is not an error.

\`allow\` values: \`choose\` (options), \`accept\` (one "Go ahead" button), \`respond\` (he types a value),
\`ignore\` (a "Not now" button). Combine them.

**An answer can arrive with a comment attached, and you must treat the comment as part of the answer.**
He can pick an option *and* add "yes, but make sure you also do X". In Telegram he taps first and replies to
the message, so a comment can arrive minutes after the decision as a second event. **A choice plus a
condition is one instruction, not a choice you can act on and a comment you can skim.**

### When only he can do it, make it a task.

\`\`\`bash
node "$HOME/.command-center/cc.mjs" task '{
  "project": "${slug}",
  "key": "claim-domain-pinterest",
  "title": "Claim the domain in Pinterest settings",
  "why": "Unblocks 2,849 pins. Nothing Pinterest can ship until this exists.",
  "minutes": 15,
  "steps": [
    { "do": "Open **pinterest.com/settings/claim**." },
    { "do": "Paste this into the **Website** field:", "copy": "example.com" },
    { "do": "Choose **Add HTML tag**, copy the tag, and send it back to me as a note.",
      "detail": "I will add it to the site — do not edit the code yourself." }
  ],
  "verify": "The settings page shows the domain with a tick and the word Claimed.",
  "gotchas": ["A personal account has no Claim section at all. Check you are on the business profile."]
}'
\`\`\`

Rules that are enforced, so save yourself a round trip:

- **\`verify\` is required.** One line on how he knows it worked without asking you. If you cannot write
  one, the task is not specified well enough to hand over.
- **Never put a secret in \`copy\`.** No API keys, tokens or connection strings — the request is rejected if
  it looks like one, including generic key material with no recognisable prefix. Say *where* the value lives
  instead ("copy it from Vercel → Settings → Environment Variables"). The hub stores no secrets, and that is
  what keeps it safe to open with one tap on a phone.
- **\`key\` makes it idempotent** per project. Send one so a retry updates rather than duplicating. Never
  reuse a key for a different task, and never change one after it has shipped.
- **You cannot mark a task done.** Only he can.
- **To CHANGE a task, POST it again with the same \`key\`.** That is an upsert: same row, same id, and
  his note survives. \`PATCH\` only changes status (\`dropped\`/\`open\`) — it cannot edit content, so
  dropping and recreating throws the task's identity away for nothing.
- **Read one back** with \`GET /api/agent/tasks?id=…\` or \`?project=…&key=…\`. \`sync\` also returns
  each open task's \`note\` in full — that is his reply to you, and it is the field to actually read.
- Steps support \`**bold**\` and \`\`code\`\` only. Name the exact button label.

**Filing a task can ping his phone, and the response tells you whether it did.** \`notified\` is either true
or false, and \`notify_reason\` says why not:

| \`notify_reason\` | What happened |
|---|---|
| \`null\` | A Telegram message went out. He knows. |
| \`burst\` | Another task hit **this project** minutes ago; the first one already told him. |
| \`blocked\` | The task has a \`blocked_reason\`, so he cannot start it. Announcing it would be noise. |
| \`suppressed\` | The rule said yes but the channel is off. |

**Say which one happened.** "Filed, and he has been told" and "filed, but nobody has been alerted" are
different sentences and he acts on them differently. Never say he has been notified when \`notified\` is false.

Editing a task by re-POSTing its \`key\` never notifies — an edit is not an arrival — so do not batch a
burst of unrelated tasks under one key to be polite. File them properly; the burst rule already handles the
politeness.

### Telling him something without being asked

There is no command for this: he writes notes, you read them. Anything he types into the hub or sends the
Telegram bot arrives in your next \`sync\`. A note addressed to this project reaches only this project's
agents; an unaddressed one reaches whoever looks next.

**He can now see whether anything came for what he wrote.** Every note on the hub shows either which agent
synced after it or, in warning colour, *"No agent has synced since you wrote this"*. So an uncollected note is
visible to him as a fact about you, and syncing at the start of a session is the difference between him
believing the channel works and believing it does not. When you do find a note, act on it or answer it — a
note that was collected and ignored is worse than one that was never collected, because the hub told him it
had been picked up.

### Four things he can switch on, and they are OFF unless he asks

These are **opt-in per project and off by default**, and nothing below happens unless somebody runs the
command. A project that runs none of them behaves exactly as this document has described so far. **Do not
turn any of them on unprompted** — the second one in particular changes what a link to the hub can do, and
that is his call rather than yours.

If he asks for any of them, run the command in that project's folder. Each writes hooks into
\`.claude/settings.json\` and **no token goes into that file**, so it is safe to commit. Add \`--dry\` to see
what would change, and \`off\` undoes it.

**1. Can he see what is happening here, and what you said about it?**

\`\`\`bash
node "$HOME/.command-center/cc.mjs" presence on
\`\`\`

Nine hooks, doing three jobs.

**Two are the heartbeat** — one when a session starts, one when it ends — so the hub can say *"nothing has
looked at ${slug} since 28 Jul"* instead of showing an empty queue that looks identical to a dead agent.
They report the project, the git branch and the model. **There is no field for what you are doing, and that
is deliberate:** an agent asked to describe its own state describes it favourably, and one cheerful status
would make every other signal on that page worthless.

**Four record one row per sub-agent** — what was spawned, what it was asked to do, how long it ran and how
it ended — so the project page can show them nested inside the run that spawned them. They are matched to
the Task/Agent tool alone, so **an ordinary Read, Edit or Bash call fires nothing**. That restriction is the
whole reason this is allowed to exist: a session makes hundreds of tool calls, and a hook on every one of
them would be a firehose into the same database your \`sync\` reads.

**Three report what was said.** At the end of every turn, the hub is sent the last thing you actually said —
the harness hands it over, you are not asked to summarise anything. It also gets what he typed, and it gets
told when the harness says you are waiting for a person. Those three make \`/p/${slug}\` a conversation he
can follow from his phone with the laptop shut, and they are why the hub can now tell him *which* agent is
blocked and on what, rather than only that something once ran here.

Two things follow for how you work:

- **Your last paragraph of a turn is read by a human, on a page, later.** It was always worth writing
  clearly; now it is the thing he sees when he opens the project. End a turn with what changed and what is
  next, not with "Done!".
- **Nothing here asks you to grade yourself, and you should not start.** The hub stores quotes with times on
  them. If something is going badly, say so in the ordinary way — in the turn, or better, as a decision he
  can answer.

If he would rather no message text left the machine, \`presence on --no-words\` installs the same hooks and
sends the activity without the words. Everything except the conversation still works.

Without any of it he still gets a rougher version of the presence half from your syncs, so this is an
improvement rather than a prerequisite.

**2. Can he answer a permission prompt from his phone?**

\`\`\`bash
node "$HOME/.command-center/cc.mjs" approvals on
\`\`\`

When a tool call needs permission, the hub messages him with **Allow** and **Deny**, and your tool call
waits. If he answers, you carry on within a few seconds. **If he does not answer within about ten minutes,
you get the ordinary terminal prompt exactly as you do today** — nothing is aborted and nothing hangs
forever.

Three things to know, because they change how you should behave:

- **It costs him nothing to ignore.** So do not narrate the wait, do not ask him twice, and do not
  restructure your work to avoid tool calls. Carry on with anything that does not depend on the answer.
- **A held call is not a decision and not a task.** It never appears in his queue or in any count. If you
  need a real decision, that is still \`cc ask\`, which waits for hours rather than minutes.
- **Tell him what it means before you switch it on.** Anyone who can open the hub can approve tool calls in
  his sessions from then on. It is a real widening of what that link does.

**3. Can he see what has already happened, before any of this was installed?**

\`\`\`bash
node "$HOME/.command-center/cc.mjs" backfill
\`\`\`

Hooks only know about sessions that start after they exist, so a project wired up this morning has nothing
to say about last night. This reads Claude Code's own transcripts on this machine and posts the last
fortnight of activity: every stretch of work, and every sub-agent it can find, with the times the harness
itself recorded.

**Run it anywhere — it reads the transcript folder, not the current directory** — and it is safe to run
again. Rows the hub measured for itself always win over a reconstruction of the same session, and the page
marks reconstructed runs differently from observed ones, because a stretch inferred from where the messages
stop is a weaker claim than a session something watched begin and end.

**4. Where is the money going?**

\`\`\`bash
node "$HOME/.command-center/cc.mjs" spend
\`\`\`

Reads Claude Code's own usage records on this machine and posts a per-project token total; the hub prices
them. Safe to run repeatedly — it replaces this machine's figures rather than adding to them. Run it after
a long session if he has asked to see where the allowance goes. It reads nothing but usage counts and sends
no prompts, no file contents and no titles.

### What does not belong in the hub

Roadmaps, documentation, architecture notes, status summaries — anything that also lives in a repo. A copy
that drifts from the repo is worse than no copy. The hub holds exactly two things: work only he can do, and
decisions only he can make.

### If it is not set up on this machine

\`cc\` prints what to do when it is configured but failing. **If \`cc.mjs\` is not on the machine at all, the hub
serves it** — you do not need this hub's repository, or npm, or a clone. It belongs in a \`.command-center\` folder
inside the home directory.

**Do not put a literal \`~\` in the download command.** \`curl\` does not expand it — the shell does, and PowerShell
does not do it inside an argument, so \`-o ~/.command-center/cc.mjs\` fails there with
\`curl: (23) client returned ERROR on write\` **having created nothing**. That exact line shipped on this hub's own
setup page and failed on the first machine that ran it. Use the form for the shell you are actually in:

\`\`\`bash
# bash / zsh / Git Bash
mkdir -p "$HOME/.command-center"
curl -fsSL -H "Authorization: Bearer <agent-token>" \\
  <hub-url>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"
node "$HOME/.command-center/cc.mjs" setup <hub-url> <agent-token>
\`\`\`

\`\`\`powershell
# PowerShell — same paths; only the folder line and the line-continuation differ
New-Item -ItemType Directory -Force "$HOME/.command-center" | Out-Null
curl.exe -fsSL -H "Authorization: Bearer <agent-token>" \`
  <hub-url>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"
node "$HOME/.command-center/cc.mjs" setup <hub-url> <agent-token>
\`\`\`

**\`"$HOME"\` is the portable one and it is worth knowing why:** PowerShell has an automatic \`$HOME\` too, and
Windows accepts forward slashes, so the *paths* above are identical in both shells. What is not portable is the
tilde — \`~\` is expanded by the shell, and PowerShell does not expand it inside an argument, so **both**
\`curl -o ~/…\` **and** \`node ~/…/cc.mjs\` fail there. The second one is the command you will run most.

The token is the same value in both lines, so a \`401\` on the download means the token is wrong and there is no
point running the second one. Setup is once per machine, ever, and the config lands in
\`.command-center/config.json\` — **never in a repo**, because it holds the token. If you have no hub URL or no
token to hand, ask him for them rather than writing the task list into chat where it will scroll away.
${END_MARKER}`;
}
