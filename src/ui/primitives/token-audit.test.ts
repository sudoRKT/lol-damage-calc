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
  '.verdict--lethal': 'DESIGN.md §7 — the LETHAL callout, the one permitted use of --lethal',
  // DESIGN.md §9: a combat-relevant icon-chip carries a 2px bottom underline in its damage-type
  // colour AND a P/M/T corner tag. The chip IS damage data — it says what type the ability deals
  // — so this is the reserved-hue law's permitted use, not an exception to it.
  '.chip__underline--physical': 'DESIGN.md §9 — icon-chip damage-type underline',
  '.chip__underline--magic': 'DESIGN.md §9 — icon-chip damage-type underline',
  '.chip__underline--true': 'DESIGN.md §9 — icon-chip damage-type underline',
  // The corner tag was the P/M/T damage-type letter and is now the ABILITY SLOT (2026-08-14).
  // A slot letter is not damage data, so `.chip__tag` carries no hue at all and has no entry
  // here. The damage type moved to the word beneath the chip, which IS damage data.
  '.chip__type--physical': 'DESIGN.md §9 — the icon-chip’s damage-type word',
  '.chip__type--magic': 'DESIGN.md §9 — the icon-chip’s damage-type word',
  '.chip__type--true': 'DESIGN.md §9 — the icon-chip’s damage-type word',
  // DESIGN.md §7, the HP burndown. Every entry below colours DAMAGE DATA: a riser IS the
  // damage it drops by, the hatch IS the damage-over-time tail, the rule IS the kill, and
  // the ghost is the band of health a hit just removed. None of them is decoration, and none
  // of them is a status, an interaction state or a surface.
  '.burn__bar--physical': 'DESIGN.md §7 — riser coloured by the instance’s damage type',
  '.burn__bar--magic': 'DESIGN.md §7 — riser coloured by the instance’s damage type',
  '.burn__bar--true': 'DESIGN.md §7 — riser coloured by the instance’s damage type',
  '.burn__hatch--physical': 'DESIGN.md §7 — the hatched DoT tail, in the DoT source’s hue',
  '.burn__hatch--magic': 'DESIGN.md §7 — the hatched DoT tail, in the DoT source’s hue',
  '.burn__hatch--true': 'DESIGN.md §7 — the hatched DoT tail, in the DoT source’s hue',
  '.burn__chip--lethal': 'DESIGN.md §7 — the LETHAL callout chip’s 2px --lethal border',
  '.burn__rule-stroke--lethal': 'DESIGN.md §7 — the 2px solid --lethal rule at the zero crossing',
  '.burn__rule-stroke--dot': 'DESIGN.md §7 — the second, dashed --lethal rule at the DoT crossing',
  '.burn__ghost': 'DESIGN.md §7 — the transient recent-damage ghost, --flash-recent at ~35%',
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
  {
    value: '2px',
    rule: '.field input:focus-visible, .field select:focus-visible, button:focus-visible',
    reason: 'DESIGN.md §6 states the focus ring verbatim: a 2px bone outline offset 2px',
  },
  {
    value: '2px',
    rule: '.u-scroll-x:focus-visible',
    reason:
      'DESIGN.md §6 states the focus ring verbatim: a 2px bone outline offset 2px. The scroll ' +
      'region is focusable so a keyboard can scroll it (SPECIFICATION §10), so it must show ' +
      'focus like every other focusable thing in the product.',
  },
  {
    value: '100%',
    rule: '.breakdown',
    reason: 'a table filling its panel — a fraction of the parent, not a design length',
  },
  {
    value: '100%',
    rule: '.items__pool',
    reason:
      'the `min(--measure-list-column-min, 100%)` guard on a grid track: 100% is the TRACK’S ' +
      'OWN container, a fraction of the parent, not a design length. Without it the 256px ' +
      'measure is a hard floor and the grid pushes the page sideways on a narrow phone — the ' +
      'defect class DESIGN-AUDIT §6.5 measured. Same standing as .chip__img.',
  },
  {
    value: '100%',
    rule: '.chip__img',
    reason: 'the art fills the chip, whose size IS a token — a fraction, not a design length',
  },
  {
    value: '100%',
    rule: '.burn__bracket',
    reason:
      'the group bracket spans N sibling columns, and each column is `flex: 1 1 0` of the same ' +
      'axis — so 100% is ONE SIBLING’S OWN WIDTH, multiplied by --burn-group-span. A fraction ' +
      'of the parent, not a design length. Same standing as .chip__img.',
  },
  {
    value: '50%',
    rule: '.burn__bracket',
    reason:
      'the bracket starts at the centre of the column it is anchored to, so it spans from that ' +
      'column outward across the group. A fraction of the parent, not a design length.',
  },
  {
    value: '100%',
    rule: '.statblock__table',
    reason: 'a table filling its panel — a fraction of the parent, not a design length',
  },
  {
    value: '100%',
    rule: '.picker__list',
    reason:
      'the open picker list hangs off the bottom edge of its field: 100% is the ANCHOR’S OWN ' +
      'height, a fraction of the parent, not a design length. Same standing as .chip__img.',
  },
  {
    value: '100%',
    rule: '.shell__main',
    reason:
      'the page column fills its parent and is then clamped by --measure-reading-max and centred ' +
      'by margin-inline:auto. 100% is a fraction of the parent, not a design length — the same ' +
      'standing as .breakdown and .statblock. It is REQUIRED, not decorative: margin-inline:auto ' +
      'cancels flex stretch, so without it the column sizes to its content and overflows a phone.',
  },
  {
    value: '100%',
    rule: '.nav__panel',
    reason:
      'the open menu hangs off the bottom edge of the toggle — 100% is the ANCHOR’S OWN ' +
      'height, exactly as .picker__list above. Both are popovers anchored to the control that ' +
      'opens them, and neither number is a design length.',
  },
  // DESIGN.md §7 states four stroke widths verbatim for the burndown. They are quoted, not
  // chosen: "a 2px line in --hp-trace", "a 3px line dropping from Rᵢ", "a 2px solid --lethal
  // vertical rule", and a callout chip "with a 2px --lethal border". Same standing as the
  // focus-ring entry above — a value DESIGN.md itself writes down, with no token for it.
  { value: '2px', rule: '.burn__tread', reason: 'DESIGN.md §7 — "a 2px line in --hp-trace"' },
  { value: '3px', rule: '.burn__bar', reason: 'DESIGN.md §7 — "a 3px line dropping from Rᵢ"' },
  {
    value: '3px',
    rule: '.burn__heal',
    reason:
      'DESIGN.md §7, the healing riser — "a 3px line rising from the post-damage height". Same ' +
      'weight as the damage riser it sits beside on purpose: the two are the same kind of mark ' +
      'and the DOTTED stroke, not a different thickness, is what tells them apart.',
  },

  {
    value: '2px',
    rule: '.burn__rule-stroke--lethal',
    reason: 'DESIGN.md §7 — "a 2px solid --lethal vertical rule"',
  },
  {
    value: '2px',
    rule: '.burn__rule-stroke--dot',
    reason: 'DESIGN.md §7 — "a second, dashed --lethal rule", same weight as the first',
  },
  {
    value: '2px',
    rule: '.burn__chip--lethal',
    reason: 'DESIGN.md §7 — the callout chip is "bone text on --bg-panel with a 2px --lethal border"',
  },
  {
    value: '2px',
    rule: '.burn__riser:focus-visible',
    reason: 'DESIGN.md §6 states the focus ring verbatim: a 2px bone outline offset 2px',
  },
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
    //
    // A weight TOKEN is also accepted, and is the preferred form. The eight tokens were added to
    // DESIGN.md §3 and tokens.css on 2026-08-13; before that the file stated a weight per role in
    // prose only, so components carried numeric literals and this check could compare them
    // against nothing but a table. The token list here is read from tokens.css rather than
    // restated, so a token that stops existing fails instead of silently passing.
    const LOADED = new Set(['400', '500', '600', '700']);
    const declared = new Set(
      [...stripCssComments(read(TOKENS_FILE)).matchAll(/--(weight-[a-z-]+)\s*:\s*(\d{3})\s*;/g)]
        .filter((m) => LOADED.has(m[2]!))
        .map((m) => `var(--${m[1]!})`),
    );
    expect(declared.size, 'tokens.css declares no weight tokens').toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of STYLESHEETS) {
      for (const m of stripCssComments(read(f)).matchAll(/font-weight:\s*([^;]+);/g)) {
        const v = m[1]!.trim();
        if (!LOADED.has(v) && !declared.has(v)) offenders.push(`${rel(f)}: font-weight: ${v}`);
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

// =========================================================================================
// REDUCED MOTION IS A CONTRACT, AND IT IS SWEPT RATHER THAN SPOT-CHECKED.
//
// DESIGN.md §10: "The chart must be fully readable with all motion disabled." An animation whose
// keyframes use `from { … }` with `animation-fill-mode: backwards` holds its FIRST frame until it
// plays — so a selector that animates but is missing from the reduced-motion block does not
// merely skip its animation, it STICKS at the start state. `burn-draw-riser` starts at
// `scaleY(0)`, which means invisible, permanently, for exactly the users who asked for less
// motion.
//
// FOUND IN A REAL BROWSER ON 2026-08-14, not by a test: the healing riser rendered at zero height
// because `.burn__heal` had been given an animation and not added to the block. jsdom computes no
// layout and runs no animations, so no existing test could have caught it. This sweep is the
// mechanical form of that defect.
// =========================================================================================

describe('token-audit/reduced motion', () => {
  it('every animated selector is switched off under prefers-reduced-motion', () => {
    const offenders: string[] = [];
    for (const file of STYLESHEETS) {
      const css = readFileSync(file, 'utf8');
      const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(
        css.replace(/\/\*[\s\S]*?\*\//g, ''),
      );
      // A stylesheet with no animations at all needs no block.
      // The animation VALUE is captured and tested in code rather than excluded by a lookahead.
      // A first version wrote `animation:\s*(?!none)` and flagged `.burn--settled`, whose rule is
      // literally `animation: none` — `\s*` backtracked to zero characters and the lookahead then
      // examined " none", which does not begin with "none". Clever, and wrong.
      // COMMENTS ARE STRIPPED FIRST. Without it "DESIGN.md" inside a comment parsed as a class
      // called `.md` — this file's comments cite DESIGN.md constantly.
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const animated: string[] = [];
      for (const rule of code.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const value = /\banimation:\s*([^;]+)/.exec(rule[2]!)?.[1]?.trim();
        if (!value || value.startsWith('none')) continue;
        // The LAST class in each comma-separated selector is the element that animates.
        for (const selector of rule[1]!.split(',')) {
          const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => `.${m[1]}`);
          const last = classes[classes.length - 1];
          if (last) animated.push(last);
        }
      }
      if (animated.length === 0) continue;
      if (!reduced) {
        offenders.push(`${rel(file)}: animates ${animated.join(', ')} with no reduced-motion block`);
        continue;
      }
      const switchedOff = reduced[1]!;
      for (const selector of new Set(animated)) {
        if (!switchedOff.includes(selector)) {
          offenders.push(
            `${rel(file)}: ${selector} animates but is missing from the reduced-motion block — ` +
              `with a \`backwards\` fill it will stick at its FIRST keyframe, not settle`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
