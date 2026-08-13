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

  it('marks {{rd}} rather than silently taking the melee half', () => {
    // Titanic Hydra, verbatim. Taking 1% here and dropping 0.5% would halve every ranged
    // holder's damage while looking exactly like a correct answer.
    expect(resolveDisplay("{{rd|1%|{{fd|0.5}}%}} '''maximum''' health")).toContain('«rd»');
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

  it('refuses the melee/ranged split rather than storing the melee half (Titanic Hydra)', () => {
    const out = extractItemEffect(
      item(
        'Titanic Hydra',
        3748,
        'pass',
        "Basic attacks [[on-hit]] deal {{as|{{rd|1%|{{fd|0.5}}%}} '''maximum''' health|hp}} " +
          "{{as|'''bonus''' physical damage}} to the target",
      ),
    );
    expect(out.component).toBeNull();
    expect(out.refusals.map((r) => r.reason)).toContain('melee-ranged-split');
  });

  it('refuses a burn because the source states an interval (Sunfire Aegis)', () => {
    const out = extractItemEffect(
      item(
        'Sunfire Aegis',
        3068,
        'pass',
        "Deal {{as|20 {{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} " +
          'every second to enemies within 325 units',
      ),
    );
    expect(out.refusals.map((r) => r.reason)).toContain('damage-over-time');
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
    expect(out.hasUnresolvedOwner).toBe(true);
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

  it('splits 28 store / 35 refuse — the numbers this run reports', () => {
    expect(READ_POPULATION.filter((r) => r.verdict === 'store')).toHaveLength(28);
    expect(READ_POPULATION.filter((r) => r.verdict === 'refuse')).toHaveLength(35);
  });

  it('records the two documented owner cases: Redemption target, Unending Despair holder', () => {
    expect(readingFor(3107, 'act')!.expect!.ratios[0]!.owner).toBe('target');
    expect(readingFor(2502, 'pass')!.reasons).toContain('damage-over-time');
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
});
