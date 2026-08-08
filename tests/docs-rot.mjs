/**
 * THE DOCUMENTATION IS NOW LOAD-BEARING, SO IT GETS CHECKED LIKE CODE.
 *
 *   npm run prove:docs
 *
 * README.md's setup section is a prompt a stranger pastes at their agent, and it names things by hand: an npm
 * script, a file to copy, two documents to read. Nothing enforced that any of them existed. That is not a
 * hypothetical rot: `.gitignore`'s own comment records the time `.env*` matched `.env.example` so it had never
 * been committed, and the guide's FIRST instruction -- `cp .env.example .env.local` -- failed on every fresh
 * clone with "No such file or directory". Nobody had run step one of their own setup guide.
 *
 * A broken instruction in a README is worse than a broken function, because the person who hits it has no
 * context, no stack trace and no reason to assume the fault is not theirs. They just leave.
 *
 * So this reads the docs the way a reader would, extracts every promise that can be mechanically checked, and
 * checks it:
 *
 *   - every `npm run X` named anywhere in the docs is a real script in package.json
 *   - every relative markdown link points at a file that exists
 *   - every backticked repo path (docs/..., lib/..., tests/..., scripts/..., app/...) exists
 *
 * It cannot check that the prose is TRUE -- only that the things it names are there. That is a real limit and
 * it is worth stating: this catches renames and deletions, which is the failure that actually happens, and it
 * would not have caught a step that was simply wrong.
 *
 * No server, no database, no browser. Runs in about a second, so it belongs in front of every push.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const scripts = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts);

/*
 * TWO TIERS, AND THE REASON IS A FLAW IN THE FIRST VERSION OF THIS FILE.
 *
 * Run across every document, this reported 21 broken references and almost all of them were correct prose. The
 * iteration log records that `scripts/seed-real.mjs` was DELETED; docs/ENVIRONMENT.md explains why
 * `scripts/migrate-riff-kitchen.mjs` no longer exists. **A record of a deletion has to name the thing that was
 * deleted.** A check that fires on those is not finding rot, it is punishing history — and a check that cries
 * wolf on twenty true sentences is a check that gets deleted or ignored, which is worse than never writing it.
 *
 * So it fails only on the documents a STRANGER FOLLOWS, where a wrong path costs someone their first ten
 * minutes. Everything else is advisory: printed, counted, and never fatal, because the archive is allowed to
 * discuss things that are gone.
 */
const FOLLOWED = ['README.md', 'docs/SETUP.md', 'docs/API.md']
    .filter(f => existsSync(join(root, f)));

const ARCHIVE = ['AGENTS.md', ...readdirSync(join(root, 'docs'))
    .filter(f => f.endsWith('.md'))
    .map(f => 'docs/' + f)]
    .filter(f => existsSync(join(root, f)) && !FOLLOWED.includes(f));

const FILES = [...FOLLOWED, ...ARCHIVE];

/*
 * Only paths that look like this repo's own files. A bare word in backticks is usually a flag, a column name or
 * a token, and treating those as paths would produce noise that gets the whole check ignored -- which is how a
 * check becomes a formality.
 */
const REPO_PATH = /^(?:docs|scripts|lib|app|tests|public)\/[A-Za-z0-9._\/-]+$/;

const problems = [];
const advisories = [];
let scriptRefs = 0;
let linkRefs = 0;
let pathRefs = 0;

for (const file of FILES) {
    const bucket = FOLLOWED.includes(file) ? problems : advisories;
    const text = readFileSync(join(root, file), 'utf8');
    const where = (needle) => {
        const idx = text.indexOf(needle);
        if (idx === -1) return file;
        return file + ':' + (text.slice(0, idx).split('\n').length);
    };

    /* npm run <script> */
    for (const m of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
        scriptRefs++;
        const name = m[1];
        if (!scripts.includes(name)) {
            bucket.push(where(m[0]) + '  names `npm run ' + name + '`, which is not in package.json');
        }
    }

    /* Relative markdown links. Skip URLs, anchors, and mail. */
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        linkRefs++;
        const clean = target.split('#')[0];
        if (!clean) continue;
        /* Links are relative to the file they are in, which for docs/*.md is the docs directory. */
        const base = file.includes('/') ? join(root, dirname(file)) : root;
        if (!existsSync(join(base, clean))) {
            bucket.push(where(m[0]) + '  links to ' + target + ', which does not exist');
        }
    }

    /* Backticked repo paths. */
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
        const candidate = m[1].trim();
        if (!REPO_PATH.test(candidate)) continue;
        pathRefs++;
        if (!existsSync(join(root, candidate))) {
            bucket.push(where(m[0]) + '  mentions ' + candidate + ', which does not exist');
        }
    }
}

/*
 * .env.example is checked BY NAME and separately, because it is the one file whose absence has already broken
 * this repository's setup guide, and because it is invisible to the rules above: it is not a markdown link and
 * it does not match a repo path pattern. A check that would not have caught the bug it was written for is a
 * check that only looks like one.
 */
const envExample = existsSync(join(root, '.env.example'));
if (!envExample) {
    problems.push('.env.example is missing, and README tells every new user to copy it as their first step');
}

console.log('');
console.log('Checking what the documentation promises exists');
console.log('');
console.log('  ' + (problems.length ? 'FAIL' : 'ok  ') + '  ' + FILES.length + ' documents: '
    + scriptRefs + ' npm scripts, ' + linkRefs + ' relative links, ' + pathRefs + ' repo paths named');
console.log('  ' + (envExample ? 'ok  ' : 'FAIL') + '  .env.example is committed, so step one of the guide works on a fresh clone');

for (const p of problems) console.log('        ' + p);

/*
 * Advisories are printed but never fatal. They are almost always an archive document correctly naming something
 * that has since been deleted, which is history doing its job — but they are printed rather than swallowed,
 * because occasionally one is a genuinely stale instruction to an agent and that is worth seeing.
 */
if (advisories.length) {
    console.log('');
    console.log('  --  ' + advisories.length + ' reference(s) in archive documents point at files that are gone.');
    console.log('      Not a failure: a record of a deletion has to name what was deleted. Listed to be read, not fixed.');
    for (const a of advisories.slice(0, 8)) console.log('        ' + a);
    if (advisories.length > 8) console.log('        ... and ' + (advisories.length - 8) + ' more');
}

/*
 * PROVING IT CAN FAIL, on fabricated input rather than by breaking the repo. Three shapes, because the three
 * rules fail independently and a single injection would leave two of them unproven.
 */
const inject = [
    ['a missing npm script', 'run `npm run definitely-not-a-real-script` first', /npm run ([a-z][a-z0-9:-]*)/g,
        m => !scripts.includes(m[1])],
    ['a broken relative link', 'see [the guide](docs/NO-SUCH-FILE.md) for detail', /\]\(([^)\s]+)\)/g,
        m => !existsSync(join(root, m[1]))],
    ['a renamed source file', 'the logic lives in `lib/definitely-not-here.ts` now', /`([^`\n]+)`/g,
        m => REPO_PATH.test(m[1]) && !existsSync(join(root, m[1]))],
];

console.log('');
let injectionFailures = 0;
for (const [name, sample, re, isBad] of inject) {
    const matches = [...sample.matchAll(re)];
    const caught = matches.some(isBad);
    if (!caught) injectionFailures++;
    console.log('  ' + (caught ? 'ok  ' : 'FAIL') + '  the check catches ' + name);
}

console.log('');
const failed = problems.length + injectionFailures;
if (failed) {
    console.log(problems.length + ' broken reference(s) in the docs, and '
        + injectionFailures + ' injection(s) that did not fire.');
    process.exit(1);
}
console.log('Every script, link and path the documentation names exists, and the check was shown to fail.');
console.log('');
