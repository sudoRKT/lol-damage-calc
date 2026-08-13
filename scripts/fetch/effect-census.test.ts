// Known-answer tests for the item and rune effect census.
//
// Every wikitext string below is a VERBATIM quote from the live sources on 2026-08-13:
// `Module:ItemData/data` for items, `runesReforged.json` 16.16.1 for runes. They are quoted
// rather than paraphrased because a paraphrase tests the paraphrase.
//
// The expected answers come from DATA-SOURCES §5 (the item pool), §16 (owner-bearing stat
// references, including its own worked examples: Black Cleaver's bare armor, Liandry's
// reading the target, Sunfire and Heartsteel naming nobody) and §26.3 (the reachable/hard
// split). Where a case has no recorded answer, the expectation is what the SOURCE SENTENCE
// says, and the sentence is quoted in the test name.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  classifyEffect,
  findOwnerRefs,
  runeLabelledLines,
  summarise,
  type EffectRecord,
} from './effect-census.ts';
import { CANDIDATE_AUDIT, reconcileAudit } from './effect-census-audit.ts';
import { buildItemEffectRecords, buildRuneEffectRecords } from './effect-population.ts';
import { crossReferenceTarget, findBlocks, plainText, stripHtml } from './effect-text.ts';
import { parseLuaModule } from './lua-table.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function item(ownerName: string, key: string, text: string): EffectRecord {
  return { source: 'item', ownerName, id: 0, key, effectName: null, text };
}
function rune(ownerName: string, text: string): EffectRecord {
  return { source: 'rune', ownerName, id: 0, key: 'rune', effectName: null, text };
}

// ---------------------------------------------------------------------------

describe('effect-text: reading the two shapes the sources arrive in', () => {
  it('finds a nested {{as}} block whole, not truncated at the first inner }}', () => {
    // Blackfire Torch, verbatim.
    const text = '{{as|{{ap|60/6}} {{as|(+ {{ap|6/6}}% AP)}} magic damage|magic damage}}';
    const blocks = findBlocks(text, 'as');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.body).toContain('(+ {{ap|6/6}}% AP)');
    expect(blocks[0]!.end).toBe(text.length);
  });

  it('flattens a template to the words a reader sees', () => {
    expect(plainText("Each stack inflicts {{as|6% armor reduction}}, up to {{as|30%|armor}}")).toBe(
      'Each stack inflicts 6% armor reduction , up to 30% armor',
    );
  });

  it('strips the HTML Data Dragon wraps rune prose in', () => {
    expect(stripHtml('deals bonus <trueDamage>20 - 80 True Damage</trueDamage><br>Cooldown: 10s')).toBe(
      'deals bonus 20 - 80 True Damage Cooldown: 10s',
    );
  });

  it('recognises the module\'s "=>Other Item" cross-reference shorthand', () => {
    expect(crossReferenceTarget('=>Plated Steelcaps')).toBe('Plated Steelcaps');
    expect(crossReferenceTarget('Deal 15 magic damage')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('damage instances: what the source states a value for', () => {
  it('Bami\'s Cinder "Deal {{as|15 magic damage}} every second" is an instance, R1', () => {
    const row = classifyEffect(
      item(
        "Bami's Cinder",
        'pass',
        'Taking or dealing damage activates this passive for 3 seconds. ' +
          'Deal {{as|15 magic damage}} every second to enemies within 325 units.',
      ),
    );
    expect(row.damage).toBe('instance');
    expect(row.reach).toBe('R1');
  });

  // THE DEFECT CLASS THIS CENSUS FOUND IN ITS OWN FIRST RUN. 20 of 85 effects flagged as
  // dealing damage were a trigger phrase or a shield. The rule is population-wide: a run
  // that names a damage type and carries NO value is never an instance.
  it('Black Cleaver "Dealing {{as|physical damage}} grants you movement speed" deals none', () => {
    const row = classifyEffect(
      item(
        'Black Cleaver',
        'pass2',
        "Dealing {{as|physical damage}} grants you {{as|{{rd|20|10}} '''bonus''' movement speed}} for 2 seconds.",
      ),
    );
    expect(row.damage).toBe('none');
  });

  it('Armored Advance\'s "shield that absorbs … {{as|physical damage}}" deals none', () => {
    const row = classifyEffect(
      item(
        'Armored Advance',
        'pass2',
        'Taking {{as|physical damage}} from champions grants you a {{tip|shield}} that absorbs ' +
          "{{pp|100 to 200|color=pd}} {{as|(+ 8% '''bonus''' health)}} {{as|physical damage}} for 5 seconds.",
      ),
    );
    expect(row.damage).toBe('none');
  });

  // A sentence can heal AND deal. Testing the sentence flatly lost four real instances.
  it('Redemption heals allies and deals true damage in ONE sentence — the damage is kept', () => {
    const row = classifyEffect(
      item(
        'Redemption',
        'act',
        'Allies within the area are {{tip|heal|healed}} for {{pp|150 to 350|type=target\'s level|color=heal}}, ' +
          "while enemy champions within take {{as|10% of target's '''maximum''' health}} as {{as|true damage}}.",
      ),
    );
    expect(row.damage).toBe('instance');
    expect(row.reach).toBe('R2'); // joined by the bounded connective "as"
  });

  // Found by auditing this census's own output: excluding "critical strike" as non-damage
  // deleted Essence Reaver, whose RATIO mentions crit chance while its payload is damage.
  it('Essence Reaver\'s crit-chance ratio does not hide its physical damage', () => {
    const row = classifyEffect(
      item(
        'Essence Reaver',
        'pass',
        "your next basic attack within 10 seconds deals {{as|125% '''base''' AD}} " +
          '{{as|(+ {{pp|0 to 50|0 to 100 for 11|label1=critical strike chance}} based on critical strike chance)}} ' +
          "{{as|'''bonus''' physical damage}} [[on-hit]]",
      ),
    );
    expect(row.damage).toBe('instance');
  });

  it('Abyssal Mask\'s "12% increased magic damage" is an amplifier, not an instance', () => {
    const row = classifyEffect(
      item(
        'Abyssal Mask',
        'pass',
        'Enemy champions within 700 units of you become cursed, causing them to receive ' +
          '{{as|12% increased magic damage|magic damage}} from all sources.',
      ),
    );
    expect(row.damage).toBe('none');
  });

  it('Blade of the Ruined King is a CANDIDATE: "equal to" is broken by an [[on-hit]] link', () => {
    const row = classifyEffect(
      item(
        'Blade of The Ruined King',
        'pass',
        "Basic attacks deal {{as|'''bonus''' physical damage}} [[on-hit]] equal to " +
          "{{as|{{rd|9%|6%}} of the target's '''current''' health}}",
      ),
    );
    expect(row.damage).toBe('candidate');
    expect(row.reach).toBe('H1');
  });
});

// ---------------------------------------------------------------------------

describe('owner-bearing stat references (DATA-SOURCES §16)', () => {
  // §16's own worked example, quoted there to show why an unowned armor figure must NOT be
  // defaulted to the caster: this one is the TARGET's armor.
  it('Black Cleaver "Each stack inflicts {{as|6% armor reduction}}" names nobody', () => {
    const refs = findOwnerRefs(
      item(
        'Black Cleaver',
        'pass',
        "Dealing {{as|physical damage}} to an enemy champion applies a stack of ''Carve'' for 6 " +
          'seconds, stacking up to 5 times. Each stack inflicts {{as|6% armor reduction}}, up to ' +
          '{{as|30%|armor}} at 5 stacks.',
      ),
    );
    const armor = refs.filter((r) => r.stat === 'armor');
    expect(armor.length).toBeGreaterThanOrEqual(1);
    expect(armor.every((r) => r.owner === 'unstated')).toBe(true);
  });

  it("Liandry's states the owner: \"1% of the target's maximum health\"", () => {
    const refs = findOwnerRefs(
      item(
        "Liandry's Torment",
        'pass',
        "causing them to take {{as|1% of the target's '''maximum''' health}} {{as|magic damage}} every 0.5 seconds",
      ),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.stat).toBe('maxHP');
    expect(refs[0]!.owner).toBe('opponent');
    expect(refs[0]!.evidence).toBe('possessive');
  });

  // §16 records that Sunfire and Heartsteel scale off the HOLDER. The point of the entry is
  // that the source text does not SAY so — which is exactly what this asserts.
  it('Sunfire Aegis "(+ 1.5% bonus health)" names nobody, even though we know who', () => {
    const refs = findOwnerRefs(
      item(
        'Sunfire Aegis',
        'pass',
        "Deal {{as|20 {{as|(+ {{fd|1.5}}% '''bonus''' health)}} magic damage|magic damage}} every second",
      ),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.stat).toBe('bonusHP');
    expect(refs[0]!.owner).toBe('unstated');
  });

  it('"gain +8 Armor" does NOT resolve an owner — it is only recorded that a verb implies one', () => {
    const refs = findOwnerRefs(rune('Conditioning', 'After 12 min gain +8 Armor and +8 Magic Resist.'));
    const armor = refs.find((r) => r.stat === 'armor')!;
    expect(armor.owner).toBe('unstated');
    expect(armor.verbImpliesHolder).toBe(true);
  });

  it('a possessive governing a coordinated pair resolves BOTH halves', () => {
    const refs = findOwnerRefs(rune('Conditioning', 'increase your Armor and Magic Resist by 3%.'));
    expect(refs.find((r) => r.stat === 'armor')!.owner).toBe('holder');
    const mr = refs.find((r) => r.stat === 'magicResist')!;
    expect(mr.owner).toBe('holder');
    expect(mr.evidence).toBe('coordination');
  });

  // Found by auditing this census's own first run: 6 of 98 item references were a compound
  // that names a DIFFERENT stat. The check runs over the whole population, not these items.
  it('"bonus health regeneration" and "armor penetration" are not the ten stats', () => {
    expect(findOwnerRefs(item("Doran's Shield", 'pass', 'gain bonus health regeneration per second'))).toHaveLength(0);
    expect(findOwnerRefs(item('Terminus', 'pass2', 'grant 10% armor penetration'))).toHaveLength(0);
  });

  it('"its maximum health" is ambiguous and stays unstated — World Atlas means a minion', () => {
    const refs = findOwnerRefs(
      item('World Atlas', 'pass2', "Damaging a minion below 30% of its '''maximum''' health"),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.owner).toBe('unstated');
  });

  it('the longest phrasing wins: "bonus health" is never also counted as "health"', () => {
    const refs = findOwnerRefs(item('Riftmaker', 'pass2', "Gain ability power equal to 2% '''bonus''' health."));
    expect(refs.map((r) => r.stat)).toEqual(['bonusHP']);
  });
});

// ---------------------------------------------------------------------------

describe('runes: prose with no wrappers at all', () => {
  it('Electrocute\'s "Damage: 70 - 240 …" labelled line is machine-readable (R1)', () => {
    const row = classifyEffect(
      rune(
        'Electrocute',
        'Hitting a champion with 3 separate attacks or abilities within 3s deals bonus adaptive damage. ' +
          'Damage: 70 - 240 (+0.1 bonus AD, +0.05 AP) damage. Cooldown: 20s',
      ),
    );
    expect(row.damage).toBe('instance');
    expect(row.reach).toBe('R1');
    expect(runeLabelledLines(row.text).map((l) => l.label)).toContain('Damage');
  });

  it('Sudden Impact states its damage in a bare sentence — a person must read it (H1)', () => {
    const row = classifyEffect(
      rune(
        'Sudden Impact',
        'Damaging basic attacks and abilities deal a bonus 20 - 80 True Damage based on level to ' +
          'enemy champions after using a dash. Cooldown: 10s',
      ),
    );
    expect(row.damage).toBe('candidate');
    expect(row.reach).toBe('H1');
  });

  it('Cash Back deals no damage and modifies no stat this engine models', () => {
    const row = classifyEffect(rune('Cash Back', 'Get 7.5% Gold back when you purchase Legendary Items.'));
    expect(row.damage).toBe('none');
    expect(row.inScope).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('conditional versus always-active (SPECIFICATION §5)', () => {
  it("Archangel's Awe is always-active: \"Grants ability power equal to 1% bonus mana\"", () => {
    const row = classifyEffect(
      item("Archangel's Staff", 'pass', "Grants {{as|ability power}} equal to {{as|1% '''bonus''' mana}}."),
    );
    expect(row.conditional).toBe(false);
    expect(row.modifiesDamageRelevantStat).toBe(true);
  });

  it('Sunfire is conditional: it states a trigger and a duration', () => {
    const row = classifyEffect(
      item('Sunfire Aegis', 'pass', 'Taking or dealing damage activates this passive for 3 seconds. Deal {{as|20 magic damage}}.'),
    );
    expect(row.conditional).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('the hand audit of the candidate bucket', () => {
  it('records a quoted reason for every verdict, and no duplicates', () => {
    const keys = CANDIDATE_AUDIT.map((v) => `${v.ownerName}|${v.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const verdict of CANDIDATE_AUDIT) {
      expect(verdict.because.length).toBeGreaterThan(15);
    }
  });

  it('reports an audited entry that has stopped being a candidate, rather than ignoring it', () => {
    const report = reconcileAudit([
      { ownerName: 'Black Cleaver', key: 'pass', damage: 'none' },
      { ownerName: 'Brand New Item', key: 'pass', damage: 'candidate' },
    ]);
    expect(report.notCandidateAnyMore).toContainEqual({
      ownerName: 'Black Cleaver',
      key: 'pass',
      dealsDamage: false,
      because: 'dealing physical damage APPLIES a stack; the effect itself only shreds armor',
      nowIs: 'none',
    });
    expect(report.unaudited).toEqual([{ ownerName: 'Brand New Item', key: 'pass' }]);
  });
});

describe('the population: what the census is measured over', () => {
  it('joins the item pool to the wiki module by numeric id, and reports misses', () => {
    const module = parseLuaModule(`return {
      ["Black Cleaver"] = { ["id"] = 3071, ["effects"] = {
        ["pass"] = { ["name"] = "Carve", ["description"] = "Each stack inflicts {{as|6% armor reduction}}." },
        ["pass2"] = { ["name"] = "Fervor", ["description"] = "Dealing {{as|physical damage}} grants you speed." },
      } },
      ["Long Sword"] = { ["id"] = 1036 },
    }`);
    const join = buildItemEffectRecords(
      [
        { id: 3071, name: 'Black Cleaver' },
        { id: 1036, name: 'Long Sword' },
        { id: 9999, name: 'Not In The Wiki' },
      ],
      module,
    );
    expect(join.matched).toBe(2);
    expect(join.unmatched).toEqual([{ id: 9999, name: 'Not In The Wiki' }]);
    expect(join.withoutEffects.map((i) => i.name)).toEqual(['Long Sword']);
    expect(join.records).toHaveLength(2);
    expect(join.records.map((r) => r.key).sort()).toEqual(['pass', 'pass2']);
  });

  it('joins description2 onto the same effect rather than counting it as another one', () => {
    const module = parseLuaModule(`return {
      ["Black Cleaver"] = { ["id"] = 3071, ["effects"] = { ["pass"] = {
        ["description"] = "Each stack inflicts {{as|6% armor reduction}}.",
        ["description2"] = "Non-basic damage may apply stacks only once per frame." } } },
    }`);
    const join = buildItemEffectRecords([{ id: 3071, name: 'Black Cleaver' }], module);
    expect(join.records).toHaveLength(1);
    expect(join.records[0]!.text).toContain('once per frame');
  });

  it('builds one record per rune from longDesc, not shortDesc', () => {
    const records = buildRuneEffectRecords([
      {
        key: 'Domination',
        slots: [{ runes: [{ id: 8112, name: 'Electrocute', shortDesc: 'short', longDesc: 'Damage: <b>70 - 240</b>' }] }],
      },
    ]);
    expect(records).toEqual([
      {
        source: 'rune',
        ownerName: 'Electrocute',
        id: 8112,
        key: 'rune',
        effectName: 'Domination',
        text: 'Damage: 70 - 240',
      },
    ]);
  });

  it('summarise counts every effect exactly once across the verdicts', () => {
    const rows = [
      classifyEffect(item('A', 'pass', 'Deal {{as|15 magic damage}}.')),
      classifyEffect(item('B', 'pass', 'Gain 25% [[slow resist]].')),
    ];
    const totals = summarise(rows);
    expect(totals.effects).toBe(2);
    expect(totals.conditional + totals.alwaysActive).toBe(2);
    expect(totals.inScope + totals.outOfScope).toBe(2);
    expect(totals.reach.R1 + totals.reach.R2 + totals.reach.H1 + totals.reach.H2).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Assertions against the generated file, when a census has been run. These are the numbers
// quoted in the report; if a future patch moves one, this fails and names it rather than
// letting the report go stale silently.

const CENSUS_PATH = join(HERE, '..', '..', 'public', 'data', 'effect-census.json');

function loadCensus(): any | null {
  try {
    return JSON.parse(readFileSync(CENSUS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

describe('the generated census (public/data/effect-census.json)', () => {
  const census = loadCensus();

  it('exists, and records its provenance', () => {
    if (!census) return expect.unreachable('run `node scripts/fetch/census.ts` first');
    expect(census.provenance.patch).toMatch(/^\d+\.\d+\.\d+$/);
    expect(census.provenance.urls.itemEffects).toContain('wiki.leagueoflegends.com/en-us');
    expect(census.provenance.fetched).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('measures the 209-item pool of DATA-SOURCES §5, not the broken filter\'s 222', () => {
    if (!census) return expect.unreachable('run the census first');
    expect(census.join.poolItems).toBe(209);
    expect(census.itemFilterStages.distinctNamesBeforeIdCutoff).toBe(222);
    expect(census.itemFilterStages.afterNameDedup).toBe(209);
  });

  it('every pool item is found in the wiki module — no effect text is silently missing', () => {
    if (!census) return expect.unreachable('run the census first');
    expect(census.join.unmatched).toEqual([]);
    expect(census.join.matchedInWikiModule).toBe(209);
  });

  it('the totals are internally consistent with the per-effect rows', () => {
    if (!census) return expect.unreachable('run the census first');
    const rows = census.effects;
    expect(rows).toHaveLength(census.totals.all.effects);
    expect(rows.filter((r: any) => r.damage === 'instance')).toHaveLength(
      census.totals.all.damageInstances,
    );
    expect(census.totals.all.inScope + census.totals.all.outOfScope).toBe(rows.length);
    expect(census.totals.items.effects + census.totals.runes.effects).toBe(rows.length);
  });

  it('every candidate has been read by a person, and no audit verdict has drifted', () => {
    if (!census) return expect.unreachable('run the census first');
    const audit = reconcileAudit(census.effects);
    expect(audit.unaudited).toEqual([]);
    expect(audit.notCandidateAnyMore).toEqual([]);
    expect(audit.audited).toBe(census.totals.all.damageCandidates);
  });

  it('reproduces DATA-SOURCES §16 exactly on the two examples it names', () => {
    if (!census) return expect.unreachable('run the census first');
    const find = (name: string, key: string) =>
      census.effects.find((r: any) => r.ownerName === name && r.key === key);
    const liandry = find("Liandry's Torment", 'pass');
    expect(liandry.ownerRefs.some((r: any) => r.stat === 'maxHP' && r.owner === 'opponent')).toBe(true);
    const cleaver = find('Black Cleaver', 'pass');
    expect(cleaver.ownerRefs.some((r: any) => r.stat === 'armor' && r.owner === 'unstated')).toBe(true);
  });
});
