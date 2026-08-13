// KNOWN-ANSWER TESTS FOR RATIOS THAT READ A STAT BOTH CHAMPIONS POSSESS — the health pools,
// armor and magic resistance, mana, and a persistent stack counter (SPECIFICATION §3.7:
// "Damage scaling on maximum health, current health, and missing health"; §3.3 for stacks).
//
// The composition rule is unchanged and is the one component.ts already documents:
//     perHit = base + Σ (ratioPercent / 100) × statValue
// What is new is only WHICH stat value the engine is allowed to read, and WHOSE.
//
// WHOSE STAT — THE RULE THE WHOLE FILE TURNS ON. src/types/data.ts, `RatioOwner`:
//   "`maxHP` on its own names a pool but not a champion, and the two readings are not close:
//    Bel'Veth R is `20% of target's missing health`, and an engine that read the caster's
//    missing health instead would return a confident, itemised, entirely wrong number with
//    nothing on screen to say so."
// So there is no default anywhere below. An owner the engine cannot resolve is REFUSED.
//
// Every expected number is arithmetic done by hand and written above the assertion. No champion
// figure is read from any data file; the stat blocks here are round numbers chosen so the
// arithmetic can be done on paper.

import { describe, it, expect } from 'vitest';
import { ComponentEvaluationError, evaluateComponent, unsupportedReasons } from './component';
import { casterStats, component, flat, linear, ratio } from './fixtures';
import type { ComponentContext } from './component';

/** A caster/target view with the four core stats and whichever owned stats a test states. */
function view(opts: Parameters<typeof casterStats>[0] & Record<string, number | undefined>) {
  return { ...casterStats(opts), ...opts };
}

function context(extra: Partial<ComponentContext> = {}): ComponentContext {
  return {
    rank: 1,
    maxRank: 5,
    level: 1,
    caster: casterStats({}),
    ...extra,
  };
}

describe('evaluateComponent — a ratio on the TARGET\'s health pools', () => {
  it('adds 20% of the target\'s 2400 maximum health to a base of 100', () => {
    // 100 + (20 / 100) x 2400 = 100 + 480 = 580.
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(100),
      ratios: [ratio('maxHP', flat(20), { owner: 'target' })],
    });
    const result = evaluateComponent(c, context({ target: view({ maxHP: 2400 }) }));
    expect(result.perHit).toBeCloseTo(580, 9);
    expect(result.ratios[0].statValue).toBe(2400);
  });

  it('reads MISSING health as maximum minus current', () => {
    // The frozen StatBlock carries `maxHp` and `hp`, not a missing-health figure, so the
    // engine derives it: 2000 - 1200 = 800 missing. 800 x 0.25 = 200, plus a base of 0.
    const c = component({
      id: 'r',
      damageType: 'true',
      base: flat(0),
      ratios: [ratio('missingHP', flat(25), { owner: 'target' })],
    });
    const result = evaluateComponent(
      c,
      context({ target: view({ maxHP: 2000, currentHP: 1200 }) }),
    );
    expect(result.ratios[0].statValue).toBe(800);
    expect(result.perHit).toBeCloseTo(200, 9);
  });

  it('reads CURRENT health, which is not the same figure as maximum', () => {
    // 8% of 1200 current health = 96. Off maximum health it would be 160 — so this assertion
    // fails for an engine that confuses the two.
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('currentHP', flat(8), { owner: 'target' })],
    });
    const result = evaluateComponent(
      c,
      context({ target: view({ maxHP: 2000, currentHP: 1200 }) }),
    );
    expect(result.perHit).toBeCloseTo(96, 9);
    expect(result.perHit).not.toBeCloseTo(160, 6);
  });

  it('reads the CASTER\'s health when the owner says caster, not the target\'s', () => {
    // 10% of the caster's 3000 maximum health = 300. The target's 800 would give 80.
    const c = component({
      id: 'q',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('maxHP', flat(10), { owner: 'caster' })],
    });
    const result = evaluateComponent(
      c,
      context({ caster: view({ maxHP: 3000 }), target: view({ maxHP: 800 }) }),
    );
    expect(result.perHit).toBeCloseTo(300, 9);
  });
});

describe('evaluateComponent — a ratio on armor and magic resistance', () => {
  it('adds 15% of the CASTER\'s 100 armor', () => {
    // The shape DATA-SOURCES §16 names: Malphite W reads the caster's armor. 100 x 0.15 = 15.
    const c = component({
      id: 'w',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('armor', flat(15), { owner: 'caster' })],
    });
    const result = evaluateComponent(c, context({ caster: view({ armor: 100, bonusArmor: 40 }) }));
    expect(result.perHit).toBeCloseTo(15, 9);
  });

  it('reads BONUS armor as a different figure from total armor', () => {
    // 30% of 40 bonus armor = 12. Off the 100 total it would be 30.
    const c = component({
      id: 'e',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('bonusArmor', flat(30), { owner: 'caster' })],
    });
    const result = evaluateComponent(c, context({ caster: view({ armor: 100, bonusArmor: 40 }) }));
    expect(result.perHit).toBeCloseTo(12, 9);
    expect(result.perHit).not.toBeCloseTo(30, 6);
  });

  it('adds 50% of the target\'s 60 magic resistance', () => {
    // 60 x 0.5 = 30, plus a base of 40 = 70.
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(40),
      ratios: [ratio('magicResist', flat(50), { owner: 'target' })],
    });
    const result = evaluateComponent(
      c,
      context({ target: view({ magicResist: 60, bonusMagicResist: 25 }) }),
    );
    expect(result.perHit).toBeCloseTo(70, 9);
  });
});

describe('evaluateComponent — a ratio on a persistent stack counter (§3.3)', () => {
  // THE UNIT IS THE ONE THE CONTRACT STATES, AND IT IS RAISED RATHER THAN INVENTED.
  // src/types/data.ts fixes the magnitude of EVERY ratio as percentage points of the stat it
  // reads, and says nothing special about `stacks`. So "+1 damage per stack" is 100 percentage
  // points of the stack count, exactly as "+75% AP" is 75 percentage points of ability power.
  // Applying a second, different unit to one stat would be inventing a convention. RAISED TO
  // THE LEAD: nothing in the harvester produces a `stacks` ratio yet, so this is a decision
  // being taken before the data exists rather than a re-reading of data already stored.
  it('adds 25 damage from 25 stacks at 100 percentage points per stack', () => {
    // 30 base + (100 / 100) x 25 stacks = 30 + 25 = 55.
    const c = component({
      id: 'q',
      damageType: 'physical',
      base: flat(30),
      ratios: [ratio('stacks', flat(100), { counter: 'nasusQ' })],
    });
    const result = evaluateComponent(c, context({ stacks: { nasusQ: 25 } }));
    expect(result.ratios[0].statValue).toBe(25);
    expect(result.perHit).toBeCloseTo(55, 9);
  });

  it('scales a half-point-per-stack ratio the same way', () => {
    // 50 percentage points of 120 stacks = 60.
    const c = component({
      id: 'p',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('stacks', flat(50), { counter: 'veigar' })],
    });
    const result = evaluateComponent(c, context({ stacks: { veigar: 120 } }));
    expect(result.perHit).toBeCloseTo(60, 9);
  });

  it('REFUSES a counter the scenario never stated, rather than treating it as zero', () => {
    // "Absent" and "zero" are different claims. A scenario that means zero stacks can say so;
    // a plan layer that forgot to wire the counter would otherwise silently understate the
    // ability and nothing downstream could tell.
    const c = component({
      id: 'q',
      damageType: 'physical',
      base: flat(30),
      ratios: [ratio('stacks', flat(100), { counter: 'nasusQ' })],
    });
    expect(() => evaluateComponent(c, context({ stacks: {} }))).toThrow(ComponentEvaluationError);
    expect(unsupportedReasons(c, context({ stacks: {} }))[0]).toMatch(/nasusQ/);
  });

  it('accepts a counter the scenario stated as zero', () => {
    const c = component({
      id: 'q',
      damageType: 'physical',
      base: flat(30),
      ratios: [ratio('stacks', flat(100), { counter: 'nasusQ' })],
    });
    expect(evaluateComponent(c, context({ stacks: { nasusQ: 0 } })).perHit).toBeCloseTo(30, 9);
  });
});

describe('evaluateComponent — an item or rune effect written from the HOLDER\'s view', () => {
  it('resolves holder to the caster when the effect came off the caster\'s build', () => {
    // data.ts, RatioOwner: "'holder' is resolved at EVALUATION time ... from which champion's
    // build the effect was found on". 3% of the holder's 4000 maximum health = 120.
    const c = component({
      id: 'heartsteel',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('maxHP', flat(3), { owner: 'holder' })],
    });
    const result = evaluateComponent(
      c,
      context({ caster: view({ maxHP: 4000 }), target: view({ maxHP: 1000 }), holderIs: 'caster' }),
    );
    expect(result.perHit).toBeCloseTo(120, 9);
  });

  it('resolves holder to the target when the effect came off the defender\'s build', () => {
    // The same stored effect, reached through the DEFENDER's items, reads the defender's health:
    // 3% of 1000 = 30. This is the inversion data.ts warns mapping holder->caster would cause.
    const c = component({
      id: 'heartsteel',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('maxHP', flat(3), { owner: 'holder' })],
    });
    const result = evaluateComponent(
      c,
      context({ caster: view({ maxHP: 4000 }), target: view({ maxHP: 1000 }), holderIs: 'target' }),
    );
    expect(result.perHit).toBeCloseTo(30, 9);
  });

  it('REFUSES a holder ratio when nothing states whose build it came from', () => {
    const c = component({
      id: 'x',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('maxHP', flat(3), { owner: 'holder' })],
    });
    expect(unsupportedReasons(c, context({ caster: view({ maxHP: 4000 }) }))[0]).toMatch(/holder/i);
  });
});

describe('evaluateComponent — a ratio whose own magnitude is scaled (RatioMultiplier)', () => {
  it('raises a 15% health ratio to 25% at 400 ability power', () => {
    // The shape data.ts documents: "10-20% (+ 2.5% per 100 AP) of target's maximum health".
    //   the ratio at rank 3 of 5:  10 + (20 - 10) / (5 - 1) x (3 - 1) = 15 percentage points
    //   the multiplier at 400 AP:  2.5 x (400 / 100)                  = 10 percentage points
    //   the ratio actually used:   15 + 10                            = 25 percentage points
    //   the damage:                (25 / 100) x 3000 maximum health   = 750
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(0),
      ratios: [
        ratio('maxHP', linear(10, 20), {
          owner: 'target',
          multipliers: [{ per: 'AP', per100: flat(2.5) }],
        }),
      ],
    });
    const result = evaluateComponent(
      c,
      context({
        rank: 3,
        maxRank: 5,
        caster: view({ abilityPower: 400 }),
        target: view({ maxHP: 3000 }),
      }),
    );
    expect(result.ratios[0].percent).toBeCloseTo(25, 9);
    expect(result.perHit).toBeCloseTo(750, 9);
    // Read as an ordinary 2.5% AP ratio instead, the ability would deal 450 + 10 = 460.
    expect(result.perHit).not.toBeCloseTo(460, 6);
  });

  it('leaves the ratio alone when the multiplier\'s stat is zero', () => {
    // 15 + 2.5 x (0 / 100) = 15 percentage points; 15% of 3000 = 450.
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(0),
      ratios: [
        ratio('maxHP', linear(10, 20), {
          owner: 'target',
          multipliers: [{ per: 'AP', per100: flat(2.5) }],
        }),
      ],
    });
    const result = evaluateComponent(
      c,
      context({ rank: 3, maxRank: 5, caster: view({ abilityPower: 0 }), target: view({ maxHP: 3000 }) }),
    );
    expect(result.perHit).toBeCloseTo(450, 9);
  });

  it('requires an owner on a multiplier that reads an owner-required stat', () => {
    // data.ts: a multiplier's `owner` "follows the same rule as the payload ratio: required
    // when `per` is a stat both champions possess, never defaulted".
    const c = component({
      id: 'w',
      damageType: 'physical',
      base: flat(0),
      ratios: [
        ratio('maxHP', flat(10), {
          owner: 'target',
          multipliers: [{ per: 'bonusHP', per100: flat(1) }],
        }),
      ],
    });
    const reasons = unsupportedReasons(
      c,
      context({ caster: view({ maxHP: 4000 }), target: view({ maxHP: 2000 }) }),
    );
    expect(reasons.join(' ')).toMatch(/owner/i);
  });
});

describe('evaluateComponent — what it still REFUSES, and why each refusal is honest', () => {
  it('refuses an owner the SOURCE never stated', () => {
    // data.ts: "'unresolved' ... means the source names a health pool and does not say whose."
    // No amount of context can settle it, so no context makes it resolvable.
    const c = component({
      id: 'w',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('armor', flat(15), { owner: 'unresolved' })],
    });
    const reasons = unsupportedReasons(c, context({ caster: view({ armor: 100 }) }));
    expect(reasons.join(' ')).toMatch(/does not say whose|unresolved/i);
  });

  it('refuses a target ratio when no target was supplied', () => {
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('maxHP', flat(20), { owner: 'target' })],
    });
    expect(unsupportedReasons(c, context())[0]).toMatch(/target/i);
  });

  it('refuses a MANA ratio, because the frozen stat block carries no mana', () => {
    // RAISED TO THE LEAD, not worked around. `RatioStat` includes maxMana and currentMana —
    // Ryze Q reads the caster's maximum mana — and `StatBlock` has no mana field at all, so
    // there is nothing honest to read. The ability is refused and named, not estimated.
    const c = component({
      id: 'q',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('maxMana', flat(4), { owner: 'caster' })],
    });
    const reasons = unsupportedReasons(c, context({ caster: view({ maxHP: 1000 }) }));
    expect(reasons.join(' ')).toMatch(/mana/i);
  });

  it('refuses a BONUS HEALTH ratio, for the same reason', () => {
    // The stat block carries `hp` and `maxHp` and no bonus-health figure, and bonus health
    // cannot be derived from them: it is maximum minus the champion's base at that level,
    // which is a fact the stat block does not carry either.
    const c = component({
      id: 'w',
      damageType: 'physical',
      base: flat(0),
      ratios: [ratio('bonusHP', flat(10), { owner: 'caster' })],
    });
    const reasons = unsupportedReasons(c, context({ caster: view({ maxHP: 3000 }) }));
    expect(reasons.join(' ')).toMatch(/bonus health|bonusHP/i);
  });

  it('still refuses every owned stat when NO context is offered at all', () => {
    // The one-argument form is what the interface's vertical slice calls, and it must keep
    // meaning "this evaluator reads the caster's attack damage and ability power only".
    const c = component({
      id: 'r',
      damageType: 'magic',
      base: flat(0),
      ratios: [ratio('maxHP', flat(20), { owner: 'target' })],
    });
    expect(unsupportedReasons(c)).toHaveLength(1);
    expect(unsupportedReasons(c)[0]).toMatch(/maxHP/);
  });

  it('reports EVERY reason at once, not just the first', () => {
    // component.ts's own rule: a partial figure is "itemised, plausible and too small, and
    // nothing downstream can tell".
    const c = component({
      id: 'x',
      damageType: 'magic',
      base: flat(0),
      ratios: [
        ratio('maxMana', flat(4), { owner: 'caster' }),
        ratio('maxHP', flat(20), { owner: 'unresolved' }),
      ],
    });
    expect(unsupportedReasons(c, context({ caster: view({}) })).length).toBe(2);
  });
});
