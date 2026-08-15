// GATE 8 — AN AGGREGATE ROW STORED AS AN ADDITION (DATA-SOURCES §60).
//
// THE DEFECT. The wiki routinely prints, beside a damage row, a second row that is arithmetic on
// the first: "Maximum Magic Damage", "Total Combined Damage", "Bonus Magic Damage at Max Stacks".
// It is a convenience for the reader, not a second damage. Stored with `relation: adds` it is
// summed WITH the very rows it aggregates, and the ability publishes more damage than its own
// source says it can deal. Zoe E published 210 at rank 1 for an ability the wiki caps at 140.
//
// WHY NO EXISTING GATE SEES IT.
//   - Gate 3 fires on components that fail to state a relation. These state one — the wrong one.
//   - The per-tick sweep (§58) looks for duplicate LABELS. These labels differ.
//   - Gate 7 asks whether the components sum to the source's stated total. An entry holding both
//     the parts and the total can reconcile against a total it contains, so the sum looks right.
//
// WHY THE LABEL ALONE MAY NOT DECIDE IT, AND WHY THIS FILE WIDENS NOTHING.
// `DERIVED_ROW` in src/types/validate-curated.ts is `/\btotal\b/i` and deliberately excludes
// "Minimum"/"Maximum", because on a charge-up ability the Maximum row IS the damage in its
// fully-charged form. An earlier version of that pattern included them and would have shipped 32
// abilities at zero damage. 38 entries carry a Minimum/Maximum pair today and every one of them
// is stored `alternativeTo` — correctly. This file does not touch that pattern, does not drop any
// row, and does not change any stored number. It REPORTS.
//
// WHAT DECIDES IT IS ARITHMETIC, CHECKED AGAINST THE LABEL.
// An aggregate restates its siblings exactly, at every rank, in the base term and in every ratio.
// So the test is: is this additive component's whole value series reproducible as `m x S` or
// `A + m x B` from its siblings' series? That question is answered from stored numbers, not from
// prose, and it is answered for all 919 entries offline.
//
// TWO TIERS, BECAUSE ARITHMETIC ALONE OVER-REACHES.
//   Tier 1 — redundant AND the label carries an aggregate word. This is the §60 class.
//   Tier 2 — redundant, no aggregate word. A real finding of a DIFFERENT kind (a unit restated,
//            an alternative stored as an addition, or a genuine coincidence), and it is reported
//            separately because the fix is not the same fix.
//
// A DETECTOR PROPOSES, A PERSON CONFIRMS (CLAUDE.md). `READ_POPULATION` below holds the twelve
// entries whose source sentences a person has actually read, with the verdict for each. An entry
// OUTSIDE that set which trips tier 1 is reported for someone to read — never rewritten.

import type { AbilityComponent, CuratedAbility, Ratio, Scaling } from '../../src/types/data.ts';

/**
 * The twelve entries a person has read, one sentence at a time, on 2026-08-15 (DATA-SOURCES §60).
 * The key is `champion/slot/abilityName` — NOT `champion/slot`, because 57 of those keys are
 * shared by 128 entries (Aphelios has six Q entries, Hwei four W entries) and a form's aggregate
 * row would otherwise be confirmed by a sentence read about a different ability. `aggregates` names the component ids confirmed to be aggregate rows
 * — the ones that must be `alternativeTo`, never `adds`.
 *
 * NOTHING outside this set may have its relation rewritten by any rule. Adding a member means
 * reading its sentence, not widening the test.
 */
export const READ_POPULATION: ReadonlyMap<string, ReadEntry> = new Map([
  [
    'Darius/R/Noxian Guillotine',
    {
      aggregates: ['maximum-true-damage'],
      sentence:
        'true damage "increased by 20% for every Hemorrhage stack the target has, capped at 100% at 5 stacks" — so Maximum True Damage (base x2) is the base plus five stacks, not a sixth damage.',
    },
  ],
  [
    'Hwei/W/Stirring Lights',
    {
      aggregates: ['maximum-magic-damage'],
      sentence:
        '"empower his next 3 basic attacks or ability hits ... to EACH deal bonus magic damage" — Maximum Magic Damage is that per-hit figure times three. The template pairs its mana row the same way (Mana Restore 135/3, Total Mana Restore 135).',
    },
  ],
  [
    'Jhin/Q/Dancing Grenade',
    {
      aggregates: ['maximum-final-bounce-physical-damage'],
      sentence:
        '"The grenade\'s damage is increased by 35% any time an enemy dies ... before it strikes its next target" — Maximum Final Bounce is base x (1 + 0.35 x 3), the same grenade after three deaths, not a fourth grenade.',
    },
  ],
  [
    'Kassadin/R/Riftwalk',
    {
      aggregates: ['maximum-bonus-damage', 'maximum-magic-damage'],
      sentence:
        '"He then gains a stack of Riftwalk ... stacking up to 4 times. For each stack, Riftwalk deals bonus magic damage." Two aggregates on one entry: Maximum Bonus Damage is the per-stack row x4, and Maximum Magic Damage is the base plus that.',
    },
  ],
  [
    'Katarina/R/Death Lotus',
    {
      aggregates: ['maximum-physical-damage', 'maximum-magic-damage'],
      sentence:
        '"channels for up to 2.5 seconds, rapidly throwing a dagger every 0.166 seconds" — 15 daggers. Both Maximum rows are their per-dagger row x15. NOTE: the per-dagger PHYSICAL row is not stored at all, so removing its aggregate from the sum leaves the physical side with no figure; that is a gap to fill, not damage to keep.',
    },
  ],
  [
    'Kled/Q/Pocket Pistol',
    {
      aggregates: ['maximum-damage'],
      sentence:
        '"Pellets collide with the first enemy champion they hit, and deal 20% damage per pellet beyond the first" — Maximum Damage is base x (1 + 0.2 x 4), one full pellet plus four reduced ones.',
    },
  ],
  [
    'Locke/Q/Ritual Nails',
    {
      aggregates: ['maximum-nail-damage'],
      sentence:
        '"Ritual Nails can be recast twice more" — Maximum Nail Damage is the per-nail row x3. SEPARATE DEFECT, NOT FIXED HERE: the One / Two / Three Stacks Bonus Damage rows are alternatives to each other and are all stored `adds`.',
    },
  ],
  [
    'Master Yi/Q/Alpha Strike',
    {
      aggregates: ['maximum-single-target-damage'],
      sentence:
        '"Marks after the first on the same target instead detonate instantly ... to deal reduced damage" — Maximum Single-Target Damage is the primary mark plus three reduced ones.',
    },
  ],
  [
    'Rumble/R/The Equalizer',
    {
      aggregates: ['magic-damage-per-second', 'maximum-magic-damage'],
      sentence:
        '"taking magic damage every 0.25 seconds ... Enemies may be Burning for up to 5 seconds, for a total of 20 instances." ONE damage stored THREE ways: per tick, per second (x4) and maximum (x20). Only the per-tick figure is an instance; the other two are units of the same thing.',
    },
  ],
  [
    'Varus/W/Blighted Quiver',
    {
      aggregates: [
        'bonus-magic-damage-at-max-stacks',
        'maximum-bonus-magic-damage-at-max-stacks',
      ],
      sentence:
        '"applies a stack of Blight ... stacking up to 3 times ... For each stack consumed, the target is dealt bonus magic damage." Both "at Max Stacks" rows are their per-stack row x3. SEPARATE DEFECT, NOT FIXED HERE: the Piercing-Arrow-empowered rows and the Active Minimum/Maximum pair are alternatives, and all seven components are stored `adds`.',
    },
  ],
  [
    'Yasuo/E/Sweeping Blade',
    {
      aggregates: ['maximum-bonus-damage'],
      sentence:
        '"generates a stack of Ride the Wind ... stacks up to 4 times. Sweeping Blade\'s damage is increased by 25% per stack, up to 100% at maximum stacks." Maximum Bonus Damage is the per-stack row x4. ALSO WRONG AND READ IN THE SAME SENTENCE: the per-stack component stores `hits: 8` where the source says 4 stacks.',
      alsoWrong: { componentId: 'bonus-damage-per-stack', hits: 4, storedHits: 8 },
    },
  ],
  [
    'Zoe/E/Sleepy Trouble Bubble',
    {
      aggregates: ['maximum-mixed-damage'],
      sentence:
        '"deal bonus true damage equal to the post-mitigation damage dealt, capped at Sleepy Trouble Bubble\'s damage" — the source\'s own row pair is "Bonus Damage Cap" (70 to 230) and "Maximum Mixed Damage" (140 to 460), the second being the sum of the first two. NOTE: the Bonus Damage Cap row is not stored, so this entry holds an aggregate whose other half is absent.',
    },
  ],
]);

export interface ReadEntry {
  /** Component ids confirmed by reading the source to be aggregate rows. */
  aggregates: string[];
  /** The sentence, or sentences, the verdict rests on. Quoted so it can be re-checked. */
  sentence: string;
  /** A second defect found in the same reading, recorded rather than silently fixed. */
  alsoWrong?: { componentId: string; hits: number; storedHits: number };
}

/**
 * Words that mark a row as the source's own summary of other rows. Used ONLY to split a finding
 * into tier 1 and tier 2 — never to drop a row, and never in place of the arithmetic.
 */
const AGGREGATE_WORD = /\b(maximum|max|total|combined)\b/i;

/** The multiples the wiki actually writes. Hit counts, stack counts and tick counts. */
const MULTIPLES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

/** Absolute-and-relative tolerance; the wiki prints to two decimals and we store the expansion. */
function agrees(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * A component's value series, per rank, keyed by term. `null` when no term of it can be compared
 * — a `byLevel` or `byRangeType` arm is not a per-rank series and this check does not guess at one.
 */
type Signature = Array<{ term: string; values: number[] | undefined }>;

function expand(s: Scaling | undefined, maxRank: number): number[] | undefined {
  if (!s) return undefined;
  if (s.scaling === 'linear') {
    if (maxRank <= 1) return [s.from];
    const step = (s.to - s.from) / (maxRank - 1);
    return Array.from({ length: maxRank }, (_, i) => s.from + step * i);
  }
  if (s.scaling === 'explicit') return s.perRank.slice();
  return undefined;
}

function ratioTerm(r: Ratio): string {
  return `ratio:${r.stat}:${r.owner ?? ''}`;
}

export function signatureOf(k: AbilityComponent, maxRank: number): Signature | null {
  const parts: Signature = [{ term: 'base', values: expand(k.base, maxRank) }];
  for (const r of k.ratios ?? []) parts.push({ term: ratioTerm(r), values: expand(r, maxRank) });
  return parts.some((p) => p.values) ? parts : null;
}

/** Is `target` reproduced exactly by the weighted sum of `terms`, in every term and at every rank? */
function reproduces(target: Signature, terms: Array<{ sig: Signature; times: number }>): boolean {
  const keys = new Set<string>();
  for (const p of target) keys.add(p.term);
  for (const t of terms) for (const p of t.sig) keys.add(p.term);

  for (const key of keys) {
    const want = target.find((p) => p.term === key)?.values;
    let got: number[] | undefined;
    for (const t of terms) {
      const v = t.sig.find((p) => p.term === key)?.values;
      if (!v) continue;
      got = got ? got.map((x, i) => x + v[i] * t.times) : v.map((x) => x * t.times);
    }
    if (!want && !got) continue;
    if (!want || !got || want.length !== got.length) return false;
    for (let i = 0; i < want.length; i++) if (!agrees(want[i], got[i])) return false;
  }
  return true;
}

export interface RedundancyFinding {
  champion: string;
  slot: string;
  abilityName: string;
  verification: string;
  componentId: string;
  label: string;
  /** Plain English: how this component's numbers restate its siblings'. */
  restates: string;
  /** Tier 1 is the §60 aggregate class; tier 2 is redundancy of some other cause. */
  tier: 1 | 2;
  /** True when a person has read this entry's source sentence and confirmed the verdict. */
  confirmedByReading: boolean;
}

export interface AggregateAudit {
  findings: RedundancyFinding[];
  /** Additive components whose series this check could compare. The denominator of its coverage. */
  compared: number;
  /** Components skipped because no term of them expands to a per-rank series. */
  notComparable: number;
}

/**
 * Run the check over a whole curated ability set. Reports; changes nothing.
 */
export function findRedundantAdditions(abilities: CuratedAbility[]): AggregateAudit {
  const findings: RedundancyFinding[] = [];
  let compared = 0;
  let notComparable = 0;

  for (const entry of abilities) {
    const maxRank = entry.maxRank || 1;
    const withSig = entry.components.map((k) => ({ k, sig: signatureOf(k, maxRank) }));
    const usable = withSig.filter((x): x is { k: AbilityComponent; sig: Signature } => !!x.sig);
    notComparable += withSig.length - usable.length;

    const adds = usable.filter((x) => x.k.relation?.kind === 'adds');
    // One additive component cannot restate a sibling it does not have.
    if (adds.length < 2) continue;
    compared += adds.length;

    const read = READ_POPULATION.get(`${entry.champion}/${entry.slot}/${entry.abilityName}`);

    for (const target of adds) {
      const others = usable.filter((x) => x.k.id !== target.k.id);
      let restates: string | null = null;

      for (const s of others) {
        for (const m of MULTIPLES) {
          if (reproduces(target.sig, [{ sig: s.sig, times: m }])) {
            restates = `${m} x "${s.k.label}"`;
            break;
          }
        }
        if (restates) break;
      }

      if (!restates) {
        search: for (const a of others) {
          for (const b of others) {
            if (a.k.id === b.k.id) continue;
            for (const m of MULTIPLES) {
              if (
                reproduces(target.sig, [
                  { sig: a.sig, times: 1 },
                  { sig: b.sig, times: m },
                ])
              ) {
                restates = `"${a.k.label}" + ${m} x "${b.k.label}"`;
                break search;
              }
            }
          }
        }
      }

      if (!restates) continue;

      const tier: 1 | 2 = AGGREGATE_WORD.test(target.k.label ?? '') ? 1 : 2;
      findings.push({
        champion: entry.champion,
        slot: entry.slot,
        abilityName: entry.abilityName,
        verification: entry.verification,
        componentId: target.k.id,
        label: target.k.label ?? '',
        restates,
        tier,
        confirmedByReading: tier === 1 && !!read?.aggregates.includes(target.k.id),
      });
    }
  }

  return { findings, compared, notComparable };
}

// =========================================================================================
// APPLYING THE READING — A CONFIRMED AGGREGATE ROW IS DROPPED, NOT RE-RELATED.
//
// THIS PASS RE-RELATED THE ROW TO `alternativeTo` UNTIL 2026-08-15 AND THAT WAS WRONG IN TWO
// WAYS. It is recorded here rather than quietly replaced, because the reasoning is the part
// worth keeping.
//
//   1. IT STORED A CLAIM THAT IS FALSE ABOUT THE WORLD. `alternativeTo` says "this row applies
//      INSTEAD of that one". An aggregate does not replace the row it aggregates — it CONTAINS
//      it. "Maximum Mixed Damage" is the bubble damage plus the sleep bonus; it is not a
//      different outcome of the same cast, the way a charge-up ability's Minimum and Maximum
//      genuinely are. Those 38 pairs are real alternatives. These twelve rows are not.
//
//   2. IT COST TWO ABILITIES THEIR WHOLE FIGURE. The engine refuses any instance holding an
//      unchosen alternative and returns zero with a reason (combo.ts, `resolveDamage`), so
//      marking the aggregate `alternativeTo` took Zoe E from a wrong 436 to 0, and Yasuo E
//      from a wrong 328 to 0. Dropping the row instead leaves the parts to sum on their own:
//      145 and 164, and Yasuo's 164 is what its source's own "Total Combined Damage" row
//      states.
//
// SO A CONFIRMED AGGREGATE IS TREATED AS WHAT IT IS: A DERIVED ROW. This project already has
// one way of treating a derived row and has had it since harvest — it does not store it.
// `DERIVED_ROW` in src/types/validate-curated.ts drops a "Total" row at harvest for exactly
// this reason. THAT PATTERN IS NOT TOUCHED HERE and must never be widened to catch these: it
// is `/\btotal\b/i` and excludes "Minimum"/"Maximum" deliberately, because on a charge-up
// ability the Maximum row IS the damage. Including them would have shipped 32 abilities at
// zero damage. What happens below is not a pattern catching more rows. It is twelve entries a
// person read, one sentence at a time.
//
// THE POPULATION IS `READ_POPULATION` AND NOTHING ELSE. Gate 8's tier-1 list is a DETECTOR: it
// proposes. An entry outside the set is untouched however loudly it trips the arithmetic.
//
// NO VALUE IS EDITED, AND EVERY DROPPED ROW IS RECORDED — its label, its numbers, the
// arithmetic showing which siblings it restates, and the source sentence the verdict rests on.
// A row that vanishes without a record is worse than one stored wrongly.
// =========================================================================================

/** A component this pass removed, with everything needed to audit or reverse the removal. */
export interface AggregateDrop {
  entry: string;
  componentId: string;
  label: string;
  /**
   * The arithmetic showing which siblings this row restates, in the same words gate 8 reports.
   * `null` where NO stored sibling reproduces it — the row it aggregates was never harvested,
   * so the reading is the only evidence. Katarina R's physical side is that case.
   */
  basis: string | null;
  /** The whole component as it was stored, so nothing is lost by dropping it. */
  removed: AbilityComponent;
  /** The source sentence the verdict rests on. Quoted so it can be re-checked. */
  sentence: string;
}

/** A hit count corrected because the SOURCE SENTENCE READ FOR THE AGGREGATE also states it. */
export interface AggregateHitCountChange {
  entry: string;
  componentId: string;
  label: string;
  before: number | undefined;
  after: number;
  sentence: string;
}

export interface AggregateApplication {
  dropped: AggregateDrop[];
  hitCounts: AggregateHitCountChange[];
  /** Every confirmed aggregate this pass did NOT change, with why. Never silent. */
  refused: Array<{ entry: string; componentId: string; why: string }>;
  /** Entries in READ_POPULATION that the file does not contain, or contains twice. */
  unmatchedReadEntries: string[];
  /**
   * Per entry, what the change did, in two figures rather than one.
   *
   * `rank1BaseBefore` / `rank1BaseAfter` — the sum over components marked `adds` of the base term
   * at rank 1 times the stated hit count (1 where none is stated). Ratios are excluded because
   * they are zero for a champion with no ability power and no bonus attack damage.
   *
   * `componentsBefore` / `componentsAfter` — how many rows the entry holds. IT IS HERE BECAUSE
   * THE FIRST FIGURE CAN BE BLIND: an entry whose damage is entirely a ratio, such as Varus W
   * (a percentage of the target's maximum health, base 0), shows no movement in a base-only
   * figure while two of its rows have gone.
   */
  perEntry: Array<{
    entry: string;
    rank1BaseBefore: number;
    rank1BaseAfter: number;
    componentsBefore: number;
    componentsAfter: number;
  }>;
}

/** The base term at rank 1 times the stated hit count. Ratios contribute nothing at zero stats. */
function rank1BaseOnly(components: readonly AbilityComponent[]): number {
  let sum = 0;
  for (const c of components) {
    if (c.relation?.kind !== 'adds') continue;
    const base = expand(c.base, 1);
    if (!base) continue;
    sum += base[0] * (c.hits ?? 1);
  }
  return sum;
}

/**
 * The sibling whose value series reproduces this aggregate. Returns the component id to point
 * at and the arithmetic that found it, or null when no sibling reproduces it at all.
 *
 * Other CONFIRMED AGGREGATES of the same entry are excluded as candidates: an aggregate must
 * point at a part, and pointing one aggregate at another would leave the pair meaningless.
 */
export function aggregateTargetOf(
  target: { k: AbilityComponent; sig: Signature },
  candidates: Array<{ k: AbilityComponent; sig: Signature }>,
): { componentId: string; basis: string } | null {
  for (const s of candidates) {
    for (const m of MULTIPLES) {
      if (reproduces(target.sig, [{ sig: s.sig, times: m }])) {
        return { componentId: s.k.id, basis: `${m} x "${s.k.label}"` };
      }
    }
  }
  for (const a of candidates) {
    for (const b of candidates) {
      if (a.k.id === b.k.id) continue;
      for (const m of MULTIPLES) {
        if (reproduces(target.sig, [{ sig: a.sig, times: 1 }, { sig: b.sig, times: m }])) {
          return { componentId: a.k.id, basis: `"${a.k.label}" + ${m} x "${b.k.label}"` };
        }
      }
    }
  }
  return null;
}

/**
 * Drop every confirmed aggregate row, IN PLACE, and record what was dropped.
 *
 * Also applies the one hit count recorded in the same reading (`alsoWrong`), and only when the
 * component still holds the number that reading saw — if the harvest has moved underneath the
 * reading, the correction is refused rather than applied to a figure nobody read.
 *
 * THREE THINGS IT REFUSES TO DO, each stated rather than assumed:
 *   - drop a row the entry does not hold, or that some other pass has already re-related;
 *   - drop the LAST row of an entry. An entry with no components reads as "nothing was
 *     harvested for this slot", which is a different and false statement from "its only stored
 *     row was a summary of rows nobody harvested". None of the twelve is in that position
 *     today; the guard exists so a future harvest cannot put one there silently;
 *   - touch anything outside `READ_POPULATION`.
 */
export function applyReadAggregates(abilities: CuratedAbility[]): AggregateApplication {
  const dropped: AggregateDrop[] = [];
  const hitCounts: AggregateHitCountChange[] = [];
  const refused: AggregateApplication['refused'] = [];
  const perEntry: AggregateApplication['perEntry'] = [];

  const matches = new Map<string, CuratedAbility[]>();
  for (const a of abilities) {
    const key = `${a.champion}/${a.slot}/${a.abilityName}`;
    if (!READ_POPULATION.has(key)) continue;
    matches.set(key, [...(matches.get(key) ?? []), a]);
  }

  const unmatchedReadEntries: string[] = [];
  for (const key of READ_POPULATION.keys()) {
    const found = matches.get(key) ?? [];
    if (found.length === 0) unmatchedReadEntries.push(`${key}: not in the file`);
    // Two entries under one read key would let a sentence read about one form decide another.
    else if (found.length > 1) unmatchedReadEntries.push(`${key}: ${found.length} entries share this key — none changed`);
  }

  for (const [key, found] of matches) {
    if (found.length !== 1) continue;
    const entry = found[0]!;
    const read = READ_POPULATION.get(key)!;
    const maxRank = entry.maxRank || 1;
    const rank1BaseBefore = rank1BaseOnly(entry.components);
    const componentsBefore = entry.components.length;

    // Signatures are taken ONCE, before anything is dropped, so the arithmetic recorded for the
    // second aggregate on an entry is the same arithmetic gate 8 reported for it. Kassadin R
    // holds two, and reading the second against a list the first had already left would change
    // what the record says without changing what was decided.
    const withSig = entry.components
      .map((k) => ({ k, sig: signatureOf(k, maxRank) }))
      .filter((x): x is { k: AbilityComponent; sig: Signature } => !!x.sig);

    for (const id of read.aggregates) {
      const component = entry.components.find((c) => c.id === id);
      if (!component) {
        refused.push({
          entry: key,
          componentId: id,
          why: 'no component with this id is on the entry — the reading names a row the file does not hold',
        });
        continue;
      }
      if (component.relation?.kind === 'alternativeTo') {
        refused.push({
          entry: key,
          componentId: id,
          why:
            `stored alternativeTo '${component.relation.componentId}' rather than 'adds'. Some ` +
            'other pass has already decided what this row is, and two passes deciding one row is ' +
            'how they end up disagreeing. Left alone and reported.',
        });
        continue;
      }
      if (entry.components.length <= 1) {
        refused.push({
          entry: key,
          componentId: id,
          why:
            'it is the last row on the entry. An entry with no components reads as "nothing was ' +
            'harvested for this slot", which is false here — what is true is that its only stored ' +
            'row was a summary of parts nobody harvested. Dropping it would replace one wrong ' +
            'statement with another.',
        });
        continue;
      }

      // The arithmetic is EVIDENCE, not permission. The verdict comes from the sentence a person
      // read; where no sibling reproduces the row, `basis` is null and the drop still happens,
      // because "the part was never harvested" is exactly the case the reading covers and the
      // arithmetic cannot see (DATA-SOURCES §61.3).
      const target = withSig.find((x) => x.k.id === id);
      const candidates = withSig.filter((x) => x.k.id !== id && !read.aggregates.includes(x.k.id));
      const resolved = target ? aggregateTargetOf(target, candidates) : null;

      dropped.push({
        entry: key,
        componentId: id,
        label: component.label ?? '',
        basis: resolved?.basis ?? null,
        removed: JSON.parse(JSON.stringify(component)) as AbilityComponent,
        sentence: read.sentence,
      });
      entry.components = entry.components.filter((c) => c.id !== id);
    }

    if (read.alsoWrong) {
      const c = entry.components.find((x) => x.id === read.alsoWrong!.componentId);
      if (!c) {
        refused.push({
          entry: key,
          componentId: read.alsoWrong.componentId,
          why: 'the hit count read from the source names a component the entry does not hold',
        });
      } else if (c.hits !== read.alsoWrong.storedHits) {
        refused.push({
          entry: key,
          componentId: read.alsoWrong.componentId,
          why:
            `the reading recorded a stored hit count of ${read.alsoWrong.storedHits} and the entry ` +
            `now holds ${String(c.hits)} — the data moved under the reading, so the correction is ` +
            'refused rather than applied to a number nobody read',
        });
      } else {
        hitCounts.push({
          entry: key,
          componentId: c.id,
          label: c.label ?? '',
          before: c.hits,
          after: read.alsoWrong.hits,
          sentence: read.sentence,
        });
        c.hits = read.alsoWrong.hits;
      }
    }

    perEntry.push({
      entry: key,
      rank1BaseBefore,
      rank1BaseAfter: rank1BaseOnly(entry.components),
      componentsBefore,
      componentsAfter: entry.components.length,
    });
  }

  return { dropped, hitCounts, refused, unmatchedReadEntries, perEntry };
}
