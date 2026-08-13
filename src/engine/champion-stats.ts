// A champion's base statistics at a given level.
//
// League's per-level growth is NOT linear. A stat at level n is:
//
//     base + growth * (n - 1) * (0.7025 + 0.0175 * (n - 1))
//
// Source: https://wiki.leagueoflegends.com/en-us/Champion_statistic (read 2026-08-13), which
// states this formula for every per-level statistic. The wiki also states the consequence that
// makes it self-checking: at level 18 the bracket evaluates to exactly 1, so a champion has
// precisely 17 growths' worth of the stat. `championStatAtLevel` is tested against that identity
// as well as against hand-computed intermediate levels.
//
// Getting this wrong is not a rounding difference. Treating growth as linear over-states every
// stat at every level between 2 and 17 — at level 10 it gives 9 growths where the game gives
// 7.74 — and a defender's health is the denominator of the survival verdict.

/** Per-level growth figures as the wiki's champion data module states them. */
export interface ChampionBaseStats {
  hp_base: number;
  hp_lvl: number;
  arm_base: number;
  arm_lvl: number;
  mr_base: number;
  mr_lvl: number;
  ad_base: number;
  ad_lvl: number;
}

/**
 * The growth multiplier at a champion level. Level 1 is 0 (a champion has its base stat and no
 * growth); level 18 is exactly 17.
 */
export function growthMultiplier(level: number): number {
  const n = level - 1;
  return n * (0.7025 + 0.0175 * n);
}

/** A statistic at a level, from its base and per-level growth. */
export function championStatAtLevel(base: number, perLevel: number, level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 18) {
    throw new RangeError(`champion level must be an integer 1..18, got ${level}`);
  }
  return base + perLevel * growthMultiplier(level);
}

/** The four statistics this slice needs, resolved at a level. */
export function resolveBaseStats(
  s: ChampionBaseStats,
  level: number,
): { hp: number; armor: number; magicResist: number; attackDamage: number } {
  return {
    hp: championStatAtLevel(s.hp_base, s.hp_lvl, level),
    armor: championStatAtLevel(s.arm_base, s.arm_lvl, level),
    magicResist: championStatAtLevel(s.mr_base, s.mr_lvl, level),
    attackDamage: championStatAtLevel(s.ad_base, s.ad_lvl, level),
  };
}
