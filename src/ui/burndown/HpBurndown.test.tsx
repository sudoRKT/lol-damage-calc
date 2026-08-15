// @vitest-environment jsdom
//
// THE CHART IS DATA, AND THIS TESTS IT AS DATA.
//
// Every assertion below asks the ACCESSIBILITY TREE what the chart says — `getByRole` with a
// `name`, which runs Testing Library's own accessible-name computation, the same one a
// screen reader's would follow. Nothing here counts `<div>`s or looks for a class, because a
// test that walks the DOM for a class name passes on a chart that announces nothing.
//
// Two assertions are deliberately about markup and are labelled as such: the 45° DoT hatch
// and the dashed lethal rule are PURELY VISUAL cues, so there is nothing in the
// accessibility tree to ask. Each is paired with an accessible-name assertion covering the
// same fact in words ("damage over time"), which is the point of the redundancy rule.
//
// ═══ WHAT THESE POPOVER TESTS DO AND DO NOT SEE (added 2026-08-14) ═══
//
// The popover assertions below run against MOCK_RESULT, whose figures are whole numbers by
// construction. They prove the popover OPENS, carries the four checkpoints in the contract's
// order, names the fixed modifier order and reports the verification status. **They cannot see
// how a figure is FORMATTED**, because a tidy fixture has no fractional tail to mangle — and the
// popover was in fact printing `57.91960035475755 magic damage after resistances` on real data
// while every test here passed. That class is covered by `../app/rendered-figures.test.tsx`,
// which now opens each riser across all 173 champions against real published data.

import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import {
  BURST_KILLS,
  DEFENDER_HEALS,
  DOT_ONLY_INSTANCE,
  MIXED_INSTANCE,
  UNTYPED_INCOMPLETE_INSTANCE,
} from './mock-variants';
import { HpBurndown } from './HpBurndown';

/**
 * jsdom implements no `matchMedia`, so every test says explicitly which motion preference it
 * is testing. Neither branch can be reached by accident.
 */
function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/** The settled sentence `AggregateTotal` gives assistive technology for MOCK_RESULT. */
// Instance 4 is `incomplete` and contributes nothing (SPECIFICATION §8), so true damage is
// absent from the split and the burst total is 770.
const SETTLED_TOTAL = 'Total: 770 total damage — 570 physical, 200 magic';

beforeEach(() => setReducedMotion(true));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('burndown/accessible-names', () => {
  it('every riser is a focusable control, one per instance plus the DoT tail', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getAllByRole('button').length).toBe(6);
  });

  it('each riser announces its instance, its figure, its damage type IN FULL, and the health it took', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(
      screen.getByRole('button', {
        name: 'Instance 1. Q — The Darkin Blade (1st cast). 240 physical damage. Health 800 down to 560 of 1850. Verified.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Instance 3. W — Infernal Chains. 200 magic damage. Health 380 down to 180 of 1850. Derived.',
      }),
    ).toBeTruthy();
  });

  it('says when a hit was a critical strike', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByRole('button', { name: /critical strike/ })).toBeTruthy();
  });

  it('an incomplete instance says what is missing, not just that it is missing', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByRole('button', { name: /Not yet modelled/ })).toBeTruthy();
  });

  it('the DoT tail announces itself as damage over time — the hatch cue, in words', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(
      screen.getByRole('button', {
        name: /Damage over time.*Sunfire Aegis \(burn\).*160 magic damage over time/,
      }),
    ).toBeTruthy();
  });

  it('NO riser name is a bare tag letter, and every one speaks a damage word in full', () => {
    // The sweep, not a spot check: it runs over every button the chart renders.
    render(<HpBurndown result={MOCK_RESULT} />);
    const offenders: string[] = [];
    for (const b of screen.getAllByRole('button')) {
      const name = b.getAttribute('aria-label') ?? '';
      if (/^[\d\s.,]*[PMT]$/.test(name)) offenders.push(`bare tag: ${name}`);
      if (!/\b(physical|magic|true) damage\b/.test(name)) offenders.push(`no word: ${name}`);
      if (/\s\s/.test(name) || /\.\s*\./.test(name)) offenders.push(`joined badly: ${name}`);
    }
    expect(offenders).toEqual([]);
  });

  /* ═══ THE SWEEP ABOVE PASSED WHILE FOUR OF FIVE REAL SCENARIOS WERE BROKEN ═══
     (added 2026-08-15)

     It runs over ONE fixture, and that fixture is the only Result in the project whose
     zero-damage instance carries a damage type. Every real scenario measured in a browser on
     2026-08-15 — Renekton, Corki, Alistar, Cassiopeia — carries at least one instance reporting
     `damageType: 'none'`, and each of those announced `0  damage`, with the doubled space of an
     empty type word where the type should be. The check existed; the shape did not.

     The rule below is mechanical and stated once: A RISER NEVER PUTS A FIGURE NEXT TO THE WORD
     "damage" WITHOUT A DAMAGE TYPE BETWEEN THEM. That single pattern catches the doubled space,
     catches a bare `0 damage`, and catches any future path that loses a type word — and it runs
     over every fixture this area has rather than the one it was written against. */
  const EVERY_FIXTURE: Array<[string, typeof MOCK_RESULT]> = [
    ['the canonical mock', MOCK_RESULT],
    ['a burst that kills', BURST_KILLS],
    ['a defender who heals', DEFENDER_HEALS],
    ['an instance whose damage is all over time', DOT_ONLY_INSTANCE],
    ['an instance nobody has modelled, with no type', UNTYPED_INCOMPLETE_INSTANCE],
    ['an instance that dealt two types at once', MIXED_INSTANCE],
  ];

  it.each(EVERY_FIXTURE)(
    'no riser states a figure without its damage type, and none is joined badly — %s',
    (_what, result) => {
      render(<HpBurndown result={result} />);
      const offenders: string[] = [];
      for (const b of screen.getAllByRole('button')) {
        const name = b.getAttribute('aria-label') ?? '';
        if (/\d\s*damage/.test(name)) offenders.push(`figure with no type: ${name}`);
        if (/\s\s/.test(name) || /\.\s*\./.test(name)) offenders.push(`joined badly: ${name}`);
      }
      expect(offenders).toEqual([]);
    },
  );

  it('an instance whose damage is ALL over time says so, rather than claiming a zero', () => {
    render(<HpBurndown result={DOT_ONLY_INSTANCE} />);
    expect(
      screen.getByRole('button', {
        name: 'Instance 4. On-hit — true damage (mock). No damage on impact — this ability deals its damage over time, in the +DoT column. Health 180 unchanged, of 1850. Derived.',
      }),
    ).toBeTruthy();
  });

  it('an instance nobody has modelled states no figure at all — its status carries it', () => {
    render(<HpBurndown result={UNTYPED_INCOMPLETE_INSTANCE} />);
    expect(
      screen.getByRole('button', {
        name: 'Instance 4. On-hit — true damage (mock). Health 180 unchanged, of 1850. Not yet modelled.',
      }),
    ).toBeTruthy();
  });

  it('a mixed instance speaks each type with its own figure, and the total untagged', () => {
    render(<HpBurndown result={MIXED_INSTANCE} />);
    expect(
      screen.getByRole('button', {
        name: 'Instance 3. W — Infernal Chains. 80 physical and 120 magic damage, 200 in total. Health 380 down to 180 of 1850. Derived.',
      }),
    ).toBeTruthy();
  });

  it('health that did not move says so, instead of falling to the number it started at', () => {
    render(<HpBurndown result={UNTYPED_INCOMPLETE_INSTANCE} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');
    expect(names.filter((n) => /Health (\d+) down to \1 /.test(n))).toEqual([]);
  });

  it('the chart itself has a name', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByRole('region', { name: 'HP burndown' })).toBeTruthy();
  });
});

describe('burndown/totals-and-verdicts', () => {
  it('announces the rolling total untagged, with its tagged split — the one permitted aggregate', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByText(SETTLED_TOTAL)).toBeTruthy();
  });

  it('BOTH verdicts are printed as text, always', () => {
    // PREMISE CHANGED, not the assertion: the canonical mock's burst no longer kills, so the
    // lethal-burst case is the derived variant. What is asserted — both verdicts, always — is
    // exactly what it was.
    render(<HpBurndown result={BURST_KILLS} />);
    expect(screen.getByRole('row', { name: 'Burst LETHAL' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Burst + DoT LETHAL' })).toBeTruthy();
  });

  it('gives both verdicts for a burst that survives, too', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByRole('row', { name: 'Burst SURVIVES 30 HP' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Burst + DoT LETHAL' })).toBeTruthy();
  });

  it('the callout chip reads LETHAL with its instance, ONCE — not once per place it could go', () => {
    // Found by looking at the rendered page: a header chip and the rule's own callout both
    // printed "LETHAL · instance 5". DESIGN.md §7 gives the kill one chip, on the rule.
    render(<HpBurndown result={BURST_KILLS} />);
    expect(screen.getAllByText(/LETHAL · instance 5/).length).toBe(1);
    expect(screen.queryByText(/SURVIVES ·/)).toBeNull();
  });

  it('a burst that survives gets the neutral chip instead, with the health left', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByText(/SURVIVES · 30 HP/)).toBeTruthy();
    expect(screen.queryByText(/LETHAL · instance/)).toBeNull();
    // …and the DoT crossing gets its own callout, in DESIGN.md §7's words.
    expect(screen.getByText(/LETHAL \+DoT · after combo/)).toBeTruthy();
  });

  it('captions the x axis as sequence, never as elapsed time', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getByText('sequence — not elapsed time')).toBeTruthy();
  });

  it('names every ability the result excludes, and says whether the gap will ever close', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(
      screen.getByText(
        /On-hit — true damage \(mock\), excluded from these totals: Not yet modelled/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/W — Seismic Shard \(mock\), excluded from these totals: Cannot be completed/),
    ).toBeTruthy();
  });
});

describe('burndown/reduced-motion', () => {
  it('renders the FINAL SETTLED total immediately when motion is switched off', () => {
    setReducedMotion(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<HpBurndown result={MOCK_RESULT} />);

    // The settled figure is the FIRST thing on screen, not something it eases to…
    expect(screen.getByText(SETTLED_TOTAL)).toBeTruthy();
    // …and no animation frame was ever asked for.
    expect(raf).not.toHaveBeenCalled();
  });

  it('the whole chart is readable with motion off — every riser, both verdicts, the total', () => {
    setReducedMotion(true);
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.getAllByRole('button').length).toBe(6);
    expect(screen.getByRole('row', { name: 'Burst SURVIVES 30 HP' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Burst + DoT LETHAL' })).toBeTruthy();
    expect(screen.getByText(SETTLED_TOTAL)).toBeTruthy();
    expect(screen.getByText('sequence — not elapsed time')).toBeTruthy();
  });

  it('WITH motion allowed the total starts at zero and is driven by frames — so the test above discriminates', () => {
    setReducedMotion(false);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    render(<HpBurndown result={MOCK_RESULT} />);
    expect(screen.queryByText(SETTLED_TOTAL)).toBeNull();
    expect(raf).toHaveBeenCalled();
  });

  it('SETTLES ON A TIMER even if not one animation frame ever arrives', () => {
    // The defect this covers was found by opening the chart in a tab that was not
    // compositing: `requestAnimationFrame` never fires there, so the headline total sat at 0
    // and every riser stayed collapsed at scaleY(0). Frames are simulated as never arriving.
    setReducedMotion(false);
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    try {
      const { container } = render(<HpBurndown result={MOCK_RESULT} />);
      expect(screen.queryByText(SETTLED_TOTAL)).toBeNull();
      expect(container.querySelector('.burn--settled')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText(SETTLED_TOTAL)).toBeTruthy();
      expect(container.querySelector('.burn--settled')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is settled from the first render when motion is off — no timer needed at all', () => {
    setReducedMotion(true);
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelector('.burn--settled')).toBeTruthy();
  });
});

describe('burndown/popover', () => {
  it('keyboard focus on a riser opens the resistance math, and Escape closes it', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    const riser = screen.getByRole('button', { name: /Instance 1\./ });

    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(riser);
    const pop = screen.getByRole('tooltip');
    expect(pop).toBeTruthy();
    expect(riser.getAttribute('aria-describedby')).toBe(pop.getAttribute('id'));

    fireEvent.keyDown(riser, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hover opens it too', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Instance 1\./ }));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('every figure in it carries its damage type, spoken in full, with which step it is', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    fireEvent.focus(screen.getByRole('button', { name: /Instance 1\./ }));
    const name = screen.getByRole('tooltip').textContent ?? '';
    for (const step of [
      '300 physical damage before mitigation',
      '250 physical damage after resistances',
      '240 physical damage after reductions',
      '240 physical damage applied',
    ]) {
      expect(name).toContain(step);
    }
  });

  it('states the fixed four-step modifier order in words rather than inventing per-step figures', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    fireEvent.focus(screen.getByRole('button', { name: /Instance 1\./ }));
    const text = screen.getByRole('tooltip').textContent ?? '';
    expect(text).toContain('flat reduction');
    expect(text).toContain('percentage reduction');
    expect(text).toContain('percentage penetration');
    expect(text).toContain('flat penetration');
  });

  it('carries the instance’s verification status, unstyled and uncoloured', () => {
    render(<HpBurndown result={MOCK_RESULT} />);
    fireEvent.focus(screen.getByRole('button', { name: /Instance 3\./ }));
    expect(screen.getByRole('tooltip').textContent).toContain('Derived');
  });
});

describe('burndown/visual-cues', () => {
  // MARKUP ASSERTIONS, and labelled as such: a hatch pattern and a dash pattern have no
  // representation in the accessibility tree. The accessible half of each fact is asserted
  // in the sections above.

  it('the DoT tail is hatched, and the hatch rides beside the figure as well as filling the riser', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    // The burst reached zero, so the DoT riser has no height left to draw — the swatch is
    // what keeps the non-colour cue present. Both must exist.
    //
    // SCOPED TO THE PLOT ON 2026-08-14, and the narrowing is the assertion getting SHARPER rather
    // than being relaxed to pass. DESIGN.md §4b puts a second copy of every figure in the row
    // beneath the plot, for the width where the labels leave it, so a bare document-wide count
    // now reads 2 swatches where it means "the DoT column's label carries one". The rule this
    // guards — the hatch rides beside the figure wherever the figure is — is asserted on BOTH
    // copies below, which is strictly more than the original count checked.
    const plot = container.querySelector('.burn__cols')!;
    expect(plot.querySelectorAll('.burn__hatch--riser').length).toBe(1);
    expect(plot.querySelectorAll('.burn__hatch--swatch').length).toBe(1);
    expect(plot.querySelectorAll('.burn__hatch--magic').length).toBe(2);
    // The same cue, in the row that replaces those labels below --break-phone.
    const beneath = container.querySelector('.burn__stack')!;
    expect(beneath.querySelectorAll('.burn__hatch--swatch').length).toBe(1);
    expect(beneath.querySelectorAll('.burn__hatch--magic').length).toBe(1);
  });

  it('draws one solid lethal rule when the burst kills, and no dashed one', () => {
    // PREMISE CHANGED, not the assertion: the canonical mock's burst no longer kills.
    const { container } = render(<HpBurndown result={BURST_KILLS} />);
    expect(container.querySelectorAll('.burn__rule-stroke--lethal').length).toBe(1);
    expect(container.querySelectorAll('.burn__rule-stroke--dot').length).toBe(0);
  });

  it('draws the dashed rule instead when only burst + DoT kills', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelectorAll('.burn__rule-stroke--lethal').length).toBe(0);
    expect(container.querySelectorAll('.burn__rule-stroke--dot').length).toBe(1);
  });

  it('positions the lethal rule at the column boundary the verdict names', () => {
    // PREMISE CHANGED, not the assertion: same reason as above.
    const { container } = render(<HpBurndown result={BURST_KILLS} />);
    const rule = container.querySelector('.burn__rule') as HTMLElement;
    // Instance 5 of six columns: 83.3333% across, nudged so its 2px stroke stays inside.
    expect(rule.style.left).toBe('83.3333%');
    expect(rule.style.transform).toBe('translateX(-50%)');
  });

  /* ═══ THE KILL CALLOUT MAY NOT LEAVE THE PLOT (added 2026-08-15) ═══

     WHAT WAS MEASURED, AND WHERE. jsdom computes no layout, so the pixels below were read in
     Chrome on 2026-08-15 at a 375px viewport, on the Renekton scenario in `preview.tsx`: the
     `LETHAL +DoT · after combo` chip is 349px wide against a 204px plot, and its left edge sat
     at x = −48 — forty-eight pixels off the left of the viewport, reading `THAL +DoT · after
     combo`. The kill mark, with the word LETHAL cut off.

     WHY NO EXISTING CHECK SAW IT. Content that overflows to the LEFT never creates a horizontal
     scrollbar: `document.documentElement.scrollWidth` was exactly 375, so every overflow sweep
     in this product passed while the answer was off screen.

     WHAT THESE TWO ASSERT. They cannot re-measure the pixels, so they pin the two declarations
     that make the escape impossible, and both fail on the markup that produced it — which hung
     the chip leftwards from the rule with `left` + `translateX(-100%)` and forbade it to wrap. */
  it('the callout is a full-width row padded to the rule, never hung leftwards from it', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const callout = container.querySelector('.burn__callout') as HTMLElement;
    expect(callout).toBeTruthy();
    // The old anchoring, gone: nothing positions this chip by its own width any more.
    expect(callout.style.left).toBe('');
    expect(callout.style.transform).toBe('');
    // The rule's position arrives as the trailing pad of a row that spans the whole plot.
    expect(callout.style.paddingInlineEnd).not.toBe('');
    // The chip is a child of the row now, not the row itself — that is what lets it wrap
    // inside a box whose width the plot fixes.
    expect(callout.querySelector('.burn__chip--lethal')).toBeTruthy();
    expect(callout.classList.contains('burn__chip')).toBe(false);
  });

  it('the stylesheet gives the row the whole plot width, and lets the chip wrap inside it', () => {
    // A PATH FROM THE REPO ROOT, not `import.meta.url`: this file runs in the jsdom
    // environment, where `import.meta.url` is an http URL and `readFileSync` refuses it.
    const css = readFileSync('src/ui/burndown/burndown.css', 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const calloutRule = /\.burn__callout\s*\{([^}]*)\}/.exec(css);
    expect(calloutRule, '.burn__callout rule not found').not.toBeNull();
    expect(calloutRule![1]).toMatch(/inset-inline:\s*0/);
    expect(calloutRule![1]).toMatch(/justify-content:\s*flex-end/);

    const chipRule = /\.burn__chip\s*\{([^}]*)\}/.exec(css);
    expect(chipRule, '.burn__chip rule not found').not.toBeNull();
    // `nowrap` is what made a chip wider than its panel rather than taller than one line: it
    // sets a box's minimum width to its whole string, so a flex item has nothing to shrink to.
    expect(chipRule![1]).not.toMatch(/white-space:\s*nowrap/);
    expect(chipRule![1]).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the recent-damage ghost appears only where health was actually removed', () => {
    // NARROWED 2026-08-14, and the narrowing is the correct behaviour rather than a loss. The
    // ghost is DESIGN.md §7's "chunk that was just taken", so a column that took nothing has no
    // chunk to show. The mock has 6 columns — 5 instances plus the DoT tail — and instance 4 is
    // the incomplete one, which contributes no damage (SPECIFICATION §8). It used to animate a
    // ghost over a band of zero height.
    //
    // It also keeps the ghost off a HEALING column, which is the reason this was looked at: a
    // gold "just lost" flash playing while health is restored shows the opposite of what happened.
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelectorAll('.burn__col').length).toBe(6);
    expect(container.querySelectorAll('.burn__ghost').length).toBe(5);
    expect(MOCK_RESULT.perInstance.filter((i) => i.final === 0)).toHaveLength(1);
  });

  it('every column is the same width — the x axis is sequence, never elapsed time', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const cols = [...container.querySelectorAll('.burn__col')];
    expect(cols.length).toBe(6);
    // No column carries a width of its own; they all take `flex: 1 1 0` from the stylesheet.
    expect(cols.filter((c) => (c as HTMLElement).style.width !== '')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE RISER LABELS OUT OF THE PLOT (DESIGN.md §4b).
//
// WHAT JSDOM CAN AND CANNOT SAY HERE, because it is easy to over-claim. jsdom loads no stylesheet
// and evaluates no media query, so NOTHING below is evidence about which of the two label sets is
// visible at 375px. What it CAN prove is the part that must hold at every width at once: that the
// row exists, that it carries the same figures with the same tags as the plot does, that both are
// out of the accessibility tree, and — the one §4b calls a rule rather than a preference — that
// the sentence a screen reader hears is untouched by any of it.
//
// The visible half was measured in Chrome at 320px, 375px, 480px, 481px and 1265px; the readings
// are written down in `label-collision.test.ts`, above "riser labels/the row beneath the plot".
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('burndown/labels below the breakpoint', () => {
  it('the row beneath the plot exists, in instance order, each entry naming its instance', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const names = [...container.querySelectorAll('.burn__stack-name')].map((n) => n.textContent);
    // ONE ENTRY PER PRINTED FIGURE, and my first version of this assertion had it wrong: I
    // expected instance 4 — the `incomplete` one, which contributes 0 damage — to be absent.
    // It is not, because the PLOT prints a figure for it too: the in-plot label is drawn for any
    // column with a damage type, whatever its value. The row mirrors the plot exactly, which is
    // the rule, so the fixture's six columns give six entries. Left recorded rather than quietly
    // corrected, because "the row shows what the plot shows" is the only thing keeping the two
    // from drifting, and a wrong expectation here would have hidden the first divergence.
    expect(names).toEqual(['inst 1', 'inst 2', 'inst 3', 'inst 4', 'inst 5', '+DoT']);
    const axis = [...container.querySelectorAll('.burn__xlabel')].map((n) => n.textContent);
    // Every name in the row is a name the x axis already uses. The two never invent wordings.
    expect(names.every((n) => axis.some((a) => a?.includes(n!)))).toBe(true);
  });

  it('the row carries the SAME figures as the plot, with their P/M/T tags intact', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const text = (root: Element) =>
      [...root.querySelectorAll('.dmg')].map((d) => d.textContent).join(' | ');
    const inPlot = [...container.querySelectorAll('.burn__label')].map(text).join(' || ');
    const beneath = [...container.querySelectorAll('.burn__stack-item')].map(text).join(' || ');
    expect(beneath).toBe(inPlot.split(' || ').filter(Boolean).join(' || '));
    // The tag is present on both sides. A figure that lost its tag on the phone would be a
    // colour-only damage type, which SPECIFICATION §10.1 forbids outright.
    expect(container.querySelectorAll('.burn__stack .dmg__tag').length).toBeGreaterThan(0);
  });

  it('neither label set is in the accessibility tree — the risers carry the whole sentence', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelector('.burn__stack')!.getAttribute('aria-hidden')).toBe('true');
    for (const label of container.querySelectorAll('.burn__label')) {
      expect(label.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('THE ACCESSIBLE NAME IS IDENTICAL WITH THE ROW PRESENT — §4b’s first rule', () => {
    // The strongest form jsdom can state: the row is in the DOM at every width, so if it changed
    // what a screen reader hears, it would change it HERE. The names are the ones the
    // accessible-names suite above asserts, unchanged, and no riser name gained a duplicate
    // figure from the second copy of the label.
    render(<HpBurndown result={MOCK_RESULT} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')!);
    expect(names).toHaveLength(6);
    expect(names[0]).toContain('Instance 1');
    expect(names[0]).toContain('240 physical damage');
    // One figure per name, not two: a name that had absorbed the stacked copy would repeat it.
    expect(names[0]!.match(/physical damage/g)).toHaveLength(1);
    expect(names.some((n) => n.includes('inst 1'))).toBe(false);
  });
});
