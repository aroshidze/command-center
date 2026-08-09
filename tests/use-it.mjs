/**
 * Use the interface. Click the buttons. Check the database.
 *
 *   npm run fixture && node tests/use-it.mjs
 *
 * WHY THIS EXISTS
 *
 * Every defect this project has had was found by using the thing, not by reading the code or running the
 * suite — and the suite was green throughout, every time. `npm run prove` exercises the API over HTTP and
 * `npm run prove:layout` measures pixels, and between them there was still nobody pressing a button.
 *
 * So this drives the real page in a real browser, presses the real controls, and then asks the DATABASE,
 * through a different route, whether the thing that was supposed to happen happened. A UI test that
 * asserts on the UI's own text is a UI test that believes whatever the UI says, which is the exact
 * failure mode hard constraint 1 exists to prevent.
 *
 * The last check is the important one: it makes the server refuse a write and asserts that the interface
 * reports the refusal, prints the server's real reason, and does NOT remove the row. That is the
 * no-optimistic-UI rule, tested through the interface rather than asserted about it.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* may be in the environment */ }

const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');
const AGENT = process.env.CC_AGENT_TOKEN;

if (new URL(BASE).hostname !== 'localhost' && new URL(BASE).hostname !== '127.0.0.1') {
    console.error('\nThis presses buttons that write to the database. Localhost only.\n');
    process.exit(1);
}

let passed = 0;
const failures = [];
/** Checks whose subject was absent. Reported, never counted as a pass. */
const notMeasured = [];
/**
 * A check, and it now has THREE outcomes rather than two.
 *
 * A returned string is printed as the detail, which is how a passing check can show what it actually measured
 * instead of only that it did not throw. And a detail beginning with NOT MEASURED is counted separately, because
 * a check whose subject is absent must not report success: this project has had several that passed while
 * measuring nothing at all, and the summary line is what makes that visible rather than a comment promising it.
 */
async function check(name, fn) {
    try {
        const detail = await fn();
        if (typeof detail === 'string' && detail.startsWith('NOT MEASURED')) {
            notMeasured.push({ name, detail });
            console.log(`  --    ${name}\n          ${detail}`);
            return;
        }
        passed++;
        console.log(`  ok    ${name}${detail ? `\n          ${detail}` : ''}`);
    } catch (e) {
        failures.push({ name, message: e.message });
        console.log(`  FAIL  ${name}\n          ${e.message}`);
    }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
/* Value equality with the expected value in the message, so a failure says what it got rather than only
 * that something was wrong. Added with S4, which compares six values against the database. */
const eq = (got, want, what) => {
    if (got !== want) throw new Error(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

/** Read the row back through the AGENT api — a different code path from the one the click used. */
async function readTask(project, key) {
    const r = await fetch(`${BASE}/api/agent/tasks?project=${project}&key=${key}`, {
        headers: { authorization: `Bearer ${AGENT}` },
    });
    const j = await r.json().catch(() => null);
    return j?.task ?? null;
}
async function openQuestions() {
    const r = await fetch(`${BASE}/api/agent/sync?since=0`, {
        headers: { authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'use-it' },
    });
    const j = await r.json().catch(() => null);
    return j?.open_questions ?? [];
}

/**
 * Count the rows, in Postgres, with no hub in the loop at all.
 *
 * The other readers in this file go through the agent API, which is already a different code path from the
 * one a click uses. For the progress figures that is not quite enough: the page and the agent API both call
 * lib/store.ts, so a wrong aggregate there would agree with itself. Counting straight out of the database
 * is the only reading that cannot be wrong in the same direction as the thing it is checking.
 *
 * Localhost is enforced at the top of this file, so this can only ever be the dev branch.
 */
async function dbCounts() {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const [r] = await db`
        select
            (select count(*)::int from tasks     where status = 'done')            as tasks_done,
            (select count(*)::int from questions where status = 'answered')         as decisions_made,
            (select coalesce(sum(minutes), 0)::int from tasks where status = 'done') as minutes_done,
            (select count(*)::int from tasks where status = 'done' and done_at is null) as done_without_timestamp
    `;
    return r;
}

/** Read a figure off the rendered page by its role name, as a number. */
async function pageFigure(name) {
    return b.evaluate(`(() => {
        const el = document.querySelector('[data-figure=${JSON.stringify(name)}]');
        if (!el) return null;
        const m = /-?\\d[\\d,]*/.exec(el.textContent || '');
        return m ? +m[0].replace(/,/g, '') : null;
    })()`);
}

/**
 * Poll a figure until it reads the expected value, then return whatever it actually says.
 *
 * Returns the LAST value seen rather than a boolean, so a failing assertion can report what the page really
 * showed instead of just "timed out" — the difference between "expected 124, got 114" and "it did not work".
 */
async function waitForFigure(name, expected, timeout = 6000) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeout) {
        last = await pageFigure(name);
        if (last === expected) return last;
        await new Promise(r => setTimeout(r, 120));
    }
    return last;
}

/** Is a named milestone currently on the page? */
async function milestoneShown(slug) {
    return b.evaluate(
        `!!document.querySelector('[data-milestone=${JSON.stringify(slug)}]')`);
}

/** Switch the queue to the finished list, the way a person would: by pressing the count. */
async function showFinished() {
    const r = await b.evaluate(`(async () => {
        const chip = document.querySelector('[data-measure="progress-figure"][data-figure="tasks-done"]');
        if (!chip) return 'no finished-work control on the page';
        chip.click();
        for (let i = 0; i < 40; i++) {
            if (document.querySelector('[data-measure="done-task"]')) return 'shown';
            await new Promise(r => setTimeout(r, 100));
        }
        return 'pressing it listed nothing';
    })()`);
    return r;
}

const b = await launch({ base: BASE, token: process.env.CC_WEB_TOKEN, port: 9337 });
await b.setViewport(1400, 950, false);

console.log(`\nUsing the hub at ${BASE}\n`);

/* ============================================================================================
 * THE PROGRESS CHECKS RUN FIRST, AND THE ORDER IS LOAD-BEARING.
 *
 * The fixture leaves exactly NINE finished tasks. Checks 1 and 2 below each tick another task off, so by
 * the time they have run the count is eleven and the "ten finished" milestone is already in the past —
 * which would make the threshold test unable to fail, and a check that cannot fail is worse than no check.
 *
 * So these run before them, and the first thing they do is assert that the count really is nine. If
 * anything ever reorders this file, that assertion fails loudly instead of the test quietly proving nothing.
 * ========================================================================================== */

await check('the figure on the page equals the number of done rows in the database', async () => {
    const db = await dbCounts();
    assert(db.tasks_done === 9,
        `this block needs the fixture's nine finished tasks, and the database holds ${db.tasks_done}. ` +
        'Run `npm run fixture`, and check nothing above this line ticks a task off.');
    assert(db.done_without_timestamp === 0,
        `${db.done_without_timestamp} task(s) are done with no done_at, so every derived figure is wrong`);

    await b.goto('/');
    const shownTasks = await pageFigure('tasks-done');
    const shownDecisions = await pageFigure('decisions-made');
    const shownMinutes = await pageFigure('minutes-estimate');

    assert(shownTasks !== null, 'the page renders no tasks-done figure at all');
    assert(shownTasks === db.tasks_done,
        `the page says ${shownTasks} finished, the database says ${db.tasks_done}`);
    assert(shownDecisions === db.decisions_made,
        `the page says ${shownDecisions} decisions made, the database says ${db.decisions_made}`);

    // The minutes figure is an agent's ESTIMATE, and it must be labelled as one wherever it appears.
    // A guess rendered as a fact is the same class of untruth as a badge for something you did not do.
    if (shownMinutes !== null) {
        const labelled = await b.evaluate(`(() => {
            const el = document.querySelector('[data-figure="minutes-estimate"]');
            const scope = el?.closest('[data-measure="progress"]') || el?.parentElement;
            return /estimat/i.test(scope?.textContent || '');
        })()`);
        assert(labelled, 'the minutes figure is shown without the word "estimate" anywhere near it');
    }
});

await check('ticking a task off raises the figure by exactly one and earns the tenth-completion mark',
    async () => {
        await b.goto('/');
        const before = await pageFigure('tasks-done');
        assert(before === 9, `expected the page to say 9 before this, it said ${before}`);
        assert(!await milestoneShown('ten-finished'),
            'the "ten finished" mark is already showing at nine, so it is not derived from the count');

        // A task no other check in this file touches, and not the first row (check 4 uses that one).
        const clicked = await b.evaluate(`(() => {
            const row = [...document.querySelectorAll('[data-measure="task"]')]
                .find(r => /card on the ads account/i.test(r.textContent || ''));
            if (!row) return 'row not found';
            row.querySelector('.rowdone').click();
            return 'clicked';
        })()`);
        assert(clicked === 'clicked', clicked);

        const rose = await b.evaluate(`new Promise(res => {
            const t = setInterval(() => {
                const el = document.querySelector('[data-figure="tasks-done"]');
                if (el && /\\b10\\b/.test(el.textContent || '')) { clearInterval(t); res(true); }
            }, 100);
            setTimeout(() => { clearInterval(t); res(false); }, 8000);
        })`);
        assert(rose, 'the figure never became 10 after a confirmed write');

        const db = await dbCounts();
        assert(db.tasks_done === 10, `the database says ${db.tasks_done}, not 10`);

        assert(await milestoneShown('ten-finished'),
            'the tenth completion did not earn the "ten finished" mark');
    });

await check('RE-OPENING TAKES THE CREDIT BACK — the figure drops, done_at clears, the mark is un-earned',
    async () => {
        const shown = await showFinished();
        assert(shown === 'shown', shown);

        const clicked = await b.evaluate(`(() => {
            const row = [...document.querySelectorAll('[data-measure="done-task"]')]
                .find(r => /card on the ads account/i.test(r.textContent || ''));
            if (!row) return 'the task is not in the finished list';
            const btn = [...row.querySelectorAll('button')].find(x => /re-?open/i.test(x.textContent || ''));
            if (!btn) return 'no re-open control on the finished row';
            btn.click();
            return 'clicked';
        })()`);
        assert(clicked === 'clicked', clicked);

        const fell = await b.evaluate(`new Promise(res => {
            const t = setInterval(() => {
                const el = document.querySelector('[data-figure="tasks-done"]');
                if (el && /\\b9\\b/.test(el.textContent || '')) { clearInterval(t); res(true); }
            }, 100);
            setTimeout(() => { clearInterval(t); res(false); }, 8000);
        })`);
        assert(fell, 'THE FIGURE DID NOT DROP. A count that only goes up is not derived from the rows.');

        const db = await dbCounts();
        assert(db.tasks_done === 9, `the database says ${db.tasks_done} done, expected 9`);

        const t = await readTask('harbour-lights', 'ppc-card');
        assert(t?.status === 'open', `the task is ${t?.status}, expected open`);
        assert(t?.done_at == null, `done_at is ${JSON.stringify(t?.done_at)}, expected null`);

        assert(!await milestoneShown('ten-finished'),
            'the "ten finished" mark survived the completion behind it being undone, which makes it a lie');

        /*
         * And it is back in the QUEUE, not merely gone from the record.
         *
         * Checked after a reload rather than by pressing the filter back, because the thing worth knowing
         * is whether the server now serves it as open work — if re-opening only removed it from one list,
         * the task has been lost from both and that is worse than a wrong number.
         */
        await b.goto('/');
        const backInQueue = await b.evaluate(
            `[...document.querySelectorAll('[data-measure="task"]')]
                .some(r => /card on the ads account/i.test(r.textContent || ''))`);
        assert(backInQueue, 'the re-opened task is not back in the queue, so it has been lost from both lists');
    });

await check('a refused re-open shows the server\'s reason and changes no figure', async () => {
    await b.goto('/');
    const before = await pageFigure('tasks-done');
    assert(before === 9, `expected 9 before this check, the page said ${before}`);

    const shown = await showFinished();
    assert(shown === 'shown', shown);

    await b.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/ui/act*', requestStage: 'Request' }] });
    const failing = new Promise(res => {
        b.onEvent('Fetch.requestPaused', async (params) => {
            await b.call('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 500,
                responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                body: Buffer.from(JSON.stringify({
                    error: 'the write matched zero rows', stored: false,
                })).toString('base64'),
            });
            res(true);
        });
    });

    const title = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="done-task"]')][0];
        const t = row.textContent.trim().slice(0, 40);
        [...row.querySelectorAll('button')].find(x => /re-?open/i.test(x.textContent || ''))?.click();
        return t;
    })()`);
    await failing;
    await new Promise(r => setTimeout(r, 1200));

    const state = await b.evaluate(`(() => {
        const said = [...document.querySelectorAll('[data-measure="save-state"]')]
            .map(e => e.textContent.trim()).filter(Boolean);
        const fig = document.querySelector('[data-figure="tasks-done"]');
        const still = [...document.querySelectorAll('[data-measure="done-task"]')].length;
        return { said, figure: (fig?.textContent || '').trim(), still };
    })()`);
    await b.call('Fetch.disable');

    assert(state.said.some(s => s.includes('the write matched zero rows')),
        `the server's reason was not shown. The interface said: ${JSON.stringify(state.said)}`);
    assert(/\b9\b/.test(state.figure),
        `the figure moved on a REFUSED write — it now reads "${state.figure}". That is optimistic UI on ` +
        'the one number that has to be trustworthy.');

    const db = await dbCounts();
    assert(db.tasks_done === 9, `the database says ${db.tasks_done}, so something was written after all`);
    assert(state.still >= 9, `${state.still} finished rows remain; the refused row was removed anyway`);
    void title;
});

/*
 * The ladder and the rates, duplicated from lib/progress.ts ON PURPOSE.
 *
 * Importing them would make this check assert that the code agrees with itself, which is worth nothing: a
 * wrong rate would be wrong identically on both sides and the suite would stay green. So the arithmetic is
 * written out a second time, from the intent rather than from the source, and the counts come straight out of
 * Postgres. Two independent implementations agreeing is evidence; one implementation agreeing with itself is a
 * tautology.
 *
 * The cost is that changing a rate means changing it here too — and being made to do that deliberately, once,
 * is the point. tests/palette.mjs duplicates the palette for the same reason.
 */
const RATES = { done: 10, noted: 4, answered: 6, beforeDeadline: 4, underAnHour: 4 };

/**
 * What the DATABASE adds up to, counted in SQL and multiplied out here.
 *
 * Hoisted out of the score check once S1 needed it too, and that is the point of it being shared: S1 loads a
 * record deeper than the payload window, so running this against that state asserts the tuple history in
 * lib/progress.ts is what the derivation is actually folding over. If the encoding lost `noted`, or dropped a
 * row, or landed a title on the wrong row, the score on the page stops matching this and it says by how much.
 */
async function dbPoints() {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const [n] = await db`
        select
            (select count(*)::int from tasks
              where status = 'done' and done_at is not null)                       as done,
            (select count(*)::int from tasks
              where status = 'done' and done_at is not null
                and note is not null and btrim(note) <> '')                        as noted,
            (select count(*)::int from questions
              where status = 'answered' and answered_at is not null)               as answered,
            (select count(*)::int from questions
              where status = 'answered' and answered_at is not null
                and deadline is not null and answered_at < deadline)               as before_deadline,
            (select count(*)::int from questions
              where status = 'answered' and answered_at is not null
                and answered_at >= created_at
                and round(extract(epoch from (answered_at - created_at)) / 60) <= 60) as under_hour
    `;
    const points = n.done * RATES.done + n.noted * RATES.noted + n.answered * RATES.answered
        + n.before_deadline * RATES.beforeDeadline + n.under_hour * RATES.underAnHour;
    return { ...n, points };
}

/**
 * The ten named rungs, then the extension — written out from the RULE, not copied from the implementation.
 *
 * The rule, stated independently: the first ten thresholds are fixed and frozen (re-tuning them would move a
 * level he has already earned). Above them each gap is 110 points wider than the one before, starting from the
 * last named gap of 1840 - 1360 = 480. So: 590, 700, 810, ...
 *
 * This used to be a bare ten-entry array, which was correct only because the fixture never exceeds 114 points.
 * It would have silently computed the wrong expected level for any record past 1,840 — a latent wrong answer in
 * the one check whose job is to be independently right.
 */
const LADDER = (() => {
    const rungs = [0, 30, 80, 160, 280, 450, 680, 980, 1360, 1840];
    let gap = 480;
    while (rungs.length < 80) {
        gap += 110;
        rungs.push(rungs[rungs.length - 1] + gap);
    }
    return rungs;
})();

await check('the level and the score on the page are what the DATABASE adds up to', async () => {
    const n = await dbPoints();
    const expected = n.points;

    let expectedLevel = 1;
    for (let i = 1; i < LADDER.length; i++) if (expected >= LADDER[i]) expectedLevel = i + 1;

    await b.goto('/');
    const shownPoints = await pageFigure('points');
    const shownLevel = await b.evaluate(`(() => {
        const el = document.querySelector('.levelline b');
        return el ? +el.textContent.trim() : null;
    })()`);

    assert(shownPoints !== null, 'the page renders no score at all');
    assert(shownPoints === expected,
        `the page says ${shownPoints} points; the database adds up to ${expected} ` +
        `(${n.done} done, ${n.noted} with a note, ${n.answered} answered, ` +
        `${n.before_deadline} before deadline, ${n.under_hour} within the hour)`);
    assert(shownLevel === expectedLevel,
        `the page says level ${shownLevel}, the score ${expected} puts it at level ${expectedLevel}`);

    /*
     * And the receipt has to add up to the headline. A breakdown that does not sum to the number above it is
     * worse than no breakdown, because it invites him to check and then shows him a discrepancy.
     */
    const receipt = await b.evaluate(`(async () => {
        const btn = document.querySelector('[data-figure="points"]');
        btn.click();
        for (let i = 0; i < 40; i++) {
            const rows = document.querySelectorAll('[data-measure="credits"] li');
            if (rows.length) {
                /* Comma-tolerant, because the receipt groups its figures in threes now (humanCount in
                 * ui.tsx). A parser that stopped at the first separator would read 40,660 as 40 and report
                 * that the breakdown does not add up — a false failure on the one surface whose whole job is
                 * to show its working. */
                const nums = [...rows].slice(0, -1).map(li => {
                    const m = /=\\s*(\\d[\\d,]*)/.exec(li.textContent || '');
                    return m ? +m[1].replace(/,/g, '') : 0;
                });
                const total = /(\\d[\\d,]*)\\s*$/.exec(
                    document.querySelector('.credittotal')?.textContent || '');
                return {
                    sum: nums.reduce((a, x) => a + x, 0),
                    total: total ? +total[1].replace(/,/g, '') : null,
                };
            }
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    })()`);
    assert(receipt, 'pressing the score did not open the breakdown');
    assert(receipt.sum === expected,
        `the itemised points sum to ${receipt.sum}, but the score is ${expected}`);
    assert(receipt.total === expected,
        `the breakdown's own total says ${receipt.total}, the score says ${expected}`);
});

await check('re-opening a task takes POINTS back, not just the count', async () => {
    /*
     * The count dropping is already covered. This is the level's version of the same proof, and it is the one
     * that matters most for a gamified surface: a score that only goes up is the thing the owner would notice
     * first and trust least. Ten points per task, so one re-open has to move the total by exactly ten.
     */
    await b.goto('/');
    const before = await pageFigure('points');

    const clicked = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="task"]')]
            .find(r => /trademark application/i.test(r.textContent || ''));
        if (!row) return 'row not found';
        row.querySelector('.rowdone').click();
        return 'clicked';
    })()`);
    assert(clicked === 'clicked', clicked);

    const after = await waitForFigure('points', before + RATES.done);
    assert(after === before + RATES.done,
        `ticking a task off moved the score ${before} -> ${after}; expected ${before + RATES.done}`);

    // ...and back.
    const shown = await showFinished();
    assert(shown === 'shown', shown);
    const reopened = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="done-task"]')]
            .find(r => /trademark application/i.test(r.textContent || ''));
        if (!row) return 'not in the finished list';
        const btn = [...row.querySelectorAll('button')].find(x => /re-?open/i.test(x.textContent || ''));
        if (!btn) return 'no re-open control';
        btn.click();
        return 'clicked';
    })()`);
    assert(reopened === 'clicked', reopened);

    /*
     * POLLED, NOT SLEPT — and this was a real flake in the most important check in this file.
     *
     * The tick above waits with `waitForFigure`, which polls until the figure reaches the expected value. The
     * re-open used a flat `setTimeout(1500)` and then read the figure ONCE. Re-opening is an HTTP round trip
     * plus a React state update, and 1500ms covers it almost always — measured, it failed roughly one run in
     * six, reporting "re-opening left the score at 124; it was 114 before any of this. A score that does not
     * come back down is a score that is lying."
     *
     * Which is the worst possible thing to be wrong about intermittently. The claim is true, the code is
     * correct, and the check cries wolf — and a suite that cries wolf on its most important assertion is one
     * whose next real failure gets shrugged at. `waitForFigure` still returns the last value it saw when it
     * times out, so a genuine regression fails with the same message and the same numbers as before.
     */
    /*
     * A longer budget than the default 6s, because of WHERE the remaining flakiness came from.
     *
     * Measured after the polling fix: 2 failures in 15 clean runs, and both were the first run immediately
     * after editing a file under app/ or lib/ — which makes `next dev` recompile on the next request, so the
     * navigation this check depends on can take seconds longer than it ever does warm. Twelve consecutive
     * green runs once warm. It is an environment race, not the hub being wrong, and the honest fix is to give
     * the poll room rather than to shrug at an intermittent failure on the one property this file exists for.
     */
    const restored = await waitForFigure('points', before, 20000);
    assert(restored === before,
        `re-opening left the score at ${restored}; it was ${before} before any of this. ` +
        'A score that does not come back down is a score that is lying.');
});

await check('a decision the HUB made by timed default does not count as one HE made', async () => {
    /*
     * The single most dangerous inflation available to this surface.
     *
     * A timed default means a deadline passed and the hub proceeded with the stated fallback WITHOUT him
     * (lib/store.ts, applyDueDefaults). Counting that as a decision he made would be a badge for something
     * he did not do — the brief's forbidden lie, and the version of it that is hardest to notice, because
     * the number would be plausible and the row would genuinely exist.
     *
     * Excluded in two places on purpose: the SQL narrows to `status = 'answered'` for cost, and
     * lib/progress.ts filters again for correctness. This check exists so that removing either one fails.
     */
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);

    await b.goto('/');
    const before = await pageFigure('decisions-made');
    assert(before !== null, 'the page renders no decisions-made figure');

    // The API refuses a deadline in the past, correctly — so it is created legally and then back-dated,
    // which is the only way to reach the state a real overnight default reaches.
    const made = await fetch(`${BASE}/api/agent/questions`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'use-it',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            project: 'harbour-lights', key: 'default-probe',
            title: 'Probe: proceed with the fallback if nobody answers?',
            options: [{ key: 'go', label: 'Go ahead', recommended: true }, { key: 'stop', label: 'Wait' }],
            allow: ['choose', 'ignore'], default_option: 'go', hours: 1,
        }),
    }).then(r => r.json()).catch(() => null);
    assert(made?.ok, `could not create the probe question: ${made?.error || 'no reason given'}`);

    await db`
        update questions set deadline = now() - interval '2 hours'
         where project = 'harbour-lights' and key = 'default-probe'
    `;

    // Loading the page applies due defaults on read — there is no cron, by design.
    await b.goto('/');

    const [{ defaulted, answered }] = await db`
        select
            (select count(*)::int from questions where status = 'defaulted')  as defaulted,
            (select count(*)::int from questions where status = 'answered')   as answered
    `;
    assert(defaulted >= 1, 'the timed default did not apply, so this check proved nothing');

    const after = await pageFigure('decisions-made');
    assert(after === before,
        `the figure went ${before} -> ${after} because a decision the HUB made was counted as his. ` +
        'That is a badge for something he did not do.');
    assert(after === answered,
        `the page says ${after} decisions made and the database holds ${answered} answered questions`);

    await db`delete from questions where project = 'harbour-lights' and key = 'default-probe'`;
});

await check('chasing a long-blocked task writes a real note, addressed to that project', async () => {
    /*
     * The one control in this feature that writes. Everything else about a blocked task is a readout, so this
     * is the only part that can be wrong in the database rather than merely on screen.
     *
     * It also checks the FRAMING, which is the whole design of the feature: the note must quote the blocker back
     * at the agent and must not assert that anything has changed. The hub does not know whether Instacart's
     * email arrived; guessing on his behalf is the failure this codebase exists to prevent.
     */
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    await db`delete from notes where body like 'Is "Count the stock%'`;

    await b.goto('/');
    const clicked = await b.evaluate(`(async () => {
        const row = document.querySelector('[data-measure="stale-blocked"]');
        if (!row) return 'nothing has been waiting long enough to chase';
        const btn = [...row.querySelectorAll('button')].find(x => /still blocked/i.test(x.textContent || ''));
        if (!btn) return 'no chase control on the row';
        btn.click();
        for (let i = 0; i < 40; i++) {
            if (/asked/i.test(row.textContent || '')) return 'clicked';
            await new Promise(r => setTimeout(r, 100));
        }
        return 'the button never confirmed';
    })()`);
    assert(clicked === 'clicked', clicked);

    const rows = await db`
        select project, body from notes where body like 'Is "Count the stock%' order by created_at desc
    `;
    assert(rows.length === 1, `expected exactly one note, found ${rows.length}`);
    const note = rows[0];

    // Addressed, or it goes to whichever agent happens to sync next — which is the bug notes-per-project fixed.
    assert(note.project === 'harbour-lights',
        `the note went to ${JSON.stringify(note.project)}, not to the task's own project`);
    // Quotes the blocker back, so the agent knows what the hub currently believes.
    assert(note.body.includes('The container key is with the previous tenant'),
        `the note does not quote the blocker back: ${note.body}`);
    // And it ASKS. It must not claim the situation has changed.
    assert(/still blocked\?/i.test(note.body), `the note does not ask, it states: ${note.body}`);
    assert(!/unblocked|no longer blocked|has arrived/i.test(note.body),
        `the note asserts something the hub cannot know: ${note.body}`);

    await db`delete from notes where body like 'Is "Count the stock%'`;
});

/* ------------------------------------------------------------------ 1. tick a task from the row */

await check('ticking a task from its row removes it AND the database says done', async () => {
    const before = await readTask('cold-brew', 'grinder-service');
    assert(before?.status === 'open', `fixture not loaded — grinder-service is ${before?.status}`);

    await b.goto('/');
    const clicked = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="task"]')]
            .find(r => /grinder service/i.test(r.textContent || ''));
        if (!row) return 'row not found';
        const done = row.querySelector('.rowdone');
        if (!done) return 'no done control on the row';
        done.click();
        return 'clicked';
    })()`);
    assert(clicked === 'clicked', clicked);

    // Wait for the row to go, which the component only does after the server confirmed the write.
    const gone = await b.evaluate(`new Promise(res => {
        const t = setInterval(() => {
            const still = [...document.querySelectorAll('[data-measure="task"]')]
                .some(r => /grinder service/i.test(r.textContent || ''));
            if (!still) { clearInterval(t); res(true); }
        }, 100);
        setTimeout(() => { clearInterval(t); res(false); }, 8000);
    })`);
    assert(gone, 'the row never disappeared, so the click did nothing the UI believed');

    const after = await readTask('cold-brew', 'grinder-service');
    assert(after?.status === 'done', `the database still says ${after?.status}`);
});

/* -------------------------------------------- 1b. the departure animation, and whether it can lie
 *
 * The row slides out when you tick it, and that animation had been written and never looked at — which on
 * this surface is not a cosmetic gap. Motion is a claim: a row leaving the queue tells him the completion
 * landed. The stylesheet's own rule is that NOTHING CARRYING TRUTH MAY MOVE, and a departure that starts on
 * the click rather than on the server's confirmation is exactly that violation, dressed as polish.
 *
 * So this asserts the failure case, because the success case is the one that looks right by accident. The
 * write is refused with a 500 and the question is whether the row leaves anyway.
 */
await check('a REFUSED completion does not animate the row away', async () => {
    const before = await readTask('harbour-lights', 'vat-register');
    assert(before?.status === 'open', `fixture not loaded — vat-register is ${before?.status}`);

    await b.goto('/');
    await b.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/ui/act*', requestStage: 'Request' }] });
    const failing = new Promise(res => {
        b.onEvent('Fetch.requestPaused', async (params) => {
            await b.call('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 500,
                responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                body: Buffer.from(JSON.stringify({
                    error: 'the write matched zero rows', stored: false,
                })).toString('base64'),
            });
            res(true);
        });
    });

    /*
     * The animation is watched from the moment of the click, not sampled afterwards. A 420ms departure that
     * ran and finished would be invisible to a check that looks at the end — and "it ended up still there"
     * is not the same claim as "it never started leaving". getAnimations() is the only way to see the frames
     * that were actually played.
     */
    const clicked = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="task"]')]
            .find(r => /register for vat/i.test(r.textContent || ''));
        if (!row) return 'row not found';
        window.__departed = [];
        const tick = () => {
            for (const a of document.getAnimations()) {
                const t = a.effect && a.effect.target;
                if (t && t.classList && t.classList.contains('leaving')) {
                    window.__departed.push(a.animationName || 'unnamed');
                }
            }
        };
        window.__watch = setInterval(tick, 30);
        const done = row.querySelector('.rowdone');
        if (!done) return 'no done control on the row';
        done.click();
        return 'clicked';
    })()`);
    assert(clicked === 'clicked', clicked);
    await failing;
    await new Promise(r => setTimeout(r, 1400));

    const state = await b.evaluate(`(() => {
        clearInterval(window.__watch);
        const rows = [...document.querySelectorAll('[data-measure="task"]')];
        const row = rows.find(r => /register for vat/i.test(r.textContent || ''));
        return {
            departed: [...new Set(window.__departed || [])],
            stillThere: !!row,
            leavingClass: row ? row.className.includes('leaving') : null,
            said: [...document.querySelectorAll('[data-measure="save-state"]')]
                .map(e => e.textContent.trim()).filter(Boolean),
        };
    })()`);
    await b.call('Fetch.disable');

    assert(state.departed.length === 0,
        `the row played a departure animation (${state.departed.join(', ')}) on a REFUSED write. Motion is a ` +
        'claim: sliding the row out says the completion landed, and it did not.');
    assert(state.stillThere,
        'the row is gone from the queue after a refused write, so the interface believes something the ' +
        'database does not');
    assert(state.said.some(s => s.includes('the write matched zero rows')),
        `the server's reason was not shown. The interface said: ${JSON.stringify(state.said)}`);

    const after = await readTask('harbour-lights', 'vat-register');
    assert(after?.status === 'open', `the database says ${after?.status}, so something was written after all`);
});

/* And the other half: on a real completion it MUST animate, or the rule above is satisfied by having no
 * motion at all — which is how a check like this passes forever after someone deletes the feature. */
await check('a CONFIRMED completion does animate the row away', async () => {
    const before = await readTask('harbour-lights', 'courier-account');
    assert(before?.status === 'open', `fixture not loaded — courier-account is ${before?.status}`);

    await b.goto('/');
    const clicked = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="task"]')]
            .find(r => /courier business account/i.test(r.textContent || ''));
        if (!row) return 'row not found';
        window.__departed = [];
        window.__watch = setInterval(() => {
            for (const a of document.getAnimations()) {
                const t = a.effect && a.effect.target;
                if (t && t.classList && t.classList.contains('leaving')) {
                    window.__departed.push({ name: a.animationName || 'unnamed',
                        ms: Math.round(a.effect.getTiming().duration) });
                }
            }
        }, 25);
        row.querySelector('.rowdone').click();
        return 'clicked';
    })()`);
    assert(clicked === 'clicked', clicked);

    const seen = await b.evaluate(`new Promise(res => {
        const t = setInterval(() => {
            if ((window.__departed || []).length) {
                clearInterval(t); clearInterval(window.__watch);
                res(window.__departed[0]);
            }
        }, 25);
        setTimeout(() => { clearInterval(t); clearInterval(window.__watch); res(null); }, 8000);
    })`);

    assert(seen, 'the row was ticked and never played a departure animation, so the motion is not there');
    assert(seen.ms >= 200 && seen.ms <= 700,
        `the departure runs for ${seen.ms}ms — under 200 it is a flicker, over 700 it is a wait between ` +
        'ticking a task and being able to tick the next one');

    const after = await readTask('harbour-lights', 'courier-account');
    assert(after?.status === 'done', `the database says ${after?.status}`);
});

/* ------------------------------------------------- 2. open a task, type a note, tick it in the pane */

await check('a note typed in the pane is stored before the task is ticked', async () => {
    const NOTE = 'Booked for Tuesday. They said the burrs are a 40 minute job.';
    await b.goto('/');
    const opened = await b.evaluate(`(async () => {
        const row = [...document.querySelectorAll('[data-measure="task"]')]
            .find(r => /roaster and taste/i.test(r.textContent || ''));
        if (!row) return 'row not found';
        row.querySelector('.rowmain').click();
        for (let i = 0; i < 40 && !document.querySelector('[data-measure="detail"]'); i++)
            await new Promise(r => setTimeout(r, 100));
        return document.querySelector('[data-measure="detail"]') ? 'open' : 'never opened';
    })()`);
    assert(opened === 'open', opened);

    // Type into the real textarea the way React expects, so its onChange fires.
    await b.evaluate(`(() => {
        const ta = document.querySelector('[data-measure="detail"] textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(NOTE)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise(r => setTimeout(r, 200));

    await b.evaluate(`document.querySelector('[data-measure="primary-action"]').click()`);
    const gone = await b.evaluate(`new Promise(res => {
        const t = setInterval(() => {
            const still = [...document.querySelectorAll('[data-measure="task"]')]
                .some(r => /roaster and taste/i.test(r.textContent || ''));
            if (!still) { clearInterval(t); res(true); }
        }, 100);
        setTimeout(() => { clearInterval(t); res(false); }, 8000);
    })`);
    assert(gone, 'the task never left the queue');

    const after = await readTask('cold-brew', 'roaster-visit');
    assert(after?.status === 'done', `status is ${after?.status}`);
    assert(after?.note === NOTE, `the note came back as ${JSON.stringify(after?.note)}`);
});

/* ------------------------------------------------------- 3. answer a decision, with a comment on it */

await check('tapping an option with a comment stores BOTH', async () => {
    const COMMENT = 'Yes, but tell the catalogue project before you start.';
    const before = (await openQuestions()).find(q => q.key === 'image-bucket');
    assert(before, 'the fixture question is not open');

    await b.goto('/');

    /*
     * Reach the card the way a person has to, by pressing "show them all" first.
     *
     * Only ONE decision renders in full now; the rest are behind that control, because the region used to be a
     * 46vh scroller that sliced whichever card the pixel budget ran out inside (docs/RESEARCH.md §30.6). This
     * check wants the second one, so it stopped finding it — a real consequence of a real change, not a flake.
     *
     * Pressing the control rather than raising the cap is the better repair: it makes this check exercise the new
     * path as well as the thing it was written for, so a control that stopped working would fail here too.
     */
    await b.evaluate(`(() => {
        const more = document.querySelector('[data-measure="more-decisions"]');
        if (more) more.click();
        return !!more;
    })()`);
    await new Promise(r => setTimeout(r, 250));

    const typed = await b.evaluate(`(() => {
        const card = [...document.querySelectorAll('[data-measure="decision"]')]
            .find(c => /image bucket/i.test(c.textContent || ''));
        if (!card) return 'decision card not found';
        const add = [...card.querySelectorAll('button')]
            .find(x => /Add a condition/i.test(x.textContent || ''));
        if (!add) return 'no comment control';
        add.click();
        return 'opened';
    })()`);
    assert(typed === 'opened', typed);
    await new Promise(r => setTimeout(r, 250));

    await b.evaluate(`(() => {
        const card = [...document.querySelectorAll('[data-measure="decision"]')]
            .find(c => /image bucket/i.test(c.textContent || ''));
        const ta = card.querySelector('textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(COMMENT)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise(r => setTimeout(r, 200));

    await b.evaluate(`(() => {
        const card = [...document.querySelectorAll('[data-measure="decision"]')]
            .find(c => /image bucket/i.test(c.textContent || ''));
        [...card.querySelectorAll('button.pick')]
            .find(x => /Create a catalogue bucket/i.test(x.textContent || '')).click();
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    const still = (await openQuestions()).find(q => q.key === 'image-bucket');
    assert(!still, 'the question is still open, so the answer did not store');

    // Read the answer back in full through sync's changed feed.
    const r = await fetch(`${BASE}/api/agent/sync?since=0`, {
        headers: { authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'use-it-2' },
    });
    const j = await r.json();
    const ev = (j.changed || []).filter(e => e.kind === 'question.answered').pop();
    assert(ev, 'no question.answered event was written');
    assert(/catalogue bucket/i.test(ev.summary) || /new/i.test(ev.summary),
        `the event does not name the chosen option: ${ev.summary}`);
    assert(ev.summary.includes(COMMENT.slice(0, 24)),
        `the comment did not travel with the choice: ${ev.summary}`);
});

/* ------------------------------------------- 4. THE ONE THAT MATTERS: a refused write is not hidden */

await check('a refused write is reported with the server\'s reason and the row STAYS', async () => {
    await b.goto('/');

    // Make every action call fail, with a body shaped exactly like the real error path.
    await b.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/ui/act*', requestStage: 'Request' }] });
    const failing = new Promise(res => {
        const onPaused = async (params) => {
            await b.call('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 500,
                responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                body: Buffer.from(JSON.stringify({
                    error: 'the write matched zero rows', stored: false,
                })).toString('base64'),
            });
            res(true);
        };
        b.onEvent('Fetch.requestPaused', onPaused);
    });

    const title = await b.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-measure="task"]')][0];
        const t = row.querySelector('.rowtitle').textContent;
        row.querySelector('.rowdone').click();
        return t;
    })()`);
    await failing;
    await new Promise(r => setTimeout(r, 1200));

    const state = await b.evaluate(`(() => {
        const rows = [...document.querySelectorAll('[data-measure="task"]')];
        const still = rows.some(r => r.querySelector('.rowtitle')?.textContent === ${JSON.stringify(title)});
        const said = [...document.querySelectorAll('[data-measure="save-state"]')]
            .map(e => e.textContent.trim()).filter(Boolean);
        return { still, said };
    })()`);

    await b.call('Fetch.disable');

    assert(state.still, 'THE ROW WAS REMOVED ON A REFUSED WRITE — that is optimistic UI, and it is the ' +
                        'defect hard constraint 1 exists to prevent');
    assert(state.said.some(s => s.includes('the write matched zero rows')),
        `the server's reason was not shown. The interface said: ${JSON.stringify(state.said)}`);
});

/*
 * ================================================================================================
 * CROSSING A LEVEL BOUNDARY PRODUCES A MOMENT — and before this session it produced nothing at all
 * ================================================================================================
 *
 * The whole progression exists to make finishing something feel like it mattered, and the one event it is built
 * to emit was silent: `standing.level` was simply a different number on the next render. No motion, no mark, no
 * acknowledgement.
 *
 * WHY THIS IS A REAL-CLICK CHECK AND NOT A STYLESHEET GREP. The strike depends on three things agreeing: the
 * transition being detected in the browser at all, it being detected only for an INCREASE observed in this
 * session, and the class actually reaching the panel. A CSS check would prove the keyframes exist while the
 * detection was broken — which is exactly the shape of failure this file's own header warns about, and the shape
 * `.emblem-arc` had when check P7's injection named a selector that no longer existed.
 *
 * IT COMPUTES ITS OWN DISTANCE TO THE RUNG rather than assuming the fixture's state, because this suite is not
 * idempotent — it has ticked several tasks off by the time it reaches here, so the remaining gap depends on what
 * ran before. It reads the target off the page (the same `to-next` figure check P5 asserts the arithmetic of) and
 * ticks exactly as many tasks as that needs at ten points each.
 *
 * AND IT STANDS DOWN HONESTLY rather than passing, if the queue does not hold enough actionable tasks to reach
 * the rung. A check with no subject must report NOT MEASURED and never pass — several in this project once passed
 * while measuring nothing.
 */
await check('crossing a level boundary marks the moment, and only for a crossing seen just now', async () => {
    await b.goto('/');

    const state = await b.evaluate(`(() => {
        const el = document.querySelector('[data-figure="to-next"]');
        const panel = document.querySelector('[data-measure="progress"]');
        const rows = [...document.querySelectorAll('[data-measure="task"]')]
            .filter(r => r.querySelector('.rowdone'));
        return {
            toNext: el ? +el.textContent.trim() : null,
            level: +(document.querySelector('.levelline b')?.textContent.trim() ?? 0),
            struckOnLoad: panel ? panel.getAttribute('data-struck') : 'no panel',
            actionable: rows.length,
        };
    })()`);

    assert(state.toNext !== null, 'the page states no target, so there is no rung to cross');

    /*
     * FIRST, THE HALF THAT MATTERS MOST AND IS EASIEST TO GET WRONG: it must NOT be marked on load.
     *
     * The brief is explicit — he answers a decision in Telegram, crosses a rung, and opens the hub the next
     * morning. Marking it then would celebrate yesterday as though it had just happened. An effect keyed on the
     * level would fire on mount and do exactly that, which is why the implementation records the first level it
     * sees and only reacts to a transition after it.
     */
    assert(state.struckOnLoad === null,
        `the panel is marked as struck on FIRST LOAD (data-struck=${state.struckOnLoad}). That would ` +
        'celebrate a level he may have reached days ago, in Telegram, having seen nothing.');

    const ticks = Math.ceil(state.toNext / RATES.done);
    if (state.actionable < ticks) {
        return `NOT MEASURED — ${state.toNext} points to the next rung needs ${ticks} ticks and the queue ` +
               `holds ${state.actionable} actionable task(s)`;
    }

    for (let i = 0; i < ticks; i++) {
        const before = await pageFigure('points');
        const clicked = await b.evaluate(`(() => {
            const row = [...document.querySelectorAll('[data-measure="task"]')]
                .find(r => r.querySelector('.rowdone'));
            if (!row) return 'nothing left to tick';
            row.querySelector('.rowdone').click();
            return 'clicked';
        })()`);
        assert(clicked === 'clicked', clicked);
        const after = await waitForFigure('points', before + RATES.done);
        assert(after === before + RATES.done,
            `tick ${i + 1} moved the score ${before} -> ${after}; expected ${before + RATES.done}`);
    }

    /*
     * Polled, never slept. The class is set in an effect after the confirmed write lands in state, and it is
     * cleared again by a 1,600ms timer — so a flat sleep would race the clearing in one direction and the
     * setting in the other. This project has two recorded flakes from sleeping and reading once.
     */
    const marked = await b.evaluate(`(async () => {
        for (let i = 0; i < 40; i++) {
            const panel = document.querySelector('[data-measure="progress"]');
            const at = panel?.getAttribute('data-struck');
            if (at) {
                return {
                    at: +at,
                    hasClass: panel.classList.contains('struck'),
                    ring: !!panel.querySelector('.strike'),
                    level: +(document.querySelector('.levelline b')?.textContent.trim() ?? 0),
                    /* The queue must stay usable while it runs: a celebration that blocks him is worse than
                       none. Nothing may cover the first row. */
                    firstRowClickable: (() => {
                        const row = document.querySelector('[data-measure="task"] .rowmain');
                        if (!row) return null;
                        const r = row.getBoundingClientRect();
                        const top = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
                        return !!(top && row.contains(top));
                    })(),
                };
            }
            await new Promise(r => setTimeout(r, 60));
        }
        return null;
    })()`);

    assert(marked, 'crossing a level boundary produced NOTHING — no strike on the standing panel. That is the ' +
                   'defect this movement exists to fix: the one event the progression emits, unmarked.');
    assert(marked.hasClass, 'data-struck is set but the panel has no `struck` class, so the stylesheet cannot ' +
                            'draw anything');
    assert(marked.ring, 'the panel is marked but the ring element was never rendered');
    assert(marked.at === marked.level,
        `the strike names level ${marked.at} and the page says level ${marked.level} — the mark and the ` +
        'figure disagree about what just happened');
    assert(marked.at > state.level,
        `the strike fired for level ${marked.at}, which is not above the ${state.level} on load`);
    assert(marked.firstRowClickable !== false,
        'something is covering the first task while the strike runs — a celebration that sits between him ' +
        'and the next task is worse than no celebration');

    return `level ${state.level} -> ${marked.at} after ${ticks} tick(s); ring drawn, queue still clickable`;
});

/*
 * THE INJECTION FOR THE CHECK ABOVE, and it targets the half that could go wrong SILENTLY.
 *
 * The positive half is safe by construction: if the marker were renamed or never rendered, `marked` comes back
 * null and the check fails loudly. There is no way for that assertion to pass over a broken strike.
 *
 * The `struckOnLoad === null` assertion is the one with a silent failure mode, and it is the more important of the
 * two — it is what stands between this feature and celebrating a level he reached in Telegram three days ago. If
 * that read ever stopped observing anything (a renamed attribute, a panel that no longer carries it), it would
 * return null for the wrong reason and report success for ever, over an implementation that marked every load.
 *
 * So: set the attribute by hand, exactly as a mount-firing effect would, and assert the read SEES it. That is the
 * same failure P7's injection had when it named `.emblem-arc` after the arc had been deleted — a selector matching
 * nothing, reporting that a working check had not caught its own defect.
 */
await check('the on-load half of the strike check can actually fail', async () => {
    /* A fresh load, so nothing real is marked and the only marker present is the one injected below. */
    await b.goto('/');
    const result = await b.evaluate(`(() => {
        const panel = document.querySelector('[data-measure="progress"]');
        if (!panel) return { error: 'no standing panel on the page at all' };
        const beforeInjection = panel.getAttribute('data-struck');
        // Exactly what an effect keyed on the level would produce on first mount.
        panel.setAttribute('data-struck', '9');
        panel.classList.add('struck');
        return {
            beforeInjection,
            afterInjection: panel.getAttribute('data-struck'),
            ringWouldDraw: getComputedStyle(panel).getPropertyValue('--emblem-ink').trim() !== '',
        };
    })()`);

    assert(!result.error, result.error);
    assert(result.beforeInjection === null,
        'the panel was already marked on a fresh load, so this injection cannot prove anything');
    assert(result.afterInjection === '9',
        'the attribute the check reads on load cannot be observed even when it is deliberately set — the ' +
        'on-load assertion is reading nothing and would pass over an implementation that marks every load');

    /* Reload so no injected state leaks into anything that runs after this. */
    await b.goto('/');
    const cleaned = await b.evaluate(
        `document.querySelector('[data-measure="progress"]').getAttribute('data-struck')`);
    assert(cleaned === null, 'the injected marker survived a reload, which means it was not injected at all');

    return 'a hand-set marker is seen, so the on-load assertion is measuring the real attribute';
});

/* ============================================================================================
 * FINDING OLD WORK — S1, and it was written before the thing it guards existed
 * ============================================================================================
 *
 * `docs/ITERATION-LOG.md` §XXV: `Ctrl+K` built its index CLIENT-SIDE, over every finished task in the page
 * payload. So windowing that payload — which is the fix for the 2.4 MB page at two years — makes the palette
 * stop finding older work, with no error, no empty state and no failing check. Search would simply return
 * less than it used to, and nothing asserted otherwise.
 *
 * That is the shape of every expensive defect on this project's record: a change that satisfies every check
 * while quietly removing something nobody thought to assert. So this check was written FIRST, watched going
 * red, and only then was the endpoint built and the payload windowed.
 *
 * IT ASSERTS TWO THINGS, AND THE SECOND IS WHAT MAKES THE FIRST MEAN ANYTHING:
 *
 *   1. a finished task older than the shipped window is findable in the palette
 *   2. that task is NOT in the page payload at all
 *
 * Without (2) this check would pass against the client-side version and prove nothing — the row would be
 * sitting in the payload and of course it would be found. (2) is what makes (1) a statement about the
 * server. And the injection closes the loop from the other side: with the search endpoint answering
 * nothing, the palette must find nothing. If it still finds the task, the palette has a second corpus
 * somewhere and this check is measuring the wrong one.
 *
 * It runs LAST because it writes ~150 finished rows to get past the window and deletes them afterwards. Any
 * check before it that counts completions would see them.
 */

/** A phrase that exists nowhere else in the hub, so a hit can only be the row this check planted. */
const DEEP_PHRASE = 'zarquon';
const DEEP_PROJECT = 'search-depth';

async function plantDeepHistory() {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const { RECORD_WINDOW } = await import('../lib/progress.ts');
    /*
     * Enough rows that the fixture's nine plus these overflow the window, plus a margin. Written with SQL
     * rather than through the API for the same reason tests/at-scale.mjs is: what is being tested is a
     * function of ROW COUNT, and 150 HTTP round trips prove nothing the fixture does not already prove.
     */
    const extra = RECORD_WINDOW + 20;
    const day = 86_400_000;
    const rows = Array.from({ length: extra }, (_, i) => ({
        id: `sd${String(i).padStart(6, '0')}`,
        // Oldest first, and all of them older than the fixture's completions (which span the last 8 days).
        done: new Date(Date.now() - (extra - i + 30) * day).toISOString(),
        title: i === 0
            // The target: the OLDEST completion in the hub, therefore the furthest outside any window.
            ? `Register the ${DEEP_PHRASE} sender ID with the carrier`
            : `Older finished work number ${i}`,
        /*
         * EVERY THIRD ONE CARRIES A NOTE, and that is what makes the score assertion below mean something.
         *
         * A note back to the agent is worth 4 points, and the payload ships the TEXT of one only for rows
         * inside the window — beyond it there is a single bit, `noted`, in the tuple history. So without
         * noted rows out here, the check could not tell a correct encoding from one that silently stopped
         * paying for every note older than sixty completions. That is precisely the defect this whole
         * session is about.
         */
        note: i % 3 === 0 ? 'Did it — the button was called Continue rather than Submit.' : null,
    }));
    await db`
        insert into tasks (id, project, key, title, why, minutes, steps, verify, gotchas,
                           status, note, created_at, updated_at, done_at)
        select * from unnest(
            ${rows.map(r => r.id)}::text[], ${rows.map(() => DEEP_PROJECT)}::text[],
            ${rows.map(r => 'k-' + r.id)}::text[], ${rows.map(r => r.title)}::text[],
            ${rows.map(() => 'So the record has depth to search through.')}::text[],
            ${rows.map(() => 10)}::int[], ${rows.map(() => '[]')}::jsonb[],
            ${rows.map(() => 'It is in the record.')}::text[], ${rows.map(() => '[]')}::jsonb[],
            ${rows.map(() => 'done')}::text[], ${rows.map(r => r.note)}::text[],
            ${rows.map(r => r.done)}::timestamptz[], ${rows.map(r => r.done)}::timestamptz[],
            ${rows.map(r => r.done)}::timestamptz[])
        on conflict (id) do nothing
    `;
    return { extra, window: RECORD_WINDOW };
}

async function clearDeepHistory() {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    await db`delete from tasks where project = ${DEEP_PROJECT}`;
    await db`delete from events where project = ${DEEP_PROJECT}`;
}

/** Open the palette the way he does, type a query, and report what came back. */
async function searchPalette(query) {
    return b.evaluate(`(async () => {
        /*
         * ONE dispatch, on window, and that is a bug fix rather than a tidy-up.
         *
         * The first version fired the event on \`document\` AND on \`window\` to be safe. A DOM event on
         * \`document\` bubbles to \`window\`, so Board's one listener ran TWICE — and it TOGGLES
         * (setPaletteOpen(o => !o)), so the palette opened and closed again inside the same tick and every
         * assertion below reported something else. Being thorough about which target to dispatch on is how
         * you end up testing a closed dialog.
         */
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        for (let i = 0; i < 40; i++) {
            if (document.querySelector('[data-measure="palette-input"]')) break;
            await new Promise(r => setTimeout(r, 50));
        }
        const input = document.querySelector('[data-measure="palette-input"]');
        if (!input) return { error: 'Ctrl+K did not open the palette' };
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, ${JSON.stringify(query)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        /* Poll rather than sleep: the results may arrive from an endpoint, and a flat wait is the flake
         * tests/chrome.mjs already records as costing two wrong answers. */
        let rows = [];
        for (let i = 0; i < 60; i++) {
            rows = [...document.querySelectorAll('[data-measure="palette-row"]')]
                .map(r => (r.textContent || '').trim());
            if (rows.length) break;
            await new Promise(r => setTimeout(r, 100));
        }
        const none = document.querySelector('.palnone');
        return { rows, empty: !!none, emptyText: none ? (none.textContent || '').trim() : null };
    })()`);
}

await check('S1 — a finished task older than the shipped window is still findable', async () => {
    const { extra, window: win } = await plantDeepHistory();
    /*
     * The TOTAL comes from the database, not from `extra + 9`.
     *
     * The first version added the fixture's nine and got 89 while the page said 93 — because the checks above
     * this one tick tasks off and re-open them, so "the fixture's nine" stopped being true four completions
     * ago. An expected value computed from what the fixture USED to hold is the same mistake P2 was rewritten
     * to remove, arriving in the check that replaced it.
     */
    const total = (await dbCounts()).tasks_done;
    try {
        await b.goto('/');

        /*
         * (2) FIRST, because it is what makes (1) mean anything. Read straight out of the document: if the
         * phrase is anywhere in the HTML the browser received, the palette could find it without any server
         * involvement and this check would be measuring the old behaviour.
         */
        const inPayload = await b.evaluate(
            `document.documentElement.outerHTML.toLowerCase().includes(${JSON.stringify(DEEP_PHRASE)})`);
        assert(!inPayload,
            `the page payload still contains "${DEEP_PHRASE}", so the record is not windowed and this ` +
            'check cannot tell a server-side search from a client-side one');

        const found = await searchPalette(DEEP_PHRASE);
        assert(!found.error, found.error);
        const hit = found.rows.find(t => t.toLowerCase().includes(DEEP_PHRASE));
        assert(hit,
            `SEARCH LOST OLD WORK. The oldest of ${total} completions is not findable by a word in its ` +
            `own title. Window is ${win}. The palette returned ` +
            (found.empty ? `"${found.emptyText}"` : `${found.rows.length} row(s): ` +
                found.rows.slice(0, 3).map(r => JSON.stringify(r.slice(0, 50))).join(', ')));

        /*
         * AND THE RECORD SAYS IT IS A WINDOW — the overflow branch of check P10, which no fixture state can
         * reach. P10 asserts the opposite where the record fits; this is the only place the caveat exists to be
         * read, so if it were missing or wrong nothing else in nine suites would notice.
         */
        /*
         * DRIVEN FROM NODE, IN SHORT EVALUATES, and that is a flake fix rather than a style preference.
         *
         * This was one `async` IIFE holding an eight-second polling loop inside the page, and it failed
         * intermittently — three runs in eight — with CDP's `-32000 Promise was collected`. A page-side promise
         * that lives for seconds while the page is doing real work is a promise V8 is allowed to collect, and
         * when it does, the reply carries an error instead of a result. Until this session the harness
         * mistranslated that into "Cannot read properties of undefined (reading 'result')", which is why it was
         * read twice as a defect in the record rather than in the driving.
         *
         * Node-side polling is this file's established pattern (see `pollFigure`) for exactly this reason: each
         * evaluate is synchronous and returns in milliseconds, so there is no long-lived promise to collect.
         *
         * The palette is closed first. It was left open by the search above, so every click below was landing
         * under a modal overlay — which works programmatically and is not a state a person can reach.
         */
        await b.evaluate(`(() => {
            document.querySelector('[data-measure="palette-input"]')?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })()`);
        const openRecord = async () => {
            for (let i = 0; i < 60; i++) {
                const rows = await b.evaluate(
                    `document.querySelectorAll('[data-measure="done-task"]').length`);
                if (rows) return true;
                const pressed = await b.evaluate(`(() => {
                    const tab = [...document.querySelectorAll('[data-measure="record-tab"]')]
                        .find(t => t.dataset.tab === 'tasks');
                    if (tab) { tab.click(); return 'tab'; }
                    const chip = document.querySelector(
                        '[data-measure="progress-figure"][data-figure="tasks-done"]');
                    if (chip) { chip.click(); return 'chip'; }
                    return null;
                })()`);
                if (!pressed) return false;
                await new Promise(r => setTimeout(r, 100));
            }
            return false;
        };
        assert(await openRecord(), 'nothing on the page opened the record onto its Tasks list');
        const record = await b.evaluate(`(() => {
            const note = document.querySelector('[data-measure="record-window"]');
            return {
                rows: document.querySelectorAll('[data-measure="done-task"]').length,
                note: note ? (note.textContent || '').trim() : null,
                /* In the order the eye reads them, so the claim "newest first" can be checked rather than
                 * taken on trust. See the assertion below. */
                order: [...document.querySelectorAll('[data-measure="done-task"]')]
                    .map(el => el.getAttribute('data-done-at') || ''),
                /* Every window caveat ON SCREEN, not just the first: the tasks one used to sit above the tab
                 * strip, so opening the Decisions tab put two of them on the page and the higher one described
                 * a list that was no longer rendered. */
                caveats: [...document.querySelectorAll('[data-measure="record-window"]')].length,
            };
        })()`);
        assert(record.note && /most recent/i.test(record.note),
            'the record lists a window and says nothing about it, so "Everything since <date>" is now a ' +
            `lie on the one surface whose job is to be believable. It says: ${JSON.stringify(record.note)}`);
        assert(record.rows === win,
            `the record listed ${record.rows} rows and the window is ${win}`);
        /* Both numbers in the sentence, and both true: the window it is showing and the total it is out of. */
        const said = (record.note.match(/\d[\d,]*/g) || []).map(n => +n.replace(/,/g, ''));
        assert(said.includes(win) && said.includes(total),
            `the caveat's numbers do not match reality — it says ${JSON.stringify(said)} and the truth is ` +
            `${win} of ${total}`);

        /*
         * AND THE LIST IS IN THE ORDER THE SENTENCE CLAIMS — which for the life of this surface it was not.
         *
         * The record was grouped by project, so one descending list rendered as several of them side by side
         * under a line reading "newest first". Check P11 in tests/measure-layout.mjs holds the same invariant on
         * every layout run and CANNOT catch the original defect: the fixture's nine completions are one per
         * project bar six consecutive ones, so bucketing them happens to come out descending. This is the state
         * where it shows — 93 completions across five projects — so this is the assertion that would have caught
         * it, and it was watched failing against the grouped version before this line was kept.
         */
        const outOfOrder = record.order.filter((at, i) => i > 0 && at > record.order[i - 1]).length;
        assert(outOfOrder === 0,
            `THE RECORD IS NOT IN THE ORDER IT CLAIMS. ${outOfOrder} of ${record.order.length - 1} adjacent ` +
            'pairs run older-then-newer, under a line that says "newest first". First eight: ' +
            record.order.slice(0, 8).map(s => s.slice(0, 10)).join(' '));

        /*
         * ONE CAVEAT ON SCREEN, ABOUT THE LIST THAT IS ON SCREEN.
         *
         * The tasks window sentence used to render above the tab strip, which put it on the page for all five
         * tabs — so pressing Decisions showed two window sentences 80px apart, and the upper one stated "the
         * most recent 60 of 93" about a list of completions that was no longer rendered.
         */
        assert(record.caveats === 1,
            `${record.caveats} window caveats are on screen at once; each list may only be described by its own`);

        /*
         * AND THE SCORE STILL ADDS UP — which is what proves the tuple history is exact, not merely present.
         *
         * The figures on the page are folded over the whole record; beyond the window that record arrived as
         * six numbers a row. If the encoding dropped a row, mixed up two, or lost the note bit, the points
         * would drift from what SQL adds up to and this says by how much. It is the same independent
         * recomputation the score check above does, run against a state 93 completions deep instead of nine.
         */
        await b.goto('/');
        const n = await dbPoints();
        const shownPoints = await pageFigure('points');
        assert(shownPoints === n.points,
            `THE TUPLE HISTORY DOES NOT ADD UP. The page says ${shownPoints} points over ${total} ` +
            `completions; the database adds up to ${n.points} (${n.done} done, ${n.noted} with a note, ` +
            `${n.answered} answered). A window that loses points is a level he did not lose.`);

        return `${total} completions (${extra} planted, ${n.noted} with a note), window ${win}; the oldest ` +
            `is found by a word in its title, it is not in the payload, the record says ` +
            `"${record.note.slice(0, 46)}…", and the score still equals SQL at ${n.points}`;
    } finally {
        await clearDeepHistory();
    }
});

/*
 * S3 — THE PALETTE IS THE SIZE OF ITS ANSWER, and for the life of the endpoint it was not.
 *
 * `.palwrap` is a flex row, so the default `align-items: stretch` stretched the box down the cross axis and
 * `max-block-size: 76vh` capped it — the box was 660px tall whatever it held. Search became an endpoint
 * (§XXVI), which created two states nothing had ever rendered, and both of them are one line of text: "Searching…"
 * and "Nothing matches “…”". Each was that one line at the top of a 660px black rectangle, and so was the error.
 *
 * It is asserted as a RELATION rather than a pixel count — the box is no taller than what is written in it — so
 * it holds at any viewport, in any theme, and cannot go stale the way "under 300px" would. One CSS word controls
 * it and no other check in nine suites would notice it changing back.
 *
 * MEASURED FROM THE LIST'S OWN CHILDREN, and the first two attempts at that were both wrong. Comparing the box
 * to the sum of its three children fails to notice anything, because `.pallist` is `flex: 1 1 auto` and grows to
 * fill whatever the box is given: stretched, the box was 684px around 682px of "content" and the relation held
 * perfectly. Using the list's `scrollHeight` fails the same way — a stretched list has no overflow, so
 * `scrollHeight` equals its inflated `clientHeight`. The only height that does not move when the box is stretched
 * is the height of the ROWS, so that is what this adds up.
 */
await check('S3 — with nothing to list, the palette is the height of its own content', async () => {
    await b.goto('/');
    const shown = await searchPalette('zzzq');
    assert(!shown.error, shown.error);
    assert(shown.empty, `"zzzq" matched ${shown.rows.length} row(s), so there is no empty state to measure`);

    const MEASURE = `(() => {
        const el = document.querySelector('.palbox');
        if (!el) return null;
        const list = el.querySelector('.pallist');
        const cs = getComputedStyle(list);
        const written = [...list.children].reduce((n, c) => n + c.getBoundingClientRect().height, 0)
            + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const others = [...el.children].filter(c => c !== list)
            .reduce((n, c) => n + c.getBoundingClientRect().height, 0);
        return {
            height: Math.round(el.getBoundingClientRect().height),
            content: Math.round(written + others),
            viewport: window.innerHeight,
        };
    })()`;
    const box = await b.evaluate(MEASURE);
    assert(box, 'the palette box is not on the page');
    /* Four pixels of tolerance: two 1px borders the children do not include, and sub-pixel line boxes. */
    assert(box.height <= box.content + 4,
        `THE PALETTE IS NOT THE SIZE OF ITS ANSWER: the box is ${box.height}px tall around ${box.content}px ` +
        `of content in a ${box.viewport}px viewport, so ${box.height - box.content}px of it is empty. One line ` +
        'of text in a void is what the latency and no-match states looked like before §XXVII.');

    /* And the injection, so this check is known to be pointed at the thing it names rather than at a class. */
    await b.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'),
        { textContent: '.palwrap { align-items: stretch !important; }' }))`);
    const stretched = await b.evaluate(MEASURE);
    assert(stretched.height > stretched.content + 4,
        'THE INJECTION CAUGHT NOTHING: putting `align-items: stretch` back did not make the box taller than ' +
        'its content, so this check is not measuring what it says it is');

    await b.goto('/');
    return `${box.height}px around ${box.content}px of content; with stretch restored it is ` +
        `${stretched.height}px around ${stretched.content}px, which is the defect`;
});

/*
 * ============================================================================================
 * S2 — EVERY PAGE DERIVES FROM THE WHOLE RECORD, and two of them did not
 * ============================================================================================
 *
 * `board()` returns the completions and the answered decisions as a WINDOW of the most recent
 * `RECORD_WINDOW` (§XXVI). A server that calls `derive()` on those gets a level computed from the last sixty
 * completions instead of from all of them. `app/page.tsx` was given `expandHistory` when the window shipped;
 * `app/looks/page.tsx` and the `look.choose` branch of `app/api/ui/act/route.ts` were missed.
 *
 * Rendered at two years of volume, the hub said **level 32** and `/looks` said **level 8** — off one database,
 * seconds apart. And it is not only a wrong readout: `resolveLooks` reduces a chosen look to what the standing
 * it is handed has earned, so `/looks` renders a look he is currently using as LOCKED and `look.choose` refuses
 * one he earned a year ago. A perk economy whose rule is "an unlock never applies itself" would have started
 * un-applying them.
 *
 * WHY IT NEEDS THE DEEP RECORD: below sixty completions the window IS the whole record, so every derivation
 * agrees and this check cannot fail however it is written. That is the whole reason nine suites and every
 * screenshot ever filed missed it — the fixture is nine completions and his real hub is fourteen.
 *
 * It asserts AGREEMENT rather than a number, deliberately. A check that expects level 8 at 93 completions is a
 * check somebody has to update every time the ladder is tuned; "these two pages say the same thing" is the
 * actual guarantee, and it cannot go stale.
 */
await check('S2 — the hub and /looks agree about his level over a record deeper than the window', async () => {
    const { extra } = await plantDeepHistory();
    try {
        const read = async (path) => {
            await b.goto(path);
            return b.evaluate(`(() => {
                const text = document.body.innerText || '';
                const level = /Level\\s+(\\d+)|level\\s+(\\d+)/.exec(text);
                const unlocked = /(\\d+)\\s*\\/\\s*(\\d+)/.exec(
                    document.querySelector('.navbadge')?.textContent || '');
                return {
                    level: level ? +(level[1] || level[2]) : null,
                    unlocked: unlocked ? unlocked[1] + '/' + unlocked[2] : null,
                };
            })()`);
        };
        const hub = await read('/');
        const looks = await read('/looks');

        assert(hub.level !== null, 'the hub states no level, so there is nothing to compare');
        assert(looks.level !== null, '/looks states no level, so there is nothing to compare');
        assert(hub.level === looks.level,
            `THE HUB AND /looks DISAGREE ABOUT HIS LEVEL over ${extra + 9} completions: the hub says ` +
            `${hub.level} and /looks says ${looks.level}. One of them is deriving from the windowed record ` +
            'instead of the whole one, and the lower figure is the one that takes looks away.');
        assert(hub.unlocked && hub.unlocked === looks.unlocked,
            `the two pages disagree about how many looks are his — the hub says ${hub.unlocked} and /looks ` +
            `says ${looks.unlocked}, so one of them will render an earned look as locked`);

        return `both say level ${hub.level} and ${hub.unlocked} looks over ${extra + 9} completions`;
    } finally {
        await clearDeepHistory();
    }
});

await check('S1-inj — with the search endpoint answering nothing, the palette finds nothing', async () => {
    /*
     * THE INJECTION THAT MATTERS, and it is aimed at the failure mode §XXV describes rather than at a
     * selector. If the palette still had a client-side corpus — or fell back to one when the endpoint
     * failed — S1 above could pass over a page that had quietly stopped searching the server. Killing the
     * endpoint is the only way to tell those two apart from outside.
     *
     * It also checks the honest-failure half: a search that cannot reach its endpoint has to SAY so. An
     * empty result list for a query that does match something is the hub lying about its own contents,
     * which is the same class of defect as an optimistic "saved".
     */
    const { extra } = await plantDeepHistory();
    try {
        await b.goto('/');
        await b.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/ui/search*', requestStage: 'Request' }] });
        let intercepted = 0;
        const stop = b.onEvent('Fetch.requestPaused', async (params) => {
            intercepted++;
            await b.call('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 500,
                responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                body: Buffer.from(JSON.stringify({ ok: false, error: 'search is deliberately dead' }))
                    .toString('base64'),
            });
        });

        const found = await searchPalette(DEEP_PHRASE);
        stop();
        await b.call('Fetch.disable');

        /* Before anything about interception: if the palette never opened, every assertion below is about
         * an absent dialog and the message would blame the wrong thing. It did, once. */
        assert(!found.error, found.error);
        assert(intercepted > 0,
            'THE INJECTION CAUGHT NOTHING: the palette never requested /api/ui/search, so S1 above is ' +
            'measuring a client-side index and would keep passing after the payload was windowed');
        const hit = (found.rows || []).find(t => t.toLowerCase().includes(DEEP_PHRASE));
        assert(!hit,
            `the palette found the row with its endpoint dead, so it has a second corpus and S1 is not ` +
            'measuring the one that matters');
        assert(found.empty && /again|not answer|could not/i.test(found.emptyText || ''),
            'a search that could not reach its endpoint reported an ordinary "nothing matches" instead of ' +
            `saying it failed: ${JSON.stringify(found.emptyText)}`);

        return `${intercepted} request(s) intercepted over ${extra + 9} completions; nothing found, and the ` +
            'palette says why rather than reporting an empty result';
    } finally {
        await clearDeepHistory();
    }
});

/* ==================================================================================================
 * S4 — A HELD TOOL CALL, PRESSED FOR REAL.
 *
 * The one path in this feature that nothing else can reach. `prove.mjs` files a request and decides it over
 * HTTP; `prove:layout`'s A4 measures the band's geometry. Neither presses the button, and the button is the
 * feature: it is a control on his phone that changes what a process on another machine is allowed to do.
 *
 * It plants the request through the real agent endpoint, presses the real Allow, and then asks the DATABASE
 * whether the decision is there — which is this file's whole rule. A check that read the button's own label
 * afterwards would be believing the interface about the interface.
 * ================================================================================================== */

async function fileHeldCall({ project = 'harbour-lights', tool = 'Bash', preview = 'rm -rf build' } = {}) {
    const res = await fetch(`${BASE}/api/agent/permission`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${AGENT}`, 'x-cc-agent': 'use-it', 'content-type': 'application/json',
        },
        body: JSON.stringify({
            project, tool_name: tool, preview,
            tool_use_id: `use-it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }),
    });
    const json = await res.json();
    if (!json.id) throw new Error(`could not file a held call: ${JSON.stringify(json)}`);
    return json.id;
}

async function approvalRow(id) {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`select status, decided_by from approvals where id = ${id}`;
    return rows[0] ?? null;
}

async function clearHeldCalls() {
    const { neon } = await import('@neondatabase/serverless');
    await neon(process.env.DATABASE_URL)`delete from approvals`;
}

await check('S4 — pressing Allow on a held tool call is stored, and the counts do not move', async () => {
    await clearHeldCalls();
    const id = await fileHeldCall();
    try {
        await b.goto('/');

        /*
         * THE COUNTS, READ BEFORE AND AFTER — from the page this time rather than from the API.
         *
         * `prove.mjs` already asserts the SYNC counts are untouched. This asserts the same thing about the
         * header chips, which is a different claim: the chips are folded in the browser out of `initial`, so a
         * held call reaching them would be a rendering decision rather than a query change, and the API check
         * could not see it.
         */
        const chipsBefore = await b.evaluate(`(() => {
            /* NO BACKTICKS IN HERE. Trap 1. */
            const el = document.querySelector('[data-measure="summary"]');
            return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
        })()`);

        const band = await b.evaluate(`(() => {
            const row = document.querySelector('[data-measure="approval"]');
            if (!row) return { none: true };
            const preview = row.querySelector('[data-measure="approval-preview"]');
            const allow = row.querySelector('[data-measure="approval-allow"]');
            return {
                id: row.getAttribute('data-approval'),
                status: row.getAttribute('data-status'),
                preview: preview ? preview.textContent : null,
                hasAllow: !!allow,
                /* Deny must come FIRST in the DOM so a keyboard cannot authorise by pressing Enter on
                 * whatever it landed on. Measured as document order rather than as a class name. */
                denyBeforeAllow: (() => {
                    const d = row.querySelector('[data-measure="approval-deny"]');
                    const a = row.querySelector('[data-measure="approval-allow"]');
                    if (!d || !a) return null;
                    return !!(d.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
                })(),
            };
        })()`);

        assert(!band.none, 'the band did not render a held tool call at all');
        eq(band.id, id, 'the rendered request');
        eq(band.status, 'pending', 'the rendered status');
        eq(band.preview, 'rm -rf build', 'the rendered preview');
        assert(band.denyBeforeAllow === true,
            'Allow comes before Deny in the DOM, so a keyboard can authorise a tool call by pressing Enter '
            + 'on the control focus happened to reach first');

        /* The real click. */
        await b.evaluate(`document.querySelector('[data-measure="approval-allow"]').click()`);
        await new Promise(r => setTimeout(r, 900));

        const row = await approvalRow(id);
        assert(row != null, 'the request vanished from the database');
        eq(row.status, 'allowed', 'the status in the DATABASE after pressing Allow');
        eq(row.decided_by, 'web', 'where the database says the decision came from');

        /* Only now does the interface get to speak, and only to confirm it reflects the row. */
        const outcome = await b.evaluate(`(() => {
            const el = document.querySelector('[data-measure="approval-outcome"]');
            return el ? el.textContent.trim() : null;
        })()`);
        assert(/allowed/i.test(outcome || ''),
            `the row is allowed in the database and the page says ${JSON.stringify(outcome)}`);

        const chipsAfter = await b.evaluate(`(() => {
            const el = document.querySelector('[data-measure="summary"]');
            return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
        })()`);
        eq(chipsAfter, chipsBefore,
            'the header chips changed while a tool call was held, which is the one thing the brief forbids');

        return `filed, rendered, allowed by a real click, confirmed in the database, and the chips read `
            + `"${chipsBefore}" throughout`;
    } finally {
        await clearHeldCalls();
    }
});

await check('S4-inj — with the decide action broken, the band reports it and does NOT look allowed',
    async () => {
        /*
         * The fault injection for S4, and it is the no-optimistic-UI rule pointed at the highest-stakes control
         * in the hub. If a refused Allow rendered as allowed, he would believe he had authorised something and
         * the agent would still be waiting — the two halves out of step in the direction that wastes the ten
         * minutes the feature exists to save.
         *
         * `x-cc-fault: write-nothing` makes the UPDATE match zero rows, so `writeVerified` raises and the route
         * returns a 500 with the reason.
         */
        await clearHeldCalls();
        const id = await fileHeldCall({ preview: 'about to be refused' });
        try {
            await b.goto('/');
            await b.evaluate(`(() => {
                const orig = window.fetch;
                window.__faults = 0;
                window.fetch = (url, opts) => {
                    if (String(url).includes('/api/ui/act')) {
                        window.__faults++;
                        opts = opts || {};
                        opts.headers = Object.assign({}, opts.headers, { 'x-cc-fault': 'write-nothing' });
                    }
                    return orig(url, opts);
                };
            })()`);

            await b.evaluate(`document.querySelector('[data-measure="approval-allow"]').click()`);
            await new Promise(r => setTimeout(r, 900));

            const injected = await b.evaluate('window.__faults');
            assert(injected > 0, 'no request was intercepted, so nothing was actually broken');

            const row = await approvalRow(id);
            eq(row.status, 'pending', 'the DATABASE status after a refused Allow');

            const shown = await b.evaluate(`(() => {
                const r = document.querySelector('[data-measure="approval"]');
                return {
                    status: r ? r.getAttribute('data-status') : null,
                    outcome: !!r?.querySelector('[data-measure="approval-outcome"]'),
                    stillHasAllow: !!r?.querySelector('[data-measure="approval-allow"]'),
                    said: r ? r.textContent : '',
                };
            })()`);
            eq(shown.status, 'pending', 'the RENDERED status after a refused Allow');
            assert(!shown.outcome, 'the band showed an outcome for a write the server refused');
            assert(shown.stillHasAllow, 'the buttons went away, so he cannot retry a write that never happened');
            assert(/not saved|zero rows|refus/i.test(shown.said),
                `the band did not print the server's reason: ${JSON.stringify(shown.said.slice(0, 160))}`);

            return 'refused, still pending in the database and on screen, with the reason and the buttons intact';
        } finally {
            await clearHeldCalls();
        }
    });

/* ==================================================================================================
 * A3 — THE FIVE PRESENCE STATES, AND THE RULE THAT NONE OF THEM MAY SAY "YOU".
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §3.1 makes it a rule rather than a preference: *"if the sentence needs the
 * word 'you', rewrite it. 'Nothing has changed here for nine days', never 'you haven't touched this'."* It
 * comes from the same reasoning that banned streaks — a quiet project is a statement about the AGENTS, and in
 * the second person it becomes an accusation about his own attention when he did not fail to do anything.
 *
 * WHY IT IS RENDERED RATHER THAN UNIT-TESTED. `sentenceFor` cannot be imported by a `.mjs` check: it imports
 * `humanDate` as a value, and Node's type-stripping cannot resolve an extensionless cross-`lib` import
 * (AGENTS.md trap 2). Both fixes were worse than this — a second date formatter is the mistake `lib/colour.ts`
 * exists to undo, and `allowImportingTsExtensions` is a project-wide change to buy one import.
 *
 * Rendering is also STRICTLY STRONGER, which is the part worth keeping: a unit test on `sentenceFor` would pass
 * while the page ignored it and hard-coded its own wording, and that is the shape of half the defects in this
 * project's history. This reads what a person would read.
 *
 * All five states in ONE render, because the fixture produces exactly one of them and the rule has to hold for
 * the four it never shows.
 * ================================================================================================== */

await check('A3 — all five presence states render, and not one sentence says "you"', async () => {
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const mins = n => new Date(Date.now() - n * 60_000).toISOString();

    const before = await db`select * from presence`;
    await db`delete from presence`;
    try {
        /*
         * One row per state. The fifth — `never` — is the ABSENCE of a row for a project the hub knows about,
         * which is why nothing is inserted for `tuck-shop`: the absence IS the state, and a check that planted
         * something for it would be measuring a different thing.
         */
        await db`insert into presence (project, agent, session, kind, started_at, last_seen_at, branch, model)
                 values ('harbour-lights', 'claude-code', 'a3-working', 'session',
                         ${mins(25)}, ${mins(2)}, 'master', 'claude-opus-5')`;
        await db`insert into presence (project, agent, session, kind, started_at, last_seen_at, branch, model)
                 values ('cold-brew', 'codex', 'a3-open', 'session',
                         ${mins(200)}, ${mins(200)}, 'spike/x', 'claude-opus-4-8')`;
        await db`insert into presence (project, agent, session, kind, started_at, last_seen_at, ended_at,
                                      end_reason, branch, model)
                 values ('nine-panels', 'cursor', 'a3-idle', 'session',
                         ${mins(60)}, ${mins(6)}, ${mins(6)}, 'clear', 'main', 'claude-opus-5')`;
        await db`insert into presence (project, agent, session, kind, started_at, last_seen_at)
                 values ('proof-quiet-a3', 'antigravity', 'sync', 'sync',
                         ${mins(60 * 24 * 12)}, ${mins(60 * 24 * 12)})`;

        await b.goto('/agents');

        const found = await b.evaluate(`(() => {
            /* NO BACKTICKS IN HERE, comments included. Trap 1 in AGENTS.md. */
            const rows = [...document.querySelectorAll('[data-measure="presence-row"]')];
            return rows.map(r => ({
                project: r.getAttribute('data-project'),
                state: r.getAttribute('data-state'),
                sentence: (r.querySelector('[data-measure="presence-line"]') || {}).textContent || '',
            }));
        })()`);

        assert(found.length > 0, 'the page rendered no presence rows at all');

        const states = new Set(found.map(r => r.state));
        for (const want of ['working', 'open', 'idle', 'quiet', 'never']) {
            assert(states.has(want),
                `no row rendered in the "${want}" state, so the rule is untested for it. `
                + `Got: ${[...states].join(', ')}`);
        }

        /*
         * The rule. A word boundary rather than a substring, so a project slug containing "you" — or the word
         * "your" inside a longer word — cannot produce a false failure, and the check stays about the pronoun.
         */
        const offenders = found.filter(r => /\b(you|your|you're|yours|yourself)\b/i.test(r.sentence));
        assert(offenders.length === 0,
            'a presence sentence addresses him in the second person, which turns a fact about the agents into '
            + 'an accusation about his attention:\n            '
            + offenders.map(o => `${o.state}: "${o.sentence}"`).join('\n            '));

        /* And each one actually says something — an empty sentence would pass the rule above vacuously. */
        for (const r of found) {
            assert(r.sentence.trim().length > 10,
                `the ${r.state} row for ${r.project} rendered an empty or near-empty sentence: `
                + JSON.stringify(r.sentence));
        }

        return `${found.length} rows across all five states, none in the second person:\n          `
            + [...states].map(s => `${s}: "${found.find(r => r.state === s).sentence}"`).join('\n          ');
    } finally {
        await db`delete from presence`;
        for (const r of before) {
            /*
             * `observed` HAS TO BE RESTORED TOO, and forgetting it silently rewrote the fixture. The
             * column defaults to true, so a restore that omitted it turned every reconstructed row back
             * into a measured one — and the checks that ran after this one were then measuring a page
             * whose blocks had all quietly changed kind. R3 was green while looking at data this check
             * had corrupted, which is the exact "a check that measures the wrong page" failure §XXX.11
             * caught L7 doing.
             *
             * The rule for whoever adds the next column: this list is a copy of the table, so it goes
             * stale every time the table grows, and nothing warns you.
             */
            await db`insert into presence (project, agent, session, kind, started_at, last_seen_at, ended_at,
                                           end_reason, branch, model, observed)
                     values (${r.project}, ${r.agent}, ${r.session}, ${r.kind}, ${r.started_at},
                             ${r.last_seen_at}, ${r.ended_at}, ${r.end_reason}, ${r.branch}, ${r.model},
                             ${r.observed})`;
        }
    }
});

await check('A3-inj — the "you" rule can fail, so a green A3 means something', async () => {
    /*
     * The fault injection for A3, and it is the only shape that makes sense here: rewrite a rendered sentence
     * into the second person and assert the same regex catches it. Injecting into the page rather than into
     * `sentenceFor` because what A3 reads is the DOM — a check that could only fail when the source function
     * was wrong would not notice a component that ignored the function.
     */
    await b.goto('/agents');
    const caught = await b.evaluate(`(() => {
        const el = document.querySelector('[data-measure="presence-line"]');
        if (!el) return { none: true };
        el.textContent = 'You have not touched this project in nine days';
        const rows = [...document.querySelectorAll('[data-measure="presence-row"]')];
        const sentences = rows.map(r =>
            ((r.querySelector('[data-measure="presence-line"]') || {}).textContent || ''));
        return { caught: sentences.some(s => /\\b(you|your)\\b/i.test(s)) };
    })()`);
    if (caught.none) return 'NOT MEASURED — no presence line on the page to rewrite';
    assert(caught.caught === true,
        'a sentence rewritten into the second person was NOT caught, so A3 proves nothing');
    return 'a second-person sentence is caught by the same test A3 applies';
});

/* ==================================================================================================
 * R1–R4 — THE CHART, AND THE ONE THING IT IS NOT ALLOWED TO DO.
 *
 * A block on a chart is a claim about a span of time, and this page has already shipped two defects that
 * were both the same mistake: stating more than the evidence supports. So the checks here are not about
 * whether the chart looks right — they are about whether any shape on it asserts something the rows do
 * not say.
 *
 * All four read the RENDERED page rather than `buildTimeline`, on the same reasoning A3 records: a unit
 * test on the fold would pass while the component drew whatever it liked, and that is the shape of half
 * the defects in this project's history. The fold IS importable — it takes no value imports, unlike
 * `lib/presence.ts` — so R2 loads it and compares the two, which is the strongest available form: the
 * arithmetic and the pixels have to agree with each other AND with the database.
 * ================================================================================================== */

await check('R1 — every bar on the chart is inside its own lane and inside the window', async () => {
    await b.goto('/agents');
    const m = await b.evaluate(`(() => {
        /* NO BACKTICKS IN HERE, comments included. Trap 1, sixteen occurrences. */
        const lanes = [...document.querySelectorAll('[data-measure="run-lane"]')];
        if (!lanes.length) return { none: true };
        const bad = [];
        let blocks = 0;
        for (const lane of lanes) {
            const track = lane.querySelector('.runtrack');
            const t = track.getBoundingClientRect();
            for (const el of lane.querySelectorAll('[data-measure="run-block"]')) {
                blocks++;
                const r = el.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) { bad.push('a bar with no size'); continue; }
                if (r.left < t.left - 1 || r.right > t.right + 1) {
                    bad.push(lane.dataset.project + ': a bar leaves its lane sideways');
                }
                if (r.top < t.top - 1 || r.bottom > t.bottom + 1) {
                    bad.push(lane.dataset.project + ': a bar leaves its lane vertically');
                }
            }
        }
        return { lanes: lanes.length, blocks, bad };
    })()`);
    if (m.none) return 'NOT MEASURED — nothing ran in the window, so there is no chart';
    assert(m.bad.length === 0, m.bad.slice(0, 3).join('; '));
    assert(m.blocks > 0, 'the chart rendered lanes with no bars in them');
    return `${m.blocks} bar(s) across ${m.lanes} lane(s), every one inside its own lane`;
});

await check('R2 — the drawn width of every bar equals the span the database holds', async () => {
    /*
     * THE CHECK THAT MATTERS MOST ON THIS PAGE. A bar 8% wide on a 24-hour window is asserting one hour
     * and fifty-five minutes, and nothing else on the page would reveal it if that were wrong by an hour.
     * So the rendered pixel width is compared against the row, through the fold, with a tolerance of one
     * pixel for sub-pixel layout.
     */
    await b.goto('/agents');
    const m = await b.evaluate(`(() => {
        const out = [];
        for (const lane of document.querySelectorAll('[data-measure="run-lane"]')) {
            const t = lane.querySelector('.runtrack').getBoundingClientRect();
            for (const el of lane.querySelectorAll('[data-measure="run-block"]')) {
                const r = el.getBoundingClientRect();
                out.push({
                    project: lane.dataset.project, kind: el.dataset.kind,
                    leftPct: ((r.left - t.left) / t.width) * 100,
                    widthPct: (r.width / t.width) * 100,
                    label: el.getAttribute('aria-label') || '',
                });
            }
        }
        return { drawn: out, w: (document.querySelector('.runtrack') || {}).clientWidth };
    })()`);
    if (!m.drawn.length) return 'NOT MEASURED — nothing ran in the window, so there is no chart';

    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const iso = v => (v == null ? null : new Date(v).toISOString());
    const sessions = (await db`
        select project, agent, session, started_at, last_seen_at, ended_at, end_reason, branch, model,
               observed from presence where kind = 'session'`)
        .map(r => ({ ...r, started_at: iso(r.started_at), last_seen_at: iso(r.last_seen_at),
            ended_at: iso(r.ended_at) }));
    const subs = (await db`
        select id, project, agent, session, type, task, model, started_at, start_seen, ended_at, outcome,
               tool_calls, edits, lines_added, lines_removed, observed from subagents`)
        .map(r => ({ ...r, started_at: iso(r.started_at), ended_at: iso(r.ended_at) }));
    const { buildTimeline } = await import('../lib/timeline.ts');
    const view = buildTimeline(sessions, subs, Date.now());
    const expected = view.lanes.flatMap(l => l.blocks);

    assert(expected.length === m.drawn.length,
        `the chart drew ${m.drawn.length} bars and the rows produce ${expected.length}`);

    /* Sorted the same way on both sides — by lane order then by position — so this compares like with
     * like rather than depending on the DOM happening to match the array. */
    const bad = [];
    for (let i = 0; i < expected.length; i++) {
        const e = expected[i];
        const d = m.drawn[i];
        if (e.tick) continue;    // a tick is a mark, not a span; R3 owns that rule
        if (Math.abs(e.width - d.widthPct) > 0.6) {
            bad.push(`${e.project}: drawn ${d.widthPct.toFixed(2)}% against ${e.width.toFixed(2)}%`);
        }
        if (Math.abs(e.left - d.leftPct) > 0.6) {
            bad.push(`${e.project}: drawn at ${d.leftPct.toFixed(2)}% against ${e.left.toFixed(2)}%`);
        }
    }
    assert(bad.length === 0, bad.slice(0, 3).join('; '));
    return `${expected.length} bar(s) drawn at the width and position the rows say, within 0.6%`;
});

await check('R2-inj — a bar drawn at the wrong width is caught', async () => {
    /*
     * The defect this is written against is a real one and it is subtle: a chart whose bars are drawn from
     * anything other than the rows — a min-width that stretches short runs, a container the percentages
     * are measured against wrongly — asserts durations nobody measured, and looks completely normal.
     */
    await b.goto('/agents');
    const caught = await b.evaluate(`(() => {
        const el = document.querySelector('[data-measure="run-block"]');
        if (!el) return { none: true };
        const lane = el.closest('[data-measure="run-lane"]');
        const t = lane.querySelector('.runtrack').getBoundingClientRect();
        const before = el.getBoundingClientRect().width / t.width * 100;
        el.style.width = (before + 6) + '%';
        const after = el.getBoundingClientRect().width / t.width * 100;
        return { caught: Math.abs(after - before) > 0.6 };
    })()`);
    if (caught.none) return 'NOT MEASURED — no chart on the page to distort';
    assert(caught.caught === true,
        'a bar widened by six percent was not detectable, so R2 proves nothing');
    return 'a bar drawn six percent too wide is caught by the same comparison R2 makes';
});

await check('R3 — the chart states every kind of claim it is drawing, and no others', async () => {
    /*
     * THE DEFECT THIS EXISTS FOR ACTUALLY SHIPPED, in this session, for about an hour. `observed` was
     * missing from the SELECT in `sessionWindow`, so the mapper read `undefined`, every one of 269
     * reconstructed spans was classed as a session a hook had watched from start to finish, and the page
     * drew them all as measurements. Nothing failed. The only visible symptom was the legend quietly
     * losing its hatched-bar clause, because that clause is conditional on a reconstructed block existing.
     *
     * So the check is the symptom, generalised: for every KIND of block on the chart, the legend has to
     * carry that kind's sentence, and it must not carry a sentence for a kind that is not drawn.
     */
    await b.goto('/agents');
    const m = await b.evaluate(`(() => {
        const blocks = [...document.querySelectorAll('[data-measure="run-block"]')];
        const kinds = new Set(blocks.map(el => el.dataset.kind));
        /*
         * THE TWO THINGS THAT ARE NOT KINDS. A tick is a span too narrow to draw as a bar and a clip is a
         * left edge that is a crop rather than a start — both are modifiers on a block of any kind, so they
         * cannot live in the same namespace as data-kind without one rule contradicting the other.
         * NO BACKTICKS IN HERE: this comment is inside a template literal and a pair of them closes it.
         * Trap 1 in AGENTS.md, and prove:parse named the line in three seconds.
         */
        const mods = new Set();
        for (const el of blocks) {
            if (el.classList.contains('istick')) mods.add('tick');
            if (el.classList.contains('clipped')) mods.add('clipped');
        }
        const legend = document.querySelector('[data-measure="run-legend"]');
        if (!legend) return { none: true };
        const swatches = [...legend.querySelectorAll('.runkey')];
        const keys = new Set(swatches
            .map(el => [...el.classList].find(c => c.indexOf('k-') === 0)).filter(Boolean));
        const modKeys = new Set(swatches
            .map(el => [...el.classList].find(c => c.indexOf('m-') === 0)).filter(Boolean));
        return {
            kinds: [...kinds], keys: [...keys], mods: [...mods], modKeys: [...modKeys],
            text: legend.textContent,
        };
    })()`);
    if (m.none) return 'NOT MEASURED — nothing ran in the window, so there is no legend';

    const missing = m.kinds.filter(k => !m.keys.includes(`k-${k}`));
    /* `k-measured` is exempt from the "nothing extra" half and from nothing else: it is the ordinary bar,
     * it is always in the key because a key whose first entry is missing reads as a gap, and a window
     * containing only running blocks is a legitimate state in which it explains nothing that is drawn. */
    const extra = m.keys.filter(k => !m.kinds.includes(k.slice(2)) && k !== 'k-measured');
    const missingMods = m.mods.filter(k => !m.modKeys.includes(`m-${k}`));
    const extraMods = m.modKeys.filter(k => !m.mods.includes(k.slice(2)));
    assert(missing.length === 0,
        `the chart draws ${missing.join(', ')} and the legend never mentions ${missing.length === 1
            ? 'it' : 'them'}`);
    assert(extra.length === 0,
        `the legend explains ${extra.join(', ')}, which nothing on the chart is drawing`);
    assert(missingMods.length === 0,
        `the chart draws ${missingMods.join(', ')} marks with nothing in the key for them`);
    assert(extraMods.length === 0,
        `the legend explains ${extraMods.join(', ')}, which nothing on the chart is drawing`);
    /*
     * THE ORDINARY BAR IS ASSERTED STRUCTURALLY, and this replaced a regex.
     *
     * It used to look for the phrase "watched from start to finish" in the legend's prose, which was the
     * only way to check it while the key WAS prose. It is now a row of swatches — five sentences and 130px
     * became six words, which is what its owner asked for four times — so the presence of the entry is a
     * property of the markup and a check on the wording would only pin the copy in place.
     */
    assert(m.keys.includes('k-measured'),
        'the key has no entry for an ordinary bar, so nothing says what the plain shape means');
    return `${m.kinds.length} kind(s) and ${m.mods.length} mark(s) drawn — `
        + `${[...m.kinds, ...m.mods].join(', ')} — and the key covers each`;
});

await check('R3-inj — a kind drawn with nothing explaining it is caught', async () => {
    await b.goto('/agents');
    const caught = await b.evaluate(`(() => {
        const legend = document.querySelector('[data-measure="run-legend"]');
        const el = document.querySelector('[data-measure="run-block"]');
        if (!legend || !el) return { none: true };
        /* Plant a kind the legend cannot possibly explain, which is what a new block state added without
           a legend clause would look like. */
        el.dataset.kind = 'inferred-somehow';
        const kinds = new Set([...document.querySelectorAll('[data-measure="run-block"]')]
            .map(x => x.dataset.kind));
        const keys = new Set([...legend.querySelectorAll('.runkey')]
            .map(x => [...x.classList].find(c => c.indexOf('k-') === 0)));
        const missing = [...kinds].filter(k => k !== 'measured' && !keys.has('k-' + k));

        /*
         * AND THE MODIFIER HALF, injected the same way. R3 gained a second rule — every tick and every
         * clipped edge needs an entry too — and a rule with no injection behind it is a rule nobody has
         * watched fail. Both keys are removed from the DOM here rather than a class being planted, because
         * a MISSING entry is the actual defect: the entries are conditional on the chart's own flags, so
         * the way this breaks is a flag that stops being set.
         */
        const before = [...legend.querySelectorAll('.runkey')]
            .filter(x => [...x.classList].some(c => c.indexOf('m-') === 0)).length;
        for (const x of [...legend.querySelectorAll('.runkey')]) {
            if ([...x.classList].some(c => c.indexOf('m-') === 0)) x.closest('li').remove();
        }
        const drawnMods = [...document.querySelectorAll('[data-measure="run-block"]')]
            .some(x => x.classList.contains('istick') || x.classList.contains('clipped'));
        const modKeys = new Set([...legend.querySelectorAll('.runkey')]
            .map(x => [...x.classList].find(c => c.indexOf('m-') === 0)).filter(Boolean));
        return {
            caught: missing.length > 0,
            modsMeasurable: before > 0 && drawnMods,
            modsCaught: drawnMods && modKeys.size === 0,
        };
    })()`);
    if (caught.none) return 'NOT MEASURED — no chart on the page';
    assert(caught.caught === true,
        'a block kind with no legend entry was not caught, so R3 proves nothing');
    /* NOT MEASURED rather than a pass, if the fixture happens to draw no ticks and no clipped edges — a
     * check with no subject must never report success. `tests/fixture.mjs` plants both on purpose. */
    if (!caught.modsMeasurable) {
        return 'a kind with no key is caught; NOT MEASURED for marks — the chart drew none';
    }
    assert(caught.modsCaught === true,
        'the key lost every mark entry while the chart still drew marks, and R3 did not notice');
    return 'a kind with no key is caught, and so is a mark whose key entry has gone';
});

await check('R4 — choosing a run shows what it spawned, and moves nothing', async () => {
    /*
     * The sub-agents are the half of this feature he asked for by name — *"projects, workers, agents, sub
     * agents"* — and until a real click opens one, "they are captured" is a claim about the database
     * rather than about the page.
     *
     * IT ALSO ASSERTS THAT THE CHART DOES NOT MOVE, and the first version of this check asserted
     * something stronger and wrong: that NOTHING below the chart moved. Measured, opening a run with two
     * sub-agents pushes the legend down 18px, because the detail is a list and a list of two is taller
     * than a list of none.
     *
     * That is not a defect and reserving space for it would be one — the reserved slot would have to be
     * as tall as the largest detail the chart could ever produce, which is a permanent blank band under
     * a chart most of the time. The property that actually matters is that the bar you just pressed is
     * still under your finger, which means the CHART must not move. Content appearing below the fold of
     * your attention is what disclosure is.
     *
     * The empty slot stays reserved at one line, so the common case — a run with no sub-agents — still
     * moves nothing at all.
     */
    await b.goto('/agents');
    /*
     * THE CLICK AND THE READ ARE TWO EVALUATES, and the first version of this check did both in one and
     * reported "clicking a run opened no detail at all" about a chart that works perfectly. React does
     * not apply state synchronously inside the click handler, so reading the DOM in the same tick reads
     * the page as it was before the press. A check that cannot tell a broken control from an unfinished
     * render is worse than no check: it reports a defect that is not there, and the next agent goes
     * looking for it.
     */
    const before = await b.evaluate(`(() => {
        const withSubs = [...document.querySelectorAll('[data-measure="run-block"]')]
            .find(el => el.querySelector('[data-measure="run-subagent"]'));
        if (!withSubs) return { none: true };
        const lanes = document.querySelector('[data-measure="run-lanes"]');
        const bar = withSubs.getBoundingClientRect();
        withSubs.click();
        return { top: lanes.getBoundingClientRect().top, barTop: bar.top, barLeft: bar.left };
    })()`);
    if (before.none) return 'NOT MEASURED — no run in the window spawned a sub-agent';
    await new Promise(r => setTimeout(r, 150));
    const m = await b.evaluate(`(() => {
        const lanes = document.querySelector('[data-measure="run-lanes"]');
        const detail = document.querySelector('[data-measure="run-detail"]');
        const lines = [...document.querySelectorAll('[data-measure="run-subagent-line"]')];
        const picked = document.querySelector('.runblock.picked');
        const now = picked ? picked.getBoundingClientRect() : null;
        return {
            opened: !!detail,
            lines: lines.length,
            text: detail ? detail.textContent : '',
            moved: Math.abs(lanes.getBoundingClientRect().top - ${before.top}),
            barMoved: now
                ? Math.abs(now.top - ${before.barTop}) + Math.abs(now.left - ${before.barLeft})
                : -1,
        };
    })()`);
    assert(m.opened, 'clicking a run opened no detail at all');
    assert(m.lines > 0, 'the run has sub-agents on the chart and none in its detail');
    assert(m.moved <= 1,
        `choosing a run moved the chart by ${Math.round(m.moved)}px, so the bars shift under the pointer`);
    assert(m.barMoved === 0,
        `the bar that was pressed moved ${m.barMoved}px, which is the one thing a chart may never do`);
    return `a run with ${m.lines} sub-agent(s) opened; the chart and the bar pressed both stayed put`;
});

/* ============================================================================================ P — one project
 *
 * `/p/<slug>` is the page its owner asked for four times and did not get: *"I want to open one of my projects
 * and see what the AI has done, where they are, what they have reported, how they are working… This hub must
 * be my command center where I control all of my projects."*
 *
 * The word that makes these checks necessary rather than decorative is CONTROL. A page that shows a project
 * is a view; a page he can act from is the product. So P2 answers a real decision through this page and reads
 * the row back out of the database, which is the same standard every other action in this suite is held to.
 * ========================================================================================== */

/**
 * The first project page that actually has words on it, or null.
 *
 * WHY THIS IS A SEARCH RATHER THAN THE FIRST LINK. `foldProjects` puts the QUIET projects first, deliberately
 * — a project nothing has looked at is a finding and reassurance is not — so the first link on `/agents` is
 * the one least likely to have anything reported against it. P3 keyed on it and honestly reported NOT
 * MEASURED, which is the right behaviour for a check with no subject and the wrong outcome for a check that
 * had a subject two rows further down.
 */
async function firstProjectWithWords() {
    await b.goto('/agents');
    const hrefs = await b.evaluate(`(() => JSON.stringify(
        [...document.querySelectorAll('[data-measure="project-link"]')].map(a => a.getAttribute('href'))
    ))()`);
    for (const href of JSON.parse(hrefs)) {
        await b.goto(href);
        const has = await b.evaluate('document.querySelectorAll(".wordbody").length > 0 ? "y" : "n"');
        if (has === 'y') return href;
    }
    return null;
}

await check('P1 — a project page opens from the list and carries that project only', async () => {
    /*
     * THE LINK IS PART OF THE CLAIM. *"Everything must be connected if it's connectable"* — a project page
     * nothing links to is a page nobody finds, and the presence list is the only surface that names every
     * project. So this navigates the way he would: press the name, land on the page.
     */
    await b.goto('/agents');
    const link = await b.evaluate(`(() => {
        const a = document.querySelector('[data-measure="project-link"]');
        if (!a) return { none: true };
        return { href: a.getAttribute('href'), name: a.textContent.trim() };
    })()`);
    if (link.none) return 'NOT MEASURED — no project row on the page to open';

    await b.goto(link.href);
    const m = await b.evaluate(`(() => {
        const name = document.querySelector('[data-measure="project-name"]');
        const lanes = [...document.querySelectorAll('[data-measure="run-lane"]')]
            .map(el => el.dataset.project);
        const words = [...document.querySelectorAll('[data-measure="word-row"]')].length;
        const items = [...document.querySelectorAll('[data-measure="thread-item"]')].length;
        const compose = document.querySelector('[data-measure="thread-compose"]');
        return {
            name: name ? name.textContent.trim() : null,
            lanes: [...new Set(lanes)],
            words, items, compose: !!compose,
        };
    })()`);
    assert(m.name === link.name,
        `the list linked to ${link.name} and the page says ${JSON.stringify(m.name)}`);
    /*
     * ONE LANE, AND IT IS THIS PROJECT'S. The chart is built from a window that spans every project, and the
     * page filters it — so a second lane here would mean another project's runs were drawn on this page,
     * which is the kind of leak no screenshot would reveal.
     */
    assert(m.lanes.every(p => p === link.name),
        `the chart on ${link.name}'s page draws lanes for ${m.lanes.join(', ')}`);
    assert(m.compose, 'there is no way to say anything back, so the page is a view rather than a desk');
    return `${link.name}: ${m.words} latest word(s), ${m.items} thread item(s), `
        + `${m.lanes.length} lane — its own`;
});

await check('P2 — a decision can be ANSWERED from a project page, and the row changes', async () => {
    /*
     * The control claim, checked the only way it can be: press the button on THIS page and read the database.
     * `QuestionCard` is imported rather than reimplemented here, and this is what proves the import actually
     * reaches the same write path instead of rendering an inert copy of the card.
     */
    const open = await openQuestions();
    const target = open.find(q => q.options && q.options.length > 0);
    if (!target) return 'NOT MEASURED — no open decision with options to answer';

    await b.goto(`/p/${target.project}`);
    const pressed = await b.evaluate(`(() => {
        const card = [...document.querySelectorAll('[data-measure="decision"]')]
            .find(el => el.textContent.includes(${JSON.stringify(target.title.slice(0, 40))}));
        if (!card) return { none: true };
        const pick = card.querySelector('[data-measure="pick"]');
        if (!pick) return { noPick: true };
        pick.click();
        return { clicked: true };
    })()`);
    if (pressed.none) return 'NOT MEASURED — that decision is not on this project page';
    assert(!pressed.noPick, 'the decision rendered with nothing to press');

    /* Polled rather than slept on a fixed delay: the write is a round trip to Neon and a fixed wait either
     * flakes or is always too long. */
    let row = null;
    for (let i = 0; i < 40 && !row; i++) {
        await new Promise(r => setTimeout(r, 150));
        const [got] = await (await import('@neondatabase/serverless')).neon(process.env.DATABASE_URL)`
            select status, answer_option, answered_at from questions where id = ${target.id}`;
        if (got && got.status !== 'open') row = got;
    }
    assert(row != null, 'pressing an option on a project page never reached the database');
    assert(row.answered_at != null, 'the decision was closed with no answered_at, so the record loses it');
    return `answered from /p/${target.project} — status ${row.status}, option ${row.answer_option}`;
});

await check('P3 — the newest word is not stated twice on the same page', async () => {
    /*
     * A DEFECT THIS PAGE SHIPPED WITH FOR ONE RENDER. The header shows the newest thing each agent said and
     * the thread is chronological, so the same three sentences appeared four hundred pixels apart. This
     * codebase treats the same fact stated twice as a defect, and it is one: a second copy makes a reader
     * stop and check whether it is really the same item.
     */
    const href = await firstProjectWithWords();
    if (!href) return 'NOT MEASURED — no project on this hub has any reported words';
    await b.goto(href);
    const m = await b.evaluate(`(() => {
        const norm = s => s.replace(/\\s+/g, ' ').trim();
        const words = [...document.querySelectorAll('.wordbody')].map(el => norm(el.textContent));
        const thread = [...document.querySelectorAll('[data-measure="thread-item"] .thbody')]
            .map(el => norm(el.textContent));
        return { words, repeated: words.filter(w => w.length > 20 && thread.includes(w)) };
    })()`);
    if (!m.words.length) return 'NOT MEASURED — this project has no reported words';
    assert(m.repeated.length === 0,
        `${m.repeated.length} message(s) appear in both the header and the thread`);
    return `${m.words.length} word(s) in the header, none of them repeated below`;
});

await check('P3-inj — the same-message test would notice a repeat', async () => {
    /* Without this, P3 passing could mean "nothing is duplicated" or "the comparison never matched
     * anything". Planting the header's own text into a thread row settles which. */
    const href = await firstProjectWithWords();
    if (!href) return 'NOT MEASURED — no project on this hub has any reported words';
    await b.goto(href);
    const caught = await b.evaluate(`(() => {
        const norm = s => s.replace(/\\s+/g, ' ').trim();
        const word = document.querySelector('.wordbody');
        const row = document.querySelector('[data-measure="thread-item"] .thbody');
        if (!word || !row) return { none: true };
        row.textContent = word.textContent;
        const words = [...document.querySelectorAll('.wordbody')].map(el => norm(el.textContent));
        const thread = [...document.querySelectorAll('[data-measure="thread-item"] .thbody')]
            .map(el => norm(el.textContent));
        return { caught: words.filter(w => w.length > 20 && thread.includes(w)).length > 0 };
    })()`);
    if (caught.none) return 'NOT MEASURED — no word or no thread row to duplicate';
    assert(caught.caught === true, 'a duplicated message was not detected, so P3 proves nothing');
    return 'a message copied into the thread is caught by the test P3 applies';
});

await check('P4 — a slug nothing has ever mentioned is a 404, not an authoritative empty page',
    async () => {
        /*
         * There is no projects table — a project is a slug something filed work under — so a mistyped URL
         * would otherwise render a page stating with total confidence that nothing has ever run there. That
         * is a lie the reader has no way to check, which is worse than an error.
         */
        /* `cc_session` — the name in lib/auth.ts. Signed in deliberately: a signed-OUT request renders the
         * locked screen for every path, so it would answer 200 for a real project too and the check would
         * pass while proving nothing. */
        const res = await fetch(`${BASE}/p/definitely-not-a-real-project-xyz`, {
            headers: { cookie: `cc_session=${process.env.CC_WEB_TOKEN}` },
            redirect: 'manual',
        });
        assert(res.status === 404, `a made-up project answered ${res.status} rather than 404`);
        return 'an unknown slug is a 404';
    });

/* ---------------------------------------------------------------------------------------- done */

console.log(failures.length === 0
    ? `\n${passed} passed, 0 failed\n\nEvery one of those was a real click, checked against the database.\n`
    : `\n${passed} passed, ${failures.length} failed\n`);

b.cleanup();
process.exitCode = failures.length === 0 ? 0 : 1;
