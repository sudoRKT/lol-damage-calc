// Known-answer tests for the four-step resistance-modifier order (SPECIFICATION §3.6).
//
// The fixed order is:
//   1. flat reduction
//   2. percentage reduction
//   3. percentage penetration
//   4. flat penetration (lethality)
//
// Two of the cases below are the League wiki's own published worked examples, which are the
// highest-authority check available on this project short of the game client. Every other
// expected value is arithmetic done by hand and written out in the comment above it.
// Nothing here was obtained by running the engine.
//
// Sources read 2026-08-12:
//   https://wiki.leagueoflegends.com/en-us/Armor_penetration
//   https://wiki.leagueoflegends.com/en-us/Magic_penetration

import { describe, it, expect } from 'vitest';
import { effectiveResistance, type ResistanceModifiers } from './resistances';

describe('effectiveResistance — the wiki worked examples (read 2026-08-12)', () => {
  it("matches the wiki's magic-penetration Target A: 80 MR resolves to 17.3", () => {
    // Wiki, Magic penetration, Target A (80 magic resistance):
    //   1. flat reduction 20      : 80 - 20            = 60
    //   2. percentage reduction 30: 60 x (1 - 0.30)    = 42
    //   3. percentage pen 35      : 42 x (1 - 0.35)    = 27.3
    //   4. flat pen 10            : 27.3 - 10          = 17.3
    const result = effectiveResistance(80, {
      flatReduction: 20,
      percentReduction: 0.3,
      percentPenetration: 0.35,
      flatPenetration: 10,
    });
    expect(result).toBeCloseTo(17.3, 9);
  });

  it("matches the wiki's Target B: 18 resistance and a 30 flat reduction stops at -12", () => {
    // Wiki: "The 18 is reduced to -12 by the 30 armor reduction. The -12 is not affected by
    // any further calculations because it is less than 0."
    const result = effectiveResistance(18, {
      flatReduction: 30,
      percentReduction: 0.3,
      percentPenetration: 0.35,
      flatPenetration: 10,
    });
    expect(result).toBeCloseTo(-12, 9);
  });
});

describe('effectiveResistance — the documented floors', () => {
  it('lets flat reduction take resistance below zero', () => {
    // 30 armor - 45 flat reduction = -15. Flat reduction alone may go negative.
    expect(effectiveResistance(30, { flatReduction: 45 })).toBeCloseTo(-15, 9);
  });

  it('ignores percentage reduction once resistance is zero or less', () => {
    // -15 armor is untouched by a 40% reduction (which would otherwise make it -9).
    expect(effectiveResistance(-15, { percentReduction: 0.4 })).toBeCloseTo(-15, 9);
    expect(effectiveResistance(0, { percentReduction: 0.4 })).toBe(0);
  });

  it('ignores percentage penetration once resistance is zero or less', () => {
    // -15 armor is untouched by 45% penetration (which would otherwise make it -8.25).
    expect(effectiveResistance(-15, { percentPenetration: 0.45 })).toBeCloseTo(-15, 9);
    expect(effectiveResistance(0, { percentPenetration: 0.45 })).toBe(0);
  });

  it('stops flat penetration at zero rather than pushing resistance negative', () => {
    // 5 armor with 10 flat penetration: penetration cannot reduce armor below 0, so 0.
    expect(effectiveResistance(5, { flatPenetration: 10 })).toBe(0);
  });

  it('does not let flat penetration claw a negative resistance back toward zero', () => {
    // Already -12 after reduction: flat penetration cannot apply, so it stays -12.
    expect(effectiveResistance(-12, { flatPenetration: 10 })).toBeCloseTo(-12, 9);
  });

  it('returns the resistance unchanged when no modifiers are supplied', () => {
    expect(effectiveResistance(80, {})).toBe(80);
    expect(effectiveResistance(-30, {})).toBe(-30);
  });
});

// ---------------------------------------------------------------------------
// The order-pinning test.
//
// This is the test that stops a future refactor silently reordering the four steps.
// It rebuilds the calculation from scratch, applying the same four modifiers in a
// deliberately WRONG order, and shows that the answer changes.
// ---------------------------------------------------------------------------

/** The four steps, named. Applied one at a time so a test can choose the order. */
type StepName =
  | 'flatReduction'
  | 'percentReduction'
  | 'percentPenetration'
  | 'flatPenetration';

/**
 * A deliberately naive re-implementation used ONLY by the order-pinning test: it applies
 * the four operations in whatever order it is handed, with no floors at all. Its purpose is
 * to produce the "what if the steps were reordered" numbers, which are also written out by
 * hand in the comments below so this helper is itself checked.
 */
function applyStepsInOrder(
  resistance: number,
  modifiers: Required<ResistanceModifiers>,
  order: StepName[],
): number {
  let value = resistance;
  for (const step of order) {
    if (step === 'flatReduction') value = value - modifiers.flatReduction;
    else if (step === 'percentReduction') value = value * (1 - modifiers.percentReduction);
    else if (step === 'percentPenetration')
      value = value * (1 - modifiers.percentPenetration);
    else value = value - modifiers.flatPenetration;
  }
  return value;
}

describe('effectiveResistance — order pinning (SPECIFICATION §3.6, fixed order)', () => {
  // One case carrying a non-zero value in all four steps.
  const START = 100;
  const MODIFIERS: Required<ResistanceModifiers> = {
    flatReduction: 20,
    percentReduction: 0.25,
    percentPenetration: 0.4,
    flatPenetration: 15,
  };

  // By hand, in the specified order:
  //   1. 100 - 20        = 80
  //   2. 80  x (1-0.25)  = 60
  //   3. 60  x (1-0.40)  = 36
  //   4. 36 - 15         = 21
  const CORRECT = 21;

  it('resolves the four-step case to 21', () => {
    expect(effectiveResistance(START, MODIFIERS)).toBeCloseTo(CORRECT, 9);
  });

  it('agrees with the specified order applied step by step', () => {
    const stepByStep = applyStepsInOrder(START, MODIFIERS, [
      'flatReduction',
      'percentReduction',
      'percentPenetration',
      'flatPenetration',
    ]);
    expect(stepByStep).toBeCloseTo(CORRECT, 9);
    expect(effectiveResistance(START, MODIFIERS)).toBeCloseTo(stepByStep, 9);
  });

  it('gives a DIFFERENT answer if flat penetration is applied before percentage penetration', () => {
    //   100 - 20 = 80 ; 80 x 0.75 = 60 ; 60 - 15 = 45 ; 45 x 0.6 = 27
    const wrong = applyStepsInOrder(START, MODIFIERS, [
      'flatReduction',
      'percentReduction',
      'flatPenetration',
      'percentPenetration',
    ]);
    expect(wrong).toBeCloseTo(27, 9);
    expect(effectiveResistance(START, MODIFIERS)).not.toBeCloseTo(wrong, 6);
  });

  it('gives a DIFFERENT answer if percentage reduction is applied before flat reduction', () => {
    //   100 x 0.75 = 75 ; 75 - 20 = 55 ; 55 x 0.6 = 33 ; 33 - 15 = 18
    const wrong = applyStepsInOrder(START, MODIFIERS, [
      'percentReduction',
      'flatReduction',
      'percentPenetration',
      'flatPenetration',
    ]);
    expect(wrong).toBeCloseTo(18, 9);
    expect(effectiveResistance(START, MODIFIERS)).not.toBeCloseTo(wrong, 6);
  });

  it('gives a DIFFERENT answer if both flat steps are applied first', () => {
    //   100 - 15 = 85 ; 85 - 20 = 65 ; 65 x 0.75 = 48.75 ; 48.75 x 0.6 = 29.25
    const wrong = applyStepsInOrder(START, MODIFIERS, [
      'flatPenetration',
      'flatReduction',
      'percentReduction',
      'percentPenetration',
    ]);
    expect(wrong).toBeCloseTo(29.25, 9);
    expect(effectiveResistance(START, MODIFIERS)).not.toBeCloseTo(wrong, 6);
  });

  it('records the one swap that arithmetic cannot detect: the two percentage steps commute', () => {
    // Multiplication commutes, so swapping steps 2 and 3 alone cannot be caught by a number:
    //   100 - 20 = 80 ; 80 x 0.6 = 48 ; 48 x 0.75 = 36 ; 36 - 15 = 21  -> still 21.
    // This is stated here so nobody mistakes the absence of such a test for an oversight.
    // The floors are what distinguish them in practice: percentage REDUCTION and percentage
    // PENETRATION are both skipped at zero or less, so their relative order only matters
    // when a flat step sits between them, which the specified order never does.
    const swapped = applyStepsInOrder(START, MODIFIERS, [
      'flatReduction',
      'percentPenetration',
      'percentReduction',
      'flatPenetration',
    ]);
    expect(swapped).toBeCloseTo(CORRECT, 9);
  });
});
