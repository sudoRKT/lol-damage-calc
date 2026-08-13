// @vitest-environment jsdom
//
// THE SWEEP — every state both primitives can be in, checked for a well-formed accessible
// name in one place.
//
// WHY IT EXISTS. Writing these components turned up a defect that no markup test could
// see: the accessibility tree builds a container's name by TRIMMING each descendant's text
// and then joining the pieces with nothing between them. Two components were assembling
// their names from several elements, and both announced their words run together —
// "Cannot be completed—the source does not record whose armor this reads" and
// "890 total damage570 physical damage200 magic damage". Both were fixed by building the
// sentence in a single text node.
//
// CLAUDE.md's standing instruction is that the work is not to fix the instance but to
// write the check that finds every other instance of it. This is that check.
//
// POPULATION, stated: every accessible name either primitive can produce, enumerated
// below — 3 damage types × 4 numeric sizes (12), plus 4 aggregate-total forms, plus the
// 5 verification states and 2 spoken-subject variants. 23 names. Each is asserted to be
// non-empty, to contain no run-together boundary, and never to be a bare tag letter.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AggregateTotal, DamageValue } from './DamageValue';
import { VerificationStatusMark } from './VerificationStatusMark';
import type { DamageType, VerificationStatus, Unresolvable } from '../../types';

afterEach(cleanup);

const ARMOR_FACT: Unresolvable = {
  field: 'components[0].ratios[0].owner (armor)',
  why: 'the source does not record whose armor this reads',
};

/** Every state the two primitives can be rendered in. */
function everyState(): Array<{ id: string; node: ReactNode }> {
  const out: Array<{ id: string; node: ReactNode }> = [];

  for (const t of ['physical', 'magic', 'true'] as DamageType[]) {
    for (const size of ['hero', 'l', 'm', 's'] as const) {
      out.push({
        id: `DamageValue ${t}/${size}`,
        node: <DamageValue value={2480} damageType={t} size={size} />,
      });
    }
  }

  out.push({
    id: 'AggregateTotal multi-type',
    node: <AggregateTotal total={890} byType={{ physical: 570, magic: 200, true: 120 }} />,
  });
  out.push({
    id: 'AggregateTotal multi-type with label',
    node: (
      <AggregateTotal
        total={890}
        byType={{ physical: 570, magic: 200, true: 120 }}
        label="Total"
      />
    ),
  });
  out.push({
    id: 'AggregateTotal two types',
    node: <AggregateTotal total={770} byType={{ physical: 570, magic: 200, true: 0 }} />,
  });
  out.push({
    id: 'AggregateTotal single type (falls back to a tagged value)',
    node: <AggregateTotal total={160} byType={{ physical: 0, magic: 160, true: 0 }} />,
  });

  const statuses: Array<[string, VerificationStatus, Unresolvable[] | undefined]> = [
    ['verified', 'verified', undefined],
    ['derived', 'derived', undefined],
    ['incomplete-pending', 'incomplete', undefined],
    ['incomplete-permanent', 'incomplete', [ARMOR_FACT]],
    ['no-damage', 'no-damage', undefined],
  ];
  for (const [id, status, unresolvable] of statuses) {
    out.push({
      id: `VerificationStatusMark ${id}`,
      node: <VerificationStatusMark status={status} unresolvable={unresolvable} />,
    });
  }
  out.push({
    id: 'VerificationStatusMark with spoken subject',
    node: <VerificationStatusMark status="derived" spokenSubject="W — Infernal Chains" />,
  });
  out.push({
    id: 'VerificationStatusMark permanent with spoken subject',
    node: (
      <VerificationStatusMark
        status="incomplete"
        unresolvable={[ARMOR_FACT]}
        spokenSubject="Malphite W — Thunderclap"
      />
    ),
  });

  return out;
}

/**
 * Render one state into a table cell.
 *
 * Nothing here reads the accessible name into a string. Every assertion below ASKS THE
 * ACCESSIBILITY TREE whether a cell with a name matching some pattern exists, so the name
 * is always computed by Testing Library's own engine — the same one a `getByRole(…, {name})`
 * query uses — and never by anything written in this area.
 */
function mount(node: ReactNode) {
  render(
    <table>
      <tbody>
        <tr>
          <td>{node}</td>
        </tr>
      </tbody>
    </table>,
  );
}

describe('accessible-names/sweep', () => {
  const states = everyState();

  it('enumerates the whole population', () => {
    expect(states.length).toBe(23);
  });

  it('every state produces a non-empty accessible name', () => {
    const empty: string[] = [];
    for (const s of states) {
      cleanup();
      mount(s.node);
      if (screen.queryByRole('cell', { name: /\S/ }) === null) empty.push(s.id);
    }
    expect(empty).toEqual([]);
  });

  it('no accessible name runs a figure into the next word — the defect class, swept', () => {
    // A digit touching a letter, or an em dash touching anything, means two pieces of text
    // were joined with nothing between them. Asked of the accessibility tree: if a cell
    // whose NAME matches that pattern exists at all, the sweep fails and names the state.
    const runTogether = /\d[A-Za-z]|[A-Za-z]\d|\S—|—\S/;
    const offenders: string[] = [];
    for (const s of states) {
      cleanup();
      mount(s.node);
      const bad = screen.queryByRole('cell', { name: runTogether });
      if (bad !== null) offenders.push(s.id);
    }
    expect(offenders).toEqual([]);
  });

  it('no accessible name is a bare tag letter — the letter is never the only signal', () => {
    const offenders: string[] = [];
    for (const s of states) {
      cleanup();
      mount(s.node);
      if (screen.queryByRole('cell', { name: /^[\d\s.,]*[PMT]$/ }) !== null) {
        offenders.push(s.id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every damage figure announces one of the three words in full', () => {
    const offenders: string[] = [];
    for (const s of states.filter((x) => x.id.startsWith('DamageValue'))) {
      cleanup();
      mount(s.node);
      if (screen.queryByRole('cell', { name: /\b(physical|magic|true) damage\b/ }) === null) {
        offenders.push(s.id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('two spot-checks of the exact names, so the sweep is anchored to real strings', () => {
    cleanup();
    mount(<DamageValue value={2480} damageType="physical" />);
    expect(screen.getByRole('cell', { name: '2480 physical damage' })).toBeTruthy();

    cleanup();
    mount(
      <VerificationStatusMark
        status="incomplete"
        unresolvable={[ARMOR_FACT]}
        spokenSubject="Malphite W — Thunderclap"
      />,
    );
    expect(
      screen.getByRole('cell', {
        name: 'Malphite W — Thunderclap: Cannot be completed — the source does not record whose armor this reads',
      }),
    ).toBeTruthy();
  });
});
