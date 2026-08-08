import { ladderSentence } from './reminders';
import type { Question } from './types';

/**
 * The one-tap answer channel. Bot API 10.2 (14 Jul 2026) — https://core.telegram.org/bots/api
 *
 * Why Telegram rather than web push: tapping an inline-keyboard button sends a `callback_query` to the
 * webhook and puts NO message in the chat, so answering a blocked decision is genuinely one tap with no
 * typing, no app switch and no page load. Web push on iOS needs a home-screen install first and gives
 * weaker actions. Full comparison in docs/RESEARCH.md §6.
 *
 * Every function here is a no-op when the bot is not configured. The hub must work completely without
 * Telegram — you can always open the page — because a notification channel that takes the whole tool
 * down with it when a token is revoked is not a channel, it is a dependency.
 */

const API = 'https://api.telegram.org';

/**
 * Is there a live notification channel?
 *
 * `CC_SUPPRESS_TELEGRAM` exists because of a real failure, and it deserves the explanation rather than
 * looking like an unnecessary flag.
 *
 * The test suites run against a local server, but that server reads the same `.env.local` as everything
 * else — so the same real bot token and the same real chat id. The consequence was that running the proof
 * suites pushed every synthetic question ("Victim question for a failed write") to the owner's actual
 * phone, a dozen at a time. A test that spams the human it is meant to serve is worse than no test,
 * because the fix is to stop running the tests.
 *
 * So local development suppresses sending by default. The webhook and answer paths are still fully
 * exercised locally — tests/prove.mjs posts the exact update shape Telegram sends — and real delivery is
 * verified in production, where the flag is absent. tests/prove.mjs refuses to run unless suppression is
 * confirmed active via /api/health, so this cannot silently regress.
 */
export function telegramConfigured(): boolean {
    if (process.env.CC_SUPPRESS_TELEGRAM === 'yes') return false;
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };

    try {
        const res = await fetch(`${API}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000),
        });
        const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
        if (!json.ok) console.error(`[telegram] ${method} failed: ${json.description}`);
        return json;
    } catch (e) {
        // A dead notification channel must never fail a write that already succeeded. The answer is
        // stored either way; the ping is best-effort by design.
        console.error(`[telegram] ${method} threw:`, e instanceof Error ? e.message : e);
        return { ok: false, description: String(e) };
    }
}

/* ------------------------------------------------------------------------------------------------
 * callback_data budget
 *
 * The Bot API limits callback_data to 1-64 BYTES. That is a hard constraint that shapes the id scheme
 * (lib/ids.ts) and the 12-character cap on option keys (lib/types.ts). Encoding is checked rather than
 * assumed, because silently exceeding it produces a button that looks fine and fails when tapped —
 * which is the worst possible place for this to break.
 * ---------------------------------------------------------------------------------------------- */

export const CALLBACK_DATA_MAX_BYTES = 64;

export function encodeCallback(kind: 'c' | 'a' | 'i', questionId: string, optionKey = ''): string {
    const data = `${kind}:${questionId}:${optionKey}`;
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > CALLBACK_DATA_MAX_BYTES) {
        throw new Error(
            `callback_data would be ${bytes} bytes, over Telegram's ${CALLBACK_DATA_MAX_BYTES}-byte ` +
            `limit: "${data}". Shorten the option key.`,
        );
    }
    return data;
}

export function decodeCallback(
    data: string,
): { kind: 'c' | 'a' | 'i'; questionId: string; optionKey: string } | null {
    const m = /^([cai]):([a-z0-9]{1,20}):([a-z0-9_-]{0,12})$/.exec(data);
    if (!m) return null;
    return { kind: m[1] as 'c' | 'a' | 'i', questionId: m[2], optionKey: m[3] };
}

/**
 * A HELD TOOL CALL gets its own callback shape, and a distinct prefix rather than a fourth question kind.
 *
 * `pa:` and `pd:` — permission allow, permission deny. Two reasons it is not folded into `encodeCallback`:
 * the ids come from different tables and a decoder that returns a `questionId` for an approval is one
 * mis-read away from answering the wrong row, and the question kinds carry an option key while these carry
 * nothing. Twelve bytes against Telegram's 64, so there is no budget argument either way — this is about
 * the two things not being able to be confused.
 */
export function encodeApprovalCallback(verb: 'allow' | 'deny', approvalId: string): string {
    const data = `p${verb === 'allow' ? 'a' : 'd'}:${approvalId}`;
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > CALLBACK_DATA_MAX_BYTES) {
        throw new Error(`callback_data would be ${bytes} bytes, over the ${CALLBACK_DATA_MAX_BYTES} limit`);
    }
    return data;
}

export function decodeApprovalCallback(
    data: string,
): { verb: 'allow' | 'deny'; approvalId: string } | null {
    const m = /^p([ad]):([a-z0-9]{1,20})$/.exec(data);
    if (!m) return null;
    return { verb: m[1] === 'a' ? 'allow' : 'deny', approvalId: m[2] };
}

/* ---------------------------------------------------------------------------------------------- */

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function keyboardFor(q: Question): { inline_keyboard: { text: string; callback_data: string }[][] } {
    const rows: { text: string; callback_data: string }[][] = [];

    if (q.allow.includes('choose')) {
        /*
         * THE RECOMMENDED OPTION FIRST, matching the hub — and matching what lib/types.ts has always said
         * `recommended` does ("Rendered first and highlighted").
         *
         * It matters more here than on the web, because a Telegram keyboard is a vertical stack read top to
         * bottom on a phone: with four options the agent's own preference could be the fourth button down, below
         * the fold of the notification. A stable sort, so the agent's ordering of everything else survives.
         */
        const options = [...q.options]
            .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
        for (const opt of options) {
            rows.push([
                {
                    /*
                     * "(suggested)" rather than "· suggested".
                     *
                     * A button cannot carry a badge, so the marker has to be in the label — but a middot reads
                     * as part of the option's own name, which made an option called "09:00" look like an option
                     * called "09:00 · suggested". Parentheses are unambiguously an annotation. A tick was
                     * considered and rejected: on a button it reads as "already chosen", which is the one thing
                     * it must not say.
                     */
                    text: opt.recommended ? `${opt.label}  (suggested)` : opt.label,
                    callback_data: encodeCallback('c', q.id, opt.key),
                },
            ]);
        }
    }
    if (q.allow.includes('accept')) {
        rows.push([{ text: 'Go ahead', callback_data: encodeCallback('a', q.id) }]);
    }
    if (q.allow.includes('ignore')) {
        rows.push([{ text: 'Not now', callback_data: encodeCallback('i', q.id) }]);
    }
    return { inline_keyboard: rows };
}

/**
 * @param nudge When this message is a REMINDER rather than the first ask: which one it is, and whether it
 *              is the last. Null on the original.
 */
function bodyFor(
    q: Question, hubUrl: string, nudge: { index: number; total: number; last: boolean } | null = null,
): string {
    const lines: string[] = [];
    /*
     * A NUDGE SAYS SO IN ITS FIRST LINE, and it says it above the question rather than below.
     *
     * The message is otherwise identical to the one he has already seen — same title, same buttons, same
     * everything — so without this it reads as a duplicate, and a channel that appears to repeat itself is a
     * channel that gets muted. "Still waiting on you" is the one fact that is new.
     *
     * "Last call" on the final nudge rather than "2 of 2", because the number he needs is not which nudge
     * this is; it is whether another one is coming. `n of m` makes him do that subtraction himself.
     */
    if (nudge) {
        lines.push(nudge.last
            ? '<b>Last call — still waiting on you.</b>'
            : '<b>Still waiting on you.</b>');
        lines.push('');
    }
    lines.push(`<b>${esc(q.title)}</b>`);
    lines.push(`<i>${esc(q.project)}</i>`);

    /*
     * THE TIMED DEFAULT LEADS, and it is stated as a DURATION rather than as a timestamp.
     *
     * Two changes, both matching what the hub's decision card now does — the default moved from the bottom of
     * the message to the second line, and "Sat, 02 Aug 2026 09:00 UTC" became "in 6h".
     *
     * The position: it is the whole point of the design. Knowing that not answering has a defined, pre-approved
     * outcome is what makes it safe not to answer immediately, and a notification is read in the order it is
     * written — a reader who stops after the title and the context has read the question and missed the only
     * thing that tells them how long they have.
     *
     * The duration: an absolute UTC timestamp is the least readable form of this on a phone. It asks him to know
     * what time it is in UTC and subtract. "In 6h" is the same fact already answered. The absolute time is kept
     * in parentheses for the case where the message is read hours later — a duration in an old message is stale
     * and a timestamp never is, so both are needed and the useful one goes first.
     */
    if (q.default_option && q.deadline) {
        const opt = q.options.find(o => o.key === q.default_option);
        const mins = Math.round((new Date(q.deadline).getTime() - Date.now()) / 60_000);
        const left = mins <= 0 ? null
            : mins < 60 ? `${mins} min`
                : mins < 2880 ? `${Math.round(mins / 60)}h`
                    : `${Math.round(mins / 1440)} days`;
        const when = new Date(q.deadline).toUTCString().slice(5, 22);
        lines.push(
            '',
            left
                ? `<b>In ${left}</b> I'll go with "${esc(opt?.label ?? q.default_option)}" ` +
                  `unless you answer. <i>(${when} UTC)</i>`
                : `<b>Past its deadline</b> — I'll go with "${esc(opt?.label ?? q.default_option)}".`,
        );
        /*
         * THE WHOLE LADDER, IN THE FIRST MESSAGE. See lib/reminders.ts for why this line is the feature.
         *
         * Directly under the default rather than at the bottom, because the two sentences are one fact:
         * what happens if you do nothing, and when. Separating them would put half of it below the context
         * and the option list, where a reader who has already decided has stopped reading.
         *
         * On a nudge it restates only what is LEFT, which is why `ladderSentence` takes an instant. A
         * reminder that repeats the nudge it is currently being would be the message contradicting itself.
         */
        const ladder = ladderSentence(q);
        if (ladder) lines.push(`<i>${esc(ladder)}</i>`);
    }

    if (q.context) lines.push('', esc(q.context));

    /*
     * THE OPTIONS ARE ONLY LISTED IN THE BODY WHEN THEY CARRY DETAIL.
     *
     * The keyboard below already shows every label as a button. Listing them again above it, when a label is all
     * there is to say, is the same fact twice in one message — and the buttons are the version he can act on. So
     * the body lists them only when at least one has a `detail`, which is the case where reading them against
     * each other is the work rather than a duplicate of the keyboard.
     *
     * Same rule and same threshold as the hub's decision card, which switches to a side-by-side comparison on
     * exactly this condition. Two surfaces, one rule.
     */
    if (q.allow.includes('choose') && q.options.some(o => o.detail)) {
        lines.push('');
        for (const o of [...q.options].sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))) {
            lines.push(`• <b>${esc(o.label)}</b>${o.detail ? ` — ${esc(o.detail)}` : ''}`);
        }
    }

    if (q.allow.includes('respond')) {
        lines.push('', `<i>Need to give a value instead? Reply to this message with it.</i>`);
    } else if (q.allow.includes('choose') || q.allow.includes('accept')) {
        /*
         * Say this BEFORE the tap, not just after.
         *
         * A tapped button cannot carry text, so the only way to add a caveat in Telegram is to tap and
         * then reply. If that is only mentioned in the post-tap confirmation, someone who wants to say
         * something alongside their answer has no way of knowing it is possible — they either tap and
         * lose the thought, or go and find the website. The affordance has to be visible while the
         * decision is still being made.
         */
        lines.push('', `<i>Tap an option. If you want to add a condition or a comment, reply to this ` +
            `message afterwards and it will be attached to your answer.</i>`);
    }

    if (hubUrl) lines.push('', `<a href="${hubUrl}">Open the hub</a>`);
    return lines.join('\n');
}

/** Push a question. Returns the Telegram message id so the message can be rewritten when answered. */
export async function sendQuestion(q: Question, hubUrl = ''): Promise<number | null> {
    if (!telegramConfigured()) return null;
    const r = await call<{ message_id: number }>('sendMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: bodyFor(q, hubUrl),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboardFor(q),
    });
    return r.ok && r.result ? r.result.message_id : null;
}

/**
 * NUDGE HIM ABOUT AN UNANSWERED DECISION, BY REWRITING ITS MESSAGE RATHER THAN ADDING ONE.
 *
 * Returns the new message id, or null if nothing was sent. `deleteMessage` + `sendMessage`, not
 * `editMessageText`, and the reason is the whole point of the feature.
 *
 * ==================================================================================================
 * A SILENT EDIT IS NOT A REMINDER, AND THAT IS WHERE THE PRESCRIBED FIX WOULD HAVE LANDED
 * ==================================================================================================
 *
 * `docs/ROADMAP.md` step 1 says to "rewrite the existing Telegram message rather than sending more", and the
 * instinct behind that is right — the alternative is a decision accumulating four messages in the chat, and
 * a channel that repeats itself gets muted, which is the failure this hub is most exposed to (RESEARCH §7
 * cause 5). But `editMessageText` produces **no notification**. The Bot API updates the message in place and
 * the phone stays dark. Implemented literally, the reminder ladder would have been a feature that silently
 * rewrote a message he was not looking at, to tell him about a decision he had already missed — which is
 * exactly the defect it exists to fix, with more code.
 *
 * So the message is rewritten by REPLACEMENT. The old one is deleted and a fresh one sent, which keeps the
 * property the instruction was protecting — **one message per decision in the chat, always, never a growing
 * thread** — and adds the one it cannot have without a send: it reaches him. It also puts the unanswered
 * decision back at the bottom of the chat, which is where an unanswered thing belongs.
 *
 * This is not a new mechanism either: it is exactly what `PATCH /api/agent/questions` already does when a
 * question is re-pushed in a newer format, down to the delete-then-send ordering, so there is one way to
 * replace a question's message rather than two.
 *
 * DELETE FIRST, SEND SECOND, and a failed delete is tolerated: Telegram refuses to delete anything older
 * than 48 hours, so a first nudge on a deadline more than two days out leaves the original message behind.
 * Cosmetic — the old buttons still work, because `callback_data` carries the question id and the server
 * handling the tap is always current.
 */
export async function sendReminder(
    q: Question, nudge: { index: number; total: number; last: boolean }, hubUrl = '',
): Promise<number | null> {
    if (!telegramConfigured()) return null;
    const previous = (q as Question & { tg_message_id?: number | null }).tg_message_id;
    if (previous) await deleteMessage(previous);
    const r = await call<{ message_id: number }>('sendMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: bodyFor(q, hubUrl, nudge),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboardFor(q),
    });
    return r.ok && r.result ? r.result.message_id : null;
}

/**
 * Rewrite an answered question's message in place and drop its buttons.
 *
 * Two reasons this matters more than it looks: the chat becomes a readable record of decisions rather
 * than a wall of dead prompts, and a question that has already been answered can no longer be answered
 * a second time by scrolling back and tapping an old button.
 */
export async function markAnswered(
    q: Question,
    resolutionLine: string,
): Promise<void> {
    if (!telegramConfigured() || !q) return;
    const messageId = (q as Question & { tg_message_id?: number | null }).tg_message_id;
    if (!messageId) return;

    /*
     * The "reply to add a comment" line stays on the message after it is answered, not just in the
     * toast. The toast vanishes in a second; the thought you want to add often arrives a minute later,
     * and by then the only thing still on screen is this message. Keeping the affordance visible is what
     * makes tap-then-comment a real flow rather than a hidden feature.
     */
    await call('editMessageText', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId,
        text:
            `<b>${esc(q.title)}</b>\n<i>${esc(q.project)}</i>\n\n✅ ${esc(resolutionLine)}` +
            `\n\n<i>Reply to this message to add a comment.</i>`,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [] },
    });
}

/**
 * Answer the callback so the client stops spinning. The API requires this call even when there is
 * nothing to tell the user.
 */
export async function ackCallback(callbackQueryId: string, text: string): Promise<void> {
    await call('answerCallbackQuery', { callback_query_id: callbackQueryId, text, cache_time: 0 });
}

/**
 * Remove a message the bot sent. Used when re-pushing a question.
 *
 * Best-effort: Telegram refuses to delete anything older than 48 hours, and a failure here is cosmetic —
 * the old message is superseded by the new one either way, and its buttons stop working because the
 * question is no longer open by the time it matters.
 */
export async function deleteMessage(messageId: number): Promise<boolean> {
    if (!telegramConfigured() || !messageId) return false;
    const r = await call('deleteMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId,
    });
    return r.ok === true;
}

/**
 * Tell him work has arrived — the message that has never existed.
 *
 * WHY THIS IS NEW, AND WHY THAT WAS A BUG RATHER THAN A CHOICE
 *
 * Only questions ever reached Telegram. `app/api/agent/tasks/route.ts` imported nothing from this file, so
 * filing a task notified nobody, for the entire life of the project. He found it the way everything here gets
 * found: *"I haven't received telegram messages even though there have been some new tasks."*
 *
 * It contradicted three documented promises — README ("Telegram messages you when something needs you"),
 * docs/DECISION.md's third reason for owning this at all ("the hub reaches you when something needs you"), and
 * docs/RESEARCH.md §7 cause 5, which calls this channel *the anti-rot mechanism*: the hub does not wait to be
 * visited. A task is by definition work only he can do. Work piling up in silence is the exact failure the
 * design was built to prevent.
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE: BUTTONS.
 *
 * A question gets tappable options because one tap is the whole point. A task does not, because the only action
 * would be "Done" — and a mis-tap on Done writes a lie into the database, which is the failure this project
 * exists to avoid. That is why Done is its own 44px target at the far end of a row and never where a thumb lands
 * by default. It stays a link to the hub.
 *
 * The count is of ACTIONABLE work, matching the header chip and `openTasks` in lib/progress.ts. A blocked task
 * is waiting on somebody else and must never read as something he has failed to do.
 */
export async function sendTaskFiled(
    t: { project: string; title: string; minutes: number | null; steps: unknown[] },
    waiting: number,
    hubUrl = '',
): Promise<boolean> {
    if (!telegramConfigured()) return false;
    const bits = [
        t.minutes != null ? `${t.minutes}m` : null,
        t.steps.length ? `${t.steps.length} step${t.steps.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · ');

    const lines = [
        `<b>${esc(t.project)}</b> filed new work`,
        esc(t.title),
        ...(bits ? [`<i>${bits}</i>`] : []),
        '',
        `${waiting} task${waiting === 1 ? '' : 's'} now waiting on you`,
    ];
    if (hubUrl) lines.push('', `<a href="${hubUrl}">Open the hub</a>`);

    const r = await call('sendMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
    return r.ok === true;
}

/* ------------------------------------------------------------------------------------------------
 * A HELD TOOL CALL — the message with Allow and Deny on it
 * ---------------------------------------------------------------------------------------------- */

/** The narrow shape this file needs. Deliberately not the whole `Approval` — see the note below. */
export interface ApprovalMessage {
    id: string;
    project: string;
    agent: string;
    tool_name: string;
    preview: string | null;
    /** Characters the sanitiser removed. Printed, because a hostile-shaped payload is worth knowing about. */
    stripped: number;
    expires_at: string;
}

/**
 * Push a held tool call. Returns the message id so the message can be rewritten once it is answered.
 *
 * ==================================================================================================
 * THE THREE THINGS THIS MESSAGE HAS TO GET RIGHT
 * ==================================================================================================
 *
 * **The deadline leads, as a duration.** A held agent is burning a ten-minute window, so the first thing
 * after the verb is how long is left and what happens when it runs out. Same reasoning as the timed default
 * on a question — a reader who stops after the first line must have the part that tells them how long they
 * have — except the stakes are inverted: a question's default means not answering has a defined outcome,
 * and here not answering means the work stops and waits at a terminal he is not sitting at.
 *
 * **It says what expiry does.** *"After that it goes back to asking in its terminal"* is the sentence that
 * makes not answering safe, and it is the entire difference between this and every competitor: nothing is
 * aborted and nothing hangs forever. Leaving it out would make a lapsed request feel like a lost one.
 *
 * **The agent's text is quoted, not spoken.** `preview` and `tool_name` are agent-authored — see
 * lib/sanitise.ts — and they are rendered inside a `<code>` block, on their own line, under a label. That
 * is not decoration: prose from an untrusted author, set in the same voice as the hub's own words, is how a
 * payload gets to sound like an instruction from the hub. Quoting it makes the authorship visible.
 *
 * NO OPEN-THE-HUB LINK, and that is the one deliberate omission. Every other message here ends with one.
 * This one has a ten-minute life and two buttons that finish the job in one tap; a link is an invitation to
 * spend ninety seconds loading a page to press the same button, which is the slowest possible route to the
 * only outcome that matters.
 */
export async function sendApproval(a: ApprovalMessage): Promise<number | null> {
    if (!telegramConfigured()) return null;

    const secondsLeft = Math.max(0, Math.round((new Date(a.expires_at).getTime() - Date.now()) / 1000));
    const left = secondsLeft >= 90 ? `${Math.round(secondsLeft / 60)} min` : `${secondsLeft} sec`;

    const lines = [
        `<b>${esc(a.agent)} is waiting on you</b> — ${esc(a.project)}`,
        '',
        `<b>Answer within ${left}.</b> After that it goes back to asking in its terminal, `
        + 'so nothing breaks if this is a bad moment.',
        '',
        `It wants to run <b>${esc(a.tool_name)}</b>:`,
        `<code>${esc(a.preview ?? '(no details given)')}</code>`,
    ];

    /*
     * The removal count, when there is one. This is the single most useful sentence in the message on the
     * one occasion it appears: a preview that arrived carrying invisible characters is a preview that was
     * trying to display as something other than what it is, and that is worth knowing BEFORE tapping Allow
     * rather than after. Silently cleaning it and saying nothing would hide the signal.
     */
    if (a.stripped > 0) {
        lines.push(
            '',
            `⚠️ <b>${a.stripped} hidden character${a.stripped === 1 ? '' : 's'} removed</b> from that text `
            + '— it renders as something other than what it contains. Read it twice.',
        );
    }

    const r = await call<{ message_id: number }>('sendMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
            inline_keyboard: [[
                { text: 'Allow', callback_data: encodeApprovalCallback('allow', a.id) },
                { text: 'Deny', callback_data: encodeApprovalCallback('deny', a.id) },
            ]],
        },
    });
    return r.ok && r.result ? r.result.message_id : null;
}

/**
 * Rewrite a held call's message once it is settled, and take its buttons away.
 *
 * Same two reasons as `markAnswered`: the chat becomes a readable record instead of a wall of dead prompts,
 * and a request that has already been answered — or has lapsed — cannot be answered a second time by
 * scrolling back and tapping. The second matters more here than it does for a question, because the window
 * is ten minutes: a stale Allow button in yesterday's chat is a button that would approve a tool call
 * nobody is holding.
 */
export async function markApprovalSettled(
    messageId: number | null, project: string, toolName: string, line: string,
): Promise<void> {
    if (!telegramConfigured() || !messageId) return;
    await call('editMessageText', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId,
        text: `<b>${esc(toolName)}</b> in <i>${esc(project)}</i>\n\n${esc(line)}`,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [] },
    });
}

export async function sendPlain(text: string): Promise<void> {
    if (!telegramConfigured()) return;
    await call('sendMessage', {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
}
