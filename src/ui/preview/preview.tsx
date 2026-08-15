// DEV-ONLY preview harness for the interface built in this area.
//
// None of these components is wired into the app — `src/main.tsx` and `index.html` belong to the
// lead — so this page exists purely so the picker, the combo builder, the stat blocks and the
// result table can be LOOKED AT during development, at `/src/ui/interface-preview.html` on the
// Vite dev server. `vite build` builds `index.html` only, so nothing here reaches `dist/`.
//
// It is a harness, not a layout proposal. The real page arrangement is DESIGN.md §7a's (two
// configuration panels across the top, the burndown full width beneath), and it is the lead's
// to assemble.
//
// The roster is fetched from the published static file, which is how the real page will get it.
// The combo builder is shown against Lux because Lux is the ONLY champion the data pipeline has
// published an abilities file for so far — that is a dependency, and it is stated here rather
// than hidden behind a fixture.

// LOADS THE PRODUCT'S TYPEFACES. Added 2026-08-15 to every preview entry at once.
//
// `fonts.css` was imported by `shell/PageShell.tsx` and by nothing else, and no harness renders
// the shell — so every preview page rendered in system faces. Measured: `document.fonts.size` was
// **0** on a harness against **42** on the calculator, and strings came out 1–5% wide.
//
// **That is not cosmetic on a page whose job is measuring.** It misled a session: overhang figures
// taken here implied an axis label the shipping face does not produce, and a second agent spent
// time reconciling two correct measurements of two different typefaces.
//
// `fonts.css`'s own header records the identical defect in the product itself on 2026-08-14 —
// the whole site rendering in two system faces with nothing checking. This is that defect's
// second home, found the same way: by measuring rather than by reading.
import '../fonts.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Champion, ChampionConfig, ComboStep } from '../../types';
import { MOCK_RESULT, MOCK_SCENARIO } from '../../types';
import { ChampionConfigPanel } from '../config';
import { ComboBuilder } from '../combo';
import type { ShelfAbility } from '../combo';
import { StatBlockPanel } from '../stats';
import { InstanceBreakdown } from '../breakdown';
import { HpBurndown } from '../burndown';
import { loadRoster } from '../data/roster';
import '../tokens.css';
import './preview.css';

const PATCH = MOCK_RESULT.patch;

function Preview() {
  const [roster, setRoster] = useState<Champion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<Champion | null>(null);
  const [defender, setDefender] = useState<Champion | null>(null);
  const [attackerConfig, setAttackerConfig] = useState<ChampionConfig>(MOCK_SCENARIO.attacker);
  const [defenderConfig, setDefenderConfig] = useState<ChampionConfig>(MOCK_SCENARIO.defender);
  const [abilities, setAbilities] = useState<ShelfAbility[]>([]);
  const [combo, setCombo] = useState<ComboStep[]>([
    { id: 'e1', kind: 'ability', ref: 'E' },
    { id: 'q1', kind: 'ability', ref: 'Q' },
    { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
    { id: 'r1', kind: 'ability', ref: 'R' },
  ]);

  useEffect(() => {
    loadRoster()
      .then((all) => {
        setRoster(all);
        setAttacker(all.find((c) => c.apiname === MOCK_SCENARIO.attacker.apiname) ?? null);
        setDefender(all.find((c) => c.apiname === MOCK_SCENARIO.defender.apiname) ?? null);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    fetch('/data/abilities/Lux.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Lux.json: ${r.status}`))))
      .then((file: { abilities: ShelfAbility[] }) => setAbilities(file.abilities))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <p className="preview__note">Could not load the published data: {error}</p>;
  if (!roster) return <p className="preview__note">Loading the roster…</p>;

  return (
    <div className="preview">
      <p className="preview__note">
        Development preview. Numbers come from the canonical mock Result, not from the engine —
        they exercise every visual state and are not a calculation.
      </p>

      <div className="preview__row">
        <ChampionConfigPanel
          role="Attacker"
          champions={roster}
          champion={attacker}
          config={attackerConfig}
          onChange={(config, champion) => {
            setAttackerConfig(config);
            setAttacker(champion);
          }}
          patch={PATCH}
        />
        <ChampionConfigPanel
          role="Defender"
          champions={roster}
          champion={defender}
          config={defenderConfig}
          onChange={(config, champion) => {
            setDefenderConfig(config);
            setDefender(champion);
          }}
          patch={PATCH}
        />
      </div>

      <p className="preview__note">
        The combo builder below is shown against Lux, the only champion whose abilities the data
        pipeline has published so far.
      </p>
      <ComboBuilder
        abilities={abilities}
        steps={combo}
        onChange={setCombo}
        patch={PATCH}
        championName="Lux"
      />

      <div className="preview__row">
        <StatBlockPanel
          role="Attacker"
          championName={attacker?.name ?? '—'}
          portraitSrc={null}
          stats={MOCK_RESULT.attackerStats}
        />
        <StatBlockPanel
          role="Defender"
          championName={defender?.name ?? '—'}
          portraitSrc={null}
          stats={MOCK_RESULT.defenderStats}
        />
      </div>

      <HpBurndown result={MOCK_RESULT} />
      <InstanceBreakdown result={MOCK_RESULT} />
    </div>
  );
}

const host = document.getElementById('preview-root');
if (host) createRoot(host).render(<Preview />);
