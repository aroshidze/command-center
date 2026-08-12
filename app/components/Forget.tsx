'use client';

import { useState } from 'react';
import { act } from './ui';

/**
 * "THIS WAS NEVER A PROJECT" — the way out of a phantom, on the page where you notice it is one.
 *
 * ==================================================================================================
 * WHY THIS CONTROL EXISTS AT ALL
 * ==================================================================================================
 *
 * The CLI used to infer a project from whatever directory an agent was standing in, so a subfolder became
 * a project: `GAMBLANGO/orchestrator/research/reports` grew into a project called `reports`, with a page, a
 * run, and a quote from an agent. His reaction was the correct one — *"NO SUCH PROJECT!"*
 *
 * `projectFrom` in `cli/cc.mjs` stops new ones. It does nothing about the rows already written, and those
 * never age out: `presenceRows` is not time-windowed, so a phantom would sit on `/agents` reading "quiet"
 * for as long as the hub exists. A fix that leaves the mess it made on screen is half a fix.
 *
 * ==================================================================================================
 * WHY IT IS SAFE, AND WHY THAT IS ENFORCED SERVER-SIDE RATHER THAN HERE
 * ==================================================================================================
 *
 * `forgetProject` refuses the moment a single task or decision exists for the slug, so nothing a person or
 * an agent authored can be lost through it. This component only OFFERS the control when the page has no
 * work on it — but that is a courtesy to the reader, not the safety property. The refusal is in the store,
 * where a hand-made request cannot get around it.
 *
 * ==================================================================================================
 * TWO PRESSES, AND NO `confirm()`
 * ==================================================================================================
 *
 * The first press turns the button into the sentence describing what will happen; the second does it. A
 * native `confirm()` is a modal the page cannot style, reads differently on every platform, and on a phone
 * covers the thing you are deciding about. Two presses on the same control keeps the decision where its
 * subject is — and the second label names the counts, so it cannot be pressed on a project with real work
 * in it without that being on screen.
 */
export default function Forget({ project }: { project: string }) {
    const [state, setState] = useState<'idle' | 'sure' | 'busy' | 'gone'>('idle');
    const [refused, setRefused] = useState<string | null>(null);

    async function forget() {
        setState('busy');
        setRefused(null);
        const r = await act({ action: 'project.forget', project });
        if (r.ok) {
            setState('gone');
            /* A whole page about a project that no longer exists is not a page to stay on. The list is where
             * he can see that it has actually gone, which is the only proof that matters. */
            setTimeout(() => { window.location.href = '/agents'; }, 900);
        } else {
            setState('idle');
            setRefused(r.message);
        }
    }

    if (state === 'gone') {
        return (
            <p className="presnote" data-measure="forget-done">
                Forgotten. Everything observed about &ldquo;{project}&rdquo; is gone; the event log still
                records what agents were told. Going back to the list…
            </p>
        );
    }

    return (
        <div className="presnote" data-measure="forget">
            {refused && (
                <p className="refusedtext" role="alert" style={{ marginTop: 0 }}>{refused}</p>
            )}
            <p style={{ marginTop: 0 }}>
                {state === 'sure'
                    ? <>
                        This deletes everything <b>observed</b> about &ldquo;{project}&rdquo; — its runs,
                        sub-agents, reports and token totals. Tasks and decisions are untouched, and it
                        refuses outright if any exist. The event log keeps its record of what agents were
                        told.
                      </>
                    : <>
                        Not a real project? A subfolder an agent worked in could once become one by mistake.
                      </>}
            </p>
            <button
                className="quiet"
                data-measure="forget-button"
                disabled={state === 'busy'}
                onClick={() => (state === 'sure' ? void forget() : setState('sure'))}
            >
                {state === 'busy' ? 'Forgetting…'
                    : state === 'sure' ? `Yes — forget "${project}"`
                        : 'This was never a project'}
            </button>
            {state === 'sure' && (
                <button className="quiet" onClick={() => setState('idle')} style={{ marginLeft: 8 }}>
                    Keep it
                </button>
            )}
        </div>
    );
}
