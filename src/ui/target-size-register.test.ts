// EVERY INTERACTIVE CONTROL MEETS WCAG 2.2 AA 2.5.8, AND SAYS HOW.
//
// ═══ WHY A REGISTER AND NOT A RULE ═══
//
// `--target-min` (24px) was added to `tokens.css` and DESIGN.md §4a on 2026-08-15, and **on the
// day it was added it was referenced by nothing at all.** A token defined and never used is not a
// standard; it is a note. This file is what makes it load-bearing.
//
// A blanket "every control is at least 24px" would be WRONG, and that is the whole reason this is
// a register. **2.5.8 offers two ways to pass and this product legitimately uses both:**
//
//   - **by SIZE** — the control is at least 24px on both axes;
//   - **by SPACING** — it is smaller, but no other target's centre is within 24px of its centre.
//
// Several controls here pass by spacing and should not be grown: `.burn__riser` is 16×24 with
// 52.3px between centres, and making it 24px wide would change the burndown's column geometry to
// satisfy a rule it already meets.
//
// ═══ WHAT THIS FILE CANNOT DO ═══
//
// **jsdom computes no layout**, so nothing here measures a rendered box. Every figure below is a
// browser measurement taken by a person, recorded so it is not lost in a transcript — which is
// exactly what happened to the combo controls, measured at 18.5×21.4px and fixed only when
// somebody happened to look again months later.
//
// What it enforces mechanically is narrower and still useful: the token is referenced by something,
// every control in the interface is accounted for, and no entry claims to pass by spacing without
// stating the separation it was measured at.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL = walk(UI);
const STYLESHEETS = ALL.filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
const rel = (f: string) => relative(UI, f);
const read = (f: string) => readFileSync(f, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectors that style an interactive control, found by name. Broad on purpose. */
const CONTROL_SELECTOR = /(control|remove|toggle|__btn|button|riser|shelf-button)/;

type Pass =
  | { how: 'size'; measured: string }
  | { how: 'spacing'; separationPx: number; measured: string }
  | { how: 'unmeasured'; why: string };

/**
 * Every interactive control in the interface and how it meets 2.5.8.
 *
 * `measured` is a browser figure taken by a person, with the date. `'unmeasured'` is a real and
 * honest state — it means nobody has put a ruler against it — and those are printed on every run
 * as a worklist rather than asserted away.
 */
const CONTROLS: Record<string, Pass> = {
  'combo/combo.css .combo__control': {
    how: 'size',
    measured: '34.47 x 25.39px at 375px, 2026-08-15. Was 18.47 x 21.39 with 22.47px centres — 12 of 12 undersized, 16 violating pairs — and is the defect that produced --target-min.',
  },
  'combo/combo.css .combo__control--remove': {
    how: 'size',
    measured: '35.22 x 25.39px at 375px, 2026-08-15. Centres 46.84px from the nearest arrow.',
  },
  'combo/combo.css .combo__shelf-button': {
    how: 'unmeasured',
    why: 'an ability icon on the shelf. Icon chips are larger than 24px by construction, but nobody has measured one.',
  },
  'combo/combo.css .combo__shelf-button--text': {
    how: 'unmeasured',
    why: 'the basic-attack button, which is text rather than an icon and therefore the one on this shelf most likely to be short.',
  },
  'items/items.css .items__remove': {
    how: 'size',
    measured:
      '28.36 x 24.00px at 375px, 2026-08-15, on /calculator/ with one item in the build. It was ' +
      '28.91 x 20.84 — the block axis failed by 3.16px and the inline axis always passed, and the ' +
      'browser CONFIRMED the computed figure rather than refuting it. Fixed by SIZE, not by ' +
      'spacing: a remove control sits inside a build row, which leaves no 24px separation to pass ' +
      'on. The inline axis lost 0.55px because the box became a centring flex container, and the ' +
      'build row grew 44.53 to 47.69px, which is the whole layout cost.',
  },
  'burndown/burndown.css .burn__riser': {
    how: 'spacing',
    separationPx: 52.3,
    measured: '16 x 24px at 375px, 2026-08-15. Passes by spacing and MUST NOT be grown: 24px wide would change the burndown column geometry to satisfy a rule it already meets.',
  },
  'breakdown/breakdown.css .breakdown__state-toggle': {
    how: 'spacing',
    separationPx: 155.5,
    measured: '87.2 x 15.2px at 375px, 2026-08-15. One per table row, far apart.',
  },
  'primitives/primitives.css .disclosure__toggle': {
    how: 'unmeasured',
    why: 'full-width by construction on the inline axis; its block size is padding plus an eyebrow line and has not been measured.',
  },
  'shell/nav.css .nav__toggle': {
    how: 'unmeasured',
    why: 'the phone menu button. Its PANEL was measured (and was 114.6px off screen); the toggle itself was not.',
  },
  'picker/runes.css .runes__remove': {
    how: 'unmeasured',
    why:
      'the rune picker\'s remove control, added 2026-08-15. NOBODY CAN MEASURE IT YET: the picker ' +
      'is built and its own tests pass, but it is not mounted — `src/ui/app/` composes the page ' +
      'and no area mounts its own component — so no page renders this control. It is registered ' +
      'rather than left out because the tripwire that caught it is the point: a new control may ' +
      'not ship unmeasured AND unnamed. Measure it the moment the lead wires the picker. Its ' +
      'sibling `.items__remove` failed by 3.16px on the block axis and always passed on the ' +
      'inline one, so expect the same shape of answer if it is built from the same type.',
  },
  'config/defences.css .defences__control': {
    how: 'unmeasured',
    why: 'a conditional-defence toggle. Not present on the default scenario, so no pass has rendered one.',
  },
};

/**
 * Selectors the name pattern catches that are NOT interactive controls, each with why.
 *
 * The pattern is deliberately broad — it is better to catch a container and explain it than to
 * miss a control — and these are the price of that. A new entry needs a sentence.
 */
const NOT_A_CONTROL: Record<string, string> = {
  'burndown/burndown.css .burn__hatch--riser':
    'the hatched decoration ON a riser, not the riser itself. It has no handler and is not focusable.',
  'combo/combo.css .combo__controls':
    'the flex container the two arrows sit in. The controls inside it are registered; a container is not a target.',
  'slice/slice.css .shelf__btn':
    'a demo harness. `slice/` is a superseded end-to-end proof imported by nothing and served to nobody.',
};

describe('target size/the token is load-bearing', () => {
  it('--target-min is referenced by at least one component, not just defined', () => {
    // THE DEFECT THIS ENCODES. On the day it was added, `--target-min` was referenced by nothing
    // in `src/ui` — a standard nobody had applied. If this goes red the token has become a note
    // again.
    const users = STYLESHEETS.filter((f) => /var\(--target-min\)/.test(stripComments(read(f))));
    expect(users.map(rel)).not.toEqual([]);
  });

  it('every control-shaped selector in the interface is in the register', () => {
    // The tripwire: a new control cannot arrive without someone saying how it passes 2.5.8.
    const missing: string[] = [];
    for (const file of STYLESHEETS) {
      const name = rel(file);
      for (const m of stripComments(read(file)).matchAll(/(^|\})\s*([^{}]+)\{/g)) {
        for (const sel of m[2]!.split(',')) {
          const s = sel.trim();
          // Only simple class selectors: a compound or state selector styles a control already
          // registered under its base name.
          if (!/^\.[a-z][a-z0-9_-]*$/.test(s)) continue;
          if (!CONTROL_SELECTOR.test(s)) continue;
          const key = `${name} ${s}`;
          if (key in NOT_A_CONTROL) continue;
          if (!(key in CONTROLS)) missing.push(key);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('no entry claims to pass by spacing without stating the separation', () => {
    const vague = Object.entries(CONTROLS)
      .filter(([, p]) => p.how === 'spacing' && !(p.separationPx >= 24))
      .map(([k]) => k);
    expect(vague).toEqual([]);
  });

  it('every entry carries a real sentence, not a placeholder', () => {
    const thin = Object.entries(CONTROLS)
      .filter(([, p]) => (p.how === 'unmeasured' ? p.why : p.measured).trim().length < 40)
      .map(([k]) => k);
    expect(thin).toEqual([]);
  });

  it('NAMES THE CONTROLS NOBODY HAS MEASURED — a worklist, not a failure', () => {
    // Deliberately not asserted to be empty. Six are unmeasured today and that is a true statement
    // about the product; asserting the empty set would mean deleting the honest ones.
    const unmeasured = Object.entries(CONTROLS).filter(([, p]) => p.how === 'unmeasured');
    if (unmeasured.length > 0) {
      console.warn(
        `\n  ${unmeasured.length} interactive control(s) have never been measured against ` +
          `--target-min (24px):\n` +
          unmeasured.map(([k, p]) => `    - ${k}\n        ${(p as { why: string }).why}`).join('\n') +
          `\n  jsdom computes no layout. These need a real browser.\n`,
      );
    }
    expect(Object.keys(CONTROLS).length).toBeGreaterThanOrEqual(8);
  });
});
