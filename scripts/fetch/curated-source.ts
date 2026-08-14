// READING /curated/ — READ ONLY, ALWAYS.
//
// `/curated/` is the project's one irreplaceable asset (CLAUDE.md). This module opens files
// there and does nothing else: it has no write, no copy, no rename, no delete, and no code path
// that could acquire one. The directory is also filesystem read-only and hook-guarded; this
// module is written so those guards never have to fire.
//
// WHAT IT DOES WHEN THE FILE IS NOT THERE. As of 2026-08-14 `/curated/` holds a README and no
// data. That is a REPORTED STATE, not an empty result: `present: false` with the reason, so the
// pipeline can say "rework detection ran over zero curated abilities because the curated file
// has not been authored yet" instead of "no rework findings", which reads like a pass.
//
// THE STAND-IN IS NEVER AUTOMATIC. `loadAbilityDrafts` can read the harvester's drafts in
// public/data/abilities so the detector can be exercised against real data, but nothing calls
// it unless a human passes --drafts on the command line. A silent fallback would make the
// sentence "rework detection ran" true while it read a file that is not the curated file.

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AbilitySlot, CuratedFile } from '../../src/types/data.ts';
import type { CuratedAbilityIdentity } from './rework.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The top-level curated directory. Read-only, forever. */
export const CURATED_DIR = join(HERE, '..', '..', 'curated');
/** The harvester's joined drafts. NOT the curated file — see the header. */
export const ABILITY_DRAFTS_DIR = join(HERE, '..', '..', 'public', 'data', 'abilities');

export interface CuratedLoad {
  present: boolean;
  /** Plain English for the run log and the review queue when `present` is false. */
  reason: string;
  filesRead: string[];
  abilities: CuratedAbilityIdentity[];
  /** What these identities were read from — carried into the review queue for provenance. */
  origin: string;
}

const SLOTS: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];

function isSlot(value: unknown): value is AbilitySlot {
  return typeof value === 'string' && (SLOTS as string[]).includes(value);
}

function identitiesFrom(raw: unknown, file: string): CuratedAbilityIdentity[] {
  const abilities = (raw as Partial<CuratedFile>)?.abilities;
  if (!Array.isArray(abilities)) return [];
  const out: CuratedAbilityIdentity[] = [];
  for (const entry of abilities) {
    const champion = (entry as { champion?: unknown }).champion;
    const slot = (entry as { slot?: unknown }).slot;
    const abilityName = (entry as { abilityName?: unknown }).abilityName;
    if (typeof champion !== 'string' || typeof abilityName !== 'string' || !isSlot(slot)) {
      throw new Error(
        `${file}: an entry is missing champion / slot / abilityName, which are the three fields ` +
          `rework detection compares. Refusing to read it partially — an identity read in part ` +
          `is an identity that silently matches the wrong ability.`,
      );
    }
    const form = (entry as { form?: unknown }).form;
    const sourceRevision = (entry as { sourceRevision?: unknown }).sourceRevision;
    out.push({
      champion,
      slot,
      abilityName,
      ...(typeof form === 'string' ? { form } : {}),
      ...(typeof sourceRevision === 'number' ? { sourceRevision } : {}),
    });
  }
  return out;
}

async function jsonFilesIn(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith('.json')).sort();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Read the curated file(s). Never writes. */
export async function loadCurated(dir: string = CURATED_DIR): Promise<CuratedLoad> {
  let exists = true;
  try {
    await stat(dir);
  } catch {
    exists = false;
  }
  if (!exists) {
    return {
      present: false,
      reason: `no curated directory at ${dir}`,
      filesRead: [],
      abilities: [],
      origin: dir,
    };
  }

  const files = await jsonFilesIn(dir);
  if (files.length === 0) {
    return {
      present: false,
      // Deliberately relative: this string is copied into the review queue, which is meant to
      // be read in a pull request, where an absolute path from one machine is noise.
      reason:
        `curated/ holds no .json file — the curated override file has not been authored yet ` +
        `(it currently holds only README.md).`,
      filesRead: [],
      abilities: [],
      origin: 'curated/',
    };
  }

  const abilities: CuratedAbilityIdentity[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), 'utf8');
    abilities.push(...identitiesFrom(JSON.parse(text), file));
  }
  return {
    present: true,
    reason: `${abilities.length} curated ability identities from ${files.length} file(s)`,
    filesRead: files,
    abilities,
    origin: dir,
  };
}

/**
 * Read the harvester's per-champion drafts as a STAND-IN for the curated file.
 *
 * These are drafts, not curated data — every entry states its own verification status and the
 * files say so in their own provenance block. Loading them proves the detector works against
 * real identifiers at real scale. Nothing calls this without an explicit flag.
 */
export async function loadAbilityDrafts(dir: string = ABILITY_DRAFTS_DIR): Promise<CuratedLoad> {
  const files = await jsonFilesIn(dir);
  if (files.length === 0) {
    return {
      present: false,
      reason: `no draft ability files in ${dir}`,
      filesRead: [],
      abilities: [],
      origin: dir,
    };
  }
  const abilities: CuratedAbilityIdentity[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), 'utf8');
    abilities.push(...identitiesFrom(JSON.parse(text), file));
  }
  return {
    present: true,
    reason:
      `${abilities.length} ability identities from ${files.length} HARVESTER DRAFT files — ` +
      `these are NOT the curated file`,
    filesRead: files,
    abilities,
    origin: dir,
  };
}
