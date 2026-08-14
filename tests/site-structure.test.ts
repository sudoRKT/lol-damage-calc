// THE SITE IS EIGHT SEPARATE FILES, AND THIS IS WHAT STOPS THEM DRIFTING APART.
//
// A multi-page build has three lists that must agree and no language-level connection between
// them: the pages the navigation links to (`src/ui/shell/pages.ts`), the entry points the build
// compiles (`vite.config.ts`), and the HTML files actually on disk. Nothing in TypeScript fails
// when they disagree. What happens instead is a link to a page that was never built — a 404 a
// reader finds before anyone else does.
//
// THIS FILE LIVES IN tests/ BECAUSE IT BELONGS TO NO AREA. It reads the build config, the page
// list and the repository's own files at once, which is the one thing a file inside a
// partitioned area may not do (CLAUDE.md).

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_PAGES } from '../src/ui/shell/pages';
import { CALCULATOR_PATH } from '../src/url/entry';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const VITE_CONFIG = read('vite.config.ts');

/** `/about/` -> `about/index.html`; `/` -> `index.html`. */
function htmlFor(path: string): string {
  return path === '/' ? 'index.html' : `${path.replace(/^\/|\/$/g, '')}/index.html`;
}

describe('site-structure/population', () => {
  it('is looking at eight pages — the check cannot pass by finding nothing', () => {
    expect(SITE_PAGES.length).toBe(8);
    expect(new Set(SITE_PAGES.map((p) => p.id)).size).toBe(8);
    expect(new Set(SITE_PAGES.map((p) => p.path)).size).toBe(8);
  });
});

describe('site-structure/every page in the list is really built', () => {
  it('each has an HTML file on disk', () => {
    const missing = SITE_PAGES.filter((p) => !existsSync(join(REPO, htmlFor(p.path))));
    expect(missing.map((p) => p.path)).toEqual([]);
  });

  it('each is an entry point in the build, or it would never be compiled', () => {
    // A page whose HTML exists but which vite is not told about is a page that works in `npm run
    // dev` and 404s in production — the worst-shaped bug, because it cannot be seen while building.
    const absent = SITE_PAGES.filter((p) => !VITE_CONFIG.includes(`'${htmlFor(p.path)}'`));
    expect(absent.map((p) => p.path)).toEqual([]);
  });

  it('each HTML file loads an entry module that exists', () => {
    const broken: string[] = [];
    for (const page of SITE_PAGES) {
      const html = read(htmlFor(page.path));
      const srcs = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]!);
      if (srcs.length === 0) broken.push(`${page.path}: no module script`);
      for (const src of srcs) {
        if (!existsSync(join(REPO, src.replace(/^\//, '')))) broken.push(`${page.path}: ${src}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('each declares its own title and description, so no two pages share an identity', () => {
    const titles = new Set<string>();
    for (const page of SITE_PAGES) {
      const html = read(htmlFor(page.path));
      expect(html, page.path).toContain(`<title>${page.title}</title>`);
      expect(html, page.path).toContain('name="description"');
      titles.add(page.title);
    }
    expect(titles.size).toBe(SITE_PAGES.length);
  });
});

describe('site-structure/the build has no page the list does not know about', () => {
  it('every entry in vite.config.ts is a page in the list', () => {
    // The other direction. A page built but unlinked is a page nobody can reach and nobody
    // maintains, and it would still ship.
    const entries = [...VITE_CONFIG.matchAll(/^\s{8}(\w+): at\('([^']+)'\)/gm)].map((m) => ({
      id: m[1]!,
      html: m[2]!,
    }));
    expect(entries.length).toBe(SITE_PAGES.length);
    const known = new Map(SITE_PAGES.map((p) => [p.id, htmlFor(p.path)]));
    for (const entry of entries) {
      expect(known.get(entry.id), `vite entry "${entry.id}"`).toBe(entry.html);
    }
  });
});

describe('site-structure/the calculator is one click away, and never behind the landing page', () => {
  it('the calculator path the redirect uses is the path the site actually serves', () => {
    // Two constants naming the same place. If one moves without the other, every shared link
    // lands on a 404 — silently, because a redirect to a missing page looks like a broken link
    // rather than a broken build.
    const calculator = SITE_PAGES.find((p) => p.id === 'calculator')!;
    expect(calculator.path).toBe(CALCULATOR_PATH);
    expect(existsSync(join(REPO, htmlFor(CALCULATOR_PATH)))).toBe(true);
  });

  it('THE LANDING PAGE DOES NOT LOAD THE CALCULATOR, so it cannot be paying for it', () => {
    // §13's low first-load time is the reason for eight entries rather than one bundle. If the
    // landing entry ever imports the app, that benefit is gone and nothing else would say so.
    const landing = read('src/entries/landing.tsx');
    expect(landing).not.toContain("from '../ui/app'");
  });

  it('every page can be reached from every page — the footer links to all of them', () => {
    const footer = read('src/ui/shell/SiteFooter.tsx');
    // The footer renders the list, so this asserts the mechanism rather than eight literals.
    expect(footer).toContain('SITE_PAGES.filter');
    expect(SITE_PAGES.filter((p) => p.id !== 'landing').length).toBe(7);
  });
});

describe('site-structure/no page is a placeholder any more', () => {
  it('every page renders its own component', () => {
    // This list held six ids while the pages were being built, and fell to none as each was
    // written. It fails in EITHER direction: a new placeholder shows up here, and so does a page
    // that quietly went back to being one.
    const waiting = SITE_PAGES.filter((p) => {
      const entry = read(`src/entries/${p.id}.tsx`);
      return entry.includes('PageNotWritten');
    }).map((p) => p.id);
    expect(waiting).toEqual([]);
  });

  it('and the placeholder component is GONE, not just unused', () => {
    // It said in its own header that it would be deleted as each page was written. An unused
    // component is an invitation to use it again.
    expect(existsSync(join(REPO, 'src/ui/pages/PageNotWritten.tsx'))).toBe(false);
    const index = read('src/ui/pages/index.ts');
    expect(index).not.toContain('PageNotWritten');
  });
});
