/**
 * THE RANK-VARYING HIT COUNT SWEEP, CHECKED (2026-08-16).
 *
 * These tests exist to stop three specific failures, each of which has happened on this project:
 *
 *   1. A DETECTOR THAT DOES NOT FIND WHAT IT IS CALIBRATED ON. Two members are known before the
 *      sweep runs. If the sweep misses either, its output is meaningless and reporting a count
 *      from it would be a measurement of nothing.
 *   2. A SIGNAL THAT REPORTS ZERO WITHOUT HAVING LOOKED. Signal 8 measured 0 fires against a
 *      denominator of 0 rows in its first version — a name claiming a finding where nothing was
 *      examined. A signal's denominator is asserted, not just its numerator.
 *   3. A CANDIDATE NOBODY READ. Every key the sweep proposes must appear in the read table or in
 *      the rejection table. Silence is not a verdict.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadPages,
  sweep,
  signal8,
  templates,
  splitArgs,
  RANK_COUNT_READS,
  RANK_COUNT_REJECTED,
  RANK_VARYING_MEMBERS,
  type CachedPage,
} from './rank-varying-count.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '..', '..', 'build/proposed-curated/ability-wikitext.json');

let pagesCache: CachedPage[] | null = null;
async function pages() {
  if (!pagesCache) pagesCache = await loadPages();
  return pagesCache;
}

describe('the sweep finds what it is calibrated on', () => {
  it('proposes Aurelion Sol Q — the prose shape', async () => {
    const keys = sweep(await pages()).map((c) => c.key);
    expect(keys).toContain('Aurelion Sol/Q/Breath of Light');
  });

  it('proposes Miss Fortune R — the leveling-row shape', async () => {
    const keys = sweep(await pages()).map((c) => c.key);
    expect(keys).toContain('Miss Fortune/R/Bullet Time');
  });

  it('reaches the two known members by DIFFERENT signals, which is why one signal is not enough', async () => {
    const cands = new Map(sweep(await pages()).map((c) => [c.key, c]));
    const asol = new Set(cands.get('Aurelion Sol/Q/Breath of Light')!.signals);
    const mf = new Set(cands.get('Miss Fortune/R/Bullet Time')!.signals);
    const shared = [...asol].filter((s) => mf.has(s));
    expect(shared).toEqual([]);
  });
});

describe('every candidate has a verdict a person wrote', () => {
  it('leaves no candidate unread', async () => {
    const keys = sweep(await pages()).map((c) => c.key);
    const read = new Set(RANK_COUNT_READS.map((r) => r.key));
    const rejected = new Set(Object.keys(RANK_COUNT_REJECTED));
    const unaccounted = keys.filter((k) => !read.has(k) && !rejected.has(k));
    expect(unaccounted).toEqual([]);
  });

  it('carries no verdict for a page the sweep does not propose', async () => {
    const keys = new Set(sweep(await pages()).map((c) => c.key));
    const stale = [...RANK_COUNT_READS.map((r) => r.key), ...Object.keys(RANK_COUNT_REJECTED)].filter(
      (k) => !keys.has(k),
    );
    expect(stale).toEqual([]);
  });
});

describe('every quoted sentence is literally in the cached source', () => {
  it('finds each `verbatim` as a substring of its own page', async () => {
    const raw = await readFile(CACHE, 'utf8');
    const all = JSON.parse(raw) as { pages: CachedPage[] };
    const byKey = new Map(
      all.pages.map((p) => [`${p.champion}/${p.slot}/${p.abilityName}`, p.wikitext]),
    );
    const missing: string[] = [];
    for (const r of RANK_COUNT_READS) {
      const w = byKey.get(r.key);
      if (!w || !w.includes(r.verbatim)) missing.push(`${r.key} :: ${r.verbatim.slice(0, 60)}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('the confirmed population', () => {
  it('is five, and contains both known members', () => {
    expect(RANK_VARYING_MEMBERS).toEqual([
      'Aurelion Sol/Q/Breath of Light',
      'Miss Fortune/R/Bullet Time',
      'Mel/Q/Radiant Volley',
      'Akshan/R/Comeuppance',
      'Xerath/R/Rite of the Arcane',
    ]);
  });

  it('gives every member a count for every rank of its own slot', () => {
    const maxRankOf = (key: string) => (key.split('/')[1] === 'R' ? 3 : 5);
    for (const r of RANK_COUNT_READS.filter((x) => x.verdict === 'member')) {
      expect(r.countByRank, r.key).toBeDefined();
      expect(r.countByRank!.length, r.key).toBe(maxRankOf(r.key));
      expect(new Set(r.countByRank!).size, `${r.key} must actually VARY`).toBeGreaterThan(1);
    }
  });

  it('states, for every member, what else blocks the entry', () => {
    for (const r of RANK_COUNT_READS.filter((x) => x.verdict === 'member')) {
      expect(r.alsoBlockedBy, r.key).toBeTruthy();
    }
  });

  it('keeps Ashe W OUT, because its own next sentence says one champion takes one arrow', () => {
    const ashe = RANK_COUNT_READS.find((r) => r.key === 'Ashe/W/Volley')!;
    expect(ashe.verdict).toBe('count-but-not-same-target');
    expect(RANK_VARYING_MEMBERS).not.toContain('Ashe/W/Volley');
  });
});

describe('signal 8 has actually looked', () => {
  /**
   * A SIGNAL THAT REPORTS ZERO AGAINST AN EMPTY DENOMINATOR HAS NOT MEASURED ANYTHING. Signal 8's
   * first version required a whole leveling value to BE a rank progression; a total row almost
   * always carries `{{as|(+ 60% AD)}}` behind its base, so it matched 0 rows in 937 pages and
   * reported a clean zero. This asserts the denominator is non-empty before its zero means
   * anything.
   */
  it('examines a non-empty population of per-instance/total pairs', async () => {
    const LEADING = /^\s*\{\{ap\|\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*(?:\|[^{}]*)?\}\}/i;
    let pairs = 0;
    for (const p of await pages()) {
      for (const st of templates(p.wikitext, 'st')) {
        const args = splitArgs(st).slice(1);
        const rows: { label: string; lo: number; hi: number }[] = [];
        for (let i = 0; i + 1 < args.length; i += 2) {
          const m = LEADING.exec(args[i + 1] ?? '');
          if (m) rows.push({ label: args[i].trim(), lo: +m[1], hi: +m[2] });
        }
        const per = rows.filter((r) => !/total|maximum/i.test(r.label));
        const tot = rows.filter((r) => /total|maximum/i.test(r.label));
        pairs += per.length * tot.length;
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('fires when a printed total is a different whole multiple at each end', () => {
    const synthetic = '{{st|Physical Damage per Wave|{{ap|20 to 40}}|Total Physical Damage|{{ap|280 to 720}}}}';
    expect(signal8(synthetic).length).toBe(1);
  });

  it('stays silent when the multiple is the same at both ends', () => {
    const synthetic = '{{st|Magic Damage per Tick|{{ap|10 to 30}}|Total Magic Damage|{{ap|40 to 120}}}}';
    expect(signal8(synthetic)).toEqual([]);
  });
});

describe('the arithmetic behind each member, recomputed rather than asserted', () => {
  /** The wiki's `{{ap|A to B}}` interpolates evaluated endpoints across the ability's ranks. */
  const series = (from: number, to: number, ranks: number) =>
    Array.from({ length: ranks }, (_, i) => from + ((to - from) * i) / (ranks - 1));

  it('Mel Q reconciles exactly at all five ranks', () => {
    const initial = series(60, 160, 5);
    const reduced = series(5, 13, 5);
    const bolts = series(6, 10, 5);
    const stated = [85, 127, 173, 223, 277]; // the page's own per-rank total row
    for (let r = 0; r < 5; r++) {
      expect(initial[r] + reduced[r] * (bolts[r] - 1)).toBe(stated[r]);
    }
  });

  it('Akshan R reconciles exactly at all three ranks', () => {
    const perBullet = series(25, 45, 3);
    const bullets = series(5, 7, 3);
    const stated = [125, 210, 315];
    for (let r = 0; r < 3; r++) expect(perBullet[r] * bullets[r]).toBe(stated[r]);
  });

  it('Xerath R reconciles exactly at all three ranks', () => {
    const perMissile = series(170, 270, 3);
    const missiles = series(4, 6, 3);
    const stated = [680, 1100, 1620];
    for (let r = 0; r < 3; r++) expect(perMissile[r] * missiles[r]).toBe(stated[r]);
  });

  /**
   * THE ONE MEMBER THAT DOES NOT RECONCILE AT EVERY RANK, and the reason is the wiki's display
   * template rather than a disagreement about the game. `{{ap|20*14 to 40*18}}` interpolates 280
   * and 720, which is 500 at rank 2, while per-wave x waves is 30 x 16 = 480. A product of two
   * linear series is quadratic and the template cannot hold it.
   *
   * This is asserted rather than fixed because gate 7 compares RANK 1 ONLY, so a rank-axis count
   * would let this entry through with the rank-2 disagreement unreported.
   */
  it('Miss Fortune R reconciles at ranks 1 and 3 and NOT at rank 2', () => {
    const perWave = series(20, 40, 3);
    const waves = series(14, 18, 3);
    const statedTotalRow = series(280, 720, 3);
    expect(perWave[0] * waves[0]).toBe(statedTotalRow[0]);
    expect(perWave[2] * waves[2]).toBe(statedTotalRow[2]);
    expect(perWave[1] * waves[1]).toBe(480);
    expect(statedTotalRow[1]).toBe(500);
    expect(perWave[1] * waves[1]).not.toBe(statedTotalRow[1]);
  });

  it('Aurelion Sol Q understates rank 5 by a factor of 49 if the ranks-1-4 count is stored', () => {
    const asol = RANK_COUNT_READS.find((r) => r.key === 'Aurelion Sol/Q/Breath of Light')!;
    const [rank1, , , , rank5] = asol.countByRank!;
    expect(3.25 / 0.125).toBe(rank1);
    expect(160 / 0.125).toBe(rank5);
    expect(Math.round(rank5 / rank1)).toBe(49);
  });
});
