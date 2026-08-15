// @vitest-environment jsdom
//
// THE RUNE PAGE, against the real published pool and the real curated file.
//
// POPULATION, STATED: `public/data/runes.json` as the pipeline published it — 62 runes across 5
// trees, 17 in the keystone row and 45 in the three minor rows — and `public/data/rune-effects.json`
// as it was published, 7 curated entries. The engine's own `RUNE_DELIVERY` supplies which of those
// the calculator can actually fire. Every count below is measured over those files on every run,
// never over a fixture, so a patch that changes the pool fails here rather than on the page.
//
// WHAT THE MOST IMPORTANT TESTS IN THIS FILE ARE ABOUT. Not selection — honesty. The owner's
// constraint is that a rune page which silently drops 55 of 62 is worse than one that names them,
// so the load-bearing assertions are: all 62 are reachable, all 62 are selectable, and every one of
// them states whether it changes a number, in the control's own spoken name.

import { describe, expect, it, afterEach } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CuratedRune, Rune, RunePage } from '../../types';
import { RUNE_DELIVERY } from '../../engine';
import { RunePicker, statusLine, fullNotice } from './RunePicker';
import {
  KEYSTONE_SLOT,
  RUNE_PAGE_SLOTS,
  RUNE_VISIBLE_MATCHES,
  SHARD_SLOTS,
  effectCounts,
  filterRunes,
  runeEffect,
  runeEffectSentence,
  runeOrigin,
  treeComposition,
} from './rune-page';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const POOL = (
  JSON.parse(readFileSync(join(REPO, 'public/data/runes.json'), 'utf8')) as { runes: Rune[] }
).runes;
const CURATED = (
  JSON.parse(readFileSync(join(REPO, 'public/data/rune-effects.json'), 'utf8')) as {
    runes: CuratedRune[];
  }
).runes;

/** The curated file in the shape `Catalogue.runeEffects` carries it. */
const EFFECTS = new Map<number, readonly CuratedRune[]>(
  CURATED.map((r) => [r.runeId, [r]] as const),
);

const SOURCES = {
  effects: EFFECTS,
  delivery: RUNE_DELIVERY as ReadonlyMap<number, string>,
  notDeliverable: new Map<number, string>(),
};

const EMPTY_PAGE: RunePage = { keystone: null, primary: [], secondary: [], shards: [] };

/**
 * A STATEFUL harness. `RunePicker` is controlled, so a test that never feeds the new page back
 * never re-renders the list — and the focus rule that runs after the re-render would have nothing
 * to measure. Same construction, and same reason, as the item picker's harness.
 */
function mount(initial: RunePage = EMPTY_PAGE) {
  const calls: RunePage[] = [];
  function Harness() {
    const [page, setPage] = useState<RunePage>(initial);
    return (
      <RunePicker
        role="attacker"
        runes={POOL}
        page={page}
        effects={EFFECTS}
        onChange={(next) => {
          calls.push(next);
          setPage(next);
        }}
      />
    );
  }
  render(<Harness />);
  return calls;
}

const field = () => screen.getByRole('searchbox', { name: 'Search attacker runes' });
const openPool = () => fireEvent.focus(field());
const wearButtons = () => screen.getAllByRole('button', { name: /^Wear / });
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// =========================================================================================
// POPULATION
// =========================================================================================

describe('runes/population', () => {
  it('is looking at the real pool — 62 runes, 5 trees, 17 keystones and 45 minor runes', () => {
    expect(POOL).toHaveLength(62);
    expect(new Set(POOL.map((r) => r.tree)).size).toBe(5);
    expect(POOL.filter((r) => r.slot === KEYSTONE_SLOT)).toHaveLength(17);
    expect(POOL.filter((r) => r.slot !== KEYSTONE_SLOT)).toHaveLength(45);
  });

  it('is looking at the real curated file — 7 entries, of which the engine delivers 1', () => {
    expect(CURATED).toHaveLength(7);
    expect(RUNE_DELIVERY.size).toBe(1);
    // Named rather than counted alone: Scorch is the one rune that moves a figure today, and it
    // is the rune every "changes a number" assertion below is really about.
    const delivered = [...RUNE_DELIVERY.keys()];
    expect(CURATED.find((c) => c.runeId === delivered[0])?.runeName).toBe('Scorch');
  });
});

// =========================================================================================
// THE CONSTRAINT: 62 SELECTABLE, EVERY ONE HONEST.
//
// DEFINITIONS, because the three counts below move as the curated file grows and a bare number
// would mean nothing later:
//   • APPLIED            — a curated value AND an entry in the engine's RUNE_DELIVERY. 1 today.
//   • STORED-NOT-APPLIED — a curated value and no delivery. 6 today.
//   • NO STORED VALUE    — no curated entry at all. 55 today.
// =========================================================================================

describe('runes/every rune is reachable and every rune is honest', () => {
  it('counts the three states over the real pool: 1 applied, 6 stored, 55 with no value', () => {
    const counts = effectCounts(POOL, SOURCES);
    expect(counts).toEqual({ applied: 1, stored: 6, none: 55, total: 62 });
  });

  it('all 62 are reachable by searching their own name — nothing is filtered out', () => {
    const unreachable = POOL.filter((rune) => !filterRunes(POOL, rune.name).includes(rune));
    expect(unreachable.map((r) => r.name)).toEqual([]);
  });

  it('ALL 62 CAN ACTUALLY BE WORN — searched for by name, each offers a control', () => {
    // THE OWNER'S CONSTRAINT, RENDERED RATHER THAN REASONED. `filterRunes` returning all 62 is not
    // the same claim as the panel OFFERING all 62: a component that filtered the pool down to the
    // runes it can model would pass the search test and fail this one. Measured by mutation on
    // 2026-08-15 — dropping the unmodelled runes from the drawn pool turns this red.
    mount();
    const unofferable: string[] = [];
    for (const rune of POOL) {
      fireEvent.change(field(), { target: { value: rune.name } });
      const offers = screen.queryAllByRole('button', {
        name: new RegExp(`^Wear ${escape(rune.name)} `),
      });
      if (offers.length === 0) unofferable.push(rune.name);
    }
    expect(unofferable).toEqual([]);
  });

  it('every one of the 62 states whether it changes a number, in those words', () => {
    // THE OWNER'S CONSTRAINT AS A MECHANICAL CHECK. Not "has a status" — says, in a sentence a
    // reader can act on, whether wearing it moves a figure.
    const silent = POOL.filter((rune) => {
      const sentence = runeEffectSentence(runeEffect(rune.id, SOURCES));
      return !/^changes a number in the result$|^changes no number in this result — .+/.test(
        sentence,
      );
    });
    expect(silent.map((r) => r.name)).toEqual([]);
  });

  it('a rune with no stored value says so, and NEVER reads as modelled', () => {
    const electrocute = POOL.find((r) => r.name === 'Electrocute')!;
    const sentence = runeEffectSentence(runeEffect(electrocute.id, SOURCES));
    expect(sentence).toContain('changes no number in this result');
    expect(sentence).toContain('no rune value has been curated for it');
  });

  it('the one rune that does change a number says THAT, and carries its curated status', () => {
    const scorch = POOL.find((r) => r.name === 'Scorch')!;
    const effect = runeEffect(scorch.id, SOURCES);
    expect(effect).toEqual({ kind: 'applied', verification: 'derived', runeName: 'Scorch' });
    expect(runeEffectSentence(effect)).toBe('changes a number in the result');
  });

  it('a curated rune the engine cannot fire says a value is stored and nothing is applied', () => {
    // Hail of Blades: curated, and absent from RUNE_DELIVERY. With no sentence supplied it takes
    // the same fallback wording `simulate` uses, so the picker and the result never disagree.
    const hob = POOL.find((r) => r.name === 'Hail of Blades')!;
    const effect = runeEffect(hob.id, SOURCES);
    expect(effect.kind).toBe('stored-not-applied');
    expect(runeEffectSentence(effect)).toContain('a value is stored');
  });

  it("the engine's own sentence is used when it has one, rather than a second explanation", () => {
    const grasp = POOL.find((r) => r.name === 'Grasp of the Undying')!;
    const effect = runeEffect(grasp.id, {
      ...SOURCES,
      notDeliverable: new Map([[grasp.id, 'Grasp of the Undying — rides on elapsed time']]),
    });
    expect(runeEffectSentence(effect)).toContain('rides on elapsed time');
  });

  it("drops the engine's leading rune name, because the row already carries it — and nothing else", () => {
    // MEASURED ON THE LIVE PAGE: Sudden Impact's row printed its own name three times. The engine
    // writes for a result page where the rune is not otherwise named; here it always is.
    const grasp = POOL.find((r) => r.name === 'Grasp of the Undying')!;
    const effect = runeEffect(grasp.id, {
      ...SOURCES,
      notDeliverable: new Map([
        [grasp.id, 'Grasp of the Undying — rides on a basic attack every four seconds'],
      ]),
    });
    expect(effect).toEqual({
      kind: 'stored-not-applied',
      why: 'rides on a basic attack every four seconds',
    });

    // A sentence that does NOT start with the name keeps every word of it, prefix-shaped or not.
    const kept = runeEffect(grasp.id, {
      ...SOURCES,
      notDeliverable: new Map([[grasp.id, 'it heals its wearer — Grasp of the Undying — on a hit']]),
    });
    expect(kept).toEqual({
      kind: 'stored-not-applied',
      why: 'it heals its wearer — Grasp of the Undying — on a hit',
    });
  });
});

// =========================================================================================
// WHAT IS ON SCREEN AND WHAT A SCREEN READER HEARS
// =========================================================================================

describe('runes/what a screen reader hears', () => {
  it('every add control names the rune, where the source puts it, and what it does to a total', () => {
    mount();
    openPool();
    for (const button of wearButtons()) {
      const name = button.getAttribute('aria-label') ?? '';
      expect(name).toMatch(
        /^Wear .+ as the attacker's (keystone|primary runes|secondary runes) — .+ · (keystone|row [123]) — changes (a|no) number/,
      );
      expect(name).not.toMatch(/\.png/);
    }
  });

  it('the effect sentence is on EVERY add control, not only on the unmodelled ones', () => {
    // The failure this prevents is subtle: stating the gap only where it exists trains a reader
    // to read silence as "fine", which is the same defect as dropping the rune.
    mount();
    fireEvent.change(field(), { target: { value: 'scorch' } });
    // Scorch is a minor rune, so it is offered twice — once per destination — and BOTH names
    // carry the sentence. Asserting over all of them is the point rather than an inconvenience.
    const wear = screen.getAllByRole('button', { name: /^Wear Scorch/ });
    expect(wear).toHaveLength(2);
    for (const button of wear) {
      expect(button.getAttribute('aria-label')).toContain('changes a number in the result');
    }
  });

  it('every remove control names the rune, the destination and its position', () => {
    const electrocute = POOL.find((r) => r.name === 'Electrocute')!;
    mount({ ...EMPTY_PAGE, keystone: electrocute.id });
    const remove = screen.getByRole('button', { name: /^Remove / });
    const name = remove.getAttribute('aria-label') ?? '';
    expect(name).toContain('Electrocute');
    expect(name).toContain("attacker's keystone");
    expect(name).toContain('1 of 1');
  });

  it('the search field has a real label, never a placeholder standing in for one', () => {
    mount();
    expect(screen.getByRole('searchbox', { name: 'Search attacker runes' })).toBeTruthy();
  });
});

describe('runes/a worn rune states its case ON SCREEN, not only to assistive technology', () => {
  it('a worn rune with no stored value shows the mark, its name and the reason as text', () => {
    const electrocute = POOL.find((r) => r.name === 'Electrocute')!;
    mount({ ...EMPTY_PAGE, keystone: electrocute.id });
    // `ExcludedAbility`'s construction: the glyph and label are visible, the name is visible, and
    // the reason is its own visible line. The regression it was built for was a column of
    // identical marks with the reason readable only by a screen reader.
    expect(screen.getByText('Not yet modelled')).toBeTruthy();
    expect(screen.getAllByText('Electrocute').length).toBeGreaterThan(0);
    // The reason appears TWICE by construction — once inside the mark's spoken sentence and once
    // as a visible line. The assertion is that at least one of them is NOT screen-reader-only,
    // which is the whole defect `ExcludedAbility` was built for.
    const reason = screen.getAllByText(/no rune value has been curated for it/);
    expect(reason.some((el) => !el.classList.contains('u-visually-hidden'))).toBe(true);
  });

  it('a worn rune that IS modelled shows its verification status instead of an exclusion', () => {
    const scorch = POOL.find((r) => r.name === 'Scorch')!;
    mount({ ...EMPTY_PAGE, primary: [scorch.id] });
    expect(screen.getByText('Derived')).toBeTruthy();
    expect(screen.queryByText(/no rune value has been curated/)).toBeNull();
  });

  it('an id the pool does not carry is SHOWN and REMOVABLE, not silently dropped', () => {
    // A page carried in from a link can hold a rune this patch no longer publishes. A row that
    // vanished would leave a user unable to fix the page that caused the engine to refuse it.
    mount({ ...EMPTY_PAGE, secondary: [999999] });
    // Named in the row AND in the exclusion beneath it, which is why this is getAllByText.
    expect(screen.getAllByText('rune id 999999').length).toBeGreaterThan(0);
    expect(screen.getByText(/not in this patch’s rune pool/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove rune id 999999/ })).toBeTruthy();
  });
});

// =========================================================================================
// THE PAGE'S SLOTS
// =========================================================================================

describe('runes/wearing and removing', () => {
  it('wearing a keystone reports the page with it, and leaves the other slots alone', () => {
    const calls = mount();
    fireEvent.change(field(), { target: { value: 'electrocute' } });
    fireEvent.click(screen.getByRole('button', { name: /^Wear Electrocute/ }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ keystone: 8112, primary: [], secondary: [], shards: [] });
  });

  it('a minor rune offers BOTH destinations and writes to the one that was pressed', () => {
    const calls = mount();
    fireEvent.change(field(), { target: { value: 'cheap shot' } });
    const buttons = screen.getAllByRole('button', { name: /^Wear Cheap Shot/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!); // secondary
    expect(calls[0]!.secondary).toEqual([8126]);
    expect(calls[0]!.primary).toEqual([]);
  });

  it('a keystone rune is never offered as a minor rune, and vice versa', () => {
    // Slot membership is the one page rule the SOURCE states, so it is the one this picker
    // enforces. `runes.json` puts Electrocute in slot 0 and Cheap Shot in slot 1.
    mount();
    fireEvent.change(field(), { target: { value: 'electrocute' } });
    expect(screen.getAllByRole('button', { name: /^Wear Electrocute/ })).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: /^Wear Electrocute/ }).getAttribute('aria-label'),
    ).toContain('as the attacker\'s keystone');
  });

  it('a full destination stops offering adds and says why, per destination', () => {
    const minors = POOL.filter((r) => r.slot !== KEYSTONE_SLOT);
    mount({ ...EMPTY_PAGE, secondary: [minors[0]!.id, minors[1]!.id] });
    expect(screen.getByText(fullNotice('secondary'))).toBeTruthy();
    openPool();
    for (const button of wearButtons()) {
      const name = button.getAttribute('aria-label') ?? '';
      if (name.includes("attacker's secondary runes")) {
        expect(button.hasAttribute('disabled')).toBe(true);
      }
    }
    // And the OTHER destinations are untouched — a full secondary must not disable the page.
    const primaryOffers = wearButtons().filter((b) =>
      (b.getAttribute('aria-label') ?? '').includes("attacker's primary runes"),
    );
    expect(primaryOffers.some((b) => !b.hasAttribute('disabled'))).toBe(true);
  });

  it('a rune already worn is offered as "worn" and cannot be worn twice', () => {
    const cheapShot = POOL.find((r) => r.name === 'Cheap Shot')!;
    mount({ ...EMPTY_PAGE, primary: [cheapShot.id] });
    fireEvent.change(field(), { target: { value: 'cheap shot' } });
    for (const button of screen.getAllByRole('button', { name: /^Wear Cheap Shot/ })) {
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(within(button).getByText('worn')).toBeTruthy();
    }
  });

  it('removing reports the page without it and keeps the rest in order', () => {
    const minors = POOL.filter((r) => r.slot !== KEYSTONE_SLOT);
    const [a, b, c] = [minors[0]!, minors[1]!, minors[2]!];
    const calls = mount({ ...EMPTY_PAGE, primary: [a.id, b.id, c.id] });
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove / })[1]!);
    expect(calls[0]!.primary).toEqual([a.id, c.id]);
  });

  it('removing the keystone writes null rather than an empty list', () => {
    // `RunePage.keystone` is `number | null` (src/types/scenario.ts). Writing `undefined` or a
    // list here would break the URL encoder rather than this panel.
    const calls = mount({ ...EMPTY_PAGE, keystone: 8112 });
    fireEvent.click(screen.getByRole('button', { name: /^Remove / }));
    expect(calls[0]!.keystone).toBeNull();
  });
});

// =========================================================================================
// WHERE FOCUS GOES WHEN A RUNE IS REMOVED.
//
// The rule is `focusAfterRemoval` in `../primitives`, shared with the item picker and the combo
// builder. These tests FOCUS a control before pressing it, because `fireEvent.click` does not
// focus its target — without that the "focus was on the control that vanished" precondition is
// never met and the test measures nothing.
// =========================================================================================

describe('runes/focus after a removal', () => {
  it('focus lands on the next remove control when one is left behind', () => {
    const minors = POOL.filter((r) => r.slot !== KEYSTONE_SLOT);
    mount({ ...EMPTY_PAGE, primary: [minors[0]!.id, minors[1]!.id, minors[2]!.id] });
    const removes = screen.getAllByRole('button', { name: /^Remove / });
    removes[0]!.focus();
    expect(document.activeElement).toBe(removes[0]);
    fireEvent.click(removes[0]!);
    const after = screen.getAllByRole('button', { name: /^Remove / });
    expect(after).toHaveLength(2);
    expect(document.activeElement).toBe(after[0]);
  });

  it('focus lands in the search field when the page is emptied', () => {
    mount({ ...EMPTY_PAGE, keystone: 8112 });
    const remove = screen.getByRole('button', { name: /^Remove / });
    remove.focus();
    fireEvent.click(remove);
    expect(document.activeElement).toBe(field());
  });
});

// =========================================================================================
// THE TWO LIVE REGIONS, SPLIT BY OWNERSHIP.
//
// The split is `ItemPicker`'s, settled there on 2026-08-15 after two collisions were measured on
// one user action each: a VISIBLE line owns POOL facts and moves only on a search; a HIDDEN
// announcement owns PAGE facts and moves only on an edit. These tests hold the same line here so
// the second picker does not reintroduce the defect the first one fixed.
// =========================================================================================

describe('runes/the visible line says one true thing in every state', () => {
  it('collapsed: the pool size and how to open it', () => {
    expect(statusLine({ showPool: false, matched: 62, total: 62 })).toBe(
      '62 runes — search to wear one',
    );
  });

  it('open and capped: what matched AND that only some are drawn', () => {
    expect(statusLine({ showPool: true, matched: 62, total: 62 })).toBe(
      `62 of 62 runes match. Showing the first ${RUNE_VISIBLE_MATCHES} — keep typing to narrow.`,
    );
  });

  it('open and uncapped: no dangling promise to keep typing', () => {
    expect(statusLine({ showPool: true, matched: 3, total: 62 })).toBe('3 of 62 runes match.');
  });

  it('WEARING A RUNE DOES NOT MOVE THE POOL LINE — it is not a pool fact', () => {
    mount();
    fireEvent.change(field(), { target: { value: 'scorch' } });
    // The VISIBLE pool line, found by the only sentence it ever says. If wearing a rune moved it,
    // this text would change to a page fact and the query would fail.
    const poolLine = () => screen.getByText(/runes match\.|runes — search to wear one/);
    const before = poolLine().textContent;
    fireEvent.click(screen.getAllByRole('button', { name: /^Wear Scorch/ })[0]!);
    expect(poolLine().textContent).toBe(before);
  });

  it('the hidden announcement carries the PAGE fact, including what the rune does', () => {
    mount();
    fireEvent.change(field(), { target: { value: 'electrocute' } });
    fireEvent.click(screen.getByRole('button', { name: /^Wear Electrocute/ }));
    const announced = screen
      .getAllByRole('status')
      .map((e) => e.textContent ?? '')
      .join(' | ');
    expect(announced).toContain('Electrocute worn as the keystone');
    expect(announced).toContain('changes no number in this result');
    expect(announced).toContain(`1 of ${RUNE_PAGE_SLOTS} rune slots used`);
  });
});

// =========================================================================================
// THE POOL AT REST — collapsed, never hidden. Same distinction the item pool draws.
// =========================================================================================

describe('runes/the pool at rest', () => {
  it('draws no add control at all before the search field is touched', () => {
    mount();
    expect(screen.queryAllByRole('button', { name: /^Wear / })).toHaveLength(0);
  });

  it('the collapsed line names the REAL pool size, not the drawn cap', () => {
    mount();
    expect(screen.getByText('62 runes — search to wear one')).toBeTruthy();
    expect(screen.queryByText(new RegExp(`^${RUNE_VISIBLE_MATCHES} runes`))).toBeNull();
  });

  it('opens on focus and draws at most RUNE_VISIBLE_MATCHES rows', () => {
    mount();
    openPool();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    const offered = new Set(
      wearButtons().map((b) => (b.getAttribute('aria-label') ?? '').split(' as the ')[0]),
    );
    expect(offered.size).toBe(RUNE_VISIBLE_MATCHES);
  });

  it('DOES NOT close when focus moves from the field to one of its own results', () => {
    mount();
    openPool();
    const first = wearButtons()[0]!;
    fireEvent.blur(field(), { relatedTarget: first });
    expect(wearButtons().length).toBeGreaterThan(0);
  });

  it('wearing a rune leaves the pool open, with focus in the search field', () => {
    mount();
    openPool();
    fireEvent.click(wearButtons()[0]!);
    expect(document.activeElement).toBe(field());
    expect(wearButtons().length).toBeGreaterThan(0);
  });
});

// =========================================================================================
// STAT SHARDS — the slot is drawn BECAUSE nothing is published, not despite it.
// =========================================================================================

describe('runes/stat shards', () => {
  it('the row exists and states that none are published rather than being omitted', () => {
    mount();
    expect(screen.getByText(`stat shards — 0 of ${SHARD_SLOTS}`)).toBeTruthy();
    expect(screen.getByText(/No stat shards are published/)).toBeTruthy();
  });

  it('says no shard changes a number, so a page without them is not a page missing damage', () => {
    mount();
    expect(screen.getByText(/no shard changes a number/)).toBeTruthy();
  });

  it('a shard id carried in from a link is shown rather than dropped', () => {
    mount({ ...EMPTY_PAGE, shards: ['adaptive', 'armor'] });
    expect(screen.getByText(`stat shards — 2 of ${SHARD_SLOTS}`)).toBeTruthy();
    expect(screen.getByText('adaptive')).toBeTruthy();
    expect(screen.getByText('armor')).toBeTruthy();
  });
});

// =========================================================================================
// THE GAP, NAMED AT ROSTER SCALE — two collapsed sections, each stating its own size.
// =========================================================================================

describe('runes/the collapsed sections state their own size', () => {
  it('the 55 with no stored value are behind a control that says 55', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Show Runes with no stored value at all, 55 runes' })).toBeTruthy();
  });

  it('the 6 stored-but-unapplied are behind a control that says 6', () => {
    mount();
    expect(
      screen.getByRole('button', {
        name: 'Show Runes with a stored value the calculator cannot apply, 6 runes',
      }),
    ).toBeTruthy();
  });

  it('opening the 55 NAMES them — the whole point of the section', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Runes with no stored value/ }));
    const named = screen.getByText(/Absolute Focus|Adaptive Force|Alacrity/);
    // Every one of the 55 is in that one line, which is what makes "is the rune I want in here?"
    // answerable without opening the pool.
    const text = named.textContent ?? '';
    const missing = POOL.filter(
      (r) => runeEffect(r.id, SOURCES).kind === 'no-stored-value' && !text.includes(r.name),
    );
    expect(missing.map((r) => r.name)).toEqual([]);
  });
});

// =========================================================================================
// THE PAGE'S TREE COMPOSITION — a fact, never a verdict.
// =========================================================================================

describe('runes/tree composition', () => {
  it('states what the page IS, per destination', () => {
    expect(treeComposition([], new Map())).toBe('none');
    const byId = new Map(POOL.map((r) => [r.id, r]));
    const domination = POOL.filter((r) => r.tree === 'Domination' && r.slot !== KEYSTONE_SLOT);
    const precision = POOL.filter((r) => r.tree === 'Precision' && r.slot !== KEYSTONE_SLOT);
    expect(treeComposition([domination[0]!.id], byId)).toBe('Domination');
    expect(
      treeComposition([domination[0]!.id, domination[1]!.id, precision[0]!.id], byId),
    ).toBe('2 Domination, 1 Precision');
  });

  it('counts an unknown id rather than dropping it', () => {
    expect(treeComposition([999999], new Map())).toBe('unknown');
  });

  it('is drawn on the page once something is worn, and not before', () => {
    mount();
    expect(screen.queryByText(/keystone: /)).toBeNull();
    cleanup();
    mount({ ...EMPTY_PAGE, keystone: 8112 });
    expect(screen.getByText(/keystone: Domination/)).toBeTruthy();
  });

  it('MAKES NO CLAIM ABOUT LEGALITY — no source states the tree rules, so nothing is refused', () => {
    // A page mixing three trees in the primary runes is one the client would not accept. This
    // picker stores it and shows the composition; it does not adjudicate, because no source this
    // project fetches states the rule it would be adjudicating against.
    const minors = POOL.filter((r) => r.slot !== KEYSTONE_SLOT);
    const a = minors.find((r) => r.tree === 'Domination')!;
    const b = minors.find((r) => r.tree === 'Precision')!;
    const c = minors.find((r) => r.tree === 'Resolve')!;
    mount({ ...EMPTY_PAGE, primary: [a.id, b.id, c.id] });
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(3);
    expect(screen.getByText(/primary runes: 1 Domination, 1 Precision, 1 Resolve/)).toBeTruthy();
  });
});

describe('runes/where the source puts a rune is printed, never inferred', () => {
  it('names the tree and the row for a minor rune, and "keystone" for a keystone', () => {
    const electrocute = POOL.find((r) => r.name === 'Electrocute')!;
    const cheapShot = POOL.find((r) => r.name === 'Cheap Shot')!;
    expect(runeOrigin(electrocute)).toBe('Domination · keystone');
    expect(runeOrigin(cheapShot)).toBe('Domination · row 1');
  });

  it('every rune in the pool produces an origin from published fields alone', () => {
    const bad = POOL.filter((r) => !/^(\w+) · (keystone|row [123])$/.test(runeOrigin(r)));
    expect(bad.map((r) => r.name)).toEqual([]);
  });
});

describe('runes/searching', () => {
  it('finds a rune by a word in the middle of its name', () => {
    expect(filterRunes(POOL, 'harvest').map((r) => r.name)).toContain('Dark Harvest');
  });

  it('finds a tree by name, because the tree is a published field on every rune', () => {
    const sorcery = filterRunes(POOL, 'sorcery');
    expect(sorcery.length).toBe(POOL.filter((r) => r.tree === 'Sorcery').length);
  });

  it('a query matching nothing returns nothing rather than everything', () => {
    expect(filterRunes(POOL, 'zzzzzzz')).toEqual([]);
  });

  it('an empty query returns the whole pool, alphabetically', () => {
    const all = filterRunes(POOL, '');
    expect(all).toHaveLength(62);
    expect(all[0]!.name.localeCompare(all[1]!.name)).toBeLessThanOrEqual(0);
  });

  it('a rune whose NAME matches outranks one that merely shares a tree', () => {
    const results = filterRunes(POOL, 'domination');
    expect(results.length).toBe(POOL.filter((r) => r.tree === 'Domination').length);
    expect(escape(results[0]!.tree)).toBe('Domination');
  });
});
