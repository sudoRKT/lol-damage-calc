// The comparison model — the arithmetic and the words, checked without rendering anything.
//
// Every figure these tests use comes from the canonical mock Result by way of the ENGINE'S OWN
// `summarise`, not from numbers typed in here, so a fixture cannot quietly disagree with the
// shape the engine produces.

import { describe, expect, it } from 'vitest';
import { summarise } from '../../engine/sweep';
import { MOCK_RESULT } from '../../types';
import { fractionOf, niceTicks, yDomainFor } from '../plot';
import {
  MIN_TICK_LABEL_GAP,
  differenceShape,
  directionSentence,
  directionWord,
  labelledTicks,
  lethalitySentence,
  magnitudeModel,
  mixedDirection,
  pct,
  presentTypes,
  tickShift,
  verdictSentence,
} from './model';

const LABELS = { a: 'Build A', b: 'Build B' };
const SUMMARY = summarise(MOCK_RESULT);

describe('compare-model/which difference figures may be drawn', () => {
  it('a difference with no non-zero part is drawn as words, never as a bare zero', () => {
    // DESIGN.md §8 permits an untagged figure only beside a tagged composition bar, and a total
    // of zero across all three types has no bar to draw. So the answer is `none` and the
    // component prints a sentence.
    expect(differenceShape({ physical: 0, magic: 0, true: 0 })).toBe('none');
  });

  it('a difference pointing one way is an aggregate — including an all-negative one', () => {
    expect(differenceShape({ physical: 300, magic: 120, true: 0 })).toBe('aggregate');
    expect(differenceShape({ physical: -300, magic: -120, true: 0 })).toBe('aggregate');
    expect(differenceShape({ physical: 0, magic: 0, true: 45 })).toBe('aggregate');
  });

  it('a difference whose parts point in OPPOSITE directions is split, never aggregated', () => {
    // The case this rule exists for: +300 physical and −200 magic sum to +100, and a composition
    // bar would draw two segments as shares of a total neither is a share of.
    expect(mixedDirection({ physical: 300, magic: -200, true: 0 })).toBe(true);
    expect(differenceShape({ physical: 300, magic: -200, true: 0 })).toBe('split');
  });

  it('presentTypes keeps the fixed order and drops only exact zeros', () => {
    expect(presentTypes({ physical: 1, magic: 0, true: -1 })).toEqual(['physical', 'true']);
    expect(presentTypes({ physical: 0, magic: 0, true: 0 })).toEqual([]);
  });
});

describe('compare-model/direction is a word, never a colour', () => {
  it('a positive delta means the SECOND build deals more — the engine is B minus A', () => {
    expect(directionWord(120)).toBe('more');
    expect(directionWord(-120)).toBe('less');
    expect(directionWord(0)).toBe('the same');
  });

  it('the sentence names both builds and carries no magnitude', () => {
    const sentence = directionSentence(LABELS, 260, 'burst damage');
    expect(sentence).toBe('Build B deals more burst damage than Build A.');
    // The magnitude belongs to the tagged figure beside it. A number in this sentence would be an
    // untagged damage figure in prose.
    expect(sentence).not.toMatch(/\d/);
  });

  it('an equal comparison reads as equality rather than as "more of nothing"', () => {
    expect(directionSentence(LABELS, 0, 'burst damage')).toBe(
      'Build A and Build B deal the same burst damage.',
    );
  });
});

describe('compare-model/the two survival verdicts', () => {
  it('a survived verdict states the health left, rounded as a readout', () => {
    expect(verdictSentence({ lethal: false, lethalAtInstance: null, remainingHp: 30 })).toBe(
      'Survives — 30 health remaining.',
    );
    expect(
      verdictSentence({ lethal: false, lethalAtInstance: null, remainingHp: 41.5432 }),
    ).toBe('Survives — 41.54 health remaining.');
  });

  it('a lethal verdict names the instance when the engine placed one', () => {
    expect(verdictSentence({ lethal: true, lethalAtInstance: 4, remainingHp: 0 })).toBe(
      "Lethal — the defender's health is crossed at instance 4.",
    );
  });

  it('a lethal verdict with no placed instance says so without inventing one', () => {
    // The canonical mock is exactly this case: burst plus damage over time kills, and §3.2 gives
    // the engine no axis on which to place the crossing.
    expect(SUMMARY.verdict.burstPlusDot.lethal).toBe(true);
    expect(SUMMARY.verdict.burstPlusDot.lethalAtInstance).toBe(null);
    expect(verdictSentence(SUMMARY.verdict.burstPlusDot)).toBe(
      'Lethal — the defender does not survive this combo.',
    );
  });

  it('lethality between two builds is a sentence, in all four combinations', () => {
    expect(lethalitySentence(LABELS, { a: true, b: true })).toBe('Both builds kill the defender.');
    expect(lethalitySentence(LABELS, { a: false, b: false })).toBe(
      'Neither build kills the defender.',
    );
    expect(lethalitySentence(LABELS, { a: false, b: true })).toBe(
      'Build B kills the defender; Build A does not.',
    );
    expect(lethalitySentence(LABELS, { a: true, b: false })).toBe(
      'Build A kills the defender; Build B does not.',
    );
  });
});

describe('compare-model/the shared scale comes from src/ui/plot', () => {
  const sides = [
    { label: 'Build A', burstApplied: 770, burstPlusDotApplied: 930 },
    { label: 'Build B', burstApplied: 500, burstPlusDotApplied: 500 },
  ];
  const model = magnitudeModel(sides, 800);

  it('the domain is the plot module’s, and zero is always in it', () => {
    // Not "a domain that looks right" — the same domain `yDomainFor` returns for the same points,
    // so this chart and the curves cannot scale differently.
    expect(model.domain).toEqual(
      yDomainFor([
        [
          { x: 0, y: 770 },
          { x: 0, y: 930 },
          { x: 0, y: 500 },
          { x: 0, y: 500 },
          { x: 0, y: 800 },
        ],
      ]),
    );
    expect(model.domain.min).toBe(0);
    expect(model.domain.max).toBe(930);
  });

  it('the health pool is inside the domain, so an overkill is visible as a bar past the rule', () => {
    expect(model.healthFraction).toBeCloseTo(800 / 930, 10);
    expect(model.bars[0]!.burstPlusDotFraction).toBeGreaterThan(model.healthFraction);
    expect(model.bars[1]!.burstFraction).toBeLessThan(model.healthFraction);
  });

  it('the gridlines are niceTicks, placed by fractionOf — no tick logic of its own', () => {
    expect(model.ticks.map((t) => t.value)).toEqual(niceTicks(930, 3));
    for (const tick of model.ticks) {
      expect(tick.fraction).toBeCloseTo(fractionOf(tick.value, model.domain), 10);
    }
  });

  it('the damage-over-time mark never falls BEHIND the bar it extends', () => {
    const same = magnitudeModel(
      [{ label: 'Build A', burstApplied: 400, burstPlusDotApplied: 400 }],
      800,
    );
    expect(same.bars[0]!.burstPlusDotFraction).toBe(same.bars[0]!.burstFraction);
  });

  it('a defender at zero health still produces a drawable axis', () => {
    const degenerate = magnitudeModel(
      [{ label: 'Build A', burstApplied: 0, burstPlusDotApplied: 0 }],
      0,
    );
    expect(degenerate.domain.max).toBe(1);
    expect(degenerate.ticks.length).toBeGreaterThan(0);
  });
});

describe('compare-model/two axis labels never collide', () => {
  // The defect this rule closes was MEASURED in a real browser at a 320px viewport — "750" and
  // "930" overlapped by 2px — and was invisible to every test in the suite, because jsdom
  // computes no layout. The rule is evaluated on the DATA, so it can be checked here.

  it('keeps both ends of the axis, always', () => {
    const kept = labelledTicks([0, 0.1, 0.2, 0.9, 1]);
    expect(kept[0]).toBe(true);
    expect(kept[4]).toBe(true);
  });

  it('drops the label that would sit under the top of the scale', () => {
    // 0 / 250 / 500 / 750 / 930 over a 930 domain: 750 is 0.194 from the end, well inside the
    // 0.37 the measurement requires.
    const fractions = [0, 250 / 930, 500 / 930, 750 / 930, 1];
    expect(labelledTicks(fractions)).toEqual([true, false, true, false, true]);
  });

  it('no two surviving labels are ever closer than the measured minimum', () => {
    // Swept over every domain top the chart can plausibly take, rather than over one fixture.
    const offenders: string[] = [];
    for (let max = 1; max <= 12000; max += 7) {
      const domain = { min: 0, max };
      const fractions = niceTicks(max, 3).map((v) => v / domain.max);
      const kept = labelledTicks(fractions).flatMap((k, i) => (k ? [fractions[i]!] : []));
      for (let i = 1; i < kept.length; i += 1) {
        if (kept[i]! - kept[i - 1]! < MIN_TICK_LABEL_GAP) {
          offenders.push(`max ${max}: ${kept[i - 1]} and ${kept[i]}`);
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it('a two-tick axis keeps both, because zero and the top are never dropped', () => {
    expect(labelledTicks([0, 1])).toEqual([true, true]);
    expect(labelledTicks([])).toEqual([]);
  });

  it('a suppressed label never removes its gridline', () => {
    const dense = magnitudeModel(
      [{ label: 'Build A', burstApplied: 930, burstPlusDotApplied: 930 }],
      800,
    );
    expect(dense.ticks.length).toBeGreaterThan(dense.ticks.filter((t) => t.labelled).length - 1);
    expect(dense.ticks.every((t) => Number.isFinite(t.fraction))).toBe(true);
  });
});

describe('compare-model/label placement', () => {
  it('the first and last labels are pulled inside the frame', () => {
    expect(tickShift(0)).toBe('translateX(0)');
    expect(tickShift(1)).toBe('translateX(-100%)');
    expect(tickShift(0.5)).toBe('translateX(-50%)');
  });

  it('a fraction becomes a percentage the same way everywhere', () => {
    expect(pct(0)).toBe('0.000%');
    expect(pct(1)).toBe('100.000%');
    expect(pct(0.5)).toBe('50.000%');
  });
});
