// THE CATALOGUE LOADER, against the real published files.
//
// POPULATION, STATED: every test below that says "the roster" or "the pool" runs over
// `public/data/champions.json` (173 champions) and `public/data/items.json` (209 items) as the
// data pipeline actually published them — never over a fixture. A test that passes here is a
// statement about the data the browser will really load.

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion, Item } from '../../types';
import {
  buildCatalogue,
  contestedFor,
  loadAbilities,
  loadItems,
  loadOverrides,
  rosterPatch,
  type StatOverrideRecord,
} from './catalogue';
import { loadRoster } from './roster';
import { fetchPublished } from './published-files';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ABILITY_DIR = join(REPO, 'public', 'data', 'abilities');

const roster = await loadRoster(fetchPublished);
const items = await loadItems(fetchPublished);
const overrides = await loadOverrides(fetchPublished);

describe('catalogue/what the published data actually contains', () => {
  it('loads the whole roster — 173 champions, none dropped', () => {
    expect(roster).toHaveLength(173);
  });

  it('loads the whole item pool — 209 items, none dropped', () => {
    expect(items).toHaveLength(209);
  });

  it('the published ability files and the roster cover the SAME champions', () => {
    // THE COUNT WITH ITS DEFINITION: an abilities file is `public/data/abilities/{apiname}.json`.
    // This measures the single biggest determinant of what the page can do — a champion with no
    // file can only be given a basic attack — so it is asserted both ways round rather than
    // described. **It changed under this session: one file (Lux) at 15:30 on 2026-08-14, all 173
    // by 15:37, published by the data-pipeline area while this area was being built.** Both
    // directions matter: a file for a champion the roster does not carry is unreachable, and a
    // champion with no file loses every ability step.
    const published = readdirSync(ABILITY_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    const rosterNames = roster.map((c) => c.apiname).sort();
    expect(published.filter((p) => !rosterNames.includes(p))).toEqual([]);
    expect(rosterNames.filter((r) => !published.includes(r))).toEqual([]);
    expect(published).toHaveLength(173);
  });
});

describe('catalogue/the patch is read, never guessed', () => {
  it('every champion in the roster carries the same patch, and that is the one used', () => {
    // A ROSTER-WIDE CHECK, not a spot check: art from one patch beside numbers from another is
    // the kind of wrongness that looks like nothing at all on screen.
    const patches = [...new Set(roster.map((c) => c.provenance.patch))];
    expect(patches).toHaveLength(1);
    expect(rosterPatch(roster)).toBe(patches[0]);
  });

  it('refuses a roster whose entries disagree about the patch rather than picking one', () => {
    const mixed = [
      roster[0]!,
      { ...roster[1]!, provenance: { ...roster[1]!.provenance, patch: '16.15.1' } },
    ];
    expect(() => rosterPatch(mixed)).toThrow(/more than one patch/);
  });

  it('every item in the pool carries the roster’s patch too', () => {
    const itemPatches = [...new Set(items.map((i) => i.provenance.patch))];
    expect(itemPatches).toEqual([rosterPatch(roster)]);
  });
});

describe('catalogue/abilities — absence is an answer, not an error', () => {
  it('returns the file for the one champion that has one', async () => {
    const file = await loadAbilities('Lux', fetchPublished);
    expect(file).not.toBeNull();
    expect(file!.abilities.length).toBeGreaterThan(0);
    expect(file!.abilities.every((a) => a.champion === 'Lux')).toBe(true);
  });

  it('returns null — not an empty list and not a throw — when no file is published', async () => {
    // The distinction is the whole point. `null` means "nothing has been published", which the
    // engine turns into a named refusal per step. An empty list would mean "this champion's kit
    // was read and it deals no damage", which is a claim nobody has made. Every roster champion
    // now has a file, so this uses a name that has none and never will.
    expect(await loadAbilities('NotAChampion', fetchPublished)).toBeNull();
  });

  it('loads a file for EVERY champion in the roster, and every entry names its champion', async () => {
    // The population is all 173. A per-champion loader that worked for the one champion somebody
    // tested and 404ed for another would produce a page that is fine until it is not.
    const failures: string[] = [];
    for (const champion of roster) {
      const file = await loadAbilities(champion.apiname, fetchPublished);
      if (!file) {
        failures.push(`${champion.apiname}: no file`);
        continue;
      }
      if (file.abilities.length === 0) failures.push(`${champion.apiname}: empty ability list`);
      if (file.abilities.some((a) => !a.icon)) failures.push(`${champion.apiname}: an entry has no icon`);
    }
    expect(failures).toEqual([]);
  });
});

describe('catalogue/the three lookups the engine asks for', () => {
  const catalogue = buildCatalogue({ champions: roster, items, abilities: new Map() });

  it('finds every champion in the roster by apiname', () => {
    const missing = roster.filter((c) => catalogue.champion(c.apiname) === undefined);
    expect(missing.map((c) => c.apiname)).toEqual([]);
  });

  it('finds every item in the pool by id', () => {
    const missing = items.filter((i) => catalogue.item(i.id) === undefined);
    expect(missing.map((i) => i.id)).toEqual([]);
  });

  it('returns undefined for a champion and an item that do not exist', () => {
    expect(catalogue.champion('NotAChampion')).toBeUndefined();
    expect(catalogue.item(-1)).toBeUndefined();
  });

  it('returns an empty ability list for a champion with no published file', () => {
    expect(catalogue.abilities('Ahri')).toEqual([]);
  });
});

describe('catalogue/contested base statistics (SPECIFICATION §8)', () => {
  it('finds the contested records for the champions in play, and only those', () => {
    const contested = contestedFor(overrides, ['Jhin', 'Garen']);
    expect(contested.length).toBeGreaterThan(0);
    expect([...new Set(contested.map((c) => c.apiname))]).toEqual(['Jhin']);
  });

  it('names the field and BOTH observed values, so the note is specific', () => {
    for (const record of contestedFor(overrides, ['Jhin', 'Kled', 'Tristana', 'Twitch'])) {
      expect(record.stat).toBeTruthy();
      expect(typeof record.wikiValue).toBe('number');
      expect(typeof record.dataDragonValue).toBe('number');
      expect(record.wikiValue).not.toBe(record.dataDragonValue);
      expect(record.reason.length).toBeGreaterThan(0);
    }
  });

  it('a champion with no disputed statistic produces no note at all', () => {
    expect(contestedFor(overrides, ['Garen', 'Lux'])).toEqual([]);
  });

  it('the contested set is the four the manifest names — measured, not assumed', () => {
    const contestedNames = [
      ...new Set(
        (overrides as StatOverrideRecord[])
          .filter((o) => o.status === 'contested')
          .map((o) => o.apiname),
      ),
    ].sort();
    expect(contestedNames).toEqual(['Jhin', 'Kled', 'Tristana', 'Twitch']);
  });
});

describe('catalogue/a failed fetch fails loudly', () => {
  const notFound = (async () =>
    ({ ok: false, status: 404, json: async () => null }) as unknown as Response) as typeof fetch;

  it('throws with the status rather than resolving to an empty item pool', async () => {
    await expect(loadItems(notFound)).rejects.toThrow(/404/);
  });

  it('throws rather than resolving to an empty roster', async () => {
    await expect(loadRoster(notFound)).rejects.toThrow(/404/);
  });

  it('a 500 on an abilities file throws — only a 404 means "nothing published"', async () => {
    const serverError = (async () =>
      ({ ok: false, status: 500, json: async () => null }) as unknown as Response) as typeof fetch;
    await expect(loadAbilities('Lux', serverError)).rejects.toThrow(/500/);
  });
});

describe('catalogue/types stay the frozen ones', () => {
  it('a loaded champion and item satisfy the contract shapes', () => {
    // Not a runtime assertion so much as a compile-time one: if `Champion` or `Item` changed
    // under this area, this file stops typechecking rather than the page rendering something odd.
    const champion: Champion = roster[0]!;
    const item: Item = items[0]!;
    expect(champion.apiname.length).toBeGreaterThan(0);
    expect(item.id).toBeGreaterThan(0);
  });
});
