// @vitest-environment jsdom
//
// THE PRINTED-FIGURE SWEEP — no floating-point noise reaches a user, anywhere, for any champion.
//
// ═══ WHY THIS EXISTS ═══
//
// Loading the composed page in a real browser on 2026-08-14 showed two figures no test had ever
// seen:
//
//     Armor                41.540000000000006 (41.540000000000006 + 0)
//     State at this point  … Defender current hp 1019.1803996452423 …
//
// Both are the engine's own working values, printed raw. Neither is WRONG — they are the exact
// binary result of `21.6 + 4 × 4.985` and of subtracting one unrounded damage figure from another
// — and that is precisely what makes them dangerous: thirteen digits of noise in a product whose
// only claim is that its numbers can be trusted reads as either a bug or a fake precision, and a
// reader cannot tell which.
//
// **EVERY UI TEST IN THIS AREA MISSED THEM, AND THE REASON IS STRUCTURAL:** they all run against
// `MOCK_RESULT`, whose figures are whole numbers by construction. A fixture that is tidier than
// the data hides exactly the class of defect that only untidy data produces.
//
// ═══ WHAT THIS SWEEP DOES ═══
//
// It renders the WHOLE result surface — burndown, per-instance breakdown, both stat blocks — for
// every champion in the roster, against real published data, and fails on any visible text
// carrying more decimal places than the product prints on purpose. Fixing the two sites that were
// found would have left every future site unguarded; this is the check that finds the next one.
//
// POPULATION, STATED: all 173 champions as attacker, at level 11 with rank-3 abilities and a
// five-item build, running P → Q → W → E → R → basic attack against Garen at level 11. 173
// rendered result surfaces. Level 11 rather than 18 because a level with fractional growth on
// every stat is the case that produced the defect.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Champion, ComboStep, Scenario } from '../../types';
import type { Result } from '../../types/result';
import { simulate } from '../../engine';
import { InstanceBreakdown } from '../breakdown';
import { HpBurndown } from '../burndown';
import { StatBlockPanel } from '../stats';
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

/** Five items covering every scaling stat, chosen by stat key rather than by name. */
const BUILD = ['FlatMagicDamageMod', 'FlatPhysicalDamageMod', 'FlatHPPoolMod', 'FlatArmorMod', 'FlatSpellBlockMod']
  .map((key) => [...items].filter((i) => i.stats[key]).sort((a, b) => b.stats[key]! - a.stats[key]!)[0]?.id)
  .filter((id): id is number => id !== undefined);

const COMBO: ComboStep[] = [
  { id: 'p1', kind: 'ability', ref: 'P' },
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'w1', kind: 'ability', ref: 'W' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'r1', kind: 'ability', ref: 'R' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
];

function resultFor(champion: Champion): Result | null {
  const scenario: Scenario = {
    version: 2,
    attacker: {
      ...startingConfig(champion.apiname),
      level: 11,
      abilityRanks: { Q: 3, W: 3, E: 3, R: 2 },
      items: BUILD,
    },
    defender: { ...startingConfig('Garen'), level: 11 },
    combo: COMBO,
  };
  const out = simulate(scenario, catalogue);
  return out.ok ? out.result : null;
}

const RESULTS = roster
  .map((champion) => ({ champion, result: resultFor(champion) }))
  .filter((r): r is { champion: Champion; result: Result } => r.result !== null);

/**
 * More than two decimal places in a printed figure.
 *
 * TWO IS THE PRODUCT'S PRINTED PRECISION (`STAT_DECIMALS`, `STATE_DECIMALS`). The pattern
 * deliberately allows an arbitrary WHOLE part — a five-digit health pool is normal — and catches
 * only the fractional tail, which is where floating-point noise lives.
 */
const NOISE = /\d+\.\d{3,}/g;

/**
 * Every string the rendered surface puts in front of a person, ONE TEXT NODE AT A TIME.
 *
 * **NOT `body.textContent`, and this was measured rather than assumed.** Concatenating the whole
 * tree joins adjacent nodes with nothing between them, so a cell reading `1 037.38` followed by a
 * cell reading `1 037.375` becomes the single string `1037.381037.375` — which matches a
 * "too many decimals" pattern perfectly while nothing on screen is wrong. The first run of this
 * sweep reported exactly that on 10 champions. A check that cries wolf gets switched off, so it
 * reads each node separately, the way a person reads each figure separately.
 */
function printedStrings(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (text.trim().length > 0) out.push(text);
  }
  for (const el of document.body.querySelectorAll('[aria-label]')) {
    out.push(el.getAttribute('aria-label') ?? '');
  }
  return out;
}

describe('printed-figures/population', () => {
  it('renders a result surface for every champion — the sweep cannot pass by finding nothing', () => {
    expect(RESULTS).toHaveLength(173);
    expect(BUILD).toHaveLength(5);
  });
});

describe('printed-figures/no floating-point noise reaches a user', () => {
  it('no figure anywhere in any champion’s result surface carries more than two decimals', () => {
    const offenders: string[] = [];
    for (const { champion, result } of RESULTS) {
      render(
        <>
          <HpBurndown result={result} />
          <InstanceBreakdown result={result} />
          <StatBlockPanel
            role="Attacker"
            championName={champion.name}
            portraitSrc={null}
            stats={result.attackerStats}
          />
          <StatBlockPanel
            role="Defender"
            championName="Garen"
            portraitSrc={null}
            stats={result.defenderStats}
          />
        </>,
      );
      const found = [
        ...new Set(printedStrings().flatMap((text) => [...(text.match(NOISE) ?? [])])),
      ];
      if (found.length > 0) offenders.push(`${champion.apiname}: ${found.slice(0, 3).join(', ')}`);
      cleanup();
    }
    // Reported with the champion's name so the failure names WHERE, not just THAT.
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it('the pattern really does catch the two figures that were on screen', () => {
    // A sweep that cannot fail is not a sweep. These are the exact strings the browser showed.
    expect('41.540000000000006 (41.540000000000006 + 0)'.match(NOISE)).not.toBeNull();
    expect('Defender current hp 1019.1803996452423'.match(NOISE)).not.toBeNull();
    // And the false positive that node-by-node reading exists to avoid: two clean figures in
    // adjacent cells, which `body.textContent` glues into one string that looks like noise.
    expect('1 037.38'.match(NOISE)).toBeNull();
    expect('41.54'.concat('1 037.38').match(NOISE)).not.toBeNull();
    // …and does not fire on the precision the product prints on purpose.
    expect('41.54'.match(NOISE)).toBeNull();
    expect('0.67'.match(NOISE)).toBeNull();
    expect('1 077.1'.match(NOISE)).toBeNull();
  });
});
