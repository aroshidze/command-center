/**
 * The whole vocabulary of the hub. Deliberately four nouns and nothing else.
 *
 * The temptation with a tool like this is to grow it: priorities, labels, due dates, sprints, epics,
 * a roadmap page, a docs page. docs/RESEARCH.md §7 explains why each of those is a rot vector rather
 * than a feature. If you are an agent reading this and thinking of adding a field, the test is: does it
 * remove a step from someone's day right now? If not, it does not go in.
 */

/** A question's legal responses, declared by the ASKING agent, not chosen by the human. */
export type ResponseType = 'accept' | 'choose' | 'respond' | 'ignore';

/**
 * Adapted from LangChain's Agent Inbox HumanResponse vocabulary
 * (https://github.com/langchain-ai/agent-inbox — accept | edit | response | ignore).
 *
 * `edit` was dropped and `choose` added. `edit` presumes the agent proposed a structured tool call that
 * the human amends, which does not exist here. The real shape of these decisions is "one of these N",
 * so that is what gets first-class support. See docs/RESEARCH.md §3.
 */
export const RESPONSE_TYPES: ResponseType[] = ['accept', 'choose', 'respond', 'ignore'];

export interface QuestionOption {
    /**
     * Short, stable, `a-z0-9_-` only, max 12 chars.
     *
     * The cap is not arbitrary: this key travels inside a Telegram `callback_data` string, which the
     * Bot API limits to 64 bytes total. See lib/telegram.ts.
     */
    key: string;
    label: string;
    /** One line on what picking this actually means. Optional, but a bare label is often not enough. */
    detail?: string;
    /** Marks the agent's own preference. Rendered first and highlighted. */
    recommended?: boolean;
}

export interface Question {
    id: string;
    project: string;
    /** Agent-supplied idempotency key, unique per project. Re-asking with the same key updates. */
    key: string | null;
    title: string;
    /** Why this decision matters and what is blocked by it. Kept short — this is read on a phone. */
    context: string | null;
    options: QuestionOption[];
    allow: ResponseType[];
    /**
     * The heart of the design. If the human has not answered by `deadline`, the agent is authorised to
     * proceed with this option key instead of guessing or stalling. See docs/DECISION.md.
     */
    default_option: string | null;
    deadline: string | null;
    status: 'open' | 'answered' | 'defaulted' | 'ignored';
    answer_type: ResponseType | 'default' | null;
    answer_option: string | null;
    answer_text: string | null;
    /**
     * A comment attached to any answer, including a tapped option.
     *
     * "My answer is A, but make sure you also do B" is an extremely common shape and the first version of
     * this hub could not express it — picking an option meant the caveat went back into chat, which is
     * the failure this whole thing exists to remove. Optional: the common case is still one tap.
     */
    answer_note: string | null;
    answered_at: string | null;
    asked_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface TaskStep {
    /** Imperative, one action. Name the exact button label in **bold**. */
    do: string;
    /** The reason, the caveat, the thing that is not obvious. Optional. */
    detail?: string;
    /**
     * An exact value to use, rendered with a tap-to-copy button.
     *
     * NEVER a secret. Not an API key, not a token, not a password. The hub stores no secrets by rule —
     * that is what keeps its authentication proportionate (docs/RESEARCH.md §5). Put "copy it from the
     * Vercel dashboard" in `detail` instead, and let the secret stay where it already lives.
     */
    copy?: string;
}

export interface Task {
    id: string;
    project: string;
    key: string | null;
    title: string;
    /** One line: what becomes true once this is done. Not a restatement of the title. */
    why: string | null;
    minutes: number | null;
    steps: TaskStep[];
    /** How the human knows it worked, without asking an agent. Every task needs one. */
    verify: string | null;
    /** The ways THIS task specifically goes wrong. Only real ones. */
    gotchas: string[];
    /** Set when the task cannot be started yet, with the reason. Excluded from the actionable count. */
    blocked_reason: string | null;
    status: 'open' | 'done' | 'dropped';
    /** Free text from the human back to the agent. The return channel. */
    note: string | null;
    created_at: string;
    updated_at: string;
    done_at: string | null;
}

export interface Note {
    id: string;
    /** Null means the note is not about one project. */
    project: string | null;
    body: string;
    source: 'telegram' | 'web' | 'api';
    created_at: string;
}

export type EventKind =
    | 'task.created'
    | 'task.done'
    | 'task.reopened'
    | 'task.note'
    | 'task.dropped'
    | 'question.asked'
    | 'question.answered'
    /*
     * A nudge on a decision that has a timed default and has not been answered yet.
     *
     * This kind IS the storage for the reminder ladder: the number of nudges sent for a question is
     * `count(events where kind = 'question.reminded' and ref_id = <id>)`, and there is no column anywhere
     * that also holds it. See lib/reminders.ts for why that is the design rather than a shortcut.
     *
     * Agents see it in `changed`, and it is worth reading: "he has been nudged twice and still has not
     * answered" is a different situation from "asked ten minutes ago".
     */
    | 'question.reminded'
    | 'question.defaulted'
    | 'question.ignored'
    | 'note.created'
    /* A note the human took back. The note.created event it refers to is deliberately NOT removed — see
     * removeNote in lib/store.ts. An agent that already read the note was not lied to. */
    | 'note.withdrawn'
    /*
     * WHERE A PROJECT STANDS, filed by the agent that did the work. See `briefs` in lib/schema.ts.
     *
     * An event as well as a row, because a brief is the one thing in this hub that the NEXT agent most
     * needs and would otherwise never learn about: `cc sync` hands back what changed since it last looked,
     * and "somebody wrote down where this project stands" belongs in that list beside a filed task. It is
     * how a second agent picking up tomorrow discovers there is a brief worth reading rather than starting
     * from the raw transcript.
     */
    | 'brief.filed';

export interface Event {
    seq: number;
    at: string;
    kind: EventKind;
    project: string | null;
    ref_id: string | null;
    /** A one-line human-readable summary, precomputed so `sync` never needs a join to be readable. */
    summary: string;
}

/** The single response an agent gets from one call. Keep it small; see lib/sync.ts. */
export interface SyncResponse {
    ok: true;
    now: string;
    /** Pass this back as `since` next time. Monotonic. */
    cursor: number;
    since: number;
    agent: string;
    /** Null on an agent's very first sync. */
    last_sync_at: string | null;
    hours_since_last_sync: number | null;
    /** Everything that happened after `since`. This is the "what changed" half. */
    changed: Event[];
    /**
     * True when `changed` hit its 200-row page and there is more history waiting. Sync again immediately
     * rather than at the next poll.
     *
     * It exists because the cursor used to jump to the head of the log regardless of the page size, so those
     * extra events were skipped permanently and nothing said so — see the comment in `syncFor`. `false` is
     * the answer on essentially every call; when it is true, one more round trip clears it.
     */
    more: boolean;
    /**
     * Open items are returned UNCONDITIONALLY, ignoring the cursor.
     *
     * This is the load-bearing reliability property: a lost, stale or wrong cursor degrades the
     * convenience of `changed` and can never hide work that is still waiting. Correctness over
     * token count. See docs/DECISION.md.
     */
    open_questions: Question[];
    /**
     * `note` is included in full. It is the human's reply, and it was previously only reachable through a
     * 200-character event summary with no read-by-id for tasks — so a longer note could not be read at all.
     */
    open_tasks: Pick<
        Task, 'id' | 'project' | 'title' | 'minutes' | 'blocked_reason' | 'created_at' | 'note'
    >[];
    /** Questions resolved by their timed default rather than by a human tap. Read these carefully. */
    defaulted_questions: Question[];
    /** The project this sync was restricted to, or null if it covered everything. */
    scope: string | null;
    counts: {
        open_questions: number;
        open_tasks: number;
        blocked_tasks: number;
        unread_changes: number;
    };
    /**
     * Only set on a scoped sync. Scoping makes other projects quieter, never invisible — an agent should
     * still be able to say "there are three tasks waiting on you in two other projects".
     */
    elsewhere: { projects: number; open_tasks: number; open_questions: number } | null;
}
