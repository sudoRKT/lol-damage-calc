// Official game art as a functional data-chip. DESIGN.md §9.
//
// Art is demoted to data in this product: an icon is never framed or gilded, it is a small square
// that carries information.
//
// ═══ WHAT THE CORNER TAG SAYS, AND WHY IT CHANGED ON 2026-08-14 ═══
//
// The corner used to carry the DAMAGE TYPE as `P` / `M` / `T`. The project owner, who plays the
// game, read the `M` on an ability icon as an ability SLOT letter — because Q, W, E and R are what
// a League player expects in exactly that position on exactly that object. The cue was correct and
// unreadable, which makes it decoration rather than a cue.
//
// So the corner now carries the SLOT, which is the notation a player already reads, and the damage
// type is a word. Three cues, each in one place and one form:
//
//   • the CORNER TAG is the ability slot — Q, W, E, R, P — and it is NEUTRAL, because a slot
//     letter is not damage data and DESIGN.md §1 reserves hue for damage data alone;
//   • the 2px bottom UNDERLINE is the damage type, in its hue — the fast channel;
//   • the WORD BENEATH the chip is the damage type in text — `phys` / `mag` / `true` — the
//     definitive channel, and the same vocabulary a damage figure carries.
//
// ═══ WHY THE WORD BENEATH EXISTS, WHICH IS THE PART NOT TO REMOVE ═══
//
// Option A as written in DESIGN-AUDIT.md says damage type "leaves the chip entirely and appears
// only where a NUMBER appears". Taken literally that leaves a shelf chip with its underline as its
// ONLY visible damage-type cue — colour alone — for the many chips that never sit near a figure.
// A player choosing abilities on the shelf has no result yet, so there is no number anywhere to
// carry the type for them. That is the exact channel SPECIFICATION §10.1 exists to forbid, so the
// word stays, moved off the icon rather than deleted with the letter.
//
// A NON-DAMAGING chip gets a neutral steel underline and an em-dash word, so it reads as "visibly
// no damage type" rather than as an omission. That distinction is §9's, and it is the same
// principle as the `–` glyph for the no-damage verification state.
//
// The specification requires the art itself: "The combo builder presents abilities as their
// in-game icons rather than as lettered buttons" (SPECIFICATION §10.1). A corner tag on an icon is
// not a lettered button — the icon is still what identifies the ability, and the letter says which
// slot it occupies, exactly as the game's own interface does.

import type { DamageType } from '../../types/data';
import './art.css';

/**
 * The damage-type word a chip carries beneath it. Same vocabulary as `DamageValue`'s tag, so
 * `mag` under a chip and `180 mag` in the table are visibly the same fact.
 */
const TYPE_WORD: Record<DamageType, string> = { physical: 'phys', magic: 'mag', true: 'true' };
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
  /**
   * True when the chip sits inside something that ALREADY names the ability — a table row whose
   * text is the source label, or a button carrying its own aria-label.
   *
   * Same rule, and the same reason, as `ChampionPortrait.decorative`: two labelled elements
   * nested inside one control announce the ability twice ("Q — The Darkin Blade, physical
   * damage. Q — The Darkin Blade (1st cast)."). A decorative chip is hidden from assistive
   * technology entirely, so the surrounding text is the single name. The VISUAL cues — the
   * damage-type underline and the P/M/T tag — are unaffected: they are still drawn, because
   * they are for the eye and the surrounding text is what carries the meaning for everyone else.
   */
  decorative?: boolean;
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

export function AbilityChip({
  src,
  slot,
  abilityName,
  damageType,
  size = 'combo',
  decorative = false,
}: AbilityChipProps) {
  const cls = damageType === null ? 'chip__underline--none' : `chip__underline--${damageType}`;
  return (
    <span
      className={`chip-group chip-group--${size}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : chipAccessibleName(slot, abilityName, damageType)}
    >
      <span className={`chip chip--${size}`}>
        {/* The image itself carries no accessible name: the wrapper is the labelled thing, so the
            name is spoken once rather than twice. */}
        <img className="chip__img" src={src} alt="" aria-hidden="true" />
        <span className={`chip__underline ${cls}`} aria-hidden="true" />
        {/* The SLOT, not the damage type — and neutral, because a slot is not damage data. An
            ability with no slot (a basic attack reaches here through a different component) draws
            no tag at all rather than an empty box. */}
        {slot ? (
          <span className="chip__tag" aria-hidden="true">
            {slot}
          </span>
        ) : null}
      </span>
      <span className={`chip__type chip__type--${damageType ?? 'none'}`} aria-hidden="true">
        {damageType === null ? '—' : TYPE_WORD[damageType]}
      </span>
    </span>
  );
}
