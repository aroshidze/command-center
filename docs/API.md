# The HTTP API

The CLI is a convenience. **This is the actual interface**, and it is the fallback that makes the hub work
in any tool — a cloud agent with no shell, a sandbox without the config file, a tool that only knows how
to make HTTP requests. Nothing the CLI can do is unavailable here.

Why plain HTTPS rather than MCP: MCP's largest breaking revision shipped on 28 July 2026 (sessions
retired, HTTP+SSE transport deprecated, DCR deprecated), and not every tool in rotation has migrated. A
plain HTTP call is 100% compatible today with zero spec risk. See [RESEARCH.md](RESEARCH.md) §4. An MCP
server would wrap exactly these endpoints, so adding one later costs nothing that exists now.

## Authentication

```
Authorization: Bearer $CC_AGENT_TOKEN
X-CC-Agent: claude-code          # optional label, shown as "last synced by …". Not a credential.
```

A missing or short token means every request is refused. Configuration failures fail **closed**.

---

## `GET /api/agent/sync`

The one call. Everything that changed, plus everything still waiting.

```bash
curl -s -H "Authorization: Bearer $CC_AGENT_TOKEN" -H "X-CC-Agent: codex" \
  "$CC_URL/api/agent/sync"
```

`?since=N` overrides the server-remembered cursor; `?since=0` returns everything.

```jsonc
{
  "ok": true,
  "cursor": 412,                    // pass back as ?since next time
  "since": 380,
  "more": false,                    // true = `changed` was capped, sync again NOW
  "hours_since_last_sync": 14.2,    // null on a first sync
  "changed": [
    { "seq": 381, "at": "…", "kind": "task.done",          "summary": "Done: Claim example.com…" },
    { "seq": 390, "at": "…", "kind": "question.answered",  "summary": "Answered \"…\": Reuse the existing bucket" },
    { "seq": 402, "at": "…", "kind": "note.created",        "summary": "Note: the button is called Verify now" }
  ],
  "open_questions": [ /* full objects, including options and deadline */ ],
  "open_tasks":     [ { "id": "t…", "project": "…", "title": "…", "minutes": 15, "blocked_reason": null } ],
  "defaulted_questions": [ /* resolved WITHOUT a human answer — read these */ ],
  "counts": { "open_questions": 1, "open_tasks": 3, "blocked_tasks": 1, "unread_changes": 6 }
}
```

**`changed` depends on the cursor. `open_questions`, `open_tasks` and `defaulted_questions` do not.** A
lost or wrong cursor costs you some duplicated reading and can never hide work that is still waiting.

**`changed` is paged at 200. When `more` is `true`, call again immediately with the returned `cursor`** —
do not wait for your next poll. The cursor now stops at the last event you were actually handed, so looping
until `more` is `false` walks the whole log with no gaps and no repeats.

This used to be broken and silently so: the cursor was set to the head of the log regardless of the page
size, so an agent 300 events behind got 200 of them and the other hundred became unreachable — the next
sync asked for everything after the head and correctly got nothing. If you have a stored cursor from before
this change and think you missed something, `?since=0` re-reads everything.

### Answers can carry a comment

Every question has an optional **`answer_note`**, populated whether they tapped an option, approved,
typed a value or refused. It is where "yes, but also do X" lives.

This was missing from the first version and found within minutes of real use: forcing a choice between
picking an option and saying something pushed the caveat back into chat, which is the exact failure the
hub exists to remove. Two ways it arrives:

- **On the hub** — a box above the buttons, sent with whichever option is tapped.
- **In Telegram** — a tapped button cannot carry text, so they tap first and reply to the message. That
  means a comment can arrive *minutes after* the decision, as a separate `question.answered` event
  reading `Comment added to "…": …`. Do not assume an answer is final just because you have read it once.

**Treat a comment as part of the answer, not a footnote to it.** A choice plus a condition is one
instruction.

**`defaulted_questions` is the field to never skim.** It means a deadline passed with no human answer and
the stated fallback now applies. Any work built on that decision still being open is wrong.

---

## `POST /api/agent/questions`

```bash
curl -s -X POST "$CC_URL/api/agent/questions" \
  -H "Authorization: Bearer $CC_AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "project": "example-app",
    "title": "Reuse the existing image bucket, or make a new one?",
    "context": "Blocks the Pinterest queue — 2,849 images, about 400MB.",
    "options": [
      { "key": "reuse", "label": "Reuse the uploads bucket", "detail": "No new config.", "recommended": true },
      { "key": "new",   "label": "Create a pins bucket", "detail": "Cleaner, ~10 min of setup." }
    ],
    "allow": ["choose", "ignore"],
    "default_option": "reuse",
    "hours": 12
  }'
```

Returns `201` with the stored question, plus:

```jsonc
{ "notified": true, "notify_channel": "telegram" }
```

`notified` is honest. `false` means the question is stored and visible on the hub but **nobody was
alerted** — say so rather than assuming a human has seen it.

Constraints that are enforced: max 6 options; option `key` max 12 characters (it travels inside a 64-byte
Telegram `callback_data`); a `deadline` without a `default_option` is refused as pointless, and vice
versa; re-asking an already-answered `key` is refused so an answer cannot be silently discarded.

### The reminder ladder — nothing to send, one event to read

A question with a deadline is nudged on the way to it, at 50% and 85% of the window between `created_at`
and `deadline`, and the first notification states the whole ladder. Points closer than 20 minutes to the
ask, to the deadline, or to each other are dropped, so a 30-minute deadline gets no nudges and a 12-hour
one gets two. Each nudge **replaces** the existing Telegram message rather than adding another.

There is no request to make and no field to set. What reaches you is one event kind:

```jsonc
{ "seq": 412, "kind": "question.reminded", "ref_id": "q7f3a91c2",
  "summary": "Nudged him about \"Reuse the existing image bucket…\" (2 of 2), which was the last one. Still unanswered; \"Reuse the uploads bucket\" applies at the deadline." }
```

Read it as **asked, nudged, still no answer** — a different state from a question asked ten minutes ago.
Nothing is stored to produce it: the count of nudges sent for a question is `count()` of these events, and
the sweep runs lazily on any read, like the timed defaults themselves. Nudges are suppressed while he is
actively using the hub, and a suppressed rung is owed rather than lost.

### `GET /api/agent/questions?id=…`

One question, for polling a specific decision. Cheap. `cc wait` uses it.

---

## `POST /api/agent/tasks`

```bash
curl -s -X POST "$CC_URL/api/agent/tasks" \
  -H "Authorization: Bearer $CC_AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "project": "example-app",
    "key": "claim-domain-pinterest",
    "title": "Claim example.com in Pinterest settings",
    "why": "Unblocks 2,849 renderable pins.",
    "minutes": 15,
    "steps": [
      { "do": "Open **pinterest.com/settings/claim**." },
      { "do": "Paste this into the **Website** field:", "copy": "example.com" },
      { "do": "Choose **Add HTML tag** and send me the tag as a note.",
        "detail": "I will add it to the site — do not edit the code yourself." }
    ],
    "verify": "The settings page shows example.com with a tick and the word Claimed.",
    "gotchas": ["A personal account has no Claim section. Check you are on the business profile."]
  }'
```

`verify` is **required** — a `400` with an explanation if it is missing. `copy` is rejected if it looks
like a credential. `key` makes the write idempotent per project.

Returns `201` with the stored task, plus:

```jsonc
{ "notified": true, "notify_reason": null }
```

`notified` is honest, exactly as it is for questions: `false` means the task is stored and on the hub but
**nobody was alerted**, so say "filed, but nobody has been told" rather than assuming a human has seen it.
`notify_reason` is `null` when a message went out, and otherwise names why one did not:

| `notify_reason` | Why nothing was sent |
|-----------------|----------------------|
| `burst` | Another task landed in **this same project** within the last few minutes. The first one already told him; nine pings in a row is how a channel gets muted. |
| `blocked` | The task carries a `blocked_reason`, so he cannot start it yet. Announcing work he cannot act on is noise. |
| `suppressed` | The rule said yes but the channel is switched off (`CC_SUPPRESS_TELEGRAM`, or Telegram is not configured). |

A re-POST of an existing `key` never notifies — an edit is not an arrival — and `created` is `false` there,
so you can tell the two apart. The window is **per project, not global**: two different projects filing at
the same moment are two different things he needs to know about, and both get through.

Telegram is best-effort and the record is not. A notification that fails never fails the write, and the
task is returned before any of this is attempted.

### `PATCH /api/agent/tasks`

`{ "id": "t…", "status": "dropped" | "open" }`. **`done` is refused**: only the human can report having
done something.

---

## `GET /api/health`

No auth. Opens the database, counts the five tables it needs, and names any missing credential.
`200` when genuinely healthy, `503` otherwise. It does not return `ok` merely because the process is up.

---

## Failure shapes

| Status | Meaning | What to do |
|--------|---------|-----------|
| `400` `{ kind: "invalid" }` | Your payload broke a rule. `error` says which. | Fix and resend. Do not retry unchanged. |
| `401` | Bad or missing token. | Stop. Ask the human for the token; do not brute-force. |
| `500` `{ kind: "write-failed", stored: false }` | The hub could not confirm the write, so **assume it did not happen**. | Safe to retry. `error` carries the verifier's reason. |
| `503` `{ kind: "no-schema" }` | Database reachable, schema missing. | Run `npm run init-db`. |
| `503` `{ kind: "not-configured" }` | A credential is missing. | Check `/api/health`. |

`write-failed` is the important one. It means the hub read the row back after writing and the database did
not hold what was intended, so it is refusing to claim success. That is the whole point — see
[lib/db.ts](../lib/db.ts).
