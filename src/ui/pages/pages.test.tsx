// @vitest-environment jsdom
//
// THE SIX PROSE PAGES — the promises each one makes that a later session must not quietly drop.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PageShell } from '../shell';
import { RIOT_DISCLAIMER } from '../shell/SiteFooter';
import { AboutPage, ChangelogPage, ChecksPage, CookiesPage, PrivacyPage, ReportPage, CHANGELOG_ENTRIES, reportTemplate } from './index';
import { COVERAGE } from '../coverage';

afterEach(cleanup);

const mount = (id: string, node: React.ReactNode) =>
  render(<PageShell current={id}>{node}</PageShell>);

describe('pages/how the numbers are checked', () => {
  it('every figure is generated, and the five rows account for the whole roster', () => {
    mount('checks', <ChecksPage />);
    const counts = [...document.querySelectorAll('.ledger__count')].map((e) => Number(e.textContent));
    expect(counts).toHaveLength(5);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(COVERAGE.abilities);
  });

  it('says what DERIVED does not claim, not only what it does', () => {
    // The honest half. A page that only lists the three checks reads as a sales pitch for them.
    mount('checks', <ChecksPage />);
    expect(document.body.textContent).toContain('What derived does not claim');
  });

  it('says verified is not a target to be maximised', () => {
    mount('checks', <ChecksPage />);
    expect(document.body.textContent).toContain('not a target to be maximised');
  });
});

describe('pages/changelog', () => {
  it('says plainly that it is empty while it is', () => {
    // SPECIFICATION §8 requires the log. Filling it with development history to look established
    // would be the dishonesty this product is against, on the page that records dishonesty.
    expect(CHANGELOG_ENTRIES).toEqual([]);
    mount('changelog', <ChangelogPage />);
    expect(document.body.textContent).toContain('Nothing yet.');
  });
});

describe('pages/report a wrong number', () => {
  it('offers the whole report as copyable text, in a real field', () => {
    mount('report', <ReportPage />);
    const box = screen.getByLabelText('Your report, ready to copy') as HTMLTextAreaElement;
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain('What I think is wrong');
    expect(box.value).toContain('Scenario:');
  });

  it('the template tells a reader how to supply the scenario when the page has none', () => {
    expect(reportTemplate(null)).toContain('paste the address bar');
  });

  it('and carries the real link when the page was opened with one', () => {
    expect(reportTemplate('https://limittest.site/calculator/#s=abc')).toContain(
      'Scenario: https://limittest.site/calculator/#s=abc',
    );
  });

  it('has a copy control named in words', () => {
    mount('report', <ReportPage />);
    expect(screen.getByRole('button', { name: 'Copy the report' })).toBeTruthy();
  });
});

describe('pages/about', () => {
  it('carries the author’s note IN FULL, unlike the landing page', () => {
    mount('about', <AboutPage />);
    const note = screen.getByRole('complementary', { name: 'A note from the author' });
    expect(note.textContent).toContain('Built by RKT, a paralegal in London');
    expect(note.textContent).toContain('work with Riot’s legal team');
    expect(note.textContent).toContain('contribution to Riot’s players');
  });

  it('AND STILL KEEPS IT OUT OF THE LEGAL FOOTER', () => {
    // The same rule as the landing page, and it matters more here: this is the version that
    // mentions Riot's legal team, so adjacency to "not endorsed by Riot Games" is the exact
    // juxtaposition to avoid.
    mount('about', <AboutPage />);
    const note = screen.getByRole('complementary', { name: 'A note from the author' });
    const legal = screen.getByRole('region', { name: 'Legal notices' });
    expect(note.contains(legal)).toBe(false);
    expect(legal.contains(note)).toBe(false);
    expect(note.parentElement).not.toBe(legal.parentElement);
    expect(within(legal).getByText(RIOT_DISCLAIMER)).toBeTruthy();
  });
});

describe('pages/privacy and cookies carry the advertising gate', () => {
  // PLAN.md §6: advertising cannot be switched on before these pages describe it, because §16
  // without §15 puts the product out of compliance with its own specification. These assertions
  // exist so the warning cannot be quietly dropped on the day it becomes inconvenient.
  it('the privacy policy says no advertising runs until it is described', () => {
    mount('privacy', <PrivacyPage />);
    expect(document.body.textContent).toContain(
      'No advertising will run until this page and the cookie policy describe it accurately',
    );
  });

  it('the cookie policy says the same', () => {
    mount('cookies', <CookiesPage />);
    expect(document.body.textContent).toContain('Until all of that exists, no advertising runs.');
  });

  it('both state what is true TODAY rather than what is planned', () => {
    mount('cookies', <CookiesPage />);
    expect(document.body.textContent).toContain('This site sets no cookies');
    cleanup();
    mount('privacy', <PrivacyPage />);
    expect(document.body.textContent).toContain('What this site processes today: nothing');
  });
});
