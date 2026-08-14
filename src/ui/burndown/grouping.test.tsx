// @vitest-environment jsdom
//
// GROUPING A CARRIER WITH WHAT RODE ON IT (added 2026-08-14).
//
// A basic attack carrying three on-hit item effects is FOUR instances in the engine and ONE drop
// on a health bar. Keeping four instances is what preserves each one's resistance working and
// keeps the riders out of the carrier's critical strike (DATA-SOURCES §53.3). The bracket is how
// the chart says they were one moment, WITHOUT the engine merging anything.
//
// THE PROPERTY THAT MATTERS MOST is the last describe block: grouping is strictly additive.
// Remove every `carriedBy` and every number in the model is identical.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InstanceResult, Result } from '../../types/result';
import { MOCK_RESULT } from '../../types';

import { buildBurndownModel } from './geometry';
import { HpBurndown } from './HpBurndown';

/** The canonical mock, with a carrier and two riders spliced in after instance 1. */
function withRiders(): Result {
  const base = MOCK_RESULT;
  const first = base.perInstance[0]!;
  const rider = (n: number, type: 'physical' | 'magic'): InstanceResult => ({
    ...first,
    index: 0,
    stepId: `${first.stepId}-rider-${n}`,
    carriedBy: first.stepId,
    sourceLabel: `Item ${n} — Rider`,
    damageType: type,
    raw: 20,
    afterPreMitigationReduction: 20,
    afterResistances: 15,
    afterReductions: 15,
    final: 15,
    crit: false,
  });
  const perInstance = [first, rider(1, 'magic'), rider(2, 'physical'), ...base.perInstance.slice(1)]
    .map((instance, i) => ({ ...instance, index: i + 1 }));
  // The running total has one entry per instance and the geometry reads its deltas, so it has to
  // grow with the list or the columns lose their damage.
  const runningTotal = perInstance.map((_, i) => {
    const total = perInstance.slice(0, i + 1).reduce((n, x) => n + x.final, 0);
    return { total, byType: { physical: total, magic: 0, true: 0 } };
  });
  return { ...base, perInstance, runningTotal };
}

const modelOf = (r: Result) => buildBurndownModel(r);

describe('the geometry brackets a carrier with its riders', () => {
  it('gives the carrier and both riders one group id — the carrier’s step', () => {
    const model = modelOf(withRiders());
    const burst = model.columns.filter((c) => c.kind === 'burst');
    const carrier = burst[0]!;
    expect(carrier.groupId).toBe(carrier.instance!.stepId);
    expect(burst[1]!.groupId).toBe(carrier.groupId);
    expect(burst[2]!.groupId).toBe(carrier.groupId);
    expect(burst[0]!.groupSize).toBe(3);
    expect(burst[1]!.groupIndex).toBe(2);
    expect(burst[2]!.groupIndex).toBe(3);
  });

  it('labels the group with the CARRIER’s label, not a rider’s', () => {
    const model = modelOf(withRiders());
    const burst = model.columns.filter((c) => c.kind === 'burst');
    expect(burst[1]!.groupLabel).toBe(burst[0]!.axisLabel);
  });

  it('leaves every instance that stands alone ungrouped', () => {
    const model = modelOf(MOCK_RESULT);
    for (const c of model.columns) {
      expect({ label: c.axisLabel, groupId: c.groupId }).toEqual({
        label: c.axisLabel,
        groupId: null,
      });
      expect(c.groupSize).toBe(1);
    }
  });

  it('does NOT bracket a carrier with nothing riding on it', () => {
    // Bracketing one column says there is something to group when there is not.
    const base = MOCK_RESULT;
    const model = modelOf(base);
    expect(model.columns.every((c) => c.groupSize === 1)).toBe(true);
  });

  it('keeps a group CONTIGUOUS — it never jumps a column that is not part of it', () => {
    // A rider is emitted immediately after its carrier. A group that could jump a gap would
    // bracket columns that are not next to each other, which cannot be drawn as one bracket.
    const r = withRiders();
    const perInstance = [...r.perInstance];
    // Move the second rider to the end, so it is no longer adjacent to its carrier.
    const [moved] = perInstance.splice(2, 1);
    perInstance.push(moved!);
    const model = modelOf({ ...r, perInstance: perInstance.map((x, i) => ({ ...x, index: i + 1 })) });
    const burst = model.columns.filter((c) => c.kind === 'burst');
    expect(burst[0]!.groupSize).toBe(2);
    expect(burst[burst.length - 1]!.groupId).toBeNull();
  });

  it('never groups the unplaced-healing or +DoT column — neither rode on anything', () => {
    const model = modelOf(withRiders());
    for (const c of model.columns.filter((c) => c.kind !== 'burst')) {
      expect(c.groupId).toBeNull();
    }
  });
});

describe('the chart draws it, and a screen reader hears it', () => {
  it('prints ONE axis label for the group, not one per column', () => {
    const { container } = render(<HpBurndown result={withRiders()} />);
    const labels = [...container.querySelectorAll('.burn__xlabel')].map((n) =>
      n.textContent?.trim(),
    );
    // Three burst columns, one label between them: the two riders print nothing.
    expect(labels.filter((t) => t === 'inst 1')).toHaveLength(1);
    expect(labels.filter((t) => t === '')).toHaveLength(2);
  });

  it('draws exactly one bracket per group, spanning its columns', () => {
    const { container } = render(<HpBurndown result={withRiders()} />);
    const brackets = container.querySelectorAll('.burn__bracket');
    expect(brackets).toHaveLength(1);
    expect((brackets[0] as HTMLElement).style.getPropertyValue('--burn-group-span')).toBe('3');
  });

  it('anchors the bracket at the group’s LEADING EDGE, not the carrier’s centre', () => {
    // THIS TEST EXISTS BECAUSE THE COUNT-BASED ONES COULD NOT CATCH THE DEFECT. The first version
    // anchored at 50% and, measured in a real browser, ran from the middle of the group's first
    // column to the middle of the column AFTER it — bracketing one column that was not in the
    // group. Every assertion about `--burn-group-span` still passed, because the span was right
    // and the ORIGIN was wrong. jsdom computes no layout, so the check is on the declaration.
    const { container } = render(<HpBurndown result={withRiders()} />);
    const bracket = container.querySelector('.burn__bracket') as HTMLElement;
    const label = bracket.closest('.burn__xlabel') as HTMLElement;
    // The bracket is positioned against the label of the group's FIRST column...
    expect(label.textContent?.trim()).toBe('inst 1');
    expect(label.className).toContain('burn__xlabel--grouped');
    // ...and the stylesheet must start it at that label's edge. A non-zero inline start would
    // shift the whole bracket by a fraction of a column.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'burndown.css'), 'utf8');
    const rule = css.slice(css.indexOf('.burn__bracket {'));
    const start = /inset-inline-start:\s*([^;]+);/.exec(rule.slice(0, rule.indexOf('}')))?.[1];
    expect(start?.trim()).toBe('0');
  });

  it('draws no bracket at all when nothing is grouped', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelectorAll('.burn__bracket')).toHaveLength(0);
  });

  it('a rider’s spoken name says what it rode on', () => {
    // Sighted readers get the bracket; this is the same fact, spoken. Without it a screen-reader
    // user hears unrelated instances where the chart shows one bracketed moment.
    render(<HpBurndown result={withRiders()} />);
    const rider = screen.getByRole('button', { name: /Item 1 — Rider/ });
    expect(rider.getAttribute('aria-label') ?? rider.textContent).toMatch(/riding on inst 1/);
  });

  it('the CARRIER’s own name does not claim to be riding on anything', () => {
    render(<HpBurndown result={withRiders()} />);
    const carrier = screen.getAllByRole('button', { name: /^Instance 1\./ })[0]!;
    expect(carrier.getAttribute('aria-label') ?? '').not.toMatch(/riding on/);
  });
});

describe('the second verdict says why it agrees with the first', () => {
  // A reader seeing the same sentence twice learns nothing and may reasonably think it is a bug.
  // Nothing produced a DoT until 2026-08-14, so these two lines were identical for every real
  // scenario ever computed — §3.8 satisfied in form and not in substance (DATA-SOURCES §56).
  it('says nothing in the scenario deals damage over time, when nothing does', () => {
    const noDot: Result = { ...MOCK_RESULT, dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 }, sources: [] } };
    const { container } = render(<HpBurndown result={noDot} />);
    const note = container.querySelector('.burn__verdict-note');
    expect(note?.textContent).toMatch(/nothing in this scenario deals damage over time/);
  });

  it('distinguishes "there is none" from "there is some with no published total"', () => {
    const unpublished: Result = {
      ...MOCK_RESULT,
      dot: {
        total: 0,
        byType: { physical: 0, magic: 0, true: 0 },
        sources: [
          {
            label: "Bami's Cinder — Immolate",
            icon: null,
            damageType: 'magic',
            total: 0,
            verification: 'incomplete',
            incompleteReason: { kind: 'pending', note: 'the source states no number of ticks' },
          },
        ],
      },
    };
    const { container } = render(<HpBurndown result={unpublished} />);
    expect(container.querySelector('.burn__verdict-note')?.textContent).toMatch(
      /has no published total/,
    );
  });

  it('says NOTHING extra when the two verdicts genuinely differ', () => {
    // MOCK_RESULT carries a real DoT, so the note would be noise.
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelector('.burn__verdict-note')).toBeNull();
  });
});

describe('grouping is STRICTLY ADDITIVE — it moves no number', () => {
  it('every figure in the model is identical with and without the grouping', () => {
    // The whole argument for grouping over folding rests on this. If it fails, grouping has
    // become the thing it was chosen instead of.
    const grouped = withRiders();
    const ungrouped: Result = {
      ...grouped,
      perInstance: grouped.perInstance.map(({ carriedBy: _c, ...rest }) => rest),
    };
    const a = modelOf(grouped);
    const b = modelOf(ungrouped);

    expect(a.burst).toEqual(b.burst);
    expect(a.maxHp).toBe(b.maxHp);
    expect(a.startHp).toBe(b.startHp);
    expect(a.lethalAtInstance).toBe(b.lethalAtInstance);
    expect(a.burstVerdictText).toBe(b.burstVerdictText);
    expect(a.dotVerdictText).toBe(b.dotVerdictText);
    expect(a.cumulativeByType).toEqual(b.cumulativeByType);
    expect(a.columns).toHaveLength(b.columns.length);

    a.columns.forEach((col, i) => {
      const other = b.columns[i]!;
      // Everything except the four grouping fields must match exactly.
      const strip = (c: typeof col) => {
        const { groupId: _g, groupIndex: _i, groupSize: _s, groupLabel: _l, instance, ...rest } = c;
        // `instance` is the InstanceResult itself, and the ungrouped fixture had `carriedBy`
        // removed from it — that difference is the input, not an effect of grouping.
        const bare = instance ? { ...instance, carriedBy: undefined } : null;
        return { ...rest, instance: bare };
      };
      expect(strip(col)).toEqual(strip(other));
    });
  });
});
