// WHERE FOCUS GOES WHEN A ROW IS REMOVED — one rule, for the whole interface.
//
// ═══ THE DEFECT, MEASURED ═══
//
// On 2026-08-15, pressing a remove control left `document.activeElement === document.body`. The
// removal was ANNOUNCED correctly, so a screen-reader user was told the row had gone and then had
// nowhere to stand, and a keyboard user restarted tabbing from the top of the document. Being told
// what happened and losing your place is arguably worse than not being told: the announcement
// promises the interface is keeping up with you.
//
// ═══ WHY ONE RULE AND NOT FOUR LOCAL FIXES ═══
//
// A survey came before the fix, and it is the reason this file exists rather than a patch in one
// component. **There are exactly two removal sites in the product** and both had the defect:
//
//   - `combo/ComboBuilder.tsx` — the step remove control
//   - `items/ItemPicker.tsx` — the item remove control, on the attacker AND the defender
//
// And one that looked like a third and is not: `picker/ChampionPicker.tsx` REPLACES a selection
// rather than removing a row, and correctly keeps focus in its combobox. It was nearly reported as
// a defect — a synthetic click on a non-focusable list item appeared to drop focus, and driving the
// same control by keyboard showed focus retained. The near-miss is recorded because the same
// mistake is available to anyone reading this file.
//
// ═══ THE RULE, IN ONE SENTENCE ═══
//
// **When a row is removed, focus moves to the same control on the row that takes its place; if the
// removed row was the last, to that control on the new last row; and if the list is now empty, to
// the control that adds a new row.**
//
// ═══ TWO THINGS THE CALLER MUST GET RIGHT, BOTH LEARNED THE HARD WAY ═══
//
// 1. **Call it from `useLayoutEffect`, not `useEffect`.** Focus must land before the browser
//    paints, or it sits on the body for a frame — which assistive technology can and does observe.
// 2. **No dependency array.** With one, the second and third removals do not fire. The intent is
//    carried in a ref that this hook clears, so running on every render is correct and cheap.
//
// ═══ WHAT IT MUST NOT COST ═══
//
// Reordering a row keeps focus on the MOVED control, because a list keyed by a stable id makes
// React move the existing DOM node rather than rebuild it. That is a real strength and predates
// this rule. Nothing here touches the reorder path: the intent is armed only by a removal.
//
// ═══ TESTING IT: fireEvent.click DOES NOT FOCUS ITS TARGET ═══
//
// Any focus assertion written on a bare `fireEvent.click` measures jsdom rather than the
// component — a real activation always focuses first. Two reorder tests looked broken for exactly
// this reason and were correct in a browser all along. Focus the control, then activate it.

/** What the rule was able to do. Returned so a caller can assert on it rather than infer. */
export type FocusAfterRemovalOutcome = 'row' | 'fallback' | 'nowhere';

/**
 * @param list             the container the rows live in, or null if it is not mounted
 * @param controlSelector  the control to focus on each row — the same control that was pressed
 * @param removedIndex     the index the removed row occupied, captured BEFORE the re-render
 * @param fallback         where to go when no row remains: the control that adds a new one
 */
export function focusAfterRemoval(
  list: HTMLElement | null,
  controlSelector: string,
  removedIndex: number,
  fallback: HTMLElement | null,
): FocusAfterRemovalOutcome {
  const controls = list ? [...list.querySelectorAll<HTMLElement>(controlSelector)] : [];
  if (controls.length > 0) {
    // The row that slid into the removed row's index. When the removed row was the last there is
    // no such row, so `Math.min` steps back to the new last row instead.
    controls[Math.min(removedIndex, controls.length - 1)]!.focus();
    return 'row';
  }
  if (fallback) {
    fallback.focus();
    return 'fallback';
  }
  // NOT silent: a caller with neither a row nor a fallback has nowhere to put focus, and saying so
  // is how that shows up in a test rather than as a body-focused page nobody notices.
  return 'nowhere';
}
