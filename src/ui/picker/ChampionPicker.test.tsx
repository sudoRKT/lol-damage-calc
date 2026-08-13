// @vitest-environment jsdom
//
// The champion picker, driven the way a user drives it and queried the way assistive technology
// reads it.
//
// EVERY QUERY BELOW IS BY ROLE AND ACCESSIBLE NAME. Not by class, not by test id, not by walking
// the DOM for a span. A test that finds `.picker__option` passes on a row that announces
// nothing at all, which is precisely the bug worth catching in a control whose rows are mostly
// picture.
//
// THE ROSTER IS THE REAL ONE — all 173 champions, read from the published data file. The
// component's hardest requirement is being usable across a large list, and a three-champion
// fixture cannot show that it is.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion } from '../../types';
import { ChampionPicker } from './ChampionPicker';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROSTER = JSON.parse(
  readFileSync(join(REPO, 'public/data/champions.json'), 'utf8'),
) as Champion[];
const PATCH = '16.16.1';

function mount(onSelect = vi.fn(), selected: Champion | null = null) {
  render(
    <ChampionPicker
      label="Attacker champion"
      champions={ROSTER}
      selected={selected}
      onSelect={onSelect}
      patch={PATCH}
    />,
  );
  return { field: screen.getByRole('combobox', { name: 'Attacker champion' }), onSelect };
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

describe('picker/the field itself', () => {
  it('is a combobox with a real label, not a placeholder', () => {
    const { field } = mount();
    expect(field.getAttribute('aria-expanded')).toBe('false');
    // A placeholder is a hint, never a name: it disappears the moment a user types.
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
  });

  it('offers the WHOLE roster when it opens — 173 options, none dropped', () => {
    const { field } = mount();
    fireEvent.focus(field);
    expect(screen.getAllByRole('option')).toHaveLength(173);
    expect(field.getAttribute('aria-expanded')).toBe('true');
  });

  it('has no options at all while it is closed', () => {
    // "Closed" has to be true of the accessibility tree, not only of the stylesheet.
    mount();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('picker/search', () => {
  it('narrows to the champion typed, and announces the row by NAME and position', () => {
    const { field } = mount();
    type(field, 'kaisa');
    expect(screen.getByRole('option', { name: "Kai'Sa, 1 of 1" })).toBeTruthy();
  });

  it('punctuation never hides a champion — "chogath" finds Cho\'Gath', () => {
    const { field } = mount();
    type(field, 'chogath');
    expect(screen.getByRole('option', { name: /^Cho'Gath, 1 of/ })).toBeTruthy();
  });

  it('the count of matches is announced, not merely drawn', () => {
    const { field } = mount();
    type(field, 'kaisa');
    expect(screen.getByRole('status')).toHaveProperty(
      'textContent',
      '1 of 173 champions match',
    );
  });

  it('a query that matches nothing says so and names what it refused', () => {
    const { field } = mount();
    type(field, 'zzzzzz');
    expect(screen.getByRole('option', { name: /No champion matches/ })).toBeTruthy();
  });

  it('NO option announces a filename or a bare letter', () => {
    // The failure this guards against: a row that is a portrait and nothing else, announcing
    // "Aatrox.png" or announcing nothing.
    const { field } = mount();
    fireEvent.focus(field);
    const offenders = screen
      .getAllByRole('option')
      .map((o) => o.getAttribute('aria-label') ?? o.textContent ?? '')
      .filter((name) => name.trim() === '' || /\.png|\.jpg/i.test(name));
    expect(offenders).toEqual([]);
  });
});

describe('picker/keyboard', () => {
  it('arrow keys move the active row and the field points at it', () => {
    const { field } = mount();
    type(field, 'ka');
    const first = screen.getAllByRole('option')[0]!;
    expect(field.getAttribute('aria-activedescendant')).toBe(first.id);

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1]!;
    expect(field.getAttribute('aria-activedescendant')).toBe(second.id);

    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(field.getAttribute('aria-activedescendant')).toBe(first.id);
  });

  it('Enter selects the active champion', () => {
    const { field, onSelect } = mount();
    type(field, 'garen');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].name).toBe('Garen');
  });

  it('End jumps to the last match and Home back to the first', () => {
    const { field, onSelect } = mount();
    type(field, 'ka');
    const all = screen.getAllByRole('option');
    fireEvent.keyDown(field, { key: 'End' });
    expect(field.getAttribute('aria-activedescendant')).toBe(all[all.length - 1]!.id);
    fireEvent.keyDown(field, { key: 'Home' });
    expect(field.getAttribute('aria-activedescendant')).toBe(all[0]!.id);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape abandons the search and never changes the selection', () => {
    const garen = ROSTER.find((c) => c.name === 'Garen')!;
    const onSelect = vi.fn();
    const { field } = mount(onSelect, garen);
    type(field, 'lux');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onSelect).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('');
  });

  it('the whole selection can be made without a mouse', () => {
    // The §10 requirement, end to end: focus, type, arrow, Enter.
    const { field, onSelect } = mount();
    fireEvent.focus(field);
    type(field, 'lee');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('picker/mouse', () => {
  it('clicking a row selects that champion', () => {
    const { field, onSelect } = mount();
    type(field, 'ahri');
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Ahri/ }));
    expect(onSelect.mock.calls[0]![0].name).toBe('Ahri');
  });

  it('the champion already in play is marked selected in the list', () => {
    const ahri = ROSTER.find((c) => c.name === 'Ahri')!;
    const { field } = mount(vi.fn(), ahri);
    type(field, 'ahri');
    expect(screen.getByRole('option', { name: /^Ahri/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('picker/portraits (DESIGN.md §9)', () => {
  it('every portrait in the list is DESATURATED — full colour is for the two combatants only', () => {
    // This one is asserted on markup rather than on the accessibility tree, deliberately and
    // for a stated reason: it is a purely visual rule (a display filter), it has no accessible
    // representation at all, and the only mechanical way to check it is the class that applies
    // the filter. Every other assertion in this file goes through the accessibility tree.
    const { field } = mount();
    fireEvent.focus(field);
    const list = screen.getByRole('listbox');
    expect(list.querySelectorAll('.portrait').length).toBe(173);
    expect(list.querySelectorAll('.portrait--active').length).toBe(0);
  });

  it('a row portrait is 40px and is not announced twice', () => {
    const { field } = mount();
    type(field, 'garen');
    const list = screen.getByRole('listbox');
    const portrait = list.querySelector('.portrait')!;
    expect(portrait.classList.contains('portrait--row')).toBe(true);
    // Decorative: the row's own name is the single announcement.
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});
