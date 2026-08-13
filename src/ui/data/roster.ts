// The champion roster, and where the official art comes from.
//
// WHAT THIS FILE IS FOR. The picker needs all 173 champions and their portraits. The roster
// itself is produced by the data-pipeline area and published as a static file at
// `/data/champions.json`; this area reads it and never writes it. The shape is the frozen
// `Champion` from src/types/data.ts — no parallel local type.
//
// THE ART BASES ARE NOT INVENTED HERE. Data Dragon serves champion portraits, spell icons and
// passive icons from three fixed paths under a patch-numbered CDN root. The pipeline already
// records those three bases in every abilities file it writes (`art.portraitBase`,
// `art.spellIconBase`, `art.passiveIconBase` — see public/data/abilities/Lux.json), and
// `roster.test.ts` asserts the builders below produce exactly the strings the pipeline
// recorded. If the pipeline's bases ever change, that test fails rather than this file quietly
// pointing at a dead CDN path.
//
// RAISED, not worked around: the base URLs live in an abilities file rather than in
// `manifest.json`, so an area that has no abilities file for a champion has nowhere central to
// read them from. Publishing the three bases in the manifest would remove the duplication.

import type { Champion } from '../../types';

/** Where the pipeline publishes the roster. A static file — no live Riot API call (§7.2). */
export const ROSTER_URL = '/data/champions.json';

/** The Data Dragon CDN root, patch-numbered. SPECIFICATION §15 permits this art as shipped. */
const DDRAGON_ROOT = 'https://ddragon.leagueoflegends.com/cdn';

/** A champion portrait, e.g. `Aatrox.png` → …/16.16.1/img/champion/Aatrox.png */
export function portraitUrl(patch: string, icon: string): string {
  return `${DDRAGON_ROOT}/${patch}/img/champion/${icon}`;
}

/** A spell icon, e.g. `AatroxQ.png` → …/16.16.1/img/spell/AatroxQ.png */
export function spellIconUrl(patch: string, icon: string): string {
  return `${DDRAGON_ROOT}/${patch}/img/spell/${icon}`;
}

/** A passive icon. Data Dragon serves passives from their own directory, not from /spell. */
export function passiveIconUrl(patch: string, icon: string): string {
  return `${DDRAGON_ROOT}/${patch}/img/passive/${icon}`;
}

/** An item icon. Data Dragon names these by item id, e.g. `3068.png` (Sunfire Aegis). */
export function itemIconUrl(patch: string, icon: string): string {
  return `${DDRAGON_ROOT}/${patch}/img/item/${icon}`;
}

/**
 * The right URL for an icon filename whose KIND the contract does not record.
 *
 * `InstanceResult.icon` and `DotSource.icon` are `string | null` — a filename with no field
 * saying whether it is a spell or an item. The canonical mock carries both: `AatroxQ.png` (a
 * spell) and `3068.png` (Sunfire Aegis, an item). They live in different Data Dragon
 * directories, so a single builder would 404 on one of them.
 *
 * THE RULE, and it is a rule rather than a guess: Data Dragon names every item icon after the
 * item's numeric id and never names a spell icon with digits alone. So a filename that is
 * digits-then-.png is an item and everything else is a spell.
 *
 * RAISED: this would not be needed if the result carried the icon's kind alongside its
 * filename. That is a change to the frozen contract and is the lead's to make.
 */
export function iconUrl(patch: string, icon: string): string {
  return /^\d+\.(png|jpg|webp)$/i.test(icon)
    ? itemIconUrl(patch, icon)
    : spellIconUrl(patch, icon);
}

/**
 * Fetch the roster.
 *
 * `fetchImpl` is injectable so a test never touches the network; the default is the browser's
 * own `fetch`. A non-OK response throws with the status rather than resolving to an empty
 * roster — a picker silently offering no champions is worse than one that says it failed.
 */
export async function loadRoster(
  fetchImpl: typeof fetch = fetch,
  url: string = ROSTER_URL,
): Promise<Champion[]> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Champion roster: ${url} returned ${response.status}`);
  }
  const roster = (await response.json()) as Champion[];
  if (!Array.isArray(roster) || roster.length === 0) {
    throw new Error(`Champion roster: ${url} contained no champions`);
  }
  return roster;
}
