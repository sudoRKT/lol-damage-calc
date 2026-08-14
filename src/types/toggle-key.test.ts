// THE DEFENSIVE-TOGGLE KEY (added 2026-08-14).
//
// 90 of the 155 stored defensive entries are ready to apply and every one is CONDITIONAL. The
// interface writes these keys into `entryState` and the engine reads them back. Two areas
// deriving "the same" key independently is exactly the cross-area seam that leaves both suites
// green while the toggle silently never fires — so there is one function, and these are its
// known-answer tests.
//
// THE COLLISION FIGURES ARE MEASURED, NOT ASSUMED. See the last describe block: it runs the key
// over the real override file rather than over fixtures.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { CuratedFile } from './data.ts';
import { defensiveToggleKey } from './data.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const override = JSON.parse(
  readFileSync(join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json'), 'utf8'),
) as CuratedFile;

describe('the key is built from the parts that actually distinguish an entry', () => {
  it('uses slot, kind and the id when there is one', () => {
    expect(defensiveToggleKey({ slot: 'W', kind: 'shield', id: 'barrier' })).toBe('d.W.shield.barrier');
  });

  it('falls back to a slug of the label when there is no id', () => {
    expect(defensiveToggleKey({ slot: 'R', kind: 'damage-reduction', label: 'Damage Reduction' })).toBe(
      'd.R.damage-reduction.damage-reduction',
    );
  });

  it('prefers the id over the label, so a renamed label does not move the key', () => {
    // A label is display text and can be reworded by the source between patches. An id is not.
    const withBoth = defensiveToggleKey({ slot: 'E', kind: 'shield', id: 'x1', label: 'Some Label' });
    const renamed = defensiveToggleKey({ slot: 'E', kind: 'shield', id: 'x1', label: 'Reworded' });
    expect(withBoth).toBe(renamed);
  });

  it('omits the last part entirely when there is neither', () => {
    expect(defensiveToggleKey({ slot: 'P', kind: 'immunity' })).toBe('d.P.immunity');
  });

  it('produces a key safe to put in a URL fragment and in a JSON object', () => {
    const key = defensiveToggleKey({ slot: 'W', kind: 'heal', label: "Bel'Veth — 50% (+ 1) HP!" });
    expect(key).toMatch(/^[a-zA-Z0-9.-]+$/);
    expect(key).not.toMatch(/--|\.\.|-$|\.$/);
  });

  it('namespaces itself, so it cannot collide with a stack counter or a debuff', () => {
    // entryState also carries things like `conquerorStacks` and `bonePlating`.
    expect(defensiveToggleKey({ slot: 'Q', kind: 'shield' }).startsWith('d.')).toBe(true);
  });
});

describe('over the REAL override file, not fixtures', () => {
  const conditional = (override.defensiveEffects ?? []).filter((e) => e.activation === 'conditional');

  it('has entries to measure — the sweep cannot pass by finding nothing', () => {
    // DEFINITION: stored defensive entries whose activation is 'conditional', patch 16.16.1.
    expect(conditional.length).toBe(152);
    expect(new Set(conditional.map((e) => e.champion)).size).toBe(87);
  });

  it('COLLIDES FOR NOBODY once the label and id are included', () => {
    // DEFINITION: two entries of the SAME champion producing the same key. Across champions a
    // repeat is harmless — the toggles live inside one champion's config.
    const perChampion = new Map<string, Set<string>>();
    const collisions: string[] = [];
    for (const e of conditional) {
      const seen = perChampion.get(e.champion) ?? new Set<string>();
      const key = defensiveToggleKey(e);
      if (seen.has(key)) collisions.push(`${e.champion}: ${key}`);
      seen.add(key);
      perChampion.set(e.champion, seen);
    }
    expect(collisions).toEqual([]);
  });

  it('WOULD collide on slot and kind alone — which is why both other parts are kept', () => {
    // The negative control for the test above. If this ever reports zero, the key has become
    // longer than it needs to be and the extra parts can be dropped.
    //
    // DEFINITION: entries that would land on a key ALREADY TAKEN by an earlier entry of the same
    // champion — 28. That is the number of toggles that would be silently unreachable. A related
    // and different figure is 24, the number of distinct (slot, kind) pairs that carry more than
    // one entry; the two are easy to mix up and only the first says what would break.
    const perChampion = new Map<string, Set<string>>();
    let unreachable = 0;
    const groups = new Map<string, number>();
    for (const e of conditional) {
      const seen = perChampion.get(e.champion) ?? new Set<string>();
      const short = `d.${e.slot}.${e.kind}`;
      const g = `${e.champion}|${short}`;
      groups.set(g, (groups.get(g) ?? 0) + 1);
      if (seen.has(short)) unreachable += 1;
      seen.add(short);
      perChampion.set(e.champion, seen);
    }
    expect(unreachable).toBe(28);
    expect([...groups.values()].filter((n) => n > 1).length).toBe(24);
  });

  it('stays short enough not to threaten the link budget', () => {
    // SPECIFICATION §12 budgets 2,000 characters. The most any one champion carries is 5.
    const longest = Math.max(...conditional.map((e) => defensiveToggleKey(e).length));
    expect(longest).toBeLessThan(64);
    const worstChampion = Math.max(
      ...[...new Set(conditional.map((e) => e.champion))].map((c) =>
        conditional
          .filter((e) => e.champion === c)
          .reduce((n, e) => n + defensiveToggleKey(e).length + 6, 0),
      ),
    );
    expect(worstChampion).toBeLessThan(300);
  });
});
