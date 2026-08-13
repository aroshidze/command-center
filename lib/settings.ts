import { ensureSchema, sql, writeVerified } from './db';

type Row = Record<string, unknown>;

/**
 * The one table in this schema that creates itself.
 *
 * WHY THIS EXISTS AT ALL. Everything the hub shows is derived from `tasks` and `questions`, which is an
 * honesty rule and the foundation of the whole thing: a stored score can disagree with the rows it came from.
 * A CHOSEN LOOK IS NOT A DERIVED FACT. It is a preference, there is nothing to recompute it from, and storing
 * it cannot lie about anything — so it is the one piece of state that belongs in a table rather than in a fold
 * over the rows. `lib/looks.ts` has called it "the first piece of state in this hub that is not derived" since
 * it was a cookie.
 *
 * WHY IT CREATES ITSELF, which is the interesting part.
 *
 * The five core tables were created by running `npm run init-db` against a `DATABASE_URL`. Local development
 * later moved to a Neon `dev` branch — see docs/ENVIRONMENT.md, and the reason was that proof-suite rows were
 * appearing on the owner's real phone — so production's connection string now lives only in Vercel and nothing
 * on a developer's machine can reach the production database. That isolation is worth keeping: the fixture
 * writes twenty-two tasks and deletes rows, and it runs many times an hour.
 *
 * The consequence, though, was a migration that no agent could apply and that therefore landed in the owner's
 * own task queue as "add a settings table". He asked the right question about it: why should a human run SQL
 * for a tool whose entire purpose is to stop him doing work only he can do?
 *
 * So the migration applies itself, once per server instance, on first use. `create table if not exists` is
 * idempotent, the statement is the same one in scripts/schema.sql, and deploying the code IS the migration —
 * on his hub, and on any copy anyone else deploys. That also removes a setup step for a stranger's first ten
 * minutes, which docs/BRIEF-PUBLIC.md wants.
 *
 * This is deliberately NOT a general migration runner. It is one additive, idempotent statement for one table
 * that holds no derived truth. A column change, a constraint, or anything touching the five tables that hold
 * real work still belongs in scripts/schema.sql and still needs a deliberate hand, because those can lose data
 * and this cannot.
 */

/**
 * Guarded by the promise rather than a boolean, so concurrent first requests await one statement instead of
 * racing to issue several. Cleared on failure so a transient connection drop does not poison the process into
 * believing the table exists forever.
 *
 * The statement is written as a tagged template rather than held in a string constant, because the driver's
 * type only accepts a template — passing a plain string compiles to `TemplateStringsArray` expected. Keep it
 * character-identical to the `settings` block in scripts/schema.sql.
 */
/*
 * This used to carry its own copy of the `settings` DDL. It no longer does: `ensureSchema` in lib/db.ts
 * applies the WHOLE schema from lib/schema.ts, race-tolerantly, so there is one applier and one list rather
 * than a table that creates itself and five that cannot. Keeping a second copy here would have been the
 * beginning of exactly the drift the shared list exists to prevent.
 */
export function ensureSettings(): Promise<void> {
    return ensureSchema();
}

export async function readSetting(key: string): Promise<string | null> {
    await ensureSettings();
    const rows = (await sql()`
        select value from settings where key = ${key}
    `) as { value: string }[];
    return rows[0]?.value ?? null;
}

/**
 * Written through `writeVerified` like every other write in this codebase: the value is re-read with an
 * independent SELECT and compared before this resolves. A look that silently failed to save would be the
 * exact bug that rule exists for — he would choose a palette, see it apply on this render, and find it gone
 * on the next device he opened.
 */
export async function writeSetting(key: string, value: string): Promise<void> {
    await ensureSettings();
    /* `Row` rather than a literal shape, matching every other writeVerified call in lib/store.ts: the driver
     * types its result as Record<string, any>, and a narrower generic only moves the cast somewhere less
     * readable. */
    await writeVerified<Row>({
        what: `the ${key} setting`,
        write: () => sql()`
            insert into settings (key, value, updated_at)
            values (${key}, ${value}, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()
            returning key, value
        ` as Promise<Row[]>,
        reread: () => sql()`
            select key, value from settings where key = ${key}
        ` as Promise<Row[]>,
        expect: row => (String(row.value) === value
            ? null
            : 'the stored value is not the one that was written'),
    });
}

/** The key the chosen look is stored under. One row, because this hub has exactly one human. */
export const LOOKS_SETTING = 'looks';

/** The IANA name of the timezone every absolute time in this hub is rendered in. */
export const TIMEZONE_SETTING = 'timezone';

/**
 * IS THIS A REAL TIMEZONE? Asked of the runtime rather than of a list.
 *
 * `Intl.DateTimeFormat` throws `RangeError` on an unknown `timeZone`, so the platform's own database is the
 * validator. A hardcoded list would be a second copy of something that ships with Node and goes out of date
 * on its own — and this value is written from a browser-supplied string, so it must be checked rather than
 * trusted.
 */
export function validTimezone(zone: unknown): string | null {
    if (typeof zone !== 'string' || !zone || zone.length > 64) return null;
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date(0));
        return zone;
    } catch {
        return null;
    }
}

/**
 * WHICH TIMEZONE TO RENDER ABSOLUTE TIMES IN. `UTC` until something says otherwise.
 *
 * ==================================================================================================
 * WHY THIS IS STORED RATHER THAN DETECTED AT RENDER TIME
 * ==================================================================================================
 *
 * Every absolute time in this hub was UTC, deliberately, and `humanDate`'s own header gives the reason: the
 * pages are server-rendered and then hydrated, so a formatter that reads the machine's timezone produces one
 * string in Node and a different one in the browser — a hydration mismatch in the part of the interface whose
 * entire job is to be trustworthy. That reasoning is still correct.
 *
 * It was also, in practice, wrong for the person reading it. He is in Georgia, UTC+4, and the chart's axis
 * was four hours out of step with his own clock: *"the timeline is wrong. It's not adapted to my timeline…
 * I do not know on what time it operates."* A chart of last night that disagrees with the reader about when
 * last night was is not a small inaccuracy — it is the one claim the chart exists to make.
 *
 * So the zone is a stored value, read on the server, and the rendering stays deterministic: the SERVER
 * formats, in a zone it looked up, and the client is handed strings. Nothing formats differently in the two
 * places, so the hydration property is kept rather than traded away.
 *
 * ==================================================================================================
 * AND IT IS DETECTED, NOT ASKED FOR
 * ==================================================================================================
 *
 * The browser already knows — `Intl.DateTimeFormat().resolvedOptions().timeZone` — so a question would be a
 * setup step for a fact the machine can supply. `app/components/Zone.tsx` posts it once when it differs from
 * what the server used, which is once ever on a new hub and once more if he moves.
 */
export async function readTimezone(): Promise<string> {
    try {
        return validTimezone(await readSetting(TIMEZONE_SETTING)) ?? 'UTC';
    } catch (e) {
        /* Same rule as the look: a database that cannot be read costs him the timezone and never the page.
         * UTC is the honest fallback rather than a guess at his location. */
        console.error('[settings] could not read the timezone; rendering in UTC:',
            e instanceof Error ? e.message : e);
        return 'UTC';
    }
}

/**
 * The stored look, falling back to the cookie and then to nothing.
 *
 * PRECEDENCE MATTERS AND IT IS NOT SYMMETRIC. The table wins whenever it has a value, and the cookie is only
 * consulted when it does not. The reverse — or a "whichever is newer" rule — would reproduce the exact bug this
 * change exists to fix: choose Slate on the desktop, and a phone still holding a year-long cookie would keep
 * showing the old look for the rest of that year, on every load, with nothing to indicate why.
 *
 * There is no migration step and no write during a render. The first time he chooses a look after this ships,
 * the table gets a row and wins everywhere from then on. Until then the cookie he already has keeps working
 * exactly as before, per device, which is today's behaviour. A one-time copy would have meant issuing a write
 * from inside a page render, and a render that writes is a render that can be retried.
 *
 * `next/headers` is deliberately NOT imported here: the cookie value arrives as an argument. Two `lib/*.ts`
 * modules can import each other's values, but the proof suites load these files through Node's type-stripping,
 * and a server-only Next import inside `lib` is a trap for whichever suite reaches this module first.
 */
export async function readLooksPreference(cookieValue: string | undefined): Promise<string | undefined> {
    try {
        const stored = await readSetting(LOOKS_SETTING);
        if (stored) return stored;
    } catch (e) {
        /*
         * A look is decoration, and the hub's job is to survive being ignored. Moving this out of a cookie
         * made appearance a server concern for the first time, so a database that is unreachable must cost him
         * the palette and nothing else — never the page. The queue is what he came for.
         *
         * BUT IT IS LOGGED, because a silent fallback here hides a permanent failure as well as a transient
         * one. If the database role cannot CREATE — plausible on someone else's deploy, where the connection
         * string may be a restricted user rather than the Neon owner — every load would quietly use the
         * default and the preference would never persist, with nothing anywhere to say why. A swallowed error
         * that changes behaviour forever is not graceful degradation, it is a bug with a good disposition.
         */
        console.warn(
            '[settings] falling back to the cookie for the chosen look: '
            + (e instanceof Error ? e.message : String(e)),
        );
    }
    return cookieValue;
}
