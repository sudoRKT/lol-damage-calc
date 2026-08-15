// FETCH THE FULL SOURCE TEXT FOR THE RUNES BEING AUTHORED, and cache it in this area.
//
//   node scripts/extract/rune-source.ts
//
// WHY THIS EXISTS RATHER THAN READING THE CENSUS. `public/data/rune-census.json` stores an
// EXCERPT — a window around the damage anchor (`windowAround` in scripts/fetch/rune-census.ts) —
// and a window is enough to classify a rune and not enough to author its value. A qualifier
// outside the window ("and monsters", "40% effective for ranged", "including true damage") is
// exactly the kind of clause that changes what a number means, and this project has already been
// bitten by reading part of a row rather than all of it: a row that cannot be read in full is not
// stored in part (DATA-SOURCES §25).
//
// TWO SOURCES, BOTH KEPT WHOLE. Data Dragon's `runesReforged.json` longDesc, and the wiki's
// `Template:Rune data <Name>` — one page per rune, in the same {{as|…}} / {{pp|…}} markup this
// project already parses (DATA-SOURCES, rune census `theSecondSource`). Neither is edited here.
//
// IT WRITES ONLY `build/proposed-curated/rune-source-cache.json`, this area's own output. It does
// not touch public/data/, which belongs to the data pipeline.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'build', 'proposed-curated', 'rune-source-cache.json');

/**
 * The runes this pass fetches. Deliberately a NAMED LIST rather than "every damaging rune":
 * the population being authored is the one a person is reading, and it is written down here so
 * the fetch and the reading cannot drift apart.
 */
export const RUNES_TO_FETCH = [
  'Hail of Blades',
  'Cheap Shot',
  'Sudden Impact',
  'Grasp of the Undying',
  'Aftershock',
  'Scorch',
  'Bone Plating',
] as const;

const DDRAGON_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json';
const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';

interface DdragonRune {
  id: number;
  key: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}
interface DdragonTree {
  id: number;
  key: string;
  name: string;
  slots: Array<{ runes: DdragonRune[] }>;
}

async function main(): Promise<void> {
  const versions = (await (await fetch(DDRAGON_VERSIONS)).json()) as string[];
  const patch = versions[0]!;

  const trees = (await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/runesReforged.json`)
  ).json()) as DdragonTree[];

  const ddragon = new Map<string, { id: number; key: string; tree: string; slot: number; longDesc: string; shortDesc: string }>();
  for (const tree of trees) {
    for (const [slot, row] of tree.slots.entries()) {
      for (const rune of row.runes) {
        ddragon.set(rune.name, {
          id: rune.id,
          key: rune.key,
          tree: tree.name,
          slot,
          longDesc: rune.longDesc,
          shortDesc: rune.shortDesc,
        });
      }
    }
  }

  const titles = RUNES_TO_FETCH.map((n) => `Template:Rune data ${n}`).join('|');
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('titles', titles);
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('rvprop', 'content|ids');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const wikiResponse = (await (
    await fetch(url, { headers: { 'User-Agent': 'lol-damage-calc/0.1 (offline study; contact via repo)' } })
  ).json()) as {
    query: { pages: Array<{ title: string; missing?: boolean; revisions?: Array<{ revid: number; slots: { main: { content: string } } }> }> };
  };

  const wiki = new Map<string, { title: string; revid: number | null; wikitext: string | null }>();
  for (const page of wikiResponse.query.pages) {
    const name = page.title.replace(/^Template:Rune data /, '');
    wiki.set(name, {
      title: page.title,
      revid: page.revisions?.[0]?.revid ?? null,
      wikitext: page.revisions?.[0]?.slots.main.content ?? null,
    });
  }

  const missing = RUNES_TO_FETCH.filter((n) => !ddragon.has(n) || !wiki.get(n)?.wikitext);

  const out = {
    what:
      'FULL source text for the runes being authored, from BOTH sources, kept whole. The rune ' +
      'census stores an excerpt window; this stores the entire longDesc and the entire wiki ' +
      'template, because a qualifier outside the window changes what a number means.',
    fetchedOn: new Date().toISOString(),
    patch,
    sources: {
      ddragon: `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/runesReforged.json`,
      wiki: `${WIKI_API}?action=query&prop=revisions&titles=Template:Rune+data+<Name>`,
    },
    requested: RUNES_TO_FETCH,
    missing,
    runes: RUNES_TO_FETCH.map((name) => ({
      name,
      ddragon: ddragon.get(name) ?? null,
      wiki: wiki.get(name) ?? null,
    })),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`patch ${patch}: fetched ${RUNES_TO_FETCH.length} runes from two sources`);
  if (missing.length) console.log(`MISSING from at least one source: ${missing.join(', ')}`);
  console.log(`written: build/proposed-curated/rune-source-cache.json`);
}

if (process.argv[1]?.endsWith('rune-source.ts')) {
  await main();
}
