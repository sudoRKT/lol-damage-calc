// RUNES, END TO END — from a stored rune value to a number in the burst total.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// `RUNE_DELIVERY`, `RUNES_READ_BUT_NOT_DELIVERABLE` and `withRuneRows` were built on 2026-08-15
// and shipped with NO test in this engine. Scorch was confirmed by opening a browser and reading
// two figures off the page. That is evidence, and it is the only kind this file replaces: a
// browser check confirms one scenario on one day, and cannot say whether the rune fires twice in a
// two-ability combo, whether it fires on a basic attack, or whether a rune the engine cannot
// deliver is reported or silently dropped.
//
// ═══ WHAT IS AND IS NOT REAL BELOW ═══
//
// The rune IDS are real, because they are the keys of the engine's own delivery map and a test
// that invented an id would test nothing. **Every VALUE is hand-authored.** No rune's real damage,
// ratio or cooldown appears anywhere in this file, and nothing here reads `/curated/`,
// `public/data/` or Data Dragon. A rune fixture below deals 30 magic damage because 30 is a round
// number, not because any rune deals 30.
//
// Every expected figure is arithmetic on paper: the defender has no armor and no magic resistance,
// so an instance's damage reaches the total unmitigated and a combo's total is the sum of its rows.

import { describe, expect, it } from 'vitest';
import type { CuratedRune, Result, Scenario } from '../types';
import { RUNE_DELIVERY, RUNES_READ_BUT_NOT_DELIVERABLE, simulate, type SimulationResult } from './simulate';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario as makeScenario,
} from './fixtures';

const ATTACKER = 'Striker';
const DEFENDER = 'Warden';

/** The one rune id the engine delivers today. Its VALUE below is invented. */
const SCORCH = 8237;
/** Four ids the engine stores a reason for and does not deliver. */
const CHEAP_SHOT = 8126;
const SUDDEN_IMPACT = 8143;
const GRASP = 8437;
const AFTERSHOCK = 8439;

/** A stored rune carrying one flat damage component. Nothing else about it is stated. */
function rune(runeId: number, opts: { name?: string; damage?: number; damageType?: 'physical' | 'magic' | 'true' } = {}): CuratedRune {
  return {
    runeId,
    runeName: opts.name ?? `Rune ${runeId}`,
    tree: 'Sorcery',
    components: [
      {
        id: `rune-${runeId}-1`,
        damageType: opts.damageType ?? 'magic',
        base: { scaling: 'explicit', perRank: [opts.damage ?? 30] },
        ratios: [],
      },
    ],
    verification: 'derived',
    provenance: { source: 'hand-authored engine fixture', patch: 'fixture' },
  } as CuratedRune;
}

/**
 * One scenario: an attacker wearing `worn` runes, against a defender with no resistances.
 * `abilityDamage` is what each ability step deals; `attackDamage` is what a basic attack deals.
 */
function run(opts: {
  worn: number[];
  runeEffects: CuratedRune[];
  combo?: Array<{ kind: 'ability' | 'basic-attack' }>;
  abilityDamage?: number;
  attackDamage?: number;
}): SimulationResult {
  const steps = opts.combo ?? [{ kind: 'ability' as const }];
  const combo = steps.map((s, i) =>
    comboStep(`s${i + 1}`, s.kind === 'ability' ? { kind: 'ability', ref: 'Q' } : { kind: 'basic-attack' }),
  );
  const scenario: Scenario = makeScenario({
    attacker: championConfig({
      apiname: ATTACKER,
      level: 1,
      // The keystone slot plus the primary tree — the engine reads all of them the same way.
      runes: { keystone: opts.worn[0] ?? null, primary: opts.worn.slice(1), secondary: [], shards: [] },
    }),
    defender: championConfig({ apiname: DEFENDER, level: 1 }),
    combo,
  });
  return simulate(
    scenario,
    fixtureCatalogue({
      champions: [
        fixtureChampion({ apiname: ATTACKER, adBase: opts.attackDamage ?? 0 }),
        fixtureChampion({ apiname: DEFENDER }),
      ],
      abilities: [
        fixtureAbility({
          champion: ATTACKER,
          slot: 'Q',
          damageType: 'physical',
          perRank: Array.from({ length: 5 }, () => opts.abilityDamage ?? 200),
        }),
      ],
      runeEffects: opts.runeEffects,
    }),
  );
}

function resultOf(outcome: SimulationResult): Result {
  if (!outcome.ok) throw new Error(`scenario refused: ${JSON.stringify(outcome.refusals)}`);
  return outcome.result;
}

function excluded(result: Result, fragment: string): boolean {
  return result.excludedMechanics.some((line) => line.includes(fragment));
}

// ---------------------------------------------------------------------------------------

describe('the read population is a map, and its membership is the whole rule', () => {
  it('exactly one rune is delivered today, and it is Scorch', () => {
    // Not a style check. `RUNE_DELIVERY` is a READ POPULATION: a member is a rune whose trigger
    // sentence a person has read. If this count rises, someone read a sentence — and if it rises
    // without that, this test is the one that should have stopped it.
    expect([...RUNE_DELIVERY.keys()]).toEqual([SCORCH]);
  });

  it('no rune is in both maps at once', () => {
    for (const id of RUNE_DELIVERY.keys()) {
      expect(RUNES_READ_BUT_NOT_DELIVERABLE.has(id)).toBe(false);
    }
  });

  it('every undeliverable rune states a reason that is a sentence, not a status', () => {
    for (const [id, reason] of RUNES_READ_BUT_NOT_DELIVERABLE) {
      expect(reason.length).toBeGreaterThan(40);
      // "not modelled" restates the status as though it were the cause — SPECIFICATION §8.
      expect(reason.toLowerCase()).not.toBe('not modelled');
      expect(Number.isInteger(id)).toBe(true);
    }
  });
});

describe('a delivered rune reaches the total', () => {
  it('Scorch adds its own damage to a one-ability combo', () => {
    // 200 physical from the ability + 30 magic from the rune, against 0 armor and 0 magic
    // resistance = 230.
    const result = resultOf(run({ worn: [SCORCH], runeEffects: [rune(SCORCH, { name: 'Scorch' })] }));
    expect(result.burst.total).toBe(230);
  });

  it('the rune is its own row, not folded into the ability that carried it', () => {
    const result = resultOf(run({ worn: [SCORCH], runeEffects: [rune(SCORCH, { name: 'Scorch' })] }));
    expect(result.perInstance).toHaveLength(2);
    expect(result.perInstance[0]!.afterReductions).toBe(200);
    expect(result.perInstance[1]!.afterReductions).toBe(30);
  });

  it('the two rows keep their own damage types — physical carrier, magic rune', () => {
    // The reason a rider gets its own row at all (DATA-SOURCES §53.3): folding a magic rune into a
    // physical carrier makes one mixed instance, and a mixed instance gets no resistance working.
    const result = resultOf(run({ worn: [SCORCH], runeEffects: [rune(SCORCH, { name: 'Scorch' })] }));
    expect(result.perInstance[0]!.damageType).toBe('physical');
    expect(result.perInstance[1]!.damageType).toBe('magic');
    expect(result.burst.byType.physical).toBe(200);
    expect(result.burst.byType.magic).toBe(30);
  });

  it('the rune row names the ability it rode on, so the burndown can bracket it', () => {
    const result = resultOf(run({ worn: [SCORCH], runeEffects: [rune(SCORCH, { name: 'Scorch' })] }));
    expect(result.perInstance[1]!.carriedBy).toBe(result.perInstance[0]!.stepId);
  });

  it('it fires ONCE across a three-ability combo, not once per ability', () => {
    // The source states a cooldown and this engine has no clock (§3.2), so firing once is the
    // reading that cannot overstate. Three abilities = 600, plus 30 once = 630. Firing per ability
    // would give 690, which is the overstatement this asserts against.
    const result = resultOf(
      run({
        worn: [SCORCH],
        runeEffects: [rune(SCORCH, { name: 'Scorch' })],
        combo: [{ kind: 'ability' }, { kind: 'ability' }, { kind: 'ability' }],
      }),
    );
    expect(result.burst.total).toBe(630);
    expect(result.perInstance).toHaveLength(4);
  });

  it('it rides on the FIRST ability, even when a basic attack came first', () => {
    // 100 from the attack + 200 from the ability + 30 from the rune = 330, with the rune's row
    // sitting immediately after the ability rather than after the attack.
    const result = resultOf(
      run({
        worn: [SCORCH],
        runeEffects: [rune(SCORCH, { name: 'Scorch' })],
        combo: [{ kind: 'basic-attack' }, { kind: 'ability' }],
        attackDamage: 100,
      }),
    );
    expect(result.burst.total).toBe(330);
    expect(result.perInstance[2]!.carriedBy).toBe(result.perInstance[1]!.stepId);
  });
});

describe('a rune that cannot be delivered contributes nothing AND is named', () => {
  // "The file has seven runes" and "the calculator applies one" are different facts, and a reader
  // is entitled to both. A rune silently dropped is damage missing from the total with nothing on
  // screen to say so — the mild direction of this project's one fatal failure, and the harder one
  // to notice because the number simply looks smaller.

  it('a combo with no ability at all does not fire an ability-triggered rune, and says so', () => {
    const result = resultOf(
      run({
        worn: [SCORCH],
        runeEffects: [rune(SCORCH, { name: 'Scorch' })],
        combo: [{ kind: 'basic-attack' }],
        attackDamage: 100,
      }),
    );
    expect(result.burst.total).toBe(100);
    expect(excluded(result, 'it fires on an ability and this combo has none')).toBe(true);
  });

  it.each([
    [CHEAP_SHOT, 'Cheap Shot'],
    [SUDDEN_IMPACT, 'Sudden Impact'],
    [GRASP, 'Grasp of the Undying'],
    [AFTERSHOCK, 'Aftershock'],
  ])('rune %i contributes no damage and its stored reason reaches the reader', (id, name) => {
    const result = resultOf(run({ worn: [id], runeEffects: [rune(id, { name })] }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, name)).toBe(true);
  });

  it('the sentence a reader gets is the one the engine stores for that rune', () => {
    const result = resultOf(run({ worn: [CHEAP_SHOT], runeEffects: [rune(CHEAP_SHOT, { name: 'Cheap Shot' })] }));
    expect(result.excludedMechanics).toContain(RUNES_READ_BUT_NOT_DELIVERABLE.get(CHEAP_SHOT));
  });

  it('a rune with a stored value and NO entry in either map still says something', () => {
    // The fallback arm. A rune nobody has read must not fall off the edge silently either.
    const UNREAD = 9999;
    expect(RUNE_DELIVERY.has(UNREAD)).toBe(false);
    expect(RUNES_READ_BUT_NOT_DELIVERABLE.has(UNREAD)).toBe(false);
    const result = resultOf(run({ worn: [UNREAD], runeEffects: [rune(UNREAD, { name: 'Unread Rune' })] }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'its delivery has not been read')).toBe(true);
  });

  it('a rune the build wears with NO curated entry produces no sentence — that is the item list’s job', () => {
    // An empty list from the catalogue means "nothing harvested", which the standing exclusions
    // already disclose for every rune. Repeating it per rune would bury the ones that ARE stored.
    const result = resultOf(run({ worn: [CHEAP_SHOT], runeEffects: [] }));
    expect(result.burst.total).toBe(200);
    expect(excluded(result, 'Cheap Shot —')).toBe(false);
  });

  it('a delivered rune and an undelivered one in the same build: one number, one sentence', () => {
    const result = resultOf(
      run({
        worn: [SCORCH, CHEAP_SHOT],
        runeEffects: [rune(SCORCH, { name: 'Scorch' }), rune(CHEAP_SHOT, { name: 'Cheap Shot' })],
      }),
    );
    expect(result.burst.total).toBe(230);
    expect(excluded(result, 'Cheap Shot')).toBe(true);
  });
});
