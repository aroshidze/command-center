# The live environment

**Read this before touching anything.** It is the one document whose contents cannot be worked out from
the code, and getting it wrong means writing test data into the real hub or deploying to the wrong place.

Last verified: **30 July 2026.**

> **This file describes ONE install.** If you forked this repository, everything below is the shape you need
> rather than anything about your deployment.
>
> **It no longer states personal identifiers, and that is deliberate.** It used to give a Telegram chat id, a
> git email, both Neon endpoint hostnames and a Vercel team slug. None of them was a credential — a chat id is
> inert without the bot token and an endpoint hostname is inert without the password — but they were personal,
> and this is the file that would carry them into a public repository. **Every one of them is one command away**,
> and those commands are given below where the value used to be, which makes this file work on any install
> instead of just one. See `docs/ITERATION-LOG.md` §XXI.C.

---

## The single most important fact

**There are TWO databases, and which one you are talking to depends on how you reach the hub.**

| How you reach it | Which database | What is in it |
|---|---|---|
| `npm run dev` → `localhost:3939` | Neon **`dev`** branch | Nothing real. Empty apart from whatever a test just made. |
| the deployed hub | Neon **`production`** branch | **The real hub.** Actual tasks and decisions. |
| `cc sync` / `cc ask` / `cc task` | **production** | The CLI is configured against production, not localhost. |

So: **`npm run dev` does not show you the real hub, and `cc sync` does not read your local server.** That
is deliberate, but it surprises everyone once.

- Local `DATABASE_URL` lives in `.env.local` and points at the `dev` branch. Print which endpoint that is:

  ```bash
  node -e "process.loadEnvFile('.env.local');console.log(new URL(process.env.DATABASE_URL).hostname)"
  ```

- Production `DATABASE_URL` lives **only** in Vercel's environment variables and points at the
  `production` branch. It is not in any file on this machine, so there is nothing here to compare against —
  check it in Neon's branch list, or with `npx vercel env ls production`.

**The endpoint hostnames are deliberately not written down here.** They are personal to one install and this is
the file that would publish them. The command above always tells you the truth about the machine you are on,
which a literal string in a document stops doing the moment an endpoint changes.

### Why it was split

For most of the first day there was one database, and the proof suites ran against it. The consequence
showed up on the owner's phone: the real hub's footer read *"Last agent sync: prove-script"*, *"Recently
done: Proof task…"*, *"Last note: Telegram proof note 1785…"*. Test rows were visible in the one place
that is supposed to contain only real work.

The `dev` branch was created **schema-only** — tables, no rows — so a local run has no real data to touch
even by accident. Neon branches are free (10 per project) and store only the delta.

**The isolation was verified, not assumed:** a marker task was written through the local server, confirmed
present locally, and confirmed absent from production's own API. If you change anything about the
connection strings, repeat that check rather than trusting it.

---

## Every environment variable

| Variable | Local (`.env.local`) | Vercel production | What it does |
|---|---|---|---|
| `DATABASE_URL` | `dev` branch | `production` branch | **Different values on purpose.** See above. |
| `CC_AGENT_TOKEN` | same | same | Agents' bearer token. |
| `CC_WEB_TOKEN` | same | same | Exchanged once at `/api/enter?k=…` for a year-long cookie. |
| `CC_TELEGRAM_SECRET` | same | same | Echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token`. Stops forged answers. |
| `TELEGRAM_BOT_TOKEN` | same | same | The bot. `npm run webhook -- --info` prints which one. |
| `TELEGRAM_CHAT_ID` | set | same | The only chat the bot will send to or accept from. `npm run webhook -- --info` prints it. |
| `CC_PUBLIC_URL` | production URL | production URL | Only used for the "Open the hub" link inside Telegram messages. |
| `CC_SUPPRESS_TELEGRAM` | **`yes`** | **absent** | Local only. Stops local runs messaging the real phone. |
| `CC_ALLOW_FAULT_INJECTION` | **`yes`** | **absent** | Local only. Enables the deliberate-failure tests. |

**Never set `CC_SUPPRESS_TELEGRAM` or `CC_ALLOW_FAULT_INJECTION` in production.** Fault injection is also
independently gated on `NODE_ENV !== 'production'`, so there is no single flag that could make a deployed
hub lie about a write — see `faultsEnabled()` in [lib/db.ts](../lib/db.ts).

To change a production variable:

```bash
printf '%s' "<value>" > tmp && npx vercel env rm NAME production --yes && \
  npx vercel env add NAME production < tmp && rm tmp
```

Then **redeploy** — Vercel does not apply env changes to an existing deployment. Confirm with
`/api/health`, which opens the database rather than reporting that the process is up.

---

## The services

| Thing | Where | Notes |
|---|---|---|
| Hub | the value of `CC_PUBLIC_URL` | An older Vercel alias still resolves to the same deployment; `CC_PUBLIC_URL` and Telegram agree on one, and that is the canonical one. `npx vercel ls` shows the project. |
| Repo | this checkout's `origin` | Branch **`master`**, not `main`. Pushing deploys automatically. `git remote -v`. |
| Database | Neon project **The Command Center**, Frankfurt, Postgres 18 | Branches: `production`, `dev` |
| Bot | see `npm run webhook -- --info` | Webhook → `/api/telegram` |
| CLI | `~/.command-center/cc.mjs` + `config.json` | Config holds the agent token; **never** in a repo |

**The specific URLs, project slugs and bot username are deliberately absent** — each is one command away, and
this is the file that would carry them into a public repository. The commands are in the right-hand column.

The Vercel account is **Pro**, so the Hobby non-commercial-use restriction does not apply. That question was
asked in the hub and is recorded there.

---

## Things that will bite you, all of them already have

1. **Vercel Deployment Protection must stay OFF for this project.** It is on by default for Pro teams and
   302s every request to `vercel.com/sso-api` — which means Telegram silently cannot deliver taps and the
   phone gets a Vercel login before the hub. Symptom: `curl` returns 302, not 200.

2. **Never pass `-c user.email` to `git commit`.** Let git use whatever `git config user.email` already
   returns — it is right because the owner set it. An agent once set it from session metadata instead, to a
   work address; GitHub mapped that address to a separate account with no Vercel link, and the build was
   refused with *"does not have a Vercel account linked to their GitHub account"* — an error naming an identity
   with nothing to do with this project. **Two commits in this repository's history still carry that address**,
   which matters for publishing and is the subject of §XXI.C of the iteration log.

3. **The Neon connection string must contain `-pooler`.** The console's default copy may be the direct
   endpoint. Also: reveal the password before copying, or you get asterisks; and the console wraps the
   string across three lines for display while `.env.local` needs one line.

4. **Do not paste the variable name with the value.** `DATABASE_URL=DATABASE_URL=postgres://…` produced a
   driver exception containing the whole connection string, password included, in terminal output.
   [lib/db.ts](../lib/db.ts) now diagnoses that case itself and never prints the URL, but the underlying
   mistake is easy to repeat.

5. **`next dev` allows one server per directory.** `npm run prove:health` starts a second one, so the main
   dev server must be stopped first. On Windows it is spawned through a shell, so cleanup kills the
   process tree — killing only the child leaves the real server holding port 3941 and the resulting error
   points somewhere else entirely.

6. **`process.exit()` mid-`fetch` trips a libuv assertion on Windows**, making a script that printed the
   correct answer look like it crashed. Scripts here set `process.exitCode` and let the loop drain.

7. ~~**`scripts/seed-real.mjs` writes to PRODUCTION** by default.~~ **Gone, 4 Aug 2026.** That script held
   the owner's genuine outstanding tasks, copied out of another project's `MORNING.md` — its own header said
   so — and it had served its purpose. Deleted along with `scripts/migrate-riff-kitchen.mjs`, a finished
   one-off, as part of the public-readiness audit. **There is no longer any script that writes to production
   by default**, which removes the whole class of accident this row described. `npm run fixture` is
   localhost-only by refusal, not by convention.

---

## Which surface is primary

**A desktop, mostly.** The hub is used at a desk while the work is actually being done, and on a phone
occasionally to check in or answer something simple. Both are first-class; neither is a scaled version of
the other. If you change layout, check both — `app/globals.css` has the reasoning at the top, and the phone
rules are the base with desktop as additive overrides so the phone case cannot regress silently.

Control sizing keys off `@media (pointer: fine)`, not viewport width. A tablet keeps the large targets at any
width, because what decides how big a control needs to be is what you are pointing with.

## Verifying, rather than assuming

```bash
npm run init-db      # idempotent; verifies by reading the table list back
npm run prove        # 33 checks over real HTTP; refuses to run if Telegram sending is live
npm run prove:negative   # 24 checks, each broken on purpose
npm run prove:palette    # 64 token contrast pairs, both themes; no browser, no database
npm run prove:use        # presses the real buttons and checks the database
npm run prove:layout     # 24 checks at 390/834/1280/1920/2560, plus a light-theme pass
node tests/measure-layout.mjs "$CC_PUBLIC_URL" --production   # the real hub, read-only bar one thing
npm run prove:health     # boots a second hub with a dead database; stop `npm run dev` first
node cli/cc.mjs health   # production, through the CLI
node scripts/set-telegram-webhook.mjs --info   # shows LAST ERROR if delivery is failing
```

### The interface suites need data, and it must be the same data every time

```bash
npm run fixture          # 22 tasks over 4 projects, one with 19 steps, 4 decisions -> the DEV database
                         # plus 9 FINISHED tasks and 2 answered decisions, back-dated over 8 days
npm run fixture:clear    # remove it; a brand-new hub, with nothing behind it
npm run fixture -- --cleared   # the finished work and NOTHING open: the EARNED empty hub
npm run shots            # PNGs at 390/834/1280/1920/2560 into tests/shots/
npm run shots -- --open  # ...with the longest task opened
npm run shots -- --finished    # ...showing the record of finished work instead of the queue
npm run shots:light      # ...in the light theme, via the browser's own media override
```

**Every run produces TWO images per width: a viewport-sized one and a full-page one, and the viewport one is
the one to look at first.** A full-page capture stretches the viewport to the document height, which makes
anything sized in `vh` — the reading pane, the capped decisions region — stop overflowing. So for months no
screenshot could show the scrollbars that were the first thing the owner complained about, whatever flags were
passed. The viewport capture also prints the width of every scrollbar in view.

The three fixture states are not interchangeable. `--clear` gives an empty hub with an empty record, which is
a hub nobody has used yet. `--cleared` gives an empty queue with a full record, which is the state hard
constraint 6 calls success — and it is the only way to see the "the whole hub reached zero" mark. The nine
finished tasks are ADDITIONAL rows rather than nine of the twenty-two ticked off, because every open volume in
the fixture is a volume at which a real layout bug appeared. `tests/fixture.mjs` now counts what is actually in
the database and fails if it disagrees with what it claims, after one of the finished tasks reused an open
one's idempotency key and silently reduced the big project from 16 open tasks to 15.

`prove:layout` and `prove:use` both assume the fixture is loaded. Before it existed they measured
whatever production happened to contain that morning, so no layout number was reproducible and
"cards tile into two columns" was true by accident rather than by rule.

`tests/fixture.mjs` refuses to run against anything but localhost and refuses if Telegram sending is
live. It writes through the real agent API, so validation and `writeVerified` apply to it too.

**`npm run prove:health` does not always clean up its second server.** It boots one on port 3941 and it
has been seen to survive the run, at which point `npm run dev` refuses to start with *"Another next dev
server is already running"* and names a PID. Kill that PID and start dev again.

`npm run prove` **aborts** rather than failing an assertion if the server it is pointed at has a live
Telegram channel, because by the time an assertion failed the messages would already have been sent. That
preflight runs *before* the destructive reset, for the same reason.

### Which database am I actually on?

```bash
node -e "process.loadEnvFile('.env.local');const{neon}=await import('@neondatabase/serverless');const p=(await neon(process.env.DATABASE_URL)\`select distinct project from tasks order by 1\`).map(r=>r.project);console.log('endpoint: '+new URL(process.env.DATABASE_URL).hostname);console.log('projects: '+(p.join(', ')||'(none)'))" --input-type=module
```

**Read the project list, not the hostname.** If it is the four fixture slugs — `cold-brew`,
`harbour-lights`, `nine-panels`, `tuck-shop` — or `proof-*`, you are on **dev** and safe. **If you see the names
of real projects you are on production: stop and fix `.env.local`.**

That is deliberately a check on *content* rather than on a memorised endpoint string. The old version of this
section listed both hostnames and asked you to recognise one, which meant it named two personal identifiers to
answer a question the data answers better — and it silently stops working the day an endpoint is recreated,
whereas the fixture slugs are asserted by `tests/fixture.mjs` on every load.

---

## If the production URL ever changes

Vercel's generated alias can change if the project is renamed or recreated. Three things must be updated
together, or the hub half-works in a confusing way:

1. `CC_PUBLIC_URL` in Vercel — otherwise Telegram's "Open the hub" link goes nowhere
2. `npm run webhook -- https://<new-url>` — otherwise taps are delivered to the old
   deployment or nowhere at all
3. `node cli/cc.mjs setup https://<new-url> <CC_AGENT_TOKEN>` — otherwise every agent syncs the old hub

The webhook script reads the result back from `getWebhookInfo` and fails if Telegram disagrees, so that
step at least cannot quietly half-succeed.
