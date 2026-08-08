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
 *   cc presence  on|off|status  install the two heartbeat hooks in THIS project
 *   cc approvals on|off|status  install the permission-relay hook in THIS project
 *   cc spend                    read Claude Code's usage records and post per-project totals
 *   cc heartbeat                (called BY a hook, reads its JSON on stdin — not for a human)
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.command-center');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

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
        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const inferred = slugify(process.cwd().split(/[\\/]/).filter(Boolean).pop() || '');
        const project = flags.has('--all') ? null : (flagValue('project') || inferred || null);

        const since = flagValue('since');
        const qs = new URLSearchParams();
        if (since != null) qs.set('since', since);
        if (project) qs.set('project', project);
        const r = await api(`/api/agent/sync${qs.size ? `?${qs}` : ''}`, { cfg });
        process.stdout.write((flags.has('--json') ? JSON.stringify(r, null, 2) : renderSync(r)) + '\n');
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
        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const dir = process.cwd();
        const slug = flagValue('project') || slugify(dir.split(/[\\/]/).filter(Boolean).pop() || '');
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
        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const dir = process.cwd();
        const slug = flagValue('project') || slugify(dir.split(/[\\/]/).filter(Boolean).pop() || '');
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
        const HOOKS = {
            presence: [
                /*
                 * `timeout` is set on BOTH, and on SessionEnd it is not optional. Claude Code gives SessionEnd
                 * hooks a shared 1.5-second budget and raises it to match an explicit per-hook timeout — so
                 * without this the "the session finished" heartbeat would be cancelled before an HTTP round
                 * trip completed, and every session would stay open forever on the page.
                 */
                { event: 'SessionStart', command: `${CC} heartbeat`, timeout: 15 },
                { event: 'SessionEnd', command: `${CC} heartbeat --end`, timeout: 15 },
            ],
            approvals: [
                /*
                 * 600 seconds, stated rather than defaulted. It IS the default for a command hook, and writing
                 * it out is what makes the ten-minute promise visible in the file somebody reads when they
                 * wonder how long the hub is allowed to hold their agent up.
                 */
                { event: 'PermissionRequest', command: `${CC} permission`, timeout: 600 },
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

        /* Identified by the command string rather than by a marker field. A marker would be an unknown key in
         * somebody else's schema; the command names this CLI and its subcommand, which is unambiguous and
         * cannot be invalidated by a settings-format change. */
        const mine = h => typeof h?.command === 'string' && h.command.includes('cc.mjs')
            && HOOKS.some(x => h.command.includes(` ${x.command.split(' ').slice(-1)[0]}`)
                || h.command.endsWith(x.command.slice(CC.length).trim()));

        const installed = [];
        for (const { event } of HOOKS) {
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
                    : `  nothing installed. \`cc ${cmd} on\` adds ${HOOKS.map(h => h.event).join(' and ')}.\n`),
            );
            break;
        }

        /* Remove ours first, in both cases. `on` is then idempotent by construction rather than by a check —
         * running it twice cannot produce two SessionStart hooks, which would post two heartbeats. */
        settings.hooks = settings.hooks ?? {};
        for (const { event } of HOOKS) {
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
            for (const { event, command, timeout } of HOOKS) {
                settings.hooks[event] = settings.hooks[event] ?? [];
                settings.hooks[event].push({ hooks: [{ type: 'command', command, timeout }] });
            }
        }
        if (!Object.keys(settings.hooks).length) delete settings.hooks;

        if (flags.has('--dry')) {
            process.stdout.write(
                `Would ${verb === 'on' ? 'write' : 'remove'} ${HOOKS.map(h => h.event).join(' and ')} in\n`
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
        const now = HOOKS.filter(({ event }) =>
            (back.hooks?.[event] ?? []).some(g => (g.hooks ?? []).some(mine)));
        if (verb === 'on' && now.length !== HOOKS.length) {
            die(`wrote ${settingsPath} but only ${now.length} of ${HOOKS.length} hooks read back. `
                + 'Assume this is NOT on.');
        }
        if (verb === 'off' && now.length !== 0) {
            die(`wrote ${settingsPath} but ${now.length} hook(s) are still there. Assume this is still ON.`);
        }

        process.stdout.write(
            verb === 'on'
                ? `${cmd} ON for "${slug}" — ${HOOKS.map(h => h.event).join(' and ')} in ${settingsPath}\n`
                  + '  No token is in that file, so it is safe to commit.\n'
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

        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || slugify(String(cwd).split(/[\\/]/).filter(Boolean).pop() || '');
        const session = hook.session_id || flagValue('session') || 'unknown';
        const ending = flags.has('--end');

        if (!project || session === 'unknown') {
            /* Said on stderr, which lands in the transcript rather than in the model's context, and still
             * exits 0. A heartbeat that cannot identify itself is not worth failing a session over. */
            process.stderr.write('cc heartbeat: no project or session id on stdin; nothing sent\n');
            break;
        }

        const body = { project, session };
        if (ending) {
            body.ended = true;
            body.end_reason = hook.reason || null;
        } else {
            /*
             * The branch and the model, read off the machine rather than composed. There is deliberately no
             * field describing what the session is DOING — see lib/presence.ts: an agent asked to report its
             * own state reports favourably, and one green-while-you-slept status poisons the page.
             */
            body.model = hook.model || null;
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

        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const cwd = hook.cwd || process.cwd();
        const project = flagValue('project') || slugify(String(cwd).split(/[\\/]/).filter(Boolean).pop() || '');
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

        const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
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
            `  cc presence on|off         heartbeat hooks — is anything working on this project\n` +
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
