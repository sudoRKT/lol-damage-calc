// THE ROSTER RUN THE ENGINE CANNOT DO FOR ITSELF.
//
// `auditSweeps` reads no data file, deliberately: the engine's rule is that champion, item and
// ability values arrive as arguments. Its own header says a caller OUTSIDE src/engine/ must build
// the catalogue and the case list, and that its counts mean nothing without the definition of
// that list. This is that caller.
//
// It lives in tests/ because it imports from two areas at once — the engine and the UI's
// catalogue loader — which is the one thing a file inside a partitioned area may not do.
//
// WITHOUT THIS FILE THE DETECTORS ARE UNTESTED AT SCALE. The engine agent built them, proved each
// one fails by breaking the engine on purpose, and ran them over 72 hand-authored cases. That
// establishes the detectors work; it establishes nothing about the 173 champions this product
// actually ships.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion, ComboStep, Item, Scenario } from '../src/types';
import { auditSweeps, simulate, type SweepAuditCase } from '../src/engine';
import { buildCatalogue } from '../src/ui/data/catalogue';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

const CHAMPIONS = read('public/data/champions.json') as Champion[];
const ITEMS = read('public/data/items.json') as Item[];
const ABILITIES = new Map<string, never>();
for (const file of readdirSync(join(REPO, 'public/data/abilities'))) {
  ABILITIES.set(file.replace(/\.json$/, ''), read(`public/data/abilities/${file}`).abilities);
}
const CATALOGUE = buildCatalogue({
  champions: CHAMPIONS,
  items: ITEMS,
  abilities: ABILITIES as never,
});

/** The combo every case runs. Held constant so a finding names the champion, not the combo. */
const COMBO: ComboStep[] = [
  { id: 'q', kind: 'ability', ref: 'Q' },
  { id: 'w', kind: 'ability', ref: 'W' },
  { id: 'e', kind: 'ability', ref: 'E' },
  { id: 'r', kind: 'ability', ref: 'R' },
  { id: 'a', kind: 'basic-attack', ref: 'basic' },
];

const config = (apiname: string, level: number) => ({
  apiname,
  level,
  abilityRanks: { Q: 1, W: 1, E: 1, R: 1 },
  items: [],
  runes: { keystone: null, primary: [], secondary: [], shards: [] },
  persistent: {},
  entryState: {},
});

const CASES: SweepAuditCase[] = CHAMPIONS.map((champion) => ({
  name: `${champion.apiname} vs Garen`,
  scenario: {
    version: 2,
    attacker: config(champion.apiname, 9),
    defender: config('Garen', 9),
    combo: COMBO,
  } as Scenario,
}));

describe('sweep-roster/population', () => {
  it('is looking at the whole roster — the run cannot pass by finding nothing', () => {
    expect(CASES).toHaveLength(173);
    expect(ABILITIES.size).toBe(173);
  });
});

describe('sweep-roster/every detector, over every champion', () => {
  // DEFINITION OF EVERY COUNT BELOW: 173 champions as attacker at level 9, ability ranks all 1,
  // no items and no runes, running P-less combo Q -> W -> E -> R -> basic attack against Garen at
  // level 9 with no items, on the published data for patch 16.16.1. Each champion is swept across
  // three resistance axes (armor, magic resistance, both) at 0-300 in steps of 50, and across all
  // 18 levels with ranks held as configured.
  const report = auditSweeps({
    catalogue: CATALOGUE,
    cases: CASES,
    resistance: { from: 0, to: 300, step: 50 },
    level: { who: 'attacker', ranks: { kind: 'as-configured' } },
  });

  it('reports what it actually measured, so the counts below mean something', () => {
    // Printed rather than asserted to a magic number: these are the definition of the run.
    console.log(
      `sweep-roster: ${report.casesRun} cases run, ${report.refusedCases.length} refused, ` +
        `${report.seriesRun} series, ${report.pointsEvaluated} points evaluated, ` +
        `${report.defects.length} defects, ${report.candidates.length} candidates`,
    );
    expect(report.casesRun).toBeGreaterThan(0);
    expect(report.pointsEvaluated).toBeGreaterThan(1000);
  });

  // ═══ FIVE FINDINGS, AND NONE OF THEM IS AN ENGINE DEFECT. INVESTIGATED, NOT WAVED THROUGH. ═══
  //
  // The first roster run produced five `defect`-severity findings that the engine agent's 72
  // hand-authored cases never produced. Each says a damage type moved along an axis that cannot
  // mitigate it — true damage falling as armor rises, physical moving as magic resistance rises.
  // Taken at face value each contradicts SPECIFICATION §3.6, which is why the detector grades
  // them `defect` rather than `candidate`.
  //
  // THE DETECTOR'S PREMISE IS TRUE ABOUT MITIGATION AND FALSE ABOUT THE SEQUENTIAL MODEL.
  // §3.1: "Each instance resolves against the state produced by all preceding instances." The
  // defender's HEALTH is part of that state. So an ability whose ratio reads a health pool is
  // coupled to every other damage type in the combo through that pool — mitigate the magic
  // damage and the target keeps more health, and a `currentHP` physical hit lands harder.
  //
  // Verified from the published ability data rather than argued:
  //   Garen R      true damage,     ratio missingHP  -> more armor, less physical, less missing
  //                                                     health, LESS true damage (145 -> 130)
  //   Xin Zhao R   physical damage, ratio currentHP  -> more MR, less magic, more current health,
  //                                                     MORE physical damage (212 -> 216)
  //   Viego Q      physical damage, ratio currentHP
  //   Camille      two health-pool ratios
  // All four flagged champions carry a health-pool ratio. Three controls that were NOT flagged —
  // Lux, Ahri, Annie — carry none between them.
  //
  // SO THE FIVE ARE PINNED BY NAME RATHER THAN ASSERTED TO ZERO. Asserting zero would be a lie;
  // deleting the detector would lose a real check; downgrading it to `candidate` in the engine is
  // a change to another area's file and is RAISED, not made. A sixth finding, or any change to
  // these five, fails here — which is what a known-drift pin is for.
  const EXPLAINED_BY_HEALTH_RATIOS = [
    'Camille vs Garen / target armor / untouched-type-moved',
    'Garen vs Garen / target armor / true-damage-moved',
    'Garen vs Garen / target armor and magic resistance / true-damage-moved',
    'Viego vs Garen / target magic resistance / untouched-type-moved',
    'XinZhao vs Garen / target magic resistance / untouched-type-moved',
  ];

  it('finds no defect this run cannot explain', () => {
    const named = report.defects.map((d) => `${d.case} / ${d.series} / ${d.kind}`).sort();
    expect(named).toEqual([...EXPLAINED_BY_HEALTH_RATIOS].sort());
  });

  it('and every one of them is a champion carrying a health-pool ratio', () => {
    // The mechanical form of the explanation above. If a future finding appears on a champion
    // with no health-pool ratio, this fails and the explanation does not cover it.
    const flagged = [...new Set(report.defects.map((d) => d.case.split(' vs ')[0]!))];
    for (const apiname of flagged) {
      const entries = ABILITIES.get(apiname) as unknown as Array<{
        components?: Array<{ ratios?: Array<{ stat?: string }> }>;
      }>;
      const pools = (entries ?? []).flatMap((a) =>
        (a.components ?? []).flatMap((c) => (c.ratios ?? []).map((r) => r.stat)),
      );
      expect(
        pools.some((s) => s === 'missingHP' || s === 'currentHP' || s === 'maxHP'),
        `${apiname} was flagged but carries no health-pool ratio`,
      ).toBe(true);
    }
  });

  it('reports its candidates by name rather than counting them', () => {
    // A candidate PROPOSES; a person confirms. Damage rising with resistance can be a legitimate
    // execute; a hole in a curve can be an honest refusal. They are printed so a reader can judge
    // them, and deliberately NOT asserted to zero — that would turn a proposal into a verdict,
    // which is the exact move CLAUDE.md forbids.
    for (const c of report.candidates.slice(0, 20)) {
      console.log(`sweep-roster candidate: ${c.case} / ${c.series}: ${c.detail}`);
    }
    expect(Array.isArray(report.candidates)).toBe(true);
  });
});

// =========================================================================================
// AN UNLEARNED ABILITY, ACROSS THE WHOLE ROSTER.
//
// The defect was found on one champion (Lux, R at rank 0, showing 217 magic damage identical to
// rank 1). CLAUDE.md's standing instruction is that the work is not to fix that instance but to
// write the check that finds every other instance of it. This is that check, at roster scale.
// =========================================================================================

describe('sweep-roster/no unlearned ability produces a damage figure', () => {
  // DEFINITION: 173 champions as attacker at level 9 against Garen at level 9, no items and no
  // runes, on published patch 16.16.1 data. For each champion, four runs — Q, W, E and R set to
  // rank 0 in turn while the other three stay at rank 1 — each casting only the zeroed slot.
  // 692 scenarios.
  const SLOTS = ['Q', 'W', 'E', 'R'] as const;

  const offenders: string[] = [];
  let scenariosRun = 0;
  let instancesChecked = 0;

  for (const champion of CHAMPIONS) {
    for (const slot of SLOTS) {
      const attacker = { ...config(champion.apiname, 9), abilityRanks: { Q: 1, W: 1, E: 1, R: 1, [slot]: 0 } };
      const sim = simulate(
        {
          version: 2,
          attacker,
          defender: config('Garen', 9),
          combo: [{ id: 's', kind: 'ability', ref: slot }],
        } as Scenario,
        CATALOGUE,
        { patch: '16.16.1' },
      );
      scenariosRun += 1;
      if (!sim.ok) continue; // a refusal is a different, and acceptable, answer
      for (const instance of sim.result.perInstance) {
        instancesChecked += 1;
        if (instance.verification === 'verified') {
          offenders.push(`${champion.apiname} ${slot}: marked verified at rank 0`);
        }
        if (sim.result.burst.total !== 0) {
          offenders.push(
            `${champion.apiname} ${slot}: burst ${sim.result.burst.total} at rank 0 (${instance.sourceLabel})`,
          );
        }
      }
    }
  }

  it('runs the whole roster — the check cannot pass by finding nothing', () => {
    console.log(
      `sweep-roster unlearned: ${scenariosRun} scenarios, ${instancesChecked} instances checked`,
    );
    expect(scenariosRun).toBe(CHAMPIONS.length * SLOTS.length);
    expect(instancesChecked).toBeGreaterThan(0);
  });

  it('NOT ONE champion deals damage from an ability at rank 0, and none is verified', () => {
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});

