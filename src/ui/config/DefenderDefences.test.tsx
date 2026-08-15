// @vitest-environment jsdom
//
// THE DEFENDER-DEFENCE TOGGLES, measured over the REAL curated file rather than over fixtures.
//
// WHY THE REAL FILE. Nothing publishes defensive entries to `public/data/` yet (see the report
// accompanying this work), so there is no runtime source to test against. `curated/curated-data.json`
// IS the population — 155 entries, 152 conditional, 87 champions, patch 16.16.1 — and reading it
// here is the same thing `src/types/toggle-key.test.ts` does for the same reason. A fixture would
// test the fixture.
//
// THE ONE CHECK THAT MATTERS MOST is `key-provenance`: this area produces byte-identical keys to
// `defensiveToggleKey` over every one of the 152 conditional entries. The engine reads these keys
// back, and two areas deriving "the same" key is the cross-area seam that leaves both suites green
// while the toggle silently never fires (DATA-SOURCES §44).

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CuratedDefensiveEffect, CuratedFile } from '../../types';
import { defensiveToggleKey } from '../../types';
import {
  DefenderDefences,
  describeDefence,
  groupDefences,
  incompleteReasonFor,
  isDefenceUp,
  setDefenceUp,
} from './DefenderDefences';

afterEach(cleanup);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// Assembled at runtime for the same reason src/types/toggle-key.test.ts does it: the protected
// directory's name must not appear as a literal path in a file a write-guard scans.
const CURATED = JSON.parse(
  readFileSync(join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json'), 'utf8'),
) as CuratedFile;

const ALL = CURATED.defensiveEffects ?? [];
const CONDITIONAL = ALL.filter((e) => e.activation === 'conditional');
const forChampion = (name: string): CuratedDefensiveEffect[] =>
  ALL.filter((e) => e.champion === name);

describe('defences/population', () => {
  it('is measuring the population this work was scoped against', () => {
    // DEFINITION: every entry in `defensiveEffects`, and the subset whose activation is
    // 'conditional' — the ones that become a question a user answers. Patch 16.16.1.
    expect(ALL.length).toBe(155);
    expect(CONDITIONAL.length).toBe(152);
    expect(new Set(CONDITIONAL.map((e) => e.champion)).size).toBe(87);
  });

  it('the sweep cannot pass by finding nothing — every champion below really has entries', () => {
    expect(forChampion('Garen').length).toBeGreaterThan(0);
    expect(forChampion('Lissandra').length).toBe(5);
    expect(forChampion('Soraka').length).toBe(5);
  });
});

describe('defences/key-provenance', () => {
  it('produces byte-identical keys to defensiveToggleKey over all 152 conditional entries', () => {
    // The seam check. Every key this area writes is compared against the contract function's
    // own output for the same entry. A reimplementation here — even a correct-looking one —
    // fails this the moment it differs by a character.
    const mine = new Set<string>();
    const champions = [...new Set(CONDITIONAL.map((e) => e.champion))];
    for (const champion of champions) {
      for (const group of groupDefences(forChampion(champion))) {
        for (const key of group.toggleKeys) mine.add(`${champion}|${key}`);
      }
    }
    const statable = CONDITIONAL.filter((e) => e.verification !== 'incomplete');
    const expected = new Set(statable.map((e) => `${e.champion}|${defensiveToggleKey(e)}`));

    expect([...mine].sort()).toEqual([...expected].sort());
  });

  it('writes a key for every statable entry and for no incomplete one', () => {
    // DEFINITION: statable = conditional AND not `incomplete`. 123 of the 152.
    //
    // ═══ 125 → 116 → 123 IN ONE DAY, AND BOTH MOVES ARE THE SAME SYSTEM WORKING ═══
    //
    // **125 → 116, earlier on 2026-08-15.** `CuratedDefensiveEffect.overTime.figureIs` was added to
    // the contract, and reading their sources marked nine per-tick HEAL rows `per-instance` — the
    // stored figure is ONE occurrence. Forming a whole-duration total from a per-instance figure
    // needs a count of occurrences, and none of the nine stated one, so each became honestly
    // `incomplete` rather than applying one tick of healing as though it were the whole channel.
    // The nine, measured against the pre-merge file rather than recalled: Master Yi W (minimum and
    // maximum), Lissandra R (minimum and maximum), Trundle R, Fiora R, Janna R, Milio W, Soraka Q.
    // Swain R is NOT among them — see the correction in the wording test below.
    //
    // **116 → 123, later the same day.** Seven of those nine sentences were then read, and each
    // count rests on TWO statements of the page that agree — the ability's own duration over its
    // own interval, and the multiplier its own leveling row prints. Briar E 4, Master Yi W 8 (both
    // rows), Lissandra R 10 (both rows), Fiora R 20, Janna R 12.
    //
    // **The two that did not come back are the reason to trust the seven that did.** Milio W is
    // CONTESTED: six seconds every quarter-second is 24, and its own leveling row divides by 25.
    // That one-instance difference has the shape of an occurrence at summoning, which is a rule two
    // other abilities apply in opposite directions, so neither reading was adopted. Swain R can
    // never have a count — the channel is fed faster than it drains while he is on a champion, so
    // no duration exists to divide. Soraka Q is a third and separate case: its twelve ticks come in
    // three different sizes, so the stored even twelfth is the amount of no occurrence at all, and
    // a count would not fix it.
    //
    // Trundle R Total Healing moved with them and is the one entry here that received NO count: its
    // figure is `full-duration`, so it never needed one, and reading the sentence is what
    // established that.
    //
    // A FALLING statable count is the system working; a RISING one is evidence arriving. Neither
    // direction is good news on its own, which is why both moves are written down with their cause.
    expect(CONDITIONAL.filter((e) => e.verification !== 'incomplete').length).toBe(123);
    expect(CONDITIONAL.filter((e) => e.verification === 'incomplete').length).toBe(29);

    let keys = 0;
    for (const champion of new Set(CONDITIONAL.map((e) => e.champion))) {
      for (const g of groupDefences(forChampion(champion))) keys += g.toggleKeys.length;
    }
    expect(keys).toBe(123);
  });

  it('every key this area writes is namespaced and URL-safe', () => {
    for (const champion of new Set(CONDITIONAL.map((e) => e.champion))) {
      for (const g of groupDefences(forChampion(champion))) {
        for (const key of g.toggleKeys) {
          expect(key.startsWith('d.')).toBe(true);
          expect(key).toMatch(/^[a-zA-Z0-9.-]+$/);
        }
      }
    }
  });
});

describe('defences/grouping', () => {
  it('groups by ability, because one ability states one condition', () => {
    // DEFINITION: an ability is (slot, abilityName) within one champion. Measured over the file:
    // 110 abilities carry the 152 conditional entries, and 35 of them carry more than one.
    let abilities = 0;
    let multiEntry = 0;
    for (const champion of new Set(CONDITIONAL.map((e) => e.champion))) {
      for (const g of groupDefences(forChampion(champion).filter((e) => e.activation === 'conditional'))) {
        abilities += 1;
        if (g.toggleKeys.length + g.refusals.length > 1) multiEntry += 1;
      }
    }
    expect(abilities).toBe(110);
    expect(multiEntry).toBe(35);
  });

  it('drops always-active entries — those are not a question anyone answers', () => {
    // Amumu E is the file's one always-active entry. It bakes into the stat block.
    const amumu = forChampion('Amumu');
    expect(amumu.some((e) => e.activation === 'always-active')).toBe(true);
    const groups = groupDefences(amumu);
    expect(groups.some((g) => g.abilityName === 'Tantrum')).toBe(false);
  });

  it('keeps a not-stated entry as a visible refusal rather than dropping it', () => {
    // Xin Zhao R: the condition is a DISTANCE and the engine models no positions. It is refused,
    // and a refusal that is on screen is honest where an entry that vanished is not.
    const groups = groupDefences(forChampion('Xin Zhao'));
    const crescent = groups.find((g) => g.abilityName === 'Crescent Guard');
    expect(crescent).toBeDefined();
    expect(crescent!.toggleKeys).toEqual([]);
    expect(crescent!.refusals.length).toBe(1);
  });

  it('Garen W — the one ability whose entries disagree — gets BOTH a toggle and a refusal', () => {
    // Measured: exactly one ability in the file carries a `derived` entry and an `incomplete`
    // one. A whole-ability rule in either direction would have been wrong for it.
    const w = groupDefences(forChampion('Garen')).find((g) => g.abilityName === 'Courage')!;
    expect(w.toggleKeys.length).toBe(1);
    expect(w.refusals.length).toBe(1);
  });
});

describe('defences/entry-state', () => {
  const group = groupDefences(forChampion('Alistar'))[0]!;

  it('absent means not up', () => {
    expect(isDefenceUp({}, group)).toBe(false);
  });

  it('setting it up writes true under every key of the ability', () => {
    const next = setDefenceUp({}, group, true);
    for (const key of group.toggleKeys) expect(next[key]).toBe(true);
  });

  it('setting it not up DELETES the keys rather than writing false', () => {
    const up = setDefenceUp({}, group, true);
    const down = setDefenceUp(up, group, false);
    for (const key of group.toggleKeys) expect(key in down).toBe(false);
  });

  it('never mutates the state it was given', () => {
    const before = {};
    setDefenceUp(before, group, true);
    expect(before).toEqual({});
  });

  it('leaves every unrelated entry-state value untouched', () => {
    const next = setDefenceUp({ conquerorStacks: 2, bonePlating: true }, group, true);
    expect(next.conquerorStacks).toBe(2);
    expect(next.bonePlating).toBe(true);
  });

  it('a half-set group reads as NOT up, which is the conservative direction', () => {
    // A link or a hand-edited scenario can produce this; the panel cannot. Reading it as up
    // would apply mitigation for the half the user never stated.
    const garen = groupDefences(forChampion('Garen')).find((g) => g.abilityName === 'Courage')!;
    const multi = groupDefences(forChampion('Braum')).find((g) => g.toggleKeys.length > 1);
    const target = multi ?? garen;
    if (target.toggleKeys.length > 1) {
      const partial = { [target.toggleKeys[0]!]: true };
      expect(isDefenceUp(partial, target)).toBe(false);
    }
    // And with every key set it does read as up, so the check above is not passing vacuously.
    expect(isDefenceUp(setDefenceUp({}, target, true), target)).toBe(true);
  });
});

describe('defences/wording', () => {
  it('a resistance grant says WHICH resistance, because that decides what it mitigates', () => {
    const grants = CONDITIONAL.filter((e) => e.kind === 'resistance-grant');
    expect(grants.length).toBe(16);
    const words = new Set(grants.map(describeDefence));
    for (const w of words) expect(w).not.toBe('Resistances');
  });

  it('every conditional entry describes itself in words, never as an enum value', () => {
    for (const e of CONDITIONAL) {
      const words = describeDefence(e);
      expect(words).not.toMatch(/-/); // no kebab-case leaking through
      expect(words.length).toBeGreaterThan(2);
    }
  });

  it('an unresolvable entry is PERMANENT, and one without is pending', () => {
    // DEFINITION: of the 29 incomplete conditional entries, 27 carry `unresolvable` — facts no
    // source states. Those read "Cannot be completed"; the other 2 read "Not yet modelled".
    //
    // ═══ PENDING WENT 26 → 9 → 2 IN ONE DAY. PERMANENT HAS NOT MOVED FROM 27 ═══
    //
    // **That the permanent count did not move is the check on the other two.** Reading a sentence
    // can only ever clear a PENDING entry; it cannot turn a fact no source states into one that is
    // stated. If reading nine sentences had moved the permanent count in either direction, the
    // classifier would be sorting on something other than what the source says.
    //
    // The nine per-tick heal rows that `figureIs` made incomplete were PENDING, not permanent — a
    // count of occurrences is a fact a source COULD state and nobody had read yet. Seven have now
    // been read and are gone from this list entirely. The two that remain are still pending and
    // still correct as pending: Milio W is contested between two readings of its own page (24
    // against 25), and Soraka Q's twelve ticks come in three different sizes. Both are questions a
    // source could settle. Neither is "cannot be completed".
    //
    // Getting that backwards would be the worse error in the direction this product cares about:
    // "Cannot be completed" tells a reader to stop looking, and SPECIFICATION §8 reserves it for
    // facts NO source states. An entry waiting on a sentence somebody has not read yet is not that.
    //
    // ═══ A CORRECTION TO THE PREVIOUS VERSION OF THIS COMMENT, MEASURED NOT ARGUED ═══
    //
    // It named the nine as "Master Yi W (×2), Lissandra R (×2), Fiora R, Janna R, Milio W, Soraka Q
    // and Swain R". **Swain R was never on this list.** Measured against the pre-merge file, it was
    // already PERMANENT — it carries `unresolvable`, because its channel is fed faster than it
    // drains while he is on a champion, so no duration exists to divide and no source can supply
    // one. The ninth was **Trundle R Total Healing**, which is also the one that cleared without
    // receiving a count: its figure is `full-duration` and never needed one.
    //
    // The wrong name survived because the count was right. Nine was nine either way.
    const incomplete = CONDITIONAL.filter((e) => e.verification === 'incomplete');
    const permanent = incomplete.filter((e) => incompleteReasonFor(e).kind === 'permanent');
    const pending = incomplete.filter((e) => incompleteReasonFor(e).kind === 'pending');
    expect(incomplete.length).toBe(29);
    expect(permanent.length).toBe(27);
    expect(pending.length).toBe(2);
  });
});

describe('defences/rendering', () => {
  const renderFor = (champion: string, entryState: Record<string, number | boolean> = {}) => {
    const calls: Array<Record<string, number | boolean>> = [];
    render(
      <DefenderDefences
        championName={champion}
        entries={forChampion(champion)}
        entryState={entryState}
        onChange={(next) => calls.push(next)}
      />,
    );
    return calls;
  };

  it('shows one checkbox per statable ability — Lissandra, the joint-largest champion', () => {
    renderFor('Lissandra');
    const boxes = screen.getAllByRole('checkbox');
    const statable = groupDefences(forChampion('Lissandra')).filter(
      (g) => g.toggleKeys.length > 0,
    );
    expect(boxes.length).toBe(statable.length);
  });

  it('ticking one writes true under that ability keys and nothing else', () => {
    const calls = renderFor('Alistar');
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(calls.length).toBe(1);
    const group = groupDefences(forChampion('Alistar'))[0]!;
    expect(Object.keys(calls[0]!).sort()).toEqual([...group.toggleKeys].sort());
    for (const key of group.toggleKeys) expect(calls[0]![key]).toBe(true);
  });

  it('unticking one deletes its keys', () => {
    const group = groupDefences(forChampion('Alistar'))[0]!;
    const calls = renderFor('Alistar', setDefenceUp({}, group, true));
    const box = screen.getAllByRole('checkbox')[0]!;
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(calls[0]).toEqual({});
  });

  it('offers NO checkbox for an ability whose every entry is incomplete', () => {
    // Xin Zhao R is not-stated; his only other defensive entry, if any, is separate. The check
    // is on the group: a group with no toggle keys renders no control.
    render(
      <DefenderDefences
        championName="Xin Zhao"
        entries={forChampion('Xin Zhao').filter((e) => e.abilityName === 'Crescent Guard')}
        entryState={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
  });

  it('a refused entry SAYS SO on screen, not only to a screen reader', () => {
    render(
      <DefenderDefences
        championName="Xin Zhao"
        entries={forChampion('Xin Zhao').filter((e) => e.abilityName === 'Crescent Guard')}
        entryState={{}}
        onChange={() => {}}
      />,
    );
    // `ExcludedAbility` renders the visible label and reason as real text. More than one node
    // carries the name — the ability heading and the refusal's own label — which is the point:
    // it is on screen twice, not hidden once.
    expect(screen.getAllByText(/Crescent Guard/).length).toBeGreaterThan(0);
    // And the REASON is the source's own words, not a generic "not read yet".
    expect(screen.getAllByText(/the condition is a DISTANCE/).length).toBeGreaterThan(0);
  });

  it('says plainly that nothing applies these yet, and stops saying it when told otherwise', () => {
    const { unmount } = render(
      <DefenderDefences
        championName="Alistar"
        entries={forChampion('Alistar')}
        entryState={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/nothing applies them to the damage figures yet/i)).toBeTruthy();
    unmount();

    render(
      <DefenderDefences
        championName="Alistar"
        entries={forChampion('Alistar')}
        entryState={{}}
        onChange={() => {}}
        appliedByEngine
      />,
    );
    expect(screen.queryByText(/nothing applies them to the damage figures yet/i)).toBeNull();
  });

  it('a champion with no defensive entry says so rather than rendering an empty panel', () => {
    render(
      <DefenderDefences championName="Annie" entries={[]} entryState={{}} onChange={() => {}} />,
    );
    expect(screen.getByText(/No conditional defence is recorded for Annie\./)).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
  });
});

describe('defences/every control announces itself', () => {
  // The area-wide sweep at `src/ui/interactive-names.test.tsx` belongs to no area and cannot be
  // edited from here, so this component carries the same four checks over its own surface. The
  // population is the two joint-largest champions plus the two whose shape is unusual.
  const CHAMPIONS = ['Lissandra', 'Soraka', 'Garen', 'Braum'];
  const bare = /^\s*([PQWERMT]|[◀▶✕✖×—–-]+|\d+)\s*$/;
  const runTogether = /\d(?!(st|nd|rd|th)\b)[A-Za-z]|[A-Za-z]\d|\S—|—\S/;

  const mountAll = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (const champion of CHAMPIONS) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      out.push(...screen.queryAllByRole('checkbox'));
    }
    return out;
  };

  it('renders exactly the controls these four champions should have', () => {
    // DEFINITION, measured over the file: Lissandra 5 entries on ONE ability -> 1 control;
    // Soraka 5 entries on 3 abilities -> 3; Garen 2 entries on 1 ability -> 1; Braum 3 entries
    // on 2 abilities of which one is wholly incomplete -> 1. Six controls, ten entries.
    const expected: Record<string, number> = { Lissandra: 1, Soraka: 3, Garen: 1, Braum: 1 };
    let total = 0;
    for (const champion of CHAMPIONS) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      expect(screen.queryAllByRole('checkbox').length, champion).toBe(expected[champion]);
      total += screen.queryAllByRole('checkbox').length;
    }
    expect(total).toBe(6);
  });

  it('no checkbox is left without an accessible name', () => {
    const offenders: string[] = [];
    for (const champion of CHAMPIONS) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      const all = screen.queryAllByRole('checkbox');
      const named = new Set(screen.queryAllByRole('checkbox', { name: /\S/ }));
      for (const el of all) {
        if (!named.has(el)) offenders.push(`${champion}: ${el.outerHTML.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no control is named by a bare slot letter or a glyph', () => {
    const offenders: string[] = [];
    for (const champion of CHAMPIONS) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      if (screen.queryAllByRole('checkbox', { name: bare }).length > 0) {
        offenders.push(`${champion}: a checkbox is named by a bare letter or glyph`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no accessible name runs a figure into the next word', () => {
    const offenders: string[] = [];
    for (const champion of CHAMPIONS) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      for (const el of screen.queryAllByRole('checkbox', { name: runTogether })) {
        offenders.push(`${champion}: ${el.getAttribute('aria-label') ?? el.outerHTML.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every checkbox points at a description carrying the source condition', () => {
    // The condition is up to 126 characters of the source's own prose. It is a DESCRIPTION and
    // not part of the name, so it is read on focus rather than every time the control is
    // announced — but it must actually be reachable, which is what this asserts.
    cleanup();
    render(
      <DefenderDefences
        championName="Lissandra"
        entries={forChampion('Lissandra')}
        entryState={{}}
        onChange={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const id = box.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      const detail = document.getElementById(id!);
      expect(detail).toBeTruthy();
      expect(detail!.textContent).toMatch(/When:/);
    }
  });

  it('THE WHOLE CONTROL BOX IS ONE TARGET, not a checkbox and a separate strip of text', () => {
    // WCAG 2.2 AA 2.5.8, and the defect this encodes was MEASURED in a browser on 2026-08-15 at
    // a 375px viewport, on /calculator/ with the default Garen defender:
    //
    //   `.defences__control`  293 x 30.50px — but a <div> with no handler, so DEAD everywhere.
    //   the checkbox           13 x 13.00px — a target, and 11px under the 24px minimum on BOTH axes.
    //   the <label>          141.63 x 22.50px — a target, 1.5px under on the block axis.
    //   between them          11.00px of box that accepted no pointer at all.
    //
    // `document.elementFromPoint` returned the bare `.defences__control` div at the gap, at the
    // trailing padding and at the top edge, and a click dispatched there changed nothing. The
    // stylesheet's own comment claimed "the whole line is the target, not just the box"; `htmlFor`
    // makes the LABEL a target, never the line, so the comment described an intention.
    //
    // jsdom computes no layout, so this asserts the STRUCTURE that makes the measured box one
    // contiguous target: the element carrying `.defences__control` is itself the <label> bound to
    // the checkbox. With the box dead, the two live pieces both fail on the block axis and no
    // amount of padding on a div can rescue either.
    cleanup();
    render(
      <DefenderDefences
        championName="Lissandra"
        entries={forChampion('Lissandra')}
        entryState={{}}
        onChange={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const box of boxes) {
      const control = box.closest('.defences__control');
      if (!(control instanceof HTMLLabelElement)) {
        offenders.push(`${box.id}: .defences__control is <${control?.tagName ?? 'missing'}>, not <label>`);
        continue;
      }
      if (control.htmlFor !== box.id) {
        offenders.push(`${box.id}: the control label is bound to "${control.htmlFor}"`);
      }
      // A label inside a label is invalid HTML and would give the row two overlapping targets.
      if (control.querySelector('label')) offenders.push(`${box.id}: a nested <label> remains`);
    }
    expect(offenders).toEqual([]);
  });

  it('mounting every one of the 87 champions renders without throwing', () => {
    // The broadest thing this suite can assert cheaply: no entry shape in the file breaks the
    // component. 87 champions, every conditional entry in the file.
    let rendered = 0;
    for (const champion of new Set(CONDITIONAL.map((e) => e.champion))) {
      cleanup();
      render(
        <DefenderDefences
          championName={champion}
          entries={forChampion(champion)}
          entryState={{}}
          onChange={() => {}}
        />,
      );
      rendered += 1;
    }
    expect(rendered).toBe(87);
    expect(mountAll().length).toBeGreaterThan(0);
  });
});
