// A RUNE ICON AS A DATA-CHIP. DESIGN.md §9.
//
// SPECIFICATION §10.1 uses official game art in place of text labels, and CLAUDE.md names rune
// icons explicitly alongside champion portraits, ability icons and item icons. §9 then says how:
// a small square at 32 / 24 / 20px, `--radius-control`, `--border-steel`.
//
// WHY THIS EXISTS AS A THIRD CHIP rather than `ItemChip` with a different word. The accessible
// name is the whole reason. `AbilityChip` announces a SLOT and an ability — "Q — Light Binding,
// magic damage"; `ItemChip` announces "Void Staff, item". A rune is neither, and announcing a
// rune as an item would be a sentence that is not true of the thing on screen. The rest of the
// construction is deliberately identical to `ItemChip`, because a rune and an item are the same
// KIND of thing on this page: a picked object that may or may not change a figure.
//
// WHY IT IS IN `src/ui/art/` AND NOT BESIDE THE RUNE PICKER. `art-usage.test.ts` refuses an
// `<img>` anywhere in `src/ui` outside this directory. That rule is what stops eight areas each
// building their own CDN path, and it is why the rune picker cannot render its own icons — it
// imports this instead. The picker area raised that rather than working around it, which is the
// partition doing its job.
//
// THE ICON URL IS NOT BUILT HERE. `runes.json` carries a full Data Dragon URL per rune, exactly as
// the item pool does, so there is no CDN path to construct.
//
// ═══ THE UNDERLINE AND THE TAG SAY "NO DAMAGE TYPE", AND THAT IS NOT THE SAME AS "NO DAMAGE" ═══
//
// A rune chip carries the neutral `--line-steel` underline and an em dash, exactly as an item chip
// does. **This says the CHIP has no damage type — it does not say the rune deals no damage.**
// 55 of the 62 published runes have no modelled effect and 1 changes a figure today, and that
// distinction belongs in the row's own status mark and its words, never in the art. A chip that
// tried to encode it would be a second, quieter status vocabulary competing with
// `VerificationStatusMark`, which is the one place that question is answered.

import './art.css';

export type RuneChipSize = 'combo' | 'table' | 'inline';

export interface RuneChipProps {
  /** Full rune icon URL, exactly as `runes.json` carries it. */
  src: string;
  /** The rune's name — the whole of what a screen reader hears. */
  runeName: string;
  /** 32px in a builder, 24px in tables, 20px inline (§9). */
  size?: RuneChipSize;
  /**
   * True when the chip sits inside something that already names the rune — a button carrying its
   * own accessible name, or a row whose text is the rune name. Same rule and same reason as
   * `ItemChip.decorative`: two labelled elements inside one control announce it twice.
   */
  decorative?: boolean;
}

/** The one text node a screen reader hears for a rune chip. */
export function runeChipAccessibleName(runeName: string): string {
  return `${runeName}, rune`;
}

export function RuneChip({ src, runeName, size = 'table', decorative = false }: RuneChipProps) {
  return (
    <span
      className={`chip chip--${size}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : runeChipAccessibleName(runeName)}
    >
      <img className="chip__img" src={src} alt="" aria-hidden="true" />
      {/* Neutral steel underline: this CHIP has no damage type. Whether the rune changes a figure
          is the row's status mark to say, not the art's. */}
      <span className="chip__underline chip__underline--none" aria-hidden="true" />
      {/* An em dash, not a letter: a rune has no ability slot, exactly as an item has none. */}
      <span className="chip__tag" aria-hidden="true">
        —
      </span>
    </span>
  );
}
