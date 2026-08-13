// THE VERTICAL SLICE'S CALCULATION — Lux against one defender, abilities only.
//
// WHAT THIS IS. The first end-to-end path in the project: stored ability data -> the engine's
// component evaluator -> resistances -> a number on screen. It exists to prove the pieces connect,
// not to be the product. It is deliberately small and it refuses far more than it computes.
//
// WHAT IT DOES NOT DO, and why each is absent rather than approximated:
//
//   • NO ITEMS, NO RUNES, NO STAT SHARDS. Ability power is typed in directly instead. That is a
//     STATED INPUT, not an assumption — the engine is told the figure rather than inventing one,
//     and the interface says what it stands in for. Nothing here derives a build.
//   • NO SEQUENTIAL STATE. SPECIFICATION §3.1 requires each instance to resolve against the state
//     the previous ones left. The engine has no combo runner yet, so every instance here resolves
//     against the SAME defender stats. No armor shred, no stacks, no Conqueror, no Bone Plating.
//     For Lux specifically nothing in her stored data mutates state, so the slice's numbers are
//     not wrong because of this — but the model is absent, and a champion who shreds would be.
//   • NO DAMAGE OVER TIME. Lux's stored entries carry none, and the separate-line requirement of
//     §3.8 is not implemented. The verdict shown is burst only, and says so.
//   • NO CRIT, NO EXECUTE, NO SHIELDS, NO HEALING, NO DAMAGE REDUCTION.
//   • NO PENETRATION. Those come from items and runes, which are out of scope.
//
// Every one of these is stated on screen. An honest "not yet modelled" is the point.

import type { AbilityComponent, CuratedAbility, DamageType } from '../../types/data';
import { evaluateComponent, unsupportedReasons } from '../../engine/component';
import { applyResistance } from '../../engine/resistances';
import { roundDamage } from '../../engine/rounding';
import { resolveBaseStats, type ChampionBaseStats } from '../../engine/champion-stats';

export interface SliceDefender {
  name: string;
  level: number;
  stats: ChampionBaseStats;
}

export interface SliceAttacker {
  level: number;
  /** Rank per slot. The passive has no rank and is always 1. */
  ranks: { Q: number; W: number; E: number; R: number };
  /**
   * Ability power, stated directly by the user.
   *
   * THIS IS NOT A MODELLED BUILD. Items, runes and stat shards are out of scope for the slice,
   * and this figure stands in for all of them. It is an INPUT, not an assumption: the engine is
   * told the number rather than inventing one, which is the same principle as entry state
   * (SPECIFICATION §3.3) — the user describes the situation. The interface labels it as such.
   */
  abilityPower: number;
}

/** One resolved instance in the combo, or a refusal with its reason. */
export interface SliceInstance {
  index: number;
  slot: string;
  abilityName: string;
  label: string;
  verification: CuratedAbility['verification'];
  /** Present when the engine produced a number. */
  damage?: {
    type: DamageType;
    raw: number;
    afterResistances: number;
    final: number;
    /** The base term and each ratio term, for the breakdown. */
    base: number;
    ratios: Array<{ stat: string; percent: number; statValue: number; contribution: number }>;
  };
  /** Present INSTEAD when the slice will not show a number. Never both. */
  refusal?: { why: string[] };
}

export interface SliceResult {
  instances: SliceInstance[];
  runningTotal: number[];
  burstTotal: number;
  defenderHp: number;
  lethal: boolean;
  lethalAtInstance: number | null;
  remainingHp: number;
  /** Abilities in the combo that contributed nothing, and why. Never silently dropped. */
  excluded: Array<{ label: string; why: string }>;
}

function rankFor(slot: string, ranks: SliceAttacker['ranks']): number {
  if (slot === 'P') return 1;
  return ranks[slot as 'Q' | 'W' | 'E' | 'R'];
}

/** Evaluate one combo step. Returns a number or a refusal — never a guess. */
export function evaluateStep(
  ability: CuratedAbility,
  attacker: SliceAttacker,
  defender: SliceDefender,
  index: number,
): SliceInstance {
  const base = {
    index,
    slot: ability.slot,
    abilityName: ability.abilityName,
    label: `${ability.slot} — ${ability.abilityName}`,
    verification: ability.verification,
  };

  // AN INCOMPLETE ABILITY CONTRIBUTES NO DAMAGE. SPECIFICATION §8 makes this the status's whole
  // meaning: a figure is absent rather than wrong.
  if (ability.verification === 'incomplete') {
    return { ...base, refusal: { why: ['this ability is marked incomplete, so it contributes no damage'] } };
  }
  if (ability.verification === 'no-damage') {
    return { ...base, refusal: { why: ['this ability deals no damage'] } };
  }

  const components = ability.components.filter((c) => c.relation?.kind !== 'alternativeTo');
  if (components.length === 0) {
    return { ...base, refusal: { why: ['no stored damage component'] } };
  }

  // The slice handles ONE additive component. Lux's abilities each have exactly one; anything
  // else is refused rather than summed on an assumption about how they combine.
  if (components.length > 1) {
    return {
      ...base,
      refusal: { why: [`${components.length} additive components — the slice resolves one, and will not assume how several combine`] },
    };
  }

  const component = components[0] as AbilityComponent;
  const reasons = unsupportedReasons(component);
  if (reasons.length > 0) return { ...base, refusal: { why: reasons } };

  const caster = {
    attackDamage: { base: 0, bonus: 0, total: 0 },
    abilityPower: attacker.abilityPower,
  };
  const evaluated = evaluateComponent(component, {
    rank: rankFor(ability.slot, attacker.ranks),
    maxRank: ability.maxRank,
    level: attacker.level,
    caster,
  });

  const d = resolveBaseStats(defender.stats, defender.level);
  // applyResistance takes the damage type itself and returns the raw value unchanged for true
  // damage, so the three types are handled in one place rather than branched here.
  const resistance = component.damageType === 'physical' ? d.armor : d.magicResist;
  const afterResistances = applyResistance(evaluated.raw, component.damageType, resistance);

  return {
    ...base,
    damage: {
      type: component.damageType,
      raw: evaluated.raw,
      afterResistances,
      final: roundDamage(afterResistances),
      base: evaluated.base,
      ratios: evaluated.ratios.map((r) => ({
        stat: r.stat,
        percent: r.percent,
        statValue: r.statValue,
        contribution: r.damage,
      })),
    },
  };
}

/** Run the combo in order and produce the verdict. */
export function computeSlice(
  abilities: CuratedAbility[],
  combo: string[],
  attacker: SliceAttacker,
  defender: SliceDefender,
): SliceResult {
  const instances: SliceInstance[] = [];
  const excluded: SliceResult['excluded'] = [];
  let running = 0;
  const runningTotal: number[] = [];

  combo.forEach((slot, i) => {
    const ability = abilities.find((a) => a.slot === slot);
    if (!ability) return;
    const instance = evaluateStep(ability, attacker, defender, i + 1);
    instances.push(instance);
    if (instance.damage) running += instance.damage.final;
    else excluded.push({ label: instance.label, why: instance.refusal?.why.join('; ') ?? 'unknown' });
    runningTotal.push(running);
  });

  const defenderHp = roundDamage(resolveBaseStats(defender.stats, defender.level).hp);
  const lethalIndex = runningTotal.findIndex((t) => t >= defenderHp);

  return {
    instances,
    runningTotal,
    burstTotal: running,
    defenderHp,
    lethal: lethalIndex >= 0,
    lethalAtInstance: lethalIndex >= 0 ? lethalIndex + 1 : null,
    remainingHp: Math.max(0, defenderHp - running),
    excluded,
  };
}
