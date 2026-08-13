// KNOWN-ANSWER TESTS for the burndown's model.
//
// Every expected value below was worked out by hand from MOCK_RESULT and DESIGN.md §7 /
// §10, not read off the implementation. Where a number is a quotation from DESIGN.md — the
// four motion durations — the test asserts the quoted figure, so a drift in the code is a
// failure rather than a silent redefinition.

import { describe, expect, it } from 'vitest';
import { MOCK_RESULT } from '../../types';
import { BURST_KILLS } from './mock-variants';
import {
  GHOST_MS,
  LETHAL_MS,
  ODOMETER_MS,
  STEP_MS,
  buildBurndownModel,
  niceTicks,
  odometerAt,
  playbackDurationMs,
  ruleShift,
  verdictText,
  worstOf,
} from './geometry';

describe('burndown/columns', () => {
  const model = buildBurndownModel(MOCK_RESULT);

  it('has one column per instance plus the appended +DoT column', () => {
    expect(model.columns.length).toBe(6);
    expect(model.burstColumnCount).toBe(5);
    expect(model.hasDot).toBe(true);
    expect(model.columns.map((c) => c.axisLabel)).toEqual([
      'inst 1',
      'inst 2',
      'inst 3',
      'inst 4',
      'inst 5',
      '+DoT',
    ]);
  });

  it('takes each column’s damage from the running total, not from `final`', () => {
    expect(model.columns.filter((c) => c.kind === 'burst').map((c) => c.damage)).toEqual([
      240, 180, 200, 0, 150,
    ]);
  });

  it('walks health down from the defender’s ENTRY health, which is below max', () => {
    // The scenario is a moment in time (SPECIFICATION §3.3): 800 of 1850.
    expect(model.startHp).toBe(800);
    expect(model.maxHp).toBe(1850);
    expect(model.columns.map((c) => c.hpBefore)).toEqual([800, 560, 380, 180, 180, 30]);
    expect(model.columns.map((c) => c.hpAfter)).toEqual([560, 380, 180, 180, 30, 0]);
  });

  it('clamps a riser at zero — health never goes negative', () => {
    // PREMISE CHANGED, not the assertion. The burst used to reach zero on instance 5; with
    // instance 4 contributing nothing it now leaves 30, so the clamp is demonstrated on the
    // +DoT column, which is what actually crosses. The last burst column is checked alongside
    // it to show the ordinary, unclamped case.
    const lastBurst = model.columns[4]!;
    expect(lastBurst.damage).toBe(150);
    expect(lastBurst.hpBefore).toBe(180);
    expect(lastBurst.hpAfter).toBe(30); // 150 fits: no clamp

    const dot = model.columns[5]!;
    expect(dot.damage).toBe(160); // the label still states the full 160
    expect(dot.hpBefore).toBe(30); // but the riser can only drop 30
    expect(dot.riserBottom).toBe(0);
  });

  it('scales every plateau against max health, so the Y axis is HP', () => {
    expect(model.columns[0]!.treadFraction).toBeCloseTo(800 / 1850, 10);
    expect(model.columns[1]!.treadFraction).toBeCloseTo(560 / 1850, 10);
  });

  it('gives the +DoT column one hatched segment per non-zero DoT type', () => {
    const dot = model.columns[5]!;
    expect(dot.kind).toBe('dot');
    expect(dot.segments.map((s) => [s.damageType, s.damage])).toEqual([['magic', 160]]);
    expect(dot.damageType).toBe('magic');
  });

  it('never folds DoT into the burst total', () => {
    expect(model.burst.total).toBe(770);
    expect(model.columns[5]!.damage).toBe(160);
  });
});

describe('burndown/ticks', () => {
  it('picks rounded HP intervals and adds the axis top when it will not collide', () => {
    expect(niceTicks(1850)).toEqual([0, 500, 1000, 1500, 1850]);
  });

  it('omits the axis top when it lands within half a step of the last tick', () => {
    // 2100 with a 500 step gives 0…2000, and 2100 − 2000 = 100 < 250, so it is dropped.
    expect(niceTicks(2100)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('always includes zero, and survives a degenerate axis', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(1850)[0]).toBe(0);
  });
});

describe('burndown/lethal', () => {
  it('draws no solid rule when the burst survives, and the DASHED one where the burn crosses', () => {
    // PREMISE CHANGED, not the assertion. The canonical mock's burst no longer kills, so this
    // is now the case DESIGN.md §7 describes for the second, dashed rule. The solid rule is
    // covered against BURST_KILLS in HpBurndown.test.tsx.
    const model = buildBurndownModel(MOCK_RESULT);
    expect(model.lethalAtInstance).toBe(null);
    expect(model.lethalRuleFraction).toBeNull();
    expect(model.dotLethalRuleFraction).toBeCloseTo(1, 10);
  });

  it('draws the SOLID rule and no dashed one when the burst itself kills', () => {
    // The mirror of the case above, on the derived lethal variant. Between the two, both
    // branches DESIGN.md §7 specifies have a fixture behind them — which is why the variant
    // exists at all.
    const model = buildBurndownModel(BURST_KILLS);
    expect(model.lethalAtInstance).toBe(5);
    expect(model.lethalRuleFraction).toBeCloseTo(5 / 6, 10);
    expect(model.dotLethalRuleFraction).toBeNull();
  });

  it('keeps a rule’s stroke inside the plot at either edge', () => {
    expect(ruleShift(0.8333)).toBe('translateX(-50%)');
    expect(ruleShift(1)).toBe('translateX(-100%)');
    expect(ruleShift(0)).toBe('translateX(0)');
  });

  it('prints both verdicts in DESIGN.md §7’s exact words', () => {
    expect(verdictText('Burst', { lethal: false, remainingHp: 512 })).toBe(
      'Burst: SURVIVES 512 HP',
    );
    expect(verdictText('Burst + DoT', { lethal: true, remainingHp: 0 })).toBe(
      'Burst + DoT: LETHAL',
    );
    const model = buildBurndownModel(MOCK_RESULT);
    expect(model.burstVerdictText).toBe('Burst: SURVIVES 30 HP');
    expect(model.dotVerdictText).toBe('Burst + DoT: LETHAL');
  });
});

describe('burndown/verification', () => {
  it('never invents a status for an empty set — least of all `verified`', () => {
    expect(worstOf([])).toBeNull();
  });

  it('worst wins', () => {
    expect(worstOf(['verified', 'derived'])).toBe('derived');
    expect(worstOf(['derived', 'incomplete'])).toBe('incomplete');
    expect(worstOf(['verified'])).toBe('verified');
  });

  it('carries each instance’s status onto its column', () => {
    const model = buildBurndownModel(MOCK_RESULT);
    expect(model.columns.slice(0, 5).map((c) => c.verification)).toEqual([
      'verified',
      'verified',
      'derived',
      'incomplete',
      'verified',
    ]);
    expect(model.columns[3]!.incompleteReason?.kind).toBe('pending');
  });
});

describe('burndown/motion', () => {
  it('quotes DESIGN.md §10’s four durations exactly', () => {
    expect(STEP_MS).toBe(120);
    expect(ODOMETER_MS).toBe(300);
    expect(GHOST_MS).toBe(600);
    expect(LETHAL_MS).toBe(180);
  });

  it('settles after (steps − 1) × 120ms + 300ms', () => {
    expect(playbackDurationMs(5)).toBe(780);
    expect(playbackDurationMs(1)).toBe(300);
    expect(playbackDurationMs(0)).toBe(0);
  });
});

describe('burndown/odometer', () => {
  const cumulative = buildBurndownModel(MOCK_RESULT).cumulativeByType;

  it('accumulates by damage type across the combo', () => {
    expect(cumulative).toEqual([
      { physical: 240, magic: 0, true: 0 },
      { physical: 420, magic: 0, true: 0 },
      { physical: 420, magic: 200, true: 0 },
      { physical: 420, magic: 200, true: 0 },
      { physical: 570, magic: 200, true: 0 },
    ]);
  });

  it('starts at zero and ends at the burst total', () => {
    expect(odometerAt(0, cumulative)).toEqual({
      total: 0,
      byType: { physical: 0, magic: 0, true: 0 },
    });
    const settled = odometerAt(playbackDurationMs(5), cumulative);
    expect(settled.total).toBe(770);
    expect(settled.byType).toEqual({ physical: 570, magic: 200, true: 0 });
  });

  it('rolls linearly between steps — 10% of the way into step 2 is 258', () => {
    // Step 2 lands at 120ms and rolls 240 → 420 over 300ms. At 150ms, t = 0.1.
    expect(odometerAt(150, cumulative).total).toBe(258);
  });

  it('THE SPLIT ALWAYS SUMS TO THE TOTAL — every frame, or AggregateTotal would refuse it', () => {
    const bad: number[] = [];
    for (let t = 0; t <= playbackDurationMs(5) + 200; t += 7) {
      const v = odometerAt(t, cumulative);
      const sum = v.byType.physical + v.byType.magic + v.byType.true;
      if (Math.abs(sum - v.total) > 1e-6) bad.push(t);
    }
    expect(bad).toEqual([]);
  });

  it('rounds mid-roll frames but never the settled figure', () => {
    const mid = odometerAt(150, cumulative);
    expect(Number.isInteger(mid.byType.physical)).toBe(true);
    // A settled fractional value passes straight through.
    const fractional = [{ physical: 12.5, magic: 0, true: 0 }];
    expect(odometerAt(1000, fractional).total).toBe(12.5);
  });

  it('is stable on an empty combo', () => {
    expect(odometerAt(0, []).total).toBe(0);
    expect(odometerAt(9999, []).total).toBe(0);
  });
});
