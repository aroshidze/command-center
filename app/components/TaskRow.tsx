'use client';

import { useState } from 'react';
import type { Task } from '../../lib/types';
import { act, humanMinutes, type SaveState } from './ui';

/**
 * One task, as a ROW.
 *
 * WHY A ROW AND NOT A CARD
 *
 * A card has to be wide enough for a title and two lines of prose — 340px was the figure — and that is
 * far too narrow for a nineteen-step procedure. So opening one produced a ladder of two-word lines with
 * the rest of the grid row blank beside it, and the fix for that (span the whole row) made the card
 * 1,364px wide with its contents capped at 760px, which is the same emptiness with a border round it.
 *
 * The real problem was that one component was being asked to be two things. A list is the right container
 * for "what needs me"; a document is the right container for "how do I do it". This is the list half. The
 * document half is TaskDetail, and it gets a column sized for reading rather than for tiling.
 *
 * The density is the point: twenty-two tasks were six screens of cards and are now roughly one screen of
 * rows, so "your turn" is something you can see rather than something you scroll to.
 *
 * TWO CONTROLS PER ROW, DELIBERATELY SEPARATED
 *
 * Opening a task and completing it are different actions with very different costs — a mis-click on Done
 * writes a lie into the database, which is the failure this whole hub was built to avoid. So Done is its
 * own target at the far end of the row, never the thing your pointer lands on by default, and it is 44px
 * on a coarse pointer whatever the width. The owner chose row-plus-pane over open-first; this is the
 * safety that choice needs to carry.
 */
export default function TaskRow({ t, selected, onOpen, onDone, onRefused }: {
    t: Task;
    selected: boolean;
    onOpen: () => void;
    /** The second argument is the row the SERVER read back, so the record counts a real completion. */
    onDone: (id: string, done?: Task) => void;
    onRefused: (message: string) => void;
}) {
    const [state, setState] = useState<SaveState>({ kind: 'idle' });
    const busy = state.kind === 'busy';

    async function markDone() {
        setState({ kind: 'busy' });
        const r = await act({ action: 'task.done', id: t.id });
        if (r.ok) {
            setState({ kind: 'ok', message: 'Saved' });
            /*
             * The completed row is handed up from the server's response, never assembled locally.
             *
             * `{...t, status: 'done', done_at: new Date()}` would look identical on screen and would be an
             * optimistic write about a NUMBER — harder to notice than an optimistic message and worse,
             * because the figure it feeds is the one thing on the record that has to be believable.
             */
            const done = (r.data?.task ?? undefined) as Task | undefined;
            setTimeout(() => onDone(t.id, done), 500);
        } else {
            /*
             * A REFUSED WRITE HAS TO BE SAID OUT LOUD, and the row is 34px tall.
             *
             * The first version set a `bad` state here and opened the task, on the theory that the pane
             * had room to print the reason. It did not print anything: the pane has its own state, so the
             * message went into a variable nothing rendered, and a refused Done produced a row that
             * stayed put and said nothing at all. Silence after pressing a button is indistinguishable
             * from nothing having happened — which is how you press it again.
             *
             * Found by tests/use-it.mjs, which fails the write on purpose and then asks what the
             * interface said. Hard constraint 2 is that a failure shows the server's actual reason; it
             * is worth nothing if the reason has nowhere to appear.
             */
            setState({ kind: 'idle' });
            onRefused(`Could not tick off “${t.title}” — ${r.message}`);
        }
    }

    return (
        <li
            /*
             * `leaving` for the 500ms between the server confirming and this row unmounting.
             *
             * `markDone` already waits half a second on `saved: true` before calling `onDone`, so the row is
             * still mounted and already green — and it spent that window sitting perfectly still, then vanishing.
             * The one interaction in the hub that should feel like something did not feel like anything.
             *
             * This is PRESENCE, not information, which is what makes it legal under the motion layer's rule:
             * nothing that carries truth may move. The row is leaving because the database says it is done. The
             * tick has already turned green from a confirmed write, and the animation cannot start until then —
             * so there is no frame in which this suggests a completion that has not happened.
             *
             * It also cannot disturb the measurements: it only ever runs after a click, never on load, and
             * tests/chrome.mjs waits for `document.getAnimations()` to settle after every navigation.
             */
            className={`row${selected ? ' sel' : ''}${t.blocked_reason ? ' blocked' : ''}` +
                       `${t.note ? ' hasnote' : ''}` +
                       `${state.kind === 'ok' ? ' leaving' : ''}`}
            data-measure="task"
            /*
             * WHAT STATE THIS ROW IS IN, as an attribute, so the stylesheet can draw it and a check can read it.
             *
             * The brief: *"rows carry no state: a blocked row, a row with a note, a nineteen-step row and a
             * one-step row look identical"*. Two of those four are answered here and by `hasnote` above; the step
             * weight is on the meta below.
             *
             * An attribute rather than only a class because the state is a value with three cases, and three
             * mutually exclusive classes is how you end up with a row that is both. It also means the audit and
             * `prove:layout` can count rows by state without parsing a class list.
             */
            data-state={t.blocked_reason ? 'blocked' : t.note ? 'noted' : 'open'}
            /*
             * The raw estimate, so the time filter can be CHECKED rather than trusted.
             *
             * Check P8 asserts that every task visible under a "under 10m" filter really does fit. Reading
             * that off the rendered "1h 30m" would mean the check reimplementing `humanMinutes` — a second
             * implementation that can be wrong differently from the first, which is how a green suite ends up
             * agreeing with a bug. Empty string when there is no estimate, which the filter treats as
             * "unknown" rather than as "short".
             */
            data-minutes={t.minutes ?? ''}
        >
            <button
                className="rowmain"
                aria-expanded={selected}
                onClick={onOpen}
            >
                <span className="rowtitle">{t.title}</span>
                {/*
                  * WHAT IT UNBLOCKS, ON THE ROW — the highest-value thing the hub stores, and it was not on
                  * the surface he actually reads.
                  *
                  * docs/RESEARCH.md §20: Grant (2008) measured +142% persistence and +171% output a month
                  * after fundraisers spent ten minutes with one person who had benefited from their work.
                  * Nothing computed competes with that, and the hub already holds the sentence — the asking
                  * agent's own `why`. It was visible in TaskDetail once a task was opened, and in the record
                  * after the fact, and nowhere on the queue.
                  *
                  * It costs NO HEIGHT, which is the only reason it can be here: it goes in the horizontal gap
                  * between the title and the meta, which at 1920 is roughly 400px of nothing on every row.
                  * Checks L3 (tasks above the fold) and L4 (scroll extent) are the two figures the previous
                  * redesign won, and a second line per row would have spent both.
                  *
                  * Truncated with an ellipsis rather than clamped to a line count, and that is deliberate:
                  * real `why` values are three to five lines, so any row-level treatment is an excerpt. An
                  * ellipsis SAYS it is an excerpt. The full sentence is one click away in the pane, and it is
                  * still quoted verbatim there — never parsed, never summarised (see FinishedTask.why).
                  */}
                {t.why && <span className="rowwhy">{t.why}</span>}
                <span className="rowmeta">
                    {t.note && <span className="rowflag" title="You left a note on this">note</span>}
                    {t.blocked_reason && <span className="tag warn">waiting</span>}
                    {t.minutes != null && <span className="rowtime">{humanMinutes(t.minutes)}</span>}
                    {/*
                      * HOW MUCH PROCEDURE IS BEHIND IT, as a shape as well as a number.
                      *
                      * The brief's complaint about the queue, verbatim: *"a nineteen-step row and a one-step row
                      * look identical"*. They did — both rendered the count in the same 11px grey, so the
                      * difference between "tick this off in a minute" and "sit down with a coffee" was two
                      * characters you had to read and compare against the row above.
                      *
                      * Three filled bars, bucketed. NOT a bar whose width is proportional to the count: a
                      * proportional bar invites reading a length as a quantity, and 19 steps is not 19 times
                      * the work of 1 — the count is a real number and the *weight* is a judgement, so the
                      * judgement is drawn in three discrete steps and the number stays next to it in words.
                      * Nothing here replaces the figure; it annotates it.
                      *
                      * The thresholds come from the shape of real tasks rather than from a round number. His
                      * production hub holds tasks of 9 and 11 steps and the fixture's longest is 19; two steps
                      * is the median. So: 1–2 is one bar, 3–9 is two, 10 or more is three.
                      */}
                    <span
                        className="rowsteps"
                        data-depth={t.steps.length >= 10 ? 'long' : t.steps.length >= 3 ? 'medium' : 'short'}
                        title={`${t.steps.length} step${t.steps.length === 1 ? '' : 's'}`}
                    >
                        <span className="depthbars" aria-hidden="true">
                            <i /><i /><i />
                        </span>
                        {t.steps.length} step{t.steps.length === 1 ? '' : 's'}
                    </span>
                </span>
            </button>

            {/*
              * Blocked tasks get no Done control at all rather than a disabled one. `blocked_reason` means
              * an agent said this cannot be started yet; offering a tick you are not supposed to press is
              * an invitation to press it.
              */}
            {!t.blocked_reason && (
                <button
                    className={`rowdone${state.kind === 'ok' ? ' done' : ''}`}
                    disabled={busy}
                    aria-label={`Mark done: ${t.title}`}
                    title="I've done this"
                    onClick={markDone}
                >
                    {state.kind === 'ok' ? '✓' : state.kind === 'busy' ? '·' : ''}
                </button>
            )}
        </li>
    );
}
