/**
 * WHAT PUBLISHING THIS WOULD ACTUALLY PUT ON THE INTERNET — built in a scratch directory, then searched.
 *
 *   node scripts/publish-dry-run.mjs
 *
 * ==================================================================================================
 * WHY A FRESH `git init` AND NOT A VISIBILITY TOGGLE
 * ==================================================================================================
 *
 * This repository's history contains the owner's real work. `scripts/seed-real.mjs` was deleted in commit
 * 3f07f48 and every commit before it still has it — real tasks about a real project, with the paths of the
 * files they came from. `git show <sha>^:scripts/seed-real.mjs` returns the lot. Flipping a GitHub repository
 * from private to public publishes the whole history, so it is not an option: the publish path is a fresh
 * repository with ONE commit containing the current tree.
 *
 * That is easy to get wrong in a way nobody notices, because the mistake is invisible in the working
 * directory — you would be looking at exactly the right files while the wrong ones were being pushed. So this
 * builds the candidate the same way the real publish would, and then reads it.
 *
 * ==================================================================================================
 * WHAT IT DOES AND WHAT IT REFUSES TO DO
 * ==================================================================================================
 *
 * It copies every file `git ls-files` reports — which is exactly what a fresh `git add .` would carry, because
 * both obey `.gitignore` — into a temporary directory, initialises a repository there, makes one commit, and
 * then searches the result for the things that must not be in it. It never adds a remote and it never pushes.
 * The last thing it prints is the command the owner would run to publish for real, so the decision stays his.
 *
 * IT SEARCHES FOR REAL STRINGS RATHER THAN FOR SHAPES. The patterns below were recovered FROM the deleted
 * seed script in this repository's own history, so they are the actual sentences that must not appear, not a
 * guess at what personal data looks like. A check that searches for what it imagines is a check that passes.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = root) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let problems = 0;
const say = (ok, line, detail = '') => {
    if (!ok) problems++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${line}${detail ? `\n          ${detail}` : ''}`);
};

console.log('\nBuilding the publish candidate in a scratch directory\n');

/* ---------------------------------------------------------------- 1. the candidate, built like the real thing */

const files = git(['ls-files']).split('\n').filter(Boolean);
const scratch = mkdtempSync(join(tmpdir(), 'cc-publish-'));
for (const f of files) {
    const to = join(scratch, f);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, f), to);
}
git(['init', '-q'], scratch);
git(['add', '.'], scratch);
/*
 * NO `-c user.email`. AGENTS.md's committing rule exists because an agent once set the author from its own
 * session metadata, that address was the owner's WORK email, and Vercel refused the build. The machine's
 * config is right because a human set it — and this dry run has to carry the SAME identity the real publish
 * would, or it is not measuring the thing it claims to.
 */
git(['commit', '-q', '-m', 'Command Center'], scratch);

const commits = git(['rev-list', '--count', 'HEAD'], scratch).trim();
say(commits === '1', `the candidate has exactly ${commits} commit`,
    commits === '1' ? '' : 'a fresh publish must be one commit, or the history it was built to shed is back');

/* Reachable history is the whole point: if HEAD has a parent, the old commits came with it. */
let hasParent = true;
try { git(['rev-parse', '-q', '--verify', 'HEAD^'], scratch); } catch { hasParent = false; }
say(!hasParent, 'HEAD has no parent, so no earlier commit is reachable');

const author = git(['log', '-1', '--format=%an <%ae>'], scratch).trim();
console.log(`\n  the one commit is authored as: ${author}`);
console.log('  (from this machine\'s git config, which is what the real publish would use)\n');

/* ---------------------------------------------------------------- 2. what a reader would find in it */

/**
 * The things that must not be in the candidate, and where each one came from.
 *
 * Every `what` here was read out of this repository's own history rather than imagined. `severity` separates
 * "this is his private work" from "this names something of his" — the second is a judgement for the owner and
 * the first is not.
 */
/*
 * TWO OF THESE PATTERNS WERE WRONG ON THE FIRST RUN, AND BOTH WERE WRONG IN THE SAME DIRECTION.
 *
 * `postgresql://` and `CC_WEB_TOKEN=` matched **README.md** and **.env.example** — a documented example of what
 * a connection string looks like, and a variable name with no value in the one env file that must ship. And
 * `seed-real` matched twelve lines of docs that RECORD the deletion, which is a thing this project requires:
 * tests/docs-rot.mjs exists partly because *"a record of a deletion has to name the thing that was deleted."*
 *
 * So the first version of this script failed on three pieces of entirely correct content, which is the same
 * defect check L9 had this morning: a check that goes red on the right answer is a check the next person
 * silences. What must not ship is a token WITH A VALUE, a connection string WITH CREDENTIALS IN IT, and the
 * seed script AS A FILE — not the words for any of them.
 */
/*
 * HIS REAL SENTENCES ARE READ OUT OF THE HISTORY, NOT WRITTEN DOWN HERE — and the first version of this script
 * got that exactly wrong.
 *
 * It listed the real task titles as literal patterns, which put them **into the publish candidate**: the check
 * became the leak, and it correctly failed on itself. A file that searches for private data by quoting it has
 * published the data.
 *
 * So the strings come from `git show <sha>^:scripts/seed-real.mjs` at run time — the very history the fresh
 * `git init` exists to leave behind. Nothing private is written in this file, the patterns cannot drift from
 * what was actually in that script, and running this inside an already-published copy (where that history does
 * not exist) reports NOT MEASURED rather than a green tick.
 */
/**
 * Who and what this machine says the owner is, read from places that are not committed.
 *
 * `git config` holds the identity the publish commit would carry. `.env.local` holds the hub's own address and
 * is gitignored, so reading it here cannot put it into the candidate. The other projects' slugs come out of the
 * deleted seed script, which is the one place they were ever written down as HIS.
 */
function personalPatterns() {
    const out = [];
    const add = (value, what) => {
        if (value && String(value).length > 3) out.push({ pattern: String(value), what, severity: 'personal' });
    };

    try {
        const email = git(['config', 'user.email']).trim();
        add(email, 'the email address on this machine\'s git identity');
        /* The local part on its own, because it is also his GitHub handle and appears in clone URLs. Those are
         * legitimate — the repository has to live somewhere — so this is here to be counted, not to fail. */
        add(email.split('@')[0], 'the local part of that address, which is also the GitHub handle');
    } catch { /* no git identity configured; nothing to look for */ }

    try {
        process.loadEnvFile(join(root, '.env.local'));
        if (process.env.CC_PUBLIC_URL) {
            add(new URL(process.env.CC_PUBLIC_URL).hostname, 'the address of the live hub');
        }
    } catch { /* no .env.local, which is the normal case on a fresh clone */ }

    for (const slug of seedProjects) {
        add(slug, 'the slug of one of his real projects');
        /* The on-disk form: a hyphenated slug becomes Title_Case in the Windows path it was cloned to. */
        add(slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('_'),
            'the on-disk folder name of one of his real projects');
    }
    return out;
}

const SEED_PATH = 'scripts/seed-real.mjs';
const seedProjects = [];
const seedStrings = (() => {
    let sha = '';
    try {
        // The commit that DELETED it; its parent is the last one that had it.
        sha = git(['log', '-1', '--format=%H', '--diff-filter=D', '--', SEED_PATH]).trim();
        if (!sha) return [];
        const seed = git(['show', `${sha}^:${SEED_PATH}`]);
        /* The projects those real items belonged to, minus this one — `command-center` is this repository and
         * naming it is not a leak. */
        for (const m of seed.matchAll(/project:\s*'([a-z0-9-]+)'/g)) {
            if (m[1] !== 'command-center' && !seedProjects.includes(m[1])) seedProjects.push(m[1]);
        }
        const found = [...seed.matchAll(/(?:title|verify|context|why):\s*'((?:[^'\\]|\\.){24,110})'/g)]
            .map(m => m[1].replace(/\\'/g, "'").trim())
            /* Long enough to be a sentence of his rather than a word that could occur anywhere. */
            .filter(s => s.length >= 24);
        return [...new Set(found)].slice(0, 12);
    } catch {
        return [];
    }
})();
say(seedStrings.length > 0,
    `${seedStrings.length} of his real sentences recovered from history to search for`,
    seedStrings.length ? '' : 'NOT MEASURED — the deleted seed script could not be read out of this ' +
        'repository\'s history, so nothing was compared against his real work. If this is already a ' +
        'published copy, that is expected; here it is a failure.');

const FORBIDDEN = [
    ...seedStrings.map(s => ({ pattern: s, what: 'one of his real task or decision sentences', severity: 'data' })),
    /*
     * Credentials, matched as VALUES. A 20-character run after the `=` is a real token; the name alone is
     * documentation. The connection string needs a `:…@` — user and password — before it is a credential.
     */
    { regex: '(CC_AGENT_TOKEN|CC_WEB_TOKEN|CC_TELEGRAM_SECRET|TELEGRAM_BOT_TOKEN)=[A-Za-z0-9_:-]{20,}',
        what: 'a token with a value in it', severity: 'secret' },
    /*
     * ...and A DOCUMENTED EXAMPLE IS NOT A CREDENTIAL, which took two goes to express properly.
     *
     * `docs/SETUP.md` shows the shape of a Neon string with `XXXXXXXX` where the password goes, and
     * `tests/prove-health-fails.mjs` uses `nobody:nothing@…invalid.neon.tech` as a deliberately dead database.
     * Both were reported as leaks. A list of placeholder words would have covered those two and missed the third
     * one somebody writes next week, so the test is a PROPERTY instead: a real password is long and mixed.
     *
     * Twelve characters with at least one letter and one digit. Every Neon password matches; `XXXXXXXX` (eight,
     * no digit), `nothing`, `<paste yours>` and `****` do not. It can still be fooled — but by a string that
     * looks exactly like a credential, which is the right way round for this check to be wrong.
     */
    { regex: 'postgresql://[^\\s`<]+:[^\\s`<]+@', what: 'a connection string with credentials', severity: 'secret',
        ignore: (line) => {
            const pw = /postgresql:\/\/[^\s`<:]+:([^\s`<@]+)@/.exec(line)?.[1] ?? '';
            const strong = pw.length >= 12 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
            return !strong;
        } },
    /*
     * PERSONAL IDENTIFIERS, DISCOVERED RATHER THAN QUOTED — for the same reason his task titles are.
     *
     * The first version listed his email address, his employer's domain and his hub's hostname as literals,
     * which put all three into the candidate it was checking. Every one of these now comes from somewhere on
     * the machine that is not committed: `git config`, `.env.local`, and the seed script in the history. So this
     * file names nothing, and it works on a fork — where "my identifiers" are different values and the question
     * is the same one.
     */
    ...personalPatterns(),
];

/*
 * THE SEED SCRIPT ITSELF, as a file rather than as a word — which is the only form of it that matters.
 *
 * `git show <sha>^:scripts/seed-real.mjs` returning his real tasks is the whole reason the publish path is a
 * fresh repository. What has to be true of the candidate is that the FILE is not in it; the docs that record
 * its deletion are supposed to name it.
 */
say(!files.includes('scripts/seed-real.mjs'),
    'the real-work seed script is not a file in the candidate',
    files.includes('scripts/seed-real.mjs') ? 'scripts/seed-real.mjs is tracked and would be published' : '');

/* `git grep` over the candidate's own commit: it reads what was COMMITTED rather than what is on disk, which
 * is the difference between checking the publish and checking the copy. `-F` is a literal search. */
const hits = new Map();
for (const rule of FORBIDDEN) {
    let out = '';
    const args = rule.regex
        ? ['grep', '-I', '-n', '-E', '-i', '--', rule.regex, 'HEAD']
        : ['grep', '-I', '-n', '-F', '-i', '--', rule.pattern, 'HEAD'];
    try {
        out = git(args, scratch);
    } catch { /* git grep exits 1 when there is no match, which is the good case */ }
    const lines = out.split('\n').filter(Boolean).filter(l => !rule.ignore?.(l));
    if (lines.length) hits.set(rule, lines);
}

const bySeverity = sev => [...hits.entries()].filter(([r]) => r.severity === sev);

const secrets = bySeverity('secret');
say(secrets.length === 0, 'no credential of any kind is in the candidate',
    secrets.map(([r, l]) => `${r.what}: ${l.length} line(s), first at ${l[0].split(':').slice(1, 3).join(':')}`)
        .join('\n          '));

/*
 * AND SEPARATELY: NOTHING THAT WILL MAKE GITHUB'S SCANNER SHOUT AT WHOEVER CLONES IT.
 *
 * The check above was correct and insufficient, which is a distinction worth keeping. It asks "is a real
 * credential in here", the answer was no, and the repository was published — and within minutes GitHub emailed
 * the owner: "Anyone with read access can view exposed secrets. Consider rotating and revoking each valid
 * secret to avoid any irreversible damage." It had matched two INVENTED fixtures in tests/prove-failures.mjs
 * that exist to prove the hub refuses key material.
 *
 * Nothing was exposed. That is exactly why it mattered: every person deploying their own copy would have got
 * the same email as their first experience of a tool whose whole premise is that it never misleads them, and a
 * false alarm about leaked credentials teaches its reader to dismiss the next one.
 *
 * So this asserts the weaker, publishable property: no line matches a shape a scanner will flag, whether or not
 * it is real. The fixtures satisfy it by being assembled from fragments at runtime — see the comment above
 * FAKE_CREDENTIALS. A check that is right about the fact can still be wrong about the consequence.
 */
const SCANNER_SHAPES = [
    ['a Google API key', /AIza[0-9A-Za-z_-]{35}/],
    ['a Telegram bot token', /\b\d{8,10}:AA[0-9A-Za-z_-]{32,}/],
    ['an OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
    ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
    ['a Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}/],
    ['an AWS secret access key', /\baws_secret_access_key\s*=\s*\S+/i],
];

const scannerHits = [];
for (const rel of files) {
    if (/\.(png|jpg|jpeg|gif|ico|woff2?|lock)$/i.test(rel)) continue;
    let text;
    try { text = readFileSync(join(scratch, rel), 'utf8'); } catch { continue; }
    text.split(/\r?\n/).forEach((line, i) => {
        for (const [what, re] of SCANNER_SHAPES) {
            if (re.test(line)) scannerHits.push(`${what} — ${rel}:${i + 1}`);
        }
    });
}

say(scannerHits.length === 0,
    'nothing in the candidate matches a shape GitHub\'s secret scanner flags',
    scannerHits.join('\n          '));

const data = bySeverity('data');
say(data.length === 0, 'none of his real work is in the candidate',
    data.map(([r, l]) => `${r.what} (${r.pattern}): ${l.length} line(s)\n            ${l[0].slice(0, 150)}`)
        .join('\n          '));

/*
 * PERSONAL IDENTIFIERS ARE REPORTED, NOT FAILED — and the distinction is deliberate.
 *
 * A credential in the tree is a defect with one correct answer. "This names his hub" is a judgement about how
 * public he wants to be, and §XXI.C already made it once for `docs/ENVIRONMENT.md` and the README while
 * deliberately LEAVING the mentions inside historical documents: *"most of them historical records that should
 * not be edited."* This script's job is to make sure he is deciding with the real numbers in front of him
 * rather than discovering them afterwards.
 */
const personal = bySeverity('personal');
console.log('\n  personal identifiers, for a decision rather than a check:');
if (!personal.length) console.log('    none');
for (const [rule, lines] of personal) {
    const where = [...new Set(lines.map(l => l.split(':')[1]))];
    console.log(`    ${String(lines.length).padStart(3)} mention(s) of ${rule.what} (${rule.pattern ?? rule.regex})`);
    console.log(`        in ${where.length} file(s): ${where.slice(0, 6).join(', ')}` +
        (where.length > 6 ? `, +${where.length - 6} more` : ''));
}

/* ---------------------------------------------------------------- 3. is it a repository somebody can use? */

const has = f => files.includes(f);
say(has('.env.example'), '.env.example is tracked, so the first documented command works from a clean clone',
    has('.env.example') ? '' : 'README opens with `cp .env.example .env.local`, which would fail');
say(!files.some(f => f.startsWith('.env.local')), 'no .env.local is tracked');
say(has('LICENSE'), 'the licence is in it');
say(has('README.md') && has('AGENTS.md'), 'the README and the agent guide are in it');

/* The README's own screenshots have to exist in the candidate, or the first thing a reader sees is a broken
 * image. They live under tests/shots, which is committed on purpose (see .gitignore). */
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
const missing = images.filter(p => !has(p));
say(images.length > 0 && missing.length === 0,
    `${images.length} README image(s), all of them in the candidate`,
    missing.length ? `missing: ${missing.join(', ')}` : '');

const bytes = files.reduce((n, f) => n + statSync(join(root, f)).size, 0);
console.log(`\n  ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB` +
    `\n  scratch copy: ${scratch}`);

/* ---------------------------------------------------------------- 4. what the owner would run */

console.log(`
  NOTHING WAS PUBLISHED. To do it for real, from a copy rather than from this working tree:

    rm -rf ../publish && mkdir ../publish
    git ls-files | tar -cT - | tar -xC ../publish     # exactly what this script just copied
    cd ../publish && git init && git add . && git commit -m "Command Center"
    gh repo create TheCommandCenter --public --source=. --push

  Then delete the scratch copy above. The existing repository stays private and keeps its history.
`);

rmSync(scratch, { recursive: true, force: true });

console.log(problems === 0
    ? '  Nothing that must not ship is in the candidate.\n'
    : `  ${problems} problem(s) — do not publish until these are answered.\n`);
process.exitCode = problems === 0 ? 0 : 1;
