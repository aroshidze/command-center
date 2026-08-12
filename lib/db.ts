import { AsyncLocalStorage } from 'node:async_hooks';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import {
    ALL_TABLES, CORE_TABLES, isAlreadyExists, SCHEMA_LOCK_ID, SCHEMA_STATEMENTS,
} from './schema';

/**
 * Database access, and the one rule this whole file exists to enforce:
 *
 *   NOTHING IS EVER REPORTED AS SAVED UNTIL IT HAS BEEN READ BACK OUT OF THE DATABASE.
 *
 * This is not defensive habit, it is the specific bug the brief calls the worst there is: an app that
 * says "saved" over a write the database rejected, and loses hand-entered data. See `writeVerified`.
 */

let cached: NeonQueryFunction<false, false> | null = null;

export class ConfigError extends Error {}

export function sql(): NeonQueryFunction<false, false> {
    if (cached) return cached;
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new ConfigError(
            'DATABASE_URL is not set. Copy .env.example to .env.local and paste the Neon pooled ' +
            'connection string. See docs/SETUP.md step 1.',
        );
    }

    /*
     * Diagnose the malformed cases by hand, because the driver's own message for a bad URL includes the
     * whole connection string — password and all — in the exception, which then lands in logs and
     * terminal scrollback. This happened during setup. Checking the shape first means the common typos
     * produce an instruction instead of a credential leak.
     *
     * Never interpolate `url` into a thrown message here.
     */
    if (/^[A-Z_]+=/.test(url)) {
        throw new ConfigError(
            'DATABASE_URL starts with a variable name, so the line in .env.local probably reads ' +
            '`DATABASE_URL=DATABASE_URL=postgresql://…`. Paste only the value, not the whole line.',
        );
    }
    if (!/^postgres(ql)?:\/\//.test(url)) {
        throw new ConfigError(
            'DATABASE_URL does not begin with postgresql://. Check it is the connection string and not ' +
            'the psql command or the connection-parameters view.',
        );
    }
    if (/\s/.test(url)) {
        throw new ConfigError(
            'DATABASE_URL contains whitespace or a line break. The Neon console wraps the string across ' +
            'several lines for display; it must be a single line in .env.local.',
        );
    }
    if (url.includes('*')) {
        throw new ConfigError(
            'DATABASE_URL still contains asterisks, so the masked version was copied. Press ' +
            '"Show password" in the Neon console first, then copy.',
        );
    }
    try {
        new URL(url);
    } catch {
        throw new ConfigError(
            'DATABASE_URL is not a valid URL. Check for a stray quote, a trailing comma, or a character ' +
            'lost in copying. (The value is deliberately not printed here — it contains the password.)',
        );
    }

    cached = neon(url);
    return cached;
}

/* ------------------------------------------------------------------------------------------------
 * Fault injection — the only way to honour brief §6 ("a check that cannot fail is worse than no
 * check": make it fail on purpose and confirm that it does).
 *
 * Double-gated on purpose. Both an explicit opt-in variable AND a non-production environment are
 * required, so there is no single flag that could be set in production by accident and no path by
 * which a deployed hub can be told to lie about a write.
 * ---------------------------------------------------------------------------------------------- */

export type FaultMode =
    /** Skip the write but carry on as if it had happened — a silently rejected write. */
    | 'swallow-write'
    /**
     * Perform the write, then read back a row with the written fields reverted — as if a trigger, a
     * rolled-back transaction or a replica lag had quietly undone it. This is the case `RETURNING`
     * alone cannot catch, and the reason the verifier does a second independent SELECT.
     */
    | 'revert-on-reread'
    /** Make the write affect zero rows — a write against a row that is not there. */
    | 'write-nothing'
    | null;

const VALID: FaultMode[] = ['swallow-write', 'revert-on-reread', 'write-nothing'];

const parse = (v: string | null | undefined): FaultMode =>
    VALID.includes(v as FaultMode) ? (v as FaultMode) : null;

/**
 * Faults are scoped to one request rather than the whole process, so a test can prove the verifier
 * catches a bad write in the same server run that proves it accepts a good one. Without this, "we made
 * the check fail" would mean restarting with a different environment, which is exactly the kind of
 * separate-conditions verification that lets a real regression hide.
 */
const requestFault = new AsyncLocalStorage<FaultMode>();

export function faultsEnabled(): boolean {
    return process.env.CC_ALLOW_FAULT_INJECTION === 'yes' && process.env.NODE_ENV !== 'production';
}

/** Reads `x-cc-fault`. Returns null unless faults are enabled, so the header is inert in production. */
export function faultFromRequest(req: Request): FaultMode {
    if (!faultsEnabled()) return null;
    return parse(req.headers.get('x-cc-fault'));
}

export function withFault<T>(mode: FaultMode, fn: () => Promise<T>): Promise<T> {
    return mode ? requestFault.run(mode, fn) : fn();
}

export function faultMode(): FaultMode {
    if (!faultsEnabled()) return null;
    return requestFault.getStore() ?? parse(process.env.CC_FAULT);
}

/* ---------------------------------------------------------------------------------------------- */

export class WriteFailed extends Error {
    readonly what: string;
    readonly reason: string;
    constructor(what: string, reason: string) {
        super(`refusing to report "${what}" as saved: ${reason}`);
        this.name = 'WriteFailed';
        this.what = what;
        this.reason = reason;
    }
}

export interface VerifiedWrite<T> {
    /** Human-readable name of the thing being written, used in error messages. */
    what: string;
    /** The mutation. Must use `RETURNING *` so a zero-row write is detectable here and not later. */
    write: () => Promise<T[]>;
    /**
     * An INDEPENDENT `SELECT` of the same row.
     *
     * Yes, `RETURNING` already hands back the post-write row, and for a plain rejected write that is
     * enough. The separate read exists to catch the cases `RETURNING` cannot: the wrong row updated, a
     * value coerced or truncated on the way in, or a trigger rewriting what was stored. These tables
     * have tens of rows, so the extra round trip is free in practice and buys certainty rather than
     * inference.
     */
    reread: () => Promise<T[]>;
    /** Assert the re-read row really holds what was intended. Return null if fine, else the reason. */
    expect: (row: T) => string | null;
    /**
     * Let the mutation match zero rows without that being a failure.
     *
     * For `on conflict … do nothing` only, where an empty result means the row is already there. The re-read
     * and `expect` still decide the outcome, so this widens what the WRITE may return and never what counts
     * as verified. Absent everywhere else, deliberately: a zero-row write is the signal that has caught real
     * defects here.
     */
    allowNoRows?: boolean;
}

/**
 * Run a mutation and refuse to return successfully unless the database can be shown to hold the
 * intended result. Throws `WriteFailed` otherwise — callers must let that surface as an error to the
 * user, never swallow it into an optimistic "saved".
 */
export async function writeVerified<T extends Record<string, unknown>>(
    spec: VerifiedWrite<T>,
): Promise<T> {
    const fault = faultMode();

    let written: T[];
    if (fault === 'swallow-write') {
        // Pretend the statement ran and returned a row. A naive implementation would now report success.
        written = [{ __faked: true } as unknown as T];
    } else if (fault === 'write-nothing') {
        written = [];
    } else {
        written = await spec.write();
    }

    /*
     * ZERO ROWS IS NORMALLY A FAILURE AND ON ONE PATH IT IS NOT.
     *
     * `on conflict … do nothing` returns nothing when the row is already there, which is success — the
     * database holds the intended state, somebody else put it there. `cc sync` re-posts the same transcript
     * message on every sync and relies on exactly that.
     *
     * IT IS OPT-IN PER WRITE rather than a global relaxation, because "the write matched zero rows" is the
     * signal that caught real defects in this codebase and must keep failing everywhere else. And the
     * re-read still runs unconditionally: `allowNoRows` permits the INSERT to do nothing, never the
     * verification to be skipped, so a caller that sets it still cannot report success over an empty table.
     */
    if (written.length === 0 && !spec.allowNoRows) {
        throw new WriteFailed(spec.what, 'the write matched zero rows, so nothing was stored');
    }
    if (written.length > 1) {
        throw new WriteFailed(
            spec.what,
            `the write matched ${written.length} rows, which means the target was ambiguous`,
        );
    }

    let rows = await spec.reread();
    if (fault === 'revert-on-reread' && rows[0]) {
        // Every field a write in this codebase sets, put back to its pre-write value.
        rows = [{
            ...rows[0],
            status: 'open',
            note: null,
            answer_type: null,
            answer_option: null,
            answer_text: null,
            answered_at: null,
            done_at: null,
            title: '(reverted by fault injection)',
            body: '(reverted by fault injection)',
        } as unknown as T];
    }

    if (rows.length === 0) {
        throw new WriteFailed(spec.what, 'the row could not be read back after writing');
    }

    const problem = spec.expect(rows[0]);
    if (problem) {
        throw new WriteFailed(spec.what, `the database does not hold what was intended: ${problem}`);
    }

    return rows[0];
}

/** True if the schema has been created. Used by /api/health to give an actionable error, not a 500. */
export async function schemaReady(): Promise<boolean> {
    const rows = (await sql()`
        select count(*)::int as n
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('tasks', 'questions', 'notes', 'events', 'agents')
    `) as { n: number }[];
    return rows[0]?.n === CORE_TABLES.length;
}

/* ------------------------------------------------------------------------------------------------
 * APPLYING THE SCHEMA FROM INSIDE THE RUNNING HUB.
 *
 * The whole argument for why this exists, and the objection it has to answer, is in lib/schema.ts. The
 * short version: production's connection string is not on any developer's machine, so before this a
 * schema change could only be applied by the one human the hub exists to protect. Deploying is now the
 * migration.
 *
 * Guarded by the promise rather than a boolean so concurrent first requests await one attempt instead of
 * racing, and cleared on failure so a transient connection drop cannot convince a long-lived instance
 * that the schema will never exist.
 * ---------------------------------------------------------------------------------------------- */

let schemaApplied: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
    if (!schemaApplied) {
        schemaApplied = applySchema().catch((e: unknown) => {
            schemaApplied = null;
            throw e;
        });
    }
    return schemaApplied;
}

async function applySchema(): Promise<void> {
    const db = sql();

    /*
     * One invocation applies the schema at a time. The lock is taken before the existence check rather
     * than after, because the gap between "does this table exist" and "create it" is precisely the race.
     *
     * If the lock cannot be taken the schema is applied anyway: an advisory lock is an optimisation here,
     * not the correctness argument. `isAlreadyExists` is the correctness argument, and it holds whether or
     * not the lock was granted — which also covers the invocation that started before this code deployed
     * and therefore never asked for a lock at all.
     */
    let locked = false;
    try {
        await db.query('select pg_advisory_lock($1)', [SCHEMA_LOCK_ID]);
        locked = true;
    } catch {
        /* Proceed unlocked; see above. */
    }

    try {
        for (const statement of SCHEMA_STATEMENTS) {
            try {
                await db.query(statement);
            } catch (e) {
                if (!isAlreadyExists(e)) throw e;
                /* Somebody else created it first, which is the end state this wanted. */
            }
        }
    } finally {
        if (locked) {
            try {
                await db.query('select pg_advisory_unlock($1)', [SCHEMA_LOCK_ID]);
            } catch {
                /* The lock is session-scoped and released when the connection goes, so a failure to
                 * unlock explicitly cannot strand it. Nothing to do and nothing to report. */
            }
        }
    }

    /*
     * Verified by reading the tables back, not inferred from "no statement threw". A check that only
     * asserts an absence of exceptions is the proxy measurement this codebase refuses everywhere else —
     * and here it would be actively misleading, because every statement's error is deliberately swallowed
     * when it looks like a race.
     */
    const rows = (await db`
        select table_name from information_schema.tables where table_schema = 'public'
    `) as { table_name: string }[];
    const found = new Set(rows.map(r => r.table_name));
    const missing = ALL_TABLES.filter(t => !found.has(t));
    if (missing.length) {
        throw new Error(`the schema was applied but these tables are still missing: ${missing.join(', ')}`);
    }
}
