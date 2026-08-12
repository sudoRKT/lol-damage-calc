// Known-answer tests for the curated-file validator.
//
// The cases are drawn from real templates fetched on 2026-08-12. The Aatrox and Darius cases
// are the ones that matter: they are the shapes that would otherwise ship a silently wrong
// number, and they are why gate 3 exists at all.

import { describe, expect, it } from 'vitest';

import type { AbilityComponent, CuratedAbility, CuratedFile, Provenance } from './data.ts';
import {
  compareExpansion,
  gateNonChampion,
  gateSchema,
  gateStatusHonesty,
  gateSumGuard,
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
