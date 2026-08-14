// THE STORED PREVIOUS VERSION — the thing the patch pipeline diffs against (SPECIFICATION §9).
//
// WHERE IT LIVES AND WHY: `scripts/fetch/state/snapshot.json`, NOT `public/data/`.
//
// `public/data/` is copied verbatim into `dist/` and served to every visitor. A second copy
// of the champion and item numbers, reachable by URL and a patch behind BY DESIGN, is exactly
// the kind of file that gets fetched by mistake — and a stale number that looks like a live
// one is the failure this project exists to prevent. The snapshot is the pipeline's memory,
// not the site's data, so it lives beside the pipeline. It is still version controlled, which
// is what §9 needs ("every data state is recoverable through version history"): the snapshot
// moving in a commit IS the record of what a patch changed.
//
// WHAT IT HOLDS: only the fields the diff and the bounds actually compare, normalised and
// sorted so that two runs over identical sources produce byte-identical files. Provenance and
// fetch timestamps are held once at the top rather than repeated per entity, because a
// timestamp repeated 173 times would make every run a diff even when nothing changed.
//
// Everything above `readSnapshot`/`writeSnapshot` is pure — no network, no filesystem — so the
// diff and the bounds can be tested without either.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AbilitySlot,
  Champion,
  ChampionBaseStats,
  Item,
  Provenance,
  Rune,
} from '../../src/types/data.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The pipeline's own state directory. Never served — see the header. */
export const STATE_DIR = join(HERE, 'state');
export const SNAPSHOT_PATH = join(STATE_DIR, 'snapshot.json');

/** Bumped when the snapshot shape changes in a way that makes an old file uncomparable. */
export const SNAPSHOT_FORMAT_VERSION = 1;

export interface SnapshotChampion {
  apiname: string;
  name: string;
  id: number;
  resource: string | null;
  stats: ChampionBaseStats;
  /** Ability names per slot, in source order — the identity rework detection compares. */
  abilityNames: Partial<Record<AbilitySlot, string[]>>;
  abilityMaxRanks: Partial<Record<AbilitySlot, number>>;
}

export interface SnapshotItem {
  id: number;
  name: string;
  goldTotal: number;
  purchasable: boolean;
  stats: Record<string, number>;
}

export interface SnapshotRune {
  id: number;
  key: string;
  name: string;
  tree: string;
  slot: number;
}

export interface Snapshot {
  formatVersion: number;
  /** The user-facing patch, from versions.json — never the realm file's `rune` field
   *  (DATA-SOURCES §8). */
  patch: string;
  /** The wiki module's own highest `changes` marker, e.g. "V26.15". Records how far behind
   *  the hand-updated module was when this snapshot was taken (DATA-SOURCES §3). */
  wikiHighestChangesPatch: string | null;
  provenance: Provenance;
  sources: Record<string, string>;
  /** Apinames whose base stats Riot's own sources disagree about (DATA-SOURCES §15). */
  contestedChampions: string[];
  champions: SnapshotChampion[];
  items: SnapshotItem[];
  runes: SnapshotRune[];
}

function sortedNumberRecord(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) out[key] = input[key]!;
  return out;
}

/**
 * Shape the pipeline's live output into the snapshot. Pure and order-stable: entities are
 * sorted by their stable identifier (apiname / id), and every object's keys are written in a
 * fixed order, so a re-run with unchanged sources produces an unchanged file.
 */
export function buildSnapshot(input: {
  patch: string;
  wikiHighestChangesPatch: string | null;
  fetched: string;
  sources: Record<string, string>;
  contestedChampions: string[];
  champions: Champion[];
  items: Item[];
  runes: Rune[];
}): Snapshot {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    patch: input.patch,
    wikiHighestChangesPatch: input.wikiHighestChangesPatch,
    provenance: {
      source:
        'League of Legends Wiki — Module:ChampionData/data (champion stats); ' +
        'Riot Data Dragon (items, runes, roster gate, patch number)',
      url: input.sources['championStats'],
      patch: input.patch,
      fetched: input.fetched,
    },
    sources: sortedNumberRecordOfStrings(input.sources),
    contestedChampions: [...input.contestedChampions].sort(),
    champions: [...input.champions]
      .sort((a, b) => a.apiname.localeCompare(b.apiname, 'en'))
      .map((champion) => ({
        apiname: champion.apiname,
        name: champion.name,
        id: champion.id,
        resource: champion.resource ?? null,
        stats: { ...champion.stats },
        abilityNames: sortSlots(champion.abilityNames),
        abilityMaxRanks: sortSlots(champion.abilityMaxRanks),
      })),
    items: [...input.items]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        goldTotal: item.gold.total,
        purchasable: item.gold.purchasable,
        stats: sortedNumberRecord(item.stats),
      })),
    runes: [...input.runes]
      .sort((a, b) => a.id - b.id)
      .map((rune) => ({
        id: rune.id,
        key: rune.key,
        name: rune.name,
        tree: rune.tree,
        slot: rune.slot,
      })),
  };
}

function sortedNumberRecordOfStrings(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(input).sort()) out[key] = input[key]!;
  return out;
}

const SLOT_ORDER: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];

function sortSlots<T>(input: Partial<Record<AbilitySlot, T>>): Partial<Record<AbilitySlot, T>> {
  const out: Partial<Record<AbilitySlot, T>> = {};
  for (const slot of SLOT_ORDER) {
    const value = input[slot];
    if (value !== undefined) out[slot] = value;
  }
  return out;
}

/** Read the stored previous snapshot. Returns null when there is none — the first run. */
export async function readSnapshot(path: string = SNAPSHOT_PATH): Promise<Snapshot | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const parsed = JSON.parse(text) as Snapshot;
  if (parsed.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw new Error(
      `stored snapshot at ${path} is format version ${parsed.formatVersion}, this pipeline ` +
        `writes version ${SNAPSHOT_FORMAT_VERSION}. The two are not comparable, so the diff ` +
        `would be meaningless. Delete the stored snapshot to re-baseline deliberately.`,
    );
  }
  return parsed;
}

export async function writeSnapshot(
  snapshot: Snapshot,
  path: string = SNAPSHOT_PATH,
): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  const text = JSON.stringify(snapshot, null, 2) + '\n';
  await writeFile(path, text, 'utf8');
  return Buffer.byteLength(text);
}
