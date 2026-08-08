import { requireAgent } from '../../../../lib/auth';
import { sync } from '../../../../lib/store';
import { fail, json } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * THE call. One request, one response, everything an agent needs to know what happened while it was away.
 *
 *   GET /api/agent/sync            → since the cursor the server remembers for this agent
 *   GET /api/agent/sync?since=0    → everything, from the beginning
 *   GET /api/agent/sync?since=412  → since an explicit cursor the agent is tracking itself
 *
 * The design constraint from the brief was blunt: "an agent that needs five calls and a pile of tokens
 * to catch up will stop bothering, and then this dies quietly." So this is one call, one round trip, and
 * a payload measured in kilobytes — with `summary` precomputed on every event so the response is
 * readable without a second lookup.
 *
 * Reliability property worth stating: `changed` depends on the cursor, and `open_questions`,
 * `open_tasks` and `defaulted_questions` do not. A cursor that is lost, stale, or plain wrong costs an
 * agent some duplicated reading. It can never hide work that is still waiting.
 */
export async function GET(req: Request) {
    try {
        const agent = requireAgent(req);
        const params = new URL(req.url).searchParams;
        const raw = params.get('since');
        const since = raw == null || raw === '' ? null : Number(raw);
        if (raw != null && raw !== '' && !Number.isFinite(since)) {
            return json({ ok: false, error: '`since` must be a number' }, 400);
        }
        // `?project=slug` narrows to one project. Omitted means everything, which is what the hub's own
        // page and any cross-project tooling wants.
        return json(await sync(agent, since, params.get('project')));
    } catch (e) {
        return fail(e);
    }
}
