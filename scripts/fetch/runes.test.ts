// Tests for the rune flattener. The fixture is a trimmed slice of the live
// runesReforged.json for 16.16.1; the full-shape assertions read the generated file.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Rune } from '../../src/types/data.ts';
import { parseRunes, type RawRuneTree } from './runes.ts';

const iconUrl = (path: string) => `https://ddragon.leagueoflegends.com/cdn/img/${path}`;

// Real values, observed 2026-08-12.
const RAW: RawRuneTree[] = [
  {
    id: 8100,
    key: 'Domination',
    name: 'Domination',
    icon: 'perk-images/Styles/7200_Domination.png',
    slots: [
      {
        runes: [
          {
            id: 8112,
            key: 'Electrocute',
            name: 'Electrocute',
            icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png',
          },
        ],
      },
      {
        runes: [
          {
            id: 8126,
            key: 'CheapShot',
            name: 'Cheap Shot',
            icon: 'perk-images/Styles/Domination/CheapShot/CheapShot.png',
          },
        ],
      },
    ],
  },
];

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

describe('rune-parser', () => {
  const { runes, trees } = parseRunes(RAW, iconUrl);

  it('flattens trees to runes, tagging the tree and the row', () => {
    expect(runes).toEqual([
      {
        id: 8112,
        key: 'Electrocute',
        name: 'Electrocute',
        icon: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/Electrocute/Electrocute.png',
        tree: 'Domination',
        slot: 0, // row 0 is the keystone row
      },
      {
        id: 8126,
        key: 'CheapShot',
        name: 'Cheap Shot',
        icon: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/CheapShot/CheapShot.png',
        tree: 'Domination',
        slot: 1,
      },
    ]);
    expect(trees[0]!.runeCount).toBe(2);
  });

  it('refuses an unknown tree rather than inventing one', () => {
    expect(() => parseRunes([{ key: 'Wildcard', slots: [] }], iconUrl)).toThrow(/unknown rune tree/);
  });

  it('carries no numeric values, because every rune number is prose in the source', () => {
    for (const rune of runes) {
      expect(Object.keys(rune).sort()).toEqual(['icon', 'id', 'key', 'name', 'slot', 'tree']);
    }
  });

  it('produces 5 trees and 62 runes from the live source', () => {
    const generated = readGenerated<{ trees: { key: string }[]; runes: Rune[] }>('runes.json');
    expect(generated.trees.map((t) => t.key)).toEqual([
      'Domination',
      'Inspiration',
      'Precision',
      'Resolve',
      'Sorcery',
    ]);
    expect(generated.runes.length).toBe(62);
    // Keystone row sizes observed live: Domination 3, Inspiration 3, Precision 4,
    // Resolve 3, Sorcery 4 = 17 keystones.
    expect(generated.runes.filter((r) => r.slot === 0).length).toBe(17);
    expect(generated.runes.find((r) => r.key === 'Electrocute')?.tree).toBe('Domination');
  });
});
