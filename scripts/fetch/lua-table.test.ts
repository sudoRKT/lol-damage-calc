// Tests for the Lua module parser. Every construct here was observed in the live
// Module:ChampionData/data — including the two that broke a first attempt: a `--`
// comment sitting immediately after a value, and a stat written as arithmetic.

import { describe, expect, it } from 'vitest';

import { asTable, parseLuaModule, requireNumber, requireString } from './lua-table.ts';

describe('lua-module-parser', () => {
  it('reads nested tables, string keys and decimals', () => {
    const parsed = parseLuaModule(`return {
      ["Aatrox"] = {
        ["id"] = 266,
        ["stats"] = { ["hp_base"] = 650, ["arm_lvl"] = 4.8 },
      },
    }`);
    expect(parsed).toEqual({ Aatrox: { id: 266, stats: { hp_base: 650, arm_lvl: 4.8 } } });
  });

  it('turns positional [1] keys into "1", so skill lists are readable', () => {
    const parsed = parseLuaModule(
      `return { ["skill_q"] = {[1] = "The Darkin Blade", [2] = "The Darkin Blade 2"} }`,
    );
    expect(parsed).toEqual({ skill_q: { '1': 'The Darkin Blade', '2': 'The Darkin Blade 2' } });
  });

  it('skips a line comment that follows a value on the same line', () => {
    // Verbatim shape of the live file's Azir entry.
    const parsed = parseLuaModule(
      `return { ["range"] = 175,--see his passive in his article for the real range\n ["ms"] = 345 }`,
    );
    expect(parsed).toEqual({ range: 175, ms: 345 });
  });

  it('evaluates arithmetic values with Lua precedence (Kled & Skaarl hp_lvl)', () => {
    const parsed = parseLuaModule(`return { ["hp_lvl"] = 84+1000/17 }`);
    expect(parsed['hp_lvl']).toBeCloseTo(142.8235294117647, 10);
  });

  it('handles negative numbers and parentheses', () => {
    expect(parseLuaModule(`return { ["a"] = -0.153999999165534, ["b"] = (1+2)*3 }`)).toEqual({
      a: -0.153999999165534,
      b: 9,
    });
  });

  it('keeps apostrophes in names such as Cho\'Gath', () => {
    const parsed = parseLuaModule(`return { ["Cho'Gath"] = { ["apiname"] = "Chogath" } }`);
    expect(Object.keys(parsed)).toEqual(["Cho'Gath"]);
  });

  it('reports the line number when the source is not what we expect', () => {
    expect(() => parseLuaModule(`return {\n  ["a"] = @,\n}`)).toThrow(/line 2/);
  });

  it('names the field when a required value is the wrong type', () => {
    const table = asTable(parseLuaModule(`return { ["stats"] = { ["hp_base"] = "x" } }`)['stats'], 'stats');
    expect(() => requireNumber(table, 'hp_base', 'Aatrox')).toThrow(/hp_base/);
    expect(() => requireString(table, 'missing', 'Aatrox')).toThrow(/missing/);
  });
});
