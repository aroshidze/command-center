import type { ReactNode } from 'react';

/**
 * THE NAVIGATION. One bar, three destinations, on every page.
 *
 * ==================================================================================================
 * WHY THIS DID NOT EXIST, AND WHY THAT STOPPED BEING DEFENSIBLE
 * ==================================================================================================
 *
 * The hub was built as one screen with no navigation, deliberately: `docs/RESEARCH.md` §14 found that of 89
 * studied dashboards only 47% were still in use, and §22 that over 70% of use of a surface like this is a
 * five-second glance. A destination is the thing that dies. So everything lived on the board and the two other
 * routes were `.navlink` text links at the bottom of the reading pane's footer — inside a column that scrolls,
 * below the record, below the compose box, below the project list.
 *
 * That was a reasonable read of the research and it is the wrong answer now, for two reasons he named directly:
 *
 *     "if you want to open the instructions for the AI, which you can copy the prompt to, it is a text link hard
 *      to find… I'm creating this instrument so other people will be able to set this up for themselves."
 *
 * 1. **`/setup` is the FIRST thing a new person needs and it was the hardest thing to find.** The research is
 *    about surfaces you look at habitually; setup is the opposite — you need it once, urgently, before you have
 *    learnt where anything is. Burying it optimised for the wrong visit.
 * 2. **There are three destinations now, not one.** This session added the record's five tabs, a time machine and
 *    sixteen unlockable looks across three axes. "One screen" was true when there was one screen. A dozen states
 *    reached by pressing specific figures in specific columns is not fewer destinations, it is the same number
 *    with no way in.
 *
 * ==================================================================================================
 * WHAT IT COSTS, WHICH IS NOTHING
 * ==================================================================================================
 *
 * It replaces the header's title-only row rather than sitting above it, so at desktop widths it adds **no
 * height** — that row was a wordmark and a project count with a wide gap between them. And it lets the pane's
 * footer drop two text links, which GIVES BACK about 46px to a column that check L7 holds at zero spare.
 *
 * Check L3 requires six tasks to start within the first screen at 1280 with no headroom, and it still does.
 *
 * ==================================================================================================
 * WHY NOT A SIDEBAR, AND WHY NOT A HAMBURGER
 * ==================================================================================================
 *
 * A sidebar costs horizontal space permanently, and the queue-plus-pane layout already spends every pixel it has
 * — the pane is 425px at 1920 and the reading column needs the rest. Three items do not earn a column.
 *
 * A hamburger hides three things behind a press to save a row that is already there. The whole complaint being
 * answered is that navigation was hidden; hiding it behind an icon would be the same mistake with a nicer
 * animation.
 */

export type NavHere = 'hub' | 'agents' | 'looks' | 'setup';

interface Destination {
    here: NavHere;
    href: string;
    label: string;
    /** One short line, shown on the wide layout only. What this place is for, in his language. */
    hint: string;
}

/**
 * The four places, in the order a person meets them.
 *
 * `hub` first because it is what he opens; `setup` last because it is a once-per-project errand. `looks` in the
 * middle because it is the one that rewards coming back, and because putting it beside the queue is what makes
 * the unlock banner's "See what changed" land somewhere he can already see.
 *
 * `agents` sits BESIDE `looks` rather than beside the queue, and that placement is the product decision this
 * whole feature turns on. The queue answers one question — what needs him — and presence is the answer to a
 * different one: whether anything is running. Both are state he checks rather than work he does, which is the
 * same reason `looks` is a page (see the header above), so they belong together and neither belongs on the
 * board. Putting a count of quiet projects on the queue would have inflated the one surface the brief forbids
 * inflating.
 *
 * FOUR IS THE CEILING, and it is a measured one rather than a taste: check L9 holds this bar at one line for
 * every desktop width in every data state, and the fourth destination spends most of the slack the third one
 * left. A fifth would need the hints to go, and the hints are what make the bar navigable to somebody who has
 * never seen it.
 */
const DESTINATIONS: Destination[] = [
    { here: 'hub', href: '/', label: 'Your queue', hint: 'What needs you' },
    /* "Agents", not "Presence" or "Activity". It is the noun he uses, and the hint is the question the page
     * answers rather than a description of its contents. */
    { here: 'agents', href: '/agents', label: 'Agents', hint: 'Who is working' },
    { here: 'looks', href: '/looks', label: 'Looks', hint: 'What you have unlocked' },
    { here: 'setup', href: '/setup', label: 'Add a project', hint: 'The command and the prompt' },
];

export default function Nav({ here, badge, right }: {
    here: NavHere;
    /**
     * A count beside `Looks`, e.g. "6 / 16".
     *
     * Optional because `/setup` does not compute a standing and should not start doing so just to fill a badge —
     * a page that reads more than it needs is a page with more ways to fail. Absent means no badge, which is
     * honest; a zero would be a claim.
     */
    badge?: string | null;
    /**
     * The right-hand slot. The board puts its Find control and project count here.
     *
     * A slot rather than props, so this component stays free of anything interactive and can be imported by a
     * server page and a client component alike — no `'use client'`, no hooks. The one thing in the bar that needs
     * an onClick lives where its state does.
     */
    right?: ReactNode;
}) {
    return (
        /*
         * A real `<nav>` with a label. There are two landmark navigations on the board once the skip links are
         * counted, so this one says which it is rather than being announced as an anonymous "navigation".
         */
        <nav className="topnav" aria-label="Main">
            <a className="brand" href="/">
                {/*
                 * The wordmark, with a mark beside it. `aria-hidden` on the mark: the name is right there and a
                 * screen reader reading a decorative diamond before it would be noise.
                 *
                 * Not the crest. The crest is HIS — a function of his own history — and putting it in the chrome
                 * would make an identity into a logo, which is the one thing it must not become. This is a fixed
                 * mark that means "the product", drawn from the same geometry vocabulary so the two are relatives
                 * rather than strangers.
                 */}
                <span className="brandmark" aria-hidden="true" />
                <span className="brandname">Command Center</span>
            </a>

            <ul className="navlist">
                {DESTINATIONS.map(d => {
                    const current = d.here === here;
                    return (
                        <li key={d.here}>
                            <a
                                href={d.href}
                                className={`navitem${current ? ' on' : ''}`}
                                data-measure="nav"
                                data-nav={d.here}
                                /*
                                 * `aria-current="page"`, not `aria-selected`. These are links to documents, not
                                 * tabs in a widget — the distinction matters to a screen reader, which announces
                                 * the first as "current page" and the second only inside a tablist it can find.
                                 */
                                {...(current ? { 'aria-current': 'page' as const } : {})}
                            >
                                <span className="navlabel">
                                    {d.label}
                                    {d.here === 'looks' && badge && <span className="navbadge">{badge}</span>}
                                </span>
                                <span className="navhint">{d.hint}</span>
                            </a>
                        </li>
                    );
                })}
            </ul>

            {right && <div className="navright">{right}</div>}
        </nav>
    );
}
