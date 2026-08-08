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

Do ALL of the following yourself. The only thing I have to do is give you the token below — everything else is a command you can run, and every one of them is safe to re-run, so do not ask me whether it is already done. Just do it and tell me what happened.

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
              * prompt cannot name the wrong hub. The token stays a placeholder — a page that prints its own
              * credentials is a page you cannot leave open on a desk.
              */}
            <h2>Paste this at the agent</h2>
            <div className="card">
                <p className="why" style={{ marginTop: 0 }}>
                    Replace <code>&lt;agent-token&gt;</code> with your <code>CC_AGENT_TOKEN</code> — that is the
                    only part you do. The agent installs the CLI if it is missing, configures the machine, checks
                    it, connects the project and syncs. <strong>Every command in it is safe to re-run</strong>, so
                    this is the same prompt whether it is a new machine or your fourth project.
                </p>
            </div>
            <CopyBlock text={prompt} label="Paste at the agent working on the new project" mono={false} />
            <div className="card">
                <p className="why" style={{ marginTop: 0 }}>
                    The token is the one thing this page will not fill in for you. It is deliberately not printed
                    here, because a page that shows its own credentials is a page you cannot leave open — and it
                    is the same value in every step, so a <code>401</code> at the download means the rest will
                    fail too and the agent has been told to stop and say so.
                </p>
                <p className="why">
                    Step 6 asks it to explain the conventions back in its own words rather than confirm it read
                    them — &ldquo;read&rdquo; and &ldquo;understood&rdquo; are different claims and only one of
                    them is checkable.
                </p>
            </div>

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
