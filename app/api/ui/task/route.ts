import { hasWebSession } from '../../../../lib/auth';
import { fail, json } from '../../../../lib/http';
import { getTask } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

/**
 * READ ONE TASK IN FULL — the only GET the interface has, and the gap it closes was a real one.
 *
 * ==================================================================================================
 * WHY THIS DID NOT EXIST, AND WHY THAT WAS A DEFECT RATHER THAN A DECISION
 * ==================================================================================================
 *
 * `board()` narrows every completed task to `FinishedRow`, which drops `steps`, `verify` and `gotchas`. That
 * narrowing is right and it is measured: a real task carries nine to nineteen steps with prose in each, and
 * sending all of them for every completion forever grew the page payload without a ceiling — 509 KB at nine
 * hundred completions, on a phone, on every open. Cutting it to 303 KB was the fix.
 *
 * The consequence was that **a finished task could not be opened.** The record could tell him he had done "Set
 * up the Google Cloud project and OAuth client" and could not show him the nineteen steps he had followed, so
 * the one place the hub holds a procedure he might need again was write-only. The narrowing did not create that
 * gap deliberately; it created it as a side effect and nothing filled it.
 *
 * A read path is the correct shape for it: the steps are fetched for the ONE task he asked about, when he asks,
 * instead of for all of them on every load. That is the same trade the agent contract already makes —
 * `GET /api/agent/tasks?id=…` exists for exactly this reason, and this is its equivalent behind the web session.
 *
 * ==================================================================================================
 * WHY IT IS NOT AN ACTION ON /api/ui/act
 * ==================================================================================================
 *
 * Everything the human DOES goes through that one endpoint, and the reason it is one endpoint is that the
 * contract is uniform: POST a JSON action, get back the row the database actually holds afterwards. A read is not
 * an action, it has no row to verify, and bending `act` to serve one would make its contract "a write, unless".
 *
 * `writeVerified` does not apply here and that is worth saying rather than leaving as an omission: there is
 * nothing to verify, because nothing is written. The rule is that no WRITE reports success before being re-read.
 */
export async function GET(req: Request) {
    if (!(await hasWebSession())) {
        return json({ ok: false, error: 'not signed in on this device' }, 401);
    }
    try {
        const id = new URL(req.url).searchParams.get('id');
        if (!id) return json({ ok: false, error: '`id` is required' }, 400);
        /* `getTask` already existed for the agent contract and nothing in the interface had ever called it. No
         * new SQL, no second definition of what a task is — which is the whole reason all data access lives in
         * lib/store.ts. */
        const task = await getTask(id);
        /*
         * 404 with a reason rather than an empty 200. The interface prints the server's own words on failure —
         * hard constraint 2 — so "no such task" has to arrive as a sentence, not as an absence the client has to
         * interpret. An empty 200 is how a client ends up rendering "loading" forever.
         */
        if (!task) return json({ ok: false, error: 'no such task' }, 404);
        return json({ ok: true, task });
    } catch (e) {
        return fail(e);
    }
}
