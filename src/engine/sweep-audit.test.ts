// Tests for the SWEEP DETECTORS.
//
// The standing rule on this project is that a detector PROPOSES and a person CONFIRMS
// (CLAUDE.md), so these checks are graded rather than binary:
//
//   'defect'    — violates an invariant taken straight from a documented formula, with no
//                 legitimate exception. §3.6: true damage bypasses both resistances, so a true
//                 damage figure cannot move when armor moves.
//   'candidate' — proposes something for a person to look at. A curve that rises with armor is
//                 almost always a bug and is NOT always one: an execute delivers the target's
//                 remaining health, so a combo that kills more slowly can deliver more of it.
//
// EVERY DETECTOR IS PROVED TO FIRE, not assumed to work. The violating series below are hand
// authored precisely because the engine does not produce them — a detector only tested against
// clean input has never been shown to detect anything.

import { describe, it, expect } from 'vitest';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario,
} from './fixtures';
import type { ResistanceSweepSeries } from './resistance-sweep';
import { auditLevelSeries, auditResistanceSeries, auditSweeps } from './sweep-audit';
import type { PointSummary, SweepPoint, SweepSeries } from './sweep';

// ---------------------------------------------------------------------------------------
// Hand-authored series, so a violation exists to be found
// ---------------------------------------------------------------------------------------

function summaryOf(byType: { physical: number; magic: number; true: number }, total?: number): PointSummary {
  const sum = byType.physical + byType.magic + byType.true;
  return {
    burst: { total: total ?? sum, byType },
    dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 } },
    verdict: {
      burstOnly: {
        lethal: false,
        lethalAtInstance: null,
        remainingHp: 0,
        damageApplied: sum,
        healingApplied: 0,
      },
      burstPlusDot: {
        lethal: false,
        lethalAtInstance: null,
        remainingHp: 0,
        damageApplied: sum,
        healingApplied: 0,
      },
    },
    attackerLevel: 1,
    defenderLevel: 1,
    defenderHp: 5000,
    verification: 'derived',
    partial: false,
    incompleteContributors: [],
  };
}

function armorPoint(
  x: number,
  byType: { physical: number; magic: number; true: number },
  total?: number,
): SweepPoint<{ armor: { total: number; base: number; bonus: number } }> {
  return {
    x,
    label: `${x} armor`,
    applied: { armor: { total: x, base: 0, bonus: x } },
    status: 'computed',
    summary: summaryOf(byType, total),
  };
}

function armorSeries(points: Array<SweepPoint<any>>, axisLabel = 'target armor'): ResistanceSweepSeries {
  return {
    kind: 'resistance',
    axisLabel,
    points,
    computedCount: points.filter((p) => p.status === 'computed').length,
    refusedCount: points.filter((p) => p.status === 'refused').length,
    anyPartial: false,
    incompleteEverywhere: [],
    incompleteSomewhere: [],
    incompleteSetVaries: false,
    excludedMechanics: [],
    notes: [],
  } as ResistanceSweepSeries;
}

// ---------------------------------------------------------------------------------------
// The defects
// ---------------------------------------------------------------------------------------

describe('auditResistanceSeries — true damage may not move with armor (§3.6)', () => {
  it('fires as a DEFECT when the true figure moves by more than a point', () => {
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 0, true: 50 }),
        armorPoint(100, { physical: 50, magic: 0, true: 25 }),
      ]),
    );
    const finding = findings.find((f) => f.kind === 'true-damage-moved');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('defect');
    expect(finding!.atX).toEqual([100]);
  });

  it('does NOT fire for a single point of movement, which is the documented apportionment', () => {
    // rounding.ts divides a rounded total among the types by largest remainder, so one type can
    // read a point higher when ANOTHER type changes. That is not a mechanic and not a defect.
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 0, true: 50 }),
        armorPoint(100, { physical: 50, magic: 0, true: 51 }),
      ]),
    );
    expect(findings.filter((f) => f.kind === 'true-damage-moved')).toEqual([]);
  });
});

describe('auditResistanceSeries — a type the axis does not touch may not move', () => {
  it('fires as a DEFECT when magic damage moves across an ARMOR sweep', () => {
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 200, true: 0 }),
        armorPoint(100, { physical: 50, magic: 150, true: 0 }),
      ]),
    );
    const finding = findings.find((f) => f.kind === 'untouched-type-moved');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('defect');
    expect(finding!.message).toMatch(/magic/);
  });

  it('does not fire on a "both" sweep, where every type is expected to move', () => {
    const findings = auditResistanceSeries(
      armorSeries(
        [
          {
            x: 0,
            label: '0',
            applied: {
              armor: { total: 0, base: 0, bonus: 0 },
              magicResist: { total: 0, base: 0, bonus: 0 },
            },
            status: 'computed',
            summary: summaryOf({ physical: 100, magic: 200, true: 0 }),
          },
          {
            x: 100,
            label: '100',
            applied: {
              armor: { total: 100, base: 0, bonus: 100 },
              magicResist: { total: 100, base: 0, bonus: 100 },
            },
            status: 'computed',
            summary: summaryOf({ physical: 50, magic: 100, true: 0 }),
          },
        ],
        'target armor and magic resistance',
      ),
    );
    expect(findings.filter((f) => f.kind === 'untouched-type-moved')).toEqual([]);
  });
});

describe('auditResistanceSeries — a per-type split must sum to its own total', () => {
  it('fires as a DEFECT when it does not', () => {
    const findings = auditResistanceSeries(
      armorSeries([armorPoint(0, { physical: 100, magic: 100, true: 0 }, 201)]),
    );
    const finding = findings.find((f) => f.kind === 'split-does-not-sum');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('defect');
  });
});

// ---------------------------------------------------------------------------------------
// The candidates
// ---------------------------------------------------------------------------------------

describe('auditResistanceSeries — damage that rises with resistance', () => {
  it('proposes it as a CANDIDATE rather than declaring a defect', () => {
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 0, true: 0 }),
        armorPoint(100, { physical: 120, magic: 0, true: 0 }),
      ]),
    );
    const finding = findings.find((f) => f.kind === 'non-monotonic-in-resistance');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('candidate');
    expect(finding!.message).toMatch(/execute/i);
  });

  it('says nothing about a curve that falls', () => {
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 0, true: 0 }),
        armorPoint(100, { physical: 50, magic: 0, true: 0 }),
        armorPoint(200, { physical: 33, magic: 0, true: 0 }),
      ]),
    );
    expect(findings).toEqual([]);
  });
});

describe('auditResistanceSeries — holes and changing content', () => {
  it('proposes a hole between two computed points', () => {
    const findings = auditResistanceSeries(
      armorSeries([
        armorPoint(0, { physical: 100, magic: 0, true: 0 }),
        {
          x: 50,
          label: '50 armor',
          applied: { armor: { total: 50, base: 0, bonus: 50 } },
          status: 'refused',
          refusals: [{ path: 'x', reason: 'hand-authored' }],
        },
        armorPoint(100, { physical: 50, magic: 0, true: 0 }),
      ]),
    );
    const finding = findings.find((f) => f.kind === 'hole-in-series');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('candidate');
    expect(finding!.atX).toEqual([50]);
  });

  it('proposes a curve whose excluded abilities are not the same at every point', () => {
    const series = armorSeries([
      armorPoint(0, { physical: 100, magic: 0, true: 0 }),
      armorPoint(100, { physical: 50, magic: 0, true: 0 }),
    ]);
    const varying: ResistanceSweepSeries = {
      ...series,
      incompleteEverywhere: [],
      incompleteSomewhere: ['R — Something'],
      incompleteSetVaries: true,
    };
    const finding = auditResistanceSeries(varying).find((f) => f.kind === 'incomplete-set-varies');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('candidate');
    expect(finding!.message).toMatch(/R — Something/);
  });

  it('proposes a series in which nothing computed at all', () => {
    const series = armorSeries([
      {
        x: 0,
        label: '0 armor',
        applied: { armor: { total: 0, base: 0, bonus: 0 } },
        status: 'refused',
        refusals: [{ path: 'x', reason: 'hand-authored' }],
      },
    ]);
    const finding = auditResistanceSeries(series).find((f) => f.kind === 'every-point-refused');
    expect(finding).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------
// The level detector
// ---------------------------------------------------------------------------------------

describe('auditLevelSeries — damage that falls as the ATTACKER levels', () => {
  function levelSeries(points: Array<SweepPoint<any>>): SweepSeries<any> {
    return { ...armorSeries(points), kind: 'level', axisLabel: 'attacker level' };
  }

  function levelPoint(level: number, total: number, ranks = { Q: 1, W: 0, E: 0, R: 0 }) {
    return {
      x: level,
      label: `attacker level ${level}`,
      applied: {
        attackerLevel: level,
        defenderLevel: 1,
        ranks,
        ranksDifferFromScenario: false,
      },
      status: 'computed' as const,
      summary: summaryOf({ physical: total, magic: 0, true: 0 }),
    };
  }

  it('proposes it as a CANDIDATE when no rank fell', () => {
    const findings = auditLevelSeries(levelSeries([levelPoint(1, 100), levelPoint(2, 90)]));
    const finding = findings.find((f) => f.kind === 'fell-with-attacker-level');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('candidate');
    expect(finding!.atX).toEqual([2]);
  });

  it('says nothing when the defender is levelling too', () => {
    const series = {
      ...levelSeries([levelPoint(1, 100), levelPoint(2, 90)]),
      axisLabel: 'both champions’ level',
    };
    expect(auditLevelSeries(series).filter((f) => f.kind === 'fell-with-attacker-level')).toEqual(
      [],
    );
  });

  it('says nothing when the fall follows a rank that fell', () => {
    const findings = auditLevelSeries(
      levelSeries([
        levelPoint(1, 100, { Q: 2, W: 0, E: 0, R: 0 }),
        levelPoint(2, 90, { Q: 1, W: 0, E: 0, R: 0 }),
      ]),
    );
    expect(findings.filter((f) => f.kind === 'fell-with-attacker-level')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// The runner, over a hand-authored catalogue
// ---------------------------------------------------------------------------------------

describe('auditSweeps — running every detector over a set of scenarios', () => {
  const ATTACKER = fixtureChampion({ apiname: 'Sweeper', adBase: 60, adPerLevel: 3 });
  const DEFENDER = fixtureChampion({
    apiname: 'Dummy',
    hpBase: 2000,
    hpPerLevel: 100,
    armorBase: 30,
    armorPerLevel: 4,
    magicResistBase: 32,
    magicResistPerLevel: 2,
  });
  const CATALOGUE = fixtureCatalogue({
    champions: [ATTACKER, DEFENDER],
    abilities: [
      fixtureAbility({
        champion: 'Sweeper',
        slot: 'Q',
        damageType: 'physical',
        perRank: [100, 150, 200, 250, 300],
      }),
      fixtureAbility({
        champion: 'Sweeper',
        slot: 'W',
        damageType: 'magic',
        perRank: [80, 120, 160, 200, 240],
      }),
    ],
  });

  const base = scenario({
    attacker: championConfig({
      apiname: 'Sweeper',
      level: 9,
      abilityRanks: { Q: 5, W: 4, E: 0, R: 0 },
    }),
    defender: championConfig({ apiname: 'Dummy', level: 9 }),
    combo: [
      comboStep('s0', { kind: 'ability', ref: 'Q' }),
      comboStep('s1', { kind: 'ability', ref: 'W' }),
      comboStep('s2', { kind: 'basic-attack', ref: 'basic' }),
    ],
  });

  const report = auditSweeps({
    catalogue: CATALOGUE,
    cases: [{ name: 'Sweeper QW-auto against Dummy', scenario: base }],
    resistance: { from: 0, to: 300, step: 25 },
    level: { who: 'attacker', ranks: { kind: 'priority', order: ['Q', 'W', 'E'] } },
  });

  it('runs the stated number of series and points', () => {
    // DEFINITION: 1 case x (3 resistance axes + 1 level axis) = 4 series;
    // 3 x 13 resistance points (0..300 step 25) + 18 levels = 57 points.
    expect(report.casesRun).toBe(1);
    expect(report.seriesRun).toBe(4);
    expect(report.pointsEvaluated).toBe(57);
  });

  it('finds no defect in the engine as it stands', () => {
    expect(report.defects).toEqual([]);
  });

  it('reports the candidates it did find, with the case named on each', () => {
    for (const finding of report.candidates) {
      expect(finding.case).toBe('Sweeper QW-auto against Dummy');
      expect(finding.series.length).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------------------
  // THE CHECK BEHIND A DEFECT THIS WORK FOUND (see unlearnedCasts in level-sweep.ts).
  //
  // simulate.ts resolves a combo step for an ability the attacker has 0 points in by clamping
  // the rank up to 1 — `rank: Math.max(1, rank)` — directly under a comment that says the
  // opposite: "A RANK OF ZERO IS A REAL STATE ... and the ability then deals nothing rather than
  // its rank 1 figure." So an impossible configuration silently returns a real-looking number.
  // The instance is not fixed here, because fixing one instance is not the job: this is the
  // check that finds every scenario it can happen in.
  // ---------------------------------------------------------------------------------------
  it('flags a scenario that casts an ability the build has no points in', () => {
    const impossible = scenario({
      attacker: championConfig({
        apiname: 'Sweeper',
        level: 6,
        abilityRanks: { Q: 3, W: 0, E: 0, R: 0 },
      }),
      defender: championConfig({ apiname: 'Dummy', level: 6 }),
      combo: [
        comboStep('s0', { kind: 'ability', ref: 'Q' }),
        comboStep('s1', { kind: 'ability', ref: 'W' }),
      ],
    });

    const found = auditSweeps({
      catalogue: CATALOGUE,
      cases: [{ name: 'casts an unlearned W', scenario: impossible }],
      resistance: { values: [0, 100] },
    });

    const finding = found.candidates.find((f) => f.kind === 'casts-unlearned-ability');
    expect(finding).toBeDefined();
    expect(finding!.message).toMatch(/W/);
    expect(finding!.series).toBe('scenario');
  });

  it('says nothing about a scenario whose combo only casts ranked abilities', () => {
    expect(report.candidates.filter((f) => f.kind === 'casts-unlearned-ability')).toEqual([]);
  });
});
