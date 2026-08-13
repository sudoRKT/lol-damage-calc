// THE READ POPULATION — one person's reading of all 63 sentences, recorded.
//
// WHY THIS FILE EXISTS. CLAUDE.md's standing rule: **a detector proposes, a person confirms,
// and storage is gated on the confirmed population.** `effect-values.ts` is the detector: it
// reads numbers out of wikitext and refuses what it cannot read. It cannot tell that Tiamat's
// Cleave never touches the champion you attacked, that Bramble Vest damages the person who hit
// YOU, or that Doran's Helm only ever hits minions. Those are readings of a sentence.
//
// So every one of the 63 effects the census calls "structural" (DATA-SOURCES §37.2) was read
// once, on 2026-08-13, against the live wikitext, and the reading is recorded here with the
// words it rests on. An effect is STORED only when this reading says it can be AND the parser
// independently produces the same numbers. Either one alone stores nothing.
//
// WHAT A READING HERE IS NOT. It is not a verification. Nothing here is independently
// re-derived from a formula or a worked example, so no entry may claim better than `derived`
// (CLAUDE.md). Its job is to stop a regular expression deciding a question of meaning.
//
// An effect that trips the parser but is absent from this file is REPORTED FOR READING, never
// stored — `not-in-read-population`.

import type { CuratedItemEffect, DamageType } from '../../src/types/data.ts';
import type { RangePair, ReadRatio, RefusalReason } from './effect-values.ts';

/** `CuratedItemEffect.appliesAs`, so a reading can only record an arm the contract has. */
export type AppliesAs = NonNullable<CuratedItemEffect['appliesAs']>;

export interface Reading {
  /** Data Dragon item id, or rune id. */
  id: number;
  /** Effect key in Module:ItemData/data, or 'rune'. */
  key: string;
  /** Item or rune name exactly as the census records it — the join key with the census. */
  ownerName: string;
  /** The sentence the reading rests on, quoted from the source as displayed. */
  sentence: string;
  /** 'store' = this effect's damage can be expressed in the frozen contract, in full. */
  verdict: 'store' | 'refuse';
  /** Why not, when the verdict is 'refuse'. Every reason is also a class swept over all 291. */
  reasons?: RefusalReason[];
  /** Present when the verdict is 'store'. The parser must agree with all of it. */
  expect?: {
    damageType: DamageType;
    /** Flat portion. `null` when the run states none (Sheen is a base-AD ratio only). */
    base: number | null;
    /** Set instead of `base` when the flat portion scales by champion level. */
    baseByLevel?: { from: number; to: number };
    /** Set instead of `base` when the source states a melee figure and a ranged figure. */
    baseByRangeType?: RangePair;
    ratios: ReadRatio[];
    /**
     * Present when the reading says this effect's damage RECURS.
     *
     * The dual-path bar covers this field too: the parser must independently find a recurrence
     * in the same sentence, and must reach the same `totalInstances` — or the effect refuses.
     * `totalInstances` is recorded only where the source writes the count down. For the four
     * burns that state a per-second figure and no count, it is deliberately absent.
     */
    overTime?: { totalInstances?: number };
  };
  /** How the effect reaches a target, in the source's own words. */
  appliesAs?: string;
  /**
   * The same fact in the contract's vocabulary, for `CuratedItemEffect.appliesAs`.
   *
   * DELIBERATELY ABSENT ON FIVE STORED EFFECTS, and that absence is a finding rather than an
   * omission: the enum has no arm for "on dealing damage to an enemy champion" (Hextech
   * Alternator, Scout's Slingshot, Elixir of Sorcery, Zaz'Zak's Realmspike) or for a delayed
   * strike that follows a mark (Stormsurge). Setting `'unstated'` there would say the source is
   * silent, and the source is not silent — it states a trigger the enum cannot name. Raised in
   * `CONTRACT_GAPS`.
   */
  appliesAsCode?: AppliesAs;
  /** Anything a reader of the output should know that the numbers do not say. */
  note?: string;
}

export const READ_POPULATION: Reading[] = [
  // -------------------------------------------------------------------------
  // STORE — the source states one damage type, one set of values, against a champion
  // -------------------------------------------------------------------------
  {
    id: 3504,
    key: 'pass',
    ownerName: 'Ardent Censer',
    sentence:
      'Heal or shielding allied champions (excluding yourself) enhances you and them for 6 seconds, granting 25% bonus attack speed and 20 bonus magic damage on-hit on basic attacks.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 20, ratios: [] },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
    note: 'The attack-speed half of the same sentence is a separate {{as}} run and is not damage.',
  },
  {
    id: 3877,
    key: 'pass',
    ownerName: 'Bloodsong',
    sentence:
      'After using an ability, your next basic attack within 10 seconds deals 100% base AD bonus physical damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'baseAD', value: 100 }] },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
    note:
      'The {{rd|8%|5%}} melee/ranged split in this effect is on Expose Weakness, a damage ' +
      'AMPLIFIER in a later sentence — not on this damage run. Blocking the whole effect on the ' +
      'presence of {{rd}} anywhere in its text would have refused a readable value.',
  },
  {
    id: 2510,
    key: 'pass',
    ownerName: 'Dusk and Dawn',
    sentence:
      'your next basic attack within 10 seconds deals 75% base AD (+ 10% AP) bonus magic damage and heals you for 10% AP (+ 3% bonus health) on-hit',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: null,
      ratios: [
        { stat: 'baseAD', value: 75 },
        { stat: 'AP', value: 10 },
      ],
    },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
    note:
      "The heal in the same sentence carries its own (+ 3% bonus health); it is a separate run " +
      'and must not join the damage. This is the shape that cost four damage instances in the ' +
      "census's own first run (DATA-SOURCES §37.4 defect 2).",
  },
  {
    id: 2139,
    key: 'consume',
    ownerName: 'Elixir of Sorcery',
    sentence:
      'While active, dealing damage to enemy champions or turrets deals 25 bonus true damage (5 second cooldown on each champion, no cooldown against turrets).',
    verdict: 'store',
    expect: { damageType: 'true', base: 25, ratios: [] },
    // NO CONTRACT ARM. The source states the trigger plainly; `appliesAs` has no member for
    // it, so the field is left ABSENT rather than set to 'unstated', which would claim the
    // source is silent. Raised in CONTRACT_GAPS.
    appliesAs: 'on damaging an enemy champion, 5 second cooldown per champion',
  },
  {
    id: 3124,
    key: 'pass',
    ownerName: "Guinsoo's Rageblade",
    sentence: 'Basic attacks deal 30 bonus magic damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 30, ratios: [] },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
  },
  {
    id: 3084,
    key: 'pass',
    ownerName: 'Heartsteel',
    sentence:
      'Your next basic attack against a target with 3 stacks is empowered to consume them all to deal 70 (+ 6% maximum health) bonus physical damage on-hit',
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: 70,
      ratios: [{ stat: 'maxHP', value: 6, owner: 'unresolved' }],
    },
    appliesAs: 'on-hit, at 3 stacks, 30 second cooldown per target',
    appliesAsCode: 'on-hit',
    note:
      'WHOSE maximum health is never stated. Heartsteel is one of DATA-SOURCES §37.3\'s 56 ' +
      'permanently unresolvable effects, so this entry can only ever be `incomplete`. It is ' +
      'stored with owner `unresolved` rather than withheld, because the rest of the figure is ' +
      'stated and the missing fact is recorded rather than guessed.',
  },
  {
    id: 3145,
    key: 'pass',
    ownerName: 'Hextech Alternator',
    sentence: 'Damaging an enemy champion deals 65 bonus magic damage.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 65, ratios: [] },
    // NO CONTRACT ARM. The source states the trigger plainly; `appliesAs` has no member for
    // it, so the field is left ABSENT rather than set to 'unstated', which would claim the
    // source is silent. Raised in CONTRACT_GAPS.
    appliesAs: 'on damaging an enemy champion',
  },
  {
    id: 3146,
    key: 'act',
    ownerName: 'Hextech Gunblade',
    sentence:
      'Shocks the target enemy champion with a bolt of lightning, dealing 175 to 253 (+ 30% AP) magic damage and slowing them by 25% for 1.5 seconds.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: null,
      baseByLevel: { from: 175, to: 253 },
      ratios: [{ stat: 'AP', value: 30 }],
    },
    appliesAs: 'item active, single target',
    appliesAsCode: 'active',
    note:
      'The flat part is {{pp|175 to 253|tooltipSize=20}}. Module:Ability progression was read ' +
      "live: pp's defaultSize is 18 and the linear fill puts 175 at level 1 and 253 at level 18. " +
      '`tooltipSize=20` only appends two EXTRAPOLATED cells past level 18 (they compute to 257.6 ' +
      'and 262.2). Reading the last cell as the maximum is the DATA-SOURCES §13 trap and would ' +
      'overstate this active by 9 damage.',
  },
  {
    id: 3152,
    key: 'act',
    ownerName: 'Hextech Rocketbelt',
    sentence:
      "Enemies within 85 units of your dash and ones hit by any rocket's explosion are dealt 100 (+ 10% AP) magic damage, once per cast.",
    verdict: 'store',
    expect: { damageType: 'magic', base: 100, ratios: [{ stat: 'AP', value: 10 }] },
    appliesAs: 'item active, once per cast',
    appliesAsCode: 'active',
  },
  {
    id: 6662,
    key: 'pass',
    ownerName: 'Iceborn Gauntlet',
    sentence:
      'After using an ability, your next basic attack within 10 seconds deals 150% base AD bonus physical damage on-hit and creates a 300 radius frost field for 2 seconds.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'baseAD', value: 150 }] },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
    note: 'The {{rd|25%|12.5%}} melee/ranged split here is on the SLOW, not on the damage.',
  },
  {
    id: 3100,
    key: 'pass',
    ownerName: 'Lich Bane',
    sentence:
      'your next basic attack within 10 seconds gains 50% bonus attack speed and deals 75% base AD (+ 45% AP) bonus magic damage on-hit',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: null,
      ratios: [
        { stat: 'baseAD', value: 75 },
        { stat: 'AP', value: 45 },
      ],
    },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
  },
  {
    id: 3115,
    key: 'pass',
    ownerName: "Nashor's Tooth",
    sentence: 'Basic attacks deal 15 (+ 15% AP) bonus magic damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 15, ratios: [{ stat: 'AP', value: 15 }] },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
  },
  {
    id: 6698,
    key: 'act',
    ownerName: 'Profane Hydra',
    sentence: 'Deal 80% AD physical damage to enemies in a 450 radius in front of you.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'totalAD', value: 80 }] },
    appliesAs: 'item active, area in front of the holder',
    appliesAsCode: 'active',
  },
  {
    id: 3094,
    key: 'pass2',
    ownerName: 'Rapid Firecannon',
    sentence: 'When fully Energized, your next basic attack deals 40 bonus magic damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 40, ratios: [] },
    appliesAs: 'on-hit, when fully Energized',
    appliesAsCode: 'on-hit',
  },
  {
    id: 3074,
    key: 'act',
    ownerName: 'Ravenous Hydra',
    sentence: 'Deal 80% AD physical damage to enemies within a 450 radius in front of you.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'totalAD', value: 80 }] },
    appliesAs: 'item active, area in front of the holder',
    appliesAsCode: 'active',
  },
  {
    id: 1043,
    key: 'pass',
    ownerName: 'Recurve Bow',
    sentence: 'Basic attacks deal 15 bonus physical damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'physical', base: 15, ratios: [] },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
  },
  {
    id: 3107,
    key: 'act',
    ownerName: 'Redemption',
    sentence:
      "enemy champions within take 10% of target's maximum health as true damage",
    verdict: 'store',
    expect: {
      damageType: 'true',
      base: null,
      ratios: [{ stat: 'maxHP', value: 10, owner: 'target' }],
    },
    appliesAs: 'item active, delayed 2.5 seconds, area',
    appliesAsCode: 'active',
    note:
      "One of eleven owner-bearing references in the whole population that names the OTHER " +
      'champion outright ("target\'s"). The same sentence heals allies; the heal is a separate ' +
      'run and is not damage.',
  },
  {
    id: 3144,
    key: 'pass',
    ownerName: "Scout's Slingshot",
    sentence:
      'Damaging an enemy champion deals 40 bonus magic damage (40 second cooldown, reduced by 1 second on-attack).',
    verdict: 'store',
    expect: { damageType: 'magic', base: 40, ratios: [] },
    // NO CONTRACT ARM. The source states the trigger plainly; `appliesAs` has no member for
    // it, so the field is left ABSENT rather than set to 'unstated', which would claim the
    // source is silent. Raised in CONTRACT_GAPS.
    appliesAs: 'on damaging an enemy champion, 40 second cooldown',
  },
  {
    id: 3057,
    key: 'pass',
    ownerName: 'Sheen',
    sentence:
      'After using an ability, your next basic attack within 10 seconds deals 100% base AD bonus physical damage on-hit',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'baseAD', value: 100 }] },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
  },
  {
    id: 3087,
    key: 'pass3',
    ownerName: 'Statikk Shiv',
    sentence:
      'When fully Energized, your next basic attack on-hit is empowered to form chain lightning, dealing 60 bonus magic damage, increased to 90 against non-champions.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 60, ratios: [] },
    appliesAs: 'on-hit, when fully Energized',
    appliesAsCode: 'on-hit',
    note:
      'The second damage run in this text (90) is the NON-CHAMPION figure. Taking the larger of ' +
      'two runs, or summing them, would overstate a champion result by half.',
  },
  {
    id: 3097,
    key: 'pass2',
    ownerName: 'Stormrazor',
    sentence:
      'When fully Energized, your next basic attack deals 100 bonus magic damage on-hit and grants you 45% bonus movement speed for 1.5 seconds.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 100, ratios: [] },
    appliesAs: 'on-hit, when fully Energized',
    appliesAsCode: 'on-hit',
  },
  {
    id: 4646,
    key: 'pass2',
    ownerName: 'Stormsurge',
    sentence:
      'After 2 seconds of having applied Squall, strike the target with lightning, dealing 125 (+ 10% AP) magic damage to them.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 125, ratios: [{ stat: 'AP', value: 10 }] },
    // NO CONTRACT ARM. The source states the trigger plainly; `appliesAs` has no member for
    // it, so the field is left ABSENT rather than set to 'unstated', which would claim the
    // source is silent. Raised in CONTRACT_GAPS.
    appliesAs: 'a single delayed strike, 2 seconds after Squall is applied',
    note:
      'The 2-second delay is a delay before ONE instance, not an interval at which damage ' +
      'recurs, so it is not damage over time.',
  },
  {
    id: 6631,
    key: 'act',
    ownerName: 'Stridebreaker',
    sentence:
      'Deal 80% AD physical damage to enemies within a 450 radius in front of you and slow them by 35% for 3 seconds.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'totalAD', value: 80 }] },
    appliesAs: 'item active, area in front of the holder',
    appliesAsCode: 'active',
  },
  {
    id: 3302,
    key: 'pass',
    ownerName: 'Terminus',
    sentence: 'Basic attacks deal 30 (+10% bonus AD) (+ 10% AP) bonus magic damage on-hit.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 30,
      ratios: [
        { stat: 'bonusAD', value: 10 },
        { stat: 'AP', value: 10 },
      ],
    },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
  },
  {
    id: 3077,
    key: 'act',
    ownerName: 'Tiamat',
    sentence: 'Deal 75% AD physical damage to enemies within a 450 radius in front of you.',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'totalAD', value: 75 }] },
    appliesAs: 'item active, area in front of the holder',
    appliesAsCode: 'active',
  },
  {
    id: 3078,
    key: 'pass',
    ownerName: 'Trinity Force',
    sentence:
      'After using an ability, your next basic attack within 10 seconds deals 200% base AD bonus physical damage on-hit',
    verdict: 'store',
    expect: { damageType: 'physical', base: null, ratios: [{ stat: 'baseAD', value: 200 }] },
    appliesAs: 'on-hit, after an ability (Spellblade)',
    appliesAsCode: 'spellblade',
  },
  {
    id: 3091,
    key: 'pass',
    ownerName: "Wit's End",
    sentence: 'Basic attacks deal 45 bonus magic damage on-hit.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 45, ratios: [] },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
  },
  {
    id: 3871,
    key: 'pass',
    ownerName: "Zaz'Zak's Realmspike",
    sentence:
      "Dealing ability damage to an enemy champion creates an explosion at their location after a 0.5-second delay, dealing 10 (+ 15% AP) (+ 3% of each target's maximum health) magic damage to enemies within the area, capped at 300 against monsters.",
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 10,
      ratios: [
        { stat: 'AP', value: 15 },
        { stat: 'maxHP', value: 3, owner: 'target' },
      ],
    },
    // NO CONTRACT ARM. The source states the trigger plainly; `appliesAs` has no member for
    // it, so the field is left ABSENT rather than set to 'unstated', which would claim the
    // source is silent. Raised in CONTRACT_GAPS.
    appliesAs: 'on dealing ability damage to an enemy champion, delayed 0.5 seconds',
    note: 'The health pool is attributed outright — "each target\'s maximum health".',
  },

  // -------------------------------------------------------------------------
  // STORE — the source states a MELEE value and a RANGED value
  //
  // Re-read on 2026-08-13 after `Scaling` gained its `byRangeType` arm. Each sentence was read
  // again from the source as displayed, not merely un-refused: the pair is recorded arm by arm,
  // and the parser has to reach the same two numbers from the wikitext before anything is
  // stored. Neither arm is a default for the other, and none of these four is stored at one
  // value.
  // -------------------------------------------------------------------------
  {
    id: 3181,
    key: 'pass',
    ownerName: 'Hullbreaker',
    sentence:
      'your next basic attack on-hit against a champion, epic monster, or structure consumes all stacks to deal 120% / 84% base AD (+ 5% / 3.5% maximum health) bonus physical damage',
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [
        { stat: 'baseAD', byRangeType: { melee: 120, ranged: 84 } },
        { stat: 'maxHP', owner: 'unresolved', byRangeType: { melee: 5, ranged: 3.5 } },
      ],
    },
    appliesAs: 'on-hit, at 4 or more Skipper stacks',
    appliesAsCode: 'on-hit',
    note:
      'WHOSE maximum health is never stated — one of §37.3\'s permanently unresolvable effects, ' +
      'so this entry is `incomplete` however well the rest of it reads. The ranged arm is ' +
      'written as {{ap|120*0.7}}, the wiki module doing its own arithmetic; 84 and 3.5 are the ' +
      'numbers it displays. The second sentence ("increased to … against structures") is a ' +
      'separate damage run and is not merged in.',
  },
  {
    id: 3748,
    key: 'pass',
    ownerName: 'Titanic Hydra',
    sentence:
      'Basic attacks on-hit deal 1% / 0.5% maximum health bonus physical damage to the target and 3% / 1.5% maximum health physical damage to other enemies in a cone',
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'maxHP', owner: 'unresolved', byRangeType: { melee: 1, ranged: 0.5 } }],
    },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
    note:
      'Unlike the other four Cleave items, Titanic Hydra DOES damage the champion you attacked, ' +
      'and that is the run stored here. THE CONE FIGURE (3% / 1.5%) IS A SEPARATE RUN AND IS ' +
      'NOT STORED: it reaches other enemies only, of which a two-champion scenario has none. ' +
      'Storing the larger number would treble this item. Its maximum health is unattributed ' +
      '(§37.3), so the entry is `incomplete`.',
  },
  {
    id: 3748,
    key: 'act',
    ownerName: 'Titanic Hydra',
    sentence:
      "Your next basic attack on-hit within 10 seconds empowers Cleave to deal 4% / 2% maximum health bonus physical damage to the primary target",
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'maxHP', owner: 'unresolved', byRangeType: { melee: 4, ranged: 2 } }],
    },
    appliesAs: 'item active, then applied on-hit by the next basic attack within 10 seconds',
    appliesAsCode: 'on-hit',
    note:
      "Recorded as `on-hit` rather than `active` even though the effect's key is `act`. The " +
      'active itself deals nothing; it empowers the next basic attack, and the damage lands ' +
      'when that attack connects. Sequencing it as an item active would place it a step early. ' +
      'The 9% / 4.5% secondary-target figure is a separate run and is not stored.',
  },
  {
    id: 6699,
    key: 'pass3',
    ownerName: 'Voltaic Cyclosword',
    sentence:
      "your next basic attack on-hit grants you 15 / 12 lethality for 4 seconds and deals bonus physical damage equal to 9% / 7% of the target's current health, capped at 200 against non-champions",
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'currentHP', owner: 'target', byRangeType: { melee: 9, ranged: 7 } }],
    },
    appliesAs: 'on-hit, when fully Energized',
    appliesAsCode: 'on-hit',
    note:
      "The owner IS stated here (\"the target's current health\"), so this is the only one of the " +
      'four range-split stores that is complete rather than `incomplete`. The 15 / 12 lethality ' +
      'in the same sentence is a STAT GRANT, not damage, and is a separate run.',
  },

  // -------------------------------------------------------------------------
  // STORE — the damage RECURS, and the source says so
  //
  // Six effects, re-read after `CuratedItemEffect.overTime` arrived. Two rules govern all six.
  //
  // 1. **What is stored is ONE instance, never a total.** `totalInstances` says how many.
  // 2. **`totalInstances` is set only where the source writes the count down.** Four of the six
  //    state a per-second figure and a duration and nothing else; dividing one by the other is
  //    arithmetic on ELAPSED TIME, which SPECIFICATION §3.2 puts outside this engine, so the
  //    count is left absent and the effect reports one instance. Two of the six state a total
  //    as well, and the count that reconciles the two is confirmed twice over — see Blackfire.
  // -------------------------------------------------------------------------
  {
    id: 6660,
    key: 'pass',
    ownerName: "Bami's Cinder",
    sentence:
      'Taking or dealing damage activates this passive for 3 seconds. Deal 15 magic damage every second to enemies within 325 units.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 15, ratios: [], overTime: {} },
    appliesAs: 'continuous burn while the passive is active, once per second',
    appliesAsCode: 'periodic',
    note:
      'NO COUNT IS RECORDED. "3 seconds" and "every second" are two time values, and 3 ÷ 1 is ' +
      'arithmetic on time rather than a count the source states — the more so because taking or ' +
      'dealing damage restarts the 3 seconds, so the real number depends on the fight. The ' +
      '150%/200% figures against minions and monsters are not champion damage.',
  },
  {
    id: 2503,
    key: 'pass',
    ownerName: 'Blackfire Torch',
    sentence:
      'Dealing ability damage burns enemies, causing them to take 10 (+ 1% AP) magic damage every 0.5 seconds over 3 seconds, for a total of 60 (+ 6% AP).',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 10,
      ratios: [{ stat: 'AP', value: 1 }],
      overTime: { totalInstances: 6 },
    },
    appliesAs: 'a burn applied by dealing ability damage, ticking every 0.5 seconds',
    appliesAsCode: 'periodic',
    note:
      'THE COUNT IS STATED, AND IT IS STATED TWICE. Reading the displayed sentence, the total ' +
      '(60) divided by the tick (10) is 6, and the total ratio (6% AP) divided by the tick ' +
      'ratio (1% AP) is 6 — arithmetic on stated DAMAGE, not on time. Independently, the ' +
      'wikitext writes the tick as {{ap|60/6}}, so the 6 is literally a number the source ' +
      'contains. The parser reaches it by the second route and this reading by the first, and ' +
      'the effect is refused unless they land on the same number. Storing the tick as the whole ' +
      'effect would understate it sixfold — DATA-SOURCES §29 defect 1, on 64 ability components.',
  },
  {
    id: 2508,
    key: 'pass',
    ownerName: 'Fated Ashes',
    sentence:
      'Dealing ability damage burns enemies, causing them to take 2.5 magic damage every 0.5 seconds over 3 seconds, for a total of 15.',
    verdict: 'store',
    expect: { damageType: 'magic', base: 2.5, ratios: [], overTime: { totalInstances: 6 } },
    appliesAs: 'a burn applied by dealing ability damage, ticking every 0.5 seconds',
    appliesAsCode: 'periodic',
    note:
      'Same shape as Blackfire Torch: 15 ÷ 2.5 = 6 from the displayed sentence, and the wikitext ' +
      'writes the tick as {{ap|15/6}}.',
  },
  {
    id: 6664,
    key: 'pass',
    ownerName: 'Hollow Radiance',
    sentence:
      'Deal 15 (+ 1% bonus health) magic damage every second to enemies within 325 units.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 15,
      ratios: [{ stat: 'bonusHP', value: 1, owner: 'unresolved' }],
      overTime: {},
    },
    appliesAs: 'continuous burn while the passive is active, once per second',
    appliesAsCode: 'periodic',
    note:
      'WHOSE bonus health is never stated — the burn family, §37.3 — so this entry is ' +
      '`incomplete`. No count is recorded, for the same reason as Bami\'s Cinder.',
  },
  {
    id: 3068,
    key: 'pass',
    ownerName: 'Sunfire Aegis',
    sentence:
      'Deal 20 (+ 1.5% bonus health) magic damage every second to enemies within 325 units.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 20,
      ratios: [{ stat: 'bonusHP', value: 1.5, owner: 'unresolved' }],
      overTime: {},
    },
    appliesAs: 'continuous burn while the passive is active, once per second',
    appliesAsCode: 'periodic',
    note:
      'WHOSE bonus health is never stated — the burn family, §37.3 — so this entry is ' +
      '`incomplete`. No count is recorded.',
  },
  {
    id: 2502,
    key: 'pass',
    ownerName: 'Unending Despair',
    sentence:
      'Every 4 seconds after entering combat with champions, sap all enemy champions around you within 650 units to deal magic damage equal to 3% of your bonus health to them',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: null,
      ratios: [{ stat: 'bonusHP', value: 3, owner: 'holder' }],
      overTime: {},
    },
    appliesAs: 'a pulse every 4 seconds while in combat with champions',
    appliesAsCode: 'periodic',
    note:
      'The one effect in the whole 63 whose stat the source attributes to the HOLDER outright ' +
      '("your bonus health"), so it is complete. How many times it fires is a question about ' +
      'elapsed time, which SPECIFICATION §3.2 puts outside the engine — no count is recorded, ' +
      'and the effect contributes ONE pulse to the damage-over-time line unless the user says ' +
      'otherwise.',
  },

  // -------------------------------------------------------------------------
  // REFUSE — melee/ranged split is no longer a blocker; these have another one
  //
  // The reasons below were re-read on 2026-08-13. `melee-ranged-split` was struck from every
  // one of them, because it stopped being a reason when `byRangeType` landed. What remains is
  // what was always the real blocker, and for five of these it is that the damage cannot reach
  // the other champion at all.
  // -------------------------------------------------------------------------
  {
    id: 2520,
    key: 'pass',
    ownerName: 'Bastionbreaker',
    sentence:
      'Your next instance of ability damage to a champion or epic monster with a champion ability deals 50 / 25 (+ 1.5 / 0.75 per 1 lethality) bonus true damage.',
    verdict: 'refuse',
    reasons: ['scales-on-lethality'],
    note:
      'The 50 / 25 pair is now expressible; the lethality ratio is not. Storing the flat part ' +
      'alone would understate the item on exactly the builds that buy it.',
  },
  {
    id: 2520,
    key: 'pass2',
    ownerName: 'Bastionbreaker',
    sentence:
      'empowering your next basic attack against a turret or epic monster to consume the effect to deal 300 / 240 (+ 25 / 20 per 1 lethality) bonus true damage over 3 seconds',
    verdict: 'refuse',
    reasons: ['non-champion-target-only', 'scales-on-lethality'],
    note: 'Turrets and epic monsters only — it can never appear in a champion-versus-champion result.',
  },
  {
    id: 6672,
    key: 'pass',
    ownerName: 'Kraken Slayer',
    sentence:
      "At 2 stacks, the next basic attack consumes all stacks to deal 150 to 200 / 120 to 160 bonus physical damage on-hit, increased by 0 to 75% by target's missing health",
    verdict: 'refuse',
    reasons: ['conditional-additional-damage', 'range-split-has-named-arguments'],
    note:
      'TWO BLOCKERS, AND THE RANGE SPLIT IS NOT THE ONE. The damage is amplified by up to 75% ' +
      "by the target's missing health, which no field on AbilityComponent expresses. Separately, " +
      'this is the one {{rd}} in the population whose arms are each a LEVEL PROGRESSION written ' +
      'as a formula ({{rd|150 + (200-150)/10*(x-1) for 13|…|levels=1;9 to 20|pp=true}}). ' +
      '`byRangeType` could hold two progressions — each arm is itself a `Scaling` — but this ' +
      'parser does not read a formula, and it refuses rather than reading the first number it ' +
      'finds.',
  },

  // -------------------------------------------------------------------------
  // REFUSE — the damage cannot reach the other champion in a two-champion scenario
  // -------------------------------------------------------------------------
  {
    id: 1120,
    key: 'pass',
    ownerName: "Doran's Helm",
    sentence: 'Basic attacks deal 5 bonus physical damage on-hit against minions.',
    verdict: 'refuse',
    reasons: ['non-champion-target-only'],
  },
  {
    id: 1056,
    key: 'pass2',
    ownerName: "Doran's Ring",
    sentence: 'Basic attacks deal 5 bonus physical damage on-hit against minions.',
    verdict: 'refuse',
    reasons: ['non-champion-target-only'],
  },
  {
    id: 1054,
    key: 'pass2',
    ownerName: "Doran's Shield",
    sentence: 'Basic attacks deal 5 bonus physical damage on-hit against minions.',
    verdict: 'refuse',
    reasons: ['non-champion-target-only'],
  },
  {
    id: 3070,
    key: 'pass2',
    ownerName: 'Tear of the Goddess',
    sentence: 'Basic attacks deal 5 bonus physical damage on-hit against minions.',
    verdict: 'refuse',
    reasons: ['non-champion-target-only'],
  },
  {
    id: 3179,
    key: 'pass2',
    ownerName: 'Umbral Glaive',
    sentence: 'Your basic attacks deal 2 / 1 bonus true damage to wards.',
    verdict: 'refuse',
    reasons: ['non-champion-target-only'],
    note:
      'DATA-SOURCES §37.5 records the wards-only effect as Umbral Glaive `pass3`. In the live ' +
      'module it is `pass2` (Blackout); `pass3` (Nightstalker) damages CHAMPIONS. The document ' +
      'names the wrong key — reported, not quietly corrected.',
  },
  {
    id: 6698,
    key: 'pass',
    ownerName: 'Profane Hydra',
    sentence:
      'Damaging basic attacks deal 40% / 20% AD physical damage to OTHER enemies in a 350 radius centered around the target.',
    verdict: 'refuse',
    reasons: ['other-enemies-only'],
    note:
      'Cleave spares the champion you attacked. In a two-champion scenario (SPECIFICATION §1) ' +
      'there is no other enemy, so this damage can never reach the defender.',
  },
  {
    id: 3074,
    key: 'pass',
    ownerName: 'Ravenous Hydra',
    sentence:
      'Basic attacks on-hit deal 40% / 20% AD physical damage to other enemies in a 350 radius centered around the target.',
    verdict: 'refuse',
    reasons: ['other-enemies-only'],
  },
  {
    id: 6631,
    key: 'pass',
    ownerName: 'Stridebreaker',
    sentence:
      'Basic attacks on-hit deal 40% / 20% AD physical damage to other enemies in a 350 radius centered around the target.',
    verdict: 'refuse',
    reasons: ['other-enemies-only'],
  },
  {
    id: 3077,
    key: 'pass',
    ownerName: 'Tiamat',
    sentence:
      'Basic attacks on-hit deal 40% / 20% AD physical damage to other enemies in a 350 radius centered around the target.',
    verdict: 'refuse',
    reasons: ['other-enemies-only'],
  },
  {
    id: 3085,
    key: 'pass',
    ownerName: "Runaan's Hurricane",
    sentence:
      'Basic attacks on-attack fire additional bolts at up to 2 enemies in front of you, each dealing 65% AD physical damage. The bolts will target the closest enemies to you that are not the main target.',
    verdict: 'refuse',
    reasons: ['other-enemies-only'],
    note:
      'The source states outright that the bolts avoid the main target, so the value is clean ' +
      'and still unreachable in a two-champion fight.',
  },
  {
    id: 3870,
    key: 'pass',
    ownerName: 'Dream Maker',
    sentence:
      'Granting a heal or shield to an allied champion (excluding yourself) causes you to grant both of your Dream Bubbles to them … the Purple Bubble grants them 40 to 160 bonus magic damage on their next damaging attack or ability',
    verdict: 'refuse',
    reasons: ['ally-only'],
    note:
      'The damage is granted to a THIRD champion and excludes the holder outright. Two champions ' +
      'are configured, so there is no ally to receive it.',
  },
  {
    id: 3076,
    key: 'pass',
    ownerName: 'Bramble Vest',
    sentence:
      'When struck by a basic attack on-hit, deal 10 magic damage to the attacker and, if they are a champion, inflict them with Grievous Wounds for 3 seconds.',
    verdict: 'refuse',
    reasons: ['retaliation'],
    note:
      'The holder does not deal this; it is dealt back at whoever struck them. Stored as an ' +
      "ordinary component it would be added to the holder's own combo, pointing the damage the " +
      'wrong way. SPECIFICATION §5 also says the defender does not act, so where retaliation sits ' +
      'in the model is an open question for the lead, not a parsing problem.',
  },
  {
    id: 3075,
    key: 'pass',
    ownerName: 'Thornmail',
    sentence:
      'When struck by a basic attack on-hit, deal 20 (+ 10% bonus armor) magic damage to the attacker and, if they are a champion, inflict them with Grievous Wounds for 3 seconds.',
    verdict: 'refuse',
    reasons: ['retaliation'],
    note: 'Also an unattributed "bonus armor" — the same shape Black Cleaver proves reads backwards.',
  },

  // -------------------------------------------------------------------------
  // REFUSE — a scaling stat the contract has no arm for
  // -------------------------------------------------------------------------
  {
    id: 3179,
    key: 'pass3',
    ownerName: 'Umbral Glaive',
    sentence:
      'your next basic attack against a champion is empowered to deal 50 (+ 1.5 per 1 Lethality) bonus true damage on-hit',
    verdict: 'refuse',
    reasons: ['scales-on-lethality'],
    note:
      'This one DOES damage champions. Only lethality stops it, and `RatioStat` has no lethality ' +
      'arm. Storing the flat 50 alone would understate it on exactly the builds that buy the item.',
  },
  {
    id: 3508,
    key: 'pass',
    ownerName: 'Essence Reaver',
    sentence:
      'your next basic attack within 10 seconds deals 125% base AD (+ 0 to 50 based on critical strike chance) bonus physical damage on-hit',
    verdict: 'refuse',
    reasons: ['scales-on-crit-chance'],
    note: '0.5 damage for every 1% critical strike chance. `RatioStat` has no crit-chance arm.',
  },
  {
    id: 3742,
    key: 'pass',
    ownerName: "Dead Man's Plate",
    sentence:
      'Basic attacks consume all stacks to deal 0 to 40 physical damage (+ 0 to 100% base AD) bonus physical damage on-hit',
    verdict: 'refuse',
    reasons: ['scales-on-stacks'],
    note:
      'Both the flat part and the ratio scale on Momentum stacks (0 to 100). `Scaling` walks ' +
      'ability rank or champion level; neither is a stack count, and `Ratio.stacks` cannot carry ' +
      'a base.',
  },
  {
    id: 6655,
    key: 'pass',
    ownerName: "Luden's Echo",
    sentence:
      'Dealing ability damage to an enemy consumes all Echo stacks to deal 75 (+ 5% AP) bonus magic damage to them and, for each stack consumed beyond the first, an additional enemy within 600 units … If the number of additional targets fired at is less than the number of stacks consumed, deal an additional 20% damage to the primary target for each remaining Echo stack.',
    verdict: 'refuse',
    reasons: ['conditional-additional-damage'],
    note:
      'THE REFUSAL THAT MATTERS MOST HERE. Storing 75 (+ 5% AP) looks safe and is wrong in exactly ' +
      'this product: with no other enemy nearby, all five remaining stacks fall back onto the ' +
      'primary target, doubling it to 150 (+ 10% AP). A two-champion scenario is the case where ' +
      'the fallback ALWAYS applies, so the "minimum" reading would understate the common case ' +
      'twofold rather than being the safe floor it appears to be.',
  },

  // -------------------------------------------------------------------------
  // REFUSE — runes. All five, and the reasons are only two.
  // -------------------------------------------------------------------------
  {
    id: 8112,
    key: 'rune',
    ownerName: 'Electrocute',
    sentence:
      'Hitting a champion with 3 separate attacks or abilities within 3s deals bonus adaptive damage. Damage: 70 - 240 (+0.1 bonus AD, +0.05 AP) damage. Cooldown: 20s',
    verdict: 'refuse',
    reasons: ['adaptive-damage-type', 'range-with-unstated-axis'],
    note:
      'Two separate blockers. "adaptive" is not one of `DamageType`\'s three arms, and the source ' +
      'never says what varies across 70 - 240.',
  },
  {
    id: 8128,
    key: 'rune',
    ownerName: 'Dark Harvest',
    sentence:
      "Damaging a Champion below 50% health deals adaptive damage and harvests their soul, permanently increasing Dark Harvest's damage by 11. Dark Harvest damage: 30 (+11 damage per soul) (+0.1 bonus AD) (+0.05 AP)",
    verdict: 'refuse',
    reasons: ['adaptive-damage-type', 'scales-on-stacks'],
    note:
      '"+11 damage per soul" is a flat amount per stack. `Ratio` stores percentage POINTS of a ' +
      'stat; what a `stacks` ratio\'s magnitude means is not defined in the contract, so it is ' +
      'raised rather than guessed at.',
  },
  {
    id: 9923,
    key: 'rune',
    ownerName: 'Hail of Blades',
    sentence:
      'Gain 90% (60% for ranged champions) Attack Speed and bonus true damage when you attack an enemy champion for up to 3 attacks. On-Hit Damage: 2 - 20 (+0.12 bonus AD, +0.1 AP) damage.',
    verdict: 'refuse',
    reasons: ['range-with-unstated-axis'],
    note:
      'The damage type IS stated (true) and the ratios are clean. The source never says what ' +
      'varies across 2 - 20.',
  },
  {
    id: 8439,
    key: 'rune',
    ownerName: 'Aftershock',
    sentence:
      'After immobilizing an enemy champion, increase your Armor and Magic Resist by 45 + 75% of your Bonus Resists for 2.5s. Then explode, dealing magic damage to nearby enemies. Damage: 25 - 120 (+8% of your bonus health)',
    verdict: 'refuse',
    reasons: ['range-with-unstated-axis'],
    note:
      'Magic damage, and the health pool is attributed to the holder ("your bonus health"). Only ' +
      'the axis of 25 - 120 is missing.',
  },
  {
    id: 8229,
    key: 'rune',
    ownerName: 'Arcane Comet',
    sentence:
      'Damaging a champion with an ability hurls a comet at their location, dealing increased damage based on distance. Adaptive Damage: 15 - 100 based on level (+0.05 AP and +0.1 bonus AD)',
    verdict: 'refuse',
    reasons: ['adaptive-damage-type'],
    note:
      'The only rune of the five that states its axis ("based on level"). It still cannot be ' +
      'stored, because "adaptive" is not a `DamageType`. Note also that the endpoints of "15 - ' +
      '100 based on level" are not attributed to levels 1 and 18 by the source itself.',
  },
];

/** Join key: an effect is one item/rune id plus one effect key. */
export function readingKey(id: number, key: string): string {
  return `${id}|${key}`;
}

const BY_KEY = new Map(READ_POPULATION.map((r) => [readingKey(r.id, r.key), r]));

export function readingFor(id: number, key: string): Reading | undefined {
  return BY_KEY.get(readingKey(id, key));
}
