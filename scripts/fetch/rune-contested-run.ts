// Are the six "contested" runes actually contested? — the live half.
//
// Run: node scripts/fetch/rune-contested-run.ts
//
// WHAT IT DOES, in order, and why each step is here rather than in a test:
//
//  1. Refuses to run at all if Data Dragon has moved past 16.16.1. Every stored figure in
//     this project is stated against that patch; a cross-patch comparison would be a
//     different measurement wearing the same name.
//  2. Re-checks every fixture string against the live source. A fixture that no longer
//     appears is reported as a failure, never quietly skipped — same rule as the census.
//  3. Runs the two roster-wide checks the six findings became:
//       · `dataDragonTypeLostByStripping` over all 62 Data Dragon descriptions
//       · `carriesLegacyAdaptiveTiebreak` over all 62 wiki rune templates
//     A finding is only worth having if it can be swept over everything else (CLAUDE.md).
//  4. Reads the Adaptive force article's exemption sentence rather than trusting the copy
//     in the fixtures.
//  5. Checks the current patch article, the §15 tie-break, for any mention of the six.
//  6. Classifies and writes public/data/rune-contested.json.
//
// It is courteous to the wiki: one named user agent, POST batches of 30 templates, and a
// pause between requests.

import { readFileSync, writeFileSync } from 'node:fs';

import {
  ADAPTIVE_FORCE_ARTICLE,
  DDRAGON_LONG_DESC,
  WIKI_TEMPLATE,
} from './fixtures/rune-contested.ts';
import { patchNotesTitle } from './patch-notes.ts';
import {
  adaptiveForceTiebreakFromArticle,
  carriesLegacyAdaptiveTiebreak,
  carriesVariableDamageBlock,
  classifyDisagreement,
  dataDragonTypeFromMarkup,
  dataDragonTypeLostByStripping,
  runesExemptFromAdaptiveDamageFormula,
  type ContestFinding,
} from './rune-contested.ts';
import { OUTCOME, SIX } from './rune-contested-findings.ts';
import { VERSIONS_URL, ddragonRunesUrl, fetchJson } from './sources.ts';

/** The patch every stored figure in this project is stated against (DATA-SOURCES §8). */
const PINNED_PATCH = '16.16.1';

const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';
const USER_AGENT = 'LimitTest/0.1 (League of Legends damage calculator; https://limittest.site)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Data Dragon spells one rune differently from the wiki (DATA-SOURCES, rune census). */
const WIKI_TITLE_OVERRIDE: Record<string, string> = { 'Jack Of All Trades': 'Jack of All Trades' };

interface DdragonRune {
  id: number;
  name: string;
  longDesc: string;
}
interface DdragonTree {
  name: string;
  slots: { runes: DdragonRune[] }[];
}
interface WikiPage {
  title: string;
  missing?: boolean;
  revisions?: { timestamp: string; slots: { main: { content: string } } }[];
}

const failures: { what: string; detail: string }[] = [];

async function wikiGet(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const response = await fetch(`${WIKI_API}?${query}`, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchTemplates(titles: string[]): Promise<Map<string, { text: string; lastEdited: string } | null>> {
  const out = new Map<string, { text: string; lastEdited: string } | null>();
  for (let i = 0; i < titles.length; i += 30) {
    const batch = titles.slice(i, i + 30);
    const body = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      titles: batch.join('|'),
      rvslots: 'main',
      rvprop: 'content|timestamp',
      format: 'json',
      formatversion: '2',
    });
    const response = await fetch(WIKI_API, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      failures.push({ what: `template batch "${batch[0]}"`, detail: `HTTP ${response.status}` });
      for (const title of batch) out.set(title, null);
      continue;
    }
    const payload = (await response.json()) as { query: { pages: WikiPage[] } };
    for (const page of payload.query.pages) {
      const revision = page.revisions?.[0];
      out.set(
        page.title,
        page.missing || !revision
          ? null
          : { text: revision.slots.main.content, lastEdited: revision.timestamp },
      );
      if (page.missing) failures.push({ what: page.title, detail: 'the wiki has no such page' });
    }
    await sleep(1200);
  }
  return out;
}

async function fetchArticle(title: string): Promise<{ text: string; lastEdited: string } | null> {
  const payload = (await wikiGet({
    action: 'query',
    redirects: '1',
    prop: 'revisions',
    titles: title,
    rvslots: 'main',
    rvprop: 'content|timestamp',
  })) as { query: { pages: WikiPage[] } };
  const page = payload.query.pages[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing || !revision) return null;
  return { text: revision.slots.main.content, lastEdited: revision.timestamp };
}

async function main(): Promise<void> {
  // ---- 1. the patch gate ------------------------------------------------------------------
  const versions = await fetchJson<string[]>(VERSIONS_URL);
  const patch = versions[0]!;
  if (patch !== PINNED_PATCH) {
    console.error(
      `STOP. Data Dragon is serving ${patch}, not ${PINNED_PATCH}. Every stored figure in this\n` +
        'project is stated against 16.16.1, so comparing the six against a newer patch would be a\n' +
        'different measurement. Re-pin deliberately or re-run the census first.',
    );
    process.exitCode = 1;
    return;
  }

  // ---- 2. Data Dragon, all 62 -------------------------------------------------------------
  const trees = await fetchJson<DdragonTree[]>(ddragonRunesUrl(patch));
  const runes: DdragonRune[] = [];
  for (const tree of trees) for (const slot of tree.slots) runes.push(...slot.runes);

  const strippingLosesType = runes
    .filter((rune) => dataDragonTypeLostByStripping(rune.longDesc))
    .map((rune) => ({ rune: rune.name, type: dataDragonTypeFromMarkup(rune.longDesc) }));
  const typeStatedInMarkup = runes
    .filter((rune) => dataDragonTypeFromMarkup(rune.longDesc) !== null)
    .map((rune) => rune.name);

  for (const [name, expected] of Object.entries(DDRAGON_LONG_DESC)) {
    const live = runes.find((rune) => rune.name === name);
    if (!live) failures.push({ what: `Data Dragon rune ${name}`, detail: 'not in the live file' });
    else if (live.longDesc !== expected) {
      failures.push({
        what: `Data Dragon longDesc for ${name}`,
        detail: 'the live text no longer matches the recorded fixture',
      });
    }
  }

  // ---- 3. the wiki, all 62 ----------------------------------------------------------------
  const titles = runes.map((rune) => `Template:Rune data ${WIKI_TITLE_OVERRIDE[rune.name] ?? rune.name}`);
  const templates = await fetchTemplates(titles);

  const legacyTiebreakCarriers: string[] = [];
  const variableDamageCarriers: string[] = [];
  runes.forEach((rune, index) => {
    const page = templates.get(titles[index]!);
    if (!page) return;
    if (carriesLegacyAdaptiveTiebreak(page.text)) legacyTiebreakCarriers.push(rune.name);
    if (carriesVariableDamageBlock(page.text)) variableDamageCarriers.push(rune.name);
  });

  for (const [name, excerpt] of Object.entries(WIKI_TEMPLATE)) {
    const page = templates.get(`Template:Rune data ${name}`);
    if (!page) failures.push({ what: `wiki template ${name}`, detail: 'not fetched' });
    else if (!page.text.includes(excerpt)) {
      failures.push({
        what: `wiki template ${name}`,
        detail: 'the recorded excerpt no longer appears in the live wikitext',
      });
    }
  }

  // ---- 4. the article that names its own exceptions ---------------------------------------
  await sleep(1200);
  const article = await fetchArticle('Adaptive force');
  const exempt = article ? runesExemptFromAdaptiveDamageFormula(article.text) : [];
  const articleTiebreak = article ? adaptiveForceTiebreakFromArticle(article.text) : null;
  if (!article) failures.push({ what: 'Adaptive force', detail: 'article not fetched' });
  else {
    for (const line of ADAPTIVE_FORCE_ARTICLE.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 40 && !article.text.includes(trimmed)) {
        failures.push({ what: 'Adaptive force', detail: `recorded line no longer present: ${trimmed.slice(0, 60)}…` });
      }
    }
  }

  // ---- 5. the patch-notes tie-break -------------------------------------------------------
  // The article title is derived, never hard-coded: minor from Data Dragon, major from the
  // wiki's own newest `changes` marker, which the manifest already records (§15).
  const manifest = JSON.parse(
    readFileSync(new URL('../../public/data/manifest.json', import.meta.url), 'utf8'),
  ) as { wikiHighestChangesPatch?: string };
  const notesTitle = patchNotesTitle(patch, manifest.wikiHighestChangesPatch ?? null);
  await sleep(1200);
  const notes = notesTitle ? await fetchArticle(notesTitle) : null;
  const namedInNotes = notes ? SIX.map((e) => e.rune).filter((rune) => notes.text.includes(rune)) : [];
  if (notesTitle && !notes) {
    failures.push({ what: notesTitle, detail: 'the wiki has not published this patch article' });
  }

  // ---- 6. classify and write --------------------------------------------------------------
  const findings: ContestFinding[] = SIX.map((evidence) => ({
    rune: evidence.rune,
    censusBlocker: evidence.censusBlocker,
    claim: evidence.claim,
    verdict: classifyDisagreement(evidence),
    why: whyInPlainEnglish(evidence.rune, classifyDisagreement(evidence)),
    valueThatStands: OUTCOME[evidence.rune]?.valueThatStands ?? null,
    residual: OUTCOME[evidence.rune]?.residual ?? null,
    evidence,
  }));

  const output = {
    provenance: {
      source:
        'Riot Data Dragon runesReforged.json (raw longDesc, markup intact); League of Legends ' +
        'Wiki Template:Rune data <Name>, the Adaptive force article, each rune article\'s Patch ' +
        `History, and the ${notesTitle ?? 'current'} patch article`,
      url: 'https://wiki.leagueoflegends.com/en-us/Adaptive_force',
      patch,
      fetched: new Date().toISOString(),
    },
    whatThisIs:
      'A reading of the six runes rune-census.json marks contested, answering what the ' +
      'disagreement IS before anyone tries to resolve it. Four verdicts are possible and one ' +
      'of them is "genuinely contested"; the classifier is proved able to reach it. Nothing ' +
      'here authors a rune value.',
    verdictCounts: countBy(findings.map((f) => f.verdict)),
    findings,
    rosterWideChecks: {
      dataDragonStatesTypeOnlyInMarkup: {
        definition:
          "Data Dragon's markup asserts a damage type that does not survive stripHtml, so " +
          'anything reading the stripped text loses a fact the source did state.',
        checkedOver: runes.length,
        typeStatedInMarkupAtAll: typeStatedInMarkup,
        lostByStripping: strippingLosesType,
      },
      legacyAdaptiveTiebreak: {
        definition:
          'The rune template still carries the 2017 launch wording "Defaults to the first ' +
          'listed", which conflicts with the Adaptive force article\'s current rule.',
        checkedOver: templates.size,
        carriers: legacyTiebreakCarriers,
      },
      variableDamageBlock: {
        definition: 'The rune template states its own damage-type rule instead of using the adaptive one.',
        checkedOver: templates.size,
        carriers: variableDamageCarriers,
      },
    },
    adaptiveForceArticle: {
      lastEdited: article?.lastEdited ?? null,
      tiebreak: articleTiebreak,
      runesExemptFromTheAdaptiveDamageFormula: exempt,
    },
    patchNotesTieBreak: {
      title: notesTitle,
      lastEdited: notes?.lastEdited ?? null,
      found: notes !== null,
      ofTheSixNamedInIt: namedInNotes,
      note:
        'DATA-SOURCES §15 makes the patch article the tie-break. Where it names none of the ' +
        'six, it settles none of them — that is reported, not treated as agreement.',
    },
    fetchFailures: failures,
  };

  const path = new URL('../../public/data/rune-contested.json', import.meta.url);
  writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`patch ${patch}; ${runes.length} runes; ${templates.size} templates read`);
  console.log('verdicts:', JSON.stringify(output.verdictCounts));
  console.log(`damage type stated ONLY in markup: ${strippingLosesType.map((r) => r.rune).join(', ') || '(none)'}`);
  console.log(`2017 tiebreak wording still carried by: ${legacyTiebreakCarriers.join(', ') || '(none)'}`);
  console.log(`Adaptive force article exempts: ${exempt.join(', ') || '(nothing)'}`);
  console.log(`${notesTitle} names: ${namedInNotes.join(', ') || '(none of the six)'}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FAILURE(S):`);
    for (const failure of failures) console.error(`  ${failure.what}: ${failure.detail}`);
    process.exitCode = 1;
  }
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function whyInPlainEnglish(rune: string, verdict: string): string {
  switch (verdict) {
    case 'not-contested-markup-stripped':
      return (
        `Both sources state the same thing about ${rune}. Data Dragon states it in markup — the ` +
        'phrase is wrapped in a <truedamage> tag — and this pipeline deletes tags before ' +
        'comparing the texts, so the fact was destroyed downstream of the source rather than ' +
        'disputed by it.'
      );
    case 'not-contested-scope-misread':
      return (
        `The two texts do not govern the same thing, and the wiki says so in its own words: the ` +
        `Adaptive force article states that ${rune} does not use the adaptive-damage formula. A ` +
        'rule and its stated exception are not two answers to one question.'
      );
    case 'stale-on-one-side':
      return (
        `The disputed sentence on ${rune}'s template is verbatim launch-note text from 2017–2018, ` +
        'still reproduced in the rune article\'s own patch history. The competing rule was ' +
        'written in May 2026 on a page edited since. Only 3 of the 62 current runes still carry ' +
        'the old wording. This is one text being older than the other, not two current sources ' +
        'disagreeing.'
      );
    default:
      return (
        `Two current texts state different things about ${rune} in the same scope and nothing ` +
        'resolves them. Use the value that ships with the patch, flag it contested, surface it.'
      );
  }
}

await main();
