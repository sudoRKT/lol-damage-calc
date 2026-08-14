// A URL carrying a shared scenario belongs to the calculator, never to the landing page.
//
// Loaded by `index.html` BEFORE the landing page's own module, so nothing is painted before the
// move. The decision itself is `calculatorRedirectFor` in src/url/entry.ts, which is a pure
// function of one string and is tested against every scenario fixture the link format has.
//
// `location.replace`, not `location.href`: the landing page must not end up in the reader's back
// history, or Back from the calculator would bounce them straight forward again.

import { calculatorRedirectFor } from '../url';

const destination = calculatorRedirectFor(window.location.href);
if (destination) window.location.replace(destination);
