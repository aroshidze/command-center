/**
 * THE TRAP THAT HAS COST MORE TIME THAN ANY OTHER THING IN THIS REPOSITORY, as a check.
 *
 *   npm run prove:parse
 *
 * ==================================================================================================
 * WHY THIS EXISTS
 * ==================================================================================================
 *
 * Several files in `tests/` build page-side scripts as template literals and hand them to `b.evaluate(...)`. A
 * backtick anywhere inside one of those literals — **including inside a comment** — closes it, and the rest of
 * the file is reparsed as outer JavaScript. The resulting `SyntaxError` points at a token hundreds of lines from
 * the cause, and it usually names a word that is inside a comment, which is about as misleading as an error
 * message gets.
 *
 * AGENTS.md has warned about it since the third occurrence, recording three, then six. This session added four
 * more — **every one of them in a comment written moments after reading the warning.**
 *
 * Ten occurrences is enough evidence to stop asking. A warning that has been read and then violated ten times is
 * not a warning that works; it is a note about a failure mode that needs a check. And unlike every other check
 * here, this one pays for itself the first time it runs: a parse failure costs minutes of reading an error that
 * points at the wrong place, and this prints the file and the message in two seconds.
 *
 * ==================================================================================================
 * WHAT IT CHECKS, AND THE TWO WRONG SHAPES IT WENT THROUGH FIRST
 * ==================================================================================================
 *
 * **Attempt one: scan for stray backticks.** Wrong shape. It can find where the literals are and it cannot tell a
 * legitimate backtick — inside a `${JSON.stringify(x)}` substitution — from an illegitimate one without becoming
 * a JavaScript parser, which is a thing that can itself be wrong.
 *
 * **Attempt two: compile each file with `new Function`.** Closer — the failure mode is always that the file stops
 * parsing, so "does it parse" is the whole question. But `new Function` compiles a SCRIPT, and these are modules:
 * `import.meta` is a syntax error there, and blanking `import` lines breaks any import that spans more than one
 * line. It reported eleven failures and then two, and not one of them was a backtick. A check with false
 * positives is a check people route around.
 *
 * **What it does now: `node --check`.** Node's own parser, in module mode, without executing the file — which
 * matters, because these modules launch browsers and write to a database. No cleverness of mine between the
 * question and the answer, which is the right amount for a check whose whole job is to be believed.
 *
 * NO DEPENDENCY. A linter would be one, and docs/RESEARCH.md §13 is the argument against those in a tool that has
 * to still work in a year with nobody maintaining it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Every `.mjs` in tests/, because any of them may grow a page-side script. */
const files = readdirSync(here)
    .filter(f => f.endsWith('.mjs'))
    .sort();

/** Node's own parser, module mode, no execution. Returns the error text, or null. */
function parseError(path) {
    try {
        execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
        return null;
    } catch (e) {
        /*
         * `--check` writes the diagnostic to stderr and the useful part is the SyntaxError line. Trimmed to that
         * line because the stack underneath it is node's own frames and says nothing about the file.
         */
        const out = `${e.stderr ?? ''}`.split('\n')
            .find(l => /Error/.test(l)) ?? 'did not parse';
        return out.trim();
    }
}

console.log('\n  every page-side template literal in tests/ still parses\n');

let failures = 0;
for (const name of files) {
    const why = parseError(join(here, name));
    if (why) failures++;
    console.log(`     ${why ? 'FAIL' : 'ok  '} ${name}${why ? `\n            ${why}` : ''}`);
}

/*
 * And prove the check can fail, on the same principle as everything else in tests/: a guard that cannot go red is
 * a guard nobody should trust.
 *
 * Two injections, and the second is the one that matters. The first is the exact mistake in the exact place it
 * keeps being made. The second is a LEGITIMATE backtick inside a substitution, which must NOT be reported —
 * because the two earlier attempts at this check both failed by crying wolf, and a check that has to be ignored
 * is worse than no check at all.
 */
console.log('\n  proving the check can fail\n');

const dir = mkdtempSync(join(tmpdir(), 'cc-parse-'));
const write = (name, src) => { const p = join(dir, name); writeFileSync(p, src); return p; };

const broken = write('broken.mjs',
    'const evaluate = s => s;\nconst x = evaluate(`(() => {\n  /* a `backtick` in a comment */\n  return 1;\n})`);\n');
const legitimate = write('fine.mjs',
    'import { tmpdir } from "node:os";\nconst v = tmpdir();\n'
    + 'const evaluate = s => s;\nconst x = evaluate(`(() => ${JSON.stringify(`n=${v}`)})`);\n');

const caught = parseError(broken) !== null;
const quiet = parseError(legitimate) === null;
if (!caught) failures++;
if (!quiet) failures++;
console.log(`     ${caught ? 'ok  ' : 'FAIL'} a backtick inside a comment inside an evaluate literal is caught`);
console.log(`     ${quiet ? 'ok  ' : 'FAIL'} a legitimate backtick inside a substitution is NOT reported`);

console.log(failures === 0
    ? `\n  ${files.length} file(s) parse, and the check was shown to fail.\n`
    : `\n  ${failures} problem(s).\n`);

process.exitCode = failures === 0 ? 0 : 1;
