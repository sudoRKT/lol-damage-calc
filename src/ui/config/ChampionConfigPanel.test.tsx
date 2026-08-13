// @vitest-environment jsdom
//
// One combatant's configuration panel, against the real roster.
//
// The two claims worth testing here are both about honesty rather than about layout: an ability
// rank limit is READ from the roster and never inferred, and what the panel does not configure
// is stated on screen rather than left for a user to assume.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Champion, ChampionConfig } from '../../types';
import { MOCK_SCENARIO } from '../../types';
import { ChampionConfigPanel, NOT_YET_CONFIGURED } from './ChampionConfigPanel';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROSTER = JSON.parse(
  readFileSync(join(REPO, 'public/data/champions.json'), 'utf8'),
) as Champion[];

const AATROX = ROSTER.find((c) => c.apiname === 'Aatrox')!;
const KARMA = ROSTER.find((c) => c.apiname === 'Karma')!;
const CONFIG: ChampionConfig = MOCK_SCENARIO.attacker;

function mount(champion: Champion | null = AATROX, config: ChampionConfig = CONFIG) {
  const onChange = vi.fn();
  render(
    <ChampionConfigPanel
      role="Attacker"
      champions={ROSTER}
      champion={champion}
      config={config}
      onChange={onChange}
      patch="16.16.1"
    />,
  );
  return onChange;
}

describe('config/level and ranks', () => {
  it('level is a labelled numeric field bounded 1 to 18', () => {
    mount();
    const field = screen.getByRole('spinbutton', { name: 'Attacker level' }) as HTMLInputElement;
    expect(field.min).toBe('1');
    expect(field.max).toBe('18');
    expect(field.value).toBe('11');
  });

  it('typing a level reports the whole updated configuration', () => {
    const onChange = mount();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Attacker level' }), {
      target: { value: '13' },
    });
    expect(onChange.mock.calls[0]![0].level).toBe(13);
    expect(onChange.mock.calls[0]![0].apiname).toBe('Aatrox');
  });

  it('ability rank limits are READ from the roster, never inferred', () => {
    // Aatrox: Q/W/E to 5, R to 3 — the familiar shape …
    mount();
    expect((screen.getByRole('spinbutton', { name: 'Q rank' }) as HTMLInputElement).max).toBe('5');
    expect((screen.getByRole('spinbutton', { name: 'R rank' }) as HTMLInputElement).max).toBe('3');
  });

  it('… and a champion whose ultimate has FOUR ranks gets four', () => {
    // Karma is one of the 21 abilities the inferred rule gets wrong. This is the test that
    // fails if anybody replaces the roster lookup with "3 for R".
    expect(KARMA.abilityMaxRanks.R).toBe(4);
    mount(KARMA, { ...CONFIG, apiname: 'Karma' });
    expect((screen.getByRole('spinbutton', { name: 'R rank' }) as HTMLInputElement).max).toBe('4');
  });

  it('every numeric field is disabled, with a reason, before a champion is chosen', () => {
    mount(null);
    for (const slot of ['Q', 'W', 'E', 'R']) {
      const field = screen.getByRole('spinbutton', { name: `${slot} rank` }) as HTMLInputElement;
      expect(field.disabled).toBe(true);
    }
    expect(screen.getAllByText('choose a champion first').length).toBe(4);
  });
});

describe('config/what it does not do is on screen', () => {
  it('names items, runes and entry state as not yet configured', () => {
    mount();
    for (const item of NOT_YET_CONFIGURED) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });

  it('carries the champion picker over the full roster', () => {
    mount();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Attacker champion' }));
    expect(screen.getAllByRole('option')).toHaveLength(173);
  });

  it('choosing a champion changes the api name and leaves the level alone', () => {
    const onChange = mount();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Attacker champion' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Attacker champion' }), {
      target: { value: 'garen' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Attacker champion' }), {
      key: 'Enter',
    });
    const [config, champion] = onChange.mock.calls[0]!;
    expect(config.apiname).toBe('Garen');
    expect(config.level).toBe(11);
    expect(champion.name).toBe('Garen');
  });
});
