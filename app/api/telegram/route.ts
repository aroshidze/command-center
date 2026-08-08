import { requireTelegram, Unauthorised } from '../../../lib/auth';
import {
    addNote, answerQuestion, appendAnswerNote, board, decideApproval, getQuestionByMessageId, Invalid,
} from '../../../lib/store';
import {
    ackCallback, decodeApprovalCallback, decodeCallback, markAnswered, markApprovalSettled, sendPlain,
} from '../../../lib/telegram';
import { WriteFailed } from '../../../lib/db';
import { json } from '../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * The one-tap loop.
 *
 * Tapping an inline-keyboard button in a Telegram notification sends a `callback_query` here and puts no
 * message in the chat. That is the whole interaction: notification → tap → the agent has its answer.
 * No password, no page load, no typing, no app switch.
 *
 * Three things arrive at this endpoint:
 *   callback_query          a tapped option button                      → answers a question
 *   message (reply)         a typed value replying to a question        → answers with `respond`
 *   message (anything else) a thought you wanted an agent to know       → becomes a note
 *
 * WHY THIS ALWAYS RETURNS 200
 *
 * Telegram retries any webhook that does not return 2xx, and it retries with the same update. A 500 here
 * would mean a redelivery, and a redelivered tap on a question that has since been answered is exactly
 * the double-write this design refuses to allow. So every outcome — including refusals — is reported to
 * you inside Telegram and acknowledged with a 200. The only exception is a bad secret token, which is
 * rejected with a 401 because it did not come from Telegram at all.
 */
export async function POST(req: Request) {
    try {
        requireTelegram(req);
    } catch (e) {
        if (e instanceof Unauthorised) return json({ ok: false }, 401);
        throw e;
    }

    let update: Record<string, any>;
    try {
        update = await req.json();
    } catch {
        return json({ ok: true, ignored: 'unparseable body' });
    }

    const expectedChat = process.env.TELEGRAM_CHAT_ID;

    try {
        /* ---------------------------------------------------------------- a tapped button */
        if (update.callback_query) {
            const cq = update.callback_query;
            const fromId = String(cq.from?.id ?? '');

            // Anyone who finds the bot can press a button on a forwarded message. Only the owner counts.
            if (expectedChat && fromId !== expectedChat) {
                await ackCallback(cq.id, 'This bot only takes answers from its owner.');
                return json({ ok: true, ignored: 'wrong sender' });
            }

            /*
             * A HELD TOOL CALL IS TRIED FIRST, and the ordering is about latency rather than precedence.
             *
             * A question waits for hours; a permission request has a ten-minute window and an agent standing
             * still inside it. The two callback shapes cannot collide — `pa:`/`pd:` against `c:`/`a:`/`i:`,
             * and the ids come from different tables with different prefixes — so this is purely about doing
             * the urgent decode before the patient one.
             */
            const held = decodeApprovalCallback(String(cq.data ?? ''));
            if (held) {
                try {
                    const approval = await decideApproval(
                        held.approvalId, held.verb === 'allow' ? 'allowed' : 'denied', 'telegram',
                    );
                    const line = held.verb === 'allow' ? 'Allowed' : 'Denied';
                    /*
                     * The toast says what happens NEXT, not just what was recorded. "Allowed. It will carry on
                     * within a few seconds" is the sentence that makes the tap feel like it reached the
                     * machine — the agent is polling, so the delay is real and bounded, and stating it stops
                     * him tapping again.
                     */
                    await ackCallback(
                        cq.id,
                        `${line}. ${approval.agent} picks this up within a few seconds.`,
                    );
                    await markApprovalSettled(
                        approval.tg_message_id, approval.project, approval.tool_name,
                        `${line} — answered on your phone`,
                    );
                    return json({ ok: true, decided: approval.id, status: approval.status });
                } catch (e) {
                    /*
                     * The two refusals that actually happen here are both worth a plain sentence: a
                     * double-tap, and a tap after the window closed. The second is the important one — the
                     * agent has already gone back to asking in its terminal, so the honest message says so
                     * rather than implying the tap did something.
                     */
                    const why = e instanceof Invalid ? e.message
                        : e instanceof WriteFailed ? `NOT saved — ${e.reason}`
                            : 'NOT saved — the hub errored. Nothing was recorded.';
                    console.error('[telegram] approval failed:', e);
                    await ackCallback(cq.id, why.slice(0, 200));
                    return json({ ok: true, refused: why });
                }
            }

            const decoded = decodeCallback(String(cq.data ?? ''));
            if (!decoded) {
                await ackCallback(cq.id, 'That button is from an older version of the hub.');
                return json({ ok: true, ignored: 'undecodable callback_data' });
            }

            const { kind, questionId, optionKey } = decoded;
            const type = kind === 'c' ? 'choose' : kind === 'a' ? 'accept' : 'ignore';

            try {
                const question = await answerQuestion(questionId, { type, option: optionKey || null });
                const label = question.answer_option
                    ? question.options.find(o => o.key === question.answer_option)?.label ??
                      question.answer_option
                    : null;
                const line = type === 'ignore' ? 'Not now — I will stop asking'
                    : type === 'accept' ? 'You approved this'
                        : `You chose: ${label}`;

                /*
                 * Only after the write has been read back and confirmed does the toast say "saved".
                 *
                 * The toast also advertises the reply affordance, because a tapped button cannot carry
                 * text and the human has no other way to know they can still add something. Without this
                 * line, answering by tap would silently be the lesser option — fast but mute — and the
                 * fast path must not be the poor one.
                 */
                await ackCallback(cq.id, `Saved. ${line}\n\nReply to the message to add a comment.`);
                await markAnswered(question, line);
                return json({ ok: true, answered: questionId });
            } catch (e) {
                // Told plainly, in the place the tap happened. A silent failure here would be the exact
                // "it said saved and it wasn't" bug from brief §6, wearing a green tick.
                const why = e instanceof Invalid ? e.message
                    : e instanceof WriteFailed ? `NOT saved — ${e.reason}`
                        : 'NOT saved — the hub errored. Nothing was recorded.';
                console.error('[telegram] answer failed:', e);
                await ackCallback(cq.id, why.slice(0, 200));
                return json({ ok: true, refused: why });
            }
        }

        /* ---------------------------------------------------------------- a typed message */
        const msg = update.message ?? update.edited_message;
        if (msg) {
            const fromId = String(msg.from?.id ?? '');
            if (expectedChat && fromId !== expectedChat) {
                return json({ ok: true, ignored: 'wrong sender' });
            }

            const text = String(msg.text ?? '').trim();
            if (!text) return json({ ok: true, ignored: 'no text' });

            if (text.startsWith('/start')) {
                await sendPlain(
                    `Command Center is connected.\n\nYour chat id is <code>${fromId}</code>.\n\n` +
                    `Send /status any time. Anything else you send becomes a note the next agent reads.`,
                );
                return json({ ok: true });
            }

            if (text.startsWith('/status')) {
                const b = await board();
                const lines: string[] = [];
                lines.push(
                    b.questions.length
                        ? `<b>${b.questions.length} waiting on you</b>`
                        : '<b>Nothing is waiting on you.</b>',
                );
                for (const q of b.questions.slice(0, 8)) lines.push(`• ${q.title} <i>(${q.project})</i>`);

                const actionable = b.tasks.filter(t => !t.blocked_reason);
                lines.push(
                    '',
                    actionable.length
                        ? `${actionable.length} open task${actionable.length === 1 ? '' : 's'}` +
                          ` (${actionable.reduce((n, t) => n + (t.minutes ?? 0), 0)} min)`
                        : 'No open tasks.',
                );
                for (const t of actionable.slice(0, 8)) lines.push(`• ${t.title} <i>(${t.project})</i>`);

                // Staleness made visible rather than silent: if agents have stopped reading, the hub is
                // quietly lying and you should be able to see that from here.
                const seen = b.agents.filter(a => a.last_sync_at).sort(
                    (x, y) => (y.last_sync_at! > x.last_sync_at! ? 1 : -1),
                )[0];
                lines.push('', seen
                    ? `<i>Last agent sync: ${seen.name}, ${ago(seen.last_sync_at!)}</i>`
                    : '<i>No agent has ever synced. Nothing is reading your answers yet.</i>');

                await sendPlain(lines.join('\n'));
                return json({ ok: true });
            }

            /*
             * A reply to a question's message is that question's answer. This is how `respond` works
             * without a form: swipe-reply on the notification, type the value, send.
             */
            const replyTo = msg.reply_to_message?.message_id;
            if (replyTo) {
                const q = await getQuestionByMessageId(Number(replyTo));

                // Reply to a question still waiting for a typed value: that reply IS the answer.
                if (q && q.status === 'open' && q.allow.includes('respond')) {
                    try {
                        const answered = await answerQuestion(q.id, { type: 'respond', text });
                        await markAnswered(answered, `You replied: ${text}`);
                        await sendPlain(`Saved as the answer to "${escapeHtml(q.title)}".`);
                    } catch (e) {
                        await sendPlain(
                            `NOT saved. ${e instanceof Error ? escapeHtml(e.message) : 'Unknown error'}`,
                        );
                    }
                    return json({ ok: true });
                }

                /*
                 * Reply to a question already answered: that reply is a COMMENT on the answer.
                 *
                 * This is the other half of the tap-then-comment flow. It also covers the case where the
                 * thought arrives later — you tap, walk away, think of the caveat, and reply. The comment
                 * still reaches the agent with the decision it belongs to rather than as a loose note.
                 */
                if (q && q.status !== 'open') {
                    try {
                        const updated = await appendAnswerNote(q.id, text);
                        await sendPlain(
                            `Added to your answer on "${escapeHtml(q.title)}". The next agent to sync ` +
                            `will read it with the decision.`,
                        );
                        return json({ ok: true, commented: updated.id });
                    } catch (e) {
                        await sendPlain(
                            `NOT saved. ${e instanceof Error ? escapeHtml(e.message) : 'Unknown error'}`,
                        );
                        return json({ ok: true });
                    }
                }
            }

            /*
             * Everything else becomes a note delivered to the next agent that syncs. This is the cheapest
             * feature in the hub and possibly the most useful: a thought you have while away from the
             * desk reaches the agent without you having to remember to repeat it.
             */
            const note = await addNote(text, 'telegram', null);
            await sendPlain(`Noted. The next agent to sync will read it.\n<i>#${note.id}</i>`);
            return json({ ok: true, note: note.id });
        }

        return json({ ok: true, ignored: 'unhandled update type' });
    } catch (e) {
        // Still a 200: see the note at the top about redelivery. Logged so it is not invisible.
        console.error('[telegram] webhook error:', e);
        try {
            await sendPlain('Something went wrong handling that, and nothing was saved.');
        } catch { /* the channel itself is down; the log is all there is */ }
        return json({ ok: true, error: 'handled' });
    }
}

function ago(isoString: string): string {
    const mins = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)} days ago`;
}

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
