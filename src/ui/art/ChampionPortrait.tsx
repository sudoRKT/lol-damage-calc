// Champion portraits. DESIGN.md §9.
//
// Portraits are DESATURATED and tinted toward the panel surface while a champion is unselected or
// inactive, and resolve to full colour only for the two combatants in play. That is a display
// filter, not an edit to the asset — SPECIFICATION §15 permits Data Dragon art as shipped, and
// recolouring it would not be permitted.
//
// The point of the filter is attention: the dense build and picker lists stay calm, and the eye
// goes to the two champions the result is about.

import './art.css';

export interface ChampionPortraitProps {
  src: string;
  /** Champion name, spoken. */
  name: string;
  /** 64px for a combatant nameplate, 40px for a picker row (§9). */
  size?: 'nameplate' | 'row';
  /** Full colour and a bone border when true; desaturated when false. */
  active?: boolean;
  /**
   * True when the portrait sits inside a control that ALREADY names the champion.
   *
   * Without this the accessible name is spoken twice — a picker button holding a portrait and
   * the visible word "Garen" announces "Garen Garen". A decorative portrait is hidden from
   * assistive technology entirely, so the control's own label is the single name.
   */
  decorative?: boolean;
}

export function ChampionPortrait({
  src,
  name,
  size = 'nameplate',
  active = true,
  decorative = false,
}: ChampionPortraitProps) {
  return (
    <img
      className={`portrait portrait--${size}${active ? ' portrait--active' : ''}`}
      src={src}
      alt={decorative ? '' : name}
      aria-hidden={decorative || undefined}
      width={size === 'nameplate' ? 64 : 40}
      height={size === 'nameplate' ? 64 : 40}
    />
  );
}
