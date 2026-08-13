// Champion search, tested against the REAL 173-champion roster.
//
// Not against a five-champion fixture. The whole difficulty of this rule is the roster's own
// punctuation — Kai'Sa, Cho'Gath, Dr. Mundo, Nunu & Willump, Wukong's api name MonkeyKing — and
// a fixture is a list of the cases somebody already thought of. The population is stated in
// each test so a pass means something: 173 champions, every query below run against all of them.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion } from '../../types';
import { filterChampions, initials, normalize } from './filter';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROSTER = JSON.parse(
  readFileSync(join(REPO, 'public/data/champions.json'), 'utf8'),
) as Champion[];

const names = (query: string) => filterChampions(ROSTER, query).map((c) => c.name);
const first = (query: string) => names(query)[0];

describe('search/normalisation', () => {
  it('strips the punctuation a player never types', () => {
    expect(normalize("Kai'Sa")).toBe('kaisa');
    expect(normalize('Dr. Mundo')).toBe('drmundo');
    expect(normalize('Nunu & Willump')).toBe('nunuwillump');
    expect(normalize('LeBlanc')).toBe('leblanc');
  });

  it('takes initials from multi-word names only', () => {
    const mf = ROSTER.find((c) => c.name === 'Miss Fortune')!;
    const garen = ROSTER.find((c) => c.name === 'Garen')!;
    expect(initials(mf)).toBe('mf');
    expect(initials(garen)).toBe('g');
  });
});

describe('search/finding a champion over the whole roster', () => {
  it('an empty query offers the entire roster, alphabetically, never a truncated list', () => {
    const all = names('');
    expect(all.length).toBe(173);
    expect([...all].sort((a, b) => a.localeCompare(b))).toEqual(all);
  });

  it('an apostrophe never hides a champion — every one of the eight is found without it', () => {
    // Bel'Veth, Cho'Gath, K'Sante, Kai'Sa, Kha'Zix, Kog'Maw, Rek'Sai, Vel'Koz.
    const apostrophed = ROSTER.filter((c) => c.name.includes('’') || c.name.includes("'"));
    expect(apostrophed.length).toBeGreaterThan(0);
    const missed = apostrophed.filter((c) => !names(normalize(c.name)).includes(c.name));
    expect(missed).toEqual([]);
  });

  it('EVERY champion is findable by typing its own name exactly', () => {
    // The strongest form of the search claim: 173 queries, one per champion, each of which must
    // return that champion first.
    const wrong = ROSTER.filter((c) => first(c.name) !== c.name).map((c) => c.name);
    expect(wrong).toEqual([]);
  });

  it('EVERY champion is findable by its api name too', () => {
    const wrong = ROSTER.filter((c) => !names(c.apiname).includes(c.name)).map((c) => c.apiname);
    expect(wrong).toEqual([]);
  });

  it('a prefix ranks the champion it starts first', () => {
    expect(first('gar')).toBe('Garen');
    expect(first('luc')).toBe('Lucian');
    expect(first('kai')).toBe("Kai'Sa");
  });

  it('a second word finds the champion — "sin" finds Lee Sin, "fortune" finds Miss Fortune', () => {
    expect(names('sin')).toContain('Lee Sin');
    expect(names('fortune')).toContain('Miss Fortune');
    expect(names('willump')).toContain('Nunu & Willump');
  });

  it('initials find a two-word champion — "mf" is Miss Fortune, "tk" is Tahm Kench', () => {
    expect(names('mf')).toContain('Miss Fortune');
    expect(names('tk')).toContain('Tahm Kench');
  });

  it('the api name a URL shows finds the champion — "monkey" is Wukong', () => {
    expect(names('monkey')).toContain('Wukong');
  });

  it('a query that matches nothing returns nothing rather than the whole roster', () => {
    expect(names('zzzzzz')).toEqual([]);
  });

  it('is deterministic — the same query twice gives the same order', () => {
    expect(names('ka')).toEqual(names('ka'));
  });
});
