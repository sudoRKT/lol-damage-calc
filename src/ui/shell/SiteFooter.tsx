// THE FOOTER — and the two legal notices SPECIFICATION §15 requires on the page rather than
// behind a link.
//
// ═══ THE RIOT DISCLAIMER IS HERE FROM THE FIRST COMMIT THAT CREATES A PAGE ═══
//
// §15 requires it "in a location readily visible to users". It is real text in a footer that
// appears on every one of the eight pages, not a link to a legal page and not a dismissible
// banner. It landed with the page structure rather than in a later pass, because a page that
// exists without it is a page out of compliance with the product's own specification — the gap
// is not worth the tidiness of doing all the legal text at once.
//
// ═══ WHAT MUST NEVER SHARE A CONTAINER WITH IT ═══
//
// The author's note. It sits above this footer, outside it, in its own band (see the landing
// page and About). The note mentions wanting to work with Riot's legal team one day; putting
// that in the same block as "not endorsed by Riot Games" invites a reader to connect the two,
// and the one reading nobody wants is that the author is hinting at a relationship that does
// not exist. `shell.test.tsx` asserts the two are not in the same element.

import { SITE_PAGES, SOURCE_URL } from './pages';
import './shell.css';

/**
 * SPECIFICATION §15, verbatim. It is quoted rather than paraphrased: it is a notice Riot's own
 * legal terms specify the wording of, and a tidier sentence is a different sentence.
 */
export const RIOT_DISCLAIMER =
  'Bench Test is not endorsed by Riot Games and does not reflect the views or opinions of Riot ' +
  'Games or anyone officially involved in producing or managing Riot Games properties. Riot ' +
  'Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.';

/** SPECIFICATION §15 — wiki-derived content is attributed under CC BY-SA with a link. */
export const WIKI_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export function SiteFooter() {
  return (
    <footer className="foot">
      <nav className="foot__links" aria-label="Site">
        <ul>
          {SITE_PAGES.filter((p) => p.id !== 'landing').map((page) => (
            <li key={page.id}>
              <a href={page.path}>{page.navLabel}</a>
            </li>
          ))}
          <li>
            <a href={SOURCE_URL} rel="noreferrer">
              <GitHubMark />
              Source and test suite
            </a>
          </li>
        </ul>
      </nav>

      <section className="foot__legal" aria-label="Legal notices">
        <h2 className="foot__eyebrow">Legal</h2>
        <p className="foot__notice">{RIOT_DISCLAIMER}</p>
        <p className="foot__notice">
          Champion and ability data is derived from the League of Legends Wiki and is used under{' '}
          <a href={WIKI_LICENCE_URL} rel="noreferrer">
            CC BY-SA 4.0
          </a>
          . Game art is Riot Games’ Data Dragon static data, used within the asset terms Riot
          permits, and is never altered beyond a display filter.
        </p>
      </section>
    </footer>
  );
}

/**
 * The GitHub mark, as an inline SVG.
 *
 * DECORATIVE, ALWAYS. It is `aria-hidden` and every place it appears puts real words beside it —
 * a control named only by a glyph is something `interactive-names.test.tsx` already refuses, and
 * an icon that is the whole accessible name of a link is the same defect in a different shape.
 *
 * `currentColor` is not a colour value: it inherits whatever the surrounding text is already set
 * to, so the mark can never introduce a hue the reserved-hue law (DESIGN.md §1) has not allowed.
 */
export function GitHubMark() {
  return (
    <svg
      className="mark"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
