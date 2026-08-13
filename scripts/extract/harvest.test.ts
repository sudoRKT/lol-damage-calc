// Tests for the harvester's own decisions — rank counts, slot aliases, and the round-trip.

import { describe, expect, it } from 'vitest';

import { damageTypeOf, draftFromTemplate, maxRankFor, roundTrip, roundTripLevelScaled, wikiSlotAlias } from './harvest.ts';
import { parseRenderedRows, splitRatioGroups } from './render.ts';

describe('rank counts are declared, never inferred', () => {
  it('gives an ultimate 3 ranks and a basic ability 5', () => {
    expect(maxRankFor('R')).toBe(3);
    expect(maxRankFor('Q')).toBe(5);
    expect(maxRankFor('W')).toBe(5);
    expect(maxRankFor('E')).toBe(5);
    expect(maxRankFor('P')).toBe(1);
  });
});

describe('the passive slot alias', () => {
  it("maps P to I, because the wiki calls the passive the 'innate'", () => {
    // REGRESSION. `Template:Data Lux/P` does not exist; `Template:Data Lux/I` redirects to
    // `Template:Data Lux/Illumination`. Requesting /P skipped EVERY passive in the game,
    // silently — the first batch reported "template not found" ten times out of ten.
    expect(wikiSlotAlias('P')).toBe('I');
    expect(wikiSlotAlias('Q')).toBe('Q');
    expect(wikiSlotAlias('R')).toBe('R');
  });
});

describe('damage type', () => {
  it('reads the template field, and returns null rather than guessing', () => {
    expect(damageTypeOf('Magic')).toBe('magic');
    expect(damageTypeOf('Physical')).toBe('physical');
    expect(damageTypeOf('True')).toBe('true');
    expect(damageTypeOf('')).toBeNull();
    expect(damageTypeOf(undefined)).toBeNull();
  });
});

describe('reading the wiki-rendered box', () => {
  it('separates the base series from a ratio group whatever colour it renders in', () => {
    // REGRESSION. A first attempt found ratio groups by matching `color:orange`, which is
    // only the attack-damage colour. Lux's AP ratio renders `#7A6DFF`, so it was never
    // removed, "240 (+ 75% AP)" failed the numeric test, and every AP ability quietly lost
    // its last rank. Gate 2 reported 39 of 40 failing, all with "wiki NaN" at the top rank.
    const html =
      '<div class="ability-info-stats"><dl class="skill-tabs">' +
      '<dt><b>Magic Damage:</b></dt>' +
      '<dd>80 / 120 / 160 / 200 / 240 <span style="color: #7A6DFF">(+ 75% AP)</span></dd>' +
      '</dl></div>';
    expect(parseRenderedRows(html)).toEqual([
      { label: 'Magic Damage', values: [80, 120, 160, 200, 240], ratios: [[75]] },
    ]);
  });

  it('keeps a decimal together when it is split by <small> markup', () => {
    // The wiki renders 17.5 as `17.<small>5</small>`. Stripping tags WITH a space would
    // give "17. 5" and lose the value.
    const html =
      '<div class="ability-info-stats"><dl class="skill-tabs">' +
      '<dt><b>Reduced Damage:</b></dt><dd>17.<small>5</small> / 28 / 38.<small>5</small></dd>' +
      '</dl></div>';
    expect(parseRenderedRows(html)[0]!.values).toEqual([17.5, 28, 38.5]);
  });

  it('handles a ratio that nests another ratio', () => {
    const { base, groups } = splitRatioGroups('100 / 200 (+ 5% (+ 4% per 100 AP) of missing health)');
    expect(base.trim()).toBe('100 / 200');
    expect(groups).toEqual(['(+ 5% (+ 4% per 100 AP) of missing health)']);
  });

  it('reads several rows from one box', () => {
    const html =
      '<div class="ability-info-stats"><dl class="skill-tabs">' +
      '<dt><b>Physical Damage (Blade):</b></dt><dd>50 / 80 / 110 / 140 / 170 <span style="color:orange">(+ 100 / 110 / 120 / 130 / 140% AD)</span></dd>' +
      '<dt><b>Reduced Damage (Handle):</b></dt><dd>17.<small>5</small> / 28 / 38.<small>5</small> / 49 / 59.<small>5</small></dd>' +
      '</dl></div>';
    const rows = parseRenderedRows(html);
    expect(rows.map((r) => r.label)).toEqual([
      'Physical Damage (Blade)',
      'Reduced Damage (Handle)',
    ]);
    expect(rows[0]!.ratios).toEqual([[100, 110, 120, 130, 140]]);
  });
});

describe('gate 7 sums only what actually adds', () => {
  // REGRESSION, 2026-08-13 (DATA-SOURCES §36.3). Gate 7's own comment said "only `adds`
  // components are summed, since an alternative replaces rather than joins". It did not: the
  // ability-wide pairing step ran AFTER the sum, so a row destined to become `alternativeTo`
  // still had no relation set when gate 7 looked at it, and was added.
  //
  // Roster-wide that affected 12 of 51 failures and put the WRONG DIRECTION on four of them.
  // These two tests pin both halves: the alternative is excluded, and a genuine addition is
  // still included — because a fix that simply stopped summing things would also "pass" the
  // first test while destroying the gate.

  // Blade OR handle — one cast deals one of them, never both. 50 + 100 = 150 is the wrong
  // reading; the total the source states is the blade alone.
  const alternatives = `|champion = Darius
|skill = Q
|damagetype = Physical
|leveling = {{st|Physical Damage|{{ap|100 to 200}}}}
{{st|Reduced Damage|{{ap|50 to 100}}}}
{{st|Total Physical Damage|{{ap|100 to 200}}}}`;

  it('does not add an alternative to the component it replaces', () => {
    const draft = draftFromTemplate(
      { champion: 'Darius', slot: 'Q', ability: 'Decimate', wikitext: alternatives },
      '16.16.1',
      '2026-08-13',
    );
    // 100 (blade) reconciles against a stated total of 100. Summing the reduced arm as well
    // gives 150 and reports an over-sum that is not there.
    expect(draft.issues.filter((i) => i.kind === 'total-mismatch')).toEqual([]);
  });

  it('still reports a genuine under-sum, so the fix did not just stop summing', () => {
    const missingTerm = `|champion = Lux
|skill = Q
|damagetype = Magic
|leveling = {{st|Magic Damage|{{ap|80 to 240}}}}
{{st|Total Magic Damage|{{ap|160 to 480}}}}`;
    const draft = draftFromTemplate(
      { champion: 'Lux', slot: 'Q', ability: 'Light Binding', wikitext: missingTerm },
      '16.16.1',
      '2026-08-13',
    );
    const mismatch = draft.issues.filter((i) => i.kind === 'total-mismatch');
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]!.detail).toContain('missing');
  });
});

describe('the round-trip (gate 2)', () => {
  const template = `|champion = Lux
|skill = Q
|damagetype = Magic
|leveling = {{st|Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}}}`;

  it('passes when the stored scaling reproduces the wiki exactly', () => {
    const draft = draftFromTemplate(
      { champion: 'Lux', slot: 'Q', ability: 'Light Binding', wikitext: template },
      '16.16.1',
      '2026-08-12',
    );
    const r = roundTrip(draft, [
      { label: 'Magic Damage', values: [80, 120, 160, 200, 240], ratios: [[75]] },
    ]);
    expect(r.checkedRows).toBe(1);
    expect(r.matchedRows).toBe(1);
    expect(r.mismatches).toEqual([]);
  });

  it('names the exact rank that disagrees', () => {
    const draft = draftFromTemplate(
      { champion: 'Lux', slot: 'Q', ability: 'Light Binding', wikitext: template },
      '16.16.1',
      '2026-08-12',
    );
    const r = roundTrip(draft, [
      { label: 'Magic Damage', values: [80, 120, 999, 200, 240], ratios: [] },
    ]);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]!.detail).toContain('rank 3: wiki 999, stored 160');
  });

  it('reports a damage row the wiki rendered that we did not store', () => {
    const draft = draftFromTemplate(
      { champion: 'Lux', slot: 'Q', ability: 'Light Binding', wikitext: template },
      '16.16.1',
      '2026-08-12',
    );
    const r = roundTrip(draft, [
      { label: 'Magic Damage', values: [80, 120, 160, 200, 240], ratios: [] },
      { label: 'Total Magic Damage', values: [1, 2, 3, 4, 5], ratios: [] },
    ]);
    // Total rows are deliberately dropped, so this is expected — but it is REPORTED rather
    // than passed over, so a genuinely missed row cannot hide among them.
    expect(r.unmatchedRows).toEqual(['Total Magic Damage']);
  });
});

describe('what the harvester will and will not claim', () => {
  it("never marks its own output 'verified'", () => {
    // Verification is a gate outcome. A generator asserting it about itself would make the
    // whole status system worthless.
    const draft = draftFromTemplate(
      {
        champion: 'Lux',
        slot: 'Q',
        ability: 'Light Binding',
        wikitext: '|damagetype = Magic\n|leveling = {{st|Magic Damage|{{ap|80 to 240}}}}',
      },
      '16.16.1',
      '2026-08-12',
    );
    expect(draft.entry.verification).toBe('derived');
  });

  it("marks an ability 'incomplete' when a row could not be read", () => {
    const draft = draftFromTemplate(
      {
        champion: 'Test',
        slot: 'Q',
        ability: 'X',
        wikitext:
          '|damagetype = Magic\n|leveling = {{st|Magic Damage|{{as|(+ 30% of the shield remaining)}}}}',
      },
      '16.16.1',
      '2026-08-12',
    );
    expect(draft.entry.verification).toBe('incomplete');
    expect(draft.issues.length).toBeGreaterThan(0);
  });

  it('flags a prose-only ability for the hand-authored worklist', () => {
    const draft = draftFromTemplate(
      { champion: 'Vayne', slot: 'W', ability: 'Silver Bolts', wikitext: '|damagetype = True' },
      '16.16.1',
      '2026-08-12',
    );
    expect(draft.needsHandAuthoring).toBe(true);
    expect(draft.entry.components).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gate 2 for level-scaled values (DATA-SOURCES §25).
// ---------------------------------------------------------------------------

describe('roundTripLevelScaled', () => {
  const ZIGGS = `
|description  = deal {{as|{{pp|16+4*x for 6; then +8*x for 6; then +12*x for 8}}|magic damage}} {{as|(+ 50% AP)}} {{as|'''bonus''' magic damage}}.
|damagetype   = Magic
`;
  const draft = () =>
    draftFromTemplate(
      { champion: 'Ziggs', slot: 'P', ability: 'Short Fuse', wikitext: ZIGGS, maxRank: 1 },
      '16.16.1',
      '2026-08-13',
    );

  it('records the source block behind a level-scaled component', () => {
    const d = draft();
    expect(d.levelSources).toHaveLength(1);
    expect(d.levelSources[0]!.name).toBe('pp');
    expect(d.levelSources[0]!.inner).toContain('16+4*x for 6');
  });

  it('confirms a component against the wiki expansion of the same block', () => {
    const wiki = [20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 100, 112, 124, 136, 148, 160, 172, 184];
    const r = roundTripLevelScaled(draft(), [wiki]);
    expect(r).toMatchObject({ checked: 1, matched: 1, unrenderable: 0 });
    expect(r.mismatches).toHaveLength(0);
  });

  it('accepts a wiki series longer than ours — levels 19 and 20 are not a disagreement', () => {
    // The module generates twenty values for a piecewise progression and displays eighteen;
    // {{pplevel}} runs its tooltip out to forty-one. Neither is our value being wrong.
    const wiki = [20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 100, 112, 124, 136, 148, 160, 999, 999];
    expect(roundTripLevelScaled(draft(), [wiki]).matched).toBe(1);
  });

  it('reports a real disagreement rather than absorbing it', () => {
    const wiki = [20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 100, 112, 124, 136, 148, 999];
    const r = roundTripLevelScaled(draft(), [wiki]);
    expect(r.matched).toBe(0);
    expect(r.mismatches[0]!.detail).toContain('level 18: wiki 999, stored 160');
  });

  it('counts a block the wiki would not expand as no evidence, NOT as a pass', () => {
    const r = roundTripLevelScaled(draft(), [null]);
    expect(r).toMatchObject({ checked: 0, matched: 0, unrenderable: 1 });
  });

  it('counts a series too short to cover our values as no evidence either', () => {
    const r = roundTripLevelScaled(draft(), [[20, 24, 28]]);
    expect(r).toMatchObject({ checked: 0, matched: 0, unrenderable: 1 });
  });
});
