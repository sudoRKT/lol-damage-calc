// A local cache of every ability template's wikitext, so a census can be re-run offline.
//
// WHY THIS EXISTS. Every measurement in this project that touches the ability roster has had to
// re-fetch 937 pages over the network, which takes minutes and makes any iteration on a detector
// expensive. Worse, DATA-SOURCES records a scan that reported a confident population over 759 of
// 937 pages because its fetch errors were caught and skipped silently. This module makes the
// fetch a separate, audited step: it records what it asked for, what it got, and what failed,
// and a census that reads the cache can state its own coverage exactly.
//
// It writes only inside build/proposed-curated/ (a run artefact, git-ignored). It never writes
// /curated/ and never writes public/data/.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AbilitySlot, Champion } from '../../src/types/data.ts';
import { WIKI_API, wikiSlotAlias } from './harvest.ts';

const SLOTS: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];
const UA = 'lol-damage-calc (curated-file build; contact rushi.lime49@gmail.com)';

export const CACHE_DIR = 'build/proposed-curated';
export const CACHE_FILE = join(CACHE_DIR, 'ability-wikitext.json');

export interface CachedPage {
  /** The title we asked for. */
  requested: string;
  /** The title the wiki resolved it to after normalisation and redirects. */
  resolved: string;
  champion: string;
  slot: AbilitySlot;
  /** The ability name as champions.json lists it for this slot. */
  abilityName: string;
  revid: number;
  wikitext: string;
}

export interface CacheFile {
  what: string;
  fetchedOn: string;
  /** Every title requested, in order. */
  requestedTitles: number;
  /** Titles the wiki returned content for. */
  resolvedTitles: number;
  /** Titles the wiki reported as missing — a real result, not an error. */
  missingTitles: string[];
  /** Chunks whose HTTP request failed outright. NOT silently skipped. */
  failedChunks: Array<{ titles: string[]; error: string }>;
  /**
   * Distinct pages after alias dedupe by revision id. This is the 937 figure: 128 of the
   * non-first ability names redirect onto a page a first name already reaches (run-batch.ts's
   * alias guard), and counting those twice would double-count the roster.
   */
  distinctPages: number;
  pages: CachedPage[];
  /** Requested-title rows that were dropped as aliases of a page already held. */
  aliasesDropped: Array<{ requested: string; aliasOf: string }>;
}

interface Wanted {
  title: string;
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
}

/** Every ability page title the roster implies, built exactly as run-batch.ts builds them. */
export function wantedTitles(roster: Champion[]): Wanted[] {
  const out: Wanted[] = [];
  for (const champ of roster) {
    for (const slot of SLOTS) {
      const list = champ.abilityNames[slot] ?? [];
      list.forEach((abilityName, i) => {
        const title =
          i === 0
            ? `Template:Data ${champ.name}/${wikiSlotAlias(slot)}`
            : `Template:Data ${champ.name}/${abilityName}`;
        out.push({ title, champion: champ.name, slot, abilityName });
      });
    }
  }
  return out;
}

async function fetchChunk(
  chunk: Wanted[],
  fetchImpl: typeof fetch,
): Promise<{ byRequested: Map<string, { content: string; revid: number; resolved: string }>; missing: string[] }> {
  const url =
    `${WIKI_API}?` +
    new URLSearchParams({
      action: 'query',
      redirects: '1',
      prop: 'revisions',
      titles: chunk.map((c) => c.title).join('|'),
      rvslots: 'main',
      rvprop: 'content|ids',
      format: 'json',
      formatversion: '2',
    });
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      pages?: Array<{
        title: string;
        missing?: boolean;
        revisions?: Array<{ revid: number; slots: { main: { content: string } } }>;
      }>;
      normalized?: Array<{ from: string; to: string }>;
      redirects?: Array<{ from: string; to: string }>;
    };
  };
  const alias = new Map<string, string>();
  for (const n of json.query?.normalized ?? []) alias.set(n.from, n.to);
  for (const r of json.query?.redirects ?? []) alias.set(r.from, r.to);
  const byTitle = new Map(
    (json.query?.pages ?? [])
      .filter((p) => !p.missing && p.revisions?.[0])
      .map((p) => [
        p.title,
        { content: p.revisions![0]!.slots.main.content, revid: p.revisions![0]!.revid },
      ]),
  );
  const byRequested = new Map<string, { content: string; revid: number; resolved: string }>();
  const missing: string[] = [];
  for (const c of chunk) {
    let resolved = alias.get(c.title) ?? c.title;
    resolved = alias.get(resolved) ?? resolved;
    const hit = byTitle.get(resolved);
    if (hit) byRequested.set(c.title, { ...hit, resolved });
    else missing.push(c.title);
  }
  return { byRequested, missing };
}

export async function buildCache(fetchImpl: typeof fetch = fetch): Promise<CacheFile> {
  const roster = JSON.parse(await readFile('public/data/champions.json', 'utf8')) as Champion[];
  const wanted = wantedTitles(roster);

  const pages: CachedPage[] = [];
  const missingTitles: string[] = [];
  const failedChunks: CacheFile['failedChunks'] = [];
  const aliasesDropped: CacheFile['aliasesDropped'] = [];
  const seenRevision = new Map<number, string>();
  let resolvedTitles = 0;

  for (let i = 0; i < wanted.length; i += 40) {
    const chunk = wanted.slice(i, i + 40);
    let got;
    try {
      got = await fetchChunk(chunk, fetchImpl);
    } catch (e) {
      // RECORDED, NOT SKIPPED. One retry, then the chunk is reported as failed and the census
      // that reads this cache must say so rather than reporting a confident population.
      try {
        await new Promise((r) => setTimeout(r, 2000));
        got = await fetchChunk(chunk, fetchImpl);
      } catch (e2) {
        failedChunks.push({ titles: chunk.map((c) => c.title), error: String(e2) });
        continue;
      }
    }
    missingTitles.push(...got.missing);
    for (const c of chunk) {
      const hit = got.byRequested.get(c.title);
      if (!hit) continue;
      resolvedTitles += 1;
      const already = seenRevision.get(hit.revid);
      if (already !== undefined) {
        aliasesDropped.push({ requested: c.title, aliasOf: already });
        continue;
      }
      seenRevision.set(hit.revid, c.title);
      pages.push({
        requested: c.title,
        resolved: hit.resolved,
        champion: c.champion,
        slot: c.slot,
        abilityName: c.abilityName,
        revid: hit.revid,
        wikitext: hit.content,
      });
    }
    process.stderr.write(
      `\r  fetched ${Math.min(i + 40, wanted.length)}/${wanted.length} titles, ${pages.length} distinct pages`,
    );
  }
  process.stderr.write('\n');

  return {
    what:
      'Raw wikitext of every League wiki ability template the roster implies, cached so a census ' +
      'can be re-run without re-fetching. Alias-deduped by revision id. Records its own failures.',
    fetchedOn: new Date().toISOString().slice(0, 10),
    requestedTitles: wanted.length,
    resolvedTitles,
    missingTitles,
    failedChunks,
    distinctPages: pages.length,
    pages,
    aliasesDropped,
  };
}

export async function readCache(): Promise<CacheFile> {
  return JSON.parse(await readFile(CACHE_FILE, 'utf8')) as CacheFile;
}

if (process.argv[1]?.endsWith('page-cache.ts')) {
  const cache = await buildCache();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`);
  console.log(
    `\nrequested ${cache.requestedTitles} titles; ${cache.resolvedTitles} resolved; ` +
      `${cache.missingTitles.length} missing; ${cache.failedChunks.length} chunk(s) FAILED; ` +
      `${cache.aliasesDropped.length} alias rows dropped; ${cache.distinctPages} distinct pages cached`,
  );
  if (cache.failedChunks.length > 0) {
    console.log('!!! the cache is INCOMPLETE. Failed chunks:');
    for (const f of cache.failedChunks) console.log(`  ${f.error}: ${f.titles.length} titles`);
  }
}
