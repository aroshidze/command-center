import { cookies } from 'next/headers';
import { hasWebSession } from '../../../../lib/auth';
import { isKnownLookSlug, LOOKS_COOKIE, looksCookie, parseLooks } from '../../../../lib/looks';

export const dynamic = 'force-dynamic';

/**
 * "Don't tell me again" — the second half of rule 3 of the perk system.
 *
 * ==================================================================================================
 * WHY THIS IS A FORM POST AND A REDIRECT RATHER THAN A `fetch`
 * ==================================================================================================
 *
 * Dismissing the unlock banner writes a cookie, and only a response can set a cookie. Doing it with `fetch`
 * would mean hiding the banner from client state while the write is still in flight — an optimistic UI about a
 * write, which is the one thing this codebase does not do anywhere (see lib/db.ts and `act` in ui.tsx). A form
 * POST followed by a redirect means the banner is gone because **the server re-rendered the page without it**,
 * which is the same standard every other write here is held to.
 *
 * It is also the only write in the hub that needs no `writeVerified`, and that is worth saying rather than
 * leaving as an omission: there is no row. The cookie IS the state, it is returned in the response that sets it,
 * and the next render reads it back. The re-read is structural.
 *
 * ==================================================================================================
 * WHY IT IS NOT AN ACTION ON /api/ui/act
 * ==================================================================================================
 *
 * That endpoint takes JSON and returns JSON, because every one of its callers is a button in a client component
 * that needs the server's answer in order to decide what to show. This one needs a NAVIGATION, so it returns 303
 * and a `Location`. Bending `act` to sometimes redirect would make its contract "JSON, unless" — and the reason
 * there is one endpoint for everything else is that the contract is uniform.
 */
export async function POST(req: Request) {
    if (!(await hasWebSession())) {
        return new Response('not signed in on this device', { status: 401 });
    }

    const form = await req.formData();
    /*
     * The slugs to mark, from the request — NOT recomputed here as "everything currently unlocked".
     *
     * Recomputing would be one line shorter and wrong in a way that matters: between the page rendering the
     * banner and him pressing the button, an agent could have filed work, or he could have ticked something off
     * in another tab and crossed a level. Marking "everything unlocked now" would then silently swallow an
     * announcement he has never seen. Marking exactly what the banner said means the button does what its label
     * claims and nothing more.
     */
    const asked = String(form.get('slugs') ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    /*
     * Filtered to slugs that actually exist. A hand-crafted POST could otherwise put arbitrary strings in the
     * cookie, which is not a security problem — the cookie carries no authority — but it is a correctness one:
     * `parseLooks` caps the list, so junk entries would eventually push real acknowledgements out of it and
     * things he had been told about would start being announced again.
     */
    const valid = asked.filter(isKnownLookSlug);

    const jar = await cookies();
    const current = parseLooks(jar.get(LOOKS_COOKIE)?.value);
    const next = {
        ...current,
        seen: [...new Set([...current.seen, ...valid])],
    };

    /*
     * 303, not 302. A POST redirected with 302 may be re-sent as a POST by some clients; 303 says "go and GET
     * this instead", which is exactly what is wanted and is the reason the status exists.
     *
     * Back to `/` rather than to a referrer, deliberately: the banner only ever renders on the board, and
     * following a `Referer` header is following something the client controls.
     */
    return new Response(null, {
        status: 303,
        headers: { location: '/', 'set-cookie': looksCookie(next) },
    });
}
