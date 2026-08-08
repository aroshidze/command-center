/**
 * The forty lines of DevTools protocol that both tests/measure-layout.mjs and tests/shoot.mjs need.
 *
 * Extracted once there were two callers, not before. The reason to share it is not tidiness: it is that a
 * measurement harness and a screenshot harness which drive the browser DIFFERENTLY can disagree about what
 * the page looked like, and then you have two accounts of one screen and no way to tell which is lying.
 * One transport, one cookie, one wait-for-render.
 *
 * Still deliberately not Playwright. A browser download for a page this small is not a trade worth making,
 * and Chrome is already installed on this machine.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

export async function launch({ base, token, port, extraArgs = [] }) {
    if (!CHROME) { console.error('No Chrome found.'); process.exit(1); }
    if (!token) { console.error('CC_WEB_TOKEN is required to open the hub.'); process.exit(1); }

    const profile = mkdtempSync(join(tmpdir(), 'cc-cdp-'));
    const chrome = spawn(CHROME, [
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        ...extraArgs, 'about:blank',
    ], { stdio: 'ignore' });

    const cleanup = () => {
        try { chrome.kill(); } catch { /* gone */ }
        try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked, harmless */ }
    };
    process.on('exit', cleanup);

    /** Chrome takes a moment to open its debugging port; poll rather than guess a sleep duration. */
    let wsUrl = null;
    for (let i = 0; i < 40 && !wsUrl; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl;
        } catch { /* not up yet */ }
        if (!wsUrl) await new Promise(r => setTimeout(r, 250));
    }
    if (!wsUrl) { cleanup(); throw new Error('Chrome did not open its debugging port'); }

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));

    let nextId = 1;
    const pending = new Map();
    /* Protocol EVENTS, as opposed to command replies. Needed to intercept a request and answer it with a
     * deliberate 500 — which is how tests/use-it.mjs proves the interface does not hide a refused write. */
    const listeners = new Map();
    ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
        if (msg.method && listeners.has(msg.method)) {
            for (const fn of listeners.get(msg.method)) fn(msg.params);
        }
    });
    const onEvent = (method, fn) => {
        if (!listeners.has(method)) listeners.set(method, new Set());
        listeners.get(method).add(fn);
        return () => listeners.get(method).delete(fn);
    };
    const send = (method, params = {}, sessionId) => new Promise(res => {
        const id = nextId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (m, p) => send(m, p, sessionId);

    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setCookies', {
        cookies: [{
            name: 'cc_session', value: token,
            domain: new URL(base).hostname, path: '/',
            secure: base.startsWith('https'), httpOnly: true,
        }],
    });

    async function evaluate(expression) {
        const r = await call('Runtime.evaluate', {
            expression, returnByValue: true, awaitPromise: true,
        });
        if (r.result?.exceptionDetails) {
            throw new Error(r.result.exceptionDetails.exception?.description
                || JSON.stringify(r.result.exceptionDetails));
        }
        /*
         * A PROTOCOL-LEVEL FAILURE, SAID IN ITS OWN WORDS.
         *
         * When CDP answers with `{ id, error }` rather than `{ id, result }` — the commonest cause being
         * "Execution context was destroyed" if the page navigated while this was in flight — the next line used
         * to read `r.result.result` and throw **"Cannot read properties of undefined (reading 'result')"**. That
         * message was reported by a check about the record window, blamed the assertion it happened to be
         * standing in, and said nothing about the browser. It cost a while to read twice in this session.
         *
         * A harness that mistranslates its own failures makes every intermittent flake look like a product bug.
         */
        if (!r || !r.result) {
            throw new Error('the browser refused an evaluate: ' +
                JSON.stringify(r?.error ?? r ?? null) +
                ' — usually the page navigated while this was in flight');
        }
        return r.result.result?.value;
    }

    /**
     * Navigate and wait for React to have HYDRATED, not merely for markup to exist.
     *
     * The page is server-rendered, so `.wrap` and every button are in the DOM a long time before their
     * handlers are: measured on this machine, markup lands at 20-41ms and React attaches at 68-168ms, so
     * there is a 50-130ms window in which the page looks completely ready and no control works.
     *
     * That window cost two wrong answers before it was found. It produced a screenshot of the collapsed
     * state labelled as the expanded one, and it made the keyboard check report 5 keystrokes on one run
     * and 2 on the next with no code change in between — which is worse, because a flaky measurement gets
     * explained away rather than investigated.
     *
     * The signal is React's own: it stamps `__reactFiber$…` onto the DOM node it owns when it attaches.
     * It is an internal name, so if a future React stops using it this predicate stops matching and every
     * `goto` times out loudly — which is the correct failure. A wait that silently stops waiting is how
     * this whole class of bug happens.
     */
    /*
     * "React has attached to something interactive, or there is nothing interactive to attach to."
     *
     * The first version tested the page root for a fiber, which works on the hub (a client component all
     * the way down) and never becomes true on /setup — that page is a server component whose only client
     * part is the copy button, so its root never gets a fiber and every navigation timed out. Looking for
     * a fiber ANYWHERE is the honest generalisation, and the escape hatch is for a page like the
     * signed-out screen, which has no interactive parts at all and so has nothing to wait for.
     */
    const HYDRATED = `(() => {
        const root = document.querySelector('.shell, .wrap, .locked');
        if (!root) return false;
        /*
         * BUTTONS specifically, and not "any element with a fiber".
         *
         * The second version of this looked for a React fiber anywhere in the document, and Next's own
         * development error overlay (<nextjs-portal>) is React-rendered and attaches BEFORE the
         * application tree does. So the predicate went true on a page whose buttons still did nothing,
         * and the very first click of a run was silently dropped — which is the same hydration race this
         * predicate was written to close, reintroduced by widening it.
         *
         * A page with no buttons has nothing to wait for; that is the /setup and signed-out case.
         */
        const buttons = [...document.querySelectorAll('button')].filter(b => !b.closest('nextjs-portal'));
        if (!buttons.length) return true;
        return buttons.some(b => Object.keys(b).some(k => k.startsWith('__react')));
    })()`;

    /**
     * Wait for every running animation and transition to finish.
     *
     * WHY THIS IS NOT OPTIONAL ONCE THE INTERFACE HAS MOTION
     *
     * `getBoundingClientRect` includes transforms. So a card that slides 6px into place while the measurement
     * runs reports a top edge 6px away from where it will settle — and every geometry check in
     * tests/measure-layout.mjs is a comparison of edges. That produces exactly the failure mode this harness
     * has been bitten by twice already: a number that is wrong by a little, intermittently, depending on how
     * fast the machine was that morning. The keyboard check once reported 5 keystrokes on one run and 2 on the
     * next for the same reason, and a flaky measurement gets explained away rather than investigated.
     *
     * `document.getAnimations()` covers CSS animations, CSS transitions and Web Animations alike, so this does
     * not need to know what the stylesheet is doing. Infinite animations — the emblem's slow arc — would never
     * settle, so they are excluded by checking for a finite end time; waiting on those would hang forever and
     * they do not move layout anyway.
     */
    const SETTLED = `(() => {
        const live = document.getAnimations().filter(a => {
            if (a.playState !== 'running') return false;
            const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
            // Infinite (the ambient ones) — never settles, does not affect layout, so it does not count.
            return !t || t.iterations !== Infinity;
        });
        return live.length === 0;
    })()`;

    async function settle(timeout = 3000) {
        await evaluate(`new Promise(res => {
            const t = setInterval(() => { try { if (${SETTLED}) { clearInterval(t); res(true); } } catch (e) { clearInterval(t); res(true); } }, 50);
            setTimeout(() => { clearInterval(t); res(false); }, ${timeout});
        })`);
    }

    async function goto(path = '/', { waitFor = HYDRATED, timeout = 12000 } = {}) {
        await call('Page.navigate', { url: `${base}${path}` });
        const ok = await evaluate(`new Promise(res => {
            const t = setInterval(() => { try { if (${waitFor}) { clearInterval(t); res(true); } } catch (e) {} }, 100);
            setTimeout(() => { clearInterval(t); res(false); }, ${timeout});
        })`);
        if (!ok) throw new Error(`timed out waiting for: ${waitFor}`);
        // Entrance animations run on hydration, so this belongs here rather than at each call site — a
        // measurement harness that has to remember to wait is one that will forget.
        await settle();
    }

    /**
     * Resize, and make the POINTER match the device — which it did not, for the whole life of this harness.
     *
     * `Emulation.setDeviceMetricsOverride({ mobile: true })` changes the viewport and the user-agent's idea of
     * being mobile. It does **not** change the `pointer` or `hover` media features. Measured at 390x844 with
     * `mobile: true`: `(pointer: coarse)` did not match, `(pointer: fine)` did, and `(hover: hover)` did.
     *
     * That matters more here than it would in most projects, because app/globals.css is built the other way up
     * from most stylesheets: the BASE rules are the coarse-pointer case with 44px minimum targets, and
     * `@media (pointer: fine)` tightens them to 34px for a mouse. With `fine` always matching, the tightened
     * desktop sizes applied at every width — so the 44px minimums that exist because "a mis-tap on I've done
     * this writes a lie into the database" have never been rendered, never been measured, and appear in none of
     * the phone or tablet screenshots this project has ever filed. Every one of those images shows mouse-sized
     * controls on a phone.
     *
     * tests/measure-layout.mjs states the opposite in its own comment — "`mobile: true` on the tablet is
     * deliberate: it sets a coarse pointer" — so this is a documented claim that was not true.
     *
     * Touch emulation is what actually moves those media features, so it is enabled and disabled with the
     * mobile flag rather than left to the default.
     */
    const setViewport = async (w, h, mobile) => {
        await call('Emulation.setDeviceMetricsOverride', {
            width: w, height: h, deviceScaleFactor: 1, mobile,
        });
        await call('Emulation.setTouchEmulationEnabled', {
            enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1,
        });
        /* Without this, Chrome keeps reporting `hover: hover` on a touch device — the two are set by different
         * switches, and a phone that reports hover gets every :hover rule the stylesheet has. */
        await call('Emulation.setEmitTouchEventsForMouse', {
            enabled: !!mobile, configuration: mobile ? 'mobile' : 'desktop',
        });
    };

    /** A real key press, so `:focus-visible` behaves the way it does for a person with a keyboard. */
    async function press(key, { code = key, vk = 0, modifiers = 0 } = {}) {
        await call('Input.dispatchKeyEvent', {
            type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
        });
        await call('Input.dispatchKeyEvent', {
            type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
        });
    }
    const tab = (shift = false) => press('Tab', { code: 'Tab', vk: 9, modifiers: shift ? 8 : 0 });

    return { call, evaluate, goto, settle, setViewport, press, tab, onEvent, cleanup };
}

/**
 * Open exactly ONE task — the one with the most steps, which is the one whose layout is in question.
 *
 * Retried until the DOM changes, because of the hydration race above, and scoped to a single card by
 * TITLE rather than by re-running the "most steps" search each attempt. The first version re-ran the
 * search, so once the long task opened it moved on to the next longest, and the next: all 22 tasks ended
 * up expanded and the page measured 14,577px instead of 6,532px. Retrying is right; retrying a search
 * whose answer changes under you is not.
 */
export const OPEN_LONGEST_TASK = `(async () => {
    /*
     * Read off .rowsteps, not off the row's whole textContent.
     *
     * The regex used to scan the entire row, which was safe only for as long as the only prose on a row was its
     * title. The row carries an excerpt of the agent's \`why\` now, and a \`why\` that happens to contain
     * "3 steps" would have been picked up ahead of the real count — silently selecting the wrong task to open,
     * which every measurement of the opened pane then describes. Scoped to the element that states the number.
     */
    const stepsOf = el => {
        const cell = el.querySelector('.rowsteps');
        const m = /(\\d+)\\s+steps?/.exec((cell || el).textContent || '');
        return m ? +m[1] : 0;
    };
    const tasks = () => [...document.querySelectorAll('[data-measure="task"]')];
    const best = tasks().sort((a, b) => stepsOf(b) - stepsOf(a))[0];
    if (!best) return { ok: false, why: 'no tasks rendered' };
    const steps = stepsOf(best);
    if (!steps) return { ok: false, why: 'no task on this page has steps' };

    /*
     * Identified by TITLE, and retried until the DOM changes.
     *
     * Retried because React hydrates well after the markup lands — see goto() above. Identified by title
     * rather than by re-running the "most steps" search each attempt because the first version did re-run
     * it: once the long task opened it moved on to the next longest, and the next, so all 22 tasks ended
     * up expanded and the page measured 14,577px instead of 6,532px. Retrying is right; retrying a search
     * whose answer changes under you is not.
     */
    const title = (best.querySelector('.rowtitle, .title')?.textContent || '').trim();
    const rowNow = () => tasks().find(t =>
        (t.querySelector('.rowtitle, .title')?.textContent || '').trim() === title);
    const openDetail = () => {
        const d = document.querySelector('[data-measure="detail"]');
        const h = d?.querySelector('.detailtitle');
        return d && (h?.textContent || '').trim() === title ? d : null;
    };

    for (let i = 0; i < 60; i++) {
        if (openDetail()) break;
        const r = rowNow();
        if (!r) return { ok: false, why: 'the task disappeared' };
        (r.querySelector('.rowmain') || r.querySelector('button'))?.click();
        await new Promise(res => setTimeout(res, 120));
    }
    const d = openDetail();
    const ol = d?.querySelector('ol.steps');
    return {
        ok: !!ol, steps, title,
        rendered: ol ? ol.children.length : 0,
        openCards: document.querySelectorAll('[data-measure="detail"]').length,
    };
})()`;
