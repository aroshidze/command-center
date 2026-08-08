/**
 * The palette, and the contrast of every pair that matters — computed, not eyeballed.
 *
 *   npm run prove:palette
 *
 * WHY THIS EXISTS ALONGSIDE C1
 *
 * `prove:layout`'s C1 check measures the contrast of text that is ACTUALLY RENDERED, which is the honest
 * measurement and the one that catches real regressions. It has one blind spot: a pair that is not currently
 * on screen is not checked. The refusal banner, the "past its deadline" tag, the pressed state of a control,
 * the whole light theme — all of them are combinations the suite only sees if the fixture happens to produce
 * them, and "happens to" is not a guarantee.
 *
 * So this asserts the TOKENS, from the same values `app/globals.css` declares, before anything is rendered.
 * Between the two: C1 proves what is on the page is legible, this proves the system it was drawn from is.
 *
 * No dependencies. The OKLCH -> sRGB conversion is the published matrix from the CSS Color 4 specification,
 * which is the same maths the browser runs — verified against Chrome's own resolved values by
 * tests/measure-layout.mjs, which reads real pixels off a canvas. If the two ever disagree, believe the
 * canvas: it is the one painting the screen.
 */

import { generatedPalettes, PALETTES, paletteTokens } from '../lib/palettes.ts';
import { generatedSurfaces, SURFACES, surfaceUsesOnlyRampTokens } from '../lib/surfaces.ts';

/* ---------------------------------------------------------------------------- oklch -> sRGB -> WCAG */

/** OKLCH to linear sRGB. https://www.w3.org/TR/css-color-4/#color-conversion-code */
function oklchToLinearSrgb(L, C, Hdeg) {
    const h = (Hdeg * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

    return [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

/** Relative luminance per WCAG 2.x, from LINEAR values, with sRGB gamut clamping applied first.
 *
 * The clamp matters and is not a rounding: an out-of-gamut oklch colour is displayed clamped, so its real
 * contrast is the clamped one. Computing luminance from the unclamped value would report a ratio the screen
 * never shows — flattering in one direction and alarming in the other. */
function luminanceOf(L, C, H) {
    const lin = oklchToLinearSrgb(L, C, H).map(v => Math.min(1, Math.max(0, v)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

const ratio = (a, b) => {
    const la = luminanceOf(...a), lb = luminanceOf(...b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return +(((hi + 0.05) / (lo + 0.05)).toFixed(2));
};

/**
 * `color-mix(in srgb, A p%, B)`, as a luminance-equivalent OKLCH-free stand-in.
 *
 * The banners are painted with `color-mix`, not with a token, so their background is not one of the triples
 * above and could not be asserted. Mixing happens in the sRGB space the stylesheet asks for — gamma-encoded
 * sRGB, which is what `in srgb` means — so the channels are mixed AFTER encoding, not in linear light. Getting
 * that backwards would flatter the result, because linear mixing lands darker.
 *
 * Returns a triple the pair table can consume: an OKLCH grey whose luminance equals the mixed colour's.
 * Contrast depends on luminance alone, so a grey of the right luminance gives the right ratio — this is exact
 * for the purpose rather than an approximation of it. It is deliberately NOT the same colour; do not read the
 * hex it prints as the banner's colour.
 *
 * VERIFIED AGAINST THE BROWSER, because this file's own header says to believe the canvas when the two disagree.
 * Chrome paints the dark stale banner as `color(srgb 0.136441 0.110444 0.0653637)`, luminance 0.01231; this
 * returns luminance 0.01229. The resulting contrast against the banner's text is 10.24:1 measured off Chrome's
 * pixels and 10.25:1 computed here — a rounding difference, in the safe direction.
 */
function mixSrgb(a, pct, b) {
    const enc = v => {
        const c = Math.min(1, Math.max(0, v));
        return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    };
    const dec = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const A = oklchToLinearSrgb(...a).map(enc);
    const B = oklchToLinearSrgb(...b).map(enc);
    const t = pct / 100;
    const mixedLinear = A.map((v, i) => dec(v * t + B[i] * (1 - t)));
    const lum = 0.2126 * mixedLinear[0] + 0.7152 * mixedLinear[1] + 0.0722 * mixedLinear[2];
    // A neutral whose OKLCH lightness reproduces this luminance. Solved rather than guessed: L in OkLab is
    // the cube root of linear luminance for a grey, so this inverts exactly.
    return [Math.cbrt(lum), 0, 0];
}

/** For the record, so a value can be pasted into a design tool or a bug report. */
function hexOf(L, C, H) {
    const enc = v => {
        const c = Math.min(1, Math.max(0, v));
        const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(s * 255).toString(16).padStart(2, '0');
    };
    return `#${oklchToLinearSrgb(L, C, H).map(enc).join('')}`;
}

/* ---------------------------------------------------------------------------------------- the palette
 *
 * These MUST match app/globals.css. They are duplicated rather than parsed out of the CSS on purpose: a
 * parser would silently pass when a token was renamed, and the check would then be asserting things about
 * colours nothing uses. A mismatch here is caught by C1 the moment it is rendered, which is the backstop.
 */

const DARK = {
    s0: [0.145, 0.014, 70],
    s1: [0.185, 0.016, 70],
    s2: [0.225, 0.018, 70],
    s3: [0.275, 0.020, 70],
    s4: [0.325, 0.022, 70],
    line: [0.270, 0.018, 70],
    lineStrong: [0.380, 0.024, 70],

    text: [0.965, 0.004, 80],
    dim: [0.790, 0.010, 80],
    mute: [0.690, 0.012, 80],

    accent: [0.800, 0.120, 255],
    accentSolid: [0.520, 0.170, 258],
    accentSolidHover: [0.465, 0.170, 258],
    go: [0.520, 0.120, 152],
    goHover: [0.470, 0.130, 152],
    ok: [0.820, 0.150, 155],
    ask: [0.840, 0.130, 82],
    askBg: [0.225, 0.035, 82],
    bad: [0.740, 0.160, 25],
    focus: [0.860, 0.120, 255],
    scroll: [0.505, 0.010, 70],
    white: [1, 0, 0],

    /*
     * The emblem's ink, at both ends of its hue walk.
     *
     * Only L and C are tokens (`--emblem-l`, `--emblem-c`); the hue is a function of the level. Since L and C
     * are fixed, contrast varies only trivially across the walk — so asserting the two extremes covers every
     * hue between them. 152 is the green it starts at and 269 is the violet at the top of a tier.
     *
     * These pairs exist because the emblem's colour was a LITERAL inside the component and therefore checked by
     * nothing: this file asserts tokens, and C1 measures text while the emblem is an aria-hidden graphic. In the
     * light theme it was rendering at roughly 1.4:1 — invisible in practice.
     */
    emblemInkGreen: [0.82, 0.13, 152],
    emblemInkViolet: [0.82, 0.13, 269],

    /*
     * The crest's PROJECT BANDS, at the two hues that bracket their luminance.
     *
     * `--crest-pale-l`/`--crest-pale-c` are tokens and the hue comes from the project slug, so the band can be
     * any of 360 hues — and every one of them has the crest's ink stroked over it. Same argument as the emblem
     * ink one rung above: L and C are fixed, so only hue varies, and hue moves luminance only through the tiny
     * chroma term. Asserting the brightest and darkest hue therefore brackets all 360.
     *
     * 90 and 264 are those extremes, not a guess: in OkLab the b-axis coefficient on the green channel is what
     * dominates luminance at low chroma, so yellow-green is the brightest a fixed L can be and blue is the
     * darkest. The pair either side of the ink is what makes the bands safe to ship at all — a decorative fill
     * with a stroke over it is exactly the shape of thing that reaches production unmeasured.
     */
    crestPaleBright: [0.260, 0.082, 90],
    crestPaleDark: [0.260, 0.082, 264],

    /* The stale-sync banner's background: color-mix(in srgb, var(--ask) 10%, var(--s0)). */
    staleBannerBg: mixSrgb([0.840, 0.130, 82], 10, [0.145, 0.014, 70]),
};

const LIGHT = {
    s0: [0.988, 0.003, 85],
    s1: [0.968, 0.005, 85],
    s2: [0.938, 0.007, 85],
    s3: [0.900, 0.009, 85],
    s4: [0.860, 0.011, 85],
    line: [0.878, 0.010, 85],
    lineStrong: [0.760, 0.014, 85],

    text: [0.230, 0.010, 60],
    dim: [0.415, 0.014, 60],
    mute: [0.485, 0.014, 60],

    accent: [0.455, 0.170, 255],
    accentSolid: [0.500, 0.180, 258],
    accentSolidHover: [0.440, 0.180, 258],
    go: [0.470, 0.130, 152],
    goHover: [0.410, 0.130, 152],
    ok: [0.470, 0.140, 155],
    ask: [0.470, 0.110, 70],
    askBg: [0.965, 0.040, 85],
    bad: [0.500, 0.190, 25],
    focus: [0.500, 0.180, 255],
    scroll: [0.635, 0.012, 85],
    white: [1, 0, 0],

    /* Darker and slightly more saturated than dark's, because the surface underneath is near-white. */
    emblemInkGreen: [0.50, 0.16, 152],
    emblemInkViolet: [0.50, 0.16, 269],

    /* One step DOWN the light ramp instead of up — see the `--crest-pale-l` comment in app/globals.css. */
    crestPaleBright: [0.912, 0.060, 90],
    crestPaleDark: [0.912, 0.060, 264],

    /* Same mix, light theme values. */
    staleBannerBg: mixSrgb([0.470, 0.110, 70], 10, [0.988, 0.003, 85]),
};

/*
 * Every pair, with the standard it has to meet.
 *
 * 4.5 is WCAG 2.2 AA for text below 18.66px bold / 24px normal, which is all body text here.
 * 3.0 is SC 1.4.11 for non-text UI: the focus ring, and the scrollbar thumb — a scrollbar is a control you
 * have to be able to find, not decoration, which is the whole reason it has a token at all.
 */
const PAIRS = [
    ['text on the page', 'text', 's0', 4.5],
    ['text on a panel', 'text', 's1', 4.5],
    ['text on a control', 'text', 's2', 4.5],
    ['text on a hovered control', 'text', 's3', 4.5],
    ['text on a pressed control', 'text', 's4', 4.5],

    ['dim on the page', 'dim', 's0', 4.5],
    ['dim on a panel', 'dim', 's1', 4.5],
    ['dim on a control', 'dim', 's2', 4.5],
    ['dim on a hovered control', 'dim', 's3', 4.5],
    ['dim on the decision card', 'dim', 'askBg', 4.5],

    ['mute on the page', 'mute', 's0', 4.5],
    ['mute on a panel', 'mute', 's1', 4.5],
    ['mute on a control', 'mute', 's2', 4.5],
    ['mute on the decision card', 'mute', 'askBg', 4.5],
    /*
     * The SELECTED state of a control, which had no pairs at all.
     *
     * `dim` on `s3` was listed and `mute` on `s3` was not, so the moment the project filter became a chip —
     * `--s3` when pressed, with its count in `--mute` and its cleared-project figure in `--ok` — two colour
     * combinations went on screen that nothing had ever measured. Every other surface in this file was added
     * the same way: not by auditing the palette, but by an element appearing on a background nobody had paired
     * it with. `s3` is the pressed/hovered step and it will keep collecting text.
     */
    ['mute on a selected control', 'mute', 's3', 4.5],
    ['success text on a selected control', 'ok', 's3', 4.5],

    ['white on the primary action', 'white', 'go', 4.5],
    /* And hovered, which carried the same unmeasured defect as the send button: 4.12:1 while it lightened. */
    ['white on the primary action, hovered', 'white', 'goHover', 4.5],
    ['white on the send button', 'white', 'accentSolid', 4.5],
    /*
     * White on the send button while the POINTER IS ON IT, which nothing had ever measured.
     *
     * Found by generating the palettes: --accent-solid-hover was not in this file's token list at all, so the
     * one pair that only exists during a hover had no assertion behind it. The hover step is LIGHTER than the
     * rest in dark mode, which is the direction that hurts white text — exactly the case worth checking.
     */
    ['white on the send button, hovered', 'white', 'accentSolidHover', 4.5],

    ['the accent as a link on the page', 'accent', 's0', 4.5],
    ['the accent on a control', 'accent', 's2', 4.5],
    /*
     * The accent on a PANEL, which had no pair until the command palette grew a progress bar.
     *
     * Same story as `mute on a selected control` above: not found by auditing the palette, but by an element
     * appearing on a background nothing had paired it with. The palette box is `--s1`, and the 2px bar that says
     * a request is in flight is drawn in `--accent` on it. 4.5 rather than the 3 that SC 1.4.11 asks of a graphic,
     * because `--accent` also lands on `--s1` as TEXT — the unlock banner's "See what changed →" sits on a panel
     * — so the stricter bar is the one that has to hold anyway, and asserting the weaker one would have been a
     * green check for the easier half of a combination the interface already ships.
     */
    ['the accent on a panel', 'accent', 's1', 4.5],
    ['success text on a panel', 'ok', 's1', 4.5],
    ['success text on the page', 'ok', 's0', 4.5],
    ['a refusal on the page', 'bad', 's0', 4.5],
    ['a refusal on a panel', 'bad', 's1', 4.5],
    ['the decision accent on the page', 'ask', 's0', 4.5],
    ['the decision accent on its own card', 'ask', 'askBg', 4.5],
    /*
     * AMBER ON A PANEL, which had no pair until /agents put a quiet project's sentence on one.
     *
     * The same story as `mute on a selected control` and `the accent on a panel` above, and that is now three
     * pairs found the same way: not by auditing the palette but by an element appearing on a background nobody
     * had paired it with. `--ask` had only ever landed on the page (`--s0`) and on the decision card
     * (`--ask-bg`); a presence row is `--s1`, which is lighter than either, and lighter is the direction that
     * fails for a mid-lightness amber.
     *
     * Worth stating as a pattern for whoever adds the next surface: the token list here is complete and the
     * PAIR list never is, because a pair is a fact about the layout rather than about the palette. Every time
     * this file has grown it has been because something moved, not because somebody found a bug in a colour.
     */
    ['the decision accent on a panel', 'ask', 's1', 4.5],

    ['the focus ring on the page', 'focus', 's0', 3],
    ['the focus ring on a panel', 'focus', 's1', 3],
    ['the focus ring on a control', 'focus', 's2', 3],
    ['the focus ring on a hovered control', 'focus', 's3', 3],
    ['the focus ring on a pressed control', 'focus', 's4', 3],
    ['the focus ring on the decision card', 'focus', 'askBg', 3],

    ['the scrollbar thumb on the page', 'scroll', 's0', 3],
    ['the scrollbar thumb on a panel', 'scroll', 's1', 3],

    /*
     * The emblem, at both ends of its hue walk, against the panel it is drawn on.
     *
     * 3:1 rather than 4.5:1 because it is a graphic and not text — the level and rank are stated in words right
     * beside it, so the shape is not the only route to the information and SC 1.4.11 is the applicable bar. It
     * still has to CLEAR that bar: an emblem nobody can see is a feature that does not exist, which is what the
     * light theme had until this was measured.
     */
    ['the emblem at the green end, on its panel', 'emblemInkGreen', 's1', 3],
    ['the emblem at the violet end, on its panel', 'emblemInkViolet', 's1', 3],

    /*
     * THE CREST, which is drawn on three surfaces rather than one and therefore needs six pairs.
     *
     * The emblem was one stroke colour on one background — the panel — so two pairs covered it. The crest has a
     * GROUND (`--s0` inset or `--s4` raised), which also fills the chief band and the well the charge is struck
     * into, and up to eight PROJECT BANDS whose hue comes from the slug.
     *
     * ==================================================================================================
     * TWO PAIRS WERE DELETED HERE, AND DELETING THEM IS THE POINT RATHER THAN A COST
     * ==================================================================================================
     *
     * `the tier pips on the chief` asserted the crest ink against `--s3`, because the chief band used to be
     * painted in it. The redesign paints the chief in the ground token instead — a mid-grey slab across the top
     * of a coloured field was a fourth value in an object that wanted three — and `--s3` now appears nowhere on
     * the crest at all.
     *
     * So those two pairs were asserting a combination the code can no longer produce. **A green check whose
     * subject does not exist is worse than no check**: it reports coverage it is not providing, and this file's
     * own history is a list of checks that passed while measuring nothing (see the NOT MEASURED rule in
     * tests/measure-layout.mjs). The count goes 47 pairs to 45, and 564 checks to 540. That is a truthful
     * number replacing an inflated one, and the guarantee is unchanged: the pips sit on the ground token on
     * four finishes and on a project band on the fifth, and both of those are asserted below.
     *
     * That third one is the reason this block exists. A decorative fill with a stroke over it is precisely the
     * shape of element that reaches production unmeasured: prove:palette asserts tokens and these were not
     * tokens, and C1 measures TEXT while the crest is an aria-hidden graphic — the exact blind spot that left
     * the emblem at roughly 1.4:1 on a light desktop for the whole life of that component.
     *
     * 3:1 rather than 4.5:1 because it is a graphic: every fact the shape carries is also stated in words in
     * `CrestKey`, so the geometry is never the only route to it, which makes SC 1.4.11 the applicable bar. It
     * still has to CLEAR that bar — a crest nobody can see is a feature that does not exist.
     */
    ['the crest on its own field', 'emblemInkGreen', 's0', 3],
    ['the crest at the violet end, on its field', 'emblemInkViolet', 's0', 3],
    /*
     * AND ON A RAISED FIELD. Two of the five crest finishes fill the outline with `--s4` instead of `--s0`, so
     * the crest reads as a medal sitting on the panel rather than a seal stamped into it.
     *
     * That is the second-biggest visual lever a finish has after the silhouette — it inverts the whole value
     * structure of the object — and it costs exactly these two pairs. `--s4` is the top of the surface ramp, so
     * it is the hardest background the ink ever has to work against in the dark theme and the easiest in the
     * light one; asserting it covers the worst case in both.
     */
    ['the crest on a RAISED field', 'emblemInkGreen', 's4', 3],
    ['the crest at the violet end, on a raised field', 'emblemInkViolet', 's4', 3],
    /*
     * OVER A PROJECT BAND, which now carries the tier pips as well as the geometry.
     *
     * `ledger` divides its field as a coloured collar around the rim and draws no chief band — the chief would
     * paint over the very thing that finish exists to show — so its pips are struck straight into a project's
     * own colour. These two pairs are what makes that safe, and they were already here for the geometry.
     */
    ['the crest over the brightest project band', 'emblemInkGreen', 'crestPaleBright', 3],
    ['the crest over the darkest project band', 'emblemInkViolet', 'crestPaleDark', 3],

    /*
     * The "no agent has synced" banner: `--ask` on a 10% tint of itself over the page.
     *
     * Asserted here rather than left to C1 because the banner only renders when the last sync is over 72 hours
     * old, and until `npm run fixture -- --stale` existed there was no way to produce that at all — so this
     * colour pair could never appear on screen for C1 to measure. Exactly the blind spot this file's header
     * describes: "a pair that is not currently on screen is not checked."
     */
    ['the stale-sync warning on its own tint', 'ask', 'staleBannerBg', 4.5],
];

/* --------------------------------------------------------------------------------------------- run */

let failures = 0;

/*
 * ==================================================================================================
 * EVERY PALETTE, IN BOTH SCHEMES. THIS IS THE CHECK THE WHOLE FEATURE RESTS ON.
 * ==================================================================================================
 *
 * The palettes he unlocks are generated from one shared table of LIGHTNESS values and differ only in hue and
 * chroma — see the argument at the top of lib/palettes.ts. That argument is why a new palette cannot break
 * legibility, and an argument is not a guarantee. This is the guarantee: the full pair list, against every
 * palette, in dark and light, computed before anything renders.
 *
 * The one way a hue-and-chroma change CAN move luminance is by pushing a colour outside the sRGB gamut, where
 * the display clamps it — so `luminanceOf` clamps first, deliberately, and a palette that over-saturates fails
 * here rather than looking slightly wrong on his screen.
 *
 * The FIXED tokens are merged under each palette's own: --ask, --ok, --bad, --go and the emblem ink are the
 * interface's vocabulary rather than its decoration, and a skin is not allowed to relabel them. Amber means a
 * decision is waiting in every palette or it means nothing in any of them.
 */
const SKINNABLE = [
    's0', 's1', 's2', 's3', 's4', 'line', 'lineStrong',
    'text', 'dim', 'mute', 'accent', 'accentSolid', 'accentSolidHover', 'focus', 'scroll',
];

/*
 * FIRST: the generator must reproduce the SHIPPED default exactly.
 *
 * app/globals.css declares the default ramp and this file has always carried its own copy of those triples,
 * under a comment calling the duplication a reluctant compromise. Generating palettes from data does not remove
 * that copy — it adds a third party that has to agree with both. So the generator's output for `graphite` is
 * compared, number by number, against the values asserted here.
 *
 * If this fails, the palettes have drifted from the stylesheet and every pair below is measuring a hub that does
 * not exist. It is checked FIRST for that reason.
 */
console.log('\n  the generator against the shipped default');
{
    const gen = paletteTokens(PALETTES.find(p => p.slug === 'graphite'));
    for (const [schemeName, mine, theirs] of [['dark', DARK, gen.dark], ['light', LIGHT, gen.light]]) {
        const wrong = SKINNABLE.filter(k => {
            const a = mine[k], b = theirs[k];
            return !a || !b || a.some((v, i) => Math.abs(v - b[i]) > 0.0005);
        });
        const ok = wrong.length === 0;
        if (!ok) failures++;
        console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${schemeName}: the generated Graphite matches the ` +
            `stylesheet's own ramp` + (ok ? '' : `\n            differs on: ${wrong.map(k =>
                `${k} ${JSON.stringify(mine[k])} vs ${JSON.stringify(theirs[k])}`).join(', ')}`));
    }
}

for (const def of PALETTES) {
    const gen = paletteTokens(def);
    for (const [schemeName, fixed, skin] of [['dark', DARK, gen.dark], ['light', LIGHT, gen.light]]) {
        const theme = { ...fixed, ...skin };
        const bad = [];
        for (const [what, fg, bg, need] of PAIRS) {
            const got = ratio(theme[fg], theme[bg]);
            if (got < need) bad.push(`${got}:1 needs ${need} — ${what}`);
        }
        const ok = bad.length === 0;
        if (!ok) failures += bad.length;
        /*
         * One line per palette per scheme when it passes, and every failing pair when it does not.
         *
         * Six palettes times two schemes times 74 pairs is 888 lines, which is a wall nobody reads — and this
         * file's own lesson about false positives applies to volume too: output that is never read is output
         * that is not a check. The default palette still prints in full below, because that is the one whose
         * individual figures are quoted in the report and in comments.
         */
        console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${def.slug.padEnd(9)} ${schemeName.padEnd(5)} ` +
            `${PAIRS.length} pairs` + (ok ? '' : `\n            ${bad.join('\n            ')}`));
    }
}

/* ------------------------------------------------------------------------------------------------
 * THE MINTED LINE, AND WHY IT IS MEASURED RATHER THAN ARGUED
 *
 * The economy is unbounded since this session: every level from 8 upward mints a look, and one in three of them
 * is a palette (lib/perks.ts). So the six above are no longer the whole set, and a suite that only measured them
 * would be asserting contrast for the palettes he has and saying nothing about the ones the ladder will hand him.
 *
 * THE ARGUMENT IS STRONG AND IT IS STILL NOT SUFFICIENT. A minted palette is hue and chroma over the SAME
 * lightness table as the default, and contrast is a function of lightness — so it inherits the default's proven
 * contrast by construction. But there is exactly one way hue and chroma CAN move luminance, and this file's own
 * header names it: pushing a colour out of the sRGB gamut, where it gets clamped. Clamping changes lightness, and
 * a generator that walks the whole hue wheel at chroma up to 2.7 is precisely the thing most likely to find that
 * edge. So the generated line gets the full pair list, in both schemes, exactly like the hand-written six.
 *
 * Forty is the sample, which is level 125 on the rotation — well past anything reachable in a decade, and far
 * enough round the wheel to visit every hue family several times at every chroma character.
 * ---------------------------------------------------------------------------------------------- */

const MINTED_SAMPLE = 40;
const MINTED_PALETTES = generatedPalettes(MINTED_SAMPLE);

console.log('\n  the minted palette line');
{
    /*
     * The closest call is tracked as `got / need` rather than as the lowest absolute ratio, because the pair list
     * mixes a 4.5 threshold for text with a 3 threshold for non-text — so the smallest number in the run is
     * usually not the pair with the least room left. Printing the tightest MARGIN is what tells the next person
     * whether the generator is near an edge; printing the smallest ratio would just name the focus ring every time.
     */
    let worst = null;
    let bad = 0;
    for (const def of MINTED_PALETTES) {
        const gen = paletteTokens(def);
        for (const [schemeName, fixed, skin] of [['dark', DARK, gen.dark], ['light', LIGHT, gen.light]]) {
            const theme = { ...fixed, ...skin };
            for (const [what, fg, bg, need] of PAIRS) {
                const got = ratio(theme[fg], theme[bg]);
                if (!worst || got / need < worst.got / worst.need) {
                    worst = { got, need, what, scheme: schemeName, label: def.label };
                }
                if (got < need) {
                    bad++;
                    failures++;
                    console.log(`     FAIL ${def.slug} (${def.label}) ${schemeName}: ${got}:1 needs ` +
                        `${need} — ${what}`);
                }
            }
        }
    }
    if (bad === 0) {
        console.log(`     ok   ${PAIRS.length} pairs pass in all ${MINTED_SAMPLE} minted palettes, ` +
            `both schemes (${PAIRS.length * MINTED_SAMPLE * 2} checks)`);
        console.log(`            closest call: ${worst.got}:1 against ${worst.need} — ${worst.what}, ` +
            `on ${worst.label} (${worst.scheme})`);
    }
}

console.log('\n  the default palette, pair by pair');
for (const [themeName, theme] of [['dark', DARK], ['light', LIGHT]]) {
    console.log(`\n  ${themeName}`);
    for (const [what, fg, bg, need] of PAIRS) {
        const got = ratio(theme[fg], theme[bg]);
        const ok = got >= need;
        if (!ok) failures++;
        console.log(`     ${ok ? 'ok  ' : 'FAIL'} ${String(got).padStart(6)}:1  needs ${need}  ${what}` +
            `  (${hexOf(...theme[fg])} on ${hexOf(...theme[bg])})`);
    }
}

/*
 * And prove the check can fail, on the same principle as everything else in tests/: a contrast checker that
 * cannot go red is a contrast checker nobody should trust. Three deliberate breaks now — one text pair, one
 * non-text pair, and one whole PALETTE, because the per-palette loop is new machinery and "it printed ok six
 * times" is not evidence that it would have printed FAIL.
 */
/*
 * ==================================================================================================
 * THE SURFACES, AND THE ONE RULE THAT MAKES THEM SHIPPABLE
 * ==================================================================================================
 *
 * The brief's warning was exact: *"a texture behind text is the first perk that breaks that guarantee"*. The
 * palettes are safe by construction because they only move hue and chroma; a texture modulates LIGHTNESS across
 * the page, per pixel, and the colour behind a letter stops being any single token.
 *
 * lib/surfaces.ts answers that by restriction: **every surface is built from `--s0` and `--s1` and nothing
 * else.** Both of those already carry an asserted pair against every ink in the interface, in six palettes and
 * both schemes, so every pixel behind every letter is one of two colours this file has already checked.
 *
 * This is that restriction as a CHECK rather than as a comment. A surface added in six months by someone who has
 * not read the header could otherwise drop `oklch(0.9 0.2 30)` into a `background-image` and put an unmeasurable
 * colour behind every heading on the page — and neither existing harness would notice: this file asserts tokens
 * and there would be no token, and C1 reads the computed `backgroundColor`, which for a gradient is transparent.
 *
 * Check C2 in tests/measure-layout.mjs is the other half: it measures the pixels actually painted behind every
 * text run. This proves the SYSTEM is safe; C2 proves the page is.
 */
console.log('\n  the page surfaces');
{
    /*
     * THE MINTED SURFACES ARE HELD TO THE SAME RESTRICTION, and this is what makes an unbounded axis shippable.
     *
     * The guarantee at the top of lib/surfaces.ts is a whitelist of three tokens, and a whitelist is the one kind
     * of guarantee that survives a set with no end: "somebody reviewed the five" cannot be said about a line that
     * keeps going, but "the only colour it can name is one of three" can. 120 minted surfaces is level 368 on the
     * rotation, which is far past anything reachable — the point is to exercise every motif at every scale and
     * angle the generator can produce, not to model his hub.
     */
    const mintedSurfaces = generatedSurfaces(120);
    const offenders = [...SURFACES, ...mintedSurfaces].filter(def => !surfaceUsesOnlyRampTokens(def));
    const ok = offenders.length === 0;
    if (!ok) failures += offenders.length;
    console.log(`     ${ok ? 'ok  ' : 'FAIL'} all ${SURFACES.length} named and ${mintedSurfaces.length} minted ` +
        'surfaces are built from --s0/--s1/--s2 only' +
        (ok ? '' : `\n            these reference something else: ${offenders.map(o => o.slug).join(', ')}`));

    /*
     * And the pairs that restriction relies on, asserted explicitly rather than left implicit in the list above.
     *
     * `text on the page` and `text on a panel` are already in PAIRS, so `--s0` and `--s1` are covered for the
     * main ink. What was NOT covered is every OTHER ink over `--s1`, because until now nothing but a panel was
     * ever painted `--s1` — a heading, a dim `why` line and an accent link all sit on `--s0` today and can sit on
     * an `--s1` grid line the moment a surface is on. Three of those five combinations had never been asserted.
     */
    const surfacePairs = [];
    for (const step of ['s1', 's2']) {
        surfacePairs.push(
            [`a heading over an ${step} pattern`, 'text', step, 4.5],
            [`a why line over an ${step} pattern`, 'dim', step, 4.5],
            [`metadata over an ${step} pattern`, 'mute', step, 4.5],
            [`a link over an ${step} pattern`, 'accent', step, 4.5],
            [`a success figure over an ${step} pattern`, 'ok', step, 4.5],
            [`a refusal over an ${step} pattern`, 'bad', step, 4.5],
            [`the decision accent over an ${step} pattern`, 'ask', step, 4.5],
            [`the focus ring over an ${step} pattern`, 'focus', step, 3],
        );
    }
    /* Over the minted palettes too: a pattern is painted in the ACTIVE palette's ramp, so an unbounded palette
     * line means these pairs have unbounded backgrounds. The two axes multiply, and neither one alone covers it. */
    const paletteSet = [...PALETTES, ...MINTED_PALETTES];
    for (const [themeName, fixed] of [['dark', DARK], ['light', LIGHT]]) {
        for (const def of paletteSet) {
            const theme = { ...fixed, ...paletteTokens(def)[themeName] };
            const bad = surfacePairs
                .map(([what, fg, bg, need]) => [what, ratio(theme[fg], theme[bg]), need])
                .filter(([, got, need]) => got < need);
            if (bad.length) {
                failures += bad.length;
                console.log(`     FAIL ${def.slug} ${themeName}: ` +
                    bad.map(([what, got, need]) => `${got}:1 needs ${need} — ${what}`).join('; '));
            }
        }
    }
    console.log(`     ok   ${surfacePairs.length} ink-over-surface-line pairs pass in ` +
        `${paletteSet.length} palettes (${PALETTES.length} named + ${MINTED_PALETTES.length} minted) ` +
        'and both schemes');
}

console.log('\n  proving the check can fail');
const broken = { ...DARK, dim: [0.34, 0.01, 80], focus: [0.30, 0.01, 255] };
const textCaught = ratio(broken.dim, broken.s0) < 4.5;
const uiCaught = ratio(broken.focus, broken.s0) < 3;
console.log(`     ${textCaught ? 'ok  ' : 'FAIL'} a too-dark text colour is caught ` +
    `(${ratio(broken.dim, broken.s0)}:1)`);
console.log(`     ${uiCaught ? 'ok  ' : 'FAIL'} a too-dark focus ring is caught ` +
    `(${ratio(broken.focus, broken.s0)}:1)`);
if (!textCaught || !uiCaught) failures++;

/*
 * A palette that breaks the ONE rule palettes have: it moves lightness.
 *
 * Chroma alone cannot fail — that was measured, and it is the whole reason this feature is safe — so an
 * injection that only over-saturates would pass and prove nothing. This one lifts the darkest surfaces until
 * the text on them falls under 4.5:1, which is exactly the mistake a hand-written palette would make.
 */
const wrecked = paletteTokens({ slug: 'x', label: 'x', blurb: 'x', hue: 70, chroma: 1, accentHue: 258 });
wrecked.dark.s0 = [0.72, 0.014, 70];
wrecked.dark.s1 = [0.74, 0.016, 70];
const wreckedTheme = { ...DARK, ...wrecked.dark };
const paletteCaught = PAIRS.some(([, fg, bg, need]) => ratio(wreckedTheme[fg], wreckedTheme[bg]) < need);
console.log(`     ${paletteCaught ? 'ok  ' : 'FAIL'} a palette that moves LIGHTNESS is caught ` +
    `(text on its page: ${ratio(wreckedTheme.text, wreckedTheme.s0)}:1)`);
if (!paletteCaught) failures++;

/*
 * A SURFACE THAT SMUGGLES IN A COLOUR, which is the failure the whole surfaces axis is guarded against.
 *
 * The restriction is a whitelist of two tokens rather than a blacklist of colour syntaxes, so this injects
 * several shapes an author might reach for — a raw oklch, a named colour, a hex, a color-mix and a currentColor —
 * and asserts every one is rejected. A guard that only catches the syntax you thought of is not a guard.
 */
const smuggled = [
    'repeating-linear-gradient(0deg, oklch(0.9 0.2 30) 0 1px, transparent 1px 32px)',
    'repeating-linear-gradient(0deg, red 0 1px, transparent 1px 32px)',
    'radial-gradient(#ff0000 1px, transparent 1.4px)',
    'radial-gradient(color-mix(in srgb, var(--s1) 50%, white) 1px, transparent 2px)',
    'radial-gradient(currentColor 1px, transparent 2px)',
    'radial-gradient(var(--ask) 1px, transparent 2px)',
    'radial-gradient(var(--s3) 1px, transparent 2px)',
];
const allCaught = smuggled.every(image =>
    !surfaceUsesOnlyRampTokens({ slug: 'x', label: 'x', blurb: 'x', image, size: '32px' }));
console.log(`     ${allCaught ? 'ok  ' : 'FAIL'} a surface referencing any colour but a ramp step is caught ` +
    `(${smuggled.length} shapes tried)`);
if (!allCaught) failures++;

console.log(failures === 0
    ? `\n  ${PAIRS.length} pairs pass in ${PALETTES.length + MINTED_SAMPLE} palettes ` +
      `(${PALETTES.length} named + ${MINTED_SAMPLE} minted) across both schemes ` +
      `(${PAIRS.length * (PALETTES.length + MINTED_SAMPLE) * 2} checks), and the check was shown to fail.\n`
    : `\n  ${failures} pair(s) fail.\n`);

process.exitCode = failures === 0 ? 0 : 1;
