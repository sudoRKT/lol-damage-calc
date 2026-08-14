// What the product can honestly say about every ability in the game, counted from the published
// data. Shared by the landing page and the "how the numbers are checked" page, which is why it
// sits here rather than inside either of them.
export { summariseCoverage, coverageAddsUp, type Coverage, type CoverageEntry } from './coverage';
export { default as COVERAGE } from './coverage.json';

// What the calculator applies BESIDES ability damage — item effects, runes, the defender's own
// kit, and damage over time. Counted the same way and for the same reason: a capability claim
// typed as prose is unfalsifiable, and it goes stale in the direction that misleads.
export {
  summariseCapability,
  itemEffectsAddUp,
  burnsAddUp,
  statesAPerTickFigure,
  type Capability,
  type CapabilityInputs,
} from './capability';
export { default as CAPABILITY } from './capability.json';
