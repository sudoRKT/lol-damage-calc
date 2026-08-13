// DEV-ONLY preview harness for the HP burndown.
//
// The burndown is not wired into the app — `src/main.tsx` and `index.html` are the lead's
// files — so this page exists purely so the chart can be LOOKED AT during development, at
// `/src/ui/burndown-preview.html` on the Vite dev server. It is not part of the product:
// `vite build` builds `index.html` only, so nothing here reaches `dist/`. Delete it freely
// once the burndown has a home on the real page.

import { createRoot } from 'react-dom/client';
import { HpBurndown } from './HpBurndown';
import { MOCK_RESULT } from '../../types';
import { BURST_KILLS } from './mock-variants';
import './preview.css';

function Preview() {
  return (
    <div className="preview">
      <div className="preview__case">
        <p className="preview__what">Canonical mock — the burst kills at instance 5</p>
        <HpBurndown result={MOCK_RESULT} />
      </div>
      <div className="preview__case">
        <p className="preview__what">Variant — the burst survives, the DoT tail finishes it</p>
        <HpBurndown result={BURST_KILLS} title="HP burndown — burst kills (derived variant)" />
      </div>
    </div>
  );
}

const host = document.getElementById('preview-root');
if (host) createRoot(host).render(<Preview />);
