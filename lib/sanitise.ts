/**
 * AGENT-AUTHORED TEXT, MADE SAFE TO PUT IN FRONT OF A HUMAN WHO IS ABOUT TO PRESS ALLOW.
 *
 * ==================================================================================================
 * WHY THIS IS ITS OWN MODULE AND WHY IT IS NOT PARANOIA
 * ==================================================================================================
 *
 * The permission relay renders a tool name and a preview of that tool's own input on his phone, with an
 * Allow button under it. Every character of that is written by an agent — and an agent that has read a web
 * page, a README, a dependency's changelog or an issue comment is an untrusted author. The text is not
 * merely unvalidated; it is the exact place an attacker would aim, because the payoff is a human tapping
 * Allow on something other than what he believes he is allowing.
 *
 * Anthropic hardened precisely this class in public, and `docs/BRIEF-NOTHING-BLOCKED.md` §3.2 names it as a
 * non-negotiable: *"strip direction-override and invisible characters, cap the length, elide the rest. Treat
 * it as hostile."*
 *
 * The concrete attacks this closes:
 *
 *   **Direction override.** `U+202E` (RIGHT-TO-LEFT OVERRIDE) and its siblings reorder the RENDERED text
 *   without changing the string, so one string can display as a different one. A reviewer reads the display
 *   and approves the bytes.
 *
 *   **Invisible characters.** Zero-width spaces and joiners let one displayed word be several different
 *   strings, so a command and a lookalike command render identically and only one matches any rule anybody
 *   wrote. Unicode TAG characters (`U+E0000`–`U+E007F`) are worse: they encode a complete ASCII alphabet
 *   that renders as nothing at all, which is how one sentence carries a second sentence nobody can see.
 *
 *   **Variation selectors**, the same idea in a different code range, 256 of them, a byte each.
 *
 *   **Control characters.** A carriage return lets a payload overwrite the line above it in a terminal, and
 *   an escape byte begins an ANSI sequence.
 *
 * ==================================================================================================
 * IT IS CLEANED ON THE WAY IN, NOT ON THE WAY OUT
 * ==================================================================================================
 *
 * The row that goes into `approvals` is already clean. That is deliberate, and it is the difference between
 * one safe boundary and four: the same string is rendered by a React page, by a Telegram HTML message, by
 * `cc`'s terminal output and by whatever gets added next, and a rule applied at each render site is a rule
 * the next render site forgets. `lib/store.ts` cleans at the boundary for the same reason it validates there.
 *
 * ==================================================================================================
 * AND IT SAYS WHEN IT REMOVED SOMETHING
 * ==================================================================================================
 *
 * `removed` is returned, and the interface prints it. A payload that arrived carrying eleven invisible
 * characters is a fact he should have BEFORE tapping Allow — silently cleaning it would hide the single
 * strongest signal that this particular request is not what it appears to be. Quietly making hostile input
 * safe teaches nobody anything; saying *"11 characters that render as nothing were removed"* is the honest
 * version, and it is the same principle as reporting a refused write with the server's own reason.
 *
 * No imports, so `tests/*.mjs` can load it through Node's type-stripping. See AGENTS.md trap 2.
 */

/*
 * Written as explicit \u escapes rather than as literal characters, and that is not a style choice: every
 * character in these classes is invisible or reorders its neighbours, so a literal class is unreviewable in
 * a diff and unfixable when one member of it is wrong. An escape can be read.
 */

/**
 * Bidirectional controls and explicit direction overrides.
 *
 * `U+061C` (ARABIC LETTER MARK) is here as well as the obvious marks and isolates — it is a direction control
 * that postdates most published lists, so it is exactly the one a list written from memory leaves out.
 */
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * Characters that occupy no visible space.
 *
 * `U+00AD` (SOFT HYPHEN) renders as nothing mid-word in most contexts. `U+2060`–`U+2064` are the invisible
 * operators, which exist for mathematical typesetting and here only as a way to hide a difference between two
 * strings that look the same. `U+3164` and `U+FFA0` (HANGUL FILLER) are included because they are printable,
 * width-bearing and blank, which is the combination that gets them missed.
 */
const INVISIBLE = /[\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200D\u2060-\u2064\u206A-\u206F\u3164\uFEFF\uFFA0]/gu;

/** The TAG block — a complete invisible ASCII alphabet, and the reason this module exists at all. */
const TAG_CHARS = /[\u{E0000}-\u{E007F}]/gu;

/** Variation selectors, both planes. */
const VARIATION = /[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu;

/** C0 and C1 controls. Whitespace is handled separately — see the note in `sanitiseForDisplay`. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/**
 * Unpaired surrogates. Not an attack so much as a way to make a string unserialisable — a lone half survives
 * a JSON parse and then throws somewhere unrelated, which is a denial of service against the one message
 * that has to arrive.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Every whitespace run, including the Unicode spaces, collapsed to one plain space. */
const WHITESPACE = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu;

export interface Sanitised {
    /** Safe to render anywhere. Never empty — see `fallback`. */
    text: string;
    /** How many characters were stripped as hostile. Rendered, not swallowed. */
    removed: number;
    /** True when the value was longer than the cap and the tail was elided. */
    elided: boolean;
}

/**
 * Strip, collapse, cap.
 *
 * @param cap      Maximum characters kept. The tail becomes an ellipsis, so the result is never longer than
 *                 `cap` and a caller sizing a layout around it cannot be surprised.
 * @param fallback What to return when nothing survives. A payload that was ENTIRELY invisible characters must
 *                 not render as an empty string beside an Allow button — a blank label reads as a rendering
 *                 bug and invites exactly the tap a hostile payload is fishing for.
 */
export function sanitiseForDisplay(
    value: unknown, cap = 160, fallback = '(nothing printable)',
): Sanitised {
    const raw = typeof value === 'string' ? value : value == null ? '' : String(value);

    /*
     * THE COUNT IS MEASURED ACROSS THE STRIPS ALONE, before whitespace is touched.
     *
     * Folding the whitespace collapse into it would report "3 characters removed" for a preview that merely
     * contained three spaces in a row — a false alarm on the one indicator here that has to mean something.
     * A removal count that cries wolf is one he stops reading, and then the real one arrives looking like
     * the noise.
     */
    const stripped = raw
        .replace(LONE_SURROGATE, '')
        .replace(TAG_CHARS, '')
        .replace(VARIATION, '')
        .replace(BIDI, '')
        .replace(INVISIBLE, '')
        .replace(CONTROL, '');
    const removed = [...raw].length - [...stripped].length;

    /* Collapsed AFTER the strips, and the ordering matters: a newline counts as whitespace here rather than
     * as a control, so two lines become two words with a space between them instead of one fused word. */
    const cleaned = stripped.replace(WHITESPACE, ' ').trim();

    if (!cleaned) return { text: fallback, removed, elided: false };

    const chars = [...cleaned];
    if (chars.length > cap) {
        return { text: `${chars.slice(0, Math.max(1, cap - 1)).join('')}…`, removed, elided: true };
    }
    return { text: cleaned, removed, elided: false };
}

/**
 * A tool NAME, which is narrower than a preview and is treated as such.
 *
 * A real tool name is an identifier — `Bash`, `Write`, `mcp__linear__create_issue`. So this does not merely
 * sanitise it, it CONSTRAINS it to the identifier alphabet: anything outside `[A-Za-z0-9_.:-]` is dropped
 * rather than cleaned. The name is the most prominent word in the notification and the one he pattern-matches
 * on, which makes it the worst possible place to accept an arbitrary printable string that happens to survive
 * the strips above.
 *
 * Falls back to `unknown-tool` rather than to an empty label, for the reason `sanitiseForDisplay` gives.
 */
export function sanitiseToolName(value: unknown): string {
    const cleaned = sanitiseForDisplay(value, 60, '').text.replace(/[^A-Za-z0-9_.:-]/g, '');
    return cleaned.slice(0, 60) || 'unknown-tool';
}
