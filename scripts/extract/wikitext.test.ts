// Tests for the ability-template reader.
//
// Every fixture below is literal wikitext copied from a live template fetched on 2026-08-12
// (patch 16.16.1). The first two cases are regression tests for the two bugs recorded in
// wikitext.ts — each of them silently produced wrong numbers across hundreds of abilities.

import { describe, expect, it } from 'vitest';

import {
  findBlocks,
  parseFields,
  parseVardefines,
  plainText,
  splitArgs,
  statRows,
  substituteVars,
} from './wikitext.ts';

// Template:Data Lux/Light Binding, trimmed to the fields that matter.
const LUX_Q = `{{{{{1<noinclude>|Ability data</noinclude>}}}|Light Binding|{{{2|}}}
|champion     = Lux
|skill        = Q
|leveling     = {{st|Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}}}
|cooldown     = 10
|damagetype   = Magic
|notes        =
* Targets immune to the {{tip|root}} still count towards the two-target limit.
|yvideo       = AFZYmuQxorU
}}`;

describe('regression — field splitting must not eat a trailing }}', () => {
  it('keeps the closing braces of a value that ends in a template', () => {
    const f = parseFields(LUX_Q);
    // The bug returned '{{ap|80 to 240}} {{as|(+ 75% AP)' — one '}}' short — which made
    // the AP ratio invisible and the ability look like flat damage.
    expect(f.leveling).toBe('{{st|Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}}}');
  });

  it('reads the whole field set, and keeps multi-line values together', () => {
    const f = parseFields(LUX_Q);
    expect(f.champion).toBe('Lux');
    expect(f.skill).toBe('Q');
    expect(f.damagetype).toBe('Magic');
    expect(f.notes).toContain('two-target limit');
  });

  it('recovers the AP ratio the bug hid', () => {
    const rows = statRows(parseFields(LUX_Q));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Magic Damage');
    expect(rows[0]!.value).toBe('{{ap|80 to 240}} {{as|(+ 75% AP)}}');
    expect(findBlocks(rows[0]!.value, 'as')).toHaveLength(1);
  });
});

describe('regression — nested blocks must be found by counting braces', () => {
  it('reads a {{ap}} whose arguments are themselves templates', () => {
    // Template:Data Teemo/Toxic Shot. A non-greedy regex returned '{{#var:Ob1'.
    const v = '{{ap|{{#var:Ob1}} to {{#var:Ob5}}}}';
    const blocks = findBlocks(v, 'ap');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.inner).toBe('{{#var:Ob1}} to {{#var:Ob5}}');
  });

  it('reads a ratio that itself contains a per-rank progression', () => {
    // Template:Data Darius/Decimate — the ratio scales per rank as well as the base.
    const v = '{{ap|50 to 170}} {{as|(+ {{ap|100 to 140}}% AD)}}';
    const as = findBlocks(v, 'as');
    expect(as).toHaveLength(1);
    expect(as[0]!.inner).toBe('(+ {{ap|100 to 140}}% AD)');
    // Two {{ap}} in total: the base, and the one inside the ratio.
    expect(findBlocks(v, 'ap')).toHaveLength(2);
  });

  it('does not confuse a following block for a nested one', () => {
    const v = '{{ap|20 to 120}} {{as|(+ 130% AD)}} {{as|(+ 40% AP)}}';
    expect(findBlocks(v, 'as').map((b) => b.inner)).toEqual(['(+ 130% AD)', '(+ 40% AP)']);
  });
});

describe('splitArgs', () => {
  it('splits on | only at depth zero', () => {
    expect(splitArgs('Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}')).toEqual([
      'Magic Damage',
      '{{ap|80 to 240}} {{as|(+ 75% AP)}}',
    ]);
  });

  it('keeps an explicit per-rank list intact as one argument', () => {
    // Template:Data Kayle/Divine Judgment — the pipes here are DATA, not separators.
    const rows = statRows(
      parseFields('|leveling = {{st|Magic Damage|{{ap|675|675|775}}}}'),
    );
    expect(rows[0]!.value).toBe('{{ap|675|675|775}}');
    expect(findBlocks(rows[0]!.value, 'ap')[0]!.inner).toBe('675|675|775');
  });
});

describe('vardefine headers', () => {
  // Template:Data Aatrox/The Darkin Blade header, verbatim.
  const AATROX = `{{#vardefine:b1|10}}<!-- First Cast base damage Rank 1
{{#vardefine:b2|70}}<!-- First Cast base damage Rank 5
{{#vardefine:r1|60}}<!-- rank 1 AD ratio as a PERCENTAGE
{{#vardefine:sd|1.75}}<!-- Total Sweetspot Damage as a DECIMAL
|leveling = {{st|First Cast Damage|{{ap|{{#var:b1}} to {{#var:b2}}}} {{as|(+ {{#var:r1}}% AD)}}}}`;

  it('reads the declared numbers', () => {
    expect(parseVardefines(AATROX)).toEqual({ b1: '10', b2: '70', r1: '60', sd: '1.75' });
  });

  it('substitutes them so the template reads as an ordinary one', () => {
    const vars = parseVardefines(AATROX);
    const row = statRows(parseFields(AATROX))[0]!;
    const base = findBlocks(row.value, 'ap')[0]!.inner;
    expect(substituteVars(base, vars)).toBe('10 to 70');
  });

  it('unwraps the display-only {{fd|x}} decimal wrapper', () => {
    expect(substituteVars('{{fd|2.5}}% of maximum health', {})).toBe('2.5% of maximum health');
  });

  it('terminates on a circular definition instead of hanging', () => {
    const out = substituteVars('{{#var:a}}', { a: '{{#var:b}}', b: '{{#var:a}}' });
    expect(typeof out).toBe('string');
  });

  it('leaves an undefined variable in place rather than silently dropping it', () => {
    // Dropping it would turn a missing number into a plausible-looking empty base.
    expect(substituteVars('{{#var:nope}} to 5', {})).toBe('{{#var:nope}} to 5');
  });
});

describe('statRows', () => {
  it('reads several label/value pairs from one {{st}} block', () => {
    // Template:Data Darius/Decimate — blade and handle in a single block.
    const rows = statRows(
      parseFields(
        '|leveling = {{st|Physical Damage (Blade)|{{ap|50 to 170}}|Reduced Damage (Handle)|{{ap|50*0.35 to 170*0.35}}}}',
      ),
    );
    expect(rows.map((r) => r.label)).toEqual([
      'Physical Damage (Blade)',
      'Reduced Damage (Handle)',
    ]);
  });

  it('reads several {{st}} blocks from one field', () => {
    // Template:Data Vladimir/Transfusion — damage and heal are separate blocks.
    const rows = statRows(
      parseFields(
        '|leveling = {{st|Magic Damage|{{ap|80 to 160}}}}\n{{st|Heal|{{ap|20 to 40}}}}',
      ),
    );
    expect(rows.map((r) => r.label)).toEqual(['Magic Damage', 'Heal']);
  });

  it('reads leveling2 and leveling3 as well as leveling', () => {
    const rows = statRows(
      parseFields(
        '|leveling = {{st|A|{{ap|1 to 2}}}}\n|leveling2 = {{st|B|{{ap|3 to 4}}}}\n|leveling3 = {{st|C|{{ap|5 to 6}}}}',
      ),
    );
    expect(rows.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.field)).toEqual(['leveling', 'leveling2', 'leveling3']);
  });

  it('returns nothing for a template with no leveling table', () => {
    // 136 damage-bearing abilities are like this — their numbers are in the description.
    expect(statRows(parseFields('|champion = Vayne\n|skill = W'))).toEqual([]);
  });
});

describe('plainText', () => {
  it('strips templates and bold markup from a label', () => {
    expect(plainText("{{ii|Infinity Edge|IE}} '''Damage''' Per Spin")).toBe('Damage Per Spin');
  });
});
