// Known-answer tests for the deterministic diff (SPECIFICATION §9).
//
// The property that matters is not "it finds changes" — it is that it finds EXACTLY the changes
// and nothing else, in a fixed order, every time. A diff that reports a spurious change buries
// the real one; a diff that misses one lets it through.

import { describe, expect, it } from 'vitest';

import { diffSnapshots } from './diff.ts';
import { aatrox, ashe, clone, infinityEdge, makeSnapshot, redemption } from './snapshot-fixtures.ts';

describe('diff: identical snapshots', () => {
  it('reports nothing at all when the two snapshots are identical', () => {
    const snapshot = makeSnapshot();
    const diff = diffSnapshots(snapshot, clone(snapshot));
    expect(diff.counts).toEqual({ added: 0, removed: 0, changedFields: 0, changedEntities: 0 });
    expect(diff.patch.changed).toBe(false);
  });

  it('ignores floating-point noise below 6 decimal places', () => {
    // Data Dragon really serves values like 0.19999999999999998 for 0.25 - 0.05.
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.stats.as_base = 0.651 + 1e-12;
    expect(diffSnapshots(before, after).counts.changedFields).toBe(0);
  });

  it('does NOT ignore a real change of 0.001', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.stats.as_base = 0.652;
    expect(diffSnapshots(before, after).counts.changedFields).toBe(1);
  });
});

describe('diff: one field moves', () => {
  it('reports exactly one change, naming the field and both values', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[1]!.stats.mr_base = 33; // the real 16.16 marksman change

    const diff = diffSnapshots(before, after);
    expect(diff.counts.changedFields).toBe(1);
    expect(diff.changed[0]).toMatchObject({
      kind: 'champion',
      entityId: 'Ashe',
      field: 'stats.mr_base',
      before: 30,
      after: 33,
    });
  });

  it('reports an item gold change with both prices', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.items[0]!.goldTotal = 2500;

    const diff = diffSnapshots(before, after);
    expect(diff.counts.changedFields).toBe(1);
    expect(diff.changed[0]).toMatchObject({ field: 'goldTotal', before: 2300, after: 2500 });
    expect(diff.changed[0]!.subject).toBe('Redemption (3107)');
  });

  it('reports an ability list change as one field, not as five', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.abilityNames.Q = ['Some Other Blade'];

    const diff = diffSnapshots(before, after);
    expect(diff.counts.changedFields).toBe(1);
    expect(diff.changed[0]!.field).toBe('abilityNames.Q');
    expect(diff.changed[0]!.before).toBe('The Darkin Blade | The Darkin Blade 2 | The Darkin Blade 3');
    expect(diff.changed[0]!.after).toBe('Some Other Blade');
  });
});

describe('diff: entities appear and disappear', () => {
  it('reports an added champion as an addition, not as a field change', () => {
    const before = makeSnapshot({ champions: [aatrox()] });
    const after = makeSnapshot({ champions: [aatrox(), ashe()] });
    const diff = diffSnapshots(before, after);
    expect(diff.counts).toMatchObject({ added: 1, removed: 0, changedFields: 0 });
    expect(diff.added[0]).toMatchObject({ kind: 'champion', entityId: 'Ashe' });
  });

  it('reports a removed item as a removal', () => {
    const before = makeSnapshot();
    const after = makeSnapshot({ items: [infinityEdge()] });
    const diff = diffSnapshots(before, after);
    expect(diff.counts).toMatchObject({ added: 0, removed: 1 });
    expect(diff.removed[0]).toMatchObject({ kind: 'item', entityId: '3107' });
  });

  it('treats a RENAMED champion as one name change, never as a removal plus an addition', () => {
    // This is load-bearing: a removal plus an addition would count against the roster-loss
    // bound and could halt an update over a rename.
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.name = 'Aatrox the Darkin Blade';

    const diff = diffSnapshots(before, after);
    expect(diff.counts).toMatchObject({ added: 0, removed: 0, changedFields: 1 });
    expect(diff.changed[0]!.field).toBe('name');
  });
});

describe('diff: determinism', () => {
  it('produces byte-identical output for the same inputs, twice', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.champions[0]!.stats.hp_base = 660;
    after.items[1]!.goldTotal = 3400;
    after.champions[1]!.stats.mr_lvl = 1.1;

    const first = JSON.stringify(diffSnapshots(before, after));
    const second = JSON.stringify(diffSnapshots(before, after));
    expect(first).toBe(second);
  });

  it('is unaffected by the order entities arrive in', () => {
    const before = makeSnapshot();
    const shuffled = makeSnapshot({
      champions: [ashe(), aatrox()],
      items: [infinityEdge(), redemption()],
    });
    expect(diffSnapshots(before, shuffled).counts.changedFields).toBe(0);
  });

  it('sorts changes by kind, then entity, then field', () => {
    const before = makeSnapshot();
    const after = clone(before);
    after.items[0]!.goldTotal = 2400;
    after.champions[1]!.stats.hp_base = 650;
    after.champions[0]!.stats.hp_base = 660;

    const diff = diffSnapshots(before, after);
    expect(diff.changed.map((c) => `${c.kind}:${c.entityId}:${c.field}`)).toEqual([
      'champion:Aatrox:stats.hp_base',
      'champion:Ashe:stats.hp_base',
      'item:3107:goldTotal',
    ]);
  });
});
