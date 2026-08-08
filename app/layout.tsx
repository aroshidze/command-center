import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Command Center',
    description: 'What needs you, across every project.',
    // It is a private page for one person. Keep it out of indexes and out of link previews.
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    // Zoom stays enabled. Locking it is a common phone-web mistake and this page has to stay readable
    // when the thing you are copying is a long value.
    maximumScale: 5,
    /*
     * THE PHONE'S BROWSER CHROME, AND IT HAD DRIFTED OFF THE RAMP.
     *
     * This was a single `#100f0e` under a comment saying it matched `--s0`. It did once. The ramp was
     * restretched twice since — see the `--s0` comment in globals.css — and `--s0` now renders at
     * rgb(9,5,2), so the bar above the page on a phone was three values lighter than the page under it:
     * a visible seam at the top of the one surface that is supposed to be edge to edge. And there was no
     * light entry at all, so a light-theme phone got a near-black bar over a near-white page.
     *
     * Both values are the RENDERED sRGB of `--s0`, read through the same 1x1 canvas the contrast checks
     * use, rather than converted by hand from the oklch.
     *
     * WHAT THIS CANNOT DO, said out loud rather than left as a surprise: an unlockable palette moves
     * `--s0`, and a meta tag cannot reference a custom property. Making it follow would mean an async
     * `generateViewport` reading the chosen look, which puts a settings read on the critical path of
     * every page against L8's 1,200ms budget — too much for the top eight pixels of a phone. Graphite is
     * the default and every other palette is within a few values of it in the dark scheme.
     */
    themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#090502' },
        { media: '(prefers-color-scheme: light)', color: '#f1f0ed' },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
