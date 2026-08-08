/**
 * LOOK AT ONE ELEMENT AT 4x. The step AGENTS.md asks for and nothing automated.
 *
 *   node tests/crop.mjs '[data-measure="presence-row"]'            # every match, 4x, one file each
 *   node tests/crop.mjs '.presrow' --path agents --scale 6
 *   node tests/crop.mjs '.topnav' --path agents --light --width 1920
 *
 * WHY THIS EXISTS
 *
 * *"Both themes, 1280 and 1920, and crop to 4x and read it"* is in the brief, and it was being done by hand:
 * take a screenshot, open it, guess a region, crop it somewhere else. Every defect §XXVIII found by looking
 * was found at magnification — an 11px title offset and 7px of dead padding are invisible at 1x and obvious
 * at 4x — and a step that is done by hand is a step that gets skipped on the session where it mattered.
 *
 * It captures with a CDP `clip` at `scale`, so the pixels come from the browser's own rasteriser at that
 * scale rather than from a PNG blown up afterwards. A magnified screenshot shows you 4x4 blocks of one
 * colour; this shows you what the renderer would draw if the element were four times the size, which is what
 * you need to judge whether two edges line up.
 *
 * PADDING IS INCLUDED ON PURPOSE. Eight pixels around the element's box, because the defects that hide at 1x
 * are almost always about the RELATIONSHIP between an element and what is next to it — a title 11px right of
 * the sentence under it, a control 3px off the baseline of its row. A crop tight to the border shows a
 * beautiful element and no relationship.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* token may be in the environment */ }

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const SELECTOR = argv.find(a => !a.startsWith('--') && argv.indexOf(a) === 0);
if (!SELECTOR) {
    console.error('\nusage: node tests/crop.mjs <css-selector> [--path p] [--scale 4] [--width 1280] [--light]\n');
    process.exit(1);
}

const BASE = (argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');
const SCALE = Number(flag('scale', 4));
const WIDTH = Number(flag('width', 1280));
const HEIGHT = Number(flag('height', 900));
const LIGHT = argv.includes('--light');
const MAX = Number(flag('max', 6));
const PAD = Number(flag('pad', 8));

/* Same normalisation as tests/shoot.mjs: Git Bash rewrites a leading slash into a Windows path, so a bare
 * name is accepted and the slash is added here. That bug cost a session once already. */
const PATH = (() => {
    const raw = flag('path', '/');
    const cleaned = String(raw).replace(/^[A-Za-z]:[\\/]/, '').replace(/^\/+/, '');
    return `/${cleaned}`.replace(/\/+$/, '') || '/';
})();

const outDir = join(root, 'tests', 'shots');
mkdirSync(outDir, { recursive: true });

const b = await launch({ base: BASE, token: process.env.CC_WEB_TOKEN, port: 9337 });
try {
    if (LIGHT) {
        /* The browser's own media override, so the light theme is exercised through the same path a person's
         * operating system would use rather than by injecting a class the stylesheet does not gate on. */
        await b.call('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: 'light' }],
        });
    }
    await b.setViewport(WIDTH, HEIGHT, false);
    await b.goto(PATH);

    const boxes = await b.evaluate(`(() => {
        /* NO BACKTICKS ANYWHERE IN HERE, comments included. Trap 1 in AGENTS.md, thirteen occurrences. */
        const out = [];
        for (const el of document.querySelectorAll(${JSON.stringify(SELECTOR)})) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            out.push({
                x: r.left + window.scrollX, y: r.top + window.scrollY,
                w: r.width, h: r.height,
                label: (el.getAttribute('data-project') || el.getAttribute('data-agent')
                    || el.getAttribute('data-measure') || el.tagName.toLowerCase()),
            });
        }
        return out;
    })()`);

    if (!boxes.length) {
        console.error(`\nNothing matched ${SELECTOR} on ${PATH}. Nothing captured — which is a failure, not a`
            + ' pass: a crop of nothing looks exactly like a crop of something correct.\n');
        process.exit(1);
    }

    console.log(`\n  ${PATH} at ${WIDTH}px, ${LIGHT ? 'light' : 'dark'} — ${boxes.length} match(es) `
        + `for ${SELECTOR}\n`);

    let n = 0;
    for (const box of boxes.slice(0, MAX)) {
        const clip = {
            x: Math.max(0, box.x - PAD),
            y: Math.max(0, box.y - PAD),
            width: box.w + PAD * 2,
            height: box.h + PAD * 2,
            scale: SCALE,
        };
        /* `call` returns the whole CDP envelope, so the payload is under `.result` — the first version read
         * `shot.data` and got `undefined`, which `Buffer.from` turns into a type error rather than an empty
         * file. Worth the note: an empty PNG would have been the worse outcome, because a crop that renders
         * as nothing looks like a crop of a correct element on a dark page. */
        const shot = await b.call('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: true, clip,
        });
        const name = `crop-${PATH.slice(1) || 'hub'}-${LIGHT ? 'light' : 'dark'}-${WIDTH}`
            + `-${box.label}-${n++}.png`;
        writeFileSync(join(outDir, name), Buffer.from(shot.result.data, 'base64'));
        console.log(`  ${String(Math.round(clip.width)).padStart(4)}x${String(Math.round(clip.height)).padEnd(4)}`
            + ` @${SCALE}x  ->  tests/shots/${name}`);
    }
    if (boxes.length > MAX) {
        /* Said out loud rather than silently truncated: a run that captured six of nineteen and printed six
         * filenames reads as complete. AGENTS.md's no-silent-caps rule. */
        console.log(`\n  (${boxes.length - MAX} more matched and were NOT captured — raise --max)`);
    }
    console.log('');
} finally {
    await b.cleanup();
}
