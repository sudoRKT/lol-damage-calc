// THE SHAPE READINGS — what a person found when they read the rows the six new contract fields
// released.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT A PATTERN.
//
// `CuratedDefensiveEffect` gained six fields on 2026-08-14 (DATA-SOURCES §42.5): `label`,
// `id` + `relation`, `grantedStat`, `appliesToDamageType`, `overTime` and `unit`. Each one closes
// a refusal class in `defensive-propose.ts`. It would be easy — and wrong — to close them with
// regular expressions over the row label: "Bonus Armor" -> armor, "Total Heal" -> over time,
// "Maximum X" -> an alternative to "X".
//
// CLAUDE.md forbids exactly that: A DETECTOR PROPOSES, A PERSON CONFIRMS, AND STORAGE IS GATED ON
// THE CONFIRMED POPULATION. The label rules in `defensive-propose.ts` are the detector — they say
// which (page, kind) pairs state a fact the entry could not carry. THIS file is the confirmation:
// every row below was read against the ability's own description prose before its shape was
// written down. A (page, kind) pair that is not here is REPORTED for someone to read, never
// stored on the strength of its label.
//
// THREE ROWS THE LABEL WOULD HAVE DECIDED WRONGLY, all caught by reading:
//
//  1. **Vladimir R "Maximum Total Heal"** — the word "total" fires every over-time rule in this
//     project, and it is not an over-time figure at all. Vladimir heals "for each infected
//     champion"; the total is a sum ACROSS TARGETS, delivered at one moment. Stored as
//     `overTime`, a burst heal would have been spread across the sequence, and SPECIFICATION §3.8
//     puts an over-time figure outside the burst verdict — so the defender's burst survival would
//     have been computed without a heal that actually lands inside it.
//  2. **Graves E "Bonus Armor"** — 7 to 19 armor is PER STACK of True Grit, which stacks to 8.
//     The entry has no counter for a flat value, so storing the row hands Graves between one and
//     one-eighth of the armor he has. Refused, not stored.
//  3. **Briar W "Heal Percentage"** — the source states the heal as "5% of her maximum health
//     PLUS a percentage of the post-mitigation damage dealt", and only the second term has a row.
//     One entry cannot hold two terms in two different units, and storing the row alone
//     understates the heal by a fixed 5% of Briar's maximum health.
//
// The quotations in `sourceSays` and `read` are the wiki's own sentences flattened to readable
// text by `flatten()` in defensive.ts — the same text a person reads to confirm. They are quoted
// rather than paraphrased so a reader can find the sentence again on the page.

import type { CuratedDefensiveEffect, DamageType, OverTimeFigure } from '../../src/types/data.ts';
import type { Kind } from './defensive.ts';

/** One row of one ability, as a person read it. */
export interface RowReading {
  /** The source's own row label, verbatim. Must still be present on the page — see `staleReadings`. */
  label: string;
  /** Which resistance the row grants. Required by gate 1 on kind `resistance-grant`. */
  grantedStat?: CuratedDefensiveEffect['grantedStat'];
  /** The ONE damage type this row applies to. Absent means all types, never "unknown". */
  appliesToDamageType?: DamageType;
  /**
   * A unit the ROW ITSELF cannot show. `flat` and `percent` are read off the row (a '%' sign is
   * either there or it is not); a RATE and an AMPLIFIER are not — "20 to 40%" of life steal and
   * "50 to 100%" of increased healing look identical in the wikitext and mean different things.
   */
  rateUnit?: 'percent-of-damage-dealt' | 'healing-multiplier';
  /**
   * The effect recurs. `sourceSays` quotes the sentence the recurrence rests on.
   *
   * ═══ `figureIs` — WHAT THE STORED NUMBER MEANS (read 2026-08-15) ═══
   *
   * `CuratedDefensiveEffect.overTime.figureIs` landed in the contract on 2026-08-15 because a
   * recurrence and a count were never enough: the entry also has to say whether the number it
   * stores is ONE OCCURRENCE or the WHOLE OF IT. Master Yi W is the proof it is a real
   * distinction rather than a pedantry — the same ability stores both readings side by side, 15
   * per tick and 120 for the channel, exactly x8 at every rank, and nothing but this field tells
   * the two rows apart.
   *
   * IT IS FILLED IN FROM THE SENTENCE, NOT FROM THE LABEL. "Total" means "over the duration" on
   * most of these pages and "across every target hit" on Vladimir R, so the word decides nothing
   * (§48.3). Every value below was read against the ability's own description, and where the row's
   * arithmetic corroborates it — Master Yi's Total row is written `15*8` and its description says
   * 4 seconds every 0.5 — the corroboration is recorded in `read`.
   *
   * ABSENT IS A REAL STATE AND MEANS THE SOURCE DOES NOT SAY, which forces the entry to
   * `incomplete`. `figureIsUnread` says why nobody could fill it in, so an unfilled field cannot
   * be mistaken for an unfinished one.
   */
  overTime?: {
    sourceSays: string;
    totalInstances?: number;
    figureIs?: OverTimeFigure;
    /**
     * REQUIRED WHEN `figureIs` IS ABSENT ON A ROW SOMEBODY READ. The sentence or the
     * contradiction that stopped the reading, so "unread" and "unreadable" are distinguishable.
     */
    figureIsUnread?: string;
    /**
     * NO COUNT CAN EVER EXIST FOR THIS ROW, and why — permanent, not pending (§27).
     *
     * A per-instance figure needs a number of occurrences before a whole-duration total can be
     * formed. On most of these pages that number is derivable and simply is not stored, which is
     * work outstanding. On Swain R it is not: the source states no duration for the ability at
     * all, because the channel is fed by a resource. Recording the difference is what stops the
     * interface reading "not yet modelled" over an entry nobody can ever finish.
     */
    countUnresolvable?: string;
  };
  /**
   * This row is an ALTERNATIVE to the row with this label, not an addition to it. Absent means
   * the row adds — which for two rows of one kind is a claim, and is why gate 1 makes it explicit.
   */
  alternativeTo?: string;
  /**
   * The row grants to somebody who is not the defender. Dropped and REPORTED, exactly as a
   * non-champion row is: this product is champion-versus-champion (SPECIFICATION §5), there is
   * one defender, and an ally's copy of a grant can never apply to them.
   */
  drop?: 'other-recipient';
}

export interface ShapeReading {
  /** champion/slot/abilityName, as `defensive-confirmed.ts` keys it. */
  key: string;
  /** The CENSUS kind, as `ConfirmedEffect.kinds` lists it. */
  kind: Kind;
  /** The sentence (or sentences) the reader used. Evidence, not decoration. */
  read: string;
  /**
   * The rows of this kind, in page order. THIS LIST IS AUTHORITATIVE about which rows belong to
   * this kind — that is how Amumu E's and Galio W's typed reductions reach the
   * `type-specific-reduction` kind a person confirmed, when the label map files them under
   * `damage-reduction`.
   */
  rows: RowReading[];
}

/** Why a pair a person read is still not stored. Each is a fact the entry cannot carry. */
export type ReadRefusalClass =
  | 'count-scaled-value'
  | 'term-outside-the-row'
  | 'recipient-not-expressible';

export const READ_REFUSAL_CLASSES: Record<ReadRefusalClass, string> = {
  'count-scaled-value':
    'the source states the figure PER STACK of something that accumulates on the defender, and ' +
    'the entry has no counter for a flat value. Graves E grants 7 to 19 armor per stack of True ' +
    'Grit, stacking to 8; the row is between one and one-eighth of the real grant. Distinct from ' +
    '"for each enemy champion hit", which resolves to one in a champion-versus-champion tool.',
  'term-outside-the-row':
    'the source states the effect as two terms in two different units and gives only one of them ' +
    'a leveling row. Briar W heals "5% of her maximum health plus a percentage of the ' +
    'post-mitigation damage dealt"; one entry holds one unit, so storing the row alone ' +
    'understates the heal by a fixed amount. The same rule the ability path applies to a row it ' +
    'cannot read in full, applied to an effect.',
  'recipient-not-expressible':
    'the rows name different RECIPIENTS with different values and the entry has no recipient ' +
    'field. Not used where dropping the other recipient settles it — see `drop`.',
};

export interface ReadRefusal {
  key: string;
  kind: Kind;
  refusalClass: ReadRefusalClass;
  /** The sentence that decided it. */
  why: string;
}

/**
 * READ AND REFUSED. These are not gaps waiting on a parser; a person read them and found a fact
 * the contract cannot hold.
 */
export const REFUSED_ON_READING: ReadRefusal[] = [
  {
    key: 'Graves/E/Quickdraw',
    kind: 'resistance-grant',
    refusalClass: 'count-scaled-value',
    why:
      '"True Grit: For each stack, Graves gains bonus armor, and bonus magic resistance equal to ' +
      '50% of that amount" — the ability "generat[es] a stack of True Grit ... stacking up to 8 ' +
      'times". The rows (7 to 19 armor) are per stack.',
  },
  {
    key: 'Briar/W/Snack Attack',
    kind: 'heal',
    refusalClass: 'term-outside-the-row',
    why:
      '"healing her for 5% of her maximum health plus a percentage of the post-mitigation damage ' +
      'dealt" — only the percentage has a row ("Heal Percentage"). The 5% maximum-health term has ' +
      'no row and a different unit.',
  },
];

/**
 * THE READ POPULATION. 44 (page, kind) pairs, read 2026-08-14 against the cached wikitext of all
 * 937 ability pages, plus the two typed reductions the label map files under the wrong kind.
 */
export const SHAPES_READ: ShapeReading[] = [
  // ------------------------------------------------------------------ resistance grants
  {
    key: 'Leona/W/Eclipse',
    kind: 'resistance-grant',
    read: 'Active: Leona raises her guard for 3 seconds, gaining ... bonus armor and bonus magic resistance.',
    rows: [
      { label: 'Bonus Armor', grantedStat: 'armor' },
      { label: 'Bonus Magic Resistance', grantedStat: 'magicResist' },
    ],
  },
  {
    key: 'Braum/W/Stand Behind Me',
    kind: 'resistance-grant',
    read:
      '"grants himself and the ally bonus armor and bonus magic resistance for 3 seconds"; ' +
      '"Stand Behind Me can be self cast to instantly grant Braum the bonus resistances." The ' +
      'Ally rows carry a different ratio (12% bonus) from the Self rows (36% bonus), so they are ' +
      'not two labels for one grant.',
    rows: [
      { label: 'Ally Bonus Armor', drop: 'other-recipient' },
      { label: 'Ally Bonus Magic Resistance', drop: 'other-recipient' },
      { label: 'Self Bonus Armor', grantedStat: 'armor' },
      { label: 'Self Bonus Magic Resistance', grantedStat: 'magicResist' },
    ],
  },
  {
    key: 'Gwen/W/Hallowed Mist',
    kind: 'resistance-grant',
    read: '"While inside the mist, Gwen ... gains bonus armor and bonus magic resistance" — ONE row for both.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Hecarim/W/Spirit of Dread',
    kind: 'resistance-grant',
    read: '"While active, Hecarim gains bonus armor and bonus magic resistance" — one figure, both resistances.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Jax/R/Grandmaster-at-Arms',
    kind: 'resistance-grant',
    read:
      '"he gains bonus armor, increased for each champion hit beyond the first, and bonus magic ' +
      'resistance equal to 60% of that amount" — two separately-valued rows, both in effect at ' +
      'once. The per-champion increase resolves to one champion in a 1v1 tool.',
    rows: [
      { label: 'Bonus Armor', grantedStat: 'armor' },
      { label: 'Bonus Magic Resistance', grantedStat: 'magicResist' },
    ],
  },
  {
    key: 'Kennen/R/Slicing Maelstrom',
    kind: 'resistance-grant',
    read: '"gaining bonus armor and bonus magic resistance for the duration" — one row for both.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Malphite/W/Thunderclap',
    kind: 'resistance-grant',
    read:
      '"Passive: Malphite gains bonus armor, tripled while Granite Shield is active." The row is ' +
      'the untripled grant, stated as a percentage of armor whose owner the source never names.',
    rows: [{ label: 'Bonus Armor', grantedStat: 'armor' }],
  },
  {
    key: 'Nasus/R/Fury of the Sands',
    kind: 'resistance-grant',
    read: '"gaining bonus health, bonus armor, bonus magic resistance, increased size ..." — one row for both resistances.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Olaf/R/Ragnarok',
    kind: 'resistance-grant',
    read: '"Passive: Olaf gains bonus armor and bonus magic resistance." One row, both.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Orianna/E/Command: Protect',
    kind: 'resistance-grant',
    read: '"The Ball grants bonus armor and bonus magic resistance to the unit it is attached to." One row, both.',
    rows: [{ label: 'Bonus Resistances', grantedStat: 'both' }],
  },
  {
    key: 'Rammus/W/Defensive Ball Curl',
    kind: 'resistance-grant',
    read:
      '"gaining bonus armor and bonus magic resistance" — two rows with different values ' +
      '(27 to 47 armor, 20 to 40 magic resistance), both in effect at once.',
    rows: [
      { label: 'Bonus Armor', grantedStat: 'armor' },
      { label: 'Bonus Magic Resistance', grantedStat: 'magicResist' },
    ],
  },
  {
    key: 'Taric/W/Bastion',
    kind: 'resistance-grant',
    read: '"Passive: Taric gains bonus armor" — a percentage of Taric\'s own armor, which the row attributes.',
    rows: [{ label: 'Bonus Armor', grantedStat: 'armor' }],
  },

  // ------------------------------------------------------------------ typed reductions
  // The label map in defensive.ts files "Physical Damage Reduction" under `damage-reduction`;
  // a person confirmed both of these pages as `type-specific-reduction`, which is what the
  // census's own definition calls a reduction "stated as applying only to physical, magic or
  // true damage". The reading names the rows, so the pair reaches the kind it was confirmed as.
  {
    key: 'Amumu/E/Tantrum',
    kind: 'type-specific-reduction',
    read:
      '"Passive: Amumu reduces every instance of pre-mitigation physical damage taken, capped at ' +
      '50% of the damage instance." A FLAT reduction (5 to 13), not a percentage.',
    rows: [{ label: 'Physical Damage Reduction', appliesToDamageType: 'physical' }],
  },
  {
    key: 'Galio/W/Shield of Durand',
    kind: 'type-specific-reduction',
    read:
      '"gaining physical and magic damage reduction" — two separately-valued rows, both in ' +
      'effect at once against their own damage type.',
    rows: [
      { label: 'Physical Damage Reduction', appliesToDamageType: 'physical' },
      { label: 'Magic Damage Reduction', appliesToDamageType: 'magic' },
    ],
  },

  // ------------------------------------------------------------------ shields
  {
    key: 'Galio/W/Shield of Durand',
    kind: 'shield',
    read: '"Anti-Magic Bulwark: Gain a shield that absorbs magic damage."',
    rows: [{ label: 'Magic Shield Strength', appliesToDamageType: 'magic' }],
  },
  {
    key: 'Kassadin/Q/Null Sphere',
    kind: 'shield',
    read: '"He also gains a shield that absorbs magic damage for 1.5 seconds."',
    rows: [{ label: 'Magic Shield Strength', appliesToDamageType: 'magic' }],
  },
  {
    key: 'Morgana/E/Black Shield',
    kind: 'shield',
    read: '"grants a shield ... which absorbs incoming magic damage and grants crowd control immunity while it holds."',
    rows: [{ label: 'Magic Shield Strength', appliesToDamageType: 'magic' }],
  },
  {
    key: 'Diana/W/Pale Cascade',
    kind: 'shield',
    read:
      '"If all three spheres detonate, Pale Cascade\'s shield is reapplied, stacking with its ' +
      'original shield" — the Maximum row is the doubled reading of the same shield, not a second one.',
    rows: [
      { label: 'Shield Strength' },
      { label: 'Maximum Shield Strength', alternativeTo: 'Shield Strength' },
    ],
  },
  {
    key: 'Hwei/W/Pool of Reflection',
    kind: 'shield',
    read:
      '"grants him and allied champions a shield at the start of the cast time ... The shield ' +
      'refreshes and increases in strength by an amount every 0.25 over the duration while they ' +
      'remain in the area." The Total row is the same shield at the end of the duration. The ' +
      'page\'s own note settles what that row IS: "The maximum shield defines the cap for the ' +
      'strength, and it takes approximately 1.5 seconds to gain the full shield" — a cap, reached ' +
      'over time, never a per-tick figure. The rows agree: the bonus row is the initial shield / 6 ' +
      'and the Total row is the initial shield x 2, so six 0.25-second ticks (1.5 seconds) take it ' +
      'from one to the other.',
    rows: [
      { label: 'Initial Shield Strength' },
      {
        label: 'Total Maximum Shield',
        alternativeTo: 'Initial Shield Strength',
        overTime: {
          sourceSays:
            'The shield refreshes and increases in strength by an amount every 0.25 over the ' +
            'duration while they remain in the area.',
          // A CAP IS THE WHOLE OF IT. Multiplying this by a tick count would shield Hwei six
          // times over for a shield the source calls a maximum.
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Lux/W/Prismatic Barrier',
    kind: 'shield',
    read:
      '"Allied champions hit by the wand gain a shield ... which can stack up to 2 times ... Lux ' +
      'gains the shield upon throwing and upon retrieving the wand." The Maximum row is both applications.',
    rows: [{ label: 'Shield Strength' }, { label: 'Maximum Shield', alternativeTo: 'Shield Strength' }],
  },
  {
    key: 'Rumble/W/Scrap Shield',
    kind: 'shield',
    read:
      '"Danger Zone Bonus: Scrap Shield\'s shield strength ... increased in effectiveness by 50%" ' +
      '— the Enhanced row replaces the base row while Rumble is in the Danger Zone.',
    rows: [
      { label: 'Shield Strength' },
      { label: 'Enhanced Shield Strength', alternativeTo: 'Shield Strength' },
    ],
  },
  {
    key: 'Shen/R/Stand United',
    kind: 'shield',
    read:
      '"granting the target allied champion a shield ... increased by 1% per 1% of target\'s ' +
      'missing health. This is capped at 60% missing health." Minimum and Maximum are the two ends ' +
      'of one shield.',
    rows: [
      { label: 'Minimum Shield Strength' },
      { label: 'Maximum Shield Strength', alternativeTo: 'Minimum Shield Strength' },
    ],
  },

  // ------------------------------------------------------------------ heals
  {
    key: "Bel'Veth/E/Royal Maelstrom",
    kind: 'heal',
    read: '"Active: Bel\'Veth enters a frenzy ... but gains damage reduction and life steal." A rate on damage dealt.',
    rows: [{ label: 'Life Steal', rateUnit: 'percent-of-damage-dealt' }],
  },
  {
    key: 'Briar/E/Chilling Scream',
    kind: 'heal',
    read:
      '"charging for up to 1 second, during which she ... heals herself every 0.25 seconds." The ' +
      'Maximum row is the whole charge, the per-tick row is one of its ticks. The rows say the ' +
      'same thing in their own arithmetic: the per-tick row is written `10/4` of the Maximum row, ' +
      'and 1 second / 0.25 seconds is 4.',
    rows: [
      {
        label: 'Heal Per Tick',
        overTime: {
          sourceSays:
            'Briar prepares to unleash a scream ... charging for up to 1 second, during which ' +
            'she ... heals herself every 0.25 seconds.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Maximum Heal',
        alternativeTo: 'Heal Per Tick',
        overTime: {
          sourceSays:
            'Briar prepares to unleash a scream ... charging for up to 1 second, during which ' +
            'she ... heals herself every 0.25 seconds.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Briar/R/Certain Death',
    kind: 'heal',
    read: '"Hematomania: Briar gains ... bonus armor and bonus magic resistance equal to 20% AD, life steal ..."',
    rows: [{ label: 'Life Steal', rateUnit: 'percent-of-damage-dealt' }],
  },
  {
    key: 'Aatrox/R/World Ender',
    kind: 'heal',
    read:
      '"During World Ender, Aatrox ... receives increased self-healing from all sources." An ' +
      'amplifier on other healing, which restores no health by itself.',
    rows: [{ label: 'Increased Healing', rateUnit: 'healing-multiplier' }],
  },
  {
    key: 'Warwick/Q/Jaws of the Beast',
    kind: 'heal',
    read: '"healing himself for a percentage of the post-mitigation damage dealt" — a rate, not an amount.',
    rows: [{ label: 'Healing Percentage', rateUnit: 'percent-of-damage-dealt' }],
  },
  {
    key: 'Master Yi/W/Meditate',
    kind: 'heal',
    read:
      '"Master Yi channels for up to 4 seconds, healing himself every 0.5 seconds, increased by ' +
      '1% per 1% missing health." Four rows: one tick or the whole channel, at minimum or maximum ' +
      'missing health. Exactly one of the four is the answer at any moment. THIS IS THE PAGE THAT ' +
      'PROVES `figureIs` IS NEEDED: the Total rows are written in the wikitext as the per-tick ' +
      'rows times eight (`15*8 to 55*8`), and the description says 4 seconds every 0.5 seconds, ' +
      'which is eight. Two rows that differ in nothing but this field.',
    rows: [
      {
        label: 'Minimum Heal Per Tick',
        overTime: {
          sourceSays:
            'Master Yi channels for up to 4 seconds, healing himself every 0.5 seconds, increased ' +
            'by 1% per 1% missing health.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Maximum Heal Per Tick',
        alternativeTo: 'Minimum Heal Per Tick',
        overTime: {
          sourceSays:
            'Master Yi channels for up to 4 seconds, healing himself every 0.5 seconds, increased ' +
            'by 1% per 1% missing health.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Minimum Total Heal',
        alternativeTo: 'Minimum Heal Per Tick',
        overTime: {
          sourceSays:
            'Master Yi channels for up to 4 seconds, healing himself every 0.5 seconds, increased ' +
            'by 1% per 1% missing health.',
          figureIs: 'full-duration',
        },
      },
      {
        label: 'Maximum Total Heal',
        alternativeTo: 'Minimum Heal Per Tick',
        overTime: {
          sourceSays:
            'Master Yi channels for up to 4 seconds, healing himself every 0.5 seconds, increased ' +
            'by 1% per 1% missing health.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Trundle/R/Subjugate',
    kind: 'heal',
    read:
      '"Half of the drain\'s total damage, healing, and resistances reduction is applied on-cast, ' +
      'while the other half is applied every second over the next 4 seconds."',
    rows: [
      {
        label: 'Total Healing',
        overTime: {
          sourceSays:
            "Half of the drain's total damage, healing, and resistances reduction is applied " +
            'on-cast, while the other half is applied every second over the next 4 seconds.',
          // THE ROW IS THE WHOLE DRAIN. The page splits it into an "Initial Healing" row (the
          // Total / 2) and a "Healing Per Second" row (the Total / 8) beneath it, so the row
          // stored here is by the source's own arithmetic the sum of both halves.
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Yuumi/R/Final Chapter',
    kind: 'heal',
    read:
      '"Yuumi and Book channel for up to 3.5 seconds ... to launch 5 magical waves ... Allied ' +
      'champions hit by the waves are healed." FIVE is stated in words, so it is stored; no other ' +
      'count on this page is.',
    rows: [
      {
        label: 'Total Heal',
        overTime: {
          sourceSays:
            'Yuumi and Book of Thresholds channel for up to 3.5 seconds ... to launch 5 magical ' +
            'waves in the target direction. Allied champions hit by the waves are healed.',
          totalInstances: 5,
          // The row is labelled "Total Heal" and the source states five waves over one channel,
          // so the count here is DESCRIPTIVE — the figure already covers all five and must never
          // be multiplied by them.
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Ekko/R/Chronobreak',
    kind: 'heal',
    read:
      '"heals himself, increased by 3% per 1% of health lost in the last 4 seconds" — Minimum and ' +
      'Maximum are the two ends of one heal.',
    rows: [{ label: 'Minimum Heal' }, { label: 'Maximum Heal', alternativeTo: 'Minimum Heal' }],
  },
  {
    key: 'Lissandra/R/Frozen Tomb',
    kind: 'heal',
    read:
      '"Self Cast: Lissandra ... enter[s] stasis for 2.5 seconds and heal[s] herself every 0.25 ' +
      'seconds over the duration. The healing is increased by 1% per 1% of missing health." One ' +
      'tick or the whole stasis, at minimum or maximum missing health. The wikitext writes the ' +
      'per-tick rows as the Total rows DIVIDED by ten (`100/10 to 200/10`), and 2.5 seconds / ' +
      '0.25 seconds is ten — so which row is the whole of it is stated by the source twice over.',
    rows: [
      {
        label: 'Minimum Heal per Tick',
        overTime: {
          sourceSays:
            'Lissandra instantly entombs herself in ice, entering stasis for 2.5 seconds and ' +
            'healing herself every 0.25 seconds over the duration.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Maximum Heal per Tick',
        alternativeTo: 'Minimum Heal per Tick',
        overTime: {
          sourceSays:
            'Lissandra instantly entombs herself in ice, entering stasis for 2.5 seconds and ' +
            'healing herself every 0.25 seconds over the duration.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Minimum Total Heal',
        alternativeTo: 'Minimum Heal per Tick',
        overTime: {
          sourceSays:
            'Lissandra instantly entombs herself in ice, entering stasis for 2.5 seconds and ' +
            'healing herself every 0.25 seconds over the duration.',
          figureIs: 'full-duration',
        },
      },
      {
        label: 'Maximum Total Heal',
        alternativeTo: 'Minimum Heal per Tick',
        overTime: {
          sourceSays:
            'Lissandra instantly entombs herself in ice, entering stasis for 2.5 seconds and ' +
            'healing herself every 0.25 seconds over the duration.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: "Bard/W/Caretaker's Shrine",
    kind: 'heal',
    read:
      '"a shrine ... gathers power over 5 seconds ... they are healed for an amount based on the ' +
      "shrine's power\" — Minimum and Maximum are one shrine at two moments, not two heals.",
    rows: [{ label: 'Minimum Heal' }, { label: 'Maximum Heal', alternativeTo: 'Minimum Heal' }],
  },
  {
    key: 'Fiora/R/Grand Challenge',
    kind: 'heal',
    read:
      '"a Victory Zone is created on their death location for 5 seconds, which heals Fiora and ' +
      'all allies within the area every 0.25 seconds." The Maximum row is the whole zone. The ' +
      'page carries a THIRD row between the two — "Heal per Second" — and the three agree: the ' +
      'per-tick row is the per-second row / 4 (one tick every 0.25 seconds) and the Maximum row ' +
      'is the per-second row x 5 (five seconds), which makes the Maximum exactly twenty ticks. ' +
      'The per-second row is not stored and is not a defensive entry this shape can hold; it is ' +
      'neither one occurrence nor the whole of it.',
    rows: [
      {
        label: 'Heal per Tick',
        overTime: {
          sourceSays:
            'a Grand Challenge Victory Zone is created on their death location for 5 seconds, ' +
            'which heals Fiora and all allies within the area every 0.25 seconds.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Maximum Heal',
        alternativeTo: 'Heal per Tick',
        overTime: {
          sourceSays:
            'a Grand Challenge Victory Zone is created on their death location for 5 seconds, ' +
            'which heals Fiora and all allies within the area every 0.25 seconds.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Janna/R/Monsoon',
    kind: 'heal',
    read:
      '"Janna also channels for up to 3 seconds, healing herself and nearby allies every 0.25 ' +
      'seconds." The wikitext writes the per-tick row as the Total row divided by twelve ' +
      '(`300/12 to 600/12`), and 3 seconds / 0.25 seconds is twelve.',
    rows: [
      {
        label: 'Heal Per Tick',
        overTime: {
          sourceSays:
            'Janna also channels for up to 3 seconds, healing herself and nearby allies every ' +
            '0.25 seconds.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Total Heal',
        alternativeTo: 'Heal Per Tick',
        overTime: {
          sourceSays:
            'Janna also channels for up to 3 seconds, healing herself and nearby allies every ' +
            '0.25 seconds.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Milio/W/Cozy Campfire',
    kind: 'heal',
    read:
      '"Milio summons a fuemigo ... for 6 seconds ... Allied champions near the fuemigo ... heal ' +
      'every 0.25 over the duration. Milio counts as an allied champion for this ability." WHICH ' +
      'ROW IS WHICH IS NOT IN DOUBT — the per-tick row is written as the Total row divided by ' +
      'twenty-five. THE COUNT IS: 6 seconds / 0.25 seconds is twenty-FOUR, and the row divides by ' +
      'twenty-five. That disagreement is recorded and NO count is stored on either row; it does ' +
      'not touch which row covers the whole duration, which is what `figureIs` states.',
    rows: [
      {
        label: 'Heal per Tick',
        overTime: {
          sourceSays:
            'Allied champions near the fuemigo gain bonus attack range ... and heal every 0.25 ' +
            'over the duration.',
          figureIs: 'per-instance',
        },
      },
      {
        label: 'Total Heal',
        alternativeTo: 'Heal per Tick',
        overTime: {
          sourceSays:
            'Allied champions near the fuemigo gain bonus attack range ... and heal every 0.25 ' +
            'over the duration.',
          figureIs: 'full-duration',
        },
      },
    ],
  },
  {
    key: 'Nami/W/Ebb and Flow',
    kind: 'heal',
    read:
      '"bounces to nearby unaffected champions up to twice ... with each bounce modifying the ' +
      'effectiveness of the next by -20%." The Minimum row is the same heal after two bounces.',
    rows: [{ label: 'Heal' }, { label: 'Minimum Heal', alternativeTo: 'Heal' }],
  },
  {
    key: 'Nidalee/E/Primal Surge',
    kind: 'heal',
    read: '"healing them for an amount that is increased by 1% per 0.95% of target\'s missing health."',
    rows: [{ label: 'Minimum Heal' }, { label: 'Maximum Heal', alternativeTo: 'Minimum Heal' }],
  },
  {
    key: 'Soraka/Q/Starcall',
    kind: 'heal',
    read:
      '"granting her Rejuvenation for 2.5 seconds ... Rejuvenation: Heal every 0.2 seconds and ' +
      'gain bonus movement speed that decays over the duration." THE PAGE CONTRADICTS ITS OWN ' +
      'PER-TICK ROW, and only one of the two rows survives the reading. Its notes state: ' +
      '"Rejuvenation heals over 12 ticks, with the first 4 each healing for about 15% of the ' +
      'heal, the next 4 ticks for about 5.5% each, and the last 4 for about 4.5% each." Those ' +
      'twelve shares sum to 100%, which confirms the Total row is the whole of it — and they also ' +
      'say NO tick heals the 1/12 (8.3%) the "Heal per Tick" row stores. So the Total row is a ' +
      'full-duration figure and the per-tick row is a figure no occurrence ever has.',
    rows: [
      {
        label: 'Total Heal',
        overTime: {
          sourceSays: 'Rejuvenation: Heal every 0.2 seconds and gain bonus movement speed that decays over the duration.',
          figureIs: 'full-duration',
        },
      },
      {
        label: 'Heal per Tick',
        alternativeTo: 'Total Heal',
        overTime: {
          sourceSays: 'Rejuvenation: Heal every 0.2 seconds and gain bonus movement speed that decays over the duration.',
          // LEFT ABSENT DELIBERATELY. Calling it 'per-instance' would claim the stored number is
          // one occurrence, which this page's own notes deny; calling it 'full-duration' would be
          // twelve times worse. Neither reading is taken and the entry stays incomplete.
          figureIsUnread:
            'the page states twelve ticks of THREE different sizes (about 15% of the heal each ' +
            'for the first four, 5.5% for the next four, 4.5% for the last four), so the row\'s ' +
            'even twelfth is an average and not the amount of any one occurrence. The source ' +
            'therefore does not state what this figure is, and neither reading is taken.',
        },
      },
    ],
  },
  {
    key: 'Soraka/R/Wish',
    kind: 'heal',
    read:
      '"healing herself and all allied champions, increased by 50% on targets below 40% of their ' +
      'maximum health" — the Increased row replaces the base row below the threshold.',
    rows: [{ label: 'Heal' }, { label: 'Increased Heal', alternativeTo: 'Heal' }],
  },
  {
    key: 'Swain/R/Demonic Ascension',
    kind: 'heal',
    read:
      '"Swain ... drains the lifeforce of nearby enemies, both dealing magic damage and healing ' +
      'himself every 0.5 seconds per target affected." Per target resolves to one enemy in a ' +
      'champion-versus-champion tool. ONE ROW ONLY, AND IT IS THE TICK: the page states no ' +
      'duration for Demonic Ascension at all — it "is maintained with Demonic Energy, which ' +
      'decays by 5 every 0.5 seconds ... and is lost once all Demonic Energy is depleted", and ' +
      'Swain regenerates that energy while draining. So a full-duration total cannot be formed ' +
      'from anything on this page, now or later.',
    rows: [
      {
        label: 'Heal per Tick',
        overTime: {
          sourceSays:
            'Swain is ghosted and drains the lifeforce of nearby enemies, both dealing magic ' +
            'damage and healing himself every 0.5 seconds per target affected.',
          figureIs: 'per-instance',
          countUnresolvable:
            'the source states no duration for Demonic Ascension: it "is maintained with Demonic ' +
            'Energy, which decays by 5 every 0.5 seconds, increased to 7.5 after 5 seconds have ' +
            'elapsed" and Swain "generates 10 Demonic Energy every 0.5 seconds while draining ' +
            'from at least one enemy champion". How long it runs is a property of the fight, so ' +
            'no number of heal ticks exists to state.',
        },
      },
    ],
  },
  {
    key: 'Sylas/W/Kingslayer',
    kind: 'heal',
    read: '"Sylas is also healed, increased by 1% per 0.6% of Sylas\' missing health."',
    rows: [{ label: 'Minimum Heal' }, { label: 'Maximum Heal', alternativeTo: 'Minimum Heal' }],
  },
  {
    key: 'Tryndamere/Q/Bloodlust',
    kind: 'heal',
    read: '"Tryndamere consumes all of his Fury to heal himself, increased for every point of Fury consumed."',
    rows: [{ label: 'Minimum Heal' }, { label: 'Maximum Heal', alternativeTo: 'Minimum Heal' }],
  },
  {
    key: 'Vladimir/R/Hemoplague',
    kind: 'heal',
    read:
      '"the infection bursts to deal magic damage to all affected targets and, after a ' +
      '0.4-second delay, heal Vladimir for each infected champion, reduced to 40% for champions ' +
      'beyond the first." THE "TOTAL" ROW IS A SUM ACROSS TARGETS, NOT OVER TIME — it lands at ' +
      'one moment, so it carries no `overTime`, and one enemy is the 1v1 case.',
    rows: [{ label: 'Heal' }, { label: 'Maximum Total Heal', alternativeTo: 'Heal' }],
  },
];

/** Look a reading up by the pair it belongs to. */
export function readingFor(key: string, kind: Kind): ShapeReading | undefined {
  return SHAPES_READ.find((s) => s.key === key && s.kind === kind);
}
