import { notFound } from 'next/navigation';
import Crest, { CHARGE_NAME } from '../components/Crest';
import {
    crestGeometry, crestInput, derive, marks as marksOf, POINTS, rungAt, standing as standingOf,
    type CrestInput,
} from '../../lib/progress';
import type { Question } from '../../lib/types';

/**
 * The crest at every shape it will ever draw — a bench, not a feature.
 *
 * WHY THIS PAGE EXISTS
 *
 * The crest is derived from rows, which is exactly right and makes one thing impossible: seeing what it looks
 * like at level 33, or with eight projects, or with a tier-4 mark, without doing thousands of real tasks
 * first. The fixture tops out around level 3 with four projects, so for the whole life of the component that
 * preceded this one **every screenshot ever taken of it was of tier 1** — and the change that made it keep
 * evolving past level 10 would have shipped unlooked-at. This project's entire history is defects found by
 * looking (docs/DECISION.md), so a state that cannot be looked at is a state that will be wrong.
 *
 * It has already earned itself three times. Rendering the emblem across tiers found rings colliding with the
 * core at tier 5, a spoke reset that made level 11 look emptier than level 10, and a hue that wrapped back to
 * its starting green. All three were invisible in the code and obvious in a picture.
 *
 * WHAT MAKES IT SAFE, AND WHY IT IS STRONGER THAN THE VERSION IT REPLACES
 *
 * The old bench handed `standing()` a synthetic task count. That was honest about the LADDER and could say
 * nothing about anything else, because the emblem only depended on the ladder. The crest depends on marks, on
 * project breadth and on estimated minutes, so this builds **whole synthetic histories** — real rows, run
 * through the real `derive` -> `standing` -> `marks` -> `crestInput` pipeline. Nothing on this page is a
 * hand-written `CrestInput`, which means the bench cannot display a crest the live code is incapable of
 * producing. That is the one thing a bench must not do.
 *
 * It says on the page, in the largest text on it, that every history here is invented. It reads and writes no
 * database, so it cannot claim anything about what he has actually done. And it is **404 in production**,
 * gated on `NODE_ENV` rather than on a flag that could be set by accident — the same way fault injection is
 * (`faultsEnabled` in lib/db.ts). A page that invents a level must not be reachable on the hub whose whole
 * premise is that it only ever shows true ones.
 */
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
/** A fixed epoch, so the bench renders identically on every run and two screenshots are comparable. */
const T0 = Date.parse('2026-01-05T09:00:00.000Z');
const at = (dayOffset: number, minuteOffset = 0) =>
    new Date(T0 + dayOffset * DAY + minuteOffset * 60_000).toISOString();

interface Recipe {
    what: string;
    /**
     * How many finished tasks, spread over `projects`. Either this or `level`.
     *
     * `level` SOLVES FOR THIS, and that is a correctness fix rather than a convenience. The first version of
     * this bench hand-picked task counts and labelled the rows with the level it expected — and three of them
     * were wrong: "level 10 — top of the names" rendered a level 9 crest, "level 20" rendered 13, "level 21 —
     * tier 3" rendered 14. A bench whose captions disagree with its own pictures is worse than no bench,
     * because it is the thing you check the pictures against.
     *
     * Solving from `rungAt` means the caption cannot drift from the ladder, and if the ladder is ever extended
     * again the rows that exist to photograph a tier boundary still land on it.
     */
    tasks?: number;
    /** Land exactly on this level, whatever the ladder currently says it costs. Either this or `tasks`. */
    level?: number;
    /** How many distinct projects those completions land in. */
    projects: number;
    /** How many of the completions carry a note back to the agent. */
    notes?: number;
    /** How many answered decisions, all of them beating a stated deadline. */
    decisions?: number;
    /** One decision answered inside fifteen minutes, which is the `speed` mark. */
    fast?: boolean;
    /** The largest step count among the completions, which is what the `depth` marks read. */
    steps?: number;
    /** Minutes on every completion. Drives the rims and the `time` marks. */
    minutesEach?: number;
    /** Leave a project with nothing open, which is what `clearing` reconstructs. */
    clearOne?: boolean;
    /** Put a week-long gap in the record, which is the `return` mark — the inverse of a streak. */
    gap?: boolean;
}

/**
 * Turn a recipe into a real `CrestInput`, through the real pipeline.
 *
 * Every row here is a plain object of the same shape `board()` sends, so `derive` cannot tell it from
 * production data — which is the point. The only invention is the CONTENT.
 */
function historyOf(r: Recipe): { crest: CrestInput; level: number; rank: string; points: number } {
    const slugs = Array.from({ length: r.projects }, (_, i) => BENCH_PROJECTS[i % BENCH_PROJECTS.length]!);
    /*
     * Solve for the task count when a level was asked for.
     *
     * Every point that is NOT a finished task is known up front from the recipe — a note back is 4, a decision
     * answered before its deadline is 6 + 4, and the one `fast` decision adds another 4 — so what remains is
     * arithmetic. The POINTS table is imported rather than restated, so a change to the economy moves this with
     * it instead of leaving the bench quietly landing a level low.
     */
    const taskCount = r.tasks ?? (() => {
        const notPoints =
            (r.notes ?? 0) * POINTS.taskWithNote +
            (r.decisions ?? 0) * (POINTS.decision + POINTS.decisionBeforeDeadline) +
            (r.fast ? POINTS.decisionUnderAnHour : 0);
        return Math.max(1, Math.ceil((rungAt(r.level!) - notPoints) / POINTS.taskDone));
    })();

    const doneTasks = Array.from({ length: taskCount }, (_, i) => {
        // A gap of nine days two thirds of the way through, when asked for: the `comebacks` measurement.
        const day = i + (r.gap && i > (taskCount * 2) / 3 ? 9 : 0);
        return {
            id: `b${i}`,
            project: slugs[i % slugs.length]!,
            title: `Invented completion ${i + 1}`,
            why: 'Invented.',
            minutes: r.minutesEach ?? 20,
            stepCount: i === 0 ? (r.steps ?? 2) : 2,
            status: 'done' as const,
            note: i < (r.notes ?? 0) ? 'Invented note.' : null,
            /* Both, because they answer different questions on a real row: `note` is the text the record
               renders and `noted` is what the points read. See `FinishedRow.noted`. */
            noted: i < (r.notes ?? 0),
            created_at: at(day - 1),
            done_at: at(day),
        };
    });

    const answeredQuestions: Question[] = Array.from({ length: r.decisions ?? 0 }, (_, i) => ({
        id: `q${i}`, project: slugs[i % slugs.length]!, key: null,
        title: `Invented decision ${i + 1}`, context: null,
        options: [{ key: 'a', label: 'Option A' }],
        allow: ['choose'], default_option: 'a',
        deadline: at(i, 240),
        status: 'answered', answer_type: 'choose', answer_option: 'a', answer_text: null,
        answer_note: null,
        // Ten minutes for the first when `fast`, so exactly one decision earns the sub-quarter-hour mark.
        answered_at: at(i, r.fast && i === 0 ? 10 : 120),
        asked_by: 'bench', created_at: at(i), updated_at: at(i),
    }));

    /*
     * ONE OPEN TASK unless the recipe asks for a cleared project.
     *
     * `clearMoments` reconstructs the moments a scope held nothing outstanding, and it needs at least two
     * items to have existed before a zero means anything — doing your only task is "your first one", not
     * "you cleared the hub". So an open task in a different project is what makes the CLEARED one a real,
     * scoped clear moment rather than a whole-hub one, and leaving it out is what produces the all-clear.
     */
    const openTasks = r.clearOne ? [] : [{
        id: 'open1', project: slugs[0]!, key: null, title: 'Invented open task', why: null,
        minutes: 10, steps: [], verify: null, gotchas: [], blocked_reason: null,
        status: 'open' as const, note: null,
        created_at: at(taskCount + 1), updated_at: at(taskCount + 1), done_at: null,
    }];

    const progress = derive({ doneTasks, answeredQuestions, openTasks, openQuestions: [] });
    const st = standingOf(progress);
    return {
        crest: crestInput(progress, st, marksOf(progress)),
        level: st.level, rank: st.rank, points: st.points,
    };
}

/**
 * The project slugs the bench uses, and they are the FIXTURE's slugs on purpose.
 *
 * The pales carry each project's real hue, so a bench that invented slugs would be photographing hues that
 * exist nowhere else. Using the ones the fixture and the screenshots already contain means the bands on this
 * page are the same colours as the bands on his own crest — which is the only way looking at this tells you
 * anything about looking at that.
 */
const BENCH_PROJECTS = [
    'harbour-lights', 'cold-brew', 'tuck-shop', 'nine-panels',
    'riff-kitchen', 'pin-drop', 'grey-backdrop', 'ledger-nine', 'tenth-thing',
];

/**
 * The histories, chosen to vary ONE axis at a time wherever possible.
 *
 * A grid of "level 1, 5, 10, 20…" is what the old bench was, and it could only ever have caught defects in
 * the ladder. Half of these hold the level roughly still and move breadth, or rarity, or the rosette — which
 * is where the crest's new dimensions live and therefore where its new defects will be.
 */
const RECIPES: Recipe[] = [
    { what: 'day one', tasks: 1, projects: 1 },
    { what: 'a first week', tasks: 4, projects: 2, notes: 1 },
    { what: 'his real hub, 1 Aug 2026', tasks: 14, projects: 3, notes: 5, decisions: 5, fast: true },
    { what: 'same volume, ONE project', tasks: 14, projects: 1, notes: 5, decisions: 5, fast: true },
    { what: 'same volume, EIGHT projects', tasks: 16, projects: 8, notes: 5, decisions: 5, fast: true },
    { what: 'nine projects — one band over the cap', tasks: 18, projects: 9, notes: 6, decisions: 5 },
    { what: 'a cleared project', tasks: 10, projects: 2, notes: 4, decisions: 3, clearOne: true },
    { what: 'a 24-step procedure', tasks: 12, projects: 3, steps: 24, notes: 4, decisions: 4 },
    { what: 'ten hours of estimates', tasks: 14, projects: 3, minutesEach: 45, notes: 5, decisions: 4 },
    { what: 'came back after nine days', tasks: 12, projects: 3, notes: 4, decisions: 3, gap: true },
    /*
     * The tier boundaries, which are the shapes most likely to be wrong and the ones real data can never
     * reach. Level 10 is the top of the named ranks; 11 is where the rays reset and the second pip arrives.
     * Both are solved from `rungAt` rather than guessed — see `Recipe.tasks`.
     */
    { what: 'top of the named ranks', level: 10, projects: 4, notes: 40, decisions: 20, fast: true },
    { what: 'one rung later — tier 2 begins', level: 11, projects: 4, notes: 45, decisions: 22, fast: true },
    { what: 'the end of tier 2', level: 20, projects: 5, notes: 120, decisions: 60, fast: true, steps: 22 },
    { what: 'tier 3 begins', level: 21, projects: 6, notes: 140, decisions: 70, fast: true, steps: 22 },
    { what: 'tier 4 begins', level: 31, projects: 7, notes: 220, decisions: 110, fast: true, steps: 26 },
    {
        what: 'tier 5 begins — the emptiest a promotion can look', level: 41, projects: 8,
        notes: 300, decisions: 150, fast: true, steps: 26, minutesEach: 30, gap: true,
    },
    {
        what: 'roughly year ten', level: 69, projects: 8,
        notes: 900, decisions: 500, fast: true, steps: 30, minutesEach: 30, gap: true,
    },
    {
        what: 'where the hue ramp saturates', level: 121, projects: 9,
        notes: 2100, decisions: 1200, fast: true, steps: 30, minutesEach: 30, gap: true,
    },
];

export default async function CrestBench() {
    // Not reachable on the deployed hub. See the header.
    if (process.env.NODE_ENV === 'production') notFound();

    const built = RECIPES.map(r => ({ r, ...historyOf(r) }));

    return (
        <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto' }}>
            <h1 style={{ marginBottom: 4 }}>Crest bench</h1>
            <p className="why" style={{ marginBottom: 4 }}>
                <strong>Every history here is INVENTED.</strong> This page builds synthetic rows, runs them
                through the real <code>derive → standing → marks → crestInput</code> pipeline and renders the
                real component, so nothing on it is a shape the live code could not produce. It reads no
                database, claims nothing about finished work, and is 404 in production.
            </p>
            <p className="why" style={{ marginBottom: 20 }}>
                Levels 1–10 are the first set of ten, and the ticks and the top marks carry exactly the counts
                they always did. The <strong>stripes</strong> are projects. The <strong>shape in the middle</strong>
                is one of nine designed devices, SELECTED by how many kinds of mark he holds rather than computed
                from the number — so its proportions are chosen because they look right, which an N-sided hole never
                could be. The <strong>ten ticks</strong> around it are the level; the <strong>dot at the
                centre</strong> is the rarest mark held; and the <strong>outline</strong> gains a line with the
                estimated hours. Two rows with the same level and different histories must be visibly different
                crests — rows 4, 5 and 6 exist to prove that.
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: 18,
            }}>
                {built.map(({ r, crest, level, rank, points }, i) => {
                    const g = crestGeometry(crest);
                    return (
                        <div
                            key={i}
                            data-measure="bench-emblem"
                            data-level={level}
                            data-pales={g.pales.length}
                            data-facets={g.facets}
                            data-rarity={g.rarity}
                            data-rims={g.rims}
                            style={{
                                background: 'var(--s1)', border: '1px solid var(--line)',
                                borderRadius: 12, padding: 14, textAlign: 'center',
                            }}
                        >
                            <Crest c={crest} size={116} />
                            <p style={{ fontWeight: 650, marginTop: 8 }}>Level {level}</p>
                            <p className="why" style={{ fontSize: 12, marginTop: 2 }}>{r.what}</p>
                            <p className="why" style={{ fontSize: 11, marginTop: 8, opacity: 0.85 }}>
                                {rank} · {points} pts
                            </p>
                            <p className="why" style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                                {g.rays} ray{g.rays === 1 ? '' : 's'} · {g.pips} pip{g.pips === 1 ? '' : 's'}
                                {' · '}{g.pales.length} band{g.pales.length === 1 ? '' : 's'}
                                {g.palesOver > 0 ? ` (+${g.palesOver})` : ''}
                                {' · '}{CHARGE_NAME[g.facets - 1]}
                                {g.kinds !== g.facets ? ` (${g.kinds} kinds)` : ''}
                                {' · rarity '}{g.rarity} · {g.rims} rim{g.rims === 1 ? '' : 's'}
                                {' · hue '}{g.hue}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* The thresholds, printed from `rungAt` rather than restated, so this cannot drift from the
                ladder it describes. */}
            <p className="why" style={{ marginTop: 20 }}>
                Rungs: {[1, 5, 10, 11, 20, 21, 30].map(l => `L${l} at ${rungAt(l)}`).join(' · ')}
            </p>
        </div>
    );
}
