// THE REFUSAL CENSUS — re-measured over the WHOLE in-scope population.
//   node scripts/fetch/effect-refusal-census.ts
//
// DATA-SOURCES §39 reported "35 refused" and grouped them. That measurement was taken over the
// 63 effects whose damage value the source states structurally — 63 of the 168 the census calls
// in scope. The other 105 were never put through anything at all, so the refusal groups
// described a fifth of the problem and read like the whole of it.
//
// This runner puts EVERY in-scope effect somewhere. It writes public/data/effect-refusal-census.json.
// Everything printed is an observed number.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANDIDATE_AUDIT } from './effect-census-audit.ts';
import type { EffectClassification } from './effect-census.ts';
import { fetchEffectPopulation } from './effect-live.ts';
import {
  BUCKET_DEFINITIONS,
  REFUSAL_CLASSES,
  bucketOf,
  statModifierBlockers,
  type RefusalBucket,
} from './effect-refusal-classes.ts';
import { plainText } from './effect-text.ts';
import { extractItemEffect } from './effect-values.ts';
import { gateEffect, type GateResult } from './effect-values-gate.ts';
import { READ_POPULATION } from './effect-values-read.ts';
import { REACH_READ_POPULATION, reachReadingFor } from './effect-values-read-reach.ts';
import {
  extractReachItemEffect,
  footnoteArms,
  hasHiddenAsBlock,
  hidingWrappers,
  inSecondReachPopulation,
  reachShapeOf,
} from './effect-values-reach.ts';
import { WIKI_ITEM_MODULE_URL, ddragonItemsUrl, ddragonRunesUrl, VERSIONS_URL } from './sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = joinPath(HERE, '..', '..', 'public', 'data');

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n');
}

/** One in-scope effect that is not stored, and every class blocking it. */
export interface RefusedRow {
  id: number;
  key: string;
  ownerName: string;
  source: 'item' | 'rune';
  /** Which half of the in-scope population it belongs to. */
  population: 'damaging-structural' | 'damaging-prose' | 'stat-modifier';
  classes: string[];
  buckets: RefusalBucket[];
  detail: string;
}

export async function run(): Promise<void> {
  const live = await fetchEffectPopulation();
  const { rows, patch } = live;
  console.log(`patch (versions.json[0]): ${patch}`);

  // ---- the population, with every definition restated -----------------------
  const auditSaysDamaging = new Set(
    CANDIDATE_AUDIT.filter((v) => v.dealsDamage).map((v) => `${v.ownerName}|${v.key}`),
  );
  const damaging = (r: EffectClassification): boolean =>
    r.damage === 'instance' ||
    (r.damage === 'candidate' && auditSaysDamaging.has(`${r.ownerName}|${r.key}`));
  const inScope = rows.filter((r) => damaging(r) || r.modifiesDamageRelevantStat);
  const structural = rows.filter((r) => r.damage === 'instance');
  const prose = rows.filter((r) => r.damage === 'candidate' && auditSaysDamaging.has(`${r.ownerName}|${r.key}`));
  const statOnly = inScope.filter((r) => !damaging(r));

  console.log('\n--- THE POPULATION, AND WHAT EACH FIGURE MEANS ---');
  console.log(
    table([
      ['effect entries (one keyed entry: pass/pass2/pass3/act/consume)', rows.length],
      ['IN SCOPE: deals damage, or moves a damage-relevant stat', inScope.length],
      ['  deals damage', damaging(rows[0]!) || true ? rows.filter(damaging).length : 0],
      ['    — value stated structurally (an {{as}} run naming a type AND carrying a number)', structural.length],
      ['    — value stated in prose only (census `candidate`, hand audit says it damages)', prose.length],
      ['  moves a damage-relevant stat and deals no damage', statOnly.length],
      ['OUT OF SCOPE', rows.length - inScope.length],
    ]),
  );

  const findings: string[] = [];
  if (inScope.length !== 168) {
    findings.push(
      `DATA-SOURCES §37.2 records 168 in-scope effects; this run observed ${inScope.length}.`,
    );
  }

  // ---- pass 1: the structural 63, through the existing gate ---------------
  const structuralKeys = new Set(READ_POPULATION.map((r) => `${r.id}|${r.key}`));
  const gatedStructural: GateResult[] = structural.map((row) => gateEffect(row, extractItemEffect));

  // ---- pass 2: the second reach -------------------------------------------
  const reachPopulation = rows.filter((r) => inSecondReachPopulation(r, structuralKeys));
  const gatedReach: GateResult[] = reachPopulation.map((row) =>
    gateEffect(row, extractReachItemEffect, reachReadingFor),
  );

  const gated = [...gatedStructural, ...gatedReach];
  const stored = gated.filter((g) => g.outcome === 'stored');
  const storedKeys = new Set(stored.map((g) => `${g.id}|${g.key}`));

  console.log('\n--- THE TWO EXTRACTION PASSES ---');
  console.log(
    table([
      ['pass 1 — the structural 63, gated against effect-values-read.ts', gatedStructural.length],
      ['  stored', gatedStructural.filter((g) => g.outcome === 'stored').length],
      ['  refused', gatedStructural.filter((g) => g.outcome === 'refused').length],
      ['pass 2 — the second reach, gated against effect-values-read-reach.ts', gatedReach.length],
      ['  stored', gatedReach.filter((g) => g.outcome === 'stored').length],
      ['  refused', gatedReach.filter((g) => g.outcome === 'refused').length],
      ['STORED, BOTH PASSES', stored.length],
      ['  complete (verification: derived)', stored.filter((g) => !g.hasUnresolvedOwner).length],
      ['  carrying a stat NO source attributes (forces incomplete)', stored.filter((g) => g.hasUnresolvedOwner).length],
    ]),
  );
  console.log(
    '  pass 2 stored: ' +
      (gatedReach
        .filter((g) => g.outcome === 'stored')
        .map((g) => `${g.ownerName} [${g.key}]`)
        .join(', ') || '(none)'),
  );

  // A pass that stored an effect the other pass already stored would double a damage number.
  const doubled = gatedReach.filter((g) =>
    gatedStructural.some((s) => s.id === g.id && s.key === g.key),
  );
  if (doubled.length > 0) {
    findings.push(
      `THE TWO PASSES OVERLAP on ${doubled.length} effects, which would store one damage figure ` +
        `twice: ${doubled.map((d) => `${d.ownerName} [${d.key}]`).join(', ')}`,
    );
  }

  // ---- the census: every in-scope effect that is not stored ---------------
  const refused: RefusedRow[] = [];
  for (const row of inScope) {
    if (storedKeys.has(`${row.id}|${row.key}`)) continue;
    // WHICH POPULATION AN EFFECT BELONGS TO IS DECIDED BY THE CENSUS, NOT BY WHICH PASS HAPPENED
    // TO TOUCH IT. Doran's Ring `pass` deals no damage and is a stat modifier, and it is only in
    // pass 2 at all because the hidden-block test found an {{as}} block in its footnote. Reading
    // its class off that pass would have filed a mana passive under "damage stated in prose".
    const gate = damaging(row) ? gated.find((g) => g.id === row.id && g.key === row.key) : undefined;
    let population: RefusedRow['population'];
    let classes: string[];
    let detail: string;

    if (gate) {
      population = structural.includes(row) ? 'damaging-structural' : 'damaging-prose';
      classes = [...new Set(gate.refusals.map((f) => f.reason as string))];
      detail = gate.refusals.map((f) => f.detail).join(' | ');
    } else if (damaging(row)) {
      population = 'damaging-prose';
      classes =
        row.source === 'rune'
          ? ['rune-prose-has-no-structure-to-confirm-a-reading']
          : ['damage-in-prose-nobody-has-read'];
      detail =
        CANDIDATE_AUDIT.find((v) => v.ownerName === row.ownerName && v.key === row.key)?.because ??
        'the hand audit records that this sentence deals damage';
    } else {
      population = 'stat-modifier';
      classes = statModifierBlockers(row);
      if (classes.length === 0) classes = ['out-of-scope-before-anything-else'];
      detail = row.reachReason;
    }

    const unknown = classes.filter((c) => !(c in REFUSAL_CLASSES));
    if (unknown.length > 0) {
      findings.push(
        `${row.ownerName} [${row.key}] carries classes with no definition: ${unknown.join(', ')}`,
      );
    }
    refused.push({
      id: row.id,
      key: row.key,
      ownerName: row.ownerName,
      source: row.source,
      population,
      classes,
      buckets: [...new Set(classes.filter((c) => c in REFUSAL_CLASSES).map(bucketOf))],
      detail,
    });
  }

  // ---- by class, and by class ALONE ---------------------------------------
  const byClass: Record<string, { total: number; alone: number; effects: string[] }> = {};
  for (const r of refused) {
    for (const c of r.classes) {
      const entry = (byClass[c] ??= { total: 0, alone: 0, effects: [] });
      entry.total++;
      entry.effects.push(`${r.ownerName} [${r.key}]`);
      if (r.classes.length === 1) entry.alone++;
    }
  }
  console.log(`\n--- WHY THE OTHER ${refused.length} ARE NOT STORED, BY CLASS ---`);
  console.log('  (an effect can carry more than one; "alone" is the count it is the ONLY blocker for)');
  console.log(
    table(
      Object.entries(byClass)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([c, v]) => [`${c} [${bucketOf(c)}]`, `${v.total} total, ${v.alone} alone`] as [string, string]),
    ),
  );

  const byBucket: Record<string, number> = {};
  for (const r of refused) {
    for (const b of r.buckets) byBucket[b] = (byBucket[b] ?? 0) + 1;
  }
  const soleBucket: Record<string, number> = {};
  for (const r of refused) {
    if (r.buckets.length === 1) soleBucket[r.buckets[0]!] = (soleBucket[r.buckets[0]!] ?? 0) + 1;
  }
  console.log('\n--- WHOSE PROBLEM IS IT? ---');
  console.log(
    table(
      (Object.keys(BUCKET_DEFINITIONS) as RefusalBucket[]).map(
        (b) =>
          [
            b,
            `${byBucket[b] ?? 0} effects carry a class in this bucket; ${soleBucket[b] ?? 0} carry NOTHING else`,
          ] as [string, string],
      ),
    ),
  );

  // ---- the contract shapes, each with the population it would release ------
  const contractClasses = Object.entries(REFUSAL_CLASSES).filter(([, v]) => v.bucket === 'contract');
  console.log('\n--- CONTRACT SHAPES, EACH WITH WHAT IT WOULD RELEASE ON ITS OWN ---');
  const releases = contractClasses
    .map(([name, klass]) => {
      const blocked = refused.filter((r) => r.classes.includes(name));
      const alone = blocked.filter((r) => r.classes.length === 1);
      return { name, shapeNeeded: klass.shapeNeeded ?? '', blocked: blocked.length, alone: alone.length, aloneEffects: alone.map((r) => `${r.ownerName} [${r.key}]`) };
    })
    .filter((r) => r.blocked > 0)
    .sort((a, b) => b.alone - a.alone || b.blocked - a.blocked);
  console.log(
    table(releases.map((r) => [r.name, `${r.alone} released alone, ${r.blocked} mention it`] as [string, string])),
  );

  // ---- the defect this census found, swept over the whole population ------
  // STANDING RULE (CLAUDE.md): a defect becomes a mechanical check over all 291, never a fix to
  // the entry that surfaced it.
  const hidden = rows.filter((r) => r.source === 'item' && hasHiddenAsBlock(r.text));
  const wrappers = new Set(hidden.flatMap((r) => hidingWrappers(r.text)));
  const hiddenStored = hidden.filter((r) => storedKeys.has(`${r.id}|${r.key}`));
  console.log('\n--- DEFECT SWEPT OVER ALL ' + rows.length + ' EFFECTS: a damage figure the outermost-level scan cannot see ---');
  console.log(
    table([
      ['item effects carrying an {{as}} block that no {{as}} block encloses', hidden.length],
      ['  the wrappers doing the hiding', [...wrappers].join(', ')],
      ['  of those, already stored by the main path (their hidden block is not damage)', hiddenStored.length],
      ['  in the second-reach population', reachPopulation.length],
      ['  released by it', gatedReach.filter((g) => g.outcome === 'stored').length],
    ]),
  );
  console.log('  ' + hidden.map((r) => `${r.ownerName} [${r.key}]`).join(', '));

  // DID THE DEFECT CORRUPT ANYTHING ALREADY STORED? The question that matters more than the
  // release. A stored entry whose sentence hides a SECOND damage figure in a footnote would be
  // under-reporting its own effect, and nothing would say so. Run every time, not once.
  const understated: string[] = [];
  for (const row of rows) {
    if (!storedKeys.has(`${row.id}|${row.key}`)) continue;
    const reached = gatedReach.some((g) => g.id === row.id && g.key === row.key);
    if (reached) continue; // its footnote IS what was stored
    for (const arms of footnoteArms(row.text)) {
      for (const arm of arms) {
        if (/\b(?:physical|magic|true)\s+damage\b/i.test(plainText(arm))) {
          understated.push(`${row.ownerName} [${row.key}]: ${plainText(arm).trim().slice(0, 120)}`);
        }
      }
    }
  }
  console.log(
    `\n  stored entries whose footnote hides a damage figure the entry does not carry: ${understated.length}`,
  );
  for (const u of understated) console.log('    ' + u);
  if (understated.length > 0) {
    findings.push(
      `${understated.length} ALREADY-STORED effects hide a damage figure in a footnote that the ` +
        `stored entry does not carry, so each is understating itself: ${understated.join('; ')}`,
    );
  }

  const payload = {
    provenance: {
      source:
        'Riot Data Dragon item.json + runesReforged.json (which items and runes exist); ' +
        'wiki Module:ItemData/data (item effect prose and values)',
      url: WIKI_ITEM_MODULE_URL,
      patch,
      fetched: live.fetched,
      urls: {
        patch: VERSIONS_URL,
        items: ddragonItemsUrl(patch),
        itemEffects: WIKI_ITEM_MODULE_URL,
        runes: ddragonRunesUrl(patch),
      },
    },
    whatThisIs:
      'A CENSUS OF REFUSALS over the whole in-scope item and rune effect population, not over ' +
      'the structural subset DATA-SOURCES §39 measured. Every in-scope effect is either stored ' +
      'or carries at least one named class, every class carries a definition, and every class ' +
      'sits in one bucket saying whose problem it is. Nothing here is curated data.',
    definitions: {
      effectEntry:
        'One keyed entry in Module:ItemData/data or one rune — pass / pass2 / pass3 / act / ' +
        'consume. `description2` is a rider clause on the same effect, not a second effect.',
      inScope:
        'Deals damage, or modifies a stat that can change a damage number or the survival ' +
        'verdict. Movement speed, attack speed, ability haste, cooldowns and tenacity are NOT ' +
        'damage-relevant, because the engine models sequence and not elapsed time ' +
        '(SPECIFICATION §3.2).',
      damagingStructural:
        'The source wraps a damage type and a number together in one {{as}} run. 63 effects.',
      damagingProse:
        'The source says damage is dealt and does not state the value structurally. The census ' +
        'calls these `candidate`; the hand audit in effect-census-audit.ts confirms 18 of the ' +
        '40 candidates deal damage. NO VALUE EXTRACTION HAS EVER BEEN ATTEMPTED ON THESE.',
      statModifier:
        'In scope, and deals no damage: it moves a stat that changes a damage number.',
      stored:
        'The wikitext parser and a recorded hand reading independently produced the same damage ' +
        'type, the same flat base, the same ratios in the same order, the same owner for every ' +
        'ratio, and the same recurrence. Any other outcome is a refusal.',
      blockedAlone:
        'The count of effects for which a class is the ONLY blocker. Adding a shape releases ' +
        'that number, not the larger "mentions it" number — DATA-SOURCES §41.3 predicted 19 ' +
        'releases from a count of reasons and got 10, because 8 of the 18 carried a second ' +
        'blocker and 2 of the reasons landed on one effect.',
      buckets: BUCKET_DEFINITIONS,
    },
    counts: {
      effectEntries: rows.length,
      inScope: inScope.length,
      damaging: rows.filter(damaging).length,
      damagingStructural: structural.length,
      damagingProse: prose.length,
      statModifiers: statOnly.length,
      stored: stored.length,
      storedByPass: {
        structural: gatedStructural.filter((g) => g.outcome === 'stored').length,
        secondReach: gatedReach.filter((g) => g.outcome === 'stored').length,
      },
      notStored: refused.length,
      byClass,
      byBucket,
      carryingNothingButThisBucket: soleBucket,
      contractShapeReleases: releases,
    },
    hiddenDamageFigureSweep: {
      whatThisIs:
        '`findBlocks` reports templates at the OUTERMOST nesting level only, so an {{as}} block ' +
        'inside another template is invisible to the census, the parser and the gate at once. ' +
        'This is that class, measured over every item effect.',
      itemEffectsAffected: hidden.map((r) => `${r.ownerName} [${r.key}]`),
      wrappers: [...wrappers],
      alreadyStoredByTheMainPath: hiddenStored.map((r) => `${r.ownerName} [${r.key}]`),
      secondReachPopulation: reachPopulation.map((r) => ({
        effect: `${r.ownerName} [${r.key}]`,
        shape: reachShapeOf(r.text),
      })),
      released: gatedReach
        .filter((g) => g.outcome === 'stored')
        .map((g) => `${g.ownerName} [${g.key}]`),
      storedEntriesUnderstatingThemselves: understated,
    },
    readPopulations: {
      structural: READ_POPULATION.length,
      secondReach: REACH_READ_POPULATION.length,
    },
    classes: REFUSAL_CLASSES,
    findings,
    rows: refused,
  };

  if (findings.length > 0) {
    console.log('\n--- FINDINGS (a live count disagreeing with the record is a finding) ---');
    for (const f of findings) console.log('  * ' + f);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const text = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(joinPath(OUT_DIR, 'effect-refusal-census.json'), text, 'utf8');
  console.log(`\nwrote public/data/effect-refusal-census.json (${(text.length / 1024).toFixed(0)} KiB)`);
}

await run();
