import { requireAgent } from '../../../../lib/auth';
import {
    getTask, getTaskByKey, setTaskStatus, taskNotifyDecision, upsertTask,
    type TaskNotifyReason,
} from '../../../../lib/store';
import { sendTaskFiled, telegramConfigured } from '../../../../lib/telegram';
import { fail, json, readJson } from '../../../../lib/http';
import { faultFromRequest, withFault } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * Hand a piece of work to the human.
 *
 *   POST /api/agent/tasks
 *   { project, title, why, minutes, steps: [{do, detail, copy}], verify, gotchas, key, blocked_reason }
 *
 * `verify` is required and the request is rejected without it. That is not pedantry: a task with no way
 * to confirm it worked is a task that comes back as a question later, which is the loop this hub exists
 * to close. The schema's real job is to force the writing agent to answer what it would otherwise skip —
 * exact value, exact place, how it fails, how you know it worked (docs/RESEARCH.md §9.3).
 *
 * `key` makes creation idempotent per project. Send one and a retry after a dropped connection updates
 * the same task instead of leaving a duplicate for a human to tidy up.
 */
export async function POST(req: Request) {
    return withFault(faultFromRequest(req), async () => {
        try {
            requireAgent(req);
            const body = await readJson(req);
            const { task, created } = await upsertTask(body as never);

            /*
             * TELL HIM. This route sent nothing, ever, until now.
             *
             * Only questions reached Telegram — this file imported nothing from lib/telegram — so tasks
             * accumulated in silence and he found out by noticing: "I haven't received telegram messages even
             * though there have been some new tasks." That contradicted README, docs/DECISION.md's third reason
             * for owning this at all, and docs/RESEARCH.md §7 cause 5, which calls this channel the anti-rot
             * mechanism precisely because the hub must not wait to be visited.
             *
             * `created` only. Re-POSTing the same `key` is how an agent EDITS a task (AGENTS.md), and an edit is
             * not an arrival — notifying on it would ping him every time an agent tidied a step.
             *
             * One message per burst, decided in `taskNotifyDecision` from timestamps that already exist. No
             * cron, no new table.
             *
             * BEST-EFFORT, AND THAT ORDERING IS DELIBERATE. The write is already verified and returned by this
             * point. AGENTS.md: "Telegram is best-effort. The record is not." A failed notification must never
             * fail the write, so this cannot throw into the response — and `notified` is reported honestly so an
             * agent can say "filed, but nobody was alerted", exactly as the questions route does.
             */
            let notified = false;
            let notifyReason: TaskNotifyReason = null;
            if (created) {
                try {
                    const d = await taskNotifyDecision(task.id, task.project, !!task.blocked_reason);
                    notifyReason = d.reason;
                    if (d.notify) {
                        if (telegramConfigured()) {
                            notified = await sendTaskFiled(task, d.waiting, process.env.CC_PUBLIC_URL ?? '');
                        } else {
                            // The rule said yes and the channel is off — locally, or misconfigured in
                            // production. Distinguished from `burst` so a suite can tell them apart.
                            notifyReason = 'suppressed';
                        }
                    }
                } catch { /* the task is stored; a silent phone is not a failed write */ }
            }

            return json(
                { ok: true, created, task, notified, notify_reason: notifyReason },
                created ? 201 : 200,
            );
        } catch (e) {
            return fail(e);
        }
    });
}

/**
 * Read one task back in full, including the human's note.
 *
 *   GET /api/agent/tasks?id=t1a2b3c4d
 *   GET /api/agent/tasks?project=riff-kitchen&key=claim-domain
 *
 * Questions had this and tasks did not, which was not merely an asymmetry: a task's `note` was reachable
 * only through an event summary truncated at 200 characters, so a longer reply from the human could not be
 * read by anything. `sync` now returns notes in full as well; this exists for checking one task without
 * a full sync, and for looking up a task by the `key` you created it with.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);
        const params = new URL(req.url).searchParams;
        const id = params.get('id');
        const project = params.get('project');
        const key = params.get('key');

        const task = id
            ? await getTask(id)
            : project && key ? await getTaskByKey(project, key) : null;

        if (!id && !(project && key)) {
            return json({ ok: false, error: 'pass `id`, or both `project` and `key`' }, 400);
        }
        if (!task) return json({ ok: false, error: 'no such task' }, 404);
        return json({ ok: true, task });
    } catch (e) {
        return fail(e);
    }
}

/**
 * Withdraw or re-open a task an agent created.
 *
 * NOTE, because this is easy to get wrong: PATCH only changes `status`. **To change a task's content —
 * its steps, its title, its gotchas — POST it again with the same `key`.** That is an upsert and it keeps
 * the task's identity and its completion history. Dropping and recreating throws the identity away for
 * nothing.
 *
 *   PATCH /api/agent/tasks  { id, status: 'dropped' | 'open' }
 *
 * Agents may not mark a task `done`. Only the human can say they did the thing — an agent deciding on
 * its own that a human task is complete is precisely the "it guessed" failure, and it would make the
 * ticks untrustworthy, which is the trust gap from docs/RESEARCH.md §7.
 */
export async function PATCH(req: Request) {
    try {
        requireAgent(req);
        const body = await readJson(req);
        const id = String(body.id ?? '');
        const status = String(body.status ?? '');
        if (!id) return json({ ok: false, error: '`id` is required' }, 400);
        if (status !== 'dropped' && status !== 'open') {
            return json(
                {
                    ok: false,
                    error: 'status must be "dropped" or "open". Agents cannot mark a task done — only ' +
                        'the human can report having done it.',
                },
                400,
            );
        }
        return json({ ok: true, task: await setTaskStatus(id, status) });
    } catch (e) {
        return fail(e);
    }
}
