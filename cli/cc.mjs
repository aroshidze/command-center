#!/usr/bin/env node
/**
 * cc — the agent's side of the Command Center.
 *
 * WHY A SHELL COMMAND AND NOT AN MCP SERVER
 *
 * Every agent in rotation — Claude Code, Codex, Cursor, Antigravity — can run a shell command. Not all of
 * them speak the same MCP revision, and MCP's largest breaking change shipped on 28 July 2026 (sessions
 * retired, HTTP+SSE transport deprecated). A shell command is 100% compatible today with zero spec risk.
 * See docs/RESEARCH.md §4. An MCP wrapper over this same HTTP API can be added later; nothing is wasted.
 *
 * Zero dependencies on purpose. Node 18+ and nothing else, so this file keeps working after a dependency
 * you have never heard of is deprecated.
 *
 * ALL FOURTEEN COMMANDS. This list said seven for two releases — `onboard` and `repush` were missing, and
 * `onboard` is the one the hub's own setup page tells agents to run first. The runtime `--help` at the bottom
 * of this file was complete the whole time, so the only thing wrong was the documentation at the top, which is
 * the copy a person reads when they open the file to find out what it does.
 *
 * THE FIRST NINE are the hub's original contract: work, decisions, and reading the answers back.
 *
 *   cc sync                     what changed since I last looked   ← the one to remember
 *   cc ask   '<json>'           ask the human a decision, do not block
 *   cc task  '<json>'           hand the human a piece of work
 *   cc onboard                  connect the project in this folder to the hub
 *   cc wait  <question-id>      block until answered (or the timed default fires)
 *   cc repush --open            resend open questions in the current Telegram format
 *   cc drop  <task-id>          withdraw a task that is no longer needed
 *   cc health                   is the hub actually working
 *   cc setup <url> <token>      write the config for this machine
 *
 * THE REST ARE THE LOCAL COLLECTOR, and every one of them is OPT-IN. A project that runs none of these
 * behaves exactly as it did before they existed, which is the point: the setup story for somebody who wants
 * none of this is the same length it was.
 *
 *   cc presence  on|off|status  install the activity, sub-agent and report hooks in THIS project
 *   cc approvals on|off|status  install the permission-relay hook in THIS project
 *   cc spend                    read Claude Code's usage records and post per-project totals
 *   cc heartbeat                (called BY a hook, reads its JSON on stdin — not for a human)
 *   cc subagent                 (called BY a hook — one row per sub-agent, never per tool call)
 *   cc permission               (called BY a hook — holds the tool call while he decides)
 *
 * Add --json to any read command for machine-readable output, and --dry to `presence`, `approvals`,
 * `onboard` or `spend` to see what would happen without doing it.
 *
 * HOW TO GET THIS FILE ONTO A MACHINE THAT DOES NOT HAVE IT: the hub serves it.
 *
 *   mkdir -p "$HOME/.command-center"
 *   curl -fsSL -H "Authorization: Bearer <token>" <hub>/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"
 *   node "$HOME/.command-center/cc.mjs" setup <hub> <agent-token>
 *
 * No repository, no npm, no clone — see app/api/agent/cc.mjs/route.ts. The version you get is the one your
 * own hub is running, which is the point.
 *
 * In PowerShell that is "$HOME/.command-center/cc.mjs". `"$HOME"` and NOT `~`: curl does not expand
 * a tilde, the shell does, and PowerShell does not do it inside an argument — the tilde form exits 23 with
 * "client returned ERROR on write" having created nothing.
 */

import {
    closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.command-center');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * WHICH VERSION OF THIS FILE THIS IS. Sent on every sync so the hub can say when it is stale.
 *
 * THE FAILURE THIS EXISTS FOR HAPPENED. The hub serves this file from `/api/agent/cc.mjs` so the two cannot
 * drift — but the download lands at `~/.command-center/cc.mjs` and is a COPY from then on. A hub deployed
 * with three new hooks and a `cc report` command met a machine running a CLI from before any of it existed,
 * and nothing errored, nothing warned, and the owner found out by looking at an empty chart.
 *
 * `lib/cliversion.ts` declares the same number for the hub's side and carries the history of what each bump
 * meant. It cannot be imported here — this file has zero dependencies on purpose, which is what lets it run
 * on a machine with nothing on it — so `tests/prove-hooks.mjs` asserts the two are equal instead.
 *
 * BUMP IT when this file gains something a hub relies on: a subcommand, a hook, a changed payload.
 */
const CLI_VERSION = 4;

/**
 * ==================================================================================================
 * WHICH PROJECT AM I IN? THE ROOT, NOT THE FOLDER I HAPPEN TO BE STANDING IN.
 * ==================================================================================================
 *
 * THE DEFECT THIS FIXES CREATED A PROJECT OUT OF NOTHING. His words: *"Another project appeared on the agents
 * page but there is no such project. NO SUCH PROJECT! This is most probably one of the reports from the
 * Gamblango project. Why the fuck is it opened as a separate project?"*
 *
 * It was. An agent working in `d:\Antigravity\GAMBLANGO\orchestrator\research\reports` fired hooks whose
 * project was the last segment of the working directory — `reports`. So the hub grew a project with a name,
 * a page, a run and a "latest word", and none of it existed. Agents change directory constantly; with the
 * per-turn report hooks now firing, EVERY subdirectory an agent works in was one turn away from becoming a
 * phantom project.
 *
 * THE SAME WRONG LINE WAS WRITTEN EIGHT TIMES, which is why the bug was everywhere at once, and it is the
 * real lesson: the rule for "what is a project" was a one-liner copied into every command instead of a
 * function. One function now, and every caller uses it.
 *
 * ==================================================================================================
 * `.git` OR `.claude`, WALKING UP, AND WHY THOSE TWO
 * ==================================================================================================
 *
 * Both mean "somebody treated this directory as the top of something". `.git` is nearly universal and
 * `.claude` is written by `cc presence on` and by Claude Code itself, so a project that has been connected to
 * this hub has one by definition. Checked at each level going up, nearest first — a nested repository is a
 * real project and should win over its parent.
 *
 * MEASURED BEFORE CHOOSING THEM, because a marker in a shared parent would be catastrophic in the opposite
 * direction: every project on the machine would collapse into one name. `d:\Antigravity` has neither, and
 * `GAMBLANGO` has `.claude`, so the walk stops exactly where it should on the machine this broke on.
 *
 * A PROJECT WITH NEITHER MARKER BEHAVES EXACTLY AS BEFORE — the basename of where you are. That is the
 * honest fallback: with no evidence of a root, the old guess is the only guess available, and it is right
 * whenever the agent is standing in the project folder, which is what every instruction tells it to do.
 */
function projectRoot(from) {
    const start = String(from || process.cwd());
    let dir = start;
    /* Twenty-four levels is deeper than any real checkout and is a guard against a symlink loop rather than
     * a judgement about paths. */
    for (let i = 0; i < 24; i++) {
        try {
            if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
        } catch { /* an unreadable directory is not a root; keep walking */ }
        const up = dirname(dir);
        if (!up || up === dir) break;
        dir = up;
    }
    return start;
}

/** The project slug for a working directory: the root's folder name, slugified the one way. */
function projectFrom(cwd) {
    return slugify(projectRoot(cwd).split(/[\\/]/).filter(Boolean).pop() || '');
}

/**
 * ==================================================================================================
 * CATCH THE HUB UP FROM THE TRANSCRIPT — the half that works when the hooks cannot.
 * ==================================================================================================
 *
 * THE PROBLEM THIS SOLVES IS STRUCTURAL AND HOOKS CANNOT SOLVE IT. Claude Code reads a project's hooks
 * when a session STARTS. So a session that was already running when `cc presence on` was run will never
 * report anything, for as long as it lives — and his sessions live for days. He watched a project he was
 * actively working in show *"Nothing has looked at gamblango since 11 Aug"* and a latest word 20 hours old,
 * and asked the right question: *"How can we make sure it always works?"*
 *
 * Not with a hook. Whatever we install is read at the start of a session that has already started.
 *
 * WHAT DOES ALWAYS WORK IS AN AGENT RUNNING A COMMAND. `cc sync` is the command the snippet instructs
 * agents to run at the start of every session AND several times during it. So the sync itself carries the
 * catch-up: it reads the transcript Claude Code is writing anyway and posts what it finds. No hooks, no
 * restart, no new event, and it self-heals — every sync makes the hub current again.
 *
 * WHAT IT POSTS, AND WHY EACH IS DEFENSIBLE
 *
 *   - a heartbeat, so presence stops saying nothing has looked at a project somebody is working in. Sent
 *     only when the transcript was written to in the last fifteen minutes, because that is the evidence:
 *     a file that changed a minute ago is a session that is alive.
 *   - the last thing the assistant said, with ITS OWN timestamp from the transcript rather than now. The
 *     hub's unique index makes a re-post a no-op, which matters because this runs on every sync and reads
 *     the same message until a new one is written.
 *
 * IT NEVER FAILS A SYNC. The sync is the call an agent depends on for its catch-up; this is a decoration on
 * a diagnostic, exactly like `notePresenceFromSync` on the hub's side. Every failure path here is a line on
 * stderr and a return.
 */
async function catchUpFromTranscript(project, cfg) {
    const base = join(homedir(), '.claude', 'projects');
    let dirs;
    try {
        const { readdirSync } = await import('node:fs');
        dirs = readdirSync(base);
    } catch { return null; }

    const { readdirSync, statSync } = await import('node:fs');
    /*
     * FILTER TO THIS PROJECT FIRST, THEN TAKE THE NEWEST — and the first version had it the other way round,
     * which broke it completely in the most confusing way possible.
     *
     * It took the newest transcript on the whole MACHINE and then checked whether it belonged to this
     * project. The newest transcript on a machine running this hub is almost always the session doing the
     * hub work, so a sync from any other project found a transcript that failed the check and returned
     * nothing. Tested against the live hub from a project whose transcript was seven minutes old: silence.
     *
     * Candidates are sorted newest first and examined until one matches, capped at eight. The directory name
     * is a cheap hint — Claude Code names it after the path, so `d--Antigravity-GAMBLANGO` slugifies to
     * something ending in `gamblango` — but it is only a hint: `cwd` inside the file is what decides, because
     * the naming is the harness's business and could change.
     */
    const candidates = [];
    for (const d of dirs) {
        const dir = join(base, d);
        /* Hint, not a rule. A directory whose name cannot contain this project is skipped without a stat;
         * anything else is considered and confirmed by reading `cwd` below. */
        const hint = slugify(d).endsWith(project);
        let files;
        try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
        for (const f of files) {
            try {
                const st = statSync(join(dir, f));
                /*
                 * A SIX-HOUR FLOOR ON WHAT IS WORTH OPENING. Older than that and this is history, which is
                 * `cc backfill`'s job and not something to redo on every sync.
                 */
                if (Date.now() - st.mtimeMs > 6 * 3600e3) continue;
                candidates.push({
                    path: join(dir, f), mtimeMs: st.mtimeMs, hint,
                    session: f.replace(/\.jsonl$/, ''),
                });
            } catch { /* a file that vanished between readdir and stat */ }
        }
    }
    /* Hinted directories first, then by recency. So the common case reads exactly one file. */
    candidates.sort((a, b) => (b.hint ? 1 : 0) - (a.hint ? 1 : 0) || b.mtimeMs - a.mtimeMs);

    let best = null;
    let said = null;
    let saidAt = null;
    for (const c of candidates.slice(0, 8)) {
        /*
         * THE TAIL, NOT THE FILE. These reach fifty megabytes and this runs on every sync. 256 KB covers many
         * messages and costs one seek — the same decision `modelFromTranscript` above already makes.
         */
        let text;
        try {
            const size = statSync(c.path).size;
            const want = Math.min(size, 256 * 1024);
            const fd = openSync(c.path, 'r');
            const buf = Buffer.alloc(want);
            readSync(fd, buf, 0, want, size - want);
            closeSync(fd);
            text = buf.toString('utf8');
        } catch { continue; }

        /*
         * THE FIRST LINE IS PROBABLY A FRAGMENT, because the read started mid-file. Dropped rather than
         * parsed: a half line of JSON is not a message, and guessing at one is how a reconstruction starts
         * inventing.
         */
        let cwd = null;
        let text_ = null;
        let at = null;
        for (const line of text.split('\n').slice(1)) {
            if (!line) continue;
            let m;
            try { m = JSON.parse(line); } catch { continue; }
            if (m.cwd) cwd = m.cwd;
            /* The assistant's own text, from the harness's own record. Content is an array of blocks and only
             * the text ones are words; a turn that was all tool calls has nothing to quote and is skipped. */
            if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
                const t = m.message.content
                    .filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
                if (t) { text_ = t; at = m.timestamp || null; }
            }
        }
        /* `cwd` DECIDES. Posting another project's words under this project's name is exactly how the
         * phantom-project defect worked, and this is the same mistake one layer along. */
        if (!cwd || projectFrom(cwd) !== project) continue;
        best = c;
        said = text_;
        saidAt = at;
        break;
    }
    if (!best) return null;

    const alive = Date.now() - best.mtimeMs < 15 * 60e3;
    let posted = 0;
    if (alive) {
        try {
            await api('/api/agent/presence', {
                method: 'POST',
                body: { project, session: best.session, model: modelFromTranscript(best.path) || null },
                cfg,
            });
            posted++;
        } catch (e) { process.stderr.write(`cc sync: could not refresh presence (${e.message.split('\n')[0]})\n`); }
    }
    if (said && saidAt) {
        try {
            const r = await api('/api/agent/report', {
                method: 'POST',
                body: { project, session: best.session, kind: 'said', body: said, at: saidAt },
                cfg,
            });
            if (r?.saved) posted++;
        } catch (e) { process.stderr.write(`cc sync: could not post the last word (${e.message.split('\n')[0]})\n`); }
    }
    return posted ? { alive, session: best.session, said: !!said } : null;
}

/**
 * THE ONE SLUG RULE. Lowercased, non-alphanumerics collapsed to dashes, trimmed, capped at 40.
 *
 * Hoisted out of the six command bodies that each declared their own copy. Identical in all of them, which is
 * luck rather than design — and the reason `projectFrom` above could be wrong in eight places at once.
 */
function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/*
 * Config lives in the HOME directory, never in a project.
 *
 * That is deliberate and it is a security property, not tidiness: the token must not sit in any repo,
 * and one config on the machine means every project gets the hub for free without a per-project install
 * step to forget. Environment variables win over the file so CI or a cloud agent can be configured
 * without writing anything to disk.
 */
function config() {
    let file = {};
    if (existsSync(CONFIG_FILE)) {
        try {
            file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            die(`${CONFIG_FILE} is not valid JSON (${e.message}). Fix it or re-run: cc setup <url> <token>`);
        }
    }
    const url = (process.env.CC_URL || file.url || '').replace(/\/+$/, '');
    const token = process.env.CC_TOKEN || file.token || '';
    const agent = process.env.CC_AGENT || file.agent || detectAgent();
    return { url, token, agent };
}

/**
 * Best-effort label for which tool is running, used only so the hub can show "last synced by codex".
 * It is a label and never a credential — the bearer token is what authenticates.
 */
function detectAgent() {
    const e = process.env;
    if (e.CLAUDECODE || e.CLAUDE_CODE || e.ANTHROPIC_CLI) return 'claude-code';
    if (e.CODEX_SANDBOX || e.CODEX_HOME) return 'codex';
    if (e.CURSOR_TRACE_ID || e.CURSOR_SESSION_ID) return 'cursor';
    if (e.ANTIGRAVITY_SESSION || e.GEMINI_CLI) return 'antigravity';
    if (e.TERM_PROGRAM === 'vscode') return 'vscode';
    return 'unknown';
}

/**
 * WHICH MODEL THIS SESSION IS ACTUALLY USING, read off its own transcript.
 *
 * THE HOOK DOES NOT TELL YOU. `SessionStart` documents `model` as "not guaranteed to be present", and
 * measured on this machine it is simply absent — so the heartbeat has been posting `model: null` since
 * the day it shipped and `/agents` has had a column for a value nothing ever sent. That was invisible
 * because a missing model renders as nothing at all, which looks identical to a tidy row.
 *
 * The transcript is the harness's own record and it names the model on every assistant message. Reading
 * it is legitimate here for the reason the whole local collector is legitimate (brief §1): what is
 * local-only is PULLING, and this process is already local.
 *
 * THE TAIL AND NOT THE FILE. These reach fifty megabytes; a session hook that read one whole would be a
 * pause at the end of every session. The last 256 KB covers many messages and costs a single seek.
 *
 * `<synthetic>` is skipped — it is what the harness records for messages it generated itself, it has no
 * price in lib/prices.ts for the same reason, and reporting a session as running on it would be naming
 * something that is not a model.
 */
function modelFromTranscript(path) {
    if (!path) return null;
    try {
        const size = statSync(path).size;
        const want = Math.min(size, 256 * 1024);
        const fd = openSync(path, 'r');
        const buf = Buffer.alloc(want);
        readSync(fd, buf, 0, want, size - want);
        closeSync(fd);
        const found = [...buf.toString('utf8').matchAll(/"model"\s*:\s*"([^"]{1,60})"/g)]
            .map(m => m[1])
            .filter(m => m && !m.startsWith('<'));
        return found.length ? found[found.length - 1] : null;
    } catch {
        /* No transcript yet (a brand-new session has an empty one), or no permission to read it. Both are
         * ordinary, and neither is worth a word on stderr during somebody's session start. */
        return null;
    }
}

/*
 * Throws rather than calling process.exit(), because process.exit() while Node's fetch agent still holds a
 * socket trips a libuv assertion on Windows and prints a crash over the top of the real error message.
 * The top-level handler sets exitCode and lets the loop drain.
 */
class Bail extends Error {}
function die(message, code = 1) {
    const e = new Bail(message);
    e.exitCode = code;
    throw e;
}

async function api(path, { method = 'GET', body, cfg } = {}) {
    if (!cfg.url || !cfg.token) {
        die(
            'not configured.\n\n' +
            '  Run:  cc setup https://<your-hub>.vercel.app <agent-token>\n\n' +
            `  or set CC_URL and CC_TOKEN. Config is read from ${CONFIG_FILE}.`,
        );
    }

    let res;
    try {
        res = await fetch(`${cfg.url}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${cfg.token}`,
                'x-cc-agent': cfg.agent,
                ...(body ? { 'content-type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20_000),
        });
    } catch (e) {
        // Distinguish "the hub is unreachable" from "the hub said no". An agent that cannot tell those
        // apart will retry the wrong one.
        die(`could not reach ${cfg.url} (${e.message}). The hub may be down; nothing was sent.`);
    }

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* handled below */ }

    if (!res.ok) {
        const detail = json?.error || text.slice(0, 400) || `HTTP ${res.status}`;
        if (json?.kind === 'write-failed') {
            die(`the hub REFUSED to confirm the write, so assume it did not happen:\n  ${detail}`);
        }
        die(`HTTP ${res.status}: ${detail}`);
    }
    if (!json) die(`the hub returned something that is not JSON:\n${text.slice(0, 300)}`);
    return json;
}

/* ------------------------------------------------------------------------------------------ sync */

function renderSync(s) {
    const out = [];
    const n = s.counts;

    // The scope is stated up front so an inferred project can never be silently wrong.
    const where = s.scope ? `project "${s.scope}"` : 'ALL projects';
    if (s.hours_since_last_sync == null) {
        out.push(`Command Center — ${where}. First sync for "${s.agent}". Cursor now ${s.cursor}.`);
    } else {
        out.push(
            `Command Center — ${where}. Last synced ${s.hours_since_last_sync}h ago as "${s.agent}". ` +
            `Cursor ${s.since} → ${s.cursor}.`,
        );
    }

    /*
     * A STALE CLI IS SAID BEFORE ANYTHING ELSE, above even the defaulted questions.
     *
     * Not because it is more consequential than a decision made without the human, but because it changes
     * whether the rest of this output can be trusted to be complete. An old CLI writes fewer hooks than the
     * hub expects, so the hub is missing observations it does not know it is missing — and everything below
     * is a report about what the hub knows.
     *
     * `cli_stale` is absent from an older hub's response, so `if (s.cli_stale)` is also the compatibility
     * check: an old hub says nothing and this line does not appear.
     */
    if (s.cli_stale) {
        out.push(`!! ${s.cli_advice}`);
        out.push('');
    }

    /*
     * Defaulted questions come FIRST and are stated loudly.
     *
     * This is the one message an agent must never skim past: a decision was made without the human
     * because the deadline passed, and any work built on the assumption that it was still open is
     * wrong. Everything else here is informational; this is consequential.
     */
    if (s.defaulted_questions.length) {
        out.push('', `!! ${s.defaulted_questions.length} question(s) resolved BY DEFAULT — no human answer:`);
        for (const q of s.defaulted_questions) {
            const label = q.options.find(o => o.key === q.answer_option)?.label ?? q.answer_option;
            out.push(`   [${q.project}] ${q.title}`);
            out.push(`     → proceed with "${label}" (${q.answer_option}). Deadline passed ${q.answered_at}.`);
        }
    }

    if (s.changed.length) {
        out.push('', `Changes since you last looked (${s.changed.length}):`);
        for (const e of s.changed) out.push(`   ${e.at.slice(0, 16).replace('T', ' ')}  ${e.summary}`);
    } else if (s.hours_since_last_sync != null) {
        out.push('', 'Nothing has changed since you last looked.');
    }

    if (s.open_questions.length) {
        out.push('', `Still waiting on the human — ${s.open_questions.length} question(s):`);
        for (const q of s.open_questions) {
            out.push(`   ${q.id} [${q.project}] ${q.title}`);
            if (q.default_option && q.deadline) {
                const label = q.options.find(o => o.key === q.default_option)?.label ?? q.default_option;
                out.push(`     default "${label}" applies after ${q.deadline}`);
            }
        }
    }

    if (n.open_tasks || n.blocked_tasks) {
        out.push('', `Open tasks: ${n.open_tasks} actionable, ${n.blocked_tasks} blocked.`);
        for (const t of s.open_tasks.slice(0, 10)) {
            out.push(`   ${t.id} [${t.project}] ${t.title}${t.blocked_reason ? '  (blocked)' : ''}`);
        }
        if (s.open_tasks.length > 10) out.push(`   …and ${s.open_tasks.length - 10} more`);
    }

    if (!s.changed.length && !s.open_questions.length && !s.open_tasks.length &&
        !s.defaulted_questions.length) {
        out.push('', 'Nothing waiting, nothing new. Carry on.');
    }

    // Quieter, not invisible. Enough to mention it to him; not enough to distract from this project.
    if (s.elsewhere && (s.elsewhere.open_tasks || s.elsewhere.open_questions)) {
        out.push('', `Elsewhere: ${s.elsewhere.open_questions} question(s) and ` +
            `${s.elsewhere.open_tasks} task(s) waiting across ${s.elsewhere.projects} other project(s). ` +
            `Use \`cc sync --all\` if that matters to you.`);
    }

    return out.join('\n');
}

/* ------------------------------------------------------------------------------------------ main */

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const flagValue = name => {
    const i = args.findIndex(a => a === `--${name}`);
    if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
    const inline = args.find(a => a.startsWith(`--${name}=`));
    return inline ? inline.slice(name.length + 3) : null;
};

function parseJsonArg(what) {
    const raw = positional[0];
    if (!raw) die(`${what} needs a JSON object as its argument, or "-" to read stdin.`);
    const text = raw === '-' ? readFileSync(0, 'utf8') : raw;
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            die(`${what} needs a JSON object, not ${Array.isArray(parsed) ? 'an array' : typeof parsed}.`);
        }
        return parsed;
    } catch (e) {
        die(`could not parse that as JSON: ${e.message}\n\nGot: ${text.slice(0, 200)}`);
    }
}

const cfg = config();

async function main() {
switch (cmd) {
    case 'setup': {
        const [url, token] = positional;
        if (!url || !token) die('usage: cc setup https://<your-hub>.vercel.app <agent-token>');
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(
            CONFIG_FILE,
            JSON.stringify({ url: url.replace(/\/+$/, ''), token, agent: flagValue('agent') || undefined }, null, 2),
            // Owner-only. The token is in here.
            { mode: 0o600 },
        );
        process.stdout.write(`Wrote ${CONFIG_FILE}\nNow run: cc health\n`);
        break;
    }

    case 'health': {
        const r = await api('/api/health', { cfg });
        if (flags.has('--json')) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); break; }
        process.stdout.write(`${r.ok ? 'OK' : 'NOT OK'}\n`);
        for (const [k, v] of Object.entries(r.checks)) {
            process.stdout.write(`  ${v.ok ? '✓' : '✗'} ${k}: ${v.detail}\n`);
        }
        if (!r.ok) process.exitCode = 1;
        break;
    }

    case 'sync': {
        /*
         * The project is INFERRED from the working directory, so the command you have to remember stays
         * `cc sync` with no arguments.
         *
         * Scoping matters once there are several projects: an agent working on one does not need another's
         * activity, and a note meant for one project should not be picked up and acted on by an agent in a
         * different one. But a flag you must remember is a flag that gets forgotten, and then the default
         * behaviour is the noisy one.
         *
         * Same slug rule as the installer (folder name, slugified), so the inferred value matches the one
         * written into that project's AGENTS.md. It is always printed, so it can never be silently wrong.
         *
         *   cc sync              this project (inferred from the folder)
         *   cc sync --all        every project
         *   cc sync --project X  a specific one
         */
        const inferred = projectFrom(process.cwd());
        const project = flags.has('--all') ? null : (flagValue('project') || inferred || null);

        const since = flagValue('since');
        const qs = new URLSearchParams();
        if (since != null) qs.set('since', since);
        if (project) qs.set('project', project);
        /*
         * THE VERSION HANDSHAKE, and `sync` is the right place for it because it is the one command agents
         * run constantly — several times a session, by instruction. A check on `health` would fire once per
         * machine setup, which is exactly when the CLI is newest and the check is worthless.
         *
         * A query parameter rather than a header so it shows up in a request log and in `--json` output;
         * there is nothing sensitive about a version number.
         */
        qs.set('cli', String(CLI_VERSION));
        const r = await api(`/api/agent/sync${qs.size ? `?${qs}` : ''}`, { cfg });
        process.stdout.write((flags.has('--json') ? JSON.stringify(r, null, 2) : renderSync(r)) + '\n');

        /*
         * AND THEN CATCH THE HUB UP, because a hook cannot. See `catchUpFromTranscript`: Claude Code reads a
         * project's hooks when a session STARTS, so a session that was already running when they were
         * installed reports nothing for its whole life — and a session here lives for days. Every sync makes
         * the hub current again, which is the only mechanism that self-heals.
         *
         * AFTER the sync output, never before it, and awaited rather than fired and forgotten: the sync's own
         * answer is what the agent is waiting for, and a stray line appearing above it would read as part of
         * the response. Skipped for `--all`, which has no one project to catch up, and by `--no-catchup` for
         * anybody who wants the old behaviour.
         */
        if (project && !flags.has('--no-catchup')) {
            const caught = await catchUpFromTranscript(project, cfg);
            if (caught && !flags.has('--json')) {
                process.stdout.write(
                    `  (told the hub this session is live${caught.said ? ' and what it last said' : ''}, `
                    + 'read from the transcript)\n',
                );
            }
        }
        break;
    }

    case 'ask': {
        const r = await api('/api/agent/questions', { method: 'POST', body: parseJsonArg('ask'), cfg });
        if (flags.has('--json')) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); break; }
        const q = r.question;
        process.stdout.write(
            `Asked: ${q.id}\n` +
            // Reported honestly. "Asked but could not notify" is a materially different situation from
            // "asked and they have it on their phone", and an agent should be able to say which.
            (r.notified
                ? '  Pushed to Telegram — expect an answer as a tap.\n'
                : `  NOT pushed (${r.notify_channel === 'none' ? 'Telegram is not configured' : 'the send failed'}). ` +
                  'It is stored and visible on the hub, but nobody has been alerted.\n') +
            (q.deadline
                ? `  If unanswered by ${q.deadline}, proceed with "${q.default_option}".\n`
                : '  No deadline set — this will wait open indefinitely.\n') +
            `  Check later with: cc wait ${q.id}\n`,
        );
        break;
    }

    case 'task': {
        const r = await api('/api/agent/tasks', { method: 'POST', body: parseJsonArg('task'), cfg });
        if (flags.has('--json')) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); break; }
        process.stdout.write(
            `${r.created ? 'Created' : 'Updated'} task ${r.task.id} — ${r.task.title}\n`,
        );
        break;
    }

    /*
     * Connect the project in the current directory to the hub. One command, no paths, no local copy of the
     * hub repository needed.
     *
     * This replaced a script that had to be invoked by absolute path inside the hub repo. That was wrong
     * twice over: it only worked on the one machine that had the repo, and it was written as an instruction
     * for the HUMAN to run when the agent is right there and can do it. If a step can be automated, telling
     * someone to do it by hand is a defect, not documentation.
     *
     *   cc onboard              this directory
     *   cc onboard --dry        show what would change
     */
    case 'onboard': {
        const dir = process.cwd();
        const slug = flagValue('project') || projectFrom(dir);
        if (!slug) die('could not work out a project slug from the current directory');

        const { snippet, begin, end, pointer } = await api(
            `/api/agent/snippet?project=${encodeURIComponent(slug)}`, { cfg },
        );

        const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
        const { join } = await import('node:path');

        const agentsPath = join(dir, 'AGENTS.md');
        let content = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
        let action;
        if (content.includes(begin) && content.includes(end)) {
            // Replace between the markers rather than appending, so re-running is safe and idempotent.
            content = content.slice(0, content.indexOf(begin)) + snippet +
                      content.slice(content.indexOf(end) + end.length);
            action = 'updated';
        } else {
            content = (content.trim() ? content.trimEnd() + '\n\n' : `# ${slug}\n\n`) + snippet + '\n';
            action = existsSync(agentsPath) ? 'appended to' : 'created';
        }

        // Pointers only, and only into files that already exist. Creating a CLAUDE.md in a project that
        // deliberately has none would change how that project behaves, uninvited.
        const pointers = [];
        for (const name of ['CLAUDE.md', 'GEMINI.md', 'gemini.md']) {
            const p = join(dir, name);
            if (!existsSync(p)) continue;
            const existing = readFileSync(p, 'utf8');
            if (existing.includes('Command Center')) { pointers.push(`${name} (already)`); continue; }
            if (!flags.has('--dry')) {
                writeFileSync(p, `${existing.trimEnd()}\n\n## Command Center\n\n${pointer}\n`, 'utf8');
            }
            pointers.push(name);
        }

        if (flags.has('--dry')) {
            /* `action` is past tense because the message after a real run reports what happened. The dry run
             * needs the infinitive, or it prints "Would created AGENTS.md" — which it did, and which a person
             * reads as the tool being broken before they have any evidence that it is not. */
            const willDo = action === 'updated' ? 'update' : action === 'appended to' ? 'append to' : 'create';
            process.stdout.write(
                `Would ${willDo} AGENTS.md for project "${slug}"` +
                `${pointers.length ? `, and add a pointer to ${pointers.join(', ')}` : ''}\n` +
                `Nothing written (--dry).\n`,
            );
            break;
        }

        writeFileSync(agentsPath, content, 'utf8');
        process.stdout.write(
            `${action} AGENTS.md for project "${slug}"\n` +
            `${pointers.length ? `pointer added to: ${pointers.join(', ')}\n` : ''}` +
            `\nNow run:  node "$HOME/.command-center/cc.mjs" sync\n`,
        );
        break;
    }

    /*
     * Re-send open questions to Telegram in the current message format.
     *
     * A sent Telegram message is a frozen snapshot: improving the format does not reach backwards into
     * messages already on the phone. So after any change to how questions are presented, the ones already
     * waiting are stuck advertising the old capabilities — which is how "you can add a comment to your
     * answer" ended up being true of the hub and invisible in Telegram.
     *
     *   cc repush --open        every question still waiting
     *   cc repush <id>          just one
     */
    case 'repush': {
        const id = positional[0];
        const all = flags.has('--open') || !id;
        const r = await api('/api/agent/questions', {
            method: 'PATCH', body: all ? { open: true } : { id }, cfg,
        });
        for (const x of r.results) {
            process.stdout.write(`  ${x.repushed ? 'resent' : 'skipped'}  ${x.id}${x.reason ? ` (${x.reason})` : ''}\n`);
        }
        if (!r.results.length) process.stdout.write('  nothing open to resend\n');
        break;
    }

    case 'drop': {
        const id = positional[0];
        if (!id) die('usage: cc drop <task-id>');
        const r = await api('/api/agent/tasks', { method: 'PATCH', body: { id, status: 'dropped' }, cfg });
        process.stdout.write(`Dropped ${r.task.id} — ${r.task.title}\n`);
        break;
    }

    /* ==========================================================================================
     * THE LOCAL COLLECTOR — a few hooks and one command, and it is NOT a second user interface.
     *
     * `docs/BRIEF-NOTHING-BLOCKED.md` §1's finding is that almost nothing here is genuinely local-only:
     * what is local-only is PULLING. A server in Frankfurt cannot read `.claude/skills/*` off this disk or
     * see that a session just started — but it never needed to, because everything the hub already holds
     * arrived because something local made an HTTP call. These commands are that, for three more facts.
     *
     * There is nothing to look at locally, nothing to keep in sync, and no second place to check. That is
     * the thing he refused — *"the last thing we want is to complicate the thing that we already built by
     * creating a second app"* — avoided rather than argued with.
     * ======================================================================================== */

    /*
     * WHICH PROJECT AM I IN? The same rule `cc sync` uses, and that is the point.
     *
     * The slug is the folder name slugified — identical to `sync` and to `onboard`, so presence, spend and
     * the queue all agree about what a project is. Any cleverer inference here would be a second definition
     * of "project" and the two would disagree on somebody's machine.
     */
    case 'presence':
    case 'approvals': {
        const dir = process.cwd();
        const slug = flagValue('project') || projectFrom(dir);
        const verb = positional[0] || 'status';
        if (!['on', 'off', 'status'].includes(verb)) {
            die(`usage: cc ${cmd} on|off|status   (in the project folder)`);
        }

        const { readFileSync: rf, writeFileSync: wf, existsSync: ex, mkdirSync: mk } = await import('node:fs');
        const { join: j } = await import('node:path');
        const settingsDir = j(dir, '.claude');
        const settingsPath = j(settingsDir, 'settings.json');

        /*
         * THE HOOK COMMAND, and every character of the quoting is load-bearing.
         *
         * `"$HOME"` and never `~`. A command hook runs through a shell — sh on POSIX, Git Bash on Windows —
         * and a tilde is expanded by the shell, not by node. `node ~/.command-center/cc.mjs` fails on
         * PowerShell, and this project has already shipped that exact bug once on its own setup page
         * (docs/ITERATION-LOG.md §XXI.C). The quotes matter because a Windows home directory contains a
         * space more often than not.
         *
         * NO TOKEN ANYWHERE IN HERE. That is the whole reason these are `command` hooks rather than the
         * `http` hooks the brief prescribed: `cc` reads `~/.command-center/config.json` at mode 0600, so the
         * file this writes into a project carries no credential and is safe to commit.
         */
        const CC = 'node "$HOME/.command-center/cc.mjs"';
        /*
         * `matcher` is what keeps the sub-agent hooks off the firehose, and it is the whole reason this
         * feature is allowed to exist. `Task|Agent` is the tool that spawns a sub-agent — `Task` in
         * released Claude Code, `Agent` in the current harness — so a Read, an Edit or a Bash call never
         * runs any of this. Without the matcher these three would fire on EVERY tool call, which is the
         * firehose docs/BRIEF-NOTHING-BLOCKED.md §4 refuses and would put tens of thousands of rows a day
         * into the same database `sync` reads.
         */
        const SPAWNER = 'Task|Agent';
        /*
         * THE NOTIFICATION TYPES THAT MEAN A PERSON IS NEEDED, and nothing else. `Notification` also fires
         * for `auth_success` and for elicitation traffic, none of which is about him — matching all of them
         * would put rows in the thread that no human action follows from, which is the one test
         * docs/RESEARCH.md §14 sets for anything appearing on a page.
         */
        const NEEDS_HUMAN = 'agent_needs_input|idle_prompt|permission_prompt';
        /*
         * `--no-words` IS AN ANSWER TO A FAIR OBJECTION, and it is one flag rather than a second command.
         *
         * With the report hooks installed, the hub is sent the last thing the assistant said each turn and
         * the prompts he types. On his own hub, for his own projects, that is the whole feature — it is
         * what makes the thread on a project page a conversation instead of a row of timestamps. On
         * somebody else's work machine it is a reasonable thing to refuse, and this repository is public.
         *
         * So: the flag is written INTO the hook command in `.claude/settings.json`, where it is visible to
         * anyone reading the file, and it withholds only the text. Activity, runs, branch, model and
         * "waiting for you" all still work, because none of them is made of his words.
         */
        const QUIET = flags.has('--no-words') ? ' --quiet' : '';
        const HOOKS = {
            presence: [
                /*
                 * `timeout` is set on BOTH, and on SessionEnd it is not optional. Claude Code gives SessionEnd
                 * hooks a shared 1.5-second budget and raises it to match an explicit per-hook timeout — so
                 * without this the "the session finished" heartbeat would be cancelled before an HTTP round
                 * trip completed, and every session would stay open forever on the page.
                 */
                { event: 'SessionStart', sub: 'heartbeat', command: `${CC} heartbeat`, timeout: 15 },
                { event: 'SessionEnd', sub: 'heartbeat', command: `${CC} heartbeat --end`, timeout: 15 },
                /*
                 * THE SUB-AGENT ROW, opened and closed. Four events and one row, because the harness has
                 * two different lifecycles behind one tool and neither of them is coverable by the other:
                 *
                 *   PreToolUse         a sub-agent was spawned — the only event that carries the start
                 *   PostToolUse        a SYNCHRONOUS one finished (status "completed", with its tool
                 *                      counts and line counts), or a BACKGROUNDED one launched, in which
                 *                      case the response carries only the agentId to close it by later
                 *   PostToolUseFailure the spawning call errored, which is the only way "it failed" is
                 *                      ever knowable — without it a failed sub-agent stays open forever
                 *   SubagentStop       a BACKGROUNDED one finished. Carries agent_id and nothing else,
                 *                      which is why PostToolUse recording that id is load-bearing.
                 *
                 * Measured on this machine rather than assumed: a backgrounded spawn returns
                 * `duration_ms: 9` about a tenth of a second in, and believing that number would have
                 * drawn a nine-millisecond block for an agent that ran for seven seconds.
                 */
                {
                    event: 'PreToolUse', matcher: SPAWNER, sub: 'subagent',
                    command: `${CC} subagent`, timeout: 15,
                },
                {
                    event: 'PostToolUse', matcher: SPAWNER, sub: 'subagent',
                    command: `${CC} subagent`, timeout: 15,
                },
                {
                    event: 'PostToolUseFailure', matcher: SPAWNER, sub: 'subagent',
                    command: `${CC} subagent`, timeout: 15,
                },
                /* No matcher: SubagentStop is already about exactly one thing. */
                { event: 'SubagentStop', sub: 'subagent', command: `${CC} subagent`, timeout: 15 },
                /*
                 * ==========================================================================================
                 * WHAT WAS SAID — three hooks, and they are the difference between a status board and a
                 * command centre.
                 * ==========================================================================================
                 *
                 * `Stop` fires ONCE PER TURN and carries `last_assistant_message`. That single field is
                 * what this whole product was missing: presence could only ever be observed at the start
                 * and the end of a session, so a hub watching an agent that worked all evening had nothing
                 * to say until it stopped — and said *"Nothing has looked at this since 8 August"* over a
                 * project that was live. A per-turn hook is the mid-session evidence, and it arrives with
                 * the agent's own words attached rather than with a number.
                 *
                 * `Notification` matched to the three types that mean A HUMAN IS NEEDED is the other half:
                 * `agent_needs_input`, `idle_prompt`, `permission_prompt`. It is the harness reporting that
                 * the agent is blocked — never the agent grading itself — which is what makes it admissible
                 * where a self-declared status is not (lib/reports.ts explains the distinction).
                 *
                 * `UserPromptSubmit` records his half of the conversation, so the thread on the project
                 * page reads as an exchange rather than as a monologue.
                 *
                 * WHY NOT `PostToolUse` FOR ACTIVITY, which was the first design: it runs on EVERY tool
                 * call. Node's startup alone would put ~80ms on each one, hundreds of times a session, to
                 * learn nothing that the end of the turn does not also say. Per-turn is the right grain and
                 * the harness hands it over for free.
                 *
                 * TIMEOUTS ARE SHORT HERE ON PURPOSE. These three are the only hooks in this file that sit
                 * between him and his own agent — `UserPromptSubmit` runs before the prompt is processed —
                 * so a hub that is slow or down must cost a moment, not a minute. `cc report` exits 0 come
                 * what may, so the worst case is a gap in the thread.
                 */
                { event: 'Stop', sub: 'report', command: `${CC} report --said${QUIET}`, timeout: 10 },
                {
                    event: 'UserPromptSubmit', sub: 'report',
                    command: `${CC} report --told${QUIET}`, timeout: 10,
                },
                {
                    event: 'Notification', matcher: NEEDS_HUMAN, sub: 'report',
                    command: `${CC} report --waiting${QUIET}`, timeout: 10,
                },
            ],
            approvals: [
                /*
                 * 600 seconds, stated rather than defaulted. It IS the default for a command hook, and writing
                 * it out is what makes the ten-minute promise visible in the file somebody reads when they
                 * wonder how long the hub is allowed to hold their agent up.
                 */
                { event: 'PermissionRequest', sub: 'permission', command: `${CC} permission`, timeout: 600 },
            ],
        }[cmd];

        let settings = {};
        if (ex(settingsPath)) {
            try {
                settings = JSON.parse(rf(settingsPath, 'utf8'));
            } catch (e) {
                die(`${settingsPath} is not valid JSON (${e.message}). Fix it before running this — `
                    + 'rewriting a file I cannot parse would throw away whatever else is in it.');
            }
        }

        /*
         * Identified by the command string rather than by a marker field. A marker would be an unknown key in
         * somebody else's schema; the command names this CLI and its subcommand, which is unambiguous and
         * cannot be invalidated by a settings-format change.
         *
         * Matched on the SUBCOMMAND WORD, which is the repair of a predicate that had grown unreadable —
         * it tested the last word of the command string, and the last word of `heartbeat --end` is
         * `--end`. Every hook this feature installs names one of a small set of verbs, so the set is what
         * is matched. It stays true for hooks written by an OLDER version of this CLI, which is what
         * makes `presence off` still able to remove what `presence on` wrote last month.
         */
        const VERBS = [...new Set(HOOKS.map(h => h.sub))];
        /** The distinct events this feature writes, for counting and for saying so. */
        const EVENTS = [...new Set(HOOKS.map(h => h.event))];
        const mine = h => typeof h?.command === 'string' && h.command.includes('cc.mjs')
            && VERBS.some(v => new RegExp(`cc\\.mjs"?\\s+${v}(\\s|$)`).test(h.command));

        /* Every event this feature COULD have written, not only the ones it writes today — otherwise an
         * upgrade that stops using an event would leave that hook behind forever and `off` would report
         * success while a hook kept firing. */
        const OUR_EVENTS = [...new Set([
            ...HOOKS.map(h => h.event),
            'SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
            'SubagentStop', 'PermissionRequest',
        ])];

        const installed = [];
        for (const event of OUR_EVENTS) {
            for (const group of settings.hooks?.[event] ?? []) {
                for (const h of group.hooks ?? []) if (mine(h)) installed.push(event);
            }
        }

        if (verb === 'status') {
            process.stdout.write(
                `project "${slug}" — ${cmd} ${installed.length ? 'ON' : 'off'}\n`
                + `  ${settingsPath}\n`
                + (installed.length
                    ? `  hooks: ${[...new Set(installed)].join(', ')}\n`
                    : `  nothing installed. \`cc ${cmd} on\` adds ${EVENTS.length}: ${EVENTS.join(', ')}.\n`),
            );
            break;
        }

        /* Remove ours first, in both cases. `on` is then idempotent by construction rather than by a check —
         * running it twice cannot produce two SessionStart hooks, which would post two heartbeats. It is
         * also what upgrades an older install: the two hooks `presence on` wrote last month come out and
         * the current set goes in, so re-running is how a project gains the sub-agent hooks.
         *
         * `mine` is scoped to THIS feature's verbs, which is what stops `presence off` from taking the
         * permission relay's hook out with it while the loop is walking every event either feature uses. */
        settings.hooks = settings.hooks ?? {};
        for (const event of OUR_EVENTS) {
            const groups = settings.hooks[event];
            if (!Array.isArray(groups)) continue;
            for (const group of groups) {
                if (Array.isArray(group.hooks)) group.hooks = group.hooks.filter(h => !mine(h));
            }
            /* Drop groups we emptied, and the event key if nothing is left. Leaving `"SessionEnd": [{"hooks":
             * []}]` behind would mean `presence off` did not actually undo `presence on`, which is the kind of
             * residue that makes somebody stop trusting an off switch. */
            settings.hooks[event] = groups.filter(g => (g.hooks ?? []).length > 0);
            if (!settings.hooks[event].length) delete settings.hooks[event];
        }

        if (verb === 'on') {
            for (const { event, command, timeout, matcher } of HOOKS) {
                settings.hooks[event] = settings.hooks[event] ?? [];
                settings.hooks[event].push({
                    /* The matcher is omitted rather than set to a catch-all where there is none. An empty
                     * string is a valid "match everything" in this schema, and writing one on SessionStart
                     * would be a meaningless key that reads like a mistake to whoever opens the file. */
                    ...(matcher ? { matcher } : {}),
                    hooks: [{ type: 'command', command, timeout }],
                });
            }
        }
        if (!Object.keys(settings.hooks).length) delete settings.hooks;

        if (flags.has('--dry')) {
            process.stdout.write(
                `Would ${verb === 'on' ? 'write' : 'remove'} ${EVENTS.length} hook(s) — ${EVENTS.join(', ')} — in\n`
                + `  ${settingsPath}\nNothing written (--dry). Result would be:\n\n`
                + JSON.stringify(settings, null, 2) + '\n',
            );
            break;
        }

        mk(settingsDir, { recursive: true });
        wf(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        /*
         * VERIFIED BY READING IT BACK. The same rule the hub's own writes follow: nothing reports success
         * until an independent read confirms it. A settings file that silently failed to save would leave him
         * believing a feature is on, which is worse than it being off.
         */
        const back = JSON.parse(rf(settingsPath, 'utf8'));
        /* Counted over EVERY event either feature uses, not only the ones being written. For `off` that
         * is the difference between "the hooks I meant to remove are gone" and "no hook of mine is left",
         * and only the second one is what the message about to be printed claims. */
        const now = OUR_EVENTS.filter(event =>
            (back.hooks?.[event] ?? []).some(g => (g.hooks ?? []).some(mine)));
        if (verb === 'on' && now.length !== EVENTS.length) {
            die(`wrote ${settingsPath} but only ${now.length} of ${EVENTS.length} hooks read back. `
                + 'Assume this is NOT on.');
        }
        if (verb === 'off' && now.length !== 0) {
            die(`wrote ${settingsPath} but ${now.length} hook(s) are still there. Assume this is still ON.`);
        }

        process.stdout.write(
            verb === 'on'
                ? `${cmd} ON for "${slug}" — ${EVENTS.length} hooks in ${settingsPath}\n`
                  + `  ${EVENTS.join(', ')}\n`
                  + '  No token is in that file, so it is safe to commit.\n'
                  /*
                   * SAID PLAINLY AT THE MOMENT OF CONSENT, because this is the one command in the CLI that
                   * starts sending message text to a server. Burying it in docs/SETUP.md would be the shape
                   * of a dark pattern: the person running this is the person who should be told, and the
                   * moment they run it is when they can still change their mind. The opt-out is on the same
                   * screen as the disclosure rather than a page away.
                   */
                  + (cmd === 'presence'
                      ? (QUIET
                          ? '  --no-words: no message text will be sent. Activity, runs, branch, model '
                            + 'and "waiting for you" all still work.\n'
                          : '  This sends the hub the last thing the assistant says each turn, and the '
                            + 'prompts you type, so a project page can show the conversation. '
                            + 'Token-shaped words are redacted before storing.\n'
                            + '  Re-run with --no-words if you would rather it sent no message text.\n')
                      : '')
                  + (cmd === 'approvals'
                      ? '  Whoever can open the hub can now answer permission prompts in this project. '
                        + 'See docs/SETUP.md.\n'
                      : '')
                  + `  Start a new session for it to take effect. \`cc ${cmd} off\` undoes this.\n`
                : `${cmd} off for "${slug}" — removed from ${settingsPath}\n`,
        );
        break;
    }

    /*
     * A HEARTBEAT, driven by a hook. Reads the hook's JSON on stdin.
     *
     * FAILS QUIETLY AND EXITS 0, ALWAYS — and that is the one place in this CLI where swallowing an error is
     * correct. This runs at the start and end of every session in an opted-in project; if the hub is
     * unreachable, the right outcome is that his session starts normally and the page says "last heard from"
     * a bit stale. A hook that printed a stack trace over the top of a starting session, or worse blocked it,
     * would make presence cost more than it is worth. The one thing it must never do is get in the way.
     */
    case 'heartbeat': {
        const raw = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
        let hook = {};
        try { hook = JSON.parse(raw || '{}'); } catch { /* below */ }

        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || projectFrom(cwd);
        const session = hook.session_id || flagValue('session') || 'unknown';
        const ending = flags.has('--end');

        if (!project || session === 'unknown') {
            /* Said on stderr, which lands in the transcript rather than in the model's context, and still
             * exits 0. A heartbeat that cannot identify itself is not worth failing a session over. */
            process.stderr.write('cc heartbeat: no project or session id on stdin; nothing sent\n');
            break;
        }

        const body = { project, session };
        /*
         * THE MODEL IS SENT ON BOTH EVENTS, and it has to be, because neither one alone can supply it.
         *
         * `SessionStart` does not carry `model` — documented as "not guaranteed" and measured absent — so
         * the only source is the transcript, and at the start of a fresh session the transcript is empty.
         * At the END it is not. So a session's model is filled in by whichever of the two observations
         * finds it, plus `cc subagent` on the way past for a session that is still running.
         *
         * `hook.model` first regardless, because if a harness ever does send it, it is the harness's own
         * answer rather than one recovered from a file.
         */
        body.model = hook.model || modelFromTranscript(hook.transcript_path) || null;
        if (ending) {
            body.ended = true;
            body.end_reason = hook.reason || null;
        } else {
            /*
             * The branch, read off the machine rather than composed. There is deliberately no field
             * describing what the session is DOING — see lib/presence.ts: an agent asked to report its
             * own state reports favourably, and one green-while-you-slept status poisons the page.
             */
            body.branch = await (async () => {
                try {
                    const { execFileSync } = await import('node:child_process');
                    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
                        { cwd: String(cwd), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
                } catch { return null; }   // not a repo, or no git. Not a problem.
            })();
        }

        try {
            await api('/api/agent/presence', { method: 'POST', body, cfg });
        } catch (e) {
            process.stderr.write(`cc heartbeat: ${e.message.split('\n')[0]}\n`);
        }
        break;
    }

    /*
     * ==========================================================================================
     * WHAT WAS SAID — one row per turn, and it is the activity signal at the same time.
     * ==========================================================================================
     *
     *   cc report --said      Stop              body = last_assistant_message
     *   cc report --told      UserPromptSubmit  body = prompt
     *   cc report --waiting   Notification      body = message, when the type means a human is needed
     *
     * FAILS QUIETLY AND EXITS 0, like every other hook in here, and for a sharper reason than the rest:
     * `UserPromptSubmit` runs BETWEEN HIM AND HIS OWN AGENT. A non-zero exit from that event blocks the
     * prompt. A hub that is down must never be able to stop him talking to Claude Code — so every failure
     * path here writes one line to stderr and gets out of the way.
     *
     * `--quiet` sends NO MESSAGE TEXT, only the fact that a turn happened. It is what
     * `cc presence on --no-words` installs, and it exists because "the hub uploads everything you type" is
     * a fair objection from somebody setting this up on a work machine. Presence stays exact and
     * "waiting for you" still works; only the words are withheld.
     */
    case 'report': {
        const raw = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
        let hook = {};
        try { hook = JSON.parse(raw || '{}'); } catch { /* handled by the identity check below */ }

        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || projectFrom(cwd);
        const session = hook.session_id || flagValue('session') || 'unknown';

        const kind = flags.has('--said') ? 'said'
            : flags.has('--told') ? 'told'
                : flags.has('--waiting') ? 'waiting'
                    : null;
        if (!kind) die('usage: cc report --said|--told|--waiting   (driven by a hook, reads stdin)');

        if (!project || session === 'unknown') {
            process.stderr.write('cc report: no project or session id on stdin; nothing sent\n');
            break;
        }

        /*
         * ONLY THE NOTIFICATIONS THAT MEAN A PERSON IS NEEDED. The `matcher` in the settings file is the
         * first lock and this is the second, for the same reason `cc subagent` re-checks the tool name: a
         * settings file edited by hand, or written by an older version of this CLI, is not a guarantee.
         * `auth_success` and the elicitation traffic are not about him and would put rows in the thread
         * that no action follows from.
         */
        const NEEDS_HUMAN = ['agent_needs_input', 'idle_prompt', 'permission_prompt'];
        if (kind === 'waiting' && hook.notification_type
            && !NEEDS_HUMAN.includes(String(hook.notification_type))) {
            break;
        }

        const said = kind === 'said' ? hook.last_assistant_message
            : kind === 'told' ? hook.prompt
                : hook.message;
        const body = flags.has('--quiet') || said == null || said === '' ? null : String(said);

        /*
         * THE MODEL AND THE BRANCH, EVERY TURN, and both change mid-session for real reasons: a session
         * that switched model with /model, and an agent that checked out a branch an hour in. The hub
         * showing the branch a session STARTED on would be a small untruth of exactly the kind this
         * project spends its time removing. Both are cheap — the transcript read is a 256 KB tail seek,
         * and `git rev-parse` is a few milliseconds.
         */
        const payload = { project, session, kind, body };
        payload.model = hook.model || modelFromTranscript(hook.transcript_path) || null;
        payload.branch = await (async () => {
            try {
                const { execFileSync } = await import('node:child_process');
                return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
                    { cwd: String(cwd), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            } catch { return null; }
        })();

        try {
            const r = await api('/api/agent/report', { method: 'POST', body: payload, cfg });
            /* Said out loud rather than silently accepted: a redaction means the hub changed what it was
             * sent, and the operator should hear that from the tool rather than notice it on a page. */
            if (r?.redacted) {
                process.stderr.write(
                    'cc report: something in that message looked like a credential, so it was redacted '
                    + 'before storing. The hub stores no secrets by rule.\n',
                );
            }
        } catch (e) {
            process.stderr.write(`cc report: ${e.message.split('\n')[0]}\n`);
        }
        break;
    }

    /*
     * ==========================================================================================
     * ONE ROW PER SUB-AGENT — driven by four hook events, all matched to the spawning tool.
     * ==========================================================================================
     *
     * WHAT THE HARNESS ACTUALLY HANDS OVER. Measured by installing a hook that dumps its stdin and then
     * running real sessions, rather than taken from the documentation, because the documentation does not
     * describe the Task tool's payload at all. Recorded in docs/ITERATION-LOG.md §XXXII.
     *
     *   PreToolUse    tool_use_id, tool_input.{subagent_type, description, run_in_background}
     *   PostToolUse   the same, plus tool_response — and the response has TWO shapes:
     *                   synchronous: { status: "completed", agentId, resolvedModel, totalDurationMs,
     *                                  totalToolUseCount, toolStats: { editFileCount, linesAdded, … } }
     *                   background:  { isAsync: true, status: "async_launched", agentId, resolvedModel }
     *   PostToolUseFailure  tool_use_id and an error. The only signal that a spawn failed.
     *   SubagentStop  agent_id, agent_type — and nothing that joins back to the tool call, which is why
     *                 PostToolUse recording `agentId` is what makes a backgrounded sub-agent closable.
     *
     * THE TRAP IN THAT LIST, and it is the one this whole page exists to avoid. A backgrounded spawn
     * reports `duration_ms: 9` roughly a tenth of a second after it starts. That is the duration of the
     * LAUNCH. Storing it as the sub-agent's duration would have drawn a nine-millisecond block for an
     * agent that ran for seven seconds — a shape on a chart making a false claim about a span of time.
     * So `async_launched` is not treated as an ending at all, and no duration is ever sent: the hub times
     * the span from the two observations it makes itself.
     *
     * FAILS QUIETLY AND EXITS 0, exactly as `heartbeat` does and for the same reason. This runs when a
     * sub-agent is spawned; if the hub is unreachable the right outcome is that the work carries on and
     * the timeline is missing a block. It must never be the reason something did not run.
     */
    case 'subagent': {
        const raw = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
        let hook = {};
        try { hook = JSON.parse(raw || '{}'); } catch { /* guarded below */ }

        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || projectFrom(cwd);
        const session = hook.session_id || flagValue('session') || '';
        const event = hook.hook_event_name || '';
        const input = hook.tool_input && typeof hook.tool_input === 'object' ? hook.tool_input : {};
        const response = hook.tool_response && typeof hook.tool_response === 'object'
            ? hook.tool_response : {};

        /*
         * DEFENCE IN DEPTH ON THE TOOL NAME. The matcher in `.claude/settings.json` is what keeps these
         * hooks off every other tool call, and this is the second lock on the same door: a settings file
         * edited by hand, or a harness whose matcher semantics differ, must not turn this into the
         * firehose the whole design refuses. `SubagentStop` has no tool name and is exempt because it is
         * already about exactly one thing.
         */
        const spawner = t => t === 'Task' || t === 'Agent';
        if (event !== 'SubagentStop' && !spawner(hook.tool_name)) break;
        if (!project || !session) {
            process.stderr.write('cc subagent: no project or session id on stdin; nothing sent\n');
            break;
        }

        /*
         * The PARENT session's model rides along, because this process has the transcript path in front
         * of it and the session row may still be waiting for one — see `modelFromTranscript`. It is
         * coalesced server-side, so a value the heartbeat already recorded is never overwritten by this.
         */
        const body = { project, session, session_model: modelFromTranscript(hook.transcript_path) };
        if (event === 'SubagentStop') {
            /* The only identifier this event carries. Without a matching row the hub creates one and
             * marks its start as unobserved, which the timeline draws differently rather than hiding. */
            body.agent_id = hook.agent_id || null;
            body.type = hook.agent_type || null;
            body.ended = true;
            /* NO OUTCOME WORD. SubagentStop fires whether the work went well or badly and says nothing
             * about which, so the hub's own default — "ended" — is the honest one. Sending "completed"
             * here would be the same overclaim as reporting an agent as working on the strength of one
             * sync, which is the defect the owner found in seconds. */
            if (!body.agent_id) break;
        } else if (event === 'PostToolUseFailure') {
            body.tool_use_id = hook.tool_use_id || null;
            body.type = input.subagent_type || null;
            body.task = input.description || null;
            body.ended = true;
            body.outcome = 'failed';
        } else if (event === 'PostToolUse') {
            body.tool_use_id = hook.tool_use_id || null;
            body.agent_id = response.agentId || null;
            body.type = input.subagent_type || response.agentType || null;
            body.task = input.description || null;
            body.model = response.resolvedModel || null;
            const launched = response.isAsync === true || response.status === 'async_launched';
            if (!launched) {
                body.ended = true;
                body.outcome = response.status || 'ended';
                body.tool_calls = response.totalToolUseCount ?? null;
                const stats = response.toolStats && typeof response.toolStats === 'object'
                    ? response.toolStats : {};
                body.edits = stats.editFileCount ?? null;
                body.lines_added = stats.linesAdded ?? null;
                body.lines_removed = stats.linesRemoved ?? null;
            }
        } else {
            /* PreToolUse — the spawn, and the only event that observes the start. */
            body.tool_use_id = hook.tool_use_id || null;
            body.type = input.subagent_type || null;
            body.task = input.description || null;
        }

        try {
            await api('/api/agent/subagent', { method: 'POST', body, cfg });
        } catch (e) {
            process.stderr.write(`cc subagent: ${e.message.split('\n')[0]}\n`);
        }
        break;
    }

    /*
     * ==========================================================================================
     * THE PERMISSION RELAY'S LOCAL HALF — post once, then hold by polling.
     * ==========================================================================================
     *
     * WHY THIS EXISTS RATHER THAN AN `http` HOOK, which is what the brief asked for.
     *
     * An `http` hook would have the HUB hold the connection for the hook's 600-second budget. A serverless
     * function cannot: Vercel caps an invocation at 300 seconds on this plan, so the honest promise would
     * have become "answer within five minutes, if your plan allows it". The hold has to be local.
     *
     * Three things fall out of that, all better than the original:
     *   - the token stays in `~/.command-center/config.json` and never enters a project's settings file
     *   - the clock belongs to the process that is actually waiting, so "hands back at ten minutes" is a
     *     promise the party making it can keep
     *   - every request to the hub is milliseconds, so this works on any plan
     *
     * WHAT IT PRINTS, AND WHY SILENCE IS THE DEFAULT.
     *
     * A `PermissionRequest` hook's stdout must be either nothing or exactly one JSON object. Nothing means
     * "defer" — the ordinary permission flow, which is the terminal prompt — and that is what this prints on
     * a timeout, on an unreachable hub, and on any error. **The failure mode of this entire feature is that
     * Claude Code asks in the terminal exactly as it does today.** That is the property that makes it safe to
     * install, and it is why every catch here is silent on stdout.
     */
    case 'permission': {
        const raw = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
        let hook = {};
        try { hook = JSON.parse(raw || '{}'); } catch { /* handled by the guard below */ }

        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || projectFrom(cwd);
        const toolName = hook.tool_name || '';

        /*
         * DEFER IMMEDIATELY IF THERE IS NOTHING TO ASK ABOUT. No output, exit 0, terminal prompt as usual.
         * A hook that held a session for ten minutes over a payload it could not read would be worse than no
         * hook at all.
         */
        if (!project || !toolName) break;

        /*
         * THE PREVIEW — built here, because this side knows the tool shapes, and TRUSTED NOWHERE.
         *
         * The hub sanitises whatever arrives regardless (lib/sanitise.ts), so this is about usefulness rather
         * than safety: "Bash" plus a 600-character JSON blob is not a thing anybody can approve, and the one
         * field that matters differs per tool. Falls back to a compact JSON of the input, which is right for
         * a tool this list has never heard of — including every MCP tool.
         */
        const input = hook.tool_input && typeof hook.tool_input === 'object' ? hook.tool_input : {};
        const preview = (() => {
            const first = ['command', 'file_path', 'path', 'url', 'pattern', 'query', 'prompt', 'description']
                .map(k => input[k]).find(v => typeof v === 'string' && v.trim());
            if (first) return first;
            try {
                const s = JSON.stringify(input);
                return s === '{}' ? '(no arguments)' : s;
            } catch { return '(arguments could not be read)'; }
        })();

        let filed;
        try {
            filed = await api('/api/agent/permission', {
                method: 'POST',
                cfg,
                body: {
                    project,
                    tool_use_id: hook.tool_use_id || null,
                    tool_name: toolName,
                    preview,
                    session: hook.session_id || null,
                },
            });
        } catch (e) {
            process.stderr.write(`cc permission: could not reach the hub (${e.message.split('\n')[0]}). `
                + 'Asking in the terminal instead.\n');
            break;
        }

        if (!filed?.notified) {
            /*
             * NOBODY WAS TOLD, SO DO NOT HOLD. Reported honestly by the hub — `no-channel` means Telegram is
             * off or suppressed — and holding for ten minutes waiting for a tap on a notification that was
             * never sent is the worst outcome available. Defer immediately: the terminal prompt is right here.
             */
            process.stderr.write(`cc permission: filed but nobody was notified (${filed?.notify_reason}). `
                + 'Asking in the terminal instead.\n');
            break;
        }

        /*
         * HOLD BY POLLING. Three seconds, and the budget is the hub's own deadline rather than a number
         * chosen here — `seconds_left` comes back on every poll, so the two sides cannot disagree about when
         * this expires even if the clocks differ.
         */
        const every = Math.max(1, Number(flagValue('every') ?? 3)) * 1000;
        const hardStop = Date.now() + 595_000;
        let decision = null;
        for (;;) {
            await new Promise(r => setTimeout(r, every));
            let poll;
            try {
                poll = await api(`/api/agent/permission?id=${encodeURIComponent(filed.id)}`, { cfg });
            } catch {
                /* One dropped poll is not a decision. Keep going until the budget runs out; the hub is the
                 * side holding the state, so a transient failure here loses nothing. */
                if (Date.now() > hardStop) break;
                continue;
            }
            if (poll.status === 'allowed' || poll.status === 'denied') { decision = poll.status; break; }
            if (poll.status === 'expired' || poll.seconds_left <= 0) break;
            if (Date.now() > hardStop) break;
        }

        if (!decision) {
            process.stderr.write('cc permission: no answer within the window. Asking in the terminal.\n');
            break;
        }

        /*
         * THE ONE THING THIS PRINTS ON STDOUT, and the shape is `PermissionRequest`'s rather than
         * `PreToolUse`'s. That distinction is not cosmetic: `PreToolUse` returns
         * `hookSpecificOutput.permissionDecision`, and putting that shape here would produce a hook that
         * parses cleanly, returns 200, and decides nothing at all — which would look like the relay working
         * while every request quietly fell through to the terminal.
         */
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision: { behavior: decision === 'allowed' ? 'allow' : 'deny' },
            },
        }) + '\n');
        process.stderr.write(`cc permission: ${decision} from the hub\n`);
        break;
    }

    /*
     * ==========================================================================================
     * BACKFILL — the last fortnight of activity, out of the transcripts already on this disk.
     * ==========================================================================================
     *
     * THE PROBLEM IT SOLVES, in one sentence: hooks only know about sessions that started after they
     * were installed, so a hub wired up this morning has nothing to say about last night — and a page
     * that is empty on the day it ships is exactly the failure `/agents` already had once, when it
     * rendered five rows reading "Nothing has ever reported in".
     *
     * A TRANSCRIPT IS A CONVERSATION AND NOT A SESSION, which is the finding that shapes this whole
     * command. Measured on this machine: one of his Riff_Kitchen transcripts spans **eleven days**, from
     * 28 July to 8 August, because resuming a conversation appends to the same file. Posting a file as a
     * session would have drawn an eleven-day bar that was false about almost every hour it covered.
     *
     * So a file is split into STRETCHES OF ACTIVITY at gaps of half an hour or more, and a stretch is
     * what gets a row. Every boundary is a real message timestamp; nothing is estimated, nothing is
     * rounded outward, and the hub marks every row `observed = false` so the page can draw a
     * reconstruction differently from a measurement. Across fourteen days of his own history that is
     * 271 stretches over 8 projects — a full page on the morning it ships instead of an empty one.
     *
     *   cc backfill              post the last 14 days
     *   cc backfill --days 30    a different window
     *   cc backfill --dry        count them and post nothing
     */
    case 'backfill': {
        const { readdirSync, statSync } = await import('node:fs');
        const { join: j } = await import('node:path');
        const base = flagValue('from') || j(homedir(), '.claude', 'projects');
        const days = Math.max(1, Math.min(Number(flagValue('days') ?? 14), 365));
        const cutoff = Date.now() - days * 864e5;
        /*
         * THE GAP THAT SEPARATES ONE STRETCH FROM THE NEXT. Thirty minutes.
         *
         * Short enough that a morning and an evening in the same conversation are two blocks, which is
         * what he is looking at the page to see. Long enough to survive the things that legitimately
         * produce silence inside one sitting — a long build, a test run, a sub-agent that thinks for
         * ten minutes. It is stated on the page rather than left as a number only this file knows.
         */
        const GAP = 30 * 60 * 1000;


        /* Which sessions the hub has already measured for itself. A hook's own record always beats a
         * reconstruction of the same session, and the hub refuses the overwrite anyway — this only
         * saves reading and splitting a fifty-megabyte file to produce rows that would be refused. */
        let alreadyObserved = new Set();
        if (!flags.has('--dry')) {
            try {
                const seen = await api('/api/agent/backfill', { cfg });
                alreadyObserved = new Set(seen.observed_sessions || []);
            } catch (e) {
                die(`could not ask the hub what it already has (${e.message.split('\n')[0]}). `
                    + 'Nothing was sent.');
            }
        }

        let dirs;
        try {
            dirs = readdirSync(base).filter(d => {
                try { return statSync(j(base, d)).isDirectory(); } catch { return false; }
            });
        } catch (e) {
            die(`could not read ${base} (${e.message}).\n\n`
                + '  That is where Claude Code keeps its transcripts. If yours are elsewhere, pass '
                + '--from <dir>.\n  Nothing was sent.');
        }

        const sessions = [];
        const subagents = [];
        let filesRead = 0;
        let skipped = 0;

        for (const d of dirs) {
            const dir = j(base, d);
            let entries;
            try { entries = readdirSync(dir); } catch { continue; }

            for (const f of entries.filter(x => x.endsWith('.jsonl'))) {
                const sessionUuid = f.replace(/\.jsonl$/, '');
                if (alreadyObserved.has(sessionUuid)) { skipped++; continue; }

                let text;
                try { text = readFileSync(j(dir, f), 'utf8'); } catch { continue; }

                /*
                 * One pass, collecting only what a block needs. `cwd`, `gitBranch` and the model are
                 * carried on the messages themselves, so nothing here has to be inferred from the folder
                 * name — which matters because the folder name is a mangled path and the cwd is the
                 * truth. The FIRST cwd wins for the same reason `cc spend` walks a path outward-in.
                 */
                const points = [];
                let cwd = null;
                for (const line of text.split('\n')) {
                    if (!line) continue;
                    let o;
                    try { o = JSON.parse(line); } catch { continue; }
                    if (!o.timestamp) continue;
                    const t = Date.parse(o.timestamp);
                    if (!Number.isFinite(t) || t < cutoff) continue;
                    if (!cwd && o.cwd) cwd = o.cwd;
                    const model = o?.message?.model;
                    points.push({
                        t,
                        branch: o.gitBranch || null,
                        model: model && !String(model).startsWith('<') ? model : null,
                    });
                }
                if (!points.length) continue;
                filesRead++;
                points.sort((a, b) => a.t - b.t);

                const project = projectFrom(cwd || d);
                if (!project) continue;

                let run = [points[0]];
                let index = 0;
                const flush = () => {
                    const first = run[0];
                    const last = run[run.length - 1];
                    /*
                     * A stretch of ONE message is a moment, not a span, and drawing it as a block of
                     * zero width would be a claim with no evidence behind it either way. Kept rather
                     * than dropped — it is still true that something ran — and the hub stores identical
                     * start and end times, which the page renders as a moment rather than a duration.
                     */
                    index++;
                    /* A colon, not a hash: the hub strips anything outside its session alphabet, and a
                     * stripped separator would collide stretch 1 followed by 2 with stretch 12. */
                    sessions.push({
                        project,
                        session: `${sessionUuid}:${index}`,
                        started_at: new Date(first.t).toISOString(),
                        ended_at: new Date(last.t).toISOString(),
                        branch: [...run].reverse().find(p => p.branch)?.branch ?? null,
                        model: [...run].reverse().find(p => p.model)?.model ?? null,
                    });
                    return { start: first.t, end: last.t, session: `${sessionUuid}:${index}` };
                };

                const stretches = [];
                for (let i = 1; i < points.length; i++) {
                    if (points[i].t - points[i - 1].t > GAP) { stretches.push(flush()); run = []; }
                    run.push(points[i]);
                }
                stretches.push(flush());

                /*
                 * THE SUB-AGENTS OF THIS CONVERSATION, from the harness's own sidecar files.
                 *
                 * `<session>/subagents/agent-<id>.meta.json` carries `agentType`, `description` and the
                 * `toolUseId`; the `.jsonl` beside it carries the messages, whose first and last
                 * timestamps are the span. Each one is attached to whichever stretch contains its start,
                 * so a sub-agent is nested inside the block that actually spawned it rather than beside
                 * it.
                 */
                const subDir = j(dir, sessionUuid, 'subagents');
                let subFiles = [];
                try { subFiles = readdirSync(subDir).filter(x => x.endsWith('.meta.json')); } catch { /* none */ }
                for (const m of subFiles) {
                    let meta;
                    try { meta = JSON.parse(readFileSync(j(subDir, m), 'utf8')); } catch { continue; }
                    const agentId = m.replace(/^agent-/, '').replace(/\.meta\.json$/, '');
                    let times = [];
                    let model = null;
                    try {
                        for (const line of readFileSync(j(subDir, `agent-${agentId}.jsonl`), 'utf8').split('\n')) {
                            if (!line) continue;
                            let o;
                            try { o = JSON.parse(line); } catch { continue; }
                            if (o.timestamp) {
                                const t = Date.parse(o.timestamp);
                                if (Number.isFinite(t)) times.push(t);
                            }
                            const mm = o?.message?.model;
                            if (mm && !String(mm).startsWith('<')) model = mm;
                        }
                    } catch { continue; }
                    if (!times.length) continue;
                    times.sort((a, b) => a - b);
                    const start = times[0];
                    if (start < cutoff) continue;
                    const owner = stretches.find(s => start >= s.start && start <= s.end)
                        ?? stretches[stretches.length - 1];
                    subagents.push({
                        project,
                        session: owner.session,
                        agent_id: agentId,
                        type: meta.agentType || null,
                        task: meta.description || null,
                        model,
                        started_at: new Date(start).toISOString(),
                        ended_at: new Date(times[times.length - 1]).toISOString(),
                    });
                }
            }
        }

        if (!sessions.length) {
            die(`read ${dirs.length} folder(s) under ${base} and found no activity in the last ${days} `
                + `day(s)${skipped ? `, and skipped ${skipped} session(s) the hub already measured` : ''}.\n`
                + '  Nothing was sent.');
        }

        const byProject = new Map();
        for (const s of sessions) byProject.set(s.project, (byProject.get(s.project) ?? 0) + 1);

        if (flags.has('--dry')) {
            process.stdout.write(
                `${filesRead} transcript(s) with activity in the last ${days} day(s) → `
                + `${sessions.length} stretch(es) and ${subagents.length} sub-agent(s). `
                + 'Nothing sent (--dry).\n'
                + [...byProject.entries()].sort((a, b) => b[1] - a[1])
                    .map(([p, n]) => `  ${p.padEnd(28)} ${n}`).join('\n') + '\n',
            );
            break;
        }

        const r = await api('/api/agent/backfill', {
            method: 'POST', cfg, body: { sessions, subagents },
        });
        process.stdout.write(
            `Read ${filesRead} transcript(s) and posted ${r.sessions} stretch(es) of activity and `
            + `${r.subagents} sub-agent(s) across ${byProject.size} project(s).\n`
            + (r.kept ? `  ${r.kept} left alone — the hub had measured those itself, which beats a `
                + 'reconstruction.\n' : '')
            + (skipped ? `  ${skipped} transcript(s) skipped for the same reason.\n` : '')
            + '  Marked as reconstructed rather than observed, and the page says which.\n',
        );
        break;
    }

    /*
     * ==========================================================================================
     * WHERE THE MONEY GOES — read Claude Code's own usage records and post a per-project total.
     * ==========================================================================================
     *
     * THE FINDING THAT SHAPES THIS WHOLE COMMAND: more than half of what is on disk is a duplicate.
     *
     * Measured on the machine this was written on: across 14 project folders, 35,869 records carry a
     * `message.usage` — and **40,201 more carry a `requestId` and `message.id` that has already been
     * counted**, because resuming or forking a session copies its history into a new transcript. Summed
     * naively the figure is about **2.1x** the truth, and it would be wrong in the direction that makes
     * somebody stop believing the number.
     *
     * So the deduplication is not a refinement, it is the feature. Everything else here is arithmetic.
     *
     * IT SENDS TOKENS AND A PATH, AND NOT A PROJECT OR A PRICE.
     *
     *   - the PATH, because a cwd is not a project: the same fourteen projects produce 46 distinct cwd keys,
     *     including case variants and folders four levels inside `node_modules`. The hub already knows which
     *     projects exist, so it attributes; see app/api/agent/spend/route.ts.
     *   - TOKENS rather than dollars, because the price belongs in lib/prices.ts where a correction is a
     *     deploy rather than a migration of figures somebody was told they had spent.
     */
    case 'spend': {
        const { readdirSync, statSync } = await import('node:fs');
        const { join: j } = await import('node:path');
        const base = flagValue('from') || j(homedir(), '.claude', 'projects');

        let dirs;
        try {
            dirs = readdirSync(base).filter(d => { try { return statSync(j(base, d)).isDirectory(); } catch { return false; } });
        } catch (e) {
            die(`could not read ${base} (${e.message}).\n\n`
                + '  That is where Claude Code keeps its transcripts. If yours are elsewhere, pass --from <dir>.\n'
                + '  Nothing was sent.');
        }

        /* Deepest first, and capped. The hub walks these outward-in taking the first slug it knows, so six
         * levels is far more than enough and an uncapped list would put somebody's whole directory tree on the
         * wire for no gain. */
        const pathOf = cwd => String(cwd).split(/[\\/]/).filter(Boolean).reverse()
            .map(slugify).filter(Boolean).slice(0, 6);

        const seen = new Set();
        const rows = new Map();
        let counted = 0;
        let duplicates = 0;
        let unusable = 0;

        for (const d of dirs) {
            const dir = j(base, d);
            let files;
            try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
            for (const f of files) {
                let text;
                try { text = readFileSync(j(dir, f), 'utf8'); } catch { continue; }
                for (const line of text.split('\n')) {
                    if (!line) continue;
                    let o;
                    try { o = JSON.parse(line); } catch { continue; }
                    const u = o?.message?.usage;
                    if (!u) continue;

                    /*
                     * THE DEDUPLICATION KEY. `requestId` identifies one call to the API and `message.id` one
                     * response; together they survive being copied into another transcript, which is the whole
                     * point. A record carrying NEITHER is counted rather than dropped — it cannot be matched
                     * against anything, so skipping it would understate, and understating is the failure that
                     * cannot be noticed.
                     */
                    const key = `${o.requestId || ''}|${o.message?.id || ''}`;
                    if (key !== '|') {
                        if (seen.has(key)) { duplicates++; continue; }
                        seen.add(key);
                    }

                    const cwd = o.cwd || d;
                    const segments = pathOf(cwd);
                    if (!segments.length) { unusable++; continue; }

                    /*
                     * Fast mode is a different price for the same model, and the record says which. Carried as a
                     * `:fast` suffix on the model id — see the note in lib/prices.ts for why that beats a
                     * column. Missing the distinction would report a fast-mode session at half its cost.
                     */
                    const fast = u.speed === 'fast';
                    const model = (o.message?.model || 'unknown') + (fast ? ':fast' : '');

                    const id = `${segments.join('/')}|${model}`;
                    const into = rows.get(id) ?? {
                        path: segments, model,
                        input_tokens: 0, output_tokens: 0,
                        cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, samples: 0,
                    };
                    into.input_tokens += u.input_tokens || 0;
                    into.output_tokens += u.output_tokens || 0;
                    into.cache_read += u.cache_read_input_tokens || 0;
                    /*
                     * The two TTLs are priced differently — 1.25x input for five minutes, 2x for an hour — and
                     * `cache_creation` breaks them out. Older records carry only the flat
                     * `cache_creation_input_tokens`; those are attributed to the five-minute rate, which is the
                     * cheaper of the two, so an old record can understate slightly and can never overstate.
                     */
                    const cc = u.cache_creation;
                    if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
                        into.cache_write_5m += cc.ephemeral_5m_input_tokens || 0;
                        into.cache_write_1h += cc.ephemeral_1h_input_tokens || 0;
                    } else {
                        into.cache_write_5m += u.cache_creation_input_tokens || 0;
                    }
                    into.samples += 1;
                    rows.set(id, into);
                    counted++;
                }
            }
        }

        if (!counted) {
            die(`read ${dirs.length} project folder(s) under ${base} and found no usage records.\n`
                + '  Nothing was sent, because posting an empty snapshot would REPLACE a real one.');
        }

        const source = flagValue('source') || 'this-machine';
        if (flags.has('--dry')) {
            const top = [...rows.values()].sort((a, b) => b.output_tokens - a.output_tokens).slice(0, 12);
            process.stdout.write(
                `${counted} usage record(s) counted, ${duplicates} duplicate(s) skipped`
                + `${unusable ? `, ${unusable} with no usable path` : ''}.\n`
                + `${rows.size} (folder, model) pair(s). Nothing sent (--dry). Biggest by output:\n`
                + top.map(r => `  ${r.path[0].padEnd(24)} ${r.model.padEnd(22)} `
                    + `out=${String(r.output_tokens).padStart(10)} n=${r.samples}`).join('\n') + '\n',
            );
            break;
        }

        const r = await api('/api/agent/spend', {
            method: 'POST', cfg, body: { source, rows: [...rows.values()] },
        });

        process.stdout.write(
            `Counted ${counted} usage record(s) and skipped ${duplicates} duplicate(s)`
            + `${unusable ? `, ${unusable} with no usable path` : ''}.\n`
            + `Posted as "${r.source}": ${r.projects} project(s), ${r.models} model(s).\n`
            /*
             * SAID OUT LOUD, because the fix is his to make and he can only make it if told. A third of the
             * machine's usage folded into "elsewhere" is a real answer — those folders are not projects — but
             * it is also the signal that a project he cares about has never been onboarded.
             */
            + (r.unattributed_models
                ? `  ${r.unattributed_models} (folder, model) pair(s) matched none of the hub's `
                  + `${r.known_projects} projects and went to "(elsewhere)". Onboard a folder and its spend `
                  + 'moves to its own line.\n'
                : '')
            + '  Tokens only — the hub prices them, so a rate change needs no re-run.\n',
        );
        break;
    }

    case 'wait': {
        const id = positional[0];
        if (!id) die('usage: cc wait <question-id> [--timeout 900] [--every 20]');
        const timeout = Number(flagValue('timeout') ?? 900);
        const every = Math.max(5, Number(flagValue('every') ?? 20));
        const until = Date.now() + timeout * 1000;

        /*
         * Polling, not a webhook. An agent session is not a server and cannot be called back, so the only
         * honest options are poll or give up. The default is a 15-minute wait at 20-second intervals:
         * long enough to catch an answer while the human is actually at their phone, short enough that a
         * blocked agent is not hanging around for an hour burning nothing useful.
         *
         * If the wait expires, that is NOT a failure — it is the expected case, and the right move is to
         * go and do something else and pick the answer up from `cc sync` next session. Exit code 2 marks
         * that distinctly from a real error so a script can tell them apart.
         */
        for (;;) {
            const r = await api(`/api/agent/questions?id=${encodeURIComponent(id)}`, { cfg });
            const q = r.question;

            if (q.status !== 'open') {
                const label = q.answer_option
                    ? q.options.find(o => o.key === q.answer_option)?.label ?? q.answer_option
                    : null;
                const how = q.status === 'defaulted'
                    ? 'BY DEFAULT (no human answer before the deadline)'
                    : q.answer_type === 'ignore' ? 'ignored — they do not want to decide this now'
                        : q.answer_type === 'respond' ? `replied: ${q.answer_text}`
                            : q.answer_type === 'accept' ? 'approved'
                                : `chose "${label}" (${q.answer_option})`;
                process.stdout.write(`${q.status.toUpperCase()}: ${how}\n`);
                /*
                 * The comment is printed as its own block rather than appended to the line above. It is
                 * usually a condition on the answer — "yes, but also do X" — and burying that at the end
                 * of a status line is how it gets skimmed past and then not done.
                 */
                if (q.answer_note) {
                    process.stdout.write(`\nAND THEY ADDED THIS — treat it as part of the answer:\n`);
                    for (const l of q.answer_note.split('\n')) process.stdout.write(`  ${l}\n`);
                }
                break;
            }

            if (Date.now() >= until) {
                process.stdout.write(
                    `Still unanswered after ${timeout}s. Not an error — stop waiting, do something ` +
                    `else, and pick it up from \`cc sync\`.\n`,
                );
                process.exitCode = 2;
                break;
            }
            await new Promise(r => setTimeout(r, every * 1000));
        }
        break;
    }

    default:
        process.stdout.write(
            `cc — Command Center\n\n` +
            `  cc sync                    what changed since I last looked\n` +
            `  cc ask '<json>'            ask the human a decision (does not block)\n` +
            `  cc task '<json>'           hand the human a piece of work\n` +
            `  cc onboard                 connect the project in this folder to the hub\n` +
            `  cc wait <question-id>      block until answered, or until the default fires\n` +
            `  cc repush --open           resend open questions in the current Telegram format\n` +
            `  cc drop <task-id>          withdraw a task\n` +
            `  cc health                  is the hub working\n` +
            `  cc setup <url> <token>     configure this machine\n` +
            `\n  Opt-in, per project, run in the project folder:\n` +
            `  cc presence on|off         activity hooks — what is running, and what it just said
                             (--no-words sends activity but never message text)\n` +
            `  cc approvals on|off        permission relay — answer a held tool call from your phone\n` +
            `  cc spend                   post Claude Code's per-project token totals\n` +
            `                             (add --dry to any of these to see what would change)\n\n` +
            `Config: ${CONFIG_FILE}${existsSync(CONFIG_FILE) ? '' : '  (does not exist yet)'}\n` +
            `Hub:    ${cfg.url || '(not set)'}\n` +
            `Agent:  ${cfg.agent}\n\n` +
            `Full field reference: AGENTS.md in the Command Center repo.\n`,
        );
        if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
}
}

try {
    await main();
} catch (e) {
    process.stderr.write(e instanceof Bail ? `cc: ${e.message}
` : `cc: unexpected: ${e.stack || e.message}
`);
    process.exitCode = e?.exitCode ?? 1;
}
