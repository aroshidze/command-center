import { crestGeometry, emblemInk, type CrestInput } from '../../lib/progress';
import {
    DEFAULT_FINISH, finishBySlug, RAISED_INSET, SEAL, SILHOUETTE_PATH,
} from '../../lib/finishes';
import { CHARGE_VOID, CHARGES, chargeFor, type Shape } from '../../lib/charges';

/**
 * The crest: a struck mark whose every part is a different fact about what he has actually done.
 *
 * WHY IT IS DRAWN RATHER THAN DOWNLOADED
 *
 * Unchanged across five passes and still the right call. The obvious builds are an avatar image set or an icon
 * library, and both are the wrong shape for this project: an image set means N PNGs to art-direct and re-export
 * the first time the palette moves, and an icon library is a dependency added in order to add pictures —
 * docs/RESEARCH.md §13 is about what that costs a tool that must survive being ignored. This is geometry with no
 * assets, no requests and nothing to keep in sync, and because it is built from tokens it recolours itself in
 * the light theme and in all six unlockable palettes for free.
 *
 * ==================================================================================================
 * THE SIXTH PASS: IT WAS AN EMBLEM AND A CHART AT ONCE, AND IT READ AS A COG
 * ==================================================================================================
 *
 * Five passes made this thing true and his verdict on the fifth was *"still kinda meh"*. The fifth pass's own
 * diagnosis had been right — everything was drawn at one weight, so it looked like a diagram — and it fixed that
 * with solid mass and negative space. What it could not fix, because the fix was the problem, is named exactly in
 * docs/BRIEF-PROGRESSION.md:
 *
 *     "The crest is trying to be an emblem and a data visualisation at the same time, and those want opposite
 *      things. An emblem is designed — its proportions are chosen because they look right. This one's proportions
 *      are dictated by numbers: the hole has seven sides because he has seven kinds of mark. You cannot make an
 *      arbitrary seven-sided hole look intentional, because it is not."
 *
 * Photographed at 150px the fifth pass's charge reads as **a cog**: a ten-toothed wheel with an N-gon hole. Four
 * earlier passes had adjusted those proportions and could not have succeeded, because a hub with teeth attached is
 * a cog however carefully the teeth are drawn.
 *
 * SO THE TWO JOBS WERE SEPARATED, which is the brief's untried hypothesis and the whole of this pass:
 *
 *   1. **THE CHARGE IS SELECTED, NOT COMPUTED.** `kinds` — how many kinds of work he holds a mark for — picks one
 *      of nine designed devices from lib/charges.ts. A triangle, a mullet, a saltire, a cross, a lozenge, an
 *      annulet, a hexagon, a disc and fess, a plate. Each was drawn to look right; none has a dimension that is a
 *      variable. **A designed shape chosen by his history can be beautiful; a shape whose every proportion is a
 *      reading is a chart.**
 *   2. **THE COUNT MOVED OFF IT ENTIRELY.** `rays` is a bezel of ten ticks in a ring OUTSIDE the charge, with
 *      clear ground between. The emblem and the readout stopped competing for the same pixels, which is why the
 *      cog is gone rather than merely tidier.
 *
 * Three values and four things to look at, in this order:
 *
 *   1. **THE CHARGE — solid ink mass.** One designed device, pierced at the centre. The only bright mass and the
 *      only part made of filled area rather than line, so it is unambiguously where the eye lands. The piercing is
 *      a real hole (an SVG mask), so what shows through is whatever is behind it — which is how negative space
 *      works, and why the same drawing can sit on all five finishes including the two with no well.
 *   2. **THE BEZEL — ten ticks at two lengths.** The level inside the tier. Countable, and never empty.
 *   3. **THE FIELD — colour, low value contrast.** The projects, as a surround rather than the dominant mass.
 *      Two muddy halves filling a shield is camouflage; the same colours as a border around a struck disc are
 *      enamel. **Area was the lever, not chroma** — see `--crest-pale-l` in app/globals.css for the two chroma
 *      attempts that failed first.
 *   4. **THE FRAME — 2.1px of structure**, carrying the rims, with 1.1px inner lines as the only detail.
 *
 * ==================================================================================================
 * WHAT EACH PART MEANS
 * ==================================================================================================
 *
 *   - the FIELD is the projects he has finished work in, in each project's own hue, divided five ways depending
 *     on the finish. Three regions and eight regions are different objects at a glance.
 *   - the CHIEF carries one pip per tier. Monotonic; a promotion can never take one away.
 *   - the BEZEL counts the level within the tier, 1..10. Ten positions always drawn, `rays` of them full length
 *     and the rest at 58% — so the ring is always whole and a promotion never empties it.
 *   - the CHARGE is which of nine devices his KINDS of mark select. It does not claim to be countable and
 *     `CrestKey` carries the number in words; see `facets` in lib/progress.ts for that decision in full.
 *   - HOW DEEPLY IT IS STRUCK — a boss, then a ring, then both — is the rarest mark he holds, 1..4.
 *   - the EDGE thickens with the estimated hours behind him.
 *
 * ==================================================================================================
 * WHAT THE FIFTH PASS REMOVED, KEPT HERE BECAUSE IT IS STILL THE REASON THIS FITS IN 96 PIXELS
 * ==================================================================================================
 *
 * **The progress arc is gone.** Seven encodings do not fit in 96px — four passes proved it by trying — and of the
 * seven `fraction` was the one to lose: the standing panel renders it as the progress bar directly beneath the
 * crest with the exact remainder printed beside it in words, so the arc was a second, vaguer copy of the bar it
 * sat on. It was also the only part `CrestKey` never had a row for, which was a better audit of the drawing than
 * the drawing was. What is lost, stated rather than buried: the time machine has no bar, so a past crest no
 * longer says how far through that level he was on that day.
 *
 * WHY THERE IS A KEY, AND WHY THE CREST IS A BUTTON
 *
 * docs/RESEARCH.md §14: if pressing it does nothing, it does not go on the page. And the rule that nothing may
 * be truncated without a route to the whole thing — the pales are capped at eight, and a cap with no route is
 * the exact finding `npm run audit` prints. Pressing the crest opens `CrestKey`, which names every part, what it
 * is derived from, and his real number for it.
 *
 * Geometry note: an 88x104 grid, chosen so the shield is taller than wide without fractional strokes at the
 * sizes it actually renders (96px in the pane, 150px on /looks, 116px on the bench).
 */

export default function Crest({ c, size = 96, finish = DEFAULT_FINISH }: {
    c: CrestInput;
    size?: number;
    /**
     * Which unlocked finish is on. See lib/finishes.ts for what a finish is allowed to be and why.
     *
     * Defaulted rather than required, so every existing call site keeps working and the bench, the time machine
     * and `/looks` can each choose. Falls back to Plain on an unknown slug: the server has already reduced the
     * cookie to what he has earned (lib/looks.ts), so an unknown value here means a bug rather than an attempt,
     * and drawing the plain crest is the right response to a bug on a graphic.
     */
    finish?: string;
}) {
    const g = crestGeometry(c);
    const f = finishBySlug(finish) ?? finishBySlug(DEFAULT_FINISH)!;
    /*
     * THE OUTLINE AND THE SEAL'S PLACE BOTH COME FROM THE FINISH.
     *
     * They were module constants — one shield path, one centre, one radius — which is exactly why the five
     * finishes all looked the same: whatever else they changed, they were all the same shape in the same place.
     * A circle is narrow where a shield is wide, so the seal and the chief have to move with the outline or the
     * clip eats them.
     */
    const SHIELD = SILHOUETTE_PATH[f.silhouette];
    const { cx: CX, cy: CY, chief: CHIEF, chiefY: CHIEF_Y, chiefH: CHIEF_H } = SEAL[f.silhouette];

    /*
     * EVERY RADIUS IN THE CHARGE SCALES TOGETHER, from one multiplier the finish chooses.
     *
     * Scaling them independently is how a tick ends up crossing its own charge, so they are all expressed as
     * fractions of `RING` and derived here rather than written out at each use. `sealScale` is the lever that
     * stopped the five finishes reading as one picture in five frames.
     *
     * The proportions are the composition, so they are stated in full in the block below rather than left as
     * magic numbers. Two earlier sets were wrong and the bench said so both times — a keyway at 0.30 of the ring
     * was a pinhole, and rays only half the hub's radius made eighteen histories look identical. Both of those
     * belonged to a charge that no longer exists: see the CHARGE vocabulary at the foot of this file for why the
     * shape is now selected rather than computed.
     */
    const SC = f.sealScale;
    const RING = SEAL[f.silhouette].ring * SC;
    /*
     * ==================================================================================================
     * THE SIXTH PASS'S PROPORTIONS: a designed charge, clear ground, then a bezel carrying the count
     * ==================================================================================================
     *
     * Reading outward from the middle, at the shield's RING of 21:
     *
     *      VOID_R      4.2   the pierced centre every device leaves. Rarity is struck in here.
     *      CHARGE_R   13.9   the charge's outer radius — one of nine designed devices (see lib/charges.ts)
     *      BEZEL_IN   22.3   where the ticks begin. 8.4 units of CLEAR GROUND between charge and bezel.
     *      BEZEL_OUT  26.4   where an earned tick ends — just inside the well's edge
     *      MEDALLION  26.9   the well the whole thing is struck into
     *
     * ==================================================================================================
     * THE BEZEL IS ON THE RIM, AND GETTING THAT WRONG TWICE IS WHAT THIS BLOCK IS FOR
     * ==================================================================================================
     *
     * The clear ring between the charge and the count is the whole design, not a margin. The fifth pass had the
     * count as teeth growing out of the charge's own hub — one object, so the emblem could not be an emblem and
     * the readout could not be read. That is a cog by construction.
     *
     * **The first attempt at fixing it put the ticks at 0.82 of the ring, and it was still a cog.** Blown up 4x
     * off `/looks` at 150px, the ten ticks sat 3.3 units from a charge 13.9 units across — a gap of 24% of the
     * charge's own radius — and the eye simply merged them. Separating two things by less than a quarter of the
     * larger one's size does not separate them. I had moved the teeth off the hub and left them touching it.
     *
     * A real bezel is at the RIM. 1.06 puts the ticks against the well's edge, where they read as a graduated
     * scale on the frame rather than as anything belonging to the device, and it opens the clear ring from 3.3
     * units to **8.4** — 60% of the charge's radius, out of space that was empty anyway. That is the difference
     * between a cog and a struck seal, and it cost nothing.
     *
     * The charge stayed at 0.66. It was 0.50 for one round and the bench said it was too small to be the dominant
     * mass: the eye went to the ring of ticks, and the four ring-shaped devices in that draft all collapsed into
     * "a small circle with a dot in it".
     */
    const CHARGE_R = RING * 0.66;
    const VOID_R = CHARGE_R * CHARGE_VOID;
    const BEZEL_IN = RING * 1.06;
    const BEZEL_OUT = RING * 1.255;
    /*
     * In radians at BEZEL_IN, so a tick keeps its shape on every finish's ring size.
     *
     * 0.055 rather than 0.075: the ticks are twice as far out now, and an angular width is an ARC — the same angle
     * that gave a 1.7-unit tick against the charge gives a 3.3-unit slab against the rim. Narrower keeps them
     * reading as marks on a scale instead of as a second set of teeth.
     */
    const BEZEL_W = 0.055;
    /* 1.24 and not 1.30. At 1.30 the well ate so much of the shield that the project bands were reduced to
     * slivers down each side, and the bands are the axis that makes the crest HIS. The well has to be big
     * enough to dominate and small enough to leave a countable frame; this is where those two meet. */
    const MEDALLION = RING * 1.28;
    /*
     * ==================================================================================================
     * A CLAIM OF MINE THAT A MEASUREMENT DISPROVED, KEPT BECAUSE IT IS THE MOST USEFUL THING HERE
     * ==================================================================================================
     *
     * The fifth pass wrote, in this file, that solid nubs on a wide-based wheel cut the tier-boundary loss "to a
     * third". Then it measured — ink pixels inside the charge, level 10 against level 11, on the rendered bench:
     *
     *      the design being replaced at the time   84% of the charge's ink survives the promotion
     *      that pass, first version                 67%
     *      that pass, hub and nubs widened          76%
     *
     * **The redesign was worse on the exact rule it was made to protect, and would have shipped saying the
     * opposite.** The better half of the lesson was that the old 84% was padded by furniture: the charge included
     * a decorative track circle carrying no information at all, and a constant circle inflates that ratio free.
     *
     * THE SIXTH PASS INHERITS THE LESSON AND CHANGES THE ARITHMETIC. The count is a BEZEL now, outside a charge
     * that does not change with the level at all — so at a tier boundary the charge, the void, the rarity, the
     * field, the well, the bands and the edge are all untouched, and the only ink that moves is nine ticks
     * shortening. That is a far smaller share than a wheel losing nine teeth, and it is measured rather than
     * claimed: check X9 asserts the ratio at every tier boundary to level 110 and prints the worst one.
     */
    /* Above the panel or below it. Two tokens, six asserted pairs, and it inverts the whole value structure of
     * the object — see `ground` in lib/finishes.ts. */
    const groundFill = f.ground === 'raised' ? 'var(--s4)' : 'var(--s0)';
    /*
     * THE WELL AND THE CHIEF ARE ALWAYS `--s0`, EVEN ON A RAISED FINISH — and that is a defect found by
     * photographing /looks at 150px rather than a preference.
     *
     * They used to take `groundFill` too, which on `crowned` and `struck` meant the silhouette, the raised rim,
     * the chief band and the well were all `--s4` at once. The result was a large pale-grey slab across the
     * middle of the loudest finish in the set, with the charge sitting on it at 3.54:1 — passing, and washed
     * out. Three parts of one object painted in one token is not a raised medal, it is a grey blob.
     *
     * A well is a RECESS. A real struck medal is raised at its edge and cut away where the charge sits, and
     * that is exactly the value structure this restores: `--s4` at the rim, the project colours between, `--s0`
     * where the charge is struck, ink on top. Four values, deepest in the middle. `ground` still does its job —
     * it changes the silhouette's fill and the rim that shows around the inset field — and it does it without
     * flattening the part of the drawing the eye actually lands on.
     */
    const wellFill = 'var(--s0)';
    /*
     * The ink, from `emblemInk` rather than a second copy of the expression.
     *
     * L and C are tokens (`--emblem-l`, `--emblem-c`) so the light theme can darken them; only the hue is
     * computed. That split is what makes a single asserted contrast pair per theme sufficient for the whole
     * hue walk — hue is the one dimension that cannot move luminance. It was a literal, `oklch(0.82 0.13 h)`,
     * which put the emblem outside every contrast check the project had and left it at roughly 1.4:1 on a
     * light desktop. See the `--emblem-l` comment in app/globals.css.
     *
     * Still set inline as `--emblem-ink` as well as used directly: the standing panel sets the same value on
     * itself so the progress bar can inherit it, but the bench (app/emblem/page.tsx) renders this standalone
     * with no panel above it.
     */
    const ink = emblemInk(c.level);
    /* The one remaining use of alpha, and it is deliberately narrow: the inner rim lines are the only genuinely
     * secondary marks left in the drawing. Everything that carries a count is now solid. */
    const inkSoft = `oklch(var(--emblem-l) var(--emblem-c) ${g.hue} / 0.34)`;

    /*
     * A stable id per crest instance for the clip path and the charge's mask.
     *
     * Three crests can be on one page — the pane, the bench, the time machine — and an id collision would
     * clip all of them to whichever definition rendered last. Derived from the geometry rather than from a
     * counter or a random value, because this component renders on the SERVER and then hydrates: a value that
     * differs between the two renders is a hydration mismatch, and `Math.random()` in a component is the
     * classic way to ship one. Two crests with identical geometry sharing one definition is harmless — they
     * are the same shape.
     */
    const uid = `crest-${g.pales.length}-${g.rays}-${g.pips}-${g.facets}-${g.rarity}-${g.rims}-${f.slug}`;
    const clip = `${uid}-clip`;
    const cut = `${uid}-cut`;

    return (
        <svg
            className="emblem crest"
            viewBox="0 0 88 104"
            width={size}
            height={size * (104 / 88)}
            /*
             * Presentational. The rank and level are stated in text right beside it, and every part of the
             * geometry is stated in words in `CrestKey` — which is a real, reachable, focusable panel rather
             * than an aria-label nobody can quote. Announcing the shape as well would make a screen reader
             * read the same facts twice in a less useful form.
             */
            aria-hidden="true"
            focusable="false"
            style={{ ['--emblem-ink' as string]: ink }}
        >
            <defs>
                <clipPath id={clip}>
                    <path d={SHIELD} />
                </clipPath>
                {/*
                  * THE KEYWAY IS A REAL HOLE, NOT A SHAPE PAINTED IN THE BACKGROUND COLOUR.
                  *
                  * A mask rather than a second fill, for one reason that matters and one that is just cleaner.
                  * The one that matters: on the finishes with no well (`struck`, `ledger`) the charge sits
                  * directly on the divided field, so what is behind the middle of it is a project's own hue and
                  * there is no single colour a painted-over shape could use. A hole shows whatever is actually
                  * there, which is what makes the same drawing work on all five finishes.
                  *
                  * The cleaner one: negative space is the whole idea. A charge with a hole in it is one object
                  * with a void; a charge with a smaller circle painted on it is two objects, and it reads as
                  * two.
                  *
                  * Luminance mask: white keeps, black cuts. `maskUnits` in user space so the coordinates are
                  * the same viewBox units as everything else in this file.
                  */}
                <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="88" height="104">
                    <rect x="0" y="0" width="88" height="104" fill="#fff" />
                    {/*
                      * THE DEVICE'S OWN VOIDS, then the pierced centre every one of the nine leaves.
                      *
                      * A CIRCLE AT A FIXED PROPORTION, which is the sixth pass in one line. It was a polygon
                      * with one side per kind of mark — the shape the brief identifies as impossible to make
                      * look intentional, because seven sides is not a design decision, it is a reading. A
                      * circle is a decision, and the count it used to carry is in `CrestKey` in words.
                      */}
                    <g fill="#000">
                        <Parts shapes={chargeFor(g.facets).voids} R={CHARGE_R} cx={CX} cy={CY} />
                        <circle cx={CX} cy={CY} r={+VOID_R.toFixed(2)} />
                    </g>
                    {/*
                      * ==================================================================================
                      * RARITY IS STRUCK INSIDE THE KEYWAY, AND THAT IS THE SECOND PLACE IT HAS BEEN PUT
                      * ==================================================================================
                      *
                      * The first attempt at this pass put rarity 3 as a ring in the clear space round the sun
                      * and rarity 4 as a collar round the well. Photographed across eighteen histories, that
                      * was a mistake for a reason the bench made obvious and reasoning would not have: **almost
                      * every history reaches rarity 4 quickly**, so a treatment that draws two big concentric
                      * circles at rarity 4 draws them on nearly every crest — and eighteen crests with the same
                      * two rings round the same sun read as one object again. It also sat exactly where the
                      * teeth end, which blurred the one count the charge exists to carry.
                      *
                      * So rarity lives entirely inside the void now, where it is rich when you look at it and
                      * costs the composition nothing. Four hearts, each a different OBJECT rather than a
                      * different amount of the same one:
                      *
                      *      1   open        the keyway is empty
                      *      2   a boss      a solid disc at its centre
                      *      3   a ring      an annulus, open at the middle — a donut, not a dot
                      *      4   both        a ring with a boss inside it
                      *
                      * White in the mask means "put the ink back", so all of it is cut from and returned to the
                      * one solid charge rather than being separate marks stacked on top of it. That is what
                      * stops rarity reading as the loose centre dot the previous pass had.
                      */}
                    {g.rarity === 2 && <circle cx={CX} cy={CY} r={+(VOID_R * 0.52).toFixed(2)} fill="#fff" />}
                    {g.rarity >= 3 && (
                        <>
                            <circle cx={CX} cy={CY} r={+(VOID_R * 0.82).toFixed(2)} fill="#fff" />
                            <circle cx={CX} cy={CY} r={+(VOID_R * 0.54).toFixed(2)} fill="#000" />
                        </>
                    )}
                    {g.rarity >= 4 && <circle cx={CX} cy={CY} r={+(VOID_R * 0.30).toFixed(2)} fill="#fff" />}
                </mask>
            </defs>

            {/*
              * THE GROUND. Darker than the panel on an inset finish, lighter on a raised one.
              *
              * The crest sits on `--s1`. Filling it with `--s0` makes it a seal stamped into the page; filling
              * it with `--s4` makes it a medal sitting on top. Every band, chief and well below is drawn over
              * this, so this is the floor of the whole graphic.
              */}
            <path d={SHIELD} fill={groundFill} />

            <g clipPath={`url(#${clip})`}>
                {/*
                  * Inset on a raised finish, so a rim of the ground token shows all the way round.
                  *
                  * Without this, `ground` was a field in a data structure that changed nothing: the bands cover
                  * the whole silhouette, so whichever token filled it underneath was never visible, and two of
                  * the five finishes declared themselves raised and drew identically to the inset ones.
                  * `rim` is exempt because it already leaves the field bare.
                  */}
                <g
                    transform={f.ground === 'raised' && f.division !== 'rim'
                        ? `translate(${CX} ${CY}) scale(${RAISED_INSET}) translate(${-CX} ${-CY})`
                        : undefined}
                >
                    <Field
                        division={f.division} hues={g.pales} cx={CX} cy={CY} ground={groundFill}
                        top={f.division === 'rim' ? 0 : CHIEF_Y + CHIEF_H}
                    />
                </g>

                {/*
                  * THE CHIEF: the band across the top, and the pips sit in it.
                  *
                  * IT IS THE GROUND TOKEN NOW, NOT `--s3`, and that is a hierarchy fix rather than a
                  * preference. A mid-grey slab across the top of a coloured field was a FOURTH value in an
                  * object that should have three, and it was the second-heaviest thing in the drawing after
                  * the charge — for a row of dots. Painting it in the same token as the ground turns it into
                  * part of the frame: the top of the shield is bare, with a row of marks struck into it, which
                  * is what a chief is in the first place.
                  *
                  * It still does the job it was introduced for. Without a chief the pips floated on whichever
                  * pale happened to be under them, so their contrast depended on which projects he had
                  * finished work in — a legibility guarantee that varies with his history is not a guarantee.
                  * `--s0` and `--s4` both already carry an asserted ink pair, so the guarantee is unchanged and
                  * the object has one fewer colour in it.
                  *
                  * The separating rule underneath it is gone with the grey: a recessed band against a coloured
                  * field is already an edge in both value and hue, and a line drawn along an edge that exists is
                  * the definition of a mark nobody would notice if nobody told them to.
                  *
                  * NOT DRAWN AT ALL ON A RIM-DIVIDED FIELD, and that is the second defect /looks turned up.
                  * `ledger`'s projects ARE a ring around the outline — an 11-unit band whose top runs from y13.5
                  * to y24.5 — and the chief was a full-width rect from y0 to y27. So the one finish whose entire
                  * identity is a coloured collar was rendering with a bite taken out of the top of it, on the
                  * page that exists for choosing between them. The pips sit straight on the collar there, which
                  * is safe for the reason the chief was invented to guarantee: ink over the brightest and
                  * darkest possible project band are both asserted pairs in `prove:palette`.
                  */}
                {f.division !== 'rim' && (
                    <rect x={0} y={CHIEF_Y} width={88} height={CHIEF_H} fill={wellFill} />
                )}
            </g>

            {/*
              * THE WELL: a disc of the ground token that the charge is struck into.
              *
              * ==========================================================================================
              * THIS IS THE CHANGE THAT MADE THE FIELD STOP LOOKING MUDDY, AND IT IS NOT A COLOUR CHANGE
              * ==========================================================================================
              *
              * Two passes tried to fix "the bands read as dark teal-and-maroon camouflage" by moving chroma:
              * 0.030 was invisible, 0.075 was muddy, and the light theme at 0.105 came out as highlighter.
              * Chroma was never the lever. **Area was.** A colour covering 60% of an object at low value
              * contrast is camouflage whatever its chroma; the same colour as a 12-unit border around a struck
              * disc is enamel. Cutting a ground-coloured well out of the middle of the field halves the
              * coloured area and turns the rest into a surround, and the bands read as identity at the chroma
              * they always had.
              *
              * It also answers the complaint that the seal had no relationship to the outline: the well is a
              * fixed proportion of the silhouette rather than a circle placed in the middle of whatever shape
              * happened to be around it.
              *
              * TWO FINISHES DO NOT HAVE ONE, and dropping it is a bigger change than any stroke width. On
              * `ledger` the field is already a rim, so the middle is bare ground and a well would be a disc of
              * the colour that is already there. On `struck` the charge sits straight on the wedges, so a
              * project's hue shows through the keyway at the very centre of the mark — which is the boldest
              * thing in the set and the reason that one is called Struck.
              */}
            {f.well && <circle cx={CX} cy={CY} r={+MEDALLION.toFixed(2)} fill={wellFill} />}

            {/*
              * THE CHARGE: one of nine designed devices, chosen by how many KINDS of work he has a mark for.
              *
              * Solid ink, one object, pierced at the centre. It is the only bright mass in the drawing and it is
              * the only part made of filled area rather than line, so it is unambiguously where the eye lands.
              *
              * It does NOT change with the level, and that is the point of the sixth pass rather than a detail:
              * the level is the bezel outside it. See the CHARGE vocabulary at the foot of this file for the nine
              * devices, why they are selected rather than computed, and why they are ordered by measured ink.
              */}
            <g className="crest-charge" fill={ink} stroke="none" mask={`url(#${cut})`}>
                <Parts shapes={chargeFor(g.facets).solid} R={CHARGE_R} cx={CX} cy={CY} />
            </g>

            {/*
              * THE BEZEL: the level within the tier, as ten ticks around the charge.
              *
              * ==========================================================================================
              * THIS IS THE OTHER HALF OF THE SIXTH PASS, AND IT IS WHY THE CHARGE STOPPED BEING A COG
              * ==========================================================================================
              *
              * The count used to be TEETH ON THE CHARGE ITSELF: ten wedges radiating from a hub, `rays` of them
              * full length and the rest stubs. That is what made it read as a cog, and no adjustment of the
              * wedges could have fixed it, because a hub with teeth attached IS a cog. The brief's suggestion
              * was exact — *"a bezel with ten notches would keep that property with far less visual noise"* —
              * and it works because the count and the emblem stop competing for the same pixels.
              *
              * WHAT IS PRESERVED, AND IT IS THE RULE THREE PASSES HAVE BEEN CAUGHT BREAKING: all ten positions
              * are always drawn and always solid. Level 11 is one long tick and nine short ones around a charge
              * that has not changed at all, so a tier promotion moves ink around a complete bezel instead of
              * emptying one. The count is still exactly what you read.
              *
              * SEPARATED FROM THE CHARGE BY CLEAR GROUND, which is doing real work rather than being a margin:
              * the ticks start beyond the charge's outer radius, so the eye reads a device with a scale around
              * it rather than one spiky object. That clear ring is the single biggest reason this is not the
              * fifth pass with different numbers.
              */}
            <g fill={ink} stroke="none">
                {Array.from({ length: 10 }, (_, i) => {
                    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                    const earned = i < g.rays;
                    const rIn = BEZEL_IN;
                    /*
                     * AN UNEARNED TICK IS 58% OF AN EARNED ONE, and it was 34% for one round of screenshots.
                     *
                     * At 34% the nine unearned positions were 1.7-unit stubs sitting in clear ground, and blown
                     * up off the bench they read as **specks of dirt around the device** rather than as the
                     * unfilled half of a scale. That is the same class of failure as the 0.14-alpha ray stubs two
                     * passes ago: a mark too slight to be read as a mark does not stop a promotion looking
                     * emptier, it just adds noise.
                     *
                     * At 58% the bezel reads as a graduated ring at two lengths, which is what a bezel is, and
                     * the count is still exactly "how many long ones" — an easier read than before, because a
                     * long tick against a medium tick is a clearer pair than a long tick against a speck.
                     */
                    const rOut = earned ? BEZEL_OUT : BEZEL_IN + (BEZEL_OUT - BEZEL_IN) * 0.58;
                    /*
                     * A TAPERED TICK RATHER THAN A DOT, and the reason is countability at 96px.
                     *
                     * Ten dots on this circle are about four device pixels across and fifteen apart, which is a
                     * dotted ring — you can see that it is dotted and you cannot count it. A tick has LENGTH,
                     * and length is what distinguishes an earned position from an unearned one at a glance
                     * without needing either to be bigger. Same total ink, a count you can actually read.
                     */
                    const w = BEZEL_W;
                    const pts = [
                        [a, rIn, -w], [a, rOut, -w * 0.62], [a, rOut, w * 0.62], [a, rIn, w],
                    ].map(([ang, r, off]) => {
                        const t = ang! + off!;
                        return `${(CX + Math.cos(t) * r!).toFixed(2)},${(CY + Math.sin(t) * r!).toFixed(2)}`;
                    });
                    return <polygon key={i} points={pts.join(' ')} />;
                })}
            </g>

            {/*
              * THE TIER, as filled pips across the chief.
              *
              * Unchanged in meaning and in count, and unchanged for a reason that is a rule rather than
              * caution: at tier 1 — every level from 1 to 10, which is the whole named range and where his hub
              * is today — this is one pip.
              *
              * BARS RATHER THAN DOTS, which is the one thing about them that did change. The drawing now has a
              * boss, a keyway and a set of ornaments in it, and a small circle was the third round mark in an
              * object that already had two. A short upright bar is a rank marker in the vocabulary everything
              * from service stripes to tally marks uses, and it is countable at a glance in a way a row of
              * identical dots is not.
              *
              * ON A BAND rather than fanned around a ring, which is what the silhouette makes possible and is
              * strictly better: the chief's width is fixed, so ten pips spread across it stay exactly as
              * countable as two. The emblem's fan had to NARROW as it filled to stay inside the ring, and by
              * tier 6 the pips were closer to each other than to the edge — a rank marker that gets harder to
              * read as the rank gets higher, which is backwards.
              */}
            {/*
              * CLIPPED TO THE SILHOUETTE, AND THE POSITION IS SET SO THE CLIP NEVER HAS TO BITE.
              *
              * A defect found by photographing `/looks` at 150px: the pips were centred in the chief band, and
              * the chief starts at y=0 on four of the five shapes while the outline's top edge is at y=7 (shield),
              * y=8 (banner) and y=12 (roundel). So a bar centred in the chief poked out through the top of the
              * crest — two units of ink floating above a shield, on the page whose entire job is choosing a
              * finish. Invisible to every check, because P7 asks whether anything escapes the SVG and this
              * escaped the SHAPE.
              *
              * Both halves of the fix are deliberate. The bars hang from the BOTTOM of the chief with a clear
              * 2.5 units under them, which puts them inside every outline including the roundel's. And the group
              * is clipped anyway, because "I have checked all five" is exactly the guarantee that stops being
              * true the first time somebody adds a sixth silhouette.
              */}
            <g fill={ink} stroke="none" clipPath={`url(#${clip})`}>
                {Array.from({ length: g.pips }, (_, i) => {
                    const span = Math.min(9, CHIEF / Math.max(1, g.pips - 1));
                    const x = CX + (i - (g.pips - 1) / 2) * span;
                    /*
                     * THE PIP SHRINKS AS THE ROW FILLS, and this is a defect found on the bench.
                     *
                     * At a fixed width the pips fused into a single solid bar at thirteen of them (roughly year
                     * twelve), and thirteen fused into one is not "thirteen". A rank marker whose whole job is
                     * to be counted must stay countable at the top of its range as well as the bottom.
                     *
                     * 0.42 of the gap leaves clear ground between neighbours at every count, and does nothing
                     * at all below eight pips, where the span is already capped at 9.
                     *
                     * DELIBERATELY BIG — 4.4 by 11 units at tier 1, where the old pip was a 5.2-unit dot.
                     *
                     * This is the crest's only answer to the one rule it still strains against. The rays reset
                     * at a tier boundary, so level 11 has one ray where level 10 had ten, and the pip is what
                     * arrives in exchange. A previous iteration claimed a 2.6-radius dot was loud enough to
                     * make that read as a promotion and eighteen rendered histories said it was not. A dot that
                     * small cannot pay for a ray; a bold upright bar at least pays for some of it.
                     */
                    const w = Math.min(4.4, span * 0.42);
                    const h = Math.min(9, CHIEF_H * 0.5);
                    return (
                        <rect
                            key={i}
                            x={+(x - w / 2).toFixed(2)} y={+(CHIEF_Y + CHIEF_H - h - 2.5).toFixed(2)}
                            width={+w.toFixed(2)} height={+h.toFixed(2)}
                            rx={+Math.min(1.2, w / 2).toFixed(2)}
                        />
                    );
                })}
            </g>

            {/*
              * ORNAMENTS, PLACED ON THE OUTLINE THEY BELONG TO.
              *
              * They were three fixed points chosen for the shield — a shoulder each side and one above the
              * point. On a roundel that put two dots inside the circle and one outside it entirely, and on a
              * diamond it put all three in empty corners. A finish that changes the silhouette has to move
              * everything that sits on the silhouette, which is the whole reason `ORNAMENTS` is keyed by shape.
              *
              * On the outline rather than inside it: the charge already owns the middle and the frame is the
              * only part of the drawing that is empty by design.
              */}
            {f.ornaments && (
                <g fill={ink} stroke="none">
                    {ORNAMENTS[f.silhouette]!.map(([ox, oy], i) => (
                        <circle key={i} cx={ox} cy={oy} r="2.1" />
                    ))}
                </g>
            )}

            {/*
              * THE RIMS: the silhouette's own edge, thickening with the estimated hours behind him.
              *
              * The outer line is always drawn — a shield with no edge is a blob — so this dimension reads as
              * 1, 2 or 3 lines rather than as present/absent. It is the only figure on the crest that can
              * only ever accumulate, which is why it gets the outline: the frame should be the part that
              * does not go backwards.
              *
              * 2.1 on the outer line and 1.1 on the inner ones, which is the hierarchy the whole drawing was
              * missing: the frame is STRUCTURE and the inner rims are DETAIL, and before this pass they were
              * both the same 2px as the rays, the arc and the rosette.
              *
              * It was 2.4 for one round of screenshots and that was a shade too much: at 96px the edge and the
              * charge are the same colour, so an edge that heavy gives the object two equally loud things and
              * the charge stops being the charge. The frame may be the second thing you see and not the first.
              *
              * Labelled an ESTIMATE in the key, because that is what `minutes` is — an agent's guess, not a
              * measurement, and `ProgressSnapshot.minutesEstimated` says so in its own comment.
              */}
            {Array.from({ length: g.rims }, (_, i) => (
                <path
                    key={i}
                    d={SHIELD}
                    fill="none"
                    stroke={i === 0 ? ink : inkSoft}
                    strokeWidth={i === 0 ? 2.1 : 1.1}
                    /* Inset by a fixed proportion per extra rim, scaled about the silhouette's centre so the
                       inner lines stay parallel to the outer one instead of drifting toward the point. */
                    transform={i === 0 ? undefined : `translate(${CX} 52) scale(${1 - i * 0.075}) translate(${-CX} -52)`}
                    clipPath={`url(#${clip})`}
                />
            ))}
        </svg>
    );
}

/**
 * Where a finish's ornaments sit, per silhouette. Measured off the paths in lib/finishes.ts.
 *
 * `castle` puts one on each battlement, which is the only placement that reads as belonging to that shape rather
 * than as three dots that happen to be near it.
 */
const ORNAMENTS: Record<string, [number, number][]> = {
    shield: [[14, 27], [74, 27], [44, 84]],
    banner: [[15, 16], [73, 16], [44, 70]],
    lozenge: [[44, 14], [44, 90], [16, 52], [72, 52]],
    roundel: [[44, 15], [44, 89], [17, 52], [71, 52]],
    castle: [[23, 16], [44, 16], [65, 16], [44, 86]],
};

/**
 * THE PROJECTS, DIVIDING THE FIELD — five ways, and the way is what a finish chooses.
 *
 * Same facts in every case: one region per project he has finished work in, in that project's own hue, in
 * first-completion order so a region is only ever added and never moves. What changes is the ARRANGEMENT, and
 * that is the second thing after the outline that makes two crests different objects rather than two versions of
 * one.
 *
 * All five stay countable, which is the constraint that matters: he has to be able to look at it and see three.
 */
function Field({ division, hues, cx, cy, ground, top }: {
    division: string;
    hues: number[];
    cx: number;
    cy: number;
    /** The token filling the silhouette underneath. Dividers are drawn in it, so a divider is a gap in the
     *  field rather than a line ON the field — and on a raised finish it matches the rim showing round the
     *  edge instead of being a dark line the rest of the object has no reason for. */
    ground: string;
    /**
     * Where the field starts, which is the bottom of the chief.
     *
     * ONLY THE DIVISIONS THAT STACK DOWNWARD USE IT, and that is a defect found by photographing /looks. The
     * chief is an opaque band across the top, so on `bars` it covered the whole of the first project's bar and
     * on `chevrons` most of the first chevron — the oldest project he has, hidden under a band, on two of the
     * five finishes. `pales` and `wedges` are unaffected because they cross the chief symmetrically: every
     * region loses the same slice, so the count is undamaged.
     */
    top: number;
}) {
    const fill = (hue: number) => `oklch(var(--crest-pale-l) var(--crest-pale-c) ${hue})`;
    if (!hues.length) return null;

    /*
     * A DIVIDER BETWEEN EVERY REGION, AND IT IS NOT DECORATION — it is the only thing that makes the count
     * survive a hue collision.
     *
     * `projectHue` hashes a slug onto 360 degrees, so collisions are not a risk, they are arithmetic: measured on
     * the fixture, `tuck-shop` lands on 26 and `nine-panels` on 34. **Eight degrees apart, at a fixed lightness
     * and a fixed chroma.** Those two bands are indistinguishable, so four projects rendered as three — and
     * breadth is the axis the whole crest exists to carry.
     *
     * The tempting fix is to spread the hues apart, and it does not work: the hue has to be a pure function of
     * the slug so a project is the same colour here as it is on its dot, its group heading and its row rail
     * everywhere else in the hub. Spreading them would mean the crest's harbour-lights and the queue's
     * harbour-lights were different colours, which is a worse defect than the one being fixed.
     *
     * The other tempting fix is more chroma, which cannot help either: two hues 8 degrees apart are 8 degrees
     * apart however saturated they are.
     *
     * So the count is carried by STRUCTURE rather than by colour. A line of the ground colour between every
     * pair of regions means N regions are N regions whatever their hues do — which is the same reasoning that
     * made the crest's rarity a treatment rather than a colour, and the timeline's kinds shapes rather than
     * hues. Colour is an identifier here; it was never the counter.
     *
     * ==================================================================================================
     * AND IT WAS NEVER APPLIED TO `pales`, WHICH IS THE DEFAULT FINISH. THAT IS THE WHOLE POINT MISSED
     * ==================================================================================================
     *
     * The divider was added in the pass that discovered the collision, and it went on `bars`, `wedges`,
     * `chevrons` and `rim` — every division except the vertical bands, which are what `plain` draws and
     * therefore what he actually looks at every morning. `docs/ITERATION-LOG.md` §XII states the fix as though
     * it covers the crest; it covered four fifths of it, and not the fifth in use. Found by blowing up the
     * standing panel and looking at two adjacent bands that were plainly one band.
     *
     * 1.4 units rather than 1, for the same reason the wedge and rim gaps were widened before it: at 96px one
     * unit is 1.1 device pixels of near-black between two near-identical darks, and a separator you have to
     * hunt for is not carrying a count.
     */
    const divider = { stroke: ground, strokeWidth: 1.4 } as const;

    if (division === 'bars') {
        // Horizontal, top to bottom. Clipped to the outline, so on a banner the lowest bar takes the swallowtail.
        return (
            <>
                {hues.map((hue, i) => (
                    <rect
                        key={i}
                        x={0} y={+(top + (i * (104 - top)) / hues.length).toFixed(2)}
                        width={88} height={+((104 - top) / hues.length).toFixed(2)}
                        fill={fill(hue)} {...divider}
                    />
                ))}
            </>
        );
    }

    if (division === 'wedges') {
        /*
         * Pie segments from the centre, starting at twelve o'clock. Radius 80 rather than something fitted to
         * the shape: the clip does the fitting, and a wedge that stops short of the outline leaves a ring of
         * bare field that reads as a rendering fault.
         */
        return (
            <>
                {hues.map((hue, i) => {
                    /* Widened from 0.02: a hairline is not enough to separate two hues eight degrees
                     * apart, and the wedges have no straight edge for a divider stroke to sit on. */
                    const gap = 0.055;
                    const a0 = (i / hues.length) * Math.PI * 2 - Math.PI / 2 + gap;
                    const a1 = ((i + 1) / hues.length) * Math.PI * 2 - Math.PI / 2 - gap;
                    const R = 80;
                    const large = a1 - a0 > Math.PI ? 1 : 0;
                    const d = hues.length === 1
                        ? `M${cx - R} ${cy - R} h${R * 2} v${R * 2} h${-R * 2} Z`
                        : `M${cx} ${cy} L${(cx + Math.cos(a0) * R).toFixed(2)} `
                          + `${(cy + Math.sin(a0) * R).toFixed(2)} `
                          + `A${R} ${R} 0 ${large} 1 ${(cx + Math.cos(a1) * R).toFixed(2)} `
                          + `${(cy + Math.sin(a1) * R).toFixed(2)} Z`;
                    return <path key={i} d={d} fill={fill(hue)} {...divider} />;
                })}
            </>
        );
    }

    if (division === 'chevrons') {
        /*
         * Nested V bands, one per project, stacked from the top down.
         *
         * Each iteration fills everything BELOW its own chevron, and the apex moves down as the loop runs — so
         * every fill covers the middle of the one before it and what is left visible is a stack of V stripes.
         * That is far less code than computing each band as a closed shape, and it cannot leave a hairline gap
         * between neighbours, which nested outlines drawn independently reliably do.
         *
         * Painted in first-completion order like every other division, so the oldest project is the outermost
         * chevron and a new one is only ever added at the bottom.
         */
        return (
            <>
                {hues.map((hue, i) => {
                    const apex = top + ((i + 1) * (102 - top)) / hues.length;
                    const shoulder = apex - 22;
                    return (
                        <path
                            key={i}
                            d={`M-4 ${shoulder.toFixed(2)} L${cx} ${apex.toFixed(2)} `
                                + `L92 ${shoulder.toFixed(2)} V108 H-4 Z`}
                            fill={fill(hue)} {...divider}
                        />
                    );
                })}
            </>
        );
    }

    if (division === 'rim') {
        /*
         * A ring of thick arc segments just inside the outline, with the field left plain.
         *
         * The one division that does NOT fill the whole shape, and it is the reason `ledger` reads as the most
         * austere thing in the set: the projects become a band around the edge and the middle is empty except
         * for the charge. Stroked rather than filled, because an arc with a wide stroke is one element per
         * project where a filled annulus segment is four commands and a join to get wrong.
         */
        const R = 33;
        return (
            <>
                {hues.map((hue, i) => {
                    /* Widened from 0.05 for the same reason as the wedges. */
                    const gap = 0.09;
                    const a0 = (i / hues.length) * Math.PI * 2 - Math.PI / 2 + gap;
                    const a1 = ((i + 1) / hues.length) * Math.PI * 2 - Math.PI / 2 - gap;
                    const large = a1 - a0 > Math.PI ? 1 : 0;
                    return (
                        <path
                            key={i}
                            d={`M${(cx + Math.cos(a0) * R).toFixed(2)} ${(cy + Math.sin(a0) * R).toFixed(2)} `
                                + `A${R} ${R} 0 ${large} 1 ${(cx + Math.cos(a1) * R).toFixed(2)} `
                                + `${(cy + Math.sin(a1) * R).toFixed(2)}`}
                            fill="none"
                            stroke={fill(hue)}
                            strokeWidth="11"
                        />
                    );
                })}
            </>
        );
    }

    // `pales` — vertical bands, the original, and the default finish still draws exactly this.
    return (
        <>
            {hues.map((hue, i) => (
                <rect
                    key={i}
                    x={+(6 + (i * 76) / hues.length).toFixed(2)} y={0}
                    width={+(76 / hues.length).toFixed(2)} height={104}
                    fill={fill(hue)} {...divider}
                />
            ))}
        </>
    );
}

/* ==================================================================================================
 * THE CHARGE VOCABULARY — nine designed devices, and his history SELECTS one rather than computing it
 * ==================================================================================================
 *
 * THE DIAGNOSIS THIS REPLACES, WHICH IS NOT A MATTER OF TASTE
 *
 * The fifth pass drew the charge as a ten-toothed wheel with an N-sided polygonal hole, where N was the number of
 * kinds of mark he holds. Photographed at 150px it reads as **a cog** — and docs/BRIEF-PROGRESSION.md names the
 * reason exactly:
 *
 *     "The crest is trying to be an emblem and a data visualisation at the same time, and those want opposite
 *      things. An emblem is designed — its proportions are chosen because they look right. This one's proportions
 *      are dictated by numbers: the hole has seven sides because he has seven kinds of mark. You cannot make an
 *      arbitrary seven-sided hole look intentional, because it is not."
 *
 * That is right, and four earlier passes of adjusting proportions could not have fixed it, because the thing
 * being adjusted was the problem. **A shape whose every proportion is a variable is a chart. A designed shape
 * chosen by his history can be beautiful.** So `kinds` picks one of these nine, each drawn to look right, and the
 * exact number lives in `CrestKey` where a number belongs.
 *
 * WHAT MAKES THIS A VOCABULARY RATHER THAN NINE UNRELATED PICTURES
 *
 * Every device is ANNULAR: drawn around a central circular void of one fixed radius. Three things fall out of
 * that, and the third is the one that made it the right decision rather than a tidy one.
 *
 *   1. They read as one family — a set of struck devices, the way a real crest is composed from a finite
 *      vocabulary of charges rather than from a parameter sweep.
 *   2. The void is a CIRCLE at a FIXED proportion, so it is a designed choice and not an arbitrary N-gon. That
 *      is the whole complaint above, removed rather than mitigated.
 *   3. **Rarity keeps the one home that already worked.** The fifth pass put rarity inside the keyway — nothing,
 *      a boss, a ring, a ring with a boss inside it — and that was a genuinely good decision for a measured
 *      reason: almost every history reaches rarity 4 quickly, so a treatment drawn on the OUTSIDE of the charge
 *      gets drawn on nearly every crest and stops distinguishing anything. Every device leaving the same void
 *      means rarity works identically on all nine, which is what a per-device treatment could not promise.
 *
 * THE COUNT MOVED OFF THE CHARGE ENTIRELY. `rays` is a bezel of ten ticks around it now — see `Bezel`. That is
 * the other half of the brief's hypothesis: separate the emblem from the readout, because the two were fighting.
 *
 * THE ORDER IS CHOSEN BY MEASUREMENT, NOT BY EYE
 *
 * A promotion may never make the crest look emptier — the rule three passes have now been caught breaking. When a
 * device is SELECTED rather than computed, the risk moves: earning a new kind of work could swap an elaborate
 * charge for a sparse one and read as a loss. So the nine are ordered by **ink area, ascending**, computed from
 * the geometry rather than judged by eye, which makes the guarantee arithmetic: the device at `kinds = n + 1`
 * always carries at least as much ink as the one at `kinds = n`, and the last one is a solid disc, which is the
 * most any shape at this radius can carry. Check X9 holds it against the real functions.
 *
 *      1  triangle          0.32 of its circumscribed circle
 *      2  mullet            0.34
 *      3  saltire           0.39
 *      4  cross             0.47
 *      5  lozenge           0.55
 *      6  annulet           0.62
 *      7  hexagon           0.74
 *      8  disc and fess     0.81
 *      9  plate             1.00
 *
 * TWO CANDIDATES WERE CUT AFTER LOOKING AT THEM RENDERED, and both for the same reason.
 *
 * A **sun in splendour** was the ninth device — a disc with eight triangular rays, and the place the old charge's
 * character survived. Photographed on the bench it put a ring of eight spikes immediately inside a bezel of ten
 * ticks: **two concentric rings of radiating marks**, which is busy at 150px and mush at 96px. The bezel radiates,
 * so the charge must not. Only the mullet does now, and it sits at `kinds = 2`, where the bezel is nearly all
 * short ticks.
 *
 * A **gyronny** — a ring with a saltire inside it — was the seventh, and next to the plain annulet it was the same
 * object: the ring's inner edge left too little room for the saltire, and the pierced centre and its rarity mark
 * covered what was left. Two devices that differ only in a detail nobody can see is the exact failure he named
 * about the finishes.
 */

/**
 * What each device is called, in the order `kinds` selects them. Read off the vocabulary rather than restated, so
 * a device cannot be renamed in one place and shown under its old name in the receipt.
 *
 * Heraldry's own words, because heraldry is the discipline that already solved "name a small vocabulary of
 * abstract charges" — and because these are what `CrestKey` shows him. *"The charge is a hexagon"* is a fact he
 * can check against the drawing; *"7-point"*, which is what the receipt said when the shape was computed, was a
 * number he had to take on faith about a hole he could not count.
 */
export const CHARGE_NAME = CHARGES.map(c => c.name);


/** A regular polygon with `n` sides on a circumradius of `r`. Vertex-up, so a triangle points up. */
function poly(n: number, r: number, cx: number, cy: number): string {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
    }
    return pts.join(' ');
}

/** Points of a star with `n` points, alternating between `outer` and `inner` radii. Vertex-up. */
function star(n: number, outer: number, inner: number, cx: number, cy: number): string {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
    }
    return pts.join(' ');
}

/** A bar through the charge's centre — the arm of a cross or a saltire, or a fess cut through a disc. */
function arm(len: number, wide: number, deg: number, cx: number, cy: number): React.ReactNode {
    return (
        <rect
            x={+(cx - len).toFixed(2)} y={+(cy - wide / 2).toFixed(2)}
            width={+(len * 2).toFixed(2)} height={+wide.toFixed(2)}
            transform={`rotate(${deg} ${cx} ${cy})`}
        />
    );
}

/**
 * One primitive of a device, as SVG. The vocabulary itself lives in lib/charges.ts — see that file's header for
 * why it is data in `lib/` rather than JSX here (the ordering it encodes is load-bearing and check X9 measures it,
 * and a suite cannot import a `.tsx`).
 */
function Prim({ shape, R, cx, cy }: { shape: Shape; R: number; cx: number; cy: number }) {
    if (shape.s === 'circle') return <circle cx={cx} cy={cy} r={+(R * shape.r).toFixed(2)} />;
    if (shape.s === 'poly') return <polygon points={poly(shape.n, R * shape.r, cx, cy)} />;
    if (shape.s === 'star') return <polygon points={star(shape.n, R * shape.r, R * shape.ri, cx, cy)} />;
    return arm(R * shape.len, R * shape.w, shape.deg, cx, cy);
}

/** Every primitive of one side of a device — its solid, or its voids. */
function Parts({ shapes, R, cx, cy }: { shapes: Shape[]; R: number; cx: number; cy: number }) {
    return <>{shapes.map((shape, i) => <Prim key={i} shape={shape} R={R} cx={cx} cy={cy} />)}</>;
}
