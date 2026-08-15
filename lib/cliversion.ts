/**
 * WHICH VERSION OF THE CLI THIS HUB EXPECTS.
 *
 * ==================================================================================================
 * WHY THIS EXISTS, AND IT IS A FAILURE THAT ACTUALLY HAPPENED
 * ==================================================================================================
 *
 * The hub serves its own CLI from `/api/agent/cc.mjs` precisely so the two cannot drift — that route's
 * header says *"serving the CLI means the CLI cannot drift from the hub that answers it either — you always
 * get the version your own hub expects."* That was true about DOWNLOADING and false about everything after
 * it: the file lands at `~/.command-center/cc.mjs` and is a copy from then on.
 *
 * So on 12 August 2026 a hub was deployed with three new hooks and a `cc report` command, and the machine
 * running against it had a CLI from before any of that existed. The hooks in every project were the six an
 * older CLI had written. Nothing was broken, nothing errored, and nothing anywhere said a word — the owner
 * found it by looking at an empty chart and asking why the hub was not working.
 *
 * **A silent version skew is worse than an incompatibility**, because an error tells you what to do.
 *
 * ==================================================================================================
 * WHAT IT IS AND IS NOT
 * ==================================================================================================
 *
 * A single integer, bumped by hand when the CLI gains something the hub relies on — a new subcommand, a new
 * hook, a changed payload. NOT a semver, NOT a build hash, and deliberately not derived from the file: a
 * hash would change on every comment edit and cry wolf, and this has to be believed the one time it fires.
 *
 * **The same number is declared in `cli/cc.mjs`**, because that file may not import anything — zero
 * dependencies and one file is the property that lets it run on a machine with nothing on it. Two
 * declarations of one number is exactly the drift this module is about, so `tests/prove-hooks.mjs` asserts
 * they are equal and the suite fails if a bump lands in one and not the other.
 *
 * ==================================================================================================
 * HISTORY, so a bump is a decision rather than a reflex
 * ==================================================================================================
 *
 *   1  everything up to 11 August 2026. Heartbeat, sub-agent, permission and spend commands.
 *   2  12 August 2026. `cc report` and the three hooks that drive it (Stop, UserPromptSubmit,
 *      Notification), so a hub can show what an agent said and who is waiting. A CLI at 1 cannot report
 *      any of that and `cc presence on` from it writes six hooks instead of nine.
 *   3  12 August 2026. The project is inferred from the project ROOT rather than from whatever directory
 *      an agent happens to be standing in. A CLI at 2 or below invents a project every time it works in a
 *      subfolder — a real hub grew a phantom project called `reports` from
 *      `GAMBLANGO/orchestrator/research/reports`, complete with a page and a "latest word". This is the
 *      bump that most deserves the warning: the damage is silent, it looks like data, and it accumulates.
 *   4  13 August 2026. `cc sync` catches the hub up from the transcript — a heartbeat and the last thing the
 *      assistant said, with its own timestamp. This is the one that makes the hub work WITHOUT hooks, and it
 *      exists because hooks cannot solve the problem it solves: Claude Code reads a project's hooks when a
 *      session starts, so a session already running when they were installed can never report, and sessions
 *      here live for days. A CLI at 3 leaves such a project looking abandoned while somebody works in it.
 *   5  15 August 2026. `cc brief` — where a project stands, filed by the agent that did the work. Bumped
 *      LATE, and that is the entry worth reading: the command shipped at version 4 and the handshake
 *      therefore told every machine it was current while `cc brief` was missing from all of them. See
 *      `CLI_SURFACE` below, which exists so that cannot happen again.
 */
export const CLI_VERSION = 5;

/**
 * ==================================================================================================
 * EVERY SUBCOMMAND AND HOOK THE CLI HAS. Recorded here so a forgotten bump is a failing check.
 * ==================================================================================================
 *
 * THE VERSION HANDSHAKE HAS ONE WEAKNESS AND IT FOUND IT WITHIN A DAY: the number is bumped by hand, and
 * I did not bump it when `cc brief` was added. So the hub and every machine both reported version 4,
 * agreed with each other, and were missing a command — which is worse than no handshake at all, because a
 * check that says "current" is believed.
 *
 * A hash of the whole file would fail on every comment edit and be turned off within a week. What a hub
 * actually depends on is the SURFACE: which subcommands exist and which hooks `presence on` writes. So
 * that is what is recorded, `tests/prove-hooks.mjs` asserts the file still matches, and the failure
 * message says what to do — bump the version, then update this list.
 *
 * Sorted, so a diff is about what changed rather than where it was inserted.
 */
export const CLI_SURFACE = {
    subcommands: [
        'approvals', 'ask', 'backfill', 'brief', 'drop', 'health', 'heartbeat', 'onboard', 'permission',
        'presence', 'report', 'repush', 'setup', 'spend', 'subagent', 'sync', 'task', 'update', 'wait',
    ],
    /** `<event>:<subcommand>` for every hook `cc presence on` and `cc approvals on` install. */
    hooks: [
        'Notification:report', 'PermissionRequest:permission', 'PostToolUse:subagent',
        'PostToolUseFailure:subagent', 'PreToolUse:subagent', 'SessionEnd:heartbeat',
        'SessionStart:heartbeat', 'Stop:report', 'SubagentStop:subagent', 'UserPromptSubmit:report',
    ],
};

/**
 * What a hub tells an agent whose CLI is older than it expects.
 *
 * The two commands, in the order they have to happen, with no placeholders to fill in: re-download, then
 * re-run the hook install in each project that has it. The second one is the part nobody would guess —
 * hooks are written by the CLI, so a new CLI alone does not change a settings file that already exists.
 *
 * Built here rather than in the route so the CLI, `/api/health` and any future surface say the same thing.
 */
export function cliStaleAdvice(hub: string): string {
    /*
     * `cc update` RATHER THAN THE CURL, and that change is the whole lesson of the day this was written.
     *
     * The advice used to be a `curl` with a bearer header, a URL and an output path. Telling somebody is not
     * enough when the remedy is three things to get right at the moment they are annoyed: the fix for the
     * phantom-project bug sat on the hub for an hour while the machine kept inventing phantoms, because
     * nobody re-ran the curl. `cc update` needs no arguments — the hub and the token are already in the
     * config it reads.
     *
     * The hub URL is still interpolated, for the reader who wants to know where the file comes from.
     */
    return 'The CLI on this machine is older than the hub. Two commands, in this order:\n'
        + `  1. node "$HOME/.command-center/cc.mjs" update        (pulls it from ${hub})\n`
        + '  2. node "$HOME/.command-center/cc.mjs" presence on   (in each project folder that has it — '
        + 'the hooks are written by the CLI, so an old settings file stays old)';
}
