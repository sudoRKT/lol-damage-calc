// Builds public/data/ability-index.json — one roster entry per ABILITY, not per slot.
//
//   node scripts/fetch/roster-abilities.ts            resolve alias names live, then write
//   node scripts/fetch/roster-abilities.ts --offline  skip the live step; write no alias map
//
// It reads three files and writes one:
//
//   READ   build/proposed-curated/ability-wikitext.json  the alias-deduped page text (another
//                                                        area's output; 937 pages)
//   READ   curated/curated-data.json                     the protected override file — READ ONLY,
//                                                        never written by anything here
//   READ   public/data/champions.json                    the roster this pipeline produced
//   WRITE  public/data/ability-index.json
//
// THE ONE LIVE FETCH, and why it is worth making. `Module:ChampionData/data` lists 1,071 ability
// names for 937 actual pages: 134 of them are ALIASES that redirect ("Fishbones" → "Switcheroo!",
// "Blue Card" → "Pick a Card", "The Darkin Blade 2" → "The Darkin Blade"). A consumer enumerating
// names from champions.json therefore offers 134 abilities that do not exist. Which name redirects
// where is a fact only the wiki holds, so it is fetched rather than guessed from the spelling —
// "Big One" → "Missile Barrage" and "Sinister Steel" → "Voracity" have nothing in common with
// their targets. With `--offline` the alias map is EMPTY and the file says so; it is never
// approximated.
//
// Everything printed is an observed number, so the run is the report.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AbilitySlot } from '../../src/types/data.ts';
import {
  buildAbilityIndex,
  findChampionStatements,
  type CuratedEntry,
  type ResolvedAlias,
  type RosterChampion,
} from './ability-index.ts';
import {
  readProseRankStatement,
  readRankAxisStatement,
  readStatedRankCounts,
  type AbilityPage,
} from './rank-shape.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const OUT_FILE = join(OUT_DIR, 'ability-index.json');

const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';
const USER_AGENT = 'lol-damage-calc data pipeline (https://github.com/, contact via repo)';

/**
 * A cached page, plus the title the wiki actually resolved the request to.
 *
 * `resolved` is not decoration: for 7 of the 937 pages it differs from
 * `Template:Data <champion>/<abilityName>`, and reconstructing the title instead of reading it
 * loses them. Elise's ultimate is stored as "Spider Form" and lives at "Spider Form / Human Form";
 * all five of Nunu & Willump's pages live under "Nunu". Both cases were found by an alias failing
 * to resolve, not by inspection.
 */
type CachedPage = AbilityPage & { resolved?: string };

interface WikitextFile {
  fetchedOn?: string;
  pages: CachedPage[];
}
interface CuratedFileShape {
  patch: string;
  fetched: string;
  abilities: CuratedEntry[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n');
}

/**
 * Every name the roster lists that is not itself a page — the alias candidates.
 *
 * Derived by subtraction rather than by spelling: a name with no page of its own is an alias, and
 * the wiki is then asked what it redirects to.
 */
export function aliasCandidates(
  champions: RosterChampion[],
  pages: AbilityPage[],
): { champion: string; slot: AbilitySlot; name: string; title: string }[] {
  const have = new Set(pages.map((p) => `${p.champion}|${p.slot}|${p.abilityName}`));
  const out: { champion: string; slot: AbilitySlot; name: string; title: string }[] = [];
  for (const c of champions) {
    for (const [slot, names] of Object.entries(c.abilityNames) as [AbilitySlot, string[]][]) {
      for (const name of names) {
        if (have.has(`${c.name}|${slot}|${name}`)) continue;
        out.push({ champion: c.name, slot, name, title: `Template:Data ${c.name}/${name}` });
      }
    }
  }
  return out;
}

/**
 * Ask the wiki what each alias title redirects to.
 *
 * Twenty titles per request, which is what the API accepts without a bot flag. Redirect and
 * normalisation tables are applied in the order the API documents them: a title is normalised
 * first, then followed. A title with no page comes back `missing` and is recorded as such rather
 * than dropped — a name the champion module lists and the wiki has no template for is a finding.
 */
export async function resolveAliases(
  candidates: ReturnType<typeof aliasCandidates>,
  pages: CachedPage[],
): Promise<{ aliases: ResolvedAlias[]; revisionDrift: string[] }> {
  const nameOfTitle = new Map<string, { champion: string; abilityName: string }>();
  for (const p of pages) {
    const entry = { champion: p.champion, abilityName: p.abilityName };
    nameOfTitle.set(`Template:Data ${p.champion}/${p.abilityName}`, entry);
    if (p.resolved) nameOfTitle.set(p.resolved, entry);
  }
  const revisionByPage = new Map(
    pages.map((p) => [`${p.champion}|${p.abilityName}`, p.revid] as const),
  );

  const aliases: ResolvedAlias[] = [];
  const revisionDrift: string[] = [];
  for (let i = 0; i < candidates.length; i += 20) {
    const chunk = candidates.slice(i, i + 20);
    const url =
      `${WIKI_API}?action=query&redirects=1&prop=revisions&rvprop=ids&format=json` +
      `&formatversion=2&titles=${encodeURIComponent(chunk.map((c) => c.title).join('|'))}`;
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) throw new Error(`wiki API ${response.status} for chunk starting ${i}`);
    const body = (await response.json()) as {
      query: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages: { title: string; missing?: boolean; revisions?: { revid: number }[] }[];
      };
    };
    const normalized = new Map((body.query.normalized ?? []).map((n) => [n.from, n.to]));
    const redirects = new Map((body.query.redirects ?? []).map((r) => [r.from, r.to]));
    const pageByTitle = new Map(body.query.pages.map((p) => [p.title, p]));

    for (const candidate of chunk) {
      let title = normalized.get(candidate.title) ?? candidate.title;
      title = redirects.get(title) ?? title;
      const page = pageByTitle.get(title);
      if (!page || page.missing) {
        aliases.push({ ...candidate, resolvesTo: null });
        continue;
      }
      const target = nameOfTitle.get(title);
      const liveRevision = page.revisions?.[0]?.revid;
      if (!target) {
        // The redirect landed on a page the cached set does not hold under that title. Recorded
        // as unresolved rather than matched approximately.
        aliases.push({ ...candidate, resolvesTo: null, liveRevision });
        revisionDrift.push(
          `${candidate.champion}/${candidate.slot} "${candidate.name}" redirects to ` +
            `${title}, which is not a page in the cached set`,
        );
        continue;
      }
      const cachedRevision = revisionByPage.get(`${target.champion}|${target.abilityName}`);
      if (liveRevision !== undefined && cachedRevision !== undefined && liveRevision !== cachedRevision) {
        revisionDrift.push(
          `${target.champion} "${target.abilityName}": cached revision ${cachedRevision}, live ` +
            `revision ${liveRevision} — the page has been edited since the cache was taken`,
        );
      }
      aliases.push({ ...candidate, resolvesTo: target.abilityName, liveRevision });
    }
  }
  return { aliases, revisionDrift };
}

/**
 * Re-fetch, live, every page a rank statement was READ FROM, and check the statement still says
 * what the cache says it says.
 *
 * The cache is a snapshot: `ability-wikitext.json` was taken on 2026-08-13 and one page in the
 * roster (Gangplank's Parrrley) has been edited since. That does not matter for a page nothing was
 * read from, and it matters entirely for the 17 pages every per-ability rank count in this file
 * rests on. Two API calls buy the difference between "the source said this" and "the source said
 * this two days ago".
 *
 * It reports; it does not rewrite. A changed statement means someone must re-read the page.
 */
export async function verifyStatementPages(
  pages: CachedPage[],
  keys: { champion: string; abilityName: string }[],
): Promise<{ checked: number; identical: number; changed: string[]; drifted: string[] }> {
  const wanted = keys
    .map((k) => pages.find((p) => p.champion === k.champion && p.abilityName === k.abilityName))
    .filter((p): p is CachedPage => p !== undefined);
  const changed: string[] = [];
  const drifted: string[] = [];
  let identical = 0;

  const fingerprint = (text: string) =>
    JSON.stringify([
      readRankAxisStatement(text)?.followsAbility ?? null,
      readStatedRankCounts(text),
      readProseRankStatement(text).statedCount ?? null,
      readProseRankStatement(text).statedLevels ?? null,
      readProseRankStatement(text).cannotBeRanked ?? null,
    ]);

  for (let i = 0; i < wanted.length; i += 10) {
    const chunk = wanted.slice(i, i + 10);
    const titles = chunk.map((p) => p.resolved ?? `Template:Data ${p.champion}/${p.abilityName}`);
    const url =
      `${WIKI_API}?action=query&redirects=1&prop=revisions&rvslots=main&rvprop=content|ids` +
      `&format=json&formatversion=2&titles=${encodeURIComponent(titles.join('|'))}`;
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) throw new Error(`wiki API ${response.status} re-checking statement pages`);
    const body = (await response.json()) as {
      query: {
        pages: {
          title: string;
          missing?: boolean;
          revisions?: { revid: number; slots: { main: { content: string } } }[];
        }[];
      };
    };
    const byTitle = new Map(body.query.pages.map((p) => [p.title, p]));
    for (const [n, cached] of chunk.entries()) {
      const live = byTitle.get(titles[n]);
      const revision = live?.revisions?.[0];
      if (!live || live.missing || !revision) {
        changed.push(`${cached.champion} "${cached.abilityName}": the live wiki has no such page`);
        continue;
      }
      if (revision.revid !== cached.revid) {
        drifted.push(
          `${cached.champion} "${cached.abilityName}": cached revision ${cached.revid}, live ` +
            `${revision.revid}`,
        );
      }
      if (fingerprint(revision.slots.main.content) === fingerprint(cached.wikitext)) identical++;
      else
        changed.push(
          `${cached.champion} "${cached.abilityName}": the rank statement on the live page is not ` +
            `the one this file was built from — re-read it before trusting the count`,
        );
    }
  }
  return { checked: wanted.length, identical, changed, drifted };
}

export async function run(offline = false): Promise<void> {
  const wikitext = await readJson<WikitextFile>(
    join(ROOT, 'build', 'proposed-curated', 'ability-wikitext.json'),
  );
  const curated = await readJson<CuratedFileShape>(join(ROOT, 'curated', 'curated-data.json'));
  const champions = await readJson<RosterChampion[]>(join(OUT_DIR, 'champions.json'));
  const patch = (await readJson<{ patch: string }>(join(OUT_DIR, 'manifest.json'))).patch;

  const candidates = aliasCandidates(champions, wikitext.pages);
  let aliases: ResolvedAlias[] = [];
  let revisionDrift: string[] = [];
  let aliasNote: string;
  if (offline) {
    aliasNote =
      `NOT RESOLVED. This run was --offline, so the ${candidates.length} names that are not pages ` +
      `of their own are absent from the map rather than guessed.`;
  } else {
    const resolved = await resolveAliases(candidates, wikitext.pages);
    aliases = resolved.aliases;
    revisionDrift = resolved.revisionDrift;
    aliasNote =
      `Resolved live against the wiki on ${new Date().toISOString().slice(0, 10)}: each of the ` +
      `${candidates.length} names with no page of its own was requested with redirects followed.`;
  }

  const index = buildAbilityIndex({
    pages: wikitext.pages,
    champions,
    curated: curated.abilities,
    aliases,
  });

  // The pages any per-ability rank statement was read from — the ones a stale cache would corrupt.
  const statementPages = index.entries
    .filter(
      (e) =>
        e.rankAxis === 'follows' ||
        e.unlockLevels !== null ||
        e.reports.length > 0 ||
        e.ranksStatedBy.includes("template's own"),
    )
    .flatMap((e) => [
      { champion: e.champion, abilityName: e.abilityName },
      ...(e.followsAbility ? [{ champion: e.champion, abilityName: e.followsAbility.name }] : []),
    ]);
  const uniqueStatementPages = [
    ...new Map(statementPages.map((p) => [`${p.champion}|${p.abilityName}`, p])).values(),
  ];
  const statementCheck = offline
    ? null
    : await verifyStatementPages(wikitext.pages, uniqueStatementPages);
  if (statementCheck) {
    revisionDrift.push(...statementCheck.drifted.map((d) => d + ' (a page a rank count rests on)'));
  }

  console.log(
    table([
      ['cached wiki pages read', wikitext.pages.length],
      ['override-file ability entries read', curated.abilities.length],
      ['champions in the roster', champions.length],
      ['', ''],
      ['INDEX ENTRIES WRITTEN (champion + slot + ability name)', index.counts.entries],
      ['slots holding more than one ability', index.counts.slotsHoldingMoreThanOneAbility],
      ['  entries sitting in those slots', index.counts.entriesInSharedSlots],
      ['entries whose rank count is NOT the slot\'s', index.counts.entriesWhoseRankCountIsNotTheSlots],
      ['  of which follow another ability\'s rank', index.counts.entriesFollowingAnotherAbilitysRank],
      ['entries with unlock levels the source states', index.counts.entriesWithStatedUnlockLevels],
      ['alias names resolved onto an entry', index.counts.aliasNamesResolved],
      ['names the roster lists with no template at all', index.counts.namesWithNoTemplate],
      ['entries disagreeing with the override file', index.counts.entriesDisagreeingWithTheOverrideFile],
      ['entries carrying a report for a person', index.counts.entriesWithReports],
      [
        'champions whose slot maxima exceed 18 skill points',
        index.counts.championsWhoseSlotMaximaExceedSkillPoints,
      ],
    ]),
  );

  console.log('\n--- ENTRIES WHOSE RANK COUNT IS NOT THE SLOT\'S ---');
  for (const e of index.entries.filter(
    (x) => x.ranks !== null && x.slotMaxRank !== null && x.ranks !== x.slotMaxRank,
  )) {
    console.log(
      `  ${e.champion}/${e.slot} ${e.abilityName}: ${e.ranks} ranks, slot says ${e.slotMaxRank} ` +
        `— ${e.ranksStatedBy}`,
    );
  }

  if (statementCheck) {
    console.log(
      `\n--- THE PAGES THESE COUNTS REST ON, RE-FETCHED LIVE ---\n` +
        `  ${statementCheck.checked} pages re-fetched, ${statementCheck.identical} stating exactly ` +
        `what the cache says, ${statementCheck.changed.length} changed, ` +
        `${statementCheck.drifted.length} at a different revision`,
    );
    for (const c of statementCheck.changed) console.log('  * CHANGED: ' + c);
  }

  console.log('\n--- REPORTS (read, never applied) ---');
  for (const r of index.reports) console.log('  * ' + r);
  for (const d of revisionDrift) console.log('  * STALE CACHE: ' + d);

  const payload = {
    what:
      'One roster entry per ABILITY — champion, slot and ability name — because champion+slot is ' +
      'not unique: ' +
      `${index.counts.slotsHoldingMoreThanOneAbility} slots hold ` +
      `${index.counts.entriesInSharedSlots} abilities between them. Each entry carries the rank ` +
      'axis the source states, so a form sitting in another form\'s slot is not stored against ' +
      'that slot\'s rank count.',
    provenance: {
      source:
        'build/proposed-curated/ability-wikitext.json (the alias-deduped wiki templates, ' +
        'DATA-SOURCES §11) for every rank statement; public/data/champions.json for Data ' +
        "Dragon's per-slot maxrank (DATA-SOURCES §22); curated/curated-data.json read for " +
        'comparison only and never written. Alias names resolved live against the wiki API.',
      url: 'https://wiki.leagueoflegends.com/en-us/api.php',
      patch,
      fetched: new Date().toISOString(),
      inputs: {
        abilityWikitextFetchedOn: wikitext.fetchedOn ?? 'not stated by the file',
        curatedFileFetched: curated.fetched,
        curatedFilePatch: curated.patch,
        rosterPatch: patch,
      },
    },
    definitions: {
      key: 'champion|slot|abilityName. Verified unique over both source sets on 2026-08-15: 937 ' +
        'wiki pages and 919 override-file entries, zero collisions.',
      ranks:
        'How many ranks THIS ABILITY has, which is not always the slot\'s. Taken from the ' +
        'ability\'s own rank-axis sentence where it has one, else from a rank-count suffix that ' +
        'agrees with Data Dragon, else from Data Dragon\'s maxrank for the slot. A suffix that ' +
        'disagrees with Data Dragon and is corroborated by nothing is REPORTED and never stored ' +
        '— see rank-shape.ts for the two cases that rule exists for.',
      unlockLevels:
        'Champion levels at which each rank becomes available, ONLY where a source states them. ' +
        'Null means this file does not know — not that the ordinary schedule applies.',
      aliases:
        'Other names the wiki redirects onto this entry. ' + aliasNote,
      curated:
        'What the protected override file stores for the same ability, carried so a disagreement ' +
        'is visible. This pipeline never writes that file.',
      reports:
        'Findings for a person. Nothing in this file was written on the strength of one; a ' +
        'report means the value shown is the uncontested one and the contested reading was ' +
        'recorded rather than applied.',
    },
    counts: index.counts,
    championRankStatements: {
      what:
        'Sentences about how a CHAMPION ranks, read by a person and applied to nothing. They are ' +
        'why the seven champions above have no level curve, and each names the decision it is ' +
        'waiting on. `foundOnPage` false would mean the source no longer says it.',
      statements: findChampionStatements(wikitext.pages),
    },
    statementPagesRechecked: statementCheck
      ? {
          what:
            'Every page a rank statement was read from, re-fetched live and compared against the ' +
            'cached text this file was built from. A changed statement means the count must be ' +
            're-read, not that it was corrected here.',
          checked: statementCheck.checked,
          statingTheSameThing: statementCheck.identical,
          changed: statementCheck.changed,
        }
      : 'not performed: this run was --offline',
    reports: index.reports,
    revisionDrift,
    namesWithNoTemplate: index.namesWithNoTemplate,
    champions: index.champions,
    nameToKey: index.nameToKey,
    entries: index.entries,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`\nwrote ${OUT_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run(process.argv.includes('--offline'));
}
