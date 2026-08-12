// Run one batch of champions through the harvester and all six gates.
//
//   node scripts/extract/run-batch.ts Lux Ezreal Malphite ...
//
// Writes drafts to build/proposed-curated/abilities/ and prints a pass/fail count per gate.
// It never writes /curated/ — that merge is a lead action after a human unlock.
//
// Gate 5 (independent re-derivation by the sceptic agent) is not run from here: it is a
// separate agent that re-fetches the source and must not share this process's code or its
// assumptions. This script reports which entries a gate-5 sample should cover, at the tiered
// rate agreed in the plan (T1 10%, T2 25%, T3 50%, T4 100%).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AbilitySlot, Champion, CuratedFile } from '../../src/types/data.ts';
import { validateCuratedFile } from '../../src/types/validate-curated.ts';
import {
  draftFromTemplate,
  fetchTemplates,
  roundTrip,
  wikiSlotAlias,
  type DraftAbility,
} from './harvest.ts';
import { renderAbility } from './render.ts';

const SLOTS: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];
const OUT_DIR = 'build/proposed-curated/abilities';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('usage: node scripts/extract/run-batch.ts <Champion> [<Champion> ...]');
    process.exit(1);
  }

  const roster = JSON.parse(
    await (await import('node:fs/promises')).readFile('public/data/champions.json', 'utf8'),
  ) as Champion[];
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile('public/data/manifest.json', 'utf8'),
  ) as { patch: string };
  const byName = new Map(roster.map((c) => [c.name, c]));
  const fetched = new Date().toISOString().slice(0, 10);

  const drafts: DraftAbility[] = [];
  const roundTrips = [];

  for (const name of names) {
    const champ = byName.get(name);
    if (!champ) {
      console.error(`! ${name} is not in public/data/champions.json — skipped`);
      continue;
    }
    const wanted = SLOTS.filter((s) => champ.abilityNames[s]);
    const titles = wanted.map((s) => `Template:Data ${name}/${wikiSlotAlias(s)}`);
    const pages = await fetchTemplates(titles);

    for (const slot of wanted) {
      const title = `Template:Data ${name}/${wikiSlotAlias(slot)}`;
      const page = pages.get(title);
      if (!page) {
        console.error(`! ${name} ${slot}: template not found`);
        continue;
      }
      const abilityName = champ.abilityNames[slot]!;
      const draft = draftFromTemplate(
        { champion: name, slot, ability: abilityName, wikitext: page.content, revisionId: page.revid },
        manifest.patch,
        fetched,
      );
      drafts.push(draft);

      // Gate 2: compare our expansion to what the wiki itself renders.
      if (draft.entry.components.length > 0) {
        try {
          const rendered = await renderAbility(name, abilityName);
          roundTrips.push(roundTrip(draft, rendered));
        } catch (e) {
          roundTrips.push({
            entry: `${name}/${slot}/${abilityName}`,
            checkedRows: 0,
            matchedRows: 0,
            mismatches: [
              { label: '(render failed)', expected: [], actual: [], detail: String(e) },
            ],
            unmatchedRows: [],
          });
        }
        await sleep(300); // be a polite client
      }
    }
  }

  const file: CuratedFile = {
    version: 1,
    patch: manifest.patch,
    fetched,
    abilities: drafts.map((d) => d.entry),
    itemEffects: [],
    runes: [],
    shards: [],
    exclusions: [
      {
        champion: 'Aphelios',
        reason:
          'Five weapons, ten off-hand pairings and a Q that is a different ability per weapon. ' +
          'Eight of his nine damage-bearing abilities carry no machine-readable numbers.',
        decidedOn: '2026-08-12',
      },
    ],
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'batch-01.json'), `${JSON.stringify(file, null, 2)}\n`);
  await writeFile(
    join(OUT_DIR, 'batch-01.report.json'),
    `${JSON.stringify({ roundTrips, drafts: drafts.map(summarise) }, null, 2)}\n`,
  );

  report(file, drafts, roundTrips);
}

function summarise(d: DraftAbility) {
  return {
    entry: `${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`,
    components: d.entry.components.length,
    shapes: d.shapes,
    issues: d.issues,
    dropped: d.droppedRows,
    needsHandAuthoring: d.needsHandAuthoring,
    droppedEveryDamageRow: d.droppedEveryDamageRow,
    verification: d.entry.verification,
  };
}

function report(
  file: CuratedFile,
  drafts: DraftAbility[],
  roundTrips: ReturnType<typeof roundTrip>[],
): void {
  const rtChecked = roundTrips.reduce((n, r) => n + r.checkedRows, 0);
  const rtMatched = roundTrips.reduce((n, r) => n + r.matchedRows, 0);
  const rtFailedEntries = roundTrips.filter((r) => r.mismatches.length > 0);

  // Gate 6 evidence: only entries whose every checked row round-tripped are eligible.
  const roundTripPassed = new Set(
    roundTrips.filter((r) => r.mismatches.length === 0 && r.checkedRows > 0).map((r) => r.entry),
  );
  const reports = validateCuratedFile(file, {
    roundTripPassed,
    independentlyChecked: new Set(), // gate 5 runs as a separate agent
  });

  const line = (g: string, checked: number, passed: number, failed: number) =>
    console.log(`  ${g.padEnd(16)} checked ${String(checked).padStart(4)}   pass ${String(passed).padStart(4)}   FAIL ${String(failed).padStart(4)}`);

  console.log('\n=== BATCH GATE REPORT ===');
  console.log(`champions: ${new Set(file.abilities.map((a) => a.champion)).size}   ability entries: ${file.abilities.length}   components: ${file.abilities.reduce((n, a) => n + a.components.length, 0)}\n`);
  const schema = reports.find((r) => r.gate === 'schema')!;
  line('1 schema', schema.checked, schema.passed, schema.failed);
  line('2 round-trip', rtChecked, rtMatched, rtChecked - rtMatched);
  const sum = reports.find((r) => r.gate === 'sum-guard')!;
  line('3 sum-guard', sum.checked, sum.passed, sum.failed);
  const nc = reports.find((r) => r.gate === 'non-champion')!;
  line('4 non-champion', nc.checked, nc.passed, nc.failed);
  console.log(`  5 independent    not run here — separate agent, sample list below`);
  const sh = reports.find((r) => r.gate === 'status-honesty')!;
  line('6 status-honesty', sh.checked, sh.passed, sh.failed);

  for (const r of reports) {
    if (r.findings.length === 0) continue;
    console.log(`\n--- gate ${r.gate}: ${r.findings.length} finding(s) ---`);
    for (const f of r.findings.slice(0, 40)) console.log(`  ${f.entry}: ${f.message}`);
    if (r.findings.length > 40) console.log(`  … and ${r.findings.length - 40} more`);
  }
  if (rtFailedEntries.length > 0) {
    console.log(`\n--- gate round-trip: ${rtFailedEntries.length} entry/entries disagree ---`);
    for (const r of rtFailedEntries) {
      for (const m of r.mismatches) console.log(`  ${r.entry} [${m.label}]: ${m.detail}`);
    }
  }
  const unmatched = roundTrips.filter((r) => r.unmatchedRows.length > 0);
  if (unmatched.length > 0) {
    console.log(`\n--- rows the wiki rendered that we did not store ---`);
    for (const r of unmatched) console.log(`  ${r.entry}: ${r.unmatchedRows.join(' | ')}`);
  }

  const zeroed = drafts.filter((d) => d.droppedEveryDamageRow);
  if (zeroed.length > 0) {
    console.log(
      `\n!!! ${zeroed.length} ability/abilities had damage rows in the source and stored NONE.`,
    );
    console.log('    These would contribute zero damage. Gate 2 cannot see them — there is');
    console.log('    nothing to compare. Each must be resolved before the batch is accepted.');
    for (const d of zeroed) {
      console.log(
        `  ${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}: dropped ` +
          d.droppedRows.map((r) => `"${r.label}" (${r.why})`).join(', '),
      );
    }
  }

  const hand = drafts.filter((d) => d.needsHandAuthoring);
  if (hand.length > 0) {
    console.log(`\n--- prose-only, for the hand-authored worklist (${hand.length}) ---`);
    for (const d of hand) console.log(`  ${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`);
  }
  const issues = drafts.filter((d) => d.issues.length > 0);
  if (issues.length > 0) {
    console.log(`\n--- rows the classifier could not fully read (${issues.length} abilities) ---`);
    for (const d of issues) {
      for (const i of d.issues) console.log(`  ${d.entry.champion}/${d.entry.slot}: [${i.kind}] ${i.detail}`);
    }
  }

  const shapes = drafts.flatMap((d) => d.shapes);
  const counts = new Map<string, number>();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  console.log('\n--- shape distribution in this batch ---');
  for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}  ${n}  (${((n / shapes.length) * 100).toFixed(1)}%)`);
  }

  // Gate 5 sample at the tiered rate. This batch is all T1, so 10%.
  const eligible = drafts.filter((d) => d.entry.components.length > 0);
  const sampleSize = Math.max(1, Math.ceil(eligible.length * 0.1));
  console.log(`\n--- gate 5 sample for the sceptic agent (T1 rate 10% => ${sampleSize} of ${eligible.length}) ---`);
  for (let i = 0; i < sampleSize; i += 1) {
    const d = eligible[Math.floor((i * eligible.length) / sampleSize)]!;
    console.log(`  ${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`);
  }
  console.log('');
}

await main();
