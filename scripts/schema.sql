-- The whole hub, in five tables.
--
-- Applied by `npm run init-db`, which is idempotent and safe to re-run. There is deliberately no
-- auto-migration on request: a schema change racing several serverless invocations is a good way to
-- get a half-created table, and a hub whose first task is "fix the hub" is no use to anyone.

create table if not exists tasks (
    id              text primary key,
    project         text not null,
    -- Agent-supplied idempotency key. The unique constraint below is what makes "create this task"
    -- safely retryable: an agent that loses its connection mid-call and repeats itself updates the
    -- same row instead of producing a duplicate for a human to tidy up. Nothing in this hub should
    -- ever need tidying (docs/RESEARCH.md §7, cause 1).
    key             text,
    title           text not null,
    why             text,
    minutes         integer,
    steps           jsonb not null default '[]'::jsonb,
    verify          text,
    gotchas         jsonb not null default '[]'::jsonb,
    blocked_reason  text,
    status          text not null default 'open' check (status in ('open', 'done', 'dropped')),
    note            text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    done_at         timestamptz
);

create unique index if not exists tasks_project_key_uniq
    on tasks (project, key) where key is not null;
create index if not exists tasks_open_idx on tasks (status, created_at);

create table if not exists questions (
    -- Short on purpose: this id travels inside a Telegram callback_data string, capped at 64 bytes by
    -- the Bot API. See lib/telegram.ts.
    id              text primary key,
    project         text not null,
    key             text,
    title           text not null,
    context         text,
    options         jsonb not null default '[]'::jsonb,
    allow           jsonb not null default '["choose"]'::jsonb,
    -- The timed default: if the human has not answered by `deadline`, an agent may proceed with
    -- `default_option` rather than guessing or stalling. Applied lazily on read (lib/store.ts), so
    -- there is no cron job to forget about and nothing to keep alive.
    default_option  text,
    deadline        timestamptz,
    status          text not null default 'open'
                    check (status in ('open', 'answered', 'defaulted', 'ignored')),
    answer_type     text,
    answer_option   text,
    answer_text     text,
    -- A comment attached to ANY answer, including a tapped option.
    --
    -- Added after the first real use of the hub, which immediately hit the limitation: "my answer is
    -- option A, BUT I also want to say something about it." The original design treated `choose` and
    -- `respond` as alternatives, so picking an option meant losing the ability to add anything — which
    -- pushes the caveat back into chat, which is the exact failure this hub exists to remove.
    --
    -- Separate from `answer_text` on purpose: `answer_text` is the answer itself for a `respond`
    -- question, this is commentary alongside a choice. Collapsing them would make "did they answer or
    -- comment?" ambiguous for the agent reading it.
    answer_note     text,
    answered_at     timestamptz,
    asked_by        text,
    -- Kept so a tapped answer can rewrite the original Telegram message in place, leaving a readable
    -- history instead of a pile of stale prompts.
    tg_message_id   bigint,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create unique index if not exists questions_project_key_uniq
    on questions (project, key) where key is not null;
create index if not exists questions_open_idx on questions (status, created_at);

-- For a database created before answer_note existed. `create table if not exists` above will not add a
-- column to an existing table, so the upgrade needs saying explicitly. Idempotent, and the reason
-- `npm run init-db` stays safe to re-run rather than being a one-shot.
alter table questions add column if not exists answer_note text;

create table if not exists notes (
    id          text primary key,
    project     text,
    body        text not null,
    source      text not null check (source in ('telegram', 'web', 'api')),
    created_at  timestamptz not null default now()
);

-- The append-only spine. `seq` is the sync cursor: monotonic, gapless enough, and cheap to filter on.
-- `summary` is precomputed so that catching up never needs a join to be readable, which is what keeps
-- one sync call to one query and a small payload.
create table if not exists events (
    seq      bigserial primary key,
    at       timestamptz not null default now(),
    kind     text not null,
    project  text,
    ref_id   text,
    summary  text not null
);

create index if not exists events_seq_idx on events (seq desc);

-- Per-agent watermark. Stored server-side so an agent needs no local state to catch up, but the cursor
-- is also returned in every response so an agent CAN pin its own. Either way, open items are returned
-- unconditionally, so a wrong watermark can never hide work.
create table if not exists agents (
    name          text primary key,
    last_sync_at  timestamptz,
    last_cursor   bigint not null default 0,
    sync_count    integer not null default 0
);

-- The chosen look, and the only table here that does NOT hold derived truth.
--
-- Everything the hub displays is folded out of `tasks` and `questions` on every render, because a stored
-- score can disagree with the rows it came from. A chosen palette is not a fact about the work: there is
-- nothing to recompute it from, so storing it cannot lie. It lived in a cookie until it needed to follow
-- him between his phone and his desk.
--
-- No `user_id`, like every other table here: one deploy, one human, one row per key. That is a property
-- worth stating rather than an omission.
--
-- THIS ONE ALSO CREATES ITSELF. `lib/settings.ts` issues exactly this statement on first use, so a deploy
-- is the migration and nobody has to run anything by hand. It is duplicated here on purpose so that
-- `init-db` on a fresh database still produces the complete schema in one pass, and so this file remains
-- the single readable description of what the hub stores. If you change one, change both.
create table if not exists settings (
    key         text primary key,
    value       text not null,
    updated_at  timestamptz not null default now()
);

-- PRESENCE: whether anything is actually looking at a project, and when it last did.
--
-- WHY THIS TABLE EXISTS AT ALL, since almost nothing else here is allowed to store state.
--
-- An empty queue and a dead agent looked identical, and that was the sharpest true criticism of this
-- product: "nothing needs you" is the state the hub exists to reach, and it renders identically to
-- "nothing has run against this project since July". One of those is success and the other is the hub
-- quietly going out of date, and there was no way to tell them apart.
--
-- The rule from docs/BRIEF-NOTHING-BLOCKED.md §4 is the one to keep in mind before adding a column:
-- **an observation gets a row and a fold gets none.** "A session started at 09:14 on branch master" is
-- an observation — something happened, nothing derives it, and losing it loses information. "This
-- project is stalled" is a fold over these rows, computed on every render, and has no column here and
-- must never get one.
--
-- THERE IS DELIBERATELY NO free-text "what I am doing" FIELD. It is the obvious next column and it is
-- refused for the reason the same brief section gives about health: an agent asked to describe its own
-- state describes it favourably, and one green-while-you-slept self-report poisons every other
-- indicator on the page. `branch` and `model` are facts read off the machine by the hook; nothing here
-- is a claim an agent gets to make about itself.
--
-- `kind` is what keeps "working now" honest. A 'session' row comes from a SessionStart hook and can be
-- open (`ended_at is null`) because a SessionEnd hook will close it. A 'sync' row is the FALLBACK for a
-- project with no hook installed at all — it is upserted by `cc sync`, is never open, and exists so
-- that "last heard from" has an answer even when nothing was opted in.
create table if not exists presence (
    project       text not null,
    agent         text not null,
    -- The harness's own session id for a hook row, or the literal 'sync' for the fallback row, which
    -- is why one (project, agent) pair has exactly one of those however often it syncs.
    session       text not null,
    kind          text not null default 'session' check (kind in ('session', 'sync')),
    started_at    timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    -- Null means nothing has told us it finished. That is NOT the same as "it is running", and the
    -- page says the difference: an un-ended session older than the live window reads as last-heard-
    -- from rather than as working, because a closed terminal never sends SessionEnd.
    ended_at      timestamptz,
    end_reason    text,
    branch        text,
    model         text,
    primary key (project, agent, session)
);

create index if not exists presence_project_idx on presence (project, last_seen_at desc);

-- OBSERVED BY A HOOK, OR RECONSTRUCTED AFTER THE FACT. This one bit is the honesty of the timeline.
--
-- Hooks only know about sessions that started after they were installed, so a hub set up this morning
-- has nothing to say about last night — and a page that is empty the day it ships is the failure this
-- feature has already had once. `cc backfill` reads Claude Code's own transcripts and reconstructs the
-- stretches of activity in them: real timestamps written by the harness, but not what a SessionStart
-- hook saw, and with boundaries inferred from gaps rather than reported by anything.
--
-- A block on a chart is a claim about a span of time. Two kinds of claim, stored apart and drawn apart.
alter table presence add column if not exists observed boolean not null default true;

-- APPROVALS: a tool call an agent is holding on, waiting for one tap on his phone.
--
-- ITS OWN TABLE, AND THAT IS THE ENFORCEMENT RATHER THAN A PROMISE. The brief's non-negotiables are
-- that a permission request never becomes a task or a question and never enters the counts. Putting it
-- in `tasks` with a flag would have made every count in the hub one `where` clause away from being
-- wrong; a separate table means no query that counts his work can see this one by accident.
--
-- The lifetime is minutes rather than days, which is the other half of why it cannot be a question: a
-- question with a timed default resolves in HOURS and that is the feature. This expires in ten, because
-- that is the agent hook's budget, and past it the agent asks in the terminal instead.
create table if not exists approvals (
    id             text primary key,
    project        text not null,
    agent          text not null,
    session        text,
    -- The harness's `tool_use_id`. Makes a re-post idempotent: `cc permission` posts once and then
    -- polls, but a dropped connection means it posts again, and a second row would mean a second
    -- Telegram message about one held tool call.
    tool_use_id    text,
    -- SANITISED AT THE BOUNDARY, both of them. These are agent-authored strings rendered on his phone,
    -- so direction-override and invisible characters are stripped and the length is capped before the
    -- row is written — not on the way out. See `sanitiseForDisplay` in lib/store.ts for why the
    -- cleaning happens on the way IN.
    tool_name      text not null,
    preview        text,
    status         text not null default 'pending'
                   check (status in ('pending', 'allowed', 'denied', 'expired')),
    decided_at     timestamptz,
    -- 'web' or 'telegram'. Not who — there is one human — but WHERE, which is the useful fact when a
    -- decision arrives and you are wondering whether the channel worked.
    decided_by     text,
    -- SET AT CREATION, so expiry needs no cron for the same reason a timed default does not: it is
    -- applied lazily by whoever reads next, and "whoever reads next" includes the polling hook.
    expires_at     timestamptz not null,
    tg_message_id  bigint,
    created_at     timestamptz not null default now()
);

create unique index if not exists approvals_tool_use_uniq
    on approvals (project, tool_use_id) where tool_use_id is not null;
create index if not exists approvals_pending_idx on approvals (status, expires_at);

-- SUB-AGENTS: one row per sub-agent, and never one per tool call.
--
-- THE VOLUME CONSTRAINT IS THE WHOLE DESIGN. A Claude Code session makes hundreds of tool calls;
-- fifteen projects is tens of thousands of writes a day, and the payload cliff §XXVI spent a session
-- removing was caused by far less. So the hooks that write here are matched to the Task/Agent tool
-- alone: one row when a sub-agent is spawned, closed when it stops. Nothing else in the harness
-- produces a row, and no hook here fires on an ordinary tool call.
--
-- WHAT THE HARNESS ACTUALLY HANDS OVER, measured rather than assumed (docs/ITERATION-LOG.md §XXXII).
-- `PostToolUse` on the Agent tool carries `tool_input.subagent_type`, `tool_input.description` and a
-- `tool_response` holding `status`, `agentId`, `resolvedModel`, `totalToolUseCount` and a `toolStats`
-- object with `editFileCount`, `linesAdded` and `linesRemoved`. That is name, task, outcome and what it
-- touched, from one hook.
--
-- TWO PATHS, AND THE SECOND ONE IS WHY `agent_id` EXISTS. A synchronous sub-agent is closed by
-- `PostToolUse` with `status: "completed"`. A BACKGROUNDED one returns `status: "async_launched"` about
-- a tenth of a second after it starts, carrying `duration_ms: 9` — a figure about the launch and not
-- about the work. Storing that would have drawn a nine-millisecond block for an agent that ran for
-- seven seconds. The background path is closed by `SubagentStop`, which carries only `agent_id`.
--
-- NO DURATION COLUMN. The span is `started_at` to `ended_at`, both observed here, and the harness's own
-- `totalDurationMs` is deliberately not stored beside them: one span with two recorded truths is the
-- shape this codebase keeps being bitten by, and the chart and the text have to be reading the same
-- number or one of them is lying.
create table if not exists subagents (
    id             text primary key,
    project        text not null,
    agent          text not null,
    -- The PARENT session id, which is what lets a sub-agent be drawn inside the session block that
    -- spawned it rather than on a lane of its own.
    session        text not null,
    tool_use_id    text,
    -- Only knowable after the spawn, and the only identifier `SubagentStop` carries.
    agent_id       text,
    -- 'Explore', 'general-purpose', or whatever the project named its own. Sanitised at the boundary.
    type           text not null,
    -- The one-line description the parent gave it. Agent-authored text, so sanitised on the way in for
    -- the same reason `approvals.preview` is.
    task           text,
    model          text,
    started_at     timestamptz not null default now(),
    -- FALSE when a closing event created this row, so `started_at` is when the hub first heard of it
    -- rather than when it began. The timeline marks those blocks instead of drawing an unmeasured span
    -- as though it had been measured.
    start_seen     boolean not null default true,
    ended_at       timestamptz,
    -- completed | failed | ended | null. 'ended' is what the background path earns: SubagentStop fires
    -- whether the work went well or not, so calling it success would be the same overclaim as saying an
    -- agent "is working" on the evidence of one sync.
    outcome        text,
    tool_calls     integer,
    edits          integer,
    lines_added    integer,
    lines_removed  integer,
    created_at     timestamptz not null default now()
);

create unique index if not exists subagents_tool_use_uniq
    on subagents (project, tool_use_id) where tool_use_id is not null;
create unique index if not exists subagents_agent_uniq
    on subagents (project, agent_id) where agent_id is not null;
create index if not exists subagents_started_idx on subagents (started_at desc);
create index if not exists subagents_session_idx on subagents (project, session, started_at);
-- The same bit, for the same reason. See the note on presence.observed above.
alter table subagents add column if not exists observed boolean not null default true;

-- REPORTS: WHAT WAS SAID, BY WHOM, AND WHEN. The table that makes this a command centre rather than a
-- status board — and the one that had to be argued for hardest, because the rule directly above it
-- refuses exactly the thing it looks like.
--
-- WHAT IS STILL REFUSED, unchanged: a field an agent fills in about its own state. No `doing`, no
-- `status`, no `progress`. An agent asked to self-report health reports green, and a single
-- green-while-you-slept status poisons every other indicator on the page.
--
-- WHY THESE ROWS ARE NOT THAT. Two properties, and both are needed:
--
--   1. NOTHING HERE IS AUTHORED BY THE AGENT ABOUT ITSELF. `said` is the harness's own
--      `last_assistant_message` from the Stop hook — the actual words a turn ended with. `told` is the
--      prompt the human typed. `waiting` is Claude Code's Notification event reporting that IT is
--      waiting for a person. An agent cannot flatter itself through any of the three, because none of
--      them asks it a question.
--   2. NOTHING HERE IS A CLAIM ABOUT NOW. A row says "at 14:32 this was said", which is true forever
--      and needs nothing to keep it true. A status column is a claim about the present that something
--      has to maintain, and the thing that maintains it is always the thing that stops firing.
--
-- The test, from AGENTS.md: **can it name who said it and when?** Every row here answers with `agent`,
-- `session` and `at`.
--
-- `session` IS THE CONVERSATION, NEVER A RUN. The hub splits a long-lived conversation into runs at gaps
-- in its activity, and those boundaries are drawn here rather than known out there — so a report is
-- joined to a run by asking which run was going at the time. See baseSession() in lib/timeline.ts.
--
-- THE ONLY TABLE THAT GROWS AT A RATE rather than at an event: one `said` row per turn. Nothing reads it
-- without a time window and a LIMIT, and the body is capped at 400 characters on the way in.
--
-- NO SECRETS, enforced rather than promised. `last_assistant_message` is prose nobody wrote for a
-- database, so token-shaped words are replaced with `(redacted)` before the insert. This is the one path
-- in the hub that redacts instead of refusing, because nobody can rewrite something already said.
create table if not exists reports (
    id       text primary key,
    project  text not null,
    agent    text not null,
    session  text not null,
    kind     text not null check (kind in ('said', 'told', 'waiting')),
    body     text,
    at       timestamptz not null default now()
);
-- The two reads that exist: the newest per project, and one project's thread. Both are covered.
create index if not exists reports_project_idx on reports (project, at desc);
create index if not exists reports_session_idx on reports (project, session, at desc);

-- SPEND: TOKENS, and never money.
--
-- This is the one figure in the hub that comes from outside it, so unlike every other number here it
-- cannot be recomputed from `tasks` and `questions` — which is exactly what makes it an observation
-- that legitimately gets a row rather than a stored score.
--
-- What it stores is the TOKEN COUNTS. The money is a fold over these and a price table in
-- lib/prices.ts, and that split is the same one the whole progress system is built on: a wrong price
-- is fixed by deploying, where a stored dollar figure would have to be migrated. It also means the
-- row stays true when a price changes, which a dollar column would not.
--
-- Keyed by SOURCE as well as project and model. One machine posts a complete snapshot and replaces its
-- own rows, so a second machine cannot silently overwrite the first's measurement — the page adds them
-- up. Without `source` the last machine to run the summariser would win and nothing would say so.
create table if not exists spend (
    source          text not null,
    project         text not null,
    model           text not null,
    input_tokens    bigint not null default 0,
    output_tokens   bigint not null default 0,
    cache_write_5m  bigint not null default 0,
    cache_write_1h  bigint not null default 0,
    cache_read      bigint not null default 0,
    -- How many usage records this total was folded over, so the page can say how much it actually read
    -- instead of asking to be believed.
    samples         integer not null default 0,
    measured_at     timestamptz not null default now(),
    primary key (source, project, model)
);
