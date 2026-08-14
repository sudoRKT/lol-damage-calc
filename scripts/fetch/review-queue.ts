// THE REVIEW QUEUE — its INPUT, built deterministically (SPECIFICATION §9).
//
//   "A language model reads the human-readable patch notes and cross-references them against
//    the curated override file, producing a list of entries that may require human attention.
//    It never writes values into any data file. Its output is a review queue."
//
// THIS FILE BUILDS THE QUEUE. IT DOES NOT READ IT, AND NOTHING HERE CALLS A MODEL.
// The model step and the pull-request/scheduling step are somebody else's work. What this
// produces is the structured, reproducible list a human or a model is handed: every entry names
// what changed, both values, and the QUESTION a person has to answer. No entry carries an
// answer, a recommendation, or a value to apply — `assertQueueProposesNoValues` enforces that
// mechanically rather than by convention, because the one rule §9 states twice is that nothing
// automatic may write a value.
//
// DETERMINISTIC. Same inputs, same entries, same order, same ids. The id is derived from the
// content, so the same finding keeps the same id across runs and a reviewer can tell a repeat
// from a new one.
//
// Pure — no network, no filesystem. Tested by review-queue.test.ts.

import type { BoundVerdict } from './bounds.ts';
import type { SnapshotDiff } from './diff.ts';
import type { Snapshot } from './snapshot.ts';
import type { ReworkReport } from './rework.ts';
import type { CuratedLoad } from './curated-source.ts';

export type ReviewKind =
  | 'bound-halt'
  | 'bound-review'
  | 'rework'
  | 'contested-stat'
  | 'entity-added'
  | 'entity-removed'
  | 'curated-cross-reference'
  | 'curated-file-absent';

export interface ReviewQueueEntry {
  /** Stable, content-derived. The same finding keeps the same id across runs. */
  id: string;
  kind: ReviewKind;
  severity: 'halt' | 'review';
  /** What this is about: "champion:Aatrox", "item:3107", "roster", "patch". */
  subject: string;
  field: string | null;
  /** The two values, always both, never one. Null where the change has no before/after. */
  observed: { before: number | string | null; after: number | string | null };
  /** Plain English: what happened and why it is here. */
  why: string;
  /** What a human has to decide. A QUESTION — never an answer and never a value. */
  question: string;
  /** Where to look. URLs only. */
  sources: string[];
}

export interface ReviewQueue {
  formatVersion: number;
  patch: { before: string | null; after: string };
  generated: string;
  /** Restated in the file itself so it survives being read out of context. */
  rules: string[];
  counts: {
    total: number;
    halts: number;
    reviews: number;
    byKind: Record<string, number>;
  };
  entries: ReviewQueueEntry[];
}

export const REVIEW_QUEUE_FORMAT_VERSION = 1;

const ALLOWED_ENTRY_KEYS = new Set([
  'id',
  'kind',
  'severity',
  'subject',
  'field',
  'observed',
  'why',
  'question',
  'sources',
]);

/**
 * THE GUARD. A queue entry may describe a change and ask a question; it may never carry a
 * value for anything to apply.
 *
 * This exists because the dangerous version of this file is easy to write by accident: one
 * extra `suggestedValue` field, and an automated reader has something to write into a data
 * file. §9 forbids that, so it is checked rather than trusted. Also a unit test.
 */
export function assertQueueProposesNoValues(queue: ReviewQueue): void {
  for (const entry of queue.entries) {
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_ENTRY_KEYS.has(key)) {
        throw new Error(
          `review queue entry ${entry.id} carries the field "${key}", which is not one of the ` +
            `nine descriptive fields a queue entry may have (${[...ALLOWED_ENTRY_KEYS].join(', ')}). ` +
            `SPECIFICATION §9: the review step never writes values into any data file, so the ` +
            `queue must not hand it one.`,
        );
      }
    }
    if (!entry.question.trim().endsWith('?')) {
      throw new Error(
        `review queue entry ${entry.id} has no question — "${entry.question}". Every entry must ` +
          `state what a person has to decide, or it is a notification rather than a review item.`,
      );
    }
  }
}

/** Short, stable, content-derived id. Not cryptographic — it only has to be reproducible. */
function idFor(kind: string, subject: string, field: string | null): string {
  const seed = `${kind}|${subject}|${field ?? ''}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
  return `${kind}-${hash.toString(36)}`;
}

export interface QueueInput {
  candidate: Snapshot;
  previous: Snapshot | null;
  diff: SnapshotDiff | null;
  verdicts: BoundVerdict[];
  rework: ReworkReport;
  curated: CuratedLoad;
  generated: string;
}

export function buildReviewQueue(input: QueueInput): ReviewQueue {
  const entries: ReviewQueueEntry[] = [];
  const wikiSource = input.candidate.sources['championStats'] ?? '';
  const patchNotesHint =
    'https://wiki.leagueoflegends.com/en-us/ — the patch-notes article for this patch (V<season>.<patch>), fetched as raw wikitext';

  // 1. Everything the bounds refused or flagged.
  for (const verdict of input.verdicts) {
    entries.push({
      id: idFor(verdict.severity === 'halt' ? 'bound-halt' : 'bound-review', verdict.subject, verdict.field),
      kind: verdict.severity === 'halt' ? 'bound-halt' : 'bound-review',
      severity: verdict.severity,
      subject: `${verdict.kind}:${verdict.subject}`,
      field: verdict.field,
      observed: { before: verdict.before, after: verdict.after },
      why: verdict.message,
      question:
        verdict.severity === 'halt'
          ? `Is this movement a real change Riot made in this patch, or is it an error or an ` +
            `edit to the source? Check the patch notes for ${verdict.subject}. If it is real, ` +
            `the bound needs re-basing on the new evidence; if it is not, the update must not ` +
            `proceed. Which is it?`
          : `This changed and no arithmetic bound can judge it. Does the patch note for ` +
            `${verdict.subject} account for it?`,
      sources: [wikiSource, patchNotesHint].filter(Boolean),
    });
  }

  // 2. Rework findings.
  for (const finding of input.rework.findings) {
    entries.push({
      id: idFor(
        `rework-${finding.kind}`,
        `${finding.champion}:${finding.slot}`,
        finding.curatedName ?? finding.sourceNames[0] ?? null,
      ),
      kind: 'rework',
      severity: finding.severity,
      subject: `champion:${finding.champion}`,
      field: `ability.${finding.slot}`,
      observed: {
        before: finding.curatedName,
        after: finding.sourceNames.length > 0 ? finding.sourceNames.join(' | ') : null,
      },
      why: finding.message,
      question:
        finding.kind === 'source-ability-uncurated'
          ? `Is "${finding.sourceNames[0] ?? ''}" a new ability that needs curating, or was it ` +
            `always there and simply not covered yet?`
          : `Has ${finding.champion}'s kit been reworked, or is this a rename of the same ` +
            `ability? The curated entry cannot be re-pointed until someone says which.`,
      sources: [wikiSource, patchNotesHint].filter(Boolean),
    });
  }

  // 3. Champions Riot's own sources disagree about (DATA-SOURCES §15). These are not new this
  //    run — they are carried into the queue every run precisely because a contested value that
  //    stops being reviewed becomes a value nobody is checking.
  for (const apiname of input.candidate.contestedChampions) {
    entries.push({
      id: idFor('contested', apiname, null),
      kind: 'contested-stat',
      severity: 'review',
      subject: `champion:${apiname}`,
      field: null,
      observed: { before: null, after: null },
      why:
        `${apiname} carries at least one base statistic the wiki module and Data Dragon disagree ` +
        `about, and nothing available resolves it. Data Dragon's value is in use because it ships ` +
        `with the patch, and the champion is flagged contested (DATA-SOURCES §15). Any result ` +
        `involving them must show that.`,
      question:
        `Has anything new appeared this patch — a patch note, a corrected module edit — that ` +
        `settles ${apiname}'s disputed statistic?`,
      sources: [wikiSource, patchNotesHint].filter(Boolean),
    });
  }

  // 4. Entities that appeared or vanished.
  if (input.diff) {
    for (const added of input.diff.added) {
      entries.push({
        id: idFor('added', `${added.kind}:${added.entityId}`, null),
        kind: 'entity-added',
        severity: 'review',
        subject: `${added.kind}:${added.entityId}`,
        field: null,
        observed: { before: null, after: added.subject },
        why: `${added.subject} is in this fetch and was not in the stored snapshot.`,
        question:
          added.kind === 'champion'
            ? `${added.subject} is new to the roster. Does the curated file need entries for ` +
              `their abilities before they are offered to users?`
            : `Is ${added.subject} a genuinely new ${added.kind}, or an id that has come back ` +
              `after being absent?`,
        sources: [wikiSource].filter(Boolean),
      });
    }
    for (const removed of input.diff.removed) {
      entries.push({
        id: idFor('removed', `${removed.kind}:${removed.entityId}`, null),
        kind: 'entity-removed',
        severity: 'review',
        subject: `${removed.kind}:${removed.entityId}`,
        field: null,
        observed: { before: removed.subject, after: null },
        why: `${removed.subject} was in the stored snapshot and is not in this fetch.`,
        question:
          `Was ${removed.subject} removed from the game this patch, or did the source simply ` +
          `not return it? Anything curated against it is now orphaned — which is it?`,
        sources: [wikiSource].filter(Boolean),
      });
    }

    // 5. The cross-reference §9 actually asks the model to perform: for every champion whose
    //    source data moved AND who has curated entries, hand over the pairing so the patch
    //    notes can be read against it. This is the input; the reading is not done here.
    const curatedChampions = new Set(input.curated.abilities.map((a) => a.champion));
    const movedChampions = new Map<string, string[]>();
    for (const change of input.diff.changed) {
      if (change.kind !== 'champion') continue;
      const list = movedChampions.get(change.entityId);
      if (list) list.push(change.field);
      else movedChampions.set(change.entityId, [change.field]);
    }
    for (const [apiname, fields] of [...movedChampions].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!curatedChampions.has(apiname)) continue;
      entries.push({
        id: idFor('cross-reference', apiname, null),
        kind: 'curated-cross-reference',
        severity: 'review',
        subject: `champion:${apiname}`,
        field: fields.sort().join(', '),
        observed: { before: null, after: fields.length },
        why:
          `${apiname}'s source data changed in ${fields.length} field(s) this patch and the ` +
          `curated file holds entries for them. A base-stat change is often shipped alongside an ` +
          `ability change, and an ability change is not visible in any structured source.`,
        question:
          `Do this patch's notes change any of ${apiname}'s ability numbers, and if so, which ` +
          `curated entries have to be re-read?`,
        sources: [wikiSource, patchNotesHint].filter(Boolean),
      });
    }
  }

  // 6. The state of the curated file itself, when there is not one.
  if (!input.curated.present) {
    entries.push({
      id: idFor('curated-absent', input.curated.origin, null),
      kind: 'curated-file-absent',
      severity: 'review',
      subject: 'curated',
      field: null,
      observed: { before: null, after: null },
      why:
        `Rework detection compared ZERO ability identifiers: ${input.curated.reason} Its clean ` +
        `result therefore means "nothing was checked", not "nothing is wrong" — recorded here so ` +
        `the run cannot be read as a pass.`,
      question:
        `This run establishes nothing about ability identifiers, because there were none to ` +
        `compare. Is an absent curated file still the expected state at this point in the ` +
        `project?`,
      sources: [],
    });
  }

  entries.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'halt' ? -1 : 1) ||
      a.kind.localeCompare(b.kind) ||
      a.subject.localeCompare(b.subject, 'en') ||
      (a.field ?? '').localeCompare(b.field ?? '', 'en'),
  );

  const byKind: Record<string, number> = {};
  for (const entry of entries) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;

  const queue: ReviewQueue = {
    formatVersion: REVIEW_QUEUE_FORMAT_VERSION,
    patch: { before: input.previous?.patch ?? null, after: input.candidate.patch },
    generated: input.generated,
    rules: [
      'This file is the INPUT to the review step, not its output. It is produced by exact ' +
        'structured comparison and contains no model output.',
      'No entry carries a value for anything to apply. SPECIFICATION §9: the review step never ' +
        'writes values into any data file.',
      'A halt means the update did not proceed. A review means it may proceed but a person has ' +
        'to look.',
      'Zero entries of a kind means that check found nothing, EXCEPT where an entry of kind ' +
        'curated-file-absent says the check had nothing to compare.',
    ],
    counts: {
      total: entries.length,
      halts: entries.filter((e) => e.severity === 'halt').length,
      reviews: entries.filter((e) => e.severity === 'review').length,
      byKind,
    },
    entries,
  };

  assertQueueProposesNoValues(queue);
  return queue;
}
