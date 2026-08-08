'use client';

import { useState } from 'react';
import type { Task } from '../../lib/types';
import { act, type SaveState } from './ui';

/**
 * A task that has been waiting on somebody else for days, and the one thing to do about it.
 *
 * THE PROBLEM IT SOLVES
 *
 * "Flip Instacart to production when the approval email arrives" sits in the Not-yet section indefinitely. If
 * that email arrived a week ago and nobody noticed, the hub is quietly out of date — and it is out of date
 * about the one category of work the design explicitly promises never to hold against him.
 *
 * THE FRAMING, WHICH MATTERS MORE THAN THE CODE
 *
 * The obvious build is a nudge: a warning colour, a "9 days!" badge, something that makes the row feel overdue.
 * That would be wrong, and it is forbidden rather than merely inadvisable — a blocked task is not his fault and
 * must never count against him. Waiting on Instacart's approval email is not a failure to be prompted about.
 *
 * So this points at the AGENT. It is one button that writes a note asking the agent to re-check, addressed to
 * that project so the right agent reads it. Neutral wording, no colour, no exclamation: the fact that it has
 * been a while is stated, and the action offered is his to take rather than his to be reminded of.
 *
 * WHY `created_at` AND NOT SOMETHING CLOSER
 *
 * There is no `blocked_at` column and I did not add one — a schema change for a display detail is a bad trade,
 * and the honest figure is the one the rows already hold. `updated_at` looks better and is worse: it is bumped
 * by HIS actions too, so saving a note on the task would reset it and make something nobody had re-checked
 * look freshly checked. `created_at` never moves, so "filed 9 days ago" is a fact rather than an inference.
 *
 * It is not the same as "blocked for 9 days" — a task could have been filed open and blocked later — so it does
 * not say that. It says what it can prove.
 */
export default function StaleBlocked({ t, days, selected, onOpen, onRefused }: {
    t: Task;
    days: number;
    selected: boolean;
    onOpen: () => void;
    onRefused: (message: string) => void;
}) {
    const [state, setState] = useState<SaveState>({ kind: 'idle' });

    async function chase() {
        setState({ kind: 'busy' });
        const r = await act({
            action: 'note.add',
            project: t.project,
            /*
             * The note quotes the blocker back at the agent, because the agent wrote it and is the only party
             * who can tell whether it still holds. Nothing here asserts that it is unblocked — that would be
             * the hub guessing, which is the failure this whole codebase is built against.
             */
            body: `Is "${t.title}" still blocked? It was filed ${days} days ago and the hub still says: `
                + `"${t.blocked_reason}". If that has changed, update the task; if it has not, no reply needed.`,
        });
        if (r.ok) {
            setState({ kind: 'ok', message: 'Asked' });
        } else {
            // Same rule as everywhere else: the row is 34px tall, so a refusal goes where it cannot be missed.
            setState({ kind: 'idle' });
            onRefused(`Could not ask about “${t.title}” — ${r.message}`);
        }
    }

    /*
     * THIS ROW REPLACES the task's entry in the grouped list below rather than sitting above it.
     *
     * The first version rendered both, so a long-waiting task appeared twice on one screen — one fact stated
     * twice, the exact thing the decision card had just been fixed for, and it read as a rendering bug.
     * Board.tsx filters these out of the waiting groups so the two lists are a partition.
     *
     * Which means this row has to carry everything the grouped one did, so the title is a real button that
     * opens the task. Removing a duplicate must not remove an affordance along with it.
     */
    return (
        <li className={`staleblocked${selected ? ' sel' : ''}`} data-measure="stale-blocked"
            data-minutes={t.minutes ?? ''}>
            <button className="stalewhat" aria-expanded={selected} onClick={onOpen}>
                <span className="staletitle">{t.title}</span>
                {/* The fact, stated flatly. "filed N days ago" rather than "blocked for N days", because the
                    first is in the rows and the second is a guess. */}
                <span className="stalewhen">filed {days} days ago · {t.blocked_reason}</span>
            </button>
            <button
                className="quiet stalechase"
                disabled={state.kind === 'busy' || state.kind === 'ok'}
                title={`Send a note to the ${t.project} agent asking whether this is still blocked`}
                onClick={chase}
            >
                {state.kind === 'ok' ? 'Asked' : state.kind === 'busy' ? '·' : 'Still blocked?'}
            </button>
        </li>
    );
}
