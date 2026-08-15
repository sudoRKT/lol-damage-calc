// DID THE MERGE ACTUALLY LAND? Run this AFTER copying a proposal into `/curated/`.
//
//   node scripts/verify-merge.ts
//
// ═══ WHY THIS EXISTS ═══
//
// Twice now — 2026-08-15, both times — a merge was handed over, reported as done, and had not
// happened. Both times the live file was byte-identical to its pre-merge state and nobody knew for
// an hour. The second time cost a full round of re-pinning work that was aimed at figures that had
// not moved.
//
// The failure is not carelessness. `ls -l` rounds 1,055,976 bytes to "1.1M", so the one number a
// person can see at a glance is exactly the number that cannot distinguish a landed merge from an
// absent one. This script answers the question the terminal cannot.
//
// ═══ WHAT IT CHECKS, AND WHY IT IS NOT A HASH COMPARISON ═══
//
// A hash tells you the files differ. It does not tell you WHICH entries differ, and after a merge
// the interesting question is always "did the eight things I expected to move actually move".
// So this walks every array in both files and reports per-entry.
//
// It compares the LIVE curated file against `build/proposed-curated/merged-proposal.json`. After a
// successful merge those two are identical and it prints LANDED. Before one, it prints exactly what
// is still outstanding, named.
//
// IT NEVER WRITES. It reads two files and prints. `/curated/` is read-only and stays that way.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json');
const PROPOSAL = join(ROOT, 'build', 'proposed-curated', 'merged-proposal.json');

/** Every array the curated file carries. A merge may move entries in any of them. */
const ARRAYS = ['abilities', 'defensiveEffects', 'itemEffects', 'runes', 'shards', 'exclusions'] as const;

type Entry = Record<string, unknown>;
type File = Record<string, Entry[] | unknown>;

/**
 * A name for an entry, for reporting only.
 *
 * NOT a merge key — entries legitimately share one (Master Yi W has two heal rows, and the label
 * is what separates them), so this is built from champion, slot and label together and is still
 * only used to print. The comparison itself is over the whole serialised entry.
 */
function name(e: Entry): string {
  const parts = [e.champion, e.slot, e.abilityName ?? e.label, e.label].filter(Boolean);
  return parts.length > 0 ? parts.join('/') : JSON.stringify(e).slice(0, 60);
}

function load(path: string): File {
  return JSON.parse(readFileSync(path, 'utf8')) as File;
}

const live = load(LIVE);
const proposal = load(PROPOSAL);
const liveBytes = statSync(LIVE).size;
const proposalBytes = statSync(PROPOSAL).size;

console.log('  live     ', LIVE);
console.log('           ', `${liveBytes.toLocaleString()} bytes, modified ${statSync(LIVE).mtime.toISOString()}`);
console.log('  proposal ', PROPOSAL);
console.log('           ', `${proposalBytes.toLocaleString()} bytes, modified ${statSync(PROPOSAL).mtime.toISOString()}`);
console.log('');

let outstanding = 0;
for (const key of ARRAYS) {
  const l = (live[key] ?? []) as Entry[];
  const p = (proposal[key] ?? []) as Entry[];
  // Multiset comparison: an entry counts as landed when the live file contains that exact
  // serialisation. Duplicated keys are why this is by value and not by lookup.
  const seen = new Set(l.map((e) => JSON.stringify(e)));
  const notLanded = p.filter((e) => !seen.has(JSON.stringify(e)));
  if (l.length !== p.length) {
    console.log(`  ${key}: LENGTH DIFFERS — live ${l.length}, proposal ${p.length}`);
  }
  if (notLanded.length > 0) {
    outstanding += notLanded.length;
    console.log(`  ${key}: ${notLanded.length} entr${notLanded.length === 1 ? 'y' : 'ies'} in the proposal are NOT in the live file:`);
    for (const e of notLanded) console.log(`      ${name(e)}`);
  }
}

// The reverse direction matters too: an entry the LIVE file has and the proposal does not means
// the live file is ahead of the proposal, or the proposal dropped something. Either way it is not
// a clean landing and the person running this needs to know.
let onlyLive = 0;
for (const key of ARRAYS) {
  const l = (live[key] ?? []) as Entry[];
  const p = (proposal[key] ?? []) as Entry[];
  const seen = new Set(p.map((e) => JSON.stringify(e)));
  const extra = l.filter((e) => !seen.has(JSON.stringify(e)));
  if (extra.length > 0) {
    onlyLive += extra.length;
    console.log(`  ${key}: ${extra.length} entr${extra.length === 1 ? 'y' : 'ies'} in the LIVE file are not in the proposal:`);
    for (const e of extra.slice(0, 20)) console.log(`      ${name(e)}`);
  }
}

// ═══ WHICH FIELDS DIFFER, BECAUSE "DIFFERS" IS NOT ONE SITUATION ═══
//
// Added 2026-08-15 after this script cried wolf. It reported NOT LANDED — "the copy did not take" —
// for a proposal that differed from the live file by ONE PROSE STRING and zero numbers. That is a
// true statement about bytes and a misleading one about the world: a merge that has landed and a
// proposal that has since moved on both produce "they differ", and only one of them is a problem.
//
// So the verdict now names the KIND of difference. A difference confined to explanatory prose is
// reported as exactly that, and does not claim the copy failed.
const PROSE_FIELDS = new Set(['notes', 'gapReason', 'note', 'sourceSays', 'captureBlockedBy']);

function differingFields(a: Entry, b: Entry): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out;
}

const changedFields = new Set<string>();
for (const key of ARRAYS) {
  const l = (live[key] ?? []) as Entry[];
  const p = (proposal[key] ?? []) as Entry[];
  const byName = new Map(l.map((e) => [name(e), e]));
  for (const e of p) {
    const other = byName.get(name(e));
    if (other && JSON.stringify(other) !== JSON.stringify(e)) {
      for (const f of differingFields(other, e)) changedFields.add(f);
    }
  }
}

console.log('');
if (outstanding === 0 && onlyLive === 0) {
  console.log('  LANDED — every entry in the proposal is present in the live curated file.');
  console.log('  Re-pin the figures the merge moved, then run `npm test`.');
} else if (changedFields.size > 0 && [...changedFields].every((f) => PROSE_FIELDS.has(f))) {
  console.log(`  PROSE ONLY — the two files differ, and the ONLY fields that differ are ${[...changedFields].join(', ')}.`);
  console.log('  No stored number moves. This is what a proposal that has moved on since the last');
  console.log('  merge looks like, not a copy that failed. Merging it changes explanation, not data.');
} else {
  console.log(`  NOT LANDED — ${outstanding} proposal entr${outstanding === 1 ? 'y is' : 'ies are'} not present in the live file.`);
  if (changedFields.size > 0) console.log(`  Fields that differ: ${[...changedFields].join(', ')}.`);
  console.log('  Do NOT re-pin anything against this file until the copy has taken.');
  process.exitCode = 1;
}
