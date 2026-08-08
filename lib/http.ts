import { ConfigError, WriteFailed } from './db';
import { Invalid } from './store';
import { Unauthorised } from './auth';

/**
 * One place that turns an exception into a response, so every endpoint fails the same way.
 *
 * The rule that matters: a failed write returns a 5xx with the reason the verifier gave, and never a
 * 200 with a cheerful body. Callers — including the page — are expected to show that reason rather than
 * translating it into a generic "something went wrong", because "the write matched zero rows" tells you
 * what to do next and "something went wrong" does not.
 */
export function fail(e: unknown): Response {
    if (e instanceof Unauthorised) {
        return json({ ok: false, error: e.message }, 401);
    }
    if (e instanceof Invalid) {
        return json({ ok: false, error: e.message, kind: 'invalid' }, 400);
    }
    if (e instanceof WriteFailed) {
        console.error('[write-failed]', e.what, '—', e.reason);
        return json(
            {
                ok: false,
                kind: 'write-failed',
                what: e.what,
                error: e.message,
                // Said explicitly because the whole point is that the caller can trust a failure as much
                // as a success.
                stored: false,
            },
            500,
        );
    }
    if (e instanceof ConfigError) {
        return json({ ok: false, error: e.message, kind: 'not-configured' }, 503);
    }

    const message = e instanceof Error ? e.message : String(e);
    if (/relation ".*" does not exist/.test(message)) {
        return json(
            {
                ok: false,
                kind: 'no-schema',
                error: 'The database schema has not been created yet. Run `npm run init-db`.',
            },
            503,
        );
    }

    console.error('[unhandled]', e);
    return json({ ok: false, error: message }, 500);
}

/**
 * `extra` exists for exactly one caller: `looks.set` has to send `Set-Cookie` alongside its JSON.
 *
 * Added as an optional third argument rather than by having that route build its own `Response`, because
 * `cache-control: no-store` on every write is load-bearing — a cached response from this endpoint would be a
 * stale "saved" — and a second construction site is a second place to forget it.
 */
export function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...extra,
        },
    });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Invalid('the request body must be a JSON object');
    }
    return body as Record<string, unknown>;
}
