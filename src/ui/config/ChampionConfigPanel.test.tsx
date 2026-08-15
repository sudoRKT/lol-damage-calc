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
import { CAPABILITY } from '../coverage';
import {
  ChampionConfigPanel,
  NOT_YET_CONFIGURED,
  SUPERSEDED_RUNE_ENTRY,
} from './ChampionConfigPanel';

afterEach(cleanup);

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROSTER = JSON.parse(
  readFileSync(join(REPO, 'public/data/champions.json'), 'utf8'),
) as Champion[];

const AATROX = ROSTER.find((c) => c.apiname === 'Aatrox')!;
const KARMA = ROSTER.find((c) => c.apiname === 'Karma')!;
const CONFIG: ChampionConfig = MOCK_SCENARIO.attacker;

function mount(
  champion: Champion | null = AATROX,
  config: ChampionConfig = CONFIG,
  notConfigured?: readonly string[],
) {
  const onChange = vi.fn();
  render(
    <ChampionConfigPanel
      role="Attacker"
      champions={ROSTER}
      champion={champion}
      config={config}
      onChange={onChange}
      patch="16.16.1"
      notConfigured={notConfigured}
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
  it('names everything in its not-configured list', () => {
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

/**
 * THE PANEL PROMISED A CONTROL THAT DOES NOT EXIST, AND THESE ARE THE CHECKS THAT STOP IT.
 *
 * Measured on the live calculator at 375×812 on 2026-08-15: the string "Runes — keystone, minor
 * runes and stat shards" appeared twice (once per combatant panel) under the eyebrow "NOT
 * CONFIGURED IN THIS PANEL YET", and there were zero rune controls anywhere on the page. The list
 * that carried it says of items, in the very next entry, that they "are configured below this
 * panel" — so "not in THIS panel" reads as "in another one", and there is no other one.
 *
 * Four checks, and none of them can pass by the panel merely staying silent.
 */
describe('config/runes are stated, never promised', () => {
  const runeSentence = () =>
    document.querySelector('.config__runes') as HTMLElement | null;

  it('states the rune counts, and takes both figures from capability.json', () => {
    mount();
    const p = runeSentence();
    expect(p).not.toBeNull();
    // Not a hand-typed number anywhere: the same committed file the landing page reads, so the
    // two pages cannot disagree about how many runes are modelled.
    expect(p!.textContent).toContain(
      `${CAPABILITY.runesModelled} of ${CAPABILITY.runesPublished} runes change a number.`,
    );
    // And it says what that means for the reader, not just the arithmetic.
    expect(p!.textContent).toContain('Read a total on this page as a total with almost no runes in it.');
  });

  it('the sentence is only true while no rune is modelled, so the count is pinned', () => {
    // If a rune ever gains a modelled effect this fails, and the sentence above must be rewritten
    // rather than silently starting to under-report. Landing.test.tsx pins the same figure for the
    // same reason.
    // THE PIN MOVED FROM 0 TO 1 ON 2026-08-15, when Scorch became the first rune the engine
    // applies. The point of pinning it was never that the number is zero — it was that the
    // SENTENCE and the number must move together, and this test is what made that happen: the
    // copy said "no rune changes a number" and would have printed "1 of 62" beside it.
    expect(CAPABILITY.runesModelled).toBe(1);
    expect(CAPABILITY.runesPublished).toBeGreaterThan(0);
  });

  it('MAKES NO CLAIM ABOUT WHERE RUNES ARE CHOSEN — only about what they do to a total', () => {
    // CHANGED 2026-08-15 with the rune picker, and the reason is the same one that produced this
    // whole sentence. It used to read "There is no rune control here yet, so a rune that does have
    // a modelled effect reaches a result only through a shared link." That was measured and true
    // when written, and it becomes FALSE the moment `RunePicker` is mounted — which is the lead's
    // change, in the lead's file, on the lead's timing.
    //
    // A sentence whose truth depends on another area's next commit is a sentence that goes stale
    // without anyone touching it, and four documents in this project went stale in one day by
    // exactly that mechanism. So the panel now states only what is true in both worlds: what a
    // rune does to a number. WHERE a rune page is chosen is not this panel's claim to make.
    mount();
    const text = runeSentence()!.textContent ?? '';
    expect(text).not.toMatch(/no rune control/i);
    expect(text).not.toMatch(/only through a shared link/i);
    expect(text).toContain('named as changing nothing rather than dropped');
  });

  it('refuses a caller’s rune list entry rather than printing a claim it knows is false', () => {
    mount(AATROX, CONFIG, [SUPERSEDED_RUNE_ENTRY, 'Entry state']);
    expect(screen.queryByText(SUPERSEDED_RUNE_ENTRY)).toBeNull();
    expect(screen.getByText('Entry state')).toBeTruthy();
    // The panel is not silent about runes — it replaced a weaker claim with a checked one.
    expect(runeSentence()!.textContent).toContain('runes change a number');
    // And it says it exactly once, so the two statements can never sit side by side.
    const note = document.querySelector('.config__note') as HTMLElement;
    expect(/rune/i.test(note.textContent ?? '')).toBe(false);
  });

  it('App.tsx names runes only by the exact string this panel refuses', () => {
    // src/ui/app/ is the lead's and this area may not write it, so the refusal is by exact
    // identity. A REWORDED entry would slip past the filter and put the contradiction back on
    // screen with nothing to catch it — this reads App.tsx as text and fails if that happens.
    const source = readFileSync(join(REPO, 'src/ui/app/App.tsx'), 'utf8');
    const block = /export const CONFIGURED_ELSEWHERE = \[([\s\S]*?)\];/.exec(source);
    expect(block).not.toBeNull();
    const entries = [...block![1]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((e) => /rune/i.test(e))).toEqual([SUPERSEDED_RUNE_ENTRY]);
  });
});

/**
 * THE FOOTNOTE ROW MUST BE ABLE TO WRAP, AND THIS IS A SOURCE CHECK BECAUSE JSDOM HAS NO LAYOUT.
 *
 * Stated plainly rather than dressed up: `getBoundingClientRect` returns zeros in this
 * environment, so nothing here measures anything. The measurement was taken in a real browser on
 * the live page and is recorded in `config.css` beside the rule — at 320px the footnote list was
 * 11px wide and the panel was 1,985px tall, of which 1,521px was two short sentences set roughly
 * one character per line.
 *
 * What this test CAN do is stop the one-token edit that reintroduces it. `flex: 1 1 0` on a
 * wrapping flex row means "shrink me to nothing rather than wrap", and it is the natural thing to
 * type. If this ever needs to change, re-measure in a browser first — do not delete the check.
 */
describe('config/the footnote row wraps instead of starving', () => {
  const CSS = readFileSync(join(REPO, 'src/ui/config/config.css'), 'utf8');
  const rule = () => /\.config__missing\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? '';

  it('.config__missing declares a non-zero flex basis', () => {
    const body = rule().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toBe('');
    const flex = /flex:\s*([^;]+);/.exec(body)?.[1]?.trim();
    expect(flex).toBeTruthy();
    // The failure mode, named: a zero basis always fits, so the row never wraps.
    expect(flex).not.toMatch(/\b0(px|rem)?\s*$/);
    expect(flex).toContain('var(--space-8)');
  });

  it('the row it sits in is still allowed to wrap at all', () => {
    const note = /\.config__note\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? '';
    expect(note).toMatch(/flex-wrap:\s*wrap/);
  });
});
