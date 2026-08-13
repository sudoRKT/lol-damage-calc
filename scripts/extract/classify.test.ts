// Known-answer tests for the shape classifier.
// Every value string below is literal wikitext from a template fetched on 2026-08-12.

import { describe, expect, it } from 'vitest';

import { expandByRank } from '../../src/types/scaling.ts';
import {
  classifyRow,
  isDamageRow,
  parseRatio,
  proposeRelations,
  ratioOwnerOf,
  ratioStatOf,
  shapeOf,
} from './classify.ts';

const NO_VARS: Record<string, string> = {};
const row = (label: string, value: string, maxRank = 5, damageType: 'physical' | 'magic' | 'true' = 'magic') =>
  classifyRow(label, value, { maxRank, damageType, vars: NO_VARS, index: 0 });

describe('ratio stat resolution', () => {
  it('prefers the longest match so "bonus AD" never reads as "AD"', () => {
    expect(ratioStatOf("75% '''bonus''' AD")).toBe('bonusAD');
    expect(ratioStatOf('130% AD')).toBe('totalAD');
    expect(ratioStatOf('100% total AD')).toBe('totalAD');
    expect(ratioStatOf('60% base AD')).toBe('baseAD');
  });

  it('separates the four health pools', () => {
    expect(ratioStatOf("10% '''bonus''' health")).toBe('bonusHP');
    expect(ratioStatOf('2.5% of maximum health')).toBe('maxHP');
    expect(ratioStatOf('20% of missing health')).toBe('missingHP');
    expect(ratioStatOf('8% of current health')).toBe('currentHP');
  });

  it('returns null for prose that names no stat we model', () => {
    expect(ratioStatOf('of the shield remaining')).toBeNull();
  });
});

describe('health-pool ownership', () => {
  // Every string below is literal ratio text from a template fetched on 2026-08-13.
  it('reads the target when the source says the target', () => {
    expect(ratioOwnerOf("(+ 20% of target's missing health)")).toBe('target');
    expect(ratioOwnerOf("(+ 4% of the target's maximum health)")).toBe('target');
    expect(ratioOwnerOf("(+ 3% of primary target's bonus health)")).toBe('target');
  });

  it('reads the caster when the source says the caster', () => {
    expect(ratioOwnerOf('(+ 11% of his bonus health)')).toBe('caster');
    expect(ratioOwnerOf('(+ 4% of her maximum health)')).toBe('caster');
    expect(ratioOwnerOf("(+ 3% of Zac's bonus health)")).toBe('caster');
    expect(ratioOwnerOf("(+ 1% per 100 Poppy's bonus health)")).toBe('caster');
  });

  it('refuses to pick a side when the source names neither', () => {
    // 48 of the game's 176 health ratios read exactly like this. The wiki marking the target
    // explicitly everywhere else is a convention, not a statement, so these stay unresolved.
    expect(ratioOwnerOf('(+ 7% bonus health)')).toBe('unresolved');
    expect(ratioOwnerOf('(+ 6% maximum health)')).toBe('unresolved');
    expect(ratioOwnerOf('(+ 13% missing health)')).toBe('unresolved');
    expect(ratioOwnerOf('(+ 5% of maximum health)')).toBe('unresolved');
  });

  it('leaves a compound expression unresolved rather than half-reading it', () => {
    // Udyr Q is "(+ 1% per 100 bonus health) of the target's maximum health": the caster's
    // bonus health is a COEFFICIENT and the target's maximum health is the PAYLOAD. The
    // owner marker sits outside the ratio block, so the block alone must not claim either.
    expect(ratioOwnerOf('(+ 1% per 100 bonus health)')).toBe('unresolved');
  });

  it('stamps the owner onto a parsed health ratio, and only onto health ratios', () => {
    const target = parseRatio("(+ 4% of target's maximum health)", 5, NO_VARS);
    expect(target.ratio).toMatchObject({ stat: 'maxHP', owner: 'target' });

    const caster = parseRatio('(+ 11% of his bonus health)', 5, NO_VARS);
    expect(caster.ratio).toMatchObject({ stat: 'bonusHP', owner: 'caster' });

    const bare = parseRatio('(+ 7% bonus health)', 5, NO_VARS);
    expect(bare.ratio).toMatchObject({ stat: 'bonusHP', owner: 'unresolved' });

    // Ability power belongs to whoever cast the ability; there is nothing to disambiguate.
    const ap = parseRatio('(+ 75% AP)', 5, NO_VARS);
    expect(ap.ratio!.stat).toBe('AP');
    expect(ap.ratio!.owner).toBeUndefined();
  });

  it('reports an unresolved owner as a row issue so it reaches the worklist', () => {
    const r = row('Magic Damage', '{{ap|80 to 240}} {{as|(+ 7% bonus health)}}');
    expect(r.component!.ratios[0]!.owner).toBe('unresolved');
    expect(r.issues.map((i) => i.kind)).toContain('unresolved-owner');
  });

  it('raises no issue when the source did say whose health', () => {
    const r = row('Magic Damage', "{{ap|55 to 215}} {{as|(+ 4% of target's maximum health)}}");
    expect(r.component!.ratios[0]!.owner).toBe('target');
    expect(r.issues).toEqual([]);
  });
});

describe('parseRatio', () => {
  it('reads a flat percentage ratio', () => {
    const { ratio } = parseRatio('(+ 75% AP)', 5, NO_VARS);
    expect(ratio).toEqual({ stat: 'AP', scaling: 'linear', from: 75, to: 75 });
  });

  it('reads a ratio that itself scales per rank (Darius Q)', () => {
    // 244 components do this. Treating it as a flat 100% would understate rank 5 by 40%.
    const { ratio } = parseRatio('(+ {{ap|100 to 140}}% AD)', 5, NO_VARS);
    expect(ratio).toEqual({ stat: 'totalAD', scaling: 'linear', from: 100, to: 140 });
    expect(expandByRank(ratio!, 5)).toEqual([100, 110, 120, 130, 140]);
  });

  it('ignores an {{as|…}} that is prose rather than a ratio', () => {
    expect(parseRatio('magic damage', 5, NO_VARS)).toEqual({});
  });

  it('reports a stat it does not recognise instead of silently dropping it', () => {
    const { ratio, issue } = parseRatio('(+ 30% of the shield remaining)', 5, NO_VARS);
    expect(ratio).toBeUndefined();
    expect(issue?.kind).toBe('unknown-stat');
  });
});

describe('classifying real rows', () => {
  it('Lux Q is S2 — base plus one ratio', () => {
    const r = row('Magic Damage', '{{ap|80 to 240}} {{as|(+ 75% AP)}}');
    expect(r.shape).toBe('S2');
    expect(r.issues).toEqual([]);
    expect(expandByRank(r.component!.base, 5)).toEqual([80, 120, 160, 200, 240]);
    expect(r.component!.ratios).toHaveLength(1);
  });

  it('Ezreal Q is S3 — base plus two ratios', () => {
    const r = row('Physical Damage', '{{ap|20 to 120}} {{as|(+ 130% AD)}} {{as|(+ 40% AP)}}', 5, 'physical');
    expect(r.shape).toBe('S3');
    expect(r.component!.ratios.map((x) => x.stat)).toEqual(['totalAD', 'AP']);
  });

  it("Braum Q is S6 — it scales off the caster's health", () => {
    const r = row('Magic Damage', "{{ap|75 to 255}} {{as|(+ {{fd|2.5}}% of '''Braum's''' '''maximum''' health)}}");
    expect(r.shape).toBe('S6');
    expect(r.component!.ratios[0]!.stat).toBe('maxHP');
  });

  it('Aatrox R is S5 — a rank-scaling AD ratio with no flat base', () => {
    const r = row('Bonus Physical Damage', '{{as|(+ {{ap|20 to 40}}% AD)}}', 3, 'physical');
    expect(r.shape).toBe('S5');
    expect(expandByRank(r.component!.base, 3)).toEqual([0, 0, 0]);
    expect(expandByRank(r.component!.ratios[0]!, 3)).toEqual([20, 30, 40]);
  });

  it('a row with no ratio at all is S1', () => {
    const r = row('Magic Damage per Tick', '{{ap|5 to 20}}');
    expect(r.shape).toBe('S1');
    expect(r.component!.ratios).toEqual([]);
  });

  it('marks a per-tick row as multi-hit so it is not stored as a single hit', () => {
    const r = row('Magic Damage per Tick', '{{ap|5 to 20}}');
    expect(r.component!.hits).toBe(1);
  });

  it('resolves a #vardefine header into ordinary numbers (Aatrox Q)', () => {
    const r = classifyRow(
      'First Cast Damage',
      '{{ap|{{#var:b1}} to {{#var:b2}}}} {{as|(+ {{#var:r1}}% AD)}}',
      { maxRank: 5, damageType: 'physical', vars: { b1: '10', b2: '70', r1: '60' }, index: 0 },
    );
    expect(expandByRank(r.component!.base, 5)).toEqual([10, 25, 40, 55, 70]);
    expect(r.component!.ratios[0]).toEqual({ stat: 'totalAD', scaling: 'linear', from: 60, to: 60 });
  });
});

describe('Minimum / Maximum rows are damage, not summaries', () => {
  // This behaviour was WRONG in the first implementation and the correction is evidence-led.
  // A `^(total|maximum|minimum|max|min)` filter dropped every damage row from 32 abilities —
  // Veigar R, Jhin R, Riven R, Vi Q, Varus Q, Sion Q and R, Morgana W, Jax E among them — and
  // each would have shipped ZERO damage. On a charge-up ability the Minimum row IS the damage.

  it('keeps a Minimum row — it is the ability\'s actual damage', () => {
    const r = row('Minimum Magic Damage', '{{ap|40 to 160}} {{as|(+ 70% AP)}}');
    expect(r.dropped).toBeUndefined();
    expect(r.shape).toBe('S2');
    expect(expandByRank(r.component!.base, 5)).toEqual([40, 70, 100, 130, 160]);
  });

  it('keeps a Maximum row too — it is the fully-charged variant', () => {
    const r = row('Maximum Magic Damage', '{{ap|80 to 320}} {{as|(+ 140% AP)}}');
    expect(r.dropped).toBeUndefined();
  });

  it('pairs Maximum to Minimum as an alternative, so they are never summed', () => {
    // Veigar R / Vi Q / Riven R shape: min and max are the ends of one ramp, not two hits.
    const min = row('Minimum Magic Damage', '{{ap|40 to 160}}').component!;
    const max = row('Maximum Magic Damage', '{{ap|80 to 320}}').component!;
    const [a, b] = proposeRelations([min, max]);
    expect(a!.relation).toEqual({ kind: 'adds' });
    expect(b!.relation).toEqual({ kind: 'alternativeTo', componentId: min.id });
  });

  it('still drops a summary row that happens to carry a Minimum qualifier', () => {
    // Morgana W has "Minimum Total Damage" — a sum across ticks, genuinely derived. The
    // qualifier is stripped and the REMAINDER is judged.
    expect(row('Minimum Total Damage', '{{ap|1 to 2}}').dropped).toBe('derived-row');
  });

  it('still drops a non-champion row that carries a Minimum qualifier', () => {
    // Gragas Q has "Minimum Minion Damage".
    expect(row('Minimum Minion Damage', '{{ap|1 to 2}}').dropped).toBe('non-champion');
  });
});

describe('rows that are deliberately not stored', () => {
  it('drops a Total summary row', () => {
    expect(row('Total Magic Damage', '{{ap|1 to 2}}').dropped).toBe('derived-row');
  });

  it('drops a minion/monster-only row', () => {
    expect(row('Capped Monster Damage', '{{ap|1 to 2}}').dropped).toBe('non-champion');
    expect(row('Minion Damage', '{{ap|1 to 2}}').dropped).toBe('non-champion');
    expect(row('Non-Champion Damage', '{{ap|1 to 2}}').dropped).toBe('non-champion');
  });

  it('ignores a row that mentions damage but is not a damage instance', () => {
    expect(row('Damage Reduction', '{{ap|10 to 30}}%').dropped).toBe('not-damage');
    expect(row('Slow', '{{ap|20 to 40}}%').dropped).toBe('not-damage');
  });
});

describe('relation proposals — the input to gate 3', () => {
  it('leaves an alternative row unstated so an author must confirm it', () => {
    // Darius Q handle. The classifier will NOT claim to know; gate 3 then refuses the
    // ability until the author declares the relation.
    const r = row('Reduced Damage (Handle)', '{{ap|50*0.35 to 170*0.35}}', 5, 'physical');
    expect(r.component!.relation).toBeUndefined();
  });

  it('proposes adds for an ordinary row', () => {
    expect(row('Magic Damage', '{{ap|80 to 240}}').component!.relation).toEqual({ kind: 'adds' });
  });

  it('proposes the alternative link across a whole ability', () => {
    const blade = row('Physical Damage (Blade)', '{{ap|50 to 170}}', 5, 'physical').component!;
    const handle = row('Reduced Damage (Handle)', '{{ap|17.5 to 59.5}}', 5, 'physical').component!;
    const [a, b] = proposeRelations([blade, handle]);
    expect(a!.relation).toEqual({ kind: 'adds' });
    expect(b!.relation).toEqual({ kind: 'alternativeTo', componentId: blade.id });
  });

  it('proposes sweetspot rows as alternatives, not additions (the Aatrox case)', () => {
    const comps = ['First Cast Damage', 'First Sweetspot Damage'].map(
      (l) => row(l, '{{ap|10 to 70}}', 5, 'physical').component!,
    );
    const out = proposeRelations(comps);
    expect(out[0]!.relation).toEqual({ kind: 'adds' });
    expect(out[1]!.relation).toEqual({ kind: 'alternativeTo', componentId: out[0]!.id });
  });
});

describe('shapeOf', () => {
  const base = { scaling: 'linear' as const, from: 1, to: 2 };
  const make = (stats: Array<Ratio2>) => ({
    id: 'x',
    damageType: 'magic' as const,
    base,
    ratios: stats,
  });
  type Ratio2 = { stat: Parameters<typeof shapeOf>[0]['ratios'][number]['stat'] } & typeof base;

  it('routes each stat family to its shape', () => {
    expect(shapeOf(make([{ stat: 'AP', ...base }]), true)).toBe('S2');
    expect(shapeOf(make([{ stat: 'AP', ...base }, { stat: 'bonusAD', ...base }]), true)).toBe('S3');
    expect(shapeOf(make([]), true)).toBe('S1');
    expect(shapeOf(make([{ stat: 'maxHP', ...base }]), true)).toBe('S6');
    expect(shapeOf(make([{ stat: 'maxMana', ...base }]), true)).toBe('S7');
    expect(shapeOf(make([{ stat: 'armor', ...base }]), true)).toBe('S8');
    expect(shapeOf(make([{ stat: 'stacks', ...base }]), true)).toBe('S9');
    expect(shapeOf(make([{ stat: 'AP', ...base }]), false)).toBe('S5');
  });

  it('a health ratio wins over a core ratio, because that is the harder property', () => {
    expect(shapeOf(make([{ stat: 'AP', ...base }, { stat: 'maxHP', ...base }]), true)).toBe('S6');
  });
});

describe('isDamageRow', () => {
  it('accepts damage labels and rejects everything else', () => {
    expect(isDamageRow('Magic Damage')).toBe(true);
    expect(isDamageRow('Shield Strength')).toBe(false);
    expect(isDamageRow('Damage Reduction')).toBe(false);
  });
});
