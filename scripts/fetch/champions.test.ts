// Known-answer tests for the champion parser, the roster gate, and the wrong-wiki guard.
// No network: the Lua fixtures are hand-authored from live values, and the full-roster
// assertions read the generated public/data files.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Champion, Provenance } from '../../src/types/data.ts';
import {
  assertOfficialWiki,
  highestChangesPatch,
  joinChampions,
  parseChampionModule,
} from './champions.ts';
import {
  DATA_DRAGON_APINAMES,
  OFFICIAL_MODULE_LUA,
  STALE_FANDOM_MODULE_LUA,
} from './fixtures/champion-module.ts';

const PROVENANCE: Provenance = {
  source: 'League of Legends Wiki — Module:ChampionData/data',
  patch: '16.16.1',
  fetched: '2026-08-12T00:00:00.000Z',
};

const parsed = parseChampionModule(OFFICIAL_MODULE_LUA);
const find = (wikiName: string) => parsed.find((c) => c.wikiName === wikiName);

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');

function readGenerated<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
  } catch {
    throw new Error(
      `public/data/${file} is missing. Run the pipeline first: node scripts/fetch/index.ts`,
    );
  }
}

describe('champion-stats-from-wiki', () => {
  it('parses Aatrox exactly as the wiki module states him', () => {
    const aatrox = find('Aatrox');
    expect(aatrox?.stats).toEqual({
      hp_base: 650,
      hp_lvl: 114,
      mp_base: 0,
      mp_lvl: 0,
      arm_base: 38,
      arm_lvl: 4.8,
      mr_base: 32,
      mr_lvl: 2.05,
      ad_base: 60,
      // The whole reason champion stats come from the wiki: Data Dragon reports
      // attackdamageperlevel = 0 for every champion, including Aatrox (DATA-SOURCES §3).
      ad_lvl: 5,
      as_base: 0.651,
      as_lvl: 2.5,
      as_ratio: 0.651,
      range: 175,
      rangetype: 'Melee',
      adaptivetype: 'Physical',
    });
  });

  it('reads EVERY ability name in each skill list, not just the first', () => {
    // Taking only [1] lost 69 whole abilities across the roster (DATA-SOURCES §18).
    expect(find('Aatrox')?.abilityNames).toEqual({
      P: ['Deathbringer Stance'],
      Q: ['The Darkin Blade', 'The Darkin Blade 2'],
      W: ['Infernal Chains'],
      E: ['Umbral Dash'],
      R: ['World Ender'],
    });
  });

  it('keeps a second name that is a different ability, not a cast alias', () => {
    expect(find('Kled')?.abilityNames.Q).toEqual(['Bear Trap on a Rope', 'Pocket Pistol']);
  });

  it('evaluates a stat written as arithmetic (Kled & Skaarl hp_lvl = 84+1000/17)', () => {
    expect(find('Kled & Skaarl')?.stats.hp_lvl).toBeCloseTo(142.8235294117647, 10);
  });

  it('reproduces Aatrox identically in the generated champions.json', () => {
    const champions = readGenerated<Champion[]>('champions.json');
    const aatrox = champions.find((c) => c.apiname === 'Aatrox');
    expect(aatrox?.stats.hp_base).toBe(650);
    expect(aatrox?.stats.hp_lvl).toBe(114);
    expect(aatrox?.stats.arm_base).toBe(38);
    expect(aatrox?.stats.ad_base).toBe(60);
    expect(aatrox?.stats.ad_lvl).toBe(5);
    expect(aatrox?.abilityNames.Q?.[0]).toBe('The Darkin Blade');
  });
});

describe('roster-gated-on-datadragon', () => {
  const { champions, withheld } = joinChampions(parsed, DATA_DRAGON_APINAMES, PROVENANCE);

  it('withholds a champion that the wiki has but Data Dragon does not', () => {
    // Mega Gnar's apiname is "GnarBig"; Data Dragon ships no such entry, so there is no
    // portrait for it. It is withheld, never shown with a placeholder.
    expect(champions.some((c) => c.apiname === 'GnarBig')).toBe(false);
    expect(withheld).toContainEqual({
      wikiName: 'Mega Gnar',
      apiname: 'GnarBig',
      reason: 'no Data Dragon entry for apiname "GnarBig"',
    });
  });

  it('withholds an alternate form that reuses a Data Dragon apiname, keeping the canonical row', () => {
    const kled = champions.filter((c) => c.apiname === 'Kled');
    expect(kled).toHaveLength(1);
    expect(kled[0]!.name).toBe('Kled');
    expect(kled[0]!.id).toBe(240); // integer id wins over the 240.1 mounted form
    expect(withheld.map((w) => w.wikiName)).toContain('Kled & Skaarl');
  });

  it('joins the differing wiki name to the Data Dragon identifier via apiname', () => {
    const wukong = champions.find((c) => c.name === 'Wukong');
    expect(wukong?.apiname).toBe('MonkeyKing');
  });

  it('keeps exactly the champions Data Dragon can supply art for', () => {
    expect(champions.map((c) => c.name)).toEqual(['Aatrox', 'Kled', 'Wukong']);
    expect(withheld.map((w) => w.wikiName)).toEqual(['Kled & Skaarl', 'Mega Gnar']);
  });

  it('holds the live roster to the same rule: every champion has a Data Dragon apiname', () => {
    const champions = readGenerated<Champion[]>('champions.json');
    const manifest = readGenerated<{
      counts: { champions: number; championsWithheld: number };
      championsWithheld: { wikiName: string; apiname: string }[];
    }>('manifest.json');

    expect(champions.length).toBe(173);
    expect(manifest.counts.champions).toBe(173);
    expect(new Set(champions.map((c) => c.apiname)).size).toBe(173);
    expect(manifest.championsWithheld.map((w) => w.wikiName).sort()).toEqual([
      'Kled & Skaarl',
      'Mega Gnar',
    ]);
  });
});

describe('wrong-wiki-guard', () => {
  it('accepts the official wiki, whose newest change is V26 or later', () => {
    expect(highestChangesPatch(parsed)?.raw).toBe('V26.12');
    expect(() => assertOfficialWiki(parsed)).not.toThrow();
  });

  it('rejects the abandoned Fandom copy, which tops out around V25', () => {
    const fandom = parseChampionModule(STALE_FANDOM_MODULE_LUA);
    expect(highestChangesPatch(fandom)?.raw).toBe('V14.14');
    expect(() => assertOfficialWiki(fandom)).toThrow(/Fandom/);
  });

  it('rejects data with no patch markers at all', () => {
    const noMarkers = parseChampionModule(
      STALE_FANDOM_MODULE_LUA.replace(/\["changes"\]\s*=\s*"[^"]*",/g, ''),
    );
    expect(highestChangesPatch(noMarkers)).toBeNull();
    expect(() => assertOfficialWiki(noMarkers)).toThrow(/no champion carried a "changes"/);
  });

  it('shows the Fandom copy really is wrong, not merely old (Volibear base AD 60 vs 65)', () => {
    // DATA-SOURCES §1: Fandom says base AD 60 and base armor 31; the official wiki and
    // Data Dragon both say 65 and 35. Accepting the stale copy is not a cosmetic problem.
    const fandom = parseChampionModule(STALE_FANDOM_MODULE_LUA);
    const volibear = fandom.find((c) => c.wikiName === 'Volibear');
    expect(volibear?.stats.ad_base).toBe(60);
    expect(volibear?.stats.arm_base).toBe(31);
  });

  it('records a V26-or-later patch marker in the generated manifest', () => {
    const manifest = readGenerated<{ wikiHighestChangesPatch: string }>('manifest.json');
    const major = Number(/^V(\d+)\./.exec(manifest.wikiHighestChangesPatch)?.[1]);
    expect(major).toBeGreaterThanOrEqual(26);
  });
});
