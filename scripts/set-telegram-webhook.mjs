/**
 * Point the Telegram bot at the hub, and find your chat id for you.
 *
 *   node scripts/set-telegram-webhook.mjs https://your-hub.vercel.app
 *   node scripts/set-telegram-webhook.mjs --info          # what is currently set
 *   node scripts/set-telegram-webhook.mjs --delete        # stop delivery
 *
 * Reads TELEGRAM_BOT_TOKEN and CC_TELEGRAM_SECRET from .env.local.
 *
 * Note on the local-development case: Telegram can only deliver to a public HTTPS URL on port 443, 80, 88
 * or 8443, so it cannot reach localhost. That is not a problem — tests/prove.mjs exercises the webhook
 * path directly by posting the same update shape with the same secret header, so the one-tap logic is
 * fully testable locally. Only the last hop needs the deployed URL.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env.local')); } catch {
    console.error('No .env.local found. See docs/SETUP.md.');
    process.exit(1);
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.CC_TELEGRAM_SECRET;

if (!TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing from .env.local. See docs/SETUP.md step 2.');
    process.exit(1);
}

/*
 * Every exit path below sets `process.exitCode` and returns rather than calling process.exit().
 *
 * On Windows, process.exit() while Node's fetch agent still holds a socket trips a libuv assertion
 * ("!(handle->flags & UV_HANDLE_CLOSING)") and reports a spurious failure after the script has already
 * printed the right answer. Letting the event loop drain avoids it. Observed on this machine.
 */
class Bail extends Error {}
const bail = (message, code = 1) => { const e = new Bail(message); e.code = code; throw e; };

const api = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
    });
    const json = await res.json();
    if (!json.ok) bail(`${method} failed: ${json.description}`);
    return json.result;
};

const args = process.argv.slice(2);

async function main() {

/* ------------------------------------------------------------------- who am I talking to */

const me = await api('getMe');
console.log(`Bot: @${me.username} (${me.first_name})`);

if (!process.env.TELEGRAM_CHAT_ID) {
    /*
     * Finding the chat id automatically rather than making it a manual step. getUpdates only returns
     * anything if you have already messaged the bot — Telegram will not let a bot message you first, which
     * is an anti-spam rule and not a bug. Hence step 2.6 in docs/SETUP.md.
     */
    console.log('\nTELEGRAM_CHAT_ID is not set. Looking for it in recent messages…');
    const updates = await api('getUpdates', { limit: 10 });
    const ids = [...new Set(
        updates.map(u => u.message?.chat?.id ?? u.callback_query?.from?.id).filter(Boolean),
    )];

    if (!ids.length) {
        bail(
            `\nNo messages found. Open Telegram, find @${me.username}, press Start and send it "hello", ` +
            `then run this again.`,
        );
    }
    console.log(`\nFound chat id: ${ids[0]}${ids.length > 1 ? `  (also saw: ${ids.slice(1).join(', ')})` : ''}`);
    console.log(`\nAdd this line to .env.local, then run this script again:\n\n  TELEGRAM_CHAT_ID=${ids[0]}\n`);
    return;
}

console.log(`Chat id: ${process.env.TELEGRAM_CHAT_ID}`);

/* ------------------------------------------------------------------------------- the actions */

if (args.includes('--info')) {
    const info = await api('getWebhookInfo');
    console.log('\nCurrent webhook:');
    console.log(`  url:                 ${info.url || '(none)'}`);
    console.log(`  pending updates:     ${info.pending_update_count}`);
    console.log(`  custom certificate:  ${info.has_custom_certificate}`);
    if (info.last_error_message) {
        console.log(`  LAST ERROR:          ${info.last_error_message} (at ${new Date(info.last_error_date * 1000).toISOString()})`);
    }
    return;
}

if (args.includes('--delete')) {
    await api('deleteWebhook', { drop_pending_updates: false });
    const info = await api('getWebhookInfo');
    if (info.url) bail(`\nStill set to ${info.url} — deletion did not take effect.`);
    console.log('\nWebhook removed.');
    return;
}

const base = args.find(a => a.startsWith('http'));
if (!base) bail('\nusage: node scripts/set-telegram-webhook.mjs https://your-hub.vercel.app');
if (!base.startsWith('https://')) {
    bail('\nTelegram only delivers to HTTPS. A plain http:// URL will silently never fire.');
}
if (!SECRET || SECRET.length < 16) {
    bail(
        '\nCC_TELEGRAM_SECRET is missing or too short. Without it, anyone who guesses the webhook URL can ' +
        'forge your answers. Generate one with:\n\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"\n',
    );
}

const url = `${base.replace(/\/+$/, '')}/api/telegram`;

await api('setWebhook', {
    url,
    secret_token: SECRET,
    // Only what the hub actually handles. Fewer update types means less noise and no surprises.
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: true,
});

// Read it back rather than trusting the 200. Same rule as every write in this codebase.
const info = await api('getWebhookInfo');
if (info.url !== url) {
    bail(`\nFAILED: Telegram reports the webhook as "${info.url}", not "${url}".`);
}

console.log(`\nWebhook set and confirmed: ${info.url}`);
console.log(`Allowed updates: ${(info.allowed_updates || []).join(', ')}`);
console.log(
    `\nNow send the bot /status. If nothing comes back, run this script with --info and look at ` +
    `LAST ERROR — that is Telegram telling you exactly why delivery failed.`,
);

}

try {
    await main();
} catch (e) {
    console.error(e instanceof Bail ? e.message : `Unexpected: ${e.stack || e.message}`);
    process.exitCode = e?.code ?? 1;
}
