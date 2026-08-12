// Known-answer tests for the item filter. No network: the mechanics run against
// hand-authored fixtures copied from the live item.json, and the full-pool counts run
// against the generated public/data/items.json + manifest.json that the pipeline wrote.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Item, Provenance } from '../../src/types/data.ts';
import { filterItems } from './items.ts';
import { RAW_ITEMS } from './fixtures/items.ts';

const PROVENANCE: Provenance = {
  source: 'Riot Data Dragon — item.json',
  url: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/item.json',
  patch: '16.16.1',
  fetched: '2026-08-12T00:00:00.000Z',
};

const iconUrl = (full: string) =>
  `https://ddragon.leagueoflegends.com/cdn/16.16.1/img/item/${full}`;

const result = filterItems(RAW_ITEMS, PROVENANCE, iconUrl);
const byName = (name: string): Item | undefined => result.items.find((i) => i.name === name);

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');

function readGenerated<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
  } catch {
    throw new Error(
      `public/data/${file} is missing. Run the pipeline first: node scripts/fetch/index.ts`,
    );
  }
}

describe('item-filter-distinct-count', () => {
  // ---------------------------------------------------------------------------------
  // A DISAGREEMENT WITH DATA-SOURCES.md, RECORDED RATHER THAN SMOOTHED OVER.
  //
  // DATA-SOURCES §5 says two things that cannot both be true:
  //   (a) the OLD three-part filter yields "248 entries, but only 222 of them are
  //       distinct items", and
  //   (b) "the corrected pool is 222 distinct items, not 248".
  //
  // Observed live on 2026-08-12 against item.json 16.16.1, (a) is exactly right: 248
  // entries, 222 distinct names. (b) is not: adding `id < 200000` removes 36 entries and
  // leaves 212, of which 209 are distinct names.
  //
  // The 13 names lost are not Summoner's Rift items that the cutoff wrongly ate. Each
  // exists ONLY as a 66xxxx id — Arena/mode-exclusive gear with no classic counterpart:
  // Atma's Reckoning, Demon King's Crown, Shield of Molten Stone, Cloak of Starry Night,
  // Sword of the Divine, Veigar's Talisman of Ascension, Zephyr, Gargoyle Stoneplate,
  // Sword of Blossoming Dawn, Crown of the Shattered Queen, Gambler's Blade, Cruelty,
  // Flesheater. 222 - 13 = 209. The corrected pool cannot be 222, because 13 of those 222
  // names have no member below the cutoff at all.
  //
  // So: 222 is the distinct-name count of the BROKEN filter, not of the corrected one.
  // This test asserts both numbers so the arithmetic is visible, and the finding was
  // reported rather than silently absorbed.
  // ---------------------------------------------------------------------------------

  it('the corrected filter leaves 209 distinct items in the live pool (NOT 222)', () => {
    const items = readGenerated<Item[]>('items.json');
    const distinctNames = new Set(items.map((i) => i.name));
    expect(items.length).toBe(209);
    expect(distinctNames.size).toBe(209);
  });

  it('222 is the distinct-name count of the OLD three-part filter, which yields 248 entries', () => {
    const manifest = readGenerated<{
      itemFilter: {
        stages: {
          total: number;
          afterGoldPositive: number;
          distinctNamesBeforeIdCutoff: number;
          afterIdCutoff: number;
          afterNameDedup: number;
        };
      };
    }>('manifest.json');
    const stages = manifest.itemFilter.stages;
    expect(stages.total).toBe(868);
    expect(stages.afterGoldPositive).toBe(248); // old filter, entries
    expect(stages.distinctNamesBeforeIdCutoff).toBe(222); // old filter, distinct names
    expect(stages.afterIdCutoff).toBe(212); // corrected filter, entries
    expect(stages.afterNameDedup).toBe(209); // corrected filter, distinct items
  });

  it('counts every fixture stage, so the drop points are visible', () => {
    expect(result.stages).toEqual({
      total: 15,
      afterMap11: 14, // the Arena Infinity Edge 223031 is already off map 11
      afterPurchasable: 14,
      afterGoldPositive: 12, // the two zero-gold trinkets go here
      afterIdCutoff: 9, // 323107, 323075 and 663146 go here
      afterNameDedup: 8, // Scorchclaw Pup 1107 goes here
      distinctNamesBeforeIdCutoff: 8,
    });
  });
});

describe('item-filter-redemption', () => {
  it('resolves Redemption to id 3107 at 2300 gold', () => {
    const redemption = byName('Redemption');
    expect(redemption?.id).toBe(3107);
    expect(redemption?.gold.total).toBe(2300);
  });

  it('excludes the 2800-gold Swiftplay copy at id 323107', () => {
    expect(result.items.some((i) => i.id === 323107)).toBe(false);
    expect(result.items.filter((i) => i.name === 'Redemption')).toHaveLength(1);
  });

  it('keeps Redemption at 3107 in the live generated pool too', () => {
    const items = readGenerated<Item[]>('items.json');
    const redemption = items.filter((i) => i.name === 'Redemption');
    expect(redemption).toHaveLength(1);
    expect(redemption[0]!.id).toBe(3107);
    expect(redemption[0]!.gold.total).toBe(2300);
  });
});

describe('item-filter-no-mode-variants', () => {
  it('leaves no surviving item with an id at or above 200000 (fixture)', () => {
    expect(result.items.filter((i) => i.id >= 200000)).toEqual([]);
  });

  it('keeps Thornmail 3075 over 323075 and Hextech Gunblade 3146 over 663146', () => {
    expect(byName('Thornmail')?.id).toBe(3075);
    expect(byName('Thornmail')?.gold.total).toBe(2450);
    expect(byName('Hextech Gunblade')?.id).toBe(3146);
    expect(byName('Hextech Gunblade')?.gold.total).toBe(3000);
  });

  it('leaves no id at or above 200000 in the live generated pool, and no repeated name', () => {
    const items = readGenerated<Item[]>('items.json');
    expect(items.filter((i) => i.id >= 200000)).toEqual([]);
    expect(items.find((i) => i.name === 'Thornmail')?.id).toBe(3075);
    expect(items.find((i) => i.name === 'Hextech Gunblade')?.id).toBe(3146);
    expect(new Set(items.map((i) => i.name)).size).toBe(items.length);
  });

  it('keeps the lowest id when two survivors share a name', () => {
    expect(result.deduplicated).toEqual([
      { name: 'Scorchclaw Pup', kept: 1101, dropped: [1107] },
    ]);
  });
});

describe('item-filter-keeps-cheap-items', () => {
  it('keeps boots and both Doran items', () => {
    expect(byName('Boots')?.gold.total).toBe(300);
    expect(byName("Doran's Blade")?.gold.total).toBe(450);
    expect(byName("Doran's Ring")?.gold.total).toBe(400);
  });

  it('drops the zero-gold trinkets', () => {
    expect(byName('Stealth Ward')).toBeUndefined();
    expect(byName('Farsight Alteration')).toBeUndefined();
  });

  it('drops all six zero-gold trinkets from the live generated pool', () => {
    const items = readGenerated<Item[]>('items.json');
    const trinkets = [
      'Stealth Ward',
      'Farsight Alteration',
      'Oracle Lens',
      'Scarecrow Effigy',
      "Kalista's Black Spear",
    ];
    for (const name of trinkets) {
      expect(items.some((i) => i.name === name)).toBe(false);
    }
    expect(items.find((i) => i.name === 'Boots')?.gold.total).toBe(300);
    expect(items.find((i) => i.name === "Doran's Blade")?.gold.total).toBe(450);
    expect(items.every((i) => i.gold.total > 0)).toBe(true);
  });
});

describe('item record shape', () => {
  it('carries structured stats, an absolute icon URL, and provenance', () => {
    const infinityEdge = byName('Infinity Edge');
    expect(infinityEdge).toEqual({
      id: 3031,
      name: 'Infinity Edge',
      gold: { total: 3500, purchasable: true },
      stats: { FlatCritChanceMod: 0.25, FlatPhysicalDamageMod: 75 },
      icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/item/3031.png',
      provenance: PROVENANCE,
    });
  });
});
