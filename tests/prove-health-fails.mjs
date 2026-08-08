/**
 * Prove that /api/health can actually go red.
 *
 *   node tests/prove-health-fails.mjs
 *
 * This exists for one reason. Brief §6: "We had audits reporting clean while the thing they audited was
 * broken, because they measured a proxy rather than the thing itself."
 *
 * A health endpoint is the most likely thing in any codebase to be that kind of lie — a route that
 * returns `{ok: true}` because the server is running, which is a proxy for health rather than health.
 * The only way to know this one is not that is to break the database on purpose and watch it say so.
 *
 * So this script starts a SECOND copy of the hub on another port, with DATABASE_URL pointed at a
 * well-formed but nonexistent Postgres host, and asserts:
 *
 *   - /api/health returns 503, not 200
 *   - ok is false
 *   - the database check names the real problem rather than a generic message
 *   - the page itself refuses to render a list it cannot trust
 *
 * It is slow (it boots Next), which is why it is separate from `npm run prove`. Run it when the health
 * check or the write path changes.
 */

import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* only the tokens matter below */ }

const PORT = 3941;
const BASE = `http://localhost:${PORT}`;

// Well-formed and syntactically valid, resolves to nothing. The failure is a connection failure, which is
// the realistic case: the database exists in config and not in reality.
const DEAD_DB =
    'postgresql://nobody:nothing@db-that-does-not-exist.invalid.neon.tech/neondb?sslmode=require';

console.log('\nStarting a second hub with a deliberately dead database…\n');

/*
 * Two Windows/Next specifics, both found the hard way:
 *
 *  - Windows refuses to spawn a .cmd shim directly (EINVAL, since the Node 20 security change) and npx is
 *    a .cmd here, so this goes through a shell. Passed as one string rather than argv+shell:true, which
 *    Node deprecated for concatenating unescaped arguments. Everything here is a literal.
 *  - `next dev` refuses to start when another dev server is already running in the same directory. So
 *    this test needs the main dev server stopped first; `npm run prove:all` sequences that for you.
 */
const child = spawn(
    `npx next dev -p ${PORT}`,
    {
        cwd: root,
        shell: true,
        detached: process.platform !== 'win32',
        env: {
            ...process.env,
            DATABASE_URL: DEAD_DB,
            // The credentials must be present and valid, or a 503 would prove nothing — it could be the
            // missing-token branch rather than the database branch.
            CC_AGENT_TOKEN: process.env.CC_AGENT_TOKEN || 'x'.repeat(40),
            CC_WEB_TOKEN: process.env.CC_WEB_TOKEN || 'y'.repeat(40),
            CC_ALLOW_FAULT_INJECTION: '',
            CC_FAULT: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    },
);

let log = '';
child.stdout.on('data', d => { log += d.toString(); });
child.stderr.on('data', d => { log += d.toString(); });

/*
 * Kill the whole tree, not just the child.
 *
 * `shell: true` means `child` is a shell that spawned node, so killing `child` leaves the actual Next
 * server holding port 3941 — which then blocks the main dev server from starting, with an error that
 * points at the wrong thing entirely. Found exactly that way. On Windows `taskkill /T` is what walks the
 * tree; elsewhere a negative pid signals the process group.
 */
/*
 * ...AND IT HAS TO BE SYNCHRONOUS, which is why port 3941 was still leaking.
 *
 * The tree-kill above was correct and it was fired with `spawn`, which returns immediately. Registered on
 * `process.on('exit')`, that means node schedules `taskkill` and then exits — the process it was asked to kill
 * outlives the request. The leak has been on the open list for two iterations with a fix already in the file
 * that could not run in time.
 *
 * `spawnSync` blocks until `taskkill` has actually finished, which is the only thing an exit handler can rely
 * on: after `exit` fires there is no event loop left to do asynchronous work in. On POSIX the signal to the
 * process group is already synchronous.
 *
 * The double kill is kept and is not redundant: `taskkill /T` walks the tree from the shell down, and
 * `child.kill` covers the case where the shell has already gone but node has not.
 */
const cleanup = () => {
    try {
        if (process.platform === 'win32') {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            process.kill(-child.pid, 'SIGTERM');
        }
    } catch { /* already gone */ }
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

/** Wait for the server to answer anything at all, so a boot failure is not read as a health failure. */
async function waitForBoot(timeoutMs = 90_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (/Another next dev server is already running/.test(log)) {
            console.error(
                'Stop the main dev server first — `next dev` allows only one per directory.\n' +
                'Then re-run this, and start `npm run dev` again afterwards.',
            );
            return false;
        }
        try {
            // Any response, including an error page, means Next is listening.
            await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
            return true;
        } catch {
            if (child.exitCode != null) {
                console.error(`the second hub exited early (code ${child.exitCode}):\n${log.slice(-1500)}`);
                return false;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    console.error(`timed out waiting for ${BASE}:\n${log.slice(-1500)}`);
    return false;
}

if (!(await waitForBoot())) { cleanup(); process.exit(1); }

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`);
    if (!ok) failed++;
};

const res = await fetch(`${BASE}/api/health`);
const body = await res.json().catch(() => null);

check('health returns 503, not 200', res.status === 503, `got ${res.status}`);
check('ok is false', body?.ok === false, `got ${JSON.stringify(body?.ok)}`);
check(
    'the database check is the one that failed',
    body?.checks?.database?.ok === false,
    JSON.stringify(body?.checks?.database),
);
check(
    'the credential checks still pass, so the 503 is genuinely about the database',
    body?.checks?.CC_AGENT_TOKEN?.ok === true && body?.checks?.CC_WEB_TOKEN?.ok === true,
    JSON.stringify({ agent: body?.checks?.CC_AGENT_TOKEN, web: body?.checks?.CC_WEB_TOKEN }),
);
check(
    'the failure detail names the real problem instead of being generic',
    /could not query|getaddrinfo|ENOTFOUND|connect|fetch failed|Error/i.test(
        body?.checks?.database?.detail || '',
    ),
    body?.checks?.database?.detail,
);

// And the page must refuse to show a list it cannot stand behind, rather than rendering an empty one that
// looks like "nothing needs you".
const page = await fetch(`${BASE}/`, { headers: { cookie: `cc_session=${process.env.CC_WEB_TOKEN || ''}` } });
const html = await page.text();
const refuses = /not<\/strong> trustworthy|not.{0,12}trustworthy|could not read its database/i.test(html);
const looksEmpty = /Nothing needs you/i.test(html);
check('the page says it cannot be trusted rather than showing an empty list', refuses && !looksEmpty,
    looksEmpty ? 'the page rendered "Nothing needs you" over a dead database — that is the dangerous lie'
        : 'the page did not surface the database error');

cleanup();

console.log(
    failed === 0
        ? '\nThe health check and the page both fail loudly when the database is gone. Confirmed by breaking it.\n'
        : `\n${failed} check(s) did not behave as required. The health check may be reporting a proxy.\n`,
);
process.exit(failed === 0 ? 0 : 1);
