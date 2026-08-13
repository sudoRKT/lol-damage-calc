// THE TOKEN AUDIT — a mechanical check that DESIGN.md is being obeyed, run across the
// whole of src/ui/ rather than against the two files that happen to be finished.
//
// WHY IT IS SHAPED THIS WAY. CLAUDE.md's standing instruction: when a defect is found, the
// work is not to fix that instance but to write the check that finds every other instance
// of it, and to run it across the whole surface. "I traced my own component's tokens by
// hand" is a claim about two files that stops being true the moment a third is added. This
// runs on every file in the area, every test run, forever.
//
// THE POPULATION IT MEASURES.
//   • Stylesheets: every `.css` file under `src/ui/`, EXCEPT `src/ui/tokens.css`. That one
//     file is excluded because it is the token DEFINITION — it is where the hex values are
//     supposed to live, and it is the lead's, not this area's.
//   • Components: every `.ts`/`.tsx` file under `src/ui/`, EXCEPT `*.test.ts`, `*.test.tsx`
//     and `render-for-test.ts`. Test files are not shipped interface.
// Both populations are counted and asserted non-empty, so the audit can never pass by
// finding nothing to look at.
//
// WHAT COUNTS AS A FAILURE. Any colour literal, any bare px/rem length, any font family or
// weight-bearing literal that is not traceable to DESIGN.md; any `var(--x)` naming a token
// that tokens.css does not define; any reserved hue used outside an allow-listed rule; and
// any CSS rule targeting `[data-state]`, which would let verification states be styled
// apart in violation of DESIGN.md §6.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_FILE = join(UI_DIR, 'tokens.css');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL = walk(UI_DIR);
const STYLESHEETS = ALL.filter((f) => f.endsWith('.css') && f !== TOKENS_FILE);
const COMPONENTS = ALL.filter(
  (f) =>
    (f.endsWith('.ts') || f.endsWith('.tsx')) &&
    !/\.test\.tsx?$/.test(f) &&
    !f.endsWith('render-for-test.ts'),
);

const rel = (f: string) => relative(UI_DIR, f);
const read = (f: string) => readFileSync(f, 'utf8');

/** Strip /* … *​/ comments so a token name mentioned in prose is not read as usage. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every custom property tokens.css defines. This is the whole legal vocabulary.
 *
 * NOT anchored to the start of a line: tokens.css pairs a size and its line-height on one
 * line (`--type-num-l: 1rem; --lh-num-l: 1.15;`), and a line-anchored pattern silently
 * missed the second of every pair — which made this audit report nine tokens as undefined
 * that tokens.css defines perfectly well. A `var(--x)` usage cannot be mistaken for a
 * definition because the trailing `:` is required.
 */
const DEFINED_TOKENS = new Set(
  [...read(TOKENS_FILE).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!),
);

/** DESIGN.md §1: the reserved hues. Nothing else in the product may be coloured. */
const HUE_TOKENS = [
  '--dmg-physical',
  '--dmg-magic',
  '--dmg-true',
  '--lethal',
  '--flash-recent',
];

/**
 * The only CSS selectors permitted to reference a reserved hue, each with the DESIGN.md
 * clause that authorises it. Adding a selector here is a deliberate act: it is a claim
 * that the thing being coloured IS damage data.
 */
const HUE_ALLOWLIST: Record<string, string> = {
  '.dmg--physical': 'DESIGN.md §2 — physical damage values',
  '.dmg--magic': 'DESIGN.md §2 — magic damage values',
  '.dmg--true': 'DESIGN.md §2 — true damage values',
  '.comp__bar--physical': 'DESIGN.md §7 — composition bar segment',
  '.comp__bar--magic': 'DESIGN.md §7 — composition bar segment',
  '.comp__bar--true': 'DESIGN.md §7 — composition bar segment',
};

/**
 * Length literals permitted outside the spacing/type scales, each with its reason. Every
 * entry is either a value DESIGN.md itself states verbatim, or accessibility geometry that
 * a visual design token file does not and should not cover.
 */
const LENGTH_ALLOWLIST: Array<{ value: string; rule: string; reason: string }> = [
  { value: '0.7em', rule: '.dmg__tag', reason: 'DESIGN.md §8 — the tag is max(10px, 0.7em)' },
  { value: '10px', rule: '.dmg__tag', reason: 'DESIGN.md §8 — the tag’s hard 10px floor' },
  { value: '1px', rule: '.u-visually-hidden', reason: 'standard screen-reader clip idiom' },
  { value: '-1px', rule: '.u-visually-hidden', reason: 'standard screen-reader clip idiom' },
  { value: '50%', rule: '.u-visually-hidden', reason: 'standard screen-reader clip idiom' },
];

/** Split flat CSS into { selector, body } pairs. These stylesheets have no nesting. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const m of stripCssComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

describe('token-audit/population', () => {
  it('is looking at a non-empty surface', () => {
    expect(STYLESHEETS.length).toBeGreaterThan(0);
    expect(COMPONENTS.length).toBeGreaterThan(0);
  });

  it('reports what it is measuring', () => {
    // Not an assertion so much as a record of scope, so a reader knows the count above
    // means something. Definitions are in this file's header.
    expect({
      stylesheets: STYLESHEETS.map(rel).sort(),
      components: COMPONENTS.map(rel).sort(),
      tokensDefined: DEFINED_TOKENS.size,
    }).toBeTruthy();
  });
});

describe('token-audit/colour', () => {
  it('no stylesheet outside tokens.css contains a colour literal', () => {
    // Scans DECLARATION VALUES only, never property names. Scanning raw text reported
    // three colour violations in a file that has none: the property `white-space` contains
    // the CSS named colour `white`. A check that cries wolf gets switched off, so it reads
    // the value side of each declaration and nothing else.
    const colour =
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:red|green|blue|orange|yellow|purple|pink|cyan|magenta|teal|lime|navy|maroon|olive|silver|gold|white|black|gray|grey)\b/g;
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        for (const decl of r.body.split(';')) {
          const idx = decl.indexOf(':');
          if (idx === -1) continue;
          const value = decl.slice(idx + 1);
          for (const m of value.matchAll(colour)) {
            offenders.push(`${rel(f)} ${r.selector} { ${decl.trim()} } -> ${m[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no component contains a colour literal', () => {
    const colour = /#[0-9a-fA-F]{6}\b|\brgba?\(|\bhsla?\(/g;
    const offenders: string[] = [];
    for (const f of COMPONENTS) {
      for (const m of stripJsComments(read(f)).matchAll(colour)) {
        offenders.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no component sets colour, background, font or size in an inline style', () => {
    // Inline styles are permitted ONLY for data-derived geometry (a composition-bar
    // segment's proportion). Anything visual must come from a class and a token.
    const banned = /\b(color|background|backgroundColor|fontFamily|fontSize|fontWeight|border|boxShadow|borderRadius|padding|margin|gap)\s*:/;
    const offenders: string[] = [];
    for (const f of COMPONENTS) {
      for (const m of stripJsComments(read(f)).matchAll(/style=\{\{([^}]*)\}\}/g)) {
        if (banned.test(m[1]!)) offenders.push(`${rel(f)}: style={{${m[1]!.trim()}}}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('token-audit/vocabulary', () => {
  it('every var(--token) used names a token tokens.css defines', () => {
    const unknown: string[] = [];
    for (const f of [...STYLESHEETS, ...COMPONENTS]) {
      const src = f.endsWith('.css') ? stripCssComments(read(f)) : stripJsComments(read(f));
      for (const m of src.matchAll(/var\((--[\w-]+)\)/g)) {
        if (!DEFINED_TOKENS.has(m[1]!)) unknown.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every length literal is either 0, allow-listed, or comes from a token', () => {
    const length = /(-?\d*\.?\d+)(px|rem|em|%)/g;
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        for (const m of r.body.matchAll(length)) {
          const value = m[0];
          if (/^-?0(px|rem|em|%)$/.test(value)) continue;
          const permitted = LENGTH_ALLOWLIST.some(
            (a) => a.value === value && r.selector.includes(a.rule),
          );
          if (!permitted) offenders.push(`${rel(f)} ${r.selector} { ${value} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every font-family is a token, never a face name', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCssComments(read(f)).matchAll(/font-family:\s*([^;]+);/g)) {
        if (!/^var\(--font-(display|body|mono)\)$/.test(m[1]!.trim())) {
          offenders.push(`${rel(f)}: font-family: ${m[1]!.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every font-weight is one of the weights DESIGN.md §3 says to load', () => {
    // Saira 500/600 · IBM Plex Sans 400/500/600 · JetBrains Mono 400/500/700.
    const LOADED = new Set(['400', '500', '600', '700']);
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCssComments(read(f)).matchAll(/font-weight:\s*([^;]+);/g)) {
        if (!LOADED.has(m[1]!.trim())) offenders.push(`${rel(f)}: font-weight: ${m[1]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every border-radius is one of the three radius tokens (nothing exceeds 4px)', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCssComments(read(f)).matchAll(/border-radius:\s*([^;]+);/g)) {
        if (!/^var\(--radius-(cell|control|panel)\)$/.test(m[1]!.trim())) {
          offenders.push(`${rel(f)}: border-radius: ${m[1]!.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('token-audit/tag-floor', () => {
  // DESIGN.md §8, decided 2026-08-13: the P/M/T tag renders at `max(10px, 0.7em)`.
  //
  // jsdom resolves neither `em` nor `max()`, and vitest does not load stylesheets into the
  // test DOM at all, so `getComputedStyle` cannot answer this. Instead the real declaration
  // is read out of primitives.css and evaluated against the real numeric role sizes in
  // tokens.css — which is a stronger check than a computed style anyway, because it pins
  // every role at once rather than the one that happened to be rendered.

  /** The `.dmg__tag` font-size, exactly as the stylesheet states it. */
  const declared = (() => {
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        if (r.selector.trim() !== '.dmg__tag') continue;
        const m = r.body.match(/font-size:\s*([^;]+);/);
        if (m) return m[1]!.trim();
      }
    }
    return null;
  })();

  /** Numeric role sizes in px, read from tokens.css. */
  const roleSizes = (() => {
    const out: Record<string, number> = {};
    for (const m of read(TOKENS_FILE).matchAll(/(--type-num-[\w-]+):\s*([\d.]+)rem/g)) {
      out[m[1]!] = parseFloat(m[2]!) * 16; // 16px root, per DESIGN.md §3
    }
    return out;
  })();

  /** Evaluate `max(Apx, Bem)` against a parent font size, the way a browser would. */
  function evaluate(decl: string, parentPx: number): number {
    const m = decl.match(/^max\(\s*([\d.]+)px\s*,\s*([\d.]+)em\s*\)$/);
    if (!m) throw new Error(`tag-floor: cannot evaluate font-size "${decl}"`);
    return Math.max(parseFloat(m[1]!), parseFloat(m[2]!) * parentPx);
  }

  it('declares the tag size as max(10px, 0.7em), not a bare em and not a flat px', () => {
    expect(declared).toBe('max(10px, 0.7em)');
  });

  it('reads all four numeric roles from tokens.css', () => {
    expect(roleSizes).toEqual({
      '--type-num-hero': 28,
      '--type-num-l': 16,
      '--type-num-m': 13,
      '--type-num-s': 11,
    });
  });

  it('THE FLOOR BINDS on the two smallest roles — 11px and 13px both give a 10px tag', () => {
    // Without the floor these were 7.7px and 9.1px, below the 11px legibility premise
    // DESIGN.md §8's own argument for letters over glyphs rests on.
    expect(evaluate(declared!, roleSizes['--type-num-s']!)).toBe(10);
    expect(evaluate(declared!, roleSizes['--type-num-m']!)).toBe(10);
    expect(evaluate(declared!, 11)).not.toBeCloseTo(7.7);
    expect(evaluate(declared!, 13)).not.toBeCloseTo(9.1);
  });

  it('THE FLOOR DOES NOT BIND at 16px or hero — 0.7em still governs there', () => {
    // This is the half that a component which simply hard-coded 10px everywhere would
    // fail: the hero tag must still be 19.6px, not 10px.
    expect(evaluate(declared!, roleSizes['--type-num-l']!)).toBeCloseTo(11.2);
    expect(evaluate(declared!, roleSizes['--type-num-hero']!)).toBeCloseTo(19.6);
    expect(evaluate(declared!, roleSizes['--type-num-hero']!)).not.toBe(10);
  });

  it('no numeric role renders a tag below 10px', () => {
    const tooSmall = Object.entries(roleSizes).filter(
      ([, px]) => evaluate(declared!, px) < 10,
    );
    expect(tooSmall).toEqual([]);
  });
});

describe('token-audit/reserved-hue-law', () => {
  it('a reserved hue appears only in an allow-listed rule', () => {
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        for (const hue of HUE_TOKENS) {
          if (!r.body.includes(`var(${hue})`)) continue;
          if (!(r.selector in HUE_ALLOWLIST)) {
            offenders.push(`${rel(f)}: ${r.selector} uses ${hue} but is not allow-listed`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every allow-listed hue rule is actually present — the list holds no dead entries', () => {
    const seen = new Set<string>();
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        if (HUE_TOKENS.some((h) => r.body.includes(`var(${h})`))) seen.add(r.selector);
      }
    }
    expect([...Object.keys(HUE_ALLOWLIST)].filter((s) => !seen.has(s))).toEqual([]);
  });

  it('nothing about verification status is coloured, sized or weighted per state', () => {
    // DESIGN.md §6: "a verified figure and a derived figure must never differ by turning
    // something green or amber." This is the mechanical form of that sentence, and it also
    // blocks the subtler versions — a per-state font-size, weight, opacity or italic.
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        const perState =
          /\[data-state/.test(r.selector) ||
          /\.vstat--/.test(r.selector) ||
          /\.vstat__glyph--/.test(r.selector);
        if (perState) offenders.push(`${rel(f)}: ${r.selector} styles one status apart`);
        if (/^\.vstat\b/.test(r.selector)) {
          if (/font-style:\s*italic/.test(r.body)) offenders.push(`${rel(f)}: ${r.selector} italic`);
          if (/opacity:/.test(r.body)) offenders.push(`${rel(f)}: ${r.selector} opacity`);
          for (const hue of HUE_TOKENS) {
            if (r.body.includes(`var(${hue})`)) offenders.push(`${rel(f)}: ${r.selector} ${hue}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the status mark uses exactly one colour, and it is --text-secondary', () => {
    const colours = new Set<string>();
    for (const f of STYLESHEETS) {
      for (const r of rules(read(f))) {
        if (!/^\.vstat/.test(r.selector)) continue;
        for (const m of r.body.matchAll(/(?:^|[\s;])color:\s*var\((--[\w-]+)\)/g)) {
          colours.add(m[1]!);
        }
      }
    }
    expect([...colours]).toEqual(['--text-secondary']);
  });
});

describe('token-audit/banned-looks', () => {
  it('declares no serif face — the cream/serif/terracotta default cannot get in by type', () => {
    // HONEST SCOPE. The three looks CLAUDE.md and SPECIFICATION §10.1 reject are
    // judgements about a whole composition, and no regex settles them. What IS mechanical
    // is the single ingredient each one needs: a serif display face for the first, and an
    // off-palette accent colour for the second — and the colour tests above already make
    // any off-palette colour impossible anywhere in the area. So this checks the type half
    // and the colour tests cover the rest. The layout half (the broadsheet look) is a
    // human judgement and is NOT claimed to be tested here.
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      if (/\bserif\b/.test(stripCssComments(read(f)).replace(/sans-serif/g, ''))) {
        offenders.push(`${rel(f)}: declares a serif face`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
