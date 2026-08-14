// THE LANDING PAGE'S FIGURES ARE RE-DERIVED HERE, ON EVERY RUN.
//
// `coverage.json` is generated and committed. A generated file nobody re-derives is a hand-typed
// file with extra steps: it is right on the day it is written and silently wrong after the next
// patch. This recounts from `public/data/` and fails if the committed figures differ by one.
//
// It matters more than a normal staleness check because of WHAT the figures are. They are the
// landing page's entire claim — "this many abilities are checked, this many are not shown, and
// every one of those says why". A stale number there is a false claim about trustworthiness on
// the page that exists to establish trustworthiness.

import { describe, expect, it } from 'vitest';
import committed from './coverage.json';
import { coverageAddsUp, summariseCoverage, type CoverageEntry } from './coverage';
import {
  readPublishedCoverage,
  readmeBlock,
  spliceReadme,
} from '../../../scripts/site/build-coverage.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('coverage/the committed figures match the published data', () => {
  it('recounts every ability file and gets the same answer', () => {
    // If this fails: run `npm run build:coverage`. Do NOT edit coverage.json by hand — the whole
    // point is that no figure on the landing page is typed by a person.
    expect(readPublishedCoverage()).toEqual(committed);
  });

  it('the four statuses account for every ability, with none left over', () => {
    expect(coverageAddsUp(committed)).toBe(true);
    expect(
      committed.verified + committed.derived + committed.incomplete + committed.noDamage,
    ).toBe(committed.abilities);
  });

  it('is counting a real population, so it cannot pass by finding nothing', () => {
    expect(committed.abilities).toBeGreaterThan(900);
    expect(committed.champions).toBe(173);
    expect(committed.patch).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('coverage/the summariser refuses what it does not understand', () => {
  const meta = { patch: '16.16.1', champions: 1 };

  it('counts the four statuses SPECIFICATION §8 defines', () => {
    const entries: CoverageEntry[] = [
      { verification: 'verified' },
      { verification: 'derived' },
      { verification: 'derived' },
      { verification: 'incomplete', notes: 'the source does not state the owner' },
      { verification: 'no-damage' },
    ];
    const c = summariseCoverage(entries, meta);
    expect([c.verified, c.derived, c.incomplete, c.noDamage]).toEqual([1, 2, 1, 1]);
    expect(coverageAddsUp(c)).toBe(true);
  });

  it('THROWS on a fifth status rather than dropping it from the totals', () => {
    // The failure this prevents: a breakdown that no longer adds up to its own total while
    // looking perfectly reasonable. Every figure would be individually plausible and the page
    // would be lying about the roster.
    expect(() => summariseCoverage([{ verification: 'probably-fine' }], meta)).toThrow(
      /unknown verification status/,
    );
  });

  it('counts a permanently unanswerable entry as BOTH permanent and reasoned', () => {
    // SPECIFICATION §8: a permanent entry carries `unresolvable`, which names the missing fact
    // and is a fuller answer than any note. It must not be counted as "no reason given".
    const c = summariseCoverage(
      [{ verification: 'incomplete', unresolvable: [{ field: 'armor owner' }] }],
      meta,
    );
    expect(c.permanentlyUnanswerable).toBe(1);
    expect(c.incompleteWithReason).toBe(1);
  });

  it('does not count an empty note as a reason', () => {
    const c = summariseCoverage([{ verification: 'incomplete', notes: '   ' }], meta);
    expect(c.incompleteWithReason).toBe(0);
  });
});

describe('coverage/the README quotes the same figures', () => {
  it('its generated block is current', () => {
    // Markdown cannot import JSON, so the README's figures are SPLICED IN by the same script
    // that writes coverage.json — and this fails if the file on disk has drifted from what the
    // data now says. It is the README that a visitor reads before anything else, and a stale
    // claim about trustworthiness there is worse than none.
    //
    // If this fails: run `npm run build:coverage`. Do not edit the block by hand.
    const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
    expect(readme).toBe(spliceReadme(readme, readmeBlock(readPublishedCoverage())));
  });
});
