'use client';

import { useEffect, useRef, useState } from 'react';
import type { Task } from '../../lib/types';
import { act, Copy, humanMinutes, projectColor, renderInline, Saved, type SaveState } from './ui';

/**
 * One task, as a DOCUMENT — the other half of the split described in TaskRow.
 *
 * This is what the reading pane holds on a desktop and what covers the screen on a phone. It gets a
 * column sized for reading rather than for tiling, so nineteen steps are nineteen readable lines instead
 * of a ladder of two-word fragments with an empty half-row beside it.
 */
export default function TaskDetail({ t, onDone, onClose }: {
    t: Task;
    /** The second argument is the row the SERVER read back, so the record counts a real completion. */
    onDone: (id: string, done?: Task) => void;
    onClose: () => void;
}) {
    const [state, setState] = useState<SaveState>({ kind: 'idle' });
    const [note, setNote] = useState(t.note ?? '');
    const [noteState, setNoteState] = useState<SaveState>({ kind: 'idle' });
    const head = useRef<HTMLHeadingElement>(null);

    /*
     * Focus moves to the heading when a different task is opened.
     *
     * Without it, opening a task from the queue leaves focus on the row you clicked, so a keyboard user
     * gets a pane full of new content and no way to know it arrived — and on a phone, where this covers
     * the whole screen, the next Tab would walk the list hidden behind it. Keyed on the task id so
     * re-rendering for a keystroke does not keep stealing focus back from the note box.
     */
    useEffect(() => { head.current?.focus(); }, [t.id]);

    // Reset the draft when a different task is opened, and start from whatever is already stored.
    useEffect(() => { setNote(t.note ?? ''); setNoteState({ kind: 'idle' }); setState({ kind: 'idle' }); },
        [t.id, t.note]);

    const dirty = note.trim() !== (t.note ?? '').trim();

    return (
        <article className="detail" data-measure="detail" aria-labelledby={`d-${t.id}`}>
            <div className="detailbar">
                <span className="pdot" style={{ background: projectColor(t.project) }} />
                <span className="pname">{t.project}</span>
                {t.minutes != null && <span className="pmeta">{humanMinutes(t.minutes)}</span>}
                <button className="closebtn" onClick={onClose} aria-label="Close this task">Close</button>
            </div>

            <h2 className="detailtitle" id={`d-${t.id}`} tabIndex={-1} ref={head}>{t.title}</h2>

            {t.why && <p className="why" data-measure="detail-content">{t.why}</p>}
            {t.blocked_reason && (
                <p className="why blockedwhy" data-measure="detail-content">
                    <strong>Not yet:</strong> {t.blocked_reason}
                </p>
            )}

            {t.steps.length > 0 && (
                <ol className="steps" data-measure="detail-content">
                    {t.steps.map((s, i) => (
                        <li key={i}>
                            <span dangerouslySetInnerHTML={{ __html: renderInline(s.do) }} />
                            {s.copy && <div className="copyrow"><Copy value={s.copy} /></div>}
                            {s.detail && (
                                <div className="det" dangerouslySetInnerHTML={{ __html: renderInline(s.detail) }} />
                            )}
                        </li>
                    ))}
                </ol>
            )}

            {/* Every task is required to carry one of these. It is how you know it worked without asking
                an agent, which is what stops the hub becoming a thing you have to chase. */}
            {t.verify && (
                <div className="verify" data-measure="detail-content">
                    <strong>You know it worked when:</strong> {t.verify}
                </div>
            )}

            {t.gotchas.length > 0 && (
                <ul className="gotchas" data-measure="detail-content">
                    {t.gotchas.map((g, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(g) }} />
                    ))}
                </ul>
            )}

            <div className="notebox" data-measure="detail-content">
                <label className="field-label" htmlFor={`note-${t.id}`}>
                    Anything to tell the agent? (optional)
                </label>
                <textarea
                    id={`note-${t.id}`}
                    value={note}
                    placeholder="It goes back with your tick, so the next agent reads it"
                    onChange={e => setNote(e.target.value)}
                />
                <Saved state={noteState} />
            </div>

            <button
                className="primary"
                data-measure="primary-action"
                disabled={state.kind === 'busy'}
                /*
                 * Done carries any unsaved note with it.
                 *
                 * Without this, typing a note and then pressing Done removed the card and threw the note
                 * away, because the note had its own separate save button. That is the same defect that
                 * was fixed on questions, left in place here — and a button that silently discards what
                 * you typed is the interface equivalent of a write that reports success without
                 * succeeding.
                 *
                 * The note is written FIRST and Done only proceeds if it stored, so the task can never
                 * disappear while the note is lost.
                 */
                onClick={async () => {
                    setState({ kind: 'busy' });

                    if (dirty && note.trim()) {
                        const n = await act({ action: 'task.note', id: t.id, note: note.trim() });
                        if (!n.ok) {
                            setState({
                                kind: 'bad',
                                message: `Your note could NOT be saved, so nothing was marked done: ${n.message}`,
                            });
                            return;
                        }
                        setNoteState({ kind: 'ok', message: 'Note saved' });
                    }

                    const r = await act({ action: 'task.done', id: t.id });
                    if (r.ok) {
                        setState({ kind: 'ok', message: dirty && note.trim() ? 'Saved, with your note' : 'Saved' });
                        // The server's own row, so the record counts what the database holds. See TaskRow.
                        const done = (r.data?.task ?? undefined) as Task | undefined;
                        setTimeout(() => onDone(t.id, done), 700);
                    } else {
                        setState({ kind: 'bad', message: r.message });
                    }
                }}
            >
                I&apos;ve done this
            </button>
            <Saved state={state} />

            {/* Saving the note without ticking the task: the return channel on its own. Quiet, because the
                common case is that it rides along with Done above. */}
            {dirty && (
                <button
                    className="quiet"
                    disabled={noteState.kind === 'busy' || !note.trim()}
                    onClick={async () => {
                        setNoteState({ kind: 'busy' });
                        const r = await act({ action: 'task.note', id: t.id, note: note.trim() });
                        setNoteState(r.ok
                            ? { kind: 'ok', message: 'Saved — the next agent will read it' }
                            : { kind: 'bad', message: r.message });
                    }}
                >
                    Save the note without ticking this off
                </button>
            )}
        </article>
    );
}
