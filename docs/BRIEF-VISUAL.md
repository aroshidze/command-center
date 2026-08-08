# Brief: make it visually amazing

**Written:** 4 August 2026, by the agent that shipped the progression work, the sixth pass on the crest, the
plain-language rewrite and the first-run states — handing over at his request.
**For:** an agent with a lot of context, working alone, autonomously, until it is done.
**His instruction, verbatim:** *"let's make this site visually amazing."*

**Read first, in this order:**

1. `docs/HANDOVER.md` — the ground truth. Ninety per cent of the mistakes already made.
2. `AGENTS.md` — the working agreement and the traps.
3. `docs/ITERATION-LOG.md` §XIV–§XVIII — the last two days. **§XVIII's closing paragraphs are the open work.**
4. This file.

Everything below that is a number was measured on 4 August 2026 and the command that measured it is named, so you
can re-measure rather than trust me.

---

## 1. What this is

**The Command Center** — one private hub, one human, about fifteen AI-agent projects, live at
<https://needsme.vercel.app>. Agents file tasks he must do personally and decisions only he can make; he answers on
the web or with one tap in Telegram. **He is now setting it up for other people, not only himself**, which is why
the last three sessions were about a stranger's first ten minutes.

Everything on it is **derived**. No `xp` column, no `level` column, no `achievements` table, and there must never be
one. That is an honesty rule and it is the foundation of the whole thing.

---

## 2. The mandate, and the reason it is not "add some polish"

He has said the site looks bad three times across the project's life, and each time he was right:

> *"the whole website still looks bad, could be much better, some UI doesn't make sense also."*
> *"the crests look kinda poor overall, they could be a lot better."*
> *"why are you making things like this? As if this is a nineties website?"*

Each of those got a targeted fix — the crest, the navigation, the copy. **Nobody has ever done a visual pass over
the hub as a whole.** That is this brief.

The bar is not "tidier". It is that he opens it in the morning and it is a pleasure to look at.

---

## 3. The honest critique. I looked at all of it, and here is what is actually wrong

I photographed and read: the hub at 390/834/1280/1920 in both themes, in all four data states; `/looks`; `/setup`;
the crest bench (36 crests); the crest at 96px and 150px; the level-up animation frame by frame. This is what I
would fix, most valuable first. **None of it is a matter of taste that I could not defend.**

### 3.1 It is a wireframe with colour applied, not a designed surface

Count the bordered rectangles on one screen at 1920: **eight**, and every one is the same object — `--s1` fill,
`1px --line` border, `--radius` corners. The decision card, the crest panel, the record, the compose box, the
project chips, the marks list. There is **no variation in elevation, weight, material or edge treatment anywhere**.
A page where every container is the same container reads as a form, and this is the single biggest reason it looks
like a tool rather than a product.

### 3.2 The queue is the largest thing on the page and the least designed

**21 rows, each 37px, each identical**: colour rail, 14px title, 12.5px dim subtitle, minutes, step count, tick.
A 19-step task and a 1-step task differ by four characters of 11px grey text. It reads as a spreadsheet with a
theme.

This is the point of the page. It deserves the most design and currently has the least.

### 3.3 There is no typographic hierarchy at the top of the scale

The scale is `11 / 12.5 / 14 / 15.5 / 17 / 22 / 28`. Body is 14. A section heading — *"Decisions — an agent is
blocked"* — is **17**. Three pixels is not a hierarchy; it is a rounding. The only real typographic moment on the
page is the record's 28px figures, and the scale's own comment says *"the top of this scale is a heading, not a
hero"* — which was the right call for a dense instrument and is worth revisiting now.

### 3.4 The most interesting colour in the system is used at about one per cent of the area

`projectHueOf` gives every project its own hue, consistently, everywhere. It is the one thing on the page that is
genuinely *his*. It appears as a **7px dot** and a **3px rail**. Meanwhile the page is near-black, one grey ramp,
one accent blue, amber for decisions and green for done.

**The project colour is the best material in the design and it is being used as a garnish.**

### 3.5 The page is completely flat, and one of the reasons is a misreading that is already on the record

No shadows, no depth, no default texture. The default surface is `Flat`, and the five unlockable surfaces are
built from the three lowest ramp steps deliberately so they cannot be loud.

**Read `lib/finishes.ts`'s header before you conclude shadows are banned.** The rule is *"every colour a finish
paints in is a token"* — a **colour** rule, about assertability. §X of the log records that a previous pass
conflated that with a **shape** rule, ruled out the silhouette, and shipped five crest finishes nobody could tell
apart. *"The restriction was never the problem; the timidity was."* The same sentence may well apply to the whole
page. A shadow whose colour is a token, or depth built from the ramp steps, is not obviously against any rule that
exists — work out what is actually forbidden rather than inheriting my caution.

### 3.6 Five hundred pixels of the screen are unused, and the busiest element wastes its own width

Measured at 1920: viewport **1920**, content shell **1420**, queue column **911**, row **857**. So **500px of empty
page**, and inside the row the title sits left while `25m · 19 steps · ✓` sits hard right, leaving a dead gap
across the middle of every one of the 21 rows.

The `.shell` steps 1180 → 1420 → 1760 across three breakpoints, so the width is *available*; the design just never
does anything with it.

### 3.7 The right-hand column reads as a list of leftovers

Six stacked sections — finished, marks, next, tell an agent, projects, footer — each a small heading over small
text, no grouping, no rhythm, no varying density. It is a sidebar of everything that was not the queue.

### 3.8 The crest is the emotional centre of the product and it is 96 pixels

It is the one expressive, generated, personal object in the whole interface. It sits at 96px in the corner of a
panel. §XII of the log accepted that trade for a reason that was true then — *"the pane has zero spare pixels"* —
and §3.9 below is why that reason is now the most interesting constraint in the brief rather than a closed door.

### 3.9 THE CENTRAL TENSION, and the thing to solve first

**The layout is at zero spare in both directions:**

- **L3** — six tasks must start within the first screen at 1280×900. It is *exactly* six. Anything added above the
  queue pushes the sixth below the fold and the check fails.
- **L7** — the idle reading pane fits at 1920 with **zero** spare. Anything added to that column fails.

So "make it beautiful" **almost cannot mean "add"**. It has to mean redistribute, re-weight, and spend what is
already there: the 500px of unused width, the unused top of the type scale, the project colour, and whatever
`.shell`'s three breakpoints will give you. Two previous sessions paid for additions by deleting something and
saying what they deleted and why — that is the established move and it works, but it is not the only one.

#### Correction, measured after this brief was written: the budget is not spent, it is *committed*

The paragraph above is true about the checks and wrong about the conclusion. Measured at 1280×900 on the standard
fixture, here is every pixel above the first task row:

| y | height | what occupies it |
|---|---|---|
| 0 | 208 | header, crest, board |
| 241 | **273** | **one decision card** (`.card.ask`) |
| 522 | 34 | the "more" link |
| 582 | 61 | section heading + time-filter chips |
| 654 | 42 | project group header |
| **696** | 37 each | the queue, at last — six rows, 19px of total slack |

**One decision card spends 273px — 30% of the viewport, and more vertical space than seven queue rows.** The thing
the owner opens the hub to look at begins 77% of the way down the screen.

That reframes the whole tension. The queue rows have 3px each to grow, which reads as "there is no room" — but
there is 696px of everything-else in front of them, and the largest single item in it is one question rendered at
the size of a hero. **L3 is not a ceiling you must design under. It is a receipt for how the space is currently
divided, and the division is the thing to argue with.**

Do not read this as "shrink the ask card" — the decision surface earned its prominence honestly, over three
sessions, and §3.7 is a complaint that the right column reads as leftovers precisely *because* the left column
takes everything. Read it as: **the first question of the visual pass is not "what should the queue look like" but
"what is 696px buying, and would the owner have chosen to spend it that way."** Answer that with a measurement and
the rest of the critique reorders itself around the answer.

**If you conclude the right answer needs a bigger budget, you may change the layout — including the two-column
split itself.** L3 and L7 are checks over a design, not axioms. What you may not do is break one silently: change
it deliberately, re-measure, and argue it in the log.

---

## 4. What is not negotiable, and why each one exists

Each of these cost something specific. `docs/HANDOVER.md` §2 has the full reasoning.

| Rule | Why |
|---|---|
| **Progress is computed, never stored.** | A stored score can disagree with the rows it came from. Re-opening a task must take the credit back for free. |
| **Nothing reports success until re-read.** | `writeVerified`. No optimistic UI anywhere. |
| **Nothing that carries truth may move.** | A count may not animate to its value. Motion is for PRESENCE — arriving, leaving, an event. §XIV's level-up strike is the worked example of doing this legally. |
| **Every colour is a token with an asserted pair, in 6 palettes × 2 schemes.** | `npm run prove:palette` is **4,140 checks**. Add a colour, add its pair. |
| **A surface may reference only `--s0`, `--s1`, `--s2`.** | A whitelist is the only guarantee that survives an unbounded set. Check C2 measures the pixels actually painted behind every glyph. |
| **No new dependency, no web font, no assets.** | Four runtime dependencies, deliberately. A font file is a request, a FOUT and a dependency in a tool that must survive being ignored. |
| **Plain language.** | Check **W1**: 221 user-facing strings against 23 words the hub has never explained. §XV is what happens when you forget — I wrote a receipt in heraldry and he could not read it. |
| **No streak, ever.** | RESEARCH §18. A streak renders the empty hub — the state the hub exists to reach — as a loss. |
| **Never `-c user.email` on a commit.** | It cost a blocked deployment. |
| **Push every commit.** | Production deploys from `master`. He has asked more than once. |

**The one that will bite a visual pass hardest:** contrast is measured on **rendered pixels**, not on your
intention. C1 reads computed colours through a canvas; C2 screenshots the page twice and samples the real pixels
behind every glyph line box. A gradient without an opaque `background-color` underneath is reported as
*unmeasurable*, and an `oklch()` parsed by regex once passed text at 1.62:1. Believe the canvas.

---

## 5. What is open, and it is more than you think

- **The default surface.** `Flat` is the default and the five alternatives are deliberately near-invisible. That
  was a decision about *perks*, not about the hub's baseline material. A default with some material is not
  obviously wrong and nobody has tried it.
- **Depth.** See §3.5. Work out what the colour rule actually forbids.
- **The type scale's top end.** It exists and is unused.
- **The width.** 500px at 1920, and `.shell` already has three tiers.
- **The row.** 21 identical rows is the biggest opportunity in the product.
- **The crest's size and placement.** The most personal object in the hub, currently 96px.
- **The palettes.** Six named plus an unbounded minted line (§XIV). All safe by construction — contrast is a
  function of lightness and the generator cannot reach lightness. You can be braver with colour than you think.
- **`/looks`, `/setup` and the record's five tabs** have had far less visual attention than the board.

---

## 6. The one functional defect outstanding, measured

**At two years of his own measured rate the page ships the entire record on every load.** Numbers, from
§XVIII — 2,190 completions and 1,460 answered decisions across 15 projects, inserted into the dev database and
rendered:

| | fixture volume | two years |
|---|---|---|
| HTML, uncompressed | 11 KB | **1.65 MB** |
| server render, same warm dev server | 79 ms | **2,010 ms** (budget 1,200) |
| historical rows in the payload | 14 | **3,687** |
| record rows actually displayed | 0 | **0** |

It ships 3,687 historical rows to draw 21 queue rows. **L8 fails on time.** And L8's payload budget cannot see the
size, because it measures `transferSize` — 1.6 MB of repetitive markup gzips to 74 KB, comfortably under the 400 KB
ceiling, while the browser still decompresses, parses and hydrates 1.6 MB on a phone.

**Why it is like that, and why it is not a one-liner:** `Board` re-derives everything client-side so the level, the
marks and the crest move in the *same interaction* as a tick. Client-side derivation needs the whole history. So the
tension is real: honest instant figures require the full record, and the full record is unbounded.

**The approach I would take, with the precedents that make it the obvious call rather than an invention:**

- `notes` is already capped at 20, and `lib/store.ts` says a window is honest *as long as the interface does not
  claim it is everything*.
- `doneTasks` was already narrowed once for exactly this reason — `FinishedRow` exists because *"sending every step
  of every completed task to the browser is what made the page payload grow without a ceiling"*. Same battle, one
  level up, already half won.

So: counts come from SQL, the list ships a window and says so, and **P2's invariant becomes "the figure equals the
SQL count"** instead of "the figure equals the length of the array we shipped". P2 exists specifically to stop
someone capping that list naively — read it before you touch it. And give L8 an **uncompressed** payload measure so
it stops being blind.

**Do this second, not first.** He asked for the visual pass and a slow page at year two is not what he sees today.
But do not drop it: the reproduction script is in the log and takes two minutes.

---

## 7. The evidence machinery. Learn it before you write code

```bash
npm run dev              # port 3939. ONE AGENT PER TREE — if EADDRINUSE, stop and say so
npm run prove:parse      # node --check over tests/ — two seconds. RUN IT FIRST
npm run typecheck
npm run prove            # 51 checks, end-to-end over real HTTP against the real database
npm run prove:negative   # 25 checks, every safety guarantee broken on purpose
npm run prove:palette    # 4,140 contrast checks: 45 pairs x 46 palettes x 2 schemes
npm run prove:ladder     # 62 checks: the progression at day 730, the crest, the perk economy, the words
npm run prove:layout     # every geometric check at 5 widths, both themes, + C1/C2 on rendered pixels
npm run audit            # every entry point, and where each one lands
npm run shots            # 20 screenshots. --light, --path setup, --path looks, --crest, --find, --finished
node tests/shoot-bench.mjs [--light]   # /emblem: 18 synthetic histories through the real pipeline
```

**The fixture has four data states and a visual pass must look at all four:**

```bash
npm run fixture                  # 21 open tasks, 4 projects, 4 decisions — the design volume
npm run fixture -- --live        # PRODUCTION's real shape: 12 open, 2 projects, ZERO open decisions
npm run fixture -- --cleared     # finished work, nothing open — the EARNED empty hub
npm run fixture -- --unstarted   # nothing filed, no agent ever synced — the FIRST screen a new person sees
```

`--unstarted` and the per-project decision count were both added in the last two sessions **because the state was
unreachable and therefore unlooked-at**. Three sessions running, the defects came from states nobody had rendered.
**Load all four and look before you design anything.**

Two states are still unrendered, as far as I know: **more than eight projects** (the crest's band cap bites at
nine) and **two years of volume** (§6 renders it but nothing has ever *designed* for it).

---

## 8. Traps that have each cost hours

1. **No backticks inside a template literal in `tests/`, including in comments.** Eleven occurrences, four of them
   in comments written moments after reading the warning. `npm run prove:parse` catches it — run it first.
2. **A value import between two `lib/*.ts` files breaks the suites.** Node's type-stripping erases `import type`
   but cannot resolve an extensionless value import. Re-verified with a probe on 3 Aug: still true. `lib/charges.ts`
   and `perkArrivals` show the two ways round it.
3. **Never run a suite immediately after editing.** `next dev` compiles on demand. I read two false failures in one
   hour this way — a task that "never left the queue" and L8 at 1,493ms — both green on a warm server. Hit the
   route twice first.
4. **`prove:use` is not idempotent.** `npm run fixture` first, always. A second consecutive run fails 9 of 16 with
   accurate messages about the wrong thing.
5. **`prove:layout` needs a fresh fixture too, and L3 is the check that tells you so.** Running it straight after
   `prove` and `prove:negative` gave me `L3 FAIL — 4 of 21 tasks start within the first screen`, and there was
   nothing wrong: those suites answer and file questions, so the first OPEN decision changes, and a `respond` card
   with a textarea is about 90px taller than a two-option `choose` card. That difference is the sixth task. Measured
   on a fresh fixture the same page puts the first row at y=696 with six above the fold. **`npm run fixture` between
   suites, not just before the first one** — and if L3 fails, check what kind of decision is at the top of the page
   before you believe it.
6. **A transient Neon failure can leave `proof-*` residue that `npm run fixture` cannot clear.** `prove`'s last
   check is *"the hub is left with no trace of this run"*; when the connection drops mid-cleanup it fails and leaves
   `proof-alpha`, `proof-beta` and `proof-run` rows behind — and `clear()` is scoped to the four fixture slugs, so
   reloading the fixture does not remove them. Symptom: `prove:use` fails four checks about the done count while the
   fixture insists it wrote nine, because the database holds twenty. Diagnose by counting
   `select status, count(*) from tasks group by status` — the fixture's documented state is **9 done, 22 open,
   2 answered**. Delete `where project like 'proof-%'` from `tasks`, `questions`, `notes` and `events` to recover.
   The dev branch was flaky for about an hour on 4 August; if writes are failing, wait rather than debug.
7. **The dev sync log crossing 200 rows breaks six unrelated checks.** `changed` is paged at 200 and returns the
   *oldest* 200; two dozen checks sync from zero and search for an event they just made. A guard check now fails
   first with the real reason and prints the headroom.
8. **A screenshot proves it rendered, not that it landed.** The question is *would someone notice this if nobody
   told them to?* Crop to 4× and read it. The cog in §XVII survived nine green suites, four bench renders and two
   rounds of zoomed reading before a 4× crop of `/looks` made it obvious.
9. **`prove:health` needs the dev server stopped.**

---

## 9. How to work

- **Plan first, in `docs/ITERATION-LOG.md`, then audit your own plan** partway through against what you have
  actually measured. That has been the highest-value hour of four separate sessions.
- **Decide everything yourself.** He has said *"you decide, but the decision must be a very optimal one"* and
  *"why can't you decide this without me?"*. Where a call is open, take the better one and write the reasoning in
  the code where the decision lives.
- **Ship visible change before machinery.** He has said tests and docs outweighing product 2:1 was noticeable and
  unwelcome. This brief is a visual mandate: if the hub does not look different, the session failed.
- **Look at what you build, at the size it renders.** Of the defects on record, a third were found by checks and
  two thirds by reading a rendered picture. Four were found by him in seconds on pages an agent had photographed
  and filed.
- **Record every claim of yours that a measurement or a screenshot disproved.** That is the most valuable category
  in the log. The last four sessions had 3, 5, 6 and 22.
- **Push every commit.**

### Done means all of this is true

- [ ] The hub looks materially different, and better, at 1280 and 1920, in both themes, in all six named palettes.
- [ ] All four data states looked at, and none of them looks worse than the design volume.
- [ ] L3 six above the fold at 1280, L7 fits at 1920, K3 three keystrokes — or deliberately changed, re-measured,
      and argued in the log.
- [ ] Every new colour has an asserted pair in both themes. `prove:palette` green.
- [ ] All nine suites green, every new check with a fault injection.
- [ ] `docs/ITERATION-LOG.md` records the plan, the audit of the plan, every measured before and after, and every
      claim a measurement disproved.
- [ ] Committed and **pushed**, and production re-verified:
      `node tests/measure-layout.mjs https://needsme.vercel.app --production` and `/api/health`.

---

## 10. One last thing

He runs about fifteen agent projects alone, and this hub is the only thing standing between that and the pile of
half-finished work everyone else has. Four sessions have made it correct, honest, checkable and readable.

**Correct is the floor. He has asked, three times now, for it to be good to look at.**
