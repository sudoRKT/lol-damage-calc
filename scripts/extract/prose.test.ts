// Known-answer tests for the description-prose path.
//
// Every fixture below is the real wikitext of the named ability, fetched 2026-08-13 and
// trimmed to the sentence under test. The point of most of these tests is what is REFUSED:
// this path's dangerous failure is inventing damage, so the refusals are the safety property
// and they are pinned individually.

import { describe, expect, it } from 'vitest';

import { indexDamageData, parseDamageData } from './damage-data.ts';
import { scanProse } from './prose.ts';

const DAMAGE_DATA = indexDamageData(
  parseDamageData(`
return {
  ["Ziggs"] = { ["Short Fuse"] = { ["damage"] = { ["damageType"] = DamageType_Magic } } },
  ["Caitlyn"] = { ["Headshot"] = { ["attack"] = { ["damageType"] = DamageType_Physical } } },
}
`),
);

function scan(champion: string, ability: string, fields: Record<string, string>, hasLeveling = false) {
  return scanProse({
    champion,
    ability,
    fields,
    vars: {},
    damageData: DAMAGE_DATA,
    hasLevelingComponents: hasLeveling,
  });
}

describe('the damage judgement reads the wrapper, not the neighbourhood', () => {
  it('reads a wrapped level progression as damage (Ziggs Short Fuse)', () => {
    const r = scan('Ziggs', 'Short Fuse', {
      description:
        "{{sbc|Innate:}} Periodically, '''Ziggs''' empowers his next {{tip|basic attack}} to deal " +
        "{{as|{{pp|16+4*x for 6; then +8*x for 6; then +12*x for 8}}|magic damage}} " +
        "{{as|(+ 50% AP)}} {{as|'''bonus''' magic damage}}.",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.label).toBe('Bonus Magic Damage');
    expect(r.rows[0]!.damageType).toBe('magic');
    // The value keeps the ratio block and drops the noun phrase that names the row.
    expect(r.rows[0]!.value).toContain('(+ 50% AP)');
    expect(r.rows[0]!.value).toContain('{{pp|');
    expect(r.rows[0]!.value).not.toMatch(/bonus''' magic damage/);
  });

  it('refuses life steal even though the sentence is full of numbers (Nasus Soul Eater)', () => {
    const r = scan('Nasus', 'Soul Eater', {
      description: "{{sbc|Innate:}} '''Nasus''' gains {{as|{{sti|life steal|{{pp|key=%|12 to 24 for 3|1 to 13}}}} life steal}}.",
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toContain('not-damage');
  });

  it('refuses a cooldown stated the same way (Ziggs description2)', () => {
    const r = scan('Ziggs', 'Short Fuse', {
      description2: "''Short Fuse's'' {{sti|cooldown}} is reduced by {{pp|4 to 6 for 3|1 to 13}} seconds whenever.",
    });
    expect(r.rows).toHaveLength(0);
    // Nothing wraps it, so nothing in the source says what it is.
    expect(r.skipped.map((s) => s.refusal)).toEqual(['no-wrapper']);
  });

  it('refuses a wrapped value whose noun names nothing we recognise', () => {
    const r = scan('X', 'Y', { description: 'gains {{as|{{pp|20 to 75}}|ms}} for a while.' });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toEqual(['unclear']);
  });
});

describe('the refusals that stop a wrong number rather than a missing one', () => {
  it('refuses a percentage sitting where a flat base would go (Caitlyn Headshot)', () => {
    const r = scan('Caitlyn', 'Headshot', {
      description2:
        "'''Caitlyn's''' basic attack is empowered to deal {{as|{{pp|key=%|60 to 100 for 3|1 to 13}}|ad}} " +
        "{{as|(+ 30%) AD}} {{as|'''bonus''' physical damage}}.",
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toContain('percent-payload');
  });

  it('refuses a footnote variant rather than adding it to the real instance', () => {
    const r = scan('Ziggs', 'Short Fuse', {
      description:
        "deal {{as|{{pp|16 to 160}}|magic damage}} {{as|magic damage}}," +
        "{{ft|increased by 75% against structures.|increased to {{as|{{pp|28 to 280}}|magic damage}} {{as|magic damage}}.}}",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.map((s) => s.refusal)).toContain('footnote-variant');
  });

  it('refuses two groups that produced the same label, rather than letting one shadow the other', () => {
    const r = scan('X', 'Y', {
      description: 'deal {{as|{{pp|10 to 20}}|magic damage}} {{as|magic damage}}.',
      description2: 'and deal {{as|{{pp|30 to 40}}|magic damage}} {{as|magic damage}}.',
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.filter((s) => s.refusal === 'duplicate-label')).toHaveLength(2);
  });

  it('reads nothing at all from an ability whose leveling rows already gave damage', () => {
    const r = scan(
      'Alistar',
      'Trample',
      { description: "deals {{as|{{pplevel|20 to 275}} '''bonus''' magic damage}}." },
      true,
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toEqual(['has-leveling-rows']);
  });

  it('refuses a block whose prose type contradicts Module:DamageData/data', () => {
    const r = scan('Ziggs', 'Short Fuse', {
      description: 'deal {{as|{{pp|10 to 20}}|physical damage}} {{as|physical damage}}.',
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toContain('type-conflict');
  });
});

describe('the non-damage nouns are whole words', () => {
  it('does not read "health" as "heal"', () => {
    // The failure this pins: `heals?` without a trailing word boundary matches the first four
    // letters of "health", which disqualified every percent-of-health passive in the game.
    const r = scan('X', 'Y', {
      description:
        "deal {{as|{{pp|10 to 20}} of the target's '''maximum''' health|magic damage}} {{as|magic damage}}.",
    });
    expect(r.skipped.map((s) => s.refusal)).not.toContain('not-damage');
    expect(r.rows).toHaveLength(1);
  });

  it('still refuses a genuine heal', () => {
    const r = scan('X', 'Y', {
      description: "{{as|{{pp|10 to 20}} heals him for 5% of his '''maximum''' health}} {{as|magic damage}}.",
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toContain('not-damage');
  });

  it('does not read "secondary" as "second"', () => {
    const r = scan('X', 'Y', {
      description: 'deal {{as|{{pp|10 to 20}}|magic damage}} to secondary targets {{as|magic damage}}.',
    });
    expect(r.skipped.map((s) => s.refusal)).not.toContain('not-damage');
  });
});

describe('a run of bonus groups with nothing to add them to', () => {
  it('refuses a run whose every block is a bare "(+ …)" addition', () => {
    // Akali's mark states its base as a bare progression OUTSIDE the wrapped run. Storing the
    // additions alone would give the ability its ratios and no payload.
    const r = scan('X', 'Y', {
      description:
        "empowers his attack to deal {{pplevel|35 to 53}} " +
        "{{as|(+ 60% '''bonus''' AD)}} {{as|(+ 55% AP)}} {{as|'''bonus''' magic damage}}.",
    });
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.refusal)).toContain('bonus-only-run');
  });

  it('KEEPS a bonus group whose magnitude is itself a progression — that is the whole damage', () => {
    // Warwick, Katarina and Volibear state their entire passive this way. A first cut of the
    // guard above refused all three and dropped damage that was already read correctly.
    const r = scan('X', 'Y', {
      description: "deal {{as|(+ {{pplevel|10 to 50}}% '''bonus''' AD)}} {{as|magic damage}}.",
    });
    expect(r.rows).toHaveLength(1);
  });
});

describe('unwrapping a value block without changing what it means', () => {
  it('unwraps a composite block so its nested ratios are read', () => {
    // Illaoi and Seraphine put the base, both ratios and the noun inside ONE block.
    const r = scan('X', 'Y', {
      description: "deals {{as|{{pplevel|9 to 180}} {{as|(+ 110% AD)}} {{as|(+ 40% AP)}} physical damage}}.",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.value).toContain('(+ 110% AD)');
  });

  it('does NOT unwrap a progression that is the magnitude of a ratio', () => {
    // `{{pplevel|4 to 10}} of the target's maximum health` is 4-10% OF HEALTH. Unwrapped it
    // becomes 4-to-10 flat damage — a different number, and a plausible one.
    const r = scan('X', 'Y', {
      description:
        "deal {{as|'''bonus''' magic damage}} equal to {{as|{{pplevel|key=%|4 to 10}} of the target's '''maximum''' health}}.",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.value).toMatch(/\{\{as\|\{\{pplevel/);
    expect(r.skipped.map((s) => s.refusal)).not.toContain('percent-payload');
  });
});

describe('one bounded connective joins a value to the noun that names it', () => {
  it('joins across "equal to"', () => {
    const r = scan('X', 'Y', {
      description: "deal {{as|'''bonus''' magic damage}} equal to {{as|10% of the target's '''maximum''' health}}.",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.label).toBe('Bonus Magic Damage');
  });

  it('does not join across anything else', () => {
    const r = scan('X', 'Y', {
      description: "deal {{as|'''bonus''' magic damage}} and then later on {{as|10% of the target's '''maximum''' health}}.",
    });
    expect(r.rows).toHaveLength(0);
  });
});

describe('{{pplevel}} is the same mechanism as {{pp}}', () => {
  it('reads a pplevel block wrapped as damage', () => {
    const r = scan('Akshan', 'Dirty Fighting', {
      description3: "deals {{as|{{pplevel|15;40;80;150|1;6;11;16}}|magic damage}} {{as|(+ 60% AP)}} {{as|'''bonus''' magic damage}}.",
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.label).toBe('Bonus Magic Damage');
  });
});
