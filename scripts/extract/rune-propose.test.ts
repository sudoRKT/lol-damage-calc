// Known-answer tests for the rune drafts.
//
// Every number below is quoted from one of the two sources in the test that uses it. The tests
// that matter most are the NEGATIVE ones: a cross-check that cannot be shown to fail is not a
// cross-check, and a rule that stores an unattributed owner would be the exact failure the owner
// rule exists to prevent.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Scaling } from '../../src/types/data.ts';
import { checkEffectComponents } from '../../src/types/validate-curated.ts';
import { proposeAll, proposeRune, ratioFrom, valueAtLevel } from './rune-propose.ts';
import { CONTRACT_GAPS, RUNE_READINGS, type RuneReading } from './runes-read.ts';

const byName = (name: string): RuneReading => RUNE_READINGS.find((r) => r.runeName === name)!;

describe('the reading is anchored to the source that was actually fetched', () => {
  const cache = JSON.parse(
    readFileSync('build/proposed-curated/rune-source-cache.json', 'utf8'),
  ) as {
    patch: string;
    runes: Array<{
      name: string;
      ddragon: { id: number; tree: string; longDesc: string } | null;
      wiki: { revid: number | null; wikitext: string | null } | null;
    }>;
  };

  it('every rune read is a rune fetched, at the same patch, from the same revision', () => {
    const problems: string[] = [];
    for (const reading of RUNE_READINGS) {
      const fetched = cache.runes.find((r) => r.name === reading.runeName);
      if (!fetched?.ddragon || !fetched.wiki?.wikitext) {
        problems.push(`${reading.runeName}: not in the fetched cache`);
        continue;
      }
      if (fetched.ddragon.id !== reading.runeId) {
        problems.push(`${reading.runeName}: id ${reading.runeId} but Data Dragon says ${fetched.ddragon.id}`);
      }
      if (fetched.ddragon.tree !== reading.tree) {
        problems.push(`${reading.runeName}: tree ${reading.tree} but Data Dragon says ${fetched.ddragon.tree}`);
      }
      if (fetched.wiki.revid !== reading.wikiRevid) {
        problems.push(
          `${reading.runeName}: read from revision ${reading.wikiRevid}, cache holds ${fetched.wiki.revid}`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("every stored value expression appears verbatim in the wiki's own text", () => {
    // The reading may not paraphrase a formula. If this goes red the reading has drifted from
    // the source, which is the failure a quoted reading exists to make visible.
    const problems: string[] = [];
    for (const reading of RUNE_READINGS) {
      const expression = reading.damage?.wikiExpression;
      if (!expression) continue;
      const wikitext = cache.runes.find((r) => r.name === reading.runeName)!.wiki!.wikitext!;
      if (!wikitext.includes(expression)) {
        problems.push(`${reading.runeName}: "${expression}" is not in the wiki template`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('a value is stored only where both producers agree', () => {
  it('stores Scorch — the cleanest case, agreed end to end', () => {
    // Wiki: {{pp|20 + (40-20)/17*(x-1)|1 to 20 by 1}}. Data Dragon: "20 - 40 ... based on level".
    const { rune, outcome } = proposeRune(byName('Scorch'));
    expect(rune.verification).toBe('derived');
    expect(outcome.crossCheck).toEqual({
      machineFromWiki: { atLevel1: 20, atLevel18: 40 },
      personFromDataDragon: { atLevel1: 20, atLevel18: 40 },
      agree: true,
    });
    expect(rune.components).toHaveLength(1);
    expect(rune.components![0].damageType).toBe('magic');
    expect(rune.components![0].base).toEqual({
      scaling: 'byLevel',
      from: 20,
      to: 40,
      atLevels: [1, 18],
      steps: 18,
    });
    expect(rune.components![0].ratios).toEqual([]);
  });

  it('REFUSES a rune whose two sources disagree on an endpoint, storing neither', () => {
    // The negative control. Scorch's own reading with Data Dragon's top endpoint moved to the
    // level-20 extrapolation (42.35) — which is the shape of DATA-SOURCES §13's real trap.
    const drifted: RuneReading = {
      ...byName('Scorch'),
      damage: { ...byName('Scorch').damage!, ddragonEndpoints: { atLevel1: 20, atLevel18: 42.35 } },
    };
    const { rune, outcome } = proposeRune(drifted);
    expect(outcome.stored).toBe(false);
    expect(outcome.crossCheck!.agree).toBe(false);
    expect(rune.verification).toBe('incomplete');
    expect(rune.components).toBeUndefined();
    expect(rune.notes).toContain('Neither is adopted');
  });

  it('reads the level-18 value, not the level-20 one the wiki axis would render', () => {
    // Every one of these four writes its axis as "1 to 20 by 1". If the axis were followed,
    // Cheap Shot would read 10 + 35/17*19 = 49.1 at level 20 rather than 45 at level 18.
    const { outcome } = proposeRune(byName('Cheap Shot'));
    expect(outcome.crossCheck!.machineFromWiki.atLevel18).toBe(45);
    expect(outcome.crossCheck!.personFromDataDragon.atLevel18).toBe(45);
  });

  it('drops the two steps above level 18 that Hail of Blades\' "for 20" generates', () => {
    // {{pp|2 + (20-2)/17*(x-1) for 20}} generates twenty values; champions have eighteen levels.
    const { rune } = proposeRune(byName('Hail of Blades'));
    expect(rune.components![0].base).toEqual({
      scaling: 'byLevel',
      from: 2,
      to: 20,
      atLevels: [1, 18],
      steps: 18,
    });
  });
});

describe('the owner rule, on text that names no champion', () => {
  it("stores 'holder' where the source says \"your\" — and holder is not caster", () => {
    // "3.5% of your maximum health". The rune reads the health of whoever runs it, which is the
    // defender when the defender runs it (SPECIFICATION §5).
    const { rune } = proposeRune(byName('Grasp of the Undying'));
    const ratio = rune.components![0].ratios[0]!;
    expect(ratio.stat).toBe('maxHP');
    expect(ratio.owner).toBe('holder');
    expect(ratio.owner).not.toBe('caster');
  });

  it('keeps the melee and ranged figures apart rather than collapsing them', () => {
    // Wiki: {{rd|3.5%|1.4%}}. Data Dragon: 3.5% with "Ranged Champions: ... 40% effective",
    // and 3.5 x 0.4 = 1.4. Storing one number would understate every champion of the other type.
    const { rune } = proposeRune(byName('Grasp of the Undying'));
    expect(rune.components![0].ratios[0]).toEqual({
      stat: 'maxHP',
      owner: 'holder',
      scaling: 'byRangeType',
      melee: { scaling: 'linear', from: 3.5, to: 3.5 },
      ranged: { scaling: 'linear', from: 1.4, to: 1.4 },
    });
  });

  it('leaves an unattributed health pool as unresolved rather than assuming the holder', () => {
    // The negative control for the owner rule. Rune text usually says "your"; where it does not,
    // nothing may supply it. This proves the shape carries the refusal rather than a default.
    expect(ratioFrom({ stat: 'maxHP', owner: 'unresolved', percent: 3, quoted: 'of maximum health' })).toEqual(
      { stat: 'maxHP', owner: 'unresolved', scaling: 'linear', from: 3, to: 3 },
    );
  });

  it('states no owner on a stat only one champion can have', () => {
    // bonus AD and AP are the holder's by definition, and gate 1 does not ask for an owner on
    // them. Writing one would imply a choice exists.
    const { rune } = proposeRune(byName('Hail of Blades'));
    expect(rune.components![0].ratios.map((r) => [r.stat, r.owner])).toEqual([
      ['bonusAD', undefined],
      ['AP', undefined],
    ]);
  });
});

describe('nothing claims better than its evidence', () => {
  it('holds Hail of Blades at incomplete because the sources disagree on the attack limit', () => {
    // Both sources give the same damage PER ATTACK and a different number of attacks: Data
    // Dragon "up to 3 attacks ... resets increase the limit by 1", the wiki "2 stacks ... up to
    // 2 times" plus the triggering attack. The figure is stored; the entry may not claim derived.
    const { rune, outcome } = proposeRune(byName('Hail of Blades'));
    expect(outcome.crossCheck!.agree).toBe(true);
    expect(outcome.stored).toBe(true);
    expect(rune.verification).toBe('incomplete');
    expect(rune.notes).toContain('CONTESTED');
    expect(rune.notes).toContain('up to 3 attacks');
    expect(rune.notes).toContain('2 stacks');
  });

  it('never stores a hit count for a contested one', () => {
    // Storing "3" or "4" would be an aggregate error in a new place — one instance carrying
    // several attacks' damage, which is exactly what DATA-SOURCES §60 was about.
    const { rune } = proposeRune(byName('Hail of Blades'));
    expect(rune.components![0].hits).toBeUndefined();
    expect(rune.components![0].variableHits).toBeUndefined();
  });

  it('marks Bone Plating incomplete and stores no component for it', () => {
    // It reduces damage received. CuratedRune holds damage dealt, flat stat grants and stack
    // yields. Storing it in any of those would say something the source does not.
    const { rune, outcome } = proposeRune(byName('Bone Plating'));
    expect(rune.verification).toBe('incomplete');
    expect(rune.components).toBeUndefined();
    expect(outcome.stored).toBe(false);
    expect(rune.notes).toContain('does not deal damage');
  });

  it('marks nothing verified', () => {
    const { runes } = proposeAll();
    expect(runes.filter((r) => r.verification === 'verified')).toEqual([]);
  });

  it('names every fact it declined to store, on every rune', () => {
    // A silent omission is the failure mode this file exists to avoid: a rune that heals, grants
    // resistances or only fires on a condition must say so even though it cannot store it.
    for (const reading of RUNE_READINGS) {
      expect(reading.notStored.length).toBeGreaterThan(0);
      const { rune } = proposeRune(reading);
      expect(rune.notes).toContain('NOT STORED');
    }
  });
});

describe("gate 1 — the lead's own checker, over these runes", () => {
  it('passes every proposed rune', () => {
    const { runes } = proposeAll();
    expect(checkEffectComponents(runes)).toEqual([]);
  });

  it('would fail a rune missing an owner on a health pool — proved, not assumed', () => {
    // The negative control for gate 1's reach. gateSchema walks abilities and defensive entries
    // only (DATA-SOURCES §51), so if this checker were not run over runes by hand, an
    // unattributed health pool would enter a curated file unexamined.
    const findings = checkEffectComponents([
      {
        runeId: 999999,
        runeName: 'Fixture',
        tree: 'Resolve',
        components: [
          {
            id: 'bonus-damage',
            damageType: 'magic',
            base: { scaling: 'linear', from: 0, to: 0 },
            ratios: [{ stat: 'maxHP', scaling: 'linear', from: 3, to: 3 }],
          },
        ],
        verification: 'derived',
        provenance: { source: 'test fixture', patch: '16.16.1' },
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("requires an 'owner'");
  });
});

describe('what the contract cannot hold is raised, not filled in', () => {
  it('names the blocked rune, the fact, and the shape that already exists elsewhere', () => {
    expect(CONTRACT_GAPS.length).toBeGreaterThan(0);
    for (const gap of CONTRACT_GAPS) {
      expect(gap.blocks).not.toBe('');
      expect(gap.fact).not.toBe('');
      expect(gap.whatExistsAlready).not.toBe('');
      expect(gap.ifNotAdded).not.toBe('');
    }
    expect(CONTRACT_GAPS.some((g) => g.blocks.includes('Bone Plating'))).toBe(true);
  });
});

describe('valueAtLevel refuses what it cannot answer', () => {
  it('reads a byLevel value at both ends and in the middle', () => {
    const s: Scaling = { scaling: 'byLevel', from: 20, to: 40, atLevels: [1, 18], steps: 18 };
    expect(valueAtLevel(s, 1)).toBe(20);
    expect(valueAtLevel(s, 18)).toBe(40);
    // Level 18 is the top. A level-20 read must not extrapolate past it (DATA-SOURCES §13).
    expect(valueAtLevel(s, 20)).toBe(40);
  });

  it('throws rather than picking a range type', () => {
    expect(() =>
      valueAtLevel(
        {
          scaling: 'byRangeType',
          melee: { scaling: 'linear', from: 3.5, to: 3.5 },
          ranged: { scaling: 'linear', from: 1.4, to: 1.4 },
        },
        18,
      ),
    ).toThrow(/range type/);
  });
});
