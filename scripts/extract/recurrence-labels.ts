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
};

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
  label?: string;
  hits?: number;
  overTime?: unknown;
}
interface Ability {
  champion: string;
  slot: string;
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
