import { ensureSchema, sql, writeVerified, WriteFailed } from './db';
import {
    newApprovalId, newBriefId, newNoteId, newQuestionId, newReportId, newSubagentId, newTaskId,
    KEY_RE, OPTION_KEY_RE,
} from './ids';
import type { PresenceRow } from './presence';
import {
    REPORT_BODY_MAX, RUN_GAP_MINUTES, redactSecrets, stripInjectedContext,
} from './reports';
import type { Report, ReportKind } from './reports';
/*
 * A VALUE IMPORT FROM `lib/timeline.ts`, AND IT IS SAFE IN THIS DIRECTION ONLY.
 *
 * `lib/timeline.ts` must stay loadable by Node's type-stripping — `tests/use-it.mjs` imports
 * `buildTimeline` directly to assert the chart's arithmetic without a browser — so it may never import a
 * value from anywhere. It imports two TYPES from this file, which are erased, so nothing here is
 * reachable from it at runtime and this import cannot close a cycle. The rule to keep: things flow from
 * timeline into store, never the other way.
 *
 * `baseSession` lives there rather than here because it is the one definition of what a run id means, and
 * the module that draws the runs is where a reader looks for it.
 */
import { baseSession } from './timeline';
import { MIN_GAP_MINUTES, nudgeStanding } from './reminders';
import { sanitiseForDisplay, sanitiseToolName } from './sanitise';
import { likePattern, score, terms } from './search';
import type { SearchRow } from './search';
import { sendReminder, telegramConfigured } from './telegram';
import type {
    Event, EventKind, Note, Question, QuestionOption, ResponseType, SyncResponse, Task, TaskStep,
} from './types';
import { RESPONSE_TYPES } from './types';
import { RECORD_WINDOW } from './progress';
import type { DecisionTuple, FinishedRow, FinishedTuple, History } from './progress';

/* ------------------------------------------------------------------------------------------------
 * Row mapping
 *
 * Everything crossing the boundary is normalised here: timestamps to ISO strings, jsonb to typed
 * objects. Doing it in one place means the API, the page and the CLI all see identical shapes, and a
 * driver upgrade that changes how it parses a timestamptz breaks one function instead of nine.
 * ---------------------------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null =>
    v == null ? null : v instanceof Date ? v.toISOString() : String(v);

const json = <T,>(v: unknown, fallback: T): T => {
    if (v == null) return fallback;
    if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
    return v as T;
};

function mapTask(r: Row): Task {
    return {
        id: String(r.id),
        project: String(r.project),
        key: r.key == null ? null : String(r.key),
        title: String(r.title),
        why: r.why == null ? null : String(r.why),
        minutes: r.minutes == null ? null : Number(r.minutes),
        steps: json<TaskStep[]>(r.steps, []),
        verify: r.verify == null ? null : String(r.verify),
        gotchas: json<string[]>(r.gotchas, []),
        blocked_reason: r.blocked_reason == null ? null : String(r.blocked_reason),
        status: r.status as Task['status'],
        note: r.note == null ? null : String(r.note),
        created_at: iso(r.created_at)!,
        updated_at: iso(r.updated_at)!,
        done_at: iso(r.done_at),
    };
}

/**
 * A completed task, narrowed to what the record reads. See `FinishedRow` in lib/progress.ts for the numbers.
 *
 * Separate from `mapTask` rather than a variant of it, because the two answer different questions: `mapTask`
 * produces the whole task an agent wrote and the detail pane renders, and this produces the handful of fields a
 * count is folded over. Sharing one mapper would mean the narrow path silently pulling the wide one's columns
 * back in the first time somebody added a field.
 */
export function mapFinishedRow(r: Row): FinishedRow {
    return {
        id: String(r.id),
        project: String(r.project),
        title: String(r.title),
        why: r.why == null ? null : String(r.why),
        minutes: r.minutes == null ? null : Number(r.minutes),
        stepCount: r.step_count == null ? 0 : Number(r.step_count),
        status: r.status as Task['status'],
        note: r.note == null ? null : String(r.note),
        noted: r.note != null && String(r.note).trim() !== '',
        created_at: iso(r.created_at)!,
        done_at: iso(r.done_at),
    };
}

function mapQuestion(r: Row): Question & { tg_message_id: number | null } {
    return {
        id: String(r.id),
        project: String(r.project),
        key: r.key == null ? null : String(r.key),
        title: String(r.title),
        context: r.context == null ? null : String(r.context),
        options: json<QuestionOption[]>(r.options, []),
        allow: json<ResponseType[]>(r.allow, ['choose']),
        default_option: r.default_option == null ? null : String(r.default_option),
        deadline: iso(r.deadline),
        status: r.status as Question['status'],
        answer_type: (r.answer_type ?? null) as Question['answer_type'],
        answer_option: r.answer_option == null ? null : String(r.answer_option),
        answer_text: r.answer_text == null ? null : String(r.answer_text),
        answer_note: r.answer_note == null ? null : String(r.answer_note),
        answered_at: iso(r.answered_at),
        asked_by: r.asked_by == null ? null : String(r.asked_by),
        created_at: iso(r.created_at)!,
        updated_at: iso(r.updated_at)!,
        tg_message_id: r.tg_message_id == null ? null : Number(r.tg_message_id),
    };
}

const mapNote = (r: Row): Note => ({
    id: String(r.id),
    project: r.project == null ? null : String(r.project),
    body: String(r.body),
    source: r.source as Note['source'],
    created_at: iso(r.created_at)!,
});

const mapEvent = (r: Row): Event => ({
    seq: Number(r.seq),
    at: iso(r.at)!,
    kind: r.kind as EventKind,
    project: r.project == null ? null : String(r.project),
    ref_id: r.ref_id == null ? null : String(r.ref_id),
    summary: String(r.summary),
});

/* ------------------------------------------------------------------------------------------------
 * Validation
 * ---------------------------------------------------------------------------------------------- */

export class Invalid extends Error {
    constructor(msg: string) { super(msg); this.name = 'Invalid'; }
}

const str = (v: unknown, field: string, max: number, required = false): string | null => {
    if (v == null || v === '') {
        if (required) throw new Invalid(`${field} is required`);
        return null;
    }
    if (typeof v !== 'string') throw new Invalid(`${field} must be a string`);
    const t = v.trim();
    if (required && !t) throw new Invalid(`${field} is required`);
    if (t.length > max) throw new Invalid(`${field} is longer than ${max} characters`);
    return t || null;
};

const PROJECT_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/**
 * SPEND THAT BELONGS TO NO KNOWN PROJECT, under a name no real project can have.
 *
 * Claude Code records usage against a `cwd`, and plenty of cwds are not projects — a scratch folder, a
 * dependency's source tree, a checkout under `Downloads`. Those tokens were really spent, so dropping them
 * would make the total quietly wrong, and attributing them to the deepest path segment would invent a
 * project called `node_modules`. They go here instead, and the page states the figure as its own line.
 *
 * The parentheses are the point: `PROJECT_RE` refuses them, so this string cannot be produced by any real
 * slug and the page can identify it by name without a flag column. Exported so `app/api/agent/spend`
 * and this file cannot drift about what the sentinel is — the first version had it written out in both
 * places, and the validator below then rejected the value the route was sending.
 */
export const SPEND_ELSEWHERE = '(elsewhere)';

function project(v: unknown): string {
    const s = str(v, 'project', 40, true)!.toLowerCase();
    if (s === SPEND_ELSEWHERE) return s;
    if (!PROJECT_RE.test(s)) {
        throw new Invalid(
            `project "${s}" must be lowercase letters, digits, dot, dash or underscore — it is a slug, ` +
            `not a display name (e.g. "riff-kitchen").`,
        );
    }
    return s;
}

/*
 * The no-secrets rule, enforced rather than merely documented.
 *
 * lib/auth.ts is only proportionate because the hub holds nothing worth stealing, so "we promise not to
 * put keys in it" is not good enough — one agent in six months' time doing the helpful-looking thing
 * would quietly turn this into a credential store with a bearer token in a URL.
 *
 * Honest about what this is: a pattern check, not a proof. It catches the shapes that actual keys have.
 * It cannot catch an arbitrary high-entropy string, and it is not trying to — tests/prove-failures.mjs
 * confirms it rejects real credential formats rather than asserting that it "looks fine".
 */
const SECRET_PATTERNS: [RegExp, string][] = [
    [/\bsk-[A-Za-z0-9_-]{16,}/, 'an OpenAI-style secret key'],
    [/\bsk-ant-[A-Za-z0-9_-]{16,}/, 'an Anthropic API key'],
    [/\bgh[pousr]_[A-Za-z0-9]{16,}/, 'a GitHub token'],
    [/\bAIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
    [/\bxox[baprs]-[0-9A-Za-z-]{10,}/, 'a Slack token'],
    [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT'],
    [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, 'a Telegram bot token'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
    [/\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s:]+:[^\s@]+@/, 'a database URL with a password in it'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
];

/*
 * The prefix list above only catches credentials that announce themselves. Plenty do not.
 *
 * Found the hard way while migrating another project's tasks into the hub: one of them carried a real
 * VAPID private key — `CazWiEBmS7lorohHtvA0p0fsuI-4_xju8DBPP3nSHe0` — as a value to paste. No prefix, no
 * recognisable shape, sailed straight past every pattern. The rule was "the hub stores no secrets" and the
 * enforcement was "the hub stores no secrets that look like the ones I thought of", which is the
 * proxy-measurement failure from brief §6 in my own safety check.
 *
 * So: also refuse anything that looks like key material generically — long, unbroken, and mixing
 * character classes the way random bytes do and human-readable values do not.
 *
 * Tuned to let real values through, because a rule that refuses everything trains agents to stop using
 * tap-to-copy at all. `riff.kitchen`, `recipe-images-prod`, `https://riff.kitchen/api/auth/callback`,
 * `@riffkitchen` and a line of SQL all pass — they are short, or contain spaces, or do not mix cases.
 * tests/prove-failures.mjs asserts both directions.
 */
function looksLikeKeyMaterial(value: string): boolean {
    const v = value.trim();
    if (v.length < 24) return false;
    if (/\s/.test(v)) return false;                    // real key material has no spaces
    if (/^https?:\/\//i.test(v)) return false;         // URLs are long and legitimate
    if (!/^[A-Za-z0-9_\-+/=.]+$/.test(v)) return false; // punctuation implies prose, not a key

    const hasLower = /[a-z]/.test(v);
    const hasUpper = /[A-Z]/.test(v);
    const hasDigit = /[0-9]/.test(v);
    if (!(hasLower && hasUpper && hasDigit)) return false;

    // Distinct-character ratio: random bytes use most of their alphabet, words repeat letters.
    const distinct = new Set(v).size;
    return distinct / v.length > 0.45;
}

export function findSecret(value: string): string | null {
    for (const [re, what] of SECRET_PATTERNS) if (re.test(value)) return what;
    if (looksLikeKeyMaterial(value)) {
        return 'random key material (long, no spaces, mixed case and digits) — a token, key or secret';
    }
    return null;
}

function assertNoSecret(value: string, where: string): void {
    const what = findSecret(value);
    if (what) {
        throw new Invalid(
            `${where} looks like ${what}, and the hub stores no secrets by rule. Say WHERE to get the ` +
            `value instead (e.g. "copy it from Vercel → Settings → Environment Variables") and leave ` +
            `the secret where it already lives. See lib/auth.ts for why this rule is load-bearing.`,
        );
    }
}

function steps(v: unknown): TaskStep[] {
    if (v == null) return [];
    if (!Array.isArray(v)) throw new Invalid('steps must be an array');
    if (v.length > 30) throw new Invalid('steps has more than 30 entries; split the task');
    return v.map((raw, i) => {
        if (typeof raw === 'string') return { do: raw };
        if (typeof raw !== 'object' || !raw) throw new Invalid(`steps[${i}] must be an object`);
        const s = raw as Row;
        const step: TaskStep = { do: str(s.do, `steps[${i}].do`, 600, true)! };
        const detail = str(s.detail, `steps[${i}].detail`, 1200);
        if (detail) step.detail = detail;
        const copy = str(s.copy, `steps[${i}].copy`, 400);
        if (copy) {
            assertNoSecret(copy, `steps[${i}].copy`);
            step.copy = copy;
        }
        return step;
    });
}

function options(v: unknown): QuestionOption[] {
    if (v == null) return [];
    if (!Array.isArray(v)) throw new Invalid('options must be an array');
    if (v.length > 6) {
        throw new Invalid(
            'options has more than 6 entries. This is answered one-handed on a phone; if there are ' +
            'genuinely more than six choices, the question needs narrowing before it is asked.',
        );
    }
    const seen = new Set<string>();
    return v.map((raw, i) => {
        if (typeof raw !== 'object' || !raw) throw new Invalid(`options[${i}] must be an object`);
        const o = raw as Row;
        /*
         * Bounded generously here and then checked against OPTION_KEY_RE below, rather than capped at 12
         * by `str`. If the generic length check fires first, the agent is told "longer than 12
         * characters" with no hint as to why 12 is the number — and an error that does not explain
         * itself gets worked around instead of understood. The regex path explains the Telegram budget.
         */
        const key = str(o.key, `options[${i}].key`, 64, true)!.toLowerCase();
        if (!OPTION_KEY_RE.test(key)) {
            throw new Invalid(
                `options[${i}].key "${key}" must be 1-12 chars of a-z, 0-9, _ or -. The cap exists ` +
                `because this key travels inside a 64-byte Telegram callback_data.`,
            );
        }
        if (seen.has(key)) throw new Invalid(`options[${i}].key "${key}" is duplicated`);
        seen.add(key);
        const opt: QuestionOption = { key, label: str(o.label, `options[${i}].label`, 60, true)! };
        const detail = str(o.detail, `options[${i}].detail`, 300);
        if (detail) opt.detail = detail;
        if (o.recommended === true) opt.recommended = true;
        return opt;
    });
}

function allow(v: unknown, opts: QuestionOption[]): ResponseType[] {
    let list: ResponseType[];
    if (v == null) list = opts.length ? ['choose', 'ignore'] : ['accept', 'ignore'];
    else if (!Array.isArray(v)) throw new Invalid('allow must be an array');
    else list = v.map(x => {
        if (!RESPONSE_TYPES.includes(x as ResponseType)) {
            throw new Invalid(`allow contains "${x}"; must be one of ${RESPONSE_TYPES.join(', ')}`);
        }
        return x as ResponseType;
    });

    if (!list.length) throw new Invalid('allow cannot be empty — the human needs at least one way to reply');
    if (list.includes('choose') && !opts.length) {
        throw new Invalid('allow includes "choose" but no options were given');
    }
    if (opts.length && !list.includes('choose')) {
        throw new Invalid('options were given but "choose" is not in allow, so they would not render');
    }
    return [...new Set(list)];
}

/* ------------------------------------------------------------------------------------------------
 * Events
 * ---------------------------------------------------------------------------------------------- */

async function logEvent(
    kind: EventKind, proj: string | null, refId: string | null, summary: string,
): Promise<void> {
    await sql()`
        insert into events (kind, project, ref_id, summary)
        values (${kind}, ${proj}, ${refId}, ${summary.slice(0, 400)})
    `;
}

/* ------------------------------------------------------------------------------------------------
 * Tasks
 * ---------------------------------------------------------------------------------------------- */

export interface TaskInput {
    project: unknown; title: unknown; key?: unknown; why?: unknown; minutes?: unknown;
    steps?: unknown; verify?: unknown; gotchas?: unknown; blocked_reason?: unknown;
}

export async function upsertTask(input: TaskInput): Promise<{ task: Task; created: boolean }> {
    const proj = project(input.project);
    const title = str(input.title, 'title', 200, true)!;
    const key = input.key == null ? null : str(input.key, 'key', 40, true)!.toLowerCase();
    if (key && !KEY_RE.test(key)) throw new Invalid(`key "${key}" must match ${KEY_RE}`);

    const why = str(input.why, 'why', 400);
    const verify = str(input.verify, 'verify', 600);
    const stepList = steps(input.steps);
    const blocked = str(input.blocked_reason, 'blocked_reason', 300);

    let minutes: number | null = null;
    if (input.minutes != null) {
        const n = Number(input.minutes);
        if (!Number.isFinite(n) || n < 0 || n > 600) throw new Invalid('minutes must be 0-600');
        minutes = Math.round(n);
    }

    let gotchas: string[] = [];
    if (input.gotchas != null) {
        if (!Array.isArray(input.gotchas)) throw new Invalid('gotchas must be an array of strings');
        gotchas = input.gotchas.map((g, i) => str(g, `gotchas[${i}]`, 400, true)!);
    }

    // A task with no verify step is a task you cannot close without asking someone. That is the
    // "no decision hook" failure from docs/RESEARCH.md §7 arriving one row at a time, so it is a hard
    // requirement rather than a lint.
    if (!verify) {
        throw new Invalid(
            'verify is required: one line on how the human knows it worked, without having to ask an ' +
            'agent. If you cannot write one, the task is not specified well enough to hand over.',
        );
    }

    const existing = key
        ? (await sql()`select * from tasks where project = ${proj} and key = ${key}` as Row[])
        : [];
    const created = existing.length === 0;
    const id = created ? newTaskId() : String(existing[0].id);

    const stepsJson = JSON.stringify(stepList);
    const gotchasJson = JSON.stringify(gotchas);

    const row = await writeVerified<Row>({
        what: created ? `create task "${title}"` : `update task "${title}"`,
        write: () => created
            ? sql()`
                insert into tasks (id, project, key, title, why, minutes, steps, verify, gotchas,
                                   blocked_reason)
                values (${id}, ${proj}, ${key}, ${title}, ${why}, ${minutes}, ${stepsJson}::jsonb,
                        ${verify}, ${gotchasJson}::jsonb, ${blocked})
                returning *
              ` as Promise<Row[]>
            : sql()`
                update tasks set title = ${title}, why = ${why}, minutes = ${minutes},
                       steps = ${stepsJson}::jsonb, verify = ${verify},
                       gotchas = ${gotchasJson}::jsonb, blocked_reason = ${blocked},
                       updated_at = now()
                where id = ${id}
                returning *
              ` as Promise<Row[]>,
        reread: () => sql()`select * from tasks where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.id) !== id) return `id is "${String(r.id)}", expected "${id}"`;
            if (String(r.title) !== title) return `title is "${String(r.title)}", expected "${title}"`;
            if (String(r.project) !== proj) return `project is "${String(r.project)}"`;
            const storedSteps = json<TaskStep[]>(r.steps, []);
            if (storedSteps.length !== stepList.length) {
                return `steps has ${storedSteps.length} entries, expected ${stepList.length}`;
            }
            return null;
        },
    });

    if (created) await logEvent('task.created', proj, id, `New task: ${title}`);
    return { task: mapTask(row), created };
}

/**
 * Should filing this task ping his phone, and how much is waiting if so?
 *
 * ONE MESSAGE PER BURST, NOT PER TASK — which is what he chose when asked, and it is the right shape: his
 * agents file in bursts. riff-kitchen filed nine tasks in one go, and nine notifications for one sitting-down
 * is how a channel gets muted. docs/RESEARCH.md §27.3 is the evidence: OpenAI measured 3 interruptions per 720
 * boundary-crossings under auto-review and argued that frequent prompts get BYPASSED rather than obeyed. A muted
 * channel is a dead hub (§7 cause 5), so the volume matters as much as the existence.
 *
 * NO NEW TABLE AND NO CRON. The burst is detected from `created_at`, which is already there: if another task
 * arrived in this project inside the window, the burst has already announced itself and this one is silent. The
 * quiet is per PROJECT rather than global, because two projects filing at once are two separate things he needs
 * to know about. AGENTS.md forbids a scheduler and this needs none — the question is answered lazily, at the
 * moment of the write, from rows that exist.
 *
 * `waiting` counts ACTIONABLE work only, matching the header chip and `openTasks` in lib/progress.ts. A blocked
 * task is waiting on somebody else and must never be counted as something he has failed to do.
 *
 * Returns `notify: false` for a blocked task as well: announcing work he is not able to start yet is noise, and
 * it would make the count in the message disagree with the count on the page.
 */
export async function taskNotifyDecision(
    id: string, proj: string, blocked: boolean, windowMinutes = 10,
): Promise<{ notify: boolean; waiting: number; reason: TaskNotifyReason }> {
    const rows = await sql()`
        select
            (select count(*)::int from tasks
              where status = 'open' and blocked_reason is null)                     as waiting,
            /* Integer times interval, NOT integer concatenated with a string and cast. The first version
               concatenated, which is not a valid operator for an integer left-hand side in Postgres: it threw,
               the catch in the route swallowed it, and every task reported notify_reason null while the burst
               rule was never consulted at all. Multiplying an interval needs no cast.
               And NO BACKTICKS in here -- this is inside a template literal, and putting a pair in this very
               comment is what broke the build a moment ago. Trap 1 in AGENTS.md, fifth time in this project. */
            (select count(*)::int from tasks
              where project = ${proj} and id <> ${id}
                and created_at > now() - (${windowMinutes} * interval '1 minute')) as recent
    ` as Row[];
    const waiting = Number(rows[0]?.waiting ?? 0);
    const recent = Number(rows[0]?.recent ?? 0);

    if (blocked) return { notify: false, waiting, reason: 'blocked' };
    if (recent > 0) return { notify: false, waiting, reason: 'burst' };
    return { notify: true, waiting, reason: null };
}

/**
 * Why a task did not ping his phone, returned to the agent that filed it.
 *
 * The questions route has always returned `notified` honestly so an agent can say "asked, but nobody was
 * alerted" rather than assuming it got through. This is the same idea with the reason attached, and it exists
 * for two concrete purposes.
 *
 * It lets an agent tell the truth: "filed — you were not pinged because riff-kitchen already messaged you a
 * minute ago" is a useful sentence, and "filed, and I have no idea whether you know" is not.
 *
 * And it makes the burst rule TESTABLE. Locally `CC_SUPPRESS_TELEGRAM=yes`, so `notified` is false whatever the
 * decision was — meaning a suite could not tell "the rule said no" from "sending is switched off". Without a
 * reason on the wire, the one piece of logic protecting his phone from nine notifications in a row would have no
 * check at all. `tests/prove.mjs` asserts each of these.
 */
export type TaskNotifyReason = 'blocked' | 'burst' | 'suppressed' | null;

export async function getTask(id: string): Promise<Task | null> {
    const rows = await sql()`select * from tasks where id = ${id}` as Row[];
    return rows[0] ? mapTask(rows[0]) : null;
}

/** Look a task up by the idempotency key it was created with, which is what an agent actually remembers. */
export async function getTaskByKey(proj: string, key: string): Promise<Task | null> {
    const rows = await sql()`
        select * from tasks where project = ${project(proj)} and key = ${key.toLowerCase()}
    ` as Row[];
    return rows[0] ? mapTask(rows[0]) : null;
}

export async function setTaskStatus(id: string, status: Task['status']): Promise<Task> {
    const before = (await sql()`select * from tasks where id = ${id}` as Row[])[0];
    if (!before) throw new Invalid(`no task with id "${id}"`);

    const doneAt = status === 'done' ? new Date().toISOString() : null;

    const row = await writeVerified<Row>({
        what: `mark task "${String(before.title)}" as ${status}`,
        write: () => sql()`
            update tasks
               set status = ${status},
                   -- Cleared on re-open so a second completion records the real second time, not the first.
                   done_at = ${doneAt}::timestamptz,
                   updated_at = now()
             where id = ${id}
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from tasks where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.status) !== status) return `status is "${String(r.status)}", expected "${status}"`;
            if (status === 'done' && r.done_at == null) return 'status is done but done_at is empty';
            if (status !== 'done' && r.done_at != null) return 'done_at should have been cleared';
            return null;
        },
    });

    const task = mapTask(row);
    if (status === 'done') await logEvent('task.done', task.project, id, `Done: ${task.title}`);
    else if (status === 'dropped') await logEvent('task.dropped', task.project, id, `Dropped: ${task.title}`);
    else await logEvent('task.reopened', task.project, id, `Re-opened: ${task.title}`);
    return task;
}

export async function setTaskNote(id: string, note: string): Promise<Task> {
    const body = str(note, 'note', 2000, true)!;
    const before = (await sql()`select * from tasks where id = ${id}` as Row[])[0];
    if (!before) throw new Invalid(`no task with id "${id}"`);

    const row = await writeVerified<Row>({
        what: `save your note on "${String(before.title)}"`,
        write: () => sql()`
            update tasks set note = ${body}, updated_at = now() where id = ${id} returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from tasks where id = ${id}` as Promise<Row[]>,
        expect: r => (String(r.note) === body ? null : 'the stored note does not match what was sent'),
    });

    const task = mapTask(row);
    /*
     * Truncation is DECLARED rather than silent. An event summary that quietly stops mid-sentence looks
     * like the whole note, and an agent acting on half a note is worse than one that knows to go and read
     * the rest. The full text is in `open_tasks[].note` and at GET /api/agent/tasks?id=.
     */
    const shown = body.length > 200 ? `${body.slice(0, 200)}… [truncated, full note on the task]` : body;
    await logEvent('task.note', task.project, id, `Note on "${task.title}": ${shown}`);
    return task;
}

/* ------------------------------------------------------------------------------------------------
 * Questions
 * ---------------------------------------------------------------------------------------------- */

export interface QuestionInput {
    project: unknown; title: unknown; key?: unknown; context?: unknown; options?: unknown;
    allow?: unknown; default_option?: unknown; deadline?: unknown; hours?: unknown;
}

export async function upsertQuestion(
    input: QuestionInput, askedBy: string,
): Promise<{ question: Question & { tg_message_id: number | null }; created: boolean }> {
    const proj = project(input.project);
    const title = str(input.title, 'title', 200, true)!;
    const key = input.key == null ? null : str(input.key, 'key', 40, true)!.toLowerCase();
    if (key && !KEY_RE.test(key)) throw new Invalid(`key "${key}" must match ${KEY_RE}`);

    const context = str(input.context, 'context', 1200);
    const opts = options(input.options);
    const allowed = allow(input.allow, opts);

    const defaultOption = str(input.default_option, 'default_option', 12);
    if (defaultOption && !opts.some(o => o.key === defaultOption)) {
        throw new Invalid(`default_option "${defaultOption}" is not one of the options`);
    }

    // `hours` is the ergonomic form: "give me 12 hours". `deadline` is the explicit ISO form.
    let deadline: string | null = null;
    if (input.deadline != null) {
        const d = new Date(String(input.deadline));
        if (Number.isNaN(d.getTime())) throw new Invalid('deadline is not a valid date');
        deadline = d.toISOString();
    } else if (input.hours != null) {
        const h = Number(input.hours);
        if (!Number.isFinite(h) || h <= 0 || h > 24 * 30) throw new Invalid('hours must be 0-720');
        deadline = new Date(Date.now() + h * 3600_000).toISOString();
    }

    if (defaultOption && !deadline) {
        throw new Invalid('default_option needs a deadline (or hours), or it would never take effect');
    }
    if (deadline && !defaultOption) {
        throw new Invalid(
            'a deadline without a default_option does nothing. Either say what you will do if there is ' +
            'no answer, or drop the deadline.',
        );
    }

    const existing = key
        ? (await sql()`select * from questions where project = ${proj} and key = ${key}` as Row[])
        : [];
    const created = existing.length === 0;
    const id = created ? newQuestionId() : String(existing[0].id);

    // Re-asking an already-answered question must not silently discard the answer. The agent should
    // read the answer it already has rather than ask again with the same key.
    if (!created && existing[0].status !== 'open') {
        throw new Invalid(
            `question "${key}" in "${proj}" was already ${String(existing[0].status)}. Read that answer ` +
            `via sync instead of re-asking, or use a different key if this is genuinely a new decision.`,
        );
    }

    const optsJson = JSON.stringify(opts);
    const allowJson = JSON.stringify(allowed);

    const row = await writeVerified<Row>({
        what: `ask "${title}"`,
        write: () => created
            ? sql()`
                insert into questions (id, project, key, title, context, options, allow,
                                       default_option, deadline, asked_by)
                values (${id}, ${proj}, ${key}, ${title}, ${context}, ${optsJson}::jsonb,
                        ${allowJson}::jsonb, ${defaultOption}, ${deadline}::timestamptz, ${askedBy})
                returning *
              ` as Promise<Row[]>
            : sql()`
                update questions set title = ${title}, context = ${context},
                       options = ${optsJson}::jsonb, allow = ${allowJson}::jsonb,
                       default_option = ${defaultOption}, deadline = ${deadline}::timestamptz,
                       asked_by = ${askedBy}, updated_at = now()
                 where id = ${id}
                returning *
              ` as Promise<Row[]>,
        reread: () => sql()`select * from questions where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.id) !== id) return `id is "${String(r.id)}"`;
            if (String(r.title) !== title) return `title is "${String(r.title)}"`;
            if (String(r.status) !== 'open') return `status is "${String(r.status)}", expected open`;
            const storedOpts = json<QuestionOption[]>(r.options, []);
            if (storedOpts.length !== opts.length) {
                return `options has ${storedOpts.length} entries, expected ${opts.length}`;
            }
            return null;
        },
    });

    if (created) await logEvent('question.asked', proj, id, `Waiting on you: ${title}`);
    return { question: mapQuestion(row), created };
}

export async function getQuestion(id: string): Promise<(Question & { tg_message_id: number | null }) | null> {
    const rows = await sql()`select * from questions where id = ${id}` as Row[];
    return rows[0] ? mapQuestion(rows[0]) : null;
}

export interface ProjectSummary {
    slug: string;
    open_tasks: number;
    open_questions: number;
    minutes: number;
    last_activity: string | null;
}

/**
 * Every project the hub has ever heard of, with its current state.
 *
 * Derived from the event log rather than a `projects` table, deliberately. A project "exists" the moment an
 * agent writes a task or a question against its slug — there is nothing to register, nothing to keep in
 * sync, and no way to end up with a registered project that has no work or a slug that was never declared.
 * Adding a table would mean adding a registration step, and a setup step is a thing to forget.
 *
 * The cost is that a slug typo creates a new project rather than erroring. Accepted: `PROJECT_RE` keeps
 * slugs to a predictable shape, and the installer writes the correct slug into each project's AGENTS.md so
 * an agent never has to invent one.
 */
export async function projects(): Promise<ProjectSummary[]> {
    const rows = await sql()`
        select
            p.project as slug,
            coalesce(t.open_tasks, 0)::int      as open_tasks,
            coalesce(q.open_questions, 0)::int  as open_questions,
            coalesce(t.minutes, 0)::int         as minutes,
            p.last_activity
        from (
            select project, max(at) as last_activity
            from events where project is not null group by project
        ) p
        left join (
            select project, count(*) as open_tasks, sum(coalesce(minutes, 0)) as minutes
            from tasks where status = 'open' group by project
        ) t on t.project = p.project
        left join (
            select project, count(*) as open_questions
            from questions where status = 'open' group by project
        ) q on q.project = p.project
        order by (coalesce(q.open_questions, 0) + coalesce(t.open_tasks, 0)) desc, p.last_activity desc
    ` as Row[];

    return rows.map(r => ({
        slug: String(r.slug),
        open_tasks: Number(r.open_tasks),
        open_questions: Number(r.open_questions),
        minutes: Number(r.minutes),
        last_activity: iso(r.last_activity),
    }));
}

/** Every question still waiting on the human. Used by the re-push path. */
export async function openQuestionIds(): Promise<string[]> {
    const rows = await sql()`
        select id from questions where status = 'open' order by created_at asc
    ` as Row[];
    return rows.map(r => String(r.id));
}

/** Used to turn a swipe-reply in Telegram into that question's answer. See app/api/telegram/route.ts. */
export async function getQuestionByMessageId(
    messageId: number,
): Promise<(Question & { tg_message_id: number | null }) | null> {
    if (!Number.isFinite(messageId)) return null;
    const rows = await sql()`
        select * from questions where tg_message_id = ${messageId} limit 1
    ` as Row[];
    return rows[0] ? mapQuestion(rows[0]) : null;
}

export async function setQuestionMessageId(id: string, messageId: number | null): Promise<void> {
    if (messageId == null) return;
    // Not routed through writeVerified: this is bookkeeping for a nicer Telegram thread, not state the
    // human or an agent relies on. Losing it costs a message edit, not a decision.
    await sql()`update questions set tg_message_id = ${messageId} where id = ${id}`;
}

export interface AnswerInput {
    type: ResponseType;
    option?: string | null;
    text?: string | null;
    /**
     * Optional commentary alongside the answer, whatever its type. Allowed with a tapped option, an
     * approval, or a refusal — "not now, because the account is not verified yet" is as useful as the
     * refusal itself.
     */
    note?: string | null;
}

/** The write that matters most. Nothing reports an answer as saved until the row says so. */
export async function answerQuestion(
    id: string, input: AnswerInput,
): Promise<Question & { tg_message_id: number | null }> {
    const before = (await sql()`select * from questions where id = ${id}` as Row[])[0];
    if (!before) throw new Invalid(`no question with id "${id}"`);

    const q = mapQuestion(before);
    if (q.status !== 'open') {
        throw new Invalid(
            `that question was already ${q.status}${q.answer_option ? ` ("${q.answer_option}")` : ''}. ` +
            `Answering twice is refused so the first answer cannot be silently overwritten.`,
        );
    }
    if (!q.allow.includes(input.type)) {
        throw new Invalid(`"${input.type}" is not one of the allowed replies (${q.allow.join(', ')})`);
    }

    let option: string | null = null;
    let text: string | null = null;
    const note = input.note == null || input.note === '' ? null : str(input.note, 'note', 4000, true)!;

    if (input.type === 'choose') {
        option = str(input.option, 'option', 12, true)!.toLowerCase();
        if (!q.options.some(o => o.key === option)) {
            throw new Invalid(`"${option}" is not one of this question's options`);
        }
    } else if (input.type === 'respond') {
        text = str(input.text, 'text', 2000, true)!;
    }

    const status: Question['status'] = input.type === 'ignore' ? 'ignored' : 'answered';

    const row = await writeVerified<Row>({
        what: `save your answer to "${q.title}"`,
        write: () => sql()`
            update questions
               set status = ${status}, answer_type = ${input.type}, answer_option = ${option},
                   answer_text = ${text}, answer_note = ${note}, answered_at = now(), updated_at = now()
             -- The status guard makes this idempotent under a double-tap: the second write matches zero
             -- rows, writeVerified raises, and the caller is told rather than shown a false success.
             where id = ${id} and status = 'open'
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from questions where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.status) !== status) return `status is "${String(r.status)}", expected "${status}"`;
            if (String(r.answer_type) !== input.type) return `answer_type is "${String(r.answer_type)}"`;
            if (option !== null && String(r.answer_option) !== option) {
                return `answer_option is "${String(r.answer_option)}", expected "${option}"`;
            }
            if (text !== null && String(r.answer_text) !== text) {
                return 'the stored answer text does not match what was sent';
            }
            // The comment is verified as strictly as the answer. A note that silently vanished would be
            // worse than no note, because the human would believe they had told you something.
            if (note !== null && String(r.answer_note) !== note) {
                return 'the stored comment does not match what was sent';
            }
            if (r.answered_at == null) return 'answered_at was not set';
            return null;
        },
    });

    const after = mapQuestion(row);
    const label = option ? (q.options.find(o => o.key === option)?.label ?? option) : null;
    const base =
        input.type === 'ignore' ? `Not now: ${q.title}`
            : input.type === 'respond' ? `Answered "${q.title}": ${text}`
                : input.type === 'accept' ? `Approved: ${q.title}`
                    : `Answered "${q.title}": ${label}`;
    // The comment goes into the event summary, so `cc sync` shows it without a second lookup.
    const summary = note ? `${base}  — and they added: "${note}"` : base;

    await logEvent(input.type === 'ignore' ? 'question.ignored' : 'question.answered',
        q.project, id, summary);
    return after;
}

/**
 * Attach (or extend) a comment on a question that has already been answered.
 *
 * Exists for the Telegram path: a tapped button cannot carry text, so the flow is tap first, then reply
 * to the message if you want to add something. Without this, answering by tap would silently be the
 * lesser option — one tap but no voice — and the whole point is that the fast path is not the poor one.
 *
 * Appends rather than replaces, so a second thought does not erase the first.
 */
export async function appendAnswerNote(
    id: string, note: string,
): Promise<Question & { tg_message_id: number | null }> {
    const body = str(note, 'note', 4000, true)!;
    const before = (await sql()`select * from questions where id = ${id}` as Row[])[0];
    if (!before) throw new Invalid(`no question with id "${id}"`);

    const q = mapQuestion(before);
    if (q.status === 'open') {
        throw new Invalid('that question has not been answered yet, so there is nothing to comment on');
    }

    const combined = q.answer_note ? `${q.answer_note}\n${body}` : body;

    const row = await writeVerified<Row>({
        what: `add your comment to "${q.title}"`,
        write: () => sql()`
            update questions set answer_note = ${combined}, updated_at = now()
             where id = ${id} returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from questions where id = ${id}` as Promise<Row[]>,
        expect: r => (String(r.answer_note) === combined
            ? null
            : 'the stored comment does not match what was sent'),
    });

    await logEvent('question.answered', q.project, id,
        `Comment added to "${q.title}": ${body.slice(0, 300)}`);
    return mapQuestion(row);
}

/**
 * Apply timed defaults to any question whose deadline has passed.
 *
 * Lazy on purpose. A cron job would be a second moving part that has to be kept alive, and the whole
 * point of a default is that it matters at the moment an agent next looks — which is exactly when this
 * runs. No scheduler to forget, nothing to keep warm, and the outcome is identical.
 */
export async function applyDueDefaults(due: Row[]): Promise<Question[]> {
    /*
     * THE ROWS ARE HANDED IN, AND THAT IS TWO DECISIONS RATHER THAN ONE.
     *
     * The first is cost. A round trip to Neon is ~105 ms from the server, and this and `applyDueReminders`
     * need the SAME set — every open question that has a timed default — differing only in which side of
     * `now()` the deadline falls. Reading twice showed up immediately: adding the nudge sweep took the
     * fixture-volume server render from 515 ms to 810 ms against L8's 1,200 ms budget.
     *
     * The second is that there must be ONE definition of that set. The first version kept a fallback query
     * here for callers that had not done the read, which meant the same `where` clause existed in two places
     * — and the fault injection found it before a user did: an injection aimed at this query changed nothing,
     * because the only caller passes rows in and the clause here was dead. Two definitions of a set, one of
     * them unreachable, is exactly the second truth this codebase refuses everywhere else.
     */

    const applied: Question[] = [];
    for (const raw of due) {
        const q = mapQuestion(raw);
        try {
            const row = await writeVerified<Row>({
                what: `apply the timed default to "${q.title}"`,
                write: () => sql()`
                    update questions
                       set status = 'defaulted', answer_type = 'default',
                           answer_option = ${q.default_option}, answered_at = now(), updated_at = now()
                     where id = ${q.id} and status = 'open'
                    returning *
                ` as Promise<Row[]>,
                reread: () => sql()`select * from questions where id = ${q.id}` as Promise<Row[]>,
                expect: r => (String(r.status) === 'defaulted' ? null : `status is "${String(r.status)}"`),
            });
            const label = q.options.find(o => o.key === q.default_option)?.label ?? q.default_option;
            await logEvent('question.defaulted', q.project, q.id,
                `No answer in time, so the stated default applies to "${q.title}": ${label}`);
            applied.push(mapQuestion(row));
        } catch (e) {
            // A concurrent human tap between the SELECT and the UPDATE lands here. The human wins:
            // the guard matched zero rows, so their answer stands and no default is applied.
            if (!(e instanceof WriteFailed)) throw e;
        }
    }
    return applied;
}

/**
 * EVERY OPEN QUESTION THAT CAN RESOLVE WITHOUT HIM, IN ONE READ, SPLIT BY WHETHER IT ALREADY HAS.
 *
 * `past` is for `applyDueDefaults` and `coming` is for `applyDueReminders`. One query instead of two, because
 * a round trip to Neon is ~105 ms and both of these run before the page can render anything — see the note on
 * `prefetched`.
 *
 * The reminder count is joined in here rather than looked up per question, for the same reason: the number of
 * nudges sent lives in `events` and nowhere else, and asking once for all of them is one round trip whether
 * there is one open decision or forty.
 */
async function timedQuestions(): Promise<{ past: Row[]; coming: Row[] }> {
    const rows = await sql()`
        select q.*, (q.deadline < now()) as overdue, coalesce(r.n, 0)::int as reminded
          from questions q
          left join (
              select ref_id, count(*) as n from events
               where kind = 'question.reminded' group by ref_id
          ) r on r.ref_id = q.id
         where q.status = 'open' and q.deadline is not null and q.default_option is not null
    ` as Row[];
    return {
        past: rows.filter(r => r.overdue === true),
        coming: rows.filter(r => r.overdue !== true),
    };
}

/**
 * Apply the timed defaults, then send any nudges that have fallen due. One read for both.
 *
 * IN THAT ORDER, and it is not a preference: a question whose deadline has just passed must RESOLVE rather
 * than be reminded about. Reversing them would send "last call" about a decision the hub had already made,
 * which is the worst sentence this channel could produce.
 */
async function applyTimed(): Promise<void> {
    const { past, coming } = await timedQuestions();
    await applyDueDefaults(past);
    await applyDueReminders(coming);
}

/**
 * How long ago he last did something in the hub, in minutes. Null if he never has.
 *
 * The signal for "he is here, do not push at him" — the same idea `taskNotifyDecision` uses to collapse a
 * burst of filings into one message, pointed at a different question. Only events HE causes count: a task
 * ticked or re-opened, a note written or withdrawn, a decision answered or declined. `task.created` and
 * `question.asked` are agents writing, and treating those as presence would mean an agent filing work at
 * 3am suppressed the nudge that was supposed to wake him about something else.
 */
async function minutesSinceHeWasHere(): Promise<number | null> {
    const rows = await sql()`
        select extract(epoch from (now() - max(at))) / 60 as mins
          from events
         where kind in ('task.done', 'task.reopened', 'task.note',
                        'question.answered', 'question.ignored', 'note.created', 'note.withdrawn')
    ` as Row[];
    const mins = rows[0]?.mins;
    return mins == null ? null : Number(mins);
}

/**
 * DON'T NUDGE SOMEONE WHO IS ALREADY LOOKING. Thirty minutes.
 *
 * Longer than the ten-minute burst window for task filings, because the two are answering different
 * questions. That window asks "did his phone just buzz about this project"; this asks "is he in the middle
 * of a session", and a session has gaps in it — reading a procedure, going to fetch a card. Ten minutes
 * would fire a nudge in the middle of one.
 *
 * A suppressed nudge is NOT consumed. Nothing is logged, so the point stays owed and the next read after
 * the quiet period sends it. The ladder self-heals rather than silently losing a rung.
 */
const QUIET_WHILE_ACTIVE_MINUTES = 30;

/** One question's nudge outcome, returned so a check can see the decision even when nothing was sent. */
export type ReminderOutcome = {
    id: string;
    /** 1-based position in this question's ladder. */
    index: number;
    total: number;
    sent: boolean;
    /** Why not, when `sent` is false and the point was due. */
    reason: 'active' | 'too-soon' | 'no-channel' | 'send-failed' | null;
};

/**
 * Nudge him about anything with a timed default that is running out, on the same lazy path as the defaults.
 *
 * NO CRON, for the reason AGENTS.md gives: a scheduler is a second thing to keep alive. This runs wherever
 * `applyDueDefaults` runs — every page render, every agent sync — which is exactly when the answer matters.
 * The cost when nothing is due is one indexed query.
 *
 * ONLY QUESTIONS THAT CAN RESOLVE WITHOUT HIM. A question with no deadline waits open forever and nothing
 * bad happens if he does not see it today, so nudging about one would be a nag with no failure behind it.
 * The store already refuses a deadline without a default and a default without a deadline, so "has a
 * deadline" and "can resolve without him" are the same set.
 *
 * ONE MESSAGE PER QUESTION PER CALL, EVEN WHEN TWO POINTS ARE OWED — AND THE CATCH-UP IS PACED.
 *
 * If nothing read the hub between 15:00 and 20:00, both rungs of a 09:00–21:00 ladder are due at once. This
 * sends the first and leaves the second owed, which is right. What is NOT right, and was the first version,
 * is that the second then fires on the very next read a second later: two identical-looking messages back
 * to back, which is the muted-channel failure arriving inside the feature built to avoid it. So a nudge
 * also has to be MIN_GAP_MINUTES clear of the previous nudge, measured from the same events that count them.
 * Nothing new is stored to do it.
 *
 * ==================================================================================================
 * THE RUNG IS CLAIMED BEFORE THE MESSAGE IS SENT, AND THAT IS ABOUT A RACE RATHER THAN TIDINESS
 * ==================================================================================================
 *
 * This sweep runs on every read — every page render and every agent sync — and there is no lock. The first
 * version read the nudge count, then made two Telegram calls, then wrote the event. That leaves a window of
 * one to two seconds in which a concurrent read sees the same rung unsent and sends it again: **two identical
 * notifications**, which is precisely the failure the whole one-message-per-burst rule exists to prevent, and
 * it would arrive inside the feature built to protect that channel. Found by reading the code back rather than
 * by a check, and no check here would have caught it — it needs two requests to land inside the same second.
 *
 * So the order is inverted: an `insert ... where not exists` claims the rung first and the message goes out
 * afterwards. That does not make it atomic — two statements can still both find no row under READ COMMITTED —
 * but it collapses the window from the duration of two network calls to the duration of one INSERT, about
 * three orders of magnitude, and the pacing rule then keeps the loser out for twenty minutes. The honest
 * remaining exposure is two requests hitting the same millisecond; a unique index is what would close it
 * properly, and it is not worth a schema change and a stored rung number for a cosmetic duplicate.
 *
 * THE COST OF CLAIMING FIRST, STATED: if the send then fails (a timeout, a 502), the rung has been consumed
 * and no message went out. The event says exactly that rather than claiming a nudge that never left, so the
 * record stays honest — and it is the better of the two failures, because the ladder has a second rung and the
 * deadline message already told him what would happen. The previous order preferred a duplicate over a lost
 * nudge, and a duplicate is what gets the channel muted.
 */
export async function applyDueReminders(rows: Row[]): Promise<ReminderOutcome[]> {
    /*
     * Handed the rows, for the two reasons on `applyDueDefaults`. `reminded` — how many nudges this question
     * has already had — is counted from `events` in `timedQuestions`, because there is no such column and
     * there must not be one. See lib/reminders.ts.
     */
    if (!rows.length) return [];

    const out: ReminderOutcome[] = [];
    let active: number | null | undefined;

    for (const raw of rows) {
        const q = mapQuestion(raw);
        const sent = Number(raw.reminded ?? 0);
        const standing = nudgeStanding(q, sent);
        if (!standing.due) continue;

        // Read once, and only if something is actually due. The common case is that nothing is.
        if (active === undefined) active = await minutesSinceHeWasHere();
        if (active != null && active < QUIET_WHILE_ACTIVE_MINUTES) {
            out.push({ id: q.id, index: standing.index, total: standing.total, sent: false, reason: 'active' });
            continue;
        }

        const label = q.options.find(o => o.key === q.default_option)?.label ?? q.default_option;
        const rung = `${standing.index} of ${standing.total}`;

        /*
         * CLAIM THE RUNG. One statement, and it carries the pacing rule with it — see the header.
         *
         * `not exists` over the last MIN_GAP_MINUTES is both the "do not nudge twice in a row while catching
         * up" rule and the guard against a concurrent read sending the same rung. Having it in the same
         * statement that writes the event is what makes it near-atomic; having it in JS, as the first version
         * did, made it a read followed by two network calls followed by a write.
         *
         * The summary written here is provisional and is corrected below once the outcome is known. It is
         * never left as-is on a successful send.
         */
        const claimed = await sql()`
            insert into events (kind, project, ref_id, summary)
            select 'question.reminded', ${q.project}, ${q.id},
                   ${`Reminder ${rung} on "${q.title}" fell due.`}
             where not exists (
                 select 1 from events
                  where kind = 'question.reminded' and ref_id = ${q.id}
                    and at > now() - (${MIN_GAP_MINUTES} * interval '1 minute'))
            returning seq
        ` as Row[];
        if (!claimed.length) {
            out.push({ id: q.id, index: standing.index, total: standing.total, sent: false, reason: 'too-soon' });
            continue;
        }
        const seq = Number(claimed[0].seq);
        /** Say what actually happened, on the event that already exists. */
        const settle = (summary: string) =>
            sql()`update events set summary = ${summary.slice(0, 400)} where seq = ${seq}`;

        /*
         * NO CHANNEL AND A FAILED SEND ARE DIFFERENT OUTCOMES, and the event says which.
         *
         * Suppressed or unconfigured is every local run, by rule (`CC_SUPPRESS_TELEGRAM=yes`), and it is what
         * makes this whole path checkable without a phone. There is nothing to retry and never will be, so the
         * rung stays consumed and the summary states plainly that nobody was told — an event reading "nudged
         * him" with no channel behind it would be the same class of lie as a "saved" over a rejected write.
         *
         * A configured channel that FAILS also keeps the rung, which is the cost of claiming first and is
         * argued in the header. The summary says so, so nothing in the record overstates what happened.
         */
        if (!telegramConfigured()) {
            await settle(
                `Reminder ${rung} on "${q.title}" fell due and there is no notification channel, so nobody ` +
                `was told. The default "${label}" still applies at the deadline.`);
            out.push({ id: q.id, index: standing.index, total: standing.total, sent: false, reason: 'no-channel' });
            continue;
        }

        const messageId = await sendReminder(q, standing, process.env.CC_PUBLIC_URL ?? '');
        if (messageId == null) {
            await settle(
                `Reminder ${rung} on "${q.title}" fell due and Telegram REFUSED IT, so he has not been told. ` +
                `The default "${label}" still applies at the deadline.`);
            out.push({ id: q.id, index: standing.index, total: standing.total, sent: false, reason: 'send-failed' });
            continue;
        }
        await setQuestionMessageId(q.id, messageId);
        await settle(
            `Nudged him about "${q.title}" (${rung})${standing.last ? ', which was the last one' : ''}. ` +
            `Still unanswered; "${label}" applies at the deadline.`);
        out.push({ id: q.id, index: standing.index, total: standing.total, sent: true, reason: null });
    }
    return out;
}

/* ------------------------------------------------------------------------------------------------
 * Notes — the human's unprompted channel to agents
 * ---------------------------------------------------------------------------------------------- */

export async function addNote(
    body: unknown, source: Note['source'], proj?: unknown,
): Promise<Note> {
    const text = str(body, 'body', 4000, true)!;
    const p = proj == null || proj === '' ? null : project(proj);
    const id = newNoteId();

    const row = await writeVerified<Row>({
        what: 'save your note',
        write: () => sql()`
            insert into notes (id, project, body, source) values (${id}, ${p}, ${text}, ${source})
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from notes where id = ${id}` as Promise<Row[]>,
        expect: r => (String(r.body) === text ? null : 'the stored note does not match what was sent'),
    });

    const note = mapNote(row);
    await logEvent('note.created', p, id, `Note${p ? ` (${p})` : ''}: ${text.slice(0, 300)}`);
    return note;
}

/**
 * Withdraw a note the human wrote. Returns false if there was no such note.
 *
 * Verified by re-reading, like every other write here — a delete that reports success without checking the row
 * is actually gone is the same defect as a write that reports "saved" without re-reading it, and this one is
 * harder to notice, because the absence it claims looks identical to the absence it failed to create.
 *
 * The `note.created` event is left alone on purpose. See the `note.remove` case in app/api/ui/act/route.ts:
 * agents were already handed that event, and deleting it would rewrite what they were told.
 */
export async function removeNote(id: string): Promise<boolean> {
    const before = await sql()`select id from notes where id = ${id}` as Row[];
    if (!before.length) return false;

    await writeVerified<Row>({
        what: 'withdraw your note',
        write: () => sql()`delete from notes where id = ${id} returning id` as Promise<Row[]>,
        reread: () => sql()`
            select (select count(*)::int from notes where id = ${id}) as still_there
        ` as Promise<Row[]>,
        expect: r => (Number(r.still_there) === 0 ? null : 'the note is still in the database'),
    });

    await logEvent('note.withdrawn', null, id, 'A note was withdrawn by the human');
    return true;
}

/* ------------------------------------------------------------------------------------------------
 * Sync — the one call
 * ---------------------------------------------------------------------------------------------- */

/**
 * @param scope Restrict to one project, or null for everything.
 *
 * WHY SCOPING EXISTS
 *
 * The first version returned every project's activity to every agent. With one project that is context;
 * with fifteen it is noise, and worse — an agent working on Routepilot reading a note meant for Riff
 * Kitchen may act on it. A note now belongs to a project (or to no project, meaning "any agent"), and an
 * agent asks only about its own.
 *
 * What scoping must NOT do is hide work. So a scoped sync still reports how much is outstanding elsewhere
 * as a count, and unscoped notes are always included: "any agent" means any agent.
 */
export async function sync(
    agent: string, sinceParam?: number | null, scope?: string | null,
): Promise<SyncResponse> {
    // Defaults are applied first, so an agent that has been away sees "this decision resolved itself
    // the way I said it would" in the same call rather than finding a stale open question.
    /*
     * ...and the nudges with them, from the same read. See `applyTimed`.
     *
     * On the sync path rather than only on the page, and that is the important one: an agent syncing is the
     * most frequent read this hub gets, and it is the read that happens while he is asleep and nothing is
     * looking at the page. See `applyDueReminders`.
     */
    await applyTimed();

    const agentRows = await sql()`select * from agents where name = ${agent}` as Row[];
    const stored = agentRows[0];
    const lastSyncAt = iso(stored?.last_sync_at ?? null);
    const since = sinceParam != null && Number.isFinite(sinceParam)
        ? Math.max(0, Math.floor(sinceParam))
        : Number(stored?.last_cursor ?? 0);

    const [head] = await sql()`select coalesce(max(seq), 0)::bigint as seq from events` as Row[];

    const p = scope ? project(scope) : null;

    // `project is null` is always included: an unscoped note is addressed to whoever looks next.
    const changed = (p
        ? await sql()`
            select seq, at, kind, project, ref_id, summary from events
            where seq > ${since} and (project = ${p} or project is null)
            order by seq asc limit 200
          `
        : await sql()`
            select seq, at, kind, project, ref_id, summary from events
            where seq > ${since} order by seq asc limit 200
          `) as Row[];

    /*
     * THE CURSOR MAY NOT ADVANCE PAST WHAT THE AGENT WAS ACTUALLY SHOWN.
     *
     * This was `cursor = head.seq` unconditionally, next to a `limit 200` — so an agent that had been away
     * long enough to be 300 events behind received 200 of them and had its cursor moved to the head anyway.
     * The other hundred were skipped permanently: the next sync asked for everything after the head and got
     * nothing. Silent, unrecoverable data loss in the one call an agent uses to catch up, and no check could
     * have found it because both the response and the stored cursor were internally consistent.
     *
     * When the page is capped, the cursor stops at the last row handed over and `more` says so, so a catching-up
     * agent knows to call again immediately rather than waiting for its next poll. When it is not capped, the
     * head is correct and stays — that keeps a scoped agent from re-scanning the same range forever just
     * because its project had no events in it.
     */
    const capped = changed.length >= 200;
    const cursor = capped ? Number(changed[changed.length - 1].seq) : Number(head.seq);

    const openQuestions = (p
        ? await sql()`select * from questions where status = 'open' and project = ${p} order by created_at asc`
        : await sql()`select * from questions where status = 'open' order by created_at asc`) as Row[];

    /*
     * `note` is selected here, and that is not a convenience.
     *
     * A note is the human's return channel — "did it, but the button was called something else". It was
     * previously reachable ONLY through the event summary, which truncates at 200 characters, and there was
     * no read-by-id for tasks. So a note longer than 200 characters was permanently unreadable by any agent.
     * The most important direction of communication in this hub had a silent length limit nobody declared.
     *
     * Notes are capped at 2000 characters and are rare, so returning them in full costs nothing measurable
     * and keeps catching up to one call.
     */
    const openTasks = (p
        ? await sql()`
            select id, project, title, minutes, blocked_reason, created_at, note from tasks
            where status = 'open' and project = ${p} order by created_at asc
          `
        : await sql()`
            select id, project, title, minutes, blocked_reason, created_at, note from tasks
            where status = 'open' order by created_at asc
          `) as Row[];

    /*
     * Scoping must never make outstanding work invisible, only quieter. So a scoped sync still reports what
     * is waiting elsewhere as a count — enough to know it exists, not enough to be noise.
     */
    const elsewhere = p
        ? ((await sql()`
            select
                (select count(*)::int from tasks     where status = 'open' and project <> ${p}) tasks,
                (select count(*)::int from questions where status = 'open' and project <> ${p}) questions,
                (select count(distinct project)::int from tasks where status = 'open' and project <> ${p}) projects
          ` as Row[])[0])
        : null;

    // Defaulted questions are surfaced separately and unconditionally for 7 days. An agent MUST not miss
    // "I proceeded without you" — that is the one outcome where silence is genuinely dangerous.
    const defaulted = (p
        ? await sql()`
            select * from questions
            where status = 'defaulted' and project = ${p}
              and answered_at > now() - interval '7 days'
            order by answered_at desc
          `
        : await sql()`
            select * from questions
            where status = 'defaulted' and answered_at > now() - interval '7 days'
            order by answered_at desc
          `) as Row[];

    await sql()`
        insert into agents (name, last_sync_at, last_cursor, sync_count)
        values (${agent}, now(), ${cursor}, 1)
        on conflict (name) do update
            set last_sync_at = now(),
                last_cursor = ${cursor},
                sync_count = agents.sync_count + 1
    `;

    /*
     * ...AND THE SAME OBSERVATION, PER PROJECT. See `notePresenceFromSync`.
     *
     * `agents.last_sync_at` above is global per agent, which is enough for the header's stale-sync warning
     * and not enough for the question `/agents` answers: *which project* has nothing looking at it. This is
     * the per-project version, and it is the fallback that makes presence work in a hub where no hook is
     * installed anywhere.
     *
     * ONLY ON A SCOPED SYNC, deliberately. `cc sync` infers the project from the folder, so scoped is the
     * normal case; `cc sync --all` deliberately asks about everything and attributing it to every project
     * at once would mark fifteen projects as freshly visited because one agent ran one command. An
     * unscoped sync still updates `agents.last_sync_at`, so nothing is lost — the global fact stays true
     * and no per-project fact is invented.
     */
    if (p) await notePresenceFromSync(agent, p);

    const hours = lastSyncAt
        ? Math.round(((Date.now() - new Date(lastSyncAt).getTime()) / 3600_000) * 10) / 10
        : null;

    return {
        ok: true,
        now: new Date().toISOString(),
        cursor,
        since,
        agent,
        last_sync_at: lastSyncAt,
        hours_since_last_sync: hours,
        changed: changed.map(mapEvent),
        more: capped,
        open_questions: openQuestions.map(mapQuestion),
        open_tasks: openTasks.map(r => ({
            id: String(r.id),
            project: String(r.project),
            title: String(r.title),
            minutes: r.minutes == null ? null : Number(r.minutes),
            blocked_reason: r.blocked_reason == null ? null : String(r.blocked_reason),
            created_at: iso(r.created_at)!,
            note: r.note == null ? null : String(r.note),
        })),
        defaulted_questions: defaulted.map(mapQuestion),
        scope: p,
        counts: {
            open_questions: openQuestions.length,
            open_tasks: openTasks.filter(t => t.blocked_reason == null).length,
            blocked_tasks: openTasks.filter(t => t.blocked_reason != null).length,
            unread_changes: changed.length,
        },
        elsewhere: elsewhere
            ? {
                projects: Number(elsewhere.projects),
                open_tasks: Number(elsewhere.tasks),
                open_questions: Number(elsewhere.questions),
            }
            : null,
    };
}

/* ================================================================================================
 * PRESENCE — whether anything is actually looking at a project
 *
 * The fold and the honest sentence live in lib/presence.ts. What is here is the writes and the one
 * read, for the same reason lib/progress.ts holds the derivation and this file holds the queries.
 * ============================================================================================== */

export interface HeartbeatInput {
    project: unknown;
    /** The harness's own session id. Required — it is what makes a repeated SessionStart idempotent. */
    session: unknown;
    branch?: unknown;
    model?: unknown;
    /** Set by the SessionEnd hook. Presence of this field is what closes the row. */
    ended?: unknown;
    end_reason?: unknown;
}

/**
 * A session id, constrained rather than trusted.
 *
 * It goes into a primary key and into nothing else, so it does not need sanitising for display — but it
 * does need bounding, because an unbounded string in a primary key is a way to make the index enormous.
 * Claude Code's own ids are UUIDs; the alphabet here is deliberately wider than that so a different
 * harness's id shape still works.
 */
function sessionId(v: unknown): string {
    const s = str(v, 'session', 120, true)!.replace(/[^A-Za-z0-9._:-]/g, '');
    if (!s) throw new Invalid('session must contain at least one of a-z, 0-9, dot, dash, underscore or colon');
    return s;
}

/**
 * ==================================================================================================
 * RUNS ARE CUT OUT OF ACTIVITY. A CONVERSATION IS NOT A RUN.
 * ==================================================================================================
 *
 * This is his finding and it invalidated the model that shipped: *"The session may never end. I might
 * start an agent, and it never ends… You just close the window and never open it again, but at some point
 * you might want to open it again and chat with that AI. It never ends! One open AI iteration can be live
 * for several days."*
 *
 * The old model recorded one row per session id, which meant an eleven-day conversation was one bar
 * eleven days long and an agent that had been working all evening reported nothing at all until it
 * stopped. Both are useless, and the second one is worse than useless — the page said *"Nothing has
 * looked at Vibe Game Developing since 8 August"* over a project an agent was working in at that moment.
 *
 * THE ANSWER WAS ALREADY IN THE CODEBASE. `cc backfill` had to solve this exact problem to read
 * transcripts, and its own note records the finding: *"a transcript turned out to be a conversation, not a
 * session — one of yours spans eleven days — so files are split at half-hour gaps."* That is the correct
 * model. It was applied to history and not to the live path, so the hub ran two definitions of a run and
 * showed him the wrong one.
 *
 * So: every observation lands here, and a run is the stretch between gaps in them. The FIRST run of a
 * conversation keeps the bare session id, so a short session records exactly what it always did and
 * nothing about the common case changes; later runs are `<session>:<n>`, which is the naming `cc backfill`
 * has always used.
 *
 * WHAT MAKES THIS SAFE TO ADD: it needs no new events and no timer. The split is decided by the next
 * observation to arrive, so nothing has to fire to close a run — which is the property `SessionEnd` did
 * not have and could not have.
 */
async function resolveRun(
    proj: string, agent: string, conversation: string, now: number,
): Promise<{ run: string; cut: boolean }> {
    /*
     * The SQL narrows and the JS decides. `like <id> || ':%'` cannot be trusted on its own because an
     * underscore is a LIKE wildcard and a session id may contain one, so `a_b` would match `axb:1`;
     * escaping that in the driver's template syntax is fiddly and easy to get subtly wrong. Narrowing
     * with LIKE and then confirming with the same `baseSession` the timeline uses means one rule decides
     * what belongs to a conversation, everywhere.
     */
    const rows = await sql()`
        select session, started_at, last_seen_at, ended_at
          from presence
         where project = ${proj} and agent = ${agent}
           and (session = ${conversation} or session like ${`${conversation}:`} || '%')
         order by started_at desc
         limit 200
    ` as Row[];

    const mine = rows.filter(r => baseSession(String(r.session)) === conversation);
    if (!mine.length) return { run: conversation, cut: false };

    const newest = mine[0];
    const lastSeen = new Date(String(iso(newest.last_seen_at))).getTime();
    const ended = newest.ended_at == null ? 0 : new Date(String(iso(newest.ended_at))).getTime();
    const quietSince = Math.max(lastSeen, ended);
    if (now - quietSince <= RUN_GAP_MINUTES * 60_000) {
        return { run: String(newest.session), cut: false };
    }

    /*
     * A GAP. The old run is closed AT THE LAST THING SEEN, never at now — the whole reason the timeline
     * has an `unterminated` shape is that drawing a bar to the present over a stretch nobody observed is
     * the overclaim this surface must never make. `end_reason` says `gap` rather than nothing, so the
     * detail line can say why it ended and a reader is never left to assume a clean exit.
     */
    if (newest.ended_at == null) {
        await sql()`
            update presence
               set ended_at = last_seen_at, end_reason = 'gap'
             where project = ${proj} and agent = ${agent} and session = ${String(newest.session)}
        `;
    }

    const highest = mine.reduce((max, r) => {
        const s = String(r.session);
        const tail = s.slice(conversation.length + 1);
        return /^[0-9]+$/.test(tail) ? Math.max(max, Number(tail)) : max;
    }, 1);
    return { run: `${conversation}:${highest + 1}`, cut: true };
}

/**
 * A session started, or ended. One function for both, and that is deliberate.
 *
 * SessionStart and SessionEnd are the same row at two moments, so an UPSERT keyed on
 * (project, agent, session) means the end can never create an orphan: if the start was missed — the hook
 * was installed mid-session, or the machine was offline for it — the end still produces a row that says
 * a session existed and finished, which is a true and useful statement. The alternative was an UPDATE
 * that silently matched nothing, and a silent no-op on the write that says "this agent stopped" is how a
 * project reads as busy forever.
 *
 * `started_at` is preserved on conflict rather than refreshed, because the first observation is the true
 * one; `last_seen_at` always moves, because that is what "heard from" means.
 */
export async function heartbeat(
    input: HeartbeatInput, agent: string,
): Promise<{ project: string; session: string; ended: boolean }> {
    await ensureSchema();
    const proj = project(input.project);
    const conversation = sessionId(input.session);
    const ending = input.ended === true || input.ended === 'true';
    /*
     * WHICH RUN AM I IN? Asked even at SessionEnd, and especially then: a conversation resumed after two
     * days is on its third run, and closing the FIRST one would set an end time three days after the row
     * it belongs to had already stopped. `resolveRun` returns the bare conversation id for a session that
     * has only ever had one stretch, which is every short session and is why nothing about the common
     * case changes.
     */
    const { run: session } = await resolveRun(proj, agent, conversation, Date.now());

    /*
     * The branch and the model are DISPLAYED, so they are sanitised here and not at render time — the
     * boundary rule from lib/sanitise.ts. They are also the two fields a hostile repository could
     * control: a branch name is attacker-supplied the moment somebody opens a pull request, and it lands
     * on his phone unaltered otherwise.
     */
    const branch = input.branch == null || input.branch === ''
        ? null : sanitiseForDisplay(input.branch, 60, '(unnamed branch)').text;
    const model = input.model == null || input.model === ''
        ? null : sanitiseToolName(input.model);
    const endReason = input.end_reason == null || input.end_reason === ''
        ? null : sanitiseToolName(input.end_reason);

    const row = await writeVerified<Row>({
        what: ending ? `record that a ${proj} session finished` : `record a ${proj} session`,
        write: () => (ending
            ? sql()`
                insert into presence (project, agent, session, kind, last_seen_at, ended_at,
                                      end_reason, branch, model)
                values (${proj}, ${agent}, ${session}, 'session', now(), now(), ${endReason},
                        ${branch}, ${model})
                on conflict (project, agent, session) do update
                    set last_seen_at = now(), ended_at = now(), end_reason = ${endReason},
                        branch = coalesce(${branch}, presence.branch),
                        model = coalesce(${model}, presence.model)
                returning *
              `
            : sql()`
                insert into presence (project, agent, session, kind, last_seen_at, branch, model)
                values (${proj}, ${agent}, ${session}, 'session', now(), ${branch}, ${model})
                on conflict (project, agent, session) do update
                    set last_seen_at = now(),
                        branch = coalesce(${branch}, presence.branch),
                        model = coalesce(${model}, presence.model),
                        /* A resumed session re-opens rather than staying closed. Resume is a real
                           SessionStart source, and a resumed session that stayed marked as ended would
                           report a working agent as gone.
                           NO BACKTICKS IN HERE -- this comment is inside a template literal and quoting
                           an identifier with a pair of them is what broke the build a moment ago. Trap 1
                           in AGENTS.md, and I had read that warning forty minutes earlier. */
                        ended_at = null, end_reason = null
                returning *
              `) as Promise<Row[]>,
        reread: () => sql()`
            select * from presence
             where project = ${proj} and agent = ${agent} and session = ${session}
        ` as Promise<Row[]>,
        expect: r => {
            if (String(r.project) !== proj) return `project is "${String(r.project)}"`;
            if (String(r.session) !== session) return `session is "${String(r.session)}"`;
            if (ending && r.ended_at == null) return 'the session was reported as finished but ended_at is empty';
            if (!ending && r.ended_at != null) return 'the session is open but ended_at is set';
            return null;
        },
    });

    return { project: proj, session, ended: row.ended_at != null };
}

export interface ReportInput {
    project: unknown;
    session: unknown;
    kind: unknown;
    body?: unknown;
    branch?: unknown;
    model?: unknown;
    /**
     * WHEN IT WAS SAID, when that is not now.
     *
     * A hook reports as it happens and omits this. `cc sync`'s catch-up reads a transcript and knows the real
     * moment, so it sends it — which is both more honest and what makes a re-post idempotent: the same
     * message always carries the same `at`, and `reports_moment_uniq` turns the repeat into a no-op.
     *
     * Clamped to the past by `pastInstant`. A machine with a fast clock must not be able to file something
     * that has not been said yet.
     */
    at?: unknown;
}

const REPORT_KINDS: ReportKind[] = ['said', 'told', 'waiting'];

function reportKind(v: unknown): ReportKind {
    const s = str(v, 'kind', 20, true)!.toLowerCase();
    if ((REPORT_KINDS as string[]).includes(s)) return s as ReportKind;
    throw new Invalid(
        `kind must be one of ${REPORT_KINDS.join(', ')} — "said" is what the assistant said, "told" is ` +
        `what the human typed, "waiting" is the harness reporting that the agent needs a person. There ` +
        `is deliberately no kind an agent invents for itself; see lib/reports.ts.`,
    );
}

/**
 * ==================================================================================================
 * A REPORT: WHAT WAS SAID, BY WHOM, WHEN — and it is also the activity signal.
 * ==================================================================================================
 *
 * ONE CALL DOES BOTH, and that is the design rather than a shortcut. A separate heartbeat endpoint plus a
 * separate report endpoint would double the hook count, double the round trips at the end of every turn,
 * and introduce the possibility of a hub that knows what an agent said but not that it was working — two
 * records of one moment that can disagree. The `Stop` hook fires once per turn; that one call moves
 * `last_seen_at`, cuts a new run if the conversation went quiet for an hour, and stores the words.
 *
 * ==================================================================================================
 * WHY A `said` ROW IS NOT THE SELF-REPORTED STATUS THIS PROJECT REFUSES
 * ==================================================================================================
 *
 * `lib/presence.ts` refuses a `doing` field and is right to: *"an agent asked to self-report health
 * reports green, and a single green-while-you-slept status poisons every other indicator on the page."*
 * The distinction is authorship and tense. A status is a claim about NOW that something has to keep true.
 * These rows are quotes: the harness hands over `last_assistant_message`, the hub writes down what was
 * said and when, and that stays true forever. The agent is not being asked how it is going — it is being
 * overheard. See AGENTS.md: *can it name who said it and when?*
 *
 * THE BODY IS NOT TRUSTED. It is text nobody wrote for this database — the assistant's prose, or whatever
 * he typed into a terminal — so it is truncated, sanitised for display at the boundary like every other
 * shown string, and token-shaped words are redacted before the insert. `redactSecrets` redacts rather than
 * refusing, which is the one place in this codebase that is right; the reasoning is on that function.
 */
export async function recordReport(
    input: ReportInput, agent: string,
): Promise<{
    project: string; session: string; run: string; kind: ReportKind; redacted: boolean;
    /** False when the text was nothing but injected editor context, so no thread row was made. */
    stored: boolean;
}> {
    await ensureSchema();
    const proj = project(input.project);
    const conversation = sessionId(input.session);
    const kind = reportKind(input.kind);

    /*
     * STRIP THE IDE'S INJECTIONS BEFORE TRUNCATING, and the order is the whole point.
     *
     * `UserPromptSubmit`'s `prompt` is what the harness is about to send the model, not what the human
     * typed — an IDE prepends `<ide_opened_file>…</ide_opened_file>` and friends. Truncating first would
     * spend a third of the budget on that wrapper and cut the real sentence off, which is exactly what
     * shipped: three rows on his project page attributed an editor's bookkeeping to him, cropped.
     *
     * Done HERE rather than in the CLI so it cannot be bypassed by an old CLI or another client.
     */
    const raw = input.body == null || input.body === '' ? null : stripInjectedContext(String(input.body));
    let redacted = false;
    let body: string | null = null;
    if (raw) {
        /*
         * TRUNCATE, THEN REDACT. The other order wastes work on prose that is about to be thrown away, and
         * worse, it could redact a secret in the tail of a message and then cut the redaction marker off —
         * leaving a message that says nothing about having been shortened OR cleaned.
         */
        const shown = sanitiseForDisplay(raw, REPORT_BODY_MAX, '(nothing was said)');
        const safe = redactSecrets(shown.text, findSecret);
        redacted = safe.redacted;
        body = safe.text;
    }

    /*
     * A PROMPT THAT WAS NOTHING BUT AN IDE NOTIFICATION IS NOT A MESSAGE, so it gets no row in the thread —
     * but it IS still activity, so the run below is updated either way.
     *
     * Opening a file in an editor fires `UserPromptSubmit` with a prompt consisting only of
     * `<ide_opened_file>…</ide_opened_file>`. Stored, that is a line on his page saying he said something he
     * did not say and cannot act on. Dropped, the hub still knows the session was alive at that moment,
     * which is the true half of what the event carried.
     */
    const nothingSaid = kind === 'told' && (input.body != null && input.body !== '') && !body;

    /* The activity update comes FIRST, so a report always has a run to belong to even if the insert
     * below fails — presence going stale is the failure this whole feature exists to remove, and it is
     * the half that must survive. */
    const { run } = await resolveRun(proj, agent, conversation, Date.now());
    const branch = input.branch == null || input.branch === ''
        ? null : sanitiseForDisplay(input.branch as string, 60, '(unnamed branch)').text;
    const model = input.model == null || input.model === ''
        ? null : sanitiseToolName(input.model as string);
    await sql()`
        insert into presence (project, agent, session, kind, last_seen_at, branch, model)
        values (${proj}, ${agent}, ${run}, 'session', now(), ${branch}, ${model})
        on conflict (project, agent, session) do update
            set last_seen_at = now(),
                branch = coalesce(${branch}, presence.branch),
                model = coalesce(${model}, presence.model),
                /* Activity RE-OPENS a run, for the same reason a resumed session does: a run closed by a
                   SessionEnd that fired on a compaction, and then worked in for another hour, is running.
                   The gap test in resolveRun is what decides whether this is the same run at all. */
                ended_at = null, end_reason = null
    `;

    if (nothingSaid) {
        /* Activity recorded, no row in the thread, and the caller is told which so a hook can say so on
         * stderr rather than reporting a stored message that does not exist. */
        return { project: proj, session: conversation, run, kind, redacted, stored: false };
    }

    const id = newReportId();
    /*
     * A GIVEN MOMENT MAKES THE WRITE IDEMPOTENT, and the re-read is keyed on the moment rather than on the id.
     *
     * `cc sync` catches up from the transcript on every sync, so it re-posts the same last message several
     * times a session. `on conflict do nothing` makes the repeat harmless, and the verification then has to
     * look for the ROW THAT MOMENT PRODUCED rather than for the id this call generated — the row that is
     * there may be the one an earlier sync wrote, which is success and not failure.
     *
     * Without a moment (a hook, reporting as it happens) nothing can collide, so the id is the key and the
     * insert is plain. Two paths, because one of them must never silently swallow a real write.
     */
    const at = input.at == null || input.at === '' ? null : pastInstant(input.at, 'at').toISOString();
    await writeVerified<Row>({
        what: `record what was said in ${proj}`,
        write: () => (at
            ? sql()`
                insert into reports (id, project, agent, session, kind, body, at)
                values (${id}, ${proj}, ${agent}, ${conversation}, ${kind}, ${body}, ${at})
                on conflict (project, session, kind, at) do nothing
                returning *
              `
            : sql()`
                insert into reports (id, project, agent, session, kind, body)
                values (${id}, ${proj}, ${agent}, ${conversation}, ${kind}, ${body})
                returning *
              `) as Promise<Row[]>,
        /* `allowNoRows` on the conflict path: a repeat writes nothing, and the re-read below is what decides
         * whether the intended row is in the database. */
        allowNoRows: at != null,
        reread: () => (at
            ? sql()`
                select * from reports
                 where project = ${proj} and session = ${conversation} and kind = ${kind} and at = ${at}
              `
            : sql()`select * from reports where id = ${id}`) as Promise<Row[]>,
        expect: r => {
            if (String(r.project) !== proj) return `project is "${String(r.project)}"`;
            if (String(r.kind) !== kind) return `kind is "${String(r.kind)}"`;
            /* On the conflict path the stored body is whichever post got there first, and comparing it to
             * this call's text would fail on a re-post whose message had since been edited upstream — which
             * cannot happen for a transcript, but the check would be asserting something it does not know. */
            if (at == null && (r.body == null ? null : String(r.body)) !== body) {
                return 'the stored text is not what was sent';
            }
            return null;
        },
    });

    return { project: proj, session: conversation, run, kind, redacted, stored: true };
}

export interface Brief {
    id: string;
    project: string;
    agent: string;
    session: string | null;
    standing: string;
    did: string | null;
    next: string | null;
    blocked: string | null;
    at: string;
}

export interface BriefInput {
    project: unknown;
    standing: unknown;
    session?: unknown;
    did?: unknown;
    next?: unknown;
    blocked?: unknown;
}

function mapBrief(r: Row): Brief {
    return {
        id: String(r.id),
        project: String(r.project),
        agent: String(r.agent),
        session: r.session == null ? null : String(r.session),
        standing: String(r.standing),
        did: r.did == null ? null : String(r.did),
        next: r.next == null ? null : String(r.next),
        blocked: r.blocked == null ? null : String(r.blocked),
        at: iso(r.at)!,
    };
}

/** How long a line of a brief may be. Two hundred characters — about a sentence and a half. */
export const BRIEF_LINE_MAX = 200;

/**
 * WHERE A PROJECT STANDS, AS THE AGENT THAT DID THE WORK SEES IT.
 *
 * ==================================================================================================
 * THE ONE FIELD THAT IS REQUIRED, AND WHY THE OTHERS ARE NOT
 * ==================================================================================================
 *
 * `standing` is mandatory: a brief with nothing to say about where things stand is not a brief. `did`,
 * `next` and `blocked` are optional because a session that only investigated has no "did", and a project
 * that is not stuck has no "blocked" — and a field filled in to look complete is exactly what this whole
 * schema is built against. An empty string is stored as NULL rather than as a blank, so the page can tell
 * "nothing to report here" from "reported nothing".
 *
 * ==================================================================================================
 * IT IS APPENDED, NEVER UPDATED
 * ==================================================================================================
 *
 * No upsert and no idempotency key, deliberately, and this is the difference between a brief and a status.
 * Two briefs an hour apart are two things that were true at two moments, and the second does not correct
 * the first — it follows it. The page shows the newest with its age; the rest are history, and history is
 * what makes a rosy brief checkable against what happened next.
 *
 * Every line goes through `sanitiseForDisplay` and the secret scanner, like every other string an agent
 * sends that a person will read.
 */
export async function recordBrief(
    input: BriefInput, agent: string,
): Promise<{ brief: Brief; redacted: boolean }> {
    await ensureSchema();
    const proj = project(input.project);
    const session = input.session == null || input.session === '' ? null : sessionId(input.session);

    let redacted = false;
    const line = (v: unknown, field: string, required: boolean): string | null => {
        if (v == null || v === '') {
            if (required) {
                throw new Invalid(
                    `${field} is required. A brief says where the project stands in one line; if there is `
                    + 'nothing to say about that, there is nothing to file.',
                );
            }
            return null;
        }
        const shown = sanitiseForDisplay(String(v), BRIEF_LINE_MAX, `(no ${field})`);
        const safe = redactSecrets(shown.text, findSecret);
        if (safe.redacted) redacted = true;
        return safe.text;
    };

    const standing = line(input.standing, 'standing', true)!;
    const did = line(input.did, 'did', false);
    const nextUp = line(input.next, 'next', false);
    const blocked = line(input.blocked, 'blocked', false);

    const id = newBriefId();
    const row = await writeVerified<Row>({
        what: `record where ${proj} stands`,
        write: () => sql()`
            insert into briefs (id, project, agent, session, standing, did, next, blocked)
            values (${id}, ${proj}, ${agent}, ${session}, ${standing}, ${did}, ${nextUp}, ${blocked})
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from briefs where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.project) !== proj) return `project is "${String(r.project)}"`;
            if (String(r.standing) !== standing) return 'the stored standing is not what was sent';
            return null;
        },
    });

    /*
     * AN EVENT, so a brief reaches the agent contract as well as the page. `cc sync` hands back what has
     * changed since an agent last looked, and "somebody wrote down where this project stands" is squarely
     * that — it is how a second agent picking the project up tomorrow learns there is a brief worth reading.
     */
    await logEvent('brief.filed', proj, id, `${agent}: ${standing}`);

    return { brief: mapBrief(row), redacted };
}

/** One project's briefs, newest first. Capped: the page shows one and links to the rest. */
export async function projectBriefs(slug: string, limit = 12): Promise<Brief[]> {
    await ensureSchema();
    const proj = project(slug);
    const rows = await sql()`
        select * from briefs where project = ${proj}
         order by at desc limit ${Math.min(Math.max(1, Math.round(limit)), 50)}
    ` as Row[];
    return rows.map(mapBrief);
}

/**
 * THE NEWEST BRIEF PER PROJECT — the whole cross-project digest, and it costs no model call at all.
 *
 * This is the answer to *"one line across everything"*. It is not generated: it is the newest thing each
 * project's own agent wrote about where that project stands, one row each, folded by the database. So the
 * expensive half of what he asked about turned out not to need a model — only the per-project half does,
 * and that is written by an agent on a subscription he already pays for.
 */
export async function latestBriefs(): Promise<Brief[]> {
    await ensureSchema();
    const rows = await sql()`
        select distinct on (project) * from briefs order by project, at desc
    ` as Row[];
    return rows.map(mapBrief).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function mapReport(r: Row): Report {
    return {
        id: String(r.id),
        project: String(r.project),
        agent: String(r.agent),
        session: String(r.session),
        kind: String(r.kind) as ReportKind,
        body: r.body == null ? null : String(r.body),
        at: iso(r.at)!,
    };
}

/**
 * How many reports any read is ever willing to return. Four hundred.
 *
 * A `said` row per turn means this table grows faster than anything else the hub stores, so the ceiling is
 * in the query rather than in a comment about being careful — §XXVI was a session spent removing a payload
 * cliff caused by less. Four hundred is about a fortnight of one project's conversation, and every reader
 * either wants the newest few or one project's thread.
 */
export const REPORTS_MAX = 400;

/**
 * THE NEWEST REPORT PER CONVERSATION, across every project. Bounded by conversations, not by time.
 *
 * `distinct on` is the same shape `presenceRows` uses and for the same reason: what the hub root needs is
 * "who is waiting for me", which is one row per conversation, and reading the whole log to fold it down to
 * that would be linear in his usage. Windowed as well, because a conversation nobody has touched in a
 * fortnight is history and the root page is not history.
 */
export async function latestReports(days = TIMELINE_DAYS): Promise<Report[]> {
    await ensureSchema();
    const rows = await sql()`
        select distinct on (project, session) id, project, agent, session, kind, body, at
          from reports
         where at > now() - (${days} || ' days')::interval
         order by project, session, at desc
    ` as Row[];
    return rows.map(mapReport).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** One project's conversation, newest first, capped. */
export async function projectReports(slug: string, limit = 60): Promise<Report[]> {
    await ensureSchema();
    const proj = project(slug);
    const rows = await sql()`
        select id, project, agent, session, kind, body, at
          from reports
         where project = ${proj}
         order by at desc
         limit ${Math.min(Math.max(1, Math.round(limit)), REPORTS_MAX)}
    ` as Row[];
    return rows.map(mapReport);
}

/**
 * THE FALLBACK, and it is what makes presence work for somebody who installs nothing.
 *
 * `docs/BRIEF-NOTHING-BLOCKED.md` §3.1 requires falling back to sync activity when no hook is installed,
 * and this is that: one row per (project, agent) with the literal session id `sync`, upserted on every
 * scoped sync. So "last heard from" has an answer in a hub where nobody opted in to anything, which
 * matters because the setup story must not get longer for someone who wants none of this.
 *
 * `kind = 'sync'` is what keeps it honest downstream: a sync row is never OPEN, so it can contribute to
 * "heard from recently" and can never contribute to "a session is running".
 *
 * NOT routed through `writeVerified`, and this is the one place in the codebase where that is the right
 * call rather than an oversight. It is a side effect of somebody else's request — `sync()` — and a
 * failure here must not fail the sync, because the sync is the call an agent depends on and this is a
 * decoration on a diagnostic. `heartbeat` above IS verified, because that request exists only to make
 * this record. Losing one of these costs a slightly stale "last heard from"; failing a sync costs an
 * agent its catch-up.
 */
async function notePresenceFromSync(agent: string, proj: string): Promise<void> {
    try {
        await sql()`
            insert into presence (project, agent, session, kind, last_seen_at)
            values (${proj}, ${agent}, 'sync', 'sync', now())
            on conflict (project, agent, session) do update set last_seen_at = now()
        `;
    } catch (e) {
        /* Logged rather than swallowed silently: a presence table that stopped being written would
         * otherwise look exactly like a set of quiet projects, which is the confusion this whole feature
         * exists to remove. */
        console.error('[presence] could not record a sync observation:', e instanceof Error ? e.message : e);
    }
}

/**
 * THE NEWEST OBSERVATION PER (PROJECT, AGENT) — not every row, and the difference is a ceiling.
 *
 * `presence` gains a row per session forever, so `select *` here would be linear in his usage — the exact
 * shape §XXVI spent a session removing from the page payload. `distinct on` bounds it at projects x agents,
 * which is a few dozen rows on the biggest hub this will ever see and does not grow with time.
 *
 * THE FOLD GETS THE SAME ANSWER FROM THIS SUBSET, with one stated exception. `foldProjects` needs the newest
 * observation (unchanged), and whether an OPEN session exists (unchanged, unless one agent has an open session
 * AND a newer closed one — in which case the open row is dropped and the project reads as `idle` rather than
 * `working`). That case is an orphan row from a terminal somebody closed followed by a session that ended
 * properly, so `idle` is the better answer anyway; it is recorded rather than left to be discovered.
 *
 * Ordered by the same expression the fold ranks on, so the index does the work rather than the sort.
 */
export async function presenceRows(): Promise<PresenceRow[]> {
    await ensureSchema();
    const rows = await sql()`
        select distinct on (project, agent)
               project, agent, session, kind, started_at, last_seen_at, ended_at, end_reason,
               branch, model
          from presence
         order by project, agent, greatest(last_seen_at, coalesce(ended_at, last_seen_at)) desc
    ` as Row[];
    return rows.map(r => ({
        project: String(r.project),
        agent: String(r.agent),
        session: String(r.session),
        kind: r.kind === 'sync' ? 'sync' : 'session',
        started_at: iso(r.started_at)!,
        last_seen_at: iso(r.last_seen_at)!,
        ended_at: iso(r.ended_at),
        end_reason: r.end_reason == null ? null : String(r.end_reason),
        branch: r.branch == null ? null : String(r.branch),
        model: r.model == null ? null : String(r.model),
    }));
}

/* ================================================================================================
 * SESSIONS AND SUB-AGENTS — the rows the timeline is drawn from
 *
 * `presenceRows()` above answers "what is the state of each project right now" and does it with
 * `distinct on (project, agent)`, which is one row per pair and cannot grow with time. The timeline
 * asks a different question — what ran last night — and needs MANY sessions. So it gets its own read,
 * and that read is bounded by time and by a row cap rather than by nothing, which is the whole lesson
 * of §XXVI written into the query instead of into a comment.
 * ============================================================================================== */

/**
 * How far back the timeline is ever willing to look. Fourteen days.
 *
 * The window the page actually draws is usually 24 hours (see `lib/timeline.ts`); this is the ceiling
 * on what is fetched so that a hub which has been quiet for a month still has something to show. Past
 * a fortnight, "what ran" stops being a thing anybody acts on and becomes history, and history has a
 * page of its own.
 */
export const TIMELINE_DAYS = 14;

/**
 * And the row cap, which is the half that survives at two years of volume.
 *
 * A fortnight of his measured rate is a few hundred sessions; the cap is what stops a pathological
 * fortnight — a script in a loop opening sessions — from putting ten thousand rows on the wire. It is
 * applied newest-first, and the page is told when it bit rather than silently drawing a subset.
 */
export const TIMELINE_MAX_SESSIONS = 400;
export const TIMELINE_MAX_SUBAGENTS = 800;

export interface SessionRow {
    project: string;
    agent: string;
    session: string;
    started_at: string;
    last_seen_at: string;
    ended_at: string | null;
    end_reason: string | null;
    branch: string | null;
    model: string | null;
    /** False when this row was reconstructed from a transcript rather than reported by a hook. */
    observed: boolean;
}

export interface SubagentRow {
    id: string;
    project: string;
    agent: string;
    session: string;
    type: string;
    task: string | null;
    model: string | null;
    started_at: string;
    start_seen: boolean;
    ended_at: string | null;
    outcome: string | null;
    tool_calls: number | null;
    edits: number | null;
    lines_added: number | null;
    lines_removed: number | null;
    /** False when this row was reconstructed from a transcript rather than reported by a hook. */
    observed: boolean;
}

export interface SubagentInput {
    project: unknown;
    session: unknown;
    tool_use_id?: unknown;
    agent_id?: unknown;
    type?: unknown;
    task?: unknown;
    model?: unknown;
    /** The PARENT session's model, sent so a running session's row can be filled in. Never overwrites. */
    session_model?: unknown;
    /** Set by the closing hooks. Its presence is what ends the row. */
    ended?: unknown;
    outcome?: unknown;
    tool_calls?: unknown;
    edits?: unknown;
    lines_added?: unknown;
    lines_removed?: unknown;
}

/** A harness id — bounded and stripped, because it lands in a unique index and in nothing else. */
function harnessId(v: unknown, field: string): string | null {
    if (v == null || v === '') return null;
    const s = str(v, field, 120, true)!.replace(/[^A-Za-z0-9._:-]/g, '');
    return s || null;
}

/**
 * A count the harness reported, or null when it reported nothing.
 *
 * NULL AND NOT ZERO, which is the whole reason this is not `count` further down the file. That one
 * throws on a bad value and returns 0 for a missing one, which is right for token totals and wrong here:
 * a sub-agent that edited no files and a sub-agent whose harness did not say are different facts, and
 * the page renders them differently. Zero would quietly turn "unknown" into "nothing happened".
 */
function reported(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 2_000_000_000) : null;
}

/**
 * The four words a sub-agent's ending is allowed to be, and why there are four rather than two.
 *
 * The synchronous path reports the harness's own `status`, which is `completed` when it worked. The
 * background path is closed by `SubagentStop`, which fires whether the work went well or badly and says
 * nothing about which — so it earns `ended`, a word that claims the fact observed (it stopped) and not
 * the one that was not (it succeeded). Getting this wrong is the same overclaim as reporting an agent
 * as working on the evidence of one sync, which is the defect the owner found in seconds.
 */
function outcomeWord(v: unknown): string | null {
    if (v == null || v === '') return null;
    const s = String(v).toLowerCase();
    if (s === 'completed' || s === 'success' || s === 'succeeded') return 'completed';
    if (s.includes('error') || s.includes('fail') || s.includes('reject')) return 'failed';
    if (s.includes('cancel') || s.includes('abort') || s.includes('interrupt')) return 'failed';
    return 'ended';
}

/**
 * ONE SUB-AGENT, opened or closed. One function for both moments, exactly as `heartbeat` is.
 *
 * ==================================================================================================
 * WHY AN UPSERT AND NOT AN INSERT PLUS AN UPDATE
 * ==================================================================================================
 *
 * There are three hook events that can reach this and they do not arrive in a guaranteed order or at
 * all: `PreToolUse` opens, `PostToolUse` closes a synchronous sub-agent or records the background one's
 * `agent_id`, and `SubagentStop` closes a backgrounded one. Any of the three can be the FIRST to arrive
 * — the hooks are installed mid-session, a laptop is offline for one call, a spawn is denied at the
 * permission prompt. An UPDATE that silently matched nothing would leave a sub-agent that ran and
 * finished invisible, which is the same class of silence as a session that stays open forever.
 *
 * So whichever arrives first creates the row, and a row created by a CLOSING event is marked
 * `start_seen = false`. That flag is not bookkeeping: it is the difference between a block the timeline
 * may draw as a measured span and one it must draw as a moment it heard about.
 *
 * ==================================================================================================
 * MATCHED ON `tool_use_id` FIRST AND `agent_id` SECOND
 * ==================================================================================================
 *
 * `tool_use_id` identifies the spawning call and is on both `PreToolUse` and `PostToolUse`.
 * `SubagentStop` carries neither the tool_use_id nor anything else that would join to it — only
 * `agent_id` — which is why `PostToolUse` recording `agent_id` on the way past is load-bearing rather
 * than decorative. Without it a backgrounded sub-agent could never be closed.
 */
export async function recordSubagent(
    input: SubagentInput, agent: string,
): Promise<{ id: string; project: string; ended: boolean; created: boolean }> {
    await ensureSchema();
    const proj = project(input.project);
    const session = sessionId(input.session);
    const toolUseId = harnessId(input.tool_use_id, 'tool_use_id');
    const agentId = harnessId(input.agent_id, 'agent_id');
    if (!toolUseId && !agentId) {
        throw new Invalid('a sub-agent needs a tool_use_id or an agent_id — without one of them a '
            + 'later hook could not find this row and it would never be closed');
    }

    /*
     * BOTH SANITISED ON THE WAY IN, and the type as well as the task. A sub-agent's type is
     * project-defined — `.claude/agents/*.md` names it — so it is as attacker-supplied as a branch name
     * the moment somebody opens a pull request against a repository with an agent definition in it.
     */
    const type = sanitiseToolName(input.type == null || input.type === '' ? 'sub-agent' : input.type);
    const task = input.task == null || input.task === ''
        ? null : sanitiseForDisplay(input.task, 120, '(no description given)').text;
    const model = input.model == null || input.model === ''
        ? null : sanitiseToolName(input.model);
    /* The PARENT session's model, which is a different fact from the sub-agent's own — a sub-agent can be
     * resolved to a cheaper model than the session that spawned it, and on this machine routinely is. */
    const sessionModel = input.session_model == null || input.session_model === ''
        ? null : sanitiseToolName(input.session_model);
    const ending = input.ended === true || input.ended === 'true';
    const outcome = ending ? (outcomeWord(input.outcome) ?? 'ended') : null;

    /*
     * ==================================================================================================
     * FINDING THE ROW THIS EVENT BELONGS TO, and the fallback is not a nicety — without it one sub-agent
     * becomes two, which is the defect the owner found on the project list wearing different clothes.
     * ==================================================================================================
     *
     * The exact keys first: `tool_use_id`, which `PreToolUse` and `PostToolUse` both carry, then
     * `agent_id`, which `SubagentStop` carries and nothing else does.
     *
     * MEASURED, AND IT IS WHY THE FALLBACK EXISTS: on the SYNCHRONOUS path `SubagentStop` fires about
     * 126 ms BEFORE `PostToolUse`. So at the moment the sub-agent stops, no row carries its `agent_id`
     * yet — `PostToolUse`, the only event that could have written it, has not run. Exact matching alone
     * therefore opened a SECOND row at every synchronous completion and left the first one running
     * forever. Both were visible in the database after one real session, which is the only reason this
     * was found: the suite was green and the shapes were wrong.
     *
     * THE FALLBACK, AND WHY IT CANNOT MISATTRIBUTE. When a close arrives with no matching row, it is
     * paired with the oldest OPEN sub-agent of the same type in the same session. The obvious hazard is
     * two sub-agents of one type running at once and their ends being swapped — and that cannot happen
     * here, because the fallback is only ever reached on the synchronous path, where the parent is
     * blocked inside the tool call and exactly one sub-agent is running. A BACKGROUNDED sub-agent has
     * had its `agent_id` recorded by `PostToolUse` a tenth of a second after it started, so it always
     * matches exactly and never reaches this.
     */
    let existing = await sql()`
        select * from subagents
         where project = ${proj}
           and ((${toolUseId}::text is not null and tool_use_id = ${toolUseId})
             or (${agentId}::text is not null and agent_id = ${agentId}))
         order by case when tool_use_id = ${toolUseId} then 0 else 1 end, started_at desc
         limit 1
    ` as Row[];

    if (!existing[0] && ending) {
        existing = await sql()`
            select * from subagents
             where project = ${proj} and session = ${session} and type = ${type}
               and ended_at is null and agent_id is null
             order by started_at asc
             limit 1
        ` as Row[];
    }

    const id = existing[0] ? String(existing[0].id) : newSubagentId();
    const created = !existing[0];

    const row = await writeVerified<Row>({
        what: ending
            ? `record that a ${type} sub-agent finished in ${proj}`
            : `record a ${type} sub-agent in ${proj}`,
        write: () => (created
            ? sql()`
                insert into subagents (id, project, agent, session, tool_use_id, agent_id, type, task,
                                       model, start_seen, ended_at, outcome, tool_calls, edits,
                                       lines_added, lines_removed)
                values (${id}, ${proj}, ${agent}, ${session}, ${toolUseId}, ${agentId}, ${type},
                        ${task}, ${model}, ${!ending},
                        /* A CASE expression and not a parameter holding the string "now()", which is
                           what the obvious version does: a tagged template turns every hole into a value,
                           so that spelling asks Postgres to cast the six characters n-o-w-(-) to a
                           timestamp and it refuses. The clock must stay the DATABASE's — a timestamp
                           taken on the machine that ran the hook would put a session's blocks on a
                           different axis from the one the page draws. */
                        case when ${ending} then now() else null end, ${outcome},
                        ${reported(input.tool_calls)}, ${reported(input.edits)},
                        ${reported(input.lines_added)}, ${reported(input.lines_removed)})
                returning *
              `
            : sql()`
                update subagents
                   set agent_id      = coalesce(${agentId}, agent_id),
                       tool_use_id   = coalesce(${toolUseId}, tool_use_id),
                       task          = coalesce(${task}, task),
                       model         = coalesce(${model}, model),
                       /* Never re-opens. A close is terminal: the second closing hook of a pair — and
                          both fire on the synchronous path — must not blank an end that is already
                          recorded, or the row would flicker between finished and running. */
                       ended_at      = coalesce(ended_at,
                                                case when ${ending} then now() else null end),
                       /* AN OUTCOME MAY BE SHARPENED AND NEVER BLUNTED, and a plain coalesce got this
                          wrong in a way only real sessions showed. SubagentStop fires about 126 ms
                          BEFORE PostToolUse even on the synchronous path, so first-writer-wins recorded
                          every completed sub-agent as the vaguer "ended" and threw the harness's own
                          "completed" away. The rule is: nothing overwrites a word that already says
                          more than "it stopped". */
                       outcome       = case
                                         when outcome is null or outcome = 'ended'
                                           then coalesce(${outcome}, outcome)
                                         else outcome
                                       end,
                       tool_calls    = coalesce(${reported(input.tool_calls)}, tool_calls),
                       edits         = coalesce(${reported(input.edits)}, edits),
                       lines_added   = coalesce(${reported(input.lines_added)}, lines_added),
                       lines_removed = coalesce(${reported(input.lines_removed)}, lines_removed)
                 where id = ${id}
                returning *
              `) as Promise<Row[]>,
        reread: () => sql()`select * from subagents where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.id) !== id) return `id is "${String(r.id)}"`;
            if (String(r.project) !== proj) return `project is "${String(r.project)}"`;
            if (ending && r.ended_at == null) {
                return 'the sub-agent was reported as finished but ended_at is empty';
            }
            return null;
        },
    });

    /*
     * A SPAWN IS EVIDENCE THE PARENT SESSION IS ALIVE, and using it is free.
     *
     * `SessionStart` and `SessionEnd` are the only two heartbeats, which is why the live window has to
     * be forty-five minutes wide (see LIVE_MINUTES). A sub-agent spawning is a second, independent
     * observation that the session existed at that instant, and it costs nothing to record because the
     * request is already here.
     *
     * UPDATE AND NEVER INSERT. If no session row exists the right answer is silence: inventing one
     * would give it a `started_at` of now, which is not when the session started, and a session block
     * drawn from a start nobody observed is precisely the claim this whole page must not make.
     */
    try {
        await sql()`
            update presence
               set last_seen_at = now(),
                   /* COALESCE, so the heartbeat's answer always wins over this one. Two observers of one
                      fact is fine; two writers racing to overwrite it is not, and the heartbeat is the
                      one whose whole job this is. */
                   model = coalesce(model, ${sessionModel})
             where project = ${proj} and agent = ${agent} and session = ${session}
               and kind = 'session'
        `;
    } catch (e) {
        /* Logged rather than swallowed, and never allowed to fail the write above: the sub-agent row is
         * the thing this request exists to record, and losing a decoration on the parent's freshness
         * costs a slightly stale line. Same call as `notePresenceFromSync`. */
        console.error('[subagent] could not touch the parent session row:',
            e instanceof Error ? e.message : e);
    }

    return { id, project: proj, ended: row.ended_at != null, created };
}

/* ------------------------------------------------------------------------------------------------
 * BACKFILL — the last fortnight, reconstructed from the transcripts the harness already wrote
 *
 * WHY THIS EXISTS AND WHY IT IS NOT CHEATING. A hook knows nothing about the sessions that ran before
 * it was installed, so the honest state of a freshly wired hub is an empty page — which is exactly the
 * failure this feature already shipped once, in the form of five rows reading "Nothing has ever
 * reported in". Claude Code writes a complete transcript of every session to disk, with timestamps, the
 * working directory, the branch and the model on every message. Reading it is the same act as
 * `cc spend` reading the usage records, and it is legitimate for the same reason
 * docs/BRIEF-NOTHING-BLOCKED.md §1 gives: what is local-only is PULLING, and the collector is local.
 *
 * WHAT MAKES IT HONEST RATHER THAN INVENTED, because a reconstructed block is still a claim about a
 * span of time:
 *
 *  - Every timestamp comes from a message the harness wrote. Nothing is estimated or rounded outward.
 *  - A transcript is a CONVERSATION and not a session — one of his runs for eleven days across a dozen
 *    sittings — so a file is split into stretches of activity at gaps of thirty minutes or more, and a
 *    stretch is what gets a row. The alternative was an eleven-day bar, which would be false about
 *    almost every hour it covered.
 *  - Every row is written with `observed = false`, and the page draws those differently and says so.
 *  - This route is the ONLY writer allowed to supply its own timestamps. Everywhere else the clock is
 *    the database's. That is why it is a separate route rather than a flag on `heartbeat`: the ability
 *    to state when something happened and the obligation to mark it as reconstructed are the same
 *    grant, and separating them would eventually let an ordinary write claim a time it did not observe.
 * ---------------------------------------------------------------------------------------------- */

export interface BackfillSession {
    project: unknown;
    session: unknown;
    started_at: unknown;
    ended_at: unknown;
    branch?: unknown;
    model?: unknown;
}

export interface BackfillSubagent {
    project: unknown;
    session: unknown;
    agent_id: unknown;
    type?: unknown;
    task?: unknown;
    model?: unknown;
    started_at: unknown;
    ended_at: unknown;
}

/** A timestamp supplied by the caller — parsed, bounded, and never in the future. */
function pastInstant(v: unknown, field: string): Date {
    const t = v == null ? NaN : new Date(String(v)).getTime();
    if (!Number.isFinite(t)) throw new Invalid(`${field} is not a timestamp`);
    /* A reconstructed row that claims to be in the future would render as a block to the right of now,
     * which is the one direction a timeline cannot mean anything in. Clamped rather than refused,
     * because a machine whose clock is a minute fast should not lose its whole history over it. */
    return new Date(Math.min(t, Date.now()));
}

/**
 * Write reconstructed activity. Returns what was written and what was left alone.
 *
 * NEVER OVERWRITES AN OBSERVED ROW. `where presence.observed = false` on the conflict path is what
 * guarantees that a hook's own record of a session always beats a reconstruction of the same session,
 * however many times this is run. Without it, running `cc backfill` after a good day of live capture
 * would replace measured spans with inferred ones and nothing would say so.
 */
export async function backfillActivity(
    sessions: BackfillSession[], subagents: BackfillSubagent[], agent: string,
): Promise<{ sessions: number; subagents: number; kept: number }> {
    await ensureSchema();

    /*
     * ONE STATEMENT PER TABLE, VIA `unnest`, AND THE FIRST VERSION OF THIS WAS UNUSABLE.
     *
     * A row at a time is a round trip at a time over the HTTP driver, and 271 stretches — one real
     * fortnight of his own history — took longer than the CLI's twenty-second timeout. It failed as
     * "could not reach the hub", which is the message for a hub that is down, about a hub that was
     * answering perfectly and simply had four hundred sequential inserts to do.
     *
     * Six parallel arrays through `unnest` make it two statements whatever the volume, and the
     * validation stays exactly where it was: every value is still put through `project`, `sessionId`
     * and the sanitisers before it reaches an array, because a bulk path that skips the boundary is how
     * a boundary stops meaning anything.
     */
    const rowsIn = sessions.slice(0, TIMELINE_MAX_SESSIONS).map(s => ({
        project: project(s.project),
        session: sessionId(s.session),
        started_at: pastInstant(s.started_at, 'started_at').toISOString(),
        ended_at: pastInstant(s.ended_at, 'ended_at').toISOString(),
        branch: s.branch == null || s.branch === ''
            ? null : sanitiseForDisplay(s.branch, 60, '(unnamed branch)').text,
        model: s.model == null || s.model === '' ? null : sanitiseToolName(s.model),
    }));

    let wroteSessions = 0;
    if (rowsIn.length) {
        const written = await sql()`
            insert into presence (project, agent, session, kind, started_at, last_seen_at, ended_at,
                                  branch, model, observed)
            select t.p, ${agent}, t.s, 'session', t.st, t.en, t.en, t.br, t.mo, false
              from unnest(${rowsIn.map(r => r.project)}::text[],
                          ${rowsIn.map(r => r.session)}::text[],
                          ${rowsIn.map(r => r.started_at)}::timestamptz[],
                          ${rowsIn.map(r => r.ended_at)}::timestamptz[],
                          ${rowsIn.map(r => r.branch)}::text[],
                          ${rowsIn.map(r => r.model)}::text[]) as t(p, s, st, en, br, mo)
            on conflict (project, agent, session) do update
                set started_at = excluded.started_at, last_seen_at = excluded.last_seen_at,
                    ended_at = excluded.ended_at, branch = excluded.branch, model = excluded.model
              where presence.observed = false
            returning session
        ` as Row[];
        wroteSessions = written.length;
    }

    const subsIn = subagents.slice(0, TIMELINE_MAX_SUBAGENTS)
        .map(a => ({
            id: newSubagentId(),
            project: project(a.project),
            session: sessionId(a.session),
            agent_id: harnessId(a.agent_id, 'agent_id'),
            type: sanitiseToolName(a.type == null || a.type === '' ? 'sub-agent' : a.type),
            task: a.task == null || a.task === ''
                ? null : sanitiseForDisplay(a.task, 120, '(no description given)').text,
            model: a.model == null || a.model === '' ? null : sanitiseToolName(a.model),
            started_at: pastInstant(a.started_at, 'started_at').toISOString(),
            ended_at: pastInstant(a.ended_at, 'ended_at').toISOString(),
        }))
        .filter(a => a.agent_id);

    let wroteSubagents = 0;
    if (subsIn.length) {
        const written = await sql()`
            insert into subagents (id, project, agent, session, agent_id, type, task, model,
                                   started_at, start_seen, ended_at, outcome, observed)
            select t.i, t.p, ${agent}, t.s, t.a, t.ty, t.ta, t.mo, t.st, true, t.en, 'ended', false
              from unnest(${subsIn.map(r => r.id)}::text[],
                          ${subsIn.map(r => r.project)}::text[],
                          ${subsIn.map(r => r.session)}::text[],
                          ${subsIn.map(r => r.agent_id)}::text[],
                          ${subsIn.map(r => r.type)}::text[],
                          ${subsIn.map(r => r.task)}::text[],
                          ${subsIn.map(r => r.model)}::text[],
                          ${subsIn.map(r => r.started_at)}::timestamptz[],
                          ${subsIn.map(r => r.ended_at)}::timestamptz[])
                   as t(i, p, s, a, ty, ta, mo, st, en)
            /* The index is PARTIAL, so its predicate has to be repeated here or Postgres cannot match
               it: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
               is what a partial index looks like from this end. */
            on conflict (project, agent_id) where agent_id is not null do update
                set session = excluded.session, started_at = excluded.started_at,
                    ended_at = excluded.ended_at, task = excluded.task, model = excluded.model
              where subagents.observed = false
            returning id
        ` as Row[];
        wroteSubagents = written.length;
    }

    return {
        sessions: wroteSessions,
        subagents: wroteSubagents,
        kept: rowsIn.length - wroteSessions,
    };
}

/**
 * The session ids the hub has ALREADY seen with its own hooks, so a backfill can leave them alone.
 *
 * Handed to the caller rather than enforced only here, because the expensive half is on the caller's
 * side: reading and splitting a fifty-megabyte transcript to produce rows the hub is going to refuse is
 * work nobody needs done. The refusal above stays anyway — a client that ignores this list must still
 * not be able to overwrite a measurement.
 */
export async function observedSessions(days = TIMELINE_DAYS): Promise<string[]> {
    await ensureSchema();
    const rows = await sql()`
        select distinct session from presence
         where kind = 'session' and observed = true
           and greatest(last_seen_at, coalesce(ended_at, last_seen_at))
               > now() - (${days} * interval '1 day')
         limit 2000
    ` as Row[];
    return rows.map(r => String(r.session));
}

/**
 * The sessions the timeline draws, newest first, bounded twice.
 *
 * `kind = 'session'` only. A sync row is one row per (project, agent) that gets its `last_seen_at`
 * bumped forever, so it has no span at all — drawing it as a block would be inventing a duration for
 * something that took a few milliseconds and happened many times. Syncs stay where they already work,
 * which is the per-project sentence above the chart.
 */
export async function sessionWindow(days = TIMELINE_DAYS): Promise<SessionRow[]> {
    await ensureSchema();
    const rows = await sql()`
        select project, agent, session, started_at, last_seen_at, ended_at, end_reason, branch, model,
               /* THIS COLUMN IS LOAD-BEARING AND IT WAS MISSING FROM THIS LIST. The mapper tests it
                  against false, so an absent column came back undefined and every one of 269
                  reconstructed spans was drawn as a session a hook had watched from start to finish.
                  Nothing failed; the chart simply asserted more than it knew, which is the exact defect
                  this whole page was rewritten to stop making. Found by noticing the legend had
                  silently dropped its hatched-bar clause. Check R3 asserts it now.
                  NO BACKTICKS IN HERE. This comment is inside a template literal and quoting an
                  identifier with a pair of them closes it — trap 1, and this is the sixteenth time,
                  written while documenting a different bug. */
               observed
          from presence
         where kind = 'session'
           and greatest(last_seen_at, coalesce(ended_at, last_seen_at))
               > now() - (${days} * interval '1 day')
         order by started_at desc
         limit ${TIMELINE_MAX_SESSIONS}
    ` as Row[];
    return rows.map(r => ({
        project: String(r.project),
        agent: String(r.agent),
        session: String(r.session),
        started_at: iso(r.started_at)!,
        last_seen_at: iso(r.last_seen_at)!,
        ended_at: iso(r.ended_at),
        end_reason: r.end_reason == null ? null : String(r.end_reason),
        branch: r.branch == null ? null : String(r.branch),
        model: r.model == null ? null : String(r.model),
        observed: r.observed !== false,
    }));
}

/** The sub-agents over the same window, bounded the same way and for the same reason. */
export async function subagentWindow(days = TIMELINE_DAYS): Promise<SubagentRow[]> {
    await ensureSchema();
    const rows = await sql()`
        select id, project, agent, session, type, task, model, started_at, start_seen, ended_at,
               outcome, tool_calls, edits, lines_added, lines_removed, observed
          from subagents
         where greatest(started_at, coalesce(ended_at, started_at))
               > now() - (${days} * interval '1 day')
         order by started_at desc
         limit ${TIMELINE_MAX_SUBAGENTS}
    ` as Row[];
    return rows.map(r => ({
        id: String(r.id),
        project: String(r.project),
        agent: String(r.agent),
        session: String(r.session),
        type: String(r.type),
        task: r.task == null ? null : String(r.task),
        model: r.model == null ? null : String(r.model),
        started_at: iso(r.started_at)!,
        start_seen: r.start_seen !== false,
        ended_at: iso(r.ended_at),
        outcome: r.outcome == null ? null : String(r.outcome),
        tool_calls: r.tool_calls == null ? null : Number(r.tool_calls),
        edits: r.edits == null ? null : Number(r.edits),
        lines_added: r.lines_added == null ? null : Number(r.lines_added),
        lines_removed: r.lines_removed == null ? null : Number(r.lines_removed),
        observed: r.observed !== false,
    }));
}

/* ================================================================================================
 * APPROVALS — a tool call an agent is holding on, waiting for one tap
 *
 * NOT a task and NOT a question. Nothing in `board()`'s counts reads this table, and the separate table
 * is what enforces that rather than a comment promising it.
 * ============================================================================================== */

/**
 * HOW LONG A REQUEST IS WORTH ANSWERING. Ten minutes, and the number is not ours to choose.
 *
 * It is the agent hook's own budget: a `command` hook is cancelled at 600 seconds, and a cancelled hook
 * is a non-blocking error, which for a permission request means the agent falls through to asking in the
 * terminal. So ten minutes is the longest a tap can still reach the process that is waiting for it, and
 * an approval that outlived that would be a button that changes nothing while looking like it works.
 *
 * Slightly SHORT of the budget on purpose — 570 seconds rather than 600. The last thirty seconds of the
 * window are worthless to him anyway (the round trip and the tap cannot land in time) and the margin
 * means the hub declares the request dead a moment before the harness does, rather than a moment after.
 * The alternative ordering produces the one genuinely confusing outcome: a tap that the hub accepts and
 * the agent has already stopped listening for.
 */
export const APPROVAL_SECONDS = 570;

export interface ApprovalInput {
    project: unknown;
    /** The harness's `tool_use_id`, which makes a re-post find the same row rather than making a second. */
    tool_use_id?: unknown;
    tool_name: unknown;
    /** One line describing the call, built by the CLI because it knows the tool shapes. Untrusted. */
    preview?: unknown;
    session?: unknown;
}

export interface Approval {
    id: string;
    project: string;
    agent: string;
    session: string | null;
    tool_use_id: string | null;
    tool_name: string;
    preview: string | null;
    /** How many characters the sanitiser removed. Rendered — see lib/sanitise.ts. */
    stripped: number;
    status: 'pending' | 'allowed' | 'denied' | 'expired';
    decided_at: string | null;
    decided_by: string | null;
    expires_at: string;
    created_at: string;
    tg_message_id: number | null;
}

function mapApproval(r: Row): Approval {
    const preview = r.preview == null ? null : String(r.preview);
    /*
     * `stripped` is recovered from the stored preview rather than stored as a column, because it is
     * derivable: the marker the writer appended is in the text. A column would be a second truth about
     * one string, and this codebase has been bitten by that shape before.
     */
    const m = preview ? /\s?\[(\d+) hidden\]$/.exec(preview) : null;
    return {
        id: String(r.id),
        project: String(r.project),
        agent: String(r.agent),
        session: r.session == null ? null : String(r.session),
        tool_use_id: r.tool_use_id == null ? null : String(r.tool_use_id),
        tool_name: String(r.tool_name),
        preview: m ? preview!.slice(0, m.index).trim() : preview,
        stripped: m ? Number(m[1]) : 0,
        status: r.status as Approval['status'],
        decided_at: iso(r.decided_at),
        decided_by: r.decided_by == null ? null : String(r.decided_by),
        expires_at: iso(r.expires_at)!,
        created_at: iso(r.created_at)!,
        tg_message_id: r.tg_message_id == null ? null : Number(r.tg_message_id),
    };
}

/**
 * File a held tool call. Returns the row and whether this call created it.
 *
 * IDEMPOTENT ON `tool_use_id`, and that is not a nicety. `cc permission` posts once and then polls, so a
 * dropped connection on the post means it posts again — and a second row would mean a second Telegram
 * message and two Allow buttons for one held tool call, which is the muted-channel failure arriving
 * inside the feature built to be worth un-muting for.
 *
 * A re-post of an ALREADY DECIDED call returns the decision rather than reopening it. The alternative —
 * refusing, as `upsertQuestion` does for an answered key — is wrong here: the caller is a hook that has
 * lost its connection and needs the answer, not a lecture about idempotency.
 */
export async function requestApproval(
    input: ApprovalInput, agent: string,
): Promise<{ approval: Approval; created: boolean }> {
    await ensureSchema();
    const proj = project(input.project);
    const toolName = sanitiseToolName(input.tool_name);
    const toolUseId = input.tool_use_id == null || input.tool_use_id === ''
        ? null
        : str(input.tool_use_id, 'tool_use_id', 120, true)!.replace(/[^A-Za-z0-9._:-]/g, '') || null;
    const session = input.session == null || input.session === '' ? null : sessionId(input.session);

    /*
     * SANITISED HERE, ON THE WAY IN. The whole argument is in lib/sanitise.ts; the short version is that
     * this string is rendered by a React page, a Telegram message and a terminal, and a rule applied at
     * each render site is a rule the next render site forgets.
     *
     * The removal count is appended to the stored text rather than given a column — see `mapApproval`.
     */
    const clean = sanitiseForDisplay(input.preview, 160, '(no details given)');
    const preview = clean.removed > 0 ? `${clean.text} [${clean.removed} hidden]` : clean.text;

    if (toolUseId) {
        const existing = await sql()`
            select * from approvals where project = ${proj} and tool_use_id = ${toolUseId}
        ` as Row[];
        if (existing[0]) return { approval: mapApproval(existing[0]), created: false };
    }

    const id = newApprovalId();
    const row = await writeVerified<Row>({
        what: `record that ${proj} is waiting on a ${toolName} call`,
        write: () => sql()`
            insert into approvals (id, project, agent, session, tool_use_id, tool_name, preview,
                                   expires_at)
            values (${id}, ${proj}, ${agent}, ${session}, ${toolUseId}, ${toolName}, ${preview},
                    now() + (${APPROVAL_SECONDS} * interval '1 second'))
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from approvals where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.id) !== id) return `id is "${String(r.id)}"`;
            if (String(r.tool_name) !== toolName) return `tool_name is "${String(r.tool_name)}"`;
            if (String(r.status) !== 'pending') return `status is "${String(r.status)}", expected pending`;
            if (r.expires_at == null) return 'expires_at was not set, so this would never lapse';
            return null;
        },
    });

    /*
     * NO EVENT IS LOGGED, and that is the non-negotiable being honoured rather than an omission.
     *
     * `events` is the agent contract — it is what `changed` in a sync is made of, and every kind in it
     * describes work or a decision. A permission request is neither: it lives for ten minutes, it is
     * answered by the human in the same ten minutes or not at all, and putting it in the log would put it
     * into every agent's catch-up forever. "Never becomes a task or a question" has to mean never
     * appearing where tasks and questions appear.
     */
    return { approval: mapApproval(row), created: true };
}

export async function getApproval(id: string): Promise<Approval | null> {
    await ensureSchema();
    const rows = await sql()`select * from approvals where id = ${id}` as Row[];
    return rows[0] ? mapApproval(rows[0]) : null;
}

/**
 * Remember which Telegram message carries this request, so it can be rewritten when it settles.
 *
 * Not routed through `writeVerified`, for the same reason `setQuestionMessageId` is not: this is bookkeeping
 * for a tidier chat, not state anything relies on. Losing it costs a stale message with two dead buttons —
 * and the buttons are safe when dead, because `decideApproval` refuses anything that is no longer pending.
 */
export async function setApprovalMessageId(id: string, messageId: number | null): Promise<void> {
    if (messageId == null) return;
    await sql()`update approvals set tg_message_id = ${messageId} where id = ${id}`;
}

/**
 * Allow or deny. The write that a held agent is waiting on.
 *
 * The `status = 'pending'` guard makes it idempotent under a double-tap in exactly the way `answerQuestion`
 * is: the second write matches zero rows, `writeVerified` raises, and the caller is told rather than shown
 * a false success. It also means a tap that arrives after expiry is REFUSED rather than silently applied —
 * which is the important half, because the agent has already handed back to the terminal by then and an
 * accepted decision would be a button that lies.
 */
export async function decideApproval(
    id: string, decision: 'allowed' | 'denied', by: 'web' | 'telegram',
): Promise<Approval> {
    await ensureSchema();
    const before = (await sql()`select * from approvals where id = ${id}` as Row[])[0];
    if (!before) throw new Invalid(`no approval with id "${id}"`);
    const current = mapApproval(before);
    if (current.status !== 'pending') {
        throw new Invalid(
            `that request was already ${current.status}. `
            + (current.status === 'expired'
                ? 'It ran out of time, so the agent has gone back to asking in its terminal.'
                : 'Answering twice is refused so the first answer cannot be silently overwritten.'),
        );
    }

    const row = await writeVerified<Row>({
        what: `${decision === 'allowed' ? 'allow' : 'deny'} the ${current.tool_name} call in ${current.project}`,
        write: () => sql()`
            update approvals
               set status = ${decision}, decided_at = now(), decided_by = ${by}
             where id = ${id} and status = 'pending'
            returning *
        ` as Promise<Row[]>,
        reread: () => sql()`select * from approvals where id = ${id}` as Promise<Row[]>,
        expect: r => {
            if (String(r.status) !== decision) return `status is "${String(r.status)}", expected "${decision}"`;
            if (r.decided_at == null) return 'decided_at was not set';
            return null;
        },
    });
    return mapApproval(row);
}

/**
 * Expire anything past its deadline, on the same lazy-on-read path as a timed default.
 *
 * NO CRON, for the reason AGENTS.md gives — and here the argument is even easier than it is for defaults,
 * because the process most interested in the answer is polling anyway. `cc permission` asks every few
 * seconds whether its request has been decided, so "whoever reads next" is guaranteed to be the party
 * that needs the expiry applied.
 *
 * IT EXPIRES VISIBLY, which is one of the brief's non-negotiables: the row goes to `expired` rather than
 * being deleted, so the band above the queue can say that a request lapsed instead of the request simply
 * vanishing. *"An approval that silently lapsed is worse than one that was never asked."*
 */
export async function expireApprovals(): Promise<number> {
    await ensureSchema();
    const rows = await sql()`
        update approvals set status = 'expired'
         where status = 'pending' and expires_at < now()
        returning id
    ` as Row[];
    return rows.length;
}

/**
 * What the band above the queue renders: everything pending, plus anything that lapsed or was decided
 * recently enough to still be worth saying.
 *
 * The recently-resolved ones are included for one reason: a request that disappears the instant it is
 * answered gives no confirmation that the tap landed, and this is a control whose whole promise is that
 * pressing it does something to a process on another machine. Ninety seconds is long enough to read.
 */
export async function liveApprovals(): Promise<Approval[]> {
    await ensureSchema();
    await expireApprovals();
    const rows = await sql()`
        select * from approvals
         where status = 'pending'
            or (decided_at is not null and decided_at > now() - interval '90 seconds')
            or (status = 'expired' and expires_at > now() - interval '90 seconds')
         order by created_at asc
    ` as Row[];
    return rows.map(mapApproval);
}

/* ================================================================================================
 * SPEND — tokens in, money derived
 * ============================================================================================== */

export interface SpendRowInput {
    project: unknown;
    model: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_write_5m?: unknown;
    cache_write_1h?: unknown;
    cache_read?: unknown;
    samples?: unknown;
}

const count = (v: unknown): number => {
    if (v == null) return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Invalid('token counts must be non-negative numbers');
    return Math.round(n);
};

export interface SpendRow {
    source: string;
    project: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_write_5m: number;
    cache_write_1h: number;
    cache_read: number;
    samples: number;
    measured_at: string;
}

/**
 * REPLACE one machine's whole measurement. Not add to it.
 *
 * The summariser reads every transcript on the machine every time it runs, so what it posts is a complete
 * snapshot rather than a delta — and a snapshot has to REPLACE, or two runs an hour apart would report
 * double. Deleting this source's rows inside the same call as the insert is what makes running it twice
 * harmless, which matters because it is the kind of command somebody runs twice to see if it worked.
 *
 * Scoped to `source` so a second machine cannot wipe the first's figures. Without that column the last
 * machine to run would win and nothing on the page would say so.
 */
export async function putSpend(
    source: string, rows: SpendRowInput[],
): Promise<{ source: string; projects: number; models: number }> {
    await ensureSchema();
    const src = str(source, 'source', 40, true)!.toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'unknown';
    if (rows.length > 2000) {
        throw new Invalid(
            `${rows.length} spend rows is more than this is for. It is one row per project per model; if the `
            + 'summariser is producing thousands, it is keying on something other than a project.',
        );
    }

    const clean = rows.map(r => ({
        project: project(r.project),
        /* The model id is an identifier and is constrained like one, for the same reason a tool name is:
         * it is displayed, and it is the key the price table is looked up by. */
        model: sanitiseToolName(r.model),
        input_tokens: count(r.input_tokens),
        output_tokens: count(r.output_tokens),
        cache_write_5m: count(r.cache_write_5m),
        cache_write_1h: count(r.cache_write_1h),
        cache_read: count(r.cache_read),
        samples: count(r.samples),
    }));

    await sql()`delete from spend where source = ${src}`;
    for (const r of clean) {
        await sql()`
            insert into spend (source, project, model, input_tokens, output_tokens, cache_write_5m,
                               cache_write_1h, cache_read, samples, measured_at)
            values (${src}, ${r.project}, ${r.model}, ${r.input_tokens}, ${r.output_tokens},
                    ${r.cache_write_5m}, ${r.cache_write_1h}, ${r.cache_read}, ${r.samples}, now())
            on conflict (source, project, model) do update
                set input_tokens = ${r.input_tokens}, output_tokens = ${r.output_tokens},
                    cache_write_5m = ${r.cache_write_5m}, cache_write_1h = ${r.cache_write_1h},
                    cache_read = ${r.cache_read}, samples = ${r.samples}, measured_at = now()
        `;
    }

    /*
     * Verified by counting the rows back, which is `writeVerified`'s property applied to a set rather than
     * to a row. The helper takes one row and one re-read, so a bulk replace cannot use it directly — and
     * "the statements did not throw" is exactly the proxy measurement this codebase refuses. If the delete
     * and the inserts disagree, this says so instead of reporting a spend figure built on half a snapshot.
     */
    const [got] = await sql()`
        select count(*)::int as n from spend where source = ${src}
    ` as Row[];
    const expected = new Set(clean.map(r => `${r.project}|${r.model}`)).size;
    if (Number(got.n) !== expected) {
        throw new WriteFailed(
            `replace ${src}'s spend measurement`,
            `${expected} rows were sent and ${Number(got.n)} are stored, so the figure would be wrong`,
        );
    }

    return {
        source: src,
        projects: new Set(clean.map(r => r.project)).size,
        models: new Set(clean.map(r => r.model)).size,
    };
}

/**
 * EVERYTHING `/agents` RENDERS, in one batch.
 *
 * Three reads rather than three awaits in the page, for the reason `board()` learned the hard way: a round
 * trip to Neon is ~105 ms, and `projects: await projects()` sitting in a returned object literal reads as
 * free while being one more sequential trip. Nothing here depends on anything else here.
 *
 * `ensureSchema` is not repeated — each of the three calls applies it, and it is a resolved promise after
 * the first.
 */
export async function agentsView(): Promise<{
    projects: ProjectSummary[];
    presence: PresenceRow[];
    sessions: SessionRow[];
    subagents: SubagentRow[];
    spend: SpendRow[];
    /** The newest report per conversation — one row each, never the log. See `latestReports`. */
    reports: Report[];
    /**
     * THE CROSS-PROJECT DIGEST, and it costs no model call at all.
     *
     * "One line across everything" turned out not to need a summariser: it is the newest thing each
     * project's own agent wrote about where that project stands, one row each, folded by `distinct on`.
     */
    briefs: Brief[];
}> {
    const [projectList, presence, sessions, subagents, spend, reports, briefs] = await Promise.all([
        projects(), presenceRows(), sessionWindow(), subagentWindow(), spendRows(), latestReports(),
        latestBriefs(),
    ]);
    return { projects: projectList, presence, sessions, subagents, spend, reports, briefs };
}

/**
 * ==================================================================================================
 * ONE PROJECT, EVERYTHING THE HUB KNOWS ABOUT IT — the read behind `/p/<slug>`.
 * ==================================================================================================
 *
 * His words, and they are the specification: *"I want to open one of my projects and see what the AI has
 * done, where they are, what they have reported, how they are working… This hub must be my command center
 * where I control all of my projects, or my agents, all of my sub-agents, everyone and everything."*
 *
 * SIX READS, CONCURRENT, EVERY ONE OF THEM SCOPED OR BOUNDED. The page's whole risk is that it is per
 * project and there is no ceiling on projects — so nothing here reads a table whole. `tasks` and
 * `questions` are filtered in SQL rather than by fetching `board()` and discarding: `board()` returns the
 * open work of every project plus a window of finished history, which is exactly the payload cliff
 * §XXVI removed from the queue, and it would arrive here once per project page view.
 *
 * WHAT IS DELIBERATELY NOT SCOPED: `sessionWindow` and `subagentWindow`. The chart needs both, they are
 * already capped by time and by row count, and the page filters to its own lanes. Adding project-scoped
 * copies of two bounded reads would be a second definition of "the window", and two windows disagreeing
 * about what a fortnight is would put a run on one page and not the other.
 */
export async function projectView(slug: string): Promise<{
    project: string;
    known: boolean;
    presence: PresenceRow[];
    sessions: SessionRow[];
    subagents: SubagentRow[];
    reports: Report[];
    briefs: Brief[];
    openQuestions: Question[];
    answeredQuestions: Question[];
    openTasks: Task[];
    doneTasks: Task[];
    notes: Note[];
    approvals: Approval[];
    spend: SpendRow[];
}> {
    await ensureSchema();
    const proj = project(slug);

    const [presence, sessions, subagents, reports, briefs, questionRows, taskRows, noteRows, approvals,
        spend] = await Promise.all([
            presenceRows(),
            sessionWindow(),
            subagentWindow(),
            projectReports(proj),
            projectBriefs(proj),
            sql()`
                select * from questions
                 where project = ${proj}
                 order by case when status = 'open' then 0 else 1 end,
                          coalesce(answered_at, created_at) desc
                 limit 120
            ` as Promise<Row[]>,
            sql()`
                select * from tasks
                 where project = ${proj} and status <> 'dropped'
                 order by case when status = 'open' then 0 else 1 end,
                          coalesce(done_at, created_at) desc
                 limit 120
            ` as Promise<Row[]>,
            sql()`
                select * from notes where project = ${proj} order by created_at desc limit 40
            ` as Promise<Row[]>,
            liveApprovals(),
            spendRows(),
        ]);

    const questions = questionRows.map(mapQuestion);
    const tasks = taskRows.map(mapTask);

    /*
     * `known` is the honest version of "does this project exist", and it is not a row in a table. There is
     * no projects table — a project is a slug that something has filed work or activity under — so the
     * question a 404 has to answer is whether anything at all mentions it. Getting this wrong in either
     * direction is bad: a typo'd URL that renders an authoritative empty page says the project is quiet
     * when it does not exist, and a real-but-idle project 404ing hides work he has open.
     */
    const known = presence.some(p => p.project === proj)
        || questions.length > 0 || tasks.length > 0 || noteRows.length > 0
        || reports.length > 0 || briefs.length > 0
        || spend.some(s => s.project === proj && s.samples > 0);

    return {
        project: proj,
        known,
        presence: presence.filter(p => p.project === proj),
        sessions: sessions.filter(s => s.project === proj),
        subagents: subagents.filter(s => s.project === proj),
        reports,
        briefs,
        openQuestions: questions.filter(q => q.status === 'open'),
        answeredQuestions: questions.filter(q => q.status !== 'open'),
        openTasks: tasks.filter(t => t.status === 'open'),
        doneTasks: tasks.filter(t => t.status === 'done'),
        notes: noteRows.map(mapNote),
        approvals: approvals.filter(a => a.project === proj),
        spend: spend.filter(s => s.project === proj),
    };
}

/**
 * ==================================================================================================
 * FORGET A PROJECT THAT WAS NEVER A PROJECT — the second delete in this codebase, and it needs the
 * same kind of argument the first one did.
 * ==================================================================================================
 *
 * `docs/HANDOVER.md` says plainly: *"There is no delete endpoint for agent data and there should not be
 * one."* That rule is right and it is about protecting a real hub from a suite. This is the second
 * exception, and the first — `note.remove` — set the shape of the argument: it arrived because production
 * had permanent residue with no way to remove it, and the alternative was living with a lie on the most
 * trusted surface in the product.
 *
 * THE RESIDUE HERE WAS MINE. The CLI inferred a project from whatever directory an agent was standing in,
 * so `GAMBLANGO/orchestrator/research/reports` became a project called `reports` — with a page, a run, and
 * a latest word. `projectFrom` in `cli/cc.mjs` stops it happening again. It does nothing about the rows
 * already written, and those rows have no expiry: `presenceRows` is not time-windowed, so a phantom sits on
 * `/agents` reading "quiet" forever.
 *
 * ==================================================================================================
 * WHAT MAKES IT SAFE IS THE REFUSAL, NOT THE CAUTION
 * ==================================================================================================
 *
 * **It deletes only OBSERVATIONS, and only for a slug with no work of any kind.** If a single task or
 * question has ever been filed against it, this refuses — and that is what makes it impossible to lose
 * anything a human or an agent authored. A phantom by definition has no work: nobody filed a task against
 * a directory that only existed as a path.
 *
 * `events` ARE LEFT ALONE, deliberately, and it is the same reasoning `note.remove` uses: the event log is
 * what agents were TOLD, and rewriting it would make the hub disagree with the history its own clients have
 * already read. It costs nothing here — `foldProjects` only gives a slug a row when something CURRENT is
 * known about it, so with the observations gone the phantom leaves the page while the record of it survives.
 *
 * IT IS REACHED FROM THE WEB SESSION, never from an agent token. Same door as `note.remove`, for the same
 * reason: this is a judgement only the human can make, and a suite holding an agent token cannot call it.
 */
export async function forgetProject(slug: string): Promise<{
    project: string; presence: number; reports: number; subagents: number; spend: number;
}> {
    await ensureSchema();
    const proj = project(slug);

    const [[work]] = [await sql()`
        select (select count(*)::int from tasks where project = ${proj}) tasks,
               (select count(*)::int from questions where project = ${proj}) questions
    ` as Row[]];
    const tasks = Number(work.tasks);
    const questions = Number(work.questions);
    if (tasks > 0 || questions > 0) {
        throw new Invalid(
            `"${proj}" has ${tasks} task(s) and ${questions} decision(s) filed against it, so it is a real `
            + 'project and this refuses. This exists to remove a slug that was never a project — a phantom '
            + 'from a subdirectory — and it deletes observations only. Nothing that a person or an agent '
            + 'authored can be lost through it.',
        );
    }

    /* Counted before, not after, because `delete` returning a count is the driver's business and the point
     * of this figure is to tell him what went. Re-read below to prove it actually went. */
    const [[before]] = [await sql()`
        select (select count(*)::int from presence  where project = ${proj}) presence,
               (select count(*)::int from reports   where project = ${proj}) reports,
               (select count(*)::int from subagents where project = ${proj}) subagents,
               (select count(*)::int from spend     where project = ${proj}) spend
    ` as Row[]];

    await sql()`delete from reports where project = ${proj}`;
    await sql()`delete from subagents where project = ${proj}`;
    await sql()`delete from presence where project = ${proj}`;
    await sql()`delete from spend where project = ${proj}`;

    /* VERIFIED BY READING, like every other write in this hub. A delete that reported success over rows
     * that are still there would leave the phantom on the page and tell him it was gone. */
    const [[after]] = [await sql()`
        select (select count(*)::int from presence  where project = ${proj}) presence,
               (select count(*)::int from reports   where project = ${proj}) reports,
               (select count(*)::int from subagents where project = ${proj}) subagents,
               (select count(*)::int from spend     where project = ${proj}) spend
    ` as Row[]];
    const left = Number(after.presence) + Number(after.reports)
        + Number(after.subagents) + Number(after.spend);
    if (left > 0) {
        throw new WriteFailed(`forget "${proj}"`, `${left} row(s) are still there after the delete`);
    }

    return {
        project: proj,
        presence: Number(before.presence),
        reports: Number(before.reports),
        subagents: Number(before.subagents),
        spend: Number(before.spend),
    };
}

/** Every spend row, from every source. The page sums them; nothing here decides anything. */
export async function spendRows(): Promise<SpendRow[]> {
    await ensureSchema();
    const rows = await sql()`
        select source, project, model, input_tokens, output_tokens, cache_write_5m, cache_write_1h,
               cache_read, samples, measured_at
          from spend
    ` as Row[];
    return rows.map(r => ({
        source: String(r.source),
        project: String(r.project),
        model: String(r.model),
        input_tokens: Number(r.input_tokens),
        output_tokens: Number(r.output_tokens),
        cache_write_5m: Number(r.cache_write_5m),
        cache_write_1h: Number(r.cache_write_1h),
        cache_read: Number(r.cache_read),
        samples: Number(r.samples),
        measured_at: iso(r.measured_at)!,
    }));
}

/* ------------------------------------------------------------------------------------------------
 * Search — over the whole record, not over whatever the page happened to ship
 * ---------------------------------------------------------------------------------------------- */

/**
 * Everything matching every term, ranked by the one ranking function there is.
 *
 * TWO QUERIES AND NOT ONE, and not a UNION either. Tasks and questions carry different columns and produce
 * different result rows; a UNION would mean padding both sides to a common shape in SQL and then unpicking
 * it, which is more code to read than two statements that each say what they mean. They run concurrently.
 *
 * THE DATABASE NARROWS AND THE SCORING IS DONE HERE. `ILIKE ALL` reduces thousands of rows to at most a few
 * hundred; ranking them needs word-start-versus-mid-word, which is awkward in SQL and already written in
 * lib/search.ts — and it MUST be the same function the client scores its own destinations with, or two
 * results with equally good matches would be ordered by which list they came from. See that file.
 *
 * NO INDEX, STATED RATHER THAN OVERLOOKED. `ILIKE '%term%'` cannot use a b-tree, so this is a sequential
 * scan: measured at two years of volume (2,199 finished tasks, 1,462 answered decisions) it is a handful of
 * milliseconds, because the row count is small and the strings are short. A trigram index is what this wants
 * if it ever stops being — `pg_trgm` plus a GIN index on the haystack expression — and the reason not to
 * reach for it now is that an unnecessary index is a migration he would have to run.
 */
export async function search(query: string): Promise<SearchRow[]> {
    const ts = terms(query);
    if (!ts.length) return [];
    const patterns = ts.map(likePattern);

    const [taskRows, questionRows] = await Promise.all([
        /*
         * OPEN AND FINISHED TASKS TOGETHER, over the same fields.
         *
         * The client-side version searched `verify` and `gotchas` on open tasks and could not on finished
         * ones, because the finished rows in the payload do not carry them — and its own comment called that
         * out as the reason `steps` was excluded from both ("a search that covers half its corpus without
         * saying so is worse than one that covers less and is consistent"). From here every task has every
         * column, so the corpus is uniform for the first time.
         *
         * `steps` is still excluded, and now for a better reason than payload shape: it is jsonb, so the
         * only cheap way to search it is `steps::text`, which puts the words "do", "detail" and "copy" into
         * every task's haystack. A query for "do" matching all 2,199 completions is worse than not
         * searching steps at all.
         */
        sql()`
            select t.id, t.project, t.title, t.why, t.minutes, t.status, t.blocked_reason, t.done_at,
                   coalesce(jsonb_array_length(t.steps), 0) as step_count,
                   lower(concat_ws(' ', t.title, t.why, t.project, t.verify,
                       (select string_agg(g, ' ') from jsonb_array_elements_text(t.gotchas) g))) as hay
              from tasks t
             where t.status in ('open', 'done')
               and lower(concat_ws(' ', t.title, t.why, t.project, t.verify,
                       (select string_agg(g, ' ') from jsonb_array_elements_text(t.gotchas) g)))
                   like all(${patterns})
             order by coalesce(t.done_at, t.created_at) desc
             limit 300
        ` as Promise<Row[]>,
        /*
         * OPEN AND ANSWERED DECISIONS, which is a corpus the palette never had at all.
         *
         * Open questions were searchable and answered ones were not, because `Board` held the answered ones
         * for the derivation and `Palette` was simply never handed them. So a decision he made six weeks ago
         * — with its options, its reasoning and his own comment on it — was in the payload and unfindable.
         * That is not new scope: it is the same corpus the record's Decisions tab already shows, reachable
         * by the control that exists to reach things.
         */
        sql()`
            select q.id, q.project, q.title, q.context, q.status, q.answered_at, q.answer_option,
                   q.answer_text, q.answer_note, q.options,
                   lower(concat_ws(' ', q.title, q.context, q.project, q.answer_text, q.answer_note,
                       (select string_agg(concat_ws(' ', o->>'label', o->>'detail'), ' ')
                          from jsonb_array_elements(q.options) o))) as hay
              from questions q
             where q.status in ('open', 'answered')
               and lower(concat_ws(' ', q.title, q.context, q.project, q.answer_text, q.answer_note,
                       (select string_agg(concat_ws(' ', o->>'label', o->>'detail'), ' ')
                          from jsonb_array_elements(q.options) o)))
                   like all(${patterns})
             order by coalesce(q.answered_at, q.created_at) desc
             limit 300
        ` as Promise<Row[]>,
    ]);

    const out: SearchRow[] = [];

    for (const r of taskRows) {
        const done = r.status === 'done';
        out.push({
            id: String(r.id),
            kind: done ? 'finished' : r.blocked_reason != null ? 'blocked' : 'task',
            project: String(r.project),
            title: String(r.title),
            detail: r.why == null ? null : String(r.why),
            minutes: r.minutes == null ? null : Number(r.minutes),
            steps: Number(r.step_count ?? 0),
            at: done ? iso(r.done_at) : null,
            options: null,
            score: score(String(r.hay ?? ''), ts),
        });
    }

    for (const r of questionRows) {
        const answered = r.status === 'answered';
        const opts = json<QuestionOption[]>(r.options, []);
        /* What he CHOSE is the useful line on a decision he already made — the label he read, never the
         * option key, for the same reason `DecisionMade.chose` carries a label. */
        const chose = r.answer_option != null
            ? (opts.find(o => o.key === String(r.answer_option))?.label ?? String(r.answer_option))
            : r.answer_text != null ? String(r.answer_text) : 'approved it';
        out.push({
            id: String(r.id),
            kind: answered ? 'decided' : 'question',
            project: String(r.project),
            title: String(r.title),
            detail: answered ? `You chose: ${chose}` : (r.context == null ? null : String(r.context)),
            minutes: null,
            steps: null,
            at: answered ? iso(r.answered_at) : null,
            options: answered ? null : opts.length,
            score: score(String(r.hay ?? ''), ts),
        });
    }

    /* Zero cannot normally happen — the row matched `LIKE ALL` — but `score` and the SQL are two
     * implementations of "matches", and a row the ranking cannot explain must not be shown above one it can. */
    return out.filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------------------------------------
 * The page
 * ---------------------------------------------------------------------------------------------- */

export interface BoardState {
    questions: Question[];
    tasks: Task[];
    notes: Note[];
    agents: { name: string; last_sync_at: string | null; sync_count: number }[];
    /**
     * THE MOST RECENT `RECORD_WINDOW` COMPLETIONS AND DECISIONS, WITH THEIR PROSE — and it says so on screen.
     *
     * What was here before, and why it was right until it was not:
     *
     *   *"Everything finished, and every decision made. NOT capped at five. This used to be `recentlyDone`, a
     *   `limit 5`… The cap is gone rather than raised. A record that silently stops at five is wrong the first
     *   time it matters, and there is nothing to protect: these are tens of rows, and every figure on the page
     *   is counted from exactly this list, so a cap here would have made the count disagree with the list it
     *   came from."*
     *
     * Both halves of that argument have been answered rather than abandoned. "These are tens of rows" stopped
     * being true — at two years of his own measured rate it is 3,661 rows and 2.1 MB of JSON. And "the count
     * is counted from exactly this list" is why `history` and `totals` exist: the figures are still folded
     * over EVERY row (as numbers), and the count is checked against SQL rather than against an array length.
     *
     * So nothing is hidden and no figure moved. What changed is that the sentences stop arriving for rows
     * older than the window, and the record's own heading states how many of how many it is showing — the same
     * rule `notes` has followed since it was capped at 20: *"a window is honest as long as the interface does
     * not claim it is everything."*
     */
    doneTasks: FinishedRow[];
    answeredQuestions: Question[];
    /**
     * EVERY finished task and EVERY answered decision, as the numbers the derivation reads.
     *
     * This is what keeps the two lists above safe to window. See `History` and `expandHistory` in
     * lib/progress.ts for the encoding and the measurement that chose it.
     */
    history: History;
    /**
     * COUNTED IN SQL, and this is P2's new invariant.
     *
     * P2 used to assert "the figure on the page equals the number of rows listed", which is exactly the
     * property a window breaks. It now asserts the figure equals `count(*)` — data-independent, strictly
     * stronger, and it would still have caught the `limit 5` that P2 was written for.
     */
    totals: { tasksDone: number; decisionsMade: number };
    /** Every project the hub knows about, so a note can be addressed to one. */
    projects: ProjectSummary[];
    /**
     * HELD TOOL CALLS. Pending, plus anything settled in the last ninety seconds.
     *
     * On `BoardState` and NOT in `counts`, and that separation is the brief's non-negotiable rather than a
     * layout choice: the header chips, `openTasks`, `openQuestions` and every figure the record folds are
     * untouched by this field. It exists so the band above the queue has something to render, and nothing
     * that counts his work reads it.
     */
    approvals: Approval[];
    /**
     * THE NEWEST OBSERVATION PER (PROJECT, AGENT). Bounded — see `presenceRows`.
     *
     * On the board for exactly one sentence on the empty card, and it is a done-condition rather than a
     * nice-to-have: an empty queue and a dead agent have to be distinguishable in one line on the first
     * screen. Nothing counts it and nothing else on this page reads it.
     */
    presence: PresenceRow[];
}

export async function board(): Promise<BoardState> {
    /*
     * The schema is applied here because a freshly deployed hub against an empty database has to create its
     * own tables on the first request rather than 500ing until somebody runs a command. See lib/schema.ts for
     * why that is worth doing at all.
     *
     * THIS COMMENT USED TO CLAIM THAT `board` IS THE READ EVERY ENTRY POINT GOES THROUGH, and that stopped
     * being true the moment presence, approvals and spend got routes of their own. The claim was load-bearing
     * — it was the whole reason one `ensureSchema()` was considered sufficient — and the consequence appeared
     * on the first request to the first new route: *"The database schema has not been created yet. Run
     * npm run init-db"*, which is accurate about the symptom, wrong about the cause, and wrong about the fix,
     * since the entire point of a self-applying schema is that deploying IS the migration.
     *
     * So every entry point that touches one of the new tables calls `ensureSchema()` itself. It is a resolved
     * promise after the first call and costs nothing, and putting it in the STORE rather than in the routes is
     * what stops the next route from reintroducing the bug: a route author cannot forget a call they do not
     * have to make.
     *
     * It is awaited rather than fired and forgotten: the queries below would race the CREATE otherwise, and
     * "the table does not exist" on a first load is exactly the broken-first-impression this prevents. After
     * the first call it is a resolved promise and costs nothing.
     */
    await ensureSchema();
    /*
     * The defaults and the nudge sweep, from ONE read of the questions that have a timed default.
     *
     * The cost is worth stating rather than leaving to be discovered. When nothing is due — which is every
     * load except at most twice per open decision — this is that single query and nothing else. When
     * something IS due it adds a Telegram round trip to the page render, and that is accepted: it happens at
     * most twice in the life of a decision, and the alternative is a scheduler, which AGENTS.md rules out for
     * a better reason than latency.
     *
     * Measured, because the first version read twice and it showed: two sequential round trips to Neon at
     * ~105 ms each, before the page's own queries start, took the fixture-volume server render from 515 ms to
     * 810 ms against L8's 1,200 ms budget. See `timedQuestions`.
     */
    await applyTimed();

    /*
     * `projects()` IS IN HERE NOW, and it was costing a round trip nobody had counted.
     *
     * It used to be `projects: await projects()` inside the returned object literal — which reads as free and
     * is one more sequential round trip to Neon after all nine of these have finished. Measured at ~105 ms
     * from the server, which is a tenth of L8's whole budget spent on ordering rather than on work. Nothing
     * else in the return depends on it, so it belongs in the batch.
     */
    const [questions, tasks, notes, agents, done, answered,
           historyTasks, historyDecisions, totals, projectList, heldCalls, presence] = await Promise.all([
        sql()`select * from questions where status = 'open' order by
              (deadline is null), deadline asc, created_at asc` as Promise<Row[]>,
        sql()`select * from tasks where status = 'open' order by
              (blocked_reason is not null), created_at asc` as Promise<Row[]>,
        /*
         * TWENTY, not five, because these are now a surface rather than a footer line.
         *
         * Five was right when the only thing rendered was `Last note: "…"` truncated to 120 characters. What he
         * asked for was easier communication with the agents, and half of that is being able to see what he
         * already told them — a channel you cannot review is a channel you stop trusting.
         *
         * Capped, unlike `doneTasks`, and the difference is real: every figure on this page is counted from the
         * completions, so a cap there would make a number disagree with its own list. Nothing counts notes, so a
         * window is honest as long as the interface does not claim it is everything. It says "the last 20".
         */
        sql()`select * from notes order by created_at desc limit 20` as Promise<Row[]>,
        sql()`select name, last_sync_at, sync_count from agents
              order by last_sync_at desc nulls last` as Promise<Row[]>,
        /*
         * `done_at is not null` is belt and braces on top of `status = 'done'`.
         *
         * `setTaskStatus` maintains both together and `writeVerified` refuses the write if they disagree,
         * so a done row without a timestamp should be impossible. It is asserted here anyway because every
         * derived figure is ordered and dated by `done_at`, so a null would silently sort a completion to
         * one end of the record rather than failing. Cheap, and it turns an invisible wrong answer into a
         * missing row that the count check in tests/use-it.mjs would catch.
         */
        /*
         * NARROW COLUMNS, AND THE STEP COUNT COMPUTED IN SQL. Now also A WINDOW.
         *
         * This selected `*`, so every completed task's `steps`, `verify` and `gotchas` were serialised into
         * every page load — 581 bytes per completion measured against the fixture, of which lib/progress.ts
         * reads 240, growing without a ceiling. Narrowing it to these columns took a two-year payload from
         * 776 KB to 384 KB, which was not enough: see the table above `FinishedRow`.
         *
         * `jsonb_array_length` because the only thing anything reads off the steps is how many there are.
         * `coalesce` guards the rows written before `steps` defaulted to an empty array.
         *
         * ORDER BY `done_at desc, id desc`, AND THE TIEBREAK IS LOAD-BEARING. This query and the tuple query
         * below must agree row for row, because `expandHistory` puts this row's prose onto that row's numbers
         * BY POSITION. `done_at desc` alone is not a total order — two completions inside the same second
         * would be returned in either order, and then a title would land on the wrong history row. Check S1 in
         * tests/use-it.mjs recomputes the score from SQL over a 93-completion record, which is what makes this
         * an assertion rather than a hope.
         */
        sql()`select id, project, title, why, minutes, status, note, created_at, done_at,
                     coalesce(jsonb_array_length(steps), 0) as step_count
              from tasks
              where status = 'done' and done_at is not null
              order by done_at desc, id desc
              limit ${RECORD_WINDOW}` as Promise<Row[]>,
        /*
         * `answered` only — never `defaulted`, never `ignored`.
         *
         * `defaulted` means the hub proceeded WITHOUT him because a deadline passed, so counting it as
         * something he did would be the exact lie this whole surface has to avoid. `ignored` is a deferral.
         * The reasoning is in lib/progress.ts, next to the filter that enforces it a second time — the SQL
         * narrows it for cost, the filter narrows it for correctness, and the correctness one is the one
         * that must not be removed.
         *
         * `select *` survives here and it is now bounded by the window. These are the 883-byte rows —
         * `options`, `context`, `answer_note` — that measured 1,291 KB at two years, 62% of the whole payload
         * and the half nobody had looked at because `FinishedRow` had already made the completions the
         * suspect.
         */
        sql()`select * from questions
              where status = 'answered' and answered_at is not null
              order by answered_at desc, id desc
              limit ${RECORD_WINDOW}` as Promise<Row[]>,
        /*
         * EVERY finished task, as six numbers. The other half of the same ordering as the window above.
         *
         * `minutes` and `step_count` are coalesced to 0 rather than left null, because a tuple of numbers with
         * a `null` in it costs four characters to say "nothing" and `expandHistory` maps 0 back to null. There
         * is no task with an estimate of zero minutes to confuse it with — `minutes` is an honest estimate of
         * work only he can do.
         */
        sql()`select project,
                     coalesce(minutes, 0)::int                        as minutes,
                     coalesce(jsonb_array_length(steps), 0)::int      as step_count,
                     (note is not null and btrim(note) <> '')         as noted,
                     floor(extract(epoch from created_at))::bigint    as created_s,
                     floor(extract(epoch from done_at))::bigint       as done_s
                from tasks
               where status = 'done' and done_at is not null
               order by done_at desc, id desc` as Promise<Row[]>,
        /* ...and every answered decision, as four. */
        sql()`select project,
                     floor(extract(epoch from created_at))::bigint    as created_s,
                     floor(extract(epoch from answered_at))::bigint   as answered_s,
                     coalesce(floor(extract(epoch from deadline)), 0)::bigint as deadline_s
                from questions
               where status = 'answered' and answered_at is not null
               order by answered_at desc, id desc` as Promise<Row[]>,
        /*
         * THE COUNTS, FROM SQL. P2's invariant, and the reason it can be stated at all.
         *
         * Two `count(*)`s rather than `historyTasks.length`, even though those must agree. The point of a
         * check is to compare two things arrived at independently: the figure on the page is folded out of the
         * tuples in the browser, and this is the database's own answer. If a future change loses a row
         * somewhere between them, P2 says so.
         */
        sql()`select (select count(*)::int from tasks
                       where status = 'done' and done_at is not null)          as tasks_done,
                     (select count(*)::int from questions
                       where status = 'answered' and answered_at is not null)  as decisions_made` as Promise<Row[]>,
        projects(),
        /*
         * IN THE BATCH, for the reason `projects()` was moved into it: a held tool call has a ten-minute life
         * and the page render is the thing standing between him and the button, so a sequential ~105 ms round
         * trip after nine others is the worst possible place to spend it.
         *
         * `liveApprovals()` applies the expiry itself, which is the lazy-on-read path doing exactly what it is
         * for — the page load is one of the two reads guaranteed to happen while a request is alive.
         */
        liveApprovals(),
        /*
         * PRESENCE, ON THE BOARD, and it is here for one line rather than for a panel.
         *
         * `docs/BRIEF-NOTHING-BLOCKED.md` §5 requires that *"an empty queue can be told apart from a dead
         * agent, in one line, on the first screen."* The `emptiness` states already answer that for the hub as
         * a whole — `unstarted`, `connected` naming the agent that checked in — and they cannot answer it PER
         * PROJECT, which is where the confusion actually lives: fifteen projects, one of them dead, and a
         * cheerful "nothing needs you" over the top.
         *
         * Bounded by `distinct on`, and in the batch, so it costs no latency. What it feeds is a single
         * sentence on the empty card and nothing else — no count, no chip, no figure.
         */
        presenceRows(),
    ]);

    /*
     * The slug table. Built from the history rather than from `projects()`, so an index can never point at a
     * slug that is not there — and it is deduplicated, which is the whole saving: fifteen slugs written once
     * instead of a 14-character string repeated 2,199 times.
     */
    const slugs: string[] = [];
    const slugIndex = new Map<string, number>();
    const indexOf = (slug: string): number => {
        const seen = slugIndex.get(slug);
        if (seen !== undefined) return seen;
        slugIndex.set(slug, slugs.length);
        slugs.push(slug);
        return slugs.length - 1;
    };

    const history: History = {
        projects: slugs,
        tasks: historyTasks.map((r): FinishedTuple => [
            indexOf(String(r.project)), Number(r.minutes), Number(r.step_count),
            r.noted === true ? 1 : 0, Number(r.created_s), Number(r.done_s),
        ]),
        decisions: historyDecisions.map((r): DecisionTuple => [
            indexOf(String(r.project)), Number(r.created_s), Number(r.answered_s), Number(r.deadline_s),
        ]),
    };

    return {
        questions: questions.map(mapQuestion),
        tasks: tasks.map(mapTask),
        notes: notes.map(mapNote),
        agents: agents.map(a => ({
            name: String(a.name),
            last_sync_at: iso(a.last_sync_at),
            sync_count: Number(a.sync_count),
        })),
        doneTasks: done.map(mapFinishedRow),
        answeredQuestions: answered.map(mapQuestion),
        history,
        totals: {
            tasksDone: Number(totals[0]?.tasks_done ?? 0),
            decisionsMade: Number(totals[0]?.decisions_made ?? 0),
        },
        projects: projectList,
        approvals: heldCalls,
        presence,
    };
}
