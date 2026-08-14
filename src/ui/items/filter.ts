// Filtering the item pool by what a user types.
//
// IT REUSES THE PICKER'S `normalize` RATHER THAN REIMPLEMENTING IT. Two normalisers are two
// answers to "does `bork` match Bork?", and the champion picker's has already been reasoned
// about: accents stripped, case folded, punctuation dropped, so "Bilgewater Cutlass" is reachable
// as `bilgewater`, `cutlass` or `bilgewatercutlass`.
//
// The tiers are the same idea as `matchScore` next door, in the order a user expects: an exact
// name, then a prefix, then a word prefix, then anything containing the query. Ties break
// alphabetically so the list never reorders itself between keystrokes for no visible reason.

import type { Item } from '../../types';
import { normalize } from '../picker/filter';

/** Words of an item name, each normalised — "Bilgewater Cutlass" → bilgewater, cutlass. */
export function itemWords(item: Item): string[] {
  return item.name
    .split(/[^A-Za-z0-9]+/)
    .map(normalize)
    .filter((w) => w.length > 0);
}

/** How well an item matches. LOWER IS BETTER; `null` means no match at all. */
export function itemMatchScore(item: Item, normalizedQuery: string): number | null {
  if (normalizedQuery === '') return 0;
  const name = normalize(item.name);
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (itemWords(item).some((w) => w.startsWith(normalizedQuery))) return 2;
  if (name.includes(normalizedQuery)) return 3;
  return null;
}

/** The pool, narrowed and ordered. An empty query returns everything, alphabetically. */
export function filterItems(items: readonly Item[], query: string): Item[] {
  const q = normalize(query);
  const scored: Array<{ item: Item; score: number }> = [];
  for (const item of items) {
    const score = itemMatchScore(item, q);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) =>
    a.score !== b.score ? a.score - b.score : a.item.name.localeCompare(b.item.name),
  );
  return scored.map((s) => s.item);
}
