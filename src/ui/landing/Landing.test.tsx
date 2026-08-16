// @vitest-environment jsdom
//
// THE LANDING PAGE — the three things about it that must not quietly change.
//
// 1. NO FIGURE ON IT IS TYPED. Every number comes from the generated coverage file. A sweep here
//    catches a literal creeping into the page, which is how a claim about trustworthiness goes
//    stale without anyone noticing.
// 2. THE AUTHOR'S NOTE IS NOT IN THE LEGAL FOOTER. It says the author is a paralegal; the rest
//    of the note, on the About page, says the long-term goal is to work with Riot's legal team.
//    Rendered inside or adjacent to "not endorsed by Riot Games", that invites a reader to
//    connect the two — and the reading nobody wants is that the author is hinting at a
//    relationship that does not exist.
// 3. NO FABRICATED DAMAGE FIGURE. The easy way to make a calculator's landing page look good is
//    to print a big damage number on it. A number nobody can trace is the plausible wrong figure
//    this whole product exists to prevent, and the front page is the worst place for one.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Landing } from './Landing';
import { PageShell } from '../shell';
import { RIOT_DISCLAIMER } from '../shell/SiteFooter';
import { CAPABILITY as capability, COVERAGE as coverage } from '../coverage';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'Landing.tsx'), 'utf8');

const mountPage = () =>
  render(
    <PageShell current="landing" bareMasthead>
      <Landing />
    </PageShell>,
  );

describe('landing/every figure is generated, never typed', () => {
  it('prints the counts the data produced', () => {
    mountPage();
    const text = document.body.textContent ?? '';
    for (const figure of [
      coverage.abilities,
      coverage.champions,
      coverage.verified,
      coverage.derived,
      coverage.incomplete,
      coverage.noDamage,
      coverage.permanentlyUnanswerable,
    ]) {
      expect(text, `figure ${figure}`).toContain(String(figure));
    }
    expect(text).toContain(coverage.patch);
  });

  it('CONTAINS NO HAND-TYPED NUMBER in its own source', () => {
    // The mechanical form of the rule. Any bare integer of two digits or more in the component
    // is a figure somebody typed, which is a figure that will be wrong after a patch.
    // Stripped first: comments (which quote figures as prose) and `coverage.` references.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const typed = [...code.matchAll(/\b\d{2,}\b/g)].map((m) => m[0]);
    expect(typed).toEqual([]);
  });

  it('the claim in the standfirst is the generated refusal count, not a rounded one', () => {
    mountPage();
    const lede = screen.getByRole('region', { name: 'What this is' });
    // The whole sentence, not the bare digits: the claim is "N abilities are not shown", and a
    // test that only looked for "247" would keep passing if the sentence around it changed.
    expect(
      within(lede).getByText(new RegExp(`${coverage.incomplete} abilities are not shown at all`)),
    ).toBeTruthy();
  });
});

describe('landing/it names the gaps a reader would otherwise assume away', () => {
  // Every other calculator models runes, so a page silent about them is read as modelling them —
  // and a total missing a keystone is exactly the plausible wrong number this product exists to
  // prevent. Same for the defender's own shields and heals. Both figures are generated.
  it('states the rune coverage as a fraction, not as a silence', () => {
    mountPage();
    const gaps = screen.getByRole('region', { name: 'What it does not do' });
    expect(gaps.textContent).toContain(
      `${capability.runesModelled} of ${capability.runesPublished} runes change a number.`,
    );
  });

  it('states that none of the defender’s own defensive effects is applied', () => {
    mountPage();
    const gaps = screen.getByRole('region', { name: 'What it does not do' });
    expect(gaps.textContent).toContain(
      `${capability.defensiveApplied} of ${capability.defensiveStored} defensive effects`,
    );
  });

  it('says recurring damage is counted but kept out of the burst, and the verdict given twice', () => {
    mountPage();
    const gaps = screen.getByRole('region', { name: 'What it does not do' });
    expect(gaps.textContent).toContain('kept out of the burst total');
    expect(gaps.textContent).toContain('survival verdict is given twice');
  });

  it('and these are not zeroes typed in — they come from the generated file', () => {
    // If either ever becomes non-zero, the sentences above become false and must be rewritten.
    // This is the tripwire for that day.
    expect(capability.runesModelled).toBe(1); // was 0 until Scorch landed, 2026-08-15
    // WAS 0 UNTIL THE WIRING LANDED, hours after this test was written, and it was placed as a
    // tripwire for exactly that. 77 of 155 now change a figure — the engine's own measurement,
    // not the 90 that merely LOOK ready.
    expect(capability.defensiveApplied).toBe(90) // 77 until 2026-08-15; 86 until 2026-08-16; then 92 for one commit and 90 now. THE FIGURE IS DERIVED SINCE 2026-08-16 — countAppliedDefences in the engine, with its scenario written down — and 90 matches neither earlier number because neither had its parameters in the tree. See capability.ts for the three figures side by side and the unreconciled population difference. These two assertions are the only places it is pinned independently of that derivation.
  });
});

describe('landing/the author’s note is not a legal notice', () => {
  it('carries the first sentence only, and points at About for the rest', () => {
    mountPage();
    const note = screen.getByRole('complementary', { name: 'A note from the author' });
    expect(note.textContent).toContain(
      'Built by RKT, a paralegal in London studying to qualify as a solicitor.',
    );
    // The rest of the note lives on About. If it ever appears here, this fails.
    expect(note.textContent).not.toContain('Riot');
    expect(within(note).getByRole('link', { name: /More about why this exists/ })).toBeTruthy();
  });

  it('IS NOT INSIDE THE FOOTER, and the footer is not inside it', () => {
    mountPage();
    const note = screen.getByRole('complementary', { name: 'A note from the author' });
    const legal = screen.getByRole('region', { name: 'Legal notices' });
    expect(note.contains(legal)).toBe(false);
    expect(legal.contains(note)).toBe(false);
  });

  it('and they do not share a parent element either', () => {
    // Not merely un-nested — visually separated. A shared immediate parent would put them in one
    // band with one background, which is the thing being avoided.
    mountPage();
    const note = screen.getByRole('complementary', { name: 'A note from the author' });
    const legal = screen.getByRole('region', { name: 'Legal notices' });
    expect(note.parentElement).not.toBe(legal.parentElement);
  });

  it('THE RIOT DISCLAIMER IS QUOTED FROM THE SPECIFICATION, word for word', () => {
    // The drift this closes: §15 carried the placeholder "[Product Name]" while the footer had
    // been shipping a real name since the pages existed, so the specification and the notice a
    // reader actually sees disagreed about what the product is called. Both now say Limit Test,
    // and this asserts they keep saying the same thing.
    //
    // Normalised only for markdown's own noise — §15 sets the notice as a blockquote, so the
    // file carries "> " on each line and hard-wraps mid-sentence.
    const spec = readFileSync(
      join(HERE, '..', '..', '..', 'SPECIFICATION.md'),
      'utf8',
    ).replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
    expect(spec).toContain(RIOT_DISCLAIMER.replace(/\s+/g, ' '));
  });

  it('the Riot disclaimer is still on the page, in full and as real text', () => {
    // §15 requires it "readily visible". Keeping the note away from it must never become a
    // reason for it to go missing.
    mountPage();
    const legal = screen.getByRole('region', { name: 'Legal notices' });
    expect(legal.textContent).toContain(RIOT_DISCLAIMER);
  });
});

describe('landing/nothing on it is a damage figure', () => {
  it('prints no invented result', () => {
    mountPage();
    // The damage primitives are the only things that render a damage figure in this product.
    // None of them should ever appear here: there is no scenario behind this page.
    expect(document.querySelector('.dmg')).toBeNull();
    expect(document.querySelector('.agg')).toBeNull();
    expect(document.querySelector('.burn')).toBeNull();
  });
});

describe('landing/the calculator is one click away', () => {
  it('links straight to it, with no step in between', () => {
    mountPage();
    const go = screen.getByRole('link', { name: 'Open the calculator' });
    expect(go.getAttribute('href')).toBe('/calculator/');
  });
});
