# The prompt to paste into an agent that doesn't know about the hub yet

Two prompts. Use the short one nine times out of ten.

You should not need either of these often — the point of installing the block into each project's
`AGENTS.md` is that agents find the hub without being told. Use these when an agent is already mid-session
(so it read `AGENTS.md` before the block existed), or when it is being stubborn.

---

## Short version — for any project

> There is a shared hub for anything that needs me. Run `node "$HOME/.command-center/cc.mjs" sync` now and read
> the output — it tells you what I've done, what I've answered and anything I've written to you, across all
> my projects, in one call. From now on: run it at the start of every session; when you need something only
> I can do use `cc task`; when you're blocked on a decision use `cc ask` with 2–4 options and a
> `default_option` + `hours` so you're never stuck waiting for me. Full field reference is in the Command
> Center section of this project's `AGENTS.md`. Don't write task lists into chat — they scroll away.

---

## Long version — specifically for the Riff Kitchen agent

Paste this whole thing. It explains the change, not just the commands, because an agent that knows *why*
the local portal went away will not try to helpfully rebuild it.

> **The owner task portal has been removed from this project.** `data/ownerTasks.ts`, `TASKS.html`,
> `scripts/task-status.mjs`, `scripts/build-task-portal.mjs`, the `/admin?tab=tasks` view and its API route
> are gone. Read `docs/TASKS-MOVED.md` before you touch anything in that area, and **do not rebuild any of
> it.** Its removal was a deliberate decision I approved, not a regression.
>
> All 17 outstanding tasks were migrated to a hub shared across all my projects, with their steps, gotchas
> and verification lines intact. Each one was read back and compared against the source before anything was
> deleted. Completion state remains in Supabase under `system_config` → `owner_tasks_state`; nothing was
> lost, and it's all in git history.
>
> **What you do instead:**
>
> ```bash
> node "$HOME/.command-center/cc.mjs" sync
> ```
>
> Run it now, and at the start of every future session. One call returns everything I completed, answered
> or wrote since any agent last looked — across every project, not just this one.
>
> - Something only I can do (an account, a card, a camera, a physical thing) → `cc task` with
>   `"project": "riff-kitchen"`. `verify` is required: one line on how I know it worked without asking you.
> - You're blocked on a decision → `cc ask` with 2–4 labelled options. **Use `default_option` + `hours`
>   whenever there's a defensible fallback** — it means "if he hasn't answered in 12 hours, proceed with
>   option B", which is stated to me in the notification. Don't guess, and don't stall.
> - An answer may arrive with a comment attached — I can pick an option *and* add a condition. Treat a
>   choice plus a condition as **one** instruction, not a choice you can act on and a comment you can skim.
> - Never put a secret in a task. Not an API key, not a token. The hub rejects credential-shaped values by
>   rule. Say *where* the value lives instead.
> - You cannot mark a task done. Only I can.
>
> The full field reference is in the **Command Center** section of `AGENTS.md` in this repo.
>
> **One thing needing your attention:** `data/ownerTasks.ts` contained a real VAPID keypair — private key
> included — as values for me to paste, and that file is committed. The repo is private so it isn't an
> incident, but those keys have never been deployed, so they should be treated as discarded rather than
> pending. When I'm ready to switch on expiry notifications, generate a **fresh** pair and give it to me at
> that moment. Never write it into a file. The hub deliberately cannot store it.

---

## If an agent ignores it

Almost always one of three things, in this order of likelihood:

1. **`cc` isn't installed on that machine.** `node "$HOME/.command-center/cc.mjs"` prints exactly what to do.
   Re-run `node scripts/install-into-project.mjs "<project path>"` from the Command Center repo.
2. **It read `AGENTS.md` before the block was installed.** Instruction files are read at session start;
   adding one mid-session changes nothing. Paste the short prompt, or restart the session.
3. **The project has a `CLAUDE.md` or `GEMINI.md` that the agent prefers.** The installer adds a one-line
   pointer to those files when they already exist — a pointer, never a copy, so there is one source of
   truth. If a project gained one of those files after the install, re-run the installer.

If an agent keeps skipping `sync` even when it knows about it, that is worth telling me. It is the failure
mode that kills this tool: the hub goes stale and starts lying, which is worse than not existing. The fix
is to make the call cheaper or the instruction louder — and if neither works, the concept is wrong and I
would rather kill it than maintain something misleading. See `docs/DECISION.md`.
