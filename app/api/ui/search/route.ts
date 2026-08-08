import { hasWebSession } from '../../../../lib/auth';
import { fail, json } from '../../../../lib/http';
import { SEARCH_LIMIT } from '../../../../lib/search';
import { search } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

/**
 * WHAT `Ctrl+K` ASKS. The second GET the interface has, and it exists for a measured reason.
 *
 * The palette used to build its haystack in the browser out of the page payload, which was every finished
 * task and every answered decision on every load. That payload is now a WINDOW — see `RECORD_WINDOW` in
 * lib/progress.ts — so a client-side index would have quietly stopped finding older work. The measurement
 * and the ordering it forced are in `docs/ITERATION-LOG.md` §XXV; check **S1** in tests/use-it.mjs plants a
 * record deeper than the window and asserts the oldest completion is still findable, with an injection that
 * kills this route to prove the answer came from here rather than from the page.
 *
 * BEHIND THE WEB SESSION, like `/api/ui/task`, and for a stronger reason: this reads across his whole
 * record. An unauthenticated 200 here would be the entire hub, searchable, to anyone who guessed the path.
 *
 * NOT ON `/api/ui/act`. Everything he DOES goes through that one endpoint because its contract is uniform —
 * POST an action, get back the row the database actually holds afterwards. A read has no row to verify, and
 * bending `act` to serve one would make its contract "a write, unless".
 *
 * `writeVerified` does not apply, and that is worth saying rather than leaving as an omission: nothing is
 * written. The rule is that no WRITE reports success before being re-read.
 */
export async function GET(req: Request) {
    if (!(await hasWebSession())) {
        return json({ ok: false, error: 'not signed in on this device' }, 401);
    }
    try {
        const q = new URL(req.url).searchParams.get('q') ?? '';
        /*
         * An empty query is an empty result, not an error and not everything.
         *
         * The palette does not call this with an empty box — it shows the hub's own destinations instead,
         * which is the answer to "what can I do from here" — but a route that returned the whole record for
         * `?q=` would be one careless caller away from shipping 3,600 rows to draw nothing.
         */
        if (!q.trim()) return json({ ok: true, rows: [], capped: false });

        const all = await search(q);
        /*
         * Capped, AND the cap is reported so the interface can say so when it bites. A list that silently
         * stops is the truncation `npm run audit` prints as a finding; the palette prints "showing the first
         * 50 — type more to narrow it", which is the route to the rest.
         */
        return json({
            ok: true,
            rows: all.slice(0, SEARCH_LIMIT),
            capped: all.length > SEARCH_LIMIT,
        });
    } catch (e) {
        return fail(e);
    }
}
