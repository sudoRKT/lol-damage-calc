/**
 * DOES A TICK OR HIT COUNT EVER CHANGE WITH ABILITY RANK? — THE SWEEP (2026-08-16)
 *
 * `AbilityComponent.hits` is ONE NUMBER PER COMPONENT. `VariableHitCount`'s ceiling
 * (`maxInstances` / `maxAdditional`) is likewise one number per component. Neither can express a
 * count that changes when the ability is ranked up.
 *
 * TWO MEMBERS ARE KNOWN AND THEY ARE THE CALIBRATION. A method that does not find both is not
 * measuring the right thing:
 *
 *   - **Aurelion Sol Q** — the count is in PROSE, in a rank-specific description field:
 *     `description5 = At rank 5, ''Breath of Light's'' channel duration is increased to 160
 *     seconds.` 26 ticks at ranks 1-4, 1,280 at rank 5.
 *   - **Miss Fortune R** — the count is a RANGED VALUE IN THE LEVELING ROW ITSELF:
 *     `{{st|Total Waves|{{ap|14 to 18}}|Maximum Total Physical Damage|{{ap|20*14 to 40*18}} ...}}`
 *     and `{{st|Wave Interval Time|{{ap|2.85/(14 to 18)|round=4}} seconds}}`.
 *
 * They are DIFFERENT SHAPES, which is itself the finding about how hard this is to detect: no one
 * signal reaches both, so the sweep runs six and unions them.
 *
 * A PROXY ALREADY DISPROVED, recorded so it is not reused: a structured rank-varying `duration=`
 * field fires ZERO times across all 82 entries that store a hit count (DATA-SOURCES, the Aurelion
 * Sol Q closure record in `per-tick-read.ts`).
 *
 * THIS FILE IS A DETECTOR AND NOTHING ELSE. It stores nothing, changes no count, and writes no
 * entry. Every candidate it emits carries the verbatim source fragment it fired on, so a person
 * can read the sentence — which is the only thing that may put a member in the population
 * (CLAUDE.md: a detector proposes, a person confirms).
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
const CACHE = join(ROOT, 'build/proposed-curated/ability-wikitext.json');

export interface CachedPage {
  champion: string;
  slot: string;
  abilityName: string;
  revid: number;
  wikitext: string;
}

export interface Candidate {
  key: string;
  /** Which of the six signals fired. A page may fire several. */
  signals: string[];
  /** The verbatim source fragment each signal fired on, so a person can read it. */
  evidence: { signal: string; verbatim: string }[];
}

export async function loadPages(): Promise<CachedPage[]> {
  const raw = JSON.parse(await readFile(CACHE, 'utf8')) as { pages: CachedPage[] };
  return raw.pages;
}

/* ------------------------------------------------------------------ template scanning */

/** Every `{{...}}` template in the text, brace-matched, outermost first. */
export function templates(text: string, name: string): string[] {
  const out: string[] = [];
  const open = `{{${name}|`;
  for (let i = 0; i < text.length; i++) {
    if (!text.startsWith(open, i)) continue;
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      if (text.startsWith('{{', j)) {
        depth++;
        j++;
      } else if (text.startsWith('}}', j)) {
        depth--;
        j++;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(i, j + 1));
    i = j;
  }
  return out;
}

/** Split a template body on top-level `|`, ignoring pipes inside nested braces or brackets. */
export function splitArgs(tpl: string): string[] {
  const body = tpl.replace(/^\{\{/, '').replace(/\}\}$/, '');
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{{', i) || body.startsWith('[[', i)) {
      depth++;
      cur += body.slice(i, i + 2);
      i++;
      continue;
    }
    if (body.startsWith('}}', i) || body.startsWith(']]', i)) {
      depth--;
      cur += body.slice(i, i + 2);
      i++;
      continue;
    }
    if (body[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += body[i];
  }
  parts.push(cur);
  return parts;
}

/** The named fields of an ability-data template body (`|leveling = ...`). */
export function fields(wikitext: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = splitArgs(`{{${wikitext.replace(/^\{\{/, '').replace(/\}\}\s*$/, '')}}}`);
  for (const p of parts) {
    const m = /^\s*([a-z0-9 _]+?)\s*=\s*([\s\S]*)$/i.exec(p);
    if (m) map.set(m[1].trim().toLowerCase(), m[2]);
  }
  return map;
}

/* ------------------------------------------------------------------ signal 1 */

/**
 * S1 — A LEVELING ROW WHOSE OWN VALUE IS A COUNT, AND THE COUNT IS A RANGE.
 *
 * `{{st|Total Waves|{{ap|14 to 18}}|...}}`. The label must name something countable and the value
 * must be a bare rank progression whose two endpoints differ. Percentages, seconds and anything
 * carrying a ratio are excluded: those are damage or timing, not a count.
 */
const COUNT_LABEL =
  /\b(waves?|ticks?|hits?|strikes?|bolts?|instances?|missiles?|projectiles?|rockets?|bounces?|explosions?|shots?|bullets?|slashes?|spins?|casts?|charges?|stacks? of|number of|arrows?|daggers?|feathers?|blades?|pellets?|mines?|orbs?|swipes?|attacks?|lashes?|strikes)\b/i;

const BARE_RANGE = /^\s*\{\{ap\|\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*(?:\|[^{}]*)?\}\}\s*$/i;

export function signal1(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  for (const st of templates(wikitext, 'st')) {
    const args = splitArgs(st).slice(1);
    for (let i = 0; i + 1 < args.length; i += 2) {
      const label = args[i];
      const value = args[i + 1];
      if (!COUNT_LABEL.test(label)) continue;
      const m = BARE_RANGE.exec(value);
      if (!m) continue;
      if (Number(m[1]) === Number(m[2])) continue;
      hits.push({ verbatim: `{{st|${label}|${value}}}`.replace(/\s+/g, ' ').trim() });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 2 */

/**
 * S2 — AN ASYMMETRIC MULTIPLIER ACROSS A RANK PROGRESSION.
 *
 * In `{{ap|A to B}}` the left expression is rank 1 and the right is max rank. When a whole-ability
 * total is written as `per-instance * N`, an N that DIFFERS between the two ends says outright
 * that the number of instances changes with rank: `{{ap|20*14 to 40*18}}`.
 *
 * Deliberately narrow. It fires only when the same operator appears on both sides with different
 * operands, so `{{ap|45*0.5 to 105*0.5}}` (a flat 50%) and `{{ap|(45/8)*26 to (...)*26}}` (Aurelion
 * Sol Q's own fixed 26) both stay silent.
 */
export function signal2(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  for (const ap of templates(wikitext, 'ap')) {
    const inner = splitArgs(ap)[1];
    if (!inner || !/\bto\b/.test(inner)) continue;
    const halves = inner.split(/\s+to\s+/);
    if (halves.length !== 2) continue;
    const ops = (side: string, op: string) =>
      [...side.matchAll(new RegExp(`\\${op}\\s*(\\d+(?:\\.\\d+)?)`, 'g'))].map((m) => m[1]);
    for (const op of ['*', '/']) {
      const l = ops(halves[0], op);
      const r = ops(halves[1], op);
      if (l.length === 0 || l.length !== r.length) continue;
      if (l.some((v, i) => v !== r[i])) {
        hits.push({ verbatim: ap.replace(/\s+/g, ' ').trim() });
        break;
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 3 */

/**
 * S3 — RANK-CONDITIONAL PROSE THAT MOVES A DURATION, AN INTERVAL OR A COUNT.
 *
 * This is the signal Aurelion Sol Q fires on: `At rank 5, Breath of Light's channel duration is
 * increased to 160 seconds.` It is the same shape the earlier closure sweep ran, widened by one
 * word — it now also fires on a rank-conditional sentence that moves a COUNT rather than only a
 * duration or an interval, because Miss Fortune R proves a count can be stated directly.
 *
 * WIDENING A DETECTOR IS ONLY SAFE BECAUSE NOTHING HERE IS STORED. Every fire is read.
 */
const RANK_CONDITIONAL =
  /\b(at|from|on|per|each|beyond|upon reaching)\s+(rank|level)\s*\d|\bat\s+(max|maximum|final|last)\s+rank\b|\brank\s*\d\s*[,:]|\bper\s+(rank|level)\b|\branks?\s+\d\s*(?:-|–|to)\s*\d/i;
const MOVES_A_COUNT =
  /\b(duration|interval|seconds?|tick|ticks|waves?|hits?|strikes?|instances?|times|charges?|missiles?|projectiles?|bolts?|shots?|casts?|bounces?|channel)\b/i;

export function signal3(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  const f = fields(wikitext);
  for (const [name, body] of f) {
    if (!/^(description|blurb|notes|leveling)/.test(name)) continue;
    for (const sentence of body.split(/(?<=\.)\s+|\n\*+\s*/)) {
      if (!RANK_CONDITIONAL.test(sentence)) continue;
      if (!MOVES_A_COUNT.test(sentence)) continue;
      hits.push({ verbatim: `${name} :: ${sentence.replace(/\s+/g, ' ').trim().slice(0, 300)}` });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 4 */

/**
 * S4 — A LEVELING-ROW LABEL QUALIFIED BY A RANK RANGE.
 *
 * Aurelion Sol Q labels its own total row `{{tt|Total Maximum Magic Damage|Ranks 1-4}}` — the page
 * saying in its own markup that the row does not apply at every rank. A total that only holds for
 * some ranks is a count that changes at the others.
 */
export function signal4(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  for (const st of templates(wikitext, 'st')) {
    const args = splitArgs(st).slice(1);
    for (let i = 0; i < args.length; i += 2) {
      const label = args[i] ?? '';
      if (/\branks?\b/i.test(label)) {
        hits.push({ verbatim: label.replace(/\s+/g, ' ').trim().slice(0, 200) });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 5 */

/**
 * S5 — A RANK-VARYING DURATION BESIDE A FIXED INTERVAL.
 *
 * If a burn lasts `{{ap|3 to 5}}` seconds and ticks every 0.5 seconds, its tick count is 6 at rank
 * 1 and 10 at max — a rank-varying count nobody has to state in words. This is the class that
 * could be large, and it is measured rather than assumed either way.
 */
const RANGED_SECONDS = /\{\{ap\|\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)[^{}]*\}\}\s*seconds?/gi;
const STATES_INTERVAL =
  /\bevery\s+(?:\{\{[a-z]+\|)?\s*[\d.]+\s*(?:\|[^{}]*)?\}?\}?\s*seconds?|\bevery second\b/i;

export function signal5(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  if (!STATES_INTERVAL.test(wikitext)) return hits;
  const interval = STATES_INTERVAL.exec(wikitext)?.[0] ?? '';
  for (const m of wikitext.matchAll(RANGED_SECONDS)) {
    if (Number(m[1]) === Number(m[2])) continue;
    // Give the reader the surrounding text: a duration alone cannot be judged.
    const at = m.index ?? 0;
    const around = wikitext.slice(Math.max(0, at - 160), at + m[0].length + 40);
    hits.push({
      verbatim: `interval "${interval.replace(/\s+/g, ' ')}" ... ranged seconds in: ...${around.replace(/\s+/g, ' ').trim()}...`,
    });
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 6 */

/**
 * S6 — AN INTERVAL EXPRESSED AS A DIVISION BY A RANGED VALUE.
 *
 * `{{ap|2.85/(14 to 18)|round=4}}` — the page dividing a fixed duration by a rank-varying count to
 * get the gap between instances. The ranged denominator IS the count.
 */
const DIVIDED_BY_RANGE = /\/\s*\(\s*\d+(?:\.\d+)?\s*to\s*\d+(?:\.\d+)?\s*\)/i;

export function signal6(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  for (const ap of templates(wikitext, 'ap')) {
    if (DIVIDED_BY_RANGE.test(ap)) hits.push({ verbatim: ap.replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 7 */

/**
 * S7 — AN EXPLICIT PER-RANK LIST WHOSE MULTIPLIERS DIFFER RANK TO RANK.
 *
 * S2 only reads the two-ended `A to B` form. Plenty of pages write every rank out instead —
 * Akshan R's `{{ap|5*25|6*35|7*45}}` and Mel Q's `{{ap|5*5+60|7*6+85|9*7+110|11*8+135|13*9+160}}`
 * — and in both the leading operand IS the number of instances, changing at every rank.
 */
export function signal7(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  for (const ap of templates(wikitext, 'ap')) {
    const args = splitArgs(ap).slice(1).filter((a) => !/=/.test(a));
    if (args.length < 3) continue;
    if (args.some((a) => /\bto\b|\{\{/.test(a))) continue;
    const mults = args.map((a) => [...a.matchAll(/\*\s*(\d+(?:\.\d+)?)/g)].map((m) => m[1]).join(','));
    if (mults.some((m) => m === '')) continue;
    if (new Set(mults).size > 1) hits.push({ verbatim: ap.replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

/* ------------------------------------------------------------------ signal 8 */

/**
 * S8 — A PRINTED TOTAL THAT IS A DIFFERENT WHOLE MULTIPLE OF ITS OWN PER-INSTANCE ROW AT EACH END.
 *
 * The arithmetic version of S2 and S7, for pages that print evaluated numbers rather than the
 * multiplication: `per Wave 20 to 40` beside `Total 280 to 720` divides to 14 and 18. This is the
 * signal that does not depend on the wiki's editors having written the product out longhand, and
 * it is the one most likely to reach a member the other seven miss.
 */
export function signal8(wikitext: string): { verbatim: string }[] {
  const hits: { verbatim: string }[] = [];
  /**
   * The LEADING rank progression of a value, ignoring the `{{as|(+ 60% AD)}}` ratio blocks that
   * follow it. Written this way after the strict form measured NOTHING: requiring the whole value
   * to be the progression found 0 per-instance/total pairs in 937 pages, because a total row
   * almost always carries its ratios behind the base. A signal with an empty denominator has not
   * looked, and reporting its zero as evidence would be a count whose name outran its definition.
   */
  const asRange = (v: string) => {
    const m = /^\s*\{\{ap\|\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*(?:\|[^{}]*)?\}\}/i.exec(v);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  for (const st of templates(wikitext, 'st')) {
    const args = splitArgs(st).slice(1);
    const rows: { label: string; lo: number; hi: number }[] = [];
    for (let i = 0; i + 1 < args.length; i += 2) {
      const r = asRange(args[i + 1]);
      if (r && r[0] > 0 && r[1] > 0) rows.push({ label: args[i].trim(), lo: r[0], hi: r[1] });
    }
    for (const per of rows) {
      for (const tot of rows) {
        if (per === tot) continue;
        if (!/total|maximum/i.test(tot.label) || /total|maximum/i.test(per.label)) continue;
        const nLo = tot.lo / per.lo;
        const nHi = tot.hi / per.hi;
        const whole = (n: number) => n >= 2 && Math.abs(n - Math.round(n)) < 0.02;
        if (!whole(nLo) || !whole(nHi)) continue;
        if (Math.round(nLo) === Math.round(nHi)) continue;
        hits.push({
          verbatim: `${per.label} ${per.lo} to ${per.hi} | ${tot.label} ${tot.lo} to ${tot.hi} => ${Math.round(nLo)} instances at rank 1, ${Math.round(nHi)} at max rank`,
        });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ the sweep */

export const SIGNALS: { name: string; run: (w: string) => { verbatim: string }[] }[] = [
  { name: 'S1 ranged-count-row', run: signal1 },
  { name: 'S2 asymmetric-multiplier', run: signal2 },
  { name: 'S3 rank-conditional-prose', run: signal3 },
  { name: 'S4 rank-qualified-label', run: signal4 },
  { name: 'S5 ranged-duration-with-interval', run: signal5 },
  { name: 'S6 interval-divided-by-range', run: signal6 },
  { name: 'S7 explicit-per-rank-multipliers', run: signal7 },
  { name: 'S8 total-over-per-instance-differs', run: signal8 },
];

export function sweep(pages: CachedPage[]): Candidate[] {
  const out: Candidate[] = [];
  for (const p of pages) {
    const evidence: { signal: string; verbatim: string }[] = [];
    for (const s of SIGNALS) {
      for (const h of s.run(p.wikitext)) evidence.push({ signal: s.name, verbatim: h.verbatim });
    }
    if (evidence.length === 0) continue;
    out.push({
      key: `${p.champion}/${p.slot}/${p.abilityName}`,
      signals: [...new Set(evidence.map((e) => e.signal))],
      evidence,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ THE READING */

/**
 * WHAT A PERSON READ, AND THE ONLY POPULATION ANY DECISION MAY REST ON (2026-08-16).
 *
 * The sweep above proposes 45 candidates. This is the reading of all 45, one row each. The
 * verdict is the SENTENCE's, not the pattern's, and `verbatim` is checked to be a literal
 * substring of the cached wikitext so a quote cannot be paraphrased into saying something the
 * source does not.
 *
 * `verdict`:
 *   - `member`      — the source states a count of damage instances against ONE champion from ONE
 *                     cast, and that count is a different number at a different ability rank.
 *   - `not-a-count` — the ranged value the signal fired on is not a number of damage instances
 *                     (a range in units, a bonus in damage, a crowd-control duration, a level
 *                     scaling, a charge of ammunition, a cap).
 *   - `count-but-rank-invariant` — a real count of instances that does NOT move with rank.
 *   - `count-but-not-same-target` — a real rank-varying count of PROJECTILES, where the source
 *                     states one champion can be hit by only one of them. Ashe W is the case, and
 *                     it is the one that would be got wrong by widening a pattern.
 */
export type RankCountVerdict =
  | 'member'
  | 'not-a-count'
  | 'count-but-rank-invariant'
  | 'count-but-not-same-target';

export interface RankCountRead {
  key: string;
  verdict: RankCountVerdict;
  /** The sentence or row the verdict rests on, verbatim from the cache. */
  verbatim: string;
  /** Why, in plain English. */
  reading: string;
  /** On a member: the count at each rank, rank 1 first. */
  countByRank?: number[];
  /** On a member: what else keeps the entry from publishing, beyond the count. */
  alsoBlockedBy?: string;
}

export const RANK_COUNT_READS: readonly RankCountRead[] = [
  {
    key: 'Aurelion Sol/Q/Breath of Light',
    verdict: 'member',
    verbatim: "At rank 5, ''Breath of Light's'' channel duration is increased to 160 seconds.",
    reading:
      'the burn ticks every 0.125 seconds over a 3.25-second channel — 26 ticks — and the page ' +
      'labels its own total row {{tt|Total Maximum Magic Damage|Ranks 1-4}} to say the 26 stops ' +
      'applying at rank 5, where the channel becomes 160 seconds. 1,280 ticks at the same interval.',
    countByRank: [26, 26, 26, 26, 1280],
    alsoBlockedBy:
      'gate 1 refuses the entry for four repeating components sharing one total row, and one ' +
      'expression is split across several {{as}} blocks so the Bonus Magic Damage component is ' +
      'not the ability. A rank-axis count releases NOTHING here on its own.',
  },
  {
    key: 'Miss Fortune/R/Bullet Time',
    verdict: 'member',
    verbatim:
      '{{st|Total Waves|{{ap|14 to 18}}|Maximum Total Physical Damage|{{ap|20*14 to 40*18}}',
    reading:
      'the leveling row states the wave count itself as a rank progression — 14 at rank 1, 16 at ' +
      'rank 2, 18 at rank 3 — and multiplies the per-wave figure by 14 at one end and 18 at the ' +
      'other. `Wave Interval Time` divides a fixed 2.85 seconds by the same range.',
    countByRank: [14, 16, 18],
    alsoBlockedBy:
      'nothing else. Gate 7 currently reads a stated total of 280 at rank 1 against components ' +
      'summing to 20, and 20 x 14 = 280 exactly. BUT SEE THE RANK-2 ARTEFACT: the source own ' +
      'total row renders 500 at rank 2 where per-wave x waves is 30 x 16 = 480, because the ' +
      'wiki template interpolates the evaluated endpoints of a product rather than the product ' +
      'of the interpolations. Gate 7 only compares rank 1, so it would pass and the ' +
      'disagreement would go unreported.',
  },
  {
    key: 'Mel/Q/Radiant Volley',
    verdict: 'member',
    verbatim: '{{st|Number of Bolts|{{ap|6 to 10}}}}',
    reading:
      'one cast drops 6 to 10 bolts into an area 50 units across with a 200-unit explosion ' +
      'radius, and the page states "all explosions after the first dealing reduced damage" — a ' +
      'later hit on the SAME champion, not a secondary target. Its own total row writes the ' +
      'arithmetic out at every rank: 5*5+60, 7*6+85, 9*7+110, 11*8+135, 13*9+160, so the number ' +
      'of REDUCED explosions is 5, 6, 7, 8, 9.',
    countByRank: [5, 6, 7, 8, 9],
    alsoBlockedBy:
      'the reduced component is stored `alternativeTo` the initial explosion, and gate 7 excludes ' +
      'alternatives from its sum — which is why it reports 60 against a stated 85. The relation ' +
      'has to become `adds` as well, or a rank-axis count changes nothing. It is also a candidate ' +
      'for §38\'s variable-hit population that NOBODY HAS READ for that purpose.',
  },
  {
    key: 'Akshan/R/Comeuppance',
    verdict: 'member',
    verbatim: '{{st|Maximum Bullets Stored|{{ap|5 to 7}}}}',
    reading:
      'Akshan "fires all stored bullets at the target" in one recast, and the page states the ' +
      'stored ceiling per rank — 5, 6, 7 — writing the product out longhand as {{ap|5*25|6*35|' +
      '7*45}}. Every bullet lands on the same locked champion.',
    countByRank: [5, 6, 7],
    alsoBlockedBy:
      'the entry stores "Damage to target on 67% missing hp" (375/630/945) as an ADDITIVE damage ' +
      'component, which is a worked example of the same bullets at maximum missing-health ' +
      'scaling, not a separate damage term. A rank-axis count on the per-bullet row leaves that ' +
      'phantom in place.',
  },
  {
    key: 'Xerath/R/Rite of the Arcane',
    verdict: 'member',
    verbatim: '{{st|Number of Recasts|{{ap|4 to 6}}}}',
    reading:
      'the page states 4, 5 and 6 missiles by rank and its total row writes 170*4, 220*5, 270*6. ' +
      'The count is unambiguously rank-varying and it is what gate 7 is missing.',
    countByRank: [4, 5, 6],
    alsoBlockedBy:
      'AN OPEN MODELLING QUESTION, NOT A DEFECT: each missile is a separate player recast aimed ' +
      'at its own location, which DATA-SOURCES §38.5 puts in the "separate combo steps the ' +
      'builder already models" group alongside Gwen R. If that reading holds, this entry does ' +
      'not want a hit count at all and a rank-axis count would be the wrong fix. RAISED, not ' +
      'decided here. Its `Maximum Stacks {{ap|3 to 5}}` is a second rank-varying multiplicity ' +
      'on the same entry.',
  },
  {
    key: 'Ashe/W/Volley',
    verdict: 'count-but-not-same-target',
    verbatim:
      'Enemies can intercept multiple arrows but do not take damage from any beyond the first.',
    reading:
      'THE CASE THAT PROVES READING BEATS PATTERN-MATCHING. `{{st|Arrows|{{ap|7 to 11}}}}` is a ' +
      'perfect rank-varying count and every signal in this file fires on it, but the very next ' +
      'sentence says one champion takes exactly ONE arrow at any rank. The entry is `verified` ' +
      'and stores no hit count, correctly. Storing 7-to-11 here would multiply Ashe W by up to ' +
      'eleven.',
  },
];

/**
 * THE OTHER 39 CANDIDATES, EACH WITH THE REASON IT IS NOT A MEMBER.
 *
 * Recorded so no candidate is silently unread: a test asserts every key the sweep proposes
 * appears either here or in `RANK_COUNT_READS`. An omission is a failure, not a pass.
 */
export const RANK_COUNT_REJECTED: Readonly<Record<string, string>> = {
  // --- the label said "attack"/"hit"/"charge" and the value is not a number of instances ---
  "Bel'Veth/R/Endless Banquet": 'S1 fired on `Bonus Attack Range 25 to 125` — a distance in units',
  "Cho'Gath/R/Feast": 'S1 fired on `Bonus Attack Range Per Stack 4.7 to 7.7` — a distance',
  "Kog'Maw/W/Bio-Arcane Barrage": 'S1 fired on `Bonus Attack Range 130 to 210` — a distance',
  'Kayn/Q/Reaping Slash': 'S1 fired on `Capped Monster Damage per Hit 200 to 400` — a damage cap against monsters',
  'Nocturne/Q/Duskbringer': 'S1 fired on `Bonus Attack Damage 15 to 55` — a stat buff',
  'Trundle/Q/Chomp': 'S1 fired on `Bonus Attack Damage 20 to 40` — a stat steal',
  'Twitch/R/Spray and Pray': 'S1 fired on `Bonus Attack Damage 30 to 60` — a stat buff',
  'Tryndamere/W/Mocking Shout': 'S1/S2 fired on `Attack Damage Reduction 20 to 80` — a debuff, not a count',
  'Dr. Mundo/W/Heart Zapper': 'S1 fired on `Magic Damage per Tick 5 to 20` — the per-tick DAMAGE. Its tick count is 12 at every rank (settled, DATA-SOURCES §59.2)',
  'Teemo/R/Noxious Trap': 'S1 fired on `Maximum Charges 3 to 5` (stored ammunition, one mushroom per cast) and `Bounce Distance Cap 350 to 550` (a distance). The poison is 4 ticks at every rank',
  "Taric/Q/Starlight's Touch": 'S1 fired on `Maximum Charges 1 to 5` — charges of a HEAL. No damage component exists to carry a count',

  // --- a rank-varying count of projectiles that cannot repeat on one champion ---
  // (Ashe W is in RANK_COUNT_READS because it is the instructive case, not because it is a member)

  // --- rank-conditional prose that moves something other than a count ---
  'Dr. Mundo/R/Maximum Dosage': 'rank-conditional, and it moves base health and health regeneration — not damage instances',
  "Kindred/W/Wolf's Frenzy": 'a worked cooldown example mentioning rank 5. Already a known false positive of this signal',
  'Pantheon/R/Grand Starfall': 'the 0.8 seconds is fixed; the rank referenced is Comet Spear\'s, scaling the damage. Already a known false positive',
  'Illaoi/P/Prophet of an Elder God': "Tentacle Smash's rank scales the slam DAMAGE by a percentage. The number of tentacles is situational and rank-independent",
  'Xayah/E/Bladecaller': 'a notes example computing damage for 19 feathers at rank 1. The feather count is situational (how many are planted), identical at every rank',
  'Akshan/E/Heroic Swing': 'a level-18 worked example of per-shot damage. The shot count follows the swing and attack speed, which SPECIFICATION §3.2 puts outside the engine',

  // --- champion LEVEL scaling of a damage value, never a count ---
  'Aphelios/P/Infernum': 'a level-9 step in a secondary-target damage percentage',
  'Azir/W/Arise!': 'a level-scaled percentage for targets beyond the closest',
  'Diana/P/Moonsilver Blade': 'level-scaled cleave damage',
  'Dr. Mundo/P/Goes Where He Pleases': 'level-scaled health regeneration',
  'Garen/P/Perseverance': 'level-scaled health regeneration',
  'Ivern/P/Friend of the Forest': 'a level-15 cap on a smite timer',
  'Jhin/P/Whisper': 'level-scaled bonus attack damage',
  'Kayle/P/Divine Ascent': 'level-gated wave damage',
  'Lissandra/P/Iceborn Subjugation': 'level-scaled shatter damage',
  'Maokai/P/Sap Magic': 'level-scaled heal',
  'Shen/P/Ki Barrier': 'level-scaled cooldown reduction',
  'Sona/P/Power Chord': 'level-scaled empowered-attack damage',
  'Volibear/P/The Relentless Storm': 'level-scaled on-hit damage',
  'Zoe/P/More Sparkles!': 'level-scaled empowered-attack damage',

  // --- S5: a rank-varying number of seconds that is not the duration of the recurring damage ---
  'Braum/R/Glacial Fissure': 'the 1-to-2 seconds is the maximum KNOCK-UP duration; the 0.25-second interval belongs to the slowing ice field, which deals no damage',
  'Hwei/W/Fleeting Current': 'a movement-speed effect; the ranged seconds and the interval are on different effects and neither is a damage tick',
  'Nocturne/E/Unspeakable Horror': 'the 1.25-to-2.25 seconds is the FEAR duration. The damaging tether is a fixed 2 seconds at 0.5-second intervals — 4 ticks at every rank',
  'Rakan/R/The Quickness': 'the ranged seconds is the charm duration; the ability "cannot affect the same enemy more than once"',
  'Seraphine/R/Encore': 'the ranged seconds is the charm duration; the 0.25-second interval steps a SLOW, not damage',
  'Shaco/W/Jack in the Box': 'the 0.5-to-1.5 seconds is the fear duration. The box fires for a fixed 5 seconds every 0.5 seconds',
  'Veigar/E/Event Horizon': 'the 1.5-to-2.5 seconds is the stun duration, and the cage deals no damage at all',

  // --- S7 arithmetic that is not a count ---
  'Warwick/R/Infinite Duress': 'the differing multipliers are AD ratios and a monster modifier in a worked example. The channel is a fixed 1.5 seconds at 0.25-second intervals — 6 ticks at every rank',
};

/** The confirmed population: entries a person read and found rank-varying. */
export const RANK_VARYING_MEMBERS = RANK_COUNT_READS.filter((r) => r.verdict === 'member').map(
  (r) => r.key,
);

if (process.argv[1] && process.argv[1].endsWith('rank-varying-count.ts')) {
  const { writeFile } = await import('node:fs/promises');
  const pages = await loadPages();
  const cands = sweep(pages);
  const perSignal = new Map<string, number>();
  for (const c of cands) for (const s of c.signals) perSignal.set(s, (perSignal.get(s) ?? 0) + 1);
  console.log(`pages scanned: ${pages.length}`);
  console.log(`candidates (any signal): ${cands.length}`);
  for (const s of SIGNALS) console.log(`  ${s.name}: ${perSignal.get(s.name) ?? 0}`);
  console.log(`confirmed members after reading all ${cands.length}: ${RANK_VARYING_MEMBERS.length}`);
  for (const m of RANK_VARYING_MEMBERS) console.log(`  - ${m}`);

  const audit = {
    what:
      'Does any ability\'s tick or hit count change with ABILITY RANK? Eight signals over the ' +
      'cached wikitext propose candidates; a person read all of them; only the read verdicts ' +
      'below are a population. NOTHING HERE IS STORED — this file changes no hit count.',
    measuredOn: '2026-08-16',
    source: 'build/proposed-curated/ability-wikitext.json',
    definitions: {
      candidate: 'a cached ability page on which at least one of the eight signals fired',
      member:
        'the source states a count of damage instances against ONE champion from ONE cast, and ' +
        'that count is a different number at a different ability rank',
      'not a member':
        'the ranged value is not a number of damage instances, or the count is real and does ' +
        'not move with rank, or the source says one champion can be hit only once',
    },
    pagesScanned: pages.length,
    candidates: cands.length,
    perSignal: Object.fromEntries(SIGNALS.map((s) => [s.name, perSignal.get(s.name) ?? 0])),
    confirmedMembers: RANK_VARYING_MEMBERS.length,
    reads: RANK_COUNT_READS,
    rejected: RANK_COUNT_REJECTED,
    candidateEvidence: cands,
  };
  const out = join(ROOT, 'build/proposed-curated/rank-varying-count.json');
  await writeFile(out, `${JSON.stringify(audit, null, 1)}\n`);
  console.log(`\nwrote ${out}`);
}
