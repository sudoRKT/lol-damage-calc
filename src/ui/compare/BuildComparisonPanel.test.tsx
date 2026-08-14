// @vitest-environment jsdom
//
// THE BUILD-COMPARISON SURFACE, rendered.
//
// Each fixture below is one of the states `src/engine/build-comparison.ts` can return, and the
// tests are written against the RULE each state exists to hold rather than against the markup:
// a refused comparison shows no figure at all, a refused side shows no figure of its own, a
// confounded difference states its reasons before its numbers, and a partial build is a floor
// rather than a smaller total.
//
// The summaries are produced by the ENGINE'S OWN `summarise` over the canonical mock Result, so
// no figure in this file is a number somebody typed.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildComparison, BuildDelta } from '../../engine/build-comparison';
import { summarise } from '../../engine/sweep';
import type { ChampionConfig, Result } from '../../types';
import { MOCK_RESULT } from '../../types';
import { THIN_SPACE } from '../primitives';
import { BuildComparisonPanel } from './BuildComparisonPanel';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFENDER: ChampionConfig = {
  apiname: 'Garen',
  level: 11,
  abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
  items: [3068],
  runes: { keystone: null, primary: [], secondary: [], shards: [] },
  persistent: {},
  entryState: {},
};

/** The canonical mock, with the fields a comparison reads moved. */
function summaryOf(overrides: Partial<Result>) {
  return summarise({ ...MOCK_RESULT, ...overrides } as Result);
}

/** A build with nothing excluded — the mock has two exclusions, which is its own fixture below. */
const CLEAN_A = summaryOf({ incompleteContributors: [], verificationSummary: 'derived' });
const CLEAN_B = summaryOf({
  incompleteContributors: [],
  verificationSummary: 'derived',
  burst: { total: 1030, byType: { physical: 670, magic: 360, true: 0 } },
});

const DELTA: BuildDelta = {
  burstTotal: 260,
  burstByType: { physical: 100, magic: 160, true: 0 },
  dotTotal: 0,
  burstOnlyLethal: { a: false, b: true },
  burstPlusDotLethal: { a: true, b: true },
};

function comparison(over: Partial<Extract<BuildComparison, { ok: true }>> = {}): BuildComparison {
  return {
    ok: true,
    defender: DEFENDER,
    sides: {
      a: { status: 'computed', summary: CLEAN_A },
      b: { status: 'computed', summary: CLEAN_B },
    },
    delta: DELTA,
    caveats: [],
    notes: ['Both builds were run against the same defender configuration.'],
    ...over,
  };
}

const text = (el: HTMLElement) => el.textContent ?? '';

// =========================================================================================
// The whole comparison refused
// =========================================================================================

describe('compare/two different defenders — nothing is compared and nothing is shown', () => {
  const differences = [
    'defender.level: 11 against 13',
    'defender.items: [3068] against [3068,3075]',
  ];

  it('prints every field the engine named, verbatim', () => {
    const { container } = render(
      <BuildComparisonPanel comparison={{ ok: false, kind: 'different-defender', differences }} />,
    );
    for (const d of differences) expect(text(container as unknown as HTMLElement)).toContain(d);
  });

  it('shows NO damage figure of any kind — not a partial comparison, a refused one', () => {
    const { container } = render(
      <BuildComparisonPanel comparison={{ ok: false, kind: 'different-defender', differences }} />,
    );
    expect(container.querySelectorAll('.dmg, .agg')).toHaveLength(0);
  });
});

// =========================================================================================
// Both sides computed
// =========================================================================================

describe('compare/two computed builds', () => {
  it('names both builds and prints each one’s own burst figure', () => {
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    const body = text(container as unknown as HTMLElement);
    expect(body).toContain('Build A');
    expect(body).toContain('Build B');
    expect(body).toContain('770');
    // Grouped by `formatDamage` with a real U+2009 THIN SPACE, so the figure survives a copy.
    expect(body).toContain(`1${THIN_SPACE}030`);
  });

  it('states the direction in words and the magnitude in a figure — never in a colour', () => {
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    expect(text(container as unknown as HTMLElement)).toContain(
      'Build B deals more burst damage than Build A.',
    );
    const difference = container.querySelector('[aria-label="The difference"]') as HTMLElement;
    expect(text(difference)).toContain('Build B minus Build A');
    expect(text(difference)).toContain('260');
  });

  it('gives the survival verdict twice for each build (SPECIFICATION §3.8)', () => {
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    const body = text(container as unknown as HTMLElement);
    expect(body).toContain('Burst alone:');
    expect(body).toContain('Burst plus damage over time:');
    expect(body).toContain('Survives — 30 health remaining.');
  });

  it('keeps damage over time out of the burst figure and gives it its own line', () => {
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    expect(text(container as unknown as HTMLElement)).toContain(
      'Damage over time — never in the burst',
    );
    // 770 + 160 is not printed anywhere: there is no combined figure in this product.
    expect(text(container as unknown as HTMLElement)).not.toContain('930 total');
  });
});

// =========================================================================================
// The damage-type rules, on rendered output
// =========================================================================================

describe('compare/damage type is never conveyed by colour alone', () => {
  it('every tagged figure speaks its type in full to assistive technology', () => {
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    const figures = [...container.querySelectorAll('.dmg')];
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) {
      const spoken = figure.querySelector('.u-visually-hidden')?.textContent ?? '';
      expect(spoken).toMatch(/(physical|magic|true) damage/);
    }
  });

  it('every untagged aggregate carries its tagged composition bar', () => {
    // DESIGN.md §8's one exception, checked on this surface's own output rather than trusted to
    // the primitive. An `.agg` with no `.comp` inside it is the one figure shape not allowed.
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    const aggregates = [...container.querySelectorAll('.agg')];
    expect(aggregates.length).toBeGreaterThan(0);
    for (const aggregate of aggregates) {
      expect(aggregate.querySelector('.comp')).not.toBeNull();
    }
  });

  it('a difference whose parts point in opposite directions is never aggregated', () => {
    const mixed: BuildDelta = {
      ...DELTA,
      burstTotal: 100,
      burstByType: { physical: 300, magic: -200, true: 0 },
    };
    const { container } = render(<BuildComparisonPanel comparison={comparison({ delta: mixed })} />);
    const difference = container.querySelector('[aria-label="The difference"]') as HTMLElement;
    expect(difference.querySelectorAll('.agg')).toHaveLength(0);
    expect(text(difference)).toContain('opposite directions');
    // Both parts are printed, each tagged.
    expect(text(difference)).toContain('300');
    expect(text(difference)).toContain('-200');
  });

  it('a difference of exactly nothing is words, never a bare untagged zero', () => {
    const none: BuildDelta = {
      ...DELTA,
      burstTotal: 0,
      burstByType: { physical: 0, magic: 0, true: 0 },
    };
    const { container } = render(<BuildComparisonPanel comparison={comparison({ delta: none })} />);
    const difference = container.querySelector('[aria-label="The difference"]') as HTMLElement;
    expect(text(difference)).toContain('identical burst damage');
    expect(difference.querySelectorAll('.agg, .dmg')).toHaveLength(0);
  });
});

// =========================================================================================
// Confounded, refused and partial
// =========================================================================================

describe('compare/a confounded difference states its reasons before its numbers', () => {
  const reasons = [
    'the first build excludes W — Seismic Shard (mock) and the second does not, so part of ' +
      'this difference is data this project has not modelled rather than a build difference',
  ];

  it('is headed as confounded and lists every reason the engine gave', () => {
    const { container } = render(
      <BuildComparisonPanel
        comparison={comparison({ delta: undefined, confounded: { reasons, delta: DELTA } })}
      />,
    );
    const block = container.querySelector(
      '[aria-label="The difference, confounded"]',
    ) as HTMLElement;
    expect(block).not.toBeNull();
    expect(text(block)).toContain('confounded');
    expect(text(block)).toContain(reasons[0]!);
  });

  it('puts the reason ahead of the figure in reading order', () => {
    const { container } = render(
      <BuildComparisonPanel
        comparison={comparison({ delta: undefined, confounded: { reasons, delta: DELTA } })}
      />,
    );
    const block = container.querySelector(
      '[aria-label="The difference, confounded"]',
    ) as HTMLElement;
    const body = text(block);
    expect(body.indexOf('not modelled')).toBeLessThan(body.indexOf('Burst difference'));
  });
});

describe('compare/one side refused', () => {
  const refused = comparison({
    sides: {
      a: { status: 'computed', summary: CLEAN_A },
      b: {
        status: 'refused',
        refusals: [{ path: 'attacker.items[2]', reason: 'no item with id 9999 in the pool' }],
      },
    },
    delta: undefined,
  });

  it('names the path and the reason, and shows that build no figure at all', () => {
    const { container } = render(<BuildComparisonPanel comparison={refused} />);
    const side = container.querySelector('[aria-label="Build B"]') as HTMLElement;
    expect(text(side)).toContain('attacker.items[2]');
    expect(text(side)).toContain('no item with id 9999 in the pool');
    expect(side.querySelectorAll('.dmg, .agg')).toHaveLength(0);
  });

  it('keeps the working build’s own figures, and gives no difference', () => {
    const { container } = render(<BuildComparisonPanel comparison={refused} />);
    const side = container.querySelector('[aria-label="Build A"]') as HTMLElement;
    expect(side.querySelectorAll('.agg').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-label="The difference"]')).toBeNull();
    expect(text(container as unknown as HTMLElement)).toContain('nothing to subtract from');
  });

  it('draws the shared scale for the one build that ran, not a second empty bar', () => {
    const { container } = render(<BuildComparisonPanel comparison={refused} />);
    expect(container.querySelectorAll('.cmp__row')).toHaveLength(1);
  });
});

describe('compare/an incomplete build is a floor, never a smaller number', () => {
  const partial = comparison({
    sides: {
      // The canonical mock as it really is: two excluded abilities and an `incomplete` summary.
      a: { status: 'computed', summary: summarise(MOCK_RESULT), result: MOCK_RESULT },
      b: { status: 'computed', summary: CLEAN_B },
    },
    delta: undefined,
  });

  it('labels the figure as a floor rather than as a total', () => {
    const { container } = render(<BuildComparisonPanel comparison={partial} />);
    const side = container.querySelector('[aria-label="Build A"]') as HTMLElement;
    expect(text(side)).toContain('Burst — a floor, not a total');
    expect(text(side)).toContain('the real figure is higher');
  });

  it('names every excluded ability AND why, when the full result is carried', () => {
    const { container } = render(<BuildComparisonPanel comparison={partial} />);
    const side = container.querySelector('[aria-label="Build A"]') as HTMLElement;
    for (const contributor of MOCK_RESULT.incompleteContributors) {
      expect(text(side)).toContain(contributor.sourceLabel);
    }
    expect(text(side)).toContain('description prose that has not been read yet');
  });

  it('says plainly that the reasons are missing when only the summary is carried', () => {
    const summaryOnly = comparison({
      sides: {
        a: { status: 'computed', summary: summarise(MOCK_RESULT) },
        b: { status: 'computed', summary: CLEAN_B },
      },
      delta: undefined,
    });
    const { container } = render(<BuildComparisonPanel comparison={summaryOnly} />);
    const side = container.querySelector('[aria-label="Build A"]') as HTMLElement;
    expect(text(side)).toContain('W — Seismic Shard (mock)');
    expect(text(side)).toContain('recorded on the full result');
  });

  it('carries the verification status as a neutral mark in each build’s header', () => {
    // Scoped to the headers on purpose: every EXCLUDED ability carries a mark of its own inside
    // the list below, so an unscoped count would grow with the data rather than with the builds.
    const { container } = render(<BuildComparisonPanel comparison={partial} />);
    expect(container.querySelectorAll('.cmp__side-head .vstat').length).toBe(2);
  });
});

// =========================================================================================
// The area's own mechanical guards
// =========================================================================================

describe('compare/the surface obeys its own constraints', () => {
  it('the stylesheet uses no reserved hue — "better" can never be green or red', () => {
    const css = readFileSync(join(HERE, 'compare.css'), 'utf8');
    for (const hue of ['--dmg-physical', '--dmg-magic', '--dmg-true', '--lethal', '--flash-recent']) {
      expect(css).not.toContain(`var(${hue})`);
    }
  });

  it('renders no <table>, so it needs no scroll region', () => {
    // Stated as a test rather than as a comment, because the constraint is external: the
    // area-wide sweep in `src/ui/responsive-overflow.test.tsx` asserts an EXACT list of files
    // that render a table, and that file belongs to the lead. A table here turns that sweep red
    // and this area cannot fix it. See the area's report.
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    expect(container.querySelectorAll('table')).toHaveLength(0);
  });

  it('the chart repeats nothing that is not also stated in words', () => {
    // The bars are untagged lengths, so they are hidden from assistive technology and every
    // figure they draw appears, tagged, in the panels above.
    const { container } = render(<BuildComparisonPanel comparison={comparison()} />);
    const plot = container.querySelector('.cmp__plot') as HTMLElement;
    expect(plot.getAttribute('aria-hidden')).toBe('true');
    expect(plot.querySelectorAll('.dmg, .agg')).toHaveLength(0);
  });
});
