import { requireAgent } from '../../../../lib/auth';
import { recordReport } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * WHAT WAS SAID, AND WHEN. One endpoint, three kinds, and it is also the activity signal.
 *
 *   POST /api/agent/report  { project, session, kind: "said",    body }   the assistant's last words
 *   POST /api/agent/report  { project, session, kind: "told",    body }   what the human typed
 *   POST /api/agent/report  { project, session, kind: "waiting", body }   the harness: it needs a person
 *
 * ==================================================================================================
 * WHY THIS IS NOT THE `status` FIELD THE PRESENCE ENDPOINT REFUSES
 * ==================================================================================================
 *
 * `/api/agent/presence` says, and still says, that there is no `status`, no `health`, no `doing` and no
 * `progress` field here, quoting `docs/BRIEF-NOTHING-BLOCKED.md` §4: *"An agent asked to self-report health
 * reports green, and a single green-while-you-slept status poisons every other indicator on the page."*
 * That refusal stands, and this endpoint does not weaken it — it is the shape the owner's request turned
 * out to need once the refusal was taken seriously.
 *
 * The difference is authorship and tense, and both halves matter:
 *
 *   - **Nothing here is authored by the agent about itself.** `said` is `last_assistant_message`, handed
 *     over by the `Stop` hook — the harness's own record of what the turn ended with. `told` is the
 *     prompt, from `UserPromptSubmit`. `waiting` is `Notification`, which is the HARNESS reporting that
 *     the agent is blocked, not the agent claiming to be fine. An agent cannot flatter itself through any
 *     of the three, because none of them asks it a question.
 *   - **Nothing here is a claim about now.** A row says "at 14:32 this was said". That is true forever and
 *     needs nothing to keep it true, which is the property a `status` column does not have and the reason
 *     AGENTS.md's test is *can it name who said it and when?*
 *
 * ==================================================================================================
 * IT IS THE HEARTBEAT TOO, AND THAT IS THE POINT
 * ==================================================================================================
 *
 * Presence used to be observable at exactly two moments — `SessionStart` and `SessionEnd` — which is why a
 * project with an agent working in it read as *"Nothing has looked at this since 8 August"*. `Stop` fires
 * once per turn, so this call is the mid-session evidence that never existed: it moves `last_seen_at`,
 * and it cuts a new run when the conversation has been quiet for longer than an hour. One call, one row of
 * activity, one row of what was said, and no second hook to install or keep alive.
 *
 * ==================================================================================================
 * WHAT IT DOES TO TEXT IT DID NOT ASK FOR
 * ==================================================================================================
 *
 * The body is prose nobody wrote for a database. It is truncated to 400 characters, sanitised for display
 * at this boundary like every other shown string, and token-shaped words are replaced before the insert —
 * REDACTED rather than rejected, which is the one place in this codebase where that is the right call,
 * because nobody can rewrite a message that has already been said. See `redactSecrets` in lib/reports.ts.
 *
 * `redacted: true` comes back when something was removed, so the hook can say so on stderr rather than
 * leaving the operator to discover it on the page.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const result = await recordReport(
            {
                project: body.project,
                session: body.session,
                kind: body.kind,
                body: body.body,
                branch: body.branch,
                model: body.model,
                /*
                 * WHEN IT WAS SAID, when the caller knows better than the clock.
                 *
                 * A hook omits it and `now()` is right. `cc sync`'s catch-up reads a transcript and sends the
                 * message's real timestamp, which is both more honest and what makes the re-post idempotent —
                 * the same message always carries the same `at`, and a unique index turns the repeat into a
                 * no-op. Clamped to the past in `recordReport`, so a fast clock cannot file the future.
                 */
                at: body.at,
            },
            agent,
        );
        /* `saved: true` only after the row has been read back, like every other write path in this hub. A
         * hook that could not tell a stored report from a swallowed one would leave the thread with holes
         * in it and nothing saying so. */
        return json({ ok: true, saved: true, ...result, agent });
    } catch (e) {
        return fail(e);
    }
}
