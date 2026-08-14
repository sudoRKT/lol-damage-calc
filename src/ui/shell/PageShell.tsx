// THE PAGE FRAME every page on the site is built in.
//
// One component, so the masthead, the landmarks and the footer cannot drift apart across eight
// separately-built pages. That is the whole reason it exists: a multi-page site whose header is
// copied into eight HTML files is a site with eight slightly different headers by the third
// patch.
//
// LANDMARKS. A `<header>`, a `<main>` and a `<footer>` per page, with `<main>` carrying the
// page's own heading. A skip link is the first focusable thing in the document, because on the
// calculator the navigation sits in front of a page with several hundred controls.
//
// THE NAVIGATION IS NOT HERE YET. It lands in its own commit. `current` is already threaded
// through so the nav can mark the page a reader is on without this file changing again.

import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { pageById } from './pages';
// The three faces DESIGN.md §3 chooses. Imported HERE, not in each of the eight page entries:
// every page renders this component, so one import puts the real faces on every page and cannot
// be forgotten on the ninth.
import '../fonts.css';
import '../tokens.css';
import './shell.css';

export interface PageShellProps {
  /** Which of `SITE_PAGES` this is. Throws for an id the list does not carry. */
  current: string;
  /**
   * The page's own visible heading. Defaults to the page's title from the list, but a page whose
   * `<title>` needs to be long for a browser tab can print something shorter on screen.
   */
  heading?: string;
  /** Sits under the heading, in the masthead. */
  standfirst?: string;
  /**
   * Drop the reading-width clamp. The calculator is an instrument and wants the whole screen
   * (DESIGN.md §7a sizes its top row against the ad rails); every other page is prose and is
   * clamped to `--measure-reading-max`.
   */
  wide?: boolean;
  /** Hide the masthead entirely — the calculator prints its own matchup header. */
  bareMasthead?: boolean;
  children: ReactNode;
}

export function PageShell({
  current,
  heading,
  standfirst,
  wide = false,
  bareMasthead = false,
  children,
}: PageShellProps) {
  const page = pageById(current);

  return (
    <div className="shell">
      <a className="shell__skip" href="#main">
        Skip to the main content
      </a>

      <header className="shell__head">
        <a className="shell__wordmark" href="/">
          <span className="shell__wordmark-name">Bench Test</span>
          <span className="shell__wordmark-sub">League of Legends damage calculator</span>
        </a>
      </header>

      <main className={wide ? 'shell__main shell__main--wide' : 'shell__main'} id="main">
        {bareMasthead ? null : (
          <div className="shell__masthead">
            <h1 className="shell__title">{heading ?? page.title}</h1>
            {standfirst ? <p className="shell__standfirst">{standfirst}</p> : null}
          </div>
        )}
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
