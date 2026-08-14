// @vitest-environment jsdom
//
// WHAT THE CURVE PUTS ON SCREEN, AND WHAT IT PUTS IN THE ACCESSIBILITY TREE.
//
// The plot is `aria-hidden`, so every assertion about content here is really one question: is the
// fact that the picture shows ALSO somewhere a screen reader can reach it? A chart whose only
// record of a refused point is a hatched band is a chart that lies to half its readers.
//
// The fixtures are hand-built series rather than engine output, for the same reason `geometry.ts`'s
// tests are: the figures have to be values a person can check by eye. The real engine's output is
// exercised at roster scale in `roster-curves.test.ts`.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { buildSeries, type SweepPoint } from '../../engine';
import { DamageCurve, verdictText } from './DamageCurve';
import { MOCK_LEVEL_SERIES, MOCK_RESISTANCE_SERIES } from './mock-series';

afterEach(cleanup);

function computed(
  x: number,
  burst: number,
  extra: Partial<{ dot: number; lethal: boolean; contributors: string[] }> = {},
): SweepPoint<null> {
  const dot = extra.dot ?? 0;
  const lethal = extra.lethal ?? false;
  return {
    x,
    label: `${x} armor`,
    applied: null,
    status: 'computed',
    summary: {
      burst: { total: burst, byType: { physical: burst - 100, magic: 100, true: 0 } },
      dot: { total: dot, byType: { physical: 0, magic: dot, true: 0 } },
      verdict: {
        burstOnly: {
          lethal,
          lethalAtInstance: lethal ? 3 : null,
          remainingHp: lethal ? 0 : 1000 - burst,
          damageApplied: burst,
          healingApplied: 0,
        },
        burstPlusDot: {
          lethal,
          lethalAtInstance: lethal ? 3 : null,
          remainingHp: lethal ? 0 : 1000 - burst - dot,
          damageApplied: burst + dot,
          healingApplied: 0,
        },
      },
      attackerLevel: 11,
      defenderLevel: 11,
      defenderHp: 1000,
      verification: 'derived',
      partial: (extra.contributors ?? []).length > 0,
      incompleteContributors: extra.contributors ?? [],
    },
  };
}

function refused(x: number): SweepPoint<null> {
  return {
    x,
    label: `${x} armor`,
    applied: null,
    status: 'refused',
    refusals: [
      {
        path: 'defender.armor',
        reason: 'percentage bonus armor penetration has no defined meaning against a negative pool',
      },
    ],
  };
}

const BASIC = buildSeries<null>({
  kind: 'resistance',
  axisLabel: 'target armor',
  points: [computed(0, 900, { lethal: true }), computed(50, 700), refused(100), computed(150, 500)],
  excludedMechanics: ['shields'],
  notes: ['Only the target’s resistance moves along this curve.'],
});

describe('DamageCurve — every point is in the accessibility tree', () => {
  it('renders one table row per point, refused points included', () => {
    render(<DamageCurve series={BASIC} />);
    // 1 header row + 4 point rows.
    expect(screen.getAllByRole('row')).toHaveLength(5);
    expect(screen.getByRole('rowheader', { name: '100 armor' })).toBeTruthy();
  });

  it('states the engine’s own reason for a refused point, in visible text', () => {
    render(<DamageCurve series={BASIC} />);
    const cell = screen.getByText(/percentage bonus armor penetration/);
    expect(cell.textContent).toContain('Refused');
    expect(cell.textContent).toContain('defender.armor');
  });

  it('speaks every damage figure’s type in full', () => {
    render(<DamageCurve series={BASIC} />);
    // 900 = 800 physical + 100 magic. AggregateTotal builds the whole sentence as one text node.
    expect(screen.getByText('900 total damage — 800 physical, 100 magic')).toBeTruthy();
  });

  it('gives both verdicts, on every computed row (SPECIFICATION §3.8)', () => {
    render(<DamageCurve series={BASIC} />);
    // Two verdict columns per row, so each row's wording appears twice — and with no damage over
    // time the two verdicts agree, which is the correct answer rather than a duplicate.
    expect(screen.getAllByText('Lethal at instance 3')).toHaveLength(2);
    expect(screen.getAllByText('Survives, 300 left')).toHaveLength(2);
    expect(screen.getAllByText('Survives, 500 left')).toHaveLength(2);
  });

  it('names the scroll region and says that it scrolls', () => {
    render(<DamageCurve series={BASIC} title="Damage versus armor" />);
    const region = screen.getByRole('region', { name: /Damage versus armor, point by point/ });
    expect(region.getAttribute('aria-label')).toContain('scrolls sideways');
    expect((region as HTMLElement).tabIndex).toBe(0);
  });

  it('puts every table it renders inside that region', () => {
    const { container } = render(<DamageCurve series={BASIC} />);
    for (const table of container.querySelectorAll('table')) {
      expect(table.closest('.u-scroll-x')).not.toBeNull();
    }
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('describes the picture in words, since the picture itself is hidden', () => {
    const { container } = render(<DamageCurve series={BASIC} />);
    const figure = container.querySelector('figure')!;
    const description = figure.querySelector('figcaption')!.textContent ?? '';
    expect(description).toContain('target armor');
    expect(description).toContain('3 of 4 points computed');
    expect(description).toContain('1 refused');

    const svg = container.querySelector('svg.curve__svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('DamageCurve — the plot draws what the model says and no more', () => {
  it('draws one polyline per contiguous run, so the refused point is a gap', () => {
    const { container } = render(<DamageCurve series={BASIC} showTargetHealth={false} />);
    // burst: runs [0,50] and [150] -> 2 polylines. No DoT anywhere, health switched off.
    expect(container.querySelectorAll('polyline.curve__line--burst')).toHaveLength(2);
    expect(container.querySelectorAll('polyline.curve__line--dot')).toHaveLength(0);
    expect(container.querySelectorAll('polyline.curve__line--targetHealth')).toHaveLength(0);
  });

  it('draws the target-health line by default, so the crossing is visible', () => {
    const { container } = render(<DamageCurve series={BASIC} />);
    expect(container.querySelectorAll('polyline.curve__line--targetHealth')).toHaveLength(2);
  });

  it('marks the refused point on the axis', () => {
    const { container } = render(<DamageCurve series={BASIC} />);
    const marks = container.querySelectorAll('.curve__refused');
    expect(marks).toHaveLength(1);
    expect((marks[0] as HTMLElement).style.insetInlineStart).toBe('66.6667%');
  });

  it('every stroke keeps its width in real pixels rather than stretching with the plot', () => {
    const { container } = render(<DamageCurve series={BASIC} />);
    for (const line of container.querySelectorAll('polyline, line')) {
      expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('carries a legend entry for every line it drew, plus one for the refusals', () => {
    render(<DamageCurve series={BASIC} />);
    const legend = screen.getByRole('list', { name: 'What each line is' });
    expect(within(legend).getByText('Burst total')).toBeTruthy();
    expect(within(legend).getByText('Target health')).toBeTruthy();
    expect(within(legend).getByText(/Refused/)).toBeTruthy();
  });
});

describe('DamageCurve — the honesty fields are shown, not logged', () => {
  it('says how much of the range computed', () => {
    render(<DamageCurve series={BASIC} />);
    expect(screen.getByText('4 points · 3 computed · 1 refused')).toBeTruthy();
  });

  it('warns FIRST when the excluded set varies across the range', () => {
    const varying = buildSeries<null>({
      kind: 'resistance',
      axisLabel: 'target armor',
      points: [computed(0, 900, { contributors: ['W — Infernal Chains'] }), computed(50, 700)],
    });
    render(<DamageCurve series={varying} />);
    const alarm = screen.getByRole('region', { name: 'These points are not comparable' });
    expect(alarm.textContent).toContain('W — Infernal Chains');
    expect(alarm.textContent).toContain('a gap in the data rather than a change in the game');
  });

  it('says the figures are a floor when anything is excluded anywhere', () => {
    const partial = buildSeries<null>({
      kind: 'resistance',
      axisLabel: 'target armor',
      points: [computed(0, 900, { contributors: ['E — Chain'] }), computed(50, 700, { contributors: ['E — Chain'] })],
    });
    render(<DamageCurve series={partial} />);
    expect(screen.getByText(/floor on the damage, not the damage/).textContent).toContain(
      'E — Chain',
    );
    // Excluded everywhere is NOT the incomparability alarm — the two are different problems.
    expect(screen.queryByRole('region', { name: 'These points are not comparable' })).toBeNull();
  });

  it('lists the mechanics the engine excluded and the conventions it applied', () => {
    render(<DamageCurve series={BASIC} />);
    const mechanics = screen.getByRole('region', { name: 'Mechanics this curve excludes' });
    expect(within(mechanics).getByText('shields')).toBeTruthy();
    const notes = screen.getByRole('region', { name: 'How this curve was produced' });
    expect(notes.textContent).toContain('Only the target’s resistance moves');
  });

  it('shows a verification status on every computed row', () => {
    render(<DamageCurve series={BASIC} />);
    expect(screen.getAllByText('Derived')).toHaveLength(3);
  });
});

describe('DamageCurve — the two canonical mock series render', () => {
  it('draws the resistance curve, with its one refused point left as a gap', () => {
    const { container } = render(<DamageCurve series={MOCK_RESISTANCE_SERIES} />);
    // 7 points, 6 computed and consecutive, so ONE segment per line — and the refusal at the start
    // of the range is a mark rather than a line reaching back to it.
    expect(container.querySelectorAll('polyline.curve__line--burst')).toHaveLength(1);
    expect(container.querySelectorAll('polyline.curve__line--dot')).toHaveLength(1);
    expect(container.querySelectorAll('.curve__refused')).toHaveLength(1);
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });

  it('draws the level curve and calls out that its points are not comparable', () => {
    const { container } = render(<DamageCurve series={MOCK_LEVEL_SERIES} />);
    expect(container.querySelectorAll('.curve__refused')).toHaveLength(5);
    expect(container.querySelectorAll('polyline.curve__line--burst')).toHaveLength(1);
    const alarm = screen.getByRole('region', { name: 'These points are not comparable' });
    expect(alarm.textContent).toContain('E — Chain');
  });

  it('renders a series in which every point refused, without drawing a line at zero', () => {
    const allRefused = buildSeries<null>({
      kind: 'level',
      axisLabel: 'attacker level',
      points: [refused(1), refused(2), refused(3)],
    });
    const { container } = render(<DamageCurve series={allRefused} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.querySelectorAll('.curve__refused')).toHaveLength(3);
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});

describe('DamageCurve — verdict wording', () => {
  it('says where a kill happened when the engine recorded the instance', () => {
    expect(verdictText({ lethal: true, lethalAtInstance: 4, remainingHp: 0 })).toBe(
      'Lethal at instance 4',
    );
  });

  it('says how much health is left when the defender survives', () => {
    expect(verdictText({ lethal: false, lethalAtInstance: null, remainingHp: 12.3456 })).toBe(
      'Survives, 12.35 left',
    );
  });

  it('never prints an engine working value raw', () => {
    expect(verdictText({ lethal: false, lethalAtInstance: null, remainingHp: 1019.1803996452423 }))
      .toBe('Survives, 1019.18 left');
  });
});
