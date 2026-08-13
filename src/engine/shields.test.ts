// KNOWN-ANSWER TESTS FOR SHIELDS, ALL THREE KINDS (SPECIFICATION §3.7, "Shields, separated
// into physical, magic, and general").
//
// WHAT THE SOURCE SAYS. https://wiki.leagueoflegends.com/en-us/Shield, read from the page's own
// wikitext through the MediaWiki API on 2026-08-13:
//   - "Shields are an addition of hit-points that absorb damage in place of actual health."
//   - "The unit's resistances (armor and magic resistance) will still mitigate the damage
//      BEFORE being absorbed by shielding."
//   - "Normal shields: They absorb ALL types of damage (physical, magic and true)."
//   - "Magic shields: They only absorb magic damage."
//   - "Physical shields: They only absorb physical damage."
//   - "When shielded from multiple sources, damage taken is mitigated by the shield that will
//      EXPIRE THE SOONEST" — a rule this engine cannot evaluate, because it models sequence and
//      not time (§3.2). See the note on order below.
//
// Every expected number is arithmetic done by hand from those rules.

import { describe, it, expect } from 'vitest';
import { absorbsDamageType, applyShields, type ShieldPool } from './shields';

function pool(label: string, kind: ShieldPool['kind'], remaining: number): ShieldPool {
  return { label, kind, remaining };
}

describe('absorbsDamageType — which kind stops which damage', () => {
  it('lets a general shield absorb all three types, true damage included', () => {
    // "Normal shields: They absorb all types of damage (physical, magic and true)."
    // This is where a shield differs from flat damage reduction, which "does not work against
    // true damage" (Damage modifier article). The two must not be modelled the same way.
    expect(absorbsDamageType('general', 'physical')).toBe(true);
    expect(absorbsDamageType('general', 'magic')).toBe(true);
    expect(absorbsDamageType('general', 'true')).toBe(true);
  });

  it('lets a magic shield absorb magic alone', () => {
    expect(absorbsDamageType('magic', 'magic')).toBe(true);
    expect(absorbsDamageType('magic', 'physical')).toBe(false);
    expect(absorbsDamageType('magic', 'true')).toBe(false);
  });

  it('lets a physical shield absorb physical alone', () => {
    expect(absorbsDamageType('physical', 'physical')).toBe(true);
    expect(absorbsDamageType('physical', 'magic')).toBe(false);
    expect(absorbsDamageType('physical', 'true')).toBe(false);
  });
});

describe('applyShields — one shield against one instance', () => {
  it('absorbs the whole hit and applies nothing to health', () => {
    // 200 damage into a 500 shield: 200 absorbed, 0 applied, 300 left standing.
    const outcome = applyShields([pool('Barrier', 'general', 500)], 'magic', 200);
    expect(outcome.absorbed).toBe(200);
    expect(outcome.applied).toBe(0);
    expect(outcome.pools[0].remaining).toBe(300);
  });

  it('breaks, and lets the excess through to health', () => {
    // 200 damage into a 120 shield: 120 absorbed, 80 applied, shield left at 0.
    const outcome = applyShields([pool('Barrier', 'general', 120)], 'physical', 200);
    expect(outcome.absorbed).toBe(120);
    expect(outcome.applied).toBe(80);
    expect(outcome.pools[0].remaining).toBe(0);
  });

  it('absorbs nothing of a type it does not cover', () => {
    // A 500 magic shield against 200 PHYSICAL damage absorbs nothing at all.
    const outcome = applyShields([pool('Black Shield', 'magic', 500)], 'physical', 200);
    expect(outcome.absorbed).toBe(0);
    expect(outcome.applied).toBe(200);
    expect(outcome.pools[0].remaining).toBe(500);
  });

  it('leaves an exhausted shield out of the arithmetic', () => {
    const outcome = applyShields([pool('spent', 'general', 0)], 'magic', 200);
    expect(outcome.absorbed).toBe(0);
    expect(outcome.applied).toBe(200);
  });
});

describe('applyShields — several shields at once', () => {
  it('spends them in the order the scenario lists them, first to last', () => {
    // AN ENGINE CONVENTION, DISCLOSED. The game spends "the shield that will expire the
    // soonest", and this engine has no time dimension at all (§3.2), so there is no expiry to
    // compare. List order is the only ordering fact available, and it is the user's own.
    //
    // 250 magic damage against a 100 magic shield then a 400 general shield:
    //   100 into the magic shield, which breaks; 150 into the general shield, leaving 250.
    const outcome = applyShields(
      [pool('magic first', 'magic', 100), pool('general second', 'general', 400)],
      'magic',
      250,
    );
    expect(outcome.absorbed).toBe(250);
    expect(outcome.applied).toBe(0);
    expect(outcome.pools[0].remaining).toBe(0);
    expect(outcome.pools[1].remaining).toBe(250);
  });

  it('skips a shield of the wrong kind and reaches the next one', () => {
    // 250 PHYSICAL damage against a 100 magic shield then a 400 general shield. The magic
    // shield is untouched; the general shield takes the whole 250.
    const outcome = applyShields(
      [pool('magic first', 'magic', 100), pool('general second', 'general', 400)],
      'physical',
      250,
    );
    expect(outcome.pools[0].remaining).toBe(100);
    expect(outcome.pools[1].remaining).toBe(150);
    expect(outcome.applied).toBe(0);
  });

  it('breaks through every applicable shield and still applies the remainder', () => {
    // 600 physical against a 100 physical shield and a 150 general shield:
    //   100 + 150 = 250 absorbed, 350 applied.
    const outcome = applyShields(
      [pool('physical', 'physical', 100), pool('general', 'general', 150)],
      'physical',
      600,
    );
    expect(outcome.absorbed).toBe(250);
    expect(outcome.applied).toBe(350);
    expect(outcome.pools.map((p) => p.remaining)).toEqual([0, 0]);
  });

  it('itemises what each shield absorbed, so a breakdown can name them', () => {
    const outcome = applyShields(
      [pool('first', 'general', 100), pool('second', 'general', 150)],
      'true',
      200,
    );
    expect(outcome.byShield).toEqual([
      { label: 'first', absorbed: 100 },
      { label: 'second', absorbed: 100 },
    ]);
  });

  it('does not modify the pools it was given', () => {
    // The runner keeps a shield's remaining value across the whole sequence, so a function
    // that edited its argument would make an earlier instance's snapshot change after a later
    // instance resolved.
    const given = [pool('Barrier', 'general', 500)];
    applyShields(given, 'magic', 200);
    expect(given[0].remaining).toBe(500);
  });
});

describe('applyShields — nothing to absorb', () => {
  it('returns the damage untouched when there are no shields', () => {
    const outcome = applyShields([], 'physical', 200);
    expect(outcome.applied).toBe(200);
    expect(outcome.absorbed).toBe(0);
    expect(outcome.byShield).toEqual([]);
  });

  it('absorbs nothing from a zero-damage instance', () => {
    const outcome = applyShields([pool('Barrier', 'general', 500)], 'magic', 0);
    expect(outcome.absorbed).toBe(0);
    expect(outcome.pools[0].remaining).toBe(500);
  });
});
