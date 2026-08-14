// The composition root.
//
// It mounts the real interface: two champion pickers, per-champion configuration, an item set
// from the full pool, a combo builder over each champion's own ability icons, and the result —
// the HP burndown (DESIGN.md §7's signature element), the per-instance breakdown, both survival
// verdicts and both resolved stat blocks.
//
// THE NUMBER IS REAL. `App` builds a `Scenario`, loads a `Catalogue` from the published data
// files, and runs `simulate` (src/engine/simulate.ts). Nothing on the page comes from the
// canonical mock any more. What the engine cannot model, it names on screen and excludes from
// the total, rather than quietly folding a smaller figure into it (SPECIFICATION §8, §11).
//
// WHY THIS FILE IS THREE LINES. `src/main.tsx` sits in no agent's area, which by the partition
// makes it the lead's (CLAUDE.md). `App` takes no props and fetches its own data precisely so
// that the mount is a mount and not a place where a fifth writer accumulates logic.

import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { App } from './ui/app';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(<App />);
