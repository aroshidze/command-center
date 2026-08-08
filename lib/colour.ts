/**
 * The one derivation of a project's colour, in a module both a client component and a server page can import.
 *
 * WHY IT MOVED HERE, AND THE BUG THAT FOUND IT
 *
 * `projectColor` lived in `app/components/ui.tsx`, which is `'use client'`. `app/setup/page.tsx` is a server
 * component and could not import it, so it carried its own copy — `hsl(h 62% 58%)` — under a comment that said
 * *"Same derivation as the board, so a project is the same colour in both places."*
 *
 * That comment stopped being true the moment the board's version moved to OKLCH. Two files, one claim, and the
 * claim was false: the same project rendered as two different colours on two pages of the same hub, and the
 * only thing asserting they matched was a sentence. Exactly the drifting-duplicate failure `docs/RESEARCH.md`
 * §7 names, and exactly what the setup page's own opening comment forbids — *"add sections here freely, but
 * compute them. Never paste."* I pasted.
 *
 * A module with no `'use client'` and no imports can be pulled into either half, so there is one copy again.
 */

/**
 * The hue a project owns, derived from its slug. Stable, stored nowhere, and the same everywhere it is drawn.
 *
 * WHY OKLCH AND NOT THE `hsl(h 62% 62%)` THIS USED TO RETURN
 *
 * HSL lightness is not perceived lightness. At a fixed 62%, yellow is far brighter than blue — so with hues
 * scattered around the wheel by a hash, some project colours popped off the page and others sank into it, and
 * which one you got depended on how your slug happened to hash. That is exactly the perceptual unevenness
 * app/globals.css moved the whole palette to OKLCH to escape, and the one colour computed in JavaScript was
 * still doing it.
 *
 * Fixed L and C mean every project reads at the same weight and only the hue distinguishes them, which is the
 * point: the colour is an identifier, not an emphasis. It also means one measured contrast figure holds for all
 * of them, which is what lets this be used for more than a 7px dot.
 */
export function projectHue(slug: string): number {
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
    return h;
}

/**
 * A stable colour per project, derived from its slug.
 *
 * Added when the hub first held 17 tasks and read as an undifferentiated dump. With several projects loaded, a
 * colour lets you find the block you care about without reading every label — which is the difference between a
 * hub and a list. Derived rather than configured, because a colour to choose is a field to maintain, and this
 * thing has to stay maintenance-free (docs/RESEARCH.md §7).
 *
 * Hue only; lightness and chroma are fixed so nothing can come out unreadable on the dark background.
 */
export function projectColor(slug: string): string {
    return `oklch(0.78 0.13 ${projectHue(slug)})`;
}
