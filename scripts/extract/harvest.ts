// The harvester: turn ability templates into draft curated entries.
//
// This is the tool that makes the curation phase small. It does not decide anything an author
// is responsible for — it pre-assigns a library shape and pre-fills the numbers, so authoring
// becomes "confirm and correct" rather than "read and type". Anything it cannot classify is
// reported as an issue on the draft rather than guessed at.
//
// It writes DRAFTS ONLY, into build/proposed-curated/. Nothing here writes /curated/: that is
// the irreplaceable asset, it is read-only on disk, and only a human unlock followed by a lead
// merge may change it (SPECIFICATION §7.3, curated/README.md).

import type {
  AbilitySlot,
  CuratedAbility,
  DamageType,
  InstanceType,
  Provenance,
} from '../../src/types/data.ts';
import { expandByRank, isLevelScaled } from '../../src/types/scaling.ts';
import { compareExpansion } from '../../src/types/validate-curated.ts';
import { classifyRow, proposeRelations, type RowIssue, type ShapeId } from './classify.ts';
import { renderAbility, type RenderedRow } from './render.ts';
import { parseFields, parseVardefines, statRows } from './wikitext.ts';

export const WIKI_API = 'https://wiki.leagueoflegends.com/en-us/api.php';
const UA = 'lol-damage-calc (curated-file build; contact rushi.lime49@gmail.com)';

/** Ability rank counts. R has 3, the rest have 5; a passive is a single unranked entry.
 *  Never inferred from the numbers — the same shorthand over 3 and 5 ranks differs. */
export function maxRankFor(slot: AbilitySlot): number {
  if (slot === 'R') return 3;
  if (slot === 'P') return 1;
  return 5;
}

/**
 * The wiki's slot alias for a template title. The passive is `I` (innate), NOT `P`:
 * `Template:Data Lux/P` does not exist, `Template:Data Lux/I` redirects to
 * `Template:Data Lux/Illumination`. Using `P` silently skipped every passive in the game —
 * and passives are where most prose-only damage lives, so the gap was large and invisible.
 */
export function wikiSlotAlias(slot: AbilitySlot): string {
  return slot === 'P' ? 'I' : slot;
}

export function instanceTypeFor(slot: AbilitySlot, hasDamage: boolean): InstanceType {
  if (!hasDamage) return 'non-damaging-ability';
  if (slot === 'P') return 'on-hit';
  return 'damaging-ability';
}

export function damageTypeOf(raw: string | undefined): DamageType | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (t.startsWith('physical')) return 'physical';
  if (t.startsWith('magic')) return 'magic';
  if (t.startsWith('true')) return 'true';
  return null;
}

export interface DraftAbility {
  entry: CuratedAbility;
  shapes: ShapeId[];
  issues: RowIssue[];
  droppedRows: Array<{ label: string; why: string }>;
  /** True when the template carries damage but nothing machine-readable was found — the
   *  prose-only worklist (136 abilities measured). */
  needsHandAuthoring: boolean;
  /**
   * The template HAD damage rows and every one of them was dropped, so this entry would
   * contribute zero damage.
   *
   * This guard exists because gate 2 is blind to it: an ability with no stored components has
   * nothing to round-trip against, so it passes every gate while being completely wrong. A
   * mis-scoped "summary row" filter did exactly this to 32 abilities — Veigar R, Jhin R,
   * Riven R, Vi Q, Varus Q, Sion Q and R among them. Silence is the failure mode; this makes
   * it loud.
   */
  droppedEveryDamageRow: boolean;
}

export interface TemplateSource {
  champion: string;
  slot: AbilitySlot;
  ability: string;
  wikitext: string;
  revisionId?: number;
}

/** Build a draft entry from one ability template. */
export function draftFromTemplate(src: TemplateSource, patch: string, fetched: string): DraftAbility {
  const fields = parseFields(src.wikitext);
  const vars = parseVardefines(src.wikitext);
  const maxRank = maxRankFor(src.slot);
  const damageType = damageTypeOf(fields.damagetype) ?? 'magic';

  const issues: RowIssue[] = [];
  const droppedRows: Array<{ label: string; why: string }> = [];
  const shapes: ShapeId[] = [];
  const components = [];

  const rows = statRows(fields);
  let sourceDamageRows = 0;
  for (const [index, row] of rows.entries()) {
    const c = classifyRow(row.label, row.value, { maxRank, damageType, vars, index });
    if (c.dropped !== 'not-damage') sourceDamageRows += 1;
    if (c.dropped) {
      if (c.dropped !== 'not-damage') droppedRows.push({ label: row.label, why: c.dropped });
      continue;
    }
    issues.push(...c.issues);
    if (c.component) {
      components.push(c.component);
      if (c.shape) shapes.push(c.shape);
    }
  }

  const withRelations = proposeRelations(components);
  const provenance: Provenance = {
    source: `Template:Data ${src.champion}/${src.ability}`,
    url: `https://wiki.leagueoflegends.com/en-us/Template:Data_${encodeURIComponent(
      src.champion,
    )}/${encodeURIComponent(src.ability)}`,
    patch,
    fetched,
  };

  const droppedEveryDamageRow = withRelations.length === 0 && sourceDamageRows > 0;
  // An ability with leveling rows, none of which are damage rows, is a genuinely
  // non-damaging ability (a shield, a heal) — not prose-only work. Only an ability with NO
  // usable rows at all and a declared damage type goes on the hand-authored worklist.
  const declaresDamage = damageTypeOf(fields.damagetype) !== null;
  const needsHandAuthoring =
    withRelations.length === 0 && (droppedEveryDamageRow || (declaresDamage && rows.length === 0));

  const entry: CuratedAbility = {
    champion: src.champion,
    slot: src.slot,
    abilityName: src.ability,
    instanceType: instanceTypeFor(src.slot, withRelations.length > 0),
    damageType,
    maxRank,
    components: withRelations,
    // Nothing the harvester produces is 'verified'. Verification is a gate outcome, not a
    // property a generator may assert about its own output.
    verification: needsHandAuthoring || issues.length > 0 ? 'incomplete' : 'derived',
    provenance,
    ...(src.revisionId !== undefined ? { sourceRevision: src.revisionId } : {}),
  };

  return { entry, shapes, issues, droppedRows, needsHandAuthoring, droppedEveryDamageRow };
}

// ---------------------------------------------------------------------------
// Gate 2 — round-trip against the wiki's own rendering
// ---------------------------------------------------------------------------

export interface RoundTripResult {
  entry: string;
  checkedRows: number;
  matchedRows: number;
  mismatches: Array<{ label: string; expected: number[]; actual: number[]; detail: string }>;
  /** Rows the wiki rendered that we could not line up with a stored component. */
  unmatchedRows: string[];
}

function normaliseLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Compare every stored component against the values the wiki rendered for the same label.
 * A stored `linear` and a stored `explicit` must both reproduce the source exactly — this is
 * what makes it safe to let the harvester choose between them.
 */
export function roundTrip(draft: DraftAbility, rendered: RenderedRow[]): RoundTripResult {
  const key = `${draft.entry.champion}/${draft.entry.slot}/${draft.entry.abilityName}`;
  const byLabel = new Map(rendered.map((r) => [normaliseLabel(r.label), r]));
  const used = new Set<string>();
  const mismatches: RoundTripResult['mismatches'] = [];
  let checked = 0;
  let matched = 0;

  for (const c of draft.entry.components) {
    const label = normaliseLabel(c.label ?? c.id);
    const source = byLabel.get(label);
    if (!source) continue; // reported via unmatchedRows from the other direction
    used.add(label);
    checked += 1;

    if (isLevelScaled(c.base)) {
      // The rendered box prints a level-scaled value as a single figure with "(based on
      // level)", not a per-rank series, so there is nothing to line up rank by rank.
      matched += 1;
      continue;
    }
    const actual = expandByRank(c.base, draft.entry.maxRank);
    const expected = source.values;
    // A payload row has no base on either side: the wiki reports an empty base series and we
    // store zeros. Comparing them is meaningless, so compare only the ratios below.
    const diff = expected.length === 0 ? [] : compareExpansion(expected, actual, 1e-6);

    // RATIOS, not just the base. This check did not exist until 2026-08-13: gate 2 compared
    // base values only, so a ratio could be stored with the wrong magnitude — or a multiplier
    // stored as though it were a ratio — and every gate still passed. The rendered box already
    // prints each ratio's expansion; nothing was reading it.
    const ratioDiffs: string[] = [];
    for (const [i, r] of c.ratios.entries()) {
      const sourceRatio = source.ratios[i];
      if (!sourceRatio || sourceRatio.length === 0) continue;
      if (isLevelScaled(r)) continue;
      const mine = expandByRank(r, draft.entry.maxRank);
      // A ratio that does not scale per rank is rendered as ONE number, not a series of five
      // identical ones. Compare like with like, or every flat ratio in the game reports four
      // phantom disagreements.
      const d =
        sourceRatio.length === 1
          ? compareExpansion(
              mine.map(() => sourceRatio[0]!),
              mine,
              1e-6,
            )
          : compareExpansion(sourceRatio, mine, 1e-6);
      if (d.length > 0) {
        ratioDiffs.push(
          `ratio ${i} (${r.stat}): ` +
            d.map((x) => `rank ${x.index + 1}: wiki ${x.expected}, stored ${x.actual}`).join('; '),
        );
      }
    }

    if (diff.length === 0 && ratioDiffs.length === 0) {
      matched += 1;
    } else if (diff.length === 0) {
      mismatches.push({
        label: c.label ?? c.id,
        expected: source.values,
        actual,
        detail: ratioDiffs.join(' | '),
      });
    } else {
      mismatches.push({
        label: c.label ?? c.id,
        expected,
        actual,
        detail: diff
          .map((d) => `rank ${d.index + 1}: wiki ${d.expected}, stored ${d.actual}`)
          .join('; '),
      });
    }
  }

  const unmatchedRows = rendered
    .filter((r) => /damage/i.test(r.label) && !used.has(normaliseLabel(r.label)))
    .map((r) => r.label);

  return { entry: key, checkedRows: checked, matchedRows: matched, mismatches, unmatchedRows };
}

/** Fetch a batch of ability templates, with their revision ids. */
export async function fetchTemplates(
  titles: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, { content: string; revid: number }>> {
  const out = new Map<string, { content: string; revid: number }>();
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url =
      `${WIKI_API}?` +
      new URLSearchParams({
        action: 'query',
        redirects: '1',
        prop: 'revisions',
        titles: chunk.join('|'),
        rvslots: 'main',
        rvprop: 'content|ids',
        format: 'json',
        formatversion: '2',
      });
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`wiki fetch failed: HTTP ${res.status}`);
    const json = (await res.json()) as {
      query?: {
        pages?: Array<{
          title: string;
          missing?: boolean;
          revisions?: Array<{ revid: number; slots: { main: { content: string } } }>;
        }>;
        normalized?: Array<{ from: string; to: string }>;
        redirects?: Array<{ from: string; to: string }>;
      };
    };
    const alias = new Map<string, string>();
    for (const n of json.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of json.query?.redirects ?? []) alias.set(r.from, r.to);
    const byTitle = new Map(
      (json.query?.pages ?? [])
        .filter((p) => !p.missing && p.revisions?.[0])
        .map((p) => [p.title, { content: p.revisions![0]!.slots.main.content, revid: p.revisions![0]!.revid }]),
    );
    for (const t of chunk) {
      let resolved = alias.get(t) ?? t;
      resolved = alias.get(resolved) ?? resolved;
      const hit = byTitle.get(resolved);
      if (hit) out.set(t, hit);
    }
  }
  return out;
}

export { renderAbility };
