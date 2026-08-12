// Known-answer tests for the source policy (DATA-SOURCES §3, §15).
//
// No network. Every number below was observed live on 2026-08-12 against patch 16.16.1
// and its patch-notes article V26.16, then hand-authored here. The full-pool assertions
// run against the generated public/data/overrides.json the pipeline actually wrote.
//
// The two tests the policy exists to enforce are named in full:
//   - "override-has-recorded-reason"   — an override without evidence fails the run
//   - "override-not-redundant"         — an override whose sources agree fails the run

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { WikiChampion } from './champions.ts';
import {
  assertNoRedundantOverrides,
  assertNoStructuralOverrides,
  assertOverridesDocumented,
  buildOverrides,
  type StatOverride,
} from './overrides.ts';
import { NEVER_OVERRIDABLE, parsePatchNotes, patchNotesTitle } from './patch-notes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'public', 'data');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as T;
}

/** A wiki champion with the real Ashe values as the module carried them on 2026-08-12. */
function champion(wikiName: string, apiname: string, stats: Partial<WikiChampion['stats']>): WikiChampion {
  return {
    wikiName,
    apiname,
    id: 22,
    changes: 'V26.15',
    stats: {
      hp_base: 610,
      hp_lvl: 101,
      arm_base: 26,
      arm_lvl: 4.6,
      mr_base: 30,
      mr_lvl: 1.3,
      ad_base: 59,
      ad_lvl: 3.5,
      as_base: 0.658,
      as_lvl: 3,
      as_ratio: 0.657999992370605,
      range: 600,
      rangetype: 'Ranged',
      adaptivetype: 'Physical',
      ...stats,
    },
    abilityNames: {},
  };
}

/** The real note lines from V26.16, verbatim. */
const ASHE_NOTES = `
;{{ci|Ashe}}
* Stats
** Base magic resistance increased to 33 from 30.
** Magic resistance growth reduced to {{fd|1.1}} from {{fd|1.3}}.

;{{ci|Tristana}}
* Stats
** Base magic resistance increased to 31 from 28.
** Magic resistance growth reduced to {{fd|1.1}} from {{fd|1.3}}.

;{{ci|Bel'Veth}}
* Stats
** Health growth reduced to 105 from 110.
`;

const NOTES_URL = 'https://wiki.leagueoflegends.com/en-us/V26.16';

describe('patch-notes parsing', () => {
  it('reads each stat change with the value it moved to and from', () => {
    const changes = parsePatchNotes(ASHE_NOTES);
    expect(changes).toContainEqual(
      expect.objectContaining({ championName: 'Ashe', stat: 'mr_base', to: 33, from: 30 }),
    );
    // The growth line wraps its numbers in a {{fd|…}} display template.
    expect(changes).toContainEqual(
      expect.objectContaining({ championName: 'Ashe', stat: 'mr_lvl', to: 1.1, from: 1.3 }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ championName: "Bel'Veth", stat: 'hp_lvl', to: 105, from: 110 }),
    );
  });

  it('reads a decimal that ends a sentence, without swallowing the full stop', () => {
    // Regression. The number pattern was `[\d.]+`, which captured "1.3." from "from 1.3."
    // and parsed it as NaN, so every growth line was silently dropped while every integer
    // line survived ("30." is still 30 to JavaScript). That produced 27 missing
    // confirmations and 28 spurious "contested" flags in a real run.
    const changes = parsePatchNotes(
      ';{{ci|Ashe}}\n** Magic resistance growth reduced to {{fd|1.1}} from {{fd|1.3}}.\n',
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.to).toBe(1.1);
    expect(changes[0]!.from).toBe(1.3);
  });

  it('derives the wiki article title from both sources, not a hard-coded offset', () => {
    // Data Dragon calls it 16.16.1; the wiki calls it V26.16. Minor from Data Dragon,
    // major from the wiki's own newest marker.
    expect(patchNotesTitle('16.16.1', 'V26.15')).toBe('V26.16');
    expect(patchNotesTitle('16.17.1', 'V26.16')).toBe('V26.17');
    expect(patchNotesTitle('16.16.1', null)).toBeNull();
  });
});

describe('source policy — confirmed overrides', () => {
  it('takes Data Dragon when the patch notes document the change and match it', () => {
    const { champions, overrides } = buildOverrides(
      [champion('Ashe', 'Ashe', {})],
      { Ashe: { spellblock: 33, spellblockperlevel: 1.1 } },
      parsePatchNotes(ASHE_NOTES),
      true,
      NOTES_URL,
    );

    expect(champions[0]!.stats.mr_base).toBe(33);
    expect(champions[0]!.stats.mr_lvl).toBe(1.1);
    expect(overrides).toHaveLength(2);
    for (const override of overrides) {
      expect(override.status).toBe('confirmed');
      expect(override.patchNote!.toLowerCase()).toContain('magic resistance');
      expect(override.wikiValue).not.toBe(override.dataDragonValue);
    }
  });

  it('leaves a champion alone when the two sources already agree', () => {
    const { champions, overrides } = buildOverrides(
      [champion('Ashe', 'Ashe', { mr_base: 33, mr_lvl: 1.1 })],
      { Ashe: { spellblock: 33, spellblockperlevel: 1.1 } },
      parsePatchNotes(ASHE_NOTES),
      true,
      NOTES_URL,
    );
    expect(overrides).toHaveLength(0);
    expect(champions[0]!.stats.mr_base).toBe(33);
  });

  it('applies no override to a champion the patch notes do not name — it is contested instead', () => {
    const { overrides } = buildOverrides(
      [champion('Twitch', 'Twitch', {})],
      { Twitch: { spellblock: 33, spellblockperlevel: 1.1 } },
      parsePatchNotes(ASHE_NOTES), // Twitch appears nowhere in these notes
      true,
      NOTES_URL,
    );
    expect(overrides.every((o) => o.status === 'contested')).toBe(true);
  });
});

describe('source policy — contested overrides', () => {
  it('flags Tristana, whose patch note (31) contradicts Data Dragon (33)', () => {
    const { overrides, contestedApinames } = buildOverrides(
      [champion('Tristana', 'Tristana', { mr_base: 28, mr_lvl: 1.3 })],
      { Tristana: { spellblock: 33, spellblockperlevel: 1.1 } },
      parsePatchNotes(ASHE_NOTES),
      true,
      NOTES_URL,
    );

    const base = overrides.find((o) => o.stat === 'mr_base')!;
    expect(base.status).toBe('contested');
    expect(base.reason).toContain('31');
    expect(base.reason).toContain('33');

    // Her GROWTH is not disputed — the note says 1.1 and Data Dragon says 1.1.
    expect(overrides.find((o) => o.stat === 'mr_lvl')!.status).toBe('confirmed');
    expect(contestedApinames).toEqual(['Tristana']);
  });

  it('contests everything when the wiki has not published the patch article yet', () => {
    const { overrides } = buildOverrides(
      [champion('Ashe', 'Ashe', {})],
      { Ashe: { spellblock: 33, spellblockperlevel: 1.1 } },
      [],
      false,
      NOTES_URL,
    );
    expect(overrides).toHaveLength(2);
    expect(overrides.every((o) => o.status === 'contested')).toBe(true);
  });
});

describe('alternate forms are not compared', () => {
  it('ignores a form with a fractional id that reuses the canonical apiname', () => {
    // "Kled & Skaarl" is wiki id 240.1 reusing apiname "Kled". It is withheld from the
    // roster, and Data Dragon has no record of it — so its stats must never be diffed
    // against Kled's, which would invent a contested flag out of nothing.
    const mounted: WikiChampion = {
      ...champion('Kled & Skaarl', 'Kled', { hp_base: 810 }),
      id: 240.1,
    };
    const { overrides } = buildOverrides(
      [mounted],
      { Kled: { hp: 410 } },
      [],
      true,
      NOTES_URL,
    );
    expect(overrides).toHaveLength(0);
  });
});

describe('attack-damage growth is never overridden', () => {
  it('ignores the field Data Dragon reports as 0 for every champion', () => {
    // Ashe's real growth is 3.5; Data Dragon says 0. That is a structural fault, not a
    // patch disagreement, and must never produce an override.
    const { champions, overrides } = buildOverrides(
      [champion('Ashe', 'Ashe', {})],
      { Ashe: { attackdamageperlevel: 0 } },
      [],
      true,
      NOTES_URL,
    );
    expect(overrides).toHaveLength(0);
    expect(champions[0]!.stats.ad_lvl).toBe(3.5);
    expect(NEVER_OVERRIDABLE).toContain('ad_lvl');
  });
});

describe('override-has-recorded-reason', () => {
  it('passes for every override the pipeline actually wrote', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    expect(() => assertOverridesDocumented(overrides)).not.toThrow();
    for (const override of overrides) {
      expect(override.reason.length).toBeGreaterThan(0);
      expect(override.source.length).toBeGreaterThan(0);
      expect(override.retireWhen.length).toBeGreaterThan(0);
    }
  });

  it('fails when an override carries no reason', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    const stripped = [{ ...overrides[0]!, reason: '   ' }];
    expect(() => assertOverridesDocumented(stripped)).toThrow(/no recorded reason/);
  });

  it('fails when an override carries no source', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    const stripped = [{ ...overrides[0]!, source: '' }];
    expect(() => assertOverridesDocumented(stripped)).toThrow(/no recorded source/);
  });

  it('fails when an override claims confirmation but quotes no patch note', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    const confirmed = overrides.find((o) => o.status === 'confirmed')!;
    expect(() => assertOverridesDocumented([{ ...confirmed, patchNote: null }])).toThrow(
      /quotes no note line/,
    );
  });
});

describe('override-not-redundant', () => {
  it('passes for every override the pipeline actually wrote', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    expect(() => assertNoRedundantOverrides(overrides)).not.toThrow();
    expect(() => assertNoStructuralOverrides(overrides)).not.toThrow();
  });

  it('fails when the wiki has caught up and an override is carrying a settled value', () => {
    // This is the shape a STALE override takes: both sources now read the same number, so
    // the override is doing nothing and must be retired rather than inherited.
    const overrides = readJson<StatOverride[]>('overrides.json');
    const stale: StatOverride = { ...overrides[0]!, wikiValue: 33, dataDragonValue: 33 };
    expect(() => assertNoRedundantOverrides([stale])).toThrow(/redundant/);
    expect(() => assertNoRedundantOverrides([stale])).toThrow(/must be retired/);
  });

  it('produces no override at all once the wiki module catches up', () => {
    // The self-retiring property itself: same inputs, but with the wiki updated.
    const { overrides } = buildOverrides(
      [champion('Ashe', 'Ashe', { mr_base: 33, mr_lvl: 1.1 })],
      { Ashe: { spellblock: 33, spellblockperlevel: 1.1 } },
      parsePatchNotes(ASHE_NOTES),
      true,
      NOTES_URL,
    );
    expect(overrides).toHaveLength(0);
  });
});

describe('the generated data reflects the policy', () => {
  it('Ashe reads 33 / 1.1 and Bel’Veth health growth reads 105', () => {
    const ashe = readJson<{ stats: { mr_base: number; mr_lvl: number } }>('champions/Ashe.json');
    expect(ashe.stats.mr_base).toBe(33);
    expect(ashe.stats.mr_lvl).toBe(1.1);

    const belveth = readJson<{ stats: { hp_lvl: number } }>('champions/Belveth.json');
    expect(belveth.stats.hp_lvl).toBe(105);
  });

  it('Ashe keeps the wiki attack-damage growth Data Dragon reports as 0', () => {
    const ashe = readJson<{ stats: { ad_lvl: number } }>('champions/Ashe.json');
    expect(ashe.stats.ad_lvl).toBeGreaterThan(0);
  });

  it('every contested champion is listed in the manifest so the interface can warn', () => {
    const overrides = readJson<StatOverride[]>('overrides.json');
    const manifest = readJson<{ contestedChampions: string[] }>('manifest.json');
    const contested = [...new Set(overrides.filter((o) => o.status === 'contested').map((o) => o.apiname))];
    expect(manifest.contestedChampions.sort()).toEqual(contested.sort());
  });
});
