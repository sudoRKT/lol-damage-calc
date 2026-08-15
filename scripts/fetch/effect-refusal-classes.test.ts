// Known-answer tests for THE REFUSAL CENSUS's classes.
//
// Every wikitext string is a VERBATIM quote from `Module:ItemData/data`, or from
// `runesReforged.json` `longDesc`, fetched 2026-08-14 against patch 16.16.1.
//
// MOST OF THESE TESTS ARE ABOUT FALSE POSITIVES, and that is deliberate. A shape test that fires
// too widely does not produce a wrong damage number — it produces a wrong REQUEST, and a request
// for a contract shape 17 effects need when only 9 need it is the same kind of confident wrong
// number in a different currency. Each detector below is pinned against the members it must
// find AND the near-misses it must not.

import { describe, expect, it } from 'vitest';

import type { EffectClassification } from './effect-census.ts';
import {
  AMPLIFIES_DAMAGE,
  BUCKET_DEFINITIONS,
  FLAT_STAT_GRANT,
  GRANTS_A_SHIELD,
  MULTIPLIES_A_STAT,
  REFUSAL_CLASSES,
  SHARE_OF_ANOTHER_STAT,
  STAT_BELONGS_TO_A_WARD_OR_MINION,
  STAT_IS_A_THRESHOLD,
  bucketOf,
  everyGateReasonHasAClass,
  statModifierBlockers,
} from './effect-refusal-classes.ts';
import type { RefusalReason } from './effect-values.ts';

/** Every reason the gate can emit today, listed rather than derived, so a new one fails here. */
const EVERY_GATE_REASON: RefusalReason[] = [
  'melee-ranged-split',
  'range-split-has-named-arguments',
  'range-split-arms-differ-in-shape',
  'dot-total-disagrees-with-tick',
  'scales-on-lethality',
  'scales-on-crit-chance',
  'scales-on-stacks',
  'damage-over-time',
  'adaptive-damage-type',
  'range-with-unstated-axis',
  'non-champion-target-only',
  'other-enemies-only',
  'ally-only',
  'retaliation',
  'conditional-additional-damage',
  'trigger-needs-a-third-unit',
  'value-stated-only-by-reference',
  'critical-strike-modifier',
  'unparsed-token',
  'no-structural-damage-run',
  'ambiguous-damage-type',
  'parser-disagrees-with-reading',
  'not-in-read-population',
];

function row(text: string, conditional = false): EffectClassification {
  return {
    source: 'item',
    ownerName: 'fixture',
    id: 1,
    key: 'pass',
    effectName: null,
    text,
    crossReferenceTo: null,
    damage: 'none',
    modifiesStat: true,
    modifiesDamageRelevantStat: true,
    conditional,
    inScope: true,
    reach: 'H2',
    reachReason: '',
    ownerRefs: [],
    barePoolMentions: 0,
    bareLevelMentions: 0,
  } as EffectClassification;
}

// ---------------------------------------------------------------------------

describe('census/every count carries a definition', () => {
  it('every reason the gate can emit is a class with a definition and a bucket', () => {
    expect(everyGateReasonHasAClass(EVERY_GATE_REASON)).toEqual([]);
    for (const reason of EVERY_GATE_REASON) {
      expect(REFUSAL_CLASSES[reason]!.definition.length, reason).toBeGreaterThan(40);
      expect(BUCKET_DEFINITIONS[bucketOf(reason)], reason).toBeTruthy();
    }
  });

  it('every class sits in a bucket that has a definition of its own', () => {
    for (const [name, klass] of Object.entries(REFUSAL_CLASSES)) {
      expect(BUCKET_DEFINITIONS[klass.bucket], name).toBeTruthy();
    }
  });

  it('every CONTRACT class names the shape that would release it', () => {
    for (const [name, klass] of Object.entries(REFUSAL_CLASSES)) {
      if (klass.bucket !== 'contract') continue;
      if (klass.definition.startsWith('HISTORICAL')) continue;
      expect(klass.shapeNeeded, `${name} is a contract gap with no shape named`).toBeTruthy();
    }
  });

  it('refuses to bucket a class nobody has defined', () => {
    expect(() => bucketOf('invented-on-the-spot')).toThrow(/no refusal class/);
  });
});

describe('census/a shield GRANTED, told from the act of shielding an ally', () => {
  // The nine that grant one. Verbatim, 2026-08-14.
  const grants = [
    'Taking {{as|physical damage}} from champions grants you a {{tip|shield}} that absorbs {{pp|100 to 200|color=pd}}.',
    'Convert the {{tip|healing}} received from {{sti|life steal}} in excess of maximum health into a {{tip|shield}} for up to 165.',
    'you first gain a {{tip|shield}} that absorbs {{as|magic damage}} for {{fd|2.5}} seconds.',
    'both of you gain a shield for 1.5s. Shield: 40 - 150 + 20% of your ability power',
  ];
  // The eight that do NOT. Every one was counted as a shield by a flat test for the word.
  const doesNot = [
    'Gain {{as|2% heal and shield power|hsp}} and {{as|10 ability power}}.',
    'Increases all {{tip|heal|healing}} and {{tip|shield|shielding}} received by 25%.',
    "{{tip|Heal|Healing}} or {{tip|shield|shielding}} allied champions grants you {{as|40 ability power}}.",
    'Gain 5% Heal and Shield Power. Heals and shields you cast or receive are 10% stronger.',
    'you gain 12% increased {{tip|heal|healing}}, {{tip|shield|shielding}}, and health regeneration.',
    'Grants {{as|heal and shield power}} equal to {{as|{{fd|0.5}}% bonus mana}}.',
  ];

  it('finds every effect that really grants one', () => {
    for (const text of grants) expect(GRANTS_A_SHIELD.test(text), text.slice(0, 40)).toBe(true);
  });

  it('finds NONE of the heal-and-shield-power effects', () => {
    for (const text of doesNot) expect(GRANTS_A_SHIELD.test(text), text.slice(0, 40)).toBe(false);
  });
});

describe('census/a threshold on a pool, told from a threshold on a stack count', () => {
  it("counts Manamune's transformation, which tests bonus mana and changes nothing", () => {
    expect(STAT_IS_A_THRESHOLD.test("Transforms into {{ii|Muramana}} at {{as|360 '''bonus''' mana}}.")).toBe(true);
    expect(STAT_IS_A_THRESHOLD.test("Grants ''Warmog's Heart'' if you have at least {{as|2000 '''bonus''' health}}.")).toBe(true);
  });

  it("does NOT count Mejai's, whose PREVIOUS clause grants 5 ability power per stack", () => {
    // A looser test caught this on "if you have at least 10 stacks" and would have removed a
    // real ability-power source from the in-scope population.
    const mejais =
      "Gain 4 stacks for each champion [[kill]], up to a '''maximum''' of 25 stacks. For every stack, gain {{as|5 ability power}}. If you have at least 10 stacks, also gain {{as|10% '''bonus''' movement speed}}.";
    expect(STAT_IS_A_THRESHOLD.test(mejais)).toBe(false);
    expect(statModifierBlockers(row(mejais))).toContain('stat-grant-is-a-share-of-another-stat');
  });
});

describe('census/a stat that belongs to a ward or a minion, not to a champion', () => {
  it("counts Deep Ward's +1 extra Health and Hullbreaker's armor for allied siege minions", () => {
    expect(
      STAT_BELONGS_TO_A_WARD_OR_MINION.test('Deep wards gain +1 extra Health and increased duration.'),
    ).toBe(true);
    expect(
      STAT_BELONGS_TO_A_WARD_OR_MINION.test(
        "Allied {{ui|Blue Siege Minion|link=Siege minion|siege minions}} and super minions within 1050 units gain {{as|'''bonus''' armor}}.",
      ),
    ).toBe(true);
  });

  it("does not count an effect that merely mentions minions as a damage target", () => {
    expect(
      STAT_BELONGS_TO_A_WARD_OR_MINION.test('Basic attacks deal 5 bonus physical damage on-hit against minions.'),
    ).toBe(false);
  });
});

describe('census/a flat stat grant, told from a grant of regeneration', () => {
  it("counts Elixir of Wrath's 30 bonus attack damage", () => {
    expect(
      FLAT_STAT_GRANT.test("Grants {{as|30 '''bonus''' attack damage}} and {{tip|heals}} for 12% of physical damage dealt."),
    ).toBe(true);
  });

  it("does NOT count Guardian's Orb, whose 15 is bonus health REGENERATION", () => {
    // Without the lookahead this reads as a grant of 15 bonus HEALTH — a different stat and a
    // real number the engine would use.
    expect(
      FLAT_STAT_GRANT.test("Gain {{as|10 '''bonus''' mana regeneration}}. Manaless champions gain {{as|15 '''bonus''' health regeneration}} instead."),
    ).toBe(false);
  });
});

describe('census/the other shape tests', () => {
  it('finds a grant stated as a share of another stat', () => {
    expect(SHARE_OF_ANOTHER_STAT.test("Grants {{as|ability power}} equal to {{as|1% '''bonus''' mana}}.")).toBe(true);
    expect(SHARE_OF_ANOTHER_STAT.test("Gain {{as|'''bonus''' attack damage}} equal to {{as|50% '''base''' AD}}.")).toBe(true);
  });

  it("finds a stat MULTIPLIED — Rabadon's 30% and Spirit Visage's 25%", () => {
    expect(MULTIPLIES_A_STAT.test('Increase your {{as|ability power}} by 30%.')).toBe(true);
    expect(
      MULTIPLIES_A_STAT.test(
        'Increases all {{tip|heal|healing}} and {{tip|shield|shielding}} received as well as {{stil|health regeneration}} by 25%.',
      ),
    ).toBe(true);
  });

  it('finds a damage amplifier and a damage-taken reduction', () => {
    expect(AMPLIFIES_DAMAGE.test('For each second in combat, deal 2% increased damage.')).toBe(true);
    expect(AMPLIFIES_DAMAGE.test('While above 50% of your maximum health, you deal 4% increased damage.')).toBe(true);
  });
});

describe('census/an effect blocked twice is released by neither shape alone', () => {
  it("returns every class that applies, not the first — Sterak's Gage is conditional AND a share AND a shield", () => {
    const steraks =
      "If you would take damage that would reduce you below {{as|30% of your '''maximum''' health}}, you first gain a {{tip|shield}} that absorbs damage equal to {{as|60% of '''bonus''' health}}.";
    const classes = statModifierBlockers(row(steraks, true));
    expect(classes).toEqual(
      expect.arrayContaining([
        'stat-grant-is-conditional',
        'stat-grant-is-a-share-of-another-stat',
        'grants-a-shield',
      ]),
    );
    expect(classes.length).toBeGreaterThan(1);
  });

  it('returns nothing but the flat-grant class for the one effect nothing else blocks', () => {
    expect(
      statModifierBlockers(
        row("Grants {{as|30 '''bonus''' attack damage}} for 180 seconds. Can be used while dead."),
      ),
    ).toEqual(['flat-stat-grant-nothing-blocks']);
  });
});
