// THE COMBO BUILDER — an ability SHELF of icon-chips, and the ordered sequence they build.
//
// SPECIFICATION §10.1, verbatim: "The combo builder presents abilities as their in-game icons
// rather than as lettered buttons." Every ability on the shelf and every step in the sequence
// is an `AbilityChip` (DESIGN.md §9) carrying two cues at once — a 2px damage-type underline
// and a P/M/T corner tag — so the chip is colourblind-safe on exactly the same terms as every
// damage figure in the product. A non-damaging ability takes a neutral steel rule and an em
// dash instead: visibly "no damage type", never an omission.
//
// WHAT A KEYBOARD USER CAN DO. Everything. The shelf is a row of buttons; each step in the
// sequence carries three more (move earlier, move later, remove). Nothing here is
// drag-and-drop, which is the one reordering idiom that cannot be operated from a keyboard at
// all, and which would need a dependency this area is not permitted to add.
//
// WHAT A SCREEN READER HEARS. Names, never letters. "Add Q — Light Binding, magic damage, to
// the combo". "Move W — Prismatic Barrier earlier, from position 3 of 4". Every edit is then
// announced through a polite live region, because a reorder that is only visible is a reorder
// a screen reader user cannot confirm happened.
//
// THE SEQUENCE HAS NO TIME IN IT (SPECIFICATION §3.2). Positions, not timestamps.

import { useLayoutEffect, useRef, useState } from 'react';
import type { ComboStep } from '../../types';
import { AbilityChip } from '../art/AbilityChip';
import { abilityIconUrl } from '../data/roster';
import { focusAfterRemoval } from '../primitives';
import {
  BASIC_ATTACK_REF,
  appendStep,
  moveName,
  moveStep,
  removeName,
  removeStep,
  shelfButtonName,
  sortBySlot,
  stepName,
  viewSteps,
  type ShelfAbility,
} from './sequence';
import './combo.css';

export interface ComboBuilderProps {
  /** The attacking champion's abilities, as the pipeline publishes them (with their icons). */
  abilities: readonly ShelfAbility[];
  /** The ordered combo. Straight off `Scenario.combo`. */
  steps: readonly ComboStep[];
  onChange: (steps: ComboStep[]) => void;
  /** Patch the art is served for, e.g. "16.16.1". */
  patch: string;
  /** Named in the section heading, e.g. "Lux". */
  championName: string;
}

export function ComboBuilder({
  abilities,
  steps,
  onChange,
  patch,
  championName,
}: ComboBuilderProps) {
  const [announcement, setAnnouncement] = useState('');
  const shelf = sortBySlot(abilities);
  const views = viewSteps(steps, abilities);
  const total = views.length;

  const shelfRef = useRef<HTMLUListElement>(null);
  const sequenceRef = useRef<HTMLOListElement>(null);
  /** The index that was just removed, or null. Armed by a removal, consumed by the effect below. */
  const removedIndex = useRef<number | null>(null);

  // A LAYOUT effect, not a plain one: it runs before the browser paints, so focus never visibly
  // sits on the body for a frame. It has no dependency array on purpose — it runs after every
  // render and takes the intent only when one is armed, which is what makes the SECOND and third
  // removal work as well as the first.
  useLayoutEffect(() => {
    const index = removedIndex.current;
    if (index === null) return;
    removedIndex.current = null;
    focusAfterRemoval(
      sequenceRef.current,
      '.combo__control--remove',
      index,
      // The list is empty, so there is no row to stand on. The shelf's first control is where a
      // user who has just emptied the combo is going next — it is the control that adds a row.
      shelfRef.current?.querySelector<HTMLElement>('button') ?? null,
    );
  });

  const apply = (next: ComboStep[], said: string) => {
    onChange(next);
    setAnnouncement(said);
  };

  return (
    <section className="combo" aria-label={`Combo — ${championName}`}>
      {/* THE SHELF AND THE SEQUENCE ARE TWO LANES, SIDE BY SIDE. Both are one row of chips
          against a 1327px panel, so stacking them spent a second row of height on white space.
          Below the §7a breakpoint the lanes stack again. Reading order is unchanged: the shelf
          is still first in the document, so keyboard and screen-reader order are untouched. */}
      <div className="combo__lanes">
      <h2 className="combo__title">Combo</h2>

      <div className="combo__lane">
      {/* ---- The shelf ---- */}
      <h3 className="combo__eyebrow" id="combo-shelf-label">
        Abilities
      </h3>
      <ul className="combo__shelf" aria-labelledby="combo-shelf-label" ref={shelfRef}>
        {shelf.map((ability) => (
          <li key={`${ability.slot}-${ability.abilityName}`}>
            <button
              type="button"
              className="combo__shelf-button"
              aria-label={shelfButtonName(ability)}
              onClick={() =>
                apply(
                  appendStep(steps, 'ability', ability.slot),
                  `${ability.slot} — ${ability.abilityName} added at position ${steps.length + 1}.`,
                )
              }
            >
              <AbilityChip
                src={abilityIconUrl(patch, ability.slot, ability.icon)}
                slot={ability.slot}
                abilityName={ability.abilityName}
                damageType={ability.damageType ?? null}
                size="combo"
              />
            </button>
          </li>
        ))}

        <li>
          {/*
            A BASIC ATTACK IS NOT AN ABILITY and has no Data Dragon icon of any kind, so it
            cannot be an icon-chip. §10.1's ban on lettered buttons is about abilities; this is
            a plainly labelled control instead, and it is deliberately shaped differently from
            the chips so the two never read as the same class of thing. SETTLED 2026-08-13 —
            the reasoning, and what was rejected, is on BASIC_ATTACK_MARKER in ./sequence.ts.
          */}
          <button
            type="button"
            className="combo__shelf-button combo__shelf-button--text"
            onClick={() =>
              apply(
                appendStep(steps, 'basic-attack', BASIC_ATTACK_REF),
                `Basic attack added at position ${steps.length + 1}.`,
              )
            }
          >
            Basic attack
          </button>
        </li>
      </ul>
      </div>

      <div className="combo__lane combo__lane--sequence">
      {/* ---- The sequence ---- */}
      <h3 className="combo__eyebrow" id="combo-sequence-label">
        Sequence
      </h3>

      {total === 0 ? (
        <p className="combo__empty">
          No steps yet. Choose an ability above to begin the combo.
        </p>
      ) : (
        <ol className="combo__sequence" aria-labelledby="combo-sequence-label" ref={sequenceRef}>
          {views.map((view, index) => (
            <li className="combo__step" key={view.step.id}>
              {/* The step is one row and the controls that act on it are the next. The two
                  are wrapped rather than left as siblings so the card's width is set by the
                  controls alone — see `.combo__step-head` in combo.css for the measurement
                  that made the wrapper necessary. */}
              <span className="combo__step-head">
                <span className="combo__position" aria-hidden="true">
                  {view.position}
                </span>

                {view.ability ? (
                  <AbilityChip
                    src={abilityIconUrl(patch, view.ability.slot, view.ability.icon)}
                    slot={view.ability.slot}
                    abilityName={view.ability.abilityName}
                    damageType={view.ability.damageType ?? null}
                    size="combo"
                  />
                ) : (
                  <span className="combo__marker" aria-hidden="true">
                    {view.marker}
                  </span>
                )}
              </span>

              {/* The step's own words, in one text node, for assistive technology. */}
              <span className="u-visually-hidden">{stepName(view, total)}</span>

              <span className="combo__controls">
                <button
                  type="button"
                  className="combo__control"
                  aria-label={moveName(view, total, 'earlier')}
                  disabled={index === 0}
                  onClick={() =>
                    apply(
                      moveStep(steps, index, -1),
                      `${view.label} moved to position ${view.position - 1} of ${total}.`,
                    )
                  }
                >
                  <span aria-hidden="true">◀</span>
                </button>
                <button
                  type="button"
                  className="combo__control"
                  aria-label={moveName(view, total, 'later')}
                  disabled={index === total - 1}
                  onClick={() =>
                    apply(
                      moveStep(steps, index, 1),
                      `${view.label} moved to position ${view.position + 1} of ${total}.`,
                    )
                  }
                >
                  <span aria-hidden="true">▶</span>
                </button>
                {/* The one control here that cannot be undone, and it used to sit 22.47px
                    from "move later". It keeps its own modifier so the stylesheet can hold
                    it away from the pair — see `.combo__control--remove` in combo.css. */}
                <button
                  type="button"
                  className="combo__control combo__control--remove"
                  aria-label={removeName(view, total)}
                  onClick={() => {
                    // Arm the focus rule BEFORE the state change, so the layout effect that runs
                    // after the re-render knows which index vanished. See `focusAfterRemoval`.
                    removedIndex.current = index;
                    apply(
                      removeStep(steps, index),
                      `${view.label} removed. ${total - 1} steps remain.`,
                    );
                  }}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      </div>
      </div>

      {/* Every edit is announced. A reorder that is only visible is a reorder a screen reader
          user cannot confirm happened. */}
      <span className="u-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
