// Classifying one damage row into a library shape plus numbers.
//
// This is the step that makes the phase small. An author does not read an ability and work
// out what it does; they confirm a shape and a handful of numbers that were extracted
// mechanically. Classification is checkable by a second party — comprehension is not.
//
// THE LIBRARY. Measured over all 999 damage components in the game on 2026-08-12:
//   S2 base + one ratio        666  66.7%
//   S6 scales off a health pool 123  12.3%
//   S3 base + two ratios       111  11.1%
//   S1 flat, no ratio           43   4.3%
//   S5 ratio-only, no base      19   1.9%
//   S7 mana                      9   0.9%
//   S8 resistances               7   0.7%
//   S9 stacks                    1   0.1%
// Four shapes cover 94.4%. Decorators (a ratio that itself scales per rank, a per-hit count,
// level scaling) modify a shape rather than making a new one — which is what keeps the
// library at nine entries instead of forty.
//
// Pure: no network, no filesystem. Tested by classify.test.ts.

import type {
  AbilityComponent,
  DamageType,
  Ratio,
  RatioOwner,
  RatioStat,
} from '../../src/types/data.ts';
import { isHealthPoolStat } from '../../src/types/data.ts';
import { ALTERNATIVE_MARKERS } from '../../src/types/validate-curated.ts';
import { ProgressionError, parseRankProgression } from './progression.ts';
import { findBlocks, plainText, splitArgs, substituteVars } from './wikitext.ts';

export type ShapeId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9';

export const SHAPE_NAMES: Record<ShapeId, string> = {
  S1: 'flat — base only, no ratio',
  S2: 'base + one ratio',
  S3: 'base + two ratios',
  S4: 'base + three or more ratios',
  S5: 'ratio-only — no flat base',
  S6: 'scales off a health pool',
  S7: 'scales off mana',
  S8: 'scales off resistances',
  S9: 'scales off a stack counter',
};

/**
 * Label fragments marking a row as a conditional variant of another (94 measured).
 * Imported from the validator rather than redeclared: the classifier PROPOSES a relation and
 * the validator ENFORCES it, so two copies of this list would let a proposal pass a gate that
 * disagreed with it.
 */
export const ALTERNATIVE_MARKER = ALTERNATIVE_MARKERS;

/** Rows that apply only to non-champion targets (81 measured). Dropped: this is a
 *  champion-versus-champion tool (SPECIFICATION §5). */
export const NON_CHAMPION_ROW =
  /\b(minion|monster|non-champion|non champion|nonchampion|non-epic|epic|turret|ward)s?\b/i;

/**
 * A leading Minimum/Maximum qualifier on a damage row.
 *
 * These are NOT summary rows. On a charge-up or ramping ability the "Minimum" row IS the
 * damage and the "Maximum" row is the fully-charged variant of it. Treating both as summaries
 * dropped every damage row from 32 abilities — Veigar R, Jhin R, Riven R, Vi Q, Varus Q,
 * Sion Q and R among them — and each would have shipped ZERO damage. Gate 2 cannot catch that,
 * because an ability with no stored components has nothing to compare against; it was found by
 * reading the first batch's prose-only worklist and asking why a damage ability was on it.
 *
 * The qualifier is stripped and the REMAINDER is judged, so "Minimum Total Damage" is still a
 * summary and "Minimum Minion Damage" is still a non-champion row.
 */
export const RANGE_QUALIFIER = /^\s*(minimum|maximum|min|max)\s+/i;

/** Reader-convenience summary rows — arithmetic on other rows, never stored (388 measured). */
export const DERIVED_ROW = /^total\b/i;

/** Strip a leading Minimum/Maximum and say which it was. */
export function stripRangeQualifier(label: string): {
  rest: string;
  bound: 'min' | 'max' | null;
} {
  const m = RANGE_QUALIFIER.exec(label);
  if (!m) return { rest: label, bound: null };
  const word = m[1]!.toLowerCase();
  return { rest: label.slice(m[0].length), bound: word.startsWith('min') ? 'min' : 'max' };
}

/** Rows whose label mentions damage but which are not a damage instance. */
const NOT_A_DAMAGE_ROW = /damage reduction|damage reduc|damage amp|damage taken|damage cap/i;

/** A per-hit / per-tick label, meaning the component lands more than once (131 measured). */
export const PER_HIT_LABEL =
  /\bper (tick|second|spin|hit|bullet|shot|bolt|blade|dagger|missile|stack|orb|blast|wave|strike|arrow|slash|cast|charge|target|enemy|beam|feather|spear|knife|rocket|swing|pulse)\b/i;

/** Longest-match-first, so "bonus attack damage" never resolves as "attack damage". */
const RATIO_STATS: Array<[RegExp, RatioStat]> = [
  [/bonus\s+health/i, 'bonusHP'],
  [/(maximum|max)\s+health/i, 'maxHP'],
  [/missing\s+health/i, 'missingHP'],
  [/current\s+health/i, 'currentHP'],
  [/\bhealth\b/i, 'maxHP'],
  [/bonus\s+(attack\s+damage|ad)\b/i, 'bonusAD'],
  [/total\s+(attack\s+damage|ad)\b/i, 'totalAD'],
  [/base\s+(attack\s+damage|ad)\b/i, 'baseAD'],
  [/\b(attack\s+damage|ad)\b/i, 'totalAD'],
  [/\b(ability\s+power|ap)\b/i, 'AP'],
  [/bonus\s+armor/i, 'bonusArmor'],
  [/\barmor\b/i, 'armor'],
  [/bonus\s+magic\s+resist(ance)?/i, 'bonusMagicResist'],
  [/\b(magic\s+resist(ance)?|mr)\b/i, 'magicResist'],
  [/(maximum|max)\s+mana/i, 'maxMana'],
  [/current\s+mana/i, 'currentMana'],
  [/\bmana\b/i, 'maxMana'],
  [/\bstacks?\b/i, 'stacks'],
];

/**
 * WHOSE health a ratio reads, decided ONLY from what the ratio's own prose says.
 *
 * Established by scanning the `{{as|(+ …)}}` blocks of all 865 ability templates on
 * 2026-08-13. 176 blocks name a health pool, in 45 distinct phrasings:
 *
 *   104  say the target outright  — "of target's maximum health", "of the target's missing
 *                                    health", "of primary target's bonus health"
 *    24  say the caster outright  — "of his bonus health", "of her maximum health",
 *                                    "of Zac's bonus health", "per 100 Poppy's bonus health"
 *    48  say NEITHER              — "(+ 7% bonus health)", "(+ 6% maximum health)"
 *
 * The 48 are NOT assigned a side here. There is a tempting argument that they must mean the
 * caster, because the wiki marks the target explicitly in all 104 cases where it means the
 * target. That is a convention, not a statement, and this project does not turn conventions
 * into numbers: a convention holds until the one ability where it does not, and that ability
 * ships a wrong number nobody can see. They are recorded as 'unresolved', which forces the
 * entry to 'incomplete' at gate 6 and puts it on the hand-authoring worklist.
 *
 * Order matters: target is tested first, so a phrase naming both loses to the target reading
 * only if the target marker is inside this block -- and a compound expression that puts the
 * owner OUTSIDE the block (Udyr Q's "(+ 1% per 100 bonus health) of the target's maximum
 * health") correctly falls through to 'unresolved' rather than being half-read.
 */
const OWNER_TARGET = /\b(?:primary\s+|the\s+)?(?:target|enemy|enemies|victim)(?:'s|s'|’s)/i;
const OWNER_CASTER =
  /\b(?:his|her|hers|its|your|their\s+own|its\s+own|own)\b|\b[A-Z][A-Za-z'’.]*(?:'s|’s)/;

/** Decide a health ratio's owner from its own text. Never guesses; returns 'unresolved'. */
export function ratioOwnerOf(text: string): RatioOwner {
  const t = text.replace(/'''|''/g, '');
  if (OWNER_TARGET.test(t)) return 'target';
  if (OWNER_CASTER.test(t)) return 'caster';
  return 'unresolved';
}

const HEALTH_STATS = new Set<RatioStat>(['maxHP', 'bonusHP', 'currentHP', 'missingHP']);
const MANA_STATS = new Set<RatioStat>(['maxMana', 'currentMana']);
const RESIST_STATS = new Set<RatioStat>(['armor', 'bonusArmor', 'magicResist', 'bonusMagicResist']);
const CORE_STATS = new Set<RatioStat>(['baseAD', 'bonusAD', 'totalAD', 'AP']);

/** Which stat a ratio's prose names, or null if it names none this project models. */
export function ratioStatOf(text: string): RatioStat | null {
  const t = text.replace(/'''|''/g, '');
  for (const [re, stat] of RATIO_STATS) if (re.test(t)) return stat;
  return null;
}

export interface RowIssue {
  kind: 'unparsed-base' | 'unparsed-ratio' | 'unknown-stat' | 'no-value' | 'unresolved-owner';
  detail: string;
}

export interface ClassifiedRow {
  label: string;
  component?: AbilityComponent;
  shape?: ShapeId;
  issues: RowIssue[];
  /** True when the row is deliberately not stored (summary row, non-champion row). */
  dropped?: 'derived-row' | 'non-champion' | 'not-damage';
}

/** True when this label denotes a damage instance we would store. */
export function isDamageRow(label: string): boolean {
  return /damage/i.test(label) && !NOT_A_DAMAGE_ROW.test(label);
}

/**
 * Parse one `{{as|(+ …)}}` block into a Ratio.
 * Percentages are stored as the wiki writes them: `75` means 75%, not 0.75. The engine
 * divides once, at one place, rather than every author dividing by hand.
 */
export function parseRatio(
  inner: string,
  maxRank: number,
  vars: Record<string, string>,
): { ratio?: Ratio; issue?: RowIssue } {
  // splitArgs, not String.split('|') — a naive split cuts `{{ap|100 to 140}}` and
  // `{{fd|2.5}}` in half and the ratio vanishes. Same class of bug as the two in wikitext.ts.
  const body = splitArgs(inner)[0] ?? '';
  if (!/\(\s*\+/.test(body)) return {}; // an {{as|…}} that is prose, not a ratio
  const text = body.replace(/^\s*\(\s*\+\s*/, '').replace(/\)\s*$/, '');
  const flat = plainText(text) || text;
  const stat = ratioStatOf(flat);
  if (!stat) return { issue: { kind: 'unknown-stat', detail: text.slice(0, 80) } };

  // A health pool names a quantity but not a champion. Decide the owner from the same prose
  // the stat came from, and record 'unresolved' where that prose does not say. Gate 1 rejects
  // a health ratio with no owner, so this can never be silently skipped.
  const owner: { owner?: RatioOwner } = isHealthPoolStat(stat)
    ? { owner: ratioOwnerOf(flat) }
    : {};

  // The magnitude is either a nested {{ap|…}} (a ratio that itself scales per rank — 244
  // measured) or a literal number before the '%'.
  const nested = findBlocks(text, 'ap');
  try {
    if (nested.length > 0) {
      const scaling = parseRankProgression(substituteVars(nested[0]!.inner, vars), maxRank);
      return { ratio: { stat, ...owner, ...scaling } };
    }
    const num = /(-?\d+(?:\.\d+)?)\s*%/.exec(substituteVars(text, vars));
    if (!num) return { issue: { kind: 'unparsed-ratio', detail: text.slice(0, 80) } };
    const v = Number(num[1]);
    return { ratio: { stat, ...owner, scaling: 'linear', from: v, to: v } };
  } catch (e) {
    return {
      issue: {
        kind: 'unparsed-ratio',
        detail: `${text.slice(0, 60)} — ${e instanceof ProgressionError ? e.message : String(e)}`,
      },
    };
  }
}

/** The library shape a finished component belongs to. */
export function shapeOf(component: AbilityComponent, hasBase: boolean): ShapeId {
  const stats = component.ratios.map((r) => r.stat);
  if (stats.some((s) => HEALTH_STATS.has(s))) return 'S6';
  if (stats.some((s) => MANA_STATS.has(s))) return 'S7';
  if (stats.some((s) => RESIST_STATS.has(s))) return 'S8';
  if (stats.some((s) => s === 'stacks')) return 'S9';
  if (!hasBase) return 'S5';
  const core = stats.filter((s) => CORE_STATS.has(s)).length;
  if (core === 0) return 'S1';
  if (core === 1) return 'S2';
  if (core === 2) return 'S3';
  return 'S4';
}

/**
 * Classify one `{{st|Label|Value}}` row.
 * `damageType` comes from the template's own `damagetype` field, cross-checkable against
 * Module:DamageData/data.
 */
export function classifyRow(
  label: string,
  value: string,
  opts: { maxRank: number; damageType: DamageType; vars: Record<string, string>; index: number },
): ClassifiedRow {
  // Judge the label with any Minimum/Maximum qualifier stripped, so "Minimum Magic Damage"
  // is kept as real damage while "Minimum Total Damage" is still a summary row.
  const { rest: bareLabel } = stripRangeQualifier(label);
  if (!isDamageRow(bareLabel)) return { label, issues: [], dropped: 'not-damage' };
  if (DERIVED_ROW.test(bareLabel)) return { label, issues: [], dropped: 'derived-row' };
  if (NON_CHAMPION_ROW.test(bareLabel)) return { label, issues: [], dropped: 'non-champion' };

  const issues: RowIssue[] = [];
  const { maxRank, vars } = opts;

  // Ratios first, so what remains is the base.
  const ratioBlocks = findBlocks(value, 'as');
  const ratios: Ratio[] = [];
  for (const b of ratioBlocks) {
    const { ratio, issue } = parseRatio(b.inner, maxRank, vars);
    if (ratio) {
      ratios.push(ratio);
      // Surface it as an issue, not just as a stored field: this both puts the row on the
      // hand-authoring worklist in the batch report and drives the entry to 'incomplete'.
      // Gate 6 is the backstop if this ever stops happening.
      if (ratio.owner === 'unresolved') {
        issues.push({
          kind: 'unresolved-owner',
          detail: `${ratio.stat}: source does not say whose health — "${b.inner
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 70)}"`,
        });
      }
    } else if (issue) issues.push(issue);
  }

  let rest = value;
  for (const b of [...ratioBlocks].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);

  const baseBlocks = findBlocks(rest, 'ap');
  let base: AbilityComponent['base'] | undefined;
  let hasBase = false;
  if (baseBlocks.length > 0) {
    try {
      base = parseRankProgression(substituteVars(baseBlocks[0]!.inner, vars), maxRank);
      hasBase = true;
    } catch (e) {
      issues.push({
        kind: 'unparsed-base',
        detail: `${baseBlocks[0]!.inner.slice(0, 60)} — ${
          e instanceof ProgressionError ? e.message : String(e)
        }`,
      });
    }
  } else {
    const literal = plainText(rest).trim();
    const num = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(literal);
    if (num) {
      const v = Number(num[1]);
      base = { scaling: 'explicit', perRank: Array.from({ length: maxRank }, () => v) };
      hasBase = true;
    } else if (ratios.length > 0) {
      // Ratio-only (S5): a pure percentage of a stat with no flat base, e.g. Aatrox R.
      base = { scaling: 'explicit', perRank: Array.from({ length: maxRank }, () => 0) };
      hasBase = false;
    } else {
      issues.push({ kind: 'no-value', detail: literal.slice(0, 80) || '(empty)' });
    }
  }

  if (!base) return { label, issues };

  const perHit = PER_HIT_LABEL.test(label);
  const component: AbilityComponent = {
    id: slugify(label) || `component-${opts.index + 1}`,
    label,
    damageType: opts.damageType,
    base,
    ratios,
    // The relation is PROPOSED here and must be confirmed by an author. Gate 3 refuses any
    // multi-component ability that leaves it unstated, so a wrong guess cannot slip through
    // silently — but a guess that looks right is still a guess, which is why the harvester
    // reports it as a proposal rather than an answer.
    relation: ALTERNATIVE_MARKER.test(label) ? undefined : { kind: 'adds' },
    ...(perHit ? { hits: 1 } : {}),
  };

  return { label, component, shape: shapeOf(component, hasBase), issues };
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Propose relations across a whole ability. Any row whose label carries an alternative
 * marker is proposed as an alternative to the first row that does not. This is a PROPOSAL:
 * gate 3 requires an author to confirm every relation on a multi-component ability.
 */
export function proposeRelations(components: AbilityComponent[]): AbilityComponent[] {
  if (components.length < 2) return components;

  // A "Maximum X" row is the fully-charged form of the "Minimum X" row beside it, not a
  // second hit. Pair them first, by the label they share once the qualifier is stripped.
  const minByRest = new Map<string, AbilityComponent>();
  for (const c of components) {
    const { rest, bound } = stripRangeQualifier(c.label ?? c.id);
    if (bound === 'min') minByRest.set(rest.toLowerCase().trim(), c);
  }

  const primary = components.find((c) => {
    const label = c.label ?? c.id;
    return !ALTERNATIVE_MARKER.test(label) && stripRangeQualifier(label).bound !== 'max';
  });

  return components.map((c) => {
    const label = c.label ?? c.id;
    const { rest, bound } = stripRangeQualifier(label);
    if (bound === 'max') {
      const paired = minByRest.get(rest.toLowerCase().trim());
      if (paired && paired.id !== c.id) {
        return { ...c, relation: { kind: 'alternativeTo', componentId: paired.id } };
      }
    }
    if (!ALTERNATIVE_MARKER.test(label)) return { ...c, relation: { kind: 'adds' } };
    if (!primary || primary.id === c.id) return { ...c, relation: { kind: 'adds' } };
    return { ...c, relation: { kind: 'alternativeTo', componentId: primary.id } };
  });
}
