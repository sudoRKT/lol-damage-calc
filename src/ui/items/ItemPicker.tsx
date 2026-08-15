// ITEM SELECTION — SPECIFICATION §2, step 3: "The user selects items from the full item pool."
//
// THE POOL IS THE WHOLE 209. Nothing is pre-filtered by role, class or popularity: a filter this
// product invented would decide for the user which builds are worth testing, and a theorycrafter's
// question is usually about the build nobody builds.
//
// WHAT A KEYBOARD USER CAN DO. Everything. A real `<input type="search">` narrows the list, and
// every result is a real `<button>` — so tab, arrow-within-the-page, Enter and Space all work
// with no key handling of this component's own. Nothing here is drag-and-drop.
//
// WHAT A SCREEN READER HEARS. Names and grants, never ids or filenames: "Add Rabadon's Deathcap
// to the attacker's build — 3600 gold, 130 ability power". Every add and remove is announced
// through a polite live region, the same way the combo builder announces an edit, because a
// change that is only visible is a change a screen reader user cannot confirm happened.
//
// SIX SLOTS, STATED ON SCREEN. A champion carries six item slots in the game, so the sixth add
// fills the build and the shelf says so rather than silently doing nothing. Duplicates are not
// offered: an item already in the build shows as "in build" instead of as an add control.
//
// WHAT IT DOES NOT MODEL, and the engine says so on every result rather than this panel guessing:
// item PASSIVES and ACTIVES. Only an item's structured statistics reach the calculation.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '../../types';
import { ItemChip } from '../art/ItemChip';
import { focusAfterRemoval } from '../primitives';
import { filterItems } from './filter';
import { itemGrantsText } from './stat-labels';
import './items.css';

/** Item slots a champion carries in the game. The sixth add fills the build. */
export const ITEM_SLOTS = 6;

/**
 * How many matches are drawn at once. The rest are reached by narrowing the search.
 *
 * A COUNT, NOT A HEIGHT. The obvious alternative is a scrolling region with a fixed maximum
 * height — but DESIGN.md defines no such height, and inventing one locally is the exact move its
 * preamble forbids. Capping the count needs no design value at all, and the panel states the cap
 * and the number of matches on screen so nothing is hidden silently.
 */
export const VISIBLE_MATCHES = 8;

/**
 * The one sentence that states the build is full. VISIBLE, and deliberately NOT in a live
 * region — see `statusLine` for the measurement that moved it out of one.
 */
const REMOVE_TO_ADD = 'Remove an item to add another.';
export const FULL_BUILD_NOTICE = `All ${ITEM_SLOTS} slots are full. ${REMOVE_TO_ADD}`;

/**
 * THE POOL IS NOT DRAWN AT REST. It appears on focus or on typing, and collapses to one line.
 *
 * WHY. At rest the pool drew the first eight items of the pool alphabetically — Abyssal Mask,
 * Aegis of the Legion, and so on. That is not information; it is an accident of sorting, and it
 * cost 213px of the first screen, which DESIGN-AUDIT.md measured as the largest single block
 * standing between a reader and the HP burndown.
 *
 * NOTHING IS HIDDEN, AND THE COLLAPSED LINE SAYS SO. It reads "209 items — search to add",
 * naming the size of the pool it is standing in for, so the reader knows what is one keystroke
 * away rather than being left to guess that a search field has anything behind it. Browsing is
 * one interaction away, not thinned: the cap is still eight and it is still stated on screen.
 *
 * ═══ THIS LINE STATES POOL FACTS ONLY, AND THAT IS A CHANGE — 2026-08-15 ═══
 *
 * A FULL BUILD USED TO OVERRIDE IT, so the sentence "All 6 slots are full…" arrived here. That
 * made this live region change when the BUILD changed, and it collided with the announcement
 * region twice, measured on one user action each:
 *
 *   • Filling the sixth slot moved both regions, and BOTH carried the slot count.
 *   • Removing from a full build moved both, and this one reverted to "155 of 209 items
 *     match…" — a sentence about the search pool, delivered at the moment the user removed an
 *     item. Not duplication: an interruption carrying unrelated content.
 *
 * The fix is a split by ownership, not a deletion. This line owns the POOL (how many items,
 * how many match, how many are drawn) and moves only when the user searches. The hidden
 * announcement owns the BUILD (what was added or removed, how many slots are used) and moves
 * only when the user adds or removes. `FULL_BUILD_NOTICE` is still on screen, in its own
 * non-live line, so a user browsing the pool still reads why nothing can be added.
 *
 * STATED HONESTLY: the collision was measured as DOM text changing on one user action, not as
 * screen reader output. Nobody has run a screen reader here. That two polite regions changing
 * at once MAY be coalesced, reordered or dropped is the risk this answers, not a confirmed
 * behaviour.
 */
export function statusLine(state: { showPool: boolean; matched: number; total: number }): string {
  if (!state.showPool) return `${state.total} items — search to add`;
  const capped =
    state.matched > VISIBLE_MATCHES
      ? ` Showing the first ${VISIBLE_MATCHES} — keep typing to narrow.`
      : '';
  return `${state.matched} of ${state.total} items match.${capped}`;
}

export interface ItemPickerProps {
  /** "attacker" or "defender" — spoken inside every control's name. */
  role: string;
  /** The full item pool. Never truncated by this component; only the DRAWN list is capped. */
  items: readonly Item[];
  /** The build, as `ChampionConfig.items` carries it: item ids, in the order they were added. */
  selected: readonly number[];
  onChange: (ids: number[]) => void;
}

/** The one text node an add control announces. */
export function addItemName(item: Item, role: string): string {
  return `Add ${item.name} to the ${role}'s build — ${item.gold.total} gold, ${itemGrantsText(item.stats)}`;
}

/** The one text node a remove control announces. */
export function removeItemName(item: Item, role: string, position: number, of: number): string {
  return `Remove ${item.name} from the ${role}'s build, item ${position} of ${of}`;
}

export function ItemPicker({ role, items, selected, onChange }: ItemPickerProps) {
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const buildRef = useRef<HTMLUListElement>(null);
  /**
   * The position among the REMOVE CONTROLS that was just removed, or null. Armed by a removal
   * and consumed by the layout effect below.
   *
   * AMONG THE CONTROLS, NOT AMONG THE ROWS. A build can hold an id this patch's pool does not
   * carry; that row is drawn but has no remove control, so a row index would step past the end
   * of the controls the rule can actually focus.
   */
  const removedControl = useRef<number | null>(null);

  // A LAYOUT effect, not a plain one: focus lands before the browser paints, so it never
  // visibly sits on the body for a frame. No dependency array, on purpose — with one, the
  // second and third removals do not fire. Both rules are `focusAfterRemoval`'s, not this
  // component's; the combo builder's remove control obeys the same one.
  useLayoutEffect(() => {
    const index = removedControl.current;
    if (index === null) return;
    removedControl.current = null;
    focusAfterRemoval(
      buildRef.current,
      '.items__remove',
      index,
      // Nothing is left to stand on, so focus goes where ADDING also sends it: the search
      // field. A user who has just emptied the build is going there next, and the two paths
      // agreeing is worth more than either being individually clever.
      searchRef.current,
    );
  });

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const matches = useMemo(() => filterItems(items, query), [items, query]);
  const drawn = matches.slice(0, VISIBLE_MATCHES);

  const build = selected.map((id) => ({ id, item: byId.get(id) }));
  const full = selected.length >= ITEM_SLOTS;

  /** Whether the pool is drawn. See `POOL_AT_REST` below for why this is not always true. */
  const showPool = focused || query.trim() !== '';

  const add = (item: Item) => {
    if (full || selected.includes(item.id)) return;
    onChange([...selected, item.id]);
    const used = selected.length + 1;
    // The add that fills the last slot carries the reason as well as the count. The visible
    // `FULL_BUILD_NOTICE` appears at the same moment but is not announced — it is not a live
    // region — so without this clause the instruction would reach only a sighted reader.
    setAnnouncement(
      `${item.name} added. ${used} of ${ITEM_SLOTS} slots used.` +
        (used >= ITEM_SLOTS ? ` ${REMOVE_TO_ADD}` : ''),
    );
    // FOCUS RETURNS TO THE SEARCH FIELD, and this is load-bearing rather than a nicety. The
    // control just clicked becomes `disabled` (the item is now in the build), and a disabled
    // element cannot hold focus — so the browser drops focus to the document body, the pool
    // sees focus leave, and it would close under the user the instant they used it. Sending
    // focus back to the field keeps the pool open AND puts the caret where the next search is
    // typed, which is where a user adding a second item is going anyway.
    searchRef.current?.focus();
  };

  const remove = (item: Item, index: number, controlIndex: number) => {
    // Arm the focus rule BEFORE the state change, so the layout effect that runs after the
    // re-render knows which control vanished.
    removedControl.current = controlIndex;
    onChange(selected.filter((_, i) => i !== index));
    setAnnouncement(`${item.name} removed. ${selected.length - 1} of ${ITEM_SLOTS} slots used.`);
  };

  return (
    <section className="items" aria-label={`${role} items`}>
      {/* The title and the slot count are one statement — "Items, 0 of 6 slots used" — so they
          share one line. Five stacked lines of chrome stood between this heading and the first
          item; this is two. Nothing is dropped, only relaid. */}
      <header className="items__head">
        <h3 className="items__title">Items</h3>
        {/* ---- The build ---- */}
        <p className="items__count">
          {selected.length} of {ITEM_SLOTS} item slots used
        </p>
      </header>
      {build.length === 0 ? (
        <p className="items__empty">No items. The build is base statistics only.</p>
      ) : (
        <ul className="items__build" ref={buildRef}>
          {build.map(({ id, item }, index) => (
            <li className="items__slot" key={`${id}-${index}`}>
              {item ? (
                <>
                  <ItemChip src={item.icon} itemName={item.name} size="table" decorative />
                  <span className="items__name">{item.name}</span>
                  <span className="items__grants">{itemGrantsText(item.stats)}</span>
                  <button
                    type="button"
                    className="items__remove"
                    aria-label={removeItemName(item, role, index + 1, build.length)}
                    onClick={() =>
                      // The second index is this control's position among the remove controls,
                      // which is the count of DRAWABLE items before it — see `removedControl`.
                      remove(item, index, build.slice(0, index).filter((b) => b.item).length)
                    }
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </>
              ) : (
                // AN ID THE POOL DOES NOT CARRY IS SHOWN, NOT DROPPED. The engine refuses the
                // whole scenario for it by name, and the user needs to see the row that caused it
                // — a build that silently loses a slot is a build a user cannot fix.
                <span className="items__unknown">
                  Item id {id} is not in this patch’s item pool.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ═══ THE POOL, AND WHY IT IS NOT DRAWN AT REST ═══
          See `POOL_AT_REST` below. The whole find-an-item area is one focus scope: focus
          anywhere inside it — the field or any result — opens the pool, and it closes only
          when focus lands on something outside it. That is what lets a keyboard user tab from
          the field into the results without the results disappearing under them. */}
      <div
        className="items__find"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          // `relatedTarget` is what is GAINING focus. When it is null the focus went nowhere —
          // a disabled control, a click on dead space — and closing then would be closing for
          // no reason the user can see, so the pool stays open until focus lands somewhere.
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        {/* The search label sits BESIDE its field rather than above it. It is still the field's
            own <label>, so the accessible name is unchanged; it is one line instead of two. */}
        <label className="items__search">
          <span className="items__search-label">{`Search ${role} items`}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>

        {/* A LIVE REGION, so the pool opening is not a visual-only event. A sighted user sees
            the results appear on focus; without this a screen reader user would be told only
            that a search field has focus. It is polite, so it never interrupts, and it carries
            the sentence the reader actually needs — how many matched and how many are drawn.

            IT STATES POOL FACTS ONLY. The full-build sentence used to override it from here,
            which made this region fire on a BUILD change and collide with the announcement
            below. See `statusLine` for the measurement. */}
        <p className="items__status" role="status" aria-live="polite">
          {statusLine({ showPool, matched: matches.length, total: items.length })}
        </p>

        {/* The build fact, VISIBLE and NOT LIVE, standing next to the pool it constrains — a
            reader browsing the disabled add controls needs to know why they are disabled, and
            a disabled control cannot be tabbed to to find out. The announcement region says
            the same thing at the moment the sixth slot fills; this line says it for as long
            as it is true. */}
        {full ? <p className="items__full">{FULL_BUILD_NOTICE}</p> : null}

        {showPool ? (
          <ul className="items__pool">
            {drawn.map((item) => {
              const already = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="items__add"
                    aria-label={addItemName(item, role)}
                    disabled={full || already}
                    onClick={() => add(item)}
                  >
                    <ItemChip src={item.icon} itemName={item.name} size="table" decorative />
                    <span className="items__name">{item.name}</span>
                    <span className="items__grants">{itemGrantsText(item.stats)}</span>
                    <span className="items__gold">
                      {already ? 'in build' : `${item.gold.total}g`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <span className="u-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
