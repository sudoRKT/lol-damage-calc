// THE SEQUENCE STATE MODEL (SPECIFICATION §3.1 and §3.3).
//
// §3.1: "A combo is an ordered list of discrete instances. Each instance resolves against the
// state produced by all preceding instances, then mutates that state for those that follow."
//
// This file holds that state, and nothing else. It does no damage arithmetic, reads no data
// file, and never rounds.
//
// TWO CATEGORIES, MODELLED SEPARATELY — THIS IS THE POINT OF THE FILE
// ------------------------------------------------------------------
// §3.3 describes two kinds of entry state that behave differently, and says so explicitly:
//
//   PERSISTENT ACCUMULATIONS   "do not change during a combo … the value folds into the
//                               champion's stat block before the sequence begins."
//                               Veigar stacks, Nasus Q stacks, Cho'Gath Feast stacks.
//
//   COMBAT STATE               "seeded at entry and then mutated by the sequence."
//                               Conqueror stacks, Black Cleaver armor shred, Darius
//                               Hemorrhage stacks on the target.
//
// Collapsing them into one bag of counters is a real modelling error, so they are kept in two
// different objects with two different lifetimes, and the separation is STRUCTURAL rather than
// a convention:
//
//   - `PersistentState` is frozen at construction. Writing to it throws.
//   - `applyStateEffect` takes a `CombatState` and returns a `CombatState`. It is never given
//     the persistent half, so a state effect physically cannot reach it.
//
// A counter may legitimately appear in both — a game-long accumulation and an in-combat one
// with the same label — and the two are independent values. `state.test.ts` pins that.
//
// NO TIME (§3.2). Nothing in this file has a timestamp, a duration, or a decay. The only
// ordering fact it carries is `instancesResolved`, a count. SPECIFICATION §5 names the
// mechanic that needs it: Bone Plating "reduces damage from the first three instances an
// attacker delivers, resolves against the instance counter directly".

import type { ChampionConfig } from '../types/scenario';

/**
 * Accumulated resistance reduction on the defender, tracked PER SOURCE.
 *
 * Why per source rather than one running total: caps belong to the source, not to the
 * target. An item that shreds 4 armor per stack to a maximum of 24 must stop at 24 without
 * capping an unrelated ability's shred that is running alongside it. One shared total cannot
 * express that.
 *
 * Both maps hold POSITIVE MAGNITUDES, matching `ResistanceModifiers` in resistances.ts:
 * a 20-point reduction is 20, and a 30% reduction is 0.3.
 */
export interface ResistanceShred {
  /** Accumulated flat reduction, keyed by source. Summed by `totalFlatReduction`. */
  flatBySource: Record<string, number>;
  /** Accumulated percentage reduction, keyed by source. Combined by `combinedPercentReduction`. */
  percentBySource: Record<string, number>;
}

/** One champion's mutable combat counters and flags. */
export interface SideState {
  /** Named quantities the sequence adds to, consumes, or overwrites (§3.3). */
  counters: Record<string, number>;
  /** Named conditions — conditional-defence toggles and the like (§3.3, §5). */
  flags: Record<string, boolean>;
}

/**
 * Everything the sequence changes as it runs. Seeded at entry, mutated instance by instance.
 *
 * Held immutably: every function here returns a NEW state rather than editing this one, so a
 * snapshot stored against instance 2 still reads as instance 2 after instance 6 has resolved.
 */
export interface CombatState {
  /** How many instances have already resolved — every position in the sequence, damaging or
   *  not. SPECIFICATION §3.4: a non-damaging ability "occupies a position in the sequence". */
  instancesResolved: number;
  /**
   * How many of those actually delivered damage.
   *
   * Kept separately because the two are not the same question and the mechanics that read a
   * counter read this one. Bone Plating reduces "damage from the first three instances"
   * (SPECIFICATION §5) — a non-damaging ability occupies a position without spending one of
   * those three.
   */
  damagingInstancesResolved: number;
  attacker: SideState;
  defender: SideState;
  /** Reduction accumulated on the defender's two resistances. Penetration is NOT here —
   *  it comes from the attacker's build and does not change during a sequence. */
  defenderShred: { armor: ResistanceShred; magicResist: ResistanceShred };
  /** The defender's health as the sequence has left it. Unrounded, and allowed to go
   *  negative so that overkill is visible to the caller. */
  defenderCurrentHp: number;
  /** Burst damage dealt so far, unrounded. Damage over time is never added here (§3.8). */
  cumulativeBurst: number;
}

/**
 * Persistent accumulations (§3.3), for both champions. Frozen.
 *
 * These are read-only inputs to the sequence. They have already been folded into the stat
 * block by the caller before `runCombo` is reached; they are carried here so the per-instance
 * breakdown can SHOW them (§11) without any risk of the sequence editing them.
 */
export interface PersistentState {
  readonly attacker: Readonly<Record<string, number>>;
  readonly defender: Readonly<Record<string, number>>;
}

/**
 * The two categories side by side, with their different lifetimes visible in the types:
 * `persistent` is readonly, `combat` is replaced wholesale after each instance.
 */
export interface SequenceState {
  readonly persistent: PersistentState;
  combat: CombatState;
}

/** An empty shred record — no source has reduced anything yet. */
export function emptyShred(): ResistanceShred {
  return { flatBySource: {}, percentBySource: {} };
}

/**
 * Total flat resistance reduction across every source.
 *
 * Flat reduction is a subtraction from a stat, so sources add: 5 and 12 give 17. This becomes
 * step 1 of the fixed four-step order in resistances.ts (SPECIFICATION §3.6).
 */
export function totalFlatReduction(shred: ResistanceShred): number {
  return Object.values(shred.flatBySource).reduce((sum, value) => sum + value, 0);
}

/**
 * Combined percentage resistance reduction across every source.
 *
 * MULTIPLICATIVE, not additive. https://wiki.leagueoflegends.com/en-us/Armor_penetration
 * (read 2026-08-13): "Percentage armor reduction stacks multiplicatively". So 30% and 40%
 * leave 0.70 x 0.60 = 0.42 of the resistance standing, a combined reduction of 0.58 — not the
 * 0.70 that adding them would claim.
 *
 * Returned as a single fraction so it can be handed to `effectiveResistance` as step 2.
 */
export function combinedPercentReduction(shred: ResistanceShred): number {
  const remaining = Object.values(shred.percentBySource).reduce(
    (product, fraction) => product * (1 - fraction),
    1,
  );
  return 1 - remaining;
}

/**
 * A change one instance makes to combat state, applied AFTER that instance's own damage has
 * resolved.
 *
 * That timing is deliberate and is pinned by a test: an instance that shreds armor does not
 * shred it for itself. A user who means "the shred was already there" says so in entry state,
 * which is exactly what §3.3 provides entry state for.
 *
 * This vocabulary is deliberately small. It is the MODEL, not the effect catalogue: the
 * numbers (how much shred, what the cap is, how many stacks) always arrive from the caller's
 * data, never from this file.
 */
export type StateEffect =
  /** Accumulate flat resistance reduction on the defender — step 1 of §3.6. */
  | {
      kind: 'flat-resistance-reduction';
      resistance: 'armor' | 'magicResist';
      /** The source's own key. Caps apply per source, so this must be stable across a combo. */
      source: string;
      /** Positive magnitude added to this source's running total. */
      amount: number;
      /** The most this SOURCE may accumulate. Absent means uncapped. */
      cap?: number;
    }
  /** Accumulate percentage resistance reduction on the defender — step 2 of §3.6. */
  | {
      kind: 'percent-resistance-reduction';
      resistance: 'armor' | 'magicResist';
      source: string;
      /** Positive magnitude as a fraction of 1: 30% is 0.3. */
      fraction: number;
      cap?: number;
    }
  /** Add to a named combat counter, optionally holding it at a maximum. */
  | {
      kind: 'add-counter';
      side: 'attacker' | 'defender';
      counter: string;
      amount: number;
      max?: number;
    }
  /** Overwrite a counter — a consumed resource, a reset stack window. */
  | { kind: 'set-counter'; side: 'attacker' | 'defender'; counter: string; value: number }
  /** Set a condition on or off. */
  | { kind: 'set-flag'; side: 'attacker' | 'defender'; flag: string; value: boolean };

/**
 * Fold both champions' persistent accumulations into a frozen record.
 *
 * `Object.freeze` is shallow, which is all that is needed: the values are numbers.
 * The freeze is the guarantee, not a hint — ES modules run in strict mode, where writing to
 * a frozen object throws rather than failing quietly.
 */
export function foldPersistentAccumulations(
  attacker: Record<string, number>,
  defender: Record<string, number>,
): PersistentState {
  return Object.freeze({
    attacker: Object.freeze({ ...attacker }),
    defender: Object.freeze({ ...defender }),
  });
}

/**
 * Seed combat state from the two champions' ENTRY STATE, and nothing else.
 *
 * `ChampionConfig.entryState` is `Record<string, number | boolean>`; numbers become counters
 * and booleans become flags. Persistent accumulations are deliberately not a parameter of this
 * function — reading them here is the modelling error the file exists to prevent.
 */
export function seedCombatState(opts: {
  attackerEntryState: Record<string, number | boolean>;
  defenderEntryState: Record<string, number | boolean>;
  /** The defender's health at the moment the sequence begins (`StatBlock.hp`). */
  defenderCurrentHp: number;
  /**
   * Instances already delivered before this sequence starts. Defaults to 0.
   *
   * SPECIFICATION §5 needs it: Bone Plating counts "the first three instances an attacker
   * delivers", and a user describing a moment two instances into a fight must be able to say
   * so rather than have the engine assume a fresh start.
   */
  instancesAlreadyResolved?: number;
  /** Of those, how many delivered damage. Defaults to `instancesAlreadyResolved`. */
  damagingInstancesAlreadyResolved?: number;
}): CombatState {
  return {
    instancesResolved: opts.instancesAlreadyResolved ?? 0,
    damagingInstancesResolved:
      opts.damagingInstancesAlreadyResolved ?? opts.instancesAlreadyResolved ?? 0,
    attacker: splitEntryState(opts.attackerEntryState),
    defender: splitEntryState(opts.defenderEntryState),
    defenderShred: { armor: emptyShred(), magicResist: emptyShred() },
    defenderCurrentHp: opts.defenderCurrentHp,
    cumulativeBurst: 0,
  };
}

/** Convenience: seed from the two `ChampionConfig`s in a Scenario. */
export function seedFromConfigs(
  attacker: ChampionConfig,
  defender: ChampionConfig,
  defenderCurrentHp: number,
  instancesAlreadyResolved?: number,
): SequenceState {
  return {
    persistent: foldPersistentAccumulations(attacker.persistent, defender.persistent),
    combat: seedCombatState({
      attackerEntryState: attacker.entryState,
      defenderEntryState: defender.entryState,
      defenderCurrentHp,
      instancesAlreadyResolved,
    }),
  };
}

function splitEntryState(entry: Record<string, number | boolean>): SideState {
  const counters: Record<string, number> = {};
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === 'boolean') flags[key] = value;
    else counters[key] = value;
  }
  return { counters, flags };
}

/** Apply one effect, returning a NEW state. The input is never modified. */
export function applyStateEffect(state: CombatState, effect: StateEffect): CombatState {
  switch (effect.kind) {
    case 'flat-resistance-reduction':
      return withShred(state, effect.resistance, (shred) => ({
        ...shred,
        flatBySource: accumulate(shred.flatBySource, effect.source, effect.amount, effect.cap),
      }));

    case 'percent-resistance-reduction':
      return withShred(state, effect.resistance, (shred) => ({
        ...shred,
        percentBySource: accumulate(
          shred.percentBySource,
          effect.source,
          effect.fraction,
          effect.cap,
        ),
      }));

    case 'add-counter': {
      const side = state[effect.side];
      const raised = (side.counters[effect.counter] ?? 0) + effect.amount;
      const held = effect.max === undefined ? raised : Math.min(raised, effect.max);
      return withSide(state, effect.side, {
        ...side,
        counters: { ...side.counters, [effect.counter]: held },
      });
    }

    case 'set-counter': {
      const side = state[effect.side];
      return withSide(state, effect.side, {
        ...side,
        counters: { ...side.counters, [effect.counter]: effect.value },
      });
    }

    case 'set-flag': {
      const side = state[effect.side];
      return withSide(state, effect.side, {
        ...side,
        flags: { ...side.flags, [effect.flag]: effect.value },
      });
    }
  }
}

/** Apply a list of effects IN THE ORDER GIVEN. The order inside one instance matters too. */
export function applyStateEffects(state: CombatState, effects: StateEffect[]): CombatState {
  return effects.reduce(applyStateEffect, state);
}

function accumulate(
  bySource: Record<string, number>,
  source: string,
  amount: number,
  cap: number | undefined,
): Record<string, number> {
  const raised = (bySource[source] ?? 0) + amount;
  return { ...bySource, [source]: cap === undefined ? raised : Math.min(raised, cap) };
}

function withShred(
  state: CombatState,
  resistance: 'armor' | 'magicResist',
  change: (shred: ResistanceShred) => ResistanceShred,
): CombatState {
  return {
    ...state,
    defenderShred: {
      ...state.defenderShred,
      [resistance]: change(state.defenderShred[resistance]),
    },
  };
}

function withSide(
  state: CombatState,
  side: 'attacker' | 'defender',
  next: SideState,
): CombatState {
  return { ...state, [side]: next };
}

/**
 * A flat, displayable picture of the state ONE instance met, for
 * `InstanceResult.stateSnapshot` (SPECIFICATION §11 — the breakdown shows "the state that
 * applied at that point").
 *
 * THE KEY SCHEME, so nothing is ambiguous when it reaches the interface:
 *   `instanceNumber`                       this instance's 1-based position in the sequence
 *   `damagingInstanceNumber`               its 1-based position among DAMAGING instances
 *   `instancesResolvedBefore`              how many had already landed
 *   `defenderCurrentHp`                    health before this instance
 *   `defenderArmorFlatReduction`           accumulated shred, totalled across sources
 *   `defenderArmorPercentReduction`        accumulated shred, combined multiplicatively
 *   `defenderMagicResistFlatReduction`     "
 *   `defenderMagicResistPercentReduction`  "
 *   `attacker.<name>` / `defender.<name>`               COMBAT counters and flags
 *   `attacker.persistent.<name>` / `defender.persistent.<name>`   PERSISTENT accumulations
 *
 * The two prefixes are what stop a reader — or a later maintainer — mistaking a game-long
 * accumulation for an in-combat one.
 */
export function snapshotCombatState(
  state: CombatState,
  persistent: PersistentState,
  instanceNumber: number,
  damagingInstanceNumber?: number,
): Record<string, number | boolean> {
  const snapshot: Record<string, number | boolean> = {
    instanceNumber,
    damagingInstanceNumber: damagingInstanceNumber ?? state.damagingInstancesResolved + 1,
    instancesResolvedBefore: state.instancesResolved,
    defenderCurrentHp: state.defenderCurrentHp,
    defenderArmorFlatReduction: totalFlatReduction(state.defenderShred.armor),
    defenderArmorPercentReduction: combinedPercentReduction(state.defenderShred.armor),
    defenderMagicResistFlatReduction: totalFlatReduction(state.defenderShred.magicResist),
    defenderMagicResistPercentReduction: combinedPercentReduction(state.defenderShred.magicResist),
  };

  for (const side of ['attacker', 'defender'] as const) {
    for (const [key, value] of Object.entries(state[side].counters)) {
      snapshot[`${side}.${key}`] = value;
    }
    for (const [key, value] of Object.entries(state[side].flags)) {
      snapshot[`${side}.${key}`] = value;
    }
    for (const [key, value] of Object.entries(persistent[side])) {
      snapshot[`${side}.persistent.${key}`] = value;
    }
  }

  return snapshot;
}
