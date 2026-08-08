'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { score, terms as splitTerms, SEARCH_LIMIT } from '../../lib/search';
import type { SearchResponse, SearchRow } from '../../lib/search';
import { humanDate, humanMinutes, projectColor } from './ui';

/**
 * FINDING THINGS. A command palette, hand-built, and the reason it is hand-built is the whole point.
 *
 * ==================================================================================================
 * WHY NOW, AND NOT BEFORE
 * ==================================================================================================
 *
 * This was deferred once, on evidence: `docs/RESEARCH.md` §27.5 found no research supporting a search box over a
 * list of eleven rows, and eleven rows is what the hub held. That was correct then and it **expires** — the plan
 * audit gave it a trigger rather than an ordinal: *"it moves the moment the queue passes 40 open tasks or 8
 * projects with open work"*. The hub is built for fifteen projects filing daily, at which point the queue is a
 * hundred rows and Tab is the only path through it.
 *
 * ==================================================================================================
 * NO DEPENDENCY, AND THAT IS NOT AUSTERITY
 * ==================================================================================================
 *
 * This project has four runtime dependencies. `docs/RESEARCH.md` §13 is the argument: every dependency is a
 * thing that breaks while he is not looking, and this tool has to still work in a year with nobody maintaining
 * it. A command-palette package is a list with a text box in it plus a fuzzy matcher, and adding one would be
 * the worst trade in the codebase — the whole of what is below has no build step and no upgrade path to keep
 * clear of.
 *
 * The matcher is deliberately SUBSTRING and not fuzzy, and the ranking is three tiers. Both arguments now live
 * in lib/search.ts, which is where the ranking had to move to.
 *
 * ==================================================================================================
 * IT SEARCHES THE DATABASE NOW, AND THAT IS A CORRECTION RATHER THAN AN ADDITION
 * ==================================================================================================
 *
 * What used to be here, defended at length, was: *"Open tasks, open decisions, finished tasks, projects, and
 * the hub's own destinations. All of it out of the arrays `Board` already holds — no fetch, no endpoint, no
 * index. That is what makes it instant and it is also what keeps it honest: it can only find things the page
 * could already show, so a result can never be a promise the hub cannot keep."*
 *
 * Every word of that was true, and the fact it rested on has gone. The page used to hold the WHOLE record;
 * it now holds a window of the most recent `RECORD_WINDOW` completions and decisions, because at two years of
 * his own measured rate the whole record was 2.4 MB of HTML and a two-second server render. An index over
 * that window would have gone on working perfectly for everything recent and silently stopped finding
 * anything older — no error, no empty state, no failing check. `docs/ITERATION-LOG.md` §XXV is the
 * measurement; check **S1** in tests/use-it.mjs is what holds it.
 *
 * So the corpus is `/api/ui/search`, and it is LARGER than what was here before rather than smaller: every
 * finished task's `verify` and `gotchas` are searchable now (they were only searchable on open tasks, because
 * the finished rows in the payload never carried them), and answered DECISIONS are searchable at all for the
 * first time — they were in the payload the whole time and this component was simply never handed them.
 *
 * WHAT STAYS LOCAL, and it is not an inconsistency: the hub's own destinations and the project list. Those
 * are static or already in the payload, bounded, and asking a server about them would put a network round
 * trip between him and the word "timeline". They are scored with the SAME function the server scores rows
 * with — `score` in lib/search.ts — which is the only reason two lists can be merged into one ranking.
 */

/** What a result does when he presses Enter on it. */
export type PaletteAction =
    | { kind: 'task'; id: string }
    | { kind: 'decisions' }
    | { kind: 'project'; slug: string }
    | { kind: 'record'; focus: 'tasks' | 'decisions' | 'marks' | 'said' | 'timeline' }
    | { kind: 'queue' }
    | { kind: 'compose' }
    | { kind: 'href'; href: string };

interface Row {
    /** Stable key and `aria-activedescendant` target. */
    id: string;
    /** What kind of thing this is, shown on the row itself. See the note where it renders. */
    group: string;
    label: string;
    /** One line of context under the label, or null. */
    detail: string | null;
    /** Right-aligned metadata: an estimate, a date, a count. */
    meta: string | null;
    /** The project's hue, when the row belongs to one. */
    hue: string | null;
    action: PaletteAction;
    /** How well it matched. Server rows arrive with this; local rows are scored with the same function. */
    score: number;
}

/** What the interface calls each kind of hit, and where pressing it lands. */
function rowOf(r: SearchRow): Row {
    const shape = {
        task: { group: 'Your turn', action: { kind: 'task', id: r.id } as PaletteAction },
        blocked: { group: 'Waiting on someone else', action: { kind: 'task', id: r.id } as PaletteAction },
        /*
         * A decision lands on the DECISIONS FILTER rather than on that one card, and that is a limitation
         * stated rather than hidden: there is no per-decision route in this interface, so pointing at one
         * would mean inventing one for the palette alone. Filtering to the decisions is a real destination
         * that definitely contains what he searched for.
         */
        question: { group: 'Decisions', action: { kind: 'decisions' } as PaletteAction },
        finished: { group: 'Finished', action: { kind: 'record', focus: 'tasks' } as PaletteAction },
        decided: { group: 'Decided', action: { kind: 'record', focus: 'decisions' } as PaletteAction },
    }[r.kind];

    return {
        id: `${r.kind}-${r.id}`,
        group: shape.group,
        label: r.title,
        detail: r.detail,
        meta: r.at != null
            ? humanDate(r.at)
            /*
             * `> 0`, not `!= null`. An `accept`-only question has no options at all, and the first version
             * rendered "0 OPTIONS" beside "I am about to delete the 3,400 orphaned draft records. Fine?" —
             * a count of nothing, on the one card in the hub that is asking permission. Found by looking at
             * the screenshot, which is the fourth time that has been the method.
             */
            : r.options != null && r.options > 0
                ? `${r.options} option${r.options === 1 ? '' : 's'}`
                : [r.minutes != null ? humanMinutes(r.minutes) : null,
                    r.steps != null ? `${r.steps} step${r.steps === 1 ? '' : 's'}` : null]
                    .filter(Boolean).join(' · ') || null,
        hue: projectColor(r.project),
        action: shape.action,
        score: r.score,
    };
}

/** How long after the last keystroke the endpoint is asked. */
const DEBOUNCE_MS = 130;

export default function Palette({
    open, onClose, projects, onAction,
}: {
    open: boolean;
    onClose: () => void;
    /** Already in the page payload, bounded by how many projects exist. Searched locally. */
    projects: { slug: string }[];
    onAction: (a: PaletteAction) => void;
}) {
    const [q, setQ] = useState('');
    const [i, setI] = useState(0);
    /**
     * What the server last said, and whether the last request worked.
     *
     * `state` is three values rather than a boolean, because "nothing matched" and "the search did not
     * answer" are different sentences and the second one has to be said. An empty list for a query that
     * does match something is the hub misreporting its own contents, which is the same class of defect as
     * an optimistic "saved" — hard constraint 2. Check **S1-inj** kills the endpoint and asserts the
     * difference is visible.
     */
    /**
     * The last COMPLETE answer, and the query it answers.
     *
     * `answered` is not bookkeeping — it is what keeps the list one coherent ranking. See the comment above
     * `results`: rendering the local rows for the query he has typed while the server rows still describe the
     * previous one is how a palette reorders itself under a highlighted row.
     */
    const [hits, setHits] = useState<SearchRow[]>([]);
    const [answered, setAnswered] = useState('');
    const [capped, setCapped] = useState(false);
    const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
    const inputRef = useRef<HTMLInputElement | null>(null);
    /*
     * Where focus was before this opened, so it can be put back.
     *
     * A dialog that takes focus and does not return it leaves a keyboard user at the top of the document after
     * every Escape, which is the same defect as a skip link whose target is not focusable — the one this
     * project already fixed once and which check K3 measures. Returning focus is the whole of what makes a
     * transient overlay usable without a mouse.
     */
    const cameFrom = useRef<HTMLElement | null>(null);

    /*
     * ONE ASK PER PAUSE IN TYPING, AND OUT-OF-ORDER ANSWERS ARE DROPPED.
     *
     * The sequence number is not belt-and-braces: "harbour" is seven keystrokes, and without it the answer to
     * "harb" arriving after the answer to "harbour" would replace a correct result list with a stale one.
     * That is the classic way a search-as-you-type box ships broken, and it is invisible on a fast local
     * server and obvious on his phone.
     *
     * `AbortController` on top, so an abandoned query stops costing the server anything.
     */
    const seq = useRef(0);
    useEffect(() => {
        if (!open) return;
        const query = q.trim();
        if (!query) { setHits([]); setAnswered(''); setCapped(false); setState('idle'); return; }

        const mine = ++seq.current;
        const controller = new AbortController();
        setState('busy');
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/ui/search?q=${encodeURIComponent(query)}`,
                    { signal: controller.signal });
                const body = await res.json() as SearchResponse;
                if (mine !== seq.current) return;
                if (!res.ok || !body.ok) { setState('error'); return; }
                setHits(body.rows ?? []);
                setAnswered(query);
                setCapped(!!body.capped);
                setState('ok');
            } catch (e) {
                /* An abort is not a failure. Anything else is, and it must not look like "nothing matched". */
                if ((e as Error)?.name === 'AbortError') return;
                if (mine === seq.current) setState('error');
            }
        }, DEBOUNCE_MS);

        return () => { clearTimeout(timer); controller.abort(); };
    }, [q, open]);

    /**
     * The hub's own destinations, as searchable things — plus the projects.
     *
     * This is the half a search box usually leaves out, and it is the half that matters most here: the record
     * has five tabs, `/looks` has three sections and there is a time machine, and every one of them is reached
     * by pressing a specific figure in a specific column. Naming them makes the interface addressable —
     * "timeline" is a thing you can type, rather than a thing you have to remember is behind the word "since".
     *
     * The extra words in each haystack are what he would actually type. "history" for the timeline, "theme"
     * and "colour" for looks: the palette should find the thing by the name he has for it, not only by the
     * name the interface has for it.
     */
    const local = useMemo(() => {
        const out: (Row & { hay: string })[] = [];
        for (const p of projects) {
            out.push({
                id: `p-${p.slug}`, group: 'Projects', label: p.slug, detail: 'Show only this project',
                meta: null, hue: projectColor(p.slug), action: { kind: 'project', slug: p.slug },
                score: 0, hay: p.slug.toLowerCase(),
            });
        }
        const go: [string, string, PaletteAction, string][] = [
            ['What needs you', 'Back to the queue', { kind: 'queue' }, 'queue tasks home back'],
            ['Everything you have finished', 'The record', { kind: 'record', focus: 'tasks' }, 'record done history'],
            ['Decisions you have made', 'The record', { kind: 'record', focus: 'decisions' }, 'decided answered'],
            ['Your marks', 'The record', { kind: 'record', focus: 'marks' }, 'marks badges achievements'],
            ['What you have told the agents', 'The record', { kind: 'record', focus: 'said' }, 'notes said told'],
            ['Stand anywhere in your record', 'The time machine',
                { kind: 'record', focus: 'timeline' }, 'timeline history when level rank past'],
            ['Tell an agent something', 'Write a message', { kind: 'compose' }, 'note message compose write'],
            ['Looks', 'Palettes, crest finishes and page surfaces',
                { kind: 'href', href: '/looks' }, 'looks theme colour palette crest surface unlock perks'],
            ['Adding a project', 'The command and the prompt',
                { kind: 'href', href: '/setup' }, 'setup install onboard agents.md snippet'],
        ];
        for (const [label, detail, action, extra] of go) {
            out.push({
                id: `g-${label}`, group: 'Go to', label, detail, meta: null, hue: null, action,
                score: 0, hay: `${label} ${detail} ${extra}`.toLowerCase(),
            });
        }
        return out;
    }, [projects]);

    /*
     * ==================================================================================================
     * ONE COHERENT RANKING, WHICH MEANS THE LIST DESCRIBES `answered` AND NOT `q`
     * ==================================================================================================
     *
     * The obvious implementation scores the local rows against what he has typed and merges whatever the
     * server has said so far. Photographed at 1920 with "a" in the box, that produced ELEVEN results, all of
     * them destinations and projects — the local half, rendered instantly, with the server's forty tasks
     * still in flight. `npm run shots -- --find` filed it as evidence of a search.
     *
     * The picture was the small half of the problem. The list would then GROW AND RE-SORT under a highlighted
     * row: type "har", see "harbour-lights" selected, press Enter, and if the server's answer landed in
     * between, the row at index 0 is now a task and he has opened something he did not choose. That is the
     * same defect as a queue that reorders under his thumb, on the one control whose whole job is to be
     * pressed quickly.
     *
     * So the rendered list is always a complete answer to ONE query — `answered`, the last query the server
     * has replied about — and both halves are scored against that. While a newer query is in flight the
     * previous complete list stays on screen (no flicker, no empty state, nothing moves), and when the reply
     * lands the whole list swaps at once. Enter always activates the row he is looking at.
     *
     * The cost, stated: the list is up to one round trip behind the box. That is how every search box he uses
     * behaves, and it is the honest version — a partial list presented as the answer is the same class of
     * thing as an optimistic "saved".
     */
    const results = useMemo(() => {
        /*
         * EMPTY QUERY SHOWS THE DESTINATIONS, not the first twenty tasks.
         *
         * An empty palette full of tasks is a second copy of the queue, which is two feet away and better at
         * being the queue. What an empty palette should answer is "what can I do from here", and that is the
         * list of places — which is also how he learns the destinations exist at all.
         */
        if (!q.trim()) return local.filter(r => r.group === 'Go to');
        /*
         * A NON-EMPTY BOX WITH NO ANSWER YET SHOWS NOTHING, and this is the second thing the screenshot
         * caught. Falling through to the destination list here put all nine of them under a box containing
         * "a" — an unfiltered list presented as the result of a query. "Searching…" is the true answer while
         * it is true, and there is nothing else to keep on screen because this is the first reply.
         */
        if (!answered) return [];
        const ts = splitTerms(answered);
        if (!ts.length) return local.filter(r => r.group === 'Go to');
        /* One ranking over both lists. The local rows are scored with the same function the server used. */
        const scored: Row[] = local
            .map(r => ({ ...r, score: score(r.hay, ts) }))
            .filter(r => r.score > 0);
        return [...scored, ...hits.map(rowOf)]
            .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
            .slice(0, SEARCH_LIMIT);
    }, [local, hits, answered, q]);

    /* Reset to the top whenever the LIST changes — keyed on `answered` rather than on `q`, because the list
     * does not change until the answer does. Keying it on every keystroke would snap the highlight back to
     * the top while he was still arrowing down a list that had not moved. */
    useEffect(() => { setI(0); }, [answered]);

    useEffect(() => {
        if (!open) return;
        cameFrom.current = document.activeElement as HTMLElement | null;
        setQ('');
        setI(0);
        setHits([]);
        setAnswered('');
        setState('idle');
        /* The frame delay is not superstition: the input does not exist until this render commits. */
        const id = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open]);

    if (!open) return null;

    const activate = (row: Row | undefined) => {
        if (!row) return;
        onAction(row.action);
        onClose();
        /* Focus goes back where it was, unless the action navigated away. */
        if (row.action.kind !== 'href') cameFrom.current?.focus?.();
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setI(n => Math.min(results.length - 1, n + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setI(n => Math.max(0, n - 1)); }
        else if (e.key === 'Home') { e.preventDefault(); setI(0); }
        else if (e.key === 'End') { e.preventDefault(); setI(results.length - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); activate(results[i]); }
        else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            cameFrom.current?.focus?.();
        }
    };

    /*
     * WHAT AN EMPTY LIST MEANS, said in the words for the reason it is empty.
     *
     * Three cases and they are not interchangeable. Still waiting on the server is not "nothing matched"; a
     * failed request is not "nothing matched" either, and reporting it as one would be the hub quietly
     * claiming its record does not contain something it does contain.
     */
    /*
     * AND THE THREE OF THEM DO NOT LOOK ALIKE, which they did until §XXVII rendered them.
     *
     * Every one of these was one 14px `--dim` line at the top left of a 660px void — the box was a fixed 76vh
     * whatever it held (see `.palwrap` in globals.css) — so "the search broke" and "your record does not contain
     * that" were the same picture with different words in it. The words were right and nothing else was.
     *
     * The failure takes `--bad`, which is what a refused write is already in, because it is the only one of the
     * three that means something is WRONG rather than something is absent. `--bad` on a panel is an asserted pair
     * (prove:palette), so this is the existing vocabulary rather than a new colour.
     */
    const nothing = results.length === 0 ? (
        state === 'error'
            ? { text: 'Search could not answer. Try again — nothing is wrong with your record.', bad: true }
            : state === 'busy'
                ? { text: 'Searching…', bad: false }
                /* `answered`, not `q`: the sentence names the query the empty list is about, and while a newer
                 * one is in flight those are different strings. Quoting the box back at him over a result set
                 * that describes something else is a small untruth on the only line there is to read. */
                : { text: `Nothing matches “${answered || q}”. Every word has to match — try fewer.`, bad: false }
    ) : null;

    return (
        /*
         * The backdrop closes it, and it is a real button so a keyboard can too — via Escape, which is what a
         * keyboard user actually presses. `aria-hidden` on the backdrop so a screen reader is not offered a
         * "close" control that duplicates Escape and the dialog's own semantics.
         */
        <div className="palwrap" data-measure="palette">
            <div className="palscrim" aria-hidden="true" onClick={onClose} />
            <div
                className="palbox"
                role="dialog"
                aria-modal="true"
                aria-label="Find a task, a decision, or anywhere in the hub"
                onKeyDown={onKey}
            >
                {/*
                  * THE FIELD AND THE ONE PIECE OF MOTION IN HERE.
                  *
                  * The bar is a sibling of the input rather than a border on it, so it can be absolutely
                  * positioned over the input's own bottom edge: appearing and disappearing must not move the
                  * list, and a 2px element in the flow would move everything under it twice per query.
                  *
                  * WHY MOTION IS LEGAL HERE, since §2.3 forbids it on anything carrying truth: the bar carries
                  * nothing. It states that a request is in flight, which is presence — the same category as a
                  * row arriving or the level-up strike — and it is the honest answer to the state the palette
                  * was previously reporting as an empty void with the word "Searching…" in the corner. Nothing
                  * about the RESULTS moves: the list still swaps in one frame when a complete answer lands.
                  */}
                <div className="palfield">
                <input
                    ref={inputRef}
                    className="palinput"
                    type="text"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Find a task, a decision, a project…"
                    data-measure="palette-input"
                    /*
                     * A combobox over a listbox, with `aria-activedescendant`.
                     *
                     * The alternative is moving DOM focus onto each option as it is highlighted, which breaks
                     * typing: focus leaves the input, so the next character goes nowhere. `activedescendant` is
                     * the pattern that exists for exactly this, and it is the reason the options are not
                     * focusable elements.
                     */
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="pal-list"
                    aria-autocomplete="list"
                    aria-activedescendant={results[i]?.id}
                    autoComplete="off"
                    spellCheck={false}
                />
                {state === 'busy' && <span className="palbusy" data-measure="palette-busy" aria-hidden="true" />}
                </div>

                <ul
                    className="pallist"
                    id="pal-list"
                    role="listbox"
                    data-measure="palette-list"
                    /* So a screen reader is told the list is being fetched rather than reading a stale one as
                     * though it were the answer. */
                    aria-busy={state === 'busy'}
                >
                    {nothing && (
                        <li
                            className={`palnone${nothing.bad ? ' bad' : ''}`}
                            role="presentation"
                            data-measure="palette-none"
                        >
                            {nothing.text}
                        </li>
                    )}
                    {results.map((r, n) => (
                            <li key={r.id} role="presentation">
                                <div
                                    id={r.id}
                                    role="option"
                                    aria-selected={n === i}
                                    className={`palrow${n === i ? ' on' : ''}`}
                                    data-measure="palette-row"
                                    /* `onMouseDown` rather than `onClick`: a click on an option would first blur
                                     * the input, and blur-driven closing is how a palette dismisses itself
                                     * before the click lands. */
                                    onMouseDown={e => { e.preventDefault(); activate(r); }}
                                    onMouseEnter={() => setI(n)}
                                >
                                    {r.hue
                                        ? <span className="pdot" style={{ background: r.hue }} />
                                        : <span className="pdot palgo" />}
                                    <span className="palbody">
                                        <span className="pallabel">{r.label}</span>
                                        {r.detail && <span className="paldetail">{r.detail}</span>}
                                    </span>
                                    {/*
                                      * WHAT KIND OF THING THIS IS, per row — NOT as a heading above a run of them.
                                      *
                                      * The first version printed a heading whenever the group changed, which is
                                      * the right shape for a grouped list and the wrong one for a RANKED list.
                                      * Rendered, one query produced "YOUR TURN / GO TO / FINISHED / YOUR TURN /
                                      * DECISIONS / FINISHED / YOUR TURN" down the panel, because the results are
                                      * sorted by how well they match and the groups therefore interleave. It read
                                      * as a rendering fault.
                                      *
                                      * The fix is not to sort by group. Relevance order is the one thing a search
                                      * box must not give up — a box that shows a worse match above a better one
                                      * because of what category it is in is a box you stop trusting. So the group
                                      * travels WITH the row, which is also the more useful placement: what you
                                      * need to know about a result is whether it is a task, a decision, a
                                      * finished thing or a destination, and you need it on the row you are
                                      * looking at.
                                      */}
                                    <span className="palkind">{r.group}</span>
                                    {r.meta && <span className="palmeta">{r.meta}</span>}
                                </div>
                            </li>
                    ))}
                </ul>

                <p className="palfoot">
                    <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
                    {/* Said only when the cap actually bites — a permanent caveat is a caveat nobody reads, and
                        this is the same rule the unestimated-tasks note on the time filter follows. */}
                    {(capped || results.length === SEARCH_LIMIT)
                        && <> · showing the first {SEARCH_LIMIT} — type more to narrow it</>}
                </p>
            </div>
        </div>
    );
}
