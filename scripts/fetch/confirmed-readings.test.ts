// KNOWN-ANSWER TESTS for the two corrections of 2026-08-15, and for the rule they work by.
//
// Every string quoted here was read from a live source on 2026-08-15: Data Dragon 16.16.1
// (runesReforged.json, item.json) and Module:ItemData/data as stored verbatim in
// public/data/effect-census.json.
//
// The suite is built to prove the corrections say NO as well as YES. That matters more here than
// anywhere else in this area, because the failure being corrected was a check that said YES when
// the sources agreed — and the obvious fix (read the type out of the tag; read the owner out of
// the possessive) would produce the same class of error in the other direction.

import { describe, expect, it } from 'vitest';

import {
  CONFIRMED_MARKUP_READINGS,
  MARKUP_HITS_EXAMINED_AND_REFUSED,
  TYPE_ARGUMENT_READINGS,
  confirmedMarkupReading,
  typeArgumentReading,
} from './confirmed-readings.ts';
import { CANDIDATE_AUDIT } from './effect-census-audit.ts';
import { classifyEffect, findOwnerRefs, type EffectRecord } from './effect-census.ts';
import { namedArguments } from './effect-text.ts';

// --- verbatim source text ---------------------------------------------------------------------

/** Data Dragon 16.16.1 runesReforged.json, rune 8369, AFTER stripHtml — what the census stored. */
const FIRST_STRIKE_STRIPPED =
  'Attacks or abilities against an enemy champion within 0.25s of entering champion combat grant ' +
  '10 gold and First Strike for 3 seconds, causing you to deal 7% extra damage against champions, ' +
  'and granting 50% (35% for ranged champions) of bonus damage dealt as gold . Cooldown: 25 - 15 s';

const item = (ownerName: string, key: string, text: string): EffectRecord => ({
  source: 'item',
  ownerName,
  id: 1,
  key,
  effectName: null,
  text,
});

// --- the markup correction ----------------------------------------------------------------------

describe('confirmed-readings/the markup correction is a LIST, not a rule', () => {
  it('holds exactly one entry, and it is First Strike', () => {
    expect(CONFIRMED_MARKUP_READINGS.map((r) => r.subject)).toEqual(['First Strike']);
  });

  it('records the two tagged texts that were read and REFUSED — the reason it is not a rule', () => {
    expect(MARKUP_HITS_EXAMINED_AND_REFUSED.map((r) => r.subject).sort()).toEqual([
      'Hubris',
      'Staff of Flowing Water',
    ]);
    // Both wrap a STAT, which is what makes reading the tag as a damage type wrong 2 times in 3.
    expect(MARKUP_HITS_EXAMINED_AND_REFUSED.every((r) => /Attack Damage|Ability Power/.test(r.wraps))).toBe(
      true,
    );
  });

  it('every entry quotes the markup, what stripping left, and what was published before', () => {
    for (const reading of CONFIRMED_MARKUP_READINGS) {
      expect(reading.markup).toContain(`<${reading.type}damage>`.toLowerCase());
      expect(reading.strippedReads).not.toMatch(/<[a-z]/i);
      expect(reading.strippedReads).not.toContain(`${reading.type} damage`);
      expect(reading.publishedBefore.length).toBeGreaterThan(0);
      expect(reading.confirmedBy).toContain('rune-contested.json');
    }
  });

  it('matches on source + id + key, never on a name', () => {
    expect(confirmedMarkupReading('rune', 8369, 'rune')?.type).toBe('true');
    expect(confirmedMarkupReading('rune', 8369, 'pass')).toBeNull();
    expect(confirmedMarkupReading('item', 8369, 'rune')).toBeNull();
    expect(confirmedMarkupReading('rune', 8005, 'rune')).toBeNull();
  });
});

describe('confirmed-readings/First Strike, through the census classifier', () => {
  const record: EffectRecord = {
    source: 'rune',
    ownerName: 'First Strike',
    id: 8369,
    key: 'rune',
    effectName: 'Inspiration',
    text: FIRST_STRIKE_STRIPPED,
  };

  it('the stored text on its own still classifies as NO damage — the defect is real', () => {
    // The correction is not hiding the classifier's behaviour; this is what it says unaided,
    // and it is why the published census read damage:"none" for a rune that deals true damage.
    const unconfirmed = { ...record, id: 999999 };
    expect(classifyEffect(unconfirmed).damage).toBe('none');
    expect(classifyEffect(unconfirmed).inScope).toBe(false);
  });

  it('the confirmed reading makes it a damage candidate, in scope, and says so in the row', () => {
    const row = classifyEffect(record);
    expect(row.damage).toBe('candidate');
    expect(row.inScope).toBe(true);
    expect(row.correctedFromMarkup?.machineVerdict).toBe('none');
    expect(row.correctedFromMarkup?.type).toBe('true');
    expect(row.correctedFromMarkup?.markup).toContain('<truedamage>');
  });

  it('the hand audit says it deals damage, so it counts in the after-audit population', () => {
    const verdict = CANDIDATE_AUDIT.find((v) => v.ownerName === 'First Strike' && v.key === 'rune');
    expect(verdict?.dealsDamage).toBe(true);
    expect(verdict?.because).toContain('true damage');
  });

  it('leaves every other rune alone — no rule reads a type out of a tag', () => {
    const hail: EffectRecord = {
      source: 'rune',
      ownerName: 'Hail of Blades',
      id: 9923,
      key: 'rune',
      effectName: null,
      text: 'Gain 90% Attack Speed and bonus true damage when you attack an enemy champion. On-Hit Damage: 2 - 20 damage.',
    };
    expect(classifyEffect(hail).correctedFromMarkup).toBeUndefined();
  });
});

// --- the `type=` correction ---------------------------------------------------------------------

describe('confirmed-readings/`type=` — the wiki states the stat, a person states whose', () => {
  it('namedArguments returns the value plainText deletes', () => {
    const args = namedArguments("{{pp|0 to 75 by 5|key=%|type=target's '''missing''' health}}");
    expect(args.map((a) => a.name)).toEqual(['key', 'type']);
    expect(args.find((a) => a.name === 'type')!.value).toBe("target's missing health");
  });

  it("Kraken Slayer's `type=target's missing health` is now counted, and is the OPPONENT's", () => {
    const refs = findOwnerRefs(
      item(
        'Kraken Slayer',
        'pass',
        'the next basic attack consumes all stacks to deal {{as|150 to 200 physical damage}} ' +
          "on-hit, increased by {{pp|0 to 75 by 5|key=%|type=target's '''missing''' health}}.",
      ),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.stat).toBe('missingHP');
    expect(refs[0]!.owner).toBe('opponent');
    expect(refs[0]!.statedIn).toBe('type-argument');
    expect(refs[0]!.evidence).toBe('read-by-a-person');
  });

  it("Lord Dominik's `type=target's bonus health` is the OPPONENT's — \"against enemy champions\"", () => {
    const refs = findOwnerRefs(
      item(
        "Lord Dominik's Regards",
        'pass',
        "Deal {{pp|0 to 15 for 16|key=%|type=target's '''bonus''' health}} increased damage " +
          'against enemy champions.',
      ),
    );
    expect(refs.filter((r) => r.statedIn === 'type-argument')).toHaveLength(1);
    expect(refs[0]!.stat).toBe('bonusHP');
    expect(refs[0]!.owner).toBe('opponent');
  });

  // THE ONE THAT MATTERS. Identical words, opposite meaning — and getting it wrong would scale
  // three items off the enemy's level instead of an ally's.
  it("Locket's `type=target's level` is an ALLY's, because the sentence SHIELDS rather than damages", () => {
    const refs = findOwnerRefs(
      item(
        'Locket of the Iron Solari',
        'act',
        'Grants you and allied champions within 850 units a shield for ' +
          "{{pp|290 to 360 for 11|1;9 to 18|type=target's level}} that decays over 2.5 seconds.",
      ),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.stat).toBe('level');
    expect(refs[0]!.owner).toBe('ally');
    expect(refs[0]!.owner).not.toBe('opponent');
  });

  it("Redemption states BOTH: an ally's level for the heal, the opponent's health for the damage", () => {
    const refs = findOwnerRefs(
      item(
        'Redemption',
        'act',
        'Allies within the area are healed for ' +
          "{{pp|150 to 350|type=target's level|color=heal}}, while enemy champions within take " +
          "{{as|10% of target's '''maximum''' health}} as {{as|true damage}}.",
      ),
    );
    expect(refs.find((r) => r.stat === 'level')!.owner).toBe('ally');
    expect(refs.find((r) => r.stat === 'maxHP')!.owner).toBe('opponent');
  });

  it('`type=your level` is the holder\'s', () => {
    const refs = findOwnerRefs(
      item(
        'Solstice Sleigh',
        'pass',
        'causes you and the most wounded allied champion to gain ' +
          '{{as|{{pp|50 to 230 for 13|1;7 to 18|type=your level}}|hp}} bonus health.',
      ),
    );
    expect(refs.find((r) => r.stat === 'level')!.owner).toBe('holder');
  });

  it('`type=level` with no possessive stays unstated, and nobody is asked to read it', () => {
    const refs = findOwnerRefs(
      item('Terminus', 'pass2', "''Light'' hits grant {{pp|6 to 8 for 3|1;11;14|type=level}} armor."),
    );
    const level = refs.find((r) => r.stat === 'level')!;
    expect(level.owner).toBe('unstated');
    expect(level.needsReading).toBeUndefined();
  });

  // THE GATE. A possessive nobody has read is reported, never attributed (CLAUDE.md).
  it('an UNREAD possessive is reported and left unstated, not resolved by its words', () => {
    const refs = findOwnerRefs(
      item(
        'Invented Item',
        'pass',
        "Deal {{pp|0 to 20|key=%|type=target's '''maximum''' health}} damage.",
      ),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.owner).toBe('unstated');
    expect(refs[0]!.needsReading).toBe(true);
    expect(typeArgumentReading('Invented Item', 'pass', "target's maximum health")).toBeNull();
  });

  it('reads `type=` and nothing else — `formula=` restates the same fact and would double-count', () => {
    const refs = findOwnerRefs(
      item(
        "Lord Dominik's Regards",
        'pass',
        "Deal {{pp|0 to 15 for 16|key=%|type=target's '''bonus''' health|formula=1% per 100 bonus " +
          'health, up to a maximum of 15% at 1500 bonus health.|color=health}} increased damage ' +
          'against enemy champions.',
      ),
    );
    expect(refs.filter((r) => r.stat === 'bonusHP')).toHaveLength(1);
  });

  it('every reading quotes the sentence words its verdict rests on', () => {
    for (const reading of TYPE_ARGUMENT_READINGS) {
      expect(reading.because.length).toBeGreaterThan(40);
      expect(['holder', 'opponent', 'ally', 'unstated']).toContain(reading.owner);
    }
    // Three items say "target's level" and all three mean an ally. That is the finding.
    const levels = TYPE_ARGUMENT_READINGS.filter((r) => r.states === "target's level");
    expect(levels).toHaveLength(3);
    expect(levels.every((r) => r.owner === 'ally')).toBe(true);
  });
});

// --- level, the eleventh owner-required stat ------------------------------------------------------

describe('confirmed-readings/level is counted where the source states it as an axis', () => {
  it('prose "based on level" is a bare mention, not an owner-bearing reference', () => {
    const row = classifyEffect({
      source: 'rune',
      ownerName: 'Sudden Impact',
      id: 8237,
      key: 'rune',
      effectName: null,
      text: 'Damaging basic attacks and abilities deal a bonus 20 - 80 True Damage based on level.',
    });
    expect(row.ownerRefs.filter((r) => r.stat === 'level')).toHaveLength(0);
    expect(row.bareLevelMentions).toBe(1);
  });

  it('a `type=` argument naming level IS a reference', () => {
    const row = classifyEffect(
      item('Terminus', 'pass2', 'grant {{pp|6 to 8 for 3|1;11;14|type=level}} bonus armor.'),
    );
    expect(row.ownerRefs.filter((r) => r.stat === 'level')).toHaveLength(1);
  });
});
