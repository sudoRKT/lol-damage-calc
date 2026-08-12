// Expanding a Scaling into concrete values.
//
// This is the single point at which the wiki's progression shorthand becomes numbers, and it
// is deliberately the ONLY one. The engine imports it rather than reimplementing it, for the
// same reason the project reads the wiki's rule instead of inventing one: two implementations
// of an interpolation rule are two chances to disagree.
//
// THE RULE, AND WHERE IT COMES FROM.
// `Module:Ability progression` on wiki.leagueoflegends.com expands both `{{ap|…}}` (per
// ability rank) and `{{pp|…}}` (per champion level) through one shared helper,
// `string_to_formula`, which rewrites `X to Y` as:
//
//     value(x) = (X) + ((Y) - (X)) / (times - 1) * (x - 1)
//
// `ap` walks ranks; `pp` walks levels. Same arithmetic, different axis. Read from the module
// source on 2026-08-12 via:
//   https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions
//     &titles=Module:Ability%20progression&rvslots=main&rvprop=content&format=json&formatversion=2
//
// A middle value is NEVER guessed. Either the source gives `X to Y` (apply the rule above) or
// it gives an explicit list (use it verbatim). DATA-SOURCES §11.
//
// LEAD-owned.

import type { Scaling } from './data.ts';

/** Thrown when a Scaling is structurally impossible to expand. The validator turns these into
 *  reported failures rather than letting a bad entry reach the engine. */
export class ScalingError extends Error {}

/**
 * The documented linear interpolation, extracted so both axes provably share it.
 * `steps` is the number of distinct values (`times` in the wiki source); `index` is 1-based.
 */
export function interpolate(from: number, to: number, steps: number, index: number): number {
  if (steps < 1) throw new ScalingError(`steps must be >= 1, got ${steps}`);
  if (steps === 1) return from;
  return from + ((to - from) / (steps - 1)) * (index - 1);
}

/**
 * Values of a rank-scaled Scaling, one per rank, in rank order.
 * Throws for a level-scaled Scaling — callers must use `valueAtLevel` for those.
 */
export function expandByRank(s: Scaling, maxRank: number): number[] {
  switch (s.scaling) {
    case 'linear': {
      if (maxRank < 1) throw new ScalingError(`maxRank must be >= 1, got ${maxRank}`);
      return Array.from({ length: maxRank }, (_, i) => interpolate(s.from, s.to, maxRank, i + 1));
    }
    case 'explicit': {
      if (s.perRank.length !== maxRank) {
        throw new ScalingError(
          `explicit scaling has ${s.perRank.length} values but the ability has ${maxRank} ranks`,
        );
      }
      return [...s.perRank];
    }
    case 'byLevel':
    case 'byLevelExplicit':
      throw new ScalingError(
        `'${s.scaling}' scales with champion level, not ability rank — use valueAtLevel`,
      );
  }
}

/** True when this Scaling is indexed by champion level rather than ability rank. */
export function isLevelScaled(s: Scaling): boolean {
  return s.scaling === 'byLevel' || s.scaling === 'byLevelExplicit';
}

/**
 * The (level, value) breakpoints of a level-scaled Scaling, in ascending level order.
 * For `byLevel`, breakpoint levels are themselves interpolated across `atLevels` — this is
 * how the wiki places them (Caitlyn Headshot `60 to 100 for 3` over levels `1 to 13` sits at
 * levels 1, 7, 13).
 */
export function levelBreakpoints(s: Scaling): Array<{ level: number; value: number }> {
  if (s.scaling === 'byLevelExplicit') {
    if (s.values.length !== s.atLevels.length) {
      throw new ScalingError(
        `byLevelExplicit has ${s.values.length} values but ${s.atLevels.length} levels`,
      );
    }
    return s.values.map((value, i) => ({ level: s.atLevels[i]!, value }));
  }
  if (s.scaling === 'byLevel') {
    const [first, last] = s.atLevels;
    return Array.from({ length: s.steps }, (_, i) => ({
      level: interpolate(first, last, s.steps, i + 1),
      value: interpolate(s.from, s.to, s.steps, i + 1),
    }));
  }
  throw new ScalingError(`'${s.scaling}' is rank-scaled — use expandByRank`);
}

/**
 * Value of a level-scaled Scaling at a given champion level: the value of the highest
 * breakpoint at or below that level. Below the first breakpoint, the first value applies.
 */
export function valueAtLevel(s: Scaling, level: number): number {
  const points = levelBreakpoints(s);
  let value = points[0]!.value;
  for (const p of points) {
    if (level >= p.level) value = p.value;
    else break;
  }
  return value;
}

/** Value of any Scaling given both indices. Rank-scaled reads `rank`; level-scaled reads
 *  `level`. Having one entry point keeps callers from having to branch on the arm. */
export function valueAt(s: Scaling, opts: { rank: number; maxRank: number; level: number }): number {
  if (isLevelScaled(s)) return valueAtLevel(s, opts.level);
  const values = expandByRank(s, opts.maxRank);
  const v = values[opts.rank - 1];
  if (v === undefined) throw new ScalingError(`rank ${opts.rank} is outside 1..${opts.maxRank}`);
  return v;
}
