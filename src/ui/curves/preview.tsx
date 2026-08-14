// DEV-ONLY preview harness for the sweep curves.
//
// The curves are not wired into the app — `src/ui/app/App.tsx` is the lead's file — so this page
// exists purely so the chart can be LOOKED AT during development, at
// `/src/ui/curves/preview.html` on the Vite dev server. Nothing here reaches `dist/`: `vite build`
// builds `index.html` only. Delete it freely once the curves have a home on the real page.
//
// It is not decoration. Two defects in this area were found in a real browser and by nothing else:
// a chart is a thing whose failure modes are visual, and jsdom computes no layout at all.

import { createRoot } from 'react-dom/client';
import { DamageCurve } from './DamageCurve';
import { MOCK_LEVEL_SERIES, MOCK_RESISTANCE_SERIES } from './mock-series';
import './preview.css';

function Preview() {
  return (
    <div className="preview">
      <div className="preview__case">
        <p className="preview__what">
          Damage versus target armor — one refused point at 0 armor, damage over time on every
          other
        </p>
        <DamageCurve series={MOCK_RESISTANCE_SERIES} />
      </div>
      <div className="preview__case">
        <p className="preview__what">
          Damage versus level — levels 1–5 refused, and a contributor excluded at some points and
          not others
        </p>
        <DamageCurve series={MOCK_LEVEL_SERIES} />
      </div>
      <div className="preview__case">
        <p className="preview__what">
          The same level curve with the target-health line switched off — the y axis rescales to the
          damage alone
        </p>
        <DamageCurve
          series={MOCK_LEVEL_SERIES}
          showTargetHealth={false}
          title="Damage versus level — damage only"
        />
      </div>
    </div>
  );
}

const host = document.getElementById('preview-root');
if (host) createRoot(host).render(<Preview />);
