/**
 * Teach one project about the hub. THE BULK CASE ONLY — for one project, prefer `cc onboard`.
 *
 *   node scripts/install-into-project.mjs "<absolute path to a project>"
 *   node scripts/install-into-project.mjs --all "<parent folder of your projects>"
 *
 * WHEN NOT TO USE THIS, because it is most of the time
 *
 * This script needs the hub repository checked out AND its `.env.local`, because it reads
 * `CC_AGENT_TOKEN` from there to fetch the snippet. `node "$HOME/.command-center/cc.mjs" onboard` needs neither —
 * only `cc setup` having been run once, whose config lives in `~/.command-center/config.json`. So `cc onboard`
 * is the documented path everywhere and this exists for exactly one thing this cannot do: `--all`, a folder
 * of projects in one pass, on the machine that has the repo.
 *
 * Does three things:
 *
 *   1. Copies cli/cc.mjs to ~/.command-center/cc.mjs, so the command in AGENTS.md resolves on this
 *      machine regardless of which project you are in. (A machine with no repo gets the same file from
 *      `GET /api/agent/cc.mjs` instead — the hub serves its own CLI.)
 *   2. Writes the managed block into the project's AGENTS.md. THE TEXT IS FETCHED FROM THE HUB, from
 *      `lib/snippet.ts` via `/api/agent/snippet` — see the comment on `fetchSnippet` below for why. It used
 *      to be read from a static `install/AGENTS.snippet.md`; that directory no longer exists, and this
 *      header claimed otherwise for as long as it did not.
 *      AGENTS.md is the format that Claude Code, Codex, Cursor, Gemini CLI, Copilot, Aider, Devin,
 *      Windsurf and Amazon Q all read, and it now sits under the Agentic AI Foundation rather than any
 *      one vendor (docs/RESEARCH.md §2). It is the only hook honoured by every tool in rotation.
 *   3. Adds a one-line POINTER to CLAUDE.md and GEMINI.md if they already exist.
 *
 * Step 3 is a pointer and never a copy. Duplicating the instructions into three files means three
 * versions that drift, and the drifted one is the one an agent happens to read. One source of truth,
 * two signposts.
 *
 * Re-running is safe: the block between the BEGIN/END markers is replaced, not appended.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/*
 * THE MARKERS AND THE POINTER COME FROM THE HUB'S RESPONSE, and are deliberately not declared in this file.
 *
 * They used to be constants here, and they drifted exactly as this file's own header predicts a duplicate
 * will: the pointer named the owner personally, and it said "Start the session with cc sync" — the short form
 * of the rule `lib/snippet.ts` spends a whole section correcting, because an agent that syncs only at the
 * start of a session acts for the rest of it on what was true at the beginning.
 *
 * `/api/agent/snippet` returns `begin`, `end` and `pointer` alongside the snippet for precisely this reason,
 * and `cc onboard` has always used them. This script was the last copy left.
 */

const args = process.argv.slice(2);
const all = args.includes('--all');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
    console.error('usage: node scripts/install-into-project.mjs <project-dir>   [or --all <parent-dir>]');
    process.exit(1);
}

/* ---------------------------------------------------------------- 1. the CLI, once per machine */

const cliDir = join(homedir(), '.command-center');
mkdirSync(cliDir, { recursive: true });
copyFileSync(join(root, 'cli', 'cc.mjs'), join(cliDir, 'cc.mjs'));
console.log(`cc.mjs → ${join(cliDir, 'cc.mjs')}`);

/* ---------------------------------------------------------------------------- 2 & 3. per project */

/*
 * The snippet is FETCHED FROM THE HUB, not read from a file in this repo.
 *
 * It used to live in install/AGENTS.snippet.md. That made this repo the only place the text existed, so the
 * one command an agent needed contained an absolute path to this directory — useless on any other machine
 * and impossible for a cloud agent. It also meant two copies once the hub started serving it, and two
 * copies of anything drift.
 *
 * Now lib/snippet.ts is the single source, the hub serves it at /api/agent/snippet, and both this script
 * and `cc onboard` fetch it. Prefer `cc onboard` — this script exists for the bulk --all case.
 */
async function fetchSnippet(slug) {
    process.loadEnvFile(join(root, '.env.local'));

    /*
     * NO FALLBACK URL. It used to default to one specific deployment, which is a convenience on the machine
     * that owns that deployment and a trap everywhere else: a misconfigured install would send its snippet
     * request to somebody else's hub and get a 401 that names no cause. An absent value fails with the
     * variable to set, which is a sentence you can act on.
     */
    const hub = (process.env.CC_PUBLIC_URL || '').replace(/\/+$/, '');
    const token = process.env.CC_AGENT_TOKEN;
    if (!hub) {
        console.error(
            'CC_PUBLIC_URL is not set in .env.local, so there is no hub to fetch the instructions from.\n' +
            '  Set it to your own hub, e.g. CC_PUBLIC_URL=https://your-hub.vercel.app\n' +
            '  Or skip this script entirely and run `node "$HOME/.command-center/cc.mjs" onboard` in the project,\n' +
            '  which needs no repository and no .env.local.',
        );
        process.exitCode = 1;
        return null;
    }
    if (!token) {
        console.error('CC_AGENT_TOKEN is not set in .env.local, so the snippet cannot be fetched.');
        process.exitCode = 1;
        return null;
    }
    const res = await fetch(`${hub}/api/agent/snippet?project=${encodeURIComponent(slug)}`, {
        headers: { authorization: `Bearer ${token}`, 'x-cc-agent': 'installer' },
    });
    if (!res.ok) {
        console.error(`could not fetch the snippet from ${hub} (HTTP ${res.status})`);
        process.exitCode = 1;
        return null;
    }
    // The whole object: the snippet, its markers, and the one-line pointer. See the note above the imports.
    return await res.json();
}

function slugFor(dir) {
    return dir.split(/[\\/]/).filter(Boolean).pop()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

async function installInto(dir) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        console.error(`  skip ${dir} — not a directory`);
        return false;
    }

    const slug = slugFor(dir);
    // The hub personalises the snippet with the slug, so an agent never has to invent one and two agents in
    // the same project cannot pick different ones.
    const served = await fetchSnippet(slug);
    const personalised = served?.snippet;
    if (!personalised) return false;

    const BEGIN = served.begin;
    const END = served.end;
    const POINTER = served.pointer;
    if (!BEGIN || !END || !POINTER) {
        // Fail loudly rather than writing a block with no markers, which would append a second copy on every
        // re-run — the drifting-duplicate failure this whole path exists to avoid.
        console.error(`  skip ${dir} — the hub did not return the markers and the pointer`);
        return false;
    }

    const agentsPath = join(dir, 'AGENTS.md');
    let content = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';

    if (content.includes(BEGIN) && content.includes(END)) {
        const before = content.slice(0, content.indexOf(BEGIN));
        const after = content.slice(content.indexOf(END) + END.length);
        content = before + personalised + after;
    } else {
        const header = content.trim() ? content.trimEnd() + '\n\n' : `# ${slug}\n\n`;
        content = header + personalised + '\n';
    }
    writeFileSync(agentsPath, content, 'utf8');

    // Pointers only, and only into files that already exist — creating a CLAUDE.md in a project that
    // deliberately has none would be an unasked-for change to how that project behaves.
    const pointers = [];
    for (const name of ['CLAUDE.md', 'GEMINI.md', 'gemini.md']) {
        const p = join(dir, name);
        if (!existsSync(p)) continue;
        const existing = readFileSync(p, 'utf8');
        if (existing.includes('Command Center')) continue;
        writeFileSync(p, `${existing.trimEnd()}\n\n## Command Center\n\n${POINTER}\n`, 'utf8');
        pointers.push(name);
    }

    console.log(`  ${slug}: AGENTS.md ${pointers.length ? `+ pointer in ${pointers.join(', ')}` : '(no vendor files)'}`);
    return true;
}

if (all) {
    const parent = resolve(target);
    // Only directories that look like projects. A folder of images does not need agent instructions.
    const candidates = readdirSync(parent).filter(name => {
        const dir = join(parent, name);
        if (!statSync(dir).isDirectory()) return false;
        return existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git'))
            || existsSync(join(dir, 'CLAUDE.md')) || existsSync(join(dir, 'AGENTS.md'));
    });
    console.log(`\nInstalling into ${candidates.length} project(s) under ${parent}:`);
    let n = 0;
    for (const name of candidates) if (await installInto(join(parent, name))) n++;
    console.log(`\nDone: ${n} project(s).`);
} else {
    console.log(`\nInstalling into ${resolve(target)}:`);
    await installInto(resolve(target));
}
