// Runtime validator for the curated override file.
//
// WHY THIS EXISTS. Until now `CuratedAbility` was a contract on paper: nothing imported it and
// nothing checked a file against it. A hand-authored file of ~1070 entries with no validator is
// not a safe object — a mistyped digit or a missing field would reach the engine unnoticed and
// produce a plausible wrong number, which this project treats as worse than no product.
//
// This module implements the machine gates a batch must pass (plan §7.3):
//   Gate 1  schema        — every entry is structurally well-formed
//   Gate 3  sum guard     — components that are ALTERNATIVES are never summed
//   Gate 4  non-champion  — minion/monster-only damage rows never reach the file
//   Gate 6  status honesty— nothing is 'verified' without recorded evidence
//
// Gate 2 (round-trip against the source template) needs the source wikitext and therefore
// lives with the harvester; `compareExpansion` here is the comparison it calls, so both use
// one implementation.
//
// LEAD-owned.

import type {
  AbilityComponent,
  CuratedAbility,
  CuratedFile,
  CuratedItemEffect,
  CuratedRune,
  Scaling,
} from './data.ts';
import { requiresOwner } from './data.ts';
import { ScalingError, expandByRank, isLevelScaled, levelBreakpoints } from './scaling.ts';

export type Gate = 'schema' | 'round-trip' | 'sum-guard' | 'non-champion' | 'status-honesty';

export interface Finding {
  gate: Gate;
  /** Identifies the entry, e.g. "Aatrox/Q/The Darkin Blade" or "item 3031/pass". */
  entry: string;
  message: string;
}

export interface GateReport {
  gate: Gate;
  checked: number;
  passed: number;
  failed: number;
  findings: Finding[];
}

const DAMAGE_TYPES = new Set(['physical', 'magic', 'true']);
const SLOTS = new Set(['P', 'Q', 'W', 'E', 'R']);
const STATUSES = new Set(['verified', 'derived', 'incomplete', 'no-damage']);
const INSTANCE_TYPES = new Set([
  'basic-attack',
  'damaging-ability',
  'non-damaging-ability',
  'empowered-attack',
  'item-active',
  'on-hit',
  'dot-application',
]);
const RATIO_OWNERS = new Set(['caster', 'target', 'unresolved']);
const RATIO_STATS = new Set([
  'baseAD',
  'bonusAD',
  'totalAD',
  'AP',
  'maxHP',
  'bonusHP',
  'currentHP',
  'missingHP',
  'armor',
  'bonusArmor',
  'magicResist',
  'bonusMagicResist',
  'maxMana',
  'currentMana',
  'stacks',
]);

/**
 * Label fragments that mark a component as a CONDITIONAL VARIANT of another rather than an
 * addition to it. Derived by scanning ability templates on 2026-08-12: 94 components carried
 * one of these. That count is SUPERSEDED — 71 over the corrected 937-page set (DATA-SOURCES
 * §19). The list itself is unchanged; only the count moved.
 * Aatrox Q is the worst case — three casts x (normal, sweetspot).
 *
 * "first cast" / "second cast" / "third cast" are deliberately NOT here. They mark a position
 * in a sequence, not a variant: Aatrox really can cast Q three times in one combo, so those
 * three rows do add. It is the sweetspot row for each cast that is the alternative. Putting
 * sequence positions in this list made every row of Aatrox Q look like a variant of nothing,
 * and the proposal collapsed back to 'adds' — the exact failure the list exists to prevent.
 *
 * The classifier imports this rather than keeping its own copy, so a proposal can never be
 * made against a different list from the one that judges it.
 */
export const ALTERNATIVE_MARKERS =
  /\b(reduced|sweetspot|edge|handle|outer|inner|falloff|passthrough|secondary|subsequent|empowered|enhanced|critical|charged|uncharged|evolved|recast|melee|ranged|cone)\b/i;

/**
 * Damage rows that apply only to minions, monsters or other non-champion targets. This is a
 * champion-versus-champion tool (SPECIFICATION §5), so these are dropped at harvest — 97
 * measured over the corrected 937-page set (DATA-SOURCES §19; the old figure was 81 of 999). Their presence in the file means the harvester leaked.
 */
const NON_CHAMPION =
  /\b(minion|monster|non-champion|non champion|nonchampion|non-epic|epic|turret|ward)s?\b/i;

/**
 * Summary rows the wiki renders for the reader's convenience. They are arithmetic on other
 * rows, not independent damage, and storing them would double-count.
 *
 * Only "Total". A "Minimum"/"Maximum" prefix does NOT make a row a summary — on a charge-up
 * ability the Minimum row IS the damage and the Maximum row is its fully-charged form. An
 * earlier version of this pattern included them and would have dropped every damage row from
 * 32 abilities (Veigar R, Jhin R, Riven R, Vi Q, Varus Q, Sion Q and R among them), shipping
 * each as zero damage. Those pairs are handled by `relation: alternativeTo` instead, so they
 * are stored but never summed.
 */
const DERIVED_ROW = /\btotal\b/i;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Gate 1, applied to one Scaling. Returns messages; empty means well-formed. */
export function checkScalingShape(s: Scaling | undefined, where: string): string[] {
  const out: string[] = [];
  if (!s || typeof s !== 'object') return [`${where}: missing scaling`];
  switch (s.scaling) {
    case 'linear':
      if (!isFiniteNumber(s.from) || !isFiniteNumber(s.to)) {
        out.push(`${where}: linear scaling needs finite 'from' and 'to'`);
      }
      break;
    case 'explicit':
      if (!Array.isArray(s.perRank) || s.perRank.length === 0) {
        out.push(`${where}: explicit scaling needs a non-empty perRank list`);
      } else if (!s.perRank.every(isFiniteNumber)) {
        out.push(`${where}: explicit perRank contains a non-numeric value`);
      }
      break;
    case 'byLevel':
      if (!isFiniteNumber(s.from) || !isFiniteNumber(s.to)) {
        out.push(`${where}: byLevel needs finite 'from' and 'to'`);
      }
      if (!Array.isArray(s.atLevels) || s.atLevels.length !== 2) {
        out.push(`${where}: byLevel needs atLevels as [firstLevel, lastLevel]`);
      } else if (s.atLevels[0] < 1 || s.atLevels[1] > 18) {
        // Champions cap at 18 in normal play; a level-20 extrapolation is the documented
        // trap that would silently overstate damage (DATA-SOURCES §13).
        out.push(`${where}: byLevel atLevels ${JSON.stringify(s.atLevels)} outside 1..18`);
      }
      if (!Number.isInteger(s.steps) || s.steps < 1) {
        out.push(`${where}: byLevel needs an integer steps >= 1`);
      }
      break;
    case 'byLevelExplicit':
      if (!Array.isArray(s.values) || !Array.isArray(s.atLevels)) {
        out.push(`${where}: byLevelExplicit needs values and atLevels`);
      } else if (s.values.length !== s.atLevels.length) {
        out.push(
          `${where}: byLevelExplicit has ${s.values.length} values but ${s.atLevels.length} levels`,
        );
      } else if (s.atLevels.some((l) => l < 1 || l > 18)) {
        out.push(`${where}: byLevelExplicit has a level outside 1..18`);
      }
      break;
    default:
      out.push(`${where}: unknown scaling kind '${(s as { scaling: string }).scaling}'`);
  }
  return out;
}

function checkComponent(c: AbilityComponent, where: string, maxRank: number): string[] {
  const out: string[] = [];
  if (!c.id) out.push(`${where}: component is missing an id`);
  if (!DAMAGE_TYPES.has(c.damageType)) out.push(`${where}: bad damageType '${c.damageType}'`);
  out.push(...checkScalingShape(c.base, `${where}.base`));
  if (!Array.isArray(c.ratios)) {
    out.push(`${where}: ratios must be an array (use [] for none)`);
  } else {
    c.ratios.forEach((r, i) => {
      if (!RATIO_STATS.has(r.stat)) out.push(`${where}.ratios[${i}]: bad stat '${r.stat}'`);
      if (r.stat === 'stacks' && !r.counter) {
        out.push(`${where}.ratios[${i}]: stat 'stacks' requires a 'counter' key`);
      }
      // A pool both champions possess names a quantity but not a champion. Reading the wrong
      // one is not a near miss -- Bel'Veth R's "20% of target's missing health" against the
      // CASTER's missing health is a different number entirely, and nothing downstream could
      // tell. So the owner is required on every such stat -- the health pools, armor, magic
      // resistance and mana alike -- and 'unresolved' must be written down, never left out.
      if (requiresOwner(r.stat) && r.owner === undefined) {
        out.push(
          `${where}.ratios[${i}]: stat '${r.stat}' belongs to a champion and requires an ` +
            `'owner' ('caster' | 'target' | 'unresolved'). It is never defaulted.`,
        );
      }
      if (r.owner !== undefined && !RATIO_OWNERS.has(r.owner)) {
        out.push(`${where}.ratios[${i}]: bad owner '${r.owner}'`);
      }
      out.push(...checkScalingShape(r, `${where}.ratios[${i}]`));

      // A multiplier is a ratio on a ratio, and is held to the same standard: a real stat, a
      // well-formed scaling, and an owner whenever the stat belongs to a champion.
      (r.multipliers ?? []).forEach((m, j) => {
        const at = `${where}.ratios[${i}].multipliers[${j}]`;
        if (!RATIO_STATS.has(m.per)) out.push(`${at}: bad stat '${m.per}'`);
        if (requiresOwner(m.per) && m.owner === undefined) {
          out.push(
            `${at}: stat '${m.per}' belongs to a champion and requires an 'owner' ` +
              `('caster' | 'target' | 'unresolved'). It is never defaulted.`,
          );
        }
        if (m.owner !== undefined && !RATIO_OWNERS.has(m.owner)) {
          out.push(`${at}: bad owner '${m.owner}'`);
        }
        out.push(...checkScalingShape(m.per100, `${at}.per100`));
      });
    });
  }
  if (c.hits !== undefined && (!Number.isInteger(c.hits) || c.hits < 1)) {
    out.push(`${where}: hits must be an integer >= 1`);
  }
  // The scaling must actually expand. This is what catches an explicit list of the wrong
  // length, which is otherwise invisible until the engine runs.
  if (!isLevelScaled(c.base)) {
    try {
      expandByRank(c.base, maxRank);
    } catch (e) {
      out.push(`${where}.base: ${e instanceof ScalingError ? e.message : String(e)}`);
    }
  } else {
    try {
      levelBreakpoints(c.base);
    } catch (e) {
      out.push(`${where}.base: ${e instanceof ScalingError ? e.message : String(e)}`);
    }
  }
  return out;
}

function abilityKey(a: CuratedAbility): string {
  return `${a.champion}${a.form ? ` (${a.form})` : ''}/${a.slot}/${a.abilityName}`;
}

/** Gate 1 — schema. */
export function gateSchema(file: CuratedFile): GateReport {
  const findings: Finding[] = [];
  let checked = 0;
  const seen = new Set<string>();

  for (const a of file.abilities) {
    checked += 1;
    const key = abilityKey(a);
    const push = (message: string) => findings.push({ gate: 'schema', entry: key, message });
    if (seen.has(key)) push('duplicate entry — an ability may appear only once');
    seen.add(key);

    if (!a.champion) push('missing champion');
    if (!SLOTS.has(a.slot)) push(`bad slot '${a.slot}'`);
    if (!a.abilityName) push('missing abilityName');
    if (!INSTANCE_TYPES.has(a.instanceType)) push(`bad instanceType '${a.instanceType}'`);
    // Required as soon as anything is stored: a figure without a type has no resistance.
    if (a.damageType !== undefined && !DAMAGE_TYPES.has(a.damageType)) {
      push(`bad damageType '${a.damageType}'`);
    }
    // Absent is allowed ONLY where the components genuinely disagree — an ability that deals two
    // types, such as a pass that goes out as magic and returns as true. Every component states
    // its own type and that is the one the engine reads; the ability-level field is a summary,
    // and summarising two types as one would be the wrong-resistance defect all over again.
    if (a.damageType === undefined && (a.components?.length ?? 0) > 0) {
      const types = new Set((a.components ?? []).map((c) => c.damageType));
      if (types.size < 2) {
        push('stores damage components of a single type but states no damageType');
      }
    }
    if (!Number.isInteger(a.maxRank) || a.maxRank < 1) push(`bad maxRank '${a.maxRank}'`);
    if (!STATUSES.has(a.verification)) push(`bad verification '${a.verification}'`);
    if (!a.provenance?.source || !a.provenance?.patch) push('provenance needs source and patch');
    if (!Array.isArray(a.components)) {
      push('components must be an array (use [] for a non-damaging ability)');
      continue;
    }
    // 'no-damage' says there is nothing to verify. An entry holding damage contradicts itself.
    if (a.verification === 'no-damage' && a.components.length > 0) {
      push(
        `marked 'no-damage' but carries ${a.components.length} damage component(s). ` +
          `The status is a claim that the ability deals none.`,
      );
    }
    for (const [i, u] of (a.unresolvable ?? []).entries()) {
      if (!u.field || !u.why) {
        push(`unresolvable[${i}] must name the missing field and say why no source settles it`);
      }
    }
    const ids = new Set<string>();
    a.components.forEach((c, i) => {
      if (ids.has(c.id)) push(`duplicate component id '${c.id}'`);
      ids.add(c.id);
      for (const m of checkComponent(c, `components[${i}]`, a.maxRank)) push(m);
    });
    // A relation may only point at a sibling that exists.
    for (const c of a.components) {
      if (c.relation?.kind === 'alternativeTo' && !ids.has(c.relation.componentId)) {
        push(`component '${c.id}' is alternativeTo '${c.relation.componentId}', which is not here`);
      }
      if (c.relation?.kind === 'alternativeTo' && c.relation.componentId === c.id) {
        push(`component '${c.id}' is marked alternativeTo itself`);
      }
    }
  }

  const failedEntries = new Set(findings.map((f) => f.entry));
  return {
    gate: 'schema',
    checked,
    passed: checked - failedEntries.size,
    failed: failedEntries.size,
    findings,
  };
}

/**
 * Gate 3 — the sum guard. THE AATROX CHECK.
 *
 * Two rules, both mechanical:
 *  a) Any ability with two or more components must state `relation` on every one of them.
 *     Intent is recorded, never inferred from a default.
 *  b) No ability may carry two 'adds' components where one label reads as a conditional
 *     variant of the other. That is the shape a double-count takes.
 */
export function gateSumGuard(file: CuratedFile): GateReport {
  const findings: Finding[] = [];
  let checked = 0;
  for (const a of file.abilities) {
    if (a.components.length < 2) continue;
    checked += 1;
    const key = abilityKey(a);
    const push = (message: string) => findings.push({ gate: 'sum-guard', entry: key, message });

    for (const c of a.components) {
      if (!c.relation) {
        push(
          `component '${c.id}'${c.label ? ` (${c.label})` : ''} must state relation: ` +
            `this ability has ${a.components.length} components, so 'adds' cannot be assumed`,
        );
      }
    }
    const adds = a.components.filter((c) => c.relation?.kind === 'adds');
    for (const c of adds) {
      const label = c.label ?? c.id;
      // "Additional" overrides a variant marker: the source is saying it adds (DATA-SOURCES §30).
      if (ALTERNATIVE_MARKERS.test(label) && !/\badditional\b/i.test(label) && adds.length > 1) {
        push(
          `component '${c.id}' is labelled "${label}", which reads as a conditional variant, ` +
            `but is marked 'adds' alongside ${adds.length - 1} other additive component(s). ` +
            `Summing a variant double-counts.`,
        );
      }
      if (DERIVED_ROW.test(label)) {
        push(
          `component '${c.id}' is labelled "${label}" — a Total/Maximum/Minimum row is ` +
            `arithmetic on other rows, not independent damage. It must not be stored.`,
        );
      }
    }
  }
  const failedEntries = new Set(findings.map((f) => f.entry));
  return {
    gate: 'sum-guard',
    checked,
    passed: checked - failedEntries.size,
    failed: failedEntries.size,
    findings,
  };
}

/** Gate 4 — non-champion damage rows must not survive harvest. */
export function gateNonChampion(file: CuratedFile): GateReport {
  const findings: Finding[] = [];
  let checked = 0;
  for (const a of file.abilities) {
    for (const c of a.components) {
      checked += 1;
      const label = c.label ?? c.id;
      if (NON_CHAMPION.test(label)) {
        findings.push({
          gate: 'non-champion',
          entry: abilityKey(a),
          message: `component '${c.id}' is labelled "${label}" — a non-champion damage row. This is a champion-versus-champion tool; it must be dropped at harvest.`,
        });
      }
    }
  }
  return {
    gate: 'non-champion',
    checked,
    passed: checked - findings.length,
    failed: findings.length,
    findings,
  };
}

/**
 * Gate 6 — status honesty. An entry may be 'verified' ONLY where gates 2 and 5 both passed
 * for that specific entry. The file cannot know that on its own, so the batch runner supplies
 * the evidence ledger; an entry claiming 'verified' without a ledger record fails.
 */
export function gateStatusHonesty(
  file: CuratedFile,
  evidence: { roundTripPassed: Set<string>; independentlyChecked: Set<string> },
): GateReport {
  const findings: Finding[] = [];
  let checked = 0;
  for (const a of file.abilities) {
    checked += 1;
    const key = abilityKey(a);

    // An unresolved health owner is an admission that we do not know which champion the
    // ability reads. That is the definition of 'incomplete' (SPECIFICATION §8), so claiming
    // anything better is the dishonesty this gate exists to catch. Checked BEFORE the
    // 'verified'-only skip below, because 'derived' is just as wrong a claim here.
    const unresolved = a.components.flatMap((c) =>
      c.ratios.flatMap((r) => [
        ...(r.owner === 'unresolved' ? [`${c.id}/${r.stat}`] : []),
        ...(r.multipliers ?? [])
          .filter((m) => m.owner === 'unresolved')
          .map((m) => `${c.id}/${r.stat} per 100 ${m.per}`),
      ]),
    );
    if (unresolved.length > 0 && a.verification !== 'incomplete') {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message:
          `marked '${a.verification}' but ${unresolved.length} health ratio(s) do not say whose ` +
          `health they read (${unresolved.join(', ')}). An unresolved owner is 'incomplete'.`,
      });
    }

    // PERMANENT IS NOT PENDING. An unresolved owner is a fact no source states, so it can never
    // be filled in. It must SAY so in the data, or the interface cannot tell a user the
    // difference between an ability nobody has finished and one nobody can finish.
    if (unresolved.length > 0 && (a.unresolvable ?? []).length === 0) {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message:
          `carries ${unresolved.length} unresolved ratio owner(s) (${unresolved.join(', ')}) but ` +
          `records no 'unresolvable' entry. Without it this reads as work pending, which it is not.`,
      });
    }
    if ((a.unresolvable ?? []).length > 0 && a.verification !== 'incomplete') {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message: `marked '${a.verification}' while recording a fact no source states. That is 'incomplete'.`,
      });
    }
    // 'no-damage' is checkable against the entry's own instance type: the two are the same
    // claim said twice, and disagreeing means one of them is wrong.
    if (a.verification === 'no-damage' && a.instanceType !== 'non-damaging-ability') {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message: `marked 'no-damage' but its instanceType is '${a.instanceType}'.`,
      });
    }

    if (a.verification !== 'verified') continue;
    if (!evidence.roundTripPassed.has(key)) {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message: "marked 'verified' but gate 2 (round-trip) has no pass recorded for it",
      });
    }
    if (!evidence.independentlyChecked.has(key)) {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message:
          "marked 'verified' but gate 5 (independent re-derivation) has no pass recorded for it",
      });
    }
    if (a.sourceRevision === undefined) {
      findings.push({
        gate: 'status-honesty',
        entry: key,
        message: "marked 'verified' but carries no sourceRevision, so staleness is untraceable",
      });
    }
  }
  const failedEntries = new Set(findings.map((f) => f.entry));
  return {
    gate: 'status-honesty',
    checked,
    passed: checked - failedEntries.size,
    failed: failedEntries.size,
    findings,
  };
}

/**
 * Gate 2's comparison step, shared so the harvester and the validator cannot drift.
 * `expected` is what the source template renders at each rank (or level); `actual` is what
 * the stored Scaling expands to. Returns the indices that disagree.
 */
export function compareExpansion(
  expected: number[],
  actual: number[],
  tolerance = 1e-6,
): Array<{ index: number; expected: number; actual: number }> {
  const out: Array<{ index: number; expected: number; actual: number }> = [];
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i += 1) {
    const e = expected[i];
    const a = actual[i];
    if (e === undefined || a === undefined || Math.abs(e - a) > tolerance) {
      out.push({ index: i, expected: e ?? Number.NaN, actual: a ?? Number.NaN });
    }
  }
  return out;
}

/**
 * How many decimal places the wiki's renderer shows by default.
 *
 * READ FROM THE SOURCE: `Module:Ability progression` sets `round = args["round"] or 2` for a
 * progression's display, and its `rounding` helper is `floor(val * 10^d + 0.5) / 10^d` — plain
 * half-up. So the wiki prints 140.63 for a value of 140.625, 100 for 99.9975, and 3.71 for
 * 3.7125. Gate 2 compared those at 1e-6 and reported three disagreements that were nothing of
 * the kind (DATA-SOURCES §24).
 */
export const WIKI_DISPLAY_DECIMALS = 2;

/**
 * The wiki's rounding, followed literally rather than approximated.
 *
 * The `+ 1e-9` is not a fudge of the result, it is a fudge of the BOUNDARY. Lua and JavaScript
 * both use doubles but reach a value by different arithmetic, so a figure that is exactly
 * `14.275` in the module can be `14.274999999999999` here. Without the nudge those two round to
 * different numbers and the round-trip reports a disagreement of one hundredth that does not
 * exist. 1e-9 is nine orders of magnitude below the smallest figure the wiki prints.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.floor(value * f + 0.5 + 1e-9) / f;
}

/** Decimal places in a number as JavaScript prints it — the same shortest form Lua's tostring
 *  produces, so it recovers how many places the wiki actually showed. */
export function decimalsOf(value: number): number {
  const s = String(value);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * True when a stored value and the wiki's printed value differ ONLY in the digits the wiki
 * does not print.
 *
 * THIS IS NOT A LOOSER TOLERANCE. It is the wiki's own renderer applied to our value: put the
 * stored figure through the same half-up rounding and ask whether it prints what the wiki
 * printed.
 *
 * The precision is `max(what the wiki printed, the module's default of 2)`, and the `max` is
 * what stops the rule becoming a loose tolerance. Taking the printed decimals alone, a wiki
 * value of `275` would be compared at zero decimals and a stored `275.4` would round to `275`
 * and be waved through — a 0.4 error hidden by the comparison rule itself. At two decimals it
 * stays 275.4, and stays a disagreement. Taking a flat two decimals alone would go wrong the
 * other way on a block carrying `round=3`, where the wiki really does show a third decimal, so
 * the printed precision wins where it is finer.
 *
 * What it therefore clears, and only this: values that differ below what the wiki's own
 * renderer can show, where the round-trip has no evidence either way.
 */
export function agreesAtDisplayPrecision(wiki: number, stored: number): boolean {
  if (!Number.isFinite(wiki) || !Number.isFinite(stored)) return false;
  if (Math.abs(wiki - stored) <= 1e-6) return true;
  const decimals = Math.max(decimalsOf(wiki), WIKI_DISPLAY_DECIMALS);
  return roundHalfUp(stored, decimals) === roundHalfUp(wiki, decimals);
}

/**
 * Gate 2's comparison at the precision the wiki actually renders.
 * Returns the surviving disagreements and, separately, how many were cleared as display
 * rounding — a count that is reported rather than absorbed.
 */
export function compareAtDisplayPrecision(
  expected: number[],
  actual: number[],
): {
  differences: Array<{ index: number; expected: number; actual: number }>;
  clearedByDisplayRounding: number;
} {
  const strict = compareExpansion(expected, actual, 1e-6);
  const differences = strict.filter((d) => !agreesAtDisplayPrecision(d.expected, d.actual));
  return { differences, clearedByDisplayRounding: strict.length - differences.length };
}

/** Runs every machine gate. Gate 2 is reported separately by the harvester. */
export function validateCuratedFile(
  file: CuratedFile,
  evidence: { roundTripPassed: Set<string>; independentlyChecked: Set<string> } = {
    roundTripPassed: new Set(),
    independentlyChecked: new Set(),
  },
): GateReport[] {
  return [
    gateSchema(file),
    gateSumGuard(file),
    gateNonChampion(file),
    gateStatusHonesty(file, evidence),
  ];
}

/** Convenience for item and rune entries, which reuse AbilityComponent. */
export function checkEffectComponents(
  effects: Array<CuratedItemEffect | CuratedRune>,
): Finding[] {
  const findings: Finding[] = [];
  for (const e of effects) {
    const key = 'itemId' in e ? `item ${e.itemId}/${e.key}` : `rune ${e.runeId}`;
    for (const [i, c] of (e.components ?? []).entries()) {
      for (const m of checkComponent(c, `components[${i}]`, 1)) {
        findings.push({ gate: 'schema', entry: key, message: m });
      }
    }
  }
  return findings;
}
