// Riot's shipped game data as a THIRD referee for ability numbers.
//
// WHAT IT IS. `raw.communitydragon.org/latest/game/data/characters/<champ>/<champ>.bin.json` is a
// dump of the game's own binary data. Each spell object carries `mSpell.DataValues`, a list of
// `{ name, values[] }` — the literal per-rank arrays the game runs on.
//
// WHY IT MATTERS. DATA-SOURCES §4 concluded that Riot exposes no usable ability damage. That is
// true of DATA DRAGON and false of the game data, and the distinction was worth finding: gate 5
// settled several disputes outright by reading these arrays, including confirming that Ezreal Q
// scales with TOTAL and not bonus attack damage. It is a genuinely independent source — it is
// not derived from the wiki and the wiki is not derived from it.
//
// THREE TRAPS, ALL THREE VERIFIED BEFORE THIS FILE WAS WRITTEN, on Lux Q and Ashe W against the
// wiki's own values:
//
//  1. INDEX 0 IS THE UNLEARNED RANK. Lux Q `BaseDamage` is [40, 80, 120, 160, 200, 240, 280] and
//     the ability deals 80 at rank 1. Reading indices 0..4 gives 40/80/120/160/200 — every value
//     shifted one rank, which is a plausible wrong number at every rank.
//  2. THE ARRAY RUNS PAST THE REAL MAXIMUM RANK. Those same arrays hold seven entries for a
//     five-rank ability; index 6 (280) is a rank no player can reach.
//  3. A MODE OVERRIDE SITS BESIDE THE REAL VALUES. `DataValuesModeOverride.cherry` is Arena, and
//     Lux Q reads 70..310 there against 40..280 on Summoner's Rift. Reading the wrong one gives
//     a self-consistent set of numbers for a game mode this product does not model.
//
// Read-only: this file never decides a value, it only supplies one for comparison.

/** One per-rank array as the game ships it, before offsetting or truncating. */
export interface RawDataValue {
  name: string;
  values: number[];
}

export class GameDataError extends Error {}

/**
 * The values for ranks 1..maxRank of a shipped array — offset past the unlearned entry and
 * truncated at the ability's real rank count.
 *
 * Throws rather than padding when the array is too short: a missing rank is a reason to stop
 * using the source for that ability, not to invent an entry for it.
 */
export function ranksOf(values: readonly number[], maxRank: number): number[] {
  if (maxRank < 1) throw new GameDataError(`maxRank must be >= 1, got ${maxRank}`);
  if (values.length < maxRank + 1) {
    throw new GameDataError(
      `array has ${values.length} entries, too few for ${maxRank} ranks once the unlearned ` +
        `entry at index 0 is skipped`,
    );
  }
  return values.slice(1, maxRank + 1);
}

/**
 * Find a spell's shipped data values by object name, e.g. "LuxLightBinding".
 * `DataValuesModeOverride` is deliberately NOT consulted — those are other game modes.
 */
export function spellDataValues(
  dump: Record<string, unknown>,
  objectName: string,
): RawDataValue[] | undefined {
  const key = Object.keys(dump).find((k) => k.endsWith(`/${objectName}`));
  if (key === undefined) return undefined;
  const spell = (dump[key] as { mSpell?: { DataValues?: RawDataValue[] } }).mSpell;
  return spell?.DataValues;
}

/** One named array from a spell, offset and truncated. Undefined when the spell does not carry it. */
export function referenceSeries(
  dump: Record<string, unknown>,
  objectName: string,
  valueName: string,
  maxRank: number,
): number[] | undefined {
  const found = spellDataValues(dump, objectName)?.find((v) => v.name === valueName);
  return found ? ranksOf(found.values, maxRank) : undefined;
}

export const GAME_DATA_URL = (champion: string): string =>
  `https://raw.communitydragon.org/latest/game/data/characters/${champion.toLowerCase()}/${champion.toLowerCase()}.bin.json`;
