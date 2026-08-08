/**
 * WHAT A MILLION TOKENS COSTS, PER MODEL — in code, so a wrong price is fixed by deploying.
 *
 * ==================================================================================================
 * WHY THE PRICES ARE HERE AND THE TOKENS ARE IN THE DATABASE
 * ==================================================================================================
 *
 * This is the same split the whole progress system rests on, pointed at money instead of at points.
 * `scripts/schema.sql` stores the token counts, because those are what was measured and nothing derives
 * them. The dollar figure is a FOLD over those counts and this table, computed on every render.
 *
 * The reason that matters rather than being tidy: prices change. A stored dollar column would be a
 * historical claim that silently stops being reproducible the day a rate moves, and correcting it would
 * mean migrating a table full of figures somebody was told they had spent. A price in code is reviewable
 * in a diff, and a correction is a deploy — which is the same argument `AGENTS.md` makes for mark
 * definitions living in code and mark state being derived.
 *
 * ==================================================================================================
 * IT IS NOT A BILL, AND THE INTERFACE HAS TO SAY SO
 * ==================================================================================================
 *
 * Claude Code on a Max or Pro subscription does not bill per token at all — the money he actually spent
 * is a flat monthly fee, and these figures are what the same work would have cost through the API. That
 * is a genuinely useful number (it is how you find out that one project is eating four fifths of your
 * allowance) and it is NOT what he paid. Anything rendering it says "at API rates" for the same reason
 * `noteReach` says "synced" rather than "read": the honest word is the one the data supports.
 *
 * ==================================================================================================
 * NO IMPORTS, DELIBERATELY
 * ==================================================================================================
 *
 * Same rule as lib/schema.ts. A value import between two `lib/*.ts` files breaks Node's type-stripping,
 * which is how `tests/*.mjs` load this file to assert the table rather than restating it — and a check
 * that restates the thing it is checking is not a check. See AGENTS.md trap 2.
 */

/** Dollars per million tokens, for the five ways a token can be billed. */
export interface Price {
    input: number;
    output: number;
    /** A cache write with the default five-minute TTL: 1.25x input. */
    cacheWrite5m: number;
    /** A cache write with the one-hour TTL: 2x input. */
    cacheWrite1h: number;
    /** A cache read: 0.1x input. */
    cacheRead: number;
}

/**
 * Cache multipliers, applied to the model's own input rate rather than written out per model.
 *
 * Stated as arithmetic because that is what they are — a cache write is priced as a multiple of the
 * input rate, so writing twenty numbers out by hand would be twenty chances to fat-finger one, and a
 * fat-fingered cache-read rate is the one that would be least visible (it is a tenth of the smallest
 * figure on the page).
 */
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;

const priced = (input: number, output: number): Price => ({
    input,
    output,
    cacheWrite5m: input * CACHE_WRITE_5M,
    cacheWrite1h: input * CACHE_WRITE_1H,
    cacheRead: input * CACHE_READ,
});

/**
 * PER-MILLION RATES, BY MODEL ID. Verified against the published pricing on 7 August 2026.
 *
 * Two entries deserve their reasoning rather than being taken on trust:
 *
 * `<synthetic>` is a real value in Claude Code's own transcripts — 47 rows of it on this machine — and it
 * is priced at ZERO rather than left out. Leaving it out would make it "unknown", and an unknown model's
 * tokens are reported separately as unpriced, which would be a permanent line on the page about spend
 * that does not exist. A synthetic message never went to the API.
 *
 * Sonnet 5 is listed at its LIST price. There is an introductory $2/$10 in force until 31 August 2026,
 * so a Sonnet 5 figure before that date is an OVERSTATEMENT, and this is the deliberate direction: the
 * intro rate is a property of the calendar rather than of the row, and modelling it would mean pricing
 * each usage record against the date it was written. Stated rather than modelled, because nothing on
 * this machine has run Sonnet 5 — all 35,869 usage rows are Opus 5, Opus 4.8 and Fable 5 — so it would
 * be complexity paying for a case that does not occur.
 */
export const PRICES: Record<string, Price> = {
    /* Fable and Mythos: the top tier. */
    'claude-fable-5': priced(10, 50),
    'claude-mythos-5': priced(10, 50),
    'claude-mythos-preview': priced(10, 50),

    /* Opus. */
    'claude-opus-5': priced(5, 25),
    'claude-opus-4-8': priced(5, 25),
    'claude-opus-4-7': priced(5, 25),
    'claude-opus-4-6': priced(5, 25),
    'claude-opus-4-5': priced(5, 25),
    'claude-opus-4-1': priced(15, 75),
    'claude-opus-4-0': priced(15, 75),

    /* Sonnet. See the note above about the introductory rate. */
    'claude-sonnet-5': priced(3, 15),
    'claude-sonnet-4-6': priced(3, 15),
    'claude-sonnet-4-5': priced(3, 15),
    'claude-sonnet-4-0': priced(3, 15),

    /* Haiku. */
    'claude-haiku-4-5': priced(1, 5),

    /* Not an API call. See above — zero rather than absent, and the difference is a line on the page. */
    '<synthetic>': priced(0, 0),
};

/**
 * FAST MODE IS A DIFFERENT PRICE FOR THE SAME MODEL, and the usage record says which was used.
 *
 * Claude Code's transcripts carry `usage.speed`, which is `"standard"` or `"fast"`. Fast mode on Opus 5
 * is billed at $10/$50 rather than $5/$25 — double — so a session run in fast mode priced at the standard
 * rate would report half of what it cost. Cheap to get right because the field is already in the data;
 * expensive to get wrong because the error is silent and large.
 */
export const FAST_PRICES: Record<string, Price> = {
    'claude-opus-5': priced(10, 50),
    'claude-opus-4-8': priced(10, 50),
};

/** One model's measured tokens. The shape both the CLI posts and the page folds over. */
export interface TokenCounts {
    input_tokens: number;
    output_tokens: number;
    cache_write_5m: number;
    cache_write_1h: number;
    cache_read: number;
}

/**
 * Look a price up, tolerating the shapes a model id actually arrives in.
 *
 * Exact match first, then a date-suffixed id (`claude-haiku-4-5-20251001`) reduced to its alias, because
 * both forms are real: the alias is what a caller passes and the dated id is what some providers echo
 * back. A Bedrock `anthropic.`-prefixed id is stripped for the same reason.
 *
 * Returns null rather than a default, and that is the whole point of the function. Falling back to Opus
 * rates would overstate a Haiku run fivefold; falling back to zero would silently omit spend. A model
 * this table has never heard of is REPORTED as unpriced — see `costOf`.
 */
export function priceFor(model: string, fast = false): Price | null {
    let id = model.trim().toLowerCase().replace(/^anthropic\./, '');

    /*
     * `claude-opus-5:fast` — fast mode carried IN THE MODEL KEY rather than in a column.
     *
     * The `spend` table is keyed by (source, project, model), and fast mode is a different price for the same
     * model, so the two have to be separable. A `fast` boolean column was the obvious answer and it is worse:
     * it widens the primary key, it means every reader has to remember to group by it, and it puts a fact about
     * pricing into the schema instead of into the price table. A suffix keeps the whole notion of fast mode
     * inside this file, where the rates live.
     *
     * The colon is deliberate — it survives `sanitiseToolName`'s identifier alphabet, which a space or a
     * parenthesis would not, so the round trip through the store cannot mangle it into a different model.
     */
    if (id.endsWith(':fast')) { id = id.slice(0, -5); fast = true; }

    const table = fast ? FAST_PRICES : PRICES;
    if (table[id]) return table[id];
    if (fast && PRICES[id]) return PRICES[id];   // fast mode on a model that has no fast rate

    /* A dated snapshot: claude-haiku-4-5-20251001 -> claude-haiku-4-5. Only ever strips a trailing
     * eight-digit date, so it cannot accidentally shorten a model name into a different model. */
    const undated = id.replace(/-\d{8}$/, '');
    if (undated !== id) {
        if (table[undated]) return table[undated];
        if (fast && PRICES[undated]) return PRICES[undated];
    }
    return null;
}

/** What one model's tokens cost, in dollars, plus whether the figure could be computed at all. */
export interface Cost {
    dollars: number;
    /** The models this fold could not price. Empty on the normal path; never silently dropped. */
    unpriced: string[];
}

/**
 * Fold a set of per-model token counts into one dollar figure, and say what it could not price.
 *
 * `unpriced` is returned rather than logged because the page has to be able to state it. A total that
 * quietly excludes a model is the same class of untruth as a record that quietly stops at five rows —
 * the number looks complete and is not, and there is nothing on screen to say so.
 */
export function costOf(rows: (TokenCounts & { model: string; fast?: boolean })[]): Cost {
    let dollars = 0;
    const unpriced = new Set<string>();
    for (const r of rows) {
        const p = priceFor(r.model, r.fast === true);
        if (!p) { unpriced.add(r.model); continue; }
        dollars +=
            (r.input_tokens * p.input
                + r.output_tokens * p.output
                + r.cache_write_5m * p.cacheWrite5m
                + r.cache_write_1h * p.cacheWrite1h
                + r.cache_read * p.cacheRead) / 1_000_000;
    }
    return { dollars, unpriced: [...unpriced] };
}

/**
 * A dollar figure, rendered — and it never rounds a real cost to "$0.00".
 *
 * Two decimal places above a dollar, because that is money. Below a dollar it keeps going to as many
 * places as it takes to show something non-zero, up to four: a project that cost eleven cents reading
 * "$0.11" is right, and a project that cost four tenths of a cent reading "$0.00" would be a figure
 * claiming the work was free. Zero itself is the one case allowed to print as zero.
 */
export function humanDollars(dollars: number): string {
    if (dollars <= 0) return '$0';
    if (dollars >= 1) {
        const [whole, cents] = dollars.toFixed(2).split('.');
        return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
    }
    for (const places of [2, 3, 4]) {
        const s = dollars.toFixed(places);
        if (Number(s) > 0) return `$${s}`;
    }
    return '<$0.0001';
}
