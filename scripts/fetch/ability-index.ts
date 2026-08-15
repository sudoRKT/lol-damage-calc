// ONE ROSTER ENTRY PER ABILITY, NOT PER SLOT.
//
// ═══ THE MEASURED PROBLEM ═══
//
// `champion + slot` is not a unique identifier for an ability, and the roster has been acting as
// though it were. Measured on 2026-08-15 over `curated/curated-data.json`: **57 champion/slot keys
// are shared by 128 ability entries.** Aphelios's Q slot holds six abilities, Hwei's W holds four,
// Kled's Q holds a mounted ability and a dismounted one, Nidalee's Q holds Javelin Toss and
// Takedown. Two consequences, both observed rather than predicted:
//
//   1. Looking an ability up by champion+slot returns an ARBITRARY member of the set. Asking for
//      Hwei/W returns "Subject: Serenity", a mood toggle with zero damage components, when the
//      entry wanted was "Stirring Lights".
//   2. `Champion.abilityMaxRanks` carries one rank count per SLOT, from Data Dragon's `maxrank`,
//      and abilities sharing a slot do not always rank together. Nidalee's Takedown has FOUR ranks
//      because its own template says it scales with Aspect of the Cougar's rank; Javelin Toss in
//      the same slot has five. Storing Takedown on a five-rank axis moves every middle value,
//      because `X to Y` interpolates across the count (DATA-SOURCES §11).
//
// ═══ WHAT THIS FILE PRODUCES ═══
//
// `public/data/ability-index.json`: one entry per (champion, slot, abilityName), which IS unique —
// verified over both source sets, 937 wiki pages and 919 override-file entries, zero collisions.
// Each entry carries the rank axis the SOURCE states, the rank count that follows from it, and
// every name the wiki redirects to that entry so a consumer can resolve any name the roster
// mentions.
//
// ═══ WHAT IT REFUSES TO DO ═══
//
// It does not invent a rank count. A count stated by one expression and contradicted by Data
// Dragon is REPORTED and the slot's count is kept (`rank-shape.ts` holds that rule and the two
// cases that prove it is needed). It does not decide what a FORM is: Elise's Q holds two forms and
// Lee Sin's Q holds one ability cast twice, and nothing in the source distinguishes them, so the
// index says "this slot holds more than one ability" and leaves the naming to a person.
//
// It is pure. The runner (`roster-abilities.ts`) does the reading, fetching and writing.

import type { AbilitySlot } from '../../src/types/data.ts';
import {
  classifySlot,
  maxedBuildCost,
  readRankShape,
  SKILL_POINTS_AT_18,
  type AbilityPage,
  type RankShapeFinding,
} from './rank-shape.ts';

/** `Champion` as this module needs it — the fields it reads, nothing more. */
export interface RosterChampion {
  apiname: string;
  name: string;
  abilityNames: Partial<Record<AbilitySlot, string[]>>;
  abilityMaxRanks: Partial<Record<AbilitySlot, number>>;
}

/** A `CuratedAbility` as this module needs it. */
export interface CuratedEntry {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  maxRank: number;
  components: unknown[];
  verification: string;
  sourceRevision?: number;
}

/** One alias name the wiki redirects onto an entry, resolved live rather than guessed. */
export interface ResolvedAlias {
  champion: string;
  slot: AbilitySlot;
  /** The name as `Module:ChampionData/data` lists it, e.g. "Fishbones". */
  name: string;
  /** The page it redirects to, e.g. "Switcheroo!". Null when the template does not exist. */
  resolvesTo: string | null;
  /** The revision id the live wiki gave for the target, for staleness detection. */
  liveRevision?: number;
}

/**
 * THE IDENTIFIER. Champion, slot and ability name, pipe-joined.
 *
 * The name is part of the key because the first two are not enough — that is the whole finding
 * this file exists for. The separator is `|` because no champion, slot or ability name in the
 * roster contains one (checked over all 937 pages); `/` would collide with "Aspect of the Cougar"
 * style names the wiki writes with slashes, such as Elise's "Spider Form / Human Form".
 */
export function abilityKey(champion: string, slot: string, abilityName: string): string {
  return `${champion}|${slot}|${abilityName}`;
}

export interface IndexEntry {
  key: string;
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  /** The wiki revision the rank statements were read from. */
  sourceRevision: number;
  /** How many ranks this ABILITY has. Null only when no source consulted states one. */
  ranks: number | null;
  /** In plain English, which source said so — shown to nobody, read by whoever audits this. */
  ranksStatedBy: string;
  /** `own` — ranks on its own count. `follows` — indexed by another ability's rank. */
  rankAxis: 'own' | 'follows' | 'unstated';
  /** Set when `rankAxis` is `follows`: the ability whose rank indexes this one. */
  followsAbility?: { name: string; key: string | null };
  /** Data Dragon's count for the SLOT, kept beside the ability's own so a difference is visible. */
  slotMaxRank: number | null;
  /** Champion levels at which each rank unlocks, where the source states them — else null. */
  unlockLevels: number[] | null;
  unlockLevelsStatedBy?: string;
  /** The other abilities sharing this slot. Empty for the ordinary case. */
  sharesSlotWith: string[];
  slotShape: 'single' | 'several-own-rank' | 'mixed-rank-axis';
  /** What the override file stores for the same ability, so a disagreement is inspectable. */
  curated:
    | { present: false }
    | { present: true; maxRank: number; components: number; verification: string };
  /** True when the override file's rank count matches this entry's. */
  agreesWithCurated: boolean;
  /** Every other name the wiki redirects onto this entry (`Fishbones` → `Switcheroo!`). */
  aliases: string[];
  /** Findings a person must read. Nothing was written on the strength of one. */
  reports: string[];
}

export interface ChampionRankSummary {
  champion: string;
  /** Slots holding more than one ability, and what they hold. */
  ambiguousSlots: { slot: AbilitySlot; abilities: string[] }[];
  /** Sum of Data Dragon's slot maximums — above 18 means no legal maxed build. */
  maxedBuildCost: number;
  exceedsSkillPoints: boolean;
}

export interface AbilityIndex {
  entries: IndexEntry[];
  /** Every name the roster mentions → the key it resolves to. Includes each entry's own name. */
  nameToKey: Record<string, string>;
  champions: ChampionRankSummary[];
  counts: {
    entries: number;
    champions: number;
    slotsHoldingMoreThanOneAbility: number;
    entriesInSharedSlots: number;
    entriesWhoseRankCountIsNotTheSlots: number;
    entriesFollowingAnotherAbilitysRank: number;
    entriesWithStatedUnlockLevels: number;
    aliasNamesResolved: number;
    namesWithNoTemplate: number;
    entriesDisagreeingWithTheOverrideFile: number;
    entriesWithReports: number;
    championsWhoseSlotMaximaExceedSkillPoints: number;
  };
  /** Roster-level findings: things a person must read, never applied. */
  reports: string[];
  /** Names the roster lists for which no wiki template exists at all. */
  namesWithNoTemplate: string[];
}

/**
 * Build the index.
 *
 * `pages` is the alias-deduped wiki page set; `champions` the published roster; `curated` the
 * override file's ability entries (read, never written); `aliases` the live redirect resolutions.
 * Every argument is data — nothing here reads a file or a socket.
 */
export function buildAbilityIndex(input: {
  pages: AbilityPage[];
  champions: RosterChampion[];
  curated: CuratedEntry[];
  aliases: ResolvedAlias[];
}): AbilityIndex {
  const { pages, champions, curated, aliases } = input;
  const championByName = new Map(champions.map((c) => [c.name, c]));
  const curatedByKey = new Map(
    curated.map((c) => [abilityKey(c.champion, c.slot, c.abilityName), c]),
  );

  // Which slot an ability name sits in, per champion — how a `follows` statement finds its count.
  const slotOfAbility = new Map<string, AbilitySlot>();
  for (const p of pages) slotOfAbility.set(`${p.champion}|${p.abilityName}`, p.slot);

  const findings: RankShapeFinding[] = pages.map((page) => {
    const champion = championByName.get(page.champion);
    const slotMaxRank = champion ? (champion.abilityMaxRanks[page.slot] ?? null) : null;
    return readRankShape(page, slotMaxRank, (abilityName) => {
      const slot = slotOfAbility.get(`${page.champion}|${abilityName}`);
      if (!slot || !champion) return null;
      return champion.abilityMaxRanks[slot] ?? null;
    });
  });

  // Slot shape, and the unlock levels a followed ability states, both need a second pass.
  const findingsBySlot = new Map<string, RankShapeFinding[]>();
  for (const f of findings) {
    const k = `${f.champion}|${f.slot}`;
    if (!findingsBySlot.has(k)) findingsBySlot.set(k, []);
    findingsBySlot.get(k)!.push(f);
  }
  const unlockLevelsOfAbility = new Map<string, number[]>();
  for (const f of findings) {
    if (f.unlockLevels) unlockLevelsOfAbility.set(`${f.champion}|${f.abilityName}`, f.unlockLevels);
  }

  const aliasesByKey = new Map<string, string[]>();
  const nameToKey: Record<string, string> = {};
  const namesWithNoTemplate: string[] = [];
  for (const a of aliases) {
    if (!a.resolvesTo) {
      namesWithNoTemplate.push(`${a.champion}/${a.slot} ${a.name}`);
      continue;
    }
    const target = abilityKey(a.champion, a.slot, a.resolvesTo);
    if (!aliasesByKey.has(target)) aliasesByKey.set(target, []);
    aliasesByKey.get(target)!.push(a.name);
    nameToKey[abilityKey(a.champion, a.slot, a.name)] = target;
  }

  const entries: IndexEntry[] = findings.map((f) => {
    const key = abilityKey(f.champion, f.slot, f.abilityName);
    const slotFindings = findingsBySlot.get(`${f.champion}|${f.slot}`) ?? [];
    const shape = classifySlot(slotFindings);
    const cur = curatedByKey.get(key);
    const reports = [...f.reports];

    let ranks: number | null;
    let ranksStatedBy: string;
    let rankAxis: IndexEntry['rankAxis'];
    let followsAbility: IndexEntry['followsAbility'];

    if (f.axis.kind === 'follows') {
      ranks = f.axis.ranks;
      ranksStatedBy = f.axis.statedBy;
      rankAxis = 'follows';
      const followedSlot = slotOfAbility.get(`${f.champion}|${f.axis.ability}`);
      followsAbility = {
        name: f.axis.ability,
        key: followedSlot ? abilityKey(f.champion, followedSlot, f.axis.ability) : null,
      };
    } else if (f.axis.kind === 'own') {
      ranks = f.axis.ranks;
      ranksStatedBy = f.axis.statedBy;
      rankAxis = 'own';
    } else if (f.slot === 'P') {
      // A passive does not rank. Data Dragon lists no rankable spell for the slot, and all 180
      // passive entries in the override file store exactly one rank. This is the only place the
      // index supplies a count the ability page itself does not state, and it supplies 1.
      ranks = 1;
      ranksStatedBy =
        'the passive slot does not rank: Data Dragon lists no rankable spell for it, and every ' +
        'passive entry in the override file stores one rank';
      rankAxis = 'own';
    } else {
      ranks = null;
      ranksStatedBy = f.axis.why;
      rankAxis = 'unstated';
    }

    // Unlock levels: the ability's own statement, or — for an ability that FOLLOWS another — the
    // levels the followed ability's own page states. Nothing else produces a schedule.
    let unlockLevels = f.unlockLevels;
    let unlockLevelsStatedBy = unlockLevels ? "the ability's own template" : undefined;
    if (!unlockLevels && f.axis.kind === 'follows') {
      const inherited = unlockLevelsOfAbility.get(`${f.champion}|${f.axis.ability}`);
      if (inherited) {
        unlockLevels = inherited;
        unlockLevelsStatedBy =
          `the levels "${f.axis.ability}" states on its own page, which this ability follows`;
      }
    }

    const agreesWithCurated = cur === undefined || ranks === null ? true : cur.maxRank === ranks;
    if (cur && !agreesWithCurated) {
      reports.push(
        `the override file stores ${cur.maxRank} ranks for this ability and the source states ` +
          `${ranks} — the override file is not written by this pipeline, so the difference is ` +
          `reported here and changed nowhere. It carries ${cur.components.length} damage ` +
          `component${cur.components.length === 1 ? '' : 's'}.`,
      );
    }

    return {
      key,
      champion: f.champion,
      slot: f.slot,
      abilityName: f.abilityName,
      sourceRevision: f.revid,
      ranks,
      ranksStatedBy,
      rankAxis,
      ...(followsAbility ? { followsAbility } : {}),
      slotMaxRank: f.slotMaxRank,
      unlockLevels,
      ...(unlockLevelsStatedBy ? { unlockLevelsStatedBy } : {}),
      sharesSlotWith: slotFindings.filter((o) => o !== f).map((o) => o.abilityName),
      slotShape: shape.kind,
      curated: cur
        ? {
            present: true as const,
            maxRank: cur.maxRank,
            components: cur.components.length,
            verification: cur.verification,
          }
        : { present: false as const },
      agreesWithCurated,
      aliases: aliasesByKey.get(key) ?? [],
      reports,
    };
  });

  for (const e of entries) nameToKey[e.key] = e.key;

  const championSummaries: ChampionRankSummary[] = champions.map((c) => {
    const mine = entries.filter((e) => e.champion === c.name);
    const bySlot = new Map<AbilitySlot, string[]>();
    for (const e of mine) {
      if (!bySlot.has(e.slot)) bySlot.set(e.slot, []);
      bySlot.get(e.slot)!.push(e.abilityName);
    }
    const cost = maxedBuildCost(c.abilityMaxRanks);
    return {
      champion: c.name,
      ambiguousSlots: [...bySlot]
        .filter(([, names]) => names.length > 1)
        .map(([slot, abilities]) => ({ slot, abilities })),
      maxedBuildCost: cost,
      exceedsSkillPoints: cost > SKILL_POINTS_AT_18,
    };
  });

  const sharedSlots = championSummaries.flatMap((c) => c.ambiguousSlots);
  const counts: AbilityIndex['counts'] = {
    entries: entries.length,
    champions: champions.length,
    slotsHoldingMoreThanOneAbility: sharedSlots.length,
    entriesInSharedSlots: sharedSlots.reduce((n, s) => n + s.abilities.length, 0),
    entriesWhoseRankCountIsNotTheSlots: entries.filter(
      (e) => e.ranks !== null && e.slotMaxRank !== null && e.ranks !== e.slotMaxRank,
    ).length,
    entriesFollowingAnotherAbilitysRank: entries.filter((e) => e.rankAxis === 'follows').length,
    entriesWithStatedUnlockLevels: entries.filter((e) => e.unlockLevels !== null).length,
    aliasNamesResolved: aliases.filter((a) => a.resolvesTo).length,
    namesWithNoTemplate: namesWithNoTemplate.length,
    entriesDisagreeingWithTheOverrideFile: entries.filter((e) => !e.agreesWithCurated).length,
    entriesWithReports: entries.filter((e) => e.reports.length > 0).length,
    championsWhoseSlotMaximaExceedSkillPoints: championSummaries.filter((c) => c.exceedsSkillPoints)
      .length,
  };

  const reports: string[] = [];
  for (const e of entries) {
    for (const r of e.reports) reports.push(`${e.champion}/${e.slot} ${e.abilityName}: ${r}`);
  }
  if (namesWithNoTemplate.length > 0) {
    reports.push(
      `${namesWithNoTemplate.length} ability names the wiki's champion module lists have no ` +
        `template at all, so nothing can be read for them: ${namesWithNoTemplate.join(', ')}`,
    );
  }
  const overExceeding = championSummaries.filter((c) => c.exceedsSkillPoints);
  if (overExceeding.length > 0) {
    reports.push(
      `${overExceeding.length} champions have slot maxima summing above the ${SKILL_POINTS_AT_18} ` +
        `skill points a level-18 champion has: ` +
        overExceeding.map((c) => `${c.champion} ${c.maxedBuildCost}`).join(', ') +
        `. Four of them hold an ability from level 1 without paying for it, which this index ` +
        `records as unlock levels where the source states them; Udyr's 24 is not of that kind ` +
        `and simply cannot be maxed.`,
    );
  }

  return { entries, nameToKey, champions: championSummaries, counts, reports, namesWithNoTemplate };
}

// ---------------------------------------------------------------------------------------
// Champion-level rank statements — READ BY A PERSON, REPORTED, AND APPLIED TO NOTHING
// ---------------------------------------------------------------------------------------

/**
 * Sentences about how a CHAMPION ranks, rather than how one ability does.
 *
 * Seven champions have slot maxima summing above 18 skill points, and every level curve for them
 * computes nothing. The reason is in prose on their pages, and it is not the same reason twice —
 * four of them hold an ability from level 1 for free, one cannot spend points on abilities at all,
 * and one simply cannot max everything. None of that fits `abilityMaxRanks`, and deciding what to
 * do about it is a modelling decision rather than a fetch, so each sentence is recorded here with
 * what it says and what it would change, and NOTHING is applied.
 *
 * Every entry was read on 2026-08-15 by the agent that wrote this list. `quote` is an exact
 * substring of the named page, and `findChampionStatements` fails it if the page no longer
 * contains it — a list of hand-read sentences that silently stops matching its source is worse
 * than no list.
 */
export const CHAMPION_RANK_STATEMENTS: {
  champion: string;
  abilityName: string;
  /** Verbatim substring of that page's wikitext. */
  quote: string;
  /** What it says, in plain English. */
  means: string;
  /** What acting on it would change, and why this pipeline did not. */
  wouldChange: string;
}[] = [
  {
    champion: 'Aphelios',
    abilityName: 'The Hitman and the Seer',
    quote: 'cannot improve his abilities via [[Experience (champion)|skill points]]',
    means:
      'Aphelios spends skill points on bonus attack damage, attack speed or lethality — the ' +
      "six-step track his passive's own leveling rows show. His Q, W and E are not rankable at " +
      'all; he gains them at levels 1 and 2, and his ultimate improves automatically at 11 and 16.',
    wouldChange:
      "Data Dragon reports maxrank 6 for his Q, W and E, which is the STAT track and not the " +
      'abilities. Believing it costs 21 skill points, so no legal build exists and his level ' +
      'curve computes nothing. Deciding that an unrankable ability has one rank is a modelling ' +
      'decision (it changes what the rank control shows), so it is raised, not taken.',
  },
  {
    champion: 'Jayce',
    abilityName: 'Transform Mercury Hammer',
    quote:
      "begins the game with ''Transform'' but cannot increase its rank. Instead, his basic " +
      '{{tip|abilities}} each have 6 ranks',
    means: 'Transform is free at level 1 and never ranked; the six-rank basics are paid for.',
    wouldChange:
      'Already applied to the ability itself: Transform is stored with 1 rank unlocked at level ' +
      '1, which Data Dragon corroborates. What is NOT applied is the skill-point consequence — ' +
      'his real cost is 18, not 19.',
  },
  {
    champion: 'Yuumi',
    abilityName: 'You and Me!',
    quote: "starts with a skill point in ''You and Me!''",
    means: 'Yuumi is given her W at level 1, and her Q has six ranks instead of five.',
    wouldChange:
      'Her slot maxima sum to 19 and her real cost is 18. Nothing here models a free rank, so ' +
      'her level curve stays empty.',
  },
  {
    champion: 'Karma',
    abilityName: 'Mantra',
    quote: "begins the game with one rank in ''Mantra''",
    means:
      "Mantra is free at level 1 and her empowered abilities follow its rank — which IS applied, " +
      'to Soulflare, Renewal and Defiance.',
    wouldChange:
      'The page does not say at which levels Mantra ranks up, so no schedule was written for it. ' +
      'Elise and Nidalee state theirs and got one.',
  },
  {
    champion: 'Udyr',
    abilityName: 'Bridge Between',
    quote: '',
    means:
      'NOTHING. Every Udyr page was searched on 2026-08-15 for a statement about ranks, unlock ' +
      'levels or skill points, and there is none.',
    wouldChange:
      'His four abilities each rank to 6, costing 24 of 18 skill points, so no maxed build ' +
      'exists — that is a true fact about Udyr rather than a data defect, and it is the one case ' +
      'of the seven that no source statement will fix.',
  },
];

export function findChampionStatements(
  pages: AbilityPage[],
  statements = CHAMPION_RANK_STATEMENTS,
): { statement: (typeof CHAMPION_RANK_STATEMENTS)[number]; foundOnPage: boolean }[] {
  return statements.map((statement) => {
    const page = pages.find(
      (p) => p.champion === statement.champion && p.abilityName === statement.abilityName,
    );
    return {
      statement,
      foundOnPage:
        statement.quote === '' ? page !== undefined : (page?.wikitext.includes(statement.quote) ?? false),
    };
  });
}

/** The one lookup the rest of the project needs: a name (own or alias) to its single entry. */
export function resolveAbility(
  index: AbilityIndex,
  champion: string,
  slot: string,
  abilityName: string,
): IndexEntry | null {
  const key = index.nameToKey[abilityKey(champion, slot, abilityName)];
  if (!key) return null;
  return index.entries.find((e) => e.key === key) ?? null;
}

/** Every entry a champion+slot holds, in source order. The plural answer champion+slot has. */
export function abilitiesInSlot(
  index: AbilityIndex,
  champion: string,
  slot: string,
): IndexEntry[] {
  return index.entries.filter((e) => e.champion === champion && e.slot === slot);
}
