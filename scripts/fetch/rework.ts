// REWORK DETECTION (SPECIFICATION §9).
//
//   "Rework detection identifies cases where ability identifiers in the curated file no longer
//    match the source data, which occurs when a champion's kit is replaced, and surfaces these
//    for manual reconciliation."
//
// WHY THIS IS ITS OWN CHECK, separate from the diff. A reworked champion's base statistics may
// move by amounts every bound accepts while their whole kit is replaced underneath. The damage
// numbers then belong to abilities that no longer exist, and nothing arithmetic notices: the
// product would keep reporting Aatrox's old Q damage under his new Q's name. Identifier
// identity is the only thing that catches it.
//
// THIS FILE ONLY READS `/curated/`. It never writes there, and neither does anything it calls.
// `/curated/` is the project's one irreplaceable asset (CLAUDE.md); it is filesystem read-only
// and hook-guarded, and this module is deliberately built so that it has no reason to write.
//
// DETERMINISTIC, and deliberately not clever. An exact match is a match. A match that differs
// only in capitalisation, whitespace or apostrophe style is reported as a FORMATTING difference
// rather than silently accepted — the wiki really does move between "Kha'Zix" and "Kha'Zix"
// (different apostrophe characters), and quietly normalising that would also quietly accept a
// genuine rename. Everything else is reported for a human. Nothing here decides anything.
//
// Pure — no network, no filesystem. The loader that reads /curated/ is `curated-source.ts`.

import type { AbilitySlot } from '../../src/types/data.ts';
import type { SnapshotChampion } from './snapshot.ts';

/** The identity of one curated ability — the only part of the curated file this check reads. */
export interface CuratedAbilityIdentity {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  /** Set for a form that is its own roster entry, e.g. "Kayn (Rhaast)". */
  form?: string;
  /** Wiki revision the entry's numbers were read from, where the entry records one. */
  sourceRevision?: number;
}

export type ReworkFindingKind =
  /** The curated file names a champion the source roster no longer contains. */
  | 'champion-absent'
  /** The champion is present but the slot lists no abilities at all. */
  | 'slot-absent'
  /** The ability name is not in that slot's source list. */
  | 'ability-name-absent'
  /** The name is not in its own slot but IS in another one. */
  | 'ability-moved-slot'
  /** Matches only after normalising case, whitespace or apostrophe style. */
  | 'ability-name-formatting'
  /** The source lists an ability the curated file has no entry for. */
  | 'source-ability-uncurated';

export interface ReworkFinding {
  kind: ReworkFindingKind;
  severity: 'halt' | 'review';
  champion: string;
  slot: AbilitySlot;
  curatedName: string | null;
  sourceNames: string[];
  /** Where the name turned up instead, when it did. */
  foundInSlot?: AbilitySlot;
  matchedSourceName?: string;
  message: string;
}

export interface ReworkReport {
  findings: ReworkFinding[];
  /**
   * Champions where at least one curated ability identifier vanished AND at least one source
   * ability is uncurated — the shape of a replaced kit rather than of a single rename.
   */
  suspectedReworks: string[];
  counts: {
    curatedAbilities: number;
    championsInCuratedFile: number;
    matchedExactly: number;
    findings: number;
  };
}

/** Case, whitespace and apostrophe style folded away — used ONLY to classify a mismatch. */
export function normaliseAbilityName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[‘’ʼʹ]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const SLOTS: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];

/**
 * Compare every curated ability identifier against the source roster.
 *
 * `roster` is the champion list from the current snapshot — `abilityNames` there is read
 * straight from `Module:ChampionData/data`, which lists every name in each slot including the
 * alias rows ("The Darkin Blade 2"). Curated entries name the ability, so an exact hit against
 * any name in the slot is a match (DATA-SOURCES §18 explains why the aliases are in the list).
 */
export function detectRework(
  curated: CuratedAbilityIdentity[],
  roster: SnapshotChampion[],
): ReworkReport {
  const byApiname = new Map<string, SnapshotChampion>();
  const byDisplayName = new Map<string, SnapshotChampion>();
  for (const champion of roster) {
    byApiname.set(champion.apiname, champion);
    byDisplayName.set(champion.name, champion);
  }

  const findings: ReworkFinding[] = [];
  let matchedExactly = 0;
  /** champion -> the exact source names the curated file accounted for. */
  const accountedFor = new Map<string, Set<string>>();
  const championsWithLostAbility = new Set<string>();

  for (const entry of [...curated].sort(
    (a, b) =>
      a.champion.localeCompare(b.champion, 'en') ||
      SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
      a.abilityName.localeCompare(b.abilityName, 'en'),
  )) {
    const champion = byApiname.get(entry.champion) ?? byDisplayName.get(entry.champion);
    if (!champion) {
      championsWithLostAbility.add(entry.champion);
      findings.push({
        kind: 'champion-absent',
        severity: 'halt',
        champion: entry.champion,
        slot: entry.slot,
        curatedName: entry.abilityName,
        sourceNames: [],
        message:
          `the curated file holds ${entry.slot} "${entry.abilityName}" for "${entry.champion}", ` +
          `but no champion with that apiname or name is in the current source roster. Either the ` +
          `champion was renamed at the source or the curated entry is orphaned; its damage would ` +
          `attach to nothing.`,
      });
      continue;
    }

    const key = champion.apiname;
    if (!accountedFor.has(key)) accountedFor.set(key, new Set());

    const slotNames = champion.abilityNames[entry.slot] ?? [];
    if (slotNames.length === 0) {
      championsWithLostAbility.add(key);
      findings.push({
        kind: 'slot-absent',
        severity: 'halt',
        champion: key,
        slot: entry.slot,
        curatedName: entry.abilityName,
        sourceNames: [],
        message:
          `the curated file holds ${entry.slot} "${entry.abilityName}" for ${key}, but the source ` +
          `lists no ability in that slot at all. A slot emptying is the shape of a replaced kit.`,
      });
      continue;
    }

    if (slotNames.includes(entry.abilityName)) {
      matchedExactly += 1;
      accountedFor.get(key)!.add(entry.abilityName);
      continue;
    }

    // Not an exact hit. Classify it — never resolve it.
    const target = normaliseAbilityName(entry.abilityName);
    const formattingMatch = slotNames.find((name) => normaliseAbilityName(name) === target);
    if (formattingMatch) {
      accountedFor.get(key)!.add(formattingMatch);
      findings.push({
        kind: 'ability-name-formatting',
        severity: 'review',
        champion: key,
        slot: entry.slot,
        curatedName: entry.abilityName,
        sourceNames: slotNames,
        matchedSourceName: formattingMatch,
        message:
          `${key} ${entry.slot}: the curated name "${entry.abilityName}" and the source name ` +
          `"${formattingMatch}" differ only in capitalisation, spacing or punctuation style. ` +
          `Not treated as a match — the same shape would appear if the ability had genuinely ` +
          `been renamed — so a human confirms which spelling is current.`,
      });
      continue;
    }

    const otherSlot = SLOTS.find(
      (slot) =>
        slot !== entry.slot &&
        (champion.abilityNames[slot] ?? []).some(
          (name) => normaliseAbilityName(name) === target,
        ),
    );
    if (otherSlot) {
      findings.push({
        kind: 'ability-moved-slot',
        severity: 'halt',
        champion: key,
        slot: entry.slot,
        curatedName: entry.abilityName,
        sourceNames: slotNames,
        foundInSlot: otherSlot,
        message:
          `${key}: the curated file holds "${entry.abilityName}" in slot ${entry.slot}, but the ` +
          `source now lists that ability in slot ${otherSlot}. The damage is real and the slot is ` +
          `wrong, which is worse than a missing entry: the combo builder would fire it from the ` +
          `wrong key and the numbers would look right.`,
      });
      championsWithLostAbility.add(key);
      continue;
    }

    championsWithLostAbility.add(key);
    findings.push({
      kind: 'ability-name-absent',
      severity: 'halt',
      champion: key,
      slot: entry.slot,
      curatedName: entry.abilityName,
      sourceNames: slotNames,
      message:
        `${key} ${entry.slot}: the curated file holds "${entry.abilityName}", which the source no ` +
        `longer lists in that slot. The source now lists: ${slotNames.join(', ')}. This is the ` +
        `signature of a kit replacement — the curated damage belongs to an ability that is gone.`,
    });
  }

  // The other direction: source abilities nothing curated claims. On its own this is normal
  // (the curated file is incomplete by design), so it is a review, never a halt. Combined with
  // a lost identifier on the same champion it is what promotes that champion to a suspected
  // rework.
  const curatedChampions = new Set<string>();
  for (const entry of curated) {
    const champion = byApiname.get(entry.champion) ?? byDisplayName.get(entry.champion);
    curatedChampions.add(champion ? champion.apiname : entry.champion);
  }

  const championsWithNewAbility = new Set<string>();
  for (const champion of [...roster].sort((a, b) => a.apiname.localeCompare(b.apiname, 'en'))) {
    if (!curatedChampions.has(champion.apiname)) continue; // not curated at all yet — not a rework
    for (const slot of SLOTS) {
      for (const name of champion.abilityNames[slot] ?? []) {
        if (accountedFor.get(champion.apiname)?.has(name)) continue;
        championsWithNewAbility.add(champion.apiname);
        findings.push({
          kind: 'source-ability-uncurated',
          severity: 'review',
          champion: champion.apiname,
          slot,
          curatedName: null,
          sourceNames: [name],
          message:
            `${champion.apiname} ${slot} "${name}" exists in the source and no curated entry ` +
            `claims it. Alone this only means the curated file has not covered it yet; on a ` +
            `champion that also LOST a curated identifier it is the other half of a rework.`,
        });
      }
    }
  }

  const suspectedReworks = [...championsWithLostAbility]
    .filter((champion) => championsWithNewAbility.has(champion))
    .sort();

  findings.sort(
    (a, b) =>
      a.champion.localeCompare(b.champion, 'en') ||
      SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
      a.kind.localeCompare(b.kind) ||
      (a.curatedName ?? '').localeCompare(b.curatedName ?? '', 'en') ||
      (a.sourceNames[0] ?? '').localeCompare(b.sourceNames[0] ?? '', 'en'),
  );

  return {
    findings,
    suspectedReworks,
    counts: {
      curatedAbilities: curated.length,
      championsInCuratedFile: curatedChampions.size,
      matchedExactly,
      findings: findings.length,
    },
  };
}
