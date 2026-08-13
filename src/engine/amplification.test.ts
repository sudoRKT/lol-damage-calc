// KNOWN-ANSWER TESTS FOR DAMAGE AMPLIFICATION (SPECIFICATION §3.7, "Damage amplification, with
// additive and multiplicative amplification handled distinctly").
//
// WHY THERE ARE TWO KINDS, AND WHY THEY ARE NOT A STYLE CHOICE
// -----------------------------------------------------------
// The wiki does not describe "an additive mode and a multiplicative mode" of one mechanic. It
// describes TWO DIFFERENT MECHANICS that sit at two different points of the pipeline and stack
// by two different rules. Quoted from https://wiki.leagueoflegends.com/en-us/Damage_modifier,
// read from the page's own wikitext through the MediaWiki API on 2026-08-13:
//
//   DAMAGE DEALT (the attacker's side, ADDITIVE, applied to the raw figure)
//     "The RAW value from the attack or ability is increased or decreased by the modifier and
//      then applied to the target. All damage modifiers stack ADDITIVELY."
//     Patch history, V26.09: "Undocumented: Modifiers to damage dealt now stack additively
//      instead of multiplicatively."
//
//   DAMAGE RECEIVED (the defender's side, MULTIPLICATIVE, applied to the final figure)
//     "The FINAL value from the attack or ability is increased or decreased by the modifier and
//      then directly applied to the target's health."
//     "Damage reduction from armor and magic resistance and from any other sources stack
//      MULTIPLICATIVELY."
//     Patch history, V26.09: "Modifiers to damage received still stack multiplicatively."
//
//   BOTH KINDS MAY BE TYPE-SPECIFIC
//     "Damage modifiers may also only affect specific damage sub-types (physical, magic, or
//      true)."
//
// Every expected number below is arithmetic done by hand from those two rules and written out
// above the assertion. No data file is read.

import { describe, it, expect } from 'vitest';
import {
  dealtModifierMultiplier,
  receivedModifierMultiplier,
  type DamageDealtModifier,
  type DamageReceivedModifier,
} from './amplification';

describe('dealtModifierMultiplier — the attacker\'s modifiers stack ADDITIVELY', () => {
  const twenty: DamageDealtModifier = { label: '+20%', percent: 0.2 };
  const fifteen: DamageDealtModifier = { label: '+15%', percent: 0.15 };

  it('turns 20% and 15% into one 35% increase, not into 38%', () => {
    // Additive:       1 + 0.20 + 0.15 = 1.35
    // Multiplicative: 1.20 x 1.15     = 1.38
    // On 200 raw damage that is 270 against 276 — a 6-point difference, not a rounding artefact.
    expect(dealtModifierMultiplier([twenty, fifteen], 'physical')).toBeCloseTo(1.35, 12);
    expect(dealtModifierMultiplier([twenty, fifteen], 'physical')).not.toBeCloseTo(1.38, 6);
  });

  it('subtracts a decrease from the same additive sum', () => {
    // "Decreasing damage dealt" is a section of the same article under the same additive rule.
    // 1 + 0.20 - 0.30 = 0.90.
    const decrease: DamageDealtModifier = { label: '-30%', percent: -0.3 };
    expect(dealtModifierMultiplier([twenty, decrease], 'magic')).toBeCloseTo(0.9, 12);
  });

  it('is exactly 1 when no modifier applies', () => {
    expect(dealtModifierMultiplier([], 'physical')).toBe(1);
  });

  it('ignores a modifier that names other damage types', () => {
    // 1 + 0.20 for physical; magic and true meet nothing at all.
    const physicalOnly: DamageDealtModifier = {
      label: 'physical only',
      percent: 0.2,
      damageTypes: ['physical'],
    };
    expect(dealtModifierMultiplier([physicalOnly], 'physical')).toBeCloseTo(1.2, 12);
    expect(dealtModifierMultiplier([physicalOnly], 'magic')).toBe(1);
    expect(dealtModifierMultiplier([physicalOnly], 'true')).toBe(1);
  });

  it('applies an untyped modifier to all three types, true damage included', () => {
    // The article's lead: modifiers "affect all of the damage dealt by an instance", and only
    // "may ALSO only affect specific damage sub-types". Absent means all of them.
    expect(dealtModifierMultiplier([twenty], 'true')).toBeCloseTo(1.2, 12);
  });

  it('floors at zero rather than turning damage into healing — AN ENGINE CONVENTION', () => {
    // NOT SOURCED. Nothing on the article states what happens past a 100% decrease; the
    // additive rule alone would give a negative multiplier, and negative damage is healing,
    // which is certainly wrong. Stated here so the choice is visible rather than assumed.
    const huge: DamageDealtModifier = { label: '-120%', percent: -1.2 };
    expect(dealtModifierMultiplier([huge], 'physical')).toBe(0);
  });
});

describe('receivedModifierMultiplier — the defender\'s modifiers stack MULTIPLICATIVELY', () => {
  const twenty: DamageReceivedModifier = { label: 'takes 20% more', percent: 0.2 };
  const fifteen: DamageReceivedModifier = { label: 'takes 15% more', percent: 0.15 };

  it('turns 20% and 15% into 1.38, not into 1.35', () => {
    // Multiplicative: 1.20 x 1.15 = 1.38. This is the OPPOSITE answer from the attacker's side
    // for the same two numbers, which is the whole reason §3.7 asks for them to be distinct.
    expect(receivedModifierMultiplier([twenty, fifteen], 'physical')).toBeCloseTo(1.38, 12);
    expect(receivedModifierMultiplier([twenty, fifteen], 'physical')).not.toBeCloseTo(1.35, 6);
  });

  it('combines an increase and a decrease multiplicatively', () => {
    // 1.20 x 0.75 = 0.90. Additively it would be 1 + 0.20 - 0.25 = 0.95.
    const less: DamageReceivedModifier = { label: 'takes 25% less', percent: -0.25 };
    expect(receivedModifierMultiplier([twenty, less], 'magic')).toBeCloseTo(0.9, 12);
    expect(receivedModifierMultiplier([twenty, less], 'magic')).not.toBeCloseTo(0.95, 6);
  });

  it('is exactly 1 when no modifier applies', () => {
    expect(receivedModifierMultiplier([], 'magic')).toBe(1);
  });

  it('ignores a modifier that names other damage types', () => {
    const magicOnly: DamageReceivedModifier = {
      label: 'magic only',
      percent: 0.5,
      damageTypes: ['magic'],
    };
    expect(receivedModifierMultiplier([magicOnly], 'magic')).toBeCloseTo(1.5, 12);
    expect(receivedModifierMultiplier([magicOnly], 'physical')).toBe(1);
  });

  it('floors at zero for a decrease past 100% — AN ENGINE CONVENTION', () => {
    // A single source past -100% is not something the article describes. Floored, not negated.
    const immune: DamageReceivedModifier = { label: 'takes 150% less', percent: -1.5 };
    expect(receivedModifierMultiplier([immune], 'physical')).toBe(0);
  });
});
