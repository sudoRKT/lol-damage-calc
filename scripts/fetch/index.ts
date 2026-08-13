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

import type { AbilitySlot, Provenance } from '../../src/types/data.ts';
import {
  assertOfficialWiki,
  highestChangesPatch,
  joinChampions,
  parseChampionModule,
} from './champions.ts';
import { filterItems, type RawItemMap } from './items.ts';
import {
  assertNoRedundantOverrides,
  assertNoStructuralOverrides,
  assertOverridesDocumented,
  buildOverrides,
} from './overrides.ts';
import { fetchPatchNotes } from './patch-notes.ts';
import { parseRunes, type RawRuneTree } from './runes.ts';
import {
  championPortraitUrl,
  ddragonChampionDetailUrl,
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
  data: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      image: { full: string };
      stats: Record<string, number>;
    }
  >;
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

  // 3a. THE SOURCE POLICY (DATA-SOURCES §3, §15). The wiki module is the default, but it
  //     is updated by hand and can sit a patch behind Data Dragon. The current patch's
  //     notes are the tie-break: a disagreement the notes confirm goes to Data Dragon; a
  //     disagreement nothing explains is applied but flagged `contested` rather than
  //     silently resolved. Overrides are derived fresh every run, so they retire
  //     themselves the moment the wiki catches up.
  const patchNotes = await fetchPatchNotes(patch, highest?.raw ?? null);
  console.log(
    patchNotes.found
      ? `patch notes ${patchNotes.title}: ${patchNotes.changes.length} documented stat changes`
      : `patch notes ${patchNotes.title}: NOT PUBLISHED YET — every source disagreement will be ` +
          `flagged contested rather than confirmed`,
  );

  const ddStats: Record<string, Record<string, number>> = {};
  for (const [apiname, entry] of Object.entries(ddChampions.data)) ddStats[apiname] = entry.stats;

  // Ability RANK COUNTS. The wiki does not state them — Module:Ability progression derives
  // 5-or-3 from the slot letter, the same assumption we made, and it is wrong for 21 abilities
  // (Udyr's four stances rank to 6; Jayce's two forms to 6; Karma, Nidalee and Elise have
  // 4-rank ultimates). Data Dragon's per-champion file states `maxrank` per spell, which is a
  // structural field, not one of the zero-filled damage fields (DATA-SOURCES §22).
  const SPELL_SLOTS: AbilitySlot[] = ['Q', 'W', 'E', 'R'];
  const maxRanks = new Map<string, Partial<Record<AbilitySlot, number>>>();
  for (const apiname of ddNames) {
    try {
      const detail = await fetchJson<{ data: Record<string, { spells: Array<{ maxrank: number }> }> }>(
        ddragonChampionDetailUrl(patch, apiname),
      );
      const spells = detail.data[apiname]?.spells ?? [];
      const byslot: Partial<Record<AbilitySlot, number>> = {};
      SPELL_SLOTS.forEach((slot, i) => {
        const r = spells[i]?.maxrank;
        if (typeof r === 'number' && r > 0) byslot[slot] = r;
      });
      maxRanks.set(apiname, byslot);
    } catch {
      // A missing detail file leaves the slot absent, which the harvester reports rather than
      // filling in with the old assumption.
      maxRanks.set(apiname, {});
    }
  }
  const oddRanks = [...maxRanks].filter(([, m]) =>
    (m.Q ?? 5) !== 5 || (m.W ?? 5) !== 5 || (m.E ?? 5) !== 5 || (m.R ?? 3) !== 3,
  );
  console.log(`ability rank counts: read from Data Dragon for ${maxRanks.size} champions; ${oddRanks.length} differ from the 5/5/5/3 assumption`);
  for (const [apiname, m] of oddRanks) console.log(`  ${apiname}: Q${m.Q ?? '-'} W${m.W ?? '-'} E${m.E ?? '-'} R${m.R ?? '-'}`);

  const { champions: resolvedWiki, overrides, contestedApinames } = buildOverrides(
    wikiChampions,
    ddStats,
    patchNotes.changes,
    patchNotes.found,
    patchNotes.url,
  );
  assertOverridesDocumented(overrides); // no override without a recorded reason and source
  assertNoRedundantOverrides(overrides); // no override whose two sources already agree
  assertNoStructuralOverrides(overrides); // attack-damage growth is never overridden

  const confirmedCount = overrides.filter((o) => o.status === 'confirmed').length;
  const contestedCount = overrides.length - confirmedCount;
  console.log(
    `source overrides: ${overrides.length} (${confirmedCount} confirmed by patch notes, ` +
      `${contestedCount} contested) across ${new Set(overrides.map((o) => o.apiname)).size} champions`,
  );
  for (const override of overrides.filter((o) => o.status === 'contested')) {
    console.log(
      `  CONTESTED ${override.championName} ${override.stat}: wiki ${override.wikiValue}, ` +
        `data dragon ${override.dataDragonValue} — using ${override.applied}, flagged to the user`,
    );
  }

  const championProvenance: Provenance = {
    source: 'League of Legends Wiki — Module:ChampionData/data (stats); Riot Data Dragon (art)',
    url: WIKI_CHAMPION_MODULE_URL,
    patch,
    fetched,
  };
  const { champions, withheld } = joinChampions(resolvedWiki, ddNames, championProvenance, maxRanks);
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
  // The override ledger is a sidecar rather than a field on Champion, because the Champion
  // shape in src/types/ is frozen and lead-owned. The interface joins it by apiname.
  await writeJson('overrides.json', overrides);
  files.push('overrides.json');
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
      statOverrides: overrides.length,
      statOverridesConfirmed: confirmedCount,
      statOverridesContested: contestedCount,
    },
    /**
     * Champions carrying at least one base statistic that Riot's own sources disagree
     * about. SPECIFICATION §8: any result involving one of these must show a visible note
     * that a base statistic is disputed, and must not be presented as verified. The
     * per-field detail, with evidence, is in overrides.json.
     */
    contestedChampions: contestedApinames,
    sourcePolicy: {
      summary:
        'Champion base stats come from the wiki module by default. Where Data Dragon disagrees ' +
        'and the current patch notes confirm Data Dragon, Data Dragon wins that field. Where ' +
        'nothing resolves the disagreement, Data Dragon is used and the champion is flagged ' +
        'contested. Attack-damage growth is never overridden — Data Dragon reports 0 for every ' +
        'champion in every patch.',
      patchNotes: { title: patchNotes.title, url: patchNotes.url, found: patchNotes.found },
      documentedIn: 'DATA-SOURCES.md §3 and §15',
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
      'Champion base stats and per-level growth come from the wiki module by default, EXCEPT where the current patch notes confirm a Data Dragon value the wiki has not caught up to. Attack-damage growth is always the wiki, never Data Dragon (it reads 0 there for every champion). DATA-SOURCES §3, §15.',
      'contestedChampions carry a base statistic Riot\'s own sources disagree about. Results involving them must show a visible note and must not be presented as verified. SPECIFICATION §8.',
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
