# Deploy your own hub

About ten minutes. Two free accounts, no credit card, nothing to sign up for on anybody else's service.

**Written the way this hub's own tasks are written**: exact values, exact labels, the specific ways each step
goes wrong, and how you know it worked without asking anyone. That is not a stylistic flourish — the whole
project is an argument that a handover which cannot be verified is not a handover, so a setup guide that says
"configure your database" and stops would be the thing this repository exists to complain about.

**One deliberate choice:** you generate and paste the secrets yourself. Nothing in here ever asks you to send a
credential to anyone, including to an agent helping you follow it. `.env.local` is already in `.gitignore`.

> **Which of these steps were executed by their author, honestly:** none of the account creation. The Neon and
> BotFather walkthroughs below are from a real setup of this hub and were correct on the dates stated; the
> console screens change. **Every command and every variable name in this file has been read back against the
> code that consumes it** — the env vars against `lib/auth.ts`, `lib/db.ts` and `lib/telegram.ts`, the CLI
> commands against the `switch` in `cli/cc.mjs`, the finish line against `app/api/health/route.ts`. Where you
> hit something different, the code is the authority, and `/api/health` is the thing to believe.

---

## Step 0 — the code and the secrets file (1 min)

```bash
git clone https://github.com/aroshidze/TheCommandCenter.git
cd TheCommandCenter
npm install
cp .env.example .env.local
```

`.env.example` documents every variable the hub reads, which file reads it, and which four exist but must **not**
go in there. Three have no default and the hub refuses every request until all three are set.

Generate the two tokens now — they are unrelated to each other on purpose, so either can be rotated without
disturbing the other:

```bash
node -e "console.log('CC_AGENT_TOKEN=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('CC_WEB_TOKEN='   + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('CC_TELEGRAM_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"
```

Paste each line into `.env.local`, replacing the empty one already there.

**You know it worked when:** each of those three lines has about 43 characters of gibberish after the `=`, and
the three values are different from each other. Anything shorter than 24 characters is treated as unset by
`requireConfigured` in `lib/auth.ts` and the hub fails closed rather than open — which is the correct behaviour
and an annoying way to find out you truncated a paste.

- `CC_AGENT_TOKEN` is what your agents authenticate with. You will hand it to `cc setup` once per machine.
- `CC_WEB_TOKEN` is what unlocks the page on your phone, once ever, via a link.
- `CC_TELEGRAM_SECRET` is only needed if you set up the bot in step 2.

**Nobody issues you these.** They are passwords you are inventing right now — the command above is just a
convenient way to produce a string nobody will guess. There is no dashboard anywhere that will show them to
you later, because no service knows about them: the hub compares what a caller sends against what you put in
its environment, and that is the whole mechanism.

That matters more than it sounds, and it is the one thing on this page that has confused a reader who
understood everything else. Every other credential in this stack — the database URL, the bot token — was
handed to you by a service that will show it to you again. These two were not. **Keep them somewhere you can
get them back**, because the practical recovery from losing `CC_AGENT_TOKEN` is not recovery at all: you
generate a new one, set it, redeploy, and then re-run `cc setup` on every machine that already had the old
one — each of which fails with `401` against a hub that looks perfectly healthy until you do.

---

## Step 1 — the database (Neon Postgres, free) — ~4 min

**Why Neon rather than Supabase**, if Supabase is what you already have: Supabase pauses free projects after
about 7 days of inactivity. This hub is *supposed* to be quiet, and a hub that is asleep on the one morning you
need it is worse than no hub. Neon scales compute to zero and wakes on the next query instead, with no
project-level pause. Any Postgres works — the driver is `@neondatabase/serverless` and it speaks to Neon over
HTTP, so if you swap it you are also swapping `lib/db.ts`.

1. Go to **<https://neon.com>** and press **Sign up** (top right; on some pages the button says
   **Get started**).
2. Sign in however you like — **Continue with GitHub** avoids inventing another password.
3. It may ask one or two onboarding questions. Answer or skip; it changes nothing.
4. You land on a **Create project** form (if you land on an empty dashboard instead, press **New Project**):
   - **Name:** `command-center`
   - **Postgres version:** leave the default
   - **Region:** whichever is geographically closest to you. This is worth about 30 milliseconds. Do not spend
     time on it.
5. Press **Create project**.
6. Somewhere on the project page is a box headed **Connection string**. If you do not see one, press
   **Connect** and it appears in a dialog.
7. **This is the part that matters.** There is a toggle, checkbox or dropdown item for **connection pooling** —
   it has been labelled *Pooled connection*, *Connection pooling* and *Pooler* in different versions of their
   console, so rather than hunting for a specific word, **check the string itself**:

   ```
   postgresql://neondb_owner:XXXXXXXX@ep-cool-name-12345678-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
                                                              ^^^^^^^
   ```

   The host must contain **`-pooler`**. If it does not, find the pooling toggle and turn it on.

8. Press the **copy** icon and paste it into `.env.local` after `DATABASE_URL=`.

Then create the schema:

```bash
npm run init-db
```

It creates five tables — `tasks`, `questions`, `notes`, `events`, `agents` — is safe to run repeatedly, and
**verifies itself by reading the table list back** rather than by the absence of an error.

**You know it worked when:** `init-db` prints the tables it found, and this returns the same five:

```bash
node -e "process.loadEnvFile('.env.local');const{neon}=await import('@neondatabase/serverless');console.log((await neon(process.env.DATABASE_URL)\`select table_name from information_schema.tables where table_schema='public' order by 1\`).map(r=>r.table_name).join(', '))" --input-type=module
```

**Gotchas**

- **The unpooled string also "works"**, which is the trap — it opens a new connection per request, and on
  serverless that eventually exhausts the connection limit and fails under no load at all. Take the pooled one.
- The password is shown by default in some views and hidden behind a **Show password** control in others. If you
  paste a string containing `****`, you have copied the masked version.
- Do not wrap it in quotes. `DATABASE_URL="postgres://…"` makes the quotes part of the value.
- Do not paste the variable name twice. `DATABASE_URL=DATABASE_URL=postgres://…` once produced a driver
  exception containing the whole connection string, password included, in terminal output. `lib/db.ts` now
  diagnoses that case itself and never prints the URL, but the mistake is easy to repeat.

---

## Step 2 — the Telegram bot — ~3 min — **OPTIONAL**

**The hub works completely without this.** `/api/health` reports Telegram separately and does not count it
towards `ok`, because you can always just open the page. Skip it and come back later if you want.

**What you lose by skipping it:** the one-tap answer. When an agent is blocked you get an ordinary Telegram
notification with the options as buttons; you tap one and the agent has its answer — no password, no page load,
no app to open. It is the most useful thing here and it takes three minutes.

**What you do not lose:** anything about the record. Every task, decision and note still works on the page.

1. Open Telegram. Search for **`@BotFather`** and open the result with the **blue verified tick** — there are
   impostors with similar names.
2. Send **`/newbot`**.
3. It replies *"Alright, a new bot. How are we going to call it?"* — this is the **display name**, spaces
   allowed. Send something like `Command Center`.
4. It replies *"Good. Now let's choose a username"* — this must be **globally unique** and must **end in
   `bot`**. Send something like `yourname_command_center_bot`. If it says *"Sorry, this username is already
   taken"*, add a digit and try again.
5. It replies **"Done! Congratulations on your new bot."** and, further down, **"Use this token to access the
   HTTP API:"** followed by a token shaped like `8123456789:AAH1a2B3c4D5e6…` — some digits, a colon, then about
   thirty-five more characters. (Truncated here on purpose: written out in full it matches the shape GitHub's
   secret scanner looks for, and a setup guide should not email every reader an exposed-credential alert.) Paste it into
   `.env.local` after `TELEGRAM_BOT_TOKEN=`.
6. **Do not skip this step.** In that same BotFather message there is a link like `t.me/your_bot_name`. Tap it,
   press **Start**, and send the bot the word `hello`.
7. Find your numeric chat id from that message and put it in `TELEGRAM_CHAT_ID`:

   ```bash
   node -e "process.loadEnvFile('.env.local');const r=await(await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getUpdates')).json();if(!r.ok){console.log('Telegram refused: '+r.description);}else{const ids=[...new Set(r.result.map(u=>(u.message||u.edited_message||{}).chat?.id).filter(Boolean))];console.log(ids.length?ids.join(', '):'no messages yet — send the bot a message first');}" --input-type=module
   ```

**You know it worked when:** the command above prints a number, and you have pasted that number into
`TELEGRAM_CHAT_ID`.

> **That command prints `Telegram refused: … can't use getUpdates while webhook is active` once you have done
> step 4**, and that is expected rather than broken — a bot delivers its updates *either* by polling *or* to a
> webhook, never both. It works here because you have not set the webhook yet. Afterwards, read the chat id off
> `TELEGRAM_CHAT_ID` where you already put it, or `npm run webhook -- --info`.
>
> The first draft of this command reported that refusal as *"no messages yet — send the bot a message first"*,
> because it read `r.result` without checking `r.ok`. It was corrected by running it, which is the only way that
> class of wrongness gets found: the command completed, printed a plausible sentence, and the sentence was about
> the wrong thing.

**Gotchas**

- **Step 6 is not optional and it is easy to skip.** Telegram forbids a bot from messaging a person who has
  never messaged it — an anti-spam rule, not a bug. Skip it and the hub can store your answers but can never
  notify you, which removes the main reason it exists. It is also the only way to find your chat id.
- The bot token is a password for the bot. If it leaks, send BotFather **`/revoke`** and it issues a new one.
  Nothing else breaks.
- Do not add the bot to a group and do not touch **Group Privacy** in BotFather settings. It only ever talks to
  you — `TELEGRAM_CHAT_ID` is the only chat the hub will send to or accept from.
- If BotFather sends you a message about **domain** or **payments**, ignore it. Not relevant.

---

## Step 3 — check it locally before deploying

```bash
npm run dev
```

Open **<http://localhost:3939/api/health>**. Every required line must be a tick:

```jsonc
{ "ok": true, "checks": {
    "DATABASE_URL":   { "ok": true,  "detail": "set (the Neon connection string)" },
    "CC_AGENT_TOKEN": { "ok": true,  "detail": "set (the token agents authenticate with)" },
    "CC_WEB_TOKEN":   { "ok": true,  "detail": "set (the token that unlocks the page on your phone)" },
    "telegram":       { "ok": false, "detail": "suppressed — CC_SUPPRESS_TELEGRAM=yes, …" },
    "database":       { "ok": true,  "detail": "connected, all 5 tables present" } } }
```

`ok: true` overall with `telegram: false` is **correct** locally — `.env.example` ships
`CC_SUPPRESS_TELEGRAM=yes` so that running the suites cannot push synthetic notifications to your real phone.
That has happened, a dozen at a time, which is why `tests/prove.mjs` refuses to run unless `/api/health`
confirms sending is off.

Then open the hub itself, once, to swap the token for a cookie:

```
http://localhost:3939/api/enter?k=<your CC_WEB_TOKEN>
```

Optionally prove it to yourself rather than trusting it:

```bash
npm run prove:parse       # two seconds
npm run prove             # end-to-end over real HTTP against your database
npm run prove:negative    # every safety guarantee, broken on purpose
npm run fixture           # realistic data, so there is something to look at
```

---

## Step 4 — deploy it

Any Node host works; these are the Vercel steps because that is what has been run.

1. Push your fork to GitHub, then **<https://vercel.com/new>** → import the repository. It is a stock Next.js
   app; take every default.
2. Add the environment variables in **Settings → Environment Variables**, for **Production**: `DATABASE_URL`,
   `CC_AGENT_TOKEN`, `CC_WEB_TOKEN`, and — if you did step 2 — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
   `CC_TELEGRAM_SECRET`. Optionally `CC_PUBLIC_URL` set to your deployment's URL, which the Telegram messages
   use for their "Open the hub" link.
3. **Never set `CC_SUPPRESS_TELEGRAM` or `CC_ALLOW_FAULT_INJECTION` in production.** Fault injection is also
   independently gated on `NODE_ENV !== 'production'` by `faultsEnabled()` in `lib/db.ts`, so no single variable
   can make a deployed hub lie about a write — but do not lean on the second gate.
4. Deploy. **Vercel does not apply environment changes to an existing deployment**, so if you add a variable
   afterwards you must redeploy.
5. **The finish line:** open `https://<your-hub>/api/health`. `ok: true` and `"connected, all 5 tables present"`
   means it is done. If Telegram is configured it reads `"bot token and chat id are set"`.
6. If you set up the bot, point its webhook at the deployment:

   ```bash
   npm run webhook -- https://<your-hub>
   ```

   **The `--` is required and this was written without it first.** `npm run webhook --info` silently drops the
   flag — npm claims it for itself — and the script then printed its usage line, which looks like you typed the
   command wrong rather than like npm ate your argument. Found by running it. `npm run webhook -- --info` shows
   the current webhook and the last delivery error, which is the thing to look at if taps stop arriving.

   It reads the result back from Telegram's `getWebhookInfo` and fails if Telegram disagrees, so this step
   cannot quietly half-succeed.

**Gotcha, and it has cost a whole debugging session:** if your Vercel team has **Deployment Protection** on — it
is on by default for Pro teams — every request is 302'd to `vercel.com/sso-api`. Telegram silently cannot
deliver taps and your phone gets a Vercel login screen instead of the hub. Symptom: `curl -I` on your hub
returns `302`, not `200`. Turn it off for this project.

---

## Step 5 — the one link to keep, and your first project

Open this **once**, on your phone:

```
https://<your-hub>/api/enter?k=<your CC_WEB_TOKEN>
```

It swaps the token for a cookie that lasts a year and redirects to the hub. Then **Add to Home Screen**. From
then on it opens instantly with no password, and the address saved on your phone contains no credential. Keep
the enter link somewhere findable — pin it in the chat with your bot. You only need it again if you clear your
browser data or get a new phone.

### What that link can do, stated plainly — because it is more than reading a list

Anyone holding `CC_WEB_TOKEN` (or the cookie it becomes) can read your queue, tick tasks off, answer your
decisions, and write notes your agents will read. That has always been the trade, and it is what buys "open it
on your phone with no password, ever". The hub stores no secrets by rule, so a leaked link never exposes a
credential.

**One thing was added to that list and it deserves saying out loud: if you switch the permission relay on in a
project, whoever holds this token can allow or deny tool calls in that project's agent sessions.**

The relay is **off in every project until somebody runs `cc approvals on` in that folder**, so if you have not
done that, nothing here has changed. If you have, the exposure is narrower than it first sounds and it is worth
knowing exactly how narrow:

- **It cannot start anything.** An approval only exists while one of your own agents is already waiting on a
  permission prompt it raised itself. There is no "run this" endpoint — only "answer the question already
  being asked".
- **It lasts about ten minutes.** Past that the request lapses and the agent falls back to asking in its own
  terminal. A token that leaks and is never used inside that window costs nothing.
- **Denying is always safe.** The worst a holder can do is approve a tool call your agent proposed, in a
  project you opted in, inside that window.
- **`cc approvals off` in the folder undoes it**, effective on the next session.

If a project is one where a wrong Allow would be expensive, leave the relay off there. That is the control, and
it is per project on purpose.

### Now connect a project, and the easy way is to not run any of this yourself

**Open `/setup` on your own hub and paste the prompt it gives you at an agent.** It has your real hub URL filled
in, you replace one placeholder with your token, and the agent installs the CLI if it is missing, configures the
machine, checks it, connects the project and syncs. Every command in it is safe to re-run, so it is the same
prompt on a bare machine and on your fourth project.

By hand, if you would rather. Once per machine, and **the hub serves its own CLI**, so this needs no clone:

```bash
# bash / zsh / Git Bash
mkdir -p "$HOME/.command-center"
curl -fsSL -H "Authorization: Bearer <CC_AGENT_TOKEN>" \
  https://<your-hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"

node "$HOME/.command-center/cc.mjs" setup https://<your-hub> <CC_AGENT_TOKEN>
node "$HOME/.command-center/cc.mjs" health
node "$HOME/.command-center/cc.mjs" onboard    # from inside a project folder
```

```powershell
# PowerShell
New-Item -ItemType Directory -Force "$HOME/.command-center" | Out-Null
curl.exe -fsSL -H "Authorization: Bearer <CC_AGENT_TOKEN>" `
  https://<your-hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"

node "$HOME/.command-center/cc.mjs" setup https://<your-hub> <CC_AGENT_TOKEN>
node "$HOME/.command-center/cc.mjs" health
node "$HOME/.command-center/cc.mjs" onboard    # from inside a project folder
```

**Gotcha, measured rather than guessed:** `"$HOME"` and not `~`. `curl` never expands a tilde — the shell does,
and PowerShell does not do it inside an argument — so `-o ~/.command-center/cc.mjs` exits **23** with *"client
returned ERROR on write"* and creates nothing. The tilde form shipped as the first instruction on `/setup` and
failed on the first machine that ran it; see `docs/ITERATION-LOG.md` §XXI.C.

A `401` on the download means the token is wrong, and finding that out here rather than three commands later is
why that route is authenticated.

Everything after this point lives on `/setup` rather than in a file, because a page computed from live
configuration cannot drift and a document copied from it can — which is not a hypothetical, it is what happened to
`docs/ADD-A-PROJECT.md` and is recorded in `docs/ITERATION-LOG.md` §XXI.

---

## If your hub's URL ever changes

Three things must be updated together, or it half-works in a confusing way:

1. `CC_PUBLIC_URL` in the host's environment — otherwise Telegram's "Open the hub" link goes nowhere
2. `npm run webhook https://<new-url>` — otherwise taps are delivered to the old deployment or nowhere
3. `node "$HOME/.command-center/cc.mjs" setup https://<new-url> <CC_AGENT_TOKEN>` on each machine — otherwise every
   agent syncs the old hub

`/setup` needs no update, because it takes its address from the request it is answering.
