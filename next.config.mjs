/** @type {import('next').NextConfig} */
const nextConfig = {
    /*
     * `cli/cc.mjs` must be deployed even though NOTHING IMPORTS IT.
     *
     * `GET /api/agent/cc.mjs` reads it off disk at request time, on purpose: the CLI is a program with a
     * top-level switch over `process.argv`, not a module, and reading it means the bytes served are the file
     * rather than a second copy compiled in. But Next decides what to ship to a serverless function by
     * tracing imports — and an unimported file traces to nothing, so the route would work locally (where the
     * whole repository is on disk) and 404 in production. That is the worst shape of bug available here,
     * because the route exists to be the FIRST thing a new machine calls.
     *
     * VERIFIED ON PRODUCTION, 4 Aug 2026: the route returns 200 and the file it serves runs and lists all nine
     * commands. This comment said the opposite for one commit — that it could not be checked from here — which
     * was true when written and stopped being true the moment that commit deployed. If you change this key,
     * that curl against the deployment is the only thing that proves it: `next dev` has the whole repository on
     * disk and will pass either way.
     */
    outputFileTracingIncludes: {
        '/api/agent/cc.mjs': ['./cli/cc.mjs'],
    },

    /*
     * NO DEV BADGE, so a screenshot of `next dev` is a screenshot of the hub.
     *
     * Next draws a small circular "N" indicator in the bottom-left corner in development. Production does not
     * have it — so every screenshot this project has ever filed as evidence contains an element the real page
     * does not, sitting on top of the interface, and the README's first impression was about to be one of them.
     *
     * Turned off HERE rather than removed in tests/shoot.mjs, deliberately: that file's own comment says a
     * harness that hides a rendered element certifies a page nobody will ever see, and it is right. The honest
     * fix is for the development page to stop carrying something the deployed one does not.
     *
     * The error overlay is a different thing and is untouched — which matters, because check K3 has caught an
     * invalid-HTML bug through it becoming focusable, and that is a signal worth keeping.
     */
    devIndicators: false,

    // The hub is one human's private page. Nothing here should ever be cached by an intermediary,
    // because a cached copy of "what needs you" is the trust-gap failure from docs/RESEARCH.md §7.
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
                    { key: 'Referrer-Policy', value: 'no-referrer' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                ],
            },
        ];
    },
};

export default nextConfig;
