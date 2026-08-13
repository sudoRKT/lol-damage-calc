// Internal barrel for the calculation engine's formula layer.
//
// These are the deterministic arithmetic primitives described in SPECIFICATION §3.6 and
// §3.7. The engine's PUBLIC entry point — simulate(scenario) -> Result — and the sequential
// combo runner are deliberately NOT defined here; that interface is the lead's to set.
//
// What is NOT in this layer, and why, is written up beside each item:
//   - Percentage *bonus* armor penetration (see resistances.ts) — needs a base/bonus armor
//     split the frozen StatBlock does not carry.
//   - A minimum damage floor (SPECIFICATION §3.7 lists one) — no game-wide rule for it
//     could be found in the wiki's damage or mechanics articles, so nothing is implemented
//     rather than guessing a plausible number. Raised to the lead.

export { roundDamage } from './rounding';

export {
  resistanceMultiplier,
  applyResistance,
  effectiveResistance,
  type ResistanceModifiers,
} from './resistances';

export {
  resolveAdaptiveForce,
  ADAPTIVE_BONUS_AD_PER_POINT,
  ADAPTIVE_AP_PER_POINT,
  type AdaptiveComparison,
  type AdaptiveResolution,
} from './adaptive';

export {
  BASE_CRITICAL_STRIKE_MULTIPLIER,
  criticalStrikeMultiplier,
  applyCriticalStrike,
  averageDamageWithCrit,
} from './crit';

export { isExecuted, healthThresholdFromMaxHealth } from './execute';

// The component model: one stored AbilityComponent -> one pre-mitigation damage figure.
// It resolves a flat base plus any number of caster-only ratios (base/bonus/total attack
// damage and ability power) on either the rank or the champion-level axis, and multiplies by
// the component's own hit count. Anything it cannot resolve it REFUSES; `unsupportedReasons`
// gives the same answer without throwing, so the exclusion can be counted across a data set.
export {
  evaluateComponent,
  evaluateComponents,
  unsupportedReasons,
  isCoreRatioStat,
  CORE_RATIO_STATS,
  ComponentEvaluationError,
  type CasterStats,
  type ComponentContext,
  type ComponentDamage,
  type CoreRatio,
  type CoreRatioStat,
  type RatioContribution,
} from './component';

// Per-level champion statistics. League's growth is not linear; the formula and the level-18
// identity it is checked against are documented in champion-stats.ts.
export {
  championStatAtLevel,
  growthMultiplier,
  resolveBaseStats,
  type ChampionBaseStats,
} from './champion-stats';
