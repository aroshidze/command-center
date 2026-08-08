import type { Question } from './types';

/**
 * THE REMINDER LADDER — what stops the best feature in this hub resolving a decision he never saw.
 *
 * ==================================================================================================
 * THE DEFECT THIS FIXES, STATED PLAINLY
 * ==================================================================================================
 *
 * A question with `default_option` + `hours` got exactly ONE notification, then silence, then the agent
 * proceeded with the default. That is a single point of failure in the one thing ~40 competing products do
 * not have: one missed Telegram message — a phone face-down, a commute, a meeting — and a decision resolves
 * itself without him ever knowing it was asked. The hub then tells the agent "he did not answer", which is
 * true and completely misleading.
 *
 * So: derive up to two reminder points between `created_at` and `deadline`, and STATE THE WHOLE LADDER IN
 * THE FIRST MESSAGE. The property this preserves is the one that makes the timed default worth having at
 * all — he is told, up front, exactly what happens if he does nothing. A nudge that arrives unannounced is
 * a nag; a nudge he was promised is the hub keeping its word.
 *
 * ==================================================================================================
 * WHY THE POINTS ARE FRACTIONS OF THE WINDOW AND NOT FIXED OFFSETS
 * ==================================================================================================
 *
 * "Nudge after 4 hours" is wrong at both ends: on a 90-minute deadline it never fires, and on a five-day
 * deadline it fires once on the first morning and then goes quiet for four days. The useful property of a
 * reminder is WHERE IT SITS IN THE WAIT, so the points are 50% and 85% of the window. Half-way is "this is
 * still open and you have as long again"; 85% is a last call with enough time left to actually answer.
 *
 * ==================================================================================================
 * WHY THE FLOOR IS A SINGLE RULE RATHER THAN A LADDER OF CASES
 * ==================================================================================================
 *
 * A 30-minute deadline should get no nudges — a second message fifteen minutes after the first is noise,
 * and the noise is what gets a channel muted (AGENTS.md: "a channel that fires nine times in a row gets
 * muted, which achieves the opposite"). The obvious implementation is a branch per window length. Instead
 * there is one rule applied to every candidate point: it must be at least `MIN_GAP_MINUTES` after the ask,
 * at least that long before the deadline, and that long after the previous point that survived. Points
 * that fail are dropped.
 *
 * That one rule produces the right answer at every scale without anybody choosing thresholds:
 *
 *   | window  | 50%          | 85%          | nudges |
 *   |---------|--------------|--------------|--------|
 *   | 30 min  | 15m in — no  | 4.5m left — no | 0    |
 *   | 1 hour  | 30m in — yes | 9m left — no   | 1    |
 *   | 12 hours| 6h in — yes  | 1.8h left — yes| 2    |
 *   | 5 days  | yes          | yes            | 2    |
 *
 * ==================================================================================================
 * NOTHING IS STORED, AND THAT IS NOT A CONVENIENCE
 * ==================================================================================================
 *
 * There is no `reminders_sent` column and there must never be one, for the same reason there is no `xp`
 * column: a counter can disagree with what actually happened. The number of reminders sent IS
 * `count(events where kind = 'question.reminded' and ref_id = <question>)` — the same table the whole hub
 * already reads, append-only, and impossible to get out of step with the messages it records. Combined
 * with the points below, which are a pure function of two timestamps the row already carries, the entire
 * feature has no state of its own.
 *
 * And no cron. The sweep runs on the same lazy-on-read path `applyDueDefaults()` uses — see
 * `applyDueReminders` in lib/store.ts.
 */

/** Where in the wait each nudge sits. Two, because a third inside one window is a nag. */
export const REMINDER_FRACTIONS = [0.5, 0.85] as const;

/**
 * The minimum distance a nudge must keep from the ask, from the deadline, and from the nudge before it.
 *
 * Twenty minutes rather than five: the failure this feature exists to fix is a message he did not see, and
 * a second message twenty minutes later is very likely to be in the same unlooked-at batch as the first. It
 * is also the number that makes the table above come out right — it is the reason a one-hour deadline gets
 * one nudge and a half-hour deadline gets none.
 */
export const MIN_GAP_MINUTES = 20;

const MIN_GAP_MS = MIN_GAP_MINUTES * 60_000;

/**
 * When this question's nudges are due, oldest first. Empty when the window is too short to hold one.
 *
 * Pure, and deliberately takes two ISO strings rather than a `Question`, so the whole ladder can be checked
 * against a table of windows in `tests/ladder.mjs` without constructing rows.
 */
export function reminderPoints(createdAt: string, deadline: string | null): string[] {
    if (!deadline) return [];
    const start = new Date(createdAt).getTime();
    const end = new Date(deadline).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

    const kept: number[] = [];
    for (const f of REMINDER_FRACTIONS) {
        const at = start + (end - start) * f;
        if (at - start < MIN_GAP_MS) continue;
        if (end - at < MIN_GAP_MS) continue;
        if (kept.length && at - kept[kept.length - 1]! < MIN_GAP_MS) continue;
        kept.push(at);
    }
    /* Rounded to the minute. An unrounded point produces "I'll nudge you in 5h 59m 43s" worth of precision
     * in a sentence that is read as an approximation, and it makes two runs of the same check disagree in
     * the last digit for no reason. */
    return kept.map(ms => new Date(Math.round(ms / 60_000) * 60_000).toISOString());
}

/** A duration a human reads at a glance. Same shape as the one already used for the deadline line. */
export function humanGap(ms: number): string {
    const mins = Math.round(ms / 60_000);
    if (mins <= 0) return 'now';
    if (mins < 60) return `${mins} min`;
    if (mins < 2880) return `${Math.round(mins / 60)}h`;
    return `${Math.round(mins / 1440)} days`;
}

/**
 * THE SENTENCE THAT MAKES THIS A LADDER RATHER THAN A SURPRISE.
 *
 * Stated as durations with the absolute times in brackets, which is the form lib/telegram.ts already argued
 * for and for the same reason: an absolute UTC timestamp asks him to know what time it is in UTC and
 * subtract, and a duration in a message read six hours later is stale while a timestamp never is. So both,
 * useful one first.
 *
 * Returns null when there is no ladder to state — no deadline, no default, or a window too short to hold a
 * nudge. A line saying "I will not nudge you" is a line about nothing.
 *
 * `from` is the instant the sentence is written from, so a nudge message can restate the REMAINING ladder
 * rather than the original one. Passing it in rather than reading the clock also makes this checkable.
 */
export function ladderSentence(q: Question, from: number = Date.now()): string | null {
    if (!q.deadline || !q.default_option) return null;
    const remaining = reminderPoints(q.created_at, q.deadline)
        .map(p => new Date(p).getTime())
        .filter(p => p > from);
    if (!remaining.length) return null;

    const when = (ms: number) => `${humanGap(ms - from)} (${clock(ms)})`;
    return remaining.length === 1
        ? `I'll nudge you once before then, in ${when(remaining[0]!)}.`
        : `I'll nudge you in ${when(remaining[0]!)} and again in ${when(remaining[1]!)}.`;
}

/**
 * HH:MM UTC, and the label is not optional.
 *
 * The brief's example sentence is *"I'll nudge you at 14:00 and proceed at 21:00"*, which reads beautifully
 * and is only true in one timezone. The hub has never been told his, and inventing one would put a wrong
 * time in the one message that exists to be trusted — so the hour is stated with the zone it is in, next to
 * a duration that needs no zone at all.
 */
function clock(ms: number): string {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} UTC`;
}

/**
 * Which nudge is being sent now, and is it the last one? Used to word the rewritten message.
 *
 * `sent` is the count of `question.reminded` events, which is the only place that number lives.
 */
export function nudgeStanding(
    q: Question, sent: number, now: number = Date.now(),
): { due: boolean; index: number; total: number; last: boolean } {
    const points = reminderPoints(q.created_at, q.deadline);
    const due = sent < points.length && new Date(points[sent]!).getTime() <= now;
    return { due, index: sent + 1, total: points.length, last: sent + 1 >= points.length };
}
