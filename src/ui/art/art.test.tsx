// @vitest-environment jsdom
//
// The rules DESIGN.md §9 and SPECIFICATION §10.1 place on official game art. These are tested by
// accessible name, not by markup, for the same reason the damage-value tests are: what a screen
// reader announces is the claim, and the visual cue is the redundant channel.

import { describe, expect, it } from 'vitest';
import { RuneChip, runeChipAccessibleName } from './RuneChip';
import { cleanup, render, screen } from '@testing-library/react';

import type { DamageType } from '../../types/data';
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

  // =======================================================================================
  // WHAT THE CHIP'S CORNER SAYS. Changed 2026-08-14 (DESIGN-AUDIT.md part 2, option A).
  //
  // It carried the damage type as P / M / T. The project owner read the `M` on an ability icon
  // as an ability SLOT letter, because Q / W / E / R is what a League player expects in exactly
  // that position. The cue was correct and unreadable, which makes it decoration.
  //
  // The three cues now, each in one place and one form: the corner is the SLOT and is neutral,
  // the underline is the damage type in hue, and the WORD beneath is the damage type in text.
  // =======================================================================================

  it('the corner tag is the ability SLOT, not the damage type', () => {
    for (const slot of ['Q', 'W', 'E', 'R', 'P']) {
      cleanup();
      const { container } = render(
        <AbilityChip src={ICON} slot={slot} abilityName="An ability" damageType="magic" />,
      );
      expect(container.querySelector('.chip__tag')?.textContent).toBe(slot);
    }
  });

  it('the corner tag carries NO damage-type class, because a slot is not damage data', () => {
    // DESIGN.md §1 reserves hue for damage data. The letter that used to sit here was hued
    // because it WAS the damage type; a slot letter must not be, and the mechanical form of
    // that is that no per-type rule exists for it at all (see token-audit's hue allowlist).
    const { container } = render(
      <AbilityChip src={ICON} slot="Q" abilityName="Light Binding" damageType="physical" />,
    );
    const tag = container.querySelector('.chip__tag')!;
    expect(tag.className).toBe('chip__tag');
  });

  it('the damage type is a WORD beneath the chip, in the same vocabulary a figure uses', () => {
    const expected: Array<[DamageType, string]> = [
      ['physical', 'phys'],
      ['magic', 'mag'],
      ['true', 'true'],
    ];
    for (const [type, word] of expected) {
      cleanup();
      const { container } = render(
        <AbilityChip src={ICON} slot="Q" abilityName="An ability" damageType={type} />,
      );
      expect(container.querySelector(`.chip__type--${type}`)?.textContent).toBe(word);
    }
  });

  it('A CHIP IS NEVER LEFT WITH COLOUR AS ITS ONLY DAMAGE-TYPE CUE', () => {
    // This is the whole reason the word exists rather than the type simply leaving the chip.
    // A shelf chip has no figure anywhere near it — the user has not run anything yet — so
    // deleting the letter without replacing it would have left the underline hue alone,
    // which is the channel SPECIFICATION §10.1 forbids.
    for (const type of ['physical', 'magic', 'true'] as DamageType[]) {
      cleanup();
      const { container } = render(
        <AbilityChip src={ICON} slot="W" abilityName="An ability" damageType={type} />,
      );
      const word = container.querySelector('.chip__type')!.textContent!;
      expect(word.length).toBeGreaterThan(0);
      expect(word).not.toBe('—');
    }
  });

  it('a non-damaging ability says so in words too, rather than showing nothing', () => {
    const { container } = render(
      <AbilityChip src={ICON} slot="W" abilityName="Prismatic Barrier" damageType={null} />,
    );
    expect(container.querySelector('.chip__underline--none')).not.toBeNull();
    expect(container.querySelector('.chip__type--none')?.textContent).toBe('—');
    // …and it still gets its slot, because it still occupies one.
    expect(container.querySelector('.chip__tag')?.textContent).toBe('W');
  });

  it('a decorative chip is hidden, so a row that already names the source does not say it twice', () => {
    // Added 2026-08-13 with the breakdown table. A table row whose text is "Q — The Darkin Blade
    // (1st cast)" holding a labelled chip announced the ability twice. Same rule, and the same
    // reason, as ChampionPortrait's `decorative` — and the VISUAL cues are unaffected: the
    // damage-type underline, the SLOT corner tag and the damage-type WORD are all still drawn.
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
    // The corner tag is the ability SLOT now, and it is neutral — it carries no damage-type
    // class at all, because a slot letter is not damage data (DESIGN.md §1).
    expect(container.querySelector('.chip__tag')?.textContent).toBe('Q');
    expect(container.querySelector('.chip__tag--physical')).toBeNull();
    // The damage type moved to the word beneath the chip, which IS damage data and is hued.
    expect(container.querySelector('.chip__type--physical')?.textContent).toBe('phys');
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

describe('a rune chip announces a rune, and never an item', () => {
  // THE ACCESSIBLE NAME IS THE WHOLE REASON THIS IS A THIRD COMPONENT. `ItemChip` would have
  // rendered the same picture and announced "Electrocute, item", which is a sentence that is not
  // true of the thing on screen. Nothing else about the construction differs, deliberately.
  it('names the rune and calls it a rune', () => {
    expect(runeChipAccessibleName('Electrocute')).toBe('Electrocute, rune');
  });

  it('is an image with that name when it stands alone', () => {
    render(<RuneChip src="/e.png" runeName="Electrocute" />);
    expect(screen.getByRole('img', { name: 'Electrocute, rune' })).toBeTruthy();
  });

  it('announces NOTHING when decorative, so a labelled control is not read twice', () => {
    const { container } = render(<RuneChip src="/e.png" runeName="Electrocute" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('carries no damage-type cue, because a chip is not where that question is answered', () => {
    // 55 of 62 published runes have no modelled effect and one changes a figure. That distinction
    // belongs to the row's status mark, not to the art — a chip encoding it would be a second,
    // quieter status vocabulary competing with VerificationStatusMark.
    const { container } = render(<RuneChip src="/e.png" runeName="Electrocute" />);
    expect(container.querySelector('.chip__underline--none')).toBeTruthy();
    expect(container.querySelector('.chip__tag')?.textContent).toBe('—');
  });
});
