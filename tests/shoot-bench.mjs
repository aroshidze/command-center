/**
 * Photograph the emblem bench, in both themes.
 *
 *   node tests/shoot-bench.mjs
 *
 * WHY THIS IS NOT PART OF tests/shoot.mjs
 *
 * `shoot.mjs` photographs the hub: it knows about the queue, the reading pane, the fixture states and the five
 * viewport widths, and every one of its flags is about which state of the hub to capture. The bench is a
 * different subject with none of that — one page, one width, no data — and folding it in would mean a `--path`
 * flag on a script whose whole shape assumes the path is `/`.
 *
 * It exists at all because the emblem's higher tiers cannot be reached with real data: level 33 is roughly four
 * thousand finished tasks. See the header of app/emblem/page.tsx for why that page is safe to have.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'tests', 'shots');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* token may be in the environment */ }

const LIGHT = process.argv.includes('--light');
const TAG = LIGHT ? 'bench-light' : 'bench';

/*
 * Localhost only, and refused otherwise. The bench renders invented levels; pointing this at production would
 * produce an image of a rank he has not earned, sitting in tests/shots/ next to images that are all true.
 */
const BASE = process.env.CC_PROVE_URL || 'http://localhost:3939';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    console.error(`The bench is localhost-only; refusing to shoot ${BASE}.`);
    process.exit(1);
}

const b = await launch({ base: BASE, token: process.env.CC_WEB_TOKEN, port: 9336 });

try {
    if (LIGHT) {
        // The browser's own media override — the same code path a real user with a light desktop takes.
        await b.call('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: 'light' }],
        });
    }

    await b.call('Emulation.setDeviceMetricsOverride', {
        width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false,
    });

    /*
     * The bench has no buttons, so the default hydration predicate has nothing to look for. Wait for the
     * emblems themselves — and for at least the number the page claims to render, so a page that rendered two
     * of sixteen is a timeout rather than a photograph of a broken bench.
     */
    await b.goto('/emblem', {
        waitFor: `document.querySelectorAll('[data-measure="bench-emblem"] svg.emblem').length >= 16`,
    });

    const shot = await b.call('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
    });
    const file = join(OUT, `${TAG}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));

    /*
     * Report the geometry the page actually drew, read out of the DOM rather than recomputed. If the shapes
     * ever stop differing between tiers this prints it, which is a cheaper signal than looking at the image.
     */
    const drawn = await b.evaluate(`(() => {
        return [...document.querySelectorAll('[data-measure="bench-emblem"]')].map(el => {
            const svg = el.querySelector('svg.emblem');
            return {
                level: +el.dataset.level,
                circles: svg.querySelectorAll('circle').length,
                lines: svg.querySelectorAll('line').length,
                polygons: svg.querySelectorAll('polygon').length,
            };
        });
    })()`);

    console.log(`\n  ${TAG}.png — the emblem at every tier it will draw\n`);
    console.log('     level   circles(rings+arc)   spokes   core polygons');
    for (const d of drawn) {
        console.log(
            `   ${String(d.level).padStart(7)}` +
            `${String(d.circles).padStart(21)}` +
            `${String(d.lines).padStart(9)}` +
            `${String(d.polygons).padStart(16)}`,
        );
    }
    console.log(`\n  wrote ${file}\n`);
} finally {
    b.cleanup();
}
