/**
 * The palettes he can unlock, and the one rule that makes them safe to ship.
 *
 * ==================================================================================================
 * A THEME CHANGES HUE AND CHROMA. IT NEVER CHANGES LIGHTNESS.
 * ==================================================================================================
 *
 * That single constraint is what makes this feature possible at all, and it is not a style guideline — it is
 * the reason a new palette cannot quietly break the interface.
 *
 * WCAG contrast is a function of relative luminance and nothing else, and in OKLCH luminance is carried almost
 * entirely by L. That is not an assumption here; it was measured on this exact ramp when the surfaces first
 * got a temperature (see app/globals.css): **tripling s0's chroma moved `text` on `--s0` from 17.88:1 to
 * 17.90:1.** Chroma contributes essentially nothing.
 *
 * So every palette below is generated from the SAME table of lightness values — the ones the default palette
 * already had, with all 74 pairs asserted against them — and differs only in where on the hue wheel it sits
 * and how much colour it carries. Every palette therefore inherits the default's proven contrast.
 *
 * `tests/palette.mjs` does not take that on trust. It runs the full pair list against EVERY palette in BOTH
 * schemes, so the claim is checked rather than argued, and a palette that fails does not ship. The one way a
 * hue-and-chroma change *can* move luminance is by pushing a colour out of the sRGB gamut, where it gets
 * clamped — and the contrast maths clamps first for exactly that reason.
 *
 * WHAT A THEME MAY NOT TOUCH: `--ask`, `--ok`, `--bad`, `--go`. Amber means a decision is waiting, green means
 * done, red means refused. Those are the interface's vocabulary, not its decoration, and a skin that relabels
 * them is a skin that makes the hub lie in a new colour. Surfaces, ink, accent, focus and scrollbar are
 * skinnable; meaning is not.
 *
 * WHY THIS IS A TS MODULE AND NOT MORE CSS
 *
 * `app/globals.css` declares the default ramp and `tests/palette.mjs` held its own copy of those triples, under
 * a comment calling the duplication a reluctant compromise. Generating palettes from data lets the suite import
 * the real values instead of restating them, so this REMOVES a copy rather than adding one — and the layout
 * emits only the active palette's overrides, so a hub on the default theme pays nothing at all.
 */

/** L, C, H — the three numbers of an OKLCH colour, in the order the CSS function takes them. */
export type Triple = [number, number, number];

/** Every token a palette is allowed to set. Anything not here is fixed across all palettes, by design. */
export interface Tokens {
    s0: Triple; s1: Triple; s2: Triple; s3: Triple; s4: Triple;
    line: Triple; lineStrong: Triple;
    text: Triple; dim: Triple; mute: Triple;
    accent: Triple; accentSolid: Triple; accentSolidHover: Triple;
    focus: Triple;
    scroll: Triple;
}

/**
 * The lightness and chroma of every token, shared by every palette.
 *
 * Chroma rises with lightness on the surface ramp for the reason the original comment in globals.css gives: a
 * literally-neutral dark surface reads blue-grey against warm text. A palette scales this column; it does not
 * replace it, so the *relationship* between the steps survives every theme.
 */
const DARK_LC = {
    s0: [0.145, 0.014], s1: [0.185, 0.016], s2: [0.225, 0.018], s3: [0.275, 0.020], s4: [0.325, 0.022],
    line: [0.270, 0.018], lineStrong: [0.380, 0.024],
    text: [0.965, 0.004], dim: [0.790, 0.010], mute: [0.690, 0.012],
    accent: [0.800, 0.120], accentSolid: [0.520, 0.170], accentSolidHover: [0.465, 0.170],
    focus: [0.860, 0.120],
    scroll: [0.505, 0.010],
} as const;

const LIGHT_LC = {
    s0: [0.988, 0.003], s1: [0.968, 0.005], s2: [0.938, 0.007], s3: [0.900, 0.009], s4: [0.860, 0.011],
    line: [0.878, 0.010], lineStrong: [0.760, 0.014],
    text: [0.230, 0.010], dim: [0.415, 0.014], mute: [0.485, 0.014],
    accent: [0.455, 0.170], accentSolid: [0.500, 0.180], accentSolidHover: [0.440, 0.180],
    focus: [0.500, 0.180],
    scroll: [0.635, 0.012],
} as const;

/** Which tokens take the surface hue, which take the ink hue, and which take the accent hue. */
const INK = ['text', 'dim', 'mute'] as const;
const ACCENTISH = ['accent', 'accentSolid', 'accentSolidHover', 'focus'] as const;

/**
 * One palette, described by three numbers.
 *
 * `hue` places the surfaces. Ink and light-mode surfaces are derived from it by fixed offsets rather than being
 * stated separately, and those offsets are not arbitrary — they reproduce the default palette EXACTLY, which is
 * what lets the default keep its 74 asserted pairs unchanged while becoming just another row in this table:
 *
 *   dark surfaces   hue          70 -> 70   (globals.css: 70)
 *   light surfaces  hue + 15     70 -> 85   (globals.css: 85)
 *   dark ink        hue + 10     70 -> 80   (globals.css: 80)
 *   light ink       hue - 10     70 -> 60   (globals.css: 60)
 *
 * `chroma` multiplies the whole surface-and-line column. 1 is the default ramp; above about 3 the darker steps
 * start to read as coloured panels rather than as material, and the check will tell you before your eye does.
 *
 * `accentHue` is the interactive family. `--accent` and `--focus` sit 3 degrees below it, which is again a
 * reproduction of the existing values (255 against 258) rather than a preference.
 */
export interface PaletteDef {
    slug: string;
    label: string;
    /** One line, in his language, about what it feels like. Shown beside the swatch. */
    blurb: string;
    hue: number;
    chroma: number;
    accentHue: number;
}

function tokensFor(def: PaletteDef, scheme: 'dark' | 'light'): Tokens {
    const lc = scheme === 'dark' ? DARK_LC : LIGHT_LC;
    const surfaceHue = scheme === 'dark' ? def.hue : def.hue + 15;
    const inkHue = scheme === 'dark' ? def.hue + 10 : def.hue - 10;

    const out = {} as Tokens;
    for (const key of Object.keys(lc) as (keyof Tokens)[]) {
        const [l, c] = lc[key];
        const isInk = (INK as readonly string[]).includes(key);
        const isAccent = (ACCENTISH as readonly string[]).includes(key);
        /*
         * Chroma scales the SURFACES and the lines only. Ink is near-neutral by design and scaling it would tint
         * the text; the accent family already carries its own chroma and scaling that would push it out of gamut,
         * where clamping changes luminance and the contrast guarantee stops holding.
         */
        const chroma = isInk || isAccent ? c : c * def.chroma;
        const hue = isAccent
            ? (key === 'accent' || key === 'focus' ? def.accentHue - 3 : def.accentHue)
            : isInk ? inkHue : surfaceHue;
        out[key] = [l, +chroma.toFixed(4), ((hue % 360) + 360) % 360];
    }
    return out;
}

/**
 * The palettes, in unlock order.
 *
 * Six rather than sixteen, deliberately. A settings page that is mostly things he cannot have is a page about
 * what he has not earned, and RESEARCH §14's warning about dead dashboards applies hardest to a reward surface.
 * These are spread so the next one is always visible and reachable — and the list is designed to grow, which is
 * the point of a generated palette rather than a hand-written one.
 */
export const PALETTES: PaletteDef[] = [
    {
        slug: 'graphite',
        label: 'Graphite',
        blurb: 'The warm near-black this hub was built in. Where everyone starts.',
        hue: 70, chroma: 1, accentHue: 258,
    },
    {
        slug: 'slate',
        label: 'Slate',
        blurb: 'The same room with the lights gone cool. Quieter, a little more clinical.',
        hue: 250, chroma: 1.1, accentHue: 258,
    },
    {
        slug: 'bronze',
        label: 'Bronze',
        blurb: 'Surfaces with real warmth in them, and a teal accent so the amber still means a decision.',
        hue: 55, chroma: 2.4, accentHue: 195,
    },
    {
        slug: 'ink',
        label: 'Ink',
        blurb: 'Almost no colour in the surfaces at all. The most contrast, the least noise.',
        hue: 265, chroma: 0.3, accentHue: 250,
    },
    {
        slug: 'moss',
        label: 'Moss',
        blurb: 'Deep green panels. Reads calm rather than technical.',
        hue: 150, chroma: 2.0, accentHue: 268,
    },
    {
        slug: 'plum',
        label: 'Plum',
        blurb: 'The loudest of them. Purple-black surfaces with a cold accent over the top.',
        hue: 325, chroma: 2.2, accentHue: 205,
    },
];

export const DEFAULT_PALETTE = PALETTES[0].slug;

/* ==================================================================================================
 * THE GENERATED LINE — palettes minted from the ladder rather than written into the array above
 * ==================================================================================================
 *
 * HIS WORDS, AND THEY ARE A MEASUREMENT RATHER THAN AN OPINION:
 *
 *     "Every level-gated perk is at level 1 through 7. I am at level 4. From level 8 onward, forever,
 *      levelling up buys nothing."
 *
 * The six above are gated at levels 1, 2, 4, 6 and on two marks. `tests/ladder.mjs` K10 and K11 were written
 * before this code existed and measured the consequence: at the synthetic rate he is **level 10 by day 30 and
 * level 33 by day 730**, and **53 of the 59 levels from 2 to 60 unlocked nothing at all.**
 *
 * WHY GENERATED AND NOT JUST THIRTY MORE ROWS
 *
 * Because thirty more rows is a fixed list that ends, one year further out, and the brief is explicit that a
 * fixed list is not acceptable. A ladder that is unbounded by design needs a reward set that is unbounded by the
 * same design or the two diverge again the moment somebody stops adding rows by hand.
 *
 * AND WHY THAT IS SAFE HERE, WHICH IS THE WHOLE ARGUMENT
 *
 * A palette is three numbers over the SHARED lightness table at the top of this file. Contrast is a function of
 * lightness; hue and chroma are the only things a palette moves. So a minted palette inherits the default's
 * proven contrast by construction, exactly as the six hand-written ones do — the generator cannot reach the one
 * dimension that could break the interface, because `tokensFor` does not let it.
 *
 * `tests/palette.mjs` does not take that on trust for the generated ones either. It runs the full pair list
 * against a long stretch of the generated line in BOTH schemes, because there IS one way hue can move luminance:
 * pushing a colour out of the sRGB gamut, where it gets clamped. That is measured, not argued.
 *
 * THE FAILURE MODE THIS LINE HAS TO AVOID, AND HE HAS ALREADY FOUND IT ONCE
 *
 *     "the crest would be cool if it would be different every time but they kinda look the same dude…
 *      Many users won't even notice anything."
 *
 * That was the crest finishes, and it is the obvious way a generated set goes wrong: forty items nobody can tell
 * apart is worse than six that are distinct. So the three knobs are walked on DIFFERENT PERIODS — the hue by the
 * golden angle, which never repeats and maximally separates each new entry from every previous one; the chroma by
 * a three-entry character table; the accent by a stride that walks its band evenly. Consecutive palettes therefore
 * differ on all three at once rather than being a slow hue sweep.
 *
 * EVERY ONE OF THOSE NUMBERS WAS CHOSEN BY A SEARCH AGAINST CHECK K14 IN `tests/ladder.mjs`, not by eye, and the
 * first two attempts were both rejected by it:
 *
 *   1. base 24 with six chroma values put the fourth minted palette six degrees and 0.15 of chroma from Graphite.
 *   2. base 0 with a low-chroma entry and a 29-degree accent stride put minted 1 and minted 9 at the same chroma
 *      with accents one degree apart — two near-neutral warm palettes with the same teal accent, at level 32.
 *
 * The second one is the interesting failure, because it is the one a rendered screenshot found rather than
 * arithmetic: at chroma below about 0.8 the surfaces are near-neutral, so HUE STOPS BEING VISIBLE and 95 degrees
 * of it separates nothing. K14 encodes that now — the hue term is discounted to zero below 0.8 — and the
 * consequence is that **the minted line carries no near-neutral palettes at all.** `Ink` is the near-neutral one
 * and it is hand-written; a second one could only be told apart from it by its accent, which is not enough for a
 * whole palette to be worth unlocking.
 */

/**
 * The golden angle, and it is the reason this is a sequence rather than a sweep.
 *
 * Stepping the hue wheel by 137.508 degrees is the arrangement that keeps every new entry as far as possible from
 * ALL previous ones rather than merely from the last one — the same property that spaces florets on a sunflower.
 * A round number like 40 degrees would give nine palettes and then start repeating; this one never lands on the
 * same hue twice.
 */
const GOLDEN_ANGLE = 137.508;

/**
 * Where the generated line starts on the wheel, and BOTH this and the chroma table below were chosen by a search
 * against check K14 rather than by eye.
 *
 * The first attempt was base 24 with six chroma values, and K14 rejected it immediately: it put the fourth minted
 * palette at hue 76.5, chroma 1.15 — six degrees and 0.15 of chroma from Graphite's 70/1.0. Two palettes that
 * close are one palette twice. A sweep of all 360 bases against eight candidate chroma tables found this pair,
 * and the measurement it is chosen on is in K14's own output.
 */
const GENERATED_HUE_BASE = 0;

/**
 * The chroma characters, walked on a period of three against a hue that never repeats, so a palette's saturation
 * is not a function of its hue.
 *
 * EVERY ONE OF THESE IS AT LEAST 0.3 FROM ALL SIX HAND-WRITTEN VALUES (0.3, 1, 1.1, 2, 2.2, 2.4), and that is
 * the constraint that does the work rather than a preference: it means a minted palette cannot be a near-duplicate
 * of one he already has even when its hue lands close by. There is not much room — the named six occupy 1.0/1.1
 * and 2.0/2.2/2.4 in tight clusters, which leaves only about three usable bands, and that is why this table is
 * three entries rather than the six it started as.
 *
 * AND EVERY ONE IS ABOVE 0.8, which is the substantive change rather than a tidy-up. Below that the surfaces are
 * near-neutral and their hue is not perceptible, so a minted palette in that range could only be distinguished
 * from `Ink` — and from every other low-chroma minted one — by its accent. See the note at the top of this
 * section for the screenshot that established it and the K14 clause that now holds it.
 *
 * 2.7 is the top because this file's own note says that above about 3 the darker steps stop reading as material
 * and start reading as coloured panels.
 */
const GENERATED_CHROMA = [1.45, 2.75, 1.6];

/**
 * Twelve hue families, thirty degrees each, named for materials and pigments — the vocabulary the six
 * hand-written palettes already use (Graphite, Slate, Bronze, Ink, Moss, Plum) rather than a second one.
 *
 * `Amber` is deliberately absent even though it is the obvious name for the 30-60 band. Amber means *a decision
 * is waiting* everywhere else in this hub, and `--ask` is one of the four tokens a palette may never touch; a
 * palette called Amber would put that word on a swatch that has nothing to do with it. `Ochre` covers the band.
 */
const HUE_FAMILY = [
    'Rust', 'Ochre', 'Brass', 'Olive', 'Fern', 'Verdigris',
    'Teal', 'Steel', 'Cobalt', 'Iris', 'Mauve', 'Garnet',
];

/**
 * The numeral for the second and later time a family comes round.
 *
 * THE SAME DECISION `rankFor` MADE, AND FOR THE SAME REASON — which is why it is a numeral rather than more
 * names. That function ran out of rank titles and argued that a name describes a role while a numeral carries
 * tenure, because inventing twenty more names either escalates into space opera or turns into a joke. A hue
 * family is a name and the second Cobalt is a second Cobalt; `Cobalt II` says exactly that and never runs out.
 *
 * COMPUTED RATHER THAN A LOOKUP TABLE, and that is a defect check K12 caught rather than a preference. The first
 * version was a thirteen-entry array clamped with `Math.min(round, NUMERAL.length - 1)`, exactly as `TIERS` in
 * lib/progress.ts is — and K12 reported *"two minted looks share a name, so he could not tell which one he
 * chose"*, because every round past the twelfth came out as `XII`. A clamped lookup is fine for a bounded thing
 * and this line is unbounded by design. Two looks with one name is a collection he cannot talk about.
 *
 * Local to this file rather than shared with lib/finishes.ts and lib/surfaces.ts, which each have their own copy.
 * That is not an oversight: a VALUE import between two `lib/*.ts` files cannot be resolved by Node's
 * type-stripping, so it would break `tests/palette.mjs` and `tests/ladder.mjs`, which load these modules
 * directly (AGENTS.md records the hour that cost, and it was re-verified with a throwaway probe before this was
 * written). Three copies of a pure formatting helper with no behaviour to drift is the cheaper of the two prices.
 */
const ROMAN: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Empty for the first of a family, so `Cobalt` has no numeral and `Cobalt II` is the second. */
function numeral(n: number): string {
    let left = Math.min(3999, Math.max(0, Math.floor(n)));
    if (left <= 1) return '';
    let out = '';
    for (const [value, sign] of ROMAN) while (left >= value) { out += sign; left -= value; }
    return out;
}

/** How the generated line's slugs are spelled. `lib/perks.ts` builds the same string from the other side. */
const GENERATED_PREFIX = 'palette-';

/**
 * The nth palette of the generated line, 1-based.
 *
 * Pure, so the same index always gives the same palette: the slug in his cookie has to mean the same thing next
 * week as it did today, and nothing about a palette may be stored.
 */
export function generatedPalette(index: number): PaletteDef {
    const n = Math.max(1, Math.floor(index));
    const i = n - 1;
    const hue = ((GENERATED_HUE_BASE + i * GOLDEN_ANGLE) % 360 + 360) % 360;
    const chroma = GENERATED_CHROMA[i % GENERATED_CHROMA.length]!;
    const family = Math.floor(hue / 30) % HUE_FAMILY.length;

    /* How many earlier entries of the line landed in this same family, so the numeral counts the family rather
     * than the index. Walked rather than derived, because the golden angle does not visit the families in any
     * order a formula could shortcut. */
    let seen = 0;
    for (let k = 0; k < i; k++) {
        const h = ((GENERATED_HUE_BASE + k * GOLDEN_ANGLE) % 360 + 360) % 360;
        if (Math.floor(h / 30) % HUE_FAMILY.length === family) seen++;
    }
    const label = `${HUE_FAMILY[family]} ${numeral(seen + 1)}`.trim();

    /*
     * The accent band is 185..324 — teal through blue and violet to magenta — and its bounds are a rule rather
     * than a taste. `--ask` is amber at hue 82, `--ok` and `--go` are green at 152/155, `--bad` is red at 25, and
     * those four are the interface's VOCABULARY: a palette may never touch them (see the note at the top of this
     * file). An accent that lands next to one of them does not change its meaning but it does blur it, so the band
     * keeps a wide berth from all four. 185 rather than 170 for exactly that reason — 170 is fifteen degrees from
     * the green that means "done".
     *
     * Stride 89 across a span of 140 walks the band evenly instead of clustering. That was measured: a stride of
     * 71 passed K14 but put every other minted palette within two degrees of the same teal, so the whole line
     * would have been teal-or-blue and never violet. 89 keeps a minimum gap of 12 degrees across the first twelve.
     */
    const accentHue = 185 + ((i * 89) % 140);

    /*
     * DESCRIPTIVE RATHER THAN EVOCATIVE, and it names THREE things because naming one was a defect.
     *
     * The first version opened every low-chroma card with *"Almost no colour in the surfaces at all."* — which is
     * word for word how `Ink`'s hand-written blurb opens. Rendered side by side on `/looks`, Rust and Ink read as
     * the same card written twice, which is exactly the "same fact stated twice" defect two marks with identical
     * detail lines already had once (docs/ITERATION-LOG.md §I). Found by cropping the rendered page and looking at
     * the two swatches next to each other, which is also how it became clear the palettes themselves are fine —
     * a warm ramp with a teal accent and a cool ramp with a blue one are plainly two palettes.
     *
     * So it says how much colour, which band of the wheel, and which accent family. Those three are what actually
     * differ between any two entries of this line, so a card describes what makes THIS one itself.
     */
    const weight = chroma < 1 ? 'Barely any colour in the surfaces'
        : chroma < 1.55 ? 'A steady wash of colour through the panels'
            : chroma < 2.2 ? 'Strong colour in the panels'
                : 'The most colour a surface is allowed to carry here';
    const accentWord = accentHue <= 210 ? 'teal'
        : accentHue <= 235 ? 'cyan'
            : accentHue <= 262 ? 'blue'
                : accentHue <= 292 ? 'indigo' : 'violet';
    return {
        slug: `${GENERATED_PREFIX}${n}`,
        label,
        blurb: `${weight}, tinted ${HUE_FAMILY[family]!.toLowerCase()}, with a ${accentWord} accent. `
            + 'Unlocked by levelling up rather than drawn by hand.',
        hue: +hue.toFixed(2),
        chroma,
        accentHue,
    };
}

/** The first `count` of the generated line. For the suites and for the assembler in lib/looks.ts. */
export function generatedPalettes(count: number): PaletteDef[] {
    return Array.from({ length: Math.max(0, count) }, (_, i) => generatedPalette(i + 1));
}

/**
 * The index a generated slug names, or null if it is not one of ours.
 *
 * Parsed locally rather than imported from `lib/perks.ts`, for the value-import reason on `NUMERAL` above. The
 * two spellings are held together by a check rather than by this comment: `tests/ladder.mjs` K12 asserts that
 * every gate the rotation mints resolves to a real definition on its own axis.
 */
export function generatedPaletteIndex(slug: string): number | null {
    if (!slug.startsWith(GENERATED_PREFIX)) return null;
    const rest = slug.slice(GENERATED_PREFIX.length);
    if (!/^[1-9][0-9]{0,3}$/.test(rest)) return null;
    return Number(rest);
}

export function paletteBySlug(slug: string): PaletteDef | null {
    const named = PALETTES.find(p => p.slug === slug);
    if (named) return named;
    const index = generatedPaletteIndex(slug);
    return index === null ? null : generatedPalette(index);
}

/** Both schemes' token sets for a palette. Used by the CSS emitter and by the contrast suite. */
export function paletteTokens(def: PaletteDef): { dark: Tokens; light: Tokens } {
    return { dark: tokensFor(def, 'dark'), light: tokensFor(def, 'light') };
}

const CSS_NAME: Record<keyof Tokens, string> = {
    s0: '--s0', s1: '--s1', s2: '--s2', s3: '--s3', s4: '--s4',
    line: '--line', lineStrong: '--line-strong',
    text: '--text', dim: '--dim', mute: '--mute',
    accent: '--accent', accentSolid: '--accent-solid', accentSolidHover: '--accent-solid-hover',
    focus: '--focus',
    scroll: '--scroll',
};

const oklch = ([l, c, h]: Triple) => `oklch(${l} ${c} ${h})`;

const block = (t: Tokens) =>
    (Object.keys(CSS_NAME) as (keyof Tokens)[]).map(k => `${CSS_NAME[k]}:${oklch(t[k])}`).join(';');

/**
 * The stylesheet for one palette, as a string to inline in the document head.
 *
 * Emitted rather than written into `app/globals.css`, so that:
 *   - the values have exactly one source, which the contrast suite imports rather than copies
 *   - a hub on the default palette ships NO extra CSS at all, because this returns an empty string for it
 *   - adding a palette is a row in an array, not an edit to a 2,000-line stylesheet
 *
 * `:root` at the end of the cascade beats `@layer tokens`, which is what makes an override of five variables
 * enough to re-skin the whole interface: everything downstream already reads them through `var()`. Unlayered
 * rules win over layered ones regardless of order — that is the layer system working as intended, not a hack.
 */
export function paletteCss(slug: string): string {
    const def = paletteBySlug(slug);
    if (!def || def.slug === DEFAULT_PALETTE) return '';
    const { dark, light } = paletteTokens(def);
    return `:root{${block(dark)}}` +
        `@media (prefers-color-scheme: light){:root{${block(light)}}}`;
}
