// Champion search — the matching rule, kept away from the component so it can be tested
// against the real 173-champion roster without a DOM.
//
// SPECIFICATION §10 requires the pickers to be "searchable, keyboard-navigable, with
// autocomplete and filtering, since users perform these selections dozens of times per
// session across large lists". That makes the matching rule a correctness question, not a
// convenience: a user who types `kaisa` and is told there is no such champion has been lied
// to by punctuation.
//
// WHAT IS NORMALISED AWAY, and why each one is needed by a real roster entry:
//   • case            — nobody types `Cho'Gath`
//   • diacritics      — none in this roster today, but the rule costs nothing and the roster
//                       is refetched every patch
//   • apostrophes     — Kai'Sa, Cho'Gath, Vel'Koz, Kha'Zix, Rek'Sai, Kog'Maw, Bel'Veth, K'Sante
//   • spaces and `.`  — Lee Sin, Miss Fortune, Dr. Mundo, Xin Zhao, Aurelion Sol, Tahm Kench
//   • `&`             — Nunu & Willump
//
// THE API NAME IS SEARCHED TOO. Wukong's api name is `MonkeyKing`, LeBlanc's is `Leblanc`,
// Nunu & Willump's is `Nunu`. A player who types the name they have seen in a URL or a
// replay file finds the champion.
//
// RANKING IS DETERMINISTIC. Equal-scoring champions are ordered by display name, so the same
// query always produces the same list in the same order — a keyboard user's muscle memory
// depends on that, and so does any test written against it.

import type { Champion } from '../../types';

/** Lower-cased, de-accented, stripped of every character a player would not type. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** The champion's name split into words, each normalised — "Nunu & Willump" → nunu, willump. */
export function nameWords(champion: Champion): string[] {
  return champion.name
    .split(/[^A-Za-z0-9]+/)
    .map(normalize)
    .filter((w) => w.length > 0);
}

/** First letters of each word — "Miss Fortune" → `mf`, "Tahm Kench" → `tk`. */
export function initials(champion: Champion): string {
  return nameWords(champion)
    .map((w) => w[0]!)
    .join('');
}

/**
 * How well a champion matches a query. LOWER IS BETTER; `null` means no match at all.
 *
 * The five tiers, in order:
 *   0  the whole name, exactly            `garen` → Garen
 *   1  the name starts with the query     `gar` → Garen
 *   2  a word of the name starts with it  `sin` → Lee Sin, `fortune` → Miss Fortune
 *   3  the initials                       `mf` → Miss Fortune, `tk` → Tahm Kench
 *   4  anywhere in the name or api name   `onkey` → Wukong (api name MonkeyKing)
 */
export function matchScore(champion: Champion, normalizedQuery: string): number | null {
  if (normalizedQuery === '') return 0;

  const name = normalize(champion.name);
  const api = normalize(champion.apiname);

  if (name === normalizedQuery || api === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery) || api.startsWith(normalizedQuery)) return 1;
  if (nameWords(champion).some((w) => w.startsWith(normalizedQuery))) return 2;
  // Initials only for a genuinely multi-word name, and only for a short query: a one-letter
  // query would otherwise rank every champion as an initials match.
  const ini = initials(champion);
  if (ini.length > 1 && ini === normalizedQuery) return 3;
  if (name.includes(normalizedQuery) || api.includes(normalizedQuery)) return 4;
  return null;
}

/**
 * The champions matching a query, best first, ties broken alphabetically by display name.
 *
 * An empty query returns the WHOLE roster in alphabetical order. It never returns a truncated
 * list: a picker that silently drops champions past some cut-off is a picker that cannot be
 * trusted to contain the champion you are looking for.
 */
export function filterChampions(champions: readonly Champion[], query: string): Champion[] {
  const q = normalize(query);
  const scored: Array<{ champion: Champion; score: number }> = [];
  for (const champion of champions) {
    const score = matchScore(champion, q);
    if (score !== null) scored.push({ champion, score });
  }
  scored.sort((a, b) =>
    a.score !== b.score ? a.score - b.score : a.champion.name.localeCompare(b.champion.name),
  );
  return scored.map((s) => s.champion);
}
