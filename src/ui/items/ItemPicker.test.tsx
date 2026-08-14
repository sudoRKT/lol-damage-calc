// @vitest-environment jsdom
//
// ITEM SELECTION, against the real 209-item pool.
//
// POPULATION, STATED: `public/data/items.json` as the pipeline published it — 209 items, 12
// distinct stat keys. Every count below is measured over that file, never over a fixture.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Item } from '../../types';
import { ItemPicker, ITEM_SLOTS, VISIBLE_MATCHES } from './ItemPicker';
import { filterItems } from './filter';
import { KNOWN_STAT_KEYS, itemGrantsText, statGrantText } from './stat-labels';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const POOL = JSON.parse(readFileSync(join(REPO, 'public/data/items.json'), 'utf8')) as Item[];

function mount(selected: number[] = []) {
  const calls: number[][] = [];
  render(
    <ItemPicker
      role="attacker"
      items={POOL}
      selected={selected}
      onChange={(ids) => calls.push(ids)}
    />,
  );
  return calls;
}

describe('items/population', () => {
  it('is looking at the real pool — 209 items', () => {
    expect(POOL).toHaveLength(209);
  });
});

describe('items/every stat key in the pool has a plain-English label', () => {
  it('names every key the 209 items actually carry — a new key fails here, not silently', () => {
    // THE MECHANICAL CHECK, over the whole population rather than the items somebody looked at.
    // A patch adding a thirteenth stat key would otherwise print `FlatOmnivampMod` at a user, or
    // — worse in a different way — be quietly left out of the description of what an item grants.
    const inPool = [...new Set(POOL.flatMap((i) => Object.keys(i.stats)))].sort();
    const unlabelled = inPool.filter((k) => !KNOWN_STAT_KEYS.includes(k));
    expect(unlabelled).toEqual([]);
    expect(inPool).toHaveLength(12);
  });

  it('every item in the pool produces a non-empty description of what it grants', () => {
    const empty = POOL.filter((i) => itemGrantsText(i.stats).trim().length === 0);
    expect(empty.map((i) => i.name)).toEqual([]);
  });

  it('the 15 items with no statistics say so rather than showing nothing', () => {
    const statless = POOL.filter((i) => Object.keys(i.stats).length === 0);
    expect(statless).toHaveLength(15);
    for (const item of statless) expect(itemGrantsText(item.stats)).toBe('no statistics');
  });

  it('a percentage key is stated as a percentage, not as the raw fraction', () => {
    // Data Dragon writes 0.35 for 35% attack speed. "0.35 attack speed" is a different fact.
    expect(statGrantText('PercentAttackSpeedMod', 0.35)).toBe('35% attack speed');
    expect(statGrantText('FlatPhysicalDamageMod', 60)).toBe('60 attack damage');
  });

  it('an unknown key is printed raw rather than guessed at or dropped', () => {
    expect(statGrantText('FlatSomethingNewMod', 7)).toBe('7 FlatSomethingNewMod');
  });
});

describe('items/searching the pool', () => {
  it('finds an item by a word in the middle of its name', () => {
    const names = filterItems(POOL, 'deathcap').map((i) => i.name);
    expect(names.some((n) => /Deathcap/.test(n))).toBe(true);
  });

  it('an empty query returns the whole pool, alphabetically', () => {
    const all = filterItems(POOL, '');
    expect(all).toHaveLength(209);
    expect(all[0]!.name.localeCompare(all[1]!.name)).toBeLessThanOrEqual(0);
  });

  it('a query matching nothing returns nothing rather than everything', () => {
    expect(filterItems(POOL, 'zzzzzzz')).toEqual([]);
  });

  it('draws at most VISIBLE_MATCHES controls and says how many matched', () => {
    mount();
    const adds = screen.getAllByRole('button', { name: /^Add / });
    expect(adds).toHaveLength(VISIBLE_MATCHES);
    expect(screen.getByText(new RegExp(`${POOL.length} of ${POOL.length} items match`))).toBeTruthy();
  });
});

describe('items/what a screen reader hears', () => {
  it('every add control names the item, the gold and what it grants — never an id', () => {
    mount();
    for (const button of screen.getAllByRole('button', { name: /^Add / })) {
      const name = button.getAttribute('aria-label') ?? '';
      expect(name).toMatch(/^Add .+ to the attacker's build — \d+ gold, .+/);
      expect(name).not.toMatch(/\.png|^Add \d+$/);
    }
  });

  it('every remove control names the item and its position in the build', () => {
    const deathcap = POOL.find((i) => /Deathcap/.test(i.name))!;
    mount([deathcap.id]);
    const remove = screen.getByRole('button', { name: /^Remove / });
    expect(remove.getAttribute('aria-label')).toContain(deathcap.name);
    expect(remove.getAttribute('aria-label')).toContain('item 1 of 1');
  });

  it('the search field has a real label, never a placeholder standing in for one', () => {
    mount();
    expect(screen.getByRole('searchbox', { name: 'Search attacker items' })).toBeTruthy();
  });
});

describe('items/adding and removing', () => {
  it('adding an item reports the new build, in order', () => {
    const calls = mount();
    const first = screen.getAllByRole('button', { name: /^Add / })[0]!;
    fireEvent.click(first);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it('removing an item reports the build without it, and keeps the rest in order', () => {
    const [a, b, c] = [POOL[0]!, POOL[1]!, POOL[2]!];
    const calls = mount([a.id, b.id, c.id]);
    const removes = screen.getAllByRole('button', { name: /^Remove / });
    fireEvent.click(removes[1]!);
    expect(calls[0]).toEqual([a.id, c.id]);
  });

  it('an item already in the build is not offered again', () => {
    const first = filterItems(POOL, '')[0]!;
    mount([first.id]);
    const button = screen.getByRole('button', { name: new RegExp(`^Add ${escape(first.name)}`) });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(within(button).getByText('in build')).toBeTruthy();
  });

  it('a full build stops offering adds and says why', () => {
    mount(filterItems(POOL, '').slice(0, ITEM_SLOTS).map((i) => i.id));
    expect(screen.getByText(/All 6 slots are full/)).toBeTruthy();
    for (const button of screen.getAllByRole('button', { name: /^Add / })) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
  });

  it('an id the pool does not carry is SHOWN, not silently dropped from the build', () => {
    // The engine refuses the whole scenario for this id by name. A build that quietly lost the
    // row would leave a user unable to find what caused the refusal.
    mount([999999]);
    expect(screen.getByText(/Item id 999999 is not in this patch/)).toBeTruthy();
  });
});

/** Escape a name for use inside a RegExp — item names carry apostrophes and dots. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
