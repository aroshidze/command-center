/**
 * Two years of his own measured rate, in the dev database, so the payload can be looked at rather than
 * estimated.
 *
 *   node tests/at-scale.mjs --load     # 2,190 finished tasks + 1,460 answered decisions over 730 days
 *   node tests/at-scale.mjs --measure  # server render, uncompressed HTML, historical rows in the payload
 *   node tests/at-scale.mjs --clean    # remove every y2-* row and verify none is left
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS COMMITTED
 *
 * `docs/ITERATION-LOG.md` §XIX measured this shape once — 1.65 MB of HTML, a 2,010 ms server render, 3,687
 * historical rows shipped to draw 21 — and the brief that inherited it said *"the reproduction script is in
 * the log"*. It was not. The numbers were, and the method was described in a paragraph, which meant the next
 * session had to re-derive the dataset before it could check whether it had fixed anything. A measurement you
 * cannot repeat is an anecdote; this is the repeat.
 *
 * IT WRITES ROUND THE API, DELIBERATELY, AND THAT IS THE OPPOSITE OF WHAT tests/fixture.mjs DOES
 *
 * The fixture writes through the real agent endpoints so validation and `writeVerified` apply to it — and it
 * is right to, because it is the data every other suite measures. This is not that. Three and a half thousand
 * rows through HTTP is twenty minutes and it would prove nothing that the fixture does not already prove; what
 * is being measured here is the PAYLOAD, which is a function of row count and column width and nothing else.
 * So it bulk-inserts, and the rows it writes are shaped like the ones the API produces rather than validated
 * by it.
 *
 * The safety rails are the fixture's, unchanged: localhost or a dev connection string only, `y2-` slugs only,
 * and `--clean` verifies the absence rather than assuming the DELETE worked.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* may be in the environment */ }

const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');
const LOAD = process.argv.includes('--load');
const CLEAN = process.argv.includes('--clean');
const MEASURE = process.argv.includes('--measure');

if (!LOAD && !CLEAN && !MEASURE) {
    console.error('\nOne of --load, --measure or --clean is required.\n');
    process.exit(1);
}

/* --------------------------------------------------------------------------------- the safety rails */

/*
 * The same refusal `tests/fixture.mjs` makes, for the same reason, and then one more on top.
 *
 * The URL check protects the MEASUREMENT (a request to production would be read-only but meaningless here).
 * The connection-string check protects the DATABASE, and it is the one that matters: this file writes 3,650
 * rows, and there is no delete endpoint. docs/ENVIRONMENT.md says to identify the branch by its CONTENT
 * rather than by a memorised hostname, so that is what this does — a database holding real project slugs is
 * refused even if it is somehow reachable from localhost.
 */
const host = new URL(BASE).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error('\nThis writes thousands of rows. Localhost only.\n');
    process.exit(1);
}

const PREFIX = 'y2-';
/** Fifteen projects, which is the number he actually runs. */
const PROJECTS = Array.from({ length: 15 }, (_, i) => `${PREFIX}project-${String(i + 1).padStart(2, '0')}`);
/** The known-safe slugs a dev branch is allowed to already contain. */
const FIXTURE_SLUGS = ['cold-brew', 'harbour-lights', 'nine-panels', 'tuck-shop'];

let _db = null;
async function sqlDirect() {
    if (!_db) {
        const { neon } = await import('@neondatabase/serverless');
        _db = neon(process.env.DATABASE_URL);
    }
    return _db;
}

async function refuseIfNotDev() {
    const db = await sqlDirect();
    const rows = await db`select distinct project from tasks union select distinct project from questions`;
    const strangers = rows
        .map(r => String(r.project))
        .filter(p => !p.startsWith(PREFIX) && !p.startsWith('proof-') && !FIXTURE_SLUGS.includes(p));
    if (strangers.length) {
        console.error(
            `\nRefusing to touch this database. It contains project slugs this file does not recognise:\n` +
            `  ${strangers.join(', ')}\n\n` +
            `docs/ENVIRONMENT.md: identify the branch by its CONTENT. Real project names mean production.\n`);
        process.exit(1);
    }
}

/* ------------------------------------------------------------------------------------- the shapes
 *
 * Row CONTENT is as load-bearing as row count here, because what is being measured is bytes. A generated
 * title of "Task 1841" would make the payload look half the size it really is — a real title is 40-60
 * characters and a real `why` is a sentence. These are drawn from the fixture's own lengths.
 */

const TITLES = [
    'Enter the card details on the ads account',
    'Verify the business address with the postal code letter',
    'Open the merchant account and complete the KYC step',
    'Register the SMS sender ID with the carrier',
    'Sign the data processing addendum and return it',
    'Photograph the meter reading for the utilities account',
    'Approve the pending domain transfer in the registrar',
    'Confirm the bank micro-deposits so payouts can start',
    'Collect the physical hardware key from the safe',
    'Complete the identity check in the banking app',
];
const WHYS = [
    'Unblocks the whole import queue, which has been paused for three days waiting on a payment method.',
    'The provider will not release the sender ID without a signed declaration from the account owner.',
    'Without this the nightly job keeps failing at the same step and nobody sees the alert until morning.',
    'Payouts cannot be enabled until the deposits are confirmed, and the first invoice is due next week.',
    null,
];
const NOTES = [
    'Done — the button was called "Continue" rather than "Submit", worth updating the steps.',
    'Took about ten minutes. The confirmation email went to spam.',
    null, null, null,
];
const VERIFY = 'The dashboard shows the account as active, with no banner at the top of the page.';
const GOTCHAS = ['The confirmation email can take fifteen minutes and often lands in spam.'];

const Q_TITLES = [
    'Which storage bucket should the generated images go in?',
    'Do we keep the legacy import running while the new one is tested?',
    'Which of the two pricing tiers should the trial convert into?',
    'Should the nightly job retry on a 5xx, or fail loudly?',
    'Which region should the new database live in?',
];
const Q_CONTEXT =
    'Blocks the queue behind it. Either answer is defensible and the cost of the wrong one is one migration.';
const Q_OPTIONS = [
    { key: 'existing', label: 'Reuse the existing bucket', detail: 'No new infrastructure to look after.', recommended: true },
    { key: 'new', label: 'Create a separate bucket', detail: 'Cleaner lifecycle rules, one more thing to own.' },
    { key: 'wait', label: 'Hold until the storage review' },
];

const pick = (arr, i) => arr[i % arr.length];
const DAY = 86_400_000;

/* ------------------------------------------------------------------------------------------ load */

/**
 * His measured rate, spread over 730 days: 3 completions and 2 answered decisions a day.
 *
 * The same figures §XIX used, so the before-and-after are comparable. Deliberately NOT randomised — a
 * dataset you cannot regenerate identically is a dataset whose second measurement is not a comparison.
 */
const DAYS = 730;
const DONE_PER_DAY = 3;
const ANSWERED_PER_DAY = 2;

async function load() {
    const db = await sqlDirect();
    await refuseIfNotDev();

    const now = Date.now();
    const tasks = [];
    for (let d = 0; d < DAYS; d++) {
        for (let n = 0; n < DONE_PER_DAY; n++) {
            const i = d * DONE_PER_DAY + n;
            const doneAt = new Date(now - (DAYS - d) * DAY + n * 3 * 3600_000);
            const createdAt = new Date(doneAt.getTime() - 26 * 3600_000);
            tasks.push({
                id: `y2t${String(i).padStart(6, '0')}`,
                project: pick(PROJECTS, i * 7),
                key: `y2-key-${i}`,
                title: `${pick(TITLES, i)} (${i})`,
                why: pick(WHYS, i),
                minutes: 5 + (i % 12) * 5,
                steps: JSON.stringify(Array.from({ length: 1 + (i % 19) }, (_, s) => ({
                    do: `Step ${s + 1}: open the settings page and confirm the value`,
                    detail: 'It is under the second tab, not the first.',
                }))),
                verify: VERIFY,
                gotchas: JSON.stringify(GOTCHAS),
                note: pick(NOTES, i),
                created_at: createdAt.toISOString(),
                done_at: doneAt.toISOString(),
            });
        }
    }

    const questions = [];
    for (let d = 0; d < DAYS; d++) {
        for (let n = 0; n < ANSWERED_PER_DAY; n++) {
            const i = d * ANSWERED_PER_DAY + n;
            const askedAt = new Date(now - (DAYS - d) * DAY + n * 5 * 3600_000);
            const answeredAt = new Date(askedAt.getTime() + (20 + (i % 400)) * 60_000);
            questions.push({
                id: `y2q${String(i).padStart(6, '0')}`,
                project: pick(PROJECTS, i * 5),
                key: `y2-qkey-${i}`,
                title: `${pick(Q_TITLES, i)} (${i})`,
                context: Q_CONTEXT,
                options: JSON.stringify(Q_OPTIONS),
                allow: JSON.stringify(['choose', 'ignore']),
                default_option: 'existing',
                deadline: new Date(askedAt.getTime() + 12 * 3600_000).toISOString(),
                answer_option: i % 3 === 0 ? 'new' : 'existing',
                answer_note: i % 6 === 0 ? 'Fine, but keep the old one around until the end of the month.' : null,
                created_at: askedAt.toISOString(),
                answered_at: answeredAt.toISOString(),
            });
        }
    }

    console.log(`\nLoading ${tasks.length} finished tasks and ${questions.length} answered decisions ` +
        `across ${PROJECTS.length} projects, spread over ${DAYS} days.`);

    /*
     * `unnest` rather than 3,650 statements. Each round trip to Neon is ~40ms from here, so one statement per
     * row is two and a half minutes of latency for a job that is 4 seconds of database work. Batched at 250
     * so no single statement carries more parameters than the driver is comfortable with.
     */
    for (let at = 0; at < tasks.length; at += 250) {
        const b = tasks.slice(at, at + 250);
        await db`
            insert into tasks (id, project, key, title, why, minutes, steps, verify, gotchas,
                               status, note, created_at, updated_at, done_at)
            select * from unnest(
                ${b.map(t => t.id)}::text[], ${b.map(t => t.project)}::text[], ${b.map(t => t.key)}::text[],
                ${b.map(t => t.title)}::text[], ${b.map(t => t.why)}::text[],
                ${b.map(t => t.minutes)}::int[], ${b.map(t => t.steps)}::jsonb[],
                ${b.map(t => t.verify)}::text[], ${b.map(t => t.gotchas)}::jsonb[],
                ${b.map(() => 'done')}::text[], ${b.map(t => t.note)}::text[],
                ${b.map(t => t.created_at)}::timestamptz[], ${b.map(t => t.done_at)}::timestamptz[],
                ${b.map(t => t.done_at)}::timestamptz[])
            on conflict (id) do nothing
        `;
        process.stdout.write(`\r  tasks: ${Math.min(at + 250, tasks.length)}/${tasks.length}`);
    }
    process.stdout.write('\n');

    for (let at = 0; at < questions.length; at += 250) {
        const b = questions.slice(at, at + 250);
        await db`
            insert into questions (id, project, key, title, context, options, allow, default_option,
                                   deadline, status, answer_type, answer_option, answer_note,
                                   answered_at, asked_by, created_at, updated_at)
            select * from unnest(
                ${b.map(q => q.id)}::text[], ${b.map(q => q.project)}::text[], ${b.map(q => q.key)}::text[],
                ${b.map(q => q.title)}::text[], ${b.map(q => q.context)}::text[],
                ${b.map(q => q.options)}::jsonb[], ${b.map(q => q.allow)}::jsonb[],
                ${b.map(q => q.default_option)}::text[], ${b.map(q => q.deadline)}::timestamptz[],
                ${b.map(() => 'answered')}::text[], ${b.map(() => 'choose')}::text[],
                ${b.map(q => q.answer_option)}::text[], ${b.map(q => q.answer_note)}::text[],
                ${b.map(q => q.answered_at)}::timestamptz[], ${b.map(() => 'at-scale')}::text[],
                ${b.map(q => q.created_at)}::timestamptz[], ${b.map(q => q.answered_at)}::timestamptz[])
            on conflict (id) do nothing
        `;
        process.stdout.write(`\r  decisions: ${Math.min(at + 250, questions.length)}/${questions.length}`);
    }
    process.stdout.write('\n');

    const [c] = await db`
        select (select count(*)::int from tasks     where project like ${PREFIX + '%'}) as tasks,
               (select count(*)::int from questions where project like ${PREFIX + '%'}) as questions
    `;
    console.log(`\nLoaded. ${c.tasks} tasks and ${c.questions} decisions are in the dev branch under ` +
        `"${PREFIX}" slugs.\nRun \`node tests/at-scale.mjs --clean\` when you are done — leaving them ` +
        `behind is how the next\nperson inherits a mystery.\n`);
}

/* ---------------------------------------------------------------------------------------- measure */

/**
 * What one load of the hub actually costs, at this volume.
 *
 * Server time is `responseStart - requestStart` measured with a plain fetch rather than through Chrome,
 * because the figure being compared is the SERVER's and a browser adds its own scheduling to it. The route
 * is warmed twice first: `next dev` compiles on demand and the first hit after an edit is a compile, which
 * is the false failure AGENTS.md warns about.
 */
async function measure() {
    const token = process.env.CC_WEB_TOKEN;
    if (!token) { console.error('CC_WEB_TOKEN is required.'); process.exit(1); }
    const headers = { cookie: `cc_session=${token}` };

    process.stdout.write('  warming the route');
    for (let i = 0; i < 2; i++) { await fetch(`${BASE}/`, { headers }); process.stdout.write('.'); }
    process.stdout.write('\n');

    const times = [];
    let html = '';
    for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        const res = await fetch(`${BASE}/`, { headers });
        const body = await res.text();
        times.push(performance.now() - t0);
        html = body;
    }
    const ms = Math.round(Math.min(...times));
    const bytes = Buffer.byteLength(html, 'utf8');

    /*
     * Historical rows IN THE PAYLOAD, counted by the field names that can only come from one.
     *
     * `done_at` appears once per finished task in the flight payload and `answered_at` once per answered
     * decision, so counting the occurrences counts the rows without having to parse React's wire format.
     * `data-measure="done-task"` is the number actually DRAWN, and the gap between the two is the defect.
     */
    const count = (needle) => html.split(needle).length - 1;
    const { gzipSync } = await import('node:zlib');
    const gz = gzipSync(Buffer.from(html)).length;

    console.log(`
  server render        ${ms} ms          (L8 budget 1200)
  HTML uncompressed    ${(bytes / 1024).toFixed(1)} KB      (L8 budget 600)
  HTML gzipped         ${(gz / 1024).toFixed(1)} KB       — what transferSize would have reported
  done_at in payload   ${count('done_at')}
  answered_at          ${count('answered_at')}
  historical rows      ${count('done_at') + count('answered_at')}
  rows actually drawn  ${count('data-measure=\\"done-task\\"') + count('data-measure="done-task"')}
`);
}

/* ------------------------------------------------------------------------------------------ clean */

async function clean() {
    const db = await sqlDirect();
    await db`delete from tasks     where project like ${PREFIX + '%'}`;
    await db`delete from questions where project like ${PREFIX + '%'}`;
    await db`delete from events    where project like ${PREFIX + '%'}`;
    /* Presence and spend rows this load created, scoped the same way. Unlike `tests/fixture.mjs` this stays
     * scoped, because at-scale is the one state that gets loaded ALONGSIDE the fixture — wiping the tables
     * here would delete presence for the four fixture projects and make /agents lie for the rest of the run. */
    await db`delete from presence where project like ${PREFIX + '%'}`;
    await db`delete from spend    where project like ${PREFIX + '%'}`;
    const [left] = await db`
        select (select count(*)::int from tasks     where project like ${PREFIX + '%'}) as tasks,
               (select count(*)::int from questions where project like ${PREFIX + '%'}) as questions,
               (select count(*)::int from events    where project like ${PREFIX + '%'}) as events
    `;
    /* Verified rather than assumed, for the same reason `removeNote` re-reads: the absence a failed DELETE
     * claims looks identical to the absence it failed to create. */
    const total = left.tasks + left.questions + left.events;
    console.log(total === 0
        ? `\nClean. No ${PREFIX}* rows remain in tasks, questions or events.\n`
        : `\nSTILL THERE: ${left.tasks} tasks, ${left.questions} questions, ${left.events} events.\n`);
    if (total !== 0) process.exitCode = 1;
}

if (LOAD) await load();
if (MEASURE) await measure();
if (CLEAN) await clean();
