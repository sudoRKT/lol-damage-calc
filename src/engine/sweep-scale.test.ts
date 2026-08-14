// THE SCALE RUN — every detector, over a grid of configurations, in one test.
//
// ═══ WHAT THIS IS AND WHAT IT IS NOT ═══
//
// Sweeping is the best bug-finder available to this engine, because it evaluates the same
// arithmetic hundreds of times with one input moving and then checks the shape of the answer
// against a documented formula. This test does that at the largest scale available to an engine
// session, and the scale is the point: a formula error that one scenario hides is very hard to
// hide across a grid.
//
// IT IS NOT A ROSTER RUN. The engine may not open a data file (CLAUDE.md's partition, and the
// engine role's "you never read or depend on a real data file"), so the champions below are
// hand-authored parameter combinations, not the 173 real ones. `auditSweeps` takes a `Catalogue`
// as an argument precisely so the same detectors can be run over the published roster by a caller
// that is allowed to read it — that run is a lead action and has not happened. Anything this test
// reports is a fact about the ENGINE's arithmetic; nothing here is a fact about any champion.
//
// ═══ THE COUNT, WITH ITS DEFINITION (CLAUDE.md: a count without a definition is not a count) ═══
//
//   attackers  6 = 3 base attack damage values x 2 growth values
//   defenders  3 = three resistance profiles (none / medium with growth / high)
//   combos     4 = Q · QW · QWE · QWE+basic attack, over a physical, a magic and a true ability
//   cases     72 = 6 x 3 x 4
//   series   288 = 72 cases x (3 resistance axes + 1 level axis)
//   points  4752 = 72 x (3 axes x 16 resistance values [0..300 step 20] + 18 levels)
//
// Every one of those points is one full run of the combo runner.

import { describe, it, expect } from 'vitest';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario,
} from './fixtures';
import { auditSweeps, type SweepAuditCase } from './sweep-audit';

const AD_BASES = [50, 65, 80];
const AD_GROWTHS = [2, 3.5];

const DEFENDER_PROFILES = [
  { apiname: 'DefNone', armorBase: 0, armorPerLevel: 0, magicResistBase: 0, magicResistPerLevel: 0 },
  { apiname: 'DefMid', armorBase: 30, armorPerLevel: 4, magicResistBase: 32, magicResistPerLevel: 2 },
  { apiname: 'DefHigh', armorBase: 60, armorPerLevel: 5, magicResistBase: 50, magicResistPerLevel: 0 },
];

const COMBOS: Array<Array<{ kind: 'ability' | 'basic-attack'; ref: string }>> = [
  [{ kind: 'ability', ref: 'Q' }],
  [
    { kind: 'ability', ref: 'Q' },
    { kind: 'ability', ref: 'W' },
  ],
  [
    { kind: 'ability', ref: 'Q' },
    { kind: 'ability', ref: 'W' },
    { kind: 'ability', ref: 'E' },
  ],
  [
    { kind: 'ability', ref: 'Q' },
    { kind: 'ability', ref: 'W' },
    { kind: 'ability', ref: 'E' },
    { kind: 'basic-attack', ref: 'basic' },
  ],
];

const champions = [
  ...AD_BASES.flatMap((adBase) =>
    AD_GROWTHS.map((adPerLevel) =>
      fixtureChampion({ apiname: `Atk${adBase}x${adPerLevel}`, adBase, adPerLevel, hpBase: 600 }),
    ),
  ),
  ...DEFENDER_PROFILES.map((profile) =>
    fixtureChampion({ ...profile, hpBase: 600, hpPerLevel: 100 }),
  ),
];

const abilities = champions.flatMap((champion) => [
  fixtureAbility({
    champion: champion.apiname,
    slot: 'Q',
    damageType: 'physical',
    perRank: [100, 150, 200, 250, 300],
  }),
  fixtureAbility({
    champion: champion.apiname,
    slot: 'W',
    damageType: 'magic',
    perRank: [80, 120, 160, 200, 240],
  }),
  fixtureAbility({
    champion: champion.apiname,
    slot: 'E',
    damageType: 'true',
    perRank: [40, 55, 70, 85, 100],
  }),
]);

const CATALOGUE = fixtureCatalogue({ champions, abilities });

const cases: SweepAuditCase[] = [];
for (const adBase of AD_BASES) {
  for (const adPerLevel of AD_GROWTHS) {
    for (const profile of DEFENDER_PROFILES) {
      COMBOS.forEach((combo, index) => {
        cases.push({
          name: `Atk${adBase}x${adPerLevel} vs ${profile.apiname}, combo ${index + 1}`,
          scenario: scenario({
            attacker: championConfig({
              apiname: `Atk${adBase}x${adPerLevel}`,
              level: 18,
              abilityRanks: { Q: 5, W: 5, E: 5, R: 0 },
            }),
            defender: championConfig({ apiname: profile.apiname, level: 18 }),
            combo: combo.map((step, i) => comboStep(`s${i}`, step)),
          }),
        });
      });
    }
  }
}

const report = auditSweeps({
  catalogue: CATALOGUE,
  cases,
  resistance: { from: 0, to: 300, step: 20 },
  level: { who: 'attacker', ranks: { kind: 'priority', order: ['Q', 'W', 'E'] } },
});

describe('the scale run', () => {
  it('ran the grid it says it ran', () => {
    expect(cases).toHaveLength(72);
    expect(report.casesRun).toBe(72);
    expect(report.refusedCases).toEqual([]);
    expect(report.seriesRun).toBe(288);
    expect(report.pointsEvaluated).toBe(4752);
  });

  it('finds no DEFECT — nothing violated a documented formula at any point', () => {
    // Printed in full on failure: a count alone would not say which invariant broke where.
    expect(report.defects.map((f) => `${f.case} / ${f.series}: ${f.message}`)).toEqual([]);
  });

  it('finds no CANDIDATE either — no curve rose with resistance or fell with level', () => {
    expect(report.candidates.map((f) => `${f.case} / ${f.series}: ${f.message}`)).toEqual([]);
  });
});
