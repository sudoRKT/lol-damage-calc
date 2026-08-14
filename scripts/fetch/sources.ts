// Every URL this pipeline touches, in one place, plus the tiny fetch helper.
// Each URL and its trap is documented in DATA-SOURCES.md — the section is named on
// each entry. Nothing here is guessed; all six endpoints were fetched live.

/** Data Dragon patch list. First entry is the current patch (DATA-SOURCES §8). */
export const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';

/**
 * The champion module on the OFFICIAL Riot-run wiki. The `/en-us/` path segment is
 * mandatory — the bare `/api.php` 302-redirects to it. DATA-SOURCES §1 records why the
 * near-identical Fandom copy must never be used: it is eighteen months stale and has
 * wrong base stats. `assertOfficialWiki` in champions.ts is the runtime guard.
 */
export const WIKI_CHAMPION_MODULE_URL =
  'https://wiki.leagueoflegends.com/en-us/api.php' +
  '?action=query&prop=revisions&titles=Module:ChampionData/data' +
  '&rvslots=main&rvprop=content&format=json&formatversion=2';

export function ddragonChampionsUrl(patch: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`;
}

/** Per-champion detail file — the ONLY machine-readable statement of an ability's rank count.
 *  The wiki does not state it: Module:Ability progression derives 5-or-3 from the slot letter,
 *  which is the same assumption we were making and is wrong for 21 abilities (DATA-SOURCES §22). */
export function ddragonChampionDetailUrl(patch: string, apiname: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion/${apiname}.json`;
}

/**
 * The item module on the OFFICIAL wiki — the only place item EFFECT text exists in a
 * structured form. Data Dragon's item `description` is display HTML with the numbers baked
 * into a sentence; this module keys each item's effects as `pass` / `pass2` / `act`, which is
 * what `CuratedItemEffect.key` in the frozen contract is defined against.
 *
 * Same `/en-us/` rule as the champion module: the bare `/api.php` 302-redirects to it, and
 * the Fandom lookalike must never be used (DATA-SOURCES §1).
 */
export const WIKI_ITEM_MODULE_URL =
  'https://wiki.leagueoflegends.com/en-us/api.php' +
  '?action=query&prop=revisions&titles=Module:ItemData/data' +
  '&rvslots=main&rvprop=content&format=json&formatversion=2';

export function ddragonItemsUrl(patch: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`;
}

export function ddragonRunesUrl(patch: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/runesReforged.json`;
}

/** Absolute URL of an item icon, e.g. "3031.png" -> …/cdn/16.16.1/img/item/3031.png */
export function itemIconUrl(patch: string, imageFull: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${imageFull}`;
}

/** Absolute URL of a champion square portrait, e.g. Aatrox -> …/img/champion/Aatrox.png */
export function championPortraitUrl(patch: string, imageFull: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${imageFull}`;
}

/** Rune icons are served unversioned, under cdn/img/ rather than cdn/<patch>/img/. */
export function runeIconUrl(iconPath: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      // The wiki asks API clients to identify themselves.
      'user-agent': 'LimitTest/0.1 (League of Legends damage calculator; https://limittest.site)',
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`fetch failed: HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as T;
}

/** Pull the Lua source out of the MediaWiki JSON envelope (DATA-SOURCES §1). */
export function extractWikiContent(envelope: unknown): string {
  const page = (envelope as { query?: { pages?: unknown[] } })?.query?.pages?.[0] as
    | { revisions?: { slots?: { main?: { content?: string } } }[] }
    | undefined;
  const content = page?.revisions?.[0]?.slots?.main?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('wiki response did not contain revisions[0].slots.main.content');
  }
  return content;
}
