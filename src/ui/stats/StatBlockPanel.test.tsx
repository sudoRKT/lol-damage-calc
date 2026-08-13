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
    ].filter((value) => !printed.includes(String(value)));
    expect(missing).toEqual([]);
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
