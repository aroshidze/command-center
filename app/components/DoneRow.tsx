'use client';

import { useState } from 'react';
import type { Task } from '../../lib/types';
import type { FinishedTask } from '../../lib/progress';
import { act, humanDate, projectColor } from './ui';

/**
 * One finished task, in the record.
 *
 * WHY IT CARRIES A RE-OPEN BUTTON, WHICH IS THE WHOLE REASON THIS COMPONENT IS ALLOWED TO EXIST
 *
 * docs/RESEARCH.md §14: of 89 professionally built dashboards, only 47% were still active, and the finding
 * was that actionability cannot be added to a finished readout afterwards. The rule this codebase adopted
 * from that is blunt — **if clicking it does nothing, it does not go on the page.**
 *
 * A list of completed work is the hardest possible case for that rule, because completed work is by
 * definition not something to do. It survives for one specific reason: a completion is UNDOABLE, and undoing
 * it is also the mechanism that keeps every figure honest. Re-opening a task clears `done_at`, which removes
 * it from the count, from this list, and from any mark that depended on it — see lib/progress.ts. So the
 * button is not a convenience bolted on to justify a readout; it is the thing that makes the readout
 * trustworthy, and a record you cannot correct is a record you would eventually stop believing.
 *
 * `task.reopen` already existed in app/api/ui/act/route.ts and nothing had ever called it. No API changed.
 *
 * AND IT IS NOT OPTIMISTIC
 *
 * The row stays exactly where it is until the server says `saved: true` after re-reading the row. A refusal
 * is lifted to the persistent banner at the top of the queue with the server's own words, because this row
 * is about 34px tall and a message printed inside it would be the bug tests/use-it.mjs found on its first
 * run: silence after pressing a button is indistinguishable from nothing having happened.
 */
export default function DoneRow({ f, onReopened, onRefused }: {
    f: FinishedTask;
    onReopened: (task: Task) => void;
    onRefused: (message: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    /*
     * THE PROCEDURE, FETCHED WHEN HE ASKS FOR IT — the gap the payload narrowing left behind.
     *
     * `board()` drops `steps`, `verify` and `gotchas` from every completed task, which was the right call and is
     * measured: nineteen step objects per completion, forever, on every page load, reached 509 KB at nine hundred
     * completions. But the side effect was that **a finished task could not be opened**, so the one place the hub
     * holds a nineteen-step procedure he might need again was write-only.
     *
     * Fetched per task, on demand, from `/api/ui/task` — the same trade the agent contract already makes with
     * `GET /api/agent/tasks?id=…`. Three states rather than two, because the third is the one that matters: null
     * is "not asked", a task is "here it is", and a string is the SERVER'S OWN REASON it could not be shown.
     * Silence after pressing a button is indistinguishable from nothing having happened — the defect
     * tests/use-it.mjs found on its first run.
     */
    const [full, setFull] = useState<Task | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    async function toggle() {
        if (open) { setOpen(false); return; }
        setOpen(true);
        // Fetched once and kept: re-reading on every toggle would be a request per click for a row that cannot
        // have changed, since a finished task's steps are not editable from here.
        if (full || loading) return;
        setLoading(true);
        setFailed(null);
        try {
            const res = await fetch(`/api/ui/task?id=${encodeURIComponent(f.id)}`);
            const body = await res.json().catch(() => null);
            if (res.ok && body?.task) setFull(body.task as Task);
            else setFailed(body?.error ? String(body.error) : `Could not read it (HTTP ${res.status})`);
        } catch (e) {
            setFailed(`Could not reach the hub (${e instanceof Error ? e.message : 'network error'})`);
        } finally {
            setLoading(false);
        }
    }

    async function reopen() {
        setBusy(true);
        const r = await act({ action: 'task.reopen', id: f.id });
        if (!r.ok) {
            setBusy(false);
            onRefused(`Could not re-open “${f.title}” — ${r.message}`);
            return;
        }
        /*
         * The row the SERVER read back, or nothing.
         *
         * A confirmed write with no row in the response would leave the interface guessing what the task
         * now looks like, and a guessed row is how a figure starts disagreeing with the database while
         * looking completely fine. Treated as a failure rather than papered over.
         */
        const task = (r.data?.task ?? null) as Task | null;
        if (!task) {
            setBusy(false);
            onRefused(
                `“${f.title}” was re-opened, but the hub did not return the row, so this list cannot be ` +
                'trusted until you reload.',
            );
            return;
        }
        onReopened(task);
    }

    return (
        /*
         * THE PROJECT TRAVELS WITH THE ROW, because the record is no longer grouped by project.
         *
         * It used to be a heading over each bucket, and the bucketing was what made "newest first" untrue (see
         * the list in Board.tsx). The rail and the dot are the queue's own vocabulary for the same fact, at the
         * strength §XXIV settled on — 56% of the project's hue — so a completion and an open task say which
         * project they belong to the same way, and the record gains the one material that is genuinely his on
         * every row instead of on one heading in four.
         */
        <li
            className="donerow"
            data-measure="done-task"
            data-project={f.project}
            /* When it was finished, machine-readable, so a check can assert that the list is in the order the
               sentence above it claims. The rendered date comes from the same field through `humanDate`, so
               there is no second source of truth to drift — see P11 in tests/measure-layout.mjs. */
            data-done-at={f.done_at}
            style={{ ['--proj' as string]: projectColor(f.project) }}
        >
            {/*
              * THE TITLE IS THE CONTROL, when there is a procedure behind it.
              *
              * A separate "show steps" button would be a fourth control on a 34px row that already has a title, a
              * date and a re-open. The title is what he is looking at and what he wants more of, which makes it
              * the right target — the same reasoning that makes the task row's title the thing that opens the
              * pane.
              *
              * A plain span when the task has NO steps. `f.steps` is the count, carried in the narrow row for
              * exactly this kind of question, so the interface knows whether there is anything to open without
              * fetching to find out. A control that opens an empty panel is the dead control §14 forbids.
              */}
            <div className="donemain">
                {f.steps > 0 ? (
                    <button
                        className="donetitle asbutton"
                        data-measure="done-open"
                        aria-expanded={open}
                        onClick={toggle}
                        title={`Show the ${f.steps} step${f.steps === 1 ? '' : 's'} you followed`}
                    >
                        {f.title}
                        <span className="donesteps">
                            {f.steps} step{f.steps === 1 ? '' : 's'}
                        </span>
                    </button>
                ) : (
                    <span className="donetitle">{f.title}</span>
                )}
                {/*
                  * WHAT BECAME TRUE, in the asking agent's own words.
                  *
                  * docs/RESEARCH.md §20 — this is the highest-value thing on the surface and it was already
                  * in the database, discarded at the exact moment it came true. Grant (2008) measured +142%
                  * persistence and +171% output from ten minutes of knowing what the work was for; no
                  * counter competes with that.
                  *
                  * Quoted, never parsed. The brief refers to an `unblocks` field; there is none, and
                  * mining "2,849" out of prose to render as a figure would be inventing a statistic that is
                  * wrong the first time an agent writes a sentence without a number in it.
                  *
                  * Absent when the agent did not write one. Two of the fixture's finished tasks have no
                  * `why` for exactly this reason: the surface must not invent one.
                  */}
                {f.why && <span className="becametrue" data-measure="became-true">{f.why}</span>}
            </div>
            {/*
              * WHICH PROJECT, IN WORDS — the one thing the group heading said that a rail cannot.
              *
              * The rail carries the hue and the hue is an identifier you have to learn; the name is the fact. It
              * was on a heading over every bucket and it is on the row now, in the same 11px uppercase treatment
              * `.pname` used, so nothing about the record's vocabulary changed — only how many times it is said.
              * Hidden on the phone, where the row is already stacking and 60 rows of a repeated slug would be a
              * third line each; the rail still says it there.
              */}
            <span className="doneproject">{f.project}</span>
            <span className="donewhen">{humanDate(f.done_at)}</span>
            <button
                className="reopen"
                disabled={busy}
                title="Put this back in the queue — it will stop counting"
                onClick={reopen}
            >
                {busy ? '·' : 'Re-open'}
            </button>

            {/*
              * THE PROCEDURE HE FOLLOWED. Read-only, and the reason it is read-only is worth stating.
              *
              * `TaskDetail` renders steps for an OPEN task with tap-to-copy values and a note box. None of that
              * belongs here: the task is done, so there is nothing to copy toward and nothing to tell an agent
              * about it that the note it already carries does not say. This is the record of what was done, which
              * is a document rather than a workspace.
              *
              * `verify` is included and it is the most useful line in it — "how you know it worked, without
              * asking an agent" is exactly what he would come back for six weeks later.
              */}
            {open && (
                <div className="doneopen" data-measure="done-detail">
                    {loading && <p className="why">Reading it…</p>}
                    {/* The server's own words, never an apology. Hard constraint 2. */}
                    {failed && <p className="why" style={{ color: 'var(--bad)' }}>{failed}</p>}
                    {full && (
                        <>
                            {full.verify && (
                                <p className="doneverify">
                                    <span className="doneverifylabel">How you knew it worked</span>
                                    {full.verify}
                                </p>
                            )}
                            <ol className="donestepslist">
                                {full.steps.map((st, n) => (
                                    <li key={n}>
                                        {/* `renderInline` is not used here on purpose: it returns HTML for
                                            `dangerouslySetInnerHTML`, and a completed task's steps are read
                                            rather than acted on, so the plain text is enough and the attack
                                            surface is zero. The open task's detail pane is where the formatting
                                            earns the risk. */}
                                        <span className="donestepdo">{st.do}</span>
                                        {st.detail && <span className="donestepdetail">{st.detail}</span>}
                                    </li>
                                ))}
                            </ol>
                            {full.note && (
                                <p className="donenote">
                                    <span className="doneverifylabel">What you told the agent</span>
                                    “{full.note}”
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </li>
    );
}
