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
