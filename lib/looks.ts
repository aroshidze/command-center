/**
 * Which unlocked look he has chosen — the first piece of state in this hub that is not derived.
 *
 * ==================================================================================================
 * WHY THIS IS A COOKIE AND NOT A TABLE
 * ==================================================================================================
 *
 * Everything else on the page is computed. `lib/progress.ts` opens with the rule and the reason: a stored score
 * is a score that can disagree with the rows it came from, and the whole trust argument rests on never being
 * able to. Which palette he *prefers* is genuinely not derivable from any row — so it is the one thing that has
 * to be recorded, and the question is where.
 *
 * A `settings` table would be the obvious answer and it is the wrong one right now, for a reason that is
 * practical rather than philosophical: **the production connection string exists only in Vercel.** I cannot run
 * a migration against the real hub, so a schema change means either handing him a chore or shipping a feature
 * that silently does nothing in the only place it matters. A cookie needs no migration and works the moment it
 * deploys.
 *
 * It is also, on its own merits, the right home for a display preference. It is per-device — his phone can be on
 * Ink while the desk is on Bronze, which is arguably better than one global choice — and it is read on the server
 * during render, so the correct palette is in the first HTML rather than swapped in after paint. No flash of the
 * wrong theme, which is the usual way this gets shipped.
 *
 * WHAT IS LOST, STATED PLAINLY: clearing cookies resets the choice to the default. Nothing else is affected —
 * every unlock is derived from work he actually did, so the perks themselves cannot be lost, only the selection.
 * If he wants the choice to follow him across devices, that is a `settings` table and one migration, and the
 * honest way to get it is a task in his own hub with the exact steps. This file is not an argument against ever
 * doing that.
 *
 * ==================================================================================================
 * THE COOKIE IS NOT TRUSTED
 * ==================================================================================================
 *
 * It is user-editable by definition, so a hand-set cookie could name a palette he has not unlocked — or a slug
 * that does not exist. Every read validates against the derived unlock set and falls back to the default. The
 * hub must not be skinnable by anyone who can open dev tools, or the unlock is decoration and the reward means
 * nothing.
 */

import { DEFAULT_FINISH, finishBySlug, generatedFinish } from './finishes';
import { DEFAULT_PALETTE, generatedPalette, paletteBySlug } from './palettes';
import {
    generatedGates, GENERATED_FROM, isUnlocked, LOOKAHEAD, PERKS, perkBySlug, type PerkDef,
} from './perks';
import type { Mark, Standing } from './progress';
import { DEFAULT_SURFACE, generatedSurface, surfaceBySlug } from './surfaces';

/**
 * THE MINTED PERKS FOR A GIVEN LEVEL — the one place the rotation meets the three axis modules.
 *
 * `lib/perks.ts` owns which axis a level mints on and cannot import the axis modules, because a value import
 * between two `lib/*.ts` files is not resolvable by the type-stripping the suites load them through (AGENTS.md,
 * and re-verified with a probe before this was written). This file already imports all three, so this is where
 * the join belongs — and it is the same shape as `perkArrivals` taking its ledger and marks as arguments.
 *
 * THE LABEL COMES FROM THE AXIS DEFINITION, NOT FROM A SECOND TABLE HERE. A palette's name belongs with palettes.
 * Keeping a copy of the naming in `lib/perks.ts` would be two tables to drift apart, and this codebase already
 * has one comment that claimed two derivations matched and was false (see lib/colour.ts). One table, read through
 * the generator that owns it.
 *
 * THE HORIZON IS HIS LEVEL PLUS ONE FULL ROTATION, so each of the three sections on `/looks` has exactly one
 * locked item waiting — enough that every axis has something coming, few enough that the page is not a list of
 * things he cannot have.
 *
 * AND IT NEVER STARTS BELOW LEVEL 8's GATE, which is the difference between this fix being visible and being
 * invisible. He is at level 4. A horizon of `level + 3` is 7, which mints nothing, so `/looks` would have looked
 * *exactly as it did before* — the entire movement would have shipped as a change he could not see until he
 * reached level 8, on the page whose whole job is to answer the question he actually asked:
 *
 *     "the unlockable things, most of it is unlocked early, then what?"
 *
 * Clamping the floor means the answer is on the page today: three locked items, each stating the real level and
 * the real remaining points from the same `rungAt` the level bar uses. Nothing is given away — they are locked,
 * and `isUnlocked` is unchanged — but "then what" now has a visible answer instead of a promise in a commit.
 */
export function generatedPerks(level: number): PerkDef[] {
    const horizon = Math.max(Math.floor(level), GENERATED_FROM - 1) + LOOKAHEAD;
    return generatedGates(horizon).map(gate => {
        const def = gate.kind === 'palette' ? generatedPalette(gate.index)
            : gate.kind === 'crest' ? generatedFinish(gate.index)
                : generatedSurface(gate.index);
        return {
            slug: gate.slug,
            kind: gate.kind,
            label: def.label,
            requires: { kind: 'level' as const, level: gate.level },
        };
    });
}

export const LOOKS_COOKIE = 'cc_looks';

/** How many announcement slugs the cookie will hold. See the note in `parseLooks` for the arithmetic. */
export const SEEN_MAX = 120;

export interface Looks {
    palette: string;
    /** Which crest finish is on. See lib/finishes.ts. */
    crest: string;
    /** Which page surface is on. See lib/surfaces.ts. */
    surface: string;
    /**
     * WHICH UNLOCKS HE HAS ALREADY BEEN TOLD ABOUT — rule 3 of the perk system, as data.
     *
     * *"An unlock never applies itself. It announces itself once and waits."* The first half was already true;
     * the second half needed somewhere to remember that the announcement had happened, or the hub would either
     * nag on every load or never say anything at all.
     *
     * This is a PREFERENCE, not progress, which is the line lib/progress.ts draws and the reason it is allowed
     * to be stored at all. What is derived is whether a perk is unlocked; what is stored is whether he has seen
     * the sentence. Clearing cookies re-announces things he already has, which is a harmless second telling
     * rather than a lost unlock — every unlock is still derived from work he actually did.
     *
     * Slugs only, so it stays a handful of bytes even when he has everything: fifteen perks is about 120
     * characters, and a cookie has four kilobytes.
     */
    seen: string[];
}

export const DEFAULT_LOOKS: Looks = {
    palette: DEFAULT_PALETTE,
    crest: DEFAULT_FINISH,
    surface: DEFAULT_SURFACE,
    seen: [],
};

/**
 * Parse the cookie into a shape, without validating entitlement.
 *
 * Deliberately forgiving about the ENCODING and strict about the VALUES: a malformed cookie should give him the
 * default hub rather than a 500, but a well-formed cookie naming something he has not earned must not survive
 * `resolveLooks`. Those are two different jobs and conflating them is how a fallback becomes a bypass.
 */
export function parseLooks(raw: string | undefined): Looks {
    if (!raw) return DEFAULT_LOOKS;
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Looks>;
        const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
        return {
            palette: str(parsed?.palette, DEFAULT_PALETTE),
            crest: str(parsed?.crest, DEFAULT_FINISH),
            surface: str(parsed?.surface, DEFAULT_SURFACE),
            /*
             * Filtered to strings AND capped, because this is the one field a hand-edited cookie could grow
             * without bound — the cookie must not become a place to store data.
             *
             * THE CAP WAS `PERKS.length * 2` — 32 — AND THAT STOPPED BEING RIGHT WHEN THE ECONOMY BECAME
             * UNBOUNDED. One perk is minted per level from 8 upward, so `seen` now grows by one entry per level
             * for ever, and a cap of 32 would have silently started forgetting announcements at about level 24 —
             * roughly year one — with the visible symptom being old unlocks announcing themselves again. A cap
             * derived from the length of a list that no longer has a length is a cap that means nothing.
             *
             * 120 is arithmetic rather than a round number. A slug is at most about ten characters
             * (`surface-104`), and `looksCookie` URL-encodes the JSON so each quote costs three bytes: 120 entries
             * is roughly 2KB against a 4KB per-cookie limit, leaving room for the three chosen slugs and the
             * envelope. Level 120 is decades at his measured rate.
             *
             * WHAT HAPPENS AT THE CAP, STATED RATHER THAN LEFT TO BE DISCOVERED: entries past it are dropped, so
             * an announcement could be shown a second time. That is the harmless direction — a repeated telling
             * rather than a lost unlock, since every unlock is still derived from work he actually did.
             */
            seen: Array.isArray(parsed?.seen)
                ? parsed.seen.filter((s): s is string => typeof s === 'string').slice(0, SEEN_MAX)
                : [],
        };
    } catch {
        return DEFAULT_LOOKS;
    }
}

/**
 * Is this the slug of a look that could exist? Used to filter a hand-crafted POST out of the `seen` list.
 *
 * SHAPE RATHER THAN ENTITLEMENT, and that is the right question for this one job. `/api/looks/seen` records what
 * he has been TOLD, which is deliberately not entitlement-checked (see the note in `resolveLooks`), so all this
 * has to exclude is junk that would push real acknowledgements out of the capped list.
 *
 * It was `new Set(PERKS.map(p => p.slug))` in the route, which was complete when the perk set was sixteen rows
 * and became wrong the moment the economy could mint one: dismissing a minted unlock would have been silently
 * dropped, and the banner would have come back on the next load with no way to make it stop. Asking the axis
 * modules instead means the answer covers the whole line without needing to know his level.
 */
export function isKnownLookSlug(slug: string): boolean {
    return !!perkBySlug(slug) || !!paletteBySlug(slug) || !!finishBySlug(slug) || !!surfaceBySlug(slug);
}

/**
 * What he has earned and has NOT yet been told about. Rule 3, as a query.
 *
 * Newest-cheapest-first is not the order here: it is `PERKS` order, which is unlock order, so if two arrive
 * together the earlier-gated one is announced first. That matters because arriving together is the common case —
 * clearing a project unlocks both `Moss` and `Vellum` in the same instant.
 *
 * Returns every unannounced perk rather than just the first, so the caller decides how many to say at once. The
 * board says one; `/looks` marks all of them.
 */
export function unannounced(s: Standing, earned: Mark[], looks: Looks): PerkDef[] {
    /* The minted line is included, or a level past 7 would hand him something and say nothing — the announcement
     * is the ONLY thing that tells him an unlock happened, because rule 3 forbids the hub applying it itself. */
    return [...PERKS, ...generatedPerks(s.level)].filter(p =>
        /*
         * A LEVEL-1 PERK IS NEVER NEWS, and the first version of this announced all three of them.
         *
         * Rendered, the banner read *"6 new looks are yours, including Graphite."* Graphite is the palette the hub
         * shipped in, Plain is the crest as it is drawn and Flat is a page with no pattern — nobody earns any of
         * them, and telling him he has just been given the thing he has been looking at since day one is the
         * "badge for something you did not do" class of untruth arriving through an announcement.
         *
         * Same rule and same reasoning as `perkArrivals` skipping level 1: `rankLedger` records CROSSINGS, and
         * level 1 is where everyone starts, so there is no moment to point at.
         */
        !(p.requires.kind === 'level' && p.requires.level <= 1)
        && isUnlocked(p, s, earned)
        && !looks.seen.includes(p.slug));
}

/**
 * The looks actually in force: what the cookie asked for, reduced to what he has earned.
 *
 * Returns the reason when it had to fall back, so the interface can say so rather than quietly ignoring him.
 * Silently reverting a choice is the same class of defect as an optimistic success message — the page would be
 * showing one thing while claiming another.
 */
export function resolveLooks(
    wanted: Looks, s: Standing, earned: Mark[],
): { looks: Looks; refused: string | null } {
    /*
     * ONE AXIS AT A TIME, AND A REFUSAL ON ONE MUST NOT RESET THE OTHERS.
     *
     * The single-axis version returned `DEFAULT_LOOKS` wholesale on any problem, which was fine when there was
     * one field and is a real defect with three: a hand-edited cookie naming a locked palette would have thrown
     * away his crest finish and his surface as well, and the refusal message would have named only the palette.
     * So each axis falls back independently and the reasons are collected.
     *
     * Only the FIRST reason is surfaced, because two refusals at once means the cookie was edited by hand and
     * the useful message is "this one is not yours", not a list. `refused` is rendered verbatim, so it has to be
     * a sentence rather than a report.
     */
    const reasons: string[] = [];

    const one = (
        wantedSlug: string,
        fallback: string,
        lookup: (slug: string) => { label: string } | null,
        noun: string,
    ): string => {
        const def = lookup(wantedSlug);
        if (!def) {
            if (wantedSlug !== fallback) reasons.push(`There is no ${noun} called "${wantedSlug}".`);
            return fallback;
        }
        const perk = perkBySlug(wantedSlug);
        if (perk && !isUnlocked(perk, s, earned)) {
            reasons.push(`${def.label} is not unlocked yet.`);
            return fallback;
        }
        return wantedSlug;
    };

    const looks: Looks = {
        palette: one(wanted.palette, DEFAULT_PALETTE, paletteBySlug, 'palette'),
        crest: one(wanted.crest, DEFAULT_FINISH, finishBySlug, 'crest finish'),
        surface: one(wanted.surface, DEFAULT_SURFACE, surfaceBySlug, 'surface'),
        /*
         * `seen` is not entitlement-checked, deliberately. It records what he has been TOLD, and a slug in it
         * that he has not earned simply means one future announcement is skipped — which is a cosmetic loss to
         * him and no gain to anybody. Validating it would mean a hand-edited cookie could make the hub
         * re-announce things, which is the wrong direction of harm to defend against.
         */
        seen: wanted.seen,
    };
    return { looks, refused: reasons[0] ?? null };
}

/** The Set-Cookie value. A year, path-wide, lax — a display preference, not a credential. */
export function looksCookie(looks: Looks): string {
    const value = encodeURIComponent(JSON.stringify(looks));
    return `${LOOKS_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
