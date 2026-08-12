// Reading a `Template:Data <Champion>/<Ability>` page.
//
// The champion article is a thin shell; the numbers live in one template per ability
// (DATA-SOURCES §11). Each template is a flat list of `|key = value` fields, and the damage
// numbers sit inside the `leveling`, `leveling2`, … fields as `{{st|Label|Value|…}}` blocks.
//
// TWO BUGS LIVED HERE AND BOTH PRODUCED CONFIDENT WRONG ANSWERS. They are recorded because
// the shape of each is easy to reintroduce:
//
//  1. Splitting fields with a regex whose lookahead ended at `}}` before end-of-line. Every
//     value that ended in a template close lost its final `}}`, so `{{as|(+ 75% AP)}}` came
//     back as `{{as|(+ 75% AP)`. The AP ratio then failed to match and the ability looked
//     like flat damage. 36% of all abilities appeared to deal damage with no ratio at all —
//     which is what made it visible. Fields are now split line-anchored, not by lookahead.
//
//  2. Finding `{{ap|…}}` with a non-greedy regex. `{{ap|{{#var:b1}} to {{#var:b5}}}}` was
//     truncated at the first `}}`, yielding `{{#var:b1`. Nested blocks are now found by
//     counting braces, never by regex.
//
// Pure: no network, no filesystem. Tested by wikitext.test.ts.

/** One `{{name|…}}` occurrence, with its inner text and its span in the source. */
export interface Block {
  inner: string;
  start: number;
  end: number;
}

/**
 * Every `{{name|…}}` block in `source`, matched by counting braces so nesting is safe.
 * Returned in source order.
 */
export function findBlocks(source: string, name: string): Block[] {
  const out: Block[] = [];
  const opener = new RegExp(`\\{\\{${name}\\|`, 'g');
  let m: RegExpExecArray | null;
  while ((m = opener.exec(source)) !== null) {
    const innerStart = m.index + m[0].length;
    let i = innerStart;
    let depth = 1;
    while (i < source.length && depth > 0) {
      if (source.startsWith('{{', i)) {
        depth += 1;
        i += 2;
      } else if (source.startsWith('}}', i)) {
        depth -= 1;
        i += 2;
      } else {
        i += 1;
      }
    }
    // An unbalanced block means malformed wikitext; take what is there rather than throwing,
    // and let the classifier mark the ability unparsed.
    const end = depth === 0 ? i : source.length;
    out.push({ inner: source.slice(innerStart, depth === 0 ? i - 2 : source.length), start: m.index, end });
    opener.lastIndex = end;
  }
  return out;
}

/** Split on `|` at brace depth zero — the separator between template arguments. */
export function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < inner.length) {
    if (inner.startsWith('{{', i) || inner.startsWith('[[', i)) {
      depth += 1;
      cur += inner.slice(i, i + 2);
      i += 2;
    } else if (inner.startsWith('}}', i) || inner.startsWith(']]', i)) {
      depth -= 1;
      cur += inner.slice(i, i + 2);
      i += 2;
    } else if (inner[i] === '|' && depth === 0) {
      out.push(cur);
      cur = '';
      i += 1;
    } else {
      cur += inner[i];
      i += 1;
    }
  }
  out.push(cur);
  return out;
}

/**
 * The template's `|key = value` fields. Line-anchored: a field starts at a line beginning
 * with `|`, and everything up to the next such line belongs to it. See bug 1 above — do not
 * replace this with a lookahead regex.
 */
export function parseFields(templateText: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let key: string | null = null;
  let buf: string[] = [];
  for (const line of templateText.split('\n')) {
    const m = /^\|\s*([a-z0-9 _]+?)\s*=\s?(.*)$/.exec(line);
    if (m) {
      if (key !== null && !(key in fields)) fields[key] = buf.join('\n').trim();
      key = m[1]!.trim();
      buf = [m[2]!];
    } else if (key !== null) {
      buf.push(line);
    }
  }
  if (key !== null && !(key in fields)) fields[key] = buf.join('\n').trim();
  return fields;
}

/**
 * The `{{#vardefine:name|value}}` header some templates declare their raw numbers in
 * (DATA-SOURCES §11, "Variant B"). 96% of these are plain numbers, so substituting them
 * turns a variable-driven template into an ordinary one.
 */
export function parseVardefines(templateText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\{\{#vardefine:\s*([A-Za-z0-9_]+)\s*\|\s*([^}]*?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(templateText)) !== null) out[m[1]!] = m[2]!;
  return out;
}

/**
 * Replace `{{#var:name}}` with its declared value, and unwrap `{{fd|x}}` (a display-only
 * fixed-decimal wrapper). Iterated because a vardefine may reference another; capped so a
 * circular definition terminates instead of hanging.
 */
export function substituteVars(expr: string, vars: Record<string, string>): string {
  let cur = expr;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = cur
      .replace(/\{\{#var:\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) => vars[name] ?? whole)
      .replace(/\{\{fd\|([^{}]*)\}\}/g, '$1');
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

/** A `{{st|Label|Value|Label|Value|…}}` row pair. */
export interface StatRow {
  label: string;
  value: string;
  /** Which leveling field it came from: 'leveling', 'leveling2', … */
  field: string;
}

/** Strip wiki markup from a label so it can be compared and read. */
export function plainText(s: string): string {
  return s
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''|''/g, '')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .trim();
}

/** Every label/value pair across every `leveling*` field, in order. */
export function statRows(fields: Record<string, string>): StatRow[] {
  const rows: StatRow[] = [];
  const levelingKeys = Object.keys(fields)
    .filter((k) => /^leveling\d*$/.test(k))
    .sort();
  for (const field of levelingKeys) {
    for (const block of findBlocks(fields[field]!, 'st')) {
      const args = splitArgs(block.inner);
      for (let i = 0; i + 1 < args.length; i += 2) {
        rows.push({ label: plainText(args[i]!), value: args[i + 1]!.trim(), field });
      }
    }
  }
  return rows;
}
