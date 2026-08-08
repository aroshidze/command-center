/**
 * Numbers and dates, rendered — in a module with no imports and no `'use client'`.
 *
 * WHY THESE MOVED OUT OF app/components/ui.tsx
 *
 * They lived there, which was right while the only thing that rendered a date was a client component.
 * `lib/presence.ts` now has to produce a sentence containing one — *"Nothing has looked at harbour-lights
 * since 28 Jul"* — and that module is imported by a server page and by `tests/*.mjs`, neither of which can
 * import a `'use client'` file.
 *
 * The alternative was a second UTC date formatter six lines long, and this codebase has already paid for
 * that mistake once: `lib/colour.ts` exists because `app/setup/page.tsx` grew its own copy of
 * `projectColor` under a comment claiming the two matched. Two implementations of one rule is a second
 * truth, and the hydration argument on `humanDate` is exactly the kind of reasoning that gets lost in the
 * copy.
 *
 * ui.tsx re-exports every one of these, so every existing import site keeps working unchanged.
 */

/**
 * A COUNT, GROUPED IN THREES — "40,660" rather than "40660".
 *
 * Rendered at two years of his own measured rate for the first time (§XXVII), the crest panel read
 * **40660 pts** and the record **2190 done · 1460 decided**. Nothing is wrong with those numbers and all
 * three are harder to read than they need to be: a five-digit run has to be counted rather than seen. It is
 * not a year-two problem either — the score crosses a thousand at around ninety completions, which is
 * months away rather than years, and the score is on screen every morning.
 *
 * NOT `toLocaleString`, for the reason `humanDate` gives at length: this page is server-rendered and then
 * hydrated, and anything that formats differently in Node and in the browser is a hydration mismatch. A
 * regex over the digits is deterministic everywhere and needs no locale.
 *
 * Negative numbers are not special-cased because no figure in this hub can be one; `\B` keeps the group
 * boundary away from a leading minus in any case, so `-1234` would still come out as `-1,234`.
 */
export function humanCount(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "4h 20m" reads faster than "260 min" once the numbers get real. */
export function humanMinutes(total: number): string {
    if (total <= 0) return '';
    if (total < 60) return `${total}m`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "25 Jul". Deliberately UTC, and deliberately not `toLocaleDateString`.
 *
 * This page is server-rendered and then hydrated, so anything that formats differently in Node and in the
 * browser produces a hydration mismatch — and `toLocaleDateString` depends on both the locale and the
 * timezone of whoever is rendering. A date that renders one way on the server and another on the client is
 * a real bug in the one part of the interface whose whole job is to be trustworthy.
 *
 * The cost, stated because it is a genuine inaccuracy rather than a rounding: a task finished at 23:30 local
 * time in a timezone ahead of UTC is dated as that day in UTC, which can read as a day earlier than it felt.
 * Determinism was judged the better trade for a record whose figures have to agree with themselves.
 *
 * THE YEAR APPEARS ONLY WHEN IT IS NOT THIS ONE, and that is a truth fix rather than a formatting
 * preference. Found by rendering the hub at two years of volume and reading it: the record's opening line
 * said *"since 6 Aug"* about a completion from **August 2024**, on 6 August 2026. Not merely terse —
 * actively wrong, and wrong in the most misleading possible direction, because "6 Aug" on 6 August reads as
 * today. The whole record then looks like it was built this morning.
 *
 * `now` is injectable so a check can assert the year-suffix rule without waiting for January.
 */
export function humanDate(isoString: string, now: Date = new Date()): string {
    const d = new Date(isoString);
    const year = d.getUTCFullYear();
    const suffix = year === now.getUTCFullYear() ? '' : ` ${String(year).slice(2)}`;
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${suffix}`;
}

/** "20 min ago", "6h ago", "9 days ago". `now` injectable for the same reason as `humanDate`. */
export function humanAgo(isoString: string, now: number = Date.now()): string {
    const mins = Math.round((now - new Date(isoString).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)} days ago`;
}

/**
 * The same span WITHOUT the word "ago" — "20 min", "6h", "9 days".
 *
 * Exists because two sentences need the duration inside a clause rather than at the end of one, and
 * `humanAgo(x).replace(' ago', '')` in two places is the shape that becomes wrong the day the wording
 * changes in one of them.
 */
export function humanSpan(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    if (m < 1) return 'under a minute';
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h`;
    return `${Math.round(h / 24)} days`;
}
