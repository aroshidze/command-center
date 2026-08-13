import type { Question, Task } from './types';

/**
 * WHAT WAS SAID, AND WHEN — the folds behind the project page.
 *
 * ==================================================================================================
 * THE RULE THIS OBEYS, WHICH IS THE ONE THAT MADE IT POSSIBLE
 * ==================================================================================================
 *
 * `lib/presence.ts` refuses, and still refuses, any field an agent fills in about its own state:
 * *"an agent asked to self-report health reports green, and a single green-while-you-slept status
 * poisons every other indicator on the page."* That refusal is why this hub had nothing to show when
 * its owner asked, five times, to see what his agents were doing.
 *
 * The way out was in AGENTS.md all along: **a maintained document is banned, a timestamped report is the
 * product.** The test is *can it name who said it and when?* So nothing here is a status. Every row is a
 * quote with an author and a time:
 *
 *   said     the assistant's own last words for a turn, handed over by the harness in the `Stop` hook's
 *            `last_assistant_message`. Not a summary of how it is going — the actual text.
 *   told     what he typed, from `UserPromptSubmit`.
 *   waiting  the HARNESS reporting that the agent is waiting for a human, via `Notification` with a
 *            type of `agent_needs_input`, `idle_prompt` or `permission_prompt`.
 *
 * `waiting` is the one that would be inadmissible if an agent declared it about itself. It is admissible
 * because the harness declares it about the agent — the same reason `branch` and `model` are allowed
 * through `heartbeat` while `progress` is not: something other than the agent's own judgement produced
 * the value.
 *
 * ==================================================================================================
 * WHY IT IS THE NEWEST ROW THAT DECIDES, AND NOT A COLUMN
 * ==================================================================================================
 *
 * "Is this agent waiting for me?" is answered by looking at the newest report for the session: if it is
 * `waiting`, it is waiting; if he has since typed something, the newest row is `told` and it is not.
 * Nothing is ever updated, nothing has to be cleared, and there is no state that can be left stale by a
 * hook that failed to fire — the same derived-only discipline the whole progress system rests on.
 *
 * ==================================================================================================
 * IMPORTS NOTHING BUT TYPES, DELIBERATELY
 * ==================================================================================================
 *
 * AGENTS.md trap 2: a value import between two `lib/*.ts` files breaks Node's type-stripping and the
 * proof suites cannot load the module at all. `lib/presence.ts` is already unreachable that way, for one
 * date formatter, and its own header calls that the deliberate trade. This module is the one the checks
 * most need to reach, so it pays the cost of formatting nothing itself. Secret detection is INJECTED for
 * the same reason — see `redactSecrets`.
 */

/**
 * How much of a message is kept. Two thousand characters.
 *
 * IT WAS 400, AND THAT WAS TOO MEAN BY A FACTOR OF FIVE. Four hundred is about four lines, which is under
 * half of a normal turn's closing paragraph — so his own project page showed *"…verified free of em-dashes
 * and en-dashes) **Artifact:** … | Instant Casi…"* and there was nothing to expand to, because the rest had
 * never been stored. A cap that cuts the middle out of the thing the page exists to show is not a cap, it is
 * data loss with an ellipsis on it.
 *
 * WHY NOT UNBOUNDED. One `said` row per turn is the fastest-growing table in the hub, and an assistant turn
 * can end with a thousand-line file dump. Two thousand characters is a couple of screenfuls — comfortably
 * more than any closing summary and still a bound. The page shows the first few lines with a control to open
 * the rest, so length costs nothing to read past.
 *
 * ROWS STORED UNDER THE OLD CAP STAY SHORT. There is nothing to recover; the text was never sent.
 */
export const REPORT_BODY_MAX = 2000;

/**
 * STRIP WHAT THE IDE INJECTED, BEFORE ANYTHING ELSE TOUCHES THE TEXT.
 *
 * ==================================================================================================
 * THE DEFECT THIS EXISTS FOR, IN HIS WORDS
 * ==================================================================================================
 *
 * *"the messages I send, look at them. It's just opening a file? What kind of message is that? I never sent
 * it."* He is right: he never sent it. Three rows on his project page, all attributed to HIM, all beginning
 *
 *     <ide_opened_file>The user opened the file d:\…\ORCHESTRATOR.md in the IDE. This may or may not be
 *     related to the current task.</ide_opened_file>
 *
 * The `UserPromptSubmit` hook's `prompt` field is not what the human typed. It is what the harness is about
 * to send the model, and an IDE integration prepends context blocks to it. So the hub was storing an
 * editor's bookkeeping under a human's name, which is the worst kind of thing this hub can get wrong: every
 * other row on that page is trustworthy because it can name who said it, and this one named the wrong
 * person.
 *
 * It also caused the truncation. The wrapper is ~150 characters, so the real message started a third of the
 * way into a 400-character budget and got cut.
 *
 * ==================================================================================================
 * WHAT IS STRIPPED, AND WHY IT IS A SHAPE RATHER THAN A LIST
 * ==================================================================================================
 *
 * Any `<ide_*>…</ide_*>` block, and `<system-reminder>…</system-reminder>`. Matched on the SHAPE because the
 * set is not ours and will grow: `ide_opened_file` and `ide_selection` are the two seen, and a list of two
 * would silently start storing the third. Anything the harness wraps in a tag of that shape is context it
 * added, not prose a person wrote.
 *
 * RETURNS EMPTY WHEN THERE IS NOTHING LEFT, and the caller stores no row at all. A turn whose entire prompt
 * was an IDE notification is not a message; a row for it would be a line on his page that he did not write
 * and cannot act on.
 */
export function stripInjectedContext(body: string): string {
    return body
        .replace(/<ide_[a-z_]*>[\s\S]*?<\/ide_[a-z_]*>/gi, ' ')
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
        /*
         * AND THE HARNESS'S OWN SLASH-COMMAND BOOKKEEPING. Measured in a real transcript: the newest thing
         * that looked like a human message in a days-long session was
         * `<local-command-stdout>Compacted </local-command-stdout>` — the output of `/compact`. Typing a slash
         * command is a thing he did, but the wrapper around its plumbing is not something he SAID, and a
         * thread whose newest entry is "Compacted" is a thread reporting on itself.
         */
        .replace(/<local-command-[a-z]*>[\s\S]*?<\/local-command-[a-z]*>/gi, ' ')
        .replace(/<command-(?:name|message|args)>[\s\S]*?<\/command-(?:name|message|args)>/gi, ' ')
        /* An unclosed opener, which is what a truncated injection looks like. Dropped to the end rather than
         * left as a dangling tag name in the middle of his sentence. */
        .replace(/<(?:ide_[a-z_]*|system-reminder|local-command-[a-z]*|command-(?:name|message|args))>[\s\S]*$/i,
            ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

/**
 * THE GAP THAT ENDS A RUN. Sixty minutes, and the number is not a preference.
 *
 * A conversation is not a run — his finding, and the one that invalidated the first version of this
 * model: *"The session may never end… One open AI iteration can be live for several days."* So activity
 * is recorded and runs are cut out of it wherever it went quiet for longer than this.
 *
 * IT MUST BE LARGER THAN `LIVE_MINUTES`, and that is the whole constraint. Cutting a run sets its
 * `ended_at`, and a closed run inside the live window reads as *"it ran and stopped"* — so a gap short
 * enough to fall inside that window would report a working agent as finished. Forty-five plus a margin,
 * rounded to the hour. `tests/prove-hooks.mjs` asserts the relationship rather than the number, because
 * the relationship is the thing that must not be broken by someone tuning either value.
 *
 * `cc backfill` cuts transcripts at THIRTY minutes and is deliberately left alone: those rows exist, they
 * are named `<session>:<index>`, and re-cutting history at a different gap would renumber the stretches
 * and draw every night twice. History was measured with the ruler it was measured with.
 */
export const RUN_GAP_MINUTES = 60;

export type ReportKind = 'said' | 'told' | 'waiting';

export interface Report {
    id: string;
    project: string;
    agent: string;
    /** The CONVERSATION's id, as the harness reports it — never a run id. */
    session: string;
    kind: ReportKind;
    body: string | null;
    at: string;
}

/**
 * REDACT, DO NOT REFUSE — and the difference matters enough to be the one exception in the codebase.
 *
 * Everywhere else a credential-shaped value is REJECTED: `upsertTask` throws, and it is right to, because
 * an agent putting a token in a task description can be told to write down where the token lives instead.
 * Nobody can rewrite `last_assistant_message`. It is a record of something that was already said, and the
 * two available behaviours are to keep it with the token-shaped word removed, or to throw away the whole
 * report and with it the only account of what the agent was doing.
 *
 * So: word by word. Anything that looks like key material becomes `(redacted)`. If the result still trips
 * the detector — a secret with a space in it, a private key block — the body is dropped entirely and
 * replaced by a sentence saying so, because a withheld report that admits it was withheld is honest and a
 * silently empty one is not.
 *
 * The detector is passed in rather than imported: `findSecret` lives in `lib/store.ts`, and importing a
 * value from it would make this module unloadable by the checks (trap 2). The call site supplies it.
 */
export function redactSecrets(
    body: string, findSecret: (value: string) => string | null,
): { text: string; redacted: boolean } {
    let redacted = false;
    const cleaned = body
        .split(/(\s+)/)
        .map(word => {
            if (!word.trim()) return word;
            /* Punctuation around a token must not hide it: `token=sk-abc123` is one word to `split`,
             * and stripping the leading `token=` is what lets the detector see the value. */
            const bare = word.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9_-]+$/, '');
            if (bare.length >= 12 && findSecret(bare)) {
                redacted = true;
                return '(redacted)';
            }
            return word;
        })
        .join('');
    if (findSecret(cleaned)) {
        return {
            text: '(a report was withheld: it looked like it contained a secret, and the hub stores none)',
            redacted: true,
        };
    }
    return { text: cleaned, redacted };
}

/**
 * ONE LINE OF IT, for the places that have room for a line.
 *
 * An assistant's last words are prose — several sentences, sometimes a list, sometimes a code fence. The
 * project page shows the whole thing; a project CARD has room for about a line, and the honest way to
 * shorten prose is to take the beginning of it and say so with an ellipsis, never to summarise it into
 * something nobody said.
 *
 * Markdown emphasis and heading marks are stripped because they are formatting for a renderer that is not
 * here, and a line reading `## Done` with the hashes visible is noise rather than fidelity.
 */
export function firstLine(body: string | null, max = 120): string {
    if (!body) return '';
    const line = body
        .split('\n')
        .map(l => l.replace(/^\s*[#>*\-•]+\s*/, '').replace(/\*\*/g, '').trim())
        .find(l => l.length > 0) ?? '';
    return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/**
 * THE NEWEST REPORT PER CONVERSATION. The rows arrive newest-first, so the first one wins.
 *
 * Asserting the order rather than sorting: the query is `order by at desc` and re-sorting here would
 * hide a query that stopped doing that. If this ever needs a sort, the query is what is broken.
 */
export function newestPerSession(reports: Report[]): Map<string, Report> {
    const newest = new Map<string, Report>();
    for (const r of reports) {
        const key = `${r.project}\0${r.session}`;
        if (!newest.has(key)) newest.set(key, r);
    }
    return newest;
}

export interface WaitingRun {
    project: string;
    agent: string;
    session: string;
    /** What the harness said it was waiting for. */
    body: string | null;
    since: string;
}

/**
 * WHO IS WAITING FOR HIM — the single most valuable thing on the page, and the reason it can be built.
 *
 * Anthropic's own Agent View leads with this column, and it is the right thing to lead with: of everything
 * a command centre can tell you, "this one cannot continue without you" is the only line that is about
 * your next thirty seconds.
 *
 * A run is waiting when its newest report says so and nothing has been said since. There is no expiry
 * here on purpose: an agent that asked a question at midnight is still waiting at nine, and quietly
 * dropping it after an hour would lose exactly the thing he opens the hub to find. Whether the SESSION is
 * still alive is a different question, answered by presence beside it.
 */
export function waitingRuns(reports: Report[]): WaitingRun[] {
    const out: WaitingRun[] = [];
    for (const r of newestPerSession(reports).values()) {
        if (r.kind !== 'waiting') continue;
        out.push({
            project: r.project, agent: r.agent, session: r.session, body: r.body, since: r.at,
        });
    }
    return out.sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0));
}

export type ThreadKind = 'said' | 'told' | 'waiting' | 'asked' | 'answered' | 'finished' | 'note';

export interface ThreadItem {
    at: string;
    kind: ThreadKind;
    /** An agent's name, or null when it was him. The renderer decides how to say "you". */
    agent: string | null;
    body: string;
    /** The id of the question or task this refers to, for a link. */
    ref: string | null;
    /** One quiet extra fact — the option he chose, the minutes a task took. */
    meta: string | null;
}

/**
 * ONE CHRONOLOGICAL THREAD PER PROJECT — his notes, the agent's words, the questions, the answers, the
 * work that finished.
 *
 * ==================================================================================================
 * WHY THIS IS NOT A NEW MECHANISM, WHICH IS THE WHOLE ARGUMENT FOR BUILDING IT
 * ==================================================================================================
 *
 * He asked to *"take part in what's going on right now by chatting with your AI agents right from the
 * hub"*. Every piece of that conversation already existed and was scattered across two pages: notes go
 * from him to agents and are collected on the next sync, questions come back with options and a timed
 * default, answers return. What was missing was not a channel. It was one place that shows the exchange
 * in the order it happened.
 *
 * So this composes rows that are already written by paths that already work. There is no socket, no
 * queue, no second app, and nothing new to keep alive — which is what makes it safe to add to a hub whose
 * whole value is that it does not lie.
 *
 * ==================================================================================================
 * WHAT IS DELIBERATELY NOT IN IT
 * ==================================================================================================
 *
 * OPEN questions and open tasks are absent. They are not history, they are the thing he has to act on,
 * and they belong above this in a section whose items have buttons. A thread that mixed "you were asked
 * this and it is still waiting" into a scroll of past events would bury the one item that needs him —
 * which is the failure `docs/BRIEF-NOTHING-BLOCKED.md` §2 exists to prevent.
 */
export function buildThread(input: {
    reports: Report[];
    questions: Question[];
    tasks: Task[];
    notes: { id: string; body: string; created_at: string }[];
    limit?: number;
    /**
     * Report ids the page has ALREADY shown above the thread, and this is a correctness argument rather
     * than a tidiness one.
     *
     * The project page leads with the newest thing each agent said, and the newest thing each agent said is
     * also the first item in a chronological thread — so the first render of that page stated the same
     * three sentences twice, four hundred pixels apart. This codebase treats "the same fact stated twice"
     * as a defect, and it is: the second copy makes a reader check whether it is really the same one.
     *
     * Excluded here rather than deduplicated in the component, because the CAP has to be applied after the
     * exclusion. Filtering a 40-item list down to 37 afterwards silently shortens the thread by whatever
     * the header happened to be showing.
     */
    exclude?: Set<string>;
}): ThreadItem[] {
    const items: ThreadItem[] = [];

    for (const r of input.reports) {
        if (!r.body) continue;
        if (input.exclude?.has(r.id)) continue;
        items.push({
            at: r.at,
            kind: r.kind,
            agent: r.kind === 'told' ? null : r.agent,
            body: r.body,
            ref: null,
            meta: null,
        });
    }

    for (const q of input.questions) {
        /* ASKED is dated by `created_at` and ANSWERED by `answered_at`, so one question can put two items
         * in the thread hours apart — which is what actually happened and is the point of a thread. */
        items.push({
            at: q.created_at,
            kind: 'asked',
            agent: q.asked_by ?? null,
            body: q.title,
            ref: q.id,
            meta: null,
        });
        if (q.answered_at) {
            const chosen = q.answer_option
                ? (q.options.find(o => o.key === q.answer_option)?.label ?? q.answer_option)
                : null;
            items.push({
                at: q.answered_at,
                kind: 'answered',
                agent: null,
                body: q.answer_text || chosen || 'answered',
                ref: q.id,
                meta: q.status === 'defaulted' ? 'the timer ran out, so the default was taken' : null,
            });
        }
    }

    for (const t of input.tasks) {
        if (!t.done_at) continue;
        items.push({
            at: t.done_at,
            kind: 'finished',
            agent: null,
            body: t.title,
            ref: t.id,
            meta: null,
        });
    }

    for (const n of input.notes) {
        items.push({ at: n.created_at, kind: 'note', agent: null, body: n.body, ref: n.id, meta: null });
    }

    /* NEWEST FIRST. A thread read top-down should open on what just happened — he is checking in, not
     * catching up from the beginning of time — and the cap then keeps the newest rather than the oldest,
     * which is the bug the other order would have. */
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return input.limit == null ? items : items.slice(0, input.limit);
}

/*
 * WHAT IS DELIBERATELY NOT EXPORTED FROM HERE.
 *
 * A `waitingCount(reports)` and a `latestWordPerProject(reports)` were both written and both removed before
 * anything imported them. `waitingRuns(...).length` is the count, and the project page needs the newest report
 * per CONVERSATION rather than per project — two agents in one project are two things to know about. A helper
 * that exists for a caller that does not is a second definition waiting to disagree with the first.
 */
