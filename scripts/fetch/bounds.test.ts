// Known-answer tests for the validation bounds (SPECIFICATION §9).
//
// Two kinds of known answer are used, and both come from DATA-SOURCES.md rather than from the
// bounds themselves:
//
//   MUST NOT HALT — real, documented patch changes. The 28-marksman magic-resistance move
//   (§14.1) and Bel'Veth's health growth (§3) actually happened; a bound that refuses them is
//   a bound that would have stopped a correct update.
//
//   MUST HALT — the shapes §9 names: an order-of-magnitude move, and the structural zero Data
//   Dragon reports for attack-damage growth (§3).
//
// The last block is the roster-wide self-test: every envelope run over the data that is already
// published. It must fire zero times, because a bound that refuses live correct data is wrong.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Champion, Item, Rune } from '../../src/types/data.ts';
import {
  BOUNDS_EVIDENCE,
  CHAMPION_BOUNDS,
  ITEM_BOUNDS,
  ROSTER_BOUNDS,
  checkEnvelope,
  comparePatches,
  runBounds,
} from './bounds.ts';
import { diffSnapshots } from './diff.ts';
import { buildSnapshot } from './snapshot.ts';
import { ashe, clone, makeSnapshot } from './snapshot-fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'public', 'data');

function read<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
  } catch {
    throw new Error(
      `public/data/${file} is missing. Run the pipeline first: node scripts/fetch/index.ts`,
    );
  }
}

/** Judge one champion-field movement in isolation and return the verdicts it produced. */
function moveChampionStat(stat: string, from: number, to: number, who = 'Ashe') {
  const before = makeSnapshot();
  const target = before.champions.find((c) => c.apiname === who)!;
  (target.stats as unknown as Record<string, number>)[stat] = from;
  const after = clone(before);
  (after.champions.find((c) => c.apiname === who)!.stats as unknown as Record<string, number>)[
    stat
  ] = to;
  return runBounds(before, after, diffSnapshots(before, after));
}

function moveItemField(field: 'goldTotal' | string, from: number, to: number) {
  const before = makeSnapshot();
  const item = before.items[0]!;
  if (field === 'goldTotal') item.goldTotal = from;
  else item.stats[field.replace('stats.', '')] = from;
  const after = clone(before);
  const target = after.items[0]!;
  if (field === 'goldTotal') target.goldTotal = to;
  else target.stats[field.replace('stats.', '')] = to;
  return runBounds(before, after, diffSnapshots(before, after));
}

describe('bounds: real patch changes must NOT halt', () => {
  it('the 16.16 marksman magic-resistance change (30 -> 33) passes', () => {
    const result = moveChampionStat('mr_base', 30, 33);
    expect(result.halts).toEqual([]);
  });

  it('the same patch\'s magic-resistance growth change (1.3 -> 1.1) passes', () => {
    const result = moveChampionStat('mr_lvl', 1.3, 1.1);
    expect(result.halts).toEqual([]);
  });

  it("Tristana's larger version of that change (28 -> 33, 17.9%) passes", () => {
    const result = moveChampionStat('mr_base', 28, 33);
    expect(result.halts).toEqual([]);
  });

  it("Bel'Veth's health growth change (110 -> 105) passes", () => {
    const result = moveChampionStat('hp_lvl', 110, 105);
    expect(result.halts).toEqual([]);
  });

  it('the largest real base-health move measured in 23 patches (665 -> 625) passes', () => {
    const result = moveChampionStat('hp_base', 665, 625);
    expect(result.halts).toEqual([]);
  });

  it("the largest real attack-speed move measured (Bel'Veth 0.85 -> 0.67) passes", () => {
    const result = moveChampionStat('as_base', 0.85, 0.67);
    expect(result.halts).toEqual([]);
  });

  it('the largest real item reprice measured (1500 -> 1000 gold) passes', () => {
    const result = moveItemField('goldTotal', 1500, 1000);
    expect(result.halts).toEqual([]);
  });

  it('an item stat doubling at a season boundary (armor 25 -> 50) passes', () => {
    const result = moveItemField('stats.FlatArmorMod', 25, 50);
    expect(result.halts).toEqual([]);
  });
});

describe('bounds: implausible movements must halt, naming both values', () => {
  it("SPECIFICATION §9's own example — a base statistic shifting by an order of magnitude", () => {
    const result = moveChampionStat('hp_base', 650, 6500);
    expect(result.halts).toHaveLength(1);
    const halt = result.halts[0]!;
    expect(halt.field).toBe('stats.hp_base');
    expect(halt.before).toBe(650);
    expect(halt.after).toBe(6500);
    expect(halt.message).toContain('650');
    expect(halt.message).toContain('6500');
    expect(halt.message).toContain('outside the plausible range');
  });

  it('a base statistic shifting DOWN by an order of magnitude (650 -> 65)', () => {
    const result = moveChampionStat('hp_base', 650, 65);
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.check).toBe('envelope');
  });

  it('attack-damage growth blanked to zero — the Data Dragon structural fault (§3)', () => {
    const result = moveChampionStat('ad_lvl', 3.5, 0);
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.check).toBe('zeroing');
    expect(result.halts[0]!.message).toContain('blanked');
  });

  it('armor growth blanked to zero halts, even though one champion is legitimately zero', () => {
    const result = moveChampionStat('arm_lvl', 4.6, 0);
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.check).toBe('zeroing');
  });

  it('a melee champion silently becoming ranged (175 -> 550) halts', () => {
    const result = moveChampionStat('range', 175, 550, 'Aatrox');
    expect(result.halts.some((h) => h.field === 'stats.range')).toBe(true);
  });

  it('the range type flipping outright halts as an identity change', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.stats.rangetype = 'Ranged';
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.check).toBe('identity');
    expect(result.halts[0]!.message).toContain('melee to ranged');
  });

  it('an attack-speed ratio moving like a balance lever (0.651 -> 0.9) halts', () => {
    const result = moveChampionStat('as_ratio', 0.651, 0.9);
    expect(result.halts).toHaveLength(1);
  });

  it('an item price tripling (2300 -> 6900) halts on the envelope', () => {
    const result = moveItemField('goldTotal', 2300, 6900);
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.after).toBe(6900);
  });

  it('a percentage stat stored as 35 instead of 0.35 halts on the envelope', () => {
    const result = moveItemField('stats.PercentAttackSpeedMod', 0.35, 35);
    expect(result.halts).toHaveLength(1);
    expect(result.halts[0]!.check).toBe('envelope');
  });

  it('every halt message names the field, both values, and why', () => {
    const result = moveChampionStat('hp_base', 650, 6500);
    for (const halt of result.halts) {
      expect(halt.message).toContain(halt.field);
      expect(halt.message).toContain(String(halt.before ?? ''));
      expect(halt.message).toContain(String(halt.after));
      expect(halt.message.length).toBeGreaterThan(60);
    }
  });
});

describe('bounds: movements that are reviewed rather than halted', () => {
  it('a resource pool being removed is a review — a resource rework really does that', () => {
    const result = moveChampionStat('mp_base', 280, 0);
    expect(result.halts).toEqual([]);
    expect(result.reviews.some((v) => v.check === 'zeroing')).toBe(true);
  });

  it("a champion's resource changing word is a review, not a halt", () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[1]!.resource = 'Energy';
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts).toEqual([]);
    expect(result.reviews).toHaveLength(1);
  });

  it('an ability rank count changing is a review, because it moves every middle value', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.abilityMaxRanks.Q = 6;
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts).toEqual([]);
    expect(result.reviews[0]!.message).toContain('interpolates across the rank count');
  });

  it('a numeric field with no bound defined is reported, never silently passed', () => {
    const before = makeSnapshot();
    before.items[0]!.stats['SomeBrandNewStat'] = 10;
    const after = clone(before);
    after.items[0]!.stats['SomeBrandNewStat'] = 900;
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.reviews.some((v) => v.check === 'unbounded-field')).toBe(true);
  });
});

describe('bounds: roster-shape checks', () => {
  it('the 28-champion magic-resistance sweep of patch 16.16 does NOT read as a mass edit', () => {
    const champions = Array.from({ length: 173 }, (_, i) =>
      ashe({ apiname: `Champ${i}`, name: `Champ${i}`, id: i }),
    );
    const before = makeSnapshot({ champions });
    const after = clone(before);
    for (let i = 0; i < 28; i += 1) after.champions[i]!.stats.mr_base = 33;
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts).toEqual([]);
  });

  it('the same field changing on 80 of 173 champions halts as a table-wide edit', () => {
    const champions = Array.from({ length: 173 }, (_, i) =>
      ashe({ apiname: `Champ${i}`, name: `Champ${i}`, id: i }),
    );
    const before = makeSnapshot({ champions });
    const after = clone(before);
    for (let i = 0; i < 80; i += 1) after.champions[i]!.stats.mr_base = 31;
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts.some((h) => h.check === 'mass-edit')).toBe(true);
    expect(result.halts.find((h) => h.check === 'mass-edit')!.message).toContain('80 of 173');
  });

  it('losing 40 champions halts; losing one does not', () => {
    const champions = Array.from({ length: 50 }, (_, i) =>
      ashe({ apiname: `Champ${i}`, name: `Champ${i}`, id: i }),
    );
    const before = makeSnapshot({ champions });

    const lostOne = makeSnapshot({ champions: champions.slice(0, 49) });
    expect(runBounds(before, lostOne, diffSnapshots(before, lostOne)).halts).toEqual([]);

    const lostForty = makeSnapshot({ champions: champions.slice(0, 10) });
    const result = runBounds(before, lostForty, diffSnapshots(before, lostForty));
    expect(result.halts.some((h) => h.check === 'roster-loss')).toBe(true);
  });

  it('the patch going backwards halts', () => {
    const before = makeSnapshot({ patch: '16.16.1' });
    const after = makeSnapshot({ patch: '16.9.1' });
    const result = runBounds(before, after, diffSnapshots(before, after));
    expect(result.halts.some((h) => h.check === 'patch-regression')).toBe(true);
  });

  it('compares patch strings numerically, not as text (16.9.1 < 16.16.1)', () => {
    expect(comparePatches('16.9.1', '16.16.1')).toBe(-1);
    expect(comparePatches('16.16.1', '16.16.1')).toBe(0);
    expect(comparePatches('16.16.1', '15.24.1')).toBe(1);
  });
});

describe('bounds: limits this check does NOT cover, stated rather than implied', () => {
  it('does not catch the stale-wiki base attack damage gap (60 vs 65) — §15 does', () => {
    // DATA-SOURCES §1: the abandoned Fandom copy reads Volibear 60 where the truth is 65.
    // That is an 8.3% move, indistinguishable in size from a real balance change, so no
    // arithmetic bound can catch it. The wrong-wiki guard and the source policy do.
    const result = moveChampionStat('ad_base', 60, 65);
    expect(result.halts).toEqual([]);
  });

  it('does not catch the Swiftplay price variant (2300 vs 2800) — the item filter does', () => {
    // DATA-SOURCES §5: Redemption is 3107 at 2300g and 323107 at 2800g. The id cutoff keeps
    // the variant out of the pool; the bounds would see only a plausible 500-gold reprice.
    const result = moveItemField('goldTotal', 2300, 2800);
    expect(result.halts).toEqual([]);
  });
});

describe('bounds: the table is internally consistent', () => {
  it('every envelope contains the roster range that was measured for that field', () => {
    for (const bound of [...Object.values(CHAMPION_BOUNDS), ...Object.values(ITEM_BOUNDS)]) {
      expect(bound.observed.rosterMin).toBeGreaterThanOrEqual(bound.envelope.min);
      expect(bound.observed.rosterMax).toBeLessThanOrEqual(bound.envelope.max);
    }
  });

  it('every movement bound clears the largest real movement measured for that field', () => {
    for (const bound of [...Object.values(CHAMPION_BOUNDS), ...Object.values(ITEM_BOUNDS)]) {
      if (bound.observed.largestRealMove === null) continue;
      expect(bound.move.maxAbsolute).toBeGreaterThanOrEqual(bound.observed.largestRealMove);
    }
  });

  it('every bound carries a written justification', () => {
    for (const bound of [...Object.values(CHAMPION_BOUNDS), ...Object.values(ITEM_BOUNDS)]) {
      expect(bound.why.length).toBeGreaterThan(40);
      expect(bound.unit.length).toBeGreaterThan(0);
    }
  });

  it('the mass-edit bound sits above the largest real sweep on record (28 of 173)', () => {
    expect(ROSTER_BOUNDS.maxSameFieldShareOfRoster).toBeGreaterThan(28 / 173);
  });

  it('records the evidence run the numbers came from', () => {
    expect(BOUNDS_EVIDENCE.patchTransitions).toBeGreaterThanOrEqual(20);
    expect(BOUNDS_EVIDENCE.movementsThatZeroedAField).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// THE SELF-TEST. A bound that would refuse data which is already published and correct is a
// wrong bound. This runs every envelope over the whole live roster.
// ---------------------------------------------------------------------------------------

describe('bounds: the roster-wide self-test over live public/data', () => {
  const champions = read<Champion[]>('champions.json');
  const items = read<Item[]>('items.json');
  const runeFile = read<{ runes: Rune[] }>('runes.json');
  const manifest = read<{ patch: string; contestedChampions: string[] }>('manifest.json');

  const live = buildSnapshot({
    patch: manifest.patch,
    wikiHighestChangesPatch: null,
    fetched: '2026-08-14T00:00:00.000Z',
    sources: {},
    contestedChampions: manifest.contestedChampions,
    champions,
    items,
    runes: runeFile.runes,
  });
  const envelope = checkEnvelope(live);

  it('fires on ZERO published values', () => {
    // DEFINITION of the count: one field-check is one (entity, field) pair — one numeric stat
    // of one champion, or one gold/stat value of one item — actually compared against a bound.
    expect(envelope.verdicts).toEqual([]);
  });

  it('checked every numeric field of every champion and item', () => {
    // 173 champions x 14 numeric stats = 2422, plus 209 items x (gold + their stat lines).
    expect(envelope.fieldsChecked).toBeGreaterThan(2800);
    expect(champions.length).toBeGreaterThan(150);
    expect(items.length).toBeGreaterThan(150);
  });

  it('leaves no published numeric field unbounded', () => {
    expect(envelope.unbounded).toEqual([]);
  });

  it('is not passing merely because the envelopes are absurdly wide', () => {
    // The closest real published value to its envelope edge, as a fraction of the envelope's
    // width. If this were large, "zero halts" would be bought by making every envelope huge.
    //
    // A margin of exactly 0 is legitimate and expected here: several fields have a real floor
    // of zero that a live champion sits on — Senna's attack-damage growth, Thresh's armor
    // growth, Jhin's attack-speed ratio, and the 11 champions with no resource pool. So the
    // assertion is on the upper side only.
    expect(envelope.tightestMargin).not.toBeNull();
    expect(envelope.tightestMargin!.marginFraction).toBeLessThan(0.06);
  });

  it('halts if any live value is nudged by an order of magnitude', () => {
    // Proves the self-test can fail: the same envelope, one value corrupted.
    const corrupted = JSON.parse(JSON.stringify(live)) as typeof live;
    corrupted.champions[0]!.stats.hp_base *= 10;
    const result = checkEnvelope(corrupted);
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.subject).toBe(corrupted.champions[0]!.apiname);
  });
});
