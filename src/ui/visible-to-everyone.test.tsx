// @vitest-environment jsdom
//
// THE INVERSE ACCESSIBILITY GAP — information that satisfies a requirement to assistive
// technology ALONE, while being invisible on screen.
//
// ═══ WHY THIS EXISTS ═══
//
// The usual accessibility defect is content a sighted reader can see and a screen reader cannot.
// Every check in this area is pointed at that direction: `interactive-names.test.tsx` refuses a
// control with no accessible name, `accessible-names.test.tsx` refuses a name that runs together.
// **Not one of them can see the opposite failure**, and the opposite failure is worse in one
// specific way: it looks handled. The information is genuinely present, the requirement is
// genuinely met for one audience, and every test passes.
//
// FOUND ON 2026-08-14, in the "Excluded from these totals" list. SPECIFICATION §8 requires that
// "a result containing an incomplete ability states plainly which ability and why". The list
// rendered a bare status mark per entry, whose glyph and label are `aria-hidden` and whose whole
// sentence — the ability's NAME and the REASON — sat in a `u-visually-hidden` span. Measured on
// the live page with Aatrox: the mark painted 97x15px reading "○ Not yet modelled" and the name
// and reason painted at 1x1px under a clip-path. Both of his exclusions looked identical.
//
// ═══ WHAT THIS CHECK DOES ═══
//
// For every fixture it takes each `u-visually-hidden` element and asks: does it NAME AN ENTITY —
// an ability, an item, a champion — that appears nowhere a sighted reader can find it? An
// entity list is built from the real data and the canonical mock, so a new champion or item
// joins the population automatically.
//
// It asks about entities rather than about words, and the reason is in the note above
// `entitiesIn` below: a word-level version fired on twelve legitimate cases on its first run,
// every one of them DESIGN.md §8's own instruction to expand `phys` into "physical damage" for a
// screen reader. Vocabulary can be expanded for one audience; an ability's NAME cannot be
// inferred from a glyph.
//
// Exceptions are declared with reasons, as the reserved-hue and length allow-lists in
// `primitives/token-audit.test.ts` are. There are two, and the second is structural rather than
// textual so it cannot over-apply: a table `<caption>`, and the combo builder, where
// SPECIFICATION §10.1 makes the ability's ICON the visible identification and the exemption
// holds only while that icon is actually in the same list item.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion, ComboStep, Item } from './../types';
import { MOCK_RESULT } from './../types';
import { ChampionPicker } from './picker';
import { ComboBuilder, type ShelfAbility } from './combo';
import { StatBlockPanel } from './stats';
import { InstanceBreakdown } from './breakdown';
import { HpBurndown } from './burndown';
import { NumberInput } from './inputs';
import { ItemPicker } from './items';
import { SiteNav } from './shell';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const ROSTER = read('public/data/champions.json') as Champion[];
const ITEMS = read('public/data/items.json') as Item[];
const LUX = (read('public/data/abilities/Lux.json') as { abilities: ShelfAbility[] }).abilities;
const COMBO: ComboStep[] = [
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'r1', kind: 'ability', ref: 'R' },
];

interface Fixture {
  id: string;
  node: ReactNode;
  after?: () => void;
}

/**
 * The same surfaces `interactive-names.test.tsx` sweeps, plus the navigation. Kept as its own
 * list rather than imported, because that file's fixtures exist to exercise CONTROLS and this
 * one is about rendered information — a future fixture may belong to one and not the other.
 */
const FIXTURES: Fixture[] = [
  {
    id: 'InstanceBreakdown (canonical mock, includes an excluded ability)',
    node: <InstanceBreakdown result={MOCK_RESULT} />,
  },
  { id: 'HpBurndown (canonical mock)', node: <HpBurndown result={MOCK_RESULT} /> },
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
    id: 'ChampionPicker (open)',
    node: (
      <ChampionPicker
        label="Attacker champion"
        champions={ROSTER.slice(0, 12)}
        selected={null}
        onSelect={() => {}}
        patch="16.16.1"
      />
    ),
    after: () => fireEvent.focus(screen.getByRole('combobox', { name: 'Attacker champion' })),
  },
  {
    id: 'ItemPicker (pool open)',
    node: (
      <ItemPicker role="attacker" items={ITEMS} selected={[ITEMS[0]!.id]} onChange={() => {}} />
    ),
    after: () => fireEvent.focus(screen.getByRole('searchbox', { name: 'Search attacker items' })),
  },
  {
    id: 'NumberInput (bare)',
    node: <NumberInput label="Champion level" value={11} onChange={() => {}} min={1} max={18} />,
  },
  { id: 'SiteNav (inline)', node: <SiteNav current="calculator" inlineOverride /> },
];

/**
 * ═══ WHAT COUNTS AS A FINDING, AND WHY IT IS NARROWER THAN "ANY WORD" ═══
 *
 * A first version of this check compared every distinctive WORD in hidden text against the
 * visible text, and it fired on twelve legitimate cases immediately — "240 physical damage"
 * beside a visible "240 phys", "cumulative across damage types" beside an untagged aggregate,
 * "critical strike" beside a visible "CRIT".
 *
 * Every one of those is DESIGN.md §8 working as written: "expose the full word to assistive
 * technology so `214 P` is announced as 214 physical damage". A check that flags the design's
 * own intent is a check that gets switched off, and exempting them one by one would have hollowed
 * it out until it measured nothing.
 *
 * So the check asks a narrower and much more useful question: **is an ENTITY named in hidden
 * text and nowhere on screen?** An entity is a thing with a name — an ability, an item, a
 * champion. Vocabulary can be expanded for a screen reader; an ability's NAME cannot be inferred
 * from a glyph, and that is exactly the fact the "Excluded from these totals" list was
 * announcing and never showing.
 */
function entitiesIn(text: string, entities: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return entities.filter((e) => e.length >= 4 && haystack.includes(e.toLowerCase()));
}

/** Text a sighted reader can actually read: everything except the visually-hidden spans. */
function visibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('.u-visually-hidden')) hidden.remove();
  return (clone.textContent ?? '').toLowerCase();
}

/**
 * Every named thing these fixtures can reference. Built from the real data and the canonical
 * mock rather than hand-listed, so a new champion or item joins the population automatically.
 */
const ENTITIES: string[] = [
  ...MOCK_RESULT.perInstance.map((i) => i.sourceLabel),
  ...MOCK_RESULT.incompleteContributors.map((c) => c.sourceLabel),
  ...MOCK_RESULT.dot.sources.map((d) => d.label),
  ...LUX.map((a) => a.abilityName),
  ...ITEMS.slice(0, 40).map((i) => i.name),
  ...ROSTER.slice(0, 12).map((c) => c.name),
].filter((n): n is string => typeof n === 'string' && n.trim().length >= 4);

/** A real label from the canonical mock, so the control tests exercise a name that exists. */
const NAMED = MOCK_RESULT.perInstance[0]!.sourceLabel;

/**
 * Hidden strings whose entity mentions genuinely need not be seen, each with its reason.
 *
 * A `<caption>` describes a table a sighted reader can simply look at. Everything else has to
 * earn its place here, and adding an entry is a claim that the fact really does not need showing.
 */
const EXEMPT: Array<{ match: RegExp; reason: string }> = [
  {
    match: /^Each instance of the combo in order|^Damage over time by source|^The survival verdict|resolved statistics at level/,
    reason: 'a table <caption>: it describes a structure a sighted reader can see directly',
  },
];

function exemptFor(text: string): string | null {
  return EXEMPT.find((e) => e.match.test(text.trim()))?.reason ?? null;
}

/**
 * THE ONE PLACE A PICTURE IS THE VISIBLE CHANNEL, and it is exempted STRUCTURALLY rather than by
 * matching on text — so the exemption can only ever apply where the art is genuinely present.
 *
 * SPECIFICATION §10.1: "The combo builder presents abilities as their in-game icons rather than
 * as lettered buttons." A player recognises Lux's E by its art, so the ability IS identified on
 * screen; it is simply not identified in words. This check reads text, so without this it reports
 * the combo builder's every step as a name announced and never shown — which would be the check
 * misunderstanding the design rather than finding a defect.
 *
 * It is deliberately narrow: the exemption holds only while an ability icon sits in the same
 * list item. Strip the art out and the finding comes back.
 */
function identifiedByArt(hidden: Element): boolean {
  const item = hidden.closest('li') ?? hidden.parentElement;
  return !!item?.querySelector('img.chip__img');
}

describe('visible-to-everyone/population', () => {
  it('sweeps eight surfaces, and each really renders hidden text to check', () => {
    let withHidden = 0;
    for (const fixture of FIXTURES) {
      cleanup();
      const { container } = render(<>{fixture.node}</>);
      fixture.after?.();
      if (container.querySelectorAll('.u-visually-hidden').length > 0) withHidden += 1;
    }
    expect(FIXTURES).toHaveLength(8);
    // A sweep that found no hidden text anywhere would pass while measuring nothing.
    expect(withHidden).toBeGreaterThanOrEqual(6);
  });
});

describe('visible-to-everyone/no ENTITY is announced but never shown', () => {
  it('every ability, item and champion named in hidden text is also on screen', () => {
    const offenders: string[] = [];

    for (const fixture of FIXTURES) {
      cleanup();
      const { container } = render(<>{fixture.node}</>);
      fixture.after?.();

      const visible = visibleText(container);

      for (const hidden of container.querySelectorAll('.u-visually-hidden')) {
        const text = hidden.textContent ?? '';
        if (text.trim() === '') continue;
        if (exemptFor(text)) continue;
        if (identifiedByArt(hidden)) continue;
        for (const entity of entitiesIn(text, ENTITIES)) {
          if (!visible.includes(entity.toLowerCase())) {
            offenders.push(
              `${fixture.id}: "${entity}" is announced in "${text.trim().slice(0, 60)}" and appears nowhere on screen`,
            );
          }
        }
      }
    }

    expect([...new Set(offenders)].slice(0, 12)).toEqual([]);
  });
});

describe('visible-to-everyone/the check can actually fail', () => {
  it('catches an entity that exists only in hidden text', () => {
    // A sweep nobody has seen fail is a sweep nobody should trust. This is the exact shape the
    // defect had: a visible glyph, and the ability's name announced only to a screen reader.
    const { container } = render(
      <div>
        <span aria-hidden="true">○</span>
        <span className="u-visually-hidden">{`${NAMED}, contributes no damage`}</span>
      </div>,
    );
    const found = entitiesIn(
      container.querySelector('.u-visually-hidden')!.textContent ?? '',
      ENTITIES,
    ).filter((e) => !visibleText(container).includes(e.toLowerCase()));
    expect(found).toContain(NAMED);
  });

  it('and passes when the same entity is also on screen', () => {
    const { container } = render(
      <div>
        <span>{NAMED}</span>
        <span className="u-visually-hidden">{`${NAMED}, contributes no damage`}</span>
      </div>,
    );
    const found = entitiesIn(
      container.querySelector('.u-visually-hidden')!.textContent ?? '',
      ENTITIES,
    ).filter((e) => !visibleText(container).includes(e.toLowerCase()));
    expect(found).toEqual([]);
  });

  it('the ART exemption applies only while the art is there', () => {
    // Structural, not a text match. With the chip image present the combo builder's step is
    // identified on screen as §10.1 intends; take the image away and the same string is a
    // finding again.
    const withArt = render(
      <ul>
        <li>
          <img className="chip__img" src="/x.png" alt="" />
          <span className="u-visually-hidden">{NAMED}</span>
        </li>
      </ul>,
    );
    expect(identifiedByArt(withArt.container.querySelector('.u-visually-hidden')!)).toBe(true);
    cleanup();
    const without = render(
      <ul>
        <li>
          <span className="u-visually-hidden">{NAMED}</span>
        </li>
      </ul>,
    );
    expect(identifiedByArt(without.container.querySelector('.u-visually-hidden')!)).toBe(false);
  });

  it('does NOT fire on a spoken expansion of a visible abbreviation', () => {
    // The class the first version of this check drowned in. "phys" -> "physical" is DESIGN.md
    // §8's own instruction, not a defect.
    const { container } = render(
      <div>
        <span aria-hidden="true">58 mag</span>
        <span className="u-visually-hidden">58 magic damage</span>
      </div>,
    );
    expect(
      entitiesIn(container.querySelector('.u-visually-hidden')!.textContent ?? '', ENTITIES),
    ).toEqual([]);
  });
});
