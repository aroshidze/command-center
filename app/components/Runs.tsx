'use client';

import { useState } from 'react';
import type { Block, SubagentMark, TimelineView } from '../../lib/timeline';
import { humanSpan, projectColor } from './ui';

/**
 * WHAT RAN, LAID OUT ON TIME — the centre of `/agents`, and the thing that should have been built the
 * first time he asked.
 *
 * ==================================================================================================
 * WHY THIS IS A CHART AND NOT A LIST, AFTER THREE REFUSALS
 * ==================================================================================================
 *
 * He asked five times for a hub that shows what his agents are doing, and each time the answer was some
 * version of *"dashboards die"*, *"watching is not acting"*, *"sub-agents live for seconds"*. What
 * shipped was five one-line rows and a dollar figure, and he opened it and said *"THIS IS IT?"*
 *
 * Three of those objections do not survive contact with the request. Sub-agents do not live for
 * seconds: measured on his own machine they run for tens of seconds to several minutes and there are
 * thirty-nine of them in a fortnight. "Watching is not acting" is an argument against a live feed, and
 * this is not one — it is a record of a night that has already happened. "Dashboards die" is a real
 * finding (docs/RESEARCH.md §14) and it is an argument about panels that answer no question, which is
 * why the per-project sentences and the one action stay directly underneath this and why spend is still
 * a footnote.
 *
 * The objection that DOES survive is the volume one, and it is honoured upstream rather than here:
 * one row per session and one per sub-agent, never one per tool call. See app/api/agent/subagent.
 *
 * ==================================================================================================
 * THE DRAWING RULES, AND EVERY ONE OF THEM IS ABOUT NOT OVERCLAIMING
 * ==================================================================================================
 *
 * A block is a claim about a span of time, which makes this the most dangerous surface in the hub for
 * the mistake that has now shipped twice. So:
 *
 *  - **A running session has no right-hand edge.** It fades into the lane instead of stopping, because
 *    there is no end to draw. It is the only thing on the page that is allowed to say "now".
 *  - **An un-ended session too old to believe is drawn to the last thing seen**, never to now, and gets
 *    a broken right edge. The rows say a session began and nothing closed it; they do not say it is
 *    still going.
 *  - **A reconstructed block is drawn hollow.** It came out of the transcript rather than out of a
 *    hook, and hollow-versus-filled is the plainest available way to say "inferred" without a legend
 *    nobody reads. There is a legend anyway.
 *  - **A span too narrow to be a bar is a TICK, not a minimum-width bar.** Taken from Grafana's state
 *    timeline, which renders a label inside a region only if it fits: when a duration cannot be drawn,
 *    a mark saying *something happened here* is true and a three-pixel rectangle claiming four minutes
 *    is not.
 *  - **Nothing animates into place.** Hard constraint. The blocks are painted where they belong, at
 *    the width they belong, on the first frame.
 *
 * ==================================================================================================
 * WHAT IS DELIBERATELY NOT HERE
 * ==================================================================================================
 *
 * No zoom, no pan, no brush, no time-range picker. Every one of them is a control that has to be
 * operated before the page says anything, and the question this answers — what ran last night — has one
 * answer that needs no operating. Grafana and Datadog both need those controls because their users are
 * hunting inside a trace; he is looking at a night.
 */

/** Padded UTC clock time. Every date in this hub is UTC, and an axis that disagreed would be a bug. */
function clockOf(iso: string): string {
    const d = new Date(iso);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

/**
 * The one sentence a block is worth, built here and used for both the title and the detail line.
 *
 * IT NEVER SAYS MORE THAN THE KIND ALLOWS. A `running` block has no duration in it, because a duration
 * ending at the moment somebody happened to look is not a measurement; it says how long it has been
 * going instead, which is a different and defensible claim. An `unterminated` one says what it is
 * rather than pretending to be either.
 */
function blockSentence(b: Block, now: number): string {
    const started = clockOf(b.startedAt);
    switch (b.kind) {
        case 'running':
            return `started ${started}, still going — ${humanSpan(
                Math.max(0, Math.round((now - new Date(b.startedAt).getTime()) / 60_000)),
            )} so far`;
        case 'unterminated':
            return `started ${started}, last seen ${clockOf(b.endedAt!)} — never signed off`;
        case 'reconstructed':
            return `${started}–${clockOf(b.endedAt!)}, ${humanSpan(b.minutes ?? 0)} — from the transcript`;
        default:
            return `${started}–${clockOf(b.endedAt!)}, ${humanSpan(b.minutes ?? 0)}`;
    }
}

function subagentSentence(a: SubagentMark): string {
    const ran = a.endedAt
        ? humanSpan(Math.max(0, Math.round(
            (new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime()) / 60_000)))
        : null;
    const how = a.kind === 'running'
        ? 'still running'
        : a.outcome === 'completed' ? 'completed'
            : a.outcome === 'failed' ? 'failed'
                : a.kind === 'unterminated' ? 'never reported an end'
                    : 'finished';
    /* "finished" and not "completed" for the background path. SubagentStop fires whether the work went
     * well or badly, so the hub stores `ended` and this says exactly that much. */
    const did = [
        a.toolCalls != null ? `${a.toolCalls} tool call${a.toolCalls === 1 ? '' : 's'}` : null,
        a.edits ? `${a.edits} file${a.edits === 1 ? '' : 's'} edited` : null,
        a.linesAdded || a.linesRemoved
            ? `+${a.linesAdded ?? 0}/-${a.linesRemoved ?? 0}` : null,
    ].filter(Boolean).join(', ');
    return `${a.type}${a.task ? ` — ${a.task}` : ''} · ${clockOf(a.startedAt)}`
        + `${ran ? `, ${ran}` : ''}, ${how}${did ? ` · ${did}` : ''}`;
}

function SubMark({ a }: { a: SubagentMark }) {
    return (
        <span
            className={`runsub k-${a.kind}${a.tick ? ' istick' : ''}`}
            data-measure="run-subagent"
            data-kind={a.kind}
            data-outcome={a.outcome ?? 'open'}
            style={{ left: `${a.left}%`, width: a.tick ? undefined : `${a.width}%` }}
            title={subagentSentence(a)}
        />
    );
}

function BlockBar({ b, now, onPick, picked }: {
    b: Block; now: number; onPick: (key: string | null) => void; picked: boolean;
}) {
    const sentence = blockSentence(b, now);
    return (
        <button
            type="button"
            className={`runblock k-${b.kind}${b.tick ? ' istick' : ''}`
                + `${b.clippedLeft ? ' clipped' : ''}${picked ? ' picked' : ''}`}
            data-measure="run-block"
            data-kind={b.kind}
            data-project={b.project}
            style={{
                left: `${b.left}%`,
                width: b.tick ? undefined : `${b.width}%`,
                top: `${b.row * 16}px`,
            }}
            title={`${b.project} · ${sentence}`
                + `${b.branch ? ` · ${b.branch}` : ''}${b.model ? ` · ${b.model}` : ''}`
                + `${b.subagents.length ? ` · ${b.subagents.length} sub-agent(s)` : ''}`}
            aria-label={`${b.project}, ${sentence}`}
            onClick={() => onPick(picked ? null : b.key)}
        >
            {/* The sub-agents, positioned against this block rather than against the chart — which is
                what makes them nested rather than merely nearby. A tick that would fall outside its
                parent is clamped to it in the fold, because a child outside its parent reads as a
                rendering fault rather than as data. */}
            {b.subagents.map(a => <SubMark key={a.id} a={a} />)}
        </button>
    );
}

/**
 * THE DETAIL, and it is deliberately one line rather than a panel.
 *
 * Everything a block knows fits in a sentence, and a sentence costs no layout. A popover would need
 * positioning, dismissal, focus management and a decision about what happens at the right edge of the
 * screen — four new things to maintain for information that is already in the `title`. This is the
 * keyboard-and-tap-reachable version of the same string.
 */
function Detail({ b, now }: { b: Block; now: number }) {
    return (
        <div className="rundetail" data-measure="run-detail">
            <span className="pdot" style={{ background: projectColor(b.project) }} />
            <b>{b.project}</b>
            <span className="runsay">{blockSentence(b, now)}</span>
            {b.branch && <span className="runmeta">{b.branch}</span>}
            {b.model && <span className="runmeta">{b.model}</span>}
            {b.endReason && b.kind === 'measured' && (
                <span className="runmeta">ended: {b.endReason}</span>
            )}
            {b.subagents.length > 0 && (
                <ul className="runsubs" data-measure="run-subagent-list">
                    {b.subagents.map(a => (
                        <li key={a.id} data-measure="run-subagent-line" data-outcome={a.outcome ?? 'open'}>
                            <span className={`runpip k-${a.kind}`} />
                            <span className="runsubtype">{a.type}</span>
                            {a.task && <span className="runsubtask">{a.task}</span>}
                            <span className="runsubwhen">{subagentSentence(a).split(' · ').slice(1).join(' · ')}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function Runs({ view, now }: { view: TimelineView; now: number }) {
    const [picked, setPicked] = useState<string | null>(null);
    const chosen = picked
        ? view.lanes.flatMap(l => l.blocks).find(b => b.key === picked) ?? null
        : null;

    return (
        <section className="runchart" data-measure="runs">
            <div className="runhead">
                <h2>What ran</h2>
                {/*
                  * THE WINDOW, STATED. A chart with an unstated span is a chart you cannot read a
                  * duration off, and "the last day" is a different claim from "since the last thing
                  * that happened" — which is what the window becomes when nothing has run in a day.
                  */}
                <p className="runwhen" data-measure="run-window">
                    {view.stretched
                        ? `Nothing in the last ${24} hours — showing the last ${view.hours} hours, `
                          + 'back to the most recent run'
                        : `The last ${view.hours} hours`}
                    {view.total > 0 && (
                        <> · {view.total} run{view.total === 1 ? '' : 's'}
                            {view.running > 0 && <> · <b>{view.running} still going</b></>}
                            {view.subagents > 0 && <> · {view.subagents} sub-agent
                                {view.subagents === 1 ? '' : 's'}</>}
                        </>
                    )}
                </p>
            </div>

            <div className="runaxis" data-measure="run-axis" aria-hidden="true">
                {view.axis.map(m => (
                    <span
                        key={`${m.at}-${m.label}`}
                        className={`runtick${m.major ? ' major' : ''}${m.droppable ? ' droppable' : ''}`}
                        style={{ left: `${m.at}%` }}
                    >
                        {m.label}
                    </span>
                ))}
            </div>

            {/*
              * THE GRID, and it is not decoration. Nine lanes deep, a block's position is unreadable
              * against an axis at the top unless something carries the hour down the chart — which is
              * why every reference that draws time draws one. It is one hairline per label, at the same
              * percentages the labels use, so the line and its label cannot drift apart.
              *
              * `aria-hidden` and inert: it is the axis restated, and a screen reader has already been
              * told each block's time in words.
              */}
            <div className="runlanes-wrap">
                <div className="rungrid" aria-hidden="true">
                    {view.axis.map(m => (
                        <span
                            key={`g${m.at}`}
                            className={`runline${m.major ? ' major' : ''}`
                                + `${m.droppable ? ' droppable' : ''}`}
                            style={{ left: `${m.at}%` }}
                        />
                    ))}
                </div>
                <ul className="runlanes" data-measure="run-lanes">
                {view.lanes.map(lane => (
                    <li
                        key={lane.project}
                        className="runlane"
                        data-measure="run-lane"
                        data-project={lane.project}
                        style={{
                            ['--proj' as string]: projectColor(lane.project),
                            ['--rows' as string]: lane.rows,
                        }}
                    >
                        <span className="runname">{lane.project}</span>
                        <span className="runtrack">
                            {lane.blocks.map(b => (
                                <BlockBar
                                    key={b.key}
                                    b={b}
                                    now={now}
                                    picked={b.key === picked}
                                    onPick={setPicked}
                                />
                            ))}
                        </span>
                    </li>
                ))}
                </ul>
            </div>

            {/* The detail slot is always in the document, so choosing a block cannot move anything
                below it. A chart that reflows the page when you touch it is a chart you stop touching. */}
            <div className="rundetailslot">
                {chosen
                    ? <Detail b={chosen} now={now} />
                    : <p className="runhint" data-measure="run-hint">
                        Every bar is one run. Tap one for its branch, its model and what it spawned.
                      </p>}
            </div>

            <p className="why presnote" data-measure="run-legend">
                A bar is a run that was watched from start to finish.{' '}
                <span className="runkey k-running" aria-hidden="true" /> no right-hand edge means it is
                still going.{' '}
                <span className="runkey k-unterminated" aria-hidden="true" /> a broken edge means it
                started and nothing ever closed it, so it is drawn to the last thing seen rather than to
                now.{' '}
                {view.anyReconstructed && (
                    <>
                        <span className="runkey k-reconstructed" aria-hidden="true" /> a hatched bar was
                        read back from Claude Code&rsquo;s own transcript rather than reported by a hook,
                        so its edges are where the messages stop rather than where anything said the
                        session did.{' '}
                    </>
                )}
                A run shorter than about four minutes is drawn as a mark rather than a bar, because a bar
                that narrow would be claiming a length it does not have.
                {view.anyClipped && ' A bar with no left edge began before this window.'}
            </p>
        </section>
    );
}
