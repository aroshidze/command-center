/**
 * FINDING THINGS, ONE RANKING, TWO CALLERS.
 *
 * ==================================================================================================
 * WHY SEARCH LEFT THE PAGE, AND WHY IT HAD TO HAPPEN BEFORE ANYTHING ELSE
 * ==================================================================================================
 *
 * `Ctrl+K` built its haystack in the browser out of the arrays `Board` already held, and the comment in
 * app/components/Palette.tsx defended that at length: no fetch, no endpoint, no index, instant, and "it can
 * only find things the page could already show, so a result can never be a promise the hub cannot keep".
 *
 * Every word of that was true and it depended on a fact that has now changed. The page used to hold the
 * WHOLE record — every finished task and every answered decision, on every load. At two years of his own
 * measured rate that is 2.4 MB of HTML and a 2 s server render, so the record now ships a window of the most
 * recent `RECORD_WINDOW` rows with their prose and everything older ships as numbers. A client-side index
 * over that window would have silently stopped finding older work: no error, no empty state, no failing
 * check, just a search box that quietly covers less than it used to.
 *
 * `docs/ITERATION-LOG.md` §XXV is the measurement, and the ordering it forced is the point — search moves
 * first, then the check that old work is still findable goes red, and only then is the payload windowed.
 * Doing it the other way round looks like progress and loses a feature.
 *
 * ==================================================================================================
 * THE RANKING LIVES HERE SO THERE IS EXACTLY ONE OF IT
 * ==================================================================================================
 *
 * Some of what the palette searches is not in the database at all — the hub's own destinations ("timeline",
 * "looks", "setup") and the project list, both of which are static or already in the payload and would be
 * absurd to ask a server about. So results come from two places and MUST be ranked by one rule, or a
 * destination and a task with equally good matches would be ordered by which array they came from.
 *
 * Hence this file: pure, no imports but a type, so the route and the client component can both use it. It
 * is also why the matcher stayed SUBSTRING rather than becoming Postgres full-text search — see `score`.
 */

/** One thing the search found. Deliberately raw: formatting a date or an estimate is the interface's job. */
export interface SearchRow {
    id: string;
    kind: 'task' | 'blocked' | 'question' | 'finished' | 'decided';
    project: string;
    title: string;
    /** One line of context: a task's `why`, a question's `context`, or what was chosen. */
    detail: string | null;
    /** A task's estimate, in minutes. */
    minutes: number | null;
    /** How many steps a task has. */
    steps: number | null;
    /** When a finished task was completed or a decision answered, ISO. */
    at: string | null;
    /** How many options an open question offers. */
    options: number | null;
    /** From `score`. The client merges these with its own rows and sorts by this one number. */
    score: number;
}

/** Everything the endpoint returns. `ok: false` is answered honestly — see the palette's empty state. */
export interface SearchResponse {
    ok: boolean;
    rows: SearchRow[];
    /** True when the per-kind cap bit, so the interface can say so rather than truncating silently. */
    capped: boolean;
    error?: string;
}

/** How many rows one query may return in total. The interface states it when it bites. */
export const SEARCH_LIMIT = 50;

/**
 * The query, split into the terms every one of which must match.
 *
 * Capped at six terms and 60 characters each. Not a security boundary — the driver parameterises these — but
 * a bound on the work a single keystroke can ask the database to do, and a `LIKE ALL` over forty terms is a
 * table scan per term.
 */
export function terms(query: string): string[] {
    return query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map(t => t.slice(0, 60));
}

/**
 * How well a query matches a haystack. Higher is better; 0 is no match.
 *
 * MOVED HERE UNCHANGED from app/components/Palette.tsx, and the reasoning that chose it is worth keeping
 * rather than being replaced by Postgres full-text search now that a database is involved:
 *
 * Three tiers and nothing else, because a ranking has to be explainable — a result appearing above another
 * has to have a reason he could work out. `ts_rank` is a weighted score over lexeme frequency and document
 * length, and the first time it puts the wrong thing first there is nothing to do about it. Substring
 * rather than stemmed, too: the haystacks are short hand-written titles, and `to_tsquery` would make
 * "stripe" stop matching "Stripe's" in one direction and start matching things it should not in the other.
 *
 * EVERY TERM MUST MATCH, so "stripe act" finds "Finish Stripe account activation" and "stripe vercel" finds
 * nothing. That is `AND` rather than `OR`, which is the behaviour of every search box he uses; `OR` would
 * make a second word widen the results, which reads as the box ignoring what you typed.
 */
export function score(hay: string, ts: string[]): number {
    let total = 0;
    for (const t of ts) {
        const at = hay.indexOf(t);
        if (at === -1) return 0;
        // 3 for the very start of the haystack, 2 for the start of any word, 1 for anywhere.
        total += at === 0 ? 3 : /[\s\-/·]/.test(hay[at - 1] ?? '') ? 2 : 1;
    }
    return total;
}

/**
 * A term as a SQL `LIKE` pattern, with the wildcards it must not carry itself.
 *
 * `%` and `_` are wildcards and a backslash is the escape character, so a query containing any of them
 * would otherwise match things it does not say. Typing `100%` into a search box is not exotic.
 */
export function likePattern(term: string): string {
    return `%${term.replace(/[\\%_]/g, c => `\\${c}`)}%`;
}
