// THE CATALOGUE LOADER — everything the engine needs, fetched from the published static files.
//
// `simulate(scenario, catalogue)` (src/engine/simulate.ts) reads no data file by design: champion,
// item and ability values reach it only as arguments, so the calculation layer can be tested on
// hand-authored fixtures alone. **This file is the caller that builds those arguments**, from the
// four static files the data pipeline publishes under `public/data/`.
//
// IT EXTENDS `roster.ts` RATHER THAN DUPLICATING IT. The roster fetch and every Data Dragon URL
// builder stay there; this file adds items, per-champion abilities, the patch, and the contested
// base-statistic notes, and assembles the `Catalogue` the engine's own type describes.
//
// THREE THINGS IT REFUSES TO DO:
//
//  1. **It never invents an ability.** `public/data/abilities/` holds ONE file today (Lux). For
//     every other champion the fetch is a 404, and a 404 resolves to `null` — "nothing has been
//     published" — never to an empty ability record that would let the engine believe it had read
//     a champion's kit and found no damage. The engine then refuses each ability step BY NAME
//     ("nothing has been harvested for this champion's Q slot"), which is what the user sees.
//  2. **It never guesses the patch.** The patch comes from the data itself — every `Champion`
//     carries `provenance.patch` — and `rosterPatch` REFUSES a roster whose entries disagree
//     rather than picking the first one. A page showing art from one patch beside numbers from
//     another is exactly the kind of quiet wrongness this product exists to prevent.
//  3. **It never drops a contested champion's warning.** SPECIFICATION §8: a result involving a
//     champion whose base statistics Riot's own sources disagree about carries a visible note
//     naming the disputed field and both observed values. `public/data/overrides.json` records
//     them; `contestedFor` finds them.
//
// RAISED, NOT WORKED AROUND — two published files have no shape in the frozen contract:
// `manifest.json` and `overrides.json`. `src/types/` carries `Champion`, `Item` and every curated
// shape, but nothing for these two, so the minimal read-only shapes below are declared here. They
// are NOT parallel definitions of a contract type — there is no contract type to route around —
// and each reads only the fields it uses. If the lead adds `Manifest` and `StatOverride` to
// src/types/, this file should import them and delete its own.

import type {
  Champion,
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedItemEffect,
  Item,
  CuratedRune,
  Rune,
} from '../../types';
import type { Catalogue } from '../../engine';

/** Where the pipeline publishes the item pool. 209 items (DATA-SOURCES §5). */
export const ITEMS_URL = '/data/items.json';

/** Where the pipeline publishes the base-statistic overrides, contested ones among them. */
export const OVERRIDES_URL = '/data/overrides.json';

/** Where the curated item effects are published (`scripts/build-item-effects.ts`). */
export const ITEM_EFFECTS_URL = '/data/item-effects.json';
export const RUNE_EFFECTS_URL = '/data/rune-effects.json';
export const RUNES_URL = '/data/runes.json';

/** Where the curated defensive effects are published (`scripts/build-defensive-effects.ts`). */
export const DEFENSIVE_EFFECTS_URL = '/data/defensive-effects.json';

/** One champion's harvested abilities. `{Champion}` is the Data Dragon apiname, e.g. `Lux`. */
export function abilitiesUrl(apiname: string): string {
  return `/data/abilities/${apiname}.json`;
}

/**
 * An abilities file exactly as the pipeline writes it.
 *
 * The `icon` on each ability is the pipeline's own addition to the frozen `CuratedAbility` — the
 * same intersection `ComboBuilder`'s `ShelfAbility` uses, and it is written the same way here so
 * the two never drift.
 */
export interface AbilitiesFile {
  provenance: { patch: string; fetched: string; warning?: string };
  art: { spellIconBase: string; passiveIconBase: string; portraitBase: string };
  abilities: Array<CuratedAbility & { icon: string }>;
}

/**
 * A base statistic Riot's two sources disagree about (SPECIFICATION §8, DATA-SOURCES §15).
 *
 * `status: 'contested'` means nothing settled the disagreement: the value that ships with the
 * patch is used and the champion is flagged. `'confirmed'` means the patch notes settled it, and
 * carries no user-facing consequence.
 */
export interface StatOverrideRecord {
  apiname: string;
  championName: string;
  stat: string;
  wikiValue: number;
  dataDragonValue: number;
  applied: number;
  status: 'confirmed' | 'contested';
  reason: string;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, what: string): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${what}: ${url} returned ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Fetch the item pool.
 *
 * A non-OK response throws with the status rather than resolving to an empty pool, for the same
 * reason the roster fetch does: a picker silently offering no items is worse than one that says
 * it failed.
 */
export async function loadItems(
  fetchImpl: typeof fetch = fetch,
  url: string = ITEMS_URL,
): Promise<Item[]> {
  const items = await fetchJson<Item[]>(fetchImpl, url, 'Item pool');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Item pool: ${url} contained no items`);
  }
  return items;
}

/** Fetch the base-statistic overrides. An absent file is an error, not an empty list. */
export async function loadOverrides(
  fetchImpl: typeof fetch = fetch,
  url: string = OVERRIDES_URL,
): Promise<StatOverrideRecord[]> {
  const rows = await fetchJson<StatOverrideRecord[]>(fetchImpl, url, 'Base-stat overrides');
  if (!Array.isArray(rows)) throw new Error(`Base-stat overrides: ${url} was not a list`);
  return rows;
}

/**
 * Fetch the curated item effects — the actives and the on-hit and Spellblade riders.
 *
 * **AN ABSENT FILE IS AN EMPTY LIST, NOT AN ERROR, AND THAT IS DELIBERATE.** It is the one fetch
 * here that may fail softly. Every item's STRUCTURED statistics come from `items.json` and are
 * unaffected; what is lost is the effects, and the engine already reports each unreachable effect
 * as an instance contributing nothing and saying why. A hard failure would take the whole
 * calculator down over a file that only ever adds rows.
 *
 * A malformed file is still an error: a payload without an `itemEffects` list is a broken build
 * step, not a build that published nothing.
 */
/**
 * The curated rune effects, keyed by rune id for `Catalogue.runeEffects`.
 *
 * Fails soft exactly as `loadItemEffects` does: an absent file costs the rune rows and nothing
 * else, and `simulate` already names every rune it cannot apply, so a missing file degrades to
 * "no rune changes a number" — which was true until today and is the safe direction to fail in.
 */
/**
 * The published rune POOL — 62 runes across 5 trees, the list the picker offers.
 *
 * Distinct from `loadRuneEffects`, which loads the seven curated VALUES. A rune exists in the
 * pool whether or not anyone has read its damage, and the picker must offer all 62: a rune page
 * that silently drops the ones with no modelled effect is worse than one that names them.
 *
 * Does NOT fail soft. An absent pool is not "no runes" — it is a picker with nothing in it, which
 * would look exactly like a rune page a user had emptied. `loadItems` throws for the same reason.
 */
export async function loadRunes(
  fetchImpl: typeof fetch = fetch,
  url: string = RUNES_URL,
): Promise<Rune[]> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Runes: ${url} returned ${response.status}`);
  const file = (await response.json()) as { runes?: Rune[] };
  if (!Array.isArray(file?.runes)) throw new Error(`Runes: ${url} carried no runes list`);
  return file.runes;
}

export async function loadRuneEffects(
  fetchImpl: typeof fetch = fetch,
  url: string = RUNE_EFFECTS_URL,
): Promise<Map<number, CuratedRune[]>> {
  const response = await fetchImpl(url);
  if (response.status === 404) return new Map();
  if (!response.ok) throw new Error(`Rune effects: ${url} returned ${response.status}`);
  const file = (await response.json()) as { runes?: CuratedRune[] };
  const out = new Map<number, CuratedRune[]>();
  for (const rune of file?.runes ?? []) {
    out.set(rune.runeId, [...(out.get(rune.runeId) ?? []), rune]);
  }
  return out;
}

export async function loadItemEffects(
  fetchImpl: typeof fetch = fetch,
  url: string = ITEM_EFFECTS_URL,
): Promise<CuratedItemEffect[]> {
  const response = await fetchImpl(url);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Item effects: ${url} returned ${response.status}`);
  const file = (await response.json()) as { itemEffects?: CuratedItemEffect[] };
  if (!Array.isArray(file?.itemEffects)) {
    throw new Error(`Item effects: ${url} carried no itemEffects list`);
  }
  return file.itemEffects;
}

/**
 * Fetch the curated defensive effects — what a champion's own kit does to damage they receive.
 *
 * Fails soft for the same reason `loadItemEffects` does: an absent file costs the defensive rows
 * and nothing else, and both the panel and the engine already report an unreachable defence
 * rather than pretending it did something. A malformed file is still an error.
 */
export async function loadDefensiveEffects(
  fetchImpl: typeof fetch = fetch,
  url: string = DEFENSIVE_EFFECTS_URL,
): Promise<CuratedDefensiveEffect[]> {
  const response = await fetchImpl(url);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Defensive effects: ${url} returned ${response.status}`);
  const file = (await response.json()) as { defensiveEffects?: CuratedDefensiveEffect[] };
  if (!Array.isArray(file?.defensiveEffects)) {
    throw new Error(`Defensive effects: ${url} carried no defensiveEffects list`);
  }
  return file.defensiveEffects;
}

/** Group published defensive effects by champion, ready for `CatalogueSources.defensiveEffects`. */
export function defensiveEffectsByChampion(
  effects: readonly CuratedDefensiveEffect[],
): ReadonlyMap<string, readonly CuratedDefensiveEffect[]> {
  const byName = new Map<string, CuratedDefensiveEffect[]>();
  for (const e of effects) {
    const list = byName.get(e.champion) ?? [];
    list.push(e);
    byName.set(e.champion, list);
  }
  return byName;
}

/** Group published effects by item id, ready for `CatalogueSources.itemEffects`. */
export function itemEffectsById(
  effects: readonly CuratedItemEffect[],
): ReadonlyMap<number, readonly CuratedItemEffect[]> {
  const byId = new Map<number, CuratedItemEffect[]>();
  for (const e of effects) {
    const list = byId.get(e.itemId) ?? [];
    list.push(e);
    byId.set(e.itemId, list);
  }
  return byId;
}

/**
 * Fetch one champion's abilities, or `null` when the pipeline has published none.
 *
 * **`null` IS A REAL ANSWER AND IS NOT AN ERROR.** One abilities file exists today. Turning a 404
 * into an empty ability list would tell the engine it had read the champion's kit, and the engine
 * would then report each ability as dealing no damage instead of as unharvested — a wrong claim
 * dressed as a computed one. Every other failure (a 500, malformed JSON) still throws.
 */
export async function loadAbilities(
  apiname: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AbilitiesFile | null> {
  const url = abilitiesUrl(apiname);
  const response = await fetchImpl(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Abilities for ${apiname}: ${url} returned ${response.status}`);
  const file = (await response.json()) as AbilitiesFile;
  if (!Array.isArray(file?.abilities)) {
    throw new Error(`Abilities for ${apiname}: ${url} carried no ability list`);
  }
  return file;
}

/**
 * The one patch the whole roster was fetched at.
 *
 * REFUSES A DISAGREEMENT rather than resolving it. Every `Champion` carries its own
 * `provenance.patch`; if two entries disagree, the file was assembled across a patch boundary and
 * the art, the base statistics and the ability values on screen would not all describe the same
 * game. Naming the disagreement is the only honest outcome — picking the first entry's value
 * would produce a page that looks fine and is wrong.
 */
export function rosterPatch(champions: readonly Champion[]): string {
  const patches = [...new Set(champions.map((c) => c.provenance.patch))];
  if (patches.length === 0) throw new Error('Roster patch: the roster is empty');
  if (patches.length > 1) {
    throw new Error(
      `Roster patch: the roster carries more than one patch (${patches.sort().join(', ')}), so ` +
        `no single patch describes this data`,
    );
  }
  return patches[0]!;
}

/**
 * The contested base statistics for the two champions in play, in one list.
 *
 * SPECIFICATION §8 requires the note to NAME the disputed field and both observed values, so this
 * returns the records themselves rather than a boolean. A champion with no contested statistic
 * contributes nothing, which is the overwhelming majority: 4 of 173 champions carry one.
 */
export function contestedFor(
  overrides: readonly StatOverrideRecord[],
  apinames: readonly string[],
): StatOverrideRecord[] {
  const wanted = new Set(apinames);
  return overrides.filter((o) => o.status === 'contested' && wanted.has(o.apiname));
}

/** Everything a `Catalogue` is built from. Each piece is fetched, never fabricated. */
export interface CatalogueSources {
  champions: readonly Champion[];
  items: readonly Item[];
  /** Keyed by apiname. A champion absent from the map has no published abilities. */
  abilities: ReadonlyMap<string, readonly (CuratedAbility & { icon: string })[]>;
  /**
   * Keyed by item id. Added 2026-08-14 with the lookup the engine now asks for.
   *
   * OPTIONAL, and absent is the honest state today: nothing publishes item effects to
   * `public/data/` yet, so the map is empty and every item-effect step still reports itself as
   * not modelled. Wiring the publish step is separate work; leaving this required would have
   * forced a fabricated empty map at every call site instead of one honest default here.
   */
  itemEffects?: ReadonlyMap<number, readonly CuratedItemEffect[]>;
  /** Keyed by apiname. Same reasoning as above — absent means nothing is published yet. */
  defensiveEffects?: ReadonlyMap<string, readonly CuratedDefensiveEffect[]>;
  runeEffects?: ReadonlyMap<number, readonly CuratedRune[]>;
}

/**
 * Build the `Catalogue` the engine asks for.
 *
 * Three lookups and nothing else, each returning `undefined`/`[]` for something the published data
 * does not have — which `simulate` turns into a NAMED refusal rather than a default. The maps are
 * built once here rather than scanned per call, because the item lookup runs once per item per
 * simulation and the roster is re-simulated on every keystroke.
 */
export function buildCatalogue(sources: CatalogueSources): Catalogue {
  const championsByName = new Map(sources.champions.map((c) => [c.apiname, c]));
  const itemsById = new Map(sources.items.map((i) => [i.id, i]));
  return {
    champion: (apiname) => championsByName.get(apiname),
    item: (id) => itemsById.get(id),
    abilities: (apiname) => sources.abilities.get(apiname) ?? [],
    itemEffects: (id) => sources.itemEffects?.get(id) ?? [],
    defensiveEffects: (apiname) => sources.defensiveEffects?.get(apiname) ?? [],
    // AN EMPTY LIST IS A REAL ANSWER AND NOT SILENCE. Nothing publishes rune effects yet, so this
    // returns [] for every id; the engine's contract is explicit that a rune IN THE BUILD with no
    // entry must produce a named row rather than zero damage, and that naming is the engine's job
    // rather than this lookup's. See `Catalogue.runeEffects`.
    runeEffects: (id) => sources.runeEffects?.get(id) ?? [],
  };
}
