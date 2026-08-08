'use client';

import { crestGeometry, PALE_MAX, type CrestInput } from '../../lib/progress';
import { projectColor } from '../../lib/colour';
import { CHARGE_NAME } from './Crest';

/**
 * What the crest is made of, in words anybody can read.
 *
 * ==================================================================================================
 * THE VERSION BEFORE THIS ONE WAS WRITTEN IN A PRIVATE LANGUAGE, AND HE COULD NOT READ IT
 * ==================================================================================================
 *
 *     "dude, I don't know how to explain this to you, but this whole text, the names, the everything, is very
 *      confusing… The charge? The bands? The bezel? The core? struck to two of four — like what is this talking
 *      about… You're just talking with the user as if he knows everything and he's a very advanced user. We don't
 *      have a help center, we don't have anything explaining anything, we just throw this into their face."
 *
 * He is right, and it is worse than clumsy wording. The previous pass invented a vocabulary — *charge*, *bezel*,
 * *core*, *annulet*, *mullet*, *saltire* — and then wrote the explanation **in that vocabulary**. A row reading
 * *"The charge — a quartered disc"* explains nothing unless you already know what a charge is, which nothing on
 * this hub has ever said.
 *
 * The worst part is that the previous pass congratulated itself for this. Its own comment argued that naming the
 * shape was clearer than the number it replaced, *"a fact he can check against the drawing"* — and that is only
 * true if you know which part of the drawing the word points at. **I replaced an unreadable number with an
 * unreadable noun and wrote a paragraph explaining why it was an improvement.**
 *
 * ==================================================================================================
 * THE THREE RULES THIS PANEL IS WRITTEN UNDER NOW
 * ==================================================================================================
 *
 * 1. **Every row says WHERE TO LOOK before it says what anything means.** "The shape in the middle", "The
 *    coloured stripes", "The ticks around it". A reader has to be able to find the thing being described without
 *    knowing a single term, because there is no glossary and there should not need to be one.
 * 2. **No word appears that the hub has not already taught.** The nine shapes have plain names (see `CHARGE_NAME`
 *    and lib/charges.ts) rather than heraldic ones. Where a word IS the hub's own — `mark` — the sentence points
 *    at the place he can see them, rather than assuming he remembers.
 * 3. **Full sentences, not a table.** The two-column grid put a bare noun in the left column and a fragment in the
 *    right, which is a layout that only works when the nouns are already familiar. Each part gets one sentence
 *    that reads on its own.
 *
 * Check **P8** in tests/measure-layout.mjs holds rule 2 by measuring the rendered page against a list of the words
 * this panel used to use. A comment asking the next person to write plainly is a comment; a check is a check.
 *
 * ==================================================================================================
 * WHY THIS PANEL EXISTS AT ALL
 * ==================================================================================================
 *
 * 1. **docs/RESEARCH.md §14: if pressing it does nothing, it does not go on the page.** The crest is the most
 *    decorative thing this hub draws, so it owes that rule the most.
 * 2. **Nothing may be truncated without a route to the whole thing.** The stripes cap at eight, which rounds in
 *    the direction of looking better, so something has to say so — and it does, only when the cap actually bites.
 * 3. **Nothing on the page may be untrue.** Every figure here is recomputed from the same rows the queue renders.
 */

export default function CrestKey({ c }: { c: CrestInput }) {
    const g = crestGeometry(c);
    const hours = c.minutesEstimated / 60;
    const hoursText = hours < 1 ? `${c.minutesEstimated} minutes` : `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
    const shape = CHARGE_NAME[Math.min(9, Math.max(1, g.facets)) - 1];

    return (
        <div className="crestkey" data-measure="crest-key">
            {/*
              * A HEADING, because the panel used to open with no statement of what it was.
              *
              * "Nothing here is stored" was the first thing it said — an honesty guarantee, which is the answer to
              * a question a reader has not thought to ask yet. What they want first is what they are looking at.
              */}
            <p className="crestkeylead">
                <b>Your crest is a picture of your own work.</b> Each part of it comes from something you have
                actually done, and it is worked out again from scratch every time this page loads — so it goes
                down as well as up. Nothing about it is saved anywhere.
            </p>

            <ul>
                {/*
                  * THE SHAPE FIRST, because it is the only part a reader cannot possibly work out by looking. The
                  * stripes explain themselves once you know they are projects; this one cannot.
                  */}
                <li data-measure="crest-key-row" data-part="charge">
                    {g.kinds === 0 ? (
                        <>
                            <b>The shape in the middle</b> changes as you earn marks for different kinds of work —
                            finishing a lot, beating deadlines, taking a project to zero, and so on. You have no
                            marks yet, so this is the first of the nine shapes: {shape}.
                        </>
                    ) : (
                        <>
                            <b>The shape in the middle</b> depends on how many different <em>kinds</em> of work you
                            have earned a mark for — finishing a lot, beating deadlines, taking a project to zero,
                            and so on. You have marks for <b>{g.kinds}</b> of them, and that gives you {shape}.
                            There are nine shapes in all, and the more kinds you have, the more there is to it.
                        </>
                    )}
                </li>

                <li data-measure="crest-key-row" data-part="pales">
                    {c.projects.length === 0 ? (
                        <>
                            <b>The coloured stripes</b> are the projects you have finished something in. You have
                            none yet, so there are no stripes.
                        </>
                    ) : (
                        <>
                            <b>The coloured stripes</b> are the projects you have finished something in — you have{' '}
                            <b>{c.projects.length}</b>, and each keeps the same colour it has everywhere else in
                            the hub:{' '}
                            {/* The real colours, so the sentence can be checked against the crest above it and
                                against every project dot elsewhere on the page. */}
                            {c.projects.slice(0, PALE_MAX).map(p => (
                                <span key={p} className="ckdot" style={{ background: projectColor(p) }}
                                    title={p} />
                            ))}
                        </>
                    )}
                </li>
                {/*
                  * The cap, in plain words and only when it bites. A permanent caveat about a limit nothing has
                  * reached is a caveat nobody reads.
                  */}
                {g.palesOver > 0 && (
                    <li className="ckover" data-measure="crest-key-row" data-part="pales-over">
                        {g.palesOver} of your projects {g.palesOver === 1 ? 'does' : 'do'} not have a stripe —
                        eight is as many as stay far enough apart in colour to tell apart. All of them are in the
                        Projects list further down this column.
                    </li>
                )}

                <li data-measure="crest-key-row" data-part="rays">
                    <b>The small ticks around the shape</b> count your level. <b>{g.rays}</b> of the ten{' '}
                    {g.rays === 1 ? 'is' : 'are'} long, one for each level you have gained. When all ten are long
                    the next level starts them over, and one more mark is added to the bar across the top —{' '}
                    {g.pips === 1 ? 'you have one so far' : `you have ${g.pips} of those`}.
                </li>

                <li data-measure="crest-key-row" data-part="rarity">
                    {g.rarity === 0 ? (
                        <>
                            <b>The dot at the very centre</b> fills in once you earn your first mark. Marks are the
                            things listed under <em>Marks</em> in the record, and they come in four grades — the
                            rarer the best one you hold, the more there is in the centre.
                        </>
                    ) : (
                        <>
                            <b>The dot at the very centre</b> shows the rarest mark you hold. Marks are the things
                            listed under <em>Marks</em> in the record, and they come in four grades; your best is
                            grade <b>{g.rarity}</b> of 4.
                        </>
                    )}
                </li>

                <li data-measure="crest-key-row" data-part="rims">
                    <b>The lines around the outside</b> add up the time behind you. You are at{' '}
                    <b>{hoursText}</b>, which draws <b>{g.rims}</b> of a possible 3 lines. That time is what the
                    agents guessed each task would take when they filed it, not a stopwatch — so treat it as a
                    rough total.
                </li>
            </ul>
        </div>
    );
}
