// PROPOSING DEFENSIVE KIT ENTRIES — the first thing in this project to write a
// `CuratedDefensiveEffect`.
//
// WHAT THIS IS. `defensive-census.ts` COUNTED the defender's kit. `defensive-confirmed.ts` holds
// the population a person read and accepted. This file turns those confirmed effects into DRAFT
// curated entries in `build/proposed-curated/`, for the lead to merge. It writes nothing in
// `/curated/`, marks nothing `verified`, and proposes only for effects in the confirmed list —
// the detector's 289 candidates are never a storage population (CLAUDE.md: a detector proposes,
// a person confirms, storage is gated on the confirmed set).
//
// WHAT IT REFUSES, AND WHY THAT IS THE POINT. A defensive row is easy to read and hard to STORE.
// The shape carries one `kind`, one optional `value` and a list of `ratios`; it carries no label,
// no unit, no granted stat, no damage type, no relation between two rows and no statement that an
// effect recurs. So a row whose meaning depends on any of those cannot be written down without
// the entry asserting something the source did not say. Every such row is refused, with a class,
// and the classes are counted — because the count is the measurement of exactly which contract
// fields would release which entries. Refusing is cheap and reversible; a plausible wrong number
// in the defender's stat block is neither.
//
// Run:  node scripts/extract/defensive-propose.ts
// Offline over the page cache. Its coverage is the cache's coverage, which the cache records.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  AbilitySlot,
  CuratedDefensiveEffect,
  Ratio,
  RatioMultiplier,
  Scaling,
  Unresolvable,
} from '../../src/types/data.ts';
import { requiresOwner } from '../../src/types/data.ts';
import { expandByRank, isLevelScaled, levelBreakpoints } from '../../src/types/scaling.ts';
import {
  agreesAtDisplayPrecision,
  compareAtDisplayPrecision,
} from '../../src/types/validate-curated.ts';

import {
  NON_CHAMPION_ROW,
  RANGE_QUALIFIER,
  EMPOWERED_QUALIFIER,
  isMultiplierGroup,
  parseMultiplier,
  parseRatio,
} from './classify.ts';
import { CONFIRMED, type ConfirmedEffect } from './defensive-confirmed.ts';
import { scanPage, type Kind } from './defensive.ts';
import { maxRankFor } from './harvest.ts';
import { renderAbility, renderLevelBlocks, type RenderedRow } from './render.ts';
import { CACHE_DIR, readCache, type CachedPage } from './page-cache.ts';
import { parseRankProgression, parseLevelProgression, statedStepCount } from './progression.ts';
import {
  findBlocks,
  findLevelBlocks,
  parseFields,
  parseVardefines,
  plainText,
  splitArgs,
  statRows,
  substituteVars,
} from './wikitext.ts';

const OUT = join(CACHE_DIR, 'defensive-proposals.json');

// ---------------------------------------------------------------------------
// The kinds. The census counted nine plus one adjacent class; the contract holds nine.
// ---------------------------------------------------------------------------

/**
 * Census kind -> contract kind. `null` means the census counted it and the contract deliberately
 * does not hold it: `attacker-debuff` lowers the ENEMY's damage output and DATA-SOURCES §40.5
 * excludes it from the defensive figure. It is counted here and never proposed.
 */
export const KIND_MAP: Record<Kind, CuratedDefensiveEffect['kind'] | null> = {
  'damage-reduction': 'damage-reduction',
  'type-specific-reduction': 'type-specific-reduction',
  'resistance-grant': 'resistance-grant',
  shield: 'shield',
  'spell-shield': 'spell-shield',
  immunity: 'immunity',
  'execute-threshold': 'execute-threshold',
  heal: 'heal',
  'health-grant': 'max-health-grant',
  'attacker-debuff': null,
};

// ---------------------------------------------------------------------------
// Refusal classes. Each one names a FACT THE SOURCE STATES that the entry could not carry.
// ---------------------------------------------------------------------------

export type RefusalClass =
  | 'no-leveling-row'
  | 'multiple-values-one-field'
  | 'needs-granted-stat'
  | 'needs-damage-type'
  | 'needs-over-time'
  | 'needs-relation'
  | 'not-an-amount'
  | 'unit-not-expressible'
  | 'two-additive-terms'
  | 'unread-literal-in-row'
  | 'unreadable-value'
  | 'rank-axis-mismatch'
  | 'not-a-defensive-kind';

export const REFUSAL_CLASSES: Record<RefusalClass, string> = {
  'no-leveling-row':
    'the effect has no {{st|Label|value}} row of its kind, so its value (if any) lives in a ' +
    'sentence. Out of scope for the row-based pass; counted so the remaining reading burden is ' +
    'visible rather than implied.',
  'multiple-values-one-field':
    'the kind has more than one leveling row on the page and the shape holds ONE value with no ' +
    'label and no relation. Two entries of the same kind would be indistinguishable (Leona W ' +
    'grants 20-50 armor AND 20-50 magic resistance), and picking one row silently drops the ' +
    'other. Storing the pair needs a label and a relation, exactly as ability components have.',
  'needs-granted-stat':
    'a resistance grant does not say WHICH resistance in the shape. `kind: resistance-grant` ' +
    'plus a number cannot distinguish 7 armor from 7 magic resistance, and that is the ' +
    'difference between mitigating physical and magic damage. The label says which; the entry ' +
    'cannot.',
  'needs-damage-type':
    'the effect applies to one damage type only — a magic shield, a physical-damage reduction — ' +
    'and the shape has no field for the type. Stored without it, a magic-only shield absorbs ' +
    'physical damage too.',
  'needs-over-time':
    'the row states a per-tick or whole-channel figure, so the effect RECURS. ' +
    'SPECIFICATION §3.8 keeps damage over time out of the burst total precisely because the two ' +
    'are different facts; the same is true of a heal spread over a channel. `CuratedItemEffect` ' +
    'already has an `overTime` field for this; `CuratedDefensiveEffect` does not.',
  'needs-relation':
    'the row is a Minimum/Maximum or base/empowered variant of another row on the same page. ' +
    'Ability components carry `relation` for exactly this; a defensive effect has no way to say ' +
    'that two values are alternatives rather than additions.',
  'not-an-amount':
    'the row states a rate or an amplifier rather than an amount — life steal, omnivamp, ' +
    '"healing percentage" (a share of damage dealt), "increased healing" (a multiplier on other ' +
    'heals). Putting it in `value` would make an engine add it as health restored.',
  'unit-not-expressible':
    'the flat term carries a unit the shape cannot state. Damage reduction is written both as a ' +
    'percentage and as a flat number, and nothing on the entry says which — 25 could mean 25% ' +
    'of every instance or 25 points off it.',
  'two-additive-terms':
    'the row states a champion-level term AND a per-rank term, which add. `value` holds one ' +
    'Scaling. Storing one of two additive terms is a wrong number that looks like a whole one ' +
    '(the same rule the ability path applies to {{pp}} + {{ap}} rows).',
  'unread-literal-in-row':
    'a number survives outside every template block the parser understands — "(+ 2 per Soul ' +
    'collected)". The row was not read in full, so no part of it is stored (DATA-SOURCES §29, ' +
    'the bare-literal defect).',
  'unreadable-value':
    'a block the parser could not read: an unknown stat in a ratio, or an expression that will ' +
    'not evaluate. Reported with the block, never approximated.',
  'rank-axis-mismatch':
    "the row's own step count disagrees with the rank count this project assigns the slot " +
    "(Udyr's basic abilities reach rank 6). Storing 5 of 6 values, or 6 against a 5-rank axis, " +
    'puts every rank on the wrong number — DATA-SOURCES §29 defect 3.',
  'not-a-defensive-kind':
    "the census kind is deliberately outside the contract: `attacker-debuff` lowers the enemy's " +
    'output rather than changing damage received (DATA-SOURCES §40.5).',
};

export interface Refusal {
  key: string;
  kind: Kind;
  /** The first blocking reason, in the order the classes are listed. For reading, not counting. */
  refusalClass: RefusalClass;
  /**
   * EVERY class that blocks this pair, not just the first.
   *
   * The single-reason count is the wrong measurement to hand anyone: it says how often a class
   * fired FIRST, which depends on the order the checks run in. What a reader actually needs is
   * "how many entries would this one contract field release", and that is the number of pairs
   * whose whole blocker set is covered by that field. This list is what makes that computable.
   */
  blockedBy: RefusalClass[];
  /** The evidence: the row label(s) and, where it matters, the value that could not be read. */
  detail: string;
}

/** The order a refusal's primary class is picked in — most specific first. */
const CLASS_ORDER: RefusalClass[] = [
  'not-a-defensive-kind',
  'no-leveling-row',
  'needs-granted-stat',
  'needs-damage-type',
  'not-an-amount',
  'needs-over-time',
  'needs-relation',
  'unit-not-expressible',
  'two-additive-terms',
  'unread-literal-in-row',
  'rank-axis-mismatch',
  'unreadable-value',
  'multiple-values-one-field',
];

// ---------------------------------------------------------------------------
// Label reading. A row label is the source's own statement of WHAT the number is.
// ---------------------------------------------------------------------------

/** "per tick", "per second", "Total …" — the row is a rate or a whole-duration figure. */
export const OVER_TIME_LABEL = /\bper\s+(tick|second)\b|\btotal\b/i;
/** Life steal, omnivamp and the "percentage"/"increased" amplifier labels. */
export const NOT_AN_AMOUNT_LABEL = /life\s?steal|omnivamp|percentage|^increased\s+healing$/i;
/** A damage type named in the label — "Magic Shield Strength", "Physical Damage Reduction". */
export const TYPE_IN_LABEL = /\b(physical|magic|true)\b/i;

/**
 * Which fact a label states that the entry could not carry, or `null` when it states none.
 *
 * ORDER IS DELIBERATE: the most specific reason wins, so a refusal names the field that would
 * actually release it rather than the first rule that happened to fire.
 */
export function labelRefusal(
  kind: CuratedDefensiveEffect['kind'],
  label: string,
): RefusalClass | null {
  const l = label.trim();
  if (kind === 'resistance-grant') return 'needs-granted-stat';
  if (kind === 'type-specific-reduction') return 'needs-damage-type';
  if (TYPE_IN_LABEL.test(l)) return 'needs-damage-type';
  if (NOT_AN_AMOUNT_LABEL.test(l)) return 'not-an-amount';
  if (OVER_TIME_LABEL.test(l)) return 'needs-over-time';
  if (RANGE_QUALIFIER.test(l) || EMPOWERED_QUALIFIER.test(l)) return 'needs-relation';
  return null;
}

// ---------------------------------------------------------------------------
// Value reading. Same parsers the ability path uses, so a defensive row and a damage row are
// read by one implementation and cannot drift apart.
// ---------------------------------------------------------------------------

export interface ParsedValue {
  /** The flat term, when the row states one. Absent when the whole amount is a share of a stat. */
  value?: Scaling;
  ratios: Ratio[];
  /** True when the flat term is written as a percentage ("35%"), not an amount. */
  isPercentage: boolean;
  refusal?: { refusalClass: RefusalClass; detail: string };
}

/**
 * Read one defensive leveling row into a value and its ratios.
 *
 * NORMALISATION, AND THE REASON FOR IT: a rank-axis Scaling is stored `explicit` here, never
 * `linear`. `CuratedDefensiveEffect` has NO `maxRank` field, and a `linear` scaling is two
 * numbers that mean nothing without a rank count — expanding it needs a fact the entry does not
 * carry. An explicit list is self-describing and expands to exactly the same numbers.
 */
export function parseDefensiveRow(
  value: string,
  maxRank: number,
  vars: Record<string, string>,
): ParsedValue {
  const refuse = (refusalClass: RefusalClass, detail: string): ParsedValue => ({
    ratios: [],
    isPercentage: false,
    refusal: { refusalClass, detail: detail.replace(/\s+/g, ' ').slice(0, 160) },
  });

  // --- ratios first, so what remains is the flat term ---
  const ratioBlocks = findBlocks(value, 'as');
  const ratios: Ratio[] = [];
  // Sibling multiplier groups belong to the payload beside them, exactly as on the damage path.
  const siblingMultipliers: RatioMultiplier[] = [];
  const payloadBlocks = ratioBlocks.filter((b) => {
    const body = splitArgs(b.inner)[0] ?? '';
    if (!isMultiplierGroup(body)) return true;
    const m = parseMultiplier(body, maxRank, vars);
    if (m) siblingMultipliers.push(m);
    return false;
  });
  const liftSiblings = siblingMultipliers.length > 0 && payloadBlocks.length === 1;
  for (const b of liftSiblings ? payloadBlocks : ratioBlocks) {
    const { ratio, issue } = parseRatio(b.inner, maxRank, vars);
    if (issue) return refuse('unreadable-value', `${issue.kind}: ${issue.detail}`);
    if (!ratio) {
      // parseRatio returns nothing for a block that is prose rather than a ratio. A block whose
      // meaning we did not establish is left UNREAD, and an unread block means the row was not
      // read in full.
      return refuse('unreadable-value', `a {{as}} block that is not a readable ratio: ${b.inner}`);
    }
    if (liftSiblings && siblingMultipliers.length > 0) {
      ratio.multipliers = [...(ratio.multipliers ?? []), ...siblingMultipliers];
    }
    ratios.push(ratio);
  }

  // --- the flat term ---
  let rest = value;
  for (const b of [...ratioBlocks].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);
  const levelBlocks = findLevelBlocks(rest);
  const rankBlocks = findBlocks(rest, 'ap');
  if (levelBlocks.length > 0 && rankBlocks.length > 0) {
    return refuse('two-additive-terms', `${plainText(value).slice(0, 60)} | ${value}`);
  }

  let flat: Scaling | undefined;
  try {
    if (levelBlocks.length > 0) {
      flat = parseLevelProgression(substituteVars(levelBlocks[0]!.inner, vars));
    } else if (rankBlocks.length > 0) {
      const inner = substituteVars(rankBlocks[0]!.inner, vars);
      const stated = statedStepCount(inner);
      if (stated !== undefined && stated !== maxRank) {
        return refuse(
          'rank-axis-mismatch',
          `the row states ${stated} steps and the slot is treated as ${maxRank} ranks: ${inner}`,
        );
      }
      flat = parseRankProgression(inner, maxRank);
    }
  } catch (e) {
    return refuse('unreadable-value', `${value} — ${String(e)}`);
  }

  // --- anything left over ---
  let residue = rest;
  for (const b of [...levelBlocks, ...rankBlocks].sort((a, b2) => b2.start - a.start)) {
    residue = residue.slice(0, b.start) + ' ' + residue.slice(b.end);
  }
  const residueText = plainText(residue).replace(/\s+/g, ' ').trim();
  if (/\d/.test(residueText)) {
    return refuse('unread-literal-in-row', `a number outside every readable block: "${residueText}"`);
  }
  const isPercentage = flat !== undefined && /%/.test(residueText);

  if (flat === undefined && ratios.length === 0) {
    const literal = plainText(rest).trim();
    return refuse('unreadable-value', `no readable value in the row: "${literal}"`);
  }

  // --- normalise a rank axis to an explicit list (see the doc comment) ---
  const toExplicit = (s: Scaling): Scaling | { error: string } => {
    if (isLevelScaled(s) || s.scaling === 'byRangeType') return s;
    try {
      return { scaling: 'explicit', perRank: expandByRank(s, maxRank) };
    } catch (e) {
      return { error: String(e) };
    }
  };
  if (flat !== undefined) {
    const e = toExplicit(flat);
    if ('error' in e) return refuse('rank-axis-mismatch', e.error);
    flat = e;
  }
  const normalisedRatios: Ratio[] = [];
  for (const r of ratios) {
    const { stat, owner, multipliers, counter, ...scaling } = r;
    const e = toExplicit(scaling as Scaling);
    if ('error' in e) return refuse('rank-axis-mismatch', `ratio on ${stat}: ${e.error}`);
    normalisedRatios.push({
      stat,
      ...(owner ? { owner } : {}),
      ...(multipliers ? { multipliers } : {}),
      ...(counter ? { counter } : {}),
      ...e,
    } as Ratio);
  }

  return { ...(flat ? { value: flat } : {}), ratios: normalisedRatios, isPercentage };
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * What a proposal was read FROM, kept beside it because the entry cannot carry it.
 *
 * The row label is the source's own name for the number, and gate D2 needs it to line a stored
 * value up with the wiki's own rendering of the same row. `CuratedDefensiveEffect` has no label
 * field, so this lives in the run report rather than in the entry — which is itself the clearest
 * statement of what the missing field costs.
 */
export interface ProposalSource {
  key: string;
  kind: CuratedDefensiveEffect['kind'];
  label: string;
  raw: string;
  maxRank: number;
}

export interface ProposalRun {
  proposals: CuratedDefensiveEffect[];
  /** Aligned with `proposals` by index. */
  sources: ProposalSource[];
  refusals: Refusal[];
  /** Non-champion rows dropped before counting a kind's rows. Reported, never silent. */
  nonChampionRowsDropped: Array<{ key: string; kind: Kind; label: string }>;
}

export interface ProposeOptions {
  patch: string;
  fetched: string;
}

/**
 * The rank count for a page's defensive rows.
 *
 * Same rule the damage path uses (DATA-SOURCES §29 defect 3): a second-form ability is ranked by
 * the ability it follows, and the template says so in a header. The count is taken only when the
 * header AND an explicit step count agree, so it is corroborated twice rather than inferred from
 * the length of a list.
 */
export function maxRankForPage(page: CachedPage): number {
  const fields = parseFields(page.wikitext);
  const vars = parseVardefines(page.wikitext);
  const allText = Object.values(fields).join('\n');
  if (/scales\s+with\b[\s\S]{0,80}?\brank\b/i.test(allText)) {
    for (const row of statRows(fields)) {
      const block = findBlocks(row.value, 'ap')[0];
      if (!block) continue;
      const n = statedStepCount(substituteVars(block.inner, vars));
      if (n !== undefined && n >= 1) return n;
    }
  }
  return maxRankFor(page.slot as AbilitySlot);
}

export function proposeForPage(
  page: CachedPage,
  confirmed: ConfirmedEffect,
  opts: ProposeOptions,
): ProposalRun {
  const run: ProposalRun = { proposals: [], sources: [], refusals: [], nonChampionRowsDropped: [] };
  const scan = scanPage(page);
  const fields = parseFields(page.wikitext);
  const vars = parseVardefines(page.wikitext);
  const maxRank = maxRankForPage(page);
  const key = confirmed.key;

  for (const censusKind of confirmed.kinds) {
    const kind = KIND_MAP[censusKind];
    if (kind === null) {
      run.refusals.push({
        key,
        kind: censusKind,
        refusalClass: 'not-a-defensive-kind',
        blockedBy: ['not-a-defensive-kind'],
        detail: `census kind '${censusKind}' is counted separately and never proposed`,
      });
      continue;
    }

    // THE TWO KINDS THAT ARE COMPLETE WITHOUT A NUMBER.
    //
    // An immunity and a spell shield have no amount, and that is a property of the effect rather
    // than a gap in our reading: the source states "invulnerable" or "blocks the next hostile
    // ability", and there is no figure anywhere to find. The wiki never gives them a leveling row
    // either — `DEFENSIVE_STAT_LABELS` has no label that names one, because none exists.
    //
    // So these are proposed with NO `value` and NO `valueByReference`, which is what the contract
    // means by "absent for the 17 with none". Nothing is invented; the condition carries the whole
    // meaning, and the person who read the sentence wrote it.
    if (kind === 'immunity' || kind === 'spell-shield') {
      run.proposals.push({
        champion: page.champion,
        slot: page.slot,
        abilityName: page.abilityName,
        kind,
        activation: confirmed.activation,
        ...(confirmed.activation === 'always-active'
          ? {}
          : { condition: confirmed.activationEvidence }),
        verification: 'derived',
        provenance: {
          source: `Template:Data ${page.champion}/${page.abilityName} — description prose (no amount is stated, and none exists)`,
          url: `https://wiki.leagueoflegends.com/en-us/Template:Data_${encodeURIComponent(
            page.champion,
          )}/${encodeURIComponent(page.abilityName)}`,
          patch: opts.patch,
          fetched: opts.fetched,
        },
      });
      run.sources.push({ key, kind, label: '', raw: '', maxRank });
      continue;
    }

    // Non-champion rows go first. This product is champion-versus-champion (SPECIFICATION §5),
    // and the damage path already drops these rows for the same reason.
    const all = scan.statRows.filter((r) => r.kind === censusKind);
    const rows = all.filter((r) => {
      if (!NON_CHAMPION_ROW.test(r.label)) return true;
      run.nonChampionRowsDropped.push({ key, kind: censusKind, label: r.label });
      return false;
    });

    if (rows.length === 0) {
      run.refusals.push({
        key,
        kind: censusKind,
        refusalClass: 'no-leveling-row',
        blockedBy: ['no-leveling-row'],
        detail:
          all.length === 0
            ? 'no leveling row of this kind on the page'
            : `every row of this kind is a non-champion row (${all.map((r) => r.label).join(', ')})`,
      });
      continue;
    }

    // EVERY ROW IS READ, EVEN WHEN THE PAIR IS ALREADY BLOCKED. The blocker set is the
    // measurement; stopping at the first reason would make the counts an artefact of check order.
    const perRow = rows.map((r) => {
      const reasons: RefusalClass[] = [];
      const notes: string[] = [];
      const labelWhy = labelRefusal(kind, r.label);
      if (labelWhy) {
        reasons.push(labelWhy);
        notes.push(`row "${r.label}"`);
      }
      const parsed = parseDefensiveRow(r.value, maxRank, vars);
      if (parsed.refusal) {
        reasons.push(parsed.refusal.refusalClass);
        notes.push(`row "${r.label}": ${parsed.refusal.detail}`);
      } else {
        // THE UNIT. The shape says nothing about whether a number is a percentage or an amount,
        // so the only readable entries are the ones where the kind admits a single reading:
        //   damage-reduction — every row-stated one is a percentage (measured: 6 of 6)
        //   shield / heal / max-health-grant — an amount of health
        // A row that contradicts its kind's reading is refused rather than stored under it.
        const wantsPercentage = kind === 'damage-reduction';
        if (parsed.value !== undefined && parsed.isPercentage !== wantsPercentage) {
          reasons.push(wantsPercentage ? 'unit-not-expressible' : 'not-an-amount');
          notes.push(
            `row "${r.label}" states ${parsed.isPercentage ? 'a percentage' : 'a flat amount'} ` +
              `and kind '${kind}' can only be read as ${wantsPercentage ? 'a percentage' : 'an amount'}`,
          );
        }
      }
      return { row: r, parsed, reasons, notes };
    });

    const blockers = new Set<RefusalClass>(perRow.flatMap((p) => p.reasons));
    if (rows.length > 1) blockers.add('multiple-values-one-field');
    if (blockers.size > 0) {
      const notes = perRow.flatMap((p) => p.notes);
      run.refusals.push({
        key,
        kind: censusKind,
        refusalClass: CLASS_ORDER.find((c) => blockers.has(c))!,
        blockedBy: CLASS_ORDER.filter((c) => blockers.has(c)),
        detail:
          (rows.length > 1 ? `${rows.length} rows: ${rows.map((r) => r.label).join(' | ')}. ` : '') +
          notes.join('; '),
      });
      continue;
    }

    const row = rows[0]!;
    const parsed = perRow[0]!.parsed;

    // OWNERS THE SOURCE STATES FOR NOBODY. Recorded as permanently unresolvable and forced to
    // 'incomplete' — never guessed from a verb or a convention (§16).
    const unresolvable: Unresolvable[] = [];
    parsed.ratios.forEach((r, ri) => {
      if (requiresOwner(r.stat) && (r.owner === undefined || r.owner === 'unresolved')) {
        unresolvable.push({
          field: `ratios[${ri}].owner (${r.stat})`,
          why: `the source names ${r.stat} and never says whose, and no other source states it`,
        });
      }
      (r.multipliers ?? []).forEach((m, mi) => {
        if (requiresOwner(m.per) && (m.owner === undefined || m.owner === 'unresolved')) {
          unresolvable.push({
            field: `ratios[${ri}].multipliers[${mi}].owner (${m.per})`,
            why: `the source names ${m.per} and never says whose, and no other source states it`,
          });
        }
      });
    });

    const effect: CuratedDefensiveEffect = {
      champion: page.champion,
      slot: page.slot,
      abilityName: page.abilityName,
      kind,
      activation: confirmed.activation,
      ...(confirmed.activation === 'always-active'
        ? {}
        : { condition: confirmed.activationEvidence }),
      ...(parsed.value ? { value: parsed.value } : {}),
      ...(parsed.ratios.length > 0 ? { ratios: parsed.ratios } : {}),
      ...(unresolvable.length > 0 ? { unresolvable } : {}),
      // Nothing a generator produces is 'verified'. An entry carrying a fact no source states is
      // 'incomplete' and stays there until the SOURCE changes.
      verification: unresolvable.length > 0 ? 'incomplete' : 'derived',
      provenance: {
        source: `Template:Data ${page.champion}/${page.abilityName} — leveling row "${row.label}"`,
        url: `https://wiki.leagueoflegends.com/en-us/Template:Data_${encodeURIComponent(
          page.champion,
        )}/${encodeURIComponent(page.abilityName)}`,
        patch: opts.patch,
        fetched: opts.fetched,
      },
    };
    run.proposals.push(effect);
    run.sources.push({ key, kind, label: row.label, raw: row.value, maxRank });
  }

  // `fields` is read for its side effect of proving the page parses; keep the reference honest.
  void fields;
  return run;
}

export function proposeAll(
  pages: CachedPage[],
  confirmed: readonly ConfirmedEffect[],
  opts: ProposeOptions,
): ProposalRun {
  const byKey = new Map<string, CachedPage>();
  for (const p of pages) byKey.set(`${p.champion}/${p.slot}/${p.abilityName}`, p);
  const out: ProposalRun = { proposals: [], sources: [], refusals: [], nonChampionRowsDropped: [] };
  for (const c of confirmed) {
    const page = byKey.get(c.key);
    if (!page) continue; // the census's integrity check reports a key that names no page
    const r = proposeForPage(page, c, opts);
    out.proposals.push(...r.proposals);
    out.sources.push(...r.sources);
    out.refusals.push(...r.refusals);
    out.nonChampionRowsDropped.push(...r.nonChampionRowsDropped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// GATE D1 — the schema gate for defensive entries.
//
// `gateSchema` in src/types/validate-curated.ts walks `file.abilities` and does not look at
// `file.defensiveEffects` at all, so nothing in the project validates a defensive entry. This is
// the stand-in until that gate exists, and it is deliberately strict: it enforces the same owner
// rule §16 enforces on damage ratios, and it refuses any entry claiming better than its evidence.
// ---------------------------------------------------------------------------

export interface GateFinding {
  entry: string;
  message: string;
}

export function gateDefensiveSchema(effects: CuratedDefensiveEffect[]): {
  checked: number;
  passed: number;
  failed: number;
  findings: GateFinding[];
} {
  const findings: GateFinding[] = [];
  const seen = new Set<string>();
  const KINDS = new Set([
    'damage-reduction',
    'type-specific-reduction',
    'resistance-grant',
    'shield',
    'spell-shield',
    'immunity',
    'execute-threshold',
    'heal',
    'max-health-grant',
  ]);
  for (const e of effects) {
    const key = `${e.champion}/${e.slot}/${e.abilityName}/${e.kind}`;
    const push = (message: string) => findings.push({ entry: key, message });
    if (seen.has(key)) push('duplicate entry — one champion/slot/ability/kind may appear once');
    seen.add(key);
    if (!e.champion) push('missing champion');
    if (!['P', 'Q', 'W', 'E', 'R'].includes(e.slot)) push(`bad slot '${e.slot}'`);
    if (!e.abilityName) push('missing abilityName');
    if (!KINDS.has(e.kind)) push(`bad kind '${e.kind}'`);
    if (!['always-active', 'conditional', 'not-stated'].includes(e.activation)) {
      push(`bad activation '${e.activation}'`);
    }
    if (e.activation !== 'always-active' && !e.condition) {
      push('a conditional or not-stated effect must state its condition');
    }
    if (e.verification === 'verified') push("nothing a generator writes may claim 'verified'");
    if (!['derived', 'incomplete', 'no-damage'].includes(e.verification)) {
      push(`bad verification '${e.verification}'`);
    }
    if (e.value !== undefined && e.valueByReference !== undefined) {
      push('a value and a by-reference value are two answers to one question');
    }
    if (!e.provenance?.source || !e.provenance?.patch) push('provenance needs source and patch');
    for (const [i, u] of (e.unresolvable ?? []).entries()) {
      if (!u.field || !u.why) push(`unresolvable[${i}] must name the field and say why`);
    }
    // PERMANENT IS NOT PENDING, and it may not read as understood.
    if ((e.unresolvable?.length ?? 0) > 0 && e.verification !== 'incomplete') {
      push("carries an unresolvable fact but is not 'incomplete'");
    }
    for (const [i, r] of (e.ratios ?? []).entries()) {
      if (requiresOwner(r.stat) && r.owner === undefined) {
        push(`ratios[${i}] on '${r.stat}' states no owner — §16 refuses it`);
      }
      if (r.stat === 'stacks' && !r.counter) push(`ratios[${i}] on 'stacks' names no counter`);
    }
    // An explicit list is self-describing; a linear one is not, and this shape has no maxRank.
    if (e.value?.scaling === 'linear') {
      push('a linear value needs a rank count the shape does not carry — store it explicit');
    }
    // AN EFFECT WITH NO MAGNITUDE AT ALL is only honest for the two kinds that have none. Any
    // other kind with nothing in `value`, `ratios` or `valueByReference` is a silent gap wearing
    // the shape of a complete entry.
    const hasMagnitude =
      e.value !== undefined || (e.ratios?.length ?? 0) > 0 || e.valueByReference !== undefined;
    if (!hasMagnitude && e.kind !== 'immunity' && e.kind !== 'spell-shield') {
      push(`kind '${e.kind}' states no amount, no ratio and no by-reference value`);
    }
  }
  const failed = new Set(findings.map((f) => f.entry)).size;
  return { checked: effects.length, passed: effects.length - failed, failed, findings };
}

// ---------------------------------------------------------------------------
// GATE D2 — the round trip, against the wiki's OWN rendering of the same row.
//
// The same check gate 2 makes on damage, applied to defensive rows: ask the wiki's Lua to expand
// the ability box, then compare the numbers it printed against the numbers we stored. It is the
// only check here that is independent of our own parser — everything else in this file reads the
// wikitext with the same code that produced the entry, so it could only ever agree with itself.
// ---------------------------------------------------------------------------

export interface DefensiveRoundTrip {
  entry: string;
  label: string;
  /** 'matched' | 'mismatched' | 'no-such-row' | 'level-scaled-not-compared' | 'nothing-to-compare' */
  outcome: 'matched' | 'mismatched' | 'no-such-row' | 'level-scaled-not-compared' | 'nothing-to-compare';
  detail?: string;
}

function normaliseLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function roundTripDefensive(
  effect: CuratedDefensiveEffect,
  source: ProposalSource,
  rendered: RenderedRow[],
): DefensiveRoundTrip {
  const entry = `${effect.champion}/${effect.slot}/${effect.abilityName}/${effect.kind}`;
  const row = rendered.find((r) => normaliseLabel(r.label) === normaliseLabel(source.label));
  if (!row) {
    return {
      entry,
      label: source.label,
      outcome: 'no-such-row',
      detail: `the wiki rendered no row called "${source.label}" (rendered: ${rendered
        .map((r) => r.label)
        .join(', ')
        .slice(0, 160)})`,
    };
  }
  if (effect.value !== undefined && isLevelScaled(effect.value)) {
    // The box prints a level-scaled value as one "(based on level)" figure, so there is no
    // per-rank series to line up. Counted separately, never counted as a pass.
    return { entry, label: source.label, outcome: 'level-scaled-not-compared' };
  }

  const problems: string[] = [];
  let comparedSomething = false;
  if (effect.value !== undefined && row.values.length > 0) {
    comparedSomething = true;
    const mine = expandByRank(effect.value, source.maxRank);
    const cmp = compareAtDisplayPrecision(row.values, mine);
    for (const d of cmp.differences) {
      problems.push(`base rank ${d.index + 1}: wiki ${d.expected}, stored ${d.actual}`);
    }
  } else if (effect.value !== undefined && row.values.length === 0) {
    problems.push('we stored a flat value and the wiki printed none');
  } else if (effect.value === undefined && row.values.length > 0) {
    problems.push(`the wiki printed a flat series (${row.values.join('/')}) and we stored none`);
  }

  for (const [i, r] of (effect.ratios ?? []).entries()) {
    const sourceRatio = row.ratios[i];
    if (!sourceRatio || sourceRatio.length === 0) {
      problems.push(`ratio ${i} (${r.stat}): the wiki printed no matching ratio group`);
      continue;
    }
    if (isLevelScaled(r)) continue;
    comparedSomething = true;
    const mine = expandByRank(r as Scaling, source.maxRank);
    const cmp =
      sourceRatio.length === 1
        ? compareAtDisplayPrecision(mine.map(() => sourceRatio[0]!), mine)
        : compareAtDisplayPrecision(sourceRatio, mine);
    for (const d of cmp.differences) {
      problems.push(`ratio ${i} (${r.stat}) rank ${d.index + 1}: wiki ${d.expected}, stored ${d.actual}`);
    }
  }
  // The wiki printing MORE ratio groups than we stored is a dropped term, which is exactly the
  // failure mode gate 2 exists to catch.
  if (row.ratios.length > (effect.ratios ?? []).length) {
    problems.push(
      `the wiki printed ${row.ratios.length} ratio group(s) and we stored ${(effect.ratios ?? []).length}`,
    );
  }

  if (problems.length > 0) {
    return { entry, label: source.label, outcome: 'mismatched', detail: problems.join('; ') };
  }
  if (!comparedSomething) return { entry, label: source.label, outcome: 'nothing-to-compare' };
  return { entry, label: source.label, outcome: 'matched' };
}

/**
 * The half the ability box cannot check: a value stated on the CHAMPION-LEVEL axis.
 *
 * The box prints those as a single "(based on level)" figure, so `roundTripDefensive` has nothing
 * to line up and says so rather than passing them. The wiki does expand them — it attaches the
 * whole per-level series to the rendered `{{pp}}` span as `data-bot-values` — so the block is
 * rendered on its own and compared breakpoint by breakpoint, exactly as the damage path does.
 */
export async function roundTripLevelScaledDefensive(
  effect: CuratedDefensiveEffect,
  source: ProposalSource,
  fetchImpl: typeof fetch = fetch,
): Promise<DefensiveRoundTrip> {
  const entry = `${effect.champion}/${effect.slot}/${effect.abilityName}/${effect.kind}`;
  const block = findLevelBlocks(source.raw)[0];
  if (!block || effect.value === undefined) {
    return { entry, label: source.label, outcome: 'nothing-to-compare' };
  }
  const [wiki] = await renderLevelBlocks([{ name: block.name, inner: block.inner }], fetchImpl);
  const ours = levelBreakpoints(effect.value).map((b) => b.value);
  if (!wiki || wiki.length < ours.length) {
    return {
      entry,
      label: source.label,
      outcome: 'level-scaled-not-compared',
      detail: 'the wiki would not expand the block, so there is no evidence either way',
    };
  }
  const differences = ours
    .map((v, k) => ({ level: k + 1, wiki: wiki[k]!, stored: v }))
    .filter((d) => !agreesAtDisplayPrecision(d.wiki, d.stored));
  if (differences.length === 0) return { entry, label: source.label, outcome: 'matched' };
  return {
    entry,
    label: source.label,
    outcome: 'mismatched',
    detail: differences
      .slice(0, 4)
      .map((d) => `level ${d.level}: wiki ${d.wiki}, stored ${d.stored}`)
      .join('; '),
  };
}

/** Run gate D2 over a whole proposal set. One render request per ability page, reused. */
export async function gateD2(
  run: ProposalRun,
  fetchImpl: typeof fetch = fetch,
): Promise<DefensiveRoundTrip[]> {
  const cacheByPage = new Map<string, RenderedRow[]>();
  const out: DefensiveRoundTrip[] = [];
  for (const [i, effect] of run.proposals.entries()) {
    const source = run.sources[i]!;
    if (source.label === '') {
      // A value-free kind: there is no row to render and no number to compare. Counted as
      // 'nothing-to-compare' rather than as a pass, so the round-trip figure never flatters
      // itself with entries nothing checked.
      out.push({ entry: `${effect.champion}/${effect.slot}/${effect.abilityName}/${effect.kind}`, label: '', outcome: 'nothing-to-compare' });
      continue;
    }
    if (effect.value !== undefined && isLevelScaled(effect.value)) {
      out.push(await roundTripLevelScaledDefensive(effect, source, fetchImpl));
      continue;
    }
    const pageKey = `${effect.champion}/${effect.abilityName}`;
    if (!cacheByPage.has(pageKey)) {
      // `readPercentSeries` — the wiki prints "55 / 65 / 75%" and the default reader keeps two
      // of the three. Defensive rows are percentages far more often than damage rows are, so
      // gate D2 asks for the corrected reading. See RenderReadOptions for why it is not global.
      cacheByPage.set(
        pageKey,
        await renderAbility(effect.champion, effect.abilityName, fetchImpl, {
          readPercentSeries: true,
        }),
      );
    }
    out.push(roundTripDefensive(effect, source, cacheByPage.get(pageKey)!));
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * WHAT ONE CONTRACT FIELD WOULD RELEASE.
 *
 * DEFINITION: a refused (page, kind) pair is released by a set of classes when EVERY class
 * blocking it is in that set. Nothing else changes — the row still has to parse, the owner rule
 * still applies, and a released pair is still `derived` at best.
 *
 * This is reported instead of "how often did class X fire", because that figure depends on the
 * order the checks run in and would move if the order did.
 */
export function releasedBy(refusals: Refusal[], classes: RefusalClass[]): Refusal[] {
  const set = new Set(classes);
  return refusals.filter((r) => r.blockedBy.length > 0 && r.blockedBy.every((c) => set.has(c)));
}

function tally<T extends string>(items: Array<{ [k: string]: unknown }>, field: string): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const i of items) {
    const k = String(i[field]) as T;
    out[k] = ((out[k] as number | undefined) ?? 0) + 1;
  }
  return out;
}

if (process.argv[1]?.endsWith('defensive-propose.ts')) {
  const offline = process.argv.includes('--offline');
  const cache = await readCache();
  const manifest = JSON.parse(await readFile('public/data/manifest.json', 'utf8')) as {
    patch: string;
  };
  const run = proposeAll(cache.pages, CONFIRMED, {
    patch: manifest.patch,
    fetched: cache.fetchedOn,
  });

  // GATE D2 RUNS BY DEFAULT, and its verdict is applied to the entries before they are written.
  // A proposal the round trip disagrees with may not go out reading 'derived': that status says
  // "extracted from source, not independently confirmed", and this IS the independent check.
  let d2: DefensiveRoundTrip[] = [];
  if (!offline) {
    process.stderr.write(`gate D2: rendering ${run.proposals.length} rows on the wiki…\n`);
    d2 = await gateD2(run);
    d2.forEach((r, i) => {
      if (r.outcome === 'mismatched') run.proposals[i]!.verification = 'incomplete';
    });
  }
  const gate = gateDefensiveSchema(run.proposals);

  const confirmedPageKinds = CONFIRMED.flatMap((c) => c.kinds.map((k) => ({ key: c.key, kind: k })));
  const out = {
    what:
      'DRAFT CuratedDefensiveEffect entries proposed from the confirmed defensive population ' +
      '(defensive-confirmed.ts) over the cached wikitext of every ability page. A proposal, not ' +
      'a curated file: nothing here is verified, and nothing here has been written to /curated/.',
    generatedOn: new Date().toISOString().slice(0, 10),
    coverage: {
      pagesInCache: cache.distinctPages,
      fetchChunksFailed: cache.failedChunks.length,
      complete: cache.failedChunks.length === 0 && cache.distinctPages === 937,
    },
    definitions: {
      confirmedEffect:
        'one page in defensive-confirmed.ts — a page whose sentences a person read and accepted.',
      effectKindPair:
        'one (page, kind) pair. A page carrying a shield AND a heal is ONE confirmed effect and ' +
        'TWO entries, because the contract holds one kind per entry.',
      proposal:
        'a (page, kind) pair written as a CuratedDefensiveEffect. Every one is derived at best.',
      refusal:
        'a (page, kind) pair NOT written, with the class naming the fact the entry could not ' +
        'carry. Refusal classes are definitions, not excuses: each names the contract field or ' +
        'the source reading that would release it.',
      refusalClasses: REFUSAL_CLASSES,
    },
    population: {
      confirmedPages: CONFIRMED.length,
      confirmedEffectKindPairs: confirmedPageKinds.length,
      proposed: run.proposals.length,
      refused: run.refusals.length,
      nonChampionRowsDropped: run.nonChampionRowsDropped.length,
    },
    byVerification: tally(run.proposals as unknown as Array<Record<string, unknown>>, 'verification'),
    proposedByKind: tally(run.proposals as unknown as Array<Record<string, unknown>>, 'kind'),
    refusedByFirstClass: tally(run.refusals as unknown as Array<Record<string, unknown>>, 'refusalClass'),
    refusedByAnyBlocker: Object.fromEntries(
      CLASS_ORDER.map((c) => [c, run.refusals.filter((r) => r.blockedBy.includes(c)).length]),
    ),
    whatOneFieldWouldRelease: {
      note:
        'DEFINITION: a refused (page, kind) pair is released by a set of classes when every ' +
        'class blocking it is in that set. Counted in pairs, and a released pair is still ' +
        '`derived` at best. Nothing here is a proposal to relax a rule — it sizes the gap.',
      byClassAlone: Object.fromEntries(
        CLASS_ORDER.map((c) => [c, releasedBy(run.refusals, [c]).length]),
      ),
      shapeFieldsTogether: {
        what:
          'a label + a relation + a granted stat + a damage type + an over-time flag + a unit — ' +
          'the six facts a defensive row states that the entry cannot carry',
        pairs: releasedBy(run.refusals, [
          'multiple-values-one-field',
          'needs-relation',
          'needs-granted-stat',
          'needs-damage-type',
          'needs-over-time',
          'unit-not-expressible',
          'not-an-amount',
        ]).length,
      },
    },
    gateD1: gate,
    gateD2: {
      what:
        "the round trip against the wiki's own rendering of the same leveling row — the only " +
        'check here that is independent of the parser that produced the entry. Skipped entirely ' +
        'with --offline, in which case this is empty and no entry has round-trip evidence.',
      ran: !offline,
      outcomes: tally(d2 as unknown as Array<Record<string, unknown>>, 'outcome'),
      results: d2,
    },
    refusals: run.refusals,
    nonChampionRowsDropped: run.nonChampionRowsDropped,
    defensiveEffects: run.proposals,
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);

  console.log('\n=== DEFENSIVE ENTRY PROPOSALS ===');
  console.log(
    `coverage: ${cache.distinctPages} ability pages, ${cache.failedChunks.length} fetch chunk(s) failed`,
  );
  console.log(
    `population: ${CONFIRMED.length} confirmed pages -> ${confirmedPageKinds.length} (page, kind) pairs`,
  );
  console.log(`proposed: ${run.proposals.length}   refused: ${run.refusals.length}`);
  console.log('\nproposed by kind:');
  for (const [k, n] of Object.entries(out.proposedByKind)) console.log(`  ${k.padEnd(26)} ${n}`);
  console.log('\nproposed by verification status:');
  for (const [k, n] of Object.entries(out.byVerification)) console.log(`  ${k.padEnd(26)} ${n}`);
  console.log('\nrefused — pairs blocked by each class (a pair can be blocked by several):');
  for (const [k, n] of Object.entries(out.refusedByAnyBlocker).sort((a, b) => b[1] - a[1])) {
    if (n > 0) console.log(`  ${k.padEnd(26)} ${n}`);
  }
  console.log('\npairs released if that class alone were expressible:');
  for (const [k, n] of Object.entries(out.whatOneFieldWouldRelease.byClassAlone).sort(
    (a, b) => b[1] - a[1],
  )) {
    if (n > 0) console.log(`  ${k.padEnd(26)} ${n}`);
  }
  console.log(
    `  all six shape facts together: ${out.whatOneFieldWouldRelease.shapeFieldsTogether.pairs}`,
  );
  console.log(
    `\ngate D1 (schema): ${gate.passed} passed, ${gate.failed} failed of ${gate.checked} checked`,
  );
  for (const f of gate.findings.slice(0, 20)) console.log(`   ${f.entry}: ${f.message}`);
  if (offline) {
    console.log('\ngate D2 (round trip): NOT RUN (--offline). No entry here has round-trip evidence.');
  } else {
    console.log('\ngate D2 (round trip against the wiki\'s own rendering):');
    for (const [k, n] of Object.entries(out.gateD2.outcomes)) console.log(`  ${k.padEnd(26)} ${n}`);
    for (const r of d2.filter((x) => x.outcome !== 'matched')) {
      console.log(`   ${r.outcome}: ${r.entry} — ${(r.detail ?? '').slice(0, 140)}`);
    }
  }
  console.log(`\nwrote ${OUT}`);
}
