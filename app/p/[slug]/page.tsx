import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasWebSession } from '../../../lib/auth';
import { LOOKS_COOKIE, parseLooks, resolveLooks } from '../../../lib/looks';
import { readLooksPreference } from '../../../lib/settings';
import { paletteCss } from '../../../lib/palettes';
import { surfaceCss } from '../../../lib/surfaces';
import { deriveWholeRecord, marks as marksOf, standing as standingOf } from '../../../lib/progress';
import { foldProjects, sentenceFor } from '../../../lib/presence';
import { buildThread, firstLine, newestPerSession } from '../../../lib/reports';
import { costOf, humanDollars } from '../../../lib/prices';
import { board, projectView } from '../../../lib/store';
import { humanAgo, humanCount, humanSpan } from '../../../lib/format';
import { buildTimeline } from '../../../lib/timeline';
/*
 * FROM `lib/colour.ts` AND NOT FROM `app/components/ui.tsx`, which re-exports the same function.
 *
 * `ui.tsx` is a `'use client'` module, and importing a function through it from a server component fails
 * at request time with *"Attempted to call projectColor() from the server but projectColor is on the
 * client"* — a 500 that typecheck cannot see, because the types are identical either way. That file's own
 * header explains the arrangement: the implementation lives in `lib/` precisely so both sides can reach it
 * without a second copy. Server pages take the direct route.
 */
import { projectColor } from '../../../lib/colour';
import Nav from '../../components/Nav';
import Runs from '../../components/Runs';
import Thread from '../../components/Thread';
import Attention from '../../components/Attention';
import SayMore from '../../components/SayMore';
import Forget from '../../components/Forget';
import Approvals from '../../components/Approvals';

export const dynamic = 'force-dynamic';

/**
 * ONE PROJECT. WHAT IS HAPPENING, WHAT IT NEEDS, WHAT WAS SAID, WHAT RAN.
 *
 * ==================================================================================================
 * THE SPECIFICATION IS HIS, AND HE GAVE IT FOUR TIMES BEFORE IT GOT BUILT
 * ==================================================================================================
 *
 * *"I want to open one of my projects and see what the AI has done, where they are, what they have
 * reported, how they are working… This hub must be my command center where I control all of my projects, or
 * my agents, all of my sub-agents, everyone and everything in a convenient way. I can separately open any
 * project and look at all of the projects together."*
 *
 * And on what shipped instead: *"Right now there is nothing, some outdated fucking information, how long
 * they have worked. That doesn't give me anything in the controls I want."*
 *
 * A project was a row on a list with nothing behind it. Everything needed already existed — presence,
 * sessions, sub-agents, spend, that project's tasks, questions and notes — and none of it was ever
 * assembled in one place about one thing.
 *
 * ==================================================================================================
 * THE ORDER OF THIS PAGE IS THE ARGUMENT, so it is stated rather than left to be inferred
 * ==================================================================================================
 *
 *   1. WHAT IS HAPPENING NOW, in a sentence, with the agent's own most recent words under it. The words
 *      are the thing Claude Code's own Agent View leads with and the thing this hub had no channel for
 *      until `Stop` hooks started reporting; they are what makes the difference between knowing a session
 *      is open and knowing what it is doing.
 *   2. WHAT IT NEEDS FROM HIM — held tool calls, then decisions, then work — answerable in place. First,
 *      because it is the only block on the page that unblocks something.
 *   3. THE CONVERSATION, newest first, with a box to say something back.
 *   4. WHAT RAN, as a chart, with sub-agents nested inside the runs that spawned them.
 *   5. WHAT IT COST, as a footnote, because no action follows from it.
 *
 * ==================================================================================================
 * WHAT IS DELIBERATELY NOT HERE
 * ==================================================================================================
 *
 * NO ROADMAP FIELD, NO PERCENTAGE, NO DESCRIPTION HE HAS TO MAINTAIN. He asked for *"where we stand on the
 * roadmap of the project"* and the honest way to give it is the amended rule in AGENTS.md: a maintained
 * document is banned, a timestamped report is the product. So "where we stand" is what agents have SAID,
 * with times on it, and what has actually been finished — not a number in a column that goes stale the day
 * somebody stops updating it. If a description belongs here later it will arrive the same way: reported,
 * attributed, dated.
 *
 * NO DIFFS AND NO TERMINAL. This hub cannot beat Claude Code at doing the work and should not pretend to.
 * What it can beat it at is many projects at once, what happened while he was away, and being reachable
 * when the machine is off — which is what this page is built out of.
 */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    if (!(await hasWebSession())) {
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12 }}>This device is not signed in.</p>
            </div>
        );
    }

    let view: Awaited<ReturnType<typeof projectView>>;
    let boardState: Awaited<ReturnType<typeof board>>;
    try {
        /* `board()` is here for the look only — the palette follows him between devices through the
         * settings table, and every page pays the same price for that. The two reads run concurrently. */
        [view, boardState] = await Promise.all([projectView(slug), board()]);
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

    /*
     * A 404 FOR A SLUG NOTHING HAS EVER MENTIONED, and this is a correctness decision rather than tidiness.
     * There is no projects table — a project is a slug something filed work under — so a typo in the URL
     * would otherwise render an authoritative page saying nothing has ever run here, which is a lie told
     * with total confidence. `known` in `projectView` is the check, and it is true for a project that is
     * merely idle.
     */
    if (!view.known) notFound();

    const progress = deriveWholeRecord(boardState);
    const standing = standingOf(progress);
    const { looks } = resolveLooks(
        parseLooks(await readLooksPreference((await cookies()).get(LOOKS_COOKIE)?.value)),
        standing,
        marksOf(progress),
    );
    const css = paletteCss(looks.palette);
    const surface = surfaceCss(looks.surface);

    /* ONE `now` FOR THE WHOLE RENDER — every sentence and every fold computed against the same instant,
     * so two lines on this page can never disagree about whether something is inside the live window. */
    const now = Date.now();

    const [presence] = foldProjects([view.project], view.presence, now);
    const sentence = presence ? sentenceFor(presence, now) : null;
    const runs = buildTimeline(view.sessions, view.subagents, now);

    /*
     * THE LATEST WORD PER CONVERSATION, newest first — and `said` only.
     *
     * A `waiting` row is shown by the section below it (it is an action, not a remark) and a `told` row is
     * his own sentence, which he does not need read back to him at the top of the page. What belongs here
     * is what the AGENTS said, because that is the question the header is answering.
     */
    const words = [...newestPerSession(view.reports).values()]
        .filter(r => r.kind === 'said' && r.body)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, 4);
    const waiting = [...newestPerSession(view.reports).values()].filter(r => r.kind === 'waiting');

    const thread = buildThread({
        reports: view.reports,
        questions: view.answeredQuestions,
        tasks: view.doneTasks,
        notes: view.notes,
        limit: 40,
        /* What the header is already showing does not appear again forty pixels lower. See `buildThread`. */
        exclude: new Set([...words.map(w => w.id), ...waiting.map(w => w.id)]),
    });

    const cost = costOf(view.spend);
    const samples = view.spend.reduce((n, r) => n + r.samples, 0);
    const hue = projectColor(view.project);

    return (
        <>
            {css && <style href={`cc-palette-${looks.palette}`} precedence="high">{css}</style>}
            {surface && <style href={`cc-surface-${looks.surface}`} precedence="high">{surface}</style>}
            <div className="wrap" style={{ ['--proj' as string]: hue }}>
                {/*
                  * `here="agents"` and NOT a fifth destination. Check L9 holds the nav at one line for every
                  * desktop width and the fourth item spends most of the slack the third left; a project is a
                  * child of Agents rather than a peer of it, so the crumb below is the way back.
                  */}
                <Nav here="agents" />

                <header>
                    <div className="top">
                        <a className="crumb" href="/agents" data-measure="crumb">← Agents</a>
                    </div>
                    <div className="phead" data-measure="project-head">
                        <span className="pdot big" style={{ background: hue }} />
                        <h1 data-measure="project-name">{view.project}</h1>
                    </div>

                    {/*
                      * THE ONE HONEST SENTENCE ABOUT NOW, built by `sentenceFor` on the server like every
                      * other presence line in the hub — never composed here. One function produces these
                      * strings so one check can assert the no-"you" rule over every state at once.
                      */}
                    <div className="summary" data-measure="project-summary">
                        {sentence
                            ? <span className={`pressay s-${presence!.state}`} data-measure="presence-line">
                                {sentence}
                              </span>
                            : <span className="sub">Nothing has ever reported in from this project.</span>}
                        {presence?.branch && <span className="presbranch">{presence.branch}</span>}
                        {presence?.model && <span className="presmodel">{presence.model}</span>}
                    </div>
                </header>

                {/*
                  * WAITING FOR A PERSON — the harness said so, and it is said here before anything else.
                  *
                  * This is not an agent grading itself: `Notification` with a type of `agent_needs_input`,
                  * `idle_prompt` or `permission_prompt` is the HARNESS reporting that its agent is blocked.
                  * That is the distinction that makes it admissible where a self-declared status is not, and
                  * lib/reports.ts carries the whole argument.
                  *
                  * It cannot be answered from here and does not pretend to be: what is in the terminal stays
                  * in the terminal. What the hub can do is make sure he KNOWS, from wherever he is.
                  */}
                {waiting.length > 0 && (
                    <ul className="waitlist" data-measure="waiting-list">
                        {waiting.map(w => (
                            <li key={w.session} className="waitrow" data-measure="waiting-row">
                                <span className="waitpip" aria-hidden="true" />
                                <span className="waitwhat">
                                    {/*
                                      * ONE SPAN FOR THE SENTENCE. `.waitwhat` is a flex column, so a bare
                                      * `<b>` beside a text node makes two flex items and the name lands on a
                                      * line of its own — which is what the first render did.
                                      *
                                      * "has been waiting 33 min", never "waiting since 33 min ago": the
                                      * duration is the fact, and `humanAgo` composes a phrase that already
                                      * ends in "ago" and cannot be preceded by "since".
                                      */}
                                    <span>
                                        <b>{w.agent}</b> has been waiting{' '}
                                        {humanSpan(Math.max(0, Math.round(
                                            (now - new Date(w.at).getTime()) / 60_000)))}
                                    </span>
                                    {w.body && <span className="waitsay">{firstLine(w.body, 140)}</span>}
                                </span>
                                <span className="waitwhere">in the terminal</span>
                            </li>
                        ))}
                    </ul>
                )}

                {/*
                  * WHAT WAS JUST SAID. The richest thing on the page and the cheapest to be honest about:
                  * every line is a quote with a name and a time on it, which is exactly the test AGENTS.md
                  * sets for anything claiming to describe a project's state.
                  */}
                {words.length > 0 && (
                    <section className="lastwords" data-measure="last-words">
                        <h2>The latest word</h2>
                        <ul className="wordlist">
                            {words.map(w => (
                                <li key={w.id} className="wordrow" data-measure="word-row">
                                    <span className="wordwho">{w.agent}</span>
                                    <span className="wordwhen">{humanAgo(w.at)}</span>
                                    {/* Clamped to four lines with a control that opens it — see SayMore.
                                        A closing summary runs long and this is the headline of the page, so
                                        it must be readable in full without leaving. */}
                                    <div className="wordbody">
                                        <SayMore text={w.body!} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <Approvals approvals={view.approvals} />

                <Attention questions={view.openQuestions} tasks={view.openTasks} />

                <Thread project={view.project} items={thread} />

                {/* The chart, when this project has anything in the window. A chart of nothing is the
                    660px void the palette page already had removed from it once. */}
                {runs.total > 0 && <Runs view={runs} now={now} />}

                {/*
                  * THE WAY OUT OF A PHANTOM, offered only where it could be one.
                  *
                  * A project with no tasks and no decisions has never had work filed against it, which is
                  * exactly the shape of a slug that was a subdirectory rather than a project. Offering the
                  * control on a real project would be a delete button on a page full of somebody's work, and
                  * `forgetProject` refuses there anyway — so this condition keeps a dangerous-looking control
                  * off pages where it cannot do anything.
                  */}
                {view.openTasks.length === 0 && view.doneTasks.length === 0
                    && view.openQuestions.length === 0 && view.answeredQuestions.length === 0 && (
                    <Forget project={view.project} />
                )}

                {samples > 0 && (
                    <div className="presnote" data-measure="project-spend">
                        <p style={{ marginTop: 0 }}>
                            If you paid per token, the work recorded here would have cost{' '}
                            <b>{humanDollars(cost.dollars)}</b> across {humanCount(samples)} recorded
                            exchange{samples === 1 ? '' : 's'} — <b>you were not charged this</b>, it is what
                            the same work would have cost through the API at list prices rather than on a
                            subscription.
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
