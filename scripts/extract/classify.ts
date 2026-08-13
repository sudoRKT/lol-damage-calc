// Classifying one damage row into a library shape plus numbers.
//
// This is the step that makes the phase small. An author does not read an ability and work
// out what it does; they confirm a shape and a handful of numbers that were extracted
// mechanically. Classification is checkable by a second party — comprehension is not.
//
// THE LIBRARY. The counts below are SUPERSEDED — see DATA-SOURCES §19 for the authoritative
// measurement with a stated definition for every figure. They are kept only to show the
// shape ORDERING, which the re-measurement did not change.
// Measured over 999 damage components on 2026-08-12 (superseded; now 893 over 937 pages):
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
  RatioMultiplier,
  RatioOwner,
  RatioStat,
  Scaling,
} from '../../src/types/data.ts';
import { requiresOwner } from '../../src/types/data.ts';
import { isLevelScaled } from '../../src/types/scaling.ts';
import { ALTERNATIVE_MARKERS } from '../../src/types/validate-curated.ts';
import { ProgressionError, parseLevelProgression, parseRankProgression } from './progression.ts';
import { findBlocks, findLevelBlocks, plainText, splitArgs, substituteVars } from './wikitext.ts';

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

/**
 * A label that says the component ADDS, overriding any variant marker in it.
 *
 * Camille W's row is "Outer Cone **Additional** Damage" and its prose says "an additional
 * instance of damage… it will trigger effects twice". The variant list matched it on the word
 * "outer" and stored it as an ALTERNATIVE to the base hit — so a target in the outer half was
 * modelled as taking the cone damage INSTEAD of the base damage, dropping 220 physical damage at
 * rank 5. Darius Q's handle genuinely does replace ("enemies within the inner radius take 35%
 * damage"); the two rows look structurally identical and mean opposite things, and the only
 * thing that separates them is this word.
 */
export const ADDS_MARKER = /\badditional\b/i;

/** Whether a component's label marks it as a conditional variant of another. */
export function isAlternativeLabel(label: string): boolean {
  return ALTERNATIVE_MARKER.test(label) && !ADDS_MARKER.test(label);
}

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

/**
 * Reader-convenience summary rows — arithmetic on other rows, never stored.
 *
 * MATCHES "Total" ANYWHERE IN THE LABEL, NOT ONLY AT THE START, and that widening was measured
 * before it was made. Anchoring at the start missed a summary with a qualifier in front of it —
 * "Maximum Mixed Total Damage", "Second Cast Total Damage" — which was then stored as a component
 * and counted alongside the rows it summarises. Gangplank R summed 1560 against a stated 480 and
 * Gwen R 300 against 270 for exactly that reason (§33).
 *
 * THE MEASUREMENT, taken over all 937 pages before the change: the wider match drops **4 further
 * damage rows** and silently zeroes **0 abilities** — DEF: an ability that keeps at least one
 * damage row under the narrow match and none under the wide one. All four are summaries by
 * inspection. The narrow anchor was kept until this was measured because a mis-scoped summary
 * filter once zeroed 32 abilities (§23), and `droppedEveryDamageRow` remains the backstop if a
 * future patch introduces a label this reads wrongly.
 */
export const DERIVED_ROW = /\btotal\b/i;

/**
 * A leading qualifier marking a row as the EMPOWERED form of the row it otherwise names.
 *
 * Ambessa Q prints "Physical Damage" and "Increased Physical Damage", and its description says
 * the damage "is doubled against the first enemy hit" — one enemy takes one or the other, never
 * both. Stored as two adding rows, a single-target Q reported 1.5x its real damage. Riot's own
 * data settles it the same way: the lesser row is the greater one multiplied by a `Min_Ratio` of
 * 0.5, not an independent payload.
 *
 * The pairing is structural — one label is the other with this word in front — so it does not
 * depend on reading the prose, and it cannot fire on two rows that merely both mention damage.
 */
export const EMPOWERED_QUALIFIER = /^\s*(increased|enhanced|empowered)\s+/i;

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
 * Order matters: target is tested first. A compound expression that puts the owner OUTSIDE
 * this block -- Kled W's "(+ 0.4% per 100 bonus health) of target's maximum health", where
 * the caster's bonus health is a COEFFICIENT on a payload owned by the target -- is not
 * something a per-ratio owner can express at all. Those are counted and reported separately
 * (DATA-SOURCES §16); this function only ever describes the block it is given.
 */
const OWNER_TARGET = /\b(?:primary\s+|the\s+)?(?:target|enemy|enemies|victim)(?:'s|s'|’s)/i;
const OWNER_CASTER =
  /\b(?:his|her|hers|its|your|their\s+own|its\s+own|own)\b|\b[A-Z][A-Za-z'’.]*(?:'s|’s)/;

/**
 * Decide a ratio's owner from its own text. Never guesses; returns 'unresolved'.
 *
 * Applied to every stat both champions possess: the four health pools, armor and bonus armor,
 * magic resistance and bonus magic resistance, maximum and current mana. The resistance and
 * mana ratios were surveyed the same way on 2026-08-13 and the source is even quieter about
 * them than about health -- "(+ 30% armor)", "(+ 3% maximum mana)" -- so most land on
 * 'unresolved'. That is what the source says, and it is not this function's job to improve on it.
 */
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
  kind:
    | 'unparsed-base'
    | 'unparsed-ratio'
    | 'unknown-stat'
    | 'no-value'
    | 'unresolved-owner'
    | 'coefficient-shape'
    | 'split-payload'
    | 'schema-invalid'
    | 'round-trip-disagreement'
    /** No source states a single damage type, so nothing may be stored for this ability. */
    | 'unknown-damage-type'
    /** A repeating component whose number of hits could not be derived from the source. */
    | 'unknown-hit-count'
    /** Two sources state different values for the same figure and nothing settles it (§32). */
    | 'source-conflict'
    /** Our stored components do not sum to the total the wiki itself prints (gate 7). */
    | 'total-mismatch'
    // The source states repeats against the same target but the rate or the ceiling could not
    // be derived from its own printed numbers (DATA-SOURCES §38). No count is invented.
    | 'variable-hit-count';
  detail: string;
}

/**
 * A COEFFICIENT on a health payload — a shape the library does not have.
 *
 * Malzahar R is `{{ap|10 to 20}}% {{as|(+ 2.5% per 100 AP)}} of target's maximum health`.
 * That reads: deal 10–20% of the target's maximum health, and add 2.5 percentage points to
 * that percentage for every 100 ability power. The "2.5% per 100 AP" is NOT a 2.5% AP ratio
 * — it modifies the health percentage. `Ratio` has one stat and one magnitude and cannot say
 * this, so the classifier currently stores the coefficient as though it were an ordinary
 * ratio, or loses the payload entirely. Kled W comes out as "4.5–6.5% of the target's BONUS
 * health" when the source says MAXIMUM health, which is a plausible wrong number of exactly
 * the kind this project exists to prevent.
 *
 * Measured across 937 distinct ability pages on 2026-08-13: 34 abilities, 53 damage rows.
 * Two of them (Kled W, Pantheon W) use a health pool as the coefficient — the caster's bonus
 * health scaling a payload on the target's maximum health — and 32 use AP or AD.
 *
 * This detector does NOT fix the shape. It refuses to let one pass as understood: the row is
 * still stored, an issue is raised, and the ability drops to 'incomplete' so nothing
 * downstream can present it as settled. Adding a real shape is a contract change and a
 * decision for the lead, not something to slip in behind a regular expression.
 */
export const COEFFICIENT_GROUP = /\(\s*\+[^)]*?per\s+100\s+([^)]*?)\)/gi;
export const OWNED_HEALTH_PAYLOAD =
  /(?:target|enemy|victim)(?:'s|’s)\s+(?:[a-z']+\s+){0,3}health|\b(?:his|her|its|their|[A-Z][A-Za-z']*(?:'s|’s))\s+(?:[a-z']+\s+){0,3}health/i;

/** True when a row expresses a health payload whose percentage is itself scaled. */
export function hasCoefficientShape(value: string): boolean {
  const raw = value.replace(/\s+/g, ' ');
  if (!OWNED_HEALTH_PAYLOAD.test(raw) && !OWNED_HEALTH_PAYLOAD.test(plainText(raw))) return false;
  COEFFICIENT_GROUP.lastIndex = 0;
  return COEFFICIENT_GROUP.test(raw);
}

/**
 * True when an `{{as|…}}` body opens a parenthesised group it never closes — the signature of
 * ONE expression split across several blocks.
 *
 * K'Sante W writes a single value as four blocks:
 *   {{ap|45 to 165}} {{as|(+ 8%|hp}} {{as|(+ 2% per 100 bonus armor)}}
 *                    {{as|(+ 2% per 100 bonus magic resistance)}} {{as|of target's maximum health)}}
 * It reads "8% (+2% per 100 bonus armor) (+2% per 100 MR) of the target's maximum health". Read
 * block by block, the first block's `(+ 8%` names no stat, the multiplier blocks look like
 * ordinary ratios, and the stat name arrives alone in the fourth. The result was an armor ratio
 * of 2 stored in place of an 8% health payload — on all three of K'Sante W's damage rows —
 * while the entry claimed `derived`.
 *
 * Unbalanced parentheses are the reliable tell and cost nothing to check. This does NOT repair
 * the row; it refuses to let it pass as understood, which is the whole point.
 */
export function hasSplitPayload(value: string): boolean {
  for (const b of findBlocks(value, 'as')) {
    const body = splitArgs(b.inner)[0] ?? '';
    let depth = 0;
    for (const ch of body) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    if (depth !== 0) return true;
  }
  return false;
}

/**
 * True when this `{{as|…}}` body is a "per 100 X" multiplier rather than a payload ratio.
 *
 * THE NESTED BLOCK MUST BE STRIPPED FIRST, and gate 5 found out why. Ambessa Q writes its health
 * payload as `(+ 4% {{as|(+ 1.5% per 100 bonus AD)}} of target's maximum health)` — a payload
 * that CONTAINS a multiplier. Testing the body as written finds "per 100" inside the nested
 * block and lifts the whole payload as though it were the multiplier, so the two swap roles: the
 * bonus-AD ratio ends up carrying a "per 100 maximum health" rider and the real scaling is lost.
 * The stored number then errs in BOTH directions depending on the caster's bonus AD, which is
 * worse than a constant offset because a spot check can land on the value where they coincide.
 */
export function isMultiplierGroup(body: string): boolean {
  let outer = body;
  for (const nested of [...findBlocks(body, 'as')].reverse()) {
    outer = outer.slice(0, nested.start) + ' ' + outer.slice(nested.end);
  }
  return /\(\s*\+/.test(outer) && /per\s+100\b/i.test(outer);
}

/**
 * Read one `(+ N% per 100 X)` group into a multiplier. Returns null when the stat is not one
 * this project models, so the caller can raise an issue rather than store a silent guess.
 */
export function parseMultiplier(
  body: string,
  maxRank: number,
  vars: Record<string, string>,
): RatioMultiplier | null {
  const text = body.replace(/^\s*\(\s*\+\s*/, '').replace(/\)\s*$/, '');
  const after = /per\s+100\s+(.*)$/i.exec(plainText(text) || text);
  const per = ratioStatOf(after?.[1] ?? text);
  if (!per) return null;

  // The magnitude is whatever percentage sits BEFORE "per 100".
  const beforeRaw = substituteVars(text, vars).split(/per\s+100/i)[0] ?? '';
  const nested = findBlocks(beforeRaw, 'ap');
  let per100: Scaling;
  try {
    if (nested.length > 0) {
      per100 = parseRankProgression(substituteVars(nested[0]!.inner, vars), maxRank);
    } else {
      const num = /(-?\d+(?:\.\d+)?)\s*%/.exec(plainText(beforeRaw) || beforeRaw);
      if (!num) return null;
      const v = Number(num[1]);
      per100 = { scaling: 'linear', from: v, to: v };
    }
  } catch {
    return null;
  }
  return {
    per,
    ...(requiresOwner(per) ? { owner: ratioOwnerOf(plainText(text) || text) } : {}),
    per100,
  };
}

export interface ClassifiedRow {
  label: string;
  component?: AbilityComponent;
  /** The second additive term of a row that states both a level-scaled and a per-rank base.
   *  `base` holds one Scaling, so the two are stored as two components that add. */
  extraComponent?: AbilityComponent;
  /** The level-progression block the component's base was read from, with variables already
   *  substituted. Gate 2 re-renders it: the ability box prints a level-scaled value as one
   *  "(based on level)" figure, so this block is the only thing that can check those values. */
  levelSource?: { name: string; inner: string };
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
 * True when a row's VALUE is a bare percentage of something rather than a quantity of damage.
 *
 * Aurelion Sol W is `{{ap|108 to 112}}%` — note the `%` OUTSIDE the block. It is not damage at
 * all: it is a multiplier on a different ability's flat damage. Stored as a damage row it became
 * "108 to 112 magic damage that adds", so casting the ability injected about 108 points of
 * damage that does not exist. Nidalee Q carries two more of the same shape.
 *
 * The tell is structural, not lexical: once the progression blocks and the `{{as}}` ratio blocks
 * are removed, what remains is a `%` sign and nothing else. A real damage row leaves nothing —
 * `{{ap|50 to 170}} {{as|(+ 100% AD)}}` reduces to empty — and a percentage-of-a-stat row keeps
 * its ratio, so neither is caught here. Labels are NOT used: "Increased Physical Damage" is a
 * genuine damage row on Ambessa Q while "Damage Increase" is a modifier on Caitlyn W, and no
 * wording rule separates them reliably.
 */
export function isPercentageModifier(value: string): boolean {
  let rest = value;
  for (const b of [...findBlocks(rest, 'as')].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);
  const hadRatio = rest !== value;
  for (const b of [...findLevelBlocks(rest)].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);
  for (const b of [...findBlocks(rest, 'ap')].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);
  return !hadRatio && /%/.test(plainText(rest));
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
  // A PAYLOAD block need not open with "(+". Malzahar R and Pantheon W write the payload as
  // `{{as|{{ap|10 to 20}}% of target's maximum health}}` — no leading plus — and requiring one
  // dropped the payload entirely, which is why Pantheon W was stored dealing nothing.
  const payloadWithoutPlus =
    !/\(\s*\+/.test(body) && /%/.test(body) && ratioStatOf(plainText(body) || body) !== null;
  if (!/\(\s*\+/.test(body) && !payloadWithoutPlus) return {}; // prose, not a ratio

  // Multiplier groups nested inside the payload are pulled out first, so the payload's own
  // magnitude is read from what remains rather than from the multiplier's number.
  const multipliers: RatioMultiplier[] = [];
  const unreadable: string[] = [];
  let outer = body;
  for (const nestedAs of [...findBlocks(body, 'as')].reverse()) {
    const nestedBody = splitArgs(nestedAs.inner)[0] ?? '';
    if (!isMultiplierGroup(nestedBody)) continue;
    const m = parseMultiplier(nestedBody, maxRank, vars);
    if (m) multipliers.unshift(m);
    else unreadable.push(nestedBody.slice(0, 60));
    outer = outer.slice(0, nestedAs.start) + ' ' + outer.slice(nestedAs.end);
  }
  if (unreadable.length > 0) {
    return { issue: { kind: 'unparsed-ratio', detail: `per-100 group: ${unreadable[0]}` } };
  }

  const text = outer.replace(/^\s*\(\s*\+\s*/, '').replace(/\)\s*$/, '');
  const flat = plainText(text) || text;
  const stat = ratioStatOf(flat);
  if (!stat) return { issue: { kind: 'unknown-stat', detail: text.slice(0, 80) } };

  // A stat both champions possess names a quantity but not a champion. Decide the owner from
  // the same prose the stat came from, and record 'unresolved' where that prose does not say.
  // Gate 1 rejects such a ratio with no owner, so this can never be silently skipped.
  const owner: { owner?: RatioOwner } = requiresOwner(stat)
    ? { owner: ratioOwnerOf(flat) }
    : {};

  const mult = multipliers.length > 0 ? { multipliers } : {};

  // The magnitude is either a nested {{ap|…}} (a ratio that itself scales per rank — 244
  // measured), a nested {{pp|…}} (a ratio that scales by CHAMPION LEVEL — Aphelios's weapons
  // write their bonus-AD ratio that way), or a literal number before the '%'.
  const nested = findBlocks(text, 'ap');
  const nestedLevel = findLevelBlocks(text);
  try {
    if (nested.length > 0) {
      const scaling = parseRankProgression(substituteVars(nested[0]!.inner, vars), maxRank);
      return { ratio: { stat, ...owner, ...mult, ...scaling } };
    }
    if (nestedLevel.length > 0) {
      const scaling = parseLevelProgression(substituteVars(nestedLevel[0]!.inner, vars));
      return { ratio: { stat, ...owner, ...mult, ...scaling } };
    }
    const num = /(-?\d+(?:\.\d+)?)\s*%/.exec(substituteVars(text, vars));
    if (!num) return { issue: { kind: 'unparsed-ratio', detail: text.slice(0, 80) } };
    const v = Number(num[1]);
    return { ratio: { stat, ...owner, ...mult, scaling: 'linear', from: v, to: v } };
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
/**
 * The damage type a ROW's own label names, where it names exactly one.
 *
 * "Magic Damage", "Bonus Physical Damage", "Minimum True Damage" — the label is a statement about
 * that row and it is more specific than the template's ability-level field, which is blank on 249
 * pages and reads "Magic True" on abilities that deal both. Reading it is reading the source; it
 * is what lets an ability with no `damagetype` field still store the rows that name their own.
 */
export function rowDamageType(label: string): DamageType | null {
  const named = (['physical', 'magic', 'true'] as const).filter((k) =>
    new RegExp(`\\b${k}\\s+damage\\b`, 'i').test(label),
  );
  return named.length === 1 ? named[0]! : null;
}

export function classifyRow(
  label: string,
  value: string,
  opts: { maxRank: number; damageType: DamageType; vars: Record<string, string>; index: number },
): ClassifiedRow {
  // Judge the label with any Minimum/Maximum qualifier stripped, so "Minimum Magic Damage"
  // is kept as real damage while "Minimum Total Damage" is still a summary row.
  const { rest: bareLabel } = stripRangeQualifier(label);
  if (!isDamageRow(bareLabel)) return { label, issues: [], dropped: 'not-damage' };
  if (isPercentageModifier(value)) return { label, issues: [], dropped: 'not-damage' };
  if (DERIVED_ROW.test(bareLabel)) return { label, issues: [], dropped: 'derived-row' };
  if (NON_CHAMPION_ROW.test(bareLabel)) return { label, issues: [], dropped: 'non-champion' };

  const issues: RowIssue[] = [];
  const { maxRank, vars } = opts;


  // Ratios first, so what remains is the base.
  const ratioBlocks = findBlocks(value, 'as');
  const ratios: Ratio[] = [];
  // SIBLING MULTIPLIERS. Pantheon W writes the payload and its multipliers as separate
  // top-level blocks: `{{as|6 to 8% of target's maximum health}} {{as|(+ 1.5% per 100 AP)}}
  // {{as|(+ 0.4% per 100 Pantheon's bonus health)}}`. Read independently, each multiplier
  // became its own bogus ratio (a "1.5% AP ratio") and the payload was dropped. They belong
  // to the payload, so lift them out here and attach them after it is parsed.
  const siblingMultipliers: RatioMultiplier[] = [];
  const payloadBlocks = ratioBlocks.filter((b) => {
    const body = splitArgs(b.inner)[0] ?? '';
    if (!isMultiplierGroup(body)) return true;
    const m = parseMultiplier(body, maxRank, vars);
    if (m) siblingMultipliers.push(m);
    else issues.push({ kind: 'unparsed-ratio', detail: `per-100 group: ${body.slice(0, 60)}` });
    return false;
  });
  // Only lift them when there is exactly one payload to attach them to; anything else is
  // ambiguous and must not be guessed at.
  const liftSiblings = siblingMultipliers.length > 0 && payloadBlocks.length === 1;
  for (const b of liftSiblings ? payloadBlocks : ratioBlocks) {
    const { ratio, issue } = parseRatio(b.inner, maxRank, vars);
    if (ratio && liftSiblings) {
      ratio.multipliers = [...(ratio.multipliers ?? []), ...siblingMultipliers];
    }
    if (ratio) {
      ratios.push(ratio);
      // Surface it as an issue, not just as a stored field: this both puts the row on the
      // hand-authoring worklist in the batch report and drives the entry to 'incomplete'.
      // Gate 6 is the backstop if this ever stops happening.
      if (ratio.owner === 'unresolved') {
        issues.push({
          kind: 'unresolved-owner',
          detail: `${ratio.stat}: source does not say whose — "${b.inner
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 70)}"`,
        });
      }
    } else if (issue) issues.push(issue);
  }

  if (hasSplitPayload(value)) {
    issues.push({
      kind: 'split-payload',
      detail:
        'one expression is split across several {{as}} blocks (unbalanced parentheses), so the ' +
        `stat and its percentage were read separately and what is stored is not the ability: ${value
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 110)}`,
    });
  }

  // The coefficient shape is now expressible via Ratio.multipliers, so it is only a defect
  // when the multipliers were NOT captured — then the stored row understates the ability and
  // must not pass as understood. When they were captured, there is nothing left to flag.
  if (hasCoefficientShape(value) && !ratios.some((r) => (r.multipliers?.length ?? 0) > 0)) {
    issues.push({
      kind: 'coefficient-shape',
      detail:
        'a health payload whose percentage is itself scaled ("per 100 …"), and the ' +
        `multiplier could not be read, so what is stored is not the whole ability: ${value
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 110)}`,
    });
  }

  let rest = value;
  for (const b of [...ratioBlocks].reverse()) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);

  // LEVEL-SCALED BASE. A leveling row can state its damage on the champion-level axis with
  // {{pp|…}} instead of the rank axis with {{ap|…}}. Nothing read {{pp}} until 2026-08-13, so
  // any row using it stored no base at all and the ability harvested to zero components.
  // `parseLevelProgression` already existed and was simply never called from here; it applies
  // the same documented linear rule on the level axis (DATA-SOURCES §11).
  const levelBlocks = findLevelBlocks(rest);
  const baseBlocks = findBlocks(rest, 'ap');
  let base: AbilityComponent['base'] | undefined;
  let hasBase = false;
  let secondTerm: AbilityComponent['base'] | undefined;

  // A ROW CAN CARRY BOTH TERMS, AND THE LEVEL ONE USED TO VANISH.
  //
  // Malzahar W is `{{pp|5+3.5*(x-1)*(…)|formula=5 + 10.5 growth}} (+ {{ap|12 to 20}})
  // {{as|(+ 40% bonus AD)}} {{as|(+ 20% AP)}}`: a level-scaled base PLUS a per-rank term PLUS
  // two ratios. The `{{pp}}` path added on 2026-08-13 only fired when a row had no `{{ap}}`, so
  // the rank term won and the level term was dropped in silence — the ability under-reported
  // its damage by a whole component at every champion level (DATA-SOURCES §24).
  //
  // The two terms ADD, and `base` holds one Scaling, so the second is stored as its own
  // component with `relation: 'adds'`. The LEVEL term is the primary one because that is what
  // the wiki renders as the row's base, which keeps gate 2 comparing like with like.
  //
  // If either term is present and unreadable, NEITHER is stored. Storing one of two additive
  // terms is not a partial answer, it is a wrong number that looks like a whole one.
  let levelSource: { name: string; inner: string } | undefined;
  if (levelBlocks.length > 0) {
    try {
      const inner = substituteVars(levelBlocks[0]!.inner, vars);
      base = parseLevelProgression(inner);
      hasBase = true;
      levelSource = { name: levelBlocks[0]!.name, inner };
    } catch (e) {
      issues.push({
        kind: 'unparsed-base',
        detail: `{{pp}} ${levelBlocks[0]!.inner.slice(0, 60)} — ${
          e instanceof ProgressionError ? e.message : String(e)
        }`,
      });
    }
  }
  if (baseBlocks.length > 0) {
    try {
      const rank = parseRankProgression(substituteVars(baseBlocks[0]!.inner, vars), maxRank);
      if (base === undefined && !issues.some((i) => i.kind === 'unparsed-base')) {
        base = rank;
        hasBase = true;
      } else {
        secondTerm = rank;
      }
    } catch (e) {
      issues.push({
        kind: 'unparsed-base',
        detail: `${baseBlocks[0]!.inner.slice(0, 60)} — ${
          e instanceof ProgressionError ? e.message : String(e)
        }`,
      });
    }
  }
  if (levelBlocks.length > 0 && baseBlocks.length > 0 && (base === undefined || secondTerm === undefined)) {
    // One of the two additive terms could not be read. Refuse the row rather than store half.
    return { label, issues };
  }
  if (levelBlocks.length === 0 && baseBlocks.length === 0) {
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
    damageType: rowDamageType(label) ?? opts.damageType,
    base,
    ratios,
    // The relation is PROPOSED here and must be confirmed by an author. Gate 3 refuses any
    // multi-component ability that leaves it unstated, so a wrong guess cannot slip through
    // silently — but a guess that looks right is still a guess, which is why the harvester
    // reports it as a proposal rather than an answer.
    relation: isAlternativeLabel(label) ? undefined : { kind: 'adds' },
    ...(perHit ? { hits: 1 } : {}),
  };

  // The per-rank half of a two-term row. It carries no ratios — they belong to the row as a
  // whole and are already on the primary component, so putting them here too would apply them
  // twice.
  const extraComponent: AbilityComponent | undefined =
    secondTerm === undefined
      ? undefined
      : {
          id: `${component.id}-rank-term`,
          label: `${label} (per-rank term)`,
          damageType: rowDamageType(label) ?? opts.damageType,
          base: secondTerm,
          ratios: [],
          relation: { kind: 'adds' },
          ...(perHit ? { hits: 1 } : {}),
        };

  return {
    label,
    component,
    ...(extraComponent ? { extraComponent } : {}),
    ...(levelSource && isLevelScaled(component.base) ? { levelSource } : {}),
    shape: shapeOf(component, hasBase),
    issues,
  };
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

  // "Increased X" against "X": the empowered form REPLACES the base form.
  const byBareLabel = new Map<string, AbilityComponent>();
  for (const c of components) {
    const label = (c.label ?? c.id).toLowerCase().trim();
    if (!EMPOWERED_QUALIFIER.test(label)) byBareLabel.set(label, c);
  }

  const primary = components.find((c) => {
    const label = c.label ?? c.id;
    return !isAlternativeLabel(label) && stripRangeQualifier(label).bound !== 'max';
  });

  return components.map((c) => {
    const label = c.label ?? c.id;
    const empowered = EMPOWERED_QUALIFIER.exec(label);
    if (empowered) {
      const base = byBareLabel.get(label.slice(empowered[0].length).toLowerCase().trim());
      if (base && base.id !== c.id) return { ...c, relation: { kind: 'alternativeTo', componentId: base.id } };
    }
    const { rest, bound } = stripRangeQualifier(label);
    if (bound === 'max') {
      const paired = minByRest.get(rest.toLowerCase().trim());
      if (paired && paired.id !== c.id) {
        return { ...c, relation: { kind: 'alternativeTo', componentId: paired.id } };
      }
    }
    if (!isAlternativeLabel(label)) return { ...c, relation: { kind: 'adds' } };
    if (!primary || primary.id === c.id) return { ...c, relation: { kind: 'adds' } };
    return { ...c, relation: { kind: 'alternativeTo', componentId: primary.id } };
  });
}
