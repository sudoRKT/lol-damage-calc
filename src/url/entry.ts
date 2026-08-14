// WHERE A URL BELONGS — the one rule that keeps a shared scenario out of the landing page.
//
// ═══ THE PROBLEM THIS SOLVES ═══
//
// The site is a set of real pages: `/` is the landing page and `/calculator/` is the tool
// (SPECIFICATION §12 makes a shared link the primary way scenarios are distributed). But the
// scenario lives in the URL FRAGMENT — `https://site/#s=…` — because a fragment is never sent to
// a server (FORMAT.md §2). A fragment carries no path with it, so a link shared before the site
// had pages, or shortened by a client that dropped the path, arrives at the ROOT.
//
// Landing on the landing page with a scenario in your pocket is the one outcome that must not
// happen: the reader asked for a specific matchup and got a front door.
//
// ═══ WHY IT IS A PURE FUNCTION AND NOT AN INLINE SCRIPT ═══
//
// The obvious implementation is three lines of JavaScript inside `index.html`. Three lines inside
// an HTML file are three lines no test ever runs. This is the same logic as a function of one
// string, so `entry.test.ts` can put every shape of link through it — including a real encoded
// scenario — and `../../index.html` merely calls it.
//
// It is deliberately NOT a decode. Deciding where a URL belongs must not depend on the link being
// valid: a damaged scenario link still belongs to the calculator, which is the only page that can
// explain what is wrong with it. This function asks one question — does this URL carry a scenario
// fragment at all — and the calculator does the rest.

import { FRAGMENT_KEY } from './index';

/** Where the calculator lives. One place, so a move is one edit. */
export const CALCULATOR_PATH = '/calculator/';

/**
 * Does this URL carry a scenario fragment?
 *
 * TRUE for `#s=…` and for `#a=1&s=…`; FALSE for no fragment, an empty fragment, `#s=` with
 * nothing after it, and for a fragment that happens to contain "s=" inside another value.
 */
export function carriesScenario(href: string): boolean {
  const hashAt = href.indexOf('#');
  if (hashAt === -1) return false;
  const fragment = href.slice(hashAt + 1);
  if (fragment === '') return false;
  return fragment
    .split('&')
    .some((part) => part.startsWith(`${FRAGMENT_KEY}=`) && part.length > FRAGMENT_KEY.length + 1);
}

/**
 * The URL this one should be replaced with, or `null` to stay where it is.
 *
 * Returns null when the URL carries no scenario, and null when it is ALREADY on the calculator —
 * without that second check a scenario link would replace itself forever.
 *
 * The query string and the fragment are carried across unchanged. The fragment especially: it is
 * the scenario, and rewriting it by so much as a character is the failure this whole area exists
 * to prevent.
 */
export function calculatorRedirectFor(href: string, calculatorPath = CALCULATOR_PATH): string | null {
  if (!carriesScenario(href)) return null;
  const url = new URL(href);
  if (url.pathname === calculatorPath) return null;
  url.pathname = calculatorPath;
  return url.toString();
}

// ═══ IT MUST RUN TWICE, AND THE SECOND TIME IS NOT BELT AND BRACES ═══
//
// Found in a real browser on 2026-08-14, while verifying the very constraint it exists to
// satisfy — and after the first version had already been committed.
//
// A module runs once per DOCUMENT load. Changing only the fragment of the current URL is a
// SAME-DOCUMENT navigation: the browser fires `hashchange` and loads nothing. So a reader
// already sitting on the landing page who pastes a shared link into the address bar, or follows
// one that points at `/#s=…`, changes the fragment and stays exactly where they are — on the
// front page, holding a scenario, with the redirect module long since finished.
//
// Opening a shared link cold works either way, which is what made this easy to miss: the first
// verification navigated from /calculator/ to /#s=…, a DIFFERENT document, and passed.

/** The narrow slice of `window` this needs — so a test can hand it a fake and watch. */
export interface RedirectTarget {
  location: { href: string; replace: (url: string) => void };
  addEventListener: (type: 'hashchange', listener: () => void) => void;
}

/**
 * Move to the calculator now if this URL carries a scenario, and again whenever the fragment
 * changes without a page load. Returns whether it moved on the first check.
 *
 * `location.replace`, not an assignment to `href`: the landing page must not end up in the
 * reader's back history, or Back from the calculator would bounce them straight forward again.
 */
export function installScenarioRedirect(target: RedirectTarget): boolean {
  const move = (): boolean => {
    const destination = calculatorRedirectFor(target.location.href);
    if (!destination) return false;
    target.location.replace(destination);
    return true;
  };
  // Registered BEFORE the first check, and unconditionally. If the listener were only attached
  // in the "did not move" branch, a reader who arrived with one scenario and pasted another
  // would be stranded on the second.
  target.addEventListener('hashchange', () => {
    move();
  });
  return move();
}
