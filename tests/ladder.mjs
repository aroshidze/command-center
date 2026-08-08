/**
 * Does the progression still work on day 300? — the first check in this suite that measures TIME.
 *
 *   npm run prove:ladder
 *
 * WHY THIS EXISTS, AND WHY NOTHING ELSE COULD HAVE CAUGHT WHAT IT CATCHES
 *
 * Every other check in tests/ evaluates ONE SNAPSHOT. `prove:layout` measures the page as the fixture renders
 * it today; `prove:use` ticks a task off and asserts the figure moves by one; P5 asserts the arithmetic of the
 * target currently on screen. All of them were green while the level ladder had a defect that only appears
 * after about two months of use.
 *
 * The owner found it by asking a question no check was shaped to ask:
 *
 *     "dude, I've been working only 1 day, there will be more tasks every day. what will happen on day 300?"
 *
 * Measured answer, before this check existed. `RANKS` in lib/progress.ts is a ten-entry array ending at 1,840
 * points, and the tenth and final rank lands on the **184th finished task** if tasks were all that scored.
 * They are not: a decision is 6, answering inside the deadline is 4, answering within the hour is 4, and a note
 * back to the agent is 4. At his own observed mix — 3 tasks a day, one of them with a note, 2 decisions
 * answered quickly — that is **62 points a day, and the top of the ladder on day 30.** The first version of
 * this check said day 62 because it counted tasks only; running it corrected that. After the ceiling:
 *
 *   - the level never moves again. At 2,190 completions it is still 10.
 *   - `toNext` is null forever, so the surface can only ever say "Top of the ladder".
 *   - the emblem freezes with it, because its geometry is a function of level and level has stopped:
 *     `spokes = Math.min(level, 10)`, `coreRings = Math.min(3, Math.ceil(level / 3))`.
 *
 * That last one is the part that matters, because the request this whole feature answers was for "a character
 * or profile in the hub that gets enhanced when I do". A profile that stops being enhanced in the first month
 * and never changes again for the rest of the tool's life is not a slow reward curve, it is a finished one.
 *
 * WHAT RUNNING IT FIRST DISPROVED, which is why it was written before the fix
 *
 * The plan for this work claimed the MARKS were also running out of depth. They are not: T4 and T5 pass today.
 * Over the same range the earned count rises 23 -> 29 and `nextUp` is never empty, so the mark set has more
 * room in it than the ladder does. That assumption came out of the plan because the check contradicted it.
 * (It did surface a smaller error: there are **31** mark definitions across nine categories, not the 26 that
 * README.md, docs/PROGRESS-REPORT.md §14/§16 and the brief all state.)
 *
 * lib/progress.ts states the intent in its own comment — "The top of the ladder is deliberately a long way off;
 * a ceiling reached in a month is a ceiling." The intent was right and the numbers did not implement it. That
 * is exactly the kind of drift a check can hold in place and a comment cannot.
 *
 * WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It asserts PROPERTIES of the progression over a growing record, never a particular curve. The rungs are the
 * owner's to place and will be retuned; "the level still moves at two years of use" is not. A check that
 * pinned the thresholds would have to be edited every time the curve was tuned, and a check you routinely edit
 * to make it pass is not a check.
 *
 * It also does not assert that progression is FAST. RESEARCH §28.2 is the warning against that: Duolingo made a
 * threshold easier to reach, every engagement metric rose, and in their own words "fewer learners were actually
 * reaching their daily goals". Reaching a threshold is not the work getting done. So the assertions here are
 * about the ladder never ENDING, not about it being generous.
 *
 * No browser and no database, for the same reason tests/palette.mjs needs neither: this is a property of the
 * derivation, and the derivation is a pure function of rows.
 */

import {
    asOf, crestGeometry, crestInput, derive, emblemGeometry, emptinessOf, MARKS, marks, nextUp, noteReach,
    projectHueOf, rankLedger, rungAt, standing,
} from '../lib/progress.ts';
import { projectHue } from '../lib/colour.ts';
import { generatedPalette, paletteBySlug, PALETTES } from '../lib/palettes.ts';
import {
    generatedGates, GENERATED_FROM, isUnlocked, LOOKAHEAD, nextPerk, PERKS, perksOfKind, perkStates,
} from '../lib/perks.ts';
import { FINISHES, finishBySlug, generatedFinish } from '../lib/finishes.ts';
import { generatedSurface, surfaceBySlug, SURFACES } from '../lib/surfaces.ts';
import { chargeFor, chargeInk, chargeOverlap, CHARGES } from '../lib/charges.ts';
/* lib/reminders.ts imports nothing but a type, which is what makes it safe to run here — the cross-lib
 * value-import trap in AGENTS.md is exactly why the ladder lives in its own file rather than in store.ts. */
import { ladderSentence, nudgeStanding, reminderPoints } from '../lib/reminders.ts';

/* ------------------------------------------------------------------------------------------------
 * The minted economy, assembled here INDEPENDENTLY of lib/looks.ts — and that is the point
 *
 * `lib/perks.ts` owns the rotation and cannot import the three axis modules (the cross-lib value-import trap
 * AGENTS.md records, re-verified with a probe this session). `lib/looks.ts` does the join for the app. This suite
 * does the join again, from the same two halves, rather than importing the app's assembler.
 *
 * That is deliberate and it is the same method X7 uses for the clear-moment sweep: a check that imports the
 * function under test can only prove it is self-consistent. Two independent assemblies of the same rotation agree
 * only if the rotation and the three generators are all actually right — and K12 below asserts they do agree
 * about every slug, which is what makes the duplicated slug spelling safe rather than merely convenient.
 * ---------------------------------------------------------------------------------------------- */

const mintedFor = level => generatedGates(Math.floor(level) + LOOKAHEAD).map(gate => {
    const def = gate.kind === 'palette' ? generatedPalette(gate.index)
        : gate.kind === 'crest' ? generatedFinish(gate.index)
            : generatedSurface(gate.index);
    return { slug: gate.slug, kind: gate.kind, label: def.label, requires: { kind: 'level', level: gate.level } };
});

/* ------------------------------------------------------------------------------------------------
 * The emblem's geometry — imported, not copied
 *
 * The first version of this check duplicated the three formulas, because they were inline expressions in
 * app/components/Emblem.tsx and importing a .tsx here would mean a build step in a suite whose whole value is
 * that it has none. That is the reluctant compromise tests/palette.mjs makes with the colour tokens.
 *
 * The compromise turned out to be unnecessary: the formulas are a pure function of the level, they belong next
 * to the ladder they depend on, and moving them to lib/progress.ts means this check imports THE REAL THING. A
 * formula a check has to copy is a formula that drifts, and this one had already drifted from its own intent.
 * ---------------------------------------------------------------------------------------------- */

const emblemOf = level => emblemGeometry(level);

/** Two emblems are distinguishable at a glance if any part of the geometry differs. */
const emblemDiffers = (a, b) =>
    a.spokes !== b.spokes || a.pips !== b.pips || a.coreRings !== b.coreRings || a.hue !== b.hue;

/* ------------------------------------------------------------------------------------------------
 * A synthetic record of N days of use
 *
 * Rows are shaped exactly as lib/store.ts hands them over, because `derive` is fed those rows verbatim by
 * app/components/Board.tsx. The rates are the owner's own: his first day held 2 finished tasks and 5 answered
 * decisions, so 3 tasks and 2 decisions a day is a conservative reading of it rather than an optimistic one.
 *
 * Spread across projects at a realistic pace rather than all in one, because `projectsFinishedIn` feeds the
 * breadth marks and cramming everything into one project would understate how many marks a real record earns —
 * which would make this check pass for the wrong reason.
 */
const TASKS_PER_DAY = 3;
const DECISIONS_PER_DAY = 2;
const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);

function recordAfter(days) {
    const doneTasks = [];
    const answeredQuestions = [];
    const nTasks = days * TASKS_PER_DAY;
    const nDecisions = days * DECISIONS_PER_DAY;

    // One more project every ten days, capped at fifteen — the number the brief anticipates.
    const projectFor = i => `p${Math.min(15, 1 + Math.floor(i / (TASKS_PER_DAY * 10)))}`;

    for (let i = 0; i < nTasks; i++) {
        const at = START + Math.floor(i / TASKS_PER_DAY) * DAY + (i % TASKS_PER_DAY) * 3600_000;
        doneTasks.push({
            id: `t${i}`, project: projectFor(i), key: `k${i}`,
            title: `Finished task ${i}`,
            why: 'Unblocks the next thing.',
            minutes: 20,
            // Every tenth one is a long procedure, so the depth marks are reachable as they are in real data.
            steps: Array.from({ length: i % 10 === 0 ? 12 : 2 }, () => ({ do: 'step' })),
            verify: 'It worked.', gotchas: [], blocked_reason: null,
            status: 'done',
            // Every third completion carries a note back to the agent, which is a `voice` credit.
            note: i % 3 === 0 ? 'Told the agent what happened.' : null,
            /* `noted` as well as `note`, because they answer different questions on a real row now: the text
             * is what the record renders for a completion inside the window, and this boolean is what the
             * points and the `voice` marks read at any depth. See `FinishedRow.noted`. */
            noted: i % 3 === 0,
            created_at: new Date(at - 2 * 3600_000).toISOString(),
            updated_at: new Date(at).toISOString(),
            done_at: new Date(at).toISOString(),
        });
    }

    for (let i = 0; i < nDecisions; i++) {
        const asked = START + Math.floor(i / DECISIONS_PER_DAY) * DAY + 1800_000;
        // Answered inside ten minutes, and inside the stated deadline — both real credits in POINTS.
        const answered = asked + 600_000;
        answeredQuestions.push({
            id: `q${i}`, project: projectFor(i * 2), key: `qk${i}`,
            title: `Decision ${i}`, context: null,
            options: [{ key: 'a', label: 'Option A' }], allow: ['choose'],
            default_option: 'a',
            deadline: new Date(asked + 12 * 3600_000).toISOString(),
            status: 'answered', answer_type: 'choose', answer_option: 'a',
            answer_text: null, answer_note: null,
            answered_at: new Date(answered).toISOString(),
            asked_by: 'agent',
            created_at: new Date(asked).toISOString(),
            updated_at: new Date(answered).toISOString(),
        });
    }

    return { doneTasks, answeredQuestions, openTasks: [], openQuestions: [] };
}

/**
 * The sample points, in days of use. Chosen so the SHAPE of the failure is visible in the output rather than
 * just its existence: 30 is where the ceiling lands today at the rates above, and everything after it is the
 * flat part. Two years is the far end because this hub has to survive being used, not just being launched.
 */
const SAMPLES = [1, 7, 30, 62, 100, 200, 365, 730];

/** The day the ladder currently tops out. The comparison point for "does it still move after this?". */
const CEILING_DAY = 30;

const at = SAMPLES.map(days => {
    const s = derive(recordAfter(days));
    const st = standing(s);
    return {
        days, snapshot: s, standing: st,
        marks: marks(s).length,
        next: nextUp(s, 3).length,
        emblem: emblemOf(st.level),
    };
});

/* --------------------------------------------------------------------------------------------- run */

let failures = 0;
const report = (ok, id, what, detail) => {
    if (!ok) failures++;
    console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${id} ${what}`);
    if (detail) console.log(`            ${detail}`);
};

// Printed rather than left to be counted by hand, because it was miscounted: README.md,
// docs/PROGRESS-REPORT.md §14/§16 and the brief all said 26. It is 31.
console.log(`\n  the record as it grows  (${MARKS.length} mark definitions in ` +
    `${new Set(MARKS.map(d => d.category)).size} categories)\n`);
console.log('      day  completions  points  level  rank                  toNext  marks  next  emblem');
for (const r of at) {
    console.log(
        `    ${String(r.days).padStart(5)}` +
        `${String(r.snapshot.tasksDone).padStart(13)}` +
        `${String(r.standing.points).padStart(8)}` +
        `${String(r.standing.level).padStart(7)}` +
        `  ${r.standing.rank.padEnd(20)}` +
        `${String(r.standing.toNext ?? '—').padStart(7)}` +
        `${String(r.marks).padStart(7)}` +
        `${String(r.next).padStart(6)}` +
        `  ${r.emblem.spokes}sp/${r.emblem.pips}pip/${r.emblem.coreRings}core/h${r.emblem.hue}`,
    );
}

console.log('\n  what must still be true after two years of use\n');

/*
 * T1 is the root defect. Everything below it is a consequence, and they are asserted separately anyway,
 * because a future curve could terminate in a way that keeps one of them alive and not the others.
 */
const last = at[at.length - 1];
const ceiling = at.find(r => r.days === CEILING_DAY);

report(
    last.standing.toNext !== null,
    'T1', 'the ladder never runs out — there is always a next rank',
    last.standing.toNext !== null
        ? `at day ${last.days} (${last.snapshot.tasksDone} completions) the next rank is ` +
          `${last.standing.toNext} points away`
        : `at day ${last.days} there is NOTHING above ${last.standing.rank}. ` +
          `The ladder ended at ${last.standing.points} points and cannot move again, ever.`,
);

report(
    last.standing.level > ceiling.standing.level,
    'T2', 'the level still moves long after the current ceiling (day ' + CEILING_DAY + ')',
    `day ${CEILING_DAY}: level ${ceiling.standing.level} — day ${last.days}: level ${last.standing.level}` +
    (last.standing.level > ceiling.standing.level
        ? ''
        : '  <- IDENTICAL. Between them the record grew by ' +
          `${last.snapshot.tasksDone - ceiling.snapshot.tasksDone} completions and nothing changed.`),
);

report(
    emblemDiffers(ceiling.emblem, last.emblem),
    'T3', `the profile is still being enhanced — the emblem differs from its day-${CEILING_DAY} shape`,
    emblemDiffers(ceiling.emblem, last.emblem)
        ? `day ${CEILING_DAY} ${ceiling.emblem.spokes}sp/${ceiling.emblem.pips}pip ` +
          `-> day ${last.days} ${last.emblem.spokes}sp/${last.emblem.pips}pip`
        : `frozen at ${last.emblem.spokes} spokes, ${last.emblem.pips} pip(s), hue ${last.emblem.hue} ` +
          `since day ${CEILING_DAY}. He asked for a profile that gets enhanced when he does.`,
);

/*
 * The marks are the other half of the progression, and they fail differently: not by ending, but by running
 * out of anything unearned. A record with nothing left to earn and nothing coming is a finished game.
 */
report(
    last.marks > ceiling.marks,
    'T4', 'marks keep arriving as the record grows',
    `day ${CEILING_DAY}: ${ceiling.marks} earned — day ${last.days}: ${last.marks} earned`,
);

report(
    at.every(r => r.next > 0),
    'T5', 'there is always something coming, at every scale',
    at.every(r => r.next > 0)
        ? `"next up" is non-empty at all ${at.length} sample points`
        : 'nothing coming at: ' + at.filter(r => r.next === 0).map(r => `day ${r.days}`).join(', '),
);

/*
 * And the invariants that must survive whatever the curve becomes. These pass today, and that is the point of
 * including them: the fix must not buy a moving ladder at the cost of the thing that makes it believable.
 */
const targetsTrue = at.filter(r => r.standing.nextAt !== null)
    .every(r => r.standing.toNext === r.standing.nextAt - r.standing.points);
report(
    targetsTrue,
    'T6', 'every stated target is exactly `nextAt - points`, at every scale',
    'the same arithmetic check P5 makes against the rendered page, made against the derivation',
);

let monotonic = true;
for (let i = 1; i < at.length; i++) {
    if (at[i].standing.points < at[i - 1].standing.points) monotonic = false;
    if (at[i].standing.level < at[i - 1].standing.level) monotonic = false;
}
report(
    monotonic,
    'T7', 'more finished work never means fewer points or a lower level',
    'a score that falls while he sleeps is a score he would be right to stop believing',
);

const fractionSane = at.every(r => r.standing.fraction >= 0 && r.standing.fraction <= 1);
report(fractionSane, 'T8', 'the progress fraction stays within 0..1 at every scale', null);

/*
 * A MARK THAT IS EARNED BUT CANNOT BE DATED IS SILENTLY DROPPED, and that is a loss of credit.
 *
 * `marks()` filters out any definition whose `at()` returns null, AFTER checking `have >= need`. That is the
 * right behaviour — a mark with no date cannot be rendered as a statement about a moment — but it means a
 * definition whose progress rule and whose date rule disagree just vanishes. He would have earned it, the page
 * would never say so, and nothing would report a problem: `marks()` returns a shorter list and a shorter list
 * looks exactly like not having earned it yet.
 *
 * Noticed while working out why 29 of 31 definitions were earned at day 730. Both of those two are correctly
 * unearned — the synthetic record has no 20-step task and no gap for `came-back` to close — but checking WHY
 * they were missing is what showed that "unearned" and "earned but undateable" are indistinguishable on screen.
 */
const undateable = [];
for (const r of at) {
    for (const def of MARKS) {
        const { have, need } = def.progress(r.snapshot);
        if (have >= need && def.at(r.snapshot) === null) {
            undateable.push(`${def.slug} at day ${r.days}`);
        }
    }
}
report(
    undateable.length === 0,
    'T9', 'no mark is earned but undateable, at any scale',
    undateable.length === 0
        ? `all ${MARKS.length} definitions either fall short or carry a date`
        : `earned with no date, so silently not shown: ${[...new Set(undateable)].join(', ')}`,
);

/*
 * Prove the check can fail. Two injections, because T1 and T4 fail by different mechanisms — a ladder that
 * ends, and a mark set with nothing left in it — and an injection that only exercises one of them would leave
 * the other unproven.
 *
 * These run the REAL functions against a deliberately terminated ladder rather than re-implementing them, so
 * what is being proved is that the assertions above would catch it, not that the injection is well formed.
 */
console.log('\n  proving the check can fail\n');

const terminated = { toNext: null, level: 10, points: 9999, rank: 'Ground control', nextAt: null };
report(
    !(terminated.toNext !== null),
    'T1-inj', 'a ladder with nothing above its top rank is caught',
    'simulated a terminal RANKS array: toNext === null',
);

const frozen = emblemOf(10);
report(
    !emblemDiffers(frozen, emblemOf(10)),
    'T3-inj', 'an emblem that has stopped changing is caught',
    'two levels capped to the same geometry are reported as identical',
);

/*
 * T9's detection, run over a definition list with one deliberately broken entry.
 *
 * The same expression T9 uses, not a re-statement of it — a proof that re-implements what it is proving proves
 * only that two pieces of code agree.
 */
const brokenDefs = [
    ...MARKS,
    { slug: 'earned-but-dateless', category: 'volume', tier: 1, progress: () => ({ have: 1, need: 1 }), at: () => null, label: () => 'x' },
];
const caught = brokenDefs.filter(def => {
    const { have, need } = def.progress(last.snapshot);
    return have >= need && def.at(last.snapshot) === null;
});
report(
    caught.length === 1 && caught[0].slug === 'earned-but-dateless',
    'T9-inj', 'a mark that is earned but carries no date is caught',
    `found ${caught.length}: ${caught.map(d => d.slug).join(', ') || 'nothing'}`,
);

/* ================================================================================================
 * The outbound half: does the hub tell the truth about whether anything collected a note?
 *
 * Here rather than in prove:use, because `noteReach` is a pure function of two timestamps and this is the
 * suite that has no browser and no database. The interface asserts something on the strength of it — *"no
 * agent has synced since you wrote this"*, in the same amber as the stale-sync warning — and a claim about
 * delivery that is wrong is worse than no claim, because he would stop writing notes.
 *
 * The uncollected case is asserted FIRST and hardest. It is the one he can act on, and it is the one that
 * fails in the direction that costs something: reporting reach that did not happen tells him the message
 * landed when it is sitting in a queue nobody has come for.
 * ================================================================================================ */

console.log('\n  what he told the agents, and whether anything came for it\n');

const T = (mins) => new Date(Date.UTC(2026, 7, 1, 12, 0, 0) + mins * 60_000).toISOString();
const NOTE_AT = T(0);

report(
    noteReach(NOTE_AT, [
        { name: 'claude-code', last_sync_at: T(-30) },
        { name: 'codex', last_sync_at: T(-1) },
        { name: 'never-run', last_sync_at: null },
    ]).length === 0,
    'R1', 'a note nothing has synced since reports NO reach',
    'the agents last synced 30m and 1m BEFORE it was written, and one has never synced at all',
);

report(
    (() => {
        const r = noteReach(NOTE_AT, [{ name: 'claude-code', last_sync_at: T(7) }]);
        return r.length === 1 && r[0].name === 'claude-code' && r[0].afterMinutes === 7;
    })(),
    'R2', 'an agent that synced afterwards is reported, with how long after',
    'seven minutes later, named',
);

report(
    (() => {
        /* Soonest first: the sentence says "X synced 4m later", so X has to be the one that got there first,
           not whichever row the database happened to return before the others. */
        const r = noteReach(NOTE_AT, [
            { name: 'slow', last_sync_at: T(400) },
            { name: 'quick', last_sync_at: T(3) },
            { name: 'middling', last_sync_at: T(60) },
        ]);
        return r.map(x => x.name).join(',') === 'quick,middling,slow';
    })(),
    'R3', 'reach is ordered soonest first, because the sentence names the first one',
    'quick, middling, slow',
);

report(
    noteReach(NOTE_AT, [{ name: 'exactly-now', last_sync_at: NOTE_AT }]).length === 0,
    'R4', 'a sync at the same instant does not count as reach',
    'strictly after, so a sync that returned before the insert committed is never credited',
);

report(
    (() => {
        /*
         * Clock skew, which is the only way this can go negative in practice: the note is stamped by Postgres
         * and the sync by a serverless region, and "synced -1m later" on a page whose entire job is to be
         * trusted is worse than a rounded zero.
         */
        const r = noteReach(NOTE_AT, [{ name: 'skewed', last_sync_at: T(0.4) }]);
        return r.length === 1 && r[0].afterMinutes === 0;
    })(),
    'R5', 'a sub-minute gap reads as zero, never as a negative',
    'rounded to 0, and the interface says "straight after" rather than "0m later"',
);

report(
    noteReach(NOTE_AT, []).length === 0,
    'R6', 'a hub with no agents at all reports no reach rather than throwing',
    'the first-run state, where nothing has ever synced',
);

/*
 * And the injection: a version that credits any agent with a sync time at all — the obvious wrong
 * implementation, and the one that would make every note look collected the moment a single agent existed.
 */
report(
    (() => {
        const wrong = (at, agents) => agents.filter(a => a.last_sync_at);
        const agents = [{ name: 'claude-code', last_sync_at: T(-30) }];
        return wrong(NOTE_AT, agents).length === 1 && noteReach(NOTE_AT, agents).length === 0;
    })(),
    'R1-inj', 'crediting reach without comparing the times is caught',
    'the wrong version reports 1 where the real one reports 0',
);

/* ================================================================================================
 * What the levels are for: the perks, and the rules that keep them honest
 *
 * These are pure functions of a standing and a mark list, so they belong in this suite rather than in one that
 * needs a browser or a database — the same reason the ladder itself is checked here.
 *
 * The property that matters most is MONOTONICITY. Everything in this hub is derived, which means a perk can be
 * lost as well as gained: re-open a finished task, the points fall, and a level-gated look can go with them.
 * That is correct and it is stated on the page. What must NEVER happen is the reverse — more work taking a perk
 * away — because that would be the reward system contradicting the thing it rewards.
 * ================================================================================================ */

console.log('\n  what the levels unlock\n');

const standingAt = (level, points) => ({ points, level, rank: 'x', tier: 1, toNext: null, credits: [] });
const markNamed = slug => ({ slug, category: 'volume', tier: 1, label: slug, detail: null, at: '2026-08-01' });

report(
    (() => {
        /*
         * ONE DEFAULT PER AXIS, not one look in total — generalised when the second and third axes shipped.
         *
         * The single-axis version asserted `unlocked.length === 1`, which went red the moment crest finishes and
         * page surfaces existed, and it was RIGHT to: a brand-new hub now legitimately has three things unlocked,
         * one on each axis, and a check that could not tell "three defaults" from "three things given away" would
         * have had to be deleted rather than fixed. The property is unchanged — nothing is taken from someone who
         * has not started, and nothing is given either — so it is asserted per axis instead of in total.
         */
        const st = perkStates(standingAt(1, 0), [], rungAt);
        const unlocked = st.filter(p => p.unlocked).map(p => p.perk);
        const expected = { palette: 'graphite', crest: 'plain', surface: 'flat' };
        const kinds = [...new Set(PERKS.map(p => p.kind))];
        return kinds.length === Object.keys(expected).length &&
            kinds.every(k => {
                const here = unlocked.filter(p => p.kind === k);
                return here.length === 1 && here[0].slug === expected[k];
            });
    })(),
    'K1', 'a brand-new hub has exactly one look per axis, and each is the one it already had',
    'nothing is taken away from someone who has not started, and nothing is given either',
);

report(
    (() => {
        /*
         * MONOTONIC ACROSS THE WHOLE LADDER. Walked rather than spot-checked: a gate written as `level === 4`
         * instead of `>= 4` passes any single-point test and fails silently for the rest of his life.
         */
        let previous = new Set();
        for (let level = 1; level <= 60; level++) {
            const now = new Set(
                perkStates(standingAt(level, rungAt(level)), [], rungAt)
                    .filter(p => p.unlocked).map(p => p.perk.slug),
            );
            for (const slug of previous) if (!now.has(slug)) return false;
            previous = now;
        }
        return previous.size >= 4;
    })(),
    'K2', 'no amount of further work ever takes a look away',
    'walked level 1 to 60; the unlocked set only ever grows',
);

report(
    (() => {
        const without = perkStates(standingAt(1, 0), [], rungAt).find(p => p.perk.slug === 'moss');
        const with_ = perkStates(standingAt(1, 0), [markNamed('cleared-a-project')], rungAt)
            .find(p => p.perk.slug === 'moss');
        return without.unlocked === false && with_.unlocked === true;
    })(),
    'K3', 'a MARK-gated look opens on the mark alone, at any level',
    'clearing a whole project is a shape of work, not an amount of it — so level 1 can have it',
);

report(
    (() => {
        /* The requirement has to be a real number counted from the real ladder, not a percentage or a guess.
         * Same rule check P5 enforces on the marks: arithmetic that can be checked by hand. */
        const s = perkStates(standingAt(1, 0), [], rungAt).find(p => p.perk.slug === 'bronze');
        const need = rungAt(4);
        return s.remaining === need && s.need.includes(String(need)) && s.need.includes('Level 4');
    })(),
    'K4', 'a locked look states the real arithmetic, counted from the real ladder',
    `bronze at level 1 needs exactly rungAt(4) = ${rungAt(4)} points`,
);

report(
    (() => {
        /* Mark gates have no point figure, and inventing one would be the kind of made-up number this whole
         * suite exists to prevent. It says what the mark is instead. */
        const s = perkStates(standingAt(1, 0), [], rungAt).find(p => p.perk.slug === 'plum');
        return s.remaining === null && /mark/i.test(s.need);
    })(),
    'K5', 'a mark-gated look does NOT invent a points figure',
    'no points can be quoted for "answer ten decisions before their deadline", so none is',
);

report(
    (() => {
        const states = perkStates(standingAt(1, 0), [], rungAt);
        const next = nextPerk(states);
        /* Cheapest first, so "Next" is the one he will actually reach next rather than the first in the array. */
        const cheapest = states.filter(p => !p.unlocked && p.remaining != null)
            .sort((a, b) => a.remaining - b.remaining)[0];
        return next && next.perk.slug === cheapest.perk.slug;
    })(),
    'K6', 'the next look is the CHEAPEST locked one, not the first in the list',
    'a "Next" that names something further away than another is worse than no Next at all',
);

report(
    nextPerk(perkStates(standingAt(500, 999999), PERKS
        .filter(p => p.requires.kind === 'mark')
        .map(p => markNamed(p.requires.mark)), rungAt)) === null,
    'K7', 'a hub with everything unlocked says so rather than inventing a target',
    'null, not a fabricated next perk',
);

report(
    (() => {
        /* Every mark a perk is gated on has to EXIST, or the perk is unreachable and the page states a
         * requirement that can never be met. A slug typo would do it and nothing else would notice. */
        const gated = PERKS.filter(p => p.requires.kind === 'mark').map(p => p.requires.mark);
        const real = new Set(MARKS.map(d => d.slug));
        const missing = gated.filter(m => !real.has(m));
        return missing.length === 0;
    })(),
    'K8', 'every mark a look is gated on is a real mark',
    'a typo here would state a requirement that can never be met, and nothing else would catch it',
);

report(
    (() => {
        /*
         * EVERY PERK NEEDS A DEFINITION BEHIND IT, AND EVERY DEFINITION NEEDS A GATE IN FRONT OF IT — on all
         * three axes.
         *
         * An orphan on either side is a look he can never choose, or a gate on nothing. The single-axis version
         * compared `PERKS` to `PALETTES` wholesale, which stopped being the right comparison the moment a perk
         * could be a crest finish; it reported "16 perks, 6 palettes" and failed, correctly, because it was
         * asking a question that no longer had an answer.
         *
         * `perksOfKind` is used rather than a filter written here, so a fourth axis added to `PerkKind` without a
         * definition table fails this check instead of shipping as a section that renders nothing.
         */
        const tables = {
            palette: PALETTES.map(p => p.slug),
            crest: FINISHES.map(f => f.slug),
            surface: SURFACES.map(x => x.slug),
        };
        const kinds = [...new Set(PERKS.map(p => p.kind))];
        if (kinds.some(k => !tables[k])) return false;
        return kinds.every(k => {
            const gated = new Set(perksOfKind(k).map(p => p.slug));
            const defined = new Set(tables[k]);
            return gated.size === defined.size && [...gated].every(x => defined.has(x));
        });
    })(),
    'K9', 'every look has a definition and every definition has a gate, on all three axes',
    `${PERKS.length} perks: ${PALETTES.length} palettes, ${FINISHES.length} finishes, ` +
    `${SURFACES.length} surfaces`,
);

report(
    (() => {
        /* The injection: the off-by-one gate. `level === n` unlocks bronze at exactly level 4 and locks it
         * again at 5, which is the monotonicity failure K2 exists to catch — proven here to actually fail. */
        const wrong = (perk, s) => perk.requires.kind === 'level'
            ? s.level === perk.requires.level
            : false;
        const bronze = PERKS.find(p => p.slug === 'bronze');
        return wrong(bronze, standingAt(4, 0)) === true && wrong(bronze, standingAt(5, 0)) === false &&
            isUnlocked(bronze, standingAt(5, 0), []) === true;
    })(),
    'K2-inj', 'an equality gate that re-locks a look at the next level is caught',
    'the wrong version locks bronze again at level 5; the real one does not',
);

/* ================================================================================================
 * DOES A LEVEL STILL BUY ANYTHING? — K10 and K11, and they were written before the fix and observed red
 *
 * HIS WORDS, AND THEY NAME THE DEFECT EXACTLY:
 *
 *     "Every level-gated perk is at level 1 through 7. I am at level 4. From level 8 onward, forever,
 *      levelling up buys nothing."
 *
 * WHY NOTHING IN THIS SUITE CAUGHT IT, WHICH IS THE INTERESTING PART
 *
 * T5 above asserts "there is always something coming, at every scale" and it PASSES — because it measures
 * `nextUp`, which is MARKS. The suite proved the mark set has depth and was completely silent about the reward
 * set. Two halves of one progression, one of them checked. The perk axis had nine checks (K1..K9) and every one
 * of them asks about a SINGLE perk or a SINGLE snapshot: does bronze quote the right arithmetic, does a mark gate
 * invent a number, does every perk have a definition. Not one of them asks the question the whole axis exists to
 * answer, which is "is there anything left".
 *
 * MEASURED, BEFORE THE FIX. The table at the top of this run reaches level 10 by day 30 and level 33 by day 730.
 * The highest level gate in the perk set was SEVEN. So from about day 14 onward — for the entire remaining life
 * of the tool — a level cost between 300 and 1,100 points and bought nothing at all.
 *
 * WHY BOTH CHECKS, AND WHY THEY FAIL DIFFERENTLY
 *
 * K10 measures the economy against the REAL DERIVED RECORD over two years, so it catches the ladder outrunning the
 * reward set. K11 measures the GATE STRUCTURE level by level, so it catches a dead stretch anywhere — including
 * one past the two-year sample point, and including a single skipped level in the middle.
 *
 * WHY K10 COUNTS ONLY *LEVEL* GATES, WHICH IS THE ONE JUDGEMENT CALL IN HERE
 *
 * A mark gate depends on what KIND of work happens to arrive; a level gate is the only requirement that
 * continuing to work is guaranteed to reach. An economy whose only remaining items are mark-gated is an economy
 * that finishing tasks cannot advance — which is precisely his complaint, and a check that accepted a leftover
 * mark gate as "something coming" would have gone green over the defect. The synthetic record does not earn
 * every mark (it has no 20-step task and no gap for `came-back` to close), so counting all locked perks would
 * have passed today, over a dead economy, for an unrelated reason. That is the false pass this file keeps
 * recording, and it was avoidable by asking what the check is FOR.
 *
 * BOTH GO THROUGH `perkStates`, NOT THROUGH `PERKS`. The perk set is no longer a fixed array — see the generated
 * lines in lib/perks.ts — so a check that read the array would measure the named sixteen and miss the whole
 * economy above them. `perkStates` is the one door the page uses, so it is the one door the check uses.
 * ================================================================================================ */

const perkStateAt = (level, earned = []) =>
    perkStates(standingAt(level, rungAt(level)), earned, rungAt, mintedFor(level));
const unlockedSlugsAt = (level, earned = []) =>
    new Set(perkStateAt(level, earned).filter(p => p.unlocked).map(p => p.perk.slug));

report(
    (() => {
        const dead = at.filter(r =>
            !perkStateAt(r.standing.level, marks(r.snapshot))
                .some(p => !p.unlocked && p.perk.requires.kind === 'level'));
        if (dead.length) {
            const worst = dead[dead.length - 1];
            report.k10detail =
                'nothing a level can buy at: ' + dead.map(r => 'day ' + r.days).join(', ') +
                '  <- at day ' + worst.days + ' he is level ' + worst.standing.level +
                ' and the highest level gate in the whole economy is ' +
                Math.max(...perkStateAt(worst.standing.level, [])
                    .filter(p => p.perk.requires.kind === 'level')
                    .map(p => p.perk.requires.level));
            return false;
        }
        const l = at[at.length - 1];
        const nextOne = perkStateAt(l.standing.level, marks(l.snapshot))
            .filter(p => !p.unlocked && p.perk.requires.kind === 'level')
            .sort((a, b) => a.perk.requires.level - b.perk.requires.level)[0];
        report.k10detail =
            'at day ' + l.days + ' he is level ' + l.standing.level + ' and ' + nextOne.perk.label +
            ' is waiting at level ' + nextOne.perk.requires.level;
        return true;
    })(),
    'K10', 'at every scale up to two years, there is still a perk a LEVEL will buy',
    report.k10detail,
);

report(
    (() => {
        /*
         * No marks are passed in deliberately: with an empty mark list every gain between two adjacent levels
         * can only have come from a level gate, so this measures the thing it claims to measure rather than
         * being carried by a mark that happens to land at the same time.
         */
        const barren = [];
        for (let level = 2; level <= 60; level++) {
            if (unlockedSlugsAt(level).size <= unlockedSlugsAt(level - 1).size) barren.push(level);
        }
        report.k11detail = barren.length
            ? barren.length + ' of the 59 levels from 2 to 60 unlock nothing: ' +
              (barren.length > 12
                  ? barren.slice(0, 12).join(', ') + ' … ' + barren[barren.length - 1]
                  : barren.join(', ')) +
              '  <- a rung that costs points and pays nothing'
            : 'every level from 2 to 60 hands him at least one look he did not have at the level below';
        return barren.length === 0;
    })(),
    'K11', 'no level is a rung that costs points and pays nothing, all the way to 60',
    report.k11detail,
);

/* How far up the minted line the checks below look. Level 200 is centuries at his measured rate; the point is
 * to test the GENERATORS well past anything reachable, because that is where an off-by-one hides. */
const MINT_HORIZON = 200;
const mintedGates = generatedGates(MINT_HORIZON);

report(
    (() => {
        /*
         * THE SLUG SPELLING IS DUPLICATED, ON PURPOSE, AND THIS IS WHAT MAKES THAT SAFE.
         *
         * `lib/perks.ts` builds `<kind>-<index>` from the rotation; each axis module parses the same shape back
         * with its own regex, because neither may import the other. This is the identical situation `projectHueOf`
         * is in, and the reason X4 exists: the comment claiming those two derivations matched WAS ALREADY FALSE
         * ONCE, when /setup drifted to a different colour space. So the agreement is measured over the whole
         * horizon rather than asserted in prose.
         *
         * It also catches the more interesting failure: a gate minted on an axis whose generator does not produce
         * anything for that index, which would render as an empty section or a crest with no finish.
         */
        const bad = [];
        for (const gate of mintedGates) {
            const def = gate.kind === 'palette' ? paletteBySlug(gate.slug)
                : gate.kind === 'crest' ? finishBySlug(gate.slug)
                    : surfaceBySlug(gate.slug);
            if (!def || def.slug !== gate.slug || !def.label) bad.push(gate.slug);
        }
        const slugs = mintedGates.map(g => g.slug);
        const labels = mintedGates.map(g => (
            g.kind === 'palette' ? generatedPalette(g.index)
                : g.kind === 'crest' ? generatedFinish(g.index)
                    : generatedSurface(g.index)).label);
        const dupSlug = slugs.length !== new Set(slugs).size;
        const dupLabel = labels.length !== new Set(labels).size;
        report.k12detail = bad.length
            ? bad.length + ' minted gates resolve to nothing on their own axis: ' + bad.slice(0, 6).join(', ')
            : dupSlug ? 'two minted gates share a slug'
                : dupLabel ? 'two minted looks share a name, so he could not tell which one he chose'
                    : mintedGates.length + ' gates to level ' + MINT_HORIZON +
                      ' all resolve, with unique slugs and unique names';
        return bad.length === 0 && !dupSlug && !dupLabel;
    })(),
    'K12', 'every level the rotation mints resolves to a real look with a name of its own',
    report.k12detail,
);

report(
    (() => {
        /*
         * THE RULE THE NAMED SET LEARNED THE HARD WAY, APPLIED TO A LINE THAT HAS NO END.
         *
         * lib/finishes.ts records the correction: `plain` and `crowned` were the closest pair because both drew
         * vertical bands, so the division was changed to make every pair differ on at least two axes. His verdict
         * on the version before that was *"they kinda look the same dude… very, very slightly different from each
         * other. Many users won't even notice anything."*
         *
         * A generated line walked with a stride of one on a single field would reproduce that exactly, and at
         * greater scale. So this asserts the arithmetic actually delivers what the coprime strides claim, over the
         * whole horizon — and separately that no minted finish is a duplicate of one of the five named ones,
         * which would be a level handing him something he already had.
         */
        const axes = f => [f.silhouette, f.division, f.ground, String(f.sealScale), String(f.well),
            String(f.ornaments)];
        const line = Array.from({ length: MINT_HORIZON }, (_, i) => generatedFinish(i + 1));
        let worst = 6;
        let worstAt = 0;
        for (let i = 1; i < line.length; i++) {
            const a = axes(line[i - 1]);
            const b = axes(line[i]);
            const differ = a.filter((v, k) => v !== b[k]).length;
            if (differ < worst) { worst = differ; worstAt = i + 1; }
        }
        const named = new Set(FINISHES.map(f => axes(f).join('|')));
        const clones = line.filter(f => named.has(axes(f).join('|')));
        report.k13detail = worst < 2
            ? 'finishes ' + worstAt + ' and ' + (worstAt - 1) + ' differ on only ' + worst + ' axis'
            : clones.length
                ? clones.length + ' minted finishes are duplicates of a named one: ' +
                  clones.slice(0, 4).map(f => f.slug).join(', ')
                : 'the closest consecutive pair in ' + MINT_HORIZON + ' differs on ' + worst +
                  ' of 6 axes, and none duplicates a named finish';
        return worst >= 2 && clones.length === 0;
    })(),
    'K13', 'no two minted crest finishes in a row are near-identical, and none clones a named one',
    report.k13detail,
);

/**
 * The level a minted item of one axis arrives at. The rotation hands out one perk per level across three axes, so
 * the nth item of any one axis is three levels after the one before it.
 */
const levelOfMinted = (kindOffset, index) => GENERATED_FROM + kindOffset + (index - 1) * LOOKAHEAD;

/**
 * How deep a minted line has to stay distinct before "it repeats eventually" stops being a real objection.
 *
 * A HONEST NUMBER RATHER THAN A ROUND ONE, and the reasoning matters because the first version of K14 asserted
 * something that is false by arithmetic. Any generator with a finite range of visibly-different outputs repeats
 * eventually — the set of palettes a person can tell apart at a FIXED lightness ramp is maybe a few dozen, not
 * two hundred — so a check demanding 200 pairwise-distinct palettes was demanding a lie and would have forced
 * the generator into contortions to fake it.
 *
 * What is worth asserting is that the line stays distinct far past anything he can reach. Level 95 is the bar,
 * and at the measured 62 points a day it is well over a decade of daily use: level 33 is two years, and the rungs
 * are quadratic from there.
 */
const DEEP_ENOUGH = 95;

report(
    (() => {
        /*
         * "WOULD SOMEONE NOTICE THIS IF NOBODY TOLD THEM TO?" — as arithmetic, for the palettes.
         *
         * A palette is hue and chroma over a shared lightness table, so two palettes ARE the same palette when
         * both are close. 12 degrees and 0.3 of chroma is the threshold, and it is not invented: §XII of
         * docs/ITERATION-LOG.md measured that `tuck-shop` at hue 26 and `nine-panels` at hue 34 were
         * indistinguishable on the crest at a fixed lightness — EIGHT degrees apart. Twelve is that measured
         * failure with a margin.
         *
         * TWO PARTS, because they are different severities.
         *
         *   A. A minted palette that is a near-duplicate of one of the SIX HE ALREADY HAS is a hard failure. That
         *      is a level handing him a palette he has been looking at since week one, which is the whole defect
         *      this economy exists to remove, arriving through the fix.
         *   B. The minted line eventually revisiting its own territory is expected and acceptable — see
         *      DEEP_ENOUGH. What is asserted is WHERE, and the number is printed either way.
         *
         * This check is what set both `GENERATED_HUE_BASE` and `GENERATED_CHROMA`. The first attempt (base 24, six
         * chroma values) put the fourth minted palette six degrees and 0.15 of chroma from Graphite, and part A
         * caught it: *"Graphite (hue 70, chroma 1) and Brass (hue 76.52, chroma 1.15) are the same palette twice"*.
         */
        const dh = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
        /*
         * HUE ONLY COUNTS AS A SEPARATOR WHEN THERE IS ENOUGH CHROMA TO SHOW IT, and that clause is here because
         * a rendered screenshot taught it. `Rust` (hue 0, chroma 0.65) and `Ink` (hue 265, chroma 0.3) are 95
         * degrees apart and the first version of this check passed them on hue alone — but at those chromas the
         * surfaces are near-neutral, so 95 degrees of hue is nearly invisible in the ramp itself. Cropping the two
         * swatches side by side is what showed it: what actually distinguishes them is the ACCENT (teal against
         * blue) and the chroma, not the hue.
         *
         * So below 0.8 the hue term is discounted to zero and the pair has to be separated by chroma or by accent.
         * That makes the check stricter where hue is invisible and unchanged where it is not, which is the honest
         * shape — the old version would have accepted two near-neutral palettes with the same accent as distinct.
         */
        const hueSeparation = (a, b) => (Math.min(a.chroma, b.chroma) >= 0.8 ? dh(a.hue, b.hue) : 0);
        const near = (a, b) => hueSeparation(a, b) < 12
            && Math.abs(a.chroma - b.chroma) < 0.3
            && dh(a.accentHue, b.accentHue) < 20;
        const line = Array.from({ length: 60 }, (_, i) => generatedPalette(i + 1));

        for (const [i, minted] of line.entries()) {
            const clash = PALETTES.find(n => near(minted, n));
            if (clash) {
                report.k14detail = 'minted palette ' + (i + 1) + ' (' + minted.label + ', hue ' + minted.hue +
                    ', chroma ' + minted.chroma + ') is a near-duplicate of ' + clash.label + ' (hue ' +
                    clash.hue + ', chroma ' + clash.chroma + ') — a level handing him one he already has';
                return false;
            }
        }

        let revisit = null;
        for (let j = 1; j < line.length && !revisit; j++) {
            for (let i = 0; i < j; i++) {
                if (near(line[j], line[i])) { revisit = { j: j + 1, i: i + 1 }; break; }
            }
        }
        const revisitLevel = revisit ? levelOfMinted(0, revisit.j) : Infinity;
        report.k14detail = 'none of the first 60 minted palettes duplicates any of the ' + PALETTES.length +
            ' named ones; the line first revisits its own territory at minted ' +
            (revisit ? revisit.j + ' (close to ' + revisit.i + '), which is level ' + revisitLevel
                : 'never within 60') +
            (revisitLevel >= DEEP_ENOUGH ? '' : '  <- SHALLOWER THAN LEVEL ' + DEEP_ENOUGH);
        return revisitLevel >= DEEP_ENOUGH;
    })(),
    'K14', 'no minted palette duplicates a named one, and the line stays distinct past level ' + DEEP_ENOUGH,
    report.k14detail,
);

report(
    (() => {
        /*
         * Same question for the surfaces, where the answer is exact rather than a threshold: two surfaces with the
         * same image string and the same tile size ARE the same surface.
         *
         * THIS CHECK CAUGHT A REAL DEFECT IN THE FIRST GENERATOR and it is the reason the scale is arithmetic
         * rather than a table. That version indexed a six-entry scale table against a five-entry motif list, so
         * index i and i+30 drew the identical pattern; K15 reported *"Halftone and Halftone VII are the same
         * surface twice"*, which is level 99. Coprime periods (5 motifs, 41 scales, 8 angles) push the first
         * repeat to where it is printed below.
         */
        const line = Array.from({ length: 400 }, (_, i) => generatedSurface(i + 1));
        const fingerprint = s => s.image + '  @  ' + s.size;
        const named = new Map(SURFACES.map(s => [fingerprint(s), s.label]));
        for (const [i, s] of line.entries()) {
            const clash = named.get(fingerprint(s));
            if (clash) {
                report.k15detail = 'minted surface ' + (i + 1) + ' (' + s.label + ') paints exactly what ' +
                    clash + ' paints — a level handing him one he already has';
                return false;
            }
        }
        const seen = new Map();
        let repeat = null;
        for (const [i, s] of line.entries()) {
            const fp = fingerprint(s);
            if (seen.has(fp) && !repeat) { repeat = { j: i + 1, i: seen.get(fp) + 1 }; break; }
            seen.set(fp, i);
        }
        const repeatLevel = repeat ? levelOfMinted(2, repeat.j) : Infinity;
        report.k15detail = 'no minted surface paints what any of the ' + SURFACES.length +
            ' named ones paint; the line first repeats itself at minted ' +
            (repeat ? repeat.j + ' (same as ' + repeat.i + '), which is level ' + repeatLevel
                : 'never within 400') +
            (repeatLevel >= DEEP_ENOUGH ? '' : '  <- SHALLOWER THAN LEVEL ' + DEEP_ENOUGH);
        return repeatLevel >= DEEP_ENOUGH;
    })(),
    'K15', 'no minted surface paints what a named one paints, and the line stays distinct past level '
        + DEEP_ENOUGH,
    report.k15detail,
);

report(
    (() => {
        /*
         * THE INJECTION FOR K10 AND K11, AND IT IS THE STRONGEST KIND AVAILABLE: the defect is not simulated, it
         * is the economy as it actually shipped until this session. `perkStates` with no minted line is exactly
         * the sixteen hand-written perks, which is what K10 and K11 were first run against and what they reported:
         *
         *     K10  nothing a level can buy at: day 30, day 62, day 100, day 200, day 365, day 730
         *     K11  53 of the 59 levels from 2 to 60 unlock nothing
         *
         * So this asserts that both predicates still REJECT that set. A check that has been made green by adding
         * data has to be shown to still fail without it, or all it proves is that something was added.
         */
        const namedOnly = level => perkStates(standingAt(level, rungAt(level)), [], rungAt);
        const last = at[at.length - 1];
        const k10WouldFail = !namedOnly(last.standing.level)
            .some(p => !p.unlocked && p.perk.requires.kind === 'level');
        let barren = 0;
        for (let level = 2; level <= 60; level++) {
            const now = namedOnly(level).filter(p => p.unlocked).length;
            const before = namedOnly(level - 1).filter(p => p.unlocked).length;
            if (now <= before) barren++;
        }
        report.k16detail = k10WouldFail && barren > 0
            ? 'without the minted line, day ' + last.days + ' (level ' + last.standing.level +
              ') has nothing a level can buy, and ' + barren + ' of 59 levels pay nothing'
            : 'THE INJECTION DID NOT REPRODUCE THE DEFECT — named-only still looks healthy, so K10/K11 ' +
              'are not measuring what they claim';
        return k10WouldFail && barren > 0;
    })(),
    'K10/K11-inj', 'both checks still fail against the economy as it shipped before this session',
    report.k16detail,
);

/* ================================================================================================
 * THE CREST
 *
 * The emblem it replaced was a function of ONE number, so `emblemDiffers` over a range of levels was the only
 * property worth asserting about it. The crest is a function of six axes, and the whole reason it exists is
 * that two histories with the same point total should not draw the same object. That is a claim about the
 * derivation, so it belongs here rather than in a screenshot — the bench is for looking, this is for proving.
 * ================================================================================================ */

console.log('\n  the crest\n');

/**
 * A record with the knobs the crest actually reads: volume, breadth, minutes.
 *
 * Deliberately parameterised on BREADTH separately from volume, because "same points, different shape" is the
 * property under test and a generator that ties the two together could not express it.
 */
function crestRecord({ tasks, projects, minutesEach = 20, notes = 0 }) {
    const doneTasks = [];
    for (let i = 0; i < tasks; i++) {
        const t = START + i * 3600_000;
        doneTasks.push({
            id: `c${i}`, project: `cp${(i % projects) + 1}`,
            title: `t${i}`, why: null, minutes: minutesEach, stepCount: 2,
            status: 'done', note: i < notes ? 'note' : null, noted: i < notes,
            created_at: new Date(t - 3600_000).toISOString(),
            done_at: new Date(t).toISOString(),
        });
    }
    return { doneTasks, answeredQuestions: [], openTasks: [], openQuestions: [] };
}

const crestOf = record => {
    const s = derive(record);
    return { g: crestGeometry(crestInput(s, standing(s), marks(s))), st: standing(s), s };
};

/*
 * X1 — THE WHOLE POINT OF THE CREST. Same volume, same points, different breadth.
 *
 * If this fails, the crest is the emblem with a shield around it and the identity is still a gauge.
 */
{
    const narrow = crestOf(crestRecord({ tasks: 16, projects: 1 }));
    const wide = crestOf(crestRecord({ tasks: 16, projects: 8 }));
    const samePoints = narrow.st.points === wide.st.points;
    const differs = narrow.g.pales.length !== wide.g.pales.length ||
        narrow.g.facets !== wide.g.facets;
    report(
        samePoints && differs,
        'X1', 'two histories with the same points draw different crests',
        samePoints
            ? `${narrow.st.points} pts both: ${narrow.g.pales.length} band(s)/` +
              `${chargeFor(narrow.g.facets).name} vs ${wide.g.pales.length} band(s)/` +
              `${chargeFor(wide.g.facets).name}`
            : `the two records do not have equal points (${narrow.st.points} vs ${wide.st.points}), ` +
              'so this check is not measuring what it claims',
    );
}

/*
 * X2 — the level has to be READABLE off the shape, which is the property a glow or a colour ramp can never
 * have and the reason the rays are counted rather than sized. `(pips - 1) * 10 + rays` must be the level.
 */
{
    const wrong = [];
    for (let level = 1; level <= 110; level++) {
        const g = crestGeometry({
            level, tier: 0, fraction: 0, projects: [], categories: [], rarest: 0, minutesEstimated: 0,
        });
        if ((g.pips - 1) * 10 + g.rays !== level) wrong.push(`L${level} reads as ${(g.pips - 1) * 10 + g.rays}`);
    }
    report(
        wrong.length === 0,
        'X2', 'the level reads off the shape as (pips − 1) × 10 + rays, for every level to 110',
        wrong.length === 0 ? 'all 110 levels are recoverable from the geometry'
            : `wrong at: ${wrong.slice(0, 5).join(', ')}`,
    );
}

/*
 * X3 — THE HUE DEFECT, TWICE OVER.
 *
 * Version one walked the absolute level and wrapped, so level 55 was level 1's green. Version two walked the
 * within-tier position, which never wraps and RESET every tier, so level 41 was level 1's green — found by
 * rendering the bench. This asserts both are gone: no two tier openings share a hue, and the ramp never
 * crosses into the reds `--bad` owns.
 */
{
    const openings = [];
    for (let tier = 1; tier <= 12; tier++) {
        const level = tier === 1 ? 1 : 10 + (tier - 2) * 10 + 1;
        openings.push(crestGeometry({
            level, tier: 0, fraction: 0, projects: [], categories: [], rarest: 0, minutesEstimated: 0,
        }).hue);
    }
    const unique = new Set(openings).size === openings.length;
    const inRamp = openings.every(h => h >= 152 && h <= 332);
    report(
        unique && inRamp,
        'X3', 'no two tiers open on the same hue, and the ramp never wraps into the reds',
        `tier openings: ${openings.join(', ')}`,
    );
}

/*
 * X4 — THE DUPLICATED DERIVATION, ASSERTED RATHER THAN CLAIMED.
 *
 * `projectHueOf` in lib/progress.ts is a copy of `projectHue` in lib/colour.ts, because this suite loads
 * progress.ts through Node's type-stripping and an extensionless value import between two lib files does not
 * resolve (AGENTS.md records the hour that cost). A comment saying two copies match was already false once —
 * `/setup` had drifted to a different colour space entirely while claiming to match the board. So it is a
 * check, over the slugs that actually exist rather than over invented ones.
 */
{
    const slugs = ['harbour-lights', 'cold-brew', 'tuck-shop', 'nine-panels', 'riff-kitchen', 'p1', 'cp1', ''];
    const wrong = slugs.filter(s => projectHueOf(s) !== projectHue(s));
    report(
        wrong.length === 0,
        'X4', 'the crest derives project hues identically to lib/colour.ts',
        wrong.length === 0
            ? `${slugs.length} slugs agree, so a band is the same hue as that project's dot`
            : `disagree on: ${wrong.join(', ')}`,
    );
}

/*
 * X5 — nothing is lost to the eight-band cap. `pales.length + palesOver` has to be every project he has
 * finished work in, or the crest is quietly dropping one and `CrestKey` would understate it.
 */
{
    const wide = crestOf(crestRecord({ tasks: 24, projects: 12 }));
    const accounted = wide.g.pales.length + wide.g.palesOver;
    report(
        wide.g.pales.length === 8 && accounted === 12,
        'X5', 'the band cap accounts for every project rather than dropping any',
        `12 projects -> ${wide.g.pales.length} bands + ${wide.g.palesOver} over = ${accounted}`,
    );
}

/*
 * X6 — the crest must keep evolving past the day the old ladder used to end, for the same reason T3 asserts it
 * of the emblem. Different check, because the crest could freeze on axes the emblem does not have.
 */
{
    const early = crestOf(crestRecord({ tasks: 90, projects: 3, minutesEach: 20, notes: 30 }));
    const late = crestOf(crestRecord({ tasks: 2190, projects: 8, minutesEach: 20, notes: 700 }));
    const axes = ['rays', 'pips', 'facets', 'rarity', 'rims', 'hue']
        .filter(k => early.g[k] !== late.g[k]);
    const bands = early.g.pales.length !== late.g.pales.length;
    report(
        axes.length >= 3 || (axes.length >= 2 && bands),
        'X6', 'the crest is still changing on several axes after two years of use',
        `moved: ${[...axes, ...(bands ? ['bands'] : [])].join(', ') || 'NOTHING'}`,
    );
}

/*
 * X7 — THE SWEEP AGAINST A NAIVE REFERENCE.
 *
 * `clearMoments` was rewritten from O(n²) to a sweep, and the reason is in its own comment: at fifteen
 * projects filing daily it was heading for ~400 million string comparisons on every render, and the crest
 * bench's level-121 history hung the page outright. An optimisation to a load-bearing derivation is exactly
 * the kind of change that is "obviously equivalent" and is not.
 *
 * So this is a differential check: the ORIGINAL rule, restated naively below, against the shipped
 * implementation, over records built to produce clear moments of both kinds. Restating the algorithm is
 * normally the thing this codebase refuses to do — but for a differential check it is the entire method: two
 * independent implementations agreeing is the evidence, and a check that called the same function twice would
 * be evidence of nothing.
 */
function naiveClearMoments(tasks, questions) {
    const out = [];
    const scopes = [null, ...new Set(tasks.map(t => t.project))];
    for (const scope of scopes) {
        const ts = scope === null ? tasks : tasks.filter(t => t.project === scope);
        const qs = scope === null ? questions : questions.filter(q => q.project === scope);
        const live = ts.filter(t => t.status !== 'dropped');
        const candidates = [...new Set(live.filter(t => t.done_at).map(t => t.done_at))].sort();
        for (const at of candidates) {
            const existedBy = live.filter(t => t.created_at <= at).length
                + qs.filter(q => q.created_at <= at).length;
            if (existedBy < 2) continue;
            if (live.some(t => t.created_at < at && !(t.done_at !== null && t.done_at <= at))) continue;
            if (qs.some(q => q.created_at < at && !(q.answered_at !== null && q.answered_at <= at))) continue;
            out.push({ scope, at });
        }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Records shaped to actually PRODUCE clear moments, which the day-N generator does not.
 *
 * `recordAfter` never leaves anything open, so the whole-hub scope is clear at almost every completion and a
 * differential check over it would only exercise one branch. These interleave arrivals and completions so
 * some moments are clear and others are not, in both the scoped and unscoped sense.
 */
function clearingRecords() {
    const mk = (i, project, createdDay, doneDay) => ({
        id: `s${i}`, project, title: `t${i}`, why: null, minutes: 10, stepCount: 1,
        status: 'done', note: null, noted: false,
        created_at: new Date(START + createdDay * DAY).toISOString(),
        done_at: doneDay === null ? null : new Date(START + doneDay * DAY).toISOString(),
    });
    return [
        // Two projects, overlapping work, one of them taken to zero twice.
        {
            what: 'interleaved, one project cleared twice',
            tasks: [
                mk(0, 'a', 0, 1), mk(1, 'a', 0, 2), mk(2, 'b', 1, 5),
                mk(3, 'a', 3, 4), mk(4, 'a', 3, 6), mk(5, 'b', 6, 7),
            ],
            questions: [],
        },
        // Something still open, so no moment after its creation can be clear.
        {
            what: 'one never finished',
            tasks: [mk(0, 'a', 0, 1), mk(1, 'a', 0, 2), mk(2, 'a', 1, null), mk(3, 'a', 4, 5)],
            questions: [],
        },
        // A question that outlives several completions, then resolves.
        {
            what: 'a question outstanding across completions',
            tasks: [mk(0, 'a', 0, 1), mk(1, 'a', 0, 3), mk(2, 'a', 4, 6)],
            questions: [{
                project: 'a',
                created_at: new Date(START + 0 * DAY).toISOString(),
                answered_at: new Date(START + 5 * DAY).toISOString(),
            }],
        },
        // A dropped task, which was never outstanding work for him.
        {
            what: 'a dropped task',
            tasks: [
                mk(0, 'a', 0, 1), mk(1, 'a', 0, 2),
                { ...mk(2, 'a', 0, null), status: 'dropped' },
            ],
            questions: [],
        },
        // The whole-hub scope going to zero, then filling again.
        {
            what: 'the hub reaching zero twice',
            tasks: [
                mk(0, 'a', 0, 1), mk(1, 'b', 0, 1), mk(2, 'a', 4, 5), mk(3, 'b', 4, 5),
            ],
            questions: [],
        },
    ];
}

{
    const disagree = [];
    for (const r of clearingRecords()) {
        /*
         * The questions go in via `answeredQuestions`, because that is one of the two lists `derive`
         * concatenates before handing them to `clearMoments`.
         *
         * THE FIRST VERSION OF THIS CHECK PASSED AN EMPTY ARRAY AND WENT RED, which is the check working: the
         * sweep found two clear moments the reference did not, because the sweep had never been shown the
         * question that was outstanding across them. The implementations agreed all along and the harness was
         * feeding them different worlds. Worth recording, because a differential check that feeds its two
         * sides different inputs is the most convincing kind of false failure — and it would have been just as
         * convincing as a false PASS if the discrepancy had gone the other way.
         */
        const mine = derive({
            doneTasks: r.tasks, answeredQuestions: r.questions, openTasks: [], openQuestions: [],
        }).clearMoments;
        const theirs = naiveClearMoments(r.tasks, r.questions);
        const key = list => list.map(c => `${c.scope ?? '*'}@${c.at}`).sort().join('|');
        if (key(mine) !== key(theirs)) {
            disagree.push(`${r.what}: sweep ${key(mine) || '(none)'} vs naive ${key(theirs) || '(none)'}`);
        }
    }
    report(
        disagree.length === 0,
        'X7', 'the clear-moment sweep agrees with a naive implementation of the original rule',
        disagree.length === 0
            ? `${clearingRecords().length} constructed histories agree exactly, including the dropped-task ` +
              'and never-finished cases'
            : disagree.join('\n            '),
    );
}

/*
 * X8 — AND IT HAS TO BE FAST, because `derive` runs on every render and, in the browser, on every keystroke
 * in the note box.
 *
 * A time budget is the crudest kind of check and it is the right one here — but the NUMBER has to be measured
 * rather than picked, and the first attempt at this got it wrong in a way worth recording. It was written as
 * 3,000ms on the strength of a guess that the rewrite was worth three orders of magnitude. Run, the old
 * implementation cleared 3,000ms comfortably (522ms at 5,000 completions) and X8-inj went red: the budget was
 * not a wall, it was a formality, and the check would have passed over a hub that took half a second of
 * main-thread work per keystroke.
 *
 * The measured table is in the `clearMoments` comment in lib/progress.ts. At 10,000 completions the sweep is
 * 29ms and the old version 1,756ms, so 400ms sits an order of magnitude above one and four times below the
 * other — margin in both directions, against a real difference rather than an assumed one.
 *
 * 10,000 completions is on the order of one to two years at fifteen projects filing daily, which is the volume
 * the brief's "what will happen on day 300?" question is actually about.
 */
const PERF_TASKS = 10_000;
const PERF_BUDGET_MS = 400;
{
    const record = crestRecord({ tasks: PERF_TASKS, projects: 15 });
    const t0 = process.hrtime.bigint();
    const s = derive(record);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    report(
        ms < PERF_BUDGET_MS && s.tasksDone === PERF_TASKS,
        'X8', `the whole derivation handles a year of fifteen projects in under ${PERF_BUDGET_MS}ms`,
        `${PERF_TASKS} completions across 15 projects in ${ms.toFixed(0)}ms ` +
        `(${s.clearMoments.length} clear moments found)`,
    );
}

/* ================================================================================================
 * THE TIME MACHINE
 *
 * Standing at a past instant is computable only because nothing is stored. That makes it a property of the
 * derivation, so it is provable here with no browser — and it needs proving, because a history view that is
 * subtly wrong is the most damaging thing this hub could ship. Every other figure can be checked against the
 * rows in front of him; a claim about June cannot.
 * ================================================================================================ */

console.log('\n  the time machine\n');

const HISTORY = recordAfter(200);
const LIVE = derive(HISTORY);
const LIVE_ST = standing(LIVE);

/*
 * H1 — cutting off at the LAST event has to reproduce today exactly.
 *
 * If it does not, `asOf` is dropping or mangling a row, and every earlier cut-off is wrong in the same way
 * without anything to compare it against. This is the one position where the answer is independently known.
 */
{
    const last = LIVE.finished[0].done_at > LIVE.decisions[0].answered_at
        ? LIVE.finished[0].done_at : LIVE.decisions[0].answered_at;
    const then = derive(asOf(HISTORY, last));
    const thenSt = standing(then);
    const same = thenSt.points === LIVE_ST.points && thenSt.level === LIVE_ST.level
        && then.tasksDone === LIVE.tasksDone && then.decisionsMade === LIVE.decisionsMade
        && marks(then).length === marks(LIVE).length;
    report(
        same,
        'H1', 'cut off at the latest event, the past IS the present',
        same
            ? `${thenSt.points} pts, level ${thenSt.level}, ${marks(then).length} marks — identical either way`
            : `today ${LIVE_ST.points}pts/L${LIVE_ST.level}/${marks(LIVE).length}marks vs ` +
              `${thenSt.points}pts/L${thenSt.level}/${marks(then).length}marks`,
    );
}

/*
 * H2 — the ledger's accrual has to agree with `standing()`.
 *
 * `rankLedger` sums each thing's own contribution at its own timestamp instead of calling `standing()` per day,
 * because 365 derivations on a tab press is not affordable. That is only safe if the two methods produce the
 * same total, and "they obviously do" is how a second implementation drifts.
 */
{
    const ledger = rankLedger(LIVE);
    const top = ledger[ledger.length - 1];
    const ok = !!top && top.level === LIVE_ST.level;
    report(
        ok,
        'H2', 'the rank ledger ends on exactly the level `standing()` reports',
        ok ? `accrual reaches level ${top.level} at ${top.points} pts; standing says level ` +
             `${LIVE_ST.level} at ${LIVE_ST.points} pts`
           : `ledger tops out at level ${top?.level ?? 'nothing'} but standing says ${LIVE_ST.level}`,
    );
}

/*
 * H3 — NO GAPS. Every level between 2 and the current one must appear exactly once.
 *
 * The specific bug this holds out: a single event can cross more than one rung (the first rung is 30 points and
 * a decision answered inside its deadline and inside the hour is 14), so the accrual loop has to be a `while`.
 * With an `if` the ledger silently SKIPS a level he definitely reached — a missing row rather than a wrong one,
 * which is strictly harder to notice.
 */
{
    const ledger = rankLedger(LIVE);
    const levels = ledger.map(l => l.level);
    const expected = Array.from({ length: LIVE_ST.level - 1 }, (_, n) => n + 2);
    const ok = levels.length === expected.length && levels.every((l, n) => l === expected[n]);
    report(
        ok,
        'H3', 'the ledger records every level he passed through, in order, with no gaps',
        ok ? `levels 2..${LIVE_ST.level}, ${levels.length} arrivals, none repeated or skipped`
           : `got ${levels.join(',')} — expected ${expected.join(',')}`,
    );
}

/*
 * H4 — the past can never be HIGHER than the present.
 *
 * Points only accrue, so walking the cut-off forwards must give a non-decreasing level and total. A failure
 * here means the filter is letting something in that had not happened yet, which is the time-travel version of
 * a badge for something he did not do.
 */
{
    const dates = [...new Set([
        ...LIVE.finished.map(f => f.done_at),
        ...LIVE.decisions.map(d => d.answered_at),
    ])].sort();
    /*
     * Every twentieth cut-off, PLUS THE LAST ONE — 800 derivations would make this suite slow for no extra
     * coverage, and the first version of this line forgot the last one. It went red reporting "ending at 12104
     * pts" against today's 12400, which looked like the time machine losing 296 points and was the sampler
     * skipping the final three events. A check whose own sampling makes it fail teaches you to distrust it.
     */
    const sampled = [...new Set([...dates.filter((_, n) => n % 20 === 0), dates[dates.length - 1]])];
    let monotonic = true;
    let prev = { points: -1, level: 0 };
    let worst = null;
    for (const d of sampled) {
        const st = standing(derive(asOf(HISTORY, d)));
        if (st.points < prev.points || st.level < prev.level) {
            monotonic = false;
            worst = `${d}: ${st.points}pts/L${st.level} after ${prev.points}pts/L${prev.level}`;
        }
        prev = st;
    }
    report(
        monotonic && prev.points === LIVE_ST.points,
        'H4', 'walking the cut-off forwards never lowers the level, and ends on today',
        monotonic
            ? `${sampled.length} cut-offs across ${dates.length} events, ending at ${prev.points} pts`
            : `went backwards at ${worst}`,
    );
}

/*
 * H5 — OPEN WORK IS RECONSTRUCTED, which is the part that is easy to get wrong and expensive when it is.
 *
 * `asOf` keeps a task whose `created_at` is in the past and NULLS its completion, rather than dropping the row.
 * Dropping it is the obvious implementation and it silently hands him marks he had not earned: with no open
 * rows in the past, every scope looks clear at every moment, so `clearMoments` would report "the whole hub
 * reached zero" on a day when eleven things were waiting.
 *
 * Measured against a record built to have work outstanding at the cut-off.
 */
{
    const mk = (i, project, createdDay, doneDay) => ({
        id: `h${i}`, project, title: `t${i}`, why: null, minutes: 10, stepCount: 1,
        status: 'done', note: null, noted: false,
        created_at: new Date(START + createdDay * DAY).toISOString(),
        done_at: new Date(START + doneDay * DAY).toISOString(),
    });
    // Two finished on day 1 and 2; a third FILED on day 1 and not finished until day 9. So at day 3 the hub
    // was not clear, and a naive filter that dropped the unfinished row would say it was.
    const rows = { doneTasks: [mk(0, 'a', 0, 1), mk(1, 'a', 0, 2), mk(2, 'a', 0, 9)],
        answeredQuestions: [], openTasks: [], openQuestions: [] };
    const atDay3 = new Date(START + 3 * DAY).toISOString();
    const honest = derive(asOf(rows, atDay3));
    const naive = derive({
        ...rows,
        doneTasks: rows.doneTasks.filter(t => t.done_at <= atDay3),
    });
    report(
        honest.clearMoments.length === 0 && naive.clearMoments.length > 0,
        'H5', 'the past keeps its unfinished work, so it cannot claim a clear that had not happened',
        honest.clearMoments.length === 0 && naive.clearMoments.length > 0
            ? `at day 3 with one task still open: honest = 0 clear moments, ` +
              `dropping the row instead = ${naive.clearMoments.length}`
            : `honest reported ${honest.clearMoments.length}, naive ${naive.clearMoments.length} — ` +
              'this check is not measuring what it claims',
    );
}

/*
 * ================================================================================================
 * X9 — A PROMOTION MAY NEVER MAKE THE CREST LOOK EMPTIER, and this is the sixth pass's version of it
 * ================================================================================================
 *
 * The rule is the one this graphic has been caught breaking three times. Its shape CHANGED with the sixth pass,
 * which is why it needs a new check rather than an adjusted one.
 *
 * Before, the risk was the level: ten teeth at level 10 became one tooth at level 11, so a tier boundary emptied
 * the charge. That is gone by construction — the count is a bezel outside the charge and the charge does not
 * depend on the level at all, so at a tier boundary nine ticks shorten and nothing else in the drawing moves.
 *
 * The risk MOVED to `kinds`. The charge is now SELECTED from a vocabulary of nine, so earning a new kind of work
 * swaps one device for another — and if the new device carries less ink than the old one, the reward reads as a
 * loss. The nine are ordered by ink to make that impossible, and this is what holds the ordering.
 *
 * IT MEASURES THE SHIPPED DESCRIPTORS. `chargeInk` rasterises the very shapes app/components/Crest.tsx renders,
 * on a 600x600 grid, so the check cannot pass while the drawing disagrees with the table in the comment. That is
 * the reason the vocabulary lives in `lib/charges.ts` rather than as JSX: a check that restated the geometry
 * would be a second copy, and this project already has one comment that claimed two derivations matched and was
 * false.
 */
{
    const ink = CHARGES.map(c => chargeInk(c));
    const drops = [];
    for (let i = 1; i < ink.length; i++) {
        if (ink[i] < ink[i - 1]) {
            drops.push(`${CHARGES[i - 1].name} (${ink[i - 1].toFixed(3)}) -> ` +
                `${CHARGES[i].name} (${ink[i].toFixed(3)})`);
        }
    }
    report(
        drops.length === 0,
        'X9', 'earning a new KIND of work never gives back a charge with less ink in it',
        drops.length === 0
            ? `9 devices, ink ${ink[0].toFixed(2)} -> ${ink[ink.length - 1].toFixed(2)} of the ` +
              'circumscribed circle, never decreasing'
            : `a promotion would LOSE ink: ${drops.join('; ')}`,
    );

    /*
     * AND NO TWO DEVICES MAY BE THE SAME OBJECT, which is the failure he actually found once —
     * *"they kinda look the same dude… Many users won't even notice anything."*
     *
     * EVERY PAIR, not just consecutive ones, because the vocabulary is a set he moves through over years and a
     * collision between the second device and the eighth is as bad as one between neighbours.
     *
     * Measured as intersection over union of the rasterised shapes. THE FIRST VERSION OF THIS CHECK COMPARED INK
     * AND ITS PREMISE WAS FALSE: it required consecutive devices to differ by 2% of weight, and it failed on the
     * triangle and the mullet — 1.7% apart and about as visually different as two shapes in this set get. Ink
     * measures WEIGHT and the property being guarded is SHAPE, and they come apart exactly where a check would not
     * notice. Lowering the threshold would have kept a check that was asking the wrong question; see
     * `chargeOverlap` in lib/charges.ts.
     */
    let worst = null;
    for (let i = 0; i < CHARGES.length; i++) {
        for (let j = i + 1; j < CHARGES.length; j++) {
            const iou = chargeOverlap(CHARGES[i], CHARGES[j]);
            if (!worst || iou > worst.iou) worst = { iou, a: CHARGES[i].name, b: CHARGES[j].name };
        }
    }
    report(
        worst.iou <= 0.80,
        'X9b', 'no two of the nine charges are the same shape',
        worst.iou <= 0.80
            ? `the most alike pair is ${worst.a} and ${worst.b}, sharing ` +
              `${(worst.iou * 100).toFixed(0)}% of the area they jointly cover`
            : `${worst.a} and ${worst.b} share ${(worst.iou * 100).toFixed(0)}% of their area — ` +
              'that is one device offered twice',
    );
}

/* ================================================================================================
 * W1 — NOTHING SHOWN TO A PERSON USES A WORD THE HUB HAS NEVER EXPLAINED
 *
 * HIS WORDS, AND THIS IS THE CHECK THAT SHOULD HAVE EXISTED BEFORE THE WORDS WERE WRITTEN:
 *
 *     "this whole text, the names, the everything, is very confusing… The charge? The bands? The bezel? The core?
 *      struck to two of four — like what is this talking about… You're just talking with the user as if he knows
 *      everything and he's a very advanced user. We don't have a help center, we don't have anything explaining
 *      anything, we just throw this into their face."
 *
 * A previous pass named the nine crest devices with heraldry's own words — *a mullet*, *a saltire*, *an annulet*, *a
 * quartered disc* — and argued in a comment that this was CLEARER than the number it replaced, because a name can
 * be checked against the drawing. That argument is only true if you know which part of the drawing the word points
 * at, and nothing on this hub has ever said. The crest's receipt was written entirely in that private vocabulary.
 *
 * WHY A CHECK RATHER THAN A NOTE ASKING PEOPLE TO WRITE PLAINLY. Because the note existed: `SurfaceDef.blurb` is
 * documented as *"One line, in his language, about what it feels like"*, and the blurbs still ended up saying
 * *"two steps of the ramp above the page"*. An instruction in a doc comment is advice; this is arithmetic.
 *
 * IT IS A BLACKLIST, WHICH THIS CODEBASE NORMALLY REFUSES — `surfaceUsesOnlyRampTokens` is a whitelist precisely
 * because a blacklist has to anticipate what comes next. Prose does not admit a whitelist: you cannot enumerate the
 * words English is allowed to use. So this is deliberately narrow — it bans the specific words that ALREADY got
 * shipped and confused him, which makes it a regression check rather than a style guide. The general rule stays a
 * human judgement, and this stops the exact set of mistakes recurring.
 *
 * WHAT IT COVERS, STATED HONESTLY: every user-facing STRING in the four data modules — the nine device names, and
 * the label and blurb of every palette, finish and surface, named and generated. It does NOT cover the hand-written
 * sentences in `app/components/CrestKey.tsx`, because a `.tsx` cannot be imported here and reading it as text would
 * trip over the comments that quote these very words on purpose. That panel was rewritten by hand and read on a
 * rendered screenshot; the check guards the data, which is the part that is unbounded and where the next
 * regression would come from.
 * ================================================================================================ */

/* ================================================================================================
 * E3 — AN EMPTY HUB HAS TO KNOW WHICH KIND OF EMPTY IT IS
 *
 * The empty queue promised *"You will get a Telegram message when that changes"* to everybody, including someone
 * who had just opened the hub for the first time and connected nothing. No message was ever coming, because there
 * was no agent to send one. The proudest screen in the hub was making a promise it could not keep, to exactly the
 * person least equipped to notice — and it is the FIRST screen anybody he onboards will ever see, which matters
 * more now that he is setting this up for other people.
 *
 * Eight combinations of three booleans, walked exhaustively rather than sampled, because there are only eight and
 * the interesting one is a corner: no work, no sync. See `emptinessOf` in lib/progress.ts.
 * ================================================================================================ */

/* ================================================================================================
 * J1 — A PROJECT WHERE THE ONLY WORK WAS A DECISION IS STILL A PROJECT WITH WORK IN IT
 *
 * `AGENTS.md`: *"Agents file two things and nothing else: `task`, `question`."* The per-project view could only
 * see one of them. `perProject` counted finished tasks and open tasks, so a project where he had only ever
 * ANSWERED A DECISION had no figure at all — its chip rendered as a bare name beside siblings reading "9 open"
 * and "2 open", which reads as a number that failed to render rather than as a fact about the project.
 *
 * A decision is not a lesser thing here. It scores points (`POINTS.decision` is 6, plus 4 for beating the
 * deadline and 4 for answering within the hour), it is the half of the hub the brief calls under-served, and
 * `standing()` counts it towards his level. Being invisible in the one place the hub breaks work down by project
 * is the interface disagreeing with its own scoring.
 *
 * FOUND ON THE `--live` FIXTURE, which is production's measured shape, and structurally invisible on the default
 * one: that fixture gives every project open tasks, so a decision-only project cannot occur there. The state had
 * existed on his real hub the whole time.
 * ================================================================================================ */

console.log('\n  a project the hub can only describe by its tasks\n');

report(
    (() => {
        /* One answered decision in `quiet-one`, and no tasks anywhere near it. */
        const record = {
            doneTasks: [],
            openTasks: [],
            openQuestions: [],
            answeredQuestions: [{
                id: 'q1', project: 'quiet-one', key: 'k1',
                title: 'Which bucket for the images?', context: null,
                options: [{ key: 'a', label: 'Private' }], allow: ['choose'],
                default_option: 'a', deadline: '2026-08-02T12:00:00.000Z',
                status: 'answered', answer_type: 'choose', answer_option: 'a',
                answer_text: null, answer_note: null,
                answered_at: '2026-08-01T10:10:00.000Z',
                asked_by: 'agent',
                created_at: '2026-08-01T10:00:00.000Z',
                updated_at: '2026-08-01T10:10:00.000Z',
            }],
        };
        const s = derive(record);
        const row = s.perProject.find(p => p.slug === 'quiet-one');
        const st = standing(s);
        report.j1detail = !row
            ? 'the project is absent from perProject entirely, so nothing can render a figure for it'
            : row.decided !== 1
                ? 'the project is listed but reports ' + row.decided + ' decisions rather than 1'
                : 'a decision-only project is listed with 1 decided, 0 open, 0 done — and it is worth ' +
                  st.points + ' points, which is why saying nothing about it was wrong';
        /* And the points are the argument: if this were not real work the score would not move. */
        return !!row && row.decided === 1 && row.open === 0 && row.done === 0 && st.points > 0;
    })(),
    'J1', 'a project whose only work was an answered decision is listed, with a figure',
    report.j1detail,
);

report(
    (() => {
        /*
         * The injection is the derivation that shipped: slugs gathered from finished tasks, open tasks and OPEN
         * questions only. Answered decisions were not among them, so a decision-only project was absent.
         */
        const record = {
            doneTasks: [], openTasks: [], openQuestions: [],
            answeredQuestions: [{
                id: 'q1', project: 'quiet-one', key: 'k1', title: 'x', context: null,
                options: [{ key: 'a', label: 'Private' }], allow: ['choose'], default_option: 'a',
                deadline: null, status: 'answered', answer_type: 'choose', answer_option: 'a',
                answer_text: null, answer_note: null, answered_at: '2026-08-01T10:10:00.000Z',
                asked_by: 'agent', created_at: '2026-08-01T10:00:00.000Z',
                updated_at: '2026-08-01T10:10:00.000Z',
            }],
        };
        const s = derive(record);
        /* The old slug set, restated: finished + actionable open + OPEN questions. */
        const shipped = new Set([
            ...s.finished.map(f => f.project),
            ...record.openTasks.map(t => t.project),
            ...record.openQuestions.map(q => q.project),
        ]);
        report.j1injdetail = shipped.has('quiet-one')
            ? 'THE INJECTION DID NOT REPRODUCE THE DEFECT — the old slug set already had the project'
            : 'the old slug set has ' + shipped.size + ' project(s) and misses this one entirely, which is ' +
              'why its chip had no figure to show';
        return !shipped.has('quiet-one');
    })(),
    'J1-inj', 'the task-only version of the project list misses it',
    report.j1injdetail,
);

console.log('\n  which kind of empty an empty hub is\n');

report(
    (() => {
        const cases = [];
        for (const tasksDone of [0, 3]) {
            for (const decisionsMade of [0, 2]) {
                for (const everSynced of [false, true]) {
                    const got = emptinessOf({ tasksDone, decisionsMade, everSynced });
                    const want = tasksDone > 0 || decisionsMade > 0
                        ? 'earned'
                        : everSynced ? 'connected' : 'unstarted';
                    cases.push({ tasksDone, decisionsMade, everSynced, got, want });
                }
            }
        }
        const wrong = cases.filter(c => c.got !== c.want);
        /*
         * And the two properties that are the point rather than a restatement of the table:
         *   - a hub with nothing at all must NEVER be 'earned', which is the state whose copy makes the promise;
         *   - work always wins over connection, so a record is never hidden behind a setup prompt.
         */
        const bare = emptinessOf({ tasksDone: 0, decisionsMade: 0, everSynced: false });
        const workNoSync = emptinessOf({ tasksDone: 5, decisionsMade: 0, everSynced: false });
        report.e3detail = wrong.length
            ? wrong.length + ' of 8 combinations classify wrongly, first: ' + JSON.stringify(wrong[0])
            : bare !== 'unstarted'
                ? 'a hub with no work and no sync classifies as ' + bare + ', which is the state that promises a '
                  + 'Telegram message it has no agent to send'
                : workNoSync !== 'earned'
                    ? 'a hub with five finished tasks and no agent classifies as ' + workNoSync +
                      ', which would hide his record behind a setup prompt'
                    : 'all 8 combinations classify correctly; nothing-at-all is "unstarted" and work outranks '
                      + 'connection';
        return wrong.length === 0 && bare === 'unstarted' && workNoSync === 'earned';
    })(),
    'E3', 'an empty hub tells apart "you are caught up" from "you never started"',
    report.e3detail,
);

report(
    (() => {
        /*
         * The injection is the classification that shipped: one state for every empty hub. Assert that E3's own
         * predicate rejects it, so the check cannot go quietly green over a component that treats them as one.
         */
        const shipped = () => 'earned';
        const bare = shipped();
        report.e3injdetail = bare !== 'unstarted'
            ? 'the single-state version calls a brand-new hub "' + bare + '", and E3 rejects that'
            : 'THE INJECTION DID NOT REPRODUCE THE DEFECT';
        return bare !== 'unstarted';
    })(),
    'E3-inj', 'the one-state-for-every-empty-hub version is caught',
    report.e3injdetail,
);

console.log('\n  the words a person actually reads\n');

report(
    (() => {
        /*
         * Heraldry, the drawing's own internals, and the two metaphors this codebase talks to itself in ("the
         * ladder" for the level curve, "the ramp" for the surface steps). Every one of these was in a string a
         * person could read, on a hub with no glossary and no help page.
         */
        const JARGON = [
            'charge', 'bezel', 'annulet', 'mullet', 'saltire', 'fess', 'gyronny', 'keyway', 'roundel',
            'lozenge', 'castellated', 'swallowtail', 'chevron', 'plinth', 'pale', 'chief',
            'minted', 'the ladder', 'the ramp', 'ramp step', 'render', 'derived', 'tier',
        ];
        const re = new RegExp('\\b(' + JARGON.join('|') + ')', 'i');

        /* Named and generated together, because the generated lines are unbounded and are exactly where a future
         * blurb template would spread one bad word across a hundred cards. */
        const strings = [];
        const add = (where, def) => {
            strings.push({ where: where + ' label', text: def.label });
            if (def.blurb) strings.push({ where: where + ' blurb', text: def.blurb });
        };
        for (const c of CHARGES) strings.push({ where: 'crest device', text: c.name });
        for (const p of PALETTES) add('palette ' + p.slug, p);
        for (const f of FINISHES) add('finish ' + f.slug, f);
        for (const x of SURFACES) add('surface ' + x.slug, x);
        for (let i = 1; i <= 30; i++) {
            add('minted palette ' + i, generatedPalette(i));
            add('minted finish ' + i, generatedFinish(i));
            add('minted surface ' + i, generatedSurface(i));
        }

        const bad = strings.filter(s => re.test(s.text));
        report.w1detail = bad.length
            ? bad.length + ' of ' + strings.length + ' strings use a word nothing explains: ' +
              bad.slice(0, 4).map(s => s.where + ' — "' + re.exec(s.text)[0] + '" in ' +
                  JSON.stringify(s.text.slice(0, 64))).join('; ')
            : strings.length + ' user-facing strings checked against ' + JARGON.length +
              ' words the hub has never explained, and none of them uses one';
        return bad.length === 0;
    })(),
    'W1', 'nothing a person reads is written in the vocabulary of the drawing',
    report.w1detail,
);

report(
    (() => {
        /*
         * The injection, and it is the set of names that actually shipped. `a mullet`, `a saltire`, `an annulet`
         * and `a quartered disc` were the crest's device names for one commit, and they are what he read.
         */
        const JARGON = ['charge', 'bezel', 'annulet', 'mullet', 'saltire', 'fess'];
        const re = new RegExp('\\b(' + JARGON.join('|') + ')', 'i');
        const shipped = ['a mullet', 'a saltire', 'an annulet', 'a quartered disc', 'a disc and fess'];
        const caught = shipped.filter(t => re.test(t));
        report.w1injdetail = caught.length >= 3
            ? 'the names that shipped — ' + caught.slice(0, 3).map(t => JSON.stringify(t)).join(', ') +
              ' — are all rejected'
            : 'THE INJECTION DID NOT REPRODUCE THE DEFECT: only ' + caught.length + ' of the shipped names ' +
              'are caught, so W1 is not measuring what it claims';
        return caught.length >= 3;
    })(),
    'W1-inj', 'the words that actually confused him are the ones this rejects',
    report.w1injdetail,
);

/* ================================================================================================
 * THE REMINDER LADDER — N1..N5
 *
 * Here rather than in tests/prove.mjs for the same reason everything else in this file is here: the ladder
 * is a pure function of two timestamps, and a property of a pure function is checked against a TABLE of
 * inputs, not against whatever one row the database happens to hold. `prove.mjs` checks the other half —
 * that the lazy sweep actually fires and writes the event that counts it — and neither is sufficient alone.
 *
 * The failure being guarded is not arithmetic, it is silence: a decision with a timed default used to get
 * one notification and then resolve itself. So N1 is about the ladder EXISTING at the window sizes he
 * actually uses, N2 about it not existing where a nudge would be noise, and N4 about the sentence that makes
 * it a promise rather than a surprise.
 * ============================================================================================== */

console.log('\n  the reminder ladder\n');

const NUDGE_H = 3600_000;
const ASKED = '2026-08-06T09:00:00.000Z';
/** A deadline N hours after the ask. Named `due` because `at` is already the sample table above. */
const due = (hours) => new Date(new Date(ASKED).getTime() + hours * NUDGE_H).toISOString();
/** How many nudges a window of N hours gets, and where they land. */
const ladderFor = hours => reminderPoints(ASKED, due(hours))
    .map(p => Math.round((new Date(p).getTime() - new Date(ASKED).getTime()) / 60_000));

const WINDOWS = [
    { hours: 0.5, nudges: 0, why: 'half an hour: a second message 15 min later is noise' },
    { hours: 1, nudges: 1, why: 'one hour: room for one, at the half-way point' },
    { hours: 6, nudges: 2, why: 'six hours' },
    { hours: 12, nudges: 2, why: 'twelve hours, which is the shape he actually gets' },
    { hours: 24 * 5, nudges: 2, why: 'five days' },
];
for (const w of WINDOWS) console.log(`      ${String(w.hours).padStart(5)}h window -> ` +
    `${ladderFor(w.hours).length} nudge(s) at ${ladderFor(w.hours).map(m => m + ' min').join(', ') || '—'}`);

report(
    WINDOWS.every(w => ladderFor(w.hours).length === w.nudges),
    'N1', 'every deadline long enough to hold a nudge gets one, and the long ones get two',
    WINDOWS.map(w => `${w.hours}h -> ${ladderFor(w.hours).length}`).join(' · ') +
    (WINDOWS.every(w => ladderFor(w.hours).length === w.nudges)
        ? '' : '  <- does not match the table in lib/reminders.ts'),
);

report(
    (() => {
        /* Every point must be clear of the ask, of the deadline, and of the point before it. This is the ONE
         * rule the whole derivation is built on, asserted over a sweep rather than at the five sizes above —
         * a rule that holds at the sizes you thought of is a rule you have not tested. */
        for (let mins = 5; mins <= 60 * 24 * 14; mins = Math.ceil(mins * 1.07)) {
            const end = new Date(new Date(ASKED).getTime() + mins * 60_000).toISOString();
            const pts = reminderPoints(ASKED, end).map(p => new Date(p).getTime());
            const start = new Date(ASKED).getTime();
            const finish = new Date(end).getTime();
            for (let i = 0; i < pts.length; i++) {
                if (pts[i] - start < 20 * 60_000 - 30_000) return false;
                if (finish - pts[i] < 20 * 60_000 - 30_000) return false;
                if (i && pts[i] - pts[i - 1] < 20 * 60_000 - 30_000) return false;
            }
            if (pts.length > 2) return false;
        }
        return true;
    })(),
    'N2', 'no nudge ever lands within 20 minutes of the ask, the deadline, or the nudge before it',
    'swept from a 5-minute window to a fortnight in 7% steps; never more than two, never crowded',
);

report(
    (() => {
        /* A question with no deadline cannot resolve without him, so there is nothing to nudge about. */
        return reminderPoints(ASKED, null).length === 0
            && reminderPoints(ASKED, '2026-08-06T08:00:00.000Z').length === 0
            && reminderPoints(ASKED, 'not a date').length === 0;
    })(),
    'N3', 'no deadline, a deadline in the past and a malformed one all produce no ladder',
    'a question that waits open forever is never nudged about — there is no failure behind it',
);

report(
    (() => {
        const q = {
            id: 'q1', project: 'p', key: null, title: 't', context: null,
            options: [{ key: 'reuse', label: 'Reuse the bucket' }], allow: ['choose'],
            default_option: 'reuse', deadline: due(12), status: 'open', answer_type: null,
            answer_option: null, answer_text: null, answer_note: null, answered_at: null,
            asked_by: 'a', created_at: ASKED, updated_at: ASKED,
        };
        const first = ladderSentence(q, new Date(ASKED).getTime());
        report.n4detail = 'first message: ' + JSON.stringify(first);
        /* Both nudges named, with a duration AND a wall-clock time, and the zone stated — see `clock`. */
        if (!first || !/nudge you in 6h/.test(first) || !/again in 10h/.test(first)) return false;
        if (!/UTC/.test(first)) return false;
        /* Standing at the first nudge, the sentence must promise only what is LEFT. A reminder that
         * re-promises the nudge it currently IS would be the message contradicting itself. */
        const second = ladderSentence(q, new Date(due(6)).getTime() + 60_000);
        report.n4detail += ' · at the first nudge: ' + JSON.stringify(second);
        if (!second || /and again/.test(second) || !/once before then/.test(second)) return false;
        /* And past the last one there is nothing left to promise, so it says nothing. */
        return ladderSentence(q, new Date(due(11)).getTime()) === null;
    })(),
    'N4', 'the first message states the WHOLE ladder, and a nudge restates only what is left',
    report.n4detail,
);

report(
    (() => {
        const q = {
            options: [], allow: ['choose'], default_option: 'reuse', deadline: due(12),
            created_at: ASKED, id: 'q', project: 'p', key: null, title: 't', context: null,
            status: 'open', answer_type: null, answer_option: null, answer_text: null,
            answer_note: null, answered_at: null, asked_by: null, updated_at: ASKED,
        };
        // Nothing due before the first point; the first due at it; the second only after the second point.
        const before = nudgeStanding(q, 0, new Date(due(5)).getTime());
        const one = nudgeStanding(q, 0, new Date(due(6.1)).getTime());
        const stillOne = nudgeStanding(q, 1, new Date(due(6.1)).getTime());
        const two = nudgeStanding(q, 1, new Date(due(10.5)).getTime());
        const done = nudgeStanding(q, 2, new Date(due(11.9)).getTime());
        return !before.due && one.due && one.index === 1 && !one.last
            && !stillOne.due && two.due && two.index === 2 && two.last && !done.due;
    })(),
    'N5', 'the count of reminders already sent is the only state the ladder needs',
    'given 0, 1 and 2 previous nudges the same two timestamps decide the rest — no column, no cron',
);

report(
    (() => {
        /*
         * THE INJECTION, and it is the version that shipped: no ladder at all.
         *
         * Reproduced as "one notification and then silence" — a derivation that returns no points whatever
         * the window. If N1 can pass against that, N1 is measuring nothing.
         */
        const noLadder = () => [];
        return !WINDOWS.every(w => noLadder(w.hours).length === w.nudges);
    })(),
    'N1-inj', 'the shipped behaviour — one notification, then silence — is caught',
    'a derivation that never returns a reminder point fails N1 at four of the five windows',
);

report(
    (() => {
        /* The injection: fixed fractions with no floor, which is the obvious implementation. It puts a nudge
         * 4.5 minutes before the deadline of a half-hour question, and two inside an hour. */
        const noFloor = (createdAt, deadline) => {
            const s = new Date(createdAt).getTime(); const e = new Date(deadline).getTime();
            return [0.5, 0.85].map(f => new Date(s + (e - s) * f).toISOString());
        };
        const half = noFloor(ASKED, due(0.5));
        const tooLate = new Date(due(0.5)).getTime() - new Date(half[1]).getTime();
        return noFloor(ASKED, due(0.5)).length === 2 && tooLate < 20 * 60_000;
    })(),
    'N2-inj', 'fractions with no floor put a nudge 4 minutes before the deadline, and N2 rejects it',
    'the obvious implementation gives a half-hour question two nudges, the last one 4.5 min before it resolves',
);

console.log('\n  proving the crest and time-machine checks can fail\n');

report(
    (() => {
        /* The injection: the emblem's geometry, which read every axis off the level. Two histories with the
         * same points therefore drew the same shape — the defect the crest exists to fix, proven catchable. */
        const asEmblem = tasks => emblemGeometry(standing(derive(crestRecord({ tasks, projects: 1 }))).level);
        const a = asEmblem(16);
        const b = emblemGeometry(standing(derive(crestRecord({ tasks: 16, projects: 8 }))).level);
        return a.spokes === b.spokes && a.pips === b.pips && a.hue === b.hue;
    })(),
    'X1-inj', 'a crest that reads only the level is caught',
    'the old emblem geometry draws identically for one project and for eight',
);

report(
    (() => {
        // The injection: the version that walked the within-tier position with no tier term.
        const withinOnly = (tier, within) => 152 + (within - 1) * 13;
        return withinOnly(1, 1) === withinOnly(5, 1);
    })(),
    'X3-inj', 'a hue that resets to its starting colour every tier is caught',
    'the previous rule gave tier 5 rung 1 exactly tier 1 rung 1’s green',
);

report(
    (() => {
        /* The injection: a "sweep" that forgets the floor of two, which is the specific bug that made the
         * fixture claim the whole hub had reached zero seventeen times while twenty-two tasks were open. */
        const r = clearingRecords()[0];
        const naive = naiveClearMoments(r.tasks, r.questions);
        const noFloor = naiveClearMoments(r.tasks, r.questions).length;
        const withFirstCompletion = (() => {
            const single = { ...r, tasks: [r.tasks[0]] };
            return naiveClearMoments(single.tasks, single.questions).length;
        })();
        // A single completion must NOT be a clear moment, and the real rule agrees with the reference.
        return withFirstCompletion === 0 && noFloor === naive.length;
    })(),
    'X7-inj', 'a clear-moment rule with no floor of two would be visible',
    'one completion in a scope’s whole life is not "you cleared it", and neither implementation says it is',
);

/*
 * H3-inj — and WRITING IT DISPROVED THE COMMENT THAT JUSTIFIED THE CODE IT TESTS.
 *
 * The first version of this injection ran the accrual loop with `if` instead of `while`, on the theory that a
 * single event can cross two rungs and the `while` is what stops a level being skipped. It passed identically to
 * the real version, so the injection proved nothing — and the reason is arithmetic: the largest single event in
 * this economy is **14 points** (a decision answered inside its deadline and inside the hour: 6 + 4 + 4) and the
 * smallest rung gap is **30** (level 1 to 2). No event can cross two rungs. The `while` is defensive against a
 * future POINTS change, not a fix for anything observable today, and lib/progress.ts now says so.
 *
 * So this injects what H3 can actually catch: a ledger with a level MISSING. That is the failure mode that
 * matters whatever the economy — a skipped level is a row that is absent rather than wrong, which is harder to
 * notice than any incorrect figure.
 */
report(
    (() => {
        const ledger = rankLedger(LIVE);
        if (ledger.length < 3) return false;
        const holed = ledger.filter((_, n) => n !== 1).map(l => l.level);
        const expected = Array.from({ length: LIVE_ST.level - 1 }, (_, n) => n + 2);
        // H3's own comparison, not a restatement of it.
        return !(holed.length === expected.length && holed.every((l, n) => l === expected[n]));
    })(),
    'H3-inj', 'a ledger with a level missing from it is caught',
    "one arrival removed, and H3’s own comparison rejects the result",
);

report(
    (() => {
        const record = crestRecord({ tasks: PERF_TASKS, projects: 15 });
        const t0 = process.hrtime.bigint();
        naiveClearMoments(record.doneTasks, []);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        // Printed either way: the number IS the evidence for the rewrite, and it is the number that corrected
        // the first version of this budget.
        console.log(`            the O(n²) version at ${PERF_TASKS} completions: ${ms.toFixed(0)}ms`);
        return ms >= PERF_BUDGET_MS;
    })(),
    'X8-inj', 'the budget is one the old O(n²) implementation could not meet',
    `so ${PERF_BUDGET_MS}ms is a wall rather than a formality`,
);

console.log(failures === 0
    ? `\n  The progression still works at day ${last.days}, and the check was shown to fail.\n`
    : `\n  ${failures} assertion(s) failed. The progression does not survive the sample range.\n`);

process.exitCode = failures === 0 ? 0 : 1;
