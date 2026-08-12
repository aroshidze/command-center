/**
 * THE SCHEMA, AS DATA, SO IT CAN BE APPLIED FROM ANYWHERE.
 *
 * `scripts/schema.sql` is the readable description of what the hub stores and why — every column in it
 * carries the reasoning for its own existence, and that file is where to go to understand the design. This
 * module is the EXECUTABLE copy of the same statements, and it exists because the SQL file could only ever be
 * applied by a human at a terminal.
 *
 * WHY THAT MATTERED ENOUGH TO DUPLICATE IT.
 *
 * Local development runs against a Neon `dev` branch and production's connection string is not on any
 * developer's machine (docs/ENVIRONMENT.md). That isolation is worth keeping — `npm run fixture` writes 22
 * tasks and deletes rows, many times an hour, and before the split those runs were landing in the owner's real
 * queue. But it had a consequence nobody designed: **a schema change had no path to production that did not go
 * through the one human the hub exists to protect.** Every agent that needed one hit the wall, wrote "you
 * cannot migrate the production database" into its handover, and filed the migration as a task for him. Three
 * briefs carry that sentence. He was, correctly, furious.
 *
 * So the schema applies itself. Deploying is the migration.
 *
 * ---
 *
 * THE OBJECTION THIS HAS TO ANSWER, because it was written down and it is correct.
 *
 * `scripts/schema.sql` opened with: *"There is deliberately no auto-migration on request: a schema change
 * racing several serverless invocations is a good way to get a half-created table, and a hub whose first task
 * is 'fix the hub' is no use to anyone."*
 *
 * That is a real hazard and not a hypothetical one. `create table if not exists` is idempotent but NOT
 * race-safe: two concurrent invocations can both pass the existence check and one then fails inserting into
 * `pg_type`, which surfaces as a duplicate-key error on an internal index rather than as anything about your
 * table. Postgres has behaved this way for years.
 *
 * Three things answer it, and all three are needed:
 *
 *  1. **An advisory lock**, so only one invocation applies the schema at a time. Postgres advisory locks are
 *     cheap, session-scoped and release themselves when the connection goes, which matters on a platform that
 *     can kill a function mid-flight.
 *  2. **Tolerating the race anyway** (`isAlreadyExists`), because the lock cannot cover an invocation that
 *     started before this code deployed. A duplicate-object error means the table exists, which is the exact
 *     end state wanted — so it is success, not failure.
 *  3. **Every statement is additive.** No DROP, no ALTER that narrows a type, no constraint added to existing
 *     rows. The worst outcome of applying this list twice is wasted milliseconds. This is the property that
 *     makes the whole idea safe, and it is the one to check before adding anything here: if a statement could
 *     lose data or fail on existing rows, it does NOT belong in this list — it belongs in a deliberate
 *     migration run by a person who is watching.
 *
 * Kept as a plain array of strings with no imports at all, so `scripts/init-db.mjs` and the proof suites can
 * load it through Node's type-stripping. A value import between two `lib/*.ts` files breaks that (AGENTS.md
 * trap 2); a module that imports nothing cannot.
 */

/** The five tables that hold real work, plus `settings`. Order matters: tables before their indexes. */
export const SCHEMA_STATEMENTS: string[] = [
    `create table if not exists tasks (
        id              text primary key,
        project         text not null,
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
    )`,
    `create unique index if not exists tasks_project_key_uniq
        on tasks (project, key) where key is not null`,
    `create index if not exists tasks_open_idx on tasks (status, created_at)`,

    `create table if not exists questions (
        id              text primary key,
        project         text not null,
        key             text,
        title           text not null,
        context         text,
        options         jsonb not null default '[]'::jsonb,
        allow           jsonb not null default '["choose"]'::jsonb,
        default_option  text,
        deadline        timestamptz,
        status          text not null default 'open'
                        check (status in ('open', 'answered', 'defaulted', 'ignored')),
        answer_type     text,
        answer_option   text,
        answer_text     text,
        answer_note     text,
        answered_at     timestamptz,
        asked_by        text,
        tg_message_id   bigint,
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
    )`,
    `create unique index if not exists questions_project_key_uniq
        on questions (project, key) where key is not null`,
    `create index if not exists questions_open_idx on questions (status, created_at)`,
    /* For a database created before answer_note existed; `create table if not exists` will not add a column
     * to an existing table. Additive, so it satisfies rule 3 above. */
    `alter table questions add column if not exists answer_note text`,

    `create table if not exists notes (
        id          text primary key,
        project     text,
        body        text not null,
        source      text not null check (source in ('telegram', 'web', 'api')),
        created_at  timestamptz not null default now()
    )`,

    `create table if not exists events (
        seq      bigserial primary key,
        at       timestamptz not null default now(),
        kind     text not null,
        project  text,
        ref_id   text,
        summary  text not null
    )`,
    `create index if not exists events_seq_idx on events (seq desc)`,

    `create table if not exists agents (
        name          text primary key,
        last_sync_at  timestamptz,
        last_cursor   bigint not null default 0,
        sync_count    integer not null default 0
    )`,

    `create table if not exists settings (
        key         text primary key,
        value       text not null,
        updated_at  timestamptz not null default now()
    )`,

    /* ------------------------------------------------------------------------------------------
     * PRESENCE. See scripts/schema.sql for the whole argument; the short version is that an empty
     * queue and a dead agent used to look identical, and that was the sharpest true criticism of
     * this product.
     *
     * An OBSERVATION gets a row and a FOLD does not — docs/BRIEF-NOTHING-BLOCKED.md §4. "A session
     * started" is an observation. "This project is stalled" is a fold over these rows and has no
     * column anywhere.
     * ---------------------------------------------------------------------------------------- */
    `create table if not exists presence (
        project       text not null,
        agent         text not null,
        session       text not null,
        kind          text not null default 'session' check (kind in ('session', 'sync')),
        started_at    timestamptz not null default now(),
        last_seen_at  timestamptz not null default now(),
        ended_at      timestamptz,
        end_reason    text,
        branch        text,
        model         text,
        primary key (project, agent, session)
    )`,
    `create index if not exists presence_project_idx on presence (project, last_seen_at desc)`,
    /*
     * OBSERVED BY A HOOK, OR RECONSTRUCTED AFTER THE FACT — and this column is the honesty of the whole
     * timeline in one bit.
     *
     * A hub where the hooks were installed this morning knows nothing about last night, and a page that
     * is empty on the morning it ships is the failure this feature already had once. So `cc backfill`
     * reads Claude Code's own transcripts and reconstructs the stretches of activity in them. Those are
     * real observations — message timestamps, written by the harness — but they are NOT what a
     * SessionStart hook saw, and the boundaries of a stretch are inferred from gaps rather than reported.
     *
     * A block on a chart is a claim about a span of time. The two kinds of claim are different, so they
     * are stored differently and drawn differently, rather than being quietly mixed and both asserted
     * with the same confidence.
     */
    `alter table presence add column if not exists observed boolean not null default true`,

    /* ------------------------------------------------------------------------------------------
     * APPROVALS — a tool call an agent is holding on, waiting for one tap.
     *
     * NOT a task and NOT a question, and the separate table is what enforces that rather than a
     * comment promising it. Different lifetime (minutes, not days), different surface, and nothing
     * in `board()`'s counts reads this table.
     * ---------------------------------------------------------------------------------------- */
    `create table if not exists approvals (
        id             text primary key,
        project        text not null,
        agent          text not null,
        session        text,
        tool_use_id    text,
        tool_name      text not null,
        preview        text,
        status         text not null default 'pending'
                       check (status in ('pending', 'allowed', 'denied', 'expired')),
        decided_at     timestamptz,
        decided_by     text,
        expires_at     timestamptz not null,
        tg_message_id  bigint,
        created_at     timestamptz not null default now()
    )`,
    `create unique index if not exists approvals_tool_use_uniq
        on approvals (project, tool_use_id) where tool_use_id is not null`,
    `create index if not exists approvals_pending_idx on approvals (status, expires_at)`,

    /* ------------------------------------------------------------------------------------------
     * SUB-AGENTS — one row per sub-agent, and NEVER one per tool call.
     *
     * The refusal in docs/BRIEF-NOTHING-BLOCKED.md §4 was "a sub-agent event firehose", and half of
     * that refusal survives contact with the owner's actual request and half does not. What survives is
     * the volume argument: a session makes hundreds of tool calls, fifteen projects is tens of thousands
     * of rows a day, and §XXVI was a whole session spent removing a payload cliff caused by far less.
     * What does not survive is "sub-agents live for seconds, rendering them is motion" — measured on
     * this machine they run for tens of seconds to several minutes, and what he asked to see is which
     * ones ran and what they were asked to do, which is a fact rather than a motion.
     *
     * So the hooks that write here are matched to the Task/Agent tool ONLY. One row is opened when a
     * sub-agent is spawned and closed when it stops. Nothing else in the harness produces a row.
     *
     * NO DURATION COLUMN, DELIBERATELY. The harness reports `totalDurationMs` on the synchronous path
     * and reports nothing at all on the background path, and storing it would give one span two truths —
     * the one the chart draws (`started_at` to `ended_at`, both observed here) and the one the text
     * quotes. This codebase has been bitten by exactly that shape before; see the note on `stripped` in
     * `mapApproval` for the same decision taken the same way.
     * ---------------------------------------------------------------------------------------------- */
    `create table if not exists subagents (
        id             text primary key,
        project        text not null,
        agent          text not null,
        /* The PARENT session, so a sub-agent can be nested inside the session block that spawned it. */
        session        text not null,
        /* The harness's id for the spawning tool call. Present on both hook events that can open a row,
           which is what makes a re-post find the same row instead of making a second one. */
        tool_use_id    text,
        /* The harness's id for the sub-agent itself. Only knowable AFTER the spawn, and it is the only
           thing SubagentStop carries — so it is what closes a backgrounded sub-agent. */
        agent_id       text,
        type           text not null,
        task           text,
        model          text,
        started_at     timestamptz not null default now(),
        /* False when the row was created by a CLOSING event, so its start time is when the hub first
           heard of it rather than when it began. A block drawn from an unobserved start is a claim
           about a span nobody measured, and the timeline says so on the block rather than quietly
           drawing it. */
        start_seen     boolean not null default true,
        ended_at       timestamptz,
        /* completed | failed | ended | null. "ended" is the honest outcome for the background path.
           NO BACKTICKS IN HERE: this comment is inside a template literal in lib/schema.ts and a pair of
           them closes it. Trap 1 in AGENTS.md, fifteenth occurrence, written minutes after reading it —
           and typecheck named this file in three seconds, which is why it runs first.
           SubagentStop fires whether the work went well or not and says nothing about which, so
           claiming success there would be the same overclaim as "is working on" over a bare sync. */
        outcome        text,
        tool_calls     integer,
        edits          integer,
        lines_added    integer,
        lines_removed  integer,
        created_at     timestamptz not null default now()
    )`,
    `create unique index if not exists subagents_tool_use_uniq
        on subagents (project, tool_use_id) where tool_use_id is not null`,
    `create unique index if not exists subagents_agent_uniq
        on subagents (project, agent_id) where agent_id is not null`,
    /* The timeline reads a WINDOW of recent rows, so the index it needs is by time. `project` leads
       because the lanes are per project and the fold groups on it. */
    `create index if not exists subagents_started_idx on subagents (started_at desc)`,
    `create index if not exists subagents_session_idx on subagents (project, session, started_at)`,
    /* The same bit, for the same reason. See the note on presence.observed. */
    `alter table subagents add column if not exists observed boolean not null default true`,

    /* ------------------------------------------------------------------------------------------
     * REPORTS — WHAT WAS SAID, BY WHOM, AND WHEN. The table that makes the hub a control centre
     * rather than a status board.
     *
     * WHY THIS DOES NOT BREAK THE RULE THAT BANNED IT. `lib/presence.ts` says, and still says, that
     * there is no field an agent fills in about its own state: *"an agent asked to self-report health
     * reports green, and a single green-while-you-slept status poisons every other indicator on the
     * page."* That refusal is intact. Every row here is a QUOTE with a time on it, not an assessment:
     *
     *   said     the last thing the assistant actually said, handed over by the `Stop` hook in
     *            `last_assistant_message`. The harness's own record of a turn's final words.
     *   told     what he typed, from `UserPromptSubmit`. His half of the conversation.
     *   waiting  the harness said the agent is waiting for a human — `Notification` with a type of
     *            `agent_needs_input`, `idle_prompt` or `permission_prompt`. Reported BY THE HARNESS
     *            about the agent, which is why it is admissible where a self-declared "blocked" is not.
     *
     * The test from AGENTS.md is "can it name who said it and when?", and every row here answers with
     * `agent`, `session` and `at`. Nothing in this table is a current-state field that something has to
     * keep true: a row is true forever, because it is a record of a moment.
     *
     * APPEND-ONLY, AND READ WITH A BOUND. One `said` row per turn is a few hundred rows a day at his
     * volume. Nothing reads this table without a `limit` and a time window — §XXVI was a whole session
     * spent on a payload cliff caused by less.
     *
     * NO SECRETS, enforced rather than promised: `recordReport` redacts token-shaped words before the
     * insert, because `last_assistant_message` is text nobody wrote for this database.
     * ---------------------------------------------------------------------------------------- */
    `create table if not exists reports (
        id       text primary key,
        project  text not null,
        agent    text not null,
        /* The CONVERSATION's id as the harness reports it, never a run id. The hub splits a long
           conversation into runs at gaps in its activity, and those boundaries are drawn here rather
           than known out there; joining a report to a run is a question of which run was going at the
           time. See baseSession() in lib/timeline.ts. */
        session  text not null,
        kind     text not null check (kind in ('said', 'told', 'waiting')),
        body     text,
        at       timestamptz not null default now()
    )`,
    /* The two reads that exist: the newest per project, and one project's thread. Both are covered. */
    `create index if not exists reports_project_idx on reports (project, at desc)`,
    `create index if not exists reports_session_idx on reports (project, session, at desc)`,
    /*
     * IDEMPOTENCE FOR REPORTS THAT CARRY THEIR OWN TIMESTAMP.
     *
     * A hook reports once, as it happens, and `at` defaults to now — nothing to collide with. But `cc sync`
     * now also catches up from the transcript for a session whose hooks were installed after it started
     * (they are read at session start, so such a session can never report on its own). That catch-up runs
     * every sync, which is several times a session, and it re-reads the SAME last message each time.
     *
     * Without this index the thread would fill with the same paragraph over and over. With it, a repeat is a
     * no-op: one row per moment per kind per conversation, which is exactly what the truth is.
     *
     * `at` is part of the key rather than a `where` clause, because two different things genuinely said at
     * the same millisecond in the same session is not a thing that happens, and a re-post of the same
     * message always carries the same `at` — it comes from the transcript, not from the clock.
     */
    `create unique index if not exists reports_moment_uniq on reports (project, session, kind, at)`,

    /* ------------------------------------------------------------------------------------------
     * SPEND — TOKENS, never money. The money is a fold over these numbers and a price table that
     * lives in lib/prices.ts, so a wrong price is fixed by deploying rather than by migrating.
     * ---------------------------------------------------------------------------------------- */
    `create table if not exists spend (
        source          text not null,
        project         text not null,
        model           text not null,
        input_tokens    bigint not null default 0,
        output_tokens   bigint not null default 0,
        cache_write_5m  bigint not null default 0,
        cache_write_1h  bigint not null default 0,
        cache_read      bigint not null default 0,
        samples         integer not null default 0,
        measured_at     timestamptz not null default now(),
        primary key (source, project, model)
    )`,
];

/**
 * The tables whose absence means the hub cannot work. `settings` is deliberately NOT here: it holds a
 * preference rather than any real work, and a hub with no settings row is a hub showing default colours,
 * which is not a broken hub. /api/health should say the same thing.
 *
 * `presence`, `approvals`, `subagents` and `spend` are not here for a stronger version of the same reason:
 * all four are OPT-IN, and a hub where nobody installed a hook has nothing to put in them. An empty
 * `presence` table and a hub that cannot read its database must not produce the same message.
 */
export const CORE_TABLES: string[] = ['agents', 'events', 'notes', 'questions', 'tasks'];

/** Every table this schema creates, core plus the rest. */
export const ALL_TABLES: string[] = [
    ...CORE_TABLES, 'settings', 'presence', 'approvals', 'subagents', 'spend', 'reports',
];

/**
 * A lock id for `pg_advisory_lock`. Any constant works as long as nothing else in this database uses the
 * same one; it is arbitrary and derived from nothing, which is why it is written out rather than computed
 * from a string hash that a reader would have to run to understand.
 */
export const SCHEMA_LOCK_ID = 4_120_577_301;

/**
 * True for the errors that mean "somebody else created it first".
 *
 * `42P07` is duplicate_table, `42701` duplicate_column, `42710` duplicate_object. `23505` is a unique
 * violation, which is how a `pg_type` race actually surfaces — and it is the reason this predicate exists
 * rather than a bare `if not exists` being considered sufficient.
 */
export function isAlreadyExists(e: unknown): boolean {
    const code = (e as { code?: string } | null)?.code;
    return code === '42P07' || code === '42701' || code === '42710' || code === '23505';
}
