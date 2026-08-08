/**
 * Full-page screenshots of the real rendered hub, at the three real widths.
 *
 *   npm run shots                      # localhost, collapsed
 *   npm run shots -- --open            # opens the longest task first
 *   npm run shots -- --tag before      # names the files
 *
 * WHY: every defect in this project so far was found by looking at the page, not by reading the code or
 * running the suite. The suite was green throughout. So there has to be a cheap way to actually look —
 * cheap enough that it happens on every change rather than at the end.
 *
 * Shares tests/chrome.mjs with the measurement harness on purpose: two tools that drive the browser
 * differently can disagree about what one screen looked like, and then neither is evidence.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OPEN_LONGEST_TASK } from './chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* token may be in the environment */ }

const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');
const OPEN = process.argv.includes('--open');
/*
 * Shoot the record instead of the queue.
 *
 * Reached by PRESSING the figure, not by a URL or a state poke, for the same reason the measurement harness
 * does it that way: the figure being a control is half of what the record has to be, so a screenshot of a
 * state no user can reach is not evidence of anything.
 */
const FINISHED = process.argv.includes('--finished');
/**
 * The route to shoot. Defaults to the board.
 *
 * NORMALISED, because Git Bash on Windows mangles it and the failure is unreadable. MSYS treats an argument
 * beginning with a slash as a POSIX path and rewrites it — so `--path /setup` arrives as
 * `C:/Program Files/Git/setup`, the URL becomes `http://localhost:3939C:/Program Files/Git/setup`, and what
 * you see is a hydration timeout on a page that hydrates perfectly. I spent a while checking /setup before
 * reading the line that prints the URL.
 *
 * This repository is on Windows and the shell here is Git Bash, so accepting `setup` as well as `/setup`, and
 * recovering the tail of a mangled absolute path, is the difference between a tool that works and a tool with
 * a footnote. `MSYS_NO_PATHCONV=1` also works and nobody will remember it.
 */
const PATH = (() => {
    const i = process.argv.indexOf('--path');
    const raw = i > -1 ? String(process.argv[i + 1] || '/') : '/';
    // A mangled value looks like C:/Program Files/Git/setup — take what MSYS appended to its install prefix.
    const unmangled = /^[A-Za-z]:[\\/].*[\\/]Git[\\/](.+)$/.exec(raw.replace(/\\/g, '/'));
    const p = unmangled ? unmangled[1] : raw;
    return p.startsWith('/') ? p : `/${p}`;
})();

/* The light theme, through the browser's own media override — the same code path a real user with a light
 * desktop gets, rather than a class that only exists for the screenshot. Declared up here because the default
 * filename depends on it; see TAG. */
const LIGHT = process.argv.includes('--light');

/*
 * THE DEFAULT TAG CARRIES THE THEME, AND THAT IS A BUG FIX.
 *
 * `TAG` defaulted to `shot` and `--light` did not touch the filename, so `npm run shots` followed by
 * `npm run shots:light` — the two commands docs/ENVIRONMENT.md tells you to run — wrote the light theme
 * OVER the dark images, at the same paths, silently. Reproduced by running both and reading back
 * `shot-monitor-1920-viewport.png`: it was the light theme in a file named as if it were dark.
 *
 * The committed `hub-light-*` files only exist because somebody passed `--tag` by hand, which is not what the
 * documented commands do. Mislabelled evidence is worse than missing evidence: it is looked at and believed.
 * An explicit `--tag` still wins, so nothing that passed one changes.
 *
 * AND IT CARRIES `--path` FOR THE SAME REASON, which is the identical bug on a second axis and it bit again
 * this session. `npm run shots -- --path looks` wrote the LOOKS page into `shot-monitor-1920.png` — the file
 * whose whole job is to be the hub — and then a later `npm run shots` wrote the hub back over it. Whichever ran
 * last is what the repository claims the hub looks like, and the two commands are both in AGENTS.md with no
 * warning that one clobbers the other. Every state flag on this script already earns its own suffix
 * (`-open`, `-finished`, `-crest`, `-find`); `--path` chooses a different PAGE, which is a bigger difference
 * than any of them, and it was the one thing not in the name.
 */
const TAG = (() => {
    const i = process.argv.indexOf('--tag');
    if (i > -1) return process.argv[i + 1];
    const where = PATH === '/' ? '' : `-${PATH.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-')}`;
    return `${LIGHT ? 'shot-light' : 'shot'}${where}`;
})();
const OUT = join(root, 'tests', 'shots');
mkdirSync(OUT, { recursive: true });

/* ==================================================================================================
 * WHAT DATA IS IN THIS PICTURE? — printed, because not printing it is how the record went wrong
 *
 * This script photographs whatever the database happens to hold. `prove:layout` was given a fixed fixture
 * precisely so its numbers would be reproducible; the tool whose entire job is LOOKING at the thing was left
 * free-running, and the consequence is in docs/RESEARCH.md §30: the committed `hub-*.png` screenshots are of a
 * fixture state that no longer exists — 118 points and "since 30 Jul" against a fixture that now produces 114
 * and "since 22 Jul" — so the primary visual evidence for a whole redesign is of a page the suite cannot
 * reproduce. Nobody noticed because no image says what it contains.
 *
 * It does not refuse to run: shooting production is legitimate and there is no database URL for it here. It
 * states what it can, loudly, so a screenshot can be traced back to the data behind it.
 * ================================================================================================== */
if (['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) {
    try {
        const { neon } = await import('@neondatabase/serverless');
        const db = neon(process.env.DATABASE_URL);
        const [v] = await db`
            select
                (select count(*)::int from tasks     where status = 'open')  as open_tasks,
                (select count(*)::int from tasks     where status = 'done')  as done_tasks,
                (select count(*)::int from questions where status = 'open')  as open_questions,
                (select count(distinct project)::int from tasks
                  where status = 'open')                                    as projects
        `;
        console.log(
            `\n  data in these images: ${v.open_tasks} open task(s) across ${v.projects} project(s), ` +
            `${v.open_questions} open decision(s), ${v.done_tasks} finished` +
            `\n  theme: ${LIGHT ? 'LIGHT' : 'dark'}   tag: ${TAG}`,
        );
    } catch (e) {
        console.log(`\n  WARNING: could not read what data is loaded (${e.message}).` +
                    '\n  These images cannot be traced to a fixture state.');
    }
}

const b = await launch({
    base: BASE, token: process.env.CC_WEB_TOKEN, port: 9334,
    /*
     * SCROLLBARS ARE PART OF THE PAGE, so they are in the picture.
     *
     * This used to pass `--hide-scrollbars`, which was added so that a full-page capture did not get a
     * scrollbar stripe painted down a 6,000px image. The cost was not worth it and it was not obvious until
     * the owner opened the real hub: the reading pane scrolls, so Chrome on Windows painted a fat light-grey
     * bar down the right-hand side of the one region the eye goes to — and every screenshot filed as evidence
     * had that bar removed. A harness that hides a rendered element is a harness that certifies a page nobody
     * will ever see, which is the same class of mistake as measuring class names instead of pixels.
     *
     * `--hide-scrollbars` is available with --no-scrollbars if a clean plate is ever genuinely wanted.
     */
    extraArgs: process.argv.includes('--no-scrollbars') ? ['--hide-scrollbars'] : [],
});

/*
 * Five widths, matching tests/measure-layout.mjs. The tablet and the ultrawide were added because neither had
 * ever been rendered: everything under 1100px fell into the phone branch, and nothing above 1920 had been
 * looked at at all, so the shell's 1420px cap had a consequence nobody had seen.
 */
const WIDTHS = [
    { name: 'phone', w: 390, h: 844, mobile: true },
    { name: 'tablet', w: 834, h: 1112, mobile: true },
    { name: 'laptop', w: 1280, h: 900, mobile: false },
    { name: 'monitor', w: 1920, h: 1080, mobile: false },
    { name: 'ultrawide', w: 2560, h: 1440, mobile: false },
];

/*
 * THE TWO STATES THAT ARE NOT REACHABLE BY NAVIGATING.
 *
 * A whole stylesheet was rewritten and only the hub had ever been looked at. `/setup` is reachable with
 * --path, but the signed-out screen and a refused write are STATES rather than routes, so neither had ever
 * been screenshotted in the new palette — and both are screens that matter more than the average one: the
 * signed-out page is the first thing a new device sees, and the refusal banner is the single message the
 * whole design is built around.
 *
 * This is the same gap that let the empty hub regress to a dashed box reading "Nothing to do" during the last
 * restructure. A state you cannot photograph is a state nobody checks.
 */
const SIGNED_OUT = process.argv.includes('--signedout');
const REFUSED = process.argv.includes('--refused');
/**
 * The crest's receipt, open — a state, not a route, so it needs a flag for the same reason `--refused` does.
 *
 * The crest is the most decorative object the hub draws and `CrestKey` is what makes it legitimate under
 * docs/RESEARCH.md §14 (if pressing it does nothing, it does not go on the page). A disclosure nobody
 * photographs is a disclosure that will be wrong: three of the four defects the crest shipped with in its
 * first hour were found by looking at a rendered picture, and one of them — the rank clipped off the right
 * edge of the panel — was in this exact panel.
 */
const CREST = process.argv.includes('--crest');
/**
 * The time machine, open and scrubbed back — a state, not a route.
 *
 * `--timeline` opens it at today; `--timeline-back` drags the scrubber to the middle of his record, which is
 * the state the whole feature exists for and the one where a past crest is on screen. Two flags because "the
 * surface renders" and "standing in the past renders" are different claims and only the second is the feature.
 */
const TIMELINE = process.argv.includes('--timeline') || process.argv.includes('--timeline-back');
const TIMELINE_BACK = process.argv.includes('--timeline-back');
/**
 * The command palette, open with a query typed — a state, not a route.
 *
 * With a query rather than empty, because empty shows the destination list and the interesting picture is the
 * one where a search has actually matched things across several groups. Typed through real key events, so the
 * image is of a state a person can reach.
 */
const FIND = process.argv.includes('--find');

console.log(`\nShooting ${BASE}${PATH === '/' ? '' : PATH}${OPEN ? ' with the longest task opened' : ''}\n`);

let failed = false;

if (LIGHT) {
    await b.call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'light' }],
    });
}

if (SIGNED_OUT) {
    // The harness plants the session cookie at launch, which is the whole point of it. Removing it is the
    // only way to reach the locked screen, and it has to happen before the first navigation.
    await b.call('Network.clearBrowserCookies');
}

for (const v of WIDTHS) {
    await b.setViewport(v.w, v.h, v.mobile);
    /* The locked screen has no buttons, so the hydration predicate has nothing to wait for — chrome.mjs
     * already handles that case, but it is worth knowing why this navigation returns instantly. */
    await b.goto(PATH);

    if (REFUSED) {
        /*
         * Make the server refuse the next write and press Done, so the banner is real rather than mocked up.
         * Same interception tests/use-it.mjs uses to prove the interface does not hide a refusal — a
         * screenshot of a hand-built banner would prove nothing about the one the code produces.
         */
        await b.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/ui/act*', requestStage: 'Request' }] });
        const answered = new Promise(res => {
            b.onEvent('Fetch.requestPaused', async (params) => {
                await b.call('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: 500,
                    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                    body: Buffer.from(JSON.stringify({
                        error: 'the write matched zero rows', stored: false,
                    })).toString('base64'),
                });
                res(true);
            });
        });
        const clicked = await b.evaluate(`(() => {
            const row = [...document.querySelectorAll('[data-measure="task"]')][0];
            if (!row) return 'no task to refuse';
            row.querySelector('.rowdone')?.click();
            return 'clicked';
        })()`);
        if (clicked !== 'clicked') { console.error(`     FAILED: ${clicked}`); failed = true; break; }
        await answered;
        await new Promise(r => setTimeout(r, 900));
        const said = await b.evaluate(
            `!!document.querySelector('.refused')?.textContent.trim()`);
        await b.call('Fetch.disable');
        if (!said) {
            console.error('     FAILED: the refusal banner is empty, so this image would show nothing');
            failed = true; break;
        }
    }

    if (OPEN) {
        /*
         * THE OPEN IS VERIFIED, AND THIS SCRIPT EXITS NON-ZERO IF IT DID NOT HAPPEN.
         *
         * The first version fired one click and reported success from the button's own label. On the first
         * viewport of a run that click lands before React has hydrated — the markup is server rendered, so
         * the button exists a long time before its handler does — and the phone screenshot came out
         * collapsed while the log said it had been opened. A screenshot harness that reports a state it
         * did not reach is worse than no harness, because you file the picture as evidence.
         */
        const opened = await b.evaluate(OPEN_LONGEST_TASK);
        if (!opened?.ok) {
            console.error(`     FAILED to open a task (${opened?.why || 'React never hydrated'}) — ` +
                          'this image would show the collapsed state while claiming otherwise.');
            failed = true; break;
        }
        if (opened.rendered !== opened.steps || opened.openCards !== 1) {
            console.error(`     FAILED: expected 1 card open with ${opened.steps} steps, ` +
                          `got ${opened.openCards} open and ${opened.rendered} steps rendered.`);
            failed = true; break;
        }
        console.log(`     opened "${opened.title.slice(0, 40)}" — ${opened.rendered} steps, ${opened.openCards} card`);
        await new Promise(r => setTimeout(r, 300));
    }

    if (FINISHED) {
        // Same discipline as OPEN above: if the state was not reached, exit non-zero rather than filing a
        // picture of the wrong page as evidence.
        /*
         * AND IT LANDS ON THE TASKS TAB, which this did not and the filename never admitted.
         *
         * The header chip's destination moved to the TIME MACHINE two sessions ago — deliberately, because the
         * chip is the only place the three figures appear together (see the comment on it in Board.tsx). This
         * block kept pressing the chip and kept polling for `done-task` rows, which are in the DOM but inside a
         * `hidden` container while another tab is showing. So it succeeded, and `npm run shots -- --finished`
         * filed photographs of the timeline under a name that says "finished". Mislabelled evidence is worse
         * than missing evidence: it gets looked at and believed, which is this file's own lesson about `--tag`.
         *
         * It presses the tab as well now, and reports which tab is actually lit so the log says what the image
         * contains rather than what it was asked for.
         */
        const shown = await b.evaluate(`(async () => {
            const figure = () => document.querySelector(
                '[data-measure="progress-figure"][data-figure="tasks-done"]');
            if (!figure()) return { ok: false, why: 'no finished-work figure to press' };
            const tab = () => [...document.querySelectorAll('[data-measure="record-tab"]')]
                .find(t => t.dataset.tab === 'tasks');
            for (let i = 0; i < 60; i++) {
                const rows = document.querySelectorAll('[data-measure="done-task"]').length;
                const lit = [...document.querySelectorAll('[data-measure="record-tab"]')]
                    .find(t => t.getAttribute('aria-pressed') === 'true');
                if (rows && lit && lit.dataset.tab === 'tasks') {
                    return { ok: true, rows, tab: lit.dataset.tab };
                }
                if (tab()) tab().click(); else figure().click();
                await new Promise(res => setTimeout(res, 120));
            }
            return { ok: false, why: 'pressing the figure never showed the Tasks list' };
        })()`);
        if (!shown?.ok) {
            console.error(`     FAILED to reach the record (${shown?.why || 'React never hydrated'})`);
            failed = true; break;
        }
        console.log(`     showing the record's ${shown.tab} tab — ${shown.rows} finished rows`);
        await new Promise(r => setTimeout(r, 300));
    }

    if (CREST) {
        // Same discipline as OPEN and FINISHED: reach the state or exit non-zero. A picture of a closed
        // disclosure filed as evidence of an open one is the failure this whole file is written against.
        const shown = await b.evaluate(`(async () => {
            const btn = () => document.querySelector('[data-measure="crest"]');
            if (!btn()) return { ok: false, why: 'no crest to press' };
            for (let i = 0; i < 60; i++) {
                const rows = document.querySelectorAll('[data-measure="crest-key-row"]').length;
                if (rows) return { ok: true, rows };
                btn()?.click();
                await new Promise(res => setTimeout(res, 120));
            }
            return { ok: false, why: 'pressing the crest never opened its key' };
        })()`);
        if (!shown?.ok) {
            console.error(`     FAILED to open the crest key (${shown?.why || 'React never hydrated'})`);
            failed = true; break;
        }
        console.log(`     crest key open — ${shown.rows} rows`);
        await new Promise(r => setTimeout(r, 300));
    }

    if (FIND) {
        const shown = await b.evaluate(`(async () => {
            const btn = () => document.querySelector('[data-measure="find"]');
            if (!btn()) return { ok: false, why: 'no way into the palette' };
            for (let i = 0; i < 60; i++) {
                if (document.querySelector('[data-measure="palette-input"]')) break;
                btn()?.click();
                await new Promise(res => setTimeout(res, 120));
            }
            const input = document.querySelector('[data-measure="palette-input"]');
            if (!input) return { ok: false, why: 'the palette never opened' };
            /* React reads value changes through the native setter plus a bubbling input event. Setting the
             * value property directly leaves React state untouched and the list unfiltered — a picture of an
             * unfiltered palette filed as evidence of a search.
             * NO BACKTICKS IN THIS COMMENT: it is inside a template literal. Tenth occurrence of that trap in
             * this repository; tests/no-backticks.mjs now fails the build on it rather than a comment asking. */
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, 'a');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            /* POLLED, not slept, because the results now come from an endpoint.
             * A flat 250ms wait was right while the corpus was in the payload and is a coin-flip now: the
             * palette debounces 130ms and then makes a request, so a photograph taken at 250ms is a
             * photograph of a list that has not arrived. That is exactly the flake tests/chrome.mjs records
             * as having cost two wrong answers, arriving in a new place. */
            let rows = 0;
            for (let i = 0; i < 60; i++) {
                rows = document.querySelectorAll('[data-measure="palette-row"]').length;
                if (rows) break;
                await new Promise(res => setTimeout(res, 100));
            }
            if (!rows) return { ok: false, why: 'the query matched nothing, so this image shows an empty list' };
            return { ok: true, rows };
        })()`);
        if (!shown?.ok) {
            console.error(`     FAILED to reach the palette (${shown?.why || 'React never hydrated'})`);
            failed = true; break;
        }
        console.log(`     palette open with a query — ${shown.rows} results`);
        await new Promise(r => setTimeout(r, 300));
    }

    if (TIMELINE) {
        // Same discipline as the others: reach the state or exit non-zero.
        const shown = await b.evaluate(`(async () => {
            const entry = () => document.querySelector('[data-figure="record-since"]');
            if (!entry()) return { ok: false, why: 'no way into the timeline' };
            for (let i = 0; i < 60; i++) {
                if (document.querySelector('[data-measure="timeline"]')) break;
                entry()?.click();
                await new Promise(res => setTimeout(res, 120));
            }
            const scrub = document.querySelector('[data-measure="timeline-scrub"]');
            if (!scrub) return { ok: false, why: 'the timeline never rendered' };
            if (${TIMELINE_BACK}) {
                /*
                 * Driven through the input's own event, not by poking React state: the scrubber has to work
                 * the way a drag works or the picture is of a state a person cannot reach. Native setter plus
                 * a bubbling 'input' event is how React sees a real change.
                 */
                const mid = Math.floor(+scrub.max / 2);
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value').set;
                setter.call(scrub, String(mid));
                scrub.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(res => setTimeout(res, 250));
                const at = document.querySelector('[data-measure="timeline-at"]')?.textContent?.trim();
                if (at === 'Today') return { ok: false, why: 'the scrubber did not move off today' };
                return { ok: true, moments: document.querySelectorAll('[data-measure="timeline-moment"]').length, at };
            }
            return {
                ok: true,
                moments: document.querySelectorAll('[data-measure="timeline-moment"]').length,
                at: document.querySelector('[data-measure="timeline-at"]')?.textContent?.trim(),
            };
        })()`);
        if (!shown?.ok) {
            console.error(`     FAILED to reach the timeline (${shown?.why || 'React never hydrated'})`);
            failed = true; break;
        }
        console.log(`     timeline open at "${shown.at}" — ${shown.moments} moments`);
        await new Promise(r => setTimeout(r, 300));
    }

    /*
     * VIEWPORT-SIZED, WHICH IS THE ONLY HONEST WAY TO SEE ANYTHING THAT DEPENDS ON 100vh.
     *
     * This is the important one and it took the owner opening the real hub to find it. The full-page capture
     * below stretches the viewport to the document height — and the reading pane is
     * `max-height: calc(100vh - 40px); overflow-y: auto`, so stretching the viewport makes the pane taller
     * than its own content and it stops overflowing. The scrollbar he was looking at could not appear in ANY
     * screenshot this harness produced, whatever the flags. Adding `--hide-scrollbars` on top of that just
     * made it doubly invisible.
     *
     * So the default run now produces both: the viewport, which is what a person sees, and the full page,
     * which is where a layout problem below the fold shows up. Anything sized in viewport units is only real
     * in the first one.
     */
    if (!process.argv.includes('--no-viewport')) {
        const vshot = await b.call('Page.captureScreenshot', { format: 'png' });
        const vfile = join(OUT, `${TAG}-${v.name}-${v.w}${OPEN ? '-open' : ''}${FINISHED ? '-finished' : ''}` +
            `${REFUSED ? '-refused' : ''}${SIGNED_OUT ? '-locked' : ''}${CREST ? '-crest' : ''}${TIMELINE_BACK ? '-timeline-back' : TIMELINE ? '-timeline' : ''}${FIND ? '-find' : ''}-viewport.png`);
        writeFileSync(vfile, Buffer.from(vshot.result.data, 'base64'));
        const bars = await b.evaluate(`(() => {
            const out = [];
            for (const el of document.querySelectorAll('body *')) {
                const cs = getComputedStyle(el);
                if (!/auto|scroll/.test(cs.overflowY)) continue;
                if (el.scrollHeight <= el.clientHeight + 1) continue;
                const w = el.offsetWidth - el.clientWidth;
                out.push({ what: (el.className || el.tagName).toString().slice(0, 24), gutter: w });
            }
            return out;
        })()`);
        console.log(`  ${v.name.padEnd(8)} ${v.w}x${v.h}  ->  ${vfile}` +
            (bars.length
                ? `\n           scrolling regions in view: ` +
                  bars.map(x => `${x.what} (${x.gutter}px of scrollbar)`).join(', ')
                : '\n           nothing overflows in the viewport'));
    }

    /*
     * Full page, not just the viewport: a layout problem below the fold is still a layout problem.
     *
     * Except when a fixed full-screen panel is covering the page. `inset: 0` means "the viewport", so
     * stretching the viewport to the document's height stretches the panel with it and the capture comes
     * out as the panel's content followed by 1,600px of black — which looks like a rendering bug and is
     * really a measuring bug. When such a panel is up, its own scrollHeight is the page.
     */
    const metrics = await b.evaluate(`(() => {
        const covering = [...document.querySelectorAll('body *')].find(el => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed') return false;
            const r = el.getBoundingClientRect();
            return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1;
        });
        return {
            w: Math.max(document.documentElement.scrollWidth, window.innerWidth),
            h: covering ? covering.scrollHeight : document.documentElement.scrollHeight,
            covering: !!covering,
        };
    })()`);
    await b.setViewport(v.w, Math.min(metrics.h, 20000), v.mobile);
    await new Promise(r => setTimeout(r, 250));

    const shot = await b.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = join(OUT, `${TAG}-${v.name}-${v.w}${OPEN ? '-open' : ''}${FINISHED ? '-finished' : ''}` +
        `${REFUSED ? '-refused' : ''}${SIGNED_OUT ? '-locked' : ''}${CREST ? '-crest' : ''}${TIMELINE_BACK ? '-timeline-back' : TIMELINE ? '-timeline' : ''}${FIND ? '-find' : ''}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log(`  ${v.name.padEnd(8)} ${v.w}x${v.h}  ->  ${file}  ` +
                `(${metrics.covering ? 'full-screen panel' : 'page'} is ${metrics.h}px tall)`);
}

console.log('');
b.cleanup();
process.exitCode = failed ? 1 : 0;
