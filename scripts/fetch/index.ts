// The data pipeline. Run with:  node scripts/fetch/index.ts
//
// Fetches the four live sources, applies the pure transforms in the sibling modules, and
// writes public/data/. It writes nothing anywhere else, and it never touches /curated/ —
// that directory is read-only and hand-authored (see curated/README.md).
//
// Everything it prints is an observed number, so the run itself is the report.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Provenance } from '../../src/types/data.ts';
import {
  assertOfficialWiki,
  highestChangesPatch,
  joinChampions,
  parseChampionModule,
} from './champions.ts';
import { filterItems, type RawItemMap } from './items.ts';
import { parseRunes, type RawRuneTree } from './runes.ts';
import {
  championPortraitUrl,
  ddragonChampionsUrl,
  ddragonItemsUrl,
  ddragonRunesUrl,
  extractWikiContent,
  fetchJson,
  itemIconUrl,
  runeIconUrl,
  VERSIONS_URL,
  WIKI_CHAMPION_MODULE_URL,
} from './sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'public', 'data');

async function writeJson(relativePath: string, value: unknown): Promise<number> {
  const target = join(OUT_DIR, relativePath);
  await mkdir(dirname(target), { recursive: true });
  const text = JSON.stringify(value, null, 2) + '\n';
  await writeFile(target, text, 'utf8');
  return Buffer.byteLength(text);
}

interface DataDragonChampionSummary {
  data: Record<string, { id: string; key: string; name: string; image: { full: string } }>;
}

export async function run(): Promise<void> {
  const fetched = new Date().toISOString();

  // 1. Patch. The user-facing patch always comes from versions.json — never from the
  //    realm file's `rune` field, which reads 7.23.1, the RETIRED rune system
  //    (DATA-SOURCES §8).
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0];
  if (!patch) throw new Error('versions.json returned an empty list');
  console.log(`patch (versions.json[0]): ${patch}`);

  // 2. Champion stats from the wiki module.
  const wikiEnvelope = await fetchJson<unknown>(WIKI_CHAMPION_MODULE_URL);
  const luaSource = extractWikiContent(wikiEnvelope);
  const wikiChampions = parseChampionModule(luaSource);
  const highest = highestChangesPatch(wikiChampions);
  console.log(
    `wiki module: ${luaSource.length} characters, ${wikiChampions.length} entries, ` +
      `highest "changes" patch ${highest?.raw ?? 'none'}`,
  );
  assertOfficialWiki(wikiChampions); // throws if we were served the stale Fandom copy
  console.log('wrong-wiki guard: passed');

  // 3. Data Dragon champion summary — the roster gate and the art source.
  const ddChampions = await fetchJson<DataDragonChampionSummary>(ddragonChampionsUrl(patch));
  const ddNames = new Set(Object.keys(ddChampions.data));
  console.log(`data dragon champion.json: ${ddNames.size} champions`);

  const championProvenance: Provenance = {
    source: 'League of Legends Wiki — Module:ChampionData/data (stats); Riot Data Dragon (art)',
    url: WIKI_CHAMPION_MODULE_URL,
    patch,
    fetched,
  };
  const { champions, withheld } = joinChampions(wikiChampions, ddNames, championProvenance);
  console.log(`champions kept: ${champions.length}; withheld: ${withheld.length}`);
  for (const entry of withheld) {
    console.log(`  withheld "${entry.wikiName}" — ${entry.reason}`);
  }

  // 4. Items.
  const rawItems = await fetchJson<{ data: RawItemMap }>(ddragonItemsUrl(patch));
  const itemProvenance: Provenance = {
    source: 'Riot Data Dragon — item.json',
    url: ddragonItemsUrl(patch),
    patch,
    fetched,
  };
  const { items, stages, deduplicated } = filterItems(rawItems.data, itemProvenance, (full) =>
    itemIconUrl(patch, full),
  );
  console.log(
    `items: ${stages.total} total -> ${stages.afterMap11} on map 11 -> ` +
      `${stages.afterPurchasable} purchasable -> ${stages.afterGoldPositive} costing gold -> ` +
      `${stages.afterIdCutoff} with id < 200000 -> ${stages.afterNameDedup} after name dedup`,
  );
  for (const dupe of deduplicated) {
    console.log(`  deduplicated "${dupe.name}": kept ${dupe.kept}, dropped ${dupe.dropped.join(', ')}`);
  }

  // 5. Runes.
  const rawRunes = await fetchJson<RawRuneTree[]>(ddragonRunesUrl(patch));
  const { runes, trees } = parseRunes(rawRunes, runeIconUrl);
  console.log(`runes: ${trees.length} trees, ${runes.length} runes`);

  // 6. Write. The per-champion split is regenerated from scratch each run so a champion
  //    removed upstream cannot linger as a stale file.
  await mkdir(OUT_DIR, { recursive: true });
  await rm(join(OUT_DIR, 'champions'), { recursive: true, force: true });

  const files: string[] = [];
  files.push('champions.json');
  await writeJson('champions.json', champions);
  await writeJson('items.json', items);
  files.push('items.json');
  await writeJson('runes.json', { trees, runes });
  files.push('runes.json');
  for (const champion of champions) {
    const relative = `champions/${champion.apiname}.json`;
    await writeJson(relative, champion);
    files.push(relative);
  }

  const manifest = {
    patch,
    fetched,
    counts: {
      champions: champions.length,
      championsWithheld: withheld.length,
      items: items.length,
      runes: runes.length,
      runeTrees: trees.length,
    },
    files: [...files, 'manifest.json'],
    sources: {
      patch: VERSIONS_URL,
      championStats: WIKI_CHAMPION_MODULE_URL,
      championArt: ddragonChampionsUrl(patch),
      items: ddragonItemsUrl(patch),
      runes: ddragonRunesUrl(patch),
    },
    // Champion art is not part of the frozen Champion contract, so the interface builds
    // portrait URLs itself: <championPortraitBase>/<apiname>.png. Item and rune icons are
    // already absolute URLs inside their records.
    art: {
      championPortraitBase: championPortraitUrl(patch, '').replace(/\/$/, ''),
      championPortraitExample: championPortraitUrl(patch, 'Aatrox.png'),
    },
    itemFilter: {
      rule: 'maps["11"] === true AND gold.purchasable === true AND gold.total > 0 AND id < 200000, then dedupe by name keeping the lowest id',
      stages,
      deduplicated,
    },
    championsWithheld: withheld,
    wikiHighestChangesPatch: highest?.raw ?? null,
    notes: [
      'Champion base stats and per-level growth come from the wiki module, never from Data Dragon (attackdamageperlevel reads 0 there for every champion). DATA-SOURCES §3.',
      'The patch shown to users is versions.json[0]. The realm file rune field (7.23.1) is the retired rune system and is never displayed. DATA-SOURCES §8.',
      'Ability damage, item passive values, rune values and stat shards are NOT in these files — they are curated. DATA-SOURCES §9.',
    ],
  };
  const manifestBytes = await writeJson('manifest.json', manifest);

  console.log(`wrote ${files.length + 1} files to public/data (manifest ${manifestBytes} bytes)`);
}

// Only run when executed directly, so tests can import this module without firing the
// network requests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
