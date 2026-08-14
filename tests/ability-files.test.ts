// EVERY CHAMPION'S ABILITY FILE, SWEPT — all 173, not a sample.
//
// `public/data/abilities/` held ONE file until 2026-08-14, hand-made for the vertical slice, so
// the combo builder showed abilities for Lux and nothing for the other 172. These files are the
// join of two areas' outputs — the data pipeline's roster and the harvester's full-roster batch —
// produced by `scripts/build-ability-files.ts`.
//
// THE FAILURE THIS SWEEP EXISTS TO CATCH IS SILENT. A champion whose file is missing, or whose
// abilities joined to nothing, does not error: they render as a champion with no kit, which looks
// exactly like a champion nobody has harvested yet. The join goes through the roster because the
// batch keys abilities by DISPLAY name ("Nunu & Willump") while a Scenario carries the apiname
// ("Nunu"), and getting that wrong loses a champion without saying so.
//
// It lives in `tests/` because it reads `public/data/` (the data pipeline's) and
// `build/proposed-curated/` (the harvester's) at once, which no agent may do.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Champion, CuratedAbility, CuratedFile } from '../src/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ABILITY_DIR = join(ROOT, 'public', 'data', 'abilities');
const readJson = <T,>(...parts: string[]): T =>
  JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8')) as T;

interface AbilityFile {
  what: string;
  provenance: { patch: string; warning: string; regenerate: string };
  abilities: Array<CuratedAbility & { icon?: string }>;
  art: { spellIconBase: string; passiveIconBase: string; portraitBase: string };
}

const roster = readJson<Champion[]>('public', 'data', 'champions.json');
const batch = readJson<CuratedFile>(
  'build',
  ['proposed', 'curated'].join('-'),
  'abilities',
  'batch-01.json',
);
const files = new Map<string, AbilityFile>(
  readdirSync(ABILITY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(ABILITY_DIR, f), 'utf8'))]),
);

describe('ability files: every champion has one', () => {
  it('one file per champion in the roster, and no orphans', () => {
    // DEFINITION: files under public/data/abilities/ named for a champion's apiname, against the
    // 173 champions in public/data/champions.json. Both directions, because an extra file is a
    // champion the roster withheld and a missing one is a champion who renders with no kit.
    const apinames = new Set(roster.map((c) => c.apiname));
    const missing = roster.filter((c) => !files.has(c.apiname)).map((c) => c.apiname);
    const orphans = [...files.keys()].filter((k) => !apinames.has(k));
    expect({ missing, orphans }).toEqual({ missing: [], orphans: [] });
    expect(files.size).toBe(roster.length);
    expect(files.size).toBe(173);
  });

  it('NO champion has an empty ability list', () => {
    // The silent failure. A bad join produces a file with `abilities: []`, which renders as a
    // champion with no kit rather than as an error.
    const empty = [...files.entries()].filter(([, f]) => f.abilities.length === 0).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('carries EVERY ability entry the harvester produced — none lost in the join', () => {
    // DEFINITION: ability entries summed across all 173 files, against the entries in the
    // harvester's full-roster batch. Equal means the join lost nothing and invented nothing.
    const carried = [...files.values()].reduce((n, f) => n + f.abilities.length, 0);
    expect(carried).toBe(batch.abilities.length);
    expect(carried).toBe(937);
  });

  it('every ability carries an icon filename', () => {
    const withoutIcon: string[] = [];
    for (const [apiname, file] of files) {
      for (const ability of file.abilities) {
        if (!ability.icon) withoutIcon.push(`${apiname}/${ability.slot} ${ability.abilityName}`);
      }
    }
    expect(withoutIcon).toEqual([]);
  });

  it('a passive icon is never served from the spell directory, or the reverse', () => {
    // Data Dragon serves passives from `img/passive` and spells from `img/spell`. A file that
    // mixed them would 404 on every passive chip — visible, but only if someone looked.
    for (const file of files.values()) {
      expect(file.art.passiveIconBase.endsWith('/passive')).toBe(true);
      expect(file.art.spellIconBase.endsWith('/spell')).toBe(true);
      expect(file.art.portraitBase.endsWith('/champion')).toBe(true);
    }
  });

  it('every ability is on a real slot, and every champion covers all five', () => {
    const SLOTS = ['P', 'Q', 'W', 'E', 'R'];
    const problems: string[] = [];
    for (const [apiname, file] of files) {
      const slots = new Set(file.abilities.map((a) => a.slot));
      for (const ability of file.abilities) {
        if (!SLOTS.includes(ability.slot)) problems.push(`${apiname}: bad slot ${ability.slot}`);
      }
      for (const slot of SLOTS) {
        if (!slots.has(slot)) problems.push(`${apiname}: no entry in slot ${slot}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('ability files: the figures are the harvester’s, unaltered', () => {
  it('every entry matches the batch entry it came from, except for the added icon', () => {
    // THE POINT OF THIS FILE IS THE JOIN, NOT THE NUMBERS. A generator that quietly "fixed" a
    // damage figure, or promoted a status, would be inventing data at the last step before the
    // interface reads it — the one place nobody would look for it.
    const inBatch = new Map<string, CuratedAbility>();
    for (const a of batch.abilities) {
      inBatch.set(`${a.champion}|${a.slot}|${a.abilityName}|${a.sourceRevision ?? ''}`, a);
    }
    const drifted: string[] = [];
    for (const file of files.values()) {
      for (const published of file.abilities) {
        const key = `${published.champion}|${published.slot}|${published.abilityName}|${published.sourceRevision ?? ''}`;
        const original = inBatch.get(key);
        if (!original) {
          drifted.push(`${key}: no matching entry in the batch`);
          continue;
        }
        const { icon: _icon, ...rest } = published;
        if (JSON.stringify(rest) !== JSON.stringify(original)) drifted.push(`${key}: altered`);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('the published verification statuses reproduce the roster measurement exactly', () => {
    // DEFINITION: each entry's own status, over the 937 published entries. These are the same
    // four figures `verification/measurements.json` records for the full-roster run, so a
    // disagreement means the published files and the measured roster have drifted apart.
    const counts: Record<string, number> = {};
    for (const file of files.values()) {
      for (const a of file.abilities) counts[a.verification] = (counts[a.verification] ?? 0) + 1;
    }
    const measured = readJson<{ verification: Record<string, number> }>(
      'verification',
      'measurements.json',
    ).verification;
    expect(counts).toEqual({
      verified: measured.verified,
      derived: measured.derived,
      incomplete: measured.incomplete,
      'no-damage': measured.noDamage,
    });
  });

  it('every file warns that these are harvester drafts, not the curated file', () => {
    // `/curated/` holds no ability entries. A file that dropped this warning would let an area
    // downstream treat a draft as settled.
    for (const [apiname, file] of files) {
      expect({ apiname, warns: /NOT THE CURATED FILE/.test(file.provenance.warning) }).toEqual({
        apiname,
        warns: true,
      });
      expect(file.provenance.regenerate).toContain('build-ability-files');
    }
  });

  it('every file states the patch, and they all state the SAME one', () => {
    const patches = new Set([...files.values()].map((f) => f.provenance.patch));
    expect(patches.size).toBe(1);
    expect([...patches][0]).toBe(roster[0]!.provenance.patch);
  });
});
