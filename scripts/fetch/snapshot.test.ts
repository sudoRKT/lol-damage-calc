// Tests for the stored snapshot, the /curated/ reader, and rework detection at real scale.
//
// The last block is the one worth reading: it runs the rework detector over EVERY ability
// identifier the project currently holds, against the live 173-champion roster. It is not a
// substitute for running it over the curated file — that file does not exist yet — and the test
// names say so.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Champion, Item, Rune } from '../../src/types/data.ts';
import { CURATED_DIR, loadAbilityDrafts, loadCurated } from './curated-source.ts';
import { detectRework } from './rework.ts';
import { buildSnapshot, readSnapshot, SNAPSHOT_FORMAT_VERSION, writeSnapshot } from './snapshot.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'public', 'data');

async function read<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')) as T;
}

async function liveSnapshot() {
  const champions = await read<Champion[]>('champions.json');
  const items = await read<Item[]>('items.json');
  const runeFile = await read<{ runes: Rune[] }>('runes.json');
  const manifest = await read<{ patch: string; contestedChampions: string[] }>('manifest.json');
  return buildSnapshot({
    patch: manifest.patch,
    wikiHighestChangesPatch: 'V26.15',
    fetched: '2026-08-14T00:00:00.000Z',
    sources: { championStats: 'https://wiki.leagueoflegends.com/en-us/api.php' },
    contestedChampions: manifest.contestedChampions,
    champions,
    items,
    runes: runeFile.runes,
  });
}

describe('snapshot: built from live public/data', () => {
  it('holds every champion, item and rune the product ships', async () => {
    const snapshot = await liveSnapshot();
    expect(snapshot.champions.length).toBeGreaterThan(150);
    expect(snapshot.items.length).toBeGreaterThan(150);
    expect(snapshot.runes.length).toBeGreaterThan(50);
  });

  it('records its own provenance: source, url, patch and fetch date', async () => {
    const snapshot = await liveSnapshot();
    expect(snapshot.provenance.source).toContain('Module:ChampionData/data');
    expect(snapshot.provenance.url).toContain('wiki.leagueoflegends.com/en-us');
    expect(snapshot.provenance.patch).toBe(snapshot.patch);
    expect(snapshot.provenance.fetched).toBeTruthy();
  });

  it('is byte-identical when built twice from the same input', async () => {
    const a = JSON.stringify(await liveSnapshot());
    const b = JSON.stringify(await liveSnapshot());
    expect(a).toBe(b);
  });

  it('sorts champions by apiname and items by id, whatever order they arrive in', async () => {
    const snapshot = await liveSnapshot();
    // Sorted with the same collation the snapshot uses. Plain `.sort()` compares code units,
    // which orders "KSante" before "Kaisa"; the snapshot uses English collation throughout so
    // that its ordering matches the one champions.json is already written in.
    const apinames = snapshot.champions.map((c) => c.apiname);
    expect([...apinames].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(apinames);
    const ids = snapshot.items.map((i) => i.id);
    expect([...ids].sort((x, y) => x - y)).toEqual(ids);
  });
});

describe('snapshot: reading and writing', () => {
  it('returns null when there is no stored snapshot, rather than throwing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'snapshot-'));
    expect(await readSnapshot(join(dir, 'nothing.json'))).toBeNull();
  });

  it('round-trips exactly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'snapshot-'));
    const path = join(dir, 'snapshot.json');
    const snapshot = await liveSnapshot();
    await writeSnapshot(snapshot, path);
    expect(await readSnapshot(path)).toEqual(snapshot);
  });

  it('refuses a stored snapshot written in an older format rather than diffing it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'snapshot-'));
    const path = join(dir, 'snapshot.json');
    const snapshot = await liveSnapshot();
    await writeFile(
      path,
      JSON.stringify({ ...snapshot, formatVersion: SNAPSHOT_FORMAT_VERSION - 1 }),
      'utf8',
    );
    await expect(readSnapshot(path)).rejects.toThrow(/not comparable/);
  });
});

describe('/curated/ reader', () => {
  it('reports the curated file as ABSENT with a reason, never as an empty pass', async () => {
    const load = await loadCurated(CURATED_DIR);
    // As of 2026-08-14 /curated/ holds only README.md. If this ever changes, the assertion
    // below flips and the reason text is what tells a reader which state they are in.
    if (!load.present) {
      expect(load.abilities).toEqual([]);
      expect(load.reason).toContain('has not been authored yet');
    } else {
      expect(load.abilities.length).toBeGreaterThan(0);
    }
  });

  it('names the drafts as drafts when they are used as a stand-in', async () => {
    const load = await loadAbilityDrafts();
    expect(load.reason).toContain('NOT the curated file');
  });
});

describe('rework detection at real scale (harvester drafts, NOT the curated file)', () => {
  it('compares every draft identifier against the live roster', async () => {
    const load = await loadAbilityDrafts();
    const snapshot = await liveSnapshot();
    const report = detectRework(load.abilities, snapshot.champions);

    // DEFINITION of these counts: one identity is one (champion, slot, abilityName) triple in
    // the draft files; "matched exactly" means that name appears verbatim in that champion's
    // list for that slot in Module:ChampionData/data, as captured in champions.json.
    expect(report.counts.curatedAbilities).toBeGreaterThan(500);
    expect(report.counts.matchedExactly).toBe(report.counts.curatedAbilities);
    expect(report.findings.filter((f) => f.severity === 'halt')).toEqual([]);
  });

  it('finds no suspected kit replacement against the patch the drafts were harvested from', async () => {
    const load = await loadAbilityDrafts();
    const snapshot = await liveSnapshot();
    expect(detectRework(load.abilities, snapshot.champions).suspectedReworks).toEqual([]);
  });
});
