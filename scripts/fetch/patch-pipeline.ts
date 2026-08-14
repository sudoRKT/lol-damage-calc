// THE PATCH PIPELINE (SPECIFICATION §9), steps 1, 2, 3 and 5.
//
// Run with:  node scripts/fetch/patch-pipeline.ts [--dry-run] [--drafts] [--rebaseline]
//
// The order matters more than anything else in this file:
//
//   1. RETRIEVE   — the existing fetch (`buildPayload` in index.ts), unchanged. One fetch.
//   2. DIFF       — exact structured comparison against the stored snapshot. No model.
//   3. BOUNDS     — per-field validation. A halt stops the update; it does not annotate it.
//   4. REWORK     — curated ability identifiers against source ability names. Reads /curated/.
//   5. QUEUE      — the deterministic input to the review step. Values are never proposed.
//
// NOTHING IS WRITTEN TO public/data BEFORE THE BOUNDS HAVE RUN. A check that fires after the
// file is on disk has not halted anything; it has merely commented on it. That is why index.ts
// separates building the payload from writing it.
//
// TWO STEPS OF §9 ARE DELIBERATELY ABSENT AND MUST NOT BE ADDED HERE:
//   - the language-model reading of the patch notes. This file produces its INPUT and stops.
//   - the pull request and the scheduling. That is hosting/CI and belongs to whoever owns
//     deployment. The exit code is the only signal this file gives: 0 clean, 1 halted.
//
// FLAGS
//   --dry-run     run every gate, write the run's report files, and write NOTHING else. Safe
//                 to run at any time; this is the mode to use when checking a live patch.
//   --drafts      run rework detection against the harvester's drafts in public/data/abilities
//                 instead of /curated/, so the detector can be exercised while the curated file
//                 does not exist yet. Never the default, and always stated in the output.
//   --rebaseline  advance the stored snapshot even though bounds halted. A deliberate human
//                 act after reviewing the halts — it prints every halt it is accepting.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runBounds, type BoundVerdict } from './bounds.ts';
import { loadAbilityDrafts, loadCurated } from './curated-source.ts';
import { diffSnapshots } from './diff.ts';
import { buildPayload, writePayload } from './index.ts';
import { detectRework } from './rework.ts';
import { buildReviewQueue } from './review-queue.ts';
import { buildSnapshot, readSnapshot, STATE_DIR, writeSnapshot } from './snapshot.ts';

export const REVIEW_QUEUE_PATH = join(STATE_DIR, 'review-queue.json');
export const DIFF_PATH = join(STATE_DIR, 'last-diff.json');

function printVerdict(verdict: BoundVerdict): void {
  console.log(
    `  [${verdict.severity.toUpperCase()} ${verdict.check}] ${verdict.subject} ${verdict.field}: ` +
      `${verdict.before ?? 'absent'} -> ${verdict.after ?? 'absent'}`,
  );
  console.log(`      ${verdict.message}`);
}

export async function runPipeline(argv: string[]): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const useDrafts = argv.includes('--drafts');
  const rebaseline = argv.includes('--rebaseline');
  const generated = new Date().toISOString();

  console.log('=== 1. RETRIEVE ===');
  const payload = await buildPayload();
  const candidate = buildSnapshot({
    patch: payload.patch,
    wikiHighestChangesPatch: payload.wikiHighestChangesPatch,
    fetched: payload.fetched,
    sources: payload.sources,
    contestedChampions: payload.contestedApinames,
    champions: payload.champions,
    items: payload.items,
    runes: payload.runes,
  });

  console.log('');
  console.log('=== 2. DETERMINISTIC DIFF ===');
  const previous = await readSnapshot();
  const diff = previous ? diffSnapshots(previous, candidate) : null;
  if (!previous) {
    console.log(
      'no stored snapshot — this is the first run. There is nothing to diff against, so no ' +
        'movement can be judged. The envelope bounds still run over every value.',
    );
  } else {
    console.log(
      `patch ${diff!.patch.before} -> ${diff!.patch.after}` +
        (diff!.patch.changed ? '' : ' (unchanged)'),
    );
    console.log(
      `${diff!.counts.changedFields} field changes across ${diff!.counts.changedEntities} ` +
        `entities; ${diff!.counts.added} added, ${diff!.counts.removed} removed`,
    );
  }

  console.log('');
  console.log('=== 3. VALIDATION BOUNDS ===');
  const bounds = runBounds(previous, candidate, diff);
  console.log(
    `envelope: ${bounds.envelope.fieldsChecked} (entity, field) pairs checked against a bound, ` +
      `${bounds.envelope.verdicts.length} outside it; ${bounds.envelope.unbounded.length} pairs ` +
      `have no bound defined`,
  );
  if (bounds.envelope.tightestMargin) {
    const t = bounds.envelope.tightestMargin;
    console.log(
      `tightest published value: ${t.subject} ${t.field} = ${t.value}, sitting ` +
        `${(t.marginFraction * 100).toFixed(1)}% of the envelope width from its nearest edge`,
    );
  }
  console.log(`verdicts: ${bounds.halts.length} halt, ${bounds.reviews.length} review`);
  for (const verdict of bounds.halts) printVerdict(verdict);
  for (const verdict of bounds.reviews.slice(0, 40)) printVerdict(verdict);
  if (bounds.reviews.length > 40) {
    console.log(`  … ${bounds.reviews.length - 40} more review verdicts, all in the queue file`);
  }

  console.log('');
  console.log('=== 4. REWORK DETECTION ===');
  const curated = useDrafts ? await loadAbilityDrafts() : await loadCurated();
  console.log(`${useDrafts ? 'DRAFTS (not the curated file)' : '/curated/'}: ${curated.reason}`);
  const rework = detectRework(curated.abilities, candidate.champions);
  console.log(
    `${rework.counts.curatedAbilities} identities compared over ` +
      `${rework.counts.championsInCuratedFile} champions: ${rework.counts.matchedExactly} matched ` +
      `exactly, ${rework.counts.findings} findings`,
  );
  const byKind = new Map<string, number>();
  for (const finding of rework.findings) {
    byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  }
  for (const [kind, count] of [...byKind].sort()) console.log(`  ${kind}: ${count}`);
  if (rework.suspectedReworks.length > 0) {
    console.log(`  SUSPECTED KIT REPLACEMENT: ${rework.suspectedReworks.join(', ')}`);
  }

  console.log('');
  console.log('=== 5. REVIEW QUEUE (input only — no model runs here) ===');
  const queue = buildReviewQueue({
    candidate,
    previous,
    diff,
    verdicts: bounds.verdicts,
    rework,
    curated,
    generated,
  });
  console.log(
    `${queue.counts.total} entries: ${queue.counts.halts} halt, ${queue.counts.reviews} review`,
  );
  for (const [kind, count] of Object.entries(queue.counts.byKind).sort()) {
    console.log(`  ${kind}: ${count}`);
  }

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(REVIEW_QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n', 'utf8');
  await writeFile(
    DIFF_PATH,
    JSON.stringify(
      {
        generated,
        patch: candidate.patch,
        previousPatch: previous?.patch ?? null,
        counts: diff?.counts ?? null,
        diff,
        boundVerdicts: bounds.verdicts,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`wrote ${REVIEW_QUEUE_PATH}`);
  console.log(`wrote ${DIFF_PATH}`);

  console.log('');
  console.log('=== VERDICT ===');
  if (bounds.halts.length > 0) {
    console.log(
      `HALTED. ${bounds.halts.length} bound(s) refused this update, so public/data was NOT ` +
        `written and the stored snapshot was NOT advanced. Every halt is named above with both ` +
        `values and the bound that refused it.`,
    );
    if (rebaseline) {
      await writeSnapshot(candidate);
      console.log(
        `--rebaseline: the stored snapshot has been advanced to ${candidate.patch} ANYWAY, ` +
          `accepting all ${bounds.halts.length} halt(s) listed above. public/data was still not ` +
          `written — run the pipeline again to publish.`,
      );
    }
    return 1;
  }

  if (dryRun) {
    console.log(
      `CLEAN, and --dry-run was passed: public/data was not written and the snapshot was not ` +
        `advanced. ${queue.counts.reviews} entries still want a human.`,
    );
    return 0;
  }

  await writePayload(payload);
  const bytes = await writeSnapshot(candidate);
  console.log(
    `CLEAN. public/data updated, and the stored snapshot advanced to ${candidate.patch} ` +
      `(${bytes} bytes). ${queue.counts.reviews} queue entries want a human before this is ` +
      `published; nothing here publishes anything.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runPipeline(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    });
}
