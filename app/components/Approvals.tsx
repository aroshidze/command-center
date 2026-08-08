'use client';

import { useEffect, useState } from 'react';
import type { Approval } from '../../lib/store';
import { act } from './ui';

/**
 * A HELD TOOL CALL, ABOVE THE QUEUE — the only new thing on the board, and it is a band rather than a row.
 *
 * ==================================================================================================
 * WHY THIS IS ALLOWED ON THE QUEUE PAGE WHEN NOTHING ELSE IN THIS BRIEF IS
 * ==================================================================================================
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §2 puts presence and spend on their own page because they are state he
 * checks. This is the exception it names, and the reason is the clock: *"those need answering in minutes and
 * cannot live on a page he might not open."* An agent is standing still while this is on screen. Ten minutes
 * from now the window closes and the work goes back to waiting at a terminal he is not sitting at.
 *
 * ==================================================================================================
 * IT IS NOT A TASK, NOT A QUESTION, AND NOT IN ANY COUNT
 * ==================================================================================================
 *
 * The header chips still say what they said. `board()` counts nothing from this table, there is no `events`
 * row so it cannot reach an agent's `changed`, and it has its own table so no query that counts his work can
 * see it by accident. Those are the brief's non-negotiables, and each one is enforced by structure rather than
 * by a promise in a comment.
 *
 * ==================================================================================================
 * IT EXPIRES VISIBLY, AND THAT IS WHY THERE IS A TIMER AT ALL
 * ==================================================================================================
 *
 * *"An approval that silently lapsed is worse than one that was never asked."* So the countdown is live, and
 * when it reaches zero the band says the request went back to the terminal rather than the row simply
 * vanishing. The one-second tick is the only interval in this codebase, and it is worth stating why it does
 * not break the no-auto-refresh rule: nothing is re-fetched and no list reorders. It re-renders a number that
 * is a pure function of a timestamp already in the props — the same thing a clock does, on a value the server
 * already sent.
 */

/** Below this, the countdown is worth showing in seconds rather than minutes. */
const SECONDS_VIEW = 90;

function Countdown({ expiresAt, onLapsed }: { expiresAt: string; onLapsed: () => void }) {
    const [left, setLeft] = useState(() =>
        Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));

    useEffect(() => {
        const tick = () => {
            const next = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
            setLeft(next);
            /* Told once, when it crosses. The parent flips the row to lapsed locally rather than polling for
             * it — the deadline is a fact both sides already have, so asking the server what time it is would
             * be a round trip to learn nothing. */
            if (next === 0) onLapsed();
        };
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [expiresAt, onLapsed]);

    if (left <= 0) return <span className="apxleft">out of time</span>;
    return (
        <span className="apxleft" data-measure="approval-left">
            {left > SECONDS_VIEW ? `${Math.ceil(left / 60)} min left` : `${left}s left`}
        </span>
    );
}

function ApprovalRow({ a }: { a: Approval }) {
    const [status, setStatus] = useState(a.status);
    const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    async function decide(decision: 'allow' | 'deny') {
        setBusy(decision);
        setProblem(null);
        const r = await act({ action: 'approval.decide', id: a.id, decision });
        setBusy(null);
        if (r.ok) {
            /*
             * The SERVER's row, never a locally assembled one. `act` returns the row `writeVerified` read
             * back, so this is a confirmed write for the same reason ticking a task off is — and the stakes
             * are higher: a status set optimistically here would tell him an agent had been allowed to run
             * something when the write had been refused.
             */
            const server = (r.data?.approval as Approval | undefined)?.status;
            setStatus(server ?? (decision === 'allow' ? 'allowed' : 'denied'));
        } else {
            setProblem(r.message);
        }
    }

    const settled = status !== 'pending';

    return (
        <div className="apxrow" data-measure="approval" data-approval={a.id} data-status={status}>
            <div className="apxwhat">
                <span className="apxwho">
                    <b>{a.agent}</b> wants to run <b>{a.tool_name}</b> in <b>{a.project}</b>
                    {a.stripped > 0 && (
                        /*
                         * THE WARNING IS A BADGE ON LINE ONE, not a third line, and that is a height decision
                         * with a measured cause. As three lines the band cost the queue five of the six tasks
                         * check L3 holds above the fold at 1280 — measured at 1 of 21 with two calls held and 6
                         * with none. The words are the same; only the line they sit on changed.
                         *
                         * It stays adjacent to the tool name rather than moving next to the preview, because
                         * the sentence is what he reads first and this is the fact that should stop him.
                         */
                        <span className="apxwarn" data-measure="approval-stripped"
                            title={`${a.stripped} character(s) in the text below render as nothing at all. `
                                + 'It displays as something other than what it contains.'}>
                            {a.stripped} hidden
                        </span>
                    )}
                </span>
                {/*
                  * The agent's own text, QUOTED rather than spoken. Mono, on its own line, under the hub's
                  * sentence — see lib/sanitise.ts for why the authorship has to be visible: prose from an
                  * untrusted author in the same voice as the interface is how a payload gets to sound like an
                  * instruction from the hub. It keeps its own line at every width, because truncating the one
                  * string he is being asked to authorise would defeat the entire feature.
                  */}
                {a.preview && <code className="apxpreview" data-measure="approval-preview">{a.preview}</code>}
                {problem && <span className="apxwarn" role="alert">{problem}</span>}
            </div>

            <div className="apxact">
                {settled ? (
                    <span className="apxdone" data-measure="approval-outcome">
                        {status === 'allowed' ? 'Allowed'
                            : status === 'denied' ? 'Denied'
                                /* The lapsed wording says where the decision went, not merely that it
                                 * expired. "Went back to the terminal" is the promise this feature makes, and
                                 * this is the one moment it is kept. */
                                : 'Out of time — it went back to asking in its terminal'}
                        {status !== 'expired' && a.decided_by === 'telegram' ? ' on your phone' : ''}
                    </span>
                ) : (
                    <>
                        <Countdown expiresAt={a.expires_at} onLapsed={() => setStatus('expired')} />
                        {/*
                          * DENY FIRST IN THE DOM, ALLOW SECOND — and visually the other way round via
                          * `flex-direction: row-reverse` on the container.
                          *
                          * That is not a trick, it is the same reasoning that keeps "I've done this" at the far
                          * end of a task row: a mis-tap on Allow authorises something on his machine, and the
                          * destructive-by-default direction of a mis-press should be the harmless one. Tab
                          * order reaches Deny first; the thumb reaches Allow where a thumb expects the
                          * affirmative to be.
                          */}
                        <button
                            className="quiet apxdeny"
                            data-measure="approval-deny"
                            disabled={busy !== null}
                            onClick={() => decide('deny')}
                        >
                            {busy === 'deny' ? '·' : 'Deny'}
                        </button>
                        <button
                            className="primary apxallow"
                            data-measure="approval-allow"
                            disabled={busy !== null}
                            onClick={() => decide('allow')}
                        >
                            {busy === 'allow' ? '·' : 'Allow'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * HOW MANY RENDER WHOLE BEFORE THE REST GO BEHIND A COUNT. Two.
 *
 * The same mechanism the decisions region uses, for the same measured reason and with the same refusal of the
 * obvious alternative. §XXVIII removed a `max-height` scroller from the decision cards because *"it slices a
 * card wherever the pixel budget runs out… an option you cannot read is an option you cannot choose"*, and
 * that argument is stronger here: an Allow button below a cut is a button he cannot press on a request that
 * expires in ten minutes.
 *
 * So the limit is in CARDS and nothing is ever clipped. Two rather than one because two agents held at once is
 * an ordinary Tuesday with parallel work, and rather than four because the band's whole budget is what it
 * costs the queue — measured at five of six above-the-fold tasks for two rows before this was compacted.
 *
 * NOTHING IS HIDDEN BY THE CAP. Telegram is notified for every held call regardless, so the phone path is
 * uncapped; the count says how many are not drawn; and pressing it draws them.
 */
const SHOWN = 2;

/**
 * The band. Renders nothing at all when there is nothing held.
 *
 * Nothing — not an empty container, not a zero. A band that is usually present is a band nobody reads, which
 * is the rule the stale-sync banner, the unlock banner and `unseenWork` all already follow. This one has the
 * shortest life of any of them, so it matters most.
 */
export default function Approvals({ approvals }: { approvals: Approval[] }) {
    const [all, setAll] = useState(false);
    if (!approvals.length) return null;

    /*
     * PENDING FIRST, whatever the order they arrived in. A settled row is a receipt with ninety seconds to
     * live; a pending one has an agent standing still behind it. Sorting by `created_at` alone — which is what
     * the query returns — would let two just-answered rows push the one that still needs answering under the
     * cap.
     */
    const ordered = [...approvals].sort((x, y) =>
        Number(y.status === 'pending') - Number(x.status === 'pending')
        || x.created_at.localeCompare(y.created_at));
    const shown = all ? ordered : ordered.slice(0, SHOWN);
    const hidden = ordered.length - shown.length;

    return (
        /*
         * `role="status"` and not `alert`. The refused-write banner is the page's one assertive region, because
         * it means something he just did did not happen; two assertive regions compete, and a screen reader
         * interrupting itself over a ten-minute countdown would bury the message that cannot be missed.
         */
        <div className="apxband" role="status" data-measure="approval-band">
            {shown.map(a => <ApprovalRow key={a.id} a={a} />)}
            {hidden > 0 && (
                <button
                    className="morelink apxmore"
                    data-measure="approval-more"
                    onClick={() => setAll(true)}
                >
                    {hidden} more waiting on you — show {hidden === 1 ? 'it' : 'them'}
                </button>
            )}
        </div>
    );
}
