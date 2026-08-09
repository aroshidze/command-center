'use client';

import { useState } from 'react';
import type { Question, Task } from '../../lib/types';
import QuestionCard from './QuestionCard';
import TaskRow from './TaskRow';
import TaskDetail from './TaskDetail';

/**
 * WHAT THIS PROJECT NEEDS FROM HIM, ANSWERABLE WHERE IT IS SHOWN.
 *
 * ==================================================================================================
 * WHY THIS BLOCK IS FIRST ON THE PAGE, ABOVE EVERYTHING RICHER
 * ==================================================================================================
 *
 * Anthropic shipped Agent View in May 2026 — a session roster in the terminal — and the column it leads
 * with is *needs your input*. That is the right thing to lead with, and it is the one judgement worth
 * taking wholesale from a rival: of everything a command centre can say, "this cannot continue without
 * you" is the only line that is about the next thirty seconds. Everything else on this page is about
 * understanding; this is the part that unblocks work.
 *
 * ==================================================================================================
 * IT IS THE SAME CARDS THE QUEUE USES, NOT A COPY OF THEM
 * ==================================================================================================
 *
 * `QuestionCard`, `TaskRow` and `TaskDetail` are imported, not reimplemented. A second answer path would
 * mean two places where a timed default can be mis-sent, two places to keep the one-tap-plus-comment shape
 * working, and two places for the "never say saved until it was read back" rule to be broken. The queue
 * page and this page therefore cannot disagree about what answering means.
 *
 * ==================================================================================================
 * THE COUNTS ARE NOT REPEATED HERE
 * ==================================================================================================
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §2: the queue answers exactly one question and nothing may inflate it
 * or its counts. This block shows one project's slice of the same rows — so it deliberately has no chips,
 * no totals and no badge. If it had a count, that count would be a second authority on how much is
 * waiting, and two numbers about the same thing is how a hub stops being believed.
 */
export default function Attention({ questions, tasks }: {
    questions: Question[];
    tasks: Task[];
}) {
    /* Answered items leave the list here rather than waiting for a reload, because the alternative is a
     * card he has already dealt with sitting under his cursor. Both lists are seeded from the server and
     * only ever shrink from a server-confirmed outcome. */
    const [openQuestions, setOpenQuestions] = useState(questions);
    const [openTasks, setOpenTasks] = useState(tasks);
    const [focus, setFocus] = useState<string | null>(null);
    const [refused, setRefused] = useState<string | null>(null);

    const chosen = focus ? openTasks.find(t => t.id === focus) ?? null : null;
    if (!openQuestions.length && !openTasks.length) return null;

    return (
        <section className="attention" data-measure="attention">
            <h2>Needs you</h2>

            <div className="refused" role="alert" aria-live="assertive" data-measure="attention-refused">
                {refused && (
                    <>
                        <span className="refusedtext">{refused}</span>
                        <button className="quiet" onClick={() => setRefused(null)}>Dismiss</button>
                    </>
                )}
            </div>

            {/*
              * DECISIONS BEFORE WORK, always. A question has an agent standing still behind it and often a
              * deadline attached; a task is work he will do when he does it. Ordering by anything else would
              * put a two-day errand above a agent waiting on one tap.
              */}
            {openQuestions.map(q => (
                <QuestionCard
                    key={q.id}
                    q={q}
                    onGone={id => setOpenQuestions(list => list.filter(x => x.id !== id))}
                />
            ))}

            {openTasks.length > 0 && (
                <ul className="tasklist" data-measure="attention-tasks">
                    {openTasks.map(t => (
                        <TaskRow
                            key={t.id}
                            t={t}
                            selected={t.id === focus}
                            onOpen={() => setFocus(t.id === focus ? null : t.id)}
                            onDone={id => {
                                setOpenTasks(list => list.filter(x => x.id !== id));
                                if (focus === id) setFocus(null);
                            }}
                            onRefused={setRefused}
                        />
                    ))}
                </ul>
            )}

            {/* The steps, the verification and the gotchas of whichever task is open. Below the list rather
                than inside a row, so opening one cannot change the height of the row above it. */}
            {chosen && (
                <TaskDetail
                    t={chosen}
                    onDone={id => {
                        setOpenTasks(list => list.filter(x => x.id !== id));
                        setFocus(null);
                    }}
                    onClose={() => setFocus(null)}
                />
            )}
        </section>
    );
}
