/**
 * A MESSAGE, CLAMPED TO FOUR LINES WITH A CONTROL THAT OPENS IT.
 *
 * ==================================================================================================
 * WHY THIS IS NOT JUST A CSS CLASS
 * ==================================================================================================
 *
 * His complaint was *"the latest messages are cropped and I cannot open them fully"*, and there were two
 * causes. The one that mattered most was that the text had never been stored — `REPORT_BODY_MAX` was 400
 * characters, so there was nothing to open. This component is the other half: what to do about prose that is
 * legitimately longer than the space a row can spend on it.
 *
 * A `line-clamp` on its own would have been the wrong fix and a deliberate defect. `npm run audit` walks
 * every page at five widths in both themes asserting **no truncation without a route** — text cut visually
 * with no control to reveal it is precisely what that check catches, and it has caught real ones.
 *
 * ==================================================================================================
 * `<details>` AND NOT A useState TOGGLE
 * ==================================================================================================
 *
 * No `'use client'`, so this renders inside a server component and costs no JavaScript. It is keyboard
 * reachable, it is announced as expandable by a screen reader, and it survives with JS disabled. A React
 * toggle would need a client boundary around every row on a page that can hold forty of them.
 *
 * SHORT MESSAGES ARE NOT WRAPPED AT ALL. A disclosure around two lines of text is a control that does
 * nothing — `docs/RESEARCH.md` §14's rule — so the threshold check happens here and the plain element is
 * returned instead. The threshold is on CHARACTERS while the clamp is on LINES, which is a deliberate
 * mismatch: the clamp has to be a line count because prose wraps differently at every width, and the
 * threshold has to be cheap because it runs per row on the server. Erring toward wrapping something that
 * turns out to fit costs a reader one unnecessary "show all of it"; erring the other way costs them the text.
 */
export default function SayMore({ text, className, measure }: {
    text: string;
    className?: string;
    /** Kept on the element that holds the words, so a check reads the same node either way. */
    measure?: string;
}) {
    /* Four clamped lines is roughly 280 characters at the widths this renders in. 320 leaves a margin, so a
     * message that would have shown in full does not get a control it does not need. */
    if (text.length <= 320) {
        return <span className={className} data-measure={measure}>{text}</span>;
    }
    return (
        <details className="saymore">
            <summary>
                <span className={className} data-measure={measure}>{text}</span>
                {/* The word is drawn by CSS from `[open]`, so one element says both states and neither can
                    drift from what pressing it does. `aria-hidden` because `details` already announces
                    itself as expanded or collapsed and this would be a second, worse version of that. */}
                <span className="sayopen" aria-hidden="true" />
            </summary>
            <span className="sayrest" />
        </details>
    );
}
