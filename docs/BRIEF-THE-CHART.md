# Brief: the chart, and the references it should be aiming at

**Written 9 August 2026.** The owner looked at `/agents` after the timeline shipped and said: *"things are too
minimalistic… it looks like a text-only website, whereas things could be a lot more beautiful, more intuitive,
and more modernly done."* Then, more bluntly: *"is it so hard to search for all of the good great command
centers that already exist? … we are nowhere near there… so far we didn't even do 10% of what needs to be
done."*

He is right on all three counts, and the third is a fair hit at me specifically: four visual passes have been
briefed with "make it beautiful" and no target. This file is the target.

---

## 1. What is actually wrong, measured rather than felt

Read off a 1440×1050 render of `/agents` on the standard fixture:

| | now | the problem |
|---|---|---|
| lane height | ~36px | the bar inside it is **10px**. Three quarters of every lane is empty. |
| bar label | none | the bar says nothing; the sentence is in a separate list below. |
| legend | **five sentences, ~130px** | taller than the chart it explains. |
| time axis | hour labels, no gridlines | nothing carries the eye down from a label to a bar. |
| window | fixed 24 hours | a fortnight of backfilled runs exists and cannot be reached. |
| panes | one | the run list and the chart are stacked, not cross-linked. |

**The legend is the diagnosis, not a detail.** Five sentences explaining hatched fills, missing right edges,
broken edges, and marks-instead-of-bars means four distinct visual states were invented and none of them
explains itself. Prose is doing the work the drawing should do.

---

## 2. The reference that matters most, and why

**The thing being built is a trace waterfall.** Runs containing nested sub-agent runs, across lanes, over time,
with wildly different durations — that is structurally identical to a flame chart or a distributed trace, and
those have been refined for fifteen years. The references are NOT task managers. They are profilers.

### Speedscope (github.com/jlfwong/speedscope) — read the actual screenshot, not a description

Five rules, taken from the picture:

1. **Every bar carries its own label, truncated with an ellipsis.** `pro…ion`, `aug…ens`, `pre…ess`. A bar too
   narrow for its full name still shows a fragment of it. **This is what removes the legend.** Their chart needs
   no legend because each shape is self-describing; ours needs five sentences because the shapes are anonymous.
2. **The bar fills its row.** Rows are ~20px and the bar is the row. Ours spends 36px of lane to draw 10px of
   bar, which is why it reads as sparse while also being cramped.
3. **Hue is identity, not status.** Many low-saturation hues, one per symbol, and **saturated fill is reserved
   for selection** — exactly one strong blue on the whole screen. We currently spend colour on project identity
   too, which is right; what we lack is the reserved loud colour for "this one, now".
4. **A real axis with numbers and faint vertical gridlines** behind the bars, so a label at the top connects to
   a bar in the middle.
5. **Two panes, cross-linked.** An aggregate table beside the chart, joined by a colour swatch per row. ~35 rows
   in 700px: the density is the product, not a compromise against beauty.

### Also worth reading before designing

- **Langfuse and LangSmith** — the closest domain match: agent runs with nested tool calls and sub-agents. Their
  problem is ours exactly.
- **Chrome DevTools Performance, Firefox Profiler, Perfetto, Xcode Instruments** — for extreme duration ranges
  and for how a two-second item sits beside a fifty-minute one without either disappearing.
- **Dagster, Temporal, Airflow Gantt, GitHub Actions** — for runs-over-time at the scale of many projects.
- **Thronefall** — the owner's own reference, and the only one he chose himself. Flat shapes, tiny palette,
  strong silhouettes, almost no chrome. Worth taking: state encoded in shape rather than in text. **Mini Metro
  and Into the Breach** are the sharper versions of the same idea — both encode a great deal of state in very
  few marks, which is precisely what those five legend sentences fail at.

**Admissibility, because this is where a visual pass goes wrong:** a reference must be dense,
information-heavy and work in dark. Landing pages, marketing sites and dribbble concepts are inadmissible —
imitating them turns an instrument into a brochure.

---

## 3. What must not be sacrificed for it

- **The queue page is untouched.** It answers exactly one question. Nothing here may inflate it or its counts.
- **No per-tool-call stream.** One row per run and one per sub-agent. A session makes hundreds of tool calls;
  §XXVI was spent fixing a payload cliff caused by far less.
- **No new dependency, no web font, no image assets.** CSS and inline SVG.
- **Every new colour needs an asserted contrast pair** in 6 palettes × 2 schemes. C1/C2 measure rendered pixels.
- **A shape may not claim more than the row supports.** An inferred span must still look inferred — but it must
  do so *without a sentence*, which is the hard part and the point of this brief.

---

## 4. Done means

- [ ] The chart needs **no legend**, because every bar labels itself.
- [ ] Lane height and bar height are the same decision, and the bar fills its lane.
- [ ] There is a time axis with gridlines, and a way to change the window from 24 hours to the whole record.
- [ ] One saturated colour, reserved for the selected run and nothing else.
- [ ] It works at one project and at nineteen, and at two years of volume.
- [ ] Every rubric dimension in `§XXXI` still at parity or better, extended with the chart's own dimensions.
- [ ] Twelve suites green, every new check with a fault injection watched failing.
- [ ] Every claim a measurement disproved is in the log.
