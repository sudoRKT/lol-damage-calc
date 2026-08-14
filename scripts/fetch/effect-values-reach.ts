// THE SECOND REACH — two damage figures the top-level `{{as}}`-run scan cannot see.
//
// WHY THIS FILE EXISTS. `effect-text.ts`'s `findBlocks` reports templates at the OUTERMOST
// nesting level only: once it matches one it advances past the whole thing. Every path in this
// pipeline is built on that scan — the census's damage verdict, the value parser, the gate — so
// an `{{as}}` block sitting inside another template is invisible to all three at once, and
// invisible in the same way. Nothing ever contradicted anything, which is why it went unnoticed.
//
// MEASURED over the live 229 item effects on 2026-08-14. Both populations are small enough to
// have been read one sentence at a time, which is the only reason either is allowed to store:
//
//   SHAPE A — THE FIGURE IS INSIDE A `{{ft}}` FOOTNOTE. 11 item effects carry an `{{as}}` block
//     that no `as` block encloses, and in all 11 the wrapper is `{{ft}}`, the wiki's footnote:
//     argument 1 is the sentence a reader sees, argument 2 is the detail behind it. For a burn
//     the pair is "this much per tick" and "this much in total" — the SAME fact stated twice,
//     which is precisely the evidence a recurrence count needs and the only place the item
//     module ever puts it.
//
//   SHAPE B — THE DAMAGE TYPE AND ITS VALUE SIT IN TWO RUNS BRIDGED BY "equal to". Blade of the
//     Ruined King writes `{{as|bonus physical damage}} [[on-hit]] equal to {{as|9% / 6% of the
//     target's current health}}`. DATA-SOURCES §26.3's R2 allows ONE bounded connective between
//     two blocks and nothing else, so a wiki link or the words "to them" breaks the join and the
//     halves are read as two runs — one naming a type with no value, one carrying a value with
//     no type. Neither is a damage instance on its own.
//
// THE GUARD ON SHAPE B IS THE WHOLE POINT, AND BLACK CLEAVER IS WHY. It writes
// `{{as|physical damage}} … Each stack inflicts {{as|6% armor reduction}}` — a type run followed
// by a value run, where the value is NOT that damage but an armor reduction in a different
// clause a hundred characters away. TEN pairs in the item module have that outer shape and only
// TWO are one figure. So the bridge is accepted only when everything between the two runs
// reduces to the words "equal to", carries no digit, and is short; and both members of the
// resulting population were read by hand before anything was stored.
//
// NOTHING HERE STORES A VALUE. `effect-values-gate.ts` decides that, and only where a recorded
// reading in `effect-values-read-reach.ts` independently agrees.
//
// Pure: no network, no filesystem. Tested by effect-values-reach.test.ts.

import { asRuns, type EffectRecord } from './effect-census.ts';
import { findBlocks, plainText, type Block } from './effect-text.ts';
import {
  extractItemEffect,
  splitTopLevel,
  type Extraction,
  type ReadOverTime,
  type Refusal,
  type TokenResult,
} from './effect-values.ts';

// ---------------------------------------------------------------------------
// How much the outermost-level scan misses — the measurement, kept separate on purpose
// ---------------------------------------------------------------------------

/** One `{{as}}` block and the chain of templates enclosing it, outermost first. */
export interface NestedAs {
  start: number;
  end: number;
  enclosedBy: string[];
}

/**
 * Every `{{as}}` block in `text` at ANY depth, with what encloses it.
 *
 * DELIBERATELY A SEPARATE FUNCTION rather than a change to `findBlocks`. The census's 63-effect
 * structural population is a documented, tested figure (DATA-SOURCES §37.2); quietly deepening
 * the scan underneath it would move that figure without anyone deciding to. This measures the
 * gap instead, and the new population is gated on its own recorded readings.
 */
export function nestedAsBlocks(text: string): NestedAs[] {
  const open: number[] = [];
  const out: NestedAs[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      open.push(i);
      i++;
      continue;
    }
    if (text[i] === '}' && text[i + 1] === '}') {
      const start = open.pop();
      i++;
      if (start === undefined) continue;
      const inner = text.slice(start + 2, i - 1);
      const bar = inner.indexOf('|');
      const name = (bar === -1 ? inner : inner.slice(0, bar)).trim().toLowerCase();
      if (name !== 'as') continue;
      const enclosedBy = open.map((position) => {
        const nextBar = text.indexOf('|', position);
        return text
          .slice(position + 2, nextBar === -1 ? position + 10 : nextBar)
          .trim()
          .toLowerCase();
      });
      out.push({ start, end: i + 1, enclosedBy });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Does this effect carry an `{{as}}` block the outermost-level scan cannot see?
 *
 * "Cannot see" means the block is nested AND no `as` block encloses it. A block inside another
 * `{{as}}` IS seen, because `resolveDisplay` walks an outer block's body — counting those would
 * overstate the gap by nine effects (20 have a nested block; 11 have a hidden one).
 */
export function hasHiddenAsBlock(text: string): boolean {
  return nestedAsBlocks(text).some((b) => b.enclosedBy.length > 0 && !b.enclosedBy.includes('as'));
}

/** The wrapper names that hide an `{{as}}` block, so a NEW one is reported, not absorbed. */
export function hidingWrappers(text: string): string[] {
  const names = new Set<string>();
  for (const block of nestedAsBlocks(text)) {
    if (block.enclosedBy.length === 0 || block.enclosedBy.includes('as')) continue;
    names.add(block.enclosedBy[block.enclosedBy.length - 1]!);
  }
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// SHAPE A — the footnote
// ---------------------------------------------------------------------------

/** The positional arms of every top-level `{{ft|displayed|footnote}}` in `text`. */
export function footnoteArms(text: string): string[][] {
  return findBlocks(text, 'ft').map((block: Block) => splitTopLevel(block.body));
}

/**
 * The wiki's own word for a summed figure. Argument 2 of a `{{ft}}` is read as a TOTAL only when
 * it says so — "6% of the target's maximum health '''total''' magic damage over 3 seconds".
 *
 * Without this test an unrelated footnote would be divided into a damage figure it has nothing
 * to do with: Heartsteel's footnote is a permanent health grant, Essence Reaver's is mana
 * restored. Both sit in exactly the same position as Liandry's total.
 */
export const SAYS_TOTAL = /\btotal\b/i;

/**
 * How many instances land, derived from two figures the SOURCE states.
 *
 * NOT FROM THE `{{ap|X/N}}` DIVISOR, and that is the trap this function exists to avoid. The
 * item module writes one notation with two opposite meanings:
 *
 *   - Blackfire Torch `{{ap|60/6}}` — the TOTAL over the INSTANCE COUNT. N is 6, and 6 land.
 *   - Malignance      `{{ap|60/4}}` — damage per SECOND over TICKS PER SECOND. N is 4, and 12
 *                                     land, because the zone lasts three seconds.
 *
 * Reading N as the count gives Malignance a third of its damage — a plausible wrong number.
 * So the count is derived instead: total ÷ per-instance, computed independently for the flat
 * base and for EVERY ratio, and believed only when all of them yield the same whole number of
 * at least 2.
 *
 * WHAT THAT BUYS, STATED PLAINLY, because it is a weaker claim than "the source writes the
 * count down": the count is not read off the page. It is the quotient of two figures the source
 * writes, no elapsed time is divided by anything (SPECIFICATION §3.2), and the one property the
 * engine relies on holds exactly — `perInstance × count` reproduces the total the source states.
 */
export function derivedInstanceCount(
  tick: TokenResult,
  total: TokenResult,
): { count: number } | { refusal: string } {
  const pairs: { what: string; tick: number; total: number }[] = [];

  if (tick.base !== null && tick.base !== 0) {
    pairs.push({ what: 'the flat base', tick: tick.base, total: total.base ?? 0 });
  } else if ((total.base ?? 0) !== 0) {
    return {
      refusal: `the stated total carries a flat ${total.base} the per-instance figure does not`,
    };
  }
  if (tick.ratios.length !== total.ratios.length) {
    return {
      refusal: `the per-instance figure carries ${tick.ratios.length} ratios and the stated total carries ${total.ratios.length}`,
    };
  }
  for (let i = 0; i < tick.ratios.length; i++) {
    const a = tick.ratios[i]!;
    const b = total.ratios[i]!;
    if (a.stat !== b.stat) {
      return { refusal: `ratio ${i + 1}: per instance ${a.stat}, stated total ${b.stat}` };
    }
    if ((a.owner ?? null) !== (b.owner ?? null)) {
      return {
        refusal: `ratio ${i + 1} (${a.stat}) owner: per instance ${a.owner ?? 'none'}, stated total ${b.owner ?? 'none'}`,
      };
    }
    if (a.value === undefined || b.value === undefined) {
      return {
        refusal: `ratio ${i + 1} (${a.stat}) is a melee/ranged pair; no recurrence count is derived across one`,
      };
    }
    pairs.push({ what: `the ${a.stat} ratio`, tick: a.value, total: b.value });
  }
  if (pairs.length === 0) return { refusal: 'neither figure carries a value to divide' };

  const witnesses: { what: string; count: number }[] = [];
  for (const pair of pairs) {
    if (pair.tick === 0) return { refusal: `${pair.what} is zero per instance` };
    const quotient = pair.total / pair.tick;
    const rounded = Math.round(quotient);
    if (Math.abs(quotient - rounded) > 1e-9) {
      return {
        refusal: `${pair.what}: ${pair.total} ÷ ${pair.tick} is ${quotient}, which is not a whole number of instances`,
      };
    }
    witnesses.push({ what: pair.what, count: rounded });
  }
  if (new Set(witnesses.map((w) => w.count)).size > 1) {
    return {
      refusal: `the figures disagree about how many instances land: ${witnesses
        .map((w) => `${w.what} says ${w.count}`)
        .join(', ')}`,
    };
  }
  const count = witnesses[0]!.count;
  if (count < 2) {
    return { refusal: `the stated total equals one instance, so nothing recurs (count ${count})` };
  }
  return { count };
}

/** Read one `{{ft}}` as "per instance, and the total", where its two arms say so. */
function extractFromFootnote(record: EffectRecord): Extraction | null {
  for (const arms of footnoteArms(record.text)) {
    const perInstanceArm = arms[0];
    if (perInstanceArm === undefined) continue;
    const tick = extractItemEffect({ ...record, text: perInstanceArm });
    if (!tick.component && tick.refusals.every((r) => r.reason === 'no-structural-damage-run')) {
      // This footnote is not about damage at all. Try the next one rather than refusing the
      // effect: Fiendhunter Bolts and Sundered Sky each carry two.
      continue;
    }
    const refusals: Refusal[] = [...tick.refusals];
    let overTime: ReadOverTime | undefined = tick.overTime;

    const totalArm = arms[1];
    if (tick.component && totalArm !== undefined && SAYS_TOTAL.test(plainText(totalArm))) {
      const total = extractItemEffect({ ...record, text: totalArm });
      if (!total.component) {
        refusals.push({
          reason: 'dot-total-disagrees-with-tick',
          detail:
            'the footnote states a total and this parser could not read it: ' +
            (total.refusals[0]?.detail ?? 'no reason given'),
        });
      } else if (total.component.damageType !== tick.component.damageType) {
        refusals.push({
          reason: 'dot-total-disagrees-with-tick',
          detail: `the per-instance figure is ${tick.component.damageType} damage and the stated total is ${total.component.damageType}`,
        });
      } else if (!overTime) {
        refusals.push({
          reason: 'dot-total-disagrees-with-tick',
          detail:
            'the footnote states a TOTAL, so something recurs, but the sentence stating the ' +
            'per-instance figure names no interval — one of the two is being misread',
        });
      } else {
        const derived = derivedInstanceCount(
          { base: tick.component.base, ratios: tick.component.ratios, refusals: [] },
          { base: total.component.base, ratios: total.component.ratios, refusals: [] },
        );
        if ('refusal' in derived) {
          refusals.push({ reason: 'dot-total-disagrees-with-tick', detail: derived.refusal });
        } else {
          overTime = { ...overTime, totalInstances: derived.count };
        }
      }
    }

    return {
      sourceRun: tick.sourceRun,
      component: refusals.length === 0 ? tick.component : null,
      refusals,
      furtherDamageRuns: tick.furtherDamageRuns,
      ...(overTime ? { overTime } : {}),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// SHAPE B — the "equal to" bridge
// ---------------------------------------------------------------------------

/** A damage type named with no number beside it. */
const TYPE_WITHOUT_VALUE = /\b(?:physical|magic|true|adaptive)\s+damage\b/i;
const HAS_DIGIT = /\d/;

/**
 * What may sit between the type run and the value run: a wiki link, an object pronoun, and the
 * words "equal to". Everything else refuses.
 *
 * Each removal is here because a real sentence needs it, and nothing broader is allowed:
 * `[[on-hit]]` (Blade of the Ruined King) and "to them" (Eclipse). A digit anywhere in the
 * bridge refuses outright — a number between the two halves means there is a third figure
 * nobody has accounted for.
 */
export function bridgeReducesToEqualTo(between: string): boolean {
  if (between.length > 40 || HAS_DIGIT.test(between)) return false;
  const stripped = between
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/'''|''/g, ' ')
    .replace(/\bto\s+(?:them|him|her|it)\b/gi, ' ')
    .replace(/[\s,]+/g, ' ')
    .trim()
    .toLowerCase();
  return stripped === 'equal to';
}

/**
 * The one bridged pair in an effect's text, or null.
 *
 * Returns the span to rewrite. The rewrite replaces the bridge with a bare " equal to ", which
 * is a connective `asRuns` already accepts (§26.3 R2), so the two runs join and every downstream
 * reader — tokenizer, range-split reader, owner rule — behaves exactly as it does elsewhere.
 * Nothing about how a value is READ changes here; only which blocks count as one figure.
 */
export function bridgedSpan(text: string): { start: number; end: number; between: string } | null {
  const runs = asRuns(text);
  for (let i = 0; i < runs.length - 1; i++) {
    const first = runs[i]!;
    const second = runs[i + 1]!;
    const firstFlat = plainText(first.blocks.map((b) => b.body).join(' '));
    const secondFlat = plainText(second.blocks.map((b) => b.body).join(' '));
    if (!TYPE_WITHOUT_VALUE.test(firstFlat) || HAS_DIGIT.test(firstFlat)) continue;
    if (!HAS_DIGIT.test(secondFlat) || TYPE_WITHOUT_VALUE.test(secondFlat)) continue;
    const start = first.blocks.at(-1)!.end;
    const end = second.blocks[0]!.start;
    const between = text.slice(start, end);
    if (!bridgeReducesToEqualTo(between)) continue;
    return { start, end, between };
  }
  return null;
}

function extractFromBridge(record: EffectRecord): Extraction | null {
  const span = bridgedSpan(record.text);
  if (!span) return null;
  const rewritten =
    record.text.slice(0, span.start) + ' equal to ' + record.text.slice(span.end);
  return extractItemEffect({ ...record, text: rewritten });
}

// ---------------------------------------------------------------------------
// The path itself
// ---------------------------------------------------------------------------

export type ReachShape = 'footnote' | 'bridged-equal-to';

/** Which of the two shapes, if either, an effect's text carries. */
export function reachShapeOf(text: string): ReachShape | null {
  if (hasHiddenAsBlock(text)) return 'footnote';
  if (bridgedSpan(text)) return 'bridged-equal-to';
  return null;
}

/**
 * THE POPULATION THIS PATH MAY TOUCH, and it is disjoint from the main path's by construction.
 *
 * An effect qualifies only when the ORDINARY parser produces no component for it. An effect the
 * main path already reads is left alone, so no effect can be stored twice and no stored figure
 * can change because this file was added. `effect-values-reach.test.ts` asserts the disjointness
 * over the whole live population rather than trusting this comment.
 */
export function inSecondReachPopulation(
  record: EffectRecord,
  /** Keys (`id|key`) that already have a recorded reading on the main path — the structural 63.
   *  Passing them keeps the two READ POPULATIONS disjoint as well as the two parsers, so no
   *  effect can be counted, read or stored twice. */
  alreadyRead: ReadonlySet<string> = new Set(),
): boolean {
  if (record.source !== 'item') return false;
  if (alreadyRead.has(`${record.id}|${record.key}`)) return false;
  if (reachShapeOf(record.text) === null) return false;
  return extractItemEffect(record).component === null;
}

/**
 * Read an item effect through the second reach. Shape A is tried first, then shape B.
 *
 * The return type is `Extraction`, identical to the main parser's, so the SAME gate compares it
 * against a recorded reading in the same way. A path that stored on weaker evidence than the
 * main one would be a hole in the rule rather than an extension of it.
 */
export function extractReachItemEffect(record: EffectRecord): Extraction {
  const footnote = extractFromFootnote(record);
  if (footnote) return footnote;
  const bridged = extractFromBridge(record);
  if (bridged) return bridged;
  return {
    sourceRun: '',
    component: null,
    refusals: [
      {
        reason: 'no-structural-damage-run',
        detail:
          'neither second-reach shape applies: no {{ft}} footnote states a damage figure, and ' +
          'no pair of runs is bridged by "equal to"',
      },
    ],
    furtherDamageRuns: 0,
  };
}
