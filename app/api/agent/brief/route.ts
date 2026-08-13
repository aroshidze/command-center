import { requireAgent } from '../../../../lib/auth';
import { recordBrief } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * WHERE A PROJECT STANDS, filed by the agent that did the work.
 *
 *   POST /api/agent/brief  { project, standing, did?, next?, blocked?, session? }
 *
 * ==================================================================================================
 * WHY AN AGENT WRITES THIS AND THE HUB DOES NOT
 * ==================================================================================================
 *
 * The owner asked for what a chief of staff would give him: *"as if a person was sitting in my command
 * center analyzing everything and understanding some key cool stuff that he should report to me."* With
 * eleven projects, "the latest word" is eleven agents each talking about a rate table, and nobody reads
 * eleven paragraphs.
 *
 * The obvious build is a job in the hub that calls an API to summarise the reports. Costed against this
 * hub's own price table at his real volume it is about $1.50 a month, so money is not the argument. Two
 * other things are, and he named the first one himself:
 *
 *   1. **It would add a paid API key to the setup of a public tool.** An agent writing this uses the
 *      subscription that is already running. Nothing to sign up for, no credential, no bill — which
 *      matters for everybody who is not him.
 *   2. **The agent's version is better.** A summariser in the hub reads 400-character excerpts of what was
 *      said. The agent that just spent six hours in the project has the whole thing in context.
 *
 * The cheaper option being the higher-quality one is rare enough to take seriously. Hub-side generation
 * stays possible later for projects where no agent runs; nothing here forecloses it, because a brief is
 * just a row with an author on it and the hub would be one more author.
 *
 * ==================================================================================================
 * AND WHY THIS IS NOT THE SELF-REPORTED STATUS THE PRESENCE ENDPOINT REFUSES
 * ==================================================================================================
 *
 * `/api/agent/presence` refuses `status`, `health`, `doing` and `progress`, quoting the finding that *"an
 * agent asked to self-report health reports green, and a single green-while-you-slept status poisons every
 * other indicator on the page."* That refusal is intact and this does not weaken it:
 *
 *   - **It is never updated.** Two briefs an hour apart are two moments, not a correction. There is no
 *     field here that something has to keep true, which is the property a status column lacks.
 *   - **It is shown with its age and its author**, next to the derived facts — open work, last activity,
 *     what actually ran — which can contradict it in public.
 *   - **`blocked` is asked for separately**, because an agent asked "how is it going" says fine and an
 *     agent asked "what is in the way" answers.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const { brief, redacted } = await recordBrief(
            {
                project: body.project,
                standing: body.standing,
                did: body.did,
                next: body.next,
                blocked: body.blocked,
                session: body.session,
            },
            agent,
        );
        return json({ ok: true, saved: true, brief, redacted });
    } catch (e) {
        return fail(e);
    }
}
