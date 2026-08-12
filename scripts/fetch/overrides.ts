// THE SOURCE POLICY, in code. Which source wins a champion stat, per field, per patch.
//
// Recorded in full in DATA-SOURCES.md §3 and §15. In short:
//
//   1. The wiki module is the DEFAULT for champion base stats and growth.
//   2. Where Data Dragon disagrees AND the current patch notes document a change whose
//      new value matches Data Dragon, Data Dragon wins that field for that champion.
//      Status: `confirmed`.
//   3. Where the two disagree and nothing resolves it, neither is taken silently. Data
//      Dragon's value is used and the champion is flagged `contested`, so any result
//      involving it can carry a visible note that one base statistic is disputed between
//      Riot's own sources (SPECIFICATION §8).
//   4. Attack-damage growth is NEVER overridden. Data Dragon reports 0 for every champion
//      in every patch; that is a structural fault, not a patch disagreement.
//
// Every override is derived from live evidence on each run — there is no hand-maintained
// list. That is what makes overrides self-retiring: when the wiki module catches up, the
// two sources agree, and no override is produced at all. `assertNoRedundantOverrides`
// turns any violation of that into a loud failure rather than silent accumulation.
//
// Everything here is pure — no network, no filesystem. Tested by overrides.test.ts.

import type { ChampionBaseStats } from '../../src/types/data.ts';
import type { WikiChampion } from './champions.ts';
import { NEVER_OVERRIDABLE, type OverridableStat, type PatchStatChange } from './patch-notes.ts';

/** Data Dragon's name for each stat we are willing to override. */
const DDRAGON_FIELD: Record<OverridableStat, string> = {
  hp_base: 'hp',
  hp_lvl: 'hpperlevel',
  arm_base: 'armor',
  arm_lvl: 'armorperlevel',
  mr_base: 'spellblock',
  mr_lvl: 'spellblockperlevel',
  ad_base: 'attackdamage',
  as_base: 'attackspeed',
  as_lvl: 'attackspeedperlevel',
  range: 'attackrange',
};

const OVERRIDABLE_STATS = Object.keys(DDRAGON_FIELD) as OverridableStat[];

export type OverrideStatus = 'confirmed' | 'contested';

/**
 * One applied override, carrying its own evidence. Point 4 of the policy: a future patch
 * must be able to retire an override rather than inherit it forever, which is why the
 * observed values on both sides are recorded and not just the winner.
 */
export interface StatOverride {
  apiname: string;
  championName: string;
  stat: OverridableStat;
  /** What the wiki module said. */
  wikiValue: number;
  /** What Data Dragon said. */
  dataDragonValue: number;
  /** The value actually written into the generated data. */
  applied: number;
  status: OverrideStatus;
  /** Why this override exists, in plain English. Never empty. */
  reason: string;
  /** Where the decision came from. Never empty. */
  source: string;
  /** The literal patch-note line, when one confirmed it. */
  patchNote: string | null;
  /** The condition under which this override should disappear. */
  retireWhen: string;
}

export interface OverrideResult {
  /** Champions with overrides applied to their stats. Input is not mutated. */
  champions: WikiChampion[];
  overrides: StatOverride[];
  /** Apinames with at least one `contested` override — the set the interface must warn on. */
  contestedApinames: string[];
}

/** The Data Dragon stats block, as the champion summary file provides it. */
export type DataDragonStats = Record<string, number>;

function noteFor(
  changes: PatchStatChange[],
  championName: string,
  stat: OverridableStat,
): PatchStatChange | undefined {
  return changes.find((change) => change.championName === championName && change.stat === stat);
}

/**
 * Apply the source policy.
 *
 * @param wikiChampions parsed wiki module entries (the default source)
 * @param dataDragonStats apiname -> Data Dragon stats block
 * @param patchChanges stat changes documented by the current patch notes
 * @param patchNotesFound false when the wiki has not published the article yet, in which
 *        case nothing can be confirmed and every disagreement is contested
 */
export function buildOverrides(
  wikiChampions: WikiChampion[],
  dataDragonStats: Record<string, DataDragonStats>,
  patchChanges: PatchStatChange[],
  patchNotesFound: boolean,
  patchNotesUrl: string,
): OverrideResult {
  const overrides: StatOverride[] = [];
  const contested = new Set<string>();

  const champions = wikiChampions.map((champion) => {
    const ddStats = dataDragonStats[champion.apiname];
    if (!ddStats) return champion;
    // Alternate forms carry a FRACTIONAL wiki id and reuse the canonical champion's
    // apiname ("Kled & Skaarl" is 240.1 and reuses "Kled"). champions.ts withholds them
    // from the roster, and Data Dragon has no separate entry for them — so comparing an
    // alternate form's stats against the canonical champion's Data Dragon record compares
    // two different things and manufactures disagreements that mean nothing.
    if (!Number.isInteger(champion.id)) return champion;

    const stats: ChampionBaseStats = { ...champion.stats };
    let changed = false;

    for (const stat of OVERRIDABLE_STATS) {
      const wikiValue = stats[stat];
      const dataDragonValue = ddStats[DDRAGON_FIELD[stat]];
      if (typeof wikiValue !== 'number' || typeof dataDragonValue !== 'number') continue;
      // Agreement is the normal case and the resting state: no override, nothing to record.
      if (Math.abs(wikiValue - dataDragonValue) < 1e-9) continue;

      const note = patchNotesFound ? noteFor(patchChanges, champion.wikiName, stat) : undefined;
      const confirmed = note !== undefined && Math.abs(note.to - dataDragonValue) < 1e-9;

      const override: StatOverride = confirmed
        ? {
            apiname: champion.apiname,
            championName: champion.wikiName,
            stat,
            wikiValue,
            dataDragonValue,
            applied: dataDragonValue,
            status: 'confirmed',
            reason:
              `The current patch notes state this change and Data Dragon matches them; the ` +
              `wiki data module has not caught up yet (it still reads ${wikiValue}).`,
            source: patchNotesUrl,
            patchNote: note!.line,
            retireWhen:
              'the wiki module is updated to this value — the two sources then agree and no ' +
              'override is generated',
          }
        : {
            apiname: champion.apiname,
            championName: champion.wikiName,
            stat,
            wikiValue,
            dataDragonValue,
            applied: dataDragonValue,
            status: 'contested',
            reason: note
              ? `Riot's own sources disagree: the patch notes say ${note.to}, Data Dragon says ` +
                `${dataDragonValue}, and the wiki module still reads ${wikiValue}. Data Dragon's ` +
                `value is used because it ships with the patch, but nothing confirms it.`
              : `Data Dragon reads ${dataDragonValue} and the wiki module reads ${wikiValue}, and ` +
                `the current patch notes do not mention this stat for this champion, so nothing ` +
                `explains the difference. Data Dragon's value is used because it ships with the ` +
                `patch, but nothing confirms it.`,
            source: patchNotesFound
              ? patchNotesUrl
              : 'no patch-notes article published for this patch yet',
            patchNote: note?.line ?? null,
            retireWhen:
              'the two sources agree, or a source is found that settles which value is live',
          };

      overrides.push(override);
      if (!confirmed) contested.add(champion.apiname);
      stats[stat] = dataDragonValue;
      changed = true;
    }

    return changed ? { ...champion, stats } : champion;
  });

  overrides.sort(
    (a, b) => a.championName.localeCompare(b.championName, 'en') || a.stat.localeCompare(b.stat),
  );

  return { champions, overrides, contestedApinames: [...contested].sort() };
}

/**
 * Policy point 4: an override without a recorded reason and source is not auditable, and
 * a future patch could never tell whether it is still needed. Fail the run rather than
 * write one.
 */
export function assertOverridesDocumented(overrides: StatOverride[]): void {
  for (const override of overrides) {
    const label = `${override.championName} ${override.stat}`;
    if (!override.reason.trim()) {
      throw new Error(`override for ${label} has no recorded reason. See DATA-SOURCES §15.`);
    }
    if (!override.source.trim()) {
      throw new Error(`override for ${label} has no recorded source. See DATA-SOURCES §15.`);
    }
    if (!override.retireWhen.trim()) {
      throw new Error(`override for ${label} does not say when it should be retired.`);
    }
    if (override.status === 'confirmed' && !override.patchNote) {
      throw new Error(
        `override for ${label} claims to be confirmed by the patch notes but quotes no note line.`,
      );
    }
  }
}

/**
 * An override whose two sources now agree is redundant: the wiki has caught up and the
 * override is stale. Overrides are derived fresh each run so this should be unreachable —
 * which is exactly why it is asserted. If it ever fires, something has started carrying
 * overrides forward instead of re-deriving them, and stale values are about to accumulate.
 */
export function assertNoRedundantOverrides(overrides: StatOverride[]): void {
  const redundant = overrides.filter(
    (override) => Math.abs(override.wikiValue - override.dataDragonValue) < 1e-9,
  );
  if (redundant.length > 0) {
    const list = redundant.map((o) => `${o.championName} ${o.stat} (both read ${o.wikiValue})`);
    throw new Error(
      `${redundant.length} override(s) are redundant — the wiki module has caught up and they ` +
        `must be retired, not carried forward: ${list.join('; ')}. See DATA-SOURCES §15.`,
    );
  }
}

/** Attack-damage growth must never appear as an override. Asserted, not assumed. */
export function assertNoStructuralOverrides(overrides: StatOverride[]): void {
  for (const override of overrides) {
    if ((NEVER_OVERRIDABLE as readonly string[]).includes(override.stat)) {
      throw new Error(
        `override for ${override.championName} touches ${override.stat}, which Data Dragon ` +
          `reports as 0 for every champion in every patch. It can never win this field. ` +
          `See DATA-SOURCES §3.`,
      );
    }
  }
}
