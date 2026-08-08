'use client';

import { useState } from 'react';
import { finishBySlug } from '../../lib/finishes';
import { paletteBySlug, paletteTokens } from '../../lib/palettes';
import type { PerkKind, PerkState } from '../../lib/perks';
import type { CrestInput } from '../../lib/progress';
import { surfaceBySlug } from '../../lib/surfaces';
import Crest from './Crest';
import { act, Saved, type SaveState } from './ui';

/**
 * Pick a look, on any of the three axes. One control per perk, and the sample is the real thing.
 *
 * ==================================================================================================
 * EVERY SAMPLE IS GENERATED FROM THE SAME DATA THE STYLESHEET IS
 * ==================================================================================================
 *
 * The palette swatches come out of `paletteTokens` — the function that emits the CSS. The surface tiles use the
 * `image` string that `surfaceCss` emits. And the crest samples render **his own crest**, from his own history,
 * through the real component with each finish applied.
 *
 * That last one is the part worth building rather than approximating. A generic sample crest would be a picture
 * of somebody else's work; his crest in five finishes is a choice between five versions of himself, which is what
 * the whole perk system is supposed to be about. It costs nothing — the geometry is already derived for the page
 * header, so this is five more SVGs of arithmetic that has already been done.
 *
 * A hand-picked preview colour, or a drawn-by-hand sample, is a second copy of the thing being chosen, and it
 * drifts in the most misleading possible direction: he would choose a look from a picture that is no longer what
 * he gets. That already happened once here — the first version of the palette swatch drew the dark variant
 * always, so on a light desktop every swatch previewed a palette he was not going to receive.
 *
 * ==================================================================================================
 * THE WRITE GOES THROUGH THE SERVER
 * ==================================================================================================
 *
 * Setting the cookie in the browser would be one line and would make every entitlement check decoration: the
 * cookie is user-editable, so anyone able to open dev tools would have all fifteen perks. The server reduces the
 * request to what he has actually earned, re-validates all three axes (a perk can be LOST — re-open a task and a
 * level-gated look stops being his), sets the cookie itself and reports what it settled on. The page shows the
 * server's answer, never the button's intention.
 *
 * A full reload rather than a router refresh: the palette and the surface both arrive as hoisted `<style>`
 * elements in the document head, and reloading is the honest way to prove the server really is serving the new
 * ones. It also means what he sees after choosing is exactly what he gets next time he opens the hub.
 */
export default function LookChoice({ kind, states, current, crest }: {
    kind: PerkKind;
    /** Only the states for THIS axis. `/looks` filters; this renders. */
    states: PerkState[];
    current: string;
    /**
     * His own crest's inputs, for the crest samples.
     *
     * Passed even for the palette and surface sections, because the component is one component and a prop that
     * is sometimes absent is a prop every branch has to check. It is a small plain object.
     */
    crest: CrestInput;
}) {
    const [saving, setSaving] = useState<string | null>(null);
    const [state, setState] = useState<SaveState>({ kind: 'idle' });

    async function choose(slug: string) {
        if (slug === current) return;
        setSaving(slug);
        setState({ kind: 'busy' });
        const r = await act({ action: 'looks.set', kind, slug });
        if (r.ok) {
            /* The server has set the cookie. Reload so the hoisted stylesheets come from the server too. */
            window.location.reload();
        } else {
            setSaving(null);
            setState({ kind: 'bad', message: r.message });
        }
    }

    /** The noun for this axis, for the accessible label. "Use the Bronze palette" beats "Use Bronze". */
    const noun = kind === 'palette' ? 'palette' : kind === 'crest' ? 'crest finish' : 'page surface';

    return (
        <>
            <ul className="lookgrid" data-measure="palette-choice" data-kind={kind}>
                {states.map(({ perk, unlocked, need }) => {
                    const blurb = kind === 'palette' ? paletteBySlug(perk.slug)?.blurb
                        : kind === 'crest' ? finishBySlug(perk.slug)?.blurb
                            : surfaceBySlug(perk.slug)?.blurb;
                    if (blurb === undefined) return null;
                    const on = perk.slug === current;
                    return (
                        <li key={perk.slug} data-measure="look" data-look={perk.slug}>
                            <button
                                className={`lookcard${on ? ' on' : ''}${unlocked ? '' : ' lockedlook'}`}
                                onClick={() => choose(perk.slug)}
                                disabled={!unlocked || saving !== null}
                                aria-pressed={on}
                                aria-label={unlocked
                                    ? `Use the ${perk.label} ${noun}${on ? ' (in use)' : ''}`
                                    : `${perk.label} is locked. ${need}`}
                            >
                                <Sample kind={kind} slug={perk.slug} crest={crest} />
                                <span className="lookname">
                                    {perk.label}
                                    {on && <span className="lookon">in use</span>}
                                    {!unlocked && <span className="looklock">locked</span>}
                                </span>
                                <span className="lookblurb">{blurb}</span>
                                {/* The requirement, with real arithmetic. Never a percentage — see the page. */}
                                {!unlocked && <span className="lookneed">{need}</span>}
                                {saving === perk.slug && <span className="lookneed">Applying…</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {/* Only ever the server's own words. See the note on `act` in ui.tsx. */}
            <Saved state={state} />
        </>
    );
}

/**
 * The sample for one perk, per axis.
 *
 * `aria-hidden` throughout: every sample is the thing drawn as itself, and there is no sentence a screen reader
 * could be given about six squares or a shield that the label and blurb beside it do not already say better.
 */
function Sample({ kind, slug, crest }: { kind: PerkKind; slug: string; crest: CrestInput }) {
    if (kind === 'crest') {
        return (
            <span className="lookcrest" aria-hidden="true">
                <Crest c={crest} size={96} finish={slug} />
            </span>
        );
    }

    if (kind === 'surface') {
        const def = surfaceBySlug(slug);
        if (!def) return null;
        return (
            /*
             * The pattern at its real scale, on a real `--s0` tile.
             *
             * NOT scaled to fit the swatch. A 32px grid shown at half size is a 16px grid, which is a different
             * material — and the whole risk this axis carries is about what the pattern does behind text at the
             * size it actually renders. A tile showing the true scale is a preview; a shrunk one is a decoration.
             */
            <span
                className="looksurface"
                aria-hidden="true"
                style={{
                    backgroundColor: 'var(--s0)',
                    backgroundImage: def.image,
                    backgroundSize: def.size,
                    backgroundRepeat: 'repeat',
                }}
            >
                {/* Real text on the real surface, at the real size, so the sample answers the only question that
                    matters about a texture: can you still read over it. */}
                <span className="looksurfacetext">Aa</span>
            </span>
        );
    }

    const def = paletteBySlug(slug);
    if (!def) return null;
    const { dark, light } = paletteTokens(def);
    /*
     * BOTH SCHEMES ARE RENDERED AND CSS PICKS ONE.
     *
     * The first version drew the dark variant always, so on a light desktop every swatch previewed a palette he
     * was not going to get. Not solved with `matchMedia`, deliberately: this is a client component inside a
     * server-rendered page, and reading the colour scheme during render is the classic hydration mismatch.
     * `prefers-color-scheme` in the stylesheet is the same signal without that class of bug — and it keeps
     * working when he changes his system theme with the page open.
     */
    return (
        <>
            {(['dark', 'light'] as const).map(scheme => {
                const t = scheme === 'dark' ? dark : light;
                return (
                    <span key={scheme} className={`lookswatch for-${scheme}`} aria-hidden="true">
                        {(['s0', 's1', 's2', 's3', 's4'] as const).map(k => (
                            <span key={k} style={{ background: `oklch(${t[k][0]} ${t[k][1]} ${t[k][2]})` }} />
                        ))}
                        <span
                            className="lookaccent"
                            style={{ background: `oklch(${t.accent[0]} ${t.accent[1]} ${t.accent[2]})` }}
                        />
                    </span>
                );
            })}
        </>
    );
}
