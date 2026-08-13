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
  AbilityComponent,
  AbilitySlot,
  CuratedAbility,
  CuratedFile,
  DamageType,
  InstanceType,
  Provenance,
  Scaling,
  Unresolvable,
} from '../../src/types/data.ts';
import { expandByRank, isLevelScaled, levelBreakpoints } from '../../src/types/scaling.ts';
import {
  agreesAtDisplayPrecision,
  compareAtDisplayPrecision,
  compareExpansion,
  gateSchema,
} from '../../src/types/validate-curated.ts';
import {
  classifyRow,
  proposeRelations,
  rowDamageType,
  stripRangeQualifier,
  type RowIssue,
  type ShapeId,
} from './classify.ts';
import type { DamageInstance } from './damage-data.ts';
import { scanProse, type ProseSkip } from './prose.ts';
import { statedTypesFor } from './damage-data.ts';
import { renderAbility, renderAbilityDetail, renderLevelBlocks, type RenderedRow } from './render.ts';
import { findBlocks, parseFields, parseVardefines, statRows, substituteVars } from './wikitext.ts';
import { statedStepCount } from './progression.ts';

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

/**
 * The damage type a template STATES, or null.
 *
 * NEVER GUESSES, AND NEVER TAKES THE FIRST OF SEVERAL. An earlier version matched on a prefix, so
 * Ahri Q's `damagetype = Magic True` — an ability that deals magic on the way out and true on the
 * way back — read as plain "magic", and a blank field fell through to a caller that defaulted it
 * to magic. Caitlyn W's Headshot bonus is physical and was stored as magic, which sends it
 * through magic resistance instead of armor: not a near miss, a different number.
 */
export function damageTypeOf(raw: string | undefined): DamageType | null {
  const t = (raw ?? '').trim().toLowerCase();
  const named = (['physical', 'magic', 'true'] as const).filter((k) =>
    new RegExp(`\\b${k}\\b`).test(t),
  );
  return named.length === 1 ? named[0]! : null;
}

export interface DraftAbility {
  entry: CuratedAbility;
  shapes: ShapeId[];
  issues: RowIssue[];
  droppedRows: Array<{ label: string; why: string }>;
  /** True when the template carries damage but nothing machine-readable was found — the
   *  prose-only worklist (136 abilities measured). */
  needsHandAuthoring: boolean;
  /** Components recovered from description prose rather than from a leveling row (§20a). */
  proseComponents: number;
  /** Their ids, so gate 2 knows which components to check against the rendered description. */
  proseComponentIds: string[];
  /** Every prose {{pp}} block that was NOT read, with the reason. Reported, never silent. */
  proseSkipped: ProseSkip[];
  /** The level-progression block behind each level-scaled component, for gate 2 to re-render. */
  levelSources: LevelSource[];
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
  /** Rank count STATED by Data Dragon for this slot. When absent the structural default in
   *  `maxRankFor` applies — which is right for a passive and an assumption everywhere else,
   *  so it is the caller's job to supply this (DATA-SOURCES §22). */
  maxRank?: number;
  /** Module:DamageData/data, indexed by champion and ability. The prose path needs it to read
   *  a damage type rather than infer one; absent means the prose path has no cross-check and
   *  every block it reads is recorded as unlisted. */
  damageData?: Map<string, DamageInstance[]>;
}

/** A level-scaled component and the source block its numbers were read from. */
export interface LevelSource {
  componentId: string;
  /** 'pp' or 'pplevel' — the two render differently, so the name has to travel with the text. */
  name: string;
  inner: string;
}

/** Build a draft entry from one ability template. */
export function draftFromTemplate(src: TemplateSource, patch: string, fetched: string): DraftAbility {
  const fields = parseFields(src.wikitext);
  const vars = parseVardefines(src.wikitext);
  // A SECOND-FORM ABILITY IS RANKED BY THE ABILITY IT FOLLOWS, and the template says so.
  //
  // Nidalee's cougar abilities, Karma's mantra forms and Heimerdinger's upgraded turret carry a
  // header reading "''X'' scales with ''Y'' rank", and their damage rows state a step count to
  // match — 4, or 3 for UPGRADE!!!. Taking the rank count from the slot instead gave 5, so the
  // stored list was rejected as "4 values but the ability has 5 ranks" and six abilities were
  // unusable with correct numbers in them. The count is read here only when BOTH the header and
  // an explicit step count are present, so it is corroborated by the source twice rather than
  // inferred from the length of a list.
  // The header sits in a leveling field on five of the six, and in a description field on Karma
  // Soulflare — same statement, different field, so both are read.
  const allText = Object.values(fields).join('\n');
  const scalesWithOther = /scales\s+with\b[\s\S]{0,80}?\brank\b/i.test(allText);
  let statedRanks: number | undefined;
  if (scalesWithOther) {
    for (const row of statRows(fields)) {
      if (!/damage/i.test(row.label)) continue;
      const block = findBlocks(row.value, 'ap')[0];
      if (!block) continue;
      const n = statedStepCount(substituteVars(block.inner, vars));
      if (n !== undefined && n >= 1) { statedRanks = n; break; }
    }
  }
  const maxRank = statedRanks ?? src.maxRank ?? maxRankFor(src.slot);
  // The type comes from the template, else from Module:DamageData/data where it states exactly
  // one, else NOWHERE — and an ability whose damage type no source states cannot have its damage
  // stored at all, because every stored number would carry a guessed resistance.
  const statedTypes = statedTypesFor(src.damageData ?? new Map(), src.champion, src.ability).types;
  const damageType: DamageType | null =
    damageTypeOf(fields.damagetype) ?? (statedTypes.size === 1 ? [...statedTypes][0]! : null);

  const issues: RowIssue[] = [];
  const droppedRows: Array<{ label: string; why: string }> = [];
  const shapes: ShapeId[] = [];
  const components = [];
  const levelSources: LevelSource[] = [];

  const rows = statRows(fields);
  let sourceDamageRows = 0;
  // A row whose own label names a damage type may be read even when the ability-level field
  // states none — the label is the more specific statement of the two.
  const rowsToRead: Array<[number, (typeof rows)[number]]> = [...rows.entries()].filter(
    ([, r]) => damageType !== null || rowDamageType(r.label) !== null,
  );
  for (const [index, row] of rowsToRead) {
    const rowType = rowDamageType(row.label) ?? damageType;
    if (rowType === null) continue;
    const c = classifyRow(row.label, row.value, { maxRank, damageType: rowType, vars, index });
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
    if (c.extraComponent) components.push(c.extraComponent);
    if (c.levelSource && c.component) {
      levelSources.push({ componentId: c.component.id, ...c.levelSource });
    }
  }
  const levelingComponents = components.length;

  // THE PROSE PATH (DATA-SOURCES §20a). Only for an ability whose leveling rows produced
  // nothing: those are the prose-only worklist, and they are the only abilities where the
  // description can be read without risking a second copy of damage already stored.
  if (damageType === null && rows.some((r) => /damage/i.test(r.label) && rowDamageType(r.label) === null)) {
    // Two different silences, and saying which one it is matters: "no source states a type" sends
    // someone to look for a missing field, while "the source states two and the rows do not say
    // which is which" sends them to split the instances. Reporting the first when it is the
    // second was itself a finding of gate 5's second round.
    const declared = (fields.damagetype ?? '').trim();
    const multiple = ['physical', 'magic', 'true'].filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(declared));
    issues.push({
      kind: 'unknown-damage-type',
      detail:
        multiple.length > 1
          ? `the template states ${multiple.join(' and ')} — the ability deals more than one type ` +
            `and its rows do not say which row is which, so no row may be stored under one of them`
          : `no source states a damage type (template ${JSON.stringify(fields.damagetype ?? null)}, ` +
            `Module:DamageData/data ${statedTypes.size === 0 ? 'silent' : [...statedTypes].join('/')}) — ` +
            `nothing is stored, because every figure would carry a guessed resistance`,
    });
  }

  // NOT gated on the ability-level type. A prose instance names its own type in the wrapper it
  // sits in — "bonus physical damage" — and that is a statement about THAT instance, which is
  // more specific than the ability-level field. Gating it here was a real regression: Akshan P
  // declares `damagetype = Physical Magic`, which states two types rather than none, and both of
  // its instances were silently dropped.
  const prose = scanProse({
    champion: src.champion,
    ability: src.ability,
    fields,
    vars,
    damageData: src.damageData ?? new Map(),
    hasLevelingComponents: levelingComponents > 0,
  });
  const proseSkips = prose.skipped;
  const proseRows: Array<{ label: string; kept: boolean }> = [];
  const proseComponentIds: string[] = [];
  for (const [index, row] of prose.rows.entries()) {
    const c = classifyRow(row.label, row.value, {
      maxRank,
      damageType: row.damageType,
      vars,
      index: rows.length + index,
    });
    // ALL OR NOTHING. A prose row the classifier could not read in full would be stored short a
    // term or a ratio, which understates the ability while looking complete. The row is dropped
    // and reported instead.
    if (!c.component || c.issues.length > 0 || c.dropped) {
      proseSkips.push({
        refusal: 'unreadable',
        field: row.field,
        source: row.value.replace(/\s+/g, ' ').slice(0, 160),
        detail: c.dropped
          ? `dropped as ${c.dropped}`
          : c.issues.map((i) => `${i.kind}: ${i.detail}`).join(' | ').slice(0, 160) || 'no component produced',
      });
      proseRows.push({ label: row.label, kept: false });
      continue;
    }
    components.push(c.component);
    if (c.extraComponent) components.push(c.extraComponent);
    if (c.shape) shapes.push(c.shape);
    if (c.levelSource) levelSources.push({ componentId: c.component.id, ...c.levelSource });
    proseComponentIds.push(c.component.id);
    proseRows.push({ label: row.label, kept: true });
  }
  const proseComponents = components.length - levelingComponents;

  // A REPEATING COMPONENT NEEDS ITS HIT COUNT, AND THE SOURCE SUPPLIES IT INDIRECTLY.
  //
  // A damage-over-time ability prints two rows: a `Total` and a per-tick. The Total is dropped as
  // a summary — it is arithmetic on other rows and storing both double-counts — and the per-tick
  // row that survives was given `hits: 1`, so Cassiopeia Q stored a seventh of its damage while
  // every gate passed it. The tick count is not written anywhere as a number, but it is implied
  // exactly: Total / per-tick. That is division, not a guess.
  //
  // It is only taken when the answer is unambiguous: one repeating component, one dropped Total,
  // the quotient the SAME whole number at every rank, and at least two. Anything else keeps
  // hits: 1 and raises an issue, because a wrong multiplier is worse than a missing one.
  const repeating = components.filter((c) => c.hits !== undefined);
  if (repeating.length === 1 && damageType !== null) {
    const totalRow = rows.find((r) => DERIVED_ROW_LABEL.test(stripRangeQualifier(r.label).rest) && /damage/i.test(r.label));
    const c = repeating[0]!;
    if (totalRow) {
      const totalClass = classifyRow('Magic Damage', totalRow.value, { maxRank, damageType, vars, index: 0 });
      const derived = impliedHits(totalClass.component, c, maxRank);
      if (derived !== undefined) c.hits = derived;
      else {
        issues.push({
          kind: 'unknown-hit-count',
          detail:
            `"${c.label}" lands more than once and the source does not state how many times; the ` +
            `dropped total row does not divide by it evenly, so the count is not derivable`,
        });
      }
    } else {
      issues.push({
        kind: 'unknown-hit-count',
        detail: `"${c.label}" lands more than once and nothing in the template states how many`,
      });
    }
  } else if (repeating.length > 1) {
    issues.push({
      kind: 'unknown-hit-count',
      detail: `${repeating.length} repeating components; a total row cannot be attributed to one of them`,
    });
  }

  // The entry-level type is whatever the stored components agree on; where they disagree — an
  // ability that deals two types — it is left unstated rather than one of them being picked.
  const componentTypes = new Set(components.map((c) => c.damageType));
  const effectiveType = damageType ?? (componentTypes.size === 1 ? [...componentTypes][0]! : null);

  // GATE 7 — DOES WHAT WE STORE ADD UP TO THE TOTAL THE WIKI ITSELF PRINTS?
  //
  // Self-consistency against a figure the source states outright. It runs offline, needs no
  // sampling, and catches BOTH directions: a missing instance or multiplicity understates the
  // sum, and a double-counted row overstates it. Gate 5 found Heimerdinger W storing a third of
  // its damage and Cassiopeia Q a seventh — this is the check that would have found them without
  // an agent.
  //
  // Only `adds` components are summed, since an alternative replaces rather than joins. The
  // tolerance is the rounding the wiki's own display introduces: each summed term is printed to
  // two decimals, so N terms carry up to N/2 of the last place. Without that, Cassiopeia Q reads
  // 74.97 against 75 and reports a defect that is arithmetic, not damage.
  if (damageType !== null) {
    const totalRow = rows.find(
      (r) =>
        /^total\b/i.test(stripRangeQualifier(r.label).rest) &&
        /damage/i.test(r.label) &&
        !NON_CHAMPION_TOTAL.test(r.label),
    );
    const additive = components.filter((x) => x.relation?.kind !== 'alternativeTo');
    if (totalRow && additive.length > 0) {
      const tc = classifyRow('Magic Damage', totalRow.value, { maxRank, damageType, vars, index: 0 });
      if (tc.component && !isLevelScaled(tc.component.base)) {
        try {
          const want = expandByRank(tc.component.base, maxRank)[0]!;
          let terms = 0;
          const got = additive.reduce((n, x) => {
            if (isLevelScaled(x.base)) return n;
            terms += x.hits ?? 1;
            return n + expandByRank(x.base, maxRank)[0]! * (x.hits ?? 1);
          }, 0);
          const tolerance = Math.max(0.005 * Math.max(terms, 1), 1e-6);
          if (want > 0 && Math.abs(want - got) > tolerance) {
            issues.push({
              kind: 'total-mismatch',
              detail:
                `the wiki states a total of ${want} at rank 1 and our additive components sum to ` +
                `${Math.round(got * 1000) / 1000} — ${got < want ? 'a term or a multiplicity is missing' : 'something is counted twice'}`,
            });
          }
        } catch { /* a total that will not expand is reported by gate 1 instead */ }
      }
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

  // Does anything at all say this ability deals damage? Two independent sources are asked, and
  // 'no-damage' is only claimed when BOTH are silent.
  const declaresDamage = damageTypeOf(fields.damagetype) !== null;
  const statedByModule =
    statedTypesFor(src.damageData ?? new Map(), src.champion, src.ability).types.size > 0;

  const droppedEveryDamageRow = levelingComponents === 0 && sourceDamageRows > 0 && proseComponents === 0;
  // An ability with leveling rows, none of which are damage rows, is a genuinely
  // non-damaging ability (a shield, a heal) — not prose-only work. Only an ability with NO
  // usable rows at all that SOMETHING says deals damage goes on the hand-authored worklist.
  // Module:DamageData/data is consulted as well as the template: 21 abilities declare no
  // `damagetype` while the module states one, and calling those 'no damage' would assert
  // against a source rather than merely fail to read one.
  const needsHandAuthoring =
    withRelations.length === 0 &&
    (droppedEveryDamageRow || ((declaresDamage || statedByModule) && rows.length === 0));

  // WHAT THE ABILITY IS, NOT WHAT WE MANAGED TO READ. `instanceType` was set from whether we
  // stored a component, so the 80 abilities whose damage we cannot extract were labelled
  // 'non-damaging-ability' — a claim about the game, made from a failure of ours. It is now set
  // from what the sources SAY: the template's own `damagetype`, or Module:DamageData/data.
  const dealsDamage = withRelations.length > 0 || declaresDamage || statedByModule;
  const entry: CuratedAbility = {
    champion: src.champion,
    slot: src.slot,
    abilityName: src.ability,
    instanceType: instanceTypeFor(src.slot, dealsDamage),
    ...(effectiveType === null ? {} : { damageType: effectiveType }),
    maxRank,
    components: withRelations,
    // Nothing the harvester produces is 'verified'. Verification is a gate outcome, not a
    // property a generator may assert about its own output.
    verification:
      needsHandAuthoring || issues.length > 0
        ? 'incomplete'
        : withRelations.length === 0 && !dealsDamage
          ? 'no-damage'
          : 'derived',
    provenance,
    ...(src.revisionId !== undefined ? { sourceRevision: src.revisionId } : {}),
  };

  // NOTHING THAT FAILS GATE 1 MAY CLAIM BETTER THAN 'incomplete'.
  //
  // A structurally invalid entry is not "extracted from source, not independently confirmed" —
  // it is broken, and 21 entries were sitting at 'derived' while failing the schema: fourteen
  // with two components sharing an id (so one silently shadows the other and gate 2 compares
  // the wrong one), plus rank-count and missing-counter failures. A wrong number inside a
  // 'derived' entry is the exact failure this project exists to prevent, so the demotion is a
  // rule rather than a list of fixes.
  //
  // This does NOT repair the entry. It refuses to let it pass as understood.
  const oneEntry: CuratedFile = {
    version: 1, patch, fetched, abilities: [entry],
    itemEffects: [], runes: [], shards: [], exclusions: [],
  };
  // PERMANENT IS NOT PENDING. A ratio whose owner no source states can never be resolved by
  // anyone, so the entry records that as a fact about the source rather than leaving it to look
  // like work nobody has got to (SPECIFICATION §8, DATA-SOURCES §27).
  const unresolvable: Unresolvable[] = [];
  withRelations.forEach((c, ci) => {
    c.ratios.forEach((r, ri) => {
      if (r.owner === 'unresolved') {
        unresolvable.push({
          field: `components[${ci}].ratios[${ri}].owner (${r.stat})`,
          why: `the source names ${r.stat} and never says whose, and no other source states it`,
        });
      }
      (r.multipliers ?? []).forEach((m, mi) => {
        if (m.owner === 'unresolved') {
          unresolvable.push({
            field: `components[${ci}].ratios[${ri}].multipliers[${mi}].owner (${m.per})`,
            why: `the source names ${m.per} and never says whose, and no other source states it`,
          });
        }
      });
    });
  });
  if (unresolvable.length > 0) {
    entry.unresolvable = unresolvable;
    entry.verification = 'incomplete';
  }

  const schema = gateSchema(oneEntry);
  if (schema.failed > 0) {
    entry.verification = 'incomplete';
    for (const f of schema.findings) {
      issues.push({ kind: 'schema-invalid', detail: f.message.slice(0, 120) });
    }
  }

  return {
    entry,
    shapes,
    issues,
    droppedRows,
    needsHandAuthoring,
    droppedEveryDamageRow,
    proseComponents,
    proseComponentIds,
    proseSkipped: proseSkips,
    levelSources,
  };
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
  /** Values that differed only below the wiki's own display precision, and were therefore not
   *  counted as disagreements. Reported so the clearing is visible rather than absorbed. */
  displayRoundedValues: number;
  /** Rows that would have been reported as disagreeing at 1e-6 and agree at the wiki's own
   *  display precision. The count the change is judged by. */
  rowsClearedByDisplayRounding: number;
  /** Rows whose base scales by champion level. The ability box prints those as one "(based on
   *  level)" figure, so this rendering cannot check them — they are neither checked nor
   *  matched, and are reported so the gap is visible. */
  levelScaledNotCompared: number;
}

function normaliseLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Compare every stored component against the values the wiki rendered for the same label.
 * A stored `linear` and a stored `explicit` must both reproduce the source exactly — this is
 * what makes it safe to let the harvester choose between them.
 */
export function roundTrip(
  draft: DraftAbility,
  rendered: RenderedRow[],
  opts: { precision?: 'display' | 'exact' } = {},
): RoundTripResult {
  // 'exact' is the old 1e-6 comparison, kept so the effect of comparing at the wiki's own
  // display precision can be MEASURED rather than asserted. Nothing calls it in normal use.
  const compare =
    opts.precision === 'exact'
      ? (e: number[], a: number[]) => ({ differences: compareExpansion(e, a, 1e-6), clearedByDisplayRounding: 0 })
      : compareAtDisplayPrecision;
  const key = `${draft.entry.champion}/${draft.entry.slot}/${draft.entry.abilityName}`;
  const byLabel = new Map(rendered.map((r) => [normaliseLabel(r.label), r]));
  const used = new Set<string>();
  const mismatches: RoundTripResult['mismatches'] = [];
  let checked = 0;
  let matched = 0;
  let displayRounded = 0;
  let rowsClearedByDisplayRounding = 0;
  let levelScaledNotCompared = 0;

  for (const c of draft.entry.components) {
    const label = normaliseLabel(c.label ?? c.id);
    const source = byLabel.get(label);
    if (!source) continue; // reported via unmatchedRows from the other direction
    used.add(label);
    checked += 1;

    if (isLevelScaled(c.base)) {
      // The rendered box prints a level-scaled value as a single figure with "(based on
      // level)", not a per-rank series, so there is nothing to line up rank by rank.
      //
      // THIS ROW IS NOT EVIDENCE, AND USED TO BE COUNTED AS THOUGH IT WERE. It was previously
      // added to `matched`, so a row nothing had compared raised the pass count — and an entry
      // whose every row is level-scaled could reach gate 6 with a clean round-trip record
      // behind which no comparison had happened. It is now counted separately and excluded
      // from `checkedRows`, so an entry backed only by these rows has no round-trip evidence
      // at all, which is the truth.
      //
      // These values CAN be checked, just not from this rendering: `renderLevelBlocks` reads
      // the wiki's own full per-level expansion out of the block's `data-bot-values`. Wiring
      // that in here needs the network, which this function does not have.
      levelScaledNotCompared += 1;
      checked -= 1;
      continue;
    }
    const roundedBefore = displayRounded;
    const actual = expandByRank(c.base, draft.entry.maxRank);
    const expected = source.values;
    // A payload row has no base on either side: the wiki reports an empty base series and we
    // store zeros. Comparing them is meaningless, so compare only the ratios below.
    const baseCmp =
      expected.length === 0
        ? { differences: [], clearedByDisplayRounding: 0 }
        : compare(expected, actual);
    const diff = baseCmp.differences;
    displayRounded += baseCmp.clearedByDisplayRounding;

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
      const cmp =
        sourceRatio.length === 1
          ? compare(mine.map(() => sourceRatio[0]!), mine)
          : compare(sourceRatio, mine);
      const d = cmp.differences;
      displayRounded += cmp.clearedByDisplayRounding;
      if (d.length > 0) {
        ratioDiffs.push(
          `ratio ${i} (${r.stat}): ` +
            d.map((x) => `rank ${x.index + 1}: wiki ${x.expected}, stored ${x.actual}`).join('; '),
        );
      }
    }

    if (diff.length === 0 && ratioDiffs.length === 0) {
      matched += 1;
      if (displayRounded > roundedBefore) rowsClearedByDisplayRounding += 1;
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

  return {
    entry: key,
    checkedRows: checked,
    matchedRows: matched,
    mismatches,
    unmatchedRows,
    displayRoundedValues: displayRounded,
    rowsClearedByDisplayRounding,
    levelScaledNotCompared,
  };
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

export { renderAbility, renderAbilityDetail, renderLevelBlocks };

// ---------------------------------------------------------------------------
// Gate 2 for level-scaled values — the half the ability box cannot check
// ---------------------------------------------------------------------------

export interface LevelRoundTripResult {
  entry: string;
  /** Components compared against the wiki's own expansion of their source block. */
  checked: number;
  matched: number;
  /** Components whose block the wiki would not expand, so there is no evidence either way.
   *  NOT counted as a pass. */
  unrenderable: number;
  mismatches: Array<{ componentId: string; expected: number[]; actual: number[]; detail: string }>;
}

/**
 * Compare every level-scaled component against the wiki's own per-level expansion.
 *
 * WHY THIS EXISTS. `roundTrip` reads the rendered ability box, which prints a level-scaled value
 * as a single "(based on level)" figure — there is no per-rank series to line up. Those rows
 * were previously added to the pass count anyway, so a row nothing had compared raised the
 * number of rows that agreed. They are now excluded there and checked here instead.
 *
 * The evidence is the `data-bot-values` attribute the wiki attaches to a rendered progression:
 * the complete series, semicolon separated, produced by the wiki's own Lua from the same block
 * our parser read. `series` is what `renderLevelBlocks` returned for each source, in order, with
 * null for a block the wiki would not expand.
 *
 * The wiki's series can be LONGER than ours, in two documented ways, and neither is a
 * disagreement: a piecewise progression generates values for levels 19 and 20 that the module
 * itself does not display, and `{{pplevel}}` sets `tooltipSize = 41` so its series runs on past
 * level 18 at the same slope. Our values are compared against the leading values of theirs.
 */
export function roundTripLevelScaled(
  draft: DraftAbility,
  series: Array<number[] | null>,
): LevelRoundTripResult {
  const key = `${draft.entry.champion}/${draft.entry.slot}/${draft.entry.abilityName}`;
  const byId = new Map(draft.entry.components.map((c) => [c.id, c]));
  const result: LevelRoundTripResult = { entry: key, checked: 0, matched: 0, unrenderable: 0, mismatches: [] };

  for (const [i, src] of draft.levelSources.entries()) {
    const component = byId.get(src.componentId);
    if (!component || !isLevelScaled(component.base)) continue;
    const wiki = series[i];
    if (!wiki || wiki.length === 0) {
      result.unrenderable += 1;
      continue;
    }
    const ours = levelBreakpoints(component.base).map((b) => b.value);
    if (wiki.length < ours.length) {
      result.unrenderable += 1;
      continue;
    }
    result.checked += 1;
    const differences = ours
      .map((v, k) => ({ index: k, expected: wiki[k]!, actual: v }))
      .filter((d) => !agreesAtDisplayPrecision(d.expected, d.actual));
    if (differences.length === 0) {
      result.matched += 1;
      continue;
    }
    result.mismatches.push({
      componentId: src.componentId,
      expected: wiki.slice(0, ours.length),
      actual: ours,
      detail: differences
        .slice(0, 4)
        .map((d) => `level ${d.index + 1}: wiki ${d.expected}, stored ${d.actual}`)
        .join('; '),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Gate 2 for a value stated in prose — the third and last round-trip
// ---------------------------------------------------------------------------

export interface ProseRoundTripResult {
  entry: string;
  checked: number;
  matched: number;
  /** Components whose expected figures could not be located at all — no evidence, not a pass. */
  notFound: number;
  mismatches: Array<{ componentId: string; expected: number[]; detail: string }>;
}

/**
 * Every figure a component asserts, in the order the wiki would print them.
 *
 * ENDPOINTS, NOT EVERY STEP, and that is a property of this rendering rather than a concession.
 * The description prints a value that varies as a RANGE — "26 – 196 (based on level)",
 * "70 / 85 / … / 160" — and for a long series it prints only the two ends. A flat ratio it
 * prints once, not once per rank. Demanding all eighteen values of a level series therefore
 * fails on every ability that has one, which is what a first cut of this check did on 34 of 56
 * components before the expectation was corrected to what the wiki actually publishes.
 *
 * The consequence is stated rather than hidden: this round-trip pins the ENDS of each series.
 * The middle steps are checked by `roundTripLevelScaled`, against the wiki's full expansion,
 * wherever the component has a progression block to re-render.
 */
export function expectedFigures(c: AbilityComponent, maxRank: number): number[] {
  const out: number[] = [];
  // A LEVEL-SCALED SERIES CONTRIBUTES ITS FIRST VALUE ONLY, and the reason is the documented
  // trap of DATA-SOURCES §13. The description summarises such a value as "20 – 184 (based on
  // level)", and 184 is the LEVEL-20 figure: the module generates past eighteen and prints the
  // generated end. We correctly store the level-18 value, 160, so demanding the printed upper
  // end would fail on every over-generating ability — it failed on ten before this was pinned
  // down — and "fixing" it by storing 184 would import the extrapolation the project refuses.
  // The upper end of those series is checked properly by `roundTripLevelScaled` instead.
  const ends = (s: Scaling): number[] => {
    if (isLevelScaled(s)) return [levelBreakpoints(s)[0]!.value];
    const v = expandByRank(s, maxRank);
    const first = v[0]!;
    const last = v[v.length - 1]!;
    return first === last ? [first] : [first, last];
  };
  // A payload row stores a base of all zeros; the wiki prints no base for it, so asserting one
  // would fail every time. Only a base that is actually a number is expected in the text.
  const base = isLevelScaled(c.base)
    ? levelBreakpoints(c.base).map((b) => b.value)
    : expandByRank(c.base, maxRank);
  if (base.some((v) => v !== 0)) out.push(...ends(c.base));
  void base;
  for (const r of c.ratios) {
    out.push(...ends(r));
    for (const m of r.multipliers ?? []) out.push(...ends(m.per100));
  }
  return out;
}

/**
 * Compare a prose-derived component against the wiki's own rendering of the same sentence.
 *
 * The check is an ORDERED SUBSEQUENCE match: every figure the component asserts — the ends of
 * each of its series, see `expectedFigures` — must appear in the rendered description, in the
 * order it asserts them. Order is what makes it meaningful —
 * a bare "does this number appear anywhere" test would pass on a coincidence, and these
 * sentences are full of numbers (cooldowns, durations, ranges).
 *
 * It is deliberately weaker than the other two round-trips and must not be read as their equal.
 * It confirms that the figures we stored are the figures the wiki prints for that ability, in
 * that order. It does NOT confirm that we attached them to the right stat, or that we did not
 * miss a term the wiki also printed. A pass here is evidence, not proof.
 */
export function roundTripProse(
  draft: DraftAbility,
  prose: string,
  componentIds: string[],
): ProseRoundTripResult {
  const key = `${draft.entry.champion}/${draft.entry.slot}/${draft.entry.abilityName}`;
  const result: ProseRoundTripResult = { entry: key, checked: 0, matched: 0, notFound: 0, mismatches: [] };
  // The renderer writes "7.5" as "7. 5" in places and separates a series with "/". Reduce the
  // text to the ordered list of numbers it contains, and match against that.
  const printed = [...prose.replace(/(\d)\.\s+(\d)/g, '$1.$2').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
    Number(m[0]),
  );

  for (const id of componentIds) {
    const c = draft.entry.components.find((x) => x.id === id);
    if (!c) continue;
    let expected: number[];
    try {
      expected = expectedFigures(c, draft.entry.maxRank);
    } catch {
      result.notFound += 1;
      continue;
    }
    if (expected.length === 0) {
      result.notFound += 1;
      continue;
    }
    result.checked += 1;
    let at = 0;
    const missing: number[] = [];
    for (const want of expected) {
      const found = printed.findIndex((v, i) => i >= at && agreesAtDisplayPrecision(v, want));
      if (found < 0) missing.push(want);
      else at = found + 1;
    }
    if (missing.length === 0) {
      result.matched += 1;
    } else {
      result.mismatches.push({
        componentId: id,
        expected,
        detail: `the rendered description does not print ${missing
          .slice(0, 4)
          .join(', ')} in the order this component asserts them`,
      });
    }
  }
  return result;
}

/** The wiki's summary-row label, shared with the classifier's own filter. */
const DERIVED_ROW_LABEL = /^total\b/i;

/** A total that covers non-champion targets, which we deliberately never store. */
const NON_CHAMPION_TOTAL = /\b(minion|monster|non-champion|epic|turret|ward|structure)s?\b/i;

/**
 * How many times a repeating component lands, derived from the total the wiki also prints.
 *
 * Returns undefined unless the quotient is the same whole number at every rank and at least two —
 * a per-tick figure is a rounded display value, so the quotient is compared at the wiki's own
 * display precision rather than exactly. Undefined means "not derivable", never "assume one".
 */
export function impliedHits(
  total: AbilityComponent | undefined,
  perHit: AbilityComponent,
  maxRank: number,
): number | undefined {
  if (!total || isLevelScaled(total.base) || isLevelScaled(perHit.base)) return undefined;
  let totals: number[];
  let each: number[];
  try {
    totals = expandByRank(total.base, maxRank);
    each = expandByRank(perHit.base, maxRank);
  } catch {
    return undefined;
  }
  const counts = totals.map((t, i) => (each[i] === 0 ? Number.NaN : t / each[i]!));
  const first = Math.round(counts[0]!);
  if (!Number.isFinite(first) || first < 2) return undefined;
  // Every rank must imply the same count, within the rounding the wiki's own per-tick display
  // introduces. 75/10.71 is 7.003, not 7 — the tolerance is what makes that readable.
  const ok = counts.every((n) => Number.isFinite(n) && Math.abs(n - first) < 0.02);
  return ok ? first : undefined;
}
