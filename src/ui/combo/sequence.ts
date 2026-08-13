// The combo sequence — every edit a user can make to it, as pure functions.
//
// The list is `ComboStep[]` straight off the frozen `Scenario` (src/types/scenario.ts). This
// area never invents a step shape and never mutates in place: each function returns a new
// array, so a caller holding the previous sequence still holds the previous sequence. That
// matters for the URL encoder (§12) and for undo, neither of which is this area's to build.
//
// THE ENGINE MODELS SEQUENCE, NOT ELAPSED TIME (SPECIFICATION §3.2). Nothing here has a
// duration, a delay or a timestamp, and there is nothing in the data it could derive one
// from. A step's only temporal property is its position in this array.

import type { AbilitySlot, CuratedAbility, DamageType } from '../../types';
import type { ComboStep, ComboStepKind } from '../../types';

/**
 * An ability as the shelf needs it: the curated ability plus its Data Dragon icon filename.
 *
 * The icon is an INTERSECTION with the frozen type rather than a redefinition of it — it is
 * exactly the shape the data pipeline already writes to `public/data/abilities/{Champion}.json`
 * (`CuratedAbility & { icon: string }`). If the ability record ever needs to carry art in the
 * contract itself, that is a change for the lead to make in src/types/, not for this file.
 */
export type ShelfAbility = CuratedAbility & { icon: string };

/** Slot order as the game prints it. The passive first, then Q W E R. */
export const SLOT_ORDER: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];

/** The reference a basic-attack step points at (`ComboStep.ref`). */
export const BASIC_ATTACK_REF = 'basic';

export function sortBySlot(abilities: readonly ShelfAbility[]): ShelfAbility[] {
  return [...abilities].sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
}

/**
 * A unique id for a new step.
 *
 * Ids must be unique WITHIN a combo (`ComboStep.id`, src/types/scenario.ts) and stable enough
 * to key a list by. `q1`, `q2`, `aa1` … — readable in a URL and in a bug report, which a random
 * uuid is not.
 *
 * IT SCANS THE IDS IN USE rather than counting steps, which is what makes the guarantee hold
 * after a removal: counting would hand out `q2` again while a `q2` was still in the combo. An
 * id freed by a removal IS reused, and that is correct — the requirement is uniqueness within
 * the combo at any moment, not that an id is never issued twice in a session. (A test asserted
 * the stronger property on 2026-08-13; the property was wrong, not the code, and both were
 * corrected rather than one bent to fit the other.)
 */
export function nextStepId(steps: readonly ComboStep[], kind: ComboStepKind, ref: string): string {
  const base =
    kind === 'basic-attack'
      ? 'aa'
      : ref.toLowerCase().replace(/[^a-z0-9]/g, '') || kind.replace(/[^a-z0-9]/g, '');
  const taken = new Set(steps.map((s) => s.id));
  let n = 1;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export function appendStep(
  steps: readonly ComboStep[],
  kind: ComboStepKind,
  ref: string,
): ComboStep[] {
  return [...steps, { id: nextStepId(steps, kind, ref), kind, ref }];
}

/**
 * Move the step at `index` by `delta` places. Out-of-range moves are refused by returning the
 * sequence unchanged — a "move earlier" on the first step is a no-op, never a wrap-around.
 */
export function moveStep(steps: readonly ComboStep[], index: number, delta: number): ComboStep[] {
  const target = index + delta;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
    return [...steps];
  }
  const next = [...steps];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function removeStep(steps: readonly ComboStep[], index: number): ComboStep[] {
  if (index < 0 || index >= steps.length) return [...steps];
  return steps.filter((_, i) => i !== index);
}

/**
 * What one step in the sequence shows and says.
 *
 * `ability` is the shelf entry a step points at, when there is one. `marker` is what is drawn
 * in place of art when there is no icon to draw — a basic attack has no Data Dragon asset at
 * all, and an on-hit or item reference has none here either. See `BASIC_ATTACK_MARKER`.
 */
export interface StepView {
  step: ComboStep;
  /** 1-based, because it is spoken to a user: "position 2 of 5". */
  position: number;
  ability: ShelfAbility | null;
  marker: string | null;
  label: string;
  damageType: DamageType | null;
}

/**
 * The mark drawn for a basic attack, which has NO Data Dragon icon of any kind.
 *
 * ═══ DECIDED 2026-08-13. THE BASIC ATTACK IS NAMED IN WORDS AND MARKED `AA`; NO ART IS
 * BORROWED FOR IT. ═══  (DATA-SOURCES §42.6 records the reasoning in full.)
 *
 * THE QUESTION. SPECIFICATION §10.1 says "the combo builder presents abilities as their in-game
 * icons rather than as lettered buttons", and Data Dragon ships nothing for an auto-attack —
 * champion portraits, ability icons, item icons and rune icons, and no fifth category. So the
 * one control the builder cannot obey the rule for is the one the rule does not cover.
 *
 * WHY THE BAN DOES NOT REACH IT. §10.1 forbids substituting a letter for art THAT EXISTS. Its
 * purpose is that a player recognises Q by its icon rather than by reading a letter, and that
 * purpose has no application where there is no icon to recognise. **A basic attack is not an
 * ability** — SPECIFICATION §3.4 lists it as its own instance type, distinct from "damaging
 * ability" and from "empowered basic attack" — so this is not the banned case narrowly
 * construed, and it is not the banned case on the argument behind the ban either.
 *
 * WHAT WAS REJECTED, AND WHY IT IS THE WORSE OPTION. The alternative is to borrow an existing
 * Data Dragon asset — an item icon, a summoner-spell icon, the attack-move cursor — and let it
 * stand for "basic attack". That is presenting official art as denoting something it does not
 * denote, in a product whose §15 asset terms are built on using Riot's art as Riot ships it, and
 * in an interface where every other icon means exactly the thing it depicts. A user who learned
 * that one chip means something other than what it shows can no longer trust that any of them
 * does. Drawing a bespoke icon is the same objection plus a new asset class DESIGN.md does not
 * define.
 *
 * WHAT IS DRAWN INSTEAD, and it introduces no new design value. In the shelf, a plainly labelled
 * control reading "Basic attack" — deliberately a different SHAPE from an icon-chip, so the two
 * never read as the same class of thing (`.combo__shelf-button--text`). In the sequence, where
 * every step must keep one rhythm, a chip-sized well carrying this `AA` mark in the display face
 * at the eyebrow size. Both use tokens DESIGN.md already defines. It is the same construction
 * DESIGN.md §9 already specifies for a non-damaging chip — a visible marker that says "no art
 * here", never an omission.
 *
 * ONE THING THIS DECISION DOES NOT DO. DESIGN.md §9 still says nothing about a basic attack, and
 * that file is write-denied to every session by `permissions.deny` (CLAUDE.md, the guards). The
 * tidy end state is a one-row addition to §9 recording this; it needs the owner to unlock the
 * file, and it is named in DATA-SOURCES §42.6 rather than routed around.
 */
export const BASIC_ATTACK_MARKER = 'AA';

/** The mark for a reference this area has no art for at all (an on-hit key, an item id). */
export const UNKNOWN_REF_MARKER = '—';

export function stepLabel(step: ComboStep, ability: ShelfAbility | null): string {
  if (ability) return `${ability.slot} — ${ability.abilityName}`;
  switch (step.kind) {
    case 'basic-attack':
      return 'Basic attack';
    case 'empowered-attack':
      return `Empowered attack — ${step.ref}`;
    case 'item-active':
      return `Item active — ${step.ref}`;
    case 'on-hit':
      return `On-hit effect — ${step.ref}`;
    case 'ability':
      // An ability slot with no shelf entry: the champion's data has not been harvested for
      // that slot. Named as what it is rather than dropped from the sequence.
      return `${step.ref} — ability not modelled`;
    default:
      return step.ref;
  }
}

export function viewSteps(
  steps: readonly ComboStep[],
  abilities: readonly ShelfAbility[],
): StepView[] {
  return steps.map((step, i) => {
    const ability =
      step.kind === 'ability'
        ? (abilities.find((a) => a.slot === (step.ref as AbilitySlot)) ?? null)
        : null;
    return {
      step,
      position: i + 1,
      ability,
      marker: ability
        ? null
        : step.kind === 'basic-attack'
          ? BASIC_ATTACK_MARKER
          : UNKNOWN_REF_MARKER,
      label: stepLabel(step, ability),
      damageType: ability?.damageType ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Accessible names. ONE TEXT NODE EACH, built here.
//
// The accessibility tree trims each descendant's text and joins the pieces with nothing
// between them (measured, and recorded in ../primitives/accessible-names.test.tsx). Every
// name a control in the combo builder announces is therefore assembled as a single string.
// ---------------------------------------------------------------------------

const SPOKEN_TYPE: Record<DamageType, string> = {
  physical: 'physical',
  magic: 'magic',
  true: 'true',
};

/** The damage-type clause, in words, for anything that carries a P/M/T tag or an em dash. */
export function damageTypeClause(ability: ShelfAbility): string {
  if (ability.damageType) return `${SPOKEN_TYPE[ability.damageType]} damage`;
  // ABSENT IS NOT THE SAME AS NONE. `CuratedAbility.damageType` is optional and absent means
  // no source states one (src/types/data.ts). Only `no-damage` verification licenses the
  // stronger claim, and it is the only case that says "deals no damage".
  return ability.verification === 'no-damage' ? 'deals no damage' : 'damage type not recorded';
}

export function shelfButtonName(ability: ShelfAbility): string {
  return `Add ${ability.slot} — ${ability.abilityName}, ${damageTypeClause(ability)}, to the combo`;
}

export function stepName(view: StepView, of: number): string {
  return `Step ${view.position} of ${of}: ${view.label}`;
}

export function moveName(view: StepView, of: number, direction: 'earlier' | 'later'): string {
  return `Move ${view.label} ${direction}, from position ${view.position} of ${of}`;
}

export function removeName(view: StepView, of: number): string {
  return `Remove ${view.label} from position ${view.position} of ${of}`;
}
