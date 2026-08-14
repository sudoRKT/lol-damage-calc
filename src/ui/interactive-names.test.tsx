// @vitest-environment jsdom
//
// THE INTERACTIVE-NAME SWEEP — every control this area can put on screen, checked for what it
// ANNOUNCES, in one place.
//
// WHY IT EXISTS. This interface is deliberately made of pictures: ability icon-chips instead of
// lettered buttons (SPECIFICATION §10.1), champion portraits instead of names in a list, arrow
// glyphs on the reorder controls. Every one of those is a control whose visible content carries
// no words at all, so the ONLY thing a screen reader has to go on is an accessible name — and
// an accessible name is exactly the kind of thing that is easy to forget and impossible to
// notice by looking. A per-component test covers the controls somebody remembered to list. This
// covers every control every component in the area renders.
//
// WHAT IT REFUSES, and each of these has been a real bug in a real product:
//   1. a control with NO accessible name at all — announced as just "button";
//   2. a control named after a FILE — "LuxLightBinding.png";
//   3. a control whose whole name is a bare slot letter or a glyph — "Q", "◀", "✕";
//   4. a name with two pieces of text run together — "240 P620Running total" (the defect class
//      already recorded in primitives/accessible-names.test.tsx, swept here over whole screens
//      rather than over single primitives).
//
// POPULATION, STATED: seven fixtures — the picker (open, over all 173 champions), the combo
// builder (Lux's real abilities, a three-step combo), the stat block, the per-instance
// breakdown, the HP burndown, a bare NumberInput, and the item picker over the real 209-item
// pool with one item already in the build. Between them they render every interactive control
// this area owns today. **The item picker was added on 2026-08-14 when item selection reached
// the page; the sentence above is a claim about coverage, so a new control-bearing component
// means a new fixture rather than a note that one exists elsewhere.**

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion, ComboStep } from '../types';
import { MOCK_RESULT } from '../types';
import { ChampionPicker } from './picker';
import { ComboBuilder } from './combo';
import type { ShelfAbility } from './combo';
import { StatBlockPanel } from './stats';
import { InstanceBreakdown } from './breakdown';
import { HpBurndown } from './burndown';
import { NumberInput } from './inputs';
import { ItemPicker } from './items';
import type { Item } from '../types';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROSTER = JSON.parse(
  readFileSync(join(REPO, 'public/data/champions.json'), 'utf8'),
) as Champion[];
const LUX = (
  JSON.parse(readFileSync(join(REPO, 'public/data/abilities/Lux.json'), 'utf8')) as {
    abilities: ShelfAbility[];
  }
).abilities;

const ITEMS = JSON.parse(readFileSync(join(REPO, 'public/data/items.json'), 'utf8')) as Item[];

const COMBO: ComboStep[] = [
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'r1', kind: 'ability', ref: 'R' },
];

/** Roles a user can operate. Anything with one of these needs a name. */
const INTERACTIVE_ROLES = [
  'button',
  'combobox',
  'option',
  'spinbutton',
  'textbox',
  'link',
  'checkbox',
  'tab',
] as const;

interface Fixture {
  id: string;
  node: ReactNode;
  /** Run after mounting, e.g. to open a picker so its options exist. */
  after?: () => void;
}

const FIXTURES: Fixture[] = [
  {
    id: 'ChampionPicker (open, 173 champions)',
    node: (
      <ChampionPicker
        label="Attacker champion"
        champions={ROSTER}
        selected={null}
        onSelect={() => {}}
        patch="16.16.1"
      />
    ),
    after: () => fireEvent.focus(screen.getByRole('combobox', { name: 'Attacker champion' })),
  },
  {
    id: 'ComboBuilder (Lux, three steps)',
    node: (
      <ComboBuilder
        abilities={LUX}
        steps={COMBO}
        onChange={() => {}}
        patch="16.16.1"
        championName="Lux"
      />
    ),
  },
  {
    id: 'StatBlockPanel (defender)',
    node: (
      <StatBlockPanel
        role="Defender"
        championName="Garen"
        portraitSrc="/Garen.png"
        stats={MOCK_RESULT.defenderStats}
      />
    ),
  },
  { id: 'InstanceBreakdown (canonical mock)', node: <InstanceBreakdown result={MOCK_RESULT} /> },
  { id: 'HpBurndown (canonical mock)', node: <HpBurndown result={MOCK_RESULT} /> },
  {
    id: 'NumberInput (bare)',
    node: <NumberInput label="Champion level" value={11} onChange={() => {}} min={1} max={18} />,
  },
  {
    id: 'ItemPicker (209 items, one in the build)',
    node: (
      <ItemPicker
        role="attacker"
        items={ITEMS}
        selected={[ITEMS[0]!.id]}
        onChange={() => {}}
      />
    ),
  },
];

function mount(fixture: Fixture) {
  render(<>{fixture.node}</>);
  fixture.after?.();
}

describe('interactive-names/population', () => {
  it('mounts seven fixtures covering every control the area owns', () => {
    expect(FIXTURES).toHaveLength(7);
  });

  it('the fixtures really do render controls — the sweep cannot pass by finding nothing', () => {
    let controls = 0;
    for (const fixture of FIXTURES) {
      cleanup();
      mount(fixture);
      for (const role of INTERACTIVE_ROLES) controls += screen.queryAllByRole(role).length;
    }
    // 173 options + a combobox + the shelf and step controls + risers + a spinbutton.
    expect(controls).toBeGreaterThan(190);
  });
});

describe('interactive-names/every control announces itself', () => {
  it('no control anywhere is left without an accessible name', () => {
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      mount(fixture);
      for (const role of INTERACTIVE_ROLES) {
        const all = screen.queryAllByRole(role);
        // Asked of the accessibility tree, not of the markup: Testing Library computes the name
        // with the same engine a `getByRole(…, { name })` query uses.
        const named = new Set(screen.queryAllByRole(role, { name: /\S/ }));
        for (const el of all) {
          if (!named.has(el)) {
            offenders.push(`${fixture.id}: a ${role} with no accessible name — ${el.outerHTML.slice(0, 80)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no control is named after a file', () => {
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      mount(fixture);
      for (const role of INTERACTIVE_ROLES) {
        if (screen.queryAllByRole(role, { name: /\.(png|jpg|jpeg|webp)/i }).length > 0) {
          offenders.push(`${fixture.id}: a ${role} announces a filename`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no control is named by a bare letter or a bare glyph', () => {
    // The §10.1 ban on lettered buttons, and the same rule applied to the arrow and cross
    // glyphs on the reorder controls: a glyph is a picture, and a picture is not a name.
    const bare = /^\s*([PQWERMT]|[◀▶✕✖×—–-]+|\d+)\s*$/;
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      mount(fixture);
      for (const role of INTERACTIVE_ROLES) {
        if (screen.queryAllByRole(role, { name: bare }).length > 0) {
          offenders.push(`${fixture.id}: a ${role} is named by a bare letter or glyph`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no accessible name runs a figure into the next word', () => {
    // The defect class first measured in primitives/accessible-names.test.tsx: the accessibility
    // tree trims each descendant's text and joins the pieces with nothing between them, so
    // "240 physical damage" + "620" is announced as "240 physical damage620". Swept here across
    // whole components rather than across single primitives.
    //
    // ONE EXCEPTION, AND IT IS A REAL WORD, NOT A LOOPHOLE: an English ordinal — "1st", "2nd",
    // "3rd", "4th" — is a digit legitimately touching a letter. The canonical mock's own label
    // is "Q — The Darkin Blade (1st cast)", so without this the sweep reports the burndown's
    // perfectly well-formed riser name as a defect. A check that cries wolf gets switched off.
    const runTogether = /\d(?!(st|nd|rd|th)\b)[A-Za-z]|[A-Za-z]\d|\S—|—\S/;
    const offenders: string[] = [];
    for (const fixture of FIXTURES) {
      cleanup();
      mount(fixture);
      for (const role of INTERACTIVE_ROLES) {
        for (const el of screen.queryAllByRole(role, { name: runTogether })) {
          offenders.push(
            `${fixture.id}: a ${role} name runs together — ${el.getAttribute('aria-label') ?? el.textContent}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
