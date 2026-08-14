// THE DETERMINISTIC DIFF (SPECIFICATION §9).
//
//   "The process retrieves current wiki data modules and Data Dragon files, then performs a
//    deterministic diff against the previously stored version. This step uses no language
//    model — structured data comparison is exact and requires none."
//
// So: no fuzzy matching, no similarity scoring, no judgement. Two snapshots in, one exact list
// of differences out. The same two inputs always produce the same output in the same order,
// which is what makes the result reviewable in a pull request rather than merely plausible.
//
// WHAT COUNTS AS THE SAME ENTITY. Identity is the stable key, never the display name:
// a champion is its `apiname`, an item is its numeric id, a rune is its numeric id. A renamed
// champion is therefore ONE `name` change, not a removal plus an addition — which matters,
// because a removal plus an addition would read as a roster loss and could halt the update.
//
// FLOATING POINT. Values are compared with `Object.is` after a fixed rounding to 6 decimal
// places. Data Dragon serves 0.25 - 0.05 style arithmetic results in places (0.19999999999999998
// appears in real item data), and reporting that as a change every run would bury real changes
// in noise. 6 places is far finer than any game value this project stores.
//
// Pure — no network, no filesystem. Tested by diff.test.ts.

import type { AbilitySlot } from '../../src/types/data.ts';
import type { Snapshot, SnapshotChampion, SnapshotItem, SnapshotRune } from './snapshot.ts';

export type EntityKind = 'champion' | 'item' | 'rune';

export interface EntityChange {
  kind: EntityKind;
  /** Stable key: apiname for a champion, id as a string for an item or rune. */
  entityId: string;
  /** Human-readable label used in every message, e.g. "Aatrox" or "Redemption (3107)". */
  subject: string;
}

export interface FieldChange extends EntityChange {
  field: string;
  before: number | string | null;
  after: number | string | null;
}

export interface SnapshotDiff {
  patch: { before: string; after: string; changed: boolean };
  added: EntityChange[];
  removed: EntityChange[];
  changed: FieldChange[];
  counts: {
    added: number;
    removed: number;
    changedFields: number;
    /** Distinct entities carrying at least one field change. */
    changedEntities: number;
  };
}

const COMPARISON_DECIMALS = 6;

function normaliseNumber(value: number): number {
  const factor = 10 ** COMPARISON_DECIMALS;
  return Math.round(value * factor) / factor;
}

function same(a: number | string | null, b: number | string | null): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(normaliseNumber(a), normaliseNumber(b));
  }
  return a === b;
}

/** Flatten one champion into comparable `field -> value` pairs. */
export function flattenChampion(champion: SnapshotChampion): Map<string, number | string | null> {
  const out = new Map<string, number | string | null>();
  out.set('name', champion.name);
  out.set('id', champion.id);
  out.set('resource', champion.resource);
  for (const [key, value] of Object.entries(champion.stats)) {
    out.set(`stats.${key}`, value as number | string);
  }
  const slots: AbilitySlot[] = ['P', 'Q', 'W', 'E', 'R'];
  for (const slot of slots) {
    const names = champion.abilityNames[slot];
    out.set(`abilityNames.${slot}`, names ? names.join(' | ') : null);
    const rank = champion.abilityMaxRanks[slot];
    out.set(`abilityMaxRanks.${slot}`, rank ?? null);
  }
  return out;
}

export function flattenItem(item: SnapshotItem): Map<string, number | string | null> {
  const out = new Map<string, number | string | null>();
  out.set('name', item.name);
  out.set('goldTotal', item.goldTotal);
  out.set('purchasable', String(item.purchasable));
  for (const [key, value] of Object.entries(item.stats)) out.set(`stats.${key}`, value);
  return out;
}

export function flattenRune(rune: SnapshotRune): Map<string, number | string | null> {
  const out = new Map<string, number | string | null>();
  out.set('key', rune.key);
  out.set('name', rune.name);
  out.set('tree', rune.tree);
  out.set('slot', rune.slot);
  return out;
}

interface Indexed<T> {
  kind: EntityKind;
  byId: Map<string, T>;
  subject: (entity: T) => string;
  flatten: (entity: T) => Map<string, number | string | null>;
}

function index<T>(
  kind: EntityKind,
  entities: T[],
  id: (entity: T) => string,
  subject: (entity: T) => string,
  flatten: (entity: T) => Map<string, number | string | null>,
): Indexed<T> {
  const byId = new Map<string, T>();
  for (const entity of entities) byId.set(id(entity), entity);
  return { kind, byId, subject, flatten };
}

function diffOne<T>(
  indexed: Indexed<T>,
  previous: Indexed<T>,
  added: EntityChange[],
  removed: EntityChange[],
  changed: FieldChange[],
): void {
  for (const [entityId, entity] of indexed.byId) {
    if (!previous.byId.has(entityId)) {
      added.push({ kind: indexed.kind, entityId, subject: indexed.subject(entity) });
      continue;
    }
    const before = indexed.flatten(previous.byId.get(entityId)!);
    const after = indexed.flatten(entity);
    const fields = new Set([...before.keys(), ...after.keys()]);
    for (const field of [...fields].sort()) {
      const b = before.get(field) ?? null;
      const a = after.get(field) ?? null;
      if (same(b, a)) continue;
      changed.push({
        kind: indexed.kind,
        entityId,
        subject: indexed.subject(entity),
        field,
        before: b,
        after: a,
      });
    }
  }
  for (const [entityId, entity] of previous.byId) {
    if (!indexed.byId.has(entityId)) {
      removed.push({ kind: indexed.kind, entityId, subject: previous.subject(entity) });
    }
  }
}

/**
 * Compare two snapshots exactly. Deterministic: entities are visited in sorted key order and
 * every entity's fields in sorted field order, so the output of two identical runs is
 * byte-identical.
 */
export function diffSnapshots(previous: Snapshot, candidate: Snapshot): SnapshotDiff {
  const added: EntityChange[] = [];
  const removed: EntityChange[] = [];
  const changed: FieldChange[] = [];

  const itemSubject = (item: SnapshotItem): string => `${item.name} (${item.id})`;
  const runeSubject = (rune: SnapshotRune): string => `${rune.name} (${rune.id})`;

  diffOne(
    index('champion', candidate.champions, (c) => c.apiname, (c) => c.apiname, flattenChampion),
    index('champion', previous.champions, (c) => c.apiname, (c) => c.apiname, flattenChampion),
    added,
    removed,
    changed,
  );
  diffOne(
    index('item', candidate.items, (i) => String(i.id), itemSubject, flattenItem),
    index('item', previous.items, (i) => String(i.id), itemSubject, flattenItem),
    added,
    removed,
    changed,
  );
  diffOne(
    index('rune', candidate.runes, (r) => String(r.id), runeSubject, flattenRune),
    index('rune', previous.runes, (r) => String(r.id), runeSubject, flattenRune),
    added,
    removed,
    changed,
  );

  const order = (a: EntityChange, b: EntityChange): number =>
    a.kind.localeCompare(b.kind) || a.entityId.localeCompare(b.entityId, 'en');
  added.sort(order);
  removed.sort(order);
  changed.sort((a, b) => order(a, b) || a.field.localeCompare(b.field));

  return {
    patch: {
      before: previous.patch,
      after: candidate.patch,
      changed: previous.patch !== candidate.patch,
    },
    added,
    removed,
    changed,
    counts: {
      added: added.length,
      removed: removed.length,
      changedFields: changed.length,
      changedEntities: new Set(changed.map((c) => `${c.kind}:${c.entityId}`)).size,
    },
  };
}
