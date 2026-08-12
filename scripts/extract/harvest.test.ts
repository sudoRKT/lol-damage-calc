// Tests for the harvester's own decisions — rank counts, slot aliases, and the round-trip.

import { describe, expect, it } from 'vitest';

import { damageTypeOf, draftFromTemplate, maxRankFor, roundTrip, wikiSlotAlias } from './harvest.ts';
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
