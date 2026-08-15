// KNOWN-ANSWER TESTS FOR THE RANK-AXIS READER.
//
// Two kinds of test live here and they check different things:
//
//   * Fixed strings taken verbatim from the wiki, where the right answer is known by reading the
//     page. These fail if the reader's rule changes.
//   * Roster-wide counts run over the real 937-page cache. These fail if the SOURCE changes, which
//     is the point: a population quoted in a comment ages silently, and one asserted in a test
//     does not. When one of these fails, re-read the pages before touching the reader.
//
// The cache (`build/proposed-curated/ability-wikitext.json`) belongs to another area and is read
// here, never written.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifySlot,
  maxedBuildCost,
  readProseRankStatement,
  readRankAxisStatement,
  readRankShape,
  readStatedRankCounts,
  SKILL_POINTS_AT_18,
  type AbilityPage,
} from './rank-shape.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Champion {
  name: string;
  abilityMaxRanks: Record<string, number>;
}

const pages: AbilityPage[] = JSON.parse(
  readFileSync(join(ROOT, 'build', 'proposed-curated', 'ability-wikitext.json'), 'utf8'),
).pages;
const champions: Champion[] = JSON.parse(
  readFileSync(join(ROOT, 'public', 'data', 'champions.json'), 'utf8'),
);
const championByName = new Map(champions.map((c) => [c.name, c]));

function page(champion: string, abilityName: string): AbilityPage {
  const found = pages.find((p) => p.champion === champion && p.abilityName === abilityName);
  if (!found) throw new Error(`no cached page for ${champion} ${abilityName}`);
  return found;
}

/** The same wiring the index uses: slot maxrank from Data Dragon, followed counts by name. */
function shapeOf(champion: string, abilityName: string) {
  const p = page(champion, abilityName);
  const c = championByName.get(champion);
  const slotMax = c ? (c.abilityMaxRanks[p.slot] ?? null) : null;
  return readRankShape(p, slotMax, (name) => {
    const target = pages.find((q) => q.champion === champion && q.abilityName === name);
    if (!target || !c) return null;
    return c.abilityMaxRanks[target.slot] ?? null;
  });
}

describe('reading a rank count out of an {{ap|…}} body', () => {
  it('the Lux Q regression: an ordinary X to Y states NO rank count', () => {
    // This is the defect that was in the file: `80 to 240` read as "240 ranks". It fired on 708
    // of the 937 pages.
    expect(readStatedRankCounts('{{st|Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}}}')).toEqual(
      [],
    );
    expect(readStatedRankCounts('{{ap|50 to 170}}')).toEqual([]);
  });

  it('a trailing integer AFTER the end value is a rank count (Nidalee Takedown)', () => {
    expect(readStatedRankCounts('{{ap|5 to 80 4}}')).toEqual([4]);
  });

  it('reads the LAST "to" when spans are nested (Nidalee Takedown, maximum damage)', () => {
    expect(readStatedRankCounts('{{ap|(5 to 80)*(1+(1 to 1.75)) 4}}')).toEqual([4]);
  });

  it('reads through arithmetic in the end value (Karma Soulflare)', () => {
    expect(readStatedRankCounts('{{ap|40+40 to 220+310 4}}')).toEqual([4]);
  });

  it('reads a count followed by a further template argument (Zilean Time Warp)', () => {
    expect(readStatedRankCounts('{{ap|40 to 85 4|99}}')).toEqual([4]);
  });

  it('an explicit per-rank list states no count (Kayle R, Anivia W)', () => {
    expect(readStatedRankCounts('{{ap|675|675|775}}')).toEqual([]);
    expect(readStatedRankCounts('{{ap|133.33|125|120|116.67|114.29}}')).toEqual([]);
  });

  it('a page stating two counts returns both, sorted, never one of them', () => {
    expect(readStatedRankCounts(page('Karma', 'Soulflare').wikitext)).toEqual([4, 5]);
  });

  it('ROSTER-WIDE: 27 of the 937 pages state a rank count', () => {
    const stating = pages.filter((p) => readStatedRankCounts(p.wikitext).length > 0);
    expect(stating.length).toBe(27);
  });

  it('ROSTER-WIDE: 9 of those 27 state a count Data Dragon does not, and they are these 9', () => {
    const disagreeing = pages
      .filter((p) => {
        const counts = readStatedRankCounts(p.wikitext);
        if (counts.length === 0) return false;
        const slotMax = championByName.get(p.champion)?.abilityMaxRanks[p.slot] ?? null;
        return counts.some((n) => n !== slotMax);
      })
      .map((p) => `${p.champion}/${p.slot} ${p.abilityName}`)
      .sort();
    expect(disagreeing).toEqual([
      'Aphelios/P The Hitman and the Seer',
      'Aurelion Sol/Q Breath of Light',
      'Heimerdinger/E CH-3X Lightning Grenade',
      'Karma/Q Soulflare',
      'Karma/W Renewal',
      'Nidalee/E Swipe',
      'Nidalee/Q Takedown',
      'Nidalee/W Pounce',
      'Zilean/E Time Warp',
    ]);
  });
});

describe('reading the rank-axis sentence', () => {
  it('Nidalee Takedown names its axis and the champion it belongs to', () => {
    const statement = readRankAxisStatement(page('Nidalee', 'Takedown').wikitext);
    expect(statement?.followsAbility).toBe('Aspect of the Cougar');
    expect(statement?.championNamed).toBe('Nidalee');
  });

  it('ROSTER-WIDE: exactly 9 pages state one, and they are these 9', () => {
    const stating = pages
      .filter((p) => readRankAxisStatement(p.wikitext))
      .map((p) => `${p.champion}/${p.slot} -> ${readRankAxisStatement(p.wikitext)!.followsAbility}`)
      .sort();
    expect(stating).toEqual([
      'Heimerdinger/E -> UPGRADE!!!',
      'Heimerdinger/Q -> UPGRADE!!!',
      'Heimerdinger/W -> UPGRADE!!!',
      'Karma/E -> Mantra',
      'Karma/Q -> Mantra',
      'Karma/W -> Mantra',
      'Nidalee/E -> Aspect of the Cougar',
      'Nidalee/Q -> Aspect of the Cougar',
      'Nidalee/W -> Aspect of the Cougar',
    ]);
  });

  it('the near-misses stay refused: five pages say "scales with … rank" about something else', () => {
    // Each was read on 2026-08-15. None is a statement about its own page's rank axis: Yunara's R
    // says two OTHER abilities follow IT, Varus R describes a per-stack term, Kled R is about
    // range, Sylas R is a note about other champions, Blitzcrank P is about mana.
    for (const [champion, ability] of [
      ['Yunara', "Transcend One's Self"],
      ['Varus', 'Chain of Corruption'],
      ['Kled', 'Chaaaaaaaarge!!!'],
      ['Sylas', 'Hijack'],
      ['Blitzcrank', 'Mana Barrier'],
    ] as const) {
      expect(readRankAxisStatement(page(champion, ability).wikitext)).toBeNull();
    }
  });
});

describe('reading rank prose', () => {
  it('Elise states her ultimate\'s count and its unlock levels', () => {
    const prose = readProseRankStatement(page('Elise', 'Spider Form').wikitext);
    expect(prose.statedCount).toBe(4);
    expect(prose.statedLevels).toEqual([6, 11, 16]);
    expect(prose.beginsWithOneRank).toBe(true);
  });

  it('Jayce states that Transform cannot be ranked', () => {
    const prose = readProseRankStatement(page('Jayce', 'Transform Mercury Cannon').wikitext);
    expect(prose.cannotBeRanked).toBe(true);
    expect(prose.beginsWithOneRank).toBe(true);
  });

  it('an ordinary ability states nothing', () => {
    const prose = readProseRankStatement(page('Lux', 'Light Binding').wikitext);
    expect(prose.statedCount).toBeUndefined();
    expect(prose.statedLevels).toBeUndefined();
    expect(prose.cannotBeRanked).toBeUndefined();
  });
});

describe('deciding what may be stored', () => {
  it('Nidalee Takedown is put on Aspect of the Cougar\'s FOUR ranks, not the Q slot\'s five', () => {
    const finding = shapeOf('Nidalee', 'Takedown');
    expect(finding.axis).toMatchObject({ kind: 'follows', ability: 'Aspect of the Cougar', ranks: 4 });
    expect(finding.slotMaxRank).toBe(5);
  });

  it('Javelin Toss, in the same slot, keeps five', () => {
    const finding = shapeOf('Nidalee', 'Javelin Toss');
    expect(finding.axis).toMatchObject({ kind: 'own', ranks: 5 });
  });

  it('THE AURELION SOL TRAP: a lone display expression does not demote a five-rank ability', () => {
    const finding = shapeOf('Aurelion Sol', 'Breath of Light');
    expect(finding.statedCounts).toEqual([4]);
    expect(finding.axis).toMatchObject({ kind: 'own', ranks: 5 });
    expect(finding.reports.join(' ')).toContain('nothing corroborates the difference');
  });

  it('THE ZILEAN TRAP: a span covering four of five ranks does not become the rank count', () => {
    const finding = shapeOf('Zilean', 'Time Warp');
    expect(finding.statedCounts).toEqual([4]);
    expect(finding.axis).toMatchObject({ kind: 'own', ranks: 5 });
    expect(finding.reports).toHaveLength(1);
  });

  it('Aphelios\'s passive states 6 and gets nothing: there is no slot count to check it against', () => {
    const finding = shapeOf('Aphelios', 'The Hitman and the Seer');
    expect(finding.statedCounts).toEqual([6]);
    expect(finding.axis.kind).toBe('unstated');
    expect(finding.reports.join(' ')).toContain('nothing to corroborate it against');
  });

  it('Karma Soulflare: the four is taken, the five is reported, and neither is silent', () => {
    const finding = shapeOf('Karma', 'Soulflare');
    expect(finding.axis).toMatchObject({ kind: 'follows', ability: 'Mantra', ranks: 4 });
    expect(finding.reports.join(' ')).toContain('mixes rank axes');
  });

  it('Jayce Transform: one rank, unlocked at level 1', () => {
    const finding = shapeOf('Jayce', 'Transform Mercury Cannon');
    expect(finding.axis).toMatchObject({ kind: 'own', ranks: 1 });
    expect(finding.unlockLevels).toEqual([1]);
  });

  it('Elise and Nidalee state the ultimate schedule the engine\'s default gets wrong', () => {
    expect(shapeOf('Elise', 'Spider Form').unlockLevels).toEqual([1, 6, 11, 16]);
    expect(shapeOf('Nidalee', 'Aspect of the Cougar').unlockLevels).toEqual([1, 6, 11, 16]);
  });

  it('ROSTER-WIDE: only 4 pages produce a report, and no report ever changed a value', () => {
    const reported = pages
      .map((p) => {
        const c = championByName.get(p.champion);
        const slotMax = c ? (c.abilityMaxRanks[p.slot] ?? null) : null;
        return readRankShape(p, slotMax, (name) => {
          const t = pages.find((q) => q.champion === p.champion && q.abilityName === name);
          return t && c ? (c.abilityMaxRanks[t.slot] ?? null) : null;
        });
      })
      .filter((f) => f.reports.length > 0)
      .map((f) => `${f.champion}/${f.slot} ${f.abilityName}`)
      .sort();
    expect(reported).toEqual([
      'Aphelios/P The Hitman and the Seer',
      'Aurelion Sol/Q Breath of Light',
      'Karma/Q Soulflare',
      'Zilean/E Time Warp',
    ]);
  });
});

describe('slot shape', () => {
  it('one ability is a single slot', () => {
    expect(classifySlot([shapeOf('Lux', 'Light Binding')])).toEqual({ kind: 'single' });
  });

  it('Elise\'s Q holds two abilities on the same rank axis and is not called a form', () => {
    const shape = classifySlot([
      shapeOf('Elise', 'Neurotoxin'),
      shapeOf('Elise', 'Venomous Bite'),
    ]);
    expect(shape.kind).toBe('several-own-rank');
  });

  it('Nidalee\'s Q holds two abilities on DIFFERENT rank axes', () => {
    const shape = classifySlot([shapeOf('Nidalee', 'Javelin Toss'), shapeOf('Nidalee', 'Takedown')]);
    expect(shape).toMatchObject({ kind: 'mixed-rank-axis', followers: ['Takedown'] });
  });
});

describe('the skill-point ceiling', () => {
  it('exactly seven champions have slot maxima above 18, and they are these seven', () => {
    const over = champions
      .filter((c) => maxedBuildCost(c.abilityMaxRanks) > SKILL_POINTS_AT_18)
      .map((c) => `${c.name} ${maxedBuildCost(c.abilityMaxRanks)}`)
      .sort();
    expect(over).toEqual([
      'Aphelios 21',
      'Elise 19',
      'Jayce 19',
      'Karma 19',
      'Nidalee 19',
      'Udyr 24',
      'Yuumi 19',
    ]);
  });

  it('an ordinary champion costs exactly 18', () => {
    expect(maxedBuildCost(championByName.get('Lux')!.abilityMaxRanks)).toBe(18);
  });
});
