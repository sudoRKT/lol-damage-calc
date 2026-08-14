// THE SECOND READ POPULATION — one person's reading of the ten sentences the second reach finds.
//
// `effect-values-read.ts` records a reading of each of the 63 effects the census calls
// structural. This file does the same job for the effects `effect-values-reach.ts` adds: the
// ones whose damage figure sits inside a `{{ft}}` footnote, and the two whose damage type and
// value are bridged by "equal to". THE POPULATIONS ARE DISJOINT — an effect with a reading in
// the other file is never read here, and the runner asserts it.
//
// SAME BAR, NO EXCEPTIONS. A value is stored only where this reading and the parser produce the
// same damage type, the same flat base, the same ratios in the same order, the same owner for
// every ratio, and the same recurrence. A path that stored on weaker evidence than the main one
// would be a hole in the rule rather than an extension of it.
//
// EVERY READING BELOW WAS MADE FROM THE SENTENCE, BEFORE THE PARSER WAS RUN ON IT. That ordering
// is the only thing that makes the agreement evidence rather than a restatement.
//
// NOTHING HERE IS A VERIFICATION. No value is re-derived from a documented formula or a
// published worked example, so no entry may claim better than `derived` (CLAUDE.md).

import type { Reading } from './effect-values-read.ts';

export const REACH_READ_POPULATION: Reading[] = [
  // -------------------------------------------------------------------------
  // SHAPE B — the damage type and its value, bridged by "equal to"
  // -------------------------------------------------------------------------
  {
    id: 3153,
    key: 'pass',
    ownerName: 'Blade of The Ruined King',
    sentence:
      "Basic attacks deal bonus physical damage on-hit equal to 9% / 6% of the target's current " +
      'health, with a maximum of 100 against minions and monsters.',
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'currentHP', owner: 'target', byRangeType: { melee: 9, ranged: 6 } }],
    },
    appliesAs: 'on-hit',
    appliesAsCode: 'on-hit',
    note:
      "THE OWNER IS STATED IN SO MANY WORDS — \"of the TARGET's current health\" — so this is not " +
      'one of the burn family §37.3 leaves unresolved. The 100 cap applies against minions and ' +
      'monsters only and so cannot bind in a champion-versus-champion fight; it is not stored, ' +
      'and nothing in the contract could hold it if it were.',
  },
  {
    id: 6692,
    key: 'pass',
    ownerName: 'Eclipse',
    sentence:
      'Applying 2 stacks to a champion within a 2 second period deals bonus physical damage to ' +
      "them equal to 8% / 5% of target's maximum health and grants you a shield for 150 / 75 " +
      '(+ 40% / 20% bonus AD) for 2 seconds.',
    verdict: 'store',
    expect: {
      damageType: 'physical',
      base: null,
      ratios: [{ stat: 'maxHP', owner: 'target', byRangeType: { melee: 8, ranged: 5 } }],
    },
    appliesAs: 'on applying a second stack to the same champion within 2 seconds',
    // NO CONTRACT ARM. Stacks come from a basic attack, an ability, an item effect, a summoner
    // spell, crowd control OR a damage-over-time application — the trigger is "any second
    // damaging instance", which `appliesAs` has no member for. Left ABSENT rather than set to
    // 'unstated', which would claim the source is silent when it is not.
    note:
      'THE SHIELD IN THE SAME SENTENCE HAS ITS OWN melee/ranged pair (150 / 75) and its own ' +
      'bonus-AD ratio, and it is a separate {{as}} run. It must not join the damage — this is ' +
      'the shape that cost four real damage instances in the census\'s first run (§37.4 defect ' +
      '2). The damage carries ONE ratio and no flat base.',
  },

  // -------------------------------------------------------------------------
  // SHAPE A — the figure is inside a {{ft}} footnote. STORE.
  // -------------------------------------------------------------------------
  {
    id: 6653,
    key: 'pass',
    ownerName: "Liandry's Torment",
    sentence:
      'Dealing ability damage or pet damage burns enemies, causing them to take 1% of the ' +
      "target's maximum health magic damage every 0.5 seconds over 3 seconds — footnoted as 6% " +
      "of the target's maximum health total magic damage over 3 seconds.",
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: null,
      ratios: [{ stat: 'maxHP', value: 1, owner: 'target' }],
      overTime: { totalInstances: 6 },
    },
    appliesAs: 'a burn applied by dealing ability damage, ticking every 0.5 seconds',
    appliesAsCode: 'periodic',
    note:
      'THE COUNT IS THE QUOTIENT OF TWO STATED FIGURES, NOT A NUMBER ON THE PAGE. 6% total ÷ 1% ' +
      'per tick = 6, and no elapsed time is divided by anything. What that guarantees is narrow ' +
      "and it is the only thing relied on: 1% × 6 reproduces the source's own 6% exactly, so " +
      'the damage-over-time line reports the figure the source states. Storing the tick as the ' +
      'whole effect would understate it sixfold (§29 defect 1). The "capped at 20 per tick ' +
      'against monsters" clause cannot bind against a champion and is not stored.',
  },
  {
    id: 3118,
    key: 'pass2',
    ownerName: 'Malignance',
    sentence:
      'Dealing damage to enemy champions with your ultimate ability creates a scorched zone ' +
      'beneath them for 3 seconds, applying a Curse to enemies within that deals 15 (+ 1.25% ' +
      'AP) magic damage every 0.25 seconds — footnoted as 180 (+ 15% AP) total magic damage ' +
      'over the duration.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 15,
      ratios: [{ stat: 'AP', value: 1.25 }],
      overTime: { totalInstances: 12 },
    },
    appliesAs: 'a zone created by your ultimate, cursing enemies inside it every 0.25 seconds',
    appliesAsCode: 'periodic',
    note:
      'TWO WITNESSES AGREE ON THE COUNT AND THEY ARE INDEPENDENT: 180 ÷ 15 = 12 from the flat ' +
      'base, and 15% ÷ 1.25% = 12 from the AP ratio. THE WIKITEXT DIVISOR IS NOT ONE OF THEM ' +
      'AND MUST NOT BE. Malignance writes its tick as {{ap|60/4}}, where 4 is TICKS PER SECOND, ' +
      'while Blackfire Torch writes {{ap|60/6}}, where 6 is the INSTANCE COUNT. The notation is ' +
      'identical and the meaning is opposite; reading the divisor here would give Malignance a ' +
      'third of its damage. The magic-resistance reduction in the same sentence is a separate ' +
      'run and is not part of this component.',
  },
  {
    id: 3050,
    key: 'pass2',
    ownerName: "Zeke's Convergence",
    sentence:
      'Upon casting your ultimate ability you summon a storm around you for 5 seconds. The storm ' +
      'deals 7.5 magic damage every 0.25 seconds to enemy champions and monsters within 350 ' +
      'units — footnoted as 150 total magic damage over the duration.',
    verdict: 'store',
    expect: {
      damageType: 'magic',
      base: 7.5,
      ratios: [],
      overTime: { totalInstances: 20 },
    },
    appliesAs: 'a storm around the holder after their ultimate, ticking every 0.25 seconds',
    appliesAsCode: 'periodic',
    note:
      'ONE WITNESS ONLY — 150 ÷ 7.5 = 20 — because the effect carries no ratio to check it ' +
      'against. That is weaker evidence than Malignance\'s two and is recorded as such. It is ' +
      'still accepted because the property being relied on is arithmetic: 7.5 × 20 is the 150 ' +
      'the source states. LIKE SUNFIRE AEGIS AND BAMI\'S CINDER, this damage reaches only ' +
      'enemies standing inside a radius, and the engine models no positions; storing it follows ' +
      'the convention those already-stored effects set rather than establishing a new one.',
  },

  // -------------------------------------------------------------------------
  // SHAPE A — REFUSED. Every one states its number plainly; nothing here is a reading failure.
  // -------------------------------------------------------------------------
  {
    id: 6664,
    key: 'pass2',
    ownerName: 'Hollow Radiance',
    sentence:
      'Killing a non-champion unit causes an eruption around their death location that deals ' +
      "200% of Immolate's damage to enemies within 350 units. Scoring a takedown against an " +
      'enemy champion within 3 seconds of damaging them causes a larger eruption dealing 400%.',
    verdict: 'refuse',
    reasons: ['trigger-needs-a-third-unit', 'value-stated-only-by-reference'],
    note:
      'TWO INDEPENDENT BLOCKERS, and either alone would refuse it. (1) The eruption fires on ' +
      'KILLING a minion or monster, which a two-champion scenario does not contain; the larger ' +
      'eruption fires on a takedown of the defender, by which point the survival verdict is ' +
      'already settled. (2) The value is written as a multiple of another effect\'s variables ' +
      '({{#var:hollow_ibase}}*2), so the number exists only by reference to Hollow Radiance ' +
      "`pass`. The parser refuses it too, with `unparsed-token`, and the two agree that nothing " +
      'may be stored.',
  },
  {
    id: 2512,
    key: 'pass2',
    ownerName: 'Fiendhunter Bolts',
    sentence:
      'After casting your ultimate, your next 3 basic attacks are empowered to critically strike ' +
      'for 60 / 80 critical damage; if an attack would already have critically struck it ' +
      "instead critically strikes for 100 and deals bonus true damage equal to 15% of the " +
      "triggering attack's pre-mitigation damage.",
    verdict: 'refuse',
    reasons: ['critical-strike-modifier', 'conditional-additional-damage'],
    note:
      'THE NUMBER IS NOT AN AMOUNT OF DAMAGE. 60 / 80 is a critical-strike DAMAGE PERCENTAGE — ' +
      'it changes what a critical strike multiplies by, and `AbilityComponent` has no field ' +
      'that means that. Putting 60 in `base` would hand the holder 60 flat damage, which is a ' +
      'different number rather than an imprecise one. The true-damage half is 15% of the ' +
      "triggering attack's own damage, which multiplies a figure computed elsewhere in the " +
      'combo and is not a ratio on any stat.',
  },
  {
    id: 6610,
    key: 'pass',
    ownerName: 'Sundered Sky',
    sentence:
      'Your next basic attack against a champion is empowered to critically strike for 60 / 80 ' +
      'critical damage and heal you for 90% / 45% base AD (+ 4% of your missing health).',
    verdict: 'refuse',
    reasons: ['critical-strike-modifier'],
    note:
      'SAME SHAPE AS FIENDHUNTER BOLTS AND THE SAME REASON. The footnote states a critical ' +
      'damage percentage, not damage. The heal in the same sentence is a heal, not damage, and ' +
      'belongs to `Result.sustain` (§42.2) rather than to a damage component.',
  },
  {
    id: 1056,
    key: 'pass',
    ownerName: "Doran's Ring",
    sentence:
      'Restore 1 mana every second. Dealing damage to an enemy champion increases the ' +
      'restoration to 2 mana for the next 5 seconds.',
    verdict: 'refuse',
    reasons: ['no-structural-damage-run'],
    note:
      'IN THE POPULATION BECAUSE OF ITS SHAPE, NOT ITS CONTENT. It carries an {{as}} block inside ' +
      'a footnote, so the hidden-block test finds it; the block is about mana restored and the ' +
      'effect deals no damage at all. The census already classifies it `damage: none`, and this ' +
      'reading agrees. Recorded rather than filtered out, so the population is what the test ' +
      'finds and not what someone thought it should find.',
  },
  {
    id: 3083,
    key: 'pass2',
    ownerName: "Warmog's Armor",
    sentence:
      'Warmog\'s Heart: while you have at least 1100 bonus health, restore a share of maximum ' +
      'health every second when out of combat.',
    verdict: 'refuse',
    reasons: ['no-structural-damage-run'],
    note:
      'Out of scope before it is anything else: the census marks it not damage-relevant, and it ' +
      'restores health out of combat. Recorded for the same reason as Doran\'s Ring — the ' +
      'hidden-block test finds it, so the reading has to say what it is.',
  },
];

/** The reading for one effect in the second-reach population, or undefined. */
export function reachReadingFor(id: number, key: string): Reading | undefined {
  return REACH_READ_POPULATION.find((r) => r.id === id && r.key === key);
}
