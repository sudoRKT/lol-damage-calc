// @vitest-environment jsdom
//
// The verification status mark, rendered for real and queried BY ROLE AND ACCESSIBLE NAME.
//
// Two claims are under test, and they are the reason this component exists.
//
// 1. STATUS IS NEVER A COLOUR. DESIGN.md §1 reserves hue for damage data and §6 admits no
//    exception: "a verified figure and a derived figure must never differ by turning
//    something green or amber." So all five states must be told apart by glyph and label
//    alone, which is what makes them readable in greyscale. The tests below prove that by
//    comparing what is rendered with every colour-bearing signal removed.
//
// 2. A PERMANENTLY-INCOMPLETE ENTRY NAMES THE MISSING FACT. SPECIFICATION §8 requires the
//    note to say WHAT no source records, not to warn generically. That is an accessibility
//    claim, so it is asserted on the accessible name, not on markup.
//
// As in DamageValue.test.tsx, each mark is rendered in a table cell, because `cell` is a
// role that takes its accessible name from its content — a bare inline span has role
// `generic`, which has no accessible name at all.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { VerificationStatusMark } from './VerificationStatusMark';
import type { IncompleteReason, VerificationStatus } from '../../types';
import { MOCK_RESULT } from '../../types';

afterEach(cleanup);

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

/** The real shape from src/types/result.ts, and DESIGN.md §6's own worked example. */
const PERMANENT: IncompleteReason = {
  kind: 'permanent',
  missingFacts: [
    {
      field: 'components[0].ratios[0].owner (armor)',
      why: 'the source does not record whose armor this reads',
    },
  ],
};

const PENDING: IncompleteReason = {
  kind: 'pending',
  note: 'the damage is stated in description prose that has not been read yet',
};

// ---------------------------------------------------------------------------
// THE NAMED SCENARIO THE SPECIFICATION RESTS ON
// ---------------------------------------------------------------------------

describe('verification-status/permanent-names-the-missing-fact', () => {
  it('a permanently-incomplete ability is announced as "Cannot be completed — the source does not record whose armor this reads"', () => {
    inCell(<VerificationStatusMark status="incomplete" reason={PERMANENT} />);
    expect(
      screen.getByRole('cell', {
        name: 'Cannot be completed — the source does not record whose armor this reads',
      }),
    ).toBeTruthy();
  });

  it('does not announce a generic warning in place of the fact', () => {
    inCell(<VerificationStatusMark status="incomplete" reason={PERMANENT} />);
    const name = screen.getByRole('cell', {
      name: /Cannot be completed/,
    }).textContent!;
    expect(name).not.toMatch(/warning|error|caution|problem|failed|invalid/i);
    // and the bare label alone is NOT the accessible name — the fact must be in it
    expect(screen.queryByRole('cell', { name: 'Cannot be completed' })).toBe(null);
  });

  it('is announced differently from a merely pending incomplete ability', () => {
    inCell(<VerificationStatusMark status="incomplete" />);
    expect(screen.getByRole('cell', { name: 'Not yet modelled' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: /Cannot be completed/ })).toBe(null);
  });

  it('names every missing fact when an ability has more than one', () => {
    inCell(
      <VerificationStatusMark
        status="incomplete"
        reason={{
          kind: 'permanent',
          missingFacts: [
            { field: 'a', why: 'no source states whose armor' },
            { field: 'b', why: 'no source states whose mana' },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole('cell', {
        name: 'Cannot be completed — no source states whose armor; no source states whose mana',
      }),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// All five states announce their label
// ---------------------------------------------------------------------------

describe('verification-status/announced-label', () => {
  const cases: Array<[string, VerificationStatus, IncompleteReason | undefined, string]> = [
    ['verified', 'verified', undefined, 'Verified'],
    ['derived', 'derived', undefined, 'Derived'],
    ['incomplete — pending', 'incomplete', undefined, 'Not yet modelled'],
    ['incomplete — permanent', 'incomplete', PERMANENT, 'Cannot be completed'],
    ['no damage', 'no-damage', undefined, 'No damage'],
  ];

  for (const [name, status, reason, label] of cases) {
    it(`${name} is announced as "${label}"`, () => {
      inCell(<VerificationStatusMark status={status} reason={reason} />);
      // A regex so the permanent state's missing-fact suffix does not fail the match; the
      // exact full name for that state is asserted in the scenario above.
      expect(screen.getByRole('cell', { name: new RegExp(`^${label}`) })).toBeTruthy();
    });
  }

  it('prefixes the spoken subject so a table row says what the status is about', () => {
    inCell(<VerificationStatusMark status="derived" spokenSubject="W — Infernal Chains" />);
    expect(screen.getByRole('cell', { name: 'W — Infernal Chains: Derived' })).toBeTruthy();
  });

  it('never announces the glyph — it is decorative and duplicates the label', () => {
    for (const glyph of ['●', '◐', '○', '⊘', '–']) {
      cleanup();
      inCell(<VerificationStatusMark status="verified" />);
      expect(screen.queryByRole('cell', { name: new RegExp(glyph) })).toBe(null);
    }
  });
});

// ---------------------------------------------------------------------------
// Greyscale: every distinction is glyph and label, never hue
// ---------------------------------------------------------------------------

describe('verification-status/greyscale', () => {
  const all: Array<[string, VerificationStatus, IncompleteReason | undefined]> = [
    ['verified', 'verified', undefined],
    ['derived', 'derived', undefined],
    ['incomplete-pending', 'incomplete', undefined],
    ['incomplete-permanent', 'incomplete', PERMANENT],
    ['no-damage', 'no-damage', undefined],
  ];

  it('all five render with the same classes and no inline style — nothing is coloured', () => {
    const shapes = new Set<string>();
    for (const [, status, reason] of all) {
      cleanup();
      const { container } = render(
        <VerificationStatusMark status={status} reason={reason} />,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.getAttribute('style')).toBe(null);
      for (const el of container.querySelectorAll<HTMLElement>('*')) {
        expect(el.getAttribute('style')).toBe(null);
        expect(el.className).not.toMatch(/dmg--|comp__bar--|lethal|flash/);
      }
      shapes.add([...container.querySelectorAll('*')].map((e) => e.className).join('|'));
    }
    // ONE distinct class shape across all five: no state carries a class another lacks,
    // so no state can be given a visual treatment the others do not have.
    expect(shapes.size).toBe(1);
  });

  it('the visible label is always contained in the spoken name — they cannot drift', () => {
    // The visible label and the spoken name are rendered as separate text nodes (the
    // accessibility tree forces that; see the component). This is the mechanical guard
    // that they always say the same thing.
    for (const [, status, reason] of all) {
      cleanup();
      const { container } = render(
        <VerificationStatusMark status={status} reason={reason} />,
      );
      const visible = container.querySelector('.vstat__label')!.textContent!;
      const spoken = container.querySelector('.u-visually-hidden')!.textContent!;
      expect(spoken).toContain(visible);
    }
  });

  it('all five are still distinguishable when only glyph and label survive', () => {
    // The greyscale test made literal: strip every attribute that could carry colour or
    // weight and keep only the text. If two states collapsed to the same string, a
    // colourblind or greyscale reader could not tell them apart.
    const seen = new Set<string>();
    for (const [, status, reason] of all) {
      cleanup();
      const { container } = render(
        <VerificationStatusMark status={status} reason={reason} />,
      );
      const glyph = container.querySelector('.vstat__glyph')!.textContent!;
      const label = container.querySelector('.vstat__label')!.textContent!;
      seen.add(`${glyph} ${label}`);
    }
    expect(seen.size).toBe(5);
    expect([...seen].sort()).toEqual(
      [
        '● Verified',
        '◐ Derived',
        '○ Not yet modelled',
        '⊘ Cannot be completed',
        '– No damage',
      ].sort(),
    );
  });

  it('derived is rendered exactly as verified is — no shortfall styling', () => {
    // DESIGN.md §6: same size, same weight, same colour, no italic, no parenthesis, no
    // caution mark. The ONLY permitted difference is the glyph character and the word.
    const { container: v } = render(<VerificationStatusMark status="verified" />);
    const verifiedHtml = v.innerHTML;
    cleanup();
    const { container: d } = render(<VerificationStatusMark status="derived" />);
    const derivedHtml = d.innerHTML;

    const normalise = (html: string) =>
      html.replace(/ data-state="[^"]*"/g, '').replace(/●|◐|Verified|Derived/g, '');
    expect(normalise(derivedHtml)).toBe(normalise(verifiedHtml));

    // Nothing that reads as a shortfall.
    expect(derivedHtml).not.toMatch(/[(),⚠*†]|italic|caution|unverified|only|not /i);
  });

  it('⊘ carries its own strike, so the permanent state needs no decoration', () => {
    const { container } = render(
      <VerificationStatusMark status="incomplete" reason={PERMANENT} />,
    );
    expect(container.querySelector('.vstat__glyph')!.textContent).toBe('⊘');
    expect(container.innerHTML).not.toMatch(/text-decoration|line-through|<s>|<del>/);
  });

  it('no damage takes no dot at all — the absence is the signal', () => {
    const { container } = render(<VerificationStatusMark status="no-damage" />);
    const glyph = container.querySelector('.vstat__glyph')!.textContent!;
    expect(glyph).toBe('–'); // en dash
    expect(glyph).not.toMatch(/[●◐○⊘]/);
  });
});

// ---------------------------------------------------------------------------
// The contract guard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Driven from the real Result, now that the contract carries the distinction
// ---------------------------------------------------------------------------

describe('verification-status/from-a-real-result', () => {
  it('a pending ability names why it is not shown, not just that it is not', () => {
    // SPECIFICATION §8: incomplete is "a deliberate refusal, naming what is missing" —
    // which binds on BOTH kinds, so pending announces its note too.
    inCell(<VerificationStatusMark status="incomplete" reason={PENDING} />);
    expect(
      screen.getByRole('cell', {
        name: 'Not yet modelled — the damage is stated in description prose that has not been read yet',
      }),
    ).toBeTruthy();
  });

  it('renders every incomplete contributor the canonical mock Result carries', () => {
    // Population: MOCK_RESULT.incompleteContributors — one 'pending' and one 'permanent',
    // which is every kind the contract defines. Each must reach its own display state.
    const contributors = MOCK_RESULT.incompleteContributors;
    expect(contributors.length).toBe(2);
    expect(contributors.map((c) => c.reason.kind).sort()).toEqual(['pending', 'permanent']);

    const glyphs: string[] = [];
    for (const c of contributors) {
      cleanup();
      const { container } = render(
        <VerificationStatusMark
          status="incomplete"
          reason={c.reason}
          spokenSubject={c.sourceLabel}
        />,
      );
      glyphs.push(container.querySelector('.vstat__glyph')!.textContent!);
    }
    // The two kinds are visually distinct — the whole point of the contract change.
    expect(glyphs).toEqual(['○', '⊘']);
  });

  it('the permanent contributor announces the fact the source does not record', () => {
    const permanent = MOCK_RESULT.incompleteContributors.find(
      (c) => c.reason.kind === 'permanent',
    )!;
    inCell(<VerificationStatusMark status="incomplete" reason={permanent.reason} />);
    const cell = screen.getByRole('cell', { name: /^Cannot be completed — / });
    expect(cell).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'Cannot be completed' })).toBe(null);
  });

  it('an incomplete entry with no reason at all falls back to pending, never permanent', () => {
    // The weaker claim on missing evidence. Asserting "nobody can ever finish this" from
    // an absent field would be exactly the confident wrong answer this project prevents.
    inCell(<VerificationStatusMark status="incomplete" />);
    expect(screen.getByRole('cell', { name: 'Not yet modelled' })).toBeTruthy();
  });
});

describe('verification-status/contract', () => {
  it('refuses an unresolvable fact on a status that may not carry one', () => {
    for (const s of ['verified', 'derived', 'no-damage'] as VerificationStatus[]) {
      expect(() =>
        render(<VerificationStatusMark status={s} reason={PERMANENT} />),
      ).toThrow(/Only 'incomplete'/);
      cleanup();
    }
  });

  it('has no prop that can hide the label and leave a glyph alone', () => {
    for (const forbidden of ['labelHidden', 'glyphOnly', 'compact', 'iconOnly', 'hideLabel']) {
      expect(VerificationStatusMark.toString()).not.toContain(forbidden);
    }
  });
});
