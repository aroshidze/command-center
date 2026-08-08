import { cookies } from 'next/headers';
import { hasWebSession } from '../../lib/auth';
import { LOOKS_COOKIE, parseLooks, resolveLooks } from '../../lib/looks';
import { readLooksPreference } from '../../lib/settings';
import { paletteCss } from '../../lib/palettes';
import { surfaceCss } from '../../lib/surfaces';
import { deriveWholeRecord, marks as marksOf, standing as standingOf } from '../../lib/progress';
import {
    foldAgents, foldProjects, LIVE_MINUTES, sentenceFor, summaryLine,
} from '../../lib/presence';
import { costOf, humanDollars } from '../../lib/prices';
import { agentsView, board, SPEND_ELSEWHERE } from '../../lib/store';
import { humanAgo, humanCount } from '../../lib/format';
import Nav from '../components/Nav';
import Presence from '../components/Presence';
import CopyBlock from '../components/CopyBlock';

export const dynamic = 'force-dynamic';

/**
 * WHETHER ANYTHING IS ACTUALLY RUNNING — the page the queue is not allowed to become.
 *
 * ==================================================================================================
 * WHY THIS IS A PAGE AND WHY IT IS ONLY ONE
 * ==================================================================================================
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §2 is the constraint the whole feature is built inside: the queue answers
 * exactly one question — what needs him — and nothing may inflate it, its counts or its chips. Presence and
 * spend are not that question. They are state he checks, which is the same category as `/looks`, and the same
 * reasoning that made `/looks` a page rather than a tab applies unchanged.
 *
 * And it is ONE page rather than a second app, which is the thing he refused in as many words: *"the last
 * thing we want is to complicate the thing that we already built by creating a second app. They will overlap
 * and kinda mess with each other."* Everything here arrives over the same HTTP the hub already runs on. There
 * is nothing local to install beyond two hooks and nothing to keep in sync.
 *
 * ==================================================================================================
 * THE SENTENCES ARE BUILT ON THE SERVER, AND THAT IS DELIBERATE
 * ==================================================================================================
 *
 * `sentenceFor` runs here and the strings are passed down. The client component never composes one, so there
 * is exactly one place the grammatical rule — *if the sentence needs the word "you", rewrite it* — can be
 * broken, and exactly one place a check has to look. Handing a component the data and letting it write its own
 * prose is how one surface ends up with four voices.
 *
 * ==================================================================================================
 * THE SPEND FIGURE, AND WHY IT IS LABELLED RATHER THAN JUST SHOWN
 * ==================================================================================================
 *
 * He runs Claude Code on a subscription, so the API-list-price total is what the work WOULD have cost, not
 * what he paid. That is genuinely useful — it is how you find out which project is eating the allowance — and
 * it is not a bill, so the caveat under the list says so. Same rule as `noteReach` saying "synced" rather than
 * "read": the honest word is the one the data supports.
 */
export default async function AgentsPage() {
    if (!(await hasWebSession())) {
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12 }}>This device is not signed in.</p>
            </div>
        );
    }

    let view: Awaited<ReturnType<typeof agentsView>>;
    let boardState: Awaited<ReturnType<typeof board>>;
    try {
        /*
         * `board()` is here for the palette and the nav badge only, and it is worth saying why that is not
         * waste: `/looks` already pays for the same call for the same reason, and both are the price of the
         * chosen look following him between devices rather than living in a cookie the client can edit. The
         * two reads run concurrently.
         */
        [view, boardState] = await Promise.all([agentsView(), board()]);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12, color: 'var(--bad)' }}>
                    The hub could not read its database, so nothing below is{' '}
                    <strong>trustworthy</strong>: {message}
                </p>
            </div>
        );
    }

    const progress = deriveWholeRecord(boardState);
    const standing = standingOf(progress);
    const { looks } = resolveLooks(
        parseLooks(await readLooksPreference((await cookies()).get(LOOKS_COOKIE)?.value)),
        standing,
        marksOf(progress),
    );
    const css = paletteCss(looks.palette);
    const surface = surfaceCss(looks.surface);

    /*
     * ONE `now` FOR THE WHOLE RENDER.
     *
     * Every sentence, every state and the summary are computed against the same instant. Calling `Date.now()`
     * inside each fold would let two lines on one page disagree about whether an agent is inside the live
     * window — a millisecond of skew is enough when a row is sitting on the boundary, and "working now" beside
     * "last heard from 45 min ago" about the same agent is the kind of small contradiction that costs trust in
     * every other figure. Same reasoning as `MEASURE` in tests/measure-layout.mjs being one evaluate.
     */
    const now = Date.now();
    const projectPresence = foldProjects(view.projects.map(p => p.slug), view.presence, now);
    const agentPresence = foldAgents(view.presence, now);
    const sentences = Object.fromEntries(
        projectPresence.map(p => [p.project, sentenceFor(p, now)]),
    );

    /*
     * SPEND, FOLDED PER PROJECT. The tokens are in the database and the money is computed here — see
     * lib/prices.ts for why that split is the same one the whole progress system rests on.
     */
    const byProject = new Map<string, typeof view.spend>();
    for (const r of view.spend) {
        const list = byProject.get(r.project);
        if (list) list.push(r); else byProject.set(r.project, [r]);
    }
    const spendFigures: Record<string, string> = {};
    for (const [slug, rows] of byProject) {
        const { dollars } = costOf(rows);
        if (dollars > 0) spendFigures[slug] = humanDollars(dollars);
    }

    const wholeCost = costOf(view.spend);
    const elsewhere = byProject.get(SPEND_ELSEWHERE);
    const elsewhereCost = elsewhere ? costOf(elsewhere).dollars : 0;
    const samples = view.spend.reduce((n, r) => n + r.samples, 0);
    const measuredAt = view.spend.reduce<string | null>(
        (newest, r) => (newest == null || r.measured_at > newest ? r.measured_at : newest), null,
    );

    /* Has anything at all opted in? Drives the setup card below, and nothing else. */
    const anyHooked = projectPresence.some(p => p.hooked);
    const summary = summaryLine(projectPresence);
    /*
     * IS THERE ANYTHING TO SHOW AT ALL? Keyed on the FOLD rather than on the project list, because a presence
     * row can name a project the hub has no tasks for — an agent that opened a session before filing anything —
     * and `foldProjects` already unions both sides. Asking `initial.projects` alone would hide a live agent
     * behind an empty-state card.
     */
    const nothingKnown = projectPresence.length === 0;

    const hookCommand = 'node "$HOME/.command-center/cc.mjs" presence on';

    return (
        <>
            {css && <style href={`cc-palette-${looks.palette}`} precedence="high">{css}</style>}
            {surface && <style href={`cc-surface-${looks.surface}`} precedence="high">{surface}</style>}
            <div className="wrap">
                <Nav here="agents" />
                <header>
                    <div className="top">
                        <h1>Your agents</h1>
                    </div>
                    <div className="summary" data-measure="summary">
                        {/*
                          * The summary, or the count, or nothing at all.
                          *
                          * Null when nothing is working and nothing is quiet, because a line that is always
                          * present is a line nobody reads — the same rule the stale-sync banner and `unseenWork`
                          * already follow on the board. And nothing at all when there are no projects, because
                          * "0 projects" over an empty screen is a figure describing an absence, which is the
                          * blank-screen-mistaken-for-a-bug failure the board's empty card exists to avoid.
                          */}
                        {summary
                            ? <span data-measure="presence-summary">{summary}</span>
                            : nothingKnown ? null : (
                                <span className="sub">
                                    {projectPresence.length} project
                                    {projectPresence.length === 1 ? '' : 's'}
                                </span>
                            )}
                    </div>
                </header>

                {/*
                  * ==================================================================================
                  * NOTHING HAS EVER REPORTED IN — and this is the FIRST screen a new person sees here.
                  * ==================================================================================
                  *
                  * Found by rendering the unstarted state, which is the whole reason this project renders
                  * five of them. The page shipped as **"0 projects"** over an empty list, followed by a
                  * paragraph explaining what "working on" means — a caveat about a list that is not there,
                  * which is the same defect §XXVII found in the record's window sentence describing the list
                  * you are not looking at, and §XXVIII found in the palette's one grey line inside a 660px
                  * void.
                  *
                  * It is the exact mistake `app/components/Board.tsx` already fixed once on the queue, for a
                  * reason worth quoting: *"On a brand-new hub it is false. Nothing is waiting because nothing
                  * is connected"* — and the proudest screen in the hub was making a promise it could not keep
                  * to the person least able to tell. This page had the same hole, on the same kind of visitor.
                  *
                  * Dashed rather than the green success framing, and for once the default visual language is
                  * exactly right: dashed means "something should be here", which is true before anything has
                  * reported and false afterwards.
                  */}
                {nothingKnown ? (
                    <div className="empty unstarted" data-measure="agents-empty" data-empty="unstarted">
                        <b>Nothing has reported in yet.</b>
                        This page answers one question: is anything actually working, and when did it last
                        run? It fills in on its own as your agents sync — and the two hooks below make it
                        exact. Until then there is nothing to show, which is different from nothing happening.
                    </div>
                ) : (
                    <>
                        <Presence
                            projects={projectPresence}
                            sentences={sentences}
                            spend={spendFigures}
                            agents={agentPresence}
                        />

                        {/*
                          * WHAT "WORKING NOW" MEANS, stated once under the list rather than implied by it.
                          *
                          * The window is 45 minutes and a heartbeat only arrives at the start and end of a
                          * session, so "working now" is an inference from evidence rather than a live reading —
                          * and the page says which. Leaving it unstated would be the surface asking to be
                          * believed about the one claim here that could be wrong.
                          *
                          * INSIDE the branch, so it can never appear over an empty list. A caveat about
                          * something that is not on screen is worse than no caveat.
                          */}
                        <p className="why presnote" data-measure="presence-caveat">
                            A project counts as being worked on if anything reported in within the last{' '}
                            {LIVE_MINUTES} minutes. Sessions report at their start and end, and a sync counts
                            too, so a long build with nothing in between can read as quiet for a while. Nothing
                            here is stored — it is all recomputed from what agents have reported.
                        </p>
                    </>
                )}

                {samples > 0 && (
                    <>
                        {/*
                          * THE HEADING CARRIES THE CONDITIONAL, AND IT HAS TO, BECAUSE OF READING ORDER.
                          *
                          * This said "Spend" over a bold dollar figure, with the caveat in the paragraph below —
                          * and the caveat was written deliberately, with a comment calling it "not small print".
                          * It was still in the wrong place. The owner read his own page and asked "spend?
                          * dollars? what spend?" before he ever reached the sentence explaining it. A figure is
                          * read before the text under it, always, so a disclaimer underneath is a disclaimer
                          * that arrives second.
                          *
                          * He is on a subscription. He paid a flat fee and nothing else. A page telling him he
                          * had spent twelve thousand dollars was the most alarming thing this hub has ever
                          * said, and it said it about money — which is the one subject where being briefly
                          * misread is not a small cost.
                          *
                          * So the conditional is the heading, "You were not charged this" sits in the same
                          * sentence as the number, and the mechanics move below where they belong. The figure is
                          * still worth showing: it is the only measure of how much work the agents have
                          * actually done.
                          */}
                        <h2>If you paid per token</h2>
                        <div className="card">
                            <p className="why" style={{ marginTop: 0 }} data-measure="spend-total">
                                This work would have cost <b>{humanDollars(wholeCost.dollars)}</b> across{' '}
                                {humanCount(samples)} recorded exchange{samples === 1 ? '' : 's'}
                                {measuredAt ? `, last measured ${humanAgo(measuredAt)}` : ''}.{' '}
                                <b>You were not charged this.</b>
                            </p>
                            <p className="why" data-measure="spend-caveat">
                                At API list prices, from Claude Code&rsquo;s own usage records. On a
                                subscription you pay a flat fee, so this is what the same work would have cost
                                through the API — the figure that tells you where the allowance goes, not a bill.
                            </p>
                            {elsewhereCost > 0 && (
                                /*
                                 * Reported rather than dropped, and rather than guessed into a project. See
                                 * `SPEND_ELSEWHERE` in lib/store.ts: a cwd is not a project, and folding a
                                 * scratch folder into whichever slug happened to be nearby would make the
                                 * per-project figures wrong in a way nothing on the page could reveal.
                                 */
                                <p className="why" data-measure="spend-elsewhere">
                                    <b>{humanDollars(elsewhereCost)}</b> of that was spent in folders that are
                                    not projects the hub knows about. Onboard one and it moves to its own line.
                                </p>
                            )}
                            {wholeCost.unpriced.length > 0 && (
                                /*
                                 * A model with no price in lib/prices.ts is EXCLUDED from the total and said so,
                                 * because the two alternatives are both untruths: pricing it at zero understates
                                 * silently, and pricing it as Opus overstates a Haiku run fivefold.
                                 */
                                <p className="why" data-measure="spend-unpriced">
                                    Not counted: {wholeCost.unpriced.join(', ')} — no published price is
                                    compiled in, so those tokens are left out rather than guessed at.
                                </p>
                            )}
                        </div>
                    </>
                )}

                {/*
                  * THE SETUP CARD, and it renders only while nothing is opted in.
                  *
                  * This is the whole opt-in story in one place. A hub where nothing is installed still shows
                  * real presence — the fallback in `notePresenceFromSync` means every scoped sync is an
                  * observation — so the page is useful before this card is acted on, and the card is an offer
                  * rather than a prerequisite. It disappears once any project has a heartbeat, because an
                  * instruction that stays after it has been followed is an instruction he learns to skip.
                  */}
                {!anyHooked && (
                    <>
                        <h2>Make this sharper</h2>
                        <div className="card">
                            <p className="why" style={{ marginTop: 0 }}>
                                Everything above comes from agents syncing, which tells the hub roughly when a
                                project was last touched. Two hooks make it exact — when a session starts, when
                                it ends, which branch and which model. Run this <b>in a project folder</b>, once
                                per project, and only where it is wanted:
                            </p>
                            <CopyBlock text={hookCommand} label="in the project folder" />
                            <p className="why">
                                It writes two hooks into that project&rsquo;s{' '}
                                <code>.claude/settings.json</code> and nothing else. No token goes into the
                                file, so it is safe to commit. <code>presence off</code> removes them.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
