// Known-answer tests for the defensive PROPOSER and its two gates.
//
// Every fixture is real wikitext or real rendered HTML, quoted from the page it names, so a
// passing test is evidence about the source rather than about the code's opinion of itself.
//
// The rules these pin, each of which cost this project something to learn:
//   - storage is gated on the CONFIRMED population, never on a detector's candidates;
//   - a row that cannot be read in full is not stored in part;
//   - an owner no source states is recorded as unresolvable and forces 'incomplete';
//   - nothing a generator writes may claim 'verified';
//   - a value is stored on an axis that describes itself, because the shape has no rank count.

import { describe, expect, it } from 'vitest';

import type { CuratedDefensiveEffect } from '../../src/types/data.ts';
import { parseRenderedRows } from './render.ts';
import {
  KIND_MAP,
  gateDefensiveSchema,
  labelRefusal,
  overTimeFigureIsUsable,
  parseDefensiveRow,
  proposeForPage,
  recurringFigureCensus,
  releasedBy,
  roundTripDefensive,
  type ProposalSource,
  type Refusal,
} from './defensive-propose.ts';
import { SHAPES_READ } from './defensive-shapes.ts';
import type { CachedPage } from './page-cache.ts';
import { gateSchema } from '../../src/types/validate-curated.ts';

/** Wrap defensive entries as the CuratedFile gate 1 walks. */
const asFile = (defensiveEffects: CuratedDefensiveEffect[]) => ({
  version: 1,
  patch: '16.16.1',
  fetched: '2026-08-13',
  abilities: [],
  defensiveEffects,
  itemEffects: [],
  runes: [],
  shards: [],
  exclusions: [],
});

const OPTS = { patch: '16.16.1', fetched: '2026-08-13' };

const page = (
  champion: string,
  slot: CachedPage['slot'],
  abilityName: string,
  wikitext: string,
): CachedPage => ({
  requested: `Template:Data ${champion}/${abilityName}`,
  resolved: `Template:Data ${champion}/${abilityName}`,
  champion,
  slot,
  abilityName,
  revid: 1,
  wikitext,
});

// ---------------------------------------------------------------------------

describe('the label says what the entry cannot', () => {
  it('refuses every resistance grant, because kind cannot say armor from magic resistance', () => {
    // Graves E grants 7-19 armor AND 3.5-9.5 magic resistance. Two entries reading
    // `kind: 'resistance-grant'` with a number are indistinguishable, and the difference is
    // which damage type gets mitigated.
    expect(labelRefusal('resistance-grant', 'Bonus Armor')).toBe('needs-granted-stat');
    expect(labelRefusal('resistance-grant', 'Bonus Magic Resistance')).toBe('needs-granted-stat');
    expect(labelRefusal('resistance-grant', 'Bonus Resistances')).toBe('needs-granted-stat');
  });

  it('refuses a shield the source restricts to one damage type', () => {
    // Morgana E and Kassadin Q print "Magic Shield Strength". Stored as a plain shield it would
    // absorb physical damage the source says it does not touch.
    expect(labelRefusal('shield', 'Magic Shield Strength')).toBe('needs-damage-type');
  });

  it('refuses a per-tick or whole-channel figure', () => {
    expect(labelRefusal('heal', 'Heal per Tick')).toBe('needs-over-time');
    expect(labelRefusal('heal', 'Total Heal')).toBe('needs-over-time');
  });

  it('refuses a rate or an amplifier stated as a heal', () => {
    expect(labelRefusal('heal', 'Life Steal')).toBe('not-an-amount');
    expect(labelRefusal('heal', 'Healing Percentage')).toBe('not-an-amount');
    expect(labelRefusal('heal', 'Increased Healing')).toBe('not-an-amount');
  });

  it('refuses a Minimum/Maximum or empowered variant, which needs a relation', () => {
    expect(labelRefusal('shield', 'Maximum Shield Strength')).toBe('needs-relation');
    expect(labelRefusal('shield', 'Enhanced Shield Strength')).toBe('needs-relation');
  });

  it('accepts a plain amount', () => {
    expect(labelRefusal('shield', 'Shield Strength')).toBeNull();
    expect(labelRefusal('heal', 'Heal')).toBeNull();
    expect(labelRefusal('damage-reduction', 'Damage Reduction')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('reading a defensive leveling row', () => {
  it('stores a rank series EXPLICITLY, because the shape carries no rank count', () => {
    // Alistar R, quoted: {{st|Damage Reduction|{{ap|55 to 75}}%}}. An ultimate has three ranks.
    const r = parseDefensiveRow('{{ap|55 to 75}}%', 3, {});
    expect(r.refusal).toBeUndefined();
    expect(r.value).toEqual({ scaling: 'explicit', perRank: [55, 65, 75] });
    expect(r.isPercentage).toBe(true);
  });

  it('reads a flat term and its ratios together', () => {
    // Annie E, quoted.
    const r = parseDefensiveRow('{{ap|60 to 200}} {{as|(+ 40% AP)}}', 5, {});
    expect(r.refusal).toBeUndefined();
    expect(r.value).toEqual({ scaling: 'explicit', perRank: [60, 95, 130, 165, 200] });
    expect(r.ratios).toEqual([{ stat: 'AP', scaling: 'explicit', perRank: [40, 40, 40, 40, 40] }]);
    expect(r.isPercentage).toBe(false);
  });

  it('reads a payload with no flat term at all, and leaves the owner unresolved', () => {
    // Galio W, quoted: the whole shield is a share of maximum health, and the source never says
    // WHOSE maximum health. §16 refuses to guess; the owner comes back 'unresolved'.
    const r = parseDefensiveRow("{{as|{{ap|7.5 to 13.5}}% of '''maximum''' health}}", 5, {});
    expect(r.refusal).toBeUndefined();
    expect(r.value).toBeUndefined();
    expect(r.ratios).toHaveLength(1);
    expect(r.ratios[0]!.stat).toBe('maxHP');
    expect(r.ratios[0]!.owner).toBe('unresolved');
  });

  it('refuses a row carrying a number outside every readable block', () => {
    // Thresh W, quoted: "(+ 2 per Soul collected)" is not in a template the parser reads, so the
    // row was not read in full and no part of it is stored.
    const r = parseDefensiveRow(
      '{{ap|50 to 130}} (+ 2 per {{ai|Damnation|Thresh|Soul}} collected)',
      5,
      {},
    );
    expect(r.refusal?.refusalClass).toBe('unread-literal-in-row');
    expect(r.value).toBeUndefined();
  });

  it("refuses a row whose own step count disagrees with the slot's rank count", () => {
    // Udyr's basic abilities reach rank 6 and write "{{ap|45 to 145 6}}". Storing five of six
    // values, or six against a five-rank axis, puts every rank on the wrong number.
    const r = parseDefensiveRow('{{ap|45 to 145 6}}', 5, {});
    expect(r.refusal?.refusalClass).toBe('rank-axis-mismatch');
  });

  it('refuses a row with both a champion-level term and a per-rank term', () => {
    const r = parseDefensiveRow('{{pp|10+5*x}} (+ {{ap|20 to 60}})', 5, {});
    expect(r.refusal?.refusalClass).toBe('two-additive-terms');
  });

  it('refuses a ratio whose stat no parser recognises, rather than dropping it', () => {
    // Senna R, quoted: the shield scales with her Mist stacks, which is not a RatioStat.
    const r = parseDefensiveRow(
      '{{ap|120 to 200}} {{as|(+ 50% AP)}} {{as|(+ 150% {{ai|Absolution|Senna|Mist}})|mist}}',
      3,
      {},
    );
    expect(r.refusal?.refusalClass).toBe('unreadable-value');
  });
});

// ---------------------------------------------------------------------------

describe('proposing an entry', () => {
  const shieldPage = page(
    'Annie',
    'E',
    'Molten Shield',
    '{{Ability data\n|damagetype = Magic\n|description = {{sbc|Active:}} Annie grants a ' +
      '{{tip|shield}} to herself for 3 seconds.\n' +
      '|leveling = {{st|Shield Strength|{{ap|60 to 200}} {{as|(+ 40% AP)}}}}\n}}',
  );

  it('writes the value, the ratio and the condition, and claims only derived', () => {
    const run = proposeForPage(
      shieldPage,
      {
        key: 'Annie/E/Molten Shield',
        kinds: ['shield'],
        activation: 'conditional',
        activationEvidence: 'Active; "for 3 seconds"',
      },
      OPTS,
    );
    expect(run.refusals).toEqual([]);
    expect(run.proposals).toHaveLength(1);
    const e = run.proposals[0]!;
    expect(e.kind).toBe('shield');
    expect(e.activation).toBe('conditional');
    expect(e.condition).toBe('Active; "for 3 seconds"');
    expect(e.value).toEqual({ scaling: 'explicit', perRank: [60, 95, 130, 165, 200] });
    expect(e.verification).toBe('derived');
    expect(e.provenance.patch).toBe('16.16.1');
  });

  it('forces incomplete and records an unresolvable when the source states no owner', () => {
    const galio = page(
      'Galio',
      'W',
      'Shield of Durand',
      "{{Ability data\n|leveling = {{st|Magic Shield Strength|{{as|{{ap|7.5 to 13.5}}% of '''maximum''' health}}}}\n}}",
    );
    const run = proposeForPage(
      galio,
      {
        key: 'Galio/W/Shield of Durand',
        kinds: ['shield'],
        activation: 'conditional',
        activationEvidence: 'Active channel',
      },
      OPTS,
    );
    const e = run.proposals[0]!;
    expect(e.verification).toBe('incomplete');
    expect(e.unresolvable?.[0]?.field).toContain('maxHP');
    // PERMANENT IS NOT PENDING: the entry says why nobody can ever finish it.
    expect(e.unresolvable?.[0]?.why).toMatch(/never says whose/);
    // The shield absorbs MAGIC damage only, and the entry now says so. Stored without it, this
    // shield would absorb physical damage the game does not let it absorb.
    expect(e.appliesToDamageType).toBe('magic');
  });

  it('refuses loudly when a reading names a row the page no longer has', () => {
    // The same page under its OLD row label. A reading is evidence about one revision, so a page
    // that has moved under it is refused rather than stored against a reading of something else.
    const galio = page(
      'Galio',
      'W',
      'Shield of Durand',
      "{{Ability data\n|leveling = {{st|Shield Strength|{{as|{{ap|7.5 to 13.5}}% of '''maximum''' health}}}}\n}}",
    );
    const run = proposeForPage(
      galio,
      {
        key: 'Galio/W/Shield of Durand',
        kinds: ['shield'],
        activation: 'conditional',
        activationEvidence: 'Active channel',
      },
      OPTS,
    );
    expect(run.proposals).toEqual([]);
    expect(run.refusals[0]!.refusalClass).toBe('reading-stale');
    expect(run.refusals[0]!.detail).toContain('Magic Shield Strength');
  });

  it("keeps a 'not-stated' activation and invents nothing for it", () => {
    // Xin Zhao R: the source states the condition and it is a DISTANCE, which this engine models
    // nothing of. Kayn P is a location outside combat. Neither is a coin toss.
    const xin = page(
      'Xin Zhao',
      'R',
      'Crescent Guard',
      '{{Ability data\n|description = Xin Zhao becomes {{tip|invulnerable}} against enemy ' +
        'champions far away from him.\n}}',
    );
    const run = proposeForPage(
      xin,
      {
        key: 'Xin Zhao/R/Crescent Guard',
        kinds: ['immunity'],
        activation: 'not-stated',
        activationEvidence: 'the condition is a DISTANCE, and the engine models no positions',
      },
      OPTS,
    );
    // An immunity has no amount to state, so the entry is complete without one — and the
    // activation stays 'not-stated' rather than being resolved by a coin toss.
    expect(run.proposals).toHaveLength(1);
    const e = run.proposals[0]!;
    expect(e.activation).toBe('not-stated');
    expect(e.value).toBeUndefined();
    expect(e.valueByReference).toBeUndefined();
    expect(e.condition).toMatch(/DISTANCE/);
    expect(e.verification).toBe('derived');
  });

  it('proposes an immunity with no value at all, and never invents one', () => {
    const kayle = page(
      'Kayle',
      'R',
      'Divine Judgment',
      '{{Ability data\n|description = {{sbc|Active:}} Kayle grants {{tip|invulnerability}} for ' +
        '2.5 seconds.\n}}',
    );
    const run = proposeForPage(
      kayle,
      {
        key: 'Kayle/R/Divine Judgment',
        kinds: ['immunity'],
        activation: 'conditional',
        activationEvidence: 'Active; "invulnerability for 2.5 seconds", self or ally',
      },
      OPTS,
    );
    expect(run.proposals).toHaveLength(1);
    expect(run.proposals[0]!.value).toBeUndefined();
    expect(run.proposals[0]!.ratios).toBeUndefined();
    expect(run.proposals[0]!.valueByReference).toBeUndefined();
    // The 2.5 in the source is a DURATION, and this engine models sequence rather than elapsed
    // time. It appears only inside the quoted condition, never as a number the entry states.
    expect(run.proposals[0]!.condition).toContain('2.5 seconds');
  });

  it('never proposes an attacker debuff, which the census counts separately', () => {
    expect(KIND_MAP['attacker-debuff']).toBeNull();
    const trundle = page(
      'Trundle',
      'Q',
      'Chomp',
      '{{Ability data\n|leveling = {{st|Attack Damage Reduction|{{ap|20 to 40}}}}\n}}',
    );
    const run = proposeForPage(
      trundle,
      {
        key: 'Trundle/Q/Chomp',
        kinds: ['attacker-debuff'],
        activation: 'conditional',
        activationEvidence: 'Active',
      },
      OPTS,
    );
    expect(run.proposals).toEqual([]);
    expect(run.refusals[0]!.refusalClass).toBe('not-a-defensive-kind');
  });

  it('drops a non-champion row and says so, rather than counting it as a second value', () => {
    // Renekton Q, quoted: the wiki prints healing against non-champions beside healing against
    // champions. This product is champion-versus-champion, so the first is dropped — reported,
    // never silently.
    const renekton = page(
      'Renekton',
      'Q',
      'Cull the Meek',
      "{{Ability data\n|leveling = {{st|Non-Champion Healing|{{ap|2 to 6}}}}" +
        "{{st|Champion Healing|{{ap|12 to 44}} {{as|(+ 17% '''bonus''' AD)}}}}\n}}",
    );
    const run = proposeForPage(
      renekton,
      {
        key: 'Renekton/Q/Cull the Meek',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Scales with enemies hit',
      },
      OPTS,
    );
    expect(run.nonChampionRowsDropped).toHaveLength(1);
    expect(run.proposals).toHaveLength(1);
    expect(run.proposals[0]!.value).toEqual({ scaling: 'explicit', perRank: [12, 20, 28, 36, 44] });
  });

  it('stores Leona W as TWO labelled entries, one per resistance', () => {
    // Leona W, quoted. Two real values on one page. Before the six fields this was refused
    // outright, because picking one row drops the other and which one it drops decides whether
    // the defender mitigates physical or magic damage.
    const leona = page(
      'Leona',
      'W',
      'Eclipse',
      "{{Ability data\n|leveling = {{st|Bonus Armor|{{ap|20 to 50}}}}{{st|Bonus Magic Resistance|{{ap|20 to 50}}}}\n}}",
    );
    const run = proposeForPage(
      leona,
      {
        key: 'Leona/W/Eclipse',
        kinds: ['resistance-grant'],
        activation: 'conditional',
        activationEvidence: 'Active; "raises her guard for 3 seconds"',
      },
      OPTS,
    );
    expect(run.refusals).toEqual([]);
    expect(run.proposals).toHaveLength(2);
    const [armor, mr] = run.proposals;
    expect(armor!.label).toBe('Bonus Armor');
    expect(armor!.grantedStat).toBe('armor');
    expect(mr!.grantedStat).toBe('magicResist');
    // NOT 'both': that arm is for one figure granted to both resistances in one statement.
    expect(armor!.grantedStat).not.toBe('both');
    // They apply at the same time, and the intent is stated rather than defaulted.
    expect(armor!.relation).toEqual({ kind: 'adds' });
    expect(mr!.relation).toEqual({ kind: 'adds' });
    expect(armor!.id).not.toBe(mr!.id);
    expect(armor!.unit).toBe('flat');
  });

  it('refuses two rows of one kind on a page NOBODY HAS READ, rather than pairing them by label', () => {
    // The same shape on a page with no reading. A label is a candidate, never a decision: two
    // rows might add (Leona W) or alternate (Shen R), and only the sentence says which.
    const madeUp = page(
      'Nobody',
      'W',
      'Unread Ability',
      "{{Ability data\n|leveling = {{st|Bonus Armor|{{ap|20 to 50}}}}{{st|Bonus Magic Resistance|{{ap|20 to 50}}}}\n}}",
    );
    const run = proposeForPage(
      madeUp,
      {
        key: 'Nobody/W/Unread Ability',
        kinds: ['resistance-grant'],
        activation: 'conditional',
        activationEvidence: 'Active',
      },
      OPTS,
    );
    expect(run.proposals).toEqual([]);
    expect(run.refusals[0]!.blockedBy).toContain('shape-not-read');
    expect(run.refusals[0]!.blockedBy).toContain('needs-granted-stat');
    expect(run.refusals[0]!.blockedBy).toContain('multiple-values-one-field');
  });

  it('alternates a Minimum/Maximum pair instead of summing it', () => {
    // Ekko R, whose heal really does carry a Minimum/Maximum pair. Summing these hands the
    // defender both figures, which is the exact failure `relation` exists to prevent.
    //
    // THE EXEMPLAR MOVED ON 2026-08-14, and the rule did not. This was Shen R until Shen R was
    // removed from the defender model altogether — it shields only an ALLY, so it is not Shen's
    // defensive entry at all (ally-only.ts). A rule needs an example that is still in the
    // population; the assertion below is unchanged.
    const shen = page(
      'Ekko',
      'R',
      'Chronobreak',
      '{{Ability data\n|leveling = {{st|Minimum Heal|{{ap|120 to 320}}}}' +
        '{{st|Maximum Heal|{{ap|120*1.6 to 320*1.6}}}}\n}}',
    );
    const run = proposeForPage(
      shen,
      {
        key: 'Ekko/R/Chronobreak',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active channel',
      },
      OPTS,
    );
    expect(run.proposals).toHaveLength(2);
    const [min, max] = run.proposals;
    expect(min!.relation).toEqual({ kind: 'adds' });
    expect(max!.relation).toEqual({ kind: 'alternativeTo', componentId: min!.id });
  });

  it('stores a rate as a rate, never as health restored', () => {
    // Bel'Veth E, quoted. 20 to 40 in `value` with no unit reads as 20 to 40 health.
    const belveth = page(
      "Bel'Veth",
      'E',
      'Royal Maelstrom',
      '{{Ability data\n|leveling = {{st|Life Steal|{{ap|20 to 40}}%}}\n}}',
    );
    const run = proposeForPage(
      belveth,
      {
        key: "Bel'Veth/E/Royal Maelstrom",
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active; "enters a frenzy for 1.5 seconds"',
      },
      OPTS,
    );
    expect(run.proposals).toHaveLength(1);
    expect(run.proposals[0]!.unit).toBe('percent-of-damage-dealt');
  });

  it('does NOT read Vladimir R\'s "Total" row as an over-time heal', () => {
    // THE TRAP. "Total" means "over the duration" on thirty-odd pages and "across every target
    // hit" here. Stored as over time, a heal that lands inside the burst would sit outside the
    // burst verdict (SPECIFICATION §3.8).
    const vlad = page(
      'Vladimir',
      'R',
      'Hemoplague',
      '{{Ability data\n|leveling = {{st|Heal|{{ap|150 to 350}}}}' +
        '{{st|Maximum Total Heal|{{ap|150*(1+0.4*4) to 350*(1+0.4*4)}}}}\n}}',
    );
    const run = proposeForPage(
      vlad,
      {
        key: 'Vladimir/R/Hemoplague',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active; after the infection duration',
      },
      OPTS,
    );
    expect(run.proposals).toHaveLength(2);
    expect(run.proposals.map((p) => p.overTime)).toEqual([undefined, undefined]);
    expect(run.proposals[1]!.relation).toEqual({
      kind: 'alternativeTo',
      componentId: run.proposals[0]!.id,
    });
  });

  it('records a recurrence only with the sentence it rests on', () => {
    const swain = page(
      'Swain',
      'R',
      'Demonic Ascension',
      "{{Ability data\n|leveling = {{st|Heal per Tick|{{ap|15/2 to 45/2}} {{as|(+ {{ap|5/2}}% AP)}}}}\n}}",
    );
    const run = proposeForPage(
      swain,
      {
        key: 'Swain/R/Demonic Ascension',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active; maintained with Demonic Energy',
      },
      OPTS,
    );
    expect(run.proposals[0]!.overTime?.sourceSays).toMatch(/every 0\.5 seconds/);
    // No count is invented: the source states a duration and an interval, not a number of ticks.
    expect(run.proposals[0]!.overTime?.totalInstances).toBeUndefined();
    // READ 2026-08-15: the row is one tick of a channel with no duration anywhere on the page.
    expect(run.proposals[0]!.overTime?.figureIs).toBe('per-instance');
    // So no whole-duration total can ever be formed, and the entry says so permanently.
    expect(run.proposals[0]!.verification).toBe('incomplete');
    expect(run.proposals[0]!.unresolvable?.[0]!.field).toBe('overTime.totalInstances');
  });

  // ═══ THE 18, AND THE FIELD THAT DECIDES THEM ═══
  //
  // Master Yi W is the worked example the contract itself cites: four rows, two of them the same
  // heal read two ways, differing in nothing an entry could carry until `figureIs` existed.
  it('tells one tick from the whole channel on the page that stores both', () => {
    const yi = page(
      'Master Yi',
      'W',
      'Meditate',
      '{{Ability data\n|description = Master Yi channels for up to 4 seconds, healing himself ' +
        'every 0.5 seconds.\n' +
        '|leveling = {{st|Minimum Heal Per Tick|{{ap|15 to 55}} {{as|(+ 12.5% AP)}}' +
        '|Maximum Heal Per Tick|{{ap|15*2 to 55*2}} {{as|(+ 25% AP)}}}}\n' +
        '{{st|Minimum Total Heal|{{ap|15*8 to 55*8}} {{as|(+ 100% AP)}}' +
        '|Maximum Total Heal|{{ap|15*8*2 to 55*8*2}} {{as|(+ 200% AP)}}}}\n}}',
    );
    const run = proposeForPage(
      yi,
      {
        key: 'Master Yi/W/Meditate',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active; channelled',
      },
      OPTS,
    );
    const byLabel = new Map(run.proposals.map((p) => [p.label, p]));
    expect(byLabel.get('Minimum Heal Per Tick')!.overTime?.figureIs).toBe('per-instance');
    expect(byLabel.get('Maximum Heal Per Tick')!.overTime?.figureIs).toBe('per-instance');
    expect(byLabel.get('Minimum Total Heal')!.overTime?.figureIs).toBe('full-duration');
    expect(byLabel.get('Maximum Total Heal')!.overTime?.figureIs).toBe('full-duration');

    // The whole-channel rows are 8x the per-tick rows at every rank — which is what makes storing
    // the wrong one an eightfold error rather than a rounding one.
    const tick = byLabel.get('Minimum Heal Per Tick')!.value as { perRank: number[] };
    const total = byLabel.get('Minimum Total Heal')!.value as { perRank: number[] };
    expect(total.perRank).toEqual(tick.perRank.map((v) => v * 8));

    // AND THE CONSEQUENCE — RE-PINNED 2026-08-15, AND THE RULE BEHIND IT DID NOT MOVE.
    //
    // This block asserted `incomplete` on the two per-tick rows until today, and the reason it
    // gave was "one occurrence with no count of occurrences". That reason is still the rule; what
    // changed is that this page's count HAS since been read — 4 seconds / 0.5 seconds, and the
    // Total rows are literally `15*8`, so `defensive-shapes.ts` now writes 8 onto both per-tick
    // rows. A row with a count is usable, which is the whole point of the field.
    //
    // THE RULE ITSELF IS PINNED IN THE NEXT TEST, on the two rows that still have no count. If
    // this assertion were changed without that one, "per-instance without a count is incomplete"
    // would have nothing asserting it anywhere.
    expect(byLabel.get('Minimum Total Heal')!.verification).toBe('derived');
    expect(byLabel.get('Maximum Total Heal')!.verification).toBe('derived');
    expect(byLabel.get('Minimum Heal Per Tick')!.overTime?.totalInstances).toBe(8);
    expect(byLabel.get('Maximum Heal Per Tick')!.overTime?.totalInstances).toBe(8);
    expect(byLabel.get('Minimum Heal Per Tick')!.verification).toBe('derived');
    expect(byLabel.get('Maximum Heal Per Tick')!.verification).toBe('derived');
  });

  // THE NEGATIVE CONTROL FOR THE ABOVE. Milio W is the one page of the nine whose two statements
  // disagree — 6 seconds every 0.25 is twenty-four, and its own row divides by twenty-five — so
  // no count is written and the row may claim no better than `incomplete`. If a future reading
  // ever settles Milio, this test has to be replaced by one over another uncounted row, never
  // deleted: it is the only thing asserting that a per-occurrence figure with no count is refused.
  it('refuses a per-occurrence heal whose count the page contradicts itself about', () => {
    const milio = page(
      'Milio',
      'W',
      'Cozy Campfire',
      '{{Ability data\n|description = Milio summons a fuemigo at the target location for 6 ' +
        'seconds ... and heal every 0.25 over the duration.\n' +
        '|leveling = {{st|Heal per Tick|{{ap|70/25 to 150/25}} {{as|(+ {{ap|15/25}}% AP)}}' +
        '|Total Heal|{{ap|70 to 150}} {{as|(+ 15% AP)}}}}\n}}',
    );
    const run = proposeForPage(
      milio,
      {
        key: 'Milio/W/Cozy Campfire',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active; while near the fuemigo',
      },
      OPTS,
    );
    const byLabel = new Map(run.proposals.map((p) => [p.label, p]));
    expect(byLabel.get('Heal per Tick')!.overTime?.figureIs).toBe('per-instance');
    expect(byLabel.get('Heal per Tick')!.overTime?.totalInstances).toBeUndefined();
    expect(byLabel.get('Heal per Tick')!.verification).toBe('incomplete');
    // The whole-duration row is unaffected: it needs no count and never did.
    expect(byLabel.get('Total Heal')!.verification).toBe('derived');
  });

  it('leaves the figure unstated where the page contradicts its own per-tick row', () => {
    // Soraka Q. The page's notes say Rejuvenation's twelve ticks heal about 15% of the heal each
    // for the first four, 5.5% for the next four and 4.5% for the last four — so the row's even
    // twelfth is the amount of NO occurrence. Neither reading is taken.
    const soraka = SHAPES_READ.find((s) => s.key === 'Soraka/Q/Starcall')!;
    const perTick = soraka.rows.find((r) => r.label === 'Heal per Tick')!;
    expect(perTick.overTime?.figureIs).toBeUndefined();
    expect(perTick.overTime?.figureIsUnread).toMatch(/twelve ticks of THREE different sizes/);
    const total = soraka.rows.find((r) => r.label === 'Total Heal')!;
    expect(total.overTime?.figureIs).toBe('full-duration');
  });

  it('every reading that records a recurrence says what its figure covers, or why it cannot', () => {
    // THE RULE THIS ENFORCES: an unfilled `figureIs` must be distinguishable from an unfinished
    // reading. A row with neither the figure nor a stated reason is a reading somebody abandoned.
    const unexplained = SHAPES_READ.flatMap((s) =>
      s.rows
        .filter((r) => r.overTime && !r.overTime.figureIs && !r.overTime.figureIsUnread)
        .map((r) => `${s.key} "${r.label}"`),
    );
    expect(unexplained).toEqual([]);
  });

  it('drops a row granting to somebody who is not the defender, and says so', () => {
    // Braum W, quoted. The Ally rows carry 12% bonus resistances and the Self rows 36%; storing
    // all four would grant Braum both.
    const braum = page(
      'Braum',
      'W',
      'Stand Behind Me',
      "{{Ability data\n|leveling = {{st|Ally Bonus Armor|{{ap|20 to 40}} {{as|(+ 12% '''bonus''' armor)}}}}" +
        "{{st|Ally Bonus Magic Resistance|{{ap|20 to 40}} {{as|(+ 12% '''bonus''' magic resistance)}}}}" +
        "{{st|Self Bonus Armor|{{ap|20 to 40}} {{as|(+ 36% '''bonus''' armor)}}}}" +
        "{{st|Self Bonus Magic Resistance|{{ap|20 to 40}} {{as|(+ 36% '''bonus''' magic resistance)}}}}\n}}",
    );
    const run = proposeForPage(
      braum,
      {
        key: 'Braum/W/Stand Behind Me',
        kinds: ['resistance-grant'],
        activation: 'conditional',
        activationEvidence: 'Active; "for 3 seconds"',
      },
      OPTS,
    );
    expect(run.otherRecipientRowsDropped).toHaveLength(2);
    expect(run.proposals).toHaveLength(2);
    expect(run.proposals.map((p) => p.label)).toEqual([
      'Self Bonus Armor',
      'Self Bonus Magic Resistance',
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('what one contract field would release', () => {
  it('counts a pair only when EVERY blocker on it is covered', () => {
    const refusals: Refusal[] = [
      { key: 'a', kind: 'shield', refusalClass: 'needs-relation', blockedBy: ['needs-relation'], detail: '' },
      {
        key: 'b',
        kind: 'heal',
        refusalClass: 'needs-over-time',
        blockedBy: ['needs-over-time', 'multiple-values-one-field'],
        detail: '',
      },
    ];
    expect(releasedBy(refusals, ['needs-relation']).map((r) => r.key)).toEqual(['a']);
    expect(releasedBy(refusals, ['needs-over-time'])).toEqual([]);
    expect(
      releasedBy(refusals, ['needs-over-time', 'multiple-values-one-field']).map((r) => r.key),
    ).toEqual(['b']);
  });
});

// ---------------------------------------------------------------------------

describe('gate D1 — the schema gate for defensive entries', () => {
  const base: CuratedDefensiveEffect = {
    champion: 'Annie',
    slot: 'E',
    abilityName: 'Molten Shield',
    kind: 'shield',
    activation: 'conditional',
    condition: 'Active; "for 3 seconds"',
    value: { scaling: 'explicit', perRank: [60, 95, 130, 165, 200] },
    verification: 'derived',
    provenance: { source: 'Template:Data Annie/Molten Shield', patch: '16.16.1' },
  };

  it('passes a well-formed entry', () => {
    expect(gateDefensiveSchema([base]).failed).toBe(0);
  });

  it("refuses anything claiming 'verified'", () => {
    const r = gateDefensiveSchema([{ ...base, verification: 'verified' }]);
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/may claim 'verified'/);
  });

  it('refuses a linear value, which needs a rank count the shape does not carry', () => {
    const r = gateDefensiveSchema([{ ...base, value: { scaling: 'linear', from: 60, to: 200 } }]);
    expect(r.failed).toBe(1);
  });

  it('refuses a ratio on an owner-required stat with no owner', () => {
    const r = gateDefensiveSchema([
      { ...base, ratios: [{ stat: 'maxHP', scaling: 'explicit', perRank: [8, 8, 8, 8, 8] }] },
    ]);
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/states no owner/);
  });

  it("refuses an entry carrying an unresolvable fact while claiming 'derived'", () => {
    const r = gateDefensiveSchema([
      { ...base, unresolvable: [{ field: 'ratios[0].owner (maxHP)', why: 'no source states it' }] },
    ]);
    expect(r.failed).toBe(1);
  });

  it('refuses a conditional effect that does not state its condition', () => {
    const { condition, ...noCondition } = base;
    expect(gateDefensiveSchema([noCondition as CuratedDefensiveEffect]).failed).toBe(1);
  });

  it("refuses a recurring entry that claims 'derived' without saying what its figure covers", () => {
    const r = gateDefensiveSchema([
      { ...base, overTime: { sourceSays: 'shields every 0.25 seconds over the duration' } },
    ]);
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/one occurrence or the whole duration/);
  });

  it("refuses a per-instance figure claiming 'derived' with no count of occurrences", () => {
    const r = gateDefensiveSchema([
      {
        ...base,
        overTime: { sourceSays: 'heals every 0.5 seconds', figureIs: 'per-instance' },
      },
    ]);
    expect(r.failed).toBe(1);
    expect(r.findings[0]!.message).toMatch(/no whole-duration total can be formed/);
  });

  it('accepts a whole-duration figure, which is complete on its own', () => {
    const r = gateDefensiveSchema([
      {
        ...base,
        overTime: { sourceSays: 'the maximum shield is reached over the duration', figureIs: 'full-duration' },
      },
    ]);
    expect(r.failed).toBe(0);
  });

  it('accepts a per-instance figure once the source states how many times it lands', () => {
    const r = gateDefensiveSchema([
      {
        ...base,
        overTime: {
          sourceSays: 'launch 5 magical waves ... allied champions hit by the waves are healed',
          figureIs: 'per-instance',
          totalInstances: 5,
        },
      },
    ]);
    expect(r.failed).toBe(0);
  });

  it('never lets an incomplete entry be counted as usable, whichever arm it falls in', () => {
    expect(overTimeFigureIsUsable(undefined)).toBe(true);
    expect(overTimeFigureIsUsable({ figureIs: 'full-duration' })).toBe(true);
    expect(overTimeFigureIsUsable({ figureIs: 'per-instance' })).toBe(false);
    expect(overTimeFigureIsUsable({ figureIs: 'per-instance', totalInstances: 8 })).toBe(true);
    expect(overTimeFigureIsUsable({})).toBe(false);
  });

  it('counts recurring entries by what their figure covers, and names any left unexplained', () => {
    const census = recurringFigureCensus([
      { ...base, overTime: { sourceSays: 'a', figureIs: 'full-duration' } },
      { ...base, champion: 'Janna', overTime: { sourceSays: 'b', figureIs: 'per-instance' } },
      { ...base, champion: 'Yuumi', overTime: { sourceSays: 'c', figureIs: 'per-instance', totalInstances: 5 } },
      { ...base, champion: 'Soraka', overTime: { sourceSays: 'd' } },
      { ...base, champion: 'Garen' },
    ]);
    expect(census.recurring).toBe(4);
    expect(census.fullDuration).toHaveLength(1);
    expect(census.perInstanceNoCount).toHaveLength(1);
    expect(census.perInstanceWithCount).toHaveLength(1);
    expect(census.figureAbsent).toHaveLength(1);
    // Not in SHAPES_READ, so nothing states why its figure is absent — and the census says so
    // rather than letting it pass as read.
    expect(census.unreadWithNoStatedReason).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('gate D2 — the round trip against the wiki\'s own rendering', () => {
  const source: ProposalSource = {
    key: 'Annie/E/Molten Shield',
    kind: 'shield',
    label: 'Shield Strength',
    raw: '{{ap|60 to 200}} {{as|(+ 40% AP)}}',
    maxRank: 5,
  };
  const effect: CuratedDefensiveEffect = {
    champion: 'Annie',
    slot: 'E',
    abilityName: 'Molten Shield',
    kind: 'shield',
    activation: 'conditional',
    condition: 'Active',
    value: { scaling: 'explicit', perRank: [60, 95, 130, 165, 200] },
    ratios: [{ stat: 'AP', scaling: 'explicit', perRank: [40, 40, 40, 40, 40] }],
    verification: 'derived',
    provenance: { source: 'x', patch: '16.16.1' },
  };

  it('matches when the wiki prints the same series', () => {
    const r = roundTripDefensive(effect, source, [
      { label: 'Shield Strength', values: [60, 95, 130, 165, 200], ratios: [[40]] },
    ]);
    expect(r.outcome).toBe('matched');
  });

  it('reports a disagreement rather than absorbing it', () => {
    const r = roundTripDefensive(effect, source, [
      { label: 'Shield Strength', values: [60, 95, 130, 165, 999], ratios: [[40]] },
    ]);
    expect(r.outcome).toBe('mismatched');
    expect(r.detail).toMatch(/rank 5/);
  });

  it('reports a ratio the wiki printed and we did not store', () => {
    const r = roundTripDefensive({ ...effect, ratios: [] }, source, [
      { label: 'Shield Strength', values: [60, 95, 130, 165, 200], ratios: [[40]] },
    ]);
    expect(r.outcome).toBe('mismatched');
  });

  it('says so when the wiki rendered no row of that name — never counts it as a pass', () => {
    const r = roundTripDefensive(effect, source, [
      { label: 'Something Else', values: [1], ratios: [] },
    ]);
    expect(r.outcome).toBe('no-such-row');
  });
});

// ---------------------------------------------------------------------------

describe("the rendered-row reader and the last value of a percentage series", () => {
  // Real rendered HTML, quoted in shape from Alistar R's ability box. The wiki prints three
  // values; the default reader keeps two, because "75%" is not a bare number.
  const html =
    '<div class="ability-info-stats"><dl class="skill-tabs">' +
    '<dt><b>Damage Reduction:</b></dt><dd>55 / 65 / 75%</dd>' +
    '</dl></div>';

  it('loses the last value under the default reading — the defect, pinned', () => {
    expect(parseRenderedRows(html)[0]!.values).toEqual([55, 65]);
  });

  it('reads all three when the caller asks for the corrected reading', () => {
    expect(parseRenderedRows(html, { readPercentSeries: true })[0]!.values).toEqual([55, 65, 75]);
  });

  it('files a percentage-of-AD payload as a ratio, not as a base series', () => {
    // Sivir E, quoted: "60 / 65 / 70 / 75 / 80% AD (+ 50% AP)".
    const sivir =
      '<div class="ability-info-stats"><dl class="skill-tabs">' +
      '<dt><b>Heal:</b></dt><dd>60 / 65 / 70 / 75 / 80% AD (+ 50% AP)</dd></dl></div>';
    const wide = parseRenderedRows(sivir, { readPercentSeries: true })[0]!;
    expect(wide.values).toEqual([]);
    expect(wide.ratios).toEqual([[60, 65, 70, 75, 80], [50]]);
    // And the default reading, unchanged, which is why the option exists.
    const narrow = parseRenderedRows(sivir)[0]!;
    expect(narrow.values).toEqual([60, 65, 70, 75]);
  });

  it('does not turn a "% of the original damage" modifier into a stat payload', () => {
    // Mel W, quoted. Widening the payload pattern to "% of anything" would move this row's base
    // into the ratio list and make gate 2 disagree with a correctly stored entry.
    const mel =
      '<div class="ability-info-stats"><dl class="skill-tabs">' +
      '<dt><b>Modifier:</b></dt><dd>40 / 45 / 50 / 55 / 60% of the original damage</dd></dl></div>';
    expect(parseRenderedRows(mel, { readPercentSeries: true })[0]!.values).toEqual([
      40, 45, 50, 55, 60,
    ]);
  });
});

// ---------------------------------------------------------------------------
// GATE 1 IS THE LEAD'S VALIDATOR, AND IT HAS TO BE SHOWN TO BITE.
//
// "161 passed, 0 failed" only means something if the gate fails the thing it exists to fail. Each
// of these takes a proposal this file really produces, breaks exactly one of the six fields, and
// checks that gate 1 says so. Without them, a gate that always passed would read identically.
// ---------------------------------------------------------------------------

describe('gate 1 refuses what the six fields exist to prevent', () => {
  const leonaPage = page(
    'Leona',
    'W',
    'Eclipse',
    "{{Ability data\n|leveling = {{st|Bonus Armor|{{ap|20 to 50}}}}{{st|Bonus Magic Resistance|{{ap|20 to 50}}}}\n}}",
  );
  const leona = () =>
    proposeForPage(
      leonaPage,
      {
        key: 'Leona/W/Eclipse',
        kinds: ['resistance-grant'],
        activation: 'conditional',
        activationEvidence: 'Active; "raises her guard for 3 seconds"',
      },
      OPTS,
    ).proposals;

  it('passes the pair as proposed', () => {
    const r = gateSchema(asFile(leona()));
    expect(r.failed).toBe(0);
    expect(r.checked).toBe(2);
  });

  it('fails the pair once the labels are stripped', () => {
    const broken = leona().map((e) => ({ ...e, label: undefined }));
    const r = gateSchema(asFile(broken));
    expect(r.failed).toBe(2);
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/label/);
  });

  it('fails the pair once the relation is left to a default', () => {
    const broken = leona().map((e) => ({ ...e, relation: undefined }));
    expect(gateSchema(asFile(broken)).failed).toBe(2);
  });

  it('fails a resistance grant that does not say which resistance', () => {
    const broken = leona().map((e) => ({ ...e, grantedStat: undefined }));
    expect(gateSchema(asFile(broken)).failed).toBe(2);
  });

  it('fails a value that states no unit', () => {
    const broken = leona().map((e) => ({ ...e, unit: undefined }));
    expect(gateSchema(asFile(broken)).failed).toBe(2);
  });

  it('fails a rate stored on a kind that would read it as an amount', () => {
    const broken = leona().map((e) => ({ ...e, unit: 'percent-of-damage-dealt' as const }));
    const r = gateSchema(asFile(broken));
    expect(r.failed).toBe(2);
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/rate or an amplifier/);
  });

  it('fails a type-specific reduction with no damage type', () => {
    const galio = proposeForPage(
      page(
        'Galio',
        'W',
        'Shield of Durand',
        '{{Ability data\n|leveling = {{st|Physical Damage Reduction|{{ap|12.5 to 22.5}}%}}' +
          '{{st|Magic Damage Reduction|{{ap|25 to 45}}%}}\n}}',
      ),
      {
        key: 'Galio/W/Shield of Durand',
        kinds: ['type-specific-reduction'],
        activation: 'conditional',
        activationEvidence: 'Active channel',
      },
      OPTS,
    ).proposals;
    expect(galio).toHaveLength(2);
    expect(gateSchema(asFile(galio)).failed).toBe(0);
    const broken = galio.map((e) => ({ ...e, appliesToDamageType: undefined }));
    expect(gateSchema(asFile(broken)).failed).toBe(2);
  });

  it('fails an over-time claim with no sentence behind it', () => {
    const swain = proposeForPage(
      page(
        'Swain',
        'R',
        'Demonic Ascension',
        '{{Ability data\n|leveling = {{st|Heal per Tick|{{ap|15/2 to 45/2}}}}\n}}',
      ),
      {
        key: 'Swain/R/Demonic Ascension',
        kinds: ['heal'],
        activation: 'conditional',
        activationEvidence: 'Active',
      },
      OPTS,
    ).proposals;
    const broken = swain.map((e) => ({ ...e, overTime: { sourceSays: '' } }));
    const r = gateSchema(asFile(broken));
    expect(r.failed).toBe(1);
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/quote the sentence/);
  });
});
