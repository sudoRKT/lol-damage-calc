// @vitest-environment jsdom
//
// THE NAVIGATION, checked the way a keyboard and a screen reader meet it.
//
// A hamburger is the single most commonly broken control on the web, and it breaks in ways that
// look fine: a div that a keyboard cannot reach, a glyph with no name, a panel that a screen
// reader is told is collapsed while every link is on screen, and Escape leaving focus on an
// element that no longer exists. Each of those has its own test below.
//
// **jsdom implements `matchMedia` as always-false**, so without an override every test here would
// only ever see the hamburger and the desktop layout would be entirely unchecked while appearing
// to be covered. `inlineOverride` exists for that reason and for no other — it is the same
// starting-state trap recorded in DATA-SOURCES §50.5.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteNav } from './SiteNav';
import { SITE_PAGES } from './pages';

afterEach(cleanup);

const NAV_CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'nav.css'), 'utf8');
/** Comments stripped, so a rule quoted inside one can never satisfy an assertion about the code. */
const NAV_CODE = NAV_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
/** The `.nav__panel` rule that applies below the breakpoint — not the `.nav--inline` override. */
const COLLAPSED_PANEL_RULE = NAV_CODE.match(/\n\.nav__panel \{([\s\S]*?)\n\}/)?.[1] ?? '';
/** The `.nav` rule itself — not `.nav--inline …`, and not `.nav__toggle`. */
const NAV_RULE = NAV_CODE.match(/\n\.nav \{([\s\S]*?)\n\}/)?.[1] ?? '';

const IN_NAV = SITE_PAGES.filter((p) => p.inMainNav);
const menu = () => screen.getByRole('button', { name: /^(Menu|Close menu)$/ });

describe('nav/population', () => {
  it('offers every page marked for the main navigation, and the legal pages are not', () => {
    expect(IN_NAV.length).toBe(6);
    expect(SITE_PAGES.filter((p) => !p.inMainNav).map((p) => p.id)).toEqual(['privacy', 'cookies']);
  });
});

describe('nav/the open panel stays on the screen', () => {
  // ═══ TWO DEFECTS, ONE EACH WAY, AND THE SECOND WAS CAUSED BY THE FIX FOR THE FIRST ═══
  //
  // The panel is absolutely positioned inside `.nav`, whose containing block is only as wide as
  // the toggle. So the panel's anchor is only ever as good as WHERE THE TOGGLE IS — and until
  // 2026-08-16 the toggle changed ends of the header as the viewport crossed 446px, because
  // `.shell__head` is a WRAPPING flex row and `justify-content: space-between` does not reach a
  // line holding a single item.
  //
  // MEASURED IN A REAL BROWSER, 2026-08-15, on every one of the eight pages, with
  // `inset-inline-end: 0` and the toggle at the START of a wrapped header:
  //
  //   viewport 375 and 320 · panel 258px wide · panel box left **-114.6px**, right 143.4px
  //
  // 114.6px of a 258px menu — 44% of it — sat off the LEFT edge of the screen. "Home",
  // "Calculator", "Changelog" and "About" were entirely invisible; "How the numbers are
  // checked" read as "…ers are checked". THE PART THAT MAKES IT INVISIBLE TO EVERY OTHER CHECK:
  // overflow to the LEFT creates no scrollable area. `body.scrollWidth` stayed 320,
  // `documentElement.scrollWidth` stayed 320, and `window.scrollTo(-9999, 0)` left `scrollX` at
  // 0 — so the page reported itself clean and a reader could not pan to the missing half.
  //
  // MEASURED AGAIN 2026-08-16, after that was "fixed" by swapping to `inset-inline-start: 0`, in
  // Chromium on `/` and `/checks/`, at nine client widths — the band is 833px wide and a sweep at
  // 375 and 1440 steps straight over it. `document.documentElement.clientWidth` was read back
  // INSIDE every measuring call and any reading at the wrong width discarded (one was: a 1264
  // setting reported 1249, because a classic 15px scrollbar appears on that page at that width;
  // it was retaken at a 1279 setting). Overflow is `scrollWidth − clientWidth`, never
  // `innerWidth`, which includes the scrollbar and would have read 0 through the whole defect.
  //
  //   BEFORE — menu OPEN                       AFTER — menu OPEN
  //   | clientWidth | panel L → R      | over |  | panel L → R     | over | button L → R      |
  //   |------------:|-----------------:|-----:|  |----------------:|-----:|------------------:|
  //   |         320 |     24.00 → 282  |    0 |  |    38.00 → 296  |    0 |   176.64 → 296.00 |
  //   |         375 |     24.00 → 282  |    0 |  |    93.00 → 351  |    0 |   231.64 → 351.00 |
  //   |         426 |     24.00 → 282  |    0 |  |   144.00 → 402  |    0 |   282.64 → 402.00 |
  //   |         440 |     24.00 → 282  |    0 |  |   158.00 → 416  |    0 |   296.64 → 416.00 |
  //   |         446 |   302.64 → 560.64| 115px|  |   164.00 → 422  |    0 |   302.64 → 422.00 |
  //   |         500 |   356.64 → 614.64| 115px|  |   218.00 → 476  |    0 |   356.64 → 476.00 |
  //   |         753 |   609.64 → 867.64| 115px|  |   471.00 → 729  |    0 |   609.64 → 729.00 |
  //   |        1264 |  1120.64 →1378.64| 115px|  |   982.00 →1240  |    0 |  1120.64 →1240.00 |
  //   |        1425 |  inline nav — no toggle, no panel overlay; 730.77 → 1401 in both, over 0 |
  //
  // MENU CLOSED IS 0 AT EVERY WIDTH IN BOTH COLUMNS, which is why the defect survived: a page-load
  // sweep never opens the menu. The 115px is `scrollWidth − clientWidth`, an integer because
  // `scrollWidth` rounds up; the panel's own right edge was 114.64px past the viewport, and it was
  // the SAME 114.64px at all four widths because the figure is arithmetic and not layout — 258px
  // of panel, minus 24px of header padding, minus the 119.36px open button.
  //
  // AFTER, the panel's right edge is `clientWidth − 24` at every width where a toggle is drawn,
  // and it is the BUTTON'S right edge too — the menu now hangs off the control that opened it at
  // every width instead of only some. Its left edge is `clientWidth − 282`, which is at or past 0
  // for every viewport of 282px or more and clears the header's own 24px padding from 306px up —
  // both below the 320px narrowest phone in service, where it measured left 38, right 296.
  //
  // THE BAND'S LOWER BRACKET, and the detail that makes it not a round number: the OPEN button is
  // 119.36px wide against 84.47px closed, so opening the menu can itself wrap the header. At 426
  // and 440 the closed header was one line (button at left 317.53 / 331.53) and opening it wrapped
  // (button to left 24). The predicted threshold is 253.69 + 24 + 119.36 + 48 = 445.05px, and 440
  // and 446 sit either side of it.
  //
  // THE FIX IS NOT AN EDGE. It is `margin-inline-start: auto` on `.nav`, which stops the toggle
  // moving at all: an auto inline-start margin absorbs the free space on the nav's own line,
  // wrapped or not, so the nav's end edge is the header's content end at EVERY width. The end
  // anchor is then right everywhere. Both halves are asserted below, separately, because either
  // one alone reintroduces one of the two defects above — and the one it reintroduces is the
  // invisible one.
  //
  // jsdom computes no layout, so these assert the stylesheet rather than the geometry; the
  // geometry is the two tables above.

  it('ANCHORS TO THE END EDGE — the half that fixes the 2026-08-16 right-edge overflow', () => {
    expect(COLLAPSED_PANEL_RULE).toContain('position: absolute');
    expect(COLLAPSED_PANEL_RULE).toMatch(/inset-inline-end:\s*0/);
    expect(COLLAPSED_PANEL_RULE).not.toMatch(/inset-inline-start:\s*0/);
  });

  it('PINS THE TOGGLE TO THE END OF THE HEADER — the half without which the end anchor is the 2026-08-15 defect', () => {
    // Delete this one declaration and the menu goes 114.6px off the LEFT edge on a phone, where
    // nothing can detect it. It is not decoration and it is not redundant with the header's
    // `space-between`: at the widths where the header WRAPS, space-between does not apply.
    expect(NAV_RULE).toMatch(/margin-inline-start:\s*auto/);
  });
});

describe('nav/below 1280px — the hamburger', () => {
  it('starts closed, and says so to a screen reader', () => {
    render(<SiteNav current="landing" inlineOverride={false} />);
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('is a real button with a name IN WORDS, never a bare glyph', () => {
    // `interactive-names.test.tsx` sweeps for this across the area; this pins the sentence, and
    // that the name changes with state so a reader is told what the control will now do.
    render(<SiteNav current="landing" inlineOverride={false} />);
    expect(menu().tagName).toBe('BUTTON');
    expect(menu().textContent).toContain('Menu');
    fireEvent.click(menu());
    expect(menu().textContent).toContain('Close menu');
  });

  it('opens on click, and points at the panel it controls', () => {
    render(<SiteNav current="landing" inlineOverride={false} />);
    fireEvent.click(menu());
    const panel = screen.getByRole('navigation', { name: 'Main' });
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(menu().getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(within(panel).getAllByRole('link')).toHaveLength(IN_NAV.length);
  });

  it('ESCAPE CLOSES IT AND RETURNS FOCUS TO THE BUTTON', () => {
    // Without the second half, focus is left on an element that has just been removed and falls
    // to the document body — a keyboard user loses their place on the page entirely.
    render(<SiteNav current="landing" inlineOverride={false} />);
    fireEvent.click(menu());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(document.activeElement).toBe(menu());
  });

  it('closes when a click lands outside it', () => {
    render(<SiteNav current="landing" inlineOverride={false} />);
    fireEvent.click(menu());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('stays open when the click lands inside it', () => {
    render(<SiteNav current="landing" inlineOverride={false} />);
    fireEvent.click(menu());
    const panel = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.mouseDown(panel);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('the closed panel is really gone, not merely invisible', () => {
    // A panel left in the accessibility tree is a panel a screen reader walks into while being
    // told it is collapsed. `hidden` removes it from the tree as well as from the screen.
    render(<SiteNav current="landing" inlineOverride={false} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('nav/from 1280px up — inline links', () => {
  it('draws every link with no button at all', () => {
    // Not a hidden button: a toggle on a desktop would announce "collapsed" while every link is
    // on screen, which is worse than having none.
    render(<SiteNav current="landing" inlineOverride />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(IN_NAV.length);
  });

  it('the panel is not hidden from anyone at this width', () => {
    render(<SiteNav current="landing" inlineOverride />);
    const panel = screen.getByRole('navigation', { name: 'Main' });
    expect(panel.hasAttribute('hidden')).toBe(false);
  });
});

describe('nav/it is ONE list, not two', () => {
  it('never renders a link twice, in either layout', () => {
    // The common build is a desktop nav plus a mobile nav hidden from each other by CSS, which
    // puts every link in the accessibility tree twice. This asserts there is one of each.
    for (const inline of [true, false]) {
      cleanup();
      render(<SiteNav current="landing" inlineOverride={inline} />);
      if (!inline) fireEvent.click(menu());
      const labels = screen.getAllByRole('link').map((a) => a.textContent);
      expect(new Set(labels).size, `inline=${inline}`).toBe(labels.length);
    }
  });
});

describe('nav/the reader is told which page they are on', () => {
  it('marks exactly one link as the current page, in both layouts', () => {
    for (const inline of [true, false]) {
      cleanup();
      render(<SiteNav current="checks" inlineOverride={inline} />);
      if (!inline) fireEvent.click(menu());
      const current = screen.getAllByRole('link').filter(
        (a) => a.getAttribute('aria-current') === 'page',
      );
      expect(current, `inline=${inline}`).toHaveLength(1);
      expect(current[0]!.getAttribute('href')).toBe('/checks/');
    }
  });

  it('marks none when the current page is not in the navigation', () => {
    // Privacy and cookies are footer pages. Marking nothing is right; marking the nearest link
    // would tell a reader they are somewhere they are not.
    render(<SiteNav current="privacy" inlineOverride />);
    expect(
      screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page'),
    ).toHaveLength(0);
  });
});
