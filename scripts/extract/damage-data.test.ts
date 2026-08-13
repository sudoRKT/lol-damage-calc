// Known-answer tests for the Module:DamageData/data reader.
//
// The fixture below is copied verbatim from the module fetched on 2026-08-13 (revision content
// via the URL in damage-data.ts), including the shared property templates that open the file.
// Those templates are the reason the reader walks a key stack instead of assuming a depth: they
// sit at the same nesting levels as champion data and would otherwise be read as champions.

import { describe, expect, it } from 'vitest';

import { indexDamageData, parseDamageData, statedTypesFor } from './damage-data.ts';

const FIXTURE = `
-- <pre>
local DamageType_Physical = "Physical"
local DamageType_Magic = "Magic"

local PropertyTemplate_Raw = {
  ["ApplyLifesteal"] = false,
  ["RespectImmunity"] = true,
}

local DamageTemplate_Attack = {
  ["properties"] = PropertyTemplate_Raw,
  ["tags"] = {},
}

return {
  ["Caitlyn"] = {
    ["Headshot"] = { -- P
      ["attack"] = {
        ["damageType"] = DamageType_Physical,
        ["damageInfo"] = DamageTemplate_Attack,
      },
    },
    ["90 Caliber Net"] = { -- E
      ["damage"] = {
        ["damageType"] = DamageType_Magic,
        ["damageInfo"] = DamageTemplate_Attack,
      },
    },
  },
  ["Kayn"] = {
    ["Blade's Reach"] = { -- E
      ["damage"] = {
        ["notes"] = "the brace { in this string must not move the stack",
        ["damageType"] = DamageType_Varies,
        ["damageInfo"] = {
          ["properties"] = { ["ApplyLifesteal"] = true },
        },
      },
    },
  },
}
`;

describe('parseDamageData', () => {
  const instances = parseDamageData(FIXTURE);
  const index = indexDamageData(instances);

  it('reads every stated instance and no more', () => {
    expect(instances).toHaveLength(3);
  });

  it('keys each instance by champion, ability and instance name', () => {
    expect(instances[0]).toEqual({
      champion: 'Caitlyn',
      ability: 'Headshot',
      instance: 'attack',
      stated: 'physical',
      raw: 'Physical',
    });
  });

  it('does not mistake the shared property templates for champions', () => {
    expect(instances.map((d) => d.champion)).toEqual(['Caitlyn', 'Caitlyn', 'Kayn']);
  });

  it('records Varies as stated:null rather than guessing a type', () => {
    const kayn = instances.find((d) => d.champion === 'Kayn')!;
    expect(kayn.stated).toBeNull();
    expect(kayn.raw).toBe('Varies');
  });

  it('is not derailed by a brace inside a string value', () => {
    expect(statedTypesFor(index, 'Kayn', "Blade's Reach").listed).toBe(true);
  });

  it('reports the types stated for one ability', () => {
    const s = statedTypesFor(index, 'Caitlyn', 'Headshot');
    expect([...s.types]).toEqual(['physical']);
    expect(s.listed).toBe(true);
    expect(s.hasUnstated).toBe(false);
  });

  it('reports an ability the module does not list as unlisted, not as typeless', () => {
    const s = statedTypesFor(index, 'Nasus', 'Soul Eater');
    expect(s.listed).toBe(false);
    expect(s.types.size).toBe(0);
  });

  it('reports Varies as listed but unstated', () => {
    const s = statedTypesFor(index, 'Kayn', "Blade's Reach");
    expect(s.hasUnstated).toBe(true);
    expect(s.types.size).toBe(0);
  });
});
