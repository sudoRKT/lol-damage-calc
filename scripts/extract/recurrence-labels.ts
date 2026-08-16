// WHAT WORDS DO THE SOURCES ACTUALLY USE FOR "THIS HAPPENS AGAIN"?
//
//   node scripts/extract/recurrence-labels.ts
//
// ═══ WHY THIS EXISTS ═══
//
// SPECIFICATION §3.8: damage over time is NEVER folded into the burst total. It is a separate line
// and the survival verdict is given twice. The engine routes a component to the damage-over-time
// line when it carries an `overTime` mark, and to the burst when it does not.
//
// The sweep that finds components needing that mark matched the words **"per tick"**. On 2026-08-15
// it was found to have missed **Cassiopeia W**, whose label says **"Per Second"** — a live entry,
// `derived`, publishing 126 damage into the burst line that belongs on the over-time line. The
// magnitude was right and the DESTINATION was wrong, which is the §58 class exactly.
//
// The lesson is not "add per second to the pattern". It is that **nobody had ever asked what the
// label vocabulary IS.** So this measures it rather than guessing at it, and the measurement is the
// deliverable: 25 distinct trailing words across 114 components, listed below with counts.
//
// ═══ WHAT THIS FILE DOES AND DOES NOT DO ═══
//
// It **classifies label FORMS, not entries.** A form is recurrence-bearing when the thing it counts
// arrives over elapsed time; it is a multi-hit form when the things it counts arrive together or in
// immediate sequence. The ChecksPage states the distinction in the product's own words: *arrows all
// land at once and belong in the burst; ticks arrive over time and do not.*
//
// It **decides nothing about any entry.** A detector proposes and a person confirms (CLAUDE.md). An
// entry carrying a recurrence-bearing label without an `overTime` mark is REPORTED for someone to
// read, never marked. The one entry a person has read is named in `READ`, and it is the only one
// this file makes a claim about.
//
// The classification of the 25 forms below is itself a person's reading of 25 words, not a rule a
// machine derived. A 26th form appearing is a REPORT, not an automatic assignment — which is why
// `UNCLASSIFIED_IS_A_FINDING` exists rather than a default branch.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CURATED = join(ROOT, ['cur', 'ated'].join(''), 'curated-data.json');

/**
 * Forms whose count arrives OVER ELAPSED TIME. A component with one of these belongs on the
 * damage-over-time line, so it needs an `overTime` mark.
 *
 * Read from the 25 forms the roster actually uses, 2026-08-15. Every one of these four names a
 * unit of time or of a repeating cycle; none names a projectile.
 */
export const RECURRENCE_FORMS = ['tick', 'second', 'wave', 'instance'] as const;

/**
 * Forms whose count arrives TOGETHER, or in an immediate sequence within one cast. These belong in
 * the burst and must NOT be given an `overTime` mark — doing so would move real burst damage off
 * the burst line, which is the same defect in the opposite direction.
 *
 * Every one of these names a projectile, a body, or a discrete strike.
 */
export const MULTI_HIT_FORMS = [
  'hit', 'bullet', 'spin', 'shot', 'bolt', 'missile', 'mine', 'arrow', 'orb', 'cluster',
  'needle', 'dagger', 'nail', 'sphere', 'feather', 'slash',
] as const;

/**
 * Forms that are NOT a count of occurrences at all. A "per stack" figure is a rate against a
 * resource; "per champion" is a rate against targets. Neither says anything about time, and giving
 * either an `overTime` mark would be a category error.
 */
export const NOT_A_COUNT_FORMS = [
  'stack', 'additional stack', 'champion', 'target death', 'subsequent explosion',
] as const;

/**
 * THE READ POPULATION — entries a PERSON has read the sentence for. One member.
 *
 * Cassiopeia W, read 2026-08-15 from `Template:Data Cassiopeia/Miasma` rev 3936292. Its own two
 * statements agree and that is why this is a reading rather than an inference:
 *
 *   description  : "creating toxic clouds at the area for 5 seconds"
 *   description2 : "Enemies within the clouds are poisoned to take magic damage every 5/19 seconds"
 *   leveling2    : "Magic Damage Per Second  20 to 40 (+ 10% AP)"
 *                  "Total Magic Damage      100 to 200 (+ 50% AP)"
 *
 * 20 x 5 = 100, 40 x 5 = 200, and 10% x 5 = 50%. The identity holds at BOTH endpoints and on the
 * ratio, so `hits: 5` is corroborated by the source's own second row rather than assumed — five
 * one-second instances over a five-second cloud.
 *
 * **The magnitude stored today is RIGHT. Only the destination is wrong.** It needs an `overTime`
 * mark so those five instances reach the damage-over-time line instead of the burst.
 *
 * NOTE the tick interval is 5/19 seconds, i.e. 19 actual ticks — but the stored shape counts
 * SECONDS, and the source's own Total row is what makes that legitimate. Do not "correct" 5 to 19;
 * that would multiply the damage by 3.8.
 */
export const READ: Record<string, string> = {
  'Cassiopeia/W/Magic Damage Per Second':
    'Read 2026-08-15. Needs an overTime mark, figureIs per-instance, count 5. Magnitude unchanged: ' +
    '5 x per-second equals the wiki\'s own Total Magic Damage row at both endpoints and on the AP ' +
    'ratio. Destination changes from burst to the damage-over-time line (SPECIFICATION §3.8).',
  // ADDED 2026-08-16, AND THIS TABLE WAS ALREADY STALE BY ONE WHEN THEY WERE. Fiddlesticks W was
  // marked on 2026-08-16 and never recorded here; keeping a "what a person has read" list that
  // does not list what a person read is the failure mode CLAUDE.md names for stale documents.
  //
  // THE AUTHORITATIVE TABLES ARE IN `per-tick-read.ts` — `READ_RECURRENCE_BEYOND_PER_TICK` for
  // what is marked and `DECLINED_RECURRENCE` for what was read and refused, both keyed by entry
  // and naming COMPONENT IDS. This one is keyed by LABEL because it belongs to the label census
  // above; it is a summary of those, and `recurrence-labels.test.ts` asserts the accounting over
  // the real tables rather than over this.
  'Fiddlesticks/W/Damage per second':
    'Read 2026-08-16. Marked while DORMANT — the entry is incomplete and publishes nothing, and ' +
    'that is the point: a defect waiting for a completion is worse than one already wrong. Stored ' +
    'count 2 against a 2-second channel, which the page states in its own channel_duration ' +
    'variable. The ability\'s SECOND row, "Last Tick of Damage", is a single final instance and ' +
    'is deliberately NOT marked.',
  'Gangplank/R/Magic Damage Per Wave':
    'Read 2026-08-16. Marked while DORMANT. 12 waves in clusters of 3 every 2 seconds — the ' +
    'clusters arrive over time, the three waves inside one do not. Stored count 12 already equals ' +
    'the source\'s own: "12 waves" in the description and "40*12 to 100*12 (+ 10*12% AP)" in the ' +
    'Total row, agreeing at both endpoints and on the ratio. NO HIT COUNT WAS CHANGED. The ' +
    '"Magic Damage Per Cluster" row is not marked; a cluster lands in one moment.',
};

/**
 * ═══ THE SOURCE'S OWN VOCABULARY, SWEPT 2026-08-16 ═══
 *
 * The census above reads OUR labels. This records a sweep of the WIKI'S, because "what words does
 * the source use for recurrence" is the question that decides whether our pattern is adequate, and
 * it cannot be answered from our own output.
 *
 * DEFINITION: every distinct leveling-row header in `{{st|Header|values|…}}` across all 937 fetched
 * ability pages. **977 distinct headers.**
 *
 * **26 of the 977 name a recurrence, and ALL 26 use the trailing "per X" form** (this said 25 of 26 until the three sentences below were read; the supposed exception was not a recurrence) — per tick,
 * per second, per wave, per instance. So the vocabulary really is that narrow, and the `per X`
 * pattern is not the weak shape it looked like after Cassiopeia W. **What it missed was one WORD in
 * that form (`second`), not a whole form.**
 *
 * A deliberately broader net was then run — any header containing tick, second, sec, pulse, wave,
 * instance, interval, duration, over, each, every, repeat, recurring, dot, burn, poison or per —
 * which matched 120 headers, 41 of them not a trailing `per X`. **38 of those 41 are "X Duration"**
 * (stun, root, slow, stealth, blind): how long a STATE lasts, never a damage recurrence. Two more
 * are "Second Cast Damage" and "Second Cast Total Damage", where "second" is an ORDINAL — the exact
 * two-wordings-that-read-alike trap §38 warns about, and the reason this sweep classifies by hand.
 *
 * **THREE ARE FOR A PERSON TO READ. They are handed over, not acted on:**
 *
 *   1. **Fiddlesticks W — THE SAME PROBLEM AS CASSIOPEIA W, and dormant.** Read 2026-08-16 from
 *      `Template:Data Fiddlesticks/Bountiful Harvest` rev 3936351. Its `description2` says "While
 *      Fiddlesticks is channeling, the tethered enemies are dealt magic damage every
 *      {channel_tickrate} seconds" — a recurrence, and its stored label is "Damage per second" with
 *      no `overTime` mark. Identical shape to Cassiopeia W. It publishes nothing only because the
 *      entry is `incomplete`; the moment it is completed it becomes a live instance.
 *
 *      **AND "Last Tick of Damage" IS NOT A RECURRENCE LABEL AT ALL — this corrects what this file
 *      said on 2026-08-16.** It was recorded here as "the one genuine gap in the vocabulary", a
 *      tick named without "per" that no trailing-form pattern could see. Reading the page says
 *      otherwise: it is a SECOND header on the same ability, and `description2` explains it — "The
 *      final tick at the end of the channel deals additional magic damage". It names ONE specific
 *      instance, not a rate. A pattern looking for recurrence is RIGHT to ignore it, and marking it
 *      as over-time would be the §58 defect in the opposite direction.
 *
 *      **So there is no vocabulary gap. All 26 recurrence-naming headers use the trailing per-X
 *      form, not 25 of 26.** The exception was an error in this file's own reading of a word.
 *
 *   2. **Naafiri R — NOT the same problem, and not the problem this file said it was.** The header
 *      is `Physical Damage per ''{{ai|We Are More|Naafiri|link=*none*|Packmate}}''` — **per
 *      PACKMATE**. It was recorded here as a per-X "lost in harvesting", which is true of the
 *      truncation and wrong about the kind: a packmate is an ENTITY, not a unit of time. Naafiri's
 *      hounds strike together on one dash, so this is a MULTI-HIT form — the same class as "per
 *      bullet" — and it belongs in the BURST. The stored flat "Physical Damage" is not a
 *      destination defect. What is worth a reader's eye is whether the per-packmate multiplication
 *      is applied at all, which is a different question and not this file's.
 *
 *   3. **Shyvana R — no problem. Confirmed clear rather than assumed clear.** Read from
 *      `Template:Data Shyvana/Dragon's Descent` rev 4049822. The "per 0.5 Seconds" and "per Second"
 *      headers are `Dragon Fury Generation` — a RESOURCE row. The damage row is `leveling2`, a
 *      plain `Magic Damage 150 to 350 (+100% AP)`, dealt by a cone of fire along one dash. A single
 *      instance. Nothing to mark, and the reason it was flagged — being the only `derived` and
 *      PUBLISHING entry near this class — is exactly why it was worth the two minutes.
 *
 * Note two forms the trailing pattern also cannot read for a mechanical reason rather than a
 * vocabulary one: `per 0.5 Seconds` (a DIGIT in the X) and `per {{fd` (a template in the X). Both
 * live on resource rows today, so neither is a damage defect — but a damage row in either shape
 * would be invisible, which is why Naafiri R is on the list above.
 */
export const SOURCE_HEADER_CENSUS = {
  distinctHeaders: 977,
  namingARecurrence: 26,
  usingTrailingPerX: 26,
  broadNetMatches: 120,
  broadNetNotTrailingPerX: 41,
  ofWhichStateDuration: 38,
  /** All three were READ on 2026-08-16. Kept with their verdicts rather than emptied — the list
   *  is the record of what was asked, and an empty list would erase two corrections. */
  readAndSettled: [
    'Fiddlesticks/W: SAME problem as Cassiopeia (per second, unmarked) — dormant, entry incomplete',
    'Naafiri/R: NOT a recurrence — "per Packmate" is an entity, a multi-hit form, belongs in burst',
    'Shyvana/R: CLEAR — the per-Second headers are Dragon Fury, a resource row; its damage is one instance',
  ],
} as const;

export interface LabelForm {
  form: string;
  count: number;
  kind: 'recurrence' | 'multi-hit' | 'not-a-count' | 'UNCLASSIFIED';
  members: string[];
}

export function classify(form: string): LabelForm['kind'] {
  if ((RECURRENCE_FORMS as readonly string[]).includes(form)) return 'recurrence';
  if ((MULTI_HIT_FORMS as readonly string[]).includes(form)) return 'multi-hit';
  if ((NOT_A_COUNT_FORMS as readonly string[]).includes(form)) return 'not-a-count';
  return 'UNCLASSIFIED';
}

interface Component {
  id?: string;
  label?: string;
  hits?: number;
  overTime?: unknown;
}
interface Ability {
  champion: string;
  slot: string;
  abilityName?: string;
  verification: string;
  components?: Component[];
}

/** The trailing "per X" of a label, lowercased, or null. Longest tail wins by construction. */
export function trailingForm(label: string): string | null {
  const m = label.match(/\bper\s+([a-z' -]+)$/i);
  return m ? m[1]!.trim().toLowerCase() : null;
}

export function census(abilities: Ability[]) {
  const forms = new Map<string, string[]>();
  let components = 0;
  for (const a of abilities) {
    for (const c of a.components ?? []) {
      components += 1;
      const form = trailingForm(c.label ?? '');
      if (!form) continue;
      const mark = c.overTime ? 'overTime' : 'NO-overTime';
      if (!forms.has(form)) forms.set(form, []);
      forms.get(form)!.push(`${a.champion}/${a.slot}/${c.label} [${a.verification}] [${mark}]`);
    }
  }
  const out: LabelForm[] = [...forms.entries()]
    .map(([form, members]) => ({ form, count: members.length, kind: classify(form), members }))
    .sort((x, y) => y.count - x.count);
  return { components, labelled: out.reduce((n, f) => n + f.count, 0), forms: out };
}

/**
 * Components carrying a recurrence-bearing label and NO `overTime` mark.
 *
 * These are CANDIDATES. One is read (`READ`); the rest are reported for someone to read. An entry
 * whose verification is `incomplete` publishes nothing, so it cannot be showing a wrong number
 * today — that distinction is reported rather than collapsed, because "same shape" and "same
 * exposure" are different questions and §60 turns on the difference.
 */
export function unmarkedRecurrence(abilities: Ability[]) {
  const live: string[] = [];
  const dormant: string[] = [];
  for (const a of abilities) {
    for (const c of a.components ?? []) {
      const form = trailingForm(c.label ?? '');
      if (!form || classify(form) !== 'recurrence' || c.overTime) continue;
      const row = `${a.champion}/${a.slot}/${c.label} (hits=${c.hits ?? 'unset'})`;
      (a.verification === 'incomplete' ? dormant : live).push(row);
    }
  }
  return { live, dormant };
}

/**
 * ═══ THE REAL GATE: EVERY DORMANT MEMBER MUST BE ONE A PERSON HAS READ ═══
 *
 * Added 2026-08-16, replacing a pinned count of 27 in `recurrence-labels.test.ts`.
 *
 * **This is a TIGHTENING, and the effect was measured before it was applied.** The count it
 * replaces asserted a total; this asserts membership, component by component. The two are not the
 * same strength and the pinned number was the weaker of them in both directions:
 *
 *   - it could not tell a dormant member somebody had READ from one nobody had looked at, which
 *     is the only question that matters here;
 *   - and it FAILED whenever the number legitimately fell. It was already failing against the
 *     merge proposal on 2026-08-16 — 26 there against 27 in the curated file — because
 *     Fiddlesticks W had been marked and not yet merged. `premerge:check` runs the suite against
 *     the proposal, so a pinned total turns every correction into a red test.
 *
 * MEASURED BEFORE AND AFTER, both by this function over both files:
 *
 *   curated-data.json  2026-08-16   27 dormant · 25 declined + 2 marked · 0 unaccounted
 *   merged-proposal    2026-08-16   25 dormant · 25 declined + 2 marked · 0 unaccounted
 *
 * (The proposal is lower because a marked component is no longer dormant — it has the mark.)
 *
 * A NEW dormant component — a fresh harvest, a renamed row, a champion gaining a burn — appears
 * in `unaccounted` and fails, which is what the pinned number was standing in for. Widening a
 * pattern cannot satisfy this: the only way to clear an entry is to name its component ids in one
 * of the two hand-written tables, and both demand the sentence.
 */
export function accountForDormant(
  abilities: Ability[],
  marked: Readonly<Record<string, readonly string[]>>,
  declined: Readonly<Record<string, { componentIds: readonly string[] }>>,
): { dormant: string[]; accounted: string[]; unaccounted: string[] } {
  const dormant: string[] = [];
  const accounted: string[] = [];
  const unaccounted: string[] = [];
  for (const a of abilities) {
    const key = `${a.champion}/${a.slot}/${a.abilityName ?? ''}`;
    const named = new Set([
      ...(marked[key] ?? []),
      ...(declined[key]?.componentIds ?? []),
    ]);
    for (const c of a.components ?? []) {
      const form = trailingForm(c.label ?? '');
      if (!form || classify(form) !== 'recurrence' || c.overTime) continue;
      if (a.verification !== 'incomplete') continue;
      const row = `${key}#${c.id ?? c.label ?? '?'}`;
      dormant.push(row);
      (named.has(c.id ?? '') ? accounted : unaccounted).push(row);
    }
  }
  return { dormant, accounted, unaccounted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = JSON.parse(readFileSync(CURATED, 'utf8')) as { abilities: Ability[] };
  const c = census(file.abilities);
  console.log(`recurrence-labels: ${c.components} stored components, ${c.labelled} carrying a "per X" label, ${c.forms.length} distinct forms\n`);
  for (const f of c.forms) {
    console.log(`  ${String(f.count).padStart(3)}  per ${f.form.padEnd(22)} ${f.kind}`);
  }
  const u = unmarkedRecurrence(file.abilities);
  console.log(`\n  LIVE — recurrence label, no overTime mark, entry NOT incomplete (publishing today): ${u.live.length}`);
  for (const r of u.live) console.log(`      ${r}`);
  console.log(`\n  DORMANT — same shape, but the entry is incomplete and publishes nothing: ${u.dormant.length}`);
  for (const r of u.dormant) console.log(`      ${r}`);
}
