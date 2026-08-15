// ATTACKER SUSTAIN — life steal, omnivamp and spell vamp (SPECIFICATION §3.7).
//
// This file is the FORMULA LAYER for the three "vamp" stats: given a rate and the damage one
// instance actually dealt, how much health does the attacker regain? It holds no state, reads no
// data file and knows nothing about the sequence. `runCombo` calls it once per instance with that
// instance's post-mitigation figure, and `simulate` builds the rates from the attacker's items.
//
// ═══ THE THREE STATS ARE DIFFERENT MECHANICS, NOT THREE SETTINGS ═══
//
// They read different damage, so they are kept apart everywhere: in this file, on
// `SustainSource.kind`, and on the sustain line the user sees. Summing them into one "healing"
// figure would make it impossible to say which item earned it.
//
// ═══ SOURCES, ALL READ 2026-08-15 ═══
//
// https://wiki.leagueoflegends.com/en-us/Life_steal
//   "Life steal is a stat that grants healing equal to a percentage of the basic damage dealt.
//    It applies to basic attacks, including those that are modified (such as Siphoning Strike or
//    Spellblade), and abilities that are considered by the game engine to act as one (usually
//    those which trigger on-hit effects)."
//   "The healing is based on the post-mitigation damage dealt, meaning after sources of armor,
//    magic resistance, and damage reduction are taken into account."
//   Multiple sources "stack additively".
//
//   The same page, on item procs — this sentence is why the on-hit case below is an ADMITTED
//   GAP rather than a mechanic that does not exist:
//   "The damage of most item on-hit effects benefits from life steal, denoted by the icon."
//   It carries a section, "On-hit effects that benefit from life steal", listing them from a
//   per-item wiki tag (`OnHitAppliesLifeSteal`), and names exceptions that do NOT apply life
//   steal — starter items on-hit, Dead Man's Plate, and Titanic Hydra's active on its main
//   target. So membership is a per-item fact, not a rule.
//
//   And on damage type — life steal is NOT limited to physical damage, which is why the runner
//   feeds it one instance's whole post-mitigation figure rather than a per-type share:
//   "Generally speaking, all basic damage applies life steal by default, regardless of subtype".
//
// https://wiki.leagueoflegends.com/en-us/Omnivamp
//   "Omnivamp is a stat which grants healing equal to a percentage of the post-mitigation
//    physical damage, magic damage, and true damage dealt."
//   "Omnivamp is reduced to 33% effectiveness against minions and monsters with area of effect
//    damage, pet damage, or damage over time."  ← the defender here is ALWAYS a champion
//    (SPECIFICATION §5), so that reduction can never apply and is not implemented. If this engine
//    ever gains a non-champion target, this is the line to come back to.
//
// https://wiki.leagueoflegends.com/en-us/Spell_vamp — a REDIRECT to https://wiki.leagueoflegends.com/en-us/Vamp#Spell_vamp
//   Spell vamp is described there under "Trivia", in the list of stats that "do not currently
//   have any sources in the game, but are listed here for archival purposes":
//     "Spell Vamp (last source removed in V26.04)"
//     "Spell vamp is a stat which grants healing equal to a percentage of the post-mitigation
//      ability damage dealt. It stacks additively and does not benefit from heal and shield
//      power."
//   That archival definition states NO area-of-effect penalty, and the page's patch history
//   records V14.1 "Removed: No longer has healing penalties for area and pet damage, at 33%
//   effectiveness". So spell vamp is refused below for the plain reason that the game has no
//   source for it, NOT because its rate cannot be chosen.
//
//   CORRECTION, 2026-08-15: an earlier revision of this file cited "For area of effect and pet
//   damage, it is reduced to 33% effectiveness" as a live sentence about spell vamp. It is not
//   on the page — it survives only in a patch-history entry from the stat's introduction and in
//   a commented-out block — and the rule it describes was removed in V14.1. The refusal text a
//   user reads was wrong for that reason and is corrected below.

import type { InstanceType } from '../types/data';

/** Which of the three §3.7 attacker stats a figure came from. Matches `SustainSource.kind`. */
export type VampKind = 'lifesteal' | 'omnivamp' | 'spell-vamp';

/**
 * The attacker's vamp rates, as FRACTIONS: 0.15 is 15%.
 *
 * Each is the ADDITIVE SUM of every source the attacker carries, because all three wiki pages say
 * their stat stacks additively. Data Dragon states `PercentLifeStealMod` as a fraction already
 * (0.15 for Bloodthirster's 15%), so the unit here is the unit the catalogue supplies and nothing
 * converts between the two.
 *
 * An absent field means the attacker has none of that stat — NOT zero-because-we-did-not-look.
 * `simulate` sets only what a build actually provides.
 */
export interface AttackerVamp {
  lifesteal?: number;
  omnivamp?: number;
  spellVamp?: number;
}

/**
 * The instance types life steal heals from.
 *
 * `basic-attack` is the plain case. `empowered-attack` is in because the wiki's sentence names
 * modified basic attacks explicitly — "including those that are modified (such as Siphoning
 * Strike or Spellblade)" — and `empowered-attack` is this engine's name for that instance.
 *
 * WHAT IS DELIBERATELY OUT, AND IT IS AN UNDER-COUNT RATHER THAN AN OVER-COUNT:
 *   - `on-hit` — AND THIS ONE IS A REAL GAP, NOT A MECHANIC THAT DOES NOT EXIST. The wiki says
 *     plainly that "the damage of most item on-hit effects benefits from life steal", so in game
 *     an on-hit proc usually DOES heal. It is left out here because "most" is not "all": the
 *     wiki decides membership from a per-item tag and names items that are outside it, and no
 *     stored item record in this project carries that tag. Healing every on-hit instance would
 *     over-state the builds whose item is one of the exceptions, so nothing is healed, the
 *     figure is knowingly LOW, and the gap is disclosed on every result (SIMULATION_EXCLUSIONS
 *     in simulate.ts). Closing it needs one boolean per item from the pipeline, not a change
 *     here.
 *
 *     CORRECTION, 2026-08-15: this entry previously read "it does not say an item proc's damage
 *     is basic damage". The wiki does say so, in the sentence quoted above. The behaviour was
 *     right and the reason given for it was wrong.
 *   - `damaging-ability` — an ability is not basic damage. That is spell vamp's job, and spell
 *     vamp has no sources in the game (see below).
 *   - `item-active`, `non-damaging-ability`, `dot-application` — neither basic damage nor an
 *     ability acting as a basic attack.
 */
export const LIFESTEAL_INSTANCE_TYPES: readonly InstanceType[] = ['basic-attack', 'empowered-attack'];

/**
 * WHY SPELL VAMP IS REFUSED RATHER THAN RESOLVED.
 *
 * Because the game has no spell vamp in it. The wiki lists the stat under "archival purposes",
 * among the kinds of Vamp that "do not currently have any sources in the game", with its last
 * source removed in V26.04 (read 2026-08-15). No item, rune or kit effect can therefore state a
 * spell-vamp rate, so there is no rate for this engine to apply.
 *
 * The path is KEPT rather than deleted for two reasons. SPECIFICATION §3.7 names spell vamp among
 * the mechanics the engine resolves and `SustainSource.kind` carries it, so the shape has to
 * survive; and a caller can still hand `runCombo` a rate directly, in which case the honest
 * answer is this sentence rather than silence or a guessed figure.
 *
 * A refused source restores 0 and says this, exactly as a refused damage instance deals 0 and
 * says why (SPECIFICATION §8).
 */
export const SPELL_VAMP_REFUSAL: string =
  'spell vamp has no sources in the game — the wiki lists it for archival purposes only, among ' +
  'the kinds of Vamp that "do not currently have any sources", its last source having been ' +
  'removed in V26.04. A rate stated here cannot have come from any item, rune or kit, so it ' +
  'restores nothing rather than a figure no source supports';

/** One stat's contribution from one instance. `rate` is echoed so a label can state it. */
export interface VampContribution {
  kind: VampKind;
  rate: number;
  /** Health restored, UNROUNDED. Rounding happens once, at the totals (rounding.ts). */
  amount: number;
}

/**
 * How much health one instance restores to the attacker.
 *
 * `postMitigationDamage` is the damage the instance DEALT, after resistances and after damage
 * reduction, and BEFORE any shield absorbed part of it — that is what the life-steal page's
 * "post-mitigation damage dealt" means, since the shield article puts absorption after
 * mitigation. It must be the unrounded figure: a percentage taken from a rounded number
 * compounds error, and this engine rounds exactly once, at the reporting boundary.
 *
 * Returns one entry per stat that actually restored something, in a fixed order, so two runs of
 * the same scenario produce the same rows. A rate of 0, an absent rate, an instance the stat does
 * not heal from, and an instance that dealt nothing all produce NO entry rather than a zero one —
 * a zero row on the sustain line would read as "this healed you for nothing", which is a claim
 * about a mechanic that never fired.
 */
export function vampHealing(
  vamp: AttackerVamp,
  instanceType: InstanceType,
  postMitigationDamage: number,
): VampContribution[] {
  const out: VampContribution[] = [];
  if (postMitigationDamage <= 0) return out;

  const lifesteal = vamp.lifesteal ?? 0;
  if (lifesteal > 0 && LIFESTEAL_INSTANCE_TYPES.includes(instanceType)) {
    out.push({ kind: 'lifesteal', rate: lifesteal, amount: lifesteal * postMitigationDamage });
  }

  // OMNIVAMP HEALS FROM EVERY INSTANCE, because it heals from all damage dealt — physical, magic
  // and true alike. No instance type is filtered out here on purpose.
  const omnivamp = vamp.omnivamp ?? 0;
  if (omnivamp > 0) {
    out.push({ kind: 'omnivamp', rate: omnivamp, amount: omnivamp * postMitigationDamage });
  }

  // Spell vamp is never resolved here. See SPELL_VAMP_REFUSAL; `runCombo` reports it once, as a
  // refused source, rather than silently healing nothing.
  return out;
}

/** True when the plan states a spell-vamp rate at all — the trigger for the refusal line. */
export function statesSpellVamp(vamp: AttackerVamp | undefined): boolean {
  return (vamp?.spellVamp ?? 0) > 0;
}
