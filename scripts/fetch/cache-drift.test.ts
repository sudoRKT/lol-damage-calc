// Known-answer tests for the cache-drift measurement.
//
// Every function under test here is pure — no network. The one fixture that came off the wire is
// recorded verbatim as a literal below (`GANGPLANK_PASS1_REPLY`), captured from the live API on
// 2026-08-15, so the parser is tested against the shape the wiki actually returns rather than the
// shape this module hopes it returns.

import { describe, expect, it } from 'vitest';

import {
  BATCH_SIZE,
  buildDriftRows,
  chunk,
  checkVerbatimSurvival,
  classifyDrift,
  crossReferenceReadings,
  diffWikitext,
  extractionSignature,
  isPatchBoundaryCrossed,
  measureExtractionSensitivity,
  pageKey,
  parseRevisionsResponse,
  summariseDrift,
  type CachedPageView,
  type DriftRow,
  type LiveRevision,
} from './cache-drift.ts';

// ---------------------------------------------------------------------------------------------
// A recorded reply from the live wiki, 2026-08-15. Shape as `formatversion=2` returns it, with a
// redirect row (Template:Data Gangplank/Q -> Template:Data Gangplank/Parrrley) and a missing page.
// ---------------------------------------------------------------------------------------------
const GANGPLANK_PASS1_REPLY = {
  query: {
    redirects: [{ from: 'Template:Data Gangplank/Q', to: 'Template:Data Gangplank/Parrrley' }],
    pages: [
      {
        pageid: 999001,
        title: 'Template:Data Gangplank/Parrrley',
        revisions: [
          {
            revid: 4051880,
            timestamp: '2026-08-14T11:02:17Z',
            user: 'SomeEditor',
            comment: 'update damage values',
          },
        ],
      },
      {
        title: 'Template:Data Nobody/Nothing',
        missing: true,
      },
    ],
  },
};

const page = (over: Partial<CachedPageView> = {}): CachedPageView => ({
  requested: 'Template:Data Gangplank/Q',
  resolved: 'Template:Data Gangplank/Parrrley',
  champion: 'Gangplank',
  slot: 'Q',
  abilityName: 'Parrrley',
  revid: 4015393,
  wikitext: 'line one\nline two\n',
  ...over,
});

const rev = (revid: number, over: Partial<LiveRevision> = {}): LiveRevision => ({
  revid,
  timestamp: '2026-08-14T11:02:17Z',
  comment: 'update damage values',
  user: 'SomeEditor',
  ...over,
});

// =============================================================================================
describe('drift-definition', () => {
  it('calls a page unchanged only when the live revision id equals the cached one', () => {
    expect(classifyDrift(4015393, 4015393)).toBe('unchanged');
  });

  it('calls a page moved when the ids differ, in either direction', () => {
    expect(classifyDrift(4015393, 4051880)).toBe('moved');
    // A lower live id should never happen, but if it does it is drift, not agreement.
    expect(classifyDrift(4051880, 4015393)).toBe('moved');
  });

  it('calls a page vanished when the wiki returned no revision for it', () => {
    expect(classifyDrift(4015393, null)).toBe('vanished');
  });
});

// =============================================================================================
describe('drift-known-answer-gangplank', () => {
  // The one page DATA-SOURCES records concretely: cached 4015393 against live 4051880.
  it('reproduces the recorded Gangplank Parrrley drift from the recorded API reply', () => {
    const { found, missing } = parseRevisionsResponse(GANGPLANK_PASS1_REPLY);
    expect(found.get('Template:Data Gangplank/Parrrley')?.revid).toBe(4051880);
    expect(missing).toEqual(['Template:Data Nobody/Nothing']);

    const rows = buildDriftRows([page()], found);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('moved');
    expect(rows[0]!.cachedRevid).toBe(4015393);
    expect(rows[0]!.liveRevid).toBe(4051880);
    expect(rows[0]!.key).toBe('Gangplank/Q/Parrrley');
    expect(rows[0]!.editedOn).toBe('2026-08-14T11:02:17Z');
    expect(rows[0]!.editComment).toBe('update damage values');
  });

  it('resolves a redirected title to the same revision, so a lookup by either name works', () => {
    const { found } = parseRevisionsResponse(GANGPLANK_PASS1_REPLY);
    expect(found.get('Template:Data Gangplank/Q')?.revid).toBe(4051880);
    expect(found.get('Template:Data Gangplank/Parrrley')?.revid).toBe(4051880);
  });

  it('records a title the wiki did not return as vanished rather than dropping it', () => {
    const rows = buildDriftRows([page({ resolved: 'Template:Data Nobody/Nothing' })], new Map());
    expect(rows[0]!.status).toBe('vanished');
    expect(rows[0]!.liveRevid).toBeNull();
  });
});

// =============================================================================================
describe('drift-summary-counts', () => {
  it('the three counts partition the population exactly', () => {
    const pages = [
      page({ champion: 'A', abilityName: 'a', resolved: 'T/A', revid: 1 }),
      page({ champion: 'B', abilityName: 'b', resolved: 'T/B', revid: 2 }),
      page({ champion: 'C', abilityName: 'c', resolved: 'T/C', revid: 3 }),
      page({ champion: 'D', abilityName: 'd', resolved: 'T/D', revid: 4 }),
    ];
    const live = new Map<string, LiveRevision>([
      ['T/A', rev(1)],
      ['T/B', rev(99)],
      ['T/C', rev(3)],
      // T/D absent -> vanished
    ]);
    const s = summariseDrift(buildDriftRows(pages, live));
    expect(s).toEqual({ total: 4, unchanged: 2, moved: 1, vanished: 1 });
    expect(s.unchanged + s.moved + s.vanished).toBe(s.total);
  });

  it('reports zero moved when nothing has drifted', () => {
    const pages = [page({ revid: 7 })];
    const live = new Map([['Template:Data Gangplank/Parrrley', rev(7)]]);
    expect(summariseDrift(buildDriftRows(pages, live))).toEqual({
      total: 1,
      unchanged: 1,
      moved: 0,
      vanished: 0,
    });
  });
});

// =============================================================================================
describe('drift-verbatim-survival', () => {
  // This is the check the whole module exists for: a reading is only as good as the sentence it
  // was read from, and `verbatim` is that sentence as a literal substring.
  const SENTENCE =
    'tramples the ground around him every {{fd|0.5}} seconds over 5 seconds, becoming {{tip|ghosted}}';

  it('says the reading still rests when the sentence is still on the live page', () => {
    const live = `{{Ability data\n|description=Alistar ${SENTENCE} and dealing damage.\n}}`;
    const r = checkVerbatimSurvival(live, [SENTENCE]);
    expect(r.survived).toEqual([SENTENCE]);
    expect(r.lost).toEqual([]);
  });

  it('says the reading is LOST when the wiki has reworded the sentence', () => {
    const live = '{{Ability data\n|description=Alistar tramples every 0.25 seconds over 5 seconds.\n}}';
    const r = checkVerbatimSurvival(live, [SENTENCE]);
    expect(r.survived).toEqual([]);
    expect(r.lost).toEqual([SENTENCE]);
  });

  it('reports partial survival rather than collapsing a multi-sentence reading to one verdict', () => {
    const kept = 'over 5 seconds';
    const gone = 'every {{fd|0.5}} seconds';
    const live = 'Alistar tramples over 5 seconds.';
    const r = checkVerbatimSurvival(live, [kept, gone]);
    expect(r.survived).toEqual([kept]);
    expect(r.lost).toEqual([gone]);
  });

  it('treats an empty verbatim list as nothing to lose, not as a pass it did not earn', () => {
    const r = checkVerbatimSurvival('anything', []);
    expect(r.survived).toEqual([]);
    expect(r.lost).toEqual([]);
  });
});

// =============================================================================================
describe('drift-reading-crossreference', () => {
  const rows: DriftRow[] = [
    {
      key: 'Alistar/E/Trample',
      champion: 'Alistar',
      slot: 'E',
      abilityName: 'Trample',
      resolved: 'T/Trample',
      cachedRevid: 1,
      liveRevid: 2,
      status: 'moved',
    },
    {
      key: 'Darius/R/Noxian Guillotine',
      champion: 'Darius',
      slot: 'R',
      abilityName: 'Noxian Guillotine',
      resolved: 'T/NG',
      cachedRevid: 1,
      liveRevid: 1,
      status: 'unchanged',
    },
    {
      key: 'Nobody/Q/Nothing',
      champion: 'Nobody',
      slot: 'Q',
      abilityName: 'Nothing',
      resolved: 'T/N',
      cachedRevid: 1,
      liveRevid: 5,
      status: 'moved',
    },
  ];

  it('names only the moved pages that carry a stored reading', () => {
    const readKeys = new Set(['Alistar/E/Trample', 'Darius/R/Noxian Guillotine']);
    const hit = crossReferenceReadings(rows, readKeys);
    expect(hit.map((r) => r.key)).toEqual(['Alistar/E/Trample']);
  });

  it('does not report an unchanged page even when it carries a reading', () => {
    const readKeys = new Set(['Darius/R/Noxian Guillotine']);
    expect(crossReferenceReadings(rows, readKeys)).toEqual([]);
  });

  it('reports a vanished page carrying a reading, not just a moved one', () => {
    const vanished: DriftRow[] = [
      { ...rows[0]!, status: 'vanished', liveRevid: null },
    ];
    expect(crossReferenceReadings(vanished, new Set(['Alistar/E/Trample']))).toHaveLength(1);
  });
});

// =============================================================================================
describe('drift-wikitext-diff', () => {
  it('reports identical when the live text matches the cache byte for byte', () => {
    const d = diffWikitext('a\nb\nc', 'a\nb\nc');
    expect(d.identical).toBe(true);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('names the removed and added lines of a changed value', () => {
    const d = diffWikitext('|damage=70\n|cost=50', '|damage=75\n|cost=50');
    expect(d.identical).toBe(false);
    expect(d.removed).toEqual(['|damage=70']);
    expect(d.added).toEqual(['|damage=75']);
  });

  it('counts a repeated line by multiplicity rather than by presence', () => {
    const d = diffWikitext('x\nx\ny', 'x\ny');
    expect(d.removed).toEqual(['x']);
    expect(d.added).toEqual([]);
  });
});

// =============================================================================================
describe('drift-patch-boundary', () => {
  it('is not crossed when the pinned patch equals the live one', () => {
    expect(isPatchBoundaryCrossed('16.16.1', '16.16.1')).toBe(false);
  });

  it('is crossed on a minor bump, which is what a refresh must stop for', () => {
    expect(isPatchBoundaryCrossed('16.16.1', '16.17.1')).toBe(true);
  });

  it('is crossed on a hotfix bump too — a stored figure is stated against the full string', () => {
    expect(isPatchBoundaryCrossed('16.16.1', '16.16.2')).toBe(true);
  });
});

// =============================================================================================
describe('drift-batching-courtesy', () => {
  it('batches at 40 titles, the size the cache builder already uses against this wiki', () => {
    expect(BATCH_SIZE).toBe(40);
  });

  it('splits 937 titles into 24 requests with a 17-title remainder', () => {
    const titles = Array.from({ length: 937 }, (_, i) => `t${i}`);
    const batches = chunk(titles, BATCH_SIZE);
    expect(batches).toHaveLength(24);
    expect(batches.at(-1)).toHaveLength(17);
    expect(batches.flat()).toHaveLength(937);
  });

  it('refuses a batch size below one rather than looping forever', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow(/chunk size/);
  });
});

// =============================================================================================
describe('drift-extraction-signature', () => {
  // The question this answers is "did the page's move change a NUMBER, or only words?", so the
  // signature must ignore the things that move on every fetch and notice the things that do not.
  it('ignores provenance, which differs on every fetch and says nothing about damage', () => {
    const a = { base: [70, 105], sourceRevision: 4015393, fetched: '2026-08-13' };
    const b = { base: [70, 105], sourceRevision: 4051880, fetched: '2026-08-15' };
    expect(extractionSignature(a)).toBe(extractionSignature(b));
  });

  it('notices a changed damage figure', () => {
    const a = { components: [{ label: 'Magic Damage', base: [70, 105] }] };
    const b = { components: [{ label: 'Magic Damage', base: [75, 105] }] };
    expect(extractionSignature(a)).not.toBe(extractionSignature(b));
  });

  it('notices a component appearing or disappearing', () => {
    const a = { components: [{ id: 'x' }] };
    const b = { components: [{ id: 'x' }, { id: 'y' }] };
    expect(extractionSignature(a)).not.toBe(extractionSignature(b));
  });

  it('is insensitive to key order, so a reordered object is not reported as a change', () => {
    expect(extractionSignature({ a: 1, b: 2 })).toBe(extractionSignature({ b: 2, a: 1 }));
  });

  it('is sensitive to array order, because component order is meaningful', () => {
    expect(extractionSignature([1, 2])).not.toBe(extractionSignature([2, 1]));
  });

  it('strips provenance at any nesting depth, not just the top level', () => {
    const a = { entry: { components: [{ base: [1], sourceRevision: 1 }] } };
    const b = { entry: { components: [{ base: [1], sourceRevision: 2 }] } };
    expect(extractionSignature(a)).toBe(extractionSignature(b));
  });
});

// =============================================================================================
describe('drift-check-does-not-overclaim', () => {
  // DATA-SOURCES §50: a check that claims more than it measures is its own defect. "The extraction
  // is unchanged" is only evidence if the extraction could have changed. These tests pin that.

  /** A toy extractor that reads one damage number out of a leveling row and ignores everything else. */
  const extractDamage = (text: string): unknown => {
    const m = /\|damage\s*=\s*(\d+)/.exec(text);
    return { damage: m ? Number(m[1]) : null };
  };

  it('reports the comparison as able to see a number when the extractor reads one', () => {
    const wikitext = '|damage = 70\n|cooldown = 12\n';
    const s = measureExtractionSensitivity(wikitext, extractDamage);
    expect(s.tried).toBe(2);
    expect(s.detected).toBe(1); // only the damage number moves the extraction
  });

  it('reports ZERO detections when the extractor reads nothing from the page', () => {
    // This is the Yasuo P / Yorick W case: 0 components extracted, so "unchanged" is vacuous.
    const wikitext = '|cooldown = 12\n|range = 550\n';
    const s = measureExtractionSensitivity(wikitext, extractDamage);
    expect(s.tried).toBe(2);
    expect(s.detected).toBe(0);
  });

  it('counts an extractor that throws on a mutated number as a detection, not a pass', () => {
    const strict = (text: string): unknown => {
      const m = /\|damage\s*=\s*(\d+)/.exec(text);
      if (m && Number(m[1]) > 100) throw new Error('refused');
      return { damage: m ? Number(m[1]) : null };
    };
    const s = measureExtractionSensitivity('|damage = 99\n', strict);
    expect(s.detected).toBe(1);
  });

  it('reports nothing tried when the extractor cannot read the page at all', () => {
    const always = (): unknown => {
      throw new Error('unreadable');
    };
    expect(measureExtractionSensitivity('|damage = 70', always)).toEqual({ tried: 0, detected: 0 });
  });

  it('tries every numeric literal on the page, not just the first', () => {
    const s = measureExtractionSensitivity('1 22 333 4444', () => ({}));
    expect(s.tried).toBe(4);
    expect(s.detected).toBe(0);
  });
});

// =============================================================================================
describe('drift-page-key', () => {
  it('keys on champion/slot/abilityName, the key both read tables use', () => {
    expect(pageKey({ champion: 'Hwei', slot: 'W', abilityName: 'Stirring Lights' })).toBe(
      'Hwei/W/Stirring Lights',
    );
  });

  it('distinguishes two abilities that share a champion and a slot', () => {
    const a = pageKey({ champion: 'Aphelios', slot: 'Q', abilityName: 'Moonshot' });
    const b = pageKey({ champion: 'Aphelios', slot: 'Q', abilityName: 'Onslaught' });
    expect(a).not.toBe(b);
  });
});
