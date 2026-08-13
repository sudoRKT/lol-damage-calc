// Known-answer tests for the curated-file validator.
//
// The cases are drawn from real templates fetched on 2026-08-12. The Aatrox and Darius cases
// are the ones that matter: they are the shapes that would otherwise ship a silently wrong
// number, and they are why gate 3 exists at all.

import { describe, expect, it } from 'vitest';

import type {
  AbilityComponent,
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedFile,
  Provenance,
  Ratio,
  RatioOwner,
} from './data.ts';
import {
  agreesAtDisplayPrecision,
  compareAtDisplayPrecision,
  compareExpansion,
  decimalsOf,
  gateNonChampion,
  gateSchema,
  gateStatusHonesty,
  gateSumGuard,
  roundHalfUp,
  validateCuratedFile,
} from './validate-curated.ts';

const PROV: Provenance = {
  source: 'Template:Data Aatrox/The Darkin Blade',
  url: 'https://wiki.leagueoflegends.com/en-us/Template:Data_Aatrox/Q',
  patch: '16.16.1',
  fetched: '2026-08-12',
};

function ability(over: Partial<CuratedAbility> = {}): CuratedAbility {
  return {
    champion: 'Lux',
    slot: 'Q',
    abilityName: 'Light Binding',
    instanceType: 'damaging-ability',
    damageType: 'magic',
    maxRank: 5,
    components: [
      {
        id: 'damage',
        label: 'Magic Damage',
        damageType: 'magic',
        base: { scaling: 'linear', from: 80, to: 240 },
        ratios: [{ stat: 'AP', scaling: 'linear', from: 75, to: 75 }],
      },
    ],
    verification: 'derived',
    provenance: PROV,
    ...over,
  };
}

function file(abilities: CuratedAbility[]): CuratedFile {
  return {
    version: 1,
    patch: '16.16.1',
    fetched: '2026-08-12',
    abilities,
    itemEffects: [],
    runes: [],
    shards: [],
    exclusions: [],
  };
}

const comp = (over: Partial<AbilityComponent> & { id: string }): AbilityComponent => ({
  damageType: 'physical',
  base: { scaling: 'linear', from: 50, to: 170 },
  ratios: [],
  ...over,
});

describe('gate 1 — schema', () => {
  it('passes a well-formed entry', () => {
    const r = gateSchema(file([ability()]));
    expect(r.failed).toBe(0);
    expect(r.passed).toBe(1);
  });

  it('catches an explicit list whose length does not match maxRank', () => {
    const r = gateSchema(
      file([
        ability({
          components: [comp({ id: 'd', base: { scaling: 'explicit', perRank: [675, 675, 775] } })],
          maxRank: 5,
        }),
      ]),
    );
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/3 values but the ability has 5 ranks/);
  });

  it("rejects a 'stacks' ratio that does not name its counter", () => {
    // Nasus Q scales off Siphoning Strike stacks; without a counter key the engine has
    // nothing to join to ChampionConfig.persistent.
    const r = gateSchema(
      file([
        ability({
          components: [
            comp({ id: 'd', ratios: [{ stat: 'stacks', scaling: 'linear', from: 100, to: 100 }] }),
          ],
        }),
      ]),
    );
    expect(r.findings.some((f) => /requires a 'counter' key/.test(f.message))).toBe(true);
  });

  it('rejects a byLevel value that runs past level 18', () => {
    // The documented trap: the wiki renders Press the Attack at 174.12, its level-20
    // extrapolation. Champions cap at 18 (DATA-SOURCES §13).
    const r = gateSchema(
      file([
        ability({
          components: [
            comp({ id: 'd', base: { scaling: 'byLevel', from: 40, to: 174.12, atLevels: [1, 20], steps: 20 } }),
          ],
        }),
      ]),
    );
    expect(r.findings.some((f) => /outside 1\.\.18/.test(f.message))).toBe(true);
  });

  it('rejects a relation pointing at a component that is not there', () => {
    const r = gateSchema(
      file([
        ability({
          components: [
            comp({ id: 'blade', relation: { kind: 'adds' } }),
            comp({ id: 'handle', relation: { kind: 'alternativeTo', componentId: 'ghost' } }),
          ],
        }),
      ]),
    );
    expect(r.findings.some((f) => /alternativeTo 'ghost', which is not here/.test(f.message))).toBe(
      true,
    );
  });

  it('rejects two components sharing an id, and two abilities sharing a key', () => {
    const dup = gateSchema(
      file([ability({ components: [comp({ id: 'x' }), comp({ id: 'x' })] })]),
    );
    expect(dup.findings.some((f) => /duplicate component id/.test(f.message))).toBe(true);
    const two = gateSchema(file([ability(), ability()]));
    expect(two.findings.some((f) => /duplicate entry/.test(f.message))).toBe(true);
  });

  it('distinguishes a form entry from its base champion rather than calling it a duplicate', () => {
    const r = gateSchema(
      file([
        ability({ champion: 'Kayn', abilityName: 'Reaping Slash' }),
        ability({ champion: 'Kayn', abilityName: 'Reaping Slash', form: 'Rhaast' }),
      ]),
    );
    expect(r.failed).toBe(0);
  });
});

describe('gate 3 — the sum guard (the Aatrox check)', () => {
  it('fails a multi-component ability that leaves relation unstated', () => {
    // Darius Q: blade and handle. You hit with one or the other, never both.
    const r = gateSumGuard(
      file([
        ability({
          champion: 'Darius',
          abilityName: 'Decimate',
          components: [
            comp({ id: 'blade', label: 'Physical Damage (Blade)' }),
            comp({ id: 'handle', label: 'Reduced Damage (Handle)' }),
          ],
        }),
      ]),
    );
    expect(r.failed).toBe(1);
    expect(r.findings.filter((f) => /must state relation/.test(f.message))).toHaveLength(2);
  });

  it('passes once the alternative is declared', () => {
    const r = gateSumGuard(
      file([
        ability({
          champion: 'Darius',
          abilityName: 'Decimate',
          components: [
            comp({ id: 'blade', label: 'Physical Damage (Blade)', relation: { kind: 'adds' } }),
            comp({
              id: 'handle',
              label: 'Reduced Damage (Handle)',
              relation: { kind: 'alternativeTo', componentId: 'blade' },
            }),
          ],
        }),
      ]),
    );
    expect(r.failed).toBe(0);
  });

  it('catches Aatrox Q marked additive across its sweetspot variants', () => {
    // Three casts x (normal, sweetspot). All six marked 'adds' would hand Aatrox six casts'
    // worth of Q damage from a single cast.
    const sixAdds = ['First', 'Second', 'Third'].flatMap((n) => [
      comp({ id: `${n}-cast`, label: `${n} Cast Damage`, relation: { kind: 'adds' as const } }),
      comp({
        id: `${n}-sweet`,
        label: `${n} Sweetspot Damage`,
        relation: { kind: 'adds' as const },
      }),
    ]);
    const r = gateSumGuard(
      file([ability({ champion: 'Aatrox', abilityName: 'The Darkin Blade', components: sixAdds })]),
    );
    expect(r.failed).toBe(1);
    // Three sweetspot rows and three "first/second/third cast" rows all read as variants.
    expect(r.findings.length).toBeGreaterThanOrEqual(3);
    expect(r.findings.some((f) => /Sweetspot/.test(f.message))).toBe(true);
    expect(r.findings.every((f) => /double-counts/.test(f.message))).toBe(true);
  });

  it('rejects a stored Total summary row', () => {
    const r = gateSumGuard(
      file([
        ability({
          components: [
            comp({ id: 'd', label: 'True Damage', relation: { kind: 'adds' } }),
            comp({ id: 't', label: 'Total True Damage', relation: { kind: 'adds' } }),
          ],
        }),
      ]),
    );
    expect(r.findings.some((f) => /not independent damage/.test(f.message))).toBe(true);
  });

  it('does NOT reject a Minimum/Maximum pair — those are real damage', () => {
    // Evidence-led correction. Treating Minimum/Maximum as summaries dropped every damage row
    // from 32 abilities, each of which would then have dealt zero. They are stored, and the
    // alternativeTo relation is what stops them being summed.
    const r = gateSumGuard(
      file([
        ability({
          champion: 'Veigar',
          abilityName: 'Primordial Burst',
          components: [
            comp({ id: 'min', label: 'Minimum Magic Damage', relation: { kind: 'adds' } }),
            comp({
              id: 'max',
              label: 'Maximum Magic Damage',
              relation: { kind: 'alternativeTo', componentId: 'min' },
            }),
          ],
        }),
      ]),
    );
    expect(r.failed).toBe(0);
  });

  it('leaves single-component abilities alone — the hazard cannot exist there', () => {
    const r = gateSumGuard(file([ability()]));
    expect(r.checked).toBe(0);
    expect(r.failed).toBe(0);
  });
});

describe('gate 1 — health-pool ownership', () => {
  // A health pool names a quantity but not a champion. Bel'Veth R is "20% of target's
  // missing health"; the same figure read off the CASTER is a different number entirely,
  // and no downstream check would notice. So the owner is required, never defaulted.
  // Bel'Veth R's real shape, with only the owner varied.
  const health = (over: { owner?: RatioOwner } = {}) =>
    ability({
      components: [
        comp({
          id: 'd',
          label: 'True Damage',
          ratios: [{ stat: 'missingHP', scaling: 'linear', from: 20, to: 20, ...over }],
        }),
      ],
    });

  it('rejects a health ratio that does not say whose health it reads', () => {
    const r = gateSchema(file([health()]));
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/requires an[\s\S]*'owner'/);
  });

  it("accepts 'caster', 'target' and 'unresolved'", () => {
    for (const owner of ['caster', 'target', 'unresolved'] as const) {
      expect(gateSchema(file([health({ owner })])).failed).toBe(0);
    }
  });

  it('rejects an owner value that is not one of the three', () => {
    const r = gateSchema(file([health({ owner: 'enemy' as never })]));
    expect(r.failed).toBe(1);
    expect(r.findings.some((f) => /bad owner 'enemy'/.test(f.message))).toBe(true);
  });

  it('requires the owner on every health pool, not just missing health', () => {
    for (const stat of ['maxHP', 'bonusHP', 'currentHP', 'missingHP'] as const) {
      const r = gateSchema(
        file([
          ability({
            components: [
              comp({ id: 'd', ratios: [{ stat, scaling: 'linear', from: 5, to: 5 }] }),
            ],
          }),
        ]),
      );
      expect(r.failed, `${stat} should require an owner`).toBe(1);
    }
  });

  it('requires the owner on armor, magic resistance and mana as well', () => {
    for (const stat of [
      'armor',
      'bonusArmor',
      'magicResist',
      'bonusMagicResist',
      'maxMana',
      'currentMana',
    ] as const) {
      const r = gateSchema(
        file([
          ability({
            components: [comp({ id: 'd', ratios: [{ stat, scaling: 'linear', from: 30, to: 30 }] })],
          }),
        ]),
      );
      expect(r.failed, `${stat} should require an owner`).toBe(1);
      expect(r.findings[0]!.message).toMatch(/requires an[\s\S]*'owner'/);
    }
  });

  it('does not demand an owner on a stat that has only one possible reading', () => {
    const r = gateSchema(
      file([
        ability({
          components: [
            comp({ id: 'd', ratios: [{ stat: 'AP', scaling: 'linear', from: 75, to: 75 }] }),
          ],
        }),
      ]),
    );
    expect(r.failed).toBe(0);
  });
});

describe('gate 4 — non-champion rows', () => {
  it('catches a minion/monster row that leaked through harvest', () => {
    const r = gateNonChampion(
      file([
        ability({
          components: [
            comp({ id: 'd', label: 'Magic Damage' }),
            comp({ id: 'm', label: 'Capped Monster Damage' }),
          ],
        }),
      ]),
    );
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/champion-versus-champion/);
  });

  it('does not fire on an ordinary damage label', () => {
    expect(gateNonChampion(file([ability()])).failed).toBe(0);
  });
});

describe('gate 6 — status honesty', () => {
  const key = 'Lux/Q/Light Binding';

  const unresolvedHealth = (verification: CuratedAbility['verification']) =>
    ability({
      verification,
      sourceRevision: 1,
      components: [
        comp({
          id: 'd',
          label: 'Magic Damage',
          ratios: [
            { stat: 'bonusHP', owner: 'unresolved', scaling: 'linear', from: 7, to: 7 },
          ],
        }),
      ],
    });

  it("refuses 'derived' when an ability does not know whose health it reads", () => {
    // 'derived' means "extracted from source, not independently confirmed". An unresolved
    // owner means the source did not say — that is 'incomplete', a weaker claim.
    const r = gateStatusHonesty(file([unresolvedHealth('derived')]), {
      roundTripPassed: new Set([key]),
      independentlyChecked: new Set([key]),
    });
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/do not say whose health/);
  });

  it("refuses 'verified' for the same reason, even with both evidence gates recorded", () => {
    const r = gateStatusHonesty(file([unresolvedHealth('verified')]), {
      roundTripPassed: new Set([key]),
      independentlyChecked: new Set([key]),
    });
    expect(r.findings.some((f) => /do not say whose health/.test(f.message))).toBe(true);
  });

  it("accepts 'incomplete' with an unresolved owner ONLY when it says the fact is unresolvable", () => {
    // An unresolved owner can never be filled in — no source states it — so the entry has to
    // say so. Without that the interface cannot tell a user "nobody can finish this" apart from
    // "nobody has finished this yet".
    const evidence = { roundTripPassed: new Set<string>(), independentlyChecked: new Set<string>() };
    const bare = gateStatusHonesty(file([unresolvedHealth('incomplete')]), evidence);
    expect(bare.failed).toBe(1);
    expect(bare.findings[0]!.message).toMatch(/records no 'unresolvable' entry/);

    const declaredEntry = unresolvedHealth('incomplete');
    declaredEntry.unresolvable = [
      { field: 'components[0].ratios[0].owner', why: 'the source names the pool and not whose' },
    ];
    expect(gateStatusHonesty(file([declaredEntry]), evidence).failed).toBe(0);
  });

  it('says nothing about an ability whose owners are all resolved', () => {
    const r = gateStatusHonesty(
      file([
        ability({
          verification: 'derived',
          components: [
            comp({
              id: 'd',
              ratios: [
                { stat: 'missingHP', owner: 'target', scaling: 'linear', from: 20, to: 20 },
              ],
            }),
          ],
        }),
      ]),
      { roundTripPassed: new Set(), independentlyChecked: new Set() },
    );
    expect(r.failed).toBe(0);
  });

  it("refuses 'verified' with no recorded gate 2 or gate 5 pass", () => {
    const r = gateStatusHonesty(file([ability({ verification: 'verified', sourceRevision: 1 })]), {
      roundTripPassed: new Set(),
      independentlyChecked: new Set(),
    });
    expect(r.failed).toBe(1);
    expect(r.findings).toHaveLength(2);
  });

  it("refuses 'verified' when only the round-trip ran", () => {
    const r = gateStatusHonesty(file([ability({ verification: 'verified', sourceRevision: 1 })]), {
      roundTripPassed: new Set([key]),
      independentlyChecked: new Set(),
    });
    expect(r.findings.some((f) => /gate 5/.test(f.message))).toBe(true);
  });

  it("accepts 'verified' when both gates and a source revision are recorded", () => {
    const r = gateStatusHonesty(file([ability({ verification: 'verified', sourceRevision: 12345 })]), {
      roundTripPassed: new Set([key]),
      independentlyChecked: new Set([key]),
    });
    expect(r.failed).toBe(0);
  });

  it("leaves 'derived' and 'incomplete' entries alone — they claim nothing", () => {
    const r = gateStatusHonesty(
      file([ability({ verification: 'derived' }), ability({ champion: 'Ashe', verification: 'incomplete' })]),
      { roundTripPassed: new Set(), independentlyChecked: new Set() },
    );
    expect(r.failed).toBe(0);
  });
});

describe('compareExpansion — gate 2 comparison', () => {
  it('reports nothing when the stored scaling reproduces the source', () => {
    expect(compareExpansion([80, 120, 160, 200, 240], [80, 120, 160, 200, 240])).toEqual([]);
  });

  it('pinpoints the rank that disagrees', () => {
    // A Kayle R stored as linear would render 725 at rank 2 where the source says 675.
    const diff = compareExpansion([675, 675, 775], [675, 725, 775]);
    expect(diff).toEqual([{ index: 1, expected: 675, actual: 725 }]);
  });

  it('reports a length mismatch rather than silently comparing the overlap', () => {
    expect(compareExpansion([1, 2, 3], [1, 2])).toHaveLength(1);
  });
});

describe('validateCuratedFile', () => {
  it('runs all four machine gates and returns one report each', () => {
    const reports = validateCuratedFile(file([ability()]));
    expect(reports.map((r) => r.gate)).toEqual([
      'schema',
      'sum-guard',
      'non-champion',
      'status-honesty',
    ]);
    expect(reports.every((r) => r.failed === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gate 2 at the wiki's display precision (DATA-SOURCES §24).
// The three cases below are the three the full-roster run of 2026-08-13 reported as
// value-differing rows which were in fact the wiki printing a rounded figure.
// ---------------------------------------------------------------------------

describe('agreesAtDisplayPrecision', () => {
  it('clears the three display-rounding rows the roster run reported', () => {
    expect(agreesAtDisplayPrecision(140.63, 140.625)).toBe(true); // Rumble Q
    expect(agreesAtDisplayPrecision(100, 99.9975)).toBe(true); // Varus Q
    expect(agreesAtDisplayPrecision(3.71, 3.7125)).toBe(true); // Zeri Q
  });

  it('does NOT clear a difference the wiki could have shown', () => {
    // The failure this rule must not become: a printed 275 against a stored 275.4 rounds to
    // 275 at zero decimals, and waving it through would hide a 0.4 error behind the
    // comparison. Half of the last place at the wiki's own precision is the bound.
    expect(agreesAtDisplayPrecision(275, 275.4)).toBe(false);
    expect(agreesAtDisplayPrecision(150, 75)).toBe(false);
    expect(agreesAtDisplayPrecision(3.71, 3.72)).toBe(false);
  });

  it('clears nothing the wiki would have printed differently', () => {
    expect(agreesAtDisplayPrecision(10, 10.005)).toBe(false); // the wiki would print 10.01
    expect(agreesAtDisplayPrecision(10, 10.0049)).toBe(true); // the wiki would print 10
  });

  it('survives the half-way boundary that floating point lands just under', () => {
    // Zeri's passive: the module computes 14.275 and prints 14.28; our arithmetic reaches
    // 14.274999999999999. Without the boundary nudge this reported a phantom disagreement.
    expect(agreesAtDisplayPrecision(14.28, 14.274999999999999)).toBe(true);
  });

  it('uses the finer precision when the wiki printed more than two decimals', () => {
    // A block carrying round=3 really does show a third decimal, so a difference there is real.
    expect(agreesAtDisplayPrecision(1.234, 1.2349)).toBe(false);
  });

  it('refuses to compare a missing value', () => {
    expect(agreesAtDisplayPrecision(Number.NaN, 5)).toBe(false);
  });

  it('follows the wiki rounding helper exactly, half up', () => {
    expect(roundHalfUp(140.625, 2)).toBe(140.63);
    expect(roundHalfUp(99.9975, 2)).toBe(100);
    expect(decimalsOf(140.63)).toBe(2);
    expect(decimalsOf(100)).toBe(0);
  });

  it('reports how many differences it cleared rather than absorbing them', () => {
    const r = compareAtDisplayPrecision([140.63, 275], [140.625, 275.4]);
    expect(r.clearedByDisplayRounding).toBe(1);
    expect(r.differences).toHaveLength(1);
    expect(r.differences[0]!.expected).toBe(275);
  });
});

// ---------------------------------------------------------------------------
// 'no-damage', and permanent versus pending (DATA-SOURCES §27).
// ---------------------------------------------------------------------------

describe("the 'no-damage' status", () => {
  const base = {
    champion: 'Janna',
    slot: 'E' as const,
    abilityName: 'Eye Of The Storm',
    damageType: 'magic' as const,
    maxRank: 5,
    provenance: { source: 'Template:Data Janna/E', patch: '16.16.1' },
  };

  it('accepts an entry that stores nothing and is typed as non-damaging', () => {
    const f = {
      version: 1, patch: '16.16.1', fetched: '2026-08-13',
      abilities: [{ ...base, instanceType: 'non-damaging-ability' as const, verification: 'no-damage' as const, components: [] }],
      itemEffects: [], runes: [], shards: [], exclusions: [],
    };
    expect(gateSchema(f).failed).toBe(0);
    expect(gateStatusHonesty(f, { roundTripPassed: new Set(), independentlyChecked: new Set() }).failed).toBe(0);
  });

  it('refuses it on an entry that carries damage', () => {
    const f = {
      version: 1, patch: '16.16.1', fetched: '2026-08-13',
      abilities: [{
        ...base,
        instanceType: 'non-damaging-ability' as const,
        verification: 'no-damage' as const,
        components: [{ id: 'd', damageType: 'magic' as const, base: { scaling: 'linear' as const, from: 10, to: 50 }, ratios: [] }],
      }],
      itemEffects: [], runes: [], shards: [], exclusions: [],
    };
    const r = gateSchema(f);
    expect(r.failed).toBe(1);
    expect(r.findings.some((x) => /claim that the ability deals none/.test(x.message))).toBe(true);
  });

  it('refuses it on an entry whose instance type says it damages', () => {
    const f = {
      version: 1, patch: '16.16.1', fetched: '2026-08-13',
      abilities: [{ ...base, instanceType: 'damaging-ability' as const, verification: 'no-damage' as const, components: [] }],
      itemEffects: [], runes: [], shards: [], exclusions: [],
    };
    const r = gateStatusHonesty(f, { roundTripPassed: new Set(), independentlyChecked: new Set() });
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/instanceType is 'damaging-ability'/);
  });

  it("refuses 'unresolvable' on anything that is not incomplete", () => {
    const f = {
      version: 1, patch: '16.16.1', fetched: '2026-08-13',
      abilities: [{
        ...base,
        instanceType: 'damaging-ability' as const,
        verification: 'derived' as const,
        components: [],
        unresolvable: [{ field: 'x', why: 'no source states it' }],
      }],
      itemEffects: [], runes: [], shards: [], exclusions: [],
    };
    const r = gateStatusHonesty(f, { roundTripPassed: new Set(), independentlyChecked: new Set() });
    expect(r.findings.some((x) => /recording a fact no source states/.test(x.message))).toBe(true);
  });

  it('requires an unresolvable entry to name the field and say why', () => {
    const f = {
      version: 1, patch: '16.16.1', fetched: '2026-08-13',
      abilities: [{
        ...base,
        instanceType: 'damaging-ability' as const,
        verification: 'incomplete' as const,
        components: [],
        unresolvable: [{ field: '', why: '' }],
      }],
      itemEffects: [], runes: [], shards: [], exclusions: [],
    };
    expect(gateSchema(f).failed).toBe(1);
  });
});

// =========================================================================================
// THE STACKS UNIT (decided 2026-08-13, before any data exists)
// =========================================================================================

describe('gate 1 — a stacks ratio is refused when it is written in the other unit', () => {
  const withStacksRatio = (scaling: Ratio) =>
    file([
      ability({
        components: [
          {
            id: 'q',
            damageType: 'physical',
            base: { scaling: 'linear', from: 30, to: 30 },
            ratios: [scaling],
          },
        ],
      }),
    ]);

  const stacks = (over: Partial<Ratio>): Ratio =>
    ({ stat: 'stacks', counter: 'nasusQ', scaling: 'linear', from: 100, to: 100, ...over }) as Ratio;

  it('accepts "+1 damage per stack" written as 100 percentage points', () => {
    // THE DECIDED UNIT. `Ratio` fixes every magnitude as percentage points of the stat it reads,
    // with no exception for `stacks`: (100 / 100) x 25 stacks = 25 damage.
    const r = gateSchema(withStacksRatio(stacks({})));
    expect(r.failed).toBe(0);
  });

  it('REFUSES the same ability written as 1 damage per stack', () => {
    // The whole point of the guard. Reading this as percentage points gives 0.01 damage per
    // stack, so a 300-stack Nasus would contribute 3 damage instead of 300 — a hundredfold
    // error that no other check in this project would notice.
    const r = gateSchema(withStacksRatio(stacks({ from: 1, to: 1 })));
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/percentage points/i);
    // The message must name BOTH readings and the exact value to store instead, because the
    // author is the only person who knows which was meant.
    expect(r.findings[0]!.message).toMatch(/\+1 damage per stack" is 100, not 1/);
    expect(r.findings[0]!.message).toMatch(/store 100\/100/);
  });

  it('refuses "5 damage per soul" written as 5, the Dark Harvest shape', () => {
    const r = gateSchema(withStacksRatio(stacks({ counter: 'darkHarvest', from: 5, to: 5 })));
    expect(r.failed).toBe(1);
  });

  it('accepts a half-point-per-stack ratio, which is 50 points and clears the floor', () => {
    const r = gateSchema(withStacksRatio(stacks({ from: 50, to: 50 })));
    expect(r.failed).toBe(0);
  });

  it('judges a rank-scaled ratio across EVERY rank, not just rank 1', () => {
    // Below the floor at rank 1 and far above it by rank 5. Refusing on the rank-1 value alone
    // would reject real data, so the rule is "below the floor at every rank".
    const r = gateSchema(withStacksRatio(stacks({ from: 5, to: 400 })));
    expect(r.failed).toBe(0);
  });

  it('leaves a ratio on any other stat alone', () => {
    // A 1% AP ratio is a legitimate, ordinary thing. The floor applies to `stacks` only, because
    // it rests on an argument about per-stack damage that says nothing about ability power.
    const r = gateSchema(
      withStacksRatio({ stat: 'AP', scaling: 'linear', from: 1, to: 1 } as Ratio),
    );
    expect(r.failed).toBe(0);
  });

  it('never converts — the entry is refused, so it can only ever be incomplete', () => {
    // SPECIFICATION §8: a figure absent rather than wrong. Multiplying by 100 would be guessing
    // which unit the author meant, on a number that reaches a user as damage.
    const bad = withStacksRatio(stacks({ from: 1, to: 1 }));
    gateSchema(bad);
    const ratio = bad.abilities[0]!.components[0]!.ratios[0] as { from: number };
    expect(ratio.from).toBe(1);
  });
});

// =========================================================================================
// THE SIX DEFENSIVE SHAPE FIELDS (added 2026-08-13; DATA-SOURCES §40, §42)
// =========================================================================================

describe('gate 1 — the defensive kit entry', () => {
  const defensive = (over: Partial<CuratedDefensiveEffect> = {}): CuratedDefensiveEffect => ({
    champion: 'Leona',
    slot: 'W',
    abilityName: 'Eclipse',
    kind: 'shield',
    activation: 'conditional',
    condition: 'while Eclipse is active',
    verification: 'derived',
    provenance: PROV,
    ...over,
  });

  const defFile = (effects: CuratedDefensiveEffect[]): CuratedFile => ({
    ...file([]),
    defensiveEffects: effects,
  });

  it('passes a well-formed entry with no value at all', () => {
    // 17 confirmed effects state no figure — a spell shield blocks one ability, an
    // invulnerability blocks everything (DATA-SOURCES §40.2). Absent is legitimate.
    const r = gateSchema(defFile([defensive({ kind: 'spell-shield' })]));
    expect(r.failed).toBe(0);
    expect(r.checked).toBe(1);
  });

  it('refuses a value with no unit — 25 could be 25 points or 25%', () => {
    const r = gateSchema(
      defFile([
        defensive({ kind: 'damage-reduction', value: { scaling: 'linear', from: 25, to: 25 } }),
      ]),
    );
    expect(r.failed).toBe(1);
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/requires a 'unit'/);
  });

  it('refuses a resistance grant that does not say WHICH resistance', () => {
    // The single largest release of the six: 8 pairs blocked by this alone. 7 armor and 7 magic
    // resistance are the difference between mitigating physical and magic damage.
    const r = gateSchema(
      defFile([
        defensive({
          kind: 'resistance-grant',
          unit: 'flat',
          value: { scaling: 'linear', from: 20, to: 50 },
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/requires 'grantedStat'/);
  });

  it('accepts Leona W as TWO labelled, related entries — the case that motivated the fields', () => {
    // "Leona W grants 20-50 armor AND 20-50 magic resistance" from two rows on one page. With
    // one unlabelled value per entry the pair was indistinguishable and the proposer stored
    // neither. Two entries, each with an id, a label and its own granted stat, express it.
    const armor = defensive({
      id: 'armor',
      label: 'Armor',
      kind: 'resistance-grant',
      grantedStat: 'armor',
      unit: 'flat',
      value: { scaling: 'linear', from: 20, to: 50 },
      relation: { kind: 'adds' },
    });
    const mr = defensive({
      id: 'mr',
      label: 'Magic Resistance',
      kind: 'resistance-grant',
      grantedStat: 'magicResist',
      unit: 'flat',
      value: { scaling: 'linear', from: 20, to: 50 },
      relation: { kind: 'adds' },
    });
    const r = gateSchema(defFile([armor, mr]));
    expect(r.failed).toBe(0);
    expect(r.checked).toBe(2);
  });

  it('refuses that same pair when it is unlabelled and unrelated', () => {
    const bare = (id: string) =>
      defensive({ id, kind: 'resistance-grant', grantedStat: 'armor', unit: 'flat' });
    const messages = gateSchema(defFile([bare('a'), bare('b')]))
      .findings.map((f) => f.message)
      .join(' ');
    expect(messages).toMatch(/'relation' must be stated explicitly/);
    expect(messages).toMatch(/requires the source's own 'label'/);
  });

  it('refuses a type-specific reduction that does not name its type', () => {
    // Stored without it the entry reduces every type, which is a different effect.
    const r = gateSchema(
      defFile([
        defensive({
          kind: 'type-specific-reduction',
          unit: 'percent',
          value: { scaling: 'linear', from: 25, to: 25 },
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/requires 'appliesToDamageType'/);
  });

  it('refuses a rate on anything but a heal — life steal is not shield health', () => {
    const r = gateSchema(
      defFile([
        defensive({
          kind: 'shield',
          unit: 'percent-of-damage-dealt',
          value: { scaling: 'linear', from: 12, to: 12 },
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/not an amount/);
  });

  it('accepts a healing rate and a healing amplifier on a heal', () => {
    const rate = gateSchema(
      defFile([
        defensive({
          kind: 'heal',
          unit: 'percent-of-damage-dealt',
          value: { scaling: 'linear', from: 12, to: 12 },
        }),
      ]),
    );
    expect(rate.failed).toBe(0);
  });

  it('refuses an over-time block that does not quote its sentence', () => {
    // Same rule as VariableHitCount: a recurrence claim is traceable to a sentence, never to a
    // parser's judgement.
    const r = gateSchema(
      defFile([defensive({ kind: 'heal', overTime: { sourceSays: '' } })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/must quote the sentence/);
  });

  it('refuses a relation pointing at an entry that does not exist', () => {
    const r = gateSchema(
      defFile([
        defensive({ id: 'min', label: 'Minimum', relation: { kind: 'alternativeTo', componentId: 'max' } }),
        defensive({ id: 'other', label: 'Other', kind: 'heal', relation: { kind: 'adds' } }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/names no entry on this ability/);
  });

  it('refuses an unresolvable fact beside anything but incomplete', () => {
    const r = gateSchema(
      defFile([
        defensive({
          verification: 'derived',
          unresolvable: [{ field: 'ratios[0].owner (armor)', why: 'the source never says whose' }],
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/forces 'incomplete'/);
  });

  it('refuses a ratio on a stat that belongs to a champion and says nothing about whose', () => {
    // Malphite W again, on the defensive side: a "15% armor" grant is meaningless until
    // someone says whose armor.
    const r = gateSchema(
      defFile([
        defensive({
          kind: 'resistance-grant',
          grantedStat: 'armor',
          ratios: [{ stat: 'armor', scaling: 'linear', from: 15, to: 15 }],
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/requires an 'owner'/);
  });
});
