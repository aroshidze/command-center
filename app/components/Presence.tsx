'use client';

import { useState } from 'react';
import type { AgentPresence, ProjectPresence } from '../../lib/presence';
import { humanAgo, projectColor } from './ui';
import { act } from './ui';

/**
 * ONE PROJECT'S PRESENCE, AND THE ONE THING TO DO ABOUT IT.
 *
 * ==================================================================================================
 * THE BUTTON IS THE WHOLE REASON THIS IS A CLIENT COMPONENT
 * ==================================================================================================
 *
 * `docs/RESEARCH.md` §14's rule is that if pressing it does nothing, it does not go on the page — and a
 * presence list with no action is exactly the "live agent status board" the roadmap refuses, because *"it
 * rewards an agent for stalling wordlessly instead of articulating what it needs"*. What makes this list
 * legitimate rather than a dashboard is that every quiet line carries a way to act on it.
 *
 * IT POINTS AT THE AGENT, NOT AT HIM — the same framing `StaleBlocked.tsx` argued for and for the same
 * reason. A quiet project is not a failure of his attention; something stopped running. So the button writes
 * a NOTE addressed to that project, which the next agent to sync will read, and the note asks the agent to
 * report in rather than telling him to go and look.
 *
 * ==================================================================================================
 * WHY A NOTE AND NOT A TASK
 * ==================================================================================================
 *
 * A task is work only he can do, and this is the opposite: it is work only an agent can do. Filing it as a
 * task would put it in the queue and in the counts, which is precisely what §2 of the brief forbids — and it
 * would be a task he could never tick off, because the thing that completes it is an agent syncing.
 */
export function ProjectRow({ p, sentence, spend, onRefused }: {
    p: ProjectPresence;
    /** Built by `sentenceFor` on the server. Never composed here — see lib/presence.ts. */
    sentence: string;
    /** The one figure, already rendered. Null when nothing has been measured for this project. */
    spend: string | null;
    onRefused: (message: string) => void;
}) {
    const [state, setState] = useState<'idle' | 'busy' | 'asked'>('idle');

    async function reportIn() {
        setState('busy');
        const r = await act({
            action: 'note.add',
            project: p.project,
            /*
             * The note says what the hub can see and asks for the one thing it cannot. It does NOT assert that
             * anything is wrong — "nothing has reported in" is a fact about the hub's own records, and an agent
             * may have been working locally the whole time with no hook installed. Claiming a problem the data
             * does not support is the failure this surface exists to avoid, pointed the other way.
             */
            body: p.state === 'never'
                ? `Nothing has ever reported in from ${p.project}, so the hub cannot tell whether anything is `
                  + 'running here. If you are working on this project, run a sync — and if presence hooks are '
                  + 'not installed, "cc presence on" in this folder installs them.'
                : `Nothing has looked at ${p.project} since ${p.lastSeenAt}. If work is still in progress `
                  + 'here, sync so the hub knows; if it stopped, say what it stopped on.',
        });
        if (r.ok) setState('asked');
        else {
            setState('idle');
            onRefused(`Could not leave a note for ${p.project} — ${r.message}`);
        }
    }

    return (
        <li
            className="presrow"
            data-measure="presence-row"
            data-project={p.project}
            data-state={p.state}
            /* The project's own hue as the row's inset edge, the same construction `.pgroup` uses on the
             * board — so a project is findable across both pages without reading its name. */
            style={{ ['--proj' as string]: projectColor(p.project) }}
        >
            <span className="pdot" style={{ background: projectColor(p.project) }} />
            <span className="preswhat">
                <span className="presname">{p.project}</span>
                {/* The honest line. `data-sentence` so a check can read it without depending on how the
                    surrounding markup is laid out — check A3 asserts the no-"you" rule over all four states. */}
                <span className={`pressay s-${p.state}`} data-measure="presence-line">{sentence}</span>
            </span>

            <span className="presmeta">
                {/*
                  * The branch and the model, when there are any. Facts read off the machine by the hook —
                  * there is deliberately no field an agent fills in about what it is doing, for the reason
                  * lib/presence.ts gives at length.
                  */}
                {p.branch && <span className="presbranch">{p.branch}</span>}
                {p.model && <span className="presmodel">{p.model}</span>}
                {spend && (
                    /* ONE FIGURE, and it is not a comparison. No bar, no share, no ranking against the other
                     * projects — see the caveat under the list for what the number is and is not. */
                    <span className="presspend" data-measure="presence-spend">{spend}</span>
                )}
            </span>

            {/*
              * Offered only where it would achieve something. A working project needs no nudge, and a control
              * that does nothing is the dead control §14 bans. `open` is excluded too: something opened a
              * session and has not signed off, so asking it to report in is asking a question it is already
              * answering.
              */}
            {(p.state === 'quiet' || p.state === 'never') && (
                <button
                    className="quiet presask"
                    data-measure="presence-ask"
                    disabled={state !== 'idle'}
                    title={`Leave a note for the ${p.project} agents asking them to report in`}
                    onClick={reportIn}
                >
                    {state === 'asked' ? 'Asked' : state === 'busy' ? '·' : 'Ask it to report in'}
                </button>
            )}
        </li>
    );
}

/**
 * The list, plus the one place a refusal can be said.
 *
 * A refused write is lifted out of the row and printed at the top for the same reason `Board` lifts one out
 * of a task row: the row is 34px tall and the message is the one thing in the interface that must not be
 * missed. It does not fade and it does not time out.
 */
export default function Presence({ projects, sentences, spend, agents }: {
    projects: ProjectPresence[];
    /** project slug -> its sentence, built on the server by `sentenceFor`. */
    sentences: Record<string, string>;
    /** project slug -> its rendered spend figure, or absent. */
    spend: Record<string, string>;
    agents: AgentPresence[];
}) {
    const [refused, setRefused] = useState<string | null>(null);

    return (
        <>
            <div className="refused" role="alert" aria-live="assertive" data-measure="save-state">
                {refused && (
                    <>
                        <span className="refusedtext">{refused}</span>
                        <button className="quiet" onClick={() => setRefused(null)}>Dismiss</button>
                    </>
                )}
            </div>

            <ul className="preslist" data-measure="presence-list">
                {projects.map(p => (
                    <ProjectRow
                        key={p.project}
                        p={p}
                        sentence={sentences[p.project] ?? ''}
                        spend={spend[p.project] ?? null}
                        onRefused={setRefused}
                    />
                ))}
            </ul>

            {/*
              * THE AGENTS, and this list exists for a question the project list cannot answer: whether an
              * agent has stopped EVERYWHERE. Four projects going quiet in the same hour is one dead agent
              * rather than four dead projects, and reading that off the project list means holding four rows
              * in your head and noticing they share a name.
              *
              * Rendered only when there is more than one, because with one agent the two lists say the same
              * thing twice — and "the same fact stated twice" is a defect this codebase has caught itself in
              * before.
              */}
            {agents.length > 1 && (
                <>
                    <h2>Agents</h2>
                    <ul className="preslist agentlist" data-measure="agent-list">
                        {agents.map(a => (
                            <li key={a.agent} className="presrow" data-measure="agent-row"
                                data-agent={a.agent} data-state={a.state}>
                                <span className="preswhat">
                                    <span className="presname">{a.agent}</span>
                                    <span className={`pressay s-${a.state}`}>
                                        {a.state === 'working'
                                            ? `working on ${a.project} now`
                                            : a.lastSeenAt
                                                ? `last heard from ${humanAgo(a.lastSeenAt)}`
                                                  + (a.project ? `, on ${a.project}` : '')
                                                : 'never heard from'}
                                    </span>
                                </span>
                                <span className="presmeta">
                                    <span className="presbranch">
                                        {a.projects} project{a.projects === 1 ? '' : 's'}
                                    </span>
                                    {a.model && <span className="presmodel">{a.model}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}
