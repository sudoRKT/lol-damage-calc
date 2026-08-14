// AN ITEM ICON AS A DATA-CHIP. DESIGN.md §9.
//
// SPECIFICATION §10.1 uses official game art in place of text labels, and names item icons
// explicitly. §9 then says how: a small square at 32 / 24 / 20px, `--radius-control`,
// `--border-steel` — and, because an item that only grants statistics deals no damage, a NEUTRAL
// `--line-steel` underline and an em-dash marker instead of a P/M/T tag. That is the same
// construction `AbilityChip` uses for a non-damaging ability: visibly "no damage type", never an
// omission.
//
// WHY THIS IS A SECOND COMPONENT RATHER THAN `AbilityChip` WITH DIFFERENT PROPS. AbilityChip's
// accessible name is built from a SLOT and an ability name — "Q — Light Binding, magic damage".
// An item has no slot, and passing "Item" as one would announce a sentence that is not true of
// the thing on screen. The art sweep (`art-usage.test.ts`) requires every `<img>` in the area to
// live in `src/ui/art/`, which is why this file is here and not next to the item picker.
//
// THE ICON URL IS NOT BUILT HERE. `Item.icon` in the published pool is already a full Data Dragon
// URL, so there is no CDN path to construct — `data/roster.ts` remains the one place that builds
// one.

import './art.css';

export type ItemChipSize = 'combo' | 'table' | 'inline';

export interface ItemChipProps {
  /** Full item icon URL, exactly as `Item.icon` carries it. */
  src: string;
  /** The item's name — the whole of what a screen reader hears. */
  itemName: string;
  /** 32px in a builder, 24px in tables, 20px inline (§9). */
  size?: ItemChipSize;
  /**
   * True when the chip sits inside something that already names the item — a button carrying its
   * own accessible name, or a row whose text is the item name. Same rule and same reason as
   * `AbilityChip.decorative`: two labelled elements inside one control announce it twice.
   */
  decorative?: boolean;
}

/** The one text node a screen reader hears for an item chip. */
export function itemChipAccessibleName(itemName: string): string {
  return `${itemName}, item`;
}

export function ItemChip({ src, itemName, size = 'table', decorative = false }: ItemChipProps) {
  return (
    <span
      className={`chip chip--${size}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : itemChipAccessibleName(itemName)}
    >
      <img className="chip__img" src={src} alt="" aria-hidden="true" />
      {/* Neutral steel underline and an em dash: this chip deals no damage, and says so. */}
      <span className="chip__underline chip__underline--none" aria-hidden="true" />
      <span className="chip__tag chip__tag--none" aria-hidden="true">
        —
      </span>
    </span>
  );
}
