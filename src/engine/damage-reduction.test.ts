// Known-answer tests for POST-MITIGATION damage reduction on the defender
// (SPECIFICATION §3.7 "Flat and percentage damage reduction effects", §5 "Defensive runes …
// Bone Plating … resolves against the instance counter directly").
//
// Every expected number is arithmetic done by hand, written out above the assertion.
//
// Source, read 2026-08-13 — https://wiki.leagueoflegends.com/en-us/Damage_reduction :
//   "Flat damage reduction does not work against true damage."
//   "Some flat damage reductions are factored in after armor or magic resistance."
//   "Damage reduction from armor and magic resistance and from any other sources stack
//    multiplicatively."
// The page's "Flat Damage Reduction" section splits into "Pre-mitigation" and
// "Post-mitigation". Only POST-mitigation is modelled here; see damage-reduction.ts.

import { describe, it, expect } from 'vitest';
import {
  applyDamageReductions,
  reductionApplies,
  type DefenderDamageReduction,
} from './damage-reduction';

describe('applyDamageReductions — percentage reductions', () => {
  it('combines multiple percentage reductions MULTIPLICATIVELY', () => {
    // Wiki: reductions "from any other sources stack multiplicatively".
    // 30% and 25% leave 0.70 x 0.75 = 0.525 of the damage.
    // 400 x 0.525 = 210. Adding them (55%) would give 180 — a different product.
    const rules: DefenderDamageReduction[] = [
      { label: 'a', percent: 0.3 },
      { label: 'b', percent: 0.25 },
    ];
    expect(applyDamageReductions(400, rules, 1, 'magic')).toBeCloseTo(210, 9);
  });

  it('applies percentage reduction to true damage', () => {
    // The wiki's exemption is stated for FLAT reduction only. Nothing on the page exempts
    // true damage from percentage damage-received modifiers, so none is invented here.
    expect(applyDamageReductions(400, [{ label: 'a', percent: 0.25 }], 1, 'true')).toBeCloseTo(
      300,
      9,
    );
  });
});

describe('applyDamageReductions — flat reduction', () => {
  it('subtracts flat reduction after resistances', () => {
    // 200 after resistances, 30 flat: 200 - 30 = 170.
    expect(applyDamageReductions(200, [{ label: 'bone', flat: 30 }], 1, 'physical')).toBe(170);
  });

  it('does NOT apply flat reduction to true damage', () => {
    // Wiki, read 2026-08-13: "Flat damage reduction does not work against true damage."
    expect(applyDamageReductions(200, [{ label: 'bone', flat: 30 }], 1, 'true')).toBe(200);
  });

  it('adds flat reduction from several sources', () => {
    // 200 - 30 - 12 = 158.
    const rules: DefenderDamageReduction[] = [
      { label: 'bone', flat: 30 },
      { label: 'mail', flat: 12 },
    ];
    expect(applyDamageReductions(200, rules, 1, 'physical')).toBe(158);
  });

  it('floors the result at zero rather than returning negative damage', () => {
    // 20 after resistances, 50 flat reduction. Negative damage would be healing.
    expect(applyDamageReductions(20, [{ label: 'bone', flat: 50 }], 1, 'physical')).toBe(0);
  });
});

describe('applyDamageReductions — the order of the two kinds', () => {
  it('applies percentage reduction BEFORE flat reduction (engine convention, NOT sourced)', () => {
    // 200 after resistances, a 25% reduction and a 30-point flat reduction.
    //   percent first : 200 x 0.75 = 150, then - 30 = 120
    //   flat first    : 200 - 30 = 170, then x 0.75 = 127.5
    // The engine takes the first reading, because the wiki groups percentage modifiers with
    // the resistance multiplier ("stack multiplicatively") while describing post-mitigation
    // flat reduction as a separate later subtraction. THE WIKI DOES NOT STATE THE ORDER
    // BETWEEN THEM; this test pins an engine convention so it cannot drift silently, and the
    // convention is reported to the lead rather than presented as sourced.
    const rules: DefenderDamageReduction[] = [
      { label: 'pct', percent: 0.25 },
      { label: 'flat', flat: 30 },
    ];
    expect(applyDamageReductions(200, rules, 1, 'physical')).toBeCloseTo(120, 9);
  });
});

describe('reductionApplies — the instance window (SPECIFICATION §5)', () => {
  // Bone Plating "reduces damage from the first three instances an attacker delivers".
  const bonePlating: DefenderDamageReduction = {
    label: 'Bone Plating',
    flat: 30,
    firstInstance: 1,
    lastInstance: 3,
  };

  it('applies to instances 1, 2 and 3 and not to instance 4', () => {
    expect(reductionApplies(bonePlating, 1, 'physical')).toBe(true);
    expect(reductionApplies(bonePlating, 2, 'physical')).toBe(true);
    expect(reductionApplies(bonePlating, 3, 'physical')).toBe(true);
    expect(reductionApplies(bonePlating, 4, 'physical')).toBe(false);
  });

  it('takes 200 down to 170 inside the window and leaves it at 200 outside it', () => {
    expect(applyDamageReductions(200, [bonePlating], 3, 'physical')).toBe(170);
    expect(applyDamageReductions(200, [bonePlating], 4, 'physical')).toBe(200);
  });

  it('does not apply a windowed rule to damage over time', () => {
    // A DoT total is delivered "following the combo" (§3.8) and is not an instance, so a
    // window stated in instances has no meaning for it. `null` is how the runner says so.
    expect(reductionApplies(bonePlating, null, 'physical')).toBe(false);
    expect(applyDamageReductions(200, [bonePlating], null, 'physical')).toBe(200);
  });

  it('applies an UNWINDOWED rule to damage over time', () => {
    // An always-on reduction has no instance dependency, so it reaches the DoT line too.
    // 200 x 0.75 = 150.
    expect(applyDamageReductions(200, [{ label: 'always', percent: 0.25 }], null, 'magic')).toBe(
      150,
    );
  });
});

describe('reductionApplies — the damage-type filter', () => {
  const physicalOnly: DefenderDamageReduction = {
    label: 'physical only',
    percent: 0.5,
    damageTypes: ['physical'],
  };

  it('applies only to the damage types it names', () => {
    expect(reductionApplies(physicalOnly, 1, 'physical')).toBe(true);
    expect(reductionApplies(physicalOnly, 1, 'magic')).toBe(false);
    expect(applyDamageReductions(200, [physicalOnly], 1, 'physical')).toBe(100);
    expect(applyDamageReductions(200, [physicalOnly], 1, 'magic')).toBe(200);
  });

  it('applies to all three types when it names none', () => {
    const all: DefenderDamageReduction = { label: 'all', percent: 0.5 };
    expect(applyDamageReductions(200, [all], 1, 'physical')).toBe(100);
    expect(applyDamageReductions(200, [all], 1, 'magic')).toBe(100);
    expect(applyDamageReductions(200, [all], 1, 'true')).toBe(100);
  });
});

describe('applyDamageReductions — nothing to apply', () => {
  it('returns the figure unchanged when there are no rules', () => {
    expect(applyDamageReductions(123.456, [], 1, 'magic')).toBe(123.456);
  });
});
