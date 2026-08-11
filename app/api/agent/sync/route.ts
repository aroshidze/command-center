import { requireAgent } from '../../../../lib/auth';
import { sync } from '../../../../lib/store';
import { CLI_VERSION, cliStaleAdvice } from '../../../../lib/cliversion';
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
        const body = await sync(agent, since, params.get('project'));

        /*
         * ==================================================================================================
         * IS THE CLI ON THAT MACHINE OLDER THAN THIS HUB? Answered here, on the one call agents make often.
         * ==================================================================================================
         *
         * The hub serves its own CLI so the two cannot drift, and that only covers the download: the file is
         * a copy from then on. A hub deployed with `cc report` and three new hooks met a machine whose CLI
         * predated all of it, and the only symptom was a chart with nothing on it. See lib/cliversion.ts.
         *
         * ABSENT MEANS OLD, NOT EXEMPT. A CLI that sends no `cli` at all is by definition from before this
         * handshake existed, so it is stale by exactly the reasoning this check is for. Treated as 0.
         *
         * NEWER THAN THE HUB IS FINE AND SILENT. That is somebody testing an unreleased CLI against a
         * deployed hub, which is a thing this project's own author does; a warning there would be noise
         * about the one case where the person already knows.
         */
        const claimed = Number(params.get('cli') ?? 0);
        const theirs = Number.isFinite(claimed) ? claimed : 0;
        if (theirs < CLI_VERSION) {
            const url = new URL(req.url);
            const hub = process.env.CC_PUBLIC_URL || `${url.protocol}//${url.host}`;
            return json({
                ...body,
                cli_stale: true,
                cli_expected: CLI_VERSION,
                cli_seen: theirs,
                cli_advice: cliStaleAdvice(hub.replace(/\/+$/, '')),
            });
        }
        return json(body);
    } catch (e) {
        return fail(e);
    }
}
