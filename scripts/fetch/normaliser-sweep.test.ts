// Known-answer tests for the normaliser sweep.
//
// Every string quoted below was observed on a live source on 2026-08-15: Data Dragon 16.16.1
// (item.json, runesReforged.json) and the wiki item wikitext already stored in
// public/data/effect-census.json.
//
// The suite is organised so that each check is proved able to say NO as well as YES. A detector
// that only ever fires is not a detector — and in this file that matters twice over, because the
// whole finding is that a check which fires when nothing is wrong is how a conflict gets
// manufactured in the first place.

import { describe, expect, it } from 'vitest';

import { classifyEffect } from './effect-census.ts';
import {
  SITES,
  classifySite,
  damageTypeOnlyInMarkup,
  namedArgumentsCarryingMeaning,
  summariseSites,
  type NormaliserSite,
} from './normaliser-sweep.ts';

// --- verbatim source text -------------------------------------------------------------------

/** Data Dragon 16.16.1 runesReforged.json, rune 8369. The type is stated ONLY by the tag. */
const FIRST_STRIKE =
  'Attacks or abilities against an enemy champion within 0.25s of entering champion combat grant ' +
  '<gold>10 gold</gold> and First Strike for 3 seconds, causing you to deal ' +
  '<truedamage>7%</truedamage> extra <truedamage> damage</truedamage> against champions';

/** Data Dragon 16.16.1, rune 9923. "bonus true damage" is inside the tag, so stripping keeps it. */
const HAIL_OF_BLADES =
  'Gain <attackSpeed>110% Attack Speed</attackSpeed> for your first 3 attacks. Deals ' +
  '<trueDamage>bonus true damage</trueDamage> on the third.';

/** Data Dragon 16.16.1, item 6616. The tag is a COLOUR on a stat grant, not a damage type. */
const STAFF_OF_FLOWING_WATER =
  '<mainText><stats>60 Ability Power</stats><br><br><passive>Rapids</passive><br>Healing or ' +
  'Shielding an ally grants you both <magicDamage>40 Ability Power</magicDamage> and ' +
  '<attention>15 Ability Haste</attention> for 6 seconds.</mainText>';

/** Data Dragon 16.16.1, item 3031. Tag and words say the same thing; nothing is lost. */
const INFINITY_EDGE =
  '<mainText><stats>70 Attack Damage</stats><br><br><passive>Infinity</passive><br>Critical ' +
  'strikes deal <physicalDamage>115% physical damage</physicalDamage> instead of 100%.</mainText>';

/** Module:ItemData/data, Kraken Slayer `pass`, as stored in effect-census.json. */
const KRAKEN_SLAYER =
  'At 2 stacks, the next basic attack consumes all stacks to deal {{as|150 to 200 ' +
  "'''bonus''' physical damage|physical damage}} on-hit, increased by {{pp|0 to 75 by 5|0 to 100" +
  "|key=%|color=health|type=target's '''missing''' health|key1=%}}, for up to more.";

/** Module:ItemData/data, Terminus `pass2`. `type=level` names no pool and no owner. */
const TERMINUS =
  "''Light'' hits grant {{pp|6 to 8 for 3|1;11;14|type=level}} {{as|'''bonus''' armor}} and " +
  "{{as|'''bonus''' magic resistance}}.";

/** Module:ItemData/data, Bami's Cinder `pass` — named arguments that are pure formatting. */
const FORMATTING_ONLY =
  'Deals {{as|{{pp|13 to 30|key=%|color=health|icononly=true}} magic damage|magic damage}} per second.';

// ---------------------------------------------------------------------------------------------

describe('normaliser-sweep/the inventory is split, not just counted', () => {
  it('every site carries a verdict derived from its own recorded facts', () => {
    for (const site of SITES) {
      expect(['dangerous', 'watched', 'safe']).toContain(classifySite(site));
    }
  });

  it('a normaliser that removes nothing meaningful is safe whatever it compares against', () => {
    const site: NormaliserSite = {
      ...SITES[0]!,
      removalCanCarryMeaning: false,
      comparison: 'source-vs-source',
      strictComparisonFirst: false,
    };
    expect(classifySite(site)).toBe('safe');
  });

  it('an exact comparison deciding first makes the fold unable to vote', () => {
    const site: NormaliserSite = {
      ...SITES[0]!,
      removalCanCarryMeaning: true,
      strictComparisonFirst: true,
      comparison: 'source-vs-source',
    };
    expect(classifySite(site)).toBe('safe');
  });

  it('meaning-carrying removal between two sources is dangerous, against our own value is watched', () => {
    const base: NormaliserSite = {
      ...SITES[0]!,
      removalCanCarryMeaning: true,
      strictComparisonFirst: false,
    };
    expect(classifySite({ ...base, comparison: 'source-vs-source' })).toBe('dangerous');
    expect(classifySite({ ...base, comparison: 'source-vs-pattern' })).toBe('dangerous');
    expect(classifySite({ ...base, comparison: 'source-vs-stored' })).toBe('watched');
    expect(classifySite({ ...base, comparison: 'run-vs-run' })).toBe('watched');
  });

  it('the split is real: the sweep finds sites in every bucket, not one verdict for everything', () => {
    const summary = summariseSites();
    expect(summary.sites).toBe(SITES.length);
    expect(summary.dangerous.length).toBeGreaterThan(0);
    expect(summary.safe.length).toBeGreaterThan(0);
    expect(summary.dangerous.length + summary.watched.length + summary.safe.length).toBe(
      SITES.length,
    );
  });

  it('both failure directions are represented — invented AND hidden', () => {
    const summary = summariseSites();
    expect(summary.canInvent.length).toBeGreaterThan(0);
    expect(summary.canHide.length).toBeGreaterThan(0);
  });

  it('every site that records a live defect is one the classifier calls dangerous', () => {
    for (const site of SITES.filter((s) => s.liveDefect !== null)) {
      expect(classifySite(site), site.id).toBe('dangerous');
    }
  });

  it('no site is left without a measurement — a claim with no number is not a finding', () => {
    for (const site of SITES) {
      expect(site.measured.trim().length, site.id).toBeGreaterThan(40);
      expect(/\d/.test(site.measured), site.id).toBe(true);
    }
  });
});

describe('normaliser-sweep/check 1 — a damage type stated only in markup', () => {
  it('fires on First Strike, whose stripped sentence names no type at all', () => {
    const hit = damageTypeOnlyInMarkup('First Strike', FIRST_STRIKE);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('true');
  });

  it('does NOT fire on Hail of Blades, where the words survive the strip', () => {
    expect(damageTypeOnlyInMarkup('Hail of Blades', HAIL_OF_BLADES)).toBeNull();
  });

  it('does NOT fire on Infinity Edge, where tag and words agree', () => {
    expect(damageTypeOnlyInMarkup('Infinity Edge', INFINITY_EDGE)).toBeNull();
  });

  it('fires on Staff of Flowing Water — and quotes what the tag WRAPS, which is a stat, not damage', () => {
    // This is the case that decides how the check must be used. The tag says "magic" and the
    // thing it wraps is "40 Ability Power". Reading the tag as a damage type would be wrong.
    const hit = damageTypeOnlyInMarkup('Staff of Flowing Water', STAFF_OF_FLOWING_WATER);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('magic');
    expect(hit!.wraps).toBe('40 Ability Power');
    expect(/damage/i.test(hit!.wraps)).toBe(false);
  });

  it('refuses text carrying two different type tags rather than picking one', () => {
    const both = 'deals <magicDamage>50</magicDamage> and <physicalDamage>20</physicalDamage>';
    expect(damageTypeOnlyInMarkup('two types', both)).toBeNull();
  });
});

describe('normaliser-sweep/the First Strike sentence, put back through the census classifier', () => {
  // This is the measurement that stops the headline being over-claimed. The stripped sentence and
  // the sentence with the tag's own word restored classify DIFFERENTLY — that is the normaliser
  // changing an answer, proved rather than argued. What it does NOT prove is that stripping alone
  // explains the stored record; the full rune text is refused a second time for its gold clause.
  const strippedSentence = 'causing you to deal 7% extra damage against champions';
  const restoredSentence = 'causing you to deal 7% bonus true damage against champions';
  const record = (text: string) => ({
    source: 'rune' as const,
    ownerName: 'First Strike',
    id: 8369,
    key: 'rune',
    effectName: null,
    text,
  });

  it('reads the stripped sentence as no damage at all', () => {
    expect(classifyEffect(record(strippedSentence)).damage).toBe('none');
  });

  it('reads the same sentence as a damage candidate once the type the tag carried is restored', () => {
    const classified = classifyEffect(record(restoredSentence));
    expect(classified.damage).toBe('candidate');
    expect(classified.inScope).toBe(true);
  });
});

describe('normaliser-sweep/check 2 — meaning inside a named template argument', () => {
  it("finds Kraken Slayer's `type=target's missing health`, which plainText deletes", () => {
    const facts = namedArgumentsCarryingMeaning(KRAKEN_SLAYER);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.argument).toBe('type');
    expect(facts[0]!.states).toBe("target's missing health");
    expect(facts[0]!.ownerRequiredStat).toBe('missingHP');
    expect(facts[0]!.attributesAnOwner).toBe(true);
  });

  it('returns a stat with no owner when the argument names a pool and nobody owns it', () => {
    const facts = namedArgumentsCarryingMeaning(
      "Gain bonus attack damage equal to {{pp|0 to 12 by 1|key=%|type='''missing''' health}}.",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]!.ownerRequiredStat).toBe('missingHP');
    expect(facts[0]!.attributesAnOwner).toBe(false);
  });

  it('is silent on `type=level`, which names neither an owner-required stat nor an owner', () => {
    expect(namedArgumentsCarryingMeaning(TERMINUS)).toEqual([]);
  });

  it('is silent on purely formatting arguments — the point is not that named args are dropped', () => {
    expect(namedArgumentsCarryingMeaning(FORMATTING_ONLY)).toEqual([]);
  });

  it('is silent on text with no named arguments at all', () => {
    expect(namedArgumentsCarryingMeaning('{{as|70|physical damage}} on-hit.')).toEqual([]);
  });
});
