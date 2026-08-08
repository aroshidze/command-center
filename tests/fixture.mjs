/**
 * Realistic data volumes, in the LOCAL dev database, so the layout can be looked at and measured.
 *
 *   node tests/fixture.mjs            # load the fixture
 *   node tests/fixture.mjs --clear      # remove it (agent rows survive, so the hub says one has checked in)
 *   node tests/fixture.mjs --unstarted  # nothing filed AND no agent ever synced: the FIRST screen a new
 *                                       #   person sees, and the only state that was unreachable before
 *   node tests/fixture.mjs --cleared  # the finished work and nothing open (an EARNED empty hub)
 *   node tests/fixture.mjs --live     # PRODUCTION's measured volumes: 12 open, 2 projects, NO decisions
 *
 * WHY THIS EXISTS
 *
 * `npm run prove:layout` measured whatever production happened to contain that day. That makes every
 * layout number unrepeatable — "cards tile into two columns at 1280px" was true because production had
 * three tasks in one project this morning, not because the CSS says so. It also meant the only way to see
 * a realistic hub was to point a browser at the real one, which docs/ENVIRONMENT.md exists to discourage.
 *
 * The volumes below are the ones the UI brief names, because they are the volumes at which the two
 * reported layout bugs appeared and at which nothing smaller did:
 *
 *   - one project with 16 open tasks          (the "wall of cards" case)
 *   - three projects with 2 tasks each        (the "dead column" case that shipped once)
 *   - one task with 19 steps                  (the "nineteen steps in a 340px column" case)
 *   - one question with 4 options             (the widest decision card)
 *   - a blocked task, a task with no `why`, a task with no estimate, a long title, a long note
 *
 * AND, added for the progress work:
 *
 *   - nine FINISHED tasks and two ANSWERED decisions, spread over eight days
 *
 * Those nine are ADDITIONAL rows, not nine of the twenty-two marked off. That matters: every open volume
 * above is a volume at which a real layout bug appeared, so completing existing fixture tasks would have
 * quietly weakened the case the fixture exists to reproduce — 16 open tasks in one project is the wall,
 * and 9 is not. Same reason the two answered decisions are new questions rather than answers to the four
 * open ones: four open decisions filling the first screen is what produced the 46vh cap.
 *
 * Nine and not ten, on purpose. `tests/use-it.mjs` ticks one more off and asserts that the tenth
 * completion makes the "ten finished" milestone appear, then re-opens it and asserts the milestone goes
 * away again. A threshold crossed in both directions inside one test is the cheapest possible proof that
 * the figure is derived from the rows rather than stored somewhere.
 *
 * SAFETY
 *
 * Writes go through the real agent API, so validation, `writeVerified` and the no-secrets rule all apply —
 * a fixture that bypasses the write path would be testing a hub that does not exist. Deletes go straight
 * to Postgres and are scoped to the four slugs below, which is the same shape as `resetProofData()` in
 * tests/prove.mjs and for the same reason: there is no delete endpoint and there should not be one.
 *
 * Two guards, both of which abort rather than warn:
 *   1. the target must be localhost — this must never be able to fill the real hub with invented work
 *   2. Telegram sending must be suppressed — an earlier script pushed a dozen synthetic notifications to
 *      a real phone, and that is the kind of mistake that gets a channel muted permanently
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* may be in the environment */ }

const BASE = (process.env.CC_FIXTURE_URL || 'http://localhost:3939').replace(/\/+$/, '');
const TOKEN = process.env.CC_AGENT_TOKEN;
const CLEAR = process.argv.includes('--clear');
/*
 * `--cleared`: the finished work and NOTHING open.
 *
 * A third state, and the one the design leans on hardest. Hard constraint 6 says an empty queue is SUCCESS,
 * and the whole argument for having no streak (docs/RESEARCH.md §18) is that a streak would render this exact
 * screen as a failure. That claim is worth nothing unless the screen can actually be looked at, and neither
 * of the existing states produces it: the full fixture always has open work, and `--clear` empties the record
 * too, so it shows an empty hub with nothing behind it rather than an empty hub that was earned.
 *
 * It is also the only way to see the "cleared a project" and "the whole hub reached zero" marks.
 */
const CLEARED = process.argv.includes('--cleared');

/*
 * `--unstarted`: THE STATE EVERY NEW PERSON STARTS IN, AND IT WAS NOT REACHABLE FROM HERE AT ALL.
 *
 * This is the hub before anything has ever touched it: no tasks, no decisions, no record, and **no agent has ever
 * synced**. It is the first screen anybody he onboards will see, and until this flag existed there was no way to
 * produce it — so nobody had ever looked at it. Six sessions and twenty-two screenshots in, not one was of a hub
 * that had never been used.
 *
 * `--clear` IS NOT THIS, and the difference is the whole reason this flag has to exist. `clear()` deletes the agent
 * named `fixture` and nothing else, so every agent the suites have ever registered survives it — `use-it`,
 * `use-it-2`, whatever a proof run left behind. The hub then reports that an agent HAS checked in, which is the
 * `connected` state (see `emptinessOf` in lib/progress.ts), not the unstarted one. I found that out the hard way:
 * `--clear` rendered "Nothing needs you yet · use-it-2 has checked in", and I had to delete the agent rows by hand
 * to see what a new person actually gets.
 *
 * Deleting every agent row is a bigger hammer than the rest of this file uses, and it is safe for one reason
 * stated rather than assumed: this script refuses to run against anything but localhost, and an agent row is
 * recreated by the next sync. Nothing derives from it — `derive()` never reads `agents`.
 */
const UNSTARTED = process.argv.includes('--unstarted');

/*
 * `--live`: PRODUCTION'S MEASURED VOLUMES, which are not the ones anything has ever been designed against.
 *
 * The default fixture is 22 open tasks across 4 projects with 4 open decisions. Production, measured from the
 * screenshots in commit efb48d3 (docs/RESEARCH.md §26), is **12 open tasks across 2 projects with ZERO open
 * decisions**. Those are not the same hub, and the difference is not a detail:
 *
 *   - The decisions region is the loudest thing in the interface, the only user of the `--ask` palette, and the
 *     reason the 46vh cap exists. On his hub it is EMPTY, and no check has ever seen it that way, because the
 *     fixture guarantees four. Whether the page reads well with no decisions at all is currently unknown.
 *   - Every layout threshold — tasks above the fold, scroll extent, section fill — is calibrated against
 *     volumes roughly double his. Tuning against the fixture is how three redesigns shipped defects he found
 *     by looking.
 *
 * Built by SELECTING from the arrays below rather than by declaring new content, so there is one source of
 * truth for what a task looks like and the two states cannot drift apart in their prose.
 *
 * WHAT IT MATCHES PRODUCTION ON, AND WHAT IT DOES NOT — because a fixture is a claim about real data, and a
 * wrong claim there is invisible everywhere and wrong everywhere (§12):
 *
 *   matches:      12 open tasks (11 actionable + 1 blocked), 2 projects, 0 open decisions, 2 finished tasks,
 *                 and a record about a day old rather than eight
 *   DOES NOT:     production has 5 answered decisions and this has 2, because inventing three more would mean
 *                 three more entries in ANSWERED and every points figure in every other state would move. The
 *                 structural facts are what this mode exists to measure; the score is not one of them.
 */
const LIVE = process.argv.includes('--live');

/*
 * `--stale`: the hub going quietly out of date, which is a STATE and had no way to be seen.
 *
 * docs/RESEARCH.md §7 cause 5 calls Telegram's silence the anti-rot mechanism, and the staleness line is the
 * only thing that tells him the silence has stopped being trustworthy — that no agent has read his answers and
 * the whole list may be lying. It fires when the last sync is over 72 hours old.
 *
 * Which the fixture could never produce, because loading it syncs agents seconds beforehand. So the one warning
 * the design leans on hardest had never been rendered, measured or photographed — the same gap the emblem's
 * higher tiers had, and the same reason: a state that cannot be reached with plausible data is a state that
 * will be wrong. This ages the last sync instead of inventing anything.
 *
 * Combines with the other modes rather than excluding them, because staleness is orthogonal to volume: the
 * question "what does a stale hub look like" applies equally to a full one and an empty one.
 */
const STALE = process.argv.includes('--stale');

if (!TOKEN) { console.error('CC_AGENT_TOKEN is not set. See docs/SETUP.md.'); process.exit(1); }

if ([CLEAR, CLEARED, LIVE, UNSTARTED].filter(Boolean).length > 1) {
    console.error('\nPick one of --clear, --cleared, --live. They describe different hubs.\n');
    process.exit(1);
}

/* -------------------------------------------------------------------------------- guard 1: local */

const host = new URL(BASE).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(
        `\nRefusing to run against ${BASE}.\n\n` +
        'This script invents work that nobody asked for. In the real hub that is indistinguishable from\n' +
        'an agent lying to you, which is the one failure the hub cannot survive. Localhost only.\n',
    );
    process.exit(1);
}

/* ---------------------------------------------------------------------- guard 2: Telegram is off */

const health = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
if (!health) {
    console.error(`\nNo hub answering at ${BASE}. Start it with \`npm run dev\`.\n`);
    process.exit(1);
}
if (health.checks?.telegram?.ok !== false) {
    console.error(
        '\nThis hub has a live Telegram channel, so loading the fixture would push invented\n' +
        'notifications to a real phone. Set CC_SUPPRESS_TELEGRAM=yes in .env.local.\n',
    );
    process.exit(1);
}

/* ------------------------------------------------------------------------------------ the slugs */

/*
 * Deliberately not the owner's real project names, so a fixture row can never be mistaken for real work,
 * and so the delete below can never reach anything that matters. Slug LENGTHS are realistic, because the
 * project heading is a layout element and a short name would flatter the design.
 */
const P = {
    big: 'harbour-lights',
    a: 'tuck-shop',
    b: 'nine-panels',
    c: 'cold-brew',
};
const SLUGS = Object.values(P);

/* ------------------------------------------------------------------------------------- the wipe */

/*
 * Direct Postgres, for the two things there is no API for and should not be: deleting fixture rows, and
 * back-dating them. Hoisted out of clear() once the back-dating below needed it too.
 */
let _db = null;
async function sqlDirect() {
    if (!_db) {
        const { neon } = await import('@neondatabase/serverless');
        _db = neon(process.env.DATABASE_URL);
    }
    return _db;
}

async function clear() {
    const db = await sqlDirect();
    for (const slug of SLUGS) {
        await db`delete from tasks where project = ${slug}`;
        await db`delete from questions where project = ${slug}`;
        await db`delete from notes where project = ${slug}`;
        await db`delete from events where project = ${slug}`;
    }
    await db`delete from agents where name = 'fixture'`;
    // The proof suites leave a marker note behind in whichever database they ran against. It is harmless
    // but it shows up in the hub's footer, so a screenshot of the fixture ends up with someone else's
    // test data in it. Scoped to the exact marker text those suites write.
    await db`delete from notes where body like 'Proof note at %' or body like '%proof note%'`;
    /* The two unscoped/standalone notes this fixture writes, by id. The project loop above cannot reach the
     * unscoped one — `project = slug` never matches null — so without this, `--clear` would leave the hub
     * claiming an uncollected note in a hub that has nothing else in it. */
    await db`delete from events where ref_id in ('fixnote1', 'fixnote2')`;
    await db`delete from notes where id in ('fixnote1', 'fixnote2')`;

    /*
     * PRESENCE, APPROVALS AND SPEND — ALL OF THEM, NOT JUST THE FIXTURE SLUGS.
     *
     * Deliberately unscoped, and that is the opposite of every delete above it. The reason is the `y2-*`
     * lesson from §XXVIII, which cost nine falsely-failing checks: **this fixture is scoped, so anything it
     * does not name survives it** — and rows in these three tables are exactly what a hand-run heartbeat or a
     * probe leaves behind. A stale presence row makes /agents claim an agent is working, and a stale spend row
     * makes a figure that no suite can reproduce.
     *
     * Unscoped is safe here in a way it would not be for `tasks`: `tests/fixture.mjs` already refuses to run
     * against anything but localhost, and none of these three tables holds work. Presence is re-reported by
     * the next session, spend by the next `cc spend`, and an approval lives ten minutes.
     */
    await db`delete from presence`;
    await db`delete from approvals`;
    await db`delete from spend`;
}

async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${TOKEN}`,
            'x-cc-agent': 'fixture',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        console.error(`  FAILED (${res.status}) ${body.title}: ${json?.error || 'no reason given'}`);
        return null;
    }
    return json;
}

/* ------------------------------------------------------------------------------------ the tasks */

/** The nineteen-step task. This is the shape that rendered as a ladder of two-word lines. */
const NINETEEN = [
    { do: 'Open **console.cloud.google.com** and sign in with the account that owns the domain.' },
    { do: 'Click the project picker in the top bar, then **New project**.' },
    { do: 'Name it exactly:', copy: 'harbour-lights-prod' },
    { do: 'Leave **Location** as *No organisation* and click **Create**.', detail: 'It takes about twenty seconds. Wait for the notification before continuing, or the next screen will be for the wrong project.' },
    { do: 'Switch to the new project using the picker. Check the name in the top bar before you go on.' },
    { do: 'In the search bar type **APIs & Services** and open it.' },
    { do: 'Click **Enable APIs and services**, search for **Google Drive API**, open it, click **Enable**.' },
    { do: 'Do the same for **Google Sheets API**.', detail: 'Two separate APIs. Enabling Drive does not enable Sheets, which is not obvious and costs a confusing 403 later.' },
    { do: 'Go to **OAuth consent screen** in the left sidebar.' },
    { do: 'Choose **External** and click **Create**.', detail: 'Internal is only available on Workspace accounts and will be greyed out.' },
    { do: 'App name:', copy: 'Harbour Lights' },
    { do: 'Set **User support email** to your own address from the dropdown.' },
    { do: 'Scroll to **Developer contact information** and put the same address in.' },
    { do: 'Click **Save and continue** three times to get past Scopes and Test users.' },
    { do: 'Back on the summary, click **Publish app**, then confirm.', detail: 'Left in Testing mode the refresh token expires after seven days, and the failure looks like a random logout three weeks later.' },
    { do: 'Go to **Credentials** → **Create credentials** → **OAuth client ID**.' },
    { do: 'Application type **Web application**. Authorised redirect URI:', copy: 'https://harbourlights.app/api/auth/callback/google' },
    { do: 'Click **Create**. A dialog shows the client ID and secret.' },
    { do: 'Paste both into Vercel as environment variables, then close the dialog.', detail: 'The secret is shown once. If you close it first you have to make a new client — there is no way to reveal it again.' },
];

const TASKS = [
    /* ---- the big project: 16 open tasks, one of them nineteen steps long ---- */
    {
        project: P.big, key: 'google-oauth', minutes: 25,
        title: 'Set up the Google Cloud project and OAuth client',
        why: 'Sign-in is the last thing between the build and a usable staging link.',
        steps: NINETEEN,
        verify: 'The Credentials page lists one OAuth 2.0 Client ID, and the consent screen says "In production".',
        gotchas: [
            'The client secret is displayed exactly once. Copy it before closing the dialog.',
            'Enabling the Drive API does not enable the Sheets API — they are separate.',
        ],
    },
    {
        project: P.big, key: 'stripe-account', minutes: 20,
        title: 'Finish Stripe account activation',
        why: 'Payments stay in test mode until the business details are accepted.',
        steps: [
            { do: 'Open **dashboard.stripe.com** and click the **Activate payments** banner.' },
            { do: 'Fill in the business details. Use the registered address, not the trading one.' },
        ],
        verify: 'The dashboard header no longer shows the orange "Test mode" activation banner.',
        gotchas: [],
    },
    {
        project: P.big, key: 'domain-dns', minutes: 10,
        title: 'Point harbourlights.app at Vercel',
        why: 'Unblocks the OAuth redirect URI, which has to be on the real domain.',
        steps: [
            { do: 'In your registrar, add an A record for **@**:', copy: '76.76.21.21' },
            { do: 'Add a CNAME for **www**:', copy: 'cname.vercel-dns.com' },
        ],
        verify: 'Vercel\'s Domains tab shows both records with a green tick.',
        gotchas: ['Propagation can take an hour. Vercel says "Invalid Configuration" until it does.'],
    },
    {
        project: P.big, key: 'apple-dev', minutes: 45,
        title: 'Pay the Apple Developer Program fee',
        why: 'Nothing can be signed or TestFlighted until the membership is active.',
        steps: [{ do: 'Open **developer.apple.com/programs/enroll** and pay with a card in your own name.' }],
        verify: 'The membership page shows an expiry date twelve months out.',
        gotchas: ['Enrolment can sit in review for 48 hours. It is not stuck.'],
    },
    {
        project: P.big, key: 'photos-shoot', minutes: 90,
        title: 'Photograph the twelve products against the grey backdrop',
        why: 'The catalogue placeholder images are the only thing making the shop look unfinished.',
        steps: [
            { do: 'Use the 50mm, f/8, on the tripod. Same distance for all twelve so they crop identically.' },
            { do: 'Export at 2000px on the long edge, sRGB, and drop them in the shared folder.' },
        ],
        verify: 'Twelve files in the folder, all 2000px, all the same crop.',
        gotchas: [],
    },
    {
        project: P.big, key: 'bank-feed', minutes: 15,
        title: 'Reconnect the bank feed — it expired on the 12th',
        why: 'Six weeks of transactions are not being imported.',
        steps: [{ do: 'Open the accounting app, **Settings → Bank feeds**, and reauthorise.' }],
        verify: 'The feed shows "Last updated: today" and the transaction count jumps.',
        gotchas: [],
    },
    {
        project: P.big, key: 'insurance-cert', minutes: 10,
        title: 'Download the public liability certificate and send it to the venue',
        why: 'The venue will not confirm the date without it.',
        steps: [{ do: 'Log in to the insurer, **Documents**, download the current certificate.' }],
        verify: 'The venue replies confirming the booking.',
        gotchas: [],
    },
    {
        project: P.big, key: 'sim-swap', minutes: 30,
        title: 'Swap the SIM in the shop card reader',
        why: 'The reader drops off Wi-Fi at the back of the shop and falls back to a dead SIM.',
        steps: [{ do: 'Power the reader down first. The tray is under the rubber flap on the left edge.' }],
        verify: 'The reader shows a signal bar and takes a £1 test payment.',
        gotchas: ['Powering it down first matters — a hot swap corrupts the config and needs a factory reset.'],
    },
    {
        project: P.big, key: 'vat-register', minutes: 40,
        title: 'Register for VAT',
        why: 'Turnover crossed the threshold last month, so this is now on a clock.',
        steps: [{ do: 'Open the tax portal and start the VAT registration. You need the UTR and the bank details.' }],
        verify: 'You get a VAT registration number by email, usually within two weeks.',
        gotchas: [],
    },
    {
        project: P.big, key: 'fire-door', minutes: 5,
        title: 'Measure the fire door gap and send me the number',
        why: 'Decides whether the fitting is a strip or a whole new door, which is a factor of ten in cost.',
        steps: [{ do: 'Measure the gap at the top, middle and bottom of the closing edge, in millimetres.' }],
        verify: 'You have three numbers written down.',
        gotchas: [],
    },
    {
        project: P.big, key: 'courier-account', minutes: 20,
        title: 'Open the courier business account',
        why: 'Cuts the per-parcel cost by about 40% and gives an API for labels.',
        steps: [{ do: 'Apply online. It asks for an estimated monthly volume — 200 is the honest answer.' }],
        verify: 'You receive an account number and can log in to the shipping portal.',
        gotchas: [],
    },
    {
        project: P.big, key: 'ppc-card', minutes: 5,
        title: 'Put a card on the ads account before Thursday',
        why: 'The campaign is built and scheduled; it will simply not start without a payment method.',
        steps: [{ do: 'Ads dashboard → **Billing** → add the business card.' }],
        verify: 'Billing shows an active payment method and no warning banner.',
        gotchas: [],
    },
    {
        project: P.big, key: 'trademark', minutes: 60,
        title: 'File the trademark application for the wordmark',
        why: 'Someone filed a near-identical mark in class 25 last month.',
        steps: [{ do: 'Use the online filing service. Classes 25 and 35. You will need the logo as an SVG.' }],
        verify: 'The application appears in the register with a filing date.',
        gotchas: ['Class 35 is retail services and is easy to forget. Adding it later means a second fee.'],
    },
    {
        project: P.big, key: 'landlord-email', minutes: 5,
        title: 'Reply to the landlord about the rent review',
        why: 'Silence past the 30th is treated as acceptance of the proposed figure.',
        steps: [{ do: 'Reply to the email of the 3rd. You do not have to agree, you have to respond.' }],
        verify: 'The email is in your Sent folder.',
        gotchas: [],
    },
    {
        project: P.big, key: 'accountant-call', minutes: 30,
        title: 'Book the year-end call with the accountant',
        why: 'Their diary is full from mid-August, and the deadline is not movable.',
        steps: [{ do: 'Use the booking link in their last email. Ask for a 30-minute slot.' }],
        verify: 'A calendar invite arrives.',
        gotchas: [],
    },
    {
        project: P.big, key: 'stock-count', minutes: 120,
        title: 'Count the stock in the back room and the container',
        why: 'The system says 340 units and the last spot check suggested nearer 280.',
        steps: [{ do: 'Count by SKU. Two people, one counting and one writing, is twice as fast and far more accurate.' }],
        verify: 'A count sheet with a number against every SKU.',
        gotchas: [],
        blocked_reason: 'The container key is with the previous tenant until Friday.',
    },

    /* ---- three small projects, two tasks each: the case that produced the dead column ---- */
    {
        project: P.a, key: 'twilio-number', minutes: 10,
        title: 'Buy a UK number in the Twilio console',
        why: 'The reminder texts have nothing to send from.',
        steps: [{ do: 'Console → **Phone Numbers → Buy a number**. Filter to GB, mobile, SMS-capable.' }],
        verify: 'The number is listed under Active Numbers and shows an SMS capability tick.',
        gotchas: [],
    },
    {
        project: P.a, key: 'sender-id', minutes: 15,
        title: 'Register the SMS sender ID',
        why: 'Unregistered sender IDs are silently dropped by two of the four UK networks.',
        steps: [{ do: 'Console → **Messaging → Sender IDs**. It needs the company number.' }],
        verify: 'The sender ID shows status "Approved", usually next working day.',
        gotchas: [],
    },
    {
        project: P.b, key: 'app-store-agreement', minutes: 20,
        title: 'Accept the updated App Store agreement',
        why: 'Builds cannot be submitted while an agreement is outstanding.',
        steps: [{ do: 'App Store Connect → **Business** → accept the pending agreement.' }],
        verify: 'The Business tab shows no outstanding agreements.',
        gotchas: [],
    },
    {
        project: P.b, key: 'screenshots-6-7', minutes: 45,
        title: 'Take the 6.7" store screenshots on a real device',
        why: 'The simulator screenshots were rejected twice for the wrong status bar.',
        steps: [{ do: 'On the 15 Pro Max: five screens, portrait, status bar showing full signal and 100%.' }],
        verify: 'Five PNGs at 1290x2796.',
        gotchas: [],
    },
    {
        project: P.c, key: 'roaster-visit', minutes: 180,
        title: 'Visit the roaster and taste the three new lots',
        why: 'The house blend contract renews in three weeks and the current lot is inconsistent.',
        steps: [{ do: 'They are expecting you Thursday morning. Bring the cupping notes from March.' }],
        verify: 'You have picked a lot and told them.',
        gotchas: [],
    },
    {
        project: P.c, key: 'grinder-service', minutes: 60,
        title: 'Book the grinder service — the burrs are past 800kg',
        why: 'Past 800kg the grind gets inconsistent and every shot needs re-dialling.',
        steps: [{ do: 'Call the supplier. Ask for a burr replacement, not just a clean.' }],
        verify: 'A service date is in the diary.',
        gotchas: [],
    },
];

/* -------------------------------------------------------------------------------- the questions */

const QUESTIONS = [
    {
        project: P.big,
        key: 'image-bucket',
        title: 'Reuse the existing image bucket, or make a new one for the catalogue?',
        context: 'Blocks the catalogue import — 2,849 images. Reusing is faster; a separate bucket makes the lifecycle rules simpler later.',
        options: [
            { key: 'reuse', label: 'Reuse product-images', detail: 'Ready now. One bucket to reason about, mixed lifecycles.', recommended: true },
            { key: 'new', label: 'Create a catalogue bucket', detail: 'Half a day of plumbing. Clean separation and its own retention rule.' },
            { key: 'cdn', label: 'Put them behind the CDN instead', detail: 'Cheapest to serve, but the import has to be rewritten.' },
            { key: 'wait', label: 'Hold the import until the storage review', detail: 'Nothing ships this week.' },
        ],
        allow: ['choose', 'respond', 'ignore'],
        default_option: 'reuse',
        hours: 12,
    },
    {
        project: P.a,
        key: 'sms-window',
        title: 'Send reminders at 09:00 or 18:00?',
        context: 'Morning gets better open rates; evening gets better replies. I only need one to start.',
        options: [
            { key: 'morning', label: '09:00', recommended: true },
            { key: 'evening', label: '18:00' },
        ],
        allow: ['choose', 'ignore'],
        default_option: 'morning',
        hours: 6,
    },
    {
        project: P.b,
        title: 'I am about to delete the 3,400 orphaned draft records. Fine?',
        context: 'They have no parent and have not been touched in nine months. Reversible for 30 days from the backup.',
        allow: ['accept', 'respond', 'ignore'],
    },
    {
        project: P.c,
        title: 'What should the receipt footer say?',
        context: 'It is the only line I cannot write for you.',
        allow: ['respond', 'ignore'],
    },
];

/* --------------------------------------------------------------------------- the FINISHED work */

/*
 * Nine tasks that get created and then ticked off, and two decisions that get created and answered.
 *
 * Every one carries a `why`, because `why` is the whole point of the record: it is the sentence the asking
 * agent wrote about what becomes true, and it is what makes a ticked errand feel like it was worth doing
 * (docs/RESEARCH.md §20 — Grant 2008). Two of them deliberately have NO `why`, because an agent is not
 * required to write one and the surface must not fall over or invent a sentence when it is missing.
 *
 * `hoursAgo` is when it was finished. See backdate() for why that is applied with SQL.
 */
const DONE_TASKS = [
    {
        /*
         * A DELIBERATELY LONG `why`, because the first version of this fixture flattered the design.
         *
         * Every `why` here was one short sentence, so the record looked tidy in a 420px pane and the owner's
         * real hub did not: agents actually write three to five lines — "Opens the one traffic channel that
         * does not need Google to trust us first. Pins keep working for months, so this compounds while you
         * sleep. Unblocks: Everything Pinterest. I have 360 pins queued and 2,849 renderable, and none of
         * them can go anywhere until the domain is claimed." That is the real shape, and against it the pane
         * was a wall of prose.
         *
         * `why` is capped at 400 characters by lib/store.ts, so this is near the worst legal case. The
         * fixture has to contain the worst legal case or the layout is only tested against the easy one —
         * the same lesson as measuring against production's three tasks and calling the grid correct.
         */
        project: P.big, key: 'claim-domain', minutes: 15, hoursAgo: 196,
        title: 'Claim harbourlights.app in the Pinterest settings',
        why: 'Opens the one traffic channel that does not need Google to trust us first. Pins keep working ' +
             'for months, so this compounds while you sleep. Unblocks: everything Pinterest. There are 360 ' +
             'pins queued and 2,849 renderable, and none of them can go anywhere until the domain is claimed.',
        steps: [{ do: 'Open **pinterest.com/settings/claim** and paste:', copy: 'harbourlights.app' }],
        verify: 'The page shows harbourlights.app with a tick and the word Claimed.',
    },
    {
        project: P.big, key: 'analytics-property', minutes: 20, hoursAgo: 148,
        title: 'Create the analytics property and paste the measurement id into Vercel',
        why: 'Six weeks of launch traffic would otherwise have been unrecoverable.',
        steps: [{ do: 'Admin → **Create property**, then copy the measurement id from Data Streams.' }],
        verify: 'Realtime shows your own visit within a minute of opening the site.',
    },
    {
        /*
         * This key was `insurance-cert` in the first draft, which is ALSO an open task's key in the same
         * project. `key` is an idempotency key per project, so posting this one silently UPDATED the open
         * task and then ticked it off — harbour-lights went from 16 open tasks to 15, which is the exact
         * property the header of this file says must not change. Nothing failed: `prove:layout` stayed
         * green because L3 only needs six tasks above the fold, and the fixture printed "22/22 loaded"
         * because 22 writes had genuinely succeeded. Found by querying the database and counting.
         *
         * Hence the assertion at the bottom of this file. A fixture that cannot detect its own collisions
         * is a fixture that silently changes what every layout number means.
         */
        project: P.big, key: 'supplier-cert', minutes: 10, hoursAgo: 121,
        title: 'Send the liability certificate to the fireworks supplier',
        why: 'They released the booking the same afternoon.',
        steps: [{ do: 'Log in to the insurer, **Documents**, download the current certificate.' }],
        verify: 'The supplier replies confirming the booking.',
    },
    {
        project: P.big, key: 'bank-feed-reconnect', minutes: 15, hoursAgo: 99,
        title: 'Reconnect the bank feed',
        // The second long one, so the record is not tested against exactly one awkward row.
        why: 'Until this was done the accounts could take a payment but could not reconcile one, so real ' +
             'money was landing somewhere nobody could see it. Six weeks of transactions came back in, ' +
             'which is what the VAT registration numbers are calculated from.',
        steps: [{ do: '**Settings → Bank feeds** and reauthorise.' }],
        verify: 'The feed reads "Last updated: today" and the transaction count jumps.',
    },
    {
        // No `why`. An agent is allowed to skip it, and the record must handle that without inventing one.
        project: P.big, key: 'landlord-reply', minutes: 5, hoursAgo: 76,
        title: 'Reply to the landlord about the rent review',
        steps: [{ do: 'Reply to the email of the 3rd. You do not have to agree, you have to respond.' }],
        verify: 'The email is in your Sent folder.',
    },
    {
        project: P.big, key: 'product-photos-grey', minutes: 90, hoursAgo: 52,
        title: 'Photograph the twelve products against the grey backdrop',
        why: 'Replaced every placeholder image, so the shop stopped looking unfinished.',
        steps: [{ do: '50mm, f/8, tripod, same distance for all twelve so they crop identically.' }],
        verify: 'Twelve files in the folder, all 2000px on the long edge.',
    },
    {
        project: P.a, key: 'company-number', minutes: 10, hoursAgo: 30,
        title: 'Find the company number and send it over',
        why: 'Unblocked the sender-ID registration, which two of the four UK networks require.',
        steps: [{ do: 'It is on the certificate of incorporation, top right.' }],
        verify: 'The registration form accepts it without an error.',
    },
    {
        // No `why` and no `minutes`. Both optional, both therefore worth having in the fixture.
        project: P.b, key: 'test-device-passcode', hoursAgo: 27,
        title: 'Put the test device passcode in the shared vault',
        steps: [{ do: 'Six digits. Vault entry is called **nine-panels test iPhone**.' }],
        verify: 'You can read it back out of the vault on another machine.',
    },
    {
        project: P.c, key: 'cupping-notes', minutes: 25, hoursAgo: 4,
        title: 'Dig out the March cupping notes and photograph them',
        why: 'The roaster can now compare the three new lots against what you actually liked in March.',
        steps: [{ do: 'They are in the folder by the grinder. One photo per page is fine.' }],
        verify: 'Six legible photos in the shared folder.',
    },
];

/*
 * Two answered decisions, because a decision made is an accomplishment too and nothing in the hub has ever
 * said so. Both are NEW questions rather than answers to the four open ones — see the header.
 *
 * The first is answered four minutes after it was asked, which is what "unblocked an agent fast" is
 * measured from. The second is answered comfortably inside its deadline, so no timed default was needed.
 */
const ANSWERED = [
    {
        project: P.big, key: 'cdn-region',
        title: 'Serve the catalogue images from Frankfurt or from the edge?',
        context: 'The import is ready either way. Edge is faster for everyone and costs more per GB.',
        options: [
            { key: 'edge', label: 'Edge, everywhere', recommended: true },
            { key: 'fra', label: 'Frankfurt only' },
        ],
        allow: ['choose', 'ignore'],
        default_option: 'edge',
        hours: 6,
        answer: { type: 'choose', option: 'edge' },
        askedHoursAgo: 50,
        answeredMinutesAfter: 4,
        deadlineHoursAfter: 6,
    },
    {
        project: P.c, key: 'receipt-copy',
        title: 'Put the loyalty line on the receipt, or leave it off?',
        context: 'It is four words of print. Off is cleaner; on is the only place people see the scheme.',
        options: [
            { key: 'on', label: 'Put it on', recommended: true },
            { key: 'off', label: 'Leave it off' },
        ],
        allow: ['choose', 'respond', 'ignore'],
        default_option: 'on',
        hours: 12,
        answer: { type: 'choose', option: 'on', note: 'Yes, but keep it to one line — the paper is narrow.' },
        askedHoursAgo: 100,
        answeredMinutesAfter: 170,
        deadlineHoursAfter: 12,
    },
];

/** Everything the human can do, through the same endpoint the page uses, cookie and all. */
async function asHuman(body) {
    const res = await fetch(`${BASE}/api/ui/act`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `cc_session=${process.env.CC_WEB_TOKEN}` },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.saved !== true) {
        console.error(`  FAILED (${res.status}) ${body.action}: ${json?.error || 'no reason given'}`);
        return false;
    }
    return true;
}

/*
 * THE ONE PLACE THIS FIXTURE WRITES ROUND THE API, AND WHY.
 *
 * Everything else here goes through the real agent API so that validation and `writeVerified` apply — a
 * fixture that bypasses the write path is testing a hub that does not exist. Timestamps are the exception,
 * because there is no endpoint for "this was finished last Tuesday" and there must never be one: an API
 * that lets a caller choose `done_at` is an API for writing a false record, which is the exact failure this
 * whole project is built against.
 *
 * So the completions and answers above are performed for real, through the real endpoint, and only THEN is
 * the clock moved backwards with SQL. The rows are genuine; only their dates are staged. Without this the
 * record would hold nine completions inside the same second, and "since 30 July" would render as a range
 * of zero days — which tests nothing and would have hidden a date-formatting bug.
 */
async function backdate() {
    const db = await sqlDirect();
    const H = 3600_000;

    /*
     * THE OPEN TASKS GET BACK-DATED TOO, AND THIS IS NOT COSMETIC.
     *
     * The first version created every open task at load time, so in the resulting data no open work existed
     * at any point before "now". That is a world in which the queue was empty every single time something
     * was finished — and `clearMoments` in lib/progress.ts, reading it faithfully, reported that the whole hub
     * had reached zero SEVENTEEN times while twenty-two tasks sat open on the screen. The derivation was
     * right; the fixture had described an impossible history.
     *
     * This is the third time this fixture has flattered the thing it exists to test (the others: `why` values
     * that were one short sentence when real ones are paragraphs, and a duplicated idempotency key that ate an
     * open task). The pattern is worth naming: a fixture is a claim about what real data looks like, and a
     * wrong claim there is invisible everywhere and wrong everywhere.
     *
     * Spread oldest-first in array order so ordering stays deterministic, and far enough back that open work
     * genuinely overlaps the completion window — which is what makes "reached zero" the rare event it should be.
     */
    /*
     * WRITE_TASKS rather than TASKS, because in `--live` mode only a subset was written. Looping the full array
     * would be harmless — the update matches on project and key and would simply hit nothing — but it would
     * space the surviving rows as if the others existed, so `created_at` would jump in gaps and the "waiting on
     * someone else for N days" figure would be computed from a history that was never loaded.
     */
    for (let i = 0; i < WRITE_TASKS.length; i++) {
        const t = WRITE_TASKS[i];
        const created = new Date(Date.now() - (WRITE_TASKS.length - i) * 10 * H);
        await db`
            update tasks set created_at = ${created.toISOString()}::timestamptz,
                             updated_at = ${created.toISOString()}::timestamptz
             where project = ${t.project} and key = ${t.key} and status = 'open'
        `;
    }

    /*
     * And the open decisions, so they do not all read "asked just now".
     *
     * Four decisions with identical timestamps is not a volume the layout has to survive, it is a detail that
     * makes every screenshot slightly false: "asked just now" is the shortest possible string in that slot,
     * so the card was only ever measured against its best case.
     */
    for (let i = 0; i < WRITE_QUESTIONS.length; i++) {
        const q = WRITE_QUESTIONS[i];
        const asked = new Date(Date.now() - (2 + i * 9) * H);
        /*
         * Matched on title, because two of the fixture's questions deliberately have no `key` — an agent is
         * not required to send one. Keying off `key` skipped exactly those two, which would have left the
         * shortest-string case in place on half the cards.
         *
         * The DEADLINE is deliberately not moved. It is stored absolute, so pushing it back with the ask time
         * would put it in the past — and `applyDueDefaults` resolves anything past its deadline on read, which
         * would silently answer the fixture's open decisions and drop the count from four to two. The four
         * open decisions filling the first screen are why the 46vh cap exists; losing them would quietly
         * change what every layout number means.
         */
        await db`
            update questions set created_at = ${asked.toISOString()}::timestamptz
             where project = ${q.project} and title = ${q.title} and status = 'open'
        `;
    }

    for (const t of WRITE_DONE) {
        const done = new Date(Date.now() - t.hoursAgo * H);
        // Created before it was finished, obviously. Two hours is enough to be ordered without pretending
        // to know how long anything really took.
        const created = new Date(done.getTime() - 2 * H);
        await db`
            update tasks set done_at = ${done.toISOString()}::timestamptz,
                             created_at = ${created.toISOString()}::timestamptz,
                             updated_at = ${done.toISOString()}::timestamptz
             where project = ${t.project} and key = ${t.key}
        `;
    }

    /*
     * Age the last sync, so "no agent has synced for N days" is a state that can actually be looked at.
     *
     * Every write above goes through the agent API, which stamps `agents.last_sync_at` — so at this point the
     * hub believes an agent was here seconds ago and the warning can never fire. Pushed back five days, which
     * is comfortably past the 72-hour threshold in app/components/Board.tsx without being so extreme that the
     * rendered figure stops looking like something that could really happen.
     */
    if (STALE) {
        await db`update agents set last_sync_at = now() - interval '5 days'`;
    }

    for (const q of ANSWERED) {
        const asked = new Date(Date.now() - q.askedHoursAgo * H);
        const answered = new Date(asked.getTime() + q.answeredMinutesAfter * 60_000);
        const deadline = new Date(asked.getTime() + q.deadlineHoursAfter * H);
        await db`
            update questions set created_at = ${asked.toISOString()}::timestamptz,
                                 answered_at = ${answered.toISOString()}::timestamptz,
                                 deadline = ${deadline.toISOString()}::timestamptz,
                                 updated_at = ${answered.toISOString()}::timestamptz
             where project = ${q.project} and key = ${q.key}
        `;
    }
}

/** Look a task's id up the way an agent would, by the key it was created with. */
async function taskId(project, key) {
    const r = await fetch(`${BASE}/api/agent/tasks?project=${project}&key=${key}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
    }).then(x => x.json()).catch(() => null);
    return r?.task?.id ?? null;
}

async function questionId(project, key) {
    const r = await fetch(`${BASE}/api/agent/sync?since=0`, {
        headers: { authorization: `Bearer ${TOKEN}`, 'x-cc-agent': 'fixture' },
    }).then(x => x.json()).catch(() => null);
    return (r?.open_questions ?? []).find(q => q.project === project && q.key === key)?.id ?? null;
}

/* ------------------------------------------------------------ what this run is actually loading */

/**
 * Production's shape, selected out of the arrays above. See the `--live` comment at the top.
 *
 * 9 actionable from the big project + the one blocked task + 2 from a second project = 12 open across 2, which
 * is the 9 + 1 + 2 that production holds. The blocked one is found by its `blocked_reason` rather than by index,
 * so re-ordering `TASKS` cannot silently drop it — and it is the task the whole "Not yet" section and the chase
 * control depend on existing.
 */
function liveTasks() {
    const blocked = TASKS.filter(t => t.blocked_reason);
    const bigOpen = TASKS.filter(t => t.project === P.big && !t.blocked_reason).slice(0, 9);
    const second = TASKS.filter(t => t.project === P.a).slice(0, 2);
    /*
     * The blocked task goes FIRST so `backdate` makes it the oldest row, which is what production looks like:
     * its one blocked task is "Flip Instacart to production when the approval email arrives" — something that
     * has been sitting for days waiting on somebody else. Ordering here only affects `created_at` spacing; the
     * server sorts blocked work last regardless. Being genuinely old is what makes the "waiting N days" line
     * and the chase control render at all, so without this the whole "Not yet" section would be missing from
     * every live-volume screenshot.
     */
    return [...blocked, ...bigOpen, ...second];
}

/**
 * The rows this run will write. One place, so the count assertions and the summary cannot disagree with what
 * was actually posted — which is the failure mode `--cleared` introduced and the volume check now guards.
 */
const WRITE_TASKS = (CLEARED || UNSTARTED) ? [] : LIVE ? liveTasks() : TASKS;
const WRITE_QUESTIONS = (CLEARED || LIVE || UNSTARTED) ? [] : QUESTIONS;
/* Two finished tasks, and in live mode they are re-dated to hours rather than days — his real record is one
 * day old because seventeen tasks were migrated at once, so "since 30 Jul" is the honest thing it says. */
const WRITE_DONE = LIVE
    ? DONE_TASKS.slice(0, 2).map((t, i) => ({ ...t, hoursAgo: i === 0 ? 20 : 6 }))
    : DONE_TASKS;

/* ------------------------------------------------------------------------------------- run it */

/* One phrase, whole. It used to be assembled as `${...} the layout fixture`, which read "Loading the CLEARED
 * the layout fixture" — a pre-existing wording bug that only showed up once a third mode was added to it. */
const WHAT = UNSTARTED ? 'Emptying the hub to the UNSTARTED state'
    : CLEAR ? 'Clearing the layout fixture'
    : CLEARED ? 'Loading the CLEARED layout fixture'
        : LIVE ? 'Loading the LIVE-VOLUME layout fixture'
            : 'Loading the layout fixture';
console.log(`\n${WHAT} at ${BASE}`);

await clear();
if (UNSTARTED) {
    /*
     * Every agent row, not just the fixture's. See the note on `UNSTARTED` at the top for why `clear()` on its own
     * leaves the hub in the `connected` state rather than in this one.
     */
    const db = await sqlDirect();
    const gone = await db`delete from agents returning name`;
    console.log(
        'The hub is now UNSTARTED: nothing has ever been filed and no agent has ever synced' +
        (gone.length ? ` (removed ${gone.length} agent row(s): ${gone.map(a => a.name).join(', ')})` : '') +
        '.\n' +
        '  This is the FIRST SCREEN anybody you onboard sees, and it is NOT what --clear produces:\n' +
        '  --clear leaves the agent rows behind, so the hub reports that something has checked in.\n');
    process.exitCode = 0;
} else if (CLEAR) {
    console.log('Fixture removed. The hub is now in the EMPTY state, which is the success case.\n' +
        '  NOTE: agent rows survive this, so the hub says an agent has checked in. For the state a\n' +
        '  brand-new person actually sees, use --unstarted.\n');
    process.exitCode = 0;
} else {
    let tasks = 0, questions = 0;
    // In `--cleared` mode nothing open is written at all, so the hub reaches zero without anything having to
    // be ticked off a second time — which keeps the finished rows' back-dated timestamps intact. In `--live`
    // mode the tasks are a subset and there are no open questions at all, which is the point of that mode.
    for (const t of WRITE_TASKS) if (await post('/api/agent/tasks', t)) tasks++;
    for (const q of WRITE_QUESTIONS) if (await post('/api/agent/questions', q)) questions++;

    // A note on a task, because the human's reply is a rendered element too and it is usually the longest
    // free text on the page.
    const first = CLEARED ? null : await fetch(`${BASE}/api/agent/tasks?project=${P.big}&key=fire-door`, {
        headers: { authorization: `Bearer ${TOKEN}` },
    }).then(r => r.json()).catch(() => null);
    if (first?.task?.id) {
        await fetch(`${BASE}/api/ui/act`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: `cc_session=${process.env.CC_WEB_TOKEN}` },
            body: JSON.stringify({
                action: 'task.note', id: first.task.id,
                note: 'Measured it: 4mm top, 11mm middle, 14mm bottom. The door is visibly bowed so I think ' +
                      'a strip is a waste of time — price a replacement instead and tell me what it comes to.',
            }),
        });
    }

    /* ---- the finished work: written for real, ticked for real, then back-dated ---- */

    let done = 0, answered = 0;

    for (const t of WRITE_DONE) {
        // `hoursAgo` and friends are fixture bookkeeping, not task fields — the API would reject them.
        const { hoursAgo, ...task } = t;
        if (!await post('/api/agent/tasks', task)) continue;
        const id = await taskId(t.project, t.key);
        if (id && await asHuman({ action: 'task.done', id })) done++;
    }

    for (const q of ANSWERED) {
        const { answer, askedHoursAgo, answeredMinutesAfter, deadlineHoursAfter, ...question } = q;
        if (!await post('/api/agent/questions', question)) continue;
        const id = await questionId(q.project, q.key);
        if (id && await asHuman({ action: 'question.answer', id, ...answer })) answered++;
    }

    await backdate();

    /*
     * ---- TWO STANDALONE NOTES, IN BOTH REACH STATES ----
     *
     * The "Told agents" tab renders one of two sentences per note: an agent synced after it, or nothing has.
     * Both are on screen, both make a claim, and the uncollected one is printed in the same amber as the
     * stale-sync warning. So the fixture has to produce both, or every screenshot filed as evidence shows the
     * easy case — which is the mistake this fixture already made once with the `why` values, where it carried
     * one-line prose while real agents write five lines.
     *
     * The FIRST is back-dated four hours, so the syncs this script itself performs land after it and it reads
     * as collected. The SECOND is stamped `now()` and written at the very END of the run, after every write and
     * every `backdate()`, so no sync in the log is later than it.
     *
     * That ordering is the whole trick, and getting it wrong produced exactly one wrong state: the first version
     * put this block before the finished tasks and dated the second note a minute ago, so the fixture's own agent
     * syncs landed after it and BOTH notes reported reach. The uncollected sentence — the one printed in amber,
     * the one he can act on — was unreachable in the only fixture anything is measured against.
     *
     * Written straight to the database rather than through `/api/ui/act`, because the point is the timestamp
     * and the endpoint has no way to back-date one — same reason the finished tasks are back-dated afterwards.
     */
    if (!CLEARED) {
        const db = await sqlDirect();
        const say = async (id, project, body, minutesAgo) => {
            await db`delete from events where ref_id = ${id}`;
            await db`delete from notes where id = ${id}`;
            await db`
                insert into notes (id, project, body, source, created_at)
                values (${id}, ${project}, ${body}, 'web', now() - ${minutesAgo} * interval '1 minute')
            `;
            await db`
                insert into events (kind, project, ref_id, summary, at)
                values ('note.created', ${project}, ${id}, ${`Note: ${body.slice(0, 300)}`},
                        now() - ${minutesAgo} * interval '1 minute')
            `;
        };
        await say(
            'fixnote1', P.big,
            'Did it, but the Pinterest settings page calls the field "Website URL" now, not "Website". Took the ' +
            'HTML tag option in the end — the meta tag is in the shared folder, second file down. Do not use ' +
            'the file-upload method, it wants FTP.',
            240,
        );
        await say(
            'fixnote2', null,
            'The bank feed reconnected on the second attempt. Whatever you script for this, expect the first ' +
            'try to fail silently and retry once before reporting anything.',
            0,
        );
    }


    /*
     * COUNT WHAT IS ACTUALLY THERE, rather than counting successful writes.
     *
     * "22/22 loaded" was true while the hub held 15 open tasks in the big project, because one of the
     * finished tasks reused an open one's idempotency key and updated it instead of adding a row. Every
     * write succeeded; the volumes were still wrong. Since every layout threshold in
     * tests/measure-layout.mjs is calibrated against these volumes, a fixture that cannot notice that is a
     * fixture that changes the meaning of every number downstream without saying so.
     */
    const db = await sqlDirect();
    const [got] = await db`
        select
            (select count(*)::int from tasks     where status = 'open')     as open_tasks,
            (select count(*)::int from tasks     where status = 'done')     as done_tasks,
            (select count(*)::int from questions where status = 'open')     as open_questions,
            (select count(*)::int from questions where status = 'answered') as answered_questions,
            (select count(*)::int from tasks
              where status = 'open' and project = ${P.big})                 as big_open
    `;
    const want = {
        open_tasks: WRITE_TASKS.length, done_tasks: WRITE_DONE.length,
        open_questions: WRITE_QUESTIONS.length, answered_questions: ANSWERED.length,
        big_open: WRITE_TASKS.filter(t => t.project === P.big).length,
    };
    const wrong = Object.entries(want).filter(([k, v]) => Number(got[k]) !== v);
    if (wrong.length) {
        console.error(
            '\nThe fixture is not what it claims to be. Most likely two entries share a `key` in the same\n' +
            'project, so one silently updated the other instead of adding a row:\n' +
            wrong.map(([k, v]) => `  ${k}: expected ${v}, the database holds ${got[k]}`).join('\n') + '\n',
        );
        process.exitCode = 1;
    }

    /*
     * ==================================================================================================
     * PRESENCE AND SPEND, so `/agents` has something reproducible to be.
     * ==================================================================================================
     *
     * WHY THE FIXTURE HAS TO DO THIS. `/agents` is a real page now, and until this existed the only way to see
     * it with anything on it was to plant rows by hand — which is precisely how §XXX's committed screenshots
     * came to be of a data state nobody could reproduce, and how §XXVIII's images came to be of a fixture that
     * no longer existed. A page the fixture cannot produce is a page that gets screenshotted once, from
     * whatever happened to be in the database, and never compared to anything again.
     *
     * FOUR PROJECTS, FOUR DIFFERENT STATES, deliberately — one of each of the interesting ones:
     *
     *   harbour-lights  WORKING   an open session beating two minutes ago
     *   nine-panels     IDLE      ran and finished eight minutes ago
     *   cold-brew       OPEN      opened three hours ago, never signed off
     *   tuck-shop       QUIET     a sync eleven days ago and nothing since — the state the brief is about
     *
     * The fifth state, `never`, is the absence of a row, so it is not produced here: it is what the unstarted
     * fixture shows for every project. Check A3 in `prove:use` plants all five itself, because a check that
     * depends on the fixture happening to contain its subject is a check that goes quiet when the fixture moves.
     *
     * SPEND IS DELIBERATELY UNEVEN across three models, because a per-project figure that is the same
     * everywhere would flatter the layout — the same reason the slug lengths above are realistic.
     */
    if (!CLEAR) {
        const db = await sqlDirect();
        const agoMin = n => new Date(Date.now() - n * 60_000).toISOString();
        const beat = async (project, agent, session, kind, startedMin, seenMin, endedMin, reason, branch, model) => {
            await db`
                insert into presence (project, agent, session, kind, started_at, last_seen_at, ended_at,
                                      end_reason, branch, model)
                values (${project}, ${agent}, ${session}, ${kind}, ${agoMin(startedMin)}, ${agoMin(seenMin)},
                        ${endedMin == null ? null : agoMin(endedMin)}, ${reason}, ${branch}, ${model})
                on conflict (project, agent, session) do nothing`;
        };
        await beat(P.big, 'claude-code', 'fixture-working', 'session', 25, 2, null, null, 'master', 'claude-opus-5');
        await beat(P.b, 'claude-code', 'fixture-idle', 'session', 70, 8, 8, 'clear', 'main', 'claude-opus-5');
        await beat(P.c, 'codex', 'fixture-open', 'session', 190, 190, null, null, 'spike/pricing', 'claude-opus-4-8');
        await beat(P.a, 'cursor', 'sync', 'sync', 60 * 24 * 11, 60 * 24 * 11, null, null, null, null);

        const spend = async (project, model, i, o, cw1h, cr, n) => {
            await db`
                insert into spend (source, project, model, input_tokens, output_tokens, cache_write_5m,
                                   cache_write_1h, cache_read, samples, measured_at)
                values ('fixture', ${project}, ${model}, ${i}, ${o}, 0, ${cw1h}, ${cr}, ${n}, now())
                on conflict (source, project, model) do nothing`;
        };
        await spend(P.big, 'claude-opus-5', 41_000, 1_240_000, 6_100_000, 210_000_000, 4708);
        await spend(P.big, 'claude-opus-4-8', 8_000, 190_000, 900_000, 32_000_000, 812);
        await spend(P.c, 'claude-fable-5', 3_000, 88_000, 400_000, 9_000_000, 260);
        await spend(P.b, 'claude-opus-5', 900, 12_000, 60_000, 1_400_000, 44);
        await spend(P.a, 'claude-opus-5', 400, 5_000, 20_000, 600_000, 19);
    }

    const liveProjects = new Set(WRITE_TASKS.map(t => t.project)).size;
    console.log(
        (CLEARED
            ? 'Nothing open, on purpose. This is the EARNED empty hub: the queue is at zero and the record\n' +
              'is not, which is the state hard constraint 6 calls success and the state a streak would call\n' +
              'a failure (docs/RESEARCH.md §18).\n'
            : LIVE
                ? `${tasks} open tasks across ${liveProjects} projects, and ZERO open decisions — ` +
                  'production\'s measured shape.\n' +
                  `  ${WRITE_TASKS.filter(t => !t.blocked_reason).length} actionable, ` +
                  `${WRITE_TASKS.filter(t => t.blocked_reason).length} blocked\n` +
                  '  The decisions region is absent, which is the state his hub is always in and the one\n' +
                  '  nothing has ever been measured against (docs/RESEARCH.md §26).\n'
                : `${tasks}/${TASKS.length} open tasks and ${questions}/${QUESTIONS.length} open questions ` +
                  `loaded across ${SLUGS.length} projects.\n` +
                  `  ${P.big}: ${TASKS.filter(t => t.project === P.big).length} tasks ` +
                  `(one blocked, one with ${NINETEEN.length} steps)\n` +
                  `  ${P.a} / ${P.b} / ${P.c}: 2 each\n` +
                  `  one decision with 4 options and a 12-hour default\n`) +
        `${done}/${WRITE_DONE.length} finished tasks and ${answered}/${ANSWERED.length} answered ` +
        `decisions, back-dated over ${LIVE ? 'about a day' : '8 days'}.\n` +
        (LIVE
            ? '  Production holds 5 answered decisions; this holds 2. See the --live comment for why.\n'
            : '  two of the finished tasks have no `why`, and one has no estimate\n') +
        `\nOpen ${BASE}/api/enter?k=<CC_WEB_TOKEN> and look at it.\n`,
    );
    if (tasks !== WRITE_TASKS.length || questions !== WRITE_QUESTIONS.length ||
        done !== WRITE_DONE.length || answered !== ANSWERED.length) {
        process.exitCode = 1;
    }
}
