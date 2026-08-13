import type { Brief } from '../../lib/store';
import { humanAgo } from '../../lib/format';

/**
 * WHERE A PROJECT STANDS — one brief, with its age and its author attached to it.
 *
 * ==================================================================================================
 * THE THING THAT MAKES THIS LEGITIMATE IS ON SCREEN, NOT IN A COMMENT
 * ==================================================================================================
 *
 * A paragraph asserting where a project stands is exactly the shape this hub refuses everywhere else, and
 * the three things that make it admissible have to be visible or the refusal was pointless:
 *
 *   - **WHO** said it. The agent's name, first, in the same treatment the reports use.
 *   - **WHEN** they said it. Relative, and never hidden: a brief from four days ago reads as four days old
 *     rather than as the current state of the project.
 *   - **WHAT IS IN THE WAY**, in its own line and its own colour, because a brief with no unflattering half
 *     is a puff piece and the point of asking separately is that it gets answered.
 *
 * And it sits directly above the derived facts — the presence sentence, the open work, what actually ran —
 * which can contradict it in public. That is the real safeguard: an agent that writes "nearly done" over a
 * project with nine open tasks and no activity in a week has published the contradiction itself.
 *
 * ==================================================================================================
 * A SERVER COMPONENT
 * ==================================================================================================
 *
 * Nothing here is interactive, so nothing here ships JavaScript. `humanAgo` comes from `lib/format` rather
 * than through `app/components/ui.tsx`, which is a `'use client'` module — importing a function through it
 * from a server component fails at request time with a 500 that typecheck cannot see. The project page's
 * own header records that mistake being made once already.
 */
export default function Standing({ brief, now }: { brief: Brief; now?: number }) {
    void now;
    return (
        <section className="standing" data-measure="standing">
            <div className="standhead">
                <h2>Where it stands</h2>
                <span className="standwho" data-measure="stand-who">{brief.agent}</span>
                <span className="standwhen" data-measure="stand-when">{humanAgo(brief.at)}</span>
            </div>

            <p className="standnow" data-measure="stand-standing">{brief.standing}</p>

            {/*
              * The three optional lines, each labelled, each absent when the agent had nothing to put in
              * it. An empty row with a label would be a field asking to be filled in, which is how a brief
              * turns into a form.
              */}
            <dl className="standrest">
                {brief.did && (
                    <div className="standrow" data-measure="stand-did">
                        <dt>did</dt>
                        <dd>{brief.did}</dd>
                    </div>
                )}
                {brief.next && (
                    <div className="standrow" data-measure="stand-next">
                        <dt>next</dt>
                        <dd>{brief.next}</dd>
                    </div>
                )}
                {brief.blocked && (
                    <div className="standrow blocked" data-measure="stand-blocked">
                        <dt>in the way</dt>
                        <dd>{brief.blocked}</dd>
                    </div>
                )}
            </dl>
        </section>
    );
}
