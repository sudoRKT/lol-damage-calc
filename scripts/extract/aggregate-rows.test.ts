// Known-answer tests for gate 8 — an aggregate row stored as an addition (DATA-SOURCES §60).
//
// Every fixture's numbers are the wiki's own, quoted in the test that uses them. The negative
// tests matter more than the positive ones here: the mistake this check must NOT repeat is the
// one `DERIVED_ROW` was written to avoid, where treating "Maximum" as a summary word would have
// dropped every damage row from 32 charge-up abilities.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CuratedAbility } from '../../src/types/data.ts';
import { findRedundantAdditions, READ_POPULATION } from './aggregate-rows.ts';

function entry(components: CuratedAbility['components'], maxRank = 5): CuratedAbility {
  return {
    champion: 'Fixture',
    slot: 'E',
    abilityName: 'Fixture Ability',
    instanceType: 'damaging-ability',
    damageType: 'magic',
    maxRank,
    components,
    verification: 'derived',
    provenance: {
      source: 'test fixture',
      url: 'https://example.invalid',
      patch: '16.16.1',
      fetched: '2026-08-15',
    },
  } as CuratedAbility;
}

const linear = (from: number, to: number) => ({ scaling: 'linear' as const, from, to });

describe('gate 8 finds an aggregate row stored beside the parts it aggregates', () => {
  it('flags the Zoe E shape — "Maximum Mixed Damage" is twice the bubble damage', () => {
    // Zoe E: Magic Damage 70 to 230 (+45% AP); Maximum Mixed Damage 140 to 460 (+90% AP).
    // Both stored `adds` publishes 210 at rank 1 for an ability the source caps at 140.
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 230),
          ratios: [{ stat: 'AP', ...linear(45, 45) }],
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-mixed-damage',
          label: 'Maximum Mixed Damage',
          damageType: 'magic',
          base: linear(140, 460),
          ratios: [{ stat: 'AP', ...linear(90, 90) }],
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].tier).toBe(1);
    expect(audit.findings[0].componentId).toBe('maximum-mixed-damage');
    expect(audit.findings[0].restates).toBe('2 x "Magic Damage"');
  });

  it('flags the base-plus-N-bonuses shape — the Kled Q and Master Yi Q form', () => {
    // Kled Q: 5 pellets, the four after the first at 20%. Maximum = base x (1 + 0.2 x 4).
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'physical-damage',
          label: 'Physical Damage',
          damageType: 'physical',
          base: linear(35, 95),
          relation: { kind: 'adds' },
        },
        {
          id: 'reduced-damage',
          label: 'Reduced Damage',
          damageType: 'physical',
          base: linear(7, 19),
          relation: { kind: 'alternativeTo', componentId: 'physical-damage' },
        },
        {
          id: 'maximum-damage',
          label: 'Maximum Damage',
          damageType: 'physical',
          base: linear(63, 171),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    // TWO findings, and the difference between them is the whole point of the two tiers.
    // The reduced-pellet row is 20% of the full one, so the full row is arithmetically 5x it —
    // true, and the derivation runs the OTHER WAY. Arithmetic cannot see direction, so that
    // lands in tier 2 where a person decides. Only the aggregate lands in tier 1.
    const tier1 = audit.findings.filter((f) => f.tier === 1);
    const tier2 = audit.findings.filter((f) => f.tier === 2);
    expect(tier1.map((f) => f.componentId)).toEqual(['maximum-damage']);
    expect(tier1[0].restates).toBe('"Physical Damage" + 4 x "Reduced Damage"');
    expect(tier2.map((f) => f.componentId)).toEqual(['physical-damage']);
  });
});

describe('the tests that stop this becoming the mistake DERIVED_ROW avoids', () => {
  it('does NOT flag a charge-up Minimum/Maximum pair, because the Maximum is alternativeTo', () => {
    // Veigar R: Minimum 175 to 325, Maximum 350 to 650 — exactly twice, and a REAL second
    // damage row (the fully-charged form). All 38 such pairs in the file are stored this way.
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'minimum-magic-damage',
          label: 'Minimum Magic Damage',
          damageType: 'magic',
          base: linear(175, 325),
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(350, 650),
          relation: { kind: 'alternativeTo', componentId: 'minimum-magic-damage' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toEqual([]);

    // PROVED TO DISCRIMINATE, not assumed to: the same two rows with the relation changed to
    // `adds` — which is the defect — are flagged. It is the relation that decides, not the label.
    const broken = findRedundantAdditions([
      entry([
        {
          id: 'minimum-magic-damage',
          label: 'Minimum Magic Damage',
          damageType: 'magic',
          base: linear(175, 325),
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(350, 650),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);
    expect(broken.findings.map((f) => f.componentId)).toEqual(['maximum-magic-damage']);
    expect(broken.findings[0].tier).toBe(1);
  });

  it('does NOT flag a "Maximum" row whose numbers do not restate a sibling', () => {
    // The label alone decides nothing. 137 is not a whole multiple of 40, nor 40 + N x 40.
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(40, 120),
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(137, 411),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toEqual([]);
  });

  it('does NOT flag when the base agrees but a ratio does not', () => {
    // A component that restates a sibling restates ALL of it. Base 2x with a ratio that is not
    // 2x is a different damage that happens to double one term.
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 230),
          ratios: [{ stat: 'AP', ...linear(45, 45) }],
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(140, 460),
          ratios: [{ stat: 'AP', ...linear(60, 60) }],
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toEqual([]);
  });

  it('does NOT flag a lone additive component — it has no sibling to restate', () => {
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(140, 460),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toEqual([]);
  });
});

describe('the two tiers are separated by the label, after the arithmetic decides', () => {
  it('redundancy without an aggregate word is tier 2, not tier 1', () => {
    // Karthus E: "Damage Per Second" is four times "Magic Damage Per Tick" — one damage in two
    // units. Real, and NOT the §60 class: the fix is a unit decision, not a relation change.
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'magic-damage-per-tick',
          label: 'Magic Damage Per Tick',
          damageType: 'magic',
          base: linear(7.5, 27.5),
          relation: { kind: 'adds' },
        },
        {
          id: 'damage-per-second',
          label: 'Damage Per Second',
          damageType: 'magic',
          base: linear(30, 110),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].tier).toBe(2);
    expect(audit.findings[0].confirmedByReading).toBe(false);
  });

  it('a tier-1 finding outside the read population is reported unconfirmed', () => {
    const audit = findRedundantAdditions([
      entry([
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 230),
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(140, 460),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components']),
    ]);

    expect(audit.findings[0].tier).toBe(1);
    expect(audit.findings[0].confirmedByReading).toBe(false);
  });
});

describe('the read population is anchored to entries that actually exist', () => {
  const file = JSON.parse(readFileSync('curated/curated-data.json', 'utf8')) as {
    abilities: CuratedAbility[];
  };

  it('every key names a stored entry, and every named component id is one of its components', () => {
    const missing: string[] = [];
    for (const [key, read] of READ_POPULATION) {
      const [champion, slot, ...rest] = key.split('/');
      const abilityName = rest.join('/');
      const found = file.abilities.find(
        (a) => a.champion === champion && a.slot === slot && a.abilityName === abilityName,
      );
      if (!found) {
        missing.push(`${key}: no such entry`);
        continue;
      }
      for (const id of read.aggregates) {
        if (!found.components.some((k) => k.id === id)) missing.push(`${key}: no component ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the read population covers every tier-1 finding in the file — nothing is left unread', () => {
    // If this goes red, a NEW instance of the class has appeared. The response is to read its
    // source sentence and add it here, never to widen the test.
    const audit = findRedundantAdditions(file.abilities);
    const unread = audit.findings
      .filter((f) => f.tier === 1 && !f.confirmedByReading)
      .map((f) => `${f.champion} ${f.slot} ${f.abilityName} — ${f.label}`);
    expect(unread).toEqual([]);
  });

  it('finds the twelve entries DATA-SOURCES §60 counted, and no more', () => {
    const audit = findRedundantAdditions(file.abilities);
    const entries = new Set(
      audit.findings
        .filter((f) => f.tier === 1)
        .map((f) => `${f.champion}/${f.slot}/${f.abilityName}`),
    );
    expect(entries.size).toBe(12);
  });
});
