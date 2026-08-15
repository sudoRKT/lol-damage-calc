// Runner for the cache-drift measurement. See cache-drift.ts for what it measures and why.
//
// Run with:  npx tsx scripts/fetch/cache-drift-run.ts
//
// IT WRITES ONE FILE: scripts/fetch/state/cache-drift.json. It does NOT refresh the cache — the
// cache lives in build/proposed-curated/, which belongs to the harvest area.
//
// IT STOPS RATHER THAN MEASURING if the live patch has moved past the one the cache is pinned to.
// Every stored figure in this project is stated against a patch; drift within a patch and drift
// across one are different findings and must not be conflated.

import type { AbilitySlot } from '../../src/types/data.ts';
import { PER_TICK_READS } from '../extract/per-tick-read.ts';
import { READ_POPULATION } from '../extract/aggregate-rows.ts';
import { draftFromTemplate } from '../extract/harvest.ts';
import {
  type DriftReport,
  type ExtractionImpact,
  type ReadingImpact,
  extractionSignature,
  buildDriftRows,
  checkVerbatimSurvival,
  crossReferenceReadings,
  diffWikitext,
  fetchLivePatch,
  fetchLiveRevisions,
  fetchLiveWikitext,
  isPatchBoundaryCrossed,
  measureExtractionSensitivity,
  probeWikiPatchNotes,
  readCacheView,
  summariseDrift,
  writeReport,
} from './cache-drift.ts';

const PINNED_PATCH = '16.16.1';
const PATCH_NOTES_PROBE = ['V26.16', 'V26.17', 'V26.18'];

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
const progress = (label: string) => (done: number, total: number) => {
  process.stderr.write(`\r  ${label} ${done}/${total}`);
};

const cache = await readCacheView();
log(`cache fetched on ${cache.fetchedOn}: ${cache.distinctPages} distinct pages`);

// ---- GATE: the patch boundary --------------------------------------------------------------
const livePatch = await fetchLivePatch();
const wikiPatchNotes = await probeWikiPatchNotes(PATCH_NOTES_PROBE);
const crossed = isPatchBoundaryCrossed(PINNED_PATCH, livePatch);
log(`patch pinned ${PINNED_PATCH}; Data Dragon newest ${livePatch}`);
for (const n of wikiPatchNotes) log(`  wiki patch-notes ${n.title}: ${n.exists ? 'EXISTS' : 'absent'}`);
if (crossed) {
  log('');
  log('!!! PATCH BOUNDARY CROSSED. Stopping before any measurement or refresh.');
  log(`!!! The cache and every stored figure are stated against ${PINNED_PATCH}.`);
  log(`!!! The live game is on ${livePatch}. A refresh here is a patch migration, not a top-up.`);
  process.exit(2);
}
log('patch boundary intact — measuring drift within the pinned patch.');

// ---- PASS 1: revision ids only --------------------------------------------------------------
const titles = cache.pages.map((p) => p.resolved);
const distinctTitles = new Set(titles);
if (distinctTitles.size !== titles.length) {
  log(`NOTE: ${titles.length - distinctTitles.size} cached pages share a resolved title.`);
}
log(`pass 1: asking the wiki for revision ids of ${titles.length} titles`);
const pass1 = await fetchLiveRevisions(titles, fetch, progress('pass 1'));
process.stderr.write('\n');

const rows = buildDriftRows(cache.pages, pass1.live);
const summary = summariseDrift(rows);
log(
  `pass 1 result: ${summary.unchanged} unchanged, ${summary.moved} moved, ` +
    `${summary.vanished} vanished, of ${summary.total}`,
);
if (pass1.failedBatches.length > 0) {
  log(`!!! ${pass1.failedBatches.length} batch(es) FAILED — the measurement is incomplete.`);
}

// ---- PASS 2: what actually changed on the moved pages ---------------------------------------
const moved = rows.filter((r) => r.status === 'moved');
const byResolved = new Map(cache.pages.map((p) => [p.resolved, p]));
log(`pass 2: fetching live wikitext for the ${moved.length} moved page(s)`);
const pass2 =
  moved.length > 0
    ? await fetchLiveWikitext(
        moved.map((r) => r.resolved),
        fetch,
        progress('pass 2'),
      )
    : { text: new Map<string, string>(), failedBatches: [] as string[][] };
process.stderr.write('\n');

const movedButTextIdentical: string[] = [];
const movedWithTextChange: DriftReport['movedWithTextChange'] = [];
for (const r of moved) {
  const live = pass2.text.get(r.resolved);
  const cached = byResolved.get(r.resolved);
  if (live === undefined || cached === undefined) continue;
  const d = diffWikitext(cached.wikitext, live);
  if (d.identical) movedButTextIdentical.push(r.key);
  else
    movedWithTextChange.push({
      key: r.key,
      resolved: r.resolved,
      removed: d.removed,
      added: d.added,
    });
}
log(
  `pass 2 result: ${movedWithTextChange.length} moved page(s) whose wikitext actually differs; ` +
    `${movedButTextIdentical.length} moved but byte-identical`,
);

// ---- PASS 3: does the drift change a NUMBER, or only words? ----------------------------------
// Runs the project's own extractor over both texts. `draftFromTemplate` is imported READ-ONLY from
// the harvest area; nothing here writes to it.
log('pass 3: running the extractor over cached and live text for each moved page');
const extractionImpact: ExtractionImpact[] = [];
for (const r of moved) {
  const cached = byResolved.get(r.resolved);
  const live = pass2.text.get(r.resolved);
  if (!cached || live === undefined) {
    extractionImpact.push({
      key: r.key,
      sameEntry: false,
      changedFields: [],
      componentsBefore: 0,
      componentsAfter: 0,
      notCompared: 'live wikitext was not retrieved for this page',
      mutationsTried: 0,
      mutationsDetected: 0,
      checkIsVacuous: true,
    });
    continue;
  }
  const src = (wikitext: string) => ({
    champion: cached.champion,
    slot: cached.slot as AbilitySlot,
    ability: cached.abilityName,
    wikitext,
  });
  try {
    const before = draftFromTemplate(src(cached.wikitext), PINNED_PATCH, cache.fetchedOn).entry;
    const after = draftFromTemplate(src(live), PINNED_PATCH, cache.fetchedOn).entry;
    const changedFields: string[] = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = extractionSignature((before as unknown as Record<string, unknown>)[k]);
      const b = extractionSignature((after as unknown as Record<string, unknown>)[k]);
      if (a !== b) changedFields.push(k);
    }
    // Can this comparison see a changed number on this page AT ALL? Asked before its answer is
    // believed, so a page the extractor reads nothing from cannot silently read as "unchanged".
    const sens = measureExtractionSensitivity(
      cached.wikitext,
      (t) => draftFromTemplate(src(t), PINNED_PATCH, cache.fetchedOn).entry,
    );
    extractionImpact.push({
      key: r.key,
      sameEntry: extractionSignature(before) === extractionSignature(after),
      changedFields: changedFields.sort(),
      componentsBefore: before.components?.length ?? 0,
      componentsAfter: after.components?.length ?? 0,
      mutationsTried: sens.tried,
      mutationsDetected: sens.detected,
      checkIsVacuous: sens.detected === 0,
    });
  } catch (e) {
    extractionImpact.push({
      key: r.key,
      sameEntry: false,
      changedFields: [],
      componentsBefore: 0,
      componentsAfter: 0,
      notCompared: `the extractor threw: ${String(e)}`,
      mutationsTried: 0,
      mutationsDetected: 0,
      checkIsVacuous: true,
    });
  }
}
const extractionChanged = extractionImpact.filter((e) => !e.sameEntry);
const vacuous = extractionImpact.filter((e) => e.checkIsVacuous);
log(
  `pass 3 result: ${extractionChanged.length} of ${extractionImpact.length} moved page(s) extract ` +
    'to a DIFFERENT entry',
);
for (const e of extractionChanged) {
  log(
    `  ${e.key}: ${e.notCompared ?? `fields changed: ${e.changedFields.join(', ')}`}` +
      `  (components ${e.componentsBefore} -> ${e.componentsAfter})`,
  );
}
log(
  `pass 3 sensitivity: the comparison is DEMONSTRABLY able to see a changed number on ` +
    `${extractionImpact.length - vacuous.length} of ${extractionImpact.length} moved page(s).`,
);
for (const e of extractionImpact) {
  log(
    `  ${e.key.padEnd(38)} ${e.componentsBefore} components; ` +
      `${e.mutationsDetected}/${e.mutationsTried} single-number mutations detected` +
      (e.checkIsVacuous ? '   <<< "unchanged" PROVES NOTHING HERE' : ''),
  );
}

// ---- THE FINDING THAT MATTERS: did a page move under a reading a person made? ----------------
const perTickKeys = new Set(PER_TICK_READS.map((r) => r.key));
const aggregateKeys = new Set(READ_POPULATION.keys());
const readKeys = new Set([...perTickKeys, ...aggregateKeys]);
log(
  `read tables: ${perTickKeys.size} per-tick reads, ${aggregateKeys.size} aggregate-row reads, ` +
    `${readKeys.size} distinct keys`,
);

const affected = crossReferenceReadings(rows, readKeys);
const readingImpact: ReadingImpact[] = affected.map((r) => {
  const tables: string[] = [];
  if (perTickKeys.has(r.key)) tables.push('PER_TICK_READS');
  if (aggregateKeys.has(r.key)) tables.push('READ_POPULATION');
  const verbatim = PER_TICK_READS.filter((x) => x.key === r.key).flatMap((x) => x.verbatim);
  const live = pass2.text.get(r.resolved);
  const check =
    live === undefined
      ? { survived: [] as string[], lost: verbatim.slice() }
      : checkVerbatimSurvival(live, verbatim);
  return {
    key: r.key,
    tables,
    status: r.status,
    cachedRevid: r.cachedRevid,
    liveRevid: r.liveRevid,
    editedOn: r.editedOn,
    editComment: r.editComment,
    verbatimChecked: verbatim.length,
    verbatimSurvived: check.survived.length,
    verbatimLost: check.lost,
    readingStillRests: check.lost.length === 0,
  };
});

log('');
if (readingImpact.length === 0) {
  log('NO page carrying a stored reading has moved. Every read sentence is on a byte-current page.');
} else {
  log(`!!! ${readingImpact.length} page(s) carrying a STORED READING have moved:`);
  for (const i of readingImpact) {
    log(
      `  ${i.key}  [${i.tables.join(' + ')}]  rev ${i.cachedRevid} -> ${i.liveRevid}` +
        `  ${i.editedOn ?? ''}`,
    );
    log(
      `      verbatim sentences: ${i.verbatimSurvived}/${i.verbatimChecked} still on the live page` +
        `${i.readingStillRests ? '' : '  <<< READING NO LONGER RESTS ON THE SOURCE'}`,
    );
    for (const lost of i.verbatimLost) log(`      LOST: ${lost.slice(0, 160)}`);
  }
}

const report: DriftReport = {
  what:
    'Revision-level drift of the offline ability-wikitext cache against the live League wiki. ' +
    'Measures only; refreshes nothing. Cross-referenced against the two tables of readings a ' +
    'person made, so a page that moved under a stored conclusion is named rather than counted.',
  measuredOn: new Date().toISOString(),
  cacheFetchedOn: cache.fetchedOn,
  cacheFile: 'build/proposed-curated/ability-wikitext.json',
  sourceUrl: 'https://wiki.leagueoflegends.com/en-us/api.php',
  patch: {
    pinnedPatch: PINNED_PATCH,
    livePatch,
    samePatch: !crossed,
    wikiPatchNotes,
  },
  definition: {
    unchanged:
      "The live page's latest revision id EQUALS the cached one. MediaWiki revision ids are a " +
      'monotonic per-edit counter, so equal ids mean the cached wikitext is byte-for-byte what ' +
      'the wiki serves today.',
    moved:
      'The live latest revision id DIFFERS from the cached one. Any edit at all counts, ' +
      'including one that changes no damage number.',
    vanished: 'The wiki returned no revision for the resolved title.',
    movedButTextIdentical:
      'Moved by revision id, but the live wikitext is byte-identical to the cache — a null edit, ' +
      'a revert, or an edit to a different slot of the page.',
    readingStillRests:
      'Every `verbatim` string the reader pinned their conclusion to is still a literal substring ' +
      'of the live page. False means a person must read that ability again.',
    sameEntry:
      "The project's own extractor (`draftFromTemplate`) produces an identical entry from the " +
      'cached and the live wikitext, ignoring provenance fields. True means the page moved but no ' +
      'figure this project stores moved with it.',
  },
  summary,
  failedBatches: [...pass1.failedBatches, ...pass2.failedBatches],
  missingTitles: pass1.missing,
  moved,
  movedButTextIdentical,
  movedWithTextChange,
  readingImpact,
  extractionImpact,
};

await writeReport(report);
log('');
log('wrote scripts/fetch/state/cache-drift.json');
