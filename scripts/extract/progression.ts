// Turning the wiki's progression shorthand into a `Scaling`.
//
// `{{ap|…}}` (per ability rank) and `{{pp|…}}` (per champion level) are both expanded by
// `Module:Ability progression` through one shared helper, `string_to_formula`, which rewrites
// every `X to Y` span into:
//
//     (X) + ((Y) - (X)) / (times - 1) * (x - 1)
//
// and then evaluates it at x = 1..times. We follow that rewrite literally rather than pattern
// matching on the common cases, because the corpus contains spans wrapped in arithmetic —
// `50*0.35 to 170*0.35`, `(60 to 100)/10`, `(50/12)*4 to (150/12)*4` — where a shortcut would
// quietly give the wrong middle values.
//
// A middle value is never guessed. Where the source gives an explicit `v1|v2|…` list, those
// values are used verbatim (DATA-SOURCES §11).
//
// Arithmetic is evaluated by the small parser below, NOT by `eval`: this input comes off the
// public internet from a community-editable wiki.
//
// Pure: no network, no filesystem. Tested by progression.test.ts.

import type { Scaling } from '../../src/types/data.ts';
import { splitArgs } from './wikitext.ts';

export class ProgressionError extends Error {}

/**
 * The champion level cap, and the length `{{pp}}` fills a series to when nothing says otherwise.
 *
 * READ FROM THE SOURCE, not assumed: `Module:Ability progression` declares
 * `local defaultSize = 18` and, where a series comes out longer than that with no second axis,
 * displays only the first `defaultSize` values (`displayMaxColumn = defaultSize`). So a
 * piecewise progression that generates twenty values — Ziggs Short Fuse and Zoe Q both do —
 * describes levels 1..20 and the wiki itself shows 1..18. Storing the tail would be the
 * level-20 extrapolation trap of DATA-SOURCES §13.
 */
export const MAX_LEVEL = 18;

// ---------------------------------------------------------------------------
// A deliberately small arithmetic evaluator: numbers, + - * / ^, parentheses,
// and the two named values the wiki formula uses.
// ---------------------------------------------------------------------------

export function evaluateArithmetic(expr: string, vars: Record<string, number> = {}): number {
  let i = 0;
  // Two numbers separated only by whitespace are REFUSED rather than joined. Stripping
  // whitespace blindly turned the wiki's "30 3" (thirty, three steps) into 303 — a silently
  // plausible number, which is the failure mode this project exists to avoid. Real arithmetic
  // never needs a bare space between digits.
  if (/\d\s+[\d.]/.test(expr)) {
    throw new ProgressionError(
      `"${expr}" has two numbers separated only by a space — refusing to guess whether that ` +
        `is one number or two`,
    );
  }
  const src = expr.replace(/\s+/g, '');

  function peek(): string | undefined {
    return src[i];
  }
  function expectMore(what: string): void {
    if (i >= src.length) throw new ProgressionError(`unexpected end of expression, wanted ${what}`);
  }

  function parsePrimary(): number {
    expectMore('a value');
    const c = peek()!;
    if (c === '(') {
      i += 1;
      const v = parseSum();
      if (peek() !== ')') throw new ProgressionError(`unbalanced parentheses in "${expr}"`);
      i += 1;
      return v;
    }
    if (c === '-') {
      i += 1;
      return -parsePrimary();
    }
    if (c === '+') {
      i += 1;
      return parsePrimary();
    }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) {
      const v = vars[name[0]];
      if (v === undefined) throw new ProgressionError(`unknown name "${name[0]}" in "${expr}"`);
      i += name[0].length;
      return v;
    }
    throw new ProgressionError(`cannot read "${src.slice(i)}" in "${expr}"`);
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (peek() === '^') {
      i += 1;
      return base ** parsePower();
    }
    return base;
  }

  function parseProduct(): number {
    let v = parsePower();
    for (;;) {
      const c = peek();
      if (c === '*') {
        i += 1;
        v *= parsePower();
      } else if (c === '/') {
        i += 1;
        const d = parsePower();
        if (d === 0) throw new ProgressionError(`division by zero in "${expr}"`);
        v /= d;
      } else return v;
    }
  }

  function parseSum(): number {
    let v = parseProduct();
    for (;;) {
      const c = peek();
      if (c === '+') {
        i += 1;
        v += parseProduct();
      } else if (c === '-') {
        i += 1;
        v -= parseProduct();
      } else return v;
    }
  }

  const value = parseSum();
  if (i !== src.length) throw new ProgressionError(`trailing "${src.slice(i)}" in "${expr}"`);
  if (!Number.isFinite(value)) throw new ProgressionError(`"${expr}" is not finite`);
  return value;
}

/** True when the text is a balanced arithmetic expression (parens matched, nothing stray). */
function isBalanced(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

// NOTE: both helpers return the span UNTRIMMED. The caller slices the source by their
// length, so a trimmed return would shift the cut by the whitespace and splice the formula
// into the middle of a number ("80 to 240" became "8(…)0"). Trim at use, not at return.

/** Longest suffix of `s` that is balanced — the left operand of a `to`. */
function balancedSuffix(s: string): string {
  for (let start = 0; start < s.length; start += 1) {
    const candidate = s.slice(start);
    if (isBalanced(candidate) && candidate.trim() !== '') return candidate;
  }
  return '';
}

/** Longest prefix of `s` that is balanced — the right operand of a `to`. */
function balancedPrefix(s: string): string {
  for (let end = s.length; end > 0; end -= 1) {
    const candidate = s.slice(0, end);
    if (isBalanced(candidate) && candidate.trim() !== '') return candidate;
  }
  return '';
}

/**
 * Rewrite every `X to Y` span into the wiki's linear formula, leaving `x` symbolic.
 *
 * This is `string_to_formula` followed by the module's `gsub(useformula, "times", times)` — the
 * result is an expression in `x` that the caller evaluates at x = 1..steps. Keeping `x` symbolic
 * rather than substituting the index immediately is what lets one code path serve both an
 * `X to Y` span and a written-out per-level formula such as `35 + (180-35)/17*(x-1)`; the module
 * treats them identically, evaluating `expr(gsub(useformula, "x", x))` in both cases.
 */
export function rewriteToSpans(expr: string, steps: number): string {
  let cur = expr;
  for (let guard = 0; guard < 8 && / to /.test(` ${cur} `); guard += 1) {
    const at = cur.search(/(?<=^|[^A-Za-z])to(?=[^A-Za-z]|$)/);
    if (at < 0) break;
    const before = cur.slice(0, at);
    const after = cur.slice(at + 2);
    const left = balancedSuffix(before);
    const right = balancedPrefix(after);
    if (!left.trim() || !right.trim()) {
      throw new ProgressionError(`cannot find both sides of "to" in "${expr}"`);
    }
    const l = left.trim();
    const r = right.trim();
    const rewritten = steps === 1 ? `(${l})` : `((${l})+((${r})-(${l}))/(${steps - 1})*(x-1))`;
    cur = before.slice(0, before.length - left.length) + rewritten + after.slice(right.length);
  }
  return cur;
}

/**
 * Evaluate a progression expression at one index, following `string_to_formula`: rewrite the
 * innermost `X to Y` span into the linear formula, then evaluate at that index.
 */
export function evaluateAt(expr: string, index: number, steps: number): number {
  return evaluateArithmetic(rewriteToSpans(expr, steps), { x: index });
}

/** Round the way the wiki's `rounding` helper does when a `round=N` argument is present. */
function roundTo(value: number, places: number | undefined): number {
  if (places === undefined) return value;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

interface Parsed {
  /** Positional arguments with named ones (round=, key=, …) removed. */
  args: string[];
  round?: number;
}

function splitNamed(args: string[]): Parsed {
  const positional: string[] = [];
  let round: number | undefined;
  for (const a of args) {
    // Named args may carry a digit — `key1=`, `label1=`, `type2=`. A letters-only pattern
    // treated those as positional and broke 22 {{pp}} blocks.
    const m = /^\s*([a-z][a-z0-9_]*)\s*=\s*(.*)$/i.exec(a);
    if (m) {
      if (m[1]!.toLowerCase() === 'round') round = Number(m[2]);
      continue; // key=, color=, buzzword etc. are display-only
    }
    positional.push(a);
  }
  return { args: positional, round };
}

/**
 * Parse the inner text of an `{{ap|…}}` into a rank-scaled Scaling.
 * `maxRank` is the ability's rank count — 5 for a basic ability, 3 for an ultimate. It is
 * supplied by the caller and never inferred, because the same shorthand over 3 ranks and over
 * 5 ranks produces entirely different middle values.
 */
export function parseRankProgression(inner: string, maxRank: number): Scaling {
  const { args, round } = splitNamed(inner.split('|'));
  if (args.length === 0) throw new ProgressionError('empty {{ap}}');

  // Explicit per-rank list: several positional arguments, each a plain number.
  if (args.length > 1) {
    const values = args.map((a) => {
      const v = a.trim();
      if (!/^[\d.\s*/+()-]+$/.test(v)) throw new ProgressionError(`not a literal rank value: "${v}"`);
      return roundTo(evaluateArithmetic(v), round);
    });
    return { scaling: 'explicit', perRank: values };
  }

  const body = args[0]!.trim();

  // `X to Y by Z` — fixed step, rank count implied by the span.
  const by = /^(.*?)\s+to\s+(.*?)\s+by\s+(.*)$/.exec(body);
  if (by) {
    const from = evaluateArithmetic(by[1]!);
    const to = evaluateArithmetic(by[2]!);
    const step = evaluateArithmetic(by[3]!);
    if (step === 0) throw new ProgressionError('step of 0 in "X to Y by Z"');
    const steps = Math.round((to - from) / step) + 1;
    return { scaling: 'explicit', perRank: Array.from({ length: steps }, (_, k) => roundTo(from + step * k, round)) };
  }

  // `X to Y for N` — interpolate across exactly N values. The wiki also writes this WITHOUT
  // the word "for": `{{ap|20 to 30 3}}`, `{{ap|60 to 310 6}}`. That trailing bare number is
  // the step count, and it occurs 54 times across the roster — Jayce's abilities have six
  // ranks and every one of them is written this way, so treating it as a typo would get his
  // whole kit wrong.
  const forN = /^(.*)\s+for\s+(\d+)$/.exec(body) ?? /^(.*\sto\s.*?)\s+(\d+)$/.exec(body);
  const steps = forN ? Number(forN[2]) : maxRank;
  const expr = forN ? forN[1]!.trim() : body;

  if (!/(?<=^|[^A-Za-z])to(?=[^A-Za-z]|$)/.test(expr)) {
    // A single constant that does not vary by rank.
    const v = roundTo(evaluateArithmetic(expr), round);
    return { scaling: 'explicit', perRank: Array.from({ length: maxRank }, () => v) };
  }

  const series = Array.from({ length: steps }, (_, k) => roundTo(evaluateAt(expr, k + 1, steps), round));
  // `linear` is expanded against the ability's rank count, so it can only represent a series
  // that HAS that many values. A `for N` progression with N != maxRank must be stored
  // explicitly — otherwise "60 to 100 for 3" would come back as five values, not three.
  if (series.length !== maxRank) return { scaling: 'explicit', perRank: series };
  return asLinearIfEven(series, round);
}

/**
 * Store an even progression as `linear` (two numbers) and anything else as `explicit`.
 * Both expand to exactly the same series — this only chooses the tidier representation, and
 * the round-trip gate checks the choice rather than trusting it.
 */
export function asLinearIfEven(series: number[], round?: number): Scaling {
  if (series.length === 0) throw new ProgressionError('empty progression');
  if (series.length === 1) return { scaling: 'explicit', perRank: [series[0]!] };
  const from = series[0]!;
  const to = series[series.length - 1]!;
  const tolerance = round === undefined ? 1e-9 : 0.5 * 10 ** -round;
  const even = series.every((v, k) => {
    const expected = from + ((to - from) / (series.length - 1)) * k;
    return Math.abs(v - expected) <= Math.max(tolerance, 1e-9);
  });
  return even ? { scaling: 'linear', from, to } : { scaling: 'explicit', perRank: series };
}

/**
 * Parse the inner text of a `{{pp|…}}` into a level-scaled Scaling.
 * First positional argument is the value expression; the second, when present, gives the
 * champion levels the values sit at (`1 to 13` or `1;6;11;16`).
 *
 * `{{pp}}` IS NOT ALWAYS A LEVEL AXIS. It is a general progression template, and a handful of
 * abilities use it for something else entirely: Hwei's Grim Visage indexes 0–1100 ability
 * power, Kai'Sa's Supercharge indexes 0–100 percent. Storing those as champion levels would
 * be silently wrong, so an axis that leaves 1..18 is refused here and the ability goes to the
 * hand-authored worklist instead.
 */
export function parseLevelProgression(inner: string): Scaling {
  // splitArgs, not String.split('|') — a naive split cuts a nested block in half. `type=` and
  // `formula=` arguments routinely carry `[[File:Comet Spear.png|20px|border]]`, and splitting
  // inside that turned the value argument into "20px" on 12 blocks.
  const { args, round } = splitNamed(splitArgs(inner));
  if (args.length === 0) throw new ProgressionError('empty {{pp}}');
  const valueArg = args[0]!.trim();
  const levelArg = args[1]?.trim();

  let values = readSeries(valueArg, round);
  // When the value side carries no explicit step count it defaults to one value per champion
  // level (18). If the level side is an explicit list, IT states the step count — "40 to 70"
  // against levels "1;7;13" is three values, not eighteen. Re-read with that length.
  if (values.length === MAX_LEVEL && levelArg && /;/.test(levelArg)) {
    const levelCount = levelArg.split(';').length;
    if (levelCount !== MAX_LEVEL) values = readSeries(valueArg, round, levelCount);
  }
  let levels = levelArg ? readSeries(levelArg, undefined, values.length) : undefined;

  if (!levels) {
    // No level list: the values sit at levels 1..18, one per level. A piecewise progression can
    // generate more than eighteen — Ziggs Short Fuse and Zoe Q both produce twenty — and the
    // module itself shows only the first eighteen (see MAX_LEVEL). Keep those; the tail
    // describes levels 19 and 20, which do not exist in normal play (DATA-SOURCES §13).
    if (values.length > MAX_LEVEL) values = values.slice(0, MAX_LEVEL);
    // `byLevel` is a from/to pair that the engine RE-INTERPOLATES linearly, so it may only be
    // used for a series that really is linear. It was previously taken for any 18-value series
    // without checking — harmless while every such series came from an `X to Y` span, and wrong
    // the moment a piecewise curve produced one: Ziggs Short Fuse rises 4, then 8, then 12 per
    // level, and stored as `byLevel 20 to 160` it would read 28.2 at level 2 instead of 24.
    const even = asLinearIfEven(values, round);
    if (values.length === MAX_LEVEL && even.scaling === 'linear') {
      return { scaling: 'byLevel', from: even.from, to: even.to, atLevels: [1, MAX_LEVEL], steps: MAX_LEVEL };
    }
    return { scaling: 'byLevelExplicit', values, atLevels: values.map((_, k) => k + 1) };
  }
  if (levels.length !== values.length) {
    throw new ProgressionError(
      `{{pp}} has ${values.length} values but ${levels.length} levels`,
    );
  }
  // A level axis that runs past 18 — Mordekaiser Q's `1;10 to 20` is written that way — is the
  // same over-generation as above. Drop the TRAILING steps beyond 18 and keep the rest. A level
  // above 18 anywhere but at the end is not an over-run and is refused below.
  while (levels.length > 0 && levels[levels.length - 1]! > MAX_LEVEL) {
    levels = levels.slice(0, -1);
    values = values.slice(0, -1);
  }
  if (levels.length === 0) {
    throw new ProgressionError(`{{pp}} second axis has no step at or below champion level ${MAX_LEVEL}`);
  }
  if (levels.some((l) => l < 1 || l > MAX_LEVEL || !Number.isInteger(l))) {
    throw new ProgressionError(
      `{{pp}} second axis [${levels.join(', ')}] is not champion levels 1..18 — ` +
        `this template indexes something else (ability power, a percentage), so it cannot be ` +
        `stored as level scaling`,
    );
  }
  // An evenly spaced level list with an even value series is the compact `byLevel` form.
  const asLinear = asLinearIfEven(values, round);
  const levelsEven = asLinearIfEven(levels);
  if (asLinear.scaling === 'linear' && levelsEven.scaling === 'linear') {
    return {
      scaling: 'byLevel',
      from: asLinear.from,
      to: asLinear.to,
      atLevels: [levels[0]!, levels[levels.length - 1]!],
      steps: values.length,
    };
  }
  return { scaling: 'byLevelExplicit', values, atLevels: levels };
}

/** Does this expression use `x`, the wiki's champion-level variable? */
function usesX(expr: string): boolean {
  return /(?<=^|[^A-Za-z0-9_])x(?=[^A-Za-z0-9_]|$)/.test(expr);
}

/** Does this expression contain an `X to Y` span? */
function usesTo(expr: string): boolean {
  return /(?<=^|[^A-Za-z])to(?=[^A-Za-z]|$)/.test(expr);
}

/**
 * One segment of a series: a constant, an `X to Y` span, or a formula written in `x`.
 *
 * `for N` states the segment's length. Where it is absent the module fills to `defaultSize`
 * (18 champion levels), which is what `fallbackSteps` carries. A segment that varies but does
 * not say how long it is, in a series that has other segments, is REFUSED rather than assumed
 * to be 18 — in a chain the lengths have to add up and guessing one moves every level after it.
 */
function readSegment(
  seg: string,
  round: number | undefined,
  fallbackSteps: number | undefined,
): number[] {
  const forN = /^(.*)\s+for\s+(\d+)$/.exec(seg) ?? /^(.*\sto\s.*?)\s+(\d+)$/.exec(seg);
  let expr = forN ? forN[1]!.trim() : seg;
  const varies = usesTo(expr) || usesX(expr);
  if (!varies) return [roundTo(evaluateArithmetic(expr), round)];

  if (!forN && fallbackSteps === undefined) {
    throw new ProgressionError(
      `segment "${seg}" varies but does not say over how many levels, and its length cannot be ` +
        `read off the other axis — refusing to assume one`,
    );
  }
  const steps = forN ? Number(forN[2]) : (fallbackSteps as number);
  if (!Number.isInteger(steps) || steps < 1) {
    throw new ProgressionError(`segment "${seg}" has a step count of ${steps}`);
  }
  if (usesTo(expr)) expr = rewriteToSpans(expr, steps);
  return Array.from({ length: steps }, (_, k) =>
    roundTo(evaluateArithmetic(expr, { x: k + 1 }), round),
  );
}

/**
 * Read one `{{pp}}`/`{{ap}}` axis argument into a series.
 *
 * The argument is a `;`-separated CHAIN of segments, which is how the module reads it
 * (`lib.split(args[1], ";", true)`, then one pass per entry appending to the result). Three
 * forms of chain occur and all three are the same mechanism:
 *
 *   `1;7;13`                                  three constants — a level list
 *   `1;10 to 20`                              a constant, then a span
 *   `16+4*x for 6; then +8*x for 6; then …`   a PIECEWISE progression (Ziggs Short Fuse)
 *
 * The word `then` is not decoration: the module substitutes the previous segment's last value
 * for it (`gsub(useformula, "then", last_value, 1)`), so `then +8*x for 6` means "carry on from
 * where the last segment ended, adding 8 per level, for six more levels". Reading it any other
 * way gives a curve that is right at level 1 and wrong everywhere after.
 */
function readSeries(arg: string, round?: number, expectedLength?: number): number[] {
  const cleaned = arg.replace(/%/g, '').trim();
  const segments = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (segments.length === 0) throw new ProgressionError(`empty progression argument "${arg}"`);

  const target = expectedLength ?? MAX_LEVEL;
  const out: number[] = [];
  let last: number | undefined;
  for (const [i, raw] of segments.entries()) {
    let seg = raw;
    if (/(?<![A-Za-z])then(?![A-Za-z])/.test(seg)) {
      if (last === undefined) {
        throw new ProgressionError(`"${seg}" says "then" but no segment precedes it`);
      }
      seg = seg.replace(/(?<![A-Za-z])then(?![A-Za-z])/, `${last}`);
    }
    // A segment that varies without stating a length is FILLED to the axis length, which is
    // what the module does (`linear_filling` / `x_filling`, padding to `defaultSize` or to the
    // other axis's length). Mordekaiser Q's level axis `1;10 to 20` relies on it: the span has
    // to supply the eleven steps the value row still needs. Only the LAST segment may fill —
    // a fill in the middle would have to guess where the following segments start.
    const remainder = target - out.length;
    const fallback = i === segments.length - 1 && remainder >= 1 ? remainder : undefined;
    out.push(...readSegment(seg, round, fallback));
    last = out[out.length - 1];
  }
  return out;
}
