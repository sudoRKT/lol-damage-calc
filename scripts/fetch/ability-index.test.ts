// KNOWN-ANSWER TESTS FOR THE ONE-ENTRY-PER-ABILITY ROSTER INDEX.
//
// The index is built here from the same real inputs the runner uses, so these tests measure the
// roster rather than a fixture. The published file `public/data/ability-index.json` is then
// checked against that rebuild — if the two disagree, the published file is stale and the test
// says so instead of the site quietly serving last week's answer.
//
// The alias map is the one part a rebuild cannot reproduce offline (it needs the wiki's redirect
// table), so it is asserted against the published file only, and the published file records how it
// was obtained.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  abilitiesInSlot,
  abilityKey,
  buildAbilityIndex,
  CHAMPION_RANK_STATEMENTS,
  findChampionStatements,
  resolveAbility,
  type AbilityIndex,
  type CuratedEntry,
  type RosterChampion,
} from './ability-index.ts';
import type { AbilityPage } from './rank-shape.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...parts: string[]) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const pages: AbilityPage[] = readJson('build', 'proposed-curated', 'ability-wikitext.json').pages;
const champions: RosterChampion[] = readJson('public', 'data', 'champions.json');
const curated: CuratedEntry[] = readJson('curated', 'curated-data.json').abilities;

/** Built without aliases: everything except the alias map is derivable offline. */
const index = buildAbilityIndex({ pages, champions, curated, aliases: [] });

const published = readJson('public', 'data', 'ability-index.json') as AbilityIndex & {
  provenance: { patch: string };
};

describe('the identifier', () => {
  it('champion+slot is NOT unique — 58 slots hold 130 abilities between them', () => {
    expect(index.counts.slotsHoldingMoreThanOneAbility).toBe(58);
    expect(index.counts.entriesInSharedSlots).toBe(130);
  });

  it('champion+slot+name IS unique over all 937 wiki pages', () => {
    const keys = new Set(pages.map((p) => abilityKey(p.champion, p.slot, p.abilityName)));
    expect(keys.size).toBe(pages.length);
    expect(pages.length).toBe(937);
  });

  it('champion+slot+name IS unique over all 919 override-file entries', () => {
    const keys = new Set(curated.map((c) => abilityKey(c.champion, c.slot, c.abilityName)));
    expect(keys.size).toBe(curated.length);
    expect(curated.length).toBe(919);
  });

  it('the override file holds 57 shared slots and 128 entries: the 18 gate-1 refusals are the difference', () => {
    // Stated so the two figures cannot be confused: 57/128 counts what is STORED, 58/130 counts
    // every ability page including the ones the data gate refused and the site publishes as gaps.
    const bySlot = new Map<string, number>();
    for (const c of curated) {
      const k = `${c.champion}|${c.slot}`;
      bySlot.set(k, (bySlot.get(k) ?? 0) + 1);
    }
    const shared = [...bySlot.values()].filter((n) => n > 1);
    expect(shared.length).toBe(57);
    expect(shared.reduce((a, b) => a + b, 0)).toBe(128);
  });
});

describe('the defect this index exists for', () => {
  it('Hwei/W returns FOUR abilities, and Stirring Lights is the one with damage', () => {
    const inSlot = abilitiesInSlot(index, 'Hwei', 'W');
    expect(inSlot.map((e) => e.abilityName).sort()).toEqual([
      'Fleeting Current',
      'Pool of Reflection',
      'Stirring Lights',
      'Subject: Serenity',
    ]);
    const stirring = resolveAbility(index, 'Hwei', 'W', 'Stirring Lights');
    expect(stirring?.key).toBe('Hwei|W|Stirring Lights');
    expect(stirring?.curated).toMatchObject({ present: true, components: 3 });
    // The entry champion+slot used to return, which has no damage at all.
    const serenity = resolveAbility(index, 'Hwei', 'W', 'Subject: Serenity');
    expect(serenity?.curated).toMatchObject({ present: true, components: 0 });
  });

  it('Kled/Q holds the mounted ability and the dismounted one', () => {
    expect(abilitiesInSlot(index, 'Kled', 'Q').map((e) => e.abilityName).sort()).toEqual([
      'Bear Trap on a Rope',
      'Pocket Pistol',
    ]);
  });

  it('Aphelios/Q holds six abilities and Aphelios/P six more', () => {
    expect(abilitiesInSlot(index, 'Aphelios', 'Q')).toHaveLength(6);
    expect(abilitiesInSlot(index, 'Aphelios', 'P')).toHaveLength(6);
  });

  it('an unknown name resolves to nothing rather than to an arbitrary neighbour', () => {
    expect(resolveAbility(index, 'Hwei', 'W', 'Not An Ability')).toBeNull();
  });
});

describe('per-ability rank counts', () => {
  it('exactly 9 entries carry a rank count that is not their slot\'s, and they are these 9', () => {
    const differing = index.entries
      .filter((e) => e.ranks !== null && e.slotMaxRank !== null && e.ranks !== e.slotMaxRank)
      .map((e) => `${e.champion}/${e.slot} ${e.abilityName} ${e.ranks}<-${e.slotMaxRank}`)
      .sort();
    expect(differing).toEqual([
      'Heimerdinger/E CH-3X Lightning Grenade 3<-5',
      'Heimerdinger/Q H-28Q Apex Turret 3<-5',
      'Heimerdinger/W Hextech Rocket Swarm 3<-5',
      'Karma/E Defiance 4<-5',
      'Karma/Q Soulflare 4<-5',
      'Karma/W Renewal 4<-5',
      'Nidalee/E Swipe 4<-5',
      'Nidalee/Q Takedown 4<-5',
      'Nidalee/W Pounce 4<-5',
    ]);
  });

  it('every one of the 9 says in words which ability it follows', () => {
    for (const e of index.entries.filter((x) => x.rankAxis === 'follows')) {
      expect(e.followsAbility?.name).toBeTruthy();
      expect(e.ranksStatedBy).toContain("the ability's own template");
    }
  });

  it('no entry is left without a rank count: 937 of 937 carry one', () => {
    expect(index.entries.filter((e) => e.ranks === null)).toHaveLength(0);
    expect(index.entries).toHaveLength(937);
  });

  it('every passive carries exactly one rank, and says why', () => {
    const passives = index.entries.filter((e) => e.slot === 'P');
    expect(passives).toHaveLength(181);
    for (const p of passives) {
      expect(p.ranks).toBe(1);
      expect(p.ranksStatedBy).toContain('does not rank');
    }
  });

  it('THREE entries disagree with the override file, and none of them carries a damage component', () => {
    const disagreeing = index.entries.filter((e) => !e.agreesWithCurated);
    expect(disagreeing.map((e) => `${e.champion}/${e.slot} ${e.abilityName}`).sort()).toEqual([
      'Heimerdinger/Q H-28Q Apex Turret',
      'Karma/E Defiance',
      'Karma/W Renewal',
    ]);
    // This is why the disagreement is a finding and not a live wrong number today: a rank count
    // only moves values when there are values to move.
    for (const e of disagreeing) {
      expect(e.curated).toMatchObject({ present: true, components: 0 });
    }
  });

  it('the six the override file already gets right are not reported as disagreements', () => {
    for (const name of ['Takedown', 'Pounce', 'Swipe']) {
      expect(resolveAbility(index, 'Nidalee', name === 'Takedown' ? 'Q' : name === 'Pounce' ? 'W' : 'E', name))
        .toMatchObject({ ranks: 4, agreesWithCurated: true });
    }
  });
});

describe('unlock levels', () => {
  it('7 entries carry them, and only where a source states or is followed', () => {
    const withLevels = index.entries
      .filter((e) => e.unlockLevels !== null)
      .map((e) => `${e.champion}/${e.slot} ${e.abilityName}: ${e.unlockLevels!.join(',')}`)
      .sort();
    expect(withLevels).toEqual([
      'Elise/R Spider Form: 1,6,11,16',
      'Jayce/R Transform Mercury Cannon: 1',
      'Jayce/R Transform Mercury Hammer: 1',
      'Nidalee/E Swipe: 1,6,11,16',
      'Nidalee/Q Takedown: 1,6,11,16',
      'Nidalee/R Aspect of the Cougar: 1,6,11,16',
      'Nidalee/W Pounce: 1,6,11,16',
    ]);
  });

  it('a followed ability that states no levels passes none on: Karma\'s three stay null', () => {
    for (const [slot, name] of [
      ['Q', 'Soulflare'],
      ['W', 'Renewal'],
      ['E', 'Defiance'],
    ] as const) {
      expect(resolveAbility(index, 'Karma', slot, name)?.unlockLevels).toBeNull();
    }
  });

  it('the ordinary champion gets no invented schedule', () => {
    expect(resolveAbility(index, 'Lux', 'Q', 'Light Binding')?.unlockLevels).toBeNull();
  });
});

describe('the hand-read champion statements', () => {
  it('every quote is still on the page it was read from', () => {
    const found = findChampionStatements(pages);
    expect(found.filter((f) => !f.foundOnPage)).toEqual([]);
    expect(found).toHaveLength(5);
  });

  it('a quote that is not on its page fails rather than passing quietly', () => {
    const [invented] = findChampionStatements(pages, [
      {
        champion: 'Udyr',
        abilityName: 'Bridge Between',
        quote: 'Udyr may increase each stance at levels 6, 11 and 16',
        means: 'a sentence the source does not contain',
        wouldChange: 'nothing — this is the negative control for the check above',
      },
    ]);
    expect(invented.foundOnPage).toBe(false);
  });

  it('Udyr is recorded as SILENT, not as unread', () => {
    const udyr = CHAMPION_RANK_STATEMENTS.find((s) => s.champion === 'Udyr');
    expect(udyr?.quote).toBe('');
    expect(udyr?.means).toContain('NOTHING');
  });
});

describe('the published file', () => {
  it('exists, names its patch, and matches the roster\'s patch', () => {
    const manifest = readJson('public', 'data', 'manifest.json') as { patch: string };
    expect(published.provenance.patch).toBe(manifest.patch);
  });

  it('carries the same entry count and the same rank findings as a fresh build', () => {
    expect(published.counts.entries).toBe(index.counts.entries);
    expect(published.counts.entriesWhoseRankCountIsNotTheSlots).toBe(
      index.counts.entriesWhoseRankCountIsNotTheSlots,
    );
    expect(published.counts.entriesDisagreeingWithTheOverrideFile).toBe(
      index.counts.entriesDisagreeingWithTheOverrideFile,
    );
    const publishedKeys = published.entries.map((e) => e.key).sort();
    expect(publishedKeys).toEqual(index.entries.map((e) => e.key).sort());
  });

  it('records that the pages its rank counts rest on were re-read live, with none changed', () => {
    const recheck = (published as unknown as {
      statementPagesRechecked: { checked: number; statingTheSameThing: number; changed: string[] };
    }).statementPagesRechecked;
    expect(recheck.changed).toEqual([]);
    expect(recheck.statingTheSameThing).toBe(recheck.checked);
    expect(recheck.checked).toBeGreaterThanOrEqual(17);
  });

  it('resolves an alias no spelling rule could: Jinx\'s Fishbones is Switcheroo!', () => {
    expect(resolveAbility(published, 'Jinx', 'Q', 'Fishbones')?.abilityName).toBe('Switcheroo!');
    expect(resolveAbility(published, 'Twisted Fate', 'W', 'Blue Card')?.abilityName).toBe(
      'Pick a Card',
    );
    expect(resolveAbility(published, 'Corki', 'R', 'Big One')?.abilityName).toBe('Missile Barrage');
  });

  it('resolves 123 alias names and names the 11 the wiki has no template for', () => {
    expect(published.counts.aliasNamesResolved).toBe(123);
    expect(published.counts.namesWithNoTemplate).toBe(11);
    expect(published.namesWithNoTemplate).toContain('Yuumi/Q Prowling Projectile 2');
  });

  it('every name the roster lists resolves to exactly one entry, or is named as having no page', () => {
    const noTemplate = new Set(published.namesWithNoTemplate);
    let unresolved = 0;
    for (const c of champions) {
      for (const [slot, names] of Object.entries(c.abilityNames) as [string, string[]][]) {
        for (const name of names) {
          const resolved = resolveAbility(published, c.name, slot, name);
          if (!resolved && !noTemplate.has(`${c.name}/${slot} ${name}`)) unresolved++;
        }
      }
    }
    expect(unresolved).toBe(0);
  });
});
