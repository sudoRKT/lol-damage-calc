// Measuring how many defender controls one scenario actually needs.
//   node scripts/fetch/defenders.ts
//
// It reads two files it does not own and writes one it does:
//
//   READ   build/proposed-curated/defensive-census.json   (DATA-SOURCES §40, another area's output)
//   READ   build/proposed-curated/ability-wikitext.json   (the cached page text, same area)
//   READ   public/data/champions.json                     (the roster this pipeline produced)
//   WRITE  public/data/defender-toggles.json
//
// It fetches nothing. Both census files are re-derivable from the wiki by the area that owns
// them; this run records their `generatedOn` stamps so a stale input is visible rather than
// silently absorbed.
//
// Everything printed is an observed number, so the run is the report.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Champion } from '../../src/types/data.ts';
import {
  allyMentionCandidates,
  isToggle,
  measureDefenderToggles,
  type CensusEntry,
} from './defender-toggles.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'public', 'data');

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n');
}

interface CensusFile {
  generatedOn?: string;
  coverage?: unknown;
  population?: { abilityPages?: number; confirmedPages?: number };
  entries: CensusEntry[];
}

interface WikitextFile {
  fetchedOn?: string;
  pages: { champion: string; slot: string; abilityName: string; wikitext: string }[];
}

export async function run(): Promise<void> {
  const census = await readJson<CensusFile>(
    join(ROOT, 'build', 'proposed-curated', 'defensive-census.json'),
  );
  const wikitext = await readJson<WikitextFile>(
    join(ROOT, 'build', 'proposed-curated', 'ability-wikitext.json'),
  );
  const champions = await readJson<Champion[]>(join(OUT_DIR, 'champions.json'));
  const roster = champions.map((c) => c.name);
  const patch = champions[0]?.provenance.patch ?? 'unknown';

  const measurement = measureDefenderToggles(roster, census.entries);
  measurement.acrossTheWholeRoster.abilityPages = census.population?.abilityPages ?? 0;

  console.log(
    table([
      ['roster (public/data/champions.json)', `${roster.length} champions, patch ${patch}`],
      ['defensive census entries', census.entries.length],
      ['  conditional', measurement.acrossTheWholeRoster.conditional],
      ['  always-active', measurement.acrossTheWholeRoster.alwaysActive],
      ['  not-stated', measurement.acrossTheWholeRoster.notStated],
      ['TOGGLES across the whole roster', measurement.acrossTheWholeRoster.togglesUnderThisDefinition],
    ]),
  );

  const d = measurement.perChampionByAbility;
  console.log('\n--- THE QUESTION THAT MATTERS: ONE SCENARIO HAS ONE DEFENDER ---');
  console.log(
    table([
      ['champions measured (every one, including those with none)', d.champions],
      ['minimum toggles for one champion', d.min],
      ['median', d.median],
      ['mean', d.mean],
      ['MAXIMUM', d.max],
      ['champions with no conditional defensive effect at all', d.withNone],
      ['worst case', d.worstCase.join(', ')],
    ]),
  );
  console.log('\n  how many champions have exactly N toggles:');
  console.log(
    table(
      Object.entries(d.histogram).map(([n, c]) => [`  ${n} toggle${n === '1' ? '' : 's'}`, c]),
    ),
  );

  const k = measurement.perChampionByKind;
  console.log(
    '\n  counting one control per KIND instead of per ability, for comparison: ' +
      `min ${k.min}, median ${k.median}, max ${k.max} (${k.worstCase.join(', ')})`,
  );

  // The candidate count that is reported and never applied.
  const textByKey = new Map(
    wikitext.pages.map((p) => [`${p.champion}/${p.slot}/${p.abilityName}`, p.wikitext]),
  );
  const ally = allyMentionCandidates(census.entries, (key) => textByKey.get(key));
  const allyByChampion: Record<string, number> = {};
  for (const key of ally.candidates) {
    const champion = key.split('/')[0]!;
    allyByChampion[champion] = (allyByChampion[champion] ?? 0) + 1;
  }
  console.log('\n--- A CANDIDATE COUNT, REPORTED AND NOT APPLIED ---');
  console.log(
    table([
      ['toggles whose page mentions an ALLY anywhere', ally.candidates.length],
      ['  of the toggles measured above', measurement.acrossTheWholeRoster.togglesUnderThisDefinition],
      ['  entries with no cached page text (a join failure would show here)', ally.noTextFound.length],
    ]),
  );
  console.log(
    '  most affected: ' +
      Object.entries(allyByChampion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c, n]) => `${c} ${n}`)
        .join(', '),
  );

  const findings: string[] = [];
  if (measurement.notInRoster.length > 0) {
    findings.push(
      `${measurement.notInRoster.length} champions named in the defensive census are not in ` +
        `public/data/champions.json, so their effects were counted for nobody: ` +
        measurement.notInRoster.join(', '),
    );
  }
  if (ally.noTextFound.length > 0) {
    findings.push(
      `${ally.noTextFound.length} census entries had no cached wikitext, so the ally candidate ` +
        `count is measured over fewer pages than it claims.`,
    );
  }
  findings.push(
    `DATA-SOURCES §40.1 concludes "the defender panel needs on the order of 200 controls, not a ` +
      `handful". THE ROSTER-WIDE FIGURE IS RIGHT AND THE CONCLUSION DOES NOT FOLLOW: a scenario ` +
      `has one defender, and the maximum any single champion reaches is ` +
      `${d.max}, the median is ${d.median}, and ${d.withNone} of ${d.champions} champions have none.`,
  );
  console.log('\n--- FINDINGS ---');
  for (const f of findings) console.log('  * ' + f);

  const payload = {
    provenance: {
      source:
        'build/proposed-curated/defensive-census.json (DATA-SOURCES §40) joined to ' +
        'public/data/champions.json. No network fetch: both inputs are already-recorded ' +
        'measurements, and this file re-counts them per champion.',
      patch,
      fetched: new Date().toISOString(),
      inputs: {
        defensiveCensusGeneratedOn: census.generatedOn ?? 'not stated by the file',
        abilityWikitextFetchedOn: wikitext.fetchedOn ?? 'not stated by the file',
        rosterPatch: patch,
      },
    },
    whatThisIs:
      'A MEASUREMENT AND A PROPOSAL, not an interface. src/ui/ belongs to another area and ' +
      'nothing here draws anything. The measurement answers one question: with one champion ' +
      'chosen as the defender, how many controls does the panel have to show?',
    definitions: {
      toggle:
        'ONE TOGGLE IS ONE CONDITIONAL DEFENSIVE ABILITY OF THE CHOSEN DEFENDER. The unit is ' +
        'the ability rather than the kind, because Garen W states ONE condition and grants ' +
        'damage reduction, resistances and a shield together — a user answers one question. ' +
        'Always-active effects are not toggles (they resolve into the stat block). ' +
        "`not-stated` effects are not toggles either (they are refused, and a refusal is not a " +
        'control). Entries whose only kind is a bonus-maximum-health grant are excluded, as §40 ' +
        'excludes them, because they change the survival verdict rather than damage received.',
      populationMeasuredOver:
        'ALL 173 champions in the roster, including the ones with no defensive effect at all. ' +
        'Measuring only champions that appear in the census would describe the champions who ' +
        'have toggles, not the champions a user can pick, and would move the median.',
      upperBound:
        'The figures are a CEILING: a defender at level 18 with every ability ranked. An ' +
        'unranked ability is not a control, so a level-6 defender shows fewer. A panel has to ' +
        'be designed for the ceiling.',
      notMeasuredHere:
        'Item and rune defensive effects. DATA-SOURCES §37.2 counts 60 conditional ' +
        'damage-relevant item and rune effects, and none of them is in this figure. They are ' +
        'bounded by the six items a defender actually carries rather than by the 209-item pool, ' +
        'but NOBODY HAS MEASURED THAT and it is not measured here.',
    },
    measurement,
    allyCandidates: {
      whatThisIs:
        'REPORTED, NEVER APPLIED. A two-champion scenario has no ally, so an ability that only ' +
        'ever protects somebody else cannot change the defender\'s own survival. The census ' +
        'DOES NOT RECORD self-versus-ally, which is the finding. This counts the toggles whose ' +
        'page mentions an ally anywhere — a candidate list for someone to read, with a known ' +
        'over-fire: Braum E shields Braum and the allies behind him, and Nilah\'s ultimate heals ' +
        'her with it. No figure above is reduced by this number.',
      count: ally.candidates.length,
      ofToggles: measurement.acrossTheWholeRoster.togglesUnderThisDefinition,
      byChampion: allyByChampion,
      entries: ally.candidates,
    },
    findings,
    proposal: PROPOSAL,
    /** Every toggle, by champion, so a proposal can be checked against the real rows. */
    togglesByChampion: Object.fromEntries(
      roster
        .map((name) => [
          name,
          census.entries
            .filter((e) => e.champion === name && isToggle(e))
            .map((e) => ({ ability: e.key, kinds: e.kinds, statesAValue: e.valueSource ?? null })),
        ])
        .filter(([, list]) => (list as unknown[]).length > 0),
    ),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const text = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(join(OUT_DIR, 'defender-toggles.json'), text, 'utf8');
  console.log(`\nwrote public/data/defender-toggles.json (${(text.length / 1024).toFixed(0)} KiB)`);
}

/**
 * How a user configures a defender, argued from the measurement above.
 *
 * NOT AN INTERFACE. `src/ui/` belongs to another area. This is the reasoning, in terms of what a
 * user would see and do, for that area to build against or argue with.
 */
export const PROPOSAL = {
  theProblemIsNotWhatItLookedLike:
    'A control count of 210 across the roster and a control count of at most 4 for the champion ' +
    'actually selected are different design problems, and only the second one exists. 42 of 173 ' +
    'champions have no conditional defensive effect at all; the median champion has one; the ' +
    'worst case is four. Nothing here needs search, grouping, an accordion, a second screen or ' +
    'an "advanced" section — every one of those is machinery for a list that never gets long.',
  theControl: [
    'ONE ROW PER CONDITIONAL DEFENSIVE ABILITY, in the ability-slot order the user already knows ' +
      'from the game (P, Q, W, E, R) rather than grouped by kind. A row carries the ability icon ' +
      '(Data Dragon, per CLAUDE.md), the ability name, the condition IN THE SOURCE\'S OWN WORDS, ' +
      'and one on/off control.',
    'THE CONDITION IS THE LABEL. "Is Unbreakable Will active?" is a question a player can answer. ' +
      '"Damage reduction" is a category, and asking a user to classify their own champion\'s ' +
      'ability is asking them to do the census\'s job.',
    'NO NUMBER IS ENTERED BY HAND where the source states one. A shield that scales with rank and ' +
      'ability power is computed from the defender\'s already-configured level, ability ranks and ' +
      'items, so the control stays a checkbox and the value is shown beside it rather than typed.',
  ],
  theDefaultIsOff:
    'Every toggle starts off, and the reason is the same one that fixes the default hit count to ' +
    'the minimum (DATA-SOURCES §38): any other default asserts a defensive action the user never ' +
    'stated. A toggle silently on understates the damage the attacker deals, which is the exact ' +
    'failure mode this product exists to prevent — a plausible wrong number nobody can see is ' +
    'wrong. The result already reports the verdict twice for damage over time; it should say ' +
    'which toggles were on when it computed the one it shows.',
  theThreeStatesAreShownDIFFERENTLY: [
    'CONDITIONAL (up to 4 rows) — a real control the user answers.',
    'ALWAYS-ACTIVE (6 abilities across the whole roster: Fizz P, Amumu E, Aatrox E, Gwen P, ' +
      'Morgana P, Nasus P) — NOT a control. It resolves into the defender\'s stat block, and it ' +
      'belongs in the stat readout as a read-only line saying why the number differs from the ' +
      'champion\'s base figures. A user who cannot see it will think the engine is wrong.',
    'NOT-STATED (2 abilities: Xin Zhao R, Kayn P) — a DISABLED row that says the effect cannot be ' +
      'modelled and why, in the source\'s terms ("the condition is a distance"; "a location ' +
      'outside combat"). Never an unchecked box: an unchecked box says "you could turn this on", ' +
      'and this one can never be turned on. SPECIFICATION §8 requires the same distinction for ' +
      'abilities, between "not yet modelled" and "cannot be completed".',
  ],
  theEmptyStateIsExplicit:
    '42 of 173 champions have no conditional defensive effect. Those defenders show a single ' +
    'line saying so — "this champion\'s kit states no conditional defensive effect" — not a blank ' +
    'area. A blank area is indistinguishable from a panel that failed to load.',
  whatIsStillOpenAndBlocksThis: [
    'SELF VERSUS ALLY IS NOT RECORDED ANYWHERE. 62 of the 212 toggles sit on a page that ' +
      'mentions an ally. A two-champion scenario has no ally, so some of those cannot change the ' +
      'defender\'s own survival at all — and as things stand a Milio defender would be shown ' +
      'three controls that may do nothing. This has to be read before the panel ships, and it is ' +
      'a reading of sentences rather than a pattern, because Braum E protects Braum AND his ' +
      'allies while Milio E protects only the ally.',
    'ITEM AND RUNE DEFENSIVE EFFECTS ARE NOT IN THIS MEASUREMENT. §37.2 counts 60 conditional ' +
      'damage-relevant item and rune effects. A defender carries six items, so the per-scenario ' +
      'count is again small — but that is an expectation, not a measurement, and nobody has ' +
      'taken it.',
    'THE VALUES BEHIND THE TOGGLES ARE NOT EXTRACTED. §40.2 measures 103 of 218 as readable, 93 ' +
      'hard, 5 stated only by reference and 17 with no value at all. A toggle that turns on an ' +
      'effect whose size nothing knows is a control with no consequence.',
  ],
};

await run();
