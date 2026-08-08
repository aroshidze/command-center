'use client';

import { useState } from 'react';
import { emblemInk, type CrestInput, type Standing } from '../../lib/progress';
import Crest from './Crest';
import { humanCount } from './ui';
import CrestKey from './CrestKey';

/**
 * Standing: the rank, the level, and how far through it he is.
 *
 * THE HONESTY MACHINERY, WHICH IS THE ONLY REASON THIS IS SAFE TO SHIP
 *
 * A level is the most inflatable thing an interface can show. This one cannot inflate, for three reasons that
 * are worth stating together because each one on its own would not be enough:
 *
 *   1. **It is derived.** `standing()` is a pure function of the same rows the queue renders. There is no
 *      `level` column and no `xp` column — see the header of lib/progress.ts. Re-open a task and the points
 *      drop; if that crosses a boundary the level drops with them, and the emblem loses a spoke.
 *   2. **Every point is itemised.** Press the score and it lists exactly where each point came from, with the
 *      count and the rate, summing to the total. An opaque number asks for trust; this shows its working.
 *   3. **Nothing an agent does can move it.** Points come only from what HE did — see the POINTS table. The
 *      two most satisfying candidates, "cleared a project" and "the hub reached zero", are deliberately NOT
 *      scored, because both depend on how much is currently open, so an agent filing one task overnight would
 *      have silently deleted the bonus and dropped his level. A score that falls while you sleep is a score
 *      you would be right to stop believing.
 *
 * And the counterweight, recorded because it is real: docs/RESEARCH.md §19 argues against levels, with
 * evidence — Hanus & Fox measured badges-and-a-leaderboard over sixteen weeks and watched motivation fall.
 * He read that and asked for levels twice. It is his tool; the evidence is on the record, and what was
 * non-negotiable was never "no levels", it was "no lies".
 */
export default function Profile({ s, crest, finish, struck = null }: {
    s: Standing;
    crest: CrestInput;
    /** The unlocked crest finish in force. See lib/finishes.ts. */
    finish: string;
    /**
     * The level he was struck to in THIS session, or null — the level-up moment.
     *
     * Defaulted so `/looks`, the bench and the time machine, which render a crest with no session behind them,
     * need no argument and can never accidentally celebrate a level reached last week.
     *
     * See the block above `seenLevel` in Board.tsx for why this is legal under the rule that nothing carrying
     * truth may move: no number animates, and the mark cannot begin until the server has confirmed the write it
     * is derived from.
     */
    struck?: number | null;
}) {
    const [open, setOpen] = useState(false);
    /*
     * The crest's own receipt, and it is a SEPARATE disclosure from the points receipt.
     *
     * One shared `open` was the first version and it was wrong in a way worth recording: the two answer
     * different questions — "where did my score come from" and "why does my crest look like that" — and
     * opening both at once put 14 rows in a pane that has zero pixels spare at 1920 (check L7). Two states
     * cost one line of code; one state cost a check.
     */
    const [key, setKey] = useState(false);

    /*
     * WHAT THE POINTS ARE ACTUALLY BUYING — and this line named the rank he already held nine levels in ten.
     *
     * `standing.nextRank` is `rankFor(level + 1)`, which is correct by its own definition and the wrong thing to
     * print: above the named ten a rank spans ten levels, so at level 32 both the current and the next level are
     * "Ground control IV" and the panel read **"2,580 more to Ground control IV"** directly under a heading
     * reading "Ground control IV". A target that names something he has is not a target, and it is the most
     * prominent sentence on the one panel whose whole job is to make progress feel real.
     *
     * Found by rendering two years of volume (§XXVII). Nothing below level 11 can show it, and no fixture state
     * goes past level 3 — so nine suites and every screenshot ever filed were looking at the one range where
     * `nextRank` and `rank` always differ.
     *
     * So the line names whichever thing the next rung actually changes: the RANK when the rank changes, and the
     * LEVEL when it does not. Both are true statements about the same arithmetic, and the number in front of them
     * is untouched — check P5 still reads it off the page and asserts it equals `nextAt - points`.
     */
    const nextIs = !s.nextRank ? null
        : s.nextRank !== s.rank ? s.nextRank
            : `level ${s.level + 1}`;

    /*
     * `struck` is keyed into the class AND into a `key` on the crest wrapper.
     *
     * The class is what the stylesheet animates. The key is what makes a SECOND level-up in one session mark
     * itself: a CSS animation on an element that is already mounted with that class does not restart, so ticking
     * two tasks that each cross a rung would have marked the first and silently ignored the second. Changing the
     * key remounts the wrapper, which starts the animation from zero. Keyed on the LEVEL rather than on a counter
     * so it is still derived — the same level twice is the same event.
     */
    return (
        <section
            className={`standing${struck !== null ? ' struck' : ''}`}
            data-measure="progress"
            /* Read by the check in tests/use-it.mjs, which ticks a task across a rung and asserts the moment
               happened. An animation nothing can observe is an animation that silently stops working. */
            data-struck={struck ?? undefined}
            /*
             * THE LEVEL'S HUE, SET HERE RATHER THAN ON THE SVG — which is a bug fix, not a tidy-up.
             *
             * Custom properties inherit downward only. Setting `--emblem-ink` inside `Emblem` put it out of reach
             * of everything around it: the panel's tint, the level numeral, and `.fill` on the progress bar,
             * which reads `var(--emblem-ink, var(--ok))` and has therefore been painting its fallback for the
             * whole life of that rule. Set on the panel, all three get the colour the level actually earned.
             *
             * Derived, so it cannot flatter: re-open a task, the points drop, and if that crosses a boundary the
             * hue moves back with the spoke the emblem loses.
             */
            style={{ ['--emblem-ink' as string]: emblemInk(s.level) }}
        >
            <div className="standingtop">
                {/*
                  * THE CREST IS A CONTROL, and that is the rule rather than a flourish.
                  *
                  * docs/RESEARCH.md §14: if pressing it does nothing, it does not go on the page. A crest is
                  * the most decorative object this interface has ever drawn, so it is the one that owes that
                  * rule the most — and what it opens is not a legend, it is the receipt for itself: every part,
                  * what it is derived from, and his real number for it. See CrestKey.tsx.
                  *
                  * It also pays a debt the graphic would otherwise carry silently: the project stripes are
                  * capped at eight, which rounds in the direction of looking better, so the panel says so — and
                  * only when the cap actually bites. (There were two such debts; the other was a floor on the
                  * old polygonal keyway, and it is gone because that shape is gone.)
                  */}
                <button
                    className="crestbtn"
                    data-measure="crest"
                    aria-expanded={key}
                    title="What your crest is made of, and where each part comes from"
                    onClick={() => setKey(k => !k)}
                >
                    {/*
                      * THE STRIKE, and it is a sibling of the crest rather than a filter on it.
                      *
                      * A ring that expands out of the crest and fades once. Drawn as its own element so the crest
                      * itself is never scaled or moved: the crest is the object that carries six countable facts,
                      * and a transform on it would make every one of them momentarily the wrong size — which is
                      * the spirit of §2.3 even though the letter of it is about numbers. The ring carries nothing,
                      * so the ring is what may move.
                      *
                      * `key` remounts it, which is what restarts the animation on a SECOND crossing in one
                      * session. Absolutely positioned, so it contributes no height and cannot move the first task
                      * below the fold (check L3) or overflow the reading pane (check L7) while it runs.
                      */}
                    {struck !== null && <span className="strike" key={struck} aria-hidden="true" />}
                    <Crest c={crest} size={92} finish={finish} />
                </button>

                <div className="standingwho">
                    {/*
                      * The rank name is wrapped, and the wrapper is what the level-up underline measures itself
                      * against.
                      *
                      * `.rank` is a `<p>` and therefore full-column-width, so an underline drawn on it rendered as
                      * a rule spanning the whole panel — which reads as a divider between two sections rather than
                      * as emphasis on a word. Found by photographing an actual crossing: the line ran two inches
                      * past the end of "Fixer". The span is `inline-block` so it is exactly as wide as the words,
                      * and `text-wrap: balance` still applies inside it, so a long rank like "Mission commander"
                      * wraps as it did before.
                      */}
                    <p className="rank"><span className="rankname">{s.rank}</span></p>
                    {/*
                      * The level is the headline, and the score is the button.
                      *
                      * "Level 3" is what he asked to see; the points are the evidence for it, so they are the
                      * thing that opens the breakdown. §14's rule — if clicking it does nothing it does not
                      * go on the page — is satisfied by the figure that would otherwise be the most decorative
                      * thing here.
                      */}
                    <p className="levelline">
                        Level <b>{s.level}</b>
                        <button
                            className="pointsbtn"
                            data-measure="progress-figure"
                            data-figure="points"
                            aria-expanded={open}
                            title="Where every point came from"
                            onClick={() => setOpen(o => !o)}
                        >
                            {humanCount(s.points)} pts
                        </button>
                    </p>
                </div>
            </div>

            {/*
              * The bar, and the number beside it is `nextAt - points` exactly.
              *
              * No rounding, no percentage, no "almost there". Check P5 in tests/measure-layout.mjs parses this
              * off the rendered page and asserts it against the derivation, so a target that drifts from the
              * truth fails the suite rather than quietly encouraging him with a wrong number.
              */}
            {s.toNext !== null ? (
                <>
                    <div
                        className="track"
                        role="progressbar"
                        aria-valuemin={s.levelFloor}
                        aria-valuemax={s.nextAt ?? undefined}
                        aria-valuenow={s.points}
                        aria-label={`Level ${s.level}, ${s.points} points`}
                    >
                        <span className="fill" style={{ inlineSize: `${s.fraction * 100}%` }} />
                    </div>
                    <p className="tonext">
                        {/*
                          * The operands travel with the figure so a check can verify the subtraction rather
                          * than recompute the ladder. Check P5 reads `data-points` and `data-next-at` off this
                          * element and asserts the rendered number is exactly their difference — which means a
                          * component that starts rounding, or flattering, or drifting from `standing()` fails
                          * the suite instead of quietly encouraging him with a wrong number.
                          */}
                        <b
                            data-figure="to-next"
                            data-points={s.points}
                            data-next-at={s.nextAt ?? undefined}
                        >
                            {humanCount(s.toNext)}
                        </b> more to {nextIs}
                    </p>
                </>
            ) : (
                <p className="tonext">Top of the ladder. There is nothing above {s.rank}.</p>
            )}

            {/*
              * THE RECEIPT. Hidden until asked for, because it is evidence rather than daily reading — but it
              * is the whole reason the number above it is worth anything.
              */}
            {key && <CrestKey c={crest} />}

            {open && (
                <ul className="credits" data-measure="credits">
                    {s.credits.map(c => (
                        <li key={c.label}>
                            <span className="creditwhat">
                                <b>{humanCount(c.count)}</b> {c.label}
                            </span>
                            <span className="creditsum">
                                {humanCount(c.count)} × {c.each} = <b>{humanCount(c.points)}</b>
                            </span>
                        </li>
                    ))}
                    <li className="credittotal">
                        <span className="creditwhat">Total</span>
                        <span className="creditsum"><b>{humanCount(s.points)}</b></span>
                    </li>
                </ul>
            )}
        </section>
    );
}
