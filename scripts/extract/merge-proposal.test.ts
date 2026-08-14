// NEGATIVE CONTROLS FOR THE MERGE SWEEPS.
//
// Every sweep in merge-proposal.ts reported zero over the real proposal except three. A sweep
// that reports zero is worth nothing unless it can be shown to report something, because a
// broken check and a clean file print the same line. Each test below takes an entry of the shape
// the real files really produce, breaks exactly one thing, and requires the sweep to catch it —
// and each is paired with the unbroken version, which must stay silent.
//
// The fixtures are deliberately small and hand-written. They are NOT a second copy of the data:
// nothing here is a source of any value, and no test asserts a game number.

import { describe, expect, it } from 'vitest';

import type {
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedItemEffect,
  Item,
  Scaling,
} from '../../src/types/data.ts';
import { checkScalingShape } from '../../src/types/validate-curated.ts';
import {
  refuseSchemaInvalidAbilities,
  refuseUnknownScalingArms,
  scalingKinds,
  sweepDuplicateIdentity,
  sweepGate1Coverage,
  sweepItemSumGuard,
  sweepJoinIntegrity,
  sweepNonChampionOutsideAbilities,
  sweepSameLabelAdds,
  sweepStatusHonestyOutsideAbilities,
  classifyOverTime,
  withdrawalReason,
  READ_AS_OVER_TIME,
  SCALING_ARMS_GATE1_ACCEPTS,
} from './merge-proposal.ts';

const provenance = {
  source: 'test fixture',
  url: 'https://example.invalid',
  patch: '16.16.1',
  fetched: '2026-08-14',
};

const component = (over: Partial<CuratedAbility['components'][number]> = {}) => ({
  id: 'magic-damage',
  label: 'Magic Damage',
  damageType: 'magic' as const,
  base: { scaling: 'explicit' as const, perRank: [10, 20, 30, 40, 50] },
  ratios: [],
  ...over,
});

const ability = (over: Partial<CuratedAbility> = {}): CuratedAbility => ({
  champion: 'Lux',
  slot: 'Q',
  abilityName: 'Light Binding',
  instanceType: 'damaging-ability',
  damageType: 'magic',
  maxRank: 5,
  components: [component()],
  verification: 'derived',
  provenance,
  ...over,
});

const itemEffect = (over: Partial<CuratedItemEffect> = {}): CuratedItemEffect => ({
  itemId: 3100,
  itemName: 'Lich Bane',
  key: 'pass',
  name: 'Spellblade',
  kind: 'passive',
  components: [component({ id: 'lich-bane-pass', label: 'Spellblade', base: { scaling: 'explicit', perRank: [75] } })],
  verification: 'derived',
  provenance,
  ...over,
});

const defensiveEffect = (over: Partial<CuratedDefensiveEffect> = {}): CuratedDefensiveEffect => ({
  champion: 'Lux',
  slot: 'W',
  abilityName: 'Prismatic Barrier',
  kind: 'shield',
  activation: 'conditional',
  condition: 'on cast',
  unit: 'flat',
  value: { scaling: 'explicit', perRank: [50, 65, 80, 95, 110] },
  verification: 'derived',
  provenance,
  ...over,
});

const items: Item[] = [{ id: 3100 } as Item];

// PER-TICK COMPONENTS. The split that decides whether a figure lands in the burst line or the
// damage-over-time line, and the one place where being wrong hands a champion a number that is
// plausible and false. It had no test of its own until 2026-08-14.
describe('classifyOverTime — the per-tick split', () => {
  const perTick = (over = {}) =>
    component({ id: 'burn', label: 'Magic Damage Per Tick', hits: 10, ...over });

  it('marks a per-tick component of an entry in the read population, quoting the source', () => {
    const a = ability({ champion: 'Alistar', slot: 'E', abilityName: 'Trample', components: [perTick()] });
    const out = classifyOverTime([a]);
    expect(out.marked).toBe(1);
    expect(out.refused).toEqual([]);
    expect(a.components[0]!.overTime?.sourceSays).toContain('every 0.5 seconds over 5 seconds');
    expect(a.verification).toBe('derived');
  });

  it('withdraws a per-tick component of an entry outside the read population', () => {
    const a = ability({ champion: 'Nobody', slot: 'Q', abilityName: 'Untested', components: [perTick()] });
    const out = classifyOverTime([a]);
    expect(out.marked).toBe(0);
    expect(out.refused).toEqual(['Nobody/Q/Untested']);
    expect(a.verification).toBe('incomplete');
    expect(a.components[0]!.overTime).toBeUndefined();
  });

  it('SPLITS PER COMPONENT: an on-hit figure beside a burn keeps its place in the burst line', () => {
    const a = ability({
      champion: 'Alistar',
      slot: 'E',
      abilityName: 'Trample',
      components: [component({ id: 'on-hit', label: 'Bonus Magic Damage' }), perTick()],
    });
    classifyOverTime([a]);
    expect(a.components[0]!.overTime).toBeUndefined();
    expect(a.components[1]!.overTime).toBeDefined();
  });

  it('leaves an ability with no per-tick component completely alone', () => {
    const a = ability({ verification: 'derived' });
    expect(classifyOverTime([a])).toEqual({ marked: 0, refused: [] });
    expect(a.verification).toBe('derived');
  });

  it('marks 23 entries in all — the 4 read in §58 and the 19 whose counts the source corroborates', () => {
    expect(READ_AS_OVER_TIME.size).toBe(23);
    for (const [, why] of READ_AS_OVER_TIME) expect(why.length).toBeGreaterThan(20);
  });
});

describe('withdrawalReason — a withdrawn entry says what is actually missing', () => {
  it('names the missing count for an entry whose source states one nobody captured', () => {
    expect(withdrawalReason('Rumble/R/The Equalizer')).toContain('never captured');
  });

  it('says no count can exist for a toggle, rather than implying somebody could go and find one', () => {
    expect(withdrawalReason('Karthus/E/Defile')).toContain('states no duration');
  });

  it('says the source contradicts itself where it does', () => {
    expect(withdrawalReason('Nasus/E/Spirit Fire')).toContain('contradicts itself');
  });

  it('falls back to "nobody has read it" only for an entry nobody has read', () => {
    expect(withdrawalReason('Nobody/Q/Untested')).toContain('Nobody has yet read');
  });

  it('never tells a reader an entry is unread when it was read', () => {
    for (const key of ['Swain/R/Demonic Ascension', 'Viktor/R/Arcane Storm', 'Ornn/W/Bellows Breath']) {
      expect(withdrawalReason(key)).not.toContain('Nobody has yet read');
    }
  });
});

// The header said "gate 1 never walks item effects" until 2026-08-14, when it started to. The
// sweep is kept as a second reading of the same components; the claim about the gate is gone.
describe('S1 — the components of item effects and runes, read a second time', () => {
  it('is silent on a well-formed item effect', () => {
    expect(sweepGate1Coverage([itemEffect()], [])).toHaveLength(0);
  });

  it('catches an item effect whose damage type is not one of the three', () => {
    const broken = itemEffect({
      components: [component({ damageType: 'fire' as unknown as 'magic' })],
    });
    const found = sweepGate1Coverage([broken], []);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.message).toContain('bad damageType');
  });
});

describe('S2 — the sum guard, asked of item effects', () => {
  it('is silent on a single-component effect, which is every one in the proposal today', () => {
    expect(sweepItemSumGuard([itemEffect()])).toHaveLength(0);
  });

  it('catches two components that never say whether they add or replace each other', () => {
    const broken = itemEffect({
      components: [component({ id: 'a' }), component({ id: 'b' })],
    });
    expect(sweepItemSumGuard([broken])).toEqual(['Lich Bane [pass]']);
  });
});

describe('S3 — non-champion rows, asked outside abilities', () => {
  it('is silent on champion-facing labels', () => {
    expect(sweepNonChampionOutsideAbilities([itemEffect()], [defensiveEffect()])).toHaveLength(0);
  });

  it('catches a minion row that leaked into an item effect', () => {
    const broken = itemEffect({ components: [component({ label: 'Minion Damage' })] });
    expect(sweepNonChampionOutsideAbilities([broken], [])).toHaveLength(1);
  });

  it('catches a monster row that leaked into a defensive entry label', () => {
    expect(
      sweepNonChampionOutsideAbilities([], [defensiveEffect({ label: 'Monster Shield Strength' })]),
    ).toHaveLength(1);
  });
});

describe('S4 — status honesty outside abilities', () => {
  it('is silent when an unresolved owner is recorded as unresolvable AND forces incomplete', () => {
    const honest = itemEffect({
      components: [
        component({
          ratios: [{ stat: 'maxHP', owner: 'unresolved', scaling: 'explicit', perRank: [5] }],
        }),
      ],
      unresolvable: [{ field: 'ratios[0].owner', why: 'the source never says whose maximum health' }],
      verification: 'incomplete',
    });
    expect(sweepStatusHonestyOutsideAbilities([honest], [])).toHaveLength(0);
  });

  it("catches an unresolved owner on an entry still claiming 'derived'", () => {
    const broken = itemEffect({
      components: [
        component({
          ratios: [{ stat: 'maxHP', owner: 'unresolved', scaling: 'explicit', perRank: [5] }],
        }),
      ],
      unresolvable: [{ field: 'ratios[0].owner', why: 'the source never says whose maximum health' }],
      verification: 'derived',
    });
    const found = sweepStatusHonestyOutsideAbilities([broken], []);
    expect(found.join(' ')).toContain("claims 'derived'");
  });

  it('catches an unresolved owner recorded nowhere, which reads as work somebody could finish', () => {
    const broken = itemEffect({
      components: [
        component({
          ratios: [{ stat: 'maxHP', owner: 'unresolved', scaling: 'explicit', perRank: [5] }],
        }),
      ],
      verification: 'incomplete',
    });
    expect(sweepStatusHonestyOutsideAbilities([broken], []).join(' ')).toContain("no 'unresolvable' record");
  });

  it("catches a defensive entry claiming 'verified', which no ledger can grant it", () => {
    const broken = defensiveEffect({ verification: 'verified' });
    expect(sweepStatusHonestyOutsideAbilities([], [broken]).join(' ')).toContain("claims 'verified'");
  });
});

describe('S5 — join integrity', () => {
  // The shield lives on Lux W, so the W ability has to be present for the key to resolve.
  const shieldAbility = ability({ slot: 'W', abilityName: 'Prismatic Barrier' });

  it('is silent when every key resolves', () => {
    expect(
      sweepJoinIntegrity([ability(), shieldAbility], [defensiveEffect()], [itemEffect()], items),
    ).toHaveLength(0);
  });

  it('catches a defensive entry naming an ability that is not in the merged file', () => {
    const orphan = defensiveEffect({ abilityName: 'An Ability Nobody Harvested' });
    const found = sweepJoinIntegrity([ability(), shieldAbility], [orphan], [], items);
    expect(found.join(' ')).toContain('not in the merged file');
  });

  it('catches an item effect naming an item outside the shipped pool', () => {
    const orphan = itemEffect({ itemId: 999999 });
    const found = sweepJoinIntegrity([], [], [orphan], items);
    expect(found.join(' ')).toContain('not in the shipped pool');
  });

  // THE CASE THAT MATTERS AFTER A REFUSAL: refusing an ability could orphan its defensive entry.
  it('catches a defensive entry orphaned by the ability refusal itself', () => {
    const found = sweepJoinIntegrity([], [defensiveEffect()], [], items);
    expect(found).toHaveLength(1);
  });
});

describe('S6 — two rows under one label, both adding', () => {
  it('is silent on two rows that state they are alternatives', () => {
    const ok = ability({
      components: [
        component({ id: 'a', label: 'Magic Damage', relation: { kind: 'adds' } }),
        component({ id: 'b', label: 'Empowered Magic Damage', relation: { kind: 'alternativeTo', componentId: 'a' } }),
      ],
    });
    expect(sweepSameLabelAdds([ok])).toHaveLength(0);
  });

  it('catches two identically-labelled rows both marked adds — the shape that sums alternatives', () => {
    const broken = ability({
      components: [
        component({ id: 'a', label: 'Magic Damage', relation: { kind: 'adds' } }),
        component({ id: 'b', label: 'Magic Damage', relation: { kind: 'adds' } }),
      ],
    });
    const found = sweepSameLabelAdds([broken]);
    expect(found).toHaveLength(1);
    expect(found[0]!.labels).toEqual(['magic damage x2']);
  });

  it('treats a missing relation as adds, because that is what the contract says absent means', () => {
    const broken = ability({
      components: [component({ id: 'a' }), component({ id: 'b' })],
    });
    expect(sweepSameLabelAdds([broken])).toHaveLength(1);
  });
});

describe('S8 — duplicate identity', () => {
  it('is silent on distinct entries', () => {
    expect(sweepDuplicateIdentity([ability()], [itemEffect()], [defensiveEffect()])).toHaveLength(0);
  });

  it('catches the same ability twice', () => {
    expect(sweepDuplicateIdentity([ability(), ability()], [], [])).toHaveLength(1);
  });

  it('catches the same item effect key twice', () => {
    expect(sweepDuplicateIdentity([], [itemEffect(), itemEffect()], [])).toHaveLength(1);
  });

  it('does not confuse two different keys on one item', () => {
    expect(sweepDuplicateIdentity([], [itemEffect(), itemEffect({ key: 'act' })], [])).toHaveLength(0);
  });
});

describe('the two refusal rules', () => {
  it('keeps a well-formed ability and refuses one gate 1 rejects', () => {
    const good = ability();
    const bad = ability({
      champion: 'Twisted Fate',
      slot: 'W',
      abilityName: 'Pick a Card',
      components: [component({ id: 'magic-damage' }), component({ id: 'magic-damage' })],
      verification: 'incomplete',
    });
    const { kept, refusals } = refuseSchemaInvalidAbilities([good, bad], []);
    expect(kept).toHaveLength(1);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.refusalClass).toBe('duplicate-component-id');
    // Refusing an already-incomplete entry removes no number a user can see.
    expect(refusals[0]!.costsAVisibleNumber).toBe(false);
  });

  it('flags the refusal as costing a visible number when the entry was derived', () => {
    const bad = ability({
      components: [component({ id: 'x' }), component({ id: 'x' })],
      verification: 'derived',
    });
    const { refusals } = refuseSchemaInvalidAbilities([bad], []);
    expect(refusals[0]!.costsAVisibleNumber).toBe(true);
  });

  // UNTIL 2026-08-14 THIS TEST USED A RANGE SPLIT, and required it to be refused. That was the
  // right assertion while gate 1's shape checker had no `byRangeType` case: the data was well
  // formed and the checker was short of a case, so merging would have left the override file
  // permanently reporting a finding nobody could act on. The case now exists, a range split is
  // accepted, and requiring the old refusal would be pinning a closed gap open. The refusal
  // itself is NOT dead — it is what stops a SIXTH arm reaching the file ahead of its case — so it
  // is exercised here with an arm nobody has written a case for.
  it('refuses an item effect on an arm gate 1 has no case for, and says the checker is what is short', () => {
    const unknownArm = itemEffect({
      components: [
        component({
          base: { scaling: 'byResourceType' } as unknown as Scaling,
        }),
      ],
      verification: 'incomplete',
    });
    const { kept, refusals } = refuseUnknownScalingArms([itemEffect(), unknownArm]);
    expect(kept).toHaveLength(1);
    expect(refusals[0]!.refusalClass).toBe('validator-has-no-arm-for-this-scaling');
    expect(refusals[0]!.wouldUnblock).toContain('checkScalingShape');
  });

  it('keeps a range-split item effect now that gate 1 has a case for it', () => {
    const rangeSplit = itemEffect({
      components: [
        component({
          ratios: [
            {
              stat: 'maxHP',
              owner: 'unresolved',
              scaling: 'byRangeType',
              melee: { scaling: 'explicit', perRank: [1] },
              ranged: { scaling: 'explicit', perRank: [0.5] },
            },
          ],
        }),
      ],
      verification: 'incomplete',
      unresolvable: [{ field: 'ratios[0].owner', why: 'no source says whose maximum health' }],
    });
    const { kept, refusals } = refuseUnknownScalingArms([itemEffect(), rangeSplit]);
    expect(kept).toHaveLength(2);
    expect(refusals).toHaveLength(0);
  });
});

describe('scalingKinds — the helper the arm sweep rests on', () => {
  it('finds an arm nested inside a ratio inside a component', () => {
    const kinds = scalingKinds([
      component({
        ratios: [
          {
            stat: 'bonusAD',
            scaling: 'byRangeType',
            melee: { scaling: 'explicit', perRank: [120] },
            ranged: { scaling: 'linear', from: 84, to: 84 },
          },
        ],
      }),
    ]);
    expect(kinds.get('byRangeType')).toBe(1);
    expect(kinds.get('explicit')).toBe(2); // the component base and the melee arm
    expect(kinds.get('linear')).toBe(1);
  });

  // THIS TEST USED TO RESTATE THE LIST AS FOUR LITERALS, which is how it came to be wrong: the
  // list and the checker are two records of one fact, and on 2026-08-14 the checker gained a case
  // the list did not. It now ASKS the checker instead, so the two cannot drift apart again.
  it('names exactly the arms gate 1 has a case for — asked of the checker, not restated', () => {
    const sample: Record<string, Scaling> = {
      linear: { scaling: 'linear', from: 1, to: 2 },
      explicit: { scaling: 'explicit', perRank: [1] },
      byLevel: { scaling: 'byLevel', from: 1, to: 2, atLevels: [1, 18], steps: 2 },
      byLevelExplicit: { scaling: 'byLevelExplicit', values: [1], atLevels: [1] },
      byRangeType: {
        scaling: 'byRangeType',
        melee: { scaling: 'linear', from: 1, to: 1 },
        ranged: { scaling: 'linear', from: 2, to: 2 },
      },
    };
    // Every arm in the list is one the checker really accepts...
    for (const arm of SCALING_ARMS_GATE1_ACCEPTS) {
      expect(sample[arm], `no sample written for arm '${arm}'`).toBeDefined();
      expect(checkScalingShape(sample[arm]!, arm)).toEqual([]);
    }
    // ...and every arm the checker accepts is in the list. An arm added to the checker without
    // being added here would leave the merge refusing data gate 1 would now pass.
    for (const [arm, value] of Object.entries(sample)) {
      if (checkScalingShape(value, arm).length === 0) {
        expect(SCALING_ARMS_GATE1_ACCEPTS.has(arm)).toBe(true);
      }
    }
    // And an arm nobody has written a case for is refused by both.
    expect(SCALING_ARMS_GATE1_ACCEPTS.has('byResourceType')).toBe(false);
    expect(
      checkScalingShape({ scaling: 'byResourceType' } as unknown as Scaling, 'v').join(' '),
    ).toMatch(/unknown scaling kind/);
  });
});
