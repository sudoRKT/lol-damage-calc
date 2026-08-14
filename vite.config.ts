import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Static MULTI-page app. No server, no API routes — the calculation runs entirely in the
// browser (SPECIFICATION §1), and `vite build` emits a folder of static files for a CDN (§14).
//
// ═══ WHY EIGHT ENTRY POINTS AND NOT A ROUTER ═══
//
// Every page is a real file at a real path. That is not a stylistic preference:
//
//   • THE LANDING PAGE SHIPS NONE OF THE CALCULATOR'S JAVASCRIPT. SPECIFICATION §13 asks for a
//     low first-load time; separate entries give it by construction rather than by optimisation.
//   • The prose pages work with JavaScript disabled, which a landing page that needs to be found
//     should.
//   • No CDN rewrite rules and no SPA fallback are needed, because nothing is pretending to be a
//     path it is not.
//   • NO DEPENDENCY. Removing this later involves removing nothing — there is no router to take
//     out, only this map.
//
// The cost is a full page load when moving between pages. For a site of eight pages with one
// heavy application page, that is the right trade and not a compromise.
//
// A SHARED SCENARIO STILL LANDS IN THE CALCULATOR. The scenario lives in the URL fragment
// (src/url/FORMAT.md §2), which carries no path, so a link can arrive at the root. `index.html`
// loads src/entries/redirect.ts before its own module and moves it. See src/url/entry.ts.
//
// The keys below are the entry NAMES; `src/ui/shell/pages.ts` holds the same eight ids and is
// what the navigation and the footer read. `tests/site-structure.test.ts` asserts the two lists
// agree, so a page cannot exist in one and not the other.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        landing: at('index.html'),
        calculator: at('calculator/index.html'),
        checks: at('checks/index.html'),
        changelog: at('changelog/index.html'),
        report: at('report/index.html'),
        about: at('about/index.html'),
        privacy: at('privacy/index.html'),
        cookies: at('cookies/index.html'),
      },
    },
  },
});
