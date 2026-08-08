# Brief: make the crest beautiful

**Written:** 2 August 2026, by the agent that built the current one, immediately after being told — for the third
time, correctly — that it is not good enough.
**For:** an agent with no memory of this project, working alone.
**Read first:** `docs/HANDOVER.md` (the ground truth), then `docs/ITERATION-LOG.md` §I, §X and §XII, which are the
record of the four attempts already made and why each one fell short.

---

## What you are working on

**The Command Center** — one private hub, one human, about fifteen AI-agent projects. Live at
<https://needsme.vercel.app>. Agents file tasks and decisions; he answers on the web or with one tap in Telegram.

The **crest** is his identity in it. It is generated geometry — no images, no icon library — and every part of it
is derived from his own history on every render. It is drawn by `app/components/Crest.tsx`.

**Your job is one thing: make it beautiful.** Not more informative, not more configurable, not better tested.
Beautiful. It is the first thing he sees every morning and it is the thing a new person will judge the whole tool
by, because he is building this for other people now, not only for himself.

---

## The problem, stated honestly

The crest is **structurally right and visually not good enough.** Four passes were made on it in one session and
his verdict after the fourth was *"the crests look kinda poor overall, they could be a lot better."* He is
right, and each of the three earlier times he was right too.

What is actually wrong, as specifically as I can put it:

1. **No visual hierarchy.** Almost everything is drawn as a 2–2.5px stroke in one colour. The outline, the ring,
   the rays, the rosette and the pips are all roughly the same weight, so nothing is dominant and nothing recedes.
   Good emblems have a clear order: one bold charge, secondary structure, tertiary detail. This has one weight.
2. **It is line art where it should be mass.** Heraldry, unit insignia and coinage all work through solid shape
   and negative space. This is stroked outlines floating on a flat field, which is why it reads as a diagram.
3. **The progress arc reads as a broken ring, not as progress.** It is a heavy stroke at the same weight as
   everything else, and at 30% it looks like a circle with a piece missing rather than a gauge.
4. **The centre is a spiky blob.** Ten ray positions plus an N-pointed rosette plus a possible centre dot is too
   many small marks competing in the smallest part of the drawing.
5. **The bands are muddy.** At `--crest-pale-l: 0.225` and `--crest-pale-c: 0.075` two projects read as dark
   teal-and-maroon camouflage rather than as identity.
6. **The seal has no relationship to the outline.** It is a circle placed in the middle of whatever shape is
   around it. A designed crest has the charge and the field in proportion to each other.
7. **It reads as generated rather than designed** — which it is. That is the thing to fix.

---

## What is already good. Do not throw these away

Four passes produced some things that work. Losing them would be a regression:

- **The silhouette varies per finish** — shield, swallowtail banner, diamond, castellated crest, roundel. This is
  the single change that made the five finishes distinguishable at all, and it works. `SILHOUETTE_PATH` in
  `lib/finishes.ts`.
- **The field division varies** — vertical bands, horizontal bars, wedges from the centre, chevrons, a ring around
  the rim. Also works. No two finishes share one, deliberately.
- **`inset` versus `raised`** (`--s0` versus `--s4` ground) genuinely inverts the read of the object.
- **Dividers between field regions.** Not cosmetic: `projectHue` hashes onto 360°, and on the real fixture
  `tuck-shop` lands on 26 and `nine-panels` on 34 — eight degrees apart and indistinguishable. Without a divider,
  four projects render as three. **If you rebuild the field, keep a structural separator.**
- **The encoding itself** — see the next section. Change the drawing freely; do not change what it means.

---

## Hard constraints. Breaking one of these is worse than shipping nothing

Each exists because its absence caused a specific failure. `docs/HANDOVER.md` §2 has the full reasoning.

### 1. Everything is DERIVED. Nothing is stored

There is no `xp` column, no `level` column, and there must never be one. `crestInput` in `lib/progress.ts` folds
over `tasks.done_at` and `questions.answered_at`. Consequences you must preserve: re-opening a finished task takes
the credit back, so the crest can go **backwards**, and it must.

### 2. The ENCODING is fixed. The DRAWING is yours

`crestGeometry` returns what must remain readable off the shape. **You may redraw all of it. You may not change
what it means, and you may not stop it being countable.**

| part | means | must stay |
|---|---|---|
| `pales` (hues) | projects he has finished work in, in first-completion order | countable, and each project's own hue |
| `pips` | the tier | countable, monotonic |
| `rays` | level within the tier, 1..10 | countable |
| `fraction` | progress through the level | the same number as the bar beside it |
| `facets` | how many *kinds* of mark he holds | countable |
| `rarity` | the rarest mark tier held, 1..4 | visible as structure, **not** as a colour |
| `rims` | estimated hours behind him, 1..3 | visible |

**"Countable" is the load-bearing word.** He must be able to look at it and see *four*. A glow, a colour ramp or a
size that "grows with" a number is not countable and is explicitly not acceptable — that was the emblem this
replaced, and it is why it was replaced.

**You are allowed to conclude that seven encodings is too many for the size** and to move one or two of them
somewhere else on the page. That is a real option and probably the right one — see "What I would try" below. What
you may not do is keep the claim and drop the legibility.

### 3. No assets. No dependency

Pure SVG geometry, generated. No PNGs, no SVG files, no icon library, no design-token package, nothing added to
`package.json`. The project has **four runtime dependencies** and that is a decision, not an accident
(`docs/RESEARCH.md` §13): every dependency is a thing that breaks while nobody is looking, and this tool has to
still work in a year unattended.

An image set is also wrong on its own terms: the crest recolours itself for six unlockable palettes and two
themes for free because it is built from tokens. Ten PNGs would need re-exporting the first time a palette moved.

### 4. Every colour is a token, and contrast is measured

- `npm run prove:palette` — **564 pair checks**, 6 palettes × 2 schemes, no browser. If you add a colour, add its
  pair. The crest's pairs are `emblemInkGreen`/`emblemInkViolet` against `s0`, `s3`, `s4` and the brightest and
  darkest possible project band.
- `C1` in `npm run prove:layout` measures rendered text. `C2` measures the pixels actually painted behind text.
- The bar for the crest is **3:1** (SC 1.4.11, non-text), not 4.5:1 — every fact it carries is also in words in
  `CrestKey`, so the shape is never the only route to the information.
- **No gradients, no shadows, no alpha stacks for anything load-bearing.** A gradient's colour at a given pixel is
  not a token, so nothing can assert it. This is a *colour* rule and not a *shape* rule — conflating those is
  exactly the mistake that produced the first, worst version of the finishes (`ITERATION-LOG.md` §X). Solid fills,
  varying weights, negative space and geometry are all open to you.
- The one legitimate use of alpha today is `inkSoft`/`inkFaint` for genuinely secondary marks. Keep that narrow.

### 5. The sizes it has to work at

| where | size |
|---|---|
| the standing panel (`Profile.tsx`) | **96px** — the hard case |
| `/looks` samples (`LookChoice.tsx`) | 150px |
| the time machine (`Timeline.tsx`) | 104px |
| the bench (`app/emblem/page.tsx`) | 116px |

**96px is the constraint that matters and the one that has defeated four attempts.** The pane has **zero spare
pixels** — check `L7` asserts the idle reading pane holds all its content without scrolling at 1920, and it
currently passes with nothing to spare. Making the panel crest bigger is *allowed* but it must be paid for out of
that column, and you have to say what you removed and why.

### 6. It must not break the queue

- `L3`: six tasks must start within the first screen at 1280×900. Currently exactly six.
- `L7`: the idle pane fits at 1920. Currently exactly fits.
- `K3`: three keystrokes to reach a task.

---

## What has already been tried and did not work

Read this twice. It is the cheapest part of this document.

1. **Sub-perceptual detail.** The first finish set differed by: a hairline inset from the edge, 7 or 13 hatch
   lines at 0.14 alpha, round-versus-tapered stroke caps, a tinted-versus-solid centre, and three 1.9-radius dots.
   **Four of those five are below the threshold of perception at 96px.** Do not differentiate anything by
   fractions of a pixel or by alpha under about 0.3.
2. **Raising band chroma.** 0.030 was invisible; 0.075 is muddy; the light theme at 0.105 rendered as pink and
   yellow highlighter. Chroma is not the lever, and the light and dark themes need *opposite* adjustments (dark
   surfaces absorb chroma, light ones broadcast it).
3. **Spreading the project hues apart to avoid collisions.** Not available. The hue must stay a pure function of
   the slug so a project is the same colour on its crest band, its dot, its group heading and its row rail. Fix
   collisions with structure, not colour.
4. **Encoding rarity as a colour.** Rejected twice: the hue already carries the within-tier position, and a rarity
   nobody can see if they cannot distinguish those hues is not a rarity.
5. **A "growing"/glowing indicator for the level.** Rejected: not countable. See constraint 2.
6. **Filled pips compensating for the ray reset at a tier boundary.** Two iterations claimed this worked. It does
   not — a ring that loses 90% of its ink reads as a demotion whatever arrives in exchange. The current fix draws
   all ten ray positions always and fills `rays` of them. If you redesign the rays, **keep that property**: a
   promotion may never make the crest look emptier.
7. **Squeezing more detail into 96px.** Four attempts. It does not fit. Change the composition or change the size
   budget; do not try again to make seven encodings legible at 96px by drawing them more carefully.

---

## What I would try, if I had another session

Not instructions. Leads, so you do not start cold. Ignore any of them if you see better.

- **Introduce a weight hierarchy.** One dominant charge at 3.5–4px or solid, structure at 2px, detail at 1px. This
  is the single biggest missing thing.
- **Make the charge solid, not stroked.** The rosette is currently an outline with an optional tint. A solid mass
  with the field showing through negative space would give the drawing a focal point it does not have.
- **Split the charge from the readout.** The rosette is trying to be both the emblem's central charge *and* a
  count of mark categories. Those two jobs are fighting. Consider a bold, simple, fixed charge in the centre and
  move `facets` to notches on a bezel, or to the chief, or off the graphic entirely.
- **Kill the faint ray stubs.** They exist only to stop a tier promotion looking emptier. A ring of small solid
  marks, or a bezel with ten notches, would keep that property with far less visual noise.
- **Demote the progress arc.** It should be a thin outer bezel ring, not a heavy stroke competing with the charge.
- **Reconsider the field.** Two muddy halves is the worst-looking part. Options: one dominant field colour (the
  oldest project) with the others as a small stack of marks; or fewer, bolder divisions with real separators; or
  the projects on a bezel and the field left plain.
- **Look at real reference.** Military unit insignia, currency guilloche, sports club crests, ISO safety marks,
  Japanese *mon*. All of them work at 20px because they are mass and negative space, not stroked circles. *Mon* in
  particular are the closest analogue to this problem: one bold silhouette, extremely few elements, legible at any
  size.
- **Consider making the panel crest bigger and paying for it.** 96px may simply be the wrong budget for something
  that is supposed to be the emotional centre of the hub. If you go this way, say in the log what you removed from
  the pane and why that was a good trade.

---

## How to work on this

### The bench is the tool. Use it constantly

```bash
npm run dev                        # port 3939
npm run fixture                    # realistic local data
node tests/shoot-bench.mjs         # /emblem — 18 synthetic histories, dark
node tests/shoot-bench.mjs --light # ...and light
```

`app/emblem/page.tsx` builds **whole synthetic histories** and runs them through the real
`derive → standing → marks → crestInput` pipeline, so it cannot show you a crest the live code could not produce.
It covers day one, his real hub, the same volume across one project versus eight, nine projects (over the band
cap), a cleared project, tier boundaries at levels 10/11/20/21/31/41, roughly year ten, and where the hue ramp
saturates. It is 404 in production.

```bash
npm run shots -- --path looks      # all five finishes at 150px
npm run shots -- --crest           # the crest's receipt panel open
npm run shots -- --light --path looks
```

### Then look at the pictures. Actually look

Of the twenty-two defects recorded in `docs/ITERATION-LOG.md`, **two** were found by a check. Eleven were found by
opening a rendered screenshot. **Three were found by him, in seconds, on pages I had already photographed and
read.**

The question that would have caught all three is not "did it render". It is:

> **Would someone notice this if nobody told them to?**

Ask it out loud, per element, before you ship anything.

### Before every commit

```bash
npm run prove:parse      # node --check over tests/ — 2s, run it first
npm run typecheck
npm run prove:palette    # 564 contrast checks
npm run prove:ladder     # the crest's own checks: X1-X8
npm run prove:layout     # L3, L7, C1, C2, L8 and the fault-injection pass
npm run audit
```

`prove:ladder` holds the crest's properties: **X1** two histories with the same points draw different crests,
**X2** the level reads off the shape as `(pips − 1) × 10 + rays` for every level to 110, **X3** no two tiers open
on the same hue, **X4** the crest's project hues match `lib/colour.ts`, **X5** the band cap accounts for every
project, **X6** the crest still changes on several axes after two years of use. **If your redesign breaks one of
these, the redesign is wrong — or the check needs to change and you must argue why in the log.**

### And push

Production deploys from `master`. An unpushed commit is a change he cannot see, and he has asked for this
explicitly and more than once.

---

## Done means all of this is true

- [ ] The crest looks **designed**, at 96px and at 150px, in both themes, in all six palettes.
- [ ] Every encoding in the table above is still derived and still countable, or has been deliberately moved
      elsewhere with the reasoning recorded.
- [ ] A promotion never makes the crest look emptier.
- [ ] `prove:palette`, `prove:ladder`, `prove:layout`, `prove:parse`, `prove`, `prove:negative`, `prove:use`,
      `audit`, `typecheck` — all green. Every new colour has an asserted pair in both themes.
- [ ] L3 still six above the fold at 1280; L7 still fits at 1920; K3 still three keystrokes.
- [ ] The bench photographed in both themes, and **you have looked at all 36 images.**
- [ ] `docs/ITERATION-LOG.md` records what you changed, what you measured, and every claim of yours that a
      measurement or a screenshot disproved. That last category is the most valuable thing in that document.
- [ ] Committed and **pushed**, and production re-verified:
      `node tests/measure-layout.mjs https://needsme.vercel.app --production` and `/api/health`.

---

## One last thing

The reason this is worth a whole session is small and specific. He runs about fifteen agent projects alone, and
this hub is the only thing standing between that and the pile of half-finished work everyone else has. The crest
is the part of it that is *his* — the one element that says the work was done by a person rather than processed by
a system.

Four attempts have made it correct. Correct is the floor. Make it something he is pleased to see.
