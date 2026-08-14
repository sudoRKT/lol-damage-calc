// Fetch the live 291-effect population once, so more than one runner can measure over it.
//
// `values.ts` builds this inline. This is the same four fetches in the same order, factored out
// for the refusal census, which has to measure over the identical population or its denominator
// means nothing. It is NOT a second definition of the population: it calls the same
// `filterItems`, the same `buildItemEffectRecords` and the same `classifyEffect`.

import type { Provenance } from '../../src/types/data.ts';
import { classifyEffect, type EffectClassification } from './effect-census.ts';
import {
  buildItemEffectRecords,
  buildRuneEffectRecords,
  type RawRuneTreeForCensus,
} from './effect-population.ts';
import { filterItems, type RawItemMap } from './items.ts';
import { parseLuaModule } from './lua-table.ts';
import {
  ddragonItemsUrl,
  ddragonRunesUrl,
  extractWikiContent,
  fetchJson,
  itemIconUrl,
  VERSIONS_URL,
  WIKI_ITEM_MODULE_URL,
} from './sources.ts';

export interface LivePopulation {
  patch: string;
  fetched: string;
  itemCount: number;
  rows: EffectClassification[];
  /** Data Dragon's STRUCTURED stats per item id — the double-count check needs them. */
  ddragonStats: Record<number, Record<string, number>>;
  /** Data Dragon's raw item description HTML per item id. */
  ddragonDescriptions: Record<number, string>;
}

export async function fetchEffectPopulation(): Promise<LivePopulation> {
  const fetched = new Date().toISOString();
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0];
  if (!patch) throw new Error('versions.json returned an empty list');

  const provenance: Provenance = {
    source: 'Riot Data Dragon item.json',
    url: ddragonItemsUrl(patch),
    patch,
    fetched,
  };
  const itemFile = await fetchJson<{ data: RawItemMap }>(ddragonItemsUrl(patch));
  const { items } = filterItems(itemFile.data, provenance, (full) => itemIconUrl(patch, full));
  const moduleEnvelope = await fetchJson<unknown>(WIKI_ITEM_MODULE_URL);
  const itemModule = parseLuaModule(extractWikiContent(moduleEnvelope));
  const join = buildItemEffectRecords(
    items.map((i) => ({ id: i.id, name: i.name })),
    itemModule,
  );
  const runeTrees = await fetchJson<RawRuneTreeForCensus[]>(ddragonRunesUrl(patch));
  const runeRecords = buildRuneEffectRecords(runeTrees);

  const ddragonStats: Record<number, Record<string, number>> = {};
  const ddragonDescriptions: Record<number, string> = {};
  for (const item of items) {
    ddragonStats[item.id] = item.stats;
    ddragonDescriptions[item.id] = String(itemFile.data[String(item.id)]?.description ?? '');
  }

  return {
    patch,
    fetched,
    itemCount: items.length,
    rows: [...join.records, ...runeRecords].map(classifyEffect),
    ddragonStats,
    ddragonDescriptions,
  };
}
