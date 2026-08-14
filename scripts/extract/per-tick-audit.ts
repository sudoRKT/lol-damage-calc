/**
 * WRITE THE PER-TICK READING OUT SO A PERSON CAN AUDIT EVERY CALL.
 *
 * `node scripts/extract/per-tick-audit.ts` → `build/proposed-curated/per-tick-reading.json`.
 *
 * The reading itself lives in `per-tick-read.ts`. This script does three things and nothing else:
 *
 *   1. Proves every quoted sentence is a literal substring of the cached source wikitext. A
 *      classification without its sentence is not a classification, and a sentence nobody checked
 *      is not evidence.
 *   2. Proves the table describes the REAL population — the same 37 entries the merge withdraws,
 *      with the same `hits` counts the harvest actually stored. A table that has drifted from the
 *      data is worse than none, because it reads as though it were checked.
 *   3. Writes the audit, one row per entry, in the order a person would read it.
 *
 * It writes nothing into `/curated/` and changes no stored value. If any check fails it writes
 * nothing at all and exits non-zero, because a half-true audit is the failure it is guarding.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CuratedFile } from '../../src/types/data.ts';
import {
  PER_TICK_READS,
  ROOT,
  checkAgainstHarvest,
  checkMarkRule,
  loadPages,
  markedOverTime,
  verifyQuotes,
} from './per-tick-read.ts';

const HARVEST = 'build/proposed-curated/abilities/batch-01.json';
const OUT = 'build/proposed-curated/per-tick-reading.json';

async function main(): Promise<void> {
  const harvest = JSON.parse(await readFile(join(ROOT, HARVEST), 'utf8')) as CuratedFile;
  const pages = await loadPages();
  const failures: string[] = [];

  // ── 1. every quote is really in the source ──────────────────────────────────────────────
  const quoteChecks = verifyQuotes(PER_TICK_READS, pages);
  for (const c of quoteChecks) {
    if (c.pageMissing) failures.push(`${c.key}: no cached source page`);
    for (const m of c.missing) failures.push(`${c.key}: quoted sentence is not in the source: "${m}"`);
  }

  // ── 2. the table describes the real population ──────────────────────────────────────────
  failures.push(...checkAgainstHarvest(PER_TICK_READS, harvest.abilities));

  // ── 3. the mark rule ────────────────────────────────────────────────────────────────────
  failures.push(...checkMarkRule());

  if (failures.length > 0) {
    console.error(`REFUSED — ${failures.length} check(s) failed, so no audit was written:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
    return;
  }

  const by = (v: string): number => PER_TICK_READS.filter((r) => r.countVerdict === v).length;
  const audit = {
    what:
      'The 37 ability entries DATA-SOURCES §58 withdrew for carrying a per-tick damage figure, ' +
      'each read against its own source sentence. One row per entry.',
    generatedOn: new Date().toISOString().slice(0, 10),
    patch: harvest.patch,
    definition:
      'Population: ability entries with at least one component whose harvested label matches ' +
      '/per\\s*tick/i, minus the four read on 2026-08-14 (Fizz W, Teemo E, Teemo R, Nilah R). ' +
      'Measured over the pre-refusal harvest, which is where the withdrawal is applied.',
    howToReadIt: {
      verdict:
        "'recurring' — the source describes damage repeating over a duration, so it belongs in " +
        "the damage-over-time line and never in burst. 'simultaneous' — the hits land in one " +
        "moment, as with 'per Arrow' or 'per Wave', so it belongs in burst. 'source-silent' — " +
        'the source does not say, and the entry stays incomplete.',
      countVerdict:
        'A SEPARATE question from the verdict: is the stored `hits` count a full-duration count? ' +
        "'corroborated' — the source's own duration divided by its own interval equals it. " +
        "'count-not-stored' — a count exists in the source and `hits` holds 1. " +
        "'no-duration-stated' — a toggle or aura, so no count can exist. " +
        "'contested' — the source's description and its own leveling row disagree.",
      marked:
        'True only when the entry is recurring AND its count is corroborated. A marked component ' +
        'moves to the DoT line; everything else stays withdrawn to incomplete.',
      verbatim:
        'The quoted sentence exactly as it appears in the cached wikitext. Every one was checked ' +
        'as a literal substring before this file was written.',
    },
    counts: {
      entriesRead: PER_TICK_READS.length,
      verdicts: {
        recurring: PER_TICK_READS.filter((r) => r.verdict === 'recurring').length,
        simultaneous: PER_TICK_READS.filter((r) => r.verdict === 'simultaneous').length,
        sourceSilent: PER_TICK_READS.filter((r) => r.verdict === 'source-silent').length,
      },
      countVerdicts: {
        corroborated: by('corroborated'),
        countNotStored: by('count-not-stored'),
        noDurationStated: by('no-duration-stated'),
        contested: by('contested'),
      },
      marked: markedOverTime().size,
      stillWithdrawn: PER_TICK_READS.filter((r) => !r.marked).length,
      quoteFragmentsChecked: PER_TICK_READS.reduce((s, r) => s + r.verbatim.length, 0),
    },
    theFinding:
      'All 37 recur. Not one turned out to be the multi-hit shape the label could equally have ' +
      'meant, so the burst line was the wrong home for every one of them. What separates them is ' +
      'not what the damage does but whether the source states how many times it lands.',
    entries: PER_TICK_READS.map((r) => ({
      entry: r.key,
      verdict: r.verdict,
      countVerdict: r.countVerdict,
      marked: r.marked,
      quote: r.quote,
      arithmetic:
        r.durationSeconds === null
          ? `no duration stated; ticks every ${r.intervalSeconds}s`
          : `${r.durationSeconds}s / ${r.intervalSeconds}s = ${r.impliedTicks} ticks`,
      storedHits: r.storedHits,
      ...(r.note ? { note: r.note } : {}),
      verbatim: r.verbatim,
    })),
  };

  await mkdir(join(ROOT, 'build', 'proposed-curated'), { recursive: true });
  await writeFile(join(ROOT, OUT), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(
    `  ${audit.counts.entriesRead} entries read · ${audit.counts.quoteFragmentsChecked} quoted ` +
      `fragments checked against the source · ${audit.counts.marked} marked recurring · ` +
      `${audit.counts.stillWithdrawn} still withdrawn`,
  );
}

await main();
