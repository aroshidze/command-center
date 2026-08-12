import { cookies } from 'next/headers';
import { hasWebSession } from '../../../../lib/auth';
import { finishBySlug } from '../../../../lib/finishes';
import { LOOKS_COOKIE, parseLooks, resolveLooks } from '../../../../lib/looks';
import { LOOKS_SETTING, readLooksPreference, writeSetting } from '../../../../lib/settings';
import { paletteBySlug } from '../../../../lib/palettes';
import { surfaceBySlug } from '../../../../lib/surfaces';
import { deriveWholeRecord, marks as marksOf, standing as standingOf } from '../../../../lib/progress';
import {
    addNote, board, decideApproval, forgetProject, removeNote, answerQuestion, appendAnswerNote,
    setTaskNote, setTaskStatus,
} from '../../../../lib/store';
import { markAnswered, markApprovalSettled } from '../../../../lib/telegram';
import { fail, json, readJson } from '../../../../lib/http';
import { faultFromRequest, withFault } from '../../../../lib/db';
import type { ResponseType } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

/**
 * Everything the human can do from the page, behind one endpoint.
 *
 * One endpoint rather than six because the page is a single screen with no navigation, and because the
 * important property is uniform: every action returns the row the database actually holds afterwards.
 * The page shows "saved" only after reading that back — never optimistically. See lib/db.ts.
 */
export async function POST(req: Request) {
    // Fault injection is scoped to this request and inert unless explicitly enabled outside production.
    // See lib/db.ts and tests/prove-failures.mjs.
    return withFault(faultFromRequest(req), () => handle(req));
}

async function handle(req: Request) {
    try {
        if (!(await hasWebSession())) {
            return json({ ok: false, error: 'not signed in on this device' }, 401);
        }

        const body = await readJson(req);
        const action = String(body.action ?? '');

        switch (action) {
            case 'task.done':
            case 'task.reopen': {
                const task = await setTaskStatus(
                    String(body.id ?? ''), action === 'task.done' ? 'done' : 'open',
                );
                return json({ ok: true, saved: true, task });
            }

            case 'task.note': {
                const task = await setTaskNote(String(body.id ?? ''), String(body.note ?? ''));
                return json({ ok: true, saved: true, task });
            }

            case 'question.answer': {
                const id = String(body.id ?? '');
                const type = String(body.type ?? '') as ResponseType;
                const question = await answerQuestion(id, {
                    type,
                    option: body.option == null ? null : String(body.option),
                    text: body.text == null ? null : String(body.text),
                    // Optional, and allowed with any answer type — including a tapped option.
                    note: body.note == null ? null : String(body.note),
                });

                // Rewrite the Telegram message so the thread stays a record of decisions, and so an old
                // button cannot be tapped later to answer an already-answered question.
                const label = question.answer_option
                    ? question.options.find(o => o.key === question.answer_option)?.label ??
                      question.answer_option
                    : null;
                const line = question.status === 'ignored' ? 'Not now — answered on the hub'
                    : type === 'respond' ? `You replied: ${question.answer_text}`
                        : type === 'accept' ? 'You approved this'
                            : `You chose: ${label}`;
                await markAnswered(
                    question,
                    question.answer_note ? `${line}\n\nYou added: ${question.answer_note}` : line,
                );

                return json({ ok: true, saved: true, question: { ...question, tg_message_id: undefined } });
            }

            /*
             * A comment added AFTER the answer, from the hub.
             *
             * The equivalent of replying to an answered question in Telegram. Needed for the same reason:
             * the caveat often arrives after the decision, and it should attach to that decision rather
             * than float off as an unrelated note.
             */
            case 'question.comment': {
                const question = await appendAnswerNote(
                    String(body.id ?? ''), String(body.note ?? ''),
                );
                return json({ ok: true, saved: true, question: { ...question, tg_message_id: undefined } });
            }

            /*
             * ALLOW OR DENY A HELD TOOL CALL, from the hub rather than from Telegram.
             *
             * The one action here that is not about a task, a question or a note — and the reason it is
             * allowed in is that it is answered in MINUTES rather than days, which is what stops it from
             * living on a page. It never touches the counts and it is never a task or a question; see the
             * `approvals` table in scripts/schema.sql for why the separate table is the enforcement rather
             * than a comment promising it.
             *
             * `decideApproval` refuses anything that is not still pending, so a double-tap and a tap after
             * the ten-minute window are both reported honestly instead of being silently applied. The second
             * is the one that matters: by then the agent has handed back to its terminal, so an accepted
             * decision would be a button that lies about having done something.
             */
            case 'approval.decide': {
                const id = String(body.id ?? '');
                const wanted = String(body.decision ?? '');
                if (wanted !== 'allow' && wanted !== 'deny') {
                    return json({ ok: false, error: 'decision must be "allow" or "deny"' }, 400);
                }
                const approval = await decideApproval(
                    id, wanted === 'allow' ? 'allowed' : 'denied', 'web',
                );

                /*
                 * Rewrite the Telegram message so the thread stays a record and its buttons stop working.
                 * Best-effort, after the write: a dead notification channel must never fail a decision that
                 * has already been stored, which is the rule the whole of lib/telegram.ts follows.
                 */
                await markApprovalSettled(
                    approval.tg_message_id,
                    approval.project,
                    approval.tool_name,
                    wanted === 'allow' ? 'Allowed — answered on the hub' : 'Denied — answered on the hub',
                );

                return json({ ok: true, saved: true, approval });
            }

            case 'note.add': {
                const note = await addNote(String(body.body ?? ''), 'web', body.project ?? null);
                return json({ ok: true, saved: true, note });
            }

            /*
             * WITHDRAW A NOTE HE WROTE. The one delete in the whole interface, and it needs the argument.
             *
             * `docs/API.md` and the fixture both say there is no delete endpoint and there should not be one,
             * and that stays true for everything an AGENT owns: a task an agent filed is a record of work, and
             * dropping it is a status change so the history survives. This is different in two ways. It is HIS
             * text, and it is the only thing on the page he authored — a channel you can write to and never
             * take back is one you write to carefully rather than freely, which is the opposite of what the
             * outbound half needs.
             *
             * It arrived with a concrete need rather than as a completion of the CRUD set: production's
             * outbound surface was headlined by "Proof note at 2026-07-29T23:00:52.867Z", left behind by a
             * proof run months earlier, credited to a test agent. There was no way to remove it — the
             * production connection string exists only in Vercel — so the alternative to this was a permanent
             * piece of test residue in the most prominent position of a surface built to be trusted.
             *
             * THE EVENT SURVIVES, DELIBERATELY. `note.created` stays in the log, because agents were already
             * handed it and deleting it would rewrite what they were told. The hub's list reads the `notes`
             * table; the agent contract reads `events`. Withdrawing a note removes it from HIS view of what he
             * has said and does not pretend it was never sent.
             */
            /*
             * FORGET A SLUG THAT WAS NEVER A PROJECT. The second delete in this interface, and the reasoning
             * is on `forgetProject` in lib/store.ts — including why it refuses the moment a task or a
             * decision exists, which is what makes it unable to lose anything anybody authored.
             *
             * Here rather than on an agent route on purpose: deciding that a project is a phantom is a
             * judgement only the human can make, and this door needs the web session.
             */
            case 'project.forget': {
                const slug = String(body.project ?? '');
                if (!slug) return json({ ok: false, error: '`project` is required' }, 400);
                const gone = await forgetProject(slug);
                return json({ ok: true, saved: true, ...gone });
            }

            case 'note.remove': {
                const id = String(body.id ?? '');
                if (!id) return json({ ok: false, error: '`id` is required' }, 400);
                const gone = await removeNote(id);
                if (!gone) return json({ ok: false, error: 'no such note' }, 404);
                return json({ ok: true, saved: true, id });
            }

            /*
             * CHOOSE AN UNLOCKED LOOK. The entitlement check is the whole point of doing this server-side.
             *
             * Setting the cookie in the browser would have been one line in the component. It would also have
             * made every unlock decoration: the cookie is user-editable, so anyone able to open dev tools would
             * have all six palettes, and a reward you can help yourself to is not a reward.
             *
             * So the request names a palette and the server decides. It recomputes his standing and marks from
             * the rows — the same derivation the level bar and the emblem use, no stored grant to consult — and
             * refuses anything he has not earned, by name, with the requirement. Then it sets the cookie itself
             * and reports which look is actually in force, so the page shows the server's answer rather than the
             * button's intention.
             *
             * A 403 rather than a 400: the palette is a real palette and the request is well formed. He simply
             * has not earned it yet, and that distinction is the difference between "you typed something wrong"
             * and "keep going".
             */
            case 'looks.set': {
                /*
                 * THREE AXES NOW, AND SETTING ONE MUST NOT RESET THE OTHER TWO.
                 *
                 * The single-axis version built a whole `Looks` from the request — `{ palette: wanted }` — which
                 * was correct when there was one field and would silently throw away his crest finish and his
                 * surface now that there are three. So the existing cookie is read, the one axis named by the
                 * request is overridden, and the whole thing goes back through `resolveLooks`, which checks every
                 * axis independently.
                 *
                 * Re-validating ALL THREE on every write rather than only the one being changed, deliberately: a
                 * perk can be LOST — re-open a task, the points fall, and a level-gated look stops being his —
                 * so a cookie that was legitimate when it was written may not be now. Checking only the new axis
                 * would let a stale choice on another one survive indefinitely.
                 */
                const kind = String(body.kind ?? 'palette');
                const wanted = String(body.slug ?? body.palette ?? '');
                if (!['palette', 'crest', 'surface'].includes(kind)) {
                    return json({ ok: false, error: `unknown look kind "${kind}"` }, 400);
                }
                const exists = kind === 'palette' ? !!paletteBySlug(wanted)
                    : kind === 'crest' ? !!finishBySlug(wanted)
                        : !!surfaceBySlug(wanted);
                if (!exists) {
                    return json({ ok: false, error: `There is no ${kind} called "${wanted}".` }, 400);
                }

                const state = await board();
                /*
                 * THE WHOLE RECORD, NOT THE WINDOW. This deciding whether a look is his while looking at the
                 * most recent sixty completions is how he gets REFUSED a look he earned a year ago — the
                 * `/looks` defect (§XXVII) in its expensive form, because this one is a write path.
                 */
                const progress = deriveWholeRecord(state);
                const current = parseLooks(
                    await readLooksPreference((await cookies()).get(LOOKS_COOKIE)?.value),
                );
                const { looks, refused } = resolveLooks(
                    { ...current, [kind]: wanted }, standingOf(progress), marksOf(progress),
                );
                if (refused) return json({ ok: false, error: refused }, 403);

                /*
                 * CHOOSING A LOOK ALSO COUNTS AS HAVING BEEN TOLD ABOUT IT.
                 *
                 * Otherwise the banner keeps announcing something he is currently looking at, which is the hub
                 * telling him news he has already acted on — and the fastest way to teach him to ignore it.
                 */
                const seen = looks.seen.includes(wanted) ? looks.seen : [...looks.seen, wanted];

                /*
                 * THE TABLE IS THE TRUTH, AND THE COOKIE IS NO LONGER WRITTEN.
                 *
                 * Keeping both would have been the tempting half-measure, and it reintroduces the bug this
                 * replaces: a look chosen on the desktop, and a phone still holding its own year-long cookie
                 * showing the old one until that cookie expires. Two stores for one preference means a
                 * precedence rule, and every precedence rule here is wrong on some device.
                 *
                 * `writeSetting` goes through `writeVerified`, so this line cannot report a saved look the
                 * database did not accept. If it throws, the catch below turns it into an honest error rather
                 * than an applied-looking change that is gone on the next load. Existing cookies keep working
                 * as a read fallback until the first write lands — see readLooksPreference.
                 */
                await writeSetting(LOOKS_SETTING, JSON.stringify({ ...looks, seen }));

                return json({ ok: true, saved: true, looks: { ...looks, seen } }, 200);
            }

            default:
                return json({ ok: false, error: `unknown action "${action}"` }, 400);
        }
    } catch (e) {
        return fail(e);
    }
}
