// Known-answer tests for the gate-7 class detectors.
//
// Every fixture is hand-built from the shape the real entry has, and every expected value is
// worked out from the definition rather than from what the detector returns.

import { describe, expect, it } from 'vitest';

import { classifyGate7, summariseGate7Classes } from './gate7-classes.ts';
import type { TotalMismatchEvidence } from './harvest.ts';

const component = (
  label: string,
  series: number[] | null,
  extra: { hits?: number; alternative?: boolean } = {},
) => ({
  id: label.toLowerCase().replace(/\s+/g, '-'),
  label,
  hits: extra.hits ?? 1,
  alternative: extra.alternative ?? false,
  series,
});

const evidence = (
  stated: number[],
  components: TotalMismatchEvidence['components'],
  totals = 1,
): TotalMismatchEvidence => ({ stated, howManyWholeAbilityTotals: totals, components });

describe('U-MULT1 — a missing multiplicity', () => {
  it("names the multiplier when the total is a constant whole multiple at every rank", () => {
    // Riven Q: Broken Wings activates three times. One stored component, total exactly 3x.
    const f = classifyGate7(
      evidence([90, 120, 150, 180, 210], [component('Physical Damage', [30, 40, 50, 60, 70])]),
    );
    expect(f.class).toBe('U-MULT1');
    expect(f.detail).toContain('exactly 3x');
  });

  it('refuses a ratio that is whole at one rank and not at the others', () => {
    // THE COINCIDENCE GUARD. 100/50 is exactly 2 at rank 1, and nothing like a whole number
    // after that. A detector that looked only at rank 1 would report a hit count of 2 and be
    // wrong at every other rank.
    const f = classifyGate7(
      evidence([100, 130, 170, 220, 280], [component('Physical Damage', [50, 60, 70, 80, 90])]),
    );
    expect(f.class).toBe('RESIDUE');
  });

  it('refuses a multiple of one, which is not a multiplicity at all', () => {
    const f = classifyGate7(
      evidence([50, 60, 70], [component('Magic Damage', [50, 60, 70]), component('Other', [1, 1, 1])]),
    );
    expect(f.class).not.toBe('U-MULT1');
  });
});

describe('U-MULT2 — a detector, and it says so when it cannot choose', () => {
  it('reports the single reading that reconciles, and flags it as needing a person', () => {
    // Deliberately ASYMMETRIC. Dropping "Bonus" leaves 50/100 and the stated total is exactly
    // 4x that at both ranks; dropping "Magic Damage" leaves 30/60, which divides into 200 as
    // 6.67 and reconciles nowhere. Exactly one reading survives.
    //
    // My first fixture here used two identical components, which meant dropping either one gave
    // the same answer and the detector correctly reported TWO readings. The fixture was wrong,
    // not the detector — recorded because a symmetric fixture is an easy trap to re-lay.
    const f = classifyGate7(
      evidence(
        [200, 400],
        [component('Magic Damage', [50, 100]), component('Bonus Magic Damage', [30, 60])],
      ),
    );
    expect(f.class).toBe('U-MULT2');
    expect(f.ambiguous).toBe(true);
    expect(f.detail).toContain('NOT A FIX');
  });

  it('REFUSES TO CHOOSE when two different readings both reconcile at every rank', () => {
    // This is Ziggs E and its three kin: one mine landing five times, or one full mine plus ten
    // reduced ones. Both arithmetics are exact. The contract cannot express the second shape and
    // no rule may pick between them.
    const f = classifyGate7(
      evidence([300, 600], [component('A', [100, 200]), component('B', [100, 200])]),
    );
    expect(f.class).toBe('U-MULT2');
    expect(f.ambiguous).toBe(true);
    expect(f.detail).toContain('cannot choose');
  });
});

describe('O-SCOPE — the total covers one component, not the ability', () => {
  it('spots a total that is exactly one repeating component times its hit count', () => {
    // Dr. Mundo W: the "Total" is the burn alone, and the label does not say so.
    const f = classifyGate7(
      evidence(
        [80, 120],
        [component('Magic Damage Per Tick', [10, 15], { hits: 8 }), component('Impact', [50, 70])],
      ),
    );
    expect(f.class).toBe('O-SCOPE');
    expect(f.detail).toContain('Per Tick');
  });
});

describe('O-PAIR — a Maximum whose sibling is unlabelled', () => {
  it('spots the unmatched pair rather than calling it a double count of nothing', () => {
    const f = classifyGate7(
      evidence(
        [100, 200],
        [component('Magic Damage', [100, 200]), component('Maximum Magic Damage', [100, 200])],
      ),
    );
    expect(f.class).toBe('O-PAIR');
    expect(f.detail).toContain('Maximum Magic Damage');
  });
});

describe('MULTIPLE-TOTALS is checked before anything else', () => {
  it('refuses to reason about which total was picked', () => {
    // 16 pages print more than one qualifying total and gate 7 takes the first. On three of them
    // that is the narrow damage-over-time row. Every other class would be reasoning about the
    // wrong number, so this one wins even when another would also match.
    const f = classifyGate7(
      evidence([90, 120], [component('Physical Damage', [30, 40])], 2),
    );
    expect(f.class).toBe('MULTIPLE-TOTALS');
    expect(f.ambiguous).toBe(true);
  });
});

describe('alternatives are never summed', () => {
  it('excludes an alternativeTo component from the sum it compares', () => {
    // The blade-or-handle shape. Summing both gives 150 against a stated 100 and reports an
    // over-sum that does not exist.
    const f = classifyGate7(
      evidence(
        [100, 200],
        [
          component('Physical Damage', [100, 200]),
          component('Reduced Damage', [50, 100], { alternative: true }),
        ],
      ),
    );
    // 100 vs 100 is not a mismatch at all, so nothing over-sums; it falls through to residue
    // rather than being reported as a double count.
    expect(f.class).toBe('RESIDUE');
  });
});

describe('the roll-up reports populations with their classes', () => {
  it('counts entries per class and carries the ambiguous share', () => {
    const rolled = summariseGate7Classes([
      { entry: 'Riven/Q/Broken Wings', finding: { class: 'U-MULT1', detail: '' } },
      { entry: 'Aatrox/W/Infernal Chains', finding: { class: 'U-MULT1', detail: '' } },
      { entry: 'Ziggs/E/Hexplosive Minefield', finding: { class: 'U-MULT2', detail: '', ambiguous: true } },
    ]);
    expect(rolled[0]).toMatchObject({ class: 'U-MULT1', entries: 2, ambiguous: 0 });
    expect(rolled[1]).toMatchObject({ class: 'U-MULT2', entries: 1, ambiguous: 1 });
  });
});
