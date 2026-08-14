// Known-answer tests for THE SECOND REACH — the damage figures the outermost-level `{{as}}`
// scan cannot see.
//
// Every wikitext string below is a VERBATIM quote from `Module:ItemData/data` on the official
// wiki, fetched 2026-08-14 against patch 16.16.1. They are quoted rather than paraphrased,
// because a paraphrase tests the paraphrase.
//
// The expected numbers are the ones a reader sees on the item's own page, and they are the same
// numbers `effect-values-read-reach.ts` records — which is the point: a value is stored only
// where a parser and a person independently produce it. Where a value is REFUSED the test
// asserts the refusal and its reason, because a refusal is a result.

import { describe, expect, it } from 'vitest';

import type { EffectRecord } from './effect-census.ts';
import {
  bridgeReducesToEqualTo,
  bridgedSpan,
  derivedInstanceCount,
  extractReachItemEffect,
  hasHiddenAsBlock,
  hidingWrappers,
  inSecondReachPopulation,
  nestedAsBlocks,
  reachShapeOf,
} from './effect-values-reach.ts';
import { gateEffect } from './effect-values-gate.ts';
import { REACH_READ_POPULATION, reachReadingFor } from './effect-values-read-reach.ts';
import { READ_POPULATION } from './effect-values-read.ts';

function item(ownerName: string, id: number, key: string, text: string): EffectRecord {
  return { source: 'item', ownerName, id, key, effectName: null, text };
}

// --- verbatim source, 2026-08-14, patch 16.16.1 ----------------------------

const LIANDRYS =
  "Dealing {{tip|ability damage}} or {{tip|pet damage}} burns enemies, causing them to take{{ft|{{as|1% of the target's '''maximum''' health}} {{as|magic damage}} every {{fd|0.5}} seconds over 3 seconds, capped at 20 per tick against monsters.|{{as|6% of the target's '''maximum''' health}} {{as|'''total''' magic damage}} over 3 seconds, capped at 120 against monsters.}}";

const MALIGNANCE =
  "Dealing non-{{tip|proc damage}} or {{tip|pet damage}} to enemy champions with your [[champion ability|ultimate ability]] creates a scorched zone beneath them for 3 seconds, applying a ''Curse'' to enemies within that deals {{ft|{{as|{{ap|60/4}}|magic damage}} {{as|(+ {{ap|5/4}}% AP)}} {{as|magic damage}} every {{fd|0.25}} seconds|{{as|{{ap|60*3}}|magic damage}} {{as|(+ {{ap|5*3}}% AP)}} {{as|'''total''' magic damage}} over the duration}} and reduces their {{as|magic resistance by 10}} (3 second cooldown per target, starts on zone creation).";

const ZEKES =
  "Upon casting your [[ultimate ability]], you summon a storm of flame and ice around you for 5 seconds. The storm deals{{ft|{{as|{{ap|30/4}} magic damage}} every {{fd|0.25}} seconds|{{as|{{ap|30*5}} '''total''' magic damage}} over the duration}}to enemy champions and monsters within a 350 radius.";

const BOTRK =
  "Basic attacks deal {{as|'''bonus''' physical damage}} [[on-hit]] equal to {{as|{{rd|9%|6%}} of the target's '''current''' health}}, with a '''maximum''' of 100 against {{tip|minions}} and {{tip|monsters}}.";

const ECLIPSE =
  "Applying 2 stacks to a champion within a 2 second period deals {{as|'''bonus''' physical damage}} to them equal to {{as|{{rd|8%|5%}} of target's '''maximum''' health}} and grants you a {{tip|shield}} for {{rd|150|75}} {{as|(+ {{rd|40%|20%}} '''bonus''' AD)}} for 2 seconds.";

/** THE TRAP. A type run and a value run, and the value is NOT that damage. */
const BLACK_CLEAVER =
  "Dealing {{as|physical damage}} to an enemy champion applies a stack of ''Carve'' for 6 seconds, stacking up to 5 times. Each stack inflicts {{as|6% armor reduction}}, up to 30% armor at 5 stacks.";

// ---------------------------------------------------------------------------

describe('reach/the scan gap: which {{as}} blocks the outermost-level scan misses', () => {
  it('finds an {{as}} block nested inside a {{ft}} footnote, which findBlocks cannot', () => {
    const blocks = nestedAsBlocks(LIANDRYS);
    expect(blocks).toHaveLength(4);
    expect(blocks.every((b) => b.enclosedBy.includes('ft'))).toBe(true);
    expect(hasHiddenAsBlock(LIANDRYS)).toBe(true);
    expect(hidingWrappers(LIANDRYS)).toEqual(['ft']);
  });

  it('does NOT count a block nested inside another {{as}}, which resolveDisplay already reads', () => {
    // Sunfire Aegis, verbatim: the inner block is inside the outer one and is not hidden.
    const sunfire = "Deal {{as|20 {{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} every second.";
    expect(nestedAsBlocks(sunfire)).toHaveLength(2);
    expect(hasHiddenAsBlock(sunfire)).toBe(false);
  });

  it('reports the wrapper doing the hiding, so a new one is noticed rather than absorbed', () => {
    expect(hidingWrappers(MALIGNANCE)).toEqual(['ft']);
    expect(hidingWrappers(BOTRK)).toEqual([]);
  });
});

describe('reach/the instance count is derived from two stated figures, never from the divisor', () => {
  const tokens = (base: number | null, ratios: { stat: string; value: number }[]) =>
    ({ base, ratios, refusals: [] }) as never;

  it("Liandry's: 6% total over 1% per tick is 6 instances", () => {
    expect(
      derivedInstanceCount(
        tokens(null, [{ stat: 'maxHP', value: 1 }]),
        tokens(null, [{ stat: 'maxHP', value: 6 }]),
      ),
    ).toEqual({ count: 6 });
  });

  it('Malignance: TWO independent witnesses both say 12 — and the wikitext divisor says 4', () => {
    // {{ap|60/4}} is 60 damage per SECOND over 4 ticks per second. Blackfire Torch's identical
    // {{ap|60/6}} is a TOTAL over an instance count. Reading the divisor here would give
    // Malignance a third of its damage, which is why this test names the number it must not be.
    const derived = derivedInstanceCount(
      tokens(15, [{ stat: 'AP', value: 1.25 }]),
      tokens(180, [{ stat: 'AP', value: 15 }]),
    );
    expect(derived).toEqual({ count: 12 });
    expect(derived).not.toEqual({ count: 4 });
  });

  it("Zeke's: one witness, 150 over 7.5, is 20 instances", () => {
    expect(derivedInstanceCount(tokens(7.5, []), tokens(150, []))).toEqual({ count: 20 });
  });

  it('REFUSES when the base and the ratio disagree about how many land', () => {
    const out = derivedInstanceCount(
      tokens(15, [{ stat: 'AP', value: 1.25 }]),
      tokens(180, [{ stat: 'AP', value: 10 }]),
    );
    expect(out).toHaveProperty('refusal');
    expect((out as { refusal: string }).refusal).toContain('disagree');
  });

  it('REFUSES a quotient that is not a whole number of instances', () => {
    const out = derivedInstanceCount(tokens(7, []), tokens(150, []));
    expect((out as { refusal: string }).refusal).toContain('not a whole number');
  });

  it('REFUSES a count of one — a total equal to one instance means nothing recurs', () => {
    const out = derivedInstanceCount(tokens(15, []), tokens(15, []));
    expect((out as { refusal: string }).refusal).toContain('nothing recurs');
  });

  it('REFUSES when the stated total carries a flat the per-instance figure does not', () => {
    const out = derivedInstanceCount(tokens(null, []), tokens(180, []));
    expect((out as { refusal: string }).refusal).toContain('flat');
  });
});

describe('reach/the "equal to" bridge, and the guard that makes it safe', () => {
  it('accepts the two bridges that really are one figure', () => {
    expect(bridgeReducesToEqualTo(' [[on-hit]] equal to ')).toBe(true);
    expect(bridgeReducesToEqualTo(' to them equal to ')).toBe(true);
  });

  it('REFUSES Black Cleaver, whose value run is an armor reduction in another clause', () => {
    expect(bridgedSpan(BLACK_CLEAVER)).toBeNull();
    expect(reachShapeOf(BLACK_CLEAVER)).toBeNull();
  });

  it('REFUSES a bridge carrying a digit — a number between the halves is a third figure', () => {
    expect(bridgeReducesToEqualTo(' equal to 2 times ')).toBe(false);
  });

  it('REFUSES a long bridge even when it ends in the right words', () => {
    expect(
      bridgeReducesToEqualTo(
        ' to an enemy champion applies a stack of Carve for 6 seconds, equal to ',
      ),
    ).toBe(false);
  });

  it('finds the span in the two effects it is meant to find', () => {
    expect(bridgedSpan(BOTRK)?.between).toBe(' [[on-hit]] equal to ');
    expect(bridgedSpan(ECLIPSE)?.between).toBe(' to them equal to ');
  });
});

describe('reach/end to end: the five values, each read from its own sentence', () => {
  it("Blade of the Ruined King: 9% / 6% of the TARGET's current health, physical", () => {
    const out = extractReachItemEffect(item('Blade of The Ruined King', 3153, 'pass', BOTRK));
    expect(out.refusals).toEqual([]);
    expect(out.component).toEqual({
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'currentHP', owner: 'target', byRangeType: { melee: 9, ranged: 6 } }],
    });
  });

  it("Eclipse: 8% / 5% of the TARGET's maximum health, and the shield does NOT join it", () => {
    const out = extractReachItemEffect(item('Eclipse', 6692, 'pass', ECLIPSE));
    expect(out.refusals).toEqual([]);
    expect(out.component).toEqual({
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'maxHP', owner: 'target', byRangeType: { melee: 8, ranged: 5 } }],
    });
    // The shield's 150 / 75 and its 40% / 20% bonus AD are a separate run. One ratio, no base.
    expect(out.component!.ratios).toHaveLength(1);
  });

  it("Liandry's Torment: 1% of the target's maximum health, magic, six instances", () => {
    const out = extractReachItemEffect(item("Liandry's Torment", 6653, 'pass', LIANDRYS));
    expect(out.refusals).toEqual([]);
    expect(out.component).toEqual({
      damageType: 'magic',
      base: null,
      ratios: [{ stat: 'maxHP', value: 1, owner: 'target' }],
    });
    expect(out.overTime?.totalInstances).toBe(6);
  });

  it('Malignance: 15 (+ 1.25% AP) magic, twelve instances — not four', () => {
    const out = extractReachItemEffect(item('Malignance', 3118, 'pass2', MALIGNANCE));
    expect(out.refusals).toEqual([]);
    expect(out.component).toEqual({
      damageType: 'magic',
      base: 15,
      ratios: [{ stat: 'AP', value: 1.25 }],
    });
    expect(out.overTime?.totalInstances).toBe(12);
  });

  it("Zeke's Convergence: 7.5 magic, twenty instances", () => {
    const out = extractReachItemEffect(item("Zeke's Convergence", 3050, 'pass2', ZEKES));
    expect(out.refusals).toEqual([]);
    expect(out.component).toEqual({ damageType: 'magic', base: 7.5, ratios: [] });
    expect(out.overTime?.totalInstances).toBe(20);
  });

  it('produces nothing at all where neither shape applies', () => {
    const out = extractReachItemEffect(item('Black Cleaver', 3071, 'pass', BLACK_CLEAVER));
    expect(out.component).toBeNull();
    expect(out.refusals[0]!.reason).toBe('no-structural-damage-run');
  });
});

describe('reach/the gate: a parser that fires outside the read population stores nothing', () => {
  it('stores the five, with the owner and the recurrence the reading records', () => {
    const cases: [string, number, string, string][] = [
      ['Blade of The Ruined King', 3153, 'pass', BOTRK],
      ['Eclipse', 6692, 'pass', ECLIPSE],
      ["Liandry's Torment", 6653, 'pass', LIANDRYS],
      ['Malignance', 3118, 'pass2', MALIGNANCE],
      ["Zeke's Convergence", 3050, 'pass2', ZEKES],
    ];
    for (const [name, id, key, text] of cases) {
      const g = gateEffect(item(name, id, key, text), extractReachItemEffect, reachReadingFor);
      expect(g.outcome, `${name} [${key}]`).toBe('stored');
      expect(g.verification).toBe('derived');
    }
  });

  it('REFUSES THE IDENTICAL WIKITEXT UNDER A KEY NO READING NAMES', () => {
    // The paired test DATA-SOURCES §42.7 established. Without it, this change would pass for an
    // implementation that stored every footnote it could parse — which is exactly the widening
    // CLAUDE.md forbids ("a detector proposes, a person confirms, and storage is gated on the
    // confirmed population"). Same text, unread key, nothing stored.
    const g = gateEffect(
      item("Liandry's Torment", 6653, 'pass9', LIANDRYS),
      extractReachItemEffect,
      reachReadingFor,
    );
    expect(g.outcome).toBe('refused');
    expect(g.refusals[0]!.reason).toBe('not-in-read-population');
  });

  it('refuses the five the reading refuses, each with the class it was refused under', () => {
    const refusals = REACH_READ_POPULATION.filter((r) => r.verdict === 'refuse');
    expect(refusals).toHaveLength(5);
    expect(refusals.flatMap((r) => r.reasons ?? [])).toEqual(
      expect.arrayContaining([
        'trigger-needs-a-third-unit',
        'value-stated-only-by-reference',
        'critical-strike-modifier',
      ]),
    );
  });
});

describe('reach/the two populations are disjoint, so no figure can be stored twice', () => {
  it('never claims an effect the main path already reads', () => {
    // Sunfire Aegis is stored by the main path; its shape must not put it in this one.
    const sunfire = item(
      'Sunfire Aegis',
      3068,
      'pass',
      "Deal {{as|20 {{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} every second to enemies within 325 units.",
    );
    expect(inSecondReachPopulation(sunfire)).toBe(false);
  });

  it('never claims an effect with a recorded reading on the main path', () => {
    const structuralKeys = new Set(READ_POPULATION.map((r) => `${r.id}|${r.key}`));
    const heartsteel = item('Heartsteel', 3084, 'pass', LIANDRYS);
    expect(inSecondReachPopulation(heartsteel, structuralKeys)).toBe(false);
  });

  it('no reading appears in both read populations', () => {
    const structuralKeys = new Set(READ_POPULATION.map((r) => `${r.id}|${r.key}`));
    const both = REACH_READ_POPULATION.filter((r) => structuralKeys.has(`${r.id}|${r.key}`));
    expect(both.map((r) => `${r.ownerName} [${r.key}]`)).toEqual([]);
  });
});
