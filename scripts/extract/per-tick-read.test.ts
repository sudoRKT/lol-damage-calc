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
  type StatedTotal,
  capturedHitCounts,
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

// A ROW THAT CORRECTS A STORED COUNT IS THE ONE PLACE A HAND READING OVERWRITES A NUMBER, so every
// way of writing a count nothing checked is shown here FAILING before the real table is asked.
describe('checkMarkRule — a corrected count carries more conditions, not fewer', () => {
  const captured = (over: Partial<StatedTotal> = {}): PerTickRead =>
    read({
      countVerdict: 'captured',
      storedHits: [1],
      statedTotal: {
        instances: 4,
        componentIds: ['magic-damage-per-tick'],
        statedBy: 'the page prints it',
        verbatim: 'deals {{as|magic damage}} every second',
        ...over,
      },
    });

  it('accepts a captured row whose printed count equals the arithmetic', () => {
    expect(checkMarkRule([captured()])).toEqual([]);
  });

  it('refuses a captured count that does not reconcile with the duration and interval', () => {
    const wrong = checkMarkRule([captured({ instances: 9 })]);
    expect(wrong.some((w) => w.includes('must reconcile'))).toBe(true);
  });

  it('refuses a captured row whose sentence is not among the checked fragments', () => {
    const wrong = checkMarkRule([captured({ verbatim: 'a sentence nobody checked' })]);
    expect(wrong.some((w) => w.includes('not among the row'))).toBe(true);
  });

  it('refuses a captured row that changes nothing — that row is corroborated', () => {
    const wrong = checkMarkRule([
      read({ countVerdict: 'captured', storedHits: [4], statedTotal: captured().statedTotal! }),
    ]);
    expect(wrong.some((w) => w.includes('nothing changed'))).toBe(true);
  });

  it('refuses a captured row that names no component to put the count on', () => {
    const wrong = checkMarkRule([captured({ componentIds: [] })]);
    expect(wrong.some((w) => w.includes('no component'))).toBe(true);
  });

  it('refuses a settled row that names no evidence outside the page', () => {
    const wrong = checkMarkRule([
      read({
        countVerdict: 'settled',
        storedHits: [5],
        statedTotal: captured().statedTotal!,
      }),
    ]);
    expect(wrong.some((w) => w.includes('names no evidence outside the page'))).toBe(true);
  });

  it('refuses a captured row that had to cite outside evidence — that row is settled', () => {
    const wrong = checkMarkRule([captured({ settledBy: "Riot's patch notes" })]);
    expect(wrong.some((w) => w.includes('is settled, not captured'))).toBe(true);
  });

  it('refuses a corrected count hung on a row whose verdict does not correct anything', () => {
    const wrong = checkMarkRule([
      read({ countVerdict: 'contested', marked: false, statedTotal: captured().statedTotal! }),
    ]);
    expect(wrong.some((w) => w.includes('carries a corrected count'))).toBe(true);
  });

  it('refuses a settled row carrying no corrected count at all', () => {
    const wrong = checkMarkRule([read({ countVerdict: 'settled', storedHits: [5] })]);
    expect(wrong.some((w) => w.includes('states no corrected count'))).toBe(true);
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

  // THE COUNT MOVED ON 2026-08-15, 19 -> 23, AND A RISING COUNT IS THE DANGEROUS DIRECTION.
  //
  // DEFINITION of the 23: rows where the sentence says the damage recurs AND the number of times
  // it lands equals the source's own duration divided by its own interval. That definition did not
  // change. What changed is that four rows reached that arithmetic where they previously could
  // not — Rumble R and Viktor R because the page prints the count and the harvest had stored 1,
  // Hecarim W and Dr. Mundo W because Riot's patch notes settled which of two self-contradicting
  // halves of the page is stale (DATA-SOURCES §59). The tests below pin all four individually, so
  // the total cannot rise again without a named row rising with it.
  it('marks 23 and leaves 14 withdrawn, every mark carrying its sentence', () => {
    const marked = markedOverTime();
    expect(marked.size).toBe(23);
    expect(PER_TICK_READS.filter((r) => !r.marked)).toHaveLength(14);
    for (const [, why] of marked) expect(why.length).toBeGreaterThan(20);
  });

  it('obeys its own mark rule', () => {
    expect(checkMarkRule()).toEqual([]);
  });

  it('corrects exactly four counts, and every one equals the source own duration over interval', () => {
    const corrected = [...capturedHitCounts()];
    expect(corrected.map(([k]) => k).sort()).toEqual([
      'Dr. Mundo/W/Heart Zapper',
      'Hecarim/W/Spirit of Dread',
      'Rumble/R/The Equalizer',
      'Viktor/R/Arcane Storm',
    ]);
    for (const [key, stated] of corrected) {
      const row = PER_TICK_READS.find((r) => r.key === key)!;
      expect(stated.instances).toBe(row.impliedTicks);
      expect(row.storedHits).not.toContain(stated.instances);
    }
  });

  it('states the four corrected counts by name, so none can drift silently', () => {
    const at = (key: string) => capturedHitCounts().get(key)!.instances;
    expect(at('Rumble/R/The Equalizer')).toBe(20);
    expect(at('Viktor/R/Arcane Storm')).toBe(6);
    expect(at('Hecarim/W/Spirit of Dread')).toBe(4);
    expect(at('Dr. Mundo/W/Heart Zapper')).toBe(12);
  });

  it('leaves Nasus E unmarked and uncorrected — no source states its interval', () => {
    const nasus = PER_TICK_READS.find((r) => r.key === 'Nasus/E/Spirit Fire')!;
    expect(nasus.countVerdict).toBe('contested');
    expect(nasus.marked).toBe(false);
    expect(nasus.statedTotal).toBeUndefined();
    expect(capturedHitCounts().has('Nasus/E/Spirit Fire')).toBe(false);
  });

  it('quotes 57 fragments and every one is literally in the cached wikitext', async () => {
    const checks = verifyQuotes(PER_TICK_READS, await loadPages());
    const failed = checks.filter((c) => c.pageMissing || c.missing.length > 0);
    expect(failed).toEqual([]);
    expect(checks.reduce((s, c) => s + c.found, 0)).toBe(57);
  });

  it('proves every corrected sentence is one of the checked fragments, not a summary', async () => {
    const pages = await loadPages();
    for (const [key, stated] of capturedHitCounts()) {
      const row = PER_TICK_READS.find((r) => r.key === key)!;
      expect(row.verbatim).toContain(stated.verbatim);
      const page = pages.find((p) => `${p.champion}/${p.slot}/${p.abilityName}` === key)!;
      expect(page.wikitext).toContain(stated.verbatim);
    }
  });
});
