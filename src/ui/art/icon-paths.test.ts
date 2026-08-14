// EVERY ABILITY ICON URL, FOR EVERY CHAMPION, CHECKED AGAINST THE PIPELINE'S OWN RECORDED BASE.
//
// ═══ THE DEFECT ═══
//
// The combo builder built every chip's URL with `spellIconUrl`, including the PASSIVE's. Data
// Dragon serves a passive only from `/img/passive/` and answers **403** from `/img/spell/`, so
// every champion's passive chip was a broken image — on the shelf and in the sequence, 173 of
// them. Measured against the live CDN on 2026-08-14:
//
//     /img/passive/LuxIlluminatingFraulein.png  → 200
//     /img/spell/LuxIlluminatingFraulein.png    → 403
//
// **NO TEST IN THIS AREA COULD HAVE SEEN IT.** jsdom never fetches an image, so an `<img>` with a
// dead `src` renders identically to one with a live `src`, and the chip's accessible name was
// correct all along — it announces the ability, not the file. It was found by opening the page.
//
// ═══ THE CHECK ═══
//
// The pipeline records the two bases it fetched the filenames from in every abilities file
// (`art.spellIconBase`, `art.passiveIconBase`). So the URL this area builds can be compared
// against the source of truth for every ability of every champion, offline and with no network:
// a passive must match the passive base, and Q/W/E/R must match the spell base.
//
// POPULATION, STATED: every ability in every published file under `public/data/abilities/` — 173
// champions, and the count of abilities is asserted rather than assumed.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abilityIconUrl, iconUrl, passiveIconUrl, spellIconUrl } from '../data/roster';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ABILITY_DIR = join(REPO, 'public', 'data', 'abilities');

interface AbilityFile {
  art: { spellIconBase: string; passiveIconBase: string };
  abilities: Array<{ slot: string; abilityName: string; icon: string }>;
}

const FILES = readdirSync(ABILITY_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    champion: f.replace(/\.json$/, ''),
    file: JSON.parse(readFileSync(join(ABILITY_DIR, f), 'utf8')) as AbilityFile,
  }));

const PATCH = '16.16.1';

describe('icon-paths/population', () => {
  it('is looking at every published abilities file', () => {
    expect(FILES.length).toBe(173);
    expect(FILES.reduce((n, f) => n + f.file.abilities.length, 0)).toBeGreaterThan(800);
  });
});

describe('icon-paths/an ability chip points where the pipeline says the art is', () => {
  it('every ability of every champion resolves to its own recorded base', () => {
    const offenders: string[] = [];
    for (const { champion, file } of FILES) {
      for (const ability of file.abilities) {
        const expected =
          ability.slot === 'P'
            ? `${file.art.passiveIconBase}/${ability.icon}`
            : `${file.art.spellIconBase}/${ability.icon}`;
        const built = abilityIconUrl(PATCH, ability.slot, ability.icon);
        if (built !== expected) {
          offenders.push(`${champion} ${ability.slot}: ${built} — expected ${expected}`);
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it('a passive never resolves to the spell directory — the exact failure that shipped', () => {
    const passives = FILES.flatMap(({ champion, file }) =>
      file.abilities.filter((a) => a.slot === 'P').map((a) => ({ champion, icon: a.icon })),
    );
    expect(passives.length).toBeGreaterThan(150);
    const wrong = passives.filter(({ icon }) =>
      abilityIconUrl(PATCH, 'P', icon).includes('/img/spell/'),
    );
    expect(wrong.map((p) => p.champion)).toEqual([]);
  });

  it('the per-instance table routes a passive by its slot too, not only the combo builder', () => {
    // `InstanceResult.icon` carries a filename with no kind, so the table passes the slot it
    // reads off the source label. Without it, the same 403 comes back in the result table.
    expect(iconUrl(PATCH, 'LuxIlluminatingFraulein.png', 'P')).toBe(
      passiveIconUrl(PATCH, 'LuxIlluminatingFraulein.png'),
    );
    expect(iconUrl(PATCH, 'LuxLightBinding.png', 'Q')).toBe(
      spellIconUrl(PATCH, 'LuxLightBinding.png'),
    );
    // An item icon is still an item icon, with or without a slot.
    expect(iconUrl(PATCH, '3068.png')).toContain('/img/item/');
  });
});
