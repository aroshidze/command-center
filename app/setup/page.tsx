import { headers } from 'next/headers';
import { hasWebSession } from '../../lib/auth';
import { projectColor } from '../../lib/colour';
import { agentsSnippet } from '../../lib/snippet';
import { projects } from '../../lib/store';
import CopyBlock from '../components/CopyBlock';
import Nav from '../components/Nav';

export const dynamic = 'force-dynamic';

/**
 * "How do I add a project?" — answered on the hub, not in a document you have to go and find.
 *
 * THE RULE THAT KEEPS THIS FROM ROTTING: everything on this page is GENERATED at render time from live
 * configuration and live data. The hub URL comes from the request, the project list comes from the event
 * log, the install path comes from an environment variable. Nothing here is a stored copy of the docs.
 *
 * That distinction is the whole reason this page is allowed to exist. docs/RESEARCH.md §7 identifies a
 * drifting duplicate as the fastest way to lose trust in a tool — and the ban on putting documentation in
 * the hub was about exactly that. A page computed from the truth cannot drift from it; a page that copies
 * the truth will. So: add sections here freely, but compute them. Never paste.
 */
export default async function SetupPage() {
    if (!(await hasWebSession())) {
        return (
            <div className="locked">
                <h1>Command Center</h1>
                <p style={{ marginTop: 12 }}>This device is not signed in.</p>
            </div>
        );
    }

    /*
     * THE HUB URL COMES FROM THE REQUEST, which is what this file's header has always claimed and what the
     * code did not do. It read `CC_PUBLIC_URL` with one specific deployment's URL as the fallback — so on any
     * other install, a page whose whole promise is "generated from live config, it cannot go stale" printed
     * somebody else's hub address into the commands you are meant to paste.
     *
     * The request is strictly better than the variable: it is correct on every deployment with no
     * configuration at all, it is right on a preview URL and on a custom domain, and it cannot be forgotten.
     * `CC_PUBLIC_URL` stays as an override only, because it is the canonical alias when several resolve to the
     * same deployment (docs/ENVIRONMENT.md records two), and Telegram's links already use it.
     */
    const h = await headers();
    const host = h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const hub = (process.env.CC_PUBLIC_URL || (host ? `${proto}://${host}` : '')).replace(/\/+$/, '');

    /*
     * Where this repository is checked out, for the once-per-machine installer command. No fallback: naming
     * one machine's layout here is how the bulk command below ended up hardcoding a folder that exists on
     * exactly one computer. If the variable is absent the page says which variable to set, which is a useful
     * sentence, where a wrong absolute path is a command that fails somewhere else.
     */
    const repo = process.env.CC_REPO_PATH || null;

    /*
     * ==================================================================================================
     * THE TOKEN, FILLED IN FOR YOU — and this reverses a decision that was wrong twice over.
     * ==================================================================================================
     *
     * This page used to print `<agent-token>` and say *"that is the only part you do"*, with a paragraph
     * explaining that it would not show the value because *"a page that shows its own credentials is a page
     * you cannot leave open on a desk"*.
     *
     * Then the owner asked what a CC_AGENT_TOKEN even is. My first fix was to explain it — "a password you
     * invented" — and that was WORSE, and he said so: *"what do you mean a password I invented? I never
     * invented shit and I never done that shit... if I'm confused, I assure you, non-technical users will be
     * driven crazy."* He is right on the facts. He never generated it; an AGENT did, following
     * docs/SETUP.md, while deploying his hub. A page that tells you to remember doing something you never
     * did is worse than a page that says nothing.
     *
     * The lesson is not about wording. **A step that requires knowing a secret you have never seen is a
     * step the page should not be asking a human to perform.** So it does not: the copy button substitutes
     * the real token, and the label says it has.
     *
     * AND THEN IT WAS PRINTED ON SCREEN TOO, which is the third and final version of this. The clever
     * arrangement — show `<agent-token>`, copy the real value — was still wrong, and he found it in one
     * look: *"the fucking token is still there and things got even more confusing."*
     *
     * Of course it was. A placeholder ON SCREEN is a job on screen. A reader's eye stops at
     * `<agent-token>`, decides there is something to fill in, and starts hunting for it — and the fact that
     * the clipboard would have handled it is invisible, so the cleverness bought nothing and cost a reader
     * their bearings. **If the value has to end up in the prompt, print the prompt with the value in it.**
     *
     * WHAT THAT COSTS, measured rather than assumed. The token was already in this page's payload when it
     * was only being copied — `curl /setup | grep -o "$CC_AGENT_TOKEN" | wc -l` returned 3 — because
     * `copyText` was a client prop. So rendering it moves the value from the payload to the screen and
     * nowhere new.
     *
     * The screen is a real exposure the payload was not: somebody standing behind you, or a shared call.
     * That is the risk the original rule was about and it is now accepted, deliberately, because the
     * alternative was measured against a real person and failed. Everything else is unchanged: to see this
     * page at all you must already hold `CC_WEB_TOKEN`, which is the MORE powerful credential — with the
     * relay on it can approve tool calls — so no attacker gains anything here they did not already have.
     *
     * ABSENT IS HANDLED, because a self-hosted hub with the variable unset must not silently copy the word
     * "undefined" into somebody's setup prompt. `null` here, and the page says the placeholder is genuinely
     * all it has.
     */
    const agentToken = (process.env.CC_AGENT_TOKEN || '').trim() || null;
    /*
     * The parent of the hub repo is the projects folder — derived, not named. It is his layout
     * (`<parent>/TheCommandCenter` beside `<parent>/EveryOtherProject`) and a reasonable guess anywhere, and
     * unlike the constant it replaces it is at least a real path on the machine reading the page.
     */
    const projectsDir = repo ? repo.replace(/[\\/][^\\/]+[\\/]*$/, '') : null;

    let list: Awaited<ReturnType<typeof projects>> = [];
    let dbError: string | null = null;
    try {
        list = await projects();
    } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
    }

    /*
     * ONE PROMPT. THE ONLY THING THAT NEEDS THE HUMAN IS THE TOKEN.
     *
     * This page used to open with a "First time on this machine?" section handing him three shell commands to run
     * — and then a prompt whose own first line says *"do all of this yourself — do not hand any of it back to
     * me"*. The page contradicted the prompt it was serving, and it was his complaint:
     *
     *     "The only thing that actually needs me is the token; the curl, cc setup, cc health, cc onboard and
     *      cc sync are all things the agent can run."
     *
     * He is right, and the reason it collapses into one block is a property of the commands rather than a
     * simplification: `cc setup` overwrites its config file, `cc onboard` replaces the block between its markers,
     * and `health` and `sync` are reads. **All four are safe to re-run**, so the same prompt is correct on a bare
     * machine and on the fourth project of the day. There is nothing for a "first time" section to do.
     *
     * NO `~` IN ANY PATH THE AGENT IS TOLD TO PASS TO A SHELL. See getCliCmd below — the tilde is why the
     * previous version of this page shipped a first instruction that failed on Windows. The prompt states the
     * target directory and tells the agent to expand the home directory using its own platform's syntax, which
     * is the one instruction that is correct everywhere.
     */
    const prompt = `Connect this project to my Command Center and then get on with the work. It is a hub I use across all my projects for anything that needs me personally, and for decisions you are blocked on.

Do ALL of the following yourself. Everything you need is in this message, including the token — there is nothing for me to look up, so do not ask me for anything. Every command below is safe to re-run, so do not ask me whether it is already done either. Just do it and tell me what happened.

MY HUB:    ${hub}
MY TOKEN:  <agent-token>

1. Make sure the CLI is on this machine. It goes in a ".command-center" folder inside my home directory, as "cc.mjs".

   Check whether it is already there. If it is not, download it from the hub — the hub serves it:

     ${hub}/api/agent/cc.mjs

   sending the header "Authorization: Bearer <agent-token>". Create the folder first if it does not exist.

   IMPORTANT: never write a literal "~" into a command. A tilde is expanded by the shell, and PowerShell does not expand it inside an argument — so on Windows both "curl -o ~/..." and "node ~/.command-center/cc.mjs" fail, the first with error 23 having created nothing. Use "$HOME/.command-center/cc.mjs" in quotes: that works in bash, zsh, Git Bash AND PowerShell, because PowerShell has an automatic $HOME and Windows accepts forward slashes. If a 401 comes back, the token above is wrong — stop and tell me, because nothing after this will work.

2. Point this machine at my hub. Once per machine, and harmless to repeat:

     node <that cc.mjs path> setup ${hub} <agent-token>

3. Confirm it works:

     node <that cc.mjs path> health

   Every line must be a tick. Telegram may report suppressed or not configured — that one is fine and does not stop anything.

4. Connect this project, from the project root:

     node <that cc.mjs path> onboard

   It works out the project slug from the folder name, fetches the current instructions from my hub, writes a Command Center section into this project's AGENTS.md, and adds a one-line pointer to CLAUDE.md or GEMINI.md if those already exist. Safe to re-run — it replaces the block between its markers rather than appending.

5. Then sync:

     node <that cc.mjs path> sync

   Check the project scope it prints is right. Run it at the start of every session from now on — AND AGAIN DURING THE SESSION. I tick things off away from my desk and the hub is the only way I can tell you, so sync before you tell me you are blocked on me, before you start work that depends on a task you filed, after anything that took real time, and before your closing summary. If the response says "more": true there is another page of history — sync again straight away, and keep going until it is false.

6. Read the Command Center section it just wrote into AGENTS.md — that is the full field reference. Then tell me back, in your own words: what you will use "cc task" for versus "cc ask", what default_option does, and what you will say to me differently depending on whether a filed task reports notified true or false. I want to know you understood it, not that you read it.

7. Then get on with the actual work. From here: anything needing my account, my card, my phone or my physical presence becomes a "cc task" with a required verify line. Anything you are blocked on becomes a "cc ask" with 2-4 options plus default_option and hours, so you are never stuck waiting for me. Never write task lists into chat — they scroll away. Never put a secret in a task; the hub refuses credential-shaped values by rule, so say where the value lives instead.`;

    /*
     * THE PROMPT WITH THE TOKEN ALREADY IN IT, which is the only version anybody sees.
     *
     * `prompt` keeps the placeholder because the raw-commands disclosure further down shares the same
     * substitution and because a hub with no token set must still print something honest. Everything a
     * reader touches uses this one.
     */
    const filledPrompt = agentToken
        ? prompt.split('<agent-token>').join(agentToken)
        : prompt;

    /* 'your-project' rather than a real slug: this block is the generic text, and pointing it at one of his
     * projects would read as instructions for that project specifically. cc onboard substitutes the real one. */
    const snippet = agentsSnippet('your-project');
    const snippetLines = snippet.split(/\n/).length;

    /*
     * THE RAW COMMANDS, AND WHY THERE ARE TWO SETS.
     *
     * `~` IS NOT PORTABLE AND THIS PAGE SHIPPED IT AS STEP ONE. Measured on his machine:
     *
     *     curl.exe -fsSL … -o ~/.command-center/cc.mjs
     *     curl: (23) client returned ERROR on write of 16384 bytes        <- exit 23, nothing written
     *
     * `curl.exe` does not expand `~` — the SHELL does, and PowerShell does not do it inside an argument like
     * that. So curl tried to write to a directory literally named `~` and failed on the first buffer flush. The
     * same line works in Git Bash, which is how it got written and "verified": the route was checked with
     * PowerShell's own `Invoke-WebRequest` and with `curl` under Git Bash, and never with the exact string the
     * page printed on the platform the page's only reader uses.
     *
     * Both forms are given, each labelled with its shell, and `$HOME` / `$env:USERPROFILE` rather than a tilde.
     * The prompt above sidesteps the problem entirely by naming the directory and letting the agent expand it.
     */
    const bashCmds =
        `mkdir -p "$HOME/.command-center"\n` +
        `curl -fsSL -H "Authorization: Bearer <agent-token>" \\\n` +
        `  ${hub}/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"\n\n` +
        `node "$HOME/.command-center/cc.mjs" setup ${hub} <agent-token>\n` +
        `node "$HOME/.command-center/cc.mjs" health\n` +
        `node "$HOME/.command-center/cc.mjs" onboard   # from the project folder\n` +
        `node "$HOME/.command-center/cc.mjs" sync`;

    /*
     * The PowerShell block uses THE SAME `"$HOME"` PATHS as the bash one, deliberately.
     *
     * PowerShell has an automatic `$HOME` and Windows accepts forward slashes, both verified — so the only real
     * differences between the two blocks are the folder-creation line and the line-continuation character.
     * `$env:USERPROFILE` also works and is what a Windows-first instinct reaches for; using it would have made
     * the two blocks look unrelated and doubled what a reader has to keep straight for no benefit.
     */
    const psCmds =
        `New-Item -ItemType Directory -Force "$HOME/.command-center" | Out-Null\n` +
        `curl.exe -fsSL -H "Authorization: Bearer <agent-token>" \`\n` +
        `  ${hub}/api/agent/cc.mjs -o "$HOME/.command-center/cc.mjs"\n\n` +
        `node "$HOME/.command-center/cc.mjs" setup ${hub} <agent-token>\n` +
        `node "$HOME/.command-center/cc.mjs" health\n` +
        `node "$HOME/.command-center/cc.mjs" onboard   # from the project folder\n` +
        `node "$HOME/.command-center/cc.mjs" sync`;

    /* Only offered when CC_REPO_PATH says where the repo is; otherwise the page says which variable to set
     * instead of printing a path that exists on one machine. */
    const bootstrapCmd = repo
        ? `node ${repo}/scripts/install-into-project.mjs --all "${projectsDir}"`
        : null;

    return (
        <div className="wrap">
            {/* The same bar as every other page. This one matters most: /setup is the first thing a new person
                needs and it used to be a text link at the bottom of a scrolling column. See Nav.tsx. */}
            <Nav here="setup" />
            <header>
                <div className="top">
                    <h1>Adding a project</h1>
                </div>
                <div className="summary">
                    <span>
                        Everything on this page is generated from live config, so it cannot go stale.
                    </span>
                </div>
            </header>

            {/*
              * ==================================================================================================
              * ONE PROMPT, AND IT IS THE WHOLE PAGE. The history of this section is worth keeping.
              * ==================================================================================================
              *
              * v1 opened with `cc onboard`, which needs the CLI already installed — the second-project prompt
              * presented as the first, with the step that puts the CLI there two headings down under a card
              * headed "If you would rather do it yourself", which reads as optional and is not.
              *
              * v2 added a "First time on this machine?" section above the prompt with three shell commands in it.
              * That fixed the ordering and introduced a worse problem, which he named:
              *
              *     "The setup page is overcomplicated and it breaks its own rule. Its prompt says 'do all of this
              *      yourself — do not hand any of it back to me', and the section above it hands me three shell
              *      commands. The only thing that actually needs me is the token."
              *
              * The page was contradicting the prompt it served. v3 is one copy block.
              *
              * WHY ONE BLOCK IS CORRECT RATHER THAN JUST SHORTER: `cc setup` overwrites its config, `cc onboard`
              * replaces the block between its markers, and `health` and `sync` are reads. All of them are safe to
              * re-run — so the same prompt is right on a bare machine AND on his fourth project of the day, and a
              * "first time" section has nothing left to do. That is a property of the CLI, not a simplification
              * of the instructions.
              *
              * COMPUTED, NOT PASTED, which is this file's header rule: the hub URL comes from the request, so the
              * prompt cannot name the wrong hub. The token is substituted for the same reason — see `agentToken`
              * above for the three attempts that took.
              *
              * ==================================================================================================
              * v4 DELETED THE EXPLANATION RATHER THAN REWRITING IT A FOURTH TIME.
              * ==================================================================================================
              *
              * Three versions of a paragraph about the token were tried here. The first did not define it, the
              * second told him he had invented it himself, the third defined it correctly in one sentence. His
              * verdict on the third: *"even the explanation is confusing, everything is confusing. the user won't
              * understand anything. why can't it be just copy and paste."*
              *
              * He is right, and it was my mistake three times because I kept treating a WORDING problem as the
              * thing to fix. There is nothing for a reader to DO with that token — so a paragraph about it is not
              * clarification, it is a paragraph implying a decision exists in the one place on this page where
              * none does. Two sentences: what to do, and that re-running is safe. Everything else that stood here
              * was deleted rather than reworded.
              */}
            {/* NO SECOND HEADING. The `h1` above already says "Adding a project"; an `h2` saying "Add a
                project" 60px under it was two headings for one thing, which is the shape this page keeps
                growing and the reason it read as overcomplicated. */}
            <div className="card">
                {/*
                  * "SAME PROMPT EVERY TIME" IS THE SENTENCE, and it is here because he asked the question it
                  * answers: *"this needs to be set up for every project, right? … We need two prompts: one
                  * for the initial first setup, a lighter prompt for every next project. Or am I missing
                  * something?"*
                  *
                  * A reasonable thing to expect, and the honest answer is that the SECOND project is already
                  * lighter — the agent skips what is done — but that the lightness is a property of the CLI
                  * rather than of a shorter prompt. Two prompts is also a version this page already had and
                  * he already rejected: v2 carried a "First time on this machine?" block and his verdict was
                  * *"the setup page is overcomplicated and it breaks its own rule."*
                  *
                  * So one prompt, and one clause saying what it does differently the second time — because
                  * he had to ask, which means the page was not saying it.
                  */}
                <p className="why" style={{ marginTop: 0 }}>
                    Copy this and paste it at the agent working in the project folder.{' '}
                    <strong>That is the whole thing.</strong> It connects the project and tells you what
                    happened. <strong>Same prompt every time</strong> — on a new machine it installs the CLI
                    first; on your fourth project it finds that already done and skips straight to connecting.
                </p>
            </div>
            {/*
              * THE RECOVERY PATH, behind a disclosure — reachable, and out of the reading path, because it
              * is now only needed by somebody whose hub has no token set at all. That is the one case the
              * copy button cannot rescue, and the label above says so when it happens.
              *
              * Rotating is not free and the consequence is stated rather than discovered: every machine
              * already configured holds the OLD value in ~/.command-center/config.json, so each one needs
              * `cc setup` again. Leaving that out would turn a two-minute fix into an afternoon of agents
              * failing with 401 against a hub that looks healthy.
              *
              * RENDERED ONLY WHEN THE TOKEN IS MISSING, and that conditional is the point. It sat above the
              * copy block, permanently, telling everybody about a failure mode that cannot happen on a hub
              * whose token is set — which is every working hub. A disclosure is still a line of text on
              * screen; offering a remedy for a problem the reader does not have is how a page becomes noise.
              */}
            {!agentToken && (
            <details className="card">
                <summary>The prompt still says &lt;agent-token&gt;, or an agent got a 401</summary>
                <p className="why">
                    That means this hub has no <code>CC_AGENT_TOKEN</code> set, or the one it has is not the
                    one that machine was configured with. Either way you do not recover the old value —
                    hosting providers let a variable be marked sensitive, which means it can be set and never
                    read back. You replace it. Generate a new one:
                </p>
                <CopyBlock
                    text={'node -e "console.log(require(\'crypto\')'
                        + '.randomBytes(32).toString(\'base64url\'))"'}
                    label="anywhere with node installed"
                />
                <p className="why">
                    Set that as <code>CC_AGENT_TOKEN</code>, redeploy, and use the new value below.{' '}
                    <strong>One consequence, worth knowing before you do it:</strong> every machine you have
                    already set up holds the old value in{' '}
                    <code>~/.command-center/config.json</code>, so each of those needs{' '}
                    <code>cc setup</code> run again with the new token. Until then those agents get a{' '}
                    <code>401</code> from a hub that is otherwise perfectly healthy.
                </p>
                <p className="why">
                    It must be at least 24 characters, or the hub treats it as unset and refuses every agent
                    request rather than accepting a weak one. And keep it different from{' '}
                    <code>CC_WEB_TOKEN</code>, which is the separate value that unlocks this page — three
                    callers, three credentials, so any one can be rotated without disturbing the others.
                </p>
            </details>
            )}
            {/* THE PROMPT, WITH THE TOKEN IN IT — see `agentToken` above for the three attempts that took.
                The label drops the word "copy" entirely: the block has a copy button in its own corner, and
                a label telling you to press the button next to it is a caption on a caption. */}
            <CopyBlock
                text={filledPrompt}
                label={agentToken
                    ? 'Paste this at the agent working on the new project'
                    : 'Paste at the agent — but CC_AGENT_TOKEN is not set on this hub, so fill it in first'}
                mono={false}
            />
            {/*
              * A CARD WAS DELETED HERE, and it was worse than clutter — it was a contradiction on screen.
              *
              * It read: *"The token is the one thing this page will not fill in for you. It is deliberately not
              * printed here, because a page that shows its own credentials is a page you cannot leave open."*
              * Directly beneath a prompt that now prints it. Rendering the page is what found this; nothing in
              * the diff of the block above it points at a paragraph three hundred lines away that describes the
              * old behaviour.
              *
              * The second half of that card explained why step 6 asks the agent to restate the conventions in
              * its own words. True, and it is reasoning about the prompt rather than an instruction to a
              * reader — so it belongs in the file that composes the prompt, and `prompt` above carries it.
              */}

            {/*
              * The raw commands, DELIBERATELY BEHIND A DISCLOSURE and deliberately in two flavours. See the
              * comment on `bashCmds`: the previous version of this page printed a `~` path as its first
              * instruction and that command fails with exit 23 under PowerShell, which is the platform this hub's
              * only user is on. Anything that goes to a shell from this page now names its shell.
              */}
            <details className="card">
                <summary>If you would rather run these yourself</summary>
                <p className="why">
                    Nothing here is different from what the prompt tells the agent to do. <code>onboard</code>{' '}
                    must run from the project folder; the rest can run anywhere. Add <code>--dry</code> to{' '}
                    <code>onboard</code> to see what it would change without writing.
                </p>
                <p className="why">
                    <strong>Note the <code>&quot;$HOME&quot;</code> rather than <code>~</code>.</strong> A tilde is
                    expanded by the shell, and PowerShell does not expand it inside an argument — so on Windows{' '}
                    <em>both</em> <code>curl -o ~/…</code> and <code>node ~/.command-center/cc.mjs</code> fail, the
                    first with <code>curl: (23)</code> having written nothing. Quoted{' '}
                    <code>&quot;$HOME&quot;</code> works in every shell here, which is why the two blocks below
                    differ only in how they make the folder.
                </p>
                <CopyBlock text={bashCmds} label="bash / zsh / Git Bash" />
                <CopyBlock text={psCmds} label="PowerShell" />
            </details>

            {/*
              * WHAT AGENTS ACTUALLY GET, rendered from the source that serves it.
              *
              * The prompt above is the one thing on this page that is hand-written, which makes it the one
              * thing that can drift — and it did: three features shipped (task notifications, the paged sync
              * loop, and him being able to see whether a note was collected) without a word reaching the text
              * that gets written into every project's AGENTS.md. He had to point it out:
              *
              *     "never forget our setup page, if we have some features to be explain to the AI which will
              *      be setting up the project, we should always update the setup prompt."
              *
              * Two guards rather than a resolution to remember. `tests/prove.mjs` asserts the snippet names
              * every agent-facing behaviour, listed by field name, so adding one without documenting it fails
              * a check. And this block renders `agentsSnippet` itself — the exact bytes `/api/agent/snippet`
              * serves and `cc onboard` installs — so a gap is visible on the page rather than only in a suite.
              *
              * Inside a `details` because it is long and almost never the reason he opened this page. Computed,
              * not copied, which is the rule this page opens with and which the prompt above still breaks.
              */}
            <h2>What every project&apos;s AGENTS.md gets</h2>
            <details className="card">
                <summary>The instructions the hub serves, in full ({snippetLines} lines)</summary>
                <p className="why">
                    This is generated from <code>lib/snippet.ts</code> — the same bytes{' '}
                    <code>cc onboard</code> installs — so it cannot disagree with what agents are told. If a
                    feature is missing here, it is missing for them.
                </p>
                <CopyBlock text={snippet} label="Served at /api/agent/snippet" />
            </details>

            <h2>There is nothing to register</h2>
            <div className="card">
                <p className="why" style={{ marginTop: 0 }}>
                    A project exists in the hub the moment an agent writes a task or a question against its
                    slug. No create button, no settings, nothing to keep in sync — because a setup step is a
                    step to forget. The slug is the folder name, lowercased and hyphenated, and{' '}
                    <code>cc sync</code> infers the same value, so the two always agree.
                </p>
                <p className="why">
                    The instructions are served from here rather than copied from a file on one machine,
                    which is why one command works from any machine — including a cloud agent that has never
                    seen the hub repository.
                </p>
            </div>

            {/*
              * The bulk installer is the ONE thing left that needs the hub repository on the machine, so it is
              * the ONE thing that stays a command for him rather than an instruction for an agent — an agent in
              * some other project's folder has no reason to know where this repo is checked out.
              *
              * Offered only when `CC_REPO_PATH` says where that is. It used to name one specific folder as a
              * constant, so on any other install it printed a path that did not exist. The parent is derived from
              * the repo path rather than named: the hub sits beside the other projects, which is the only layout
              * it can honestly assume.
              *
              * Collapsed, because it is for the day you connect fifteen projects at once and never otherwise.
              */}
            <details className="card">
                <summary>Connecting every project under one folder at once</summary>
                {bootstrapCmd ? (
                    <>
                        <p className="why">
                            The only thing here that needs the hub repository checked out on this machine, which is
                            why it is a command rather than something the prompt asks an agent to do.
                        </p>
                        <CopyBlock text={bootstrapCmd} label="Bulk install. Needs the hub repo on this machine" />
                    </>
                ) : (
                    <p className="why">
                        There is a bulk installer for every project under one parent folder, but it needs the hub
                        repository on this machine and <code>CC_REPO_PATH</code> is not set, so this page cannot
                        tell you where it is. Set that variable to the checkout and the command appears here.
                    </p>
                )}
            </details>

            <h2>Projects the hub knows about</h2>
            {dbError ? (
                <div className="card">
                    <p className="why" style={{ marginTop: 0, color: 'var(--bad)' }}>
                        Could not read the project list, so this section is <strong>not</strong>{' '}
                        trustworthy: {dbError}
                    </p>
                </div>
            ) : list.length === 0 ? (
                <div className="empty">
                    <b>None yet.</b>
                    A project appears here the first time an agent writes to the hub for it.
                </div>
            ) : (
                list.map(p => (
                    <div key={p.slug} className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span className="pdot" style={{ background: projectColor(p.slug) }} />
                            <span className="pname">{p.slug}</span>
                            <span className="pmeta">
                                {p.open_questions > 0 && `${p.open_questions} waiting · `}
                                {p.open_tasks} open
                            </span>
                        </div>
                    </div>
                ))
            )}

            <h2>Reference</h2>
            <div className="card">
                <p className="why" style={{ marginTop: 0 }}>
                    Full field reference and conventions live in the repo, where they belong next to the
                    code they describe:{' '}
                    <code>AGENTS.md</code>, <code>docs/ADD-A-PROJECT.md</code>,{' '}
                    <code>docs/API.md</code> and <code>docs/ENVIRONMENT.md</code>. Deliberately not copied
                    here — a duplicate that drifts is worse than a link.
                </p>
                <p className="why">
                    Hub URL: <code>{hub}</code>
                </p>
            </div>
        </div>
    );
}
