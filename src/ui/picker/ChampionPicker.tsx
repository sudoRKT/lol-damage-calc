// THE CHAMPION PICKER — searchable, keyboard-navigable, over the full 173-champion roster.
//
// SPECIFICATION §10: "Champion, item, and rune selection use searchable, keyboard-navigable
// pickers with autocomplete and filtering, since users perform these selections dozens of
// times per session across large lists." Everything below follows from that sentence and from
// DESIGN.md §9's portrait rules.
//
// WHAT IT IS, IN ACCESSIBILITY TERMS. A WAI-ARIA 1.2 combobox with a listbox popup: a real
// text input carrying `role="combobox"`, and a `role="listbox"` of `role="option"` rows. The
// active row is pointed at with `aria-activedescendant`, so FOCUS NEVER LEAVES THE INPUT —
// which is what lets a user keep typing to narrow the list while arrowing through it. Every
// row's accessible name is the champion's name and its position, so a screen reader announces
// "Kai'Sa, 42 of 173" and never a filename.
//
// WHY THE ROWS ARE NOT BUTTONS. A listbox option is not a button, and assistive technology
// announces the two completely differently — "option, 3 of 12, selected" versus "button". The
// roles here are the ones the pattern specifies, not the ones that were easiest to style.
//
// THE PORTRAITS ARE DESATURATED, ALL OF THEM (DESIGN.md §9). Full colour is reserved for the
// two active combatants, which are the nameplates elsewhere on the page — never a list row,
// however that row is selected. A picker list is a place to look for a champion, not a place a
// champion is in play, and keeping it desaturated is what stops 173 splash-coloured squares
// competing with the two that matter.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Champion } from '../../types';
import { ChampionPortrait } from '../art/ChampionPortrait';
import { portraitUrl } from '../data/roster';
import { filterChampions } from './filter';
import './picker.css';

export interface ChampionPickerProps {
  /** The field's visible label and accessible name, e.g. "Attacker champion". */
  label: string;
  /** The full roster. Never truncated by this component. */
  champions: readonly Champion[];
  /** The champion currently in play, or null when none has been chosen yet. */
  selected: Champion | null;
  onSelect: (champion: Champion) => void;
  /** Patch the art is served for, e.g. "16.16.1". */
  patch: string;
}

/**
 * The one text node a screen reader hears for a row.
 *
 * Built here rather than assembled from elements for the reason recorded in
 * `../primitives/accessible-names.test.tsx`: the accessibility tree trims each descendant's
 * text and joins the pieces with nothing between them, which runs words together.
 */
export function optionName(champion: Champion, position: number, of: number): string {
  return `${champion.name}, ${position} of ${of}`;
}

export function ChampionPicker({
  label,
  champions,
  selected,
  onSelect,
  patch,
}: ChampionPickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterChampions(champions, query), [champions, query]);

  // The active row can never point past the end of a list the user has just narrowed.
  useEffect(() => {
    setActiveIndex((i) => (i < matches.length ? i : 0));
  }, [matches.length]);

  // A click anywhere else closes the list. Without this the popup outlives the interaction and
  // sits over the panel below it.
  useEffect(() => {
    if (!open) return undefined;
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentPointerDown);
    return () => document.removeEventListener('mousedown', onDocumentPointerDown);
  }, [open]);

  const commit = (champion: Champion | undefined) => {
    if (!champion) return;
    onSelect(champion);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else
          setActiveIndex((i) =>
            matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
          );
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(Math.max(0, matches.length - 1));
        }
        break;
      case 'Enter':
        if (open) {
          event.preventDefault();
          commit(matches[activeIndex]);
        }
        break;
      case 'Escape':
        // Closes the list and clears the search text, leaving the current champion in play.
        // Escape never changes the selection — it abandons the search.
        event.preventDefault();
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="picker" ref={rootRef}>
      <label className="picker__label" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        className="picker__input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={selected ? selected.name : 'Search champions'}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {/*
        THE COUNT IS ANNOUNCED, not merely drawn. A sighted user sees the list shorten as they
        type; a screen reader user is told. `aria-live="polite"` waits for a pause in speech
        rather than interrupting on every keystroke.
      */}
      <span className="u-visually-hidden" role="status" aria-live="polite">
        {open ? `${matches.length} of ${champions.length} champions match` : ''}
      </span>

      <ul
        className={`picker__list${open ? '' : ' picker__list--closed'}`}
        id={listId}
        role="listbox"
        aria-label={label}
      >
        {/*
          THE ROWS EXIST ONLY WHILE THE LIST IS OPEN. Not a performance trick — a closed list
          whose options are still in the document is a list a screen reader can still walk into
          and a test can still find, which would make "closed" a claim about CSS rather than
          about the accessibility tree.
        */}
        {open
          ? matches.map((champion, index) => {
              const isActive = index === activeIndex;
              const isSelected = selected?.apiname === champion.apiname;
              return (
                <li
                  key={champion.apiname}
                  id={`${id}-opt-${index}`}
                  className={
                    `picker__option${isActive ? ' picker__option--active' : ''}` +
                    `${isSelected ? ' picker__option--selected' : ''}`
                  }
                  role="option"
                  aria-selected={isSelected}
                  // A pointer user gets the same active row a keyboard user gets, so the two
                  // never disagree about which row Enter would take.
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    // Down rather than click: a click fires after blur, and blur has already
                    // closed the list.
                    event.preventDefault();
                    commit(champion);
                  }}
                >
                  <ChampionPortrait
                    src={portraitUrl(patch, champion.icon)}
                    name={champion.name}
                    size="row"
                    active={false}
                    decorative
                  />
                  <span className="picker__option-name" aria-hidden="true">
                    {champion.name}
                  </span>
                  <span className="u-visually-hidden">
                    {optionName(champion, index + 1, matches.length)}
                  </span>
                </li>
              );
            })
          : null}

        {open && matches.length === 0 ? (
          // A refusal that says what it refused, not an empty box.
          <li className="picker__empty" role="option" aria-selected={false} aria-disabled>
            No champion matches “{query}”
          </li>
        ) : null}
      </ul>
    </div>
  );
}
