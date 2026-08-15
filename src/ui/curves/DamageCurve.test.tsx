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
import {
  MOCK_LEVEL_SERIES,
  MOCK_RANK_BUILD_REACHABLE,
  MOCK_RANK_BUILD_UNREACHABLE,
  MOCK_RANK_LEVEL_SERIES,
  MOCK_RESISTANCE_SERIES,
} from './mock-series';

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

// ---------------------------------------------------------------------------------------
// THE RANK SHORTFALL ON SCREEN
//
// One series, two builds. `MOCK_RANK_LEVEL_SERIES` draws Q5 W5 E5 R3 at its top. Read against a
// build of Q6 W6 E6 R6 that top is BELOW what the user asked for and no level can reach it — the
// defect. Read against Q5 W5 E5 R3 the top is exactly right and only the lower levels are behind,
// which is what levelling is. The difference between those two readings is the whole feature.
// ---------------------------------------------------------------------------------------

const PRIORITY = { kind: 'priority', order: ['Q', 'W', 'E'] } as const;

describe('DamageCurve — the rank schedule is printed, because a curve cannot be judged without it', () => {
  it('names the levelling order in words, never with a greater-than sign', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(within(block).getByText('Levelling order: Q then W then E')).toBeTruthy();
    expect(block.textContent).toContain('not a fact about this champion');
  });

  it('says so when the ranks were held exactly as configured instead', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: { kind: 'as-configured' } }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    // The series' notes say a levelling order produced it, so the caller's claim is CONTRADICTED
    // and the chart says which one the engine recorded rather than quietly printing the caller's.
    expect(block.textContent).toContain('Ability ranks: held exactly as configured');
    expect(block.textContent).toContain('Q then W then E');
    expect(block.textContent).toContain('may not be the one that produced this line');
  });

  it('prints the configured build and the ranks the top of the curve was drawn at', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(within(block).getByText('Q6 W6 E6 R6')).toBeTruthy();
    expect(within(block).getByText('Q5 W5 E5 R3')).toBeTruthy();
  });

  it('is absent entirely when no ranks were supplied — a resistance curve grows nothing', () => {
    render(<DamageCurve series={MOCK_RESISTANCE_SERIES} />);
    expect(screen.queryByRole('region', { name: 'Ability ranks along this curve' })).toBeNull();
  });
});

describe('DamageCurve — a top below the configured build is stated, not drawn over', () => {
  const unreachable = () =>
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );

  it('says the top of the curve is below the build, and names every short slot', () => {
    unreachable();
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(block.textContent).toContain('BELOW the build you configured');
    // Q, W and E are all drawn at 5 against a stated 6, so they are ONE sentence, not three.
    expect(block.textContent).toContain('Q, W and E are drawn at rank 5, and your build states rank 6');
    expect(block.textContent).toContain('R is drawn at rank 3, and your build states rank 6');
  });

  it('explains that no level on the curve reaches those ranks', () => {
    unreachable();
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(block.textContent).toContain('No level on this curve can reach those ranks');
    expect(block.textContent).toContain('5 ranks for a basic ability and 3 for the ultimate');
  });

  it('contradicts the engine’s own note IN PLACE, quoting it rather than deleting it', () => {
    unreachable();
    const notes = screen.getByRole('region', { name: 'How this curve was produced' });
    expect(notes.textContent).toContain('THIS DOES NOT APPLY TO THIS CURVE');
    // The engine's sentence is still on screen, inside the correction, so a reader can audit it.
    expect(notes.textContent).toContain('No ability is ranked above the build the scenario states');
    // And the other two notes are untouched.
    expect(notes.textContent).toContain('Only the attacker levels');
    expect(within(notes).getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks every affected point on the plot, with a dotted rule and no colour', () => {
    const { container } = unreachable();
    // All six computed points hold a rank the schedule cannot reach.
    expect(container.querySelectorAll('.curve__short')).toHaveLength(6);
    expect(container.querySelectorAll('.curve__short-rule')).toHaveLength(6);
    for (const mark of container.querySelectorAll('.curve__short')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true');
      expect((mark as HTMLElement).style.color).toBe('');
    }
  });

  it('puts the mark in the legend and in the figure’s spoken description', () => {
    const { container } = unreachable();
    const legend = screen.getByRole('list', { name: 'What each line is' });
    expect(within(legend).getByText(/Never reached/)).toBeTruthy();
    const description = container.querySelector('figcaption')!.textContent ?? '';
    expect(description).toContain('dotted vertical rule');
    expect(description).toContain('never reaches your configured rank in');
  });
});

describe('DamageCurve — levelling is not a defect and is not marked as one', () => {
  const reachable = () =>
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );

  it('draws NO mark when the top of the curve is the configured build', () => {
    const { container } = reachable();
    expect(container.querySelectorAll('.curve__short')).toHaveLength(0);
    const legend = screen.getByRole('list', { name: 'What each line is' });
    expect(within(legend).queryByText(/Never reached/)).toBeNull();
  });

  it('still SAYS the lower levels are behind, and says it is not a defect', () => {
    reachable();
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(block.textContent).toContain('below your build only because the level has not bought');
    expect(block.textContent).toContain('The curve does reach your build above them, so they are not marked');
    expect(block.textContent).not.toContain('BELOW the build you configured');
  });

  it('leaves the engine’s notes exactly as the engine wrote them', () => {
    reachable();
    const notes = screen.getByRole('region', { name: 'How this curve was produced' });
    expect(notes.textContent).not.toContain('THIS DOES NOT APPLY');
    expect(notes.textContent).toContain('the top of this curve is the configured build');
  });
});

describe('DamageCurve — the rank column, and what it does to a refused row', () => {
  it('prints the ranks on EVERY computed row, short or not', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const row = screen.getByRole('row', { name: /attacker level 18/ });
    expect(within(row).getByText('Q5 W5 E5 R3')).toBeTruthy();
    // Level 18 meets this build exactly, so the cell carries no shortfall label at all.
    expect(row.textContent).not.toContain('below your build');
  });

  it('names the short slots compactly on a row that is behind', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_REACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const row = screen.getByRole('row', { name: /attacker level 13/ });
    expect(within(row).getByText('Q5 W5 E1 R2')).toBeTruthy();
    // TWO LINES, not one string — see `shortfallCellParts` for the 49px of page scroll the
    // single-line form caused in a real browser.
    expect(within(row).getByText('below your build')).toBeTruthy();
    expect(within(row).getByText('E 1 of 5, R 2 of 3')).toBeTruthy();
  });

  it('says "never reached" in the cell wherever the plot carries a mark', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const row = screen.getByRole('row', { name: /attacker level 18/ });
    expect(within(row).getByText('below your build, never reached')).toBeTruthy();
    expect(within(row).getByText('Q 5 of 6, W 5 of 6, E 5 of 6, R 3 of 6')).toBeTruthy();
    // The cell's two lines are real text in one cell, so the whole label still copies as one run.
    expect(within(row).getAllByRole('cell')[0]!.textContent).toContain(
      'below your build, never reachedQ 5 of 6, W 5 of 6, E 5 of 6, R 3 of 6',
    );
  });

  it('renders the label as TWO BLOCK LINES, which is what keeps the page from scrolling', () => {
    // jsdom computes no layout, so this pins the MECHANISM rather than the width. The measurement
    // is in a real browser and is recorded on `shortfallCellParts`: as one line the cell was 387px,
    // the table 1,335px against a 1,167px scroller, and the page scrolled sideways by 49px. Putting
    // the two halves back on one line reproduces that scroll, which is how the fix was confirmed.
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const row = screen.getByRole('row', { name: /attacker level 18/ });
    const lines = within(row).getAllByRole('cell')[0]!.querySelectorAll('.curve-table__short-line');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toBe('below your build, never reached');
    expect(lines[1]!.textContent).toBe('Q 5 of 6, W 5 of 6, E 5 of 6, R 3 of 6');
  });

  it('A REFUSED ROW STILL READS AS REFUSED — no rank cell, no mark, the engine’s reason intact', () => {
    const { container } = render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RANK_LEVEL_SERIES}
      />,
    );
    const row = screen.getByRole('row', { name: /attacker level 4/ });
    expect(row.textContent).toContain('Refused.');
    expect(row.textContent).toContain('an unlearned ability cannot be cast');
    expect(row.textContent).not.toContain('below your build');
    // One header cell + one spanning refusal cell, so the refusal keeps the full width it had.
    expect(within(row).getAllByRole('cell')).toHaveLength(1);
    expect(within(row).getByRole('cell').getAttribute('colspan')).toBe('7');
    // And the twelve refused levels are still hatched on the plot, none of them re-marked.
    expect(container.querySelectorAll('.curve__refused')).toHaveLength(12);
    expect(container.querySelectorAll('.curve__short')).toHaveLength(6);
  });

  it('adds no column at all when no ranks were supplied', () => {
    render(<DamageCurve series={MOCK_RANK_LEVEL_SERIES} />);
    expect(screen.queryByRole('columnheader', { name: 'Ability ranks' })).toBeNull();
    const row = screen.getByRole('row', { name: /attacker level 4/ });
    expect(within(row).getByRole('cell').getAttribute('colspan')).toBe('6');
  });
});

describe('DamageCurve — a series with no ranks in it is reported, not reassured about', () => {
  it('says how many points could not be compared, and marks nothing', () => {
    const { container } = render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RESISTANCE_SERIES}
      />,
    );
    const block = screen.getByRole('region', { name: 'Ability ranks along this curve' });
    expect(block.textContent).toContain(
      '6 of the 6 computed points do not record the ability ranks they were drawn at',
    );
    expect(block.textContent).toContain('Nothing here says they match it');
    expect(container.querySelectorAll('.curve__short')).toHaveLength(0);
  });

  it('marks each such row with an en dash rather than an invented rank', () => {
    render(
      <DamageCurve
        ranks={{ configured: MOCK_RANK_BUILD_UNREACHABLE, policy: PRIORITY }}
        series={MOCK_RESISTANCE_SERIES}
      />,
    );
    // One per computed row — all six of them. The refused row keeps its spanning refusal cell and
    // gets no rank cell at all, which is why this is 6 and not 7.
    expect(screen.getAllByText('this point does not record its ability ranks')).toHaveLength(6);
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
