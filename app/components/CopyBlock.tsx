'use client';

import { useState } from 'react';

/**
 * A block of text with a copy button that tells the truth about whether it copied.
 *
 * Used for the install command and the onboarding prompt on /setup. Both are long enough that copying by
 * hand on a phone is not realistic, so a copy that silently fails would leave you pasting whatever was on
 * the clipboard before — which on a phone is usually something else entirely.
 */
export default function CopyBlock({
    text, label, mono = true, copyText,
}: {
    text: string;
    label?: string;
    mono?: boolean;
    /**
     * WHAT GOES ON THE CLIPBOARD, WHEN IT IS NOT WHAT IS ON THE SCREEN.
     *
     * One use, and it is the whole reason this exists: `/setup` shows the onboarding prompt with
     * `<agent-token>` still in it and copies it with the real token substituted. That combination is the
     * only one that satisfies three things at once — a reader never has to know what the token is, the
     * page can still be left open or screen-shared without leaking it, and nobody is asked to hand-edit a
     * secret they have never seen.
     *
     * IT IS ONLY HONEST IF THE BUTTON SAYS SO, which is why `label` is not optional in that use and reads
     * "copy — your token is filled in". A copy button that silently put something different on the
     * clipboard from what the page displayed would be a small deception, and this file exists because of a
     * rule about not lying over the clipboard.
     */
    copyText?: string;
}) {
    const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');

    return (
        <div className="copyblock">
            <div className="copyblock-head">
                {label && <span className="copyblock-label">{label}</span>}
                <button
                    className="copy"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(copyText ?? text);
                            setState('ok');
                            setTimeout(() => setState('idle'), 2000);
                        } catch {
                            // Clipboard access is refused in plenty of situations. Saying so beats a green
                            // tick over an empty clipboard.
                            setState('fail');
                        }
                    }}
                >
                    {state === 'ok' ? 'copied' : state === 'fail' ? 'select it manually' : 'copy'}
                </button>
            </div>
            <pre className={mono ? 'copyblock-body mono' : 'copyblock-body'}>{text}</pre>
        </div>
    );
}
