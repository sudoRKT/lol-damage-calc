// Known-answer tests for the shipped-game-data referee.
//
// The two fixtures are the real arrays fetched 2026-08-13, and the expectations are the wiki's
// own published values for the same abilities. The point of these tests is the OFFSET: reading
// index 0 as rank 1 shifts every value by one rank and is exactly the kind of self-consistent
// wrong answer this project exists to catch.

import { describe, expect, it } from 'vitest';

import { GameDataError, ranksOf, referenceSeries, spellDataValues } from './game-data.ts';

const DUMP = {
  'Characters/Lux/Spells/LuxLightBindingAbility/LuxLightBinding': {
    mSpell: {
      DataValues: [
        { name: 'BaseDamage', values: [40, 80, 120, 160, 200, 240, 280] },
        { name: 'APRatio', values: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75] },
      ],
      // Arena. Must never be read for a Summoner's Rift figure.
      DataValuesModeOverride: {
        cherry: { SpellDataValues: [{ name: 'BaseDamage', values: [70, 110, 150, 190, 230, 270, 310] }] },
      },
    },
  },
  'Characters/Ashe/Spells/VolleyAbility/Volley': {
    mSpell: { DataValues: [{ name: 'BaseDamage', values: [25, 60, 95, 130, 165, 200, 235] }] },
  },
};

describe('the shipped game data, offset and truncated', () => {
  it('reads Lux Q as the wiki does — 80 at rank 1, not 40', () => {
    expect(referenceSeries(DUMP, 'LuxLightBinding', 'BaseDamage', 5)).toEqual([80, 120, 160, 200, 240]);
  });

  it('reads Ashe W as the wiki does', () => {
    expect(referenceSeries(DUMP, 'Volley', 'BaseDamage', 5)).toEqual([60, 95, 130, 165, 200]);
  });

  it('drops the dead tail past the ability\'s real rank count', () => {
    // Seven entries, five ranks: index 6 is a rank no player can reach.
    expect(ranksOf([40, 80, 120, 160, 200, 240, 280], 5)).toHaveLength(5);
    expect(ranksOf([40, 80, 120, 160, 200, 240, 280], 5)).not.toContain(280);
  });

  it('does NOT read index 0 as rank 1 — the shift that would corrupt every rank', () => {
    expect(ranksOf([40, 80, 120, 160, 200, 240, 280], 5)[0]).not.toBe(40);
  });

  it('never reads a game-mode override', () => {
    // The Arena copy of Lux Q reads 70..310. Nothing here may return it.
    const s = referenceSeries(DUMP, 'LuxLightBinding', 'BaseDamage', 5)!;
    expect(s).not.toContain(110);
    expect(s[0]).toBe(80);
  });

  it('refuses an array too short for the rank count rather than padding it', () => {
    expect(() => ranksOf([40, 80, 120], 5)).toThrow(GameDataError);
  });

  it('returns undefined for a spell or value it does not carry', () => {
    expect(spellDataValues(DUMP, 'NotASpell')).toBeUndefined();
    expect(referenceSeries(DUMP, 'Volley', 'NotAValue', 5)).toBeUndefined();
  });
});
