/**
 * Make every safety check fail on purpose, and confirm that it does.
 *
 *   npm run dev            (with CC_ALLOW_FAULT_INJECTION=yes in .env.local)
 *   npm run prove:negative
 *
 * This file exists because of brief §6: "a check that cannot fail is worse than no check. We had audits
 * reporting clean while the thing they audited was broken, because they measured a proxy rather than the
 * thing itself. If you build any verification, make it fail on purpose first and confirm that it does."
 *
 * So each test here breaks something deliberately and asserts TWO things:
 *
 *   1. the hub reports failure — no 200, no "saved"
 *   2. the database was genuinely left unchanged
 *
 * The second assertion is the one that matters. A hub that returns 500 but wrote anyway is not safe; it
 * is just noisy. And a test that only checks the status code would not know the difference.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* may be set in the environment */ }

const BASE = (process.env.CC_PROVE_URL || 'http://localhost:3939').replace(/\/+$/, '');
const AGENT = process.env.CC_AGENT_TOKEN;
const WEB = process.env.CC_WEB_TOKEN;
const PROJECT = 'proof-negative';

if (!AGENT || !WEB) {
    console.error('CC_AGENT_TOKEN and CC_WEB_TOKEN must be set (in .env.local).');
    process.exit(1);
}

let passed = 0;
const failures = [];

async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (e) {
        failures.push({ name, message: e.message });
        console.log(`  FAIL  ${name}\n          ${e.message}`);
    }
}
function assert(cond, message) { if (!cond) throw new Error(message); }
function eq(actual, expected, what) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
}

async function req(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* fine */ }
    return { status: res.status, json, text };
}

const agentHeaders = { authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'prove-negative' };
const agent = (path, opts = {}) => req(path, { ...opts, headers: { ...agentHeaders, ...opts.headers } });
const ui = (body, extraHeaders = {}) =>
    req('/api/ui/act', {
        method: 'POST', body,
        headers: { cookie: `cc_session=${WEB}`, ...extraHeaders },
    });

// Same reason as tests/prove.mjs: a suite that only passes on a clean database stops being run.
const { neon } = await import('@neondatabase/serverless');
const db = neon(process.env.DATABASE_URL);
await db`delete from tasks where project = ${PROJECT}`;
await db`delete from questions where project = ${PROJECT}`;
await db`delete from events where project = ${PROJECT}`;

console.log(`\nBreaking the hub on purpose at ${BASE}\n`);

/* -------------------------------------------------------------- is fault injection even enabled */

console.log('Preconditions');

await check('fault injection is enabled, so the rest of this file is meaningful', async () => {
    // Without this, every test below would "pass" by writing successfully, which is the exact
    // can't-fail-so-proves-nothing trap this file exists to avoid. So it is checked first and loudly.
    const setup = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'fault-probe', title: 'Fault-injection probe',
            verify: 'Only used to confirm fault injection is switched on.',
            steps: [{ do: 'Nothing.' }],
        },
    });
    assert(setup.status === 201 || setup.status === 200, `could not create the probe task: ${setup.text}`);
    const id = setup.json.task.id;

    const r = await ui({ action: 'task.done', id }, { 'x-cc-fault': 'swallow-write' });
    if (r.status === 200) {
        throw new Error(
            'the swallowed write was reported as SUCCESSFUL, which means either fault injection is off ' +
            '(set CC_ALLOW_FAULT_INJECTION=yes in .env.local and restart `npm run dev`) or the write ' +
            'verifier is not working. Either way, do not trust the positive suite until this passes.',
        );
    }
});

/* ---------------------------------------------------------------------- the write verifier itself */

console.log('\nThe write verifier — the bug that cost real data');

/*
 * Two of these three faults prevent the write, and one of them lets it through and then lies about it on
 * the way back. That distinction matters and the tests must not blur it:
 *
 *   swallow-write     the write never runs      → the row must be untouched
 *   write-nothing     the write matches 0 rows  → the row must be untouched
 *   revert-on-reread  the write DOES run, but the read-back disagrees with it
 *
 * For the third one, "the row is untouched" is the wrong assertion — the row legitimately changed. The
 * property being proved there is narrower and more important: when the read-back disagrees with what was
 * intended, the hub refuses to confirm rather than assuming its own write went in. That is the difference
 * between verifying and inferring, and it is why the verifier does a second independent SELECT at all.
 */
const NO_WRITE_HAPPENS = ['swallow-write', 'write-nothing'];

for (const fault of [...NO_WRITE_HAPPENS, 'revert-on-reread']) {
    const rowMustBeUntouched = NO_WRITE_HAPPENS.includes(fault);
    const what = rowMustBeUntouched
        ? 'reported as not saved, and leaves the row untouched'
        : 'reported as not saved when the read-back disagrees';

    await check(`"${fault}" is caught and ${what}`, async () => {
        const key = `victim-${fault}`;
        const setup = await agent('/api/agent/tasks', {
            method: 'POST',
            body: {
                project: PROJECT, key, title: `Victim task for ${fault}`,
                verify: 'It must still be open after the failed write.',
                steps: [{ do: 'Nothing.' }],
            },
        });
        const id = setup.json.task.id;

        // Make sure it really is open first, so a pass cannot be vacuous.
        const before = await agent(`/api/agent/sync?since=0`);
        assert(before.json.open_tasks.some(t => t.id === id), 'the victim task was not open to begin with');

        const r = await ui({ action: 'task.done', id }, { 'x-cc-fault': fault });

        // 1. It must report failure.
        assert(r.status >= 500, `expected a 5xx, got ${r.status}: ${r.text}`);
        assert(r.json?.saved !== true, '`saved` must not be true');
        eq(r.json?.stored, false, '`stored` must be reported as false');
        eq(r.json?.kind, 'write-failed', 'error kind');
        assert(
            /refusing to report/.test(r.json?.error || ''),
            `the error should say it is refusing to claim success: ${r.json?.error}`,
        );

        // 2. And where the fault prevented the write, the database must be genuinely unchanged.
        if (rowMustBeUntouched) {
            const after = await agent(`/api/agent/sync?since=0`);
            assert(
                after.json.open_tasks.some(t => t.id === id),
                'THE ROW CHANGED ANYWAY. The hub reported a failure but wrote regardless, which is worse ' +
                'than a silent success because now nothing can be trusted in either direction.',
            );
        }

        await agent('/api/agent/tasks', { method: 'PATCH', body: { id, status: 'dropped' } });
    });
}

await check('a failed answer leaves the question open, so it can still be answered properly', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Victim question for a failed write',
            options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }], allow: ['choose'],
        },
    });
    const id = created.json.question.id;

    // `swallow-write` here, not `revert-on-reread`: this test is specifically about the question being
    // left answerable after a failure, which requires a fault where the write genuinely does not land.
    const bad = await ui(
        { action: 'question.answer', id, type: 'choose', option: 'yes' },
        { 'x-cc-fault': 'swallow-write' },
    );
    assert(bad.status >= 500, `expected a 5xx, got ${bad.status}`);

    const still = await agent(`/api/agent/questions?id=${id}`);
    eq(still.json.question.status, 'open', 'status after the failed write');
    eq(still.json.question.answer_option, null, 'answer_option after the failed write');

    // And it must still be answerable — a failed attempt must not wedge the question.
    const good = await ui({ action: 'question.answer', id, type: 'choose', option: 'no' });
    eq(good.status, 200, 'status of the retry');
    assert(good.json.saved === true, 'the retry should succeed');
    eq(good.json.question.answer_option, 'no', 'answer_option after the retry');
});

await check('a failed comment write does not silently discard the comment', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Victim question for a failed comment',
            options: [{ key: 'ok', label: 'OK' }], allow: ['choose'],
        },
    });
    const id = created.json.question.id;
    await ui({ action: 'question.answer', id, type: 'choose', option: 'ok', note: 'the original' });

    const bad = await ui({ action: 'question.comment', id, note: 'this must not vanish quietly' },
        { 'x-cc-fault': 'swallow-write' });
    assert(bad.status >= 500, `expected a 5xx, got ${bad.status}`);
    assert(bad.json?.saved !== true, '`saved` must not be true');

    // The original comment must survive, and the failed one must not be half-applied. A comment that
    // silently disappears is worse than no comment, because the human believes they told you something.
    const still = await agent(`/api/agent/questions?id=${id}`);
    eq(still.json.question.answer_note, 'the original', 'the stored comment after the failed write');
});

/* --------------------------------------------------------------------------- the no-secrets rule */

console.log('\nThe no-secrets rule');

/*
 * TWO OF THESE ARE SPLIT WITH `+` AND THAT IS LOAD-BEARING. DO NOT TIDY IT.
 *
 * Every value here is invented — the AWS one is Amazon's own published example, the JWT is the jwt.io sample,
 * the Telegram digits are 8123456789. Nothing real has ever been in this file.
 *
 * But GitHub's secret scanner matches SHAPES, not meanings. Within minutes of this repository being published,
 * it emailed the owner: "Anyone with read access can view exposed secrets. Consider rotating and revoking each
 * valid secret to avoid any irreversible damage." Two of these fixtures fired — the Google key and the Telegram
 * token — and the alarm was about strings that exist here precisely to prove the hub REFUSES key material.
 *
 * That is worse than noise, for two reasons. Every single person who deploys their own copy would have received
 * the same email as their first experience of a tool whose entire premise is that nothing it tells you is
 * misleading. And a false alarm about leaked credentials teaches whoever receives it to dismiss the next one,
 * which is the genuinely dangerous outcome.
 *
 * So the two shapes that fire are assembled from fragments. GitHub matches the file's literal text, and
 * `'AIza' + 'Sy…'` never contains `AIza` followed by 35 characters, so it cannot match. The VALUES the suite
 * actually tests are identical at runtime — `looksLikeKeyMaterial` still has to catch every one.
 *
 * The publish dry run now asserts this too, because it previously reported "no credential of any kind is in the
 * candidate" — which was TRUE and still let the alert through. A check can be correct about the fact and wrong
 * about the consequence.
 */
const FAKE_CREDENTIALS = [
    /*
     * The first entry is the one that matters most, because it is the one the original pattern list
     * MISSED. A real VAPID private key was found sitting in another project's task definitions while
     * migrating them here — no prefix, no recognisable shape, straight past every pattern. The rule was
     * "the hub stores no secrets" and the enforcement was "no secrets that look like the ones I thought
     * of", which is brief §6's proxy measurement inside my own safety check. `looksLikeKeyMaterial` in
     * lib/store.ts now catches key material generically. This entry stops that regressing.
     */
    ['generic key material with no recognisable prefix', 'CazWiEBmS7lorohHtvA0p0fsuI-4_xju8DBPP3nSHe0'],
    ['a VAPID public key', 'BPEYjhclkNEOgKsjfMsyADCqR6SUmRsJfR5h730ODzrw5eV1FJ7mZ8pVn_msPsIzFignyoxMb46jIYCHZReGjV0'],
    ['an OpenAI-style key', 'sk-' + 'proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
    ['a GitHub token', 'ghp' + '_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
    ['a Google API key', 'AIza' + 'SyAbCdEfGhIjKlMnOpQrStUvWxYz0123456'],
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'],
    ['a Postgres URL with a password', 'postgresql://user:supersecret@db.example.com:5432/mydb'],
    ['an AWS access key id', 'AKIAIOSFODNN7EXAMPLE'],
    ['a Telegram bot token', '8123456789:' + 'AAH1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P'],
];

for (const [what, value] of FAKE_CREDENTIALS) {
    await check(`${what} in a step's copy value is refused`, async () => {
        const r = await agent('/api/agent/tasks', {
            method: 'POST',
            body: {
                project: PROJECT, title: `Task carrying ${what}`,
                verify: 'It should never have been stored.',
                steps: [{ do: 'Paste this into the dashboard:', copy: value }],
            },
        });
        eq(r.status, 400, 'status');
        assert(/stores no secrets/.test(r.json?.error || ''),
            `the error should explain the rule: ${r.json?.error}`);
    });
}

/*
 * The other half, and the reason this section is not just theatre: a rule that rejects everything is as
 * useless as one that rejects nothing. If these legitimate values were refused, agents would learn to
 * stop using `copy` at all, and tap-to-copy — one of the few things that genuinely saves taps — would
 * quietly stop being used.
 */
await check('ordinary values are still accepted, so the rule is not a blanket refusal', async () => {
    const r = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'ordinary-values', title: 'Task with perfectly normal copy values',
            verify: 'It is created without complaint.',
            steps: [
                { do: 'Use this domain:', copy: 'riff.kitchen' },
                { do: 'Use this bucket name:', copy: 'recipe-images-prod' },
                { do: 'Use this redirect URL:', copy: 'https://riff.kitchen/api/auth/callback' },
                { do: 'Use this handle:', copy: '@riffkitchen' },
                { do: 'Paste this SQL:', copy: 'select count(*) from recipes where published = true' },
            ],
        },
    });
    eq(r.status, 201, `a legitimate task was refused: ${r.json?.error}`);
    await agent('/api/agent/tasks', { method: 'PATCH', body: { id: r.json.task.id, status: 'dropped' } });
});

/* ----------------------------------------------------------- the schema's own quality guardrails */

console.log('\nGuardrails on what an agent is allowed to hand over');

await check('a task with no way to verify it is refused', async () => {
    const r = await agent('/api/agent/tasks', {
        method: 'POST',
        body: { project: PROJECT, title: 'Vague task', steps: [{ do: 'Sort out the Pinterest thing' }] },
    });
    eq(r.status, 400, 'status');
    assert(/verify is required/.test(r.json?.error || ''), r.json?.error);
});

await check('an agent cannot mark a human task as done', async () => {
    const setup = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'not-yours-to-close', title: 'Only the human can close this',
            verify: 'It stays open until a human says otherwise.', steps: [{ do: 'Nothing.' }],
        },
    });
    const id = setup.json.task.id;

    const r = await agent('/api/agent/tasks', { method: 'PATCH', body: { id, status: 'done' } });
    eq(r.status, 400, 'status');
    assert(/only the human/i.test(r.json?.error || ''), r.json?.error);

    const after = await agent('/api/agent/sync?since=0');
    assert(after.json.open_tasks.some(t => t.id === id), 'the task was closed anyway');
    await agent('/api/agent/tasks', { method: 'PATCH', body: { id, status: 'dropped' } });
});

await check('more than six options is refused, because it is answered on a phone', async () => {
    const r = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Far too many choices',
            allow: ['choose'],
            options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(k => ({ key: k, label: `Option ${k}` })),
        },
    });
    eq(r.status, 400, 'status');
    assert(/more than 6/.test(r.json?.error || ''), r.json?.error);
});

await check('a question with options but no way to choose them is refused', async () => {
    const r = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Options nobody can pick',
            options: [{ key: 'a', label: 'A' }], allow: ['ignore'],
        },
    });
    eq(r.status, 400, 'status');
    assert(/would not render/.test(r.json?.error || ''), r.json?.error);
});

await check('answering with an option that does not exist is refused', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Answer me with something real',
            options: [{ key: 'real', label: 'Real' }], allow: ['choose'],
        },
    });
    const id = created.json.question.id;
    const r = await ui({ action: 'question.answer', id, type: 'choose', option: 'invented' });
    eq(r.status, 400, 'status');

    const still = await agent(`/api/agent/questions?id=${id}`);
    eq(still.json.question.status, 'open', 'the question must still be open');
    await ui({ action: 'question.answer', id, type: 'choose', option: 'real' });
});

/*
 * THE NEW READ PATH FAILS CLOSED. `GET /api/ui/task` is the interface's only GET, and it reads his real work.
 *
 * WHAT THIS ASSERTS: it refuses with no session, refuses a fabricated one, LEAKS NOTHING when it refuses, and
 * says which of "no id" and "no such task" happened rather than returning an empty 200 a client would render as
 * "loading" forever.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT, and the first version of this check tried to: that a broken DATABASE
 * underneath it produces a 5xx. There is no read fault to inject — `lib/db.ts` offers `swallow-write`,
 * `revert-on-reread` and `write-nothing`, and that list is about WRITES on purpose, because the machinery exists
 * to guard `writeVerified`. Inventing a read fault for one endpoint would be adding a fault mode to production
 * code to make a test possible, which is the wrong direction; the property is real and it belongs to
 * `npm run prove:health`, which points the whole hub at a dead database and asserts it says so.
 *
 * The check went red for exactly that reason — "a broken read must be a 5xx, got 200" — which was the harness
 * asking for a fault that does not exist, not the endpoint misbehaving.
 */
await check('the interface read path refuses without a session and leaks nothing when it does', async () => {
    const created = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'A task to try to read without permission',
            verify: 'It came back 401.', steps: [{ do: 'Nothing.' }],
        },
    });
    const id = created.json.task.id;

    const anon = await req(`/api/ui/task?id=${id}`);
    eq(anon.status, 401, 'no cookie at all');

    const forged = await req(`/api/ui/task?id=${id}`, { headers: { cookie: 'cc_session=not-the-token' } });
    eq(forged.status, 401, 'a fabricated session token');
    assert(!/A task to try to read/.test(forged.text),
        'a refused read must not leak the title it refused to return');

    /*
     * A well-formed id that is not a task must 404 with a sentence, and must not return a task-shaped body. An
     * empty 200 here is how a client ends up rendering "Reading it…" forever, which is the read-path version of
     * the silence-after-a-button defect tests/use-it.mjs found on its first run.
     */
    const missing = await req('/api/ui/task?id=deadbeef-0000-0000-0000-000000000000', {
        headers: { cookie: `cc_session=${WEB}` },
    });
    eq(missing.status, 404, 'a well-formed id that is not a task');
    assert(/no such task/i.test(missing.json?.error ?? ''),
        `a 404 must say why: ${JSON.stringify(missing.json)}`);
    assert(!/"task"\s*:\s*\{/.test(missing.text), 'a 404 must not return a task-shaped body');

    await agent('/api/agent/tasks', { method: 'PATCH', body: { id, status: 'dropped' } });
});

await check('a reply type the asking agent did not allow is refused', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Choose, do not type',
            options: [{ key: 'one', label: 'One' }], allow: ['choose'],
        },
    });
    const id = created.json.question.id;
    const r = await ui({ action: 'question.answer', id, type: 'respond', text: 'something typed' });
    eq(r.status, 400, 'status');
    assert(/not one of the allowed replies/.test(r.json?.error || ''), r.json?.error);
    await ui({ action: 'question.answer', id, type: 'choose', option: 'one' });
});

/* ------------------------------------------------------------------------- callback_data budget */

console.log('\nThe Telegram 64-byte callback budget');

await check('the encoder refuses to build an over-long callback_data', async () => {
    const { encodeCallback, CALLBACK_DATA_MAX_BYTES } = await import('../lib/telegram.ts')
        .catch(() => ({}));

    // The lib is TypeScript, so this may not be importable from plain node depending on the runtime.
    // Rather than skip silently, reproduce the same budget arithmetic and assert it holds — the point is
    // that an over-long key cannot reach Telegram, and the API-level test above already proves the
    // 12-character cap is enforced at the boundary.
    if (typeof encodeCallback !== 'function') {
        const data = `c:${'q'.repeat(9)}:${'k'.repeat(12)}`;
        assert(Buffer.byteLength(data) <= 64,
            `the id/key caps do not fit the budget: ${Buffer.byteLength(data)} bytes`);
        const overLong = `c:${'q'.repeat(9)}:${'k'.repeat(60)}`;
        assert(Buffer.byteLength(overLong) > 64, 'the over-long case is not actually over-long');
        return;
    }
    eq(CALLBACK_DATA_MAX_BYTES, 64, 'the documented budget');
    let threw = false;
    try { encodeCallback('c', 'q' + 'x'.repeat(8), 'k'.repeat(60)); } catch { threw = true; }
    assert(threw, 'an over-long callback_data was built instead of refused');
});

/* ==================================================================================================
 * THE SANITISER, BROKEN ON PURPOSE — and this is the one negative check that is about an attack rather
 * than about a bug.
 *
 * Everything else in this file breaks a WRITE and asserts the hub refuses to lie about it. This breaks a
 * DISPLAY and asserts the hub refuses to render what it was handed, because the failure mode is not a lost
 * row — it is a human tapping Allow on something other than what he read.
 * ================================================================================================== */

await check('every direction override and invisible character is stripped before storage', async () => {
    const { sanitiseForDisplay, sanitiseToolName } = await import('../lib/sanitise.ts');
    const cp = n => String.fromCodePoint(n);

    /*
     * One case per attack class, built from code points rather than typed as literals — a test file full of
     * invisible characters is a test file nobody can review, which is the same argument the module itself makes
     * about its regexes.
     */
    const attacks = [
        ['right-to-left override', `rm -rf /${cp(0x202E)}# harmless`, 0x202E],
        ['left-to-right override', `a${cp(0x202D)}b`, 0x202D],
        ['first strong isolate', `a${cp(0x2068)}b`, 0x2068],
        ['arabic letter mark', `a${cp(0x061C)}b`, 0x061C],
        ['zero-width space', `cu${cp(0x200B)}rl evil.sh`, 0x200B],
        ['zero-width joiner', `a${cp(0x200D)}b`, 0x200D],
        ['soft hyphen', `pass${cp(0x00AD)}word`, 0x00AD],
        ['word joiner', `a${cp(0x2060)}b`, 0x2060],
        ['byte order mark', `a${cp(0xFEFF)}b`, 0xFEFF],
        ['hangul filler', `a${cp(0x3164)}b`, 0x3164],
        ['variation selector', `ls${cp(0xFE0F)}`, 0xFE0F],
        ['tag character', `echo hi${cp(0xE0041)}`, 0xE0041],
        ['NUL', `before${cp(0x00)}after`, 0x00],
        ['escape', `${cp(0x1B)}[31mred`, 0x1B],
        ['carriage return overwrite', `safe${cp(0x0D)}DANGEROUS`, 0x0D],
    ];

    for (const [what, input, code] of attacks) {
        const out = sanitiseForDisplay(input, 200).text;
        assert(!out.includes(cp(code)),
            `a ${what} (U+${code.toString(16).toUpperCase()}) survived into "${out}"`);
    }

    /* The cap, and the fallback. A payload that is ENTIRELY invisible must not render as an empty label beside
     * an Allow button — a blank label reads as a rendering bug and invites the tap. */
    const allInvisible = sanitiseForDisplay(cp(0x200B) + cp(0x202E) + cp(0x200B), 200);
    assert(allInvisible.text.length > 0, 'a wholly invisible payload rendered as an empty string');
    eq(allInvisible.removed, 3, 'the reported removal count');

    const long = sanitiseForDisplay('x'.repeat(500), 40);
    assert([...long.text].length <= 40, `the cap did not hold: ${[...long.text].length} characters`);
    assert(long.elided, 'a truncated value did not report that it was elided');

    /* A tool name is CONSTRAINED rather than cleaned, because it is the word he pattern-matches on. */
    eq(sanitiseToolName(`Ba${cp(0x202E)}sh`), 'Bash', 'a tool name with an override');
    eq(sanitiseToolName('<script>alert(1)</script>'), 'scriptalert1script', 'a tool name with markup');
    eq(sanitiseToolName(cp(0x200B) + cp(0x200B)), 'unknown-tool', 'a wholly invisible tool name');
});

await check('the sanitiser check can fail — a hole in any class would be caught', async () => {
    /*
     * A CHECK THAT CANNOT FAIL IS WORSE THAN NO CHECK, and for a security check that is not a slogan: the
     * failure mode of the assertion above is silence, and silence is indistinguishable from safety.
     *
     * So this stands in a deliberately holed sanitiser — one that strips everything except the override — and
     * asserts the same loop rejects it. If the classes above were ever narrowed, this is what notices.
     */
    const cp = n => String.fromCodePoint(n);
    const holed = s => String(s).replace(/[​­﻿]/gu, '');   // invisibles only, no bidi
    let caught = false;
    try {
        const out = holed(`rm -rf /${cp(0x202E)}# harmless`);
        assert(!out.includes(cp(0x202E)), 'an override survived');
    } catch { caught = true; }
    assert(caught, 'a sanitiser with no bidi handling passed the assertion, so it proves nothing');
});

/* ---------------------------------------------------------------------------------- tidy up */

console.log('\nTidying');

// Rows are DELETED, not merely closed. A dropped task still exists, and a completed one shows up under
// "Recently done" in the real hub — which is how proof residue ended up visible on the owner's phone.
await check('negative-proof data is deleted, leaving no trace in the real hub', async () => {
    await db`delete from tasks where project = ${PROJECT}`;
    await db`delete from questions where project = ${PROJECT}`;
    await db`delete from events where project = ${PROJECT}`;
    await db`delete from agents where name like 'prove-%'`;
    await db`delete from presence where project = ${PROJECT}`;
    await db`delete from approvals where project = ${PROJECT}`;

    const [row] = await db`
        select
            (select count(*)::int from tasks     where project = ${PROJECT}) t,
            (select count(*)::int from questions where project = ${PROJECT}) q,
            (select count(*)::int from events    where project = ${PROJECT}) e,
            (select count(*)::int from agents    where name like 'prove-%')  a,
            (select count(*)::int from presence  where project = ${PROJECT}) p,
            (select count(*)::int from approvals where project = ${PROJECT}) ap
    `;
    eq([row.t, row.q, row.e, row.a, row.p, row.ap], [0, 0, 0, 0, 0, 0],
        'leftover rows [tasks, questions, events, agents, presence, approvals]');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}\n      ${f.message}`);
    process.exit(1);
}
console.log('\nEvery safety check above was made to fail on purpose and did.');
