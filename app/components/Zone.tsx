'use client';

import { useEffect } from 'react';
import { act } from './ui';

/**
 * TELL THE HUB WHICH TIMEZONE THIS BROWSER IS IN, once, and never ask.
 *
 * ==================================================================================================
 * WHY A DETECTOR AND NOT A SETTING
 * ==================================================================================================
 *
 * Every absolute time in this hub was UTC. The reason was good — a server-rendered page whose dates are
 * formatted from the machine's own timezone produces one string in Node and another in the browser, which is
 * a hydration mismatch in the part of the interface whose entire job is to be trusted — and the result was
 * still wrong for the person reading it: he is in Georgia, UTC+4, and the chart of his own night was four
 * hours out of step with his own clock.
 *
 * The obvious answer is a settings page with a timezone dropdown. That is a worse answer, because **the
 * browser already knows**. `Intl.DateTimeFormat().resolvedOptions().timeZone` is the fact, exactly, with no
 * question asked and nothing to keep up to date. A dropdown would be a setup step for something a machine
 * can supply, and this project's rule for a new field is that it has to remove a step from somebody's day.
 *
 * ==================================================================================================
 * IT WRITES ONCE, AND ONLY WHEN IT DISAGREES
 * ==================================================================================================
 *
 * `stored` is what the SERVER used to render the page it is sitting in. When they match — every load after
 * the first — this does nothing at all: no request, no state, no render. It writes when they differ, which
 * is once on a new hub and once more if he moves country.
 *
 * A render that writes is a render that can be retried, so this deliberately does NOT do it during rendering:
 * it is an effect, after paint, and the page he is looking at keeps whatever zone the server used until the
 * next load. One stale render is the correct price for never writing inside a render.
 *
 * ==================================================================================================
 * WHAT HAPPENS IF IT FAILS
 * ==================================================================================================
 *
 * Nothing visible. The hub renders in UTC, which is what it did for its whole life until now, and the times
 * are consistent with each other. A failed detection must not produce a page that half-agrees with itself,
 * and it cannot: the zone is read once per render and used everywhere in it.
 */
export default function Zone({ stored }: { stored: string }) {
    useEffect(() => {
        let zone: string | undefined;
        try {
            zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            /* An engine with no zone database. Nothing to say and nothing to do. */
            return;
        }
        if (!zone || zone === stored) return;
        /* Fire and forget, and genuinely so: nothing on screen depends on the answer, and a failed write
         * costs a page rendered in the zone it was already using. The server validates the value against
         * the platform's own database before storing it — see `validTimezone`. */
        void act({ action: 'zone.set', zone });
    }, [stored]);

    return null;
}
