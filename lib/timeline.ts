import type { SessionRow, SubagentRow } from './store';

/**
 * WHAT RAN LAST NIGHT — the fold that turns rows into a chart, and the honesty rules that shape it.
 *
 * ==================================================================================================
 * A BLOCK ON A CHART IS A CLAIM ABOUT A SPAN OF TIME
 * ==================================================================================================
 *
 * That sentence is the whole design brief for this file. `/agents` has already shipped two defects in
 * two days and both were the same mistake — stating more than the evidence supports. It said
 * *"claude-code is working on video-presentations now"* when the only evidence was a sync, and it gave a
 * dollar figure a heading and a bold number until the owner read his own page and asked what he had
 * been billed for.
 *
 * A timeline is far more exposed to that class of error than a sentence is, because a rectangle asserts
 * a start AND an end AND everything in between, silently, and looks equally confident whichever of the
 * three it actually knows. So every block carries what KIND of claim it is, and the renderer draws the
 * kinds differently:
 *
 *   `measured`      a session a hook watched start and watched finish. A bar, and the bar is the truth.
 *   `running`       started, not finished, and recent enough to still believe. Drawn open at the right
 *                   edge — no end cap — because there is no end to draw.
 *   `unterminated`  started, never finished, and too old to believe. Drawn to the LAST thing actually
 *                   seen rather than to now, because "it is still going" is not what the rows say.
 *   `reconstructed` read out of the harness's own transcript after the fact. Real timestamps, but
 *                   boundaries inferred from gaps rather than reported by anything.
 *
 * And one shape rule that is not a state: a span too narrow to draw as a bar is drawn as a TICK, not as
 * a bar with a minimum width. Grafana's state timeline renders a value inside a region only "if there
 * is sufficient space"; the same principle applied to the region itself says that when a duration
 * cannot be drawn, the honest thing is a mark saying *something happened here* rather than a rectangle
 * quietly claiming three minutes because that is the narrowest rectangle the screen can hold.
 *
 * ==================================================================================================
 * NO VALUE IMPORTS, DELIBERATELY
 * ==================================================================================================
 *
 * Types only. `lib/presence.ts` imports two formatters as values and is therefore unloadable by any
 * `tests/*.mjs` check (AGENTS.md trap 2), which cost it its unit tests and pushed every assertion about
 * it into a browser. This fold is arithmetic over timestamps — exactly the thing worth asserting
 * cheaply and exhaustively — so it stays importable.
 */

/** An un-ended session stops being believed at the same point `lib/presence.ts` stops believing one. */
export const OPEN_SESSION_HOURS = 12;

/**
 * A sub-agent with no end. Three hours.
 *
 * Shorter than a session's twelve for a reason that is about what the two things ARE: a session ends
 * when somebody closes a terminal, so an un-ended session is ordinary. A sub-agent ends when its work
 * returns, and the harness reports that on two independent hooks — so a sub-agent still open after
 * three hours almost certainly means the process it lived in died, and drawing it as running would be
 * asserting the one thing that is least likely to be true.
 */
export const OPEN_SUBAGENT_HOURS = 3;

/**
 * THE DEFAULT WINDOW. Twenty-four hours, and it is the shape of the question rather than a round number.
 *
 * He opens this in the morning and the thing he wants is the night: what ran while he was asleep, and
 * whether anything is still going. A day back from now covers that whichever morning it is, and it
 * covers "this afternoon" at four o'clock too. Anything longer buries a night inside a week.
 */
export const WINDOW_HOURS = 24;

/** How far back the window will stretch when nothing has run for a day. See `chooseWindow`. */
export const MAX_WINDOW_DAYS = 14;

/**
 * A span narrower than this many pixels is a tick rather than a bar. Three.
 *
 * Chosen against the drawn width rather than against a duration, because that is what makes it a
 * statement about legibility rather than about time: below three pixels a rounded rectangle and a line
 * are the same object, so there is nothing to be gained by drawing the rectangle and there is a false
 * duration to be lost. At a 24-hour window on a 1000px chart it works out at about four minutes.
 */
export const MIN_BAR_PX = 3;

export type BlockKind = 'measured' | 'running' | 'unterminated' | 'reconstructed';

export interface SubagentMark {
    id: string;
    type: string;
    task: string | null;
    model: string | null;
    /** Percentages OF THE PARENT BLOCK, so a sub-agent is positioned inside what spawned it. */
    left: number;
    width: number;
    startedAt: string;
    endedAt: string | null;
    outcome: string | null;
    kind: BlockKind;
    toolCalls: number | null;
    edits: number | null;
    linesAdded: number | null;
    linesRemoved: number | null;
    /** True when the span is too narrow to be a bar and is drawn as a mark instead. */
    tick: boolean;
}

export interface Block {
    key: string;
    project: string;
    agent: string;
    session: string;
    kind: BlockKind;
    /** Percentages of the whole window. */
    left: number;
    width: number;
    /** True when this began before the window and the left edge is a crop rather than a start. */
    clippedLeft: boolean;
    tick: boolean;
    startedAt: string;
    /** The instant the bar's right edge stands for. Null only when the block is still running. */
    endedAt: string | null;
    endReason: string | null;
    branch: string | null;
    model: string | null;
    minutes: number | null;
    subagents: SubagentMark[];
    /** Which packing row inside the lane this block sits on. Zero unless something overlaps it. */
    row: number;
}

export interface Lane {
    project: string;
    blocks: Block[];
    /** How many packing rows this lane needs. At least one. */
    rows: number;
    /** Every sub-agent under this lane's blocks, for the lane's own summary. */
    subagents: number;
}

export interface AxisMark {
    /** Percentage across the window. */
    at: number;
    /** The hour or the date, already decided — the renderer does no formatting arithmetic. */
    label: string;
    /** Midnight, or the start of a day in the wide window. Drawn stronger. */
    major: boolean;
    /**
     * DROPPABLE ON A NARROW SCREEN, and this flag is the whole fix for a real defect.
     *
     * Eight labels across a 1280px chart is the density both references land on. Across a 390px phone
     * the same eight collide into `21:0 8 Aug3:006:009:012:015:018:00` — not merely tight, but a row of
     * characters that is no longer a time. The marks are computed once on the server (see
     * `buildTimeline` for why the geometry must not change with the viewport), so the narrow case is
     * handled by marking every second one droppable and letting one CSS rule hide them.
     *
     * Chosen by the CLOCK rather than by position, so midnight and the six-hour marks always survive.
     * Hiding every other element by `nth-child` would drop whichever ones happened to be even, which on
     * a window that starts at 20:20 is the midnight boundary half the time.
     */
    droppable: boolean;
}

export interface TimelineView {
    from: string;
    to: string;
    hours: number;
    lanes: Lane[];
    axis: AxisMark[];
    /** True when the window had to stretch past a day because nothing had run in one. */
    stretched: boolean;
    /** Blocks in the window, and how many of them are still running. */
    total: number;
    running: number;
    subagents: number;
    /** True when at least one block was reconstructed rather than observed. */
    anyReconstructed: boolean;
    /** True when at least one block runs off the left edge. */
    anyClipped: boolean;
}

const ms = (iso: string): number => new Date(iso).getTime();

/**
 * WHEN THE WINDOW IS NOT A DAY, and this is the empty-state problem solved with arithmetic rather than
 * with a paragraph.
 *
 * A fixed 24-hour window is right whenever anything has run in a day, and produces a beautiful empty
 * chart whenever nothing has — which is §XXVII's finding (a caveat about a list that is not there) and
 * §XXVIII's (one grey line in a 660px void) arriving for a third time in a new shape. So when the last
 * day is empty the window stretches back to the newest thing there is, capped at a fortnight, and the
 * page says it stretched. A chart of nothing is replaced by a chart of the last thing that happened.
 */
export function chooseWindow(
    sessions: SessionRow[], now: number,
): { from: number; to: number; stretched: boolean } {
    const day = WINDOW_HOURS * 3_600_000;
    const newest = sessions.reduce((max, s) => {
        const end = ms(s.ended_at ?? s.last_seen_at);
        return end > max ? end : max;
    }, 0);
    if (!newest || newest > now - day) return { from: now - day, to: now, stretched: false };

    const oldestWanted = now - MAX_WINDOW_DAYS * 86_400_000;
    /* Back to the START of the newest run, not to its end, so the newest block is whole rather than a
     * one-pixel sliver against the left edge. */
    const newestStart = sessions
        .filter(s => ms(s.ended_at ?? s.last_seen_at) >= newest - day)
        .reduce((min, s) => Math.min(min, ms(s.started_at)), newest);
    return { from: Math.max(oldestWanted, newestStart - day / 4), to: now, stretched: true };
}

/**
 * The hour marks, or the day marks when the window is wide.
 *
 * Labels are decided here rather than in the component for the reason `sentenceFor` builds its strings
 * on the server: one place makes a claim about time, so one place can be checked. Everything is UTC
 * because every other date in this hub is, and a chart whose axis disagreed with the sentences above it
 * about what "today" means would be the kind of small contradiction that costs trust in every figure.
 */
export function axisFor(from: number, to: number): AxisMark[] {
    const span = to - from;
    const hours = span / 3_600_000;
    const out: AxisMark[] = [];

    if (hours <= 36) {
        /* Every three hours: eight or nine labels across the chart, which is the density both
         * references land on — enough to read a time off a block, few enough not to become a grid. */
        const step = 3 * 3_600_000;
        const first = Math.ceil(from / step) * step;
        for (let t = first; t <= to; t += step) {
            const d = new Date(t);
            const h = d.getUTCHours();
            out.push({
                at: ((t - from) / span) * 100,
                label: h === 0 ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : `${pad(h)}:00`,
                major: h === 0,
                droppable: h % 6 !== 0,
            });
        }
        return out;
    }

    const step = 86_400_000;
    const first = Math.ceil(from / step) * step;
    for (let t = first; t <= to; t += step) {
        const d = new Date(t);
        out.push({
            at: ((t - from) / span) * 100,
            label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
            major: d.getUTCDate() === 1,
            /* Day marks on the wide window: every other one, so a fortnight reads as seven labels on a
             * phone rather than fourteen overlapping ones. */
            droppable: d.getUTCDate() % 2 === 1,
        });
    }
    return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** What kind of claim this session supports. The single most important function in this file. */
function sessionKind(s: SessionRow, now: number): BlockKind {
    if (!s.observed) return 'reconstructed';
    if (s.ended_at) return 'measured';
    const age = now - ms(s.started_at);
    return age < OPEN_SESSION_HOURS * 3_600_000 ? 'running' : 'unterminated';
}

/**
 * The instant a block's right edge stands for, which is NOT always its end.
 *
 * A running block is drawn to now, because that is what "still going" means. An `unterminated` one is
 * drawn to the last thing anything actually saw — never to now — because the rows say a session began
 * and nothing ever closed it, and stretching it to the present would turn "a terminal was closed
 * yesterday" into "an agent has been working for nineteen hours".
 */
function rightEdge(s: SessionRow, kind: BlockKind, now: number): number {
    if (kind === 'running') return now;
    return ms(s.ended_at ?? s.last_seen_at);
}

/**
 * Greedy packing into as many rows as a lane needs, and NO CAP on the number.
 *
 * Two sessions in one project at the same time is real — two terminals, or an agent running while he
 * works — and overlapping them into one row would draw one on top of the other, which loses a block
 * with nothing to say so. Capping the rows would do the same thing with a number attached.
 *
 * In practice a lane needs one row: stretches reconstructed from a transcript cannot overlap each other
 * by construction, and live sessions in one project rarely do. The packing exists for the case that
 * would otherwise be silently wrong, which is the only reason a case is worth code.
 */
function pack(blocks: Block[], minGapPct: number): number {
    const rowEnds: number[] = [];
    for (const b of blocks) {
        const end = b.left + b.width;
        let row = rowEnds.findIndex(e => b.left >= e + minGapPct);
        if (row < 0) { row = rowEnds.length; rowEnds.push(0); }
        rowEnds[row] = end;
        b.row = row;
    }
    return Math.max(1, rowEnds.length);
}

/**
 * Everything the chart draws, from the rows and one instant.
 *
 * `chartPx` is the width the chart will actually be painted at, and it is a parameter rather than a
 * constant because the tick-versus-bar decision is about pixels. Passing a nominal width means the
 * decision is made once, on the server, and the same JSON draws the same shapes at every breakpoint —
 * which is the trade taken deliberately: a block that is a tick at 1280 stays a tick at 1920, and the
 * alternative is a chart whose claims change when the window is resized.
 */
export function buildTimeline(
    sessions: SessionRow[], subagents: SubagentRow[], now: number, chartPx = 1000,
): TimelineView {
    const { from, to, stretched } = chooseWindow(sessions, now);
    const span = Math.max(1, to - from);
    const minPct = (MIN_BAR_PX / chartPx) * 100;

    const byParent = new Map<string, SubagentRow[]>();
    for (const a of subagents) {
        const key = `${a.project} ${a.session}`;
        const list = byParent.get(key);
        if (list) list.push(a); else byParent.set(key, [a]);
    }

    const laneOf = new Map<string, Block[]>();
    let running = 0;
    let subagentCount = 0;
    let anyReconstructed = false;
    let anyClipped = false;

    for (const s of sessions) {
        const kind = sessionKind(s, now);
        const startedMs = ms(s.started_at);
        const endMs = rightEdge(s, kind, now);
        /* Outside the window entirely. A block ending before it began is impossible in the rows and is
         * refused rather than drawn backwards. */
        if (endMs < from || startedMs > to || endMs < startedMs) continue;

        const clippedLeft = startedMs < from;
        const drawnStart = Math.max(startedMs, from);
        const drawnEnd = Math.min(endMs, to);
        const left = ((drawnStart - from) / span) * 100;
        const rawWidth = ((drawnEnd - drawnStart) / span) * 100;
        const tick = rawWidth < minPct;
        const width = tick ? 0 : rawWidth;

        if (kind === 'running') running++;
        if (kind === 'reconstructed') anyReconstructed = true;
        if (clippedLeft) anyClipped = true;

        const mine = byParent.get(`${s.project} ${s.session}`) ?? [];
        const marks: SubagentMark[] = [];
        for (const a of mine) {
            const aStart = ms(a.started_at);
            const aKind: BlockKind = !a.observed
                ? 'reconstructed'
                : a.ended_at
                    ? 'measured'
                    : now - aStart < OPEN_SUBAGENT_HOURS * 3_600_000 ? 'running' : 'unterminated';
            const aEnd = a.ended_at
                ? ms(a.ended_at)
                : aKind === 'running' ? now : aStart;
            /*
             * Positioned against the BLOCK, and clamped to it. A sub-agent whose end falls outside its
             * parent's drawn span happens for one honest reason — the parent is `unterminated`, so its
             * right edge is the last thing seen and the sub-agent outlived it — and letting the mark
             * escape the block would draw a child outside its parent, which is not a thing that can
             * happen and would read as a rendering fault rather than as data.
             */
            const parentSpan = Math.max(1, drawnEnd - drawnStart);
            const aLeft = Math.min(100, Math.max(0, ((aStart - drawnStart) / parentSpan) * 100));
            const aRight = Math.min(100, Math.max(0, ((aEnd - drawnStart) / parentSpan) * 100));
            const aWidthPct = Math.max(0, aRight - aLeft);
            /* The tick test is against the CHART, not against the parent: a sub-agent inside a narrow
             * block is narrow on screen however wide it is as a fraction of its parent. */
            const aChartPct = (aWidthPct / 100) * (rawWidth / 100) * 100;
            marks.push({
                id: a.id,
                type: a.type,
                task: a.task,
                model: a.model,
                left: aLeft,
                width: aWidthPct,
                startedAt: a.started_at,
                endedAt: a.ended_at,
                outcome: a.outcome,
                kind: aKind,
                toolCalls: a.tool_calls,
                edits: a.edits,
                linesAdded: a.lines_added,
                linesRemoved: a.lines_removed,
                tick: aChartPct < minPct,
            });
            subagentCount++;
        }
        marks.sort((x, y) => x.left - y.left);

        const block: Block = {
            key: `${s.project} ${s.agent} ${s.session}`,
            project: s.project,
            agent: s.agent,
            session: s.session,
            kind,
            left,
            width,
            clippedLeft,
            tick,
            startedAt: s.started_at,
            endedAt: kind === 'running' ? null : new Date(endMs).toISOString(),
            endReason: s.end_reason,
            branch: s.branch,
            model: s.model,
            /* Null while running, because a duration ending at "whenever you happened to look" is not a
             * measurement of anything. The block says how long it has been going in words instead. */
            minutes: kind === 'running' ? null : Math.max(0, Math.round((endMs - startedMs) / 60_000)),
            subagents: marks,
            row: 0,
        };
        const list = laneOf.get(s.project);
        if (list) list.push(block); else laneOf.set(s.project, [block]);
    }

    const lanes: Lane[] = [...laneOf.entries()].map(([project, blocks]) => {
        blocks.sort((a, b) => a.left - b.left);
        const rows = pack(blocks, minPct);
        return {
            project,
            blocks,
            rows,
            subagents: blocks.reduce((n, b) => n + b.subagents.length, 0),
        };
    });

    /*
     * BUSIEST LANE FIRST, and it is the opposite of the project list above it on purpose.
     *
     * `foldProjects` puts the QUIET ones first, because a project nothing has looked at is a finding and
     * reassurance is not. The chart answers the other question — what actually ran — and a lane with
     * nothing in it is not drawn at all, so there is no quiet to surface here. Ordering by how much ran
     * puts the night's real work at the top, where the eye lands.
     */
    lanes.sort((a, b) =>
        b.blocks.length - a.blocks.length || a.project.localeCompare(b.project));

    return {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        hours: Math.round(span / 3_600_000),
        lanes,
        axis: axisFor(from, to),
        stretched,
        total: lanes.reduce((n, l) => n + l.blocks.length, 0),
        running,
        subagents: subagentCount,
        anyReconstructed,
        anyClipped,
    };
}
