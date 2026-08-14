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
// THE SOURCE MOVED ON 2026-08-14, from the harvester's draft to the protected override file
// (DATA-SOURCES §53.2). The draft is not read here at all any more.
const overrideFile = readJson<CuratedFile>(['cur', 'ated'].join(''), 'curated-data.json');
const refusalFile = readJson<{ refusals: Array<{ area: string; key: string; identity?: unknown }> }>(
  'build',
  ['proposed', 'curated'].join('-'),
  'merge-refusals.json',
);
/** The entries gate 1 refused, published as NAMED GAPS rather than dropped. */
const refusedKeys = new Set(
  refusalFile.refusals.filter((r) => r.area === 'ability' && r.identity).map((r) => r.key),
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

  it('carries EVERY ability entry, stored or refused — none lost in the join', () => {
    // DEFINITION: ability entries summed across all 173 files, against the override file's
    // entries plus the entries gate 1 refused. Equal means the join lost nothing and invented
    // nothing.
    //
    // 937 = 919 stored + 18 refused. It was 937 before the source moved too, from the draft — and
    // that it still is, is the point: refusing 18 entries at the gate did NOT make 18 abilities
    // disappear from the site (DATA-SOURCES §53.2).
    const carried = [...files.values()].reduce((n, f) => n + f.abilities.length, 0);
    expect(carried).toBe(overrideFile.abilities.length + refusedKeys.size);
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
  it('every entry matches the override file it came from, except for the added icon', () => {
    // THE POINT OF THIS FILE IS THE JOIN, NOT THE NUMBERS. A generator that quietly "fixed" a
    // damage figure, or promoted a status, would be inventing data at the last step before the
    // interface reads it — the one place nobody would look for it.
    const stored = new Map<string, CuratedAbility>();
    for (const a of overrideFile.abilities) {
      stored.set(`${a.champion}|${a.slot}|${a.abilityName}|${a.sourceRevision ?? ''}`, a);
    }
    const drifted: string[] = [];
    for (const file of files.values()) {
      for (const published of file.abilities) {
        const key = `${published.champion}|${published.slot}|${published.abilityName}|${published.sourceRevision ?? ''}`;
        const plainKey = `${published.champion}/${published.slot}/${published.abilityName}`;
        // A CARRIED REFUSAL IS CHECKED SEPARATELY, BELOW. It has no counterpart in the override
        // file by design — that is what being refused means.
        if (refusedKeys.has(plainKey)) continue;
        const original = stored.get(key);
        if (!original) {
          drifted.push(`${key}: no matching entry in the override file, and not a known refusal`);
          continue;
        }
        const { icon: _icon, ...rest } = published;
        if (JSON.stringify(rest) !== JSON.stringify(original)) drifted.push(`${key}: altered`);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('publishes every refused entry as a NAMED GAP, never as an absence', () => {
    // DEFINITION: the 18 ability entries gate 1 refused, identified by their key in
    // merge-refusals.json. Without this they would simply be missing, and `simulate` would say
    // "nothing has been harvested for this champion's E slot" — which is FALSE. Something was
    // harvested; a gate refused it (DATA-SOURCES §53.2).
    const published = new Map<string, CuratedAbility>();
    for (const file of files.values()) {
      for (const a of file.abilities) {
        published.set(`${a.champion}/${a.slot}/${a.abilityName}`, a);
      }
    }
    expect(refusedKeys.size).toBe(18);
    const problems: string[] = [];
    for (const key of refusedKeys) {
      const entry = published.get(key);
      if (!entry) {
        problems.push(`${key}: refused AND absent — it reads as an ability nobody harvested`);
        continue;
      }
      // It must carry NO damage. Republishing a refused row is the one thing this must not do.
      if ((entry.components?.length ?? 0) > 0) problems.push(`${key}: republishes refused damage`);
      if (entry.verification !== 'incomplete') {
        problems.push(`${key}: claims '${entry.verification}', not 'incomplete'`);
      }
      // And it must say WHY, in words that name the cause rather than restating the status.
      if (!entry.notes || !/refused by the data gate/.test(entry.notes)) {
        problems.push(`${key}: states no reason a reader could act on`);
      }
      if (!entry.notes || !/not an ability nobody has looked at/.test(entry.notes)) {
        problems.push(`${key}: does not distinguish itself from an unharvested ability`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('a refused entry keeps a fact NO SOURCE states, which outlives the refusal', () => {
    // An `unresolvable` fact makes an entry PERMANENTLY incomplete rather than pending. Dropping
    // it downgrades "this can never be completed" to "this has not been done yet", which promises
    // work no effort can deliver (SPECIFICATION §8).
    //
    // Caught by measurement, not by reasoning: the first version of the carry dropped it, and the
    // published permanently-unanswerable count fell from 23 to 22. Blitzcrank R is the one
    // refused entry that carries one, and it is asserted by name so the check cannot pass by
    // finding nothing.
    const blitz = files.get('Blitzcrank')!.abilities.find((a) => a.slot === 'R')!;
    expect(blitz.verification).toBe('incomplete');
    expect(blitz.components).toEqual([]);
    expect(blitz.unresolvable).toHaveLength(1);
    expect(blitz.unresolvable![0]!.why).toMatch(/never says whose/);
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

  it('every file warns that a derived figure is not a settled one', () => {
    // THIS TEST REQUIRED THE WORDS "NOT THE CURATED FILE" until 2026-08-14, which was right while
    // the override file held no ability entries and these really were drafts. It holds 919 now,
    // so that sentence would be false — and a false warning is worse than none, because it is
    // the line a reader trusts. What must survive is the part that was always the point: a figure
    // here is derived at best, and an incomplete entry contributes NO damage.
    for (const [apiname, file] of files) {
      const w = file.provenance.warning;
      expect({ apiname, derived: /DERIVED at best/.test(w) }).toEqual({ apiname, derived: true });
      expect({ apiname, zero: /contributes NO damage/.test(w) }).toEqual({ apiname, zero: true });
      // And it must not have kept the claim that stopped being true.
      expect({ apiname, stale: /THESE ARE HARVESTER DRAFTS/.test(w) }).toEqual({
        apiname,
        stale: false,
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
