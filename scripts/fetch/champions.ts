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
  /** The word the module states for the champion's resource — "Mana", "Energy", "Fury", "None",
   *  … `stats.mp_base` is the POOL and does not say which resource it is (DATA-SOURCES §43).
   *  Undefined only for a source that does not carry the field at all, which the official wiki
   *  does for all 175 entries and the stale Fandom copy does not. */
  resource?: string;
  stats: ChampionBaseStats;
  abilityNames: Partial<Record<AbilitySlot, string[]>>;
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

/**
 * Read EVERY ability name in each slot list, in module order.
 *
 * This used to take entry [1] only, on the reading that the rest were "alternate cast names".
 * That is true of 128 of the 208 extra names — "The Darkin Blade 2" is a second cast row of
 * one template — but false of 69, which are whole separate abilities with their own template
 * page and their own numbers: Jayce's entire hammer form, Hwei's ten subjects, Aphelios's
 * five weapons, Elise's spider form, Riven's Wind Slash, Lee Sin's second casts.
 *
 * Both kinds are returned. Telling them apart needs the page each name resolves to, which is
 * a fetch, not something this parser can know — so the harvester deduplicates by revision id
 * (DATA-SOURCES §18). Dropping the extras here to avoid the alias problem would keep losing
 * the 69, which is the worse failure: a missing ability contributes zero damage silently.
 */
function readAbilityNames(entry: LuaTable, wikiName: string): Partial<Record<AbilitySlot, string[]>> {
  const names: Partial<Record<AbilitySlot, string[]>> = {};
  for (const { slot, key } of SLOT_KEYS) {
    const value = entry[key];
    if (typeof value !== 'object' || value === null) continue;
    const list = value as LuaTable;
    const found: string[] = [];
    // Numeric keys in module order: '1', '2', '3', …
    for (const index of Object.keys(list).sort((a, b) => Number(a) - Number(b))) {
      const name = list[index];
      if (typeof name === 'string' && name.length > 0) found.push(name);
      else if (index === '1' && name !== undefined) {
        throw new Error(`${wikiName}: ${key}[1] was not a string`);
      }
    }
    if (found.length > 0) names[slot] = found;
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
      // WHICH RESOURCE THIS CHAMPION SPENDS. `stats.mp_base` is the resource POOL and says
      // nothing about which resource it is — 19 of the module's 175 entries state a non-mana
      // resource with a non-zero pool (DATA-SOURCES §43).
      //
      // READ WHERE PRESENT, NOT REQUIRED HERE, and the reason is worth keeping. Making it a hard
      // parse failure was tried first and it broke the WRONG-WIKI GUARD: the abandoned Fandom
      // copy does not carry the field, so parsing threw before `assertOfficialWiki` could speak
      // and the operator got "resource is not a string" instead of "this is the wrong wiki".
      // A guard that cannot report is not a guard. The requirement lives at the roster level
      // instead — `assertEveryChampionStatesAResource` below — where the message names the
      // actual problem and every affected champion.
      resource: typeof entry['resource'] === 'string' ? entry['resource'] : undefined,
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

/**
 * EVERY CHAMPION IN THE SHIPPED ROSTER STATES A RESOURCE. Throws naming those that do not.
 *
 * `Champion.resource` is optional in the contract only so a champions.json written before
 * 2026-08-14 stays valid. The official wiki module states it for all 175 of its entries, so a
 * champion reaching the roster without one means the source changed or the parser regressed —
 * and the consequence is silent: `StatBlock` would carry no mana for that champion, so every
 * mana-scaling ability they have would report as unmodellable rather than wrong. Silent is
 * exactly what this project does not accept, so the fetch stops here instead.
 *
 * It runs on the JOINED roster rather than during parsing, so the wrong-wiki guard gets to
 * report first when the input is the abandoned Fandom copy.
 */
export function assertEveryChampionStatesAResource(champions: Champion[]): void {
  const missing = champions.filter((c) => !c.resource).map((c) => c.apiname);
  if (missing.length === 0) return;
  throw new Error(
    `${missing.length} champion(s) reached the roster with no "resource" field: ` +
      `${missing.join(', ')}. The wiki module states one for every entry, so this is a source ` +
      `change or a parser regression, not a champion without a resource — "None" is itself a ` +
      `stated value. Without it the pool in stats.mp_base cannot be read as mana ` +
      `(DATA-SOURCES §43), and those champions would silently report no mana at all.`,
  );
}

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
  /** apiname -> slot -> rank count, from Data Dragon's per-champion `maxrank`. */
  maxRanks: Map<string, Partial<Record<AbilitySlot, number>>> = new Map(),
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
      ...(winner.resource !== undefined ? { resource: winner.resource } : {}),
      abilityNames: winner.abilityNames,
      abilityMaxRanks: maxRanks.get(winner.apiname) ?? {},
      // Data Dragon names every champion portrait "<apiname>.png". Safe to build rather
      // than look up, because roster membership is already gated on the apiname existing
      // in Data Dragon a few lines above.
      icon: `${winner.apiname}.png`,
      provenance,
    });
  }

  champions.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  withheld.sort((a, b) => a.wikiName.localeCompare(b.wikiName, 'en'));
  return { champions, withheld };
}
