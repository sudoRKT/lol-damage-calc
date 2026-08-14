// THE CURVE MODEL OVER THE REAL ROSTER, THE REAL DATA AND THE REAL ENGINE.
//
// `geometry.test.ts` proves the arithmetic against hand-built figures a person can check. This
// proves the same code survives what the engine actually produces — 173 champions, the published
// item pool, the real ability files — because the two failures a chart has are of different kinds:
//
//   • A WRONG PLACEMENT is caught by a known-answer test. That is the other file.
//   • A NON-FINITE OR OUT-OF-RANGE fraction is caught only by real data, because it comes from a
//     domain nobody predicted: a series where every burst is zero, a defender whose health is the
//     same at both ends of the axis, a range in which every point refused. Each of those divides by
//     something that can be zero, and each of them exists somewhere in this roster.
//
// A fraction outside 0–1 puts ink outside the frame the axis describes, and a NaN puts a
// `points="NaN,NaN"` attribute into the DOM, which draws nothing at all and reports nothing. Both
// are silent, which is why they are swept rather than spot-checked.
//
// SCOPE, STATED PLAINLY: this checks GEOMETRY, never a damage figure. Whether a number is right is
// the engine's own suite and the known-answer tests (CLAUDE.md).

import { describe, expect, it } from 'vitest';
import type { Champion, ChampionConfig, ComboStep, Scenario } from '../../types';
import { damageVsLevel, damageVsResistance, type SweepSeries } from '../../engine';
import { buildCatalogue, loadAbilities, loadItems } from '../data/catalogue';
import { loadRoster } from '../data/roster';
import { fetchPublished } from '../data/published-files';
import { buildCurveModel, polylinePoints } from './geometry';

const roster = await loadRoster(fetchPublished);
const items = await loadItems(fetchPublished);
const abilities = new Map(
  await Promise.all(
    roster.map(async (c) => {
      const file = await loadAbilities(c.apiname, fetchPublished);
      return [c.apiname, file?.abilities ?? []] as const;
    }),
  ),
);
const catalogue = buildCatalogue({ champions: roster, items, abilities });

const COMBO: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
];

/** Level 18 with every ability at the rank the roster records. Never a rank invented here. */
function maxed(champion: Champion): ChampionConfig {
  return {
    apiname: champion.apiname,
    level: 18,
    abilityRanks: {
      Q: champion.abilityMaxRanks.Q ?? 1,
      W: champion.abilityMaxRanks.W ?? 1,
      E: champion.abilityMaxRanks.E ?? 1,
      R: champion.abilityMaxRanks.R ?? 1,
    },
    items: [],
    runes: { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: {},
    entryState: {},
  };
}

const GAREN = roster.find((c) => c.apiname === 'Garen')!;

function scenarioFor(champion: Champion): Scenario {
  return {
    version: 2,
    attacker: maxed(champion),
    defender: { ...maxed(GAREN), apiname: 'Garen' },
    combo: COMBO,
  };
}

interface Measured {
  population: string;
  champion: string;
  kind: string;
  points: number;
  computed: number;
  refused: number;
  /** How many lines the model drew: burst, plus DoT where there is any, plus target health. */
  lines: number;
  drawn: number;
  badFractions: string[];
  badCoordinates: string[];
}

/** Every fraction the model produced, checked for finiteness and for staying inside the frame. */
function measure(
  population: string,
  champion: string,
  model: ReturnType<typeof buildCurveModel>,
): Measured {
  const bad: string[] = [];
  const badCoords: string[] = [];
  let drawn = 0;

  for (const line of model.lines) {
    for (const segment of line.segments) {
      drawn += segment.length;
      for (const point of segment) {
        for (const [axis, value] of [['x', point.x], ['y', point.y]] as const) {
          if (!Number.isFinite(value) || value < 0 || value > 1) {
            bad.push(`${champion} ${model.kind} ${line.kind} ${axis}=${value}`);
          }
        }
      }
      if (/NaN|Infinity|undefined/.test(polylinePoints(segment))) {
        badCoords.push(`${champion} ${model.kind} ${line.kind}`);
      }
    }
  }
  for (const tick of [...model.xTicks, ...model.yTicks]) {
    if (!Number.isFinite(tick.fraction) || tick.fraction < 0 || tick.fraction > 1) {
      bad.push(`${champion} ${model.kind} tick ${tick.label}=${tick.fraction}`);
    }
  }
  for (const mark of model.refused) {
    if (!Number.isFinite(mark.fraction) || mark.fraction < 0 || mark.fraction > 1) {
      bad.push(`${champion} ${model.kind} refused mark ${mark.label}=${mark.fraction}`);
    }
  }

  return {
    population,
    champion,
    kind: model.kind,
    points: model.computedCount + model.refusedCount,
    computed: model.computedCount,
    refused: model.refusedCount,
    lines: model.lines.length,
    drawn,
    badFractions: bad,
    badCoordinates: badCoords,
  };
}

/**
 * LEVELS 1–18 FOR EVERY CHAMPION, with the ranks held exactly as configured.
 *
 * `as-configured` is chosen deliberately over a levelling order: a level-18 build cannot exist at
 * level 3, so the engine REFUSES the early levels, and the population therefore contains real
 * refusals in real positions rather than a tidy continuous curve. The gap machinery is exercised by
 * the data instead of by a fixture.
 */
const levelRuns = roster.map((champion) => {
  const outcome = damageVsLevel(scenarioFor(champion), catalogue, {
    who: 'both',
    ranks: { kind: 'as-configured' },
  });
  return { champion, outcome };
});

/**
 * THE SAME 173 CHAMPIONS AGAIN, WITH A LEVELLING ORDER, because the population above turned out to
 * be almost entirely refusals — see the finding in the `as-configured` describe block below.
 *
 * `priority` spends one point per level in the stated order, so the build is legal at every level
 * and the curve is continuous from the level the combo's last ability is learned. It is the
 * population that actually exercises multi-point segments, and its leading refusals (the combo
 * casts R at level 1, where no champion has it) exercise a gap at the START of a range rather than
 * in the middle.
 */
const priorityRuns = roster.map((champion) => {
  const outcome = damageVsLevel(scenarioFor(champion), catalogue, {
    who: 'both',
    ranks: { kind: 'priority', order: ['Q', 'W', 'E'] },
  });
  return { champion, outcome };
});

const resistanceRuns = roster.map((champion) => {
  const outcome = damageVsResistance(scenarioFor(champion), catalogue, {
    axis: 'armor',
    from: 0,
    to: 300,
    step: 50,
  });
  return { champion, outcome };
});

/**
 * One run, reduced to what all three populations share.
 *
 * A level sweep and a resistance sweep describe what they were evaluated AT with different shapes
 * (`AppliedLevel` vs `AppliedResistances`), and the chart reads neither — which is exactly why
 * `DamageCurve` takes `SweepSeries<unknown>`. Normalising here is the same statement in the test.
 */
interface Run {
  champion: string;
  series: SweepSeries<unknown> | null;
}

function normalise(
  runs: ReadonlyArray<{
    champion: Champion;
    outcome: { ok: true; series: SweepSeries<unknown> } | { ok: false };
  }>,
): Run[] {
  return runs.map((r) => ({
    champion: r.champion.apiname,
    series: r.outcome.ok ? r.outcome.series : null,
  }));
}

/** The three populations, each measured separately so a count can be read against its own cause. */
const POPULATIONS = [
  { name: 'level/as-configured', runs: normalise(levelRuns), perSeries: 18 },
  { name: 'level/priority', runs: normalise(priorityRuns), perSeries: 18 },
  { name: 'resistance/armor 0–300 by 50', runs: normalise(resistanceRuns), perSeries: 7 },
] as const;

const measurements: Measured[] = POPULATIONS.flatMap((population) =>
  population.runs
    .filter((r): r is Run & { series: SweepSeries<unknown> } => r.series !== null)
    .map((r) => measure(population.name, r.champion, buildCurveModel(r.series))),
);

const of = (population: string) => measurements.filter((m) => m.population === population);
const sum = (rows: Measured[], key: 'points' | 'computed' | 'refused' | 'drawn') =>
  rows.reduce((n, m) => n + m[key], 0);

describe('curves/roster — the population this measures', () => {
  it('runs every champion in the published roster through all three sweeps', () => {
    expect(roster.length).toBeGreaterThan(150);
    for (const population of POPULATIONS) {
      expect(population.runs).toHaveLength(roster.length);
    }
  });

  it('produces a series for every champion — no sweep refused wholesale', () => {
    const refusedWholesale = POPULATIONS.flatMap((p) => p.runs).filter((r) => r.series === null);
    expect(refusedWholesale.map((r) => r.champion)).toEqual([]);
  });

  it('measures every point it said it would — it cannot pass by finding nothing to draw', () => {
    for (const population of POPULATIONS) {
      expect(sum(of(population.name), 'points')).toBe(roster.length * population.perSeries);
    }
    expect(sum(measurements, 'drawn')).toBeGreaterThan(0);
  });
});

describe('curves/roster — no fraction can put ink outside the frame', () => {
  it('every plotted coordinate is finite and inside 0–1', () => {
    expect(measurements.flatMap((m) => m.badFractions)).toEqual([]);
  });

  it('no polyline carries a NaN, an Infinity or an undefined coordinate', () => {
    expect(measurements.flatMap((m) => m.badCoordinates)).toEqual([]);
  });
});

describe('curves/roster — the drawn points are exactly the computed ones', () => {
  it('every line draws each computed point once, and no line draws a refused one', () => {
    // The number of drawn points must be the computed count multiplied by the number of lines.
    // A single interpolation across a refused point would show up here as a count that does not
    // divide, and a dropped point as one too few.
    const offenders = measurements
      .filter((m) => m.drawn !== m.computed * m.lines)
      .map((m) => `${m.population} ${m.champion}: drew ${m.drawn} across ${m.lines} lines for ${m.computed} computed`);
    expect(offenders).toEqual([]);
  });

  it('the population really does contain gaps — the segment machinery is not untested', () => {
    // Both level populations refuse levels the configured build cannot exist at, so a real curve
    // with a real hole in it is the normal case here rather than a fixture.
    expect(of('level/as-configured').every((m) => m.refused > 0)).toBe(true);
    expect(of('level/priority').every((m) => m.refused > 0)).toBe(true);
    expect(sum(of('resistance/armor 0–300 by 50'), 'refused')).toBe(0);
  });

  it('a levelling order is what makes the level curve a curve rather than a dot', () => {
    // MEASURED, AND IT IS A FINDING RATHER THAN A DETAIL. A maxed level-18 build costs all 18
    // skill points, so it exists at exactly ONE level and `as-configured` refuses the other 17:
    // 166 computed points across the whole roster, against 2,948 refusals. A page that offers
    // "damage versus level" without offering a levelling order shows the user a single dot and 17
    // refusals.
    //
    // AND THE ORDER ITSELF DECIDES MOST OF THE CURVE, which is the second half of the finding.
    // `allocateRanks` spends every point strictly by priority, so Q > W > E maxes Q and W before E
    // is learned at all — E arrives at level 13, and a combo that casts E refuses every level below
    // it. 1,039 computed against 2,075 refused: SIX levels per champion, not thirteen. The
    // levelling order is not a cosmetic default and the interface cannot pick one silently.
    const asConfigured = of('level/as-configured');
    const priority = of('level/priority');
    expect(sum(asConfigured, 'computed')).toBe(166);
    expect(sum(asConfigured, 'refused')).toBe(2948);
    expect(sum(priority, 'computed')).toBe(1039);
    expect(sum(priority, 'refused')).toBe(2075);
  });

  it('names the seven champions whose level curve is EMPTY, and why', () => {
    // Every one of these has ability ranks the default schedule does not describe: six-rank basics
    // (Aphelios, Jayce, Udyr, Yuumi's Q) or a four-rank ultimate (Elise, Karma, Nidalee). The
    // engine's own header names that exception and says such a champion needs its own
    // `RankSchedule` passed in — and nothing passes one, so the curve computes nothing at all.
    // Pinned here so it is a known, named gap rather than a mystery in the interface.
    const empty = of('level/as-configured')
      .filter((m) => m.computed === 0)
      .map((m) => m.champion)
      .sort();
    expect(empty).toEqual(['Aphelios', 'Elise', 'Jayce', 'Karma', 'Nidalee', 'Udyr', 'Yuumi']);
  });

  it('an empty series is drawable-false and draws nothing, rather than throwing', () => {
    const empty = of('level/as-configured').filter((m) => m.computed === 0);
    expect(empty.every((m) => m.drawn === 0)).toBe(true);
  });
});
