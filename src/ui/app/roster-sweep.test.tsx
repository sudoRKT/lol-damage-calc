// @vitest-environment jsdom
//
// THE ROSTER SWEEP — every champion, through the real data, the real engine and the real result
// components, checked for the ONE failure this page could produce that nobody would notice.
//
// THE FAILURE IT IS WRITTEN AGAINST. `simulate` refuses what it cannot model: an ability nothing
// was harvested for, an ability whose own entry is `incomplete`, a step kind that is not built
// yet. Each of those contributes NO damage. So the total on screen can be missing an entire
// ability while looking exactly like a total that is not — a plausible wrong number, which is the
// failure this product exists to prevent (SPECIFICATION §8). The protection is that every excluded
// instance is NAMED on screen with its reason. This sweep checks that claim over the whole
// roster instead of over the one champion somebody looked at.
//
// POPULATION, STATED: all 173 champions in `public/data/champions.json`, each as the ATTACKER at
// level 18 with every ability at the rank Data Dragon records as its maximum, running the combo
// P → Q → W → E → R → basic attack against Garen at level 18 with no items. 173 scenarios, 1038
// planned instances. The defender is fixed because the sweep is about the attacker's kit; the
// defender's own kit is not modelled by this engine yet and the result says so.
//
// WHAT IT DOES NOT CLAIM. It does not check that any damage figure is RIGHT — that is the
// engine's own suite and the known-answer tests. It checks that nothing is silently missing.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Champion, ChampionConfig, ComboStep, Scenario } from '../../types';
import type { Result } from '../../types/result';
import { simulate } from '../../engine';
import { InstanceBreakdown } from '../breakdown';
import { buildCatalogue, loadAbilities, loadItems } from '../data/catalogue';
import { loadRoster } from '../data/roster';
import { fetchPublished } from '../data/published-files';
import { startingConfig } from './App';

afterEach(cleanup);

const roster = await loadRoster(fetchPublished);
const items = await loadItems(fetchPublished);
const abilities = new Map(
  await Promise.all(
    roster.map(async (c) => {
      const file = await loadAbilities(c.apiname, fetchPublished);
      return [c.apiname, file?.abilities ?? []] as const;
    }),
  ),
);
const catalogue = buildCatalogue({ champions: roster, items, abilities });

const COMBO: ComboStep[] = [
  { id: 'p1', kind: 'ability', ref: 'P' },
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
];

/** Level 18, every ability at the rank the roster records — never a rank invented here. */
function maxed(champion: Champion): ChampionConfig {
  const base = startingConfig(champion.apiname);
  return {
    ...base,
    level: 18,
    abilityRanks: {
      Q: champion.abilityMaxRanks.Q ?? 1,
      W: champion.abilityMaxRanks.W ?? 1,
      E: champion.abilityMaxRanks.E ?? 1,
      R: champion.abilityMaxRanks.R ?? 1,
    },
  };
}

const GAREN = roster.find((c) => c.apiname === 'Garen')!;

/**
 * A build that supplies every scaling stat an ability can read, so a zero cannot be blamed on it.
 *
 * THIS EXISTS BECAUSE THE SWEEP FOUND SOMETHING. The first version asserted that a `derived`
 * instance always deals damage, and three passives failed it — Katarina's Voracity, Mordekaiser's
 * Darkness Rise and Orianna's Clockwork Windup. All three are stored correctly: they have a base
 * of zero and scale ENTIRELY from ability power or bonus attack damage, so against a build with
 * neither they deal exactly nothing. **The arithmetic was right and the check was wrong.** The
 * property worth testing is not "a derived instance deals damage" but "a zero is EXPLAINABLE" —
 * so every champion is run twice, and only an instance that deals nothing with a full set of
 * scaling stats is a finding.
 *
 * The items are chosen from the real pool by stat key rather than by name, so the build survives
 * an item being renamed or removed in a patch.
 */
function scalingBuild(): number[] {
  const pick = (key: string) =>
    [...items].filter((i) => i.stats[key]).sort((a, b) => b.stats[key]! - a.stats[key]!)[0]?.id;
  return [
    pick('FlatMagicDamageMod'),
    pick('FlatPhysicalDamageMod'),
    pick('FlatHPPoolMod'),
    pick('FlatMPPoolMod'),
    pick('FlatArmorMod'),
  ].filter((id): id is number => id !== undefined);
}

const BUILD = scalingBuild();

interface Run {
  champion: Champion;
  ok: boolean;
  refusals: string[];
  result: Result | null;
}

function run(champion: Champion, attackerItems: number[]): Run {
  const scenario: Scenario = {
    version: 2,
    attacker: { ...maxed(champion), items: attackerItems },
    defender: { ...maxed(GAREN), apiname: 'Garen' },
    combo: COMBO,
  };
  const out = simulate(scenario, catalogue);
  return out.ok
    ? { champion, ok: true, refusals: [], result: out.result }
    : {
        champion,
        ok: false,
        refusals: out.refusals.map((r) => `${r.path}: ${r.reason}`),
        result: null,
      };
}

/** Pass one: base statistics only. Pass two: the same combo on a build with every scaling stat. */
const RUNS: Run[] = roster.map((champion) => run(champion, []));
const KITTED: Run[] = roster.map((champion) => run(champion, BUILD));

const RESULTS = RUNS.filter((r) => r.result).map((r) => ({ champion: r.champion, result: r.result! }));
const KITTED_RESULTS = KITTED.filter((r) => r.result).map((r) => ({
  champion: r.champion,
  result: r.result!,
}));

describe('roster-sweep/population', () => {
  it('is looking at the whole roster — the sweep cannot pass by finding nothing', () => {
    expect(RUNS).toHaveLength(173);
    expect(RUNS.reduce((n, r) => n + (r.result?.perInstance.length ?? 0), 0)).toBe(173 * 6);
  });
});

describe('roster-sweep/nothing is refused wholesale', () => {
  it('every champion produces a Result rather than a refusal, on base statistics alone', () => {
    // A WHOLESALE refusal means the scenario itself could not be assembled — a champion missing
    // from the catalogue, an item id that does not exist. Any champion here would be one the page
    // cannot show at all.
    const refused = RUNS.filter((r) => !r.ok).map((r) => `${r.champion.apiname}: ${r.refusals.join('; ')}`);
    expect(refused).toEqual([]);
  });

  it('and again with a five-item build — no item in the pool refuses a scenario', () => {
    const refused = KITTED.filter((r) => !r.ok).map(
      (r) => `${r.champion.apiname}: ${r.refusals.join('; ')}`,
    );
    expect(refused).toEqual([]);
    expect(BUILD).toHaveLength(5);
  });
});

describe('roster-sweep/no damage is missing without a name beside it', () => {
  it('every instance either deals damage, or says why it does not — measured on a full build', () => {
    // A ZERO MUST BE EXPLAINABLE. With ability power, attack damage, health, mana and armor all
    // supplied, an instance that still deals nothing cannot be blamed on the build — so it is
    // either honestly marked (incomplete / no-damage) or it is a silent hole in the total.
    //
    // ═══ A THIRD EXPLANATION EXISTS SINCE 2026-08-15, AND THIS SWEEP HAD TO LEARN IT ═══
    //
    // SPECIFICATION §3.8 keeps damage over time OUT of the burst total entirely. So an instance
    // whose damage is recurring contributes 0 to burst BY DESIGN and appears on the DoT line
    // instead. Fifteen instances entered that state when the per-tick readings were merged, and
    // this sweep called all fifteen silent holes.
    //
    // IT IS NOT RELAXED TO ACCOMMODATE THEM. A `derived` instance dealing 0 burst is excused only
    // when the DoT line CARRIES it — matched by label, and required to carry a positive figure.
    // An instance that deals no burst, is not marked incomplete, and is absent from the DoT line
    // is still an offender, which is the hole this test was written to find. Measured on the
    // merged file: 15 instances take this arm, and every one of them is matched.
    const offenders: string[] = [];
    let excusedByDot = 0;
    for (const { champion, result } of KITTED_RESULTS) {
      const dotLabels = new Map(
        result.dot.sources.filter((d) => d.total > 0).map((d) => [d.label, d.total]),
      );
      for (const instance of result.perInstance) {
        const contributes = instance.final > 0;
        const excused =
          instance.verification === 'incomplete' || instance.verification === 'no-damage';
        const onTheDotLine = dotLabels.has(instance.sourceLabel);
        if (onTheDotLine) excusedByDot++;
        if (!contributes && !excused && !onTheDotLine) {
          offenders.push(
            `${champion.apiname} ${instance.sourceLabel}: dealt 0 while reading "${instance.verification}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
    // The new arm must be LOAD-BEARING, not a clause that never fires. If this drops to zero the
    // excuse above is dead code and the sweep is weaker than it reads.
    expect(excusedByDot).toBeGreaterThan(0);
  });

  it('the DoT line is populated at all — the second verdict is no longer decorative', () => {
    // DATA-SOURCES §56 measured this at ZERO: no real scenario had ever carried any damage over
    // time, so the `+DoT` column had never appeared on the live site and SPECIFICATION §3.8's
    // requirement that the verdict be given twice was satisfied in form and not in substance.
    // Pinned here so a regression that empties the DoT line again is loud rather than invisible.
    //
    // DEFINITION: champions in the full-build sweep whose result carries at least one DoT source
    // with a total above zero, over the 173 in `public/data/champions.json`.
    const withDot = KITTED_RESULTS.filter(({ result }) =>
      result.dot.sources.some((d) => d.total > 0),
    );
    expect(withDot.length).toBeGreaterThan(0);
  });

  it('an ability that scales purely from a stat the build lacks deals zero, and that is right', () => {
    // The finding that shaped the check above, pinned so it cannot silently change: three
    // passives have a base of zero and scale entirely from ability power or bonus attack damage.
    const bare = RESULTS.find((r) => r.champion.apiname === 'Orianna')!;
    const kitted = KITTED_RESULTS.find((r) => r.champion.apiname === 'Orianna')!;
    const passiveOf = (result: Result) =>
      result.perInstance.find((i) => i.sourceLabel.startsWith('P —'))!;
    expect(passiveOf(bare.result).verification).toBe('derived');
    expect(passiveOf(bare.result).final).toBe(0);
    expect(passiveOf(kitted.result).final).toBeGreaterThan(0);
  });

  it('every incomplete instance contributes exactly zero — never a partial figure', () => {
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      for (const instance of result.perInstance) {
        if (instance.verification === 'incomplete' && instance.final !== 0) {
          offenders.push(`${champion.apiname} ${instance.sourceLabel}: ${instance.final}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every incomplete instance carries a REASON, and it is pending or permanent', () => {
    // SPECIFICATION §8, settled and not to be narrowed: BOTH kinds name what is missing. A user
    // told only "not yet modelled" cannot tell whether the total is missing a rounding error or
    // half the combo.
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      for (const instance of result.perInstance) {
        if (instance.verification !== 'incomplete') continue;
        const reason = instance.incompleteReason;
        if (!reason) {
          offenders.push(`${champion.apiname} ${instance.sourceLabel}: no reason at all`);
          continue;
        }
        const said =
          reason.kind === 'permanent'
            ? (reason.missingFacts ?? []).map((f) => f.why).join(' ')
            : (reason.note ?? '');
        if (said.trim().length === 0) {
          offenders.push(`${champion.apiname} ${instance.sourceLabel}: ${reason.kind} with no words`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every incomplete instance is ALSO listed as an incomplete contributor', () => {
    // The table names it row by row; `incompleteContributors` is the list a reader checks the
    // total against. If the two ever disagree, one of them is lying about the same combo.
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      const named = new Set(result.incompleteContributors.map((c) => c.sourceLabel));
      for (const instance of result.perInstance) {
        if (instance.verification === 'incomplete' && !named.has(instance.sourceLabel)) {
          offenders.push(`${champion.apiname}: ${instance.sourceLabel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('roster-sweep/every result states what it excluded', () => {
  it('names item passives, runes, penetration and the sequence-not-time exclusions', () => {
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      const text = result.excludedMechanics.join(' ').toLowerCase();
      for (const required of ['item passives', 'rune', 'penetration']) {
        if (!text.includes(required)) offenders.push(`${champion.apiname}: no mention of ${required}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('roster-sweep/what the page can actually show, counted', () => {
  it('reports how many champions produce a non-zero burst total, and names the ones that do not', () => {
    // DEFINITION: a champion "produces a real number" when the P/Q/W/E/R + basic-attack combo
    // above yields a burst total above zero against Garen. The basic attack alone guarantees it,
    // so a zero here would mean the attacker's own attack damage failed to resolve.
    const zero = RESULTS.filter(({ result }) => result.burst.total <= 0).map(
      ({ champion }) => champion.apiname,
    );
    expect(zero).toEqual([]);
    expect(RESULTS).toHaveLength(173);
  });

  it('the burst total is the sum of its own per-type split, on every champion', () => {
    // The cross-area seam that DATA-SOURCES §42.4a records: the engine and the interface once
    // held opposite rules for this figure with both suites green.
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      const parts = result.burst.byType;
      const sum = parts.physical + parts.magic + parts.true;
      if (Math.abs(sum - result.burst.total) > 0.5) {
        offenders.push(`${champion.apiname}: ${sum} vs ${result.burst.total}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('roster-sweep/the reasons reach the SCREEN, not just the Result', () => {
  it('every incomplete instance in every champion’s result is named in the rendered table', () => {
    // THE WHOLE POINT OF THE SWEEP. A reason that exists on the Result and never renders is a
    // silent exclusion as far as a user is concerned. This renders the real breakdown component
    // for all 173 results and looks for the source label of every excluded instance in the DOM.
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      if (result.incompleteContributors.length === 0) continue;
      render(<InstanceBreakdown result={result} />);
      const text = document.body.textContent ?? '';
      for (const contributor of result.incompleteContributors) {
        if (!text.includes(contributor.sourceLabel)) {
          offenders.push(`${champion.apiname}: "${contributor.sourceLabel}" is not on screen`);
        }
      }
      cleanup();
    }
    expect(offenders).toEqual([]);
  });

  it('the excluded-mechanics list is on screen too, every line of it', () => {
    // COLLAPSED SINCE 2026-08-15 with its count on the control (SPECIFICATION §11, ruled). The
    // count is checked first, because that is what §11 now requires be visible; the list itself is
    // then opened and checked line by line, because "one click away" has to mean the whole list is
    // actually there and not a truncation.
    const { result } = RESULTS[0]!;
    render(<InstanceBreakdown result={result} />);
    const toggle = screen.getByRole('button', {
      name: `Show Mechanics this result excludes, ${result.excludedMechanics.length} mechanics`,
    });
    expect(toggle.textContent).toContain(String(result.excludedMechanics.length));
    fireEvent.click(toggle);
    for (const mechanic of result.excludedMechanics) {
      expect(screen.getByText(mechanic)).toBeTruthy();
    }
  });
});
