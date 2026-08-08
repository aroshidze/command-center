/**
 * What a level is actually FOR.
 *
 * ==================================================================================================
 * THE PROBLEM THIS EXISTS TO FIX, IN HIS WORDS
 * ==================================================================================================
 *
 *     "I have a genius idea for the motivation. I thought — what do levels give us? NOW I KNOW! If each level
 *      will be granting new designs, new backgrounds, new elements, colours… The user could have all those
 *      settings to set anything he has unlocked."
 *
 * He is identifying a real defect, not asking for a feature. Before this, finishing work raised a number, and
 * the reward for the number going up was a bigger number, a longer rank name, and one more spoke on the emblem.
 * Every one of those is *about* the progress system. The progression was entirely self-referential: it described
 * itself and changed nothing he actually looked at.
 *
 * A perk is the first reward that is external to the scoring. It changes the hub he opens every morning.
 *
 * ==================================================================================================
 * FOUR RULES, EACH OF WHICH RULES SOMETHING OUT
 * ==================================================================================================
 *
 * 1. **UNLOCKED IS DERIVED. ONLY THE CHOICE IS STORED.**
 *    Which perks he has is a pure function of the same `standing` and `marks` every figure on the page comes
 *    from — no `unlocked` table, no grant events, nothing to backfill. Re-opening a task takes points back and
 *    can therefore take a perk back, and that is correct: the alternative is a hub where the score is honest and
 *    the rewards are not. The one thing genuinely unknowable from the data is which of several unlocked looks he
 *    prefers, and that is a preference rather than progress. See `lib/looks.ts` for where it lives and why.
 *
 * 2. **NOTHING USEFUL IS EVER LOCKED.** Perks are appearance only. A hub that withholds a feature to motivate
 *    you is a hub that is worse at its job on purpose, and this one is a tool he depends on across fifteen
 *    projects. He asked for "some other enhancements too" and this is the line I am drawing inside that: a
 *    denser queue or a keyboard shortcut is *utility* and ships for everyone at level one.
 *
 * 3. **AN UNLOCK NEVER APPLIES ITSELF.** It announces itself once and waits. The hub changing its own
 *    appearance while he is reading step three of a task is the same defect as a list that reorders under his
 *    thumb — and a surprise redesign is worse, because he cannot tell whether he did something or something
 *    broke.
 *
 * 4. **NO PERK MAY MAKE THE INTERFACE LESS LEGIBLE.** Every palette is generated from one shared table of
 *    lightness values and asserted against all 74 contrast pairs in both schemes. See `lib/palettes.ts`; the
 *    constraint is structural rather than reviewed.
 */

import type { Mark, Standing } from './progress';

/**
 * THREE AXES NOW, AND THE ORDER THEY WERE ADDED IN IS THE ORDER OF LEGIBILITY RISK.
 *
 * He said: *"I have a feeling that the big part of this project will be creating amazing and beautiful perks for
 * the user which he can unlock and change and set any that he wants."* He is right, and rule 4 above is what
 * decides which axes are buildable at all.
 *
 *   - **palette** — safe by construction. Only hue and chroma move; contrast is a function of lightness.
 *   - **crest** — safe because there is no text anywhere on or near the crest, and a finish paints only in
 *     colours the plain crest already paints in. See lib/finishes.ts.
 *   - **surface** — the one the brief warned about, and the only one that needed a new guarantee AND a new
 *     check. Every surface is built from `--s0` and `--s1` and nothing else, so every pixel behind every letter
 *     is one of two colours the suite already asserts; check C2 then measures the RENDERED pixels rather than
 *     trusting that argument. See lib/surfaces.ts.
 *
 * TWO AXES WERE CONSIDERED AND DROPPED, and the reasoning is worth keeping so they are not re-proposed:
 *
 *   - **typographic sets.** There is no web font here and there must not be one — a font file is a network
 *     request, a flash of unstyled text and a dependency in a tool that has to still work in a year
 *     (docs/RESEARCH.md §13). Without one, a "set" can only shuffle system stacks, which means it renders
 *     differently on every machine and identically on some. A perk whose appearance depends on the operating
 *     system is not a perk he can collect.
 *   - **insignia** — a second small badge beside the crest. Dropped because it is the crest's job. Two identity
 *     graphics on one panel is the "same fact stated twice" defect that two marks with identical detail lines
 *     already had, and the pane has zero pixels spare at 1920 (check L7).
 */
export type PerkKind = 'palette' | 'crest' | 'surface';

/**
 * What has to be true to have earned it: a level, or a specific mark.
 *
 * Marks matter here as much as levels. A level is a smooth function of volume, so level-gated perks arrive on a
 * predictable schedule and none of them can ever feel like a surprise. A mark is a *shape* of work — clearing a
 * whole project, answering fifty decisions before their deadlines — so a mark-gated perk is the only kind that
 * says something about HOW he worked rather than how much. Rarity means nothing if everything is volume.
 */
export type Requirement =
    | { kind: 'level'; level: number }
    | { kind: 'mark'; mark: string; markLabel: string };

export interface PerkDef {
    slug: string;
    kind: PerkKind;
    label: string;
    requires: Requirement;
}

/**
 * The perks, and the gates.
 *
 * DELIBERATELY FRONT-LOADED. Three of the six palettes are reachable inside the first few levels, because a
 * reward surface whose first item costs a month is a reward surface he sees once, empty, and never returns to.
 * Measured against his real hub, which was level 4 with 226 points when this was written: he has three of six
 * on the day it ships, and the next is close enough to be worth finishing something for.
 *
 * The last two are gated on MARKS rather than levels, so the rarest looks are attached to the rarest shapes of
 * work rather than simply to having done more of everything.
 */
export const PERKS: PerkDef[] = [
    {
        slug: 'graphite', kind: 'palette', label: 'Graphite',
        requires: { kind: 'level', level: 1 },
    },
    {
        slug: 'slate', kind: 'palette', label: 'Slate',
        requires: { kind: 'level', level: 2 },
    },
    {
        slug: 'bronze', kind: 'palette', label: 'Bronze',
        requires: { kind: 'level', level: 4 },
    },
    {
        slug: 'ink', kind: 'palette', label: 'Ink',
        requires: { kind: 'level', level: 6 },
    },
    {
        slug: 'moss', kind: 'palette', label: 'Moss',
        /* Clearing a project outright is a different achievement from finishing a lot of tasks, and it is the
         * one the empty-hub design leans on hardest — an empty queue is SUCCESS, and this is the look that says
         * so. */
        requires: { kind: 'mark', mark: 'cleared-a-project', markLabel: 'Cleared a whole project' },
    },
    {
        slug: 'plum', kind: 'palette', label: 'Plum',
        requires: { kind: 'mark', mark: 'ten-before-deadline', markLabel: 'Ten decisions before their deadline' },
    },

    /* ------------------------------------------------------------------ crest finishes: lib/finishes.ts
     *
     * FRONT-LOADED THE SAME WAY THE PALETTES ARE, and for the same measured reason: a reward surface whose
     * first item costs a month is a surface he opens once, empty, and never returns to. `Etched` is level 3,
     * which his real hub passed in the first week.
     *
     * Everything above it is MARK-gated, so a finish says something about the shape of the work. `Crowned` and
     * `Ledger` are attached to the two rarest things in the mark set — taking the whole hub to zero, and
     * twenty agents unblocked inside an hour — because those are the two that cannot be reached by volume.
     */
    {
        slug: 'plain', kind: 'crest', label: 'Plain',
        requires: { kind: 'level', level: 1 },
    },
    {
        slug: 'etched', kind: 'crest', label: 'Etched',
        requires: { kind: 'level', level: 3 },
    },
    {
        slug: 'struck', kind: 'crest', label: 'Struck',
        requires: { kind: 'mark', mark: 'ten-finished', markLabel: 'Ten tasks finished' },
    },
    {
        slug: 'crowned', kind: 'crest', label: 'Crowned',
        requires: { kind: 'mark', mark: 'all-clear', markLabel: 'The whole hub reached zero' },
    },
    {
        slug: 'ledger', kind: 'crest', label: 'Ledger',
        requires: {
            kind: 'mark', mark: 'twenty-under-an-hour',
            markLabel: 'Twenty agents unblocked inside an hour',
        },
    },

    /* ----------------------------------------------------------------- page surfaces: lib/surfaces.ts
     *
     * The axis that changes the largest area on the screen, so the gates are a little further out than the
     * finishes' — a surface is the first thing he would see change, and something that reshapes the whole page
     * should not arrive in week one alongside three other unlocks.
     *
     * `Vellum` is gated on clearing a project, which is the same mark `Moss` uses. That is deliberate rather
     * than lazy: it means the moment he takes a project to zero he gets a palette AND a surface, so the
     * rarest shape of work in the mark set produces the loudest single change the hub can make to itself. One
     * mark unlocking two things is a better reward than two marks unlocking one each.
     */
    {
        slug: 'flat', kind: 'surface', label: 'Flat',
        requires: { kind: 'level', level: 1 },
    },
    {
        slug: 'dots', kind: 'surface', label: 'Dots',
        requires: { kind: 'level', level: 5 },
    },
    {
        slug: 'grid', kind: 'surface', label: 'Grid',
        requires: { kind: 'level', level: 7 },
    },
    {
        slug: 'weave', kind: 'surface', label: 'Weave',
        requires: { kind: 'mark', mark: 'ten-notes', markLabel: 'Ten tasks came back with a note' },
    },
    {
        slug: 'vellum', kind: 'surface', label: 'Vellum',
        requires: { kind: 'mark', mark: 'cleared-a-project', markLabel: 'Cleared a whole project' },
    },
];

/* ==================================================================================================
 * THE ECONOMY ABOVE LEVEL SEVEN, AND THE DEFECT IT EXISTS TO FIX
 * ==================================================================================================
 *
 * His words, and they are arithmetic rather than an impression:
 *
 *     "Every level-gated perk is at level 1 through 7. I am at level 4. From level 8 onward, forever, levelling
 *      up buys nothing."
 *
 * MEASURED BEFORE ANY OF THIS WAS WRITTEN, by two checks written on purpose to go red — `tests/ladder.mjs` K10
 * and K11:
 *
 *     K10  nothing a level can buy at: day 30, day 62, day 100, day 200, day 365, day 730
 *          <- at day 730 he is level 33 and the highest level gate in the whole economy is 7
 *     K11  53 of the 59 levels from 2 to 60 unlock nothing
 *
 * The comment above `PERKS` explains the front-loading and its reasoning is still correct: *"a reward surface
 * whose first item costs a month is a surface he sees once, empty, and never returns to."* That reasoning was
 * about the FIRST MONTH and it said nothing at all about the second year, and no check asked. This is the same
 * defect the level ladder itself had — `RANKS` was a ten-entry array that ended on day 30 — recreated one layer
 * up, in the very system that was built to fix it.
 *
 * WHAT THIS IS, AND WHY IT IS NOT SIMPLY THIRTY MORE ROWS
 *
 * Thirty more rows is a fixed list that ends one year further out, and then somebody has to notice again. The
 * ladder is unbounded BY CONSTRUCTION (`rungAt` extends for ever); a reward set that keeps up with it has to be
 * unbounded by construction too, or the two diverge the moment nobody is adding rows by hand.
 *
 * So: the sixteen named perks above are untouched — they keep their gates and their marks, because re-scoring
 * what he has already earned is a lie told by an upgrade. Above them, **every level from 8 upward mints exactly
 * one perk, rotating through the three axes.** Level 8 a palette, 9 a crest finish, 10 a surface, 11 a palette,
 * and so on with no end. Each axis knows how to mint its own — see `generatedPalette` in lib/palettes.ts,
 * `generatedFinish` in lib/finishes.ts and `generatedSurface` in lib/surfaces.ts.
 *
 * ONE PER LEVEL SOUNDS GENEROUS. IT IS NOT, AND THE REASON IS THE NICEST PART OF THIS DESIGN
 *
 * The rungs are QUADRATIC — `rungAt` widens the gap by `RUNG_STEP` every level — so at his measured rate they
 * are about ten days apart in month one, thirty by year one and ninety-one by year ten. One unlock per level
 * therefore delivers a reward rate that FALLS on its own, from roughly one a week at the start to one a quarter
 * a decade in, with no second tuning knob to get wrong and nothing to re-balance later.
 *
 * It is also worth saying what this deliberately does NOT do, because docs/RESEARCH.md §28.2 is the warning
 * against it: nothing here makes a threshold easier to reach. Duolingo lowered one, every engagement metric rose,
 * and in their own words "fewer learners were actually reaching their daily goals". The ladder is untouched — the
 * same points buy the same levels as they did last night. What changed is only what a level HANDS him.
 *
 * WHY THE PERKS ARE PASSED IN RATHER THAN IMPORTED, WHICH LOOKS LIKE AWKWARDNESS AND IS NOT
 *
 * This file cannot import the three axis modules. `tests/ladder.mjs` and `tests/palette.mjs` load these modules
 * directly through Node's type-stripping, which erases `import type` but cannot resolve an extensionless VALUE
 * import between two `lib/*.ts` files — AGENTS.md records the hour that cost, and it was re-verified with a
 * throwaway probe before this was written, because a constraint nobody has retested is a rumour.
 *
 * So this file owns the ROTATION (which axis, which index, at which level) and nothing else, and the caller —
 * which already has the axis modules — turns each gate into a `PerkDef`. `lib/looks.ts` does that for the app in
 * `generatedPerks`; `tests/ladder.mjs` does it independently, which makes the check a differential rather than a
 * restatement. That is the same shape and the same justification as `perkArrivals` below taking its ledger and
 * its marks as arguments.
 */

/** The first level whose reward is minted rather than listed. One above the highest hand-written gate. */
export const GENERATED_FROM = 8;

/**
 * The axes the generated line rotates through, in this order.
 *
 * Palette first because it is the loudest change the hub can make to itself, then the crest because it is the
 * part that is HIS, then the surface because it is the largest area and therefore the one worth waiting for.
 * Rotating rather than filling one axis at a time is what stops the collection becoming forty palettes and five
 * of everything else.
 */
const ROTATION: PerkKind[] = ['palette', 'crest', 'surface'];

/**
 * How far above his current level a locked generated perk is still shown.
 *
 * Exactly one rotation, so `/looks` always has precisely one locked item waiting in each of the three sections —
 * enough that every axis has something coming, few enough that the page is not a list of things he cannot have.
 * That is the judgement `/looks` already documents: a reward surface listing forty locked items is a page about
 * failure (docs/RESEARCH.md §14).
 */
export const LOOKAHEAD = ROTATION.length;

/** One minted gate: which axis, which item of that axis's line, and the level that hands it over. */
export interface GeneratedGate {
    kind: PerkKind;
    /** 1-based index into that axis's generated line. */
    index: number;
    level: number;
    slug: string;
}

/**
 * What a level mints, or null if it is one of the hand-written range.
 *
 * The slug is `<kind>-<index>` — `palette-1`, `crest-1`, `surface-1`. Each axis module parses that spelling
 * locally rather than importing it from here, for the value-import reason above; the two sides are held together
 * by check K12, which asserts that every gate this rotation mints resolves to a real definition on its own axis.
 * A comment claiming they agree would not be enough: the identical comment about `projectHueOf` was already false
 * once, which is why X4 exists.
 */
export function generatedGate(level: number): GeneratedGate | null {
    if (!Number.isFinite(level) || level < GENERATED_FROM) return null;
    const n = Math.floor(level) - GENERATED_FROM;
    const kind = ROTATION[n % ROTATION.length]!;
    const index = Math.floor(n / ROTATION.length) + 1;
    return { kind, index, level: Math.floor(level), slug: `${kind}-${index}` };
}

/** Every gate from `GENERATED_FROM` up to and including `uptoLevel`. Empty below level 8. */
export function generatedGates(uptoLevel: number): GeneratedGate[] {
    const out: GeneratedGate[] = [];
    for (let level = GENERATED_FROM; level <= uptoLevel; level++) out.push(generatedGate(level)!);
    return out;
}

/**
 * The perks of one kind, in unlock order. Used by `/looks` to render one section per axis.
 *
 * A function rather than three exported arrays, so adding a fourth axis is one row in `PerkKind` and one block
 * in `PERKS` — and so nothing can define a perk that no section renders. `perkBySlug` is deliberately NOT
 * kind-scoped: slugs are unique across the whole table, which is what lets the cookie hold three plain strings
 * and `resolveLooks` check each one without knowing which axis it came from.
 */
export function perksOfKind(kind: PerkKind, extra: PerkDef[] = []): PerkDef[] {
    return [...PERKS, ...extra].filter(p => p.kind === kind);
}

export function perkBySlug(slug: string): PerkDef | null {
    return PERKS.find(p => p.slug === slug) ?? null;
}

/** Has this one been earned? */
export function isUnlocked(perk: PerkDef, s: Standing, earned: Mark[]): boolean {
    const req = perk.requires;
    return req.kind === 'level'
        ? s.level >= req.level
        : earned.some(m => m.slug === req.mark);
}

/**
 * One perk with its state, and — when it is still locked — the honest sentence about what it costs.
 *
 * `remaining` is points for a level gate and null for a mark gate, because "3 more decisions answered inside
 * their deadline" is not a number of points and pretending it is would be the kind of invented figure P5 exists
 * to catch. The sentence says what is actually true in each case.
 */
export interface PerkState {
    perk: PerkDef;
    unlocked: boolean;
    /** What it takes, in one line, or null once it is his. */
    need: string | null;
    /** Points still to go, when that is a meaningful thing to say. Null for a mark gate or once unlocked. */
    remaining: number | null;
}

/**
 * `extra` is the minted line for his current level, assembled by the caller — `generatedPerks` in lib/looks.ts
 * for the app, and independently in tests/ladder.mjs. Defaulted to empty so a caller that only cares about the
 * hand-written sixteen (several of the K checks) needs no argument, and so this stays a pure function of what it
 * is handed rather than reaching for a module it is not allowed to import.
 */
export function perkStates(
    s: Standing, earned: Mark[], rungAt: (level: number) => number, extra: PerkDef[] = [],
): PerkState[] {
    return [...PERKS, ...extra].map(perk => {
        const unlocked = isUnlocked(perk, s, earned);
        if (unlocked) return { perk, unlocked, need: null, remaining: null };

        if (perk.requires.kind === 'level') {
            const at = rungAt(perk.requires.level);
            const remaining = Math.max(0, at - s.points);
            return {
                perk,
                unlocked,
                need: `Level ${perk.requires.level} — ${remaining} more point${remaining === 1 ? '' : 's'}`,
                remaining,
            };
        }
        return { perk, unlocked, need: `The mark: ${perk.requires.markLabel}`, remaining: null };
    });
}

/**
 * WHEN each unlocked perk arrived — derived, like everything else, and only possible because it is.
 *
 * Every gate is either a level or a mark, and both of those are dated: a level by `rankLedger` (which computes
 * the moment the rung was crossed from point accrual) and a mark by its own `at`. So the date an unlock
 * happened is a join, not a stored fact. There is no grants table and there must not be one, for the reason
 * rule 1 at the top of this file gives.
 *
 * Takes the ledger and the marks as ARGUMENTS rather than importing the derivation. That is not squeamishness:
 * `tests/ladder.mjs` loads this module through Node's type-stripping, which erases `import type` but cannot
 * resolve an extensionless value import between two `lib/*.ts` files — the trap AGENTS.md records. Passing the
 * two dated lists in keeps this file's only import type-only, and it is the better shape anyway, because the
 * caller already has both.
 *
 * A LEVEL-GATED PERK'S DATE IS THE MOMENT THE RUNG WAS CROSSED, NOT THE MOMENT THE PERK'S OWN LEVEL WAS
 * REACHED, and those differ: crossing straight past level 4 into level 5 in one decision means Bronze (level 4)
 * and any level-5 perk arrived at the same instant. Reporting the level-4 crossing as a separate earlier moment
 * would be inventing a timestamp. So the arrival is the first ledger entry whose level is at least the gate's.
 */
export interface PerkArrival {
    perk: PerkDef;
    at: string;
    /** What earned it, in one line, so the timeline row explains itself. */
    because: string;
}

export function perkArrivals(
    ledger: { level: number; at: string; rank: string }[],
    earned: { slug: string; at: string; label: string }[],
    /* The minted line, so the time machine shows the unlocks a level handed over as well as the hand-written
     * ones. Without it, standing in the past at level 20 would show a ledger of rank crossings that bought
     * nothing, which is the very defect this session exists to remove — visible in the one surface whose entire
     * job is to show how he got here. */
    extra: PerkDef[] = [],
): PerkArrival[] {
    const out: PerkArrival[] = [];
    for (const perk of [...PERKS, ...extra]) {
        if (perk.requires.kind === 'level') {
            const need = perk.requires.level;
            /*
             * Level 1 is not an arrival — it is where everyone starts, and `rankLedger` only records CROSSINGS,
             * so there is no entry for it and there should not be. A perk gated at level 1 (Graphite, the
             * default) has always been his; dating it from the first completion would claim he earned the thing
             * the hub shipped with.
             */
            if (need <= 1) continue;
            const hit = ledger.filter(l => l.level >= need).sort((a, b) => a.at.localeCompare(b.at))[0];
            if (hit) out.push({ perk, at: hit.at, because: `Reaching level ${need} — ${hit.rank}` });
        } else {
            const req = perk.requires;
            const mark = earned.find(m => m.slug === req.mark);
            if (mark) out.push({ perk, at: mark.at, because: `The mark: ${mark.label}` });
        }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The next thing he will unlock, or null when he has everything.
 *
 * Same shape and same honesty rule as `nextUp` for marks: cheapest first, and it names a real requirement rather
 * than a percentage. Level gates sort before mark gates when both are pending, because a level gate is a
 * countdown he can watch and a mark gate depends on what kind of work happens to arrive.
 */
export function nextPerk(states: PerkState[]): PerkState | null {
    const locked = states.filter(p => !p.unlocked);
    if (!locked.length) return null;
    const byPoints = locked
        .filter(p => p.remaining != null)
        .sort((a, b) => (a.remaining as number) - (b.remaining as number));
    return byPoints[0] ?? locked[0];
}
