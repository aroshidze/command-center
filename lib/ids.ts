import { randomBytes } from 'node:crypto';

/**
 * Short ids, for one reason: a question id has to fit inside a Telegram `callback_data` string, which
 * the Bot API caps at 64 bytes. A UUID plus a prefix plus an option key does not leave comfortable
 * room, so ids are 8 characters of base36 instead.
 *
 * Collision maths, since "short id" deserves an argument rather than a shrug: 36^8 is about 2.8e12.
 * At the scale this hub will ever see — thousands of rows, ever — the chance of a collision is
 * negligible, and the primary key would reject it loudly rather than corrupt anything if it happened.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function short(len = 8): string {
    const bytes = randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

export const newTaskId = () => `t${short()}`;
export const newQuestionId = () => `q${short()}`;
export const newNoteId = () => `n${short()}`;
/**
 * A held permission request. Same 8-character shape and the same reason: this id travels inside a Telegram
 * `callback_data`, which the Bot API caps at 64 bytes — and it travels there beside a verb, so the budget is
 * tighter than a question's rather than looser. See `encodeApprovalCallback` in lib/telegram.ts.
 */
export const newApprovalId = () => `p${short()}`;
/**
 * One sub-agent. Never travels through Telegram — nothing about a sub-agent needs answering — so the
 * length is a convention shared with the rest rather than a constraint.
 */
export const newSubagentId = () => `s${short()}`;

/** Option keys and idempotency keys must be predictable and URL/callback safe. */
export const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const OPTION_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,11}$/;
