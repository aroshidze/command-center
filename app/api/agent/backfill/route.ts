import { requireAgent } from '../../../../lib/auth';
import { backfillActivity, observedSessions } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * THE LAST FORTNIGHT, RECONSTRUCTED FROM THE HARNESS'S OWN TRANSCRIPTS.
 *
 *   GET  /api/agent/backfill                    which session ids the hub already observed itself
 *   POST /api/agent/backfill  { sessions[], subagents[] }
 *
 * ==================================================================================================
 * WHY IT IS A SEPARATE ROUTE AND NOT A FLAG ON `heartbeat`
 * ==================================================================================================
 *
 * This is the only writer in the hub allowed to supply its own timestamps. Everywhere else the clock
 * belongs to the database, deliberately — a session block drawn from a time the machine that ran the
 * hook chose is a span nobody here measured.
 *
 * Backfill has to state times, because the whole point is to record what happened before anything was
 * installed. So the grant and the obligation travel together: everything this route writes is marked
 * `observed = false`, the page draws those blocks differently and says why, and no ordinary write path
 * can ever claim a time it did not witness. A boolean on `heartbeat` would have made that separation a
 * convention, and conventions in this codebase have a measured half-life.
 *
 * ==================================================================================================
 * WHAT IT REFUSES
 * ==================================================================================================
 *
 * It never overwrites a row a hook wrote. `backfillActivity` puts that in the SQL rather than in a
 * check here, so a client that ignores the `GET` cannot replace a measured span with an inferred one.
 * The `GET` exists to save the caller the work, not to be the guard.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);
        return json({ ok: true, observed_sessions: await observedSessions() });
    } catch (e) {
        return fail(e);
    }
}

export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const sessions = Array.isArray(body.sessions) ? body.sessions : [];
        const subagents = Array.isArray(body.subagents) ? body.subagents : [];
        const result = await backfillActivity(
            sessions as Parameters<typeof backfillActivity>[0],
            subagents as Parameters<typeof backfillActivity>[1],
            agent,
        );
        return json({ ok: true, saved: true, ...result, agent });
    } catch (e) {
        return fail(e);
    }
}
