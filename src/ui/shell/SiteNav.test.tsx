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
import { SiteNav } from './SiteNav';
import { SITE_PAGES } from './pages';

afterEach(cleanup);

const IN_NAV = SITE_PAGES.filter((p) => p.inMainNav);
const menu = () => screen.getByRole('button', { name: /^(Menu|Close menu)$/ });

describe('nav/population', () => {
  it('offers every page marked for the main navigation, and the legal pages are not', () => {
    expect(IN_NAV.length).toBe(6);
    expect(SITE_PAGES.filter((p) => !p.inMainNav).map((p) => p.id)).toEqual(['privacy', 'cookies']);
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
