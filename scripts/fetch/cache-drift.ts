// Measure how far the offline ability-wikitext cache has drifted from the live wiki.
//
// WHY THIS EXISTS. `build/proposed-curated/ability-wikitext.json` holds the raw wikitext of 937
// ability pages, fetched on a stated date. Every census, every detector and every source-sentence
// reading in this project runs against that file rather than the network. A stale cache does not
// announce itself: it looks exactly like a fresh one and silently ages every conclusion built on
// it. On 2026-08-15 a run noticed, incidentally, that Gangplank's Parrrley page was cached at
// revision 4015393 against a live 4051880. Nobody was checking systematically. This module does.
//
// WHAT IT IS NOT. It does not refresh the cache. `build/proposed-curated/` belongs to the harvest
// area (`scripts/extract/` + `build/proposed-curated/`) and this module writes nothing there. It
// MEASURES, and it writes its measurement inside scripts/fetch/state/.
//
// THE TWO PASSES.
//   Pass 1 asks the wiki for revision IDS ONLY for all 937 resolved page titles. That is cheap:
//     no page content crosses the network, so the whole roster costs ~24 requests.
//   Pass 2 fetches full wikitext for the MOVED pages only, and diffs it against what the cache
//     holds. It keeps the diff summary, never the new corpus — storing the new corpus would be
//     refreshing the cache in the wrong file, in a directory this area does not own.
//
// THE FINDING THAT MATTERS. A page moving is not by itself a problem. A page moving UNDER A
// READING A PERSON MADE is. `PER_TICK_READS` and `READ_POPULATION` each pin their conclusions to
// literal substrings of the cached wikitext (`verbatim`). If such a substring is no longer present
// in the live page, the reading rests on a sentence the wiki no longer says, and a person must
// read it again. `checkVerbatimSurvival` below is that check.
//
// COURTESY. Same User-Agent as the cache builder, same batch size, plus a pause between batches.
// This is a volunteer-run public wiki.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';
export const UA = 'LimitTest/0.1 (League of Legends damage calculator; https://limittest.site)';

/** Titles per API request. The wiki's anonymous limit is 50; the cache builder uses 40. */
export const BATCH_SIZE = 40;
/** Milliseconds to wait between batches. Courtesy, not correctness. */
export const BATCH_PAUSE_MS = 350;

export const CACHE_FILE = 'build/proposed-curated/ability-wikitext.json';
export const REPORT_FILE = 'scripts/fetch/state/cache-drift.json';

// ---------------------------------------------------------------------------------------------
// Shapes. NOTE: `CacheFile`/`CachedPage` are DEFINED in scripts/extract/page-cache.ts, which this
// area does not own and must not change. These are read-only mirrors of the fields this module
// reads. They deliberately do not restate the whole shape, so they cannot drift into a competing
// definition of it.
// ---------------------------------------------------------------------------------------------

export interface CachedPageView {
  requested: string;
  resolved: string;
  champion: string;
  slot: string;
  abilityName: string;
  revid: number;
  wikitext: string;
}

export interface CacheFileView {
  fetchedOn: string;
  requestedTitles: number;
  resolvedTitles: number;
  distinctPages: number;
  pages: CachedPageView[];
}

/** One page's live revision, as pass 1 saw it. */
export interface LiveRevision {
  revid: number;
  timestamp: string;
  comment: string;
  user: string;
}

export type DriftStatus =
  /** Live revision id equals the cached one. The cached wikitext is byte-current. */
  | 'unchanged'
  /** Live revision id differs. The page has been edited since the cache was taken. */
  | 'moved'
  /** The wiki no longer returns this title at all — deleted, or renamed without a redirect. */
  | 'vanished';

export interface DriftRow {
  /** `champion/slot/abilityName` — the key PER_TICK_READS and READ_POPULATION use. */
  key: string;
  champion: string;
  slot: string;
  abilityName: string;
  resolved: string;
  cachedRevid: number;
  liveRevid: number | null;
  status: DriftStatus;
  /** Present only when the page moved: when, and what the editor said they did. */
  editedOn?: string;
  editComment?: string;
  editedBy?: string;
}

// ---------------------------------------------------------------------------------------------
// Pure functions. No network. Every one of these is unit-tested in cache-drift.test.ts.
// ---------------------------------------------------------------------------------------------

/** `champion/slot/abilityName`, the key both read tables are indexed by. */
export function pageKey(p: {
  champion: string;
  slot: string;
  abilityName: string;
}): string {
  return `${p.champion}/${p.slot}/${p.abilityName}`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * DEFINITION OF DRIFT, in one function so there is exactly one of it.
 *
 * A page is `unchanged` when the live revision id EQUALS the cached one. Revision ids are
 * MediaWiki's own monotonic edit counter: equal ids mean the stored wikitext is byte-for-byte what
 * the wiki serves today. `moved` means any edit at all landed on the page — including a typo fix
 * that changes no number. `vanished` means the wiki returned no revision for the title.
 *
 * This is deliberately the strictest available definition. It over-reports rather than under-
 * reports, because the failure being guarded against is a stale reading that nobody notices.
 */
export function classifyDrift(cachedRevid: number, liveRevid: number | null): DriftStatus {
  if (liveRevid === null) return 'vanished';
  return liveRevid === cachedRevid ? 'unchanged' : 'moved';
}

export function buildDriftRows(
  pages: readonly CachedPageView[],
  live: ReadonlyMap<string, LiveRevision>,
): DriftRow[] {
  return pages.map((p) => {
    const hit = live.get(p.resolved);
    const status = classifyDrift(p.revid, hit ? hit.revid : null);
    const row: DriftRow = {
      key: pageKey(p),
      champion: p.champion,
      slot: p.slot,
      abilityName: p.abilityName,
      resolved: p.resolved,
      cachedRevid: p.revid,
      liveRevid: hit ? hit.revid : null,
      status,
    };
    if (status === 'moved' && hit) {
      row.editedOn = hit.timestamp;
      row.editComment = hit.comment;
      row.editedBy = hit.user;
    }
    return row;
  });
}

export interface DriftSummary {
  total: number;
  unchanged: number;
  moved: number;
  vanished: number;
}

export function summariseDrift(rows: readonly DriftRow[]): DriftSummary {
  return {
    total: rows.length,
    unchanged: rows.filter((r) => r.status === 'unchanged').length,
    moved: rows.filter((r) => r.status === 'moved').length,
    vanished: rows.filter((r) => r.status === 'vanished').length,
  };
}

/**
 * Parse the API's `action=query&prop=revisions&rvprop=ids|timestamp|comment|user` reply.
 *
 * Keyed by the title the wiki RESOLVED to, because that is what the cache stores in `resolved` and
 * what the caller asked for. Missing pages are returned separately rather than dropped — a title
 * the wiki no longer knows is a finding, not an absence.
 */
export function parseRevisionsResponse(json: unknown): {
  found: Map<string, LiveRevision>;
  missing: string[];
} {
  const j = json as {
    query?: {
      pages?: Array<{
        title: string;
        missing?: boolean;
        revisions?: Array<{ revid: number; timestamp?: string; comment?: string; user?: string }>;
      }>;
      normalized?: Array<{ from: string; to: string }>;
      redirects?: Array<{ from: string; to: string }>;
    };
  };
  const found = new Map<string, LiveRevision>();
  const missing: string[] = [];
  // A title we asked for may have been normalised or redirected; record BOTH names so a lookup by
  // the requested name succeeds.
  const alias = new Map<string, string>();
  for (const n of j.query?.normalized ?? []) alias.set(n.from, n.to);
  for (const r of j.query?.redirects ?? []) alias.set(r.from, r.to);

  for (const p of j.query?.pages ?? []) {
    if (p.missing || !p.revisions?.[0]) {
      missing.push(p.title);
      continue;
    }
    const rev = p.revisions[0];
    found.set(p.title, {
      revid: rev.revid,
      timestamp: rev.timestamp ?? '',
      comment: rev.comment ?? '',
      user: rev.user ?? '',
    });
  }
  // Make aliased names resolve to the same revision.
  for (const [from, to] of alias) {
    const hit = found.get(to);
    if (hit) found.set(from, hit);
  }
  return { found, missing };
}

// ---------------------------------------------------------------------------------------------
// What actually changed on a moved page.
// ---------------------------------------------------------------------------------------------

export interface WikitextDiff {
  /** Lines present in the cache and not in the live page. */
  removed: string[];
  /** Lines present in the live page and not in the cache. */
  added: string[];
  /** True when the two texts are identical despite different revision ids (a null edit). */
  identical: boolean;
}

/**
 * A line-set difference, not a proper edit script. That is enough for what it is used for: saying
 * whether a moved page's change touched anything, and showing a person the lines involved so they
 * can judge. It deliberately does not try to pair lines up — a wrong pairing reads as a confident
 * claim about what an editor did, and this module makes no such claim.
 */
export function diffWikitext(cached: string, live: string): WikitextDiff {
  if (cached === live) return { removed: [], added: [], identical: true };
  const countLines = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const line of s.split('\n')) m.set(line, (m.get(line) ?? 0) + 1);
    return m;
  };
  const a = countLines(cached);
  const b = countLines(live);
  const removed: string[] = [];
  const added: string[] = [];
  for (const [line, n] of a) {
    const extra = n - (b.get(line) ?? 0);
    for (let i = 0; i < extra; i += 1) removed.push(line);
  }
  for (const [line, n] of b) {
    const extra = n - (a.get(line) ?? 0);
    for (let i = 0; i < extra; i += 1) added.push(line);
  }
  return { removed, added, identical: false };
}

/**
 * THE CHECK THIS MODULE EXISTS FOR.
 *
 * `PER_TICK_READS` and `READ_POPULATION` both pin a person's conclusion to `verbatim` strings —
 * literal substrings of the CACHED wikitext. A reading is only as good as the sentence it was read
 * from. So for each verbatim string, ask the only question that matters: is it still a substring of
 * the LIVE page?
 *
 * `survived` means the sentence the person read is still on the page, so the reading still rests on
 * something the wiki says. `lost` means it is not, and the reading must be made again by a person.
 * A `lost` result is never repaired mechanically here.
 */
export function checkVerbatimSurvival(
  liveWikitext: string,
  verbatim: readonly string[],
): { survived: string[]; lost: string[] } {
  const survived: string[] = [];
  const lost: string[] = [];
  for (const v of verbatim) (liveWikitext.includes(v) ? survived : lost).push(v);
  return { survived, lost };
}

/**
 * DOES THE DRIFT CHANGE A NUMBER, OR ONLY WORDS?
 *
 * A page moving is not automatically a moved damage figure. Nine of the eleven pages that moved on
 * 2026-08-15 changed prose, an icon filename, or a bug note. The only way to answer this without
 * guessing is to run the project's OWN extractor over both texts and compare what it produces.
 *
 * `extractionSignature` reduces an extracted entry to the facts a damage number depends on, in a
 * stable order, so two runs can be compared as strings. It deliberately EXCLUDES provenance
 * (revision id, fetch date), which always differs and would make every page look changed.
 */
export function extractionSignature(entry: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        // Provenance moves on every fetch and says nothing about the damage.
        if (k === 'sourceRevision' || k === 'fetched' || k === 'sourceUrl' || k === 'patch') continue;
        out[k] = stable(o[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(stable(entry));
}

export interface ExtractionImpact {
  key: string;
  /** True when the extractor produces exactly the same entry from both texts. */
  sameEntry: boolean;
  /** Top-level fields of the extracted entry whose value differs. */
  changedFields: string[];
  componentsBefore: number;
  componentsAfter: number;
  /** Set to a plain-English reason when the comparison could not be made at all. */
  notCompared?: string;
  /** How many numeric literals in the cached wikitext were mutated one at a time. */
  mutationsTried: number;
  /** How many of those mutations the comparison actually noticed. */
  mutationsDetected: number;
  /**
   * TRUE WHEN `sameEntry` PROVES NOTHING. A page the extractor reads no damage from cannot show a
   * changed damage figure however much its text moves, so "unchanged" on such a page is vacuous
   * and must not be counted as evidence. This field exists because a check that claims more than
   * it measures is a defect this project has already been bitten by (DATA-SOURCES §50).
   */
  checkIsVacuous: boolean;
}

/**
 * IS THE COMPARISON ABLE TO SEE A CHANGED NUMBER ON THIS PAGE AT ALL?
 *
 * Bumps every numeric literal in the wikitext by 7, one at a time, and counts how many of those
 * mutations produce a different extraction signature. A page that detects zero cannot support any
 * claim that its drift left the numbers alone — it can only support the weaker, still useful claim
 * that this project extracts no number from it.
 *
 * `extract` is injected so this stays a pure function with no dependency on the harvest area.
 */
export function measureExtractionSensitivity(
  wikitext: string,
  extract: (text: string) => unknown,
): { tried: number; detected: number } {
  let baseline: string;
  try {
    baseline = extractionSignature(extract(wikitext));
  } catch {
    return { tried: 0, detected: 0 };
  }
  const positions: number[] = [];
  const re = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) positions.push(m.index);

  let detected = 0;
  for (const idx of positions) {
    const digits = /^\d+/.exec(wikitext.slice(idx))![0];
    const mutated =
      wikitext.slice(0, idx) + String(Number(digits) + 7) + wikitext.slice(idx + digits.length);
    try {
      if (extractionSignature(extract(mutated)) !== baseline) detected += 1;
    } catch {
      // The extractor refusing the mutated text is itself a detection: the number mattered.
      detected += 1;
    }
  }
  return { tried: positions.length, detected };
}

/** Which moved pages carry a reading a person made. Set intersection, stated as a function. */
export function crossReferenceReadings(
  rows: readonly DriftRow[],
  readKeys: ReadonlySet<string>,
): DriftRow[] {
  return rows.filter((r) => r.status !== 'unchanged' && readKeys.has(r.key));
}

// ---------------------------------------------------------------------------------------------
// Patch boundary. A refresh across one is a different act, and must not happen by accident.
// ---------------------------------------------------------------------------------------------

export interface PatchCheck {
  pinnedPatch: string;
  livePatch: string;
  samePatch: boolean;
  /** Patch-notes article titles probed on the wiki, and whether each exists. */
  wikiPatchNotes: Array<{ title: string; exists: boolean }>;
}

/**
 * The cache and every stored figure in this project are stated against a patch. If Data Dragon's
 * newest version has moved past the pinned one, a refresh is no longer "the same pages, fresher" —
 * it is a different patch's numbers landing under conclusions written about the old one. The
 * caller STOPS in that case. It is a bigger finding than any number of stale pages.
 */
export function isPatchBoundaryCrossed(pinned: string, live: string): boolean {
  return pinned !== live;
}

// ---------------------------------------------------------------------------------------------
// Network. Separated from every function above so the transformation is testable offline.
// ---------------------------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function apiGet(params: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${WIKI_API}?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/** Pass 1: revision ids only, for every title given. No page content crosses the network. */
export async function fetchLiveRevisions(
  titles: readonly string[],
  fetchImpl: typeof fetch = fetch,
  onProgress?: (done: number, total: number) => void,
): Promise<{ live: Map<string, LiveRevision>; missing: string[]; failedBatches: string[][] }> {
  const live = new Map<string, LiveRevision>();
  const missing: string[] = [];
  const failedBatches: string[][] = [];
  const batches = chunk(titles, BATCH_SIZE);
  let done = 0;
  for (const batch of batches) {
    let parsed: { found: Map<string, LiveRevision>; missing: string[] } | undefined;
    for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
      try {
        const json = await apiGet(
          {
            action: 'query',
            redirects: '1',
            prop: 'revisions',
            titles: batch.join('|'),
            rvprop: 'ids|timestamp|comment|user',
            format: 'json',
            formatversion: '2',
          },
          fetchImpl,
        );
        parsed = parseRevisionsResponse(json);
      } catch {
        if (attempt === 0) await sleep(2000);
      }
    }
    if (!parsed) {
      // RECORDED, NOT SKIPPED. A batch that failed must not read as 937 pages measured.
      failedBatches.push([...batch]);
    } else {
      for (const [t, r] of parsed.found) live.set(t, r);
      missing.push(...parsed.missing);
    }
    done += batch.length;
    onProgress?.(done, titles.length);
    await sleep(BATCH_PAUSE_MS);
  }
  return { live, missing, failedBatches };
}

/** Pass 2: full wikitext, for the moved pages only. Held in memory, never written as a corpus. */
export async function fetchLiveWikitext(
  titles: readonly string[],
  fetchImpl: typeof fetch = fetch,
  onProgress?: (done: number, total: number) => void,
): Promise<{ text: Map<string, string>; failedBatches: string[][] }> {
  const text = new Map<string, string>();
  const failedBatches: string[][] = [];
  const batches = chunk(titles, BATCH_SIZE);
  let done = 0;
  for (const batch of batches) {
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      try {
        const json = (await apiGet(
          {
            action: 'query',
            redirects: '1',
            prop: 'revisions',
            titles: batch.join('|'),
            rvslots: 'main',
            rvprop: 'content|ids',
            format: 'json',
            formatversion: '2',
          },
          fetchImpl,
        )) as {
          query?: {
            pages?: Array<{
              title: string;
              missing?: boolean;
              revisions?: Array<{ slots: { main: { content: string } } }>;
            }>;
          };
        };
        for (const p of json.query?.pages ?? []) {
          const content = p.revisions?.[0]?.slots?.main?.content;
          if (!p.missing && typeof content === 'string') text.set(p.title, content);
        }
        ok = true;
      } catch {
        if (attempt === 0) await sleep(2000);
      }
    }
    if (!ok) failedBatches.push([...batch]);
    done += batch.length;
    onProgress?.(done, titles.length);
    await sleep(BATCH_PAUSE_MS);
  }
  return { text, failedBatches };
}

export async function fetchLivePatch(fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('https://ddragon.leagueoflegends.com/api/versions.json', {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching versions.json`);
  const versions = (await res.json()) as string[];
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('versions.json was empty');
  return versions[0]!;
}

export async function probeWikiPatchNotes(
  titles: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ title: string; exists: boolean }>> {
  const json = await apiGet(
    {
      action: 'query',
      prop: 'revisions',
      titles: titles.join('|'),
      rvprop: 'ids',
      format: 'json',
      formatversion: '2',
    },
    fetchImpl,
  );
  const { found } = parseRevisionsResponse(json);
  return titles.map((t) => ({ title: t, exists: found.has(t) }));
}

// ---------------------------------------------------------------------------------------------
// Report shape written to scripts/fetch/state/cache-drift.json.
// ---------------------------------------------------------------------------------------------

export interface ReadingImpact {
  key: string;
  /** Which read table the key belongs to. A key can be in both. */
  tables: string[];
  status: DriftStatus;
  cachedRevid: number;
  liveRevid: number | null;
  editedOn?: string;
  editComment?: string;
  verbatimChecked: number;
  verbatimSurvived: number;
  verbatimLost: string[];
  /** True when every sentence the person read is still on the live page. */
  readingStillRests: boolean;
}

export interface DriftReport {
  what: string;
  measuredOn: string;
  cacheFetchedOn: string;
  cacheFile: string;
  sourceUrl: string;
  patch: PatchCheck;
  definition: Record<string, string>;
  summary: DriftSummary;
  failedBatches: string[][];
  /** Titles pass 1 asked for and the wiki did not return. */
  missingTitles: string[];
  moved: DriftRow[];
  /** Moved pages whose live text is byte-identical to the cache (a null or reverted edit). */
  movedButTextIdentical: string[];
  /** Moved pages whose wikitext actually differs, with the changed lines. */
  movedWithTextChange: Array<{
    key: string;
    resolved: string;
    removed: string[];
    added: string[];
  }>;
  readingImpact: ReadingImpact[];
  /** For each moved page: does the project's own extractor produce a different entry? */
  extractionImpact: ExtractionImpact[];
}

export async function writeReport(report: DriftReport, path = REPORT_FILE): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 1)}\n`);
}

export async function readCacheView(path = CACHE_FILE): Promise<CacheFileView> {
  return JSON.parse(await readFile(path, 'utf8')) as CacheFileView;
}
