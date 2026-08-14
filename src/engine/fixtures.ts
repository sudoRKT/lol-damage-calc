// HAND-AUTHORED test fixtures for the engine's component model.
//
// NOTHING IN THIS FILE COMES FROM A DATA FILE. No champion, item or rune values are used
// anywhere in the engine's tests: not from `public/data/`, not from `/curated/`, not from
// Data Dragon. Every number below was chosen so that the arithmetic it exercises can be done
// by hand and written out in the test that uses it.
//
// Why that matters: a test whose expected value came out of the engine proves only that the
// engine is self-consistent. The rule on this project (CLAUDE.md, "The rule that matters
// most") is that an expected value is derived from the documented formula, by hand, and never
// from what the code returns.
//
// This file is deliberately NOT named *.test.ts, so vitest does not collect it as a suite.

import type { AbilityComponent, Ratio, Scaling } from '../types';
import type { StatBlock } from '../types/result';
import type { ChampionConfig, ComboStep, Scenario } from '../types/scenario';
import type { CasterStats } from './component';

/**
 * A caster's attack damage and ability power, built by hand.
 *
 * `total` is base + bonus. Source: https://wiki.leagueoflegends.com/en-us/Attack_damage
 * (read 2026-08-13) — "Total attack damage refers to base plus bonus attack damage."
 * The frozen `StatBlock` (src/types/result.ts) carries all three figures, so the engine
 * never has to compute this in production; the helper does it here only so a fixture can
 * be written as three numbers instead of four.
 */
export function casterStats(opts: {
  baseAD?: number;
  bonusAD?: number;
  abilityPower?: number;
}): CasterStats {
  const base = opts.baseAD ?? 0;
  const bonus = opts.bonusAD ?? 0;
  return {
    attackDamage: { base, bonus, total: base + bonus },
    abilityPower: opts.abilityPower ?? 0,
  };
}

/** `X to Y` across the ability's ranks — the wiki's `{{ap|X to Y}}` shorthand. */
export function linear(from: number, to: number): Scaling {
  return { scaling: 'linear', from, to };
}

/** A value that does not change with rank, written the way the harvester stores it. */
export function flat(value: number): Scaling {
  return { scaling: 'linear', from: value, to: value };
}

/** A literal per-rank list, used verbatim (`explicit`). */
export function perRank(values: number[]): Scaling {
  return { scaling: 'explicit', perRank: values };
}

/**
 * One damage component, with the two required fields filled in and everything else optional.
 * `damageType` defaults to 'magic' ONLY because a fixture must state something; no test below
 * depends on that default, and the engine never defaults a damage type (DATA-SOURCES §30 fix 4).
 */
export function component(parts: Partial<AbilityComponent> & { base: Scaling }): AbilityComponent {
  return {
    id: parts.id ?? 'fixture-component',
    damageType: parts.damageType ?? 'magic',
    ratios: parts.ratios ?? [],
    ...parts,
  };
}

/** A ratio on one of the four caster-only stats: `stat` plus a magnitude in PERCENTAGE POINTS. */
export function ratio(stat: Ratio['stat'], magnitude: Scaling, extra: Partial<Ratio> = {}): Ratio {
  return { stat, ...magnitude, ...extra } as Ratio;
}

// ---------------------------------------------------------------------------------------
// Fixtures for the SEQUENTIAL COMBO RUNNER (SPECIFICATION §3.1).
//
// The same rule applies as above and is worth restating because these look more like real
// champions: NOTHING HERE COMES FROM A DATA FILE. `statBlock` below is not any champion's
// stat line — it is whatever round numbers make the arithmetic in a test doable on paper.
// ---------------------------------------------------------------------------------------

/**
 * A fully resolved stat block, built from round numbers.
 *
 * Every field of the frozen `StatBlock` is filled so the fixture typechecks; a test states
 * only the handful it actually exercises. `critDamage` defaults to 2.0, the base multiplier
 * as of patch V26.01 (see crit.ts), NOT because any test depends on the default.
 */
export function statBlock(opts: Partial<StatBlock> = {}): StatBlock {
  const attackDamage = opts.attackDamage ?? { base: 0, bonus: 0, total: 0 };
  return {
    level: opts.level ?? 1,
    hp: opts.hp ?? 1000,
    maxHp: opts.maxHp ?? opts.hp ?? 1000,
    // Same rule as the resistance split below: a fixture's maximum health is all "base" unless
    // a test states a bonus portion, so a `bonusHP` ratio in a test that never asked for bonus
    // health reads 0 rather than a silently invented figure.
    maxHpBase: opts.maxHpBase ?? (opts.maxHp ?? opts.hp ?? 1000) - (opts.maxHpBonus ?? 0),
    maxHpBonus: opts.maxHpBonus ?? 0,
    // MANA IS ABSENT UNLESS A TEST ASKS. Absent means "this champion's resource is not mana",
    // which is what the component evaluator refuses on; a default of 0 would let a mana ratio
    // resolve to 0 damage instead of being named as unmodellable.
    ...(opts.mana !== undefined ? { mana: opts.mana } : {}),
    ...(opts.maxMana !== undefined ? { maxMana: opts.maxMana } : {}),
    armor: opts.armor ?? 0,
    // A fixture's resistances are all "base" unless a test says otherwise: the split exists for
    // percentage BONUS penetration, and a fixture that silently invented a bonus portion would
    // make that effect look modelled when the test never asked for it. A test that DOES care
    // states `armorBase` and `armorBonus` itself, and they are honoured — an earlier version of
    // this helper hardcoded them, so a test asking for a bonus portion silently got none.
    armorBase: opts.armorBase ?? (opts.armor ?? 0) - (opts.armorBonus ?? 0),
    armorBonus: opts.armorBonus ?? 0,
    magicResist: opts.magicResist ?? 0,
    magicResistBase: opts.magicResistBase ?? (opts.magicResist ?? 0) - (opts.magicResistBonus ?? 0),
    magicResistBonus: opts.magicResistBonus ?? 0,
    attackDamage,
    abilityPower: opts.abilityPower ?? 0,
    critChance: opts.critChance ?? 0,
    critDamage: opts.critDamage ?? 2,
    attackSpeed: opts.attackSpeed ?? 0.625,
    adaptiveType: opts.adaptiveType ?? 'physical',
    // No penetration unless a test asks. Stated rather than omitted so a fixture never leaves a
    // reader wondering whether the attacker carried some.
    penetration: opts.penetration ?? {
      flatArmor: 0,
      percentArmor: 0,
      percentBonusArmor: 0,
      flatMagic: 0,
      percentMagic: 0,
    },
  };
}

/** A champion configuration with the two state categories of §3.3 stated separately. */
export function championConfig(opts: Partial<ChampionConfig> = {}): ChampionConfig {
  return {
    apiname: opts.apiname ?? 'FixtureChampion',
    level: opts.level ?? 1,
    abilityRanks: opts.abilityRanks ?? { Q: 1, W: 1, E: 1, R: 1 },
    items: opts.items ?? [],
    runes: opts.runes ?? { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: opts.persistent ?? {},
    entryState: opts.entryState ?? {},
  };
}

/** A combo step. `ref` and `kind` are what the runner echoes; it resolves neither itself. */
export function comboStep(id: string, opts: Partial<ComboStep> = {}): ComboStep {
  return {
    id,
    kind: opts.kind ?? 'ability',
    ref: opts.ref ?? 'Q',
    ...opts,
  };
}

/** A minimal Scenario. The runner echoes it into the Result and reads only the two configs. */
export function scenario(opts: Partial<Scenario> = {}): Scenario {
  return {
    // The URL SCHEMA version (SPECIFICATION §12), currently 2 — the engine reads nothing from
    // it, but a fixture that names a stale one makes every round-trip check fail on a field
    // nobody meant to test.
    version: opts.version ?? 2,
    attacker: opts.attacker ?? championConfig(),
    defender: opts.defender ?? championConfig(),
    combo: opts.combo ?? [],
  };
}
