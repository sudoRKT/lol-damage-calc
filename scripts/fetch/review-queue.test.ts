// Known-answer tests for the review queue's INPUT (SPECIFICATION §9).
//
// The rule being protected is the one §9 states twice: the review step "never writes values
// into any data file". A queue that carried a proposed value would hand an automated reader
// something to apply. So the tests here are mostly about what the queue must NOT contain.

import { describe, expect, it } from 'vitest';

import { runBounds } from './bounds.ts';
import type { CuratedLoad } from './curated-source.ts';
import { diffSnapshots } from './diff.ts';
import { detectRework } from './rework.ts';
import { assertQueueProposesNoValues, buildReviewQueue } from './review-queue.ts';
import { aatrox, ashe, clone, makeSnapshot } from './snapshot-fixtures.ts';

const GENERATED = '2026-08-14T12:00:00.000Z';

const noCurated: CuratedLoad = {
  present: false,
  reason: 'curated/ holds no .json file.',
  filesRead: [],
  abilities: [],
  origin: '/curated',
};

function queueFor(mutate: (after: ReturnType<typeof makeSnapshot>) => void, curated = noCurated) {
  const previous = makeSnapshot();
  const candidate = clone(previous);
  mutate(candidate);
  const diff = diffSnapshots(previous, candidate);
  const bounds = runBounds(previous, candidate, diff);
  const rework = detectRework(curated.abilities, candidate.champions);
  return buildReviewQueue({
    candidate,
    previous,
    diff,
    verdicts: bounds.verdicts,
    rework,
    curated,
    generated: GENERATED,
  });
}

describe('review queue: what every entry must carry', () => {
  it('states both values for a halted movement', () => {
    const queue = queueFor((after) => {
      after.champions[1]!.stats.hp_base = 6500;
    });
    const entry = queue.entries.find((e) => e.kind === 'bound-halt')!;
    expect(entry.observed.before).toBe(640);
    expect(entry.observed.after).toBe(6500);
    expect(entry.field).toBe('stats.hp_base');
    expect(entry.subject).toBe('champion:Ashe');
  });

  it('asks a question and never answers it', () => {
    const queue = queueFor((after) => {
      after.champions[1]!.stats.hp_base = 6500;
    });
    for (const entry of queue.entries) {
      expect(entry.question.trim().endsWith('?')).toBe(true);
    }
  });

  it('carries only the nine descriptive fields — no proposed value of any kind', () => {
    const queue = queueFor((after) => {
      after.champions[1]!.stats.mr_base = 33;
    });
    expect(() => assertQueueProposesNoValues(queue)).not.toThrow();
  });

  it('the guard actually fires when a value field is smuggled in', () => {
    // Proof that the guard can fail, not merely that it passes.
    const queue = queueFor((after) => {
      after.champions[1]!.stats.mr_base = 33;
    });
    (queue.entries[0] as unknown as Record<string, unknown>)['suggestedValue'] = 33;
    expect(() => assertQueueProposesNoValues(queue)).toThrow(/suggestedValue/);
  });
});

describe('review queue: what gets in', () => {
  it('a halted bound produces a halt entry', () => {
    const queue = queueFor((after) => {
      after.champions[1]!.stats.hp_base = 6500;
    });
    expect(queue.counts.halts).toBeGreaterThanOrEqual(1);
    expect(queue.entries[0]!.severity).toBe('halt');
  });

  it('halts sort before reviews, so the first thing read is the thing that stopped', () => {
    const queue = queueFor((after) => {
      after.champions[1]!.stats.hp_base = 6500;
      after.champions[0]!.resource = 'Mana';
    });
    const severities = queue.entries.map((e) => e.severity);
    expect(severities.indexOf('halt')).toBeLessThan(severities.lastIndexOf('review'));
  });

  it('a contested champion is queued every run, not only when it changes', () => {
    const previous = makeSnapshot();
    const candidate = clone(previous);
    candidate.contestedChampions = ['Tristana', 'Twitch'];
    const diff = diffSnapshots(previous, candidate);
    const queue = buildReviewQueue({
      candidate,
      previous,
      diff,
      verdicts: [],
      rework: detectRework([], candidate.champions),
      curated: noCurated,
      generated: GENERATED,
    });
    const contested = queue.entries.filter((e) => e.kind === 'contested-stat');
    expect(contested.map((e) => e.subject)).toEqual(['champion:Tristana', 'champion:Twitch']);
  });

  it('an added champion is queued as needing curated entries', () => {
    const previous = makeSnapshot({ champions: [aatrox()] });
    const candidate = makeSnapshot({ champions: [aatrox(), ashe()] });
    const diff = diffSnapshots(previous, candidate);
    const queue = buildReviewQueue({
      candidate,
      previous,
      diff,
      verdicts: [],
      rework: detectRework([], candidate.champions),
      curated: noCurated,
      generated: GENERATED,
    });
    const added = queue.entries.find((e) => e.kind === 'entity-added')!;
    expect(added.subject).toBe('champion:Ashe');
    expect(added.question).toContain('curated file');
  });

  it('pairs a moved champion with its curated entries for the patch-note cross-reference', () => {
    const curated: CuratedLoad = {
      present: true,
      reason: '1 curated ability',
      filesRead: ['abilities.json'],
      abilities: [{ champion: 'Ashe', slot: 'Q', abilityName: "Ranger's Focus" }],
      origin: '/curated',
    };
    const queue = queueFor((after) => {
      after.champions[1]!.stats.mr_base = 33;
    }, curated);
    const cross = queue.entries.find((e) => e.kind === 'curated-cross-reference')!;
    expect(cross.subject).toBe('champion:Ashe');
    expect(cross.field).toBe('stats.mr_base');
    expect(cross.question).toContain('ability numbers');
  });

  it('records that rework detection had nothing to compare when /curated/ is empty', () => {
    const queue = queueFor(() => {});
    const entry = queue.entries.find((e) => e.kind === 'curated-file-absent')!;
    expect(entry.why).toContain('ZERO ability identifiers');
    expect(entry.why).toContain('not "nothing is wrong"');
  });
});

describe('review queue: determinism', () => {
  it('produces byte-identical output for the same inputs', () => {
    const first = JSON.stringify(queueFor((a) => { a.champions[1]!.stats.mr_base = 33; }));
    const second = JSON.stringify(queueFor((a) => { a.champions[1]!.stats.mr_base = 33; }));
    expect(first).toBe(second);
  });

  it('gives the same finding the same id across runs', () => {
    const a = queueFor((s) => { s.champions[1]!.stats.hp_base = 6500; });
    const b = queueFor((s) => { s.champions[1]!.stats.hp_base = 6500; });
    expect(a.entries.map((e) => e.id)).toEqual(b.entries.map((e) => e.id));
  });

  it('gives two different findings two different ids', () => {
    const queue = queueFor((s) => {
      s.champions[1]!.stats.hp_base = 6500;
      s.champions[0]!.stats.hp_base = 6500;
    });
    const ids = queue.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
