/**
 * A UI AUDIT — every control, every truncation, every dead end, enumerated.
 *
 *   node tests/audit-ui.mjs                    # localhost, every state
 *   node tests/audit-ui.mjs --tag x            # (states are fixed; --tag only names nothing yet)
 *
 * WHY THIS EXISTS, AND IT IS NOT A FLATTERING REASON
 *
 * This project's verification is check-driven: `prove:layout` asserts twenty-three specific properties, and
 * every one of them was green while the owner found two serious defects in twenty seconds of looking:
 *
 *   1. FOUR controls — the header's "13 done · 5 decided" chip, the pane's "13 finished" and "5 decided"
 *      figures, and "8 more marks" — all did exactly the same thing. Four buttons, one destination.
 *   2. The record rendered finished tasks with the title capped at 38% and ellipsised, the `why` clipped
 *      beside it, the title not clickable and the task not openable. Thirteen dead ends.
 *
 * Neither is expressible as "assert X < Y", which is why no check caught them. They are *relational*: two
 * controls that agree, a truncation with no route to the full text, an element that looks pressable and is not.
 * A check answers a question somebody already thought of. An audit ENUMERATES so the question can be asked
 * afterwards — which is the difference between a suite and actually looking at the thing.
 *
 * It prints rather than passes. There is no threshold here and inventing one would be pretending: a duplicate
 * destination is sometimes right (two ways into the same place from far apart), and a truncation is fine when
 * the full text is one press away. The output is a list to read, so the judgement stays with a person.
 */

import { launch } from './chrome.mjs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env.local')); } catch { /* may be in the environment */ }

const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3939').replace(/\/+$/, '');

/*
 * The states worth walking. Each is (label, how to get there) — and the record is included TWICE, once per
 * entry point, because "does this control land somewhere related to itself" is the question that produced
 * defect 1 above and it can only be answered by pressing each one and comparing.
 */
const STATES = [
    { label: 'queue, idle', go: null },
    { label: 'queue, a task open', go: 'openTask' },
    { label: 'record via the header chip', go: 'chip' },
    { label: 'record via "N finished"', go: 'figTasks' },
    { label: 'record via "N decided"', go: 'figDecisions' },
    { label: 'record via "N more marks"', go: 'moreMarks' },
    /* The outbound half. Added the moment it shipped, because the whole reason this file exists is
       that four controls once had one destination and nothing was comparing them. */
    { label: 'record via the footer note line', go: 'saidEntry' },
    /* The time machine, and its entry point is the line that used to be a readout. In here from the day it
       shipped for the same reason /looks is: the audit's whole job is comparing where entry points land, and a
       new one that nothing compares is the defect this file was written after. */
    { label: 'record via "since <date>"', go: 'sinceEntry' },
    { label: 'decisions only', go: 'moreDecisions' },
    /* Not a state of the board at all — a whole page nothing had ever looked at. See the goto below. */
    { label: '/setup, as an agent is pointed at it', at: '/setup' },
    { label: '/setup with the served instructions open', at: '/setup', go: 'openSnippet' },
    /* The unlocks. In here from the day it shipped rather than after he finds something on it, which is the
       order the last three iterations did it in. */
    { label: '/looks, what the levels bought', at: '/looks' },
];

const GO = {
    openTask: `(() => { const r = document.querySelector('[data-measure="task"] .rowmain');
        if (!r) return 'no task'; r.click(); return 'ok'; })()`,
    chip: `(() => { const b = document.querySelector('header [data-figure="tasks-done"]');
        if (!b) return 'no chip'; b.click(); return 'ok'; })()`,
    figTasks: `(() => { const b = document.querySelector('.record [data-figure="tasks-done"]');
        if (!b) return 'no figure'; b.click(); return 'ok'; })()`,
    figDecisions: `(() => { const b = document.querySelector('.record [data-figure="decisions-made"]');
        if (!b) return 'no figure'; b.click(); return 'ok'; })()`,
    moreMarks: `(() => { const b = [...document.querySelectorAll('.record .morelink')]
        .find(x => /more mark/i.test(x.textContent || '')); if (!b) return 'no link'; b.click(); return 'ok'; })()`,
    saidEntry: `(() => { const b = document.querySelector('[data-measure="said-entry"]');
        if (!b) return 'no said entry'; b.click(); return 'ok'; })()`,
    sinceEntry: `(() => { const b = document.querySelector('.record [data-figure="record-since"]');
        if (!b) return 'no since control'; b.click(); return 'ok'; })()`,
    /* The served snippet is behind a `details`, so the closed page never shows it — and a `details` a person
       cannot open is the same as content that is not there. Opened by clicking the summary, the way one is. */
    openSnippet: `(() => { const d = document.querySelector('details');
        if (!d) return 'no details on /setup'; d.querySelector('summary').click();
        return d.open ? 'ok' : 'the summary did not open it'; })()`,
    moreDecisions: `(() => { const b = document.querySelector('[data-measure="more-decisions"]');
        if (!b) return 'no link'; b.click(); return 'ok'; })()`,
};

/*
 * What to record about every state. Deliberately descriptive rather than judgemental — it reports what IS,
 * and the reading is done below.
 *
 * `where` identifies a control by its own text plus its region, because that is how a person tells two
 * controls apart. `landsOn` is the scroll position and the first heading in view AFTER the press, which is
 * what makes "these two buttons do the same thing" visible as data.
 */
const SURVEY = `(() => {
    const vis = el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const region = el => {
        for (const [sel, name] of [['header', 'header'], ['.pane', 'pane'], ['.queue', 'queue']]) {
            if (el.closest(sel)) return name;
        }
        return 'page';
    };
    const label = el => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 44)
        || el.getAttribute('aria-label') || el.getAttribute('title') || '(no label)';

    const controls = [...document.querySelectorAll('button, a[href], [role="button"], select, textarea')]
        .filter(vis)
        .map(el => ({
            tag: el.tagName.toLowerCase(),
            region: region(el),
            label: label(el),
            disabled: !!el.disabled,
        }));

    /* Anything whose text is cut off, by ellipsis or by clamping or by plain overflow. */
    const truncated = [...document.querySelectorAll('*')]
        .filter(el => el.children.length === 0 && (el.textContent || '').trim() && vis(el))
        .map(el => {
            const cs = getComputedStyle(el);
            /*
             * OVERFLOWING IS NOT THE SAME AS BEING CUT OFF, and the first version of this conflated them.
             *
             * It reported the rank ("Operator") and the level numeral ("3") as truncated with no way to read
             * them. Measured: the numeral's scrollHeight is 32 against a clientHeight of 28 -- a 28px face in a
             * line-height-1 box -- and its overflow is visible, so every pixel is on screen. Nothing was hidden
             * and nothing needed fixing.
             *
             * A false positive costs more than a miss here, because an audit is a list somebody reads by hand:
             * two bogus lines at the top and the real ones below stop being looked at. So the overflow has to
             * actually be CLIPPED to count -- the element must hide it, or clamp it.
             *
             * NO BACKTICKS ANYWHERE IN THIS LITERAL, including in comments. This is trap 1 in AGENTS.md, it has
             * cost this project hours three times, and writing that sentence did not stop me doing it a fourth.
             */
            const hides = /hidden|clip|auto|scroll/.test(cs.overflow + ' ' + cs.overflowX + ' ' + cs.overflowY);
            const clamped = cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '';
            const overX = el.scrollWidth > el.clientWidth + 1;
            const overY = el.scrollHeight > el.clientHeight + 1;
            const over = overX || overY;
            if (!over || !(hides || clamped)) return null;
            /*
             * SCROLLABLE IS REACHABLE, and this was the THIRD false-positive class this one check has produced.
             *
             * The first walk of /setup reported both copy blocks as truncated with no way to the full text --
             * 1,808 characters of onboarding prompt and 7,464 of served instructions. Measured: both are
             * max-height 300px with overflow-y auto, so every character is reachable by scrolling, which is how
             * anyone reads a long block on a page. The check counted auto and scroll as ways of HIDING text, which
             * they are, and then offered only two routes back to it: a title attribute or an ancestor control.
             *
             * Scrolling is a third route, and on the axis that actually overflows. The distinction matters: a
             * block that scrolls vertically and is clipped horizontally is still cutting text off, so each axis is
             * judged against its own overflow value rather than the pair being collapsed into one answer.
             *
             * Recording it because the pattern is now unmistakable: every wrong answer this check has given came
             * from treating a mechanism (overflow, scrollHeight, a gutter) as if it were the thing I cared about,
             * which is whether a person can get to the words.
             */
            const scrolls = (axis) => /auto|scroll/.test(axis);
            const scrollable = (overX && scrolls(cs.overflowX)) || (overY && scrolls(cs.overflowY));
            return {
                region: region(el),
                cls: (el.className || el.tagName).toString().slice(0, 26),
                shown: (el.textContent || '').trim().slice(0, 34),
                full: (el.textContent || '').trim().length,
                /* Three routes to the full text and no others: it scrolls, it carries a title, or an ancestor
                   is a control that opens it. */
                reachable: scrollable ||
                    !!(el.getAttribute('title') || el.closest('button, a[href], [role="button"]')),
            };
        })
        .filter(Boolean);

    /* Things that LOOK pressable but are not, and things that are pressable but look inert. */
    const pointerNotControl = [...document.querySelectorAll('*')].filter(el =>
        vis(el) && getComputedStyle(el).cursor === 'pointer' &&
        !el.closest('button, a[href], [role="button"], select, label')).length;

    const firstHeadingInView = (() => {
        const hs = [...document.querySelectorAll('h1, h2, h3')].filter(vis);
        const h = hs.find(x => x.getBoundingClientRect().top >= -4);
        return h ? (h.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) : '(none)';
    })();

    /*
     * WHAT IS ACTUALLY ON SCREEN, which is the honest way to ask "did these two controls do the same thing".
     *
     * The first version of this audit compared scroll position and the first heading in view. That was the
     * right question measured through the wrong instrument, and it failed in both directions: when the record
     * was a 2,017px stack it reported two different sections as the same destination (the page could not scroll
     * far enough to separate them), and once the record showed one list at a time it reported four DIFFERENT
     * destinations as identical, because they all sit at y=0 under the same h1.
     *
     * A destination is what you can see, so that is what this records: which tab is pressed, and which of the
     * record's lists is present. Both come off the DOM rather than from anything the audit assumes.
     */
    /*
     * EVERY CONTROL CLAIMING TO BE PRESSED.
     *
     * Added because functional correctness and visual correctness came apart: after the record was split into
     * sections, pressing "13 finished" navigated correctly AND lit up "5 decided" as well, because both figures
     * read one shared boolean. He spotted it on a screenshot with a box round both.
     *
     * A pressed state that is wrong is worse than none at all -- it is the interface making a claim about what
     * you just did. And it is invisible to a check that only asks "did the right thing happen", which is why
     * this records the CLAIM rather than the outcome, so the two can be compared.
     */
    const pressed = [...document.querySelectorAll('[aria-pressed="true"]')].filter(vis)
        .map(el => region(el) + '/' + label(el));

    const activeTab = (() => {
        const t = document.querySelector('[data-measure="record-tab"][aria-pressed="true"]');
        return t ? (t.textContent || '').replace(/\\s+/g, ' ').trim() : null;
    })();
    /* NO BACKTICKS IN THIS COMMENT. It is inside the MEASURE template literal, and a backtick closes the
       literal and reparses the rest as outer JavaScript — the trap AGENTS.md records, which had happened six
       times before this and has now happened seven. The error was "Unexpected identifier" pointing at a word
       that was inside a comment.
       The timeline belongs in this list for the same reason the other three do: without it the audit printed
       "showing: nothing" for a tab that renders a whole surface, which reads as a dead control. A detector
       that does not know about a state reports that state as broken. */
    /* WHERE THE TIME MACHINE IS STANDING, when it is showing.
       Part of the destination, not decoration: two controls both open the timeline — the header summary opens
       today, the pane's date line opens the first day of the record — and without this the audit reports them as
       one control with two labels. It reported exactly that, correctly, before the two were made to differ.
       This makes the detector MORE precise rather than more lenient: two controls that both land on today are
       still printed as the same destination. */
    const timelineAt = (() => {
        const el = document.querySelector('[data-measure="timeline-at"]');
        return el && vis(el) ? (el.textContent || '').trim() : null;
    })();
    const listsVisible = ['done-list', 'mark-wall', 'said-list', 'timeline']
        .filter(k => { const el = document.querySelector('[data-measure="' + k + '"]'); return el && vis(el); })
        .concat([...document.querySelectorAll('.decided')].filter(vis).length ? ['decided'] : []);

    return {
        timelineAt,
        controls, truncated, pointerNotControl, pressed,
        scrollY: Math.round(window.scrollY),
        firstHeadingInView,
        activeTab,
        listsVisible,
        docHeight: document.documentElement.scrollHeight,
    };
})()`;

/*
 * EVERY WIDTH AND BOTH THEMES, not 1920 in the dark.
 *
 * The audit ran at one width, in one theme, for its whole life. That is the shape of gap this file was written
 * about: it enumerates what a check cannot express, and then only looked at the surface a desktop shows in the
 * dark. A truncation that only bites at 390px, or an element that only shows a pointer cursor in the light theme,
 * was outside it.
 *
 * Five widths matching tests/measure-layout.mjs, because a truncation is a width question — and both themes,
 * because the light one is where the quiet end of the palette goes wrong and it is the theme nobody had looked at
 * until this year.
 *
 * THE RELATIONAL PASS STILL RUNS AT ONE WIDTH ONLY, and that is deliberate rather than laziness: "do two
 * controls land in the same place" is a question about the interface's structure, and the answer is the same at
 * every width. Running it five times would print the same finding five times, which is how a report stops being
 * read. The per-state enumeration — controls, truncations, pointer-not-control — is the part that genuinely
 * differs by width, so that is the part that walks them.
 */
const WIDTHS = [
    { name: 'phone', w: 390, h: 844, mobile: true },
    { name: 'tablet', w: 834, h: 1112, mobile: true },
    { name: 'laptop', w: 1280, h: 900, mobile: false },
    { name: 'monitor', w: 1920, h: 1080, mobile: false },
    { name: 'ultrawide', w: 2560, h: 1440, mobile: false },
];

const b = await launch({ base: BASE, token: process.env.CC_WEB_TOKEN, port: 9351 });
const out = [];
/** The per-width, per-theme sweep. Findings only — the full enumeration stays at 1920 so the output is readable. */
const sweep = [];

try {
    for (const scheme of ['dark', 'light']) {
        await b.call('Emulation.setEmulatedMedia', scheme === 'light'
            ? { features: [{ name: 'prefers-color-scheme', value: 'light' }] }
            : { features: [] });
        for (const v of WIDTHS) {
            await b.setViewport(v.w, v.h, v.mobile);
            for (const s of STATES) {
                await b.goto(s.at || '/');
                if (s.go) {
                    const r = await b.evaluate(GO[s.go]);
                    if (r !== 'ok') continue;
                    await new Promise(r2 => setTimeout(r2, 300));
                }
                const survey = await b.evaluate(SURVEY);
                sweep.push({
                    scheme, width: v.name, label: s.label,
                    unreachable: survey.truncated.filter(t => !t.reachable),
                    pointerNotControl: survey.pointerNotControl,
                    controls: survey.controls.length,
                });
            }
        }
    }
    await b.call('Emulation.setEmulatedMedia', { features: [] });

    await b.setViewport(1920, 1080, false);
    for (const s of STATES) {
        /*
         * `at` rather than always '/', because /setup had never been walked by anything.
         *
         * It is the page a new project's agent is pointed at and the only place the onboarding prompt exists,
         * and it was outside every suite: not audited, not screenshotted in the current palette, not measured.
         * He named it directly — *"never forget our setup page"* — and the honest response to that is to put it
         * inside the machinery rather than to remember harder.
         */
        await b.goto(s.at || '/');
        if (s.go) {
            const r = await b.evaluate(GO[s.go]);
            if (r !== 'ok') { out.push({ ...s, skipped: r }); continue; }
            await new Promise(r2 => setTimeout(r2, 350));
        }
        const survey = await b.evaluate(SURVEY);
        out.push({ ...s, survey });
    }
} finally {
    b.cleanup();
}

/* ------------------------------------------------------------------------------- read it back */

console.log('\n  UI AUDIT — ' + BASE + ' at 1920x1080\n');

for (const s of out) {
    if (s.skipped) { console.log(`  ${s.label}: not reachable (${s.skipped})`); continue; }
    const v = s.survey;
    console.log(`  ${s.label}`);
    console.log(`     ${v.controls.length} controls · lands at y=${v.scrollY} · first heading in view: ` +
                `"${v.firstHeadingInView}" · page ${v.docHeight}px`);
    const unreachable = v.truncated.filter(t => !t.reachable);
    if (unreachable.length) {
        console.log(`     ${unreachable.length} TRUNCATED WITH NO WAY TO THE FULL TEXT:`);
        for (const t of unreachable.slice(0, 6)) {
            console.log(`        ${t.region}/${t.cls}: "${t.shown}…" (${t.full} chars, not openable)`);
        }
    }
    if (v.pointerNotControl) {
        console.log(`     ${v.pointerNotControl} element(s) show a pointer cursor but are not controls`);
    }
}

/* ------------------------------------------------------- what only shows up at another width or theme */

/*
 * Printed as a summary rather than state by state. Ten widths-and-themes times eleven states is 110 blocks, and
 * a report that long is a report nobody reads — which is the failure this file's own header warns about.
 *
 * So: only the findings, and only the ones the 1920/dark pass above did not already show. Nothing is hidden by
 * that — the count of what was walked is printed either way, so a run that found nothing says how hard it looked.
 */
const sweptFindings = sweep.filter(x => x.unreachable.length || x.pointerNotControl);
console.log(`
  every width, both themes — ${sweep.length} state/width/theme combinations walked
`);
if (!sweptFindings.length) {
    console.log('     No truncation without a route, and no element showing a pointer cursor without being a');
    console.log('     control, at any of five widths in either theme.');
    console.log('');
} else {
    for (const f of sweptFindings) {
        console.log(`     ${f.scheme}/${f.width}  ${f.label}`);
        for (const t of f.unreachable.slice(0, 4)) {
            console.log(`        TRUNCATED, NO ROUTE: ${t.region}/${t.cls} "${t.shown}…" (${t.full} chars)`);
        }
        if (f.pointerNotControl) {
            console.log(`        ${f.pointerNotControl} element(s) show a pointer cursor but are not controls`);
        }
    }
    console.log('');
}

/* THE RELATIONAL QUESTION: do any two entry points land in the same place? */
console.log('\n  where each way into the record actually lands\n');
const entries = out.filter(s => /record via/.test(s.label) && s.survey);
for (const s of entries) {
    console.log(`     ${s.label.padEnd(30)} tab=${String(s.survey.activeTab || '—').padEnd(13)}` +
                `showing: ${s.survey.listsVisible.join(', ') || 'nothing'}` +
                (s.survey.timelineAt ? `  standing on: ${s.survey.timelineAt}` : ''));
    console.log(`     ${' '.repeat(30)} lit: ${s.survey.pressed.join('  +  ') || 'nothing'}`);
}
const seen = new Map();
for (const s of entries) {
    /* The scrub position is part of the destination when the timeline is what is showing — see `timelineAt` in
       the survey for why that is a sharpening of this check rather than a loosening of it. */
    const k = `${s.survey.activeTab}|${s.survey.listsVisible.join(',')}|${s.survey.timelineAt ?? ''}`;
    seen.set(k, [...(seen.get(k) || []), s.label]);
}
const dupes = [...seen.values()].filter(g => g.length > 1);
console.log();
if (dupes.length) {
    for (const g of dupes) {
        console.log(`     SAME DESTINATION: ${g.join('  ==  ')}`);
    }
    console.log('\n     Two controls that land identically are one control with two labels.\n');
} else {
    console.log('     Every entry point lands somewhere different.\n');
}
