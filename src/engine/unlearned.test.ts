// AN UNLEARNED ABILITY CONTRIBUTES NOTHING.
//
// ═══ THE DEFECT THESE TESTS EXIST FOR ═══
//
// `planStep` used to end with `rank: Math.max(1, rank)`, directly beneath a comment claiming the
// opposite rule: "A RANK OF ZERO IS A REAL STATE — the user has not put a point in it — and the
// ability then deals nothing rather than its rank 1 figure." The code did the reverse. An ability
// at rank 0 was silently promoted to rank 1 and returned that ability's full rank-1 damage.
//
// It was reachable in three keystrokes: `min={1}` on the rank field is an HTML hint that
// `parseNumericInput` does not enforce, and `src/url/v1.ts` makes rank 0 explicitly legal in a
// shared link. Measured in the shipped interface, Lux's R at rank 0 showed Final Spark at 217
// magic damage — identical to rank 1 — and an earlier probe returned it marked `verified`, this
// product's strongest evidence claim, on a build that cannot exist.
//
// That is the exact failure this product exists to prevent: a plausible wrong number nobody can
// tell is wrong.
//
// ═══ WHY NO CHAMPION IS EXCEPTED ═══
//
// Measured over all 937 ability entries across 173 champions in `public/data/abilities/`: NO
// entry carries a `maxRank` of 0 or null. There is no data signal for a rankless ability anywhere
// in the roster. Aphelios's Q/W/E carry `maxRank: 6`, identical to Jayce's and Udyr's
// form-swapping abilities, so he is not distinguishable from them by any field. Rank 0 is a
// statement the SCENARIO makes, not a property of the ability.

import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import { unlearnedNote } from './simulate';
import {
  championConfig,
  comboStep,
  fixtureAbility,
  fixtureCatalogue,
  fixtureChampion,
  scenario,
} from './fixtures';

const CATALOGUE = fixtureCatalogue({
  champions: [fixtureChampion({ apiname: 'Caster' }), fixtureChampion({ apiname: 'Target' })],
  abilities: [
    fixtureAbility({ champion: 'Caster', slot: 'Q', abilityName: 'Test Q', perRank: [100, 200] }),
    fixtureAbility({ champion: 'Caster', slot: 'P', abilityName: 'Test P', perRank: [50] }),
  ],
});

/** One combo step casting `slot`, with the attacker's ranks set as given. */
function runOne(slot: 'Q' | 'P', ranks: Partial<Record<'Q' | 'W' | 'E' | 'R', number>>) {
  const sim = simulate(
    scenario({
      attacker: championConfig({
        apiname: 'Caster',
        abilityRanks: { Q: 1, W: 1, E: 1, R: 1, ...ranks },
      }),
      defender: championConfig({ apiname: 'Target' }),
      combo: [comboStep('s1', { kind: 'ability', ref: slot })],
    }),
    CATALOGUE,
    { patch: '16.16.1' },
  );
  if (!sim.ok) throw new Error(`refused: ${sim.refusals.map((r) => r.reason).join('; ')}`);
  return sim.result;
}

describe('unlearned/an ability at rank 0 contributes nothing', () => {
  it('deals no damage at all, and the total says so', () => {
    expect(runOne('Q', { Q: 0 }).burst.total).toBe(0);
  });

  it('is marked incomplete, NEVER verified', () => {
    // The constraint stated directly. It holds structurally — `pendingInstance` hard-codes
    // `incomplete` — but a structural guarantee nobody asserts is one a refactor can lose.
    const instance = runOne('Q', { Q: 0 }).perInstance[0]!;
    expect(instance.verification).toBe('incomplete');
    expect(instance.verification).not.toBe('verified');
  });

  it('says WHY, and says it as a fact about the build rather than a gap in our data', () => {
    const instance = runOne('Q', { Q: 0 }).perInstance[0]!;
    expect(instance.incompleteReason?.kind).toBe('pending');
    expect(instance.incompleteReason?.note).toBe(unlearnedNote('Q'));
    // The distinction that matters: §8's `pending` normally means "not extracted yet, will
    // improve with work". Nothing is missing here and no work will change it.
    expect(instance.incompleteReason?.note).toContain('your build rather than');
    expect(instance.incompleteReason?.note).toContain('raise Q above rank 0');
  });

  it('carries the REAL ability name, not the step reference', () => {
    // `pendingInstance`'s fallback label is "ability — Q", which is right when nothing was
    // harvested and there is no name to give. Here the ability is known.
    expect(runOne('Q', { Q: 0 }).perInstance[0]!.sourceLabel).toBe('Q — Test Q');
  });

  it('is NAMED in the excluded list, so the total cannot quietly be missing it', () => {
    const result = runOne('Q', { Q: 0 });
    expect(result.incompleteContributors.map((c) => c.sourceLabel)).toEqual(['Q — Test Q']);
    expect(result.incompleteContributors[0]!.reason.note).toBe(unlearnedNote('Q'));
  });
});

describe('unlearned/this is a guard, not a change to the arithmetic', () => {
  it('rank 1 is untouched — the same figure as before the guard existed', () => {
    const result = runOne('Q', { Q: 1 });
    expect(result.burst.total).toBe(100);
    expect(result.perInstance[0]!.verification).toBe('derived');
    expect(result.incompleteContributors).toEqual([]);
  });

  it('rank 2 still reads the second rank, so the rank is passed through unclamped', () => {
    expect(runOne('Q', { Q: 2 }).burst.total).toBe(200);
  });
});

describe('unlearned/a passive can never be zeroed', () => {
  it('a passive is unaffected whatever the Q/W/E/R ranks say', () => {
    // `Scenario.abilityRanks` is Q/W/E/R only — a passive is innate and takes no point — and
    // `planStep` pins P to rank 1 before the guard. Setting every rankable slot to 0 must not
    // touch it.
    const result = runOne('P', { Q: 0, W: 0, E: 0, R: 0 });
    expect(result.burst.total).toBe(50);
    expect(result.perInstance[0]!.verification).toBe('derived');
  });
});

describe('unlearned/a negative rank is unlearned too, not an error', () => {
  it('refuses to deal damage below rank 1 rather than only at exactly 0', () => {
    // `src/url/v1.ts` refuses a negative rank in a link, but the engine takes a Scenario from
    // anywhere. `< 1` rather than `=== 0` means a value that got past some other path still
    // cannot produce a damage figure.
    const instance = runOne('Q', { Q: -3 }).perInstance[0]!;
    expect(instance.verification).toBe('incomplete');
    expect(runOne('Q', { Q: -3 }).burst.total).toBe(0);
  });
});
