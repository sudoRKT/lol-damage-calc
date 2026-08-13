// Pure-function tests for the two primitives. NO RENDERING HAPPENS HERE.
//
// Everything about what the components put on screen, and everything about what a screen
// reader announces, is tested by a real render under jsdom in `DamageValue.test.tsx` and
// `VerificationStatusMark.test.tsx`, where the queries find elements by ROLE AND
// ACCESSIBLE NAME the way assistive technology does. A string comparison can only prove
// what markup was emitted; it cannot prove what is announced.
//
// What is left here is the arithmetic and the lookup tables — the parts that are correct
// or incorrect independently of any browser.

import { describe, expect, it } from 'vitest';
import { formatDamage, THIN_SPACE } from './DamageValue';
import {
  STATE_STYLE,
  incompleteDetailSuffix,
  resolveDisplayState,
} from './VerificationStatusMark';
import type { VerificationDisplayState } from './VerificationStatusMark';
import type { IncompleteReason, VerificationStatus } from '../../types';

// ---------------------------------------------------------------------------
// Formatting never invents precision (CLAUDE.md — one rounding point, in the engine)
// ---------------------------------------------------------------------------

describe('damage-format', () => {
  it('does not round: 250.4 formats as 250.4', () => {
    expect(formatDamage(250.4)).toBe('250.4');
    expect(formatDamage(0.5)).toBe('0.5');
  });

  it('groups thousands with a thin space from four digits, matching DESIGN.md §7 "2 480"', () => {
    expect(formatDamage(890)).toBe('890');
    expect(formatDamage(2480)).toBe(`2${THIN_SPACE}480`);
    expect(formatDamage(12345)).toBe(`12${THIN_SPACE}345`);
    expect(formatDamage(1234567)).toBe(`1${THIN_SPACE}234${THIN_SPACE}567`);
  });

  it('uses U+2009 THIN SPACE, not an ordinary space', () => {
    expect(THIN_SPACE).toBe(' ');
    expect(THIN_SPACE).not.toBe(' ');
  });

  it('refuses a non-finite value rather than rendering "NaN"', () => {
    expect(() => formatDamage(Number.NaN)).toThrow(/finite/);
    expect(() => formatDamage(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

// ---------------------------------------------------------------------------
// Four data statuses onto five display states (SPECIFICATION §8, DESIGN.md §6)
// ---------------------------------------------------------------------------

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

describe('verification-status/mapping', () => {
  it('maps the four data statuses onto the five display states', () => {
    const cases: Array<[VerificationStatus, VerificationDisplayState]> = [
      ['verified', 'verified'],
      ['derived', 'derived'],
      ['incomplete', 'incomplete-pending'],
      ['no-damage', 'no-damage'],
    ];
    for (const [status, expected] of cases) expect(resolveDisplayState(status)).toBe(expected);
    expect(resolveDisplayState('incomplete', PERMANENT)).toBe('incomplete-permanent');
    expect(resolveDisplayState('incomplete', PENDING)).toBe('incomplete-pending');
  });

  it('uses exactly the glyphs and labels DESIGN.md §6 states', () => {
    expect(STATE_STYLE).toEqual({
      verified: { glyph: '●', label: 'Verified' }, // ● filled dot
      derived: { glyph: '◐', label: 'Derived' }, // ◐ half dot
      'incomplete-pending': { glyph: '○', label: 'Not yet modelled' }, // ○ open dot
      'incomplete-permanent': { glyph: '⊘', label: 'Cannot be completed' }, // ⊘ struck
      'no-damage': { glyph: '–', label: 'No damage' }, // – en dash, NO dot
    });
  });

  it('all five states are pairwise distinct on glyph alone, and on label alone', () => {
    const states = Object.keys(STATE_STYLE) as VerificationDisplayState[];
    expect(states.length).toBe(5);
    expect(new Set(states.map((s) => STATE_STYLE[s].glyph)).size).toBe(5);
    expect(new Set(states.map((s) => STATE_STYLE[s].label)).size).toBe(5);
  });

  it('refuses an unresolvable fact on any status but incomplete', () => {
    for (const s of ['verified', 'derived', 'no-damage'] as VerificationStatus[]) {
      expect(() => resolveDisplayState(s, PERMANENT)).toThrow(/Only 'incomplete'/);
    }
  });

  it('covers every verification status the frozen type allows', () => {
    // Population: the 4 members of VerificationStatus in src/types/data.ts. If a fifth is
    // ever added, resolveDisplayState throws on it and this names the gap.
    const all: VerificationStatus[] = ['verified', 'derived', 'incomplete', 'no-damage'];
    expect(all.length).toBe(4);
    for (const s of all) expect(() => resolveDisplayState(s)).not.toThrow();
  });
});

describe('verification-status/incomplete-detail', () => {
  it('uses the recorded prose reason for a permanent gap', () => {
    expect(incompleteDetailSuffix(PERMANENT)).toBe(
      ' — the source does not record whose armor this reads',
    );
  });

  it('uses the note for a pending gap — both kinds name what is missing', () => {
    expect(incompleteDetailSuffix(PENDING)).toBe(
      ' — the damage is stated in description prose that has not been read yet',
    );
  });

  it('falls back to naming the missing field when no prose reason was recorded', () => {
    expect(
      incompleteDetailSuffix({
        kind: 'permanent',
        missingFacts: [{ field: 'components[0].ratios[0].owner', why: '' }],
      }),
    ).toBe(' — components[0].ratios[0].owner');
  });

  it('joins multiple missing facts rather than reporting only the first', () => {
    expect(
      incompleteDetailSuffix({
        kind: 'permanent',
        missingFacts: [
          { field: 'a', why: 'no source states whose armor' },
          { field: 'b', why: 'no source states whose mana' },
        ],
      }),
    ).toBe(' — no source states whose armor; no source states whose mana');
  });

  it('returns nothing when the caller supplied nothing', () => {
    expect(incompleteDetailSuffix(undefined)).toBe('');
    expect(incompleteDetailSuffix({ kind: 'permanent' })).toBe('');
    expect(incompleteDetailSuffix({ kind: 'pending' })).toBe('');
  });
});
