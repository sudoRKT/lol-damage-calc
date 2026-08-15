// THE 7 ABILITIES THE VERSION 2 SLOT EXISTS FOR, ROUND-TRIPPED ON THEIR REAL IDENTIFIERS.
//
// ═══ WHY THIS FILE EXISTS BESIDE round-trip.test.ts ═══
//
// `round-trip.test.ts` already proves that a step carrying `hitCounts` survives a link. It does
// so on INVENTED component ids — `ziggs-e-mine`, `xayah-q-feather` — and neither string appears
// anywhere in the shipped data. Xayah is not even one of the seven. That is a fine test of the
// FORMAT and no evidence at all about the seven abilities SPECIFICATION §12 says must be
// shareable, because it never touches them.
//
// So this file takes the population from the data instead of from memory:
//   - it reads every component in `curated/curated-data.json` that carries `variableHits`,
//   - joins each champion to the apiname a scenario actually names, via `public/data/champions.json`,
//   - builds a scenario a user could really configure for each one, at the lowest and highest
//     count the source permits, and asserts it round-trips character-identically.
//
// READ-ONLY. This area writes nothing outside `src/url/`, and opens both files for reading only.
//
// ═══ IF THIS FILE GOES RED BECAUSE THE DATA CHANGED ═══
//
// An eighth ability gaining `variableHits`, or a component id being renamed, fails the first test
// below by design. That is not a URL defect — it is the notice that a newly variable-count ability
// has to be proved shareable before it ships, which is the whole point of pinning the population
// rather than a number.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../types/scenario';
import { NAMED_SCENARIOS } from './fixtures';
import { decodeScenario, encodeScenario, scenarioToUrl } from './index';

const CURATED = 'curated/curated-data.json';
const ROSTER = 'public/data/champions.json';
const URL_BUDGET = 2000;
const BASE = 'https://example.com/';

/**
 * THE SEVEN, named in DATA-SOURCES §46 and pinned here as champion + slot + component id.
 *
 * The component id is the KEY of `ComboStep.hitCounts`, so a rename that nobody told the
 * interface about would hand the count to a component that does not exist and silently produce
 * the minimum instead. That is why the id is pinned and not merely counted.
 */
const EXPECTED_POPULATION = [
  { champion: "Kai'Sa", slot: 'Q', component: 'physical-damage-per-missile', maxAdditional: 5 },
  { champion: 'Lulu', slot: 'Q', component: 'magic-damage', maxAdditional: 1 },
  { champion: 'Nautilus', slot: 'E', component: 'magic-damage', maxAdditional: 2 },
  { champion: 'Taliyah', slot: 'Q', component: 'magic-damage', maxAdditional: 4 },
  { champion: 'Yuumi', slot: 'R', component: 'magic-damage-per-hit', maxAdditional: 4 },
  { champion: 'Zac', slot: 'R', component: 'magic-damage-per-hit', maxAdditional: 3 },
  { champion: 'Ziggs', slot: 'E', component: 'magic-damage-per-mine', maxAdditional: 10 },
] as const;

interface CuratedComponent {
  id: string;
  variableHits?: { kind: string; maxAdditional?: number; maxInstances?: number };
}
interface CuratedAbilityRow {
  champion: string;
  slot: string;
  components?: CuratedComponent[];
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')) as T;
}

/** Every component in the shipped curated file that carries a variable hit count. */
function variableHitPopulation(): {
  champion: string;
  slot: string;
  component: string;
  kind: string;
  maxAdditional: number;
}[] {
  const curated = readJson<{ abilities: CuratedAbilityRow[] }>(CURATED);
  const found: ReturnType<typeof variableHitPopulation> = [];
  for (const ability of curated.abilities) {
    for (const component of ability.components ?? []) {
      if (!component.variableHits) continue;
      found.push({
        champion: ability.champion,
        slot: ability.slot,
        component: component.id,
        kind: component.variableHits.kind,
        maxAdditional:
          component.variableHits.maxAdditional ?? component.variableHits.maxInstances ?? 0,
      });
    }
  }
  return found.sort((a, b) => `${a.champion}${a.slot}`.localeCompare(`${b.champion}${b.slot}`));
}

const apinameOf = (() => {
  const roster = readJson<{ name: string; apiname: string }[]>(ROSTER);
  const byName = new Map(roster.map((c) => [c.name, c.apiname]));
  return (displayName: string): string | undefined => byName.get(displayName);
})();

/** A scenario a user could really configure: this champion, this ability, this many extra hits. */
function scenarioFor(apiname: string, slot: string, component: string, count: number): Scenario {
  const mock = NAMED_SCENARIOS.find((s) => s.name === 'canonical-mock')!.scenario;
  return {
    ...mock,
    attacker: { ...mock.attacker, apiname, abilityRanks: { Q: 5, W: 5, E: 5, R: 3 } },
    combo: [{ id: 's1', kind: 'ability', ref: slot, hitCounts: { [component]: count } }],
  };
}

describe('the 7 variable-hit abilities are shareable — the drift §44.3 found', () => {
  const population = variableHitPopulation();

  it('the population is exactly the 7 abilities version 2 was built for', () => {
    // DEFINITION: every component in curated/curated-data.json carrying `variableHits`, keyed by
    // champion, ability slot and component id. Measured, not recalled.
    expect(
      population.map((p) => ({
        champion: p.champion,
        slot: p.slot,
        component: p.component,
        maxAdditional: p.maxAdditional,
      })),
    ).toStrictEqual(
      [...EXPECTED_POPULATION]
        .map((p) => ({ ...p }))
        .sort((a, b) => `${a.champion}${a.slot}`.localeCompare(`${b.champion}${b.slot}`)),
    );
  });

  it('every one of them is a champion a scenario can name', () => {
    // The curated file keys abilities by DISPLAY name; a scenario carries the Data Dragon apiname.
    // Kai'Sa is the one that differs (`Kaisa`), and a scenario naming the display name would
    // decode perfectly and then resolve to no champion at all.
    const unjoinable = population.filter((p) => apinameOf(p.champion) === undefined);
    expect({ unjoinable: unjoinable.map((p) => p.champion) }).toStrictEqual({ unjoinable: [] });
  });

  it.each(EXPECTED_POPULATION.map((p) => [`${p.champion} ${p.slot}`, p] as const))(
    'round-trips at every count the source permits: %s',
    (label, entry) => {
      const apiname = apinameOf(entry.champion)!;
      // `repeatsAtReducedRate` counts ADDITIONAL instances beyond the first, 0..maxAdditional
      // (src/types/scenario.ts). Both ends and one in the middle, plus the absent case, which is
      // a DIFFERENT scenario meaning "the minimum" and must not decode as a count of 0.
      const counts = [0, Math.ceil(entry.maxAdditional / 2), entry.maxAdditional];
      for (const count of new Set(counts)) {
        const scenario = scenarioFor(apiname, entry.slot, entry.component, count);
        const decoded = decodeScenario(encodeScenario(scenario));
        expect({ label, count, ok: decoded.ok }).toStrictEqual({ label, count, ok: true });
        if (!decoded.ok) return;
        expect(decoded.scenario).toStrictEqual(scenario);
        expect(decoded.scenario.combo[0]!.hitCounts).toStrictEqual({ [entry.component]: count });
      }
    },
  );

  it('an ABSENT count stays absent — it means the minimum, not zero', () => {
    const apiname = apinameOf('Ziggs')!;
    const withCount = scenarioFor(apiname, 'E', 'magic-damage-per-mine', 0);
    const bare: Scenario = {
      ...withCount,
      combo: [{ id: 's1', kind: 'ability', ref: 'E' }],
    };
    const decoded = decodeScenario(encodeScenario(bare));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect('hitCounts' in decoded.scenario.combo[0]!).toBe(false);
    // And the two are not the same link, so nothing can conflate them.
    expect(encodeScenario(bare)).not.toBe(encodeScenario(withCount));
  });

  it('a full seven-ability combo — all 7 at once, at their maximum counts — fits the budget', () => {
    // The worst REAL scenario this defect class can produce: one combo naming every variable-hit
    // ability there is, each at the highest count its source permits.
    const mock = NAMED_SCENARIOS.find((s) => s.name === 'canonical-mock')!.scenario;
    const scenario: Scenario = {
      ...mock,
      combo: EXPECTED_POPULATION.map((entry, i) => ({
        id: `s${i}`,
        kind: 'ability' as const,
        ref: entry.slot,
        hitCounts: { [entry.component]: entry.maxAdditional },
      })),
    };
    const url = scenarioToUrl(BASE, scenario);
    // Printed so the figures in any report are quoted from a run rather than recalled.
    console.log(
      `[url] single-ability links: ` +
        EXPECTED_POPULATION.map((e) => {
          const one = scenarioFor(apinameOf(e.champion)!, e.slot, e.component, e.maxAdditional);
          return `${e.champion} ${e.slot}=${scenarioToUrl(BASE, one).length}`;
        }).join(', ') +
        `; all seven in one combo=${url.length} (budget ${URL_BUDGET}).`,
    );
    const decoded = decodeScenario(encodeScenario(scenario));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.scenario).toStrictEqual(scenario);
    // Measured 2026-08-15: 819 characters, against a 2,000 budget.
    expect(url.length).toBe(819);
    expect(url.length).toBeLessThan(URL_BUDGET);
  });
});

// =========================================================================================
// NEGATIVE ZERO IN A HIT COUNT — the one value slot 5 could still change silently.
//
// Everywhere else in this format a negative zero is REFUSED, because JSON writes it as `0` and
// the decoded scenario is therefore not the one that was shared (FORMAT.md §7, v1.ts
// `isCarriableNumber`). Version 2's hit-count check was written with `Number.isInteger` and
// `count < 0`, and -0 satisfies both — so it was the single value in the new slot that encoded
// happily and came back different. Found 2026-08-15 by reading the check against the rule the
// rest of the file follows; no user could plausibly produce it, and that is not the standard
// this format is held to.
// =========================================================================================

describe('a hit count is refused when a link cannot carry it unchanged', () => {
  const withCount = (count: number): Scenario => {
    const mock = NAMED_SCENARIOS.find((s) => s.name === 'canonical-mock')!.scenario;
    return {
      ...mock,
      combo: [{ id: 's1', kind: 'ability', ref: 'E', hitCounts: { 'magic-damage-per-mine': count } }],
    };
  };

  it('REFUSES a negative zero rather than turning it into a positive one', () => {
    expect(() => encodeScenario(withCount(-0))).toThrow(/negative zero/);
  });

  it('still carries a plain zero, which means the ability missed entirely', () => {
    const decoded = decodeScenario(encodeScenario(withCount(0)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(Object.is(decoded.scenario.combo[0]!.hitCounts!['magic-damage-per-mine'], 0)).toBe(true);
  });

  it('still refuses a fraction, a negative count and a non-number', () => {
    for (const bad of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => encodeScenario(withCount(bad))).toThrow(/whole number of hits|negative zero/);
    }
  });
});
