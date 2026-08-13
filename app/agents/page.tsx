import { cookies } from 'next/headers';
import { hasWebSession } from '../../lib/auth';
import { LOOKS_COOKIE, parseLooks, resolveLooks } from '../../lib/looks';
import { readLooksPreference, readTimezone } from '../../lib/settings';
import { paletteCss } from '../../lib/palettes';
import { surfaceCss } from '../../lib/surfaces';
import { deriveWholeRecord, marks as marksOf, standing as standingOf } from '../../lib/progress';
import {
    foldAgents, foldProjects, LIVE_MINUTES, sentenceFor, summaryLine,
} from '../../lib/presence';
import { firstLine, waitingRuns } from '../../lib/reports';
import { costOf, humanDollars } from '../../lib/prices';
import { projectColor } from '../../lib/colour';
import { agentsView, board, SPEND_ELSEWHERE } from '../../lib/store';
import { humanAgo, humanCount, humanSpan } from '../../lib/format';
import { buildTimeline } from '../../lib/timeline';
import Nav from '../components/Nav';
import Presence from '../components/Presence';
import Runs from '../components/Runs';
import CopyBlock from '../components/CopyBlock';
import Zone from '../components/Zone';
/* From lib/colour.ts and not through components/ui.tsx, which is a 'use client' module: importing a
 * function through it from a server component throws at request time. See the project page's note. */
import { projectColor as projectColour } from '../../lib/colour';

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

    /*
     * ==================================================================================================
     * WHICH PROJECTS EARN A LINE — and the owner found this one in about five seconds.
     * ==================================================================================================
     *
     * His words: *"`thecommandcenter` and `command-center` are two rows for one project."* They are, and
     * the two arrive by different doors. `projects()` folds over the EVENT LOG, so any slug an agent ever
     * filed anything under is on that list forever; `foldProjects` unions that with every slug in
     * `presence`, which is where the folder-name inference lands. One project onboarded under a chosen
     * slug and later heartbeating under its folder name is two rows, permanently, and neither is wrong.
     *
     * THE FIX IS NOT AN ALIAS TABLE. Deciding that two slugs are one project is a judgement no row
     * supports, and a mapping he would have to maintain is precisely the kind of field
     * docs/RESEARCH.md §7 refuses. What the rows DO support is whether the hub has anything to say about
     * a slug at all — so the rule is that a project earns a line when there is something current about
     * it: an observation of any kind, any measured spend, or work still open.
     *
     * A slug with none of those is a name in the log and nothing else, and it is dropped. That removes
     * his duplicate without inventing a relationship, and it generalises: the next abandoned slug does
     * not need a second fix.
     *
     * QUIET PROJECTS ARE NOT AFFECTED, which is the thing to check before believing this is safe. A
     * quiet project is one that HAS presence rows and none of them are recent — the entire point of this
     * page — so it passes the first test. What is dropped is the case with no presence at all, no spend
     * at all and nothing open.
     */
    const spendBySlug = new Set(view.spend.filter(r => r.samples > 0).map(r => r.project));
    const seenInPresence = new Set(view.presence.map(r => r.project));
    const worthALine = view.projects
        .filter(p => seenInPresence.has(p.slug) || spendBySlug.has(p.slug)
            || p.open_tasks > 0 || p.open_questions > 0)
        .map(p => p.slug);
    const dropped = view.projects.length - worthALine.length;

    const projectPresence = foldProjects(worthALine, view.presence, now);
    const agentPresence = foldAgents(view.presence, now);
    /*
     * THE CHART. Built on the server for the same reason the sentences are: one place makes a claim
     * about time, so one place can be checked — and `buildTimeline` imports nothing but types, so a
     * check can load it and assert the arithmetic without a browser.
     */
    const zone = await readTimezone();
    const runs = buildTimeline(view.sessions, view.subagents, now, 1000, zone);
    /*
     * WHO IS WAITING, across every project. Folded from the newest report per conversation, so a run that
     * asked at midnight and has heard nothing since is still on this list at nine — and one he has since
     * replied to is not, because his reply is a newer row. Nothing has to be cleared.
     */
    const waiting = waitingRuns(view.reports);
    const sentences = Object.fromEntries(
        projectPresence.map(p => [p.project, sentenceFor(p, now, zone)]),
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
    /* Runs anywhere — it reads the transcript folder rather than the current directory, so unlike every
     * other command on this page it is not a "in the project folder" instruction. */
    const backfillCommand = 'node "$HOME/.command-center/cc.mjs" backfill';

    return (
        <>
            {css && <style href={`cc-palette-${looks.palette}`} precedence="high">{css}</style>}
            {surface && <style href={`cc-surface-${looks.surface}`} precedence="high">{surface}</style>}
            <div className="wrap">
                <Nav here="agents" />
                <Zone stored={zone} />
                <header>
                    <div className="top">
                        <h1>Your agents</h1>
                    </div>
                    {/*
                      * `data-dropped` is how many slugs the event log carries that nothing current is
                      * known about. It is not on screen — he asked for those lines to go away, and a
                      * line saying "3 slugs were hidden" is the noise he was complaining about — but it
                      * is not silent either, because a check can read it and this codebase's rule is
                      * that a cap nobody can see is a cap that eventually hides something real.
                      */}
                    <div className="summary" data-measure="summary" data-dropped={dropped}>
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
                        {/*
                          * AND HOW MANY ARE WAITING FOR HIM, in the one line at the top of the page.
                          *
                          * It goes here rather than only in the section below, because the summary is where
                          * the eye lands and this is the only figure on the page that a human action follows
                          * from. It is not a chip and it is not on the queue: `docs/BRIEF-NOTHING-BLOCKED.md`
                          * §2 forbids inflating the queue's counts, and this counts RUNS whose newest report
                          * says the harness is waiting — a different set from anything the queue totals.
                          */}
                        {waiting.length > 0 && (
                            <span className="waitcount" data-measure="waiting-count">
                                {waiting.length} waiting for you
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
                        {/*
                          * ONE ACTION, NAMED, AND IT FILLS THE PAGE WITHOUT WAITING FOR ANYTHING TO RUN.
                          *
                          * The old version of this card described what the page would eventually become
                          * and left him with nothing to do about it — which is how `/agents` shipped as
                          * five rows reading "Nothing has ever reported in" and stayed that way, because
                          * hooks only take effect on the NEXT session and most of his folders had never
                          * been connected at all. `cc backfill` reads Claude Code's own transcripts and
                          * fills this in from history, so the first thing he sees is his own fortnight
                          * rather than a promise about tomorrow.
                          */}
                        This page answers two questions: what actually ran, and whether the quiet
                        elsewhere is real. Both are filled in by agents reporting in — and the last two
                        weeks are already on your machine, in Claude Code&rsquo;s own transcripts. One
                        command reads them and posts them here.
                        <CopyBlock text={backfillCommand} label="anywhere, once" />
                        After that, <code>cc presence on</code> in a project folder keeps it exact from
                        then on. Until either happens there is nothing to show, which is different from
                        nothing happening.
                    </div>
                ) : (
                    <>
                        {/*
                          * THE CHART FIRST, AND THE LIST UNDER IT — which is a reordering of the whole
                          * page rather than an addition to it.
                          *
                          * What shipped was five one-line rows and a dollar figure, and he opened it and
                          * said *"THIS IS IT? look at all of the features of our rivals — projects,
                          * workers, agents, sub agents, beautiful layouts, maps"*. The list answers "is
                          * the silence real", which is a real question and the only actionable thing
                          * here, and it is not the question he opens this page with. That one is "what
                          * happened", and it is answered by a shape rather than by five sentences.
                          *
                          * So the chart is the centre and the list keeps its job directly beneath it.
                          * Rendered only when something ran: a chart of nothing is the 660px-void empty
                          * state §XXVIII removed from the palette, redrawn larger.
                          */}
                        {/*
                          * ==================================================================
                          * WHO IS WAITING FOR HIM — above the chart, above everything.
                          * ==================================================================
                          *
                          * Anthropic shipped Agent View in May 2026: a roster of every running
                          * session in the terminal, and the column it leads with is *needs your
                          * input*. That is the right judgement and it is worth taking wholesale —
                          * of everything a command centre can say, "this one cannot continue
                          * without you" is the only line about the next thirty seconds.
                          *
                          * WHAT THIS HUB CAN DO THAT AGENT VIEW STRUCTURALLY CANNOT: it is not on
                          * his machine. Agent View is a terminal on one computer looking at one
                          * checkout; this list spans every project on every machine that reports
                          * in, and it is readable from a phone with the laptop shut. That is the
                          * whole claim of this product, and it is this list that makes it.
                          *
                          * `waiting` is not a self-assessment. It is `Notification` with a type of
                          * `agent_needs_input`, `idle_prompt` or `permission_prompt` — the HARNESS
                          * reporting that its agent is blocked. See lib/reports.ts for why that
                          * distinction is what makes this admissible where a `status` field is not.
                          */}
                        {waiting.length > 0 && (
                            <section className="waiting" data-measure="waiting">
                                <h2>Waiting for you</h2>
                                <ul className="waitlist" data-measure="waiting-list">
                                    {waiting.map(w => (
                                        <li key={`${w.project}-${w.session}`} className="waitrow"
                                            data-measure="waiting-row" data-project={w.project}
                                            style={{ ['--proj' as string]: projectColor(w.project) }}>
                                            <span className="waitpip" aria-hidden="true" />
                                            <span className="waitwhat">
                                                <span>
                                                    <b>{w.agent}</b> has been waiting{' '}
                                                    {humanSpan(Math.max(0, Math.round(
                                                        (now - new Date(w.since).getTime()) / 60_000)))}
                                                    {' '}in{' '}
                                                    <a className="aslink" href={`/p/${encodeURIComponent(w.project)}`}>
                                                        {w.project}
                                                    </a>
                                                </span>
                                                {w.body && (
                                                    <span className="waitsay">{firstLine(w.body, 140)}</span>
                                                )}
                                            </span>
                                            {/*
                                              * SAID PLAINLY, because the hub cannot answer this one. A held
                                              * PERMISSION request is answerable here — that is what the
                                              * approvals relay is for — but an ordinary "waiting for input"
                                              * lives in a terminal this server cannot reach. A row that
                                              * looked answerable and was not would be worse than a row that
                                              * says where to go.
                                              */}
                                            <span className="waitwhere">in the terminal</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/*
                          * THE DIGEST, ABOVE THE CHART — one line per project, and it is the answer to
                          * *"as if a person was sitting in my command center."*
                          *
                          * It is FOLDED, not generated: the newest brief each project's own agent wrote,
                          * one row each. So it costs no model call, it cannot say anything no agent said,
                          * and every line names who said it and when. Above the chart because "where are
                          * my projects" is read before "what ran last night", and there is no point
                          * putting the answer under a picture of the question.
                          *
                          * Rendered only when at least one project has a brief. An empty digest would be a
                          * heading over nothing, which is the shape this page has already shipped twice.
                          */}
                        {view.briefs.length > 0 && (
                            <>
                                <h2>Where things stand</h2>
                                <ul className="digest" data-measure="digest">
                                    {view.briefs.map(b => (
                                        <li
                                            key={b.project}
                                            className="digrow"
                                            data-measure="digest-row"
                                            data-project={b.project}
                                            style={{ ['--proj' as string]: projectColour(b.project) }}
                                        >
                                            <span className="pdot" style={{ background: projectColour(b.project) }} />
                                            <a className="digname" href={`/p/${encodeURIComponent(b.project)}`}>
                                                {b.project}
                                            </a>
                                            <span className="digsay">{b.standing}</span>
                                            {/*
                                              * BOTH, NOT EITHER. The first version showed "stuck" INSTEAD
                                              * of the age, which threw away the actionable half: a project
                                              * stuck for twenty minutes and one stuck for six days are the
                                              * same word and opposite situations. The marker says which
                                              * ones to look at; the age says which one first.
                                              */}
                                            <span className="digend">
                                                {b.blocked && (
                                                    <span className="digblocked" title={b.blocked}>stuck</span>
                                                )}
                                                <span className="digwhen">{humanAgo(b.at)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {runs.total > 0 && <Runs view={runs} now={now} />}

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
                        {/*
                          * THIS PARAGRAPH WENT OUT OF DATE THE MOMENT THE REPORT HOOKS SHIPPED, and it is
                          * worth recording why that matters more than the wording.
                          *
                          * It used to say *"sessions report at their start and end, and a sync counts too, so
                          * a long build with nothing in between can read as quiet for a while."* That was an
                          * honest caveat about a real limitation — and it became false, because `Stop` now
                          * reports every turn. A caveat nobody removed is a page describing a version of
                          * itself that no longer exists, which is exactly the class of untruth this whole
                          * surface is built to avoid. It is now the one thing that IS still conditional: the
                          * per-turn reporting only exists where somebody opted in.
                          */}
                        <p className="why presnote" data-measure="presence-caveat">
                            A project counts as being worked on if anything reported in within the last{' '}
                            {LIVE_MINUTES} minutes. Where <code>cc presence on</code> has run, that is every
                            turn an agent takes; everywhere else it is the start and end of a session plus
                            whenever an agent syncs, so a long stretch of quiet work can read as quiet.
                            Nothing here is stored — it is all recomputed from what agents have reported.
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
                        {/*
                          * DEMOTED FROM A SECTION TO A FOOTNOTE, and the owner is the one who said so.
                          *
                          * It had an `h2` and a bold figure inside a card, which made it the most prominent thing
                          * on a page whose subject is who is working. He opened it and said: "there is nothing,
                          * only the number $ that would be spent in tokens. That is a very low tier information,
                          * could be shown not so significantly."
                          *
                          * He is right, and the reason is worth stating rather than just obeying: NO HUMAN ACTION
                          * FOLLOWS FROM THIS NUMBER. He cannot spend less by looking at it, and he is not billed
                          * for it. It is the one figure on the page that is context rather than a prompt, so
                          * `docs/RESEARCH.md` §14 — "if clicking it does nothing, it does not go on the page" —
                          * applies to it more than to anything else here. It survives as a footnote because it is
                          * the only measure of how much work the agents have actually done, which is worth
                          * knowing once and never worth a heading.
                          *
                          * The per-project figures stay on their rows: attached to a project, a cost is at least
                          * about something. Detached and totalled, it was just a big number.
                          */}
                        {/* `.presnote` is the quiet footnote style this page already uses for the
                          * what-counts-as-working line — mute, one step down the type scale. Reused rather than
                          * given a class of its own, so the two footnotes read as the same kind of remark and no
                          * new colour or size enters the system. */}
                        <div className="presnote" data-measure="spend-total">
                            <p style={{ marginTop: 0 }}>
                                If you paid per token this work would have cost{' '}
                                <b>{humanDollars(wholeCost.dollars)}</b> across {humanCount(samples)} recorded
                                exchange{samples === 1 ? '' : 's'}
                                {measuredAt ? `, last measured ${humanAgo(measuredAt)}` : ''} —{' '}
                                <b>you were not charged this</b>, it is what the same work would have cost through
                                the API at list prices rather than on a subscription.
                            </p>
                            {elsewhereCost > 0 && (
                                /*
                                 * Reported rather than dropped, and rather than guessed into a project. See
                                 * `SPEND_ELSEWHERE` in lib/store.ts: a cwd is not a project, and folding a
                                 * scratch folder into whichever slug happened to be nearby would make the
                                 * per-project figures wrong in a way nothing on the page could reveal.
                                 */
                                <p data-measure="spend-elsewhere">
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
                                <p data-measure="spend-unpriced">
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
