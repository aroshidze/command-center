import { humanDate, humanSpan } from './format';

/**
 * WHETHER ANYTHING IS ACTUALLY LOOKING AT A PROJECT — the fold, kept out of the query.
 *
 * ==================================================================================================
 * THE WEAKNESS THIS CLOSES, IN ONE SENTENCE
 * ==================================================================================================
 *
 * An empty queue and a dead agent looked identical. *"Nothing needs you"* is the state the whole hub
 * exists to reach — hard constraint 6 calls it success and it is — and it rendered pixel-for-pixel the
 * same as *"nothing has run against this project since July"*, which is the hub quietly going out of
 * date. `docs/BRIEF-NOTHING-BLOCKED.md` §3.1 calls that the sharpest criticism of this product, and it
 * was true.
 *
 * ==================================================================================================
 * THE GRAMMATICAL RULE, AND IT IS NOT A STYLE PREFERENCE
 * ==================================================================================================
 *
 * **If the sentence needs the word "you", rewrite it.** *"Nothing has looked at harbour-lights since
 * 28 Jul"*, never *"you haven't touched harbour-lights in nine days"*.
 *
 * It comes from the same reasoning that banned streaks (`docs/RESEARCH.md` §18). A sentence about a quiet
 * project is a statement about the AGENTS; addressed to him in the second person it becomes an accusation
 * about his own attention, and he did not fail to do anything — an agent stopped running. Getting this
 * wrong would turn the one honest diagnostic on the page into a nag, which is how the channel that
 * matters gets ignored. `sentenceFor` is the only thing that produces these strings, so a check can
 * assert the property over every state at once rather than over whichever one the fixture happens to
 * produce.
 *
 * ==================================================================================================
 * WHAT IS DELIBERATELY NOT HERE
 * ==================================================================================================
 *
 * No free-text field an agent fills in about what it is doing. `branch` and `model` are facts the hook
 * reads off the machine; there is no "status" an agent gets to author, because §4 of the brief refuses
 * exactly that — *"an agent asked to self-report health reports green, and a single green-while-you-slept
 * status poisons every other indicator on the page."*
 *
 * And nothing here is stored. Every state below is recomputed from the rows on every render, which is why
 * a project going quiet needs no job to notice it.
 *
 * ==================================================================================================
 * THIS MODULE IS NOT LOADABLE BY A `tests/*.mjs` CHECK, AND THAT IS THE DELIBERATE TRADE
 * ==================================================================================================
 *
 * It imports `humanDate` and `humanSpan` as VALUES, which breaks Node's type-stripping (AGENTS.md trap
 * 2) — `lib/progress.ts` gets away with being imported by `prove:layout` only because its own imports are
 * type-only. So `sentenceFor` cannot be unit-tested the cheap way, and the two candidate fixes were both
 * worse: a second copy of the date formatter here is the exact mistake `lib/colour.ts` exists to undo, and
 * `allowImportingTsExtensions` in tsconfig is a project-wide change to buy one import.
 *
 * The properties are asserted by RENDERING instead — check A3 in `tests/measure-layout.mjs` plants a row in
 * each of the four states and reads the sentences off the page. That is strictly stronger than a unit test
 * would have been: a unit test on this function would pass while the page ignored it and hard-coded its own
 * wording, which is the shape of half the defects in this project's history.
 */

/**
 * An observation newer than this means something is working. Forty-five minutes.
 *
 * WHY IT IS NOT FIVE, and the reason CHANGED once reports shipped — which is worth recording, because the
 * number did not.
 *
 * It used to be that a heartbeat arrived at SessionStart and SessionEnd and at no point in between, so the
 * only mid-session evidence was `cc sync`, at events rather than on a timer. That was the argument for
 * forty-five minutes. The `Stop` hook now reports every turn (`lib/reports.ts`), so on an opted-in project
 * the evidence is far denser and a much shorter window would work.
 *
 * FORTY-FIVE STAYS, for two reasons that outlive the change. A project where nobody ran `cc presence on`
 * still only has syncs — a shorter window would report those as gone. And a single turn can legitimately
 * run for twenty minutes: a build, a test suite, one long tool call. The window has to be survivable by
 * the quietest legitimate agent, not by the noisiest.
 *
 * WHY IT IS NOT FOUR HOURS. The window's whole job is to make "working now" mean something. A claim that
 * holds for half a day is not a claim about now.
 *
 * AND IT MUST STAY SMALLER THAN `RUN_GAP_MINUTES`. Cutting a run at a gap sets its `ended_at`, and a
 * closed run inside this window reads as "it ran and stopped" — so a run gap shorter than this would
 * report a working agent as finished. The relationship is the constraint; see lib/reports.ts.
 *
 * The error this window makes is deliberately one-directional: too long a gap reads as "last heard from"
 * rather than as "working", so the failure is understating activity. Overstating it — telling him an agent
 * is on the case when it died an hour ago — is the one answer this surface must never give.
 */
export const LIVE_MINUTES = 45;

/**
 * How long an un-ended session is still believed to be running. Twelve hours.
 *
 * A `SessionEnd` hook is best-effort by nature: closing the terminal, a crash, or a machine going to sleep
 * all end a session without one, and the row is then open forever. So an open row is evidence, not proof,
 * and it stops being believed at a point where believing it would be silly. Twelve hours is generous
 * enough to cover a genuinely long unattended run and short enough that a laptop closed on Friday is not
 * reported as working on Monday.
 */
export const OPEN_SESSION_HOURS = 12;

/** One row of `presence`, as the database holds it. */
export interface PresenceRow {
    project: string;
    agent: string;
    session: string;
    kind: 'session' | 'sync';
    started_at: string;
    last_seen_at: string;
    ended_at: string | null;
    end_reason: string | null;
    branch: string | null;
    model: string | null;
}

/**
 * FIVE STATES, and the fifth one is a bug fix rather than a refinement.
 *
 *   `working`  an OPEN session, or a sync, inside the live window. Present tense is legitimate.
 *   `open`     a session opened and never closed, recently enough to still believe. Probably running, and
 *              the sentence says "probably" by saying what it actually knows instead.
 *   `idle`     heard from inside the live window, and what was heard was a session ENDING. It ran and
 *              stopped. Nothing is working.
 *   `quiet`    heard from at some point, and not since. This is the state the brief is about.
 *   `never`    no observation at all. Either nothing is opted in, or nothing has ever run here.
 *
 * ==================================================================================================
 * WHY `idle` EXISTS, AND IT IS THE FIRST THING LOOKING AT THE PAGE FOUND
 * ==================================================================================================
 *
 * The first version had four states and decided `working` on one test: *is the newest observation inside the
 * live window?* Rendered, that put **"probe-agent is working on harbour-lights now, 6 min in"** under a
 * session whose `ended_at` was set six minutes earlier. The agent had run and finished; the page said it was
 * still going.
 *
 * That is the exact class of untruth this whole surface exists to remove, produced by the surface built to
 * remove it. It is also the one direction that is unforgivable here: understating activity costs him a glance
 * at a project that turns out to be fine, and OVERSTATING it tells him an agent is on the case when nothing
 * is running — which is indistinguishable, from his side, from the defect that started this brief.
 *
 * So `working` now requires evidence of something that has not stopped: an open session, or a sync (which is
 * a call an agent made, so it was running at that instant). A closed session is `idle`, and the sentence says
 * it finished.
 */
export type PresenceState = 'working' | 'open' | 'idle' | 'quiet' | 'never';

export interface ProjectPresence {
    project: string;
    state: PresenceState;
    /** The newest observation of any kind, or null when there is none. */
    lastSeenAt: string | null;
    /** Which agent produced that newest observation. */
    agent: string | null;
    branch: string | null;
    model: string | null;
    /** When the open or live session started, for the states where that is the useful number. */
    since: string | null;
    /** Minutes since `lastSeenAt`. Null when there is no observation. */
    minutesSince: number | null;
    /**
     * Has a HOOK ever reported here, as opposed to only `cc sync`?
     *
     * The page needs this to tell two similar-looking things apart: a project whose agents sync but have
     * no heartbeat installed (so "working now" can only ever be inferred from syncs) and one that is fully
     * wired. Without it the page would either overclaim its own coverage or say nothing about it.
     */
    hooked: boolean;
}

/** One agent, across every project it has been seen in. */
export interface AgentPresence {
    agent: string;
    lastSeenAt: string | null;
    minutesSince: number | null;
    /** The project of its newest observation. */
    project: string | null;
    branch: string | null;
    model: string | null;
    state: PresenceState;
    /** How many projects this agent has ever been observed in. */
    projects: number;
}

const minutesBetween = (fromIso: string, now: number): number =>
    Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60_000));

/** The newest instant a row is evidence of: it ended, or it was last seen. */
const seenAt = (r: PresenceRow): string =>
    (r.ended_at && r.ended_at > r.last_seen_at ? r.ended_at : r.last_seen_at);

function stateOf(rows: PresenceRow[], now: number): {
    state: PresenceState; newest: PresenceRow | null; since: string | null;
} {
    if (!rows.length) return { state: 'never', newest: null, since: null };

    const newest = rows.reduce((a, b) => (seenAt(b) > seenAt(a) ? b : a));
    const live = (r: PresenceRow) => minutesBetween(seenAt(r), now) < LIVE_MINUTES;

    /*
     * WORKING NEEDS EVIDENCE OF SOMETHING THAT HAS NOT STOPPED — see the note on `PresenceState`.
     *
     * An open session inside the window, or a sync inside it. A sync counts because it is a call an agent
     * made: at that instant a process existed and was talking to the hub. A CLOSED session does not count,
     * however recent, because the thing it is evidence of is over.
     */
    const openLive = rows
        .filter(r => r.kind === 'session' && r.ended_at == null && live(r))
        /* Oldest first, so the duration reported is of the session that has been going longest rather than
         * of whichever one happened to beat last. */
        .sort((a, b) => a.started_at.localeCompare(b.started_at))[0];
    if (openLive) return { state: 'working', newest: openLive, since: openLive.started_at };

    const syncLive = rows.filter(r => r.kind === 'sync' && live(r))
        .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))[0];
    /*
     * `since: null` on a sync, deliberately. A sync row's `started_at` is when the hub first ever saw this
     * agent in this project, which could be months back — reporting it as a session duration would produce
     * "is working on riff-kitchen now, 94 days in". The row simply does not carry how long the current run
     * has been going, so the sentence omits the clause rather than filling it with a number that is available
     * and wrong.
     */
    if (syncLive) return { state: 'working', newest: syncLive, since: null };

    /*
     * An un-ended session, past the live window but still inside the believable one. `started_at` DESC so the
     * sentence names the most recent — an orphan row from a terminal somebody closed last night must not be
     * the one reported when a newer session is also open.
     */
    const open = rows
        .filter(r => r.kind === 'session' && r.ended_at == null
            && minutesBetween(r.started_at, now) < OPEN_SESSION_HOURS * 60)
        .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    if (open) return { state: 'open', newest: open, since: open.started_at };

    /* Heard from just now, and what was heard was a session ending. */
    if (live(newest)) return { state: 'idle', newest, since: newest.started_at };

    return { state: 'quiet', newest, since: null };
}

/**
 * Every project the hub knows about, with its presence — INCLUDING the ones with no rows at all.
 *
 * `projects` is handed in rather than derived from `rows`, and that is the load-bearing half. A project
 * with no presence rows is precisely the case worth showing: it is either a project nothing has ever run
 * against or one where nothing is opted in, and folding only over the rows that exist would make it
 * invisible. The absence IS the finding.
 */
export function foldProjects(
    projects: string[], rows: PresenceRow[], now: number = Date.now(),
): ProjectPresence[] {
    const byProject = new Map<string, PresenceRow[]>();
    for (const r of rows) {
        const list = byProject.get(r.project);
        if (list) list.push(r); else byProject.set(r.project, [r]);
    }
    /* Every slug from either side. A presence row can name a project with no tasks yet — an agent opened a
     * session before it filed anything — and dropping it would hide a live agent. */
    const slugs = [...new Set([...projects, ...byProject.keys()])];

    const out = slugs.map((project): ProjectPresence => {
        const mine = byProject.get(project) ?? [];
        const { state, newest, since } = stateOf(mine, now);
        return {
            project,
            state,
            lastSeenAt: newest ? seenAt(newest) : null,
            agent: newest?.agent ?? null,
            branch: newest?.branch ?? null,
            model: newest?.model ?? null,
            since,
            minutesSince: newest ? minutesBetween(seenAt(newest), now) : null,
            hooked: mine.some(r => r.kind === 'session'),
        };
    });

    /*
     * ==================================================================================================
     * THE QUIET ONES FIRST — and the first version had this exactly backwards.
     * ==================================================================================================
     *
     * It shipped as working, open, idle, quiet, never, on the reasoning that *"an agent on the case is the
     * answer to is anything happening"*. Rendered at two years of volume across fifteen projects, that put the
     * three quiet ones at positions thirteen to fifteen — **below the fold at 1280, under twelve projects that
     * were all fine.**
     *
     * Which inverts the entire purpose of the page. *"Nothing has looked at harbour-lights since 28 July"* is
     * the sentence this whole feature exists to make possible, and it was the hardest line on the page to
     * reach. Reassurance does not need to be found; a finding does.
     *
     * So the order is by how much ATTENTION the state deserves, not by how alive it is: quiet, then working,
     * then the two states that mean "fine, nothing to do" — and `never` last, because it usually means nothing
     * is opted in rather than that anything died, and the setup card underneath is its answer.
     *
     * Within `quiet`, OLDEST first: a project nothing has touched since July is more informative than one that
     * went quiet this morning, and freshest-first would bury the worst case at the bottom of its own group.
     */
    const rank: Record<PresenceState, number> = { quiet: 0, working: 1, open: 2, idle: 3, never: 4 };
    return out.sort((a, b) =>
        rank[a.state] - rank[b.state]
        || (a.state === 'quiet'
            ? (b.minutesSince ?? 0) - (a.minutesSince ?? 0)
            : (a.minutesSince ?? 0) - (b.minutesSince ?? 0))
        || a.project.localeCompare(b.project));
}

/** Every agent that has ever been observed, newest first. */
export function foldAgents(rows: PresenceRow[], now: number = Date.now()): AgentPresence[] {
    const byAgent = new Map<string, PresenceRow[]>();
    for (const r of rows) {
        const list = byAgent.get(r.agent);
        if (list) list.push(r); else byAgent.set(r.agent, [r]);
    }
    return [...byAgent.entries()]
        .map(([agent, mine]): AgentPresence => {
            const { state, newest } = stateOf(mine, now);
            return {
                agent,
                lastSeenAt: newest ? seenAt(newest) : null,
                minutesSince: newest ? minutesBetween(seenAt(newest), now) : null,
                project: newest?.project ?? null,
                branch: newest?.branch ?? null,
                model: newest?.model ?? null,
                state,
                projects: new Set(mine.map(r => r.project)).size,
            };
        })
        .sort((a, b) => (a.minutesSince ?? 1e9) - (b.minutesSince ?? 1e9)
            || a.agent.localeCompare(b.agent));
}

/**
 * THE HONEST LINE, and the only place these strings are made.
 *
 * One sentence per state, none of which contains the word "you" — see the header. It is a single function
 * rather than four template literals at the call site so that the rule is enforceable: check A2 in
 * `tests/measure-layout.mjs` renders every state and asserts the property over all four, which is not
 * something the fixture's own data would ever exercise.
 *
 * `now` is injectable for the same reason `humanDate` takes it: a sentence about elapsed time cannot be
 * asserted against a clock the check does not control.
 */
export function sentenceFor(p: ProjectPresence, now: number = Date.now()): string {
    switch (p.state) {
        case 'working':
            /*
             * A SESSION AND A SYNC ARE NOT THE SAME CLAIM, AND THIS SAID "IS WORKING" FOR BOTH.
             *
             * `since` is null when the only evidence is a sync — an agent asking the hub what changed, which
             * takes a second and proves nothing about whether anything is running now. The previous version
             * omitted the duration clause in that case, correctly, and kept the verb, which was the whole
             * problem: it dropped the detail it could not support and asserted the claim it could not support.
             *
             * The owner found it in seconds. Three syncs run by hand made the page report "claude-code is
             * working on video-presentations now" for a project where nothing was running, and he said so:
             * "the presentations one is idle so wtf?". A hub that states something false about its own subject
             * is worse than one that says nothing, and this is the surface whose entire job is to tell him
             * whether the silence elsewhere can be trusted.
             *
             * So the verb follows the evidence. An open session with a start time is working. A sync is a sync.
             */
            return p.since
                ? `${p.agent} is working on ${p.project} now, ${humanSpan(minutesBetween(p.since, now))} in`
                : `${p.agent} checked in on ${p.project} `
                  + `${humanSpan(minutesBetween(p.lastSeenAt!, now))} ago`;

        case 'idle':
            /*
             * IT FINISHED. Past tense, and the whole reason this state exists: the row is a session that
             * ended, and the first version of this file reported it as an agent still working.
             */
            return `${p.agent} finished on ${p.project} `
                + `${humanSpan(minutesBetween(p.lastSeenAt!, now))} ago`;

        case 'open':
            /*
             * SAYS WHAT IT KNOWS RATHER THAN WHAT IT GUESSES. The row is an opened session with no close,
             * which is evidence of a run in progress and also of a terminal somebody shut. "Still running"
             * would be a guess; "opened a session and has not signed off" is the row.
             */
            return `${p.agent} opened a session on ${p.project} `
                + `${humanSpan(minutesBetween(p.since!, now))} ago and has not signed off`;

        case 'quiet':
            /* The brief's own sentence. Subject is "nothing", which is what makes it a fact about the
             * agents rather than about him. */
            return `Nothing has looked at ${p.project} since ${humanDate(p.lastSeenAt!, new Date(now))}`;

        case 'never':
            /*
             * TWO DIFFERENT FACTS WEAR THIS STATE and only one of them is worth an instruction. A project
             * with no presence row at all in a hub where nothing is opted in is not a dead project — it is
             * an unwired one — and telling him a project is silent when the truth is that no heartbeat is
             * installed would be the surface blaming the world for its own gap.
             */
            return `Nothing has ever reported in from ${p.project}`;
    }
}

/**
 * The one-line summary across every project, or null when there is nothing worth a summary.
 *
 * Null rather than "0 projects are quiet", because a line that is always present is a line nobody reads —
 * the same rule the stale-sync banner and `unseenWork` already follow.
 */
export function summaryLine(list: ProjectPresence[]): string | null {
    /*
     * "BEING WORKED ON" MEANS A SESSION, NOT A SYNC — the same distinction `sentenceFor` gets wrong above if
     * you let it. A row in the `working` state with no `since` is an agent that asked the hub what changed,
     * which is evidence of contact and not of work. Counting those as "being worked on" made this line read
     * "3 being worked on now" while nothing at all was running.
     *
     * Split rather than merged, because both facts are worth having and neither is the other: what is running,
     * and what has been in touch. A single number covering both is the kind of summary that is never wrong
     * enough to notice and never right enough to trust.
     */
    const running = list.filter(p => p.state === 'working' && p.since).length;
    const inTouch = list.filter(p => p.state === 'working' && !p.since).length;
    const quiet = list.filter(p => p.state === 'quiet').length;
    if (!running && !inTouch && !quiet) return null;
    const bits: string[] = [];
    if (running) bits.push(`${running} being worked on now`);
    if (inTouch) bits.push(`${inTouch} checked in recently`);
    if (quiet) bits.push(`${quiet} with nothing looking at ${quiet === 1 ? 'it' : 'them'}`);
    return bits.join(' · ');
}
