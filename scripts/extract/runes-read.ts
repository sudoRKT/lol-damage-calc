// THE RUNE READING — one person, one rune at a time, both sources quoted verbatim.
//
// This file is the HUMAN half of a two-producer check, and it is deliberately dumb: it holds
// numbers a person read off Data Dragon's own printed sentence, and nothing here parses anything.
// `rune-propose.ts` derives the same numbers a second time by running this project's own
// progression parser over the WIKI's formula, and stores a value only where the two agree on the
// damage type, on both endpoints, and on every ratio. That is DATA-SOURCES §39's definition of
// "extracted", applied to runes.
//
// ═══ WHY RUNES NEED THIS MORE THAN ABILITIES DO ═══
//
// Rune text is written from the HOLDER's point of view and names no champion: "3.5% of your max
// health". `RatioOwner` has an arm for exactly that — `'holder'`, resolved at evaluation time from
// whose build the rune was found on (data.ts). It is NOT a synonym for `'caster'`: SPECIFICATION
// §5 models the defender in full, so the same rune on the defender reads the defender's health.
// Where the source says "your", `holder` is what the source states. Where it says nothing at all,
// the answer is `'unresolved'` and it is never guessed.
//
// ═══ THE LEVEL AXIS IS DELIBERATELY NOT READ FROM THE WIKI ═══
//
// Four of these runes write their level axis as `1 to 20 by 1`. Champions cap at 18, and
// DATA-SOURCES §13 records this exact trap costing a confident wrong number once already — the
// wiki rendered Press the Attack at 174.12, which is its LEVEL-20 extrapolation, where the
// formula's level-18 value is 160 and matches Data Dragon. So the value expression is evaluated
// over levels 1..18 and the printed Data Dragon range is what confirms it. Both endpoints must
// agree or the rune is refused.
//
// ═══ WHAT IS DELIBERATELY NOT STORED ═══
//
// Every rune below states facts this contract has nowhere to put — a heal, a resistance grant, a
// trigger condition, a limit on how many attacks are empowered. `notStored` names each one in the
// source's own words. A row that cannot be read in full is not stored in part (DATA-SOURCES §25),
// and an effect nobody can see the absence of is worse than one plainly marked missing.

import type { DamageType, RatioOwner, RatioStat } from '../../src/types/data.ts';

/** One ratio as a person read it off the source, before any parser has been near it. */
export interface ReadRatio {
  stat: RatioStat;
  /** Required on the stats both champions possess. `'holder'` where the source says "your". */
  owner?: RatioOwner;
  /** Percentage points, e.g. 12 for "+12% bonus AD". A single number: none of these scale. */
  percent: number;
  /** Two numbers where the source states a melee and a ranged figure. */
  byRangeType?: { melee: number; ranged: number };
  /** The words the value was read from. */
  quoted: string;
}

export interface RuneReading {
  runeId: number;
  runeName: string;
  tree: 'Domination' | 'Inspiration' | 'Precision' | 'Resolve' | 'Sorcery';

  /** What Data Dragon's own sentence says, verbatim, trimmed to the clause that carries it. */
  ddragonSays: string;
  /** The wiki's own markup for the same figure, verbatim. */
  wikiSays: string;
  /** The wiki revision the markup was read from, so the reading is pinned to a revision. */
  wikiRevid: number;

  /**
   * NULL when the rune deals no damage at all. Bone Plating is the only one here, and it is not
   * an oversight: it reduces incoming damage, which is a different fact with no field to hold it.
   */
  damage: {
    damageType: DamageType;
    /** The value expression from the wiki's `{{pp}}`, level axis deliberately omitted (see above). */
    wikiExpression: string;
    /** What Data Dragon prints, read by a person. The parser's output must land on both. */
    ddragonEndpoints: { atLevel1: number; atLevel18: number } | null;
    /** A value with no level progression at all — Grasp is a flat percentage of a health pool. */
    noLevelProgression?: true;
    ratios: ReadRatio[];
    label: string;
  } | null;

  /** Facts the source states plainly that `CuratedRune` has no field for. Named, never dropped. */
  notStored: string[];

  /**
   * Set where the two sources DISAGREE about a fact and nothing settles it. The entry is forced
   * to `incomplete` and BOTH readings are recorded (DATA-SOURCES §32.2). Neither is adopted.
   */
  contested?: { about: string; ddragonReading: string; wikiReading: string };
}

/**
 * The seven runes read on 2026-08-15, at patch 16.16.1.
 *
 * WHY THESE SEVEN. `public/data/rune-census.json` classifies all 62 and records a blocker list per
 * rune. Six damaging runes carry an EMPTY blocker list — every other damaging rune is held up by
 * an adaptive damage type the contract has no arm for, a stack or position count no source states,
 * elapsed time this engine does not model, or a source disagreement. Bone Plating is the seventh
 * and is the only damage-REDUCTION rune with an empty blocker list. The census proposed them; this
 * file is a person reading each one.
 */
export const RUNE_READINGS: readonly RuneReading[] = [
  {
    runeId: 9923,
    runeName: 'Hail of Blades',
    tree: 'Domination',
    ddragonSays:
      'Gain 90% (60% for ranged champions) Attack Speed and bonus true damage when you attack an ' +
      'enemy champion for up to 3 attacks. ... On-Hit Damage: 2 - 20 (+0.12 bonus AD, +0.1 AP) damage.',
    wikiSays:
      "basic attacks deal {{pp|2 + (20-2)/17*(x-1) for 20|color=true damage}} {{as|(+ 12% '''bonus''' AD)}} " +
      "{{as|(+ 10% AP)}} {{as|{{sti|'''bonus''' true damage}}}}",
    wikiRevid: 4051352,
    damage: {
      damageType: 'true',
      wikiExpression: '2 + (20-2)/17*(x-1) for 20',
      ddragonEndpoints: { atLevel1: 2, atLevel18: 20 },
      ratios: [
        { stat: 'bonusAD', percent: 12, quoted: "(+ 12% '''bonus''' AD) / (+0.12 bonus AD)" },
        { stat: 'AP', percent: 10, quoted: '(+ 10% AP) / (+0.1 AP)' },
      ],
      label: 'On-Hit True Damage',
    },
    notStored: [
      'the 90% (60% ranged) bonus attack speed — the engine models sequence, not elapsed time ' +
        '(SPECIFICATION §3.2), so attack speed changes no damage figure it can produce',
      'the 3-second window between attacks, and the 10-second cooldown — both are time',
    ],
    contested: {
      about: 'how many basic attacks carry the bonus damage',
      ddragonReading:
        '"for up to 3 attacks ... Attack resets increase the attack limit by 1" — three, plus one ' +
        'per reset with no stated ceiling.',
      wikiReading:
        '"you gain 2 stacks of the effect ... you generate an additional stack ... up to 2 times", ' +
        'with a rider that "The triggering attack benefits from Hail of Blades" — which reads as ' +
        'two stacks plus the triggering attack, and a ceiling of two extra stacks rather than none.',
    },
  },
  {
    runeId: 8126,
    runeName: 'Cheap Shot',
    tree: 'Domination',
    ddragonSays:
      'Damaging champions with impaired movement or actions deals 10 - 45 bonus true damage (based on level).',
    wikiSays:
      "Non-{{tip|proc damage|proc}} damage sources deal {{as|{{pp|10 + (45-10)/17*(x-1)|1 to 20 by 1}}|true damage}} " +
      "{{as|'''bonus''' true damage}} to enemy champions affected by certain crowd control effects.",
    wikiRevid: 3992989,
    damage: {
      damageType: 'true',
      wikiExpression: '10 + (45-10)/17*(x-1)',
      ddragonEndpoints: { atLevel1: 10, atLevel18: 45 },
      ratios: [],
      label: 'Bonus True Damage',
    },
    notStored: [
      'the trigger — the target must already be impaired by one of nine named crowd-control ' +
        'effects. CuratedRune has no condition field, so nothing records when this applies',
      'the 4-second cooldown — time',
    ],
  },
  {
    runeId: 8143,
    runeName: 'Sudden Impact',
    tree: 'Domination',
    ddragonSays:
      'Damaging basic attacks and abilities deal a bonus 20 - 80 True Damage based on level to ' +
      'enemy champions after using a dash, leap, blink, teleport, or when leaving stealth for 4s.',
    wikiSays:
      "Dealing damage to an enemy champion within 4 seconds of using a dash or blink, or exiting " +
      "from stealth, deals {{as|{{pp|20 to 80}} '''bonus''' true damage}} to them.",
    wikiRevid: 3825916,
    damage: {
      damageType: 'true',
      wikiExpression: '20 to 80',
      ddragonEndpoints: { atLevel1: 20, atLevel18: 80 },
      ratios: [],
      label: 'Bonus True Damage',
    },
    notStored: [
      'the trigger — within 4 seconds of a dash, leap, blink, teleport or leaving stealth. No ' +
        'condition field exists on CuratedRune',
      'the 10-second cooldown — time',
    ],
  },
  {
    runeId: 8437,
    runeName: 'Grasp of the Undying',
    tree: 'Resolve',
    ddragonSays:
      'Every 4s in combat, your next basic attack on a champion will: Deal bonus magic damage ' +
      'equal to 3.5% of your max health ... Ranged Champions: Damage, healing, and permanent ' +
      'health gained are 40% effective.',
    wikiSays:
      "consumes all stacks to deal {{as|'''bonus''' magic damage}} equal to " +
      "{{as|{{rd|{{fd|3.5}}%|{{fd|1.4}}%}} of your '''maximum''' health}}",
    wikiRevid: 3963536,
    damage: {
      damageType: 'magic',
      // No `{{pp}}` at all: the figure is a flat percentage of a health pool and does not scale
      // with level. The two sources are cross-checked on the percentages instead of on endpoints.
      wikiExpression: '',
      ddragonEndpoints: null,
      noLevelProgression: true,
      ratios: [
        {
          stat: 'maxHP',
          // "your maximum health" — the source states whose. `holder`, not `caster`: this rune
          // reads the DEFENDER's health when the defender is the one running it (data.ts).
          owner: 'holder',
          percent: 3.5,
          byRangeType: { melee: 3.5, ranged: 1.4 },
          quoted:
            "{{rd|3.5%|1.4%}} of your '''maximum''' health (wiki) / \"3.5% of your max health\" with " +
            '"Ranged Champions: Damage ... 40% effective" (Data Dragon). 3.5 x 0.4 = 1.4, so the ' +
            'two sources state the same pair of numbers by two different routes.',
        },
      ],
      label: 'Bonus Magic Damage',
    },
    notStored: [
      'the heal — 1.3% of your maximum health (0.52% ranged). CuratedRune has no healing field',
      'the permanent bonus health — 5 (2 ranged) per proc, and it accumulates. `grants` holds a ' +
        'flat number and cannot express either the range split or the accumulation',
      'the 4-stack build-up and the 5-second window to spend it — time',
    ],
  },
  {
    runeId: 8439,
    runeName: 'Aftershock',
    tree: 'Resolve',
    ddragonSays:
      'After immobilizing an enemy champion, increase your Armor and Magic Resist by 45 + 75% of ' +
      'your Bonus Resists for 2.5s. Then explode, dealing magic damage to nearby enemies. ' +
      'Damage: 25 - 120 (+8% of your bonus health)',
    wikiSays:
      "you release a shockwave that deals {{as|{{pp|25 to 120}}|magic damage}} " +
      "{{as|(+ 8% of your '''bonus''' health)}} to enemy champions and monsters within 350 radius.",
    wikiRevid: 4022990,
    damage: {
      damageType: 'magic',
      wikiExpression: '25 to 120',
      ddragonEndpoints: { atLevel1: 25, atLevel18: 120 },
      ratios: [
        {
          stat: 'bonusHP',
          owner: 'holder',
          percent: 8,
          quoted: "(+ 8% of your '''bonus''' health) / (+8% of your bonus health)",
        },
      ],
      // NOT "to champions and monsters": gate 4 refuses a label naming a non-champion target, and
      // it is right to. The shockwave does hit champions, which is what puts it in scope at all.
      label: 'Shockwave Magic Damage',
    },
    notStored: [
      'the resistance grant — 45 bonus armor and 45 bonus magic resistance, EACH plus 75% of the ' +
        "holder's bonus resistance of that type, capped at 80-150 by level. `grants` holds flat " +
        'numbers only, so storing the 45s would drop both the 75% term and the cap, and a partly ' +
        'stored defence overstates or understates every mitigation it touches',
      'the trigger — immobilizing an enemy champion. No condition field on CuratedRune',
      'the 2.5-second delay before the shockwave, and the 20-second cooldown — time',
    ],
  },
  {
    runeId: 8237,
    runeName: 'Scorch',
    tree: 'Sorcery',
    ddragonSays:
      'Your next damaging ability hit sets champions on fire dealing 20 - 40 bonus magic damage ' +
      'based on level after 1s.',
    wikiSays:
      "Dealing ability damage to an enemy champion sets them on fire, dealing them " +
      "{{as|{{pp|20 + (40-20)/17*(x-1)|1 to 20 by 1}}|magic damage}} {{as|'''bonus''' magic damage}} after 1 second.",
    wikiRevid: 3985169,
    damage: {
      damageType: 'magic',
      wikiExpression: '20 + (40-20)/17*(x-1)',
      ddragonEndpoints: { atLevel1: 20, atLevel18: 40 },
      ratios: [],
      label: 'Bonus Magic Damage',
    },
    notStored: [
      'the trigger — the damage must come from an ability, not a basic attack. No condition field',
      'the 1-second delay before it lands, and the 10-second cooldown — time. The delay does NOT ' +
        'make this damage over time: it is one instance, landed late, and the engine has no clock',
    ],
  },
  {
    runeId: 8473,
    runeName: 'Bone Plating',
    tree: 'Resolve',
    ddragonSays:
      'After taking damage from an enemy champion, the next 3 spells or attacks you receive from ' +
      'them deal 30-60 (based on level) less damage.',
    wikiSays:
      "the next 3 spells or attacks you receive from the enemy champion that triggered this effect " +
      "deal {{pp|30 + (60-30)/17*(x-1)|1 to 20 by 1}} less damage (including {{tip|true damage}}).",
    wikiRevid: 3985159,
    // NOT a damage instance. It is a flat reduction taken off damage the holder RECEIVES, which
    // is the first step of SPECIFICATION's fixed four-step resistance order — and `CuratedRune`
    // has no field for it. See `CONTRACT_GAPS` below.
    damage: null,
    notStored: [
      'the whole effect. Both sources state it completely — 30 to 60 by level, flat, off each of ' +
        'the next 3 instances, and the wiki adds that it applies to true damage as well — and ' +
        'CuratedRune can hold damage DEALT, flat stat grants and stack yields, none of which this is',
      'the 1.5-second duration and the 55-second cooldown — time',
    ],
  },
];

/**
 * WHAT THE CONTRACT WOULD NEED, stated precisely enough for the lead to decide from.
 *
 * RAISED, NOT BUILT. `src/types/` is frozen to this area, and inventing a field here would put
 * two areas' opinions about one shape into the file — the exact seam DATA-SOURCES §44 exists to
 * catch. Each entry names the rune it blocks and the shape that already exists for the same fact
 * elsewhere, so the decision is a re-use question rather than a design question.
 */
export const CONTRACT_GAPS: ReadonlyArray<{
  blocks: string;
  fact: string;
  whatExistsAlready: string;
  ifNotAdded: string;
}> = [
  {
    blocks: 'Bone Plating (8473)',
    fact:
      'a FLAT reduction of 30 to 60 by level, taken off each of the next 3 damage instances the ' +
      'holder receives, applying to true damage as well as physical and magic.',
    whatExistsAlready:
      "`CuratedDefensiveEffect` already expresses this exactly — kind 'damage-reduction', unit " +
      "'flat', value as a Scaling, activation 'conditional' with a condition string, and " +
      '`appliesToDamageType` left absent to mean all types. What it cannot do is name a rune: it ' +
      'is keyed by champion + slot + abilityName, which a rune has none of.',
    ifNotAdded:
      'Bone Plating cannot be stored at all. It is emitted as `incomplete` with this reason so the ' +
      'interface can say what is missing rather than showing the rune as unmodelled for no ' +
      'stated cause (SPECIFICATION §8).',
  },
  {
    blocks: 'Grasp of the Undying (8437), Aftershock (8439)',
    fact:
      'a heal on the holder (Grasp, 1.3%/0.52% of maximum health), a permanent accumulating ' +
      'health grant (Grasp, 5/2 per proc), and a resistance grant with a percentage term and a ' +
      'level-scaled cap (Aftershock, 45 + 75% of bonus resists, capped 80-150).',
    whatExistsAlready:
      '`CuratedRune.grants` is `Record<string, number>` — flat numbers only. It cannot hold a ' +
      'range split, a percentage of another stat, a cap, or an accumulation.',
    ifNotAdded:
      'the damage half of both runes is stored and correct; the defensive and healing halves are ' +
      'named in `notes` and stored nowhere. Neither rune claims to be complete.',
  },
  {
    blocks: 'Cheap Shot (8126), Sudden Impact (8143), Scorch (8237), Aftershock (8439)',
    fact:
      'the TRIGGER. Every one of these fires only in a stated situation — the target is impaired, ' +
      'the holder dashed within 4 seconds, the damage came from an ability, an enemy was immobilized.',
    whatExistsAlready:
      "`CuratedDefensiveEffect` carries `activation` and `condition` for precisely this, and " +
      '`CuratedItemEffect` carries `appliesAs`. `CuratedRune` carries neither, so a rune that ' +
      'applies only sometimes is indistinguishable from one that always applies.',
    ifNotAdded:
      'the conditions are recorded in `notes` in the source\'s own words. A combo builder cannot ' +
      'read a note, so nothing can gate these on the situation until a field exists.',
  },
];
