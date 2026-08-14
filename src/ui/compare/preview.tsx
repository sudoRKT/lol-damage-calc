// DEV-ONLY preview harness for the build-comparison surface.
//
// The panel is not wired into the app — mounting is a lead action — so this page exists purely so
// the surface can be LOOKED AT in a real browser during development, at
// `/src/ui/compare/preview.html` on the Vite dev server. `vite build` builds `index.html` only,
// so nothing here reaches `dist/`.
//
// WHY IT IS WORTH THE FILE. jsdom computes no layout: it cannot tell you that a bar rendered at
// zero width, that a tick label ran off its axis, or that the panel pushed a 375px page sideways.
// Two defects in the HP burndown were caught by a real browser and by nothing in the suite. Every
// state the engine can return is on this page so all of them can be seen at once.

import { createRoot } from 'react-dom/client';
import type { BuildComparison, BuildDelta } from '../../engine/build-comparison';
import { summarise } from '../../engine/sweep';
import type { ChampionConfig, Result } from '../../types';
import { MOCK_RESULT } from '../../types';
import { BuildComparisonPanel } from './BuildComparisonPanel';
import './preview.css';

const DEFENDER: ChampionConfig = {
  apiname: 'Garen',
  level: 11,
  abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
  items: [3068],
  runes: { keystone: null, primary: [], secondary: [], shards: [] },
  persistent: {},
  entryState: {},
};

const summaryOf = (over: Partial<Result>) => summarise({ ...MOCK_RESULT, ...over } as Result);

const CLEAN_A = summaryOf({ incompleteContributors: [], verificationSummary: 'derived' });
const CLEAN_B = summaryOf({
  incompleteContributors: [],
  verificationSummary: 'derived',
  burst: { total: 1030, byType: { physical: 670, magic: 360, true: 0 } },
  verdict: {
    burstOnly: {
      defenderHp: 800,
      damageApplied: 800,
      healingApplied: 0,
      lethal: true,
      lethalAtInstance: 4,
      remainingHp: 0,
    },
    burstPlusDot: {
      defenderHp: 800,
      damageApplied: 800,
      healingApplied: 0,
      lethal: true,
      lethalAtInstance: 4,
      remainingHp: 0,
    },
  },
});

const DELTA: BuildDelta = {
  burstTotal: 260,
  burstByType: { physical: 100, magic: 160, true: 0 },
  dotTotal: 0,
  burstOnlyLethal: { a: false, b: true },
  burstPlusDotLethal: { a: true, b: true },
};

const base: Extract<BuildComparison, { ok: true }> = {
  ok: true,
  defender: DEFENDER,
  sides: {
    a: { status: 'computed', summary: CLEAN_A },
    b: { status: 'computed', summary: CLEAN_B },
  },
  delta: DELTA,
  caveats: [],
  notes: [
    'Both builds were run against the same defender configuration, from the same entry state.',
    'Burst and damage over time are reported separately (SPECIFICATION §3.8).',
  ],
};

const CASES: Array<{ what: string; comparison: BuildComparison }> = [
  { what: 'Clean — both builds computed, the difference means what it says', comparison: base },
  {
    what: 'The difference points in OPPOSITE directions by damage type — no combined figure',
    comparison: {
      ...base,
      delta: { ...DELTA, burstTotal: 100, burstByType: { physical: 300, magic: -200, true: 0 } },
    },
  },
  {
    what: 'Confounded — the reasons come before the figures',
    comparison: {
      ...base,
      delta: undefined,
      confounded: {
        reasons: [
          'the first build excludes W — Seismic Shard (mock) and the second does not, so part ' +
            'of this difference is data this project has not modelled rather than a build ' +
            'difference',
        ],
        delta: DELTA,
      },
    },
  },
  {
    what: 'One side refused — no figures for it, and no difference at all',
    comparison: {
      ...base,
      delta: undefined,
      sides: {
        a: { status: 'computed', summary: CLEAN_A },
        b: {
          status: 'refused',
          refusals: [
            { path: 'attacker.items[2]', reason: 'no item with id 9999 in the pool' },
            { path: 'attacker.abilityRanks.R', reason: 'rank 4 is above the maximum of 3' },
          ],
        },
      },
    },
  },
  {
    what: 'A partial build — a floor, with every excluded ability named and explained',
    comparison: {
      ...base,
      delta: undefined,
      sides: {
        a: { status: 'computed', summary: summarise(MOCK_RESULT), result: MOCK_RESULT },
        b: { status: 'computed', summary: CLEAN_B },
      },
    },
  },
  {
    what: 'Two different defenders — the whole comparison is refused, and no figure is drawn',
    comparison: {
      ok: false,
      kind: 'different-defender',
      differences: [
        'defender.level: 11 against 13',
        'defender.items: [3068] against [3068,3075]',
        'defender.entryState: {"bonePlating":true} against {}',
      ],
    },
  },
];

function Preview() {
  return (
    <div className="preview">
      {CASES.map((c) => (
        <div className="preview__case" key={c.what}>
          <p className="preview__what">{c.what}</p>
          <BuildComparisonPanel comparison={c.comparison} patch="16.16.1" />
        </div>
      ))}
    </div>
  );
}

const host = document.getElementById('preview-root');
if (host) createRoot(host).render(<Preview />);
