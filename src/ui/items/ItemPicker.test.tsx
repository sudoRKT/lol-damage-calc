// @vitest-environment jsdom
//
// ITEM SELECTION, against the real 209-item pool.
//
// POPULATION, STATED: `public/data/items.json` as the pipeline published it — 209 items, 12
// distinct stat keys. Every count below is measured over that file, never over a fixture.

import { describe, expect, it, afterEach } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Item } from '../../types';
import {
  ItemPicker,
  ITEM_SLOTS,
  VISIBLE_MATCHES,
  statusLine,
  FULL_BUILD_NOTICE,
} from './ItemPicker';
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

/** The search field, by the words a screen reader hears. */
const field = () => screen.getByRole('searchbox', { name: 'Search attacker items' });

/**
 * Open the pool the way a user does.
 *
 * THE POOL IS NOT DRAWN AT REST — changed 2026-08-14, and every test below that reaches for an
 * add control now goes through here. That is not a test bending to the code: the collapsed
 * state is a specified behaviour with its own tests immediately below, and these tests are
 * about what happens once the pool is open, which is a different question.
 */
function openPool() {
  fireEvent.focus(field());
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
    openPool();
    const adds = screen.getAllByRole('button', { name: /^Add / });
    expect(adds).toHaveLength(VISIBLE_MATCHES);
    expect(screen.getByText(new RegExp(`${POOL.length} of ${POOL.length} items match`))).toBeTruthy();
  });
});

// =========================================================================================
// THE POOL AT REST. Added 2026-08-14 with the behaviour it describes.
//
// The pool used to draw eight items at all times — the first eight of 209 alphabetically,
// which is an accident of sorting rather than information, and 213px of the first screen.
// It now collapses to one line and opens on focus or on typing.
//
// WHAT THESE TESTS EXIST TO PROTECT is the difference between COLLAPSED and HIDDEN. A
// collapsed pool states its own size and how to open it; a hidden one leaves a user guessing
// whether a search field has anything behind it.
// =========================================================================================

describe('items/the pool at rest', () => {
  it('draws no add control at all before the search field is touched', () => {
    mount();
    expect(screen.queryAllByRole('button', { name: /^Add / })).toHaveLength(0);
  });

  it('says how many items are behind the search rather than showing nothing', () => {
    mount();
    expect(screen.getByText(`${POOL.length} items — search to add`)).toBeTruthy();
  });

  it('the collapsed line names the REAL pool size, not the drawn cap', () => {
    // "8 items — search to add" would be a lie about a 209-item pool, and it is the exact lie
    // a component that reused the drawn list would tell.
    mount();
    expect(screen.getByText(/209 items/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(`^${VISIBLE_MATCHES} items`))).toBeNull();
  });

  it('opens on focus', () => {
    mount();
    openPool();
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(VISIBLE_MATCHES);
  });

  it('opens on typing, and stays open for as long as the query is non-empty', () => {
    mount();
    fireEvent.change(field(), { target: { value: 'deathcap' } });
    expect(screen.getAllByRole('button', { name: /^Add / }).length).toBeGreaterThan(0);
    // Focus leaves entirely — the query alone keeps it open, because a user who has typed a
    // search and looked away has not finished with the results.
    fireEvent.blur(field(), { relatedTarget: document.body.appendChild(document.createElement('button')) });
    expect(screen.getAllByRole('button', { name: /^Add / }).length).toBeGreaterThan(0);
  });

  it('closes again when focus lands outside it and the field is empty', () => {
    mount();
    openPool();
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(VISIBLE_MATCHES);
    const elsewhere = document.body.appendChild(document.createElement('button'));
    fireEvent.blur(field(), { relatedTarget: elsewhere });
    expect(screen.queryAllByRole('button', { name: /^Add / })).toHaveLength(0);
  });

  it('DOES NOT close when focus moves from the field to one of its own results', () => {
    // The keyboard path: tab out of the search field and into the first add control. If the
    // pool closed on that blur the control would vanish from under the user mid-tab.
    mount();
    openPool();
    const first = screen.getAllByRole('button', { name: /^Add / })[0]!;
    fireEvent.blur(field(), { relatedTarget: first });
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(VISIBLE_MATCHES);
  });

  it('adding an item leaves the pool open, with focus in the search field', () => {
    // The control just clicked becomes disabled, and a disabled element cannot hold focus, so
    // without the deliberate refocus the pool would shut the moment a user succeeded in using
    // it. This is the regression test for that.
    mount();
    openPool();
    fireEvent.click(screen.getAllByRole('button', { name: /^Add / })[0]!);
    expect(document.activeElement).toBe(field());
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(VISIBLE_MATCHES);
  });
});

describe('items/the status line says one true thing in every state', () => {
  const total = POOL.length;

  it('collapsed: the pool size and how to open it', () => {
    expect(statusLine({ showPool: false, matched: total, total })).toBe(
      '209 items — search to add',
    );
  });

  it('open and capped: what matched AND that only some are drawn', () => {
    expect(statusLine({ showPool: true, matched: total, total })).toBe(
      `209 of 209 items match. Showing the first ${VISIBLE_MATCHES} — keep typing to narrow.`,
    );
  });

  it('open and uncapped: no dangling promise to keep typing', () => {
    expect(statusLine({ showPool: true, matched: 3, total })).toBe(
      '3 of 209 items match.',
    );
  });

  it('a full build no longer overrides it — the sentence has its own line now', () => {
    // CHANGED DELIBERATELY, 2026-08-15, and this test was rewritten to state the new contract
    // rather than deleted. It used to assert that `full` overrode every other state HERE.
    // That made this live region change whenever the BUILD changed, which is what collided
    // with the announcement region — see "two live regions" below for the measurement. The
    // sentence is not gone: it is `FULL_BUILD_NOTICE`, on screen, in a line that is not live.
    expect(FULL_BUILD_NOTICE).toBe('All 6 slots are full. Remove an item to add another.');
    expect(statusLine({ showPool: true, matched: total, total })).toMatch(/items match/);
    expect(statusLine({ showPool: false, matched: total, total })).toBe(
      '209 items — search to add',
    );
  });
});

describe('items/what a screen reader hears', () => {
  it('every add control names the item, the gold and what it grants — never an id', () => {
    mount();
    openPool();
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
    openPool();
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
    openPool();
    const button = screen.getByRole('button', { name: new RegExp(`^Add ${escape(first.name)}`) });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(within(button).getByText('in build')).toBeTruthy();
  });

  it('a full build stops offering adds and says why', () => {
    mount(filterItems(POOL, '').slice(0, ITEM_SLOTS).map((i) => i.id));
    // The collapsed line already says it — a user does not have to open the pool to be told.
    expect(screen.getByText(/All 6 slots are full/)).toBeTruthy();
    openPool();
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

// =========================================================================================
// WHERE FOCUS GOES WHEN AN ITEM IS REMOVED. Added 2026-08-15.
//
// MEASURED BEFORE THE FIX: pressing an item's remove control left
// `document.activeElement === document.body`, on the attacker and the defender alike. The
// removal was announced correctly, so a screen reader user was told the item had gone and
// then had nowhere to stand, and a keyboard user restarted tabbing from the top of the page.
//
// THE RULE IS NOT THIS COMPONENT'S OWN. It is `focusAfterRemoval` in `../primitives`, shared
// with the combo builder, which is the other of the product's two removal sites.
//
// TWO THINGS THESE TESTS DO ON PURPOSE:
//   • They mount a STATEFUL harness. `ItemPicker` is controlled, so a test that never feeds
//     the new build back never re-renders the list — and a focus rule that runs after the
//     re-render would have nothing to measure.
//   • They FOCUS a control before pressing it. `fireEvent.click` does not focus its target,
//     so an assertion written on a bare click measures jsdom rather than the component.
// =========================================================================================

/** The controlled component, driven by state, the way `App` drives it. */
function StatefulItems({ initial }: { initial: number[] }) {
  const [ids, setIds] = useState(initial);
  return <ItemPicker role="attacker" items={POOL} selected={ids} onChange={setIds} />;
}

function mountStateful(initial: number[]) {
  render(<StatefulItems initial={initial} />);
}

const removes = () => screen.getAllByRole('button', { name: /^Remove / });

/**
 * Activate a control the way a person does: focus first, THEN press.
 *
 * The focus goes through `act` because focusing a control INSIDE the find area opens the pool,
 * which is a state change — without it React warns, and the warning is the honest one.
 */
function press(control: HTMLElement) {
  act(() => control.focus());
  fireEvent.click(control);
}

describe('items/where focus goes when an item is removed', () => {
  const build = [POOL[0]!, POOL[1]!, POOL[2]!];

  it('never leaves focus on the document body — the measured defect, at every position', () => {
    for (const position of [0, 1, 2]) {
      cleanup();
      mountStateful(build.map((i) => i.id));
      press(removes()[position]!);
      expect(document.activeElement).not.toBe(document.body);
    }
  });

  it('lands on the remove control of the item that took the removed one’s place', () => {
    mountStateful(build.map((i) => i.id));
    press(removes()[0]!);
    // The build is now [1, 2]; the row at index 0 is the item that was second.
    expect(document.activeElement).toBe(removes()[0]!);
    expect(document.activeElement?.getAttribute('aria-label')).toContain(build[1]!.name);
  });

  it('lands on the new LAST control when the removed item was last', () => {
    mountStateful(build.map((i) => i.id));
    press(removes()[2]!);
    expect(removes()).toHaveLength(2);
    expect(document.activeElement).toBe(removes()[1]!);
    expect(document.activeElement?.getAttribute('aria-label')).toContain(build[1]!.name);
  });

  it('lands on the search field when the last item leaves and no row remains', () => {
    // The same place adding sends focus, so the two paths agree rather than each having
    // their own idea of where a user is next.
    mountStateful([build[0]!.id]);
    press(removes()[0]!);
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(0);
    expect(document.activeElement).toBe(field());
  });

  it('moves focus on the SECOND and THIRD removal too, not only the first', () => {
    // The regression this guards is a dependency array on the layout effect: with one, the
    // intent is armed but the effect never runs again.
    mountStateful(build.map((i) => i.id));
    press(removes()[0]!);
    expect(document.activeElement).toBe(removes()[0]!);
    press(removes()[0]!);
    expect(document.activeElement).toBe(removes()[0]!);
    press(removes()[0]!);
    expect(document.activeElement).toBe(field());
  });

  it('counts rows that HAVE a remove control, not rows — an unknown id carries none', () => {
    // `[unknown, a, b]` draws three rows and two remove controls. Handing the rule the row
    // index would step past the end of the controls it can actually focus.
    mountStateful([999999, build[0]!.id, build[1]!.id]);
    expect(removes()).toHaveLength(2);
    press(removes()[0]!);
    expect(removes()).toHaveLength(1);
    expect(document.activeElement).toBe(removes()[0]!);
    expect(document.activeElement?.getAttribute('aria-label')).toContain(build[1]!.name);
  });
});

// =========================================================================================
// THE TWO LIVE REGIONS, AND WHAT EACH IS FOR. Added 2026-08-15.
//
// MEASURED BEFORE THE FIX, on one user action each:
//   • Filling the sixth slot moved BOTH regions, and both carried the slot count.
//   • Removing from a full build moved BOTH regions, and the visible one reverted to a
//     sentence about the SEARCH POOL — "155 of 209 items match…" — at the instant the user
//     removed an item, which is not what they did.
//
// STATED HONESTLY: this measures DOM text changing in response to one user action. It is not
// screen reader output; nobody has run a screen reader here. Two polite regions changing at
// once MAY be coalesced, reordered or dropped, and that risk is the reason for the split
// below rather than a confirmed behaviour.
//
// THE SPLIT: the visible line states POOL facts (how many items, how many match, how many are
// drawn) and changes only when the user searches. The hidden announcement states BUILD facts
// (what was added or removed, and how many slots are used) and changes only when the user
// adds or removes. Neither carries the other's fact.
// =========================================================================================

/** Every live region on the page, as nodes that stay mounted across a re-render. */
const regions = () => [...document.querySelectorAll<HTMLElement>('[role="status"]')];

/**
 * Run one user action and report the live regions whose text CHANGED because of it.
 * Returns the text each changed region ended up holding.
 */
function regionsMovedBy(action: () => void): string[] {
  const nodes = regions();
  const before = nodes.map((n) => n.textContent ?? '');
  action();
  return nodes
    .map((n, i) => ({ text: n.textContent ?? '', changed: (n.textContent ?? '') !== before[i] }))
    .filter((r) => r.changed)
    .map((r) => r.text);
}

describe('items/two live regions, never the same fact twice', () => {
  const sixIds = filterItems(POOL, '').slice(0, ITEM_SLOTS).map((i) => i.id);

  it('filling the sixth slot moves exactly ONE region — the announcement', () => {
    mountStateful(sixIds.slice(0, ITEM_SLOTS - 1));
    openPool();
    const add = screen.getAllByRole('button', { name: /^Add / }).find((b) => !b.hasAttribute('disabled'))!;
    const moved = regionsMovedBy(() => press(add));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/added\. 6 of 6 slots used\./);
  });

  it('removing from a full build moves exactly ONE region, and it is the announcement', () => {
    mountStateful(sixIds);
    openPool();
    const moved = regionsMovedBy(() => press(removes()[0]!));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/removed\. 5 of 6 slots used\./);
    // The sentence that used to arrive here instead. It is about the search pool, and a
    // removal is not a search.
    expect(moved[0]).not.toMatch(/items match/);
  });

  it('the visible pool line never states a slot count, in any state', () => {
    // The mechanical version of "never the same fact twice": the slot count is the build's
    // fact and belongs to the announcement alone.
    for (const showPool of [true, false]) {
      for (const matched of [0, 3, POOL.length]) {
        expect(statusLine({ showPool, matched, total: POOL.length })).not.toMatch(/slot/i);
      }
    }
  });

  it('typing moves only the pool line, and says nothing about the build', () => {
    // The control case: this one was already correct and must stay correct.
    mountStateful([]);
    openPool();
    const moved = regionsMovedBy(() => fireEvent.change(field(), { target: { value: 'deathcap' } }));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/items match/);
  });

  it('a full build still SAYS so on screen — the sentence moved, it was not dropped', () => {
    mountStateful(sixIds);
    expect(screen.getByText(/All 6 slots are full\. Remove an item to add another\./)).toBeTruthy();
  });

  it('the full-build sentence is NOT in a live region, so an add cannot fire it', () => {
    mountStateful(sixIds);
    const notice = screen.getByText(/All 6 slots are full/);
    expect(notice.closest('[role="status"]')).toBeNull();
    expect(notice.closest('[aria-live]')).toBeNull();
  });

  it('RESIDUAL, stated rather than hidden: emptying the build moves two regions', () => {
    // Removing the LAST item sends focus to the search field, which opens the pool — so the
    // pool line changes because the pool really did open. The two sentences describe two
    // different things and neither repeats the other, which is the bar set above.
    mountStateful([POOL[0]!.id]);
    const moved = regionsMovedBy(() => press(removes()[0]!));
    expect(moved).toHaveLength(2);
    expect(moved.filter((t) => /removed\. 0 of 6 slots used\./.test(t))).toHaveLength(1);
    expect(moved.filter((t) => /items match/.test(t))).toHaveLength(1);
  });
});

/** Escape a name for use inside a RegExp — item names carry apostrophes and dots. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
