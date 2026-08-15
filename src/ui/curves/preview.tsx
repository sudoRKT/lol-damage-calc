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
import {
  MOCK_LEVEL_SERIES,
  MOCK_RANK_BUILD_REACHABLE,
  MOCK_RANK_BUILD_UNREACHABLE,
  MOCK_RANK_LEVEL_SERIES,
  MOCK_RESISTANCE_SERIES,
} from './mock-series';
import './preview.css';

const PRIORITY = { kind: 'priority', order: ['Q', 'W', 'E'] } as const;

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
          Rank shortfall, the MARKED case — the same curve read against a build of Q6 W6 E6 R6 that
          it never reaches. Six dotted vertical rules, a strong-bordered rank block, and “never
          reached” in every rank cell. It also trips the configured-build cross-check, because the
          curve records that it was drawn against Q5 W5 E5 R3
        </p>
        <DamageCurve
          ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
          series={MOCK_RANK_LEVEL_SERIES}
          title="Damage versus attacker level — a build this curve never draws"
        />
      </div>
      <div className="preview__case">
        <p className="preview__what">
          Rank shortfall, the UNMARKED case — the same curve read against Q5 W5 E5 R3, which its top
          reaches exactly. No rules on the plot, a steel border, and the lower levels still stated
        </p>
        <DamageCurve
          ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: PRIORITY }}
          series={MOCK_RANK_LEVEL_SERIES}
          title="Damage versus attacker level — the build is reached at the top"
        />
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
