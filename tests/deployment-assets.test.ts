// THE FILES THAT ONLY MATTER ONCE THE SITE IS ON A CDN, AND WHICH NOTHING ELSE WOULD NOTICE.
//
// `site-structure.test.ts` proves the page list, the build's entry points and the HTML files on
// disk all agree. It says nothing about the four files that exist only for the hosting: the
// sitemap a crawler reads, the robots file that points at it, the header rules the CDN applies,
// and the error page it serves for an address that is not a page.
//
// These have the same shape of failure as the page list and no language-level connection to it
// either: a ninth page added to `src/ui/shell/pages.ts` is a ninth page the sitemap does not
// mention, and nothing fails. Search engines would simply never hear about it. So this file is
// the same check applied to the same lists.
//
// IT LIVES IN tests/ BECAUSE IT BELONGS TO NO AREA — it reads the page list, the repository's
// hand-written HTML and the CDN's configuration at once (CLAUDE.md).

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_PAGES } from '../src/ui/shell/pages';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/**
 * The one address the site answers on. SPECIFICATION §14 puts domain and CDN with one provider;
 * this is that domain, and it appears in three files that must not disagree — a canonical link
 * naming one origin while the sitemap names another is worse than neither existing.
 */
const ORIGIN = 'https://limittest.site';

/** `/about/` -> `about/index.html`; `/` -> `index.html`. Same rule as site-structure.test.ts. */
const htmlFor = (path: string) => (path === '/' ? 'index.html' : `${path.replace(/^\/|\/$/g, '')}/index.html`);

describe('deployment-assets/the files the CDN serves are all present', () => {
  // Copied verbatim out of public/ by Vite. If one is renamed or deleted the site still builds
  // and still works — it just quietly loses a tab icon, or its error page, or its whole header
  // policy. Nothing else in the suite would go red.
  it.each(['public/robots.txt', 'public/sitemap.xml', 'public/404.html', 'public/_headers', 'public/favicon.svg'])(
    '%s exists',
    (file) => {
      expect(existsSync(join(REPO, file))).toBe(true);
    },
  );
});

describe('deployment-assets/the sitemap lists every page and no page it does not have', () => {
  it('names exactly the eight pages, at exactly their served paths', () => {
    const sitemap = read('public/sitemap.xml');
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).sort();
    const expected = SITE_PAGES.map((p) => `${ORIGIN}${p.path}`).sort();
    expect(listed).toEqual(expected);
  });

  it('the robots file points a crawler at that sitemap', () => {
    // A sitemap nothing links to is a sitemap nothing reads.
    expect(read('public/robots.txt')).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});

describe('deployment-assets/every page declares one address and one icon', () => {
  it.each(SITE_PAGES.map((p) => [p.path, p.id] as const))('%s', (path) => {
    const html = read(htmlFor(path));
    // The canonical link and og:url must name THIS page. A page that canonicalises to another
    // page tells a search engine it is a duplicate, and it disappears from results.
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${path}" />`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${path}" />`);
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
  });

  it('the shared-link preview repeats the page’s own title and description, never a second wording', () => {
    // Two wordings for one page is two things to keep in step, and the one nobody sees while
    // building is the one that goes stale.
    for (const page of SITE_PAGES) {
      const html = read(htmlFor(page.path));
      const description = html.match(/<meta name="description" content="(.*?)" \/>/)?.[1];
      expect(description, page.path).toBeTruthy();
      expect(html, page.path).toContain(`<meta property="og:title" content="${page.title}" />`);
      expect(html, page.path).toContain(`<meta property="og:description" content="${description}" />`);
    }
  });
});

describe('deployment-assets/the content-security-policy permits what the site actually loads', () => {
  const headers = () => read('public/_headers');

  it('allows the art host that src/ui/data/roster.ts really builds URLs against', () => {
    // THE CROSS-CHECK THAT MATTERS. Every champion portrait, ability icon, item icon and rune
    // icon is hotlinked from Data Dragon. If that host is ever changed in roster.ts and not here,
    // the policy blocks every image on the site — and it would pass every other test in this
    // suite, because jsdom does not fetch images (roster.ts records that exact lesson).
    const host = read('src/ui/data/roster.ts').match(/const DDRAGON_ROOT = '(https:\/\/[^/']+)/)?.[1];
    expect(host, 'DDRAGON_ROOT could not be read from roster.ts').toBeTruthy();
    expect(headers()).toContain(`img-src 'self' ${host}`);
  });

  it('allows the inlined font subsets, which is the directive that was measured and got it wrong once', () => {
    // Vite inlines any asset under 4 KB into the stylesheet as a `data:` URI, and nine of the
    // smaller font subsets come in under that. `font-src 'self'` alone blocked all nine and the
    // page silently fell back to system faces. Found in a browser, not by a test — this is that
    // finding pinned so it cannot come back.
    expect(headers()).toContain("font-src 'self' data:");
  });

  it('does NOT allow inline or third-party script, so adding one has to be deliberate', () => {
    // Analytics, advertising and error monitoring all arrive as third-party script. SPECIFICATION
    // §15 and PLAN.md §6 gate advertising behind the privacy and cookie policies; this line is
    // the mechanical half of that gate, and it should fail loudly rather than be widened quietly.
    expect(headers()).toContain("script-src 'self';");
    expect(headers()).not.toContain("'unsafe-eval'");
  });
});

describe('deployment-assets/the error page is not a ninth entry point', () => {
  it('is a plain file in public/, so the eight-page rule is untouched', () => {
    // site-structure.test.ts asserts the build's entry list and the page list agree exactly. A
    // 404 page added as a ninth entry would fail it, and admitting one would weaken the check.
    expect(read('vite.config.ts')).not.toContain('404');
    expect(existsSync(join(REPO, 'public/404.html'))).toBe(true);
  });

  it('carries no JavaScript, so it works when everything else has failed', () => {
    const html = read('public/404.html');
    expect(html).not.toContain('<script');
    // And it must offer a way out. A dead end is what a CDN's default 404 already is.
    expect(html).toContain('href="/calculator/"');
  });

  it('tells a reader holding a shared scenario that their link is not lost', () => {
    // The scenario lives in the fragment, which survives arriving at the wrong address
    // (src/url/entry.ts). Somebody who mistypes a path should be told that, not left guessing.
    expect(read('public/404.html')).toContain('#');
  });
});
