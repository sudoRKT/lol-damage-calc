// HOW MANY DEFENDER CONTROLS ARE REACHABLE IN ONE SCENARIO.
//
// DATA-SOURCES §40 measured 210 conditional defensive effects across all 937 ability pages and
// drew the conclusion that "the defender panel needs on the order of 200 controls". That figure
// is correct and the conclusion does not follow from it, because **a scenario has ONE defender**
// (SPECIFICATION §1). The question a designer has to answer is not how many toggles exist in the
// game; it is how many appear on screen once a champion is chosen.
//
// This file measures that. It decides nothing about the interface and draws nothing: it turns
// the census into a distribution over the roster, with the counting rule stated in full, so a
// design argument can be had against a number instead of an impression.
//
// Pure: no network, no filesystem. Tested by defender-toggles.test.ts.

// ---------------------------------------------------------------------------
// The two inputs, as the files on disk shape them
// ---------------------------------------------------------------------------

/** One row of `build/proposed-curated/defensive-census.json`. Read-only to this directory. */
export interface CensusEntry {
  /** "Champion/Slot/Ability Name". */
  key: string;
  champion: string;
  kinds: string[];
  activation: 'always-active' | 'conditional' | 'not-stated';
  valueSource?: string;
  rows?: { label: string; value: string }[];
}

/**
 * A kind that changes the SURVIVAL VERDICT without changing damage received.
 *
 * DATA-SOURCES §40 reports these separately and so does this file. An entry whose ONLY kind is
 * one of these is not a control on incoming damage, and folding it in would inflate the count
 * with something the panel would present differently.
 */
export const HEALTH_GRANT_KINDS = ['health-grant', 'max-health-grant'];

export function isHealthGrantOnly(entry: CensusEntry): boolean {
  return entry.kinds.every((k) => HEALTH_GRANT_KINDS.includes(k));
}

// ---------------------------------------------------------------------------
// The counting rule, stated before it is applied
// ---------------------------------------------------------------------------

/**
 * ONE TOGGLE IS ONE CONDITIONAL DEFENSIVE ABILITY OF THE CHOSEN DEFENDER.
 *
 * Four decisions make that a definition rather than a phrase, and each is a decision that could
 * defensibly have gone the other way:
 *
 * 1. **The unit is the ABILITY, not the kind.** Garen W grants damage reduction, resistances and
 *    a shield, and the census records all three kinds on one entry — but the source states ONE
 *    condition, so a user answers ONE question. Counting kinds would report Garen as three
 *    controls when the panel shows one. The kind-level figure is measured too, and reported
 *    beside this one, so the choice stays visible.
 * 2. **Always-active effects are not toggles.** Six abilities state no cast, no duration, no
 *    trigger and no precondition; they resolve into the defender's stat block with nothing for a
 *    user to answer.
 * 3. **`not-stated` effects are not toggles either.** Xin Zhao R's condition is a DISTANCE and
 *    Kayn P's is a location outside combat. The contract's third activation bucket exists so
 *    these can be refused honestly, and a refusal is not a control.
 * 4. **Every champion counts, including the 42 with none.** A distribution taken only over
 *    champions that appear in the census would report a median of 1 with the same arithmetic and
 *    mean something entirely different — it would describe the champions who have toggles rather
 *    than the champions a user can pick.
 *
 * WHAT THIS COUNT IS AN UPPER BOUND ON, stated because the ceiling is what sizes a panel:
 * a defender at level 18 with every ability ranked. A level-6 defender has fewer, and an
 * unranked ability is not a control. The panel has to be designed for the ceiling.
 */
export function isToggle(entry: CensusEntry): boolean {
  return entry.activation === 'conditional' && !isHealthGrantOnly(entry);
}

// ---------------------------------------------------------------------------
// The distribution
// ---------------------------------------------------------------------------

export interface Distribution {
  /** Champions measured, including those with zero. */
  champions: number;
  min: number;
  median: number;
  mean: number;
  max: number;
  /** How many champions have exactly N. Keyed by N as a string. */
  histogram: Record<string, number>;
  /** Every champion at the maximum, named. */
  worstCase: string[];
  /** How many champions have none at all. */
  withNone: number;
}

export function distributionOf(countsByChampion: Map<string, number>): Distribution {
  const values = [...countsByChampion.values()].sort((a, b) => a - b);
  if (values.length === 0) {
    return {
      champions: 0,
      min: 0,
      median: 0,
      mean: 0,
      max: 0,
      histogram: {},
      worstCase: [],
      withNone: 0,
    };
  }
  const middle = values.length / 2;
  const median =
    values.length % 2 === 1
      ? values[(values.length - 1) / 2]!
      : (values[middle - 1]! + values[middle]!) / 2;
  const max = values.at(-1)!;
  const histogram: Record<string, number> = {};
  for (const v of values) histogram[String(v)] = (histogram[String(v)] ?? 0) + 1;
  return {
    champions: values.length,
    min: values[0]!,
    median,
    mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)),
    max,
    histogram,
    worstCase: [...countsByChampion.entries()]
      .filter(([, n]) => n === max)
      .map(([name]) => name)
      .sort(),
    withNone: values.filter((v) => v === 0).length,
  };
}

/**
 * Count per champion over the WHOLE roster, so champions with none are counted as zero rather
 * than omitted. A champion in the census who is not in the roster is returned separately rather
 * than silently dropped — that would be a join failure hiding as a low number.
 */
export function countPerChampion(
  roster: string[],
  entries: CensusEntry[],
  include: (e: CensusEntry) => boolean,
  weight: (e: CensusEntry) => number = () => 1,
): { counts: Map<string, number>; notInRoster: string[] } {
  const counts = new Map<string, number>(roster.map((name) => [name, 0]));
  const notInRoster: string[] = [];
  for (const entry of entries) {
    if (!include(entry)) continue;
    if (!counts.has(entry.champion)) {
      if (!notInRoster.includes(entry.champion)) notInRoster.push(entry.champion);
      continue;
    }
    counts.set(entry.champion, counts.get(entry.champion)! + weight(entry));
  }
  return { counts, notInRoster };
}

export interface ToggleMeasurement {
  /** The whole-roster figure §40 reports, reproduced here so the two can be compared. */
  acrossTheWholeRoster: {
    abilityPages: number;
    confirmedDefensiveEffects: number;
    conditional: number;
    alwaysActive: number;
    notStated: number;
    togglesUnderThisDefinition: number;
  };
  /** One control per conditional defensive ABILITY — the figure that sizes the panel. */
  perChampionByAbility: Distribution;
  /** One control per KIND instead, reported so the choice of unit stays visible. */
  perChampionByKind: Distribution;
  /** Champions named in the census that the roster does not contain. Should be empty. */
  notInRoster: string[];
}

export function measureDefenderToggles(
  roster: string[],
  entries: CensusEntry[],
): ToggleMeasurement {
  const byAbility = countPerChampion(roster, entries, isToggle);
  const byKind = countPerChampion(
    roster,
    entries,
    isToggle,
    (e) => e.kinds.filter((k) => !HEALTH_GRANT_KINDS.includes(k)).length,
  );
  return {
    acrossTheWholeRoster: {
      abilityPages: 0,
      confirmedDefensiveEffects: entries.length,
      conditional: entries.filter((e) => e.activation === 'conditional').length,
      alwaysActive: entries.filter((e) => e.activation === 'always-active').length,
      notStated: entries.filter((e) => e.activation === 'not-stated').length,
      togglesUnderThisDefinition: entries.filter(isToggle).length,
    },
    perChampionByAbility: distributionOf(byAbility.counts),
    perChampionByKind: distributionOf(byKind.counts),
    notInRoster: byAbility.notInRoster,
  };
}

// ---------------------------------------------------------------------------
// A candidate count that is REPORTED and never applied
// ---------------------------------------------------------------------------

/**
 * Does the ability page mention an ALLY?
 *
 * WHY THIS IS A CANDIDATE COUNT AND NOT A FILTER. A two-champion scenario has no ally
 * (SPECIFICATION §1), so an ability that only ever shields somebody else cannot reach the
 * defender and is not a control on the defender's own survival. That would cut the enchanters'
 * counts sharply — Yuumi, Milio, Soraka, Taric, Senna.
 *
 * But mentioning an ally is not the same as being ally-only: Braum E shields Braum AND the
 * allies behind him, and Nilah's ultimate heals herself with it. Deciding which is which is a
 * reading of a sentence, and CLAUDE.md's standing rule is that a detector proposes and a person
 * confirms. **The census does not record self-versus-ally at all**, which is the real finding
 * here — so this number is handed over for someone to read, and nothing is subtracted from any
 * figure above.
 */
export const MENTIONS_AN_ALLY = /\ballied?\s+champion|\ban\s+ally\b|\ballies\b|nearby\s+all(?:y|ies)|target\s+ally/i;

export function allyMentionCandidates(
  entries: CensusEntry[],
  wikitextFor: (key: string) => string | undefined,
): { candidates: string[]; noTextFound: string[] } {
  const candidates: string[] = [];
  const noTextFound: string[] = [];
  for (const entry of entries) {
    if (!isToggle(entry)) continue;
    const text = wikitextFor(entry.key);
    if (text === undefined) {
      noTextFound.push(entry.key);
      continue;
    }
    if (MENTIONS_AN_ALLY.test(text)) candidates.push(entry.key);
  }
  return { candidates, noTextFound };
}
