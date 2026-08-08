import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireAgent } from '../../../../lib/auth';
import { fail } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * Serve the CLI itself, so a machine with nothing on it can get one.
 *
 *   GET /api/agent/cc.mjs   →   the contents of cli/cc.mjs, as text
 *
 * WHY THIS EXISTS
 *
 * Every route to a working machine used to assume one of two things: that this repository was checked out, or
 * that `cc.mjs` was already at `~/.command-center/`. There was no documented way to get from *nothing* to a
 * working CLI — and on 3 August the empty hub started pointing every new person at `/setup`, whose first
 * instruction was the installer, which needs the repo. One level below the gap that closed, there was still a
 * gap. With this route, step zero on any machine is two commands with no repo, no npm and no clone:
 *
 *   mkdir -p "$HOME/.command-center"
 *   curl -fsSL -H "Authorization: Bearer <token>" <hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"
 *   node "$HOME/.command-center/cc.mjs" setup <hub> <agent-token>
 *
 * `"$HOME"` rather than `~`, everywhere this command appears: curl does not expand a tilde, the shell does, and
 * PowerShell does not do it inside an argument — so the tilde form exits 23 with "client returned ERROR on write"
 * and creates nothing. It shipped that way on /setup and failed on the first machine that ran it.
 *
 * It is the pattern this project already chose and already defends, applied one layer down. The hub serves the
 * AGENTS.md snippet from `lib/snippet.ts` precisely so the instructions cannot drift from the code; serving the
 * CLI means the CLI cannot drift from the hub that answers it either — you always get the version your own hub
 * expects. It also works for a cloud agent that has no repository and never will, which is the case
 * `scripts/install-into-project.mjs` says in its own comments it was trying to solve and could not.
 *
 * WHY IT REQUIRES THE AGENT TOKEN, since serving it openly would leak nothing once the repo is public
 *
 * The brief left this open and said an undecided answer was the only wrong one. Three reasons:
 *
 *   1. It costs nothing. The very next command is `cc setup <hub> <agent-token>`, so whoever runs the curl
 *      already has the token in hand. One extra header, and not one extra secret to obtain.
 *   2. It turns step zero into a token check, which is a real benefit rather than tidiness. A 401 here says
 *      "your token is wrong" at the FIRST command. Unauthenticated, a wrong token gets silently written into
 *      `~/.command-center/config.json` by `cc setup` and fails later at `cc health`, one layer away from its
 *      cause.
 *   3. One rule for every `/api/agent/*` route, with no exception to remember. An exempt route is the one an
 *      audit forgets, and it is the one a later change quietly makes serve something it should not.
 *
 * WHY IT READS THE FILE INSTEAD OF IMPORTING IT
 *
 * `cli/cc.mjs` is a program, not a module — it runs a switch over `process.argv` at import time and must stay
 * that way, because zero dependencies and one file is the property that keeps it working. Reading it means the
 * bytes served are the file on disk rather than a second copy compiled in, so there is nothing to drift.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);

        /*
         * `process.cwd()` is the project root under `next dev`, `next start` and on Vercel's Node runtime.
         * `cli/cc.mjs` is not imported by anything, so nothing else pulls it into the deployment — which is
         * what `outputFileTracingIncludes` in next.config.ts exists to force. If this ever 404s in
         * production and works locally, that setting is the first place to look.
         */
        const source = await readFile(join(process.cwd(), 'cli', 'cc.mjs'), 'utf8');

        return new Response(source, {
            status: 200,
            headers: {
                /*
                 * text/plain, not application/javascript: this is downloaded with curl and written to disk,
                 * never executed by a browser, and a Content-Type that invites a browser to run it is a
                 * larger promise than this route wants to make.
                 */
                'content-type': 'text/plain; charset=utf-8',
                'content-disposition': 'attachment; filename="cc.mjs"',
                /*
                 * Never cached. The whole argument for serving it here is that you get the version your hub
                 * expects; a cached copy from two deployments ago is exactly the drift this route prevents.
                 */
                'cache-control': 'no-store',
            },
        });
    } catch (e) {
        return fail(e);
    }
}
