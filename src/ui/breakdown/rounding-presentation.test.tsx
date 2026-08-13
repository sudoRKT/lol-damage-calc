// @vitest-environment jsdom
//
// THE ROUNDING SWEEP — "the per-instance column must never be presented as something to add
// up", checked two ways across the whole area.
//
// WHY A SWEEP AND NOT A TEST OF ONE TABLE. `InstanceResult.final` records the rule: rounded
// output is never fed back into arithmetic, so the burst total is rounded ONCE from the
// unrounded sum and the rounded column can differ from it by a point or two. Any component in
// this area could reintroduce the defect by adding a footer that sums the column — the
// breakdown table today, a build-comparison view tomorrow. So:
//
//   HALF 1 — BEHAVIOUR, against a result whose column genuinely does NOT add up. The worked
//   example is the contract's own: 150 / 166.67 / 187.5 display as 150 / 167 / 188, a column
//   that reads 505, while the total is 504. The rendered output must contain 504 and must not
//   contain 505 anywhere at all.
//
//   HALF 2 — COVERAGE. Every non-test component file in src/ui/ is scanned for arithmetic over
//   `final` and for a table footer. A future component that adds the column up fails here and
//   is named, whether or not anybody remembered to write a test for it.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstanceResult, Result } from '../../types';
import { MOCK_RESULT } from '../../types';
import { InstanceBreakdown } from './InstanceBreakdown';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// HALF 1 — behaviour
// ---------------------------------------------------------------------------

/**
 * The contract's own worked example, as a Result.
 *
 * Unrounded: 150 + 166.67 + 187.5 = 504.17, which rounds ONCE to 504.
 * Displayed:  150 + 167    + 188   = 505 if anybody adds the column up.
 * The two numbers differing is the entire point of this fixture.
 */
const instance = (
  index: number,
  stepId: string,
  final: number,
  raw: number,
): InstanceResult => ({
  index,
  stepId,
  sourceLabel: `Instance ${index}`,
  icon: null,
  instanceType: 'damaging-ability',
  damageType: 'physical',
  raw,
  afterPreMitigationReduction: raw,
  afterResistances: raw,
  afterReductions: raw,
  final,
  crit: false,
  stateSnapshot: {},
  verification: 'derived',
});

const ROUNDING_CASE: Result = {
  ...MOCK_RESULT,
  perInstance: [
    instance(1, 'r1', 150, 150),
    instance(2, 'r2', 167, 166.67),
    instance(3, 'r3', 188, 187.5),
  ],
  runningTotal: [150, 317, 504],
  burst: { total: 504, byType: { physical: 504, magic: 0, true: 0 } },
  dot: { total: 0, byType: { physical: 0, magic: 0, true: 0 }, sources: [] },
  incompleteContributors: [],
};

describe('rounding/behaviour — the column does not add up, and nothing pretends it does', () => {
  it('prints the authoritative total, 504', () => {
    render(<InstanceBreakdown result={ROUNDING_CASE} />);
    const panel = screen.getByRole('region', { name: 'Per-instance breakdown' });
    expect(panel.textContent).toContain('504');
  });

  it('NEVER prints 505 — the sum of the rounded column appears nowhere', () => {
    render(<InstanceBreakdown result={ROUNDING_CASE} />);
    const panel = screen.getByRole('region', { name: 'Per-instance breakdown' });
    expect(panel.textContent).not.toContain('505');
  });

  it('puts the authoritative running total on EVERY row', () => {
    render(<InstanceBreakdown result={ROUNDING_CASE} />);
    for (const [i, running] of ROUNDING_CASE.runningTotal.entries()) {
      expect(
        screen.getByRole('row', {
          name: new RegExp(`Running total after instance ${i + 1}: ${running} damage`),
        }),
      ).toBeTruthy();
    }
  });

  it('states the reason in plain English, where a reader who notices will look', () => {
    render(<InstanceBreakdown result={ROUNDING_CASE} />);
    // Said twice on purpose — once in the table's caption, which is what a screen reader hears
    // before the rows, and once in visible copy under the column it is about.
    expect(screen.getAllByText(/not meant to be added up/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/running total is the authoritative figure/).length).toBeGreaterThanOrEqual(1);
  });

  it('has no footer row at all', () => {
    const { container } = render(<InstanceBreakdown result={ROUNDING_CASE} />);
    expect(container.querySelectorAll('tfoot').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HALF 2 — coverage over every component in the area
// ---------------------------------------------------------------------------

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const COMPONENTS = walk(UI_DIR).filter(
  (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !/\.test\.tsx?$/.test(f),
);

/** Strip both comment forms: prose ABOUT the rule is not a breach of it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * WHAT THIS SWEEP FOUND WHEN IT WAS FIRST RUN, 2026-08-13, and why each entry is still here.
 *
 * It found two places in this area that accumulate rounded `final` values. NEITHER is a
 * rendered table, so neither PRESENTS the column as addable — but both are the pattern the
 * rounding rule forbids, and both are recorded here rather than quietly tolerated or quietly
 * fixed. This list is asserted to be EXACTLY the set of sites: a new one fails the sweep, and a
 * fixed one fails it too (as a dead entry), so neither can drift.
 *
 * Both are REPORTED to the lead. Neither is this task's to change: one is a diagnostic whose
 * correct tolerance is a decision, and the other is withdrawn code that the area was told not
 * to modify.
 */
const KNOWN_ACCUMULATION_SITES: Record<string, string> = {
  'burndown/geometry.ts':
    'auditResult() sums rounded `final` values per damage type and compares the runningTotal ' +
    'delta against `final`, both with a 1e-6 tolerance. That tolerance is UNSOUND under the ' +
    'rounding rule: a delta of two rounded cumulative figures can legitimately differ from a ' +
    'rounded instance figure by up to a point, so the audit will report false findings the ' +
    'moment the engine produces fractional damage. It passes today only because every figure ' +
    'in the canonical mock is a whole number. Raised — the right tolerance is a decision, not ' +
    'a value to invent here.',
  'slice/compute.ts':
    'the withdrawn vertical slice accumulates `roundDamage(...)` output into its running total ' +
    '— rounded output fed back into arithmetic, exactly what InstanceResult.final forbids. It ' +
    'is not mounted (src/main.tsx removed it) and this area was told not to modify it, so it ' +
    'is recorded rather than edited. A test below asserts nothing shipped imports it.',
};

function accumulatesFinal(file: string): boolean {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/\.final\b/g)) {
    const window = src.slice(Math.max(0, m.index! - 120), m.index! + 120);
    if (/reduce\(|\+=|\+\s*\w*\.final|\.final\s*\+|sum/i.test(window)) return true;
  }
  return false;
}

describe('rounding/coverage — no component in src/ui/ adds the rounded column up', () => {
  it('scans every non-test component file in the area', () => {
    expect(COMPONENTS.length).toBeGreaterThan(0);
  });

  it('NOTHING THAT RENDERS sums `final` values — zero tolerance for shipped interface', () => {
    // The rule is about what is presented, so the strictest form of it applies to every file
    // that can present anything. There is no allowlist here and there will not be one: the fix
    // is to show `runningTotal`, which the engine computed unrounded.
    const offenders = COMPONENTS.filter((f) => f.endsWith('.tsx') && accumulatesFinal(f)).map((f) =>
      relative(UI_DIR, f),
    );
    expect(offenders).toEqual([]);
  });

  it('the only accumulation sites anywhere in the area are the two on record', () => {
    const found = COMPONENTS.filter(accumulatesFinal).map((f) => relative(UI_DIR, f)).sort();
    expect(found).toEqual(Object.keys(KNOWN_ACCUMULATION_SITES).sort());
  });

  it('nothing shipped imports the withdrawn slice', () => {
    // The one entry above that is excused as "not mounted" has to STAY not mounted.
    const importers = COMPONENTS.filter(
      (f) => !f.includes(`${'slice'}/`) && /from\s+'[^']*slice\//.test(readFileSync(f, 'utf8')),
    ).map((f) => relative(UI_DIR, f));
    expect(importers).toEqual([]);
  });

  it('no component renders a table footer, where a column total would live', () => {
    const offenders = COMPONENTS.filter((f) => /<tfoot/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(UI_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('the breakdown still carries its plain-English caveat — it cannot be quietly deleted', () => {
    const src = readFileSync(join(UI_DIR, 'breakdown', 'InstanceBreakdown.tsx'), 'utf8');
    expect(src).toContain('not meant to be');
    expect(src).toContain('authoritative figure');
  });
});
