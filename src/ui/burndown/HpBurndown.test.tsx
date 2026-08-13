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

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MOCK_RESULT } from '../../types';
import { BURST_KILLS } from './mock-variants';
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
    expect(container.querySelectorAll('.burn__hatch--riser').length).toBe(1);
    expect(container.querySelectorAll('.burn__hatch--swatch').length).toBe(1);
    expect(container.querySelectorAll('.burn__hatch--magic').length).toBe(2);
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

  it('the recent-damage ghost exists per column and is invisible at rest', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    expect(container.querySelectorAll('.burn__ghost').length).toBe(6);
  });

  it('every column is the same width — the x axis is sequence, never elapsed time', () => {
    const { container } = render(<HpBurndown result={MOCK_RESULT} />);
    const cols = [...container.querySelectorAll('.burn__col')];
    expect(cols.length).toBe(6);
    // No column carries a width of its own; they all take `flex: 1 1 0` from the stylesheet.
    expect(cols.filter((c) => (c as HTMLElement).style.width !== '')).toEqual([]);
  });
});
