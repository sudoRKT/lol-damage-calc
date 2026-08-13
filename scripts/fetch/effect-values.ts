// Reading the VALUE out of an item or rune effect the source states structurally.
//
// The census (`effect-census.ts`) counted 63 effects whose source "wraps the damage type and
// the number together" (DATA-SOURCES §37.2). This file reads those numbers. It writes nothing
// and fetches nothing — it turns one effect's text into either a set of contract-shaped damage
// components, or a REFUSAL naming what stopped it.
//
// TWO RULES GOVERN EVERYTHING BELOW.
//
// 1. **A row that cannot be read in full is not stored in part** (DATA-SOURCES §27). Every
//    token inside a damage run must be recognised. An unrecognised one refuses the whole
//    effect rather than being skipped, because a skipped `(+ 1.5 per 1 lethality)` produces a
//    number that is plausible, itemised, and too small — the failure this project exists to
//    prevent.
// 2. **A detector proposes, a person confirms** (CLAUDE.md). Nothing here decides what may be
//    stored. `effect-values-read.ts` records one person's reading of each of the 63 sentences,
//    and `extract-values.ts` stores a value only where this parser and that reading agree.
//
// Pure: no network, no filesystem. Tested by effect-values.test.ts.

import type { DamageType, Ratio, RatioOwner, RatioStat, Scaling } from '../../src/types/data.ts';
import { asRuns, type EffectRecord } from './effect-census.ts';
import { plainText, type Block } from './effect-text.ts';

// ---------------------------------------------------------------------------
// What a refusal can be. Each value is a CLASS, and each class is swept over the whole
// 291-effect population by `extract-values.ts` — never fixed on the one effect that surfaced it.
// ---------------------------------------------------------------------------

export type RefusalReason =
  /** `{{rd|melee|ranged}}` sits inside the damage run: the source states TWO values, one for a
   *  melee holder and one for a ranged holder, and `AbilityComponent` can hold one. */
  | 'melee-ranged-split'
  /** Scales on lethality. `RatioStat` has no lethality arm. */
  | 'scales-on-lethality'
  /** Scales on critical strike chance. `RatioStat` has no crit-chance arm. */
  | 'scales-on-crit-chance'
  /** Scales on a stack counter the effect itself accumulates, on the BASE rather than as a
   *  ratio. `Scaling` walks ability rank or champion level; neither is a stack count. */
  | 'scales-on-stacks'
  /** The source states an interval at which the damage recurs. SPECIFICATION §3.8 requires
   *  damage over time to be a separate line, and no field on `CuratedItemEffect` or
   *  `AbilityComponent` can say that an item effect is one. */
  | 'damage-over-time'
  /** The damage type the source names is "adaptive". `DamageType` is physical/magic/true. */
  | 'adaptive-damage-type'
  /** The source states a range ("70 - 240") and never states what varies across it. */
  | 'range-with-unstated-axis'
  /** The source states the damage only reaches minions, wards, turrets or monsters. */
  | 'non-champion-target-only'
  /** The damage reaches only enemies OTHER than the one attacked. A two-champion scenario
   *  (SPECIFICATION §1) has no other enemy, so it can never reach the defender. */
  | 'other-enemies-only'
  /** The damage is granted to an allied champion. A two-champion scenario has no ally. */
  | 'ally-only'
  /** The holder does not deal this damage; it is dealt back at whoever struck the holder. */
  | 'retaliation'
  /** More damage is added on a condition the contract cannot express. */
  | 'conditional-additional-damage'
  /** A token inside the damage run that this parser does not recognise. Always quoted. */
  | 'unparsed-token'
  /** No `{{as}}` run in this text names a damage type and carries a value. */
  | 'no-structural-damage-run'
  /** The run names two different damage types and nothing says which value carries which. */
  | 'ambiguous-damage-type'
  /** The parser read a value the recorded hand reading disagrees with. */
  | 'parser-disagrees-with-reading'
  /** Nobody has read this sentence. Reported, never stored. */
  | 'not-in-read-population';

export interface Refusal {
  reason: RefusalReason;
  /** Plain English, naming the words it rests on. */
  detail: string;
}

/** A ratio as this file reads it, before it becomes a contract `Ratio`. */
export interface ReadRatio {
  stat: RatioStat;
  /** Percentage POINTS, per `Ratio`'s documented unit — `(+ 15% AP)` is 15, never 0.15. */
  value: number;
  /** Required on the ten owner-required stats. `holder` is the item's wearer. */
  owner?: RatioOwner;
}

export interface ReadComponent {
  damageType: DamageType;
  /** Flat base. `null` when the run states no flat number (Sheen is a base-AD ratio only). */
  base: number | null;
  /** Present instead of `base` when the flat part scales by champion level. */
  baseScaling?: Scaling;
  ratios: ReadRatio[];
}

export interface Extraction {
  /** The `{{as}}` run the value was read from, as the source writes it. */
  sourceRun: string;
  component: ReadComponent | null;
  refusals: Refusal[];
  /** Damage runs after the first. A second run is usually a non-champion variant
   *  ("increased to 90 against non-champions") and is never merged into the first. */
  furtherDamageRuns: number;
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/** Split on `|` at brace depth 0, so a nested template is never cut in half. */
export function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{' && body[i + 1] === '{') {
      depth++;
      current += '{{';
      i++;
      continue;
    }
    if (body[i] === '}' && body[i + 1] === '}') {
      depth--;
      current += '}}';
      i++;
      continue;
    }
    if (body[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += body[i];
  }
  parts.push(current);
  return parts;
}

/** Positional arguments only — `color=pd` and friends are formatting, never values. */
function positional(body: string): string[] {
  return splitTopLevel(body).filter((p) => !/^\s*[a-z0-9 _-]+\s*=/i.test(p));
}

/** Named arguments, lowercased keys. */
function named(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(body)) {
    const m = /^\s*([a-z0-9 _-]+)\s*=([\s\S]*)$/i.exec(part);
    if (m) out[m[1]!.trim().toLowerCase()] = m[2]!.trim();
  }
  return out;
}

/**
 * Evaluate the constant arithmetic the wiki writes inside `{{ap|…}}` in item text.
 *
 * `{{ap|60/6}}` is not a rank progression — it is the module's calculator, used so the page
 * shows a per-tick figure derived from the total. Only digits and `+ - * / ( ) .` are accepted,
 * so nothing here can execute anything; an `x` (the rank variable) or a `to` returns null and
 * the caller refuses.
 */
export function evalArithmetic(expr: string): number | null {
  const trimmed = expr.trim();
  if (trimmed === '' || !/^[\d\s.+\-*/()]+$/.test(trimmed)) return null;
  if (!/\d/.test(trimmed)) return null;
  let value: unknown;
  try {
    // eslint-disable-next-line no-new-func -- input is restricted to digits and arithmetic above.
    value = Function(`"use strict"; return (${trimmed});`)();
  } catch {
    return null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const PP_MARKER = '«pp:';
const RD_MARKER = '«rd»';
const FT_MARKER = '«ft»';

/**
 * Flatten one `{{as}}` block's DISPLAY argument to plain words, resolving the templates whose
 * meaning is arithmetic and marking the ones whose meaning is structural.
 *
 * Anything not listed becomes `«tpl:name»`, which the tokenizer refuses. Silence about
 * an unknown wrapper is how a value gets dropped without anyone noticing.
 */
export function resolveDisplay(text: string): string {
  let out = text;
  for (let pass = 0; pass < 12 && out.includes('{{'); pass++) {
    const before = out;
    out = out.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => {
      const parts = splitTopLevel(String(inner));
      const head = (parts[0] ?? '').trim().toLowerCase();
      const args = positional(String(inner)).slice(1);
      const kw = named(String(inner));
      if (head.startsWith('#vardefineecho')) return ` ${args[0] ?? ''} `;
      if (head === 'fd' || head === 'format decimal') return ` ${args[0] ?? ''} `;
      if (head === 'ap') {
        const value = evalArithmetic(args[0] ?? '');
        return value === null ? ` «ap:${args[0] ?? ''}» ` : ` ${value} `;
      }
      if (head === 'pp' || head === 'pplevel') {
        const levels = args[1] ?? '';
        const extra = Object.keys(kw).filter((k) => k !== 'tooltipsize');
        return ` ${PP_MARKER}${(args[0] ?? '').trim()}|${levels.trim()}|${extra.join(',')}» `;
      }
      if (head === 'rd' || head === 'range difference') return ` ${RD_MARKER} `;
      if (head === 'ft') return ` ${FT_MARKER} `;
      if (head === 'as' || head === 'ability scaling') return ` ${args[0] ?? ''} `;
      if (head === 'tip' || head === 'sti' || head === 'stil' || head === 'ii') {
        return ` ${args.at(-1) ?? ''} `;
      }
      if (head === 'tt') return ` ${args[0] ?? ''} `;
      return ` «tpl:${head}» `;
    });
    if (out === before) break;
  }
  return plainText(out);
}

// ---------------------------------------------------------------------------
// Tokenizing one damage run
// ---------------------------------------------------------------------------

const POOL_STATS: Record<string, RatioStat> = {
  'bonus health': 'bonusHP',
  'maximum health': 'maxHP',
  'max health': 'maxHP',
  'current health': 'currentHP',
  'missing health': 'missingHP',
  'bonus armor': 'bonusArmor',
  'bonus armour': 'bonusArmor',
  armor: 'armor',
  armour: 'armor',
  'bonus magic resistance': 'bonusMagicResist',
  'bonus magic resist': 'bonusMagicResist',
  'magic resistance': 'magicResist',
  'magic resist': 'magicResist',
  'maximum mana': 'maxMana',
  'max mana': 'maxMana',
  'bonus mana': 'maxMana',
  'current mana': 'currentMana',
};

const OWNER_WORDS: Record<string, RatioOwner> = {
  "target's": 'target',
  "targets'": 'target',
  "enemy's": 'target',
  "enemies'": 'target',
  their: 'target',
  your: 'holder',
  yours: 'holder',
  his: 'holder',
  her: 'holder',
  "holder's": 'holder',
  "wielder's": 'holder',
};

/** Words a damage run may contain that carry no value. Anything else refuses the run. */
const NOISE =
  /^(?:bonus|base|total|extra|additional|physical|magic|true|damage|on-hit|on hit|onhit|as|of|the|a|an|to|and|equal to|them|him|her|it|each|per|hit|ad|ap|hp|mana|health|attack damage|ability power|life ?steal|effectiveness|at|100%)$/i;

const DAMAGE_TYPE_RE = /\b(physical|magic|true|adaptive)\s+damage\b/gi;

interface TokenResult {
  base: number | null;
  baseScaling?: Scaling;
  ratios: ReadRatio[];
  refusals: Refusal[];
}

/**
 * Read a flattened run left to right, consuming one recognised construct at a time.
 *
 * ORDER MATTERS AND IS NOT COSMETIC. Every percentage form is tried before the bare-number
 * form, or `15% AP` would be read as a flat 15 and an unparsed `% AP`.
 */
export function tokenizeRun(flat: string): TokenResult {
  const out: TokenResult = { base: null, ratios: [], refusals: [] };
  let rest = flat
    .replace(/'''|''/g, '')
    .replace(/[()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const ownerPrefix = "(?:of\\s+)?(?:the\\s+|each\\s+)?(target's|targets'|enemy's|enemies'|their|your|yours|his|her|holder's|wielder's)?\\s*";
  const poolNames = Object.keys(POOL_STATS)
    .sort((a, b) => b.length - a.length)
    .join('|');

  const patterns: {
    re: RegExp;
    take: (m: RegExpExecArray) => Refusal | null;
  }[] = [
    // "1.5 per 1 lethality" — named before any number rule so it cannot read as a flat base.
    {
      re: new RegExp(`^[\\d.]+\\s*per\\s*1?\\s*lethality`, 'i'),
      take: (m) => ({
        reason: 'scales-on-lethality',
        detail: `the run scales on lethality ("${m[0].trim()}"); RatioStat has no lethality arm`,
      }),
    },
    {
      re: /^«pp:[^»]*critical strike chance[^»]*»/i,
      take: () => ({
        reason: 'scales-on-crit-chance',
        detail: 'the run scales on critical strike chance; RatioStat has no crit-chance arm',
      }),
    },
    {
      re: /^based on critical strike chance/i,
      take: () => ({
        reason: 'scales-on-crit-chance',
        detail: 'the run says "based on critical strike chance"',
      }),
    },
    {
      re: new RegExp(`^${RD_MARKER}`),
      take: () => ({
        reason: 'melee-ranged-split',
        detail:
          'the damage run contains {{rd|melee|ranged}} — the source states one value for a melee ' +
          'holder and a different one for a ranged holder, and AbilityComponent can hold one',
      }),
    },
    {
      re: new RegExp(`^${FT_MARKER}`),
      take: () => ({
        reason: 'unparsed-token',
        detail: 'a {{ft}} footnote sits inside the damage run; its contents were not read',
      }),
    },
    // A level progression as the flat base: {{pp|175 to 253}}.
    {
      re: /^«pp:([^|»]*)\|([^|»]*)\|([^»]*)»/,
      take: (m) => {
        const [, range, levels, extra] = m;
        if (extra !== '') {
          return {
            reason: 'unparsed-token',
            detail: `{{pp}} carries named arguments this parser does not read: ${extra}`,
          };
        }
        if (levels !== '') {
          return {
            reason: 'unparsed-token',
            detail: `{{pp}} states its own level positions ("${levels}"); not read here`,
          };
        }
        const simple = /^\s*([\d.]+)\s*to\s*([\d.]+)\s*$/.exec(range ?? '');
        if (!simple) {
          return {
            reason: 'unparsed-token',
            detail: `{{pp|${range}}} is not a plain "X to Y" progression`,
          };
        }
        if (out.base !== null || out.baseScaling) {
          return { reason: 'unparsed-token', detail: 'two flat bases in one run' };
        }
        // Module:Ability progression, read live: pp's defaultSize is 18, and the linear fill
        // places `from` at level 1 and `to` at level 18. `tooltipSize` only ADDS extrapolated
        // cells past level 18 — the DATA-SOURCES §13 trap — and is deliberately ignored.
        out.baseScaling = {
          scaling: 'byLevel',
          from: Number(simple[1]),
          to: Number(simple[2]),
          atLevels: [1, 18],
          steps: 18,
        };
        return null;
      },
    },
    // "15% AP", "45% ability power"
    {
      re: /^([\d.]+)\s*%\s*(?:ap|ability power)\b/i,
      take: (m) => {
        out.ratios.push({ stat: 'AP', value: Number(m[1]) });
        return null;
      },
    },
    // "100% base AD", "10% bonus AD", "80% AD"
    {
      re: /^([\d.]+)\s*%\s*(bonus|base|total)?\s*(?:ad|attack damage)\b/i,
      take: (m) => {
        const kind = (m[2] ?? '').toLowerCase();
        out.ratios.push({
          stat: kind === 'bonus' ? 'bonusAD' : kind === 'base' ? 'baseAD' : 'totalAD',
          value: Number(m[1]),
        });
        return null;
      },
    },
    // "6% maximum health", "10% of the target's current health", "10% bonus armor"
    {
      re: new RegExp(`^([\\d.]+)\\s*%\\s*${ownerPrefix}(${poolNames})\\b`, 'i'),
      take: (m) => {
        const stat = POOL_STATS[(m[3] ?? '').toLowerCase()]!;
        const owner = m[2] ? OWNER_WORDS[m[2].toLowerCase()] : undefined;
        out.ratios.push({ stat, value: Number(m[1]), owner: owner ?? 'unresolved' });
        return null;
      },
    },
    // A percentage of something this parser does not recognise. Never skipped.
    {
      re: /^([\d.]+)\s*%\s*([a-z' ]{0,30})/i,
      take: (m) => ({
        reason: 'unparsed-token',
        detail: `an unrecognised percentage: "${m[0].trim()}"`,
      }),
    },
    // A bare number: the flat base.
    {
      re: /^([\d.]+)\b/,
      take: (m) => {
        if (out.base !== null || out.baseScaling) {
          return {
            reason: 'unparsed-token',
            detail: `a second flat number in one run: "${m[0]}"`,
          };
        }
        out.base = Number(m[1]);
        return null;
      },
    },
    // Multi-word noise, longest first.
    {
      re: /^(?:physical damage|magic damage|true damage|adaptive damage|attack damage|ability power|equal to|life steal|lifesteal|on-hit|on hit)\b/i,
      take: () => null,
    },
    { re: /^[a-z'’°-]+/i, take: (m) => (NOISE.test(m[0]) ? null : {
      reason: 'unparsed-token',
      detail: `an unrecognised word inside the damage run: "${m[0]}"`,
    }) },
  ];

  let guard = 0;
  while (rest.length > 0 && guard++ < 200) {
    rest = rest.replace(/^[\s,.;:+/|]+/, '');
    if (rest.length === 0) break;
    let matched = false;
    for (const { re, take } of patterns) {
      const m = re.exec(rest);
      if (!m) continue;
      const refusal = take(m);
      if (refusal) out.refusals.push(refusal);
      rest = rest.slice(m[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      out.refusals.push({
        reason: 'unparsed-token',
        detail: `nothing in this parser matches: "${rest.slice(0, 40)}"`,
      });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Whole-effect checks, each a class swept over the population
// ---------------------------------------------------------------------------

/**
 * The source states an interval at which the damage recurs.
 *
 * Written as a check over the WHOLE population rather than a fix on Sunfire, per CLAUDE.md's
 * standing rule. "every second", "every 0.5 seconds", "over 3 seconds", "per tick".
 */
export const RECURRING_INTERVAL =
  /\bevery\s+(?:[\d.]+\s+)?seconds?\b|\bper\s+(?:tick|second)\b|\bover\s+[\d.]+\s+seconds\b/i;

export function statesARecurringInterval(text: string): string | null {
  const m = RECURRING_INTERVAL.exec(plainText(text));
  return m ? m[0] : null;
}

/**
 * The sentence containing a given offset, split at `.` or `;` at brace depth 0.
 *
 * POSITION, NOT THE WORD. Testing the whole effect text for an interval refused Stridebreaker's
 * active, whose damage is a single instance and whose "over 3 seconds" belongs to a MOVEMENT
 * SPEED decay two sentences later. That is the same defect DATA-SOURCES §37.4 records twice —
 * a gerund read as a trigger wherever it appeared, and shield wording tested flatly over a
 * sentence — and it is fixed the same way, by asking where the words are.
 */
export function sentenceAround(text: string, index: number): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i++;
      continue;
    }
    if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && (text[i] === '.' || text[i] === ';') && /\s/.test(text[i + 1] ?? ' ')) {
      if (i >= index) return text.slice(start, i + 1);
      start = i + 1;
    }
  }
  return text.slice(start);
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

function runText(blocks: Block[], source: string): string {
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  return source.slice(first.start, last.end);
}

/** Display text of a run: the first positional argument of every `{{as}}` block, joined. */
function runDisplay(blocks: Block[]): string {
  return blocks.map((b) => resolveDisplay(positional(b.body)[0] ?? '')).join(' ');
}

/** The colour keys — `{{as|30|magic damage}}`'s second argument. Corroborates the type. */
function runColourKeys(blocks: Block[]): string[] {
  return blocks.map((b) => (positional(b.body)[1] ?? '').trim().toLowerCase()).filter((s) => s !== '');
}

function damageTypesIn(text: string): DamageType[] {
  const found = new Set<string>();
  DAMAGE_TYPE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DAMAGE_TYPE_RE.exec(text)) !== null) found.add(m[1]!.toLowerCase());
  return [...found] as DamageType[];
}

/**
 * Read an item effect's first damage run.
 *
 * Runes are not handled here: their prose carries no wrappers at all, so there is no run to
 * read. All five rune effects the census calls structural are refused by the read population
 * for reasons the parser could not establish anyway — see `effect-values-read.ts`.
 */
export function extractItemEffect(record: EffectRecord): Extraction {
  const runs = asRuns(record.text);
  const damageRuns = runs.filter((run) => {
    const display = runDisplay(run.blocks);
    const keys = runColourKeys(run.blocks).join(' ');
    return damageTypesIn(`${display} ${keys}`).length > 0;
  });

  if (damageRuns.length === 0) {
    return {
      sourceRun: '',
      component: null,
      refusals: [
        {
          reason: 'no-structural-damage-run',
          detail: 'no {{as}} run in this text names a damage type',
        },
      ],
      furtherDamageRuns: 0,
    };
  }

  const run = damageRuns[0]!;
  const source = runText(run.blocks, record.text);
  const display = runDisplay(run.blocks);
  const keys = runColourKeys(run.blocks);
  const refusals: Refusal[] = [];

  const types = damageTypesIn(`${display} ${keys.join(' ')}`);
  if (types.includes('adaptive' as DamageType)) {
    refusals.push({
      reason: 'adaptive-damage-type',
      detail: 'the source calls this "adaptive damage"; DamageType is physical | magic | true',
    });
  }
  const concrete = types.filter((t) => t !== ('adaptive' as DamageType));
  if (concrete.length > 1) {
    refusals.push({
      reason: 'ambiguous-damage-type',
      detail: `the run names ${concrete.length} damage types (${concrete.join(', ')})`,
    });
  }

  const interval = statesARecurringInterval(sentenceAround(record.text, run.blocks[0]!.start));
  if (interval) {
    refusals.push({
      reason: 'damage-over-time',
      detail:
        `the sentence stating this damage also states that it recurs ("${interval}"). ` +
        'SPECIFICATION §3.8 requires ' +
        'damage over time to be a separate line, and no field on CuratedItemEffect or ' +
        'AbilityComponent can record that an item effect is one',
    });
  }

  const tokens = tokenizeRun(display);
  refusals.push(...tokens.refusals);

  // A RUN THAT NAMES A DAMAGE TYPE AND CARRIES NO VALUE IS A TRIGGER, NOT AN INSTANCE.
  // "Dealing {{as|physical damage}} to an enemy champion applies a stack of Carve" (Black
  // Cleaver) names physical damage and deals none. Without this the parser produced a component
  // with a base of zero on 20 effects outside the read population — an itemised line worth
  // nothing, which is worse than no line. DATA-SOURCES §37.4 defect 1, the same defect the
  // census found in its own first run, rediscovered here because this file rebuilt the check.
  if (tokens.base === null && !tokens.baseScaling && tokens.ratios.length === 0) {
    refusals.push({
      reason: 'no-structural-damage-run',
      detail:
        'the run names a damage type and carries no value — a trigger phrase, not a damage ' +
        'instance',
    });
  }

  const component: ReadComponent | null =
    refusals.length === 0 && concrete.length === 1
      ? {
          damageType: concrete[0]!,
          base: tokens.baseScaling ? null : tokens.base,
          ...(tokens.baseScaling ? { baseScaling: tokens.baseScaling } : {}),
          ratios: tokens.ratios,
        }
      : null;

  if (component === null && refusals.length === 0) {
    refusals.push({
      reason: 'no-structural-damage-run',
      detail: 'the run names no concrete damage type',
    });
  }

  return {
    sourceRun: source,
    component,
    refusals,
    furtherDamageRuns: damageRuns.length - 1,
  };
}

// ---------------------------------------------------------------------------
// Turning a reading into the frozen contract's shapes
// ---------------------------------------------------------------------------

/**
 * An item effect has no ranks, so a constant is stored as a one-entry `explicit` list — a
 * literal value used verbatim, which is exactly what that arm is defined as. It is NOT stored
 * as `linear from: v to: v`, which would claim a rank progression the item does not have.
 *
 * FLAGGED FOR THE LEAD: this is an interpretation of a frozen type, not a change to it. If the
 * engine indexes `explicit.perRank` by ability rank, an item effect must be read at index 0.
 */
export function constantScaling(value: number): Scaling {
  return { scaling: 'explicit', perRank: [value] };
}

export function toContractRatios(ratios: ReadRatio[]): Ratio[] {
  return ratios.map((r) => ({
    stat: r.stat,
    ...(r.owner ? { owner: r.owner } : {}),
    ...constantScaling(r.value),
  }));
}
