// DEV-ONLY preview harness for the HP burndown.
//
// The burndown is not wired into the app — `src/main.tsx` and `index.html` are the lead's
// files — so this page exists purely so the chart can be LOOKED AT during development, at
// `/src/ui/burndown-preview.html` on the Vite dev server. It is not part of the product:
// `vite build` builds `index.html` only, so nothing here reaches `dist/`. Delete it freely
// once the burndown has a home on the real page.
//
// ═══ IT NOW LOADS REAL DATA AS WELL AS THE MOCK (added 2026-08-15) ═══
//
// The `+DoT` column had never been drawn from anything but `MOCK_RESULT`: over all 173
// champions, every result carried `dot.total === 0`, so `hasDot` was false on the live site and
// the hatched tail existed only in a fixture (DATA-SOURCES §56). 27 ability components now carry
// `overTime`, so the tail draws on real data for the first time — and a fixture cannot tell
// anybody what that looks like. The cases below are simulated through the real engine against the
// published catalogue, so what is on screen is what a visitor gets.
//
// Nothing here invents a figure: every number comes out of `simulate`.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HpBurndown } from './HpBurndown';
import { MOCK_RESULT } from '../../types';
import type { ChampionConfig, ComboStep, Result, Scenario } from '../../types';
import type { ShelfAbility } from '../combo';
import { BURST_KILLS, DEFENDER_HEALS } from './mock-variants';
import {
  buildCatalogue,
  defensiveEffectsByChampion,
  itemEffectsById,
  loadAbilities,
  loadDefensiveEffects,
  loadItemEffects,
  loadItems,
  rosterPatch,
} from '../data/catalogue';
import { loadRoster } from '../data/roster';
import { simulate } from '../../engine';
import './preview.css';

/** A real scenario worth looking at, and why it is on this page. */
interface Case {
  what: string;
  attacker: string;
  defender: string;
  /** Ability slots and `basic`, in order. */
  combo: string[];
  /** Item ids the ATTACKER holds. Only the rider case needs any. */
  items?: number[];
}

const CASES: Case[] = [
  {
    what:
      'REAL DATA — Renekton R then Q against Lux. The burst is zero and the DoT is 2 367: ' +
      'burst SURVIVES, burst + DoT is LETHAL. The dashed rule, on real numbers.',
    attacker: 'Renekton',
    defender: 'Lux',
    combo: ['R', 'Q'],
  },
  {
    what:
      'REAL DATA — Corki W, E, basic attack against Garen. The only champion whose DoT column ' +
      'carries TWO figures: 134 physical and 284 magic, stacked as two hatched segments.',
    attacker: 'Corki',
    defender: 'Garen',
    combo: ['W', 'E', 'basic'],
  },
  {
    what:
      'REAL DATA — Alistar Q, W, E, R against Garen. Two real burst bars (139 and 174) beside a ' +
      '126 DoT tail, and two risers that deal nothing at all (E is all DoT, R is incomplete).',
    attacker: 'Alistar',
    defender: 'Garen',
    combo: ['Q', 'W', 'E', 'R'],
  },
  {
    what:
      'REAL DATA — Cassiopeia Q then E against Garen. A 76 burst beside a 136 DoT — the ' +
      'ordinary case, where the tail is the same order of magnitude as the burst.',
    attacker: 'Cassiopeia',
    defender: 'Garen',
    combo: ['Q', 'E'],
  },
  {
    what:
      'REAL DATA — Teemo E then a basic attack against Garen. The smallest tail measured: 76 ' +
      'DoT under a 91 burst, on a 2 356 health axis.',
    attacker: 'Teemo',
    defender: 'Garen',
    combo: ['E', 'basic'],
  },
  {
    // THE WORST CHART A READER CAN BUILD, and the reason it is on this page: until 2026-08-15 the
    // sixteen-column case existed only as arithmetic in `label-collision.test.ts`, so nobody had
    // ever LOOKED at the axis it produces. It is what the x-axis thinning rule was written for —
    // sixteen columns of 9.25px, three of them named, and a tick under every one.
    what:
      'REAL DATA — Alistar Q, W, E, R and TWO basic attacks, holding the five items whose ' +
      'effects ride on a basic attack. Sixteen columns: each rider is its own column, bracketed ' +
      'under the attack it rode on. The axis prints three names and sixteen ticks.',
    attacker: 'Alistar',
    defender: 'Garen',
    combo: ['Q', 'W', 'E', 'R', 'basic', 'basic'],
    items: [3115, 3124, 3091, 3153, 3078],
  },
];

function config(apiname: string, items: number[] = []): ChampionConfig {
  return {
    apiname,
    level: 18,
    abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
    items,
    runes: { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: {},
    entryState: {},
  };
}

function comboSteps(refs: string[]): ComboStep[] {
  return refs.map((ref, i) => ({
    id: `step-${i}`,
    kind: ref === 'basic' ? 'basic-attack' : 'ability',
    ref,
  }));
}

type Loaded = { case: Case; result: Result } | { case: Case; error: string };

async function runCases(): Promise<Loaded[]> {
  const [roster, items, itemEffects, defensiveEffects] = await Promise.all([
    loadRoster(fetch),
    loadItems(fetch),
    loadItemEffects(fetch),
    loadDefensiveEffects(fetch),
  ]);
  const patch = rosterPatch(roster);

  const abilities = new Map<string, readonly ShelfAbility[]>();
  for (const name of new Set(CASES.map((c) => c.attacker))) {
    const file = await loadAbilities(name, fetch);
    if (file) abilities.set(name, file.abilities);
  }

  const catalogue = buildCatalogue({
    champions: roster,
    items,
    abilities,
    itemEffects: itemEffectsById(itemEffects),
    defensiveEffects: defensiveEffectsByChampion(defensiveEffects),
  });

  return CASES.map((c) => {
    const scenario: Scenario = {
      version: 2,
      attacker: config(c.attacker, c.items),
      defender: config(c.defender),
      combo: comboSteps(c.combo),
    };
    const out = simulate(scenario, catalogue, { patch });
    return out.ok
      ? { case: c, result: out.result }
      : { case: c, error: out.refusals.map((r) => `${r.path}: ${r.reason}`).join('; ') };
  });
}

function Preview() {
  const [real, setReal] = useState<Loaded[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    runCases()
      .then((r) => {
        if (live) setReal(r);
      })
      .catch((e: unknown) => {
        if (live) setFailed(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="preview">
      {failed ? <p className="preview__what">REAL DATA FAILED TO LOAD — {failed}</p> : null}
      {real === null && failed === null ? (
        <p className="preview__what">Loading the published catalogue…</p>
      ) : null}

      {(real ?? []).map((entry) => (
        <div className="preview__case" key={entry.case.what}>
          <p className="preview__what">{entry.case.what}</p>
          {'result' in entry ? (
            <HpBurndown
              result={entry.result}
              title={`HP burndown — ${entry.case.attacker} versus ${entry.case.defender}`}
            />
          ) : (
            <p className="preview__what">REFUSED — {entry.error}</p>
          )}
        </div>
      ))}

      <div className="preview__case">
        <p className="preview__what">Canonical mock — the burst kills at instance 5</p>
        <HpBurndown result={MOCK_RESULT} />
      </div>
      <div className="preview__case">
        <p className="preview__what">Variant — the burst survives, the DoT tail finishes it</p>
        <HpBurndown result={BURST_KILLS} title="HP burndown — burst kills (derived variant)" />
      </div>
      <div className="preview__case">
        <p className="preview__what">
          Variant — the defender heals 90 before the combo; the trace rises, then falls
        </p>
        <HpBurndown
          result={DEFENDER_HEALS}
          title="HP burndown — a defender who heals (derived variant)"
        />
      </div>
    </div>
  );
}

const host = document.getElementById('preview-root');
if (host) createRoot(host).render(<Preview />);
