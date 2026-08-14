// THE CROSS-AREA SEAM CHECK.
//
// ═══ THE DEFECT CLASS THIS EXISTS FOR ═══
//
// On 2026-08-13 the engine and the interface were found to hold OPPOSITE rules about one figure.
// `combo-mixed.test.ts` asserted, deliberately and with reasoning, that a mixed instance's split
// may exceed its own total; `AggregateTotal` in `src/ui/primitives` THROWS when a split does not
// match its total, with the comment "do not relax this check". Both suites were green.
//
// They were green because **neither area's checks had ever run over the other area's output.**
// The engine tests its Results against hand-authored expectations. The interface tests its
// assertions against `MOCK_RESULT`. Nothing ran `auditResult` over `runCombo`, so the two rules
// never met. This is not a bug in either area — each was internally consistent and each had
// written its reasoning down. It is a defect the PARTITION creates: one writer per file means
// one reviewer per assumption.
//
// CLAUDE.md's standing instruction is that a defect becomes a mechanical check run over the whole
// population, not a fix to the entry that surfaced it. This file is that check.
//
// ═══ WHAT IT DOES ═══
//
// For each seam — a shape one area PRODUCES and another CONSUMES — it runs the consumer's own
// assertions over the producer's real output. Not over a mock, and not over a tidy example: over
// a battery chosen for the shapes consumers treat specially (multi-type aggregates, zeroes,
// lethal crossings, empty lists, fractional splits).
//
// ═══ WHY IT LIVES IN tests/ ═══
//
// It imports from `src/engine/`, `src/ui/`, `src/url/`, `scripts/extract/` and `scripts/fetch/`
// at once. No agent may do that (CLAUDE.md, the partition), and that is exactly why the seam was
// unwatched. `tests/` belongs to no area and therefore to the lead.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runCombo, simulate, type Catalogue } from '../src/engine';
import { resolveBaseStats } from '../src/engine/champion-stats';
import { evaluateComponent, unsupportedReasons } from '../src/engine/component';
import type { Champion, CuratedAbility, CuratedFile, Item, Scenario } from '../src/types';
import { MOCK_RESULT, MOCK_SCENARIO } from '../src/types';
import type { DamageByType, Result, StatBlock } from '../src/types/result';
import { gateSchema, gateSumGuard } from '../src/types/validate-curated';
import { auditResult, buildBurndownModel } from '../src/ui/burndown/geometry';
import { BURST_KILLS, DEFENDER_HEALS } from '../src/ui/burndown/mock-variants';
import { decodeScenario, encodeScenario } from '../src/url';
import { SEAM_PLANS } from './seam-fixtures';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;

/** The harvester's full-roster proposal. A DRAFT under `build/` — never `/curated/`, which no
 *  test, script or tool writes (CLAUDE.md, the guards). */
const HARVESTED_BATCH = ['build', 'proposed-curated', 'abilities', 'batch-01.json'].join('/');

// ---------------------------------------------------------------------------------------
// The consumer assertions, named once, so each seam runs the SAME set.
// ---------------------------------------------------------------------------------------

/**
 * `AggregateTotal`'s invariant, extracted so it can be applied without rendering.
 *
 * The component throws when a split does not sum to its total, because a composition bar that
 * contradicts the figure above it is a plausible wrong number nobody can see is wrong. That rule
 * governs EVERY aggregate a Result carries, not only the ones a component happens to render
 * today — a figure the interface does not show yet is one it will show tomorrow.
 */
function everyAggregateIn(result: Result): Array<{ label: string; total: number; byType: DamageByType }> {
  return [
    { label: 'burst', total: result.burst.total, byType: result.burst.byType },
    { label: 'dot', total: result.dot.total, byType: result.dot.byType },
    ...result.runningTotal.map((p, i) => ({
      label: `runningTotal[${i}]`,
      total: p.total,
      byType: p.byType,
    })),
    ...result.perInstance
      .filter((i) => i.byType !== undefined)
      .map((i) => ({ label: `instance ${i.index} byType`, total: i.final, byType: i.byType! })),
  ];
}

/** The `StatBlock` invariants the interface's stat panel and the engine both depend on. */
function statBlockComplaints(block: StatBlock, who: string): string[] {
  const out: string[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  if (!near(block.armorBase + block.armorBonus, block.armor)) {
    out.push(`${who}: armorBase + armorBonus !== armor`);
  }
  if (!near(block.magicResistBase + block.magicResistBonus, block.magicResist)) {
    out.push(`${who}: magicResistBase + magicResistBonus !== magicResist`);
  }
  if (!near(block.maxHpBase + block.maxHpBonus, block.maxHp)) {
    out.push(`${who}: maxHpBase + maxHpBonus !== maxHp`);
  }
  if (block.hp > block.maxHp) out.push(`${who}: hp exceeds maxHp`);
  // ABSENT AND ZERO ARE DIFFERENT CLAIMS (§42.3). A stat block that carries a maximum mana but no
  // current one, or the reverse, states half a fact.
  if ((block.mana === undefined) !== (block.maxMana === undefined)) {
    out.push(`${who}: carries one mana figure and not the other`);
  }
  return out;
}

/** Everything the interface asserts about a Result, run as one pass. */
function interfaceComplaintsAbout(result: Result): string[] {
  const out: string[] = [];

  for (const f of auditResult(result)) out.push(`auditResult/${f.kind}: ${f.detail}`);

  try {
    buildBurndownModel(result);
  } catch (error) {
    out.push(`buildBurndownModel threw: ${(error as Error).message}`);
  }

  for (const agg of everyAggregateIn(result)) {
    const sum = agg.byType.physical + agg.byType.magic + agg.byType.true;
    if (Math.abs(sum - agg.total) > 1e-6) {
      out.push(
        `AggregateTotal would throw on ${agg.label}: split sums to ${sum}, total is ${agg.total}`,
      );
    }
  }

  out.push(...statBlockComplaints(result.attackerStats, 'attackerStats'));
  out.push(...statBlockComplaints(result.defenderStats, 'defenderStats'));

  return out;
}

// =========================================================================================
// SEAM 1 — the ENGINE produces a Result; the INTERFACE asserts things about it.
//
// This is the seam the defect was found on. It is checked first and most heavily.
// =========================================================================================

describe('seam: engine Result -> interface assertions', () => {
  it.each(SEAM_PLANS.map((c) => [c.name, c] as const))(
    'the interface accepts the engine’s own output: %s',
    (_name, seamCase) => {
      const result = runCombo(seamCase.plan);
      const complaints = interfaceComplaintsAbout(result);
      // The `why` is printed on failure so the reason this case exists survives the failure.
      expect({ why: seamCase.why, complaints }).toEqual({ why: seamCase.why, complaints: [] });
    },
  );

  it('covers every case in the battery, so the sweep cannot pass by running nothing', () => {
    expect(SEAM_PLANS.length).toBeGreaterThanOrEqual(9);
    const produced = SEAM_PLANS.map((c) => runCombo(c.plan));
    // At least one case must actually reach each of the shapes the battery claims to cover,
    // otherwise a future edit could quietly make them all trivial.
    expect(produced.some((r) => r.perInstance.length === 0)).toBe(true);
    expect(produced.some((r) => r.perInstance.some((i) => i.damageType === 'mixed'))).toBe(true);
    expect(produced.some((r) => r.dot.total > 0)).toBe(true);
    expect(produced.some((r) => r.verdict.burstOnly.lethalAtInstance !== null)).toBe(true);
    expect(produced.some((r) => r.incompleteContributors.length > 0)).toBe(true);
  });

  it('the interface accepts its OWN fixtures too, so the check is not one-directional', () => {
    // If the mock and the engine disagree, the mock is what every component was built against —
    // so it is the more dangerous of the two to leave unchecked.
    for (const [name, fixture] of [
      ['MOCK_RESULT', MOCK_RESULT],
      ['BURST_KILLS', BURST_KILLS],
      ['DEFENDER_HEALS', DEFENDER_HEALS],
    ] as const) {
      expect({ name, complaints: interfaceComplaintsAbout(fixture) }).toEqual({
        name,
        complaints: [],
      });
    }
  });
});

// =========================================================================================
// SEAM 2 — the HARVESTER produces curated entries; the LEAD's gates and the ENGINE's evaluator
// both read them.
// =========================================================================================

describe('seam: harvester CuratedFile -> lead gates and engine evaluator', () => {
  const BATCH = HARVESTED_BATCH;
  let batch: CuratedFile | null = null;
  try {
    batch = readJson<CuratedFile>(BATCH);
  } catch {
    batch = null;
  }

  it('the proposed batch exists and is a whole roster, or the seam is not being checked', () => {
    expect(batch, `${BATCH} is missing — run the harvester before trusting this suite`).not.toBeNull();
    expect(batch!.abilities.length).toBe(937);
  });

  it('gate 1 disagrees with the harvester on a KNOWN number of entries, not a drifting one', () => {
    // DEFINITION: distinct entries carrying at least one gate-1 finding, over the 937 in the
    // proposed batch. It is not zero, and it is not expected to be — DATA-SOURCES §36.2 records
    // 18 gate-1 failures on the full run, and an entry that fails gate 1 may claim no better than
    // `incomplete` (§23), which is the promise working.
    //
    // WHAT THIS CATCHES is a CHANGE. If a contract rule is tightened and the harvester is not
    // updated, this number moves and the seam reports it — instead of the harvester's own suite
    // passing against its own assumptions while the lead's gate rejects its output.
    const report = gateSchema(batch!);
    expect(report.checked).toBe(937);
    expect(report.failed).toBe(18);
  });

  it('gate 3 finds no double-counted alternative in the harvester’s output', () => {
    expect(gateSumGuard(batch!).failed).toBe(0);
  });

  it('the ENGINE never throws on a component the harvester stored', () => {
    // A refusal is honest and is counted below; a THROW is a seam defect — it means the harvester
    // produced a shape the evaluator's own type says is impossible.
    const throwing: string[] = [];
    let components = 0;
    let refused = 0;
    for (const ability of batch!.abilities) {
      for (const [i, c] of ability.components.entries()) {
        components += 1;
        const context = {
          rank: 1,
          maxRank: ability.maxRank,
          level: 11,
          caster: {
            attackDamage: { base: 100, bonus: 60, total: 160 },
              abilityPower: 120,
              maxHP: 2000,
              currentHP: 2000,
              bonusHP: 700,
              armor: 60,
              bonusArmor: 20,
              magicResist: 50,
              bonusMagicResist: 15,
              maxMana: 1000,
              currentMana: 640,
            },
            target: {
              attackDamage: { base: 90, bonus: 30, total: 120 },
              abilityPower: 0,
              maxHP: 1800,
              currentHP: 1200,
              bonusHP: 300,
              armor: 50,
              bonusArmor: 10,
              magicResist: 40,
              bonusMagicResist: 5,
              maxMana: 800,
              currentMana: 400,
            },
          stacks: {},
        };
        try {
          // THE SAME CONTEXT FOR BOTH CALLS, and that is not a detail. `unsupportedReasons`
          // answers "can this be resolved from what I have"; evaluating against a NARROWER
          // context than the one it was asked about turns an honest refusal into a throw, which
          // is a defect in the caller rather than in either area.
          const reasons = unsupportedReasons(c, context);
          if (reasons.length > 0) refused += 1;
          else evaluateComponent(c, context);
        } catch (error) {
          throwing.push(`${ability.champion}/${ability.slot} components[${i}]: ${(error as Error).message}`);
        }
      }
    }
    expect(components).toBeGreaterThan(900);
    expect(throwing).toEqual([]);
    // Reported rather than asserted at a fixed number: this figure is a property of the DATA and
    // moves whenever the harvester improves, so pinning it would make progress look like a
    // regression. What must not change is `throwing`.
    expect(refused).toBeLessThan(components);
  });
});

// =========================================================================================
// SEAM 3 — the DATA PIPELINE produces champions; the ENGINE and the INTERFACE read them.
// =========================================================================================

describe('seam: fetched Champion -> engine stats and interface roster', () => {
  const roster = readJson<Champion[]>('public/data/champions.json');

  it('the engine resolves every fetched champion at every level without a non-finite stat', () => {
    const bad: string[] = [];
    for (const champion of roster) {
      for (const level of [1, 11, 18]) {
        const stats = resolveBaseStats(champion.stats, level);
        for (const [key, value] of Object.entries(stats)) {
          if (!Number.isFinite(value)) bad.push(`${champion.apiname} L${level} ${key}=${value}`);
        }
        if (stats.hp <= 0) bad.push(`${champion.apiname} L${level} hp ${stats.hp}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a mana figure is licensed by the RESOURCE, never by the pool', () => {
    // The rule any StatBlock builder must follow (§43). Stated here as a seam check because the
    // builder does not exist yet: the moment one does, this is the assumption it has to match.
    const wouldBeWrongIfPoolDecided = roster.filter(
      (c) => c.resource !== 'Mana' && (c.stats.mp_base ?? 0) > 0,
    );
    // DEFINITION: champions in the shipped 173-roster whose resource is not mana and whose pool
    // is non-zero. Reading the pool as mana would give every one of them a mana figure.
    expect(wouldBeWrongIfPoolDecided).toHaveLength(17);
    expect(roster.filter((c) => c.resource === 'Mana')).toHaveLength(145);
    expect(roster.filter((c) => !c.resource)).toEqual([]);
  });
});

// =========================================================================================
// SEAM 4 — the URL ENCODER round-trips a Scenario; the ENGINE runs one.
// =========================================================================================

describe('seam: url Scenario -> engine', () => {
  it('a scenario the engine ran survives the encoder and is still the same scenario', () => {
    // The encoder is tested against its own fixtures and the engine against its own. Neither
    // suite uses the other's, so a field one area added and the other never encoded would be
    // invisible to both.
    for (const [name, source] of [
      ['MOCK_SCENARIO', MOCK_SCENARIO],
      ...SEAM_PLANS.map((c) => [c.name, c.plan.scenario] as const),
    ] as const) {
      const decoded = decodeScenario(encodeScenario(source));
      expect({ name, ok: decoded.ok }).toEqual({ name, ok: true });
      if (decoded.ok) expect({ name, s: decoded.scenario }).toEqual({ name, s: source });
    }
  });

  it('the engine accepts a scenario that has been through the encoder', () => {
    const seamCase = SEAM_PLANS[0]!;
    const decoded = decodeScenario(encodeScenario(seamCase.plan.scenario));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const result = runCombo({ ...seamCase.plan, scenario: decoded.scenario });
    expect(interfaceComplaintsAbout(result)).toEqual([]);
  });
});

// =========================================================================================
// SEAM 5 — RUNTIME MIRRORS OF CONTRACT TYPES.
//
// A TypeScript union exists only at compile time, so any area that needs to CHECK membership at
// runtime keeps its own literal copy: `new Set(['physical','magic','true'])`. Every such copy is
// a seam — the contract can gain a member and the copy will not notice, and nothing in either
// area's own suite compares the two.
//
// This is the same defect class as the split-rounding disagreement, in a more mechanical form:
// two areas holding incompatible ideas about one shape, each internally consistent.
//
// THE CHECK HAS TWO HALVES, and it needs both:
//   1. The canonical member list below is declared with a COMPILE-TIME exhaustiveness guard, so
//      `tsc` fails if the contract gains or loses a member and this file is not updated.
//   2. Each mirror's literal is read OUT OF ITS SOURCE FILE and compared. Reading the source is
//      what lets private constants be checked at all — most of these are not exported, and the
//      precedent is `token-audit.test.ts`, which reads the stylesheet for the same reason.
// =========================================================================================

/**
 * Declare every member of a union exactly once.
 *
 * `Record<T, 1>` makes a MISSING member a compile error; the `never` intersection makes an EXTRA
 * one a compile error. So the list cannot drift from the type without `npm run typecheck` failing.
 */
function membersOf<T extends string>() {
  return <R extends Record<T, 1>>(record: R & Record<Exclude<keyof R, T>, never>): string[] =>
    Object.keys(record);
}

const DAMAGE_TYPE = membersOf<import('../src/types').DamageType>()({
  physical: 1,
  magic: 1,
  true: 1,
});
const ABILITY_SLOT = membersOf<import('../src/types').AbilitySlot>()({
  P: 1,
  Q: 1,
  W: 1,
  E: 1,
  R: 1,
});
const VERIFICATION_STATUS = membersOf<import('../src/types').VerificationStatus>()({
  verified: 1,
  derived: 1,
  incomplete: 1,
  'no-damage': 1,
});
const INSTANCE_TYPE = membersOf<import('../src/types').InstanceType>()({
  'basic-attack': 1,
  'damaging-ability': 1,
  'non-damaging-ability': 1,
  'empowered-attack': 1,
  'item-active': 1,
  'on-hit': 1,
  'dot-application': 1,
});
const RATIO_OWNER = membersOf<import('../src/types').RatioOwner>()({
  caster: 1,
  target: 1,
  holder: 1,
  unresolved: 1,
});
const RATIO_STAT = membersOf<import('../src/types').RatioStat>()({
  baseAD: 1,
  bonusAD: 1,
  totalAD: 1,
  AP: 1,
  maxHP: 1,
  bonusHP: 1,
  currentHP: 1,
  missingHP: 1,
  armor: 1,
  bonusArmor: 1,
  magicResist: 1,
  bonusMagicResist: 1,
  maxMana: 1,
  currentMana: 1,
  stacks: 1,
});
const DEFENSIVE_KIND = membersOf<
  NonNullable<import('../src/types').CuratedDefensiveEffect['kind']>
>()({
  'damage-reduction': 1,
  'type-specific-reduction': 1,
  'resistance-grant': 1,
  shield: 1,
  'spell-shield': 1,
  immunity: 1,
  'execute-threshold': 1,
  heal: 1,
  'max-health-grant': 1,
});
const DEFENSIVE_ACTIVATION = membersOf<
  import('../src/types').CuratedDefensiveEffect['activation']
>()({ 'always-active': 1, conditional: 1, 'not-stated': 1 });
const DEFENSIVE_UNIT = membersOf<
  NonNullable<import('../src/types').CuratedDefensiveEffect['unit']>
>()({
  flat: 1,
  percent: 1,
  'percent-of-damage-dealt': 1,
  'healing-multiplier': 1,
});
const COMBO_STEP_KIND = membersOf<import('../src/types').ComboStepKind>()({
  'basic-attack': 1,
  ability: 1,
  'empowered-attack': 1,
  'item-active': 1,
  'on-hit': 1,
});
const RANGE_TYPE = membersOf<import('../src/types').RangeType>()({ Melee: 1, Ranged: 1 });
const ADAPTIVE_TYPE = membersOf<import('../src/types').AdaptiveType>()({ Physical: 1, Magic: 1 });
const RUNE_TREE = membersOf<import('../src/types').RuneTree>()({
  Domination: 1,
  Inspiration: 1,
  Precision: 1,
  Resolve: 1,
  Sorcery: 1,
});
// Object KEYS, not union members — the encoder must carry every field of these shapes or a
// shared link silently loses one.
const SCENARIO_KEY = membersOf<keyof import('../src/types').Scenario>()({
  version: 2,
  attacker: 1,
  defender: 1,
  combo: 1,
});
const CHAMPION_CONFIG_KEY = membersOf<keyof import('../src/types').ChampionConfig>()({
  apiname: 1,
  level: 1,
  abilityRanks: 1,
  items: 1,
  runes: 1,
  persistent: 1,
  entryState: 1,
});
const RUNE_PAGE_KEY = membersOf<keyof import('../src/types').RunePage>()({
  keystone: 1,
  primary: 1,
  secondary: 1,
  shards: 1,
});
const COMBO_STEP_KEY = membersOf<keyof import('../src/types').ComboStep>()({
  id: 1,
  kind: 1,
  ref: 1,
  options: 1,
  hitCounts: 1,
});
const DAMAGE_BY_TYPE_KEY = membersOf<keyof import('../src/types/result').DamageByType>()({
  physical: 1,
  magic: 1,
  true: 1,
});

interface Mirror {
  file: string;
  constant: string;
  canonical: string[];
  /** 'exhaustive' — must equal the contract exactly. 'subset' — a deliberate proper subset. */
  relation: 'exhaustive' | 'subset';
  why: string;
}

/**
 * EVERY runtime mirror of a contract type in the project, found by sweeping `src/` and `scripts/`
 * for a named constant holding a literal list of strings and keeping the ones whose members are a
 * contract union or a contract shape's keys.
 *
 * DEFINITION of the population: a `const` (exported or not) whose initialiser is an array or
 * `new Set([…])` of string literals, where those literals are members of a type declared in
 * `src/types/`. 27 were found; the 26 below are the ones a drift in would change behaviour.
 */
const MIRRORS: Mirror[] = [
  { file: 'src/types/validate-curated.ts', constant: 'DAMAGE_TYPES', canonical: DAMAGE_TYPE, relation: 'exhaustive', why: 'gate 1 rejects a damage type it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'SLOTS', canonical: ABILITY_SLOT, relation: 'exhaustive', why: 'gate 1 rejects a slot it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'STATUSES', canonical: VERIFICATION_STATUS, relation: 'exhaustive', why: 'gate 1 rejects a verification status it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'INSTANCE_TYPES', canonical: INSTANCE_TYPE, relation: 'exhaustive', why: 'gate 1 rejects an instance type it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'RATIO_OWNERS', canonical: RATIO_OWNER, relation: 'exhaustive', why: 'gate 1 rejects an owner it does not list — a new owner arm would fail every entry using it' },
  { file: 'src/types/validate-curated.ts', constant: 'RATIO_STATS', canonical: RATIO_STAT, relation: 'exhaustive', why: 'gate 1 rejects a ratio stat it does not list, so a new stat would make every ability using it incomplete' },
  { file: 'src/types/validate-curated.ts', constant: 'DEFENSIVE_KINDS', canonical: DEFENSIVE_KIND, relation: 'exhaustive', why: 'gate 1 rejects a defensive kind it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'DEFENSIVE_ACTIVATIONS', canonical: DEFENSIVE_ACTIVATION, relation: 'exhaustive', why: 'gate 1 rejects an activation it does not list' },
  { file: 'src/types/validate-curated.ts', constant: 'DEFENSIVE_UNITS', canonical: DEFENSIVE_UNIT, relation: 'exhaustive', why: 'gate 1 rejects a unit it does not list' },
  { file: 'src/url/v1.ts', constant: 'SCENARIO_KEYS', canonical: SCENARIO_KEY, relation: 'exhaustive', why: 'a scenario field missing here is dropped from every shared link' },
  { file: 'src/url/v1.ts', constant: 'CHAMPION_KEYS', canonical: CHAMPION_CONFIG_KEY, relation: 'exhaustive', why: 'a champion field missing here is dropped from every shared link' },
  { file: 'src/url/v1.ts', constant: 'RUNE_KEYS', canonical: RUNE_PAGE_KEY, relation: 'exhaustive', why: 'a rune-page field missing here is dropped from every shared link' },
  // ═══ A FROZEN FORMAT VERSION IS A SUBSET BY DESIGN, NOT A DRIFT ═══
  //
  // Version 1's key lists are a HISTORICAL RECORD of what version 1 could carry, and FORMAT.md
  // §3 forbids editing them: every version ever published stays readable, and a link written in
  // 2026 must decode the same way in 2028. So they may LACK a contract field — that is what
  // "frozen" means — and may never gain one. Only the CURRENT version has to stay in step.
  //
  // The `subset` relation still catches the failure that matters: a version 1 list gaining a key
  // the contract does not have, which would be someone editing a frozen format.
  { file: 'src/url/v1.ts', constant: 'V1_STEP_KINDS', canonical: COMBO_STEP_KIND, relation: 'subset', why: 'FROZEN at version 1. The index is the wire value; reordering or removing an entry breaks every published link' },
  { file: 'src/url/v1.ts', constant: 'STEP_ALL_KEYS', canonical: COMBO_STEP_KEY, relation: 'subset', why: 'FROZEN at version 1, which predates ComboStep.hitCounts. Version 2 carries it (src/url/v2.ts)' },
  { file: 'src/url/v2.ts', constant: 'STEP_ALL_KEYS', canonical: COMBO_STEP_KEY, relation: 'exhaustive', why: 'THE CURRENT VERSION. A combo-step field missing here makes a scenario using it unshareable (SPECIFICATION §12) — the drift found on 2026-08-14 and closed by version 2' },
  { file: 'src/url/v2.ts', constant: 'SCENARIO_KEYS', canonical: SCENARIO_KEY, relation: 'exhaustive', why: 'a scenario field missing here is dropped from every shared link' },
  { file: 'src/engine/combo.ts', constant: 'DAMAGE_TYPES', canonical: DAMAGE_TYPE, relation: 'exhaustive', why: 'the runner walks each type once; a missing one is damage that never resolves' },
  { file: 'src/engine/rounding.ts', constant: 'SPLIT_ORDER', canonical: DAMAGE_BY_TYPE_KEY, relation: 'exhaustive', why: 'apportionment must cover every key of the split, or the parts stop summing to the whole' },
  { file: 'src/ui/primitives/DamageValue.tsx', constant: 'DAMAGE_TYPES', canonical: DAMAGE_TYPE, relation: 'exhaustive', why: 'a type missing here renders no composition-bar segment for it' },
  { file: 'src/ui/burndown/geometry.ts', constant: 'DAMAGE_TYPES', canonical: DAMAGE_TYPE, relation: 'exhaustive', why: 'a type missing here is dropped from the DoT tail and from the audit' },
  { file: 'src/ui/combo/sequence.ts', constant: 'SLOT_ORDER', canonical: ABILITY_SLOT, relation: 'exhaustive', why: 'a slot missing here sorts to the front of the shelf and reads as an ordering bug' },
  { file: 'src/ui/slice/VerticalSlice.tsx', constant: 'SLOTS', canonical: ABILITY_SLOT, relation: 'exhaustive', why: 'a slot missing here cannot be added to the slice combo' },
  { file: 'scripts/extract/page-cache.ts', constant: 'SLOTS', canonical: ABILITY_SLOT, relation: 'exhaustive', why: 'a slot missing here is never harvested — the defect that lost 69 abilities once already' },
  { file: 'scripts/fetch/champions.ts', constant: 'RANGE_TYPES', canonical: RANGE_TYPE, relation: 'exhaustive', why: 'the fetch throws on a range type it does not list' },
  { file: 'scripts/fetch/champions.ts', constant: 'ADAPTIVE_TYPES', canonical: ADAPTIVE_TYPE, relation: 'exhaustive', why: 'the fetch throws on an adaptive type it does not list' },
  { file: 'scripts/fetch/runes.ts', constant: 'RUNE_TREES', canonical: RUNE_TREE, relation: 'exhaustive', why: 'a tree missing here drops its whole rune page' },
  { file: 'src/engine/component.ts', constant: 'CORE_RATIO_STATS', canonical: RATIO_STAT, relation: 'subset', why: 'DELIBERATE SUBSET — the four stats that belong to the caster and have no second reading' },
  { file: 'src/types/data.ts', constant: 'HEALTH_POOL_STATS', canonical: RATIO_STAT, relation: 'subset', why: 'DELIBERATE SUBSET — the four health pools' },
];

/** Pull the string literals out of `const NAME … = [ … ]` or `= new Set([ … ])`. */
function mirrorMembers(file: string, constant: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const declaration = new RegExp(
    `(?:export\\s+)?const\\s+${constant}\\b[^=]*=\\s*(?:new Set\\(\\s*)?\\[([\\s\\S]*?)\\]`,
  );
  const match = declaration.exec(source);
  if (!match) throw new Error(`${file}: no literal list found for ${constant}`);
  return [...match[1]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

/**
 * DRIFT THAT IS KNOWN, MEASURED, AND NOT YET CLOSED.
 *
 * A red suite blocks every merge (SPECIFICATION §14), so a found-but-unfixed seam is recorded
 * here rather than left failing. The list is asserted EXACTLY: a NEW drift fails the check, and
 * so does fixing one of these without removing its entry. It cannot quietly grow and it cannot
 * quietly shrink.
 *
 * This is the same device gate 1's `failed === 18` uses in this file: pin the known number so a
 * change in it is what reports.
 */
const KNOWN_DRIFT: Array<{ file: string; constant: string; missing: string[]; note: string }> = [
  // ═══ EMPTY, AND THAT IS THE POINT ═══
  //
  // It held one entry from 2026-08-14: `src/url/v1.ts` `STEP_ALL_KEYS` was missing
  // `ComboStep.hitCounts`, so a scenario using any of the 7 abilities that store `variableHits`
  // could not be shared at all (SPECIFICATION §12). It was STRUCK on the same day, when version 2
  // of the link format added a fifth positional slot for it — see `src/url/v2.ts` and
  // DATA-SOURCES §46. Version 1 is not edited and is still decoded; frozen version 1 links are
  // pinned in `round-trip.test.ts`.
  //
  // The list stays here rather than being deleted with the entry, because it is the device that
  // keeps a FUTURE drift from being left unrecorded: a red suite blocks every merge, so a
  // found-but-unfixed seam needs somewhere honest to sit.
];

describe('seam: runtime mirrors of contract types', () => {
  it('finds every mirror it claims to check — the sweep cannot pass by reading nothing', () => {
    expect(MIRRORS.length).toBeGreaterThanOrEqual(28);
    for (const m of MIRRORS) expect(mirrorMembers(m.file, m.constant).length).toBeGreaterThan(0);
  });

  it('every KNOWN_DRIFT entry is still real — a fixed one must be struck from the list', () => {
    // Without this, closing a drift would leave a permanent excuse behind that quietly forgives
    // the next one on the same constant.
    for (const drift of KNOWN_DRIFT) {
      const found = mirrorMembers(drift.file, drift.constant);
      for (const key of drift.missing) {
        expect({ drift: `${drift.constant} is still missing ${key}`, present: found.includes(key) })
          .toEqual({ drift: `${drift.constant} is still missing ${key}`, present: false });
      }
    }
  });

  it('records no known drift — every mirror is in step with the contract', () => {
    // Was 1 until 2026-08-14. A drift is recorded here ONLY while it is unfixed; leaving a fixed
    // one behind would forgive the next drift on the same constant.
    expect(KNOWN_DRIFT).toEqual([]);
  });

  it.each(MIRRORS.map((m) => [`${m.file} ${m.constant}`, m] as const))(
    'stays in step with the contract: %s',
    (_label, mirror) => {
      const found = mirrorMembers(mirror.file, mirror.constant);
      if (mirror.relation === 'subset') {
        // A subset may omit members; it may NEVER contain one the contract does not have.
        expect({ why: mirror.why, extra: found.filter((m) => !mirror.canonical.includes(m)) }).toEqual(
          { why: mirror.why, extra: [] },
        );
        return;
      }
      const known = KNOWN_DRIFT.find(
        (d) => d.file === mirror.file && d.constant === mirror.constant,
      );
      const expected = [...mirror.canonical]
        .filter((m) => !(known?.missing ?? []).includes(m))
        .sort();
      expect({ why: mirror.why, members: [...found].sort() }).toEqual({
        why: mirror.why,
        members: expected,
      });
    },
  );
});

// =========================================================================================
// SEAM 6 — A REAL SCENARIO, END TO END: shipped data -> simulate -> the interface.
//
// The seams above each check ONE join. This checks the whole spine at once, on the real files
// in `public/data/` and the harvester's real 937-entry batch, with no hand-authored plan
// anywhere: a Scenario a user could build goes in, and every assertion the interface makes
// about a Result runs over what comes out.
//
// It is the check that could not exist before `simulate` did — everything ran on hand-authored
// ComboPlans, so nothing had ever turned a configuration into a Result.
// =========================================================================================

describe('seam: scenario -> simulate -> interface, on the shipped data', () => {
  const roster = readJson<Champion[]>('public/data/champions.json');
  const itemPool = readJson<Item[]>('public/data/items.json');
  const batch = readJson<CuratedFile>(HARVESTED_BATCH);

  const byApiname = new Map(roster.map((c) => [c.apiname, c]));
  const byItemId = new Map(itemPool.map((i) => [i.id, i]));
  const byChampion = new Map<string, CuratedAbility[]>();
  for (const ability of batch.abilities) {
    const list = byChampion.get(ability.champion) ?? [];
    list.push(ability);
    byChampion.set(ability.champion, list);
  }

  const catalogue: Catalogue = {
    champion: (apiname) => byApiname.get(apiname),
    item: (id) => byItemId.get(id),
    // The batch keys abilities by the champion's DISPLAY name; a scenario names the Data Dragon
    // apiname. Joining through the roster is what makes "Nunu & Willump" reachable from "Nunu" —
    // a mismatch that would otherwise silently supply zero abilities and look like a champion
    // with no kit (DATA-SOURCES §10).
    abilities: (apiname) => byChampion.get(byApiname.get(apiname)?.name ?? apiname) ?? [],
    // ADDED 2026-08-14 WITH THE LOOKUPS THEMSELVES, and this seam is how the omission surfaced:
    // extending `Catalogue` left this hand-built one behind, and the first step that asked for an
    // item effect threw rather than reporting a gap. That is the exact defect class this file
    // exists for — a producer changing a shape a consumer was never told about.
    //
    // Both answer [] here on purpose. This seam runs over the SHIPPED data, and nothing publishes
    // item effects or defensive entries to `public/data/` yet, so an empty list is what the site
    // really has. When the publish step lands, these read from it and the assertions below about
    // unmodelled steps will change with it.
    itemEffects: () => [],
    defensiveEffects: () => [],
  };

  const scenarioFor = (attacker: string, defender: string, combo: Scenario['combo']): Scenario => ({
    version: 2,
    attacker: {
      apiname: attacker,
      level: 11,
      abilityRanks: { Q: 5, W: 3, E: 3, R: 2 },
      items: [3071, 3031, 3036],
      runes: { keystone: 8010, primary: [], secondary: [], shards: [] },
      persistent: {},
      entryState: {},
    },
    defender: {
      apiname: defender,
      level: 11,
      abilityRanks: { Q: 5, W: 3, E: 3, R: 2 },
      items: [3047, 3143],
      runes: { keystone: null, primary: [], secondary: [], shards: [] },
      persistent: {},
      entryState: {},
    },
    combo,
  });

  it('turns a real scenario into a Result the interface accepts without complaint', () => {
    const outcome = simulate(
      scenarioFor('Lux', 'Garen', [
        { id: 'q1', kind: 'ability', ref: 'Q' },
        { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
        { id: 'e1', kind: 'ability', ref: 'E' },
        { id: 'r1', kind: 'ability', ref: 'R' },
      ]),
      catalogue,
    );
    expect(outcome.ok ? [] : outcome.refusals).toEqual([]);
    if (!outcome.ok) return;

    expect(interfaceComplaintsAbout(outcome.result)).toEqual([]);
    expect(outcome.result.perInstance).toHaveLength(4);
    expect(outcome.result.burst.total).toBeGreaterThan(0);
  });

  it('holds across a SWEEP of the roster, not one lucky matchup', () => {
    // DEFINITION: every one of the 173 champions in the shipped roster, each attacking Garen
    // with a Q-W-E-R-plus-basic-attack combo — 173 scenarios, 865 planned instances. One
    // passing matchup proves almost nothing; a champion whose kit produces an awkward shape is
    // exactly what a seam check is for.
    const complaints: string[] = [];
    let produced = 0;
    for (const champion of roster) {
      const outcome = simulate(
        scenarioFor(champion.apiname, 'Garen', [
          { id: 'q1', kind: 'ability', ref: 'Q' },
          { id: 'w1', kind: 'ability', ref: 'W' },
          { id: 'e1', kind: 'ability', ref: 'E' },
          { id: 'r1', kind: 'ability', ref: 'R' },
          { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
        ]),
        catalogue,
      );
      if (!outcome.ok) {
        complaints.push(`${champion.apiname}: refused — ${outcome.refusals[0]!.reason}`);
        continue;
      }
      produced += 1;
      for (const c of interfaceComplaintsAbout(outcome.result)) {
        complaints.push(`${champion.apiname}: ${c}`);
      }
    }
    expect(complaints).toEqual([]);
    expect(produced).toBe(173);
  });

  it('refuses by NAME rather than returning a smaller number', () => {
    const unknownChampion = simulate(scenarioFor('NotAChampion', 'Garen', []), catalogue);
    expect(unknownChampion.ok).toBe(false);
    if (!unknownChampion.ok) {
      expect(unknownChampion.refusals[0]!.path).toBe('attacker.apiname');
      expect(unknownChampion.refusals[0]!.reason).toContain('NotAChampion');
    }

    const base = scenarioFor('Lux', 'Garen', []);
    const unknownItem = simulate(
      { ...base, attacker: { ...base.attacker, items: [999999] } },
      catalogue,
    );
    expect(unknownItem.ok).toBe(false);
    if (!unknownItem.ok) expect(unknownItem.refusals[0]!.path).toContain('items[0]');
  });

  it('a step it cannot model contributes NOTHING and says why, rather than refusing everything', () => {
    // SPECIFICATION §8 at the point a scenario is assembled: an item active has no curated data
    // yet, so it is named and excluded — and the rest of the combo still produces a number.
    const outcome = simulate(
      scenarioFor('Lux', 'Garen', [
        { id: 'q1', kind: 'ability', ref: 'Q' },
        { id: 'i1', kind: 'item-active', ref: '3031' },
      ]),
      catalogue,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.perInstance[1]!.final).toBe(0);
    expect(outcome.result.incompleteContributors).toHaveLength(1);
    // THE ASSERTION IS THE INTENT, NOT THE PROSE. It matched /item actives/ until 2026-08-14,
    // when item actives became modelled and the note stopped being a blanket "not modelled yet"
    // and started naming the item and what is actually absent. The seam's question is unchanged:
    // the step contributes nothing, it is named, and it says why — so that is what is asserted,
    // rather than a sentence that will move again the moment the effects are published.
    const note = outcome.result.incompleteContributors[0]!.reason.note!;
    expect(note).toMatch(/Infinity Edge/);
    expect(note).toMatch(/contributes nothing/);
    expect(outcome.result.incompleteContributors[0]!.sourceLabel).toMatch(/Infinity Edge/);
  });

  it('populates mana from the RESOURCE, and leaves it absent for every other resource', () => {
    const mana = simulate(scenarioFor('Ryze', 'Garen', []), catalogue);
    const none = simulate(scenarioFor('Garen', 'Garen', []), catalogue);
    // Shen's pool is 400 ENERGY. Non-zero, and the mana figure must still be absent — this is
    // the case that made `Champion.resource` necessary (DATA-SOURCES §43).
    const energy = simulate(scenarioFor('Shen', 'Garen', []), catalogue);
    expect([mana.ok, none.ok, energy.ok]).toEqual([true, true, true]);
    if (!mana.ok || !none.ok || !energy.ok) return;
    expect(mana.result.attackerStats.maxMana).toBeGreaterThan(0);
    expect(none.result.attackerStats.maxMana).toBeUndefined();
    expect(energy.result.attackerStats.maxMana).toBeUndefined();
  });

  it('RYZE Q IS STILL BLOCKED, AND NOT BY MANA — the finding, pinned', () => {
    // The stat block now carries mana and the ENGINE resolves a mana ratio (proved end to end in
    // combo.test.ts). Ryze Q still contributes nothing, and the reason is a different blocker:
    // the wiki states "2% of maximum mana" and never says WHOSE, so the harvested ratio carries
    // `owner: 'unresolved'` and the entry is PERMANENTLY incomplete (DATA-SOURCES §16). Data
    // Dragon cannot settle it either — it exposes no ability ratios at all (SPECIFICATION §7.3),
    // so the attribution rule of §42.7 has nothing to work with here.
    //
    // DEFINITION: mana ratios stored across the 937-entry batch: 8, of which 0 state an owner.
    // Adding mana to the stat block removed a blocker that was real without being the last one.
    const manaRatios = batch.abilities.flatMap((a) =>
      a.components.flatMap((c) =>
        c.ratios.filter((r) => r.stat === 'maxMana' || r.stat === 'currentMana'),
      ),
    );
    expect(manaRatios).toHaveLength(8);
    expect(manaRatios.filter((r) => r.owner !== 'unresolved')).toEqual([]);

    const outcome = simulate(
      scenarioFor('Ryze', 'Garen', [{ id: 'q1', kind: 'ability', ref: 'Q' }]),
      catalogue,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.perInstance[0]!.final).toBe(0);
    expect(outcome.result.incompleteContributors[0]!.reason.kind).toBe('permanent');
  });
});
