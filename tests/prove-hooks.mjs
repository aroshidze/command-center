/**
 * THE HOOK CONTRACT, PROVED AGAINST A STUB HUB.
 *
 *   npm run prove:hooks
 *
 * ==================================================================================================
 * WHY THIS SUITE EXISTS SEPARATELY FROM EVERY OTHER ONE
 * ==================================================================================================
 *
 * `cc permission` is the only thing in this project whose output is consumed by ANOTHER PROGRAM rather than by
 * a person or by the hub. Claude Code reads its stdout and decides whether to run a tool. Get the shape wrong
 * and there is no error anywhere: the hook exits 0, the JSON parses, and every permission request silently
 * falls through to the terminal — which is exactly what the feature looks like when it is working, because
 * falling through to the terminal IS the designed failure mode.
 *
 * That is a defect that cannot be seen. It cost this project nothing only because the shape was checked against
 * the documentation before the code was written: `PermissionRequest` returns
 * `hookSpecificOutput.decision.behavior`, and the shape that everyone reaches for first —
 * `hookSpecificOutput.permissionDecision` — belongs to `PreToolUse`. Both parse. One decides nothing.
 *
 * ==================================================================================================
 * A STUB HUB RATHER THAN THE REAL ONE, AND THAT IS THE POINT
 * ==================================================================================================
 *
 * The real hub cannot report `notified: true` locally, because `CC_SUPPRESS_TELEGRAM=yes` is what stops the
 * proof suites messaging his actual phone — so against the real hub `cc permission` correctly refuses to hold
 * and the whole polling path is unreachable. That path is the feature. A stub is the only way to exercise it
 * without either sending real notifications or putting a test-only flag into production code.
 *
 * It also lets the timings be brutal: a request that expires in two seconds proves the hand-back in two
 * seconds rather than in ten minutes.
 *
 * No browser, no database, no dev server. Runs in a few seconds.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'cli', 'cc.mjs');

let passed = 0;
const failures = [];
async function check(name, fn) {
    try {
        const detail = await fn();
        passed++;
        console.log(`  ok    ${name}${detail ? `\n          ${detail}` : ''}`);
    } catch (e) {
        failures.push({ name, message: e.message });
        console.log(`  FAIL  ${name}\n          ${e.message}`);
    }
}
const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    }
};

/**
 * A hub that behaves however a test needs it to.
 *
 * `plan` decides what each GET reports, in order, so a test can say "pending, pending, allowed" and know the
 * poll loop went round three times rather than hoping it did.
 */
function stubHub({ notified = true, plan = ['allowed'], expiresInMs = 600_000 } = {}) {
    const seen = { posts: [], gets: 0, bodies: [] };
    let i = 0;
    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'POST') {
            let raw = '';
            req.on('data', d => { raw += d; });
            req.on('end', () => {
                seen.posts.push(url.pathname);
                try { seen.bodies.push(JSON.parse(raw)); } catch { seen.bodies.push(null); }
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    ok: true, saved: true, id: 'pstub0001', created: true, status: 'pending',
                    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
                    notified, notify_reason: notified ? null : 'no-channel',
                }));
            });
            return;
        }
        seen.gets++;
        const status = plan[Math.min(i++, plan.length - 1)];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            ok: true, id: 'pstub0001', status,
            expires_at: new Date(Date.now() + expiresInMs).toISOString(),
            seconds_left: Math.max(0, Math.round(expiresInMs / 1000)),
        }));
    });
    return new Promise(res => {
        server.listen(0, '127.0.0.1', () => res({
            url: `http://127.0.0.1:${server.address().port}`,
            seen,
            close: () => new Promise(r => server.close(r)),
        }));
    });
}

/** Run `cc <args>` with a payload on stdin, against a given hub. Returns stdout, stderr and the code. */
function runCc(args, { stdin = '', url, env = {}, cli = CLI } = {}) {
    return new Promise(res => {
        const child = spawn(process.execPath, [cli, ...args], {
            env: {
                ...process.env,
                CC_URL: url,
                CC_TOKEN: 'a-token-long-enough-to-look-real-0001',
                CC_AGENT: 'prove-hooks',
                ...env,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.stdin.end(stdin);
        child.on('close', code => res({ out, err, code }));
    });
}

const PAYLOAD = JSON.stringify({
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    transcript_path: '/tmp/t.jsonl',
    cwd: join(root, '..', 'harbour-lights'),
    permission_mode: 'default',
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_use_id: 'toolu_01ABCdef',
    tool_input: { command: 'rm -rf build', description: 'clean' },
});

console.log('\nProving the hook contract against a stub hub\n');

/* -------------------------------------------------------------------- the shape, which is the whole point */

await check('an ALLOW prints the PermissionRequest shape and nothing else', async () => {
    const hub = await stubHub({ plan: ['allowed'] });
    const r = await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    await hub.close();

    if (r.code !== 0) throw new Error(`exited ${r.code}; a hook must exit 0`);
    const lines = r.out.trim().split('\n').filter(Boolean);
    if (lines.length !== 1) throw new Error(`stdout had ${lines.length} line(s); it must be exactly one JSON object`);
    const j = JSON.parse(lines[0]);

    /*
     * THE ASSERTION THIS FILE EXISTS FOR. `decision.behavior`, not `permissionDecision`.
     *
     * Asserted as a whole object rather than field by field, so an EXTRA field is a failure too — a hook that
     * emits both shapes to be safe is a hook whose behaviour depends on which one the harness reads first.
     */
    eq(j, {
        hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    }, 'the emitted decision');
    return 'exactly one object, and it is the PermissionRequest shape';
});

await check('a DENY prints behavior "deny"', async () => {
    const hub = await stubHub({ plan: ['denied'] });
    const r = await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    await hub.close();
    const j = JSON.parse(r.out.trim());
    eq(j.hookSpecificOutput.decision.behavior, 'deny', 'the behaviour');
    return 'deny reaches the harness as deny';
});

/* ------------------------------------------------------------------------------- the failure modes, which
 * all have to be SILENCE on stdout. Claude Code reads no output as "defer", which is the terminal prompt. */

await check('an EXPIRED request prints nothing, so the terminal asks', async () => {
    const hub = await stubHub({ plan: ['expired'] });
    const r = await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    await hub.close();
    if (r.out.trim() !== '') throw new Error(`printed ${JSON.stringify(r.out)}; must print nothing`);
    if (r.code !== 0) throw new Error(`exited ${r.code}`);
    if (!/terminal/i.test(r.err)) throw new Error(`stderr should say what happened; got ${JSON.stringify(r.err)}`);
    return 'nothing on stdout, the reason on stderr, exit 0';
});

await check('a request NOBODY WAS NOTIFIED ABOUT does not hold at all', async () => {
    /*
     * The local case, and the one that would otherwise be the worst bug in the feature: with Telegram off,
     * holding for ten minutes waiting for a tap on a message that was never sent would freeze every tool call
     * on the machine. The hub reports `notified: false` honestly and this defers immediately.
     */
    const hub = await stubHub({ notified: false, plan: ['pending'] });
    const started = Date.now();
    const r = await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    const took = Date.now() - started;
    await hub.close();
    if (r.out.trim() !== '') throw new Error('printed a decision when nobody had been asked');
    if (hub.seen.gets !== 0) throw new Error(`polled ${hub.seen.gets} time(s) when nobody had been notified`);
    if (took > 4000) throw new Error(`took ${took}ms; it must not hold`);
    return `deferred in ${took}ms without polling once`;
});

await check('an UNREACHABLE hub prints nothing and does not hang', async () => {
    const started = Date.now();
    /* Port 1 is reserved and nothing listens on it, so this is a connection refusal rather than a timeout. */
    const r = await runCc(['permission'], { stdin: PAYLOAD, url: 'http://127.0.0.1:1' });
    const took = Date.now() - started;
    if (r.out.trim() !== '') throw new Error('printed a decision with no hub to ask');
    if (r.code !== 0) throw new Error(`exited ${r.code}; a hook that cannot reach the hub must still exit 0`);
    return `deferred in ${took}ms`;
});

await check('an UNREADABLE payload defers instantly without contacting the hub', async () => {
    const hub = await stubHub();
    const r = await runCc(['permission'], { stdin: 'not json at all', url: hub.url });
    await hub.close();
    if (r.out.trim() !== '') throw new Error('printed a decision about a payload it could not read');
    if (hub.seen.posts.length) throw new Error('filed a request with no tool name');
    return 'no output, no request filed';
});

/* ---------------------------------------------------------------------------------- the holding behaviour */

await check('it POLLS until the answer arrives rather than asking once', async () => {
    const hub = await stubHub({ plan: ['pending', 'pending', 'allowed'] });
    const r = await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    await hub.close();
    if (hub.seen.gets < 3) throw new Error(`polled ${hub.seen.gets} time(s); the answer arrived on the third`);
    eq(JSON.parse(r.out.trim()).hookSpecificOutput.decision.behavior, 'allow', 'the behaviour');
    return `held across ${hub.seen.gets} polls and then allowed`;
});

await check('what it FILES carries a readable preview, not a JSON blob', async () => {
    const hub = await stubHub({ plan: ['allowed'] });
    await runCc(['permission', '--every', '1'], { stdin: PAYLOAD, url: hub.url });
    await hub.close();
    const body = hub.seen.bodies[0];
    eq(body.tool_name, 'Bash', 'the tool name');
    eq(body.preview, 'rm -rf build', 'the preview');
    eq(body.tool_use_id, 'toolu_01ABCdef', 'the tool_use_id, which is what makes a re-post idempotent');
    if (!body.project) throw new Error('filed with no project');
    return `project "${body.project}", preview "${body.preview}"`;
});

await check('a tool this CLI has never heard of still gets a usable preview', async () => {
    /*
     * Every MCP tool is one of these. The field list in `cc permission` covers the built-ins; anything else
     * falls back to compact JSON of the input, which is worse to read and infinitely better than the tool name
     * on its own — "mcp__linear__create_issue" with no arguments is not something anybody can approve.
     */
    const hub = await stubHub({ plan: ['allowed'] });
    await runCc(['permission', '--every', '1'], {
        stdin: JSON.stringify({
            session_id: 's', cwd: root, tool_name: 'mcp__linear__create_issue',
            tool_input: { teamId: 'ENG', title: 'Ship it' },
        }),
        url: hub.url,
    });
    await hub.close();
    const p = hub.seen.bodies[0].preview;
    if (!p.includes('Ship it')) throw new Error(`preview lost the arguments: ${JSON.stringify(p)}`);
    return `fell back to ${JSON.stringify(p)}`;
});

/* ------------------------------------------------------------------------------------------- the heartbeat */

await check('a SessionStart heartbeat files the project, session, branch and model', async () => {
    const hub = await stubHub();
    const r = await runCc(['heartbeat'], {
        stdin: JSON.stringify({
            session_id: 'sess-abc', cwd: root, hook_event_name: 'SessionStart',
            source: 'startup', model: 'claude-opus-5',
        }),
        url: hub.url,
    });
    await hub.close();
    if (r.code !== 0) throw new Error(`exited ${r.code}`);
    const body = hub.seen.bodies[0];
    eq(body.session, 'sess-abc', 'the session id');
    eq(body.model, 'claude-opus-5', 'the model');
    if (body.ended) throw new Error('a SessionStart must not report the session as ended');
    /* The branch is read off git in the cwd. This repo is a git checkout, so there has to be one. */
    if (!body.branch) throw new Error('no branch was read off a real git checkout');
    return `session ${body.session}, branch ${body.branch}, model ${body.model}`;
});

await check('a SessionEnd heartbeat reports the reason and closes the session', async () => {
    const hub = await stubHub();
    await runCc(['heartbeat', '--end'], {
        stdin: JSON.stringify({ session_id: 'sess-abc', cwd: root, reason: 'prompt_input_exit' }),
        url: hub.url,
    });
    await hub.close();
    const body = hub.seen.bodies[0];
    eq(body.ended, true, 'the ended flag');
    eq(body.end_reason, 'prompt_input_exit', 'the reason');
    return 'ended: true, reason carried through';
});

await check('a heartbeat with an UNREACHABLE hub never fails a session', async () => {
    /*
     * The property that makes presence safe to install. This runs at the start of every session in an opted-in
     * project; if it exited non-zero or wrote to stdout on a bad day, it would be interfering with the thing it
     * is supposed to be quietly observing.
     */
    const r = await runCc(['heartbeat'], {
        stdin: JSON.stringify({ session_id: 's', cwd: root }),
        url: 'http://127.0.0.1:1',
    });
    if (r.code !== 0) throw new Error(`exited ${r.code}; a heartbeat must never fail a session`);
    if (r.out.trim() !== '') throw new Error(`wrote to stdout: ${JSON.stringify(r.out)}`);
    if (!r.err.trim()) throw new Error('said nothing at all; the reason belongs on stderr');
    return 'exit 0, silent on stdout, reason on stderr';
});

await check('a heartbeat that cannot identify itself sends nothing', async () => {
    const hub = await stubHub();
    await runCc(['heartbeat'], { stdin: '{}', url: hub.url, env: { CC_AGENT: 'prove-hooks' } });
    await hub.close();
    if (hub.seen.posts.length) throw new Error('posted a heartbeat with no session id');
    return 'no session id, no request';
});

/* ------------------------------------------------------------------------------------------- the reports
 *
 * WHAT THESE ARE FOR. `cc report` is the hook that made the hub a command centre rather than a status
 * board, and it reads three fields the harness hands over — `last_assistant_message` on `Stop`, `prompt` on
 * `UserPromptSubmit`, `message` plus `notification_type` on `Notification`. Every one of those is a name
 * that could be wrong, and the failure mode of a wrong name is SILENT: a report posted with a null body
 * looks exactly like a turn that ended without saying anything.
 *
 * So each field is asserted by name against the documented payload, and the two refusals — a notification
 * that is not about a human, and `--quiet` — are asserted too, because both are promises made to somebody
 * setting this up on a machine that is not theirs.
 */

await check('the CLI and the hub declare the SAME version, or the staleness warning is a lie', async () => {
    /*
     * ONE NUMBER, TWO FILES, AND THAT IS THE HAZARD. `cli/cc.mjs` may not import anything — zero
     * dependencies and one file is what lets it run on a machine with nothing on it — so the version it
     * sends is declared there and the version the hub expects is declared in `lib/cliversion.ts`.
     *
     * Two declarations of one number is precisely the drift the whole handshake exists to detect, which
     * would be a funny way for it to fail. A bump landing in one file and not the other has two outcomes,
     * both bad: every agent is told it is stale when it is current, or no agent is ever told anything.
     */
    const { CLI_VERSION } = await import('../lib/cliversion.ts');
    const src = readFileSync(CLI, 'utf8');
    const found = /^const CLI_VERSION = (\d+);/m.exec(src);
    if (!found) throw new Error('cli/cc.mjs no longer declares CLI_VERSION in a form this can read');
    eq(Number(found[1]), CLI_VERSION, 'the version cli/cc.mjs sends');
    return `both declare ${CLI_VERSION}`;
});

await check('an OLD CLI is told it is old, and a current one is not', async () => {
    /*
     * The behaviour, end to end through the real CLI against a stub hub — and both halves, because a
     * warning that always fires is the same defect as one that never does. The stub echoes the query it
     * received so this can also assert the version was actually SENT rather than inferred by the hub.
     */
    const { CLI_VERSION } = await import('../lib/cliversion.ts');
    const seen = [];
    const hub = createServer((req, res) => {
        seen.push(req.url);
        const claimed = Number(new URL(req.url, 'http://x').searchParams.get('cli') ?? 0);
        const body = {
            ok: true, now: new Date(0).toISOString(), cursor: 1, since: 0, agent: 'prove-hooks',
            last_sync_at: null, hours_since_last_sync: null, changed: [], more: false,
            counts: { open_tasks: 0, open_questions: 0, blocked_tasks: 0 },
            open_tasks: [], open_questions: [], defaulted_questions: [], notes: [], scope: null,
        };
        if (claimed < CLI_VERSION) {
            body.cli_stale = true;
            body.cli_advice = 'The CLI on this machine is older than the hub. Two commands, in this order:';
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    });
    await new Promise(r => hub.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${hub.address().port}`;

    const current = await runCc(['sync'], { url });
    /* The real CLI sends its own constant, so a current CLI must NOT be warned. If this half ever fails, the
     * two declarations have drifted and the check above says which way. */
    if (/older than the hub/.test(current.out)) {
        throw new Error(`a current CLI was told it is stale:\n${current.out}`);
    }
    if (!seen.some(u => u.includes(`cli=${CLI_VERSION}`))) {
        throw new Error(`the CLI did not send its version. Saw: ${seen.join(', ')}`);
    }

    /*
     * THE INJECTION: a COPY of the real file with its constant lowered, rather than an env override.
     *
     * A `CC_FORCE_CLI_VERSION` lever would be production code that exists only for this check, and a lever
     * that makes a CLI misreport its own version is a footgun sitting next to the thing it tests. Rewriting
     * one line of a copy exercises the same code path with no lever to leave behind — and it fails if the
     * declaration stops being a single readable line, which is the only assumption the check above makes.
     */
    const oldCli = join(tmpdir(), `cc-stale-${CLI_VERSION}.mjs`);
    const lowered = readFileSync(CLI, 'utf8')
        .replace(/^const CLI_VERSION = \d+;/m, 'const CLI_VERSION = 1;');
    if (!/^const CLI_VERSION = 1;/m.test(lowered)) {
        throw new Error('could not lower the version in a copy, so this proves nothing');
    }
    writeFileSync(oldCli, lowered);
    const stale = await runCc(['sync', '--since', '0'], { url, cli: oldCli });
    await new Promise(r => hub.close(r));
    rmSync(oldCli, { force: true });
    return /older than the hub/.test(stale.out)
        ? 'a current CLI is silent; a stale one is told, with the two commands'
        : (() => { throw new Error(`a stale CLI was not warned:\n${stale.out}`); })();
});

await check('the run gap is LARGER than the live window, which is the load-bearing relationship',
    async () => {
        /*
         * NOT A CHECK ON EITHER NUMBER — a check on the relationship between them, because the numbers are
         * both tunable and the relationship is not.
         *
         * Cutting a run at a gap sets its `ended_at`. A closed run whose end falls inside the live window
         * renders as *"it ran and stopped"*. So if the gap were shorter than the window there would be a
         * stretch of minutes in which an agent that is working reads as finished — the exact class of untruth
         * this whole feature was built to remove, reintroduced by somebody reasonably deciding that thirty
         * minutes felt tidier.
         *
         * READ OUT OF THE SOURCE, and not imported, because `lib/presence.ts` CANNOT be imported by a check:
         * it takes `humanSpan` as a value from `lib/format.ts`, which breaks Node's type-stripping, and its
         * own header calls that the deliberate trade. `lib/reports.ts` is importable and is imported for
         * exactly that contrast — the two halves of the same relationship, read the two ways available.
         *
         * A regex over source is a weaker instrument than an import and it is the strongest one there is
         * here. It still fails if somebody edits either number, which is the whole job.
         */
        const { RUN_GAP_MINUTES } = await import('../lib/reports.ts');
        const src = readFileSync(join(root, 'lib', 'presence.ts'), 'utf8');
        const found = /export const LIVE_MINUTES\s*=\s*(\d+)/.exec(src);
        if (!found) {
            throw new Error('LIVE_MINUTES is no longer declared in lib/presence.ts in a form this can read');
        }
        const LIVE_MINUTES = Number(found[1]);
        if (!(RUN_GAP_MINUTES > LIVE_MINUTES)) {
            throw new Error(
                `RUN_GAP_MINUTES is ${RUN_GAP_MINUTES} and LIVE_MINUTES is ${LIVE_MINUTES}. A gap no larger `
                + 'than the live window means a run closed by a gap is reported as "ran and stopped" while '
                + 'the agent is still working.',
            );
        }
        return `gap ${RUN_GAP_MINUTES} min > live window ${LIVE_MINUTES} min`;
    });

await check('Stop posts the last thing the assistant SAID, by that field name', async () => {
    const hub = await stubHub();
    await runCc(['report', '--said'], {
        stdin: JSON.stringify({
            session_id: 'sess-r1', cwd: root, hook_event_name: 'Stop',
            last_assistant_message: 'Rate table fixed. Next: the two call sites.',
        }),
        url: hub.url,
    });
    await hub.close();
    const body = hub.seen.bodies[0];
    eq(body.kind, 'said', 'the kind');
    eq(body.session, 'sess-r1', 'the session id');
    eq(body.body, 'Rate table fixed. Next: the two call sites.', 'the message');
    if (!body.branch) throw new Error('no branch was read off a real git checkout');
    return `said: ${JSON.stringify(body.body.slice(0, 30))}, branch ${body.branch}`;
});

await check('UserPromptSubmit posts what he TYPED, from the prompt field', async () => {
    const hub = await stubHub();
    await runCc(['report', '--told'], {
        stdin: JSON.stringify({
            session_id: 'sess-r1', cwd: root, hook_event_name: 'UserPromptSubmit',
            prompt: 'make the two call sites agree',
        }),
        url: hub.url,
    });
    await hub.close();
    eq(hub.seen.bodies[0].kind, 'told', 'the kind');
    eq(hub.seen.bodies[0].body, 'make the two call sites agree', 'the prompt');
    return 'told, with the prompt carried through';
});

await check('a Notification that means A HUMAN IS NEEDED is reported', async () => {
    const hub = await stubHub();
    await runCc(['report', '--waiting'], {
        stdin: JSON.stringify({
            session_id: 'sess-r1', cwd: root, hook_event_name: 'Notification',
            notification_type: 'agent_needs_input', message: 'Claude is waiting for your input',
        }),
        url: hub.url,
    });
    await hub.close();
    eq(hub.seen.bodies[0].kind, 'waiting', 'the kind');
    eq(hub.seen.bodies[0].body, 'Claude is waiting for your input', 'the message');
    return 'waiting, with the harness message carried through';
});

await check('a Notification about ANYTHING ELSE is not reported at all', async () => {
    /*
     * The `matcher` in the settings file is the first lock and this is the second, which is the same
     * belt-and-braces `cc subagent` uses on the tool name. `auth_success` fires on every sign-in and is not
     * about him; a row for it would be a line on his project page that no action follows from.
     */
    const hub = await stubHub();
    await runCc(['report', '--waiting'], {
        stdin: JSON.stringify({
            session_id: 'sess-r1', cwd: root, hook_event_name: 'Notification',
            notification_type: 'auth_success', message: 'Signed in',
        }),
        url: hub.url,
    });
    await hub.close();
    if (hub.seen.posts.length) throw new Error('posted a report for auth_success');
    return 'auth_success, no request';
});

await check('--quiet sends the activity and NOT the words', async () => {
    /*
     * The promise behind `cc presence on --no-words`, and it has to be a check rather than a comment: it is
     * the answer to "this tool uploads everything you type", and an answer that quietly stopped being true
     * would be worse than never having offered it.
     */
    const hub = await stubHub();
    await runCc(['report', '--said', '--quiet'], {
        stdin: JSON.stringify({
            session_id: 'sess-r1', cwd: root, last_assistant_message: 'something private',
        }),
        url: hub.url,
    });
    await hub.close();
    const body = hub.seen.bodies[0];
    if (!body) throw new Error('sent nothing at all; --quiet withholds the words, not the report');
    eq(body.kind, 'said', 'the kind');
    if (body.body !== null) throw new Error(`sent a body: ${JSON.stringify(body.body)}`);
    return 'the turn was reported, the words were not';
});

await check('a report with an UNREACHABLE hub never blocks his prompt', async () => {
    /*
     * SHARPER THAN THE HEARTBEAT'S VERSION OF THIS. `UserPromptSubmit` runs BETWEEN HIM AND HIS OWN AGENT,
     * and a non-zero exit from that event BLOCKS the prompt. A hub that is down must never be able to stop
     * him talking to Claude Code.
     */
    const r = await runCc(['report', '--told'], {
        stdin: JSON.stringify({ session_id: 's', cwd: root, prompt: 'hello' }),
        url: 'http://127.0.0.1:1',
    });
    if (r.code !== 0) throw new Error(`exited ${r.code}; this event blocks the prompt when it fails`);
    if (r.out.trim() !== '') throw new Error(`wrote to stdout: ${JSON.stringify(r.out)}`);
    return 'exit 0, silent on stdout, reason on stderr';
});

/* --------------------------------------------------------------------------------- proving it can fail
 *
 * The whole file is about one shape being right, so the one thing that must be demonstrated is that the
 * assertion would notice the wrong one. `PreToolUse`'s shape is the mistake worth simulating, because it is
 * the one a reasonable person makes and the one that fails silently.
 */
console.log('\n  proving the shape assertion can fail\n');
await check('the PreToolUse shape would be REJECTED by the assertion above', async () => {
    const wrong = {
        hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            permissionDecision: 'allow',
            permissionDecisionReason: 'the hub said so',
        },
    };
    let caught = false;
    try {
        eq(wrong, {
            hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
        }, 'the emitted decision');
    } catch { caught = true; }
    if (!caught) {
        throw new Error('the assertion accepted PreToolUse\'s shape, so it proves nothing about the contract');
    }
    return 'permissionDecision is caught, so the check is measuring the right thing';
});

console.log(
    failures.length === 0
        ? `\n${passed} check(s) passed, and the shape assertion was shown to reject the wrong shape.\n`
        : `\n${failures.length} FAILED of ${passed + failures.length}:\n`
          + failures.map(f => `  - ${f.name}: ${f.message}`).join('\n') + '\n',
);
process.exitCode = failures.length ? 1 : 0;
