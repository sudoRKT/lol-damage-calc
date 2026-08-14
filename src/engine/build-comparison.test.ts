// Known-answer tests for BUILD COMPARISON — "two attacker configurations evaluated against the
// same defender side by side" (SPECIFICATION §11).
//
// The damage figures come from the same two documented rules the other sweeps use: a basic
// attack deals the attacker's TOTAL attack damage as physical damage, and physical damage against
// armor A resolves at 100 / (100 + A) (§3.6). The defender below has no armor, so a basic attack
// lands for exactly the attacker's attack damage:
//     no items:      60 base attack damage                     -> 60
//     +50 item:      60 + 50                                   -> 110
//     the difference                                           ->  50
//
// Nothing was obtained by running the engine, and no figure comes from a data file.

import { describe, it, expect } from 'vitest';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  fixtureItem,
  scenario,
} from './fixtures';
import { compareBuilds } from './build-comparison';

const ATTACKER = fixtureChampion({ apiname: 'Sweeper', adBase: 60, adPerLevel: 3 });
const OTHER_ATTACKER = fixtureChampion({ apiname: 'Rival', adBase: 60, adPerLevel: 3 });
const DEFENDER = fixtureChampion({ apiname: 'Dummy0', hpBase: 3000 });
const FRAIL_DEFENDER = fixtureChampion({ apiname: 'Frail', hpBase: 100 });

const LONG_SWORD = fixtureItem(1001, 'Fixture Sword', { FlatPhysicalDamageMod: 50 });

const ABILITIES = [
  fixtureAbility({
    champion: 'Sweeper',
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300],
  }),
  // The rival's Q is incomplete: it contributes nothing and says so (SPECIFICATION §8).
  fixtureAbility({
    champion: 'Rival',
    slot: 'Q',
    verification: 'incomplete',
    notes: 'fixture: the damage is stated in prose that has not been read',
  }),
];

const CATALOGUE = fixtureCatalogue({
  champions: [ATTACKER, OTHER_ATTACKER, DEFENDER, FRAIL_DEFENDER],
  items: [LONG_SWORD],
  abilities: ABILITIES,
});

const BASIC_ATTACK = [comboStep('s0', { kind: 'basic-attack', ref: 'basic' })];

function build(opts: {
  apiname?: string;
  items?: number[];
  defender?: string;
  defenderLevel?: number;
  defenderItems?: number[];
  combo?: typeof BASIC_ATTACK;
}) {
  return scenario({
    attacker: championConfig({
      apiname: opts.apiname ?? 'Sweeper',
      level: 1,
      items: opts.items ?? [],
      abilityRanks: { Q: 1, W: 0, E: 0, R: 0 },
    }),
    defender: championConfig({
      apiname: opts.defender ?? 'Dummy0',
      level: opts.defenderLevel ?? 1,
      items: opts.defenderItems ?? [],
    }),
    combo: opts.combo ?? BASIC_ATTACK,
  });
}

// ---------------------------------------------------------------------------------------
// "The same defender" — what it means, and what happens when it is not the same
// ---------------------------------------------------------------------------------------

describe('compareBuilds — the defender must be identically configured', () => {
  it('refuses two scenarios whose defender is at a different level, and names the field', () => {
    const outcome = compareBuilds(build({}), build({ defenderLevel: 3 }), CATALOGUE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.differences).toContain('defender.level: 1 against 3');
    expect('sides' in outcome).toBe(false);
  });

  it('refuses a different defender champion', () => {
    const outcome = compareBuilds(build({}), build({ defender: 'Frail' }), CATALOGUE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.differences[0]).toMatch(/defender\.apiname/);
  });

  it('refuses a different defender build', () => {
    const outcome = compareBuilds(build({}), build({ defenderItems: [1001] }), CATALOGUE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.differences[0]).toMatch(/defender\.items/);
  });

  it('accepts two scenarios whose defender configuration is identical', () => {
    const outcome = compareBuilds(build({}), build({ items: [1001] }), CATALOGUE);
    expect(outcome.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// The comparison itself
// ---------------------------------------------------------------------------------------

describe('compareBuilds — two builds of the same champion', () => {
  const outcome = compareBuilds(build({}), build({ items: [1001] }), CATALOGUE);
  if (!outcome.ok) throw new Error('the comparison refused, which this test does not intend');

  it('gives 60 for the item-less build and 110 for the +50 attack damage build', () => {
    if (outcome.sides.a.status !== 'computed' || outcome.sides.b.status !== 'computed') {
      throw new Error('a side refused');
    }
    expect(outcome.sides.a.summary.burst.total).toBe(60);
    expect(outcome.sides.b.summary.burst.total).toBe(110);
  });

  it('states the difference as B minus A, per type as well as in total', () => {
    expect(outcome.delta).toBeDefined();
    expect(outcome.delta!.burstTotal).toBe(50);
    expect(outcome.delta!.burstByType).toEqual({ physical: 50, magic: 0, true: 0 });
  });

  it('carries no confounded block when both sides modelled the same abilities', () => {
    expect(outcome.confounded).toBeUndefined();
    expect(outcome.caveats).toEqual([]);
  });
});

describe('compareBuilds — a difference that changes the survival verdict', () => {
  it('reports the verdict for each side rather than only the damage', () => {
    const outcome = compareBuilds(
      build({ defender: 'Frail' }),
      build({ defender: 'Frail', items: [1001] }),
      CATALOGUE,
    );
    if (!outcome.ok) throw new Error('the comparison refused');
    // 100 health: 60 does not kill, 110 does.
    expect(outcome.delta!.burstOnlyLethal).toEqual({ a: false, b: true });
    if (outcome.sides.a.status !== 'computed') throw new Error('side a refused');
    expect(outcome.sides.a.summary.verdict.burstOnly.remainingHp).toBe(40);
  });
});

// ---------------------------------------------------------------------------------------
// When the difference is not a build difference
// ---------------------------------------------------------------------------------------

describe('compareBuilds — a delta the data cannot support', () => {
  const a = build({ apiname: 'Sweeper', combo: [comboStep('s0', { kind: 'ability', ref: 'Q' })] });
  const b = build({ apiname: 'Rival', combo: [comboStep('s0', { kind: 'ability', ref: 'Q' })] });
  const outcome = compareBuilds(a, b, CATALOGUE);
  if (!outcome.ok) throw new Error('the comparison refused');

  it('hides the delta behind a CONFOUNDED block when one side is missing an ability', () => {
    // Sweeper's Q deals 100; the Rival's Q is incomplete and contributes nothing. A bare
    // "-100" would read as the Rival's build being worse, when what it measures is that
    // nobody has harvested the Rival's Q yet.
    expect(outcome.delta).toBeUndefined();
    expect(outcome.confounded).toBeDefined();
    expect(outcome.confounded!.delta.burstTotal).toBe(-100);
    expect(outcome.confounded!.reasons.join(' ')).toMatch(/Rival Q/);
  });

  it('names the champion difference as a caveat as well', () => {
    expect(outcome.caveats.join(' ')).toMatch(/different champion/i);
  });
});

describe('compareBuilds — a side the catalogue cannot answer', () => {
  const outcome = compareBuilds(build({}), build({ apiname: 'NotInCatalogue' }), CATALOGUE);

  it('keeps the comparison but marks that side refused, with no summary on it', () => {
    if (!outcome.ok) throw new Error('the comparison refused wholesale, which it should not');
    expect(outcome.sides.a.status).toBe('computed');
    expect(outcome.sides.b.status).toBe('refused');
    expect('summary' in outcome.sides.b).toBe(false);
  });

  it('offers no delta at all — not a zero, and not the working side on its own', () => {
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.delta).toBeUndefined();
    expect(outcome.confounded).toBeUndefined();
  });
});
