import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, webTokenMatches } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The only login there is. Open once, ever:
 *
 *   https://<hub>/api/enter?k=<CC_WEB_TOKEN>
 *
 * It swaps the token for a year-long HttpOnly cookie and redirects to `/`, which is the URL you then add
 * to your home screen. After that the hub opens instantly with no password, no biometric prompt and no
 * interstitial — which docs/RESEARCH.md §7 identifies as the difference between a tool still being used
 * in week two and one that is not.
 *
 * The token is exchanged rather than kept in the URL so that the address you actually keep on your phone
 * carries no credential in it, and so a screenshot of the hub does not leak access.
 */
export async function GET(req: Request) {
    const k = new URL(req.url).searchParams.get('k');

    if (!webTokenMatches(k)) {
        // No hint about which part was wrong, and no retry counter to probe.
        return new Response('No.', {
            status: 401,
            headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
        });
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, process.env.CC_WEB_TOKEN!, SESSION_COOKIE_OPTIONS);
    redirect('/');
}
