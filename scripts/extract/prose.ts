// The description-prose extraction path (DATA-SOURCES §20a).
//
// WHAT IT IS FOR. `statRows` reads `leveling` fields only. 215 abilities state their damage in
// `description` prose instead, through the champion-level shorthand `{{pp|…}}` — Caitlyn
// Headshot, Ziggs Short Fuse, Darius Hemorrhage and most other innate passives among them. Those
// abilities harvest to zero components today and therefore contribute zero damage.
//
// THE PROBLEM THIS FILE HAS TO SOLVE HONESTLY. Nothing in the source marks a `{{pp}}` block as
// damage. The same shorthand carries cooldowns, durations, life steal, heals, shields, movement
// speed and energy costs. A judgement is unavoidable, and it fails two ways, asymmetrically:
//
//   - FALSE POSITIVE — a cooldown read as damage. This INVENTS damage that does not exist, and
//     it invents it in a form that looks exactly like a real reading. This is the dangerous
//     direction.
//   - FALSE NEGATIVE — real damage skipped. The ability stays where it already is, on the
//     prose-only worklist, visible and recoverable.
//
// So the rule below is deliberately biased toward false negatives, and it is STRUCTURAL rather
// than a proximity heuristic. The wiki does not write damage in loose prose: it wraps the value
// in an `{{as|…}}` block and names the thing in that block, or in the `{{as}}` blocks that
// immediately follow it. "life steal", "energy", "bonus attack speed" and "magic damage" all
// arrive the same way, so reading the wrapper is reading a statement, not guessing from
// neighbouring words. A `{{pp}}` with no such wrapper is left unread and reported.
//
// FIVE FURTHER REFUSALS, each of which would otherwise produce a wrong number rather than a
// missing one — see `ProseRefusal` for the definitions:
//   percent-payload · footnote-variant · duplicate-label · has-leveling-rows · unreadable
//
// Everything this file produces is `derived` at best. Nothing here may be `verified`.
//
// Pure: no network, no filesystem. Tested by prose.test.ts.

import type { DamageType } from '../../src/types/data.ts';
import { ratioStatOf } from './classify.ts';
import { statedTypesFor, type DamageInstance } from './damage-data.ts';
import { findBlocks, findLevelBlocks, plainText, splitArgs, substituteVars, type Block } from './wikitext.ts';

/** A damage-type noun the wiki writes in the wrapper: "magic damage", "bonus physical damage". */
const DAMAGE_NOUN = /\b(physical|magic|true)\s+damage\b/i;

/**
 * Nouns that mean the wrapped value is NOT a damage instance.
 *
 * Every one of these was observed wrapping a `{{pp}}` in the corpus of 937 ability pages on
 * 2026-08-13. The list is deliberately broad: a term here costs a false negative, and a term
 * missing from it costs invented damage.
 */
// NOTE THE TRAILING \b, AND DO NOT REMOVE IT. Without it `heals?` matches the first four
// letters of "HEALTH", so every run reading "X% of the target's maximum health" was disqualified
// as a heal — which silenced a whole class of passive: Aatrox Deathbringer Stance, Jhin Whisper,
// Sejuani Icebreaker, Zed Contempt for the Weak and twenty more. It failed in the safe
// direction, so nothing wrong was ever stored, and it was invisible for exactly that reason.
// `seconds?` inside "secondary", `range` inside "ranged" and `gold` inside "Golden" are the same
// trap waiting to happen.
const NOT_DAMAGE_NOUN =
  /\b(life ?steal|omnivamp|spell ?vamp|heals?|healed|healing|shields?|shielded|cooldown|seconds?|movement speed|attack speed|slows?|duration|mana|energy|gold|experience|range|radius|penetration|tenacity|regeneration|armou?r|magic resist)\b/i;

/**
 * What may sit between two `{{as}}` blocks for them to still be ONE figure.
 *
 * Whitespace and commas, or exactly one of three connective words. The wiki writes
 * `{{as|'''bonus''' magic damage}} equal to {{as|{{pplevel|4 to 10}} of the target's maximum
 * health}}` — the noun and the number in separate blocks, joined by two words. Allowing those
 * three words is still reading a structure: both halves are wrapped and named by the source.
 * It is NOT a licence to scan the sentence — anything else between two blocks ends the run.
 */
const CONNECTIVE = /^[\s,]*(?:as|of|equal to)?[\s,]*$/i;

/**
 * A block that NAMES the damage rather than carrying its value: it reads as a damage noun, is
 * not a `(+ …)` addition, and holds no number of its own.
 */
function isNamingBlock(body: string, flat: string): boolean {
  return (
    DAMAGE_NOUN.test(flat) &&
    !/\(\s*\+/.test(body) &&
    findLevelBlocks(body).length === 0 &&
    !/\d/.test(flat)
  );
}

/**
 * A run whose text is about damage but is not a damage instance. Mirrors the classifier's own
 * `NOT_A_DAMAGE_ROW`: with the scanner widened past level progressions it now sees ordinary
 * defensive prose, and "reduces magic damage taken" must not read as a magic damage instance.
 */
const NOT_A_DAMAGE_INSTANCE = /damage reduction|damage reduc|damage amp|damage taken|damage cap/i;

/** Why a `{{pp}}` block in prose was not turned into damage. Every group is reported. */
export type ProseRefusal =
  /** No `{{as|…}}` wraps the block, so nothing in the source says what the number is. */
  | 'no-wrapper'
  /** The wrapper names something that is not damage (a cooldown, a heal, life steal). */
  | 'not-damage'
  /** The wrapper names neither damage nor a non-damage noun. Unjudgeable, so unread. */
  | 'unclear'
  /** The value is a PERCENTAGE of some stat (`key=%`) sitting where a flat base would go.
   *  Storing it as a flat base would read "60% of AD" as "60 damage". */
  | 'percent-payload'
  /** The block sits inside a `{{ft|…}}` footnote, which states a conditional variant of the
   *  damage rather than a second instance of it. Summing it would double-count. */
  | 'footnote-variant'
  /** Two groups on one ability produced the same label, so which is the variant of which is not
   *  stated. Both are refused rather than one silently shadowing the other (§23). */
  | 'duplicate-label'
  /** The ability already has damage from its leveling rows. The prose usually restates that
   *  same damage, and adding it would double the ability's output. */
  | 'has-leveling-rows'
  /** The row was synthesised but the classifier could not read all of it. Partial storage would
   *  understate the ability, so nothing is stored. */
  | 'unreadable'
  /** Every block in the run is a `(+ …)` addition, so whatever they add to is stated outside the
   *  run. Storing the additions alone understates the ability at every rank. */
  | 'bonus-only-run'
  /** The prose and `Module:DamageData/data` disagree about the damage type. */
  | 'type-conflict';

export interface ProseRow {
  /** The label the synthesised row carries, e.g. "Bonus Physical Damage". */
  label: string;
  /** A `{{st|…}}` value string: the same shape a leveling row's value has, so the existing
   *  classifier reads it with no special case. */
  value: string;
  /** Which `description*` field it came from. */
  field: string;
  /** The damage type stated by the prose, cross-checked against Module:DamageData/data. */
  damageType: DamageType;
  /** True when Module:DamageData/data does not list this ability at all — grounds for more
   *  suspicion, recorded so it can be reported (DATA-SOURCES §20a). */
  unlistedInDamageData: boolean;
}

export interface ProseSkip {
  refusal: ProseRefusal;
  field: string;
  /** The block as the source writes it, trimmed, for the report. */
  source: string;
  detail?: string;
}

export interface ProseScan {
  rows: ProseRow[];
  skipped: ProseSkip[];
}

/** The innermost block of `name` that strictly contains `inner`, or undefined. */
function enclosing(blocks: Block[], inner: Block): Block | undefined {
  return blocks
    .filter((b) => b.start < inner.start && b.end > inner.end)
    .sort((a, b) => b.start - a.start)[0];
}

/** Readable text of a block, with wiki markup and nested template names stripped. */
function readable(s: string): string {
  return plainText(s.replace(/\{\{[a-z]+\|/gi, ' ').replace(/\}\}/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** True when this `{{pp}}` is displayed as a percentage — `key=%` names its display suffix. */
export function isPercentBlock(inner: string): boolean {
  return splitArgs(inner).some((a) => /^\s*key\s*=\s*%\s*$/.test(a));
}

/** Title-case a damage noun phrase into a row label: "bonus physical damage" -> the label. */
function toLabel(phrase: string): string {
  return phrase
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Scan one ability's `description*` fields for damage stated as a `{{pp}}` progression.
 *
 * `hasLevelingComponents` short-circuits the whole scan: an ability whose leveling rows already
 * produced damage is left alone. The prose on those abilities restates the same damage in
 * sentence form, and a second copy of it would double the ability's output — which is a worse
 * outcome than the missing damage this path exists to recover.
 */
export function scanProse(opts: {
  champion: string;
  ability: string;
  fields: Record<string, string>;
  vars: Record<string, string>;
  damageData: Map<string, DamageInstance[]>;
  hasLevelingComponents: boolean;
}): ProseScan {
  const { champion, ability, fields, vars, damageData, hasLevelingComponents } = opts;
  const rows: ProseRow[] = [];
  const skipped: ProseSkip[] = [];
  const stated = statedTypesFor(damageData, champion, ability);

  // An ability whose leveling rows already produced damage is left alone entirely: the prose
  // restates that same damage and a second copy would double the ability's output. Returning
  // here rather than per-run keeps the refusal counts meaningful — reported per ability, not
  // once per sentence fragment.
  if (hasLevelingComponents) {
    return { rows: [], skipped: [{ refusal: 'has-leveling-rows', field: '-', source: '(whole ability)' }] };
  }

  const fieldNames = Object.keys(fields)
    .filter((k) => /^description\d*$/.test(k))
    .sort();

  for (const field of fieldNames) {
    const text = fields[field]!;
    const ppBlocks = findLevelBlocks(text);
    const asBlocks = findBlocks(text, 'as');
    if (asBlocks.length === 0) {
      // Nothing in this field is wrapped, so nothing in it is labelled. Still report the
      // progressions: a block left unread has to be counted, not silently passed over.
      for (const p of ppBlocks) skipped.push({ refusal: 'no-wrapper', field, source: brief(text, p) });
      continue;
    }
    const ftBlocks = findBlocks(text, 'ft');

    // ONE DAMAGE INSTANCE IS ONE RUN of adjacent top-level `{{as}}` blocks, not one block.
    // The wiki splits a single figure across several: the value in the first, each ratio in its
    // own, the damage noun in the last. Read block by block, each ratio looks like a separate
    // instance and the noun looks like an instance with no number.
    const topLevel = asBlocks.filter((b) => !enclosing(asBlocks, b));
    const runs: Block[][] = [];
    for (const b of topLevel) {
      const last = runs.at(-1)?.at(-1);
      if (last && CONNECTIVE.test(text.slice(last.end, b.start))) runs.at(-1)!.push(b);
      else runs.push([b]);
    }

    const used = new Set<number>();
    for (const run of runs) {
      const head = run[0]!;
      const tail = run.at(-1)!;
      const blocks = ppBlocks.filter((p) => p.start > head.start && p.end < tail.end);
      blocks.forEach((p) => used.add(p.start));
      if (enclosing(ftBlocks, head) || blocks.some((p) => enclosing(ftBlocks, p))) {
        skipped.push({ refusal: 'footnote-variant', field, source: brief(text, blocks[0] ?? head) });
        continue;
      }
      const siblings = run.slice(1);
      const whole = readable(text.slice(head.start, tail.end));
      const source = text.slice(head.start, tail.end).replace(/\s+/g, ' ').slice(0, 160);

      // A run that carries no progression block and names no damage is ordinary prose, not a
      // value we failed to read. Only a run holding a progression is REPORTED when it is
      // rejected here, so the refusal counts stay comparable with the ones in DATA-SOURCES §25.
      const reportable = blocks.length > 0;
      if (NOT_A_DAMAGE_INSTANCE.test(whole) || NOT_DAMAGE_NOUN.test(whole)) {
        if (reportable) skipped.push({ refusal: 'not-damage', field, source, detail: whole.slice(0, 90) });
        continue;
      }
      const noun = DAMAGE_NOUN.exec(whole);
      if (!noun) {
        if (reportable) skipped.push({ refusal: 'unclear', field, source, detail: whole.slice(0, 90) });
        continue;
      }

      const proseType = noun[1]!.toLowerCase() as DamageType;
      if (stated.types.size > 0 && !stated.types.has(proseType)) {
        // The module STATES a type and the sentence states a different one. Neither is taken.
        skipped.push({
          refusal: 'type-conflict',
          field,
          source,
          detail: `prose says ${proseType}, Module:DamageData/data says ${[...stated.types].join('/')}`,
        });
        continue;
      }

      // Split the run into the block(s) that NAME the damage and the block(s) that carry its
      // VALUE. Either can come first: the wiki writes both `{{as|<value>}} … {{as|magic damage}}`
      // and `{{as|'''bonus''' magic damage}} equal to {{as|<value>}}`.
      const valueParts: string[] = [];
      let labelPhrase = noun[0];
      let sawPayload = false;
      let baseFromPercent: string | undefined;
      for (const b of [head, ...siblings]) {
        const body = splitArgs(b.inner)[0] ?? '';
        const flat = readable(body);
        if (isNamingBlock(body, flat)) {
          const bonus = /\bbonus\b/i.test(flat) ? 'bonus ' : '';
          labelPhrase = `${bonus}${noun[0]}`;
          continue;
        }
        // A block whose whole argument IS a progression is the row's BASE, and the classifier
        // reads a base unwrapped. Anything else stays wrapped: unwrapping
        // `{{as|{{pplevel|4 to 10}} of the target's maximum health}}` would turn a percentage of
        // health into four-to-ten flat damage, which is both wrong and entirely plausible.
        const levelIn = findLevelBlocks(body);
        const rankIn = findBlocks(body, 'ap');
        const progression = levelIn[0] ?? rankIn[0];
        // What the block says APART from its progression and its nested ratio groups. If that
        // remainder names a stat, the progression is the MAGNITUDE OF A RATIO —
        // `{{pplevel|4 to 10}} of the target's maximum health` — and unwrapping it would store
        // "4 to 10 flat damage" instead of "4–10% of the target's health". If it names no stat,
        // the progression is the row's base and the classifier needs it unwrapped.
        let remainder = progression
          ? body.slice(0, progression.start) + ' ' + body.slice(progression.end)
          : body;
        for (const nested of [...findBlocks(remainder, 'as')].reverse()) {
          remainder = remainder.slice(0, nested.start) + ' ' + remainder.slice(nested.end);
        }
        // A BARE LITERAL IS A BASE, and missing that lost real damage. Aphelios Calibrum writes
        // `{{as|15|physical damage}} {{as|(+ 15% '''bonus''' AD)}}`: the 15 is the flat term. A
        // value block holding a plain number names no stat, so the ratio reader returns nothing
        // for it and the number vanished, leaving the ability with its ratio and no base — half
        // its damage at 100 bonus AD, all of it at zero. Found by gate 5, not by any round-trip:
        // the figures we DID store all appeared in the rendered sentence, so the prose
        // round-trip passed it. A check cannot see a term that was never stored.
        const bareLiteral = /^\s*-?\d+(?:\.\d+)?\s*$/.test(body);
        const isBase =
          bareLiteral || (progression !== undefined && ratioStatOf(readable(remainder)) === null);
        if (isBase) {
          if (levelIn[0] && isPercentBlock(levelIn[0].inner)) baseFromPercent = levelIn[0].inner;
          valueParts.push(body);
        } else {
          if (!/\(\s*\+/.test(body)) sawPayload = true;
          valueParts.push(text.slice(b.start, b.end));
        }
      }
      // EVERY BLOCK IS A BARE `(+ …)` ADDITION AND THERE IS NOTHING TO ADD IT TO. A bonus group
      // is by construction an addition to a value stated elsewhere; storing the group alone
      // gives an ability its ratios with no payload and understates it at every rank. Akali's
      // mark reads `{{as|(+ 60% '''bonus''' AD)}} {{as|(+ 55% AP)}}` and its base is a bare
      // progression outside the run.
      //
      // A `(+ …)` group that CARRIES a progression is different and must not be caught here:
      // `{{as|(+ {{pplevel|10 to 50}}% '''bonus''' AD)}}` is a complete scaled ratio, and it is
      // how Warwick, Gwen, Katarina and Volibear state their whole passive. A first cut of this
      // guard refused those four and dropped damage that was already being read correctly.
      const runHasProgression = valueParts.some(
        (v) => findLevelBlocks(v).length > 0 || findBlocks(v, 'ap').length > 0,
      );
      if (!sawPayload && !runHasProgression && valueParts.every((v) => /\{\{as\|/.test(v))) {
        skipped.push({
          refusal: 'bonus-only-run',
          field,
          source,
          detail: 'every block is a "(+ …)" addition, so the value being added to is not here',
        });
        continue;
      }
      if (baseFromPercent !== undefined) {
        skipped.push({
          refusal: 'percent-payload',
          field,
          source,
          detail: `the level-scaled base is a percentage of a stat, not a flat base: ${baseFromPercent
            .replace(/\s+/g, ' ')
            .slice(0, 70)}`,
        });
        continue;
      }
      const value = substituteVars(valueParts.join(' ').trim(), vars);

      rows.push({
        label: toLabel(labelPhrase),
        value,
        field,
        damageType: proseType,
        unlistedInDamageData: !stated.listed,
      });
    }

    // A block no run reached has no `{{as}}` around it. Nothing in the source says what it is,
    // so it is left unread rather than judged from the surrounding sentence.
    for (const p of ppBlocks) {
      if (!used.has(p.start)) skipped.push({ refusal: 'no-wrapper', field, source: brief(text, p) });
    }
  }

  // Two groups with one label: which is a variant of which is not stated, so neither is stored.
  const byLabel = new Map<string, number>();
  for (const r of rows) byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + 1);
  const kept = rows.filter((r) => byLabel.get(r.label) === 1);
  for (const r of rows) {
    if (byLabel.get(r.label)! > 1) {
      skipped.push({ refusal: 'duplicate-label', field: r.field, source: r.value.slice(0, 160), detail: r.label });
    }
  }

  return { rows: kept, skipped };
}

function brief(text: string, b: Block): string {
  return text.slice(b.start, b.end).replace(/\s+/g, ' ').slice(0, 120);
}
