// The catalogue pass — a link that is perfectly well-formed but names things this patch
// no longer has. This is the one broken-link case the envelope, checksum and shape checks
// cannot catch, because such a link is not broken at all.

import { describe, it, expect } from 'vitest';
import { NAMED_SCENARIOS } from './fixtures';
import { resolveScenarioReferences, describeUnresolved, type ReferenceCatalogue } from './resolve';

const MAXIMAL = NAMED_SCENARIOS.find((s) => s.name === 'maximal')!.scenario;

/** A catalogue that knows everything in a given scenario, minus whatever is removed. */
function catalogueMissing(missing: {
  champions?: string[];
  items?: number[];
  runes?: number[];
  shards?: string[];
}): ReferenceCatalogue {
  return {
    hasChampion: (name) => !(missing.champions ?? []).includes(name),
    hasItem: (id) => !(missing.items ?? []).includes(id),
    hasRune: (id) => !(missing.runes ?? []).includes(id),
    hasShard: (id) => !(missing.shards ?? []).includes(id),
  };
}

describe('a scenario whose references all still exist resolves cleanly', () => {
  it('reports ok with an empty list', () => {
    const report = resolveScenarioReferences(MAXIMAL, catalogueMissing({}));
    expect(report).toStrictEqual({ ok: true, unresolved: [] });
    expect(describeUnresolved(report)).toBe(null);
  });

  it('every named scenario resolves against a catalogue that knows everything', () => {
    const known = catalogueMissing({});
    const failures = NAMED_SCENARIOS.filter(
      (s) => !resolveScenarioReferences(s.scenario, known).ok,
    ).map((s) => s.name);
    expect(failures).toStrictEqual([]);
  });
});

describe('a removed reference is named and counted, and the scenario is not repaired', () => {
  it('a removed item is reported with its exact position, and the item list is untouched', () => {
    const report = resolveScenarioReferences(MAXIMAL, catalogueMissing({ items: [3110] }));
    expect(report.ok).toBe(false);
    expect(report.unresolved).toStrictEqual([
      { kind: 'item', value: 3110, path: 'defender.items[2]' },
    ]);
    // The scenario itself is unchanged — nothing was dropped or substituted.
    expect(MAXIMAL.defender.items).toStrictEqual([3068, 3143, 3110, 3075, 3193, 3047]);
  });

  it('reports EVERY unresolved reference, not just the first', () => {
    const report = resolveScenarioReferences(
      MAXIMAL,
      catalogueMissing({ champions: ['Veigar'], items: [3157, 3068], runes: [8437], shards: ['health'] }),
    );
    expect(report.ok).toBe(false);
    expect(report.unresolved.map((r) => `${r.kind}:${r.value}`)).toStrictEqual([
      'champion:Veigar',
      'item:3157',
      'shard:health',
      'item:3068',
      'rune:8437',
      'shard:health',
      'shard:health',
    ]);
  });

  it('a removed keystone is caught, and "no keystone" is never mistaken for a removed one', () => {
    const withKeystone = resolveScenarioReferences(MAXIMAL, catalogueMissing({ runes: [8112] }));
    expect(withKeystone.unresolved).toStrictEqual([
      { kind: 'rune', value: 8112, path: 'attacker.runes.keystone' },
    ]);

    const nullKeystone = NAMED_SCENARIOS.find((s) => s.name === 'keystone-null')!.scenario;
    const report = resolveScenarioReferences(nullKeystone, {
      hasChampion: () => true,
      hasItem: () => true,
      hasRune: () => false, // nothing resolves, yet a null keystone must not be reported
      hasShard: () => true,
    });
    expect(report.unresolved.some((r) => r.path.endsWith('runes.keystone'))).toBe(false);
  });

  it('the sentence shown to a user names and counts what is missing and refuses the calculation', () => {
    const report = resolveScenarioReferences(MAXIMAL, catalogueMissing({ items: [3110] }));
    const message = describeUnresolved(report);
    expect(message).toBe(
      "This scenario was built on an earlier patch. It uses 1 item that no longer exists (3110). The scenario can't be calculated as shared.",
    );
  });

  it('the sentence pluralises and groups when several kinds are missing', () => {
    const report = resolveScenarioReferences(
      MAXIMAL,
      catalogueMissing({ items: [3157, 3089], champions: ['Ornn'] }),
    );
    expect(describeUnresolved(report)).toBe(
      "This scenario was built on an earlier patch. It uses 2 items that no longer exist (3157, 3089) and 1 champion that no longer exists (Ornn). The scenario can't be calculated as shared.",
    );
  });
});
