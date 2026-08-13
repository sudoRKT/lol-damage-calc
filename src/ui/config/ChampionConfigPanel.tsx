// ONE COMBATANT'S CONFIGURATION — champion, level, ability ranks.
//
// SPECIFICATION §2, steps 1–7: a champion is chosen, then a level, then ability ranks, then
// items, then a full rune page, then entry state — for each of the two champions. This panel
// covers the first three and SAYS SO ON SCREEN about the rest. That is deliberate: a
// configuration panel that silently omits items and runes invites a user to read a result as
// though their build had been modelled.
//
// EVERY NUMBER GOES THROUGH `NumberInput`. It is the only place negative zero is clamped, and
// `../inputs/negative-zero-sweep.test.tsx` fails, naming the file, if any component in this area
// hand-rolls a numeric field instead.
//
// ABILITY RANK LIMITS ARE READ, NEVER INFERRED. `Champion.abilityMaxRanks` comes from Data
// Dragon's own `maxrank` (src/types/data.ts), because the familiar "5 for Q/W/E, 3 for R" is
// wrong for 21 abilities across 8 champions — Udyr's stances rank to 6, Karma's ultimate to 4.
// Where the roster records no rank count for a slot, the field is DISABLED and says why rather
// than offering a limit this product made up.

import type { Champion, ChampionConfig } from '../../types';
import { ChampionPicker } from '../picker';
import { NumberInput } from '../inputs';
import { CombatantNameplate } from '../stats';
import { portraitUrl } from '../data/roster';
import './config.css';

/** The four rankable slots, in the order the game prints them. */
const RANK_SLOTS = ['Q', 'W', 'E', 'R'] as const;
type RankSlot = (typeof RANK_SLOTS)[number];

/** What this panel does NOT configure yet. Printed on screen, never left to be assumed. */
export const NOT_YET_CONFIGURED = [
  'Items',
  'Runes — keystone, minor runes and stat shards',
  'Entry state — stacks and debuffs already active when the combo begins',
];

export interface ChampionConfigPanelProps {
  /** "Attacker" or "Defender". */
  role: string;
  champions: readonly Champion[];
  /** The champion currently in play, or null before one is chosen. */
  champion: Champion | null;
  config: ChampionConfig;
  onChange: (config: ChampionConfig, champion: Champion) => void;
  patch: string;
}

export function ChampionConfigPanel({
  role,
  champions,
  champion,
  config,
  onChange,
  patch,
}: ChampionConfigPanelProps) {
  const update = (next: Partial<ChampionConfig>) => {
    if (!champion) return;
    onChange({ ...config, ...next }, champion);
  };

  return (
    <section className="config" aria-label={`${role} configuration`}>
      <CombatantNameplate
        role={role}
        championName={champion?.name ?? 'No champion chosen'}
        portraitSrc={champion ? portraitUrl(patch, champion.icon) : null}
        level={config.level}
      />

      <ChampionPicker
        label={`${role} champion`}
        champions={champions}
        selected={champion}
        onSelect={(picked) =>
          onChange(
            // A new champion resets nothing else: level and ranks are the user's, and silently
            // rewriting them would change a scenario they did not edit.
            { ...config, apiname: picked.apiname },
            picked,
          )
        }
        patch={patch}
      />

      <div className="config__fields">
        <NumberInput
          label={`${role} level`}
          value={config.level}
          min={1}
          max={18}
          step={1}
          hint="1 to 18"
          onChange={(level) => update({ level })}
        />

        {RANK_SLOTS.map((slot) => {
          const max = champion?.abilityMaxRanks?.[slot];
          return (
            <NumberInput
              key={slot}
              label={`${slot} rank`}
              value={config.abilityRanks[slot as RankSlot]}
              min={1}
              max={max}
              step={1}
              disabled={!champion || max === undefined}
              hint={
                champion === null
                  ? 'choose a champion first'
                  : max === undefined
                    ? 'the roster records no rank count for this slot'
                    : `1 to ${max}`
              }
              onChange={(rank) =>
                update({ abilityRanks: { ...config.abilityRanks, [slot]: rank } })
              }
            />
          );
        })}
      </div>

      <p className="config__eyebrow">Not configured in this panel yet</p>
      <ul className="config__missing">
        {NOT_YET_CONFIGURED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
