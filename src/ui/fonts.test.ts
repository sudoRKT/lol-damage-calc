// THE FACES ARE LOADED, AND EXACTLY THE WEIGHTS DESIGN.md §3 NAMES.
//
// ═══ WHY THIS CHECK EXISTS ═══
//
// The three typefaces were specified in DESIGN.md §3 from the beginning, `tokens.css` declared
// all three families, every component asked for them by token — and none of them was ever
// loaded. `tokens.css` carried a note saying the real faces "are wired in when the UI area is
// built"; the UI area was built and they were not, and for months nothing said so.
//
// Nothing COULD have said so. The token audit checks that every `font-family` is a token, which
// was true. The type scale was correct. Every test passed. The defect was one layer below all of
// them: the token resolved to a family name the browser had never heard of, and fell through to
// the fallback silently — which is what a fallback is for.
//
// Measured in a real browser, which is the only place it was visible: `document.fonts.size` was
// 0, and Saira and IBM Plex Sans rendered at IDENTICAL widths because both were `system-ui`.
//
// So the check is: the imports exist, and they are the eight weights §3 names — no more, because
// §3 says "do not add weights", and no fewer, because a missing weight falls back to a synthetic
// bold or a wrong face without any visible error.
//
// ═══ THE MEASUREMENTS THAT PROVED THE FIX, RESCUED FROM A COMMIT MESSAGE 2026-08-16 ═══
//
// **This file guards the IMPORTS. It does not guard the OUTCOME, and the only evidence the fix
// worked was in a commit message.** An audit of every commit message in the repository for figures
// that never reached a file found 21 across 6 commits; these were among the most valuable, because
// the defect they describe is invisible to every test that exists.
//
// From commit `4d1c69f`, measured in a real browser:
//
//   Saira          86px  →  81.1px
//   IBM Plex Sans  81.3px →  79.4px
//
// The two faces measured IDENTICALLY before the fix because both were resolving to `system-ui`.
// After it they differ, which is the whole proof: two different typefaces render two different
// widths for the same string. **A test asserting the imports exist would pass in both states.**
//
// ═══ AND NOW THEY ARE ASSERTED, NOT MERELY RECORDED (2026-08-16) ═══
//
// Re-measured in Chrome on the live page, at 40px, weight 400, with a string chosen to separate
// faces rather than to look tidy — `Handgloves 0123456789 WWWiiillm`:
//
//   Saira                      688.84px
//   IBM Plex Sans              663.13px
//   JetBrains Mono             744.00px
//   an unavailable family      608.70px   ← what a FALLBACK measures
//   serif                      608.70px   ← identical, which is what proves the line above
//
// `document.fonts` reports 42 loaded faces across exactly three families.
//
// **The discriminator is not that the three differ from each other. It is that all three differ
// from the fallback.** Two faces could coincide by accident — JetBrains Mono measures 744.00 and so
// does generic `monospace`, because monospace faces share an advance width, and that coincidence
// would have made a "mono differs from monospace" test fail for no reason. Comparing against a
// family the browser has never heard of has no such failure mode.
//
// jsdom computes no text metrics, so the assertions below are over the RECORDED figures plus the
// shipped files. That is weaker than a live browser check and it is stated plainly rather than
// dressed up: what it catches is a re-measurement pasted in wrong, and a build that stops shipping
// a face. What it cannot catch is `fonts.css` pointing at a family the browser will not resolve
// while the files still ship. **Re-taking these needs a real browser, and the recipe is above.**

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = dirname(fileURLToPath(import.meta.url));
const REPO = join(UI, '..', '..');
const FONTS_CSS = readFileSync(join(UI, 'fonts.css'), 'utf8');
const TOKENS = readFileSync(join(UI, 'tokens.css'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** DESIGN.md §3, "Weights to load (keep to these — do not add weights)". */
const REQUIRED = [
  ['saira', 500],
  ['saira', 600],
  ['ibm-plex-sans', 400],
  ['ibm-plex-sans', 500],
  ['ibm-plex-sans', 600],
  ['jetbrains-mono', 400],
  ['jetbrains-mono', 500],
  ['jetbrains-mono', 700],
] as const;

const imported = [...FONTS_CSS.matchAll(/@import '@fontsource\/([a-z-]+)\/(\d{3})\.css';/g)].map(
  (m) => [m[1]!, Number(m[2]!)] as const,
);

describe('fonts/the packages are real dependencies', () => {
  it('all three ship with the product, not just with the build', () => {
    // A font the site SERVES belongs in `dependencies`. In `devDependencies` it would still work
    // locally and still build here, because Vite inlines what it can resolve — the failure would
    // appear only in an install that skips dev dependencies, which is how a CDN builds.
    for (const family of ['saira', 'ibm-plex-sans', 'jetbrains-mono']) {
      expect(PACKAGE.dependencies ?? {}, family).toHaveProperty(`@fontsource/${family}`);
      expect(PACKAGE.devDependencies ?? {}).not.toHaveProperty(`@fontsource/${family}`);
    }
  });

  it('and the files they name are actually on disk', () => {
    for (const [family, weight] of REQUIRED) {
      const path = join(REPO, 'node_modules', '@fontsource', family, `${weight}.css`);
      expect(existsSync(path), `@fontsource/${family}/${weight}.css`).toBe(true);
    }
  });
});

describe('fonts/exactly the weights DESIGN.md §3 names', () => {
  it('imports all eight', () => {
    for (const required of REQUIRED) {
      expect(imported, `${required[0]} ${required[1]}`).toContainEqual(required);
    }
  });

  it('AND NO NINTH — §3 says "do not add weights"', () => {
    // A ninth weight is not a styling choice: it is another font file on every page load, and a
    // change to DESIGN.md rather than a local decision.
    expect(imported).toHaveLength(REQUIRED.length);
  });

  it('the imported weights are the same set the weight TOKENS declare', () => {
    // The two lists are written in different files for different reasons — one loads files, one
    // names values — and a weight in tokens.css with no file behind it renders as a synthetic
    // bold, which looks like a design choice rather than a missing download.
    const tokenWeights = new Set(
      [...TOKENS.matchAll(/--weight-[a-z-]+:\s*(\d{3});/g)].map((m) => Number(m[1]!)),
    );
    const importedWeights = new Set(imported.map(([, w]) => w));
    expect([...importedWeights].sort()).toEqual([...tokenWeights].sort());
  });

  it('loads no italic — the design file names none, and a synthetic italic is not one', () => {
    expect(FONTS_CSS).not.toContain('italic');
  });
});

describe('fonts/every page actually gets them', () => {
  it('the shell imports the stylesheet, so all eight pages do', () => {
    // Imported from PageShell rather than from each entry: every page renders the shell, so the
    // ninth page cannot be built without them.
    const shell = readFileSync(join(UI, 'shell', 'PageShell.tsx'), 'utf8');
    expect(shell).toContain("import '../fonts.css'");
  });

  it('tokens.css still names all three families, so nothing bypasses the token', () => {
    for (const family of ['Saira', 'IBM Plex Sans', 'JetBrains Mono']) {
      expect(TOKENS).toContain(family);
    }
  });
});

const UI_ROOT = dirname(fileURLToPath(import.meta.url));

function everyFile(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...everyFile(full));
    else out.push(full);
  }
  return out;
}

describe('fonts/every page a person can look at loads them', () => {
  // ═══ THE HARNESSES WERE MEASURING IN SYSTEM FACES ═══
  //
  // `fonts.css` was imported by `shell/PageShell.tsx` and nothing else, and no preview harness
  // renders the shell — so every one of them rendered in the fallback stack. Measured 2026-08-15:
  // `document.fonts.size` was 0 on a harness against 42 on the calculator, and strings came out
  // 1–5% wide.
  //
  // **A preview harness is not a toy — it is where this project takes measurements**, and a wide
  // string there has already cost a session: overhang figures taken on a harness implied an axis
  // label the shipping face does not produce, and a second agent spent its run reconciling two
  // correct measurements of two different typefaces.
  //
  // This is the same defect `fonts.css`'s own header records against the product on 2026-08-14,
  // in a second home, found the same way: by measuring rather than by reading.
  it('every preview entry point imports fonts.css', () => {
    const entries = everyFile(UI_ROOT).filter((f) => /(^|\/)preview\.tsx$/.test(f));
    expect(entries.length).toBeGreaterThanOrEqual(5);
    const missing = entries
      .filter((f) => !/fonts\.css/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(UI_ROOT, f));
    expect(missing).toEqual([]);
  });
});

/**
 * Widths measured in Chrome on the live page, 2026-08-16, at 40px / weight 400, for the string
 * `Handgloves 0123456789 WWWiiillm`. See this file's header for why the string and why 40px.
 */
const MEASURED_WIDTHS = {
  saira: 688.84,
  plexSans: 663.13,
  jetBrainsMono: 744.0,
  /** A family the browser has never heard of. This is what a FALLBACK measures. */
  unavailableFamily: 608.7,
  /** Generic serif, identical to the line above — which is what proves that line is the fallback. */
  serif: 608.7,
} as const;

describe('fonts/the faces are loading, not falling back', () => {
  it('SAIRA AND IBM PLEX SANS DO NOT MEASURE THE SAME', () => {
    // THE DEFECT THIS ENCODES, and the reason it is worth a check rather than a note. Both families
    // once resolved to `system-ui` and rendered at IDENTICAL widths. Every test passed: the token
    // audit saw tokens, the type scale was right, the imports existed. Two different typefaces
    // rendering one width is the only symptom a fallback has.
    expect(MEASURED_WIDTHS.saira).not.toBe(MEASURED_WIDTHS.plexSans);
  });

  it('every display face differs from the FALLBACK, which is the real discriminator', () => {
    // Differing from each other can happen by accident; differing from a family the browser cannot
    // resolve cannot. JetBrains Mono measures exactly what generic `monospace` does — a real
    // coincidence, because monospace faces share an advance width — so "differs from its generic"
    // would be the wrong test and is deliberately not written.
    for (const [name, w] of [
      ['Saira', MEASURED_WIDTHS.saira],
      ['IBM Plex Sans', MEASURED_WIDTHS.plexSans],
      ['JetBrains Mono', MEASURED_WIDTHS.jetBrainsMono],
    ] as const) {
      expect(w, `${name} measures the same as an unresolvable family — it is falling back`).not.toBe(
        MEASURED_WIDTHS.unavailableFamily,
      );
    }
  });

  it('the fallback figure is corroborated, so it is not one arbitrary number', () => {
    // An unavailable family and generic serif land on the same width, which is what makes 608.7
    // the fallback rather than just another measurement.
    expect(MEASURED_WIDTHS.unavailableFamily).toBe(MEASURED_WIDTHS.serif);
  });

  it('all three families actually SHIP, as distinct files', () => {
    // The half that is mechanical rather than recorded. If a build stops emitting a face, the
    // widths above become a description of a page that no longer exists.
    const dist = join(REPO, 'dist', 'assets');
    if (!existsSync(dist)) {
      console.warn('\n  fonts: dist/ absent, so the shipped-files half was not checked.\n');
      return;
    }
    const woff = readdirSync(dist).filter((f) => /\.woff2?$/.test(f));
    for (const stem of ['saira', 'ibm', 'jetbrains']) {
      expect(
        woff.filter((f) => f.includes(stem)).length,
        `no ${stem} font files in the build`,
      ).toBeGreaterThan(0);
    }
  });
});
