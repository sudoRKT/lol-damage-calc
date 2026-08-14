// THE VERTICAL SLICE. One attacker, one defender, one combo, one number — end to end.
//
// This is a PROOF THAT THE PIECES CONNECT, not the product's interface. It exists because every
// decision in this project until now was made against documents and tests, and nothing had ever
// rendered a real number from real stored data.
//
// It uses what exists rather than building anything new: the harvester's stored Lux entries, the
// engine's component evaluator and resistance formula, and Area E's two primitives for damage
// values and verification status. Everything it CANNOT do is printed on screen rather than filled
// in — see `compute.ts` for the list and the reason for each.

import { useEffect, useMemo, useState } from 'react';

import { AggregateTotal, DamageValue, TableScroller, VerificationStatusMark } from '../primitives';
import { NumberInput } from '../inputs';
import { AbilityChip } from '../art/AbilityChip';
import { ChampionPortrait } from '../art/ChampionPortrait';
import type { CuratedAbility } from '../../types/data';
import { resolveBaseStats, type ChampionBaseStats } from '../../engine/champion-stats';
import { computeSlice, type SliceAttacker } from './compute';
import './slice.css';

/** Defenders offered. A short list, because the slice is a proof and not a picker. */
const DEFENDERS = ['Garen', 'Ahri', 'Malphite', 'Jinx'] as const;

interface ChampionFile {
  name: string;
  apiname: string;
  stats: ChampionBaseStats;
}

interface AbilityFile {
  provenance: { patch: string; fetched: string; warning: string };
  art: { spellIconBase: string; passiveIconBase: string; portraitBase: string };
  abilities: Array<CuratedAbility & { icon: string }>;
}

const SLOTS = ['P', 'Q', 'W', 'E', 'R'] as const;

export function VerticalSlice() {
  const [file, setFile] = useState<AbilityFile | null>(null);
  const [defenderName, setDefenderName] = useState<string>('Garen');
  const [defender, setDefender] = useState<ChampionFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attackerLevel, setAttackerLevel] = useState(6);
  const [defenderLevel, setDefenderLevel] = useState(6);
  const [ranks, setRanks] = useState<SliceAttacker['ranks']>({ Q: 1, W: 1, E: 1, R: 1 });
  // A DIRECT ability-power figure. Items and runes are not modelled, so this STATES the input
  // rather than assuming it — Lux's damage is almost entirely her ratios, and leaving them at
  // zero makes an honest result a useless one. It is labelled on screen as standing in for the
  // items and runes that will replace it.
  const [abilityPower, setAbilityPower] = useState(0);
  const [combo, setCombo] = useState<string[]>(['E', 'Q', 'R']);

  useEffect(() => {
    fetch('/data/abilities/Lux.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Lux.json: ${r.status}`))))
      .then(setFile)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    fetch(`/data/champions/${defenderName}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${defenderName}: ${r.status}`))))
      .then(setDefender)
      .catch((e: unknown) => setError(String(e)));
  }, [defenderName]);

  const result = useMemo(() => {
    if (!file || !defender) return null;
    return computeSlice(
      file.abilities,
      combo,
      { level: attackerLevel, ranks, abilityPower },
      { name: defender.name, level: defenderLevel, stats: defender.stats },
    );
  }, [file, defender, combo, attackerLevel, defenderLevel, ranks, abilityPower]);

  const defenderStats = defender ? resolveBaseStats(defender.stats, defenderLevel) : null;

  if (error) return <main className="slice"><p className="slice__error">Could not load data: {error}</p></main>;
  if (!file || !defender || !result || !defenderStats) return <main className="slice"><p>Loading…</p></main>;

  const maxRankOf = (slot: string) => file.abilities.find((a) => a.slot === slot)?.maxRank ?? 1;
  const abilityOf = (slot: string) => file.abilities.find((a) => a.slot === slot);
  const iconOf = (slot: string) => {
    const a = abilityOf(slot);
    if (!a) return '';
    return `${slot === 'P' ? file.art.passiveIconBase : file.art.spellIconBase}/${a.icon}`;
  };
  /** The damage type a chip shows: the ability's own stored component, or null if it deals none. */
  const typeOf = (slot: string) => abilityOf(slot)?.components[0]?.damageType ?? null;
  const portrait = (name: string) => `${file.art.portraitBase}/${name}.png`;

  return (
    <main className="slice">
      <p className="slice__eyebrow">Limit Test · vertical slice</p>
      <div className="nameplate">
        <ChampionPortrait src={portrait('Lux')} name="Lux" size="nameplate" active />
        <div>
          <h1 className="slice__title">Lux <span className="nameplate__vs">vs</span> {defender.name}</h1>
          <p className="slice__sub">
            Patch {file.provenance.patch} · abilities only · one attacker, one defender, one combo
          </p>
        </div>
        <ChampionPortrait src={portrait(defender.apiname)} name={defender.name} size="nameplate" active />
      </div>

      <div className="slice__grid">
        {/* ---------------- configuration ---------------- */}
        <section className="panel" aria-labelledby="cfg-h">
          <h2 id="cfg-h" className="panel__h">Configuration</h2>

          <div className="field">
            <NumberInput label="Lux level" value={attackerLevel} min={1} max={18} hint="1 to 18"
              onChange={setAttackerLevel} />
          </div>

          <div className="ranks">
            {(['Q', 'W', 'E', 'R'] as const).map((s) => (
              <NumberInput key={s} label={`${s} rank`} value={ranks[s]} min={1} max={maxRankOf(s)}
                onChange={(v) => setRanks({ ...ranks, [s]: v })} />
            ))}
          </div>

          <fieldset className="picker">
            <legend>Defender</legend>
            {DEFENDERS.map((d) => (
              <button type="button" key={d} className="picker__opt" aria-label={`Defender: ${d}`}
                aria-pressed={d === defenderName} onClick={() => setDefenderName(d)}>
                <ChampionPortrait src={portrait(d)} name={d} size="row"
                  active={d === defenderName} decorative />
                <span>{d}</span>
              </button>
            ))}
          </fieldset>

          <div className="field">
            <NumberInput label={`${defender.name} level`} value={defenderLevel} min={1} max={18}
              hint="1 to 18" onChange={setDefenderLevel} />
          </div>

          <div className="field">
            <NumberInput label="Lux ability power" value={abilityPower} min={0} max={2000}
              hint="stands in for items and runes, which are not modelled yet"
              onChange={setAbilityPower} />
          </div>

          <dl className="stats">
            <div><dt>Health</dt><dd>{round(defenderStats.hp)}</dd></div>
            <div><dt>Armor</dt><dd>{round(defenderStats.armor)}</dd></div>
            <div><dt>Magic resist</dt><dd>{round(defenderStats.magicResist)}</dd></div>
          </dl>
          <p className="note">
            There are no items, runes or stat shards here. The ability-power figure above is
            <strong> typed in, not derived from a build</strong> — the engine is told the number
            rather than assuming one. Set it to 0 to see Lux's base damage alone.
          </p>
        </section>

        {/* ---------------- combo ---------------- */}
        <section className="panel" aria-labelledby="combo-h">
          <h2 id="combo-h" className="panel__h">Combo</h2>
          <ol className="combo">
            {combo.map((slot, i) => (
              <li key={`${slot}-${i}`}>
                <span className="combo__n">{i + 1}</span>
                <AbilityChip src={iconOf(slot)} slot={slot} damageType={typeOf(slot)}
                  abilityName={abilityOf(slot)?.abilityName ?? slot} size="combo" />
                <span className="combo__name">{abilityOf(slot)?.abilityName}</span>
                <button type="button" className="combo__x"
                  onClick={() => setCombo(combo.filter((_, j) => j !== i))}
                  aria-label={`Remove ${slot} — ${abilityOf(slot)?.abilityName} from position ${i + 1}`}>
                  ✕
                </button>
              </li>
            ))}
            {combo.length === 0 && <li className="note">No steps. Add one from the shelf below.</li>}
          </ol>
          <div className="shelf">
            {SLOTS.map((sl) => (
              <button type="button" key={sl} className="shelf__btn"
                onClick={() => setCombo([...combo, sl])}
                aria-label={`Add ${sl} — ${abilityOf(sl)?.abilityName} to the combo`}>
                <AbilityChip src={iconOf(sl)} slot={sl} damageType={typeOf(sl)}
                  abilityName={abilityOf(sl)?.abilityName ?? sl} size="combo" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ---------------- result ---------------- */}
      <section className="panel" aria-labelledby="res-h">
        <h2 id="res-h" className="panel__h">Result</h2>
        {/* EIGHT COLUMNS — the widest table in the area, and the one furthest from fitting a
            phone. This component is a superseded proof and is mounted nowhere, but it is still
            in the area and still swept, so it gets the same treatment as every shipped table
            rather than an exemption nobody would remember to remove. */}
        <TableScroller label="The vertical-slice damage table">
        <table className="breakdown">
          <caption className="u-visually-hidden">
            Per-instance damage breakdown, in combo order, with a running total and each ability's
            verification status.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Ability</th><th scope="col">Status</th>
              <th scope="col">Base</th><th scope="col">Ratio</th>
              <th scope="col">Raw</th><th scope="col">After resistances</th><th scope="col">Running total</th>
            </tr>
          </thead>
          <tbody>
            {result.instances.map((ins, i) => (
              <tr key={ins.index}>
                <td>{ins.index}</td>
                <td>
                  <span className="cellrow">
                    <AbilityChip src={iconOf(ins.slot)} slot={ins.slot} damageType={typeOf(ins.slot)}
                      abilityName={ins.abilityName} size="table" />
                    <span>{ins.abilityName}</span>
                  </span>
                </td>
                <td><VerificationStatusMark status={ins.verification} spokenSubject={ins.label} /></td>
                {ins.damage ? (
                  <>
                    <td className="num">{ins.damage.base}</td>
                    <td className="num">
                      {ins.damage.ratios.map((r) => `${r.percent}% ${r.stat} → ${r.contribution}`).join(', ') || '—'}
                    </td>
                    <td><DamageValue value={ins.damage.raw} damageType={ins.damage.type} size="m" /></td>
                    <td><DamageValue value={ins.damage.final} damageType={ins.damage.type} size="l"
                      spokenContext="after resistances" /></td>
                    {/* The running total is a sum ACROSS damage types, so DESIGN.md §8 allows
                        it untagged only beside a tagged composition bar. `AggregateTotal`
                        refuses to draw one without the other, and falls back to a tagged value
                        while the combo has touched only one type. */}
                    <td className="num">
                      {result.runningTotal[i] ? (
                        <AggregateTotal
                          total={result.runningTotal[i]!.total}
                          byType={result.runningTotal[i]!.byType}
                          size="l"
                        />
                      ) : null}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="refused">
                    not shown — {ins.refusal?.why.join('; ')}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroller>

        <p className="total">
          Burst total{' '}
          <DamageValue value={result.burstTotal} damageType="magic" size="hero" />
          {' '}against {result.defenderHp} health
        </p>

        <p className={result.lethal ? 'verdict verdict--lethal' : 'verdict'}>
          {result.lethal
            ? `LETHAL · at instance ${result.lethalAtInstance}`
            : `SURVIVES · ${result.remainingHp} health remaining`}
          <span className="verdict__scope"> — burst only. Damage over time is not modelled here.</span>
        </p>

        {result.excluded.length > 0 && (
          <div className="excluded">
            <h3>Excluded from the total</h3>
            <ul>
              {result.excluded.map((e) => <li key={e.label}><strong>{e.label}</strong> — {e.why}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------- honesty panel ---------------- */}
      <section className="panel panel--limits" aria-labelledby="lim-h">
        <h2 id="lim-h" className="panel__h">What this cannot show, and why</h2>
        <ul>
          <li><strong>Items, runes and stat shards</strong> — out of scope for the slice, so ability power is 0 and every ratio contributes nothing.</li>
          <li><strong>Sequential state</strong> — the engine has no combo runner yet, so every instance resolves against the same defender stats. No armor shred, no stacks, no Bone Plating. Nothing in Lux's stored data mutates state, so these numbers are not wrong for her — but the model is absent.</li>
          <li><strong>Damage over time</strong> — the separate-line requirement is not implemented. The verdict above is burst only.</li>
          <li><strong>Critical strike, executes, shields, healing, damage reduction, penetration</strong> — not modelled.</li>
          <li><strong>Lux's passive</strong> is an on-hit effect that a basic attack must apply. The slice will resolve it wherever you place it; it does not model the attack that triggers it.</li>
          <li>
            <strong>These are harvester drafts, not the curated file.</strong> {file.provenance.warning}
          </li>
        </ul>
      </section>
    </main>
  );
}

/** Display rounding for a stat readout. The engine's own rounding point governs damage. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
