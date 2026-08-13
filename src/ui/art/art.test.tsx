// @vitest-environment jsdom
//
// The rules DESIGN.md §9 and SPECIFICATION §10.1 place on official game art. These are tested by
// accessible name, not by markup, for the same reason the damage-value tests are: what a screen
// reader announces is the claim, and the visual cue is the redundant channel.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AbilityChip, chipAccessibleName } from './AbilityChip.tsx';
import { ChampionPortrait } from './ChampionPortrait.tsx';

const ICON = 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/spell/LuxLightBinding.png';

describe('an ability chip announces the ability and its damage type in words', () => {
  it('a magic ability is announced as "Q — Light Binding, magic damage"', () => {
    render(<AbilityChip src={ICON} slot="Q" abilityName="Light Binding" damageType="magic" />);
    expect(screen.getByRole('img', { name: 'Q — Light Binding, magic damage' })).toBeTruthy();
  });

  it('NEVER announces the bare letter tag — the letter is visual, the word is definitive', () => {
    render(<AbilityChip src={ICON} slot="Q" abilityName="Light Binding" damageType="magic" />);
    expect(screen.queryByRole('img', { name: 'M' })).toBeNull();
    expect(screen.queryByRole('img', { name: /Q$/ })).toBeNull();
  });

  it('a non-damaging ability is announced as having no damage type, not left silent', () => {
    render(<AbilityChip src={ICON} slot="W" abilityName="Prismatic Barrier" damageType={null} />);
    expect(screen.getByRole('img', { name: 'W — Prismatic Barrier, no damage type' })).toBeTruthy();
  });

  it('speaks the name once — the image inside is hidden from assistive technology', () => {
    // Two nested labelled elements would announce the ability twice.
    render(<AbilityChip src={ICON} slot="Q" abilityName="Light Binding" damageType="true" />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('a decorative chip is hidden, so a row that already names the source does not say it twice', () => {
    // Added 2026-08-13 with the breakdown table. A table row whose text is "Q — The Darkin Blade
    // (1st cast)" holding a labelled chip announced the ability twice. Same rule, and the same
    // reason, as ChampionPortrait's `decorative` — and the VISUAL cues are unaffected: the
    // damage-type underline and the P/M/T tag are still drawn.
    const { container } = render(
      <span>
        <AbilityChip
          src={ICON}
          slot="Q"
          abilityName="The Darkin Blade"
          damageType="physical"
          size="table"
          decorative
        />
        <span>Q — The Darkin Blade (1st cast)</span>
      </span>,
    );
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelector('.chip__underline--physical')).not.toBeNull();
    expect(container.querySelector('.chip__tag--physical')).not.toBeNull();
  });

  it('covers all three damage types and the absence of one', () => {
    expect(chipAccessibleName('Q', 'X', 'physical')).toContain('physical damage');
    expect(chipAccessibleName('Q', 'X', 'magic')).toContain('magic damage');
    expect(chipAccessibleName('Q', 'X', 'true')).toContain('true damage');
    expect(chipAccessibleName('Q', 'X', null)).toContain('no damage type');
  });
});

describe('portraits', () => {
  it('carry the champion name, so a portrait is never an unlabelled image', () => {
    render(<ChampionPortrait src="/x.png" name="Lux" />);
    expect(screen.getByRole('img', { name: 'Lux' })).toBeTruthy();
  });

  it('a decorative portrait is hidden, so a labelled control does not say the name twice', () => {
    // A picker button holding a portrait AND the visible word "Garen" announced "Garen Garen"
    // before this existed. The control's own label must be the single name.
    render(
      <button type="button" aria-label="Defender: Garen">
        <ChampionPortrait src="/x.png" name="Garen" size="row" decorative />
        <span>Garen</span>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Defender: Garen' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('an inactive portrait is desaturated and an active one is not', () => {
    // §9: full colour ONLY for the two combatants in play. The filter is a display treatment;
    // the asset is never edited (SPECIFICATION §15).
    const { container: inactive } = render(<ChampionPortrait src="/x.png" name="Garen" active={false} />);
    const { container: active } = render(<ChampionPortrait src="/x.png" name="Lux" active />);
    expect(inactive.querySelector('.portrait--active')).toBeNull();
    expect(active.querySelector('.portrait--active')).not.toBeNull();
  });
});
