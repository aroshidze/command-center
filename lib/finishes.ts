/**
 * CREST FINISHES — the second perk axis, and the one with no legibility risk at all.
 *
 * ==================================================================================================
 * WHY THIS AXIS FIRST, AHEAD OF EVERYTHING ELSE THAT SOUNDED MORE EXCITING
 * ==================================================================================================
 *
 * He asked for perks to become a collection worth having rather than a colour picker. The candidate axes were
 * palettes (shipped), crest finishes, page surfaces, typographic sets and insignia. They are not equally safe,
 * and rule 4 of the perk system — **no perk may make the interface less legible** — is what orders them.
 *
 * A finish changes how the crest is DRAWN. The crest is an `aria-hidden` graphic with no text anywhere on or
 * near it, and every colour it uses is already a token with an asserted pair (`prove:palette` covers ink on the
 * field, ink on the chief, and ink over the brightest and darkest possible project band). So a finish cannot
 * reduce legibility of anything, at all, by construction — there is no text for it to sit behind. That makes it
 * the one axis where "beautiful" is the only question.
 *
 * It is also the axis with the most to say. The crest is already a function of six parts of his history; a
 * finish is a second dimension over the same object, so two people at the same level with the same projects can
 * still have visibly different crests. That is what a collection is for.
 *
 * ==================================================================================================
 * WHAT A FINISH IS ALLOWED TO BE, AND WHAT IT IS NOT
 * ==================================================================================================
 *
 * **EVERY COLOUR A FINISH PAINTS IN IS A TOKEN.** No gradients, no shadows, no opacity stacks. A gradient's
 * colour at any given pixel is not a token, so `prove:palette` cannot assert it and a canvas read can only report
 * the composite — the same reason the crest's project bands are opaque rather than translucent.
 *
 * THAT IS A COLOUR RULE AND IT IS NOT A SHAPE RULE, and conflating the two is what made the first version of this
 * set a failure. The rule as originally written here said a finish is "stroke and geometry only… differs only in
 * WHERE and HOW THICKLY", which ruled out the silhouette and left five crests differing by fractions of a pixel.
 * See the block below. A finish may change the outline, the division of the field and whether the crest sits above
 * or below the panel — all of it in tokens, all of it assertable, none of it subtle.
 *
 * ==================================================================================================
 * THE GATES: MARKS, NOT LEVELS, FOR EVERYTHING PAST THE FIRST
 * ==================================================================================================
 *
 * A level is a smooth function of volume, so level-gated perks arrive on a schedule and none of them can feel
 * like a surprise. A mark is a SHAPE of work — clearing a whole project, twenty agents unblocked inside an hour
 * — so a mark-gated finish says something about how he worked rather than how much. The brief is explicit that
 * the rare ones should hang off marks, and it is right: rarity means nothing if everything is volume.
 */

/**
 * ==================================================================================================
 * THE FIRST VERSION OF THIS FILE WAS A FAILURE, AND IT IS WORTH RECORDING WHY
 * ==================================================================================================
 *
 * The five finishes shipped as: a hairline inset from the edge, seven or thirteen diagonal hatch lines at 0.14
 * alpha, round-capped strokes changed to tapered wedges, a solid rather than tinted rosette, and three small
 * dots. Rendered at the 96px they actually appear at, **four of those five knobs are below the threshold of
 * perception.** His reaction, verbatim: *"they kinda look the same dude… very, very slightly different from each
 * other. Many users won't even notice anything."*
 *
 * He is right, and the mistake was not a lack of care — it was a self-imposed constraint. The old header of this
 * file said a finish is "STROKE AND GEOMETRY ONLY. No gradients, no shadows, no opacity stacks", justified by
 * keeping every colour a token so contrast stays assertable. That justification is sound and the conclusion drawn
 * from it was wrong: it quietly ruled out the one lever that actually changes an object at a glance, which is
 * **the silhouette**, and left only differences measured in fractions of a pixel.
 *
 * ==================================================================================================
 * WHAT A FINISH CHANGES NOW
 * ==================================================================================================
 *
 * The outline itself, the way the field is divided, and whether the crest reads as cut INTO the panel or raised
 * OUT of it. A shield, a swallowtail banner, a diamond, a roundel and a castellated crest are five different
 * objects — you can tell them apart from across a room, which is what a collection needs and what the old set
 * could not do at any size.
 *
 * The colour discipline is unchanged and does not need relaxing to get here. Every fill is still a token:
 * `--s0` or `--s4` for the silhouette, `--crest-pale-*` for the bands, `--s0` for the chief and the charge's
 * well, the ink for the geometry. Nothing about a finish is a gradient, a shadow or an alpha stack, so nothing
 * about it is unmeasurable — the restriction was never the problem, the timidity was.
 *
 * THE CHIEF USED TO BE `--s3` AND IS NOT ANY MORE, which is worth a line because it removed a colour from the
 * object rather than adding one. A mid-grey slab across the top of a coloured field was a fourth value in a
 * drawing that wanted three, and the two pairs `prove:palette` held for it were asserting a combination the
 * code no longer produces. See the chief in app/components/Crest.tsx.
 *
 * WHAT IS PRESERVED, AND IT IS A RULE RATHER THAN CAUTION: `plain` is the shield with vertical bands, exactly as
 * before. Levels 1–10 on the default finish draw precisely what they drew last night. A reward system that
 * re-scores its own past is a lie told by an upgrade.
 */

/** The outline. This is the part you recognise before you have read anything. */
export type Silhouette = 'shield' | 'banner' | 'lozenge' | 'roundel' | 'castle';

/**
 * How the projects divide the field. Same facts, laid out differently — and still countable.
 *
 * FIVE DIVISIONS FOR FIVE FINISHES, AND NO TWO SHARE ONE. That is deliberate and it is the second correction
 * this file needed: after the silhouettes landed, `plain` and `crowned` were still the closest pair in the set
 * because both drew vertical bands, and a shield and a castellated shield are relatives. Family resemblance is
 * worth having and it is not worth having twice — so the division now differs as well, which means every pair in
 * the set differs on at least two axes rather than one.
 */
export type FieldDivision = 'pales' | 'bars' | 'wedges' | 'chevrons' | 'rim';

export interface FinishDef {
    slug: string;
    label: string;
    /** One line, in his language, about what it feels like. Shown beside the sample. */
    blurb: string;
    silhouette: Silhouette;
    division: FieldDivision;
    /**
     * `inset` fills the field with `--s0`, below the panel, so the crest reads as stamped into it.
     * `raised` fills it with `--s4`, above the panel, so it reads as a medal sitting on top.
     *
     * This is the second-biggest lever after the outline and it costs nothing but two asserted pairs: it inverts
     * the whole value structure of the object, so a raised crest and an inset one are different at a glance even
     * when the silhouette matches.
     */
    ground: 'inset' | 'raised';
    /**
     * How big the seal is relative to the outline, as a multiplier on the ring and everything inside it.
     *
     * THE THIRD LEVER, AND ITS ABSENCE IS WHY THE SECOND VERSION STILL READ AS SAME-ISH. Changing the outline
     * and the field made five different FRAMES and left the PICTURE identical: the same circular ring, the same
     * ten ray positions, the same rosette, at the same size, in the middle of every one of them. And the seal is
     * the part the eye goes to, so five frames around one picture still reads as one object in five mounts.
     *
     * A small seal on a wide field and a seal that fills its outline to the edge are different compositions, not
     * different decorations. It costs nothing — every radius inside the seal is already derived from `ring`.
     */
    sealScale: number;
    /**
     * Whether the charge is struck into a WELL of the ground token, or sits straight on the divided field.
     *
     * THIS REPLACED `track`, WHICH WAS "IS THE FAINT CIRCLE BEHIND THE PROGRESS ARC DRAWN". The arc is gone —
     * see the header of Crest.tsx for why `fraction` left the graphic — so the knob it belonged to went with
     * it, and what took its place is a far bigger lever than the one it replaced.
     *
     * A well halves the coloured area, gives the charge a guaranteed background, and makes the object read as
     * struck. Removing it puts a project's own hue behind the charge and through the keyway at its centre,
     * which is louder, more particular to him, and the right call on exactly two of the five:
     *
     *   - `ledger`'s field is already a rim, so the middle is bare ground and a well would be a disc of the
     *     colour that is already there.
     *   - `struck` is the one that is supposed to be the boldest object in the set.
     */
    well: boolean;
    /** Marks around the outline. Placed per silhouette — see `ORNAMENTS` in Crest.tsx. */
    ornaments: boolean;
}

export const FINISHES: FinishDef[] = [
    {
        slug: 'plain',
        label: 'Plain',
        blurb: 'A shield cut into the page, with an upright stripe for each project and the shape in the '
            + 'middle set into a dark circle. Where everyone starts.',
        silhouette: 'shield', division: 'pales', ground: 'inset',
        sealScale: 1, well: true, ornaments: false,
    },
    {
        slug: 'etched',
        label: 'Etched',
        blurb: 'A hanging banner with a notch cut out of the bottom. The project stripes run across instead '
            + 'of down, and the middle is small and set high, so the stripes are what you notice.',
        silhouette: 'banner', division: 'bars', ground: 'inset',
        /* Deliberately small, high on a tall field of bars: the bars are what this one is about. */
        sealScale: 0.68, well: true, ornaments: false,
    },
    {
        slug: 'struck',
        label: 'Struck',
        /* "the rays run to the points" was on this card and it is not true — they stop well short of them. A
         * sentence on the page that the drawing does not support is the same class of defect as a figure that
         * cannot be recomputed from the rows, and it is worse here because it is describing a picture the reader
         * is looking at while they read it. The line below describes what the finish actually does now: no
         * well, so the wedges run under the charge and a project's own colour shows through its keyway. */
        blurb: 'A diamond standing on its point, raised off the page. The projects are wedges spreading from '
            + 'the centre, and there is no dark circle behind the middle — so a project’s own colour shows '
            + 'through it. The biggest and boldest of them.',
        silhouette: 'lozenge', division: 'wedges', ground: 'raised',
        sealScale: 1.3, well: false, ornaments: false,
    },
    {
        slug: 'crowned',
        label: 'Crowned',
        blurb: 'A shield with battlements along the top, raised off the page, with the projects stacked as '
            + 'V-shaped bands. The loudest of them, and the hardest to get.',
        silhouette: 'castle', division: 'chevrons', ground: 'raised',
        /* 0.90 rather than 0.82: at 0.82 the sun sat small in a wide field of chevrons and the loudest finish
         * in the set was the quietest thing on the page. Measured by photographing /looks at 150px, which is
         * where the choice is actually made. */
        sealScale: 0.90, well: true, ornaments: true,
    },
    {
        slug: 'ledger',
        label: 'Ledger',
        blurb: 'No shield at all — a circle, with the projects as a coloured ring around the edge and the '
            + 'middle left bare. The plainest shape of the five.',
        silhouette: 'roundel', division: 'rim', ground: 'inset',
        /* No well: the middle of a rim-divided field is already bare ground, so a disc of the ground token
         * there would be a shape you could not see. */
        sealScale: 0.94, well: false, ornaments: true,
    },
];

export const DEFAULT_FINISH = FINISHES[0]!.slug;

/* ==================================================================================================
 * THE GENERATED LINE — finishes composed from the product space rather than written out
 * ==================================================================================================
 *
 * The five above are gated at levels 1, 3 and on three marks. `tests/ladder.mjs` K10/K11, written before any of
 * this existed, measured the consequence: past level 7 no level bought anything on any axis, ever.
 *
 * WHY THIS AXIS CAN BE GENERATED HONESTLY, WHICH IS NOT OBVIOUS
 *
 * A finish is already six independent fields, and every one of them takes its values from a closed set that the
 * component knows how to draw: five silhouettes, five divisions, two grounds, a seal scale, a well, ornaments.
 * The five hand-written finishes are five POINTS in a space of several hundred. So the generated line does not
 * invent anything the renderer has not already drawn — it visits combinations nobody has written down yet, and
 * every one of them is composed of parts each of which is separately proven to render.
 *
 * That is a materially different claim from "generate a new shape", and it is the reason this is safe. There is
 * no new geometry, no new colour, and nothing for `prove:palette` to miss: every fill is still `--s0`/`--s4` for
 * the silhouette, `--crest-pale-*` for the bands and the ink for the charge.
 *
 * THE RULE THE NAMED SET OBEYS, AND THE GENERATED LINE HAS TO OBEY IT TOO
 *
 * "Every pair in the set differs on at least two axes rather than one" — the correction this file needed after
 * `plain` and `crowned` turned out to be the closest pair because both drew vertical bands. A generated line
 * walked with a stride of one on a single field would reproduce exactly the failure he named:
 *
 *     "they kinda look the same dude… very, very slightly different from each other."
 *
 * So the fields are walked on COPRIME STRIDES. The silhouette steps by 1 through 5, the division by 2 through 5,
 * the ground flips every index, the seal scale steps by 3 through 4. Consecutive entries therefore differ on the
 * silhouette AND the division AND the ground — three of the loudest levers at once, guaranteed by arithmetic
 * rather than by inspection. `tests/ladder.mjs` K13 asserts it over a long stretch, and also asserts that no
 * generated finish is a duplicate of one of the five named ones.
 */

const SILHOUETTES: Silhouette[] = ['shield', 'banner', 'lozenge', 'roundel', 'castle'];
const DIVISIONS: FieldDivision[] = ['pales', 'bars', 'wedges', 'chevrons', 'rim'];

/**
 * The seal scales the generated line uses.
 *
 * Bounded by what the named five proved renders: 0.68 is the smallest anything in the set has been and 1.3 the
 * largest, and both were arrived at by photographing `/looks` at 150px. The generated line stays inside that
 * measured range rather than extrapolating past it — a seal at 1.6 would put the rays through the outline, and
 * nothing outside this range has ever been looked at.
 */
const GENERATED_SCALE = [0.72, 1.24, 0.88, 1.06];

/**
 * The name each outline family carries, and these are SHOWN TO A PERSON — so they are ordinary words.
 *
 * They were `Lozenge` and `Roundel`, which are the names of the shapes in heraldry and mean nothing to anybody
 * else: a look called "Lozenge III" tells you nothing about what you have unlocked. `Diamond` and `Circle` say
 * exactly what the outline is. Check W1 in tests/ladder.mjs holds the old words out.
 */
const SHAPE_NAME: Record<Silhouette, string> = {
    shield: 'Shield', banner: 'Banner', lozenge: 'Diamond', roundel: 'Circle', castle: 'Bastion',
};

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

const GENERATED_PREFIX = 'crest-';

/** The nth finish of the generated line, 1-based. Pure: the slug in his cookie keeps its meaning. */
export function generatedFinish(index: number): FinishDef {
    const n = Math.max(1, Math.floor(index));
    const i = n - 1;
    const silhouette = SILHOUETTES[i % SILHOUETTES.length]!;
    const division = DIVISIONS[(i * 2 + 1) % DIVISIONS.length]!;
    const ground: 'inset' | 'raised' = i % 2 === 0 ? 'inset' : 'raised';
    const sealScale = GENERATED_SCALE[(i * 3) % GENERATED_SCALE.length]!;
    /*
     * A well on two thirds of them, on a period of three so it does not track the ground's period of two. `rim`
     * never gets one for the reason the named set records: the middle of a rim-divided field is already bare
     * ground, so a well there is a disc of the colour that is already there — a shape you cannot see.
     */
    const well = division !== 'rim' && i % 3 !== 2;
    const ornaments = i % 3 === 1;
    const round = Math.floor(i / SILHOUETTES.length) + 1;

    const divisionWord = division === 'pales' ? 'an upright stripe for each project'
        : division === 'bars' ? 'the project stripes running across'
            : division === 'wedges' ? 'the projects as wedges from the centre'
                : division === 'chevrons' ? 'the projects stacked as V-shaped bands'
                    : 'the projects as a coloured ring around the edge';
    return {
        slug: `${GENERATED_PREFIX}${n}`,
        label: `${SHAPE_NAME[silhouette]} ${numeral(round)}`.trim(),
        blurb: `${ground === 'raised' ? 'Raised off the page' : 'Cut into the page'}, with ${divisionWord}`
            + `${well ? ', and the middle set into a dark circle' : ', and the middle left bare'}. `
            + 'Put together from the same parts as the five above, and earned by reaching a level.',
        silhouette,
        division,
        ground,
        sealScale,
        well,
        ornaments,
    };
}

/** The first `count` of the generated line. */
export function generatedFinishes(count: number): FinishDef[] {
    return Array.from({ length: Math.max(0, count) }, (_, i) => generatedFinish(i + 1));
}

/** The index a generated slug names, or null. Parsed locally — see `generatedPaletteIndex` for why. */
export function generatedFinishIndex(slug: string): number | null {
    if (!slug.startsWith(GENERATED_PREFIX)) return null;
    const rest = slug.slice(GENERATED_PREFIX.length);
    if (!/^[1-9][0-9]{0,3}$/.test(rest)) return null;
    return Number(rest);
}

export function finishBySlug(slug: string): FinishDef | null {
    const named = FINISHES.find(f => f.slug === slug);
    if (named) return named;
    const index = generatedFinishIndex(slug);
    return index === null ? null : generatedFinish(index);
}

/**
 * The outline of each silhouette, on the 88x104 grid the crest is drawn on.
 *
 * Here rather than in the component because three things need them and must agree: the clip path that keeps the
 * bands inside the shape, the rim lines that trace it (which carry the estimated hours), and the ornaments that
 * sit on it. Three hand-written copies of a path is how a finish ends up with its bands clipped to one outline
 * and its edge drawn as another.
 *
 * Every one is closed and stays inside the box with margin, because check P7 exists to catch a stroke escaping
 * this graphic and that has happened before.
 */
export const SILHOUETTE_PATH: Record<Silhouette, string> = {
    /* The original. Rounded shoulders, straight flanks, a point at the base. */
    shield: 'M6 16 Q6 7 15 7 H73 Q82 7 82 16 V58 Q82 82 44 97 Q6 82 6 58 Z',
    /* A swallowtail: straight sides, and a base cut into two hanging points with a notch between them. The one
     * outline in the set that is wider than it is tall in its lower half, so it reads as cloth rather than
     * armour. */
    banner: 'M7 8 H81 V74 L60 94 L44 78 L28 94 L7 74 Z',
    /* A diamond on its point. No flat edges at all, which is what makes it unmistakable next to the others. */
    lozenge: 'M44 4 L84 52 L44 100 L4 52 Z',
    /* A circle, as a path so the clip, the rims and the ornaments can all use it. Centre 44,52 and r 40. */
    roundel: 'M4 52 A40 40 0 1 0 84 52 A40 40 0 1 0 4 52 Z',
    /* Battlements across the top of a shield. Same lower half as `shield`, so the two are clearly relatives —
     * which is the point: a collection wants family resemblance as well as difference. */
    castle: 'M6 22 H16 V10 H30 V22 H58 V10 H72 V22 H82 V58 Q82 82 44 97 Q6 82 6 58 Z',
};

/**
 * Where the seal sits, and how wide the chief band's pips may spread, per silhouette.
 *
 * A circle and a diamond are narrow at the top where a shield is wide, so a full-width row of pips would be
 * clipped away to nothing on those two. Measured off the paths above rather than guessed: the widest horizontal
 * chord near y=14 is about 54 units on the shield, 30 on the roundel and 22 on the lozenge.
 */
export const SEAL: Record<Silhouette, {
    cx: number; cy: number; ring: number;
    /** How wide the row of tier pips may spread. */
    chief: number;
    /**
     * Where the chief band sits, and how tall it is.
     *
     * Per silhouette because of `castle`: its battlements occupy y 10..22, and a chief band starting at y 0 —
     * which is what every shape had at first — painted straight over them. The one finish whose whole identity is
     * a crenellated top rendered with the crenellations invisible, which was the single most galling thing in the
     * first render of this set. Its band starts below them.
     */
    chiefY: number;
    chiefH: number;
}> = {
    /*
     * `chiefH` also decides where the row of pips hangs — they sit 2.5 units above the chief's lower edge, so
     * a band that is too SHALLOW pushes them up through the top of the outline. That is a real defect, found by
     * photographing /looks: the banner's band at 20 and the roundel's at 24 both put ink outside the shape.
     * They are 23 and 27 now, which lands the row inside every outline in the set.
     *
     * The lozenge's `chief` is 16 rather than 20 for the same family of reason at the other end: a diamond is
     * 8.75 units wide where the pips sit, so a wider spread walks the outer pips of a high tier off the shape.
     */
    shield: { cx: 44, cy: 52, ring: 21, chief: 54, chiefY: 0, chiefH: 21 },
    banner: { cx: 44, cy: 47, ring: 21, chief: 58, chiefY: 0, chiefH: 23 },
    lozenge: { cx: 44, cy: 54, ring: 20, chief: 16, chiefY: 0, chiefH: 28 },
    roundel: { cx: 44, cy: 52, ring: 22, chief: 30, chiefY: 0, chiefH: 27 },
    castle: { cx: 44, cy: 58, ring: 20, chief: 50, chiefY: 22, chiefH: 16 },
};

/**
 * How far the field division is inset on a RAISED finish, as a scale about the seal's centre.
 *
 * `ground` was invisible in the first render and this is why: `pales`, `bars` and `wedges` all cover the entire
 * silhouette, so whichever token filled the field underneath them was never seen. Two of the five finishes were
 * declaring themselves raised and drawing identically to the inset ones.
 *
 * Shrinking the division leaves a rim of `--s4` all the way round, which is what actually reads as a raised
 * bezel with the field sunk inside it — and it makes the ground do visible work rather than being a value in a
 * data structure. `rim` is exempt: it already leaves the field bare, which is the whole character of that one.
 */
export const RAISED_INSET = 0.8;
