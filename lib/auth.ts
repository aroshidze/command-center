import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Authentication, kept as small as it is allowed to be.
 *
 * There are three callers and each gets its own credential, so any one can be rotated without
 * disturbing the others:
 *
 *   CC_AGENT_TOKEN     agents, sent as `Authorization: Bearer …`
 *   CC_WEB_TOKEN       the phone, exchanged once via `/?k=…` for a year-long cookie
 *   CC_TELEGRAM_SECRET Telegram, which echoes it back in X-Telegram-Bot-Api-Secret-Token
 *
 * WHY THIS IS PROPORTIONATE, since a bearer token in a URL would normally deserve a raised eyebrow:
 * the hub stores no secrets. Not one — enforced by rule in lib/types.ts and by validation in
 * lib/store.ts. Tasks say where a key lives and where it goes; they never contain it. So the worst case
 * for a leaked link is that someone reads and ticks a personal to-do list. That is the trade that buys
 * "open it on your phone with no password, ever", which docs/RESEARCH.md §7 identifies as the
 * difference between a tool that gets used in week two and one that does not.
 *
 * If the hub ever stores anything sensitive, this is not good enough any more and passkeys become
 * mandatory. That is written down in docs/DECISION.md as the trigger.
 *
 * ==================================================================================================
 * WHAT `CC_WEB_TOKEN` NOW DOES, WHICH IS MORE THAN IT DID — READ THIS BEFORE SHARING A LINK
 * ==================================================================================================
 *
 * **Whoever holds this token can ALLOW OR DENY TOOL CALLS in his agents' sessions**, in any project where
 * `cc approvals on` has been run. That is a genuine widening of what a leaked link costs, and it is written
 * here rather than only in `docs/SETUP.md` because this is the file somebody reads when they ask what the
 * token is for.
 *
 * The paragraph above still holds and the argument still stands, but it needs restating against the new
 * capability rather than left to be inferred:
 *
 *   - **It cannot make anything happen on its own.** An approval only exists while an agent is already
 *     waiting on a permission prompt it decided to raise, and it lives about ten minutes. There is no
 *     endpoint that says "run this"; there is only "answer the question that is already being asked".
 *   - **Denying is free and allowing is bounded.** The worst a holder of this token can do is approve a tool
 *     call his own agent proposed, in a project he opted in, inside a ten-minute window.
 *   - **It is opt-in per project and off by default.** A hub where nobody ran `cc approvals on` has exactly
 *     the exposure it had before this existed: read a to-do list, tick things off.
 *   - **It expires by itself.** An unanswered request lapses and the agent falls back to asking in its own
 *     terminal, so a token that leaks and is never used costs nothing at all.
 *
 * The honest summary: this is still a to-do list you can open with a link, and it is now also a doorbell
 * somebody else could answer. If that trade ever stops being acceptable — a project where a wrong Allow is
 * expensive — the answer is `cc approvals off` in that project, which is one command and takes effect on the
 * next session. That is a real control rather than advice, which is why it is worth stating as the mitigation.
 */

export const SESSION_COOKIE = 'cc_session';

/** Constant-time compare that does not leak length through an early return. */
function sameSecret(a: string | undefined | null, b: string | undefined | null): boolean {
    if (!a || !b) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
        // Still burn a comparison so the timing of a wrong-length guess matches a right-length one.
        timingSafeEqual(bufA, bufA);
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}

export class Unauthorised extends Error {
    constructor(msg = 'unauthorised') {
        super(msg);
        this.name = 'Unauthorised';
    }
}

/** Missing config must fail closed, never open. An unset token does not mean "allow everyone". */
function requireConfigured(name: string): string {
    const v = process.env[name];
    if (!v || v.length < 24) {
        throw new Unauthorised(
            `${name} is not set (or is too short to be a credential). The hub refuses all requests ` +
            `until it is configured — see docs/SETUP.md.`,
        );
    }
    return v;
}

/** Agents. Returns the agent's declared name, which is only a label, never a credential. */
export function requireAgent(req: Request): string {
    const expected = requireConfigured('CC_AGENT_TOKEN');
    const header = req.headers.get('authorization') || '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!sameSecret(presented, expected)) throw new Unauthorised('bad or missing agent token');

    const raw = (req.headers.get('x-cc-agent') || 'unknown').toLowerCase();
    const name = raw.replace(/[^a-z0-9._-]/g, '').slice(0, 40);
    return name || 'unknown';
}

/** Telegram webhook. The secret_token mechanism from setWebhook; see lib/telegram.ts. */
export function requireTelegram(req: Request): void {
    const expected = requireConfigured('CC_TELEGRAM_SECRET');
    const presented = req.headers.get('x-telegram-bot-api-secret-token');
    if (!sameSecret(presented, expected)) throw new Unauthorised('bad telegram secret token');
}

/** The phone. True once the cookie has been set by visiting `/?k=<CC_WEB_TOKEN>` once. */
export async function hasWebSession(): Promise<boolean> {
    const expected = process.env.CC_WEB_TOKEN;
    if (!expected || expected.length < 24) return false;
    const jar = await cookies();
    return sameSecret(jar.get(SESSION_COOKIE)?.value, expected);
}

export function webTokenMatches(candidate: string | null): boolean {
    if (!candidate) return false;
    return sameSecret(candidate, process.env.CC_WEB_TOKEN);
}

export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A year. The point of this design is that the phone is never asked to log in again; an expiry that
    // lands at an inconvenient moment is exactly the week-one friction that kills tools like this.
    maxAge: 60 * 60 * 24 * 365,
};
