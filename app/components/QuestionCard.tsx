'use client';

import { useState } from 'react';
import type { Question } from '../../lib/types';
import {
    act, blockedFacts, deadlineFacts, humanAgo, KeyHint, projectColor, Saved, submitOnCtrlEnter,
    type SaveState,
} from './ui';

/**
 * A decision an agent is blocked on. The loudest thing on the page, and the only thing allowed to be.
 *
 * A blocked decision costs hours or days; an untouched task costs nothing. If only one section is ever
 * read, it is this one.
 *
 * WHAT CHANGED AND WHY IT IS SHORTER NOW
 *
 * The card used to be about 300px tall each, so four open decisions filled the entire first screen of a
 * 1080px monitor and pushed every task below the fold — measured: zero tasks above the fold at any width.
 * Two things caused most of that height, and neither was carrying its weight:
 *
 *   1. A textarea rendered unconditionally, on every card, before anyone had asked to write anything.
 *      Six of them on load. It is behind "Add a comment" now, which costs one click in the uncommon case
 *      and returns roughly 90px per card in the common one. The one-tap path is untouched.
 *   2. Options stacked full width, one per line. That is right for a thumb and wrong for a mouse, so it
 *      is now governed by pointer type like every other size in this interface: they wrap into a row on a
 *      fine pointer and stack full-width on a coarse one.
 */
export default function QuestionCard({ q, onGone }: { q: Question; onGone: (id: string) => void }) {
    const [state, setState] = useState<SaveState>({ kind: 'idle' });
    // One input for the whole card. See below for why there is not a second one.
    const [note, setNote] = useState('');
    // `respond` questions have nothing to tap, so the box is the answer and opens with the card.
    const [commenting, setCommenting] = useState(
        !q.allow.includes('choose') && !q.allow.includes('accept'),
    );
    const busy = state.kind === 'busy';

    /**
     * The comment field is sent with WHICHEVER button is tapped, rather than being its own submit.
     *
     * The first version of this hub forced a choice: pick an option, or type something. Real use hit that
     * immediately — "my answer is A, but also make sure you do B" — and the caveat had to go back into
     * chat, which is the thing this hub exists to stop. One optional box costs the one-tap case nothing
     * and makes the fast path the complete path.
     */
    async function answer(payload: Record<string, unknown>) {
        setState({ kind: 'busy' });
        const r = await act({
            action: 'question.answer',
            id: q.id,
            ...(note.trim() ? { note: note.trim() } : {}),
            ...payload,
        });
        if (r.ok) {
            setState({ kind: 'ok', message: 'Saved' });
            // Only remove it from the list once the database is known to hold the answer.
            setTimeout(() => onGone(q.id), 700);
        } else {
            setState({ kind: 'bad', message: r.message });
        }
    }

    const dl = deadlineFacts(q);
    /*
     * The cost of NOT answering, as a figure.
     *
     * docs/DECISION.md: a stalled decision costs hours or days and is the seam this hub exists to close. The
     * number was here as prose — "An agent has been blocked for 11h" — which is the same number and reads as a
     * sentence you skim. A numeral is read before it is read.
     */
    const blocked = blockedFacts(q);
    const canType = q.allow.includes('respond');

    /*
     * THE RECOMMENDED OPTION GOES FIRST, and that is the documented contract finally implemented.
     *
     * `QuestionOption.recommended` has always been described in lib/types.ts as *"Rendered first and
     * highlighted"*. It was highlighted and it was not rendered first — it appeared wherever the asking agent
     * happened to put it in the array. So the one option the agent has an opinion about could be the fourth
     * thing he read, and on a phone it could be below the fold of the card.
     *
     * A stable sort: only `recommended` moves, and the agent's ordering of everything else survives, because
     * that ordering is information too (an agent listing "hold the import" last means something).
     */
    const options = q.allow.includes('choose')
        ? [...q.options].sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
        : [];
    /*
     * SIDE BY SIDE ONLY WHEN THERE IS SOMETHING TO COMPARE.
     *
     * The brief asked for comparison built from `option.detail`, which agents already send — no API change. The
     * question is when: two options with no details are two buttons, and forcing them into a comparison grid
     * would be a table with one column of content. So the grid engages at two or more options carrying detail,
     * which is exactly the case where reading them against each other is the work.
     *
     * Measured against the fixture, which has both shapes on purpose: the storage question has four options with
     * a detail each, and the reminders question has two bare labels.
     */
    const comparable = options.filter(o => o.detail).length >= 2;

    return (
        <div className="card ask" data-measure="decision">
            {/*
              * THE COST STRIP: what not answering has already cost, and what will happen if it stays unanswered.
              *
              * ==========================================================================================
              * THIS IS THE CHANGE THE WHOLE CARD WAS REDESIGNED FOR
              * ==========================================================================================
              *
              * Both facts were already on the card and both were rendering as things you skim. The timed default
              * — the best idea in this project, and the mechanism that turns a blocked agent into a bounded wait
              * — was a `.tag warn` in a metadata row, at the same weight as the project slug and the asking
              * agent's name. The cost was a sentence under the context.
              *
              * They are one strip across the top of the card now, above the title, with both times as numerals.
              * Above the title because the title is the QUESTION and this is the PRICE, and the price is what
              * decides whether he reads the question now or after coffee.
              *
              * It costs no height: it replaces the tag that was in the meta row and the prose line that was
              * under the context. Check L3 requires six tasks to start within the first screen at 1280 and this
              * card is the thing standing between them and the top of the page.
              */}
            {(blocked || dl) && (
                <div className={`askcost${dl?.past ? ' past' : ''}`} data-measure="ask-cost">
                    {blocked && (
                        <span className="costbit" data-measure="blocked-for">
                            <b>{blocked.figure}</b> an agent has been blocked
                        </span>
                    )}
                    {dl && (
                        <span className="costbit deadline">
                            {dl.past ? (
                                <>
                                    <b>past</b> its deadline — the next agent will use “{dl.label}”
                                </>
                            ) : (
                                <>
                                    <b>{dl.left}</b> until “{dl.label}” is used instead
                                </>
                            )}
                        </span>
                    )}
                </div>
            )}
            <div className="askhead">
                <span className="pdot" style={{ background: projectColor(q.project) }} />
                <p className="title">{q.title}</p>
            </div>
            {/*
              * THE BODY SPLITS IN TWO WHEN THE CARD IS WIDE ENOUGH — a CONTAINER query, not a viewport one.
              *
              * This is the one place a container query earns its keep. The same card is rendered at 911px
              * in the queue on a monitor, at 748px on a laptop and at 362px on a phone, and what decides
              * whether the context can sit beside the options is how wide THE CARD is, not how wide the
              * window is. A viewport breakpoint would get this wrong the moment the pane width changes.
              *
              * Container queries are Baseline widely available (since August 2025 — docs/RESEARCH.md §11),
              * so this is not a progressive enhancement, it is just a layout.
              */}
            <div className="askbody">
                <div className="asktext">
                    <div className="meta">
                        <span className="tag">{q.project}</span>
                        {/*
                          * "asked 11h ago" only when the cost strip is NOT showing.
                          *
                          * Both are the same number, and having both put "asked 11h ago" and "11h an agent has
                          * been blocked" on one card — the same fact twice, which is what two marks with
                          * identical detail lines looked like and read as a rendering bug. The cost framing is
                          * the more useful of the two, so it wins; under an hour the strip renders nothing and
                          * the neutral "asked 20 min ago" is the right thing to say.
                          */}
                        {!blocked && <span>asked {humanAgo(q.created_at)}</span>}
                        {q.asked_by && <span>by {q.asked_by}</span>}
                        {/* The timed default and the cost have both MOVED to the strip above the title. They
                            were here, in this row, at the same weight as a project slug. */}
                    </div>
                    {q.context && <p className="why">{q.context}</p>}
                </div>

                <div className="askactions">
                {/*
                  * The options. `pick` buttons wrap into a row on a mouse and stack on a thumb — see the
                  * .picks rule in globals.css, which keys off pointer type rather than width for the same
                  * reason every other control here does.
                  */}
                <div
                    className={`picks${comparable ? ' compare' : ''}`}
                    data-measure="picks"
                    data-compare={comparable ? 'yes' : 'no'}
                >
                    {options.map(o => (
                        <button
                            key={o.key}
                            className={`pick${o.recommended ? ' rec' : ''}`}
                            data-measure="pick"
                            data-recommended={o.recommended ? 'yes' : 'no'}
                            disabled={busy}
                            onClick={() => answer({ type: 'choose', option: o.key })}
                        >
                            {/*
                              * THE AGENT'S RECOMMENDATION, AS A BADGE RATHER THAN AS A WORD IN THE LABEL.
                              *
                              * It read `09:00 · suggested` — the recommendation concatenated into the option's
                              * own text, in the same size and weight as the option. So the one thing on the card
                              * carrying the asking agent's judgement was indistinguishable from the thing it was
                              * judging, and on a narrow card it wrapped, which made an option called "09:00"
                              * look like an option called "09:00 · suggested".
                              *
                              * A badge on its own line above the label separates the two claims: this is the
                              * option, and this is what the agent thinks about it. It also means the label is
                              * exactly what the agent sent, which matters because the answer is recorded by that
                              * label and the record has to quote it verbatim.
                              */}
                            {o.recommended && (
                                <span className="picktag">
                                    <span className="picktick" aria-hidden="true" />
                                    the agent suggests this
                                </span>
                            )}
                            <span className="lab">{o.label}</span>
                            {o.detail && <span className="det">{o.detail}</span>}
                        </button>
                    ))}

                    {q.allow.includes('accept') && (
                        <button className="pick rec" disabled={busy} onClick={() => answer({ type: 'accept' })}>
                            <span className="lab">Go ahead</span>
                        </button>
                    )}
                </div>

            {/*
              * ONE text box, whatever the question allows.
              *
              * The first attempt at this rendered two: an "anything to add?" comment box above the options
              * and a separate "type the value" box below them for `respond`. Two textareas in one card is
              * a guessing game no matter how they are labelled — and labelling them was my first fix,
              * which did not help, because the problem was that there were two of them.
              *
              * So the same box does both jobs, and the BUTTON decides which:
              *   type + tap an option        → that option, with your text attached as a comment
              *   type + "Send this instead"  → your text IS the answer (a `respond`)
              *   tap an option, empty box    → just the option
              *
              * One input, and the thing you press says what it means.
              */}
            {commenting && (
                <>
                    <label className="field-label" htmlFor={`q-${q.id}`}>
                        {canType && !q.allow.includes('choose') && !q.allow.includes('accept')
                            ? 'Your answer'
                            : 'A condition or comment, sent with whichever button you press'}
                    </label>
                    <textarea
                        id={`q-${q.id}`}
                        autoFocus={!(!q.allow.includes('choose') && !q.allow.includes('accept'))}
                        value={note}
                        placeholder={
                            q.allow.includes('choose') || q.allow.includes('accept')
                                ? 'e.g. "yes, but tell the other project first"'
                                : 'Type the value or the answer…'
                        }
                        style={{ minHeight: 54 }}
                        onChange={e => setNote(e.target.value)}
                        onKeyDown={canType
                            ? submitOnCtrlEnter(() => {
                                if (!busy && note.trim()) answer({ type: 'respond', text: note, note: null });
                            })
                            : undefined}
                    />
                    {canType && <KeyHint />}
                </>
            )}

            {/* One row, not three. The comment toggle, the freeform send and "not now" were each on their
                own line, which cost about 90px of height per decision for three controls that between them
                are one sentence wide. */}
            <div className="askfoot">
                {!commenting && (
                    <button className="quiet" onClick={() => setCommenting(true)}>
                        + Add a condition or comment
                    </button>
                )}

                {/*
                  * Sends the SAME box as a freeform answer rather than as a comment on a choice. Only
                  * shown when the asking agent said a typed answer is acceptable, and worded so it is
                  * obviously an alternative to the buttons above rather than another thing to fill in.
                  */}
                {canType && commenting && (
                    <button
                        className="send"
                        disabled={busy || !note.trim()}
                        onClick={() => answer({ type: 'respond', text: note, note: null })}
                    >
                        {q.allow.includes('choose')
                            ? 'None of these — send what I typed'
                            : 'Send this answer'}
                    </button>
                )}

                {q.allow.includes('ignore') && (
                    <button className="quiet" disabled={busy} onClick={() => answer({ type: 'ignore' })}>
                        Not now — stop asking
                    </button>
                )}
            </div>

            <Saved state={state} />
                </div>
            </div>
        </div>
    );
}
