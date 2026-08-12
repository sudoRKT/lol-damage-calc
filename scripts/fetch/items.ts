// The item pool, filtered out of Data Dragon's item.json.
//
// item.json ships every item for every game mode — 868 entries. Real Summoner's Rift
// items are duplicated under mode-specific ids (Infinity Edge is 3031, 223031 and
// 773031). The corrected filter is recorded in DATA-SOURCES.md §5:
//
//   maps["11"] === true  AND  gold.purchasable === true  AND  gold.total > 0  AND  id < 200000
//
// The id cutoff is what the older three-part filter was missing. `maps["11"]` does NOT
// isolate classic Summoner's Rift, because Swiftplay runs on map 11 too; without the
// cutoff the pool admits Swiftplay copies at different prices (Redemption 3107 at 2300g
// AND 323107 at 2800g). Do not reinstate the three-part filter.
//
// A name-level de-duplication runs afterwards as a belt-and-braces check, keeping the
// lowest id where a name still has more than one survivor.
//
// Pure — no network, no filesystem. Tested by items.test.ts.

import type { Item, Provenance } from '../../src/types/data.ts';

/** The shape of one item.json entry, narrowed to the fields the filter reads. */
export interface RawItem {
  name?: string;
  maps?: Record<string, boolean>;
  gold?: { total?: number; purchasable?: boolean };
  stats?: Record<string, number>;
  image?: { full?: string };
}

export type RawItemMap = Record<string, RawItem>;

/** The id at or above which every observed entry is a game-mode duplicate. */
export const MODE_VARIANT_ID_FLOOR = 200000;

/** Entry counts at each stage, so the pipeline can report where items were dropped. */
export interface FilterStages {
  total: number;
  afterMap11: number;
  afterPurchasable: number;
  afterGoldPositive: number;
  afterIdCutoff: number;
  afterNameDedup: number;
  /**
   * How many DISTINCT NAMES the old, broken three-part filter (no id cutoff) leaves.
   * Recorded on purpose: DATA-SOURCES §5 reports this figure as 222 and then calls 222
   * "the corrected pool" as well, which cannot both be true — see items.test.ts.
   */
  distinctNamesBeforeIdCutoff: number;
}

export interface FilterResult {
  items: Item[];
  stages: FilterStages;
  /** Names that survived the id cutoff more than once, and the ids involved. */
  deduplicated: { name: string; kept: number; dropped: number[] }[];
}

function onMap11(item: RawItem): boolean {
  return item.maps?.['11'] === true;
}

function isPurchasable(item: RawItem): boolean {
  return item.gold?.purchasable === true;
}

function costsGold(item: RawItem): boolean {
  return (item.gold?.total ?? 0) > 0;
}

/**
 * Apply the corrected four-part filter and the name de-duplication, and shape the
 * survivors into the frozen `Item` contract.
 *
 * `iconUrl` turns Data Dragon's bare `image.full` ("3031.png") into an absolute URL, so
 * the interface never has to reassemble a CDN path.
 */
export function filterItems(
  raw: RawItemMap,
  provenance: Provenance,
  iconUrl: (imageFull: string) => string,
): FilterResult {
  const ids = Object.keys(raw);
  const stages: FilterStages = {
    total: ids.length,
    afterMap11: 0,
    afterPurchasable: 0,
    afterGoldPositive: 0,
    afterIdCutoff: 0,
    afterNameDedup: 0,
    distinctNamesBeforeIdCutoff: 0,
  };

  const map11 = ids.filter((id) => onMap11(raw[id]!));
  stages.afterMap11 = map11.length;

  const purchasable = map11.filter((id) => isPurchasable(raw[id]!));
  stages.afterPurchasable = purchasable.length;

  const paid = purchasable.filter((id) => costsGold(raw[id]!));
  stages.afterGoldPositive = paid.length;
  stages.distinctNamesBeforeIdCutoff = new Set(paid.map((id) => raw[id]!.name ?? id)).size;

  const classic = paid.filter((id) => Number(id) < MODE_VARIANT_ID_FLOOR);
  stages.afterIdCutoff = classic.length;

  // De-duplicate by name, keeping the lowest id.
  const byName = new Map<string, number[]>();
  for (const id of classic) {
    const name = raw[id]!.name ?? `Unnamed item ${id}`;
    const list = byName.get(name);
    if (list) list.push(Number(id));
    else byName.set(name, [Number(id)]);
  }

  const deduplicated: FilterResult['deduplicated'] = [];
  const items: Item[] = [];
  for (const [name, idList] of byName) {
    const sorted = [...idList].sort((a, b) => a - b);
    const keptId = sorted[0]!;
    if (sorted.length > 1) {
      deduplicated.push({ name, kept: keptId, dropped: sorted.slice(1) });
    }
    const entry = raw[String(keptId)]!;
    items.push({
      id: keptId,
      name,
      gold: {
        total: entry.gold?.total ?? 0,
        purchasable: entry.gold?.purchasable === true,
      },
      stats: entry.stats ?? {},
      icon: iconUrl(entry.image?.full ?? ''),
      provenance,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id);
  deduplicated.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  stages.afterNameDedup = items.length;

  return { items, stages, deduplicated };
}
