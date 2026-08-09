'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    crestInput, derive, emptinessOf, expandHistory, finishedRowOf, marks as marksOf, nextUp, noteReach,
    RECORD_WINDOW, rungAt, standing as standingOf,
} from '../../lib/progress';
import { foldProjects, sentenceFor } from '../../lib/presence';
import { perkStates } from '../../lib/perks';
import { generatedPerks } from '../../lib/looks';
import type { Looks } from '../../lib/looks';
import type { BoardState } from '../../lib/store';
import type { Task } from '../../lib/types';
import Approvals from './Approvals';
import DoneRow from './DoneRow';
import Timeline, { momentCount } from './Timeline';
import Palette, { type PaletteAction } from './Palette';
import Nav from './Nav';
import Profile from './Profile';
import Progress from './Progress';
import StaleBlocked from './StaleBlocked';
import QuestionCard from './QuestionCard';
import TaskDetail from './TaskDetail';
import TaskRow from './TaskRow';
import {
    act, humanAgo, humanCount, humanDate, humanMinutes, KeyHint, projectColor, Saved, submitOnCtrlEnter,
    type SaveState,
} from './ui';

/**
 * The whole interface. One screen, no navigation, no tabs.
 *
 * THE SHAPE: a queue beside a reading pane.
 *
 * It was one column of cards, where every card was both the list entry and the document. That is why a
 * nineteen-step task rendered as a ladder of two-word lines in a 340px tile, and why the fix for that
 * produced a 1,364px card containing 760px of content. A list and a document want opposite things, so
 * they are two components now: TaskRow and TaskDetail.
 *
 * On a desktop both are visible at once, so opening a task does not cost you your place in the queue. On
 * a phone the queue is the page and the detail covers it — the same number of taps as the "Show me how"
 * it replaces.
 *
 * WHAT HAS NOT CHANGED, AND MUST NOT:
 *
 * - Nothing here ever shows an optimistic success. See `act` in ui.tsx.
 * - There is deliberately no auto-refresh. A list that reorders itself under your thumb while you are
 *   reading step 3 is worse than one that is a minute stale, and the notification is what tells you
 *   something new arrived.
 * - An empty hub is SUCCESS. "Nothing needs you" is a definite, pleasant answer, not a blank screen.
 */

/**
 * Which part of the history surface is showing.
 *
 * Named rather than repeated inline in seven places, which is what it was — and the rename is what made the
 * fourth member cheap to add. `said` is the outbound half: what he has told the agents, and whether anything
 * has synced since. It lives here with the other three because this is the wide column, and a channel you
 * cannot review is a channel you stop trusting.
 */
type RecordSection = 'tasks' | 'decisions' | 'marks' | 'said' | 'timeline';

type Filter =
    | { kind: 'all' }
    | { kind: 'decisions' }
    | { kind: 'project'; slug: string }
    /**
     * The record, in the queue column, and WHICH PART OF IT to land on.
     *
     * `focus` exists because four separate controls used to open this and all four did exactly the same thing:
     * the header's "13 done · 5 decided" chip, the pane's "13 finished" figure, the pane's "5 decided" figure,
     * and "8 more marks". Four buttons, one destination, no differentiation — the owner spotted it by circling
     * them on a screenshot, which is the third time looking at the thing has been the method.
     *
     * It came from following docs/RESEARCH.md §14's rule too literally. "If clicking it does nothing, it does not
     * go on the page" was satisfied by making every figure a control, and then every control was wired to the
     * same handler. Four buttons to one place is arguably worse than one button and two readouts, because it
     * teaches you that pressing things here does not matter.
     *
     * So each control now lands where its own number points: the tasks figure on the tasks, the decisions figure
     * on the decisions, the marks link on the marks, and the header chip on the record as a whole.
     */
    | {
        kind: 'done';
        focus?: RecordSection;
        /**
         * WHERE IN THE TIMELINE to start, when that is the section being opened.
         *
         * This exists because `npm run audit` caught a collision I had created while fixing another one. The
         * header chip and the pane's `since <date>` line both opened the timeline, and the audit printed them as
         * one control with two labels — correctly, because they landed on the same tab in the same state.
         *
         * The resolution is not to send one of them somewhere unrelated. It is that they are asking different
         * questions and the surface can answer both: the chip is the SUMMARY, so it opens today and lets him
         * scrub back; the `since` line names the first day of his record, so it opens standing on that day. A
         * control whose label is a date should land on that date.
         */
        at?: 'first' | 'now';
    }
    /**
     * "I have ten minutes." Tasks whose estimate fits, and nothing else.
     *
     * NOT a priority field, which is explicitly banned along with labels, due dates and sprints — it is a
     * filter over `minutes`, which every task already carries and which nothing used except the total in the
     * header. "21 tasks · about 12h 20m" is a wall; this is the question you actually arrive with.
     */
    | { kind: 'minutes'; max: number };

/**
 * Is this the phone layout? Used ONLY to mark the queue `inert` while the detail covers it.
 *
 * The layout itself is decided in CSS, not here — this exists because "the thing behind a full-screen
 * panel must not be reachable by Tab" is a statement about the DOM that CSS cannot make. `useSyncExternal-
 * Store` rather than an effect so the server render and the first client render agree; the server
 * snapshot is `false`, which is safe, because being wrong for one frame costs a tab stop and being wrong
 * in the other direction would make a visible pane unreachable.
 */
function useNarrow(): boolean {
    const query = '(max-width: 1099.98px)';
    return useSyncExternalStore(
        cb => {
            const m = window.matchMedia(query);
            m.addEventListener('change', cb);
            return () => m.removeEventListener('change', cb);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}

/** One perk he has earned and has not yet been told about. Narrowed from `PerkDef` to what the line needs. */
export interface NewsItem {
    slug: string;
    kind: string;
    label: string;
    /** The level that handed it over, or null for a mark-gated look. Set in app/page.tsx. */
    atLevel: number | null;
    /** The rank at that level, so the banner can name it without recomputing the ladder here. */
    rank: string | null;
}

export default function Board({ initial, looks, news }: {
    initial: BoardState;
    /*
     * The looks actually in force, already reduced to what he has earned by the server (lib/looks.ts).
     *
     * Passed in rather than read here so the client never decides which look is legitimate. The board does not
     * apply the palette or the surface — those stylesheets are emitted server-side in app/page.tsx — but it does
     * need `crest` to draw the right finish, and the names so the footer can say which are on without a second
     * source of truth.
     */
    looks: Looks;
    /**
     * WHAT HE HAS EARNED AND NOT YET BEEN TOLD ABOUT. Rule 3 of the perk system, arriving from the server.
     *
     * *"An unlock never applies itself. It announces itself once and waits."* The hub redesigning itself while he
     * is reading step three of a task is the same defect as a list that reorders under his thumb, and worse,
     * because he cannot tell whether he did something or something broke. So an unlock changes nothing until he
     * chooses it, and this is the one sentence that tells him there is something to choose.
     */
    news: NewsItem[];
}) {
    const [questions, setQuestions] = useState(initial.questions);
    const [tasks, setTasks] = useState(initial.tasks);
    /*
     * FINISHED WORK IS STATE, for one reason: the figures have to move the moment a write is confirmed.
     *
     * Ticking a task off has to raise the count and re-opening one has to lower it, in the same interaction,
     * or the number is something you have to reload to trust — and a figure you cannot trust without a
     * reload is the trust gap from docs/RESEARCH.md §7 arriving in the feature built to close it.
     *
     * What goes in here is always the row the SERVER read back (see ActResult.data in ui.tsx). Never a
     * locally assembled `{...task, status: 'done'}`: that is optimistic UI, and it would be optimistic UI
     * about a number rather than about a message, which is harder to notice and worse.
     */
    /*
     * THE WHOLE RECORD, EXPANDED FROM THE NUMBERS. Not `initial.doneTasks`, which is now a window.
     *
     * `board()` ships the most recent `RECORD_WINDOW` completions with their prose and every completion ever
     * as a six-number tuple, because at two years of his own measured rate the prose alone was 2.1 MB. This
     * puts the two back together into exactly the list this component has always held — see `expandHistory`
     * in lib/progress.ts — so every figure below is still folded over EVERY row and re-opening one still
     * takes its points back with no decrement logic anywhere.
     *
     * Called plainly rather than in a `useMemo`: `initial` is a server prop and does not change for the life
     * of the component, so this runs once per mount either way, and the state below is seeded from it.
     */
    const fullRecord = expandHistory(initial.history, initial.doneTasks, initial.answeredQuestions);
    const [doneTasks, setDoneTasks] = useState(fullRecord.doneTasks);
    /*
     * What he has told the agents is STATE for the same reason finished work is: withdrawing a note has to
     * remove it from the list and from the footer's line in the same interaction, or he has to reload to find
     * out whether it worked. And it is only ever set from a server-confirmed outcome — `note.remove` returns
     * after re-reading the row's absence, so this never removes a row optimistically.
     */
    const [notes, setNotes] = useState(initial.notes);
    const [openId, setOpenId] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>({ kind: 'all' });
    /*
     * A write the server refused, said where it cannot be missed.
     *
     * Hard constraint 2 is that a failure shows the server's actual reason rather than an apology, and
     * the reason is only worth having if it has somewhere to appear. A task row is 34px tall, so a
     * refusal from a row is lifted to here and printed at the top of the queue until it is dismissed.
     * It does not fade and it does not time out: this is the one message in the interface that must not
     * be missed, because the alternative is believing something was saved when it was not.
     */
    const [refused, setRefused] = useState<string | null>(null);
    const narrow = useNarrow();
    /*
     * THE COMMAND PALETTE. Closed by default and rendering nothing at all when closed.
     *
     * Rendering nothing matters for a measured reason: check K3 counts real keystrokes to the task list and holds
     * at three. A palette that left even one focusable element in the document would be a fourth. The skip-link
     * path is what K3 actually walks, so a control in the header is free — but an always-mounted overlay is not,
     * and "mounted but hidden" is exactly the mistake check K4 exists for on the phone layout.
     */
    const [paletteOpen, setPaletteOpen] = useState(false);
    /*
     * A COUNTER, not a boolean, so asking for the compose box twice works twice.
     *
     * With a boolean, the second request while the form is already open is a no-op — and if he had closed the
     * form in between, the flag would still be true and nothing would change. A counter's value is never equal
     * to the last one it had, so `Idle` can react to every request without the two of them having to agree about
     * whether the form is currently open. That is the same reasoning that keeps `Board` from owning the form's
     * own state: the form knows whether it is open, and this only knows that he asked.
     */
    const [composeWanted, setComposeWanted] = useState(0);

    const actionable = tasks.filter(t => !t.blocked_reason);
    const waiting = tasks.filter(t => t.blocked_reason);
    const minutes = actionable.reduce((n, t) => n + (t.minutes ?? 0), 0);

    const open = tasks.find(t => t.id === openId) ?? null;
    const closeDetail = useCallback(() => setOpenId(null), []);

    /* Esc closes the detail. On a phone it is covering the screen, so it needs a way out that is not a
     * hunt for the close button; on a desktop it is the fastest way back to the queue. */
    useEffect(() => {
        if (!openId) return;
        const onKey = (e: KeyboardEvent) => {
            // Not while the palette is up: Escape there means "close the palette", and closing the task behind
            // it as well would take away the thing he was looking at for pressing the wrong escape hatch.
            if (e.key === 'Escape' && !paletteOpen) closeDetail();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [openId, closeDetail, paletteOpen]);

    /*
     * Ctrl/Cmd+K opens the palette, and so does "/" when he is not typing into something.
     *
     * Both, because they are the two conventions and he uses tools that follow each. The "/" guard is the part
     * that has to be right: without it, typing a slash into the note box or into a decision's comment field
     * would open a search dialog and eat the character, which is the classic way this shortcut ships broken.
     *
     * `isContentEditable` is checked as well as the tag names — a `contenteditable` div is not an INPUT and
     * would otherwise slip through.
     */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
                || t.tagName === 'SELECT' || t.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setPaletteOpen(o => !o);
                return;
            }
            if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setPaletteOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /*
     * Group by project, preserving the server's ordering within each group.
     *
     * The server already sorts by (blocked, created_at), so grouping here rather than in SQL keeps one
     * ordering rule in one place and lets the page decide only how to present it.
     */
    const groupBy = useCallback((list: Task[]) => {
        const map = new Map<string, Task[]>();
        for (const t of list) {
            const g = map.get(t.project);
            if (g) g.push(t); else map.set(t.project, [t]);
        }
        // Busiest project first: it is the one most likely to be why the hub was opened.
        return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    }, []);

    /*
     * FILTERS, WHICH IS WHAT THE COUNTS ARE FOR.
     *
     * docs/RESEARCH.md §14: of 89 studied dashboards only 47% were still active, and the finding was that
     * actionability cannot be bolted onto a finished readout. So the summary line is not a readout — every
     * figure in it is a control that changes what the queue shows, and the rule for anything added here
     * later is: if clicking it does nothing, it does not go on the page.
     */
    const shownQuestions = filter.kind === 'project'
        ? questions.filter(q => q.project === filter.slug)
        : questions;

    /*
     * BLOCKED TASKS THAT HAVE BEEN WAITING LONG ENOUGH TO BE WORTH CHASING.
     *
     * Two days. Below that there is nothing to ask about, and a permanent "still blocked?" on every waiting row
     * would be exactly the nag this must not become — a blocked task is not his fault and must never count
     * against him. See StaleBlocked.tsx for why the figure comes from `created_at` rather than from anything
     * that looks more precise.
     *
     * Computed here rather than in lib/progress.ts because it is about OPEN work, and everything in that file
     * is about finished work. Mixing the two would make "progress" mean two things.
     */
    const staleBlocked = useMemo(() => waiting
        .map(task => ({
            task,
            days: Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86_400_000),
        }))
        .filter(x => x.days >= 2)
        .sort((a, b) => b.days - a.days), [waiting]);
    const staleBlockedIds = useMemo(() => new Set(staleBlocked.map(x => x.task.id)), [staleBlocked]);

    const matchesFilter = (t: Task) =>
        filter.kind === 'all' ? true
            : filter.kind === 'project' ? t.project === filter.slug
                /*
                 * A task with NO estimate does not match a time filter, and that is the honest answer rather
                 * than the convenient one: an unestimated task is not a short task, it is an unknown one, and
                 * putting it in a "ten minutes" list would be guessing on his behalf about the one thing the
                 * list exists to promise.
                 *
                 * It is also why `unestimated` below is counted and stated on screen. Silently dropping work
                 * from a list is how a hub starts hiding things, and check P8 asserts the declaration.
                 */
                : filter.kind === 'minutes' ? t.minutes != null && t.minutes <= filter.max
                    : false;                   // 'decisions' and 'done' hide tasks entirely

    const shownActionable = actionable.filter(matchesFilter);
    /*
     * The long-waiting ones are NOT in the grouped list, because they have their own row above it.
     *
     * Rendering both put the same task on screen twice — the stale row and its group entry — which is one fact
     * stated twice and read as a rendering bug. These two lists are a partition, not an overlap.
     */
    const shownWaiting = waiting.filter(matchesFilter).filter(t => !staleBlockedIds.has(t.id));

    /*
     * THE TIME BUCKETS, OFFERED ONLY WHEN THEY WOULD FIND SOMETHING.
     *
     * A chip that filters to nothing is a dead control, and docs/RESEARCH.md §14's rule is that if pressing it
     * does nothing it does not go on the page. So each bucket is rendered only if at least one actionable task
     * fits it, and the strip only if more than one bucket does — with a single bucket there is nothing to choose
     * between and the chip would just be a second way to say "21 tasks".
     */
    const TIME_BUCKETS = [10, 30, 60];
    const buckets = TIME_BUCKETS
        .map(max => ({ max, n: actionable.filter(t => t.minutes != null && t.minutes <= max).length }))
        .filter(b => b.n > 0);
    const showBuckets = buckets.length > 1;
    const unestimated = actionable.filter(t => t.minutes == null).length;

    /*
     * THE RECORD, DERIVED. Recomputed from the rows on every render, and that is the point.
     *
     * There is no `xp` column, no `level`, no `achievements` table, and there must never be one — a stored
     * score can disagree with the tasks table and then the hub has two truths, which is `writeVerified`'s
     * bug (lib/db.ts) in a nicer costume. Because every figure is a fold over these arrays, re-opening a
     * task takes the credit back with no decrement logic anywhere: the row leaves `doneTasks` and every
     * figure and mark that depended on it changes by itself. There is no code that has to remember to
     * subtract, so there is no code that can forget.
     *
     * Cheap enough to do inline — tens of rows, one pass each. `useMemo` only so the marks list is not a new
     * array identity on every keystroke in the note box.
     */
    /*
     * The rows themselves, named — because the time machine needs them and not just the snapshot.
     *
     * `Timeline` runs the SAME derivation with the rows cut off at an earlier instant (`asOf` in
     * lib/progress.ts), so it has to be handed the inputs rather than the output. Memoised on the same
     * dependencies as the snapshot below, so scrubbing does not re-derive on every unrelated re-render.
     */
    const deriveInput = useMemo(() => ({
        doneTasks,
        /* The expanded set, not `initial.answeredQuestions` — that is the window. See `fullRecord`. */
        answeredQuestions: fullRecord.answeredQuestions,
        openTasks: tasks,
        openQuestions: questions,
    }), [doneTasks, fullRecord.answeredQuestions, tasks, questions]);
    const progress = useMemo(() => derive(deriveInput), [deriveInput]);
    const marks = useMemo(() => marksOf(progress), [progress]);
    /*
     * Standing and what is next, from the same snapshot as everything else.
     *
     * Recomputed rather than stored, which is what makes a level reversible: re-open a task and the points
     * fall, and if that crosses a boundary the level and a spoke on the emblem go with them. See
     * lib/progress.ts — there is no `level` column and there must never be one.
     */
    const standing = useMemo(() => standingOf(progress), [progress]);
    const next = useMemo(() => nextUp(progress, 2), [progress]);
    /*
     * The crest's inputs — assembled here, from the same three objects, so it moves in the same interaction.
     *
     * It depends on `marks` as well as on `standing`, which is the whole reason it is a different object from
     * the emblem it replaces: a tick that earns a mark in a category he had none of adds a side to the
     * keyway in the same frame the level bar moves. Derived, so it is reversible too — re-open that task and
     * the mark, the side and the point all go together.
     */
    const crest = useMemo(() => crestInput(progress, standing, marks), [progress, standing, marks]);

    /*
     * ==================================================================================================
     * CROSSING A LEVEL BOUNDARY, AS AN EVENT — the one moment the whole progression exists to produce
     * ==================================================================================================
     *
     * Until now, nothing happened. `standing.level` was a different number on the next render and that was the
     * entire acknowledgement: no motion, no mark, nothing. Five sessions of building a progression whose single
     * output event was silent.
     *
     * WHY THIS IS LEGAL UNDER §2.3, WHICH FORBIDS MOTION ON ANYTHING CARRYING TRUTH
     *
     * The rule is precise and worth quoting rather than paraphrasing: *"A count may not animate to its new value:
     * a number in motion is unreadable and, for a few hundred milliseconds, wrong."* Nothing here animates a
     * number. The level, the rank, the points and the bar all snap to their new values exactly as they always did.
     * What is marked is the EVENT, which is presence — the same distinction `TaskRow`'s `leaving` animation is
     * built on, and the same test: the mark cannot begin until the server has confirmed the write, because
     * `standing` is derived from `doneTasks`, and a row only enters `doneTasks` in `onDone` from the row the
     * server read back. There is no frame in which this claims something that has not happened.
     *
     * WHY A REF AND NOT AN EFFECT ON `standing.level`
     *
     * An effect keyed on the level would fire on FIRST MOUNT, and that is precisely the case the brief says must
     * not happen: he answers a decision in Telegram, levels up, opens the hub the next morning, and the hub
     * celebrates something that happened yesterday as though it just happened. `seen` starts as `null`, the first
     * render only records it, and the strike can therefore only fire on a TRANSITION observed in this session.
     *
     * The unwitnessed case is handled honestly and elsewhere — see the unlock banner, which announces once and
     * waits. Movement II made that universal rather than partial: every level from 2 upward now mints exactly one
     * perk (check K11), so a level-up he did not see always has something waiting to tell him about it.
     *
     * DOWNWARD CROSSINGS ARE DELIBERATELY SILENT. Re-opening a finished task takes the points back and the level
     * can fall, which is correct and is stated plainly on the page. It is not a moment to mark, and an animation
     * on a demotion would be the hub congratulating him for undoing something.
     */
    const seenLevel = useRef<number | null>(null);
    const [struck, setStruck] = useState<number | null>(null);
    useEffect(() => {
        const before = seenLevel.current;
        seenLevel.current = standing.level;
        if (before === null || standing.level <= before) return;
        setStruck(standing.level);
        /*
         * Cleared on a timer rather than on `animationend`, because the animation does not exist under
         * `prefers-reduced-motion` — and a class that is never removed because its animation never ran would
         * leave the panel marked for the rest of the session for the one person who asked not to see motion.
         * 1,600ms is the longest keyframe (900ms) plus its delay, with room to spare.
         */
        const t = setTimeout(() => setStruck(null), 1600);
        return () => clearTimeout(t);
    }, [standing.level]);
    /*
     * How many looks are his, computed here from the same standing as everything else.
     *
     * Counted on the client rather than passed down from the page on purpose: ticking a task off can cross a
     * level boundary, and if it does, the footer's count has to move in the same interaction as the level and the
     * emblem. A number handed over at render time would have been right on load and stale immediately after the
     * one action that changes it.
     */
    const lookCounts = useMemo(() => {
        const states = perkStates(standing, marks, rungAt, generatedPerks(standing.level));
        return { unlocked: states.filter(p => p.unlocked).length, total: states.length };
    }, [standing, marks]);
    const showingDone = filter.kind === 'done';

    const actionableGroups = useMemo(() => groupBy(shownActionable), [shownActionable, groupBy]);
    const waitingGroups = useMemo(() => groupBy(shownWaiting), [shownWaiting, groupBy]);

    /*
     * Projects with something OPEN — not every project the hub knows about.
     *
     * Those are different numbers and the difference is visible on his real hub: the header read "1 project"
     * while the Projects list in the pane showed three, because this counts open work and that list counts
     * anything with any activity. Both were true under different definitions, neither said which — which is
     * exactly the trust gap docs/RESEARCH.md §7 cause 7 describes, and exactly the defect already fixed once in
     * docs/PROGRESS-REPORT.md §7.2 when the sidebar said "16 open" beside a queue heading saying "15 tasks".
     * One figure disagreeing with another poisons confidence in all of them.
     *
     * Found by looking at production after deploying, which is the third time that has been the method.
     * The count stays as it is — it belongs to the header's "what needs me" line — and it now SAYS what it
     * counts. See where it renders.
     */
    const projectsWithOpenWork =
        new Set(tasks.map(t => t.project).concat(questions.map(q => q.project))).size;

    const lastSync = initial.agents.filter(a => a.last_sync_at)[0] ?? null;

    /*
     * HAS ANY AGENT FOUND OUT WHAT HE JUST DID? — the other half of the mid-session sync problem.
     *
     * His words: *"they do not check the hub until I ask them, so when I finish the task they have no idea it has
     * been finished… if I'm not home and I finish the task I cannot tell them to check."*
     *
     * `lib/snippet.ts` now instructs agents to sync at several points during a session rather than only at the
     * start, which is the fix on THEIR side. This is the fix on his: the hub tells him whether it has actually
     * happened yet, so he is not guessing about whether the loop closed.
     *
     * Derived, like everything else — the newest `done_at` against the newest `agents.last_sync_at`. No new
     * column, no new event, nothing stored.
     *
     * IT SAYS "SYNCED", NEVER "READ", for the same reason `noteReach` does: a sync after a completion means the
     * agent was HANDED it. Whether it noticed is a claim the data cannot support, and the one thing this surface
     * must never do is overstate what it knows.
     *
     * Null when there is nothing to say — no completions, or an agent has already been round since the last one.
     * A line that is usually present is a line nobody reads, and the useful case is the one he can act on.
     */
    const unseenWork = (() => {
        /*
         * ANSWERING A DECISION COUNTS AS SOMETHING HE DID, AND FOR A YEAR IT DID NOT.
         *
         * `progress.lastDoneAt` is `finished[0].done_at` — ticked TASKS only. So the hub told him when a
         * completion had not been collected and said nothing at all about an answer, which is the asymmetry that
         * matters most: a task he ticked is work already finished, but an ANSWER is something an agent is
         * actively blocked on. The case where the silence costs the most was the case with no signal.
         *
         * Found while about to build this from scratch. The mechanism was already here, correct, careful about
         * saying "synced" rather than "read", and already carrying the ten-minute grace period — it was simply
         * pointed at one of the two things he does. Worth recording as its own lesson: the gap in a mature
         * codebase is more often a feature aimed at half its subject than a feature nobody wrote.
         */
        const lastAnswer = progress.decisions[0]?.answered_at ?? null;
        const newest = !progress.lastDoneAt ? lastAnswer
            : !lastAnswer ? progress.lastDoneAt
                : (lastAnswer > progress.lastDoneAt ? lastAnswer : progress.lastDoneAt);
        if (!newest) return null;
        const seen = initial.agents.some(a => a.last_sync_at && a.last_sync_at > newest);
        if (seen) return null;
        const mins = Math.round((Date.now() - new Date(newest).getTime()) / 60_000);
        /*
         * Under about ten minutes, say nothing. He has just ticked something off and an agent that has not synced
         * in the last four minutes is not a problem yet — flagging it instantly would turn a useful signal into a
         * nag on every single completion, which is how a channel gets ignored.
         */
        if (mins < 10) return null;
        const ago = mins < 60
            ? `${mins} min`
            : mins < 2880 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)} days`;
        /*
         * The sentence has to name which of the two it was, because they are not equally urgent and the previous
         * wording ("you finished something") would have been simply untrue half the time now that an answer can
         * be the newest thing. An unread completion is work already behind him; an unread ANSWER is an agent
         * still standing still.
         */
        return { ago, answered: newest === lastAnswer && newest !== progress.lastDoneAt };
    })();
    const staleHours = lastSync?.last_sync_at
        ? (Date.now() - new Date(lastSync.last_sync_at).getTime()) / 3600_000
        : null;

    /*
     * THE ONE DIAGNOSTIC THAT MUST NOT BE BELOW A FOLD.
     *
     * If no agent has synced, the hub is quietly going out of date and this is the only warning there is — the
     * anti-rot mechanism from docs/RESEARCH.md §7 cause 5, whose whole premise is that silence has to be
     * trustworthy. It lived in the pane's footer, which is exactly where the pane's overflow was cutting: at
     * 1920 the footer was the 217px that could not be seen, and at 1280 it still is (check L7 measures this).
     *
     * So the WARNING is lifted to the header, where it is above the fold at every width including a phone. The
     * ordinary case — "last sync: riff-kitchen, 20 min ago" — stays in the footer, because that is information
     * rather than a warning and it is fine to have to look for it.
     *
     * Computed here rather than in the footer so there is one definition of "stale" and the two places cannot
     * disagree about it. Null means there is nothing to warn about, and then nothing renders at all: a banner
     * that is usually present is a banner nobody reads.
     */
    /*
     * NOT WHEN THE HUB HAS NEVER BEEN STARTED, because then the empty card says it better and with a route.
     *
     * "No agent has ever synced, so nothing is reading your answers yet" is exactly right for someone who has work
     * in the hub and nothing collecting it. On a brand-new hub it is the same fact the empty card below now opens
     * with — so a new person got the news twice, in two different phrasings, one of which told them what to do
     * about it and one of which did not. Two banners saying one thing is the "same fact stated twice" defect this
     * codebase has caught itself in before.
     *
     * `emptiness` is computed further down from the same `lastSync`, so this repeats its `unstarted` condition
     * rather than reading it — one is a header warning and one is a queue state, and ordering them so that either
     * can read the other would mean lifting one of them out of the place it belongs.
     */
    const neverStarted = !lastSync?.last_sync_at
        && progress.tasksDone === 0 && progress.decisionsMade === 0;
    const staleWarning = neverStarted
        ? null
        : !lastSync?.last_sync_at
            ? 'No agent has ever synced, so nothing is reading your answers yet.'
        /*
         * ONE LINE, and short enough to stay one line at 1280.
         *
         * It read "No agent has synced for 5 days — nothing has read your answers in a while, so treat this
         * list as stale", which says the same thing twice: "no agent has synced" and "nothing has read your
         * answers" are the same fact. At 1280 the second clause wrapped it to two lines, and check L3 caught
         * the consequence — tasks above the fold went from 6 to 4, so the warning was costing two rows of the
         * queue. Trimming the redundancy costs nothing and buys the row back.
         */
            : staleHours != null && staleHours > 72
                ? `No agent has synced for ${Math.floor(staleHours / 24)} days — treat this list as stale.`
                : null;

    /*
     * Up and down move between task rows.
     *
     * Not a full roving-tabindex listbox: every row keeps its own tab stop, because each one holds two
     * genuinely separate controls (open, and mark done) and collapsing that into one composite widget
     * would make Done harder to reach, not easier. Arrow keys are the speed feature on top; Tab still
     * behaves the way Tab behaves everywhere else.
     */
    const onQueueKey = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const target = e.target as HTMLElement;
        if (!target.classList.contains('rowmain')) return;
        const all = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.rowmain')];
        const i = all.indexOf(target);
        const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) { e.preventDefault(); next.focus(); }
    };

    /*
     * A task moves from the queue INTO the record, using the row the server read back.
     *
     * `done` is optional only because `TaskDetail`'s Done path is shared with the note save and there is one
     * call site that cannot produce it; when it is missing the task still leaves the queue but does not enter
     * the record, which is the safe direction — the count is momentarily one LOW rather than one high, and a
     * reload corrects it. A count that overstates is the failure this whole surface has to avoid; a count
     * that briefly understates is a stale read.
     */
    const onDone = (id: string, done?: Task) => {
        setTasks(ts => ts.filter(x => x.id !== id));
        /*
         * Narrowed with `finishedRowOf`, so the record holds one shape and not two.
         *
         * The server returns the whole `Task` it read back, because that is what the act endpoint writes. The
         * record's rows are `FinishedRow` — the narrow shape `board()` sends, which exists because sending every
         * step of every completed task to the browser is what made the page payload grow without a ceiling. This
         * is the one place a wide row meets the narrow list, and it is still the SERVER's row: nothing is
         * assembled locally, so this remains a confirmed write rather than an optimistic one.
         */
        if (done?.done_at) {
            const row = finishedRowOf(done);
            setDoneTasks(ds => [row, ...ds.filter(d => d.id !== row.id)]);
        }
        setOpenId(cur => (cur === id ? null : cur));
        setRefused(null);
    };
    /** ...and back the other way. This is what makes the figures reversible rather than merely correct. */
    const onReopened = (task: Task) => {
        setDoneTasks(ds => ds.filter(d => d.id !== task.id));
        setTasks(ts => [...ts.filter(t => t.id !== task.id), task]
            // The server's own ordering rule, kept here so a re-opened task lands where it would after a
            // reload rather than at the bottom: blocked last, then oldest first.
            .sort((a, x) =>
                Number(!!a.blocked_reason) - Number(!!x.blocked_reason) ||
                a.created_at.localeCompare(x.created_at)));
        setRefused(null);
    };
    const onRefused = useCallback((message: string) => setRefused(message), []);

    /*
     * What a palette result does. One place, so every result lands somewhere that already exists.
     *
     * Deliberately expressed as the SAME state changes the page's own controls make — `setFilter`, `setOpenId` —
     * rather than as a second navigation system. A palette that could reach a state no button can reach would be
     * a second interface with its own bugs, and the first one to diverge would be the one nobody tests.
     *
     * `href` is the exception and it is a real navigation, because `/looks` and `/setup` are real pages.
     */
    const onPaletteAction = useCallback((a: PaletteAction) => {
        switch (a.kind) {
            case 'task': setFilter({ kind: 'all' }); setOpenId(a.id); break;
            case 'decisions': setFilter({ kind: 'decisions' }); break;
            case 'project': setFilter({ kind: 'project', slug: a.slug }); break;
            case 'record': setFilter({ kind: 'done', focus: a.focus }); break;
            case 'queue': setFilter({ kind: 'all' }); setOpenId(null); break;
            /*
             * The compose box lives in the pane and opens itself. There is no way to reach into `Idle`'s state
             * from here, so this lands on the pane by closing whatever is open — and `Idle` reads
             * `composeWanted` to open the form. One boolean beats lifting the whole form's state up.
             */
            case 'compose': setFilter({ kind: 'all' }); setOpenId(null); setComposeWanted(n => n + 1); break;
            case 'href': window.location.href = a.href; break;
        }
    }, []);

    /*
     * How many decisions render in full before the rest go behind a control.
     *
     * Two when the queue is also on screen, because the queue is still the point and check L3 requires six tasks
     * to start within the first screen at 1280×900 with zero headroom. Unlimited once the "decisions" filter is
     * engaged, because in that mode there is no queue competing for the space — that filter exists to say
     * "show me only these", so capping it there would be refusing the thing that was asked for.
     */
    const decisionsShown = filter.kind === 'decisions' ? shownQuestions.length : 1;

    const nothingWaiting = questions.length === 0 && tasks.length === 0;

    /*
     * ==================================================================================================
     * WHICH KIND OF EMPTY THIS IS — three states, and treating them as one told a new person a lie
     * ==================================================================================================
     *
     * The empty hub said, unconditionally: *"Nothing needs you. No decisions blocked, no tasks waiting. You will
     * get a Telegram message when that changes."*
     *
     * On a hub that has been used, every word of that is true and it is the single best screen this thing has —
     * hard constraint 6 says an empty queue is SUCCESS, and it is. **On a brand-new hub it is false.** Nothing is
     * waiting because nothing is connected, and no Telegram message is ever coming, because there is no agent to
     * send one. The proudest screen in the hub was making a promise it could not keep to exactly the person least
     * able to tell.
     *
     * That matters more than it used to. He is setting this up for other people now, and this is the first screen
     * every one of them sees. It was also the whole of his complaint one layer up — *"we don't have a help center,
     * we don't have anything explaining anything, we just throw this into their face"* — landing on the one screen
     * where there is nothing else to read.
     *
     * THE THREE STATES ARE ALL DERIVED, from what `board()` already returns:
     *
     *   `unstarted`   no agent has ever synced and nothing has ever been finished. Nothing is connected. Say so,
     *                 say what the hub is for in one sentence, and point at the one thing to do first.
     *   `connected`   an agent has synced but no work has arrived yet. The connection is PROVEN, so the promise
     *                 about Telegram is now credible — and naming the agent is the evidence for it.
     *   `earned`      work has happened and the queue is at zero. The original copy, which was always right here.
     *
     * `connected` is not a hair-split: it is the state immediately after setup, because `cc sync` is the first
     * thing an agent does and it happens before anything is filed. Without it the hub would tell someone who had
     * just wired everything up correctly that nothing was connected.
     */
    const emptiness = emptinessOf({
        tasksDone: progress.tasksDone,
        decisionsMade: progress.decisionsMade,
        everSynced: !!lastSync?.last_sync_at,
    });

    /*
     * THE QUIETEST PROJECT, for the one sentence on the empty card. See where it renders.
     *
     * `foldProjects` and `sentenceFor` are the SAME functions `/agents` uses, so the wording cannot drift
     * between the two surfaces and the no-"you" rule holds in both by construction rather than twice over.
     * Memoised on the props, which never change for the life of the component, so this is one pass per mount.
     *
     * `quiet` ONLY — never `never`. A project with no presence row at all is usually a project where nothing
     * is opted in rather than a dead one, and saying "nothing has ever reported in from riff-kitchen" on the
     * hub's front page would be the surface blaming the world for its own missing hook. `/agents` says it,
     * where the setup card is right underneath.
     */
    const quiet = useMemo(
        () => foldProjects(initial.projects.map(p => p.slug), initial.presence)
            .filter(p => p.state === 'quiet'),
        [initial.projects, initial.presence],
    );
    const quietest = quiet[0] ?? null;
    const quietSentence = quietest ? sentenceFor(quietest) : null;
    const quietOthers = Math.max(0, quiet.length - 1);
    const chip = (active: boolean) => `chip${active ? ' on' : ''}`;

    /*
     * Everything the full-screen detail is covering, on a phone.
     *
     * It was only the queue at first, and check K4 measured four controls still sitting in the tab
     * order behind the panel: the two skip links and the two filter chips in the header. Covering
     * something visually is not the same as removing it, and the half of the page you remember to remove
     * is the half you were thinking about.
     */
    const covered = narrow && !!open;

    return (
        <div className={`shell${open ? ' hasdetail' : ''}${nothingWaiting ? ' clear' : ''}`}>
            {/*
              * SKIP LINKS, AND THEIR TARGETS CARRY tabindex="-1".
              *
              * That second half is the part usually shipped broken: without it, Enter on a skip link
              * scrolls the region into view but leaves keyboard focus exactly where it was, so the next
              * Tab continues from the top of the page and the link has achieved nothing. Check K3 counts
              * real keystrokes rather than DOM position, so it measures a broken skip link as worth zero.
              *
              * Measured before: 16 keystrokes to put focus on a task, because every decision's comment box
              * and every one of its option buttons came first.
              */}
            {/* The label and the target follow what is actually in the queue. A skip link that names
                "your turn" while the queue is showing finished work is a link that lies about where it
                goes, and the fix is one ternary rather than a second link nobody can see. */}
            <a className="skip" href={showingDone ? '#finished' : '#your-turn'} inert={covered}>
                {showingDone ? 'Skip to what you have finished' : 'Skip to your turn'}
            </a>
            {questions.length > 0 && (
                <a className="skip" href="#decisions" inert={covered}>Skip to decisions</a>
            )}

            <header inert={covered}>
                {/*
                  * THE NAV BAR REPLACES THE TITLE ROW. It does not sit above it.
                  *
                  * That row held a wordmark, the Find control and a project count, with a wide gap in the middle
                  * — so three destinations fit into space that was already there and the bar costs no height at
                  * desktop widths. Check L3 requires six tasks to start within the first screen at 1280 with no
                  * headroom, and it still gets them.
                  *
                  * The pane's footer loses its two text links in exchange, which gives ~46px back to a column
                  * check L7 holds at exactly zero spare. See Nav.tsx for why they were the wrong home for
                  * navigation in the first place.
                  */}
                <Nav
                    here="hub"
                    badge={`${lookCounts.unlocked} / ${lookCounts.total}`}
                    right={
                        <>
                            {/*
                              * The Find control lives in the bar's right-hand slot rather than beside the
                              * wordmark. It is an ACTION, not a place, and mixing it into the row of
                              * destinations would make one of the four things there behave differently from the
                              * other three when pressed.
                              *
                              * It costs check K3 nothing: K3 walks the skip-link path — Tab, Enter, Tab — and
                              * Enter on a skip link jumps past the whole header. That was measured rather than
                              * assumed, because the last thing added to this header cost three keystrokes.
                              */}
                            <button
                                className="findbtn"
                                data-measure="find"
                                onClick={() => setPaletteOpen(true)}
                                title="Find a task, a decision, or anywhere in the hub"
                            >
                                Find anything
                                <span className="findkeys"><kbd>Ctrl</kbd><kbd>K</kbd></span>
                            </button>
                            <span className="sub">
                                {/* "work in 1 project", not "1 project" — the pane lists three, and a bare count
                                    beside a longer list is two numbers about the same noun disagreeing. */}
                                {projectsWithOpenWork > 0
                                    ? `work in ${projectsWithOpenWork} project${projectsWithOpenWork === 1 ? '' : 's'}`
                                    : ''}
                            </span>
                        </>
                    }
                />
                {/*
                  * One line that answers "what needs me" before any scrolling. If it says all clear, there
                  * is nothing below worth reading — which is the state this hub is supposed to reach, so
                  * it has to be stated positively rather than left as a blank screen.
                  */}
                <div className="summary" data-measure="summary">
                    {questions.length > 0 && (
                        <button
                            className={`${chip(filter.kind === 'decisions')} hot`}
                            aria-pressed={filter.kind === 'decisions'}
                            onClick={() => setFilter(f =>
                                f.kind === 'decisions' ? { kind: 'all' } : { kind: 'decisions' })}
                        >
                            {/*
                              * `data-figure` so a check can read this number without parsing the sentence
                              * around it. It exists for the staleness guard in tests/measure-layout.mjs: the
                              * suite reads the open-decision count from Postgres, and a rendered figure that
                              * disagrees means Chrome is looking at a page the database no longer describes.
                              * That produced a 14-problem run whose every failure was fiction. The task count
                              * could not catch it — 21 rendered either way — and this could.
                              */}
                            <b data-figure="open-decisions">{questions.length}</b>{' '}
                            decision{questions.length === 1 ? '' : 's'} blocking an agent
                        </button>
                    )}
                    {actionable.length > 0 && (
                        <button
                            className={chip(filter.kind === 'all')}
                            aria-pressed={filter.kind === 'all'}
                            onClick={() => setFilter({ kind: 'all' })}
                        >
                            <b>{actionable.length}</b> task{actionable.length === 1 ? '' : 's'}
                            {minutes ? ` · about ${humanMinutes(minutes)}` : ''}
                        </button>
                    )}
                    {waiting.length > 0 && (
                        <span className="chip flat"><b>{waiting.length}</b> waiting on someone else</span>
                    )}
                    {/*
                      * WHAT HE HAS FINISHED, ON THE FIRST SCREEN.
                      *
                      * This is the answer to the complaint that started this work: the count was in the
                      * footer, several screens down, as five titles joined by dots. docs/RESEARCH.md §22 —
                      * over 70% of use of a surface like this is a glance of about five seconds (Gouveia et
                      * al., UbiComp 2016), so a figure that needs scrolling to is a figure that is never
                      * read. Check P1 measures it at all three widths.
                      *
                      * A control, like every other figure in this line: pressing it lists the whole record
                      * with its re-open buttons. It is deliberately the LAST chip and it is not `hot` —
                      * what needs him comes first, because the queue is still the point.
                      */}
                    {progress.tasksDone > 0 && (
                        <button
                            className={`${chip(showingDone)} done`}
                            data-measure="progress-figure"
                            data-figure="tasks-done"
                            aria-pressed={showingDone}
                            title="How your record got to this — every rank, mark and unlock, dated"
                            /*
                              * THE HEADER CHIP OPENS THE TIMELINE, and this closes a finding `npm run audit` has
                              * printed on every run for two iterations:
                              *
                              *     SAME DESTINATION: record via the header chip  ==  record via "N finished"
                              *     Two controls that land identically are one control with two labels.
                              *
                              * Both went to the record's Tasks tab. The audit was right and the fix was not
                              * obvious, because the chip's own content is a SUMMARY — "12 done · 3 decided ·
                              * Operator 3" — and every part of that summary already had its own control
                              * elsewhere: the pane's "12 finished" opens the tasks, its "3 decided" opens the
                              * decisions, and the crest opens its own key. There was nothing left for the chip
                              * to point at that was not already somebody else's destination.
                              *
                              * The time machine is what was missing. The chip is the only place the three
                              * figures appear TOGETHER, and the timeline is the only surface about the record as
                              * a whole rather than about one list inside it — every rank, every mark and every
                              * unlock on the day it happened. So the summary opens the summary's own history,
                              * which is §14's rule satisfied properly rather than by wiring a fourth button to
                              * an existing handler.
                              *
                              * The pane's `since <date>` line ALSO opens the timeline, and that is not a second
                              * collision: the audit compares where controls land, and two controls sharing a
                              * destination is only a defect when neither has a better one. Here both are about
                              * the record's shape — one is the summary, one is its first day — and neither has
                              * anywhere else to go that is not already taken. Recorded rather than hidden.
                              */
                            onClick={() => setFilter(f => (
                                f.kind === 'done' && f.focus === 'timeline' && f.at !== 'first'
                                    ? { kind: 'all' }
                                    : { kind: 'done', focus: 'timeline', at: 'now' }))}
                        >
                            <b>{humanCount(progress.tasksDone)}</b> done
                            {progress.decisionsMade > 0 && (
                                <>
                                    {' · '}
                                    <b data-figure="decisions-made">{humanCount(progress.decisionsMade)}</b>
                                    {' decided'}
                                </>
                            )}
                            {/*
                              * STANDING, ON A PHONE ONLY — where the pane is not beside the queue.
                              *
                              * Measured: the standing panel starts 1,269px down a 390px-wide screen at his real
                              * volumes, and 3,792px at the fixture's — 1.5 and 4.5 screens. So the one thing he
                              * asked to be able to FEEL is the one thing a phone never shows on arrival, while
                              * this chip — already on the first screen at 95px, already a control — was carrying
                              * only the counts.
                              *
                              * Hidden on desktop rather than rendered conditionally: the panel is two inches away
                              * there, and the same fact twice on one screen is what two marks with identical
                              * detail lines looked like. CSS rather than `narrow` from useNarrow() because that
                              * hook's server snapshot is false, so a conditional render would pop this in after
                              * hydration — a layout shift on the first screen, to save nothing.
                              *
                              * The level, not just the rank: past the named ten the rank holds for ten levels at
                              * a time (see rankFor in lib/progress.ts), so the number is the part that moves.
                              */}
                            <span className="chiprank">
                                {' · '}{standing.rank} <b>{standing.level}</b>
                            </span>
                        </button>
                    )}
                </div>
                {filter.kind === 'project' && (
                    <div className="summary">
                        <button className="chip on" onClick={() => setFilter({ kind: 'all' })}>
                            showing <b>{filter.slug}</b> only — show everything
                        </button>
                    </div>
                )}
                {/*
                  * Stated as a fact rather than an alarm, and only when it is true. See `staleWarning`.
                  *
                  * `role="status"` rather than `role="alert"`: the refused-write banner is the assertive one
                  * because it means something you just did did not happen, and two assertive regions on one
                  * page compete. This is a condition, not an event.
                  */}
                {staleWarning && (
                    <p className="stalebanner" role="status" data-measure="stale-sync">{staleWarning}</p>
                )}
                {/*
                  * AN UNLOCK ANNOUNCES ITSELF ONCE AND WAITS. Rule 3 of the perk system, rendered.
                  *
                  * In the HEADER, above the fold at every width, because an announcement he has to scroll to is
                  * an announcement that does not happen — the same reasoning that lifted the stale-sync warning
                  * out of the pane's footer.
                  *
                  * WHAT IT DOES NOT DO, which is the whole point: it does not apply anything. The hub looks
                  * exactly as it did before he earned this. Pressing it goes to `/looks`, where he chooses; the
                  * dismiss records that he has been told and never mentions it again.
                  *
                  * `role="status"` rather than `alert`. The refused-write banner is the assertive one, because it
                  * means something he just did did not happen; two assertive regions on one page compete, and
                  * this is good news rather than an event he has to act on.
                  */}
                {/*
                  * A `div`, NOT a `p`, and that is a bug fix rather than a preference.
                  *
                  * This was a `<p>` containing the dismiss `<form>`, which is invalid HTML — a `form` cannot be a
                  * descendant of `p` — so React logged *"This will cause a hydration error"* and the whole page
                  * stopped hydrating cleanly. The visible consequence was in two checks that are about neither
                  * HTML nor forms: **K3 went from 3 keystrokes to 6 and K5 stopped measuring anything at all**,
                  * because the Next.js dev overlay becomes focusable when it has an issue to report and it takes
                  * the first three tab stops.
                  *
                  * Worth recording as a shape: two keyboard checks caught an HTML-validity error, and neither of
                  * them knows what HTML validity is. That is what measuring the RENDERED thing buys — the defect
                  * arrived by a route nobody would have written a check for.
                  */}
                {/*
                  * NOBODY HAS BEEN ROUND SINCE HE FINISHED SOMETHING.
                  *
                  * The one state he could not previously see: he ticks a task off on his phone, and has no way of
                  * knowing whether the agent that asked for it has any idea. Stated as a fact with the number in
                  * it, in `--ask` — the same colour as the stale-sync warning, because it carries the same
                  * meaning: what is on this page may not have reached anyone yet.
                  *
                  * NOT dismissible, and not a nag either — it disappears by itself the moment any agent syncs,
                  * which is the only thing that would make it untrue. A dismiss button on a condition that
                  * resolves itself is a button that lets him hide something that is still true.
                  *
                  * `role="status"`: a condition, not an event. The refused-write banner is the assertive one.
                  */}
                {unseenWork && (
                    <p className="stalebanner" role="status" data-measure="unseen-work">
                        {unseenWork.answered
                            ? `You answered something ${unseenWork.ago} ago and no agent has synced since — `
                              + 'nothing has picked it up yet.'
                            : `You finished something ${unseenWork.ago} ago and no agent has synced since — `
                              + 'nothing knows yet.'}
                    </p>
                )}
                {news.length > 0 && (
                    <div className="unlockbanner" role="status" data-measure="unlock-news">
                        {/*
                          * THE LEVEL IS NAMED FIRST WHEN THERE IS ONE, because that is the event and the look is
                          * the consequence.
                          *
                          * *"Slate is yours"* answers a question he did not ask. He crossed a rung — possibly by
                          * answering one option in Telegram, hours ago, having seen nothing — and what he wants
                          * first is that fact. So the line reads *"Level 5 — Unblocker. Slate is yours."*
                          *
                          * The HIGHEST level in the batch, not the first: crossing two rungs at once (one long
                          * procedure with a note is 14 points, and the early rungs are 30 apart) unlocks two, and
                          * announcing the lower one would state a promotion he has already passed. `news` is in
                          * unlock order, so this is the last level-gated entry rather than a sort.
                          *
                          * No level is named at all when every unannounced look is mark-gated, because then no
                          * rung was crossed and inventing one would be the class of untruth this hub does not
                          * commit. That is why `atLevel` is nullable rather than defaulted.
                          */}
                        <span className="unlockwhat">
                            {(() => {
                                const levelled = news.filter(n => n.atLevel !== null);
                                const top = levelled[levelled.length - 1];
                                const looks = news.length === 1
                                    ? `${news[0]!.label} is yours.`
                                    : `${news.length} new looks are yours, including ${news[0]!.label}.`;
                                return top
                                    ? `Level ${top.atLevel} — ${top.rank}. ${looks}`
                                    : looks;
                            })()}
                        </span>
                        {' '}
                        <a className="navlink" href="/looks">See what changed →</a>
                        {' '}
                        {/*
                          * A form POST rather than a fetch, and that is deliberate.
                          *
                          * Dismissing writes a cookie, and a cookie has to be set by a response. Doing it with
                          * `fetch` would mean the banner disappears from a client state update while the cookie
                          * write is still in flight — an optimistic UI about a write, which is the one thing this
                          * codebase does not do. The navigation means the banner is gone because the SERVER
                          * re-rendered without it.
                          */}
                        <form method="POST" action="/api/looks/seen" className="unlockdismiss">
                            <input type="hidden" name="slugs" value={news.map(n => n.slug).join(',')} />
                            <button className="quiet" type="submit">Don’t tell me again</button>
                        </form>
                    </div>
                )}
            </header>

            {/*
              * HELD TOOL CALLS, ABOVE THE QUEUE AND BELOW THE HEADER.
              *
              * The one exception `docs/BRIEF-NOTHING-BLOCKED.md` §2 grants to "presence and spend live on
              * /agents": a permission request needs answering in minutes and cannot live on a page he might not
              * open. Everything else in that brief stayed off this page.
              *
              * OUTSIDE the header rather than inside it, deliberately. The header's banners are conditions —
              * stale sync, unseen work, an unlock — and they are read once. This is a control with a countdown
              * on it, and mixing it into the run of banners would put a thing that has to be pressed among
              * three things that only have to be seen.
              *
              * ==================================================================================================
              * `inert` WHILE COVERED, AND THE FIRST VERSION WAS NOT — CHECK K4 CAUGHT IT
              * ==================================================================================================
              *
              * It shipped outside `inert={covered}` on the reasoning that *"on a phone with a task detail open,
              * the one thing that must stay reachable is the one with ten minutes on it."* That reasoning is
              * wrong, and K4 said so: **"2 control(s) behind the full-screen panel are still in the tab order."**
              *
              * Behind a full-screen panel the band is not reachable — it is INVISIBLE AND TABBABLE, which is the
              * worst of the two options and precisely the defect K4 exists for: *"covering something visually is
              * not the same as removing it."* An Allow button a keyboard can focus and an eye cannot find is a
              * button that gets pressed by accident, on a control that authorises something on his machine.
              *
              * The right answer was already on the page: the detail closes with Escape or its own close button,
              * both inside the panel and both reachable, and the band is the first thing above the queue when it
              * does. One keystroke, and nothing invisible is ever focusable.
              *
              * It renders NOTHING when nothing is held — not an empty container. See Approvals.tsx.
              */}
            <div inert={covered}>
                <Approvals approvals={initial.approvals} />
            </div>

            <div className="cols">
                {/*
                  * The queue. `inert` while the detail covers it, which is only ever true on a phone —
                  * a panel you cannot see must not be a place Tab can wander into.
                  */}
                <main className="queue" onKeyDown={onQueueKey} inert={covered}>
                    {/* Always in the DOM so it is a live region before it has anything to announce; a
                        region inserted with its message already inside is often not announced at all. */}
                    <div className="refused" role="alert" aria-live="assertive" data-measure="save-state">
                        {refused && (
                            <>
                                <span className="refusedtext">{refused}</span>
                                <button className="quiet" onClick={() => setRefused(null)}>Dismiss</button>
                            </>
                        )}
                    </div>
                    {shownQuestions.length > 0 && (
                        <>
                            <h2>Decisions — an agent is blocked</h2>
                            {/*
                              * These are no longer capped at 820px.
                              *
                              * The cap was reasoned from "a decision carries the most text, so give it a
                              * readable measure". The reasoning was right and the implementation inverted
                              * it: on a 1920px monitor it produced an 820px column with 600px of nothing
                              * beside it — measured at 57.7% of the content column — which made the most
                              * important thing on the page look like an afterthought. A readable measure
                              * is a property of the TEXT inside the card, not of the card.
                              */}
                            {/*
                              * WHOLE CARDS, AND THE REST BEHIND THE COUNT — instead of a capped scroller.
                              *
                              * This region was `max-height: min(46vh, 620px); overflow-y: auto`, which existed
                              * for a good reason: four open decisions rendered full height filled the entire
                              * first screen of a 1080px monitor and pushed every task below the fold. The cap
                              * fixed that and introduced its own defect, which docs/RESEARCH.md §30.6 recorded
                              * after measuring it — **it slices a card wherever the pixel budget runs out.** In
                              * the fixture that lands mid-way through the fourth option of the second decision,
                              * so "Hold the import until the storage review" is half-drawn. An option you cannot
                              * read is an option you cannot choose, on the one card the design says matters most.
                              * A fade over the cut made it look deliberate; it did not make the option readable.
                              *
                              * So the limit moves from PIXELS to CARDS. Two are rendered whole and the rest are
                              * one press away behind a control — which is exactly how the marks list already
                              * handles the same problem ("5 more marks"), and it means nothing is ever clipped.
                              * Nothing is hidden either: the header count says how many there are and filters to
                              * them, and this says how many are not shown.
                              *
                              * It also removes a scrolling region. The owner's first reaction to this interface
                              * was about scrollbars, and there were three on one screen; check P6 measures them.
                              */}
                            <div className="asks" id="decisions" tabIndex={-1} data-measure="section">
                                {shownQuestions.slice(0, decisionsShown).map(q => (
                                    <QuestionCard
                                        key={q.id}
                                        q={q}
                                        onGone={id => setQuestions(qs => qs.filter(x => x.id !== id))}
                                    />
                                ))}
                                {shownQuestions.length > decisionsShown && (
                                    <button
                                        className="morelink"
                                        data-measure="more-decisions"
                                        onClick={() => setFilter({ kind: 'decisions' })}
                                    >
                                        {shownQuestions.length - decisionsShown} more decision
                                        {shownQuestions.length - decisionsShown === 1 ? '' : 's'} — show them all
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {/*
                      * AN EMPTY HUB IS SUCCESS, NOT DISUSE.
                      *
                      * docs/RESEARCH.md §7 cause 2 is that a tool which has answered its question stops
                      * being opened — so "nothing waiting" is written as a definite, pleasant answer
                      * rather than left as an ambiguous blank screen you might mistake for a bug.
                      *
                      * This was nearly lost in the rewrite: for one commit the empty hub rendered a
                      * "YOUR TURN" heading over a dashed box reading "Nothing to do", which is the same
                      * information delivered as a shrug. It is a hard constraint and it needed its own
                      * branch, not a fallback inside the task list.
                      */}
                    {showingDone ? (
                        <Finished
                            progress={progress}
                            marks={marks}
                            notes={notes}
                            agents={initial.agents}
                            onNoteRemoved={id => setNotes(ns => ns.filter(n => n.id !== id))}
                            deriveInput={deriveInput}
                            finish={looks.crest}
                            timelineAt={filter.kind === 'done' ? (filter.at ?? 'now') : 'now'}
                            focus={filter.kind === 'done' ? filter.focus : undefined}
                            onReopened={onReopened}
                            onRefused={setRefused}
                            onBack={() => setFilter({ kind: 'all' })}
                            onSection={where => setFilter({ kind: 'done', focus: where })}
                        />
                    ) : nothingWaiting ? (
                        <div
                            /*
                             * `done` — the GREEN, solid, success framing — is for the two states that have earned
                             * it. An unstarted hub keeps the plain dashed box, and that is the right visual
                             * language for once: dashed means "something should be here", which is exactly true
                             * before anything is connected and exactly false after.
                             */
                            className={`empty${emptiness === 'unstarted' ? ' unstarted' : ' done'}`}
                            id="your-turn"
                            tabIndex={-1}
                            /* Read by check E3 in tests/measure-layout.mjs, which asserts a brand-new hub does
                               not promise a Telegram message it has no agent to send. */
                            data-empty={emptiness}
                        >
                            {emptiness === 'unstarted' ? (
                                <>
                                    <b>Nothing is connected yet.</b>
                                    {/*
                                      * THE ONE SENTENCE SAYING WHAT THIS IS, and until now it existed nowhere on
                                      * the hub. Every other surface assumes you already know.
                                      */}
                                    This is where your AI agents leave you the work only you can do — a card to
                                    enter, an account to open, a decision only you can make — and where your
                                    answers get back to them. Nothing appears here until a project is wired up.
                                    <a className="emptycta" href="/setup">Set up your first project →</a>
                                </>
                            ) : emptiness === 'connected' ? (
                                <>
                                    <b>Nothing needs you yet.</b>
                                    {/*
                                      * The agent's name is the EVIDENCE that the promise below it can be kept. A
                                      * hub that says "you will get a message" without showing that something is
                                      * talking to it is asking to be believed; naming the agent shows why.
                                      */}
                                    <b className="emptywho">{lastSync!.name}</b> has checked in, so the connection
                                    works. When an agent needs a decision, or hits something only you can do, it
                                    will appear here and you will get a Telegram message.
                                </>
                            ) : (
                                <>
                                    <b>Nothing needs you.</b>
                                    No decisions blocked, no tasks waiting. You will get a Telegram message when
                                    that changes.
                                </>
                            )}
                            {/*
                              * AN EMPTY QUEUE IS SUCCESS, AND THIS IS WHERE THAT STOPS BEING A CLAIM.
                              *
                              * Hard constraint 6 says "nothing needs you" must read as a good state. Before
                              * this it was a pleasant sentence over an absence, which is as far as a sentence
                              * can get on its own. Now it is a pleasant sentence over the record of
                              * everything that got it to zero.
                              *
                              * This is also the whole reason there is no streak here. docs/RESEARCH.md §18:
                              * a streak would render exactly this screen — the state the hub exists to reach
                              * — as a failure and a loss. The two cannot sit on one page, and the empty
                              * queue is not the one that has to go.
                              */}
                            {progress.tasksDone > 0 && (
                                <span className="emptyrecord">
                                    You have finished <b>{humanCount(progress.tasksDone)}</b> task
                                    {progress.tasksDone === 1 ? '' : 's'}
                                    {progress.decisionsMade > 0 && (
                                        <> and made <b>{humanCount(progress.decisionsMade)}</b> decision
                                            {progress.decisionsMade === 1 ? '' : 's'}</>
                                    )}
                                    {progress.firstDoneAt && <> since {humanDate(progress.firstDoneAt)}</>}.
                                </span>
                            )}
                            {/*
                              * ==================================================================================
                              * AN EMPTY QUEUE AND A DEAD AGENT, TOLD APART — ON THE FIRST SCREEN, IN ONE LINE.
                              * ==================================================================================
                              *
                              * `docs/BRIEF-NOTHING-BLOCKED.md` §5's done-condition, and the reason it needs its own
                              * sentence here rather than being left to `/agents`: this card is the screen that
                              * says *"nothing needs you"*, and it is the exact screen on which a dead agent is
                              * invisible. Everything above it is true and cheerful, and with fifteen projects one
                              * of them can have had nothing looking at it since July while this card reads as
                              * success.
                              *
                              * WHY IT IS NOT A COUNT, A CHIP OR A FIGURE. §2 forbids inflating the queue, its
                              * counts or its board chips, and this respects that literally: it renders inside the
                              * empty card, only when the queue is at zero, and it is a link rather than a control
                              * that filters anything. The queue page still answers exactly one question — and on
                              * the one screen where the answer is "nothing", this says whether that is because
                              * everything is done or because nothing is running.
                              *
                              * The sentence comes from `sentenceFor`, so it obeys the no-"you" rule by
                              * construction rather than by my remembering it here.
                              */}
                            {quietest && (
                                <span className="emptyquiet" data-measure="empty-quiet">
                                    {/*
                                      * A middot before the link as well as between the clauses. A 3x crop showed
                                      * "1 more like that See your agents" running together as one phrase — the
                                      * link and the sentence are different kinds of thing and at 1x the colour
                                      * alone was carrying the separation, which is not enough for anyone reading
                                      * quickly or in the light theme.
                                      */}
                                    {quietSentence}
                                    {quietOthers > 0 && ` · ${quietOthers} more like that`}
                                    {' · '}
                                    <a className="navlink" href="/agents">See your agents →</a>
                                </span>
                            )}
                        </div>
                    ) : (
                    <>
                    <h2 id="turn-heading">Your turn</h2>

                    {/*
                      * "I have ten minutes." The chips live with the TASKS rather than in the header line,
                      * because that is what they filter — and because the header already carries four counts
                      * and a fifth row of chips up there would make the one-line answer to "what needs me" into
                      * a control panel.
                      *
                      * `minutes` has been on every task since the beginning and nothing used it except the
                      * total. This is the whole feature: existing data, one control, no new field.
                      */}
                    {showBuckets && (
                        <div className="timefilter" role="group" aria-label="Filter tasks by how long they take">
                            {buckets.map(bk => {
                                const on = filter.kind === 'minutes' && filter.max === bk.max;
                                return (
                                    <button
                                        key={bk.max}
                                        className={`chip small${on ? ' on' : ''}`}
                                        data-time-bucket={bk.max}
                                        aria-pressed={on}
                                        onClick={() => setFilter(f =>
                                            f.kind === 'minutes' && f.max === bk.max
                                                ? { kind: 'all' }
                                                : { kind: 'minutes', max: bk.max })}
                                    >
                                        under <b>{bk.max === 60 ? 'an hour' : `${bk.max}m`}</b>
                                        <span className="chipn">{bk.n}</span>
                                    </button>
                                );
                            })}
                            {/*
                              * WHAT THE FILTER IS NOT SHOWING, said out loud.
                              *
                              * An unestimated task cannot be known to fit, so it is excluded — and a list that
                              * quietly omits work is the beginning of a hub that hides things. Only rendered
                              * when a time filter is engaged AND something is actually being left out, because
                              * a permanent caveat is a caveat nobody reads.
                              */}
                            {filter.kind === 'minutes' && unestimated > 0 && (
                                <span className="chip flat" data-measure="unestimated-note">
                                    {unestimated} more with no estimate, not shown
                                </span>
                            )}
                        </div>
                    )}
                    <div className="groups" data-measure="section">
                        {actionableGroups.length === 0 && (
                            <div className="empty" id="your-turn" tabIndex={-1}>
                                <b>{filter.kind === 'all' ? 'Nothing to do.' : 'Nothing here.'}</b>
                                {filter.kind === 'all'
                                    ? 'No tasks are waiting on you — only decisions above.'
                                    : 'No tasks match what you are looking at.'}
                            </div>
                        )}
                        {actionableGroups.map(([project, list], i) => (
                            <Group
                                key={project}
                                project={project}
                                tasks={list}
                                /*
                                 * The skip link's target is the first LIST, not the region around it.
                                 *
                                 * Pointing it at the wrapper put the project heading — which is a filter
                                 * control — between you and your work, so "skip to your turn" cost 4
                                 * keystrokes and the fourth one was spent leaving a button you did not
                                 * ask for. A skip link should land on the thing it names.
                                 */
                                skipTarget={i === 0}
                                openId={openId}
                                onOpen={setOpenId}
                                onDone={onDone}
                                onRefused={setRefused}
                                onFilter={slug => setFilter(f =>
                                    f.kind === 'project' && f.slug === slug ? { kind: 'all' } : { kind: 'project', slug })}
                            />
                        ))}
                    </div>

                    {/*
                      * EITHER list, not just the grouped one.
                      *
                      * This read `shownWaiting.length > 0` — and the moment the long-waiting tasks were filtered
                      * OUT of `shownWaiting` to stop them appearing twice, a hub whose only blocked task was a
                      * stale one lost the entire section: heading, stale row, chase button, all of it. The
                      * fixture has exactly one blocked task, so the check went straight from green to
                      * "NOT MEASURED". Two lists means two conditions.
                      */}
                    {(shownWaiting.length > 0 || staleBlocked.length > 0) && (
                        <>
                            {/*
                              * THE WAITING SECTION IS VISUALLY SEPARATE NOW, and the brief was right that it
                              * was not: *"'Not yet — waiting on someone else' is a heading over a list with no
                              * visual distinction from live work"*.
                              *
                              * `.notyet` dims the whole region and gives it a top rule, so the boundary between
                              * "yours" and "somebody else's" is a thing you see rather than a heading you read.
                              * Nothing in it is amber and nothing in it is a warning — a blocked task is not his
                              * fault and must never count against him. It is quieter, not louder.
                              */}
                            <div className="notyet" data-measure="not-yet">
                            <h2>Not yet — waiting on someone else</h2>

                            {/*
                              * THE ONES THAT HAVE BEEN WAITING A WHILE, AND THE ONE THING TO DO ABOUT THEM.
                              *
                              * Above the list rather than inside it, because it is a different question. The
                              * list answers "what is not actionable yet"; this answers "is that still true".
                              *
                              * Two days is the threshold. Below that there is nothing to chase and a permanent
                              * "still blocked?" on every row would be the nag this is specifically not.
                              */}
                            {staleBlocked.length > 0 && (
                                <ul className="stalelist">
                                    {staleBlocked.map(({ task, days }) => (
                                        <StaleBlocked
                                            key={task.id}
                                            t={task}
                                            days={days}
                                            selected={task.id === openId}
                                            onOpen={() => setOpenId(task.id)}
                                            onRefused={setRefused}
                                        />
                                    ))}
                                </ul>
                            )}

                            {/* Only when there is something left to group. Without this the section renders an
                                empty measured region, and L1 measures how well every region fills its column —
                                a zero-width one would read as a layout failure. */}
                            {shownWaiting.length > 0 && (
                            <div className="groups" data-measure="section">
                                {waitingGroups.map(([project, list]) => (
                                    <Group
                                        key={project}
                                        project={project}
                                        tasks={list}
                                        openId={openId}
                                        onOpen={setOpenId}
                                        onDone={onDone}
                                        onRefused={setRefused}
                                        onFilter={slug => setFilter({ kind: 'project', slug })}
                                    />
                                ))}
                            </div>
                            )}
                            </div>
                        </>
                    )}
                    </>
                    )}
                </main>

                {/*
                  * The reading pane. On a desktop it sits beside the queue and sticks while the queue
                  * scrolls. On a phone it is normal flow when idle — which is exactly where the compose
                  * box has always been — and covers the screen when a task is open.
                  */}
                <aside className="pane">
                    {open ? (
                        <TaskDetail t={open} onDone={onDone} onClose={closeDetail} />
                    ) : (
                        <Idle
                            initial={initial}
                            notes={notes}
                            looks={looks}
                            unlockedLooks={lookCounts.unlocked}
                            lastSync={lastSync}
                            /* Passed rather than recomputed, so "stale" has one definition and the header
                               banner and the footer line cannot disagree about it. */
                            staleWarning={staleWarning}
                            filter={filter}
                            onFilter={slug => setFilter(f =>
                                f.kind === 'project' && f.slug === slug ? { kind: 'all' } : { kind: 'project', slug })}
                            progress={progress}
                            marks={marks}
                            next={next}
                            standing={standing}
                            crest={crest}
                            /* The level he was struck to in THIS session, or null. See the block above
                               `seenLevel` for why it cannot be set on first mount. */
                            struck={struck}
                            showingDone={showingDone}
                            recordSection={filter.kind === 'done' ? (filter.focus ?? 'tasks') : null}
                            /* Each of the pane's three controls names the section it belongs to, so pressing
                               "5 decided" lands on the decisions rather than on the task list. See `Filter`. */
                            onShowFinished={(where, at) => setFilter(f =>
                                f.kind === 'done' && f.focus === where && (f.at ?? 'now') === (at ?? 'now')
                                    ? { kind: 'all' }
                                    : { kind: 'done', focus: where, ...(at ? { at } : {}) })}
                            composeWanted={composeWanted}
                            onShowSaid={() => setFilter(f =>
                                f.kind === 'done' && f.focus === 'said'
                                    ? { kind: 'all' }
                                    : { kind: 'done', focus: 'said' })}
                        />
                    )}
                </aside>
            </div>

            {/*
              * NO CORPUS IS PASSED IN ANY MORE, and that is the whole of step 2.
              *
              * This used to hand the palette `tasks`, `questions` and `progress.finished` so it could build a
              * haystack in the browser. The record now ships a WINDOW (see `RECORD_WINDOW`), so that index
              * would have gone on finding everything recent and silently stopped finding anything older.
              * `projects` stays because it is bounded, already here, and asking a server for a list of
              * fifteen slugs would put a round trip between him and a word he has typed. See Palette.tsx.
              */}
            <Palette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                projects={initial.projects}
                onAction={onPaletteAction}
            />
        </div>
    );
}

/* --------------------------------------------------------------------------------- the full record */

/**
 * Everything finished, in the queue column, with the controls that make it honest.
 *
 * Grouped by project rather than as one flat list, for the same reason the open queue is: seventeen rows in
 * a row read as a dump, and the point of this hub is that it spans projects. Newest project activity first.
 *
 * Decisions made get their own section underneath rather than being interleaved. They are a different kind
 * of accomplishment — a blocked agent unblocked, which docs/DECISION.md argues is worth more than a ticked
 * errand — and merging them into one list would have meant one combined number, which is a points economy
 * with extra steps.
 */
/**
 * One thing he said, with the state of it and a way to take it back.
 *
 * Its own component because withdrawing is a write, and a write needs the same three states every other write
 * in this interface has: pending, the server's confirmation, and the server's actual reason when it refuses.
 * Inlining it in the list would have meant one shared state for twenty rows, which is the bug the record's
 * `aria-pressed` already taught — a state that belongs to one row cannot be stored for all of them.
 */
function SaidRow({ note, agents, onRemoved, onRefused }: {
    note: BoardState['notes'][number];
    agents: BoardState['agents'];
    onRemoved: (id: string) => void;
    onRefused: (message: string) => void;
}) {
    const [going, setGoing] = useState(false);
    const reach = noteReach(note.created_at, agents);
    const first = reach[0];

    async function withdraw() {
        setGoing(true);
        const r = await act({ action: 'note.remove', id: note.id });
        if (r.ok) onRemoved(note.id);
        else { setGoing(false); onRefused(r.message); }
    }

    return (
        <li
            data-measure="said"
            style={note.project ? { ['--proj' as string]: projectColor(note.project) } : undefined}
        >
            <div className="saidhead">
                {note.project ? (
                    <>
                        <span className="pdot" style={{ background: projectColor(note.project) }} />
                        <span className="pname">{note.project}</span>
                    </>
                ) : (
                    /* An unscoped note goes to whoever looks next. Said, rather than left as a blank. */
                    <span className="pname">any agent</span>
                )}
                <span className="pmeta">{humanAgo(note.created_at)}</span>
                {/*
                  * WITHDRAW, and the label is that word rather than "delete".
                  *
                  * It removes the note from his list of what he has said; it does not remove the
                  * `note.created` event, because agents were already handed it. "Delete" would claim the
                  * message never happened, which for anything already collected is not true. See the
                  * `note.remove` case in app/api/ui/act/route.ts.
                  */}
                <button
                    className="quiet saidwithdraw"
                    onClick={withdraw}
                    disabled={going}
                    aria-label={`Withdraw this note${note.project ? ` from ${note.project}` : ''}`}
                >
                    {going ? 'Withdrawing…' : 'Withdraw'}
                </button>
            </div>
            <p className="saidbody">{note.body}</p>
            <p className={`saidreach${first ? '' : ' waiting'}`} data-measure="said-reach">
                {first
                    ? `${first.name} synced ${
                        first.afterMinutes === 0 ? 'straight after' : humanMinutes(first.afterMinutes) + ' later'
                    }${reach.length > 1
                        ? `, and ${reach.length - 1} other agent${reach.length === 2 ? '' : 's'} since`
                        : ''}`
                    : 'No agent has synced since you wrote this'}
            </p>
        </li>
    );
}

function Finished({
    progress, marks, notes, agents, focus, onReopened, onRefused, onBack, onSection, onNoteRemoved,
    deriveInput, finish, timelineAt,
}: {
    progress: ReturnType<typeof derive>;
    /**
     * The unfiltered rows, for the time machine.
     *
     * Handed down rather than re-fetched or re-assembled, because `Timeline` runs the SAME derivation at an
     * earlier cut-off and the whole value of the feature is that it cannot disagree with the live figures. Two
     * sources would make it a liability instead.
     */
    deriveInput: Parameters<typeof derive>[0];
    /** The crest finish in force, so the time machine's past crests are drawn in the look he chose. */
    finish: string;
    /** Where the time machine opens: today, or the first day of the record. See `Filter`. */
    timelineAt: 'first' | 'now';
    marks: ReturnType<typeof marksOf>;
    /** The last 20 things he told an agent. Capped, and the interface says so. */
    notes: BoardState['notes'];
    /** Every agent and when it last synced, for deciding whether a note has been collected. */
    agents: BoardState['agents'];
    /** Which section to land on, so the control that opened this leads somewhere related to itself. */
    focus: RecordSection | undefined;
    onReopened: (task: Task) => void;
    onRefused: (message: string) => void;
    onBack: () => void;
    /** Switch tab without leaving the record. */
    onSection: (where: RecordSection) => void;
    /** A note the server confirmed is gone. Lifted, because the list lives in Board state. */
    onNoteRemoved: (id: string) => void;
}) {
    /*
     * ONE SECTION AT A TIME, chosen by whichever control opened this.
     *
     * SCROLLING TO A SECTION WAS THE FIRST ATTEMPT AND `tests/audit-ui.mjs` PROVED IT DID NOT WORK. The record
     * is 2,017px in a 1,080px viewport, so the furthest the page can scroll is 937px — and both the tasks
     * heading and the decisions heading are past that. Pressing "13 finished" and pressing "5 decided" therefore
     * landed at exactly the same y, under exactly the same heading. The audit printed them side by side:
     *
     *     record via "N finished"   y=937  "Every task — 9"
     *     record via "N decided"    y=937  "Every task — 9"
     *
     * Which is the original defect surviving its own fix, and it is why the audit exists — a scroll offset is
     * something you have to MEASURE, not something you can reason about from the code.
     *
     * Showing one section is the better answer anyway, and it fixes a second complaint at the same time: all
     * three lists stacked was "an ugly wall of text". Now the control you press decides what you see, the
     * switcher says where you are and what else there is, and each list gets the full column.
     */
    const shown = focus ?? 'tasks';

    /*
     * ONLY THE ROWS THAT HAVE A TITLE, WHICH IS THE WINDOW — and the heading below says how many of how many.
     *
     * `progress.finished` is the whole record: every completion ever, because that is what the figures and
     * the marks are folded over. The ones older than `RECORD_WINDOW` arrived as numbers and have no sentence
     * to render, so listing them would produce blank rows. Filtering on `title` rather than on an index keeps
     * this true no matter how the window is produced, and the count it is compared against comes from SQL —
     * see `BoardState.totals` and check P2.
     */
    const listed = useMemo(() => progress.finished.filter(f => f.title !== null), [progress.finished]);
    /* Same for the decisions: a decision older than the window has no title to show. */
    const listedDecisions = useMemo(
        () => progress.decisions.filter(d => d.title !== ''), [progress.decisions]);

    return (
        <>
            <div className="recordhead">
                <h2 id="finished-heading">
                    What you have finished — {humanCount(progress.tasksDone)}
                </h2>
                <button className="quiet backtoqueue" onClick={onBack}>Back to what needs you</button>
            </div>


            {/*
              * EVERY MARK, WITH ITS DETAIL LINE — here rather than in the pane.
              *
              * The pane shows three as dated one-liners; this is where each one has room for the sentence that
              * says what it actually was. Same split as the completions themselves: figures and dates in the
              * narrow column, prose in the wide one. Putting both in a 420px pane is what made the owner call
              * the whole thing a wall of text.
              *
              * Grouped by tier so the rare ones read as rare. Nothing here is a target — the unearned ones are
              * in the pane's "Next" list with honest arithmetic, and check P5 verifies that arithmetic.
              */}
            {/*
              * WHICH LIST, AND WHAT ELSE THERE IS.
              *
              * Three sections used to be stacked in one column, so the record was every finished task, every
              * mark and every decision in one scroll — "an ugly wall of text", accurately. It is one list at a
              * time now, and this is both the navigation and the answer to "where am I".
              *
              * Each entry point into the record pre-selects its own tab, which is what makes the pane's figures
              * mean something: "13 finished" opens the tasks, "5 decided" opens the decisions, "8 more marks"
              * opens the marks. `tests/audit-ui.mjs` compares where each one lands and would print them as the
              * same destination again if this regressed.
              *
              * Counts are on the tabs because a tab that might be empty should say so before it is pressed.
              */}
            <div className="recordtabs" role="group" aria-label="Which part of the record to show">
                {([
                    ['tasks', 'Tasks', progress.tasksDone],
                    ['decisions', 'Decisions', progress.decisions.length],
                    ['marks', 'Marks', marks.length],
                    /* The outbound half, beside the three inbound ones. Same column, same pattern, and it is
                       the only place the hub shows what he has said rather than what was asked of him. */
                    ['said', 'Told agents', notes.length],
                    /* The time machine. Last because it is the one tab that is about the SHAPE of the record
                       rather than its contents, and because the four before it answer "what happened" while
                       this one answers "where was I". */
                    ['timeline', 'Timeline', momentCount(deriveInput, marks)],
                ] as const).map(([key, label, n]) => (
                    <button
                        key={key}
                        className={`chip small${shown === key ? ' on' : ''}`}
                        data-measure="record-tab"
                        data-tab={key}
                        aria-pressed={shown === key}
                        disabled={n === 0}
                        onClick={() => onSection(key)}
                    >
                        {label}<span className="chipn">{humanCount(n)}</span>
                    </button>
                ))}
            </div>

            {/*
              * WHAT HE HAS SAID, AND WHETHER ANYTHING CAME FOR IT.
              *
              * The whole outbound channel used to be one line in the footer: `Last note: "…"` truncated to 120
              * characters, with no date, no project, no history and — the part that matters — no indication that
              * anything had collected it. Writing a note replies *"Saved — the next agent will read it"*, which
              * is a promise about the future in a codebase where nothing may report success before it has been
              * re-read. He was told an agent would read it and never told whether one did.
              *
              * The reach line is deliberately about SYNCS and never says "read": see `noteReach` in
              * lib/progress.ts for why that distinction is load-bearing rather than pedantic. The useful state is
              * the empty one — nothing has synced since — and it is stated in words rather than left blank,
              * because a missing line reads as "fine" and this is the case he can act on.
              */}
            {shown === 'said' && (
                <div data-measure="said-list">
                    {notes.length === 0 ? (
                        <p className="recordnone">
                            Nothing yet. Anything you write here — or message the Telegram bot — arrives with the
                            next agent that syncs, and shows up in this list with who collected it.
                        </p>
                    ) : (
                        <>
                            <p className="recordsince">
                                The last {notes.length === 1 ? 'thing' : notes.length + ' things'} you told an
                                agent, newest first{notes.length >= 20 ? ' (the 20 most recent)' : ''}.
                            </p>
                            <ul className="saidlist">
                                {notes.map(n => (
                                    <SaidRow key={n.id} note={n} agents={agents}
                                        onRemoved={onNoteRemoved} onRefused={onRefused} />
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}

            {shown === 'timeline' && (
                <Timeline input={deriveInput} marks={marks} finish={finish} startAt={timelineAt} />
            )}

            {shown === 'marks' && marks.length > 0 && (
                <>
                    <ul className="markwall" data-measure="mark-wall">
                        {marks.map(m => (
                            <li key={m.slug} data-measure="milestone" data-milestone={m.slug}
                                data-tier={m.tier}>
                                <span className="markpip" aria-hidden="true" />
                                <span className="markbody">
                                    <span className="marklabel">{m.label}</span>
                                    {m.detail && <span className="markdetail">{m.detail}</span>}
                                </span>
                                <span className="markwhen">{humanDate(m.at)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div
                id="finished"
                tabIndex={-1}
                data-measure="done-list"
                hidden={shown !== 'tasks'}
            >
                {/*
                  * WHAT THIS LIST IS, DIRECTLY ABOVE THIS LIST — and it used to be above the tab strip.
                  *
                  * Both sentences are about the completions: one says how many of how many are listed, the other
                  * says that re-opening one stops it counting. Neither is true of the marks, the notes or the time
                  * machine, and all five tabs were rendering underneath them.
                  *
                  * At two years, rendered for the first time in §XXVII, that produced the state that made the
                  * placement obviously wrong: press Decisions and there are **two window sentences 80px apart**,
                  * and the first one — the larger, the one under the heading — is about a list that is no longer on
                  * screen. "The most recent 60 of 2,190" over a list of decisions is not a caveat, it is a wrong
                  * number about the thing you are looking at.
                  *
                  * So it moves inside the branch it describes, which is where the decisions' own version already
                  * was. The heading keeps the total, which is the one figure that is about the record as a whole.
                  *
                  * IT SAYS WHICH IT IS SHOWING, AND ONLY WHEN THAT IS NOT ALL OF THEM. "Everything since 30 July"
                  * was true while the page shipped the whole record and is a lie the moment it ships a window —
                  * and it is exactly the kind of lie this hub cannot afford, because it is on the surface whose
                  * only job is to be believable. lib/store.ts has said the rule since `notes` was capped at 20:
                  * *"a window is honest as long as the interface does not claim it is everything."* Only when the
                  * cap actually bites, which is the same rule the unestimated-tasks note and the palette's own
                  * "first 50" line follow. On his hub today it says "Everything since 30 July", unchanged.
                  *
                  * TWO ELEMENTS, AND ONLY ONE OF THEM CARRIES `record-window`. The first version was one `<p>`
                  * with the marker and a ternary inside it, which made the marker mean "this is the record's
                  * opening line" rather than "the page claims a window" — so P10's injection, which adds a claim
                  * to a page that is showing everything, found the real element first and reported that a working
                  * check had not caught its own defect. The marker names the CLAIM.
                  *
                  * AND IT NO LONGER SAYS "ON THE RIGHT". Older completions "still count towards everything on the
                  * right" was written against the two-column desktop layout and is false in three of the five
                  * data states: with nothing open the pane is BELOW the record (`.shell.clear`), and on a phone it
                  * always is. What they count towards is the level and the marks, which is the fact — where those
                  * happen to be on screen is not.
                  */}
                {progress.firstDoneAt && (
                    listed.length < progress.tasksDone ? (
                        <p className="recordsince" data-measure="record-window">
                            The most recent <b>{humanCount(listed.length)}</b> of <b>{humanCount(progress.tasksDone)}</b>,
                            newest first.
                            Older ones still count towards your level and your marks, and
                            {' '}<kbd>Ctrl</kbd><kbd>K</kbd> finds them by name.
                        </p>
                    ) : (
                        <p className="recordsince">
                            Everything since {humanDate(progress.firstDoneAt)}. Re-opening one puts it back in
                            the queue and stops it counting.
                        </p>
                    )
                )}
                {/*
                  * ONE LIST, NEWEST FIRST — which is what the line above it has always claimed, and was not.
                  *
                  * This was grouped by project, and the grouping is what made the claim false: `progress.finished`
                  * arrives in `done_at` descending order, and bucketing it by project turns one descending list
                  * into fifteen of them side by side. At fixture volume that is four groups of two or three and
                  * nobody noticed. At two years, rendered for the first time in §XXVII, it is **fifteen bordered
                  * boxes of four rows each**, every box internally newest-first and the page as a whole in no
                  * order at all, under a sentence reading "The most recent 60 of 2,190, newest first."
                  *
                  * The queue is grouped by project because he acts project by project — "what needs me in
                  * harbour-lights" is a real question. The record is HISTORY, and the question history answers is
                  * "what have I been doing", which is chronological. Grouping was the queue's pattern applied to a
                  * surface with a different job.
                  *
                  * It also removes fifteen containers from the page rather than adding anything, which is
                  * `docs/BRIEF-VISUAL.md` §3.1 — eight identical bordered rectangles — answered by subtraction.
                  * The project is not lost: it moves onto the row as the dot and rail the queue already uses, so
                  * the one material that is genuinely his is on sixty rows instead of on fifteen headings.
                  */}
                <ul className="rows donelist" aria-labelledby="finished-heading">
                    {listed.map(f => (
                        <DoneRow key={f.id} f={f} onReopened={onReopened} onRefused={onRefused} />
                    ))}
                </ul>
            </div>

            {shown === 'decisions' && listedDecisions.length > 0 && (
                <>
                    {/*
                      * There is no un-answer, and that asymmetry is deliberate rather than an omission.
                      * `answerQuestion` refuses a second answer because an agent may already have acted on
                      * the first, so a task's credit is reversible and a decision's is not. Said out loud
                      * here so nobody reads the missing control as an oversight.
                      */}
                    {listedDecisions.length < progress.decisions.length && (
                        <p className="recordsince" data-measure="record-window">
                            The most recent <b>{humanCount(listedDecisions.length)}</b> of{' '}
                            <b>{humanCount(progress.decisions.length)}</b>, newest first. Older ones still count, and
                            {' '}<kbd>Ctrl</kbd><kbd>K</kbd> searches every one of them.
                        </p>
                    )}
                    <ul className="decided">
                        {listedDecisions.map(d => (
                            <li key={d.id}>
                                <span className="decidedtop">
                                    <span className="pdot" style={{ background: projectColor(d.project) }} />
                                    <span className="decidedq">{d.title}</span>
                                    <span className="donewhen">{humanDate(d.answered_at)}</span>
                                </span>
                                <span className="decideda">
                                    You chose: <strong>{d.chose}</strong>
                                    {/* NOT tagged `became-true`. How long an agent waited is a different
                                        fact from what a completion achieved, and tagging it as the same
                                        thing made check P3 report "12 of 9 completions state what they
                                        achieved" — a ratio above one, which is a measurement that cannot
                                        mean what it says. The check passed while being incoherent, which is
                                        the failure mode this suite exists to avoid. */}
                                    {d.minutesBlocked != null && d.minutesBlocked <= 60 && (
                                        <span className="decidedfast">
                                            {' '}— the agent was waiting{' '}
                                            {d.minutesBlocked <= 1 ? 'under a minute' : `${d.minutesBlocked} minutes`}
                                        </span>
                                    )}
                                </span>
                                {/*
                                  * WHAT HE TURNED DOWN — the part that makes it read as a decision.
                                  *
                                  * "You chose: reuse product-images" is a fact. "over: a catalogue bucket, the
                                  * CDN, holding the import" is what says a judgement was made, and it is the
                                  * only thing here that would answer an agent asking why. It costs nothing to
                                  * send: the options are already in the array this folds over.
                                  *
                                  * Rendered only when there was something to reject, so an approval or a typed
                                  * answer does not grow an empty "over:" line.
                                  */}
                                {d.rejected.length > 0 && (
                                    <span className="decidedover" data-measure="decided-over">
                                        over {d.rejected.join(' · ')}
                                    </span>
                                )}
                                {d.note && <span className="decidednote">“{d.note}”</span>}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}

/* ------------------------------------------------------------------------------------ one project */

/**
 * One project's tasks, under a coloured heading with its own counts.
 *
 * The heading was a `<div role="button">` that toggled the group open — five of them on the page, none
 * focusable, none with a key handler. It is a real button now, but it does something better than
 * collapsing: it filters the whole queue to that project. One control that answers "just show me
 * riff-kitchen" beats five that each hide one thing, and it is a heading you can also just read.
 */
function Group({ project, tasks, openId, onOpen, onDone, onFilter, onRefused, skipTarget = false }: {
    project: string;
    tasks: Task[];
    openId: string | null;
    onOpen: (id: string) => void;
    onDone: (id: string) => void;
    onFilter: (slug: string) => void;
    onRefused: (message: string) => void;
    skipTarget?: boolean;
}) {
    const minutes = tasks.reduce((n, t) => n + (t.minutes ?? 0), 0);
    return (
        <section className="pgroup" style={{ ['--proj' as string]: projectColor(project) }}>
            <button className="phead" onClick={() => onFilter(project)} title={`Show only ${project}`}>
                <span className="pdot" style={{ background: projectColor(project) }} />
                <span className="pname">{project}</span>
                <span className="pmeta">
                    {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                    {minutes ? ` · ${humanMinutes(minutes)}` : ''}
                </span>
            </button>
            {/*
              * THE WAY THROUGH TO THE PROJECT'S OWN PAGE, and it is a separate control on purpose.
              *
              * The heading is a FILTER — it narrows this queue — and the project page is a NAVIGATION.
              * Making one element do both would mean a press whose meaning depends on where in the element
              * it landed, which is the shape of every control anybody has ever pressed by accident.
              *
              * OUTSIDE the button rather than inside it: an anchor nested in a button is invalid HTML and
              * browsers resolve it by moving the anchor out, which produces a layout nobody wrote. It sits
              * in the heading row by CSS instead.
              */}
            <a
                className="popen"
                href={`/p/${encodeURIComponent(project)}`}
                data-measure="project-open"
                title={`Open ${project} — what is running, what was said, what ran`}
            >
                Open
            </a>
            {/* A list of tasks is a list. It was a stack of divs, so nothing announced "16 items". */}
            <ul
                className="rows"
                {...(skipTarget ? { id: 'your-turn', tabIndex: -1 } : {})}
                aria-label={`${project} tasks`}
            >
                {tasks.map(t => (
                    <TaskRow
                        key={t.id}
                        t={t}
                        selected={t.id === openId}
                        onOpen={() => onOpen(t.id)}
                        onDone={onDone}
                        onRefused={onRefused}
                    />
                ))}
            </ul>
        </section>
    );
}

/* --------------------------------------------------------------------- the pane, with nothing open */

/**
 * What the reading pane holds when no task is open.
 *
 * Everything on it is COMPUTED from live rows at render time, never stored prose — the rule that
 * `app/setup/page.tsx` was built around, and the reason hard constraint 5 exists. And everything on it is
 * a control or a fact about freshness; there is no figure here that you can only look at.
 */
function Idle({
    initial, notes, looks, unlockedLooks, lastSync, staleWarning, filter, onFilter, crest, composeWanted,
    progress, marks, next, standing, struck, showingDone, recordSection, onShowFinished, onShowSaid,
}: {
    initial: BoardState;
    /** Live, not initial.notes: withdrawing one has to change the footer in the same interaction. */
    notes: BoardState['notes'];
    /** The palette in force, already validated server-side. Named in the footer link. */
    looks: Looks;
    /** How many looks he has earned. Counted from the same derivation the level bar uses. */
    unlockedLooks: number;
    lastSync: { name: string; last_sync_at: string | null } | null;
    /** Non-null when the header is already carrying the warning, so the footer does not repeat it. */
    staleWarning: string | null;
    filter: Filter;
    onFilter: (slug: string) => void;
    progress: ReturnType<typeof derive>;
    marks: ReturnType<typeof marksOf>;
    next: ReturnType<typeof nextUp>;
    standing: ReturnType<typeof standingOf>;
    /**
     * The level he was struck to in this session, or null.
     *
     * Passed down rather than derived here, because the transition is only observable where the state lives —
     * `Idle` re-mounts when the filter changes, and a ref inside it would forget what it had already seen and
     * re-fire the strike on a navigation. See the block above `seenLevel` in `Board`.
     */
    struck: number | null;
    /** The crest's inputs. Passed rather than recomputed here, so one derivation feeds the whole pane. */
    crest: ReturnType<typeof crestInput>;
    showingDone: boolean;
    /**
     * Bumped whenever something outside the pane asks for the compose box — today, only the palette.
     *
     * A counter rather than a boolean, so asking twice works twice: with a flag, a second request while the form
     * is already open is a no-op, and if he closed the form in between the flag would still be set and nothing
     * would happen. The form keeps owning whether it is open; this only says that he asked.
     */
    composeWanted: number;
    /** Which record section is open, or null. Each figure lights only for its own. */
    recordSection: RecordSection | null;
    /** `at` is only meaningful for the timeline — see `Filter` and Progress.tsx for why it exists. */
    onShowFinished: (where: RecordSection, at?: 'first' | 'now') => void;
    /** Opens the record on the outbound tab. Separate from onShowFinished so the footer's control lands
     *  where its own sentence points, which is the whole reason the focus argument exists. */
    onShowSaid: () => void;
}) {
    /*
     * Has anything been round since the last note? Computed here so the footer's control and the record's list
     * cannot disagree — the same mistake the stale-sync line already taught, where one definition of "stale"
     * in two places is two definitions.
     */
    /*
     * PROMINENCE IN PROPORTION TO ACTIONABILITY, and production taught me this within a minute of the deploy.
     *
     * The first version always showed the state plus a preview of the last note. On his real hub that made the
     * headline of the outbound surface *"Last note collected by isolation-check — 'Proof note at
     * 2026-07-29T23:00:52.867Z'"*: a marker left behind by a proof run days earlier, credited to a test agent,
     * given the loudest position on a channel built to be trusted. Nothing was wrong with the sentence. It was
     * simply not worth a headline, and it crowded out a footer whose other job is freshness.
     *
     * So the amber state and the preview appear only when the last note has NOT been collected, which is the
     * case he can act on. Otherwise it is a plain way in, and the content lives in the list where it belongs.
     */
    const lastNoteReach = notes.length ? noteReach(notes[0].created_at, initial.agents) : [];
    const uncollected = notes.length > 0 && lastNoteReach.length === 0;

    const [noteBody, setNoteBody] = useState('');
    const [noteProject, setNoteProject] = useState('');
    const [noteState, setNoteState] = useState<SaveState>({ kind: 'idle' });
    /*
     * THE COMPOSE FORM IS CLOSED UNTIL ASKED FOR, and that is what makes the rest of the pane reachable.
     *
     * Measured: the idle pane held 1,257px of content in 1,040px of space at 1920×1080, so 217px was out of
     * reach behind the pane's own scrollbar — and what was cut was the footer, which carries the only warning
     * that no agent has synced and the list may therefore be stale. The anti-rot signal (docs/RESEARCH.md §7
     * cause 5) was below a fold. Check L7 now holds that at zero.
     *
     * This form was 332px of that, permanently rendered, for one textarea: a label and a select, a second
     * label, the box, a key hint, a button, a save line and a standing paragraph of editorial. Exactly the
     * same defect QuestionCard already fixed — "a textarea rendered unconditionally, on every card, before
     * anyone had asked to write anything" — so it gets the same fix and the same `+` idiom.
     *
     * THE TENSION, STATED RATHER THAN GLOSSED: the brief calls the return channel the thing the design values
     * most, and hiding a control is not obviously how you honour that. Two things make it the right trade
     * anyway. It was already at the BOTTOM of the pane below the record, so it was never prominent; and it was
     * costing the visibility of a warning that tells him the whole list might be lying. If the return channel
     * should be louder, the answer is to move it, not to leave 332px of form permanently open — and moving it
     * is a design decision to bring him rather than one to slip in here.
     *
     * It does not auto-close after a send. Hard constraint 1 means the "Saved" line has to stay visible, and
     * collapsing the form would take the confirmation with it.
     */
    const [composing, setComposing] = useState(false);
    /*
     * Open it when something outside the pane asks. Skips the first render, so a fresh page load does not arrive
     * with 332px of form open — the whole reason this is collapsed by default (check L7 holds the idle pane at
     * zero spare on a monitor).
     */
    useEffect(() => { if (composeWanted > 0) setComposing(true); }, [composeWanted]);

    /** Extracted so the button and Ctrl+Enter share one path rather than two that can drift apart. */
    async function sendNote() {
        if (noteState.kind === 'busy' || !noteBody.trim()) return;
        setNoteState({ kind: 'busy' });
        const r = await act({ action: 'note.add', body: noteBody, project: noteProject || null });
        if (r.ok) {
            setNoteState({
                kind: 'ok',
                message: noteProject
                    ? `Saved — the next ${noteProject} agent will read it`
                    : 'Saved — the next agent to sync will read it',
            });
            setNoteBody('');
        } else {
            setNoteState({ kind: 'bad', message: r.message });
        }
    }

    return (
        <div className="idle">
            {/*
              * "Open a task on the left and its steps appear here." USED TO BE HERE AND IS GONE.
              *
              * It was the one element in the pane that failed docs/RESEARCH.md §14's rule outright: pressing it
              * did nothing, and it told him something he learns the first time he clicks a row and never needs
              * again. It cost 30px of a column that check L7 holds at ZERO spare on a monitor, and the crest
              * needs 13 of those 30 because a shield is taller than the square emblem it replaced.
              *
              * Deleting a line to pay for a graphic would be a bad trade if the line were carrying anything.
              * This one was carrying an instruction for a first-run experience that happened months ago, on a
              * hub with one user who has already had it.
              */}
            {/*
              * STANDING AND THE RECORD COME FIRST IN THE PANE, ABOVE THE COMPOSE BOX.
              *
              * A deliberate exception to "actions before readouts", and the reasoning is that the whole left
              * column IS the action surface — the pane is what he looks at when nothing is open. What he asked
              * for was to feel the progression on opening the hub, and docs/RESEARCH.md §22 (over 70% of use of
              * a surface like this is a five-second glance) says anything he has to scroll to is the same as
              * absent. It was below the compose box for one iteration and that is exactly where it was invisible.
              *
              * Both blocks are still controls end to end: the score opens its own receipt, the figures and the
              * marks count open the full record. Nothing here is only lookable-at.
              */}
            <Profile s={standing} crest={crest} finish={looks.crest} struck={struck} />

            <Progress
                s={progress}
                marks={marks}
                next={next}
                showing={recordSection}
                onShowFinished={onShowFinished}
            />

            <h2>Tell an agent something</h2>
            {!composing ? (
                /*
                 * Closed: one control and one line, about 60px instead of 332px. The heading above still says
                 * what this is, so the button does not have to repeat it.
                 */
                <div className="composeshut">
                    <button className="quiet" onClick={() => setComposing(true)}>
                        + Write a message
                    </button>
                    {/* One line, and it has to stay one line: at 1280 and 1920 this pane has zero pixels
                        spare (check L7), and the two-line version of this sentence — "Or just message the
                        Telegram bot — anything that is not a button tap becomes a note." — was 19px of the
                        budget the crest needed. Same fact, shorter. */}
                    <p className="why">Or message the Telegram bot: any text becomes a note.</p>
                </div>
            ) : (
            <div className="card compose" data-measure="section">
                {/*
                  * WHICH agent — the question this used to leave unanswered.
                  *
                  * A note used to be global, so it went to whichever agent happened to sync next. With one
                  * project that was fine. With fifteen it is noise at best, and an agent working on the
                  * wrong project acting on it at worst. So a note is addressed: to one project, or to
                  * "whoever looks next" when it is genuinely general.
                  *
                  * The agent side matches: `cc sync` infers its project from the folder and only reads
                  * that project's notes plus the unaddressed ones.
                  */}
                <label className="field-label" htmlFor="note-project">For</label>
                <select id="note-project" value={noteProject} onChange={e => setNoteProject(e.target.value)}>
                    <option value="">whichever agent looks next</option>
                    {initial.projects.map(p => (
                        <option key={p.slug} value={p.slug}>{p.slug}</option>
                    ))}
                </select>

                <label className="field-label" htmlFor="note-body" style={{ marginTop: 12 }}>Message</label>
                <textarea
                    id="note-body"
                    /* Opened deliberately, so focus belongs in the box — the same reason QuestionCard's
                       comment field takes focus when it is asked for. */
                    autoFocus
                    value={noteBody}
                    placeholder={noteProject
                        ? `Whatever you want the next ${noteProject} agent to know.`
                        : 'Whatever you want the next agent to know, on any project.'}
                    onChange={e => setNoteBody(e.target.value)}
                    onKeyDown={submitOnCtrlEnter(() => { if (noteBody.trim()) void sendNote(); })}
                />
                <KeyHint />
                <button
                    className="send"
                    style={{ marginTop: 8 }}
                    disabled={noteState.kind === 'busy' || !noteBody.trim()}
                    onClick={() => void sendNote()}
                >
                    Send it
                </button>
                <Saved state={noteState} />
                {/* The Telegram line lives in the CLOSED state now. Repeating it here would be the same fact
                    stated twice on one screen, which is what two marks with identical detail lines looked like
                    and read as a rendering bug. */}
            </div>
            )}

            {/*
              * THE RECORD.
              *
              * In the pane rather than on its own page, because docs/RESEARCH.md §22 found that over 70% of
              * use of a surface like this is a five-second glance, and §14 found that of 89 studied
              * dashboards only 47% were still active. A destination is the thing that dies. This is where he
              * already looks when nothing is open, and it sticks beside the queue on a desktop.
              *
              * Both blocks are rendered ABOVE the compose box — see the comment where they actually are.
              */}
            {initial.projects.length > 0 && (
                <>
                    <h2>Projects</h2>
                    <ul className="projlist">
                        {initial.projects.map(p => {
                            const here = progress.perProject.find(x => x.slug === p.slug);
                            const doneHere = here?.done ?? 0;
                            /*
                             * THE OPEN COUNT COMES FROM THE SAME PLACE THE QUEUE'S DOES.
                             *
                             * It used to be `p.open_tasks` from `projects()`, which counts blocked tasks too.
                             * So this row said "16 open" while the queue heading two feet to the left said
                             * "15 tasks" — both true under different definitions, neither labelled, on one
                             * screen. That is the trust gap from docs/RESEARCH.md §7 in miniature, and it
                             * became visible the moment a "done" figure was put next to it: one number
                             * disagreeing with another poisons confidence in all of them, including the new
                             * one this whole surface depends on.
                             *
                             * Nothing is hidden by counting only actionable work here — the blocked task is
                             * in the header's "waiting on someone else" chip and in the queue's own "Not yet"
                             * section. And a blocked task must never read as something he has not done.
                             * Falls back to the store's figure if a project has no rows in the snapshot.
                             */
                            const openHere = here?.open ?? p.open_tasks;
                            /* Answered decisions in this project. See `decided` on ProjectProgress for why the
                             * per-project view could not see them at all until now. */
                            const decidedHere = here?.decided ?? 0;
                            return (
                                <li key={p.slug}>
                                    <button
                                        className={`projrow${filter.kind === 'project' && filter.slug === p.slug ? ' on' : ''}`}
                                        aria-pressed={filter.kind === 'project' && filter.slug === p.slug}
                                        onClick={() => onFilter(p.slug)}
                                    >
                                        <span className="pdot" style={{ background: projectColor(p.slug) }} />
                                        <span className="pname">{p.slug}</span>
                                        {/*
                                          * ONE FIGURE PER CHIP, AND IT IS WHICHEVER ONE MEANS SOMETHING.
                                          *
                                          * This used to read "2 waiting · 4 open · 6 done" on a full-width row.
                                          * Three numbers on a filter control, two of which are noise in any given
                                          * state: a project with four tasks open does not need to be told it also
                                          * finished six, and a project with nothing open was reporting "0 open",
                                          * which is the least useful sentence the hub could say about it.
                                          *
                                          * So: open work if there is any, otherwise the finished count — which is
                                          * the state where "this project is clear" is the whole point, and the only
                                          * place the hub says it.
                                          *
                                          * Decisions still trump both. An unanswered question is the one thing
                                          * here that has a deadline attached.
                                          *
                                          * ==========================================================================
                                          * AND THEN ANSWERED DECISIONS, WHICH IS A FOURTH CASE THAT WAS SHOWING
                                          * NOTHING AT ALL
                                          * ==========================================================================
                                          *
                                          * The chain used to end `: null` — "a project with neither shows no figure
                                          * rather than a zero" — and that was written believing the only remaining
                                          * case was a project with nothing in it. It is not. A project where he has
                                          * only ever answered a DECISION has no tasks either way, so it fell to
                                          * `null` and rendered as a bare name beside siblings reading "9 open" and
                                          * "2 open", which reads as a number that failed to render.
                                          *
                                          * That is the hub contradicting its own thesis, not a styling slip: a
                                          * decision is equal-status work, it scores points, and it is half of what
                                          * this hub is for. Saying nothing about a project he has made a decision in
                                          * is the per-project view being unable to see one of the two nouns.
                                          *
                                          * Found on the `--live` fixture — production's real shape — and invisible
                                          * on the default one, where every project is given open tasks so this case
                                          * cannot occur. `null` is still the last resort, for a project the event log
                                          * knows and nothing has happened in yet.
                                          */}
                                        {p.open_questions > 0 ? (
                                            <span className="pmeta">{p.open_questions} waiting</span>
                                        ) : openHere > 0 ? (
                                            <span className="pmeta">{openHere} open</span>
                                        ) : doneHere > 0 ? (
                                            <span className="pmeta pclear">{doneHere} done</span>
                                        ) : decidedHere > 0 ? (
                                            <span className="pmeta pclear">
                                                {decidedHere} decided
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            <footer>
                {/*
                  * Staleness, made visible. If no agent has synced for a long time, the hub is quietly
                  * going out of date and this line is the only warning you would get. It is stated as a
                  * fact rather than an alarm, and it is here rather than at the top because it is
                  * diagnostic, not actionable.
                  */}
                {/*
                  * The ordinary case only. The WARNING cases — never synced, or stale — are in the header now,
                  * because the footer is the part of the pane that the overflow cuts off (check L7), and a
                  * warning you have to scroll a pane to find is a warning that does not exist.
                  *
                  * Not repeated here when the banner is showing. Saying the same thing twice on one screen is
                  * what two marks with identical detail lines looked like, and it read as a rendering bug.
                  */}
                {lastSync?.last_sync_at && !staleWarning && (
                    <div>
                        Last agent sync: {lastSync.name}, {humanAgo(lastSync.last_sync_at)}
                    </div>
                )}
                {/*
                  * `Recently done: a · b · c` used to be here — the last five titles joined by dots, in
                  * grey, at the bottom of the page. That was the entire completion surface, and the owner's
                  * complaint was accurate: no count, no dates, no history, nothing cumulative, and no hint
                  * of what any of it achieved. It is the record above now, and this footer is back to being
                  * only diagnostics: freshness and the last note.
                  */}
                {/*
                  * THE LAST NOTE, AND WHETHER ANYTHING HAS COME FOR IT — as a control, not a readout.
                  *
                  * This was a dead grey line: the note truncated to 120 characters, no date, no reach, and no
                  * way to see the one before it. It was also the entire outbound channel's presence on the
                  * page, for a hub whose brief named easing communication with the agents as one of its two
                  * goals. RESEARCH §14's rule — if pressing it does nothing it does not go on the page — had
                  * been applied to every figure in the record and never to this.
                  *
                  * The uncollected case is what earns it a place in the footer at all: the footer is where
                  * freshness lives, and "you wrote something and nothing has been round since" is exactly a
                  * freshness fact. It is in --ask, the same colour as the stale-sync warning, because it has
                  * the same meaning: what is on this page may not have reached anyone yet.
                  */}
                {notes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        {/*
                          * THE PREVIEW IS INSIDE THE BUTTON, and `npm run audit` is why.
                          *
                          * It was a `<div>` under the control, clipped to one line, and the audit printed it as
                          * a finding on the first run after it shipped: "TRUNCATED WITH NO WAY TO THE FULL TEXT
                          * — pane/saidpeek (122 chars, not openable)". Which was correct. My defence was that
                          * the full text is one press away on the control ABOVE it, and that is an argument, not
                          * a structure — the same shape of reasoning that produced titles cropped at 38% in the
                          * record, which he found in twenty seconds.
                          *
                          * Inside the button, the clipped text IS part of the thing that opens the whole text.
                          * `aria-label` keeps the accessible name to the action, so a screen reader is not read
                          * 120 characters of preview before being told what pressing it does.
                          */}
                        <button
                            className="quiet saidlink"
                            data-measure="said-entry"
                            aria-label={uncollected
                                ? 'Show what you have told the agents. Your last note has not been collected.'
                                : 'Show what you have told the agents.'}
                            onClick={() => onShowSaid()}
                        >
                            {/*
                              * "AFTER THE LAST SYNC", not "no agent has synced since", and the wording is a
                              * fix rather than a preference.
                              *
                              * The line directly above this one says "Last agent sync: fixture, just now".
                              * Put "no agent has synced since" underneath that and the two read as
                              * contradicting each other — both are true, because the note was written after
                              * that sync, but a reader has to reconstruct the ordering to see it. One figure
                              * appearing to disagree with another is the trust gap in miniature, and it is
                              * the specific defect the per-project open counts were already fixed for.
                              *
                              * Naming the ordering makes the pair coherent: something synced just now, and
                              * what you wrote came after it.
                              */}
                            <span className={`saidwhat${uncollected ? ' waiting' : ''}`}>
                                {uncollected
                                    ? 'Your last note came after that — nothing has collected it yet →'
                                    : 'What you have told the agents →'}
                            </span>
                            {uncollected && <span className="saidpeek">“{notes[0].body}”</span>}
                        </button>
                    </div>
                )}
                {/*
                  * In the footer rather than the header: onboarding a project is a once-per-project
                  * errand, and putting it at the top would compete with the thing you actually opened the
                  * hub for.
                  */}
                {/*
                  * THE WAY IN TO THE UNLOCKS, and it names the one that is on.
                  *
                  * In the footer beside /setup because both are errands rather than the reason he opened the hub,
                  * and because naming the active palette here means the footer answers "which look is this?"
                  * without a second source of truth — the value comes from the same server-side resolution that
                  * emitted the stylesheet.
                  *
                  * It says how many are unlocked rather than teasing how many are not. A count of what he cannot
                  * have would be the page selling itself, and the perk list already states every requirement
                  * honestly when he gets there.
                  */}
                {/*
                  * THE TWO NAVIGATION LINKS THAT WERE HERE ARE GONE, and this is where they were wrong.
                  *
                  * `/looks` and `/setup` were `.navlink` text links at the bottom of the reading pane's footer —
                  * below the record, below the compose box, below the project list, inside a column that
                  * scrolls. For `/setup` in particular that is the worst possible placement: it is the FIRST
                  * thing a new person needs and it was the hardest thing on the hub to find.
                  *
                  * They are destinations in the nav bar now. What stays here is the one thing that is genuinely
                  * a fact about freshness rather than a place to go: which look is on. That belongs to the
                  * footer's job, and it is a statement rather than a control, so it does not need to be one —
                  * the nav bar above is the route.
                  */}
                {/*
                  * LABELLED, because three words in capitals with nothing in front of them is a riddle.
                  *
                  * It rendered as `GRAPHITE · PLAIN · FLAT` at the foot of the column, and there is no way to work
                  * out from that what it is telling you — it could be a status, a version, three project names. It
                  * is the palette, the crest finish and the page surface currently in force, which is a fact worth
                  * stating and was being stated in a code nobody had been given.
                  */}
                <p className="footlook">
                    <span className="footlooklabel">Looks in use:</span>{' '}
                    {looks.palette} · {looks.crest} · {looks.surface}
                </p>
            </footer>
        </div>
    );
}
