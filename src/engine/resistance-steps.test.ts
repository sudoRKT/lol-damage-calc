// KNOWN-ANSWER TESTS FOR THE FOUR-STEP ORDER, REPORTED STEP BY STEP (SPECIFICATION §3.6),
// AND FOR PERCENTAGE **BONUS** ARMOR PENETRATION.
//
// WHERE EVERY EXPECTED NUMBER COMES FROM
// --------------------------------------
// All of them are published worked examples on the League wiki's armor-penetration article —
// CLAUDE.md's SECOND source of authority ("worked examples published in the League wiki's damage
// and mechanics articles"). They were read from the page's own wikitext through the MediaWiki
// API on 2026-08-13:
//   https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions&titles=Armor%20penetration&rvslots=main&rvprop=content&format=json&formatversion=2
//   (human-readable page: https://wiki.leagueoflegends.com/en-us/Armor_penetration)
//
// The four quoted rules the examples rest on, verbatim from that revision:
//   1. "Armor penetration and armor reduction are considered in the following order:
//       # Armor reduction, flat  # Armor reduction, percentage
//       # Armor penetration, percentage  # Armor penetration, flat (Lethality)"
//   2. "Flat armor reduction stacks additively and is distributed PROPORTIONALLY between base
//       armor and bonus armor."
//   3. "Percentage armor reduction ... Applies to both base and bonus armor ... is ignored if
//       the target's armor is 0 or less."
//   4. "Percentage bonus armor penetration: Percentage armor penetration that applies only to
//       bonus armor ... If the unit has multiple sources of percentage bonus penetration, they
//       stack multiplicatively."
//
// NOTHING HERE IS READ FROM A DATA FILE. Every armor figure below is the wiki article's own
// illustrative number, quoted in the comment beside the assertion, not a champion's stat line.

import { describe, it, expect } from 'vitest';
import { effectiveResistance, resolveResistanceSteps } from './resistances';

describe('resolveResistanceSteps — the wiki\'s full worked example, Target A', () => {
  // QUOTED, from the "Examples" section of the article:
  //   "Given 10 flat armor penetration and 45% bonus armor penetration, and the target is
  //    affected by 30 flat armor reduction and 30% armor reduction;
  //    Target A has 300 armor (100 base and 200 bonus armor).
  //    # The 300 is reduced to 270 (90 base and 180 bonus armor) by the 30 armor reduction.
  //    # The 270 is reduced to 189 (63 base and 126 bonus armor) by the 30% armor reduction.
  //    # The 189 is considered to be 132.3 (63 base and 69.3 bonus armor) by the 45% bonus
  //      armor penetration.
  //    # The 132.3 is considered to be 122.3 by the 10 armor penetration.
  //    # Target A takes damage as if it has 122.3 armor."
  const steps = resolveResistanceSteps(
    { base: 100, bonus: 200 },
    {
      flatReduction: 30,
      percentReduction: 0.3,
      percentBonusPenetration: 0.45,
      flatPenetration: 10,
    },
  );

  it('starts at the target\'s full 300 armor', () => {
    expect(steps.starting).toBe(300);
  });

  it('step 1 — 30 flat reduction leaves 270', () => {
    // Proportional: base 100 - 30 x (100/300) = 90 ; bonus 200 - 30 x (200/300) = 180.
    expect(steps.afterFlatReduction).toBeCloseTo(270, 9);
  });

  it('step 2 — 30% reduction leaves 189', () => {
    // 90 x 0.7 = 63 ; 180 x 0.7 = 126 ; 63 + 126 = 189.
    expect(steps.afterPercentReduction).toBeCloseTo(189, 9);
  });

  it('step 3 — 45% BONUS penetration leaves 132.3, untouched base included', () => {
    // 126 x 0.55 = 69.3, and the 63 of base armor is not touched at all. 63 + 69.3 = 132.3.
    expect(steps.afterPercentPenetration).toBeCloseTo(132.3, 9);
  });

  it('step 4 — 10 flat penetration leaves the article\'s 122.3', () => {
    expect(steps.afterFlatPenetration).toBeCloseTo(122.3, 9);
  });

  it('resolves the damage multiplier at 100 / (100 + 122.3)', () => {
    // 100 / 222.3 = 0.4498425551... (SPECIFICATION §3.6)
    expect(steps.multiplier).toBeCloseTo(100 / 222.3, 12);
  });
});

describe('resolveResistanceSteps — the wiki\'s Target B, driven below zero', () => {
  // QUOTED: "Target B has 18 armor.
  //          # The 18 is reduced to -12 by the 30 armor reduction.
  //          # The -12 is not affected by any further calculations because it is less than 0.
  //          # Target B takes damage as if it has -12 armor."
  const steps = resolveResistanceSteps(
    { base: 18, bonus: 0 },
    {
      flatReduction: 30,
      percentReduction: 0.3,
      percentBonusPenetration: 0.45,
      flatPenetration: 10,
    },
  );

  it('reaches -12 after flat reduction and stays there for all three later steps', () => {
    expect(steps.afterFlatReduction).toBeCloseTo(-12, 9);
    expect(steps.afterPercentReduction).toBeCloseTo(-12, 9);
    expect(steps.afterPercentPenetration).toBeCloseTo(-12, 9);
    expect(steps.afterFlatPenetration).toBeCloseTo(-12, 9);
  });

  it('takes the NEGATIVE branch of the multiplier, 2 - 100 / (100 - r)', () => {
    // 2 - 100 / (100 - (-12)) = 2 - 100/112 = 1.10714285714...
    expect(steps.multiplier).toBeCloseTo(2 - 100 / 112, 12);
  });
});

describe('resolveResistanceSteps — the three single-effect examples on the same page', () => {
  it('distributes 15 flat reduction proportionally: 20 base / 40 bonus becomes 45', () => {
    // QUOTED: "15 armor reduction against a 20 base armor and 40 bonus armor target will
    //          reduce base armor by 5 and bonus armor by 10, so the target will be reduced to
    //          45 armor ((20-5) + (40-10) = 45)."
    // This is the assertion that distinguishes proportional distribution from the alternative
    // reading in the same article's lead ("flat reductions affect the bonus amount first"),
    // which would give 20 base + 25 bonus = 45 as well — so the TOTAL cannot tell them apart.
    // The split is what differs, and the next test uses it where it changes the answer.
    const steps = resolveResistanceSteps({ base: 20, bonus: 40 }, { flatReduction: 15 });
    expect(steps.afterFlatReduction).toBeCloseTo(45, 9);
  });

  it('proves the distribution is proportional, by penetrating the bonus half afterwards', () => {
    // The article's two statements disagree. Its lead says flat reductions "affect the target's
    // bonus amount first"; its own flat-armor-reduction section says "distributed
    // PROPORTIONALLY", and its full worked example (Target A above) is proportional —
    // 30 off 100 base / 200 bonus gives 90 and 180, not 100 and 170.
    //
    // Proportional is therefore what is implemented, and this case makes the choice visible:
    //   proportional : base 15, bonus 30 -> 30 x 0.5 = 15 -> 15 + 15 = 30
    //   bonus-first  : base 20, bonus 25 -> 25 x 0.5 = 12.5 -> 20 + 12.5 = 32.5
    const steps = resolveResistanceSteps(
      { base: 20, bonus: 40 },
      { flatReduction: 15, percentBonusPenetration: 0.5 },
    );
    expect(steps.afterPercentPenetration).toBeCloseTo(30, 9);
    expect(steps.afterPercentPenetration).not.toBeCloseTo(32.5, 6);
  });

  it('applies 30% armor reduction to base and bonus alike: 20 / 40 becomes 42', () => {
    // QUOTED: "a target with 20 base armor and 40 bonus armor will be reduced to 42 armor
    //          ((20 x 0.7) + (40 x 0.7) = 42)."
    const steps = resolveResistanceSteps({ base: 20, bonus: 40 }, { percentReduction: 0.3 });
    expect(steps.afterPercentReduction).toBeCloseTo(42, 9);
  });

  it('applies 30% BONUS penetration to the bonus half alone: 20 / 40 becomes 48', () => {
    // QUOTED: "30% bonus armor penetration multiplies the target's bonus armor to 70% without
    //          affecting base armor, so a target with 20 base armor and 40 bonus armor will be
    //          treated as though it had 48 (20 + (40 x 0.7) = 48)."
    const steps = resolveResistanceSteps({ base: 20, bonus: 40 }, { percentBonusPenetration: 0.3 });
    expect(steps.afterPercentPenetration).toBeCloseTo(48, 9);
  });

  it('stacks percentage and percentage-bonus penetration multiplicatively: 43.2', () => {
    // QUOTED: "Example: 10% armor penetration and 30% bonus armor penetration.
    //          (20 x 0.9) + (40 x 0.7 x 0.9) = 43.2"
    // The bonus half meets BOTH factors; the base half meets only the ordinary one.
    const steps = resolveResistanceSteps(
      { base: 20, bonus: 40 },
      { percentPenetration: 0.1, percentBonusPenetration: 0.3 },
    );
    expect(steps.afterPercentPenetration).toBeCloseTo(43.2, 9);
    // Had the two been added into one 40% figure applied to everything: 60 x 0.6 = 36.
    expect(steps.afterPercentPenetration).not.toBeCloseTo(36, 6);
  });
});

describe('resolveResistanceSteps — the magic-penetration article\'s worked example', () => {
  it('resolves 80 magic resistance to 17.3', () => {
    // https://wiki.leagueoflegends.com/en-us/Magic_penetration (read 2026-08-12, recorded in
    // resistances.ts): 80 magic resistance, minus 20 flat, minus 30%, minus 35% penetration,
    // minus 10 flat penetration resolves to 17.3.
    //   80 - 20 = 60 ; 60 x 0.7 = 42 ; 42 x 0.65 = 27.3 ; 27.3 - 10 = 17.3
    // Magic resistance has no "bonus penetration" mechanic, so the whole figure sits in `base`.
    const steps = resolveResistanceSteps(
      { base: 80, bonus: 0 },
      {
        flatReduction: 20,
        percentReduction: 0.3,
        percentPenetration: 0.35,
        flatPenetration: 10,
      },
    );
    expect(steps.afterFlatReduction).toBeCloseTo(60, 9);
    expect(steps.afterPercentReduction).toBeCloseTo(42, 9);
    expect(steps.afterPercentPenetration).toBeCloseTo(27.3, 9);
    expect(steps.afterFlatPenetration).toBeCloseTo(17.3, 9);
    expect(steps.multiplier).toBeCloseTo(100 / 117.3, 12);
  });
});

describe('resolveResistanceSteps — the four steps agree with effectiveResistance', () => {
  // effectiveResistance is the older, single-figure entry point that resistance-order.test.ts
  // pins the ORDER with, and the UI's vertical slice does not use it. Both must be ONE
  // implementation: two implementations of the order are two chances to disagree.
  it('returns the same final figure as effectiveResistance for the same modifiers', () => {
    const modifiers = {
      flatReduction: 20,
      percentReduction: 0.3,
      percentPenetration: 0.35,
      flatPenetration: 10,
    };
    // 80 -> 60 -> 42 -> 27.3 -> 17.3, the same worked example as above.
    expect(effectiveResistance(80, modifiers)).toBeCloseTo(17.3, 9);
    expect(resolveResistanceSteps({ base: 80, bonus: 0 }, modifiers).afterFlatPenetration).toBeCloseTo(
      17.3,
      9,
    );
  });

  it('gives bonus penetration nothing to work on when the whole figure is base', () => {
    // A caller with only a total resistance figure has no bonus portion; the effect is then
    // correctly worth nothing, rather than being silently applied to base armor.
    expect(effectiveResistance(100, { percentBonusPenetration: 0.45 })).toBe(100);
  });
});

describe('resolveResistanceSteps — zero and empty cases', () => {
  it('leaves an unmodified resistance alone at every step', () => {
    const steps = resolveResistanceSteps({ base: 30, bonus: 50 }, {});
    expect(steps.starting).toBe(80);
    expect(steps.afterFlatReduction).toBe(80);
    expect(steps.afterPercentReduction).toBe(80);
    expect(steps.afterPercentPenetration).toBe(80);
    expect(steps.afterFlatPenetration).toBe(80);
    expect(steps.multiplier).toBeCloseTo(100 / 180, 12);
  });

  it('gives a multiplier of exactly 1 at zero resistance', () => {
    // The two branches of §3.6 agree at zero, and neither is applied to a zero figure.
    const steps = resolveResistanceSteps({ base: 0, bonus: 0 }, { percentReduction: 0.5 });
    expect(steps.afterFlatPenetration).toBe(0);
    expect(steps.multiplier).toBe(1);
  });

  it('subtracts flat reduction from base when there is no armor to distribute across', () => {
    // 0 armor, 25 flat reduction. There is no base/bonus proportion to distribute by, and the
    // article is explicit that flat reduction "can reduce a target's armor below zero".
    const steps = resolveResistanceSteps({ base: 0, bonus: 0 }, { flatReduction: 25 });
    expect(steps.afterFlatReduction).toBe(-25);
    expect(steps.afterFlatPenetration).toBe(-25);
  });

  it('never lets flat penetration pull a positive figure below zero', () => {
    // QUOTED, Lethality section: the armor "cannot be reduced below 0".
    const steps = resolveResistanceSteps({ base: 5, bonus: 0 }, { flatPenetration: 40 });
    expect(steps.afterFlatPenetration).toBe(0);
    expect(steps.multiplier).toBe(1);
  });
});
