// Building the effect population: which effects exist, for which items and runes.
//
// This is the step that decides WHAT IS COUNTED. It is separated from the classifier so the
// population can be checked on its own — a census whose denominator is wrong is wrong
// everywhere at once.
//
// The item pool is Data Dragon's (the corrected §5 filter, 209 items). The effect TEXT is
// the wiki's (`Module:ItemData/data`). That split is deliberate and follows DATA-SOURCES
// §12's rule that authority is per-field: Data Dragon is authoritative for which items exist
// and what they cost, and it does NOT carry the effect values — its `description` is display
// HTML with the numbers baked in, while the wiki module carries the same effects keyed
// `pass`/`pass2`/`act`, which is exactly what `CuratedItemEffect.key` is defined against.
//
// Pure: no network, no filesystem. Tested by effect-census.test.ts.

import type { LuaTable, LuaValue } from './lua-table.ts';
import type { EffectRecord } from './effect-census.ts';
import { stripHtml } from './effect-text.ts';

/** The item effect keys observed in the live module, in the order they are reported. */
export const ITEM_EFFECT_KEYS = ['pass', 'pass2', 'pass3', 'act', 'consume'] as const;

export interface ItemJoin {
  /** Items in the pool that the wiki module has an entry for. */
  matched: number;
  /** Pool items with no wiki module entry at all — they can carry no effect text. */
  unmatched: { id: number; name: string }[];
  /** Pool items whose module entry has no `effects` table: stats only, no passive. */
  withoutEffects: { id: number; name: string }[];
  records: EffectRecord[];
}

function asTableOrNull(value: LuaValue | undefined): LuaTable | null {
  return typeof value === 'object' && value !== null ? (value as LuaTable) : null;
}

/**
 * Join the filtered item pool to the wiki module BY NUMERIC ID, not by name.
 *
 * By id because the module is keyed by display name and a name join would silently depend on
 * punctuation and capitalisation agreeing across two independently maintained sources. The id
 * is a number both sides state.
 */
export function buildItemEffectRecords(
  pool: { id: number; name: string }[],
  itemModule: LuaTable,
): ItemJoin {
  const byId = new Map<number, { wikiName: string; entry: LuaTable }>();
  for (const [wikiName, value] of Object.entries(itemModule)) {
    const entry = asTableOrNull(value);
    if (!entry) continue;
    if (typeof entry.id === 'number') byId.set(entry.id, { wikiName, entry });
  }

  const join: ItemJoin = { matched: 0, unmatched: [], withoutEffects: [], records: [] };

  for (const item of [...pool].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const hit = byId.get(item.id);
    if (!hit) {
      join.unmatched.push({ id: item.id, name: item.name });
      continue;
    }
    join.matched++;
    const effects = asTableOrNull(hit.entry.effects);
    if (!effects) {
      join.withoutEffects.push({ id: item.id, name: item.name });
      continue;
    }
    for (const key of Object.keys(effects)) {
      const value = effects[key];
      if (typeof value === 'string') {
        // Nine live entries are a bare string instead of a table: the consumables, and two
        // `=>Other Item` cross-references. Both are real effect entries.
        join.records.push({
          source: 'item',
          ownerName: item.name,
          id: item.id,
          key,
          effectName: null,
          text: value,
        });
        continue;
      }
      const table = asTableOrNull(value);
      if (!table) continue;
      const parts = ['description', 'description2', 'description3', 'description4']
        .map((field) => table[field])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      join.records.push({
        source: 'item',
        ownerName: item.name,
        id: item.id,
        key,
        effectName: typeof table.name === 'string' ? table.name : null,
        text: parts.join(' '),
      });
    }
  }
  return join;
}

export interface RawRuneTreeForCensus {
  key?: string;
  slots?: { runes?: { id?: number; name?: string; longDesc?: string; shortDesc?: string }[] }[];
}

/**
 * One record per rune. `longDesc` is used, not `shortDesc`: the short form drops the numbers
 * (DATA-SOURCES §6), and a census of what the source states must read the fuller statement.
 */
export function buildRuneEffectRecords(trees: RawRuneTreeForCensus[]): EffectRecord[] {
  const records: EffectRecord[] = [];
  for (const tree of trees) {
    for (const slot of tree.slots ?? []) {
      for (const rune of slot.runes ?? []) {
        records.push({
          source: 'rune',
          ownerName: rune.name ?? `rune ${rune.id ?? '?'}`,
          id: rune.id ?? 0,
          key: 'rune',
          effectName: tree.key ?? null,
          text: stripHtml(rune.longDesc ?? ''),
        });
      }
    }
  }
  return records;
}
