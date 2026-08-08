import type { Question, Task } from './types';

/**
 * What has actually been finished, the standing that follows from it, and the marks earned along the way.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE:
 *
 *   NOTHING HERE IS STORED. EVERY FIGURE IS DERIVED FROM THE ROWS, EVERY TIME.
 *
 * There is no `xp` column, no `level` column, no `achievements` table, and there must never be one. A stored
 * score can disagree with the tasks table, and then the hub has two truths — which is `writeVerified`'s bug
 * (lib/db.ts) wearing a nicer costume. A badge awarded for something the human did not do is the same class
 * of lie as an app saying "saved" over a rejected write, and this project exists because that lie cost real
 * data.
 *
 * The practical consequence is the important one: **re-opening a task takes the credit back for free.**
 * `setTaskStatus` clears `done_at` on re-open, so the row simply stops matching every query below — it
 * leaves the count, the list, the points, the level AND any mark that depended on it, with no decrement
 * logic anywhere. There is no code that has to remember to subtract, so there is no code that can forget.
 *
 * WHY NOT THE EVENTS TABLE, which is the obvious source
 *
 * `events` looks perfect for this: append-only, monotonic `seq`, carries `at`, and `task.done` is one of
 * its kinds. It is wrong twice, and both are fatal (docs/RESEARCH.md §17):
 *
 *   1. Append-only means credit can NEVER be taken back. A task completed, re-opened and left open keeps
 *      its `task.done` row forever, so any figure derived from events counts work that is not done. That is
 *      precisely the forbidden lie, arriving by picking the most natural-looking table.
 *   2. It is not a record anyway. Measured on 30 July 2026: 31 rows spanning 35 seconds, with `seq`
 *      starting at 612 — roughly 611 rows destroyed by early proof runs.
 *
 * So: `tasks.done_at` and `questions.answered_at`. Nothing else.
 *
 * WHY THERE ARE POINTS AND LEVELS HERE AT ALL, given docs/RESEARCH.md §19 argues against them
 *
 * Because the owner asked for them twice, explicitly, after reading the evidence. §19 still stands and is
 * worth reading before touching this: Deci/Koestner/Ryan's 128 experiments on completion-contingent rewards,
 * Hanus & Fox measuring badges-plus-leaderboard over sixteen weeks and watching motivation fall, Kivetz on
 * the drop in effort after every threshold. That is recorded, he has heard it, and it is his tool.
 *
 * What is NOT negotiable is that the score is true. Which produced one rule the obvious implementation gets
 * wrong, and it is the most important thing in this file after "nothing is stored":
 *
 *   **POINTS MAY ONLY DEPEND ON WHAT HE DID. NEVER ON WHAT AN AGENT DID.**
 *
 * The tempting entries are "cleared a project" and "the whole hub reached zero", because they feel like
 * achievements. They are not scorable: both depend on how many tasks are currently OPEN, so an agent filing
 * one new task in the morning would silently delete the bonus and drop his level — punishing him for
 * somebody else's write. A score that can fall while he sleeps is a score he would be right to stop
 * believing. So those two are MARKS (statements about a moment that happened) and never points.
 *
 * Every point is also itemised in `Standing.credits`, so the whole score can be checked by hand against the
 * page. An opaque number would be asking for trust that this codebase is not in the business of asking for.
 */

/* ------------------------------------------------------------------------------------------------
 * What a finished thing looks like
 * ---------------------------------------------------------------------------------------------- */

export interface FinishedTask {
    id: string;
    project: string;
    /** Null for a completion older than `RECORD_WINDOW` — see `FinishedRow.title` and `expandHistory`. */
    title: string | null;
    /**
     * The asking agent's own sentence about what becomes true. Quoted, never parsed.
     *
     * The brief describes an `unblocks` field. There is no such field — it never existed in the schema,
     * the types or the API (docs/RESEARCH.md §24). `why` is free prose that SOMETIMES contains a number:
     * "Unblocks 2,849 pins." Extracting that 2,849 to render as a figure would be manufacturing a
     * statistic, and it would be wrong the first time an agent writes "Unblocks the Pinterest queue".
     *
     * So it is displayed verbatim. That makes it true by construction, and it is also the higher-value
     * thing: Grant (2008) measured +142% persistence and +171% output from ten minutes of knowing what the
     * work was for. Nothing computed competes with the sentence somebody already wrote.
     */
    why: string | null;
    minutes: number | null;
    steps: number;
    created_at: string;
    done_at: string;
    /** The human's reply to the agent, for a row inside the window. Null beyond it — count with `noted`. */
    note: string | null;
    /** WHETHER he replied. What the points and the `voice` marks read; see `FinishedRow.noted`. */
    noted: boolean;
}

export interface DecisionMade {
    id: string;
    project: string;
    title: string;
    /** The label of what was chosen, or the text typed, or "approved". Never an option key. */
    chose: string;
    /** A condition attached to the answer. As much a part of the decision as the choice. */
    note: string | null;
    answered_at: string;
    /** How long the agent was blocked. Null when the question predates a known asked-at. */
    minutesBlocked: number | null;
    /** True when it was answered before its stated deadline, so no default was needed. */
    beatDeadline: boolean;
    /**
     * WHAT HE TURNED DOWN. The options that were not chosen, in the order the agent sent them.
     *
     * The record showed the choice and not the alternatives, which makes a decision look like a fact rather than
     * a judgement — and it is the judgement that is worth keeping. "You chose: reuse product-images" says what
     * happened; "over: a catalogue bucket, the CDN, holding the import" is the only thing that says it was a
     * decision at all, and it is the part he would need if an agent ever asks why.
     *
     * Labels rather than keys, because a key is an implementation detail the agent chose and a label is the
     * sentence he read. Empty for an `accept` or a typed answer, where there was nothing else on offer.
     *
     * It costs nothing to send: `answeredQuestions` already carries every option — the narrowing that shrank the
     * page payload was on completed TASKS (`FinishedRow`), where the weight was in `steps`. A question's options
     * are a handful of short strings and they are already in the array this folds over.
     */
    rejected: string[];
}

export interface ProjectProgress {
    slug: string;
    open: number;
    done: number;
    /**
     * DECISIONS HE ANSWERED IN THIS PROJECT, and its absence made a whole project look empty.
     *
     * This counted tasks and nothing else, so a project where he had only ever answered a DECISION had no figure
     * to show — its chip in the Projects list rendered as a bare name beside siblings reading "9 open" and
     * "2 open", which reads as a number that failed to render rather than as a fact.
     *
     * That is not a styling problem, it is the hub contradicting its own thesis. `AGENTS.md`: *"Agents file two
     * things and nothing else: tasks and questions."* A decision is equal-status work — it scores points
     * (`POINTS.decision`), it is half of what the hub exists for, and until this field existed the per-project
     * view could not see it at all.
     *
     * Found on the `--live` fixture, which is production's real shape. Invisible on the default fixture, where
     * every project is given open tasks, so this state could never render.
     */
    decided: number;
}

/** A moment at which something was completely clear, reconstructed from the rows. See `clearMoments`. */
export interface ClearMoment {
    /** A project slug, or null for the whole hub. */
    scope: string | null;
    at: string;
}

export interface ProgressSnapshot {
    tasksDone: number;
    decisionsMade: number;
    /** Sum of `minutes` over finished tasks. AN AGENT'S ESTIMATE, NOT A MEASUREMENT. Label it. */
    minutesEstimated: number;
    /** `min(done_at)`. The honest age of the record — the surface states this rather than implying more. */
    firstDoneAt: string | null;
    lastDoneAt: string | null;
    projectsFinishedIn: number;
    openTasks: number;
    openQuestions: number;
    perProject: ProjectProgress[];
    /** Newest first. */
    finished: FinishedTask[];
    /** Newest first. */
    decisions: DecisionMade[];
    /** Projects with at least one completion and nothing left open RIGHT NOW. */
    cleared: string[];
    /** Every moment a project — or the whole hub — was completely clear. Historical, so it survives new work. */
    clearMoments: ClearMoment[];
    mostStepsFinished: number;
    fastestUnblock: DecisionMade | null;
    /** Finished tasks he wrote a note back on. Telling the agent something is doing it well. */
    notesLeft: number;
    decisionsBeforeDeadline: number;
    decisionsUnderAnHour: number;
    /** Distinct calendar weeks containing a completion. NOT consecutive — see the `weeks-*` marks. */
    weeksActive: number;
    /** A completion that followed a gap of a week or more. The opposite of a streak, deliberately. */
    comebacks: { at: string; days: number }[];
}

/**
 * A finished task AS IT ARRIVES FROM THE DATABASE — only the columns anything here actually reads.
 *
 * WHY THIS IS NARROWER THAN `Task`, WHICH IS A PAYLOAD FIX AND NOT A TIDY-UP
 *
 * `board()` used to select `*` for every completed task and hand the whole array to a client component, which
 * means every completed row is serialised into every page load, forever. The rest is `steps`, `verify` and
 * `gotchas` — and `steps` is the one that grows, because a real task carries nine to nineteen of them with prose
 * in each.
 *
 * Measured, not estimated. Against the fixture, 579 bytes per completion becomes 345 — **40%**:
 *
 * | completions | before | after |
 * |---|---|---|
 * | 100 | 57 KB | 34 KB |
 * | 300 | 170 KB | 101 KB |
 * | 900 | **509 KB** | 303 KB |
 *
 * 40% is the floor, and it is the fixture's floor because its completed tasks average two steps. The saving is a
 * function of how step-heavy a task is: the fixture's 19-step task carries **2,097 bytes of steps** and 96 of
 * `verify`, so narrowed it costs 345 bytes instead of ~2,538 — **86%**. Real tasks look like that one; his
 * production hub holds tasks of 9 and 11 steps.
 *
 * What is NOT saved is `why`, which is the largest column at ~100 bytes a row and is kept deliberately: it is
 * the sentence the record exists to show, and RESEARCH §20 is why.
 *
 * `stepCount` rather than `steps`: the only thing read off the steps is how many there are (the `depth` marks
 * and `mostStepsFinished`). Sending nineteen step objects to compute the number nineteen is the whole problem in
 * miniature.
 *
 * `status` is here because `clearMoments` needs it — a task an agent withdrew was never outstanding work.
 *
 * ==================================================================================================
 * AND NARROWING TURNED OUT NOT TO BE ENOUGH, WHICH IS WHY THIS ROW IS NOW A WINDOW
 * ==================================================================================================
 *
 * The paragraph above used to end *"the list itself is NOT capped and must never be… the fix is narrowing the
 * row, not shortening the list"*. That was measured against the fixture and it was wrong at scale, and the
 * arithmetic is worth keeping because it is the reason `History` below exists:
 *
 * | at two years (2,199 completions, 1,462 answered decisions) | JSON |
 * |---|---|
 * | completions as they shipped                                | 776 KB |
 * | completions narrowed to this row                            | 384 KB |
 * | completions narrowed AND stripped of `id`                   | 305 KB |
 * | answered decisions as they shipped                          | **1,291 KB** |
 * | answered decisions narrowed to what the derivation reads    | 204 KB |
 *
 * So the most aggressive narrowing that keeps a readable row still ships **509 KB of history** — most of the
 * 600 KB uncompressed budget check L8 measures, and still growing linearly, which fails goal 3 of
 * `docs/ROADMAP.md` outright ("no payload cliff, no page that grows without a ceiling"). Narrowing bought a
 * factor of four and the problem needs a factor of twenty.
 *
 * The other half of that measurement was a surprise: the answered DECISIONS were 62% of the payload, not the
 * completions. Nobody had looked, because `FinishedRow` had already narrowed the completions once and that
 * made them the obvious suspect.
 */
/**
 * HOW MANY COMPLETIONS AND DECISIONS SHIP WITH THEIR PROSE. Everything older ships as numbers only.
 *
 * See `History` below for the measurement that forced this and for what the numbers-only rows preserve.
 * Sixty because that is what the payload can afford and rather more than anyone browses: at his own
 * measured rate it is three weeks of completions, grouped by project it is already a long page, and
 * anything older is one keystroke away in the palette — which since this session searches the DATABASE
 * rather than the payload, and therefore does not shrink when this number does.
 *
 * Exported because `tests/use-it.mjs` plants a record deeper than the window to check exactly that. A
 * check that hard-coded 60 would go green the day somebody changed the constant.
 */
export const RECORD_WINDOW = 60;

export interface FinishedRow {
    id: string;
    project: string;
    /**
     * Null for a completion older than the window — see `History`.
     *
     * Nullable rather than an empty string, because "there is no title here" and "the title is blank" are
     * different facts and only one of them is true. Everything that renders a title renders a WINDOWED row,
     * so the null branch is reached only by the mark details, which return null rather than inventing a
     * sentence. `expandHistory` is where the two kinds meet.
     */
    title: string | null;
    why: string | null;
    minutes: number | null;
    /** How many steps it had. Not the steps. */
    stepCount: number;
    status: Task['status'];
    /** The text of his note, for a row inside the window. Null beyond it — count with `noted`. */
    note: string | null;
    /**
     * WHETHER he left a note, which is the only thing the derivation needs to know about one.
     *
     * Separate from `note` because a row outside the window carries no text and the note is worth POINTS:
     * `notesLeft`, the `voice` marks and `rankLedger` all read this, and reading `note !== null` instead
     * would have silently stopped paying for every note older than the window. That is the shape of defect
     * this whole session is about — a change that satisfies every check while quietly removing something.
     */
    noted: boolean;
    created_at: string;
    done_at: string | null;
}

/**
 * The same shape, built from a full `Task` — for the one place that has one.
 *
 * Ticking a task off puts the row the SERVER read back into the record, so the figure moves on confirmation
 * rather than on reload (`onDone` in app/components/Board.tsx). That row is a whole `Task`, because the act
 * endpoint returns what it wrote; this narrows it to what `board()` sends, so the client's record holds one kind
 * of thing and not two. It is still the server's row — nothing is assembled locally, so the write stays
 * confirmed rather than optimistic.
 *
 * WHY IT LIVES HERE AND NOT IN lib/store.ts, WHICH IS WHERE I PUT IT FIRST
 *
 * `Board.tsx` is a client component. It imported `BoardState` from lib/store with `import type`, which TypeScript
 * erases — so nothing of that module reached the browser. Adding a VALUE import pulled the whole of lib/store in,
 * and with it lib/db and the Neon driver. The page stopped hydrating: all twelve checks in `prove:use` failed at
 * once, every one of them reporting "timed out waiting for" the hydration predicate rather than anything about
 * the record.
 *
 * lib/progress.ts imports nothing but `./types`, which is what makes it safe for both sides. A pure function is
 * the right home for this anyway; the lesson is narrower and worth writing down: in a client component, a value
 * import from a server module is a database driver in the browser bundle, and `import type` hides that until the
 * day somebody needs a function from the same file.
 */
export function finishedRowOf(t: Task): FinishedRow {
    return {
        id: t.id, project: t.project, title: t.title, why: t.why, minutes: t.minutes,
        stepCount: t.steps.length, status: t.status, note: t.note,
        noted: t.note != null && t.note.trim() !== '',
        created_at: t.created_at, done_at: t.done_at,
    };
}

/* ------------------------------------------------------------------------------------------------
 * The history the derivation needs, in the smallest honest form
 * ---------------------------------------------------------------------------------------------- */

/**
 * ONE FINISHED TASK, AS THE SIX NUMBERS THE DERIVATION READS.
 *
 * `[project index, minutes, steps, noted, created, done]`, with the timestamps as epoch SECONDS and the
 * project as an index into `History.projects`.
 *
 * WHY A TUPLE, WHICH IS THE ONE PIECE OF CLEVERNESS IN THIS FILE AND HAD TO EARN ITS PLACE
 *
 * The measurement is in the comment above `FinishedRow`: the narrowest readable OBJECT still costs 140 bytes
 * a row at two years, and 60% of that is the key names, repeated once per row. `"created_at":` alone is 14
 * bytes × 2,199 rows = 31 KB of the payload spent saying "created_at" over and over. A tuple pays for the
 * names once, in this comment, and costs a measured **34 bytes a row** — the difference between 509 KB of
 * history and 117 KB, and between a page that grows without a ceiling and one that does not.
 *
 * WHAT MAKES IT SAFE RATHER THAN MERELY SMALL: there is exactly one reader (`expandHistory`, below) and one
 * writer (`board()` in lib/store.ts), the expansion produces the same `FinishedRow` the rest of the file
 * already consumes, and two checks hold it from outside: **P2** in tests/measure-layout.mjs asserts the
 * figure on the page equals `count(*)`, and **S1** in tests/use-it.mjs loads a record deeper than the window
 * and asserts the SCORE still equals what SQL adds up to — which cannot be true if a row was dropped, two
 * were swapped, or the note bit was lost. Nothing downstream knows this encoding exists.
 *
 * WHAT IS DELIBERATELY NOT IN IT: `title`, `why` and the text of `note`. Those are display-only, they are the
 * expensive columns, and they arrive for the most recent `RECORD_WINDOW` rows in `doneTasks`.
 */
export type FinishedTuple = readonly [
    project: number, minutes: number, steps: number, noted: 0 | 1, created: number, done: number,
];

/**
 * ONE ANSWERED DECISION, AS FOUR NUMBERS: `[project index, created, answered, deadline]`.
 *
 * `deadline` is 0 for "there wasn't one". Kept as the real timestamp rather than pre-computing
 * `beatDeadline`, so `derive` applies its own rule to real data instead of trusting a boolean somebody else
 * computed — the same reason the SQL narrows `answeredQuestions` for cost and the filter in `derive` narrows
 * it again for correctness.
 *
 * Everything else a decision carries — the title, the options, what he chose, his comment — is display-only
 * and arrives for the most recent `RECORD_WINDOW` in `answeredQuestions`. That is the 1,291 KB.
 */
export type DecisionTuple = readonly [
    project: number, created: number, answered: number, deadline: number,
];

/** Every finished task and every answered decision, in `done_at` / `answered_at` descending order. */
export interface History {
    /** The project slugs, once each. The tuples hold indexes into this. */
    projects: string[];
    tasks: FinishedTuple[];
    decisions: DecisionTuple[];
}

const isoOf = (seconds: number): string => new Date(seconds * 1000).toISOString();

/**
 * PUT THE PROSE BACK ON THE ROWS THAT HAVE IT, AND HAND THE DERIVATION ITS WHOLE HISTORY.
 *
 * The window rows and the tuples come from two queries with the same `WHERE` and the same deterministic
 * `ORDER BY`, so position N of the window is position N of the tuples. That correspondence is the one thing
 * this function assumes, and it is asserted rather than trusted: **S1** in tests/use-it.mjs recomputes the
 * whole score from SQL over a record 93 completions deep, and `board()` carries the comment explaining why
 * both queries must keep the same tiebreak.
 *
 * The result is exactly what `derive` has always taken. Every figure, every mark, every level and the whole
 * time machine keep reading the complete record; what changed is that most of it arrived as numbers.
 */
export function expandHistory(
    history: History, windowTasks: FinishedRow[], windowQuestions: Question[],
): { doneTasks: FinishedRow[]; answeredQuestions: Question[] } {
    const doneTasks = history.tasks.map((t, i): FinishedRow => {
        const shown = windowTasks[i];
        return {
            /* The real id for a windowed row, so re-opening one still addresses the right task. A synthetic
             * one beyond the window, which nothing addresses — it is a React key for a row never rendered. */
            id: shown?.id ?? `hist-t-${i}`,
            project: history.projects[t[0]] ?? '',
            title: shown?.title ?? null,
            why: shown?.why ?? null,
            minutes: t[1] === 0 ? null : t[1],
            stepCount: t[2],
            status: 'done',
            note: shown?.note ?? null,
            noted: t[3] === 1,
            created_at: isoOf(t[4]),
            done_at: isoOf(t[5]),
        };
    });

    const answeredQuestions = history.decisions.map((d, i): Question => {
        const shown = windowQuestions[i];
        return {
            id: shown?.id ?? `hist-q-${i}`,
            project: history.projects[d[0]] ?? '',
            key: shown?.key ?? null,
            /* Empty rather than null: `Question.title` is `string` across the whole codebase and widening it
             * would ripple into the agent contract for the sake of rows nothing renders. The record's list
             * shows the windowed ones and says how many it is showing. */
            title: shown?.title ?? '',
            context: shown?.context ?? null,
            options: shown?.options ?? [],
            allow: shown?.allow ?? ['choose'],
            default_option: shown?.default_option ?? null,
            deadline: d[3] === 0 ? null : isoOf(d[3]),
            status: 'answered',
            answer_type: shown?.answer_type ?? 'choose',
            answer_option: shown?.answer_option ?? null,
            answer_text: shown?.answer_text ?? null,
            answer_note: shown?.answer_note ?? null,
            answered_at: isoOf(d[2]),
            asked_by: shown?.asked_by ?? null,
            created_at: isoOf(d[1]),
            updated_at: isoOf(d[2]),
        };
    });

    return { doneTasks, answeredQuestions };
}

/**
 * THE SNAPSHOT OVER THE WHOLE RECORD, FROM ONE `board()` STATE — the only correct way to derive on a server.
 *
 * This exists because the same three lines were written out at three call sites and **two of them were wrong**.
 * `board()` returns `doneTasks` and `answeredQuestions` as a WINDOW of the most recent `RECORD_WINDOW`
 * (§XXVI); deriving straight from those gives a level computed from the last sixty completions. `app/page.tsx`
 * was given `expandHistory` when the window shipped and `app/looks/page.tsx` and the `look.choose` branch of
 * `app/api/ui/act/route.ts` were missed, so at two years of volume the hub said **level 32** and `/looks` said
 * **level 8** — two pages of one hub, seconds apart, disagreeing by 24 levels.
 *
 * The consequence was worse than a wrong readout: `resolveLooks` reduces a chosen look to what the standing it
 * is handed says has been earned, so `/looks` would render a look he is legitimately using as LOCKED, and
 * `look.choose` would refuse to let him pick one he had earned. A perk economy whose rule is *"an unlock never
 * applies itself"* would have started un-applying them.
 *
 * So there is one function now, and the way to derive from a `board()` state is to call it. `Board` still calls
 * `expandHistory` itself and for a reason that is not an exception: its `doneTasks` are STATE, changing on every
 * tick, so it needs the expanded rows rather than a snapshot taken once.
 *
 * Structurally typed rather than importing `BoardState`, because a value import between two `lib/*.ts` files
 * breaks the test suites (AGENTS.md trap 2) and this file is imported by `lib/store.ts` already.
 */
export function deriveWholeRecord(state: {
    history: History;
    doneTasks: FinishedRow[];
    answeredQuestions: Question[];
    tasks: Task[];
    questions: Question[];
}): ProgressSnapshot {
    const full = expandHistory(state.history, state.doneTasks, state.answeredQuestions);
    return derive({
        doneTasks: full.doneTasks,
        answeredQuestions: full.answeredQuestions,
        openTasks: state.tasks,
        openQuestions: state.questions,
    });
}

/* ------------------------------------------------------------------------------------------------
 * The outbound half: has anything actually picked up what he said?
 * ---------------------------------------------------------------------------------------------- */

/** One agent that has synced since a note was written, and how long after it. */
export interface Reach {
    name: string;
    /** When it synced. */
    at: string;
    /** Minutes between the note being written and that sync. Never negative — see `noteReach`. */
    afterMinutes: number;
}

/**
 * Which agents have synced since he wrote this, and — carefully — what that does and does not prove.
 *
 * THE PROBLEM THIS ANSWERS. Writing a note returns *"Saved — the next riff-kitchen agent will read it"*: a
 * promise about the future, in a codebase where nothing is allowed to report success until it has been re-read.
 * He was told an agent **would** read it and then never told whether one **did**, and the one truncated line
 * in the footer said only what he had typed. The brief called this half of the loop the under-served one.
 *
 * WHY THIS IS A STATEMENT ABOUT SYNCS AND NOT ABOUT READING, which is the whole design decision:
 *
 * A note reaches an agent through the event log, and `syncFor` returns `project is null` events to every
 * caller — so for an UNSCOPED note (the default when he writes without choosing a project) an agent that
 * synced afterwards was genuinely handed it. For a project-scoped note, an agent scoped to a different
 * project has its events filtered and never sees it, and nothing records what scope a sync used. So
 * "delivered" would be a guess in that case.
 *
 * The interface therefore says what the data proves — *"claude-code synced 4m later"* — and never the word
 * read. It could have been made exactly provable by storing the scope, or by writing a delivery event per
 * note per agent; both were rejected because the honest version needs NO new column, NO new event kind and
 * NO migration against a production database whose URL only Vercel holds. The smallest thing that is exactly
 * true beat the bigger thing that would have been more precisely true.
 *
 * AND THE USEFUL ANSWER IS THE EMPTY ONE. An empty array means nothing has synced at all since he wrote it,
 * which is the case he can act on — that is the note nobody has collected, and the interface says so in those
 * words rather than staying quiet.
 *
 * `afterMinutes` is clamped at 0: an agent's `last_sync_at` is its most recent sync, so it is always at or
 * after the note by construction here, but clock skew between the database and a serverless region could
 * produce a small negative and "synced -1m later" is nonsense on a page whose job is to be trusted.
 */
/**
 * WHICH KIND OF EMPTY AN EMPTY HUB IS. Three states, and conflating them told a new person something untrue.
 *
 * The empty queue said, unconditionally: *"Nothing needs you. No decisions blocked, no tasks waiting. You will get
 * a Telegram message when that changes."* On a hub that has been used, every word is true and it is the best screen
 * this thing has — hard constraint 6 is that an empty queue is SUCCESS. **On a brand-new hub it is false**: nothing
 * is waiting because nothing is connected, and no message is ever coming because there is no agent to send one.
 *
 *   `unstarted`  nothing has ever synced and nothing has ever been finished. Nothing is connected.
 *   `connected`  an agent has synced, but no work has arrived yet. The promise about Telegram is now credible,
 *                and naming the agent is the evidence for it.
 *   `earned`     work has happened and the queue is at zero. The original copy, always right for this one.
 *
 * `connected` is not a hair-split. It is the state immediately after setup, because `cc sync` is the first thing an
 * agent does and it happens before anything is filed — without it, someone who had just wired everything up
 * correctly would be told nothing was connected.
 *
 * A PURE FUNCTION IN `lib/` RATHER THAN A TERNARY IN THE COMPONENT, for the reason `emblemGeometry` and
 * `lib/charges.ts` are: a classification that decides which of three things a person is told is worth asserting,
 * and `tests/ladder.mjs` cannot import a `.tsx`. Check **E3** walks all eight combinations of the three inputs.
 *
 * WORK COUNTS BEFORE CONNECTION, deliberately. A hub with finished work and no agent row is `earned`, not
 * `unstarted` — the work happened, so the screen that celebrates it is the honest one, and the separate stale-sync
 * warning is what says nothing is collecting the answers. Reversing that would hide his record behind a setup
 * prompt for something he has plainly already set up.
 */
export function emptinessOf(
    input: { tasksDone: number; decisionsMade: number; everSynced: boolean },
): 'unstarted' | 'connected' | 'earned' {
    if (input.tasksDone > 0 || input.decisionsMade > 0) return 'earned';
    return input.everSynced ? 'connected' : 'unstarted';
}

export function noteReach(
    noteAt: string,
    agents: { name: string; last_sync_at: string | null }[],
): Reach[] {
    const written = new Date(noteAt).getTime();
    return agents
        .filter(a => a.last_sync_at && new Date(a.last_sync_at).getTime() > written)
        .map(a => ({
            name: a.name,
            at: a.last_sync_at!,
            afterMinutes: Math.max(0, Math.round((new Date(a.last_sync_at!).getTime() - written) / 60_000)),
        }))
        .sort((x, y) => x.afterMinutes - y.afterMinutes);
}

/* ------------------------------------------------------------------------------------------------
 * The derivation
 * ---------------------------------------------------------------------------------------------- */

const DAY = 86_400_000;

const minutesBetween = (from: string, to: string): number =>
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);

/** UTC year-week key. UTC for the same reason `humanDate` is: determinism over local prettiness. */
function weekKey(iso: string): string {
    const d = new Date(iso);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    // Thursday-of-week trick: ISO weeks are defined by the Thursday they contain.
    const thu = t + (3 - ((new Date(t).getUTCDay() + 6) % 7)) * DAY;
    const jan1 = Date.UTC(new Date(thu).getUTCFullYear(), 0, 1);
    const week = 1 + Math.round((thu - jan1) / (7 * DAY));
    return `${new Date(thu).getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

/**
 * Every moment at which a scope held no outstanding work, reconstructed from the rows alone.
 *
 * WHY THIS IS NOT JUST "nothing is open right now"
 *
 * The naive version asks whether the open count is currently zero. That makes "cleared harbour-lights" a
 * claim that EVAPORATES the moment an agent files one new task — so a mark he genuinely earned on Tuesday
 * disappears on Wednesday because somebody else wrote a row. The screen would be telling him that something
 * which happened did not happen, which is the same lie as claiming something that did not.
 *
 * So it is reconstructed historically. A scope was clear at moment M if every task created before M had been
 * done before M, and every question asked before M had been answered before M. The candidate moments are the
 * completions themselves, because a scope can only BECOME clear when something is finished.
 *
 * The nice property, and the reason this is the honest version: it is still fully reversible. Re-open a task
 * and its `done_at` is null, so at that moment it was not done, so the clear moment it produced ceases to
 * exist. History is derived, not stored, exactly like everything else here.
 *
 * ==================================================================================================
 * IT IS A SWEEP NOW, AND THIS ONE STOPPED BEING THEORETICAL
 * ==================================================================================================
 *
 * The previous version tested every candidate moment against every row, which is O(n²) per scope, and the
 * comment above it said *"if the hub ever holds thousands, sort and sweep instead"*. That day arrived from an
 * unexpected direction: the crest bench builds a synthetic history for level 121, which the ladder prices at
 * roughly 73,000 finished tasks, and the page did not render at all — it hung. Five billion comparisons.
 *
 * The bench is not the reason to fix it. **Production is.** This is called from `derive`, which runs on every
 * page load and, in the browser, on every tick and every keystroke in the note box. He asked *"what will
 * happen on day 300?"*, and this was one of the places the honest answer was "it gets slow and nobody notices
 * until it is unusable".
 *
 * MEASURED, at fifteen projects — and the measurement corrected the estimate this comment first carried, which
 * claimed ~400 million comparisons and a thousandfold speedup. Both were wrong: the old version's `.some()`
 * short-circuits, so the real constant is much smaller than the worst case. The actual figures:
 *
 *   | completions | sweep | the old O(n²) |
 *   |-------------|-------|---------------|
 *   | 1,000       |  13ms |          31ms |
 *   | 5,000       |  18ms |         522ms |
 *   | 10,000      |  29ms |       1,756ms |
 *   | 20,000      |  53ms |      10,028ms |
 *
 * So at the fixture's volumes the two are indistinguishable, which is why nothing ever noticed; at one year of
 * fifteen projects filing daily it is 29x; and the curve is unmistakably quadratic against a linear one. Half a
 * second of main-thread work on every keystroke is already a broken text box, and ten seconds at year two is a
 * hub that does not open. Check X8 in tests/ladder.mjs holds the budget and X8-inj proves the old
 * implementation could not meet it.
 *
 * HOW IT WORKS, and why the semantics are identical rather than approximately so:
 *
 * Candidate moments are the completions, in ascending order. Walk them, and maintain — over items whose
 * `created_at` is strictly before the current moment — two running values:
 *
 *   - `unfinished`: how many have no completion time at all. This can only GROW, and that is not a shortcut,
 *     it is the semantics: an item that is still open was outstanding at every moment after it was created,
 *     so once one exists no later moment can be clear.
 *   - `maxDone`: the latest completion time among the rest. The scope was clear at M exactly when everything
 *     created before M had finished by M, which is `maxDone <= M`.
 *
 * ISO-8601 strings compare lexicographically in chronological order, which is why this needs no date parsing
 * — the same property `sort()` is already relying on everywhere else in this file.
 *
 * `existedBy` keeps its own pointers because it counts `created_at <= at` while the outstanding test uses
 * `< at`. Collapsing those two into one pointer is the obvious tidy-up and it is wrong: it would make the
 * very first completion in a scope's life count as the item that "existed by" that moment AND as the thing
 * that had to have finished before it, which is the case the floor of two exists to exclude.
 *
 * `tests/ladder.mjs` check T7 runs a naive reference implementation of the original O(n²) rule beside this one
 * over constructed histories and asserts they agree, so the optimisation is verified rather than argued.
 */
function clearMoments(
    /*
     * The minimum a task has to carry for this to be answerable, rather than a whole `Task`.
     *
     * Called with the finished rows AND the open ones mixed together, and the finished ones are `FinishedRow`
     * now — narrower, because sending every step of every completed task to the browser to compute a count is
     * what made the page payload grow without a ceiling. Narrowing the parameter is what lets both kinds in.
     */
    tasks: { project: string; status: Task['status']; created_at: string; done_at: string | null }[],
    questions: { project: string; created_at: string; answered_at: string | null }[],
): ClearMoment[] {
    const out: ClearMoment[] = [];
    const scopes: (string | null)[] = [null, ...new Set(tasks.map(t => t.project))];

    for (const scope of scopes) {
        const ts = scope === null ? tasks : tasks.filter(t => t.project === scope);
        const qs = scope === null ? questions : questions.filter(q => q.project === scope);
        // Dropped tasks were withdrawn by an agent; they were never outstanding work for him.
        const live = ts.filter(t => t.status !== 'dropped');
        const candidates = [...new Set(live.filter(t => t.done_at).map(t => t.done_at!))].sort();
        if (!candidates.length) continue;

        /*
         * Both lists by creation time, which is the order the sweep consumes them in. A question resolved by
         * its timed default was still RESOLVED — the agent was not left waiting — so `answered_at` is what
         * closes it whether he tapped it or the deadline did. Whether HE made that decision is a different
         * question, and it is answered in `decisions`.
         */
        const byCreated = [...live].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const qByCreated = [...qs].sort((a, b) => a.created_at.localeCompare(b.created_at));

        let ti = 0, qi = 0;         // pointers for the outstanding test: created_at STRICTLY before `at`
        let te = 0, qe = 0;         // pointers for `existedBy`: created_at at or before `at`
        let unfinished = 0;
        let maxDone = '';           // '' sorts before every ISO timestamp, so an empty scope is trivially clear

        for (const at of candidates) {
            while (ti < byCreated.length && byCreated[ti]!.created_at < at) {
                const t = byCreated[ti++]!;
                if (t.done_at === null) unfinished++;
                else if (t.done_at > maxDone) maxDone = t.done_at;
            }
            while (qi < qByCreated.length && qByCreated[qi]!.created_at < at) {
                const q = qByCreated[qi++]!;
                if (q.answered_at === null) unfinished++;
                else if (q.answered_at > maxDone) maxDone = q.answered_at;
            }
            while (te < byCreated.length && byCreated[te]!.created_at <= at) te++;
            while (qe < qByCreated.length && qByCreated[qe]!.created_at <= at) qe++;

            /*
             * A scope has to have HELD something before emptying it means anything.
             *
             * Without this, the very first completion in a scope's life is a "reached zero" moment, because
             * at that instant one task existed and it was done. Technically true, useless as a claim, and it
             * made the fixture report the whole hub reaching zero seventeen times while twenty-two tasks were
             * open. A number like that does not read as a generous interpretation, it reads as a broken
             * feature — and then nothing else on the surface is believed either.
             *
             * Two is the floor: doing your only task is "your first one", not "you cleared the hub".
             */
            if (te + qe < 2) continue;
            if (unfinished > 0 || maxDone > at) continue;
            /*
             * Every candidate that survives the test is a genuinely separate zero, so it is pushed
             * unconditionally.
             *
             * The first version of this loop carried a `clear` variable meant to collapse "runs" of clear
             * moments into one — and then set it and immediately nulled it on consecutive lines, which is dead
             * code that reads like a rule. There is no run to collapse: two completions can only both be clear
             * moments if work ARRIVED between them, because otherwise the earlier one still had the later
             * task outstanding and would have failed the test. Reasoning it through beat keeping the variable.
             */
            out.push({ scope, at });
        }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Turn rows into the snapshot. Pure — no database, and no clock beyond what the rows carry.
 *
 * `openTasks` counts tasks the human can actually act on. A blocked task is excluded, for the same reason
 * the header count excludes it: waiting on somebody else's approval email is not a thing he has failed to
 * do, and it must never count against him.
 */
export interface DeriveInput {
    /** Narrowed to the columns this reads — see `FinishedRow` for the payload measurement behind that. */
    doneTasks: FinishedRow[];
    answeredQuestions: Question[];
    openTasks: Task[];
    openQuestions: Question[];
}

export function derive(input: DeriveInput): ProgressSnapshot {
    const finished: FinishedTask[] = input.doneTasks
        .filter(t => t.done_at !== null)
        .map(t => ({
            id: t.id,
            project: t.project,
            title: t.title,
            why: t.why,
            minutes: t.minutes,
            steps: t.stepCount,
            noted: t.noted,
            created_at: t.created_at,
            done_at: t.done_at!,
            note: t.note,
        }))
        .sort((a, b) => b.done_at.localeCompare(a.done_at));

    /*
     * ONLY `answered` COUNTS AS A DECISION HE MADE. Two exclusions, both deliberate:
     *
     *   `defaulted` — the hub proceeded WITHOUT him because a deadline passed. Counting that as something
     *   he accomplished would be the purest form of the lie this file is written against.
     *
     *   `ignored` — "not now, stop asking". It does unblock the agent, so there is a real argument for
     *   counting it. It is excluded because it is a deferral, and a number that counts deferrals as
     *   accomplishments is a number he will stop believing the first time he notices. When in doubt the
     *   figure goes DOWN; a conservative count is the only kind worth showing.
     */
    const decisions: DecisionMade[] = input.answeredQuestions
        .filter(q => q.status === 'answered' && q.answered_at !== null)
        .map(q => {
            const chose = q.answer_option
                ? (q.options.find(o => o.key === q.answer_option)?.label ?? q.answer_option)
                : q.answer_text
                    ? q.answer_text
                    : 'approved it';
            const blocked = q.created_at ? minutesBetween(q.created_at, q.answered_at!) : null;
            return {
                id: q.id,
                project: q.project,
                title: q.title,
                chose,
                note: q.answer_note,
                answered_at: q.answered_at!,
                minutesBlocked: blocked != null && blocked >= 0 ? blocked : null,
                beatDeadline: q.deadline != null && q.answered_at! < q.deadline,
                /*
                 * Only when an OPTION was chosen. For a typed answer or an "approved", the other options were
                 * not rejected in any meaningful sense — he answered around them — and listing them as turned
                 * down would be putting words in his mouth about a choice he did not make.
                 */
                rejected: q.answer_option
                    ? q.options.filter(o => o.key !== q.answer_option).map(o => o.label)
                    : [],
            };
        })
        .sort((a, b) => b.answered_at.localeCompare(a.answered_at));

    const actionableOpen = input.openTasks.filter(t => !t.blocked_reason);

    const slugs = new Set<string>([
        ...finished.map(f => f.project),
        ...actionableOpen.map(t => t.project),
        ...input.openQuestions.map(q => q.project),
        /* Answered decisions too, or a project he has only ever made decisions in is absent from this list
         * entirely and the interface has nothing to say about it. See `decided` on ProjectProgress. */
        ...decisions.map(d => d.project),
    ]);
    const perProject: ProjectProgress[] = [...slugs]
        .map(slug => ({
            slug,
            open: actionableOpen.filter(t => t.project === slug).length,
            done: finished.filter(f => f.project === slug).length,
            decided: decisions.filter(d => d.project === slug).length,
        }))
        /*
         * Sorted by finished work, then by decisions, then by name. The decision term is new and it only breaks
         * ties that were previously broken alphabetically, so nothing that had a `done` count moves.
         */
        .sort((a, b) => b.done - a.done || b.decided - a.decided || a.slug.localeCompare(b.slug));

    const cleared = perProject.filter(p => p.done > 0 && p.open === 0).map(p => p.slug);

    const unblocks = decisions.filter(d => d.minutesBlocked != null);
    const fastest = unblocks.length
        ? unblocks.reduce((a, b) => (b.minutesBlocked! < a.minutesBlocked! ? b : a))
        : null;

    /*
     * Gaps, and the mark that rewards CLOSING one.
     *
     * docs/RESEARCH.md §18 is the whole reason this exists in this direction. A streak punishes the gap, and
     * Silverman & Barasch measured that the punishment itself — merely displaying the break — costs 8.4
     * percentage points of continuation on identical behaviour. This measures the same absence and pays for
     * the return instead. Same data, opposite sign.
     */
    const oldestFirst = [...finished].reverse();
    const comebacks: { at: string; days: number }[] = [];
    for (let i = 1; i < oldestFirst.length; i++) {
        const gap = (new Date(oldestFirst[i].done_at).getTime()
            - new Date(oldestFirst[i - 1].done_at).getTime()) / DAY;
        if (gap >= 7) comebacks.push({ at: oldestFirst[i].done_at, days: Math.floor(gap) });
    }

    return {
        tasksDone: finished.length,
        decisionsMade: decisions.length,
        minutesEstimated: finished.reduce((n, f) => n + (f.minutes ?? 0), 0),
        // `finished` is newest first, so the oldest completion is the last one.
        firstDoneAt: finished.length ? finished[finished.length - 1].done_at : null,
        lastDoneAt: finished.length ? finished[0].done_at : null,
        projectsFinishedIn: new Set(finished.map(f => f.project)).size,
        openTasks: actionableOpen.length,
        openQuestions: input.openQuestions.length,
        perProject,
        finished,
        decisions,
        cleared,
        clearMoments: clearMoments(
            [...input.doneTasks, ...input.openTasks],
            [...input.answeredQuestions, ...input.openQuestions],
        ),
        mostStepsFinished: finished.reduce((n, f) => Math.max(n, f.steps), 0),
        fastestUnblock: fastest,
        /* `noted`, not `note`. A completion older than the window carries no note TEXT and must still be
         * paid for the note he left — see `FinishedRow.noted`. Reading the text here would have silently
         * stopped counting every note older than sixty completions. */
        notesLeft: finished.filter(f => f.noted).length,
        decisionsBeforeDeadline: decisions.filter(d => d.beatDeadline).length,
        decisionsUnderAnHour: decisions.filter(d => d.minutesBlocked != null && d.minutesBlocked <= 60).length,
        weeksActive: new Set(finished.map(f => weekKey(f.done_at))).size,
        comebacks,
    };
}

/* ------------------------------------------------------------------------------------------------
 * Standing: points, level, rank
 * ---------------------------------------------------------------------------------------------- */

/**
 * What each thing is worth, and every entry is something HE did.
 *
 * Read the file header before adding one. The test is not "is this an achievement" — it is "can this go DOWN
 * because an agent wrote a row while he was asleep?" If it can, it is a mark, not a point. That rules out
 * anything derived from the number of open tasks, which is why "cleared a project" and "the hub reached
 * zero" are marks despite being the two most satisfying things in here.
 *
 * Exported so tests/use-it.mjs can recompute the whole score independently rather than trusting the page.
 */
export const POINTS = {
    /** Doing the thing only he can do. */
    taskDone: 10,
    /** ...and telling the agent something back. The return channel is the point of the hub. */
    taskWithNote: 4,
    /** A decision made, which is an agent that stopped waiting. */
    decision: 6,
    /** ...inside its deadline, so the stated default never had to be used. */
    decisionBeforeDeadline: 4,
    /** ...within the hour, so the agent barely waited at all. */
    decisionUnderAnHour: 4,
} as const;

/**
 * The named rungs. Explicit rather than a formula, so the whole early curve is reviewable in a diff.
 *
 * Tuned against the real hub rather than the fixture: at the time of writing it held 2 finished tasks and 5
 * answered decisions, which is ~86 points — level 3 with visible movement rather than level 1 with nothing to
 * show.
 *
 * THESE TEN VALUES ARE FROZEN, AND THAT IS A RULE RATHER THAN INERTIA.
 *
 * Re-tuning them would move his CURRENT level. Every candidate replacement curve that was computed for this
 * work put 90 points — what his hub held on 30 July 2026 — at level 1 or 2 instead of level 3. A level that
 * falls because somebody rewrote the maths is the same class of lie as a badge for something he did not do:
 * he did not un-earn anything, so nothing may be taken away. So the ladder is EXTENDED past these, never
 * rebalanced within them. See `rungAt`.
 */
export const RANKS: { at: number; title: string }[] = [
    { at: 0, title: 'On call' },
    { at: 30, title: 'Responder' },
    { at: 80, title: 'Operator' },
    { at: 160, title: 'Fixer' },
    { at: 280, title: 'Unblocker' },
    { at: 450, title: 'Quartermaster' },
    { at: 680, title: 'Chief of staff' },
    { at: 980, title: 'Flight director' },
    { at: 1360, title: 'Mission commander' },
    { at: 1840, title: 'Ground control' },
];

/**
 * How much more each rung past the named ten costs than the one before it.
 *
 * WHY THE LADDER CONTINUES AT ALL, WHICH IS THE DEFECT THIS FIXES
 *
 * `RANKS` used to be the whole ladder, and a ten-entry array ending at 1,840 points is a ladder that ENDS.
 * Measured at the owner's own observed rate — 3 tasks a day with one note back, 2 decisions answered quickly,
 * so 62 points a day — the tenth and final rank landed on **day 30**. After that the level never moved again,
 * `toNext` was null forever, and the emblem froze with it, because its geometry is a function of a level that
 * had stopped. He asked for "a profile that gets enhanced when I do"; it stopped being enhanced in month one.
 *
 * The comment that used to sit above `RANKS` said "the top of the ladder is deliberately a long way off; a
 * ceiling reached in a month is a ceiling." The intent was right and the numbers did not implement it. Nothing
 * in the suite could catch it either, because every other check evaluates a single snapshot — so this is now
 * held in place by `tests/ladder.mjs`, which measures the derivation across two years of synthetic use.
 *
 * WHY THE GAP GROWS BY A FLAT AMOUNT RATHER THAN BY A PERCENTAGE
 *
 * A compounding gap re-creates the ceiling in slow motion. At +35% a rung the wait passes three months by
 * year two; at +12% it passes three months by year ten. A flat increment makes the thresholds quadratic while
 * points accumulate linearly, so the wait grows as roughly the square root of the total — 10 days at month
 * one, 30 at year one, 50 at year five, 91 at year ten, and never a wall. The owner chose this pace from the
 * measured table.
 *
 * The last named gap is 1840 - 1360 = 480, so the first extended gap is 590, then 700, then 810.
 */
const RUNG_STEP = 110;

/**
 * The point total at which a level begins. 1-based, and defined for every level there will ever be.
 *
 * Levels 1..10 are `RANKS` verbatim, so nothing anyone has already earned moves. Past that the gap widens by
 * `RUNG_STEP` per rung.
 */
export function rungAt(level: number): number {
    if (level <= RANKS.length) return RANKS[Math.max(1, level) - 1]!.at;
    let at = RANKS[RANKS.length - 1]!.at;
    let gap = at - RANKS[RANKS.length - 2]!.at;          // 480
    for (let n = RANKS.length + 1; n <= level; n++) {
        gap += RUNG_STEP;
        at += gap;
    }
    return at;
}

/**
 * Roman numerals, for the rank tier. Only ever called with small numbers — level 69 is tier 7 — so this is a
 * lookup rather than an algorithm, and it stops being called at all once there are enough names.
 */
const TIERS = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * How many levels each tier of the top name covers, once the names run out. Ten, matching the named range,
 * so "Ground control II" spans levels 11–20 and "III" spans 21–30.
 */
const TIER_SPAN = RANKS.length;

/** Which tier a level sits in. 1 for the whole named range, then one per `TIER_SPAN` levels above it. */
export function tierOf(level: number): number {
    if (level <= RANKS.length) return 1;
    return Math.ceil((level - RANKS.length) / TIER_SPAN) + 1;
}

/**
 * The rank title for a level. Above the named ten it takes a tier numeral: `Ground control II` from level 11,
 * `III` from 21, and so on.
 *
 * WHY THE NUMERAL IS THE ANSWER RATHER THAN MORE NAMES, WHICH WAS A REAL DECISION
 *
 * The obvious move is to keep inventing names, and it does not work: **names cannot cover this ladder.** The
 * ladder is unbounded by design (see `rungAt`), and at the owner's measured rate level 25 is year one, level 33
 * is year two and level 69 is year ten. Naming through year two alone would take twenty-three more, and every
 * draft past `Ground control` either escalated into space opera or turned into a joke — the brief asks
 * specifically for an identity that is not cringe, and twenty invented grandiose titles is how that goes wrong.
 *
 * The better reading is that the ten names describe a ROLE, and a role tops out. What keeps growing is TENURE,
 * and a numeral is the conventional and dignified way to show tenure — a grade and a step, a rank and a service
 * stripe. It also never runs out, which is the property the ladder needs and a name list can never have. The
 * emblem carries the same tier as pips (`emblemGeometry`), so it is reinforced in the shape rather than resting
 * on the text.
 *
 * If names are ever wanted after all, **appending to `RANKS` is the whole change** — the numeral logic only
 * applies past the end of the list, so each added name replaces one numeral with no other edit.
 */
export function rankFor(level: number): string {
    if (level <= RANKS.length) return RANKS[Math.max(1, level) - 1]!.title;
    const top = RANKS[RANKS.length - 1]!.title;
    const tier = tierOf(level);
    return `${top} ${TIERS[Math.min(tier, TIERS.length - 1)]}`.trim();
}

/** One line of the score, so the total can be checked by hand. */
export interface Credit {
    label: string;
    /** How many times it happened. */
    count: number;
    /** Points each. */
    each: number;
    points: number;
}

export interface Standing {
    points: number;
    /** 1-based, and unbounded — see `rungAt`. */
    level: number;
    rank: string;
    /**
     * Which tier of the top name this is, once the names run out. 1 through the whole named range.
     * Drawn by the emblem as concentric rings, so a promotion past the named ranks is still visible.
     */
    tier: number;
    /**
     * Points at which this level began, and at which the next begins.
     *
     * `nextAt` and `toNext` are typed nullable and are now never null in practice, because the ladder does not
     * end. The nullability is kept deliberately: it is the shape every consumer already handles, and a type
     * that permits "there is nothing above this" is the honest type for a ladder — if a future change ever
     * caps it again, the surface degrades to "top of the ladder" rather than rendering `NaN`.
     */
    levelFloor: number;
    nextAt: number | null;
    nextRank: string | null;
    /** Exactly `nextAt - points`. Check P5 asserts this arithmetic against the rendered figures. */
    toNext: number | null;
    /** 0..1 through the current level. */
    fraction: number;
    /** Every point, itemised. Sums to `points`. */
    credits: Credit[];
}

/**
 * A hard stop on the level search, and it is a guard rather than a ceiling.
 *
 * The ladder is unbounded, so finding a level means walking up it. Quadratic thresholds mean the walk is short
 * — level 69 is ten years of daily use — but a loop with no bound in a render path is a hang waiting for a bad
 * input, and `points` is derived from rows an agent can create. At 2,000 levels the threshold is over 220
 * million points, which is roughly ten thousand years at his measured rate, so nothing reachable is affected.
 */
const MAX_LEVEL = 2000;

export function standing(s: ProgressSnapshot): Standing {
    const credits: Credit[] = [
        { label: 'tasks finished', count: s.tasksDone, each: POINTS.taskDone, points: 0 },
        { label: 'with a note back to the agent', count: s.notesLeft, each: POINTS.taskWithNote, points: 0 },
        { label: 'decisions made', count: s.decisionsMade, each: POINTS.decision, points: 0 },
        {
            label: 'answered before the deadline', count: s.decisionsBeforeDeadline,
            each: POINTS.decisionBeforeDeadline, points: 0,
        },
        {
            label: 'answered within the hour', count: s.decisionsUnderAnHour,
            each: POINTS.decisionUnderAnHour, points: 0,
        },
    ].map(c => ({ ...c, points: c.count * c.each })).filter(c => c.count > 0);

    const points = credits.reduce((n, c) => n + c.points, 0);

    /*
     * Walk up the ladder. This used to be a scan of a ten-entry array, which is why the level stopped moving
     * on day 30 — see `rungAt`. The walk is bounded by MAX_LEVEL so a render path can never hang.
     */
    let level = 1;
    while (level < MAX_LEVEL && points >= rungAt(level + 1)) level++;

    const floor = rungAt(level);
    const nextAt = level < MAX_LEVEL ? rungAt(level + 1) : null;
    const span = nextAt !== null ? nextAt - floor : 0;

    return {
        points,
        level,
        rank: rankFor(level),
        tier: tierOf(level),
        levelFloor: floor,
        nextAt,
        nextRank: nextAt !== null ? rankFor(level + 1) : null,
        toNext: nextAt !== null ? nextAt - points : null,
        fraction: nextAt !== null && span > 0 ? Math.min(1, (points - floor) / span) : 1,
        credits,
    };
}

/* ------------------------------------------------------------------------------------------------
 * The emblem's geometry
 * ---------------------------------------------------------------------------------------------- */

/**
 * What the emblem draws, derived from standing like everything else here.
 *
 * WHY THIS LIVES IN THIS FILE RATHER THAN IN THE COMPONENT
 *
 * It was inline in `app/components/Emblem.tsx`, which made it untestable without rendering React — so
 * `tests/ladder.mjs` had to duplicate the three formulas to assert anything about them, on the same reluctant
 * compromise `tests/palette.mjs` makes with the colour tokens. A pure function in a `.ts` file needs no such
 * compromise: the check imports the real thing, so it cannot drift.
 *
 * WHAT IT ENCODES, AND WHY IT NO LONGER RUNS OUT
 *
 * The old version was `spokes = min(level, 10)` and `coreRings = min(3, ceil(level / 3))`, both of which are
 * saturated by level 10 — so the profile the owner asked to "get enhanced when I do" stopped changing on day
 * 30 and never changed again. Now:
 *
 *   - `spokes` counts the level WITHIN its tier, 1..10, so the emblem stays countable.
 *   - `pips` is the TIER, drawn as filled marks on the ring. It only ever increases, so the level is readable
 *     off the shape: `(pips - 1) * 10 + spokes`. A glow or a colour ramp can never give you that.
 *   - `coreRings` and `hue` follow the within-tier position, which makes them IDENTICAL to the old formulas
 *     for levels 1..10 — the whole named range is tier 1, so nothing about today's emblem changes.
 *
 * THREE THINGS THE FIRST ATTEMPT AT THIS GOT WRONG, ALL FOUND BY RENDERING IT
 *
 * The tier was originally drawn as concentric rings nested inward, and the hue kept walking with the absolute
 * level. Both looked fine reasoned about and neither survived being put on screen (app/emblem/page.tsx exists
 * so that it could be):
 *
 *   1. **Nested rings collided with the core.** Each ring stepped 3.5 units inward from radius 27, so by tier 5
 *      the innermost sat at 13 and tier 6 at 9.5 — inside the core polygon's radius of 11, and inside where the
 *      spokes start at 14. Levels 41 and 55 rendered as an onion with a hexagon jammed through it. A signal
 *      that gets noisier as it grows is not a signal.
 *   2. **The spoke reset read as a demotion.** Level 10 is a full ten-spoke wheel; level 11 came out as a
 *      single spoke and two thin rings, which looks emptier and slightly broken. The reset is right — it is how
 *      chevrons and service bars work — but the thing gained in exchange has to be at least as loud as the
 *      thing lost, and a hairline ring is not. Filled pips are.
 *   3. **A hue that wraps stops meaning "further along".** Walking 13 degrees per absolute level puts level 55
 *      back at the green it started from, so the colour became a cycle carrying no information. It walks the
 *      WITHIN-TIER position now: colour says how far through the current band, never wraps, and is unchanged
 *      for levels 1..10.
 */
export interface EmblemGeometry {
    /** One per level within the current tier, 1..10. Countable. */
    spokes: number;
    /** Filled marks on the ring: the tier. Monotonic in level, and never crowds the middle. */
    pips: number;
    /** Nested core polygons, 1..3. */
    coreRings: number;
    /** Degrees. Walks the within-tier position, so it never wraps past the end of the ramp. */
    hue: number;
}

/**
 * The emblem's ink as a CSS colour, for whoever needs to set `--emblem-ink`.
 *
 * WHY THIS IS EXPORTED RATHER THAN BUILT WHERE IT IS USED
 *
 * `--emblem-ink` was set inline on the `<svg>` element, and custom properties inherit DOWNWARD only — so the
 * panel around it, the level numeral beside it and, most consequentially, the progress bar's `.fill` never saw
 * it at all. `.fill` reads `var(--emblem-ink, var(--ok))`, so for the whole life of that rule the bar has been
 * painting the fallback green and the level's hue has been decorating nothing but the emblem's own strokes.
 *
 * It is set on the standing panel now, which is the element all of those live inside, and this function is the
 * single definition so the panel and the SVG cannot drift to different colours.
 *
 * L and C stay as tokens so the light theme can darken them; only the hue is computed here. See the
 * `--emblem-l` comment in app/globals.css for why those are tokens rather than numbers.
 */
export function emblemInk(level: number): string {
    return `oklch(var(--emblem-l) var(--emblem-c) ${emblemGeometry(level).hue})`;
}

export function emblemGeometry(level: number): EmblemGeometry {
    const lv = Math.max(1, level);
    const tier = tierOf(lv);
    // Position within the tier. The named range IS tier 1, so levels 1..10 come out exactly as they always did.
    const within = tier === 1 ? lv : ((lv - RANKS.length - 1) % TIER_SPAN) + 1;
    return {
        spokes: Math.min(within, 10),
        pips: tier,
        coreRings: Math.min(3, Math.ceil(within / 3)),
        hue: 152 + (within - 1) * 13,
    };
}

/* ------------------------------------------------------------------------------------------------
 * The time machine
 * ---------------------------------------------------------------------------------------------- */

/**
 * WHERE HE WAS ON ANY PAST DAY — and this feature exists only because of a decision made months ago.
 *
 * ==================================================================================================
 * WHY THIS IS FREE, AND WHY NO OTHER TOOL HE USES CAN DO IT
 * ==================================================================================================
 *
 * Nothing in this hub is stored. Every figure — points, level, rank, tier, marks, the crest's geometry — is a
 * fold over `tasks.done_at` and `questions.answered_at`, recomputed on every render. That was adopted as an
 * HONESTY rule: a stored score can disagree with the rows it came from, and then the hub has two truths.
 *
 * The consequence nobody noticed is that **standing at any past instant is computable.** Filter the rows to
 * that instant and run the same derivation. It needs no schema change, no new table, no event log — and it
 * cannot drift from the live figures, because it IS the live figures with a different cut-off.
 *
 * A hub with an `xp` column could not do this at any price. It would know today's total and nothing else, and
 * the only way to get the history would have been to start recording snapshots months ago.
 *
 * ==================================================================================================
 * WHAT IT RECONSTRUCTS EXACTLY, AND WHAT IT CANNOT — stated because the surface has to say so
 * ==================================================================================================
 *
 * EXACT. Points, level, rank, tier and every part of the crest that follows from them. Those depend only on
 * `done_at`, `answered_at`, and per-row facts that do not change (a deadline, a `created_at`). Reconstructing
 * them is a filter, not an estimate.
 *
 * EXACT, AND WORTH SPELLING OUT. Open work is reconstructed too: a task with `created_at <= at` and no
 * completion by `at` was open at `at`, whether or not it is finished now. That is what makes the `clearing`
 * marks reconstruct correctly rather than claiming he had cleared a project he had not yet cleared.
 *
 * NOT EXACT, AND THE INTERFACE SAYS SO — three of them, and they all round in the same direction:
 *
 *   1. **A note has no date of its own.** `tasks.note` is a column, not an event, so a note written today is
 *      credited from the moment the task was finished. Past totals can therefore be up to 4 points per note
 *      too high.
 *   2. **A re-opened task keeps only its current state.** If he finished something in June, re-opened it in
 *      July and has not finished it again, the row has no `done_at` — so June looks as though it never
 *      happened. That is the same reversibility that makes the live figure honest, seen from behind.
 *   3. **`minutes` is today's estimate.** If an agent re-posted a task with a revised estimate, the past
 *      inherits the revision.
 *
 * And the record is THIN at the start, for reasons that are on the record rather than guessed at: seventeen
 * tasks were migrated with `created_at` set to the migration time, and early proof runs destroyed most of the
 * event log (about 611 rows — docs/RESEARCH.md §17). So the first day of the timeline is the day the hub was
 * migrated, not the day the work happened. `Timeline.tsx` prints that where it matters rather than letting the
 * scrubber imply a history that does not exist.
 */
export function asOf(input: DeriveInput, at: string): DeriveInput {
    /*
     * `done_at` is nulled rather than the row being dropped, which is the whole trick.
     *
     * Dropping it would make a task that had been FILED but not yet finished disappear from the past
     * altogether — and then every scope looks clear at every moment, so `clearMoments` would hand him a
     * "cleared the whole hub" mark on a day when eleven things were waiting. Keeping the row with its
     * completion removed is what makes the past's open work real.
     */
    const past = <T extends { created_at: string }>(rows: T[]) => rows.filter(r => r.created_at <= at);
    return {
        doneTasks: past(input.doneTasks).map(t => ({
            ...t,
            done_at: t.done_at !== null && t.done_at <= at ? t.done_at : null,
        })),
        answeredQuestions: past(input.answeredQuestions).map(q => ({
            ...q,
            answered_at: q.answered_at !== null && q.answered_at <= at ? q.answered_at : null,
            /*
             * A question not yet answered at `at` was OPEN then, whatever it is now. The status has to move
             * with the timestamp or `decisions` would count an answer that had not happened — which is
             * precisely the class of lie this file exists to prevent, arriving through a time filter.
             */
            status: q.answered_at !== null && q.answered_at <= at ? q.status : ('open' as const),
        })),
        openTasks: past(input.openTasks),
        openQuestions: past(input.openQuestions),
    };
}

/** One level, and the moment he first reached it. */
export interface RankArrival {
    level: number;
    rank: string;
    tier: number;
    /** ISO, the timestamp of the completion or decision that crossed the rung. */
    at: string;
    /** The running total immediately after that event. Always at or above `rungAt(level)`. */
    points: number;
}

/**
 * When each level arrived, from point accrual rather than from repeated derivation.
 *
 * WHY NOT JUST CALL `standing(derive(asOf(...)))` FOR EVERY DAY
 *
 * Because that is a full derivation per day, and at fifteen projects filing daily a year is 365 of them. The
 * derivation is fast now (see `clearMoments`) but not free, and this runs in the browser on a tab press.
 *
 * Accrual is exact instead of approximate, which is why it is safe to use a different method here: `standing()`
 * computes the total as `tasksDone * 10 + notesLeft * 4 + decisionsMade * 6 + decisionsBeforeDeadline * 4 +
 * decisionsUnderAnHour * 4`, and every one of those terms is a COUNT of individually-dated things. So the same
 * total falls out of summing each thing's own contribution at its own timestamp — one pass, `O(n log n)` for
 * the sort. Check H2 in tests/ladder.mjs asserts the cumulative total equals `standing().points` exactly, so
 * the two methods cannot drift.
 *
 * The rungs are walked with the real `rungAt`, so an extended ladder moves this with it.
 */
export function rankLedger(s: ProgressSnapshot): RankArrival[] {
    const events: { at: string; points: number }[] = [];
    for (const f of s.finished) {
        events.push({
            at: f.done_at,
            points: POINTS.taskDone + (f.noted ? POINTS.taskWithNote : 0),
        });
    }
    for (const d of s.decisions) {
        events.push({
            at: d.answered_at,
            points: POINTS.decision
                + (d.beatDeadline ? POINTS.decisionBeforeDeadline : 0)
                + (d.minutesBlocked != null && d.minutesBlocked <= 60 ? POINTS.decisionUnderAnHour : 0),
        });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));

    const out: RankArrival[] = [];
    let total = 0;
    let level = 1;
    for (const e of events) {
        total += e.points;
        /*
         * A `while` rather than an `if`, and it is DEFENSIVE rather than load-bearing — which is worth saying
         * because the first version of this comment claimed the opposite and a check disproved it.
         *
         * The claim was "a single event can cross more than one rung early on". Measured: the largest single
         * event in this economy is **14 points** (a decision answered inside its deadline and inside the hour:
         * 6 + 4 + 4) and the smallest rung gap is **30** (level 1 to level 2, see `RANKS`). No event can cross
         * two rungs, so an `if` would behave identically today — the injection written to prove otherwise
         * passed identically and proved nothing.
         *
         * It stays a `while` because `POINTS` is tunable and `RANKS` is frozen: raise any credit past 30 and an
         * `if` starts skipping a level he definitely reached, which is a MISSING row rather than a wrong one and
         * therefore harder to notice than any incorrect figure. Check H3 holds the no-gaps property whatever
         * the economy becomes.
         */
        while (total >= rungAt(level + 1)) {
            level++;
            out.push({ level, rank: rankFor(level), tier: tierOf(level), at: e.at, points: total });
        }
    }
    return out;
}

/* ------------------------------------------------------------------------------------------------
 * The crest
 * ---------------------------------------------------------------------------------------------- */

/**
 * THE CREST: what the emblem became, and why it is a different object rather than a nicer one.
 *
 * ==================================================================================================
 * WHAT WAS WRONG WITH THE EMBLEM, WHICH WAS NOT THAT IT LOOKED BAD
 * ==================================================================================================
 *
 * The emblem was a ring with spokes, pips and a hexagonal core, and it was competent. Its problem was
 * narrower and more serious than ugliness: **it was a function of one number.** Spokes, pips, core rings and
 * hue were all read off `level`, so two people with wildly different histories — one who had cleared four
 * projects and answered fifty decisions inside their deadlines, one who had ticked off two hundred identical
 * errands in a single project — drew the *same emblem* if their point totals matched. An identity that
 * cannot tell those two apart is not an identity, it is a gauge.
 *
 * It was also, structurally, a circle: one more circle on a page that already had a progress ring, a dozen
 * project dots and a scrollbar. Nothing about it said *this is mine*.
 *
 * ==================================================================================================
 * WHAT THE CREST IS
 * ==================================================================================================
 *
 * A shield — an escutcheon — carrying a seal. The silhouette is the part you recognise before you have read
 * anything, which is the job the circle could not do. Everything inside it is derived from a DIFFERENT axis
 * of his history, so the crest changes shape along six independent dimensions instead of one:
 *
 *   | part            | derived from                                     | why that axis                        |
 *   |-----------------|--------------------------------------------------|--------------------------------------|
 *   | the PALES       | the projects he has finished work in, in their   | this hub exists for fifteen projects |
 *   |                 | own hues                                         | at once; breadth IS the thing        |
 *   | the CHIEF pips  | the tier                                         | tenure, monotonic, never resets      |
 *   | the RAYS        | the level within that tier, 1..10                | countable — you can look and see 4   |
 *   | the KEYWAY      | how many KINDS of mark he has earned, 1..9       | a shape of work, not an amount of it |
 *   | how deeply it   | the rarest mark tier he holds, 1..4              | rarity means nothing if everything   |
 *   |  is STRUCK      |                                                  | is volume                            |
 *   | the RIMS        | estimated hours behind him                       | the one figure that only accumulates |
 *
 * Two histories with identical point totals differ in four of those six. That is the whole point, and
 * `tests/ladder.mjs` asserts it against constructed histories rather than trusting the table above.
 *
 * `fraction` USED TO BE HERE, as an arc around the seal, and it is not drawn any more. It is still computed
 * and still rendered — as the progress bar directly under the crest, which is where it always was as well.
 * The arc was the same number twice within forty pixels, and it was the only part of the crest that
 * `CrestKey` never had a row for. See the header of app/components/Crest.tsx for the full reasoning.
 *
 * ==================================================================================================
 * WHAT DID NOT CHANGE, DELIBERATELY
 * ==================================================================================================
 *
 * The rays are the old spokes and the pips are the old pips, with the same formulas. Levels 1–10 still draw
 * ten rays and one pip, so nothing he has already earned means something different this morning than it did
 * last night. A reward system that silently re-scores its own past is the same class of lie as a stored score
 * that disagrees with the rows (see this file's header), and it would be a worse one, because it would be a
 * lie told by an upgrade.
 *
 * And every single input is DERIVED. Re-open a task and the points fall, the level can fall with them, a
 * mark can vanish, and if that mark was the only one in its category the keyway loses a side. The crest
 * un-earns itself, exactly like every other figure here, because it is a pure function of the same snapshot
 * and there is nothing stored anywhere to disagree with it.
 */

/**
 * How many project pales the shield can carry before they stop being distinguishable.
 *
 * Eight, measured rather than chosen: the shield's field is 56 of 88 units wide, so eight pales are 7 units
 * each — about 8px at the 96px the crest actually renders at, which is still a readable band. Nine were
 * tried on the bench and read as texture rather than as a count.
 *
 * NOTHING IS HIDDEN BY THE CAP. `palesOver` carries how many did not fit, the crest key states it in words,
 * and the pane's Projects list has always shown every project unconditionally. A truncation with no route to
 * the whole thing is the defect `npm run audit` exists to print; this has two routes.
 */
export const PALE_MAX = 8;

/** Everything about his history the crest is a function of. Assembled by `crestInput`, never by hand. */
export interface CrestInput {
    level: number;
    tier: number;
    /** 0..1 through the current level. */
    fraction: number;
    /** Slugs he has finished work in, oldest completion first — so the pales do not reorder on a tick. */
    projects: string[];
    /** Distinct categories of mark he holds. */
    categories: MarkCategory[];
    /** The rarest mark tier he holds: 1..4, or 0 when he holds none at all. */
    rarest: number;
    /** Estimated minutes behind him. AN AGENT'S ESTIMATE — the key says so. */
    minutesEstimated: number;
}

export interface CrestGeometry {
    /**
     * How many of the ten ray positions are FILLED: the level within the tier, 1..10. The old `spokes`.
     *
     * The count is unchanged. What changed is that the component draws all ten positions and fills this many,
     * rather than drawing this many and leaving the rest of the ring empty — see the comment on the rays in
     * Crest.tsx for the defect that forced it. The number a person counts is still exactly this.
     */
    rays: number;
    /** The tier, as filled pips across the chief. The old `pips`, unchanged. */
    pips: number;
    /**
     * WHICH DESIGNED CHARGE sits at the centre, 1..9 — a SELECTOR, not a proportion. This is the change the
     * sixth pass turns on, and the name is the same only because every check that reads it still means
     * "the shape in the middle differs".
     *
     * It used to be the number of sides cut into a polygonal keyway, computed as `max(3, min(9, kinds))`. That
     * is the defect docs/BRIEF-PROGRESSION.md identifies and it is not a matter of taste: **you cannot make an
     * arbitrary seven-sided hole look intentional, because it is not.** A shape whose every proportion is a
     * variable is a chart; a designed shape chosen by his history can be beautiful. So `kinds` now picks one of
     * nine devices that were each drawn to look right — see `CHARGE` in app/components/Crest.tsx.
     *
     * TWO CONSEQUENCES WORTH STATING.
     *
     * The floor of three is GONE, because a selector has nothing to floor: one kind of mark selects the first
     * device rather than being rounded up to a triangle. That removes a caveat from `CrestKey` by removing the
     * untruth it existed to confess, which is strictly better than confessing it well.
     *
     * And the crest no longer CLAIMS to count this axis. It claims the charge is his, not that you can read
     * "six" off it — `CrestKey` carries the number in words. docs/BRIEF-THE-CREST.md's constraint is "still
     * countable **where it claims to count**", and the encoding table's own note allows an axis to move off the
     * graphic with the reasoning recorded. This is that, recorded.
     */
    facets: number;
    /** How many kinds of mark he ACTUALLY holds. Unclamped, and the key states this one. */
    kinds: number;
    /** 0..4. Drives how deeply the charge is struck, so the rarest thing he holds is visible without a
     *  legend: a boss at 2, a ring at 3, both at 4. */
    rarity: number;
    /** Project hues, in the order the pales are drawn. At most `PALE_MAX`. */
    pales: number[];
    /** Projects that did not fit. Stated in the key rather than dropped silently. */
    palesOver: number;
    /** Rim lines on the shield edge, 1..3. */
    rims: number;
    /** Degrees. Walks the within-tier position, so it never wraps. Identical to the emblem's. */
    hue: number;
}

/**
 * The crest's inputs, from the same snapshot, standing and marks every other figure comes from.
 *
 * `projects` comes from the finished tasks in COMPLETION ORDER rather than from `perProject`, which is sorted
 * by how much is done in each. That sort changes when he ticks something off, so a pale would jump from the
 * third position to the first mid-session and the crest would appear to redraw itself for no reason he could
 * see. Order of first completion is a fact about the past and therefore stable: a pale only ever gets ADDED,
 * on the right, the first time he finishes something in a new project.
 */
export function crestInput(s: ProgressSnapshot, st: Standing, earned: Mark[]): CrestInput {
    const seen: string[] = [];
    // `finished` is newest first, so walk it backwards to get first-completion order.
    for (let i = s.finished.length - 1; i >= 0; i--) {
        const p = s.finished[i]!.project;
        if (!seen.includes(p)) seen.push(p);
    }
    return {
        level: st.level,
        tier: st.tier,
        fraction: st.fraction,
        projects: seen,
        categories: [...new Set(earned.map(m => m.category))],
        rarest: earned.reduce((n, m) => Math.max(n, m.tier), 0),
        minutesEstimated: s.minutesEstimated,
    };
}

/**
 * The rim thresholds, in estimated minutes.
 *
 * Two hours and ten hours, which are the same thresholds the `two-hours` and `ten-hours` marks already use —
 * so the crest is speaking the vocabulary the rest of the surface speaks rather than inventing a third scale.
 *
 * FORTY HOURS WAS THE OBVIOUS THIRD STEP AND IT IS NOT HERE, because it would have made the dimension
 * invisible for a year. Measured against his real hub on 1 August 2026 — roughly three hours of estimates
 * behind him — a 0/10h/40h ramp would have drawn one rim today and one rim in nine months. A dimension that
 * does not move is a dimension that is not doing anything; the fortieth hour is still marked, as a mark.
 */
const RIM_AT = [120, 600];

export function crestGeometry(i: CrestInput): CrestGeometry {
    const lv = Math.max(1, i.level);
    const tier = tierOf(lv);
    // The named range IS tier 1, so levels 1..10 come out exactly as the emblem always drew them.
    const within = tier === 1 ? lv : ((lv - RANKS.length - 1) % TIER_SPAN) + 1;
    const kinds = i.categories.length;
    return {
        rays: Math.min(within, 10),
        pips: tier,
        /*
         * WHICH OF THE NINE DESIGNED CHARGES, and the floor of three that used to be here is gone.
         *
         * It read `Math.max(3, Math.min(9, kinds))` because the charge was a polygon and a one-sided hole is a
         * point. A selector needs no floor: one kind of mark selects the first device, which is a solid disc and
         * a perfectly good charge. `kinds` is clamped to the vocabulary's size and nothing else, so the graphic
         * no longer shows more structure than he has earned — and `CrestKey` no longer has to say so.
         */
        facets: Math.max(1, Math.min(9, kinds)),
        kinds,
        rarity: i.rarest,
        pales: i.projects.slice(0, PALE_MAX).map(projectHueOf),
        palesOver: Math.max(0, i.projects.length - PALE_MAX),
        rims: 1 + RIM_AT.filter(m => i.minutesEstimated >= m).length,
        hue: crestHue(tier, within),
    };
}

/**
 * The crest's hue: how far through the current tier, plus a small offset per tier.
 *
 * THE TIER TERM IS A FIX FOUND BY RENDERING IT, and it is the third time a hue rule on this graphic has been
 * wrong in a way that was invisible in the code.
 *
 * The first version walked the ABSOLUTE level at 13 degrees a rung, so level 55 landed back on the green it
 * started from and the colour became a cycle carrying no information. That was fixed by walking the
 * WITHIN-TIER position instead, which never wraps — correct, and it introduced a quieter version of the same
 * problem: within-tier position RESETS, so level 41 (tier 5, first rung) drew in exactly the same green as
 * level 1. On the bench, a year-ten crest and a day-one crest were the same colour. Not untrue — the pips say
 * which tier it is — but the one dimension that is supposed to read as "further along" before you have counted
 * anything was saying "back at the beginning".
 *
 * Six degrees per tier separates them without letting the two terms collide: a tier is worth less than half a
 * rung, so the within-tier walk stays the dominant reading and the tier only shifts the band it walks through.
 *
 * CLAMPED AT 332, which is where the ramp ends rather than an arbitrary stop. Past that the hue would cross
 * into the reds that `--bad` owns, and a crest the colour of a refused write is a crest that means something
 * it does not mean. Tier 13 is roughly year twelve at his measured rate; the level, the pips and the rays all
 * keep moving after the colour stops, which is the right thing to saturate last.
 *
 * TIER 1 IS UNCHANGED, arithmetically: `(1 - 1) * 6` is zero, so every level from 1 to 10 — the whole named
 * range, and where his hub is today — draws the exact hue it has always drawn.
 */
function crestHue(tier: number, within: number): number {
    return Math.min(332, 152 + (tier - 1) * 6 + (within - 1) * 13);
}

/**
 * A project's hue, duplicated from lib/colour.ts — and the duplication is the lesser of two evils here.
 *
 * `lib/colour.ts` owns this derivation and lib/colour.ts is where anything rendering a project colour must
 * get it. This file cannot import it: `tests/ladder.mjs` loads `lib/progress.ts` directly through Node's
 * type-stripping, which erases `import type` but cannot resolve an extensionless VALUE import between two
 * `lib/*.ts` files (AGENTS.md records the hour that cost). So the choice was a second copy of six lines of
 * arithmetic, or moving the crest's geometry out of the one file the ladder suite can already import — which
 * is where `emblemGeometry` was moved TO, precisely so a check could assert the real function instead of a
 * copy of it.
 *
 * The copy is made safe by a check rather than by a comment claiming they match, because that exact comment
 * was already false once (see lib/colour.ts's header, where `/setup` had drifted to a different colour
 * space). `tests/ladder.mjs` asserts this function against `projectHue` from lib/colour.ts over the real
 * project slugs; if either moves, the suite goes red.
 */
export function projectHueOf(slug: string): number {
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
    return h;
}

/* ------------------------------------------------------------------------------------------------
 * Marks
 * ---------------------------------------------------------------------------------------------- */

export type MarkCategory =
    | 'volume' | 'breadth' | 'speed' | 'reliability' | 'depth' | 'clearing' | 'voice' | 'return' | 'time';

/**
 * A mark is a STATEMENT ABOUT SOMETHING THAT HAPPENED, with the date it happened on.
 *
 * Every one is derived, so every one is reversible: re-open the task behind it and the mark goes. The
 * historical ones (`clearing`) are reconstructed from the rows rather than read off the current open count,
 * so they survive an agent filing new work — see `clearMoments` for why that distinction is load-bearing.
 *
 * WHAT CHANGED, AND WHY THE COMMENT THAT USED TO BE HERE IS GONE
 *
 * This file previously said, at length, that a mark must NEVER be shown as a target and that unearned marks
 * are not rendered at all — on the strength of docs/RESEARCH.md §19 (informational versus controlling
 * feedback). The owner then asked, explicitly and for the second time, to be able to feel progression and to
 * see what is coming. That is his call on his own tool, so `NEXT_UP` exists and the surface shows a small
 * number of upcoming marks.
 *
 * The evidence has not changed and is still worth reading before extending this. What replaced the old
 * absolute rule is a narrower one that protects the thing that actually matters:
 *
 *   **A stated target must be ARITHMETICALLY TRUE.** "4 more to go" has to equal `need - have`, computed
 *   from the same snapshot the rest of the page renders. Check P5 in tests/measure-layout.mjs parses the
 *   rendered text and asserts it against the derivation, so a target that drifts from reality fails the
 *   suite rather than quietly misleading him.
 *
 * And one mechanic stays banned outright, because it is the one the research is unambiguous about and it is
 * not what he asked for: **no streak.** Nothing here counts consecutive days or punishes a gap. The
 * `return` category pays for coming back instead, which is the same measurement with the opposite sign.
 */
export interface Mark {
    /** Stable id. Used by tests and as a React key. Never shown. */
    slug: string;
    category: MarkCategory;
    /** 1..4. Drives how loudly it is drawn; higher is rarer. */
    tier: 1 | 2 | 3 | 4;
    /** Past tense, no exhortation. */
    label: string;
    /** One line of substance, or null. */
    detail: string | null;
    /** When it happened, ISO. */
    at: string;
}

/** An unearned mark, with honest arithmetic. */
export interface NextMark {
    slug: string;
    category: MarkCategory;
    tier: 1 | 2 | 3 | 4;
    label: string;
    have: number;
    need: number;
    /**
     * What the remainder is COUNTED IN, when it is not a count of things he does.
     *
     * Found by looking at the real hub: it read "Worked through a 20-step procedure — 1 to go" next to a
     * completed 19-step task. Arithmetically true and semantically wrong — the 1 is one more STEP inside some
     * future task, not one more task to finish, and "1 to go" reads as the latter. A target that is true and
     * misread is still a target that misleads.
     */
    unit?: string;
    /** Exactly `need - have`. Never rounded, never flattered. */
    toGo: number;
}

interface MarkDef {
    slug: string;
    category: MarkCategory;
    tier: 1 | 2 | 3 | 4;
    /** Set when progress is measured in something other than things he did. See NextMark.unit. */
    unit?: string;
    /** Progress toward it. `have >= need` means earned. Both must be real counts, not percentages. */
    progress: (s: ProgressSnapshot) => { have: number; need: number };
    /** When it happened. Only consulted once earned; may return null if the date is unknowable. */
    at: (s: ProgressSnapshot) => string | null;
    label: (s: ProgressSnapshot) => string;
    detail?: (s: ProgressSnapshot) => string | null;
}

/** The Nth completion chronologically, or null. `finished` is newest first. */
const nth = (s: ProgressSnapshot, n: number): FinishedTask | null =>
    s.finished.length >= n ? s.finished[s.finished.length - n] : null;

/** The date the Nth of something happened, walking the record forwards. */
function whenReached<T>(items: T[], n: number, dateOf: (x: T) => string): string | null {
    if (items.length < n) return null;
    const dates = items.map(dateOf).sort();
    return dates[n - 1];
}

const countMark = (
    n: number, slug: string, tier: 1 | 2 | 3 | 4, label: string,
): MarkDef => ({
    slug, category: 'volume', tier,
    progress: s => ({ have: s.tasksDone, need: n }),
    at: s => nth(s, n)?.done_at ?? null,
    label: () => label,
    /*
     * `t?.title` and not `t`, because a completion older than the window has a date and no title.
     *
     * This is the one thing the payload window costs, and it is stated rather than left to be discovered: the
     * mark, its label and its date are all exact at any depth — those come from the tuple history — and only
     * this grey sub-line goes quiet for a milestone reached more than `RECORD_WINDOW` completions ago. On his
     * hub, which holds fourteen completions, it will not bite for years. If it ever does, the fix is to also
     * ship the rows at the chronological positions the `countMark` definitions name; it was not built now
     * because coupling `board()`'s SQL to this array is a second list somebody has to remember.
     */
    detail: s => { const t = nth(s, n); return t?.title ? `The one that got you there: ${t.title}` : null; },
});

export const MARKS: MarkDef[] = [
    /* ---------------------------------------------------------------- volume: how much got done */
    {
        slug: 'first-one', category: 'volume', tier: 1,
        progress: s => ({ have: s.tasksDone, need: 1 }),
        at: s => nth(s, 1)?.done_at ?? null,
        label: () => 'Your first one',
        detail: s => nth(s, 1)?.title ?? null,   // null beyond the window — see `countMark`
    },
    countMark(5, 'five-finished', 1, 'Five finished'),
    countMark(10, 'ten-finished', 2, 'Ten finished'),
    countMark(25, 'twentyfive-finished', 2, 'Twenty-five finished'),
    countMark(50, 'fifty-finished', 3, 'Fifty finished'),
    countMark(100, 'hundred-finished', 4, 'A hundred finished'),
    countMark(250, 'twofifty-finished', 4, 'Two hundred and fifty finished'),

    /* ------------------------------------------------- breadth: this hub is for FIFTEEN projects */
    {
        slug: 'two-projects', category: 'breadth', tier: 1,
        progress: s => ({ have: s.projectsFinishedIn, need: 2 }),
        at: s => breadthReachedAt(s, 2),
        label: () => 'Finished work in two projects',
        detail: () => 'One place, more than one thing',
    },
    {
        slug: 'across-the-board', category: 'breadth', tier: 2,
        progress: s => ({ have: s.projectsFinishedIn, need: 3 }),
        at: s => breadthReachedAt(s, 3),
        label: s => `Finished work in ${Math.max(3, s.projectsFinishedIn)} different projects`,
        detail: () => 'Which is the thing this hub is for',
    },
    {
        slug: 'five-projects', category: 'breadth', tier: 3,
        progress: s => ({ have: s.projectsFinishedIn, need: 5 }),
        at: s => breadthReachedAt(s, 5),
        label: () => 'Five projects moving at once',
        detail: () => null,
    },
    {
        slug: 'eight-projects', category: 'breadth', tier: 4,
        progress: s => ({ have: s.projectsFinishedIn, need: 8 }),
        at: s => breadthReachedAt(s, 8),
        label: () => 'Eight projects moving at once',
        detail: () => null,
    },

    /* ------------------------------------------- speed: the seam the whole hub was built to close */
    {
        slug: 'fast-unblock', category: 'speed', tier: 1,
        progress: s => ({
            have: s.fastestUnblock && s.fastestUnblock.minutesBlocked != null
                && s.fastestUnblock.minutesBlocked <= 15 ? 1 : 0,
            need: 1,
        }),
        at: s => s.fastestUnblock?.answered_at ?? null,
        label: s => {
            const m = s.fastestUnblock?.minutesBlocked ?? 15;
            return `Unblocked an agent ${m <= 1 ? 'within a minute' : `in ${m} minutes`}`;
        },
        detail: s => s.fastestUnblock?.title ?? null,
    },
    {
        slug: 'five-under-an-hour', category: 'speed', tier: 2,
        progress: s => ({ have: s.decisionsUnderAnHour, need: 5 }),
        at: s => whenReached(
            s.decisions.filter(d => d.minutesBlocked != null && d.minutesBlocked <= 60), 5,
            d => d.answered_at),
        label: () => 'Five agents unblocked inside an hour',
        detail: () => 'A stalled agent is the expensive thing; this is the cheap fix',
    },
    {
        slug: 'twenty-under-an-hour', category: 'speed', tier: 3,
        progress: s => ({ have: s.decisionsUnderAnHour, need: 20 }),
        at: s => whenReached(
            s.decisions.filter(d => d.minutesBlocked != null && d.minutesBlocked <= 60), 20,
            d => d.answered_at),
        label: () => 'Twenty agents unblocked inside an hour',
        detail: () => null,
    },

    /* ------------------------------------- reliability: the timed default never had to be used */
    {
        slug: 'beat-the-clock', category: 'reliability', tier: 1,
        progress: s => ({ have: s.decisionsBeforeDeadline, need: 1 }),
        at: s => whenReached(s.decisions.filter(d => d.beatDeadline), 1, d => d.answered_at),
        label: () => 'Answered before the deadline, so no default was needed',
        detail: s => s.decisions.filter(d => d.beatDeadline).slice(-1)[0]?.title ?? null,
    },
    {
        slug: 'ten-before-deadline', category: 'reliability', tier: 2,
        progress: s => ({ have: s.decisionsBeforeDeadline, need: 10 }),
        at: s => whenReached(s.decisions.filter(d => d.beatDeadline), 10, d => d.answered_at),
        label: () => 'Ten decisions answered before their deadlines',
        detail: () => 'Ten times the hub did not have to guess for you',
    },
    {
        slug: 'fifty-before-deadline', category: 'reliability', tier: 4,
        progress: s => ({ have: s.decisionsBeforeDeadline, need: 50 }),
        at: s => whenReached(s.decisions.filter(d => d.beatDeadline), 50, d => d.answered_at),
        label: () => 'Fifty decisions answered before their deadlines',
        detail: () => null,
    },

    /* ------------------------------------------------------- depth: the long, tedious procedures */
    {
        slug: 'ten-step', category: 'depth', tier: 1, unit: 'step',
        progress: s => ({ have: s.mostStepsFinished, need: 10 }),
        at: s => s.finished.find(f => f.steps >= 10)?.done_at ?? null,
        label: s => `Worked through a ${Math.max(10, s.mostStepsFinished)}-step procedure`,
        detail: s => s.finished.find(f => f.steps >= 10)?.title ?? null,
    },
    {
        slug: 'twenty-step', category: 'depth', tier: 3, unit: 'step',
        progress: s => ({ have: s.mostStepsFinished, need: 20 }),
        at: s => s.finished.find(f => f.steps >= 20)?.done_at ?? null,
        label: s => `Worked through a ${Math.max(20, s.mostStepsFinished)}-step procedure`,
        detail: () => 'Nobody enjoys those',
    },

    /* --------------------------------------------------- clearing: reaching zero, which is SUCCESS */
    {
        slug: 'cleared-a-project', category: 'clearing', tier: 2,
        progress: s => ({ have: s.clearMoments.filter(c => c.scope !== null).length, need: 1 }),
        at: s => s.clearMoments.filter(c => c.scope !== null).slice(-1)[0]?.at ?? null,
        label: s => {
            const first = s.clearMoments.filter(c => c.scope !== null).slice(-1)[0];
            return first ? `Cleared ${first.scope}` : 'Cleared a project';
        },
        detail: s => {
            const n = new Set(s.clearMoments.filter(c => c.scope !== null).map(c => c.scope)).size;
            return n > 1 ? `${n} projects have hit zero at least once` : 'Nothing left open in it';
        },
    },
    {
        slug: 'cleared-three', category: 'clearing', tier: 3,
        progress: s => ({
            have: new Set(s.clearMoments.filter(c => c.scope !== null).map(c => c.scope)).size, need: 3,
        }),
        at: s => s.clearMoments.filter(c => c.scope !== null)[0]?.at ?? null,
        label: () => 'Three different projects taken to zero',
        detail: () => null,
    },
    {
        slug: 'all-clear', category: 'clearing', tier: 3,
        progress: s => ({ have: s.clearMoments.filter(c => c.scope === null).length, need: 1 }),
        at: s => s.clearMoments.filter(c => c.scope === null).slice(-1)[0]?.at ?? null,
        label: () => 'The whole hub reached zero',
        detail: () => 'Nothing was waiting on you, across every project',
    },
    {
        slug: 'all-clear-thrice', category: 'clearing', tier: 4,
        progress: s => ({ have: s.clearMoments.filter(c => c.scope === null).length, need: 3 }),
        at: s => s.clearMoments.filter(c => c.scope === null)[0]?.at ?? null,
        label: () => 'Took the whole hub to zero three times',
        detail: () => 'It keeps filling up. That is the job.',
    },

    /* -------------------------------------- voice: the return channel, which the design values most */
    {
        slug: 'first-note', category: 'voice', tier: 1,
        progress: s => ({ have: s.notesLeft, need: 1 }),
        at: s => whenReached(s.finished.filter(f => f.noted), 1, f => f.done_at),
        label: () => 'Told an agent something back',
        detail: () => 'A tick says it is done; a note says what actually happened',
    },
    {
        slug: 'ten-notes', category: 'voice', tier: 2,
        progress: s => ({ have: s.notesLeft, need: 10 }),
        at: s => whenReached(s.finished.filter(f => f.noted), 10, f => f.done_at),
        label: () => 'Ten tasks came back with a note',
        detail: () => null,
    },

    /* ---------- return: rewards CLOSING a gap, which is the deliberate inverse of a streak (§18) */
    {
        slug: 'came-back', category: 'return', tier: 2,
        progress: s => ({ have: s.comebacks.length, need: 1 }),
        at: s => s.comebacks.slice(-1)[0]?.at ?? null,
        label: s => {
            const c = s.comebacks.slice(-1)[0];
            return c ? `Came back after ${c.days} days away` : 'Came back after a week away';
        },
        detail: () => 'No streak to break here. Picking it up again is the thing worth marking.',
    },
    {
        slug: 'three-weeks', category: 'return', tier: 1, unit: 'week',
        progress: s => ({ have: s.weeksActive, need: 3 }),
        at: s => weeksReachedAt(s, 3),
        label: () => 'Finished something in three different weeks',
        detail: () => 'Not consecutive. They do not have to be.',
    },
    {
        slug: 'twelve-weeks', category: 'return', tier: 3, unit: 'week',
        progress: s => ({ have: s.weeksActive, need: 12 }),
        at: s => weeksReachedAt(s, 12),
        label: () => 'Finished something in twelve different weeks',
        detail: () => 'Three months of a tool that is still open',
    },

    /* ------------------------------------------- time: the estimates, always labelled as estimates */
    {
        slug: 'two-hours', category: 'time', tier: 1, unit: 'minute',
        progress: s => ({ have: s.minutesEstimated, need: 120 }),
        at: s => s.lastDoneAt,
        label: () => 'Two hours of estimated work behind you',
        detail: () => 'On the agents’ own estimates, not a measurement',
    },
    {
        slug: 'ten-hours', category: 'time', tier: 2, unit: 'minute',
        progress: s => ({ have: s.minutesEstimated, need: 600 }),
        at: s => s.lastDoneAt,
        label: () => 'Ten hours of estimated work behind you',
        detail: () => 'On the agents’ own estimates, not a measurement',
    },
    {
        slug: 'forty-hours', category: 'time', tier: 4, unit: 'minute',
        progress: s => ({ have: s.minutesEstimated, need: 2400 }),
        at: s => s.lastDoneAt,
        label: () => 'A working week of estimated work behind you',
        detail: () => 'On the agents’ own estimates, not a measurement',
    },
];

/**
 * When the record first covered N distinct weeks, walking forwards.
 *
 * Same reasoning as `breadthReachedAt`: dating it from `lastDoneAt` would move the mark forward every time
 * anything was finished, so a mark earned in June would claim to have happened today. Small untruths on a
 * surface whose only job is to be believable are the expensive kind.
 */
function weeksReachedAt(s: ProgressSnapshot, n: number): string | null {
    if (s.weeksActive < n) return null;
    const seen = new Set<string>();
    for (let i = s.finished.length - 1; i >= 0; i--) {
        seen.add(weekKey(s.finished[i].done_at));
        if (seen.size === n) return s.finished[i].done_at;
    }
    return s.lastDoneAt;
}

/**
 * When the record first reached N distinct projects, walking forwards.
 *
 * Dated from the completion that actually got there rather than from the most recent one. Using `lastDoneAt`
 * would re-date the mark every time anything at all was finished, so a mark earned in June would claim to have
 * happened today — a small untruth, and on a surface whose only job is to be believable those are the expensive
 * kind.
 *
 * This description used to sit above `weeksReachedAt`, one function too early, so that function carried the
 * wrong text and this one carried none. Comment drift of exactly the kind the `.groups` dead class was
 * (docs/RESEARCH.md §10), and the convention in AGENTS.md exists to prevent.
 */
function breadthReachedAt(s: ProgressSnapshot, n: number): string | null {
    if (s.projectsFinishedIn < n) return null;
    const seen = new Set<string>();
    for (let i = s.finished.length - 1; i >= 0; i--) {
        seen.add(s.finished[i].project);
        if (seen.size === n) return s.finished[i].done_at;
    }
    return s.lastDoneAt;
}

/** Every mark that has actually happened, most recent first. */
export function marks(s: ProgressSnapshot): Mark[] {
    return MARKS
        .map(def => {
            const { have, need } = def.progress(s);
            if (have < need) return null;
            const at = def.at(s);
            if (!at) return null;
            return {
                slug: def.slug, category: def.category, tier: def.tier,
                label: def.label(s), detail: def.detail?.(s) ?? null, at,
            } satisfies Mark;
        })
        .filter((m): m is Mark => m !== null)
        .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * What is coming, with honest arithmetic.
 *
 * `toGo` is `need - have` and nothing else — no rounding, no "almost there", no percentage that flatters a
 * long way to go. Check P5 parses these off the rendered page and asserts them against this function, so a
 * target that drifts from the truth fails the suite.
 *
 * Nearest-first, and only a few: the point is a sense of what is next, not a to-do list of achievements. A
 * mark whose target is more than about triple the current figure is not "next", it is a wall, so it is left
 * out until it is genuinely in reach.
 */
export function nextUp(s: ProgressSnapshot, limit = 3): NextMark[] {
    return MARKS
        .map(def => {
            const { have, need } = def.progress(s);
            if (have >= need) return null;
            return {
                slug: def.slug, category: def.category, tier: def.tier,
                label: def.label(s), have, need, toGo: need - have,
                // Spread rather than assigned: tsconfig has exactOptionalPropertyTypes, so an explicit
                // `unit: undefined` is not the same as an absent optional property.
                ...(def.unit ? { unit: def.unit } : {}),
            } satisfies NextMark;
        })
        .filter((m): m is NextMark => m !== null)
        // Sort by how close it is in PROPORTION, so "1 of 2 projects" beats "9 of 250 tasks".
        .sort((a, b) => (b.have / b.need) - (a.have / a.need) || a.toGo - b.toGo)
        .slice(0, limit);
}
