import { requireAgent } from '../../../../lib/auth';
import { projects, putSpend, SPEND_ELSEWHERE } from '../../../../lib/store';
import { fail, json, readJson } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * WHERE THE MONEY GOES, POSTED BY A LOCAL SUMMARISER.
 *
 *   GET  /api/agent/spend    the project slugs the hub knows about, so the CLI can attribute
 *   POST /api/agent/spend    { source, rows: [{ path[], model, …tokens }] }
 *
 * ==================================================================================================
 * WHY THE CLI SENDS A PATH AND THE HUB DECIDES WHICH PROJECT IT IS
 * ==================================================================================================
 *
 * Claude Code's usage records are keyed by `cwd`, and a cwd is not a project. On this machine the same
 * fourteen projects produce **46 distinct cwd keys**: `Mixico`, `Mixico\VibeSyncAI` and a case-different
 * `mixico` are three keys for one project, and there are cwds four levels deep inside a `node_modules`
 * folder.
 *
 * The hub already answers "which projects exist" — `projects()`, derived from the event log — so the CLI
 * sends the slugified path segments, deepest first, and the attribution happens HERE, next to that answer.
 * The alternative was the CLI guessing, which would have put the definition of "which project is this" in
 * two places and let the spend figure disagree with the queue about the same folder.
 *
 * ==================================================================================================
 * ANYTHING IT CANNOT ATTRIBUTE IS REPORTED, NEVER DROPPED AND NEVER GUESSED
 * ==================================================================================================
 *
 * A path whose segments match no known project becomes the slug `(elsewhere)`, which the page states as its
 * own line. Both alternatives are worse: dropping it makes the total quietly wrong, and attributing it to
 * the deepest segment invents a project the hub has never heard of and would put `node_modules` in the
 * project list. `(elsewhere)` is not a valid project slug — `PROJECT_RE` rejects the parentheses — so it can
 * never collide with a real one, and the page can find it by name to render it differently.
 */


export async function GET(req: Request) {
    try {
        requireAgent(req);
        const known = await projects();
        return json({ ok: true, projects: known.map(p => p.slug) });
    } catch (e) {
        return fail(e);
    }
}

export async function POST(req: Request) {
    try {
        const agent = requireAgent(req);
        const body = await readJson(req);
        const rows = Array.isArray(body.rows) ? body.rows : null;
        if (!rows) return json({ ok: false, error: '`rows` must be an array' }, 400);

        const known = new Set((await projects()).map(p => p.slug));

        /*
         * WALK THE PATH OUTWARD-IN, taking the first segment the hub recognises.
         *
         * Deepest first, so a genuine sub-project wins over its parent when both are known — if he ever
         * onboards `VibeSyncAI` in its own right, its sessions stop being folded into `Mixico` on the next
         * run with no change here. Until then they fold outward to the project that does exist, which is the
         * answer he would give if asked.
         */
        const attributed: { project: string; raw: Record<string, unknown> }[] =
            rows.map((raw: Record<string, unknown>) => {
                const segments = Array.isArray(raw.path) ? raw.path.map(s => String(s).toLowerCase()) : [];
                return { project: segments.find(s => known.has(s)) ?? SPEND_ELSEWHERE, raw };
            });

        /*
         * Collapsed to one row per (project, model) HERE rather than in the CLI, because the fold is the
         * consequence of the attribution above: three cwds under one project have to become one row, and
         * only this side knows they were the same project.
         */
        const COUNTERS = ['input_tokens', 'output_tokens', 'cache_write_5m', 'cache_write_1h',
            'cache_read', 'samples'] as const;
        type Merged = { project: string; model: string } & Record<typeof COUNTERS[number], number>;

        const merged = new Map<string, Merged>();
        for (const { project, raw } of attributed) {
            const model = String(raw.model ?? 'unknown');
            const key = `${project}|${model}`;
            const into: Merged = merged.get(key) ?? {
                project,
                model,
                input_tokens: 0,
                output_tokens: 0,
                cache_write_5m: 0,
                cache_write_1h: 0,
                cache_read: 0,
                samples: 0,
            };
            for (const f of COUNTERS) {
                /* `|| 0` catches NaN from a non-numeric field, and the clamp catches a negative one. Both
                 * would otherwise poison a total silently, and a negative token count is the shape that
                 * would make one project appear to have cost nothing. */
                into[f] += Math.max(0, Math.round(Number(raw[f] ?? 0)) || 0);
            }
            merged.set(key, into);
        }

        const result = await putSpend(String(body.source ?? agent), [...merged.values()]);

        const unattributed = [...merged.values()].filter(r => r.project === SPEND_ELSEWHERE).length;
        return json({
            ok: true,
            saved: true,
            ...result,
            /* Said out loud so `cc spend` can print it. A summariser that folded a third of the machine's
             * usage into "elsewhere" without saying so would report a total he could not reconcile with
             * anything, and the fix — onboarding the missing project — is one he can only make if told. */
            unattributed_models: unattributed,
            known_projects: known.size,
        });
    } catch (e) {
        return fail(e);
    }
}
