'use client';

import { useState } from 'react';

/* Re-exported so every existing import site keeps working. The derivation itself lives in lib/colour.ts,
 * which has no 'use client' — app/setup/page.tsx is a server component and could not import it from here,
 * so it had grown its own copy under a comment claiming the two matched. See that file. */
export { projectColor, projectHue } from '../../lib/colour';
/* And the same arrangement for the formatters, for the same reason and with the same history: lib/presence.ts
 * builds a sentence containing a date and is imported by a server page and by tests/*.mjs, neither of which can
 * import a 'use client' module. The alternative was a second UTC date formatter, which is the mistake
 * lib/colour.ts already exists to undo. See lib/format.ts. */
export { humanAgo, humanCount, humanDate, humanMinutes, humanSpan } from '../../lib/format';
import type { Question } from '../../lib/types';

/**
 * The pieces every part of the interface needs, in one place so there is one of each.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE, from brief §6: nothing here ever shows an optimistic success.
 * Every action goes to the server, the server writes and reads the row back, and only a response that
 * says `saved: true` turns the line green. A failure prints the server's actual reason — "the write
 * matched zero rows" — rather than a generic apology, because the reason tells you what to do next and
 * an apology does not.
 */

export type SaveState = { kind: 'idle' | 'busy' | 'ok' | 'bad'; message?: string };

export interface ActResult {
    ok: boolean;
    message: string;
    /**
     * The response body on success — which contains the row the SERVER re-read, not a row we guessed.
     *
     * Added when the interface started keeping a list of finished work. Moving a task from the queue into
     * that list needs the completed row, and the only honest source for it is the one `writeVerified`
     * confirmed: a locally-invented `{...task, status: 'done', done_at: Date.now()}` would be an optimistic
     * write with extra steps, and the figure computed from it could disagree with the database while
     * looking perfectly correct.
     */
    data: Record<string, unknown> | null;
}

export async function act(body: Record<string, unknown>): Promise<ActResult> {
    try {
        const res = await fetch('/api/ui/act', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);

        // `saved: true` is set by the server only after it has re-read the row. Anything else — a 500, a
        // network failure, a body we cannot parse — is reported as not saved, because we do not know.
        if (res.ok && json?.saved === true) return { ok: true, message: 'Saved', data: json };
        return {
            ok: false,
            message: json?.error ? String(json.error) : `Not saved (HTTP ${res.status})`,
            data: null,
        };
    } catch (e) {
        return {
            ok: false,
            message: `Not saved — could not reach the hub (${e instanceof Error ? e.message : 'network error'})`,
            data: null,
        };
    }
}

/**
 * Ctrl/Cmd+Enter submits a textarea.
 *
 * A desk-bound interface where every send needs a mouse trip to a button is a slow interface, and this is
 * used mostly at a desk while actually doing the work. Plain Enter deliberately does NOT submit: notes are
 * multi-line often enough that losing a paragraph to a stray Return would be worse than the saved click.
 *
 * The hint next to it is hidden on touch devices, where the shortcut does not exist.
 */
export function submitOnCtrlEnter(fn: () => void) {
    return (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            fn();
        }
    };
}

export const KeyHint = () => (
    <div className="kbd-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</div>
);

/**
 * The save line, and it is a LIVE REGION.
 *
 * Hard constraints 1 and 2 exist because a write that lied cost this person real data. Twenty-eight of
 * these were being rendered and not one was announced — so the single message the whole design is built
 * around was the one least likely to be noticed.
 *
 * The region is always in the DOM, empty when idle, rather than being inserted when there is something to
 * say: a live region that appears already containing its message is frequently not announced at all.
 */
export function Saved({ state }: { state: SaveState }) {
    const cls = state.kind === 'ok' ? 'ok' : state.kind === 'bad' ? 'bad' : 'busy';
    const text = state.kind === 'busy' ? 'Saving…' : state.message;
    return (
        <div
            className={state.kind === 'idle' ? 'state' : `state ${cls}`}
            data-measure="save-state"
            role="status"
            aria-live="polite"
        >
            {state.kind === 'idle' ? '' : <>{state.kind === 'ok' ? '✓ ' : ''}{text}</>}
        </div>
    );
}

export function Copy({ value }: { value: string }) {
    const [done, setDone] = useState(false);
    return (
        <>
            <span className="copyval">{value}</span>
            <button
                className="copy"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(value);
                        setDone(true);
                        setTimeout(() => setDone(false), 1800);
                    } catch {
                        // Clipboard access can be refused. Say so instead of pretending it copied —
                        // silently failing to copy means pasting whatever was there before.
                        setDone(false);
                        alert(`Could not copy automatically. The value is:\n\n${value}`);
                    }
                }}
            >
                {done ? 'copied' : 'copy'}
            </button>
        </>
    );
}

/**
 * How long an agent has been blocked on this decision, stated as the cost it is.
 *
 * WHY THIS IS NOT JUST "asked 11h ago" WITH DIFFERENT WORDS
 *
 * docs/DECISION.md names the stalled decision as the most expensive seam in the whole design — hours to days,
 * against a couple of minutes for a rebuilt context — and the card already carried the number. It carried it
 * as "asked 11h ago", which is a fact about the past and reads as metadata: the same shape as "by fixture" and
 * the project tag beside it, and just as easy to skim.
 *
 * "An agent has been blocked for 11h" is the same number saying what it means. That reframing is the entire
 * change, and it is the one thing on this card that is about consequence rather than about content.
 *
 * Deliberately no colour and no icon. It is louder in wording and identical in weight, because a decision card
 * is already the loudest thing on the page and making the cost shout as well would just make the whole card
 * shout. Returns null under an hour, where the honest answer is that nothing has been lost yet.
 */
export function blockedForLine(q: Question): string | null {
    const mins = Math.round((Date.now() - new Date(q.created_at).getTime()) / 60000);
    if (mins < 60) return null;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `An agent has been blocked for ${hours}h`;
    return `An agent has been blocked for ${Math.round(hours / 24)} days`;
}

export function deadlineLine(q: Question): string | null {
    const f = deadlineFacts(q);
    if (!f) return null;
    return f.past
        ? `Past its deadline — the next agent will use "${f.label}"`
        : `No answer in ${f.left} → "${f.label}"`;
}

/**
 * The timed default as FIGURES rather than as a sentence — because it is the best idea in the whole project
 * and it was rendering as a small grey tag.
 *
 * docs/DECISION.md names the stalled decision as the most expensive seam in this design, and the timed default
 * is what turns "blocked until he wakes up" into a bounded wait with a pre-approved outcome, stated to him up
 * front. That is the mechanism the hub exists for. It was one `.tag warn` in a metadata row, the same weight as
 * the project slug and the asking agent's name.
 *
 * A sentence cannot be typeset. Splitting it into the parts the card wants to emphasise — the time remaining as
 * a numeral, the option's own label in quotes — lets the card make the countdown the loudest thing on it while
 * keeping every word of the claim. `deadlineLine` is kept and now built from this, so the Telegram message and
 * anything else that wants one string still gets exactly the string it always got.
 */
export interface DeadlineFacts {
    /** The option label the agent will proceed with. Never a key. */
    label: string;
    /** Minutes until the deadline. Negative once it has passed. */
    mins: number;
    /** "5h", "40 min", "2 days" — the remaining time, already rounded for reading. */
    left: string;
    past: boolean;
}

export function deadlineFacts(q: Question): DeadlineFacts | null {
    if (!q.default_option || !q.deadline) return null;
    const label = q.options.find(o => o.key === q.default_option)?.label ?? q.default_option;
    const mins = Math.round((new Date(q.deadline).getTime() - Date.now()) / 60000);
    const abs = Math.abs(mins);
    const left = abs < 60 ? `${abs} min` : abs < 2880 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)} days`;
    return { label, mins, left, past: mins <= 0 };
}

/**
 * How long an agent has been blocked, as a figure and a unit.
 *
 * Same reasoning as `deadlineFacts`: `blockedForLine` returns prose, and the card needs to set the number in
 * one size and the words in another. Returns null under an hour, where the honest answer is that nothing has
 * been lost yet and a cost line would be manufacturing urgency.
 */
export function blockedFacts(q: Question): { figure: string; hours: number } | null {
    const mins = Math.round((Date.now() - new Date(q.created_at).getTime()) / 60000);
    if (mins < 60) return null;
    const hours = Math.round(mins / 60);
    return { figure: hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`, hours };
}

/**
 * `**bold**` and `` `code` `` only, applied AFTER escaping so an instruction can never inject markup.
 * Agents write these strings, and an agent that has read a web page is an untrusted author.
 */
export function renderInline(s: string): string {
    const escaped = s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return escaped
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}
