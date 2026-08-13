// The ONE canonical mock Result (and the Scenario that produced it).
//
// Every UI area renders against this single shared object so that all components are built
// to the same Result shape and integration does not fail. LEAD-owned convergence file
// (plan §4, Amendment 3). No UI area writes its own mock.
//
// IMPORTANT: these are ILLUSTRATIVE values for UI development, chosen to exercise every
// visual state — all three damage types, a crit, a lethal kill, mixed verification statuses,
// and a separate DoT line. They are NOT a verified calculation and must never be presented as
// one. The real engine replaces this at wiring time. The scenario is a "moment in time"
// (SPECIFICATION §3.3): the defender enters already damaged (hp 800 of 1850), so the burst
// is lethal — which lets the burndown show its signature LETHAL rule.

import type { Result } from './result';
import type { Scenario } from './scenario';

export const MOCK_SCENARIO: Scenario = {
  version: 1,
  attacker: {
    apiname: 'Aatrox',
    level: 11,
    abilityRanks: { Q: 5, W: 3, E: 3, R: 2 },
    items: [3071, 6630, 3053], // Black Cleaver, Goredrinker, Sterak's Gage (illustrative)
    runes: {
      keystone: 8010, // Conqueror
      primary: [9111, 9104, 8014],
      secondary: [8446, 8242],
      shards: ['adaptive', 'adaptive', 'armor'],
    },
    persistent: {},
    entryState: { conquerorStacks: 2, blackCleaverStacks: 0 },
  },
  defender: {
    apiname: 'Garen',
    level: 11,
    abilityRanks: { Q: 5, W: 3, E: 5, R: 2 },
    items: [3047, 3143, 3068], // Plated Steelcaps, Randuin's, Sunfire (illustrative)
    runes: {
      keystone: 8437, // Grasp of the Undying
      primary: [8446, 8429, 8451],
      secondary: [5008, 5002],
      shards: ['adaptive', 'armor', 'health'],
    },
    persistent: {},
    entryState: { bonePlating: true },
  },
  combo: [
    { id: 's1', kind: 'ability', ref: 'Q', options: { cast: 1 } },
    { id: 's2', kind: 'basic-attack', ref: 'basic', options: { forceCrit: true } },
    { id: 's3', kind: 'ability', ref: 'W' },
    { id: 's4', kind: 'on-hit', ref: 'mock-true-proc' },
    { id: 's5', kind: 'basic-attack', ref: 'basic' },
  ],
};

export const MOCK_RESULT: Result = {
  patch: '16.16.1',
  scenario: MOCK_SCENARIO,
  attackerStats: {
    level: 11,
    hp: 2010,
    maxHp: 2010,
    armor: 92,
    magicResist: 52,
    attackDamage: { base: 110, bonus: 80, total: 190 },
    abilityPower: 0,
    critChance: 0.5,
    critDamage: 1.75,
    attackSpeed: 0.92,
    adaptiveType: 'physical',
  },
  defenderStats: {
    level: 11,
    hp: 800, // entered already damaged — a "moment in time" (§3.3)
    maxHp: 1850,
    armor: 100,
    magicResist: 50,
    attackDamage: { base: 120, bonus: 20, total: 140 },
    abilityPower: 0,
    critChance: 0,
    critDamage: 1.75,
    attackSpeed: 0.7,
    adaptiveType: 'physical',
  },
  perInstance: [
    {
      index: 1,
      stepId: 's1',
      sourceLabel: 'Q — The Darkin Blade (1st cast)',
      icon: 'AatroxQ.png',
      instanceType: 'damaging-ability',
      damageType: 'physical',
      raw: 300,
      afterResistances: 250,
      afterReductions: 240,
      final: 240,
      crit: false,
      stateSnapshot: { conquerorStacks: 4, blackCleaverStacks: 0 },
      verification: 'verified',
    },
    {
      index: 2,
      stepId: 's2',
      sourceLabel: 'Basic attack (critical)',
      icon: null,
      instanceType: 'basic-attack',
      damageType: 'physical',
      raw: 235,
      afterResistances: 190,
      afterReductions: 180,
      final: 180,
      crit: true,
      stateSnapshot: { conquerorStacks: 6, blackCleaverStacks: 1 },
      verification: 'verified',
    },
    {
      index: 3,
      stepId: 's3',
      sourceLabel: 'W — Infernal Chains',
      icon: 'AatroxW.png',
      instanceType: 'damaging-ability',
      damageType: 'magic',
      raw: 240,
      afterResistances: 205,
      afterReductions: 200,
      final: 200,
      crit: false,
      stateSnapshot: { conquerorStacks: 8, blackCleaverStacks: 1 },
      verification: 'derived',
    },
    {
      index: 4,
      stepId: 's4',
      sourceLabel: 'On-hit — true damage (mock)',
      icon: null,
      instanceType: 'on-hit',
      damageType: 'true',
      // AN INCOMPLETE ABILITY CONTRIBUTES NO DAMAGE. SPECIFICATION §8 makes that the status's
      // whole meaning — "a figure is absent rather than wrong" — and requires the result's total
      // to EXCLUDE it while still naming it.
      //
      // Corrected 2026-08-13. This instance carried 120 true damage into `runningTotal` and into
      // `burst.byType.true` while ALSO being listed in `incompleteContributors` as excluded: the
      // one canonical mock stated both that the damage counted and that it did not. Every
      // component in this product is built and tested against this object, so a component author
      // reading it would have learned the opposite of the rule. Found by the interface area's
      // result-consistency sweep, which now checks the whole class rather than this entry.
      raw: 0,
      afterResistances: 0,
      afterReductions: 0,
      final: 0,
      crit: false,
      stateSnapshot: { conquerorStacks: 10, blackCleaverStacks: 1 },
      verification: 'incomplete',
      // PENDING: a value that exists in a source and has not been read yet. Renders as the
      // open dot with "Not yet modelled" (DESIGN.md §6).
      incompleteReason: {
        kind: 'pending',
        note: 'the damage is stated in description prose that has not been read yet',
      },
    },
    {
      index: 5,
      stepId: 's5',
      sourceLabel: 'Basic attack',
      icon: null,
      instanceType: 'basic-attack',
      damageType: 'physical',
      raw: 195,
      afterResistances: 158,
      afterReductions: 150,
      final: 150,
      crit: false,
      stateSnapshot: { conquerorStacks: 12, blackCleaverStacks: 2 },
      verification: 'verified',
    },
  ],
  // Instance 4 contributes 0, so the total does not move across it (620 -> 620).
  runningTotal: [240, 420, 620, 620, 770],
  burst: {
    total: 770,
    byType: { physical: 570, magic: 200, true: 0 },
  },
  dot: {
    total: 160,
    byType: { physical: 0, magic: 160, true: 0 },
    sources: [
      {
        label: "Sunfire Aegis (burn)",
        icon: '3068.png',
        damageType: 'magic',
        total: 160,
        verification: 'derived',
      },
    ],
  },
  verdict: {
    // BURST SURVIVES, BURST PLUS DAMAGE-OVER-TIME KILLS. That is deliberate and is now the
    // canonical case: it is the only combination that exercises the second, dashed lethal rule
    // DESIGN.md §7 specifies, and it makes the two-verdict requirement of §3.8 visibly do
    // something rather than print the same word twice.
    burstOnly: {
      defenderHp: 800,
      damageApplied: 770,
      lethal: false,
      lethalAtInstance: null,
      remainingHp: 30,
    },
    burstPlusDot: {
      defenderHp: 800,
      damageApplied: 930,
      lethal: true,
      lethalAtInstance: null,
      remainingHp: 0,
    },
  },
  excludedMechanics: [
    'Crowd control durations and mechanics',
    'Map-based and season-specific effects',
    'Elapsed time, cast times, and animation windows',
    'Defender counterplay — the target does not act',
  ],
  verificationSummary: 'incomplete',
  /**
   * Both kinds are present ON PURPOSE. The mock is the one canonical Result every interface
   * component is built and tested against, so it has to exercise the distinction DESIGN.md §6
   * draws — otherwise the struck-through `⊘` would have no data behind it and would ship
   * untested. The permanent entry is the real shape of the 23 unreachable ones: a ratio whose
   * owner the source never states.
   */
  incompleteContributors: [
    {
      sourceLabel: 'On-hit — true damage (mock)',
      reason: {
        kind: 'pending',
        note: 'the damage is stated in description prose that has not been read yet',
      },
    },
    {
      sourceLabel: 'W — Seismic Shard (mock)',
      reason: {
        kind: 'permanent',
        missingFacts: [
          {
            field: 'components[0].ratios[0].owner (armor)',
            why: 'the source states the ability scales with armor and never says whose; a person reading the page is guessing exactly as a parser would',
          },
        ],
      },
    },
  ],
};
