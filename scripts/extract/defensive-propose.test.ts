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
  parseDefensiveRow,
  proposeForPage,
  releasedBy,
  roundTripDefensive,
  type ProposalSource,
  type Refusal,
} from './defensive-propose.ts';
import type { CachedPage } from './page-cache.ts';

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
    const e = run.proposals[0]!;
    expect(e.verification).toBe('incomplete');
    expect(e.unresolvable?.[0]?.field).toContain('maxHP');
    // PERMANENT IS NOT PENDING: the entry says why nobody can ever finish it.
    expect(e.unresolvable?.[0]?.why).toMatch(/never says whose/);
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

  it('refuses a kind with two rows rather than picking one of them', () => {
    // Leona W, quoted. Two real values, one field, no label: storing either alone drops the other
    // and storing both makes two entries nothing can tell apart.
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
    expect(run.proposals).toEqual([]);
    expect(run.refusals[0]!.blockedBy).toContain('multiple-values-one-field');
    expect(run.refusals[0]!.blockedBy).toContain('needs-granted-stat');
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
