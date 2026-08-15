// Property-style round-trip over a GENERATED population of scenarios.
//
// CLAUDE.md's standing rule: when a defect is found, the work is not to fix that one case,
// it is to write the check that finds every other instance of it. A hand-written fixture
// only ever proves something about the case someone thought of. This file therefore does not
// test named cases at all — it generates scenarios that roam the whole Scenario type and
// asserts the same single property over every one of them.
//
// THE POPULATION (stated, per CLAUDE.md's "a count without a definition is not a count"):
//   4,000 scenarios, produced by a fixed-seed pseudo-random generator that draws, for each
//   scenario independently:
//     - champion apinames from a pool including ASCII, non-ASCII and empty strings
//     - levels across the whole documented 1..18 range
//     - ability ranks 0..5 on each of Q/W/E/R
//     - item lists of length 0..6, WITH duplicates permitted
//     - keystone as null or an integer id (including 0)
//     - primary/secondary rune lists of length 0..4 and shard lists of length 0..3
//     - persistent maps of 0..4 entries, values integer / fractional / negative
//     - entryState maps of 0..4 entries, values integer / fractional / negative / true / false
//     - combos of length 0..12, every step drawing uniformly from all five kinds, each step
//       independently carrying no options, an empty options bag, or a nested options bag
//     - hit counts on about three steps in ten, 1..3 entries each, keyed by the REAL component
//       ids of the 7 abilities that carry `variableHits`, with values including 0 and -0
//   Nothing is filtered out: every scenario the generator produces is asserted on. The
//   generator is seeded, so a failure names a reproducible seed rather than a lucky draw.
//
// MEASURED AGAINST: every generated scenario either
//   (a) round-trips exactly — decode(encode(s)) deep-equal to s by toStrictEqual — or
//   (b) is REFUSED at encode with a stated reason, and the only reason permitted is
//       negative zero, which JSON writes as `0` and which the format therefore declines to
//       carry rather than change (FORMAT.md §7).
// Both arms are counted and both counts are asserted, so a refusal for any other reason
// fails the run rather than being absorbed as "well, it refused".
//
// The negative-zero arm is not a hypothetical: it was NOT hand-written, it was found by this
// generator on its first run, which is the entire argument for having it.

import { describe, it, expect } from 'vitest';
import type { ChampionConfig, ComboStep, ComboStepKind, Scenario } from '../types/scenario';
import { encodeScenario, decodeScenario, V1_STEP_KINDS } from './index';
import { V2 } from './v2';

const POPULATION_SIZE = 4000;

/** mulberry32 — a small, fixed, dependency-free PRNG. Seeded so failures are reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_POOL = ['Aatrox', 'Kaisa', "Kha'Zix", 'Nunu&Willump', '', 'Ünïcode', '日本語', 'A-B_C.D'];
const KEY_POOL = ['conquerorStacks', 'veigarStacks', 'bonePlating', 'a', 'ключ', 'plasma·stacks', '0', 'x y z'];
/** Real component ids from the 7 abilities that carry `variableHits`, plus two awkward strings. */
const COMPONENT_ID_POOL = [
  'physical-damage-per-missile',
  'magic-damage',
  'magic-damage-per-hit',
  'magic-damage-per-mine',
  '',
  'a·b',
];

function build(random: () => number): Scenario {
  const int = (max: number) => Math.floor(random() * (max + 1));
  const pick = <T>(pool: readonly T[]): T => pool[int(pool.length - 1)];

  const number = (): number => {
    switch (int(3)) {
      case 0: return int(999);
      case 1: return -int(999);
      case 2: return Math.round(random() * 10000) / 100;
      default: return 0;
    }
  };

  const champion = (): ChampionConfig => {
    const persistent: Record<string, number> = {};
    for (let i = 0; i < int(4); i++) persistent[pick(KEY_POOL)] = number();

    const entryState: Record<string, number | boolean> = {};
    for (let i = 0; i < int(4); i++) {
      entryState[pick(KEY_POOL)] = random() < 0.4 ? random() < 0.5 : number();
    }

    return {
      apiname: pick(NAME_POOL),
      level: 1 + int(17),
      abilityRanks: { Q: int(5), W: int(5), E: int(5), R: int(5) },
      items: Array.from({ length: int(6) }, () => 1000 + int(6999)),
      runes: {
        keystone: random() < 0.25 ? null : 8000 + int(500),
        primary: Array.from({ length: int(4) }, () => 9000 + int(500)),
        secondary: Array.from({ length: int(4) }, () => 5000 + int(500)),
        shards: Array.from({ length: int(3) }, () => pick(['adaptive', 'armor', 'health', ''])),
      },
      persistent,
      entryState,
    };
  };

  // HIT COUNTS ARE DRAWN TOO, since 2026-08-15. The generator predated version 2's fifth
  // positional slot, so 4,000 scenarios roamed the whole Scenario type EXCEPT the newest field —
  // and the one value that slot carried wrongly (a negative zero, which encoded and decoded back
  // as +0) was therefore invisible to the very check built to find that class of defect. The
  // draw includes -0 deliberately: it is the arm the refusal count below is measured on.
  const hitCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1 + int(2); i++) {
      // -0 is drawn at 1 in 100 rather than uniformly: often enough that the refusal arm fires
      // in every run, rare enough that the great majority of scenarios still exercise the ROUND
      // TRIP, which is what this population is for. A uniform draw refused 1,244 of 4,000.
      counts[pick(COMPONENT_ID_POOL)] = random() < 0.01 ? -0 : pick([0, 1, 2, 5, 10, int(99)]);
    }
    return counts;
  };

  const step = (index: number): ComboStep => {
    const base: ComboStep = {
      id: `s${index}-${int(9)}`,
      kind: pick(V1_STEP_KINDS) as ComboStepKind,
      ref: pick(['Q', 'W', 'E', 'R', 'basic', '3153', '', 'lich~bane']),
    };
    // Drawn independently of the options roll, so all four combinations occur: neither, options
    // only, hit counts only (the case that writes `null` into slot 4), and both.
    const hits = random() < 0.3 ? { hitCounts: hitCounts() } : {};
    const roll = int(2);
    if (roll === 0) return { ...base, ...hits };
    if (roll === 1) return { ...base, options: {}, ...hits };
    return {
      ...base,
      options: {
        cast: int(3),
        forceCrit: random() < 0.5,
        note: pick(['', 'sweetspot', '日本語']),
        nested: { list: [int(5), null, random() < 0.5], depth: { n: number() } },
        nothing: null,
      },
      ...hits,
    };
  };

  return {
    version: V2,
    attacker: champion(),
    defender: champion(),
    combo: Array.from({ length: int(12) }, (_, i) => step(i)),
  };
}

/** True when the scenario contains a negative zero anywhere the format refuses one. */
function containsNegativeZero(scenario: Scenario): boolean {
  const seen = (value: unknown): boolean => {
    if (Object.is(value, -0)) return true;
    if (Array.isArray(value)) return value.some(seen);
    if (typeof value === 'object' && value !== null) return Object.values(value).some(seen);
    return false;
  };
  return seen(scenario);
}

describe('property: every generated scenario round-trips identically', () => {
  it(`${POPULATION_SIZE} generated scenarios: exact round trip, or a refusal for negative zero and nothing else`, () => {
    const random = makeRandom(20260813);
    const failures: { index: number; why: string }[] = [];
    let roundTripped = 0;
    let refusedForNegativeZero = 0;
    // Counted so the newest field cannot quietly stop being generated: a future edit that dropped
    // hit counts from the draw would leave this at 0 and fail the assertion below, rather than
    // leaving 4,000 scenarios that all pass while testing nothing about slot 5.
    let carriedHitCounts = 0;

    for (let index = 0; index < POPULATION_SIZE; index++) {
      const scenario = build(random);
      const hasHitCounts = scenario.combo.some((step) => step.hitCounts !== undefined);
      let link: string;
      try {
        link = encodeScenario(scenario);
      } catch (error) {
        if (containsNegativeZero(scenario) && /negative zero|finite/.test((error as Error).message)) {
          refusedForNegativeZero++;
        } else {
          failures.push({ index, why: `encode refused: ${(error as Error).message}` });
        }
        continue;
      }
      const result = decodeScenario(link);
      if (!result.ok) {
        failures.push({ index, why: `decode failed: ${result.error.code} ${result.error.path ?? ''}` });
        continue;
      }
      try {
        expect(result.scenario).toStrictEqual(scenario);
        roundTripped++;
        if (hasHitCounts) carriedHitCounts++;
      } catch {
        failures.push({ index, why: 'decoded scenario differs from the original' });
      }
    }

    // Printed so the split is a figure quoted from a real run, not one recalled from memory.
    console.log(
      `[url] population ${POPULATION_SIZE}: ${roundTripped} round-tripped exactly ` +
        `(${carriedHitCounts} of them carrying hit counts), ` +
        `${refusedForNegativeZero} refused at encode for negative zero, ${failures.length} unexplained.`,
    );

    expect({
      population: POPULATION_SIZE,
      accountedFor: roundTripped + refusedForNegativeZero,
      negativeZeroArmExercised: refusedForNegativeZero > 0,
      hitCountsExercised: carriedHitCounts > POPULATION_SIZE / 10,
      failures: failures.length,
      first: failures.slice(0, 3),
    }).toStrictEqual({
      population: POPULATION_SIZE,
      accountedFor: POPULATION_SIZE,
      negativeZeroArmExercised: true,
      hitCountsExercised: true,
      failures: 0,
      first: [],
    });
  });

  it(`${POPULATION_SIZE} generated scenarios: no truncation of any link decodes to anything`, () => {
    // The same population, attacked. Truncation is the damage a real link actually suffers,
    // and a truncated base64 payload can still be readable — this is the check that no
    // prefix of any link in the population is quietly accepted.
    const random = makeRandom(20260813);
    let accepted = 0;
    let cutsTried = 0;

    for (let index = 0; index < POPULATION_SIZE; index++) {
      const scenario = build(random);
      if (containsNegativeZero(scenario)) continue; // refused at encode; nothing to truncate
      const link = encodeScenario(scenario);
      // Sample eight cut points per link rather than every one, to keep this test fast;
      // round-trip.test.ts cuts one link at every single position.
      for (let n = 1; n <= 8; n++) {
        const cut = Math.floor((link.length * n) / 9);
        if (cut < 1 || cut >= link.length) continue;
        cutsTried++;
        if (decodeScenario(link.slice(0, cut)).ok) accepted++;
      }
    }

    expect({ cutsTried: cutsTried > 0, accepted }).toStrictEqual({ cutsTried: true, accepted: 0 });
  });
});
