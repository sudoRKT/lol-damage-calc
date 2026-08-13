// Known-answer tests for item and rune EFFECT VALUES.
//
// Every wikitext string below is a VERBATIM quote from `Module:ItemData/data` on the official
// wiki, fetched 2026-08-13 against patch 16.16.1, or from `runesReforged.json` 16.16.1. They
// are quoted rather than paraphrased, because a paraphrase tests the paraphrase.
//
// The expected numbers are the ones a reader sees on the item's own page. Where a value is
// REFUSED, the test asserts the refusal and its reason — a refusal is a result and is worth a
// test exactly as much as a number is.
//
// The interpolation rule for {{pp}} is not invented here: it is read from
// `Module:Ability progression` (defaultSize 18, linear fill placing `from` at level 1 and `to`
// at level 18), the same rule `src/types/scaling.ts` documents.

import { describe, expect, it } from 'vitest';

import type { EffectRecord } from './effect-census.ts';
import {
  constantScaling,
  evalArithmetic,
  extractItemEffect,
  rangeArms,
  rangeScaling,
  readRun,
  resolveDisplay,
  splitTopLevel,
  sentenceAround,
  statesARecurringInterval,
  toContractRatios,
  tokenizeRun,
} from './effect-values.ts';
import {
  ddragonAttributes,
  ddragonEffectProse,
  ddragonRestatesNumbers,
} from './effect-owner-crosscheck.ts';
import { gateEffect } from './effect-values-gate.ts';
import { READ_POPULATION, readingFor } from './effect-values-read.ts';

function item(ownerName: string, id: number, key: string, text: string): EffectRecord {
  return { source: 'item', ownerName, id, key, effectName: null, text };
}

// ---------------------------------------------------------------------------

describe('template resolution: the arithmetic the wiki writes inside {{ap}}', () => {
  it('splits on | at brace depth 0 only', () => {
    expect(splitTopLevel('{{ap|60/6}} {{as|(+ {{ap|6/6}}% AP)}} magic damage|magic damage')).toEqual(
      ['{{ap|60/6}} {{as|(+ {{ap|6/6}}% AP)}} magic damage', 'magic damage'],
    );
  });

  it('evaluates the constant expressions and refuses anything else', () => {
    expect(evalArithmetic('60/6')).toBe(10);
    expect(evalArithmetic('120*0.7')).toBe(84);
    expect(evalArithmetic('(15/6)+7.5')).toBe(10);
    expect(evalArithmetic('15+(7.5*6)')).toBe(60);
    // A rank variable is not arithmetic — it is a progression, and must not be evaluated.
    expect(evalArithmetic('150 + (200-150)/10*(x-1) for 13')).toBeNull();
    expect(evalArithmetic('60 to 100')).toBeNull();
  });

  it('keeps BOTH arms of {{rd}} rather than silently taking the melee half', () => {
    // Titanic Hydra, verbatim. Taking 1% here and dropping 0.5% would halve every ranged
    // holder's damage while looking exactly like a correct answer. The marker used to throw
    // both arms away, which was safe only because the effect was then refused outright; now
    // that both numbers can be stored, both have to survive the flattening.
    const flat = resolveDisplay("{{rd|1%|{{fd|0.5}}%}} '''maximum''' health");
    expect(flat).toContain('«rd:');
    expect(flat).toContain('1%');
    expect(flat).toContain('0.5');
    expect(rangeArms(flat)!.melee).toContain('1%');
    expect(rangeArms(flat)!.ranged).toContain('0.5');
    expect(rangeArms(flat)!.melee).not.toContain('0.5');
  });

  it('refuses a template it does not know rather than dropping it', () => {
    expect(resolveDisplay('{{someNewWrapper|40}}')).toContain('«tpl:somenewwrapper»');
  });
});

// ---------------------------------------------------------------------------

describe('tokenizing a damage run', () => {
  it('reads a flat base and an AP ratio (Nashor\'s Tooth)', () => {
    const t = tokenizeRun("15 (+ 15% AP) '''bonus''' magic damage");
    expect(t.refusals).toEqual([]);
    expect(t.base).toBe(15);
    expect(t.ratios).toEqual([{ stat: 'AP', value: 15 }]);
  });

  it('distinguishes base AD, bonus AD and total AD', () => {
    expect(tokenizeRun("100% '''base''' AD").ratios).toEqual([{ stat: 'baseAD', value: 100 }]);
    expect(tokenizeRun("(+10% '''bonus''' AD)").ratios).toEqual([{ stat: 'bonusAD', value: 10 }]);
    expect(tokenizeRun('80% AD').ratios).toEqual([{ stat: 'totalAD', value: 80 }]);
  });

  it('reads a health pool WITH its owner when the source states one', () => {
    expect(tokenizeRun("10% of target's '''maximum''' health").ratios).toEqual([
      { stat: 'maxHP', value: 10, owner: 'target' },
    ]);
    expect(tokenizeRun("3% of your '''bonus''' health").ratios).toEqual([
      { stat: 'bonusHP', value: 3, owner: 'holder' },
    ]);
  });

  it('records `unresolved` when the source names a pool and nobody owns it', () => {
    // Heartsteel, verbatim. DATA-SOURCES §37.3 lists it among the 56 permanently unresolvable.
    expect(tokenizeRun("(+ 6% '''maximum''' health)").ratios).toEqual([
      { stat: 'maxHP', value: 6, owner: 'unresolved' },
    ]);
  });

  it('refuses an unrecognised token instead of skipping it', () => {
    const t = tokenizeRun('50 (+ 1.5 per 1 lethality) bonus true damage');
    expect(t.refusals.map((r) => r.reason)).toContain('scales-on-lethality');
  });

  it('refuses a second flat number rather than picking one', () => {
    expect(tokenizeRun('40 60 magic damage').refusals.map((r) => r.reason)).toContain(
      'unparsed-token',
    );
  });
});

// ---------------------------------------------------------------------------

describe('extracting a whole item effect — values a reader can check on the item page', () => {
  const cases: {
    name: string;
    text: string;
    damageType: string;
    base: number | null;
    ratios: unknown[];
  }[] = [
    {
      name: "Wit's End — 45 bonus magic damage on-hit",
      text: "Basic attacks deal {{as|45 '''bonus''' magic damage}} [[on-hit]].",
      damageType: 'magic',
      base: 45,
      ratios: [],
    },
    {
      name: 'Sheen — 100% base AD, no flat part at all',
      text:
        'After using an [[Champion ability|ability]], your next basic attack within 10 seconds ' +
        "deals {{as|100% '''base''' AD}} {{as|'''bonus''' physical damage}} [[on-hit]].",
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'baseAD', value: 100 }],
    },
    {
      name: 'Terminus — 30 (+10% bonus AD) (+10% AP) magic',
      text:
        "Basic attacks deal {{as|30|magic damage}} {{as|(+10% '''bonus''' AD)}} " +
        "{{as|(+ 10% AP)}} {{as|'''bonus''' magic damage}} [[on-hit]].",
      damageType: 'magic',
      base: 30,
      ratios: [
        { stat: 'bonusAD', value: 10 },
        { stat: 'AP', value: 10 },
      ],
    },
    {
      name: "Redemption — 10% of the TARGET's maximum health as true damage",
      text:
        'Allies within the area are {{tip|heal|healed}} for {{pp|150 to 350|type=target\'s level' +
        "|color=heal}}, while enemy champions within take {{as|10% of target's '''maximum''' " +
        'health}} as {{as|true damage}}.',
      damageType: 'true',
      base: null,
      ratios: [{ stat: 'maxHP', value: 10, owner: 'target' }],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const out = extractItemEffect(item('x', 1, 'pass', c.text));
      expect(out.refusals).toEqual([]);
      expect(out.component?.damageType).toBe(c.damageType);
      expect(out.component?.base).toBe(c.base);
      expect(out.component?.ratios).toEqual(c.ratios);
    });
  }

  it('reads Hextech Gunblade at level 18 as 253, not the level-20 tooltip cell', () => {
    // {{pp|175 to 253|tooltipSize=20}}. Module:Ability progression fills 18 values and then
    // APPENDS the extrapolated level-19 and level-20 cells (257.6 and 262.2). Reading the last
    // cell is the DATA-SOURCES §13 trap; it would overstate this active by 9 damage.
    const out = extractItemEffect(
      item(
        'Hextech Gunblade',
        3146,
        'act',
        'dealing {{as|{{pp|175 to 253|tooltipSize=20}}|magic damage}} {{as|(+ 30% AP)}} ' +
          '{{as|magic damage}} and {{tip|slow|slowing}} them by 25%',
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.baseScaling).toEqual({
      scaling: 'byLevel',
      from: 175,
      to: 253,
      atLevels: [1, 18],
      steps: 18,
    });
  });

  it('does NOT let the heal in the same sentence join the damage (Dusk and Dawn)', () => {
    const out = extractItemEffect(
      item(
        'Dusk and Dawn',
        2510,
        'pass',
        "your next basic attack within 10 seconds deals {{as|75% '''base''' AD}} " +
          "{{as|(+ 10% AP)}} {{as|'''bonus''' magic damage}} and {{tip|heals}} you for " +
          "{{as|10% AP}} {{as|(+ 3% '''bonus''' health)}} on-hit",
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.ratios).toEqual([
      { stat: 'baseAD', value: 75 },
      { stat: 'AP', value: 10 },
    ]);
  });

  // -------------------------------------------------------------------------
  // The melee/ranged pair. Until 2026-08-13 these effects were REFUSED and the two tests below
  // pinned that refusal. `Scaling` gained a `byRangeType` arm (DATA-SOURCES §41), so the tests
  // now pin something STRICTER than "it refuses": both numbers, in the right arms. The failure
  // they exist to catch is storing one arm and calling it the value.
  // -------------------------------------------------------------------------

  it('reads BOTH arms of a melee/ranged split, and puts each in its own arm (Titanic Hydra)', () => {
    const out = extractItemEffect(
      item(
        'Titanic Hydra',
        3748,
        'pass',
        "Basic attacks [[on-hit]] deal {{as|{{rd|1%|{{fd|0.5}}%}} '''maximum''' health|hp}} " +
          "{{as|'''bonus''' physical damage}} to the target",
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.ratios).toEqual([
      { stat: 'maxHP', owner: 'unresolved', byRangeType: { melee: 1, ranged: 0.5 } },
    ]);
  });

  it('resolves the wiki module\'s own arithmetic inside a ranged arm (Hullbreaker 120*0.7 = 84)', () => {
    const out = extractItemEffect(
      item(
        'Hullbreaker',
        3181,
        'pass',
        "deal {{as|{{rd|120%|{{ap|120*0.7}}%}} '''base''' AD|ad}} " +
          "{{as|(+ {{rd|5%|{{ap|5*0.7}}%}} '''maximum''' health)}} " +
          "{{as|'''bonus''' physical damage}}",
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.ratios).toEqual([
      { stat: 'baseAD', byRangeType: { melee: 120, ranged: 84 } },
      { stat: 'maxHP', owner: 'unresolved', byRangeType: { melee: 5, ranged: 3.5 } },
    ]);
  });

  it('refuses a {{rd}} whose arms are level formulas rather than reading the first number (Kraken Slayer)', () => {
    const out = extractItemEffect(
      item(
        'Kraken Slayer',
        6672,
        'pass',
        '{{as|{{rd|150 + (200-150)/10*(x-1) for 13|150*0.8 + (200*0.8-150*0.8)/10*(x-1) for 13' +
          "|levels=1;9 to 20|pp=true}} '''bonus''' physical damage|physical damage}}",
      ),
    );
    expect(out.component).toBeNull();
    expect(out.refusals.map((r) => r.reason)).toContain('range-split-has-named-arguments');
  });

  // -------------------------------------------------------------------------
  // Damage over time. Also previously a refusal; `CuratedItemEffect.overTime` now holds it.
  // -------------------------------------------------------------------------

  it('records a burn as recurring and stores ONE instance (Sunfire Aegis)', () => {
    const out = extractItemEffect(
      item(
        'Sunfire Aegis',
        3068,
        'pass',
        "Deal {{as|20 {{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} " +
          'every second to enemies within 325 units',
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.base).toBe(20);
    expect(out.overTime?.sourceSays).toContain('every second');
    // THE COUNT IS NOT STATED, so it is not recorded. "every second" and a duration elsewhere in
    // the item are two time values; dividing them is arithmetic on elapsed time.
    expect(out.overTime?.totalInstances).toBeUndefined();
  });

  it("takes the instance count from the source's own divisor and checks it against the stated total (Blackfire Torch)", () => {
    const out = extractItemEffect(
      item(
        'Blackfire Torch',
        2503,
        'pass',
        'Dealing [[ability damage]] burns enemies, causing them to take ' +
          '{{as|{{ap|60/6}} {{as|(+ {{ap|6/6}}% AP)}} magic damage|magic damage}} every ' +
          '{{fd|0.5}} seconds over 3 seconds, for a total of {{as|60|magic damage}} ' +
          '{{as|(+ 6% AP)}}.',
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.component?.base).toBe(10);
    expect(out.component?.ratios).toEqual([{ stat: 'AP', value: 1 }]);
    expect(out.overTime?.totalInstances).toBe(6);
  });

  it('refuses when the per-instance figure times the stated count does NOT reach the stated total', () => {
    // Same shape as Blackfire Torch with the total changed to 50. 10 x 6 is 60, not 50, so one
    // of the three numbers is being misread and none of them may be stored.
    const out = extractItemEffect(
      item(
        'Blackfire Torch',
        2503,
        'pass',
        'burns enemies, causing them to take {{as|{{ap|60/6}} magic damage|magic damage}} every ' +
          '{{fd|0.5}} seconds over 3 seconds, for a total of {{as|50|magic damage}}.',
      ),
    );
    expect(out.component).toBeNull();
    expect(out.refusals.map((r) => r.reason)).toContain('dot-total-disagrees-with-tick');
  });

  it('refuses when a total is stated but the source states no count anywhere', () => {
    const out = extractItemEffect(
      item(
        'Blackfire Torch',
        2503,
        'pass',
        'burns enemies, causing them to take {{as|10 magic damage|magic damage}} every ' +
          '{{fd|0.5}} seconds over 3 seconds, for a total of {{as|60|magic damage}}.',
      ),
    );
    expect(out.component).toBeNull();
    expect(out.refusals.map((r) => r.reason)).toContain('dot-total-disagrees-with-tick');
  });

  it('takes the total from the SENTENCE that states this damage, not the monster sentence after it', () => {
    // Blackfire Torch says "for a total of" twice. The second is the monster figure (120).
    // Searching the whole text would double the champion value.
    const out = extractItemEffect(
      item(
        'Blackfire Torch',
        2503,
        'pass',
        'causing them to take {{as|{{ap|60/6}} magic damage|magic damage}} every {{fd|0.5}} ' +
          'seconds over 3 seconds, for a total of {{as|60|magic damage}}. Against monsters, ' +
          'dealing a total of {{as|120|magic damage}} for a total of {{as|120|magic damage}}.',
      ),
    );
    expect(out.refusals).toEqual([]);
    expect(out.overTime?.totalInstances).toBe(6);
  });

  it('detects a recurring interval in each of the four wordings the sources use', () => {
    expect(statesARecurringInterval('Deal 15 magic damage every second')).toBe('every second');
    expect(statesARecurringInterval('take 10 magic damage every {{fd|0.5}} seconds')).toBe(
      'every 0.5 seconds',
    );
    expect(statesARecurringInterval('the burn deals 10 bonus magic damage per tick')).toBe(
      'per tick',
    );
    expect(statesARecurringInterval('bonus true damage over 3 seconds')).toBe('over 3 seconds');
    expect(statesARecurringInterval('Basic attacks deal 45 bonus magic damage on-hit')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('the gate: a value is stored only where parser and reading agree', () => {
  it('stores a value both agree on', () => {
    const out = gateEffect(
      item("Wit's End", 3091, 'pass', "Basic attacks deal {{as|45 '''bonus''' magic damage}} [[on-hit]]."),
    );
    expect(out.outcome).toBe('stored');
    expect(out.components?.[0]!.damageType).toBe('magic');
    expect(out.components?.[0]!.base).toEqual({ scaling: 'explicit', perRank: [45] });
  });

  it('REFUSES when the parser and the reading disagree about a number', () => {
    // Same item id and key, wikitext altered to 46. The reading says 45. Neither is trusted.
    const out = gateEffect(
      item("Wit's End", 3091, 'pass', "Basic attacks deal {{as|46 '''bonus''' magic damage}} [[on-hit]]."),
    );
    expect(out.outcome).toBe('refused');
    expect(out.refusals[0]!.reason).toBe('parser-disagrees-with-reading');
    expect(out.refusals[0]!.detail).toContain('46');
  });

  it('REFUSES an effect nobody has read, however cleanly it parses', () => {
    const out = gateEffect(
      item('Some Future Item', 999999, 'pass', "deals {{as|50 '''bonus''' magic damage}}"),
    );
    expect(out.outcome).toBe('refused');
    expect(out.refusals[0]!.reason).toBe('not-in-read-population');
  });

  it('never stores a rune, because nothing can confirm the reading', () => {
    const runeRecord: EffectRecord = {
      source: 'rune',
      ownerName: 'Aftershock',
      id: 8439,
      key: 'rune',
      effectName: null,
      text: 'Then explode, dealing magic damage to nearby enemies. Damage: 25 - 120',
    };
    expect(gateEffect(runeRecord).outcome).toBe('refused');
  });

  it('marks an unresolved owner so the entry can never claim better than incomplete', () => {
    // Titanic Hydra: "1% maximum health" and NEITHER source says whose. This test used
    // Heartsteel until 2026-08-13; Heartsteel stopped being an example of the rule when the
    // adopted Data Dragon attribution was applied to it (see the two tests below), so the rule
    // is now demonstrated on an effect that is still genuinely unattributed. The RULE is
    // unchanged — only the exemplar moved.
    const out = gateEffect(
      item(
        'Titanic Hydra',
        3748,
        'pass',
        "{{as|{{rd|1%|{{fd|0.5}}%}} '''maximum''' health|hp}} {{as|'''bonus''' physical damage}}",
      ),
    );
    expect(out.outcome).toBe('stored');
    expect(out.hasUnresolvedOwner).toBe(true);
    expect(out.verification).toBe('incomplete');
    // The missing fact is NAMED, so the interface can say "cannot be completed" rather than
    // "not yet modelled" (SPECIFICATION §8).
    expect(out.unresolvable?.[0]!.field).toContain('maxHP');
    expect(out.unresolvable?.[0]!.why).toContain('never says whose');
  });

  it('applies the adopted Data Dragon attribution to Heartsteel', () => {
    // DATA-SOURCES §41.1 ADOPTED the rule — an attribution by the other source is a source
    // STATING a fact, not an inference from convention — and nothing acted on it, so this effect
    // kept shipping `owner: 'unresolved'` against a source reading "your max Health". The wiki
    // text below is unchanged; what changed is that both sources are now consulted.
    //
    // `holder`, not `caster`: the same item on the defender reads off the defender.
    const out = gateEffect(
      item(
        'Heartsteel',
        3084,
        'pass',
        'Your next basic attack against a target with 3 stacks is empowered to consume them all ' +
          "to deal {{as|70|physical damage}} {{as|(+ 6% '''maximum''' health)}} " +
          "{{as|'''bonus''' physical damage}} [[on-hit]]",
      ),
    );
    expect(out.outcome).toBe('stored');
    expect(out.components?.[0]!.ratios[0]!.owner).toBe('holder');
    // Every fact the STORED component needs is now attributed, so it is no longer incomplete.
    // Heartsteel still belongs to §37.3's permanently-unresolvable population under that
    // section's own effect-level definition — a third reference in the same prose, the permanent
    // BONUS health it grants, is attributed by neither source — but that clause is not stored
    // here and does not make this damage figure incomplete. Two different questions.
    expect(out.hasUnresolvedOwner).toBe(false);
    expect(out.verification).toBe('derived');
    expect(out.unresolvable).toBeUndefined();
  });

  it('does NOT attribute the SAME wording on an effect the table does not name', () => {
    // The paired test, and it is the important one. Without it the Heartsteel case above would
    // pass for an implementation that resolved every unattributed maxHP reference to the holder
    // — which is exactly the convention argument DATA-SOURCES §16 rejects. Identical wikitext,
    // a different item id, and the owner stays unresolved: the table is a confirmed population,
    // not a rule.
    const out = gateEffect(
      item(
        'Heartsteel',
        3084,
        'pass2',
        'Your next basic attack against a target with 3 stacks is empowered to consume them all ' +
          "to deal {{as|70|physical damage}} {{as|(+ 6% '''maximum''' health)}} " +
          "{{as|'''bonus''' physical damage}} [[on-hit]]",
      ),
    );
    expect(out.components?.[0]!.ratios[0]!.owner ?? 'unresolved').toBe('unresolved');
  });

  it('emits the melee/ranged pair as the contract byRangeType arm (Titanic Hydra)', () => {
    const out = gateEffect(
      item(
        'Titanic Hydra',
        3748,
        'pass',
        "Basic attacks [[on-hit]] deal {{as|{{rd|1%|{{fd|0.5}}%}} '''maximum''' health|hp}} " +
          "{{as|'''bonus''' physical damage}} to the target and " +
          "{{as|{{rd|3%|{{fd|1.5}}%}} '''maximum''' health|hp}} {{as|physical damage}} to other " +
          'enemies in a cone in the direction of the primary target.',
      ),
    );
    expect(out.outcome).toBe('stored');
    expect(out.components?.[0]!.ratios[0]).toEqual({
      stat: 'maxHP',
      owner: 'unresolved',
      scaling: 'byRangeType',
      melee: { scaling: 'explicit', perRank: [1] },
      ranged: { scaling: 'explicit', perRank: [0.5] },
    });
    expect(out.appliesAs).toBe('on-hit');
  });

  it('emits overTime and marks the effect periodic (Sunfire Aegis)', () => {
    const out = gateEffect(
      item(
        'Sunfire Aegis',
        3068,
        'pass',
        "Taking or dealing damage activates this passive for 3 seconds. Deal {{as|20 " +
          "{{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} every second to " +
          'enemies within 325 units.',
      ),
    );
    expect(out.outcome).toBe('stored');
    expect(out.appliesAs).toBe('periodic');
    expect(out.overTime?.sourceSays).toContain('every second');
    expect(out.overTime?.totalInstances).toBeUndefined();
    expect(out.verification).toBe('incomplete');
  });

  it('REFUSES when the parser finds a recurrence the reading does not record', () => {
    // Wit's End's reading records no recurrence. Wikitext altered to say the damage recurs.
    const out = gateEffect(
      item(
        "Wit's End",
        3091,
        'pass',
        "Basic attacks deal {{as|45 '''bonus''' magic damage}} every second.",
      ),
    );
    expect(out.outcome).toBe('refused');
    expect(out.refusals[0]!.reason).toBe('parser-disagrees-with-reading');
    expect(out.refusals[0]!.detail).toContain('recurrence');
  });

  it('REFUSES when the parser reads one value and the reading records a melee/ranged pair', () => {
    // Titanic Hydra's reading records 1% / 0.5%. Wikitext altered to a single 1%.
    const out = gateEffect(
      item(
        'Titanic Hydra',
        3748,
        'pass',
        "Basic attacks [[on-hit]] deal {{as|1% '''maximum''' health|hp}} " +
          "{{as|'''bonus''' physical damage}} to the target.",
      ),
    );
    expect(out.outcome).toBe('refused');
    expect(out.refusals[0]!.reason).toBe('parser-disagrees-with-reading');
    expect(out.refusals[0]!.detail).toContain('1 / 0.5');
  });
});

// ---------------------------------------------------------------------------

describe('the read population itself', () => {
  it('covers all 63 structurally-stated damaging effects, with no duplicates', () => {
    expect(READ_POPULATION).toHaveLength(63);
    const keys = new Set(READ_POPULATION.map((r) => `${r.id}|${r.key}`));
    expect(keys.size).toBe(63);
  });

  it('every reading quotes the sentence it rests on', () => {
    const silent = READ_POPULATION.filter((r) => r.sentence.trim().length < 20);
    expect(silent.map((r) => r.ownerName)).toEqual([]);
  });

  it('every refusal names at least one reason, and every store names its values', () => {
    for (const r of READ_POPULATION) {
      if (r.verdict === 'refuse') expect(r.reasons?.length ?? 0).toBeGreaterThan(0);
      else expect(r.expect).toBeDefined();
    }
  });

  // The split was 28 / 35 until the contract pass of 2026-08-13 (DATA-SOURCES §41) gave the
  // melee/ranged pair and the recurring-damage flag somewhere to live. TEN readings were re-read
  // and moved from refuse to store: four range splits and six recurring effects.
  it('splits 38 store / 25 refuse — the numbers this run reports', () => {
    expect(READ_POPULATION.filter((r) => r.verdict === 'store')).toHaveLength(38);
    expect(READ_POPULATION.filter((r) => r.verdict === 'refuse')).toHaveLength(25);
  });

  it('records the two documented owner cases: Redemption target, Unending Despair holder', () => {
    expect(readingFor(3107, 'act')!.expect!.ratios[0]!.owner).toBe('target');
    expect(readingFor(2502, 'pass')!.expect!.ratios[0]!.owner).toBe('holder');
  });

  it('no reading still cites a reason the contract can now express', () => {
    // `melee-ranged-split` and `damage-over-time` stopped being blockers. A reading that still
    // named one would be withholding a value for a reason that no longer exists — except
    // Bastionbreaker pass2, which is turret-only and refuses on reach.
    const stale = READ_POPULATION.filter(
      (r) => r.verdict === 'refuse' && (r.reasons ?? []).includes('melee-ranged-split'),
    );
    expect(stale.map((r) => `${r.ownerName} [${r.key}]`)).toEqual([]);
  });

  it('every stored recurring effect records what the source says, and invents no count', () => {
    const recurring = READ_POPULATION.filter((r) => r.verdict === 'store' && r.expect?.overTime);
    expect(recurring.map((r) => r.ownerName).sort()).toEqual([
      "Bami's Cinder",
      'Blackfire Torch',
      'Fated Ashes',
      'Hollow Radiance',
      'Sunfire Aegis',
      'Unending Despair',
    ]);
    // Only the two that state a total carry a count.
    const withCount = recurring.filter((r) => r.expect!.overTime!.totalInstances !== undefined);
    expect(withCount.map((r) => r.ownerName).sort()).toEqual(['Blackfire Torch', 'Fated Ashes']);
  });

  it('every stored range split records BOTH arms, never one', () => {
    const split = READ_POPULATION.filter(
      (r) =>
        r.verdict === 'store' &&
        (r.expect!.baseByRangeType || r.expect!.ratios.some((x) => x.byRangeType)),
    );
    expect(split.map((r) => `${r.ownerName} [${r.key}]`).sort()).toEqual([
      'Hullbreaker [pass]',
      'Titanic Hydra [act]',
      'Titanic Hydra [pass]',
      'Voltaic Cyclosword [pass3]',
    ]);
    for (const r of split) {
      for (const ratio of r.expect!.ratios) {
        if (ratio.byRangeType) {
          expect(ratio.value).toBeUndefined();
          expect(ratio.byRangeType.melee).not.toBe(ratio.byRangeType.ranged);
        }
      }
    }
  });

  it('every stored effect either names a contract activation or says why it cannot', () => {
    const stored = READ_POPULATION.filter((r) => r.verdict === 'store');
    const withoutCode = stored.filter((r) => !r.appliesAsCode);
    // FIVE, and each states a trigger `appliesAs` has no arm for. Reported, not forced.
    expect(withoutCode.map((r) => r.ownerName).sort()).toEqual([
      'Elixir of Sorcery',
      'Hextech Alternator',
      "Scout's Slingshot",
      'Stormsurge',
      "Zaz'Zak's Realmspike",
    ]);
    for (const r of withoutCode) expect(r.appliesAs).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('a run that names a damage type and carries no value is a TRIGGER', () => {
  it('refuses Black Cleaver rather than producing a zero-damage component', () => {
    // Verbatim. "Dealing physical damage … applies a stack" names physical damage and deals
    // none. DATA-SOURCES §37.4 defect 1 — 20 of the census's own first-run instances were this.
    const out = extractItemEffect(
      item(
        'Black Cleaver',
        3071,
        'pass',
        "Dealing {{as|physical damage}} to an enemy champion applies a stack of ''Carve''.",
      ),
    );
    expect(out.component).toBeNull();
    expect(out.refusals.map((r) => r.reason)).toContain('no-structural-damage-run');
  });
});

describe('an interval is read from the DAMAGE sentence, not from anywhere in the text', () => {
  it("does not refuse Stridebreaker's active for a movement-speed decay two sentences later", () => {
    // Verbatim. "decaying over 3 seconds" is about MOVE SPEED. Testing the whole text refused
    // this effect; testing the damage sentence stores it. Position, not the word.
    const text =
      "Deal {{as|80% AD}} {{as|physical damage}} to enemies within a 450 radius " +
      '{{tt|in front of you|100 unit offset}} and {{tip|slow}} them by 35% for 3 seconds. For ' +
      "each champion hit, gain {{as|35% '''bonus''' movement speed}} decaying over 3 seconds.";
    expect(sentenceAround(text, 5)).not.toContain('decaying');
    const out = extractItemEffect(item('Stridebreaker', 6631, 'act', text));
    expect(out.refusals).toEqual([]);
    expect(out.component?.ratios).toEqual([{ stat: 'totalAD', value: 80 }]);
  });
});

describe('the second source: Data Dragon item prose', () => {
  it('strips the <stats> block, which is flat stats and not effect prose', () => {
    const prose = ddragonEffectProse(
      '<mainText><stats><attention>45</attention> Magic Resist</stats><br><passive>Fray</passive>' +
        '<br>Attacks deal <magicDamage>bonus magic damage</magicDamage>.</mainText>',
    );
    expect(prose).not.toContain('45');
    expect(prose).toContain('bonus magic damage');
  });

  it('counts a number as restated only when it sits beside the word damage', () => {
    // Terminus: Data Dragon's description contains "10% Armor Penetration" from a different
    // passive. A bare presence test called that corroboration of Terminus's (+10% AP) ratio.
    // Verbatim from item.json 16.16.1, tags stripped — NOT abbreviated. An abbreviated quote
    // moved "10%" 150 characters closer to the word "damage" and made the test pass for the
    // wrong reason, which is the same class of mistake the test is about.
    const terminus =
      'Shadow Attacks deal bonus magic damage On-Hit . Juxtaposition Alternate between Light ' +
      'and Dark Attacks against champions: Light Attacks grant Armor and Magic Resist for 5s. ' +
      'Dark Attacks grant 10% Armor Penetration and Magic Penetration for 5s.';
    expect(ddragonRestatesNumbers(terminus, [30, 10]).restated).toEqual([]);
    const recurve = 'Sting Attacks deal 15 bonus physical damage On-Hit .';
    expect(ddragonRestatesNumbers(recurve, [15]).restated).toEqual([15]);
  });

  it('reads the possessive Data Dragon states where the wiki states none', () => {
    // The finding: the wiki's Black Cleaver says "6% armor reduction" and names nobody, which is
    // DATA-SOURCES §16's own worked example. Data Dragon names the target outright.
    expect(ddragonAttributes("Carve Attacks reduce the target's Armor by 6%", 'armor')).toEqual({
      stat: 'armor',
      says: "the target's Armor",
      ddragonSays: 'other champion',
    });
    expect(
      ddragonAttributes('deals 70 plus 6% of your max Health as bonus physical damage', 'maxHP'),
    ).toEqual({ stat: 'maxHP', says: 'your max Health', ddragonSays: 'holder' });
  });

  it('does not read "its" as an owner, on either source', () => {
    // World Atlas: "a minion below 30% of its maximum health" is neither champion.
    expect(ddragonAttributes('a minion below 30% of its maximum Health', 'maxHP')).toBeNull();
  });
});

describe('the contract shapes the output claims to match', () => {
  it('stores an item constant as a one-entry explicit list, never as a fake rank progression', () => {
    expect(constantScaling(45)).toEqual({ scaling: 'explicit', perRank: [45] });
  });

  it('keeps the ratio unit in percentage POINTS, as Ratio documents', () => {
    // `(+ 15% AP)` is 15, never 0.15. Reading it the other way is a hundred-fold error.
    expect(toContractRatios([{ stat: 'AP', value: 15 }])).toEqual([
      { stat: 'AP', scaling: 'explicit', perRank: [15] },
    ]);
  });

  it('carries the owner onto the contract ratio', () => {
    expect(toContractRatios([{ stat: 'maxHP', value: 10, owner: 'target' }])).toEqual([
      { stat: 'maxHP', owner: 'target', scaling: 'explicit', perRank: [10] },
    ]);
  });

  it('stores a melee/ranged pair as two arms, each itself a Scaling', () => {
    expect(rangeScaling({ melee: 120, ranged: 84 })).toEqual({
      scaling: 'byRangeType',
      melee: { scaling: 'explicit', perRank: [120] },
      ranged: { scaling: 'explicit', perRank: [84] },
    });
  });

  it('collapses a "split" whose two arms are the same number, rather than claiming a split', () => {
    // If the source ever writes {{rd|10|10}} there is nothing to choose between, and storing a
    // byRangeType would make the engine demand a range type it does not need.
    const out = readRun(resolveDisplay('{{rd|10|10}} magic damage'));
    expect(out.base).toBe(10);
    expect(out.baseByRangeType).toBeUndefined();
  });

  it('refuses two arms that read to different shapes instead of merging them', () => {
    const out = readRun(resolveDisplay('{{rd|10% AP|20}} magic damage'));
    expect(out.refusals.map((r) => r.reason)).toContain('range-split-arms-differ-in-shape');
  });
});
