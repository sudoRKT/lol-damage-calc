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

import type {
  AbilityComponent,
  Champion,
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedItemEffect,
  Item,
  Ratio,
  Scaling,
  CuratedRune,
} from '../types';
import type { StatBlock } from '../types/result';
import type { ChampionConfig, ComboStep, Scenario } from '../types/scenario';
import type { CasterStats } from './component';
import type { Catalogue } from './simulate';

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

// ---------------------------------------------------------------------------------------
// Fixtures for the PUBLIC ENTRY POINT (`simulate`) and the sweeps built on it.
//
// THE SAME RULE, ONCE MORE, BECAUSE THESE LOOK MOST LIKE REAL DATA OF ANYTHING IN THIS FILE:
// no champion, item or ability below is a real one. `fixtureChampion` invents round base and
// growth figures so that a per-level statistic can be worked out on paper with the wiki's growth
// formula (champion-stats.ts), and `fixtureAbility` states damage as an EXPLICIT per-rank list
// so a test's expected value is a number a reader can see rather than one an interpolation
// produced.
// ---------------------------------------------------------------------------------------

/** Provenance for a fixture. `patch` is a made-up string; nothing reads it but the Result echo. */
function fixtureProvenance() {
  return { source: 'hand-authored engine fixture', patch: 'fixture' };
}

/**
 * A champion built from round numbers.
 *
 * Defaults: no growth on anything (`*_lvl` of 0), so a fixture's stats are level-independent
 * unless a test asks for growth. That is deliberate — a level sweep test states the growth it
 * intends to exercise, and every other test is then unaffected by the level axis.
 */
export function fixtureChampion(opts: {
  apiname: string;
  hpBase?: number;
  hpPerLevel?: number;
  armorBase?: number;
  armorPerLevel?: number;
  magicResistBase?: number;
  magicResistPerLevel?: number;
  adBase?: number;
  adPerLevel?: number;
  resource?: string;
  manaBase?: number;
  manaPerLevel?: number;
  /**
   * The three attack-speed figures, defaulting to a champion whose ratio equals its base and whose
   * attack speed does not grow — so every fixture written before these options existed keeps the
   * attack speed it always had. A test exercising attack speed states all three (attack-speed.ts).
   * `asPerLevel` is in PERCENTAGE POINTS, matching the stored `as_lvl`.
   */
  asBase?: number;
  asPerLevel?: number;
  asRatio?: number;
}): Champion {
  return {
    apiname: opts.apiname,
    name: opts.apiname,
    id: 0,
    stats: {
      hp_base: opts.hpBase ?? 1000,
      hp_lvl: opts.hpPerLevel ?? 0,
      ...(opts.manaBase !== undefined ? { mp_base: opts.manaBase } : {}),
      ...(opts.manaPerLevel !== undefined ? { mp_lvl: opts.manaPerLevel } : {}),
      arm_base: opts.armorBase ?? 0,
      arm_lvl: opts.armorPerLevel ?? 0,
      mr_base: opts.magicResistBase ?? 0,
      mr_lvl: opts.magicResistPerLevel ?? 0,
      ad_base: opts.adBase ?? 0,
      ad_lvl: opts.adPerLevel ?? 0,
      as_base: opts.asBase ?? 0.625,
      as_lvl: opts.asPerLevel ?? 0,
      as_ratio: opts.asRatio ?? opts.asBase ?? 0.625,
      range: 125,
      rangetype: 'Melee',
      adaptivetype: 'Physical',
    },
    ...(opts.resource !== undefined ? { resource: opts.resource } : {}),
    abilityNames: {},
    abilityMaxRanks: {},
    icon: 'fixture.png',
    provenance: fixtureProvenance(),
  };
}

/** An item carrying whatever Data Dragon stat keys a test names, e.g. `{ FlatPhysicalDamageMod: 50 }`. */
export function fixtureItem(id: number, name: string, stats: Record<string, number>): Item {
  return {
    id,
    name,
    gold: { total: 0, purchasable: true },
    stats,
    icon: 'fixture-item.png',
    provenance: fixtureProvenance(),
  };
}

/** A curated ability whose damage is an explicit per-rank list, so no interpolation is involved. */
export function fixtureAbility(opts: {
  champion: string;
  slot: CuratedAbility['slot'];
  abilityName?: string;
  damageType?: AbilityComponent['damageType'];
  perRank?: number[];
  /** Extra components beyond the first, for a mixed-damage ability. */
  extraComponents?: AbilityComponent[];
  maxRank?: number;
  verification?: CuratedAbility['verification'];
  notes?: string;
  instanceType?: CuratedAbility['instanceType'];
}): CuratedAbility {
  const values = opts.perRank ?? [100, 100, 100, 100, 100];
  const components: AbilityComponent[] =
    opts.verification === 'incomplete'
      ? []
      : [
          {
            id: `${opts.champion}-${opts.slot}-1`,
            damageType: opts.damageType ?? 'physical',
            base: { scaling: 'explicit', perRank: values },
            ratios: [],
          },
          ...(opts.extraComponents ?? []),
        ];
  return {
    champion: opts.champion,
    slot: opts.slot,
    abilityName: opts.abilityName ?? `${opts.champion} ${opts.slot}`,
    instanceType: opts.instanceType ?? 'damaging-ability',
    maxRank: opts.maxRank ?? values.length,
    components,
    verification: opts.verification ?? 'derived',
    ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    provenance: fixtureProvenance(),
  };
}

/**
 * A `Catalogue` over hand-authored lists.
 *
 * It answers `undefined` for anything it was not given, which is what makes a "champion not in
 * the catalogue" refusal testable without touching a data file.
 */
export function fixtureCatalogue(opts: {
  champions?: Champion[];
  items?: Item[];
  abilities?: CuratedAbility[];
  itemEffects?: CuratedItemEffect[];
  defensiveEffects?: CuratedDefensiveEffect[];
  runeEffects?: readonly CuratedRune[];
}): Catalogue {
  const champions = opts.champions ?? [];
  const items = opts.items ?? [];
  const abilities = opts.abilities ?? [];
  const itemEffects = opts.itemEffects ?? [];
  const defensiveEffects = opts.defensiveEffects ?? [];
  const runeEffects = opts.runeEffects ?? [];
  return {
    champion: (apiname) => champions.find((c) => c.apiname === apiname),
    item: (id) => items.find((i) => i.id === id),
    abilities: (apiname) => abilities.filter((a) => a.champion === apiname),
    // An omitted list answers [] rather than throwing, so every fixture written before these
    // two lookups existed keeps working and means what it always meant: nothing harvested.
    itemEffects: (id) => itemEffects.filter((e) => e.itemId === id),
    runeEffects: (id) => runeEffects.filter((e) => e.runeId === id),
    defensiveEffects: (apiname) => defensiveEffects.filter((e) => e.champion === apiname),
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
