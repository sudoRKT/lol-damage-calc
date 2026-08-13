// HAND-AUTHORED test fixtures for the engine's component model.
//
// NOTHING IN THIS FILE COMES FROM A DATA FILE. No champion, item or rune values are used
// anywhere in the engine's tests: not from `public/data/`, not from `/curated/`, not from
// Data Dragon. Every number below was chosen so that the arithmetic it exercises can be done
// by hand and written out in the test that uses it.
//
// Why that matters: a test whose expected value came out of the engine proves only that the
// engine is self-consistent. The rule on this project (CLAUDE.md, "The rule that matters
// most") is that an expected value is derived from the documented formula, by hand, and never
// from what the code returns.
//
// This file is deliberately NOT named *.test.ts, so vitest does not collect it as a suite.

import type { AbilityComponent, Ratio, Scaling } from '../types';
import type { CasterStats } from './component';

/**
 * A caster's attack damage and ability power, built by hand.
 *
 * `total` is base + bonus. Source: https://wiki.leagueoflegends.com/en-us/Attack_damage
 * (read 2026-08-13) — "Total attack damage refers to base plus bonus attack damage."
 * The frozen `StatBlock` (src/types/result.ts) carries all three figures, so the engine
 * never has to compute this in production; the helper does it here only so a fixture can
 * be written as three numbers instead of four.
 */
export function casterStats(opts: {
  baseAD?: number;
  bonusAD?: number;
  abilityPower?: number;
}): CasterStats {
  const base = opts.baseAD ?? 0;
  const bonus = opts.bonusAD ?? 0;
  return {
    attackDamage: { base, bonus, total: base + bonus },
    abilityPower: opts.abilityPower ?? 0,
  };
}

/** `X to Y` across the ability's ranks — the wiki's `{{ap|X to Y}}` shorthand. */
export function linear(from: number, to: number): Scaling {
  return { scaling: 'linear', from, to };
}

/** A value that does not change with rank, written the way the harvester stores it. */
export function flat(value: number): Scaling {
  return { scaling: 'linear', from: value, to: value };
}

/** A literal per-rank list, used verbatim (`explicit`). */
export function perRank(values: number[]): Scaling {
  return { scaling: 'explicit', perRank: values };
}

/**
 * One damage component, with the two required fields filled in and everything else optional.
 * `damageType` defaults to 'magic' ONLY because a fixture must state something; no test below
 * depends on that default, and the engine never defaults a damage type (DATA-SOURCES §30 fix 4).
 */
export function component(parts: Partial<AbilityComponent> & { base: Scaling }): AbilityComponent {
  return {
    id: parts.id ?? 'fixture-component',
    damageType: parts.damageType ?? 'magic',
    ratios: parts.ratios ?? [],
    ...parts,
  };
}

/** A ratio on one of the four caster-only stats: `stat` plus a magnitude in PERCENTAGE POINTS. */
export function ratio(stat: Ratio['stat'], magnitude: Scaling, extra: Partial<Ratio> = {}): Ratio {
  return { stat, ...magnitude, ...extra } as Ratio;
}
