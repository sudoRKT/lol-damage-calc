// Execute thresholds (SPECIFICATION §3.7, "Execute thresholds").
//
// The specification does not state the rule, so it is taken from the League wiki's Kill
// article — the "Execute" section, which https://wiki.leagueoflegends.com/en-us/Execute
// redirects to. https://wiki.leagueoflegends.com/en-us/Kill, read 2026-08-12:
//   - "An execute is the process of killing a unit by dealing 100% of their current health
//      through the raw damage source type."
//   - "Most forms of executes only occur if the unit is below a specific health threshold."
//
// Two things follow, and one thing does not:
//   - The comparison is against CURRENT health, not maximum health.
//   - The wiki's wording is "below", so a target sitting exactly ON the threshold is not
//     executed. That is what is implemented.
//   - What the wiki does NOT settle is whether every individual ability agrees with that
//     strict reading at the exact boundary. The general article says "below"; per-ability
//     wording is not a game-wide rule. Treat any figure that turns on the exact-equality
//     boundary as `derived`, not `verified`, and record the per-ability wording in the
//     curated layer if one is ever found to differ.

/**
 * Is the target executed?
 *
 * @param currentHealth The target's health at this point in the combo.
 * @param threshold     The ability's execute threshold, in points of health.
 * @returns true only when current health is strictly BELOW the threshold.
 */
export function isExecuted(currentHealth: number, threshold: number): boolean {
  return currentHealth < threshold;
}

/**
 * Turn a "below X% of maximum health" execute into a threshold in points of health.
 *
 * @param maxHealth The target's maximum health.
 * @param fraction  The percentage as a fraction of 1 (15% is 0.15).
 */
export function healthThresholdFromMaxHealth(maxHealth: number, fraction: number): number {
  return maxHealth * fraction;
}
