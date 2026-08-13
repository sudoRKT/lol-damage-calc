// THE DEFENSIVE KIT EFFECT CENSUS — a measurement, not a harvest.
//
// It counts how many of the 937 ability pages carry an effect that changes the damage a champion
// RECEIVES, splits them the way SPECIFICATION §5 splits them, and sizes how much of that a parser
// can read. It writes no curated entry, proposes no value, and marks nothing `verified`.
//
// The shape is the one §37 used for items and runes, and every figure states what it counts and
// what it filters out. Two numbers are always reported side by side and never merged:
//
//   CANDIDATES  — what the pattern in defensive.ts proposed.
//   CONFIRMED   — what a person found when they read those sentences (defensive-confirmed.ts).
//
// Run:  node scripts/extract/defensive-census.ts
// It reads the offline cache written by page-cache.ts, so it makes no network calls and its
// coverage is exactly the cache's coverage — which the cache records, failures included.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { KINDS, scanPage, type Kind, type PageSignals } from './defensive.ts';
import { CONFIRMED, REJECTED, REJECT_CLASSES, type Activation } from './defensive-confirmed.ts';
import { CACHE_DIR, readCache } from './page-cache.ts';
import { parseFields } from './wikitext.ts';

const OUT = join(CACHE_DIR, 'defensive-census.json');

/** The ten stats §16 requires an owner for. Same list, same reason. */
const OWNER_REQUIRED = [
  'maximum health',
  'bonus health',
  'current health',
  'missing health',
  'bonus armor',
  'armor',
  'bonus magic resistance',
  'magic resistance',
  'maximum mana',
  'current mana',
];

/**
 * Does this expression attribute its stat to anybody?
 *
 * §16's rule, unchanged: a possessive or a named champion attributes; a bare stat does not, and a
 * bare stat is NOT resolved by convention. Black Cleaver is the counterexample that killed the
 * convention argument — "6% armor reduction" reads as the TARGET's armor.
 */
function ownerOf(expr: string): 'caster' | 'target' | 'unresolved' {
  const t = expr.toLowerCase();
  if (/\btarget'?s?\b|\bthe target\b|\btheir\b/.test(t)) return 'target';
  if (/\bhis\b|\bher\b|\bhers\b|\btaric'?s\b|\bsona'?s\b|\bhimself\b|\bherself\b|\bown\b/.test(t)) return 'caster';
  return 'unresolved';
}

/** Count owner-required stat references in one expression, longest phrasing winning (§16). */
function ownerRefs(expr: string): Array<{ stat: string; owner: ReturnType<typeof ownerOf> }> {
  const t = expr.toLowerCase();
  const out: Array<{ stat: string; owner: ReturnType<typeof ownerOf> }> = [];
  const taken: Array<[number, number]> = [];
  for (const stat of OWNER_REQUIRED) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(stat, from);
      if (at < 0) break;
      from = at + 1;
      // Longest phrasing wins: skip a short match already covered by a longer one.
      if (taken.some(([a, b]) => at >= a && at + stat.length <= b)) continue;
      // A compound stat that merely contains the word is a different stat (§16, §37.4 defect 4).
      const after = t.slice(at + stat.length, at + stat.length + 14);
      if (/^\s*(regeneration|penetration|reduction)/.test(after)) continue;
      taken.push([at, at + stat.length]);
      out.push({ stat, owner: ownerOf(expr) });
    }
  }
  return out;
}

function countOwners(refs: Array<{ owner: string }>) {
  return {
    references: refs.length,
    caster: refs.filter((r) => r.owner === 'caster').length,
    target: refs.filter((r) => r.owner === 'target').length,
    unresolved: refs.filter((r) => r.owner === 'unresolved').length,
  };
}

interface Row {
  key: string;
  champion: string;
  kinds: Kind[];
  activation: Activation;
  /** 'row' = a {{st|Label|value}} leveling row names the effect and holds its value (REACHABLE).
   *  'prose' = the value exists only inside a sentence (HARD).
   *  'none' = the effect has no numeric value at all (a spell shield, an invulnerability). */
  valueSource: 'row' | 'prose' | 'by-reference' | 'none';
  ownerRefs: Array<{ stat: string; owner: string; from: 'row' | 'sentence' }>;
  /** The defensive leveling rows, if any, kept as evidence. */
  rows: Array<{ label: string; value: string }>;
}

function main(cache: Awaited<ReturnType<typeof readCache>>) {
  const scans = new Map<string, PageSignals>();
  const fieldsByKey = new Map<string, Record<string, string>>();
  for (const p of cache.pages) {
    const s = scanPage(p);
    scans.set(s.key, s);
    fieldsByKey.set(s.key, parseFields(p.wikitext));
  }

  // INTEGRITY: every hand-written key must name a real page. A typo would silently drop a
  // confirmed effect and shrink the population without anybody seeing it.
  const unknownKeys = [...CONFIRMED.map((c) => c.key), ...REJECTED.map((r) => r.key)].filter(
    (k) => !scans.has(k),
  );

  const MAIN: Kind[] = [
    'damage-reduction',
    'type-specific-reduction',
    'resistance-grant',
    'shield',
    'spell-shield',
    'immunity',
    'execute-threshold',
    'heal',
  ];

  // --- candidates ---
  const candidateKinds = new Map<Kind, Set<string>>();
  const candidatePages = new Set<string>();
  for (const s of scans.values()) {
    const kinds = new Set<Kind>(s.signals.map((x) => x.kind));
    for (const r of s.statRows) kinds.add(r.kind);
    for (const k of kinds) {
      if (!candidateKinds.has(k)) candidateKinds.set(k, new Set());
      candidateKinds.get(k)!.add(s.key);
    }
    if ([...kinds].some((k) => MAIN.includes(k))) candidatePages.add(s.key);
  }

  // --- confirmed ---
  const rows: Row[] = [];
  for (const c of CONFIRMED) {
    const s = scans.get(c.key);
    if (!s) continue;
    const defRows = s.statRows.filter((r) => c.kinds.includes(r.kind));
    const refs: Row['ownerRefs'] = [];
    for (const r of defRows) for (const ref of ownerRefs(r.value)) refs.push({ ...ref, from: 'row' });
    // A prose-stated defensive value also carries owner-required stats; read the sentences the
    // detector kept rather than the whole page, so the count stays attached to the effect.
    //
    // THIS HALF IS WEAKER THAN THE ROW HALF AND IS REPORTED SEPARATELY. A sentence can carry a
    // stat belonging to a different clause ("While below 50% maximum health, Warwick heals …" —
    // the health is a threshold, not the heal's coefficient), so the sentence count is an upper
    // bound. Merging the two would hide that.
    if (defRows.length === 0) {
      for (const sig of s.signals.filter((x) => c.kinds.includes(x.kind))) {
        for (const ref of ownerRefs(sig.sentence)) refs.push({ ...ref, from: 'sentence' });
      }
    }
    const valueSource: Row['valueSource'] =
      defRows.length > 0
        ? 'row'
        : hasNumericProse(s, c.kinds)
          ? 'prose'
          : valueByReference(s, c.kinds)
            ? 'by-reference'
            : 'none';
    rows.push({
      key: c.key,
      champion: s.champion,
      kinds: c.kinds,
      activation: c.activation,
      valueSource,
      ownerRefs: refs,
      rows: defRows.map((r) => ({ label: r.label, value: r.value })),
    });
  }

  const confirmedKinds = new Map<Kind, string[]>();
  for (const r of rows) for (const k of r.kinds) confirmedKinds.set(k, [...(confirmedKinds.get(k) ?? []), r.key]);

  const mainRows = rows.filter((r) => r.kinds.some((k) => MAIN.includes(k)));
  const activation = (a: Activation) => mainRows.filter((r) => r.activation === a).length;
  const value = (v: Row['valueSource']) => mainRows.filter((r) => r.valueSource === v).length;

  const unresolvedOwner = rows.filter((r) => r.ownerRefs.some((x) => x.owner === 'unresolved'));
  const allRefs = rows.flatMap((r) => r.ownerRefs);

  const rejectedByClass = new Map<string, string[]>();
  for (const r of REJECTED) {
    const c = r.rejectedAs ?? '(unclassified)';
    rejectedByClass.set(c, [...(rejectedByClass.get(c) ?? []), r.key]);
  }

  return {
    what:
      'Census of defensive kit effects across every ability page. Counts effects that change the ' +
      'damage a champion RECEIVES. A measurement: no value was stored, nothing was marked verified.',
    generatedOn: new Date().toISOString().slice(0, 10),
    coverage: {
      pagesInCache: cache.distinctPages,
      titlesRequested: cache.requestedTitles,
      titlesResolved: cache.resolvedTitles,
      titlesMissing: cache.missingTitles.length,
      missingTitles: cache.missingTitles,
      fetchChunksFailed: cache.failedChunks.length,
      complete: cache.failedChunks.length === 0 && cache.distinctPages === 937,
      note:
        'The scan is offline over the cache. Its coverage is the cache\'s coverage, and the cache ' +
        'records every fetch failure rather than skipping it. 11 requested titles do not exist on ' +
        'the wiki; they are listed, not hidden.',
    },
    integrity: {
      handWrittenKeysNotFoundOnAnyPage: unknownKeys,
      note: 'Must be empty. A key that names no page would silently shrink the confirmed population.',
    },
    definitions: {
      defensiveEffect:
        'the ability states an effect that changes the amount of damage a champion RECEIVES, or ' +
        'offsets damage already received, for its owner or an ally.',
      kinds: KINDS,
      candidate: 'a page the prose/leveling-row detector proposed. NOT a count of effects.',
      confirmed: 'a page whose sentences a person read and accepted. The only countable figure.',
      reachable:
        "§26.3's definition applied here: a {{st|Label|value}} leveling row NAMES the defensive " +
        'effect and HOLDS its value, so reading it needs code and no judgement.',
      hard: 'the value exists only inside a sentence; a person must read it at least once.',
      noValue:
        'the effect has no number to read at all — a spell shield, an invulnerability, a stasis. ' +
        'Reported separately, because counting it as "hard" would overstate the reading burden.',
      activation:
        "SPECIFICATION §5's split, with a THIRD bucket. always-active bakes into the resolved " +
        'stat block; conditional becomes a toggle; not-stated is where the source does not settle ' +
        'it and is never resolved by a coin toss.',
      unresolvableOwner:
        "§16's rule: a stat the source attributes to nobody. A property of the source, not a " +
        'worklist (SPECIFICATION §8).',
    },
    population: {
      abilityPages: cache.distinctPages,
      candidatePages: candidatePages.size,
      confirmedPages: mainRows.length,
      confirmedPagesIncludingHealthGrants: rows.length,
      candidatesRejectedAfterReading: candidatePages.size - mainRows.length,
    },
    byKind: {
      candidates: Object.fromEntries([...candidateKinds].map(([k, s]) => [k, s.size])),
      confirmed: Object.fromEntries([...confirmedKinds].map(([k, v]) => [k, v.length])),
    },
    activation: {
      alwaysActive: activation('always-active'),
      conditional: activation('conditional'),
      notStated: activation('not-stated'),
      alwaysActiveEntries: mainRows.filter((r) => r.activation === 'always-active').map((r) => r.key),
      notStatedEntries: mainRows.filter((r) => r.activation === 'not-stated').map((r) => r.key),
    },
    valueReadability: {
      reachable: value('row'),
      hard: value('prose'),
      byReference: value('by-reference'),
      noValue: value('none'),
      byReferenceEntries: mainRows.filter((r) => r.valueSource === 'by-reference').map((r) => r.key),
      noValueEntries: mainRows.filter((r) => r.valueSource === 'none').map((r) => r.key),
    },
    ownership: {
      note:
        'Two halves, never merged. The ROW half reads the defensive leveling row\'s own value ' +
        'expression and is exact. The SENTENCE half reads the whole sentence and is an UPPER ' +
        'BOUND, because a sentence can carry a stat belonging to another clause.',
      fromRows: countOwners(allRefs.filter((r) => r.from === 'row')),
      fromSentences: countOwners(allRefs.filter((r) => r.from === 'sentence')),
      effectsCarryingAnUnresolvedOwner: unresolvedOwner.length,
      effectsCarryingAnUnresolvedOwnerFromARow: unresolvedOwner.filter((r) =>
        r.ownerRefs.some((x) => x.owner === 'unresolved' && x.from === 'row'),
      ).length,
      entries: unresolvedOwner.map((r) => ({
        key: r.key,
        from: r.ownerRefs.some((x) => x.from === 'row') ? 'row' : 'sentence',
        stats: [...new Set(r.ownerRefs.filter((x) => x.owner === 'unresolved').map((x) => x.stat))],
      })),
    },
    adjacentClasses: {
      note:
        'Measured, named, and deliberately kept OUT of the main figure. Each one changes damage ' +
        'somewhere and none of them is a defensive kit effect under the definition above. They ' +
        'are here so the exclusion is visible rather than silent.',
      targetResistanceShred: {
        count: allDefensiveRows(cache).filter((r) => /^(?:armor|magic resistance|resistances) reduction$/i.test(r.label)).length,
        what:
          "abilities with a leveling row that reduces the TARGET's armor or magic resistance. " +
          'Already the engine\'s business: SPECIFICATION §3.6 fixes where reduction sits in the ' +
          'resistance-modifier order. Not defence.',
      },
      attackerDamageDebuff: {
        count: (confirmedKinds.get('attacker-debuff') ?? []).length,
        entries: confirmedKinds.get('attacker-debuff') ?? [],
        what: "the enemy's own attack damage is lowered, so less damage arrives. Indirect defence.",
      },
      targetAmplification: {
        count: REJECTED.filter((r) => r.rejectedAs === 'target-amplification').length,
        entries: REJECTED.filter((r) => r.rejectedAs === 'target-amplification').map((r) => r.key),
        what: 'the enemy is made to take MORE damage. Attacker-side, and engine-relevant.',
      },
      shieldDestruction: {
        count: REJECTED.filter((r) => r.rejectedAs === 'shield-destruction').length,
        entries: REJECTED.filter((r) => r.rejectedAs === 'shield-destruction').map((r) => r.key),
        what: 'destroys enemy shields. Changes damage dealt, not damage taken.',
      },
      untargetabilityOnly: {
        count: 0, // filled from the sweep below
        what:
          'the source states untargetability and says nothing about damage. NOT counted as ' +
          'immunity, because inferring that it prevents damage would be inferring a value the ' +
          'source does not state.',
      },
      healthPoolProperty: {
        count: REJECTED.filter((r) => r.rejectedAs === 'health-pool-property').length,
        entries: REJECTED.filter((r) => r.rejectedAs === 'health-pool-property').map((r) => r.key),
        what:
          'a stated property of the champion\'s own health pool (Pyke cannot gain maximum health; ' +
          "Kled's base health is not improved by bonus health). Changes the survival verdict.",
      },
    },
    rejections: {
      classes: REJECT_CLASSES,
      byClass: Object.fromEntries([...rejectedByClass].map(([k, v]) => [k, v])),
    },
    entries: rows,
  };
}

/**
 * Does any sentence carrying this effect hold a number the EFFECT could be read from?
 *
 * MEASURED BEFORE APPLIED, and the first rule was wrong. "any digit in the sentence" counted
 * Kayle R's "invulnerability for 2.5 seconds" as a readable value: 2.5 is a duration, and this
 * engine models sequence rather than elapsed time (SPECIFICATION §3.2), so a duration is not a
 * value it can read. Durations, ranges, unit distances and cooldowns are stripped first. Under
 * the loose rule 9 effects had no number; under this one the figure is reported alongside.
 */
function hasNumericProse(s: PageSignals, kinds: Kind[]): boolean {
  return s.signals.some((sig) => {
    if (!kinds.includes(sig.kind)) return false;
    // MEASURED, then narrowed. The first stripper removed "for <number>" outright, which deleted
    // "Heals Gwen for 67%" — a value, not a duration — and reported 23 effects as having no number
    // when the true figure under the corrected rule is smaller. Only a number carrying a TIME or
    // DISTANCE unit is stripped now.
    const stripped = sig.sentence
      .replace(/[\d.]+\s*(?:seconds?|minutes?|units?)\b/gi, ' ')
      .replace(/\b(?:for|over|every|within|after)\s+(?:up to\s+)?[\d.]+\s*(?:seconds?|minutes?|units?)\b/gi, ' ');
    return /\d/.test(stripped);
  });
}

/**
 * Is the effect's value stated as a REFERENCE to another quantity rather than as a number?
 *
 * "heals for the same amount", "equal to the health cost", "a portion of the damage". The source
 * states the value; it just does not state it as a figure. That is a third state and it is not
 * the same as having no value, which is what a spell shield or an invulnerability has.
 */
function valueByReference(s: PageSignals, kinds: Kind[]): boolean {
  return s.signals.some(
    (sig) =>
      kinds.includes(sig.kind) &&
      /the same amount|equal to the [a-z ]*cost|a portion of|for the same|of the amount/i.test(sig.sentence),
  );
}

/**
 * THE SWEEPS. Each rejection class from the hand read becomes a mechanical check over all 937
 * pages, so the same mistake is found everywhere rather than fixed on the one page that showed it.
 */
export function sweeps(cache: Awaited<ReturnType<typeof readCache>>) {
  const out = {
    mitigationTooltip: {
      what:
        'Pages where a defensive pattern fires ONLY inside the wiki\'s tooltip phrase ' +
        '"pre-mitigation damage" / "post-mitigation damage" / "after resistances". Never an effect.',
      pages: [] as string[],
    },
    penetrationNotResistance: {
      what:
        'Pages where "armor" or "magic resistance" appears only as "armor penetration", "magic ' +
        'penetration" or "armor reduction" — a different stat, applied to somebody else.',
      pages: [] as string[],
    },
    plainTextErasesTips: {
      what:
        'Pages whose defensive evidence lives ONLY inside a {{tip|…}} template. wikitext.ts\'s ' +
        'plainText() deletes those blocks, so any detector built on it cannot see these pages at ' +
        'all. This is the defect that halved the first run of this census.',
      pages: [] as string[],
    },
    dealtSideNearMiss: {
      what:
        'Pages carrying "take(s) N% reduced damage" where the SUBJECT is the enemy — the Xayah Q ' +
        'shape. Reads exactly like a defensive reduction and is its opposite.',
      pages: [] as string[],
    },
    untargetableOnly: {
      what:
        'Pages stating untargetability with no statement that damage is prevented. Counted here ' +
        'and NOT counted as immunity, because the source does not say it stops damage.',
      pages: [] as string[],
    },
  };

  for (const p of cache.pages) {
    const key = `${p.champion}/${p.slot}/${p.abilityName}`;
    const f = parseFields(p.wikitext);
    const desc = Object.entries(f)
      .filter(([k]) => /^description\d*$/.test(k))
      .map(([, v]) => v)
      .join('\n');

    const s = scanPage(p);
    const sigs = s.signals;
    if (sigs.length > 0 && sigs.every((g) => /(pre|post)-mitigation|after resistances/i.test(g.sentence))) {
      out.mitigationTooltip.pages.push(key);
    }
    const resSigs = sigs.filter((g) => g.kind === 'resistance-grant');
    if (
      resSigs.length > 0 &&
      resSigs.every((g) => /(?:armor|magic resistance)\s+(?:penetration|reduction)/i.test(g.sentence)) &&
      s.statRows.filter((r) => r.kind === 'resistance-grant').length === 0
    ) {
      out.penetrationNotResistance.pages.push(key);
    }
    // Evidence only inside a tip: strip the tips and see whether any defensive word survives.
    const tipless = desc.replace(/\{\{tip\|[^{}]*\}\}/gi, ' ');
    if (
      /\{\{tip\|(shield|heal|invulnerab|untargetable|spell shield)/i.test(desc) &&
      !/(shield|heal|invulnerab|untargetab)/i.test(tipless)
    ) {
      out.plainTextErasesTips.pages.push(key);
    }
    if (/(?:targets?|enemies|units?|champions?)[^.]{0,60}takes?\s+\d+%\s+(?:reduced|less)\s+damage/i.test(desc)) {
      out.dealtSideNearMiss.pages.push(key);
    }
    const untarget = sigs.filter((g) => g.kind === 'immunity' && /untargetab/i.test(g.matched));
    if (untarget.length > 0 && !sigs.some((g) => /invulnerab|stasis|cannot take damage|prevents all incoming/i.test(g.sentence))) {
      out.untargetableOnly.pages.push(key);
    }
  }
  return out;
}

/** Defensive leveling rows across the whole roster, whether or not a person confirmed them. */
export function allDefensiveRows(cache: Awaited<ReturnType<typeof readCache>>) {
  const rows: Array<{ key: string; label: string; value: string; kind: Kind }> = [];
  for (const p of cache.pages) {
    const s = scanPage(p);
    for (const r of s.statRows) {
      rows.push({ key: s.key, label: r.label, value: r.value, kind: r.kind });
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith('defensive-census.ts')) {
  const cache = await readCache();
  const base = main(cache);
  const sw = sweeps(cache);
  base.adjacentClasses.untargetabilityOnly.count = sw.untargetableOnly.pages.length;
  const census = { ...base, sweeps: sw };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify(census, null, 1)}\n`);

  const c = census;
  console.log('\n=== DEFENSIVE KIT EFFECT CENSUS ===');
  console.log(
    `coverage: ${c.coverage.pagesInCache} distinct ability pages; ${c.coverage.fetchChunksFailed} fetch chunk(s) failed; ` +
      `${c.coverage.titlesMissing} requested titles do not exist; complete=${c.coverage.complete}`,
  );
  if (c.integrity.handWrittenKeysNotFoundOnAnyPage.length > 0) {
    console.log('\n!!! HAND-WRITTEN KEYS THAT MATCH NO PAGE (each one silently drops an effect):');
    for (const k of c.integrity.handWrittenKeysNotFoundOnAnyPage) console.log(`   ${k}`);
  }
  console.log(
    `\npopulation: ${c.population.candidatePages} candidate pages -> ${c.population.confirmedPages} confirmed ` +
      `(${c.population.candidatesRejectedAfterReading} rejected on reading)`,
  );
  console.log('\nby kind (candidate -> confirmed):');
  for (const k of Object.keys(KINDS) as Kind[]) {
    console.log(
      `  ${k.padEnd(26)} ${String(c.byKind.candidates[k] ?? 0).padStart(4)} -> ${String(c.byKind.confirmed[k] ?? 0).padStart(4)}`,
    );
  }
  console.log(
    `\nactivation: always-active ${c.activation.alwaysActive} | conditional ${c.activation.conditional} | not stated ${c.activation.notStated}`,
  );
  console.log(
    `value: reachable ${c.valueReadability.reachable} | hard ${c.valueReadability.hard} | ` +
      `stated by reference ${c.valueReadability.byReference} | no value at all ${c.valueReadability.noValue}`,
  );
  const orow = c.ownership.fromRows;
  const osen = c.ownership.fromSentences;
  console.log(
    `ownership, from leveling rows (exact): ${orow.references} refs — caster ${orow.caster}, target ` +
      `${orow.target}, UNRESOLVED ${orow.unresolved}`,
  );
  console.log(
    `ownership, from sentences (upper bound): ${osen.references} refs — caster ${osen.caster}, target ` +
      `${osen.target}, UNRESOLVED ${osen.unresolved}`,
  );
  console.log(
    `effects carrying at least one unresolved owner: ${c.ownership.effectsCarryingAnUnresolvedOwner} ` +
      `(${c.ownership.effectsCarryingAnUnresolvedOwnerFromARow} of them from a leveling row)`,
  );
  console.log('\nsweeps over all 937 pages:');
  for (const [k, v] of Object.entries(census.sweeps)) {
    console.log(`  ${k.padEnd(26)} ${String((v as { pages: string[] }).pages.length).padStart(4)} pages`);
  }
  console.log(`\nwrote ${OUT}`);
}
