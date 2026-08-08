/**
 * THE CREST'S CHARGE VOCABULARY — nine designed devices, as data rather than as drawing code.
 *
 * ==================================================================================================
 * WHY THIS IS A `lib/` MODULE AND NOT JSX INSIDE THE COMPONENT
 * ==================================================================================================
 *
 * The nine devices are ordered by **ink area, ascending**, and that ordering is load-bearing: it is what
 * guarantees the rule three passes on this graphic have been caught breaking — *a promotion may never make the
 * crest look emptier*. When the charge is SELECTED by history rather than computed from it, earning a new kind of
 * work swaps one device for another, and if the new one carries less ink than the old one the reward reads as a
 * loss.
 *
 * A guarantee that matters has to be checked, and `tests/ladder.mjs` cannot import a `.tsx` file. The options were
 * to restate the geometry in the check — which is a second copy that drifts, and this project already has one
 * comment that claimed two derivations matched and was false (see lib/colour.ts) — or to put the shapes somewhere
 * both can read. This is that. `app/components/Crest.tsx` renders these descriptors and check **X9** measures
 * them, so the ordering is asserted against the shapes that are actually drawn.
 *
 * It is a LEAF MODULE: no imports at all, so the suites can load it through Node's type-stripping. See AGENTS.md
 * for the cross-`lib` value-import trap that makes that a rule rather than a preference.
 *
 * ==================================================================================================
 * WHAT A DEVICE IS ALLOWED TO BE
 * ==================================================================================================
 *
 * Circles, regular polygons, star polygons and rotated bars, in solid ink, with shapes cut out. No gradients, no
 * shadows, no alpha — the crest's colour discipline is unchanged and it is a colour rule, not a shape rule
 * (lib/finishes.ts records the pass that got that backwards and shipped five indistinguishable finishes).
 *
 * Every dimension is a fraction of the charge's outer radius, so the whole vocabulary scales with the finish's
 * `sealScale` for free and no device can drift out of proportion with the others.
 */

/** One primitive. Every radius and length is a fraction of the charge's outer radius. */
export type Shape =
    | { s: 'circle'; r: number }
    /** A regular polygon, vertex-up: `n` 3 is a triangle pointing up, 4 a lozenge, 6 a hexagon. */
    | { s: 'poly'; n: number; r: number }
    /** A star polygon with `n` points at `r`, waisted to `ri`. */
    | { s: 'star'; n: number; r: number; ri: number }
    /** A bar through the centre: half-length `len`, width `w`, rotated `deg` degrees. */
    | { s: 'arm'; len: number; w: number; deg: number };

export interface ChargeDef {
    /**
     * WHAT THE SHAPE IS, IN PLAIN ENGLISH, because this string is shown to a person.
     *
     * It was heraldry's own word — *a mullet*, *a saltire*, *an annulet*, *a quartered disc* — on the reasoning
     * that heraldry had already solved naming a small vocabulary of abstract charges. It had, for heralds. Shown
     * to the person using the hub it was gibberish, and he said so:
     *
     *     "The charge? The bands? The bezel? The core? … like what is this talking about"
     *
     * A name here has exactly one job: someone who reads it should be able to look at the crest and see that
     * thing. *"A five-pointed star"* does that; *"a mullet"* does the opposite, because now there are two things
     * to work out instead of one. Check P8 in tests/measure-layout.mjs holds the old words out of the rendered
     * page.
     */
    name: string;
    solid: Shape[];
    /** Cut out of `solid`. The central void is added by the component for every device and is not listed here. */
    voids: Shape[];
}

/**
 * The nine, in the order `kinds` selects them — sparsest first.
 *
 * ORDERED BY MEASURED INK, and X9 asserts it rather than this comment promising it. The measurement is a
 * rasterisation of these very descriptors, so the check cannot pass while the drawing disagrees:
 *
 *      1  compass           0.25 of its circumscribed circle
 *      2  triangle          0.32
 *      3  mullet            0.34
 *      4  saltire           0.43
 *      5  cross             0.51
 *      6  disc and fess     0.55
 *      7  annulet           0.62
 *      8  quartered disc    0.64
 *      9  hexagon           0.74
 *
 * AND NO TWO OF THEM ARE THE SAME SHAPE, which is the second thing X9b measures and the harder one. Overlap is
 * intersection over union of the rasterised devices; the worst pair in this set is the cross and the quartered
 * disc at **61%**, against a limit of 80%. That margin is the evidence that these nine are a vocabulary rather
 * than a parameter sweep — and it was arrived at by search, not by eye. Four candidates were rejected:
 *
 *   - a *plain disc* as the ninth, at **81%** shared area with the hexagon. A hexagon and a circle are the two
 *     shapes here most likely to read as one object at 96px and I had put them adjacent at the top.
 *   - a *disc with a narrow fess*, at **90%** with that disc. A 0.20-radius slot is a scratch, not a division.
 *   - a *sun in splendour*, cut after LOOKING at it: eight radiating spikes immediately inside a bezel of ten
 *     radiating ticks is busy at 150px and mush at 96px. No check would have said so.
 *   - a *gyronny* — a ring with a saltire inside — also cut by looking: the ring left too little room for the
 *     saltire and the pierced centre covered what was left, so next to the plain annulet it was the same object.
 *
 * Two found by measurement, two by looking at the render. That split is the usual one on this graphic.
 */
export const CHARGES: ChargeDef[] = [
    /* 1 — COMPASS. Four points with deeply waisted flanks. The sparsest device, and what one kind of mark — his
       very first completion — selects. */
    { name: 'a four-pointed star', solid: [{ s: 'star', n: 4, r: 1, ri: 0.38 }], voids: [] },
    /* 2 — TRIANGLE, point up. Three straight edges, which nothing else in the set has. */
    { name: 'a triangle', solid: [{ s: 'poly', n: 3, r: 1 }], voids: [] },
    /* 3 — MULLET. A five-pointed star. The only other device that radiates, and it sits low deliberately: the
       bezel radiates too, and two rings of spikes is what the *sun in splendour* was cut for. */
    { name: 'a five-pointed star', solid: [{ s: 'star', n: 5, r: 1, ri: 0.46 }], voids: [] },
    /* 4 — SALTIRE. A diagonal cross of two bars. */
    {
        name: 'a diagonal cross',
        solid: [{ s: 'arm', len: 1, w: 0.46, deg: 45 }, { s: 'arm', len: 1, w: 0.46, deg: -45 }],
        voids: [],
    },
    /* 5 — CROSS. The same construction upright and wider. A cross and a saltire being one shape at two angles is
       exactly the family resemblance a heraldic vocabulary is supposed to have. */
    {
        name: 'a cross',
        solid: [{ s: 'arm', len: 1, w: 0.54, deg: 0 }, { s: 'arm', len: 1, w: 0.54, deg: 90 }],
        voids: [],
    },
    /* 6 — DISC AND FESS. A disc with a broad bar cut straight through it, so it reads as two half-discs. The void
       is the only horizontal line anywhere in the vocabulary.
     *
     * THE BAR IS 0.72 OF THE RADIUS AND IT WAS 0.20 FOR ONE ROUND, which check X9b rejected: a disc with a narrow
     * slot shares 90% of its area with the plain disc, so it was the same device twice. A slot has to be wide
     * enough to be a division rather than a scratch. */
    {
        name: 'a disc split in two',
        solid: [{ s: 'circle', r: 1 }],
        voids: [{ s: 'arm', len: 1.1, w: 0.72, deg: 0 }],
    },
    /* 7 — ANNULET. A thick ring, and the only closed curve in the set. */
    { name: 'a ring', solid: [{ s: 'circle', r: 1 }], voids: [{ s: 'circle', r: 0.62 }] },
    /* 8 — QUARTERED DISC. A disc cut saltirewise into four quadrants — dense, and unmistakably four things. */
    {
        name: 'a disc in four parts',
        solid: [{ s: 'circle', r: 1 }],
        voids: [{ s: 'arm', len: 1.1, w: 0.30, deg: 45 }, { s: 'arm', len: 1.1, w: 0.30, deg: -45 }],
    },
    /* 9 — HEXAGON. The densest device: nearly a disc, and unmistakably faceted, which is what makes it read as
     * struck metal rather than as a printed dot.
     *
     * A PLAIN DISC WAS THE NINTH FOR ONE ROUND AND X9b REJECTED IT TOO, at 81% shared area with this hexagon.
     * That is the check earning its place: a hexagon and a circle are the two shapes in this vocabulary most
     * likely to be the same object at 96px, and I had put them next to each other at the top of the range. */
    { name: 'a six-sided disc', solid: [{ s: 'poly', n: 6, r: 1 }], voids: [] },
];

/** The central void every device leaves, as a fraction of the charge's radius. Rarity is struck in here. */
export const CHARGE_VOID = 0.30;

/** Which device a count of mark-kinds selects. Clamped to the vocabulary and nothing else — there is no floor. */
export function chargeFor(kinds: number): ChargeDef {
    const n = Math.max(1, Math.min(CHARGES.length, Math.floor(kinds) || 1));
    return CHARGES[n - 1]!;
}

/**
 * Is a point inside a shape? Used to measure ink by rasterisation.
 *
 * Rasterised rather than integrated because the devices OVERLAP — a cross is two bars sharing a square, and
 * subtracting overlaps analytically means a formula per pair and a new one every time a device is added. Sampling
 * is exact enough for an ordering (X9 runs a 600x600 grid, so about 280,000 samples inside the circle) and it
 * cannot be wrong about a shape it has not been told to expect.
 */
function inside(shape: Shape, x: number, y: number): boolean {
    if (shape.s === 'circle') return x * x + y * y <= shape.r * shape.r;
    if (shape.s === 'arm') {
        const a = (-shape.deg * Math.PI) / 180;
        const rx = x * Math.cos(a) - y * Math.sin(a);
        const ry = x * Math.sin(a) + y * Math.cos(a);
        return Math.abs(rx) <= shape.len && Math.abs(ry) <= shape.w / 2;
    }
    /* Polygons and stars, by the winding rule over their vertex list. */
    const pts: [number, number][] = [];
    const count = shape.s === 'poly' ? shape.n : shape.n * 2;
    for (let i = 0; i < count; i++) {
        const r = shape.s === 'poly' ? shape.r : (i % 2 === 0 ? shape.r : shape.ri);
        const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

/**
 * The ink a device covers, as a fraction of its circumscribed circle. Solid, minus its voids, minus the central
 * void every device leaves.
 *
 * Exported so the check measures the shipped descriptors rather than a copy of them.
 */
/** Is this point inside the device's ink? Solid, minus its voids, minus the central piercing. */
function inkAt(def: ChargeDef, x: number, y: number): boolean {
    if (x * x + y * y <= CHARGE_VOID * CHARGE_VOID) return false;
    if (!def.solid.some(sh => inside(sh, x, y))) return false;
    return !def.voids.some(sh => inside(sh, x, y));
}

/**
 * How much two devices are the same shape: the area they share over the area they jointly cover, 0..1.
 *
 * INTERSECTION OVER UNION, AND IT EXISTS BECAUSE A CHECK OF MINE HAD A FALSE PREMISE. The first version of X9b
 * asserted that consecutive devices differ by at least 2% of ink, on the reasoning that two devices with the same
 * weight are probably the same object. It failed on **a triangle and a five-pointed star** — 1.7% apart in ink and
 * about as visually different as two shapes in this vocabulary get.
 *
 * The reasoning was wrong rather than the threshold: ink is a measure of WEIGHT and the property being guarded is
 * SHAPE, and those come apart exactly where a check would not notice. Tuning the number down would have kept a
 * check whose premise was false, which is how a check becomes a formality. This measures the thing itself —
 * two devices that occupy nearly the same pixels ARE nearly the same device, whatever they weigh.
 */
export function chargeOverlap(a: ChargeDef, b: ChargeDef, grid = 400): number {
    let both = 0;
    let either = 0;
    const step = 2 / grid;
    for (let gx = 0; gx < grid; gx++) {
        const x = -1 + (gx + 0.5) * step;
        for (let gy = 0; gy < grid; gy++) {
            const y = -1 + (gy + 0.5) * step;
            const ia = inkAt(a, x, y);
            const ib = inkAt(b, x, y);
            if (ia && ib) both++;
            if (ia || ib) either++;
        }
    }
    return either === 0 ? 1 : both / either;
}

export function chargeInk(def: ChargeDef, grid = 600): number {
    let ink = 0;
    let circle = 0;
    const step = 2 / grid;
    for (let gx = 0; gx < grid; gx++) {
        const x = -1 + (gx + 0.5) * step;
        for (let gy = 0; gy < grid; gy++) {
            const y = -1 + (gy + 0.5) * step;
            if (x * x + y * y <= 1) circle++;
            if (x * x + y * y <= CHARGE_VOID * CHARGE_VOID) continue;
            if (!def.solid.some(sh => inside(sh, x, y))) continue;
            if (def.voids.some(sh => inside(sh, x, y))) continue;
            ink++;
        }
    }
    return ink / circle;
}
