import { requireAgent } from '../../../../lib/auth';
import { agentsSnippet, BEGIN_MARKER, END_MARKER, POINTER } from '../../../../lib/snippet';
import { fail, json } from '../../../../lib/http';

export const dynamic = 'force-dynamic';

/**
 * Serve the AGENTS.md block, personalised for a project slug.
 *
 *   GET /api/agent/snippet?project=riff-kitchen
 *
 * This is what makes `cc onboard` work from anywhere. Before it existed, onboarding a project meant running
 * a script by absolute path inside this repository — which only worked on one machine, and could not work
 * for a cloud agent at all. Now the text lives in one place, is served by the hub, and both the CLI and the
 * local installer fetch it. There is no second copy to drift.
 */
export async function GET(req: Request) {
    try {
        requireAgent(req);
        const raw = (new URL(req.url).searchParams.get('project') || '').toLowerCase();
        if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(raw)) {
            return json(
                {
                    ok: false,
                    error: '`project` must be a slug: lowercase letters, digits, dot, dash or underscore.',
                },
                400,
            );
        }
        return json({
            ok: true,
            project: raw,
            begin: BEGIN_MARKER,
            end: END_MARKER,
            pointer: POINTER,
            snippet: agentsSnippet(raw),
        });
    } catch (e) {
        return fail(e);
    }
}
