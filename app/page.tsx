import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasWebSession } from '../lib/auth';
import { LOOKS_COOKIE, parseLooks, resolveLooks, unannounced } from '../lib/looks';
import { readLooksPreference } from '../lib/settings';
import { paletteCss } from '../lib/palettes';
import { surfaceCss } from '../lib/surfaces';
import { deriveWholeRecord, marks as marksOf, rankFor, standing as standingOf } from '../lib/progress';
import { board } from '../lib/store';
import Board from './components/Board';

export const dynamic = 'force-dynamic';

/**
 * The hub. Server-rendered so that opening it on a phone shows the list immediately rather than a
 * spinner over an empty screen — the page is read far more often than it is interacted with, and a
 * loading state is friction in exactly the place friction kills adoption (docs/RESEARCH.md §7, cause 6).
 */
export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ k?: string }>;
}) {
    const { k } = await searchParams;

    // Convenience: `/?k=…` works as well as `/api/enter?k=…`, because that is the link you will
    // inevitably paste. The token is exchanged for a cookie there and never kept in the address bar.
    if (k) redirect(`/api/enter?k=${encodeURIComponent(k)}`);

    if (!(await hasWebSession())) {
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12 }}>
                    This device is not signed in. Open the enter link once and it will stay signed in for
                    a year.
                </p>
            </div>
        );
    }

    let initial;
    try {
        initial = await board();
    } catch (e) {
        // A broken hub must say what is broken. "Something went wrong" would leave you unable to tell a
        // missing schema from a dead database, and this page is where you would look first.
        const message = e instanceof Error ? e.message : String(e);
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12, color: 'var(--bad)' }}>
                    The hub could not read its database, so this list is <strong>not</strong> trustworthy.
                </p>
                <p className="copyval" style={{ display: 'block', marginTop: 12, textAlign: 'left' }}>
                    {message}
                </p>
                <p style={{ marginTop: 12 }}>
                    If this says a relation does not exist, the schema has not been created —
                    run <code>npm run init-db</code>.
                </p>
            </div>
        );
    }

    /*
     * THE CHOSEN PALETTE, RESOLVED ON THE SERVER, IN THE FIRST HTML.
     *
     * Three things had to be true at once and this is the arrangement that gets all of them.
     *
     * NO FLASH. If the palette were applied after hydration, every load would paint the default first and then
     * swap — the standard way this ships broken. `<style precedence>` is React 19's hoisting: the element is
     * lifted into `<head>` and deduplicated, so the override is in the document before the body is painted.
     *
     * NO SECOND QUERY. The entitlement check needs his level and his marks, which come from the board data
     * already fetched above. Resolving in `app/layout.tsx` would have been tidier and would have meant calling
     * `board()` twice per request, or trusting the cookie — see below for why the second is not an option.
     *
     * THE COOKIE IS NOT TRUSTED. It is user-editable, so it is reduced to what he has actually earned before
     * anything is emitted. A locked palette must not render even for a frame; if it did, the unlock would be
     * decoration and anyone with dev tools would have all of them. `lib/looks.ts` has the full argument.
     */
    /*
     * The WHOLE record, expanded from the numbers, exactly as the browser will expand it.
     *
     * `initial.doneTasks` is a window now — the most recent `RECORD_WINDOW` completions with their prose — so
     * deriving from it directly would have quietly resolved the palette against a partial history and put a
     * locked look one level out of reach. `deriveWholeRecord` expands first, and it is a named function rather
     * than three lines here because the other two servers that wrote those three lines out both got them
     * wrong: at two years of volume `/looks` reported level 8 against this page's 32. See lib/progress.ts.
     */
    const progress = deriveWholeRecord(initial);
    const standing = standingOf(progress);
    const marks = marksOf(progress);
    const { looks } = resolveLooks(
        parseLooks(await readLooksPreference((await cookies()).get(LOOKS_COOKIE)?.value)),
        standing,
        marks,
    );
    const css = paletteCss(looks.palette);
    /*
     * The page surface, emitted the same way and for the same reasons as the palette.
     *
     * A separate `<style>` rather than one concatenated string, so React's `href` dedupe keys them independently:
     * changing the palette must not invalidate the surface's stylesheet or vice versa, and a single combined key
     * would make every change to either re-emit both.
     *
     * Every surface is built from `--s0` and `--s1` and nothing else, which is what keeps the contrast guarantee
     * structural — see the header of lib/surfaces.ts, and check C2, which measures the rendered pixels rather
     * than trusting that argument.
     */
    const surface = surfaceCss(looks.surface);

    /*
     * WHAT HE HAS EARNED AND NOT YET BEEN TOLD ABOUT — rule 3 of the perk system.
     *
     * *"An unlock never applies itself. It announces itself once and waits."* Computed on the server, from the
     * same standing and marks that resolved the palette, so the announcement cannot disagree with the
     * entitlement. Passed down rather than computed in the browser because the alternative is a banner that pops
     * in after hydration, which is a layout shift on the first screen to save nothing.
     */
    const news = unannounced(standing, marks, looks);

    return (
        <>
            {css && <style href={`cc-palette-${looks.palette}`} precedence="high">{css}</style>}
            {surface && <style href={`cc-surface-${looks.surface}`} precedence="high">{surface}</style>}
            <Board
                initial={initial}
                looks={looks}
                /*
                 * THE LEVEL TRAVELS WITH A LEVEL-GATED ANNOUNCEMENT, and that is how the hub marks a level-up he
                 * did not witness.
                 *
                 * The brief names the case: he answers a decision in Telegram, crosses a rung, and opens the hub
                 * the next morning having seen nothing. Faking the strike on load would celebrate yesterday as
                 * though it were now, so the honest route is the banner — which already announces once and waits.
                 *
                 * What makes this cover EVERY level rather than some of them is movement II. Before it, level
                 * gates stopped at 7 and a level-up above that unlocked nothing, so there was nothing for the
                 * banner to carry. Now every level from 2 upward mints exactly one perk — that is check K11 — so a
                 * level-gated announcement always exists to hang the rank on.
                 */
                news={news.map(p => ({
                    slug: p.slug,
                    kind: p.kind,
                    label: p.label,
                    atLevel: p.requires.kind === 'level' ? p.requires.level : null,
                    rank: p.requires.kind === 'level' ? rankFor(p.requires.level) : null,
                }))}
            />
        </>
    );
}
