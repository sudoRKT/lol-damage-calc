// @vitest-environment jsdom
//
// THE PAGE, END TO END — the published data files, the real engine, the real components.
//
// Nothing here is mocked except the network, and the network is not mocked so much as redirected:
// `fetchPublished` reads the same `public/data/**` files the browser downloads. So a test that
// passes here is a statement about what a user sees, not about what a fixture makes possible.
//
// WHAT IT ASSERTS, IN ONE LINE EACH:
//   • a user opening the page gets a real damage figure, from real champion data;
//   • a scenario the engine REFUSES shows the refusal and no total anywhere;
//   • an ability that cannot be modelled is named on screen with its reason, and contributes 0;
//   • the patch sits beside the result;
//   • a contested base statistic is declared, naming the field and both values;
//   • adding an item changes the number, which is the whole loop the page exists to close.
//
// QUERIES GO THROUGH THE ACCESSIBILITY TREE, never through markup. A test that walks the DOM for
// a span containing "P" passes against a component that shows the letter and announces nothing.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import type { ChampionConfig, ComboStep } from '../../types';
import { App, startingConfig } from './App';
import { fetchPublished } from '../data/published-files';

afterEach(cleanup);

/** Mount the page and wait for the published data to arrive. */
async function open(props: Parameters<typeof App>[0] = {}) {
  render(<App fetchImpl={fetchPublished} {...props} />);
  await waitFor(() => expect(screen.queryByText(/Loading the champion roster/)).toBeNull());
}

const LUX_COMBO: ComboStep[] = [
  { id: 'q1', kind: 'ability', ref: 'Q' },
  { id: 'e1', kind: 'ability', ref: 'E' },
  { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
  { id: 'r1', kind: 'ability', ref: 'R' },
];

function config(apiname: string, over: Partial<ChampionConfig> = {}): ChampionConfig {
  return { ...startingConfig(apiname), ...over };
}

describe('app/a user opens the page and sees a real number', () => {
  it('names the matchup, and the two champions are the ones configured', async () => {
    await open();
    expect(screen.getByRole('heading', { name: /Lux\s+vs\s+Garen/ })).toBeTruthy();
  });

  it('shows a burst total above zero, computed from the real roster', async () => {
    await open({ initialCombo: LUX_COMBO });
    // Found by what assistive technology HEARS — the aggregate announces itself as
    // "Burst total: 431 total damage — 331 magic, 100 physical" — never by a class name.
    const spoken = await screen.findByText(/^Burst total: \d+ total damage/);
    const figure = Number(/Burst total: (\d+)/.exec(spoken.textContent ?? '')![1]);
    expect(figure).toBeGreaterThan(0);
  });

  it('renders the per-instance breakdown, one row per combo step', async () => {
    await open({ initialCombo: LUX_COMBO });
    const table = await screen.findByRole('table', { name: /Each instance of the combo in order/i });
    // One header row plus one row per step.
    expect(within(table).getAllByRole('row').length).toBeGreaterThanOrEqual(LUX_COMBO.length + 1);
  });

  it('renders the HP burndown and both survival verdicts', async () => {
    await open();
    expect(await screen.findByRole('table', { name: /survival verdict, given twice/i })).toBeTruthy();
  });

  it('renders both resolved stat blocks', async () => {
    await open();
    expect(await screen.findByRole('region', { name: /Attacker stat block — Lux/i })).toBeTruthy();
    expect(await screen.findByRole('region', { name: /Defender stat block — Garen/i })).toBeTruthy();
  });
});

describe('app/the patch sits beside the result (SPECIFICATION §8)', () => {
  it('prints the patch in the result header, not in a footer', async () => {
    await open();
    const heads = await screen.findAllByText(/^Patch 16\.\d+\.\d+$/);
    expect(heads.length).toBeGreaterThan(0);
  });

  it('the patch shown is the one the data was fetched at, not a constant in this area', async () => {
    await open();
    const { patch } = (await (await fetchPublished('/data/manifest.json')).json()) as {
      patch: string;
    };
    expect(screen.getAllByText(`Patch ${patch}`).length).toBeGreaterThan(0);
  });
});

describe('app/a refusal never looks like a small number', () => {
  it('shows the named refusal and NO total when an item id does not exist', async () => {
    await open({ initialAttacker: config('Lux', { items: [999999] }) });
    const refusal = await screen.findByRole('region', { name: /This scenario was refused/i });
    expect(within(refusal).getByText(/no item with id 999999/)).toBeTruthy();
    // The proof that this is a refusal and not a small number: no result region at all.
    expect(screen.queryByRole('table', { name: /Each instance of the combo/i })).toBeNull();
    expect(screen.queryByText(/Burst total/i)).toBeNull();
  });

  it('names WHERE in the scenario the refusal came from', async () => {
    await open({ initialDefender: config('Garen', { items: [999999] }) });
    const refusal = await screen.findByRole('region', { name: /This scenario was refused/i });
    expect(within(refusal).getByText('Garen.items[0]')).toBeTruthy();
  });

  it('an empty combo calculates nothing and says so', async () => {
    await open({ initialCombo: [] });
    expect(await screen.findByText(/The combo is empty/)).toBeTruthy();
    expect(screen.queryByText(/Burst total/i)).toBeNull();
  });
});

describe('app/an unmodellable ability is named, never quietly dropped', () => {
  it('lists the ability and its reason, and the ability contributes no damage', async () => {
    // Ahri Q is recorded `incomplete` in the published data. A user running it must see the
    // ability named and told why, beside a total that excludes it.
    await open({
      initialAttacker: config('Ahri'),
      initialCombo: [
        { id: 'q1', kind: 'ability', ref: 'Q' },
        { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
      ],
    });
    // NAMED EXACTLY SINCE 2026-08-15, when the two sweep curves were mounted. Each curve renders
    // its own "Excluded from these totals" region, qualified with its chart title, so a loose
    // pattern now matches three regions and the assertion below would be testing whichever came
    // first. The breakdown's is the one this test is about, and it is the unqualified one.
    // A string name in `findByRole` is already an exact match; the pattern here was a regex.
    const excluded = await screen.findByRole('region', { name: 'Excluded from these totals' });
    // TWO matches since 2026-08-14, and that is the change rather than a looser assertion: the
    // ability is now named in VISIBLE text as well as inside the mark's spoken sentence. It used
    // to be spoken only, so a sighted reader saw a column of identical "Not yet modelled" marks
    // with no way to tell which ability had been excluded. See primitives/ExcludedAbility.tsx.
    expect(within(excluded).getAllByText(/Orb of Deception/).length).toBe(2);
    // The VISIBLE one specifically — the half that was missing.
    expect(within(excluded).getByText('Q — Orb of Deception').className).toContain(
      'excluded__label',
    );
    // And the reason is on screen too, not only announced.
    expect(excluded.querySelector('.excluded__why')?.textContent?.length ?? 0).toBeGreaterThan(0);
    // The status mark still carries the REASON in its accessible name, not a generic caution.
    const marks = within(excluded).getAllByText(/Not yet modelled|Cannot be completed/);
    expect(marks.length).toBeGreaterThan(0);
  });
});

describe('app/a contested base statistic is declared (SPECIFICATION §8)', () => {
  it('names the champion, the field, and BOTH observed values', async () => {
    await open({ initialAttacker: config('Jhin') });
    const notice = await screen.findByRole('region', { name: /Contested base statistics/i });
    expect(within(notice).getByText(/Jhin — as_lvl/)).toBeTruthy();
    expect(within(notice).getByText(/the wiki states 3 and Data Dragon states 0/)).toBeTruthy();
  });

  it('says nothing at all for two champions with no disputed statistic', async () => {
    await open();
    expect(screen.queryByRole('region', { name: /Contested base statistics/i })).toBeNull();
  });
});

describe('app/the loop a user actually runs', () => {
  it('adding an item raises the attacker’s ability power in the resolved stat block', async () => {
    await open();
    const before = await screen.findByRole('region', { name: /Attacker stat block/i });
    // The TEXT is captured, not the node: the node is live, so re-reading it after the click
    // would compare the new value with itself and pass no matter what happened.
    const apBefore = within(before).getByRole('row', { name: /^Ability power/ }).textContent;
    expect(apBefore).toContain('0');

    // Find the real add control by the words a screen reader hears, then click it.
    const search = screen.getByRole('searchbox', { name: /Search attacker items/i });
    fireEvent.change(search, { target: { value: "Rabadon's Deathcap" } });
    const add = await screen.findByRole('button', { name: /^Add Rabadon’s Deathcap|^Add Rabadon's Deathcap/ });
    fireEvent.click(add);

    await waitFor(() => {
      const after = screen.getByRole('region', { name: /Attacker stat block/i });
      const apRow = within(after).getByRole('row', { name: /^Ability power/ });
      expect(apRow.textContent).not.toBe(apBefore);
      expect(apRow.textContent).toContain('130');
    });
  });

  it('changing the attacker’s level changes the result', async () => {
    await open();
    const level = screen.getByRole('spinbutton', { name: 'Attacker level' });
    const before = document.body.textContent ?? '';
    fireEvent.change(level, { target: { value: '18' } });
    await waitFor(() => {
      expect(document.body.textContent).not.toBe(before);
    });
  });

  it('the combo builder offers the attacker’s real abilities, by name', async () => {
    await open();
    expect(await screen.findByRole('button', { name: /Add Q — Light Binding/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Basic attack$/ })).toBeTruthy();
  });
});
