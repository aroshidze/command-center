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
 * `presence`, `approvals` and `spend` are not here for a stronger version of the same reason: all three are
 * OPT-IN, and a hub where nobody installed a hook has nothing to put in them. An empty `presence` table and a
 * hub that cannot read its database must not produce the same message.
 */
export const CORE_TABLES: string[] = ['agents', 'events', 'notes', 'questions', 'tasks'];

/** Every table this schema creates, core plus the rest. */
export const ALL_TABLES: string[] = [...CORE_TABLES, 'settings', 'presence', 'approvals', 'spend'];

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
