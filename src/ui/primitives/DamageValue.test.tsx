// @vitest-environment jsdom
//
// The damage value, rendered for real and queried the way assistive technology finds
// things: BY ROLE AND ACCESSIBLE NAME.
//
// WHY THAT MATTERS AND NOT MARKUP. SPECIFICATION §10.1 and DESIGN.md §8 make one hard
// claim: the `P` letter is the VISUAL cue and is NEVER the only machine-readable signal —
// a screen reader must hear "214 physical damage". A test that searches the output for a
// span containing "P" passes on a component that shows the letter and announces nothing at
// all, which is exactly the failure the rule exists to prevent. So the accessibility
// assertions below never look at markup. They ask the accessibility tree for an element
// with a given accessible name, and fail if it is absent or wrong.
//
// HOW THE QUERY WORKS. A bare inline number has the ARIA role `generic`, which has no
// accessible name — nothing can query it by name, and that is a property of ARIA, not a
// gap in the test. So each value is rendered where it actually lives in this product: in a
// table cell. `cell` takes its accessible name FROM ITS CONTENT, computed by the same
// algorithm a browser uses, with `aria-hidden` subtrees excluded. If the hidden full-word
// span were deleted, the cell's name would collapse to "214 P" and every test here fails.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AggregateTotal, CompositionBar, DamageValue } from './DamageValue';
import { MOCK_RESULT } from '../../types';
import type { DamageType } from '../../types';

afterEach(cleanup);

/** Render a figure in the place it really appears: a cell of the breakdown table. */
function inCell(children: ReactNode) {
  return render(
    <table>
      <tbody>
        <tr>
          <td>{children}</td>
        </tr>
      </tbody>
    </table>,
  );
}

// ---------------------------------------------------------------------------
// THE THREE NAMED SCENARIOS THE HARD RULE RESTS ON
// ---------------------------------------------------------------------------

describe('damage-value/announced-as-full-word', () => {
  it('214 physical is announced as "214 physical damage"', () => {
    inCell(<DamageValue value={214} damageType="physical" />);
    const cell = screen.getByRole('cell', { name: '214 physical damage' });
    expect(cell).toBeTruthy();
    // And the letter alone is NOT the name: asking for "214 P" must find nothing.
    expect(screen.queryByRole('cell', { name: '214 P' })).toBe(null);
  });

  it('180 magic is announced as "180 magic damage"', () => {
    inCell(<DamageValue value={180} damageType="magic" />);
    expect(screen.getByRole('cell', { name: '180 magic damage' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: '180 M' })).toBe(null);
  });

  it('240 true is announced as "240 true damage"', () => {
    inCell(<DamageValue value={240} damageType="true" />);
    expect(screen.getByRole('cell', { name: '240 true damage' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: '240 T' })).toBe(null);
  });

  it('announces the full word at every numeric size, so no size can drop the cue', () => {
    for (const size of ['hero', 'l', 'm', 's'] as const) {
      cleanup();
      inCell(<DamageValue value={214} damageType="physical" size={size} />);
      expect(screen.getByRole('cell', { name: '214 physical damage' })).toBeTruthy();
    }
  });

  it('announces every damage figure in the one canonical mock Result', () => {
    // Population: the 5 per-instance finals plus the 1 DoT source total in MOCK_RESULT —
    // 6 figures, each measured against the accessible name its own damage type requires.
    const word: Record<DamageType, string> = {
      physical: 'physical',
      magic: 'magic',
      true: 'true',
    };
    const figures = [
      ...MOCK_RESULT.perInstance.map((i) => ({ v: i.final, t: i.damageType })),
      ...MOCK_RESULT.dot.sources.map((s) => ({ v: s.total, t: s.damageType })),
    ];
    expect(figures.length).toBe(6);

    const missing: string[] = [];
    for (const f of figures) {
      cleanup();
      // The sweep walks a real Result, whose instances now carry `ReportedDamageType`. A mixed
      // or no-damage figure is not tagged at all, so it is not part of this population.
      if (f.t === 'mixed' || f.t === 'none') continue;
      inCell(<DamageValue value={f.v} damageType={f.t} />);
      const expected = `${f.v} ${word[f.t]} damage`;
      if (!screen.queryByRole('cell', { name: expected })) missing.push(expected);
    }
    expect(missing).toEqual([]);
  });

  it('speaks a grouped number as one number: 2480 is "2480 magic damage"', () => {
    inCell(<DamageValue value={2480} damageType="magic" />);
    expect(screen.getByRole('cell', { name: '2480 magic damage' })).toBeTruthy();
  });

  it('does not round: 250.4 is announced as "250.4 physical damage"', () => {
    inCell(<DamageValue value={250.4} damageType="physical" />);
    expect(screen.getByRole('cell', { name: '250.4 physical damage' })).toBeTruthy();
  });

  it('adds spoken context when asked, without changing what is on screen', () => {
    const { container } = inCell(
      <DamageValue value={250} damageType="true" spokenContext="after resistances" />,
    );
    expect(
      screen.getByRole('cell', { name: '250 true damage after resistances' }),
    ).toBeTruthy();
    expect(container.querySelector('.dmg__tag')?.textContent).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// The VISUAL half of the same rule. These are claims about what is drawn, so they do
// look at the rendered DOM — but they are never the evidence for the announcement above.
// ---------------------------------------------------------------------------

describe('damage-value/visible-tag', () => {
  // THE TAG IS A WORD FRAGMENT, NOT A LETTER - changed 2026-08-14 (DESIGN-AUDIT.md part 2,
  // option A). The letter was correct and unreadable: on an ability icon, `M` reads as an ability
  // SLOT. The slot letter moved to the chip and the type became a word, so a slot letter never
  // appears beside a figure and a type word never appears on an icon.
  it('draws the phys / mag / true tag beside the number for all three types', () => {
    const expected: Array<[DamageType, string]> = [
      ['physical', 'phys'],
      ['magic', 'mag'],
      ['true', 'true'],
    ];
    for (const [type, tag] of expected) {
      cleanup();
      const { container } = render(<DamageValue value={214} damageType={type} />);
      expect(container.querySelector('.dmg__tag')?.textContent).toBe(tag);
    }
  });

  it('separates number from tag with a thin space, so it copies as "214 phys"', () => {
    const { container } = render(<DamageValue value={214} damageType="physical" />);
    const visible = container.querySelector('[aria-hidden="true"]')!;
        // The separator is a real U+2009 THIN SPACE inside the text, never CSS margin, so the
    // value survives copy-paste with its type attached (DESIGN.md 4, 8). The NEGATIVE
    // assertion below is the one that matters: an ordinary space would pass the first.
    expect(visible.textContent).toBe('214 phys');
    expect(visible.textContent).not.toBe('214 phys');
  });

  it('has no prop that can suppress the tag', () => {
    for (const forbidden of ['showTag', 'noTag', 'bare', 'untagged', 'hideTag', 'plain']) {
      expect(DamageValue.toString()).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// The ONE permitted untagged figure (DESIGN.md §8 last bullet, §7 rolling total)
// ---------------------------------------------------------------------------

describe('aggregate-total/multi-type', () => {
  const { total, byType } = MOCK_RESULT.burst; // 770 = 570 P + 200 M (instance 4 is incomplete
  // and contributes nothing, so there is no true damage in the split)

  it('the multi-type total announces itself and then its split', () => {
    inCell(<AggregateTotal total={total} byType={byType} />);
    expect(
      screen.getByRole('cell', {
        name: '770 total damage — 570 physical, 200 magic',
      }),
    ).toBeTruthy();
  });

  it('announces the split as a readable sentence, not as run-together figures', () => {
    // Guards the defect this component was rebuilt to fix: when the total and each bar
    // segment supplied their own text, the accessibility tree trimmed and joined them into
    // "890 total damage570 physical damage200 magic damage120 true damage".
    inCell(<AggregateTotal total={total} byType={byType} />);
    // Asked of the ACCESSIBILITY TREE, not of textContent: no cell may have an accessible
    // name in which a figure runs straight into the next word or number.
    expect(screen.queryByRole('cell', { name: /damage\d/ })).toBe(null);
    expect(screen.queryByRole('cell', { name: /\d[a-zA-Z]/ })).toBe(null);
    expect(
      screen.getByRole('cell', { name: '770 total damage — 570 physical, 200 magic' }),
    ).toBeTruthy();
  });

  it('an optional eyebrow label is spoken before the figure', () => {
    inCell(<AggregateTotal total={total} byType={byType} label="Total" />);
    expect(
      screen.getByRole('cell', {
        name: 'Total: 770 total damage — 570 physical, 200 magic',
      }),
    ).toBeTruthy();
  });

  it('the total itself is bone with NO tag — the one permitted exception', () => {
    const { container } = render(<AggregateTotal total={total} byType={byType} />);
    const figure = container.querySelector('.agg__total')!;
    expect(figure.textContent).toBe('770');
    // no damage-type class on the total, so it takes the bone `.agg` colour
    expect(figure.className).not.toMatch(/dmg--(physical|magic|true)/);
    // and the tag element is not inside it
    expect(figure.querySelector('.dmg__tag')).toBe(null);
  });

  it('cannot render the untagged total without the tagged composition bar', () => {
    const { container } = render(<AggregateTotal total={total} byType={byType} />);
    const tags = [...container.querySelectorAll('.dmg__tag')].map((n) => n.textContent);
    expect(tags).toEqual(['phys', 'mag']);
    // A segment exists for each type PRESENT in the split, and none for a type contributing
    // nothing — a zero-width segment carrying a tag would announce damage that was not dealt.
    for (const t of ['physical', 'magic']) {
      expect(container.querySelector(`.comp__bar--${t}`)).not.toBe(null);
    }
    expect(container.querySelector('.comp__bar--true')).toBe(null);
  });

  it('a SINGLE-type total is not an aggregate — the tag comes back', () => {
    const { total: dotTotal, byType: dotByType } = MOCK_RESULT.dot; // magic only
    inCell(<AggregateTotal total={dotTotal} byType={dotByType} />);
    expect(screen.getByRole('cell', { name: '160 magic damage' })).toBeTruthy();
    const cell = screen.getByRole('cell', { name: '160 magic damage' });
    expect(within(cell).getByText('mag')).toBeTruthy();
  });

  it('throws rather than showing a split that contradicts the total', () => {
    expect(() =>
      render(<AggregateTotal total={890} byType={{ physical: 570, magic: 200, true: 100 }} />),
    ).toThrow(/sums to 870 but total is 890/);
  });

  it('declares flex-basis 0, without which the grow factors do not govern the widths', () => {
    // REGRESSION. The grow factors were always correct and the bar was still wrong: with the
    // default `flex-basis: auto` a segment starts at its tag's width and grow only shares out
    // what is left, so a 570/200/120 split rendered as three near-identical segments. jsdom
    // computes no layout, so this reads the declaration out of the stylesheet rather than
    // measuring a width it cannot measure.
    const css = readFileSync(join(import.meta.dirname, 'primitives.css'), 'utf8');
    const seg = /\.comp__seg\s*\{([^}]*)\}/.exec(css);
    expect(seg, '.comp__seg rule not found').not.toBeNull();
    expect(seg![1]).toMatch(/flex-basis:\s*0\s*;/);
  });

  it('sizes composition segments in proportion — data, never a design token', () => {
    const { container } = render(<CompositionBar total={total} byType={byType} />);
    const grows = [...container.querySelectorAll<HTMLElement>('.comp__seg')].map(
      (n) => n.style.flexGrow,
    );
    // Two segments, not three: the corrected mock's incomplete instance contributes no true
    // damage, so there is no true segment to size.
    expect(grows).toEqual([String(570 / 770), String(200 / 770)]);
  });
});
