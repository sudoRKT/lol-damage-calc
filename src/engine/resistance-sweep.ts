// THE DAMAGE-VERSUS-RESISTANCE CURVE (SPECIFICATION §11).
//
// "Damage-versus-armor curve — how the combo's output changes across a range of target
// resistances."
//
// ═══ WHAT IS SWEPT, AND WHY THE CALLER MUST SAY ═══
//
// §11 names the view "damage-versus-ARMOR" and then describes it as "a range of target
// RESISTANCES", which are two different readings and this module resolves neither silently
// (CLAUDE.md: "When the spec is ambiguous or self-contradictory, raise it"). `axis` is a
// REQUIRED option with three values:
//
//   'armor'        — armor moves, magic resistance is held at the defender's own value
//   'magicResist'  — the mirror image
//   'both'         — one value applied to both, which answers "how tanky must they be" but is
//                    NOT a build any item set produces, and must be labelled as such
//
// A mixed-damage combo behaves very differently under the three, so the choice cannot be a
// default. It is raised to the lead as an interface question, not decided here.
//
// ═══ THE SWEEP MOVES BONUS RESISTANCE, AND HOLDS BASE ═══
//
// A defender's armor is their own base armor at their level plus what their build gives them, and
// only the second half is a choice. So sweeping to a total of T holds the champion's base armor
// where it is and sets the bonus portion to T - base. The split is not cosmetic: percentage BONUS
// armor penetration applies to the bonus portion alone (resistances.ts), so a sweep that guessed
// the split would silently move that effect's value.
//
// Below the champion's own base armor the bonus portion is NEGATIVE. That is a real game state —
// armor reduction can take a target's armor below zero — and the engine's negative-armor branch
// handles it. But percentage bonus penetration against a negative bonus pool has no defined
// meaning at all, so a point in that region REFUSES when the attacker carries any, rather than
// producing a number nobody can defend.
//
// ═══ WHAT IS HELD CONSTANT ═══
//
// Everything else, exactly. The plan is built ONCE and only the defender's resistance figures are
// replaced per point, so the attacker's stats, the ability ranks, the combo, the entry state and
// the defender's health are identical at every point on the curve. Two consequences worth stating:
// the defender's health does NOT fall as their armor rises (armor items also carry health in the
// real game — this curve deliberately does not model that), and the Result attached under
// `include: 'result'` echoes the ORIGINAL scenario, whose defender build does not produce the
// swept armor. Both are in `notes` on every series.

import type { StatBlock } from '../types/result';
import type { Scenario } from '../types/scenario';
import { runCombo, type ComboPlan } from './combo';
import { planScenario, type Catalogue, type SimulationRefusal } from './simulate';
import {
  buildSeries,
  summarise,
  type SweepPoint,
  type SweepSeries,
} from './sweep';

/** Which resistance the sweep moves. Required — see the header note on §11's two readings. */
export type ResistanceAxis = 'armor' | 'magicResist' | 'both';

/** One resistance as the sweep set it, split the way the game calculates it. */
export interface AppliedResistance {
  total: number;
  base: number;
  bonus: number;
}

/** What a point of a resistance sweep was evaluated at. Present on refused points too. */
export interface AppliedResistances {
  armor?: AppliedResistance;
  magicResist?: AppliedResistance;
}

export type ResistanceSweepSeries = SweepSeries<AppliedResistances>;

export interface ResistanceSweepOptions {
  axis: ResistanceAxis;
  /** The exact values to evaluate. Use this or `from`/`to`/`step`, not both. */
  values?: readonly number[];
  from?: number;
  to?: number;
  step?: number;
  /** Sort the points ascending by resistance. Off by default: the caller's order is kept. */
  sort?: boolean;
  /** `'result'` attaches the whole Result to every computed point. Default `'summary'`. */
  include?: 'summary' | 'result';
}

export type ResistanceSweepOutcome =
  | { ok: true; series: ResistanceSweepSeries }
  | { ok: false; refusals: SimulationRefusal[] };

/**
 * An inclusive range of resistance values.
 *
 * `resistanceValues(0, 300, 25)` gives 0, 25, … 300. When the step does not divide the range
 * evenly the final value is still included, because the end of a curve's axis is a value a
 * reader expects to see rather than an accident of arithmetic.
 */
export function resistanceValues(from: number, to: number, step: number): number[] {
  if (!(step > 0)) throw new RangeError(`step must be greater than 0, got ${step}`);
  if (to < from) throw new RangeError(`to (${to}) must not be below from (${from})`);
  const values: number[] = [];
  // Walk by multiplication rather than by repeated addition so floating-point error cannot
  // accumulate across a long range.
  const count = Math.floor((to - from) / step);
  for (let i = 0; i <= count; i += 1) values.push(from + i * step);
  if (values[values.length - 1] !== to) values.push(to);
  return values;
}

/**
 * The curve, from a Scenario.
 *
 * Refuses WHOLESALE — with no series at all — when the scenario itself cannot be assembled, which
 * is the same rule `simulate` follows. A curve of eighteen identical refusals tells a reader
 * nothing that one refusal does not.
 */
export function damageVsResistance(
  scenario: Scenario,
  catalogue: Catalogue,
  options: ResistanceSweepOptions,
): ResistanceSweepOutcome {
  const planned = planScenario(scenario, catalogue);
  if (!planned.ok) return { ok: false, refusals: planned.refusals };
  return { ok: true, series: damageVsResistanceFromPlan(planned.plan, options) };
}

/**
 * The curve, from an already-assembled plan.
 *
 * This is the real implementation, and it is exported for two reasons: a caller that has already
 * built a plan should not pay to look everything up again, and effects `simulate` cannot yet
 * produce — penetration from an item passive, for instance — can only be exercised through a
 * hand-authored plan.
 */
export function damageVsResistanceFromPlan(
  plan: ComboPlan,
  options: ResistanceSweepOptions,
): ResistanceSweepSeries {
  const values = chooseValues(options);
  const ordered = options.sort ? [...values].sort((a, b) => a - b) : [...values];

  const sweepsArmor = options.axis === 'armor' || options.axis === 'both';
  const sweepsMagic = options.axis === 'magicResist' || options.axis === 'both';

  // The defender's OWN base figures, held fixed across the whole sweep.
  const armorBase = plan.defender.armorBase;
  const magicResistBase = plan.defender.magicResistBase;
  const bonusArmorPenetration = plan.attacker.penetration.percentBonusArmor;

  const excluded = new Set<string>();
  const points: SweepPoint<AppliedResistances>[] = ordered.map((x) => {
    const applied: AppliedResistances = {
      ...(sweepsArmor ? { armor: { total: x, base: armorBase, bonus: x - armorBase } } : {}),
      ...(sweepsMagic
        ? { magicResist: { total: x, base: magicResistBase, bonus: x - magicResistBase } }
        : {}),
    };
    const label = labelFor(options.axis, x);

    // THE ONE CASE THIS SWEEP CANNOT MODEL. Percentage bonus armor penetration multiplies the
    // bonus portion of the target's armor; against a negative bonus portion that multiplication
    // makes the target's armor HIGHER, which is not a mechanic anything documents. Refused by
    // name rather than reported as a number.
    if (sweepsArmor && bonusArmorPenetration > 0 && applied.armor!.bonus < 0) {
      return {
        x,
        label,
        applied,
        status: 'refused',
        refusals: [
          {
            path: 'defender.armor',
            reason:
              `a total of ${x} armor is below this defender's own base armor of ${armorBase}, so ` +
              `reaching it requires ${applied.armor!.bonus} bonus armor, and the attacker carries ` +
              `percentage bonus armor penetration (${bonusArmorPenetration * 100}%), which has no ` +
              `defined meaning against a negative bonus pool`,
          },
        ],
      };
    }

    const result = runCombo({ ...plan, defender: overrideResistances(plan.defender, applied) });
    for (const mechanic of result.excludedMechanics) excluded.add(mechanic);

    return {
      x,
      label,
      applied,
      status: 'computed',
      summary: summarise(result),
      ...(options.include === 'result' ? { result } : {}),
    };
  });

  return buildSeries({
    kind: 'resistance',
    axisLabel: axisLabel(options.axis),
    points,
    excludedMechanics: excluded,
    notes: notesFor(options.axis, armorBase, magicResistBase),
  });
}

function chooseValues(options: ResistanceSweepOptions): readonly number[] {
  if (options.values) return options.values;
  if (options.from === undefined || options.to === undefined || options.step === undefined) {
    throw new TypeError('a resistance sweep needs either `values` or all of `from`, `to`, `step`');
  }
  return resistanceValues(options.from, options.to, options.step);
}

/**
 * A stat block with its resistances replaced.
 *
 * `armorBase + armorBonus === armor` is a validator rule on the frozen StatBlock, so all three
 * figures move together. Nothing else on the block is touched.
 */
function overrideResistances(defender: StatBlock, applied: AppliedResistances): StatBlock {
  return {
    ...defender,
    ...(applied.armor
      ? {
          armor: applied.armor.total,
          armorBase: applied.armor.base,
          armorBonus: applied.armor.bonus,
        }
      : {}),
    ...(applied.magicResist
      ? {
          magicResist: applied.magicResist.total,
          magicResistBase: applied.magicResist.base,
          magicResistBonus: applied.magicResist.bonus,
        }
      : {}),
  };
}

function axisLabel(axis: ResistanceAxis): string {
  if (axis === 'armor') return 'target armor';
  if (axis === 'magicResist') return 'target magic resistance';
  return 'target armor and magic resistance';
}

function labelFor(axis: ResistanceAxis, x: number): string {
  if (axis === 'armor') return `${x} armor`;
  if (axis === 'magicResist') return `${x} magic resistance`;
  return `${x} armor and magic resistance`;
}

function notesFor(axis: ResistanceAxis, armorBase: number, magicResistBase: number): string[] {
  const notes = [
    'Only the target’s resistance moves along this curve. Health, level, build and the combo ' +
      'are identical at every point — so this is not a curve of "buying armor items", which ' +
      'would also add health.',
  ];
  if (axis === 'armor' || axis === 'both') {
    notes.push(
      `The target’s own base armor (${round2(armorBase)}) is held fixed and the BONUS portion ` +
        'carries the sweep, because percentage bonus armor penetration applies to the bonus ' +
        'portion alone. Below the base figure the bonus portion is negative, which is the state ' +
        'armor reduction produces in game.',
    );
  }
  if (axis === 'magicResist' || axis === 'both') {
    notes.push(
      `The target’s own base magic resistance (${round2(magicResistBase)}) is held fixed and the ` +
        'bonus portion carries the sweep.',
    );
  }
  if (axis === 'both') {
    notes.push(
      'Armor and magic resistance are set to the SAME value at each point. No item set produces ' +
        'that, so read this axis as "how resistant is the target", not as a build.',
    );
  }
  notes.push(
    'Where a full Result is attached to a point, the Scenario it echoes is the original one: ' +
      'its defender build does not produce the swept resistance, which is set on the resolved ' +
      'stat block instead.',
  );
  return notes;
}

/** Two decimal places, for a figure quoted in a sentence. Never used on a damage number. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
