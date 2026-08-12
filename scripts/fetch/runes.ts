// Runes, from Data Dragon's runesReforged.json — structural fields only.
//
// DATA-SOURCES.md §6: the file gives 5 trees and 62 runes, each with id, key, icon, name
// and two prose description fields. There are NO structured numeric values — every
// number is embedded in English prose ("deals 40 - 160 … adaptive damage"). Rune numbers
// therefore belong in the curated override file, and nothing numeric is extracted here.
//
// Pure — no network, no filesystem. Tested by runes.test.ts.

import type { Rune, RuneTree } from '../../src/types/data.ts';

export interface RawRune {
  id?: number;
  key?: string;
  name?: string;
  icon?: string;
}

export interface RawRuneTree {
  id?: number;
  key?: string;
  name?: string;
  icon?: string;
  slots?: { runes?: RawRune[] }[];
}

const RUNE_TREES: RuneTree[] = [
  'Domination',
  'Inspiration',
  'Precision',
  'Resolve',
  'Sorcery',
];

export interface TreeSummary {
  id: number;
  key: RuneTree;
  name: string;
  icon: string;
  runeCount: number;
}

export interface RuneResult {
  runes: Rune[];
  trees: TreeSummary[];
}

/**
 * Flatten the tree/slot/rune nesting into a flat rune list plus a tree summary.
 * `slot` is the row index: 0 is the keystone row, 1..3 are the minor rows.
 */
export function parseRunes(raw: RawRuneTree[], iconUrl: (path: string) => string): RuneResult {
  const runes: Rune[] = [];
  const trees: TreeSummary[] = [];

  for (const tree of raw) {
    const key = tree.key ?? '';
    if (!RUNE_TREES.includes(key as RuneTree)) {
      throw new Error(
        `unknown rune tree "${key}" — expected one of ${RUNE_TREES.join(', ')}. ` +
          'The frozen RuneTree contract in src/types/data.ts would need to change first.',
      );
    }
    const treeKey = key as RuneTree;
    let runeCount = 0;

    (tree.slots ?? []).forEach((slot, slotIndex) => {
      for (const rune of slot.runes ?? []) {
        if (typeof rune.id !== 'number' || !rune.key || !rune.name || !rune.icon) {
          throw new Error(`rune in ${treeKey} slot ${slotIndex} is missing id/key/name/icon`);
        }
        runes.push({
          id: rune.id,
          key: rune.key,
          name: rune.name,
          icon: iconUrl(rune.icon),
          tree: treeKey,
          slot: slotIndex,
        });
        runeCount++;
      }
    });

    trees.push({
      id: tree.id ?? 0,
      key: treeKey,
      name: tree.name ?? treeKey,
      icon: iconUrl(tree.icon ?? ''),
      runeCount,
    });
  }

  return { runes, trees };
}
