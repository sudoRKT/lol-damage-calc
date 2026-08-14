// THE MERGE PROPOSAL — one file, in the curated file's own shape, from the three places the
// proposals are currently scattered. It is a DECISION PACKAGE, not a merge.
//
//   node scripts/extract/merge-proposal.ts
//
// WHAT IT WRITES (all inside build/proposed-curated/, which is this area's own output):
//   merged-proposal.json   a CuratedFile and nothing else — no commentary in the data
//   merge-report.json      the diff against /curated/, every gate result, every sweep
//   merge-refusals.json    every proposed entry NOT recommended for merge, with the reason
//
// WHAT IT NEVER DOES. It does not write /curated/ — that merge is a lead action behind a human
// unlock (curated/README.md). It does not change a stored value, does not invent an owner, does
// not widen any detector, and does not mark anything `verified`. Where a proposal and a gate
// disagree, the entry is REFUSED and named; nothing is quietly repaired to raise a count.
//
// WHY REFUSING IS THE POINT. A curated file is held to gate 1 as a whole. One entry the
// validator rejects makes the whole file un-mergeable, so an entry that fails is listed with the
// one change that would let it in — rather than being edited here, where nobody would see it.
//
// THE RULE THIS FILE OBEYS (CLAUDE.md): a detector proposes, a person confirms, and storage is
// gated on the confirmed population. Every entry here is already inside a read population — the
// ability harvest's own gates, the hand-read item values of DATA-SOURCES §39, and the confirmed
// defensive list of §40 / §48 / §49.3. This file adds no member to any of them.
//
// EVERY SWEEP BELOW IS AN EXPORTED FUNCTION AND HAS A NEGATIVE CONTROL in merge-proposal.test.ts.
// A sweep that reports zero is only worth reading if it can be shown to report something.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AbilityComponent,
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedFile,
  CuratedItemEffect,
  CuratedRune,
  Item,
} from '../../src/types/data.ts';
import {
  checkEffectComponents,
  gateNonChampion,
  gateSchema,
  gateStatusHonesty,
  gateSumGuard,
  type Finding,
  type GateReport,
} from '../../src/types/validate-curated.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'build', 'proposed-curated');

// ---------------------------------------------------------------------------------------
// The inputs, each named with what it is and who produced it
// ---------------------------------------------------------------------------------------

export const SOURCES = {
  abilities: 'build/proposed-curated/abilities/batch-01.json',
  abilityReport: 'build/proposed-curated/abilities/batch-01.report.json',
  itemEffects: 'public/data/effect-values.json',
  defensive: 'build/proposed-curated/defensive-proposals.json',
  items: 'public/data/items.json',
  manifest: 'public/data/manifest.json',
  gate5: 'verification/gate5-passes.json',
} as const;

interface AbilityReport {
  roundTrips: Array<{
    entry: string;
    checkedRows: number;
    matchedRows: number;
    mismatches: unknown[];
    levelScaledNotCompared: number;
  }>;
  levelRoundTrips: Array<{ entry: string; checked: number; matched: number; mismatches: unknown[] }>;
  proseRoundTrips: Array<{ entry: string; checked: number; matched: number; mismatches: unknown[] }>;
  drafts: Array<{
    entry: string;
    components: number;
    issues: Array<{ kind: string; detail: string }>;
    verification: string;
  }>;
}

interface DefensiveProposalFile {
  generatedOn: string;
  coverage: { pagesInCache: number; fetchChunksFailed: number; complete: boolean };
  population: Record<string, number>;
  gateD2: { ran: boolean; outcomes: Record<string, number>; results: unknown[] };
  defensiveEffects: CuratedDefensiveEffect[];
}

interface EffectValuesFile {
  provenance: { patch: string; fetched: string };
  proposedItemEffects: CuratedItemEffect[];
}

// ---------------------------------------------------------------------------------------
// Keys and small helpers
// ---------------------------------------------------------------------------------------

export const abilityKey = (a: CuratedAbility): string =>
  `${a.champion}${a.form ? ` (${a.form})` : ''}/${a.slot}/${a.abilityName}`;
export const defensiveKey = (e: CuratedDefensiveEffect): string =>
  `${e.champion}/${e.slot}/${e.abilityName}/${e.kind}${e.label ? ` [${e.label}]` : ''}`;
export const itemKey = (e: CuratedItemEffect): string => `${e.itemName} [${e.key}]`;

/** Every `scaling` kind that appears anywhere inside a value, however deeply nested. */
export function scalingKinds(value: unknown, into: Map<string, number> = new Map()): Map<string, number> {
  if (value === null || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    for (const v of value) scalingKinds(v, into);
    return into;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'scaling' && typeof v === 'string') into.set(v, (into.get(v) ?? 0) + 1);
    else scalingKinds(v, into);
  }
  return into;
}

/**
 * THE SCALING ARMS GATE 1's OWN SHAPE CHECKER KNOWS.
 *
 * `checkScalingShape` in src/types/validate-curated.ts switches on the arm and reports every
 * other one as "unknown scaling kind". This list is what the checker actually accepts today; the
 * sweep measures the gap rather than asserting it.
 *
 * **`byRangeType` joined it on 2026-08-14.** It had always been a legal arm of `Scaling` in the
 * frozen contract (src/types/data.ts) and had no case in the switch, so contract-valid data was
 * reported as malformed. **6 item effects were refused for that reason alone and no other** —
 * Hullbreaker, Titanic Hydra (twice), Voltaic Cyclosword, Blade of the Ruined King and Eclipse —
 * taking the merged item-effect count from 37 to 43. The case now exists and recurses into both
 * arms, so the refusal below finds nothing to refuse.
 */
export const SCALING_ARMS_GATE1_ACCEPTS = new Set([
  'linear',
  'explicit',
  'byLevel',
  'byLevelExplicit',
  'byRangeType',
]);

/**
 * Non-champion damage rows. This MIRRORS the pattern gate 4 uses (validate-curated.ts), because
 * gate 4 walks abilities only and the sweep below extends the same question to item effects and
 * defensive entries. It is a sweep, not the gate.
 */
export const NON_CHAMPION =
  /\b(minion|monster|non-champion|non champion|nonchampion|non-epic|epic|turret|ward)s?\b/i;

// ---------------------------------------------------------------------------------------
// The sweeps. Each answers one question over the whole merged file and states its population.
// ---------------------------------------------------------------------------------------

/**
 * S1 — the components of item effects and runes, checked.
 *
 * **Gate 1 now walks both itself (2026-08-14).** This sweep existed because it did not: it
 * iterated `abilities` and `defensiveEffects` and nothing else, so every item effect and every
 * rune passed a gate that never looked at them, and this called the validator's component
 * checker by hand to cover the hole. It is kept as a second reading rather than deleted —
 * `gateSchema` is the gate and this agrees with it or the disagreement is worth seeing.
 */
export function sweepGate1Coverage(
  itemEffects: CuratedItemEffect[],
  runes: CuratedRune[],
): Finding[] {
  return checkEffectComponents([...itemEffects, ...runes]);
}

/** S2 — gate 3's question asked of item effects: two components and no stated relation. */
export function sweepItemSumGuard(itemEffects: CuratedItemEffect[]): string[] {
  return itemEffects
    .filter((e) => (e.components ?? []).length > 1 && (e.components ?? []).some((c) => !c.relation))
    .map(itemKey);
}

/** S3 — gate 4's question asked of item and defensive labels. */
export function sweepNonChampionOutsideAbilities(
  itemEffects: CuratedItemEffect[],
  defensiveEffects: CuratedDefensiveEffect[],
): string[] {
  return [
    ...itemEffects.flatMap((e) =>
      (e.components ?? [])
        .filter((c) => NON_CHAMPION.test(c.label ?? c.id))
        .map((c) => `${itemKey(e)} :: ${c.label ?? c.id}`),
    ),
    ...defensiveEffects.filter((e) => NON_CHAMPION.test(e.label ?? '')).map(defensiveKey),
  ];
}

/** S4 — gate 6's three rules asked of item effects and defensive entries. */
export function sweepStatusHonestyOutsideAbilities(
  itemEffects: CuratedItemEffect[],
  defensiveEffects: CuratedDefensiveEffect[],
): string[] {
  const out: string[] = [];
  for (const e of itemEffects) {
    const unresolved = (e.components ?? []).flatMap((c: AbilityComponent) =>
      c.ratios.filter((r) => r.owner === 'unresolved').map((r) => r.stat),
    );
    if (unresolved.length > 0 && e.verification !== 'incomplete') {
      out.push(
        `${itemKey(e)}: ${unresolved.length} ratio(s) whose owner no source states, but claims '${e.verification}'`,
      );
    }
    if (unresolved.length > 0 && (e.unresolvable ?? []).length === 0) {
      out.push(
        `${itemKey(e)}: an unresolved owner with no 'unresolvable' record — it reads as pending work that no work can finish`,
      );
    }
    if ((e.unresolvable ?? []).length > 0 && e.verification !== 'incomplete') {
      out.push(`${itemKey(e)}: records a fact no source states while claiming '${e.verification}'`);
    }
    if (e.verification === 'verified') {
      out.push(`${itemKey(e)}: claims 'verified'; there is no ledger route to that status for an item effect`);
    }
  }
  for (const e of defensiveEffects) {
    const unresolved = (e.ratios ?? []).filter((r) => r.owner === 'unresolved');
    if (unresolved.length > 0 && e.verification !== 'incomplete') {
      out.push(
        `${defensiveKey(e)}: ${unresolved.length} ratio(s) whose owner no source states, but claims '${e.verification}'`,
      );
    }
    if (unresolved.length > 0 && (e.unresolvable ?? []).length === 0) {
      out.push(`${defensiveKey(e)}: an unresolved owner with no 'unresolvable' record`);
    }
    if (e.verification === 'verified') {
      out.push(`${defensiveKey(e)}: claims 'verified'; there is no ledger route to that status for a defensive entry`);
    }
  }
  return out;
}

/** S5 — an entry whose key matches nothing can never be attached to anything a user picks. */
export function sweepJoinIntegrity(
  abilities: CuratedAbility[],
  defensiveEffects: CuratedDefensiveEffect[],
  itemEffects: CuratedItemEffect[],
  items: Item[],
): string[] {
  const abilityIndex = new Set(abilities.map((a) => `${a.champion}/${a.slot}/${a.abilityName}`));
  const itemIndex = new Set(items.map((i) => i.id));
  return [
    ...defensiveEffects
      .filter((e) => !abilityIndex.has(`${e.champion}/${e.slot}/${e.abilityName}`))
      .map((e) => `${defensiveKey(e)} — names an ability that is not in the merged file`),
    ...itemEffects
      .filter((e) => !itemIndex.has(e.itemId))
      .map((e) => `${itemKey(e)} — names item id ${e.itemId}, which is not in the shipped pool`),
  ];
}

/**
 * S6 — THE DEFECT CLASS BEHIND THE DUPLICATE COMPONENT IDS, generalised.
 *
 * Two damage rows under one label, all marked 'adds', is the shape that SUMS TWO ALTERNATIVES.
 * Twisted Fate's three cards are one card's damage, not three added together. Gate 3 does not
 * catch it, because the labels are identical and carry none of its alternative markers — that
 * pattern looks for "reduced", "empowered", "secondary" and the like.
 */
export function sweepSameLabelAdds(
  abilities: CuratedAbility[],
): Array<{ entry: string; status: string; labels: string[] }> {
  return abilities.flatMap((a) => {
    const adds = a.components.filter((c) => (c.relation?.kind ?? 'adds') === 'adds');
    const counts = new Map<string, number>();
    for (const c of adds) {
      const l = (c.label ?? c.id).trim().toLowerCase();
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    const dup = [...counts.entries()].filter(([, n]) => n > 1);
    return dup.length === 0
      ? []
      : [{ entry: abilityKey(a), status: a.verification, labels: dup.map(([l, n]) => `${l} x${n}`) }];
  });
}

/** S8 — the same entry twice in one array would double whatever it holds. */
export function sweepDuplicateIdentity(
  abilities: CuratedAbility[],
  itemEffects: CuratedItemEffect[],
  defensiveEffects: CuratedDefensiveEffect[],
): string[] {
  const dupOf = (keys: string[]): string[] => {
    const n = new Map<string, number>();
    for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
    return [...n.entries()].filter(([, c]) => c > 1).map(([k, c]) => `${k} x${c}`);
  };
  return [
    ...dupOf(abilities.map(abilityKey)),
    ...dupOf(itemEffects.map((e) => `${e.itemId}/${e.key}`)),
    ...dupOf(
      defensiveEffects.map(
        (e) => `${e.champion}/${e.slot}/${e.abilityName}/${e.kind}/${e.label ?? ''}/${e.id ?? ''}`,
      ),
    ),
  ];
}

// ---------------------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------------------

export interface Refusal {
  /** Which of the three proposal sets it came from. */
  area: 'ability' | 'item-effect' | 'defensive';
  key: string;
  /** The status the proposal gave it, so a reader can see what is being held back. */
  proposedStatus: string;
  refusalClass: string;
  /** Plain English: what is wrong, said in terms of the data rather than the code. */
  why: string;
  /** The single change that would let this entry in, so the cost of the refusal is visible. */
  wouldUnblock: string;
  /** Whether refusing it removes a number a user can currently see. */
  costsAVisibleNumber: boolean;
  evidence?: string[];
}

/**
 * REFUSAL 1 — an ability entry gate 1 rejects.
 *
 * Found by running the lead's own gateSchema over the proposal, never by a rule invented here.
 */
export function refuseSchemaInvalidAbilities(
  abilities: CuratedAbility[],
  defensiveEffects: CuratedDefensiveEffect[],
): { kept: CuratedAbility[]; refusals: Refusal[] } {
  const preflight = gateSchema({
    version: 1,
    patch: 'preflight',
    fetched: 'preflight',
    abilities,
    defensiveEffects,
    itemEffects: [],
    runes: [],
    shards: [],
    exclusions: [],
  });
  const messages = new Map<string, string[]>();
  for (const f of preflight.findings) {
    messages.set(f.entry, [...(messages.get(f.entry) ?? []), f.message]);
  }
  const refusals: Refusal[] = [];
  const kept = abilities.filter((a) => {
    const msgs = messages.get(abilityKey(a));
    if (!msgs) return true;
    const duplicateId = msgs.some((m) => m.includes('duplicate component id'));
    refusals.push({
      area: 'ability',
      key: abilityKey(a),
      proposedStatus: a.verification,
      refusalClass: duplicateId ? 'duplicate-component-id' : 'gate-1-schema-invalid',
      why: duplicateId
        ? `two of this ability's ${a.components.length} damage rows are stored under the same ` +
          `component id, so a relation pointing at that id names two rows at once. Gate 1 ` +
          `rejects the entry, and one rejected entry makes the whole curated file fail gate 1.`
        : `gate 1 rejects this entry: ${msgs.join('; ')}`,
      wouldUnblock: duplicateId
        ? 'the harvester giving each row a distinct component id — a change inside ' +
          'scripts/extract/ that moves no value — followed by a fresh full-roster run'
        : 'the missing fact being supplied by the source, or the row being refused at harvest',
      costsAVisibleNumber: a.verification === 'derived' || a.verification === 'verified',
      evidence: msgs,
    });
    return false;
  });
  return { kept, refusals };
}

/**
 * REFUSAL 2 — an effect using a Scaling arm gate 1's shape checker has no case for.
 *
 * THIS IS A GATE DEFECT, NOT A DATA DEFECT, and it is held back for that reason rather than
 * merged past. Merging these would leave the curated file permanently reporting a finding
 * nobody can act on, and a gate whose failures are known-ignorable stops being a gate.
 */
export function refuseUnknownScalingArms(itemEffects: CuratedItemEffect[]): {
  kept: CuratedItemEffect[];
  refusals: Refusal[];
} {
  const refusals: Refusal[] = [];
  const kept = itemEffects.filter((e) => {
    const kinds = scalingKinds(e.components ?? []);
    const unknown = [...kinds.keys()].filter((k) => !SCALING_ARMS_GATE1_ACCEPTS.has(k));
    if (unknown.length === 0) return true;
    refusals.push({
      area: 'item-effect',
      key: itemKey(e),
      proposedStatus: e.verification,
      refusalClass: 'validator-has-no-arm-for-this-scaling',
      why:
        `this effect states two values chosen by the holder's range type ('${unknown.join("', '")}'), ` +
        `which the frozen contract allows and gate 1's shape checker has no case for — it reports ` +
        `the arm as "unknown scaling kind". The data is right and the checker is short of a case.`,
      wouldUnblock:
        "adding a 'byRangeType' case to checkScalingShape() in src/types/validate-curated.ts " +
        '(a lead change that recurses into both arms), after which these merge unchanged',
      costsAVisibleNumber: false,
      evidence: [...kinds.entries()].map(([k, n]) => `${k} x${n}`),
    });
    return false;
  });
  return { kept, refusals };
}

// ---------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(join(ROOT, p), 'utf8')) as T;

  const abilityFile = await readJson<CuratedFile>(SOURCES.abilities);
  const report = await readJson<AbilityReport>(SOURCES.abilityReport);
  const effects = await readJson<EffectValuesFile>(SOURCES.itemEffects);
  const defensive = await readJson<DefensiveProposalFile>(SOURCES.defensive);
  const items = await readJson<Item[]>(SOURCES.items);
  const manifest = await readJson<{ patch: string }>(SOURCES.manifest);
  const gate5 = await readJson<Array<{ entry: string }>>(SOURCES.gate5);

  const abilityPass = refuseSchemaInvalidAbilities(
    abilityFile.abilities,
    defensive.defensiveEffects,
  );
  const itemPass = refuseUnknownScalingArms(effects.proposedItemEffects);
  const refusals = [...abilityPass.refusals, ...itemPass.refusals];

  const merged: CuratedFile = {
    version: abilityFile.version,
    patch: manifest.patch,
    fetched: new Date().toISOString().slice(0, 10),
    abilities: abilityPass.kept,
    defensiveEffects: defensive.defensiveEffects,
    itemEffects: itemPass.kept,
    runes: [],
    shards: [],
    exclusions: abilityFile.exclusions,
  };

  // -------------------------------------------------------------------------------------
  // THE GATES, run over the merged file exactly as the lead defines them.
  //
  // Gate 6 needs round-trip evidence, and it is reconstructed the way run-batch.ts builds it:
  // evidence from EITHER the ability-box round trip or the prose round trip, with any prose
  // disagreement disqualifying the entry. Requiring the ability box alone is the mistake that
  // kept Aphelios Q and Ambessa P out of `verified` (CLAUDE.md, DATA-SOURCES §36.2).
  // -------------------------------------------------------------------------------------
  const proseFailed = new Set(
    report.proseRoundTrips.filter((p) => p.mismatches.length > 0).map((p) => p.entry),
  );
  const roundTripPassed = new Set(
    [
      ...report.roundTrips.filter((r) => r.mismatches.length === 0 && r.checkedRows > 0).map((r) => r.entry),
      ...report.proseRoundTrips.filter((p) => p.mismatches.length === 0 && p.matched > 0).map((p) => p.entry),
    ].filter((e) => !proseFailed.has(e)),
  );
  const independentlyChecked = new Set(gate5.map((r) => r.entry));

  const gates: Array<GateReport & { number: number; what: string; population: string }> = [
    {
      ...gateSchema(merged),
      number: 1,
      what: 'schema — every field the contract requires is present and well-formed',
      population:
        'every ability entry plus every defensive entry in the merged file. It does NOT walk ' +
        'itemEffects or runes; sweep S1 measures that gap.',
    },
    {
      ...gateSumGuard(merged),
      number: 3,
      what: 'the sum guard — alternatives are never summed, summary rows are never stored',
      population: 'ability entries carrying two or more damage components. Abilities only.',
    },
    {
      ...gateNonChampion(merged),
      number: 4,
      what: 'non-champion rows — minion, monster and turret damage must not survive harvest',
      population: 'every damage component of every ability entry. Abilities only.',
    },
    {
      ...gateStatusHonesty(merged, { roundTripPassed, independentlyChecked }),
      number: 6,
      what: "status honesty — nothing claims better than its evidence, and 'verified' needs a ledger record",
      population: 'every ability entry in the merged file. Abilities only.',
    },
  ];

  // -------------------------------------------------------------------------------------
  // GATE 7 — total reconciliation. CARRIED, NOT RECOMPUTED, and the difference matters.
  //
  // Gate 7 asks whether the stored components sum to the whole-ability total the SOURCE states.
  // That total is not in the curated file and never will be, so the question cannot be asked of
  // a CuratedFile at all: it is answered during harvest and survives as a per-entry issue in the
  // batch report. This reads those issues rather than pretending to re-derive them.
  // -------------------------------------------------------------------------------------
  const mergedKeys = new Set(merged.abilities.map(abilityKey));
  const gate7Failures = report.drafts
    .filter((d) => d.issues.some((i) => i.kind === 'total-mismatch'))
    .map((d) => ({
      entry: d.entry,
      status: d.verification,
      inMergedFile: mergedKeys.has(d.entry),
      detail: d.issues.find((i) => i.kind === 'total-mismatch')!.detail,
    }));

  // -------------------------------------------------------------------------------------
  // The sweeps
  // -------------------------------------------------------------------------------------
  const s1 = sweepGate1Coverage(merged.itemEffects, merged.runes);
  const s2 = sweepItemSumGuard(merged.itemEffects);
  const s3 = sweepNonChampionOutsideAbilities(merged.itemEffects, merged.defensiveEffects!);
  const s4 = sweepStatusHonestyOutsideAbilities(merged.itemEffects, merged.defensiveEffects!);
  const s5 = sweepJoinIntegrity(merged.abilities, merged.defensiveEffects!, merged.itemEffects, items);
  const s6 = sweepSameLabelAdds(abilityFile.abilities);
  const rtByEntry = new Map(report.roundTrips.map((r) => [r.entry, r]));
  const prByEntry = new Map(report.proseRoundTrips.map((r) => [r.entry, r]));
  const lvByEntry = new Map(report.levelRoundTrips.map((r) => [r.entry, r]));
  const storableMerged = merged.abilities.filter((a) => a.components.length > 0);
  const nothingCompared = storableMerged
    .filter((a) => {
      const k = abilityKey(a);
      return (
        (rtByEntry.get(k)?.checkedRows ?? 0) +
          (prByEntry.get(k)?.checked ?? 0) +
          (lvByEntry.get(k)?.checked ?? 0) ===
        0
      );
    })
    .map((a) => ({ entry: abilityKey(a), status: a.verification, components: a.components.length }));
  const s8 = sweepDuplicateIdentity(merged.abilities, merged.itemEffects, merged.defensiveEffects!);
  const excluded = new Set(merged.exclusions.map((e) => e.champion));
  const s9 = merged.abilities
    .filter((a) => excluded.has(a.champion))
    .map((a) => ({ entry: abilityKey(a), status: a.verification, components: a.components.length }));
  const armsUsed = scalingKinds({
    abilities: merged.abilities,
    itemEffects: merged.itemEffects,
    defensiveEffects: merged.defensiveEffects,
  });

  // S11 — does anything actually READ what is being merged? Measured by reading the engine and
  // interface source, because "merging changes nothing on screen" is a claim that has to be
  // checked rather than assumed.
  const consumerFiles = [
    'src/engine/simulate.ts',
    'src/engine/combo.ts',
    'src/ui/data/catalogue.ts',
  ];
  const consumers: Array<{ file: string; mentionsItemEffects: boolean; mentionsDefensiveEffects: boolean }> = [];
  for (const f of consumerFiles) {
    const text = await readFile(join(ROOT, f), 'utf8').catch(() => '');
    consumers.push({
      file: f,
      mentionsItemEffects: /CuratedItemEffect|itemEffects\s*[:.(]/.test(text),
      mentionsDefensiveEffects: /CuratedDefensiveEffect|defensiveEffects\s*[:.(]/.test(text),
    });
  }
  const consumersFound = consumers.filter((c) => c.mentionsItemEffects || c.mentionsDefensiveEffects).length;

  const sweeps = [
    {
      id: 'S1-gate1-coverage',
      what:
        'gate 1 (gateSchema) iterates file.abilities and file.defensiveEffects and nothing else, ' +
        "so itemEffects and runes would enter a curated file unchecked. This runs the validator's " +
        'own component checker (checkEffectComponents) over them by hand.',
      population: `${merged.itemEffects.length} item effects + ${merged.runes.length} runes in the merged file`,
      found: s1.length,
      entries: s1,
      verdict:
        s1.length === 0
          ? "every merged item effect passes the validator's component checker. THE COVERAGE GAP ITSELF REMAINS and is a lead fix: gate 1 would not have looked."
          : 'findings remain — see entries',
    },
    {
      id: 'S2-item-effect-sum-guard',
      what:
        'gate 3 walks abilities only. An item effect with two damage components and no stated ' +
        'relation is the same double-count shape, so the same question is asked here.',
      population: `${merged.itemEffects.length} item effects`,
      found: s2.length,
      entries: s2,
      verdict:
        s2.length === 0
          ? 'no merged item effect carries more than one component, so the shape cannot arise today'
          : 'item effects carry unrelated multiple components',
    },
    {
      id: 'S3-non-champion-rows-outside-abilities',
      what: 'gate 4 walks abilities only. The same pattern is applied to item and defensive labels.',
      population: `${merged.itemEffects.length} item effects + ${merged.defensiveEffects!.length} defensive entries`,
      found: s3.length,
      entries: s3,
      verdict: s3.length === 0 ? 'no leak found' : 'a non-champion row survived',
    },
    {
      id: 'S4-status-honesty-outside-abilities',
      what:
        "gate 6 walks abilities only. Its three rules — an unresolved owner forces 'incomplete', " +
        "an unresolved owner must be recorded as 'unresolvable', and 'verified' needs a ledger — " +
        'are applied to item effects and defensive entries here.',
      population: `${merged.itemEffects.length} item effects + ${merged.defensiveEffects!.length} defensive entries`,
      found: s4.length,
      entries: s4,
      verdict:
        s4.length === 0
          ? 'no entry outside the ability set claims better than its evidence'
          : 'see entries',
    },
    {
      id: 'S5-join-integrity',
      what:
        'a defensive entry names an ability by (champion, slot, abilityName) and an item effect ' +
        'names an item by id. An entry whose key matches nothing can never attach to anything a ' +
        'user selects, so it would sit in the file doing nothing.',
      population: `${merged.defensiveEffects!.length} defensive entries against ${merged.abilities.length} merged abilities; ${merged.itemEffects.length} item effects against ${items.length} shipped items`,
      found: s5.length,
      entries: s5,
      verdict:
        s5.length === 0
          ? 'every defensive entry resolves to a merged ability and every item effect to a shipped item — including after the ability refusals above'
          : 'orphans found',
    },
    {
      id: 'S6-same-label-additive-components',
      what:
        'two or more damage components of one ability carrying the SAME label and all marked ' +
        "'adds'. That is how two alternatives get summed, which hands a champion damage it never " +
        'deals. Measured over the ability proposal BEFORE refusals, so the refusal can be judged.',
      population: `${abilityFile.abilities.length} proposed ability entries`,
      found: s6.length,
      entries: s6,
      verdict: s6.every((e) => e.status === 'incomplete')
        ? "every instance is already 'incomplete', so none of them puts a number in front of a user — stated rather than assumed"
        : 'AT LEAST ONE INSTANCE IS NOT INCOMPLETE — a summed pair of alternatives may be reaching a user',
    },
    {
      id: 'S7-stored-damage-with-nothing-compared',
      what:
        'an entry storing damage where none of the three round trips compared a single row. The ' +
        'status may still be honest — `derived` only claims extraction — but nothing has checked ' +
        'these numbers even once, and that is worth seeing by name.',
      population: `${storableMerged.length} merged entries storing at least one damage component`,
      found: nothingCompared.length,
      entries: nothingCompared,
      verdict:
        nothingCompared.length === 0
          ? 'every entry storing damage had at least one row compared'
          : 'see entries — these are the first candidates for a gate-5 sample',
    },
    {
      id: 'S8-duplicate-identity',
      what: 'the same entry appearing twice in one array, which would double whatever it holds.',
      population: `${merged.abilities.length} abilities + ${merged.itemEffects.length} item effects + ${merged.defensiveEffects!.length} defensive entries`,
      found: s8.length,
      entries: s8,
      verdict: s8.length === 0 ? 'no duplicate identity in any array' : 'duplicates found',
    },
    {
      id: 'S9-entries-for-an-excluded-champion',
      what:
        'the file declares a champion excluded by decision (SPECIFICATION §11) and also carries ' +
        "ability entries for them. Not automatically wrong — but the interface's 'deliberately " +
        "out of scope' state and a stored damage figure are two different answers, and only a " +
        'person can say which the user should see.',
      population: `${merged.exclusions.length} exclusion(s): ${[...excluded].join(', ')}`,
      found: s9.length,
      entries: s9,
      verdict: s9.length === 0 ? 'no entry for an excluded champion' : 'RAISED for a decision, not resolved here',
    },
    {
      id: 'S10-scaling-arms-versus-gate-1',
      what:
        "every `scaling` arm used anywhere in the merged file, against the four gate 1's shape " +
        'checker has a case for. An arm the contract allows and the checker does not is a gate ' +
        'defect that refuses good data.',
      population: 'every nested value in the merged file, plus the item proposal before refusals',
      found: [...armsUsed.keys()].filter((k) => !SCALING_ARMS_GATE1_ACCEPTS.has(k)).length,
      entries: [
        { where: 'merged file', arms: Object.fromEntries(armsUsed) },
        { where: 'item proposal before refusals', arms: Object.fromEntries(scalingKinds(effects.proposedItemEffects)) },
        { gate1Accepts: [...SCALING_ARMS_GATE1_ACCEPTS] },
      ],
      verdict: [...armsUsed.keys()].every((k) => SCALING_ARMS_GATE1_ACCEPTS.has(k))
        ? 'the merged file uses only arms gate 1 accepts, because the others were refused above'
        : 'the merged file uses an arm gate 1 rejects',
    },
    {
      id: 'S11-does-anything-read-what-is-being-merged',
      what:
        'whether the engine or the interface reads item effects or defensive entries at all. ' +
        "The engine's Catalogue offers three lookups — champion, item, abilities — so a merged " +
        'item or defensive entry has no consumer, and merging it changes no figure on screen.',
      population: `${consumerFiles.length} consumer files read: ${consumerFiles.join(', ')}`,
      found: consumersFound,
      entries: consumers,
      verdict:
        consumersFound === 0
          ? 'NOTHING READS THEM. Merging is necessary but not sufficient: the item, rune and shard disclosures stay true until the engine gains a lookup, which is a contract change and the lead\'s.'
          : 'a consumer exists — re-read this before claiming the merge is invisible',
    },
  ];

  // -------------------------------------------------------------------------------------
  // THE DIFF AGAINST /curated/ AS IT STANDS. Read only.
  // -------------------------------------------------------------------------------------
  const curatedDir = join(ROOT, 'curated');
  const curatedFiles = await readdir(curatedDir);
  const curatedDataFiles = curatedFiles.filter((f) => f.endsWith('.json')).sort();
  // Every .json file in the tree is read and their entries pooled, because the pipeline's own
  // reader (scripts/fetch/curated-source.ts) accepts any number of files there. Reading only the
  // first would silently under-report what a merge would collide with.
  let existing: CuratedFile | undefined;
  if (curatedDataFiles.length > 0) {
    const parts = await Promise.all(
      curatedDataFiles.map(async (f) => JSON.parse(await readFile(join(curatedDir, f), 'utf8')) as Partial<CuratedFile>),
    );
    existing = {
      version: parts[0]?.version ?? 0,
      patch: parts[0]?.patch ?? 'unknown',
      fetched: parts[0]?.fetched ?? 'unknown',
      abilities: parts.flatMap((p) => p.abilities ?? []),
      defensiveEffects: parts.flatMap((p) => p.defensiveEffects ?? []),
      itemEffects: parts.flatMap((p) => p.itemEffects ?? []),
      runes: parts.flatMap((p) => p.runes ?? []),
      shards: parts.flatMap((p) => p.shards ?? []),
      exclusions: parts.flatMap((p) => p.exclusions ?? []),
    };
  }
  const compare = <T>(
    proposed: T[],
    current: T[] | undefined,
    key: (x: T) => string,
  ): { added: number; changed: number; untouched: number; changedKeys: string[] } => {
    if (!current) return { added: proposed.length, changed: 0, untouched: 0, changedKeys: [] };
    const index = new Map(current.map((x) => [key(x), JSON.stringify(x)]));
    let added = 0;
    let changed = 0;
    let untouched = 0;
    const changedKeys: string[] = [];
    for (const p of proposed) {
      const before = index.get(key(p));
      if (before === undefined) added += 1;
      else if (before === JSON.stringify(p)) untouched += 1;
      else {
        changed += 1;
        changedKeys.push(key(p));
      }
    }
    return { added, changed, untouched, changedKeys };
  };

  const diff = {
    what: 'what merging this proposal into /curated/ would do to the tree as it stands today',
    curatedTreeContains: curatedFiles,
    curatedDataFilesFound: curatedDataFiles.length,
    readNote:
      curatedDataFiles.length === 0
        ? 'THERE IS NO CURATED DATA FILE ON DISK. /curated/ holds its README and nothing else, so ' +
          'there is no existing entry any proposal could change: every entry below is an ADDITION, ' +
          'and CHANGED and UNTOUCHED are structurally zero rather than measured.'
        : 'an existing curated file was found and every entry below was compared to it by key',
    definitions: {
      added: 'an entry whose key appears in the merged proposal and not in /curated/',
      changed: 'an entry whose key appears in both and whose JSON differs',
      untouched: 'an entry whose key appears in both and whose JSON is identical',
      abilityKey: 'champion (+form) / slot / abilityName',
      itemEffectKey: 'itemId / effect key (pass, pass2, act, consume)',
      defensiveKey: 'champion / slot / abilityName / kind / label',
    },
    abilities: compare(merged.abilities, existing?.abilities, abilityKey),
    itemEffects: compare(merged.itemEffects, existing?.itemEffects, (e) => `${e.itemId}/${e.key}`),
    defensiveEffects: compare(merged.defensiveEffects!, existing?.defensiveEffects, defensiveKey),
    runes: compare(merged.runes, existing?.runes, (r) => String(r.runeId)),
    shards: { added: 0, changed: 0, untouched: 0, changedKeys: [] },
    whatTheSiteServesToday:
      'the site serves harvester drafts from public/data/abilities/, not /curated/. The ability ' +
      'half of this proposal is the same 937 entries with the same numbers (the served copies ' +
      'carry one extra field, the Data Dragon icon filename), so merging changes no figure a ' +
      'user currently sees; it changes where those figures live and who may overwrite them.',
  };

  // -------------------------------------------------------------------------------------
  // WHAT IS ABSENT ENTIRELY — counted, so the absence is visible rather than assumed
  // -------------------------------------------------------------------------------------
  const absent = {
    runes: {
      merged: 0,
      populationOfRecord: 62,
      why:
        'no rune value has been extracted at all. Of the 5 damaging runes that state a value ' +
        'structurally, 3 deal damage the source calls "adaptive" — a type DamageType has no arm ' +
        'for — and 2 state a range whose axis is never named (DATA-SOURCES §39). The rest need a ' +
        'person to read the sentence. Merging this proposal leaves EVERY rune unmodelled, and the ' +
        'interface must keep saying so.',
    },
    shards: {
      merged: 0,
      populationOfRecord: 0,
      why:
        'stat shards appear in NO source (DATA-SOURCES §7). There is nothing to extract and ' +
        'nothing to merge; they can only ever be hand-authored from outside the data.',
    },
    itemEffectsNotProposed: {
      populationOfRecord: 291,
      inScopeForDamage: 168,
      damaging: 81,
      structurallyStated: 63,
      proposed: effects.proposedItemEffects.length,
      merged: merged.itemEffects.length,
      why:
        'the item proposal covers only effects whose value the source states structurally AND ' +
        'that a person read and agreed with, value by value. Everything else is refused upstream ' +
        'and recorded in public/data/effect-refusal-census.json.',
    },
    defensiveEffectsNotProposed: {
      confirmedPairs: defensive.population.confirmedEffectKindPairs ?? null,
      proposed: defensive.defensiveEffects.length,
      refusedPairs: defensive.population.refused ?? null,
      why:
        "the great majority of remaining refusals are 'no-leveling-row': the effect's value lives " +
        'in a sentence rather than a row, and reading those is the outstanding work (DATA-SOURCES §48.5).',
    },
  };

  // -------------------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------------------
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'merged-proposal.json'), `${JSON.stringify(merged, null, 1)}\n`);

  const statusCount = (xs: Array<{ verification: string }>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const x of xs) out[x.verification] = (out[x.verification] ?? 0) + 1;
    return out;
  };
  const byKey = <T>(xs: T[], k: (x: T) => string): Record<string, number> =>
    xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [k(x)]: (acc[k(x)] ?? 0) + 1 }), {});

  const reportOut = {
    what:
      'A DECISION PACKAGE for merging the scattered proposals into /curated/. It is not a merge, ' +
      'and nothing here writes that tree. Every count states what it counts.',
    generatedOn: new Date().toISOString(),
    patch: manifest.patch,
    sources: SOURCES,
    provenanceOfEachHalf: {
      abilities: `${abilityFile.abilities.length} entries harvested over the 937-page roster, patch ${abilityFile.patch}, fetched ${abilityFile.fetched}`,
      itemEffects: `${effects.proposedItemEffects.length} effects, each produced twice — once by a parser and once by a person reading the item's own sentence — and stored only where the two agreed (DATA-SOURCES §39)`,
      defensiveEffects: `${defensive.defensiveEffects.length} entries over ${defensive.population.confirmedPages ?? '?'} confirmed pages, generated ${defensive.generatedOn}; gate D2 ${defensive.gateD2.ran ? 'RAN' : 'DID NOT RUN'} — ${JSON.stringify(defensive.gateD2.outcomes)}`,
      runes: 'nothing proposed',
    },
    definitions: {
      proposed: 'an entry present in one of the three proposal files before this script ran',
      merged: 'an entry this script recommends writing into /curated/',
      refused: 'a proposed entry this script does NOT recommend, listed with its reason in merge-refusals.json',
      derived: 'extracted from a source, not independently re-derived (SPECIFICATION §8)',
      incomplete:
        "the entry may claim no better than 'unfinished'. simulate contributes NO damage for one and prints the reason instead",
      'no-damage': "the ability's own template and Module:DamageData/data are silent together",
      verified: 'a gate-5 ledger record AND agreement from at least one round trip. Nothing here can create one.',
    },
    counts: {
      proposed: {
        abilities: abilityFile.abilities.length,
        itemEffects: effects.proposedItemEffects.length,
        defensiveEffects: defensive.defensiveEffects.length,
        runes: 0,
        shards: 0,
      },
      merged: {
        abilities: merged.abilities.length,
        itemEffects: merged.itemEffects.length,
        defensiveEffects: merged.defensiveEffects!.length,
        runes: merged.runes.length,
        shards: merged.shards.length,
        exclusions: merged.exclusions.length,
        damageComponents: merged.abilities.reduce((n, a) => n + a.components.length, 0),
      },
      refused: {
        total: refusals.length,
        byArea: byKey(refusals, (r) => r.area),
        byClass: byKey(refusals, (r) => r.refusalClass),
        removingANumberAUserCanSee: refusals.filter((r) => r.costsAVisibleNumber).length,
      },
      mergedStatuses: {
        abilities: statusCount(merged.abilities),
        itemEffects: statusCount(merged.itemEffects),
        defensiveEffects: statusCount(merged.defensiveEffects!),
      },
    },
    gates: gates.map((g) => ({
      gate: g.number,
      name: g.gate,
      what: g.what,
      population: g.population,
      checked: g.checked,
      passed: g.passed,
      failed: g.failed,
      findings: g.findings,
    })),
    gate7: {
      gate: 7,
      name: 'total reconciliation',
      what:
        'do the stored components sum to the whole-ability total the SOURCE itself states? The ' +
        'total is not in the curated file, so this cannot be recomputed from the merged file — it ' +
        'is CARRIED from the harvest that produced the entries.',
      population: `${report.drafts.length} harvested ability drafts`,
      failures: gate7Failures.length,
      failuresInMergedFile: gate7Failures.filter((f) => f.inMergedFile).length,
      failuresNotAlreadyIncomplete: gate7Failures.filter((f) => f.status !== 'incomplete').length,
      note:
        "a gate-7 failure that is already 'incomplete' puts no number in front of a user: simulate " +
        'contributes no damage for an incomplete ability and prints the reason instead.',
      entries: gate7Failures,
    },
    sweeps,
    diffAgainstCurated: diff,
    absent,
  };
  await writeFile(join(OUT_DIR, 'merge-report.json'), `${JSON.stringify(reportOut, null, 1)}\n`);

  await writeFile(
    join(OUT_DIR, 'merge-refusals.json'),
    `${JSON.stringify(
      {
        what:
          'Every proposed entry this script does NOT recommend merging, with the reason and the ' +
          'one change that would let it in. This list is as important as the merge: a refusal is a ' +
          'result, and not one of these asks anybody to invent a value.',
        generatedOn: new Date().toISOString(),
        counts: {
          total: refusals.length,
          byArea: byKey(refusals, (r) => r.area),
          byClass: byKey(refusals, (r) => r.refusalClass),
          removingANumberAUserCanSee: refusals.filter((r) => r.costsAVisibleNumber).length,
        },
        refusals,
      },
      null,
      1,
    )}\n`,
  );

  // -------------------------------------------------------------------------------------
  // Say it in words
  // -------------------------------------------------------------------------------------
  console.log('\n=== MERGE PROPOSAL ===');
  console.log(
    `merged: ${merged.abilities.length} abilities, ${merged.itemEffects.length} item effects, ` +
      `${merged.defensiveEffects!.length} defensive entries, ${merged.runes.length} runes, ` +
      `${merged.shards.length} shards`,
  );
  console.log(`refused: ${refusals.length}`);
  for (const [cls, n] of Object.entries(byKey(refusals, (r) => r.refusalClass))) {
    console.log(`   ${String(n).padStart(3)}  ${cls}`);
  }
  console.log('\n--- gates over the merged file ---');
  for (const g of gates) {
    console.log(
      `  gate ${g.number} ${g.gate.padEnd(16)} checked ${String(g.checked).padStart(4)}  ` +
        `pass ${String(g.passed).padStart(4)}  FAIL ${String(g.failed).padStart(4)}`,
    );
  }
  console.log(
    `  gate 7 ${'total-reconcile'.padEnd(17)} carried from harvest: ${gate7Failures.length} failures, ` +
      `${gate7Failures.filter((f) => f.status !== 'incomplete').length} of them not already incomplete`,
  );
  console.log('\n--- area sweeps ---');
  for (const s of sweeps) console.log(`  ${s.id.padEnd(44)} found ${String(s.found).padStart(3)}`);
  console.log(`\nwrote ${join(OUT_DIR, 'merged-proposal.json')}`);
  console.log(`wrote ${join(OUT_DIR, 'merge-report.json')}`);
  console.log(`wrote ${join(OUT_DIR, 'merge-refusals.json')}`);
}

// Only when run directly, so the tests can import the sweeps without doing any of this.
if (process.argv[1]?.endsWith('merge-proposal.ts')) {
  await main();
}
