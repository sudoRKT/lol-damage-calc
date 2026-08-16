// @vitest-environment jsdom
//
// THE SIX PROSE PAGES — the promises each one makes that a later session must not quietly drop.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PageShell } from '../shell';
import { RIOT_DISCLAIMER } from '../shell/SiteFooter';
import { AboutPage, ChangelogPage, ChecksPage, CookiesPage, PrivacyPage, ReportPage, CHANGELOG_ENTRIES, reportTemplate } from './index';
import { CAPABILITY, COVERAGE } from '../coverage';

afterEach(cleanup);

const mount = (id: string, node: React.ReactNode) =>
  render(<PageShell current={id}>{node}</PageShell>);

/** The counts inside one named ledger. Scoped by region, because the page now carries two and a
 *  page-wide sweep would silently mix an ability population with an item one. */
const countsIn = (label: string) =>
  [...screen.getByRole('region', { name: label }).querySelectorAll('.ledger__count')].map((e) =>
    Number(e.textContent),
  );

describe('pages/how the numbers are checked', () => {
  it('every figure is generated, and the five rows account for the whole roster', () => {
    mount('checks', <ChecksPage />);
    const counts = countsIn('Every status, and how many abilities hold it');
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

  it('EXPLAINS THAT DERIVED CAN FALL, and that a fall is evidence arriving', () => {
    // Without this, a reader who checks back after a patch sees a smaller number and reads a
    // regression. The count is not a score and the page has to say so in words.
    mount('checks', <ChecksPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Derived is not a number that only goes up');
    expect(text).toContain('evidence arriving, not a regression');
    expect(text).toContain(String(CAPABILITY.perTickAbilitiesIncomplete));
  });

  it('DOES NOT PRESENT THE READ COUNT AND THE HELD-BACK COUNT AS A PARTITION', () => {
    // MEASURED 2026-08-15, on a phone read of the built page. Both counts are generated and both
    // are true, and the paragraph joined them with "the rest" — which claims they are the two
    // halves of one population. They are not, and the arithmetic below is what a reader does:
    //
    //   read (abilitiesWithOverTime)      27
    //   held back (perTickAbilitiesIncomplete) 20   → 47, against a stated 39.
    //
    // Counted from `public/data/abilities/*.json`: of the 39 entries carrying a per-tick label,
    // 27 have been read, 12 have not, and ALL 12 of the unread are incomplete — but so are 8 of
    // the 27 that were read, for reasons of their own. 12 + 8 = 20. So the two figures OVERLAP,
    // and "the rest" is the one word on the page that is false.
    //
    // This asserts the shape of the claim rather than the wording of the fix: while the two
    // counts do not sum to the population, the page may not use partition language about them.
    mount('checks', <ChecksPage />);
    const fall = screen.getByRole('region', { name: 'Why derived can fall' });
    const text = fall.textContent ?? '';
    const partitions =
      CAPABILITY.abilitiesWithOverTime + CAPABILITY.perTickAbilitiesIncomplete ===
      CAPABILITY.perTickAbilities;
    expect(partitions).toBe(false);
    expect(text).not.toMatch(/the rest are held back/i);
    // And it must say WHY the held-back count is larger than the unread one, or the reader is
    // left to reconcile two figures that do not reconcile.
    expect(text).toMatch(/read/i);
    expect(text).toContain(String(CAPABILITY.perTickAbilitiesIncomplete));
  });

  it('EXPLAINS DAMAGE OVER TIME AND WHAT MAKES THE TWO VERDICTS DISAGREE', () => {
    // SPECIFICATION §3.8 requires the verdict twice. Until 2026-08-14 the second one received a
    // zero in every real scenario, so the two lines never differed and nothing said why. A reader
    // shown two verdicts must be told what puts a figure into the second.
    mount('checks', <ChecksPage />);
    const dot = screen.getByRole('region', { name: 'Damage over time and the second verdict' });
    const text = dot.textContent ?? '';
    expect(text).toContain('never folded into the burst total');
    expect(text).toContain(`${CAPABILITY.abilityComponentsOverTime} ability components`);
    expect(text).toContain(
      `${CAPABILITY.itemBurnsThatFire} of the ${CAPABILITY.itemBurns} item burns`,
    );
    expect(text).toContain('The count of ticks is never invented');
  });

  it('NO ROW RESTATES ITS OWN COUNT AS A WORD — a typed number cannot regenerate', () => {
    // Found 2026-08-15. The "over time" row printed the generated count 3 in its figure and then
    // said "these three" in its body. Both were right that day; only one of them re-derives. The
    // day a fourth burn states a tick count and a trigger, the figure becomes 4 and the sentence
    // beside it still reads "three" — a stale number on the page whose whole claim is that
    // nothing on it is typed.
    //
    // IT FLAGS A WORD ONLY WHERE IT EQUALS THAT ROW'S OWN FIGURE, which is what makes it a
    // restatement rather than a coincidence. The derived row says "the three checks above" and
    // means the three numbered points in the prose section — its own count is 474, so that
    // sentence is about something else and is left alone. The burn row said "these three" beside
    // the figure 3, and that is the defect: the same fact printed twice, generated once.
    mount('checks', <ChecksPage />);
    const WORDS: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
      nine: 9, ten: 10, eleven: 11, twelve: 12,
    };
    const offenders: string[] = [];
    for (const row of document.querySelectorAll('.ledger__row')) {
      const count = Number(row.querySelector('.ledger__count')?.textContent);
      const text = row.querySelector('.ledger__meaning')?.textContent ?? '';
      for (const [word, value] of Object.entries(WORDS)) {
        if (value !== count) continue;
        if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
          offenders.push(`row "${count}" says "${word}": ${text.slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the item-effect rows account for every stored effect, with none left over', () => {
    mount('checks', <ChecksPage />);
    const counts = countsIn('Item effects, and which of them fire');
    expect(counts).toHaveLength(4);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(CAPABILITY.itemEffectsStored);
  });

  it('DOES NOT IMPLY ITEM EFFECTS DO NOTHING — it says which of them fire', () => {
    mount('checks', <ChecksPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Item effects, and which of them reach a result');
    expect(text).toContain('on an attack');
    expect(text).toContain('in the combo');
  });

  it('states runes and the defender’s kit as counts, with none of them applied', () => {
    // The failure this closes: silence. A reader told nothing assumes runes are modelled, because
    // every other calculator models them, and a total missing a keystone is a plausible wrong one.
    mount('checks', <ChecksPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain(`Runes: ${CAPABILITY.runesModelled} of ${CAPABILITY.runesPublished}`);
    expect(text).toContain(
      `The defender’s own kit: ${CAPABILITY.defensiveApplied} of ${CAPABILITY.defensiveStored}`,
    );
    expect(CAPABILITY.runesModelled).toBe(1); // was 0 until Scorch landed, 2026-08-15
    // The same tripwire, and it fired the same day. See Landing.test.tsx.
    expect(CAPABILITY.defensiveApplied).toBe(90) // 77 until 2026-08-15; 86 until 2026-08-16; then 92 for one commit and 90 now. THE FIGURE IS DERIVED SINCE 2026-08-16 — countAppliedDefences in the engine, with its scenario written down — and 90 matches neither earlier number because neither had its parameters in the tree. See capability.ts for the three figures side by side and the unreconciled population difference. These two assertions are the only places it is pinned independently of that derivation.
  });

  it('NEVER STATES A COUNT WITHOUT SAYING WHAT IT COUNTS', () => {
    // Mechanical half of the rule: every ledger on this page carries a definition paragraph, and
    // every row carries a label naming its population. A bare figure is the defect.
    mount('checks', <ChecksPage />);
    for (const ledger of document.querySelectorAll('.ledger')) {
      expect(ledger.querySelector('.ledger__defn')?.textContent?.length ?? 0).toBeGreaterThan(40);
      for (const row of ledger.querySelectorAll('.ledger__row')) {
        expect(row.querySelector('.ledger__of')?.textContent ?? '').not.toBe('');
        expect((row.querySelector('.ledger__meaning')?.textContent ?? '').length).toBeGreaterThan(
          40,
        );
      }
    }
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

  it('says what a result includes AND what it still leaves out', () => {
    // "What this is" used to describe abilities alone. Item effects now reach a result and runes
    // still do not; describing neither lets a reader assume both.
    mount('about', <AboutPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Item effects are part of a result');
    expect(text).toContain(`${CAPABILITY.runesModelled} of ${CAPABILITY.runesPublished}`);
    expect(text).toContain('The verdict is given twice');
  });

  it('AGREES WITH THE OTHER TWO PAGES ABOUT THE DEFENDER’S OWN KIT', () => {
    // FOUND 2026-08-15, reading the site on a phone. Three pages state this product's position on
    // the defender's kit and one of them had not been told it changed:
    //
    //   landing  "The defender’s own kit is applied in part: 77 of 155 defensive effects."
    //   checks   "The defender’s own kit: 77 of 155 … 77 actually change a figure."
    //   about    "Runes are not: 0 of 62 … NOR ARE the 155 defensive effects … Both gaps."
    //
    // The FIGURE on the About page was generated and correct; the sentence around it was typed,
    // and it put the defender's kit in the same bucket as runes — a gap. 77 of them change a
    // number. So a reader was told a defender's shields and heals do nothing, and could then
    // watch one absorb damage in a result. That is the product understating itself in the same
    // motion as contradicting its own other pages, which is why this is scoped across all three
    // rather than to the page that was wrong.
    //
    // It asserts AGREEMENT, not wording: while any defence is applied, no page may describe the
    // defensive population as unmodelled, and every page that names it states the applied count.
    expect(CAPABILITY.defensiveApplied).toBeGreaterThan(0);
    const applied = `${CAPABILITY.defensiveApplied} of ${CAPABILITY.defensiveStored}`;

    for (const [id, node] of [
      ['about', <AboutPage />],
      ['checks', <ChecksPage />],
    ] as const) {
      cleanup();
      mount(id, node);
      const text = (document.body.textContent ?? '').replace(/\s+/g, ' ');
      expect(text, `${id} must state the applied count`).toContain(applied);
      expect(text, `${id} must not call the defensive kit an unmodelled gap`).not.toMatch(
        /Nor are the \d+ defensive effects/i,
      );
    }
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
