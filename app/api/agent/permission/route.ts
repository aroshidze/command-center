import { requireAgent } from '../../../../lib/auth';
import {
    expireApprovals, getApproval, requestApproval, setApprovalMessageId,
} from '../../../../lib/store';
import { sendApproval, telegramConfigured } from '../../../../lib/telegram';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * THE PERMISSION RELAY — the feature every competing product in this category exists for.
 *
 *   POST /api/agent/permission          file a held tool call, push it to Telegram
 *   GET  /api/agent/permission?id=…     has it been answered yet
 *
 * ==================================================================================================
 * THE PAIN, QUOTED, BECAUSE IT IS THE WHOLE JUSTIFICATION
 * ==================================================================================================
 *
 * A competitor's author: *"I had Claude Code running a large refactor and been sitting idle for 15 minutes,
 * waiting for me to press yes."* Until now this hub did not touch that at all.
 *
 * ==================================================================================================
 * WHY THE HUB DOES NOT HOLD THE CONNECTION, WHICH IS THE ONE THING THE BRIEF GOT WRONG
 * ==================================================================================================
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §3.2 prescribes an `http` hook that POSTs here and holds. It cannot work
 * that way, and finding out why changed the design:
 *
 *   **A hook's budget is 600 seconds and a serverless function's is not.** This deployment is Vercel Pro,
 *   where an invocation caps at 300 — so a hub that held the connection would make the promise *"answer
 *   within five minutes, if your plan allows"*, and the honest ten-minute promise would be impossible to
 *   keep on any plan.
 *
 * So the hold is LOCAL. `cc permission` posts here once, gets an id, and then polls `GET` every few seconds
 * until the decision lands or its own budget runs out. Three consequences, all of them better than the
 * original design:
 *
 *   1. **The token never moves.** An `http` hook needs the agent token in `.claude/settings.local.json` or
 *      in an env var. A `command` hook needs neither — `cc` reads `~/.command-center/config.json`, written
 *      at mode 0600, and AGENTS.md is explicit that the config belongs nowhere near a repo. The file this
 *      feature adds to a project therefore contains no credential and is safe to commit.
 *   2. **The clock belongs to the party that can honour it.** "Hands back at ten minutes" is a promise about
 *      a deadline, and only the process that is waiting can keep it.
 *   3. **Each request here is milliseconds**, so this works on a free plan and burns no held compute.
 *
 * ==================================================================================================
 * EVERY NON-NEGOTIABLE FROM §3.2, AND WHERE IT IS ENFORCED
 * ==================================================================================================
 *
 * - **Opt-in per project, off by default** — there is no hook until somebody runs `cc approvals on` in that
 *   project. Nothing here enables anything.
 * - **Never a task or a question** — its own table, and no `events` row, so it cannot reach `changed` in a
 *   sync. See the comment at the end of `requestApproval`.
 * - **Never in the counts** — nothing `board()` counts reads `approvals`.
 * - **Expires visibly** — the row goes to `expired` rather than being deleted, and the band above the queue
 *   says so. `expireApprovals` runs on this route's own GET, which is the read that happens most.
 * - **Sanitised** — at the boundary, in `requestApproval`, before the row exists. lib/sanitise.ts has the
 *   attack list.
 * - **Says what the token means** — docs/SETUP.md and lib/auth.ts, because whoever holds `CC_WEB_TOKEN` can
 *   now approve tool calls in his sessions, and that is a real widening of what that token does.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);

        const { approval, created } = await requestApproval(
            {
                project: body.project,
                tool_use_id: body.tool_use_id,
                tool_name: body.tool_name,
                preview: body.preview,
                session: body.session,
            },
            agent,
        );

        /*
         * A RE-POST DOES NOT NOTIFY AGAIN, which is the same rule an edited task follows. `cc permission`
         * posts once and then polls, so a second POST means its connection dropped — and a second Telegram
         * message about one held tool call would be the muted-channel failure arriving inside the feature
         * that most needs the channel to be un-muted.
         */
        let notified = false;
        if (created && telegramConfigured()) {
            const messageId = await sendApproval(approval);
            if (messageId != null) {
                await setApprovalMessageId(approval.id, messageId);
                notified = true;
            }
        }

        /*
         * `notified` and `notify_reason` are returned for the reason `taskNotifyDecision` gives at length:
         * locally the channel is suppressed, so without a reason on the wire a check could not tell "the
         * rule said no" from "sending is switched off" — and here it matters to the AGENT too. A hook that
         * knows nobody was told can print that instead of waiting ten minutes in silence, which turns the
         * worst case from a stall into an immediate terminal prompt.
         */
        return json({
            ok: true,
            saved: true,
            id: approval.id,
            created,
            status: approval.status,
            expires_at: approval.expires_at,
            notified,
            notify_reason: notified ? null : !created ? 'already-filed' : 'no-channel',
        });
    } catch (e) {
        return fail(e);
    }
}

/**
 * Has it been answered? The call the held hook makes every few seconds.
 *
 * `expireApprovals()` runs here rather than only on the page, and that is the lazy-on-read path doing its
 * best work: the process most interested in the deadline is the one asking, so "whoever reads next" is
 * guaranteed to be the party that needs the expiry applied. No cron, for the reason AGENTS.md gives.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);
        const id = new URL(req.url).searchParams.get('id');
        if (!id) return json({ ok: false, error: '`id` is required' }, 400);

        await expireApprovals();
        const approval = await getApproval(id);
        if (!approval) return json({ ok: false, error: `no request with id "${id}"` }, 404);

        return json({
            ok: true,
            id: approval.id,
            status: approval.status,
            decided_by: approval.decided_by,
            expires_at: approval.expires_at,
            /* Seconds, so the hook can decide whether another poll is worth making rather than parsing a
             * timestamp and trusting that its own clock agrees with the server's. */
            seconds_left: Math.max(
                0, Math.round((new Date(approval.expires_at).getTime() - Date.now()) / 1000),
            ),
        });
    } catch (e) {
        return fail(e);
    }
}
