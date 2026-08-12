// The current patch's notes, read as raw wikitext — the evidence that decides which
// source wins for a champion stat in the days after a patch (DATA-SOURCES §3, §14.1).
//
// WHY THIS FILE EXISTS. The wiki's champion data module is updated by hand and can sit a
// patch behind, while Data Dragon ships with the patch. So for one window the two sources
// disagree and NEITHER is authoritative by default. The tie-break is Riot's own patch
// notes, which the wiki publishes as a separate article that IS current. Patch 26.16 is
// the worked example: the module still read magic resistance 30/1.3 for 28 marksmen while
// both the notes and Data Dragon said 33/1.1.
//
// Read as wikitext through api.php, never as a rendered page — DATA-SOURCES §13 records
// that rendered wiki values are extrapolated to level 20 and mixed with patch history.
//
// Everything here is pure except `fetchPatchNotes`. Tested by patch-notes.test.ts.

import { extractWikiContent, fetchJson } from './sources.ts';

/**
 * The champion stats a patch note can move. `ad_lvl` is deliberately ABSENT and must
 * never be added: Data Dragon reports attack-damage growth as 0 for every champion in
 * every patch, so it can never win that field no matter what a note says (DATA-SOURCES §3).
 */
export type OverridableStat =
  | 'hp_base'
  | 'hp_lvl'
  | 'arm_base'
  | 'arm_lvl'
  | 'mr_base'
  | 'mr_lvl'
  | 'ad_base'
  | 'as_base'
  | 'as_lvl'
  | 'range';

/** The structural exclusion above, named so a test can assert it stays excluded. */
export const NEVER_OVERRIDABLE = ['ad_lvl'] as const;

/** How each stat is worded in the notes. Order matters: longest phrase first, so
 *  "Base magic resistance" is matched before a hypothetical "Magic resistance". */
const STAT_PHRASES: { phrase: string; stat: OverridableStat }[] = [
  { phrase: 'base magic resistance', stat: 'mr_base' },
  { phrase: 'magic resistance growth', stat: 'mr_lvl' },
  { phrase: 'base health', stat: 'hp_base' },
  { phrase: 'health growth', stat: 'hp_lvl' },
  { phrase: 'base armor', stat: 'arm_base' },
  { phrase: 'armor growth', stat: 'arm_lvl' },
  { phrase: 'base attack damage', stat: 'ad_base' },
  { phrase: 'base attack speed', stat: 'as_base' },
  { phrase: 'attack speed growth', stat: 'as_lvl' },
  { phrase: 'attack range', stat: 'range' },
];

/** One stat change the notes state for one champion. */
export interface PatchStatChange {
  /** The champion name as the notes write it, e.g. "Miss Fortune", "Kai'Sa". */
  championName: string;
  stat: OverridableStat;
  /** The value the notes say the stat moved TO. */
  to: number;
  /** The value the notes say it moved FROM. */
  from: number;
  /** The literal note line, kept so an override can quote its own evidence. */
  line: string;
}

export interface PatchNotes {
  /** Wiki page title, e.g. "V26.16". */
  title: string;
  url: string;
  /** False when the wiki has not published the article for this patch yet. */
  found: boolean;
  changes: PatchStatChange[];
}

/**
 * Work out the wiki's article title for the patch Data Dragon is serving.
 *
 * The two number the same patch differently: Data Dragon calls it `16.16.1`, the wiki
 * calls it `V26.16`. The MINOR number agrees (16); only the major differs. Rather than
 * hard-code the offset, take the major from the wiki's own newest `changes` marker — the
 * module lags by a patch, not by a season, so its major is current even when its values
 * are not — and the minor from Data Dragon, which is always current.
 *
 * @param ddragonPatch e.g. "16.16.1"
 * @param wikiHighestChanges e.g. "V26.15" — the newest marker in the champion module
 */
export function patchNotesTitle(ddragonPatch: string, wikiHighestChanges: string | null): string | null {
  const minor = ddragonPatch.split('.')[1];
  const major = wikiHighestChanges?.match(/^V(\d+)\./)?.[1];
  if (!minor || !major) return null;
  return `V${major}.${minor}`;
}

export function patchNotesUrl(title: string): string {
  return (
    'https://wiki.leagueoflegends.com/en-us/api.php' +
    `?action=query&redirects=1&prop=revisions&titles=${encodeURIComponent(title)}` +
    '&rvslots=main&rvprop=content&format=json&formatversion=2'
  );
}

/** Strip the display templates the notes wrap numbers in: `{{fd|1.1}}` -> `1.1`. */
function unwrapTemplates(text: string): string {
  return text.replace(/\{\{[a-z]+\|([^{}|]*)\}\}/gi, '$1');
}

/**
 * Pull every champion stat change out of a patch article's wikitext.
 *
 * The article's per-champion sections look like:
 *
 *   ;{{ci|Ashe}}
 *   * Stats
 *   ** Base magic resistance increased to 33 from 30.
 *   ** Magic resistance growth reduced to {{fd|1.1}} from {{fd|1.3}}.
 *
 * Ability changes in the same section are ignored — this only reads base statistics.
 */
export function parsePatchNotes(wikitext: string): PatchStatChange[] {
  const changes: PatchStatChange[] = [];
  const sections = wikitext.matchAll(/;\{\{ci\|([^}|]+)\}\}([\s\S]*?)(?=\n;\{\{ci\||\n==|$)/g);

  for (const section of sections) {
    const championName = section[1]!.trim();
    const body = unwrapTemplates(section[2] ?? '');

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line.startsWith('*')) continue;

      const text = line.replace(/^\*+\s*/, '');
      const lower = text.toLowerCase();
      const matched = STAT_PHRASES.find((entry) => lower.startsWith(entry.phrase));
      if (!matched) continue;

      // "... increased to 33 from 30." / "... reduced to 1.1 from 1.3."
      // The number pattern must NOT be `[\d.]+`: that swallows the sentence's full stop,
      // so "from 1.3." parses as NaN and the change is silently dropped. Integers survived
      // it ("30." is still 30 to JavaScript) which made the bug look stat-specific.
      const values = text.match(
        /\b(?:increased|reduced|changed)\s+to\s+(-?\d+(?:\.\d+)?)\s+from\s+(-?\d+(?:\.\d+)?)/i,
      );
      if (!values) continue;

      const to = Number(values[1]);
      const from = Number(values[2]);
      if (!Number.isFinite(to) || !Number.isFinite(from)) continue;

      changes.push({ championName, stat: matched.stat, to, from, line: text });
    }
  }
  return changes;
}

/**
 * Fetch and parse the current patch's notes.
 *
 * A missing article is NOT an error. The wiki sometimes publishes the data before the
 * article. In that case this returns `found: false` with no changes, and the override
 * policy degrades safely: nothing can be confirmed, so every disagreement becomes
 * `contested` and is surfaced rather than silently resolved.
 */
export async function fetchPatchNotes(
  ddragonPatch: string,
  wikiHighestChanges: string | null,
): Promise<PatchNotes> {
  const title = patchNotesTitle(ddragonPatch, wikiHighestChanges);
  if (!title) {
    return { title: '(could not be determined)', url: '', found: false, changes: [] };
  }
  const url = patchNotesUrl(title);
  const envelope = await fetchJson<unknown>(url);
  const page = (envelope as { query?: { pages?: { missing?: boolean }[] } })?.query?.pages?.[0];
  if (!page || page.missing) {
    return { title, url, found: false, changes: [] };
  }
  return { title, url, found: true, changes: parsePatchNotes(extractWikiContent(envelope)) };
}
