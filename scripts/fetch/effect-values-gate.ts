// THE GATE: what may be stored, and on what evidence.
//
// Two independent readings of the same sentence exist — `effect-values.ts` (a parser walking
// the wikitext) and `effect-values-read.ts` (a person reading the displayed sentence). This
// file compares them. A value is stored ONLY when both produce it and they agree on every
// number, on the damage type, and on whose stat each ratio reads.
//
// EVERY OTHER OUTCOME IS A REFUSAL, AND A REFUSAL IS A RESULT. The four it can be:
//
//   - the reading says refuse                → the recorded reason, e.g. `other-enemies-only`
//   - the parser refuses                     → the parser's reason
//   - nobody has read the sentence           → `not-in-read-population`, reported for reading
//   - both produced a value and they differ  → `parser-disagrees-with-reading`, the loudest
//     outcome of the four, because it means one of the two is wrong and neither can be trusted
//     until someone looks
//
// Pure: no network, no filesystem. Tested by effect-values.test.ts.

import type { AbilityComponent, Ratio } from '../../src/types/data.ts';
import type { EffectRecord } from './effect-census.ts';
import {
  constantScaling,
  extractItemEffect,
  toContractRatios,
  type Extraction,
  type ReadRatio,
  type Refusal,
} from './effect-values.ts';
import { readingFor, type Reading } from './effect-values-read.ts';

export interface GateResult {
  id: number;
  key: string;
  ownerName: string;
  source: 'item' | 'rune';
  /** 'stored' | 'refused'. Nothing else exists. */
  outcome: 'stored' | 'refused';
  refusals: Refusal[];
  /** Contract-shaped components, present only when `outcome` is 'stored'. */
  components?: AbilityComponent[];
  /** Whether any stored ratio reads a stat no source attributes. Forces `incomplete`. */
  hasUnresolvedOwner: boolean;
  /** The wikitext run the numbers came from. */
  sourceRun: string;
  /** The sentence a person read, quoted. */
  sentence: string | null;
  /** How the effect reaches its target, in the source's words. No contract field holds this. */
  appliesAs: string | null;
  note: string | null;
}

function sameRatios(parsed: ReadRatio[], read: ReadRatio[]): string | null {
  if (parsed.length !== read.length) {
    return `the parser read ${parsed.length} ratios, the reading records ${read.length}`;
  }
  for (let i = 0; i < parsed.length; i++) {
    const a = parsed[i]!;
    const b = read[i]!;
    if (a.stat !== b.stat) return `ratio ${i + 1}: parser says ${a.stat}, reading says ${b.stat}`;
    if (a.value !== b.value) {
      return `ratio ${i + 1} (${a.stat}): parser says ${a.value}, reading says ${b.value}`;
    }
    const ao = a.owner ?? null;
    const bo = b.owner ?? null;
    if (ao !== bo) {
      return `ratio ${i + 1} (${a.stat}) owner: parser says ${ao}, reading says ${bo}`;
    }
  }
  return null;
}

/** Compare one parser result against one recorded reading. Returns the disagreement, or null. */
export function disagreement(extraction: Extraction, reading: Reading): string | null {
  const component = extraction.component;
  const expect = reading.expect;
  if (!expect) return 'the reading records no expected values';
  if (!component) return 'the parser produced no component while the reading expects one';
  if (component.damageType !== expect.damageType) {
    return `damage type: parser says ${component.damageType}, reading says ${expect.damageType}`;
  }
  if (expect.baseByLevel) {
    const s = component.baseScaling;
    if (!s || s.scaling !== 'byLevel') return 'the reading expects a level-scaled base; the parser produced none';
    if (s.from !== expect.baseByLevel.from || s.to !== expect.baseByLevel.to) {
      return `base by level: parser says ${s.from}–${s.to}, reading says ${expect.baseByLevel.from}–${expect.baseByLevel.to}`;
    }
  } else if (component.baseScaling) {
    return 'the parser produced a level-scaled base the reading does not record';
  } else if (component.base !== expect.base) {
    return `flat base: parser says ${component.base}, reading says ${expect.base}`;
  }
  return sameRatios(component.ratios, expect.ratios);
}

/**
 * Run one effect through both readings and decide.
 *
 * `extract` is injected so a test can drive the gate without the wikitext parser, and so the
 * rune path — which has no wikitext to parse at all — can be handled by the same function.
 */
export function gateEffect(
  record: EffectRecord,
  extract: (r: EffectRecord) => Extraction = extractItemEffect,
): GateResult {
  const reading = readingFor(record.id, record.key);
  const base = {
    id: record.id,
    key: record.key,
    ownerName: record.ownerName,
    source: record.source,
    hasUnresolvedOwner: false,
    sentence: reading?.sentence ?? null,
    appliesAs: reading?.appliesAs ?? null,
    note: reading?.note ?? null,
  };

  if (!reading) {
    return {
      ...base,
      outcome: 'refused',
      sourceRun: '',
      refusals: [
        {
          reason: 'not-in-read-population',
          detail:
            'no recorded reading of this sentence. A pattern that fires outside the population a ' +
            'person has read is reported, never stored (CLAUDE.md).',
        },
      ],
    };
  }

  if (reading.verdict === 'refuse') {
    return {
      ...base,
      outcome: 'refused',
      sourceRun: '',
      refusals: (reading.reasons ?? []).map((reason) => ({
        reason,
        detail: `the recorded reading refuses this effect: ${reason}`,
      })),
    };
  }

  // The rune prose carries no wrappers, so there is nothing for the wikitext parser to read.
  // No rune reading says 'store', so this branch is unreachable today and is written to fail
  // loudly rather than silently store an unparsed rune if one is ever added.
  if (record.source === 'rune') {
    return {
      ...base,
      outcome: 'refused',
      sourceRun: '',
      refusals: [
        {
          reason: 'no-structural-damage-run',
          detail:
            'rune prose has no {{as}} wrappers, so the parser cannot confirm the reading. A ' +
            'reading alone never stores a value.',
        },
      ],
    };
  }

  const extraction = extract(record);
  if (extraction.refusals.length > 0 || !extraction.component) {
    return {
      ...base,
      outcome: 'refused',
      sourceRun: extraction.sourceRun,
      refusals:
        extraction.refusals.length > 0
          ? extraction.refusals
          : [{ reason: 'no-structural-damage-run', detail: 'the parser produced no component' }],
    };
  }

  const clash = disagreement(extraction, reading);
  if (clash) {
    return {
      ...base,
      outcome: 'refused',
      sourceRun: extraction.sourceRun,
      refusals: [{ reason: 'parser-disagrees-with-reading', detail: clash }],
    };
  }

  const component = extraction.component;
  const ratios: Ratio[] = toContractRatios(component.ratios);
  const baseScaling = component.baseScaling ?? constantScaling(component.base ?? 0);
  return {
    ...base,
    outcome: 'stored',
    sourceRun: extraction.sourceRun,
    refusals: [],
    hasUnresolvedOwner: component.ratios.some((r) => r.owner === 'unresolved'),
    components: [
      {
        id: `${record.ownerName} ${record.key}`.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase(),
        label: record.effectName ?? undefined,
        damageType: component.damageType,
        base: baseScaling,
        ratios,
      },
    ],
  };
}
