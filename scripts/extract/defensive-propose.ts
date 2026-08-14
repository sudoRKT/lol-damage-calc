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
// A row whose meaning depends on a fact the entry cannot carry is refused, with a class, and the
// classes are counted — the count is the measurement of exactly which contract fields would
// release which entries. Refusing is cheap and reversible; a plausible wrong number in the
// defender's stat block is neither.
//
// SIX OF THOSE CLASSES WERE ONE MISSING FIELD EACH, AND THE FIELDS LANDED ON 2026-08-14
// (DATA-SOURCES §42.5). `CuratedDefensiveEffect` now carries `label`, `id` + `relation`,
// `grantedStat`, `appliesToDamageType`, `overTime` and `unit`, and gate 1 validates every one of
// them. This file populates them — but NOT from the row label. The label rules here are a
// DETECTOR: they say a row needs reading. `defensive-shapes.ts` holds what a person found when
// they read it, and a pair that trips a label rule without a reading is REPORTED
// (`shape-not-read`), never written. Three rows would have been stored wrongly by their labels
// alone, and each one is named in that file.
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
  gateSchema,
} from '../../src/types/validate-curated.ts';

import {
  NON_CHAMPION_ROW,
  RANGE_QUALIFIER,
  EMPOWERED_QUALIFIER,
  isMultiplierGroup,
  parseMultiplier,
  parseRatio,
  slugify,
} from './classify.ts';
import { CONFIRMED, type ConfirmedEffect } from './defensive-confirmed.ts';
import { ALLY_ONLY, RECIPIENT_NOT_READ, recipientRefusal } from './ally-only.ts';
import {
  READ_REFUSAL_CLASSES,
  REFUSED_ON_READING,
  SHAPES_READ,
  readingFor,
  type ReadRefusalClass,
  type RowReading,
} from './defensive-shapes.ts';
import { flatten, scanPage, type Kind } from './defensive.ts';
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
  | 'shape-not-read'
  | 'reading-stale'
  | ReadRefusalClass
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
  'shape-not-read':
    'THE FIELD EXISTS AND NOBODY HAS READ THE ROW. The row states one of the six facts the ' +
    'contract gained on 2026-08-14 — which resistance, which damage type, a recurrence, a ' +
    'relation to a sibling row, or a unit that is a rate rather than an amount — and the pair is ' +
    'not in `defensive-shapes.ts`. A label is a candidate, never a decision (CLAUDE.md: a ' +
    'detector proposes, a person confirms, and storage is gated on the confirmed population), ' +
    'so it is REPORTED for someone to read rather than stored on the strength of its wording. ' +
    'The classes listed beside it name which facts the label states.',
  'reading-stale':
    'a reading in `defensive-shapes.ts` no longer matches the page — a label it names is gone, ' +
    'or a row of that kind appeared that it does not name. The reading is evidence about one ' +
    'revision of one page, so a page that has moved under it is refused loudly rather than ' +
    'stored against a reading of something else.',
  ...READ_REFUSAL_CLASSES,
  'multiple-values-one-field':
    'the kind has more than one leveling row on the page. Two entries of the same kind are told ' +
    'apart by `label` and combined by `relation` — Leona W grants 20-50 armor AND 20-50 magic ' +
    'resistance, and picking one row silently drops the other. Now storable, but only for a pair ' +
    'a person has read: it takes a reading to know whether two rows add or alternate.',
  'needs-granted-stat':
    'a resistance grant must say WHICH resistance. `kind: resistance-grant` plus a number cannot ' +
    'distinguish 7 armor from 7 magic resistance, and that is the difference between mitigating ' +
    'physical and magic damage. Now storable in `grantedStat`, from a reading — "Bonus ' +
    'Resistances" is one figure for both, and only the sentence says so.',
  'needs-damage-type':
    'the effect applies to one damage type only — a magic shield, a physical-damage reduction. ' +
    'Now storable in `appliesToDamageType`, from a reading. Absent means all types, never ' +
    '"unknown", so a type that was not read may not be left blank.',
  'needs-over-time':
    'the row states a per-tick or whole-channel figure, so the effect RECURS. ' +
    'SPECIFICATION §3.8 keeps damage over time out of the burst total precisely because the two ' +
    'are different facts; the same is true of a heal spread over a channel. Now storable in ' +
    '`overTime`, from a reading — the word "total" also means "across every target hit" ' +
    '(Vladimir R), which is not over time at all.',
  'needs-relation':
    'the row is a Minimum/Maximum or base/empowered variant of another row on the same page. ' +
    'Now storable in `relation`, from a reading: summing two alternatives hands the defender ' +
    'both, and only the sentence says which rows alternate.',
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
  'reading-stale',
  'count-scaled-value',
  'term-outside-the-row',
  'recipient-not-expressible',
  'shape-not-read',
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
/**
 * A damage type named in the label — "Magic Shield Strength", "Physical Damage Reduction".
 *
 * NOT FOLLOWED BY "resist": "Bonus **Magic** Resistance" names a RESISTANCE, not a damage type,
 * and `grantedStat` already carries its whole meaning. The wide pattern was caught by this file's
 * own label-fact self-check, which reported four entries "stating a damage type they do not
 * carry" — the entries were right and the pattern was wrong.
 *
 * MEASURED BEFORE THE CHANGE, over the rows of all 226 confirmed pages: the wide pattern matches
 * **12** rows, the narrow one **6**. All six it drops are "... Magic Resistance"; all six it
 * keeps are a real damage type (Physical/Magic Damage Reduction on Galio W and Amumu E, Magic
 * Shield Strength on Galio W, Kassadin Q and Morgana E). No stored value changes either way —
 * `appliesToDamageType` is written only from a reading — so this narrows what gets REPORTED as
 * needing a reading, and nothing else.
 */
export const TYPE_IN_LABEL = /\b(physical|magic|true)\b(?!\s+resist)/i;

/**
 * EVERY shape fact this label states, or an empty list when it states none.
 *
 * WHAT THIS IS NOW. Until the contract gained the six fields these were refusals outright. They
 * are now the DETECTOR half of the rule: a label naming one of these facts says the row cannot be
 * stored from its label alone and needs a person to read the ability's sentence. `defensive-shapes.ts`
 * is that reading. A pair that trips one of these and is not in the reading is refused
 * `shape-not-read` and REPORTED — never widened into.
 */
export function labelFacts(kind: CuratedDefensiveEffect['kind'], label: string): RefusalClass[] {
  const l = label.trim();
  const out: RefusalClass[] = [];
  if (kind === 'resistance-grant') out.push('needs-granted-stat');
  // A resistance grant is never type-specific: `grantedStat` says which resistance, and a damage
  // type on top of it would be a second, contradictory answer to the same question.
  if (kind === 'type-specific-reduction' || (kind !== 'resistance-grant' && TYPE_IN_LABEL.test(l))) {
    out.push('needs-damage-type');
  }
  if (NOT_AN_AMOUNT_LABEL.test(l)) out.push('not-an-amount');
  if (OVER_TIME_LABEL.test(l)) out.push('needs-over-time');
  if (RANGE_QUALIFIER.test(l) || EMPOWERED_QUALIFIER.test(l)) out.push('needs-relation');
  return out;
}

/**
 * The most specific fact a label states, or `null`. Kept as the single-reason view for reading;
 * `labelFacts` is what the counts are taken from.
 */
export function labelRefusal(
  kind: CuratedDefensiveEffect['kind'],
  label: string,
): RefusalClass | null {
  const facts = labelFacts(kind, label);
  return CLASS_ORDER.find((c) => facts.includes(c)) ?? null;
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
 * What a proposal was read FROM. The label is now ON the entry as well; this keeps the raw
 * wikitext and the rank count beside it, which gate D2 needs to line a stored value up with the
 * wiki's own rendering of the same row.
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
  /**
   * Rows a reading marks as granting to somebody who is NOT the defender — Braum W's "Ally Bonus
   * Armor" beside his "Self Bonus Armor". Dropped for the same reason a non-champion row is
   * (SPECIFICATION §5: one defender, champion versus champion), and reported for the same reason:
   * a drop nobody can see is a silent decision.
   */
  otherRecipientRowsDropped: Array<{ key: string; kind: Kind; label: string }>;
  /** Entries NOT stored because they protect somebody who is not the defender, each with the
   *  source sentence that establishes it. Two reasons, kept apart: `ally-only` is a decided
   *  fact, `recipient-not-read` is revisitable (SPECIFICATION §8's permanent vs pending). */
  recipientDropped: Array<{
    key: string;
    kind: Kind;
    label: string;
    reason: 'ally-only' | 'recipient-not-read';
    sourceSays: string;
    why: string;
  }>;
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
  const run: ProposalRun = {
    proposals: [],
    sources: [],
    refusals: [],
    nonChampionRowsDropped: [],
    otherRecipientRowsDropped: [],
  recipientDropped: [],
  };
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
      // THE SAME RECIPIENT RULE APPLIES TO A VALUE-FREE EFFECT. Kalista R makes the OATHSWORN
      // invulnerable and Kalista nothing; an immunity granted to somebody else is no more the
      // defender's than a shield is. Missed on the first pass because this branch pushes before
      // the row loop the other filter sits in — which is why the removal is measured by the
      // ENTRIES that left, not by the length of the read list.
      const notOursHere = recipientRefusal(page.champion, page.slot, kind);
      if (notOursHere) {
        run.recipientDropped.push({
          key,
          kind: censusKind,
          label: '',
          reason: notOursHere.reason,
          sourceSays: notOursHere.detail.sourceSays,
          why: notOursHere.detail.why,
        });
        continue;
      }
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

    // A PAIR A PERSON READ AND REFUSED. Recorded here rather than in a comment, because a fact
    // the contract cannot hold is a measurement, not an omission.
    const readRefusal = REFUSED_ON_READING.find((r) => r.key === key && r.kind === censusKind);
    if (readRefusal) {
      run.refusals.push({
        key,
        kind: censusKind,
        refusalClass: readRefusal.refusalClass,
        blockedBy: [readRefusal.refusalClass],
        detail: readRefusal.why,
      });
      continue;
    }

    const reading = readingFor(key, censusKind);

    // Non-champion rows go first. This product is champion-versus-champion (SPECIFICATION §5),
    // and the damage path already drops these rows for the same reason.
    //
    // WHERE A READING EXISTS IT NAMES THE ROWS, and that list is authoritative — that is how
    // Amumu E's and Galio W's "Physical Damage Reduction" rows reach the
    // `type-specific-reduction` kind a person confirmed them as, when the label map files them
    // under `damage-reduction`. Without it the pair reported "no leveling row of this kind on the
    // page" while the rows sat on the page in plain sight.
    const all = reading
      ? reading.rows
          .map((rr) => scan.statRows.find((r) => r.label === rr.label))
          .filter((r): r is NonNullable<typeof r> => r !== undefined)
      : scan.statRows.filter((r) => r.kind === censusKind);

    if (reading) {
      // THE READING MUST STILL MATCH THE PAGE. A reading is evidence about one revision, and a
      // page that has moved under it is refused loudly rather than stored against a reading of
      // something else.
      const missing = reading.rows
        .filter((rr) => !scan.statRows.some((r) => r.label === rr.label))
        .map((rr) => rr.label);
      const unnamed = scan.statRows
        .filter((r) => r.kind === censusKind && !reading.rows.some((rr) => rr.label === r.label))
        .map((r) => r.label);
      if (missing.length > 0 || unnamed.length > 0) {
        run.refusals.push({
          key,
          kind: censusKind,
          refusalClass: 'reading-stale',
          blockedBy: ['reading-stale'],
          detail:
            (missing.length > 0 ? `the reading names row(s) the page no longer has: ${missing.join(', ')}. ` : '') +
            (unnamed.length > 0 ? `the page carries row(s) the reading does not name: ${unnamed.join(', ')}.` : ''),
        });
        continue;
      }
    }

    const rows = all.filter((r) => {
      if (reading?.rows.find((rr) => rr.label === r.label)?.drop === 'other-recipient') {
        run.otherRecipientRowsDropped.push({ key, kind: censusKind, label: r.label });
        return false;
      }
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
      const rowReading = reading?.rows.find((rr) => rr.label === r.label);
      const facts = labelFacts(kind, r.label);
      // THE DETECTOR HALF. A label naming one of the six facts is a candidate for a reading, and
      // nothing more. With a reading in hand the facts are answered; without one the pair is
      // reported so a person can read it, and the facts are listed so it is clear what for.
      if (facts.length > 0 && !rowReading) {
        reasons.push('shape-not-read', ...facts);
        notes.push(`row "${r.label}" states ${facts.join(' + ')} and nobody has read it`);
      }
      const parsed = parseDefensiveRow(r.value, maxRank, vars);
      if (parsed.refusal) {
        reasons.push(parsed.refusal.refusalClass);
        notes.push(`row "${r.label}": ${parsed.refusal.detail}`);
      } else if (parsed.value !== undefined && parsed.isPercentage && !rowReading?.rateUnit) {
        // A PERCENTAGE OF WHAT? `unit: 'percent'` means "a percentage of whatever the kind is
        // about" — damage received for a reduction, maximum health for a max-health grant. A
        // shield or a heal has no such quantity, so a bare percentage there is either a rate on
        // damage dealt or an amplifier, and only a reading can say which.
        if (kind === 'shield' || kind === 'heal') {
          reasons.push('not-an-amount');
          notes.push(
            `row "${r.label}" states a percentage and kind '${kind}' has no quantity for it to ` +
              `be a percentage OF; a reading must say whether it is a rate or an amplifier`,
          );
        }
      }
      return { row: r, parsed, reading: rowReading, reasons, notes };
    });

    const blockers = new Set<RefusalClass>(perRow.flatMap((p) => p.reasons));
    // Two rows of one kind are storable now — as two labelled, related entries — but only from a
    // reading: it takes a sentence to know whether they add (Leona W's armor and magic
    // resistance) or alternate (Shen R's minimum and maximum).
    if (rows.length > 1 && !reading) blockers.add('multiple-values-one-field');
    if (rows.length > 1 && !reading) blockers.add('shape-not-read');
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

    for (const { row, parsed, reading: rowReading } of perRow) {
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

      // THE UNIT. `flat` and `percent` are read off the row — the '%' is there or it is not.
      // A rate and an amplifier are not readable that way and come only from a reading.
      const unit: CuratedDefensiveEffect['unit'] | undefined =
        rowReading?.rateUnit ??
        (parsed.value === undefined ? undefined : parsed.isPercentage ? 'percent' : 'flat');

      const effect: CuratedDefensiveEffect = {
        champion: page.champion,
        slot: page.slot,
        abilityName: page.abilityName,
        // The source's own name for the row. Present on every row-derived entry, not only the
        // ambiguous ones: it is what a reader lines the entry up against the wiki page with.
        label: row.label,
        kind,
        activation: confirmed.activation,
        ...(confirmed.activation === 'always-active'
          ? {}
          : { condition: confirmed.activationEvidence }),
        ...(rowReading?.grantedStat ? { grantedStat: rowReading.grantedStat } : {}),
        ...(rowReading?.appliesToDamageType
          ? { appliesToDamageType: rowReading.appliesToDamageType }
          : {}),
        ...(rowReading?.overTime ? { overTime: rowReading.overTime } : {}),
        ...(unit ? { unit } : {}),
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
      // ═══ AN EFFECT THAT ONLY EVER PROTECTS AN ALLY IS NOT THE DEFENDER'S ═══
      //
      // The defender model is ONE champion, so storing an ally-only effect grants a defender
      // protection they never receive — a plausible wrong number in the worst direction, because
      // it makes a combo look survivable when it is not. Decided 2026-08-14; see ally-only.ts
      // for the read list and the sentence each member rests on.
      const notOurs = recipientRefusal(page.champion, page.slot, kind);
      if (notOurs) {
        run.recipientDropped.push({
          key,
          kind: censusKind,
          label: row.label,
          reason: notOurs.reason,
          sourceSays: notOurs.detail.sourceSays,
          why: notOurs.detail.why,
        });
        continue;
      }
      run.proposals.push(effect);
      run.sources.push({ key, kind, label: row.label, raw: row.value, maxRank });
    }
  }

  // IDENTITY AND RELATION, ASSIGNED ONCE THE WHOLE ABILITY IS KNOWN.
  //
  // Gate 1 requires an `id` on every entry of an ability that carries more than one — including
  // two entries of DIFFERENT kinds, because an id has to be unique within the ability for a
  // relation to have something unambiguous to point at. And it requires `relation` to be stated
  // explicitly, never defaulted, once two entries share a kind: summing two alternatives hands
  // the defender both.
  assignIdsAndRelations(run.proposals, page, key);

  // `fields` is read for its side effect of proving the page parses; keep the reference honest.
  void fields;
  return run;
}

/** slugify a label into an id, falling back to the kind when two labels collide on one page. */
function idFor(label: string, kind: string, taken: Set<string>): string {
  const base = label ? slugify(label) : kind;
  const id = taken.has(base) ? `${kind}-${base}` : base;
  taken.add(id);
  return id;
}

/**
 * Give every entry on a multi-entry ability an id, and every entry sharing a kind an explicit
 * relation. The alternation itself comes from the reading — this only writes it down.
 */
export function assignIdsAndRelations(
  proposals: CuratedDefensiveEffect[],
  page: { champion: string; slot: string; abilityName: string },
  key: string,
): void {
  const mine = proposals.filter(
    (p) =>
      p.champion === page.champion && p.slot === page.slot && p.abilityName === page.abilityName,
  );
  if (mine.length < 2) return;
  const taken = new Set<string>();
  for (const p of mine) p.id = idFor(p.label ?? '', p.kind, taken);

  for (const p of mine) {
    const sameKind = mine.filter((s) => s.kind === p.kind);
    if (sameKind.length < 2) continue;
    const reading = SHAPES_READ.find((s) => s.key === key && KIND_MAP[s.kind] === p.kind);
    const rowReading: RowReading | undefined = reading?.rows.find((r) => r.label === p.label);
    const anchor = rowReading?.alternativeTo
      ? sameKind.find((s) => s.label === rowReading.alternativeTo)
      : undefined;
    p.relation = anchor ? { kind: 'alternativeTo', componentId: anchor.id! } : { kind: 'adds' };
  }
}

export function proposeAll(
  pages: CachedPage[],
  confirmed: readonly ConfirmedEffect[],
  opts: ProposeOptions,
): ProposalRun {
  const byKey = new Map<string, CachedPage>();
  for (const p of pages) byKey.set(`${p.champion}/${p.slot}/${p.abilityName}`, p);
  const out: ProposalRun = {
    proposals: [],
    sources: [],
    refusals: [],
    recipientDropped: [],
    nonChampionRowsDropped: [],
    otherRecipientRowsDropped: [],
  };
  for (const c of confirmed) {
    const page = byKey.get(c.key);
    if (!page) continue; // the census's integrity check reports a key that names no page
    const r = proposeForPage(page, c, opts);
    out.proposals.push(...r.proposals);
    out.sources.push(...r.sources);
    out.refusals.push(...r.refusals);
    out.nonChampionRowsDropped.push(...r.nonChampionRowsDropped);
    out.otherRecipientRowsDropped.push(...r.otherRecipientRowsDropped);
    out.recipientDropped.push(...r.recipientDropped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE SWEEPS.
//
// A defect found by reading one page becomes a check that runs over every page. None of these
// stores or refuses anything by itself — each one produces a list for a person to read, which is
// the only thing a pattern is allowed to do here. They exist because five separate mistakes were
// available in this pass and four of them are invisible to gate 1 and gate D2: an entry can
// round-trip perfectly against the wiki's own rendering and still mean the wrong thing.
// ---------------------------------------------------------------------------

/**
 * THE SELF-CHECK: does every entry carry the fact its own label states?
 *
 * The six fields are only worth having if they are actually filled in. This walks the written
 * entries — not the source, not the readings — and asks, of every label that names one of the six
 * facts, whether the entry carries it. Two outcomes, kept apart on purpose:
 *
 *  - `defects`: the label states a fact and the entry does not carry it, and no reading decided
 *    that. This must be zero; anything here is an entry claiming something the source contradicts.
 *  - `decidedByAReading`: the label states a fact and a person deliberately did not carry it.
 *    Vladimir R's "Maximum Total Heal" is the whole population — "total" there means across every
 *    target hit, not over time, and a reading is the only thing that can say so.
 */
export function labelFactsCarried(
  proposals: CuratedDefensiveEffect[],
): { defects: string[]; decidedByAReading: string[] } {
  const defects: string[] = [];
  const decidedByAReading: string[] = [];
  for (const e of proposals) {
    if (!e.label) continue;
    const siblingsOfKind = proposals.filter(
      (s) =>
        s.champion === e.champion &&
        s.slot === e.slot &&
        s.abilityName === e.abilityName &&
        s.kind === e.kind,
    ).length;
    const carried: Record<string, boolean> = {
      'needs-granted-stat': e.grantedStat !== undefined,
      'needs-damage-type': e.appliesToDamageType !== undefined,
      'needs-over-time': e.overTime !== undefined,
      'not-an-amount': e.unit === 'percent-of-damage-dealt' || e.unit === 'healing-multiplier',
      'needs-relation': e.relation !== undefined || siblingsOfKind < 2,
    };
    const read = SHAPES_READ.some(
      (s) =>
        s.key === `${e.champion}/${e.slot}/${e.abilityName}` &&
        KIND_MAP[s.kind] === e.kind &&
        s.rows.some((r) => r.label === e.label),
    );
    for (const fact of labelFacts(e.kind, e.label)) {
      if (carried[fact] !== false) continue;
      const line = `${e.champion}/${e.slot}/${e.abilityName} "${e.label}" states ${fact} and the entry does not carry it`;
      (read ? decidedByAReading : defects).push(line);
    }
  }
  return { defects, decidedByAReading };
}

export interface Sweeps {
  /** A reading whose key or kind names no confirmed pair — a typo that would silently do nothing. */
  readingsMatchingNoConfirmedPair: string[];
  /** One row claimed by two readings on one page: it would be stored twice. */
  rowsClaimedTwice: string[];
  /**
   * THE VLADIMIR R TRAP. A row labelled "Total …" on a page whose prose states no recurrence.
   * "Total" means "over the duration" on 30-odd pages and "across every target hit" on two, and
   * the label cannot tell them apart. Every hit here needs a person, and both known hits have one.
   */
  totalLabelWithNoRecurrenceInProse: string[];
  /** Prose stating the figure scales with a count. Per stack is refused; per enemy hit is one in a 1v1. */
  countScaledCandidates: string[];
  /** Prose stating a cap or a maximum near the effect. The entry has no field for either. */
  cappedCandidates: string[];
  /** A confirmed kind with no row of that kind, on a page that has defensive rows of another kind. */
  kindMismatch: string[];
}

const RECURRENCE_IN_PROSE = /every [\d.]+ seconds?|over the duration|per second|each second|every second/i;
const COUNT_SCALED_IN_PROSE =
  /per stack|for each stack|for every stack|for each champion|per target|for each infected|for each enemy|beyond the first/i;
const CAP_IN_PROSE = /capped at|up to \d+% of the damage|maximum of \d/i;

export function sweep(pages: CachedPage[], confirmed: readonly ConfirmedEffect[]): Sweeps {
  const byKey = new Map<string, CachedPage>();
  for (const p of pages) byKey.set(`${p.champion}/${p.slot}/${p.abilityName}`, p);
  const confirmedPairs = new Set(confirmed.flatMap((c) => c.kinds.map((k) => `${c.key}/${k}`)));

  const out: Sweeps = {
    readingsMatchingNoConfirmedPair: [
      ...SHAPES_READ.map((s) => `${s.key}/${s.kind}`),
      ...REFUSED_ON_READING.map((r) => `${r.key}/${r.kind}`),
    ].filter((p) => !confirmedPairs.has(p)),
    rowsClaimedTwice: [],
    totalLabelWithNoRecurrenceInProse: [],
    countScaledCandidates: [],
    cappedCandidates: [],
    kindMismatch: [],
  };

  const claims = new Map<string, string[]>();
  for (const s of SHAPES_READ) {
    for (const r of s.rows) {
      const k = `${s.key} :: ${r.label}`;
      claims.set(k, [...(claims.get(k) ?? []), s.kind]);
    }
  }
  for (const [k, kinds] of claims) {
    if (kinds.length > 1) out.rowsClaimedTwice.push(`${k} claimed by ${kinds.join(' and ')}`);
  }

  for (const c of confirmed) {
    const page = byKey.get(c.key);
    if (!page) continue;
    const scan = scanPage(page);
    if (scan.statRows.length === 0) continue;
    const fields = parseFields(page.wikitext);
    const prose = Object.entries(fields)
      .filter(([f]) => /^description/.test(f))
      .map(([, v]) => flatten(v))
      .join(' ');

    for (const r of scan.statRows) {
      if (/\btotal\b/i.test(r.label) && !RECURRENCE_IN_PROSE.test(prose)) {
        out.totalLabelWithNoRecurrenceInProse.push(`${c.key} :: ${r.label}`);
      }
    }
    const countMatch = COUNT_SCALED_IN_PROSE.exec(prose);
    if (countMatch) out.countScaledCandidates.push(`${c.key} :: "${countMatch[0]}"`);
    const capMatch = CAP_IN_PROSE.exec(prose);
    if (capMatch) out.cappedCandidates.push(`${c.key} :: "${capMatch[0]}"`);

    const rowKinds = new Set(scan.statRows.map((r) => r.kind));
    for (const k of c.kinds) {
      if (rowKinds.has(k) || k === 'immunity' || k === 'spell-shield') continue;
      if (SHAPES_READ.some((s) => s.key === c.key && s.kind === k)) continue;
      out.kindMismatch.push(
        `${c.key} confirmed '${k}'; the page carries ${[...rowKinds].join(', ')} rows`,
      );
    }
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
    // KEYED BY ID AS WELL AS KIND. Two entries of one kind on one ability is the Leona W shape —
    // armor and magic resistance from two rows — and gate 1 tells them apart by `id`. Keying on
    // the kind alone would have called that a duplicate, which it is not.
    const key = `${e.champion}/${e.slot}/${e.abilityName}/${e.kind}${e.id ? `#${e.id}` : ''}`;
    const push = (message: string) => findings.push({ entry: key, message });
    if (seen.has(key)) push('duplicate entry — one champion/slot/ability/kind/id may appear once');
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

  // GATE 1 — THE LEAD'S VALIDATOR, NOT THIS FILE'S. `gateSchema` in src/types/validate-curated.ts
  // is what the curated file is actually held to, and it now walks `defensiveEffects` in full,
  // including `checkDefensiveEffect`'s twelve rules on the six shape fields. Running our own gate
  // instead of it would only ever prove that this file agrees with itself.
  const gate1 = gateSchema({
    version: 1,
    patch: manifest.patch,
    fetched: cache.fetchedOn,
    abilities: [],
    defensiveEffects: run.proposals,
    itemEffects: [],
    runes: [],
    shards: [],
    exclusions: [],
  });
  const sweeps = sweep(cache.pages, CONFIRMED);

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
    theMeasuredFortyFour: (() => {
      // DID THE 44 ACTUALLY LAND? A released pair still has to parse, still obeys the owner rule,
      // and can still be refused by a person reading it. This counts the outcome rather than the
      // release.
      //
      // DEFINITION of the population: every (page, kind) pair in `defensive-shapes.ts` EXCEPT the
      // two typed reductions (Amumu E, Galio W), which DATA-SOURCES §42.5 counted under
      // `no-leveling-row` rather than among the 44 — the label map files their rows under
      // `damage-reduction`, so the six-field measurement never saw them.
      const typed = new Set(['Amumu/E/Tantrum', 'Galio/W/Shield of Durand']);
      const pairs = [
        ...SHAPES_READ.filter((r) => !(r.kind === 'type-specific-reduction' && typed.has(r.key))).map(
          (r) => ({ key: r.key, kind: r.kind }),
        ),
        ...REFUSED_ON_READING.map((r) => ({ key: r.key, kind: r.kind })),
      ];
      const written = pairs.filter((p) =>
        run.proposals.some(
          (e) =>
            `${e.champion}/${e.slot}/${e.abilityName}` === p.key && e.kind === KIND_MAP[p.kind],
        ),
      );
      const entries = run.proposals.filter((e) =>
        pairs.some(
          (p) =>
            p.key === `${e.champion}/${e.slot}/${e.abilityName}` && KIND_MAP[p.kind] === e.kind,
        ),
      );
      return {
        what:
          'the 44 pairs DATA-SOURCES §42.5 measured as released by the six shape fields, counted ' +
          'by what happened to them.',
        pairs: pairs.length,
        pairsWritten: written.length,
        pairsRefusedOnReading: REFUSED_ON_READING.length,
        entriesWritten: entries.length,
        entriesByVerification: tally(
          entries as unknown as Array<Record<string, unknown>>,
          'verification',
        ),
        refusedOnReading: REFUSED_ON_READING.map((r) => `${r.key}/${r.kind}: ${r.refusalClass}`),
        alsoReadButNotAmongThe44: [...typed].map((k) => `${k}/type-specific-reduction`),
      };
    })(),
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
    gate1: {
      what:
        "gate 1 as the lead defines it — gateSchema() in src/types/validate-curated.ts, run over " +
        'these proposals as a CuratedFile with no abilities. This is the gate that decides ' +
        'whether an entry could be merged at all. An entry it fails may claim no better than ' +
        "'incomplete'.",
      checked: gate1.checked,
      passed: gate1.passed,
      failed: gate1.failed,
      findings: gate1.findings,
    },
    sweeps: {
      what:
        'checks run over the whole confirmed population, each one born from a single page read ' +
        'wrongly. None of them stores or refuses anything: each produces a list for a person.',
      definitions: {
        readingsMatchingNoConfirmedPair:
          'a reading whose (page, kind) is not in defensive-confirmed.ts. A typo here would fail ' +
          'silently — the pair would simply look unread — so it is checked rather than trusted.',
        rowsClaimedTwice: 'one row named by two readings on one page; it would be stored twice.',
        totalLabelWithNoRecurrenceInProse:
          'a row labelled "Total ..." on a page whose prose states no recurrence. "Total" means ' +
          '"over the duration" on most pages and "across every target hit" on Vladimir R, and ' +
          'the label cannot tell them apart.',
        countScaledCandidates:
          'prose stating the figure scales with a count. PER STACK is refused (Graves E is 7 to ' +
          '19 armor per stack of 8); PER ENEMY HIT is one enemy in a champion-versus-champion ' +
          'tool, so it is stored at its one-enemy value.',
        cappedCandidates:
          'prose stating a cap or a maximum somewhere on the page. The entry has no field for ' +
          'either. UNREAD: this pattern fires on any "capped at" on the page, including caps on ' +
          'damage against monsters, so it is a candidate list and nothing more.',
        kindMismatch:
          'a confirmed kind with no row of that kind on a page that has defensive rows of ' +
          'another kind. Two of these were real (Amumu E, Galio W) and are now read; the rest ' +
          'are effects whose value genuinely lives in a sentence.',
      },
      counts: Object.fromEntries(Object.entries(sweeps).map(([k, v]) => [k, v.length])),
      lists: sweeps,
      labelFactsCarried: {
        what:
          'of every written entry whose label names one of the six facts, whether the entry ' +
          'carries it. `defects` must be zero. `decidedByAReading` is a person choosing not to ' +
          'carry it, with the sentence that says why.',
        ...labelFactsCarried(run.proposals),
      },
    },
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
    otherRecipientRowsDropped: run.otherRecipientRowsDropped,
    recipientDropped: {
      what:
        'Entries NOT stored because they protect somebody who is not the defender. The defender ' +
        'model is ONE champion, so an ally-only effect would grant a defender protection they ' +
        'never receive. A WORD SEARCH DOES NOT FIND THESE: sweeping all 161 entries for "ally" ' +
        'found 12 and MISSED Shen R, whose stored condition never mentions one. Each member was ' +
        'read on its own page and quotes the sentence it rests on (scripts/extract/ally-only.ts).',
      allyOnlyRead: ALLY_ONLY.length,
      recipientNotReadYet: RECIPIENT_NOT_READ.length,
      dropped: run.recipientDropped,
    },
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
    `\nthe 44 measured pairs: ${out.theMeasuredFortyFour.pairsWritten} written as ` +
      `${out.theMeasuredFortyFour.entriesWritten} entries, ` +
      `${out.theMeasuredFortyFour.pairsRefusedOnReading} refused on reading`,
  );
  console.log(
    `\ngate D1 (this file's own schema gate): ${gate.passed} passed, ${gate.failed} failed of ${gate.checked} checked`,
  );
  for (const f of gate.findings.slice(0, 20)) console.log(`   ${f.entry}: ${f.message}`);
  console.log(
    `\ngate 1 (gateSchema, src/types/validate-curated.ts): ${gate1.passed} passed, ` +
      `${gate1.failed} failed of ${gate1.checked} checked`,
  );
  for (const f of gate1.findings.slice(0, 25)) console.log(`   ${f.entry}: ${f.message}`);
  const carried = labelFactsCarried(run.proposals);
  console.log(
    `\nlabel-fact self-check: ${carried.defects.length} entries state a fact they do not carry, ` +
      `${carried.decidedByAReading.length} where a reading decided not to`,
  );
  for (const line of [...carried.defects, ...carried.decidedByAReading]) console.log(`   ${line}`);
  console.log('\nsweeps over the confirmed population (lists, never decisions):');
  for (const [k, v] of Object.entries(sweeps)) {
    console.log(`  ${k.padEnd(38)} ${v.length}`);
    for (const line of v.slice(0, 6)) console.log(`      ${line.slice(0, 130)}`);
  }
  console.log(
    `\nrows dropped: ${run.nonChampionRowsDropped.length} non-champion, ` +
      `${run.otherRecipientRowsDropped.length} granting to somebody who is not the defender`,
  );
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
