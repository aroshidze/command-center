/**
 * Prove the hub works, by exercising it over real HTTP against the real database.
 *
 *   npm run dev          (in one terminal)
 *   npm run prove        (in another)
 *
 * NOT A SMOKE TEST. Every assertion here reads state back out of the hub and compares it to what was
 * intended. A 201 is not evidence that anything was stored, so nothing in this file treats a status code
 * as a pass on its own — brief §8, "a status code is not a working feature".
 *
 * The companion file, tests/prove-failures.mjs, does the other half of the job required by brief §6: it
 * makes each check fail on purpose and confirms that it does. A suite that only ever goes green is
 * indistinguishable from a suite that cannot go red.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* may be set in the environment */ }

const BASE = (process.env.CC_PROVE_URL || 'http://localhost:3939').replace(/\/+$/, '');
const AGENT = process.env.CC_AGENT_TOKEN;
const WEB = process.env.CC_WEB_TOKEN;
const TG = process.env.CC_TELEGRAM_SECRET;
const PROJECT = 'proof-run';

if (!AGENT || !WEB) {
    console.error('CC_AGENT_TOKEN and CC_WEB_TOKEN must be set (in .env.local). See docs/SETUP.md.');
    process.exit(1);
}

/**
 * Wipe anything a previous run of this file left behind, straight from the database.
 *
 * The first version of this suite did not do this and could only pass once: run two created a task whose
 * idempotency key already existed, so an expected 201 arrived as a 200 and eight assertions fell over.
 * A proof that only works on a clean database is not a proof, it is a coincidence — you would stop
 * running it, and then it would stop telling you anything.
 *
 * This talks to Postgres directly rather than through the API on purpose: there is no delete endpoint,
 * and there should not be one. Nothing in the hub needs to destroy records, so adding that power to the
 * production surface just to make a test tidy would be the wrong trade.
 */
async function resetProofData() {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    await db`delete from tasks where project like 'proof-%'`;
    await db`delete from questions where project like 'proof-%'`;
    /* The three opt-in tables. Scoped like everything else here, and `spend` by SOURCE because that is its
     * key — a proof row lands under `(elsewhere)` when the hub does not know the project, so deleting by
     * project would leave it behind and make the page report spend nobody spent. */
    await db`delete from presence where project like 'proof-%'`;
    await db`delete from approvals where project like 'proof-%'`;
    /* And the reports, for the sharpest version of the same reason: a leftover `waiting` row puts an amber
     * banner at the top of a real project page saying an agent is blocked, which is a stale INSTRUCTION
     * rather than a stale figure. */
    await db`delete from reports where project like 'proof-%'`;
    await db`delete from spend where source = 'proof-machine'`;
    await db`delete from notes where project like 'proof-%' or body like '%proof note%'`;
    await db`delete from events where project like 'proof-%' or summary like '%roof note%'`;
    /*
     * THE WITHDRAWN-NOTE EVENTS, WHICH THIS SUITE HAS BEEN LEAKING SINCE IT WAS WRITTEN.
     *
     * `note.withdrawn` carries no project and its summary is the fixed string "A note was withdrawn by the
     * human", so neither pattern above ever matched one — every run left one behind, permanently. Found on
     * 6 August 2026 when the guard at the top of this file went red at **151 events**, of which 105 were
     * this suite's own litter from ~52 previous runs. The guard was working exactly as intended; nothing
     * had ever cleaned up after the thing it was warning about.
     *
     * Scoped to DANGLING events — a note event whose note no longer exists — rather than to the kind, so
     * the fixture's own notes and their events are untouched while they are loaded. That is also why this
     * cannot be "delete all note events": `note.created` deliberately survives a withdrawal in the real
     * hub, because agents were already handed it.
     */
    await db`
        delete from events
         where kind in ('note.created', 'note.withdrawn') and project is null
           and ref_id is not null and ref_id not in (select id from notes)
    `;
    await db`delete from agents where name in ('prove-script', 'prove-negative')`;
}

let passed = 0;
const failures = [];

/**
 * A check. A returned string is printed as its detail.
 *
 * Added so a passing check can show WHAT IT MEASURED rather than only that it did not throw. The immediate reason
 * is the sync-log guard below: "80 events, 60 of headroom" printed on every run is an early warning that the dev
 * log is creeping toward the page cap, where a bare "ok" is not. The same argument as `tests/use-it.mjs`, which
 * had the identical gap.
 */
async function check(name, fn) {
    try {
        const detail = await fn();
        passed++;
        console.log(`  ok    ${name}${typeof detail === 'string' && detail ? `\n          ${detail}` : ''}`);
    } catch (e) {
        failures.push({ name, message: e.message });
        console.log(`  FAIL  ${name}\n          ${e.message}`);
    }
}

function eq(actual, expected, what) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${what}: got ${a}, expected ${b}`);
}
function assert(cond, message) { if (!cond) throw new Error(message); }

const agentHeaders = { authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'prove-script' };

async function req(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* some responses are plain text by design */ }
    /* `headers` is returned because one route's content-type is part of its contract rather than incidental:
     * `/api/agent/cc.mjs` is downloaded to disk with curl and must not arrive as JSON or as HTML. */
    return { status: res.status, json, text, headers: res.headers };
}

const agent = (path, opts = {}) => req(path, { ...opts, headers: { ...agentHeaders, ...opts.headers } });
const ui = (body, headers = {}) =>
    req('/api/ui/act', { method: 'POST', body, headers: { cookie: `cc_session=${WEB}`, ...headers } });

console.log(`\nProving the hub at ${BASE}`);

/*
 * PREFLIGHT RUNS BEFORE ANYTHING ELSE, including the reset.
 *
 * Two reasons, and the second was found by pointing this suite at production to check the guard worked:
 *
 *  1. If the server has a live Telegram channel, this run would push synthetic questions to a real phone.
 *     That happened once, a dozen messages at a time. A test that spams the person it exists to serve
 *     gets switched off, and a switched-off test protects nothing.
 *  2. `resetProofData()` DELETEs from the database it is pointed at. Originally it ran first, so aborting
 *     afterwards was too late — the deletes had already happened. Only `proof-%` rows are ever in scope,
 *     so real data was never reachable, but a destructive step must never precede the check that decides
 *     whether to proceed at all.
 *
 * This aborts the process rather than failing an assertion, for the same reason: by the time an assertion
 * failed, the damage would be done.
 */
const preflight = await req('/api/health');
if (preflight.json?.checks?.telegram?.detail?.includes('bot token and chat id are set')) {
    console.error(
        '\nREFUSING TO RUN: the server has a live Telegram channel, so this suite would push synthetic\n' +
        'questions to a real phone — and would delete proof data from the database it is pointed at.\n\n' +
        '  Add CC_SUPPRESS_TELEGRAM=yes to .env.local and restart `npm run dev`.\n\n' +
        'Real notification delivery is verified in production, where that flag is absent.\n',
    );
    process.exit(1);
}
console.log('preflight: Telegram sending is off, so this run cannot notify anyone.');

await resetProofData();
console.log('(cleared any data left by a previous run, so this is repeatable)\n');

/* ------------------------------------------------------------------ the hub is actually running */

console.log('Health and authentication');

/*
 * ================================================================================================
 * THE SYNC LOG HAS TO HAVE ROOM, AND THIS CHECK EXISTS BECAUSE ITS ABSENCE COST AN HOUR
 * ================================================================================================
 *
 * `changed` is paged at 200 rows (lib/store.ts) and it returns the OLDEST 200 since the cursor. Twenty-four checks
 * in this file sync with `since=0` and then look through `changed` for an event they have just created. The moment
 * the dev log holds more than 200 rows, those events are on the second page and every one of those checks fails —
 * with a message about its own subject, not about the log.
 *
 * MEASURED, when it happened: six checks failed at once, reporting a defaulted question that had not resolved, a
 * tick that had not stored, three notes that had not reached sync, and a cursor that would not settle. Nothing was
 * wrong with any of them. The dev log had reached 196 rows between runs and crossed 200 during one, and the number
 * of casualties grew run over run (4, then 11, then 17 stray events) because the log is append-only and each run
 * leaves more behind. `docs/HANDOVER.md` records that this log "has already been truncated to a few dozen rows by
 * early proof runs", which means somebody hit this before, truncated, and did not leave a check behind.
 *
 * So this fails FIRST and says the real thing. It does not fix the underlying fragility — the honest fix is for
 * those checks to drain the pages, which `syncAll` below does and which the cursor check now uses — but it turns
 * a confusing six-failure run into one instruction.
 *
 * The threshold is 140 rather than 200 because a single run of this suite creates several dozen events of its own,
 * so the log has to be comfortably under the cap when the run STARTS, not merely under it now.
 */
await check('the dev sync log is short enough that a `since=0` sync is not paged', async () => {
    const s = await agent('/api/agent/sync?since=0');
    const n = s.json.changed.length;
    assert(!s.json.more,
        `the log already pages at since=0: ${n} events returned and more=true. Trim the dev events table ` +
        'or use syncAll(), or two dozen checks below will look for their own events on a page they never read.');
    assert(n <= 140,
        `the dev sync log holds ${n} events and the page cap is 200. This suite adds several dozen of its own, ` +
        'so it will cross the cap mid-run and checks that search `changed` for a recent event will fail for a ' +
        'reason that has nothing to do with what they are testing. Trim the events table on the dev branch: ' +
        'nothing derives from it (see AGENTS.md), it is the agent sync log and nothing else.');
    return `${n} events, ${140 - n} of headroom before this suite starts paging`;
});

/**
 * Every page of `changed`, concatenated — the paging contract from AGENTS.md, honoured.
 *
 * *"`changed` is paged at 200. If `more` is `true`, sync again straight away — loop until it is `false`."* That is
 * the instruction the hub gives agents, and a suite that asserts things about `changed` while reading only the
 * first page is not following it. Used by the cursor check; the other `since=0` call sites are guarded by the
 * check above instead, which is a smaller change to a suite this session did not set out to rewrite.
 */
async function syncAll(query = '') {
    const out = [];
    let since = 0;
    let cursor = 0;
    for (let page = 0; page < 50; page++) {
        const r = await agent(`/api/agent/sync?since=${since}${query}`);
        out.push(...r.json.changed);
        cursor = r.json.cursor;
        if (!r.json.more) return { changed: out, cursor, last: r };
        since = cursor;
    }
    throw new Error('the sync log did not drain in 50 pages, which is 10,000 events');
}

await check('health reports ok with every required credential present', async () => {
    const r = await req('/api/health');
    assert(r.json, 'no JSON body');
    // Telegram is expected to be off locally, so it is excluded from the required set here.
    const required = ['DATABASE_URL', 'CC_AGENT_TOKEN', 'CC_WEB_TOKEN', 'database'];
    const bad = required.filter(k => !r.json.checks[k]?.ok)
        .map(k => `${k}: ${r.json.checks[k]?.detail}`);
    if (bad.length) throw new Error(`health is not ok — ${bad.join('; ')}`);
});

// Fails closed, not open. A hub that answers an unauthenticated request is worse than one that is down.
await check('sync with no token is refused', async () => {
    const r = await req('/api/agent/sync');
    eq(r.status, 401, 'status');
});

await check('sync with a wrong token is refused', async () => {
    const r = await req('/api/agent/sync', { headers: { authorization: 'Bearer not-the-real-token-xxxxxxxx' } });
    eq(r.status, 401, 'status');
});

await check('the page rejects an unknown enter token', async () => {
    const r = await req('/api/enter?k=definitely-not-the-token-000000');
    eq(r.status, 401, 'status');
});

/* ------------------------------------------------------------------------------------ tasks */

console.log('\nTasks — handing work to the human');

let taskId = null;

await check('a task without `verify` is rejected, with a reason that says why', async () => {
    const r = await agent('/api/agent/tasks', {
        method: 'POST',
        body: { project: PROJECT, title: 'No verify step', steps: [{ do: 'Do a thing' }] },
    });
    eq(r.status, 400, 'status');
    assert(/verify is required/.test(r.json.error), `unhelpful error: ${r.json.error}`);
});

await check('a well-formed task is created and the stored row matches what was sent', async () => {
    const body = {
        project: PROJECT,
        key: 'proof-task',
        title: 'Proof task: confirm the write path stores exactly what was sent',
        why: 'If this row comes back different, nothing else in the hub can be trusted.',
        minutes: 3,
        steps: [
            { do: 'Read the value below.', copy: 'riff.kitchen' },
            { do: 'Press **I have done this**.', detail: 'Nothing happens to your projects.' },
        ],
        verify: 'This task disappears from the list and the footer shows it under Recently done.',
        gotchas: ['If it reappears after a refresh, the write did not stick and that is a real bug.'],
    };
    const r = await agent('/api/agent/tasks', { method: 'POST', body });
    eq(r.status, 201, 'status');
    assert(r.json.created === true, 'created should be true');
    taskId = r.json.task.id;

    // The point of the exercise: compare the returned row field by field, not just its presence.
    eq(r.json.task.title, body.title, 'title');
    eq(r.json.task.verify, body.verify, 'verify');
    eq(r.json.task.minutes, 3, 'minutes');
    eq(r.json.task.steps.length, 2, 'steps length');
    eq(r.json.task.steps[0].copy, 'riff.kitchen', 'steps[0].copy');
    eq(r.json.task.gotchas.length, 1, 'gotchas length');
    eq(r.json.task.status, 'open', 'status');
});

await check('re-sending the same key updates rather than duplicating', async () => {
    const r = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'proof-task',
            title: 'Proof task: confirm the write path stores exactly what was sent',
            verify: 'This task disappears from the list.',
            steps: [{ do: 'Read the value below.', copy: 'riff.kitchen' },
                    { do: 'Press **I have done this**.' }],
            minutes: 3,
        },
    });
    eq(r.status, 200, 'status');
    assert(r.json.created === false, 'created should be false on the second send');
    eq(r.json.task.id, taskId, 'id should be the same row');
});

await check('a long note on a task is readable in full, not truncated to 200 characters', async () => {
    // 600 characters: three times the event-summary truncation point. This is the regression test for a
    // real bug — a note this long used to be unreachable by any agent, because sync did not return notes
    // and there was no read-by-id for tasks.
    const long = 'The button is called Verify now, not Confirm. ' + 'x'.repeat(560);
    assert(long.length > 500, 'the test note must exceed the truncation point to mean anything');

    const saved = await ui({ action: 'task.note', id: taskId, note: long });
    eq(saved.status, 200, 'status');

    const byId = await agent(`/api/agent/tasks?id=${taskId}`);
    eq(byId.status, 200, 'read-by-id status');
    eq(byId.json.task.note, long, 'the full note must come back from read-by-id');

    const byKey = await agent(`/api/agent/tasks?project=${PROJECT}&key=proof-task`);
    eq(byKey.json.task.id, taskId, 'read-by-key must find the same task');

    const s = await agent('/api/agent/sync?since=0');
    const inSync = s.json.open_tasks.find(t => t.id === taskId);
    assert(inSync, 'the task should still be open');
    eq(inSync.note, long, 'sync must return the full note, not a truncated one');

    // And the event summary should ADMIT it truncated rather than looking like the whole note.
    const ev = s.json.changed.find(e => e.kind === 'task.note' && e.ref_id === taskId);
    assert(ev, 'no task.note event');
    assert(/truncated/.test(ev.summary),
        `a truncated summary must say so, or an agent acts on half a note: ${ev.summary}`);
});

await check('changing a task by re-POSTing its key keeps the same row, rather than needing drop-and-recreate', async () => {
    const before = await agent(`/api/agent/tasks?project=${PROJECT}&key=proof-task`);
    const r = await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'proof-task',
            title: 'Proof task: retitled in place',
            verify: 'The id is unchanged and the note survives.',
            steps: [{ do: 'Nothing.' }],
        },
    });
    eq(r.status, 200, 'status (200 = updated, not created)');
    assert(r.json.created === false, 'should be an update');
    eq(r.json.task.id, before.json.task.id, 'the id must be preserved');
    // The human's note belongs to the human and must survive an agent rewriting the task around it.
    eq(r.json.task.note, before.json.task.note, "the human's note must survive an agent's edit");
});

/* --------------------------------------------------------------------------------- questions */

console.log('\nQuestions — the decision loop');

let questionId = null;

await check('asking with options stores the options and the timed default', async () => {
    const r = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT,
            key: 'proof-question',
            title: 'Proof question: which way should the proof run resolve?',
            context: 'Only exists to prove the answer path. Either option is harmless.',
            options: [
                { key: 'a', label: 'Option A', detail: 'The first one.', recommended: true },
                { key: 'b', label: 'Option B', detail: 'The second one.' },
            ],
            allow: ['choose', 'ignore'],
            default_option: 'a',
            hours: 24,
        },
    });
    eq(r.status, 201, 'status');
    questionId = r.json.question.id;
    eq(r.json.question.options.length, 2, 'options length');
    eq(r.json.question.default_option, 'a', 'default_option');
    eq(r.json.question.status, 'open', 'status');
    assert(r.json.question.deadline, 'deadline should have been derived from hours');
    // Reported honestly rather than assumed — see app/api/agent/questions/route.ts.
    assert(typeof r.json.notified === 'boolean', 'notified must be reported');
});

await check('a deadline with no default is rejected as pointless', async () => {
    const r = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Deadline with nothing to fall back on',
            options: [{ key: 'x', label: 'X' }], allow: ['choose'], hours: 2,
        },
    });
    eq(r.status, 400, 'status');
    assert(/does nothing/.test(r.json.error), `unhelpful error: ${r.json.error}`);
});

await check('an option key longer than the Telegram callback budget is rejected', async () => {
    const r = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Key too long',
            options: [{ key: 'this-key-is-far-too-long-for-telegram', label: 'X' }], allow: ['choose'],
        },
    });
    eq(r.status, 400, 'status');
    assert(/1-12 chars/.test(r.json.error), `unhelpful error: ${r.json.error}`);
});

await check('answering from the page without a session is refused', async () => {
    const r = await req('/api/ui/act', {
        method: 'POST', body: { action: 'question.answer', id: questionId, type: 'choose', option: 'b' },
    });
    eq(r.status, 401, 'status');
});

await check('answering from the page stores the choice and confirms only after reading it back', async () => {
    const r = await ui({ action: 'question.answer', id: questionId, type: 'choose', option: 'b' });
    eq(r.status, 200, 'status');
    assert(r.json.saved === true, '`saved` must be true, and it is set only after the re-read');
    eq(r.json.question.status, 'answered', 'status');
    eq(r.json.question.answer_option, 'b', 'answer_option');
    eq(r.json.question.answer_type, 'choose', 'answer_type');
    assert(r.json.question.answered_at, 'answered_at must be set');
});

await check('answering the same question twice is refused rather than overwritten', async () => {
    const r = await ui({ action: 'question.answer', id: questionId, type: 'choose', option: 'a' });
    eq(r.status, 400, 'status');
    assert(/already answered/.test(r.json.error), `unhelpful error: ${r.json.error}`);
});

await check('the agent reads the answer back with one call', async () => {
    const r = await agent('/api/agent/sync?since=0');
    eq(r.status, 200, 'status');
    const answered = r.json.changed.find(e => e.kind === 'question.answered' && e.ref_id === questionId);
    assert(answered, 'the answer is not in `changed`');
    assert(/Option B/.test(answered.summary), `summary should name the chosen option: ${answered.summary}`);
    assert(!r.json.open_questions.some(q => q.id === questionId), 'answered question is still listed as open');
});

/* ------------------------------------------------- choosing AND commenting, not one or the other */

console.log('\nAn answer with a comment attached');

await check('a tapped option can carry a comment, and both are stored', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT,
            title: 'Proof question: pick one and say something about it',
            options: [{ key: 'yes', label: 'Do it' }, { key: 'no', label: 'Do not' }],
            allow: ['choose', 'ignore'],
        },
    });
    const id = created.json.question.id;
    const comment = 'Yes, but make sure the other project gets instructions for the change first.';

    const r = await ui({ action: 'question.answer', id, type: 'choose', option: 'yes', note: comment });
    eq(r.status, 200, 'status');
    assert(r.json.saved === true, '`saved` must be true');
    eq(r.json.question.answer_option, 'yes', 'answer_option');
    eq(r.json.question.answer_note, comment, 'answer_note');

    // And the agent must see the comment without a second lookup.
    const s = await agent('/api/agent/sync?since=0');
    const ev = s.json.changed.find(e => e.ref_id === id && e.kind === 'question.answered');
    assert(ev, 'no answered event');
    assert(
        ev.summary.includes('instructions for the change'),
        `the comment must reach sync in the summary, got: ${ev.summary}`,
    );
});

await check('a comment can be added after the answer, and appends rather than replaces', async () => {
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title: 'Proof question: comment after the fact',
            options: [{ key: 'a', label: 'A' }], allow: ['choose'],
        },
    });
    const id = created.json.question.id;

    await ui({ action: 'question.answer', id, type: 'choose', option: 'a', note: 'first thought' });

    // This is the Telegram tap-then-reply path: reply to an ALREADY ANSWERED question's message.
    const q = await agent(`/api/agent/questions?id=${id}`);
    assert(q.json.question.answer_note === 'first thought', 'first comment not stored');

    /*
     * The Telegram tap-then-reply path, exercised properly.
     *
     * The first version of this test replied to an invented message_id that matched no question, so the
     * update fell through to the "any other message becomes a note" branch — and the test passed anyway,
     * because it only asserted HTTP 200. Four stray notes reading "second thought" in the real hub are
     * what gave it away. A test that cannot distinguish the path it is testing from a completely
     * different one is not a test.
     *
     * So: give the question a real tg_message_id, reply to exactly that, and assert the COMMENT was
     * appended and that no note was created.
     */
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const MSG_ID = 987654;
    await db`update questions set tg_message_id = ${MSG_ID} where id = ${id}`;

    const notesBefore = (await db`select count(*)::int as c from notes`)[0].c;

    if (TG) {
        const r = await req('/api/telegram', {
            method: 'POST',
            headers: { 'x-telegram-bot-api-secret-token': TG },
            body: {
                update_id: 50,
                message: {
                    message_id: 9100,
                    from: { id: Number(process.env.TELEGRAM_CHAT_ID || 1) },
                    text: 'second thought',
                    reply_to_message: { message_id: MSG_ID },
                },
            },
        });
        eq(r.status, 200, 'webhook status');
        // This is the assertion that makes the test mean something.
        eq(r.json.commented, id, `the webhook must report a COMMENT on ${id}, got ${JSON.stringify(r.json)}`);

        const after = await agent(`/api/agent/questions?id=${id}`);
        eq(after.json.question.answer_note, 'first thought\nsecond thought', 'appended comment');

        const notesAfter = (await db`select count(*)::int as c from notes`)[0].c;
        eq(notesAfter, notesBefore, 'a reply to an answered question must not also create a loose note');
    } else {
        // Same append path, reachable without Telegram configured.
        const appended = await ui({ action: 'question.comment', id, note: 'second thought' });
        eq(appended.status, 200, 'append status');
        eq(appended.json.question.answer_note, 'first thought\nsecond thought', 'appended comment');
    }
});

/* ---------------------------------------------------------------- the timed default, for real */

console.log('\nThe timed default — a decision that resolves itself');

await check('a question past its deadline resolves to its stated default', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT,
            title: 'Proof question: this one is already past its deadline',
            options: [{ key: 'fall', label: 'The fallback' }, { key: 'other', label: 'The other one' }],
            allow: ['choose'], default_option: 'fall', deadline: past,
        },
    });
    eq(created.status, 201, 'create status');
    const id = created.json.question.id;

    // Defaults are applied lazily, at the moment an agent looks. No cron job to keep alive.
    const r = await agent('/api/agent/sync?since=0');
    const q = r.json.defaulted_questions.find(x => x.id === id);
    assert(q, 'the overdue question is not in `defaulted_questions`');
    eq(q.status, 'defaulted', 'status');
    eq(q.answer_option, 'fall', 'answer_option');
    eq(q.answer_type, 'default', 'answer_type');

    const ev = r.json.changed.find(e => e.kind === 'question.defaulted' && e.ref_id === id);
    assert(ev, 'no question.defaulted event was recorded');
    assert(/No answer in time/.test(ev.summary), `summary should be unmissable: ${ev.summary}`);
});

/* ---------------------------------------------------------------------- the reminder ladder */

/*
 * THE OTHER HALF OF tests/ladder.mjs's N1..N5.
 *
 * Those check the derivation, which is a pure function of two timestamps. These check that the LAZY SWEEP
 * actually runs on the path an agent uses, that the nudge is counted by the only thing that counts it, and
 * that it stays quiet while he is in the middle of a session. None of that is visible from a pure function,
 * and the pure function is not visible from here — the defect being guarded (one notification, then silence,
 * then the agent proceeds) needs both halves to be false to happen, so both are asserted.
 *
 * `created_at` is moved backwards with SQL, for the same reason tests/fixture.mjs back-dates its
 * completions: there is no endpoint for "this was asked six hours ago" and there must never be one. The
 * question itself is created for real, through the real endpoint, and only its clock is staged.
 *
 * ==================================================================================================
 * EACH OF THESE FIVE WAS WATCHED GOING RED, AND HERE IS HOW TO REPEAT IT IN TWO MINUTES
 * ==================================================================================================
 *
 * A check nobody has seen fail is a check nobody should believe. These five cannot be broken from the
 * outside the way `prove-failures.mjs` breaks a write (there is no request to corrupt — the sweep runs
 * inside a read), so the injection is done by editing lib/store.ts. Five one-line edits, each run through
 * `npm run prove`, and the result on 6 August 2026 was that every edit failed exactly the checks it should
 * and no others:
 *
 *   | one-line edit to lib/store.ts                  | what went red                                  |
 *   |------------------------------------------------|------------------------------------------------|
 *   | `return []` at the top of `applyDueReminders`  | the first three. The other two pass VACUOUSLY,  |
 *   |  — which is the behaviour that shipped         | which is itself worth knowing: "never nudged"  |
 *   |                                                | is satisfied by never nudging at all.          |
 *   | make the claiming INSERT unconditional         | only "the ladder is paced, not per-look"       |
 *   | drop the `active < QUIET_...` guard            | only "NOTHING IS NUDGED WHILE HE IS IN THE HUB"|
 *   | drop `q.status = 'open'` from `timedQuestions` | only "an ANSWERED question stops being nudged" |
 *   | force `due: true` and drop the deadline and    | "half-way to its deadline" (it nudges with a   |
 *   | default_option filters                         | ladder of one) and "a question with no         |
 *   |                                                | deadline is never nudged"                      |
 *
 * TWO THINGS THE TABLE IS WORTH KEEPING FOR, and neither is the green ticks.
 *
 * `q.default_option is not null` alone was enough to keep the no-deadline check green under three of the five
 * injections, because the store refuses a default without a deadline. A check that passes because of an
 * invariant somewhere else will go on passing after the thing it names has broken.
 *
 * And re-running the whole table after a refactor found DEAD CODE that reading had not. The last two rows
 * stopped going red, because `applyDueReminders` had kept a fallback query for callers that pass no rows and
 * the only caller passes rows in — so the `where` clause the injection was aimed at could not run. Two
 * definitions of one set, one of them unreachable. The fallback is gone; `timedQuestions` is the only place
 * that clause exists now.
 */
console.log('\nThe reminder ladder — a decision that does not resolve unseen');

/** Ask something with a 12-hour default, then pretend it was asked `hoursAgo` hours ago. */
async function askAndAge(title, hoursAgo, windowHours = 12) {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const created = await agent('/api/agent/questions', {
        method: 'POST',
        body: {
            project: PROJECT, title,
            options: [{ key: 'reuse', label: 'Reuse the bucket' }, { key: 'fresh', label: 'A new one' }],
            allow: ['choose'], default_option: 'reuse', hours: windowHours,
        },
    });
    eq(created.status, 201, 'create status');
    const id = created.json.question.id;
    const askedAt = new Date(Date.now() - hoursAgo * 3600_000);
    /* The DEADLINE moves with the ask, so the window stays `windowHours` wide and stays in the FUTURE.
     * Moving only `created_at` would put a 12-hour deadline 6 hours in the past, and `applyDueDefaults`
     * runs before the nudge sweep — the question would resolve instead of being nudged, which is correct
     * behaviour and would make this check measure nothing. */
    await db`
        update questions set created_at = ${askedAt.toISOString()}::timestamptz,
               deadline = ${new Date(askedAt.getTime() + windowHours * 3600_000).toISOString()}::timestamptz
         where id = ${id}
    `;
    return id;
}

/** How many times the hub has nudged him about this question. The only place that number exists. */
async function nudgeCount(id) {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const [r] = await db`
        select count(*)::int as n, max(summary) as last from events
         where kind = 'question.reminded' and ref_id = ${id}
    `;
    return { n: r.n, last: r.last };
}

/** Pretend he has not touched the hub for a while, so the "he is already looking" suppression stands down. */
async function pretendHeIsAway(minutes = 90) {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    await db`
        update events set at = now() - (${minutes} * interval '1 minute')
         where kind in ('task.done', 'task.reopened', 'task.note',
                        'question.answered', 'question.ignored', 'note.created', 'note.withdrawn')
           and at > now() - (${minutes} * interval '1 minute')
    `;
}

await check('a decision half-way to its deadline is nudged, and the nudge is counted by the event log',
    async () => {
        const id = await askAndAge('Proof question: half-way to its deadline', 7);
        await pretendHeIsAway();
        const before = await nudgeCount(id);
        eq(before.n, 0, 'a freshly asked question must start with no nudges');

        // The lazy path. No cron: the sweep runs because something looked, which is the whole design.
        await agent('/api/agent/sync?since=0');

        const after = await nudgeCount(id);
        eq(after.n, 1, 'the hub did not nudge him about a decision that is half-way to resolving itself');
        assert(/1 of 2/.test(after.last),
            `the event must say which rung of the ladder this was: ${after.last}`);
        /* Locally CC_SUPPRESS_TELEGRAM=yes, so nothing can actually be sent — and the event says so rather
         * than claiming a message that never left. That honesty is the point: an event reading "nudged him"
         * when there was no channel is the same class of lie as a "saved" over a rejected write. */
        assert(/no notification channel|Nudged him/.test(after.last),
            `the event must say whether anybody was actually told: ${after.last}`);
        return `${after.n} nudge: ${after.last.slice(0, 110)}…`;
    });

await check('the same question is not nudged again on the next read — the ladder is paced, not per-look',
    async () => {
        /*
         * ELEVEN hours into a twelve-hour window, so BOTH rungs (6h and 10.2h) are already owed. That is
         * the state a per-read implementation gets wrong, and ageing it to 7h — where only the first rung
         * is due — would make this check pass against the broken version. Verified by breaking the pacing
         * rule and watching this go red; the 7h version did not.
         */
        const id = await askAndAge('Proof question: paced', 11);
        await pretendHeIsAway();
        await agent('/api/agent/sync?since=0');
        const once = await nudgeCount(id);
        eq(once.n, 1, 'setup: expected exactly one nudge');

        /* Three more reads in a row. This is the failure a per-read implementation has and it is the one
         * that would get the channel muted: the second rung is already owed the moment the first is sent
         * when a question has been unlooked-at for hours. */
        await agent('/api/agent/sync?since=0');
        await agent('/api/agent/sync?since=0');
        await agent('/api/agent/sync?since=0');

        const still = await nudgeCount(id);
        eq(still.n, 1, `three more reads produced ${still.n} nudges; a look must not be a nudge`);
        return 'four reads, one nudge';
    });

await check('NOTHING IS NUDGED WHILE HE IS IN THE HUB — the same idea that collapses a burst of filings',
    async () => {
        const id = await askAndAge('Proof question: he is right here', 7);
        await pretendHeIsAway();
        /* He does something. Anything he does counts as presence; an AGENT writing does not, which is the
         * distinction that stops a task filed at 3am suppressing the nudge meant to wake him. */
        const noted = await ui({ action: 'note.add', body: 'proof note — he is at his desk' });
        eq(noted.status, 200, 'note status');

        await agent('/api/agent/sync?since=0');
        const during = await nudgeCount(id);
        eq(during.n, 0, 'he was in the hub thirty seconds ago and the hub pushed at him anyway');

        // ...and the rung is OWED, not lost. Step away and the next read sends it.
        await pretendHeIsAway();
        await agent('/api/agent/sync?since=0');
        const after = await nudgeCount(id);
        eq(after.n, 1, 'the suppressed nudge was never sent — a suppressed rung must be owed, not dropped');
        return 'silent while he was here, sent once he was not';
    });

await check('a question with no deadline is never nudged, because nothing can resolve without him',
    async () => {
        const created = await agent('/api/agent/questions', {
            method: 'POST',
            body: {
                project: PROJECT, title: 'Proof question: no deadline, so no ladder',
                options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], allow: ['choose'],
            },
        });
        eq(created.status, 201, 'create status');
        const id = created.json.question.id;
        const { neon } = await import('@neondatabase/serverless');
        const db = neon(process.env.DATABASE_URL);
        await db`update questions set created_at = now() - interval '20 days' where id = ${id}`;
        await pretendHeIsAway();
        await agent('/api/agent/sync?since=0');
        eq((await nudgeCount(id)).n, 0,
            'a question that waits open forever was nudged about — there is no failure behind it to warn of');
        return 'twenty days open, no deadline, no nudge';
    });

await check('an ANSWERED question stops being nudged, whatever its ladder said', async () => {
    const id = await askAndAge('Proof question: answered before its nudge', 7);
    const answered = await ui({ action: 'question.answer', id, type: 'choose', option: 'fresh' });
    eq(answered.status, 200, 'answer status');
    await pretendHeIsAway();
    await agent('/api/agent/sync?since=0');
    eq((await nudgeCount(id)).n, 0, 'the hub nudged him about a decision he had already made');
    return 'answered, then read four times, and never nudged';
});

/* ------------------------------------------------------------------- the human's own channels */

console.log('\nThe human talking back');

await check('ticking a task off stores it, and the agent sees it', async () => {
    const r = await ui({ action: 'task.done', id: taskId });
    eq(r.status, 200, 'status');
    assert(r.json.saved === true, '`saved` must be true');
    eq(r.json.task.status, 'done', 'status');
    assert(r.json.task.done_at, 'done_at must be set');

    const s = await agent('/api/agent/sync?since=0');
    assert(s.json.changed.some(e => e.kind === 'task.done' && e.ref_id === taskId), 'no task.done event');
    assert(!s.json.open_tasks.some(t => t.id === taskId), 'a completed task is still listed as open');
});

await check('a note from the human is delivered to the next sync', async () => {
    const body = `Proof note at ${new Date().toISOString()}`;
    const r = await ui({ action: 'note.add', body });
    eq(r.status, 200, 'status');
    assert(r.json.saved === true, '`saved` must be true');

    const s = await agent('/api/agent/sync?since=0');
    assert(
        s.json.changed.some(e => e.kind === 'note.created' && e.summary.includes(body.slice(0, 40))),
        'the note did not reach sync',
    );
});

/* ------------------------------------------------------------------ what the setting-up agent is told
 *
 * THIS CHECK EXISTS BECAUSE HE HAD TO TELL ME:
 *
 *     "dude, never forget our setup page, if we have some features to be explain to the AI which will be
 *      setting up the project, we should always update the setup prompt."
 *
 * He was right, and three features had already shipped without it. `lib/snippet.ts` is served by the hub and
 * written into every project's AGENTS.md by `cc onboard`, so it is the ONLY thing most agents ever read about
 * how to use this hub. A feature missing from it is a feature that does not exist as far as they are
 * concerned — worse than undocumented, because the snippet reads as complete.
 *
 * A promise to remember is not a mechanism. This is the mechanism: each entry names a behaviour an agent has
 * to know about and the string that proves the snippet covers it. When a behaviour changes the agent contract,
 * add a row here at the same time and the check tells you the snippet is short.
 *
 * Matched on substrings rather than on prose, deliberately: the wording should be free to improve without
 * failing a check, and what must not change is that the CONCEPT is present. Each row names the field or the
 * word an agent would grep for.
 */

await check('the snippet every project gets covers every agent-facing behaviour', async () => {
    const r = await agent('/api/agent/snippet?project=proof-run');
    eq(r.status, 200, 'status');
    const s = String(r.json.snippet || '');
    assert(s.length > 2000, `the snippet came back at ${s.length} chars, which is not the real thing`);

    const must = [
        /* A regex, not `cc.mjs sync`: the command is quoted now — `node "$HOME/…/cc.mjs" sync` — and the literal
         * substring went red about the snippet not mentioning sync at all. See the note above `missing`. */
        ['sync at the start of a session', /cc\.mjs"? sync/],
        /*
         * FOUR ROWS FOR THE MID-SESSION SYNC, added after he described the failure it fixes:
         *
         *     "the problem is they do not check the hub until I ask them, so when I finish the task they have no
         *      idea it has been finished… if I'm not home and I finish the task I cannot tell them to check."
         *
         * The snippet said "Start every session with this" and nothing else, so an agent working for two hours
         * acted for two hours on what was true at the start of them. He does these tasks away from his desk; the
         * whole point of the hub is that he does not have to come home to report.
         *
         * The instruction is EVENT-BASED rather than time-based, deliberately: an agent has no timer and acts
         * when prompted, so "sync every fifteen minutes" is an instruction that quietly does not work — which is
         * worse than none by this project's own standard. These four needles are the triggers that matter, and
         * the first is the one that fixes his exact case.
         */
        ['syncing again during a session, not only at the start', 'Sync AGAIN during the session'],
        /* The needle is the mid-sentence fragment rather than the start of it: the snippet capitalises the
         * bullet, and matching on "Before" would break the moment that line is reworded to start differently.
         * This check went red on exactly that — my own casing — which is the check working. */
        ['syncing before claiming to be blocked on him', 'you are blocked on him'],
        ['syncing before the closing summary', 'closing summary'],
        ['acknowledging a task he finished rather than silently consuming it', 'say so and act on it'],
        ['the paging loop, or a catching-up agent loses events', '"more": true'],
        ['that a filed task can notify him', 'notify_reason'],
        ['each reason it might not have', 'burst'],
        ['the blocked-task reason', 'blocked'],
        ['reporting notification honestly rather than assuming', 'notified'],
        ['timed defaults, the most valuable field in the hub', 'default_option'],
        /*
         * THREE ROWS FOR THE REMINDER LADDER, and this list is exactly why they are here.
         *
         * The ladder needs no field from an agent, so the temptation is to leave it out of the snippet on the
         * grounds that there is nothing to do about it. That is the reasoning that has already shipped three
         * features agents could not see. What an agent has to know is that `question.reminded` exists in
         * `changed` and what it means — "nudged, still unanswered" is a materially different state from
         * "asked ten minutes ago", and an agent that reads it as noise will keep waiting on someone who has
         * been asked three times.
         */
        ['that he is nudged before a deadline rather than only at it', 'nudge you in'],
        /* A short needle that cannot straddle a line wrap, which is how this row first went red — the
         * snippet is hand-wrapped prose and a four-word needle is a hostage to where the line breaks. */
        ['that a nudge replaces the message rather than adding one', 'REPLACES the message'],
        ['the event that says he has been nudged and still has not answered', 'question.reminded'],
        ['that a comment can arrive with an answer', 'comment'],
        /* Two rows added when the decision card became a side-by-side comparison. `option.detail` and
         * `recommended` were always in the FIELD REFERENCE; what changed is that they now materially change what
         * he sees — details become columns he reads across, and the recommendation is rendered first and badged
         * on both the hub and the Telegram keyboard. An agent that does not know that sends bare labels. */
        ['that option details become a side-by-side comparison', 'side-by-side comparison'],
        ['that a recommended option is rendered first and badged', 'rendered first'],
        ['that verify is required', 'verify'],
        ['the no-secrets rule', 'secret'],
        ['idempotency by key', 'idempotent'],
        ['that only he can mark a task done', 'cannot mark a task done'],
        ['that he can see whether a note was collected', 'No agent has synced since'],
        ['what does not belong in the hub', 'Roadmaps'],
        /*
         * Added with `GET /api/agent/cc.mjs`. An agent on a machine with no CLI could previously only be told
         * to ask him for it, because every route to a working `cc` assumed either this repository was checked
         * out or the file was already at `~/.command-center/`. The route closes that; a route the snippet does
         * not mention does not exist as far as agents are concerned, which is what this whole list is for.
         */
        ['how to get the CLI onto a machine that does not have it', '/api/agent/cc.mjs'],
        /*
         * THE TILDE TRAP, and it is two rows rather than a comment because it SHIPPED — twice over.
         *
         * A tilde is expanded by the SHELL, and PowerShell does not expand it inside an argument. So on Windows
         * `curl -o ~/…` exits 23 having written nothing, AND `node ~/.command-center/cc.mjs` cannot find the file
         * — and that second one is the most-run command in this whole system, the first line of this very snippet
         * for as long as it has existed. It worked for every agent so far only because they happened to be in Git
         * Bash, which does expand it.
         *
         * Quoted `"$HOME"` works in bash, zsh, Git Bash and PowerShell alike, so it is the form every command
         * here uses now. An agent on Windows following a snippet without this gets a cryptic failure on the first
         * command it ever runs for this hub, with no CLI yet to tell it anything.
         *
         * Two needles: the portable form must be present, and the PowerShell block must still be there for
         * someone who needs the folder-creation line.
         */
        ['the portable home-directory form rather than a tilde', '"$HOME/.command-center/cc.mjs"'],
        ['a PowerShell form of the install, since a tilde fails there', 'New-Item'],
        /*
         * ==================================================================================================
         * SEVEN ROWS FOR THE THREE OPT-IN FEATURES, and this list is the reason they are rows.
         * ==================================================================================================
         *
         * Presence, the permission relay and spend are all things an AGENT installs, on his behalf, in a project
         * folder. There is no button on the hub that turns any of them on — so if the snippet does not carry the
         * commands, the features exist in the code and cannot be reached by the only party able to reach them.
         * That is a strictly worse version of the failure this whole check was written for.
         *
         * The rows are split into the commands and the BEHAVIOURS, because the behaviours are what change how an
         * agent should act and are the part that would quietly go missing in a rewrite:
         *
         *   - that they are off unless asked, so nothing gets switched on unprompted
         *   - that a held tool call hands back to the terminal, so waiting costs him nothing and an agent should
         *     not narrate the wait or ask twice
         *   - that a held call is neither a task nor a question, so `cc ask` is still the way to get a decision
         *   - that `approvals on` widens what a link to the hub can do, which is his call to make
         */
        /*
         * THIS ROW USED TO LOOK FOR "off by default", AND THE CONTRACT CHANGED UNDER IT.
         *
         * All four features were off until asked for, and activity reporting has been moved into onboarding
         * — because the old rule produced a hub with ten projects on it, nine of which could never draw a
         * single run. The product worked and looked broken, and its owner reasonably concluded the second.
         *
         * So the property an agent must know is no longer "they are all off". It is the SPLIT: run the
         * activity hooks when you connect a project, and do not touch the other three unprompted. Two rows,
         * because an agent that learns only the first half turns on the permission relay unasked.
         */
        ['that activity reporting belongs in onboarding', 'run it when you connect a project'],
        ['that the other three must not be turned on unprompted', 'do not turn on unprompted'],
        ['how to switch presence on', /cc\.mjs"? presence on/],
        ['how to switch the permission relay on', /cc\.mjs"? approvals on/],
        ['how to post per-project spend', /cc\.mjs"? spend/],
        /*
         * The sub-agent rows and the backfill, added the day they shipped rather than the day somebody
         * noticed. Both change what an agent should expect the hub to know: the first means his page can
         * show what you spawned, and the second is the only way anything is known about work that ran
         * before the hooks existed.
         *
         * The firehose row is the important one. An agent reading that its sub-agents are recorded could
         * reasonably conclude that every tool call is, and either work around a cost that is not there or
         * warn him about a firehose that does not exist. The snippet has to say which.
         */
        ['how to fill the page in from what already happened', /cc\.mjs"? backfill/],
        ['that the sub-agent hooks do not fire on ordinary tool calls', 'fires nothing'],
        ['that a reconstructed run is a weaker claim than an observed one', 'reconstructed runs'],
        ['that a held tool call falls back to the terminal rather than hanging or aborting',
            'ordinary terminal prompt'],
        ['that a held tool call is neither a task nor a question', 'not a decision and not a task'],
        ['that switching approvals on widens what the hub link can do', 'approve tool calls'],
        /*
         * ==================================================================================================
         * FIVE ROWS FOR THE REPORTS, because this is the one opt-in that changes what an agent's OWN WORDS
         * are for.
         * ==================================================================================================
         *
         * With the report hooks installed, the last paragraph of every turn is read by a human, on a page,
         * later. That is a change in what writing clearly is FOR, and an agent that does not know it will
         * keep ending turns with "Done!" — which is exactly what the owner will then be looking at when he
         * opens the project page. The behaviour rows matter more than the command row here.
         *
         * The last two are the refusals, and they are rows rather than comments for the same reason the
         * others are: an agent that knows its words are stored and does NOT know that self-assessment is
         * refused will try to be helpful and write a status into them.
         */
        ['that the end of every turn is sent to the hub', 'last thing you actually said'],
        ['that a human reads the last paragraph of a turn on a page', 'read by a human'],
        ['that the harness reports when an agent is waiting, not the agent', 'waiting for a person'],
        ['that an agent is still not asked to grade itself', 'grade yourself'],
        ['that message text can be withheld while activity is still reported', '--no-words'],
    ];

    /*
     * A needle may be a string OR a RegExp, and the regex option was added for a good reason.
     *
     * This list's own header says it matches on substrings so that "the wording should be free to improve without
     * failing a check". A bare substring does not deliver that when the substring is a COMMAND: the row for
     * syncing looked for `cc.mjs sync`, and the day the command gained quotes — `node "$HOME/…/cc.mjs" sync`, to
     * fix a real Windows failure — the check went red about the snippet not mentioning sync at all. The concept
     * was there; the spelling had moved. A regex lets the row say "the CLI path, then sync" and mean it.
     */
    const missing = must.filter(([, needle]) =>
        needle instanceof RegExp ? !needle.test(s) : !s.includes(needle));
    assert(
        missing.length === 0,
        `the snippet does not mention ${missing.length} thing(s) an agent needs:\n            ` +
        missing.map(([what, needle]) => `${what}  (looked for "${needle}")`).join('\n            ') +
        '\n            This is the text written into every project\'s AGENTS.md. A feature missing from it ' +
        'does not exist as far as agents are concerned.',
    );
});

/* --------------------------------------------------------------- the hub serves its own CLI
 *
 * WHY THIS ROUTE IS WORTH THREE CHECKS
 *
 * It is the FIRST thing a machine with nothing on it calls, so it is the one route whose failure cannot be
 * worked around by the person hitting it — they have no CLI yet, and every other instruction assumes one.
 * Before it existed, every path to a working machine assumed either this repository was checked out or
 * `cc.mjs` was already at `~/.command-center/`, and the empty hub was pointing new people at a setup page
 * whose first command needed the repo.
 *
 * It is also the route most likely to break invisibly in production and nowhere else: nothing imports
 * `cli/cc.mjs`, so Next's import tracing would leave it out of the deployed function unless
 * `outputFileTracingIncludes` in next.config.mjs puts it back. That cannot be proved from a dev server —
 * `next dev` has the whole repo on disk — and it is recorded as unverified in docs/ITERATION-LOG.md §XXI.
 * What CAN be proved here is that the bytes served are the file, that the token is required, and that what
 * comes back is a runnable program rather than an error page with a 200 on it.
 */

await check('the hub serves the CLI, byte for byte, to an agent that has nothing', async () => {
    const r = await agent('/api/agent/cc.mjs');
    eq(r.status, 200, 'status');

    /*
     * LINE ENDINGS ARE NORMALISED BEFORE COMPARING, and that is not a loosening.
     *
     * The working copy on this machine is CRLF (git's autocrlf on Windows) and what git stores — and therefore
     * what a Linux serverless function reads — is LF. Measured against production: 24,619 bytes here, 24,103
     * there, identical once `\r` is dropped, which is exactly the 516 lines of the file. A strict byte compare
     * would pass locally and fail the moment somebody pointed this suite at a deployment with `CC_PROVE_URL`,
     * and the failure would say "the served bytes are not cli/cc.mjs" about a file that is character for
     * character the same program. A check that fails for the wrong reason costs more than no check.
     *
     * What is still being asserted is the thing that matters: not one character of the program differs.
     */
    const lf = s => s.replace(/\r\n/g, '\n');
    const onDisk = lf(readFileSync(new URL('../cli/cc.mjs', import.meta.url), 'utf8'));
    const served = lf(r.text);
    assert(
        served === onDisk,
        `the served CLI is not cli/cc.mjs: served ${served.length} chars, the file is ${onDisk.length} ` +
        '(compared with line endings normalised, so this is a real difference in the program). ' +
        'A second copy of the CLI is the drift this route exists to prevent.',
    );

    /*
     * Not a substring check on the body. What matters is that the thing you saved to disk RUNS — a route that
     * returns an error page with a 200 on it would pass any "does it mention cc" assertion, and the person
     * hitting it has no working CLI with which to notice.
     */
    assert(served.startsWith('#!/usr/bin/env node'), 'the served file has no shebang, so it is not the CLI');
    assert(/case 'onboard'/.test(served), 'the served file does not contain the onboard command');

    const ct = r.headers.get('content-type') || '';
    assert(/^text\/plain/.test(ct), `content-type is ${JSON.stringify(ct)}, not text/plain`);

    return `${onDisk.length} chars, identical to cli/cc.mjs, as ${ct}`;
});

await check('the CLI route refuses an unauthenticated caller like every other /api/agent route', async () => {
    const r = await fetch(`${BASE}/api/agent/cc.mjs`);
    eq(r.status, 401, 'status with no Authorization header');

    const bad = await fetch(`${BASE}/api/agent/cc.mjs`, {
        headers: { authorization: 'Bearer definitely-not-the-token-but-long-enough-to-look-like-one' },
    });
    eq(bad.status, 401, 'status with a wrong token');

    /*
     * The reason this is a check and not a preference: the decision to authenticate it was argued in the
     * route's own header on the grounds that a 401 here tells you the token is wrong at the FIRST command,
     * instead of `cc setup` writing a bad token to disk and `cc health` failing later. That benefit only
     * exists if the route actually rejects a wrong token.
     */
    return 'no header and a wrong token both get 401, so a bad token fails at the first command';
});

await check('CLI-ROUTE-inj — the check above fails if the route serves anything but the file', async () => {
    /*
     * The injection cannot break the server from here, so it breaks the PREDICATE instead: the three things
     * the check asserts are re-run against the two bodies a broken version of this route would realistically
     * return — an error page with a 200, and a stale second copy of the CLI.
     */
    const lf = s => s.replace(/\r\n/g, '\n');
    const onDisk = lf(readFileSync(new URL('../cli/cc.mjs', import.meta.url), 'utf8'));
    const passes = body =>
        lf(body) === onDisk && body.startsWith('#!/usr/bin/env node') && /case 'onboard'/.test(body);

    const errorPage = '<!DOCTYPE html><html><body>500 — ENOENT: no such file cli/cc.mjs</body></html>';
    const staleCopy = onDisk.replace(/case 'onboard'/, "case 'onboard-OLD'");

    assert(!passes(errorPage), 'an HTML error page passes the byte-identity check, so it is not measuring');
    assert(!passes(staleCopy), 'a modified copy of the CLI passes the byte-identity check');
    assert(passes(onDisk), 'THE CHECK CANNOT PASS AT ALL: the real file fails its own predicate');
    return 'an error page with a 200 and a drifted copy are both rejected; the real file is accepted';
});

/*
 * THE ONE-LINE POINTER TEACHES THE SAME RULE AS THE SNIPPET.
 *
 * `POINTER` is what goes into a project's CLAUDE.md or GEMINI.md, and it is the only line an agent reads before
 * it decides whether AGENTS.md is worth opening. It said "Start every session with cc sync" and nothing more —
 * the exact rule the snippet spends a whole section correcting, in the one place an agent is most likely to
 * take at face value and stop reading.
 *
 * Checked here rather than trusted to review because it is the fourth surface found teaching the short rule
 * after the snippet was fixed: ADD-A-PROJECT.md twice, README.md, /setup's prompt, and this. A rule corrected
 * in the long document and left wrong in every summary of it is not corrected.
 */
await check('the one-line pointer teaches syncing again during the session, not only at the start', async () => {
    const r = await agent('/api/agent/snippet?project=proof-run');
    const p = String(r.json.pointer || '');
    assert(p.length > 60, `the pointer came back at ${p.length} chars, which is not the real thing`);
    /* A pattern rather than `cc.mjs sync`, for the reason recorded above the snippet-coverage list: the command
     * is quoted now, to survive PowerShell, and a literal substring failed claiming the pointer did not name the
     * command at all. What must hold is that it names the CLI and then `sync`. */
    assert(/cc\.mjs"? sync/.test(p), 'the pointer does not name the command at all');

    /*
     * Matched on the concept rather than on wording: "again" plus "during" is what an agent has to come away
     * with. Anything that says only "start every session" fails, which is the string that shipped.
     */
    const teachesAgain = /\bagain\b/i.test(p) && /\bduring\b/i.test(p);
    assert(
        teachesAgain,
        'the pointer tells an agent to sync at the START of a session and never again. That is the rule ' +
        `lib/snippet.ts devotes a section to correcting. Got: ${JSON.stringify(p)}`,
    );
    return `${p.length} chars, and it carries the mid-session rule`;
});

await check('POINTER-inj — the line that shipped is rejected by that check', async () => {
    /*
     * The injection is the exact string that was in lib/snippet.ts, so this proves the check above measures the
     * defect rather than measuring that some words are present. A check that cannot go red is worth nothing.
     */
    const shipped =
        'For anything that needs the owner — a task only he can do, or a decision you are blocked on — see ' +
        'the **Command Center** section in `AGENTS.md`. Start every session with ' +
        '`node ~/.command-center/cc.mjs sync`.';
    const teachesAgain = /\bagain\b/i.test(shipped) && /\bduring\b/i.test(shipped);
    assert(
        !teachesAgain,
        'THE INJECTION DID NOT REPRODUCE THE DEFECT: the pointer that actually shipped passes the check ' +
        'above, so that check is not measuring what it claims to measure.',
    );
    return 'the pointer that shipped for the life of this file fails the check above';
});

await check('the snippet is personalised to the project and carries its own markers', async () => {
    const r = await agent('/api/agent/snippet?project=proof-run');
    const s = String(r.json.snippet || '');
    /*
     * The markers are what make the installed block re-writable rather than duplicated: `cc onboard` replaces
     * everything between them. A snippet served without them would append a second copy to AGENTS.md on every
     * re-run, which is the drifting-duplicate failure this whole endpoint exists to avoid.
     */
    assert(s.startsWith(r.json.begin), 'the snippet does not open with the BEGIN marker');
    assert(s.trimEnd().endsWith(r.json.end), 'the snippet does not close with the END marker');
    assert(
        s.includes('proof-run'),
        'the snippet is not personalised — the project slug should appear in the example payloads, or the ' +
        'agent has to work out what to substitute',
    );
    assert(
        !s.includes('${'),
        'an unsubstituted template expression reached the served snippet',
    );
});

await check('a note can be WITHDRAWN, and the row is actually gone', async () => {
    /*
     * The only delete in the interface, and the reason it exists is concrete: production's outbound surface
     * was headlined by a marker note a proof run left behind, and the production connection string exists only
     * in Vercel. The alternative to this endpoint was permanent test residue in the most prominent position of
     * a surface built to be trusted. See the `note.remove` case in app/api/ui/act/route.ts.
     */
    const body = `Withdrawable note at ${new Date().toISOString()}`;
    const added = await ui({ action: 'note.add', body });
    eq(added.status, 200, 'status');
    const id = added.json.note.id;

    const gone = await ui({ action: 'note.remove', id });
    eq(gone.status, 200, 'status');
    assert(gone.json.saved === true, '`saved` must be true');

    /*
     * Re-read through the API rather than trusting the response. `removeNote` uses `writeVerified` for exactly
     * this reason: a delete that reports success without checking is the same defect as a write that reports
     * "saved" without re-reading, and it is HARDER to catch, because the absence it claims looks identical to
     * the absence it failed to produce.
     */
    const again = await ui({ action: 'note.remove', id });
    eq(again.status, 404, 'a second withdrawal of the same note must 404, not succeed');
});

await check('withdrawing a note does NOT rewrite what agents were already told', async () => {
    /*
     * The `note.created` event survives, deliberately. An agent that synced and received the note was not
     * lied to, and deleting the event would make the hub's history disagree with what it handed over — which
     * is the one thing the event log exists to prevent.
     */
    const body = `Event-survival note at ${new Date().toISOString()}`;
    const added = await ui({ action: 'note.add', body });
    const id = added.json.note.id;

    const before = await agent('/api/agent/sync?since=0');
    assert(
        before.json.changed.some(e => e.kind === 'note.created' && e.ref_id === id),
        'the note never reached sync, so this check proves nothing about withdrawing it',
    );

    await ui({ action: 'note.remove', id });

    const after = await agent('/api/agent/sync?since=0');
    assert(
        after.json.changed.some(e => e.kind === 'note.created' && e.ref_id === id),
        'withdrawing the note removed its note.created event. Agents were already handed that event, so ' +
        'deleting it rewrites what they were told — the hub would be claiming a message it delivered was ' +
        'never sent.',
    );
});

await check('withdrawing a note that does not exist is refused, not silently accepted', async () => {
    const r = await ui({ action: 'note.remove', id: 'n-does-not-exist' });
    eq(r.status, 404, 'status');
    const blank = await ui({ action: 'note.remove', id: '' });
    eq(blank.status, 400, 'an empty id must be a 400 rather than a no-op that reports success');
});

await check('CATCHING UP does not skip events — the cursor stops where the page did', async () => {
    /*
     * THE BUG THIS PROTECTS, WHICH SHIPPED SILENTLY.
     *
     * `syncFor` returned `changed` with `limit 200` and then set the agent's cursor to `max(seq)` over the
     * WHOLE event log. So an agent that had been away long enough to be, say, 300 events behind received 200
     * of them and had its cursor moved to the head anyway. The other hundred were gone: the next sync asked
     * for everything after the head and correctly got nothing.
     *
     * Nothing could have caught it. The response and the stored cursor were internally consistent, every
     * figure on the page was right, and the missing events were only ever visible by comparing what an agent
     * asked for against what it could still ask for afterwards. It is the exact failure the open-items
     * guarantee exists to survive — open tasks and questions are returned unconditionally, ignoring the
     * cursor — but `changed` is where "what happened while you were gone" lives, and that half was lossy.
     *
     * Measured with `since=0`, which is the deepest catch-up there is, so the check works whether the log holds
     * 30 events or 30,000 and does not need to manufacture 200 of them.
     */
    const first = await agent('/api/agent/sync?since=0&agent=cursor-probe', {
        headers: { 'x-cc-agent': 'cursor-probe' },
    });
    eq(first.status, 200, 'status');
    assert(typeof first.json.more === 'boolean', '`more` is not reported, so a capped page cannot be detected');

    const returned = first.json.changed.length;
    const highest = returned ? Math.max(...first.json.changed.map(e => e.seq)) : 0;

    if (first.json.more) {
        assert(
            first.json.cursor === highest,
            `the page was capped at ${returned} events but the cursor moved to ${first.json.cursor}, past the ` +
            `last event handed over (${highest}). Everything between them is unreachable: the next sync asks ` +
            'for what comes after the cursor and those events are behind it.',
        );
        // ...and one more call must genuinely move forward rather than returning the same page.
        const second = await agent(`/api/agent/sync?since=${first.json.cursor}`, {
            headers: { 'x-cc-agent': 'cursor-probe' },
        });
        assert(
            second.json.changed.every(e => e.seq > first.json.cursor),
            '`more` said to call again and the second page repeated events from the first',
        );
    } else {
        assert(
            highest === 0 || first.json.cursor >= highest,
            `the whole log fitted in one page but the cursor (${first.json.cursor}) is behind the last event ` +
            `returned (${highest}), so the same events come back on every sync forever`,
        );
        assert(first.json.more === false, '`more` must be false when nothing was left behind');
    }
});

/* ---------------------------------------------------------------------- the one-tap Telegram loop */

console.log('\nThe Telegram one-tap loop (server side)');

if (!TG) {
    console.log('  skip  CC_TELEGRAM_SECRET is not set, so the webhook path cannot be exercised');
} else {
    await check('the webhook refuses an update with no secret token', async () => {
        const r = await req('/api/telegram', { method: 'POST', body: { update_id: 1 } });
        eq(r.status, 401, 'status');
    });

    await check('the webhook refuses an update with the wrong secret token', async () => {
        const r = await req('/api/telegram', {
            method: 'POST', body: { update_id: 1 },
            headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret-value' },
        });
        eq(r.status, 401, 'status');
    });

    await check('a tapped button answers the question it belongs to', async () => {
        const created = await agent('/api/agent/questions', {
            method: 'POST',
            body: {
                project: PROJECT,
                title: 'Proof question: answered by a simulated button tap',
                options: [{ key: 'tap', label: 'Tapped' }, { key: 'nope', label: 'Not tapped' }],
                allow: ['choose', 'ignore'],
            },
        });
        const id = created.json.question.id;

        const r = await req('/api/telegram', {
            method: 'POST',
            headers: { 'x-telegram-bot-api-secret-token': TG },
            body: {
                update_id: 2,
                callback_query: {
                    id: 'proof-callback-1',
                    from: { id: Number(process.env.TELEGRAM_CHAT_ID || 1) },
                    data: `c:${id}:tap`,
                },
            },
        });
        // Always 200, to stop Telegram redelivering the same tap. See the route's header comment.
        eq(r.status, 200, 'status');
        assert(r.json.answered === id, `the webhook did not report answering it: ${JSON.stringify(r.json)}`);

        const back = await agent(`/api/agent/questions?id=${id}`);
        eq(back.json.question.status, 'answered', 'status after the tap');
        eq(back.json.question.answer_option, 'tap', 'answer_option after the tap');
    });

    await check('a plain message to the bot becomes a note', async () => {
        const text = `Telegram proof note ${Date.now()}`;
        const r = await req('/api/telegram', {
            method: 'POST',
            headers: { 'x-telegram-bot-api-secret-token': TG },
            body: {
                update_id: 3,
                message: { message_id: 9001, from: { id: Number(process.env.TELEGRAM_CHAT_ID || 1) }, text },
            },
        });
        eq(r.status, 200, 'status');
        assert(r.json.note, 'no note id returned');

        const s = await agent('/api/agent/sync?since=0');
        assert(s.json.changed.some(e => e.kind === 'note.created' && e.summary.includes(text)),
            'the Telegram note did not reach sync');
    });
}

/* ------------------------------------------------- project scoping: quieter, never invisible */

console.log('\nProject scoping');

await check('a scoped sync sees its own project and not another', async () => {
    for (const proj of ['proof-alpha', 'proof-beta']) {
        await agent('/api/agent/tasks', {
            method: 'POST',
            body: {
                project: proj, key: 'scoped', title: `Task in ${proj}`,
                verify: 'It appears only under its own project.', steps: [{ do: 'Nothing.' }],
            },
        });
    }

    const alpha = await agent('/api/agent/sync?since=0&project=proof-alpha');
    eq(alpha.json.scope, 'proof-alpha', 'scope');
    assert(alpha.json.open_tasks.every(t => t.project === 'proof-alpha'),
        `a scoped sync leaked another project: ${alpha.json.open_tasks.map(t => t.project).join(', ')}`);
    assert(alpha.json.open_tasks.some(t => t.title === 'Task in proof-alpha'), 'own task missing');
    assert(!alpha.json.open_tasks.some(t => t.title === 'Task in proof-beta'), 'other project leaked');
});

await check('a scoped sync still reports what is waiting elsewhere', async () => {
    const alpha = await agent('/api/agent/sync?since=0&project=proof-alpha');
    assert(alpha.json.elsewhere, '`elsewhere` must be present on a scoped sync');
    assert(
        alpha.json.elsewhere.open_tasks > 0,
        'RELIABILITY FAILURE: scoping hid outstanding work entirely instead of summarising it. ' +
        'Other projects must be quieter, never invisible.',
    );
});

await check('an unscoped sync still sees everything, and reports no `elsewhere`', async () => {
    const all = await agent('/api/agent/sync?since=0');
    eq(all.json.scope, null, 'scope');
    eq(all.json.elsewhere, null, 'elsewhere on an unscoped sync');
    const projects = new Set(all.json.open_tasks.map(t => t.project));
    assert(projects.has('proof-alpha') && projects.has('proof-beta'),
        `an unscoped sync should see both: ${[...projects].join(', ')}`);
});

await check('a note addressed to one project reaches only that project, plus unaddressed notes', async () => {
    const forAlpha = `alpha-only proof note ${Date.now()}`;
    const forAnyone = `unaddressed proof note ${Date.now()}`;
    await ui({ action: 'note.add', body: forAlpha, project: 'proof-alpha' });
    await ui({ action: 'note.add', body: forAnyone, project: null });

    const beta = await agent('/api/agent/sync?since=0&project=proof-beta');
    const betaText = JSON.stringify(beta.json.changed);
    assert(!betaText.includes(forAlpha),
        'a note addressed to proof-alpha was delivered to a proof-beta agent');
    assert(betaText.includes(forAnyone),
        'an unaddressed note must reach any agent — "whoever looks next" means whoever looks next');

    const alpha = await agent('/api/agent/sync?since=0&project=proof-alpha');
    assert(JSON.stringify(alpha.json.changed).includes(forAlpha), 'the addressed note did not arrive');
});

/* -------------------------------------------------------- the cursor cannot hide anything */

console.log('\nCursor semantics');

await check('an up-to-date cursor returns no changes but still returns every open item', async () => {
    // Something must be open for this test to mean anything, or it would pass vacuously.
    await agent('/api/agent/tasks', {
        method: 'POST',
        body: {
            project: PROJECT, key: 'proof-open-task', title: 'Proof task: deliberately left open',
            verify: 'It shows up in open_tasks even when the cursor is current.',
            steps: [{ do: 'Nothing. This one is scenery.' }],
        },
    });

    /*
     * DRAINED, because "an up-to-date cursor" is the subject of this check and a single page does not give one.
     *
     * This read one page and asserted the next was empty, which is only true while the whole log fits in 200 rows.
     * Once it does not, the first call hands back a cursor that is merely CURRENT AS FAR AS PAGE ONE, the second
     * call correctly returns page two, and the check reports "changed should be empty at a current cursor" — about
     * a cursor that was never current. It was measuring the paging it is not about.
     */
    const drained = await syncAll();
    const first = drained.last;
    const cursor = drained.cursor;
    assert(first.json.open_tasks.length > 0, 'no open tasks to test with');

    const second = await agent(`/api/agent/sync?since=${cursor}`);
    eq(second.json.changed.length, 0, 'changed should be empty at a current cursor');
    eq(
        second.json.open_tasks.length,
        first.json.open_tasks.length,
        'RELIABILITY FAILURE: a current cursor changed how much open work was reported. Open items must ' +
        'ignore the cursor entirely, or a bookkeeping error can hide work',
    );
});

/* ------------------------------------------------------------------------------------ tidy up */

/* ------------------------------------------------------------------------------------------------
 * The task notification, and the rule that keeps it from becoming spam
 *
 * THIS WHOLE PATH DID NOT EXIST UNTIL HE NOTICED IT WAS MISSING: *"I haven't received telegram messages even
 * though there have been some new tasks."* Only questions ever reached Telegram — `app/api/agent/tasks/route.ts`
 * imported nothing from lib/telegram — so tasks accumulated in silence for the entire life of the project,
 * against three documented promises and against docs/RESEARCH.md §7 cause 5, which calls this channel the
 * anti-rot mechanism.
 *
 * WHY THESE ASSERT `notify_reason` RATHER THAN `notified`. Locally `CC_SUPPRESS_TELEGRAM=yes` — the suite
 * refuses to run otherwise — so `notified` is false whichever way the rule went. Without the reason on the wire
 * a check could not tell "the rule said no" from "sending is switched off", and the one piece of logic standing
 * between his phone and nine notifications in a row would have no test at all.
 * ---------------------------------------------------------------------------------------------- */

console.log('\nChoosing an unlocked look');

/*
 * THE ONLY THING THAT MAKES AN UNLOCK MEAN ANYTHING.
 *
 * The chosen palette lives in a cookie, and a cookie is user-editable by definition — so if the server took the
 * request at its word, every palette would be available to anyone able to open dev tools, and "unlocked" would
 * be decoration. The endpoint recomputes his standing from the rows and refuses anything he has not earned.
 *
 * Checked over the WHOLE list rather than one hand-picked palette, because the interesting property is the
 * invariant: every palette is either allowed and set, or refused with a reason, and never quietly accepted.
 * Which ones are locked depends on the data in front of it, so a check naming one specific palette would pass
 * for the wrong reason as soon as the fixture changed.
 */
const PALETTE_SLUGS = ['graphite', 'slate', 'bronze', 'ink', 'moss', 'plum'];

await check('the default look is always allowed, and the server sets the cookie itself', async () => {
    const r = await ui({ action: 'looks.set', palette: 'graphite' });
    eq(r.status, 200, 'status');
    assert(r.json.saved === true, '`saved` must be true');
    eq(r.json.looks?.palette, 'graphite', 'the look the server settled on');
});

await check('every palette is either SET or REFUSED WITH A REASON — never silently accepted', async () => {
    const outcomes = [];
    for (const slug of PALETTE_SLUGS) {
        const r = await ui({ action: 'looks.set', palette: slug });
        outcomes.push({ slug, status: r.status, got: r.json.looks?.palette, error: r.json.error });

        if (r.status === 200) {
            assert(
                r.json.looks?.palette === slug,
                `${slug} was accepted but the server reports "${r.json.looks?.palette}" is in force. The page ` +
                'would show one look and believe another.',
            );
        } else {
            eq(r.status, 403, `${slug} was neither set nor refused with 403 — it returned ${r.status}`);
            assert(
                typeof r.json.error === 'string' && r.json.error.length > 8,
                `${slug} was refused with no reason. "It is locked" is only useful with the requirement.`,
            );
            assert(
                r.json.looks === undefined,
                `${slug} was refused AND reported a look, which is a refusal that changed something`,
            );
        }
    }

    /*
     * And the shape of the answer has to be plausible: the first palette is gated at level 1, so it can never be
     * refused, and a hub where everything is unlocked at once means the gates are not doing anything.
     */
    const allowed = outcomes.filter(o => o.status === 200).map(o => o.slug);
    assert(allowed.includes('graphite'), 'the level-1 palette was refused, so nothing is reachable');
    console.log(`        allowed here: ${allowed.join(', ') || 'none'}` +
        `${allowed.length === PALETTE_SLUGS.length ? '  (everything is unlocked in this database)' : ''}`);
});

await check('a palette that does not exist is a 400, not a 403 and not a 500', async () => {
    /*
     * The distinction is worth asserting rather than assuming. A nonexistent slug is a malformed request; a real
     * palette he has not earned is a well-formed request he cannot have yet. Collapsing them would tell him to
     * keep working for a look that does not exist.
     */
    const r = await ui({ action: 'looks.set', palette: 'chartreuse' });
    eq(r.status, 400, 'status');
    assert(/chartreuse/.test(String(r.json.error)), 'the error does not name what was asked for');

    const blank = await ui({ action: 'looks.set', palette: '' });
    eq(blank.status, 400, 'an empty palette must be refused rather than treated as the default');
});

await check('choosing a look needs the web session, like every other human action', async () => {
    /* No cookie at all. The endpoint is the human's, and an agent token must not reach it. */
    const r = await req('/api/ui/act', {
        method: 'POST',
        body: { action: 'looks.set', palette: 'graphite' },
        headers: { authorization: `Bearer ${AGENT}` },
    });
    eq(r.status, 401, 'status');
});

console.log('\nTask notifications');

const NOTIFY_A = `${PROJECT}-notify-a`;
const NOTIFY_B = `${PROJECT}-notify-b`;

const fileTask = (project, key, extra = {}) => agent('/api/agent/tasks', {
    method: 'POST',
    body: { project, key, title: `Notify probe ${key}`, verify: 'it exists', minutes: 5, ...extra },
});

await check('a task arriving in a quiet project would ping the phone', async () => {
    const r = await fileTask(NOTIFY_A, 'first');
    assert(r.status === 201, `expected 201, got ${r.status}`);
    assert('notified' in r.json, 'the response does not report whether anyone was notified');
    assert(
        r.json.notify_reason === 'suppressed',
        `expected the rule to say YES and sending to be off locally ("suppressed"), got ` +
        `"${r.json.notify_reason}"`,
    );
});

await check('a BURST does not ping once per task — the rest of the burst is silent', async () => {
    const second = await fileTask(NOTIFY_A, 'second');
    const third = await fileTask(NOTIFY_A, 'third');
    assert(
        second.json.notify_reason === 'burst' && third.json.notify_reason === 'burst',
        `a second and third task in the same project must be suppressed as a burst, got ` +
        `"${second.json.notify_reason}" and "${third.json.notify_reason}". Nine tasks filed at once is ` +
        'how a channel gets muted, and a muted channel is a dead hub.',
    );
});

await check('the quiet is per PROJECT, so another project still gets through', async () => {
    const r = await fileTask(NOTIFY_B, 'first');
    assert(
        r.json.notify_reason === 'suppressed',
        `a different project inside the same window must still notify, got "${r.json.notify_reason}" — ` +
        'two projects filing at once are two separate things he needs to know about',
    );
});

await check('a BLOCKED task does not ping, because he cannot act on it yet', async () => {
    const r = await fileTask(NOTIFY_B, 'blocked', { blocked_reason: 'waiting on the landlord' });
    assert(
        r.json.notify_reason === 'blocked',
        `expected "blocked", got "${r.json.notify_reason}" — announcing work he is not able to start is ` +
        'noise, and it would make the count in the message disagree with the count on the page',
    );
});

await check('EDITING a task does not ping — a re-POST is an edit, not an arrival', async () => {
    const r = await fileTask(NOTIFY_A, 'first', { title: 'Notify probe first, edited' });
    assert(r.json.created === false, 'the same key should have updated rather than created');
    assert(
        r.json.notified === false,
        'an edit must never notify — AGENTS.md says re-POSTing a key is how an agent changes a task, and ' +
        'pinging him every time an agent tidies a step is how the channel gets muted',
    );
});

console.log('\nTidying the proof data');

await check('the notification probes are withdrawn too', async () => {
    const s = await agent('/api/agent/sync?since=0');
    const mine = s.json.open_tasks.filter(t => t.project === NOTIFY_A || t.project === NOTIFY_B);
    for (const t of mine) {
        await agent('/api/agent/tasks', { method: 'PATCH', body: { id: t.id, status: 'dropped' } });
    }
    const after = await agent('/api/agent/sync?since=0');
    const left = after.json.open_tasks.filter(t => t.project === NOTIFY_A || t.project === NOTIFY_B);
    assert(left.length === 0, `${left.length} notification probe task(s) left behind`);
});

/*
 * THE INTERFACE'S OWN READ PATH — new, and the gap it closes was real.
 *
 * `board()` narrows every completed task and drops `steps`, `verify` and `gotchas`, which is right and measured:
 * nineteen step objects per completion, forever, on every page load, reached 509 KB at nine hundred completions.
 * The side effect was that a FINISHED task could not be opened, so the one place the hub holds a nineteen-step
 * procedure he might want again was write-only.
 *
 * `GET /api/ui/task?id=…` fills it. Three things are asserted, and the second two are the ones that matter:
 * it returns the steps, it REFUSES without a session, and it 404s with a sentence rather than an empty 200 —
 * because hard constraint 2 is that a failure shows the server's own reason, and an empty 200 is how a client
 * ends up rendering "loading" forever.
 */
await check('the interface can read one task in full, and refuses without a session', async () => {
    const s = await agent('/api/agent/sync?since=0');
    const mine = s.json.open_tasks.find(t => t.project === PROJECT);
    assert(mine, 'no proof task to read back');

    const withSession = await req(`/api/ui/task?id=${mine.id}`, {
        headers: { cookie: `cc_session=${WEB}` },
    });
    eq(withSession.status, 200, 'status with a session');
    eq(withSession.json.task.id, mine.id, 'the id it returned');
    assert(Array.isArray(withSession.json.task.steps) && withSession.json.task.steps.length > 0,
        'the read path must return the steps — that is the whole reason it exists');
    assert(typeof withSession.json.task.verify === 'string' && withSession.json.task.verify.length > 0,
        'and `verify`, which is the most useful line in it six weeks later');

    // No cookie. This endpoint reads his real work; an unauthenticated 200 would be the whole hub open.
    const anon = await req(`/api/ui/task?id=${mine.id}`);
    eq(anon.status, 401, 'status with no session');

    // A missing id, and a well-formed id that does not exist, must each say which.
    const noId = await req('/api/ui/task', { headers: { cookie: `cc_session=${WEB}` } });
    eq(noId.status, 400, 'status with no id');
    const missing = await req('/api/ui/task?id=does-not-exist', {
        headers: { cookie: `cc_session=${WEB}` },
    });
    eq(missing.status, 404, 'status for an unknown id');
    assert(/no such task/i.test(missing.json?.error ?? ''),
        `a 404 must say why: ${JSON.stringify(missing.json)}`);
});

await check('proof tasks are withdrawn so the hub is left clean', async () => {
    const s = await agent('/api/agent/sync?since=0');
    const mine = s.json.open_tasks.filter(t => t.project === PROJECT);
    for (const t of mine) {
        const r = await agent('/api/agent/tasks', { method: 'PATCH', body: { id: t.id, status: 'dropped' } });
        eq(r.status, 200, `dropping ${t.id}`);
    }
    const after = await agent('/api/agent/sync?since=0');
    eq(after.json.open_tasks.filter(t => t.project === PROJECT).length, 0, 'leftover proof tasks');
});

await check('proof questions are closed so the hub is left clean', async () => {
    const s = await agent('/api/agent/sync?since=0');
    for (const q of s.json.open_questions.filter(q => q.project === PROJECT)) {
        await ui({ action: 'question.answer', id: q.id, type: q.allow.includes('ignore') ? 'ignore' : 'choose',
                   option: q.options[0]?.key });
    }
    const after = await agent('/api/agent/sync?since=0');
    eq(after.json.open_questions.filter(q => q.project === PROJECT).length, 0, 'leftover proof questions');
});

/*
 * Purge at the END as well as the start.
 *
 * Cleaning up only at the start was not enough, and the evidence was on the owner's phone: the real hub's
 * footer read "Last agent sync: prove-script", "Recently done: Proof task…", "Last note: Telegram proof
 * note 1785…". Dropping a task leaves the row, and a COMPLETED proof task still shows under Recently
 * done — so the residue was visible in the one place that is supposed to contain only real work.
 *
 * The underlying cause is bigger and is written up in docs/PROOF.md: local development and production
 * share one database. Until that is split onto its own Neon branch, this suite must leave the database
 * exactly as it found it.
 */
/* ==================================================================================================
 * THE THREE OPT-IN SURFACES — presence, held tool calls, and spend.
 *
 * Everything here is read back out of the database rather than inferred from a status code, which is this
 * file's whole rule. The one that matters most is the LAST one: that none of this reaches a count.
 * ================================================================================================== */

const dbDirect = async () => {
    const { neon } = await import('@neondatabase/serverless');
    return neon(process.env.DATABASE_URL);
};

await check('a heartbeat is stored, and ending one closes the same row rather than making a second',
    async () => {
        const db = await dbDirect();
        await db`delete from presence where project = 'proof-presence'`;

        const start = await agent('/api/agent/presence', {
            method: 'POST',
            body: { project: 'proof-presence', session: 'sess-1', branch: 'master', model: 'claude-opus-5' },
        });
        eq(start.status, 200, 'status');
        eq(start.json.saved, true, 'saved');
        eq(start.json.ended, false, 'a SessionStart must not report the session as ended');

        const end = await agent('/api/agent/presence', {
            method: 'POST',
            body: { project: 'proof-presence', session: 'sess-1', ended: true, end_reason: 'clear' },
        });
        eq(end.json.ended, true, 'a SessionEnd must report the session as ended');

        const rows = await db`select * from presence where project = 'proof-presence'`;
        eq(rows.length, 1, 'rows for one session — the end must UPDATE rather than insert');
        eq(rows[0].branch, 'master', 'the stored branch');
        eq(rows[0].end_reason, 'clear', 'the stored end reason');
        assert(rows[0].ended_at != null, 'ended_at was not set, so the page would report it as working');
    });

await check('a heartbeat REFUSES to store a self-reported status, however it is spelled', async () => {
    /*
     * The brief's §4 refusal, enforced rather than merely documented: *"an agent asked to self-report health
     * reports green, and a single green-while-you-slept status poisons every other indicator on the page."*
     *
     * There is no `status` field, so this asserts the ABSENCE of one — that sending several plausible names for
     * it is accepted and stored nowhere. A future field called any of these would make this check go red, which
     * is exactly the point: the refusal has to survive somebody being helpful.
     */
    const db = await dbDirect();
    await db`delete from presence where project = 'proof-presence'`;
    const r = await agent('/api/agent/presence', {
        method: 'POST',
        body: {
            project: 'proof-presence', session: 'sess-2',
            status: 'all green', health: 'excellent', doing: 'refactoring', progress: '80%', state: 'happy',
        },
    });
    eq(r.status, 200, 'status');
    const [row] = await db`select * from presence where project = 'proof-presence'`;
    const stored = JSON.stringify(row).toLowerCase();
    for (const claim of ['all green', 'excellent', 'refactoring', '80%', 'happy']) {
        assert(!stored.includes(claim), `the hub stored an agent's self-report ("${claim}")`);
    }
});

await check('a REPORT is stored as a quote, and an invented kind is refused', async () => {
    /*
     * The distinction the whole feature rests on, asserted against the database rather than promised in a
     * comment: what an agent SAID is stored, what an agent CLAIMS ABOUT ITSELF has no field to go in.
     * `lib/presence.ts` refuses a `doing` column and `/api/agent/report` must not become the back door to
     * one — so a kind that is not one of the three documented observations is rejected outright.
     */
    const db = await dbDirect();
    await db`delete from reports where project = 'proof-reports'`;
    await db`delete from presence where project = 'proof-reports'`;

    const said = await agent('/api/agent/report', {
        method: 'POST',
        body: {
            project: 'proof-reports', session: 'conv-1', kind: 'said',
            body: 'Fixed the rate table. Two call sites left.',
        },
    });
    eq(said.status, 200, 'status');
    eq(said.json.saved, true, 'saved');
    eq(said.json.run, 'conv-1', 'the first run of a conversation keeps the bare session id');

    const [row] = await db`select * from reports where project = 'proof-reports'`;
    eq(row.kind, 'said', 'the stored kind');
    eq(row.body, 'Fixed the rate table. Two call sites left.', 'the stored words');
    eq(row.session, 'conv-1', 'the stored session is the CONVERSATION, never the run');

    /* The same call is the activity signal, which is the half that stops the page saying nothing has looked
     * at a project an agent is working in. */
    const beats = await db`select * from presence where project = 'proof-reports'`;
    eq(beats.length, 1, 'presence rows — a report must also register as activity');
    assert(beats[0].ended_at == null, 'a report closed the run it was reporting activity for');

    for (const kind of ['doing', 'status', 'progress', 'health', 'green']) {
        const bad = await agent('/api/agent/report', {
            method: 'POST',
            body: { project: 'proof-reports', session: 'conv-1', kind, body: 'all going well' },
        });
        assert(bad.status >= 400, `kind "${kind}" was accepted; the refusal has a back door`);
    }

    const stored = JSON.stringify(await db`select * from reports where project = 'proof-reports'`);
    assert(!stored.includes('all going well'), 'a self-reported status reached the database');
});

await check('the IDE\'s injected context is never stored as something HE said', async () => {
    /*
     * A DEFECT HE FOUND ON HIS OWN PROJECT PAGE: *"the messages I send, look at them. It's just opening a
     * file? What kind of message is that? I never sent it."* Three rows attributed to him, each beginning
     * with `<ide_opened_file>The user opened the file …</ide_opened_file>`.
     *
     * `UserPromptSubmit`'s `prompt` is not what the human typed — it is what the harness is about to send the
     * model, and an IDE prepends context blocks. Storing that under a person's name is the worst thing this
     * hub can get wrong: every other row on the page is trustworthy because it can name who said it, and
     * these named the wrong person. The wrapper also ate a third of the length budget, so the real sentence
     * was cropped.
     *
     * THREE PROPERTIES, and the third is the one a naive fix would miss.
     */
    const db = await dbDirect();
    await db`delete from reports where project = 'proof-reports'`;

    const WRAP = '<ide_opened_file>The user opened the file d:\\x\\ORCHESTRATOR.md in the IDE. This may or '
        + 'may not be related to the current task.</ide_opened_file>';

    /* 1. A prompt with a wrapper AND real words keeps the words and loses the wrapper. */
    const both = await agent('/api/agent/report', {
        method: 'POST',
        body: {
            project: 'proof-reports', session: 'conv-ide', kind: 'told',
            body: `${WRAP}Produce a decision-grade teardown of six offshore casino brands.`,
        },
    });
    eq(both.status, 200, 'status');
    eq(both.json.stored, true, 'a prompt with real words in it must be stored');
    const [row] = await db`select body from reports where project = 'proof-reports'`;
    assert(!String(row.body).includes('ide_opened_file'), 'the IDE wrapper reached the database');
    assert(!String(row.body).includes('opened the file'), 'the IDE prose reached the database');
    assert(String(row.body).startsWith('Produce a decision-grade teardown'),
        `the stored text does not start with what he actually typed: ${JSON.stringify(row.body)}`);

    /* 2. A prompt that is NOTHING BUT a wrapper stores no row at all — it is not a message. */
    await db`delete from reports where project = 'proof-reports'`;
    const only = await agent('/api/agent/report', {
        method: 'POST',
        body: { project: 'proof-reports', session: 'conv-ide', kind: 'told', body: WRAP },
    });
    eq(only.status, 200, 'status for a prompt that was only injected context');
    eq(only.json.stored, false, 'a pure IDE notification must not become a thread row');
    const after = await db`select count(*)::int n from reports where project = 'proof-reports'`;
    eq(after[0].n, 0, 'rows stored for a prompt that was only injected context');

    /* 3. AND IT IS STILL ACTIVITY. The event proves the session was alive at that moment, which is the true
     *    half of what it carried — dropping the row must not drop the heartbeat. */
    const beats = await db`select * from presence where project = 'proof-reports'`;
    assert(beats.length > 0, 'the injected-context event was dropped entirely, losing the activity too');
});

await check('a report REDACTS a credential rather than storing it or losing the report', async () => {
    /*
     * The one place in this codebase where a secret-shaped value is redacted instead of rejected, and the
     * reasoning is on `redactSecrets` in lib/reports.ts: nobody can rewrite a message that has already been
     * said, so the choice is between keeping it with the token removed and throwing away the only account of
     * what an agent was doing.
     *
     * BOTH HALVES ARE ASSERTED. That the key is gone, and that the sentence around it survived — a rule that
     * quietly dropped the whole body would pass a check written only against the first half.
     */
    const db = await dbDirect();
    await db`delete from reports where project = 'proof-reports'`;
    const KEY = `sk-${'proj-'}AbCdEfGh12345678ijklMNOP`;

    const r = await agent('/api/agent/report', {
        method: 'POST',
        body: {
            project: 'proof-reports', session: 'conv-2', kind: 'said',
            body: `I set OPENAI_API_KEY to ${KEY} and the build went green`,
        },
    });
    eq(r.status, 200, 'status');
    eq(r.json.redacted, true, 'the response must say the text was changed');

    const [row] = await db`select * from reports where project = 'proof-reports'`;
    assert(!String(row.body).includes(KEY), 'the credential itself reached the database');
    assert(String(row.body).includes('(redacted)'), 'nothing marks where the credential was');
    assert(String(row.body).includes('the build went green'),
        'the rest of the message was thrown away with the secret');
});

await check('a CONVERSATION IS SPLIT INTO RUNS at a gap, and the old run is closed at its last sighting',
    async () => {
        /*
         * HIS FINDING, ENFORCED: *"The session may never end… One open AI iteration can be live for several
         * days."* An eleven-day conversation drawn as one bar eleven days long is useless, so runs are cut
         * out of activity wherever it went quiet for longer than RUN_GAP_MINUTES.
         *
         * The gap is faked by backdating the row rather than by waiting an hour. What is asserted is the
         * whole rule: a NEW run id, the old row CLOSED, and closed AT ITS LAST SIGHTING rather than at now —
         * that last part is the difference between recording a gap and claiming an hour of work nobody saw.
         */
        const db = await dbDirect();
        await db`delete from reports where project = 'proof-runs'`;
        await db`delete from presence where project = 'proof-runs'`;

        const first = await agent('/api/agent/report', {
            method: 'POST',
            body: { project: 'proof-runs', session: 'conv-9', kind: 'said', body: 'run one' },
        });
        eq(first.json.run, 'conv-9', 'the first run keeps the bare conversation id');

        /* Ninety minutes, which is past the sixty-minute gap. Both timestamps move, because the gap is
         * measured from the LAST thing seen. */
        await db`
            update presence
               set started_at = now() - interval '120 minutes',
                   last_seen_at = now() - interval '90 minutes'
             where project = 'proof-runs'`;

        const second = await agent('/api/agent/report', {
            method: 'POST',
            body: { project: 'proof-runs', session: 'conv-9', kind: 'said', body: 'run two' },
        });
        eq(second.json.run, 'conv-9:2', 'a gap must start a second run');

        const rows = await db`
            select session, started_at, last_seen_at, ended_at, end_reason
              from presence where project = 'proof-runs' order by started_at`;
        eq(rows.length, 2, 'presence rows after a gap');
        eq(String(rows[0].session), 'conv-9', 'the first run keeps its id');
        eq(String(rows[0].end_reason), 'gap', 'the closed run must say why it ended');
        assert(rows[0].ended_at != null, 'the old run was left open, so it would draw to now');
        const closedAt = new Date(rows[0].ended_at).getTime();
        const lastSeen = new Date(rows[0].last_seen_at).getTime();
        assert(Math.abs(closedAt - lastSeen) < 2000,
            'the old run was closed at NOW rather than at the last thing seen, which claims a span '
            + 'nobody observed');
        assert(rows[1].ended_at == null, 'the new run was closed immediately');

        /* AND THE REPORTS STILL NAME THE CONVERSATION, not the run — that is what lets a sub-agent or a
         * report be matched to whichever run was going at the time, however the boundaries move later. */
        const said = await db`
            select distinct session from reports where project = 'proof-runs'`;
        eq(said.length, 1, 'distinct session ids in reports');
        eq(String(said[0].session), 'conv-9', 'reports must be filed against the conversation');
    });

await check('a held tool call is sanitised on the way IN, not on the way out', async () => {
    /*
     * The attack shapes, planted through the real endpoint. A right-to-left override in the tool name and two
     * zero-width spaces in the preview — see lib/sanitise.ts for why each of those is a display attack rather
     * than a curiosity.
     *
     * Asserted against the DATABASE, which is the whole reason the sanitising happens at the boundary: the same
     * string is rendered by a React page, a Telegram message and a terminal, and a rule applied at each render
     * site is a rule the next render site forgets.
     */
    const db = await dbDirect();
    await db`delete from approvals where project = 'proof-approval'`;
    const RLO = String.fromCodePoint(0x202E);
    const ZWSP = String.fromCodePoint(0x200B);

    const r = await agent('/api/agent/permission', {
        method: 'POST',
        body: {
            project: 'proof-approval',
            tool_use_id: 'toolu_proof_1',
            tool_name: `Ba${RLO}sh`,
            preview: `rm -rf build${ZWSP}${ZWSP} # tidy`,
        },
    });
    eq(r.status, 200, 'status');
    eq(r.json.status, 'pending', 'a filed request starts pending');

    const [row] = await db`select * from approvals where project = 'proof-approval'`;
    eq(row.tool_name, 'Bash', 'the stored tool name — the override must be gone');
    assert(!String(row.preview).includes(ZWSP), 'a zero-width space survived into the stored preview');
    assert(!String(row.preview).includes(RLO), 'a direction override survived into the stored preview');
    /*
     * The removal count is REPORTED rather than swallowed — the surface has to be able to say so before he taps
     * Allow.
     *
     * TWO, and the first version of this assertion said three. The override is in the tool NAME and the two
     * zero-width spaces are in the PREVIEW, and the count is per field because the two are sanitised
     * separately — a name is constrained to an identifier alphabet, a preview is cleaned prose. The check
     * caught my own miscounting, which is the cheapest possible thing for it to have caught.
     */
    assert(/\[2 hidden\]$/.test(String(row.preview)),
        `the stored preview does not record what was removed: ${JSON.stringify(row.preview)}`);
    assert(row.expires_at != null, 'no expiry was set, so this would never lapse');
});

await check('a re-posted tool call finds the same row and does not notify twice', async () => {
    const again = await agent('/api/agent/permission', {
        method: 'POST',
        body: {
            project: 'proof-approval', tool_use_id: 'toolu_proof_1',
            tool_name: 'Bash', preview: 'something completely different',
        },
    });
    eq(again.json.created, false, 'a re-post must not create a second row');
    eq(again.json.notify_reason, 'already-filed', 'the reason a re-post did not notify');
    const db = await dbDirect();
    const rows = await db`select * from approvals where project = 'proof-approval'`;
    eq(rows.length, 1, 'rows after a re-post');
    /* The FIRST preview survives. A re-post is a dropped connection retrying, not an edit, and letting the
     * second one overwrite the text would let a payload be swapped after he had been shown the first. */
    assert(String(rows[0].preview).startsWith('rm -rf build'),
        'a re-post overwrote the preview he was already shown');
});

await check('a lapsed tool call EXPIRES VISIBLY and refuses a late tap', async () => {
    const db = await dbDirect();
    const [row] = await db`select id from approvals where project = 'proof-approval'`;
    await db`update approvals set expires_at = now() - interval '1 second' where id = ${row.id}`;

    /* The GET applies the expiry, which is the lazy-on-read path — and the polling hook is the read that
     * happens most, so "whoever reads next" is guaranteed to be the party that needs it. */
    const polled = await agent(`/api/agent/permission?id=${row.id}`);
    eq(polled.json.status, 'expired', 'status after the deadline');
    eq(polled.json.seconds_left, 0, 'seconds left');

    /* The row is still there rather than deleted, so the band can say it lapsed. "An approval that silently
     * lapsed is worse than one that was never asked." */
    const [after] = await db`select status from approvals where id = ${row.id}`;
    eq(after.status, 'expired', 'the stored status');

    /* And a tap that arrives now is REFUSED. By this point the agent has handed back to its terminal, so an
     * accepted decision would be a button that lies about having done something. */
    const late = await ui({ action: 'approval.decide', id: row.id, decision: 'allow' });
    assert(late.status >= 400, `a tap after expiry returned ${late.status}; it must be refused`);
    const [stillExpired] = await db`select status from approvals where id = ${row.id}`;
    eq(stillExpired.status, 'expired', 'the status after a late tap');
});

await check('allowing a held call is stored, and a second tap is refused', async () => {
    const db = await dbDirect();
    await db`delete from approvals where project = 'proof-approval'`;
    const filed = await agent('/api/agent/permission', {
        method: 'POST',
        body: { project: 'proof-approval', tool_use_id: 'toolu_proof_2', tool_name: 'Write', preview: 'a.ts' },
    });
    const id = filed.json.id;

    const allowed = await ui({ action: 'approval.decide', id, decision: 'allow' });
    eq(allowed.status, 200, 'status');
    eq(allowed.json.saved, true, 'saved');
    const [row] = await db`select status, decided_by from approvals where id = ${id}`;
    eq(row.status, 'allowed', 'the stored status');
    eq(row.decided_by, 'web', 'where the decision came from');

    const twice = await ui({ action: 'approval.decide', id, decision: 'deny' });
    assert(twice.status >= 400, `a second tap returned ${twice.status}; it must be refused`);
    const [unchanged] = await db`select status from approvals where id = ${id}`;
    eq(unchanged.status, 'allowed', 'the first answer must stand');
});

await check('A HELD TOOL CALL NEVER ENTERS THE COUNTS — the brief\'s central non-negotiable', async () => {
    /*
     * ==================================================================================================
     * THE MOST IMPORTANT CHECK IN THIS WHOLE FEATURE, and it nearly did not get written.
     * ==================================================================================================
     *
     * `docs/BRIEF-NOTHING-BLOCKED.md` §2: *"Nothing in this brief may inflate the queue, the counts, or the
     * board chips."* Everything else about the relay is enforced structurally — its own table, no `events` row
     * — but "the counts do not move" is a claim about arithmetic, and the only honest way to check it is to
     * count twice with a held call in between.
     *
     * It also covers what a structural argument cannot: somebody adding `approvals` to one of `board()`'s nine
     * queries in six months' time. That change would look perfectly reasonable in a diff and this is the only
     * thing that would notice.
     */
    const db = await dbDirect();
    await db`delete from approvals where project = 'proof-approval'`;

    const before = await agent('/api/agent/sync?since=0');
    const beforeCounts = before.json.counts;

    await agent('/api/agent/permission', {
        method: 'POST',
        body: { project: 'proof-approval', tool_use_id: 'toolu_proof_3', tool_name: 'Bash', preview: 'ls' },
    });

    const after = await agent('/api/agent/sync?since=0');
    eq(JSON.stringify(after.json.counts), JSON.stringify(beforeCounts),
        'the sync counts moved because a tool call was held');
    eq(after.json.open_tasks.length, before.json.open_tasks.length, 'open task count');
    eq(after.json.open_questions.length, before.json.open_questions.length, 'open question count');

    /* And it produced no event, so it can never reach an agent's `changed` — a held call has a ten-minute life
     * and the log is forever. */
    const [ev] = await db`
        select count(*)::int n from events where project = 'proof-approval'
    `;
    eq(ev.n, 0, 'events written for a held tool call');
});

await check('spend stores TOKENS, replaces rather than accumulates, and reports what it could not place',
    async () => {
        const db = await dbDirect();
        await db`delete from spend where source = 'proof-machine'`;

        const first = await agent('/api/agent/spend', {
            method: 'POST',
            body: {
                source: 'proof-machine',
                rows: [
                    /* Two paths under one known project, which must merge into one row — the attribution is
                     * the hub's job because a cwd is not a project. */
                    { path: ['proof-presence', 'antigravity'], model: 'claude-opus-5', input_tokens: 100, output_tokens: 200, samples: 2 },
                    { path: ['website', 'proof-presence'], model: 'claude-opus-5', input_tokens: 50, output_tokens: 25, samples: 1 },
                    /* And one that matches nothing, which must be reported rather than dropped or guessed. */
                    { path: ['some-random-folder'], model: 'claude-opus-5', input_tokens: 9, output_tokens: 9, samples: 1 },
                ],
            },
        });
        eq(first.status, 200, 'status');
        assert(first.json.unattributed_models >= 1,
            'a folder matching no project was silently attributed somewhere');

        const rows = await db`select * from spend where source = 'proof-machine' order by project`;
        /* proof-presence exists as a project because the presence checks above created rows against it... but
         * `projects()` is derived from EVENTS, so it may not. Either way the arithmetic below holds: whichever
         * bucket the two proof-presence paths landed in, they landed in the SAME one and were summed. */
        const total = rows.reduce((n, r) => n + Number(r.input_tokens), 0);
        eq(total, 159, 'total input tokens stored');

        /* Posting again REPLACES this source's snapshot. The summariser reads the whole machine every run, so
         * accumulating would double the figure on the second run — and it is exactly the sort of command
         * somebody runs twice to see whether it worked. */
        await agent('/api/agent/spend', {
            method: 'POST',
            body: {
                source: 'proof-machine',
                rows: [{ path: ['proof-presence'], model: 'claude-opus-5', input_tokens: 7, samples: 1 }],
            },
        });
        const after = await db`select * from spend where source = 'proof-machine'`;
        eq(after.length, 1, 'rows after a second post — it must replace, not add');
        eq(Number(after[0].input_tokens), 7, 'input tokens after a second post');
    });

await check('the hub is left with no trace of this run', async () => {
    await resetProofData();
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const [row] = await db`
        select
            (select count(*)::int from tasks     where project like 'proof-%') t,
            (select count(*)::int from questions where project like 'proof-%') q,
            (select count(*)::int from notes     where body like '%proof note%') n,
            (select count(*)::int from events    where project like 'proof-%') e,
            (select count(*)::int from agents    where name like 'prove-%')     a,
            /* The three new tables, for the reason the row above them exists: this suite runs against a
             * database somebody looks at, and a leftover presence row makes /agents claim an agent is working.
             * The guard at the top of this file went red at 151 events once because nothing cleaned up after
             * the thing it was warning about. */
            (select count(*)::int from presence  where project like 'proof-%') p,
            (select count(*)::int from approvals where project like 'proof-%') ap,
            (select count(*)::int from reports   where project like 'proof-%') r,
            (select count(*)::int from spend     where source = 'proof-machine') s
    `;
    eq([row.t, row.q, row.n, row.e, row.a, row.p, row.ap, row.r, row.s],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        'leftover proof rows [tasks, questions, notes, events, agents, presence, approvals, reports, '
        + 'spend]');
});

/* ------------------------------------------------------------------------------------ verdict */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}\n      ${f.message}`);
    process.exit(1);
}
console.log('\nEverything above was read back out of the database, not inferred from a status code.');
