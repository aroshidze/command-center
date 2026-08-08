import { requireAgent } from '../../../../lib/auth';
import { heartbeat } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * A HEARTBEAT. `SessionStart` and `SessionEnd`, and nothing else.
 *
 *   POST /api/agent/presence  { project, session, branch?, model? }            a session began
 *   POST /api/agent/presence  { project, session, ended: true, end_reason? }   it finished
 *
 * ==================================================================================================
 * WHY THIS ENDPOINT IS ALLOWED TO EXIST AT ALL
 * ==================================================================================================
 *
 * The hub's vocabulary is two nouns and two supporting ones, and `lib/types.ts` says plainly that if you
 * are thinking of adding a field the test is whether it removes a step from someone's day. This one does,
 * and the step it removes is a wrong belief rather than a keystroke: without it an empty queue and a dead
 * agent are the same screen, so *"nothing needs you"* — the state the whole hub exists to reach — is
 * indistinguishable from *"nothing has run against this project in nine days"*.
 *
 * ==================================================================================================
 * IT IS OPT-IN, AND THE OPT-IN IS THE HOOK'S OWN EXISTENCE
 * ==================================================================================================
 *
 * There is no setting to turn this on. A project posts heartbeats because somebody ran
 * `cc presence on` in it, which writes two hooks into that project's `.claude/settings.json`; a project
 * that never ran it posts nothing and falls back to what `cc sync` already tells the hub. So the setup
 * story for somebody who wants none of this is exactly as long as it was — which is one of the brief's
 * done-conditions rather than a nicety.
 *
 * ==================================================================================================
 * WHAT IT DELIBERATELY REFUSES TO ACCEPT
 * ==================================================================================================
 *
 * There is no `status`, no `health`, no `doing` and no `progress` field, and adding one is refused rather
 * than merely undesigned — `docs/BRIEF-NOTHING-BLOCKED.md` §4: *"An agent asked to self-report health
 * reports green, and a single green-while-you-slept status poisons every other indicator on the page."*
 * `branch` and `model` are accepted because the hook reads them off the machine rather than composing them,
 * and both are sanitised anyway, because a branch name is attacker-supplied the moment anyone opens a pull
 * request.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const result = await heartbeat(
            {
                project: body.project,
                session: body.session,
                branch: body.branch,
                model: body.model,
                ended: body.ended,
                end_reason: body.end_reason,
            },
            agent,
        );
        /* `saved: true` for the same reason every other write path says it: the row has been re-read. A
         * hook that cannot tell a stored heartbeat from a swallowed one would report presence it does not
         * have. */
        return json({ ok: true, saved: true, ...result, agent });
    } catch (e) {
        return fail(e);
    }
}
