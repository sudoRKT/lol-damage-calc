// The composition root.
//
// It mounts the VERTICAL SLICE (src/ui/slice) — the first end-to-end path in this project:
// stored ability data, through the engine's component evaluator and resistance formula, to a
// number on screen carrying its damage-type tag and its verification status.
//
// This is deliberately ONE champion, ONE defender and ONE combo. It is a proof that the pieces
// connect, not the product's interface, and everything it cannot model is printed on screen
// rather than approximated. The real composition root replaces it when the configuration panels,
// the item and rune pickers and the HP burndown exist.

import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { VerticalSlice } from './ui/slice/VerticalSlice';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(<VerticalSlice />);
