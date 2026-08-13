// Gate 2's ground truth: the values the wiki itself renders for an ability.
//
// WHY RENDER AT ALL. The round-trip check is only meaningful if the thing we compare against
// is independent of our own parser. Asking the wiki to expand the ability template gives us
// numbers produced by the wiki's own Lua — so a mistake in our progression parser shows up as
// a disagreement rather than being reproduced identically on both sides.
//
// WHY THE WHOLE TEMPLATE, NOT THE SHORTHAND. `{{ap|150 to 350}}` rendered on its own always
// yields five values: Module:Ability progression reads the rank count from the PARENT
// template's `skill` field (`fill = (skill ~= "R" and 5) or 3`), and a bare parse has no
// parent. Transcluding `{{Data <Champion>/<Ability>|Ability}}` renders the real box with the
// real rank count, so ultimates come back with three values as they should.
//
// WHAT WE READ, AND WHAT WE MUST NOT. Only `div.ability-info-stats > dl.skill-tabs`. The same
// page also renders a patch-history section whose lines read "Base damage changed to
// 100 / 175 / 250" — those are RETIRED values, and reading them is the documented trap in
// DATA-SOURCES §13 that produces a confident wrong number.

/** One rendered leveling row: the label and the per-rank values the wiki printed. */
export interface RenderedRow {
  label: string;
  values: number[];
  /** Ratio magnitudes in order, each already expanded per rank by the wiki. */
  ratios: number[][];
}

/** Strip HTML tags WITHOUT inserting spaces. `17.<small>5</small>` must become `17.5`. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&#95;/g, '_')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'");
}

/**
 * Separate the base series from the `(+ …)` ratio groups in a rendered value.
 * Parenthesis-balanced, because a ratio can nest one: Vladimir's R reads
 * `(+ 5% (+ 4% per 100 AP) of missing health)`.
 */
export function splitRatioGroups(text: string): { base: string; groups: string[] } {
  const groups: string[] = [];
  let base = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '(' && /^\(\s*\+/.test(text.slice(i))) {
      let depth = 0;
      let j = i;
      for (; j < text.length; j += 1) {
        if (text[j] === '(') depth += 1;
        else if (text[j] === ')') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      groups.push(text.slice(i, j));
      i = j;
    } else {
      base += text[i];
      i += 1;
    }
  }
  return { base, groups };
}

/**
 * A row whose entire value is a percentage of a champion stat — no flat base.
 * "6 / 6.5 / 7 / 7.5 / 8% of target's maximum health", "1 / 1.5 / 2% of target's maximum
 * health". The series is the PAYLOAD, not a base.
 */
const PAYLOAD_SERIES =
  /^\s*([\d.\s/]+?)\s*%\s*(?:of\s+)?[^%]*\b(?:health|armor|magic resistance|mana)\b/i;

function numbers(text: string): number[] {
  return text
    .split('/')
    .map((s) => s.trim())
    .filter((s) => /^-?\d+(\.\d+)?$/.test(s))
    .map(Number);
}

/**
 * Read the leveling rows out of a rendered ability box.
 * Confined to `ability-info-stats` so patch history can never be mistaken for live values.
 */
export function parseRenderedRows(html: string): RenderedRow[] {
  const rows: RenderedRow[] = [];
  const statsBlocks = html.match(/<div class="ability-info-stats">[\s\S]*?<\/div>/g) ?? [];
  for (const block of statsBlocks) {
    // <dt>…<b>Label:</b>…</dt><dd>values <span>(+ ratio)</span>…</dd>
    const pairRe = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(block)) !== null) {
      const label = stripTags(m[1]!).replace(/:\s*$/, '').trim();
      // Work from the STRIPPED TEXT, not the HTML. A first attempt keyed ratio spans on
      // `color:orange`, which is only the attack-damage colour — Lux's AP ratio renders
      // `#7A6DFF`, so its ratio was never removed, the trailing "240 (+ 75% AP)" failed the
      // numeric test, and every AP ability silently lost its last rank. In the text, a ratio
      // is unambiguous: a parenthesised group beginning "(+".
      const text = stripTags(m[2]!);
      const { base, groups } = splitRatioGroups(text);
      const ratios = groups
        .map((g) => numbers(g.replace(/^\s*\(\s*\+/, '').replace(/%[\s\S]*$/, '')))
        .filter((v) => v.length > 0);

      // A PAYLOAD ROW has no flat base at all: the whole thing is a percentage of a stat,
      // e.g. "6 / 6.5 / 7 / 7.5 / 8% of target's maximum health". Read as a base series it
      // loses its last rank (the "8%" fails the numeric test, giving NaN) and is then compared
      // against our stored base of 0 — so gate 2 reported a disagreement on every one of these
      // rows while telling us nothing. The series belongs at the FRONT of the ratio list,
      // matching how the classifier stores it: base 0, payload as ratio 0.
      const payload = PAYLOAD_SERIES.exec(base);
      if (payload) {
        const series = numbers(payload[1]!);
        if (series.length > 0) {
          if (label) rows.push({ label, values: [], ratios: [series, ...ratios] });
          continue;
        }
      }

      const values = numbers(base);
      if (label) rows.push({ label, values, ratios });
    }
  }
  return rows;
}

const API = 'https://wiki.leagueoflegends.com/en-us/api.php';

/** Render one ability template and read its leveling rows. */
export async function renderAbility(
  champion: string,
  ability: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedRow[]> {
  const body = new URLSearchParams({
    action: 'parse',
    text: `{{Data ${champion}/${ability}|Ability}}`,
    contentmodel: 'wikitext',
    prop: 'text',
    format: 'json',
    formatversion: '2',
    disablelimitreport: '1',
  });
  const res = await fetchImpl(API, {
    method: 'POST',
    body,
    headers: {
      'User-Agent': 'lol-damage-calc (curated-file build; contact rushi.lime49@gmail.com)',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!res.ok) throw new Error(`wiki render failed for ${champion}/${ability}: HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: string } };
  const html = json.parse?.text;
  if (!html) throw new Error(`wiki render returned no text for ${champion}/${ability}`);
  return parseRenderedRows(html);
}
