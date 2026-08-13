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
  roundTripLevelScaled,
  wikiSlotAlias,
  type DraftAbility,
  type LevelRoundTripResult,
} from './harvest.ts';
import { fetchDamageData } from './damage-data.ts';
import { renderAbility, renderLevelBlocks } from './render.ts';

const SLOTS: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];
const OUT_DIR = 'build/proposed-curated/abilities';

/**
 * The gate-5 ledger: entries an INDEPENDENT re-derivation has confirmed.
 *
 * Gate 5 is a separate agent that re-fetches the sources and works the numbers out for itself,
 * without this code or its assumptions. It cannot run inside this process — sharing the process
 * would defeat the point — so its result arrives as a file, and this is the only way an entry can
 * ever reach `verified`.
 *
 * Each record names the entry, the date, and what was checked. An entry absent from this file is
 * not verified, and no amount of gate-2 agreement changes that.
 */
/**
 * WHERE THIS LIVES, AND WHY NOT IN `/curated/`. The ledger is evidence, and evidence must be
 * version-controlled and durable, so it cannot live in `build/` (git-ignored, a run artefact).
 * `/curated/` is the natural home in spirit — it is the project's irreplaceable asset — but it is
 * read-only on disk and guarded, and moving the ledger there is a deliberate decision for the
 * project owner to make with the unlock, not something to slip in. Top-level and lead-owned
 * until then.
 */
const GATE5_LEDGER = 'verification/gate5-passes.json';

/**
 * Abilities where two sources state different values for the same figure and nothing settles it.
 *
 * The tie-break policy is DATA-SOURCES §32: neither value is adopted, the entry is forced to
 * `incomplete`, and both readings are recorded with their evidence. An entry listed here may
 * never be `derived`, because "extracted from source, not independently confirmed" claims a
 * settled reading of the source and there is not one.
 */
const CONFLICT_LEDGER = 'verification/ability-conflicts.json';

interface Gate5Record {
  /** "Champion/Slot/AbilityName", matching the key the validator builds. */
  entry: string;
  checkedOn: string;
  /** What the re-derivation covered, in plain English, for the audit trail. */
  note: string;
}

async function readGate5Ledger(): Promise<Map<string, Gate5Record>> {
  try {
    const raw = await (await import('node:fs/promises')).readFile(GATE5_LEDGER, 'utf8');
    const records = JSON.parse(raw) as Gate5Record[];
    return new Map(records.map((r) => [r.entry, r]));
  } catch {
    return new Map(); // no ledger yet: nothing is independently checked, which is the truth
  }
}

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
  // Module:DamageData/data states the damage type of each instance. The prose path reads it
  // rather than inferring a type, and refuses a block whose sentence contradicts it.
  const damageData = await fetchDamageData();

  const drafts: DraftAbility[] = [];
  const roundTrips = [];
  const levelRoundTrips: LevelRoundTripResult[] = [];

  for (const name of names) {
    const champ = byName.get(name);
    if (!champ) {
      console.error(`! ${name} is not in public/data/champions.json — skipped`);
      continue;
    }
    // Every ability name in every slot, not just the first — a slot can hold more than one
    // real ability (Jayce's hammer form, Hwei's subjects, Riven's Wind Slash).
    const wanted: Array<{ slot: AbilitySlot; abilityName: string; title: string; first: boolean }> = [];
    for (const slot of SLOTS) {
      const list = champ.abilityNames[slot] ?? [];
      list.forEach((abilityName, i) => {
        // The slot alias (Template:Data X/Q) is the reliable route to the FIRST name; the
        // extras have to be addressed by their own name.
        const title = i === 0
          ? `Template:Data ${name}/${wikiSlotAlias(slot)}`
          : `Template:Data ${name}/${abilityName}`;
        wanted.push({ slot, abilityName, title, first: i === 0 });
      });
    }
    const pages = await fetchTemplates(wanted.map((w) => w.title));

    // ALIAS GUARD. 128 of the 208 non-first names redirect to a page a first name already
    // reaches — "The Darkin Blade 2" is a second cast row inside Aatrox Q's own template, not
    // a second ability. Harvesting by name alone would store Aatrox Q three times and triple
    // its damage. Revision id identifies the page, so one entry per page is the rule.
    const seenRevision = new Map<number, string>();

    for (const { slot, abilityName, title, first } of wanted) {
      const page = pages.get(title);
      if (!page) {
        if (first) console.error(`! ${name} ${slot}: template not found`);
        else console.error(`! ${name} ${slot} "${abilityName}": no template of that name — skipped`);
        continue;
      }
      const already = seenRevision.get(page.revid);
      if (already !== undefined) {
        console.error(
          `  ${name} ${slot} "${abilityName}": alias of "${already}" (same page) — not stored twice`,
        );
        continue;
      }
      seenRevision.set(page.revid, abilityName);
      // The rank count comes from Data Dragon's `maxrank`, never from the slot letter.
      // Absent means Data Dragon did not describe that slot (the passive); the harvester
      // falls back to its structural default of 1 there rather than to 5.
      const draft = draftFromTemplate(
        {
          champion: name,
          slot,
          ability: abilityName,
          wikitext: page.content,
          revisionId: page.revid,
          maxRank: champ.abilityMaxRanks[slot],
          damageData,
        },
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
            displayRoundedValues: 0,
            rowsClearedByDisplayRounding: 0,
            levelScaledNotCompared: 0,
          });
        }
        await sleep(300); // be a polite client
      }

      // GATE 2 FOR LEVEL-SCALED VALUES. The ability box prints those as a single
      // "(based on level)" figure, so `roundTrip` cannot check them and no longer pretends to.
      // Re-rendering the source block returns the wiki's own full per-level expansion, which
      // can. This lives here, not in `draftFromTemplate`, for the same reason the gate-2
      // demotion does: it needs the network.
      if (draft.levelSources.length > 0) {
        let series: Array<number[] | null>;
        try {
          series = await renderLevelBlocks(draft.levelSources.map((l) => ({ name: l.name, inner: l.inner })));
        } catch {
          series = draft.levelSources.map(() => null);
        }
        levelRoundTrips.push(roundTripLevelScaled(draft, series));
        await sleep(300);
      }
    }
  }

  // GATE 2 DEMOTES, the same way gate 1 does (DATA-SOURCES §23, §24).
  //
  // An entry whose stored values disagree with the wiki's own rendering is WRONG, not
  // "extracted from source but unconfirmed". It must not come out `derived`. Gate 6 only ever
  // required round-trip evidence for `verified`, so a disagreeing entry sat at `derived`
  // indefinitely — survivable while gate 2 compared base values only, and not survivable now
  // that it compares ratios and finds disagreements it previously could not.
  //
  // This lives here rather than in `draftFromTemplate` because the round-trip needs the
  // network: the harvester cannot know the result, and the batch runner can.
  const disagreed = new Map<string, string>();
  for (const rt of roundTrips) {
    if (rt.mismatches.length === 0) continue;
    disagreed.set(rt.entry, rt.mismatches.map((m) => `[${m.label}] ${m.detail}`).join(' ;; '));
  }
  // A level-scaled disagreement demotes on exactly the same rule.
  for (const lrt of levelRoundTrips) {
    if (lrt.mismatches.length === 0) continue;
    const detail = lrt.mismatches.map((m) => `[${m.componentId}] ${m.detail}`).join(' ;; ');
    disagreed.set(lrt.entry, [disagreed.get(lrt.entry), detail].filter(Boolean).join(' ;; '));
  }
  let demoted = 0;
  for (const d of drafts) {
    const key = `${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`;
    const why = disagreed.get(key);
    if (why === undefined || d.entry.verification === 'incomplete') continue;
    d.entry.verification = 'incomplete';
    d.issues.push({ kind: 'round-trip-disagreement', detail: why.slice(0, 200) });
    demoted += 1;
  }
  if (demoted > 0) {
    console.log(`\ngate 2 demoted ${demoted} entr${demoted === 1 ? 'y' : 'ies'} from 'derived' to 'incomplete'`);
  }

  // GATE 5, AND THE ONLY PROMOTION TO 'verified' IN THE PROJECT.
  //
  // Both conditions are required and neither is sufficient. Gate 2 shows our numbers agree with
  // the wiki's own rendering of the same template — but that shares a source with us, so it
  // cannot catch a source we read wrongly in the same way twice. Gate 5 is a second party
  // re-deriving from scratch. An entry needs both, plus a recorded sourceRevision so staleness
  // stays traceable.
  const gate5 = await readGate5Ledger();
  const conflicts = new Set<string>();
  try {
    const raw = JSON.parse(await (await import('node:fs/promises')).readFile(CONFLICT_LEDGER, 'utf8')) as Array<{ entry: string }>;
    for (const r of raw) conflicts.add(r.entry);
  } catch { /* no ledger: no recorded conflicts */ }
  let contested = 0;
  for (const d of drafts) {
    const key = `${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`;
    if (!conflicts.has(key)) continue;
    if (d.entry.verification !== 'incomplete') contested += 1;
    d.entry.verification = 'incomplete';
    d.issues.push({ kind: 'source-conflict', detail: `two sources disagree about a stored value; see ${CONFLICT_LEDGER}` });
  }
  if (contested > 0) console.log(`\n${contested} entr${contested === 1 ? 'y' : 'ies'} forced to 'incomplete' by a recorded source conflict`);
  let promoted = 0;
  for (const d of drafts) {
    const key = `${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}`;
    if (d.entry.verification !== 'derived') continue;
    if (!gate5.has(key)) continue;
    const rt = roundTrips.find((r) => r.entry === key);
    if (!rt || rt.mismatches.length > 0 || rt.checkedRows + rt.levelScaledNotCompared === 0) continue;
    d.entry.verification = 'verified';
    promoted += 1;
  }
  console.log(
    `\ngate 5 ledger: ${gate5.size} entr${gate5.size === 1 ? 'y' : 'ies'} recorded; ` +
      `${promoted} promoted to 'verified' (gate 2 agreement AND an independent re-derivation)`,
  );

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
    `${JSON.stringify({ roundTrips, levelRoundTrips, drafts: drafts.map(summarise) }, null, 2)}\n`,
  );

  report(file, drafts, roundTrips, levelRoundTrips, [...gate5.keys()]);
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
  levelRoundTrips: LevelRoundTripResult[],
  gate5Keys: string[],
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
    independentlyChecked: new Set(gate5Keys),
  });

  const line = (g: string, checked: number, passed: number, failed: number) =>
    console.log(`  ${g.padEnd(16)} checked ${String(checked).padStart(4)}   pass ${String(passed).padStart(4)}   FAIL ${String(failed).padStart(4)}`);

  console.log('\n=== BATCH GATE REPORT ===');
  console.log(`champions: ${new Set(file.abilities.map((a) => a.champion)).size}   ability entries: ${file.abilities.length}   components: ${file.abilities.reduce((n, a) => n + a.components.length, 0)}\n`);
  const schema = reports.find((r) => r.gate === 'schema')!;
  line('1 schema', schema.checked, schema.passed, schema.failed);
  line('2 round-trip', rtChecked, rtMatched, rtChecked - rtMatched);
  const lvChecked = levelRoundTrips.reduce((n, r) => n + r.checked, 0);
  const lvMatched = levelRoundTrips.reduce((n, r) => n + r.matched, 0);
  const lvUnrenderable = levelRoundTrips.reduce((n, r) => n + r.unrenderable, 0);
  line('2 round-trip/lvl', lvChecked, lvMatched, lvChecked - lvMatched);
  const notCompared = roundTrips.reduce((n, r) => n + r.levelScaledNotCompared, 0);
  console.log(
    `  (the ability box cannot check ${notCompared} level-scaled row(s); those are checked` +
      ` against the wiki's own expansion of the source block instead. ${lvUnrenderable}` +
      ` component(s) had no expansion to compare — no evidence, not a pass.)`,
  );
  const sum = reports.find((r) => r.gate === 'sum-guard')!;
  line('3 sum-guard', sum.checked, sum.passed, sum.failed);
  const nc = reports.find((r) => r.gate === 'non-champion')!;
  line('4 non-champion', nc.checked, nc.passed, nc.failed);
  console.log(
    `  5 independent    ${gate5Keys.length} recorded in ${GATE5_LEDGER} — re-derived by a separate agent`,
  );
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

  const proseMoved = drafts.filter((d) => d.proseComponents > 0);
  if (proseMoved.length > 0) {
    console.log(`\n--- damage recovered from description prose (${proseMoved.length} abilities) ---`);
    for (const d of proseMoved) {
      console.log(`  ${d.entry.champion}/${d.entry.slot}/${d.entry.abilityName}: ${d.proseComponents} component(s)`);
    }
  }
  const proseSkips = drafts.flatMap((d) => d.proseSkipped);
  if (proseSkips.length > 0) {
    const byCause = new Map<string, number>();
    for (const s of proseSkips) byCause.set(s.refusal, (byCause.get(s.refusal) ?? 0) + 1);
    console.log(`\n--- description-prose blocks NOT read, by cause (${proseSkips.length}) ---`);
    for (const [c, n] of [...byCause].sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(18)} ${n}`);
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
