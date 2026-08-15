// Known-answer tests for gate 8 — an aggregate row stored as an addition (DATA-SOURCES §60).
//
// Every fixture's numbers are the wiki's own, quoted in the test that uses them. The negative
// tests matter more than the positive ones here: the mistake this check must NOT repeat is the
// one `DERIVED_ROW` was written to avoid, where treating "Maximum" as a summary word would have
// dropped every damage row from 32 charge-up abilities.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CuratedAbility } from '../../src/types/data.ts';
import { applyReadAggregates, findRedundantAdditions, READ_POPULATION } from './aggregate-rows.ts';

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
      // THE CORRECTION HAS LANDED, so every named aggregate must be GONE. This assertion was
      // inverted until 2026-08-15: it required each id to be PRESENT, which is true only of the
      // broken file and could never be true of the fixed one. A test that passes only against
      // broken data is worse than no test — it goes quietly green again the moment someone
      // regenerates the proposal from a stale batch, which is the exact reversion it should catch.
      for (const id of read.aggregates) {
        if (found.components.some((k) => k.id === id)) {
          missing.push(`${key}: aggregate ${id} is STILL STORED — the correction has been reverted`);
        }
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

  it('finds NOTHING in tier 1 — the twelve §60 counted are corrected in the live file', () => {
    const audit = findRedundantAdditions(file.abilities);
    const stillFiring = audit.findings
      .filter((f) => f.tier === 1)
      .map((f) => `${f.champion}/${f.slot}/${f.abilityName} [${f.label}]`);
    expect(stillFiring).toEqual([]);
  });

  it('AND WOULD FIND ALL TWELVE AGAIN IF THE CORRECTION WERE REVERTED', () => {
    // THE OTHER HALF, and the reason the three tests above are not enough on their own.
    // "Tier 1 is empty" is also what a detector that has stopped working says. This reintroduces
    // the defect into each of the twelve — a synthetic aggregate row, twice one of the entry's
    // own remaining additive components, labelled and related exactly as the real ones were — and
    // requires gate 8 to catch every one.
    //
    // It is built from the LIVE file rather than from `merge-report.json`, deliberately: that
    // report lives under `build/`, which is git-ignored, so a test resting on it would pass or
    // fail depending on whether someone had run the harvester lately.
    // Doubling has to honour the ARM. Rumble R's ratio is `explicit` with a per-rank array and
    // no from/to, so doubling only `from`/`to` left the ratio untouched and gate 8 correctly
    // refused the fixture — a component that restates a sibling restates ALL of it. That was the
    // fixture being wrong, not the detector, and it is worth the four lines to get right.
    const double = (sc: { scaling: string; from?: number; to?: number; perRank?: number[] }) =>
      sc.scaling === 'explicit'
        ? { scaling: 'explicit' as const, perRank: (sc.perRank ?? []).map((v) => v * 2) }
        : { scaling: 'linear' as const, from: (sc.from ?? 0) * 2, to: (sc.to ?? 0) * 2 };

    const caught: string[] = [];
    const notCaught: string[] = [];

    for (const key of READ_POPULATION.keys()) {
      const [champion, slot, ...rest] = key.split('/');
      const abilityName = rest.join('/');
      const entry = file.abilities.find(
        (a) => a.champion === champion && a.slot === slot && a.abilityName === abilityName,
      )!;
      const part = entry.components.find((k) => k.relation?.kind === 'adds' && k.base);
      if (!part) continue; // Varus W's rows are all percentage-of-health; nothing to double.

      const reverted: CuratedAbility = {
        ...entry,
        components: [
          ...entry.components,
          {
            ...part,
            id: 'reverted-maximum',
            label: 'Maximum Reverted Damage',
            base: double(part.base!),
            ratios: (part.ratios ?? []).map((r) => ({ ...r, ...double(r) })),
            relation: { kind: 'adds' },
          },
        ],
      } as CuratedAbility;

      const found = findRedundantAdditions([reverted]).findings.filter(
        (f) => f.tier === 1 && f.componentId === 'reverted-maximum',
      );
      (found.length === 1 ? caught : notCaught).push(key);
    }

    expect({ notCaught, caughtAtLeast: caught.length >= 11 }).toEqual({
      notCaught: [],
      caughtAtLeast: true,
    });
  });
});

// =========================================================================================
// APPLYING THE READING — the relation change, and the four things it must refuse to do.
// =========================================================================================

describe('applyReadAggregates relates a confirmed aggregate to the part it aggregates', () => {
  it('Zoe E: the Maximum row is DROPPED, and rank 1 falls from 210 to 70', () => {
    // The wiki: Magic Damage 70 to 230 (+45% AP); Maximum Mixed Damage 140 to 460 (+90% AP),
    // and its own text makes the second the SUM of the bubble and the sleep bonus.
    const zoe = entry(
      [
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
      ] as CuratedAbility['components'],
    );
    zoe.champion = 'Zoe';
    zoe.slot = 'E';
    zoe.abilityName = 'Sleepy Trouble Bubble';

    const out = applyReadAggregates([zoe]);

    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0].componentId).toBe('maximum-mixed-damage');
    expect(out.dropped[0].basis).toBe('2 x "Magic Damage"');
    expect(out.perEntry).toEqual([
      {
        entry: 'Zoe/E/Sleepy Trouble Bubble',
        rank1BaseBefore: 210,
        rank1BaseAfter: 70,
        componentsBefore: 2,
        componentsAfter: 1,
      },
    ]);
    // The row is GONE from the entry, and kept in full in the record so nothing is lost.
    expect(zoe.components.map((c) => c.id)).toEqual(['magic-damage']);
    expect(out.dropped[0].removed.base).toEqual(linear(140, 460));
    expect(out.dropped[0].sentence).toContain('capped at Sleepy Trouble Bubble');
  });

  it('Yasuo E: the hit count the same sentence states is applied, 8 to 4', () => {
    // Source (Template:Data Yasuo/Sweeping Blade, revid 4008638): "stacks up to 4 times", and
    // "damage is increased by 25% per stack, up to 25*4% at maximum stacks".
    const yasuo = entry(
      [
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 130),
          relation: { kind: 'adds' },
        },
        {
          id: 'bonus-damage-per-stack',
          label: 'Bonus Damage per Stack',
          damageType: 'magic',
          base: linear(17.5, 32.5),
          hits: 8,
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-bonus-damage',
          label: 'Maximum Bonus Damage',
          damageType: 'magic',
          base: linear(70, 130),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components'],
    );
    yasuo.champion = 'Yasuo';
    yasuo.slot = 'E';
    yasuo.abilityName = 'Sweeping Blade';

    const out = applyReadAggregates([yasuo]);

    expect(out.hitCounts).toHaveLength(1);
    expect(out.hitCounts[0]).toMatchObject({
      componentId: 'bonus-damage-per-stack',
      before: 8,
      after: 4,
    });
    // 70 + 17.5x8 + 70 = 280 before; 70 + 17.5x4 = 140 after, which is the source's own
    // "Total Combined Damage" row (70x2 to 130x2) at rank 1.
    expect(out.perEntry).toEqual([
      {
        entry: 'Yasuo/E/Sweeping Blade',
        rank1BaseBefore: 280,
        rank1BaseAfter: 140,
        componentsBefore: 3,
        componentsAfter: 2,
      },
    ]);
  });

  it('DROPS an aggregate whose part was never harvested, and records that no sibling reproduces it', () => {
    // Katarina R's physical side: the Maximum row is 15 daggers of a per-dagger row that is not
    // stored at all. The reading confirmed it is an aggregate; the arithmetic cannot corroborate
    // that, because the part is absent (DATA-SOURCES §61.3). It is dropped on the reading alone
    // and `basis` records that the arithmetic was blind — which is also the honest statement of
    // what is left: the physical side of this ability now has NO stored figure.
    const kat = entry(
      [
        {
          id: 'maximum-physical-damage',
          label: 'Maximum Physical Damage',
          damageType: 'physical',
          base: { scaling: 'explicit', perRank: [0, 0, 0] },
          ratios: [{ stat: 'bonusAD', scaling: 'explicit', perRank: [240, 240, 240] }],
          relation: { kind: 'adds' },
        },
        {
          id: 'magic-damage-per-dagger',
          label: 'Magic Damage Per Dagger',
          damageType: 'magic',
          base: linear(25, 50),
          ratios: [{ stat: 'AP', ...linear(19, 19) }],
          hits: 1,
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(375, 750),
          ratios: [{ stat: 'AP', ...linear(285, 285) }],
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components'],
      3,
    );
    kat.champion = 'Katarina';
    kat.slot = 'R';
    kat.abilityName = 'Death Lotus';

    const out = applyReadAggregates([kat]);

    expect(out.dropped.map((r) => r.componentId)).toEqual([
      'maximum-physical-damage',
      'maximum-magic-damage',
    ]);
    expect(out.dropped[0].basis).toBeNull();
    expect(out.dropped[1].basis).toBe('15 x "Magic Damage Per Dagger"');
    expect(out.refused).toEqual([]);
    expect(kat.components.map((c) => c.id)).toEqual(['magic-damage-per-dagger']);
    // The dropped row is kept whole, including the coefficient multiplier, so the harvest gap it
    // leaves behind can be filled from the record rather than from a fresh fetch.
    expect(out.dropped[0].removed.damageType).toBe('physical');
  });

  it('REFUSES to drop the last row on an entry', () => {
    // An entry with no components reads as "nothing was harvested for this slot". That is a
    // different and false statement from "its only stored row was a summary of parts nobody
    // harvested". None of the twelve is in this position today; the guard is here so a future
    // harvest cannot put one there silently.
    const kat = entry(
      [
        {
          id: 'maximum-physical-damage',
          label: 'Maximum Physical Damage',
          damageType: 'physical',
          base: { scaling: 'explicit', perRank: [0, 0, 0] },
          ratios: [{ stat: 'bonusAD', scaling: 'explicit', perRank: [240, 240, 240] }],
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components'],
      3,
    );
    kat.champion = 'Katarina';
    kat.slot = 'R';
    kat.abilityName = 'Death Lotus';

    const out = applyReadAggregates([kat]);

    expect(out.dropped).toEqual([]);
    expect(kat.components).toHaveLength(1);
    // Two refusals, and they are different refusals. The first is the last-row guard. The second
    // is the reading's other confirmed aggregate, which this cut-down fixture does not hold —
    // a row named by a reading and absent from the file is reported, never searched for by label.
    expect(out.refused.map((r) => r.componentId)).toEqual([
      'maximum-physical-damage',
      'maximum-magic-damage',
    ]);
    expect(out.refused[0].why).toContain('last row on the entry');
    expect(out.refused[1].why).toContain('the file does not hold');
  });

  it('REFUSES the hit-count correction when the stored count is not the one that was read', () => {
    const yasuo = entry(
      [
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 130),
          relation: { kind: 'adds' },
        },
        {
          id: 'bonus-damage-per-stack',
          label: 'Bonus Damage per Stack',
          damageType: 'magic',
          base: linear(17.5, 32.5),
          hits: 3,
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-bonus-damage',
          label: 'Maximum Bonus Damage',
          damageType: 'magic',
          base: linear(70, 130),
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components'],
    );
    yasuo.champion = 'Yasuo';
    yasuo.slot = 'E';
    yasuo.abilityName = 'Sweeping Blade';

    const out = applyReadAggregates([yasuo]);

    expect(out.hitCounts).toEqual([]);
    expect(yasuo.components[1].hits).toBe(3);
    expect(out.refused.some((r) => r.componentId === 'bonus-damage-per-stack')).toBe(true);
  });

  it('CHANGES NOTHING on an entry outside the read population, however loudly it trips gate 8', () => {
    // The identical Zoe shape under a champion nobody has read. Gate 8 reports it; this does not
    // touch it. Widening the population means reading a sentence, not relaxing this test.
    const stranger = entry([
      {
        id: 'magic-damage',
        label: 'Magic Damage',
        damageType: 'magic',
        base: linear(70, 230),
        relation: { kind: 'adds' },
      },
      {
        id: 'maximum-mixed-damage',
        label: 'Maximum Mixed Damage',
        damageType: 'magic',
        base: linear(140, 460),
        relation: { kind: 'adds' },
      },
    ] as CuratedAbility['components']);

    const out = applyReadAggregates([stranger]);

    expect(out.dropped).toEqual([]);
    expect(out.hitCounts).toEqual([]);
    expect(stranger.components).toHaveLength(2);
    expect(findRedundantAdditions([stranger]).findings).toHaveLength(1);
  });

  it('an aggregate is never explained by another aggregate on the same entry', () => {
    // Kassadin R holds two: Maximum Bonus Damage (4x the per-stack row) and Maximum Magic Damage
    // (the base plus that). Both are dropped, and the arithmetic recorded for each names PARTS —
    // never the other aggregate, which would leave the record circular.
    //
    // THE RATIOS ARE THE WIKI'S OWN AND THEY ARE WHAT DISCRIMINATES. Maximum Bonus Damage's base
    // (140) is coincidentally twice the base row's (70); its 28% AP is four times the per-stack
    // row's 7% and nothing like twice the base row's 50%. A fixture stripped of its ratios would
    // pass this test for the wrong reason.
    const kass = entry(
      [
        {
          id: 'magic-damage',
          label: 'Magic Damage',
          damageType: 'magic',
          base: linear(70, 110),
          ratios: [{ stat: 'AP', ...linear(50, 50) }],
          relation: { kind: 'adds' },
        },
        {
          id: 'bonus-damage-per-stack',
          label: 'Bonus Damage Per Stack',
          damageType: 'magic',
          base: linear(35, 55),
          ratios: [{ stat: 'AP', ...linear(7, 7) }],
          hits: 1,
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-bonus-damage',
          label: 'Maximum Bonus Damage',
          damageType: 'magic',
          base: linear(140, 220),
          ratios: [{ stat: 'AP', scaling: 'explicit', perRank: [28, 28, 28] }],
          relation: { kind: 'adds' },
        },
        {
          id: 'maximum-magic-damage',
          label: 'Maximum Magic Damage',
          damageType: 'magic',
          base: linear(210, 330),
          ratios: [{ stat: 'AP', scaling: 'explicit', perRank: [78, 78, 78] }],
          relation: { kind: 'adds' },
        },
      ] as CuratedAbility['components'],
      3,
    );
    kass.champion = 'Kassadin';
    kass.slot = 'R';
    kass.abilityName = 'Riftwalk';

    const out = applyReadAggregates([kass]);

    expect(out.dropped).toHaveLength(2);
    const byId = new Map(out.dropped.map((r) => [r.componentId, r.basis]));
    expect(byId.get('maximum-bonus-damage')).toBe('4 x "Bonus Damage Per Stack"');
    expect(byId.get('maximum-magic-damage')).toBe('"Magic Damage" + 4 x "Bonus Damage Per Stack"');
    expect(kass.components.map((c) => c.id)).toEqual(['magic-damage', 'bonus-damage-per-stack']);
    // 70 + 35 + 140 + 210 = 455 before; 70 + 35 = 105 after.
    expect(out.perEntry).toEqual([
      {
        entry: 'Kassadin/R/Riftwalk',
        rank1BaseBefore: 455,
        rank1BaseAfter: 105,
        componentsBefore: 4,
        componentsAfter: 2,
      },
    ]);
  });

  it('the pass is IDEMPOTENT against the corrected file — it finds nothing left to drop', () => {
    // Re-running the pass on data it has already corrected must be a no-op. Before 2026-08-15
    // this asserted `dropped.length > 0`, which only held while the file was still broken.
    const file = JSON.parse(readFileSync('curated/curated-data.json', 'utf8')) as {
      abilities: CuratedAbility[];
    };
    const copy = JSON.parse(JSON.stringify(file.abilities)) as CuratedAbility[];
    const out = applyReadAggregates(copy);

    expect(out.dropped).toEqual([]);
    expect(findRedundantAdditions(copy).findings.filter((f) => f.tier === 1)).toEqual([]);
  });

  it('AND STILL DROPS THEM when handed data where the aggregates are back', () => {
    // The pass proved to still work, not assumed to. A hand-built entry in the pre-correction
    // shape — Zoe E exactly as it was stored on 2026-08-14 — must lose its aggregate row.
    const broken: CuratedAbility[] = [
      {
        champion: 'Zoe',
        slot: 'E',
        abilityName: 'Sleepy Trouble Bubble',
        instanceType: 'damaging-ability',
        damageType: 'magic',
        maxRank: 5,
        verification: 'derived',
        provenance: {
          source: 'Template:Data Zoe/Sleepy Trouble Bubble',
          url: 'https://example.invalid',
          patch: '16.16.1',
          fetched: '2026-08-15',
        },
        components: [
          {
            id: 'magic-damage',
            label: 'Magic Damage',
            damageType: 'magic',
            base: { scaling: 'linear', from: 70, to: 230 },
            ratios: [{ stat: 'AP', scaling: 'linear', from: 45, to: 45 }],
            relation: { kind: 'adds' },
          },
          {
            id: 'maximum-mixed-damage',
            label: 'Maximum Mixed Damage',
            damageType: 'magic',
            base: { scaling: 'linear', from: 140, to: 460 },
            ratios: [{ stat: 'AP', scaling: 'linear', from: 90, to: 90 }],
            relation: { kind: 'adds' },
          },
        ],
      } as CuratedAbility,
    ];

    const out = applyReadAggregates(broken);
    expect(out.dropped.map((d) => d.componentId)).toEqual(['maximum-mixed-damage']);
    expect(broken[0].components.map((k) => k.id)).toEqual(['magic-damage']);
  });
});
