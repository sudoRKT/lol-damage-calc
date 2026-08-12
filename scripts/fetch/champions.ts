// Champion stats: parsed out of the wiki's Lua module, then gated on Data Dragon.
//
// Two rules from DATA-SOURCES.md drive this file:
//   §3 — champion base stats and per-level growth come from the wiki, NEVER from Data
//        Dragon, whose `attackdamageperlevel` reads 0 for every champion.
//   §1 — a near-identical abandoned copy of the same module exists on Fandom. The guard
//        `assertOfficialWiki` fails loudly if the data we were served is that copy.
//
// Everything here is pure — no network, no filesystem. Tested by champions.test.ts.

import type {
  AbilitySlot,
  AdaptiveType,
  Champion,
  ChampionBaseStats,
  Provenance,
  RangeType,
} from '../../src/types/data.ts';
import {
  asTable,
  parseLuaModule,
  requireNumber,
  requireString,
  type LuaTable,
} from './lua-table.ts';

/** One entry of the wiki module, before it is gated against Data Dragon. */
export interface WikiChampion {
  /** The wiki's own key — a human-readable name, e.g. "Nunu & Willump", "Mega Gnar". */
  wikiName: string;
  /** The Data Dragon identifier the module carries for us (DATA-SOURCES §10). */
  apiname: string;
  /** The wiki id. Alternate forms carry a fractional id: Mega Gnar 150.2, Kled & Skaarl 240.1. */
  id: number;
  /** Patch this champion last changed in, e.g. "V26.12". Used by the Fandom guard. */
  changes: string | null;
  stats: ChampionBaseStats;
  abilityNames: Partial<Record<AbilitySlot, string>>;
}

export interface WithheldChampion {
  wikiName: string;
  apiname: string;
  reason: string;
}

const RANGE_TYPES: RangeType[] = ['Melee', 'Ranged'];
const ADAPTIVE_TYPES: AdaptiveType[] = ['Physical', 'Magic'];

/** The wiki's ability-slot keys, in the order the interface shows them. */
const SLOT_KEYS: { slot: AbilitySlot; key: string }[] = [
  { slot: 'P', key: 'skill_i' },
  { slot: 'Q', key: 'skill_q' },
  { slot: 'W', key: 'skill_w' },
  { slot: 'E', key: 'skill_e' },
  { slot: 'R', key: 'skill_r' },
];

function readAbilityNames(entry: LuaTable, wikiName: string): Partial<Record<AbilitySlot, string>> {
  const names: Partial<Record<AbilitySlot, string>> = {};
  for (const { slot, key } of SLOT_KEYS) {
    const value = entry[key];
    if (typeof value !== 'object' || value === null) continue;
    // The module stores each slot as a list; entry [1] is the ability's real name. Extra
    // entries are alternate cast names (Aatrox Q has "The Darkin Blade 2"/"3").
    const first = (value as LuaTable)['1'];
    if (typeof first === 'string' && first.length > 0) names[slot] = first;
    else if (first !== undefined) {
      throw new Error(`${wikiName}: ${key}[1] was not a string`);
    }
  }
  return names;
}

function readStats(entry: LuaTable, wikiName: string): ChampionBaseStats {
  const stats = asTable(entry['stats'], `${wikiName}.stats`);
  const rangetype = requireString(entry, 'rangetype', wikiName);
  const adaptivetype = requireString(entry, 'adaptivetype', wikiName);
  if (!RANGE_TYPES.includes(rangetype as RangeType)) {
    throw new Error(`${wikiName}: unknown rangetype "${rangetype}"`);
  }
  if (!ADAPTIVE_TYPES.includes(adaptivetype as AdaptiveType)) {
    throw new Error(`${wikiName}: unknown adaptivetype "${adaptivetype}"`);
  }
  return {
    hp_base: requireNumber(stats, 'hp_base', wikiName),
    hp_lvl: requireNumber(stats, 'hp_lvl', wikiName),
    mp_base: requireNumber(stats, 'mp_base', wikiName),
    mp_lvl: requireNumber(stats, 'mp_lvl', wikiName),
    arm_base: requireNumber(stats, 'arm_base', wikiName),
    arm_lvl: requireNumber(stats, 'arm_lvl', wikiName),
    mr_base: requireNumber(stats, 'mr_base', wikiName),
    mr_lvl: requireNumber(stats, 'mr_lvl', wikiName),
    // The wiki calls attack damage "dam"; the frozen contract calls it "ad".
    ad_base: requireNumber(stats, 'dam_base', wikiName),
    ad_lvl: requireNumber(stats, 'dam_lvl', wikiName),
    as_base: requireNumber(stats, 'as_base', wikiName),
    as_lvl: requireNumber(stats, 'as_lvl', wikiName),
    as_ratio: requireNumber(stats, 'as_ratio', wikiName),
    range: requireNumber(stats, 'range', wikiName),
    rangetype: rangetype as RangeType,
    adaptivetype: adaptivetype as AdaptiveType,
  };
}

/** Parse the whole `Module:ChampionData/data` Lua source into champion entries. */
export function parseChampionModule(luaSource: string): WikiChampion[] {
  const module = parseLuaModule(luaSource);
  const champions: WikiChampion[] = [];
  for (const [wikiName, raw] of Object.entries(module)) {
    const entry = asTable(raw, wikiName);
    champions.push({
      wikiName,
      apiname: requireString(entry, 'apiname', wikiName),
      id: requireNumber(entry, 'id', wikiName),
      changes: typeof entry['changes'] === 'string' ? entry['changes'] : null,
      stats: readStats(entry, wikiName),
      abilityNames: readAbilityNames(entry, wikiName),
    });
  }
  return champions;
}

/** "V26.15" -> 26. Returns null for anything that is not a patch marker. */
export function patchMajor(changes: string | null): number | null {
  if (!changes) return null;
  const match = /^V(\d+)\.(\d+)/.exec(changes.trim());
  return match ? Number(match[1]) : null;
}

/** The highest `changes` patch across the roster, as {major, minor, raw}. */
export function highestChangesPatch(
  champions: WikiChampion[],
): { major: number; minor: number; raw: string } | null {
  let best: { major: number; minor: number; raw: string } | null = null;
  for (const champion of champions) {
    const match = /^V(\d+)\.(\d+)/.exec(champion.changes?.trim() ?? '');
    if (!match) continue;
    const candidate = { major: Number(match[1]), minor: Number(match[2]), raw: champion.changes! };
    if (
      !best ||
      candidate.major > best.major ||
      (candidate.major === best.major && candidate.minor > best.minor)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * The wrong-wiki guard (DATA-SOURCES §1). The abandoned Fandom copy of this module tops
 * out at V25.5 while the official wiki reaches V26.15, so a roster whose newest recorded
 * change is V25 or older is the stale copy. Fail loudly — silently accepting it corrupts
 * every champion stat in the product.
 */
export const MINIMUM_ACCEPTABLE_PATCH_MAJOR = 26;

export function assertOfficialWiki(champions: WikiChampion[]): void {
  const highest = highestChangesPatch(champions);
  if (!highest) {
    throw new Error(
      'wrong-wiki guard: no champion carried a "changes" patch marker at all. ' +
        'This is not the expected Module:ChampionData/data.',
    );
  }
  if (highest.major < MINIMUM_ACCEPTABLE_PATCH_MAJOR) {
    throw new Error(
      `wrong-wiki guard: highest champion "changes" patch is ${highest.raw}, but the live ` +
        `official wiki is at V${MINIMUM_ACCEPTABLE_PATCH_MAJOR} or later. This looks like the ` +
        'abandoned Fandom copy (leagueoflegends.fandom.com), which is ~18 months stale and has ' +
        'wrong base stats. Fetch from wiki.leagueoflegends.com/en-us instead. See DATA-SOURCES §1.',
    );
  }
}

export interface JoinResult {
  champions: Champion[];
  withheld: WithheldChampion[];
}

/**
 * Roster membership is gated on Data Dragon asset availability, not on the wiki: a
 * champion with wiki stats but no Data Dragon entry is withheld, never shown with a
 * placeholder. Two kinds of entry get withheld in practice:
 *
 *   - "Mega Gnar" — apiname "GnarBig", which Data Dragon does not ship at all.
 *   - "Kled & Skaarl" — an alternate form that reuses the apiname "Kled". Two wiki rows
 *     cannot both be the champion "Kled", so the canonical row (integer wiki id 240)
 *     wins and the mounted form (id 240.1) is withheld.
 */
export function joinChampions(
  wikiChampions: WikiChampion[],
  dataDragonApinames: Set<string>,
  provenance: Provenance,
): JoinResult {
  const withheld: WithheldChampion[] = [];
  const kept: WikiChampion[] = [];

  for (const champion of wikiChampions) {
    if (!dataDragonApinames.has(champion.apiname)) {
      withheld.push({
        wikiName: champion.wikiName,
        apiname: champion.apiname,
        reason: `no Data Dragon entry for apiname "${champion.apiname}"`,
      });
      continue;
    }
    kept.push(champion);
  }

  // Resolve apiname collisions: the canonical form has an integer id, alternate forms a
  // fractional one. If two integers ever collide, the lower id wins, deterministically.
  const byApiname = new Map<string, WikiChampion[]>();
  for (const champion of kept) {
    const list = byApiname.get(champion.apiname);
    if (list) list.push(champion);
    else byApiname.set(champion.apiname, [champion]);
  }

  const champions: Champion[] = [];
  for (const [apiname, group] of byApiname) {
    const sorted = [...group].sort((a, b) => {
      const aCanonical = Number.isInteger(a.id) ? 0 : 1;
      const bCanonical = Number.isInteger(b.id) ? 0 : 1;
      return aCanonical - bCanonical || a.id - b.id;
    });
    const winner = sorted[0]!;
    for (const loser of sorted.slice(1)) {
      withheld.push({
        wikiName: loser.wikiName,
        apiname: loser.apiname,
        reason: `alternate form of "${winner.wikiName}" — shares Data Dragon apiname "${apiname}"`,
      });
    }
    champions.push({
      apiname: winner.apiname,
      name: winner.wikiName,
      id: winner.id,
      stats: winner.stats,
      abilityNames: winner.abilityNames,
      provenance,
    });
  }

  champions.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  withheld.sort((a, b) => a.wikiName.localeCompare(b.wikiName, 'en'));
  return { champions, withheld };
}
