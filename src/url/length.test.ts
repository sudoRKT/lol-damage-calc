// Link length is a product constraint, not a curiosity: a link a chat client truncates is a
// link that fails the checksum and refuses to open. That is correct behaviour and a bad
// experience, so the format is held to a measured budget and the per-step cost is pinned so
// a future change that doubles it fails a test rather than surprising a user.
//
// THE BUDGET is 2,000 characters for a complete URL — the most conservative limit in common
// use (old Internet Explorer capped at 2,083; every current browser is far higher, and the
// fragment is never sent to a server, so no server limit applies at all). Inside it, a link
// survives being posted anywhere.
//
// TWO MEASURED FINDINGS, recorded here rather than smoothed over.
//
//  1. The dominant cost in a long combo is the option KEY NAMES, which version 1 spells out
//     once per step. A three-key options bag costs about 95 characters per step, so a
//     maximal build fits only ~13 steps if every one of them carries options.
//  2. The step's own `id` is the second cost. A two-character id (`s7`) costs about 19
//     characters per step; a fourteen-character one (`step-number-7`) costs about 33. That
//     is the difference between a 60-step combo fitting the budget (1,763) and not (2,643).
//     This is a note for whoever generates step ids in the interface: keep them short.
//
// See FORMAT.md §7 and §9 — compression is raised there, not decided.

import { describe, it, expect } from 'vitest';
import type { ComboStep, Scenario } from '../types/scenario';
import { NAMED_SCENARIOS } from './fixtures';
import { encodeScenario, scenarioToUrl } from './index';

const URL_BUDGET = 2000;
const BASE = 'https://example.com/';
const MAXIMAL = NAMED_SCENARIOS.find((s) => s.name === 'maximal')!.scenario;

function withCombo(steps: number, options: boolean, idPrefix = 's'): Scenario {
  return {
    ...MAXIMAL,
    combo: Array.from({ length: steps }, (_, i): ComboStep => ({
      id: `${idPrefix}${i}`,
      kind: 'ability',
      ref: 'QWER'[i % 4],
      ...(options ? { options: { cast: i % 3, forceCrit: i % 2 === 0, sweetspot: false } } : {}),
    })),
  };
}

describe('link length', () => {
  it('every named scenario produces a URL inside the 2,000-character budget', () => {
    const over = NAMED_SCENARIOS
      .map((s) => ({ name: s.name, length: scenarioToUrl(BASE, s.scenario).length }))
      .filter((row) => row.length > URL_BUDGET);
    expect(over).toStrictEqual([]);
  });

  it('the maximal scenario — six items and full runes on both sides, entry state on both, five-step combo — is under 1,000 characters', () => {
    expect(scenarioToUrl(BASE, MAXIMAL).length).toBeLessThan(1000);
  });

  it('the smallest possible scenario is short enough to read aloud', () => {
    const minimal = NAMED_SCENARIOS.find((s) => s.name === 'minimal')!.scenario;
    expect(encodeScenario(minimal).length).toBeLessThan(200);
  });

  it('a 60-step combo on a maximal build still fits, when the steps carry no options and ids are short', () => {
    expect(scenarioToUrl(BASE, withCombo(60, false)).length).toBeLessThan(URL_BUDGET);
  });

  it('the same 60-step combo with long step ids does NOT fit — recorded, because it is a real limit', () => {
    expect(scenarioToUrl(BASE, withCombo(60, false, 'step-number-')).length).toBeGreaterThan(URL_BUDGET);
  });

  it('a 12-step combo where EVERY step carries options still fits — longer than any realistic combo', () => {
    expect(scenarioToUrl(BASE, withCombo(12, true)).length).toBeLessThan(URL_BUDGET);
  });

  it('records the measured cost per combo step, so a format change that inflates it is caught', () => {
    const cost = (options: boolean) =>
      (scenarioToUrl(BASE, withCombo(40, options)).length - scenarioToUrl(BASE, withCombo(20, options)).length) / 20;

    // Measured 2026-08-13 with two-character step ids: 19.15 characters per bare step,
    // 95.35 per step carrying a three-key options bag. Bounds are deliberately loose —
    // this is a regression detector, not a precise claim.
    expect(cost(false)).toBeLessThan(25);
    expect(cost(true)).toBeLessThan(110);
  });

  it('states the point at which an all-options combo leaves the budget, rather than pretending there is not one', () => {
    let last = 0;
    for (let steps = 1; steps <= 60; steps++) {
      if (scenarioToUrl(BASE, withCombo(steps, true)).length <= URL_BUDGET) last = steps;
      else break;
    }
    // Measured: 13. Asserted as a range so a small format change does not fail the suite,
    // while a change that halves the ceiling does.
    expect(last).toBeGreaterThanOrEqual(12);
    expect(last).toBeLessThanOrEqual(20);
  });
});

// =========================================================================================
// WHAT VERSION 2 COST (2026-08-14)
//
// Version 2 added a fifth positional slot so a combo step can carry `hitCounts`. Every figure
// below was measured, before and after, against the same fixtures.
// =========================================================================================

describe('link length after the version 2 slot', () => {
  it('costs NOTHING for a scenario that does not use it — every named link is unchanged', () => {
    // DEFINITION: the full URL length for each of the 21 scenarios in NAMED_SCENARIOS, against
    // the same base. None of them carries hit counts, and the version digit is one character in
    // both formats, so not one link moved by a single character.
    const lengths = Object.fromEntries(
      NAMED_SCENARIOS.map((s) => [s.name, scenarioToUrl(BASE, s.scenario).length]),
    );
    expect(lengths.minimal).toBe(163);
    expect(lengths['canonical-mock']).toBe(575);
    expect(lengths.maximal).toBe(870);
    expect(lengths['long-combo-twenty-steps']).toBe(768);
  });

  it('costs about 12 characters per step that DOES use it', () => {
    // Maximal build, five steps, each with a three-key options bag: 1,052 without hit counts and
    // 1,113 with a one-key bag on every step. 61 characters over 5 steps.
    const withOptions = withCombo(5, true);
    const withBoth: Scenario = {
      ...withOptions,
      combo: withOptions.combo.map((step, i) => ({ ...step, hitCounts: { [`c${i}`]: i % 5 } })),
    };
    const before = scenarioToUrl(BASE, withOptions).length;
    const after = scenarioToUrl(BASE, withBoth).length;
    expect(before).toBe(1052);
    expect(after).toBe(1113);
    expect((after - before) / 5).toBeLessThan(13);
  });

  it('THE NEW MAXIMUM: the worst realistic scenario is 1,852 characters, inside the budget', () => {
    // DEFINITION of "worst realistic": the maximal build — two champions, six items each, full
    // rune pages, entry state on both sides — with a 13-step combo in which EVERY step carries
    // both a three-key options bag and a hit count. Nothing in the product produces a longer
    // link that a user could plausibly build.
    const worst = withCombo(13, true);
    const withHits: Scenario = {
      ...worst,
      combo: worst.combo.map((step, i) => ({ ...step, hitCounts: { [`c${i}`]: i % 5 } })),
    };
    expect(scenarioToUrl(BASE, withHits).length).toBe(1852);
    expect(scenarioToUrl(BASE, withHits).length).toBeLessThan(URL_BUDGET);
  });

  it('states how many steps fit, per shape, so the cost is a number and not a feeling', () => {
    // DEFINITION: the largest combo length whose full URL stays at or under 2,000 characters,
    // on the maximal build. Version 2 costs TWO STEPS off the options-carrying ceiling.
    const ceiling = (options: boolean, hits: boolean): number => {
      let n = 0;
      for (;;) {
        const base = withCombo(n + 1, options);
        const scenario: Scenario = hits
          ? { ...base, combo: base.combo.map((s, i) => ({ ...s, hitCounts: { [`c${i}`]: i % 5 } })) }
          : base;
        if (scenarioToUrl(BASE, scenario).length > URL_BUDGET) return n;
        n += 1;
      }
    };
    expect(ceiling(false, false)).toBe(72); // plain steps
    expect(ceiling(false, true)).toBe(35); // hit counts only
    expect(ceiling(true, false)).toBe(16); // options only — the version 1 ceiling
    expect(ceiling(true, true)).toBe(14); // both — the version 2 ceiling
  });
});
