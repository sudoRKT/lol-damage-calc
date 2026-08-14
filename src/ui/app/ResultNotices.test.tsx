// @vitest-environment jsdom
//
// THE TWO REQUIREMENTS EVERY RESULT CARRIES — SPECIFICATION §15's scope disclaimer and §8's
// report control. Both were absent from the built page until 2026-08-14; DESIGN-AUDIT.md part 2
// recorded them as layout-affecting, and they landed in the result region rather than bolted on.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import type { Scenario } from '../../types';
import { ResultNotices, SCOPE_DISCLAIMER, buildReport } from './ResultNotices';
import { startingConfig, startingCombo } from './App';
import { CURRENT_URL_VERSION, scenarioFromUrl } from '../../url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

afterEach(cleanup);

const SPEC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'SPECIFICATION.md'),
  'utf8',
);

const SCENARIO: Scenario = {
  version: CURRENT_URL_VERSION,
  attacker: startingConfig('Lux'),
  defender: startingConfig('Garen'),
  combo: startingCombo(),
};

const mount = () =>
  render(
    <ResultNotices
      scenario={SCENARIO}
      result={MOCK_RESULT}
      attackerName="Lux"
      defenderName="Garen"
      origin="https://limittest.example"
    />,
  );

describe('notices/the scope disclaimer (§15)', () => {
  it('is QUOTED FROM THE SPECIFICATION, word for word', () => {
    // The strongest form of this check: the sentence in the code is found inside the
    // specification file itself. A paraphrase, a tidied comma or a dropped clause fails here,
    // because §15 fixes the WORDING and not merely the meaning.
    //
    // Normalised only for markdown's own noise — §15 sets the sentence as a blockquote, so the
    // file carries "> " at the start of each line and hard-wraps mid-sentence. Neither is part
    // of the notice.
    const prose = SPEC.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toContain(SCOPE_DISCLAIMER.replace(/\s+/g, ' '));
  });

  it('is on screen with the result, as real text', () => {
    mount();
    expect(screen.getByText(SCOPE_DISCLAIMER)).toBeTruthy();
  });

  it('IS NOT DISMISSIBLE — §15 says "displayed alongside results", not "offered"', () => {
    mount();
    const notices = screen.getByRole('region', { name: 'About this result' });
    const dismiss = [...notices.querySelectorAll('button')].filter((b) =>
      /close|dismiss|hide|got it|ok/i.test(b.textContent ?? ''),
    );
    expect(dismiss).toEqual([]);
  });
});

describe('notices/report a wrong number (§8)', () => {
  it('is one action — a single link, already filled in', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Report a wrong number' });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/.+\/issues\/new\?/);
  });

  it('CARRIES A LINK THAT REPRODUCES THE EXACT SCENARIO', () => {
    // The whole point. "Lux Q looks wrong" is unactionable; a link that reopens the exact
    // configuration is a bug somebody can fix. This decodes the link back out of the report
    // body and checks it is the scenario that was on screen — not merely that a URL is present.
    const report = buildReport(SCENARIO, MOCK_RESULT, 'https://limittest.example', 'Lux', 'Garen');
    const found = /Scenario: (\S+)/.exec(report.body);
    expect(found, 'no scenario link in the report body').not.toBeNull();
    const decoded = scenarioFromUrl(found![1]!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.scenario).toEqual(SCENARIO);
  });

  it('the link points at the CALCULATOR, not at whatever page the reader was on', () => {
    const report = buildReport(SCENARIO, MOCK_RESULT, 'https://limittest.example', 'Lux', 'Garen');
    expect(report.body).toContain('https://limittest.example/calculator/#s=');
  });

  it('names the matchup and the patch in the title, so a maintainer can triage without opening it', () => {
    const report = buildReport(SCENARIO, MOCK_RESULT, 'https://x', 'Lux', 'Garen');
    expect(report.title).toBe(`Wrong number: Lux vs Garen (patch ${MOCK_RESULT.patch})`);
  });

  it('carries the evidence a maintainer needs: totals, verdict, statuses, exclusions', () => {
    const report = buildReport(SCENARIO, MOCK_RESULT, 'https://x', 'Lux', 'Garen');
    expect(report.body).toContain(`Patch: ${MOCK_RESULT.patch}`);
    expect(report.body).toContain(`Burst total: ${MOCK_RESULT.burst.total}`);
    expect(report.body).toContain('Verification statuses in this combo:');
    expect(report.body).toContain('Excluded from the total:');
  });

  it('REFUSES RATHER THAN SENDING A REPORT WITHOUT ITS SCENARIO', () => {
    // A scenario the link format cannot carry would otherwise produce a report that looks
    // complete and lacks the one thing that makes it useful. It says so instead.
    const unencodable = {
      ...SCENARIO,
      combo: [{ id: 'x', kind: 'not-a-real-kind', ref: 'Q' }],
    } as unknown as Scenario;
    const report = buildReport(unencodable, MOCK_RESULT, 'https://x', 'Lux', 'Garen');
    expect(report.href).toBeNull();
    expect(report.problem).toBeTruthy();
    expect(report.body).toContain('could not be encoded');
  });

  it('offers a route for somebody with no GitHub account, CARRYING THE SCENARIO', () => {
    // The honest limit of "one action": it needs an account. The fallback must not degrade into
    // "describe your scenario from memory" — it carries the same fragment a shared link does, so
    // /report/ rebuilds the identical report as copyable text.
    mount();
    const fallback = screen.getByRole('link', { name: 'Send it another way' });
    const href = fallback.getAttribute('href')!;
    expect(href.startsWith('/report/#s=')).toBe(true);
    const decoded = scenarioFromUrl(`https://limittest.example${href}`);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.scenario).toEqual(SCENARIO);
  });

  it('and falls back to the bare page when the scenario cannot be encoded', () => {
    const unencodable = {
      ...SCENARIO,
      combo: [{ id: 'x', kind: 'not-a-real-kind', ref: 'Q' }],
    } as unknown as Scenario;
    expect(buildReport(unencodable, MOCK_RESULT, 'https://x', 'Lux', 'Garen').fallbackHref).toBe(
      '/report/',
    );
  });
});

describe('notices/the scope disclaimer and the excluded list are BOTH required', () => {
  it('the fixed sentence is not the engine’s generated list, and neither substitutes', () => {
    // The tidy-up a later session will be tempted to make. §15's sentence is fixed and legal;
    // the engine's list is generated, specific and changes with the scenario. Merging them loses
    // whichever half is not generated.
    expect(SCOPE_DISCLAIMER).not.toContain('penetration');
    expect(MOCK_RESULT.excludedMechanics.join(' ')).not.toContain(SCOPE_DISCLAIMER);
    expect(MOCK_RESULT.excludedMechanics.length).toBeGreaterThan(0);
  });
});
