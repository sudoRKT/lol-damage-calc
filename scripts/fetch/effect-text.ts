// Reading the two shapes item and rune effect text actually arrives in.
//
// There are TWO sources and they are not alike, so nothing here is shared by accident:
//
//  - ITEM effects come from the wiki's `Module:ItemData/data`, as MediaWiki wikitext with
//    `{{as|…}}` wrappers around every quantity, exactly like the ability templates the
//    harvester reads. `Module:ItemData/data/<Item Name>` is the same content per item; the
//    single module page carries all of it, so one fetch is enough.
//  - RUNE effects come from Data Dragon's `runesReforged.json` `longDesc`, as HTML with the
//    numbers written into ordinary English (DATA-SOURCES §6). There is no wiki rune data
//    module — that was established by enumerating all 683 `Module:` pages on 2026-08-12.
//
// This file only turns both into text a classifier can read. It decides nothing about
// meaning; `effect-census.ts` does that.
//
// Pure: no network, no filesystem. Tested by effect-census.test.ts.

/** One `{{name|…}}` template occurrence, with its body and its span in the source. */
export interface Block {
  name: string;
  /** Everything after the first `|`, with nested templates left intact. */
  body: string;
  start: number;
  end: number;
}

/**
 * Find every `{{name|…}}` template in `text`, counting braces so nested templates are
 * returned whole rather than truncated at the first inner `}}`.
 *
 * `{{as|{{ap|60/6}} {{as|(+ {{ap|6/6}}% AP)}} magic damage|magic damage}}` (Blackfire Torch)
 * is one outer `as` block whose body still contains two inner ones. Passing `name` as
 * undefined returns every template at the OUTERMOST nesting level.
 */
export function findBlocks(text: string, name?: string): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== '{' || text[i + 1] !== '{') continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length - 1; j++) {
      if (text[j] === '{' && text[j + 1] === '{') {
        depth++;
        j++;
      } else if (text[j] === '}' && text[j + 1] === '}') {
        depth--;
        j++;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end === -1) continue;
    const inner = text.slice(i + 2, end - 2);
    const bar = inner.indexOf('|');
    const templateName = (bar === -1 ? inner : inner.slice(0, bar)).trim().toLowerCase();
    if (name === undefined || templateName === name.toLowerCase()) {
      out.push({
        name: templateName,
        body: bar === -1 ? '' : inner.slice(bar + 1),
        start: i,
        end,
      });
    }
    // Skip past this template so only the outermost level is reported.
    i = end - 1;
  }
  return out;
}

/**
 * Flatten wikitext to the words a reader would see: template wrappers, wiki links and
 * bold/italic markup removed, the text inside them kept.
 *
 * Deliberately crude. It is used to ask "does this sentence say `bonus health`", never to
 * extract a number — a number is only ever read from a block whose meaning the source names.
 */
export function plainText(wikitext: string): string {
  let text = wikitext;
  // Peel templates from the inside out, keeping their arguments.
  for (let pass = 0; pass < 12 && text.includes('{{'); pass++) {
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => {
      const parts = String(inner).split('|');
      const head = (parts[0] ?? '').trim().toLowerCase();
      // `{{tip|Slow|Slowing}}` and `{{as|value|key}}` both display an argument, not the name.
      if (parts.length === 1) return ' ';
      // Named arguments (`color=pd`) are formatting, never words.
      const positional = parts.slice(1).filter((p) => !/^\s*[a-z0-9 _-]+\s*=/i.test(p));
      if (head === 'tip' || head === 'sti' || head === 'stil' || head === 'ii') {
        return ' ' + (positional.at(-1) ?? '') + ' ';
      }
      return ' ' + positional.join(' ') + ' ';
    });
  }
  text = text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, ' $2 ');
  text = text.replace(/'''|''/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

/** Strip the HTML tags Data Dragon wraps rune prose in, keeping the words between them. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A cross-reference stub. Nine item effect entries in the live module are a bare string
 * rather than a table, and two of those are `=>Plated Steelcaps` / `=>Gluttonous Greaves`:
 * the module's own shorthand for "this effect is the one on that other item".
 *
 * They are recorded as cross-references rather than as unreadable text, because the fact
 * IS stated by the source — just somewhere else.
 */
export function crossReferenceTarget(text: string): string | null {
  const match = /^\s*=>\s*(.+?)\s*$/.exec(text);
  return match ? match[1]! : null;
}
