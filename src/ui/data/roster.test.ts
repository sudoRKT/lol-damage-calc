// The roster and the art URLs, checked against the REAL published data files rather than
// against a fixture written to agree with them.
//
// WHY IT READS THE REAL FILES. The art bases are the one thing in this area that has to agree
// with another area's output: the data pipeline records the three Data Dragon bases in every
// abilities file it writes, and this area rebuilds those URLs itself. Two hand-written strings
// that must match is exactly the arrangement that silently drifts a patch later, so the test
// reads the pipeline's own file and compares. If the pipeline moves to a new CDN path, this
// fails on the next run instead of the picker quietly showing 173 broken images.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion } from '../../types';
import {
  iconUrl,
  itemIconUrl,
  loadRoster,
  passiveIconUrl,
  portraitUrl,
  spellIconUrl,
} from './roster';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (rel: string) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));

const manifest = readJson('public/data/manifest.json') as {
  patch: string;
  counts: { champions: number };
};
const roster = readJson('public/data/champions.json') as Champion[];
const luxAbilities = readJson('public/data/abilities/Lux.json') as {
  art: { spellIconBase: string; passiveIconBase: string; portraitBase: string };
};

describe('roster/published data', () => {
  it('holds every champion the manifest counts', () => {
    expect(roster.length).toBe(manifest.counts.champions);
    expect(roster.length).toBe(173);
  });

  it('every champion carries the three fields the picker needs', () => {
    const missing = roster.filter((c) => !c.apiname || !c.name || !c.icon).map((c) => c.apiname);
    expect(missing).toEqual([]);
  });

  it('every api name is unique — the picker keys its rows by it', () => {
    expect(new Set(roster.map((c) => c.apiname)).size).toBe(roster.length);
  });
});

describe('roster/art URLs agree with the pipeline’s own recorded bases', () => {
  const patch = manifest.patch;

  it('a portrait URL is the pipeline’s portrait base plus the filename', () => {
    expect(portraitUrl(patch, 'Aatrox.png')).toBe(`${luxAbilities.art.portraitBase}/Aatrox.png`);
  });

  it('a spell icon URL is the pipeline’s spell base plus the filename', () => {
    expect(spellIconUrl(patch, 'AatroxQ.png')).toBe(
      `${luxAbilities.art.spellIconBase}/AatroxQ.png`,
    );
  });

  it('a passive icon URL is the pipeline’s passive base plus the filename', () => {
    expect(passiveIconUrl(patch, 'Lux_Passive.png')).toBe(
      `${luxAbilities.art.passiveIconBase}/Lux_Passive.png`,
    );
  });

  it('every champion in the roster produces a URL under the recorded portrait base', () => {
    const wrong = roster
      .map((c) => portraitUrl(patch, c.icon))
      .filter((url) => !url.startsWith(`${luxAbilities.art.portraitBase}/`));
    expect(wrong).toEqual([]);
  });
});

describe('roster/icon kind', () => {
  // The contract records a filename and not its kind, and the canonical mock carries one of
  // each: `AatroxQ.png` is a spell, `3068.png` is Sunfire Aegis. They live in different Data
  // Dragon directories, so getting this wrong is a broken image, not a cosmetic slip.
  it('a numeric filename is an item icon', () => {
    expect(iconUrl('16.16.1', '3068.png')).toBe(itemIconUrl('16.16.1', '3068.png'));
    expect(iconUrl('16.16.1', '3068.png')).toContain('/img/item/');
  });

  it('an ability filename is a spell icon', () => {
    expect(iconUrl('16.16.1', 'AatroxQ.png')).toBe(spellIconUrl('16.16.1', 'AatroxQ.png'));
    expect(iconUrl('16.16.1', 'AatroxQ.png')).toContain('/img/spell/');
  });
});

describe('roster/loading', () => {
  const ok = (body: unknown) =>
    (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;

  it('returns the roster the file contains', async () => {
    const loaded = await loadRoster(ok(roster));
    expect(loaded.length).toBe(173);
  });

  it('throws with the status rather than resolving to an empty picker', async () => {
    const notFound = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(loadRoster(notFound)).rejects.toThrow(/404/);
  });

  it('throws on an empty roster rather than offering no champions', async () => {
    await expect(loadRoster(ok([]))).rejects.toThrow(/no champions/);
  });
});
