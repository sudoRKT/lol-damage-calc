/**
 * THE PER-TICK READING, CHECKED.
 *
 * Two things are worth testing about a hand-read table, and neither is "does it contain the
 * entries I put in it":
 *
 *   1. THE QUOTES ARE REAL. `verifyQuotes` must find a paraphrase that drifted and a sentence
 *      attributed to the wrong ability. Both are shown here failing before the real data is
 *      asked, because a check that has never reported anything is not evidence that there is
 *      nothing to report.
 *   2. THE MARK RULE HOLDS. Only a recurring entry with a corroborated count may be marked.
 *      Marking one whose count is unstored publishes a fraction of a burn as the whole of it,
 *      which is the failure mode this reading exists to avoid.
 *
 * The last test runs the whole table against the real cached source — 37 entries, every quoted
 * fragment, no fixture.
 */

import { describe, expect, it } from 'vitest';

import {
  PER_TICK_READS,
  type CachedPage,
  type PerTickRead,
  checkAgainstHarvest,
  checkMarkRule,
  loadPages,
  markedOverTime,
  verifyQuotes,
} from './per-tick-read.ts';

const page = (champion: string, slot: string, abilityName: string, wikitext: string): CachedPage => ({
  champion,
  slot,
  abilityName,
  wikitext,
});

const read = (over: Partial<PerTickRead>): PerTickRead => ({
  key: 'Test/Q/Thing',
  verdict: 'recurring',
  countVerdict: 'corroborated',
  quote: 'it deals damage every second for 4 seconds',
  verbatim: ['deals {{as|magic damage}} every second'],
  durationSeconds: 4,
  intervalSeconds: 1,
  impliedTicks: 4,
  storedHits: [4],
  marked: true,
  ...over,
});

describe('verifyQuotes — the quote is in the source, or the row is not evidence', () => {
  const pages = [page('Test', 'Q', 'Thing', 'The thing deals {{as|magic damage}} every second for 4 seconds.')];

  it('is silent when every fragment is a literal substring of the source', () => {
    const checks = verifyQuotes([read({})], pages);
    expect(checks[0]!.missing).toEqual([]);
    expect(checks[0]!.found).toBe(1);
  });

  it('catches a quote that drifted from the source by one word', () => {
    const checks = verifyQuotes([read({ verbatim: ['deals {{as|magic damage}} every 2 seconds'] })], pages);
    expect(checks[0]!.missing).toHaveLength(1);
  });

  it("catches a sentence attributed to an ability whose page does not contain it", () => {
    const checks = verifyQuotes(
      [read({ key: 'Other/W/Elsewhere' })],
      [...pages, page('Other', 'W', 'Elsewhere', 'This page says nothing of the kind.')],
    );
    expect(checks[0]!.missing).toHaveLength(1);
    expect(checks[0]!.pageMissing).toBe(false);
  });

  it('says so when the ability has no cached page at all, rather than passing it', () => {
    const checks = verifyQuotes([read({ key: 'Nobody/R/Missing' })], pages);
    expect(checks[0]!.pageMissing).toBe(true);
  });
});

describe('checkMarkRule — only a corroborated count may be marked', () => {
  it('is silent on a recurring entry whose count the source corroborates', () => {
    expect(checkMarkRule([read({})])).toEqual([]);
  });

  it('catches an entry marked while its count was never stored — the fraction-of-a-burn defect', () => {
    const wrong = checkMarkRule([
      read({ countVerdict: 'count-not-stored', storedHits: [1], marked: true }),
    ]);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain('count-not-stored');
  });

  it('catches an entry marked while the source contradicts itself about the count', () => {
    expect(checkMarkRule([read({ countVerdict: 'contested', storedHits: [5], marked: true })]))
      .toHaveLength(1);
  });

  it('catches an entry marked although the sentence says the hits land at once', () => {
    const wrong = checkMarkRule([read({ verdict: 'simultaneous', marked: true })]);
    expect(wrong[0]).toContain('simultaneous');
  });

  it('catches a corroborated recurring entry left UNmarked, so the table cannot quietly drop one', () => {
    const wrong = checkMarkRule([read({ marked: false })]);
    expect(wrong[0]).toContain('not marked');
  });

  it("catches a row calling itself corroborated when the arithmetic does not agree", () => {
    const wrong = checkMarkRule([read({ impliedTicks: 4, storedHits: [10] })]);
    expect(wrong[0]).toContain('hits is 10');
  });

  it('refuses a marked row carrying no quote at all', () => {
    const wrong = checkMarkRule([read({ quote: '' })]);
    expect(wrong.some((w) => w.includes('no quote'))).toBe(true);
  });
});

describe('checkAgainstHarvest — the table describes the real population, not a remembered one', () => {
  const ability = (champion: string, slot: string, name: string, hits: number) => ({
    champion,
    slot,
    abilityName: name,
    components: [{ label: 'Magic Damage Per Tick', hits }],
  });

  it('is silent when the table and the harvest agree', () => {
    expect(checkAgainstHarvest([read({})], [ability('Test', 'Q', 'Thing', 4)])).toEqual([]);
  });

  it('catches an entry that acquired a per-tick component and was never read', () => {
    const out = checkAgainstHarvest(
      [read({})],
      [ability('Test', 'Q', 'Thing', 4), ability('New', 'W', 'Burn', 6)],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('nobody read it');
  });

  it('catches a row left behind for an entry that no longer has one', () => {
    const out = checkAgainstHarvest([read({}), read({ key: 'Gone/E/Removed' })], [
      ability('Test', 'Q', 'Thing', 4),
    ]);
    expect(out.some((o) => o.includes('not in the population'))).toBe(true);
  });

  it('catches a hit count that changed under the reading', () => {
    const out = checkAgainstHarvest([read({})], [ability('Test', 'Q', 'Thing', 9)]);
    expect(out[0]).toContain('the harvest holds [9]');
  });

  it('does not ask for a reading of the four already read before these 37', () => {
    expect(checkAgainstHarvest([], [ability('Teemo', 'E', 'Toxic Shot', 4)])).toEqual([]);
  });
});

describe('the table itself, against the real cached source', () => {
  it('holds 37 entries, one per withdrawn ability, and every one is recurring', () => {
    expect(PER_TICK_READS).toHaveLength(37);
    expect(PER_TICK_READS.filter((r) => r.verdict === 'recurring')).toHaveLength(37);
    expect(new Set(PER_TICK_READS.map((r) => r.key)).size).toBe(37);
  });

  it('marks 19 and leaves 18 withdrawn, every mark carrying its sentence', () => {
    const marked = markedOverTime();
    expect(marked.size).toBe(19);
    for (const [, why] of marked) expect(why.length).toBeGreaterThan(20);
  });

  it('obeys its own mark rule', () => {
    expect(checkMarkRule()).toEqual([]);
  });

  it('quotes 54 fragments and every one is literally in the cached wikitext', async () => {
    const checks = verifyQuotes(PER_TICK_READS, await loadPages());
    const failed = checks.filter((c) => c.pageMissing || c.missing.length > 0);
    expect(failed).toEqual([]);
    expect(checks.reduce((s, c) => s + c.found, 0)).toBe(54);
  });
});
