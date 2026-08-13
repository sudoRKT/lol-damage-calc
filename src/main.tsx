// The composition root.
//
// It mounts the HP BURNDOWN (src/ui/burndown) — DESIGN.md §7's signature element and the
// product's remembered object — against the one canonical mock Result.
//
// THE VERTICAL SLICE IS GONE FROM HERE, deliberately. It was a throwaway proof that the plumbing
// connects: stored data, through the engine, to a number on screen. It did that and it is kept at
// `src/ui/slice/` as a reference for what the plumbing does, not as a design. Nothing new is built
// on it.
//
// What this page is NOT yet: the real interface. There are no champion pickers, no combo builder,
// no stat blocks and no result table — those are being built now. Until they exist this renders
// the burndown alone, from the mock, so the signature element can be judged on its own terms.

import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { HpBurndown } from './ui/burndown';
import { MOCK_RESULT } from './types';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(<HpBurndown result={MOCK_RESULT} />);
