// DATA DRAGON'S STAT KEYS, IN ENGLISH — and the rule for a key nobody has named.
//
// `Item.stats` is keyed the way Riot ships it: `FlatPhysicalDamageMod`, `PercentAttackSpeedMod`.
// Those strings are not English, and printing them at a user is the same failure as printing a
// filename at a screen reader. This is the one place they are turned into words.
//
// TWELVE KEYS, MEASURED — the whole of what the shipped 209-item pool contains, counted on
// 2026-08-14 (the same measurement the engine records in `ITEM_STAT_KEYS`):
//
//   FlatHPPoolMod 72 · FlatPhysicalDamageMod 66 · FlatMagicDamageMod 54 · FlatArmorMod 26 ·
//   PercentAttackSpeedMod 26 · FlatSpellBlockMod 22 · PercentMovementSpeedMod 20 ·
//   FlatCritChanceMod 16 · FlatMPPoolMod 15 · FlatMovementSpeedMod 15 · PercentLifeStealMod 7 ·
//   FlatHPRegenMod 2
//
// A KEY THIS FILE DOES NOT KNOW IS PRINTED RAW, NEVER GUESSED AND NEVER DROPPED. `stat-labels`
// has a companion check (`ItemPicker.test.tsx`) that reads all 209 items and fails naming any key
// with no label — so a patch adding a thirteenth key produces a red test, not a silent omission
// on screen. This is deliberately the same shape as the engine's own handling: it reports an
// unknown stat key on the result rather than dropping the stat.
//
// WHAT THIS FILE DOES NOT CLAIM. It says what an item GRANTS, never what the simulation APPLIES.
// Four of the twelve keys change no damage figure and the engine states so on every result
// (`SIMULATION_EXCLUSIONS`). Repeating that judgement here would be a second copy of a rule the
// engine owns, and two copies drift.

/** Plain-English name for each stat key, and whether its value is a percentage. */
const LABELS: Record<string, { label: string; percent?: boolean }> = {
  FlatHPPoolMod: { label: 'health' },
  FlatPhysicalDamageMod: { label: 'attack damage' },
  FlatMagicDamageMod: { label: 'ability power' },
  FlatArmorMod: { label: 'armor' },
  FlatSpellBlockMod: { label: 'magic resistance' },
  FlatMPPoolMod: { label: 'mana' },
  FlatCritChanceMod: { label: 'critical strike chance', percent: true },
  PercentAttackSpeedMod: { label: 'attack speed', percent: true },
  PercentMovementSpeedMod: { label: 'movement speed', percent: true },
  FlatMovementSpeedMod: { label: 'movement speed' },
  FlatHPRegenMod: { label: 'health regeneration' },
  PercentLifeStealMod: { label: 'life steal', percent: true },
};

/** Every key this file can name. Exported so a test can measure it against the real pool. */
export const KNOWN_STAT_KEYS: readonly string[] = Object.keys(LABELS);

/**
 * One stat grant in words, e.g. `60 ability power`, `35% attack speed`.
 *
 * A percentage key is stated as a percentage because that is what the number means: Data Dragon
 * writes 0.35 for 35% attack speed, and printing "0.35 attack speed" would be a different fact.
 * An unknown key is printed as its raw Data Dragon name beside its raw value — visibly
 * un-translated rather than quietly absent.
 */
export function statGrantText(key: string, value: number): string {
  const known = LABELS[key];
  if (!known) return `${round(value)} ${key}`;
  return known.percent ? `${round(value * 100)}% ${known.label}` : `${round(value)} ${known.label}`;
}

/** Every grant on one item, in the order the file lists them, joined for one text node. */
export function itemGrantsText(stats: Record<string, number>): string {
  const parts = Object.entries(stats).map(([k, v]) => statGrantText(k, v));
  return parts.length === 0 ? 'no statistics' : parts.join(', ');
}

/** Display rounding for a stat readout. Damage rounding happens once, in the engine. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
