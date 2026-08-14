// BOOTSTRAP THE STORED SNAPSHOT FROM WHAT IS ALREADY PUBLISHED.
//
// Run with:  node scripts/fetch/snapshot-from-published.ts
//
// The patch pipeline diffs a fresh fetch against a stored snapshot. On the very first run there
// is no snapshot, so nothing can be judged as a MOVEMENT — only the envelope bounds run. This
// script creates that first baseline from `public/data`, which is the correct starting point:
// the snapshot is supposed to answer "what does the product currently ship?", and public/data
// is the answer to that question.
//
// It fetches nothing and it writes exactly one file, `scripts/fetch/state/snapshot.json`. It
// does not touch public/data, and it does not touch /curated/.
//
// After this, `node scripts/fetch/patch-pipeline.ts --dry-run` compares the live wiki and Data
// Dragon against what is shipped, which is the comparison a patch update actually needs.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Champion, Item, Rune } from '../../src/types/data.ts';
import { buildSnapshot, SNAPSHOT_PATH, writeSnapshot } from './snapshot.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'public', 'data');

async function read<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')) as T;
}

export async function baselineFromPublished(): Promise<void> {
  const manifest = await read<{
    patch: string;
    fetched: string;
    contestedChampions: string[];
    sources: Record<string, string>;
    wikiHighestChangesPatch: string | null;
  }>('manifest.json');
  const champions = await read<Champion[]>('champions.json');
  const items = await read<Item[]>('items.json');
  const runeFile = await read<{ runes: Rune[] }>('runes.json');

  const snapshot = buildSnapshot({
    patch: manifest.patch,
    wikiHighestChangesPatch: manifest.wikiHighestChangesPatch ?? null,
    fetched: manifest.fetched,
    sources: manifest.sources ?? {},
    contestedChampions: manifest.contestedChampions ?? [],
    champions,
    items,
    runes: runeFile.runes,
  });

  const bytes = await writeSnapshot(snapshot);
  console.log(
    `baseline written from public/data: patch ${snapshot.patch}, ` +
      `${snapshot.champions.length} champions, ${snapshot.items.length} items, ` +
      `${snapshot.runes.length} runes (${bytes} bytes) -> ${SNAPSHOT_PATH}`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  baselineFromPublished().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
