// VALIDATION BOUNDS (SPECIFICATION §9).
//
//   "Diffed changes pass through validation bounds before proceeding. Implausible movements,
//    such as a base statistic shifting by an order of magnitude, halt the update rather than
//    propagate it. The wiki is community-editable, and this check exists to absorb both error
//    and vandalism."
//
// THE FAILURE THIS FILE IS DESIGNED AGAINST is not a bound that fires too often. It is a bound
// that lets something through and thereby manufactures confidence. So every verdict below
// names the field, states BOTH values, and says which bound refused it and what that bound is.
// A halt a human cannot read is a halt a human will override.
//
// ---------------------------------------------------------------------------------------
// WHY THE BOUNDS ARE PER FIELD, AND WHERE THEIR NUMBERS COME FROM
// ---------------------------------------------------------------------------------------
//
// A champion's base health and their attack-speed ratio do not move on the same scale, so one
// global percentage is either useless on one field or dangerous on the other. Every bound here
// was set from two measurements, both reproducible:
//
//   1. THE LIVE ROSTER DISTRIBUTION — the observed minimum and maximum of that field across
//      the 173 shipped champions / 209 shipped items, read from public/data on 2026-08-14.
//      This sets the ENVELOPE. The envelope must never fire on data that is already published
//      and correct; `bounds.test.ts` asserts exactly that over every field of every entity.
//
//   2. THE LARGEST GENUINE PATCH MOVEMENT — measured by `bounds-evidence.ts`, which fetched
//      Data Dragon for 24 consecutive patches (16.16.1 back to 15.17.1, so 23 real patch
//      transitions INCLUDING the 15.24.1 -> 16.1.1 season boundary) and recorded every field
//      that moved: 257 movements. This sets the MOVEMENT bound. Reproduce with
//      `node scripts/fetch/bounds-evidence.ts 24`.
//
// Each rule below records both numbers in `observed`, so the headroom between a real change
// and a refused one is visible rather than asserted.
//
// TWO FIELDS HAVE NO PATCH-MOVEMENT EVIDENCE and say so in their own justification:
// `ad_lvl` (Data Dragon reads 0 for every champion in every patch — DATA-SOURCES §3) and
// `as_ratio` (Data Dragon has no counterpart field). Their movement bounds come from the
// roster distribution alone and are therefore the weakest two in the table.
//
// ---------------------------------------------------------------------------------------
// HOW A MOVEMENT IS JUDGED
// ---------------------------------------------------------------------------------------
//
// A movement halts only when it exceeds BOTH the absolute bound AND the proportional bound.
// The conjunction is deliberate:
//   - proportional alone punishes small-valued fields — `mr_lvl` 1.3 -> 1.1 is a 15% move and
//     is a real, documented patch change (DATA-SOURCES §14.1);
//   - absolute alone punishes large-valued fields — 40 health is routine, 40 armor is not.
// Either bound alone produced false halts on real observed data; the conjunction produces none.
//
// A separate ZEROING rule catches the shape neither bound sees: a non-zero value becoming 0.
// Across all 257 observed real movements, exactly ZERO zeroed a field. It is also the exact
// shape of Data Dragon's structural `attackdamageperlevel` fault and of a blanked wiki table
// cell, so it is treated as a halt rather than as a large movement.
//
// Everything here is pure — no network, no filesystem. Tested by bounds.test.ts.

import type { Snapshot, SnapshotChampion, SnapshotItem } from './snapshot.ts';
import type { FieldChange, SnapshotDiff } from './diff.ts';

export type BoundSeverity = 'halt' | 'review';

export type BoundCheck =
  | 'envelope'
  | 'movement'
  | 'zeroing'
  | 'unbounded-field'
  | 'identity'
  | 'mass-edit'
  | 'roster-loss'
  | 'patch-regression';

export interface BoundVerdict {
  severity: BoundSeverity;
  check: BoundCheck;
  kind: 'champion' | 'item' | 'rune' | 'roster' | 'patch';
  /** Stable identifier of what this is about — an apiname, an item id, or 'roster'. */
  subject: string;
  field: string;
  before: number | string | null;
  after: number | string | null;
  /** Plain English, naming the field, both values, and why the bound refused it. */
  message: string;
}

export interface MovementBound {
  maxAbsolute: number;
  maxFraction: number;
}

export interface FieldBound {
  field: string;
  unit: string;
  envelope: { min: number; max: number };
  move: MovementBound;
  /** What a non-zero value becoming zero means for this field. */
  zeroing: BoundSeverity;
  observed: {
    rosterMin: number;
    rosterMax: number;
    /** Largest real per-patch movement seen in the 23 measured transitions, or null if the
     *  field has no measurable history (see the header). */
    largestRealMove: number | null;
    largestRealFraction: number | null;
  };
  why: string;
}

/** The evidence run these numbers came from, recorded so the table can be re-derived. */
export const BOUNDS_EVIDENCE = {
  command: 'node scripts/fetch/bounds-evidence.ts 24',
  measuredOn: '2026-08-14',
  patchesFetched: 24,
  patchTransitions: 23,
  newestPatch: '16.16.1',
  oldestPatch: '15.17.1',
  includesSeasonBoundary: '15.24.1 -> 16.1.1',
  fieldMovementsObserved: 257,
  movementsThatZeroedAField: 0,
  rosterDistributionFrom: 'public/data/champions.json + items.json, patch 16.16.1, read 2026-08-14',
} as const;

// ---------------------------------------------------------------------------------------
// Champion base statistics. Field names match `ChampionBaseStats` in src/types/data.ts.
// ---------------------------------------------------------------------------------------

export const CHAMPION_BOUNDS: Record<string, FieldBound> = {
  'stats.hp_base': {
    field: 'stats.hp_base',
    unit: 'health',
    envelope: { min: 300, max: 1200 },
    move: { maxAbsolute: 100, maxFraction: 0.2 },
    zeroing: 'halt',
    observed: { rosterMin: 410, rosterMax: 696, largestRealMove: 40, largestRealFraction: 0.06 },
    why:
      'Roster runs 410 (Yuumi) to 696. Riot moves base health in steps of 10-40; the largest ' +
      'real move in 23 patches was Shyvana 665 -> 625 (40, 6.0%). 100 health and 20% together ' +
      'clear that by 2.5x while still refusing a champion doubling in health.',
  },
  'stats.hp_lvl': {
    field: 'stats.hp_lvl',
    unit: 'health per level',
    envelope: { min: 40, max: 200 },
    move: { maxAbsolute: 30, maxFraction: 0.25 },
    zeroing: 'halt',
    observed: { rosterMin: 69, rosterMax: 126, largestRealMove: 11, largestRealFraction: 0.092 },
    why:
      'Roster runs 69 to 126. Largest real move was Azir 119 -> 108 (11, 9.2%); the Bel\'Veth ' +
      'change DATA-SOURCES §3 documents (110 -> 105) is smaller still. 30 and 25% clear both.',
  },
  'stats.mp_base': {
    field: 'stats.mp_base',
    unit: 'resource pool (NOT necessarily mana — DATA-SOURCES §43)',
    envelope: { min: 0, max: 1500 },
    move: { maxAbsolute: 150, maxFraction: 0.5 },
    zeroing: 'review',
    observed: { rosterMin: 0, rosterMax: 530, largestRealMove: 50, largestRealFraction: 0.25 },
    why:
      'Envelope starts at 0 because 11 champions really have no pool. Largest real move was ' +
      'Cassiopeia 400 -> 450 (50) and Bel\'Veth 60 -> 45 (25%). Zeroing is a REVIEW, not a halt: ' +
      'a resource rework legitimately removes a pool, which no other stat here does.',
  },
  'stats.mp_lvl': {
    field: 'stats.mp_lvl',
    unit: 'resource per level',
    envelope: { min: 0, max: 200 },
    move: { maxAbsolute: 30, maxFraction: 1 },
    zeroing: 'review',
    observed: { rosterMin: 0, rosterMax: 87, largestRealMove: 15, largestRealFraction: 0.6 },
    why:
      '28 champions really sit at 0. The largest real move, Seraphine 25 -> 40, is 60% — the ' +
      'highest proportional move of any champion field measured — so the proportional bound is ' +
      'set at 100% and the absolute bound (30) is what actually guards this field.',
  },
  'stats.arm_base': {
    field: 'stats.arm_base',
    unit: 'armor',
    envelope: { min: 10, max: 80 },
    move: { maxAbsolute: 15, maxFraction: 0.4 },
    zeroing: 'halt',
    observed: { rosterMin: 18, rosterMax: 43, largestRealMove: 6, largestRealFraction: 0.182 },
    why:
      'Roster runs 18 to 43 — a narrow band, so the envelope is narrow. Largest real move was ' +
      'Gwen 33 -> 39 (6, 18.2%). Base armor is a damage multiplier on every physical hit, so ' +
      'this bound is deliberately tight: 15 armor is already a big miss.',
  },
  'stats.arm_lvl': {
    field: 'stats.arm_lvl',
    unit: 'armor per level',
    envelope: { min: 0, max: 12 },
    move: { maxAbsolute: 2, maxFraction: 0.5 },
    zeroing: 'halt',
    observed: { rosterMin: 0, rosterMax: 5.45, largestRealMove: 0.8, largestRealFraction: 0.216 },
    why:
      'Thresh really is 0 (he gains armor from souls), so the envelope allows it — but a ' +
      'champion who HAD growth losing it is the blanked-cell shape and halts. Largest real ' +
      'move was Dr. Mundo 3.7 -> 4.5 (0.8, 21.6%).',
  },
  'stats.mr_base': {
    field: 'stats.mr_base',
    unit: 'magic resistance',
    envelope: { min: 10, max: 80 },
    move: { maxAbsolute: 12, maxFraction: 0.4 },
    zeroing: 'halt',
    observed: { rosterMin: 22, rosterMax: 37, largestRealMove: 5, largestRealFraction: 0.179 },
    why:
      'The field DATA-SOURCES §14.1 is written about. The 28-marksman change was 30 -> 33 ' +
      '(5 at most, 17.9% for Tristana at 28 -> 33). This bound must NOT refuse that — it is a ' +
      'real, patch-note-documented movement — and bounds.test.ts asserts it does not.',
  },
  'stats.mr_lvl': {
    field: 'stats.mr_lvl',
    unit: 'magic resistance per level',
    envelope: { min: 0, max: 8 },
    move: { maxAbsolute: 1.5, maxFraction: 0.75 },
    zeroing: 'halt',
    observed: { rosterMin: 1.1, rosterMax: 2.55, largestRealMove: 0.75, largestRealFraction: 0.367 },
    why:
      'Values are small, so the proportional bound has to be loose: the real 1.3 -> 1.1 change ' +
      'is 15% and Shyvana 1.5 -> 2.05 is 36.7%. The absolute bound (1.5, twice the largest real ' +
      'move) is the effective guard.',
  },
  'stats.ad_base': {
    field: 'stats.ad_base',
    unit: 'attack damage',
    envelope: { min: 30, max: 120 },
    move: { maxAbsolute: 15, maxFraction: 0.25 },
    zeroing: 'halt',
    observed: { rosterMin: 44, rosterMax: 69, largestRealMove: 5, largestRealFraction: 0.083 },
    why:
      'Roster runs 44 to 69. Largest real move was Bel\'Veth 60 -> 55. The envelope also catches ' +
      'the stale-source case DATA-SOURCES §1 records — the abandoned Fandom copy reads ' +
      'Volibear 60 against the correct 65 — as a movement rather than as an out-of-range value.',
  },
  'stats.ad_lvl': {
    field: 'stats.ad_lvl',
    unit: 'attack damage per level',
    envelope: { min: 0, max: 12 },
    move: { maxAbsolute: 2, maxFraction: 0.5 },
    zeroing: 'halt',
    observed: { rosterMin: 0, rosterMax: 5, largestRealMove: null, largestRealFraction: null },
    why:
      'NO PATCH-MOVEMENT EVIDENCE EXISTS for this field, and that is itself the finding: Data ' +
      'Dragon reports 0 for every champion in every patch (DATA-SOURCES §3), so its history ' +
      'measures Riot\'s fault, not balance. The bound therefore comes from the roster spread ' +
      '(0 to 5) alone. Senna really is 0. The zeroing halt is the important half here — it is ' +
      'precisely the shape that would appear if this field were ever sourced from Data Dragon ' +
      'by mistake, and it would fire on all 173 champions at once.',
  },
  'stats.as_base': {
    field: 'stats.as_base',
    unit: 'attacks per second',
    envelope: { min: 0.3, max: 1.2 },
    move: { maxAbsolute: 0.35, maxFraction: 0.45 },
    zeroing: 'halt',
    observed: { rosterMin: 0.475, rosterMax: 0.8, largestRealMove: 0.18, largestRealFraction: 0.212 },
    why:
      'Roster runs 0.475 to 0.8. The largest real move (Bel\'Veth 0.85 -> 0.67) is both the ' +
      'largest absolute and the largest proportional; the bound clears it roughly 2x on each.',
  },
  'stats.as_lvl': {
    field: 'stats.as_lvl',
    unit: 'attack speed growth (percent per level)',
    envelope: { min: 0, max: 12 },
    move: { maxAbsolute: 2, maxFraction: 0.75 },
    zeroing: 'review',
    observed: { rosterMin: 0, rosterMax: 6, largestRealMove: 0.8, largestRealFraction: 0.375 },
    why:
      'Bel\'Veth and Jhin really are 0 — Jhin\'s attack speed is fixed by his kit — so zeroing ' +
      'is a review rather than a halt. Largest real move was Lucian 3.3 -> 2.5 (0.8) and Nilah ' +
      '2 -> 1.25 (37.5%).',
  },
  'stats.as_ratio': {
    field: 'stats.as_ratio',
    unit: 'attack-speed ratio',
    envelope: { min: 0, max: 1.2 },
    move: { maxAbsolute: 0.15, maxFraction: 0.25 },
    zeroing: 'review',
    observed: { rosterMin: 0, rosterMax: 0.725, largestRealMove: null, largestRealFraction: null },
    why:
      'NO PATCH-MOVEMENT EVIDENCE: Data Dragon publishes no counterpart field, so this bound ' +
      'comes from the roster spread (0 to 0.725) alone and is one of the two weakest in the ' +
      'table. The ratio is a property of a champion\'s attack animation rather than a balance ' +
      'lever, so it is bounded tightly. Jhin is 0 by design, so zeroing is a review.',
  },
  'stats.range': {
    field: 'stats.range',
    unit: 'units',
    envelope: { min: 100, max: 800 },
    move: { maxAbsolute: 125, maxFraction: 0.4 },
    zeroing: 'halt',
    observed: { rosterMin: 125, rosterMax: 650, largestRealMove: 50, largestRealFraction: 0.2 },
    why:
      'Roster runs 125 (melee) to 650 (Caitlyn). Only two real moves in 23 patches: Zeri ' +
      '500 -> 550 and Shyvana 125 -> 150. The 125-unit absolute bound is set so that a melee ' +
      'champion silently becoming ranged (175 -> 550) halts, which is the corruption that ' +
      'matters — it changes every range check in the product. DATA-SOURCES §15 records Kled ' +
      'as contested on exactly this field (wiki 250 vs Data Dragon 125).',
  },
};

// ---------------------------------------------------------------------------------------
// Items. Gold and item stats both come from Data Dragon (DATA-SOURCES §12).
// ---------------------------------------------------------------------------------------

export const ITEM_BOUNDS: Record<string, FieldBound> = {
  goldTotal: {
    field: 'goldTotal',
    unit: 'gold',
    envelope: { min: 0, max: 6000 },
    move: { maxAbsolute: 800, maxFraction: 0.6 },
    zeroing: 'halt',
    observed: { rosterMin: 50, rosterMax: 3500, largestRealMove: 500, largestRealFraction: 0.357 },
    why:
      'Pool runs 50 (Doran-tier components) to 3500. The largest real move in 23 patches was a ' +
      'season-boundary reprice, Swiftmarch 1500 -> 1000 (500) and Crimson Lucidity 1400 -> 900 ' +
      '(35.7%). Zeroing halts because gold.total > 0 is part of the item filter itself ' +
      '(DATA-SOURCES §5) — a zero here would silently remove the item from the pool.',
  },
  'stats.FlatHPPoolMod': {
    field: 'stats.FlatHPPoolMod',
    unit: 'health',
    envelope: { min: 0, max: 2000 },
    move: { maxAbsolute: 150, maxFraction: 0.6 },
    zeroing: 'review',
    observed: { rosterMin: 30, rosterMax: 1000, largestRealMove: 50, largestRealFraction: 0.273 },
    why:
      'Largest real move was Catalyst of Aeons 350 -> 300 (50) and Doran\'s Helm 110 -> 140 ' +
      '(27.3%). Zeroing is a review: an item legitimately losing a stat line is a normal ' +
      'rebalance, unlike a champion losing a base stat.',
  },
  'stats.FlatPhysicalDamageMod': {
    field: 'stats.FlatPhysicalDamageMod',
    unit: 'attack damage',
    envelope: { min: 0, max: 200 },
    move: { maxAbsolute: 30, maxFraction: 0.75 },
    zeroing: 'review',
    observed: { rosterMin: 7, rosterMax: 80, largestRealMove: 10, largestRealFraction: 0.333 },
    why:
      'Pool runs 7 (Doran\'s Blade) to 80. Largest real move was Mercurial Scimitar 40 -> 50 ' +
      '(10) and Doran\'s Bow 6 -> 8 (33.3%). Small-valued items make the proportional bound ' +
      'loose, so the 30-point absolute bound is the real guard.',
  },
  'stats.FlatMagicDamageMod': {
    field: 'stats.FlatMagicDamageMod',
    unit: 'ability power',
    envelope: { min: 0, max: 300 },
    move: { maxAbsolute: 80, maxFraction: 0.8 },
    zeroing: 'review',
    observed: { rosterMin: 15, rosterMax: 130, largestRealMove: 50, largestRealFraction: 0.4 },
    why:
      'Largest real move was Horizon Focus 125 -> 75 at the season boundary — 50 points and ' +
      '40% in one patch, the biggest single item stat change measured. The bound clears it ' +
      'with room, which is the price of not halting every preseason.',
  },
  'stats.FlatArmorMod': {
    field: 'stats.FlatArmorMod',
    unit: 'armor',
    envelope: { min: 0, max: 200 },
    move: { maxAbsolute: 40, maxFraction: 1 },
    zeroing: 'review',
    observed: { rosterMin: 8, rosterMax: 75, largestRealMove: 25, largestRealFraction: 1 },
    why:
      'Unending Despair doubled at the season boundary, 25 -> 50 — a 100% move that is real. ' +
      'The proportional bound is therefore useless on this field and is set to match; the ' +
      '40-point absolute bound does the work.',
  },
  'stats.FlatSpellBlockMod': {
    field: 'stats.FlatSpellBlockMod',
    unit: 'magic resistance',
    envelope: { min: 0, max: 200 },
    move: { maxAbsolute: 40, maxFraction: 1 },
    zeroing: 'review',
    observed: { rosterMin: 8, rosterMax: 80, largestRealMove: 5, largestRealFraction: 0.2 },
    why:
      'Real moves are small (Mercurial Scimitar 40 -> 35, Locket 25 -> 30). Bounded like ' +
      'FlatArmorMod because the two are rebalanced in the same passes and at the same scale.',
  },
  'stats.FlatMPPoolMod': {
    field: 'stats.FlatMPPoolMod',
    unit: 'mana',
    envelope: { min: 0, max: 2000 },
    move: { maxAbsolute: 300, maxFraction: 0.6 },
    zeroing: 'review',
    observed: { rosterMin: 240, rosterMax: 1000, largestRealMove: 140, largestRealFraction: 0.163 },
    why: 'Largest real move was Muramana 860 -> 1000 (140, 16.3%) at the season boundary.',
  },
  'stats.FlatMovementSpeedMod': {
    field: 'stats.FlatMovementSpeedMod',
    unit: 'movement speed',
    envelope: { min: 0, max: 200 },
    move: { maxAbsolute: 30, maxFraction: 0.6 },
    zeroing: 'review',
    observed: { rosterMin: 25, rosterMax: 65, largestRealMove: 5, largestRealFraction: 0.1 },
    why:
      'Boots only. Real moves are 5 points at most (Crimson Lucidity 50 -> 45). Not a damage ' +
      'input for this product, so the bound is loose relative to the champion table on purpose.',
  },
  'stats.PercentAttackSpeedMod': {
    field: 'stats.PercentAttackSpeedMod',
    unit: 'fraction (0.35 = 35%)',
    envelope: { min: 0, max: 2 },
    move: { maxAbsolute: 0.2, maxFraction: 0.75 },
    zeroing: 'review',
    observed: { rosterMin: 0.1, rosterMax: 0.65, largestRealMove: 0.05, largestRealFraction: 0.2 },
    why:
      'Stored as a FRACTION, not a percentage — 0.35 means 35%. The envelope maximum of 2 ' +
      'exists so a value accidentally stored as 35 instead of 0.35 halts on the envelope alone, ' +
      'which is the unit error most likely to reach this field.',
  },
  'stats.PercentMovementSpeedMod': {
    field: 'stats.PercentMovementSpeedMod',
    unit: 'fraction',
    envelope: { min: 0, max: 1 },
    move: { maxAbsolute: 0.1, maxFraction: 1 },
    zeroing: 'review',
    observed: { rosterMin: 0.04, rosterMax: 0.1, largestRealMove: 0.02, largestRealFraction: 0.5 },
    why:
      'Tiny values (0.04 to 0.10), so a 50% proportional move is real (Lich Bane 0.04 -> 0.06). ' +
      'The absolute bound of 0.1 is the guard, and the envelope catches a percentage/fraction ' +
      'unit error.',
  },
  'stats.FlatCritChanceMod': {
    field: 'stats.FlatCritChanceMod',
    unit: 'fraction',
    envelope: { min: 0, max: 1 },
    move: { maxAbsolute: 0.15, maxFraction: 0.75 },
    zeroing: 'review',
    observed: { rosterMin: 0.15, rosterMax: 0.25, largestRealMove: null, largestRealFraction: null },
    why:
      'No movement observed in 23 patches, so the bound comes from the pool spread. Crit ' +
      'chance cannot exceed 1 by definition, which is what the envelope encodes.',
  },
  'stats.PercentLifeStealMod': {
    field: 'stats.PercentLifeStealMod',
    unit: 'fraction',
    envelope: { min: 0, max: 1 },
    move: { maxAbsolute: 0.15, maxFraction: 1 },
    zeroing: 'review',
    observed: { rosterMin: 0.05, rosterMax: 0.15, largestRealMove: null, largestRealFraction: null },
    why: 'No movement observed in 23 patches; bound from the pool spread (0.05 to 0.15).',
  },
  'stats.FlatHPRegenMod': {
    field: 'stats.FlatHPRegenMod',
    unit: 'health regen per 5 seconds',
    envelope: { min: 0, max: 50 },
    move: { maxAbsolute: 5, maxFraction: 1.5 },
    zeroing: 'review',
    observed: { rosterMin: 0.8, rosterMax: 4, largestRealMove: null, largestRealFraction: null },
    why:
      'Two items carry it and neither moved in 23 patches. Not a damage input; bounded only so ' +
      'that garbage in the field is still caught.',
  },
};

// ---------------------------------------------------------------------------------------
// Roster-shape bounds. These catch the failure no per-field rule can see: a source that
// returned partial or emptied data.
// ---------------------------------------------------------------------------------------

export const ROSTER_BOUNDS = {
  /** Champions may disappear from Data Dragon transiently. More than this is not a patch. */
  maxChampionsRemoved: 2,
  maxItemsRemoved: 10,
  maxRunesRemoved: 5,
  /**
   * The share of the roster that may move the SAME field in one patch before it reads as a
   * table-wide edit rather than a balance change.
   *
   * Evidence: the largest real same-field sweep measured is base magic resistance across 28-30
   * champions in one patch (DATA-SOURCES §14.1), which is 16-17% of 173. 40% clears that by
   * roughly 2.4x. A vandal or a bad find-and-replace in a Lua module typically hits every row.
   */
  maxSameFieldShareOfRoster: 0.4,
  /**
   * …and at least this many champions, in absolute terms.
   *
   * A share on its own is meaningless on a small roster: one champion out of two is 50%. Found
   * by a test rather than by reasoning — the fixture rosters in bounds.test.ts have two
   * champions each, and every single-champion movement was halting as a "table-wide edit".
   * The floor sits above the largest real sweep on record (30 champions), so it never masks a
   * genuine mass edit on the real 173-champion roster, where the share rule bites at 69.
   */
  minChampionsForMassEdit: 40,
} as const;

// ---------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------

function describe(value: number | string | null): string {
  return value === null ? 'absent' : String(value);
}

/** Numeric fields of a champion, flattened to the field paths the bound table uses. */
export function championNumericFields(champion: SnapshotChampion): [string, number][] {
  const out: [string, number][] = [];
  for (const [key, value] of Object.entries(champion.stats)) {
    if (typeof value === 'number') out.push([`stats.${key}`, value]);
  }
  return out;
}

export function itemNumericFields(item: SnapshotItem): [string, number][] {
  const out: [string, number][] = [['goldTotal', item.goldTotal]];
  for (const [key, value] of Object.entries(item.stats)) {
    if (typeof value === 'number') out.push([`stats.${key}`, value]);
  }
  return out;
}

export interface EnvelopeReport {
  verdicts: BoundVerdict[];
  /** One field-check is one (entity, field) pair actually compared against a bound. */
  fieldsChecked: number;
  /** (entity, field) pairs with no bound in the table — reported, never silently passed. */
  unbounded: { subject: string; field: string }[];
  /** The field-check that came closest to its envelope, as a fraction of the envelope width. */
  tightestMargin: { subject: string; field: string; value: number; marginFraction: number } | null;
}

/**
 * THE SELF-TEST. Run every published value against its envelope.
 *
 * A bound that would refuse data which is already published and correct is a WRONG BOUND, not
 * a finding — so this must return zero verdicts over live `public/data`, and bounds.test.ts
 * asserts it. `tightestMargin` reports how close the closest real value sits to its envelope,
 * so "zero halts" cannot be bought by making every envelope absurdly wide.
 */
export function checkEnvelope(snapshot: Snapshot): EnvelopeReport {
  const verdicts: BoundVerdict[] = [];
  const unbounded: { subject: string; field: string }[] = [];
  let fieldsChecked = 0;
  let tightest: EnvelopeReport['tightestMargin'] = null;

  const consider = (
    kind: 'champion' | 'item',
    subject: string,
    field: string,
    value: number,
    table: Record<string, FieldBound>,
  ): void => {
    const bound = table[field];
    if (!bound) {
      unbounded.push({ subject, field });
      return;
    }
    fieldsChecked += 1;
    if (value < bound.envelope.min || value > bound.envelope.max) {
      verdicts.push({
        severity: 'halt',
        check: 'envelope',
        kind,
        subject,
        field,
        before: null,
        after: value,
        message:
          `${subject} ${field} is ${value} ${bound.unit}, outside the plausible range ` +
          `${bound.envelope.min} to ${bound.envelope.max}. Bound: ${bound.why}`,
      });
      return;
    }
    const width = bound.envelope.max - bound.envelope.min;
    const distance = Math.min(value - bound.envelope.min, bound.envelope.max - value);
    const marginFraction = width === 0 ? 0 : distance / width;
    if (!tightest || marginFraction < tightest.marginFraction) {
      tightest = { subject, field, value, marginFraction };
    }
  };

  for (const champion of snapshot.champions) {
    for (const [field, value] of championNumericFields(champion)) {
      consider('champion', champion.apiname, field, value, CHAMPION_BOUNDS);
    }
  }
  for (const item of snapshot.items) {
    for (const [field, value] of itemNumericFields(item)) {
      consider('item', `${item.name} (${item.id})`, field, value, ITEM_BOUNDS);
    }
  }

  return { verdicts, fieldsChecked, unbounded, tightestMargin: tightest };
}

function boundFor(change: FieldChange): FieldBound | undefined {
  if (change.kind === 'champion') return CHAMPION_BOUNDS[change.field];
  if (change.kind === 'item') return ITEM_BOUNDS[change.field];
  return undefined;
}

/**
 * Judge every field movement in the diff.
 *
 * Numeric fields go to their bound. Non-numeric fields (a rename, a range type flipping, a
 * champion's resource changing, an ability list changing) cannot be bounded arithmetically and
 * are surfaced as REVIEW — with two exceptions that halt, both named below, because they are
 * the shapes that mean "this is not the same champion any more".
 */
export function checkMovements(diff: SnapshotDiff): BoundVerdict[] {
  const verdicts: BoundVerdict[] = [];

  for (const change of diff.changed) {
    const bound = boundFor(change);
    const before = change.before;
    const after = change.after;

    // Ability rank counts have no arithmetic bound worth writing — 5 and 6 are both normal —
    // but a change to one is never cosmetic: `X to Y` interpolates across the rank count, so a
    // wrong count silently moves every middle value of that ability (DATA-SOURCES §22).
    if (change.field.startsWith('abilityMaxRanks.')) {
      verdicts.push({
        severity: 'review',
        check: 'identity',
        kind: change.kind,
        subject: change.subject,
        field: change.field,
        before,
        after,
        message:
          `${change.subject} ${change.field} changed from ${describe(before)} to ${describe(after)} ` +
          `ranks. Every curated damage row for that ability interpolates across the rank count, ` +
          `so this moves every middle value even though no damage number changed ` +
          `(DATA-SOURCES §22). A human must re-read the ability.`,
      });
      continue;
    }

    if (typeof before === 'number' && typeof after === 'number') {
      if (!bound) {
        verdicts.push({
          severity: 'review',
          check: 'unbounded-field',
          kind: change.kind,
          subject: change.subject,
          field: change.field,
          before,
          after,
          message:
            `${change.subject} ${change.field} moved ${before} -> ${after}, but no validation ` +
            `bound is defined for this field. It is reported rather than passed: a field nobody ` +
            `has bounded is a field nobody has checked. Add it to bounds.ts with its evidence.`,
        });
        continue;
      }

      if (before !== 0 && after === 0) {
        verdicts.push({
          severity: bound.zeroing,
          check: 'zeroing',
          kind: change.kind,
          subject: change.subject,
          field: change.field,
          before,
          after,
          message:
            `${change.subject} ${change.field} was blanked: ${before} ${bound.unit} -> 0. Across ` +
            `${BOUNDS_EVIDENCE.fieldMovementsObserved} real field movements measured over ` +
            `${BOUNDS_EVIDENCE.patchTransitions} patch transitions, none zeroed a field. This is ` +
            `the shape of a blanked source cell, not of a balance change.`,
        });
        continue;
      }

      if (after < bound.envelope.min || after > bound.envelope.max) {
        verdicts.push({
          severity: 'halt',
          check: 'envelope',
          kind: change.kind,
          subject: change.subject,
          field: change.field,
          before,
          after,
          message:
            `${change.subject} ${change.field} moved ${before} -> ${after} ${bound.unit}, and ` +
            `${after} is outside the plausible range ${bound.envelope.min} to ` +
            `${bound.envelope.max}. Bound: ${bound.why}`,
        });
        continue;
      }

      const absolute = Math.abs(after - before);
      const fraction = before === 0 ? Number.POSITIVE_INFINITY : absolute / Math.abs(before);
      if (absolute > bound.move.maxAbsolute && fraction > bound.move.maxFraction) {
        verdicts.push({
          severity: 'halt',
          check: 'movement',
          kind: change.kind,
          subject: change.subject,
          field: change.field,
          before,
          after,
          message:
            `${change.subject} ${change.field} moved ${before} -> ${after} ${bound.unit}: a ` +
            `change of ${round(absolute)} (${(fraction * 100).toFixed(1)}%). The bound for this ` +
            `field refuses a move that is BOTH larger than ${bound.move.maxAbsolute} AND larger ` +
            `than ${(bound.move.maxFraction * 100).toFixed(0)}%. Largest real movement measured ` +
            `over ${BOUNDS_EVIDENCE.patchTransitions} patches: ` +
            `${bound.observed.largestRealMove ?? 'none measurable'}` +
            `${bound.observed.largestRealFraction !== null ? ` (${(bound.observed.largestRealFraction * 100).toFixed(1)}%)` : ''}.`,
        });
        continue;
      }
      continue;
    }

    // Non-numeric movement.
    const identityHalt =
      change.kind === 'champion' && (change.field === 'stats.rangetype' || change.field === 'id');
    verdicts.push({
      severity: identityHalt ? 'halt' : 'review',
      check: 'identity',
      kind: change.kind,
      subject: change.subject,
      field: change.field,
      before,
      after,
      message: identityHalt
        ? `${change.subject} ${change.field} changed from "${describe(before)}" to ` +
          `"${describe(after)}". This is an identity field: a champion does not change ` +
          `${change.field === 'id' ? 'wiki id' : 'from melee to ranged or back'} in a balance ` +
          `patch, so this is either a rework or a corrupted read, and neither may propagate ` +
          `without a human.`
        : `${change.subject} ${change.field} changed from "${describe(before)}" to ` +
          `"${describe(after)}". Not a numeric field, so no arithmetic bound applies — it is ` +
          `queued for a human instead of being judged mechanically.`,
    });
  }

  return verdicts;
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}

/** Roster-shape checks: mass deletion, a table-wide edit, and the patch going backwards. */
export function checkRosterShape(
  previous: Snapshot,
  candidate: Snapshot,
  diff: SnapshotDiff,
): BoundVerdict[] {
  const verdicts: BoundVerdict[] = [];

  const removed = { champion: 0, item: 0, rune: 0 };
  for (const entity of diff.removed) removed[entity.kind] += 1;

  const lossRules: [keyof typeof removed, number, string][] = [
    ['champion', ROSTER_BOUNDS.maxChampionsRemoved, 'champions'],
    ['item', ROSTER_BOUNDS.maxItemsRemoved, 'items'],
    ['rune', ROSTER_BOUNDS.maxRunesRemoved, 'runes'],
  ];
  for (const [kind, limit, plural] of lossRules) {
    if (removed[kind] > limit) {
      verdicts.push({
        severity: 'halt',
        check: 'roster-loss',
        kind: 'roster',
        subject: 'roster',
        field: `${plural}.count`,
        before: previous[kind === 'champion' ? 'champions' : kind === 'item' ? 'items' : 'runes'].length,
        after: candidate[kind === 'champion' ? 'champions' : kind === 'item' ? 'items' : 'runes'].length,
        message:
          `${removed[kind]} ${plural} disappeared between the stored snapshot and this fetch, ` +
          `and the bound allows at most ${limit}. Riot does not delete ${plural} in bulk, so ` +
          `this reads as a partial or emptied source response rather than a patch.`,
      });
    }
  }

  // Table-wide edit: the same field moving on a large share of the roster at once.
  const perField = new Map<string, number>();
  for (const change of diff.changed) {
    if (change.kind !== 'champion') continue;
    perField.set(change.field, (perField.get(change.field) ?? 0) + 1);
  }
  const rosterSize = Math.max(candidate.champions.length, 1);
  for (const [field, count] of [...perField].sort((a, b) => a[0].localeCompare(b[0]))) {
    const share = count / rosterSize;
    if (share > ROSTER_BOUNDS.maxSameFieldShareOfRoster && count >= ROSTER_BOUNDS.minChampionsForMassEdit) {
      verdicts.push({
        severity: 'halt',
        check: 'mass-edit',
        kind: 'roster',
        subject: 'roster',
        field,
        before: null,
        after: count,
        message:
          `${field} changed on ${count} of ${rosterSize} champions ` +
          `(${(share * 100).toFixed(1)}%), above the ${(ROSTER_BOUNDS.maxSameFieldShareOfRoster * 100).toFixed(0)}% ` +
          `bound. The largest real same-field sweep on record is base magic resistance across ` +
          `28 champions in patch 16.16 (DATA-SOURCES §14.1), which is 16%. A change this wide ` +
          `reads as a table-wide edit to the source module, not as balance.`,
      });
    }
  }

  const order = comparePatches(previous.patch, candidate.patch);
  if (order > 0) {
    verdicts.push({
      severity: 'halt',
      check: 'patch-regression',
      kind: 'patch',
      subject: 'patch',
      field: 'patch',
      before: previous.patch,
      after: candidate.patch,
      message:
        `the stored snapshot is patch ${previous.patch} but this fetch returned ` +
        `${candidate.patch}, which is older. Data Dragon has been served a stale or cached ` +
        `version list; updating would roll the product's data backwards.`,
    });
  }

  return verdicts;
}

/** -1 / 0 / 1 comparing two Data Dragon patch strings numerically ("16.9.1" < "16.16.1"). */
export function comparePatches(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export interface BoundsResult {
  verdicts: BoundVerdict[];
  halts: BoundVerdict[];
  reviews: BoundVerdict[];
  envelope: EnvelopeReport;
}

/** Everything: the envelope over the candidate, the movements, and the roster shape. */
export function runBounds(
  previous: Snapshot | null,
  candidate: Snapshot,
  diff: SnapshotDiff | null,
): BoundsResult {
  const envelope = checkEnvelope(candidate);
  const movements = previous && diff ? checkMovements(diff) : [];

  // An out-of-envelope value that MOVED there is caught twice — once by the static envelope
  // sweep over the candidate, once by the movement check. Both are correct; reporting both
  // would double-count the halts and make a reviewer look for two problems. The movement
  // version wins because it states BOTH values, and §9's halts have to be readable.
  const movementKeys = new Set(movements.map((v) => `${v.kind}|${v.subject}|${v.field}`));
  const verdicts: BoundVerdict[] = envelope.verdicts.filter(
    (v) => !movementKeys.has(`${v.kind}|${v.subject}|${v.field}`),
  );
  verdicts.push(...movements);
  if (previous && diff) {
    verdicts.push(...checkRosterShape(previous, candidate, diff));
  }
  verdicts.sort(
    (a, b) =>
      a.check.localeCompare(b.check) ||
      a.subject.localeCompare(b.subject) ||
      a.field.localeCompare(b.field),
  );
  return {
    verdicts,
    halts: verdicts.filter((v) => v.severity === 'halt'),
    reviews: verdicts.filter((v) => v.severity === 'review'),
    envelope,
  };
}
