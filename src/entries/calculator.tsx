// THE CALCULATOR — the composition root for /calculator/.
//
// It mounts the real interface: two champion pickers, per-champion configuration, an item set
// from the full pool, a combo builder over each champion's own ability icons, and the result —
// the HP burndown (DESIGN.md §7's signature element), the per-instance breakdown, both survival
// verdicts and both resolved stat blocks.
//
// THE NUMBER IS REAL. `App` builds a `Scenario`, loads a `Catalogue` from the published data
// files and runs `simulate`. What the engine cannot model it names on screen and excludes from
// the total, rather than folding a smaller figure in quietly (SPECIFICATION §8, §11).
//
// ═══ A SHARED LINK OPENS HERE, AND A DAMAGED ONE SAYS SO ═══
//
// SPECIFICATION §12 makes a link the primary way scenarios are distributed. `App` has always
// accepted an initial scenario; nothing had ever handed it one, because reading the URL is the
// lead's file and this is it.
//
// A link that fails to decode is REPORTED, never ignored. src/url refuses rather than
// substituting — "a link that decodes into something subtly different from what was shared is
// the same class of failure as a wrong damage number" — and silently opening the default
// matchup instead would be exactly that substitution, one step later. The one case that is not
// an error is a URL with no scenario in it at all: that is just somebody opening the page.

import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import { App } from '../ui/app';
import { PageShell } from '../ui/shell';
import { scenarioFromUrl } from '../url';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

const opened = scenarioFromUrl(window.location.href);
const shared = opened.ok ? opened.scenario : null;
// `empty` means there was no scenario in the URL, which is not a failure.
const linkNotice = !opened.ok && opened.error.code !== 'empty' ? opened.error.message : undefined;

createRoot(rootEl).render(
  <PageShell current="calculator" wide bareMasthead>
    <App
      initialAttacker={shared?.attacker}
      initialDefender={shared?.defender}
      initialCombo={shared ? [...shared.combo] : undefined}
      linkNotice={linkNotice}
    />
  </PageShell>,
);
