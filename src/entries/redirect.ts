// A URL carrying a shared scenario belongs to the calculator, never to the landing page.
//
// Loaded by `index.html` BEFORE the landing page's own module, so nothing is painted before the
// move. Every decision is in `src/url/entry.ts`, which is where it can be tested; this file is a
// mount and nothing else, which is the same rule the page entries follow.

import { installScenarioRedirect } from '../url';

installScenarioRedirect(window);
