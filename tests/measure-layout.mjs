/**
 * Measure the RENDERED interface at real widths, using the Chrome that is already installed.
 *
 *   npm run fixture                                    # load realistic data into the DEV database first
 *   node tests/measure-layout.mjs                      # against localhost
 *   node tests/measure-layout.mjs https://needsme...   # against production
 *
 * WHY THIS EXISTS
 *
 * Two layout defects shipped in a row — a two-column grid that left half a wide monitor blank with one
 * project, and a collapse rule that hid fifteen tasks behind a heading — and both were found by the owner
 * looking at the page, not by the agent that wrote it. Both had been "verified" by grepping the HTML for
 * class names and reasoning about the CSS. Class names present is not layout correct, which is the same
 * proxy-measurement mistake the brief warns about, applied to pixels instead of writes.
 *
 * WHY IT GREW
 *
 * The first version of this file measured one thing — whether `.pcards > .card` filled the column — and it
 * passed at 98% while the DECISIONS section beside it filled 57.7% of the same screen, the expanded card
 * filled 57.0% of itself, no task was above the fold at any width, three text colours failed WCAG AA, five
 * controls could not be reached by keyboard at all, and none of the twenty-seven save-state elements was
 * announced. A check aimed exactly where the last bug was is the proxy-measurement mistake in a new
 * costume: it proves the last bug is still fixed and nothing else.
 *
 * So the measurements are now hooked to `data-measure` ROLE attributes rather than to styling classes, and
 * every check below is a number with a threshold. Each one was written against the un-redesigned interface
 * and OBSERVED FAILING before the thing it measures was built — that is stronger evidence than injecting a
 * fault afterwards, because a fault you inject is one you already knew how to catch. The recorded red run
 * is in docs/UI-REPORT.md.
 *
 * The fault injection at the bottom is kept anyway, for a different reason: it stops a check from quietly
 * losing its ability to fail six months from now, when the markup has moved and a selector matches nothing.
 * A check that matches nothing passes.
 *
 * No dependencies. Chrome is driven over its own WebSocket via tests/chrome.mjs.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OPEN_LONGEST_TASK } from './chrome.mjs';
import { SURFACES, surfaceCss } from '../lib/surfaces.ts';
/* The record's window, imported rather than repeated: a check that hard-coded 60 would go green the day
 * somebody changed the constant, which is the drift AGENTS.md's "import the real thing" rule is about. */
import { RECORD_WINDOW } from '../lib/progress.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* token may be in the environment */ }

const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > -1 ? process.argv[i + 1] : null; })();

/* ================================================================================================
 * MEASURING PRODUCTION: what it does, what it does not, and why it needs a flag
 *
 * Production has never been measured, and two iterations in a row have flagged that as a gap without closing
 * it. The stated blocker was that loading the hub calls `applyDueDefaults()`, so a measurement run could
 * resolve one of his real decisions.
 *
 * ON INSPECTION THAT WAS OVERSTATED, and the correction matters because it is the difference between a real
 * blocker and a scary-sounding one:
 *
 *   - Timed defaults are applied LAZILY BY DESIGN, on whoever reads next (lib/store.ts says so explicitly:
 *     "no cron job to forget about"). A question past its deadline is going to be defaulted by the next page
 *     load or the next `cc sync` regardless of who triggers it. This run does not create a wrong outcome; at
 *     most it brings forward, by minutes, an outcome that was already decided and already announced to him.
 *   - Nothing else here writes. It navigates, it reads geometry, and it CLICKS — but the only clicks are
 *     opening a task, pressing a filter chip and pressing the figure, all of which are client-side state. No
 *     Done, no answer, no note.
 *
 * The residual risk is narrow and real: if he was about to answer a decision in the next few minutes and this
 * run lands first, the default applies and he loses the chance. That is small, but it is his decision to
 * accept, not mine to assume — hence an explicit flag rather than either a silent refusal or a silent run.
 *
 * The fault-injection pass is skipped against production. It works by injecting stylesheets into a live page,
 * which is harmless, but a run whose purpose is "measure the real thing" should not also be deliberately
 * breaking the real thing while he might be looking at it.
 * ================================================================================================ */
const LOCAL = ['localhost', '127.0.0.1'].includes(new URL(BASE).hostname);
const ALLOW_PRODUCTION = process.argv.includes('--production');

if (!LOCAL && !ALLOW_PRODUCTION) {
    console.error(
        `\nRefusing to measure ${BASE} without --production.\n\n` +
        'This is read-only apart from one thing, and you should know what it is: loading the hub applies any\n' +
        'timed default whose deadline has passed. That is the designed lazy behaviour and would happen on the\n' +
        'next page load or agent sync anyway — but if you were about to answer a decision in the next few\n' +
        'minutes, this run could resolve it with its stated default first.\n\n' +
        'Nothing else is written: no task is ticked, no question answered, no note added.\n\n' +
        `  node tests/measure-layout.mjs ${BASE} --production\n`,
    );
    process.exit(1);
}

/* ==================================================================================================
 * WHICH DATA IS THIS MEASURING? — asked out loud, because it never used to be
 *
 * `fixtureOnly` checks assert facts about the DEFAULT fixture's volumes: P3 asserts that seven of nine
 * completions quote what they achieved, seven being the number the fixture deliberately gives a `why` to.
 * That flag used to stand down on hostname — "run it against localhost" — which is the wrong question. The
 * right one is whether the data in front of it is the data it was calibrated against.
 *
 * It matters now because there is a second local fixture. `npm run fixture:live` loads production's measured
 * volumes (12 open tasks, 2 projects, ZERO open decisions — docs/RESEARCH.md §26), and against those P3
 * reported a FAILURE on a page where two of two completions stated their achievement perfectly. Exactly the
 * false failure the flag exists to prevent, produced by the flag's own condition being a proxy.
 *
 * So the volumes are read from Postgres directly, printed, and compared. Read from the database rather than
 * from the page for the same reason check U1 in tests/use-it.mjs does: the page and the agent API both go
 * through lib/store.ts, so a wrong aggregate there would agree with itself.
 *
 * A run that cannot say what it measured is a run whose numbers cannot be compared to another run's. That was
 * true of `tests/shoot.mjs` too, and it is how the committed screenshots came to be of a fixture that no
 * longer exists (§30).
 * ================================================================================================== */

/** The default fixture's volumes. A mismatch stands `fixtureOnly` checks down; it is never a failure. */
const DEFAULT_FIXTURE = { open_tasks: 22, open_questions: 4, done_tasks: 9, answered_questions: 2 };

let VOLUMES = null;
if (LOCAL) {
    try {
        const { neon } = await import('@neondatabase/serverless');
        const db = neon(process.env.DATABASE_URL);
        const [got] = await db`
            select
                (select count(*)::int from tasks     where status = 'open')     as open_tasks,
                (select count(*)::int from tasks     where status = 'done')     as done_tasks,
                (select count(*)::int from questions where status = 'open')     as open_questions,
                (select count(*)::int from questions where status = 'answered') as answered_questions,
                (select count(distinct project)::int from tasks
                  where status = 'open')                                       as projects
        `;
        VOLUMES = got;
    } catch (e) {
        // Not fatal. Without volumes the fixtureOnly checks stand down, which is the safe direction.
        console.log(`  (could not read volumes: ${e.message})`);
    }
}

/** True only when the data in front of the suite is the data the fixtureOnly checks were written against. */
const ON_DEFAULT_FIXTURE = !!VOLUMES &&
    Object.entries(DEFAULT_FIXTURE).every(([k, v]) => Number(VOLUMES[k]) === v);

/**
 * THE EARNED-EMPTY HUB — nothing open, something finished. `npm run fixture -- --cleared`.
 *
 * ==================================================================================================
 * WHY THIS EXISTS, AND IT CLOSES THE LAST STATE THIS SUITE COULD NOT SEE
 * ==================================================================================================
 *
 * The brief named it: *"prove:layout cannot run against the --cleared fixture — L3 needs six tasks above the
 * fold and that state has none. So the earned-empty hub, which is his most likely daily end state and the
 * entire reward moment of the design, is verified by eye only."*
 *
 * That is exactly right and it is the worst possible state to have outside the machinery. Hard constraint 6 is
 * that an empty queue is SUCCESS rather than disuse, and this is the screen where that stops being a claim. It
 * has already regressed once: for one commit it rendered a "YOUR TURN" heading over a dashed box reading
 * "Nothing to do", which is the same information delivered as a shrug, and nothing caught it.
 *
 * Running the whole suite against it is not the fix either — a third of the checks measure a queue that is
 * legitimately not there, and six false failures is how a suite stops being run. So checks declare
 * `needsQueue`, stand down here with a message that says WHY rather than reporting a failure, and the properties
 * that only exist in this state get checks of their own (E1, E2).
 */
const CLEARED = !!VOLUMES && Number(VOLUMES.open_tasks) === 0
    && Number(VOLUMES.open_questions) === 0 && Number(VOLUMES.done_tasks) > 0;

if (VOLUMES) {
    console.log(
        `\n  measuring against ${VOLUMES.open_tasks} open task(s) across ${VOLUMES.projects} project(s), ` +
        `${VOLUMES.open_questions} open decision(s), ${VOLUMES.done_tasks} finished, ` +
        `${VOLUMES.answered_questions} answered` +
        (ON_DEFAULT_FIXTURE ? '  — the default fixture' : '  — NOT the default fixture'),
    );
}

const b = await launch({ base: BASE, token: process.env.CC_WEB_TOKEN, port: 9333 });

/*
 * FIVE WIDTHS, NOT THREE.
 *
 * It measured 390 / 1280 / 1920 for as long as it has existed, which left two whole layouts unexamined:
 *
 *   - a TABLET in portrait fell into the "phone" branch, so a 900px-wide device was rendering a 720px column
 *     with dead margins either side and nothing had ever looked at it
 *   - anything above 1920 had never been rendered at all, so "the shell caps at 1420px" was a rule whose
 *     consequence — 570px of empty margin on each side of an ultrawide — was invisible
 *
 * `mobile: true` on the tablet is deliberate: it sets a coarse pointer, which is what a tablet has, and control
 * sizing in app/globals.css keys off the pointer rather than the width for exactly that reason.
 */
const WIDTHS = [
    { name: 'phone', w: 390, h: 844, mobile: true },
    { name: 'tablet', w: 834, h: 1112, mobile: true },
    { name: 'laptop', w: 1280, h: 900, mobile: false },
    { name: 'monitor', w: 1920, h: 1080, mobile: false },
    { name: 'ultrawide', w: 2560, h: 1440, mobile: false },
];
const DESKTOP = ['laptop', 'monitor', 'ultrawide'];

/* ============================================================================ the page-side measurement */

/*
 * One function, evaluated in the page, returning every number the checks need. Deliberately one call
 * rather than one per check: two calls can straddle a re-render and then two checks describe two different
 * pages, which is how you get a contradictory report that nobody can reproduce.
 */
const MEASURE = `(() => {
    /* =============================================================================================
     * NO BACKTICKS ANYWHERE BELOW, INCLUDING IN COMMENTS.
     *
     * Everything from here to the closing of this template literal is a STRING in a .mjs file. A backtick
     * closes it, and what follows is then parsed as JavaScript in the outer file — which produces an error
     * pointing at a line hundreds of lines away from the actual cause.
     *
     * This has now happened three times in this file's history, twice in one sitting. The best one:
     * quoting a CSS flag as --hide-scrollbars with backticks closed the string, and the two hyphens were
     * then read as a postfix decrement, giving "Invalid left-hand side expression in postfix operation" on
     * the line where the literal STARTS. If you want to quote an identifier in here, use plain words.
     * ============================================================================================= */
    const vw = window.innerWidth, vh = window.innerHeight;

    /** Content box in page coordinates — padding and border removed, which is what "fills it" must mean. */
    const inner = el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
        return { left: r.left + bl + pl, right: r.right - br - pr,
                 width: Math.max(0, r.width - bl - pl - br - pr) };
    };
    const q = s => [...document.querySelectorAll(s)];

    /* ---- contrast, computed from what is actually rendered ---- */

    /*
     * COLOURS ARE RESOLVED BY THE BROWSER, NOT BY A REGEX.
     *
     * This used to be String(s).match(/[\\d.]+/g) — take the first three numbers out of the string and call
     * them r, g, b. That works for exactly one serialisation, rgb(r, g, b), and it silently produces
     * nonsense for every other one. The moment the palette moved to oklch(), getComputedStyle started
     * returning oklch(0.74 0.008 70) and the "first three numbers" became 0.74, 0.008 and 70 — a
     * luminance calculated from a lightness, a chroma and a hue angle. C1 would have kept reporting a
     * number, and the number would have been fiction. A check that cannot fail is worse than no check; a
     * check that reports a plausible wrong answer is worse than that.
     *
     * A 1x1 canvas asks the browser to rasterise the colour and reads the bytes back. That is exact for any
     * syntax the browser understands — oklch, color(display-p3 …), color-mix(), currentColor, named colours,
     * anything added later — because it is the same code path that paints the pixel. Out-of-gamut values are
     * clamped to sRGB, which is what the screen does anyway.
     */
    const _cv = document.createElement('canvas'); _cv.width = _cv.height = 1;
    const _cx = _cv.getContext('2d', { willReadFrequently: true });
    const _seen = new Map();
    const toRGBA = s => {
        const key = String(s);
        if (_seen.has(key)) return _seen.get(key);
        _cx.clearRect(0, 0, 1, 1);
        // Set a known value first: an invalid colour leaves fillStyle untouched, so without this a typo
        // would silently inherit whatever the previous measurement was.
        _cx.fillStyle = '#000000';
        _cx.fillStyle = key;
        _cx.fillRect(0, 0, 1, 1);
        const d = _cx.getImageData(0, 0, 1, 1).data;
        const v = [d[0], d[1], d[2], d[3] / 255];
        _seen.set(key, v);
        return v;
    };

    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

    /* Composite a translucent colour over what is behind it. WCAG is about what the eye receives, and text
     * at 80% opacity over a dark panel is not the colour it was declared as. */
    const over = (fg, bg) => fg[3] >= 1 ? fg
        : [0, 1, 2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])));

    const ratio = (fgStr, bgStr) => {
        const bg = toRGBA(bgStr);
        const a = lum(over(toRGBA(fgStr), bg)), c = lum(bg);
        const [hi, lo] = a > c ? [a, c] : [c, a];
        return +(((hi + 0.05) / (lo + 0.05)).toFixed(2));
    };

    /*
     * Walk up for the first opaque-enough background — and REFUSE to guess past a gradient.
     *
     * A gradient is a background-IMAGE. backgroundColor on an element painted with one resolves to
     * transparent, so this walk used to sail straight past it and measure the text against whatever solid
     * colour was further up the tree. That is not a small inaccuracy: it measured the primary action button —
     * white text on a green gradient — against the PAGE, which in the dark theme is nearly black, so it
     * reported a huge ratio and passed. The same element in the light theme measured 1.03:1 against a pale
     * panel. Both numbers were fiction; the dark one was fiction that said "fine".
     *
     * So an element carrying a background-image is required to also declare an opaque background-color. That is
     * good practice regardless — it is the fallback if the image fails — and here it is what makes the colour
     * behind the text knowable at all. When it is missing, the element is reported as UNMEASURABLE and counts
     * as a failure, because "I cannot tell" must never render as "it passes".
     */
    const unmeasurable = [];
    const bgOf = el => { let n = el;
        while (n && n !== document.documentElement) {
            const cs = getComputedStyle(n);
            const c = cs.backgroundColor;
            const opaque = c && toRGBA(c)[3] > 0.92;
            if (cs.backgroundImage && cs.backgroundImage !== 'none' && !opaque) {
                unmeasurable.push({
                    where: (n.getAttribute('data-measure') || n.className || n.tagName).toString().slice(0, 40),
                    why: 'painted with a gradient but declares no opaque background-color, so the colour '
                        + 'behind its text cannot be determined',
                });
                return c && toRGBA(c)[3] > 0 ? c : 'rgb(0,0,0)';
            }
            if (opaque) return c;
            n = n.parentElement;
        }
        const root = getComputedStyle(document.documentElement).backgroundColor;
        return root && toRGBA(root)[3] > 0.92 ? root : 'rgb(0,0,0)'; };

    const contrastFailures = [];
    for (const el of q('body *')) {
        if (el.matches('script,style,noscript,svg,svg *')) continue;
        // WCAG 1.4.3 exempts inactive controls, and a disabled button here is drawn at 0.55 opacity on
        // purpose. Measuring it would produce a failure that is correct to ignore, which trains you to
        // ignore the report.
        if (el.closest('[disabled],[aria-disabled="true"]')) continue;
        const hasOwnText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!hasOwnText) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
        // WCAG "large text": 24px, or 18.66px when genuinely bold. 600 is not bold.
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const bg = bgOf(el);
        const got = ratio(cs.color, bg);
        if (got < need) contrastFailures.push({
            where: (el.getAttribute('data-measure') || el.className || el.tagName).toString().slice(0, 40),
            tag: el.tagName, text: (el.textContent || '').trim().slice(0, 34),
            color: cs.color, bg, size: +size.toFixed(1), weight, need, got,
        });
    }

    /* ---- sections: does each one fill the column it is in? ---- */
    const sections = q('[data-measure="section"]').map(el => {
        const parent = el.parentElement ? inner(el.parentElement) : { width: el.getBoundingClientRect().width };
        const own = el.getBoundingClientRect().width;
        return { name: (el.className || el.tagName).toString().slice(0, 30),
                 width: Math.round(own), of: Math.round(parent.width),
                 fill: parent.width ? +(own / parent.width).toFixed(3) : 1 };
    });

    /* ---- the opened item: does its content fill it, or is it a card with a hole in it? ---- */
    const detailEl = document.querySelector('[data-measure="detail"], [data-measure-detail]');
    let detail = null;
    if (detailEl) {
        const box = inner(detailEl);
        const kids = [...detailEl.querySelectorAll('[data-measure="detail-content"]')];
        const right = kids.reduce((a, k) => Math.max(a, k.getBoundingClientRect().right), 0);
        detail = { width: Math.round(box.width), contentWidth: Math.round(right - box.left),
                   parts: kids.length,
                   fill: box.width && kids.length ? +((right - box.left) / box.width).toFixed(3) : null };
    }

    /* ---- density: what can you see and act on without scrolling? ---- */
    const tasks = q('[data-measure="task"]');
    const aboveFold = tasks.filter(t => { const r = t.getBoundingClientRect(); return r.top >= 0 && r.top < vh; }).length;

    /*
     * THE HELD-TOOL-CALL BAND, and the numbers L3 stands down on. See check A4.
     *
     * Three things, and each one is a claim somebody could break: whether it is present at all, how tall it
     * is, and whether it sits above the queue. The last is measured as a document position rather than
     * inferred from the markup, because "above the queue" is the entire justification for it being on this
     * page and a stylesheet could move it without touching a component.
     */
    /*
     * THE RENDERED OPEN-DECISION COUNT, for the staleness guard. See where it is compared.
     *
     * Read off the header chip rather than counted from the cards, because the cards are CAPPED at two whole
     * plus a count — so counting them would report 2 on a page showing 4 and the guard would fire on a
     * perfectly good render. The chip is the figure the page is claiming.
     */
    const shownDecisions = (() => {
        const el = document.querySelector('[data-figure="open-decisions"]');
        if (!el) return null;
        const n = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : null;
    })();

    const bandEl = document.querySelector('[data-measure="approval-band"]');
    const queueEl = document.querySelector('.queue');
    const band = (() => {
        if (!bandEl) return { present: false, height: 0, rows: 0, aboveQueue: null, capped: null };
        const r = bandEl.getBoundingClientRect();
        const qr = queueEl ? queueEl.getBoundingClientRect() : null;
        return {
            present: true,
            height: Math.round(r.height),
            rows: bandEl.querySelectorAll('[data-measure="approval"]').length,
            aboveQueue: qr ? r.bottom <= qr.top + 1 : null,
            /* Is the cap holding anything back? Its presence is what makes the height bounded. */
            capped: !!bandEl.querySelector('[data-measure="approval-more"]'),
        };
    })();
    /* Where the queue's own content starts, so a check can say the band never buries it entirely. */
    const queueTop = queueEl ? Math.round(queueEl.getBoundingClientRect().top) : null;

    /*
     * How far do you have to scroll to see the whole queue?
     *
     * Measured over the document AND over any inner scroller that contains tasks, because a sticky pane
     * beside a scrolling list makes the DOCUMENT stop scrolling — at which point a naive
     * scrollHeight/innerHeight reads 1.0 and the check congratulates itself.
     */
    const scrollers = [document.documentElement, ...q('*').filter(el => {
        const cs = getComputedStyle(el);
        return /auto|scroll/.test(cs.overflowY) && el.querySelector('[data-measure="task"]');
    })];
    const scrollExtent = Math.max(...scrollers.map(el =>
        +((el.scrollHeight || 0) / Math.max(1, el.clientHeight)).toFixed(2)));

    /* ---- columns, for the phone single-column rule ---- */
    const rows = new Map();
    for (const t of tasks) { const k = Math.round(t.getBoundingClientRect().top); rows.set(k, (rows.get(k) || 0) + 1); }

    /* ---- semantics and keyboard ---- */
    const focusables = q('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
        .filter(el => !el.disabled && el.getBoundingClientRect().width > 0);
    const fakeButtons = q('[role="button"]').filter(el => el.tagName !== 'BUTTON').map(el => ({
        tag: el.tagName, cls: (el.className || '').toString().slice(0, 30),
        focusable: el.tabIndex >= 0,
    }));
    const saveStates = q('[data-measure="save-state"]');
    const announced = saveStates.filter(el =>
        el.closest('[aria-live],[role="status"],[role="alert"]') !== null).length;

    /*
     * Anything focusable that is underneath a full-screen fixed panel.
     *
     * The inert attribute removes an element and its subtree from the tab order entirely, so the honest
     * test is simply: is a control the panel is covering still reachable? Counted rather than assumed,
     * because inert is set from JS on a media-query condition and getting that condition wrong fails
     * silently in exactly the direction nobody checks.
     *
     * (No backticks in this comment. It lives inside a template literal, and the first version of it
     * quoted the attribute name that way and terminated the string.)
     */
    const covering = q('body *').find(el => {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed') return false;
        const r = el.getBoundingClientRect();
        return r.width >= vw - 1 && r.height >= vh - 1;
    });
    const reachableUnderPanel = !covering ? 0 : focusables.filter(el =>
        !covering.contains(el) && !el.closest('[inert]') && el.tagName !== 'NEXTJS-PORTAL').length;

    /* ---- the old checks, kept: nothing may leave the viewport sideways ---- */
    const overflowing = q('.wrap *, main *').filter(e => e.getBoundingClientRect().right > vw + 1).length;

    /*
     * EVERY SCROLLBAR CURRENTLY ON SCREEN, AND HOW WIDE IT IS.
     *
     * This is where the owner's reaction to the last iteration started — "what is this ugly
     * scrollbar" — and it had never been measured because it had never been VISIBLE to the harness. Two
     * compounding faults: the screenshot tool hid scrollbars with a Chrome flag, and, worse, it captured
     * full-page, which stretches the viewport to the document height and makes the reading pane's
     * viewport-relative max-height grow until it no longer overflows. The bar could not appear in any image it
     * produced.
     *
     * offsetWidth minus clientWidth is the gutter the browser actually reserved, so it is the real painted
     * width rather than what the stylesheet asked for — which matters because a thin scrollbar is a hint and
     * the platform decides what thin means.
     *
     * (NO BACKTICKS IN THIS COMMENT. It lives inside a template literal, and the first version of it quoted a
     * CSS flag that way: the backtick closed the string, and the two hyphens that followed were then parsed as
     * a postfix decrement — "Invalid left-hand side expression in postfix operation", pointing at a line 180
     * lines earlier. The header of this file warns about exactly this and it still happened.)
     */
    /*
     * DECORATIVE GEOMETRY THAT ESCAPED ITS OWN BOX.
     *
     * The emblem is drawn from transforms, and the first version composed an SVG transform attribute with a
     * CSS rotate property. Those are two transform systems with two different notions of origin, so the
     * progress arc swung out of the emblem and printed itself across the rank text beside it. Nothing caught
     * it: every geometry check here measures whether content FILLS its container, and not one asked whether
     * anything had left one.
     *
     * Generalised to any SVG the interface draws, because the failure is about transforms rather than about
     * this particular sigil. Two pixels of tolerance for stroke antialiasing on a rotated shape.
     */
    /*
     * THE TIME FILTER: can the queue be narrowed to what fits a real gap in the day?
     *
     * Every task carries an honest estimate in minutes and until now the only thing using it was the total in
     * the header — "21 tasks, about 12h 20m", which is a wall rather than a plan. The chips answer "I have
     * fifteen minutes before a call".
     *
     * Measured from data-minutes on the rows rather than from the rendered "25m" string, because parsing
     * formatted durations back into numbers is a second implementation of humanMinutes and would be wrong
     * differently.
     */
    const timeChips = q('[data-time-bucket]').map(el => ({
        max: +el.getAttribute('data-time-bucket'),
        pressed: el.getAttribute('aria-pressed') === 'true',
        label: (el.textContent || '').trim().slice(0, 24),
    }));
    const visibleTaskMinutes = q('[data-measure="task"]').map(el => {
        const v = el.getAttribute('data-minutes');
        return v === null || v === '' ? null : +v;
    });

    /*
     * A TASK THAT HAS BEEN WAITING ON SOMEBODY ELSE FOR DAYS.
     *
     * "Flip Instacart to production when the approval email arrives" sits in the Not-yet section indefinitely.
     * If that email arrived a week ago and nobody noticed, the hub is quietly out of date about the one kind of
     * work it explicitly promises never to blame him for.
     *
     * So the measurement is: does a long-waiting task offer a way to CHASE it? And the constraint that comes
     * with it, which is why this check exists at all rather than a nudge being added and forgotten: a blocked
     * task is not his fault and must never count against him, so the affordance has to point at the agent.
     */
    const stale = q('[data-measure="stale-blocked"]');
    const staleWithControl = stale.filter(el => el.querySelector('button')).length;

    const graphics = q('svg').filter(el => el.getBoundingClientRect().width > 0);
    const escapees = graphics.flatMap(svg => {
        const s = svg.getBoundingClientRect();
        if (!s.width) return [];
        return [...svg.querySelectorAll('*')]
            .map(el => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && (
                r.left < s.left - 2 || r.right > s.right + 2 ||
                r.top < s.top - 2 || r.bottom > s.bottom + 2))
            .map(({ el, r }) => ({
                what: (svg.getAttribute('class') || svg.tagName) + ' > ' + el.tagName,
                by: Math.round(Math.max(
                    s.left - r.left, r.right - s.right, s.top - r.top, r.bottom - s.bottom)),
            }));
    });

    /* Is the reading pane in its IDLE state — standing, record, compose, projects, footer — as opposed to
       holding an opened task? L7 only means anything about the idle one; a document that scrolls is correct. */
    const paneIdle = !!document.querySelector('.pane .idle');

    const scrollbars = q('body *')
        .filter(el => {
            const cs = getComputedStyle(el);
            if (!/auto|scroll/.test(cs.overflowY)) return false;
            return el.scrollHeight > el.clientHeight + 1;
        })
        .map(el => ({
            what: (el.getAttribute('data-measure') || el.className || el.tagName).toString().slice(0, 24),
            gutter: el.offsetWidth - el.clientWidth,
            /* HOW FAR over, not just that it is over. P6 only ever asked whether a scrollbar was styled;
               nothing measured how much content was actually out of reach, so "the pane scrolls" stayed a
               remark in a report rather than a number a check could hold. Used by L7. */
            over: el.scrollHeight - el.clientHeight,
        }))
        .filter(x => x.gutter > 0);

    /* ------------------------------------------------------------------ finished work: the record
     *
     * Hooked to data-measure roles for the same reason everything else here is: the first version of this
     * file queried a styling class and could not see the section beside it.
     *
     *   progress          the record region
     *   progress-figure   any element that renders a figure about finished work
     *   done-task         one finished item, in the full list
     *   became-true       the asking agent's own sentence about what the completion achieved
     *   milestone         one reached milestone
     *   summary           the header line of counts
     *
     * Counted as -1 rather than 0 when the thing does not exist at all, which is the K4 lesson: a query
     * that matches nothing satisfies every threshold it is given, so "absent" has to be distinguishable
     * from "present and fine" or a missing feature reports as a passing check.
     */
    const figures = q('[data-measure="progress-figure"]');
    const doneRows = q('[data-measure="done-task"]');
    const becameTrue = q('[data-measure="became-true"]');
    const milestones = q('[data-measure="milestone"]');

    const figuresAboveFold = figures.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.top < vh;
    }).length;

    /*
     * Is every figure something you can press?
     *
     * docs/RESEARCH.md §14: of 89 studied dashboards only 47% were still active, and actionability cannot
     * be added to a finished readout. The rule this project adopted is "if clicking it does nothing, it
     * does not go on the page", and a page about completed work is the hardest case for it — so it is
     * measured rather than asserted in prose.
     */
    const isControl = el => el.tagName === 'BUTTON' || el.tagName === 'A' || !!el.closest('button,a[href]');
    const figuresAsControls = figures.filter(isControl).length;
    const doneRowsWithControl = doneRows.filter(el => el.querySelector('button,a[href]')).length;

    /*
     * How many LISTED completions state what they achieved.
     *
     * Scoped to the rows rather than counted across the whole page. The first version counted every
     * became-true element anywhere, and the record shows a few of them in the pane as well as in the list,
     * so P3 reported "12 of 9 completions state what they achieved" — a ratio greater than one. It passed,
     * which is worse than failing: a check whose number cannot mean what it claims is a check nobody will
     * read carefully next time.
     */
    const doneRowsStating = doneRows.filter(el =>
        el.querySelector('[data-measure="became-true"]')).length;

    /*
     * IS THE RECORD IN THE ORDER IT SAYS IT IS IN? — read off the DOM, in the order the eye reads.
     *
     * The list says "newest first" and for the whole life of this surface it was not: the completions were
     * bucketed by project, so one descending list became four of them side by side. At the fixture's nine rows
     * across four projects that reads as an arrangement; at two years it is fifteen boxes of four and the
     * sentence above them is simply false (docs/ITERATION-LOG.md §XXVII).
     *
     * Counted as PAIRS OUT OF ORDER rather than as a boolean, so the failure message can say how bad it is, and
     * from the data-done-at attribute rather than from the rendered date because "6 Aug" and "6 Aug" cannot be compared and
     * two rows finished on one day are legitimate. Minus one for "no rows", which is the K4 rule: absent must never
     * satisfy a threshold.
     */
    const doneOutOfOrder = (() => {
        const stamps = doneRows.map(el => el.getAttribute('data-done-at') || '');
        if (stamps.length < 2) return -1;
        let wrong = 0;
        for (let i = 1; i < stamps.length; i++) if (stamps[i] > stamps[i - 1]) wrong++;
        return wrong;
    })();

    /*
     * DOES THE NAVIGATION BAR FIT ON ONE LINE? — the top of the first thing anybody sees.
     *
     * The bar wraps, and in the cleared layout it did: the shell was narrowed to 680px for the earned-empty
     * hub, the bar needs 681px at 1280, and "Find anything" ended up alone on a second line above the header's
     * rule — on the unstarted hub, which is the FIRST screen a new person sees. It also meant the wordmark
     * moved 300px sideways the moment the last task was ticked off, because the bar was one width with work in
     * the queue and another without.
     *
     * Measured as the number of DISTINCT TOP EDGES among the bar's three parts, which is what "wrapped" means
     * geometrically and is independent of why it happened. The three parts are top-aligned in CSS, so
     * one row is one value; a wrap puts the right-hand slot on its own.
     */
    const navRows = (() => {
        const parts = ['.brand', '.navlist', '.navright']
            .map(s => document.querySelector(s))
            .filter(Boolean)
            .map(el => Math.round(el.getBoundingClientRect().top));
        return parts.length < 2 ? -1 : new Set(parts).size;
    })();

    /*
     * What the page CLAIMS it has finished, so the list can be checked against it.
     *
     * This is what makes "the record is not capped" a data-independent assertion. The threshold used to be
     * "at least nine rows", which is a fixture volume — so against the real hub, which had two completions,
     * the check reported a failure on a page that was completely correct. Three checks doing that at once is
     * how a suite teaches you to ignore it.
     *
     * Comparing the list to the figure catches the actual bug (a store-side limit 5) on ANY dataset, including
     * an empty one, and is strictly stronger than counting to nine.
     */
    /*
     * COMMA-TOLERANT, and this one matters more than it looks: at 2,190 completions a bare digit parser reads
     * "2,190 done" as **2**, and P2 — whose whole job is to assert that the figure equals the SQL count — would
     * then report a mismatch of 2,188 against a page that is completely correct. The other figure parser in this
     * file — the one P5 uses — has been comma-tolerant since it was written; this one was not, and until
     * humanCount shipped no figure on the page had ever reached four digits in a check's path.
     */
    const statedDoneEl = document.querySelector('[data-figure="tasks-done"]');
    const statedDone = statedDoneEl
        ? (() => {
            const m = /\\d[\\d,]*/.exec(statedDoneEl.textContent || '');
            return m ? +m[0].replace(/,/g, '') : null;
        })()
        : null;

    /*
     * THE TRUTH GUARD ON TARGETS, AND WHAT IT USED TO BE.
     *
     * This check used to assert that NO target appeared anywhere on the progress surface — no "3 more", no
     * countdown, no level. That was the right rule for the design it was written against: docs/RESEARCH.md §19
     * is that the same number helps or harms depending on whether it reads as INFORMATIONAL ("that was your
     * 25th") or CONTROLLING ("3 more to reach 25"), and the second is the configuration the 1999 meta-analysis
     * of 128 experiments found undermines intrinsic motivation.
     *
     * The owner then asked, twice and explicitly, for levels and a sense of progression. So the absolute rule
     * is gone and a narrower one replaced it, which protects the thing that actually cannot be given up:
     *
     *   1. **Every stated target must be arithmetically true.** A rendered "N to go" has to equal its own
     *      operands, which travel with it in data attributes. A component that starts rounding, flattering, or
     *      computing the remainder its own way fails here rather than quietly encouraging him with fiction.
     *   2. **No streak, and no loss framing.** This is the part of §19 the evidence is unambiguous about and
     *      it is not what he asked for: Silverman & Barasch measured that merely DISPLAYING a broken streak
     *      cost 8.4 percentage points of continuation on identical behaviour. Nothing here may count
     *      consecutive days or tell him not to break something.
     *
     * "Level 3" and "114 pts" are legal now and are deliberately absent from the banned list — they were on it
     * in the previous version, which is why the list is written out rather than reused.
     */
    const bannedRe = new RegExp(
        [
            '\\\\bstreak\\\\b',
            '\\\\bkeep it up\\\\b', '\\\\bkeep going\\\\b',
            '\\\\bdon.t break\\\\b', '\\\\bdon.t lose\\\\b', '\\\\byou lost\\\\b',
            '\\\\bdays in a row\\\\b', '\\\\bconsecutive days\\\\b',
        ].join('|'), 'i');
    const progressScope = q(
        '[data-measure="progress"], [data-measure="done-list"], [data-measure="summary"],' +
        '[data-measure="mark-wall"], [data-measure="next-up"]');
    const banned = progressScope.flatMap(root =>
        [root, ...root.querySelectorAll('*')]
            .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
            .map(el => (el.textContent || '').trim())
            .filter(t => bannedRe.test(t))
            .map(t => t.slice(0, 60)));

    /*
     * Every stated target, with the operands it claims to be derived from, checked.
     *
     * Reading the digits out of the rendered text rather than out of a data attribute is the point: the number
     * a person actually sees is the one that has to be right, and a check that compares one attribute against
     * another attribute would pass a component that renders something else entirely.
     */
    const digits = el => {
        const m = /-?\\d[\\d,]*/.exec(el.textContent || '');
        return m ? +m[0].replace(/,/g, '') : null;
    };
    const targets = [];
    for (const el of q('[data-have][data-need]')) {
        const have = +el.getAttribute('data-have'), need = +el.getAttribute('data-need');
        targets.push({ what: 'mark', shown: digits(el), expected: need - have });
    }
    for (const el of q('[data-figure="to-next"][data-points][data-next-at]')) {
        const points = +el.getAttribute('data-points'), nextAt = +el.getAttribute('data-next-at');
        targets.push({ what: 'level', shown: digits(el), expected: nextAt - points });
    }
    const wrongTargets = targets.filter(t => t.shown !== t.expected);

    /*
     * EVERY SPACE THE PAGE ACTUALLY PAINTS, MEASURED AGAINST THE ONE SCALE.
     *
     * NO BACKTICKS IN THIS COMMENT. Everything here is inside the MEASURE template literal.
     *
     * WHY THIS IS A CHECK AND NOT A CONVENTION. app/globals.css has declared a spacing scale since the
     * "wall of text" work, and its own comment names the disease as margins picked per rule. A census of
     * the RENDERED page on 8 Aug 2026 found nineteen distinct spacing values in use, and the three
     * commonest of them — 7px on 117 elements, 11px on 108, 10px on 89 — were not on that scale at all.
     * Six of the eight values the comment lists as the original disease were back.
     *
     * Nothing could have seen that. No single value looks wrong in a screenshot; only the absence of a
     * rhythm does, and a rhythm is the one property of a layout that is invisible one element at a time.
     * Nine green suites and four visual passes went past it.
     *
     * MEASURED ON THE RENDERED PAGE, in the way this project measures contrast, and for the same reason:
     * the stylesheet can say anything. An inline style in a component bypasses it entirely, which is
     * exactly where four of the off-scale values were living (marginTop 6, 10 and 14 in three page files
     * and Board.tsx) — invisible to any check that reads CSS.
     *
     * 1px IS EXEMPT AND IT IS THE ONLY EXEMPTION. It is a hairline rather than a step: the gap between
     * two queue rows is 1px on purpose, and snapping it to 2 costs 21px of page and takes the sixth task
     * below the fold, which is L3. Measured before the sweep, and written down so the next person does not
     * "fix" it.
     */
    /*
     * READ THROUGH THE TYPED OM, AND THAT IS NOT A STYLE PREFERENCE — the first version used
     * getComputedStyle and was wrong in a way that would have been easy to "fix" by loosening the check.
     *
     * getComputedStyle returns the USED value for a margin, so "margin-left: auto" comes back as 298.19px
     * on the nav and 908.08px on a project meta line. Those are not spacing decisions, they are alignment,
     * and there is no scale they could ever be on. The check reported seven failures and every one was a
     * centred element doing exactly the right thing.
     *
     * computedStyleMap() returns the COMPUTED value, where a margin of auto is still the keyword auto and
     * is skipped by the unit test below. The temptation was to exclude anything over 64px instead, which
     * would have passed the check and quietly stopped measuring every large space on the page.
     */
    const SPACE_SCALE = [1, 2, 4, 8, 12, 16, 24, 32, 48];
    const SPACE_PROPS = ['padding-top', 'padding-bottom', 'padding-left', 'padding-right',
                         'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
                         'row-gap', 'column-gap'];
    const offScaleMap = new Map();
    for (const el of q('.shell *, .wrap *')) {
        if (el.closest('nextjs-portal')) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (!el.computedStyleMap) continue;
        const map = el.computedStyleMap();
        for (const prop of SPACE_PROPS) {
            const entry = map.get(prop);
            /* auto, normal (a gap), or a percentage: not a step on any scale. */
            if (!entry || entry.unit !== 'px') continue;
            const raw = entry.value;
            if (!isFinite(raw) || raw <= 0) continue;
            const v = Math.round(raw * 100) / 100;
            if (SPACE_SCALE.indexOf(v) > -1) continue;
            const key = v + 'px';
            if (!offScaleMap.has(key)) offScaleMap.set(key, { px: v, n: 0, where: '' });
            const rec = offScaleMap.get(key);
            rec.n++;
            if (!rec.where) {
                const raw2 = el.className;
                const cls = (raw2 && raw2.baseVal !== undefined) ? raw2.baseVal : String(raw2 || '');
                rec.where = el.tagName.toLowerCase() +
                    (cls.trim() ? '.' + cls.trim().split(' ')[0] : '') + ' ' + prop;
            }
        }
    }
    const spacingOffScale = [...offScaleMap.values()].sort((a, b) => b.n - a.n);

    /*
     * TRACKING AGAINST SIZE, AND WEIGHT AGAINST SIZE. The other half of §XXXI's type finding.
     *
     * NO BACKTICKS IN THIS COMMENT. Everything here is inside the MEASURE template literal.
     *
     * The census found 17px rendered at two different letter-spacings and one 11px uppercase role rendered
     * at three. Both references are strict about this and it is most of why their pages look drawn by one
     * hand: tracking is a function of SIZE, never of component. So is weight, and the census found that one
     * inverted — a 22px section heading at 620 over a 14px inline bold at 650.
     *
     * A convention cannot hold this. It held for exactly as long as it took someone to write
     * ".card.ask .title { font-size: var(--t-lg) }" and inherit a 15.5px tracking with it, which is a
     * two-word rule that looks completely correct in a diff. Only the rendered pair is evidence.
     *
     * UPPERCASE IS ITS OWN ROLE and is checked against one value rather than against the size ramp: caps
     * have no descenders and no lowercase rhythm, so they need positive tracking at every size. That is the
     * exception the references make too, and it is ONE exception rather than the five this file had.
     */
    const TRACK_EM = { 28: -0.026, 22: -0.020, 17: -0.014, 15.5: -0.010 };
    /*
     * Caps are a ramp too, and the first version of this check asserted one value for them. That passed,
     * and the value it enforced was wrong at the only size it was not designed for: 0.07em on a 14px
     * uppercase word is 0.98px. Caps need LESS tracking as they get bigger, which is the lowercase ramp
     * mirrored, so this is a map for the same reason TRACK_EM is.
     */
    const TRACK_CAPS_EM = { 14: 0.045 };
    const TRACK_CAPS_DEFAULT = 0.07;
    const typeOffRamp = [];
    const seenType = new Set();
    for (const el of q('.shell *, .wrap *')) {
        if (el.closest('nextjs-portal')) continue;
        let ownText = false;
        for (const node of el.childNodes) {
            if (node.nodeType === 3 && node.textContent.trim()) { ownText = true; break; }
        }
        if (!ownText) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const cs = getComputedStyle(el);
        const size = Math.round(parseFloat(cs.fontSize) * 10) / 10;
        const caps = cs.textTransform === 'uppercase';
        const em = caps
            ? (TRACK_CAPS_EM[size] !== undefined ? TRACK_CAPS_EM[size] : TRACK_CAPS_DEFAULT)
            : (TRACK_EM[size] !== undefined ? TRACK_EM[size] : 0);
        const want = Math.round(size * em * 100) / 100;
        const got = cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing) * 100) / 100;
        const weight = +cs.fontWeight;
        /*
         * Weight must not FALL as size rises. Stated as the pair (size at or above --t-lg must be at least
         * as heavy as anything smaller that is emphasised), which is the shape the defect took: the ramp
         * itself was fine, the two ends of it disagreed.
         */
        const bad = [];
        if (Math.abs(want - got) > 0.02) bad.push('tracking ' + got + 'px, wants ' + want + 'px');
        if (size >= 17 && weight > 400 && weight < 700) bad.push('weight ' + weight + ' at ' + size + 'px');
        if (size <= 15.5 && weight > 600) bad.push('weight ' + weight + ' at ' + size + 'px');
        if (!bad.length) continue;
        const rawCls = el.className;
        const cls = (rawCls && rawCls.baseVal !== undefined) ? rawCls.baseVal : String(rawCls || '');
        const where = el.tagName.toLowerCase() + (cls.trim() ? '.' + cls.trim().split(' ')[0] : '');
        const key = where + '|' + bad.join('/');
        if (seenType.has(key)) continue;
        seenType.add(key);
        typeOffRamp.push({ where, why: bad.join(', ') });
    }

    return {
        spacingOffScale,
        typeOffRamp,
        viewport: vw, viewportH: vh,
        pageHeight: document.documentElement.scrollHeight,
        screens: +(document.documentElement.scrollHeight / vh).toFixed(1),
        scrollExtent,
        sections, detail,
        tasks: tasks.length, aboveFold,
        band, queueTop, shownDecisions,
        columns: rows.size ? Math.max(...rows.values()) : 0,
        /* ---- the earned-empty hub, for E1 and E2 ----
         *
         * NO BACKTICKS IN THIS COMMENT. Everything here is inside the MEASURE template literal.
         *
         * Hard constraint 6 is that an empty queue is SUCCESS. This reads whether the screen SAYS so and whether
         * it says it with the record behind it, because the failure mode is not a crash — it is the pleasant
         * sentence quietly degrading back into a shrug, which happened once already: for one commit this
         * rendered a "YOUR TURN" heading over a dashed box reading "Nothing to do".
         *
         * Read off the DOM rather than off classes: what matters is that the words are there and that a figure is
         * beside them, which is what E1 asserts.
         */
        /* ---- the UNSTARTED hub, for U1: what a person sees before anything is connected ----
         *
         * NO BACKTICKS IN THIS COMMENT. Everything here is inside the MEASURE template literal.
         *
         * The state every new person starts in, and until this session nothing had ever rendered it — the fixture
         * could not even produce it (see the note on UNSTARTED in tests/fixture.mjs). It shipped for six sessions
         * promising a Telegram message that no agent existed to send.
         *
         * Read off the rendered text rather than off the state attribute, deliberately. The classification is
         * already asserted by check E3 in tests/ladder.mjs; what is unasserted, and what actually went wrong, is
         * the WORDS. A check that read data-empty would have passed while the copy said anything at all.
         */
        unstartedHub: (() => {
            const el = document.querySelector('[data-empty="unstarted"]');
            if (!el) return null;
            const cta = el.querySelector('a[href]');
            return {
                text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
                /* The promise that cannot be kept before an agent exists. */
                promisesTelegram: /telegram/i.test(el.textContent || ''),
                /* A route to the one thing they have to do, and where it goes. */
                ctaHref: cta ? cta.getAttribute('href') : null,
                ctaText: cta ? (cta.textContent || '').trim() : null,
                /* Is the primary action on its own line, or tucked into the end of a sentence? Measured as a real
                   geometric question: does any text sit to the left of it on the same line. */
                ctaOnOwnLine: (() => {
                    if (!cta) return null;
                    const r = cta.getBoundingClientRect();
                    const parent = el.getBoundingClientRect();
                    return r.left - parent.left > 8 && parent.right - r.right > 8;
                })(),
            };
        })(),
        emptyHub: (() => {
            const el = document.querySelector('.empty.done');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const parent = el.parentElement ? inner(el.parentElement)
                : { width: r.width, left: r.left, right: r.right };
            const record = el.querySelector('.emptyrecord');
            const gapLeft = Math.round(r.left - parent.left);
            const gapRight = Math.round(parent.right - r.right);
            return {
                /* A double backslash, not a single one. This is inside a template literal, where a lone
                   backslash-s collapses to a bare s — so the regex became /s+/g and the reported text came back
                   with every letter s stripped out: "Nothing need you. No deci ion blocked". Harmless to the
                   check and unreadable in the report, which is its own small version of a measurement nobody
                   can act on. And NO BACKTICKS in this comment: the first version of it used them to quote the
                   escape sequences and closed the literal, which is the eleventh time. */
                text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
                gapLeft, gapRight,
                /* Within 6px, which absorbs a scrollbar gutter and a subpixel rounding without accepting a
                   panel that is genuinely stuck to one side. */
                centred: Math.abs(gapLeft - gapRight) <= 6,
                /* Does it say what got the hub to zero, with a number in it? A sentence with no figure is the
                   shrug this state must never be. */
                statesRecord: !!record && /\d/.test(record.textContent || ''),
                width: Math.round(r.width),
                fill: parent.width ? +(r.width / parent.width).toFixed(3) : null,
                /* Solid rather than dashed. A dashed outline is the visual language of "something should be
                   here", which is precisely the wrong thing to say about a hub that has reached the state it
                   exists to reach. */
                dashed: getComputedStyle(el).borderTopStyle === 'dashed',
            };
        })(),
        contrastFailures,
        unmeasurable,
        fakeButtons,
        focusables: focusables.length,
        saveStates: saveStates.length, announced,
        reachableUnderPanel,
        panelCovering: !!covering,
        skipLinks: q('a[href^="#"]').length,
        landmarks: { main: q('main').length },
        /*
         * NO BACKTICKS IN THIS COMMENT — it is inside the MEASURE template literal, and one closes it. That trap
         * is recorded in AGENTS.md with six prior occurrences; this session has now added three, every one of
         * them in a comment written moments after reading the warning. It is worth knowing that the warning does
         * not work: what works is remembering that everything in this file between the backticks is a string.
         *
         * A HIDDEN INPUT IS NOT A FIELD, and A2 reported one as an unlabelled one.
         *
         * The unlock banner dismisses itself with a form POST — a cookie can only be set by a response, so doing
         * it with fetch would mean hiding the banner optimistically, which this codebase does not do anywhere.
         * That form carries a hidden input, and A2 went red: "1 of 2 fields have only a placeholder". Correct by
         * its own selector and wrong about the world — there is nothing to label, because there is nothing on
         * screen and nothing to type into.
         *
         * A detector that flags something no user can perceive teaches you to ignore the report, which is the
         * failure mode this whole suite is written against. Excluded here rather than by giving the input a
         * pointless aria-label, because working around a check to make it green is what turns a check into a
         * formality.
         */
        unlabelledFields: q('textarea,select,input')
            .filter(f => f.type !== 'hidden')
            .filter(f => !f.labels?.length && !f.getAttribute('aria-label')
                && !f.getAttribute('aria-labelledby')).length,
        totalFields: q('textarea,select,input').filter(f => f.type !== 'hidden').length,
        docScrollsSideways: document.documentElement.scrollWidth > vw + 1,
        overflowing,
        primaryButtons: q('button.primary,[data-measure="primary-action"]').length,

        /* finished work */
        progressRegions: q('[data-measure="progress"]').length,
        figures: figures.length,
        figuresAboveFold,
        figuresAsControls,
        doneRows: doneRows.length,
        doneOutOfOrder,
        navRows,
        doneRowsWithControl,
        becameTrue: becameTrue.length,
        doneRowsStating,
        statedDone,
        /* The record's own statement about how much of itself it is showing, or null when it makes none.
         * Read as TEXT rather than as a boolean so P9 can check the two numbers in it against the list. */
        recordWindowNote: (() => {
            const el = document.querySelector('[data-measure="record-window"]');
            return el ? (el.textContent || '').trim() : null;
        })(),
        milestones: milestones.length,
        progressScope: progressScope.length,
        banned,
        targets,
        wrongTargets,
        scrollbars,
        paneIdle,
        stale: stale.length,
        staleWithControl,
        timeChips,
        visibleTaskMinutes,
        unestimatedNote: !!document.querySelector('[data-measure="unestimated-note"]'),
        graphics: graphics.length,
        escapees,
    };
})()`;

/* =================================================================================== keyboard probing */

/**
 * How many keystrokes does it take to get keyboard focus into the task list?
 *
 * Counted by pressing real keys, not by counting `focusables` in DOM order — because a skip link changes
 * the answer and a DOM count cannot see that. If the focused thing is a fragment link, Enter is pressed,
 * which is what a person would do. If a skip link exists but its target is not focusable, this measures
 * the same number as if it did not exist, which is the correct answer and the usual bug.
 */
async function keystrokesToFirstTask({ navigate = true, limit = 45 } = {}) {
    /*
     * Reload rather than blur.
     *
     * `document.activeElement.blur()` moves focus to the body but does NOT reset Chrome's sequential
     * focus navigation starting point — so with the reading pane open, the first Tab of a "fresh" count
     * carried on from inside the pane and the check reported 10 keystrokes for a route that takes 4. A
     * reload is also the scenario worth measuring: you have just opened the hub, how many keys to your
     * work?
     *
     * `navigate: false` is for the negative pass, which has already navigated and then injected a fault
     * into the live page. Reloading there would wash the fault away — which it did, and both keyboard
     * checks reported "did not catch its own defect" until this argument existed.
     */
    if (navigate) await b.goto('/');
    let keys = 0;
    while (keys < limit) {
        await b.tab(); keys++;
        const where = await b.evaluate(`(() => {
            const a = document.activeElement;
            if (!a || a === document.body) return { none: true };
            return {
                inTask: !!a.closest('[data-measure="task"]'),
                fragmentLink: a.tagName === 'A' && (a.getAttribute('href') || '').startsWith('#'),
                label: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 30),
            };
        })()`);
        if (where?.inTask) return { keystrokes: keys, reached: true };
        if (where?.fragmentLink) {
            // Pressing Enter on a skip link is a keystroke and is COUNTED whether or not it lands. The
            // first version only counted it on success, which flattered a skip link that jumped to the
            // wrong place by making the wasted press free.
            await b.press('Enter', { code: 'Enter', vk: 13 }); keys++;
            const jumped = await b.evaluate(
                `!!document.activeElement?.closest('[data-measure="task"]')`);
            if (jumped) return { keystrokes: keys, reached: true };
        }
    }
    return { keystrokes: limit, reached: false };
}

/**
 * Is the focus indicator actually visible on this dark surface?
 *
 * Measured on real Tab focus rather than `.focus()`, because `:focus-visible` is the rule that matters and
 * a programmatic focus does not always match it. The bar is WCAG 2.2 SC 1.4.11 (3:1 against what is behind
 * it) plus a 2px minimum thickness, which is the SC 2.4.13 figure — a 1px hairline on a near-black panel is
 * technically an indicator and practically invisible.
 */
async function focusRing({ navigate = true, samples = 14 } = {}) {
    // Same reason as keystrokesToFirstTask: blur() does not reset where Tab resumes from, so this used to
    // sample whatever happened to be near the last thing focused instead of walking the page from the top.
    if (navigate) await b.goto('/');
    const seen = [];
    for (let i = 0; i < samples; i++) {
        await b.tab();
        const r = await b.evaluate(`(() => {
            const a = document.activeElement;
            if (!a || a === document.body) return null;
            // The Next.js development error overlay injects a focusable custom element into every page.
            // It is not part of this interface and does not exist in a production build, so measuring its
            // focus ring would be measuring the framework's dev tooling.
            if (a.tagName === 'NEXTJS-PORTAL' || a.closest('nextjs-portal')) return null;
            const cs = getComputedStyle(a);
            /*
             * Same canvas resolution as the contrast pass in MEASURE, and for the same reason: this had its
             * own copy of the "first three numbers in the string" parser, so an oklch() focus ring would have
             * been measured as a luminance derived from a hue angle. Two copies of one broken idea is how a
             * suite ends up green about two different things at once.
             */
            const _cv = document.createElement('canvas'); _cv.width = _cv.height = 1;
            const _cx = _cv.getContext('2d', { willReadFrequently: true });
            const toRGBA = s => { _cx.clearRect(0,0,1,1); _cx.fillStyle = '#000000'; _cx.fillStyle = String(s);
                _cx.fillRect(0,0,1,1); const d = _cx.getImageData(0,0,1,1).data;
                return [d[0], d[1], d[2], d[3]/255]; };
            const lum = ([r,g,b]) => { const f = v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
                return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
            const over = (fg,bg) => fg[3] >= 1 ? fg
                : [0,1,2].map(i => Math.round(fg[i]*fg[3] + bg[i]*(1-fg[3])));
            const ratio = (x,y) => { const bg = toRGBA(y);
                const p = lum(over(toRGBA(x), bg)), q = lum(bg);
                const [hi,lo]=p>q?[p,q]:[q,p]; return +(((hi+0.05)/(lo+0.05)).toFixed(2)); };
            let bg = 'rgb(0,0,0)';
            for (let n = a.parentElement; n; n = n.parentElement) {
                const c = getComputedStyle(n).backgroundColor;
                if (c && toRGBA(c)[3] > 0.92) { bg = c; break; }
            }
            const shadow = cs.boxShadow && cs.boxShadow !== 'none' ? cs.boxShadow : '';
            const shadowPx = shadow ? Math.max(...(shadow.match(/(\\d+(?:\\.\\d+)?)px/g)||['0px'])
                .map(s => parseFloat(s))) : 0;
            const outlinePx = cs.outlineStyle === 'none' ? 0 : (parseFloat(cs.outlineWidth) || 0);
            const thickness = Math.max(outlinePx, shadowPx);
            /* The ring colour may be any syntax now, so match a whole colour function rather than only
             * rgb()/rgba(). oklch(), color-mix() and color() all have to be reachable here. */
            const ringColour = outlinePx ? cs.outlineColor
                : (shadow.match(/(?:oklch|oklab|rgba?|hsla?|color|color-mix|lab|lch)\\([^)]*\\)/)?.[0] || cs.color);
            return {
                what: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 28),
                outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
                thickness: +thickness.toFixed(1), contrast: ratio(ringColour, bg),
            };
        })()`);
        if (r) seen.push(r);
    }
    return seen;
}

/**
 * Does the focus ring have ROOM, or does a scrolling container cut it off?
 *
 * K2 asks whether the ring is thick enough and legible enough. It cannot see this, because it measures the
 * ring's colour and width and never asks whether the pixels it describes are actually painted. They are not,
 * for anything sitting flush against the edge of `.pane`: the ring is drawn 2px outside the element with a 2px
 * stroke, so it needs 4px of room, and `overflow-y: auto` clips whatever falls outside the padding box.
 *
 * WHY THIS IS NOT COSMETIC. The ring is the only thing telling a keyboard user where they are, so a ring that
 * is whole on most controls and shaved on the ones inside the pane is worse than a uniformly thin one — the
 * indicator changes shape as you move, which reads as the page glitching rather than as focus moving. WCAG 2.2
 * added SC 2.4.11 Focus Not Obscured for the fully-hidden case; this is the same failure part-way.
 *
 * HOW THE ROOM REQUIREMENT IS OBTAINED, and this is the part that matters: `need` is taken from a ring measured
 * on a REAL Tab focus, not from a constant. Hardcoding 4 would have made the check agree with the stylesheet
 * only until someone changed `outline-offset`, and a geometry check calibrated against a stale assumption
 * passes for the wrong reason. The elements themselves need no focus — clipping is pure geometry once the ring
 * size is known, so this is one page-side pass over every focusable rather than 72 round-trips.
 */
async function focusRoom({ navigate = true } = {}) {
    if (navigate) await b.goto('/');

    /* One real Tab, to read the ring the browser actually paints for `:focus-visible`. */
    await b.tab();
    const need = await b.evaluate(`(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const cs = getComputedStyle(a);
        if (cs.outlineStyle === 'none') return null;
        return (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
    })()`);

    /* -1 rather than 0 when no ring could be read, for this file's third trap: a room requirement of zero is
       satisfied by every element on the page, so "I could not measure the ring" would render as a clean pass. */
    if (need == null || !(need > 0)) return { need: -1, cut: [] };

    const cut = await b.evaluate(`(() => {
        const need = ${need};
        const SEL = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const out = [];
        for (const el of document.querySelectorAll(SEL)) {
            if (el.closest('nextjs-portal') || el.disabled) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            for (let p = el.parentElement; p; p = p.parentElement) {
                const cs = getComputedStyle(p);
                if (!/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) continue;
                const pr = p.getBoundingClientRect();
                /*
                 * MEASURED AGAINST THE SCROLL EXTENT, NOT THE VISIBLE BOX.
                 *
                 * The first version of this compared the ring to the container's current rectangle and
                 * reported 28px and 117px cuts on the last two controls in the pane. Both were nonsense: at
                 * 1280 the pane really does scroll, so those controls were simply below the current scroll
                 * position, and a control you scroll to has a perfectly whole ring when you get there. It was
                 * measuring "off screen right now" and calling it "clipped" — a proxy for the thing I wanted,
                 * which is this file's most repeated mistake.
                 *
                 * A ring is genuinely cut only at the ENDS of the scroll range, where there is no further
                 * room to reveal: flush against the padding edge at offset 0, or past the scrollable extent
                 * at the far end. So positions are taken in the container's own content coordinates.
                 */
                const bl = parseFloat(cs.borderLeftWidth) || 0;
                const bt = parseFloat(cs.borderTopWidth) || 0;
                const x0 = r.left - (pr.left + bl) + p.scrollLeft;
                const y0 = r.top - (pr.top + bt) + p.scrollTop;
                const scrolls = a => /auto|scroll/.test(a);
                /*
                 * NO GUTTER SUBTRACTION, and it took a second wrong answer to see why.
                 *
                 * The scrollbar gutter is not a clip — content genuinely cannot be there — so I subtracted it
                 * from the room available on the right, and the check then reported exactly 10px (this pane's
                 * gutter) shaved off every full-width control in it. clientWidth is the padding box MINUS the
                 * gutter already, and scrollWidth is measured on the same basis, so subtracting it again
                 * charged the same pixels twice. Correcting for something the platform has already corrected
                 * for is the same class of error as measuring the visible box instead of the scroll extent.
                 */
                const sides = [];
                if (/auto|scroll|hidden/.test(cs.overflowX)) {
                    const far = scrolls(cs.overflowX) ? p.scrollWidth : p.clientWidth;
                    sides.push(['left', need - x0], ['right', (x0 + r.width + need) - far]);
                }
                if (/auto|scroll|hidden/.test(cs.overflowY)) {
                    const far = scrolls(cs.overflowY) ? p.scrollHeight : p.clientHeight;
                    sides.push(['top', need - y0], ['bottom', (y0 + r.height + need) - far]);
                }
                /* 1px of tolerance, deliberately: Chrome rounds scrollWidth/scrollHeight to integers and
                   getBoundingClientRect does not, so a sub-pixel layout produces a phantom 0.5px cut that is
                   not a defect and would make the check cry wolf on every run. */
                const worst = sides
                    .filter(([, over]) => over > 1)
                    .sort((x, y) => y[1] - x[1])[0];
                if (worst) {
                    out.push({
                        what: (el.getAttribute('aria-label') || el.textContent || el.tagName)
                            .trim().replace(/\\s+/g, ' ').slice(0, 26),
                        by: (p.getAttribute('data-measure') || p.className || p.tagName).toString().slice(0, 14),
                        side: worst[0], cut: Math.round(worst[1]),
                    });
                }
                break;   // the nearest clipping ancestor is the one that does the cutting
            }
        }
        return out;
    })()`);

    return { need, cut };
}

/**
 * Press the finished-work figure, the way a person would, and wait for the record to actually appear.
 *
 * Written as a click rather than as a URL or a state poke on purpose: the figure being a CONTROL is half of
 * what check P4 asserts, so a harness that reached the record some other way would be measuring a page no
 * user can get to. If pressing it does not produce the list, that is the finding.
 *
 * Retried for the same reason OPEN_LONGEST_TASK is: the page is server-rendered and React attaches 50–130ms
 * after the markup lands, so the first click of a run is dropped if you do not wait for a handler.
 */
const SHOW_FINISHED = `(async () => {
    const figure = () => document.querySelector(
        '[data-measure="progress-figure"][data-figure="tasks-done"]');
    if (!figure()) return { ok: false, why: 'no finished-work figure on the page to press' };
    for (let i = 0; i < 60; i++) {
        if (document.querySelector('[data-measure="done-task"]')) {
            return { ok: true, rows: document.querySelectorAll('[data-measure="done-task"]').length };
        }
        figure()?.click();
        await new Promise(res => setTimeout(res, 120));
    }
    return { ok: false, why: 'pressing the figure never listed any finished work' };
})()`;

/**
 * Press the tightest time filter, the way a person with ten minutes would.
 *
 * Returns the bucket it pressed so the check can assert against the right number rather than a hard-coded
 * one — the buckets are only offered when something matches them, so which is "tightest" depends on the data.
 */
const PRESS_TIGHTEST_TIME = `(async () => {
    const chips = () => [...document.querySelectorAll('[data-time-bucket]')];
    if (!chips().length) return { ok: false, why: 'the queue offers no time filter' };
    const max = Math.min(...chips().map(c => +c.getAttribute('data-time-bucket')));
    const before = document.querySelectorAll('[data-measure="task"]').length;
    for (let i = 0; i < 40; i++) {
        const chip = chips().find(c => +c.getAttribute('data-time-bucket') === max);
        if (chip && chip.getAttribute('aria-pressed') === 'true') {
            return { ok: true, max, before,
                     after: document.querySelectorAll('[data-measure="task"]').length };
        }
        chip?.click();
        await new Promise(r => setTimeout(r, 100));
    }
    return { ok: false, why: 'pressing the tightest time filter never took effect' };
})()`;

/** Does the stylesheet define a focus style at all? Informational — the ring measurement is the check. */
const FOCUS_RULES = `(() => { let n = 0;
    for (const s of document.styleSheets) { try { for (const r of s.cssRules)
        if (r.selectorText && /:focus/.test(r.selectorText)) n++; } catch (e) {} }
    return n; })()`;

/* ============================================================================================ checks */

const pct = v => `${Math.round(v * 100)}%`;

/*
 * Each check is (id, what it measures, the threshold, how to break it on purpose).
 *
 * `break` runs in the page and must reintroduce the real defect, not a caricature of it — the point is to
 * confirm the check would have caught the thing that actually shipped.
 */
const CHECKS = [
    {
        id: 'L1', widths: DESKTOP,
        what: 'every section fills the column it sits in',
        value: m => m.sections.length ? Math.min(...m.sections.map(s => s.fill)) : 1,
        pass: v => v >= 0.90,
        say: (v, m) => {
            const worst = [...m.sections].sort((a, x) => a.fill - x.fill)[0];
            return `narrowest section fills ${pct(v)} of its column` +
                   (worst ? ` (${worst.name}: ${worst.width}px of ${worst.of}px)` : '');
        },
        /*
         * The rule that shipped: a cap on the decisions column, so the most important content on the page
         * sat beside 600px of nothing.
         *
         * Injected as a PERCENTAGE rather than as the literal `max-width: 820px` that caused it. The
         * literal figure stopped reproducing the defect the moment the queue column became narrower than
         * 911px — 820/911 rounds to exactly the 0.90 threshold, so the check passed a page that had been
         * deliberately broken. A fault injection pinned to a number from the old layout expires silently
         * the first time the layout changes, which is the worst possible time.
         */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '[data-measure="section"] { max-width: 60% !important; }' }))`,
    },
    {
        id: 'L2', needsQueue: true, widths: DESKTOP,
        what: 'an opened item fills the container it was given',
        value: m => m.detail?.fill ?? null,
        pass: v => v !== null && v >= 0.90,
        say: (v, m) => v === null ? 'no opened item found to measure'
            : `content spans ${m.detail.contentWidth}px of a ${m.detail.width}px container (${pct(v)})`,
        // The interim fix: span the whole row, then cap the contents and leave the rest empty. Also a
        // percentage, for the same reason as L1 — the old absolute 760px stopped shrinking anything once
        // the reading pane was 420px wide, and the check quietly stopped being able to fail.
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '[data-measure="detail-content"] { max-width: 55% !important; }' }))`,
    },
    {
        id: 'L3', needsQueue: true, widths: DESKTOP,
        what: 'tasks are visible without scrolling',
        /*
         * ==========================================================================================
         * IT STANDS DOWN WHILE A TOOL CALL IS HELD, AND THAT IS A DELIBERATE CHANGE WITH AN ARGUMENT
         * ==========================================================================================
         *
         * Measured: with one held call the band costs two of the six tasks at 1280 (4 of 21), and with two it
         * costs five (1 of 21). At 1920 and 2560 it costs nothing. So the band cannot exist at 1280 and leave
         * this threshold intact — the honest options were to weaken the threshold permanently, to refuse the
         * feature, or to scope the claim.
         *
         * THE CLAIM IS SCOPED, because six-above-the-fold was calibrated against the resting page and a held
         * call is not the resting page. An agent is standing still with ten minutes on the clock; a task has
         * waited days and will wait another hour. Putting the queue above the thing that expires would be
         * getting the priority exactly backwards, and Nav.tsx's promise — that new CHROME must fit inside this
         * budget — is untouched: the band is not chrome, it is the most urgent item on the page and it is gone
         * ten minutes later.
         *
         * What replaces the coverage is A4, which asserts the properties that matter in the held state: the
         * band sits above the queue, its height is bounded however many calls arrive, and the queue still
         * starts on the first screen. Standing down without A4 would have been weakening a check and calling
         * it a decision.
         */
        value: m => (m.band.present ? -1 : m.aboveFold),
        pass: v => v === -1 || v >= 6,
        say: (v, m) => (v === -1
            ? `NOT MEASURED — ${m.band.rows} tool call(s) are held above the queue, which is the one thing `
              + 'allowed to push it down. A4 measures this state.'
            : `${v} of ${m.tasks} tasks start within the first screen`),
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: 'h2 { margin-top: 700px !important; }' }))`,
    },
    {
        /*
         * A4 — THE HELD STATE'S OWN PROPERTIES. Written because L3 stands down here, so without it the most
         * intrusive thing this brief adds to the queue page would be measured by nothing at all.
         *
         * `needsBand` rather than `needsQueue`: it reports NOT MEASURED when nothing is held, because a check
         * whose subject is absent must never report success. `tests/use-it.mjs` (check S4) is what plants a
         * held call and drives this end to end; this one measures whatever is on screen.
         *
         * THE HEIGHT BUDGET IS 25% OF THE VIEWPORT, and the number is not arbitrary. At 1280x900 that is 225px,
         * which is a little over the 180px two rows plus the more-line actually occupy — so it has room for a
         * long preview wrapping onto a second line and no room for a third row. That is exactly the guarantee
         * worth having: however many calls are held, the band cannot grow without a ceiling, because the card
         * cap holds it at two.
         */
        id: 'A4', needsBand: true, widths: DESKTOP,
        what: 'a held tool call sits above the queue, is bounded, and does not bury it',
        value: (m) => {
            if (!m.band.present) return -1;
            if (m.band.aboveQueue !== true) return 1;              // not above the queue
            if (m.band.height > m.viewportH * 0.25) return 2;      // over its height budget
            if (m.queueTop == null || m.queueTop >= m.viewportH) return 3;  // queue pushed off screen
            if (m.band.rows > 2) return 4;                         // the card cap is not holding
            return 0;
        },
        pass: v => v === 0,
        say: (v, m) => {
            if (v === -1) return 'NOT MEASURED — nothing is held, so there is no band to measure';
            const budget = Math.round(m.viewportH * 0.25);
            if (v === 1) return `the band is NOT above the queue, which is its whole justification for being `
                + 'on this page rather than on /agents';
            if (v === 2) return `the band is ${m.band.height}px, over its ${budget}px budget`;
            if (v === 3) return `the queue starts at ${m.queueTop}px, off the first screen entirely`;
            if (v === 4) return `${m.band.rows} rows drew at once; the cap is two, so its height is unbounded`;
            return `${m.band.rows} row(s), ${m.band.height}px of a ${budget}px budget, above a queue that `
                + `starts at ${m.queueTop}px` + (m.band.capped ? ', with more held behind the count' : '');
        },
        /* The defect: the band unbounded, which is what removing the two-card cap would produce. Injected as a
         * height rather than by adding rows, because the check has to fail on the CONSEQUENCE — a band that
         * buries the queue — rather than on the mechanism that would cause it. */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '[data-measure="approval-band"] { min-height: 60vh !important; }' }))`,
    },
    {
        id: 'L4', needsQueue: true, widths: DESKTOP,
        what: 'the queue is not an endless scroll',
        value: m => m.scrollExtent,
        pass: v => v <= 3.0,
        say: v => `the longest scroller is ${v} screens tall`,
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '[data-measure="task"] { min-height: 320px !important; }' }))`,
    },
    /*
     * E1 and E2 — THE EARNED-EMPTY HUB, which was verified by eye only until now.
     *
     * His most likely daily end state and the entire reward moment of the design. See `CLEARED` above for why
     * these exist and why the queue checks stand down instead of failing here.
     */
    {
        id: 'U1', unstartedOnly: true, widths: ['monitor'],
        what: 'a hub that has never been connected says so, and offers the one thing to do',
        /*
         * THE CHECK THAT WOULD HAVE CAUGHT A PROMISE THE HUB COULD NOT KEEP.
         *
         * For six sessions the empty queue told everyone — including someone who had connected nothing —
         * *"You will get a Telegram message when that changes."* No message was coming: there was no agent to
         * send one. Nothing caught it because nothing had ever rendered this state, and the fixture could not
         * produce it (`--clear` leaves the agent rows, so it shows the "an agent has checked in" state instead).
         *
         * Three things, and the third is the one a screenshot caught by eye first: the primary action has to be
         * ON ITS OWN LINE. As an inline-block in a centred box it flowed with the paragraph and rendered tucked
         * into the end of a sentence — "…until a project is wired up. [Set up your first project →]" — which is
         * the first screen's only action, hidden in prose.
         */
        value: m => {
            if (!m.unstartedHub) return -1;
            const u = m.unstartedHub;
            if (u.promisesTelegram) return 0;
            if (u.ctaHref !== '/setup') return 0;
            if (u.ctaOnOwnLine === false) return 0;
            return 1;
        },
        pass: v => v === 1,
        say: (v, m) => v === -1
            ? 'NOT MEASURED — this hub is not in the unstarted state. Run `npm run fixture -- --unstarted`'
            : v === 1
                ? `no Telegram promise, and "${m.unstartedHub.ctaText}" leads to ${m.unstartedHub.ctaHref} `
                  + 'on its own line'
                : m.unstartedHub.promisesTelegram
                    ? 'it promises a Telegram message with no agent to send one: '
                      + `"${m.unstartedHub.text.slice(0, 130)}"`
                    : m.unstartedHub.ctaHref !== '/setup'
                        ? `the only route out goes to ${m.unstartedHub.ctaHref}, not to /setup`
                        : 'the primary action is not on its own line — it is tucked into the end of a sentence',
        /* Reintroduce the defect that shipped: the unconditional copy, promise and all. */
        break: `(() => { const e = document.querySelector('[data-empty="unstarted"]');
            if (e) e.textContent = 'Nothing needs you. No decisions blocked, no tasks waiting. ' +
                'You will get a Telegram message when that changes.'; })()`,
    },
    {
        id: 'E1', clearedOnly: true, widths: DESKTOP,
        what: 'an empty hub reads as success, with the record behind it',
        value: m => (m.emptyHub ? (m.emptyHub.statesRecord ? 1 : 0) : -1),
        pass: v => v === 1,
        say: (v, m) => v === -1
            ? 'NOT MEASURED — no cleared-hub panel on the page at all'
            : v === 1
                ? `"${m.emptyHub.text.slice(0, 110)}"`
                : 'the panel is there and states no figure, so it is a shrug rather than an answer: '
                  + `"${m.emptyHub.text.slice(0, 110)}"`,
        /* The regression that actually happened: the record sentence removed, leaving the pleasant line over
         * an absence. Injected by deleting the element that carries the figures. */
        break: `document.querySelectorAll('.emptyrecord').forEach(e => e.remove())`,
    },
    {
        /*
         * E2 IS NOT "FILLS ITS COLUMN", AND THE FIRST VERSION OF IT WAS.
         *
         * Copied from L1's reasoning, which is right about a task list and wrong here: the cleared layout caps
         * this panel at 760px and centres it ON PURPOSE, because a celebratory sentence wants a readable measure
         * rather than the full width of an ultrawide monitor. The check reported 67% at 1920 and called it a
         * failure — the suite complaining about a deliberate decision, which is the fastest way to teach someone
         * to stop reading it.
         *
         * What actually matters in this state, and what has actually gone wrong here before:
         *
         *   - it must not be DASHED. A dashed outline is the visual language of "something should be here", which
         *     is precisely the wrong thing to say about a hub that reached the state it exists to reach. It was
         *     dashed for one commit, over the words "Nothing to do".
         *   - it must be CENTRED in its column, so the 760px cap reads as a measure rather than as a panel that
         *     failed to grow.
         *   - it must be wide enough to be a panel and not a strip.
         */
        id: 'E2', clearedOnly: true, widths: DESKTOP,
        what: 'the cleared hub is drawn as an answer rather than as a gap',
        value: m => (m.emptyHub
            ? (m.emptyHub.dashed || !m.emptyHub.centred || m.emptyHub.width < 400 ? 0 : 1)
            : -1),
        pass: v => v === 1,
        say: (v, m) => !m.emptyHub ? 'NOT MEASURED — no cleared-hub panel on the page at all'
            : m.emptyHub.dashed
                ? 'drawn with a DASHED border, which is the visual language of "something should be here"'
                : !m.emptyHub.centred
                    ? `not centred in its column — ${m.emptyHub.gapLeft}px left, ${m.emptyHub.gapRight}px right, `
                      + 'so the width cap reads as a panel that failed to grow'
                    : m.emptyHub.width < 400
                        ? `only ${m.emptyHub.width}px wide, which is a strip rather than a panel`
                        : `solid, centred, ${m.emptyHub.width}px wide in its column`,
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.empty.done { border-style: dashed !important; }' }))`,
    },
    {
        id: 'L5', widths: 'all',
        what: 'nothing escapes the viewport sideways',
        value: m => (m.docScrollsSideways ? 1 : 0) + m.overflowing,
        pass: v => v === 0,
        say: (v, m) => v === 0 ? 'no sideways scroll, nothing past the edge'
            : `${m.overflowing} element(s) past the right edge${m.docScrollsSideways ? ', and the page scrolls sideways' : ''}`,
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '[data-measure="task"] { width: 3000px !important; }' }))`,
    },
    {
        /*
         * `needsQueue`, and finding that out is what running against the cleared hub is FOR.
         *
         * This counts how many task rows share a horizontal band. With no tasks, `rows.size` is 0, so the value
         * is 0 and the threshold — exactly 1 — rejects it as a FAILURE. That is a false failure of precisely the
         * kind this suite's own rules forbid: a check with no subject must stand down, never pass and never fail.
         * It reported "0 column(s)" on a hub whose only defect was that he had finished his work.
         */
        id: 'L6', needsQueue: true, widths: ['phone'],
        what: 'a phone gets exactly one column',
        value: m => m.columns,
        pass: v => v === 1,
        say: v => `${v} column(s)`,
        /*
         * Tile them two across, which is the defect: a phone showing half-width cards side by side.
         *
         * Two earlier attempts at this injection did not reproduce it and the check reported "caught"
         * nothing while claiming to. A float with a percentage width left the cards one per row. Setting a
         * grid on `parentElement` worked until the task list became a <ul><li>, at which point the parent
         * was the <li> and each card got its own two-track grid to sit alone in. So the breakage now walks
         * up to the nearest ancestor that actually CONTAINS more than one task, which is the only element
         * that could ever have laid them out side by side.
         *
         * The general lesson, and the reason this comment is long: a fault injection that does not
         * reproduce the fault is indistinguishable from a check that works, and it fails in the safe
         * direction only by luck.
         */
        break: `(() => {
            const tasks = [...document.querySelectorAll('[data-measure="task"]')];
            if (tasks.length < 2) return;
            let p = tasks[0].parentElement;
            while (p && p.querySelectorAll('[data-measure="task"]').length < 2) p = p.parentElement;
            if (!p) return;
            p.style.setProperty('display', 'grid', 'important');
            p.style.setProperty('grid-template-columns', '1fr 1fr', 'important');
            [...p.children].forEach(c => c.style.setProperty('display', 'block', 'important'));
        })()`,
    },
    {
        id: 'C1', widths: 'all',
        what: 'every rendered text colour meets WCAG 2.2 AA',
        value: m => m.contrastFailures.length + m.unmeasurable.length,
        pass: v => v === 0,
        say: (v, m) => v === 0 ? 'all text passes for its size and weight'
            : [
                /*
                 * Unmeasurable elements are listed FIRST and counted as failures.
                 *
                 * They were briefly counted but not printed, which produced "25 failing element(s)" followed
                 * by an empty list — a report that says something is wrong and refuses to say what. That is
                 * its own small version of the thing this suite exists to prevent.
                 */
                ...(m.unmeasurable?.length
                    ? [`${m.unmeasurable.length} element(s) UNMEASURABLE:`,
                       ...[...new Map(m.unmeasurable.map(u => [u.where, `  ${u.where}: ${u.why}`]))
                           .values()]]
                    : []),
                ...(m.contrastFailures.length
                    ? [`${m.contrastFailures.length} failing element(s); the distinct combinations are:`,
                       ...[...new Map(m.contrastFailures.map(f =>
                           [`${f.color}|${f.bg}|${f.size}|${f.weight}`,
                            `  ${f.got}:1 needs ${f.need} — ${f.tag}.${f.where} ` +
                            `${f.size}px/${f.weight} "${f.text}"`])).values()]]
                    : []),
            ].join('\n            '),
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.title, h1, h2 { color: #3a3f4b !important; }' }))`,
    },
    {
        id: 'K1', widths: ['monitor'],
        what: 'nothing pretends to be a button',
        value: m => m.fakeButtons.length,
        pass: v => v === 0,
        // A div with role="button" is a promise the browser does not keep: no focus, no Enter, no Space,
        // unless every one of those is hand-written. A real <button> is shorter and cannot be got wrong.
        say: (v, m) => v === 0 ? 'every control with a button role is a real <button>'
            : `${v} element(s) claim role="button" without being one` +
              ` (${m.fakeButtons.filter(f => !f.focusable).length} of them unfocusable)`,
        break: `(() => { const el = document.querySelector('[data-measure="task"] button');
            if (el) { const d = document.createElement('div'); d.setAttribute('role','button');
            d.textContent = el.textContent; el.replaceWith(d); } })()`,
    },
    {
        id: 'K2', widths: ['monitor'],
        what: 'keyboard focus is visible on the dark surface',
        value: null,   // measured separately, by pressing real keys
        // Walks the page from the top, so it must not have a task open — and it navigates itself.
        keyboard: true,
        pass: rings => rings.length > 0 && rings.every(r => r.thickness >= 2 && r.contrast >= 3),
        say: rings => rings.length === 0 ? 'nothing took focus'
            : rings.map(r => `${r.thickness}px @ ${r.contrast}:1 — ${r.what}`).join('\n            '),
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }' }))`,
    },
    {
        id: 'K3', needsQueue: true, widths: ['monitor'],
        what: 'a keyboard reaches the task list quickly',
        value: null,   // measured separately, by pressing real keys
        keyboard: true,
        pass: k => k.reached && k.keystrokes <= 3,
        say: k => k.reached ? `${k.keystrokes} keystroke(s) to focus a task`
            : `never reached a task in ${k.keystrokes} keystrokes`,
        break: `document.querySelectorAll('a[href^="#"]').forEach(a => a.remove())`,
    },
    {
        id: 'K4', needsQueue: true, widths: ['phone'],
        what: 'a covered queue cannot be tabbed into',
        /*
         * On a phone the reading pane covers the queue entirely. CSS can put something on top; only the
         * DOM can stop Tab walking underneath it, which is what `inert` on the queue is for. Without this
         * check the failure is invisible to anyone using a pointer — you would only find it by tabbing on
         * a phone, which nobody does, and then a screen reader user gets a list they cannot see.
         */
        /*
         * `?? -1` so a missing measurement fails LOUDLY rather than looking like a pass or a catch.
         *
         * The first version of this check read a field the page-side measurement never returned, so its
         * value was `undefined`. `undefined === 0` is false, so it failed the real run — and it also
         * "caught" its own injected defect, because undefined fails every threshold. A check that is
         * broken in that particular way reports itself as working perfectly.
         */
        value: m => (typeof m.reachableUnderPanel === 'number' ? m.reachableUnderPanel : -1),
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — the page did not report this'
            : !m.panelCovering ? 'no full-screen panel is up, so nothing to cover'
                : v === 0 ? 'nothing behind the panel is focusable'
                    : `${v} control(s) behind the full-screen panel are still in the tab order`,
        break: `document.querySelectorAll('[inert]').forEach(e => e.removeAttribute('inert'))`,
    },
    {
        id: 'K5', widths: ['laptop', 'monitor', 'ultrawide'],
        what: 'no focus ring is shaved off by a scrolling container',
        value: null,   // measured separately — see focusRoom, which reads the ring from a real Tab first
        room: true,
        /*
         * Found by probing rather than by reading the stylesheet, and it was the chips I had just built: the
         * project filter sits flush against the left edge of `.pane`, whose `overflow-y: auto` clipped 4px of
         * every one of their focus rings, along with the footer's link. The pane had `padding-right: 4px` and
         * nothing on the left, so the ring fitted on one side of the same element and not the other.
         *
         * Desktop widths only, and that is not laziness: `.pane` is only a scrolling container from the
         * desktop layer up. On a phone it is normal flow, so there is nothing to clip and the check would have
         * no subject — which this file's third trap says must not be allowed to look like a pass.
         */
        pass: v => v.need > 0 && v.cut.length === 0,
        say: v => v.need < 0 ? 'NOT MEASURED — no focus ring could be read from a real Tab'
            : v.cut.length === 0 ? `every ring has its ${v.need}px, including inside the pane`
                : `${v.cut.length} ring(s) clipped: ` + v.cut.slice(0, 4)
                    .map(c => `${c.cut}px off the ${c.side} of "${c.what}" by ${c.by}`).join('; '),
        // Take the room away, the way it was taken away before: a scroller with no padding for the ring.
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.pane { padding: 0 !important; margin: 0 !important; }' }))`,
    },
    /* ------------------------------------------------------------------ finished work: the record
     *
     * These five were written against the interface BEFORE any of it existed and watched failing; that red
     * run is tests/baseline/before-progress.txt, committed. The fault injections underneath are the second
     * line of defence, for when the markup moves and a selector stops matching.
     *
     * Every one of them fails LOUDLY on absence rather than passing vacuously, because four of the six
     * broken checks in the last iteration were broken in the direction that reports success.
     */
    {
        id: 'P1', widths: 'all',
        what: 'what you have finished is visible without scrolling',
        // The complaint this whole piece of work answers was "we don't even show the tasks that have been
        // marked as done". The count was in the footer, six screens down, as five titles joined by dots.
        value: m => (m.figures === 0 ? -1 : m.figuresAboveFold),
        pass: v => v >= 1,
        say: (v, m) => v === -1 ? 'NOT MEASURED — nothing on the page states any figure about finished work'
            : `${v} of ${m.figures} progress figure(s) start within the first screen`,
        /*
         * The defect that actually shipped: the figure exists, but it is at the bottom of a page that is
         * several screens tall. Reproduced by moving the figures to the end of the document rather than by
         * hiding them, because "present but unreachable without scrolling" is the real thing and "absent"
         * is a different, louder bug.
         */
        break: `(() => {
            const box = document.createElement('div');
            box.style.marginTop = '4000px';
            document.body.appendChild(box);
            document.querySelectorAll('[data-measure="progress-figure"]').forEach(el => box.appendChild(el));
        })()`,
    },
    {
        id: 'P2', needsRecord: true, widths: ['monitor'], progress: true,
        what: 'the figure on the page equals the count in the database',
        /*
         * WHAT THIS CHECK HAS BEEN, TWICE, AND WHY IT HAD TO CHANGE AGAIN.
         *
         * V1 asserted "at least nine finished items are listed" — nine being the fixture's volume. Against the
         * real hub, which held two completions, it reported a failure on a page that was entirely correct. Two
         * other checks did the same thing in the same run, and three false alarms on a healthy production hub is
         * how a suite trains you to stop reading it.
         *
         * V2 asserted that the LIST matched the FIGURE the page states, which was data-independent, correct on
         * an empty hub, and strictly stronger than counting to nine. It is also exactly the property a WINDOWED
         * list breaks, and windowing the list is what took a two-year payload from 2.4 MB to a fifth of that.
         * `docs/BRIEF-VISUAL.md` §6 predicted this precisely — *"P2's invariant becomes 'the figure equals the
         * SQL count'"* — and told whoever did it to read this comment first, which is why it is this long.
         *
         * V3 is that the figure equals `count(*)`. That is a stronger reading of the same intent than V2 was,
         * not a weaker one: V2 compared the page against itself — the figure is folded out of the rows the page
         * was given, so a store-side `limit 5` that shipped five rows would have made a figure of five agree
         * with a list of five. It only caught the original defect because the figure came from a DIFFERENT
         * array than the list. This compares the page against the database, which cannot agree with a mistake.
         *
         * The list being a window is checked separately, by P10, which is about the page SAYING so.
         */
        value: m => {
            if (m.statedDone === null) return -1;
            if (!VOLUMES) return -2;
            return m.statedDone === Number(VOLUMES.done_tasks) ? 0 : 1;
        },
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — the page states no completion figure to check against SQL'
            : v === -2 ? 'NOT MEASURED — the database was not readable, so there is nothing to compare against'
                : v === 0 ? `the page says ${m.statedDone} finished and so does count(*)`
                    : `the page claims ${m.statedDone} finished and the database holds ` +
                      `${VOLUMES.done_tasks}`,
        /*
         * THE INJECTION HAD TO CHANGE WITH THE CHECK, and this is why the old one is recorded rather than
         * replaced silently. V2's injection removed rows from the list — which now says nothing about the
         * figure, so against V3 it would have reported "DID NOT CATCH its own defect" on a working check. This
         * rewrites the FIGURE instead, which is the defect V3 is about: a number on the page that the database
         * does not support.
         */
        break: `(() => {
            const el = document.querySelector('[data-figure="tasks-done"]');
            if (el) el.textContent = String(9999);
        })()`,
    },
    {
        id: 'P11', needsRecord: true, widths: ['monitor'], progress: true,
        what: 'the record is in the order it claims — newest first, one list',
        /*
         * THE SENTENCE ABOVE THE LIST SAYS "newest first". This is whether that is true.
         *
         * It was not, for the whole life of the surface, because the rows were bucketed by project: four
         * descending lists side by side, each internally correct, the page as a whole in no order. Nothing
         * caught it because every check about the record counted rows or read the caveat, and the ORDER is the
         * one property a reader takes on trust.
         *
         * Fails on the value being anything other than zero pairs out of order, and stands down when there are
         * fewer than two rows to compare, which is the only honest verdict on a one-row record.
         *
         * AND WHAT THIS CHECK CANNOT DO, stated because a check whose limits are not written down gets trusted
         * for more than it proves: **the fixture is the one dataset where the old grouping looked fine.** Its
         * nine completions are one per project except for harbour-lights' six consecutive ones, so bucketing
         * them by project happens to leave them in descending order. Restoring the grouped version and running
         * this check passed. That is exactly why nobody noticed for the life of the surface — the state the suite
         * loads is the state the defect hides in. The assertion that fires against the real grouping is in S1 in
         * tests/use-it.mjs, over a record 93 completions deep across five projects. This one holds the invariant
         * on every layout run; that one is the one that would have caught it.
         */
        value: m => m.doneOutOfOrder,
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — fewer than two completions are listed'
            : v === 0 ? `all ${m.doneRows} listed completions descend by date, as the line above them says`
                : `${v} of ${m.doneRows - 1} adjacent pairs are OLDER-then-NEWER, so "newest first" is untrue`,
        /* The defect: the same rows, in the wrong order. Reversing them is the smallest thing that makes the
         * claim false without changing anything else about the page. */
        break: `(() => {
            const list = document.querySelector('.donelist');
            if (!list) return;
            [...list.children].reverse().forEach(li => list.appendChild(li));
        })()`,
    },
    {
        /*
         * No `needs*`, because this is about the CHROME: it has to hold in every DATA STATE, which is exactly
         * what the bug did not do — it appeared only when the queue was empty.
         *
         * DESKTOP widths, not all of them, and that is a correction rather than a convenience. Written as
         * `widths: 'all'` it failed on the phone at 390px, where the bar is 3 rows and is SUPPOSED to be: 152px
         * of wordmark plus 323px of destinations plus a 154px control does not fit in 390 and no arrangement
         * makes it. A check that fails on correct behaviour is worse than no check, because the next person
         * silences it. The claim is about the layout where one line is the design.
         */
        id: 'L9', widths: DESKTOP,
        what: 'the navigation bar holds one line, in every data state',
        value: m => m.navRows,
        pass: v => v === 1,
        say: v => v === -1 ? 'NOT MEASURED — the bar has fewer than two parts to compare'
            : v === 1 ? 'the wordmark, the destinations and the Find control share one row'
                : `the bar wraps onto ${v} rows, so a destination or the Find control has dropped below it`,
        /* The defect: the narrowed shell that caused it. 640px is under the 681px the bar needs at 1280 and
         * over the phone widths, where a wrapped bar is legitimate — so this injection has to be measured
         * against the desktop layout, which is where the check's failure mode lives. */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.shell, .wrap { max-width: 640px !important; }' }))`,
    },
    {
        /*
         * THE RHYTHM, AS AN ASSERTION. See the census beside SPACE_SCALE in MEASURE for why this exists.
         *
         * No `needs*` and no `fixtureOnly`: a scale that only holds when there is work in the queue is not a
         * scale. This runs in every data state the suite loads, which is where the last four off-scale values
         * were found — they were inline styles on the SIGNED-OUT and error screens, surfaces no fixture
         * renders and no stylesheet check could see.
         *
         * It reports the offenders rather than a count, because "3 off-scale values" is a number nobody can
         * act on and "13px on p.recordsince marginTop" is a fix.
         */
        id: 'L10', widths: DESKTOP,
        what: 'every space the page paints is on the one spacing scale',
        value: m => m.spacingOffScale.length,
        pass: v => v === 0,
        say: (v, m) => v === 0
            ? 'every padding, margin and gap on the page is 1, 2, 4, 8, 12, 16, 24, 32 or 48px'
            : `${v} value(s) off the scale: ` +
              m.spacingOffScale.slice(0, 5).map(r => `${r.px}px x${r.n} (${r.where})`).join(', ') +
              (m.spacingOffScale.length > 5 ? ` and ${m.spacingOffScale.length - 5} more` : ''),
        /*
         * The defect: ONE off-scale value, on one element, which is the smallest thing that breaks a rhythm
         * and the hardest thing to see. 7px because that was the single most common off-scale value in the
         * census that prompted this check — 117 elements carried it and four visual passes read the page
         * without noticing.
         */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.shell .chip { padding-left: 7px !important; }' }))`,
    },
    {
        /*
         * See the TRACK_EM census in MEASURE. Same argument as L10, one dimension over: the value looks
         * right in a diff and is only wrong in relation to something else on the page.
         */
        id: 'L11', widths: DESKTOP,
        what: 'tracking and weight are functions of type size, not of component',
        value: m => m.typeOffRamp.length,
        pass: v => v === 0,
        say: (v, m) => v === 0
            ? 'every size carries its own tracking, uppercase carries one value, and nothing small is bolder than something large'
            : `${v}: ` + m.typeOffRamp.slice(0, 4).map(r => `${r.where} (${r.why})`).join('; ') +
              (m.typeOffRamp.length > 4 ? ` and ${m.typeOffRamp.length - 4} more` : ''),
        /*
         * The defect the census actually found, reproduced exactly: a rule that changes the size of an
         * existing class and inherits the tracking that belonged to the old size. That is a two-word
         * declaration which reads as completely correct.
         */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.shell h2 { letter-spacing: -0.01em !important; }' }))`,
    },
    {
        id: 'P10', needsRecord: true, widths: ['monitor'], progress: true,
        what: 'the record says how much of itself it is showing, and only when that is not all of it',
        /*
         * THE OTHER HALF OF P2, AND THE ONE THAT KEEPS THE WINDOW HONEST.
         *
         * lib/store.ts has said the rule since `notes` was capped at twenty: *"a window is honest as long as
         * the interface does not claim it is everything."* The record's heading used to read "Everything since
         * 30 July", which was true while the page shipped every row and became a lie the moment it shipped
         * sixty of them — on the one surface whose entire job is to be believable.
         *
         * TWO BRANCHES, AND BOTH ARE ASSERTED SOMEWHERE WITH SOMETHING TO MEASURE:
         *
         *   the record FITS       every row is listed, and NO window caveat is shown. That is this check, and
         *                         it is what the fixture (nine completions) and his real hub (fourteen) are.
         *   the record OVERFLOWS  exactly `RECORD_WINDOW` rows are listed and the caveat states both numbers.
         *                         Measured by S1 in tests/use-it.mjs, which plants a record deeper than the
         *                         window because no fixture state reaches it.
         *
         * Splitting it that way rather than reporting NOT MEASURED on the fixture: a check whose subject is
         * absent must never pass, and "no caveat because nothing is hidden" is a real subject with a real
         * failure mode — a permanent caveat on a hub where nothing is hidden is its own small untruth.
         */
        value: m => {
            if (m.statedDone === null) return -1;
            if (m.statedDone > RECORD_WINDOW) return -3;   // the overflow branch; S1 owns it
            const allListed = m.doneRows === m.statedDone;
            const quiet = m.recordWindowNote === null || !/most recent/i.test(m.recordWindowNote);
            return allListed && quiet ? 0 : 1;
        },
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — the page states no completion figure'
            : v === -3 ? 'NOT MEASURED HERE — the record is deeper than the window, which S1 in prove:use owns'
                : v === 0
                    ? `all ${m.statedDone} fit, all ${m.doneRows} are listed, and nothing claims a window`
                    : `${m.doneRows} of ${m.statedDone} listed` +
                      (m.recordWindowNote ? `, and it claims: "${m.recordWindowNote.slice(0, 80)}"` : ''),
        /* The defect: a caveat on a record that is showing all of itself. Nothing is hidden and the page says
         * something is, which is the same class of untruth in the opposite direction. */
        break: `(() => {
            const host = document.querySelector('[data-measure="done-list"]') || document.body;
            const p = document.createElement('p');
            p.setAttribute('data-measure', 'record-window');
            p.textContent = 'The most recent 3 of 9, newest first.';
            host.prepend(p);
        })()`,
    },
    {
        id: 'P3', widths: ['monitor'], progress: true, fixtureOnly: true,
        what: 'a completion says what became true, not just its title',
        /*
         * docs/RESEARCH.md §20. Grant (2008): ten minutes of contact with one person who had benefited
         * from the work produced +142% persistence and +171% output a month later. The hub already holds
         * that sentence — the asking agent's `why` — and threw it away at the moment it came true.
         *
         * Seven of the fixture's nine finished tasks have a `why`; two deliberately do not, because an
         * agent is not required to write one and the surface must not invent one.
         */
        value: m => (m.doneRows === 0 ? -1 : m.doneRowsStating),
        pass: v => v >= 7,
        say: (v, m) => v === -1 ? 'NOT MEASURED — no finished item is listed, so none can state anything'
            : `${v} of ${m.doneRows} listed completions quote what they achieved`,
        break: `document.querySelectorAll('[data-measure="became-true"]').forEach(el => el.remove())`,
    },
    {
        id: 'P4', needsRecord: true, widths: ['monitor'], progress: true,
        what: 'every progress figure is a control, and finished work can be undone',
        /*
         * §14's rule, applied to its hardest case: completed work is not actionable, so a page of it looks
         * like a readout. It is not, for one specific reason — a completion is UNDOABLE, and undoing it is
         * also the mechanism that keeps the count honest. So the list has to be a list of controls, and
         * the figures have to be pressable, or this is decoration.
         */
        value: m => {
            if (m.figures === 0) return -1;
            const figuresOk = m.figuresAsControls === m.figures;
            const rowsOk = m.doneRows > 0 && m.doneRowsWithControl === m.doneRows;
            return figuresOk && rowsOk ? 1 : 0;
        },
        pass: v => v === 1,
        say: (v, m) => v === -1 ? 'NOT MEASURED — there are no progress figures'
            : v === 1 ? `all ${m.figures} figures are controls, and all ${m.doneRows} finished rows can be re-opened`
                : `${m.figuresAsControls}/${m.figures} figures are controls; ` +
                  `${m.doneRowsWithControl}/${m.doneRows} finished rows carry a control`,
        // K1's injection, aimed here: turn the control into something that only looks like one.
        break: `document.querySelectorAll('[data-measure="progress-figure"]').forEach(el => {
            const s = document.createElement('span');
            s.setAttribute('data-measure', 'progress-figure');
            s.textContent = el.textContent;
            el.replaceWith(s);
        })`,
    },
    {
        id: 'P5', widths: ['monitor'], progress: true,
        what: 'every stated target is arithmetically true, and nothing names a streak',
        /*
         * WHAT THIS CHECK USED TO BE, because the change is the interesting part.
         *
         * It used to assert that no target appeared at all — no countdown, no level, nothing forward-looking —
         * on the strength of docs/RESEARCH.md §19. The owner asked twice for levels and a sense of progression,
         * so the absolute rule is gone and this verifies the two things that survive it: the arithmetic of
         * every target he is shown, and the absence of streak and loss framing.
         *
         * It fails LOUDLY when there is nothing to check. A page with no targets on it would satisfy "all
         * targets are correct" vacuously, which is the K4 failure — a check that reports success because its
         * selector matched nothing. Now that targets are expected, their absence is itself a finding.
         */
        value: m => {
            if (m.progressScope === 0) return -1;
            if (m.targets.length === 0) return -2;
            return m.banned.length + m.wrongTargets.length;
        },
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — there is no progress surface to inspect'
            : v === -2 ? 'NOT MEASURED — no stated target was found, so the arithmetic could not be checked'
                : v === 0
                    ? `${m.targets.length} stated target(s), every one exactly its own arithmetic; ` +
                      'no streak, no loss framing'
                    : [
                        ...m.wrongTargets.map(t =>
                            `the ${t.what} target shows ${t.shown} but its operands give ${t.expected}`),
                        ...m.banned.map(t => `streak or loss framing: "${t}"`),
                    ].join('\n            '),
        /*
         * Two defects in one injection, because the check now guards two things: a target that lies about its
         * own arithmetic, and streak language. Breaking only one would leave the other half unproven.
         */
        break: `(() => {
            document.querySelectorAll('[data-have][data-need]').forEach(el => {
                el.textContent = String(+el.getAttribute('data-need') + 99);
            });
            const root = document.querySelector('[data-measure="progress"]')
                || document.querySelector('[data-measure="summary"]');
            if (root) {
                const p = document.createElement('p');
                p.textContent = 'Keep it up — do not break your streak';
                root.appendChild(p);
            }
        })()`,
    },
    {
        id: 'P9', widths: ['monitor'], fixtureOnly: true,
        what: 'a task waiting on someone else for days can be chased',
        /*
         * The fixture's blocked task — "Count the stock in the back room" — is filed ~70 hours back, so this is
         * deterministic rather than dependent on when the suite happens to run.
         *
         * -1 when nothing is old enough, because a threshold check that reports 0-of-0 as success is the
         * matched-nothing failure this file keeps relearning. On a hub with no stale blocked work there is
         * genuinely nothing to measure, and saying so is different from passing.
         */
        value: m => (m.stale === 0 ? -1 : (m.stale === m.staleWithControl ? 0 : m.stale - m.staleWithControl)),
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — nothing has been waiting long enough to chase'
            : v === 0 ? `all ${m.stale} long-waiting task(s) offer a way to chase the agent`
                : `${v} of ${m.stale} long-waiting task(s) have no way to chase them`,
        break: `document.querySelectorAll('[data-measure="stale-blocked"] button').forEach(b => b.remove())`,
    },
    {
        id: 'P8', needsQueue: true, widths: ['monitor'], time: true,
        what: 'the queue can be narrowed to what fits a short gap, truthfully',
        /*
         * Three assertions in one, because they are the same claim:
         *
         *   1. pressing the tightest filter actually REDUCES the queue — a filter that changes nothing is a
         *      control that lies about being one
         *   2. every task still visible genuinely fits, checked against data-minutes rather than the rendered
         *      "25m" string, which would be a second implementation of the formatter
         *   3. if anything was hidden for having no estimate, the page SAYS SO. This is the one that matters:
         *      silently dropping work from a list is how a hub starts hiding things, and an unestimated task is
         *      not a short task, it is an unknown one.
         */
        value: m => {
            if (!m.timeChips.length) return -1;
            const pressed = m.timeChips.find(c => c.pressed);
            if (!pressed) return -2;
            const overLimit = m.visibleTaskMinutes.filter(v => v === null || v > pressed.max).length;
            return overLimit;
        },
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — the queue offers no time filter'
            : v === -2 ? 'NOT MEASURED — no time filter is engaged, so nothing was narrowed'
                : v === 0
                    ? `filtered to ${m.visibleTaskMinutes.length} task(s), every one within ` +
                      `${m.timeChips.find(c => c.pressed)?.max}m` +
                      (m.unestimatedNote ? '; tasks without an estimate are declared, not dropped' : '')
                    : `${v} visible task(s) do not fit the engaged filter`,
        /*
         * Break it the way it would really break: let a task through that does not fit. That is the failure
         * that matters — a filter you cannot trust is worse than no filter, because you act on it.
         */
        break: `(() => {
            const row = document.querySelector('[data-measure="task"]');
            if (row) row.setAttribute('data-minutes', '999');
        })()`,
    },
    {
        id: 'P7', widths: ['monitor'], progress: true,
        what: 'nothing drawn inside a graphic escapes it',
        /*
         * The emblem's progress arc printed itself across the rank text beside it, because an SVG transform
         * attribute and a CSS rotate property were composing about different origins. Found by looking at a
         * screenshot; invisible to every other check here, because they all measure whether content FILLS a
         * container and none asked whether anything had LEFT one.
         *
         * `progress: true` is load-bearing and was missing at first. The emblem lives in the reading pane's
         * IDLE state, and the default page state for these checks opens a task — which replaces the pane with
         * the task detail, so there was no emblem in the document at all. The check reported "ok" while
         * measuring nothing, and only the fault injection failing revealed it. That is the third time in this
         * file's history that a query matching nothing has passed, which is why the value below returns -1
         * rather than 0 when there is nothing to look at.
         */
        value: m => (m.graphics === 0 ? -1 : m.escapees.length),
        pass: v => v === 0,
        say: (v, m) => v === -1 ? 'NOT MEASURED — no graphic is rendered in this state'
            : v === 0 ? `all ${m.graphics} graphic(s) keep their contents inside`
                : m.escapees.map(e => `${e.what} extends ${e.by}px outside it`).join('\n            '),
        /*
         * Reintroduce the defect: a rotation about an origin that is not the graphic's centre.
         *
         * The first attempt at this injection set `transform-box: border-box` and a rotation, and the check
         * reported "did not catch its own defect" — correctly. A circle is rotationally symmetric, so spinning
         * one about its OWN centre moves nothing at all; only the dash pattern travels, and a dash is not
         * geometry. That is precisely the "a fault injection that does not reproduce the fault is
         * indistinguishable from a working check" trap this file has been caught by before, so: rotate about a
         * corner, which is what a mismatched origin actually does.
         *
         * IT TARGETS `.crest-charge` NOW, AND THAT IS NOT A LOOSENING. The element it used to name,
         * `.emblem-arc`, no longer exists — the crest's progress arc was removed because the standing panel
         * already draws `fraction` as the bar beneath it (see the header of app/components/Crest.tsx). An
         * injection naming a selector that matches nothing is the exact failure mode this file keeps catching
         * itself in: it would have reported "did not catch its own defect" on a check that was working. So it
         * names the group that now occupies that role — the charge, which is the largest transformable thing
         * inside the graphic and therefore reproduces the fault more violently than the arc ever did.
         */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.crest-charge { transform-box: view-box !important; transform-origin: 0 0 !important; rotate: 45deg !important; }' }))`,
    },
    {
        id: 'P6', widths: DESKTOP,
        what: 'no scrollbar is a fat default grey bar',
        /*
         * The check that exists because of the sentence "what is this ugly scrollbar".
         *
         * Chrome on Windows paints 15px of light grey by default, and this interface can have THREE scrolling
         * regions on one screen — the page, the reading pane, and the capped decisions list. Three of those
         * stripes is the loudest thing on a careful dark layout, and it was invisible to this suite for as long
         * as the suite existed.
         *
         * 12 is the threshold rather than 10 so the check is about "is it styled at all" rather than about one
         * platform's idea of thin. A styled thin bar measures 10 here; an unstyled one measures 15.
         */
        value: m => (m.scrollbars.length === 0 ? 0 : Math.max(...m.scrollbars.map(s => s.gutter))),
        pass: v => v <= 12,
        say: (v, m) => m.scrollbars.length === 0
            ? 'nothing overflows at this width, so there is no scrollbar to measure'
            : `${m.scrollbars.length} scrolling region(s): ` +
              m.scrollbars.map(s => `${s.what} at ${s.gutter}px`).join(', '),
        // Ask for the platform default back, which is the state that shipped.
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '* { scrollbar-width: auto !important; }' }))`,
    },
    {
        id: 'L7', widths: ['monitor', 'ultrawide'], idle: true,
        what: 'the IDLE reading pane fits on a monitor, so nothing in it is out of reach',
        /*
         * THE INHERITED ITEM NOBODY HAD PUT A NUMBER ON.
         *
         * docs/PROGRESS-REPORT.md §17.1 records the pane overflowing by "217px at 1920×1080, 397px at
         * 1280×900" and says a thin dark bar was chosen over deleting content, with "revisit if you
         * disagree". It has been carried as prose across two iterations, which means it could not regress and
         * could not improve — nothing measured it.
         *
         * Measured properly here, and what is CUT is the part that matters: at 1920 it is the footer, which
         * holds the staleness line — the only warning that no agent has synced and the list may therefore be
         * lying. At 1280 it is the whole Projects list (a set of filter controls) as well. So this is not an
         * aesthetic complaint about a scrollbar; it is content being unreachable, and one piece of it is the
         * anti-rot signal from docs/RESEARCH.md §7 cause 5.
         *
         * WHY THE RULE STOPS AT 1920 AND DOES NOT COVER THE LAPTOP
         *
         * 1920 is the width he actually uses — every production screenshot is 1920 — and it is the width at
         * which fitting is achievable without deleting anything. At 1280×900 the pane is 860px tall and the
         * content does not fit without removing something he asked for, and he already chose the scrollbar over
         * that. A check with a threshold nobody can meet gets suppressed rather than fixed, so the honest rule
         * is the one that is both meetable and worth meeting. The 1280 overflow stays a stated trade rather
         * than a silent one.
         */
        /*
         * -1, not 0, when there is no idle pane to measure. A pane that is absent because a task is open — or
         * because this ran at a phone width where there is no pane at all — is a check with no subject, and
         * this file's third trap is that such a check must report NOT MEASURED rather than pass. Several have
         * passed while measuring nothing.
         */
        value: m => {
            if (!m.paneIdle) return -1;
            const pane = m.scrollbars.find(s => /pane/.test(s.what));
            return pane ? pane.over : 0;
        },
        pass: v => v === 0,
        say: (v, m) => {
            if (v === -1) return 'NOT MEASURED — the pane is not in its idle state, so there is nothing to size';
            if (v === 0) return 'the idle pane holds all of its content without scrolling';
            const pane = m.scrollbars.find(s => /pane/.test(s.what));
            return `the idle reading pane is ${v}px taller than the space it has, so ${v}px of it — ` +
                   `ending with the footer and its "no agent has synced" warning — cannot be seen ` +
                   `without scrolling the pane itself (gutter ${pane.gutter}px)`;
        },
        /*
         * Put the height back. A percentage rather than the literal `1257px` the content happened to measure,
         * for the reason L1 and L2 record: an injection pinned to a number from the old layout stops
         * reproducing the defect the first time the layout changes, and does it silently.
         */
        break: `document.head.appendChild(Object.assign(document.createElement('style'),
            { textContent: '.pane .idle > * { margin-block-end: 60px !important; }' }))`,
    },
    {
        id: 'A1', widths: ['monitor'],
        what: 'the save-state message is announced',
        value: m => m.saveStates ? m.announced / m.saveStates : 1,
        pass: v => v === 1,
        say: (v, m) => `${m.announced} of ${m.saveStates} save-state elements are in a live region`,
        break: `document.querySelectorAll('[role="status"],[aria-live]').forEach(e => {
            e.removeAttribute('role'); e.removeAttribute('aria-live'); })`,
    },
    {
        id: 'A2', widths: ['monitor'],
        what: 'every field has a real label',
        value: m => m.unlabelledFields,
        pass: v => v === 0,
        say: (v, m) => v === 0 ? `all ${m.totalFields} fields labelled`
            : `${v} of ${m.totalFields} fields have only a placeholder`,
        break: `document.querySelectorAll('textarea,select,input').forEach(f => {
            f.removeAttribute('aria-label'); f.removeAttribute('aria-labelledby');
            f.labels?.forEach(l => l.removeAttribute('for')); })`,
    },
];

/* ============================================================================================== run */

console.log(`\nMeasuring the rendered interface of ${BASE}\n`);

let failures = 0;
/** Checks whose subject was absent. Reported, and never counted as a pass — see where it is set. */
let notMeasured = 0;
const results = [];          // { id, width, value, pass, line }

async function loadAndOpen(v) {
    await b.setViewport(v.w, v.h, v.mobile);
    await b.goto('/');
    const opened = await b.evaluate(OPEN_LONGEST_TASK);
    if (!opened?.ok) {
        console.log(`     note: could not open a task (${opened?.why || 'hydration'}) — L2 cannot be measured`);
    } else if (opened.openCards !== 1) {
        console.log(`     note: ${opened.openCards} tasks open, expected 1`);
    }
    await new Promise(r => setTimeout(r, 200));
}

/**
 * Load the page and press through to the full record, for the checks that measure it.
 *
 * A separate state rather than folding it into `loadAndOpen`, because the two are mutually exclusive views of
 * the same column: with the record showing there is no task queue to measure, so L1–L4 would read the wrong
 * page. Same pattern as K2/K3, which navigate themselves for the same kind of reason.
 */
/**
 * Load the page and press the tightest time filter, for the check that measures it.
 *
 * A third page state alongside "a task open" and "the record showing", and it needs its own because the three
 * are mutually exclusive views of the same column — measuring one while another is up would describe the wrong
 * page, which is the mistake P7 made by not declaring a state at all.
 */
/**
 * Load and open NOTHING, so the reading pane is in its idle state.
 *
 * Needed because the base measurement every other check shares has a task OPEN — L2 measures how well an
 * opened item fills its container, so it has to. That made the first version of L7 measure the pane while it
 * held a nineteen-step TaskDetail, reported 656px of overflow, and blamed it on the footer. A document that
 * scrolls is correct; the idle pane failing to fit is the defect. Two different subjects that happen to share a
 * selector, which is the proxy-measurement mistake this file keeps relearning.
 */
async function loadIdle(v) {
    await b.setViewport(v.w, v.h, v.mobile);
    await b.goto('/');
}

async function loadAndFilterTime(v) {
    await b.setViewport(v.w, v.h, v.mobile);
    await b.goto('/');
    const pressed = await b.evaluate(PRESS_TIGHTEST_TIME);
    if (!pressed?.ok) console.log(`     note: could not filter by time (${pressed?.why || 'hydration'})`);
    await new Promise(r => setTimeout(r, 200));
    return pressed;
}

async function loadAndShowFinished(v) {
    await b.setViewport(v.w, v.h, v.mobile);
    await b.goto('/');
    const shown = await b.evaluate(SHOW_FINISHED);
    if (!shown?.ok) {
        console.log(`     note: could not reach the record (${shown?.why || 'hydration'})`);
    }
    await new Promise(r => setTimeout(r, 200));
    return shown;
}

for (const v of WIDTHS) {
    await loadAndOpen(v);
    const m = await b.evaluate(MEASURE);

    console.log(`  ${v.name.padEnd(8)} ${v.w}x${v.h}`);
    console.log(`     ${m.tasks} tasks in ${m.columns} column(s) · page ${m.pageHeight}px ` +
                `(${m.screens} screens) · ${m.focusables} tab stops · ${m.primaryButtons} primary buttons`);

    /*
     * ==================================================================================================
     * A PAGE THAT DID NOT RENDER IS NOT A PAGE THAT FAILED — ABORT RATHER THAN REPORT.
     * ==================================================================================================
     *
     * This is the fifth time this project has read a false failure off a server that was not ready, and the
     * first four are all on the record: §XXVIII.5 (L8 at 2,656ms against a 1,200ms budget, 800ms over curl,
     * cause was a `next dev` that had been recompiling for hours) and three earlier ones it references. This
     * session produced the worst instance yet — **36 problems across 24 checks**, including C2 failing in all
     * ten surface-and-theme combinations, from a run started seconds after `next dev` came up. Every single one
     * was noise. One real defect was in there and it was nearly lost among them.
     *
     * The tell was in the output all along and nothing looked at it: *"no tasks rendered"* on a page the
     * database says has 22 open tasks. The suite reads its volumes from Postgres already, so it can compare —
     * and a page that rendered none of the work the database holds has not been measured, it has been missed.
     *
     * AN ABORT RATHER THAN A SKIP, deliberately. A skip would let the run continue and report a partial green,
     * which is the inflated coverage this file argues against everywhere else. This exits non-zero with the one
     * instruction that actually helps.
     */
    /*
     * PROVING THE GUARD CAN FIRE, because a guard that cannot is exactly what it exists to prevent.
     *
     * It cannot be demonstrated the way every other check here is. The page is `force-dynamic`, so answering a
     * decision in the database and reloading makes BOTH sides agree — the disagreement only arises from a
     * cached render, which is not something a test can conjure on demand. And the guard exits the process, so
     * it cannot be wrapped in the negative pass either.
     *
     *   node tests/measure-layout.mjs --prove-stale-guard
     *
     * corrupts the rendered figure by one and nothing else. The guard must abort with exit 1. Watched doing
     * exactly that; without this the abort path would be code nobody had ever seen run.
     */
    if (process.argv.includes('--prove-stale-guard') && m.shownDecisions != null) {
        console.log(`\n  --prove-stale-guard: the page said ${m.shownDecisions}; pretending it said `
            + `${m.shownDecisions + 1}. The guard below must abort.\n`);
        m.shownDecisions += 1;
    }

    const stale = VOLUMES && (
        (Number(VOLUMES.open_tasks) > 0 && m.tasks === 0
            ? `the page rendered 0 tasks and the database holds ${VOLUMES.open_tasks}`
            : null)
        /*
         * THE SUBTLER HALF, AND THE TASK COUNT COULD NOT CATCH IT.
         *
         * A run reported **14 problems across 12 checks** — C2 failing at 1.46:1 in every surface-and-theme
         * combination, plus three keyboard checks — off a page whose decisions chip read **3** while the
         * database held **4**, and which measured 116 elements where a fresh render measures 126. Next had
         * served a cached RSC payload from before the fixture reload. Every figure in that report was fiction,
         * and a fresh server produced numbers byte-identical to the previous clean run.
         *
         * The task count is blind to it: 21 rendered either way. The DECISION count is not, because the fixture
         * reload rewrites the questions — so comparing the figure the page CLAIMS against the figure the
         * database HOLDS catches a stale render in one line. Sixth instance of this family; the first five are
         * in §XXVIII.5 and §XXX.
         */
        || (VOLUMES.open_questions != null && m.shownDecisions != null
            && Number(VOLUMES.open_questions) !== m.shownDecisions
            ? `the page says ${m.shownDecisions} open decision(s) and the database holds `
              + `${VOLUMES.open_questions}`
            : null)
    );

    if (stale) {
        console.error(
            `\n  ABORTING. ${stale}.\n\n`
            + '  Nothing below this point would mean anything: a page that is not the page the database\n'
            + '  describes fails checks about things that are not wrong, and this suite has been fooled that\n'
            + '  way five times before (§XXVIII.5, §XXX). The cause is essentially always one of these:\n\n'
            + '    - `next dev` is still compiling. Load the hub in a browser once, then re-run.\n'
            + '    - `next dev` has been recompiling for hours and is exhausted. Restart it.\n'
            + '    - the fixture was reloaded under a running server and a cached render survived it.\n'
            + '      Stop the server, `rm -rf .next/cache`, start it, load the hub once, re-run.\n\n'
            + '  Nothing was measured and nothing is being reported.\n',
        );
        b.cleanup();
        process.exit(1);
    }

    for (const c of CHECKS) {
        if (ONLY && c.id !== ONLY) continue;
        if (c.widths !== 'all' && !c.widths.includes(v.name)) continue;

        /*
         * Some checks genuinely need KNOWN data and cannot be made data-independent.
         *
         * P3 asserts that seven of the fixture's nine completions quote what they achieved — seven being the
         * number the fixture deliberately gives a `why` to. There is no way to know from the DOM alone which
         * rows SHOULD have one, so against the real hub it can only guess, and it guessed wrong: it reported a
         * failure on a page where two of two completions stated their achievement perfectly.
         *
         * The honest move is to stand down and say so. A skip is information; a false failure is noise, and
         * noise is how a suite stops being read. Counted as neither a pass nor a failure.
         */
        /*
         * A check that needs open work, on a hub that has none. Stood down with the reason, not failed.
         *
         * "6 tasks above the fold" is not a property of the earned-empty hub in any sense — there is nothing to
         * put above a fold, and reporting that as a defect would be the suite complaining that he finished his
         * work. E1 and E2 measure what this state actually has to get right.
         */
        /*
         * KEYED ON THE MEASUREMENT, NOT ON THE MODE, and that is what let the unstarted hub be measured at all.
         *
         * This read `c.needsQueue && CLEARED`, so it stood down for the earned-empty hub and nowhere else. The
         * UNSTARTED hub also has no queue — and is not `CLEARED`, because that constant requires finished work —
         * so every queue check would have run against it and failed for having nothing to count. Asking the page
         * how many tasks it has covers both states and cannot be wrong about a third.
         */
        if (c.needsQueue && m.tasks === 0) {
            console.log(`     skip ${c.id} ${c.what}
            no queue in this state — ` +
                        (CLEARED ? 'this is the earned-empty hub, and E1/E2 measure it'
                            : 'this hub has never been used, and U1 measures it'));
            continue;
        }
        /*
         * A check about the RECORD, on a hub that has no record.
         *
         * P2 asserts the finished list shows everything it claims and P4 that a completion can be undone. On a hub
         * that has never been used there is nothing finished, so P2 reported NOT MEASURED as a failure and P4
         * measured "0 of 0 finished rows carry a control" — two false alarms about the absence of work, which is
         * the state's whole point. Same reasoning as the queue gate above, keyed on the same kind of evidence.
         */
        if (c.needsRecord && !m.statedDone) {
            console.log(`     skip ${c.id} ${c.what}
            nothing has ever been finished here, ` +
                        'so there is no record for this to be about');
            continue;
        }
        /*
         * A check about a held tool call, with nothing held.
         *
         * A SKIP RATHER THAN A NOT-MEASURED PASS, deliberately. A4's subject only exists for the ten minutes an
         * agent is waiting, so most runs of this suite will legitimately have nothing to measure — and the
         * state is planted and driven end to end by check S4 in tests/use-it.mjs, which is where the coverage
         * actually lives. Reporting a green A4 on an empty band would be the inflated-coverage failure this
         * file's own NOT MEASURED rule exists to prevent.
         */
        if (c.needsBand && !m.band.present) {
            console.log(`     skip ${c.id} ${c.what}
            nothing is held right now — S4 in prove:use plants one and drives it`);
            continue;
        }
        /* A check about the never-connected hub, on a hub that has been connected. */
        if (c.unstartedOnly && !m.unstartedHub) {
            console.log(`     skip ${c.id} ${c.what}
            needs the never-used hub — run ` +
                        '`npm run fixture -- --unstarted`');
            continue;
        }
        /* And the reverse: a check about the empty state, on a hub with work in it. */
        if (c.clearedOnly && !CLEARED) {
            console.log(`     skip ${c.id} ${c.what}
            needs the earned-empty hub — run ` +
                        '`npm run fixture -- --cleared`');
            continue;
        }
        if (c.fixtureOnly && !ON_DEFAULT_FIXTURE) {
            console.log(`     skip ${c.id} ${c.what}\n            needs the DEFAULT fixture's known data` +
                        (VOLUMES
                            ? ` — this is ${VOLUMES.open_tasks} open / ${VOLUMES.open_questions} decisions / ` +
                              `${VOLUMES.done_tasks} finished. Run \`npm run fixture\`.`
                            : '; run it against localhost with `npm run fixture` loaded.'));
            continue;
        }

        let value, shownWith = m;
        if (c.id === 'K2') value = await focusRing();
        else if (c.id === 'K3') value = await keystrokesToFirstTask();
        else if (c.room) value = await focusRoom();
        else if (c.time) {
            // Measured on the time-filtered queue, which is its own page state.
            await loadAndFilterTime(v);
            shownWith = await b.evaluate(MEASURE);
            value = c.value(shownWith);
        } else if (c.progress) {
            // Measured on the record rather than on the queue, so it needs its own page state and its own
            // measurement — reusing `m` here would describe the queue and report it as the record.
            await loadAndShowFinished(v);
            shownWith = await b.evaluate(MEASURE);
            value = c.value(shownWith);
        } else if (c.idle) {
            // The shared measurement has a task open, because L2 needs one. The idle pane is a different
            // subject and needs its own state — see loadIdle.
            await loadIdle(v);
            shownWith = await b.evaluate(MEASURE);
            value = c.value(shownWith);
        } else value = c.value(m);

        const ok = c.pass(value);
        const line = c.say(value, shownWith);
        /*
         * A CHECK THAT MEASURED NOTHING IS NOT A CHECK THAT PASSED, and this file was reporting it as one.
         *
         * Twelve branches in here already return a `NOT MEASURED` sentence — no completions listed, no figure
         * on the page, the record deeper than the window — and every one of them printed `ok` and was counted
         * in "Every check passed". That is precisely the inflated coverage the whole file argues against;
         * `tests/palette.mjs` deleted two pairs for exactly this reason, writing that *"a green check whose
         * subject does not exist is worse than no check: it reports coverage it is not providing."*
         *
         * It reports `--` and is counted separately now. Not a failure — a stand-down is legitimate and often
         * correct — but not a pass either, and the summary says how many there were so the number cannot hide.
         * `tests/use-it.mjs` has done it this way since §XXVIII; this is the same rule, arriving late.
         */
        const abstained = String(line).startsWith('NOT MEASURED');
        results.push({ id: c.id, width: v.name, ok, abstained });
        if (abstained) notMeasured++;
        console.log(`     ${abstained ? '--  ' : ok ? 'ok  ' : 'FAIL'} ${c.id} ${c.what}\n            ${line}`);
        if (!ok && !abstained) failures++;

        // Anything that navigated away must put the measured page state back for whatever follows.
        if (c.id === 'K2' || c.id === 'K3' || c.room || c.progress || c.time) await loadAndOpen(v);
    }
    console.log('');
}

/* ------------------------------------------------------------------------------- the light theme
 *
 * There is a whole second palette in app/globals.css, driven by `prefers-color-scheme`, and until this ran it
 * had never been rendered by anything. A theme nobody measures is a theme that is broken — and the failure
 * mode is specific and nasty: light themes fail contrast at the QUIET end, because a muted grey that reads
 * beautifully on near-black is nearly invisible on near-white, and the values do not transpose.
 *
 * Emulated through the browser's own media override rather than by adding a class, so it exercises exactly
 * the code path a real user with a light desktop gets.
 */
console.log('  the light theme\n');

await b.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
});

for (const v of [{ name: 'monitor', w: 1920, h: 1080, mobile: false },
                 { name: 'phone', w: 390, h: 844, mobile: true }]) {
    await loadAndOpen(v);
    const m = await b.evaluate(MEASURE);
    // Contrast and the focus ring are the two that can differ by theme; geometry cannot.
    for (const id of ['C1', 'K2']) {
        if (ONLY && id !== ONLY) continue;
        const c = CHECKS.find(x => x.id === id);
        if (id === 'K2' && v.name !== 'monitor') continue;
        const value = id === 'K2' ? await focusRing() : c.value(m);
        const ok = c.pass(value);
        results.push({ id: `${id}-light`, width: v.name, ok });
        console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${id} (light) ${c.what}\n            ${c.say(value, m)}`);
        if (!ok) failures++;
        if (id === 'K2') await loadAndOpen(v);
    }
}

await b.call('Emulation.setEmulatedMedia', { features: [] });
console.log('');

/* ==================================================================================================
 * L8 — HOW LONG IT TAKES TO OPEN. The claim nothing has ever measured.
 *
 * README.md has said the hub is fast since the first commit and no check has ever tested it. That is an
 * unverified product promise, which is a different thing from a missing test: docs/RESEARCH.md §7 cause 6 is
 * that abandonment clusters where there is access friction, and §22 found that over 70% of use of a surface
 * like this is a five-second glance. A hub that takes two seconds to paint has spent 40% of the interaction
 * before showing anything.
 *
 * WHAT IS MEASURED, and each one is a different failure:
 *
 *   serverMs   `responseStart - requestStart`. How long the hub took to answer at all. This is the one that
 *              grows with his data, because `board()` reads every completed task on every render.
 *   paintMs    first-contentful-paint. When something appeared. The number he would actually experience.
 *   htmlKb     the document's transfer size. This is the figure the payload narrowing was about — `FinishedRow`
 *              exists because sending every step of every completion was heading for 509 KB at nine hundred
 *              completions, and nothing has re-measured it since.
 *
 * WHY THE BUDGETS ARE THIS LOOSE, stated rather than hidden: this runs against `next dev`, which compiles on
 * demand and is several times slower than a production build. A tight threshold here would fail for reasons that
 * do not exist in production, and a check that fails for the wrong reason gets ignored. The budgets are set to
 * catch a REGRESSION of the order that would matter — a doubling — and the real figures are recorded by running
 * this against production, which the header of this file explains how to do.
 *
 * THE INJECTION IS REAL RATHER THAN ARITHMETIC. Chrome can throttle the CPU, so the check is re-run at 20x
 * slowdown and must go red. That proves the measurement is connected to the thing it claims to measure, which is
 * the property a timing check most easily loses.
 * ================================================================================================== */

/*
 * THE BUDGETS, AND THE FIRST SET WAS A FORMALITY RATHER THAN A WALL.
 *
 * They were 3000/4000ms, chosen loosely because `next dev` compiles on demand. Measured, the hub answers in
 * ~350ms and paints in ~390ms, so a 4000ms budget was ten times the real figure — and the CPU-throttling
 * injection proved it: at 20x slowdown the page still painted in 3108ms and the check stayed GREEN. A budget the
 * injection cannot cross is not measuring anything.
 *
 * These are roughly 3.5x the measured figures, which is wide enough to absorb machine variance and narrow enough
 * that a doubling fails. `htmlKb` is the one that is deliberately far out: 400KB is the CEILING the payload
 * narrowing was about (509KB at nine hundred completions was the projection that produced `FinishedRow`), not a
 * multiple of today's 17KB, because that figure grows with his record and the check exists to catch it arriving.
 */
/*
 * `rawKb` IS THE ONE THAT CAN SEE THE DEFECT, AND IT WAS MISSING.
 *
 * `htmlKb` measures `transferSize` — bytes on the wire, after gzip. That is the right number for "how long
 * until the response arrives", and it is blind to the thing that actually hurts: measured on this hub at two
 * years of the owner's own rate, the page ships 1.65 MB of HTML that gzips to about 74 KB. Comfortably inside a
 * 400 KB wire budget, while the browser still decompresses, parses and hydrates 1.65 MB — on a phone.
 *
 * So a payload could grow by two orders of magnitude without this check noticing. It is the exact shape of the
 * failure the briefs keep calling a proxy measurement: the number was real, cheap and honest, and it was not
 * measuring the thing anyone cared about.
 *
 * 600 KB uncompressed, deliberately loose. At fixture volume the page is about 11 KB, so this is not a tight
 * fit that will flake on a row or two of growth — it is a wall that a payload growing without a ceiling hits
 * long before a human notices the hub feels slow. The two-year reproduction blows through it by 2.7x.
 */
const LOAD_BUDGET = { serverMs: 1200, paintMs: 1500, htmlKb: 400, rawKb: 600 };

async function loadTiming({ warm = true, timeout } = {}) {
    /*
     * WARM UP FIRST, then measure. NO BACKTICKS BELOW.
     *
     * `next dev` compiles a route the first time it is hit, and that compile can be several seconds. It is not
     * part of what this check is about — production is a built bundle with no compile step — and including it
     * would make the number depend on whether some earlier check happened to have visited the page. Two
     * navigations: one to get the route compiled, one to measure.
     */
    /*
     * AND IT WAITS FOR THE PAINT, NOT FOR HYDRATION.
     *
     * The default predicate waits for React to attach handlers to a button, which is the right thing for every
     * other check here and the wrong thing for this one twice over: hydration is not what this measures, and at
     * 20x CPU throttling it TIMES OUT — the injection crashed the run rather than failing the check, which is
     * worse than either outcome. First-contentful-paint is exactly the event being timed and it happens long
     * before hydration, so waiting for the entry to exist is both narrower and more honest.
     */
    const untilPainted =
        "performance.getEntriesByType('paint').some(p => p.name === 'first-contentful-paint')";
    const opts = { waitFor: untilPainted, ...(timeout ? { timeout } : {}) };
    if (warm) await b.goto('/', opts);
    await b.goto('/', opts);
    return b.evaluate(`(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByType('paint')
            .find(p => p.name === 'first-contentful-paint');
        return {
            serverMs: nav ? Math.round(nav.responseStart - nav.requestStart) : -1,
            paintMs: fcp ? Math.round(fcp.startTime) : -1,
            /*
             * transferSize is 0 for a cached response and for some cross-origin cases, so fall back to the
             * decoded body size and say which was used. A zero reported as a size would look like the best
             * possible result, which is the direction a measurement must never fail in.
             */
            htmlKb: nav
                ? Math.round((nav.transferSize || nav.decodedBodySize || 0) / 102.4) / 10
                : -1,
            /*
             * The UNCOMPRESSED size, which is what the browser actually parses and hydrates. Reported
             * separately rather than replacing htmlKb, because the two answer different questions: htmlKb is
             * how long the bytes take to arrive, rawKb is how much work arrives. A hub that is fine on the
             * first and terrible on the second is exactly the state this hub is in at two years of volume.
             *
             * decodedBodySize is 0 on some cross-origin responses, so it falls back to transferSize and the
             * check treats a missing value as NOT MEASURED rather than as a pass.
             */
            rawKb: nav
                ? Math.round((nav.decodedBodySize || nav.transferSize || 0) / 102.4) / 10
                : -1,
            cached: nav ? nav.transferSize === 0 : false,
        };
    })()`);
}

if (!ONLY || ONLY === 'L8') {
    console.log('  L8 — how long it takes to open\n');
    await b.setViewport(1920, 1080, false);
    let t = await loadTiming();

    /*
     * ==================================================================================================
     * MEASURED TWICE WHEN THE FIRST READING IS ABSURD, AND THE SECOND ONE IS THE ANSWER.
     * ==================================================================================================
     *
     * `next dev` compiles on demand, so the first request to a route after any edit — or after another suite
     * has invalidated something — pays for the compile. This run measured **server 11,419ms against a 1,200ms
     * budget** with a payload of 17.2KB on the wire, comfortably inside its own 400KB budget. An eight-fold
     * overshoot on latency with the payload untouched is not a regression; it is a compile.
     *
     * That false failure has now cost this project time repeatedly — §XXVIII.5 records 2,656ms against the same
     * budget, 800ms over `curl`, from a `next dev` that had been recompiling for hours — and every previous fix
     * was an instruction to a human: *"restarting the dev server is part of measuring it."* An instruction is
     * not a mechanism.
     *
     * So: if a LOCAL reading is more than three times the budget, take a second one and report that. Three
     * times, because a real regression that slow would also blow the payload budget, and this only re-reads
     * when the payload is fine. It prints both figures either way, so a genuine 4x slowdown that survives a
     * warm-up is still visible rather than being smoothed away.
     *
     * Deliberately LOCAL-only. Against production there is no compiler, so a slow first response is the thing
     * being measured and re-reading it would be hiding a cold start.
     */
    let recompiled = null;
    if (LOCAL && t.serverMs > LOAD_BUDGET.serverMs * 3 && t.htmlKb <= LOAD_BUDGET.htmlKb) {
        recompiled = t.serverMs;
        t = await loadTiming();
    }

    /*
     * -1 means NOT MEASURED and must never pass. Several checks in this suite have previously reported success
     * while measuring nothing, which is the most expensive failure mode a harness has.
     */
    const measured = t.serverMs >= 0 && t.paintMs >= 0 && t.htmlKb >= 0 && t.rawKb >= 0;
    const within = measured
        && t.serverMs <= LOAD_BUDGET.serverMs
        && t.paintMs <= LOAD_BUDGET.paintMs
        && t.htmlKb <= LOAD_BUDGET.htmlKb
        && t.rawKb <= LOAD_BUDGET.rawKb;
    results.push({ id: 'L8', width: 'monitor', ok: within });
    if (!within) failures++;
    console.log(`     ${within ? 'ok  ' : 'FAIL'} L8 the hub answers and paints inside its budget` +
        `\n            server ${t.serverMs}ms (budget ${LOAD_BUDGET.serverMs}) · ` +
        `paint ${t.paintMs}ms (budget ${LOAD_BUDGET.paintMs}) · ` +
        `html ${t.htmlKb}KB on the wire (budget ${LOAD_BUDGET.htmlKb}) · ` +
        `${t.rawKb}KB uncompressed (budget ${LOAD_BUDGET.rawKb})` +
        (t.cached ? ' — transferSize was 0, so this is the decoded size' : '') +
        (measured ? '' : '\n            NOT MEASURED — navigation timing was unavailable') +
        /* Both numbers, always, so a warm-up can never quietly hide a real slowdown. */
        (recompiled != null
            ? `\n            first read was ${recompiled}ms — over 3x the budget with the payload inside `
              + 'its own, so that was next dev compiling. Re-read warm; the figure above is the second read.'
            : ''));
    /*
     * SAY WHICH HUB THESE NUMBERS ARE FROM. The first version printed "against `next dev`, which compiles on
     * demand" unconditionally — including when run against production, where it is simply false.
     *
     * A one-line untruth in a report is worse than no line, because the report is the thing you check the claim
     * against. Recorded for the same reason `tests/shoot.mjs` prints what data is in its images: a run that
     * cannot say what it measured is a run whose numbers cannot be compared to another run's.
     *
     * Measured 1 August 2026 — dev: server 337ms, paint 384ms, 16.6KB. Production: server 60ms, paint 552ms,
     * 16.4KB. Production answers five times faster and paints later, which is the CDN and the cold function
     * against a warm local server, and is the honest shape of the difference.
     */
    console.log(LOCAL
        ? '            against `next dev`, which compiles on demand — production is measured by pointing '
          + 'this file at it'
        : `            against PRODUCTION (${BASE}), which is a built bundle behind a CDN`);

    if (LOCAL) {
        /*
         * A real slowdown rather than a recomputed threshold — but a DETERMINISTIC one, which the first version
         * was not.
         *
         * CPU throttling alone was the first attempt, at 20x, and it is flaky: it produced 3,096ms on one run and
         * **1,132ms on the next**, under the 1,500ms budget, so the injection reported "DID NOT CATCH its own
         * defect" on a check that was working. The variance is real — with the route already compiled and the
         * response warm there is not enough main-thread work left for a CPU multiplier to bite reliably — and an
         * injection that passes or fails depending on machine state is worse than none, because it teaches you to
         * re-run the suite until it agrees with you.
         *
         * Network latency is arithmetic instead of a race: two seconds of added round-trip time means
         * `responseStart - requestStart` is over two seconds, and the budget is 1,200ms. There is nothing for a
         * fast machine to undercut. The CPU throttle is kept on top so the paint figure moves as well, but the
         * guarantee comes from the latency.
         */
        await b.call('Network.enable');
        await b.call('Network.emulateNetworkConditions', {
            offline: false, latency: 2000, downloadThroughput: -1, uploadThroughput: -1,
        });
        await b.call('Emulation.setCPUThrottlingRate', { rate: 20 });
        /*
         * NO WARM-UP NAVIGATION, AND A TIMEOUT SIZED FOR THE SLOWDOWN THIS DELIBERATELY CAUSES.
         *
         * Both of those are about the injection crashing the run rather than failing the check, which is a
         * failure mode this block's own comments already record once — and it came back in a new form. Measured
         * on 4 August: throttled, the page paints at **7,364ms and 9,188ms**. `goto` defaults to a 12,000ms
         * timeout, and `warm: true` makes TWO such navigations. Run on its own that fits; run at the end of a
         * full suite, with the browser already loaded from 120 state/width/theme combinations, it crosses 12s
         * and throws `timed out waiting for first-contentful-paint` — an exception from the harness, on a check
         * that was working perfectly and reporting paint six times over its budget.
         *
         * `warm: false` costs nothing: `warm` exists only to get `next dev` to compile the route, and by the
         * time this runs L8 has already navigated to `/` twice unthrottled. There is nothing left to compile.
         * The larger timeout is not a loosened budget either — the budget is `LOAD_BUDGET.paintMs`, asserted
         * below and untouched. This timeout only decides how long the harness waits before giving up on getting
         * a number at all, and a harness that gives up before the deliberate 20x slowdown has finished is
         * measuring itself.
         */
        const slow = await loadTiming({ warm: false, timeout: 45_000 });
        await b.call('Emulation.setCPUThrottlingRate', { rate: 1 });
        await b.call('Network.emulateNetworkConditions', {
            offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
        });
        const caught = slow.paintMs > LOAD_BUDGET.paintMs || slow.serverMs > LOAD_BUDGET.serverMs;
        if (!caught) failures++;
        console.log(`     ${caught ? 'ok  ' : 'FAIL'} L8 caught its own defect — with 2s of added latency and ` +
            `20x CPU throttling, server ${slow.serverMs}ms and paint ${slow.paintMs}ms`);

        /*
         * THE SIZE BUDGET NEEDS ITS OWN INJECTION, AND IT CANNOT BE THE ONE ABOVE.
         *
         * Latency and CPU throttling move time and leave bytes alone: `rawKb` is identical throttled and
         * unthrottled, so the injection above says nothing whatever about the check that was just added. A new
         * budget riding on somebody else's fault injection is a budget nobody has shown can fail.
         *
         * WHAT THIS DOES PROVE: that `rawKb` is a real, non-zero reading taken from an actual navigation, and
         * that comparing it against a budget flags an over-budget payload. The threshold is moved to 1 KB and
         * the genuine measured payload is checked against it.
         *
         * WHAT IT DOES NOT PROVE, said plainly rather than implied: that a 1.65 MB response would be caught in
         * the wild. Nothing here can inflate a server-rendered response from the client, so the transport is
         * exercised at fixture volume only. The 1.65 MB figure comes from the two-year reproduction in
         * docs/ITERATION-LOG.md, which inserts 3,687 rows into the dev branch and takes about two minutes — and
         * that is the run to repeat when the windowing work lands, because it is the only one that measures the
         * defect this budget exists to catch.
         *
         * A budget of 1 KB rather than 0: a zero budget would also "catch" a payload of zero bytes, which is
         * the NOT MEASURED case wearing a pass.
         */
        const sizeCaught = t.rawKb > 1;
        if (!sizeCaught) failures++;
        console.log(`     ${sizeCaught ? 'ok  ' : 'FAIL'} L8's payload budget caught an over-budget payload — ` +
            `the real ${t.rawKb}KB response is over a 1KB budget` +
            (sizeCaught ? '' : '\n            NOT MEASURED — decodedBodySize was absent or zero'));
        // Back to a clean page, so the checks after this are not measuring a throttled render.
        await b.goto('/');
    }
    console.log('');
}

/* ==================================================================================================
 * C2 — TEXT CONTRAST OVER THE PIXELS ACTUALLY PAINTED, not over the token
 *
 * The brief's instruction, verbatim: *"a texture behind text is the first perk that breaks that guarantee — so
 * if you build backgrounds, you must extend the harness to measure text contrast over the RENDERED surface, not
 * over the token. Do not ship a perk you cannot measure."*
 *
 * WHY C1 CANNOT DO THIS. C1 reads `getComputedStyle(el).backgroundColor` and walks up for the first opaque
 * ancestor. For an element painted with a gradient that resolves to `transparent`, and C1 correctly refuses to
 * guess — it reports UNMEASURABLE and fails. Which means the honest options for a texture were: fail C1 forever,
 * or declare an opaque `background-color` underneath and have C1 measure a colour the screen never shows. The
 * second is worse than the first, because it is a green check over a real defect.
 *
 * WHAT THIS DOES INSTEAD. Two screenshots per surface: one normal, and one with every text colour forced
 * transparent. The second is the background exactly as Chrome paints it, with no glyphs in the way. Then, for
 * each text element in the viewport, the pixels inside its own box are sampled out of that image and the
 * WORST-CASE luminance is compared against the element's own composited colour. No tokens, no walking the tree,
 * no assumptions — the number is the number on the screen.
 *
 * The screenshot is decoded by the BROWSER rather than in node: the base64 goes back in as a data URI, onto an
 * `Image`, onto a canvas, and `getImageData` gives the pixels. Decoding a PNG in node would mean either a
 * dependency or sixty lines of zlib and filter reconstruction, in a project with four runtime dependencies and a
 * test suite that deliberately has none.
 *
 * EVERY SURFACE IS MEASURED, not just the one currently unlocked. The CSS is injected directly, which
 * deliberately bypasses the entitlement check — that is a separate guarantee, covered by `prove` and
 * `prove:negative`. What matters here is the WORST CASE across all five, and the fixture's level 3 unlocks one
 * of them.
 * ================================================================================================== */

const C2_WIDTH = { name: 'monitor', w: 1920, h: 1080, mobile: false };

/**
 * Read every text element's colour, threshold and glyph line boxes FROM THE UNTOUCHED PAGE.
 *
 * ==================================================================================================
 * WHY THIS IS A SEPARATE PASS, AND THE BUG THAT FORCED IT
 * ==================================================================================================
 *
 * The first version read `cs.color` in the same pass that sampled the pixels — after the text-hiding style had
 * been injected and removed. Every measured colour came back with a fractional alpha, and the alpha CHANGED
 * between runs: `/ 0.568`, then `/ 0.195`, then `/ 0.217`. Chips and the close button were the worst offenders,
 * and "flat" — which has no pattern at all — failed alongside the textured ones.
 *
 * The cause: this interface has CSS transitions on `color`. Forcing `color: transparent` and then removing the
 * override starts a transition BACK, so every colour read immediately afterwards was caught mid-fade. The check
 * was measuring the page's own fade, at whatever moment the round trip happened to land, and reporting it as a
 * contrast failure of the texture.
 *
 * So the colours and the rects are collected first, from a page nothing has touched, and stashed on `window`.
 * Injecting `color: transparent` does not change layout, so the rects stay valid for the plate that follows.
 */
async function collectText() {
    /* NO BACKTICKS BELOW, INCLUDING IN COMMENTS. See the warning in `pixelContrast`. */
    return b.evaluate(`(() => {
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
            if (el.matches('script,style,noscript,svg,svg *')) continue;
            if (el.closest('[disabled],[aria-disabled="true"]')) continue;
            const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            if (!own) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            // Only what is inside the viewport: the plate has nothing else in it, and sampling outside it would
            // read whatever the canvas was initialised to, which is not a measurement.
            if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) {
                out.push({ skip: true });
                continue;
            }
            const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
            // WCAG "large text": 24px, or 18.66px when genuinely bold. 600 is not bold.
            const large = size >= 24 || (size >= 18.66 && weight >= 700);
            /*
             * CLIPPED TO WHAT IS ACTUALLY VISIBLE, and this was the third measurement bug in this check.
             *
             * Range.getClientRects() returns the geometry of the text AS LAID OUT, which for a
             * white-space: nowrap element inside overflow: hidden extends well past the visible box. The queue
             * rows use exactly that treatment for the task excerpt, so C2 was sampling pixels hundreds of
             * points to the right of the element — over other controls, and in one case off the panel entirely.
             *
             * It failed at 4.46:1 against 4.5 on a rowwhy, reporting a background luminance range of
             * 0.6755..0.9065 under one line of text, which is a span no single surface has. A range that wide
             * under one text run is the signature of sampling somewhere the text is not.
             *
             * So each line rect is intersected with every clipping ancestor's box, walked to the document. The
             * element's own box is included because it is usually the clipper; the walk is needed because it is
             * not always (a scrolling pane clips its children's children too).
             */
            const clips = [];
            for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
                const ncs = getComputedStyle(n);
                if (n === el || /hidden|auto|scroll|clip/.test(ncs.overflowX + ncs.overflowY)) {
                    clips.push(n.getBoundingClientRect());
                }
            }
            const rects = [];
            for (const n of el.childNodes) {
                if (n.nodeType !== 3 || !n.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                for (const raw of range.getClientRects()) {
                    let left = raw.left, top = raw.top, right = raw.right, bottom = raw.bottom;
                    for (const c of clips) {
                        left = Math.max(left, c.left); top = Math.max(top, c.top);
                        right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
                    }
                    if (right - left > 3 && bottom - top > 3) {
                        rects.push({ left, top, right, bottom, width: right - left, height: bottom - top });
                    }
                }
            }
            if (!rects.length) { out.push({ skip: true }); continue; }
            out.push({
                rects, color: cs.color, need: large ? 3 : 4.5,
                where: (el.getAttribute('data-measure') || el.className || el.tagName).toString().slice(0, 34),
                text: (el.textContent || '').trim().slice(0, 24),
            });
        }
        window.__cc_c2 = out;
        return out.filter(o => !o.skip).length;
    })()`);
}

/**
 * Sample the painted background behind every collected text run and return the worst ratio found.
 *
 * Returns `{ worst, need, where, text, measured, skipped, offenders }`. `measured` is printed because a check
 * that measured nothing must never read as a pass — the failure mode this suite has had more than once.
 */
async function pixelContrast(dataUri) {
    /*
     * NO BACKTICKS ANYWHERE BELOW, INCLUDING IN COMMENTS. This is a template literal, and a backtick closes it
     * and reparses the rest as outer JavaScript — the trap AGENTS.md records. It had happened six times before
     * this session and twice more during it, both times in a comment I had just written warning about it.
     */
    return b.evaluate(`(async () => {
        const items = window.__cc_c2 || [];
        const img = new Image();
        img.src = ${JSON.stringify(dataUri)};
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        // The screenshot is in DEVICE pixels; rects are in CSS pixels. One scale factor for the whole image.
        const scale = img.naturalWidth / window.innerWidth;

        const lum = (r, g, b) => {
            const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const cvt = document.createElement('canvas');
        cvt.width = cvt.height = 1;
        const ct = cvt.getContext('2d', { willReadFrequently: true });
        const rgba = str => {
            ct.fillStyle = '#000000'; ct.fillStyle = str;
            ct.fillRect(0, 0, 1, 1);
            const d = ct.getImageData(0, 0, 1, 1).data;
            return [d[0], d[1], d[2], d[3] / 255];
        };

        let worst = Infinity, worstNeed = 0, worstWhere = '', worstText = '', measured = 0, skipped = 0;
        const all = [];
        /*
         * THE LINE BOXES, COLLECTED EARLIER — not element boxes, and not read now.
         *
         * Two fixes are folded into that sentence, and both were found by this check failing on a page with NO
         * texture at all, which is the only reason either was noticed.
         *
         * The first version sampled each element bounding rect, and every surface failed including "flat". The
         * worst offender it named was a chip at 2.66:1 — not a defect: a chip is a pill with a border and rounded
         * corners, so its bounding box contains the border colour and the page showing through outside the curve,
         * and neither is behind any letter. Range over the element own text nodes gives the boxes the glyphs
         * actually occupy, which is the only region the question is about.
         *
         * The second is why they are collected in a separate pass at all: reading colours after the text-hiding
         * style had been removed caught every one of them mid-transition. See collectText.
         *
         * Each box is inset by 1px horizontally so an antialiased boundary at its edge cannot be read as the
         * background, and by 12% vertically to stay inside the glyph band rather than the leading. The pattern is
         * behind both, so that loses no coverage of the pattern.
         */
        for (const item of items) {
            if (item.skip) { skipped++; continue; }
            const need = item.need;
            const rects = item.rects;

            /*
             * A grid across each line box, capped at 24x6 samples per line.
             *
             * A pattern's period is 9 to 32 CSS pixels, so a grid this dense cannot step over a whole light or
             * dark band of any of the five surfaces — and the cap keeps a full page of text to a few thousand
             * reads rather than a few million. Both the lightest and the darkest sample matter: the text may be
             * light or dark depending on the theme, so the worst case is whichever end is closer to it.
             */
            let lo = Infinity, hi = -Infinity;
            for (const lr of rects) {
                const padY = lr.height * 0.12;
                const x0 = lr.left + 1, x1 = lr.right - 1;
                const y0 = lr.top + padY, y1 = lr.bottom - padY;
                if (x1 <= x0 || y1 <= y0) continue;
                const cols = Math.max(2, Math.min(24, Math.round((x1 - x0) / 6)));
                const rows = Math.max(2, Math.min(6, Math.round((y1 - y0) / 3)));
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = Math.floor((x0 + ((x1 - x0) * (i + 0.5)) / cols) * scale);
                        const y = Math.floor((y0 + ((y1 - y0) * (j + 0.5)) / rows) * scale);
                        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
                        const d = cx.getImageData(x, y, 1, 1).data;
                        const L = lum(d[0], d[1], d[2]);
                        if (L < lo) lo = L;
                        if (L > hi) hi = L;
                    }
                }
            }
            if (!isFinite(lo)) { skipped++; continue; }

            const fg = rgba(item.color);
            // Composite translucent text over the extreme it is being measured against, exactly as C1 does.
            const ratioAgainst = bgL => {
                const bg255 = Math.round((bgL <= 0.0031308 ? bgL * 12.92
                    : 1.055 * Math.pow(bgL, 1 / 2.4) - 0.055) * 255);
                const composited = fg[3] >= 1 ? [fg[0], fg[1], fg[2]]
                    : [0, 1, 2].map(k => Math.round(fg[k] * fg[3] + bg255 * (1 - fg[3])));
                const a = lum(composited[0], composited[1], composited[2]);
                const c = bgL;
                const p = a > c ? [a, c] : [c, a];
                return (p[0] + 0.05) / (p[1] + 0.05);
            };
            const got = Math.min(ratioAgainst(lo), ratioAgainst(hi));
            measured++;
            all.push({
                got: +got.toFixed(2), need,
                where: item.where, text: item.text,
                color: item.color, lo: +lo.toFixed(4), hi: +hi.toFixed(4),
            });
            if (got - need < worst - worstNeed) {
                worst = got; worstNeed = need;
                worstWhere = item.where; worstText = item.text;
            }
        }
        return {
            worst: +worst.toFixed(2), need: worstNeed, where: worstWhere, text: worstText,
            measured, skipped,
            /* The worst few rather than only the worst one. A single offender tells you a number; three tell you
               whether it is one element or a class of them, which is the difference between a defect and a
               measurement bug — and this check has already had one of each. */
            offenders: all.sort((a, c) => (a.got - a.need) - (c.got - c.need)).slice(0, 3),
        };
    })()`);
}

/** Screenshot the viewport with every glyph made transparent, so what is left is the painted background. */
async function backgroundPlate() {
    await b.evaluate(`(() => {
        const s = document.createElement('style');
        s.id = 'cc-hide-text';
        s.textContent = '*,*::before,*::after{color:transparent !important;'
            + 'text-shadow:none !important;caret-color:transparent !important;'
            /* Transitions and animations off as well. Without it the emblem infinite arc sweep is in a
               different position in every plate, so the same page photographed twice is two different images —
               and a check whose input is nondeterministic is a check nobody can act on. */
            + 'transition:none !important;animation:none !important}';
        document.head.appendChild(s);
    })()`);
    const shot = await b.call('Page.captureScreenshot', { format: 'png' });
    await b.evaluate(`document.getElementById('cc-hide-text')?.remove()`);
    return `data:image/png;base64,${shot.result.data}`;
}

if (!ONLY || ONLY === 'C2') {
    console.log('  C2 — text contrast over the PIXELS, for every page surface\n');
    let c2Failed = 0;
    for (const scheme of ['dark', 'light']) {
        await b.call('Emulation.setEmulatedMedia', scheme === 'light'
            ? { features: [{ name: 'prefers-color-scheme', value: 'light' }] }
            : { features: [] });
        for (const surf of SURFACES) {
            await loadAndOpen(C2_WIDTH);
            const css = surfaceCss(surf.slug);
            if (css) {
                await b.evaluate(`(() => {
                    const s = document.createElement('style');
                    s.id = 'cc-c2-surface';
                    s.textContent = ${JSON.stringify(css)};
                    document.head.appendChild(s);
                })()`);
            }
            /* Colours and rects FIRST, from the untouched page — see collectText for the mid-transition bug
               that made this ordering load-bearing. */
            await collectText();
            const plate = await backgroundPlate();
            const r = await pixelContrast(plate);
            /*
             * A run that measured nothing is a FAILURE, not a pass. Several checks in this suite have
             * previously reported success while their selector matched no elements, which is the single most
             * expensive failure mode a harness has.
             */
            const ok = r.measured > 20 && r.worst >= r.need;
            if (!ok) { c2Failed++; failures++; }
            results.push({ id: `C2-${surf.slug}-${scheme}`, width: 'monitor', ok });
            console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${surf.slug.padEnd(7)} ${scheme.padEnd(5)} ` +
                `worst ${String(r.worst).padStart(6)}:1 needs ${r.need} over ${r.measured} element(s)` +
                (ok ? '' : '\n' + r.offenders.map(o =>
                    `            ${o.got}:1 needs ${o.need} — ${o.where} "${o.text}" ` +
                    `${o.color} over L ${o.lo}..${o.hi}`).join('\n')
                    + `\n            (${r.skipped} outside the viewport)`));
        }
    }
    await b.call('Emulation.setEmulatedMedia', { features: [] });

    /*
     * PROVE C2 CAN FAIL, and the injection has to be a TEXTURE rather than a flat colour.
     *
     * A flat too-light page would also be caught by C1, so breaking that way would prove nothing about the new
     * mechanism. This injects a pattern whose light band is far outside the ramp — the exact mistake
     * `surfaceUsesOnlyRampTokens` forbids and that C1 structurally cannot see, because the element carrying it
     * declares an opaque `background-color` and C1 would happily measure that instead.
     */
    if (LOCAL) {
        await loadAndOpen(C2_WIDTH);
        await b.evaluate(`(() => {
            const s = document.createElement('style');
            s.textContent = 'body{background-color:var(--s0);background-image:'
                + 'repeating-linear-gradient(0deg, oklch(0.82 0.02 70) 0 6px, transparent 6px 12px);'
                + 'background-attachment:fixed}';
            document.head.appendChild(s);
        })()`);
        await collectText();
        const plate = await backgroundPlate();
        const r = await pixelContrast(plate);
        const caught = r.measured > 20 && r.worst < r.need;
        if (!caught) failures++;
        console.log(`     ${caught ? 'ok  ' : 'FAIL'} C2 caught its own defect — a pattern with a band ` +
            `outside the ramp measures ${r.worst}:1 against ${r.need}`);
        console.log(`            and C1 would not have: the element declares an opaque background-color, ` +
            'so the token says it is fine');
    }
    console.log(c2Failed === 0
        ? `     ${SURFACES.length * 2} surface/scheme combinations pass on the rendered pixels\n`
        : `     ${c2Failed} combination(s) fail\n`);
}

/* ------------------------------------------- prove every check can still fail, by breaking each one */

/*
 * Re-introduce each defect at runtime and confirm the check goes red.
 *
 * This is not the primary evidence — every check here was first observed failing against the interface as
 * it was before the redesign, which is a stronger thing to have watched. This exists so that a check whose
 * selector stops matching anything cannot keep reporting success: a query that matches nothing passes
 * every threshold it is given.
 */
/*
 * Skipped against production. The injections work by pushing stylesheets into the live page, which is
 * harmless and reverts on the next navigation — but a run whose whole purpose is "measure the real thing"
 * should not also be deliberately breaking the real thing while he might have it open on his phone.
 */
if (!LOCAL) {
    console.log('  the fault-injection pass is skipped against production: it breaks the page on purpose,\n' +
                '  and this is the page he is actually using. Run it against localhost for that evidence.\n');
} else {

console.log('  proving each check can still fail\n');

const NEGATIVE_WIDTH = { name: 'monitor', w: 1920, h: 1080, mobile: false };
const PHONE = { name: 'phone', w: 390, h: 844, mobile: true };

for (const c of CHECKS) {
    if (ONLY && c.id !== ONLY) continue;
    /*
     * THE INJECTIONS ARE CALIBRATED AGAINST THE DEFAULT FIXTURE, and running them on other data reports
     * failures that are not failures.
     *
     * Found by finally pointing this suite at the cleared hub: eight injections reported "DID NOT CATCH its own
     * defect" — L1, L4, L5, K1, K4, P6, L7, A2. Every one of them was correct about itself and wrong about the
     * world. There are no task rows to tile two-across, no queue to make scroll, no pane to overflow and no
     * fields to strip labels from, so the injection cannot reproduce a defect that structurally cannot exist in
     * that state. "The check did not catch a thing that did not happen" is not information.
     *
     * A skip is information; a false failure is noise, and noise is how a suite stops being read — the same
     * argument `fixtureOnly` already makes for P3. So the pass stands down as a whole, loudly, and the checks
     * that belong to THIS data state (E1, E2) still prove themselves, because their injections work on the page
     * they were written for.
     */
    if (!ON_DEFAULT_FIXTURE && !c.clearedOnly && !c.unstartedOnly) {
        continue;
    }
    if (c.clearedOnly && !CLEARED) continue;
    /* U1's injection needs the page it was written for, exactly as E1's and E2's do. */
    if (c.unstartedOnly && ON_DEFAULT_FIXTURE) continue;
    const v = c.widths !== 'all' && c.widths.includes('phone') && !c.widths.includes('monitor')
        ? PHONE : NEGATIVE_WIDTH;

    /*
     * NAVIGATE, THEN OPEN, THEN BREAK. In that order, and nothing may navigate afterwards.
     *
     * The keyboard checks reload the page themselves so that Tab starts from the top. In the negative
     * pass that reload happened AFTER the fault was injected and washed it away, so both of them
     * reported "did not catch its own defect" on a page that was never actually broken by the time they
     * looked at it. They are told not to navigate here; this loop has already done it.
     */
    await b.setViewport(v.w, v.h, v.mobile);
    await b.goto('/');
    /*
     * Reach the state the check measures BEFORE breaking it, and never navigate afterwards.
     *
     * The progress checks measure the record, which is behind a button press. Injecting the fault first and
     * then pressing through would re-render the region and, for the injections that remove elements, put them
     * straight back — which is the same washing-away that made both keyboard checks report "did not catch its
     * own defect" on a page that was no longer broken.
     */
    if (c.time) await b.evaluate(PRESS_TIGHTEST_TIME);
    else if (c.progress) await b.evaluate(SHOW_FINISHED);
    /*
     * AN `idle` CHECK MEASURES THE PANE WITH NOTHING OPEN, so the negative pass must leave it that way — and
     * for the whole life of this loop it did the opposite.
     *
     * L7's subject is the reading pane in its resting state; the branch below opens the longest task, which is
     * the one state L7 explicitly does not measure. So L7's value came back as its "not idle" sentinel, `pass`
     * was false, and the loop printed **"ok L7 caught its own defect"** — a green line about an injection that
     * had never been demonstrated to do anything. The check was fine; its proof was theatre.
     *
     * Found by the stand-down gate below rather than by reading this: once a NOT MEASURED verdict stopped being
     * silently treated as a caught defect, L7 announced that it had nothing to say. That is the second time in
     * this file's history that making a report honest has revealed a check proving itself against the wrong
     * page — see the note on OPEN_LONGEST_TASK and the two keyboard checks.
     */
    else if (c.idle) { /* nothing to open — idle IS the state */ }
    else if (!c.keyboard && !c.room) await b.evaluate(OPEN_LONGEST_TASK);
    await b.evaluate(c.break);
    await new Promise(r => setTimeout(r, 120));

    let value;
    let measured = null;
    if (c.id === 'K2') value = await focusRing({ navigate: false });
    else if (c.id === 'K3') value = await keystrokesToFirstTask({ navigate: false });
    else if (c.room) value = await focusRoom({ navigate: false });
    else { measured = await b.evaluate(MEASURE); value = c.value(measured); }

    /*
     * A CHECK THAT STOOD DOWN CANNOT BE SHOWN TO FAIL, AND SAYING SO BEATS REPORTING A BROKEN CHECK.
     *
     * Found the moment L3 gained its stand-down: with a tool call held, L3 returns -1 and passes by design, so
     * the injection reported **"L3 DID NOT CATCH its own defect"** on a check that was working exactly as
     * written. That message means something specific and load-bearing in this file — that a green run means
     * nothing — and spending it on a check that deliberately abstained would devalue it everywhere.
     *
     * The gate reads the check's own `say`, which is where the NOT MEASURED convention already lives, so any
     * future check with a stand-down inherits this for free rather than needing a flag nobody remembers to set.
     */
    const standDown = measured != null && typeof c.say === 'function'
        && String(c.say(value, measured)).startsWith('NOT MEASURED');
    if (standDown) {
        console.log(`     --   ${c.id} stood down in this state, so its injection proves nothing here`);
        console.log(`            ${String(c.say(value, measured)).slice(0, 120)}`);
        continue;
    }

    const caught = !c.pass(value);
    console.log(`     ${caught ? 'ok  ' : 'FAIL'} ${c.id} ${caught ? 'caught' : 'DID NOT CATCH'} its own defect`);
    if (!caught) {
        console.log(`            ${c.id} passed a deliberately broken page, so a green run means nothing`);
        failures++;
    }
}

}

const red = results.filter(r => !r.ok && !r.abstained);
/*
 * THE STAND-DOWN COUNT IS IN THE SUMMARY LINE, and that is the whole point of separating it.
 *
 * "Every check passed" over a run where four of them measured nothing is the sentence that makes a suite stop
 * being worth reading. The number is small and boring on a normal run and jumps the moment a data state stops
 * exercising something, which is exactly when somebody should notice.
 */
const stoodDown = notMeasured ? ` ${notMeasured} stood down and measured nothing.` : '';
console.log(failures === 0
    ? `\nEvery check that ran passed, and each was shown to fail on a deliberately broken page.${stoodDown}\n`
    : `\n${failures} problem(s). Failing checks: `
      + `${[...new Set(red.map(r => r.id))].join(', ') || '(negative pass)'}.${stoodDown}\n`);

b.cleanup();
process.exitCode = failures === 0 ? 0 : 1;
