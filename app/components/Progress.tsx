'use client';

import type { Mark, NextMark, ProgressSnapshot } from '../../lib/progress';
import { humanCount, humanDate, humanMinutes } from './ui';

/** Kept in step with Board's copy on purpose — see the comment there. Progress must not import from Board. */
type RecordSection = 'tasks' | 'decisions' | 'marks' | 'said' | 'timeline';

/**
 * The record, in the reading pane: two figures, the marks, and what is next.
 *
 * WHAT THIS LOOKED LIKE BEFORE, AND WHY IT WAS WRONG
 *
 * The first version put five uppercase headings and a block of quoted prose in a 420px column, and the owner's
 * reaction to the whole page was "a gigantic wall of text". He was right, and the specific mistake is worth
 * recording because it is easy to repeat:
 *
 *   The fixture's `why` values were each one short sentence. Real ones are three to five lines — agents write
 *   "Opens the one traffic channel that does not need Google to trust us first. Pins keep working for months,
 *   so this compounds while you sleep…". So the pane was designed against text that does not exist, and every
 *   screenshot filed as evidence was of the easy case. The fixture carries near-maximum-length `why` values
 *   now, which is what a fixture is for.
 *
 * The fix is not smaller type, it is putting the prose where prose fits. Long-form `why` text belongs in the
 * full record, which is full-width and one press away; this pane holds figures, dated marks, and one line of
 * what is coming. Everything here is short by construction rather than by clamping, which is the difference
 * between restrained and truncated.
 */
export default function Progress({ s, marks, next, showing, onShowFinished }: {
    s: ProgressSnapshot;
    marks: Mark[];
    next: NextMark[];
    /**
     * WHICH section of the record is open, or null when the queue is showing — not a boolean.
     *
     * It was `showing: boolean`, so both figures rendered `.on` and `aria-pressed` whenever the record was open
     * at all. Pressing "13 finished" lit up "5 decided" as well, which says the two are one control, and a
     * pressed state that is wrong is worse than none: it is the interface asserting something about what you
     * just did. Found by the owner, again, on a screenshot with a box drawn round both of them.
     */
    showing: RecordSection | null;
    /**
     * Opens the record ON A NAMED SECTION.
     *
     * It used to take no argument, and all three controls in this component called it — so "13 finished",
     * "5 decided" and "8 more marks" were three buttons that did one thing. A figure that opens something
     * unrelated to itself is worse than a figure that does nothing, because it looks like navigation and is not.
     */
    /**
     * Opens the record ON A NAMED SECTION, and — for the timeline — at a named point in it.
     *
     * The second argument exists because `npm run audit` caught this control and the header chip landing
     * identically. "since 24 Jul" names a date, so it opens standing on that date; the header chip is a summary,
     * so it opens on today. Two questions, two answers, one surface.
     */
    onShowFinished: (where: RecordSection, at?: 'first' | 'now') => void;
}) {
    // Nothing finished yet. Said as a beginning rather than as an absence — a record that opens by looking
    // broken is one nobody comes back to.
    if (s.tasksDone === 0 && s.decisionsMade === 0) {
        return (
            <section className="record">
                <h2>What you have finished</h2>
                <p className="recordnone">
                    Nothing yet. The first task you tick off shows up here, with what it unblocked.
                </p>
            </section>
        );
    }

    return (
        <section className="record">
            <h2>What you have finished</h2>

            {/*
              * Two figures, one row, no sub-prose.
              *
              * These used to carry an explanatory line each ("each one was an agent that stopped waiting"),
              * which is four lines of editorial on two numbers that already say what they are. Both are still
              * controls — pressing either opens the full record, which is what keeps them from being a
              * readout (docs/RESEARCH.md §14, check P4).
              */}
            <div className="figures">
                <button
                    className={`figure${showing === 'tasks' ? ' on' : ''}`}
                    data-measure="progress-figure"
                    data-figure="tasks-done"
                    aria-pressed={showing === 'tasks'}
                    onClick={() => onShowFinished('tasks')}
                >
                    <b className="num">{humanCount(s.tasksDone)}</b>
                    <span className="figlabel">finished</span>
                </button>

                <button
                    className={`figure${showing === 'decisions' ? ' on' : ''}`}
                    data-measure="progress-figure"
                    data-figure="decisions-made"
                    aria-pressed={showing === 'decisions'}
                    onClick={() => onShowFinished('decisions')}
                >
                    <b className="num">{humanCount(s.decisionsMade)}</b>
                    <span className="figlabel">decided</span>
                </button>
            </div>

            {/*
              * The age of the record and the time estimate, on ONE line.
              *
              * The date comes from `min(done_at)`: the real hub's history is thin — seventeen tasks were
              * migrated with `created_at` set to the migration time, and early proof runs deleted most of the
              * event log — so a surface implying more than exists would be the first untrue thing on the page.
              *
              * "estimated" is on screen next to the minutes because `minutes` is a number an agent typed, not
              * one anybody measured. A guess rendered as a fact is the quiet version of a badge for something
              * you did not do; check U1 asserts the word is present.
              */}
            {/*
              * AND IT IS THE WAY INTO THE TIME MACHINE, which is what turned it from a readout into a control.
              *
              * This line was the only element in the pane that failed docs/RESEARCH.md §14 outright once the
              * pane hint was removed: two true figures that did nothing when pressed. The rule's refinement
              * matters as much as the rule — a control has to land somewhere RELATED TO ITSELF, which is why
              * four buttons opening one destination was a defect. "since 24 Jul" is literally the first day of
              * his record, so the surface that lets him stand anywhere in that record is the one thing this
              * line could open without being arbitrary.
              *
              * It costs zero pixels, which is the reason it is here rather than as a new footer link: check L7
              * holds the idle pane at zero spare on a monitor, and the crest has already spent what the pane
              * hint freed.
              */}
            <button
                className={`recordsince asbutton${showing === 'timeline' ? ' on' : ''}`}
                data-measure="progress-figure"
                data-figure="record-since"
                aria-pressed={showing === 'timeline'}
                title="Stand anywhere in your own record"
                onClick={() => onShowFinished('timeline', 'first')}
            >
                {s.firstDoneAt && <>since {humanDate(s.firstDoneAt)}</>}
                {s.minutesEstimated > 0 && (
                    <>
                        {s.firstDoneAt ? ' · ' : ''}
                        <span data-figure="minutes-estimate">{humanMinutes(s.minutesEstimated)}</span>
                        {' estimated'}
                    </>
                )}
                <span className="sincego"> — go back to the start →</span>
            </button>

            {/*
              * MARKS. Two, then a control to the rest — the full list lives in the record view where each
              * one has room for its detail line.
              *
              * Drawn as dated rows rather than as bordered boxes. Four boxes of two lines each was eight lines
              * of near-identical structure, which is what a badge grid feels like and what this is trying not
              * to be. A mark is a fact with a date on it, so it is typeset like one.
              */}
            {marks.length > 0 && (
                <>
                    <h3 className="recordsub">Marks</h3>
                    <ul className="marks">
                        {marks.slice(0, 2).map(m => (
                            <li key={m.slug} data-measure="milestone" data-milestone={m.slug}
                                data-tier={m.tier}>
                                <span className="markpip" aria-hidden="true" />
                                <span className="marklabel">{m.label}</span>
                                <span className="markwhen">{humanDate(m.at)}</span>
                            </li>
                        ))}
                    </ul>
                    {marks.length > 2 && (
                        <button className="morelink" onClick={() => onShowFinished('marks')}>
                            {marks.length - 2} more mark{marks.length - 2 === 1 ? '' : 's'}
                        </button>
                    )}
                </>
            )}

            {/*
              * WHAT IS COMING.
              *
              * This is the part docs/RESEARCH.md §19 argues against — a stated target is the *controlling*
              * form of feedback, and the informational form is the one the evidence supports. He asked for it
              * twice, explicitly, to be able to feel progression. So the rule that replaced "never show a
              * target" is narrower and it is the one that actually protects him:
              *
              *   **A STATED TARGET MUST BE ARITHMETICALLY TRUE.** `toGo` is `need - have` and nothing else.
              *   Check P5 parses these numbers off the rendered page and asserts them against the derivation.
              *
              * Two at most, nearest first. A long list of things he has not done is a to-do list of
              * achievements, which is the version of this that gets closed and not reopened.
              */}
            {next.length > 0 && (
                <>
                    <h3 className="recordsub">Next</h3>
                    <ul className="nextup" data-measure="next-up">
                        {next.map(n => (
                            <li key={n.slug} data-next={n.slug}>
                                <span className="marklabel">{n.label}</span>
                                {/*
                                  * The UNIT, when the remainder is not a count of things he does.
                                  *
                                  * The live hub read "Worked through a 20-step procedure — 1 to go" beside a
                                  * finished 19-step task. Arithmetically true and read wrong: that 1 is one more
                                  * STEP inside some future task, not one more task to finish. A target that is
                                  * true and misread is still a target that misleads, which is the whole thing
                                  * check P5 exists to prevent — and P5 could not catch it, because the number
                                  * was correct. Only looking at the real thing caught it.
                                  */}
                                <span className="nextgo">
                                    <b data-have={n.have} data-need={n.need}>{n.toGo}</b>
                                    {n.unit ? ` ${n.unit}${n.toGo === 1 ? '' : 's'} to go` : ' to go'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
