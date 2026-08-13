// The catalogue pass: does a decoded scenario still refer to things that exist?
//
// Deliberately SEPARATE from decoding (FORMAT.md §5). Decoding depends only on the frozen
// types and is a fact about the link; resolution depends on the current patch's data and is
// a fact about today. A link shared three patches ago decodes perfectly and may still name
// an item that has since been removed.
//
// This never repairs a scenario. A missing item is not dropped and not substituted, because
// a five-item build calculated as though it were six produces a number that is wrong by
// about the value of an item and looks exactly as confident as a correct one.

import type { Scenario } from '../types/scenario';

/**
 * Whatever the app currently knows about. Passed in rather than imported so this module
 * depends on no other area's data files and can be tested on its own.
 */
export interface ReferenceCatalogue {
  hasChampion(apiname: string): boolean;
  hasItem(id: number): boolean;
  hasRune(id: number): boolean;
  hasShard(id: string): boolean;
}

export interface UnresolvedReference {
  kind: 'champion' | 'item' | 'rune' | 'shard';
  value: string | number;
  /** Where in the scenario it sits, e.g. `attacker.items[2]`. */
  path: string;
}

export interface ResolutionReport {
  /** True only when every reference in the scenario exists in the catalogue. */
  ok: boolean;
  /** EVERY unresolved reference, not just the first — so the message can count them. */
  unresolved: UnresolvedReference[];
}

export function resolveScenarioReferences(
  scenario: Scenario,
  catalogue: ReferenceCatalogue,
): ResolutionReport {
  const unresolved: UnresolvedReference[] = [];

  for (const side of ['attacker', 'defender'] as const) {
    const champion = scenario[side];

    if (!catalogue.hasChampion(champion.apiname)) {
      unresolved.push({ kind: 'champion', value: champion.apiname, path: `${side}.apiname` });
    }

    champion.items.forEach((id, i) => {
      if (!catalogue.hasItem(id)) {
        unresolved.push({ kind: 'item', value: id, path: `${side}.items[${i}]` });
      }
    });

    if (champion.runes.keystone !== null && !catalogue.hasRune(champion.runes.keystone)) {
      unresolved.push({ kind: 'rune', value: champion.runes.keystone, path: `${side}.runes.keystone` });
    }
    for (const tree of ['primary', 'secondary'] as const) {
      champion.runes[tree].forEach((id, i) => {
        if (!catalogue.hasRune(id)) {
          unresolved.push({ kind: 'rune', value: id, path: `${side}.runes.${tree}[${i}]` });
        }
      });
    }
    champion.runes.shards.forEach((id, i) => {
      if (!catalogue.hasShard(id)) {
        unresolved.push({ kind: 'shard', value: id, path: `${side}.runes.shards[${i}]` });
      }
    });
  }

  return { ok: unresolved.length === 0, unresolved };
}

/**
 * The sentence to show. Names what is missing and counts it, and says plainly that the
 * scenario cannot be calculated — rather than offering a number computed from a build the
 * sharer did not have.
 */
export function describeUnresolved(report: ResolutionReport): string | null {
  if (report.ok) return null;

  const counts = new Map<UnresolvedReference['kind'], (string | number)[]>();
  for (const reference of report.unresolved) {
    const list = counts.get(reference.kind) ?? [];
    list.push(reference.value);
    counts.set(reference.kind, list);
  }

  const plural: Record<UnresolvedReference['kind'], [string, string]> = {
    champion: ['champion', 'champions'],
    item: ['item', 'items'],
    rune: ['rune', 'runes'],
    shard: ['stat shard', 'stat shards'],
  };

  const phrases = [...counts.entries()].map(([kind, values]) => {
    const [one, many] = plural[kind];
    return `${values.length} ${values.length === 1 ? one : many} that no longer ${values.length === 1 ? 'exists' : 'exist'} (${values.join(', ')})`;
  });

  return (
    'This scenario was built on an earlier patch. It uses ' +
    phrases.join(' and ') +
    ". The scenario can't be calculated as shared."
  );
}
