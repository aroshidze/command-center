'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    asOf, crestInput, derive, emblemInk, marks as marksOf, rankLedger, standing as standingOf,
    type DeriveInput, type Mark, type RankArrival,
} from '../../lib/progress';
import { perkArrivals } from '../../lib/perks';
import { generatedPerks } from '../../lib/looks';

/**
 * The highest level the ledger reaches, which is how far the minted line has to be assembled.
 *
 * The time machine renders the PAST, so it needs every perk he could have unlocked by the end of the record and
 * not one minted for a level he has not seen. `rankLedger` records crossings, so its last entry is the top of
 * his history; an empty ledger means he has never crossed a rung and there is nothing minted to show.
 */
const topLevel = (ledger: RankArrival[]): number =>
    ledger.reduce((n, l) => Math.max(n, l.level), 1);
import Crest from './Crest';
import { humanDate } from './ui';

/**
 * THE TIME MACHINE: where he was on any day of his own record.
 *
 * ==================================================================================================
 * THIS FEATURE IS ONLY POSSIBLE BECAUSE OF A DECISION MADE MONTHS AGO
 * ==================================================================================================
 *
 * Nothing in this hub is stored. Points, level, rank, tier, marks, the crest's geometry — all of it is a fold
 * over `tasks.done_at` and `questions.answered_at`, recomputed on every render. That was adopted purely as an
 * honesty rule: a stored score can disagree with the rows it came from, and then the hub has two truths.
 *
 * The consequence nobody had noticed is that **standing at any past instant is computable.** Filter the rows to
 * that instant and run the same derivation — `asOf` in lib/progress.ts. It costs no schema change, no new
 * table, no snapshots, and it cannot drift from the live figures because it IS the live derivation with a
 * different cut-off.
 *
 * A hub with an `xp` column could not do this at any price. It would know today's total and nothing else.
 *
 * ==================================================================================================
 * WHAT IS ON THIS SURFACE, AND WHY EACH PART IS A CONTROL
 * ==================================================================================================
 *
 * docs/RESEARCH.md §14's rule applies hardest here, because a history view is the most tempting thing in the
 * world to build as a readout. So:
 *
 *   - **The scrubber** is the control. Moving it re-derives everything and redraws the crest as it was. That is
 *     the feature: not a chart of the past, but standing in it.
 *   - **The ledger** rows are dated statements, and each one is the thing that scrubs to itself — pressing
 *     "Level 4 — Fixer" puts the scrubber on the day he became Fixer. So the list is navigation for the
 *     scrubber rather than a second copy of it.
 *   - **The honesty block** is not decoration either: it is the reason the earliest part of the timeline reads
 *     the way it does, and without it the first day would silently imply a history that does not exist.
 *
 * ==================================================================================================
 * NO STREAK, AND NO CALENDAR GRID
 * ==================================================================================================
 *
 * The obvious build for "your history" is a GitHub-style contribution grid, and docs/RESEARCH.md §22 rules it
 * out on a TRUTH objection rather than a gaming one: an empty Tuesday in this hub means one of three things —
 * nothing was filed, everything filed was blocked on somebody else, or he did nothing — and a grid draws all
 * three as the same pale square. That is a graph saying something untrue about him.
 *
 * This shows the things that actually happened, each on the day it happened, and says nothing whatsoever about
 * the days between them. A day with nothing on it is not drawn, because there is nothing to draw.
 */

/** One dated thing that happened. Ranks, marks and unlocks share a shape so they can share a timeline. */
interface Moment {
    at: string;
    kind: 'rank' | 'mark' | 'look';
    label: string;
    detail: string | null;
    /** For a rank, the level — so the row can carry the crest that arrived with it. */
    level: number | null;
}

export default function Timeline({ input, marks, finish, startAt = 'now' }: {
    /**
     * The same rows the live board derives from, unfiltered.
     *
     * Passed in rather than re-fetched, because a second fetch is a second source of truth and the whole point
     * of this surface is that it is the SAME derivation at a different cut-off. If this and the pane's figures
     * could disagree, the feature would be a liability rather than a feature.
     */
    input: DeriveInput;
    /** Today's marks, so the timeline's mark rows and the record's mark list cannot differ. */
    marks: Mark[];
    /**
     * The crest finish in force.
     *
     * TODAY'S finish on a PAST crest, deliberately. The alternative — reconstructing which finish he had
     * unlocked and had chosen on that day — is not derivable at all: the choice is a preference in a cookie with
     * no history, so it would have to be invented. A past crest in today's finish is honest about the geometry
     * (which is derived and exact) and makes no claim about the finish, which is the right split.
     */
    finish: string;
    /**
     * Which end of the record to open on.
     *
     * `now` for the header chip, which is a summary of today. `first` for the pane's `since <date>` line, which
     * names the first day of the record — a control whose label is a date should land on that date, and `npm run
     * audit` caught the two of them landing identically before this existed.
     */
    startAt?: 'first' | 'now';
}) {
    const ledger = useMemo(() => rankLedger(derive(input)), [input]);

    /*
     * THE DAYS THAT HAVE SOMETHING IN THEM, which is what the scrubber walks.
     *
     * NOT every calendar day between the first and the last, and that is the same decision RESEARCH §22 makes
     * against the contribution grid. A scrubber over calendar days would spend most of its travel on days when
     * nothing was asked of him, and stopping on one of those says "nothing here" in a way that reads as a
     * verdict. Walking the moments that exist means every position on the slider is a real position in his
     * record.
     */
    const moments = useMemo<Moment[]>(() => {
        const perks = perkArrivals(ledger, marks, generatedPerks(topLevel(ledger)));
        const out: Moment[] = [
            ...ledger.map(l => ({
                at: l.at, kind: 'rank' as const,
                label: `Level ${l.level} — ${l.rank}`,
                detail: `${l.points} points`,
                level: l.level,
            })),
            ...marks.map(m => ({
                at: m.at, kind: 'mark' as const, label: m.label, detail: m.detail, level: null,
            })),
            ...perks.map(p => ({
                at: p.at, kind: 'look' as const,
                label: `${p.perk.label} unlocked`, detail: p.because, level: null,
            })),
        ];
        return out.sort((a, b) => b.at.localeCompare(a.at));
    }, [ledger, marks]);

    /*
     * The scrubbable instants: every completion and every answered decision, oldest first, plus now.
     *
     * Read off the rows rather than off `moments`, because he wants to be able to stand on the day he finished
     * something as well as on the day he was promoted — and most days are the former. `now` is last so the
     * slider's right-hand end is today, which is where it opens.
     */
    const stops = useMemo(() => {
        const s = derive(input);
        const dates = [
            ...s.finished.map(f => f.done_at),
            ...s.decisions.map(d => d.answered_at),
        ].sort();
        // Deduplicated: two things finished in the same second are one position on the slider.
        return [...new Set(dates)];
    }, [input]);

    const [i, setI] = useState(() => (startAt === 'first' ? 0 : Math.max(0, stops.length - 1)));
    /*
     * Follow `startAt` when it CHANGES, so pressing the other entry point while this is already open moves the
     * scrubber rather than doing nothing.
     *
     * Without this, the two controls would land identically again the moment the timeline was already showing —
     * which is the same defect the audit caught, in a state the audit does not visit. Keyed on `startAt` alone:
     * re-running on `stops` would drag the scrubber back to the end every time a task was ticked off, which is
     * exactly the "list reorders under your thumb" failure the hub refuses elsewhere.
     */
    useEffect(() => {
        setI(startAt === 'first' ? 0 : Math.max(0, stops.length - 1));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startAt]);
    const at = stops[Math.min(i, stops.length - 1)] ?? null;

    /*
     * The whole derivation, at that instant. One `derive` per scrub position.
     *
     * Affordable because `clearMoments` is a sweep now: 29ms at ten thousand completions, which is a year or
     * two of fifteen projects filing daily. It was 1,756ms before that rewrite, and a scrubber that froze the
     * tab for two seconds a notch would have made this feature unshippable — the performance fix and this
     * feature are the same work.
     */
    const past = useMemo(() => {
        if (!at) return null;
        const snapshot = derive(asOf(input, at));
        const st = standingOf(snapshot);
        const ms = marksOf(snapshot);
        return { snapshot, st, marks: ms, crest: crestInput(snapshot, st, ms) };
    }, [input, at]);

    if (!at || !past) {
        return (
            <p className="recordnone" data-measure="timeline">
                Nothing finished yet, so there is no history to stand in. The first task you tick off starts it.
            </p>
        );
    }

    const isNow = i >= stops.length - 1;
    const firstAt = stops[0]!;

    return (
        <div
            className="timeline"
            data-measure="timeline"
            /*
             * THE PAST LEVEL'S INK, SET ON THE WHOLE SURFACE — and this is the emblem's old bug, avoided.
             *
             * Custom properties inherit DOWNWARD only. `Crest` sets `--emblem-ink` on its own `<svg>`, which
             * put it out of reach of the panel around it, the scrubber below it and the ledger's rank markers —
             * exactly how the progress bar spent its whole life painting `var(--emblem-ink, var(--ok))`'s
             * fallback green. Set here, all four scrub together.
             *
             * And it is the ink of the level he had THEN, not now. Dragging back to June turns the panel, the
             * slider and the rank pips back to June's hue. That is the entire feeling of the surface, and it
             * costs one inherited property.
             */
            style={{ ['--emblem-ink' as string]: emblemInk(past.st.level) }}
        >
            {/*
              * WHERE HE IS STANDING. The crest, the rank and the figures, all as of the selected instant.
              *
              * The crest is the point of this panel. A rank and a point total are numbers he can imagine; the
              * SHAPE he had in June is a thing he has never seen, because the only crest that has ever been
              * drawn is today's.
              */}
            <div className="tmstand">
                <Crest c={past.crest} size={104} finish={finish} />
                <div className="tmwho">
                    <p className="tmwhen" data-measure="timeline-at">
                        {isNow ? 'Today' : humanDate(at)}
                        {/* The year, but only when the record spans one — a "24 Jul 2026" on an eight-day
                            record is precision about nothing. */}
                        {!isNow && new Date(at).getUTCFullYear() !== new Date().getUTCFullYear()
                            && ` ${new Date(at).getUTCFullYear()}`}
                    </p>
                    <p className="rank">{past.st.rank}</p>
                    <p className="tmfigures">
                        Level <b>{past.st.level}</b>
                        {' · '}<b>{past.st.points}</b> pts
                        {' · '}<b>{past.snapshot.tasksDone}</b> finished
                        {past.snapshot.decisionsMade > 0 && <> · <b>{past.snapshot.decisionsMade}</b> decided</>}
                        {' · '}<b>{past.marks.length}</b> mark{past.marks.length === 1 ? '' : 's'}
                    </p>
                </div>
            </div>

            {/*
              * THE SCRUBBER.
              *
              * A native `range` input, deliberately. A hand-built slider would need pointer capture, keyboard
              * handling, ARIA value semantics and a focus ring — all of which this gets for free and correctly,
              * and none of which is worth reimplementing for a control whose whole job is to be dragged. The
              * project has four runtime dependencies; a slider library would have been the fifth and the worst.
              *
              * `aria-valuetext` rather than leaving the raw index to be announced: "position 6 of 11" says
              * nothing, "24 Jul, Operator, level 3" is the actual state.
              */}
            <label className="tmscrubwrap">
                {/*
                  * NO COUNT HERE, AND THAT IS A FIX. It read "{stops.length} moments" while the tab above it
                  * read "Timeline 12" — two different numbers on one screen using the same word. Both were
                  * true under different definitions (scrub stops are completions and decisions; the tab counts
                  * ranks, marks and unlocks) and neither said which, which is docs/RESEARCH.md §7's trust gap
                  * in miniature and the exact defect the per-project open counts were already fixed for once.
                  * The count added nothing the date range does not, so it goes.
                  */}
                <span className="tmscrublabel">
                    Drag to stand anywhere in your record — {humanDate(firstAt)} to today
                </span>
                <input
                    className="tmscrub"
                    type="range"
                    min={0}
                    max={Math.max(0, stops.length - 1)}
                    step={1}
                    value={Math.min(i, stops.length - 1)}
                    data-measure="timeline-scrub"
                    aria-label="Stand at a point in your record"
                    aria-valuetext={`${humanDate(at)}, ${past.st.rank}, level ${past.st.level}`}
                    onChange={e => setI(+e.target.value)}
                />
            </label>

            {/*
              * HOW THIN THE EARLY RECORD IS, SAID OUT LOUD.
              *
              * The brief asked for this specifically and it is the difference between a history view and a
              * history view that lies. Two facts, both on the record rather than guessed at (docs/RESEARCH.md
              * §17): seventeen tasks were migrated with `created_at` set to the migration time, and early proof
              * runs destroyed roughly 611 rows of the event log.
              *
              * So the earliest part of the scrubber is the day the hub was MIGRATED, not the day the work
              * happened. Rendered as part of the surface rather than as a footnote, because a caveat below a
              * chart is a caveat nobody reads — and because the point of saying it is that he can trust the
              * rest.
              */}
            <p className="tmhonest" data-measure="timeline-honesty">
                This is derived, not recorded — the same figures the rest of the hub shows, with the rows cut off
                at the moment you have chosen. Two things it cannot know: seventeen early tasks were migrated in
                with one shared date, so they all land on the same day; and a note has no date of its own, so a
                note you wrote today counts from the moment its task was finished.
            </p>

            {/*
              * THE LEDGER. Every rank, mark and unlock, on the day it happened, newest first.
              *
              * Each row scrubs to itself, which is what stops this being a second readout of the same data:
              * pressing "Level 4 — Fixer" puts you where you were the day you became Fixer. That satisfies §14
              * and it is also just the thing you want to do when you read the row.
              */}
            <ul className="tmledger" data-measure="timeline-ledger">
                {moments.map((m, n) => {
                    /*
                     * Where this moment sits on the slider: the last stop at or before it.
                     *
                     * `at or before` rather than exactly equal, because a rank arrival's timestamp IS one of the
                     * stops (it is the completion that crossed the rung) while a mark's may not be — `two-hours`
                     * is dated from `lastDoneAt`, and the breadth marks from the completion that reached the
                     * count. An exact match would have left some rows dead, which is worse than approximate
                     * navigation: a control that does nothing is the thing §14 forbids outright.
                     */
                    let stop = 0;
                    for (let k = 0; k < stops.length; k++) if (stops[k]! <= m.at) stop = k;
                    return (
                        <li key={`${m.kind}-${m.label}-${n}`} data-measure="timeline-moment" data-kind={m.kind}>
                            <button
                                className={`tmrow${stop === Math.min(i, stops.length - 1) ? ' on' : ''}`}
                                onClick={() => setI(stop)}
                                aria-label={`Stand where you were on ${humanDate(m.at)}: ${m.label}`}
                            >
                                <span className={`tmkind ${m.kind}`} aria-hidden="true" />
                                <span className="tmbody">
                                    <span className="tmlabel">{m.label}</span>
                                    {m.detail && <span className="tmdetail">{m.detail}</span>}
                                </span>
                                <span className="tmdate">{humanDate(m.at)}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Exported so the record's tab can say how many moments there are without building the list twice. */
export function momentCount(input: DeriveInput, marks: Mark[]): number {
    const ledger: RankArrival[] = rankLedger(derive(input));
    return ledger.length + marks.length + perkArrivals(ledger, marks, generatedPerks(topLevel(ledger))).length;
}
