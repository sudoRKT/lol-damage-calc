// THE NAVIGATION — inline links on a desktop, a hamburger below 1280px.
//
// ═══ ONE SET OF LINKS, NOT TWO ═══
//
// The obvious build is a desktop nav and a mobile nav, hidden from each other by media queries.
// That is two lists to keep in step, two sets of links in the accessibility tree, and a screen
// reader on a wide viewport walking straight into a duplicate. **There is one `<ul>` here.** The
// media query changes how it is laid out and whether the button is drawn; it never changes what
// exists.
//
// 1280px is DESIGN.md §7a's own breakpoint, quoted rather than chosen: it is where the layout
// already stops being a two-column desktop and where the §16 ad rails hide.
//
// ═══ WHAT THE BUTTON DOES, AND WHY IT IS NOT RENDERED ON A DESKTOP ═══
//
// Above 1280px the links are simply visible, so a toggle would be a control that expands
// something already expanded — announced to a screen reader as collapsed while every link is on
// screen, which is worse than no button. It is not merely hidden with CSS; it is **not
// rendered**, and the panel carries no `hidden` state at that width either.
//
// The width is read once and watched with a media query listener rather than a resize handler:
// `matchMedia` fires when the answer CHANGES, not on every pixel of a drag.
//
// ═══ KEYBOARD AND SCREEN READER ═══
//
//   • a real `<button>` — never a div with a click handler — carrying `aria-expanded`,
//     `aria-controls`, and a NAME IN WORDS that changes with state ("Menu" / "Close menu").
//     The three bars are `aria-hidden`; a control named by a glyph is something
//     `interactive-names.test.tsx` already refuses.
//   • the panel follows the button in the document, so Tab reaches the links next with no
//     focus management at all — the tab order is the reading order.
//   • Escape closes it and RETURNS FOCUS to the button, because focus left on a removed element
//     falls to the document body and a keyboard user loses their place entirely.
//   • a click outside closes it; a click on a link closes it, since the page is about to change.
//   • `aria-current="page"` marks the page the reader is on, in both layouts.

import { useEffect, useId, useRef, useState } from 'react';
import { SITE_PAGES } from './pages';
import './nav.css';

/** DESIGN.md §7a states this width verbatim. Quoted here, not chosen. */
export const INLINE_NAV_FROM = '(min-width: 80rem)';

export interface SiteNavProps {
  /** Page id from `SITE_PAGES`, so one link can be marked as the current page. */
  current: string;
  /**
   * Forces the inline layout on or off. Exists ONLY so tests can exercise both without a real
   * viewport — jsdom implements `matchMedia` as always-false, which would silently mean every
   * test only ever saw the hamburger.
   */
  inlineOverride?: boolean;
}

export function SiteNav({ current, inlineOverride }: SiteNavProps) {
  const [inline, setInline] = useState(inlineOverride ?? false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Watch the breakpoint, not the resize event.
  useEffect(() => {
    if (inlineOverride !== undefined) return undefined;
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(INLINE_NAV_FROM);
    const apply = () => setInline(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [inlineOverride]);

  // A menu left open while the viewport grows would sit there as a panel with no button to
  // close it. Widening past the breakpoint closes it.
  useEffect(() => {
    if (inline) setOpen(false);
  }, [inline]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && !navRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const links = SITE_PAGES.filter((page) => page.inMainNav);

  return (
    <div className={inline ? 'nav nav--inline' : 'nav'}>
      {inline ? null : (
        <button
          ref={buttonRef}
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span className="nav__bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {open ? 'Close menu' : 'Menu'}
        </button>
      )}

      <nav
        ref={navRef}
        id={panelId}
        className={open ? 'nav__panel nav__panel--open' : 'nav__panel'}
        aria-label="Main"
        hidden={!inline && !open}
      >
        <ul className="nav__list">
          {links.map((page) => (
            <li key={page.id}>
              <a
                className="nav__link"
                href={page.path}
                aria-current={page.id === current ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {page.navLabel}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
