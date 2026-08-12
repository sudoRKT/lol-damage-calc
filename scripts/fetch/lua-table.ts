// A small, deliberately boring parser for the subset of Lua that the League wiki's
// data modules are written in (DATA-SOURCES.md §1). `Module:ChampionData/data` is a
// machine-generated file of the form:
//
//   -- <pre>
//   return {
//     ["Aatrox"] = { ["id"] = 266, ["stats"] = { ["hp_base"] = 650, ... }, ... },
//   }
//   -- </pre>
//
// We do not evaluate Lua — we read the literal table. Everything this parser needs to
// handle was observed in the live file: double-quoted string keys and values, integers,
// decimals, negative numbers, positional `[1] = "x"` keys, `--` line comments (they
// appear mid-file, e.g. after Azir's `range`), and trailing commas. No booleans, no nil,
// no backslash escapes and no `--[[ ]]` block comments occur in the live module, but
// booleans/nil and escapes are supported anyway because they cost almost nothing.
//
// Pure: no network, no filesystem. Tested by lua-table.test.ts.

export type LuaValue = string | number | boolean | null | LuaTable;

/** A Lua table, flattened to a plain object. Positional entries get the keys "1", "2", … */
export interface LuaTable {
  [key: string]: LuaValue;
}

class LuaParseError extends Error {}

class Reader {
  // Written out longhand rather than as constructor parameter properties: Node's
  // strip-only TypeScript mode rejects parameter properties, and these scripts are run
  // directly by Node.
  src: string;
  i: number;

  constructor(src: string) {
    this.src = src;
    this.i = 0;
  }

  fail(message: string): never {
    const line = this.src.slice(0, this.i).split('\n').length;
    throw new LuaParseError(`${message} at line ${line} (offset ${this.i})`);
  }

  /** Advance past whitespace and `--` line comments. */
  skipTrivia(): void {
    for (;;) {
      while (this.i < this.src.length && /\s/.test(this.src[this.i]!)) this.i++;
      if (this.src.startsWith('--', this.i)) {
        const nl = this.src.indexOf('\n', this.i);
        this.i = nl === -1 ? this.src.length : nl + 1;
        continue;
      }
      return;
    }
  }

  peek(): string {
    return this.src[this.i] ?? '';
  }

  expect(ch: string): void {
    if (this.src[this.i] !== ch) this.fail(`expected '${ch}' but found '${this.peek()}'`);
    this.i++;
  }
}

function parseString(r: Reader): string {
  const quote = r.peek();
  if (quote !== '"' && quote !== "'") r.fail('expected a quoted string');
  r.i++;
  let out = '';
  while (r.i < r.src.length) {
    const ch = r.src[r.i]!;
    if (ch === '\\') {
      const next = r.src[r.i + 1]!;
      const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
      out += escapes[next] ?? next;
      r.i += 2;
      continue;
    }
    if (ch === quote) {
      r.i++;
      return out;
    }
    out += ch;
    r.i++;
  }
  return r.fail('unterminated string');
}

function parseNumberLiteral(r: Reader): number {
  const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(r.src.slice(r.i));
  if (!match) r.fail('expected a number');
  r.i += match[0].length;
  return Number(match[0]);
}

// Some values in the live module are written as arithmetic, not as a single literal.
// Observed: Kled's `hp_lvl` is `84+1000/17`. Lua evaluates that as 84 + (1000/17) =
// 142.8235294117647, so the parser must evaluate it rather than read "84" and stop.
// Only + - * / and parentheses occur; nothing else is supported on purpose.

function parseFactor(r: Reader): number {
  r.skipTrivia();
  if (r.peek() === '-') {
    r.i++;
    return -parseFactor(r);
  }
  if (r.peek() === '(') {
    r.i++;
    const value = parseExpression(r);
    r.skipTrivia();
    r.expect(')');
    return value;
  }
  return parseNumberLiteral(r);
}

function parseTerm(r: Reader): number {
  let value = parseFactor(r);
  for (;;) {
    r.skipTrivia();
    const op = r.peek();
    if (op !== '*' && op !== '/') return value;
    r.i++;
    const rhs = parseFactor(r);
    value = op === '*' ? value * rhs : value / rhs;
  }
}

function parseExpression(r: Reader): number {
  let value = parseTerm(r);
  for (;;) {
    r.skipTrivia();
    const op = r.peek();
    if (op !== '+' && op !== '-') return value;
    r.i++;
    const rhs = parseTerm(r);
    value = op === '+' ? value + rhs : value - rhs;
  }
}

function parseValue(r: Reader): LuaValue {
  r.skipTrivia();
  const ch = r.peek();
  if (ch === '{') return parseTable(r);
  if (ch === '"' || ch === "'") return parseString(r);
  if (ch === '-' && !r.src.startsWith('--', r.i)) return parseExpression(r);
  if (ch === '(' || ch === '.' || (ch >= '0' && ch <= '9')) return parseExpression(r);
  if (r.src.startsWith('true', r.i)) {
    r.i += 4;
    return true;
  }
  if (r.src.startsWith('false', r.i)) {
    r.i += 5;
    return false;
  }
  if (r.src.startsWith('nil', r.i)) {
    r.i += 3;
    return null;
  }
  return r.fail(`unexpected character '${ch}'`);
}

function parseTable(r: Reader): LuaTable {
  r.expect('{');
  const table: LuaTable = {};
  let nextPositional = 1;

  for (;;) {
    r.skipTrivia();
    if (r.peek() === '}') {
      r.i++;
      return table;
    }
    if (r.i >= r.src.length) r.fail('unterminated table');

    let key: string | null = null;

    if (r.peek() === '[') {
      // Bracketed key: ["name"] = … or [1] = …
      r.i++;
      r.skipTrivia();
      const raw =
        r.peek() === '"' || r.peek() === "'" ? parseString(r) : String(parseExpression(r));
      r.skipTrivia();
      r.expect(']');
      r.skipTrivia();
      r.expect('=');
      key = raw;
    } else {
      // Bare identifier key (`name = …`) or a positional value.
      const ident = /^[A-Za-z_]\w*/.exec(r.src.slice(r.i));
      if (ident) {
        const after = r.i + ident[0].length;
        const rest = r.src.slice(after);
        const eq = /^\s*=(?!=)/.exec(rest);
        if (eq) {
          key = ident[0];
          r.i = after + eq[0].length;
        }
      }
    }

    const value = parseValue(r);
    table[key ?? String(nextPositional++)] = value;

    r.skipTrivia();
    if (r.peek() === ',' || r.peek() === ';') r.i++;
  }
}

/**
 * Parse a wiki data module's Lua source (with or without its leading `return`) into a
 * plain object. Throws with a line number if the source is not the expected shape.
 */
export function parseLuaModule(source: string): LuaTable {
  const r = new Reader(source);
  r.skipTrivia();
  if (r.src.startsWith('return', r.i)) r.i += 'return'.length;
  const value = parseValue(r);
  if (typeof value !== 'object' || value === null) {
    throw new LuaParseError('module did not return a table');
  }
  return value;
}

/** Narrow a LuaValue to a table, or throw naming the field that was wrong. */
export function asTable(value: LuaValue | undefined, what: string): LuaTable {
  if (typeof value !== 'object' || value === null) {
    throw new LuaParseError(`${what}: expected a table, found ${typeof value}`);
  }
  return value;
}

/** Read a required number field, or throw naming it. */
export function requireNumber(table: LuaTable, key: string, what: string): number {
  const value = table[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new LuaParseError(`${what}: field "${key}" is not a number (found ${JSON.stringify(value)})`);
  }
  return value;
}

/** Read a required string field, or throw naming it. */
export function requireString(table: LuaTable, key: string, what: string): string {
  const value = table[key];
  if (typeof value !== 'string' || value === '') {
    throw new LuaParseError(`${what}: field "${key}" is not a string (found ${JSON.stringify(value)})`);
  }
  return value;
}
