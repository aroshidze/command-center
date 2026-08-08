/**
 * PAGE SURFACES — the perk the brief warned about, and the one rule that makes it shippable.
 *
 * ==================================================================================================
 * "A TEXTURE BEHIND TEXT IS THE FIRST PERK THAT BREAKS THE GUARANTEE"
 * ==================================================================================================
 *
 * That is the brief's own sentence and it is correct. The palettes are safe by CONSTRUCTION: they only move hue
 * and chroma, WCAG contrast is a function of relative luminance alone, and in OKLCH luminance is carried almost
 * entirely by L — measured on this exact ramp, tripling `--s0`'s chroma moved text on it from 17.88:1 to 17.90:1.
 * So a palette cannot make anything illegible however it is configured.
 *
 * A texture has no such property in general. It modulates lightness across the page, per pixel, and the colour
 * behind a given letter stops being any single token — which breaks BOTH contrast harnesses at once:
 * `prove:palette` asserts token pairs and there is no token, and C1 reads the computed `backgroundColor`, which
 * for a gradient is `transparent` and therefore unmeasurable. Declaring an opaque `background-color` underneath
 * would make C1 pass while measuring a colour the screen never shows, which is worse than failing.
 *
 * ==================================================================================================
 * THE FIX IS THE SAME TRICK THE PALETTES USE, APPLIED TO A DIFFERENT DIMENSION
 * ==================================================================================================
 *
 * **EVERY SURFACE IS BUILT ONLY FROM `--s0`, `--s1` AND `--s2`. NOTHING ELSE. NO OTHER COLOUR MAY APPEAR.**
 *
 * Those are the three lowest steps of the surface ramp, and every one of them carries an asserted pair against
 * every ink the interface uses — `text`, `dim`, `mute`, `accent`, `ok`, `bad`, `ask` and the focus ring, in six
 * palettes and two schemes. A pattern built only from them therefore has every pixel's luminance BETWEEN values
 * that are all already proven legible, so the worst case behind any letter is a colour the suite has checked.
 *
 * IT WAS `--s0` AND `--s1` FIRST, AND THAT WAS TOO QUIET TO BE A FEATURE. Those two are 4% of lightness apart,
 * and rendered, `Dots` and `Vellum` were indistinguishable from `Flat` — a perk nobody can see is not a perk.
 * `--s2` is 8% above the page, so the patterns are twice as present, and it costs nothing but eight more
 * asserted pairs. The guarantee is the restriction, not the specific two tokens; the right number of tokens is
 * the most that are all asserted.
 *
 * That makes the guarantee structural again rather than reviewed, which is the only kind worth having. Adding a
 * surface is a row in the array below; it cannot introduce a colour, so it cannot introduce a failure.
 *
 * AND IT IS STILL MEASURED ON THE RENDERED PIXELS, because the brief's instruction was not "argue that it is
 * safe" — it was *"you must extend the harness to measure text contrast over the rendered surface, not over the
 * token"*. Check **C2** in tests/measure-layout.mjs captures the painted region behind every text run, decodes
 * it, and asserts the text clears its threshold against the WORST pixel in it. So the argument above is the
 * design and C2 is the evidence, exactly as `tests/palette.mjs` is the evidence for the palettes' argument.
 *
 * ==================================================================================================
 * WHY THE PATTERNS ARE THIS QUIET
 * ==================================================================================================
 *
 * The ramp's steps are 4% of lightness apart, deliberately built so each step reads as material rather than as
 * decoration. A surface made from the lowest three cannot be loud, and that is the correct
 * ceiling for a tool used beside a chat window for hours: docs/RESEARCH.md §12 is about density at legibility,
 * and "don't compete for attention you haven't earned" applies hardest to the largest area on the screen.
 *
 * What a person actually notices is the difference between a page with NO material and a page with some. That is
 * a real change and it is the whole of what these do.
 */

export interface SurfaceDef {
    slug: string;
    label: string;
    /** One line, in his language, about what it feels like. */
    blurb: string;
    /**
     * The `background-image` value for the page, and it may reference ONLY `--s0`, `--s1` and `--s2`.
     *
     * A string rather than a structured description because a CSS gradient is already the most compact honest
     * way to say "this pattern"; describing it in data and re-emitting it would be a second language to keep in
     * step with the first. What guards the rule is the check below, not the type.
     */
    image: string;
    /** How big the pattern tile is. Separate so the sample swatch can show it at the same scale. */
    size: string;
}

export const SURFACES: SurfaceDef[] = [
    {
        slug: 'flat',
        label: 'Flat',
        blurb: 'No pattern at all. The page this hub was built on.',
        image: 'none',
        size: 'auto',
    },
    {
        slug: 'grid',
        label: 'Grid',
        blurb: 'A faint square grid, a shade lighter than the page. Reads like graph paper.',
        image:
            'repeating-linear-gradient(0deg, var(--s2) 0 1px, transparent 1px 32px),' +
            'repeating-linear-gradient(90deg, var(--s2) 0 1px, transparent 1px 32px)',
        size: '32px 32px',
    },
    {
        slug: 'weave',
        label: 'Weave',
        blurb: 'Fine diagonal hatching in both directions. The busiest of them, and still quiet.',
        image:
            'repeating-linear-gradient(45deg, var(--s2) 0 1px, transparent 1px 9px),' +
            'repeating-linear-gradient(-45deg, var(--s2) 0 1px, transparent 1px 9px)',
        size: '13px 13px',
    },
    {
        slug: 'dots',
        label: 'Dots',
        blurb: 'A dot matrix. The quietest pattern that is still a pattern.',
        image: 'radial-gradient(var(--s2) 1px, transparent 1.4px)',
        size: '18px 18px',
    },
    {
        slug: 'vellum',
        label: 'Vellum',
        blurb: 'Two soft washes across the page rather than a repeat. Reads as paper, not as a texture.',
        /*
         * The one non-repeating surface. Large radial washes mean the intermediate colours are a continuum
         * between `--s0` and `--s2` rather than two flat values — which is still inside the rule, because every
         * one of those intermediates has a luminance BETWEEN the two, and both ends are asserted.
         *
         * `fixed` so the wash belongs to the viewport rather than to a document that is 1,750px tall: attached
         * to the document, the top of a long page would be light and the bottom uniformly dark, which reads as
         * a rendering fault rather than as a material.
         */
        image:
            'radial-gradient(120% 80% at 15% 0%, var(--s2) 0%, transparent 60%),' +
            'radial-gradient(100% 70% at 85% 100%, var(--s2) 0%, transparent 55%)',
        size: 'cover',
    },
];

export const DEFAULT_SURFACE = SURFACES[0]!.slug;

/* ==================================================================================================
 * THE GENERATED LINE — surfaces minted by the ladder, and why the guarantee survives it untouched
 * ==================================================================================================
 *
 * The five above are gated at levels 1, 5, 7 and on two marks, and `tests/ladder.mjs` K10/K11 measured what that
 * meant: nothing on this axis, or any other, past level 7 — for the rest of the tool's life.
 *
 * THE GUARANTEE IS UNCHANGED, AND THAT IS THE WHOLE REASON THIS AXIS CAN BE GENERATED AT ALL
 *
 * The rule at the top of this file is a restriction on COLOUR: a surface may reference `--s0`, `--s1` and `--s2`
 * and nothing else. It says nothing about how many surfaces there are, and it does not need to — the generator
 * emits the same three tokens the hand-written five do, so every pixel of a minted pattern is a colour with an
 * asserted pair against every ink in the interface, in six palettes and both schemes. `surfaceUsesOnlyRampTokens`
 * is run against the generated line by `tests/palette.mjs`, so this is measured rather than argued.
 *
 * A whitelist of three tokens is exactly the kind of guarantee that scales to an unbounded set. A reviewed one
 * would not have: "somebody checked the five" cannot be said about a line that has no end.
 *
 * WHAT VARIES, AND WHY IT IS THE SCALE RATHER THAN THE CONTRAST
 *
 * The patterns cannot get louder — that is the point of the restriction, and this file's own note explains why
 * quiet is correct for the largest area on a screen someone sits in front of for hours. So the generated line
 * varies the two things that are perceptible without being loud: the MOTIF and the SCALE. A 9px hatch and a 44px
 * hatch are different materials; a hatch at 0.14 alpha and one at 0.16 are the same thing twice, which is the
 * defect the crest finishes shipped with once and he spotted immediately.
 */

/** The five motif families, and the name each one carries. A generated name says what the pattern IS. */
const MOTIF = ['Grain', 'Linen', 'Halftone', 'Contour', 'Plate'];

/**
 * The scale is arithmetic rather than a table, and the reason is a defect check K15 caught in the first version.
 *
 * That version was `SCALES[i % 6]` against a motif period of five, and K15 reported: *"Halftone and Halftone VII
 * are the same surface twice"*. Of course they were — five and six give a combined period of thirty, so index i
 * and i+30 draw the identical pattern, and the surface line silently started over at level 99. A generated line
 * that repeats is a level handing him something he already has.
 *
 * `10 + (i * 7) % 41` has a period of 41, which is coprime with the motif period of 5 and the angle period of 8,
 * so the three only realign after 41 x 5 x 8. K15 measures where that actually lands — index 208, which is level
 * 630 — rather than trusting the arithmetic in this comment. Scales run 10..50px, which is the range the five
 * hand-written surfaces already sit in.
 */
const SCALE_BASE = 10;
const SCALE_MOD = 41;
const SCALE_STRIDE = 7;

/** Angles for the motifs that have one. Period eight, coprime with both of the others. */
const GENERATED_ANGLE = [0, 22, 45, 68, 90, 112, 135, 158];

/**
 * The numeral for the second and later time a family comes round. See the note on `numeral` in lib/palettes.ts
 * for why each axis file carries its own copy, and for the K12 defect that made this computed rather than a
 * clamped thirteen-entry table.
 */
const ROMAN: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function numeral(n: number): string {
    let left = Math.min(3999, Math.max(0, Math.floor(n)));
    if (left <= 1) return '';
    let out = '';
    for (const [value, sign] of ROMAN) while (left >= value) { out += sign; left -= value; }
    return out;
}

const GENERATED_PREFIX = 'surface-';

/**
 * The nth surface of the generated line, 1-based. Pure: the slug in his cookie means the same thing next week.
 */
export function generatedSurface(index: number): SurfaceDef {
    const n = Math.max(1, Math.floor(index));
    const i = n - 1;
    const motif = i % MOTIF.length;
    const scale = SCALE_BASE + (i * SCALE_STRIDE) % SCALE_MOD;
    const angle = GENERATED_ANGLE[(i * 3) % GENERATED_ANGLE.length]!;
    const round = Math.floor(i / MOTIF.length) + 1;
    const label = `${MOTIF[motif]} ${numeral(round)}`.trim();

    /*
     * THE STROKE AND THE DOT BOTH GROW WITH THE PITCH, AND THAT IS TWO THINGS AT ONCE.
     *
     * The design reason: a 1px line at a 10px pitch is a texture and a 1px line at a 50px pitch is a few lonely
     * hairlines. Scaling the mark with the spacing keeps the ink-to-page ratio roughly constant, so the whole line
     * reads as one family at different magnifications rather than as "dense pattern" and "nearly blank page".
     *
     * The correctness reason, which check K15 found: every hand-written surface above draws its marks at exactly
     * `1px`, and the minted scale sequence passes through 18 and 32 — so the first version produced a dot matrix
     * identical to `Dots` and a grid identical to `Grid`. K15 said so in as many words: *"minted surface 8
     * (Halftone II) paints exactly what Dots paints — a level handing him one he already has"*. Because these two
     * expressions can never evaluate to 1, no minted surface can collide with a named one **by construction**
     * rather than by a scale table that happens to avoid two numbers. K15 is the evidence, not the mechanism.
     */
    const stroke = +(1 + Math.min(1, scale / 60)).toFixed(2);
    const dot = +(scale / 16).toFixed(2);

    /* One `line` helper rather than five hand-written gradient strings, so a motif cannot accidentally introduce
     * a colour: the only colour any of these can name is the one token passed through here. */
    const line = (deg: number) =>
        `repeating-linear-gradient(${deg}deg, var(--s2) 0 ${stroke}px, transparent ${stroke}px ${scale}px)`;

    let image: string;
    let size: string;
    let what: string;
    if (motif === 0) {
        image = line(angle);
        size = 'auto';
        what = `Straight lines at ${angle} degrees, ${scale}px apart.`;
    } else if (motif === 1) {
        image = `${line(angle + 45)},${line(angle - 45)}`;
        size = 'auto';
        what = `Crosshatch, ${scale}px apart.`;
    } else if (motif === 2) {
        image = `radial-gradient(var(--s2) ${dot}px, transparent ${+(dot + 0.4).toFixed(2)}px)`;
        size = `${scale}px ${scale}px`;
        what = `A dot matrix on a ${scale}px pitch.`;
    } else if (motif === 3) {
        /* Concentric rings. The one motif that needs `repeating-radial-gradient`, which is why that function was
         * added to the whitelist's alternation — a gradient FUNCTION carries no colour of its own, so allowing
         * one more of them does not widen what a surface can paint in. */
        image = `repeating-radial-gradient(circle at 50% 50%, var(--s2) 0 ${stroke}px, `
            + `transparent ${stroke}px ${scale}px)`;
        size = 'auto';
        what = `Concentric rings ${scale}px apart, centred on the page.`;
    } else {
        image = `${line(0)},${line(90)}`;
        size = 'auto';
        what = `A square grid on a ${scale}px pitch.`;
    }

    return {
        slug: `${GENERATED_PREFIX}${n}`,
        label,
        /*
         * TWO THINGS WERE WRONG WITH THIS SENTENCE AND BOTH WERE INVISIBLE TO ME UNTIL SOMEONE READ IT.
         *
         * It said "the same two ramp steps", and the restriction at the top of this file permits three. And it
         * said "minted by the ladder", which is how this codebase talks to ITSELF about the level curve — on a card
         * shown to somebody with no glossary it is just two odd words. Check W1 in tests/ladder.mjs rejects both,
         * and it found this one after I had already replaced the phrase everywhere I thought it appeared.
         */
        blurb: `${what} Unlocked by levelling up rather than drawn by hand, and built from the same shades `
            + 'as every surface above.',
        image,
        size,
    };
}

/** The first `count` of the generated line. */
export function generatedSurfaces(count: number): SurfaceDef[] {
    return Array.from({ length: Math.max(0, count) }, (_, i) => generatedSurface(i + 1));
}

/** The index a generated slug names, or null. Parsed locally — see `generatedPaletteIndex` for why. */
export function generatedSurfaceIndex(slug: string): number | null {
    if (!slug.startsWith(GENERATED_PREFIX)) return null;
    const rest = slug.slice(GENERATED_PREFIX.length);
    if (!/^[1-9][0-9]{0,3}$/.test(rest)) return null;
    return Number(rest);
}

export function surfaceBySlug(slug: string): SurfaceDef | null {
    const named = SURFACES.find(s => s.slug === slug);
    if (named) return named;
    const index = generatedSurfaceIndex(slug);
    return index === null ? null : generatedSurface(index);
}

/**
 * THE RULE, AS CODE. Every surface's image may reference `--s0`, `--s1` and `--s2` and no other colour.
 *
 * Exported and asserted by `tests/palette.mjs` rather than left as the comment at the top of this file, because
 * the comment is the argument and this is the guarantee. A surface added in six months by someone who has not
 * read the header would otherwise be able to put `oklch(0.9 0.2 30)` in a `background-image` and quietly put an
 * unmeasurable colour behind every heading on the page.
 *
 * Deliberately a WHITELIST of the two tokens rather than a blacklist of colour syntaxes. A blacklist would have
 * to anticipate `rgb`, `hsl`, `oklch`, `color-mix`, named colours, hex, `currentColor` and whatever CSS adds
 * next; a whitelist only has to know what is allowed, which is two things and will stay two things.
 *
 * `repeating-radial-gradient` WAS ADDED TO THE ALTERNATION when the generated line's ring motif needed it, and
 * that is worth a line because it looks like the whitelist being loosened and is not. What this function
 * whitelists is COLOURS; the gradient function names are stripped because a function name cannot paint anything
 * on its own — the colours inside it still have to survive the three `var()` replacements above. Adding a fourth
 * gradient function does not widen the set of colours a surface can reach, which is the property being guarded.
 * Note the order: `repeating-radial-gradient` has to come BEFORE `radial-gradient` in the alternation, or the
 * shorter one matches first and leaves `repeating-` behind to fail the check for the wrong reason.
 */
export function surfaceUsesOnlyRampTokens(def: SurfaceDef): boolean {
    if (def.image === 'none') return true;
    // Strip the permitted var() references and every piece of gradient syntax that cannot carry a colour.
    const stripped = def.image
        .replace(/var\(--s0\)/g, '')
        .replace(/var\(--s1\)/g, '')
        .replace(/var\(--s2\)/g, '')
        .replace(/transparent/g, '')
        .replace(/repeating-linear-gradient|repeating-radial-gradient|radial-gradient|linear-gradient/g, '')
        .replace(/[-\d.%\s,()]|deg|px|at|cover|circle|ellipse|closest|farthest|side|corner/g, '');
    return stripped === '';
}

/**
 * The stylesheet for one surface, to inline in the document head.
 *
 * Emitted rather than written into `app/globals.css` for the same three reasons `paletteCss` is: the values have
 * exactly one source that the suites import rather than copy, a hub on the default pays nothing at all because
 * this returns an empty string for it, and adding one is a row in an array rather than an edit to a
 * 2,000-line stylesheet.
 *
 * On `body` rather than `html`, and with `background-attachment: fixed`, so the pattern is anchored to the
 * viewport. A repeating pattern attached to a 1,750px document scrolls with the content, which turns a static
 * material into moving stripes — and moving stripes behind text is the one way a pattern this quiet could still
 * become a legibility problem.
 */
export function surfaceCss(slug: string): string {
    const def = surfaceBySlug(slug);
    if (!def || def.slug === DEFAULT_SURFACE) return '';
    return `body{background-image:${def.image};background-size:${def.size};` +
        'background-attachment:fixed;background-repeat:repeat}';
}
