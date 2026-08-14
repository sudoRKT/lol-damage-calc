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

import { useMemo, useState } from 'react';
import type { Item } from '../../types';
import { ItemChip } from '../art/ItemChip';
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

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const matches = useMemo(() => filterItems(items, query), [items, query]);
  const drawn = matches.slice(0, VISIBLE_MATCHES);

  const build = selected.map((id) => ({ id, item: byId.get(id) }));
  const full = selected.length >= ITEM_SLOTS;

  const add = (item: Item) => {
    if (full || selected.includes(item.id)) return;
    onChange([...selected, item.id]);
    setAnnouncement(`${item.name} added. ${selected.length + 1} of ${ITEM_SLOTS} slots used.`);
  };

  const remove = (item: Item, index: number) => {
    onChange(selected.filter((_, i) => i !== index));
    setAnnouncement(`${item.name} removed. ${selected.length - 1} of ${ITEM_SLOTS} slots used.`);
  };

  return (
    <section className="items" aria-label={`${role} items`}>
      <h3 className="items__title">Items</h3>

      {/* ---- The build ---- */}
      <p className="items__count">
        {selected.length} of {ITEM_SLOTS} item slots used
      </p>
      {build.length === 0 ? (
        <p className="items__empty">No items. The build is base statistics only.</p>
      ) : (
        <ul className="items__build">
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
                    onClick={() => remove(item, index)}
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

      {/* ---- The pool ---- */}
      <label className="items__search">
        <span className="items__search-label">{`Search ${role} items`}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>

      <p className="items__status">
        {full
          ? `All ${ITEM_SLOTS} slots are full. Remove an item to add another.`
          : `${matches.length} of ${items.length} items match. ${
              matches.length > VISIBLE_MATCHES
                ? `Showing the first ${VISIBLE_MATCHES} — keep typing to narrow.`
                : ''
            }`}
      </p>

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
                <span className="items__gold">{already ? 'in build' : `${item.gold.total}g`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <span className="u-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
