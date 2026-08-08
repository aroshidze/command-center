import { cookies } from 'next/headers';
import { hasWebSession } from '../../lib/auth';
import { generatedPerks, LOOKS_COOKIE, parseLooks, resolveLooks } from '../../lib/looks';
import { readLooksPreference } from '../../lib/settings';
import { paletteCss } from '../../lib/palettes';
import { surfaceCss } from '../../lib/surfaces';
import { finishBySlug } from '../../lib/finishes';
import { nextPerk, perkStates } from '../../lib/perks';
import { crestInput } from '../../lib/progress';
import { deriveWholeRecord, marks as marksOf, rungAt, standing as standingOf } from '../../lib/progress';
import { board } from '../../lib/store';
import LookChoice from '../components/LookChoice';
import Nav from '../components/Nav';
import { paletteBySlug } from '../../lib/palettes';
import { surfaceBySlug } from '../../lib/surfaces';

export const dynamic = 'force-dynamic';

/**
 * What his levels have actually bought him, and the switch for it.
 *
 * ==================================================================================================
 * WHY THIS IS A PAGE AND NOT A TAB
 * ==================================================================================================
 *
 * The record's four tabs are history — what happened. This is configuration: a thing he sets once and comes
 * back to when something new unlocks. Putting it in the queue column would mean the surface he opens for "what
 * needs me" sometimes shows a colour picker instead, and the hub's one hard rule is that the front page answers
 * one question.
 *
 * ==================================================================================================
 * THE LOCKED ONES ARE SHOWN, AND THAT IS A JUDGEMENT
 * ==================================================================================================
 *
 * A reward surface listing only what you already have has nothing to come back for. A reward surface listing
 * forty things you cannot have is a page about failure — `docs/RESEARCH.md` §14, and the same reasoning that
 * keeps unearned marks out of the pane and in an honest "Next" list instead.
 *
 * So: everything is listed, locked ones are visibly locked, and each one states its REAL requirement with real
 * arithmetic — "Level 6 — 118 more points", counted from the same `rungAt` the level bar uses. No percentages,
 * no progress rings, nothing invented. The same rule check P5 enforces on the marks' Next list.
 */
export default async function LooksPage() {
    if (!(await hasWebSession())) {
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12 }}>This device is not signed in.</p>
            </div>
        );
    }

    let initial;
    try {
        initial = await board();
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12, color: 'var(--bad)' }}>
                    The hub could not read its database, so what is unlocked below is <strong>not</strong>{' '}
                    trustworthy: {message}
                </p>
            </div>
        );
    }

    /*
     * THE WHOLE RECORD, NOT THE WINDOW — and this line was wrong for a day.
     *
     * It derived from `initial.doneTasks`, which `board()` narrowed to the most recent `RECORD_WINDOW`
     * completions when the payload was fixed (§XXVI). At two years of his own volume that made this page report
     * **level 8 while the hub reported level 32**, off the same database, seconds apart — and because
     * `resolveLooks` below reduces his choice to what the standing it is handed has earned, the page would then
     * render a look he is currently using as locked. Found by rendering the at-scale state, which is the only
     * state where sixty is not the whole record.
     */
    const progress = deriveWholeRecord(initial);
    const standing = standingOf(progress);
    const earned = marksOf(progress);
    const states = perkStates(standing, earned, rungAt, generatedPerks(standing.level));
    const next = nextPerk(states);

    const { looks, refused } = resolveLooks(
        parseLooks(await readLooksPreference((await cookies()).get(LOOKS_COOKIE)?.value)),
        standing, earned,
    );
    const css = paletteCss(looks.palette);
    /* The surface is emitted here too, so this page looks like the hub he is configuring rather than like a
     * settings screen with its own appearance. Choosing a surface and then not seeing it on the page where you
     * chose it is the kind of small wrongness that makes a preview untrustworthy. */
    const surface = surfaceCss(looks.surface);
    const unlockedCount = states.filter(s => s.unlocked).length;
    const crest = crestInput(progress, standing, earned);

    /*
     * ONE SECTION PER AXIS, described in data rather than in three near-identical JSX blocks.
     *
     * The blurb under each heading is the axis's own honesty statement, and each one is a different claim:
     * palettes are safe because they only move hue and chroma, finishes are safe because there is no text
     * anywhere near the crest, and surfaces are safe because every one of them is built from two already-asserted
     * tokens AND the rendered pixels are measured. Three different guarantees, so three different sentences —
     * one generic reassurance across all of them would be the page asking to be trusted rather than showing why.
     */
    const SECTIONS = [
        {
            kind: 'palette' as const,
            title: 'Palettes',
            /* The count used to be stated here as "540 checks" and this session made that untrue twice over —
             * the suite now runs several thousand because the palette line is unbounded. A tally on a page is a
             * fact that goes stale silently, and `npm run prove:palette` prints the real one on every run, so the
             * page states the GUARANTEE and leaves the arithmetic where it is actually computed. */
            note: 'Every one is measured against the same contrast requirements in both light and dark before '
                + 'it ships — the ones below and every one the ladder will mint — so none of them can make the '
                + 'hub harder to read. A palette only moves hue and chroma, and contrast depends on lightness.',
        },
        {
            kind: 'crest' as const,
            title: 'Crest finishes',
            note: 'Your own crest, in each finish. A finish changes how it is drawn and nothing else, and there '
                + 'is no text anywhere on it — so this is the one axis that cannot affect legibility at all.',
        },
        {
            kind: 'surface' as const,
            title: 'Page surfaces',
            /* "two steps of the same ramp" was wrong from the day it was written — the restriction in
             * lib/surfaces.ts permits `--s0`, `--s1` AND `--s2`, and its own header says so in capitals. A
             * sentence the code does not support is the same class of defect as a figure that cannot be
             * recomputed from the rows. Counted rather than guessed this time. */
            note: 'A texture behind text is the one perk that could break the contrast guarantee, so every '
                + 'surface here is built from three steps of the same ramp and nothing else — and the harness '
                + 'measures the pixels actually painted behind every word on the page, not the token.',
        },
    ];

    return (
        <>
            {css && <style href={`cc-palette-${looks.palette}`} precedence="high">{css}</style>}
            {surface && <style href={`cc-surface-${looks.surface}`} precedence="high">{surface}</style>}
            <div className="wrap">
                {/* The same bar as every other page, so this stops being a dead end you escape with a "← back"
                    link. See Nav.tsx. */}
                <Nav here="looks" badge={`${unlockedCount} / ${states.length}`} />
                <header>
                    <div className="top">
                        <h1>What you have unlocked</h1>
                    </div>
                    <div className="summary">
                        {/*
                          * His standing restated here rather than assumed, because this is the page where the
                          * level finally means something concrete and the two figures have to agree. Both come
                          * from the same `standing` call the board's profile panel uses.
                          */}
                        <span>
                            <b>{standing.rank}</b>, level {standing.level} · {unlockedCount} of{' '}
                            {states.length} looks unlocked
                        </span>
                    </div>
                </header>

                {/*
                  * A choice the server REFUSED, said out loud.
                  *
                  * The cookie is user-editable, so it can name a palette he has not earned or one that no longer
                  * exists — and re-opening a task can take a level back, which can take a palette back. Reverting
                  * silently would leave the page showing one thing while he believes another, which is the same
                  * defect class as an optimistic success message. It says what happened and what it fell back to.
                  */}
                {refused && (
                    <div className="card" data-measure="looks-refused">
                        <p className="why" style={{ marginTop: 0, color: 'var(--ask)' }}>
                            {refused} Showing Graphite instead — pick anything below and it will stick.
                        </p>
                    </div>
                )}

                {SECTIONS.map(sec => (
                    <section key={sec.kind} data-measure="look-section" data-kind={sec.kind}>
                        <h2>{sec.title}</h2>
                        <p className="why" style={{ marginTop: 0 }}>{sec.note}</p>
                        <LookChoice
                            kind={sec.kind}
                            states={states.filter(s => s.perk.kind === sec.kind)}
                            current={looks[sec.kind]}
                            crest={crest}
                        />
                    </section>
                ))}

                {next && (
                    <>
                        <h2>Next</h2>
                        <div className="card">
                            <p className="why" style={{ marginTop: 0 }}>
                                <b>{next.perk.label}</b> — {next.need}
                            </p>
                            <p className="why">
                                {next.perk.kind === 'palette' ? paletteBySlug(next.perk.slug)?.blurb
                                    : next.perk.kind === 'crest' ? finishBySlug(next.perk.slug)?.blurb
                                        : surfaceBySlug(next.perk.slug)?.blurb}
                            </p>
                        </div>
                    </>
                )}

                <h2>How this works</h2>
                <div className="card">
                    <p className="why" style={{ marginTop: 0 }}>
                        Nothing here is stored as a reward you have been granted. What is unlocked is computed
                        from the work itself, every time this page loads — the same figures as the level bar. So
                        re-opening a finished task takes its points back, and if that crosses a boundary it takes
                        the look with it. That is deliberate: a hub where the score is honest and the rewards are
                        not would be worse than one with no rewards.
                    </p>
                    <p className="why">
                        Only appearance is ever locked. Nothing the hub actually <em>does</em> is behind a level,
                        because a tool that withholds usefulness to motivate you is a tool that is worse at its
                        job on purpose.
                    </p>
                </div>
            </div>
        </>
    );
}
