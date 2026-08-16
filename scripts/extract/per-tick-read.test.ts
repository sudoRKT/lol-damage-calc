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
  DECLINED_RECURRENCE,
  READ_RECURRENCE_BEYOND_PER_TICK,
  READ_RECURRENCE_QUOTES,
  READ_RECURRENCE_VERBATIM,
  loadPages,
  verifyDeclinedQuotes,
  verifyRecurrenceVerbatim,
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

// A COUNT THAT RECONCILES AND IS STILL NOT WRITTEN (2026-08-15). Ornn W and Malzahar R are both
// blocked by something outside the source, and the danger is that the blocker gets fixed
// elsewhere and nobody comes back. Each half is shown failing on its own before the real table is
// asked, because a pair of fields that may drift apart is worth exactly as much as the check that
// says they have.
describe('checkMarkRule — a reconciling count that is not captured must say what stops it', () => {
  const blocked = (over: Partial<PerTickRead> = {}): PerTickRead =>
    read({
      countVerdict: 'count-not-stored',
      storedHits: [1],
      marked: false,
      reconcilesAt: 4,
      captureBlockedBy: 'two rows share one component id, so the count names both',
      ...over,
    });

  it('accepts a blocked row that states both the count and the blocker', () => {
    expect(checkMarkRule([blocked()])).toEqual([]);
  });

  it('refuses a reconciling count with no stated blocker — a half-finished capture', () => {
    const wrong = checkMarkRule([blocked({ captureBlockedBy: undefined })]);
    expect(wrong.some((w) => w.includes('left half-finished'))).toBe(true);
  });

  it('refuses a blocker with no count behind it, which nothing could check later', () => {
    const wrong = checkMarkRule([blocked({ reconcilesAt: undefined })]);
    expect(wrong.some((w) => w.includes('cannot be checked when it is removed'))).toBe(true);
  });

  it('refuses a count that does not actually reconcile with the duration and interval', () => {
    const wrong = checkMarkRule([blocked({ reconcilesAt: 7 })]);
    expect(wrong.some((w) => w.includes('"Reconciles" means those two agree'))).toBe(true);
  });

  it('refuses a captured row that also claims something blocks the capture', () => {
    const wrong = checkMarkRule([
      read({
        countVerdict: 'captured',
        storedHits: [1],
        statedTotal: {
          instances: 4,
          componentIds: ['magic-damage-per-tick'],
          statedBy: 'the page prints it',
          verbatim: 'deals {{as|magic damage}} every second',
        },
        reconcilesAt: 4,
        captureBlockedBy: 'something',
      }),
    ]);
    expect(wrong.some((w) => w.includes('also claims a blocker'))).toBe(true);
  });
});

// PERMANENT AND PENDING MUST NOT BE CONFUSABLE (2026-08-15). An entry nobody can ever finish and
// an entry nobody has finished look identical from outside, and SPECIFICATION §8 requires the
// interface to tell them apart. Each half of the rule is shown failing before the real table is
// asked.
describe('checkMarkRule — a count that can never exist says so, and only where it is true', () => {
  it('accepts a no-duration row that states why no count can ever exist', () => {
    expect(
      checkMarkRule([
        read({
          countVerdict: 'no-duration-stated',
          durationSeconds: null,
          impliedTicks: null,
          storedHits: [1],
          marked: false,
          countUnresolvable: 'it is a toggle and the page states no duration anywhere',
        }),
      ]),
    ).toEqual([]);
  });

  it('refuses a no-duration row that leaves it unsaid, which reads as work outstanding', () => {
    const wrong = checkMarkRule([
      read({
        countVerdict: 'no-duration-stated',
        durationSeconds: null,
        impliedTicks: null,
        storedHits: [1],
        marked: false,
      }),
    ]);
    expect(wrong.some((w) => w.includes('will ever supply'))).toBe(true);
  });

  it('refuses an entry claiming both an established count and that none can exist', () => {
    const wrong = checkMarkRule([read({ countUnresolvable: 'nothing states it' })]);
    expect(wrong.some((w) => w.includes('also claims no count can ever exist'))).toBe(true);
  });

  it('refuses an entry that is both blocked at a reconciling count and unresolvable', () => {
    const wrong = checkMarkRule([
      read({
        countVerdict: 'count-not-stored',
        storedHits: [1],
        marked: false,
        reconcilesAt: 4,
        captureBlockedBy: 'the contract holds one hit count per component',
        countUnresolvable: 'nothing states it',
      }),
    ]);
    expect(wrong.some((w) => w.includes('permanent'))).toBe(true);
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
  // 37 -> 39 ON 2026-08-15, AND THE TWO NEW ROWS ARE NOT NEW READINGS OF NEW ABILITIES.
  //
  // Teemo R and Nilah R were two of the four §58.3 marked as recurring before this table existed,
  // on sentences a person read and then wrote down as SUMMARIES rather than quotes. Both are among
  // the 20 entries a per-tick component holds back, so both were opened again and read against
  // their own template. Neither hit count moved — 4 and 4, corroborated — and the reason for
  // adding them is that a summary cannot be checked and a quote can: `verifyQuotes` now proves
  // seven more fragments are literally in the cached wikitext.
  //
  // They left `ALREADY_READ` in the same change. A row here and an exclusion there are two ways of
  // saying "somebody read this", and holding both would make `checkAgainstHarvest` report them as
  // read but outside the population.
  it('holds 39 entries, one per withdrawn ability, and every one is recurring', () => {
    expect(PER_TICK_READS).toHaveLength(39);
    expect(PER_TICK_READS.filter((r) => r.verdict === 'recurring')).toHaveLength(39);
    expect(new Set(PER_TICK_READS.map((r) => r.key)).size).toBe(39);
  });

  // THE COUNT MOVED TWICE ON 2026-08-15, 19 -> 23 -> 25, AND RISING IS THE DANGEROUS DIRECTION.
  //
  // DEFINITION of the 25: rows where the sentence says the damage recurs AND the number of times
  // it lands equals the source's own duration divided by its own interval. That definition has not
  // changed once. What changes is which rows reach that arithmetic.
  //
  // 19 -> 23: Rumble R and Viktor R because the page prints the count and the harvest had stored
  // 1; Hecarim W and Dr. Mundo W because Riot's patch notes settled which of two
  // self-contradicting halves of the page is stale (DATA-SOURCES §59).
  //
  // 23 -> 25, in the re-read of the entries held back on their counts: Nasus R at 30 and Wukong R
  // at 8. Neither is a new reading of the arithmetic — both were already recorded as reconciling.
  // What was missing was that each page PRINTS the count as well: Nasus R's Total row multiplies
  // by 30 on the base and again on the AP coefficient, and Wukong R's leveling row divides by 8 on
  // the health percentage and again on the AD ratio. Both entries are `incomplete` in the harvest
  // and publish nothing either way; the capture stops a thirtieth and an eighth of a burn being
  // published as the whole of it if that ever changes.
  //
  // The tests below pin all six individually, so the total cannot rise again without a named row
  // rising with it.
  // 25 -> 27 later on 2026-08-15, and this rise marks NOTHING NEW: Teemo R and Nilah R were
  // already marked as recurring by name in `merge-proposal.ts`, and moving them into this table
  // moved their mark with them. The number of components the engine sends to the damage-over-time
  // line is unchanged; what changed is that the sentence each mark rests on is now quoted from the
  // source and checked, rather than paraphrased in a map.
  it('marks 27 and leaves 12 withdrawn, every mark carrying its sentence', () => {
    const marked = markedOverTime();
    expect(marked.size).toBe(27);
    expect(PER_TICK_READS.filter((r) => !r.marked)).toHaveLength(12);
    for (const [, why] of marked) expect(why.length).toBeGreaterThan(20);
  });

  it('obeys its own mark rule', () => {
    expect(checkMarkRule()).toEqual([]);
  });

  it('corrects exactly six counts, and every one equals the source own duration over interval', () => {
    const corrected = [...capturedHitCounts()];
    expect(corrected.map(([k]) => k).sort()).toEqual([
      'Dr. Mundo/W/Heart Zapper',
      'Hecarim/W/Spirit of Dread',
      'Nasus/R/Fury of the Sands',
      'Rumble/R/The Equalizer',
      'Viktor/R/Arcane Storm',
      'Wukong/R/Cyclone',
    ]);
    for (const [key, stated] of corrected) {
      const row = PER_TICK_READS.find((r) => r.key === key)!;
      expect(stated.instances).toBe(row.impliedTicks);
      expect(row.storedHits).not.toContain(stated.instances);
    }
  });

  it('states the six corrected counts by name, so none can drift silently', () => {
    const at = (key: string) => capturedHitCounts().get(key)!.instances;
    expect(at('Rumble/R/The Equalizer')).toBe(20);
    expect(at('Viktor/R/Arcane Storm')).toBe(6);
    expect(at('Hecarim/W/Spirit of Dread')).toBe(4);
    expect(at('Dr. Mundo/W/Heart Zapper')).toBe(12);
    expect(at('Nasus/R/Fury of the Sands')).toBe(30);
    expect(at('Wukong/R/Cyclone')).toBe(8);
  });

  // THE RE-READ OF 2026-08-15, PINNED ROW BY ROW. Each of these is a REFUSAL that survived a
  // second reading, and each is easier to erode than to defend: the counts are right there in the
  // page in three of the four cases.
  it('leaves Ornn W and Malzahar R reconciling but uncaptured, each naming its blocker', () => {
    const ornn = PER_TICK_READS.find((r) => r.key === 'Ornn/W/Bellows Breath')!;
    expect(ornn.reconcilesAt).toBe(5);
    expect(ornn.marked).toBe(false);
    expect(capturedHitCounts().has(ornn.key)).toBe(false);
    // The blocker is the destination, not the arithmetic — §3.8's "following the combo".
    expect(ornn.captureBlockedBy).toMatch(/3\.8/);

    const malz = PER_TICK_READS.find((r) => r.key === 'Malzahar/R/Nether Grasp')!;
    expect(malz.reconcilesAt).toBe(10);
    expect(malz.marked).toBe(false);
    expect(capturedHitCounts().has(malz.key)).toBe(false);
    // The blocker is our own harvest: two rows under one component id.
    expect(malz.captureBlockedBy).toMatch(/component id/);
  });

  it('leaves Singed Q contested — its own minimum row says 8 and its own notes say 9', () => {
    const singed = PER_TICK_READS.find((r) => r.key === 'Singed/Q/Poison Trail')!;
    expect(singed.countVerdict).toBe('contested');
    expect(singed.marked).toBe(false);
    expect(singed.statedTotal).toBeUndefined();
    expect(singed.reconcilesAt).toBeUndefined();
  });

  it('leaves Rumble Q uncaptured — its full-duration count is 15 where 3s / 0.25s is 12', () => {
    const rumble = PER_TICK_READS.find((r) => r.key === 'Rumble/Q/Flamespitter')!;
    expect(rumble.impliedTicks).toBe(12);
    expect(rumble.marked).toBe(false);
    expect(rumble.reconcilesAt).toBeUndefined();
    expect(capturedHitCounts().has(rumble.key)).toBe(false);
  });

  it('leaves Nasus E unmarked and uncorrected — no source states its interval', () => {
    const nasus = PER_TICK_READS.find((r) => r.key === 'Nasus/E/Spirit Fire')!;
    expect(nasus.countVerdict).toBe('contested');
    expect(nasus.marked).toBe(false);
    expect(nasus.statedTotal).toBeUndefined();
    expect(capturedHitCounts().has('Nasus/E/Spirit Fire')).toBe(false);
  });

  it('quotes 68 fragments and every one is literally in the cached wikitext', async () => {
    // 57 UNTIL 2026-08-15, AND HERE IS THE ONE THAT MOVED IT. Morgana W was re-read and its
    // `countVerdict` went from `count-not-stored` to `contested`: the count is not missing from
    // the source, the source states TWO of them — its description reads as 11 instances (one on
    // cast, then one every 0.5s over a 5-second field) and its own total row multiplies the
    // per-tick figure by 10. Establishing that needed the total row quoted as well as the
    // sentence, so the entry's `verbatim` list gained one fragment. Nothing was captured; §32.2
    // holds that a source contradicting itself is contested rather than silently resolved.
    //
    // 58 -> 68 IN THE RE-READ LATER THE SAME DAY, and every one of the ten is a row's OWN
    // leveling row or notes quoted alongside its description, because that is where the counts
    // turned out to be printed: Nasus R and Wukong R gained their Total rows (captured), Singed Q
    // gained its notes and its minimum row (contested, 8 against 9), Rumble Q gained three (its
    // scorch sentence and its minimum and maximum rows, which state 3 and 15), Malzahar R gained
    // both its Total rows, and Swain R gained the Demonic Energy decay sentence that looks like a
    // duration and is not one.
    //
    // 68 -> 75 when Teemo R and Nilah R joined the table: four fragments for Teemo R (its poison
    // sentence, its leveling row, its own "persistent area damage" tag, and the note saying
    // multiple traps REFRESH rather than stack) and three for Nilah R (its whirl sentence and both
    // of its total rows). Every one was checked as a literal substring before it was written down.
    const checks = verifyQuotes(PER_TICK_READS, await loadPages());
    const failed = checks.filter((c) => c.pageMissing || c.missing.length > 0);
    expect(failed).toEqual([]);
    expect(checks.reduce((s, c) => s + c.found, 0)).toBe(75);
  });

  // ═══ PERMANENT, NOT OUTSTANDING (2026-08-15) ═══
  //
  // DEFINITION of the 7: withdrawn entries where no count can ever be stated, and the reason is
  // recorded on the row. Two shapes reach it — the ability has no duration at all (Amumu W,
  // Anivia R, Karthus E, Swain R, and Rumble Q, whose three counts are each right for a different
  // situation), or the figure is a real number no reachable source states (Nasus E's interval,
  // Mel E's field lifetime).
  //
  // WHY IT IS PINNED: this number RISING is evidence arriving, and it would be trivially easy to
  // raise it by relabelling an entry somebody simply has not read. Naming all seven means a rise
  // has to name its eighth.
  it('records 7 counts that can never be stated, and names every one', () => {
    const permanent = PER_TICK_READS.filter((r) => r.countUnresolvable).map((r) => r.key).sort();
    expect(permanent).toEqual([
      'Amumu/W/Despair',
      'Anivia/R/Glacial Storm',
      'Karthus/E/Defile',
      'Mel/E/Solar Snare',
      'Nasus/E/Spirit Fire',
      'Rumble/Q/Flamespitter',
      'Swain/R/Demonic Ascension',
    ]);
    // None of the seven is marked, and none carries a count anywhere.
    for (const key of permanent) {
      const row = PER_TICK_READS.find((r) => r.key === key)!;
      expect(row.marked).toBe(false);
      expect(row.statedTotal).toBeUndefined();
      expect(row.reconcilesAt).toBeUndefined();
      expect(row.countUnresolvable!.length).toBeGreaterThan(60);
    }
  });

  it('leaves Aurelion Sol Q reconciling at 26 and blocked by our own shape, not the source', () => {
    // RE-READ 2026-08-15. The source is not short of anything: 3.25s / 0.125s is 26 and the page's
    // own total row prints '*26' on the base and on the AP coefficient. What cannot hold it is
    // `hits` — one number per component against a count of 26 at ranks 1-4 and 1,280 at rank 5.
    const asol = PER_TICK_READS.find((r) => r.key === 'Aurelion Sol/Q/Breath of Light')!;
    expect(asol.reconcilesAt).toBe(26);
    expect(asol.impliedTicks).toBe(26);
    expect(asol.marked).toBe(false);
    expect(asol.countUnresolvable).toBeUndefined();
    expect(asol.captureBlockedBy).toMatch(/rank 5/);
    expect(capturedHitCounts().has(asol.key)).toBe(false);
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

// ═══ THE RECURRENCE TABLES BEYOND "PER TICK" (2026-08-16) ═══
//
// Three entries are MARKED and fifteen are DECLINED. Both are hand-written and both are only
// worth anything if every row rests on a sentence that is really on that ability's page — the
// same discipline the 37 per-tick rows are held to, for the same reason: a summary cannot be
// checked and a quote can.
describe('the recurrence tables, against the real cached source', () => {
  it('every MARKED entry rests on fragments literally present on its own page', async () => {
    // DEFINITION: entries in `READ_RECURRENCE_BEYOND_PER_TICK`, each of which moves a component
    // off the burst line and onto the damage-over-time line (SPECIFICATION §3.8). Three on
    // 2026-08-16: Cassiopeia W, Fiddlesticks W, Gangplank R.
    const checks = verifyRecurrenceVerbatim(READ_RECURRENCE_VERBATIM, await loadPages());
    expect(checks.filter((c) => c.pageMissing || c.missing.length > 0)).toEqual([]);
    expect(checks.reduce((s, c) => s + c.found, 0)).toBe(7);
  });

  it('a marked entry cannot exist without a quote AND checked fragments behind it', () => {
    // The interlock. `classifyOverTime` only marks when a quote exists, so a table entry with no
    // quote silently WITHDRAWS the entry instead of marking it — which reads like a refusal
    // nobody wrote. And a quote with no checked fragments is a paraphrase nothing can verify.
    for (const key of Object.keys(READ_RECURRENCE_BEYOND_PER_TICK)) {
      expect(READ_RECURRENCE_QUOTES[key], `${key} is marked with no quote`).toBeDefined();
      expect(READ_RECURRENCE_VERBATIM[key], `${key} is marked with no checked source`).toBeDefined();
      expect(READ_RECURRENCE_VERBATIM[key]!.length).toBeGreaterThan(0);
    }
  });

  it('every DECLINED entry rests on fragments literally present on its own page', async () => {
    // DEFINITION: entries in `DECLINED_RECURRENCE` — a recurrence-labelled component a person read
    // and refused to mark, with the reason. 15 entries covering 25 components on 2026-08-16.
    const checks = verifyDeclinedQuotes(DECLINED_RECURRENCE, await loadPages());
    expect(checks.filter((c) => c.pageMissing || c.missing.length > 0)).toEqual([]);
    expect(checks.length).toBe(15);
    expect(
      Object.values(DECLINED_RECURRENCE).reduce((s, d) => s + d.componentIds.length, 0),
    ).toBe(25);
  });

  it('a refusal must say why, in enough words to be a reason', () => {
    for (const [key, d] of Object.entries(DECLINED_RECURRENCE)) {
      expect(d.why.length, `${key} declines with no stated reason`).toBeGreaterThan(80);
      expect(d.verbatim.length, `${key} declines with no checked sentence`).toBeGreaterThan(0);
      expect(d.componentIds.length).toBeGreaterThan(0);
    }
  });

  it('the ten held by the per-tick reading are really in that reading', () => {
    // The claim `held-by-the-per-tick-reading` makes is mechanical and checkable: the entry is in
    // PER_TICK_READS and is deliberately unmarked there. If that ever stops being true the reason
    // recorded here becomes false, and a false reason is worse than none.
    const held = Object.entries(DECLINED_RECURRENCE).filter(
      ([, d]) => d.verdict === 'held-by-the-per-tick-reading',
    );
    expect(held).toHaveLength(10);
    for (const [key] of held) {
      const row = PER_TICK_READS.find((r) => r.key === key);
      expect(row, `${key} claims the per-tick reading holds it and is not in that table`).toBeDefined();
      expect(row!.marked, `${key} is marked in PER_TICK_READS, so it is not held`).toBe(false);
    }
  });

  it('the five read for the first time are NOT in the per-tick reading', () => {
    // The mirror of the check above: a row claiming a fresh reading must not be one the per-tick
    // table already covers, or two tables hold opposite records of the same entry.
    const fresh = Object.entries(DECLINED_RECURRENCE).filter(
      ([, d]) => d.verdict !== 'held-by-the-per-tick-reading',
    );
    expect(fresh.map(([k]) => k).sort()).toEqual([
      'Janna/Q/Howling Gale',
      'Maokai/E/Sapling Toss',
      'Miss Fortune/R/Bullet Time',
      "Nautilus/W/Titan's Wrath",
      'Trundle/R/Subjugate',
    ]);
    for (const [key] of fresh) expect(PER_TICK_READS.find((r) => r.key === key)).toBeUndefined();
  });
});
