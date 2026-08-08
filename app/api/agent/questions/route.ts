import { requireAgent } from '../../../../lib/auth';
import {
    getQuestion, openQuestionIds, setQuestionMessageId, upsertQuestion,
} from '../../../../lib/store';
import { deleteMessage, sendQuestion, telegramConfigured } from '../../../../lib/telegram';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * Ask the human something, and do not stall waiting for the answer.
 *
 *   POST /api/agent/questions
 *   {
 *     project: 'riff-kitchen',
 *     title:   'Which storage bucket should the pin images go in?',
 *     context: 'Blocks the Pinterest queue. 2,849 images, ~400MB.',
 *     options: [
 *       { key: 'existing', label: 'Reuse the recipe-images bucket', recommended: true },
 *       { key: 'new',      label: 'Create a separate pins bucket' }
 *     ],
 *     allow: ['choose', 'ignore'],
 *     default_option: 'existing',
 *     hours: 12
 *   }
 *
 * `default_option` + `hours` is the part worth understanding, and the reason this hub exists rather than
 * a Linear ticket. It means: *if you have not answered in 12 hours, I will reuse the existing bucket.*
 *
 * That converts the two expensive failures named in the brief — guessing, and stalling — into a third
 * thing that is neither: a bounded wait with a pre-authorised outcome, stated to the human up front in
 * the notification itself. Nothing found in the research has this (docs/RESEARCH.md §3, §9.4).
 *
 * Use it whenever there is a defensible fallback. Leave it off when there genuinely is not, and the
 * question will wait open for as long as it takes.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const { question, created } = await upsertQuestion(body as never, agent);

        /*
         * The answer channel is best-effort and the record is not. The question is already stored and
         * verified by this point; if Telegram is down, misconfigured or revoked, the request still
         * succeeds and the question is still waiting on the page. A notification transport that can take
         * the whole hub down with it is a dependency, not a channel.
         *
         * `notified` is returned honestly so an agent can say "asked, but I could not ping you" rather
         * than assuming a human saw it.
         */
        let notified = false;
        if (created && telegramConfigured()) {
            const messageId = await sendQuestion(question, process.env.CC_PUBLIC_URL ?? '');
            if (messageId != null) {
                await setQuestionMessageId(question.id, messageId);
                notified = true;
            }
        }

        return json(
            {
                ok: true,
                created,
                notified,
                notify_channel: telegramConfigured() ? 'telegram' : 'none',
                question: created ? { ...question, tg_message_id: undefined } : question,
            },
            created ? 201 : 200,
        );
    } catch (e) {
        return fail(e);
    }
}

/**
 * Re-send an open question to Telegram in the current message format.
 *
 *   PATCH /api/agent/questions  { id }            one question
 *   PATCH /api/agent/questions  { open: true }    every open question
 *
 * WHY THIS EXISTS
 *
 * A Telegram message is frozen at the moment it is sent. When the message format improves — and it will,
 * because the format is where most of the usability lives — every already-sent question is stuck with the
 * old one. That happened on day one: comments-on-answers shipped, and the two questions already on the
 * phone had no way to advertise it, so the only route to a comment was the website.
 *
 * The old buttons keep working (their callback_data is still valid) and the *server* handling the tap is
 * always current, so nothing is broken. But "you can add a comment" is useless if the message in front of
 * you does not say so. This deletes the stale message and sends a fresh one, so the thing in your hand
 * matches the thing that is running.
 *
 * Only touches open questions. Re-pushing an answered one would resurrect a decided prompt, which is
 * exactly the pile of stale buttons this design avoids elsewhere.
 */
export async function PATCH(req: Request) {
    try {
        requireAgent(req);
        const body = await readJson(req);

        let ids: string[];
        if (body.open === true) {
            ids = (await openQuestionIds());
        } else {
            const id = String(body.id ?? '');
            if (!id) return json({ ok: false, error: '`id` or `open: true` is required' }, 400);
            ids = [id];
        }

        const results: { id: string; repushed: boolean; reason?: string }[] = [];
        for (const id of ids) {
            const q = await getQuestion(id);
            if (!q) { results.push({ id, repushed: false, reason: 'no such question' }); continue; }
            if (q.status !== 'open') {
                results.push({ id, repushed: false, reason: `already ${q.status}` });
                continue;
            }
            if (!telegramConfigured()) {
                results.push({ id, repushed: false, reason: 'telegram not configured or suppressed' });
                continue;
            }

            // Delete first, then send, so a failure leaves one message rather than two.
            if (q.tg_message_id) await deleteMessage(q.tg_message_id);
            const messageId = await sendQuestion(q, process.env.CC_PUBLIC_URL ?? '');
            if (messageId == null) {
                results.push({ id, repushed: false, reason: 'send failed' });
                continue;
            }
            await setQuestionMessageId(id, messageId);
            results.push({ id, repushed: true });
        }

        return json({ ok: true, results });
    } catch (e) {
        return fail(e);
    }
}

/**
 * Read one question back, for an agent that wants to poll a specific decision rather than sync.
 *
 *   GET /api/agent/questions?id=q1a2b3c4d
 *
 * Cheap enough to call in a loop with a sane interval. `cc wait` in the CLI uses this.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);
        const id = new URL(req.url).searchParams.get('id');
        if (!id) return json({ ok: false, error: '`id` is required' }, 400);

        const question = await getQuestion(id);
        if (!question) return json({ ok: false, error: `no question with id "${id}"` }, 404);
        return json({ ok: true, question: { ...question, tg_message_id: undefined } });
    } catch (e) {
        return fail(e);
    }
}
