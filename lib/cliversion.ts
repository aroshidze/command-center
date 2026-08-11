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
 */
export const CLI_VERSION = 2;

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
    return 'The CLI on this machine is older than the hub. Two commands, in this order:\n'
        + `  1. curl -fsSL -H "Authorization: Bearer <your agent token>" ${hub}/api/agent/cc.mjs `
        + '-o "$HOME/.command-center/cc.mjs"\n'
        + '  2. node "$HOME/.command-center/cc.mjs" presence on   (in each project folder that has it — '
        + 'the hooks are written by the CLI, so an old settings file stays old)';
}
