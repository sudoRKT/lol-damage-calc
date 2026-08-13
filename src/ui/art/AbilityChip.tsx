// Official game art as a functional data-chip. DESIGN.md §9.
//
// Art is demoted to data in this product: an icon is never framed or gilded, it is a small square
// that carries information. A COMBAT-RELEVANT chip carries two cues, and both are mandatory:
//
//   • a 2px bottom underline in its DAMAGE-TYPE colour — the fast channel, and
//   • a small P/M/T corner tag — the definitive one, which is what makes it colourblind-safe.
//
// A NON-DAMAGING chip gets a neutral steel underline and an em-dash marker instead of a tag, so it
// reads as "visibly no damage type" rather than as an omission. That distinction is §9's, and it is
// the same principle as the `–` glyph for the no-damage verification state.
//
// The specification requires this: "The combo builder presents abilities as their in-game icons
// rather than as lettered buttons" (SPECIFICATION §10.1). Letters were a scaffold, not a choice.

import type { DamageType } from '../../types/data';
import './art.css';

const TAG: Record<DamageType, string> = { physical: 'P', magic: 'M', true: 'T' };
const FULL_WORD: Record<DamageType, string> = { physical: 'physical', magic: 'magic', true: 'true' };

export type ChipSize = 'combo' | 'table' | 'inline';

export interface AbilityChipProps {
  /** Full Data Dragon icon URL. */
  src: string;
  /** Slot letter, used in the accessible name — "Q — Light Binding". */
  slot: string;
  abilityName: string;
  /** The damage type, or null for an ability that deals none. */
  damageType: DamageType | null;
  /** 32px in the combo builder, 24px in tables, 20px inline (§9). */
  size?: ChipSize;
}

/**
 * The chip's accessible name. The icon is decorative on its own — a screen reader must hear the
 * ability and its damage type, in words, never a filename or a letter.
 */
export function chipAccessibleName(
  slot: string,
  abilityName: string,
  damageType: DamageType | null,
): string {
  return damageType === null
    ? `${slot} — ${abilityName}, no damage type`
    : `${slot} — ${abilityName}, ${FULL_WORD[damageType]} damage`;
}

export function AbilityChip({ src, slot, abilityName, damageType, size = 'combo' }: AbilityChipProps) {
  const cls = damageType === null ? 'chip__underline--none' : `chip__underline--${damageType}`;
  return (
    <span
      className={`chip chip--${size}`}
      role="img"
      aria-label={chipAccessibleName(slot, abilityName, damageType)}
    >
      {/* The image itself carries no accessible name: the wrapper is the labelled thing, so the
          name is spoken once rather than twice. */}
      <img className="chip__img" src={src} alt="" aria-hidden="true" />
      <span className={`chip__underline ${cls}`} aria-hidden="true" />
      <span className={`chip__tag chip__tag--${damageType ?? 'none'}`} aria-hidden="true">
        {damageType === null ? '—' : TAG[damageType]}
      </span>
    </span>
  );
}
