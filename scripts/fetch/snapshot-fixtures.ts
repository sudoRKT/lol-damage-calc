// Fixtures for the patch-pipeline tests. Not used by the pipeline itself.
//
// Values are real ones taken from DATA-SOURCES.md — Aatrox's stats from §1, Redemption's price
// from §5 — so that a test reading like a known answer actually is one.

import type { Snapshot, SnapshotChampion, SnapshotItem, SnapshotRune } from './snapshot.ts';
import { SNAPSHOT_FORMAT_VERSION } from './snapshot.ts';

/** Aatrox exactly as DATA-SOURCES §1 records him. */
export function aatrox(overrides: Partial<SnapshotChampion> = {}): SnapshotChampion {
  return {
    apiname: 'Aatrox',
    name: 'Aatrox',
    id: 266,
    resource: 'Blood Well',
    stats: {
      hp_base: 650,
      hp_lvl: 114,
      mp_base: 0,
      mp_lvl: 0,
      arm_base: 38,
      arm_lvl: 4.8,
      mr_base: 32,
      mr_lvl: 2.05,
      ad_base: 60,
      ad_lvl: 5,
      as_base: 0.651,
      as_lvl: 2.5,
      as_ratio: 0.651,
      range: 175,
      rangetype: 'Melee',
      adaptivetype: 'Physical',
    },
    abilityNames: {
      P: ['Deathbringer Stance'],
      Q: ['The Darkin Blade', 'The Darkin Blade 2', 'The Darkin Blade 3'],
      W: ['Infernal Chains'],
      E: ['Umbral Dash'],
      R: ['World Ender'],
    },
    abilityMaxRanks: { Q: 5, W: 5, E: 5, R: 3 },
    ...overrides,
  };
}

/** Ashe, the champion DATA-SOURCES §14.1's magic-resistance finding is written about. */
export function ashe(overrides: Partial<SnapshotChampion> = {}): SnapshotChampion {
  return {
    apiname: 'Ashe',
    name: 'Ashe',
    id: 22,
    resource: 'Mana',
    stats: {
      hp_base: 640,
      hp_lvl: 101,
      mp_base: 280,
      mp_lvl: 32,
      arm_base: 26,
      arm_lvl: 4.6,
      mr_base: 30,
      mr_lvl: 1.3,
      ad_base: 59,
      ad_lvl: 3.5,
      as_base: 0.658,
      as_lvl: 3.33,
      as_ratio: 0.658,
      range: 600,
      rangetype: 'Ranged',
      adaptivetype: 'Physical',
    },
    abilityNames: {
      P: ['Frost Shot'],
      Q: ["Ranger's Focus"],
      W: ['Volley'],
      E: ['Hawkshot'],
      R: ['Enchanted Crystal Arrow'],
    },
    abilityMaxRanks: { Q: 5, W: 5, E: 5, R: 3 },
    ...overrides,
  };
}

/** Redemption — DATA-SOURCES §5's worked example: 3107 at 2300g is the real one. */
export function redemption(overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return {
    id: 3107,
    name: 'Redemption',
    goldTotal: 2300,
    purchasable: true,
    stats: { FlatHPPoolMod: 200 },
    ...overrides,
  };
}

export function infinityEdge(overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return {
    id: 3031,
    name: 'Infinity Edge',
    goldTotal: 3450,
    purchasable: true,
    stats: { FlatPhysicalDamageMod: 65, FlatCritChanceMod: 0.25 },
    ...overrides,
  };
}

export function pressTheAttack(overrides: Partial<SnapshotRune> = {}): SnapshotRune {
  return { id: 8005, key: 'PressTheAttack', name: 'Press the Attack', tree: 'Precision', slot: 0, ...overrides };
}

export function makeSnapshot(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    patch: '16.16.1',
    wikiHighestChangesPatch: 'V26.15',
    provenance: {
      source: 'fixture',
      url: 'https://wiki.leagueoflegends.com/en-us/api.php',
      patch: '16.16.1',
      fetched: '2026-08-14T00:00:00.000Z',
    },
    sources: { championStats: 'https://wiki.leagueoflegends.com/en-us/api.php' },
    contestedChampions: [],
    champions: [aatrox(), ashe()],
    items: [redemption(), infinityEdge()],
    runes: [pressTheAttack()],
    ...parts,
  };
}

/** Deep-copy a snapshot so a test can mutate one field without touching the original. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
