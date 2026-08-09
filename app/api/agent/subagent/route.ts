import { requireAgent } from '../../../../lib/auth';
import { recordSubagent } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * ONE SUB-AGENT, spawned or finished.
 *
 *   POST /api/agent/subagent  { project, session, tool_use_id, type, task }             it was spawned
 *   POST /api/agent/subagent  { project, session, tool_use_id, agent_id, ended: true,   it finished
 *                               outcome, tool_calls, edits, lines_added, lines_removed }
 *   POST /api/agent/subagent  { project, session, agent_id, ended: true }               ...in the background
 *
 * ==================================================================================================
 * THE ONE HARD CONSTRAINT THIS ROUTE EXISTS INSIDE
 * ==================================================================================================
 *
 * **One row per sub-agent. Never one per tool call.** A Claude Code session makes hundreds of tool
 * calls and fifteen projects would be tens of thousands of writes a day into the same database `sync`
 * reads from. `docs/BRIEF-NOTHING-BLOCKED.md` §4 refused "a sub-agent event firehose" and the volume
 * half of that refusal is correct and permanent; what was wrong was the other half — *"sub-agents live
 * for seconds, rendering them is motion"* — which the measurements in §XXXII disprove.
 *
 * The constraint is honoured by the HOOK MATCHER rather than by anything here: `cc presence on` writes
 * `PreToolUse` and `PostToolUse` hooks matched to `Task|Agent` alone, so an ordinary Read or Bash call
 * never reaches this route. There is nothing to rate-limit because there is nothing to rate.
 *
 * ==================================================================================================
 * WHY THERE IS NO `GET`
 * ==================================================================================================
 *
 * Nothing an agent does depends on what its siblings are doing, and a read here would be the first
 * step towards agents coordinating through the hub — which is a different product. The rows are read
 * by the page and by nothing else.
 *
 * ==================================================================================================
 * WHAT IT REFUSES TO ACCEPT, FOR THE SAME REASON `presence` DOES
 * ==================================================================================================
 *
 * No `status`, no `summary`, no `result`. `type` and `task` are the harness's own `subagent_type` and
 * `description` — what the parent asked for, read off the tool call — and `outcome` is the harness's
 * word for how the call returned. Nothing here is a sub-agent's account of itself, because an agent
 * asked to describe how its work went describes it favourably, and one such field would poison every
 * other thing on the page. Both strings are sanitised at the boundary regardless: a sub-agent type is
 * defined by a file in the repository, so it is attacker-supplied the moment anyone opens a pull
 * request.
 */
export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const result = await recordSubagent(
            {
                project: body.project,
                session: body.session,
                tool_use_id: body.tool_use_id,
                agent_id: body.agent_id,
                type: body.type,
                task: body.task,
                model: body.model,
                session_model: body.session_model,
                ended: body.ended,
                outcome: body.outcome,
                tool_calls: body.tool_calls,
                edits: body.edits,
                lines_added: body.lines_added,
                lines_removed: body.lines_removed,
            },
            agent,
        );
        /* `saved: true` only after the row has been re-read, like every other write path here. A hook
         * that could not tell a stored sub-agent from a swallowed one would leave the timeline missing
         * blocks with nothing to say so. */
        return json({ ok: true, saved: true, ...result, agent });
    } catch (e) {
        return fail(e);
    }
}
