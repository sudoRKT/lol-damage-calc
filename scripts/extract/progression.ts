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

export class ProgressionError extends Error {}

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
 * Evaluate a progression expression at one index, following `string_to_formula`: rewrite the
 * innermost `X to Y` span into the linear formula, then evaluate.
 */
export function evaluateAt(expr: string, index: number, steps: number): number {
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
    const rewritten =
      steps === 1 ? `(${l})` : `((${l})+((${r})-(${l}))/(${steps - 1})*(${index - 1}))`;
    cur = before.slice(0, before.length - left.length) + rewritten + after.slice(right.length);
  }
  return evaluateArithmetic(cur);
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
  const { args, round } = splitNamed(inner.split('|'));
  if (args.length === 0) throw new ProgressionError('empty {{pp}}');
  const valueArg = args[0]!.trim();
  const levelArg = args[1]?.trim();

  let values = readSeries(valueArg, round);
  // When the value side carries no explicit step count it defaults to one value per champion
  // level (18). If the level side is an explicit list, IT states the step count — "40 to 70"
  // against levels "1;7;13" is three values, not eighteen. Re-read with that length.
  if (values.length === 18 && levelArg && /;/.test(levelArg)) {
    const levelCount = levelArg.split(';').length;
    if (levelCount !== 18) values = readSeries(valueArg, round, levelCount);
  }
  const levels = levelArg ? readSeries(levelArg, undefined, values.length) : undefined;

  if (!levels) {
    // No level list: the values sit at levels 1..18, one per level.
    if (values.length === 18) return { scaling: 'byLevel', from: values[0]!, to: values[17]!, atLevels: [1, 18], steps: 18 };
    return { scaling: 'byLevelExplicit', values, atLevels: values.map((_, k) => k + 1) };
  }
  if (levels.length !== values.length) {
    throw new ProgressionError(
      `{{pp}} has ${values.length} values but ${levels.length} levels`,
    );
  }
  if (levels.some((l) => l < 1 || l > 18 || !Number.isInteger(l))) {
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

/** Read `a;b;c`, `X to Y for N`, `X to Y`, or a single constant into a series. */
function readSeries(arg: string, round?: number, expectedLength?: number): number[] {
  const cleaned = arg.replace(/%/g, '').trim();
  if (cleaned.includes(';')) {
    return cleaned
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => roundTo(evaluateArithmetic(s), round));
  }
  const forN =
    /^(.*)\s+for\s+(\d+)$/.exec(cleaned) ?? /^(.*\sto\s.*?)\s+(\d+)$/.exec(cleaned);
  const expr = forN ? forN[1]!.trim() : cleaned;
  const steps = forN ? Number(forN[2]) : (expectedLength ?? 18);
  if (!/(?<=^|[^A-Za-z])to(?=[^A-Za-z]|$)/.test(expr)) {
    return [roundTo(evaluateArithmetic(expr), round)];
  }
  return Array.from({ length: steps }, (_, k) => roundTo(evaluateAt(expr, k + 1, steps), round));
}
