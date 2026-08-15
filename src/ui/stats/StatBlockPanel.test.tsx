// @vitest-environment jsdom
//
// The resolved stat block, against the ONE canonical mock Result.
//
// The claim being tested is completeness, not prettiness: SPECIFICATION §2 step 9 says the
// simulator returns "the full computed stat block", and a stat that is missing from the screen
// is indistinguishable from one that was never modelled. So the first test walks every field of
// the frozen `StatBlock` and fails naming any that never reaches the page.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import { StatBlockPanel, formatPercent, statRows } from './StatBlockPanel';

afterEach(cleanup);

const DEFENDER = MOCK_RESULT.defenderStats;

function mount(role = 'Defender', stats = DEFENDER) {
  render(
    <StatBlockPanel
      role={role}
      championName="Garen"
      portraitSrc="https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Garen.png"
      stats={stats}
    />,
  );
}

describe('stat block/completeness', () => {
  it('every numeric field of the frozen StatBlock reaches the screen', () => {
    // The population, stated: 20 numbers across 14 rows — the two health figures, the three
    // armor figures, the three magic-resist figures, the three attack-damage figures, ability
    // power, crit chance, crit damage, attack speed, and the five penetration fields.
    mount();
    const table = screen.getByRole('table');
    const printed = table.textContent ?? '';
    const missing = [
      DEFENDER.hp,
      DEFENDER.maxHp,
      DEFENDER.armor,
      DEFENDER.armorBase,
      DEFENDER.armorBonus,
      DEFENDER.magicResist,
      DEFENDER.magicResistBase,
      DEFENDER.magicResistBonus,
      DEFENDER.attackDamage.total,
      DEFENDER.attackDamage.base,
      DEFENDER.attackDamage.bonus,
      DEFENDER.attackSpeed,
      DEFENDER.maxHpBase,
      DEFENDER.maxHpBonus,
    ].filter((value) => !printed.includes(String(value)));
    expect(missing).toEqual([]);
    // Still 14 rows: the health split shares the Health row, and Garen has no mana pool so no
    // mana row exists for him at all.
    expect(statRows(DEFENDER)).toHaveLength(14);
  });

  it('a zero is PRINTED, never omitted — an absent stat and a zero stat are different claims', () => {
    // The mock's attacker carries no penetration at all. "0" on screen says the build has none;
    // a blank row would say nobody modelled it.
    render(
      <StatBlockPanel
        role="Attacker"
        championName="Aatrox"
        portraitSrc={null}
        stats={MOCK_RESULT.attackerStats}
      />,
    );
    // Announced as "Armor penetration, flat 0" …
    const row = screen.getByRole('row', { name: 'Armor penetration, flat 0' });
    // … and printed as a visible 0, not left blank.
    expect(within(row).getByText('0', { ignore: '.u-visually-hidden' })).toBeTruthy();
  });

  it('shows current health against maximum, so an entry state reads as one', () => {
    // The mock defender enters already damaged — 800 of 1850, a "moment in time" (§3.3).
    mount();
    expect(screen.getByRole('row', { name: /800 of 1850 maximum/ })).toBeTruthy();
  });

  it('keeps the base/bonus split visible, because bonus penetration needs it', () => {
    mount();
    expect(screen.getByRole('row', { name: /100, 60 base plus 40 bonus/ })).toBeTruthy();
  });
});

describe('stat block/how figures read', () => {
  it('a 0..1 chance is spoken as a percentage', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.125)).toBe('12.5%');
  });

  it('critical strike damage reads as a multiplier, in words', () => {
    mount();
    expect(
      screen.getByRole('row', { name: /1.75 times normal damage/ }),
    ).toBeTruthy();
  });

  it('NO stat carries a P / M / T tag — a stat is not a damage figure', () => {
    // DESIGN.md §8's tag says which resistance a figure was measured against. Armor has not
    // been measured against anything, and tagging it would say something untrue.
    mount();
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('.dmg').length).toBe(0);
    expect(table.textContent).not.toMatch(/\d\s?[PMT]\b/);
  });
});

describe('stat block/the nameplate (DESIGN.md §9)', () => {
  it('names the combatant and its level in one sentence', () => {
    mount();
    expect(screen.getByText('Defender: Garen, level 11')).toBeTruthy();
  });

  it('is the ONE place a portrait is full colour, at 64px', () => {
    // Visual rule, asserted on the class that carries the display filter, for the same stated
    // reason as in the picker's test: it has no accessible representation to assert instead.
    const { container } = render(
      <StatBlockPanel
        role="Attacker"
        championName="Aatrox"
        portraitSrc="/Aatrox.png"
        stats={MOCK_RESULT.attackerStats}
      />,
    );
    const portrait = container.querySelector('.portrait')!;
    expect(portrait.classList.contains('portrait--active')).toBe(true);
    expect(portrait.classList.contains('portrait--nameplate')).toBe(true);
  });

  it('renders without a portrait rather than a broken image when no champion is chosen', () => {
    const { container } = render(
      <StatBlockPanel
        role="Attacker"
        championName="—"
        portraitSrc={null}
        stats={MOCK_RESULT.attackerStats}
      />,
    );
    expect(container.querySelector('.portrait')).toBeNull();
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('stat block/attack speed prints THREE decimals (added 2026-08-15)', () => {
  // The rule and its reasoning are `ATTACK_SPEED_DECIMALS` in primitives/readout.ts. It shipped
  // on 2026-08-15 with no test anywhere in this area, and these four are that test. Every figure
  // below is arithmetic on the published champion statistics, not engine output.

  it('keeps the third decimal, where two would round it away', () => {
    // Katarina at level 18, no items: 0.658 + 0.658 × (2.74% × 17) = 0.964496. Two decimals give
    // 0.96, which is the figure the fix exists to stop being printed.
    const stats = { ...DEFENDER, attackSpeed: 0.9644960000000001 };
    mount('Defender', stats);
    const row = screen.getByRole('row', { name: /^Attack speed/ });
    expect(within(row).getByText('0.964', { ignore: '.u-visually-hidden' })).toBeTruthy();
  });

  it('prints the cap as 3.003, never as "3" — a figure the game does not use', () => {
    // Reachable: Kalista at 18 holding the six highest attack-speed items resolves to 3.3069
    // uncapped, which the engine caps. At two decimals this row reads "3".
    mount('Defender', { ...DEFENDER, attackSpeed: 3.003 });
    const row = screen.getByRole('row', { name: /^Attack speed/ });
    expect(within(row).getByText('3.003', { ignore: '.u-visually-hidden' })).toBeTruthy();
    expect(row.textContent).not.toMatch(/(^|[^.\d])3([^.\d]|$)/);
  });

  it('SPEAKS the same figure it prints — rounding only the visible value is the older defect', () => {
    mount('Defender', { ...DEFENDER, attackSpeed: 0.9644960000000001 });
    // The accessible name is the whole row, so this asserts the spoken cell, not the visible one.
    expect(screen.getByRole('row', { name: 'Attack speed 0.964' })).toBeTruthy();
  });

  it('is the ONLY row with a third decimal — the exception is named, not a widening', () => {
    // Lux's armor at level 18 is 100.7405 and her health 2263.2065; both stay at two places.
    const stats = { ...DEFENDER, attackSpeed: 0.9644960000000001, armor: 100.7405, armorBase: 100.7405, armorBonus: 0 };
    mount('Defender', stats);
    const withThree = statRows(stats).filter((r) => /\.\d{3}(?!\d)/.test(r.value));
    expect(withThree.map((r) => r.label)).toEqual(['Attack speed']);
  });
});

describe('stat block/mana and the bonus-health split (added 2026-08-13)', () => {
  it('prints the base + bonus split of MAXIMUM health beside the current figure', () => {
    // Bonus health is not derivable from a total, and an ability scaling on it is unmodellable
    // without the figure. 1850 maximum = 1470 base at level 11 + 380 from the build.
    mount();
    const row = screen.getByRole('row', { name: /^Health/ });
    expect(row.textContent).toContain('1470');
    expect(row.textContent).toContain('380');
  });

  it('shows NO mana row for a champion who has no mana pool', () => {
    // Garen's resource is "None"; Aatrox's is a Blood Well. Neither has mana, and the stat block
    // says so by carrying no figure. A row reading "Mana 0" would claim an empty mana pool.
    mount();
    expect(screen.queryByRole('row', { name: /^Mana/ })).toBeNull();
    expect(statRows(MOCK_RESULT.attackerStats).some((r) => r.label === 'Mana')).toBe(false);
  });

  it('shows the mana row for a champion whose resource IS mana', () => {
    // Ryze: 300 base + 70 per level. The point of decision 3 — Ryze Q reads the caster's
    // maximum mana and was unmodellable while the stat block carried none.
    const ryze = { ...DEFENDER, mana: 640, maxMana: 1000 };
    mount('Defender', ryze);
    const row = screen.getByRole('row', { name: /^Mana/ });
    expect(row.textContent).toContain('640');
    expect(row.textContent).toContain('1000');
    expect(statRows(ryze)).toHaveLength(15);
  });
});
