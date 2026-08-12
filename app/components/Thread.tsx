'use client';

import { useState } from 'react';
import type { ThreadItem } from '../../lib/reports';
import { act, humanAgo } from './ui';
import SayMore from './SayMore';

/**
 * ONE PROJECT'S CONVERSATION, IN THE ORDER IT HAPPENED — and a box to say something back.
 *
 * ==================================================================================================
 * WHAT HE ASKED FOR, AND WHY THIS IS IT RATHER THAN A CHAT CLIENT
 * ==================================================================================================
 *
 * *"You can take part in what's going on right now by chatting with your AI agents right from the hub
 * and answering their questions and insights."*
 *
 * The instinct is a socket, a message table and a running agent listening on the other end. That would be
 * a second application, and he refused one in as many words — *"the last thing we want is to complicate
 * the thing that we already built by creating a second app. They will overlap and kinda mess with each
 * other."* It would also be a promise the hub cannot keep: a note cannot be pushed into a session that is
 * not asking for one, so a chat box that looked instant would be lying about delivery.
 *
 * Every piece of the exchange already existed and was scattered:
 *
 *   - what he types in the terminal      `UserPromptSubmit` → a `told` report
 *   - what the assistant says back       `Stop` → a `said` report
 *   - when it needs a person             `Notification` → a `waiting` report
 *   - what he tells it through the hub    a NOTE, collected on the next sync
 *   - what it asks him                   a QUESTION, with options and a timed default
 *   - what got finished                  a task's completion
 *
 * Put in one column in time order, that IS the conversation. Nothing new had to be invented; what was
 * missing was a place that showed it.
 *
 * ==================================================================================================
 * THE REPLY BOX SAYS WHAT IT ACTUALLY DOES
 * ==================================================================================================
 *
 * It writes a note against this project, which the next agent to sync collects. So the confirmation says
 * *"the next agent to sync will read this"* and never "sent" — the same honesty rule `noteReach` follows
 * by saying "synced" rather than "read". A box that said "Sent" over a message nothing had collected
 * would be the one failure this hub is built to not have.
 *
 * ==================================================================================================
 * NEWEST FIRST, AND THE COMPOSER AT THE TOP
 * ==================================================================================================
 *
 * He opens this to find out what just happened, not to read a project from the beginning — so the newest
 * item is the first one, and the box he might type into is above it rather than at the bottom of a scroll.
 * The cap is applied to the newest end for the same reason.
 */

/**
 * WHAT EACH KIND IS CALLED. One word or two, and NEVER repeating the name beside it.
 *
 * The first render of this page read `youyou saidthe pricing helper is called in four places` — the who
 * column says "you" and the label said "you said", so the page introduced him twice and then ran the two
 * together. The label's job is the VERB; the column beside it already answers who.
 */
const VOICE: Record<ThreadItem['kind'], { who: string; label: string }> = {
    said: { who: 'agent', label: 'said' },
    told: { who: 'you', label: 'said' },
    waiting: { who: 'wait', label: 'waiting for you' },
    asked: { who: 'agent', label: 'asked' },
    answered: { who: 'you', label: 'answered' },
    finished: { who: 'done', label: 'finished' },
    note: { who: 'you', label: 'left a note' },
};

function Item({ item }: { item: ThreadItem }) {
    const voice = VOICE[item.kind];
    return (
        <li
            className={`thitem th-${item.kind}`}
            data-measure="thread-item"
            data-kind={item.kind}
        >
            {/*
              * FOUR DIRECT CHILDREN, because the row is a four-column grid and a wrapper around two of them
              * would collapse the layout into three. The verb gets a track of its own so who, what and when
              * sit on one baseline — the first version nested the label above the body and every item was
              * two lines tall, which turned forty of them into a scroll nobody would read.
              */}
            <span className="thwho" data-who={voice.who}>
                {/* The agent's own name where there is one, because "who said it" is half of what makes a
                    report admissible at all. His side is "you" — the one place in this hub where the second
                    person is right, since it is a label on his own words rather than a claim about his
                    attention (the rule lib/presence.ts sets for sentences ABOUT projects). */}
                {item.agent ?? 'you'}
            </span>
            <span className="thlabel">{voice.label}</span>
            {/*
              * `white-space: pre-wrap` in the stylesheet, so a message that had line breaks in it keeps
              * them. An assistant's last words are often a short list, and reflowing that into a paragraph
              * makes it less readable than the terminal it came from — which would defeat the whole point
              * of this page.
              */}
            {/* Clamped to four lines with a control that opens it. A forty-item thread cannot spend twenty
                lines on one turn's closing summary, and cutting it with no way through would be the
                truncation-without-a-route the audit exists to catch. */}
            <span className="thbody">
                <SayMore text={item.body} />
                {item.meta && <span className="thmeta"> — {item.meta}</span>}
            </span>
            <span className="thwhen">{humanAgo(item.at)}</span>
        </li>
    );
}

export default function Thread({ project, items }: { project: string; items: ThreadItem[] }) {
    /*
     * The list is state because the composer adds to it — from the row the SERVER read back, never from
     * what was typed. An optimistic item would be this component claiming a write it does not know
     * happened, which is the one bug lib/db.ts exists to make impossible.
     */
    const [shown, setShown] = useState(items);
    const [body, setBody] = useState('');
    const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
    const [refused, setRefused] = useState<string | null>(null);

    async function say() {
        const text = body.trim();
        if (!text) return;
        setState('busy');
        setRefused(null);
        const r = await act({ action: 'note.add', project, body: text });
        if (r.ok) {
            const note = (r.data as { note?: { id: string; body: string; created_at: string } } | null)?.note;
            if (note) {
                setShown([
                    { at: note.created_at, kind: 'note', agent: null, body: note.body, ref: note.id, meta: null },
                    ...shown,
                ]);
            }
            setBody('');
            setState('saved');
        } else {
            setState('idle');
            setRefused(r.message);
        }
    }

    return (
        <section className="thread" data-measure="thread">
            <div className="threadhead">
                <h2>The conversation</h2>
                <p className="runwhen">
                    Everything said about {project}, newest first — in the terminal and here.
                </p>
            </div>

            <div className="thcompose">
                {/* `.field-label` is the convention every other input in the hub uses — a visible label,
                    not a hidden one. The first version invented a `visually-hidden` class that does not
                    exist in the stylesheet, so the "hidden" text rendered at full size directly above a
                    placeholder saying the same words. */}
                <label className="field-label" htmlFor="thsay">Say something to the {project} agents</label>
                <textarea
                    id="thsay"
                    className="thinput"
                    data-measure="thread-compose"
                    rows={2}
                    placeholder="Anything they should know, or should do next…"
                    value={body}
                    onChange={e => { setBody(e.target.value); setState('idle'); }}
                    /*
                     * Ctrl/Cmd+Enter sends and a bare Enter does not, which is the right way round for a box
                     * whose contents are often two sentences. The slash-key search shortcut is why this
                     * component must not swallow plain typing: see the `INPUT_TAGS` note in Board.
                     */
                    onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void say(); }
                    }}
                />
                <div className="thcomposefoot">
                    <button
                        className="primary"
                        data-measure="thread-send"
                        disabled={state === 'busy' || !body.trim()}
                        onClick={() => void say()}
                    >
                        {state === 'busy' ? 'Saving…' : 'Leave it for the agents'}
                    </button>
                    {/*
                      * NEVER "SENT". A note waits to be collected by the next sync, and saying otherwise
                      * about a message he needs delivered would be the exact overclaim `noteReach` was
                      * written to avoid.
                      */}
                    <span className="thhint" data-measure="thread-state" role="status">
                        {refused
                            ? <span className="refusedtext">{refused}</span>
                            : state === 'saved'
                                ? 'Saved — the next agent to sync in this project will read it'
                                : 'Ctrl+Enter. It is collected on the next sync, not pushed into a session.'}
                    </span>
                </div>
            </div>

            {shown.length === 0 ? (
                /*
                 * A REAL EMPTY STATE, because this one is reached by everybody who has not installed the
                 * report hooks — which on the day this ships is everybody. A page that just showed an empty
                 * column would read as a broken feature rather than as an un-started one, which is the
                 * mistake `/agents` shipped with once already.
                 */
                <p className="empty" data-measure="thread-empty">
                    Nothing has been said here yet. The terminal half of this — what the assistant says each
                    turn, and what you type — arrives once <code>cc presence on</code> has run in this
                    project&rsquo;s folder. Notes you leave above show up here either way.
                </p>
            ) : (
                <ul className="thlist" data-measure="thread-list">
                    {shown.map((item, i) => (
                        <Item key={`${item.at}-${item.kind}-${item.ref ?? i}`} item={item} />
                    ))}
                </ul>
            )}
        </section>
    );
}
