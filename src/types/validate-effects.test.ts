// GATE 1 WALKING ITEM EFFECTS AND RUNES, and the range-split value it used to refuse.
// Added 2026-08-14.
//
// Until this date `gateSchema` iterated `file.abilities` and `file.defensiveEffects` and NOTHING
// ELSE. 37 harvested item effects and every rune would have entered the override file having
// passed a gate that never looked at them — `scripts/extract/merge-proposal.ts` had noticed and
// was calling `checkEffectComponents` by hand, which walks the components and none of the fields
// around them.
//
// Every case here fails against that behaviour: with the two loops removed, `checked` stays at 0
// for these files and no finding is ever produced.

import { describe, expect, it } from 'vitest';

import type {
  AbilityComponent,
  CuratedFile,
  CuratedItemEffect,
  CuratedRune,
  Provenance,
  Scaling,
} from './data.ts';
import { checkScalingShape, gateSchema } from './validate-curated.ts';

const PROV: Provenance = {
  source: 'Module:ItemData/data/Sundered Sky',
  url: 'https://wiki.leagueoflegends.com/en-us/Module:ItemData/data',
  patch: '16.16.1',
  fetched: '2026-08-13',
};

const comp = (over: Partial<AbilityComponent> & { id: string }): AbilityComponent => ({
  damageType: 'physical',
  base: { scaling: 'linear', from: 50, to: 170 },
  ratios: [],
  ...over,
});

function itemEffect(over: Partial<CuratedItemEffect> = {}): CuratedItemEffect {
  return {
    itemId: 6610,
    itemName: 'Sundered Sky',
    key: 'pass',
    name: 'Lightshield Strike',
    kind: 'passive',
    verification: 'derived',
    provenance: PROV,
    ...over,
  };
}

function rune(over: Partial<CuratedRune> = {}): CuratedRune {
  return {
    runeId: 8005,
    runeName: 'Press the Attack',
    tree: 'Precision',
    verification: 'derived',
    provenance: { ...PROV, source: 'runesReforged.json' },
    ...over,
  };
}

function effectFile(itemEffects: CuratedItemEffect[], runes: CuratedRune[] = []): CuratedFile {
  return {
    version: 1,
    patch: '16.16.1',
    fetched: '2026-08-13',
    abilities: [],
    itemEffects,
    runes,
    shards: [],
    exclusions: [],
  };
}

describe('gate 1 — item effects', () => {
  it('looks at them at all', () => {
    // The whole point: an item effect is an entry the gate counts, not an entry it skips.
    const r = gateSchema(effectFile([itemEffect()]));
    expect(r.checked).toBe(1);
    expect(r.failed).toBe(0);
  });

  it('catches a malformed component inside an effect', () => {
    const r = gateSchema(
      effectFile([
        itemEffect({ components: [comp({ id: 'd', base: { scaling: 'explicit', perRank: [] } })] }),
      ]),
    );
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/non-empty perRank/);
  });

  it('refuses an effect missing the fields that identify it', () => {
    const r = gateSchema(effectFile([itemEffect({ itemId: 0, itemName: '', key: '', name: '' })]));
    const all = r.findings.map((f) => f.message).join(' | ');
    expect(all).toMatch(/bad itemId/);
    expect(all).toMatch(/missing itemName/);
    expect(all).toMatch(/missing key/);
    expect(all).toMatch(/missing name/);
  });

  it('refuses two effects claiming the same key of the same item', () => {
    const r = gateSchema(effectFile([itemEffect(), itemEffect()]));
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/duplicate entry/);
  });

  it("refuses 'no-damage' on an effect that carries damage", () => {
    const r = gateSchema(
      effectFile([itemEffect({ verification: 'no-damage', components: [comp({ id: 'd' })] })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/claim that the effect deals none/);
  });

  it('refuses an unresolvable fact beside a settled status', () => {
    const r = gateSchema(
      effectFile([
        itemEffect({
          verification: 'derived',
          unresolvable: [{ field: 'ratios[0].owner', why: 'the source never says whose' }],
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/forces 'incomplete'/);
  });

  it('refuses an over-time effect that quotes no source and counts nothing sane', () => {
    const r = gateSchema(
      effectFile([itemEffect({ overTime: { totalInstances: 0, sourceSays: '' } })]),
    );
    const all = r.findings.map((f) => f.message).join(' | ');
    expect(all).toMatch(/must quote what the source says/);
    expect(all).toMatch(/totalInstances must be an integer/);
  });

  it('refuses a delivery mode that is not one of the seven', () => {
    const r = gateSchema(
      effectFile([itemEffect({ appliesAs: 'on-cast' as CuratedItemEffect['appliesAs'] })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/bad appliesAs 'on-cast'/);
  });

  it('refuses a granted stat that is not a finite number', () => {
    const r = gateSchema(effectFile([itemEffect({ grants: { critDamage: Number.NaN } })]));
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/grants.critDamage is not a finite/);
  });

  it('requires an owner on a health ratio inside an item effect, as it does on an ability', () => {
    // Sundered Sky reads the TARGET's maximum health. Stored without an owner it would read the
    // holder's, which is a different number and nothing downstream could tell.
    const r = gateSchema(
      effectFile([
        itemEffect({
          components: [
            comp({ id: 'd', ratios: [{ stat: 'maxHP', scaling: 'linear', from: 6, to: 6 }] }),
          ],
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/requires an 'owner'/);
  });
});

describe('gate 1 — runes', () => {
  it('looks at them at all', () => {
    const r = gateSchema(effectFile([], [rune()]));
    expect(r.checked).toBe(1);
    expect(r.failed).toBe(0);
  });

  it('refuses a rune with no id, no name and a tree that does not exist', () => {
    const r = gateSchema(
      effectFile([], [rune({ runeId: 0, runeName: '', tree: 'Cunning' as CuratedRune['tree'] })]),
    );
    const all = r.findings.map((f) => f.message).join(' | ');
    expect(all).toMatch(/bad runeId/);
    expect(all).toMatch(/missing runeName/);
    expect(all).toMatch(/bad tree 'Cunning'/);
  });

  it('refuses two entries for the same rune', () => {
    const r = gateSchema(effectFile([], [rune(), rune()]));
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/duplicate entry/);
  });

  it('catches a malformed component inside a rune', () => {
    const r = gateSchema(
      effectFile([], [rune({ components: [comp({ id: 'd', damageType: 'fire' as 'magic' })] })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/bad damageType 'fire'/);
  });

  it('refuses provenance that names no source', () => {
    const r = gateSchema(
      effectFile([], [rune({ provenance: { ...PROV, source: '', patch: '' } })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/provenance needs source and patch/);
  });

  it('counts an ability, an item effect and a rune as three entries in one report', () => {
    const r = gateSchema(effectFile([itemEffect()], [rune()]));
    expect(r.checked).toBe(2);
  });
});

describe('checkScalingShape — byRangeType (added 2026-08-14)', () => {
  // A range-split value states two numbers and says which champion gets which. It was refused as
  // an "unknown scaling kind" until this date, holding back 6 correctly-shaped item effects.
  it('accepts a well-formed range split', () => {
    expect(
      checkScalingShape(
        {
          scaling: 'byRangeType',
          melee: { scaling: 'linear', from: 12, to: 12 },
          ranged: { scaling: 'linear', from: 8, to: 8 },
        },
        'value',
      ),
    ).toEqual([]);
  });

  it('accepts an arm that itself scales', () => {
    expect(
      checkScalingShape(
        {
          scaling: 'byRangeType',
          melee: { scaling: 'byLevel', from: 40, to: 100, atLevels: [1, 18], steps: 18 },
          ranged: { scaling: 'linear', from: 30, to: 30 },
        },
        'value',
      ),
    ).toEqual([]);
  });

  it('refuses a split with an arm missing', () => {
    const out = checkScalingShape(
      { scaling: 'byRangeType', melee: { scaling: 'linear', from: 12, to: 12 } } as Scaling,
      'value',
    );
    expect(out.join(' ')).toMatch(/needs a 'ranged' arm/);
  });

  it('carries the malformation of an arm up with the arm named', () => {
    const out = checkScalingShape(
      {
        scaling: 'byRangeType',
        melee: { scaling: 'explicit', perRank: [] },
        ranged: { scaling: 'linear', from: 8, to: 8 },
      },
      'value',
    );
    expect(out.join(' ')).toMatch(/value\.melee: explicit scaling needs a non-empty perRank/);
  });

  it('refuses a range split nested inside a range split', () => {
    // The holder has one range type, so the inner choice could never be made.
    const out = checkScalingShape(
      {
        scaling: 'byRangeType',
        melee: {
          scaling: 'byRangeType',
          melee: { scaling: 'linear', from: 1, to: 1 },
          ranged: { scaling: 'linear', from: 2, to: 2 },
        },
        ranged: { scaling: 'linear', from: 8, to: 8 },
      },
      'value',
    );
    expect(out.join(' ')).toMatch(/cannot itself be byRangeType/);
  });

  it('reaches a range split held inside an item effect, through gate 1', () => {
    const r = gateSchema(
      effectFile([
        itemEffect({
          components: [
            comp({
              id: 'd',
              base: {
                scaling: 'byRangeType',
                melee: { scaling: 'linear', from: 12, to: 12 },
                ranged: { scaling: 'explicit', perRank: [] },
              },
            }),
          ],
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(
      /components\[0\]\.base\.ranged: explicit scaling needs a non-empty perRank/,
    );
  });
});
