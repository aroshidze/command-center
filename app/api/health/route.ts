import { schemaReady } from '../../../lib/db';
import { telegramConfigured } from '../../../lib/telegram';
import { json } from '../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * Is this thing actually working?
 *
 * Deliberately NOT a check that cannot fail (brief §6). It does not report "ok" because the process is
 * running — it opens the database, counts the tables it needs, and tells you which of the four
 * credentials are missing by name. A health endpoint that returns 200 whenever the server is up is a
 * proxy measurement, and a proxy measurement is how you get an audit that passes over a broken system.
 */
export async function GET() {
    const checks: Record<string, { ok: boolean; detail: string }> = {};

    const envs: [string, string][] = [
        ['DATABASE_URL', 'the Neon connection string'],
        ['CC_AGENT_TOKEN', 'the token agents authenticate with'],
        ['CC_WEB_TOKEN', 'the token that unlocks the page on your phone'],
    ];
    for (const [name, what] of envs) {
        const v = process.env[name];
        checks[name] = {
            ok: Boolean(v && v.length >= 24),
            detail: v ? (v.length >= 24 ? `set (${what})` : 'set but too short to be a credential') : `missing — ${what}`,
        };
    }

    /*
     * `suppressed` is reported distinctly from `not configured`, because the test suites assert on it.
     * They refuse to run unless sending is confirmed off — otherwise a proof run pushes a dozen synthetic
     * questions to a real phone, which happened once and must not be possible to happen again by
     * forgetting an environment variable.
     */
    checks.telegram = process.env.CC_SUPPRESS_TELEGRAM === 'yes'
        ? { ok: false, detail: 'suppressed — CC_SUPPRESS_TELEGRAM=yes, so nothing will be sent (local dev)' }
        : telegramConfigured()
            ? { ok: true, detail: 'bot token and chat id are set' }
            : { ok: false, detail: 'not configured — the hub still works, you just get no push notifications' };

    try {
        checks.database = (await schemaReady())
            ? { ok: true, detail: 'connected, all 5 tables present' }
            : { ok: false, detail: 'connected, but the schema is incomplete. Run `npm run init-db`.' };
    } catch (e) {
        checks.database = {
            ok: false,
            detail: `could not query: ${e instanceof Error ? e.message : String(e)}`,
        };
    }

    // Telegram is explicitly not required for the hub to be healthy — you can always open the page.
    const required = ['DATABASE_URL', 'CC_AGENT_TOKEN', 'CC_WEB_TOKEN', 'database'];
    const ok = required.every(k => checks[k]?.ok);

    return json({ ok, checks, now: new Date().toISOString() }, ok ? 200 : 503);
}
